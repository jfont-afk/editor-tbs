import { useState, useEffect, uid } from '../lib.js';
import { FORMATS } from '../data/brand.js';

// ---------- Estado ----------
export const defaultCaptions = () => ({
  enabled: true,
  template: 'tbs-editorial',
  wordsPerGroup: 4,
  maxChars: 26,
  breakOnPunct: true,
  gapBreak: 0.55,
  posY: 0.64,
  posX: 0.5,
  style: {},              // ajustes sobre la plantilla (texto, efectos, animación…)
  size: 1,
  upper: 'auto',          // auto | on | off
  behind: false,          // texto detrás de la persona (global)
  autoReadable: true,     // contraste + ajuste de tamaño
  avoidFace: true,
  color: null,            // null = color de la plantilla
  hlColor: null,
  anim: null,             // null = animación de la plantilla
});

export const defaultColor = () => ({
  preset: 'none', exposure: 0, contrast: 0, saturation: 0, vibrance: 0, temperature: 0, tint: 0,
  highlights: 0, shadows: 0, fade: 0, vignette: 0, grain: 0, sharpen: 0,
});

export function newProject() {
  return {
    v: 1,
    name: 'Proyecto sin título',
    format: { ...FORMATS[0] },
    fps: 30,
    fit: 'cover',               // cover | blur (vídeo horizontal en vertical con fondo desenfocado)
    assets: [],                 // {id, name, kind, duration, width, height, hasAudio, size, lastModified}
    clips: [],                  // pista principal magnética
    overlays: [],               // motions y textos
    transcripts: {},            // assetId -> { lang, words:[{id,text,start,end,hl,br,gs}] }
    faceTracks: {},             // assetId -> { step, pts:[[x,y,size]] } (auto-encuadre de cabeza)
    captions: defaultCaptions(),
    color: defaultColor(),      // corrección global
    autoZoom: false,            // zoom alterno en cortes del mismo plano
    brand: { logo: null },      // dataURL del logo
    createdAt: Date.now(),
  };
}

export const state = {
  project: newProject(),
  ui: {
    tab: 'media',
    time: 0,
    playing: false,
    sel: null,                  // {type:'clip'|'overlay'|'group', id}
    pxPerSec: 60,
    safeZone: 'tiktok',
    showSafe: true,
    compare: false,
    busy: null,                 // {title, text, progress (0..1|null), cancel?}
    toasts: [],
    silencePreview: null,       // [{start,end}] en tiempo de línea de tiempo
    wordSel: [],                // ids de palabras seleccionadas en la transcripción
    restore: null,              // proyecto guardado pendiente de recuperar
  },
};

// ---------- Suscripción ----------
const listeners = new Set();
let scheduled = false;
export function emit() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => { scheduled = false; listeners.forEach(l => l()); });
}
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function useStore() {
  const [, set] = useState(0);
  useEffect(() => subscribe(() => set(n => n + 1)), []);
  return state;
}

// ---------- Historial (deshacer / rehacer) ----------
const past = [];
const future = [];
let lastKey = null, lastAt = 0;

export function update(fn, opts = {}) {
  const { history = true, key = null } = opts;
  if (history) {
    const now = Date.now();
    if (!(key && key === lastKey && now - lastAt < 900)) {
      past.push(JSON.stringify(state.project));
      if (past.length > 120) past.shift();
      future.length = 0;
    }
    lastKey = key; lastAt = now;
  }
  fn(state.project);
  projectChanged();
  emit();
}

export function setUI(patch) {
  Object.assign(state.ui, typeof patch === 'function' ? patch(state.ui) : patch);
  emit();
}

export const canUndo = () => past.length > 0;
export const canRedo = () => future.length > 0;
export function undo() {
  if (!past.length) return;
  future.push(JSON.stringify(state.project));
  state.project = JSON.parse(past.pop());
  lastKey = null;
  projectChanged(); emit();
}
export function redo() {
  if (!future.length) return;
  past.push(JSON.stringify(state.project));
  state.project = JSON.parse(future.pop());
  lastKey = null;
  projectChanged(); emit();
}
export function resetHistory() { past.length = 0; future.length = 0; }

// Versión del proyecto para cachés derivadas (subtítulos, layout…)
export let projectVersion = 0;
const changeHooks = new Set();
export function onProjectChange(fn) { changeHooks.add(fn); return () => changeHooks.delete(fn); }
function projectChanged() { projectVersion++; changeHooks.forEach(f => f()); }
export function touchProject() { projectChanged(); emit(); }

// ---------- Avisos ----------
export function toast(text, kind = 'ok', ms = 2600) {
  const t = { id: uid('t'), text, kind };
  state.ui.toasts = [...state.ui.toasts, t];
  emit();
  setTimeout(() => { state.ui.toasts = state.ui.toasts.filter(x => x.id !== t.id); emit(); }, ms);
}

export function busy(b) { state.ui.busy = b; emit(); }

// Datos en tiempo de ejecución (no se guardan en el historial): archivos, vídeos, audio decodificado…
export const runtime = {
  assets: new Map(),   // id -> { file, url, handle, audio: AudioBuffer|null, peaks: Float32Array|null, thumbs: [] }
};
