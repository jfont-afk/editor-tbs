// Auto-encuadre: coloca la cabeza en la zona superior central (TikTok / Reels / Shorts)
import { clamp } from '../lib.js';
import { detectFaces } from './vision.js';

export const TRACK_STEP = 0.5;

function waitSeek(v, t) {
  return new Promise((res) => {
    const done = () => { clearTimeout(to); res(); };
    const to = setTimeout(done, 2500);
    v.addEventListener('seeked', done, { once: true });
    v.currentTime = t;
  });
}

const headOf = (faces) => {
  let best = null;
  for (const f of faces) if (!best || f.w * f.h > best.w * best.h) best = f;
  // centro de la cabeza (un poco por encima del centro de la cara para incluir frente/pelo)
  return best ? [best.x + best.w / 2, best.y + best.h * 0.42, best.h] : null;
};

/** Analiza las caras de un vídeo. Devuelve { step, pts:[[x,y,s]|null] } con centro y tamaño normalizados. */
export async function analyzeFaces(url, duration, onProgress, signal) {
  const v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.src = url; v.playsInline = true;
  await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('No se pudo leer el vídeo')); });
  const n = Math.max(1, Math.floor(duration / TRACK_STEP));
  const raw = new Array(n + 1).fill(null);
  await detectFaces(v).catch(() => {}); // carga el modelo antes de empezar
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    // Rápido: reproduce el vídeo acelerado y analiza los fotogramas según llegan
    await new Promise((resolve, reject) => {
      let done = false;
      const finish = () => { if (!done) { done = true; v.pause(); resolve(); } };
      const onFrame = async (now, meta) => {
        if (done) return;
        if (signal?.aborted) { done = true; v.pause(); reject(new DOMException('Cancelado', 'AbortError')); return; }
        const i = Math.round(meta.mediaTime / TRACK_STEP);
        if (i <= n && !raw[i]) {
          try { raw[i] = headOf(await detectFaces(v)) || 0; } catch { raw[i] = 0; }
          if (i % 6 === 0) onProgress?.(i / n);
        }
        v.requestVideoFrameCallback(onFrame);
      };
      v.requestVideoFrameCallback(onFrame);
      v.onended = finish;
      v.playbackRate = 6;
      v.play().catch(reject);
      setTimeout(finish, (duration / 2 + 30) * 1000); // por seguridad
    });
  }
  // Rellena por búsqueda los huecos que no se pudieron analizar
  for (let i = 0; i <= n; i++) {
    if (raw[i] !== null) continue;
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
    await waitSeek(v, Math.min(duration - 0.05, i * TRACK_STEP));
    try { raw[i] = headOf(await detectFaces(v)) || 0; } catch { raw[i] = 0; }
    if (i % 4 === 0) onProgress?.(i / n);
  }
  v.removeAttribute('src'); v.load();
  return { step: TRACK_STEP, pts: smooth(fill(raw.map(p => p || null))) };
}

// Rellena huecos interpolando
function fill(pts) {
  const out = pts.slice();
  let last = -1;
  for (let i = 0; i < out.length; i++) {
    if (!out[i]) continue;
    if (last >= 0 && i - last > 1) {
      for (let k = last + 1; k < i; k++) {
        const a = (k - last) / (i - last);
        out[k] = out[last].map((v, j) => v + (out[i][j] - v) * a);
      }
    } else if (last < 0) for (let k = 0; k < i; k++) out[k] = out[i].slice();
    last = i;
  }
  if (last >= 0) for (let k = last + 1; k < out.length; k++) out[k] = out[last].slice();
  return out;
}

// Suavizado (media móvil ponderada) para que la cámara no tiemble
function smooth(pts, r = 3) {
  if (!pts.length || !pts[0]) return pts;
  return pts.map((_, i) => {
    let sx = 0, sy = 0, ss = 0, sw = 0;
    for (let k = -r; k <= r; k++) {
      const p = pts[i + k]; if (!p) continue;
      const w = r + 1 - Math.abs(k);
      sx += p[0] * w; sy += p[1] * w; ss += p[2] * w; sw += w;
    }
    return [sx / sw, sy / sw, ss / sw];
  });
}

export function trackAt(track, t) {
  if (!track?.pts?.length || !track.pts[0]) return null;
  const f = clamp(t / track.step, 0, track.pts.length - 1);
  const i = Math.floor(f), a = f - i;
  const p = track.pts[i], q = track.pts[Math.min(track.pts.length - 1, i + 1)];
  return [p[0] + (q[0] - p[0]) * a, p[1] + (q[1] - p[1]) * a, p[2] + (q[2] - p[2]) * a];
}

const medianCache = new Map();
export function trackMedian(track, a, b, key) {
  if (key && medianCache.has(key)) return medianCache.get(key);
  const xs = [], ys = [], ss = [];
  for (let t = a; t <= b; t += track.step) { const p = trackAt(track, t); if (p) { xs.push(p[0]); ys.push(p[1]); ss.push(p[2]); } }
  if (!xs.length) return null;
  const med = (arr) => arr.sort((x, y) => x - y)[Math.floor(arr.length / 2)];
  const r = [med(xs), med(ys), med(ss)];
  if (key) medianCache.set(key, r);
  return r;
}
export function clearReframeCache() { medianCache.clear(); }

/**
 * Rectángulo de vídeo para que la cabeza (fx,fy en coordenadas normalizadas de la fuente) quede en (tx,ty) del fotograma,
 * sin dejar bordes negros. w0,h0 = tamaño "cover" base.
 */
export function reframeRect(W, H, w0, h0, fx, fy, tx, ty, maxZoom = 1.8, minZoom = 1) {
  const need = [
    fy > 0.001 ? (ty * H) / (fy * h0) : 1,
    fy < 0.999 ? (H * (1 - ty)) / ((1 - fy) * h0) : 1,
    fx > 0.001 ? (tx * W) / (fx * w0) : 1,
    fx < 0.999 ? (W * (1 - tx)) / ((1 - fx) * w0) : 1,
  ];
  const z = clamp(Math.max(minZoom, ...need), 1, maxZoom);
  const w = w0 * z, h = h0 * z;
  const x = clamp(tx * W - fx * w, W - w, 0);
  const y = clamp(ty * H - fy * h, H - h, 0);
  return { x, y, w, h, z };
}
