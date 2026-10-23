// Procesadores de audio (AudioWorklet). Se usan igual en la vista previa (AudioContext)
// y al exportar (OfflineAudioContext), así lo que se oye al reproducir es lo que sale en el MP4.
//  · tbs-voice: reducción de ruido de fondo (puerta adaptativa) + suavizar eses (de-esser)
//  · tbs-duck: baja la música mientras se habla (entrada 0 = música, entrada 1 = voz)

const lin = (d) => Math.pow(10, d / 20);
const dB = (x) => 20 * Math.log10(x + 1e-9);
const smooth = (ms) => Math.exp(-1 / (sampleRate * ms / 1000));

// Coeficientes de biquad (RBJ), normalizados
function biquad(type, f, q) {
  const w = 2 * Math.PI * Math.min(f, sampleRate * 0.45) / sampleRate;
  const cs = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; } // paso banda (ganancia 0 dB en el pico)
  const a0 = 1 + al;
  return [b0 / a0, b1 / a0, b2 / a0, -2 * cs / a0, (1 - al) / a0];
}
function run(c, s, x) {
  const y = c[0] * x + s[0];
  s[0] = c[1] * x - c[3] * y + s[1];
  s[1] = c[2] * x - c[4] * y;
  return y;
}

class VoiceProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'gate', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'deess', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.env = 0;              // envolvente de energía de la señal (media cuadrática)
    this.floorDb = -50;        // nivel del ruido de fondo (se aprende en las pausas)
    this.hold = 0;
    this.gGate = 1;
    this.lpC = biquad('lp', 5200, 0.707);
    this.bpC = biquad('bp', 7200, 1.1);
    this.lpS = [[0, 0], [0, 0]];
    this.bpS = [0, 0];
    this.sEnv = 0; this.fEnv = 0; this.gDe = 1;
    this.aFast = smooth(1); this.aEnv = smooth(2); this.rEnv = smooth(45); this.rSib = smooth(40);
    this.gOpen = smooth(3); this.gClose = smooth(140);
    this.dAtk = smooth(1.5); this.dRel = smooth(70);
    this.dt = 128 / sampleRate;
  }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!inp || !inp.length) return true;
    const gate = params.gate[0], deess = params.deess[0];
    const n = inp[0].length, nch = Math.min(inp.length, out.length);
    // 1) puerta: umbral unos dB por encima del ruido de fondo aprendido
    let blockPeak = 0;
    for (let i = 0; i < n; i++) {
      let m = 0;
      for (let c = 0; c < inp.length; c++) m += inp[c][i];
      const a = (m / inp.length) ** 2;
      this.env = a > this.env ? a + (this.env - a) * this.aEnv : a + (this.env - a) * this.rEnv;
      if (this.env > blockPeak) blockPeak = this.env;
    }
    const envDb = 10 * Math.log10(this.env + 1e-12);
    // el suelo baja deprisa en las pausas y sube despacio (6 dB/s) mientras se habla
    if (envDb < this.floorDb) this.floorDb += (envDb - this.floorDb) * 0.03;
    else this.floorDb += Math.min(envDb - this.floorDb, 6 * this.dt);
    this.floorDb = Math.max(-85, Math.min(-30, this.floorDb));
    let target = 1;
    if (gate > 0.001) {
      const thr = this.floorDb + 9 + 6 * gate;
      if (10 * Math.log10(blockPeak + 1e-12) > thr) this.hold = 0.16;
      else if (this.hold > 0) this.hold -= this.dt;
      else target = lin(-Math.min(6 + 24 * gate, 3 + (thr - envDb) * 2));
    }
    // 2) de-esser: si la banda de las eses domina, se baja solo la parte aguda
    for (let i = 0; i < n; i++) {
      this.gGate = target > this.gGate ? target + (this.gGate - target) * this.gOpen : target + (this.gGate - target) * this.gClose;
      let m = 0;
      for (let c = 0; c < inp.length; c++) m += inp[c][i];
      m /= inp.length;
      let gd = 1;
      if (deess > 0.001) {
        const s = Math.abs(run(this.bpC, this.bpS, m)), f = Math.abs(m);
        this.sEnv = s > this.sEnv ? s + (this.sEnv - s) * this.aFast : s + (this.sEnv - s) * this.rSib;
        this.fEnv = f > this.fEnv ? f + (this.fEnv - f) * this.aFast : f + (this.fEnv - f) * this.rSib;
        const r = this.sEnv / (this.fEnv + 1e-9);
        if (this.sEnv > 0.006 && r > 0.32) gd = lin(-Math.min(13 * deess, dB(r / 0.32) * 2.2 * deess));
      }
      this.gDe = gd < this.gDe ? gd + (this.gDe - gd) * this.dAtk : gd + (this.gDe - gd) * this.dRel;
      for (let c = 0; c < nch; c++) {
        const x = inp[c][i];
        const lo = run(this.lpC, this.lpS[c] || (this.lpS[c] = [0, 0]), x);
        out[c][i] = (lo + this.gDe * (x - lo)) * this.gGate;
      }
    }
    // entrada mono → salida estéreo
    for (let c = nch; c < out.length; c++) out[c].set(out[0]);
    return true;
  }
}

class DuckProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'amount', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' }];
  }
  constructor() {
    super();
    this.env = 0; this.g = 1; this.hold = 0;
    this.aEnv = smooth(8); this.rEnv = smooth(220);
    this.down = smooth(70); this.up = smooth(450);
    this.dt = 128 / sampleRate;
  }
  process(inputs, outputs, params) {
    const music = inputs[0], voice = inputs[1], out = outputs[0];
    const amount = params.amount[0];
    const n = out[0].length;
    let peak = 0;
    if (voice && voice.length) {
      for (let i = 0; i < n; i++) {
        let a = 0;
        for (let c = 0; c < voice.length; c++) a = Math.max(a, Math.abs(voice[c][i]));
        this.env = a > this.env ? a + (this.env - a) * this.aEnv : a + (this.env - a) * this.rEnv;
        if (this.env > peak) peak = this.env;
      }
    } else this.env = 0;
    if (amount > 0.001 && dB(peak) > -40) this.hold = 0.3;
    else if (this.hold > 0) this.hold -= this.dt;
    const target = amount > 0.001 && this.hold > 0 ? lin(-20 * amount) : 1;
    if (!music || !music.length) return true;
    for (let i = 0; i < n; i++) {
      this.g = target < this.g ? target + (this.g - target) * this.down : target + (this.g - target) * this.up;
      for (let c = 0; c < out.length; c++) out[c][i] = (music[c] || music[0])[i] * this.g;
    }
    return true;
  }
}

registerProcessor('tbs-voice', VoiceProcessor);
registerProcessor('tbs-duck', DuckProcessor);
