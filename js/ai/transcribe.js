import { uid } from '../lib.js';
import { PEAKS_PER_SEC } from '../media/assets.js';
import { autoThreshold } from '../media/silence.js';

export const WHISPER_MODELS = [
  { id: 'onnx-community/whisper-base_timestamped', name: 'Rápido', sub: 'Descarga ~120 MB · bueno para voz clara' },
  { id: 'onnx-community/whisper-small_timestamped', name: 'Preciso', sub: 'Descarga ~300 MB · recomendado en español' },
  { id: 'onnx-community/whisper-large-v3-turbo_timestamped', name: 'Máximo', sub: 'Descarga ~800 MB · requiere buena GPU' },
];
export const LANGS = [['spanish', 'Español'], ['english', 'Inglés'], ['catalan', 'Catalán'], ['portuguese', 'Portugués'], ['french', 'Francés'], ['italian', 'Italiano'], ['german', 'Alemán']];

let worker = null;
let seq = 0;
const pending = new Map();
let onDownload = null;

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('../workers/whisper.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'download') onDownload && onDownload(m);
    else if (m.type === 'ready') onDownload && onDownload({ ready: true, device: m.device });
    else if (m.type === 'result' || m.type === 'error') {
      const p = pending.get(m.id);
      if (p) { pending.delete(m.id); m.type === 'result' ? p.res(m) : p.rej(new Error(m.message)); }
    }
  };
  worker.onerror = (e) => { for (const p of pending.values()) p.rej(new Error(e.message || 'Error en el transcriptor')); pending.clear(); };
  return worker;
}

function call(audio, model, lang) {
  const id = ++seq;
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    getWorker().postMessage({ type: 'transcribe', id, audio, model, lang });
  });
}

// Trocea el audio en piezas de ≤ 28 s cortando en silencios
function pieces(pcm, rms, sr = 16000, maxLen = 28) {
  const thr = Math.pow(10, autoThreshold(rms) / 20);
  const dur = pcm.length / sr;
  const out = [];
  let start = 0;
  while (start < dur - 0.2) {
    let end = Math.min(dur, start + maxLen);
    if (end < dur) {
      // busca el punto más silencioso en los últimos 8 s del tramo
      const a = Math.floor((end - 8) * PEAKS_PER_SEC), b = Math.floor(end * PEAKS_PER_SEC);
      let best = b, bestV = Infinity;
      for (let i = Math.max(a, Math.floor(start * PEAKS_PER_SEC) + 50); i < b; i++) {
        let v = 0; for (let k = 0; k < 15; k++) v += rms[i + k] || 0;
        if (v < bestV) { bestV = v; best = i + 7; }
      }
      end = best / PEAKS_PER_SEC;
    }
    // ¿tiene voz?
    let loud = 0;
    for (let i = Math.floor(start * PEAKS_PER_SEC); i < Math.floor(end * PEAKS_PER_SEC); i++) if ((rms[i] || 0) > thr) loud++;
    if (loud > 8) out.push({ start, end });
    start = end;
  }
  return out;
}

/**
 * Transcribe un archivo. onProgress({phase, p, text})
 * @returns [{id,text,start,end,hl:0}]
 */
export async function transcribe(audio, { model, lang = 'spanish', onProgress } = {}) {
  onDownload = (m) => {
    if (m.ready) onProgress?.({ phase: 'ready', device: m.device });
    else onProgress?.({ phase: 'download', p: m.total ? m.loaded / m.total : null, loaded: m.loaded, total: m.total });
  };
  const sr = audio.sampleRate;
  const parts = pieces(audio.pcm16k, audio.rms, sr);
  const words = [];
  for (let i = 0; i < parts.length; i++) {
    const pc = parts[i];
    onProgress?.({ phase: 'transcribe', p: i / parts.length, i, n: parts.length });
    const seg = audio.pcm16k.slice(Math.floor(pc.start * sr), Math.floor(pc.end * sr));
    const r = await call(seg, model, lang);
    let prevEnd = pc.start;
    for (const ch of r.chunks) {
      let text = (ch.text || '').trim();
      if (!text) continue;
      const [s, e] = ch.timestamp || [];
      let start = pc.start + (s ?? 0), end = pc.start + (e ?? (s ?? 0) + 0.3);
      if (!isFinite(start)) start = prevEnd;
      if (!(end > start)) end = start + 0.25;
      // puntuación suelta → se une a la palabra anterior
      if (/^[.,;:!?…»”)]+$/.test(text) && words.length) { words[words.length - 1].text += text; continue; }
      words.push({ id: uid('w'), text, start, end: Math.min(end, pc.end + 0.2), hl: 0 });
      prevEnd = end;
    }
    onProgress?.({ phase: 'transcribe', p: (i + 1) / parts.length, i: i + 1, n: parts.length, text: r.text });
  }
  // limpia solapes
  for (let i = 1; i < words.length; i++) if (words[i].start < words[i - 1].end) words[i - 1].end = Math.max(words[i - 1].start + 0.05, words[i].start);
  return words;
}

// Destacado automático: números, cifras y palabras largas con contenido (1 por bloque)
const STOP = new Set('para porque cuando donde entonces también tienes tiene puedes puede hacer esto esta este estos estas como pero sobre desde hasta entre todos todas mucho muchos muy más menos solo sólo cada otra otro otros otras ellos ellas nosotros vosotros siempre nunca aquí allí ahora luego vamos estoy estás está están hemos habéis han había'.split(' '));
export function autoHighlight(groups) {
  const marks = [];
  for (const g of groups) {
    let best = null, bestScore = 0;
    for (const it of g.items) {
      const raw = it.w.text.replace(/[^\p{L}\p{N}%€$]/gu, '');
      const low = raw.toLowerCase();
      let s = 0;
      if (/\d/.test(raw) || /[%€$]/.test(raw)) s = 10;
      else if (!STOP.has(low) && raw.length >= 6) s = raw.length * 0.6;
      if (s > bestScore) { bestScore = s; best = it.w; }
    }
    if (best && bestScore >= 4) marks.push(best.id);
  }
  return marks;
}
