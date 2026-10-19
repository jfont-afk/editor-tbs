import { uid } from '../lib.js';
import { runtime } from '../core/store.js';

export const PEAKS_PER_SEC = 100;

export function fileKind(file) {
  const t = file.type || '';
  const n = file.name.toLowerCase();
  if (t.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv)$/.test(n)) return 'video';
  if (t.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/.test(n)) return 'image';
  if (t.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/.test(n)) return 'audio';
  return null;
}

function waitEvent(el, ok, bad = 'error', ms = 20000) {
  return new Promise((res, rej) => {
    const to = setTimeout(() => { cleanup(); rej(new Error('timeout ' + ok)); }, ms);
    const a = () => { cleanup(); res(); };
    const b = () => { cleanup(); rej(new Error(el.error?.message || 'No se pudo leer el archivo')); };
    const cleanup = () => { clearTimeout(to); el.removeEventListener(ok, a); el.removeEventListener(bad, b); };
    el.addEventListener(ok, a, { once: true });
    el.addEventListener(bad, b, { once: true });
  });
}

export async function probeFile(file) {
  const kind = fileKind(file);
  if (!kind) throw new Error('Formato no compatible: ' + file.name);
  const url = URL.createObjectURL(file);
  const base = { id: uid('a'), name: file.name, kind, size: file.size, lastModified: file.lastModified };
  if (kind === 'image') {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { asset: { ...base, duration: 3600, width: img.naturalWidth, height: img.naturalHeight, hasAudio: false }, url };
  }
  const el = document.createElement(kind === 'audio' ? 'audio' : 'video');
  el.preload = 'metadata'; el.muted = true; el.src = url;
  await waitEvent(el, 'loadedmetadata');
  let duration = el.duration;
  if (!isFinite(duration)) { // algunos webm no traen duración
    el.currentTime = 1e7; await waitEvent(el, 'seeked').catch(() => {});
    duration = el.duration; el.currentTime = 0;
  }
  const asset = { ...base, duration, width: el.videoWidth || 0, height: el.videoHeight || 0, hasAudio: true };
  el.removeAttribute('src'); el.load();
  return { asset, url };
}

// Decodifica el audio a mono 16 kHz (análisis de silencios + transcripción) y calcula picos para la forma de onda.
export async function analyzeAudio(file) {
  const buf = await file.arrayBuffer();
  let audio;
  try {
    const ctx = new OfflineAudioContext(1, 16000, 16000);
    audio = await ctx.decodeAudioData(buf);
  } catch (e) {
    return null; // vídeo sin pista de audio
  }
  const n = audio.length;
  const mono = new Float32Array(n);
  for (let ch = 0; ch < audio.numberOfChannels; ch++) {
    const d = audio.getChannelData(ch);
    for (let i = 0; i < n; i++) mono[i] += d[i] / audio.numberOfChannels;
  }
  const hop = Math.round(16000 / PEAKS_PER_SEC);
  const peaks = new Float32Array(Math.ceil(n / hop));
  const rms = new Float32Array(peaks.length);
  for (let k = 0; k < peaks.length; k++) {
    let mx = 0, s = 0;
    const a = k * hop, b = Math.min(n, a + hop);
    for (let i = a; i < b; i++) { const v = mono[i]; const av = v < 0 ? -v : v; if (av > mx) mx = av; s += v * v; }
    peaks[k] = mx;
    rms[k] = Math.sqrt(s / Math.max(1, b - a));
  }
  return { pcm16k: mono, peaks, rms, sampleRate: 16000 };
}

// Fotogramas pequeños para la tira de la línea de tiempo
export async function makeThumbs(url, duration, count = 30, height = 72) {
  const v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.src = url; v.playsInline = true;
  await waitEvent(v, 'loadeddata');
  const ratio = v.videoWidth / v.videoHeight || 16 / 9;
  const w = Math.round(height * ratio);
  const n = Math.max(2, Math.min(count, Math.ceil(duration / 0.8)));
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = Math.min(duration - 0.05, (i + 0.5) * duration / n);
    v.currentTime = t;
    try { await waitEvent(v, 'seeked', 'error', 8000); } catch { continue; }
    const c = new OffscreenCanvas(w, height);
    c.getContext('2d').drawImage(v, 0, 0, w, height);
    out.push({ t, bmp: c.transferToImageBitmap() });
  }
  v.removeAttribute('src'); v.load();
  return out;
}

export async function imageThumb(url, height = 72) {
  const img = new Image(); img.src = url; await img.decode();
  const w = Math.round(height * img.naturalWidth / img.naturalHeight);
  const c = new OffscreenCanvas(w, height);
  c.getContext('2d').drawImage(img, 0, 0, w, height);
  return [{ t: 0, bmp: c.transferToImageBitmap(), img }];
}

export function thumbAt(assetId, t) {
  const rt = runtime.assets.get(assetId);
  if (!rt?.thumbs?.length) return null;
  let best = rt.thumbs[0];
  for (const th of rt.thumbs) if (Math.abs(th.t - t) < Math.abs(best.t - t)) best = th;
  return best.bmp;
}

export function fingerprint(a) { return `${a.name}|${a.size}|${a.lastModified}`; }
