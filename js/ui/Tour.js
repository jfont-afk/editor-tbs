// Tutorial de bienvenida: un recorrido por el editor que señala dónde está cada herramienta.
// Sale solo la primera vez que alguien entra (también a quien ya tenía cuenta: una vez) y se
// puede repetir desde el botón de ayuda. En la web se recuerda en la cuenta; en local, en el navegador.
import { html, useState, useEffect, useLayoutEffect } from '../lib.js';
import { state, setUI } from '../core/store.js';
import { cloud } from '../core/cloud.js';
import { Icon } from './icons.js';

export const GUIDE_URL = '/docs/guia-editor-tbs.pdf';
const VERSION = '1';
const lsKey = () => 'tbs_tour:' + (cloud.user?.id || 'local');

export function tourSeen() {
  if (cloud.on && cloud.user?.prefs?.tour === VERSION) return true;
  try { return localStorage.getItem(lsKey()) === VERSION; } catch { return false; }
}
function markSeen() {
  try { localStorage.setItem(lsKey(), VERSION); } catch {}
  if (!cloud.on) return;
  cloud.user.prefs = { ...(cloud.user.prefs || {}), tour: VERSION };
  fetch('/api/me/prefs', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tour: VERSION }) }).catch(() => {});
}
export const startTour = () => setUI({ tour: 0, sel: null });
export const tourActive = () => state.ui.tour != null;

// Cada paso: elemento(s) que se iluminan, pestaña que se abre antes y texto
const STEPS = [
  { title: 'Bienvenido al Editor TBS', body: html`Te enseño en un minuto dónde está cada herramienta. Puedes repetir este recorrido cuando quieras desde el botón <b>?</b> de arriba, donde también está la guía en PDF.`, center: true },
  { sel: '.rail', tab: 'media', title: 'Menú de secciones', body: html`Cada sección es una tarea. De arriba abajo siguen el orden normal de trabajo: importar, editar, texto, motions, efectos, color, miniatura y exportar.` },
  { sel: '.panel', tab: 'media', title: 'Medios', body: html`Importa vídeos, fotos y audios (micro externo, música, voz en off). También puedes <b>soltar archivos</b> en cualquier parte de la ventana. Los vídeos nunca salen de tu ordenador.` },
  { sel: '.panel', tab: 'edit', title: 'Editar', body: html`Cortes, <b>quitar silencios</b>, <b>Voz clara</b> para mejorar el audio, tomas repetidas y muletillas, encuadre automático de la cabeza, editar borrando palabras del texto y persona duplicada.` },
  { sel: '.panel', tab: 'captions', title: 'Texto', body: html`Genera los <b>subtítulos automáticos</b> y elige una plantilla TBS. Aquí también están las cajas de texto y las imágenes.` },
  { sel: '.panel', tab: 'motions', title: 'Motions', body: html`Botones de llamada a la acción, títulos, datos y gráficos, listas, flechas, iconos oficiales y el logo. Haz clic en una para añadirla en el cursor.` },
  { sel: '.panel', tab: 'effects', title: 'Efectos', body: html`Zooms (rápidos, lentos, dinámicos), el <b>hook</b> de los primeros segundos, seguir la cara, nitidez, ruido y viñeta.` },
  { sel: '.panel', tab: 'color', title: 'Color', body: html`Looks con un clic y ajustes de luz, contraste, saturación y temperatura, para todo el vídeo o solo un clip.` },
  { sel: '.panel', tab: 'thumb', title: 'Miniatura', body: html`Crea la portada por capas con plantillas TBS y la zona segura de Instagram a la vista.` },
  { sel: '.stage', tab: 'edit', title: 'Reproductor', body: html`<b>Espacio</b> reproduce y pausa. Haz clic en el vídeo, un subtítulo o una motion para seleccionarlo y arrástralo (con imán al centro). <b>Doble clic</b> en un texto para escribir encima. Arriba: formato, comparar, captura y zonas seguras.` },
  { sel: '.timeline', tab: 'edit', title: 'Línea de tiempo', body: html`<b>S</b> corta en el cursor, <b>Q</b> / <b>W</b> recortan el inicio / el final. Arrastra los clips para reordenarlos; <b>Alt + arrastrar</b> duplica. Pistas: motions, subtítulos, vídeo y audio.` },
  { sel: '.insp', tab: 'edit', title: 'Propiedades', body: html`Al seleccionar algo, aquí aparecen sus ajustes. Por ejemplo, en un clip: velocidad, encuadre, volumen y <b>Corrección de audio</b>; en una motion, su texto y colores.` },
  { sel: ['[title="Pantalla de proyectos"]', '.topbar .pmenu'], title: 'Proyectos y guardado', body: html`<b>Proyectos</b> abre la lista de tus proyectos. En <b>Proyecto</b> guardas en una carpeta (brutos, versiones y exportaciones) o lo compartes en un .zip. En la web, además, se guarda solo en tu cuenta.` },
  { sel: '.topbar .cta', tab: 'export', title: 'Exportar', body: html`Cuando termines, exporta el MP4 para redes (con el audio ajustado a −14 LUFS), los subtítulos en SRT o capturas.` },
  { sel: '.help-btn', title: 'Ayuda', body: html`Desde aquí puedes repetir este tutorial y abrir la <b>guía en PDF</b> con todas las herramientas explicadas.` },
  { title: 'Ya puedes empezar', body: html`Empieza importando un vídeo en <b>Medios</b>. Si tienes dudas, abre la guía en PDF: explica cada herramienta con capturas.`, center: true, last: true },
];

function rectOf(sel) {
  const list = (Array.isArray(sel) ? sel : [sel]).map(s => document.querySelector(s)).filter(Boolean)
    .map(el => el.getBoundingClientRect()).filter(r => r.width > 2 && r.height > 2);
  if (!list.length) return null;
  const x0 = Math.min(...list.map(r => r.left)), y0 = Math.min(...list.map(r => r.top));
  const x1 = Math.max(...list.map(r => r.right)), y1 = Math.max(...list.map(r => r.bottom));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Coloca la tarjeta al lado del elemento (derecha, izquierda, abajo o arriba: la primera que quepa)
function place(r, cw, ch) {
  const W = innerWidth, H = innerHeight, m = 14;
  if (!r) return { left: (W - cw) / 2, top: (H - ch) / 2 };
  const cy = Math.min(Math.max(12, r.y + r.h / 2 - ch / 2), H - ch - 12);
  const cx = Math.min(Math.max(12, r.x + r.w / 2 - cw / 2), W - cw - 12);
  if (r.x + r.w + m + cw < W - 8) return { left: r.x + r.w + m, top: cy };
  if (r.x - m - cw > 8) return { left: r.x - m - cw, top: cy };
  if (r.y + r.h + m + ch < H - 8) return { left: cx, top: r.y + r.h + m };
  if (r.y - m - ch > 8) return { left: cx, top: r.y - m - ch };
  return { left: cx, top: H - ch - 16 };
}

export function Tour() {
  const i = state.ui.tour;
  const step = STEPS[i];
  const [rect, setRect] = useState(null);
  const [size, setSize] = useState({ w: 360, h: 220 });
  const close = () => { markSeen(); setUI({ tour: null, tab: 'media', sel: null }); };
  const go = (n) => { if (n < 0) return; if (n >= STEPS.length) return close(); setUI({ tour: n }); };

  // abre la pestaña del paso y mide el elemento cuando ya está pintado
  useLayoutEffect(() => {
    if (!step) return;
    if (step.tab && state.ui.tab !== step.tab) setUI({ tab: step.tab, sel: null });
    const measure = () => setRect(step.center ? null : rectOf(step.sel));
    measure();
    const t = setTimeout(measure, 80);
    addEventListener('resize', measure);
    return () => { clearTimeout(t); removeEventListener('resize', measure); };
  }, [i]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(i + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
      e.stopPropagation();
    };
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  }, [i]);
  if (!step) return null;
  const pad = 6;
  const hole = rect && { left: rect.x - pad, top: rect.y - pad, width: rect.w + pad * 2, height: rect.h + pad * 2 };
  const pos = place(hole && { x: hole.left, y: hole.top, w: hole.width, h: hole.height }, size.w, size.h);
  const cardRef = (el) => { if (el) { const b = el.getBoundingClientRect(); if (Math.abs(b.width - size.w) > 1 || Math.abs(b.height - size.h) > 1) setSize({ w: b.width, h: b.height }); } };
  return html`<div class="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
    ${hole ? html`<div class="tour-hole" style=${`left:${hole.left}px;top:${hole.top}px;width:${hole.width}px;height:${hole.height}px`}></div>` : html`<div class="tour-dim"></div>`}
    <div class=${'tour-card' + (step.center ? ' center' : '')} ref=${cardRef} style=${`left:${pos.left}px;top:${pos.top}px`}>
      <div class="tour-step">${i === 0 || step.last ? 'Tutorial' : `Paso ${i} de ${STEPS.length - 2}`}</div>
      <h3 id="tour-title">${step.title}</h3>
      <p>${step.body}</p>
      <div class="tour-dots">${STEPS.map((_, k) => html`<span class=${k === i ? 'on' : k < i ? 'done' : ''}></span>`)}</div>
      <div class="tour-actions">
        ${!step.last && html`<button class="btn sm ghost" onClick=${close}>Saltar el tutorial</button>`}
        ${step.last && html`<a class="btn sm" href=${GUIDE_URL} target="_blank" rel="noopener"><${Icon} name="download" />Guía en PDF</a>`}
        <span class="spacer"></span>
        ${i > 0 && html`<button class="btn sm" onClick=${() => go(i - 1)}>Anterior</button>`}
        <button class="btn sm primary" autofocus onClick=${() => go(i + 1)}>${i === 0 ? 'Empezar' : step.last ? 'Empezar a editar' : 'Siguiente'}</button>
      </div>
    </div>
  </div>`;
}

// Arranque automático: en cuanto se ve el editor (sin la pantalla de proyectos ni avisos delante)
let autoDone = false;
export function maybeAutoStart() {
  // homeAuto se fija al arrancar, justo cuando se abre la pantalla de proyectos: antes no se sabe qué se verá
  if (autoDone || state.ui.homeAuto === undefined || state.ui.home || state.ui.busy || state.ui.restore || tourActive()) return;
  autoDone = true;
  if (!tourSeen()) setTimeout(startTour, 400);
}

// Botón de ayuda de la barra superior: repetir el tutorial o abrir la guía
export function HelpMenu() {
  const [open, setOpen] = useState(false);
  return html`<div class="pmenu">
    <button class=${'btn icon ghost help-btn' + (open ? ' on' : '')} title="Ayuda: tutorial y guía" onClick=${() => setOpen(!open)}>?</button>
    ${open && html`<div class="pm-pop right" onMouseLeave=${() => setOpen(false)}>
      <div class="pm-status"><b>¿Dudas?</b> Repite el recorrido por el editor o abre la guía con capturas de cada herramienta.</div>
      <button onClick=${() => { setOpen(false); startTour(); }}><${Icon} name="play" />Ver el tutorial</button>
      <a class="pm-link" href=${GUIDE_URL} target="_blank" rel="noopener"><${Icon} name="download" />Guía del editor (PDF)</a>
    </div>`}
  </div>`;
}
