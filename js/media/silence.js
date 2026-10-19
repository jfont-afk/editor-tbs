import { PEAKS_PER_SEC } from './assets.js';

const toDb = (v) => 20 * Math.log10(v + 1e-9);

function percentile(arr, p) {
  const a = Array.from(arr).sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))))];
}

// Nivel sugerido a partir del ruido de fondo y del nivel de voz
export function autoThreshold(rms) {
  const db = Array.from(rms, toDb).filter(v => v > -100);
  if (!db.length) return -40;
  const floor = percentile(db, 0.1);
  const speech = percentile(db, 0.9);
  return Math.round(Math.max(-60, Math.min(-18, floor + (speech - floor) * 0.3)));
}

/**
 * Detecta silencios en un archivo.
 * @returns rangos eliminables [{start,end}] en segundos del archivo
 */
export function detectSilences(rms, { threshold = -40, minSilence = 0.45, padding = 0.12, from = 0, to = Infinity } = {}) {
  const fps = PEAKS_PER_SEC;
  const n = rms.length;
  // suavizado 30 ms para no cortar entre sílabas
  const sm = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let k = -1; k <= 1; k++) { const v = rms[i + k]; if (v !== undefined && v > m) m = v; }
    sm[i] = toDb(m);
  }
  const out = [];
  let s = -1;
  for (let i = 0; i <= n; i++) {
    const quiet = i < n && sm[i] < threshold;
    if (quiet && s < 0) s = i;
    if (!quiet && s >= 0) {
      const a = s / fps, b = i / fps;
      const isStart = s === 0, isEnd = i === n;
      const ra = isStart ? a : a + padding;
      const rb = isEnd ? b : b - padding;
      if (b - a >= minSilence && rb - ra > 0.05) out.push({ start: ra, end: rb });
      s = -1;
    }
  }
  return out
    .map(r => ({ start: Math.max(r.start, from), end: Math.min(r.end, to) }))
    .filter(r => r.end - r.start > 0.05);
}

export const sumRanges = (rs) => rs.reduce((a, r) => a + (r.end - r.start), 0);
