import { clamp } from '../lib.js';

export const ease = {
  linear: (t) => t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  outBack: (t, s = 1.7) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  outElastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1),
  inCubic: (t) => t * t * t,
  // muelle amortiguado (suave y profesional, sin rebote exagerado)
  spring: (t, k = 0.35) => (t >= 1 ? 1 : 1 - Math.exp(-6.5 * t) * Math.cos(t * Math.PI * (1 + k) * 1.4)),
};

// Animaciones que se calculan letra a letra
export const LETTER_ANIMS = new Set(['letters', 'wave', 'tracking']);

// Estado de animación de entrada para un progreso p (0..1). i = índice para alternar direcciones.
export function animIn(type, p, i = 0, size = 60) {
  const s = { alpha: 1, scale: 1, sx: 1, sy: 1, dx: 0, dy: 0, rot: 0, blur: 0, glow: 1, clipUp: 0 };
  if (p >= 1 || type === 'none') return s;
  p = Math.max(0, p);
  const e = ease.outCubic(p);
  const x = ease.outExpo(p);
  switch (type) {
    case 'fade': s.alpha = ease.inOutCubic(p); break;
    case 'soft': s.alpha = e; s.dy = (1 - x) * size * 0.22; break;
    case 'lift': s.alpha = clamp(p * 2.2, 0, 1); s.dy = (1 - ease.outQuint(p)) * size * 0.55; break;
    case 'drop': s.alpha = clamp(p * 2, 0, 1); s.dy = -(1 - e) * size * 0.6; s.blur = (1 - e) * size * 0.1; break;
    case 'pop': s.alpha = clamp(p * 3, 0, 1); s.scale = 0.6 + 0.4 * ease.outBack(p, 1.9); break;
    case 'bounce': s.alpha = clamp(p * 3, 0, 1); s.scale = 0.3 + 0.7 * ease.outElastic(p); break;
    case 'focus': s.alpha = e; s.blur = (1 - x) * size * 0.2; s.scale = 1.14 - 0.14 * x; break;
    case 'blurIn': s.alpha = ease.inOutCubic(Math.min(1, p * 1.4)); s.blur = (1 - x) * size * 0.16; s.scale = 1.06 - 0.06 * x; s.dy = (1 - x) * size * 0.08; break;
    case 'scaleBlur': s.alpha = clamp(p * 1.8, 0, 1); s.blur = (1 - x) * size * 0.22; s.scale = 1.35 - 0.35 * x; break;
    case 'rise': s.clipUp = 1 - ease.outQuint(p); s.alpha = clamp(p * 4, 0, 1); break;
    case 'angle': s.alpha = clamp(p * 3, 0, 1); s.scale = 1.45 - 0.45 * ease.outBack(p, 1.4); s.rot = (i % 2 ? 1 : -1) * (1 - e) * 0.12; break;
    case 'flip': s.alpha = clamp(p * 2, 0, 1); s.sy = Math.max(0.02, ease.outBack(p, 1.6)); break;
    case 'glowIn': {
      const fl = p < 0.5 ? (Math.sin(p * 60) > 0 ? 1 : 0.25) : 1;
      s.alpha = clamp(p * 2.5, 0, 1) * fl; s.glow = e; break;
    }
    case 'slideL': s.alpha = e; s.dx = -(1 - x) * size * 1.2; break;
    case 'slideR': s.alpha = e; s.dx = (1 - x) * size * 1.2; break;
    case 'slideUp': s.alpha = e; s.dy = (1 - x) * size * 1.2; break;
    case 'zoom': s.alpha = e; s.scale = 0.3 + 0.7 * x; break;
    // por letra (se aplican a cada carácter con desfase)
    case 'letters': s.alpha = ease.inOutCubic(p); s.dy = (1 - ease.outQuint(p)) * size * 0.35; s.blur = (1 - x) * size * 0.06; break;
    case 'wave': s.alpha = clamp(p * 2, 0, 1); s.dy = -Math.sin(p * Math.PI) * size * 0.25 + (1 - e) * size * 0.2; break;
    case 'tracking': s.alpha = ease.inOutCubic(p); s.blur = (1 - x) * size * 0.05; break;
    default: s.alpha = e;
  }
  return s;
}

export function animOut(type, q, size = 60) {
  // q: 0 → empieza a salir, 1 → fuera
  const s = { alpha: 1, scale: 1, sx: 1, sy: 1, dx: 0, dy: 0, rot: 0, blur: 0, glow: 1, clipUp: 0 };
  if (q <= 0 || type === 'none') return s;
  const e = ease.inCubic(clamp(q, 0, 1));
  switch (type) {
    case 'pop': s.alpha = 1 - e; s.scale = 1 - 0.25 * e; break;
    case 'lift': s.alpha = 1 - e; s.dy = -e * size * 0.4; break;
    case 'drop': s.alpha = 1 - e; s.dy = e * size * 0.4; break;
    case 'focus': case 'blurOut': s.alpha = 1 - e; s.blur = e * size * 0.16; s.scale = 1 + 0.04 * e; break;
    case 'slideL': s.alpha = 1 - e; s.dx = -e * size * 1.2; break;
    case 'slideR': s.alpha = 1 - e; s.dx = e * size * 1.2; break;
    default: s.alpha = 1 - e;
  }
  return s;
}

export function applyState(ctx, s, cx, cy) {
  ctx.globalAlpha *= clamp(s.alpha, 0, 1);
  if (s.dx || s.dy) ctx.translate(s.dx, s.dy);
  if (s.scale !== 1 || s.sx !== 1 || s.sy !== 1 || s.rot) {
    ctx.translate(cx, cy);
    if (s.rot) ctx.rotate(s.rot);
    ctx.scale(s.scale * s.sx, s.scale * s.sy);
    ctx.translate(-cx, -cy);
  }
  if (s.blur > 0.3) ctx.filter = `blur(${s.blur.toFixed(1)}px)`;
}

export function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

export function withAlpha(hex, a) {
  if (!hex) return `rgba(0,0,0,${a})`;
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function luminance(hex) {
  const h = String(hex).replace('#', '');
  if (h.length < 6) return 1;
  const n = parseInt(h.slice(0, 6), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
