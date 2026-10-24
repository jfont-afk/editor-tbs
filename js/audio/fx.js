// Corrección de audio: la misma cadena de filtros para la vista previa y para la exportación.
// Cada clip (o audio de la pista de audio) guarda sus ajustes en `fx`:
//   hp        quitar retumbe (filtro de graves a 80 Hz)        0 | 1
//   body      cuerpo / quitar sonido de caja (250 Hz, dB)      −6 … +6
//   presence  presencia / claridad (3,2 kHz, dB)                0 … +8
//   air       brillo (9 kHz, dB)                               −6 … +6
//   comp      compresión (igualar partes flojas y fuertes)      0 … 1
//   gate      reducir el ruido de fondo (también bajo la voz)  0 … 1  (0 = sin efecto … 1 = hasta −30 dB)
//   deess     suavizar las eses                                 0 … 1
//   fadeIn / fadeOut  fundidos de entrada y salida (s)
//   duck      solo pista de audio: bajar mientras se habla      0 … 1

export const VOZ_CLARA = { preset: 'voz', hp: 1, body: -2.5, presence: 3.5, air: 2, comp: 0.55, gate: 0.9, deess: 0.45 };
export const NEUTRAL = { preset: null, hp: 0, body: 0, presence: 0, air: 0, comp: 0, gate: 0, deess: 0 };
const KEYS = Object.keys(NEUTRAL).filter(k => k !== 'preset');

// ¿El audio tiene alguna corrección (aparte de volumen y fundidos)?
export const hasFx = (fx) => !!fx && KEYS.some(k => Math.abs(fx[k] || 0) > 1e-3);
export const hasFades = (fx) => !!fx && ((fx.fadeIn || 0) > 0.01 || (fx.fadeOut || 0) > 0.01);
export const isVozClara = (fx) => !!fx && KEYS.every(k => Math.abs((fx[k] || 0) - VOZ_CLARA[k]) < 1e-3);

// Retraso fijo del procesador de voz (reducción de ruido por STFT + tramas de RNNoise), en muestras,
// y el del compresor (DynamicsCompressor mira 6 ms por delante). Al exportar se compensan (las fuentes
// que pasan por la cadena empiezan antes); en la vista previa el sonido va ~35 ms por detrás de la imagen.
export const VOICE_LATENCY = 1408;
export const COMP_DELAY = 0.006;

const WORKLET_URL = new URL('./voice-worklet.js', import.meta.url).href;
// RNNoise (red neuronal de Xiph): versión con WebAssembly SIMD y, si el navegador no la admite, la normal
const RNNOISE_URLS = ['../vendor/rnnoise.wasm', '../vendor/rnnoise-nosimd.wasm'].map(u => new URL(u, import.meta.url).href);
let rnnoise = null;
// se descarga una vez; cada nodo recibe los bytes y el worklet lo compila una vez por contexto
function loadRnnoise() {
  if (!rnnoise) rnnoise = (async () => {
    for (const u of RNNOISE_URLS) {
      try { const r = await fetch(u); if (r.ok) { const b = await r.arrayBuffer(); if (WebAssembly.validate(b)) return b; } } catch (e) { console.warn('rnnoise', e); }
    }
    return null;
  })();
  return rnnoise;
}
const loaded = new WeakMap();
// Carga los procesadores propios en un contexto (si falla, la cadena funciona sin reducción de ruido ni de-esser;
// sin RNNoise, la reducción de ruido sigue con el supresor espectral)
export function loadWorklet(ctx) {
  if (!loaded.has(ctx)) loaded.set(ctx, (ctx.audioWorklet ? Promise.all([ctx.audioWorklet.addModule(WORKLET_URL), loadRnnoise()]) : Promise.reject(new Error('sin AudioWorklet')))
    .then(([, rnn]) => ({ rnnoise: rnn }), (e) => { console.warn('audio worklet', e); return false; }));
  return loaded.get(ctx);
}

// Valores de cada nodo a partir de los ajustes
function params(fx) {
  const f = { ...NEUTRAL, ...(fx || {}) };
  const comp = Math.max(0, Math.min(1, f.comp || 0));
  const thr = comp > 0.001 ? -10 - 22 * comp : 0;
  const ratio = comp > 0.001 ? 1.6 + 4.4 * comp : 1;
  return {
    hp: f.hp ? 85 : 10,
    body: f.body || 0, presence: f.presence || 0, air: f.air || 0,
    thr, ratio,
    // compensación del volumen que quita el compresor (aprox. la mitad de la reducción máxima)
    makeup: Math.pow(10, (comp > 0.001 ? -thr * (1 - 1 / ratio) * 0.3 : 0) / 20),
    gate: Math.max(0, Math.min(1, f.gate || 0)), deess: Math.max(0, Math.min(1, f.deess || 0)),
  };
}

export class FxChain {
  constructor(ctx, worklet) {
    this.ctx = ctx;
    this.input = ctx.createGain();                       // volumen del clip
    // dos filtros de graves seguidos (24 dB/oct): el retumbe desaparece sin tocar la voz
    this.hp = ctx.createBiquadFilter(); this.hp.type = 'highpass'; this.hp.Q.value = 0.54;
    this.hp2 = ctx.createBiquadFilter(); this.hp2.type = 'highpass'; this.hp2.Q.value = 1.31;
    this.body = ctx.createBiquadFilter(); this.body.type = 'peaking'; this.body.frequency.value = 250; this.body.Q.value = 0.9;
    this.pres = ctx.createBiquadFilter(); this.pres.type = 'peaking'; this.pres.frequency.value = 3200; this.pres.Q.value = 0.8;
    this.air = ctx.createBiquadFilter(); this.air.type = 'highshelf'; this.air.frequency.value = 9000;
    this.voice = null;
    if (worklet) { try { this.voice = new AudioWorkletNode(ctx, 'tbs-voice', { outputChannelCount: [2], processorOptions: { rnnoise: worklet.rnnoise || null } }); } catch (e) { console.warn(e); } }
    this.latency = (this.voice ? VOICE_LATENCY / ctx.sampleRate : 0) + COMP_DELAY;   // s (lo que tarda en salir lo que entra)
    this.comp = ctx.createDynamicsCompressor();
    this.comp.knee.value = 8; this.comp.attack.value = 0.004; this.comp.release.value = 0.18;
    this.makeup = ctx.createGain();
    this.fade = ctx.createGain();                        // fundidos de entrada y salida
    this.output = this.fade;
    let n = this.input.connect(this.hp).connect(this.hp2).connect(this.body).connect(this.pres).connect(this.air);
    if (this.voice) n = n.connect(this.voice);
    n.connect(this.comp).connect(this.makeup).connect(this.fade);
    this.key = null;
  }
  // Aplica los ajustes (en la vista previa con una transición corta para que no chasquee)
  set(fx, live = false) {
    const k = JSON.stringify(fx || null);
    if (k === this.key) return;
    this.key = k;
    const v = params(fx), t = this.ctx.currentTime;
    const put = (param, x) => { if (live) param.setTargetAtTime(x, t, 0.02); else param.value = x; };
    put(this.hp.frequency, v.hp); put(this.hp2.frequency, v.hp);
    put(this.body.gain, v.body); put(this.pres.gain, v.presence); put(this.air.gain, v.air);
    put(this.comp.threshold, v.thr); put(this.comp.ratio, v.ratio);
    put(this.makeup.gain, v.makeup);
    if (this.voice) { this.voice.parameters.get('gate').value = v.gate; this.voice.parameters.get('deess').value = v.deess; }
  }
}

// Nodo que baja la música mientras suena la voz (entrada 0 = música, entrada 1 = voz)
export function duckNode(ctx, worklet) {
  if (!worklet) return null;
  try { return new AudioWorkletNode(ctx, 'tbs-duck', { numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2] }); } catch (e) { console.warn(e); return null; }
}

// Ganancia del fundido en el instante `local` (s desde el inicio) de un tramo de duración `d`
export function fadeGain(fx, local, d) {
  let g = 1;
  const fi = fx?.fadeIn || 0, fo = fx?.fadeOut || 0;
  if (fi > 0.01) g = Math.min(g, Math.max(0, local / fi));
  if (fo > 0.01) g = Math.min(g, Math.max(0, (d - local) / fo));
  return g;
}
