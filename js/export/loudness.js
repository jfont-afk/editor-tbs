// Audio para redes: sonoridad integrada (ITU-R BS.1770 / EBU R128) y limitador de picos.
// Instagram, TikTok y YouTube normalizan alrededor de −14 LUFS: si se entrega ya a ese nivel,
// la plataforma no baja ni sube el volumen y la voz suena clara y sin saturar.

function biquad(x, b, a) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

// Filtro de ponderación K (coeficientes para 48 kHz)
function kWeight(x) {
  const s1 = biquad(x, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]);
  return biquad(s1, [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]);
}

// Sonoridad integrada en LUFS (con puertas absoluta −70 y relativa −10)
export function measureLUFS(channels, sr = 48000) {
  const kw = channels.map(kWeight);
  const block = Math.round(0.4 * sr), step = Math.round(0.1 * sr);
  const zs = [];
  for (let s = 0; s + block <= kw[0].length; s += step) {
    let z = 0;
    for (const ch of kw) { let acc = 0; for (let i = s; i < s + block; i++) acc += ch[i] * ch[i]; z += acc / block; }
    zs.push(z);
  }
  const L = (z) => -0.691 + 10 * Math.log10(z);
  const abs = zs.filter(z => z > 0 && L(z) > -70);
  if (!abs.length) return -Infinity;
  const relGate = L(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter(z => L(z) > relGate);
  if (!gated.length) return -Infinity;
  return L(gated.reduce((a, b) => a + b, 0) / gated.length);
}

// Mínimo deslizante hacia delante (ventana de n muestras)
function slidingMinForward(a, n) {
  const out = new Float32Array(a.length);
  const dq = new Int32Array(a.length);
  let head = 0, tail = 0;
  for (let i = a.length - 1; i >= 0; i--) {
    while (tail > head && a[dq[tail - 1]] >= a[i]) tail--;
    dq[tail++] = i;
    while (dq[head] > i + n) head++;
    out[i] = a[dq[head]];
  }
  return out;
}

/**
 * Normaliza a `target` LUFS y limita los picos a `ceilingDb` (con anticipación de 5 ms).
 * Modifica los canales en el sitio. Devuelve { before, gainDb }.
 */
export function normalizeForSocial(channels, sr = 48000, target = -14, ceilingDb = -1.5, maxBoostDb = 12) {
  const before = measureLUFS(channels, sr);
  if (!isFinite(before)) return { before, gainDb: 0 };
  const gainDb = Math.min(maxBoostDb, target - before);
  const g = Math.pow(10, gainDb / 20);
  const n = channels[0].length;
  for (const ch of channels) for (let i = 0; i < n; i++) ch[i] *= g;
  // limitador
  const ceil = Math.pow(10, ceilingDb / 20);
  const req = new Float32Array(n);
  let over = false;
  for (let i = 0; i < n; i++) {
    let pk = 0;
    for (const ch of channels) { const v = Math.abs(ch[i]); if (v > pk) pk = v; }
    req[i] = pk > ceil ? ceil / pk : 1;
    if (pk > ceil) over = true;
  }
  if (over) {
    const look = Math.max(1, Math.round(0.005 * sr));
    const mn = slidingMinForward(req, look);
    // media móvil hacia atrás: la reducción empieza antes del pico y llega a tiempo
    const avg = new Float32Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) { sum += mn[i]; if (i >= look) sum -= mn[i - look]; avg[i] = sum / Math.min(i + 1, look); }
    const rel = Math.exp(-1 / (0.08 * sr));
    let gg = 1;
    for (let i = 0; i < n; i++) {
      const t = avg[i];
      gg = t < gg ? t : gg + (t - gg) * (1 - rel);
      if (gg < 0.9999) for (const ch of channels) ch[i] *= gg;
    }
  }
  return { before, gainDb };
}
