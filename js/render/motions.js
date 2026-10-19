import { clamp } from '../lib.js';
import { C, F, PALETTE } from '../data/brand.js';
import { ease, rrect, withAlpha } from './anim.js';
import { drawIcon } from '../ui/icons.js';

// ---------- utilidades ----------
const font = (w, size, fam, it = false) => `${it ? 'italic ' : ''}${w} ${size.toFixed(1)}px "${fam}"`;
const hexOf = (id) => (PALETTE.find(p => p.id === id) || {}).hex || id || C.white;
export const TONES = {
  blue: { bg: C.blue, ink: C.blueInk, soft: C.blueSoft },
  fluor: { bg: C.fluor, ink: C.fluorInk, soft: C.fluor },
  magenta: { bg: C.magenta, ink: C.magentaInk, soft: C.magentaSoft },
  green: { bg: C.green, ink: C.greenInk, soft: C.greenSoft },
  yellow: { bg: C.yellow, ink: C.yellowInk, soft: '#ffd970' },
  sky: { bg: C.sky, ink: C.skyInk, soft: '#92d5f9' },
  light: { bg: C.white, ink: C.n900, soft: C.white },
  dark: { bg: C.n900, ink: C.white, soft: C.white, ring: 'rgba(255,255,255,0.3)' },
};
const TONE_OPTS = [['blue', 'Azul'], ['fluor', 'Fluor'], ['magenta', 'Magenta'], ['green', 'Verde'], ['yellow', 'Amarillo'], ['sky', 'Cielo'], ['light', 'Claro'], ['dark', 'Oscuro']];

function text(ctx, s, x, y, f, color, align = 'center', ls = 0) {
  ctx.font = f; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.letterSpacing = `${ls}px`;
  ctx.fillText(s, x, y);
  ctx.letterSpacing = '0px';
}
function measure(ctx, s, f, ls = 0) { ctx.font = f; ctx.letterSpacing = `${ls}px`; const w = ctx.measureText(s).width; ctx.letterSpacing = '0px'; return w; }

function glass(ctx, x, y, w, h, r, u, env, tint = 'rgba(18,18,20,0.38)') {
  if (env.base) {
    ctx.save();
    rrect(ctx, x, y, w, h, r); ctx.clip();
    const m = ctx.getTransform();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = `blur(${(14 * u).toFixed(1)}px)`;
    ctx.drawImage(env.base, 0, 0, env.W, env.H);
    ctx.filter = 'none';
    ctx.setTransform(m);
    ctx.restore();
  }
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 12 * u; ctx.shadowOffsetY = 11 * u;
  rrect(ctx, x, y, w, h, r); ctx.fillStyle = tint; ctx.fill();
  ctx.restore();
  ctx.save(); rrect(ctx, x, y, w, h, r); ctx.clip();
  ctx.lineWidth = 6 * u; ctx.strokeStyle = 'rgba(255,255,255,0.2)'; rrect(ctx, x, y, w, h, r); ctx.stroke();
  ctx.restore();
}

function sheen(ctx, x, y, w, h, r, p) {
  if (p <= 0 || p >= 1) return;
  ctx.save(); rrect(ctx, x, y, w, h, r); ctx.clip();
  const sx = x - w * 0.6 + (w * 2.2) * p;
  const g = ctx.createLinearGradient(sx - h, y, sx + h, y + h);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function cursor(ctx, x, y, s, pressed) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s * (pressed ? 0.88 : 1), s * (pressed ? 0.88 : 1));
  const p = new Path2D('M0 0 L0 34 L9 26 L15 40 L21 37 L15 24 L27 24 Z');
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#fff'; ctx.fill(p);
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 2.2; ctx.strokeStyle = C.n900; ctx.lineJoin = 'round'; ctx.stroke(p);
  ctx.restore();
}

// Generador pseudoaleatorio estable por motion
function rng(seed) { let s = 0; for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function pill(ctx, label, tone, u, opts = {}) {
  const T = TONES[tone] || TONES.blue;
  const fs = (opts.fs || 40) * u;
  const f = font(700, fs, F.body);
  const iconS = opts.icon ? fs * 1.05 : 0;
  const tw = measure(ctx, label, f);
  const padX = 46 * u, h = (opts.h || 100) * u;
  const w = tw + padX * 2 + (iconS ? iconS + 16 * u : 0);
  const x = -w / 2, y = -h / 2;
  ctx.save();
  ctx.shadowColor = withAlpha(T.bg === C.n900 ? '#000000' : T.bg, 0.45); ctx.shadowBlur = 30 * u; ctx.shadowOffsetY = 10 * u;
  rrect(ctx, x, y, w, h, h / 2); ctx.fillStyle = T.bg; ctx.fill();
  ctx.restore();
  if (T.ring) { ctx.save(); rrect(ctx, x, y, w, h, h / 2); ctx.clip(); ctx.lineWidth = 4 * u; ctx.strokeStyle = T.ring; rrect(ctx, x, y, w, h, h / 2); ctx.stroke(); ctx.restore(); }
  const tx = x + padX + (opts.iconLeft && iconS ? iconS + 16 * u : 0);
  text(ctx, label, tx, 2 * u, f, T.ink, 'left');
  if (iconS) {
    const ix = opts.iconLeft ? x + padX : x + padX + tw + 16 * u;
    drawIcon(ctx, opts.icon, ix, -iconS / 2, iconS, T.ink, 2.4);
  }
  return { x, y, w, h };
}

// ---------- Presets ----------
export const MOTION_CATS = [
  { id: 'cta', name: 'Botones y CTA' },
  { id: 'cartel', name: 'Carteles y títulos' },
  { id: 'dato', name: 'Datos y finanzas' },
  { id: 'senal', name: 'Señalización' },
  { id: 'efecto', name: 'Efectos y marca' },
];

export const MOTIONS = {
  boton: {
    name: 'Botón CTA', cat: 'cta', icon: 'pointer', dur: 3.5, y: 0.7, animIn: 'pop', animOut: 'pop',
    props: { text: 'Inscribirme ahora', tone: 'blue', icon: 'arrowRight', cursor: true },
    fields: [{ k: 'text', label: 'Texto', type: 'text' }, { k: 'tone', label: 'Color', type: 'select', options: TONE_OPTS }, { k: 'icon', label: 'Icono', type: 'select', options: [['', 'Ninguno'], ['arrowRight', 'Flecha'], ['arrowUpRight', 'Flecha diagonal'], ['download', 'Descarga'], ['play', 'Play'], ['calendar', 'Calendario']] }, { k: 'cursor', label: 'Cursor que pulsa', type: 'toggle' }],
    draw(ctx, o, lt, env) {
      const { u } = env; const P = o.props;
      const click = 1.25, press = P.cursor && lt > click && lt < click + 0.16;
      ctx.save();
      if (press) ctx.scale(0.94, 0.94);
      const b = pill(ctx, P.text, P.tone, u, { icon: P.icon || null });
      sheen(ctx, b.x, b.y, b.w, b.h, b.h / 2, ((lt - 0.5) % 2.6) / 0.9);
      ctx.restore();
      if (P.cursor) {
        if (lt > click) {
          const q = clamp((lt - click) / 0.5, 0, 1);
          ctx.save(); ctx.globalAlpha *= 1 - q; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4 * u;
          ctx.beginPath(); ctx.arc(b.w * 0.28, b.h * 0.15, (20 + 90 * ease.outCubic(q)) * u, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        }
        const k = ease.outCubic(clamp((lt - 0.35) / 0.8, 0, 1));
        const cx = b.w * 0.28 + (1 - k) * 260 * u, cy = b.h * 0.15 + (1 - k) * 220 * u;
        if (lt > 0.3) cursor(ctx, cx, cy, 2.2 * u, press);
      }
      return { w: b.w, h: b.h };
    },
  },
  seguir: {
    name: 'Seguir', cat: 'cta', icon: 'userPlus', dur: 3, y: 0.72, animIn: 'pop', animOut: 'pop',
    props: { text: 'Seguir', done: 'Siguiendo', tone: 'magenta' },
    fields: [{ k: 'text', label: 'Texto', type: 'text' }, { k: 'done', label: 'Tras pulsar', type: 'text' }, { k: 'tone', label: 'Color', type: 'select', options: TONE_OPTS }],
    draw(ctx, o, lt, env) {
      const { u } = env; const P = o.props;
      const click = 1.1, done = lt > click + 0.12;
      ctx.save();
      if (lt > click && lt < click + 0.16) ctx.scale(0.93, 0.93);
      const b = done ? pill(ctx, P.done, 'dark', u, { icon: 'check', iconLeft: true }) : pill(ctx, P.text, P.tone, u, { icon: 'userPlus', iconLeft: true });
      ctx.restore();
      const k = ease.outCubic(clamp((lt - 0.25) / 0.75, 0, 1));
      if (lt > 0.2 && lt < click + 0.9) cursor(ctx, b.w * 0.25 + (1 - k) * 240 * u, b.h * 0.1 + (1 - k) * 200 * u, 2.2 * u, lt > click && lt < click + 0.16);
      return { w: b.w, h: b.h };
    },
  },
  comenta: {
    name: 'Comenta', cat: 'cta', icon: 'message', dur: 3.5, y: 0.7, animIn: 'pop', animOut: 'fade',
    props: { text: 'Comenta', word: 'TRADING', sub: 'y te envío la guía' },
    fields: [{ k: 'text', label: 'Texto', type: 'text' }, { k: 'word', label: 'Palabra clave', type: 'text' }, { k: 'sub', label: 'Subtexto', type: 'text' }],
    draw(ctx, o, lt, env) {
      const { u } = env; const P = o.props;
      const f1 = font(700, 44 * u, F.body), f2 = font(700, 46 * u, F.head), f3 = font(500, 30 * u, F.serif, true);
      const w1 = measure(ctx, P.text, f1), w2 = measure(ctx, P.word, f2, -0.5 * u);
      const icon = 54 * u, pad = 34 * u, gap = 18 * u;
      const tagW = w2 + 40 * u;
      const w = pad * 2 + icon + gap + w1 + gap + tagW, h = 116 * u;
      const hasSub = !!P.sub;
      const H = h + (hasSub ? 52 * u : 0);
      glass(ctx, -w / 2, -H / 2, w, H, 28 * u, u, env);
      const cy = -H / 2 + h / 2;
      drawIcon(ctx, 'message', -w / 2 + pad, cy - icon / 2, icon, C.white, 2.2);
      text(ctx, P.text, -w / 2 + pad + icon + gap, cy + 2 * u, f1, C.white, 'left');
      const tx = -w / 2 + pad + icon + gap + w1 + gap;
      const pk = ease.outBack(clamp((lt - 0.35) / 0.4, 0, 1), 2);
      ctx.save(); ctx.translate(tx + tagW / 2, cy); ctx.scale(pk, pk);
      rrect(ctx, -tagW / 2, -34 * u, tagW, 68 * u, 34 * u); ctx.fillStyle = C.fluor; ctx.fill();
      text(ctx, P.word, 0, 2 * u, f2, C.fluorInk, 'center', -0.5 * u);
      ctx.restore();
      if (hasSub) text(ctx, P.sub, 0, -H / 2 + h + 14 * u, f3, C.white);
      return { w, h: H };
    },
  },
  linkbio: {
    name: 'Link en la bio', cat: 'cta', icon: 'link', dur: 3, y: 0.74, animIn: 'lift', animOut: 'fade',
    props: { text: 'Link en la bio', tone: 'fluor' },
    fields: [{ k: 'text', label: 'Texto', type: 'text' }, { k: 'tone', label: 'Color', type: 'select', options: TONE_OPTS }],
    draw(ctx, o, lt, env) {
      const { u } = env;
      const b = pill(ctx, o.props.text, o.props.tone, u, { icon: 'link', iconLeft: true, fs: 38, h: 92 });
      const bounce = Math.abs(Math.sin(lt * 4.2)) * 18 * u;
      const T = TONES[o.props.tone] || TONES.fluor;
      drawIcon(ctx, 'arrowDown', -30 * u, b.h / 2 + 18 * u + bounce, 60 * u, T.bg === C.n900 ? C.white : T.bg, 3);
      return { w: b.w, h: b.h + 160 * u };
    },
  },
  guardar: {
    name: 'Guárdalo', cat: 'cta', icon: 'bookmark', dur: 3, y: 0.7, animIn: 'pop', animOut: 'fade',
    props: { text: 'Guárdalo para luego', tone: 'light' },
    fields: [{ k: 'text', label: 'Texto', type: 'text' }, { k: 'tone', label: 'Color', type: 'select', options: TONE_OPTS }],
    draw(ctx, o, lt, env) {
      const { u } = env;
      const wob = Math.sin(lt * 8) * Math.exp(-lt * 1.5) * 0.08;
      ctx.rotate(wob);
      const b = pill(ctx, o.props.text, o.props.tone, u, { icon: 'bookmark', iconLeft: true, fs: 38, h: 92 });
      return { w: b.w, h: b.h };
    },
  },

  // --- Carteles ---
  lowerthird: {
    name: 'Rótulo nombre', cat: 'cartel', icon: 'user', dur: 4, x: 0.42, y: 0.74, animIn: 'slideL', animOut: 'slideL',
    props: { name: 'Nombre Apellido', role: 'Profesor de Trading', accent: 'magenta' },
    fields: [{ k: 'name', label: 'Nombre', type: 'text' }, { k: 'role', label: 'Cargo', type: 'text' }, { k: 'accent', label: 'Acento', type: 'select', options: TONE_OPTS }],
    draw(ctx, o, lt, env) {
      const { u } = env; const P = o.props;
      const f1 = font(700, 50 * u, F.head), f2 = font(500, 36 * u, F.serif, true);
      const w1 = measure(ctx, P.name, f1, -1 * u), w2 = measure(ctx, P.role, f2);
      const pad = 40 * u, w = Math.max(w1, w2) + pad * 2 + 18 * u, h = 168 * u;
      const reveal = ease.outCubic(clamp(lt / 0.55, 0, 1));
      ctx.save();
      rrect(ctx, -w / 2, -h / 2, w * reveal, h, 28 * u); ctx.clip();
      glass(ctx, -w / 2, -h / 2, w, h, 28 * u, u, env);
      const T = TONES[P.accent] || TONES.magenta;
      rrect(ctx, -w / 2 + pad, -h / 2 + 36 * u, 8 * u, h - 72 * u, 4 * u); ctx.fillStyle = T.bg; ctx.fill();
      text(ctx, P.name, -w / 2 + pad + 26 * u, -20 * u, f1, C.white, 'left', -1 * u);
      text(ctx, P.role, -w / 2 + pad + 26 * u, 34 * u, f2, T.bg === C.n900 ? C.white : T.soft, 'left');
      ctx.restore();
      return { w, h };
    },
  },
  etiqueta: {
    name: 'Etiqueta', cat: 'cartel', icon: 'bookmark', dur: 3, y: 0.3, animIn: 'pop', animOut: 'fade',
    props: { text: 'CLASES GRATUITAS', tone: 'magenta' },
    fields: [{ k: 'text', label: 'Texto', type: 'text' }, { k: 'tone', label: 'Color', type: 'select', options: TONE_OPTS.filter(t => !['light', 'dark'].includes(t[0])) }],
    draw(ctx, o, lt, env) {
      const { u } = env; const T = TONES[o.props.tone] || TONES.magenta;
      const f = font(700, 34 * u, F.head);
      const s = o.props.text.toLocaleUpperCase('es-ES');
      const tw = measure(ctx, s, f, 2 * u);
      const w = tw + 64 * u, h = 76 * u;
      if (env.base) { ctx.save(); rrect(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = 'rgba(18,18,20,0.55)'; ctx.fill(); ctx.restore(); }
      rrect(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = withAlpha(T.bg, 0.22); ctx.fill();
      ctx.save(); rrect(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.clip(); ctx.lineWidth = 4 * u; ctx.strokeStyle = T.bg; rrect(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.stroke(); ctx.restore();
      text(ctx, s, 0, 2 * u, f, T.soft, 'center', 2 * u);
      return { w, h };
    },
  },
  tituloglow: {
    name: 'Título glow', cat: 'cartel', icon: 'zap', dur: 3, y: 0.28, animIn: 'focus', animOut: 'fade',
    props: { text: 'CAMBIO EN INSTAGRAM', script: 'nuevo', color: 'fluor', behindHint: true },
    fields: [{ k: 'text', label: 'Título', type: 'textarea' }, { k: 'script', label: 'Palabra script', type: 'text' }, { k: 'color', label: 'Color', type: 'color' }],
    draw(ctx, o, lt, env) {
      const { u } = env; const P = o.props;
      const col = hexOf(P.color);
      const words = P.text.toLocaleUpperCase('es-ES').split(/\s+/).filter(Boolean);
      const lines = [];
      if (P.text.includes('\n')) lines.push(...P.text.toLocaleUpperCase('es-ES').split('\n'));
      else for (let i = 0; i < words.length; i += 2) lines.push(words.slice(i, i + 2).join(' '));
      let fs = 150 * u;
      const maxW = env.W * 0.86;
      let f = font(700, fs, F.head);
      let mw = Math.max(...lines.map(l => measure(ctx, l, f, -0.035 * fs)));
      if (mw > maxW) { fs *= maxW / mw; f = font(700, fs, F.head); mw = maxW; }
      const lh = fs * 0.9, h = lh * lines.length;
      lines.forEach((l, i) => {
        const y = -h / 2 + lh * (i + 0.5);
        ctx.save(); ctx.shadowColor = withAlpha(col, 0.6); ctx.shadowBlur = 36 * u;
        text(ctx, l, 0, y, f, col, 'center', -0.035 * fs); ctx.restore();
        text(ctx, l, 0, y, f, col, 'center', -0.035 * fs);
      });
      if (P.script) {
        const k = ease.outCubic(clamp((lt - 0.25) / 0.5, 0, 1));
        ctx.save(); ctx.globalAlpha *= k;
        const sf = font(400, fs * 0.72, F.script);
        ctx.shadowColor = 'rgba(255,255,255,0.6)'; ctx.shadowBlur = 20 * u;
        text(ctx, P.script, -mw * 0.22, -h / 2 + fs * 0.05, sf, C.white, 'center');
        ctx.restore();
      }
      return { w: mw, h: h + fs * 0.3 };
    },
  },
  tituloeditorial: {
    name: 'Título editorial', cat: 'cartel', icon: 'type', dur: 3.5, y: 0.24, animIn: 'lift', animOut: 'fade',
    props: { line1: 'la clave de un', accent: 'NEGOCIO', small: 'en mi último reel', accentColor: 'white' },
    fields: [{ k: 'line1', label: 'Línea', type: 'text' }, { k: 'accent', label: 'Palabra acento', type: 'text' }, { k: 'accentColor', label: 'Color acento', type: 'color' }, { k: 'small', label: 'Texto pequeño (opcional)', type: 'text' }],
    draw(ctx, o, lt, env) {
      const { u } = env; const P = o.props;
      const f1 = font(700, 66 * u, F.head), f2 = font(500, 74 * u, F.serif, true), f3 = font(500, 24 * u, F.body);
      const w1 = measure(ctx, P.line1, f1, -2 * u);
      const acc = (P.accent || '').toLocaleUpperCase('es-ES');
      const w2 = measure(ctx, acc, f2);
      const w = Math.max(w1, w2);
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 18 * u;
      text(ctx, P.line1, 0, -40 * u, f1, C.white, 'center', -2 * u);
      const k = ease.outCubic(clamp((lt - 0.2) / 0.5, 0, 1));
      ctx.globalAlpha *= k;
      text(ctx, acc, 0, 34 * u + (1 - k) * 20 * u, f2, hexOf(P.accentColor), 'center');
      ctx.restore();
      let h = 150 * u;
      if (P.small) {
        const ay = 100 * u;
        const aw = Math.max(w * 0.8, 260 * u) * ease.outCubic(clamp((lt - 0.4) / 0.6, 0, 1));
        ctx.save(); ctx.strokeStyle = C.white; ctx.lineWidth = 3 * u; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-aw / 2, ay); ctx.lineTo(aw / 2, ay);
        if (aw > 40 * u) { ctx.moveTo(aw / 2 - 16 * u, ay - 12 * u); ctx.lineTo(aw / 2, ay); ctx.lineTo(aw / 2 - 16 * u, ay + 12 * u); }
        ctx.stroke(); ctx.restore();
        text(ctx, P.small, w * 0.4, ay - 24 * u, f3, C.white, 'right', 4 * u);
        h += 80 * u;
      }
      return { w, h };
    },
  },
  destino: {
    name: 'Título destino', cat: 'cartel', icon: 'type', dur: 3, y: 0.2, animIn: 'none', animOut: 'fade',
    props: { small: 'esto es', big: 'TRADING', color: 'white' },
    fields: [{ k: 'small', label: 'Texto pequeño', type: 'text' }, { k: 'big', label: 'Título', type: 'text' }, { k: 'color', label: 'Color', type: 'color' }],
    draw(ctx, o, lt, env) {
      // Serif clásica en mayúsculas con línea pequeña encima (estilo Mirko Vigna "esto es MADRID")
      const { u } = env; const P = o.props; const col = hexOf(P.color);
      const big = (P.big || '').toLocaleUpperCase('es-ES');
      let fs = 170 * u; let f = font(500, fs, F.serif);
      let w = measure(ctx, big, f, 2 * u);
      if (w > env.W * 0.9) { fs *= env.W * 0.9 / w; f = font(500, fs, F.serif); w = env.W * 0.9; }
      const k1 = ease.outCubic(clamp(lt / 0.6, 0, 1)), k2 = ease.outExpo(clamp((lt - 0.25) / 0.9, 0, 1));
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 24 * u;
      ctx.globalAlpha *= k1; text(ctx, P.small || '', 0, -fs * 0.62, font(500, fs * 0.24, F.serif), col, 'center', 1 * u);
      ctx.restore();
      ctx.save(); ctx.globalAlpha *= k2; if (k2 < 1) ctx.filter = `blur(${((1 - k2) * 16 * u).toFixed(1)}px)`;
      ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 30 * u;
      text(ctx, big, 0, fs * 0.1, f, col, 'center', (2 + (1 - k2) * 30) * u);
      ctx.restore();
      return { w, h: fs * 1.5 };
    },
  },
  gancho: {
    name: 'Gancho nativo', cat: 'cartel', icon: 'text', dur: 4, y: 0.17, animIn: 'fade', animOut: 'fade',
    props: { text: 'plan de inversión:\ncómo empezar con 100 € al mes' },
    fields: [{ k: 'text', label: 'Texto (Enter = nueva línea)', type: 'textarea' }],
    draw(ctx, o, lt, env) {
      // Texto nativo de TikTok/Reels: blanco con sombra fina, centrado (estilo Mirko Vigna)
      const { u } = env;
      const f = font(600, 50 * u, F.body);
      const lines = String(o.props.text || '').split('\n');
      const lh = 62 * u;
      const w = Math.max(...lines.map(l => measure(ctx, l, f, -0.5 * u)));
      // contorno oscuro + sombra: se lee sobre cualquier fondo (como el texto nativo de TikTok)
      ctx.save();
      ctx.font = f; ctx.letterSpacing = `${-0.5 * u}px`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = 5 * u; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      lines.forEach((l, i) => ctx.strokeText(l, 0, (i - (lines.length - 1) / 2) * lh));
      ctx.letterSpacing = '0px';
      ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 8 * u; ctx.shadowOffsetY = 2 * u;
      lines.forEach((l, i) => text(ctx, l, 0, (i - (lines.length - 1) / 2) * lh, f, C.white, 'center', -0.5 * u));
      ctx.restore();
      return { w: w + 40 * u, h: lines.length * lh + 30 * u };
    },
  },
  seleccion: {
    name: 'Caja de selección', cat: 'cartel', icon: 'frame', dur: 3, y: 0.42, animIn: 'none', animOut: 'fade',
    props: { text: 'reels', color: 'white', handles: 'fluor', cursor: true },
    fields: [{ k: 'text', label: 'Texto', type: 'text' }, { k: 'color', label: 'Color del texto', type: 'color' }, { k: 'handles', label: 'Color de los tiradores', type: 'color' }, { k: 'cursor', label: 'Cursor', type: 'toggle' }],
    draw(ctx, o, lt, env) {
      // Texto con marco de selección de editor y cursor (estilo Mirko Vigna)
      const { u } = env; const P = o.props;
      const f = font(700, 120 * u, F.body);
      const w = measure(ctx, P.text, f, -4 * u), h = 150 * u;
      const k = ease.outExpo(clamp(lt / 0.7, 0, 1));
      ctx.save(); ctx.globalAlpha *= k; if (k < 1) ctx.filter = `blur(${((1 - k) * 14 * u).toFixed(1)}px)`;
      ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 24 * u;
      text(ctx, P.text, 0, 6 * u, f, hexOf(P.color), 'center', -4 * u);
      ctx.restore();
      const kb = ease.outCubic(clamp((lt - 0.35) / 0.4, 0, 1));
      if (kb > 0) {
        const bw = w + 60 * u, bh = h;
        ctx.save(); ctx.globalAlpha *= kb;
        ctx.setLineDash([12 * u, 8 * u]); ctx.lineWidth = 3 * u; ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.strokeRect(-bw / 2, -bh / 2, bw, bh); ctx.setLineDash([]);
        const hs = 16 * u;
        for (const [hx, hy] of [[-bw / 2, -bh / 2], [bw / 2, -bh / 2], [-bw / 2, bh / 2], [bw / 2, bh / 2]]) {
          ctx.fillStyle = '#fff'; ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
          ctx.lineWidth = 3 * u; ctx.strokeStyle = hexOf(P.handles); ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
        }
        ctx.restore();
        if (P.cursor) {
          const kc = ease.outCubic(clamp((lt - 0.6) / 0.6, 0, 1));
          if (kc > 0) cursor(ctx, bw / 2 + 10 * u + (1 - kc) * 120 * u, bh / 2 + 6 * u + (1 - kc) * 90 * u, 1.9 * u, lt > 1.25 && lt < 1.4);
        }
      }
      return { w: w + 100 * u, h: h + 60 * u };
    },
  },
  tachado: {
    name: 'Tachado', cat: 'cartel', icon: 'strike', dur: 2.5, y: 0.3, animIn: 'fade', animOut: 'fade',
    props: { text: 'CÁMARA INCREÍBLE', color: 'fluor' },
    fields: [{ k: 'text', label: 'Texto', type: 'text' }, { k: 'color', label: 'Color', type: 'color' }],
    draw(ctx, o, lt, env) {
      const { u } = env; const col = hexOf(o.props.color);
      const s = o.props.text.toLocaleUpperCase('es-ES');
      let fs = 96 * u; let f = font(700, fs, F.head);
      let w = measure(ctx, s, f, -2 * u);
      if (w > env.W * 0.88) { fs *= env.W * 0.88 / w; f = font(700, fs, F.head); w = env.W * 0.88; }
      ctx.save(); ctx.shadowColor = withAlpha(col, 0.5); ctx.shadowBlur = 30 * u;
      text(ctx, s, 0, 0, f, col, 'center', -2 * u); ctx.restore();
      const k = ease.inOutCubic(clamp((lt - 0.45) / 0.45, 0, 1));
      if (k > 0) {
        ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = fs * 0.1; ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 10 * u;
        ctx.beginPath(); ctx.moveTo(-w / 2 - 10 * u, fs * 0.04); ctx.lineTo(-w / 2 - 10 * u + (w + 20 * u) * k, -fs * 0.02); ctx.stroke(); ctx.restore();
      }
      return { w, h: fs * 1.1 };
    },
  },
  cita: {
    name: 'Cita', cat: 'cartel', icon: 'quote', dur: 4, y: 0.4, animIn: 'soft', animOut: 'fade',
    props: { text: 'El mercado premia la paciencia', author: 'Warren Buffett' },
    fields: [{ k: 'text', label: 'Cita', type: 'textarea' }, { k: 'author', label: 'Autor', type: 'text' }],
    draw(ctx, o, lt, env) {
      const { u } = env; const P = o.props;
      const f = font(500, 64 * u, F.serif, true);
      const maxW = env.W * 0.78;
      const words = P.text.split(/\s+/); const lines = []; let cur = '';
      for (const w of words) { const tst = cur ? cur + ' ' + w : w; if (measure(ctx, tst, f) > maxW && cur) { lines.push(cur); cur = w; } else cur = tst; }
      if (cur) lines.push(cur);
      const lh = 78 * u, h = lines.length * lh;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 20 * u;
      text(ctx, '“', 0, -h / 2 - 60 * u, font(700, 160 * u, F.serif), C.magenta);
      lines.forEach((l, i) => text(ctx, l, 0, -h / 2 + lh * (i + 0.5), f, C.white));
      if (P.author) text(ctx, '— ' + P.author.toLocaleUpperCase('es-ES'), 0, h / 2 + 50 * u, font(700, 26 * u, F.head), C.fluor, 'center', 3 * u);
      ctx.restore();
      return { w: maxW, h: h + 220 * u };
    },
  },
  texto: {
    name: 'Texto libre', cat: 'cartel', icon: 'type', dur: 3, y: 0.4, animIn: 'pop', animOut: 'fade',
    props: { text: 'Escribe aquí', font: 'head', size: 80, color: 'white', upper: true, box: 'none' },
    fields: [{ k: 'text', label: 'Texto', type: 'textarea' }, { k: 'font', label: 'Tipografía', type: 'select', options: [['head', 'Space Grotesk'], ['body', 'Raleway'], ['serif', 'Playfair Display (itálica)'], ['script', 'Sacramento'], ['mono', 'Geist Mono']] }, { k: 'size', label: 'Tamaño', type: 'number', min: 24, max: 220 }, { k: 'color', label: 'Color', type: 'color' }, { k: 'upper', label: 'Mayúsculas', type: 'toggle' }, { k: 'box', label: 'Fondo', type: 'select', options: [['none', 'Sin fondo'], ['glass', 'Cristal'], ['dark', 'Oscuro'], ['fluor', 'Fluor'], ['magenta', 'Magenta']] }],
    draw(ctx, o, lt, env) {
      const { u } = env; const P = o.props;
      const fam = { head: F.head, body: F.body, serif: F.serif, script: F.script, mono: F.mono }[P.font] || F.head;
      const w8 = P.font === 'script' ? 400 : P.font === 'serif' ? 600 : P.font === 'mono' ? 500 : 700;
      const fs = (P.size || 80) * u;
      const f = font(w8, fs, fam, P.font === 'serif');
      const lines = String(P.text || '').split('\n').map(l => P.upper ? l.toLocaleUpperCase('es-ES') : l);
      const lh = fs * 1.08;
      const w = Math.max(...lines.map(l => measure(ctx, l, f, P.font === 'head' ? -0.02 * fs : 0)));
      const h = lh * lines.length;
      const pad = 26 * u;
      let col = hexOf(P.color);
      if (P.box === 'glass') glass(ctx, -w / 2 - pad, -h / 2 - pad * 0.6, w + pad * 2, h + pad * 1.2, 28 * u, u, env);
      else if (P.box === 'dark' || P.box === 'fluor' || P.box === 'magenta') {
        const T = TONES[P.box === 'dark' ? 'dark' : P.box];
        rrect(ctx, -w / 2 - pad, -h / 2 - pad * 0.6, w + pad * 2, h + pad * 1.2, 18 * u); ctx.fillStyle = T.bg; ctx.fill();
        col = T.ink;
      }
      ctx.save();
      if (P.box === 'none') { ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 22 * u; ctx.shadowOffsetY = 4 * u; }
      lines.forEach((l, i) => text(ctx, l, 0, -h / 2 + lh * (i + 0.5) + fs * 0.04, f, col, 'center', P.font === 'head' ? -0.02 * fs : 0));
      ctx.restore();
      return { w: w + pad * 2, h: h + pad * 1.2 };
    },
  },

  // --- Datos ---
  dato: {
    name: 'Dato', cat: 'dato', icon: 'trendingUp', dur: 3.5, y: 0.4, animIn: 'pop', animOut: 'fade',
    props: { prefix: '+', value: '37', suffix: '%', label: 'de alumnos lo consigue', color: 'fluor', panel: true },
    fields: [{ k: 'prefix', label: 'Antes', type: 'text' }, { k: 'value', label: 'Número', type: 'text' }, { k: 'suffix', label: 'Después', type: 'text' }, { k: 'label', label: 'Texto', type: 'text' }, { k: 'color', label: 'Color', type: 'color' }, { k: 'panel', label: 'Panel de cristal', type: 'toggle' }],
    draw(ctx, o, lt, env) {
      const { u } = env; const P = o.props;
      const num = parseFloat(String(P.value).replace(',', '.'));
      const k = ease.outCubic(clamp(lt / 1.1, 0, 1));
      const dec = (String(P.value).split(/[.,]/)[1] || '').length;
      const shown = isFinite(num) ? (num * k).toFixed(dec).replace('.', ',') : P.value;
      const s = `${P.prefix || ''}${shown}${P.suffix || ''}`;
      const fs = 170 * u; const f = font(700, fs, F.head);
      const fl = font(600, 38 * u, F.body);
      const final = `${P.prefix || ''}${P.value}${P.suffix || ''}`;
      const w = Math.max(measure(ctx, final, f, -0.03 * fs), measure(ctx, P.label || '', fl)) + 90 * u;
      const h = fs + (P.label ? 90 * u : 30 * u);
      if (P.panel) glass(ctx, -w / 2, -h / 2, w, h, 28 * u, u, env);
      const col = hexOf(P.color);
      ctx.save(); ctx.shadowColor = withAlpha(col, 0.45); ctx.shadowBlur = 30 * u;
      text(ctx, s, 0, -h / 2 + fs * 0.62, f, col, 'center', -0.03 * fs); ctx.restore();
      if (P.label) text(ctx, P.label, 0, h / 2 - 52 * u, fl, C.white);
      return { w, h };
    },
  },
  grafico: {
    name: 'Gráfico', cat: 'dato', icon: 'chartLine', dur: 4, y: 0.42, animIn: 'pop', animOut: 'fade',
    props: { label: 'S&P 500', value: '+12,4%', trend: 'up' },
    fields: [{ k: 'label', label: 'Activo', type: 'text' }, { k: 'value', label: 'Valor', type: 'text' }, { k: 'trend', label: 'Tendencia', type: 'select', options: [['up', 'Sube'], ['down', 'Baja']] }],
    draw(ctx, o, lt, env) {
      const { u } = env; const P = o.props;
      const w = 760 * u, h = 470 * u;
      glass(ctx, -w / 2, -h / 2, w, h, 28 * u, u, env, 'rgba(18,18,20,0.55)');
      const up = P.trend !== 'down';
      const col = up ? C.green : C.red;
      text(ctx, P.label, -w / 2 + 44 * u, -h / 2 + 62 * u, font(700, 38 * u, F.head), C.white, 'left');
      text(ctx, P.value, w / 2 - 44 * u, -h / 2 + 62 * u, font(700, 40 * u, F.head), col, 'right');
      const r = rng(o.id);
      const N = 40; const pts = [];
      let v = 0.5;
      for (let i = 0; i < N; i++) { v += (r() - 0.5) * 0.12 + (up ? 0.012 : -0.012); v = clamp(v, 0.05, 0.95); pts.push(v); }
      const gx = -w / 2 + 44 * u, gy = -h / 2 + 120 * u, gw = w - 88 * u, gh = h - 170 * u;
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2 * u;
      for (let i = 0; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(gx, gy + gh * i / 3); ctx.lineTo(gx + gw, gy + gh * i / 3); ctx.stroke(); }
      ctx.restore();
      const k = ease.inOutCubic(clamp((lt - 0.2) / 1.6, 0, 1));
      const n = Math.max(2, Math.floor(N * k));
      const X = (i) => gx + gw * i / (N - 1), Y = (val) => gy + gh * (1 - val);
      ctx.save();
      const grad = ctx.createLinearGradient(0, gy, 0, gy + gh);
      grad.addColorStop(0, withAlpha(col, 0.35)); grad.addColorStop(1, withAlpha(col, 0));
      ctx.beginPath(); ctx.moveTo(X(0), Y(pts[0]));
      for (let i = 1; i < n; i++) ctx.lineTo(X(i), Y(pts[i]));
      ctx.lineTo(X(n - 1), gy + gh); ctx.lineTo(X(0), gy + gh); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
      ctx.beginPath(); ctx.moveTo(X(0), Y(pts[0]));
      for (let i = 1; i < n; i++) ctx.lineTo(X(i), Y(pts[i]));
      ctx.strokeStyle = col; ctx.lineWidth = 6 * u; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.shadowColor = col; ctx.shadowBlur = 20 * u; ctx.stroke();
      ctx.beginPath(); ctx.arc(X(n - 1), Y(pts[n - 1]), 10 * u, 0, Math.PI * 2); ctx.fillStyle = C.white; ctx.fill();
      ctx.restore();
      return { w, h };
    },
  },
  lista: {
    name: 'Lista / pasos', cat: 'dato', icon: 'list', dur: 5, y: 0.45, animIn: 'fade', animOut: 'fade',
    props: { title: '3 claves', items: 'Gestiona el riesgo\nDiversifica\nTen un plan' },
    fields: [{ k: 'title', label: 'Título', type: 'text' }, { k: 'items', label: 'Puntos (uno por línea)', type: 'textarea' }],
    draw(ctx, o, lt, env) {
      const { u } = env; const P = o.props;
      const items = String(P.items || '').split('\n').filter(Boolean).slice(0, 6);
      const fr = font(700, 40 * u, F.body), ft = font(700, 58 * u, F.head);
      const rowH = 104 * u, gap = 18 * u;
      const w = Math.max(560 * u, ...items.map(s => measure(ctx, s, fr) + 190 * u));
      const th = P.title ? 100 * u : 0;
      const h = th + items.length * (rowH + gap) - gap;
      let y = -h / 2;
      if (P.title) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 18 * u; text(ctx, P.title.toLocaleUpperCase('es-ES'), -w / 2, y + 40 * u, ft, C.white, 'left', -1.5 * u); ctx.restore(); y += th; }
      items.forEach((s, i) => {
        const k = ease.outBack(clamp((lt - 0.25 - i * 0.35) / 0.45, 0, 1), 1.4);
        if (k <= 0) { y += rowH + gap; return; }
        ctx.save(); ctx.globalAlpha *= clamp(k, 0, 1); ctx.translate((1 - k) * -80 * u, 0);
        glass(ctx, -w / 2, y, w, rowH, 24 * u, u, env);
        ctx.beginPath(); ctx.arc(-w / 2 + 62 * u, y + rowH / 2, 34 * u, 0, Math.PI * 2); ctx.fillStyle = C.fluor; ctx.fill();
        text(ctx, String(i + 1), -w / 2 + 62 * u, y + rowH / 2 + 2 * u, font(700, 36 * u, F.head), C.fluorInk);
        text(ctx, s, -w / 2 + 122 * u, y + rowH / 2 + 2 * u, fr, C.white, 'left');
        ctx.restore();
        y += rowH + gap;
      });
      return { w, h };
    },
  },
  icono: {
    name: 'Icono TBS', cat: 'dato', icon: 'coins', dur: 3, y: 0.35, animIn: 'bounce', animOut: 'pop',
    props: { icon: 'trendingUp', tone: 'yellow', icon2: 'euro', tone2: 'sky' },
    fields: [{ k: 'icon', label: 'Icono', type: 'select', options: [['trendingUp', 'Sube'], ['trendingDown', 'Baja'], ['euro', 'Euro'], ['coins', 'Monedas'], ['wallet', 'Cartera'], ['piggy', 'Hucha'], ['chartLine', 'Gráfico'], ['graduation', 'Graduación'], ['lightbulb', 'Idea'], ['target', 'Objetivo'], ['shield', 'Escudo'], ['award', 'Premio'], ['video', 'Vídeo'], ['mic', 'Micro'], ['calendar', 'Calendario'], ['clock', 'Reloj']] }, { k: 'tone', label: 'Color', type: 'select', options: TONE_OPTS }, { k: 'icon2', label: 'Segundo icono', type: 'select', options: [['', 'Ninguno'], ['euro', 'Euro'], ['coins', 'Monedas'], ['trendingUp', 'Sube'], ['chartLine', 'Gráfico'], ['wallet', 'Cartera'], ['piggy', 'Hucha']] }, { k: 'tone2', label: 'Color 2', type: 'select', options: TONE_OPTS }],
    draw(ctx, o, lt, env) {
      const { u } = env; const P = o.props;
      const R = 100 * u;
      const disc = (cx, icon, tone, delay) => {
        const k = ease.outBack(clamp((lt - delay) / 0.45, 0, 1), 2);
        if (k <= 0) return;
        const T = TONES[tone] || TONES.yellow;
        ctx.save(); ctx.translate(cx, 0); ctx.scale(k, k);
        ctx.beginPath(); ctx.arc(0, 0, R + 16 * u, 0, Math.PI * 2); ctx.fillStyle = C.n900; ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fillStyle = T.bg; ctx.fill();
        drawIcon(ctx, icon, -R * 0.6, -R * 0.6, R * 1.2, T.ink, 2.2);
        ctx.restore();
      };
      const two = !!P.icon2;
      disc(two ? -R * 0.82 : 0, P.icon, P.tone, 0);
      if (two) disc(R * 0.82, P.icon2, P.tone2, 0.15);
      return { w: two ? R * 3.9 : R * 2.3, h: R * 2.3 };
    },
  },

  // --- Señalización ---
  flecha: {
    name: 'Flecha', cat: 'senal', icon: 'arrowRight', dur: 2.5, y: 0.5, animIn: 'none', animOut: 'fade',
    props: { color: 'fluor', curve: 'arco' },
    fields: [{ k: 'color', label: 'Color', type: 'color' }, { k: 'curve', label: 'Forma', type: 'select', options: [['arco', 'Curva'], ['recta', 'Recta'], ['bucle', 'Con bucle']] }],
    draw(ctx, o, lt, env) {
      const { u } = env; const col = hexOf(o.props.color);
      const k = ease.inOutCubic(clamp(lt / 0.7, 0, 1));
      const p = new Path2D();
      const L = 300 * u;
      if (o.props.curve === 'recta') { p.moveTo(-L, 0); p.lineTo(L, 0); }
      else if (o.props.curve === 'bucle') { p.moveTo(-L, 60 * u); p.bezierCurveTo(-L * 0.2, 120 * u, -L * 0.1, -120 * u, -L * 0.35, -60 * u); p.bezierCurveTo(-L * 0.6, 0, L * 0.2, 80 * u, L, -20 * u); }
      else { p.moveTo(-L, 70 * u); p.quadraticCurveTo(0, -150 * u, L, 0); }
      const len = 1400 * u;
      ctx.save();
      ctx.strokeStyle = col; ctx.lineWidth = 12 * u; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 12 * u;
      ctx.setLineDash([len, len]); ctx.lineDashOffset = len * (1 - k);
      ctx.stroke(p);
      ctx.restore();
      if (k > 0.85) {
        const a = ease.outBack(clamp((k - 0.85) / 0.15, 0, 1));
        const ang = o.props.curve === 'recta' ? 0 : o.props.curve === 'bucle' ? -0.35 : 0.42;
        ctx.save(); ctx.translate(L, o.props.curve === 'bucle' ? -20 * u : 0); ctx.rotate(ang); ctx.scale(a, a);
        ctx.strokeStyle = col; ctx.lineWidth = 12 * u; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(-60 * u, -48 * u); ctx.lineTo(0, 0); ctx.lineTo(-60 * u, 48 * u); ctx.stroke();
        ctx.restore();
      }
      return { w: L * 2 + 40 * u, h: 300 * u };
    },
  },
  circulo: {
    name: 'Círculo', cat: 'senal', icon: 'circleDashed', dur: 2.5, y: 0.5, animIn: 'none', animOut: 'fade',
    props: { color: 'fluor', w: 460, h: 220 },
    fields: [{ k: 'color', label: 'Color', type: 'color' }, { k: 'w', label: 'Ancho', type: 'number', min: 100, max: 1000 }, { k: 'h', label: 'Alto', type: 'number', min: 60, max: 1000 }],
    draw(ctx, o, lt, env) {
      const { u } = env; const col = hexOf(o.props.color);
      const rx = (o.props.w || 460) * u / 2, ry = (o.props.h || 220) * u / 2;
      const k = ease.inOutCubic(clamp(lt / 0.8, 0, 1));
      const turns = 1.12 * k;
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 10 * u; ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 10 * u;
      ctx.beginPath();
      const steps = Math.max(2, Math.floor(80 * turns));
      for (let i = 0; i <= steps; i++) {
        const a = -2.2 + (i / 80) * Math.PI * 2;
        const wob = 1 + 0.05 * Math.sin(i * 0.15) + (i / 80) * 0.06;
        const x = Math.cos(a) * rx * wob, y = Math.sin(a) * ry * wob;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.restore();
      return { w: rx * 2.2, h: ry * 2.2 };
    },
  },
  subrayado: {
    name: 'Marcador', cat: 'senal', icon: 'strike', dur: 2.5, y: 0.5, animIn: 'none', animOut: 'fade',
    props: { color: 'fluor', w: 520 },
    fields: [{ k: 'color', label: 'Color', type: 'color' }, { k: 'w', label: 'Ancho', type: 'number', min: 80, max: 1000 }],
    draw(ctx, o, lt, env) {
      const { u } = env; const col = hexOf(o.props.color);
      const w = (o.props.w || 520) * u, h = 70 * u;
      const k = ease.outCubic(clamp(lt / 0.45, 0, 1));
      ctx.save(); ctx.globalAlpha *= 0.55; ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2 + 6 * u); ctx.lineTo(-w / 2 + w * k, -h / 2); ctx.lineTo(-w / 2 + w * k - 8 * u, h / 2); ctx.lineTo(-w / 2 + 4 * u, h / 2 - 4 * u); ctx.closePath(); ctx.fill();
      ctx.restore();
      return { w, h };
    },
  },
  zoom: {
    name: 'Zoom de cámara', cat: 'senal', icon: 'zoomIn', dur: 2, y: 0.42, animIn: 'none', animOut: 'none', camera: true,
    props: { amount: 1.25, mode: 'suave' },
    fields: [{ k: 'amount', label: 'Cantidad', type: 'range', min: 1.05, max: 2, step: 0.01 }, { k: 'mode', label: 'Tipo', type: 'select', options: [['suave', 'Acercamiento suave'], ['golpe', 'Golpe (punch-in)'], ['respira', 'Respiración']] }],
    draw(ctx, o, lt, env) {
      if (!env.editing) return { w: 300 * env.u, h: 300 * env.u };
      const { u } = env;
      ctx.save(); ctx.setLineDash([12 * u, 10 * u]); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3 * u;
      ctx.strokeRect(-150 * u, -150 * u, 300 * u, 300 * u); ctx.restore();
      drawIcon(ctx, 'zoomIn', -30 * u, -30 * u, 60 * u, C.white, 2.5);
      return { w: 300 * u, h: 300 * u };
    },
  },

  // --- Efectos y marca ---
  progreso: {
    name: 'Barra de progreso', cat: 'efecto', icon: 'timer', dur: 9999, y: 0.5, animIn: 'none', animOut: 'none', fixed: true, full: true,
    props: { color: 'fluor', pos: 'top' },
    fields: [{ k: 'color', label: 'Color', type: 'color' }, { k: 'pos', label: 'Posición', type: 'select', options: [['top', 'Arriba'], ['bottom', 'Abajo']] }],
    draw(ctx, o, lt, env) {
      const { u, W, H } = env;
      const p = clamp(env.t / Math.max(0.1, env.total), 0, 1);
      const h = 12 * u;
      const y = o.props.pos === 'bottom' ? env.safe.y + env.safe.h - h : env.safe.y - h * 3;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      rrect(ctx, env.safe.x, y, env.safe.w, h, h / 2); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
      rrect(ctx, env.safe.x, y, env.safe.w * p, h, h / 2); ctx.fillStyle = hexOf(o.props.color); ctx.fill();
      ctx.restore();
      return { w: W * 0.8, h: 40 * u };
    },
  },
  logo: {
    name: 'Logo', cat: 'efecto', icon: 'shield', dur: 9999, x: 0.5, y: 0.13, animIn: 'fade', animOut: 'fade',
    props: { size: 1, opacity: 0.9 },
    fields: [{ k: 'size', label: 'Tamaño', type: 'range', min: 0.4, max: 2.5, step: 0.05 }, { k: 'opacity', label: 'Opacidad', type: 'range', min: 0.2, max: 1, step: 0.05 }],
    draw(ctx, o, lt, env) {
      const { u } = env; const s = o.props.size || 1;
      ctx.save(); ctx.globalAlpha *= o.props.opacity ?? 0.9;
      if (env.logo) {
        const w = 300 * u * s; const h = w * env.logo.height / env.logo.width;
        ctx.drawImage(env.logo, -w / 2, -h / 2, w, h); ctx.restore();
        return { w, h };
      }
      const f1 = font(700, 40 * u * s, F.head), f2 = font(500, 30 * u * s, F.serif, true);
      ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 12 * u;
      text(ctx, 'TRADERS', 0, -16 * u * s, f1, C.white, 'center', -1 * u);
      text(ctx, 'Business School', 0, 22 * u * s, f2, C.white);
      ctx.restore();
      return { w: 260 * u * s, h: 90 * u * s };
    },
  },
  cuenta: {
    name: 'Cuenta atrás', cat: 'efecto', icon: 'clock', dur: 3, y: 0.45, animIn: 'none', animOut: 'fade',
    props: { from: 3, color: 'fluor' },
    fields: [{ k: 'from', label: 'Desde', type: 'number', min: 1, max: 10 }, { k: 'color', label: 'Color', type: 'color' }],
    draw(ctx, o, lt, env) {
      const { u } = env; const col = hexOf(o.props.color);
      const from = o.props.from || 3;
      const n = Math.max(1, from - Math.floor(lt));
      const f = lt % 1;
      const R = 150 * u;
      ctx.save();
      ctx.lineWidth = 14 * u; ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - f)); ctx.stroke();
      const s = 0.6 + 0.4 * ease.outBack(clamp(f / 0.3, 0, 1), 2);
      ctx.scale(s, s);
      text(ctx, String(n), 0, 8 * u, font(700, 190 * u, F.head), C.white);
      ctx.restore();
      return { w: R * 2.3, h: R * 2.3 };
    },
  },
  flash: {
    name: 'Flash', cat: 'efecto', icon: 'zap', dur: 0.35, y: 0.5, animIn: 'none', animOut: 'none', fixed: true, full: true,
    props: { color: 'white' },
    fields: [{ k: 'color', label: 'Color', type: 'color' }],
    draw(ctx, o, lt, env) {
      const d = o.dur || 0.35;
      const a = Math.sin(clamp(lt / d, 0, 1) * Math.PI);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = a * 0.9; ctx.fillStyle = hexOf(o.props.color); ctx.fillRect(0, 0, env.W, env.H);
      ctx.restore();
      return { w: env.W, h: env.H };
    },
  },
  marco: {
    name: 'Marco TBS', cat: 'efecto', icon: 'frame', dur: 4, y: 0.5, animIn: 'fade', animOut: 'fade', fixed: true, full: true,
    props: { label: 'TRADERS BUSINESS SCHOOL', color: 'white' },
    fields: [{ k: 'label', label: 'Texto', type: 'text' }, { k: 'color', label: 'Color', type: 'color' }],
    draw(ctx, o, lt, env) {
      const { u, safe } = env; const col = hexOf(o.props.color);
      const k = ease.outCubic(clamp(lt / 0.6, 0, 1));
      const L = 70 * u * k;
      const x0 = safe.x, y0 = safe.y, x1 = safe.x + safe.w, y1 = safe.y + safe.h;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.strokeStyle = col; ctx.lineWidth = 5 * u; ctx.lineCap = 'round';
      const cn = (x, y, dx, dy) => { ctx.beginPath(); ctx.moveTo(x + dx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * L); ctx.stroke(); };
      cn(x0, y0, 1, 1); cn(x1, y0, -1, 1); cn(x0, y1, 1, -1); cn(x1, y1, -1, -1);
      ctx.strokeStyle = withAlpha(col, 0.3); ctx.lineWidth = 2 * u;
      ctx.beginPath(); ctx.moveTo(x0 + 100 * u, y0); ctx.lineTo(x0 + 100 * u + (safe.w - 200 * u) * k, y0); ctx.stroke();
      if (o.props.label) text(ctx, o.props.label, (x0 + x1) / 2, y1 + 36 * u, font(700, 22 * u, F.head), withAlpha(col, 0.85), 'center', 5 * u);
      ctx.restore();
      return { w: env.W, h: env.H };
    },
  },
  knockout: {
    name: 'Texto con vídeo', cat: 'efecto', icon: 'film', dur: 2.5, y: 0.5, animIn: 'zoom', animOut: 'fade', knockout: true,
    props: { text: 'INVERTIR', dim: 0.85 },
    fields: [{ k: 'text', label: 'Texto', type: 'text' }, { k: 'dim', label: 'Oscurecer fondo', type: 'range', min: 0.3, max: 1, step: 0.05 }],
    draw() { return { w: 0, h: 0 }; },
  },
};

export const motionList = () => Object.entries(MOTIONS).map(([id, m]) => ({ id, ...m }));

// Texto relleno de vídeo (se dibuja directamente en coordenadas de fotograma)
export function drawKnockout(ctx, o, lt, env, st) {
  const { W, H, u } = env;
  if (!env.base) return;
  const s = String(o.props.text || '').toLocaleUpperCase('es-ES');
  let fs = 330 * u * (o.scale || 1);
  const f = () => `700 ${fs}px "${F.head}"`;
  ctx.font = f(); ctx.letterSpacing = `${-0.04 * fs}px`;
  let w = ctx.measureText(s).width;
  if (w > W * 0.94) { fs *= W * 0.94 / w; ctx.font = f(); ctx.letterSpacing = `${-0.04 * fs}px`; w = W * 0.94; }
  ctx.letterSpacing = '0px';
  const tmp = env.tmp;
  tmp.width = W; tmp.height = H;
  const t = tmp.getContext('2d');
  t.clearRect(0, 0, W, H);
  t.font = f(); t.letterSpacing = `${-0.04 * fs}px`; t.textAlign = 'center'; t.textBaseline = 'middle';
  t.save();
  t.translate(o.x * W, o.y * H); t.scale(st.scale, st.scale);
  t.fillStyle = '#fff'; t.fillText(s, 0, 0);
  t.restore();
  t.globalCompositeOperation = 'source-in';
  t.drawImage(env.base, 0, 0, W, H);
  t.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.globalAlpha = st.alpha;
  ctx.fillStyle = withAlpha(C.n900, o.props.dim ?? 0.85);
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(tmp, 0, 0);
  ctx.restore();
}
