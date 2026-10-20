import { html, useState, useEffect, useRef, useLayoutEffect, downloadBlob, uid, clamp } from '../../lib.js';
import { state, update, toast, emit, busy, setUI } from '../../core/store.js';
import { Btn, Section, Seg, Select, Toggle, Slider, Swatches } from '../controls.js';
import { Icon, TbsIcon, drawIcon } from '../icons.js';
import { player, timeBus } from '../../engine/player.js';
import { personMaskImage } from '../../ai/vision.js';
import { C, F } from '../../data/brand.js';
import { rrect, withAlpha } from '../../render/anim.js';
import { drawLogo, logoWidth } from '../../data/brandLogo.js';
import { TBS_ICON_OPTIONS } from '../../data/tbsIcons.js';

// Miniaturas por capas: cada texto, etiqueta, icono o logo se mueve, se edita y se cambia de tipografía.
// Plantillas basadas en las portadas de webinar del Design Kit TBS y en referencias de Pinterest.

const TF = { '9x16': [1080, 1920], '16x9': [1280, 720], '1x1': [1080, 1080], '4x5': [1080, 1350] };
const FAM = { head: F.head, body: F.body, serif: F.serif, script: F.script, mono: F.mono };
const FONT_OPTS = [['head', 'Space Grotesk'], ['body', 'Raleway'], ['serif', 'Playfair Display'], ['mono', 'Geist Mono'], ['script', 'Sacramento']];
const WEIGHTS = { head: [400, 500, 700], body: [400, 500, 600, 700, 800, 900], serif: [400, 500, 600, 700, 800, 900], script: [400], mono: [400, 500, 700] };
const TONE = { yellow: C.yellow, sky: C.sky, blue: C.blue, magenta: C.magenta, green: C.green, fluor: C.fluor, dark: C.n900, white: C.white };
export const HANDLE = '@traderbusinessschool';

// Paletas: fondo liso (portadas webinar) o sobre foto
const SOLID = [
  { id: 'fluor', name: 'Fluor', bg: C.fluor, title: C.fluorInk, accent: C.fluorInk, body: C.fluorInk },
  { id: 'olive', name: 'Oliva · Fluor', bg: C.fluorInk, title: C.fluor, accent: C.fluor, body: C.fluor },
  { id: 'blue', name: 'Azul · Fluor', bg: C.blue, title: C.fluor, accent: C.white, body: C.fluor },
  { id: 'magenta', name: 'Magenta', bg: C.magenta, title: C.magentaInk, accent: C.magentaInk, body: C.magentaInk },
  { id: 'dark', name: 'Oscuro', bg: C.n900, title: C.white, accent: C.fluor, body: C.white },
  { id: 'crema', name: 'Crema', bg: C.crema, title: C.n900, accent: C.magenta, body: C.n900 },
];
const PHOTO = [
  { id: 'fluor', name: 'Blanco + Fluor', title: C.white, accent: C.fluor, body: C.white, box: C.fluor, boxInk: C.n900 },
  { id: 'magenta', name: 'Blanco + Magenta', title: C.white, accent: C.magenta, body: C.white, box: C.magenta, boxInk: C.white },
  { id: 'blue', name: 'Blanco + Azul', title: C.white, accent: C.sky, body: C.white, box: C.blue, boxInk: C.white },
  { id: 'yellow', name: 'Blanco + Amarillo', title: C.white, accent: C.yellow, body: C.white, box: C.yellow, boxInk: C.n900 },
  { id: 'white', name: 'Caja blanca', title: C.white, accent: C.white, body: C.white, box: C.white, boxInk: C.n900 },
];

const T = (o) => ({ id: uid('l'), kind: 'text', font: 'head', weight: 700, italic: false, upper: false, size: 120, align: 'left', ls: -0.035, lh: 0.95, maxW: 0.86, shadow: false, box: false, behind: false, ...o });

/**
 * Zona segura de la miniatura (normalizada). Instagram recorta la portada:
 * en el perfil se ve en 3:4 y en el feed en 4:5 (centrado), TikTok y Facebook parecido.
 * Todo lo importante va dentro de la zona más estricta.
 */
export const THUMB_SAFE = {
  '9x16': { x: 0.07, y: 0.165, w: 0.86, h: 0.67, crops: [{ name: 'Perfil de Instagram (3:4)', y: 0.125, h: 0.75 }, { name: 'Feed (4:5)', y: 0.148, h: 0.703 }] },
  '4x5': { x: 0.08, y: 0.06, w: 0.84, h: 0.88, crops: [{ name: 'Perfil de Instagram (3:4)', x: 0.031, w: 0.938 }] },
  '1x1': { x: 0.15, y: 0.07, w: 0.7, h: 0.86, crops: [{ name: 'Perfil de Instagram (3:4)', x: 0.125, w: 0.75 }] },
  '16x9': { x: 0.06, y: 0.08, w: 0.88, h: 0.84, crops: [{ name: 'Duración de YouTube', x: 0.84, y: 0.88, w: 0.15, h: 0.1, corner: true }] },
};
const safeOf = (format) => THUMB_SAFE[format] || THUMB_SAFE['9x16'];

// Plantillas. Las posiciones se dan dentro de la zona segura S (fracciones de S): X(f), Y(f).
// x/y finales normalizados al lienzo (borde izquierdo/centro/derecho según alineación · y = borde superior).
export const THUMB_TEMPLATES = [
  {
    id: 'webinar', name: 'Webinar TBS', ref: 'Portadas TBS (Design Kit)', palette: 'solid', pal: 'fluor',
    bg: { photo: 'cutout', fit: 'height', anchor: 'right', zoom: 0.9, offX: 0, offY: 0.06, darken: 0, outline: false },
    layers: (W, H, X, Y, S) => {
      const v = H > W, mw = v ? S.w : S.w * 0.62;
      return [
        { id: uid('l'), kind: 'pill', role: 'title', text: 'Webinar Traders', icon: 'video', size: v ? 52 : 46, x: X(0), y: Y(0) },
        T({ role: 'title', text: 'INVERTIR,', size: v ? 220 : 200, x: X(0), y: Y(v ? 0.075 : 0.15), maxW: mw, lh: 0.9 }),
        T({ role: 'title', text: 'SIN ARRIESGAR', size: v ? 130 : 118, x: X(0), y: Y(v ? 0.2 : 0.41), maxW: mw }),
        { id: uid('l'), kind: 'icons', role: 'title', icons: ['handCoins', 'euro'], tones: ['yellow', 'sky'], size: v ? 108 : 92, x: X(0), y: Y(v ? 0.29 : 0.585) },
        T({ role: 'title', text: 'TU CAPITAL.', size: v ? 130 : 118, x: X(v ? 0.235 : 0.17), y: Y(v ? 0.288 : 0.58), maxW: v ? S.w * 0.76 : S.w * 0.45 }),
        T({ role: 'body', text: HANDLE, font: 'head', weight: 500, size: v ? 42 : 36, x: X(0), y: Y(v ? 0.955 : 0.94), ls: -0.01 }),
      ];
    },
  },
  {
    id: 'detras', name: 'Texto detrás', ref: 'Pinterest · texto gigante detrás de la persona', palette: 'solid', pal: 'magenta',
    bg: { photo: 'cutout', fit: 'cover', anchor: 'bottom', zoom: 1, offX: 0, offY: 0.04, darken: 0, outline: true },
    layers: (W, H, X, Y, S) => {
      const v = H > W;
      return [
        T({ role: 'title', text: 'INVERTIR', size: v ? 290 : 250, align: 'center', x: X(0.5), y: Y(v ? 0.04 : 0), maxW: S.w, behind: true, lh: 0.86 }),
        // estos dos van encima de la persona: blancos con sombra para que se lean siempre
        T({ role: 'onPhoto', text: 'sin miedo', font: 'serif', weight: 600, italic: true, size: v ? 116 : 92, align: 'center', x: X(0.5), y: Y(v ? 0.8 : 0.74), ls: -0.02, shadow: true }),
        T({ role: 'onPhoto', text: HANDLE, weight: 500, size: v ? 40 : 34, align: 'center', x: X(0.5), y: Y(0.955), ls: -0.01, shadow: true }),
      ];
    },
  },
  {
    id: 'gancho', name: 'Gancho', ref: 'Guille Collado · titular grande sobre la foto', palette: 'photo', pal: 'fluor',
    bg: { photo: 'full', fit: 'cover', anchor: 'center', zoom: 1, offX: 0, offY: 0, darken: 0.45, outline: false },
    layers: (W, H, X, Y, S) => {
      const v = H > W;
      return [
        T({ role: 'title', text: 'Cómo invertir\n*sin miedo*', size: v ? 140 : 116, align: 'center', x: X(0.5), y: Y(0.02), maxW: S.w, shadow: true, lh: 0.98 }),
        T({ role: 'body', text: HANDLE, weight: 500, size: v ? 40 : 34, align: 'center', x: X(0.5), y: Y(0.955), ls: -0.01, shadow: true }),
      ];
    },
  },
  {
    id: 'editorial', name: 'Editorial', ref: 'Marco Dimio · minúsculas y serif', palette: 'photo', pal: 'white',
    bg: { photo: 'full', fit: 'cover', anchor: 'center', zoom: 1, offX: 0, offY: 0, darken: 0.35, outline: false },
    layers: (W, H, X, Y, S) => {
      const v = H > W;
      return [
        T({ role: 'title', text: 'lo que nadie te cuenta', weight: 700, size: v ? 92 : 78, align: 'center', x: X(0.5), y: Y(0.03), maxW: S.w, ls: -0.03, shadow: true }),
        T({ role: 'accent', text: 'de la bolsa', font: 'serif', weight: 500, italic: true, size: v ? 106 : 90, align: 'center', x: X(0.5), y: Y(v ? 0.1 : 0.17), maxW: S.w, ls: -0.01, shadow: true }),
      ];
    },
  },
  {
    id: 'cajas', name: 'Cajas', ref: 'Pinterest · titular en cajas de color', palette: 'photo', pal: 'fluor',
    bg: { photo: 'full', fit: 'cover', anchor: 'center', zoom: 1, offX: 0, offY: 0, darken: 0.15, outline: false },
    layers: (W, H, X, Y, S) => {
      const v = H > W;
      return [
        T({ role: 'box', text: 'EL ERROR QUE\nTE HACE PERDER\nDINERO', size: v ? 88 : 72, x: X(0.03), y: Y(v ? 0.6 : 0.45), box: true, lh: 1.32, maxW: S.w * 0.94 }),
        T({ role: 'body', text: HANDLE, weight: 500, size: v ? 38 : 32, x: X(0.03), y: Y(0.955), ls: -0.01, shadow: true }),
      ];
    },
  },
  {
    id: 'split', name: 'Dividida', ref: 'Pinterest · foto arriba, color abajo', palette: 'solid', pal: 'olive',
    bg: { photo: 'top', fit: 'cover', anchor: 'center', zoom: 1, offX: 0, offY: 0, darken: 0, outline: false, split: 0.56 },
    layers: (W, H, X, Y, S) => {
      const v = H > W;
      return [
        { id: uid('l'), kind: 'pill', role: 'title', text: 'Clase gratuita', icon: 'graduation', size: v ? 44 : 38, x: X(0), y: v ? 0.585 : 0.6 },
        T({ role: 'title', text: 'APRENDE A LEER\nEL MERCADO', size: v ? 106 : 82, x: X(0), y: v ? 0.635 : 0.71, maxW: S.w }),
        T({ role: 'body', text: HANDLE, weight: 500, size: v ? 38 : 32, x: X(0), y: Y(0.955), ls: -0.01 }),
      ];
    },
  },
  {
    id: 'dato', name: 'Dato', ref: 'Número gigante + frase', palette: 'solid', pal: 'dark',
    bg: { photo: 'cutout', fit: 'height', anchor: 'right', zoom: 0.88, offX: 0.08, offY: 0.08, darken: 0, outline: false },
    layers: (W, H, X, Y, S) => {
      const v = H > W;
      return [
        T({ role: 'accent', text: '+37%', size: v ? 310 : 250, x: X(0), y: Y(0), ls: -0.05, maxW: v ? S.w : S.w * 0.6 }),
        T({ role: 'title', text: 'de rentabilidad\nen 12 meses', weight: 500, size: v ? 86 : 70, x: X(0), y: Y(v ? 0.22 : 0.45), ls: -0.03, maxW: v ? S.w : S.w * 0.55 }),
        T({ role: 'body', text: HANDLE, weight: 500, size: v ? 40 : 34, x: X(0), y: Y(0.955), ls: -0.01 }),
      ];
    },
  },
];

const tplById = (id) => THUMB_TEMPLATES.find(t => t.id === id) || THUMB_TEMPLATES[0];
const palettesFor = (tpl) => (tpl.palette === 'photo' ? PHOTO : SOLID);

export function makeThumb(tplId = 'webinar', format = '9x16', palId = null) {
  const tpl = tplById(tplId);
  const [W, H] = TF[format] || TF['9x16'];
  const S = safeOf(format);
  const X = (f) => S.x + f * S.w, Y = (f) => S.y + f * S.h;
  const th = { v: 2, tpl: tpl.id, format, pal: palId || tpl.pal, bg: { ...tpl.bg, color: C.n900 }, layers: tpl.layers(W, H, X, Y, S) };
  // "Texto detrás": el titular se coloca para que la cabeza lo tape en parte
  if (tpl.id === 'detras') {
    const top = personTop(th, W, H);
    const title = th.layers.find(l => l.behind);
    if (top !== null && title) {
      const fs = (title.size || 200) * Math.min(W, H) / 1080;
      title.y = clamp((top + fs * 0.45) / H - (fs * 0.86) / H, S.y, S.y + S.h * 0.6);
    }
  }
  return applyPalette(th, th.pal);
}
export const defaultThumb = () => makeThumb('webinar', '9x16');

function applyPalette(th, palId) {
  const tpl = tplById(th.tpl);
  const P = palettesFor(tpl).find(p => p.id === palId) || palettesFor(tpl)[0];
  th.pal = P.id;
  if (P.bg) th.bg = { ...th.bg, color: P.bg };
  th.layers = th.layers.map(l => {
    const n = { ...l };
    if (l.role === 'box') { n.color = P.boxInk || C.n900; n.boxColor = P.box || C.fluor; n.accent = P.title; }
    else if (l.role === 'onPhoto') { n.color = C.white; n.accent = P.bg && P.bg !== C.n900 ? P.bg : C.fluor; }
    else { n.color = P[l.role] || P.body; n.accent = P.accent; }
    if (l.kind === 'icons') n.ring = tpl.palette === 'photo' ? C.n900 : P.title;
    return n;
  });
  return th;
}

// ---------- Dibujo ----------
const rt = { photo: null, mask: null, key: null, boxes: [] };

function segmentsOf(line) {
  // *palabra* = color de acento
  const out = []; let acc = false;
  for (const part of line.split('*')) { if (part) out.push({ t: part, acc }); acc = !acc; }
  return out;
}

function textLayer(ctx, l, W, H, u) {
  const fam = FAM[l.font] || F.head;
  const lines = String(l.text || '').split('\n').map(s => (l.upper ? s.toLocaleUpperCase('es-ES') : s));
  let fs = (l.size || 100) * u;
  const font = () => `${l.italic ? 'italic ' : ''}${l.weight || 700} ${fs}px "${fam}"`;
  const measure = (s) => { ctx.font = font(); ctx.letterSpacing = `${(l.ls || 0) * fs}px`; return ctx.measureText(s.replace(/\*/g, '')).width; };
  let w = Math.max(1, ...lines.map(measure));
  const maxW = (l.maxW || 0.9) * W;
  if (w > maxW) { fs *= maxW / w; w = Math.max(1, ...lines.map(measure)); }
  const lh = fs * (l.lh || 1);
  const h = lh * lines.length;
  const x0 = l.x * W, y0 = l.y * H;
  const left = l.align === 'center' ? x0 - w / 2 : l.align === 'right' ? x0 - w : x0;
  ctx.font = font(); ctx.letterSpacing = `${(l.ls || 0) * fs}px`; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  lines.forEach((line, i) => {
    const lw = measure(line);
    let x = l.align === 'center' ? x0 - lw / 2 : l.align === 'right' ? x0 - lw : x0;
    const base = y0 + lh * i + fs * 0.8;
    if (l.box) {
      const px = fs * 0.22, py = fs * 0.12;
      rrect(ctx, x - px, base - fs * 0.8 - py * 0.6, lw + px * 2, fs * 0.98 + py * 1.2, fs * 0.12);
      ctx.fillStyle = l.boxColor || C.fluor; ctx.fill();
    }
    ctx.font = font(); ctx.letterSpacing = `${(l.ls || 0) * fs}px`;
    for (const sg of segmentsOf(line)) {
      ctx.save();
      if (l.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = fs * 0.22; ctx.shadowOffsetY = fs * 0.04; }
      if (l.stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = fs * 0.08; ctx.strokeStyle = l.stroke; ctx.strokeText(sg.t, x, base); }
      ctx.fillStyle = sg.acc ? (l.accent || C.fluor) : (l.color || C.white);
      ctx.fillText(sg.t, x, base);
      ctx.restore();
      x += ctx.measureText(sg.t).width;
    }
  });
  ctx.letterSpacing = '0px';
  return { x: left, y: y0, w, h };
}

function pillLayer(ctx, l, W, H, u) {
  const fs = (l.size || 50) * u;
  ctx.font = `700 ${fs}px "${F.head}"`; ctx.letterSpacing = `${-0.02 * fs}px`;
  const tw = ctx.measureText(l.text || '').width;
  const ic = l.icon ? fs * 0.86 : 0;
  const padX = fs * 0.55, gap = ic ? fs * 0.25 : 0, h = fs * 1.45, w = tw + padX * 2 + ic + gap;
  const x = l.x * W, y = l.y * H;
  const col = l.color || C.fluorInk;
  rrect(ctx, x, y, w, h, h / 2);
  if (l.filled) { ctx.fillStyle = col; ctx.fill(); }
  else { ctx.lineWidth = Math.max(2, fs * 0.075); ctx.strokeStyle = col; ctx.stroke(); }
  const ink = l.filled ? (l.ink || C.white) : col;
  if (ic) drawIcon(ctx, l.icon, x + padX, y + (h - ic) / 2, ic, ink, 2.1);
  ctx.fillStyle = ink; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(l.text || '', x + padX + ic + gap, y + h / 2 + fs * 0.04);
  ctx.letterSpacing = '0px';
  return { x, y, w, h };
}

function iconsLayer(ctx, l, W, H, u) {
  const d = (l.size || 110) * u, R = d / 2, ring = d * 0.08;
  const n = (l.icons || []).length;
  const step = d * 0.8;
  const x = l.x * W, y = l.y * H;
  (l.icons || []).forEach((k, i) => {
    const cx = x + R + i * step, cy = y + R;
    if (l.ring !== 'none') { ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = l.ring || C.fluorInk; ctx.fill(); }
    ctx.beginPath(); ctx.arc(cx, cy, R - ring, 0, Math.PI * 2); ctx.fillStyle = TONE[l.tones?.[i]] || C.yellow; ctx.fill();
    drawIcon(ctx, k, cx - R * 0.55, cy - R * 0.55, R * 1.1, ['fluor', 'white'].includes(l.tones?.[i]) ? C.n900 : C.white, 2);
  });
  return { x, y, w: n ? d + (n - 1) * step : d, h: d };
}

function logoLayer(ctx, l, W, H, u) {
  const h = (l.size || 70) * u;
  const w = logoWidth(h, l.mode || 'full');
  drawLogo(ctx, l.x * W, l.y * H, h, l.color || C.white, l.mode || 'full', l.mark || l.color || C.white);
  return { x: l.x * W, y: l.y * H, w, h };
}

function photoRect(th, W, H) {
  const ph = rt.photo; if (!ph) return null;
  const b = th.bg;
  const area = b.photo === 'top' ? { x: 0, y: 0, w: W, h: H * (b.split || 0.58) } : { x: 0, y: 0, w: W, h: H };
  let s = b.fit === 'height' ? area.h / ph.height : Math.max(area.w / ph.width, area.h / ph.height);
  s *= b.zoom || 1;
  const w = ph.width * s, h = ph.height * s;
  let x = area.x + (area.w - w) / 2, y = area.y + (area.h - h) / 2;
  if (b.anchor === 'right') x = area.x + area.w - w * 0.92;
  if (b.anchor === 'left') x = area.x - w * 0.08;
  if (b.anchor === 'bottom') y = area.y + area.h - h;
  return { x: x + (b.offX || 0) * W, y: y + (b.offY || 0) * H, w, h, area };
}

// Altura (px del lienzo) donde empieza la persona según la máscara, o null
function personTop(th, W, H) {
  if (!rt.photo || !rt.mask) return null;
  const r = photoRect(th, W, H);
  if (!r) return null;
  const m = rt.mask, mw = 64, mh = Math.max(1, Math.round(64 * m.height / m.width));
  const c = document.createElement('canvas'); c.width = mw; c.height = mh;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(m, 0, 0, mw, mh);
  const d = x.getImageData(0, 0, mw, mh).data;
  for (let yy = 0; yy < mh; yy++) {
    let n = 0;
    for (let xx = 0; xx < mw; xx++) if (d[(yy * mw + xx) * 4 + 3] > 128) n++;
    if (n > mw * 0.04) return r.y + (yy / mh) * r.h;
  }
  return null;
}

function cutout(W, H, r, outline) {
  if (!rt.photo || !rt.mask) return null;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.drawImage(rt.photo, r.x, r.y, r.w, r.h);
  x.globalCompositeOperation = 'destination-in';
  x.filter = 'blur(1.5px)';
  x.drawImage(rt.mask, r.x, r.y, r.w, r.h);
  x.filter = 'none';
  x.globalCompositeOperation = 'source-over';
  if (!outline) return c;
  const o = document.createElement('canvas'); o.width = W; o.height = H;
  const ox = o.getContext('2d');
  const rr = Math.max(6, W * 0.009);
  for (let a = 0; a < 16; a++) ox.drawImage(c, Math.cos(a / 16 * Math.PI * 2) * rr, Math.sin(a / 16 * Math.PI * 2) * rr);
  ox.globalCompositeOperation = 'source-in'; ox.fillStyle = C.white; ox.fillRect(0, 0, W, H);
  ox.globalCompositeOperation = 'source-over'; ox.drawImage(c, 0, 0);
  return o;
}

export function drawThumb(ctx, W, H, th) {
  const u = Math.min(W, H) / 1080;
  const b = th.bg;
  ctx.save();
  ctx.fillStyle = b.color || C.n900; ctx.fillRect(0, 0, W, H);
  const r = photoRect(th, W, H);
  if (r && (b.photo === 'full' || b.photo === 'top')) {
    ctx.save();
    if (b.photo === 'top') { ctx.beginPath(); ctx.rect(r.area.x, r.area.y, r.area.w, r.area.h); ctx.clip(); }
    ctx.drawImage(rt.photo, r.x, r.y, r.w, r.h);
    ctx.restore();
  }
  if (b.darken > 0 && b.photo !== 'cutout') {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.6);
    g.addColorStop(0, `rgba(0,0,0,${b.darken})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const g2 = ctx.createLinearGradient(0, H * 0.6, 0, H);
    g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, `rgba(0,0,0,${b.darken})`);
    ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
  }
  const boxes = [];
  const drawL = (l) => {
    if (l.hidden) return;
    let bx;
    if (l.kind === 'text') bx = textLayer(ctx, l, W, H, u);
    else if (l.kind === 'pill') bx = pillLayer(ctx, l, W, H, u);
    else if (l.kind === 'icons') bx = iconsLayer(ctx, l, W, H, u);
    else if (l.kind === 'logo') bx = logoLayer(ctx, l, W, H, u);
    if (bx) boxes.push({ id: l.id, ...bx });
  };
  th.layers.filter(l => l.behind).forEach(drawL);
  // persona recortada (delante de las capas "detrás")
  const needCut = r && (b.photo === 'cutout' || ((b.photo === 'full' || b.photo === 'top') && th.layers.some(l => l.behind)));
  if (needCut) { const c = cutout(W, H, r, b.photo === 'cutout' && b.outline); if (c) ctx.drawImage(c, 0, 0); else if (b.photo === 'cutout') ctx.drawImage(rt.photo, r.x, r.y, r.w, r.h); }
  th.layers.filter(l => !l.behind).forEach(drawL);
  ctx.restore();
  return boxes;
}

async function captureForThumb() {
  if (!state.project.clips.length) { toast('Importa un vídeo primero', 'err'); return; }
  busy({ title: 'Capturando fotograma', text: 'Recortando a la persona con IA…', progress: null });
  try {
    const c = await player.capture(false);
    rt.photo = c;
    try { const m = await personMaskImage(c); if (m) { const mc = document.createElement('canvas'); mc.width = m.width; mc.height = m.height; mc.getContext('2d').drawImage(m, 0, 0); rt.mask = mc; } }
    catch (e) { console.warn(e); rt.mask = null; toast('No se pudo recortar a la persona', 'err'); }
    rt.key = Date.now();
    const cur = curThumb();
    // con la plantilla "Texto detrás", el titular se recoloca detrás de la nueva cabeza
    const fresh = cur.tpl === 'detras' ? makeThumb('detras', cur.format, cur.pal) : null;
    update(pp => {
      const th = { ...cur, frameT: timeBus.t };
      if (fresh) th.layers = cur.layers.map(l => (l.behind ? { ...l, y: fresh.layers.find(f => f.behind)?.y ?? l.y } : l));
      pp.thumb = th;
    }, { history: false });
    previewCache.clear();
  } finally { busy(null); emit(); }
}

const curThumb = () => (state.project.thumb?.v === 2 ? state.project.thumb : defaultThumb());
const setThumb = (fn, key) => update(pp => { const th = structuredClone(pp.thumb?.v === 2 ? pp.thumb : defaultThumb()); fn(th); pp.thumb = th; }, { key });
const setLayer = (id, patch, key) => setThumb(th => { const l = th.layers.find(x => x.id === id); if (l) Object.assign(l, patch); }, key);

const outOfSafe = (b, format, W, H) => {
  const S = safeOf(format), e = 2;
  return b.x < S.x * W - e || b.y < S.y * H - e || b.x + b.w > (S.x + S.w) * W + e || b.y + b.h > (S.y + S.h) * H + e;
};

// Guías: recortes de Instagram/feeds y zona segura
function ThumbSafe({ format, w, h }) {
  const S = safeOf(format);
  return html`<div class="th-safe-wrap">
    ${S.crops.map((c, i) => html`<div class=${'th-crop' + (c.corner ? ' corner' : '') + (i % 2 ? ' r' : '')} style=${`left:${(c.x ?? 0) * w}px;top:${(c.y ?? 0) * h}px;width:${(c.w ?? 1) * w}px;height:${(c.h ?? 1) * h}px`}><span>${c.name}</span></div>`)}
    <div class="th-safe" style=${`left:${S.x * w}px;top:${S.y * h}px;width:${S.w * w}px;height:${S.h * h}px`}><span>Zona segura</span></div>
  </div>`;
}

// ---------- Escenario (vista previa grande con capas arrastrables) ----------
let selLayer = null;
function ThumbStage() {
  const th = curThumb();
  const ref = useRef(), areaRef = useRef();
  const [box, setBox] = useState({ w: 300, h: 500 });
  const [guides, setGuides] = useState([]);
  const [editing, setEditing] = useState(null);
  const [, force] = useState(0);
  const [W, H] = TF[th.format] || TF['9x16'];
  useLayoutEffect(() => {
    const el = areaRef.current; if (!el) return;
    const fit = () => { const r = el.getBoundingClientRect(); const ar = W / H; let w = r.width - 32, h = w / ar; if (h > r.height - 32) { h = r.height - 32; w = h * ar; } setBox({ w: Math.max(80, w), h: Math.max(80, h) }); };
    fit(); const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect();
  }, [W, H]);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    c.width = W; c.height = H;
    rt.boxes = drawThumb(c.getContext('2d'), W, H, th);
  });
  const k = box.w / W;
  const sel = th.layers.find(l => l.id === selLayer);
  const sb = sel && rt.boxes.find(b => b.id === sel.id);
  const hit = (e) => {
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / k, y = (e.clientY - r.top) / k;
    return [...rt.boxes].reverse().find(b => x >= b.x - 10 && x <= b.x + b.w + 10 && y >= b.y - 10 && y <= b.y + b.h + 10);
  };
  const down = (e) => {
    const h = hit(e);
    selLayer = h ? h.id : null; emit(); force(n => n + 1);
    if (!h) return;
    e.preventDefault();
    const l = th.layers.find(x => x.id === h.id);
    const sx = e.clientX, sy = e.clientY, x0 = l.x, y0 = l.y, b0 = { ...h };
    let moved = false;
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true;
      let dx = (ev.clientX - sx) / k, dy = (ev.clientY - sy) / k;
      const gs = [];
      if (!ev.altKey) {
        // imán: centro y bordes de la zona segura (recorte de Instagram)
        const th2 = W * 0.012, S = safeOf(th.format);
        const sl = S.x * W, sr = (S.x + S.w) * W, st = S.y * H, sbm = (S.y + S.h) * H;
        const L = b0.x + dx, R = L + b0.w, Cx = L + b0.w / 2, Tp = b0.y + dy, Bt = Tp + b0.h, Cy = Tp + b0.h / 2;
        const snapX = [[Cx, W / 2], [L, sl], [R, sr]].find(([v, t]) => Math.abs(v - t) < th2);
        if (snapX) { dx += snapX[1] - snapX[0]; gs.push({ x: snapX[1] }); }
        const snapY = [[Cy, H / 2], [Tp, st], [Bt, sbm]].find(([v, t]) => Math.abs(v - t) < th2);
        if (snapY) { dy += snapY[1] - snapY[0]; gs.push({ y: snapY[1] }); }
      }
      setGuides(gs);
      setLayer(l.id, { x: x0 + dx / W, y: y0 + dy / H }, 'thmove' + l.id);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setGuides([]); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const resize = (e) => {
    e.preventDefault(); e.stopPropagation();
    const l = sel; const s0 = l.size || 100, sx = e.clientX;
    const move = (ev) => setLayer(l.id, { size: clamp(s0 * (1 + (ev.clientX - sx) / Math.max(40, sb.w * k)), 12, 600) }, 'thsize' + l.id);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const dbl = (e) => { const h = hit(e); const l = h && th.layers.find(x => x.id === h.id); if (l && (l.kind === 'text' || l.kind === 'pill')) setEditing(l.id); };
  const ed = editing && th.layers.find(l => l.id === editing);
  const eb = ed && rt.boxes.find(b => b.id === ed.id);
  return html`<section class="stage">
    <div class="stage-head"><span class="dim small">Arrastra · doble clic = escribir · Alt = sin imán</span>
      <button class=${'tl-icon' + (state.ui.thumbSafe !== false ? ' on' : '')} title="Ver el recorte de Instagram y la zona segura" onClick=${() => setUI({ thumbSafe: state.ui.thumbSafe === false })}><${Icon} name="shield" /></button></div>
    <div class="stage-area" ref=${areaRef}>
      ${!rt.photo && th.bg.photo !== 'none' && html`<div class="thumb-hint"><${Btn} cls="primary" icon="camera" onClick=${captureForThumb}>Capturar el fotograma actual</${Btn}></div>`}
      <div class="thumb-wrap" style=${`width:${box.w}px;height:${box.h}px`}>
        <canvas ref=${ref} class="thumb-canvas" style=${`width:${box.w}px;height:${box.h}px`} onPointerDown=${down} onDblClick=${dbl}></canvas>
        ${state.ui.thumbSafe !== false && html`<${ThumbSafe} format=${th.format} w=${box.w} h=${box.h} />`}
        ${guides.map(g => g.x !== undefined ? html`<div class="snap-guide v" style=${`left:${g.x * k}px`}></div>` : html`<div class="snap-guide h" style=${`top:${g.y * k}px`}></div>`)}
        ${sb && !ed && html`<div class=${'th-sel' + (outOfSafe(sb, th.format, W, H) ? ' out' : '')} title=${outOfSafe(sb, th.format, W, H) ? 'Fuera de la zona segura: Instagram puede recortarlo' : ''} style=${`left:${sb.x * k - 4}px;top:${sb.y * k - 4}px;width:${sb.w * k + 8}px;height:${sb.h * k + 8}px`}>
          <span class="h br" title="Tamaño" onPointerDown=${resize}></span></div>`}
        ${ed && eb && html`<div class="cap-editor" style=${`left:${clamp(eb.x * k - 10, 6, box.w - 240)}px;top:${Math.max(6, eb.y * k - 10)}px;width:${Math.max(230, Math.min(box.w - 12, eb.w * k + 20))}px`}>
          <textarea autofocus rows=${Math.max(1, String(ed.text).split('\n').length)} value=${ed.text} onInput=${e => setLayer(ed.id, { text: e.target.value }, 'thtext' + ed.id)}
            onKeyDown=${e => { if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); setEditing(null); } }} onBlur=${() => setEditing(null)}></textarea>
          <div class="cap-editor-foot"><span>Intro: nueva línea · *palabra* = color de acento</span></div>
        </div>`}
      </div>
    </div>
  </section>`;
}

// ---------- Panel ----------
const previewCache = new Map();
function tplPreview(tpl, format) {
  const key = tpl.id + format + (rt.key || 0);
  if (previewCache.has(key)) return previewCache.get(key);
  const [W, H] = TF[format] || TF['9x16'];
  const s = 240 / Math.max(W, H);
  const c = document.createElement('canvas'); c.width = Math.round(W * s); c.height = Math.round(H * s);
  const x = c.getContext('2d'); x.scale(s, s);
  const th = makeThumb(tpl.id, format);
  if (!rt.photo && th.bg.photo !== 'none') { th.bg = { ...th.bg }; }
  drawThumb(x, W, H, th);
  const url = c.toDataURL('image/jpeg', 0.8);
  previewCache.set(key, url);
  return url;
}

const LAYER_NAMES = { text: 'Texto', pill: 'Etiqueta', icons: 'Iconos', logo: 'Logo TBS' };
const layerLabel = (l) => (l.kind === 'text' || l.kind === 'pill' ? String(l.text || '').replace(/\*/g, '').split('\n')[0].slice(0, 26) || LAYER_NAMES[l.kind] : LAYER_NAMES[l.kind]);

function LayerProps({ l }) {
  const set = (k) => (v) => setLayer(l.id, { [k]: v }, 'thp' + l.id + k);
  const th = curThumb();
  const move = (dir) => setThumb(t => { const i = t.layers.findIndex(x => x.id === l.id); const j = clamp(i + dir, 0, t.layers.length - 1); const [x] = t.layers.splice(i, 1); t.layers.splice(j, 0, x); });
  return html`<div class="stack">
    ${(l.kind === 'text' || l.kind === 'pill') && html`<label class="field"><span class="field-label">Texto <span class="dim small">· *palabra* = acento</span></span>
      <textarea class="textarea" rows="3" value=${l.text} onInput=${e => set('text')(e.target.value)}></textarea></label>`}
    ${l.kind === 'text' && html`
      <div class="grid2">
        <${Select} label="Tipografía" value=${l.font} options=${FONT_OPTS} onChange=${v => setLayer(l.id, { font: v, weight: (WEIGHTS[v] || [700]).includes(l.weight) ? l.weight : (WEIGHTS[v] || [700]).slice(-1)[0] })} />
        <${Select} label="Peso" value=${String(l.weight)} options=${(WEIGHTS[l.font] || [400, 700]).map(w => [String(w), { 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extrabold', 900: 'Black' }[w]])} onChange=${v => set('weight')(parseInt(v))} />
      </div>
      <div class="row" style="gap:6px">
        <button class=${'btn sm' + (l.upper ? ' on' : '')} onClick=${() => set('upper')(!l.upper)} title="Mayúsculas">AA</button>
        <button class=${'btn sm' + (l.italic ? ' on' : '')} onClick=${() => set('italic')(!l.italic)} title="Cursiva" style="font-style:italic;font-family:var(--font-serif)">I</button>
        <div class="grow"><${Seg} small value=${l.align} onChange=${v => {
          // mantener el bloque en su sitio al cambiar la alineación
          const b = rt.boxes.find(x => x.id === l.id); const [W] = TF[th.format];
          const nx = b ? (v === 'left' ? b.x : v === 'center' ? b.x + b.w / 2 : b.x + b.w) / W : l.x;
          setLayer(l.id, { align: v, x: nx });
        }} options=${[['left', 'Izq.'], ['center', 'Centro'], ['right', 'Der.']]} /></div>
      </div>
      <${Slider} label="Tamaño" value=${l.size} min=${20} max=${480} step=${1} format=${v => Math.round(v) + ' px'} onInput=${set('size')} />
      <${Slider} label="Interletrado" value=${l.ls ?? 0} min=${-0.1} max=${0.3} step=${0.005} center format=${v => (v * 100).toFixed(1).replace('.', ',') + '%'} onInput=${set('ls')} />
      <${Slider} label="Interlineado" value=${l.lh ?? 1} min=${0.7} max=${1.6} step=${0.01} format=${v => v.toFixed(2).replace('.', ',')} onInput=${set('lh')} />
      <${Swatches} label="Color" value=${l.color} onChange=${set('color')} />
      <${Swatches} label="Color de acento (*palabra*)" value=${l.accent} onChange=${set('accent')} />
      <${Toggle} label="Sombra" value=${!!l.shadow} onChange=${set('shadow')} />
      <${Toggle} label="Fondo por línea" value=${!!l.box} onChange=${set('box')} />
      ${l.box && html`<${Swatches} label="Color del fondo" value=${l.boxColor} onChange=${set('boxColor')} />`}
      <${Toggle} label="Detrás de la persona" sub="Necesita una foto con persona" value=${!!l.behind} onChange=${set('behind')} />`}
    ${l.kind === 'pill' && html`
      <${Slider} label="Tamaño" value=${l.size} min=${20} max=${160} step=${1} format=${v => Math.round(v) + ' px'} onInput=${set('size')} />
      <${Swatches} label="Color" value=${l.color} onChange=${set('color')} />
      <${Toggle} label="Relleno" value=${!!l.filled} onChange=${set('filled')} />
      ${l.filled && html`<${Swatches} label="Color del texto" value=${l.ink} onChange=${set('ink')} />`}
      <div class="field"><span class="field-label">Icono</span><div class="icon-grid">
        <button class=${'icon-cell' + (!l.icon ? ' on' : '')} onClick=${() => set('icon')('')}><${Icon} name="x" /></button>
        ${TBS_ICON_OPTIONS.map(([k2, n]) => html`<button class=${'icon-cell' + (l.icon === k2 ? ' on' : '')} title=${n} onClick=${() => set('icon')(k2)}><${TbsIcon} name=${k2} /></button>`)}</div></div>`}
    ${l.kind === 'icons' && html`
      <${Slider} label="Tamaño" value=${l.size} min=${40} max=${300} step=${1} format=${v => Math.round(v) + ' px'} onInput=${set('size')} />
      ${(l.icons || []).map((ic, i) => html`<div class="field"><span class="field-label">Icono ${i + 1}</span>
        <${Seg} small value=${l.tones?.[i] || 'yellow'} onChange=${v => setLayer(l.id, { tones: Object.assign([...(l.tones || [])], { [i]: v }) })} options=${[['yellow', 'Amarillo'], ['sky', 'Cielo'], ['magenta', 'Magenta'], ['green', 'Verde'], ['fluor', 'Fluor']]} />
        <div class="icon-grid" style="margin-top:6px">${TBS_ICON_OPTIONS.map(([k2, n]) => html`<button class=${'icon-cell' + (ic === k2 ? ' on' : '')} title=${n} onClick=${() => setLayer(l.id, { icons: Object.assign([...l.icons], { [i]: k2 }) })}><${TbsIcon} name=${k2} /></button>`)}</div></div>`)}
      <div class="row" style="gap:6px">
        ${(l.icons || []).length < 3 && html`<${Btn} cls="sm" icon="plus" onClick=${() => setLayer(l.id, { icons: [...l.icons, 'trendingUp'], tones: [...(l.tones || []), 'green'] })}>Añadir icono</${Btn}>`}
        ${(l.icons || []).length > 1 && html`<${Btn} cls="sm ghost" onClick=${() => setLayer(l.id, { icons: l.icons.slice(0, -1), tones: (l.tones || []).slice(0, -1) })}>Quitar el último</${Btn}>`}
      </div>
      <${Swatches} label="Aro" value=${l.ring} onChange=${set('ring')} />`}
    ${l.kind === 'logo' && html`
      <${Seg} small value=${l.mode || 'full'} onChange=${set('mode')} options=${[['full', 'Símbolo + traders'], ['mark', 'Solo símbolo']]} />
      <${Slider} label="Tamaño" value=${l.size} min=${30} max=${260} step=${1} format=${v => Math.round(v) + ' px'} onInput=${set('size')} />
      <${Swatches} label="Color" value=${l.color} onChange=${set('color')} />
      <${Swatches} label="Color del símbolo" value=${l.mark} onChange=${set('mark')} />`}
    <div class="row" style="gap:4px">
      <${Btn} cls="icon sm" icon="bringFront" title="Subir capa" onClick=${() => move(1)} />
      <${Btn} cls="icon sm" icon="sendBack" title="Bajar capa" onClick=${() => move(-1)} />
      <${Btn} cls="icon sm" icon="copy" title="Duplicar" onClick=${() => setThumb(t => { const c = { ...structuredClone(l), id: uid('l'), y: l.y + 0.04 }; t.layers.push(c); selLayer = c.id; })} />
      <span class="grow"></span>
      <${Btn} cls="sm ghost danger" icon="trash" onClick=${() => { setThumb(t => { t.layers = t.layers.filter(x => x.id !== l.id); }); selLayer = null; }}>Eliminar</${Btn}>
    </div>
  </div>`;
}

export function ThumbPanel() {
  const p = state.project;
  const th = curThumb();
  const tpl = tplById(th.tpl);
  const [W, H] = TF[th.format] || TF['9x16'];
  const sel = th.layers.find(l => l.id === selLayer);
  const setBg = (k) => (v) => setThumb(t => { t.bg = { ...t.bg, [k]: v }; }, 'thbg' + k);
  const addLayer = (l) => { setThumb(t => { t.layers.push(l); }); selLayer = l.id; emit(); };
  const P = palettesFor(tpl).find(x => x.id === th.pal) || palettesFor(tpl)[0];
  const save = async (type) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    drawThumb(c.getContext('2d'), W, H, th);
    const blob = await new Promise(r => c.toBlob(r, type === 'png' ? 'image/png' : 'image/jpeg', 0.94));
    const fname = `${(p.name || 'miniatura').replace(/[\\/:*?"<>|]+/g, '')}_miniatura_${th.format}.${type}`;
    const PF = await import('../../core/projectFolder.js');
    if (PF.folderActive() && await PF.saveToFolder('Miniaturas', fname, blob)) { toast('Miniatura guardada en la carpeta del proyecto › Miniaturas'); return; }
    downloadBlob(blob, fname);
    toast('Miniatura guardada en Descargas');
  };
  return html`
    <div class="panel-head">
      <h2 class="panel-title">Miniatura</h2>
      <p class="panel-desc">Portada por capas con los colores y tipografías de TBS: todo se mueve y se edita.</p>
    </div>
    <div class="panel-body">
      <${Section} title="Fotograma">
        <div class="stack">
          <${Btn} cls="primary block" icon="camera" onClick=${captureForThumb}>${rt.photo ? 'Capturar otro fotograma' : 'Capturar el fotograma actual'}</${Btn}>
          <${Seg} small value=${th.bg.photo} onChange=${setBg('photo')} options=${[['cutout', 'Persona recortada'], ['full', 'Foto completa'], ['top', 'Foto arriba'], ['none', 'Sin foto']]} />
        </div>
      </${Section}>
      <${Section} title="Plantillas">
        <div class="stack">
          <${Seg} small value=${th.format} onChange=${v => { update(pp => { pp.thumb = makeThumb(th.tpl, v, th.pal); }); selLayer = null; }} options=${[['9x16', '9:16'], ['4x5', '4:5'], ['1x1', '1:1'], ['16x9', 'YouTube']]} />
          <div class="cards three">
            ${THUMB_TEMPLATES.map(t => html`<button class=${'card' + (th.tpl === t.id ? ' on' : '')} title=${t.ref} onClick=${() => { update(pp => { pp.thumb = makeThumb(t.id, th.format); }); selLayer = null; }}>
              <img src=${tplPreview(t, th.format)} style=${`aspect-ratio:${W}/${H};object-fit:cover`} />
              <div class="card-label" style="font-size:11px">${t.name}</div>
            </button>`)}
          </div>
          <div class="field"><span class="field-label">Colores TBS</span>
            <div class="swatches">${palettesFor(tpl).map(c => html`<button class=${'swatch' + (th.pal === c.id ? ' on' : '')} title=${c.name} style=${`background:linear-gradient(135deg, ${c.bg || '#2a2a2e'} 50%, ${c.bg ? c.title : c.accent} 50%)`} onClick=${() => setThumb(t => applyPalette(t, c.id))}></button>`)}</div>
          </div>
          <${Swatches} label="Fondo" value=${th.bg.color} onChange=${setBg('color')} />
        </div>
      </${Section}>
      <${Section} title="Capas" right=${html`<span class="dim small">clic en la portada para elegir</span>`}>
        <div class="stack">
          <div class="layer-list">${[...th.layers].reverse().map(l => html`<button class=${'layer-row' + (l.id === selLayer ? ' on' : '')} onClick=${() => { selLayer = l.id; emit(); }}>
            <${Icon} name=${{ text: 'type', pill: 'textBox', icons: 'sparkles', logo: 'shield' }[l.kind]} /><span>${layerLabel(l)}</span>${l.behind && html`<small>detrás</small>`}</button>`)}</div>
          <div class="row wrap" style="gap:4px">
            <${Btn} cls="sm" icon="plus" onClick=${() => addLayer(T({ role: 'title', text: 'Nuevo texto', size: 110, x: 0.5, y: 0.45, align: 'center', color: P.title, accent: P.accent, shadow: tpl.palette === 'photo' }))}>Texto</${Btn}>
            <${Btn} cls="sm" icon="plus" onClick=${() => addLayer({ id: uid('l'), kind: 'pill', role: 'title', text: 'Etiqueta', icon: 'video', size: 50, x: 0.06, y: 0.05, color: P.title })}>Etiqueta</${Btn}>
            <${Btn} cls="sm" icon="plus" onClick=${() => addLayer({ id: uid('l'), kind: 'icons', role: 'title', icons: ['handCoins', 'euro'], tones: ['yellow', 'sky'], size: 110, x: 0.06, y: 0.4, ring: P.bg ? P.title : C.n900 })}>Iconos</${Btn}>
            <${Btn} cls="sm" icon="plus" onClick=${() => addLayer(T({ role: 'body', text: HANDLE, weight: 500, size: 42, x: 0.06, y: 0.93, ls: -0.01, color: P.body, shadow: tpl.palette === 'photo' }))}>@usuario</${Btn}>
            <${Btn} cls="sm" icon="plus" onClick=${() => addLayer({ id: uid('l'), kind: 'logo', mode: 'full', size: 70, x: 0.06, y: 0.9, color: P.body || C.white, mark: P.body || C.white })}>Logo</${Btn}>
          </div>
        </div>
      </${Section}>
      ${sel && html`<${Section} title=${'Capa · ' + LAYER_NAMES[sel.kind]}><${LayerProps} l=${sel} key=${sel.id} /></${Section}>`}
      ${th.bg.photo !== 'none' && html`<${Section} title="Persona y fondo" collapsible open=${false}>
        <div class="stack">
          ${th.bg.photo === 'cutout' && html`<${Toggle} label="Contorno blanco (pegatina)" value=${!!th.bg.outline} onChange=${setBg('outline')} />`}
          ${th.bg.photo !== 'cutout' && html`<${Slider} label="Oscurecer" value=${th.bg.darken || 0} min=${0} max=${0.8} step=${0.01} format=${v => Math.round(v * 100) + '%'} onInput=${setBg('darken')} />`}
          <${Slider} label="Zoom de la foto" value=${th.bg.zoom || 1} min=${0.5} max=${2.5} step=${0.01} format=${v => Math.round(v * 100) + '%'} onInput=${setBg('zoom')} />
          <${Slider} label="Horizontal" value=${th.bg.offX || 0} min=${-0.5} max=${0.5} step=${0.005} center format=${v => Math.round(v * 100)} onInput=${setBg('offX')} />
          <${Slider} label="Vertical" value=${th.bg.offY || 0} min=${-0.5} max=${0.5} step=${0.005} center format=${v => Math.round(v * 100)} onInput=${setBg('offY')} />
        </div>
      </${Section}>`}
      <${Section} title="Guardar">
        <div class="grid2">
          <${Btn} cls="cta" icon="download" onClick=${() => save('jpg')}>JPG</${Btn}>
          <${Btn} icon="download" onClick=${() => save('png')}>PNG</${Btn}>
        </div>
      </${Section}>
    </div>`;
}
ThumbPanel.Stage = ThumbStage;
