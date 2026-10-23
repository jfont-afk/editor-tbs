// Tokens del Design System de Traders Business School (fuente única de colores y tipos).
export const C = {
  magenta: '#ff0a54', magentaInk: '#6b0423', magentaSoft: '#ffb3ca', magenta600: '#e8094c', magenta800: '#8c062e',
  blue: '#0066ff', blueInk: '#e6f0ff', blueSoft: '#8ab9ff', blue900: '#002b6b',
  fluor: '#daff0a', fluorInk: '#364000', fluorSoft: '#eeff8e',
  green: '#11e07f', greenInk: '#075e35', greenSoft: '#92f1c4',
  sky: '#11a3f2', skyInk: '#074466',
  yellow: '#ffbe0a', yellowInk: '#594304',
  red: '#f22b11',
  white: '#ffffff', offwhite: '#f7f7f7', crema: '#f3eee8',
  n900: '#121214', n800: '#1f1e23', n700: '#323436', n500: '#72767b', n400: '#b3b6be',
};

// Paleta seleccionable en la interfaz (orden de uso recomendado).
export const PALETTE = [
  { id: 'white', name: 'Blanco', hex: C.white, ink: C.n900 },
  { id: 'fluor', name: 'Fluor', hex: C.fluor, ink: C.fluorInk },
  { id: 'magenta', name: 'Magenta', hex: C.magenta, ink: C.white },
  { id: 'blue', name: 'Azul', hex: C.blue, ink: C.blueInk },
  { id: 'green', name: 'Verde', hex: C.green, ink: C.greenInk },
  { id: 'sky', name: 'Cielo', hex: C.sky, ink: C.white },
  { id: 'yellow', name: 'Amarillo', hex: C.yellow, ink: C.yellowInk },
  { id: 'crema', name: 'Crema', hex: C.crema, ink: C.n900 },
  { id: 'olive', name: 'Oliva TBS', hex: C.fluorInk, ink: C.fluor },
  { id: 'wine', name: 'Burdeos', hex: C.magentaInk, ink: C.white },
  { id: 'dark', name: 'Oscuro', hex: C.n900, ink: C.white },
  { id: 'black', name: 'Negro (sombras)', hex: '#000000', ink: C.white },
];
export const inkFor = (hex) => (PALETTE.find(p => p.hex.toLowerCase() === String(hex).toLowerCase()) || {}).ink || C.n900;

export const F = {
  head: 'Space Grotesk',     // titulares, mayúsculas, 700
  body: 'Raleway',           // cuerpo, botones, títulos de curso (800)
  serif: 'Playfair Display', // acentos editoriales en itálica
  // Solo se usan las tres tipografías TBS. Los proyectos antiguos con la manuscrita o la monoespaciada
  // se ven ahora en Playfair Display y Space Grotesk.
  script: 'Playfair Display',
  mono: 'Space Grotesk',
};

export const FONT_CHOICES = [
  { id: 'head', label: 'Space Grotesk', family: F.head },
  { id: 'body', label: 'Raleway', family: F.body },
  { id: 'serif', label: 'Playfair Display', family: F.serif },
];

export async function loadFonts() {
  const specs = [
    `700 40px "${F.head}"`, `500 40px "${F.head}"`,
    `400 40px "${F.body}"`, `500 40px "${F.body}"`, `600 40px "${F.body}"`, `700 40px "${F.body}"`, `800 40px "${F.body}"`, `900 40px "${F.body}"`,
    `italic 700 40px "${F.body}"`,
    `italic 400 40px "${F.serif}"`, `italic 500 40px "${F.serif}"`, `italic 600 40px "${F.serif}"`, `italic 700 40px "${F.serif}"`, `italic 800 40px "${F.serif}"`,
    `700 40px "${F.serif}"`,
  ];
  try {
    await Promise.race([
      Promise.all(specs.map(s => document.fonts.load(s, 'AaÁéíñ0123'))),
      new Promise(r => setTimeout(r, 6000)),
    ]);
  } catch (e) { /* sin conexión: se usan fuentes del sistema */ }
}

// Formatos de salida
export const FORMATS = [
  { id: '9x16', label: '9:16', name: 'Vertical', sub: 'Reels · TikTok · Shorts', w: 1080, h: 1920 },
  { id: '4x5', label: '4:5', name: 'Feed', sub: 'Instagram feed', w: 1080, h: 1350 },
  { id: '1x1', label: '1:1', name: 'Cuadrado', sub: 'Feed · LinkedIn', w: 1080, h: 1080 },
  { id: '16x9', label: '16:9', name: 'Horizontal', sub: 'YouTube · Web', w: 1920, h: 1080 },
];

// Zonas seguras en px sobre 1080×1920 (fuentes: TikTok ads, Meta, previsualizaciones Shorts 2026).
export const SAFE_ZONES = {
  tiktok: { name: 'TikTok', top: 240, bottom: 660, left: 120, right: 120, rightCol: { x: 900, y: 840, w: 180, h: 420 } },
  reels: { name: 'Reels', top: 269, bottom: 672, left: 65, right: 65, rightCol: { x: 960, y: 1000, w: 120, h: 420 } },
  shorts: { name: 'Shorts', top: 241, bottom: 381, left: 60, right: 201, rightCol: { x: 960, y: 980, w: 120, h: 520 } },
  all: { name: 'Todas', top: 269, bottom: 672, left: 120, right: 201, rightCol: null },
};

// Rectángulo seguro (en px del formato actual) para la plataforma elegida.
export function safeRect(format, zoneId) {
  const { w, h } = format;
  const z = SAFE_ZONES[zoneId];
  if (!z || zoneId === 'off') return { x: w * 0.06, y: h * 0.06, w: w * 0.88, h: h * 0.88 };
  if (format.id === '9x16') {
    const s = w / 1080;
    return { x: z.left * s, y: z.top * s, w: w - (z.left + z.right) * s, h: h - (z.top + z.bottom) * s };
  }
  if (format.id === '4x5') {
    // En el feed el vídeo se ve completo: margen editorial de 6%.
    return { x: w * 0.06, y: h * 0.07, w: w * 0.88, h: h * 0.86 };
  }
  return { x: w * 0.06, y: h * 0.08, w: w * 0.88, h: h * 0.84 };
}
