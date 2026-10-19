import { html, useState, useEffect, useRef, useLayoutEffect, downloadBlob } from '../../lib.js';
import { state, update, toast, runtime, emit, busy } from '../../core/store.js';
import { Btn, Section, Seg, Select, TextInput, Toggle, Slider } from '../controls.js';
import { Icon } from '../icons.js';
import { player, timeBus } from '../../engine/player.js';
import { personMaskImage } from '../../ai/vision.js';
import { C, F } from '../../data/brand.js';
import { rrect, withAlpha } from '../../render/anim.js';

const TF = { '9x16': [1080, 1920], '16x9': [1280, 720], '1x1': [1080, 1080], '4x5': [1080, 1350] };
// Combinaciones de las portadas de webinar del Design System
export const COLORWAYS = [
  { id: 'dark', name: 'Oscuro · Fluor', bg: C.n900, title: C.fluor, accent: C.white, glow: true },
  { id: 'fluor', name: 'Fluor', bg: C.fluor, title: C.fluorInk, accent: C.n900 },
  { id: 'olive', name: 'Oliva · Fluor', bg: C.fluorInk, title: C.fluor, accent: C.white },
  { id: 'magenta', name: 'Magenta', bg: C.magenta, title: C.magentaInk, accent: C.white },
  { id: 'blue', name: 'Azul · Fluor', bg: C.blue, title: C.fluor, accent: C.white },
  { id: 'green', name: 'Verde', bg: C.green, title: C.n900, accent: C.n900 },
];

export const defaultThumb = () => ({
  layout: 'portada', format: '9x16', colorway: 'dark', title: 'INVERTIR SIN MIEDO', accent: 'en 2026', script: 'cómo',
  tag: 'CLASES GRATUITAS', cutout: true, outline: false, darken: 0.35, logo: true, zoom: 1, offY: 0,
});

const rt = { photo: null, mask: null, key: null };

function fitLines(ctx, text, maxW, fs0, fam, w8, ls = -0.035, perLine = 2) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = text.includes('\n') ? text.split('\n') : [];
  if (!lines.length) for (let i = 0; i < words.length; i += perLine) lines.push(words.slice(i, i + perLine).join(' '));
  let fs = fs0;
  const m = () => { ctx.font = `${w8} ${fs}px "${fam}"`; ctx.letterSpacing = `${ls * fs}px`; return Math.max(...lines.map(l => ctx.measureText(l).width)); };
  let w = m();
  if (w > maxW) { fs *= maxW / w; w = m(); }
  ctx.letterSpacing = '0px';
  return { lines, fs, w };
}

function drawLines(ctx, L, x, y, color, fam, w8, align = 'center', glow = null, lh = 0.92, ls = -0.035) {
  ctx.font = `${w8} ${L.fs}px "${fam}"`; ctx.letterSpacing = `${ls * L.fs}px`;
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = color;
  L.lines.forEach((l, i) => {
    const yy = y + L.fs * 0.78 + i * L.fs * lh;
    if (glow) { ctx.save(); ctx.shadowColor = withAlpha(glow, 0.55); ctx.shadowBlur = L.fs * 0.3; ctx.fillText(l, x, yy); ctx.restore(); }
    ctx.fillText(l, x, yy);
  });
  ctx.letterSpacing = '0px';
  return L.lines.length * L.fs * lh;
}

function cutoutCanvas(W, H, rect, outline, color) {
  if (!rt.photo || !rt.mask) return null;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.drawImage(rt.photo, rect.x, rect.y, rect.w, rect.h);
  x.globalCompositeOperation = 'destination-in';
  x.filter = 'blur(1.5px)';
  x.drawImage(rt.mask, rect.x, rect.y, rect.w, rect.h);
  x.filter = 'none';
  x.globalCompositeOperation = 'source-over';
  if (!outline) return c;
  // contorno tipo pegatina
  const o = document.createElement('canvas'); o.width = W; o.height = H;
  const ox = o.getContext('2d');
  const r = Math.max(6, W * 0.008);
  for (let a = 0; a < 16; a++) ox.drawImage(c, Math.cos(a / 16 * Math.PI * 2) * r, Math.sin(a / 16 * Math.PI * 2) * r);
  ox.globalCompositeOperation = 'source-in'; ox.fillStyle = color; ox.fillRect(0, 0, W, H);
  ox.globalCompositeOperation = 'source-over'; ox.drawImage(c, 0, 0);
  return o;
}

export function drawThumb(ctx, W, H, th, logo) {
  const cw = COLORWAYS.find(c => c.id === th.colorway) || COLORWAYS[0];
  const u = Math.min(W, H) / 1080;
  ctx.save();
  ctx.fillStyle = cw.bg; ctx.fillRect(0, 0, W, H);
  const photo = rt.photo;
  const pr = (fill = true, scale = 1) => {
    if (!photo) return null;
    const s = (fill ? Math.max(W / photo.width, H / photo.height) : Math.min(W / photo.width, H / photo.height)) * scale * (th.zoom || 1);
    const w = photo.width * s, h = photo.height * s;
    return { x: (W - w) / 2, y: (H - h) / 2 + (th.offY || 0) * H, w, h };
  };
  const tag = (x, y, align = 'left') => {
    if (!th.tag) return;
    const s = th.tag.toLocaleUpperCase('es-ES');
    const fs = 30 * u; ctx.font = `700 ${fs}px "${F.head}"`; ctx.letterSpacing = `${2 * u}px`;
    const tw = ctx.measureText(s).width, w = tw + 56 * u, h = 64 * u;
    const bx = align === 'center' ? x - w / 2 : x;
    rrect(ctx, bx, y, w, h, h / 2); ctx.fillStyle = 'rgba(18,18,20,0.5)'; ctx.fill();
    rrect(ctx, bx, y, w, h, h / 2); ctx.fillStyle = withAlpha(C.magenta, 0.25); ctx.fill();
    ctx.save(); rrect(ctx, bx, y, w, h, h / 2); ctx.clip(); ctx.lineWidth = 4 * u; ctx.strokeStyle = C.magenta; rrect(ctx, bx, y, w, h, h / 2); ctx.stroke(); ctx.restore();
    ctx.fillStyle = C.magentaSoft; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s, bx + 28 * u, y + h / 2 + 2 * u);
    ctx.letterSpacing = '0px';
  };
  const drawLogo = (x, y, align = 'center') => {
    if (!th.logo) return;
    if (logo) { const w = 260 * u, h = w * logo.height / logo.width; ctx.drawImage(logo, align === 'center' ? x - w / 2 : x, y, w, h); return; }
    ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = cw.id === 'fluor' || cw.id === 'green' ? C.n900 : C.white;
    ctx.font = `700 ${34 * u}px "${F.head}"`; ctx.fillText('TRADERS', x, y + 34 * u);
    ctx.font = `italic 500 ${28 * u}px "${F.serif}"`; ctx.fillText('Business School', x, y + 66 * u);
  };

  if (th.layout === 'webinar') {
    if (cw.glow) { const g = ctx.createRadialGradient(W * 0.5, H * 1.05, 10, W * 0.5, H * 1.05, Math.max(W, H) * 0.7); g.addColorStop(0, 'rgba(232,9,76,0.9)'); g.addColorStop(1, 'rgba(140,6,46,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    const wide = W > H;
    const r = pr(false, wide ? 1.05 : 0.95);
    if (r) {
      const rr = wide ? { ...r, x: W - r.w * 0.92 } : { ...r, y: H - r.h };
      const cut = th.cutout ? cutoutCanvas(W, H, rr, th.outline, C.white) : null;
      if (cut) ctx.drawImage(cut, 0, 0); else if (!th.cutout) { ctx.save(); ctx.globalAlpha = 0.9; ctx.drawImage(photo, rr.x, rr.y, rr.w, rr.h); ctx.restore(); }
    }
    const m = 61 * u * (wide ? 1.2 : 1.4);
    tag(m, m);
    const L = fitLines(ctx, th.title.toLocaleUpperCase('es-ES'), wide ? W * 0.52 : W * 0.86, (wide ? 120 : 150) * u, F.head, 700);
    const hT = drawLines(ctx, L, m, m + 110 * u, cw.title, F.head, 700, 'left', cw.glow ? cw.title : null);
    if (th.accent) { ctx.font = `italic 500 ${L.fs * 0.5}px "${F.serif}"`; ctx.fillStyle = cw.accent; ctx.textAlign = 'left'; ctx.fillText(th.accent, m, m + 110 * u + hT + L.fs * 0.45); }
    drawLogo(m, H - m - 70 * u, 'left');
  } else {
    // portada (Guille) y editorial (Marco): foto a pantalla completa
    const r = pr(true);
    if (r) ctx.drawImage(photo, r.x, r.y, r.w, r.h);
    if (th.darken > 0) {
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.6);
      g.addColorStop(0, `rgba(0,0,0,${th.darken})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const g2 = ctx.createLinearGradient(0, H * 0.65, 0, H);
      g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, `rgba(0,0,0,${th.darken * 0.9})`);
      ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
    }
    const topY = H > W ? H * 0.11 : H * 0.08;
    if (th.layout === 'editorial') {
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 20 * u;
      const L = fitLines(ctx, th.title.toLowerCase(), W * 0.84, 92 * u, F.head, 700, -0.03, 4);
      const h1 = drawLines(ctx, L, W / 2, topY, C.white, F.head, 700, 'center', null, 1.0, -0.03);
      if (th.accent) { const A2 = fitLines(ctx, th.accent.toLocaleUpperCase('es-ES'), W * 0.8, L.fs * 1.1, F.serif, 'italic 500', 0, 6); drawLines(ctx, A2, W / 2, topY + h1 - L.fs * 0.1, cw.id === 'dark' ? C.white : cw.bg, F.serif, 'italic 500', 'center', null, 1, 0); }
      ctx.restore();
    } else {
      const col = cw.id === 'dark' ? C.fluor : cw.bg;
      const L = fitLines(ctx, th.title.toLocaleUpperCase('es-ES'), W * 0.9, 210 * u, F.head, 700, -0.035, 1);
      const hT = drawLines(ctx, L, W / 2, topY, col, F.head, 700, 'center', col);
      // persona por delante del título
      if (th.cutout && r) { const cut = cutoutCanvas(W, H, r, th.outline, C.white); if (cut) ctx.drawImage(cut, 0, 0); }
      if (th.script) { ctx.save(); ctx.font = `400 ${L.fs * 0.62}px "${F.script}"`; ctx.fillStyle = C.white; ctx.textAlign = 'left'; ctx.shadowColor = 'rgba(255,255,255,0.55)'; ctx.shadowBlur = 24 * u; ctx.fillText(th.script, W * 0.08, topY + L.fs * 0.32); ctx.restore(); }
      if (th.accent) { ctx.save(); ctx.font = `italic 600 ${Math.max(40 * u, L.fs * 0.34)}px "${F.serif}"`; ctx.fillStyle = C.white; ctx.textAlign = 'center'; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 16 * u; ctx.fillText(th.accent, W / 2, topY + hT + L.fs * 0.32); ctx.restore(); }
    }
    if (th.tag) tag(W / 2, H - (H > W ? H * 0.2 : H * 0.18), 'center');
    drawLogo(W / 2, H - (H > W ? H * 0.12 : H * 0.12));
  }
  ctx.restore();
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
    update(pp => { pp.thumb = { ...(pp.thumb || defaultThumb()), frameT: timeBus.t }; });
  } finally { busy(null); emit(); }
}

function ThumbStage() {
  const p = state.project;
  const th = p.thumb || defaultThumb();
  const ref = useRef(), areaRef = useRef();
  const [box, setBox] = useState({ w: 300, h: 500 });
  const [W, H] = TF[th.format] || TF['9x16'];
  const logoRef = useRef(null);
  useEffect(() => {
    if (!p.brand?.logo) { logoRef.current = null; return; }
    const i = new Image(); i.onload = () => { logoRef.current = i; draw(); }; i.src = p.brand.logo;
  }, [p.brand?.logo]);
  useLayoutEffect(() => {
    const el = areaRef.current; if (!el) return;
    const fit = () => { const r = el.getBoundingClientRect(); const ar = W / H; let w = r.width - 40, h = w / ar; if (h > r.height - 40) { h = r.height - 40; w = h * ar; } setBox({ w, h }); };
    fit(); const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect();
  }, [W, H]);
  const draw = () => {
    const c = ref.current; if (!c) return;
    c.width = W; c.height = H;
    drawThumb(c.getContext('2d'), W, H, th, logoRef.current);
  };
  useEffect(draw);
  return html`<section class="stage">
    <div class="stage-area" ref=${areaRef}>
      ${!rt.photo && th.layout !== 'webinar' ? html`<div class="empty-stage">
        <span class="tag fluor">Miniatura</span>
        <h2>Captura un fotograma y conviértelo en <em>portada</em></h2>
        <p class="muted">Mueve el cursor de la línea de tiempo al mejor momento y pulsa capturar.</p>
        <button class="btn fluor lg" onClick=${captureForThumb}><${Icon} name="camera" />Capturar fotograma actual</button>
      </div>` : html`<canvas ref=${ref} class="thumb-canvas" style=${`width:${box.w}px;height:${box.h}px`}></canvas>`}
    </div>
  </section>`;
}

export function ThumbPanel() {
  const p = state.project;
  const th = p.thumb || defaultThumb();
  const set = (k, key) => (v) => update(pp => { pp.thumb = { ...(pp.thumb || defaultThumb()), [k]: v }; }, { key: key || 'th' + k });
  const save = async (type) => {
    const [W, H] = TF[th.format];
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const logo = p.brand?.logo ? await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = p.brand.logo; }) : null;
    drawThumb(c.getContext('2d'), W, H, th, logo);
    const blob = await new Promise(r => c.toBlob(r, type === 'png' ? 'image/png' : 'image/jpeg', 0.92));
    const fname = `${(p.name || 'miniatura').replace(/[\\/:*?"<>|]+/g, '')}_miniatura_${th.format}.${type}`;
    const PF = await import('../../core/projectFolder.js');
    if (PF.folderActive() && await PF.saveToFolder('Miniaturas', fname, blob)) { toast('Miniatura guardada en la carpeta del proyecto › Miniaturas'); return; }
    downloadBlob(blob, fname);
    toast('Miniatura guardada en Descargas');
  };
  return html`
    <div class="panel-head">
      <h2 class="panel-title">Miniatura</h2>
      <p class="panel-desc">Portada para Reels, TikTok o YouTube con los colores de TBS.</p>
    </div>
    <div class="panel-body">
      <${Section} title="Fotograma">
        <${Btn} cls="fluor block" icon="camera" onClick=${captureForThumb}>${rt.photo ? 'Capturar otro fotograma' : 'Capturar fotograma actual'}</${Btn}>
      </${Section}>
      <${Section} title="Diseño">
        <div class="stack">
          <${Seg} value=${th.layout} onChange=${set('layout')} options=${[['portada', 'Portada'], ['editorial', 'Editorial'], ['webinar', 'Webinar TBS']]} />
          <${Seg} value=${th.format} onChange=${set('format')} options=${[['9x16', '9:16'], ['4x5', '4:5'], ['1x1', '1:1'], ['16x9', 'YouTube']]} />
          <div class="field"><span class="field-label">Colores (portadas TBS)</span>
            <div class="swatches">${COLORWAYS.map(c => html`<button class=${'swatch' + (th.colorway === c.id ? ' on' : '')} title=${c.name} style=${`background:linear-gradient(135deg, ${c.bg} 50%, ${c.title} 50%)`} onClick=${() => set('colorway')(c.id)}></button>`)}</div>
          </div>
        </div>
      </${Section}>
      <${Section} title="Textos">
        <div class="stack">
          <${TextInput} label="Título" value=${th.title} onInput=${set('title')} multiline />
          <${TextInput} label=${th.layout === 'portada' ? 'Frase bajo el título' : 'Palabra acento (serif)'} value=${th.accent} onInput=${set('accent')} />
          ${th.layout === 'portada' && html`<${TextInput} label="Palabra script" value=${th.script} onInput=${set('script')} />`}
          <${TextInput} label="Etiqueta" value=${th.tag} onInput=${set('tag')} placeholder="Vacío = sin etiqueta" />
        </div>
      </${Section}>
      <${Section} title="Persona y fondo">
        <div class="stack">
          <${Toggle} label="Recortar a la persona" sub=${th.layout === 'portada' ? 'La persona queda delante del título' : 'Quita el fondo de la foto'} value=${th.cutout} onChange=${set('cutout')} />
          <${Toggle} label="Contorno blanco" value=${th.outline} onChange=${set('outline')} />
          <${Slider} label="Oscurecer" value=${th.darken} min=${0} max=${0.8} step=${0.01} format=${v => Math.round(v * 100) + '%'} onInput=${set('darken')} />
          <${Slider} label="Zoom de la foto" value=${th.zoom} min=${0.6} max=${2} step=${0.01} format=${v => Math.round(v * 100) + '%'} onInput=${set('zoom')} />
          <${Slider} label="Posición vertical" value=${th.offY} min=${-0.4} max=${0.4} step=${0.005} center format=${v => Math.round(v * 100)} onInput=${set('offY')} />
          <${Toggle} label="Logo" value=${th.logo} onChange=${set('logo')} />
        </div>
      </${Section}>
      <${Section} title="Guardar">
        <div class="grid2">
          <${Btn} cls="cta" icon="download" onClick=${() => save('jpg')}>JPG</${Btn}>
          <${Btn} icon="download" onClick=${() => save('png')}>PNG</${Btn}>
        </div>
      </${Section}>
    </div>`;
}
ThumbPanel.Stage = ThumbStage;
