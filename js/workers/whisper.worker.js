// Transcripción local con Whisper (transformers.js). Se ejecuta en un worker para no bloquear la interfaz.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6';

env.allowLocalModels = false;
env.useBrowserCache = true;

const pipes = new Map(); // `${model}|${device}` -> pipeline
let preferred = null;    // dispositivo que ha funcionado

async function hasGPU() {
  try { return !!(self.navigator?.gpu && await navigator.gpu.requestAdapter()); } catch { return false; }
}

function progressFn() {
  const files = {};
  return (p) => {
    if (p.status === 'progress' && p.file) {
      files[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
      let l = 0, t = 0;
      for (const f of Object.values(files)) { l += f.loaded; t += f.total; }
      self.postMessage({ type: 'download', loaded: l, total: t });
    }
  };
}

async function getPipe(model, device) {
  const key = model + '|' + device;
  if (pipes.has(key)) return pipes.get(key);
  const big = /large|medium/.test(model);
  const opts = device === 'webgpu'
    ? { device, dtype: { encoder_model: big ? 'fp16' : 'fp32', decoder_model_merged: 'q4' } }
    : { device: 'wasm', dtype: 'q8' };
  const p = await pipeline('automatic-speech-recognition', model, { ...opts, progress_callback: progressFn() });
  pipes.set(key, p);
  self.postMessage({ type: 'ready', device });
  return p;
}

// Salida degenerada (alucinación típica: ">>", repeticiones sin letras)
function degenerate(out) {
  const ch = out.chunks || [];
  if (!ch.length) return false;
  const bad = ch.filter(c => !/[\p{L}\p{N}]/u.test(c.text || '')).length;
  if (bad / ch.length > 0.4) return true;
  const txt = (out.text || '').trim();
  return /(.{2,12})\1{6,}/.test(txt);
}

async function run(model, audio, lang, device) {
  const pipe = await getPipe(model, device);
  const opts = { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 };
  if (!/\.en_/.test(model) && lang && lang !== 'auto') { opts.language = lang; opts.task = 'transcribe'; }
  return pipe(audio, opts);
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type !== 'transcribe') return;
  try {
    const order = preferred ? [preferred] : (await hasGPU()) ? ['webgpu', 'wasm'] : ['wasm'];
    if (preferred === 'webgpu') order.push('wasm');
    let out = null, lastErr = null;
    for (const dev of order) {
      try {
        out = await run(m.model, m.audio, m.lang, dev);
        if (degenerate(out)) { console.warn('Whisper: salida degenerada en', dev); out = null; if (preferred === dev) preferred = null; continue; }
        preferred = dev;
        break;
      } catch (err) { lastErr = err; console.warn('Whisper', dev, err); }
    }
    if (!out) throw lastErr || new Error('La transcripción no ha dado un resultado válido');
    self.postMessage({ type: 'result', id: m.id, chunks: out.chunks || [], text: out.text || '' });
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: String(err?.message || err) });
  }
};
