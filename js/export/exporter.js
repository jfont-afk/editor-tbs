import { Muxer, ArrayBufferTarget } from '../vendor/mp4-muxer.mjs';
import { runtime } from '../core/store.js';
import { clamp } from '../lib.js';
import { clipDur, totalDuration, layoutClips } from '../core/timeline.js';

let mbPromise = null;
function loadMediabunny() {
  if (!mbPromise) mbPromise = import('../vendor/mediabunny.mjs').catch((e) => { console.warn('mediabunny', e); return null; });
  return mbPromise;
}
import { captionGroups } from '../core/captions.js';
import { Compositor } from '../render/compositor.js';
import { preloadOverlayImages } from '../render/motions.js';
import { normalizeForSocial } from './loudness.js';
import { FxChain, loadWorklet, duckNode, hasFx, hasFades } from '../audio/fx.js';
import { loadSegmenter } from '../ai/vision.js';

const VIDEO_CODECS = ['avc1.640033', 'avc1.640028', 'avc1.4d0033', 'avc1.4d0028', 'avc1.42e033', 'avc1.42e028'];

async function pickVideoConfig(W, H, fps, bitrate) {
  for (const codec of VIDEO_CODECS) {
    for (const bitrateMode of ['variable', undefined]) {
      const cfg = { codec, width: W, height: H, bitrate, framerate: fps, latencyMode: 'quality', avc: { format: 'avc' }, ...(bitrateMode ? { bitrateMode } : {}) };
      try { const s = await VideoEncoder.isConfigSupported(cfg); if (s.supported) return cfg; } catch {}
    }
  }
  throw new Error('Este navegador no puede codificar H.264. Usa Google Chrome actualizado.');
}

// AAC a la máxima calidad que admita el navegador (las redes recomiendan AAC 48 kHz)
async function pickAudioConfig(sampleRate) {
  const opts = [
    { codec: 'mp4a.40.2', mux: 'aac', sampleRate, numberOfChannels: 2, bitrate: 320000 },
    { codec: 'mp4a.40.2', mux: 'aac', sampleRate, numberOfChannels: 2, bitrate: 256000 },
    { codec: 'mp4a.40.2', mux: 'aac', sampleRate, numberOfChannels: 2, bitrate: 192000 },
    { codec: 'opus', mux: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 },
  ];
  for (const o of opts) {
    try { const s = await AudioEncoder.isConfigSupported({ codec: o.codec, sampleRate: o.sampleRate, numberOfChannels: 2, bitrate: o.bitrate }); if (s.supported) return o; } catch {}
  }
  return null;
}

export async function mixAudio(p, sr = 48000) {
  const dur = totalDuration(p);
  // La reducción de ruido devuelve el sonido con un retraso fijo (ch.latency): esas fuentes se colocan antes
  // y todo se mezcla con PRE segundos de margen al principio, que se recortan al final (el audio queda en sincronía con el vídeo)
  const PRE = 0.05;
  const len = Math.max(1, Math.ceil((dur + 0.05) * sr)), off = Math.round(PRE * sr);
  const ctx = new OfflineAudioContext(2, len + off, sr);
  const decoded = new Map();
  const used = new Set([...p.clips.map(c => c.assetId), ...p.clips.filter(c => c.dual).map(c => c.dual.assetId), ...(p.audio || []).map(a => a.assetId)]);
  for (const a of p.assets) {
    if (a.kind === 'image' || !used.has(a.id)) continue;
    const rt = runtime.assets.get(a.id);
    if (!rt?.file) continue;
    try { decoded.set(a.id, await ctx.decodeAudioData(await rt.file.arrayBuffer())); } catch { /* sin audio */ }
  }
  // misma cadena de corrección que la vista previa: voz → bus de voz; música con "bajar al hablar" → nodo que escucha ese bus
  const worklet = await loadWorklet(ctx);
  const voiceBus = ctx.createGain();
  voiceBus.connect(ctx.destination);
  // los clips con los mismos ajustes comparten cadena (no se solapan en el tiempo: sus fundidos van en la misma ganancia)
  const shared = new Map();
  // destino de un tramo que suena en t: { node, at } (at = cuándo debe empezar la fuente)
  const target = (fx, t, d, own = false) => {
    if (!hasFx(fx) && !hasFades(fx) && !(fx?.duck > 0)) return { node: voiceBus, at: t + PRE };
    const { fadeIn = 0, fadeOut = 0, ...rest } = fx;
    const key = JSON.stringify(rest);
    let ch = own ? null : shared.get(key);
    if (!ch) {
      ch = new FxChain(ctx, worklet);
      ch.set(fx);
      const duck = fx.duck > 0 ? duckNode(ctx, worklet) : null;
      if (duck) {
        duck.parameters.get('amount').value = fx.duck;
        ch.output.connect(duck, 0, 0); voiceBus.connect(duck, 0, 1); duck.connect(ctx.destination);
      } else ch.output.connect(voiceBus);
      if (!own) shared.set(key, ch);
    }
    // los fundidos van después de la reducción de ruido: en la línea de tiempo de salida
    const fi = Math.min(fadeIn, d / 2), fo = Math.min(fadeOut, d / 2), g = ch.fade.gain, T = t + PRE;
    g.setValueAtTime(fi > 0.01 ? 0 : 1, T);
    if (fi > 0.01) g.linearRampToValueAtTime(1, T + fi);
    if (fo > 0.01) { g.setValueAtTime(1, T + d - fo); g.linearRampToValueAtTime(0, T + d); }
    return { node: ch.input, at: T - ch.latency };
  };
  // coloca un trozo [s0, s1] de un audio en el instante t (con velocidad y fundidos cortos para evitar chasquidos)
  const place = (buf, t, s0, s1, sp, vol, out = voiceBus) => {
    if (!buf || vol <= 0.001 || s1 <= s0) return;
    s0 = Math.max(0, s0);
    const d = (s1 - s0) / sp;
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    const f = Math.min(0.008, d / 4);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + f);
    g.gain.setValueAtTime(vol, Math.max(t + f, t + d - f)); g.gain.linearRampToValueAtTime(0, t + d);
    src.connect(g).connect(out);
    if (Math.abs(sp - 1) > 0.01) { src.buffer = timeStretch(ctx, buf, s0, s1, sp); src.start(t, 0, d); } // tono conservado
    else { src.buffer = buf; src.start(t, s0, s1 - s0); }
  };
  let t = 0;
  for (const c of p.clips) {
    const d = clipDur(c);
    const vol = p.muted ? 0 : (c.volume ?? 1);
    const sp = c.speed || 1;
    const mode = c.dual?.audio || 'ab';
    const o = vol > 0.001 ? target(c.fx, t, d) : { node: voiceBus, at: t + PRE };
    if (!c.dual || mode !== 'b') place(decoded.get(c.assetId), o.at, c.in, c.out, sp, vol, o.node);
    if (c.dual && mode !== 'a') { const off2 = c.dual.off || 0; place(decoded.get(c.dual.assetId), o.at, c.in + off2, c.out + off2, sp, vol, o.node); }
    t += d;
  }
  // pista de audio libre (micro externo, música…)
  for (const a of p.audio || []) {
    const s1 = Math.min(a.out, a.in + Math.max(0, dur - a.start)), vol = p.audioMuted ? 0 : (a.volume ?? 1);
    if (vol > 0.001 && s1 > a.in) { const o = target(a.fx, a.start, a.out - a.in, true); place(decoded.get(a.assetId), o.at, a.in, s1, 1, vol, o.node); }
  }
  const mix = await ctx.startRendering();
  const res = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: sr });
  for (let c = 0; c < 2; c++) res.copyToChannel(mix.getChannelData(c).subarray(off, off + len), c);
  return res;
}

/**
 * Cambio de velocidad conservando el tono (WSOLA): se solapan trozos del audio original
 * buscando en cada paso el punto que mejor encaja con el anterior.
 */
function timeStretch(ctx, buf, t0, t1, speed) {
  const sr = buf.sampleRate, nch = buf.numberOfChannels;
  const s0 = Math.max(0, Math.floor(t0 * sr)), s1 = Math.min(buf.length, Math.ceil(t1 * sr));
  const inLen = Math.max(0, s1 - s0);
  const outLen = Math.max(1, Math.round(inLen / speed));
  const N = 1536, Ho = N / 2, Hi = Ho * speed, delta = 320;
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const chans = [];
  for (let c = 0; c < nch; c++) chans.push(buf.getChannelData(c).subarray(s0, s1));
  const mono = new Float32Array(inLen);
  for (const ch of chans) for (let i = 0; i < inLen; i++) mono[i] += ch[i] / nch;
  const out = ctx.createBuffer(nch, outLen, sr);
  const outs = []; for (let c = 0; c < nch; c++) outs.push(out.getChannelData(c));
  let prev = 0;
  for (let k = 0; k * Ho < outLen; k++) {
    const ideal = Math.round(k * Hi);
    let best = ideal;
    if (k > 0) {
      const nat = prev + Ho; // continuación natural del trozo anterior
      let bestC = -Infinity;
      for (let d = -delta; d <= delta; d += 2) {
        const pos = ideal + d;
        if (pos < 0 || pos + N > inLen || nat + N > inLen) continue;
        let cc = 0;
        for (let i = 0; i < N; i += 4) cc += mono[pos + i] * mono[nat + i];
        if (cc > bestC) { bestC = cc; best = pos; }
      }
    }
    best = Math.max(0, Math.min(best, inLen - 1));
    const o = k * Ho;
    for (let c = 0; c < nch; c++) {
      const src = chans[c], dst = outs[c];
      for (let i = 0; i < N && o + i < outLen && best + i < inLen; i++) dst[o + i] += src[best + i] * win[i];
    }
    prev = best;
  }
  return out;
}

function waitSeek(el, time) {
  return new Promise((res) => {
    if (Math.abs(el.currentTime - time) < 1e-4 && el.readyState >= 2) return res();
    const done = () => { clearTimeout(to); res(); };
    const to = setTimeout(done, 3000);
    el.addEventListener('seeked', done, { once: true });
    el.currentTime = time;
  });
}

/**
 * Exporta el proyecto a MP4.
 * opts: { project, version, safeZone, height (1920|1280), fps, onProgress(p, etaSec), signal }
 */
export async function exportMP4(opts) {
  const { project: p, version, safeZone = 'tiktok', onProgress, signal } = opts;
  if (!('VideoEncoder' in window)) throw new Error('Tu navegador no soporta la exportación (WebCodecs). Usa Google Chrome.');
  const fps = opts.fps || p.fps || 30;
  const scale = opts.scale || 1;
  const W = Math.round(p.format.w * scale / 2) * 2, H = Math.round(p.format.h * scale / 2) * 2;
  const total = totalDuration(p);
  const N = Math.max(1, Math.floor(total * fps));
  const bitrate = Math.round((opts.bitrate || 14e6) * scale * scale);

  onProgress?.(0, null, 'Mezclando audio…');
  const audio = await mixAudio(p, 48000);
  let loud = null;
  if (opts.normalize !== false && audio.length > 48000 * 0.5) {
    onProgress?.(0.005, null, 'Ajustando el volumen para redes…');
    await new Promise(r => setTimeout(r, 20));
    const chs = [];
    for (let c = 0; c < audio.numberOfChannels; c++) chs.push(audio.getChannelData(c));
    loud = normalizeForSocial(chs, 48000, opts.lufs ?? -14);
  }
  await preloadOverlayImages(p);
  // la IA de segmentación tiene que estar cargada antes del primer fotograma (fondo quitado, texto detrás)
  const needSeg = p.clips.some(c => c.bg?.remove) || p.captions.behind || p.overlays.some(o => o.behind) || Object.values(p.transcripts).some(tr => tr.words.some(w => w.gs?.behind));
  if (needSeg) { onProgress?.(0.008, null, 'Cargando la IA de recorte…'); try { await loadSegmenter(); } catch (e) { console.warn(e); } }
  const vcfg = await pickVideoConfig(W, H, fps, bitrate);
  const acfg = await pickAudioConfig(48000);

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: W, height: H, frameRate: fps },
    audio: acfg ? { codec: acfg.mux, sampleRate: acfg.sampleRate, numberOfChannels: 2 } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let encErr = null;
  const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { encErr = e; } });
  venc.configure(vcfg);

  // Elementos propios para no interferir con la vista previa
  const els = new Map();
  const getEl = (asset) => {
    if (els.has(asset.id)) return els.get(asset.id);
    const rt = runtime.assets.get(asset.id);
    let el;
    if (asset.kind === 'image') { el = new Image(); el.src = rt.url; }
    else { el = document.createElement('video'); el.muted = true; el.preload = 'auto'; el.src = rt.url; el.playsInline = true; }
    els.set(asset.id, el);
    return el;
  };
  const comp = new Compositor();
  comp.setLogo(p.brand?.logo || null);
  await new Promise(r => setTimeout(r, 50));
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingQuality = 'high';
  const groups = captionGroups(p, version);
  // se decodifica por encima de la resolución final para que los zooms y el reencuadre sigan nítidos
  const srcCap = Math.round(Math.max(W, H) * 1.5);

  const t0 = performance.now();
  let i = 0;
  // espera a que el codificador libere hueco (con el evento del propio codificador: no se frena si la pestaña pasa a segundo plano)
  const waitQueue = () => new Promise(r => { const done = () => { clearTimeout(to); r(); }; const to = setTimeout(done, 40); venc.addEventListener('dequeue', done, { once: true }); });
  const encodeFrame = async (t, src) => {
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
    if (encErr) throw encErr;
    comp.render(ctx, W, H, t, src, { project: p, version, groups, total, safeZone, compare: false, editing: false, maxDim: srcCap });
    const frame = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
    venc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    while (venc.encodeQueueSize > 6) await waitQueue();
    if (i % 5 === 0) {
      const el = (performance.now() - t0) / 1000;
      const eta = i > 10 ? el / (i + 1) * (N - i - 1) : null;
      onProgress?.((i + 1) / N * 0.95, eta, 'Renderizando vídeo…');
    }
    i++;
  };

  // Decodificación secuencial con WebCodecs (mediabunny): mucho más rápida que buscar fotograma a fotograma
  const MB = await loadMediabunny();
  const sinks = new Map();
  const sinkFor = async (asset) => {
    if (!MB || asset.kind !== 'video') return null;
    if (sinks.has(asset.id)) return sinks.get(asset.id);
    let s = null;
    try {
      const input = new MB.Input({ formats: MB.ALL_FORMATS, source: new MB.BlobSource(runtime.assets.get(asset.id).file) });
      const track = await input.getPrimaryVideoTrack();
      if (track && await track.canDecode()) {
        const sw = track.displayWidth, sh = track.displayHeight;
        const k = Math.min(1, srcCap / Math.max(sw, sh));
        s = new MB.CanvasSink(track, { width: Math.round(sw * k / 2) * 2, height: Math.round(sh * k / 2) * 2, fit: 'fill', poolSize: 3 });
      }
    } catch (e) { console.warn('mediabunny no disponible para', asset.name, e); }
    sinks.set(asset.id, s);
    return s;
  };

  const lay = layoutClips(p.clips);
  for (const l of lay) {
    const asset = p.assets.find(a => a.id === l.clip.assetId);
    const sp = l.clip.speed || 1;
    const iEnd = Math.min(N, Math.round(l.end * fps));
    if (i >= iEnd) continue;
    const times = [];
    for (let k = i; k < iEnd; k++) times.push(Math.min(l.clip.out - 0.001, l.clip.in + (k / fps - l.start) * sp, asset.duration - 0.001));
    const sink = await sinkFor(asset);
    // persona duplicada: la otra toma se decodifica a la vez, con su desfase
    const d = l.clip.dual;
    const asset2 = d ? p.assets.find(a => a.id === d.assetId) : null;
    const sink2 = asset2 ? await sinkFor(asset2) : null;
    if (sink) {
      let last = null, last2 = null;
      const it = sink.canvasesAtTimestamps(times)[Symbol.asyncIterator]();
      const it2 = sink2 ? sink2.canvasesAtTimestamps(times.map(s => clamp(s + (d.off || 0), 0, asset2.duration - 0.001)))[Symbol.asyncIterator]() : null;
      for (let j = 0; j < times.length; j++) {
        const r = await it.next();
        const wc = r.done ? null : r.value;
        if (wc?.canvas) last = wc.canvas;
        if (it2) { const r2 = await it2.next(); if (!r2.done && r2.value?.canvas) last2 = r2.value.canvas; }
        const hit = { ...l, src: times[j] };
        await encodeFrame((i) / fps, last ? { el: last, hit, asset, ...(last2 ? { el2: last2, asset2 } : {}) } : null);
      }
      try { await it.return?.(); } catch {}
      try { await it2?.return?.(); } catch {}
    } else {
      // Respaldo: elemento <video> con búsqueda por fotograma (o imagen fija)
      const el = getEl(asset);
      for (let j = 0; j < times.length; j++) {
        if (el instanceof HTMLVideoElement) {
          if (el.readyState < 1) await new Promise(r => el.addEventListener('loadeddata', r, { once: true }));
          await waitSeek(el, times[j]);
        } else if (!el.complete) await el.decode().catch(() => {});
        await encodeFrame(i / fps, { el, hit: { ...l, src: times[j] }, asset });
      }
    }
  }
  // fotogramas sobrantes por redondeo (negro)
  while (i < N) await encodeFrame(i / fps, null);
  await venc.flush();
  venc.close();

  if (acfg) {
    onProgress?.(0.96, 0, 'Codificando audio…');
    let aerr = null;
    const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { aerr = e; } });
    aenc.configure({ codec: acfg.codec, sampleRate: acfg.sampleRate, numberOfChannels: 2, bitrate: acfg.bitrate });
    const L = audio.getChannelData(0), R = audio.numberOfChannels > 1 ? audio.getChannelData(1) : L;
    const total = Math.min(audio.length, Math.ceil(N / fps * 48000));
    const CH = 4800;
    for (let s = 0; s < total; s += CH) {
      const n = Math.min(CH, total - s);
      const data = new Float32Array(n * 2);
      data.set(L.subarray(s, s + n), 0);
      data.set(R.subarray(s, s + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(s / 48000 * 1e6), data });
      aenc.encode(ad);
      ad.close();
      if (aerr) throw aerr;
    }
    await aenc.flush();
    aenc.close();
  }
  muxer.finalize();
  for (const el of els.values()) if (el instanceof HTMLVideoElement) { el.removeAttribute('src'); el.load(); }
  onProgress?.(1, 0, 'Listo');
  const blob = new Blob([target.buffer], { type: 'video/mp4' });
  blob.info = { W, H, fps, bitrate, audio: acfg ? `${acfg.mux.toUpperCase()} ${Math.round(acfg.bitrate / 1000)} kbps` : 'sin audio', loud };
  return blob;
}
