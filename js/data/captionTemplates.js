import { C, F } from './brand.js';

// Pack de plantillas de subtítulos TBS.
// Estructura y animación: Guille Collado, Marco Dimio, Mirko Vigna, Verónica Gordo, Pinterest, Motion Array, CapCut.
// Colores y tipografías: SIEMPRE del Design System TBS.

// Interletrado estrecho por familia (em)
export const TIGHT = { [F.head]: -0.04, [F.body]: -0.02, [F.serif]: -0.01, [F.script]: 0, [F.mono]: -0.01 };

const SH = (blur = 18, y = 3, opacity = 0.55, color = '#000000') => ({ on: true, color, opacity, blur, y, x: 0 });
const OFF = { on: false };

const RAW = [
  // ---------- Limpio ----------
  {
    id: 'tbs-editorial', name: 'Editorial', ref: 'Serif itálica en Fluor (Guille Collado)', cat: 'Limpio',
    font: { family: F.serif, weight: 700, style: 'italic', size: 66, upper: false, lh: 1.1 },
    color: C.fluor, hl: { color: C.white }, hl2: { color: C.magentaSoft },
    shadow: SH(18, 3, 0.6), reveal: 'group', anim: 'blurIn', out: 'blurOut', words: 5, maxChars: 30, posY: 0.64,
  },
  {
    id: 'tbs-nativo', name: 'Nativo', ref: 'Texto nativo de TikTok / Reels (Mirko Vigna)', cat: 'Limpio',
    font: { family: F.body, weight: 600, style: 'normal', size: 54, upper: false, lh: 1.16 },
    color: C.white, hl: { color: C.fluor }, hl2: { color: C.magentaSoft },
    shadow: { on: true, color: '#000000', opacity: 0.85, blur: 4, y: 1.5, x: 0 }, stroke: { on: true, color: '#000000', w: 1.2, opacity: 0.55 },
    reveal: 'group', anim: 'fade', animDur: 0.6, out: 'none', words: 7, maxChars: 34, maxLines: 3, posY: 0.62,
  },
  {
    id: 'tbs-escalonado', name: 'Escalonado', ref: 'Dos líneas desplazadas, minimal (Verónica Gordo)', cat: 'Limpio',
    font: { family: F.body, weight: 500, style: 'normal', size: 56, upper: false, lh: 1.2 },
    color: C.white, hl: { color: C.white, family: F.serif, style: 'italic', weight: 600 }, hl2: { color: C.fluor },
    shadow: SH(14, 2, 0.55), layout: 'stagger', reveal: 'word', anim: 'blurIn', out: 'blurOut', words: 4, maxChars: 26, maxLines: 2, posY: 0.55,
  },
  {
    id: 'tbs-minimal', name: 'Minimal cine', ref: 'Palabras repartidas a lo ancho (Marco Dimio)', cat: 'Limpio',
    font: { family: F.body, weight: 600, style: 'normal', size: 48, upper: false, lh: 1.2 },
    color: C.white, hl: { color: C.white, family: F.serif, style: 'italic', weight: 600, upper: true }, hl2: { color: C.fluor },
    shadow: SH(14, 2, 0.6), layout: 'spread', reveal: 'word', anim: 'fade', out: 'fade', words: 4, maxChars: 30, posY: 0.6,
  },
  {
    id: 'tbs-acento', name: 'Acento serif', ref: 'Minúscula bold + palabra en serif (Marco Dimio)', cat: 'Limpio',
    font: { family: F.head, weight: 700, style: 'normal', size: 74, upper: false, lh: 1.0 },
    color: C.white, hl: { color: C.white, family: F.serif, style: 'italic', weight: 500, upper: true, scale: 1.04 }, hl2: { color: C.fluor, family: F.serif, style: 'italic', weight: 500, upper: true },
    shadow: SH(18, 3, 0.55), reveal: 'group', anim: 'rise', out: 'blurOut', words: 4, maxChars: 22, posY: 0.62,
  },

  // ---------- Creadores ----------
  {
    id: 'tbs-jerarquia', name: 'Jerarquía', ref: 'Palabra clave enorme y conectores pequeños (Mirko Vigna)', cat: 'Creadores',
    font: { family: F.head, weight: 700, style: 'normal', size: 60, upper: false, lh: 0.98 },
    color: C.white, hl: { color: C.fluor, scale: 2.3 }, hl2: { color: C.white, scale: 2.3 },
    shadow: SH(26, 4, 0.5), layout: 'hier', reveal: 'word', anim: 'blurIn', out: 'blurOut', words: 4, maxChars: 28, maxLines: 4, posY: 0.5,
  },
  {
    id: 'tbs-clave', name: 'Palabra clave', ref: 'Una o dos palabras gigantes con desenfoque (Mirko Vigna)', cat: 'Creadores',
    font: { family: F.head, weight: 700, style: 'normal', size: 118, upper: false, lh: 0.95 },
    color: C.white, hl: { color: C.fluor }, hl2: { color: C.magenta },
    shadow: SH(30, 6, 0.45), reveal: 'word', anim: 'scaleBlur', out: 'blurOut', words: 2, maxChars: 14, maxLines: 2, posY: 0.42, punct: 'strip',
  },
  {
    id: 'tbs-seleccion', name: 'Selección', ref: 'Caja de selección tipo editor (Mirko Vigna)', cat: 'Creadores',
    font: { family: F.body, weight: 700, style: 'normal', size: 70, upper: false, lh: 1.05 },
    color: C.white, hl: { color: C.fluor }, hl2: { color: C.magentaSoft },
    shadow: SH(20, 3, 0.5), deco: 'select', reveal: 'group', anim: 'blurIn', out: 'fade', words: 2, maxChars: 16, posY: 0.55, punct: 'strip',
  },
  {
    id: 'tbs-glow', name: 'Glow titular', ref: 'Palabra clave enorme con glow (Guille Collado)', cat: 'Creadores',
    font: { family: F.head, weight: 700, style: 'normal', size: 112, upper: true, lh: 0.9 },
    color: C.fluor, glow: { on: true, blur: 34, color: C.fluor, alpha: 0.55 },
    hl: { color: C.white, family: F.script, weight: 400, style: 'normal', upper: false, scale: 0.95, glow: { on: true, blur: 24, color: C.white, alpha: 0.5 } },
    hl2: { color: C.white, glow: { on: true, blur: 30, color: C.white, alpha: 0.5 } },
    shadow: OFF, reveal: 'group', anim: 'focus', out: 'blurOut', words: 2, maxChars: 14, posY: 0.3, maxLines: 3, punct: 'strip',
  },

  // ---------- Energía ----------
  {
    id: 'tbs-impacto', name: 'Impacto', ref: 'Mayúsculas bold palabra a palabra (Bold / Hormozi)', cat: 'Energía',
    font: { family: F.head, weight: 700, style: 'normal', size: 82, upper: true, lh: 1 },
    color: C.white, hl: { color: C.fluor }, hl2: { color: C.magenta },
    shadow: SH(22, 6, 0.6), active: { mode: 'scale', scale: 1.08 }, reveal: 'word', anim: 'pop', out: 'none', words: 3, maxChars: 18, posY: 0.66, punct: 'strip',
  },
  {
    id: 'tbs-karaoke', name: 'Karaoke Fluor', ref: 'Píldora que sigue la voz', cat: 'Energía',
    font: { family: F.body, weight: 800, style: 'normal', size: 62, upper: true, lh: 1.25 },
    color: C.white, hl: { color: C.fluor }, hl2: { color: C.magenta },
    shadow: SH(22, 6, 0.6), active: { mode: 'pill', color: C.fluor, ink: C.fluorInk }, reveal: 'group', anim: 'pop', out: 'none', words: 3, maxChars: 20, posY: 0.66, punct: 'strip',
  },
  {
    id: 'tbs-letras', name: 'Letra a letra', ref: 'Cascada de letras suave', cat: 'Energía',
    font: { family: F.head, weight: 700, style: 'normal', size: 72, upper: true, lh: 1.02 },
    color: C.white, hl: { color: C.fluor }, hl2: { color: C.magentaSoft },
    shadow: SH(22, 5, 0.55), reveal: 'group', anim: 'letters', stagger: 0.025, out: 'blurOut', words: 3, maxChars: 18, posY: 0.64, punct: 'strip',
  },
  {
    id: 'tbs-tracking', name: 'Expansión', ref: 'El interletrado se cierra al entrar', cat: 'Energía',
    font: { family: F.head, weight: 500, style: 'normal', size: 64, upper: true, lh: 1.05 },
    color: C.white, hl: { color: C.fluor, weight: 700 }, hl2: { color: C.magentaSoft },
    shadow: SH(20, 4, 0.55), reveal: 'group', anim: 'tracking', animDur: 1.4, out: 'blurOut', words: 3, maxChars: 18, posY: 0.62, punct: 'strip',
  },
  {
    id: 'tbs-palabra', name: 'Una palabra', ref: 'Impact statement, golpe por palabra', cat: 'Energía',
    font: { family: F.head, weight: 700, style: 'normal', size: 140, upper: true, lh: 1 },
    color: C.white, hl: { color: C.fluor }, hl2: { color: C.magenta },
    shadow: SH(30, 8, 0.65), reveal: 'word', anim: 'angle', out: 'none', words: 1, maxChars: 12, posY: 0.56, punct: 'strip',
  },
  {
    id: 'tbs-subrayado', name: 'Subrayado', ref: 'Barra Fluor bajo la palabra que suena', cat: 'Energía',
    font: { family: F.body, weight: 800, style: 'normal', size: 60, upper: false, lh: 1.3 },
    color: C.white, hl: { color: C.fluor }, hl2: { color: C.magenta },
    shadow: SH(22, 6, 0.6), active: { mode: 'underline', color: C.fluor }, reveal: 'group', anim: 'soft', out: 'none', words: 4, maxChars: 22, posY: 0.66,
  },
  {
    id: 'tbs-barrido', name: 'Barrido de color', ref: 'Karaoke que rellena en Fluor', cat: 'Energía',
    font: { family: F.head, weight: 700, style: 'normal', size: 68, upper: true, lh: 1.04 },
    color: C.white, hl: { color: C.magenta }, hl2: { color: C.blue },
    shadow: SH(22, 6, 0.6), active: { mode: 'wipe', color: C.fluor, keep: true }, reveal: 'group', anim: 'pop', out: 'none', words: 4, maxChars: 20, posY: 0.66, punct: 'strip',
  },
  {
    id: 'tbs-profundidad', name: 'Profundidad', ref: 'Caída con sombra magenta', cat: 'Energía',
    font: { family: F.head, weight: 700, style: 'normal', size: 72, upper: true, lh: 1.04 },
    color: C.white, hl: { color: C.fluor }, hl2: { color: C.magentaSoft },
    shadow: { on: true, blur: 0, x: 5, y: 6, color: C.magenta, opacity: 1 }, reveal: 'word', anim: 'drop', out: 'none', words: 3, maxChars: 18, posY: 0.66, punct: 'strip',
  },
  {
    id: 'tbs-neon', name: 'Neón magenta', ref: 'Glow de marca en la palabra destacada', cat: 'Energía',
    font: { family: F.head, weight: 700, style: 'normal', size: 72, upper: true, lh: 1.04 },
    color: C.white, glow: { on: true, blur: 26, color: C.magenta, alpha: 0.85 },
    hl: { color: C.magentaSoft, glow: { on: true, blur: 34, color: C.magenta, alpha: 1 } }, hl2: { color: C.fluor, glow: { on: true, blur: 30, color: C.fluor, alpha: 0.7 } },
    shadow: OFF, reveal: 'word', anim: 'glowIn', out: 'fade', words: 3, maxChars: 18, posY: 0.64, punct: 'strip',
  },

  // ---------- Títulos ----------
  {
    id: 'tbs-cascada', name: 'Cascada', ref: 'Una palabra por línea, tipografía cinética', cat: 'Títulos',
    font: { family: F.head, weight: 700, style: 'normal', size: 86, upper: true, lh: 0.94 },
    color: C.white, hl: { color: C.fluor, scale: 1.22 }, hl2: { color: C.magenta, family: F.serif, style: 'italic', weight: 600, upper: false, scale: 1.1 },
    shadow: SH(22, 6, 0.55), layout: 'stack', reveal: 'word', anim: 'rise', out: 'blurOut', words: 3, maxChars: 24, posY: 0.5, maxLines: 4, punct: 'strip',
  },

  // ---------- Con fondo ----------
  {
    id: 'tbs-cristal', name: 'Cristal', ref: 'Panel de cristal TBS', cat: 'Con fondo',
    font: { family: F.body, weight: 700, style: 'normal', size: 58, upper: false, lh: 1.22 },
    color: C.white, hl: { color: C.fluor }, hl2: { color: C.magentaSoft },
    box: { on: true, mode: 'block', color: C.n900, opacity: 0.42, blur: 16, ring: true, radius: 28, padX: 30, padY: 18 },
    shadow: OFF, active: { mode: 'color', color: C.fluor }, reveal: 'group', anim: 'pop', out: 'fade', words: 5, maxChars: 28, posY: 0.66,
  },
  {
    id: 'tbs-caja', name: 'Caja por línea', ref: 'Clásico de TikTok: caja oscura por línea', cat: 'Con fondo',
    font: { family: F.body, weight: 700, style: 'normal', size: 56, upper: false, lh: 1.3 },
    color: C.white, hl: { color: C.fluor }, hl2: { color: C.magentaSoft },
    box: { on: true, mode: 'line', color: C.n900, opacity: 0.86, radius: 12, padX: 18, padY: 8 },
    shadow: OFF, active: { mode: 'color', color: C.fluor }, reveal: 'group', anim: 'soft', out: 'none', words: 5, maxChars: 28, posY: 0.68,
  },
  {
    id: 'tbs-etiqueta', name: 'Etiqueta Fluor', ref: 'Botón Fluor de TBS', cat: 'Con fondo',
    font: { family: F.head, weight: 700, style: 'normal', size: 56, upper: true, lh: 1.15 },
    color: C.fluorInk, hl: { color: C.magenta }, hl2: { color: C.blue },
    box: { on: true, mode: 'block', color: C.fluor, opacity: 1, radius: 24, padX: 28, padY: 14 },
    shadow: OFF, reveal: 'group', anim: 'bounce', out: 'none', words: 3, maxChars: 18, posY: 0.68, punct: 'strip',
  },
  {
    id: 'tbs-palabras', name: 'Píldoras', ref: 'Cada palabra en su píldora', cat: 'Con fondo',
    font: { family: F.body, weight: 800, style: 'normal', size: 58, upper: false, lh: 1.45 },
    color: C.n900, hl: { color: C.magenta }, hl2: { color: C.blue },
    box: { on: true, mode: 'word', color: C.white, opacity: 1, radius: 14, padX: 14, padY: 8 },
    shadow: OFF, reveal: 'word', anim: 'pop', out: 'none', words: 4, maxChars: 24, posY: 0.66,
  },
  {
    id: 'tbs-maquina', name: 'Máquina', ref: 'Máquina de escribir monoespaciada', cat: 'Con fondo',
    font: { family: F.mono, weight: 500, style: 'normal', size: 50, upper: false, lh: 1.3 },
    color: C.white, hl: { color: C.fluor }, hl2: { color: C.magentaSoft },
    box: { on: true, mode: 'block', color: C.n900, opacity: 0.78, radius: 8, padX: 18, padY: 10 },
    shadow: OFF, reveal: 'char', anim: 'none', out: 'none', words: 6, maxChars: 30, posY: 0.68,
  },
];

// Rellena valores por defecto para que todos los efectos sean editables
export function normalizeTemplate(t) {
  const n = structuredClone(t);
  n.font = { weight: 700, style: 'normal', size: 60, upper: false, lh: 1.15, ...n.font };
  if (n.font.ls === undefined) n.font.ls = TIGHT[n.font.family] ?? -0.02;
  n.shadow = { on: false, color: '#000000', opacity: 0.55, blur: 18, y: 3, x: 0, ...(n.shadow || {}) };
  n.stroke = { on: false, color: '#000000', w: 3, opacity: 1, ...(n.stroke || {}) };
  n.glow = { on: false, color: n.color || C.fluor, alpha: 0.6, blur: 28, ...(n.glow || {}) };
  n.box = { on: false, mode: 'block', color: C.n900, opacity: 0.8, radius: 14, padX: 22, padY: 12, blur: 0, ring: false, ...(n.box || {}) };
  n.active = { mode: 'none', color: C.fluor, ink: C.fluorInk, scale: 1.08, keep: false, ...(n.active || {}) };
  n.hl = { ...(n.hl || {}) }; n.hl2 = { ...(n.hl2 || {}) };
  n.layout = n.layout || 'center';
  n.align = n.align || 'center';
  n.reveal = n.reveal || 'group';
  n.anim = n.anim || 'fade';
  n.animDur = n.animDur || 1;
  n.stagger = n.stagger ?? 0.03;
  n.out = n.out || 'none';
  n.maxW = n.maxW || 0.9;
  n.maxLines = n.maxLines || 2;
  n.punct = n.punct || 'keep';
  n.deco = n.deco || 'none';
  return n;
}

export const CAPTION_TEMPLATES = RAW.map(normalizeTemplate);
export const TEMPLATE_CATS = ['Limpio', 'Creadores', 'Energía', 'Títulos', 'Con fondo'];

// Plantillas guardadas por el usuario
const USER_KEY = 'tbs-user-templates';
export function userTemplates() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || '[]').map(normalizeTemplate); } catch { return []; }
}
export function saveUserTemplate(t) {
  const list = userTemplates().filter(x => x.id !== t.id);
  list.push({ ...t, cat: 'Mis plantillas' });
  try { localStorage.setItem(USER_KEY, JSON.stringify(list)); } catch {}
}
export function deleteUserTemplate(id) {
  try { localStorage.setItem(USER_KEY, JSON.stringify(userTemplates().filter(x => x.id !== id))); } catch {}
}
export const allTemplates = () => [...CAPTION_TEMPLATES, ...userTemplates()];
export const getTemplate = (id) => allTemplates().find(t => t.id === id) || CAPTION_TEMPLATES[0];

export const ANIMS = [
  { id: 'none', name: 'Sin animación' }, { id: 'fade', name: 'Fundido' }, { id: 'blurIn', name: 'Desenfoque suave' },
  { id: 'soft', name: 'Suave' }, { id: 'rise', name: 'Máscara (sube)' }, { id: 'lift', name: 'Subir' }, { id: 'drop', name: 'Caer' },
  { id: 'scaleBlur', name: 'Zoom desenfocado' }, { id: 'focus', name: 'Enfoque' }, { id: 'pop', name: 'Pop' }, { id: 'bounce', name: 'Rebote' },
  { id: 'letters', name: 'Letra a letra' }, { id: 'tracking', name: 'Expansión' }, { id: 'wave', name: 'Ola' },
  { id: 'angle', name: 'Golpe' }, { id: 'flip', name: 'Giro' }, { id: 'glowIn', name: 'Encendido' },
];
export const OUTS = [{ id: 'none', name: 'Corte' }, { id: 'fade', name: 'Fundido' }, { id: 'blurOut', name: 'Desenfoque' }, { id: 'pop', name: 'Pop' }, { id: 'lift', name: 'Subir' }, { id: 'drop', name: 'Bajar' }];
export const REVEALS = [{ id: 'group', name: 'Bloque' }, { id: 'word', name: 'Palabra' }, { id: 'char', name: 'Letra (máquina)' }];
export const ACTIVES = [
  { id: 'none', name: 'Ninguno' }, { id: 'color', name: 'Color' }, { id: 'pill', name: 'Píldora' }, { id: 'underline', name: 'Subrayado' },
  { id: 'scale', name: 'Escala' }, { id: 'wipe', name: 'Barrido' },
];
export const LAYOUTS = [{ id: 'center', name: 'Centrado' }, { id: 'stagger', name: 'Escalonado' }, { id: 'spread', name: 'Repartido' }, { id: 'stack', name: 'Apilado' }, { id: 'hier', name: 'Jerarquía' }];
