import { C, F } from './brand.js';

// Pack de plantillas de subtítulos TBS.
// Estructura y animación: Guille Collado, Marco Dimio, Mirko Vigna, Verónica Gordo, Pinterest, Motion Array, CapCut.
// Colores y tipografías: SIEMPRE del Design System TBS.

// Interletrado estrecho por familia (em)
export const TIGHT = { [F.head]: -0.04, [F.body]: -0.02, [F.serif]: -0.01, [F.script]: 0, [F.mono]: -0.01 };

const SH = (blur = 18, y = 3, opacity = 0.55, color = '#000000') => ({ on: true, color, opacity, blur, y, x: 0 });
const OFF = { on: false };

// Pack pulido (pocas plantillas): todas palabra a palabra, una sola tipografía y un solo tamaño para el texto
// normal; la palabra "destacada" cambia color/tipografía según la plantilla pero mantiene el tamaño; la
// "muy destacada" se convierte en un TÍTULO a todo el ancho de la zona segura (debajo del subtítulo o sola).
const HERO = (o = {}) => ({ family: F.head, weight: 700, style: 'normal', upper: true, color: C.fluor, ls: -0.045, underline: true, line: C.fluor, anim: 'mask', ...o });
const RAW = [
  {
    id: 'v2-fluor', name: 'TBS Fluor', ref: 'Playfair itálica en Fluor (el estilo de siempre)', cat: 'Esenciales',
    font: { family: F.serif, weight: 700, style: 'italic', size: 68, upper: false, lh: 1.08 },
    color: C.fluor, hl: { color: C.white },
    hero: HERO({ color: C.white, line: C.fluor }), heroMode: 'stack',
    shadow: SH(18, 3, 0.6), reveal: 'word', anim: 'blurIn', animDur: 0.7, out: 'blurOut', words: 4, maxChars: 24, posY: 0.64,
  },
  {
    id: 'v2-clasico', name: 'TBS Clásico', ref: 'Space Grotesk blanco, destacada en Fluor', cat: 'Esenciales',
    font: { family: F.head, weight: 700, style: 'normal', size: 66, upper: false, lh: 1.08 },
    color: C.white, hl: { color: C.fluor }, hero: HERO(), heroMode: 'stack',
    shadow: SH(16, 3, 0.55), reveal: 'word', anim: 'soft', animDur: 0.6, out: 'fade', words: 4, maxChars: 24, posY: 0.64,
  },
  {
    id: 'v2-editorial', name: 'Editorial', ref: 'Destacada en Playfair itálica (Guille Collado)', cat: 'Esenciales',
    font: { family: F.head, weight: 600, style: 'normal', size: 64, upper: false, lh: 1.1 },
    color: C.white, hl: { color: C.fluor, family: F.serif, style: 'italic', weight: 600 },
    hero: HERO({ family: F.serif, style: 'italic', weight: 600, upper: false, color: C.white, ls: -0.02, line: C.fluor }), heroMode: 'stack',
    shadow: SH(18, 3, 0.55), reveal: 'word', anim: 'blurIn', animDur: 0.7, out: 'fade', words: 4, maxChars: 24, posY: 0.64,
  },
  {
    id: 'v2-creador', name: 'Creador', ref: 'Mayúsculas con contorno, ritmo rápido', cat: 'Esenciales',
    font: { family: F.body, weight: 800, style: 'normal', size: 62, upper: true, lh: 1.06 },
    color: C.white, hl: { color: C.fluor },
    hero: HERO({ family: F.body, weight: 900, anim: 'pop', ls: -0.03 }), heroMode: 'solo',
    stroke: { on: true, color: '#000000', w: 2.2, opacity: 0.85 }, shadow: SH(14, 4, 0.5),
    reveal: 'word', anim: 'pop', animDur: 0.55, out: 'none', words: 3, maxChars: 20, posY: 0.66, punct: 'strip',
  },
  {
    id: 'v2-minimal', name: 'Minimal', ref: 'Raleway fino, discreto y elegante (Marco Dimio)', cat: 'Esenciales',
    font: { family: F.body, weight: 600, style: 'normal', size: 56, upper: false, lh: 1.16 },
    color: C.white, hl: { color: C.fluor, weight: 800 },
    hero: HERO({ family: F.head, weight: 700, color: C.white, line: C.fluor }), heroMode: 'stack',
    shadow: SH(14, 2, 0.6), reveal: 'word', anim: 'fade', animDur: 0.6, out: 'fade', words: 5, maxChars: 28, posY: 0.66,
  },
  {
    id: 'v2-karaoke', name: 'Karaoke', ref: 'La palabra que suena en una píldora Fluor', cat: 'Dinámicos',
    font: { family: F.head, weight: 700, style: 'normal', size: 64, upper: false, lh: 1.12 },
    color: C.white, hl: { color: C.fluor }, active: { mode: 'pill', color: C.fluor, ink: C.fluorInk },
    hero: HERO(), heroMode: 'solo',
    shadow: SH(18, 4, 0.55), reveal: 'word', anim: 'soft', animDur: 0.55, out: 'none', words: 4, maxChars: 22, posY: 0.66, punct: 'strip',
  },
  {
    id: 'v2-impacto', name: 'Impacto', ref: '2–3 palabras grandes, golpe en cada una', cat: 'Dinámicos',
    font: { family: F.head, weight: 700, style: 'normal', size: 92, upper: true, lh: 0.98 },
    color: C.white, hl: { color: C.fluor },
    hero: HERO({ anim: 'pop' }), heroMode: 'solo',
    shadow: SH(26, 6, 0.55), reveal: 'word', anim: 'pop', animDur: 0.5, out: 'none', words: 3, maxChars: 16, posY: 0.6, punct: 'strip',
  },
  {
    id: 'v2-neon', name: 'Neón', ref: 'Destacada con brillo Fluor', cat: 'Dinámicos',
    font: { family: F.head, weight: 700, style: 'normal', size: 64, upper: false, lh: 1.1 },
    color: C.white, hl: { color: C.fluor, glow: { on: true, color: C.fluor, alpha: 0.75, blur: 26 } },
    hero: HERO({ line: null, underline: false, glow: true }), heroMode: 'stack',
    shadow: SH(14, 3, 0.5), reveal: 'word', anim: 'glowIn', animDur: 0.6, out: 'fade', words: 4, maxChars: 24, posY: 0.64,
  },
  {
    id: 'v2-caja', name: 'Caja', ref: 'Fondo oscuro por línea, máxima legibilidad', cat: 'Con fondo',
    font: { family: F.body, weight: 800, style: 'normal', size: 58, upper: false, lh: 1.24 },
    color: C.white, hl: { color: C.fluor },
    box: { on: true, mode: 'line', color: C.n900, opacity: 0.86, radius: 12, padX: 16, padY: 8 },
    hero: HERO({ color: C.fluor }), heroMode: 'stack',
    shadow: OFF, reveal: 'word', anim: 'fade', animDur: 0.5, out: 'none', words: 4, maxChars: 24, posY: 0.66,
  },
  {
    id: 'v2-cristal', name: 'Cristal', ref: 'Bloque de cristal desenfocado', cat: 'Con fondo',
    font: { family: F.head, weight: 600, style: 'normal', size: 58, upper: false, lh: 1.16 },
    color: C.white, hl: { color: C.fluor },
    box: { on: true, mode: 'block', color: C.n900, opacity: 0.35, radius: 22, padX: 26, padY: 14, blur: 16, ring: true },
    hero: HERO(), heroMode: 'stack',
    shadow: OFF, reveal: 'word', anim: 'soft', animDur: 0.6, out: 'fade', words: 4, maxChars: 24, posY: 0.66,
  },
];
// Cine: sencillas y elegantes (serif para contenido pausado, minúsculas, interletrado amplio, sombra suave)
RAW.push(
  {
    id: 'v2-cine-serif', name: 'Cine serif', ref: 'Playfair fina, como los subtítulos de una película', cat: 'Cine',
    font: { family: F.serif, weight: 500, style: 'normal', size: 54, upper: false, lh: 1.18, ls: 0 },
    color: C.white, hl: { color: C.white, style: 'italic', weight: 600 },
    hero: HERO({ family: F.serif, style: 'italic', weight: 600, upper: false, color: C.white, ls: -0.01, underline: false, anim: 'blur' }), heroMode: 'stack',
    shadow: SH(20, 2, 0.6), reveal: 'word', anim: 'fade', animDur: 1.1, out: 'fade', words: 5, maxChars: 30, posY: 0.64,
  },
  {
    id: 'v2-documental', name: 'Documental', ref: 'Minúsculas finas con aire, para entrevistas', cat: 'Cine',
    font: { family: F.body, weight: 500, style: 'normal', size: 50, upper: false, lower: true, lh: 1.2, ls: 0.01 },
    color: C.white, hl: { color: C.fluor, weight: 700 },
    hero: HERO({ family: F.head, weight: 500, color: C.white, ls: 0.22, underline: false, anim: 'blur' }), heroMode: 'stack',
    shadow: SH(18, 2, 0.6), reveal: 'word', anim: 'blurIn', animDur: 1, out: 'fade', words: 5, maxChars: 30, posY: 0.64,
  },
  {
    id: 'v2-pelicula', name: 'Título de película', ref: 'Mayúsculas pequeñas con mucho interletrado', cat: 'Cine',
    font: { family: F.head, weight: 500, style: 'normal', size: 40, upper: true, lh: 1.3, ls: 0.16 },
    color: C.white, hl: { color: C.fluor },
    hero: HERO({ family: F.head, weight: 600, color: C.white, ls: 0.12, underline: false, anim: 'letters' }), heroMode: 'solo',
    shadow: SH(16, 2, 0.55), reveal: 'word', anim: 'fade', animDur: 1.1, out: 'fade', words: 4, maxChars: 26, posY: 0.62, punct: 'strip',
  },
  {
    id: 'v2-intimo', name: 'Íntimo', ref: 'Minúsculas limpias y acento en serif itálica', cat: 'Cine',
    font: { family: F.head, weight: 500, style: 'normal', size: 56, upper: false, lower: true, lh: 1.12, ls: -0.025 },
    color: C.white, hl: { color: C.fluor, family: F.serif, style: 'italic', weight: 500 },
    hero: HERO({ family: F.serif, style: 'italic', weight: 500, upper: false, color: C.white, ls: -0.015, line: C.fluor, anim: 'blur' }), heroMode: 'stack',
    shadow: SH(18, 2, 0.55), reveal: 'word', anim: 'soft', animDur: 0.9, out: 'fade', words: 4, maxChars: 26, posY: 0.64,
  },
);

// Plantillas antiguas → la más parecida del pack nuevo (los proyectos guardados siguen funcionando)
export const TEMPLATE_ALIAS = {
  'tbs-editorial': 'v2-fluor', 'tbs-nativo': 'v2-minimal', 'tbs-escalonado': 'v2-editorial', 'tbs-minimal': 'v2-minimal', 'tbs-acento': 'v2-editorial',
  'tbs-jerarquia': 'v2-clasico', 'tbs-clave': 'v2-impacto', 'tbs-seleccion': 'v2-clasico', 'tbs-glow': 'v2-neon', 'tbs-impacto': 'v2-impacto',
  'tbs-karaoke': 'v2-karaoke', 'tbs-letras': 'v2-creador', 'tbs-tracking': 'v2-clasico', 'tbs-palabra': 'v2-impacto', 'tbs-subrayado': 'v2-clasico',
  'tbs-barrido': 'v2-karaoke', 'tbs-profundidad': 'v2-creador', 'tbs-neon': 'v2-neon', 'tbs-cascada': 'v2-clasico', 'tbs-cristal': 'v2-cristal',
  'tbs-caja': 'v2-caja', 'tbs-etiqueta': 'v2-caja', 'tbs-palabras': 'v2-caja', 'tbs-maquina': 'v2-minimal',
};

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
  // destacada: mismo tamaño que el resto (la jerarquía la da el color o la tipografía)
  if (n.hl.scale && !n.user) delete n.hl.scale;
  // muy destacada = título a todo el ancho (debajo del subtítulo, o sola)
  n.hero = { family: F.head, weight: 700, style: 'normal', upper: true, color: C.fluor, ls: -0.045, underline: true, line: C.fluor, anim: 'mask', ...(n.hero || {}) };
  n.heroMode = n.heroMode || 'stack';
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
export const TEMPLATE_CATS = ['Esenciales', 'Dinámicos', 'Cine', 'Con fondo'];
export const HERO_MODES = [['stack', 'Subtítulo + título'], ['solo', 'Título solo'], ['off', 'Sin título']];
export const HERO_ANIMS = [['mask', 'Máscara que sube'], ['pop', 'Golpe'], ['blur', 'Desenfoque'], ['letters', 'Letra a letra']];

// Plantillas guardadas por el usuario
const USER_KEY = 'tbs-user-templates';
let userCache = null; // se lee una vez (getTemplate se llama en cada fotograma)
export function userTemplates() {
  if (userCache) return userCache;
  try { userCache = JSON.parse(localStorage.getItem(USER_KEY) || '[]').map(normalizeTemplate); } catch { userCache = []; }
  return userCache;
}
function storeUser(list) {
  userCache = null;
  try { localStorage.setItem(USER_KEY, JSON.stringify(list)); } catch {}
}
export function saveUserTemplate(t) {
  const list = userTemplates().filter(x => x.id !== t.id);
  list.push({ ...t, cat: 'Mis plantillas', user: true });
  storeUser(list);
}
export function deleteUserTemplate(id) { storeUser(userTemplates().filter(x => x.id !== id)); }
export const allTemplates = () => [...CAPTION_TEMPLATES, ...userTemplates()];
const byId = new Map(CAPTION_TEMPLATES.map(t => [t.id, t]));
export const getTemplate = (id) => byId.get(id) || byId.get(TEMPLATE_ALIAS[id]) || userTemplates().find(t => t.id === id) || CAPTION_TEMPLATES[0];

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
