// Procesadores de audio (AudioWorklet). Se usan igual en la vista previa (AudioContext)
// y al exportar (OfflineAudioContext), así lo que se oye al reproducir es lo que sale en el MP4.
//  · tbs-voice: reducción de ruido de fondo (supresor espectral + RNNoise), suavizar eses (de-esser)
//               e igualar volumen (compresor guiado por la voz)
//  · tbs-duck: baja la música mientras se habla (entrada 0 = música, entrada 1 = voz)

const lin = (d) => Math.pow(10, d / 20);
const dB = (x) => 20 * Math.log10(x + 1e-9);
const smooth = (ms) => Math.exp(-1 / (sampleRate * ms / 1000));
const coef = (ms) => 1 - Math.exp(-1 / (sampleRate * ms / 1000));
// los campos de coma flotante empiezan con −0 (no es un entero pequeño): V8 los guarda como double desde el
// principio y no tiene que reoptimizar el código cuando pasan a tener decimales (picos de CPU al arrancar)
const D0 = -0;

// ---------- Reducción de ruido ----------
// STFT de 1024 muestras con salto de 384 y ventanas asimétricas de bajo retardo (Mauler y Martin, 2011):
// la de análisis sube despacio y cae en las últimas 384 muestras (resolución de 47 Hz, separa los armónicos
// de la voz) y la de síntesis solo ocupa las últimas 768; análisis × síntesis = Hann de 768, que con salto
// de 384 reconstruye exacto. Retardo: 768 muestras (16 ms a 48 kHz; fx.js: VOICE_LATENCY), así la voz va en
// sincronía con la imagen en la vista previa.
// Ruido estimado con IMCRA (Cohen 2003: mínimos suavizados en dos pasadas y promedio controlado por la
// probabilidad de voz) con techos por mínimos para no confundir la voz con ruido, detector de subidas
// bruscas (cambio de plano) y ganancia OM-LSA (log-espectral con probabilidad de voz y suelo).
// En paralelo, RNNoise (red neuronal de Xiph, 22 bandas) da otra ganancia por banda: se aplica la menor
// de las dos, así el ruido no estacionario (tráfico, gente, golpes) también baja y el arranque es inmediato.
// El trabajo de cada trama se reparte en los tres cuantos de 128 muestras de cada salto (análisis y aprendizaje,
// ganancia y síntesis, y uno libre) y cada trama de RNNoise en dos: sin picos de CPU.
const N = 1024, HOP = 384, K = N / 2 + 1, SYN = 2 * HOP;
// La ganancia se calcula por casilla hasta 8 kHz, por parejas hasta 16 kHz y de cuatro en cuatro por encima (ahí la
// voz no tiene armónicos que separar): 299 bandas en vez de 513 casillas, casi el mismo resultado con menos cálculo
const BAND = new Int32Array(K);
for (let k = 0; k < K; k++) BAND[k] = k < 171 ? k : k < 341 ? 171 + ((k - 171) >> 1) : 256 + ((k - 341) >> 2);
const NB = BAND[K - 1] + 1;
const BW = new Float64Array(NB), BC = new Float64Array(NB);   // casillas por banda y casilla central
for (let k = 0; k < K; k++) BW[BAND[k]]++;
for (let k = 0; k < K; k++) BC[BAND[k]] += k / BW[BAND[k]];

class RFFT {
  constructor(n) {
    const M = this.M = n >> 1;
    let bits = 0; while ((1 << bits) < M) bits++;
    this.rev = new Uint32Array(M);
    for (let i = 0; i < M; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); this.rev[i] = r; }
    // giros de cada etapa seguidos en memoria (cos, sen)
    this.tw = new Float64Array(2 * M);
    for (let size = 4, o = 2; size <= M; o += size, size <<= 1) {
      for (let j = 0; j < size >> 1; j++) { this.tw[o + 2 * j] = Math.cos(-2 * Math.PI * j / size); this.tw[o + 2 * j + 1] = Math.sin(-2 * Math.PI * j / size); }
    }
    this.wr = new Float64Array(M + 1); this.wi = new Float64Array(M + 1);
    for (let k = 0; k <= M; k++) { this.wr[k] = Math.cos(-2 * Math.PI * k / n); this.wi[k] = Math.sin(-2 * Math.PI * k / n); }
    this.zr = new Float64Array(M); this.zi = new Float64Array(M);
  }
  _fft(re, im, sg) {
    const M = this.M, rev = this.rev, tw = this.tw;
    for (let i = 0; i < M; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let a = 0; a < M; a += 2) { const b = a + 1, tr = re[b], ti = im[b]; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; }
    for (let size = 4, o = 2; size <= M; o += size, size <<= 1) {
      const half = size >> 1;
      for (let j = 0; j < half; j++) {
        const wr = tw[o + 2 * j], wi = sg * tw[o + 2 * j + 1];
        for (let a = j; a < M; a += size) {
          const b = a + half, xr = re[b], xi = im[b];
          const tr = xr * wr - xi * wi, ti = xr * wi + xi * wr, ar = re[a], ai = im[a];
          re[b] = ar - tr; im[b] = ai - ti; re[a] = ar + tr; im[a] = ai + ti;
        }
      }
    }
  }
  forward(x, oRe, oIm) {
    const M = this.M, zr = this.zr, zi = this.zi, wr = this.wr, wi = this.wi;
    for (let n = 0; n < M; n++) { zr[n] = x[2 * n]; zi[n] = x[2 * n + 1]; }
    this._fft(zr, zi, 1);
    oRe[0] = zr[0] + zi[0]; oIm[0] = 0; oRe[M] = zr[0] - zi[0]; oIm[M] = 0;
    for (let k = 1; k < M; k++) {
      const ar = zr[k], ai = zi[k], br = zr[M - k], bi = -zi[M - k];
      const er = 0.5 * (ar + br), ei = 0.5 * (ai + bi), dr = 0.5 * (ar - br), di = 0.5 * (ai - bi);
      oRe[k] = er + wr[k] * di + wi[k] * dr; oIm[k] = ei - wr[k] * dr + wi[k] * di;
    }
  }
  inverse(re, im, x) {
    const M = this.M, zr = this.zr, zi = this.zi, wr = this.wr, wi = this.wi;
    for (let k = 0; k < M; k++) {
      const ar = re[k], ai = im[k], br = re[M - k], bi = -im[M - k];
      const er = 0.5 * (ar + br), ei = 0.5 * (ai + bi), dr = 0.5 * (ar - br), di = 0.5 * (ai - bi);
      const tr = dr * wr[k] + di * wi[k], ti = di * wr[k] - dr * wi[k];
      zr[k] = er - ti; zi[k] = ei + tr;
    }
    this._fft(zr, zi, -1);
    const s = 1 / M;
    for (let n = 0; n < M; n++) { x[2 * n] = zr[n] * s; x[2 * n + 1] = zi[n] * s; }
  }
}

// exp(E1(v)/2) tabulada en escala logarítmica (ganancia LSA de Ephraim-Malah)
function expint(x) {
  if (x < 1) { let s = 0, t = 1; for (let k = 1; k < 40; k++) { t *= -x / k; s += t / k; } return -0.5772156649015329 - Math.log(x) - s; }
  let b = x + 1, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 300; i++) { const a = -i * i; b += 2; d = 1 / (a * d + b); c = b + a / c; const e = c * d; h *= e; if (Math.abs(e - 1) < 1e-12) break; }
  return h * Math.exp(-x);
}
const LSA_N = 1024, LSA_L0 = Math.log(1e-8), LSA_L1 = Math.log(60), LSA_S = LSA_N / (LSA_L1 - LSA_L0);
const LSA = new Float64Array(LSA_N + 2);
for (let i = 0; i <= LSA_N + 1; i++) LSA[i] = Math.exp(0.5 * expint(Math.exp(LSA_L0 + i / LSA_S)));
function lsaExp(v) {
  if (v <= 1e-8) return LSA[0];
  const p = (Math.log(v) - LSA_L0) * LSA_S;
  if (p >= LSA_N) return 1;
  const i = p | 0;
  return LSA[i] + (LSA[i + 1] - LSA[i]) * (p - i);
}
// e^y para y en [−16, 0] (tabla con interpolación lineal, error relativo < 2e-6; más rápida que Math.exp)
const EX_N = 4096, EX_L = -16, EX_S = EX_N / -EX_L, EXT = new Float64Array(EX_N + 2);
for (let i = 0; i <= EX_N + 1; i++) EXT[i] = Math.exp(EX_L + i / EX_S);
function texp(y) {
  if (y <= EX_L) return EXT[0];
  const p = (y - EX_L) * EX_S;
  if (p >= EX_N) return 1;
  const i = p | 0;
  return EXT[i] + (EXT[i + 1] - EXT[i]) * (p - i);
}
// mediana de los n primeros valores de a (los reordena; sin crear arrays)
function median(a, n) {
  let lo = 0, hi = n - 1;
  const k = n >> 1;
  while (hi > lo) {
    const pv = a[(lo + hi) >> 1];
    let i = lo, j = hi;
    while (i <= j) {
      while (a[i] < pv) i++;
      while (a[j] > pv) j--;
      if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; }
    }
    if (k <= j) hi = j; else if (k >= i) lo = i; else break;
  }
  return a[k];
}

// RNNoise (js/vendor/rnnoise.wasm, solo análisis): una instancia por contexto de audio, un estado por cadena
let RNN = null;
function rnnInstance(mod) {
  if (RNN !== null) return RNN;
  RNN = false;
  try {
    if (mod) {
      if (!(mod instanceof WebAssembly.Module)) mod = new WebAssembly.Module(mod);
      const inst = new WebAssembly.Instance(mod, { env: { log10: Math.log10, sin: Math.sin, cos: Math.cos } });
      const e = inst.exports;
      RNN = { e, pin: e.tbs_in() >> 2, pg: e.tbs_gains() >> 2, heap: null };
    }
  } catch (err) { RNN = false; }
  return RNN;
}
// bordes de las 22 bandas de RNNoise (Hz)
const RB = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 28, 34, 40, 48, 60, 78, 100].map(v => v * 200);

class Denoiser {
  constructor(rnnMod) {
    const F = () => new Float64Array(NB);
    this.fft = new RFFT(N);
    // ventanas: análisis (N), síntesis (últimas SYN muestras) y su producto (Hann de SYN)
    const A = N - HOP;
    this.wa = new Float64Array(N); this.ws = new Float64Array(SYN); this.hw = new Float64Array(SYN);
    for (let n = 0; n < N; n++) this.wa[n] = n < A ? Math.sqrt(0.5 - 0.5 * Math.cos(Math.PI * n / A)) : Math.sqrt(0.5 + 0.5 * Math.cos(Math.PI * (n - A) / HOP));
    for (let j = 0; j < SYN; j++) {
      const n = N - SYN + j, h = 0.5 - 0.5 * Math.cos(2 * Math.PI * j / SYN);
      this.hw[j] = h; this.ws[j] = n >= A ? this.wa[n] : h / this.wa[n];
    }
    // sin retardo extra (RD): la síntesis ya va 384 muestras por detrás de la trama, donde llegan las de RNNoise
    this.RD = 0; this.LL = N + this.RD; this.lat = SYN + this.RD;
    this.nch = 0; this.line = []; this.out = []; this.re = []; this.im = [];
    this.frame = new Float64Array(N);
    this.Y2 = new Float64Array(K); this.Yb = F(); this.G = F().fill(1); this.Gk = new Float64Array(K).fill(1); this.Gp = F().fill(1); this.Gc = F();
    this.S = F(); this.St = F(); this.Smin = F(); this.Stmp = F(); this.Stmin = F(); this.Sttmp = F(); this.I = F(); this.SY = F();
    this.lamb = F(); this.lam = F(); this.lamG = F(); this.ghPrev = F(); this.y2Prev = F(); this.xi = F(); this.gam = F();
    this.zeta = F(); this.zl = F(); this.zg = F(); this.cum = new Float64Array(NB + 1); this.h1 = F(); this.h2 = F();
    const hopMs = HOP / sampleRate * 1000;
    const sc = (a, refMs) => Math.pow(a, hopMs / refMs);
    const fr = (s) => Math.max(1, Math.round(s * 1000 / hopMs));
    // IMCRA (constantes de Cohen a 8 ms de salto, reescaladas) y OM-LSA
    this.as = sc(0.9, 8); this.ad = sc(0.85, 8); this.add = sc(0.92, 8); this.bz = sc(0.7, 8);
    this.Bmin = 1.556; this.beta = 1.47; // sesgos medidos con ruido blanco/rosa
    this.ximin = Math.pow(10, -2.5);
    this.U = 8; this.Vlong = Math.max(2, Math.round(fr(0.96) / 8)); this.Vshort = Math.max(2, Math.round(fr(0.25) / 8));
    this.start = fr(0.6);
    this.Sw = Array.from({ length: 8 }, () => F()); this.Stw = Array.from({ length: 8 }, () => F());
    this.vc = 0; this.ui = 0; this.frames = 0; this.m0 = 0; this.ready = false; this.learned = false; this.boot = false;
    this.zmin = 0.1; this.zmax = Math.pow(10, -0.5); this.lr = Math.log(this.zmax / this.zmin); this.qmax = 0.95;
    this.zfPrev = D0; this.zpeak = 1 + D0;
    // subidas bruscas del ruido (cambio de plano o de sitio)
    this.shV = Math.max(1, Math.round(fr(0.3) / 3)); this.shc = 0; this.shI = 0;
    this.shMin = [F().fill(Infinity), F().fill(Infinity), F().fill(Infinity)]; this.shMax = [F(), F(), F()];
    this.cMin = F().fill(Infinity); this.cMax = F();
    this.k0 = BAND[Math.round(300 * N / sampleRate)]; this.k1 = BAND[Math.min(K - 1, Math.round(10000 * N / sampleRate))];
    this.kv = BAND[Math.round(4000 * N / sampleRate)];
    // suelo de largo plazo (~2 s, periodograma poco suavizado): la voz siempre tiene pausas
    this.af = Math.exp(-hopMs / 20); this.Sf = F(); this.fcur = F().fill(Infinity); this.fmin = F().fill(Infinity);
    this.fwin = Array.from({ length: 8 }, () => F().fill(Infinity)); this.fV = Math.max(1, Math.round(fr(2) / 8)); this.fc = 0; this.fi = 0;
    this.quiet = 0; this.idle = 1e9; this.diff = 0; this.pos = 0; this.rsam = 0; this.att = -1 + D0; this.gmin = 1 + D0; this.lgmin = D0;
    this.pendB = false; this.mono = false; this.amt = D0; this.fEnd = 0; this.pv = -1 + D0; this.Pf = D0; this.vadWanted = false;
    // RNNoise
    const r = rnnInstance(rnnMod);
    this.rnn = r ? r : null;
    this.hasGr = false; this.vad = D0;
    if (this.rnn) {
      this.rst = r.e.tbs_create();
      this.racc = new Float32Array(480); this.rbuf = new Float32Array(480); this.rn = 0; this.rStep = 0; this.rPendEnd = 0;
      this.rEndA = -1e9; this.rEndB = -1e9; this.rCount = 0; this.rvA = D0; this.rvB = D0; this.agcL = D0; this.agcN = D0; this.agcOn = false; this.agcSp = false; this.pgDb = D0;
      this.rgA = new Float32Array(22).fill(1); this.rgB = new Float32Array(22).fill(1); this.rgi = new Float64Array(22);
      this.Gr = F();
    }
    this.rbi = new Int32Array(NB); this.rbf = F(); this.bnd = new Int32Array(NB);
    for (let b = 0; b < NB; b++) {
      const f = BC[b] * sampleRate / N;
      let i = 0; while (i < 20 && f >= RB[i + 1]) i++;
      if (f >= RB[21]) { this.rbi[b] = 20; this.rbf[b] = 1; } else { this.rbi[b] = i; this.rbf[b] = (f - RB[i]) / (RB[i + 1] - RB[i]); }
      this.bnd[b] = f >= RB[21] ? 21 : this.rbf[b] < 0.5 ? i : i + 1;   // banda de RNNoise más cercana (22)
    }
    this.bY = new Float64Array(22); this.bL = new Float64Array(22);
  }
  ensure(nch) {
    while (this.nch < nch) {
      // canal nuevo: copia del primero (no hay saltos si una fuente pasa de mono a estéreo)
      this.line.push(this.nch ? Float64Array.from(this.line[0]) : new Float64Array(this.LL));
      this.out.push(this.nch ? Float64Array.from(this.out[0]) : new Float64Array(SYN));
      this.re.push(this.nch ? Float64Array.from(this.re[0]) : new Float64Array(K)); this.im.push(this.nch ? Float64Array.from(this.im[0]) : new Float64Array(K));
      this.nch++;
    }
  }
  // un cuanto de 128 muestras: x = canales de entrada (o vacío), amount 0..1, y = canales de salida (salida retrasada this.lat)
  process(x, nIn, amount, y) {
    const nch = Math.max(1, Math.min(nIn, 2)), LL = this.LL;
    this.ensure(nch);
    let nz = false;
    for (let c = 0; c < this.nch; c++) {
      const L = this.line[c], src = x[Math.min(c, nIn - 1)];
      L.copyWithin(0, 128);
      const o = LL - 128;
      if (src) for (let i = 0; i < 128; i++) { const v = src[i]; L[o + i] = v; if (v !== 0) nz = true; }
      else L.fill(0, o);
    }
    // estéreo con los dos canales iguales (lo normal en un vídeo de móvil): se calcula uno solo
    if (this.nch === 2) {
      const a = x[0], b = x[1];
      let same = !!(a && b);
      if (same && a !== b) for (let i = 0; i < 128; i++) if (a[i] !== b[i]) { same = false; break; }
      this.diff = same ? this.diff + 128 : 0;
    }
    this.quiet = nz ? this.quiet + 128 : 0;          // muestras seguidas con señal
    // vuelve el sonido tras silencio digital (empieza un clip, con su fundido corto): RNNoise empieza 10 ms después,
    // si no toma la subida por el comienzo de una voz y deja pasar el ruido un buen rato
    if (nz && this.idle >= 480 && this.rnn) { this.rn = -480; this.rStep = 0; }
    this.idle = nz ? 0 : this.idle + 128;           // muestras seguidas de silencio digital
    const on = amount > 0.001;
    let stepA = false;
    // en silencio (elemento en pausa, fuera del clip) no se calcula nada cuando ya se ha vaciado todo
    if (this.idle < LL + SYN + N) {
      if ((on || this.vadWanted) && this.rnn) { this.rnnFeed(); if (this.rStep) this.rnnRun(); } else { this.rn = 0; this.rStep = 0; }
      // cuantos alternos: síntesis de la trama analizada en el anterior, o análisis de la siguiente
      if (this.pendB) this.synth();
      this.pos += 128;
      if (this.pos >= HOP) { this.pos = 0; stepA = true; }
    } else { this.rn = 0; this.rStep = 0; this.pendB = false; }
    this.rsam += 128;
    for (let c = 0; c < y.length; c++) {
      const ob = this.out[Math.min(c, this.nch - 1)], dst = y[c];
      for (let i = 0; i < 128; i++) dst[i] = ob[i];
    }
    for (let c = 0; c < this.nch; c++) { const ob = this.out[c]; ob.copyWithin(0, 128); ob.fill(0, SYN - 128); }
    if (stepA) this.analyze(on ? amount : 0);
  }
  // RNNoise analiza tramas de 480 muestras de la mezcla mono (escala de 16 bits); se guardan las dos últimas
  rnnFeed() {
    const nch = this.nch === 2 && this.diff >= 128 ? 1 : this.nch, o = this.LL - 128, acc = this.racc, w = 32768 / nch;
    for (let i = 0; i < 128; i++) {
      if (this.rn < 0) { this.rn++; continue; }
      let m = 0;
      for (let c = 0; c < nch; c++) m += this.line[c][o + i];
      acc[this.rn++] = m * w;
      if (this.rn === 480) {
        while (this.rStep) this.rnnRun();   // (no pasa: entre dos tramas hay tres cuantos)
        this.rbuf.set(acc); this.rPendEnd = this.rsam + i + 1; this.rStep = 1; this.rn = 0;
      }
    }
  }
  // una trama de RNNoise repartida en cuantos seguidos: 1) FFT, bandas y tono; 2) resto de características y
  // primeras capas de la red; 3) última capa (ganancias). Con dos pasos, 2) y 3) van juntos.
  rnnRun() {
    const r = this.rnn;
    if (!r.heap || r.heap.buffer !== r.e.memory.buffer) r.heap = new Float32Array(r.e.memory.buffer);
    const H = r.heap, step = this.rStep;
    if (step === 1) {
      // independiente del nivel de grabación: RNNoise recibe la voz a un nivel parecido. El nivel se sigue
      // solo cuando RNNoise ve voz; antes de la primera voz se supone que lo que suena es ruido 12 dB por debajo
      const x = this.rbuf;
      let e = 0; for (let j = 0; j < 480; j++) e += x[j] * x[j];
      const lv = 10 * Math.log10(e / 480 / 1073741824 + 1e-12);
      const sp = this.rvB > 0.6;
      if (e >= 1e-6) this.agcN = !this.agcOn || lv < this.agcN ? lv : this.agcN + 0.05;   // suelo (mínimo, sube 5 dB/s)
      if (e < 1e-6) { /* silencio digital (antes del clip, pausa del vídeo): no cuenta */ }
      else if (!this.agcOn) { this.agcOn = true; this.agcL = lv + 12; }
      else if (!this.agcSp) {
        // aún sin voz: el nivel supuesto sube enseguida con el ruido (el arranque del clip llega con un fundido corto)
        // y solo se pasa a seguir la voz cuando RNNoise ve voz que asoma sobre ese ruido
        if (sp && lv > this.agcL - 6) { this.agcSp = true; this.agcL = Math.max(lv, this.agcL - 12); }
        else this.agcL = Math.max(this.agcL + (lv + 12 - this.agcL) * 0.1, lv + 12);
      } else if (sp || lv > this.agcL) this.agcL += (lv - this.agcL) * (lv > this.agcL ? 0.2 : 0.01);
      else {
        // sin voz baja despacio hacia lo que suena, pero no más de 22 dB sobre el suelo de ruido: en una grabación
        // limpia las colas de reverberación siguen siendo voz; con ruido, el ruido no se presenta como si fuera voz
        const t = Math.max(lv, this.agcN + 22);
        if (t < this.agcL) this.agcL += (t - this.agcL) * 0.01;
      }
      if (!this.agcOn) this.agcL = lv + 12;
      const g = Math.pow(10, Math.max(-20, Math.min(30, -20 - this.agcL)) / 20);
      for (let j = 0, p = r.pin; j < 480; j++, p++) H[p] = x[j] * g;
      r.e.tbs_p1(this.rst);
      this.rStep = 2;
      return;
    }
    if (step === 2) {
      r.e.tbs_p2(this.rst);
    }
    this.rStep = 0;
    const v = r.e.tbs_p3(this.rst);
    const H2 = r.heap.buffer === r.e.memory.buffer ? H : (r.heap = new Float32Array(r.e.memory.buffer));
    this.rvA = this.rvB; this.rvB = v;
    const t = this.rgA; this.rgA = this.rgB; this.rgB = t;
    for (let j = 0, q = r.pg; j < 22; j++, q++) t[j] = H2[q];
    this.rEndA = this.rEndB; this.rEndB = this.rPendEnd; this.rCount++;
  }
  // primer cuanto de la trama: FFT de la ventana que acaba de llenarse y aprendizaje del ruido
  analyze(amount) {
    const mono = this.nch === 2 && this.diff >= this.LL;   // canales idénticos en toda la ventana y la línea de retardo
    const nch = mono ? 1 : this.nch, wa = this.wa, f = this.frame, Y2 = this.Y2;
    this.mono = mono; this.fEnd = this.rsam; this.amt = amount;
    if (amount <= 0) {
      // sin reducción: la trama sale tal cual (análisis × síntesis = Hann de 768, reconstrucción exacta) sin FFT
      const hw = this.hw, o = N - SYN;
      for (let c = 0; c < nch; c++) { const L = this.line[c], ob = this.out[c]; for (let j = 0; j < SYN; j++) ob[j] += L[o + j] * hw[j]; }
      if (mono) this.out[1].set(this.out[0]);
      return;
    }
    Y2.fill(0);
    for (let c = 0; c < nch; c++) {
      const L = this.line[c];
      for (let i = 0; i < N; i++) f[i] = L[i] * wa[i];
      this.fft.forward(f, this.re[c], this.im[c]);
      const re = this.re[c], im = this.im[c], w = 1 / nch;
      for (let k = 0; k < K; k++) Y2[k] += (re[k] * re[k] + im[k] * im[k]) * w;
    }
    const Yb = this.Yb;
    Yb.fill(0);
    for (let k = 0; k < K; k++) Yb[BAND[k]] += Y2[k];
    for (let b = 171; b < NB; b++) Yb[b] /= BW[b];
    const learn = this.quiet >= this.LL; // con silencio digital en la ventana se congela lo aprendido
    this.setAtt(amount);
    if (!this.ready && learn) this.init(Yb);
    if (this.ready && learn) { this.hasGr = this.rnnPrep(this.fEnd - this.RD - 400); this.learn(Yb); }
    if (this.ready) this.gainPrep(Yb);
    this.pendB = true;
  }
  // segundo cuanto: ganancia (OM-LSA y RNNoise) y síntesis de la trama
  synth() {
    this.pendB = false;
    const G = this.G, Gk = this.Gk, nch = this.mono ? 1 : this.nch;
    if (this.ready) this.gain(this.Yb); else G.fill(1);
    this.hasGr = this.rnnPrep(this.fEnd - this.RD - HOP);
    this.rnnGain(G);
    G[1] = Math.min(G[1], G[2]); G[0] = G[1];
    this.spikes(G);
    for (let k = 0; k < K; k++) Gk[k] = G[BAND[k]];
    const f = this.frame, ws = this.ws, o = N - SYN;
    for (let c = 0; c < nch; c++) {
      const re = this.re[c], im = this.im[c];
      for (let k = 0; k < K; k++) { re[k] *= Gk[k]; im[k] *= Gk[k]; }
      this.fft.inverse(re, im, f);
      const ob = this.out[c];
      for (let j = 0; j < SYN; j++) ob[j] += f[o + j] * ws[j];
    }
    if (this.mono) this.out[1].set(this.out[0]);
  }
  // picos aislados (ruido musical): una casilla no sube mucho por encima de sus vecinas ni de lo que tenía
  // en la trama anterior (la voz se sostiene en el tiempo o abarca varias casillas; un pitido de ruido, no)
  spikes(G) {
    const Gp = this.Gp, Gc = this.Gc, cap = 2.5;
    // sin RNNoise: en las bandas (las 22 de RNNoise) donde no asoma nada sobre el ruido, la ganancia se queda
    // cerca del suelo (con RNNoise, su ganancia por bandas ya hace esto)
    const bY = this.bY, bL = this.bL, bnd = this.bnd, Yb = this.Yb, lam = this.lamG, gmin = this.gmin, bc = 1.5;
    if (this.ready && !this.hasGr) {
      bY.fill(0); bL.fill(0);
      for (let k = 1; k < NB; k++) { const b = bnd[k], w = BW[k]; bY[b] += Yb[k] * w; bL[b] += lam[k] * w; }
      for (let b = 0; b < 22; b++) {
        const r = bY[b] / (bL[b] + 1e-30);          // SNR a posteriori de la banda (1 = solo ruido)
        bY[b] = r >= 3 ? Infinity : r <= 1.5 ? bc * gmin : bc * gmin * Math.pow(1 / (bc * gmin), (r - 1.5) / 1.5);
      }
      for (let k = 1; k < NB; k++) { const c = bY[bnd[k]]; if (G[k] > c) G[k] = c; }
    }
    Gc.set(G);
    for (let k = 2; k < NB - 2; k++) {
      const g = Gc[k];
      if (g < 4 * this.gmin) continue;
      let c = 0.25 * (Gc[k - 2] + Gc[k - 1] + Gc[k + 1] + Gc[k + 2]);
      const p = Gp[k - 1] > Gp[k + 1] ? Gp[k - 1] : Gp[k + 1];
      if (Gp[k] > c) c = Gp[k];
      if (p > c) c = p;
      c *= cap;
      if (g > c) G[k] = c;
    }
    Gp.set(G);
  }
  sm(Y2, k) {
    return (k <= 1 ? (2 * Y2[k] + Y2[k + 1]) / 3 : k === NB - 1 ? (2 * Y2[k] + Y2[k - 1]) / 3 : 0.25 * Y2[k - 1] + 0.5 * Y2[k] + 0.25 * Y2[k + 1]) + 1e-20;
  }
  // primeras tramas completas: media del espectro suavizado; el ruido empieza casi en cero y se aprende
  // desde abajo (si el clip empieza hablando no se toma la voz por ruido; RNNoise cubre el arranque)
  init(Y2) {
    const m = this.m0++, a = m / (m + 1), S = this.S;
    for (let k = 0; k < NB; k++) S[k] = m === 0 ? this.sm(Y2, k) : a * S[k] + (1 - a) * this.sm(Y2, k);
    if (this.m0 < 6) return;
    for (let k = 0; k < NB; k++) {
      const s = S[k];
      this.St[k] = this.Smin[k] = this.Stmp[k] = this.Stmin[k] = this.Sttmp[k] = this.Sf[k] = this.fcur[k] = this.fmin[k] = s;
      for (let u = 0; u < 8; u++) { this.Sw[u][k] = s; this.Stw[u][k] = s; }
      this.lamb[k] = s * 1e-3; this.lam[k] = this.lamG[k] = this.beta * this.lamb[k];
      this.ghPrev[k] = 1; this.y2Prev[k] = Y2[k]; this.zeta[k] = this.ximin; this.xi[k] = this.ximin;
    }
    this.ready = true; this.frames = 0; this.learned = false; this.boot = true;
  }
  learn(Y2) {
    const S = this.S, St = this.St, Smin = this.Smin, Stmp = this.Stmp, Stmin = this.Stmin, Sttmp = this.Sttmp;
    const I = this.I, lam = this.lam, lamb = this.lamb, as = this.as, Bmin = this.Bmin;
    this.frames++;
    const V = this.frames < this.start ? this.Vshort : this.Vlong;
    const cMin = this.cMin, cMax = this.cMax, Sf = this.Sf, af = this.af, fcur = this.fcur;
    // 1ª pasada: periodograma suavizado (tiempo y frecuencia) y sus mínimos
    const SY = this.SY;
    SY[0] = (2 * Y2[0] + Y2[1]) / 3 + 1e-20; SY[1] = (2 * Y2[1] + Y2[2]) / 3 + 1e-20; SY[NB - 1] = (2 * Y2[NB - 1] + Y2[NB - 2]) / 3 + 1e-20;
    for (let k = 2; k < NB - 1; k++) SY[k] = 0.25 * Y2[k - 1] + 0.5 * Y2[k] + 0.25 * Y2[k + 1] + 1e-20;
    for (let k = 0; k < NB; k++) {
      const sf = SY[k];
      const s = S[k] = as * S[k] + (1 - as) * sf;
      if (s < Smin[k]) Smin[k] = s;
      if (s < Stmp[k]) Stmp[k] = s;
      if (s < cMin[k]) cMin[k] = s;
      if (s > cMax[k]) cMax[k] = s;
      const q = Sf[k] = af * Sf[k] + (1 - af) * sf;
      if (q < fcur[k]) fcur[k] = q;
    }
    if (++this.fc >= this.fV) {
      this.fc = 0; this.fwin[this.fi].set(fcur); this.fi = (this.fi + 1) & 7; fcur.fill(Infinity);
      const fmin = this.fmin, fw = this.fwin;
      for (let k = 0; k < NB; k++) { let m = fw[0][k]; for (let j = 1; j < 8; j++) if (fw[j][k] < m) m = fw[j][k]; fmin[k] = m; }
    }
    // arranque: si el mínimo de los últimos 0,1–0,3 s queda por encima de lo estimado y el espectro es estable, el
    // ruido se fija de golpe (un clip que empieza sin voz aprende enseguida). Más tarde no se hace: con tráfico, un
    // coche que pasa parecía un cambio de plano y el ruido estimado se quedaba alto tapando la voz
    let relearn = false;
    if (++this.shc >= this.shV) {
      this.shc = 0; const i = this.shI; this.shI = (i + 1) % 3;
      this.shMin[i].set(cMin); cMin.fill(Infinity); this.shMax[i].set(cMax); cMax.fill(0);
      const st = this.boot && this.frames < this.start;
      if (st && this.frames > this.shV) {
        const h1 = this.h1, h2 = this.h2, a = this.shMin, b = this.shMax; let n = 0;
        for (let k = this.k0; k <= this.k1; k++) {
          const m = Math.min(a[0][k], a[1][k], a[2][k]), x = Math.max(b[0][k], b[1][k], b[2][k]);
          h1[n] = Bmin * m / lam[k]; h2[n] = x / m; n++;
        }
        if (median(h1, n) > 1 && median(h2, n) < 2.512) relearn = true; // no por debajo de lo estimado y variación < 4 dB
      }
    }
    if (relearn) {
      const a = this.shMin;
      for (let k = 0; k < NB; k++) {
        const m = Math.min(a[0][k], a[1][k], a[2][k], S[k]);
        Smin[k] = Stmp[k] = Stmin[k] = Sttmp[k] = St[k] = m;
        for (let u = 0; u < 8; u++) { this.Sw[u][k] = m; this.Stw[u][k] = m; }
        lamb[k] = Bmin * m; lam[k] = this.beta * lamb[k];
        this.fcur[k] = this.fmin[k] = m; Sf[k] = S[k];
      }
      for (let j = 0; j < 8; j++) this.fwin[j].fill(Infinity);
      this.frames = 1; this.vc = 0; this.learned = true; this.boot = false;
    }
    for (let k = 0; k < NB; k++) {
      const d = Bmin * Smin[k];
      I[k] = Y2[k] < 4.6 * d && S[k] < 1.67 * d ? 1 : 0;
    }
    // 2ª pasada: solo con las casillas sin voz
    for (let k = 0; k < NB; k++) {
      let num = 0.5 * I[k] * Y2[k], den = 0.5 * I[k];
      if (k > 1) { num += 0.25 * I[k - 1] * Y2[k - 1]; den += 0.25 * I[k - 1]; }
      if (k < NB - 1) { num += 0.25 * I[k + 1] * Y2[k + 1]; den += 0.25 * I[k + 1]; }
      const s = St[k] = as * St[k] + (1 - as) * (den > 0 ? num / den : St[k]);
      if (s < Stmin[k]) Stmin[k] = s;
      if (s < Sttmp[k]) Sttmp[k] = s;
    }
    if (++this.vc >= V) {
      this.vc = 0;
      const u = this.ui; this.ui = (u + 1) & 7;
      this.Sw[u].set(Stmp); this.Stw[u].set(Sttmp);
      const A = this.Sw, B = this.Stw;
      for (let k = 0; k < NB; k++) {
        let m1 = A[0][k], m2 = B[0][k];
        for (let v = 1; v < 8; v++) { if (A[v][k] < m1) m1 = A[v][k]; if (B[v][k] < m2) m2 = B[v][k]; }
        Smin[k] = m1; Stmin[k] = m2; Stmp[k] = S[k]; Sttmp[k] = St[k];
      }
    }
    // probabilidad de voz (IMCRA) y promedio del ruido, con techos: +3 dB sobre el mínimo reciente
    // y ~12 dB sobre el suelo de 2 s (armónicos sostenidos, voces muy monótonas)
    // ya aprendido (tras el arranque o un salto), donde RNNoise ve voz no se aprende ruido: una voz grave y sostenida no se toma por ruido
    if (this.frames >= this.start) this.learned = true;
    const ad = this.ad, add = this.add, fmin = this.fmin, capA = 2 * Bmin, Gr = this.hasGr && this.learned ? this.Gr : null;
    for (let k = 0; k < NB; k++) {
      const yv = Y2[k] + 1e-20, d = Bmin * Stmin[k];
      const gmn = yv / d, z = S[k] / d;
      let q = 0;
      if (z < 1.67) q = gmn <= 1 ? 1 : gmn < 3 ? (3 - gmn) * 0.5 : 0;
      let p = 1;
      if (q >= 1) p = 0;
      else if (q > 0) {
        const g = Math.min(yv / lam[k], 1e4);
        const x = Math.max(add * this.ghPrev[k] * this.ghPrev[k] * this.y2Prev[k] / lam[k] + (1 - add) * (g > 1 ? g - 1 : 0), this.ximin);
        p = 1 / (1 + q / (1 - q) * (1 + x) * Math.exp(-Math.min(g * x / (1 + x), 60)));
      }
      if (Gr) { const f = (Gr[k] - 0.2) * 3.333; if (f > p) p = f > 1 ? 1 : f; } // RNNoise ve voz en esta banda: no se aprende de ella
      const at = ad + (1 - ad) * p;
      let lb = at * lamb[k] + (1 - at) * yv;
      const c1 = capA * Smin[k]; if (lb > c1) lb = c1;
      const c2 = 16 * fmin[k]; if (lb > c2) lb = c2;
      lamb[k] = lb; lam[k] = this.beta * lb + 1e-30;
    }
  }
  // OM-LSA en dos partes: SNR a priori (dirigida por decisión) y su suavizado (en el cuanto del análisis)…
  gainPrep(Y2) {
    // el ruido que usa la ganancia baja como mucho ~16 dB/s: los mínimos momentáneos del estimador no abren huecos
    const lam = this.lamG, la = this.lam, dec = 0.98;
    for (let k = 0; k < NB; k++) { const v = lam[k] * dec; lam[k] = la[k] > v ? la[k] : v; }
    const xi = this.xi, gam = this.gam, add = this.add, zeta = this.zeta, bz = this.bz;
    const ghPrev = this.ghPrev, y2Prev = this.y2Prev, ximin = this.ximin, add1 = 1 - add, bz1 = 1 - bz;
    for (let k = 0; k < NB; k++) {
      const l = lam[k];
      let g = (Y2[k] + 1e-20) / l; if (g > 1e4) g = 1e4;
      gam[k] = g;
      const gp = ghPrev[k];
      let x = add * gp * gp * y2Prev[k] / l + add1 * (g > 1 ? g - 1 : 0); if (x < ximin) x = ximin;
      xi[k] = x;
      zeta[k] = bz * zeta[k] + bz1 * x;
    }
    // q̂ de OM-LSA: xi suavizado en frecuencia (local ±1, global ±10 casillas) y por trama
    const cum = this.cum, zl = this.zl, zg = this.zg;
    cum[0] = 0; for (let k = 0; k < NB; k++) cum[k + 1] = cum[k] + zeta[k];
    zl[0] = (2 * zeta[0] + zeta[1]) / 3; zl[NB - 1] = (2 * zeta[NB - 1] + zeta[NB - 2]) / 3;
    for (let k = 1; k < NB - 1; k++) zl[k] = 0.25 * zeta[k - 1] + 0.5 * zeta[k] + 0.25 * zeta[k + 1];
    for (let k = 0; k < NB; k++) {
      const a = k - 10 < 0 ? 0 : k - 10, b = k + 11 > NB ? NB : k + 11;
      zg[k] = (cum[b] - cum[a]) / (b - a);
    }
    const zmin = this.zmin, zmax = this.zmax;
    const zf = (cum[NB] - cum[3]) / (NB - 3);
    let Pf = 0;
    if (zf > zmin) {
      if (zf > this.zfPrev) { Pf = 1; this.zpeak = Math.min(Math.max(zf, 1), 10); }
      else { const lo = this.zpeak * zmin, hi = this.zpeak * zmax; Pf = zf <= lo ? 0 : zf >= hi ? 1 : Math.log(zf / lo) / Math.log(hi / lo); }
    }
    this.zfPrev = zf; this.Pf = Pf;
  }
  // …y probabilidad de voz y ganancia de cada casilla (en el cuanto de la síntesis)
  gain(Y2) {
    const xi = this.xi, gam = this.gam, zl = this.zl, zg = this.zg, G = this.G, ghPrev = this.ghPrev, y2Prev = this.y2Prev;
    const gmin = this.gmin, lgmin = this.lgmin, qmax = this.qmax, zmin = this.zmin, zmax = this.zmax, ilr = 1 / this.lr, Pf = this.Pf;
    const k0 = this.k0, kv = this.kv;
    let ps = 0;
    for (let k = 0; k < NB; k++) {
      let q = qmax;
      if (Pf > 0) {
        const a = zl[k], b = zg[k];
        const Pl = a <= zmin ? 0 : a >= zmax ? 1 : Math.log(a / zmin) * ilr;
        const Pg = b <= zmin ? 0 : b >= zmax ? 1 : Math.log(b / zmin) * ilr;
        q = 1 - Pl * Pg * Pf; if (q > qmax) q = qmax;
      }
      const x = xi[k], x1 = 1 + x, v = gam[k] * x / x1;
      const p = q <= 0 ? 1 : 1 / (1 + q / (1 - q) * x1 * texp(-v));
      if (k >= k0 && k <= kv) ps += p;
      let gh = x / x1 * lsaExp(v); if (gh > 1) gh = 1;
      ghPrev[k] = gh; y2Prev[k] = Y2[k];
      const gg = p > 0.999 ? gh : p < 0.001 ? gmin : texp(p * Math.log(gh > 1e-5 ? gh : 1e-5) + (1 - p) * lgmin);
      G[k] = gg < gmin ? gmin : gg;
    }
    this.pv = ps / (kv - k0 + 1);   // probabilidad media de voz en 300 Hz – 4 kHz (para el compresor sin RNNoise)
  }
  // atenuación máxima según la intensidad (0..1 -> 0..30 dB)
  setAtt(amount) {
    const att = 30 * amount;
    if (att !== this.att) { this.att = att; this.gmin = Math.pow(10, -att / 20); this.lgmin = Math.log(this.gmin); }
  }
  // ganancias de RNNoise interpoladas al instante tc (en this.Gr) y probabilidad de voz (this.vad).
  // Cada trama de RNNoise vale para la ventana de 960 muestras que acaba en rEnd (centro: rEnd − 480).
  rnnPrep(tc) {
    const cA = this.rEndA - 480, cB = this.rEndB - 480;
    if (!this.rnn || cB - cA !== 480 || tc - cB >= 960) return false;
    let w = (tc - cA) / 480; w = w < 0 ? 0 : w > 1 ? 1 : w;
    const gi = this.rgi, A = this.rgA, B = this.rgB;
    for (let i = 0; i < 22; i++) gi[i] = (1 - w) * A[i] + w * B[i];
    this.vad = (1 - w) * this.rvA + w * this.rvB;
    const bi = this.rbi, bf = this.rbf, Gr = this.Gr;
    for (let k = 0; k < NB; k++) { const i = bi[k], t = bf[k]; Gr[k] = (1 - t) * gi[i] + t * gi[i + 1]; }
    return true;
  }
  rnnGain(G) {
    if (!this.hasGr) return;
    const Gr = this.Gr, gmin = this.gmin;
    // grabación limpia (el suelo queda más de 45 dB por debajo de la voz): no hay ruido que quitar y RNNoise se
    // comería las colas de la reverberación de la sala; se deja de usar poco a poco (del todo a 55 dB)
    let w = this.agcSp ? (this.agcL - this.agcN - 45) / 10 : 0;
    w = w < 0 ? 0 : w > 1 ? 1 : w;
    // pausa sin voz según RNNoise: se baja todo un poco más (teclas, golpes, roces)
    const o = Math.min(1, Math.max(this.rvA, this.rvB) / 0.4);
    const tgt = 0.6 * this.att * (1 - o) * (1 - w);
    this.pgDb = tgt < this.pgDb ? tgt : this.pgDb + (tgt - this.pgDb) * 0.03;
    if (w >= 1 && this.pgDb < 0.05) return;
    const gx = this.pgDb > 0.05 ? Math.pow(10, -this.pgDb / 20) : 1;
    for (let k = 0; k < NB; k++) {
      let gr = Gr[k] + w * (1 - Gr[k]);
      if (gr < gmin) gr = gmin;
      let g = G[k] < gr ? G[k] : gr;
      g *= gx;
      G[k] = g < gmin ? gmin : g;
    }
  }
  // probabilidad de voz en lo que sale en este cuanto (para el compresor); −1 si no hay con qué saberlo
  vadOut() {
    if (this.rnn && (this.amt > 0 || this.vadWanted)) {
      const t = this.rsam - this.lat - 64, cB = this.rEndB - 480;
      if (this.rCount < 4 || t - cB >= 1440) return 0;      // aún sin tramas de RNNoise: se toma como pausa
      let w = (t - cB + 480) / 480; w = w < 0 ? 0 : w > 1 ? 1 : w;
      return (1 - w) * this.rvA + w * this.rvB;
    }
    if (this.amt > 0 && this.ready) return this.learned ? this.pv : 0;
    return -1;
  }
}

// ---------- igualar volumen ----------
// Compresor guiado por la voz: el umbral va relativo al nivel medio de la voz (igual con una grabación floja que
// con una fuerte), baja las partes fuertes y sube el conjunto lo que se ha bajado de media (más un poco según la
// intensidad). La ganancia solo se mueve mientras se habla; en las pausas se queda en la media de la voz y lo flojo
// no sube por encima de esa media, así el ruido que queda no sube respecto a la voz y sin voz no se amplifica nada.
class Leveler {
  constructor() {
    this.e = D0; this.gr = D0; this.gDb = D0; this.Psp = D0; this.nS = 0; this.gNum = D0; this.gDen = D0; this.fl = 100 + D0;
    this.cA = coef(2); this.cR = coef(60); this.kA = coef(4); this.kR = coef(180); this.kS = coef(3); this.kP = coef(150);
  }
  process(y, nch, comp, vad) {
    let pq = 0;
    for (let i = 0; i < 128; i++) { const m = nch === 2 ? 0.5 * (y[0][i] + y[1][i]) : y[0][i]; pq += m * m; }
    pq /= 128;
    const Lq = 10 * Math.log10(pq + 1e-12), lsp = this.nS ? 10 * Math.log10(this.Psp + 1e-12) : 0;
    // suelo (lo que queda del ruido; sube ~1 dB/s, baja enseguida; el silencio digital no cuenta)
    if (pq > 0) this.fl = Lq < this.fl ? Lq : this.fl + 0.003;
    // voz en primer plano: la red (o el supresor) ve voz, asoma sobre el suelo y no está muy por debajo de la voz
    const speech = comp > 0.001 && (vad >= 0 ? vad > 0.6 && Lq > this.fl + 10 : Lq > this.fl + 15) && (!this.nS || Lq > lsp - 10);
    // nivel de la voz: media de potencia (≈2 s); si llega voz mucho más fuerte (o lo primero no era voz) sube rápido
    if (speech) { this.nS++; const k = Lq > lsp + 6 ? 0.05 : 1 / Math.min(this.nS, 750); this.Psp += (pq - this.Psp) * k; }
    const on = this.nS > 0 && comp > 0.001;
    const T = on ? 10 * Math.log10(this.Psp + 1e-12) + 4 - 8 * comp : 0, s = 1 - 1 / (1 + 5 * comp), B = 12 * comp;
    const ga = on ? B - (this.gDen > 0 ? this.gNum / this.gDen : 0) : 0, top = ga + 1.5;
    const cA = this.cA, cR = this.cR, kA = this.kA, kR = this.kR, kG = speech ? this.kS : this.kP;
    let e = this.e, gr = this.gr, gDb = this.gDb, grs = 0;
    for (let i = 0; i < 128; i++) {
      const m = nch === 2 ? 0.5 * (y[0][i] + y[1][i]) : y[0][i], m2 = m * m;
      e += (m2 - e) * (m2 > e ? cA : cR);
      let r = 0;
      if (on) { const over = 10 * Math.log10(e + 1e-12) - T; r = over <= -4 ? 0 : over >= 4 ? over * s : (over + 4) * (over + 4) / 16 * s; }
      gr += (r - gr) * (r > gr ? kA : kR);
      grs += gr;
      let t = ga;
      if (speech) { t = B - gr; if (t > top) t = top; }
      gDb += (t - gDb) * kG;
      const g = Math.exp(gDb * 0.11512925464970229);
      for (let c = 0; c < nch; c++) y[c][i] *= g;
    }
    this.e = e; this.gr = gr; this.gDb = gDb;
    // reducción media de la voz (ponderada por su potencia): lo que se sube el conjunto
    if (speech) { const k = 1 / Math.min(this.nS, 750); this.gNum += (pq * grs / 128 - this.gNum) * k; this.gDen += (pq - this.gDen) * k; }
  }
}

// ---------- de-esser ----------
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

// Vista previa: al cargar se crea un procesador que solo pasa un trozo de ruido sintético por todo el cálculo,
// así V8 compila y optimiza el código antes de que suene nada (si no, los primeros segundos tienen picos de CPU)
let warmed = false;
function warmUp(rnnMod) {
  if (warmed) return;
  warmed = true;
  const d = new Denoiser(rnnMod), lev = new Leveler(), x = [new Float32Array(128)], y = [new Float32Array(128), new Float32Array(128)];
  let seed = 1;
  for (let q = 0; q < WARM_Q; q++) {
    const b = x[0];
    for (let i = 0; i < 128; i++) { seed = (seed * 1103515245 + 12345) >>> 0; b[i] = ((seed >>> 8) / 16777216 - 0.5) * (q > WARM_Q / 2 ? 0.2 : 0.02); }
    d.process(x, 1, 0.9, y);
    lev.process(y, 1, 0.5, q & 8 ? 0.9 : 0.1);
  }
}
const WARM_Q = 400;

class VoiceProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'gate', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },   // reducir ruido de fondo
      { name: 'deess', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'comp', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },   // igualar volumen
    ];
  }
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    // procesador que solo prepara el código al cargar (fx.js, vista previa): no procesa nada
    this.warmOnly = !!o.warm;
    if (this.warmOnly) { warmUp(o.rnnoise); return; }
    this.nr = new Denoiser(o.rnnoise);
    this.lev = new Leveler();
    this.tmp = [new Float32Array(128), new Float32Array(128)];
    this.lpC = biquad('lp', 5200, 0.707);
    this.bpC = biquad('bp', 7200, 1.1);
    this.lpS = [new Float64Array(2), new Float64Array(2)];
    this.bpS = new Float64Array(2);
    this.sEnv = D0; this.fEnv = D0; this.gDe = 1 + D0;
    this.aFast = smooth(1); this.rSib = smooth(40);
    this.dAtk = smooth(1.5); this.dRel = smooth(70);
  }
  process(inputs, outputs, params) {
    if (this.warmOnly) return false;
    const inp = inputs[0] || [], out = outputs[0];
    const gate = params.gate[0], deess = params.deess[0], comp = params.comp[0];
    const y = this.tmp;
    // 1) reducción de ruido (salida retrasada una cantidad fija: VOICE_LATENCY muestras)
    this.nr.vadWanted = comp > 0.001;
    this.nr.process(inp, inp.length, gate, y);
    const nch = Math.max(1, Math.min(inp.length, 2));
    // 2) de-esser: si la banda de las eses domina, se baja solo la parte aguda
    for (let i = 0; i < 128; i++) {
      let m = 0;
      for (let c = 0; c < nch; c++) m += y[c][i];
      m /= nch;
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
        const x = y[c][i];
        const lo = run(this.lpC, this.lpS[c], x);
        out[c][i] = lo + this.gDe * (x - lo);
      }
    }
    // 3) igualar volumen (después de quitar el ruido)
    if (comp > 0.001 || Math.abs(this.lev.gDb) > 0.01) this.lev.process(out, nch, comp, this.nr.vadOut());
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
    this.env = D0; this.g = 1 + D0; this.hold = D0;
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
