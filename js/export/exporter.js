import { Muxer, ArrayBufferTarget } from 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.mjs';
import { runtime } from '../core/store.js';
import { clipDur, totalDuration, layoutClips } from '../core/timeline.js';

let mbPromise = null;
function loadMediabunny() {
  if (!mbPromise) mbPromise = import('https://cdn.jsdelivr.net/npm/mediabunny@1.61.6/+esm').catch((e) => { console.warn('mediabunny', e); return null; });
  return mbPromise;
}
import { captionGroups } from '../core/captions.js';
import { Compositor } from '../render/compositor.js';

const VIDEO_CODECS = ['avc1.640033', 'avc1.640028', 'avc1.4d0033', 'avc1.4d0028', 'avc1.42e033', 'avc1.42e028'];

async function pickVideoConfig(W, H, fps, bitrate) {
  for (const codec of VIDEO_CODECS) {
    const cfg = { codec, width: W, height: H, bitrate, framerate: fps, latencyMode: 'quality', avc: { format: 'avc' } };
    try { const s = await VideoEncoder.isConfigSupported(cfg); if (s.supported) return cfg; } catch {}
  }
  throw new Error('Este navegador no puede codificar H.264. Usa Google Chrome actualizado.');
}

async function pickAudioConfig(sampleRate) {
  const opts = [
    { codec: 'mp4a.40.2', mux: 'aac', sampleRate, numberOfChannels: 2, bitrate: 192000 },
    { codec: 'opus', mux: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 160000 },
  ];
  for (const o of opts) {
    try { const s = await AudioEncoder.isConfigSupported({ codec: o.codec, sampleRate: o.sampleRate, numberOfChannels: 2, bitrate: o.bitrate }); if (s.supported) return o; } catch {}
  }
  return null;
}

export async function mixAudio(p, sr = 48000) {
  const dur = totalDuration(p);
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil((dur + 0.05) * sr)), sr);
  const decoded = new Map();
  for (const a of p.assets) {
    if (a.kind === 'image') continue;
    if (!p.clips.some(c => c.assetId === a.id)) continue;
    const rt = runtime.assets.get(a.id);
    if (!rt?.file) continue;
    try { decoded.set(a.id, await ctx.decodeAudioData(await rt.file.arrayBuffer())); } catch { /* sin audio */ }
  }
  let t = 0;
  for (const c of p.clips) {
    const d = clipDur(c);
    const buf = decoded.get(c.assetId);
    const vol = p.muted ? 0 : (c.volume ?? 1);
    if (buf && vol > 0.001) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = c.speed || 1;
      const g = ctx.createGain();
      const f = Math.min(0.008, d / 4);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + f);
      g.gain.setValueAtTime(vol, Math.max(t + f, t + d - f));
      g.gain.linearRampToValueAtTime(0, t + d);
      src.connect(g).connect(ctx.destination);
      src.start(t, c.in, c.out - c.in);
    }
    t += d;
  }
  return ctx.startRendering();
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
  const groups = captionGroups(p, version);

  const t0 = performance.now();
  let i = 0;
  const encodeFrame = async (t, src) => {
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
    if (encErr) throw encErr;
    comp.render(ctx, W, H, t, src, { project: p, version, groups, total, safeZone, compare: false, editing: false, maxDim: Math.max(W, H) });
    const frame = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
    venc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    while (venc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 2));
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
        const k = Math.min(1, 1920 / Math.max(sw, sh));
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
    if (sink) {
      let last = null;
      const it = sink.canvasesAtTimestamps(times)[Symbol.asyncIterator]();
      for (let j = 0; j < times.length; j++) {
        const r = await it.next();
        const wc = r.done ? null : r.value;
        if (wc?.canvas) last = wc.canvas;
        const hit = { ...l, src: times[j] };
        await encodeFrame((i) / fps, last ? { el: last, hit, asset } : null);
      }
      try { await it.return?.(); } catch {}
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
  return new Blob([target.buffer], { type: 'video/mp4' });
}
