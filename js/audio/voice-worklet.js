// Procesadores de audio (AudioWorklet). Se usan igual en la vista previa (AudioContext)
// y al exportar (OfflineAudioContext), así lo que se oye al reproducir es lo que sale en el MP4.
//  · tbs-voice: reducción de ruido de fondo (supresor espectral + RNNoise) + suavizar eses (de-esser)
//  · tbs-duck: baja la música mientras se habla (entrada 0 = música, entrada 1 = voz)

const lin = (d) => Math.pow(10, d / 20);
const dB = (x) => 20 * Math.log10(x + 1e-9);
const smooth = (ms) => Math.exp(-1 / (sampleRate * ms / 1000));

// ---------- Reducción de ruido ----------
// STFT de 1024 muestras con salto de 256 (ventana raíz de Hann: reconstrucción perfecta).
// Ruido estimado con IMCRA (Cohen 2003: mínimos suavizados en dos pasadas y promedio controlado por la
// probabilidad de voz) con techos por mínimos para no confundir la voz con ruido, detector de subidas
// bruscas (cambio de plano) y ganancia OM-LSA (log-espectral con probabilidad de voz y suelo).
// En paralelo, RNNoise (red neuronal de Xiph, 22 bandas) da otra ganancia por banda: se aplica la menor
// de las dos, así el ruido no estacionario (tráfico, gente, golpes) también baja y el arranque es inmediato.
// Latencia fija: N - 128 (STFT) + 480 (para centrar las tramas de RNNoise) = 1376 muestras.
const N = 1024, HOP = 256, K = N / 2 + 1, RD = 480; // latencia = N - 128 + RD (fx.js: VOICE_LATENCY)

class RFFT {
  constructor(n) {
    const M = this.M = n >> 1;
    let bits = 0; while ((1 << bits) < M) bits++;
    this.rev = new Uint32Array(M);
    for (let i = 0; i < M; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); this.rev[i] = r; }
    this.cs = new Float64Array(M >> 1); this.sn = new Float64Array(M >> 1);
    for (let i = 0; i < (M >> 1); i++) { this.cs[i] = Math.cos(-2 * Math.PI * i / M); this.sn[i] = Math.sin(-2 * Math.PI * i / M); }
    this.wr = new Float64Array(M + 1); this.wi = new Float64Array(M + 1);
    for (let k = 0; k <= M; k++) { this.wr[k] = Math.cos(-2 * Math.PI * k / n); this.wi[k] = Math.sin(-2 * Math.PI * k / n); }
    this.zr = new Float64Array(M); this.zi = new Float64Array(M);
  }
  _fft(re, im, sg) {
    const M = this.M, rev = this.rev, cs = this.cs, sn = this.sn;
    for (let i = 0; i < M; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= M; size <<= 1) {
      const half = size >> 1, step = M / size;
      for (let s = 0; s < M; s += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = s + j, b = a + half, wr = cs[k], wi = sg * sn[k];
          const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
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
    const F = () => new Float64Array(K);
    this.fft = new RFFT(N);
    this.win = new Float64Array(N);
    for (let i = 0; i < N; i++) this.win[i] = Math.sqrt(0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
    this.ola = HOP / (N / 2);
    this.nch = 0; this.line = []; this.out = []; this.re = []; this.im = [];
    this.frame = new Float64Array(N);
    this.Y2 = F(); this.G = F().fill(1);
    this.S = F(); this.St = F(); this.Smin = F(); this.Stmp = F(); this.Stmin = F(); this.Sttmp = F(); this.I = F();
    this.lamb = F(); this.lam = F(); this.ghPrev = F(); this.y2Prev = F(); this.xi = F(); this.gam = F();
    this.zeta = F(); this.zl = F(); this.zg = F(); this.cum = new Float64Array(K + 1); this.h1 = F(); this.h2 = F();
    const hopMs = HOP / sampleRate * 1000;
    const sc = (a, refMs) => Math.pow(a, hopMs / refMs);
    const fr = (s) => Math.max(1, Math.round(s * 1000 / hopMs));
    // IMCRA (constantes de Cohen a 8 ms de salto, reescaladas) y OM-LSA
    this.as = sc(0.9, 8); this.ad = sc(0.85, 8); this.add = sc(0.92, 8); this.bz = sc(0.7, 8);
    this.Bmin = 1.556; this.beta = 1.47; // sesgos medidos con ruido blanco/rosa para esta ventana
    this.ximin = Math.pow(10, -2.5);
    this.U = 8; this.Vlong = Math.max(2, Math.round(fr(0.96) / 8)); this.Vshort = Math.max(2, Math.round(fr(0.25) / 8));
    this.start = fr(0.6);
    this.Sw = Array.from({ length: 8 }, () => F()); this.Stw = Array.from({ length: 8 }, () => F());
    this.vc = 0; this.ui = 0; this.frames = 0; this.m0 = 0; this.ready = false;
    this.zmin = 0.1; this.zmax = Math.pow(10, -0.5); this.lr = Math.log(this.zmax / this.zmin); this.qmax = 0.95;
    this.zfPrev = 0; this.zpeak = 1;
    // subidas bruscas del ruido (cambio de plano o de sitio)
    this.shV = Math.max(1, Math.round(fr(0.3) / 3)); this.shc = 0; this.shI = 0;
    this.shMin = [F().fill(Infinity), F().fill(Infinity), F().fill(Infinity)]; this.shMax = [F(), F(), F()];
    this.cMin = F().fill(Infinity); this.cMax = F();
    this.k0 = Math.round(300 * N / sampleRate); this.k1 = Math.min(K - 1, Math.round(10000 * N / sampleRate));
    // suelo de largo plazo (~2 s, periodograma poco suavizado): la voz siempre tiene pausas
    this.af = Math.exp(-hopMs / 20); this.Sf = F(); this.fcur = F().fill(Infinity); this.fmin = F().fill(Infinity);
    this.fwin = Array.from({ length: 8 }, () => F().fill(Infinity)); this.fV = Math.max(1, Math.round(fr(2) / 8)); this.fc = 0; this.fi = 0;
    this.quiet = 0; this.idle = 1e9; this.pos = 0; this.rsam = 0; this.att = -1; this.gmin = 1; this.lgmin = 0;
    // RNNoise
    const r = rnnInstance(rnnMod);
    this.rnn = r ? r : null;
    if (this.rnn) {
      this.rst = r.e.tbs_create();
      this.racc = new Float32Array(480); this.rn = 0; this.rEndA = -1e9; this.rEndB = -1e9;
      this.rgA = new Float32Array(22).fill(1); this.rgB = new Float32Array(22).fill(1); this.rgi = new Float64Array(22);
      this.rbi = new Int32Array(K); this.rbf = new Float64Array(K);
      for (let k = 0; k < K; k++) {
        const f = k * sampleRate / N;
        let i = 0; while (i < 20 && f >= RB[i + 1]) i++;
        if (f >= RB[21]) { this.rbi[k] = 20; this.rbf[k] = 1; } else { this.rbi[k] = i; this.rbf[k] = (f - RB[i]) / (RB[i + 1] - RB[i]); }
      }
    }
  }
  ensure(nch) {
    while (this.nch < nch) {
      // canal nuevo: copia del primero (no hay saltos si una fuente pasa de mono a estéreo)
      this.line.push(this.nch ? Float64Array.from(this.line[0]) : new Float64Array(N + RD));
      this.out.push(this.nch ? Float64Array.from(this.out[0]) : new Float64Array(N));
      this.re.push(new Float64Array(K)); this.im.push(new Float64Array(K));
      this.nch++;
    }
  }
  // un cuanto de 128 muestras: x = canales de entrada (o vacío), amount 0..1, y = canales de salida (salida retrasada VOICE_LATENCY)
  process(x, nIn, amount, y) {
    const nch = Math.max(1, Math.min(nIn, 2));
    this.ensure(nch);
    let nz = false;
    for (let c = 0; c < this.nch; c++) {
      const L = this.line[c], src = x[Math.min(c, nIn - 1)];
      L.copyWithin(0, 128);
      const o = N + RD - 128;
      if (src) for (let i = 0; i < 128; i++) { const v = src[i]; L[o + i] = v; if (v !== 0) nz = true; }
      else L.fill(0, o);
    }
    this.quiet = nz ? this.quiet + 128 : 0;          // muestras seguidas con señal
    this.idle = nz ? 0 : this.idle + 128;           // muestras seguidas de silencio digital
    const on = amount > 0.001;
    // en silencio (elemento en pausa, fuera del clip) no se calcula nada cuando ya se ha vaciado todo
    if (this.idle < N + RD + N) {
      if (on && this.rnn) this.rnnFeed(); else this.rn = 0;
      this.pos += 128;
      if (this.pos >= HOP) { this.pos = 0; this.frameStep(on ? amount : 0); }
    } else this.rn = 0;
    this.rsam += 128;
    for (let c = 0; c < y.length; c++) {
      const ob = this.out[Math.min(c, this.nch - 1)], dst = y[c];
      for (let i = 0; i < 128; i++) dst[i] = ob[i];
    }
    for (let c = 0; c < this.nch; c++) { const ob = this.out[c]; ob.copyWithin(0, 128); ob.fill(0, N - 128); }
  }
  // RNNoise analiza tramas de 480 muestras de la mezcla mono (escala de 16 bits); se guardan las dos últimas
  rnnFeed() {
    const r = this.rnn, nch = this.nch, o = N + RD - 128;
    for (let i = 0; i < 128; i++) {
      let m = 0;
      for (let c = 0; c < nch; c++) m += this.line[c][o + i];
      this.racc[this.rn++] = m / nch * 32768;
      if (this.rn === 480) {
        if (!r.heap || r.heap.buffer !== r.e.memory.buffer) r.heap = new Float32Array(r.e.memory.buffer);
        r.heap.set(this.racc, r.pin);
        r.e.tbs_analyze(this.rst);
        const t = this.rgA; this.rgA = this.rgB; this.rgB = t;
        this.rgB.set(r.heap.subarray(r.pg, r.pg + 22));
        this.rEndA = this.rEndB; this.rEndB = this.rsam + i + 1;
        this.rn = 0;
      }
    }
  }
  frameStep(amount) {
    const nch = this.nch, win = this.win, f = this.frame, Y2 = this.Y2;
    Y2.fill(0);
    for (let c = 0; c < nch; c++) {
      const L = this.line[c];
      for (let i = 0; i < N; i++) f[i] = L[i] * win[i];
      this.fft.forward(f, this.re[c], this.im[c]);
      const re = this.re[c], im = this.im[c], w = 1 / nch;
      for (let k = 0; k < K; k++) Y2[k] += (re[k] * re[k] + im[k] * im[k]) * w;
    }
    const G = this.G;
    if (amount > 0) {
      const learn = this.quiet >= N + RD; // con silencio digital en la ventana se congela lo aprendido
      if (!this.ready && learn) this.init(Y2);
      if (this.ready) {
        if (learn) this.learn(Y2);
        this.gain(Y2, amount);
      } else { G.fill(1); this.setAtt(amount); }
      this.rnnGain(G);
      G[1] = Math.min(G[1], G[2]); G[0] = G[1]; G[K - 1] = G[K - 2];
    } else G.fill(1);
    for (let c = 0; c < nch; c++) {
      const re = this.re[c], im = this.im[c];
      for (let k = 0; k < K; k++) { re[k] *= G[k]; im[k] *= G[k]; }
      this.fft.inverse(re, im, f);
      const ob = this.out[c], s = this.ola;
      for (let i = 0; i < N; i++) ob[i] += f[i] * win[i] * s;
    }
  }
  sm(Y2, k) {
    return (k <= 1 ? (2 * Y2[k] + Y2[k + 1]) / 3 : k === K - 1 ? (2 * Y2[k] + Y2[k - 1]) / 3 : 0.25 * Y2[k - 1] + 0.5 * Y2[k] + 0.25 * Y2[k + 1]) + 1e-20;
  }
  // primeras tramas completas: media del espectro suavizado; el ruido empieza casi en cero y se aprende
  // desde abajo (si el clip empieza hablando no se toma la voz por ruido; RNNoise cubre el arranque)
  init(Y2) {
    const m = this.m0++, a = m / (m + 1), S = this.S;
    for (let k = 0; k < K; k++) S[k] = m === 0 ? this.sm(Y2, k) : a * S[k] + (1 - a) * this.sm(Y2, k);
    if (this.m0 < 6) return;
    for (let k = 0; k < K; k++) {
      const s = S[k];
      this.St[k] = this.Smin[k] = this.Stmp[k] = this.Stmin[k] = this.Sttmp[k] = this.Sf[k] = this.fcur[k] = this.fmin[k] = s;
      for (let u = 0; u < 8; u++) { this.Sw[u][k] = s; this.Stw[u][k] = s; }
      this.lamb[k] = s * 1e-3; this.lam[k] = this.beta * this.lamb[k];
      this.ghPrev[k] = 1; this.y2Prev[k] = Y2[k]; this.zeta[k] = this.ximin; this.xi[k] = this.ximin;
    }
    this.ready = true; this.frames = 0;
  }
  median(a, n) { const s = a.subarray(0, n); s.sort(); return s[n >> 1]; }
  learn(Y2) {
    const S = this.S, St = this.St, Smin = this.Smin, Stmp = this.Stmp, Stmin = this.Stmin, Sttmp = this.Sttmp;
    const I = this.I, lam = this.lam, lamb = this.lamb, as = this.as, Bmin = this.Bmin;
    this.frames++;
    const V = this.frames < this.start ? this.Vshort : this.Vlong;
    const cMin = this.cMin, cMax = this.cMax, Sf = this.Sf, af = this.af, fcur = this.fcur;
    // 1ª pasada: periodograma suavizado (tiempo y frecuencia) y sus mínimos
    for (let k = 0; k < K; k++) {
      const sf = this.sm(Y2, k);
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
      for (let k = 0; k < K; k++) { let m = fw[0][k]; for (let j = 1; j < 8; j++) if (fw[j][k] < m) m = fw[j][k]; fmin[k] = m; }
    }
    // subida brusca: el mínimo de los últimos ~0,3 s supera claramente lo estimado y el espectro es estable
    let relearn = false;
    if (++this.shc >= this.shV) {
      this.shc = 0; const i = this.shI; this.shI = (i + 1) % 3;
      this.shMin[i].set(cMin); cMin.fill(Infinity); this.shMax[i].set(cMax); cMax.fill(0);
      if (this.frames > this.shV * 3) {
        const h1 = this.h1, h2 = this.h2, a = this.shMin, b = this.shMax; let n = 0;
        for (let k = this.k0; k <= this.k1; k++) {
          const m = Math.min(a[0][k], a[1][k], a[2][k]), x = Math.max(b[0][k], b[1][k], b[2][k]);
          h1[n] = Bmin * m / lam[k]; h2[n] = x / m; n++;
        }
        if (this.median(h1, n) > 3 && this.median(h2, n) < 2.512) relearn = true; // > +4,8 dB y variación < 4 dB
      }
    }
    if (relearn) {
      const a = this.shMin;
      for (let k = 0; k < K; k++) {
        const m = Math.min(a[0][k], a[1][k], a[2][k], S[k]);
        Smin[k] = Stmp[k] = Stmin[k] = Sttmp[k] = St[k] = m;
        for (let u = 0; u < 8; u++) { this.Sw[u][k] = m; this.Stw[u][k] = m; }
        lamb[k] = Bmin * m; lam[k] = this.beta * lamb[k];
        this.fcur[k] = this.fmin[k] = m; Sf[k] = S[k];
      }
      for (let j = 0; j < 8; j++) this.fwin[j].fill(Infinity);
      this.frames = 1; this.vc = 0;
    }
    for (let k = 0; k < K; k++) {
      const d = Bmin * Smin[k];
      I[k] = Y2[k] < 4.6 * d && S[k] < 1.67 * d ? 1 : 0;
    }
    // 2ª pasada: solo con las casillas sin voz
    for (let k = 0; k < K; k++) {
      let num = 0.5 * I[k] * Y2[k], den = 0.5 * I[k];
      if (k > 1) { num += 0.25 * I[k - 1] * Y2[k - 1]; den += 0.25 * I[k - 1]; }
      if (k < K - 1) { num += 0.25 * I[k + 1] * Y2[k + 1]; den += 0.25 * I[k + 1]; }
      const s = St[k] = as * St[k] + (1 - as) * (den > 0 ? num / den : St[k]);
      if (s < Stmin[k]) Stmin[k] = s;
      if (s < Sttmp[k]) Sttmp[k] = s;
    }
    if (++this.vc >= V) {
      this.vc = 0;
      const u = this.ui; this.ui = (u + 1) & 7;
      this.Sw[u].set(Stmp); this.Stw[u].set(Sttmp);
      const A = this.Sw, B = this.Stw;
      for (let k = 0; k < K; k++) {
        let m1 = A[0][k], m2 = B[0][k];
        for (let v = 1; v < 8; v++) { if (A[v][k] < m1) m1 = A[v][k]; if (B[v][k] < m2) m2 = B[v][k]; }
        Smin[k] = m1; Stmin[k] = m2; Stmp[k] = S[k]; Sttmp[k] = St[k];
      }
    }
    // probabilidad de voz (IMCRA) y promedio del ruido, con techos: +3 dB sobre el mínimo reciente
    // y ~12 dB sobre el suelo de 2 s (armónicos sostenidos, voces muy monótonas)
    const ad = this.ad, add = this.add, fmin = this.fmin, capA = 2 * Bmin;
    for (let k = 0; k < K; k++) {
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
      const at = ad + (1 - ad) * p;
      let lb = at * lamb[k] + (1 - at) * yv;
      const c1 = capA * Smin[k]; if (lb > c1) lb = c1;
      const c2 = 16 * fmin[k]; if (lb > c2) lb = c2;
      lamb[k] = lb; lam[k] = this.beta * lb + 1e-30;
    }
  }
  gain(Y2, amount) {
    const lam = this.lam, xi = this.xi, gam = this.gam, add = this.add, zeta = this.zeta, bz = this.bz, G = this.G;
    this.setAtt(amount);
    const gmin = this.gmin, lgmin = this.lgmin;
    for (let k = 0; k < K; k++) {
      const g = Math.min((Y2[k] + 1e-20) / lam[k], 1e4);
      gam[k] = g;
      const x = Math.max(add * this.ghPrev[k] * this.ghPrev[k] * this.y2Prev[k] / lam[k] + (1 - add) * (g > 1 ? g - 1 : 0), this.ximin);
      xi[k] = x;
      zeta[k] = bz * zeta[k] + (1 - bz) * x;
    }
    // q̂ de OM-LSA: xi suavizado en frecuencia (local ±1, global ±10 casillas) y por trama
    const cum = this.cum, zl = this.zl, zg = this.zg;
    cum[0] = 0; for (let k = 0; k < K; k++) cum[k + 1] = cum[k] + zeta[k];
    for (let k = 0; k < K; k++) {
      zl[k] = k === 0 ? (2 * zeta[0] + zeta[1]) / 3 : k === K - 1 ? (2 * zeta[k] + zeta[k - 1]) / 3 : 0.25 * zeta[k - 1] + 0.5 * zeta[k] + 0.25 * zeta[k + 1];
      const a = k - 10 < 0 ? 0 : k - 10, b = k + 11 > K ? K : k + 11;
      zg[k] = (cum[b] - cum[a]) / (b - a);
    }
    const zmin = this.zmin, zmax = this.zmax, lr = this.lr;
    const zf = (cum[K] - cum[3]) / (K - 3);
    let Pf = 0;
    if (zf > zmin) {
      if (zf > this.zfPrev) { Pf = 1; this.zpeak = Math.min(Math.max(zf, 1), 10); }
      else { const lo = this.zpeak * zmin, hi = this.zpeak * zmax; Pf = zf <= lo ? 0 : zf >= hi ? 1 : Math.log(zf / lo) / Math.log(hi / lo); }
    }
    this.zfPrev = zf;
    for (let k = 0; k < K; k++) {
      const a = zl[k], b = zg[k];
      const Pl = a <= zmin ? 0 : a >= zmax ? 1 : Math.log(a / zmin) / lr;
      const Pg = b <= zmin ? 0 : b >= zmax ? 1 : Math.log(b / zmin) / lr;
      let q = 1 - Pl * Pg * Pf; if (q > this.qmax) q = this.qmax;
      const x = xi[k], v = gam[k] * x / (1 + x);
      const p = q <= 0 ? 1 : 1 / (1 + q / (1 - q) * (1 + x) * Math.exp(-Math.min(v, 60)));
      let gh = x / (1 + x) * lsaExp(v); if (gh > 1) gh = 1;
      this.ghPrev[k] = gh; this.y2Prev[k] = Y2[k];
      let gg = p > 0.999 ? gh : p < 0.001 ? gmin : Math.exp(p * Math.log(gh > 1e-5 ? gh : 1e-5) + (1 - p) * lgmin);
      G[k] = gg < gmin ? gmin : gg;
    }
  }
  // atenuación máxima según la intensidad (0..1 -> 0..30 dB)
  setAtt(amount) {
    const att = 30 * amount;
    if (att !== this.att) { this.att = att; this.gmin = Math.pow(10, -att / 20); this.lgmin = Math.log(this.gmin); }
  }
  // RNNoise: ganancia por banda interpolada al centro de esta trama; se queda la menor de las dos
  // (la trama STFT está centrada en rsam + 128 - RD - N/2; cada trama de RNNoise, 480 antes de su final)
  rnnGain(G) {
    const center = this.rsam + 128 - RD - N / 2, cA = this.rEndA - 480, cB = this.rEndB - 480;
    if (!this.rnn || cB - cA !== 480 || center - cB >= 480) return;
    let w = (center - cA) / 480; w = w < 0 ? 0 : w > 1 ? 1 : w;
    const gi = this.rgi, A = this.rgA, B = this.rgB, gmin = this.gmin;
    for (let i = 0; i < 22; i++) gi[i] = (1 - w) * A[i] + w * B[i];
    const bi = this.rbi, bf = this.rbf;
    for (let k = 0; k < K; k++) {
      const i = bi[k], t = bf[k];
      let gr = (1 - t) * gi[i] + t * gi[i + 1];
      if (gr < gmin) gr = gmin;
      if (gr < G[k]) G[k] = gr;
    }
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

class VoiceProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'gate', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },   // reducir ruido de fondo
      { name: 'deess', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.nr = new Denoiser(o.rnnoise);
    this.tmp = [new Float32Array(128), new Float32Array(128)];
    this.lpC = biquad('lp', 5200, 0.707);
    this.bpC = biquad('bp', 7200, 1.1);
    this.lpS = [[0, 0], [0, 0]];
    this.bpS = [0, 0];
    this.sEnv = 0; this.fEnv = 0; this.gDe = 1;
    this.aFast = smooth(1); this.rSib = smooth(40);
    this.dAtk = smooth(1.5); this.dRel = smooth(70);
  }
  process(inputs, outputs, params) {
    const inp = inputs[0] || [], out = outputs[0];
    const gate = params.gate[0], deess = params.deess[0];
    const y = this.tmp;
    // 1) reducción de ruido (salida retrasada una cantidad fija: VOICE_LATENCY muestras)
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
