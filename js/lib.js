// Preact + hooks + htm en un único módulo (sin paso de compilación).
export {
  html, render, h, Component, createContext,
  useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useContext, useReducer,
} from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';

export const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function fmtTime(t, withFrames = false, fps = 30) {
  if (!isFinite(t)) t = 0;
  t = Math.max(0, t);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const base = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  if (!withFrames) return base;
  const f = Math.floor((t % 1) * fps);
  return `${base}.${String(f).padStart(2, '0')}`;
}

export function fmtDur(t) {
  if (!isFinite(t)) return '—';
  if (t < 60) return t.toFixed(1).replace('.', ',') + ' s';
  return fmtTime(t);
}

export function debounce(fn, ms) {
  let id;
  return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
