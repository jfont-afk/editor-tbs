import { html, useState, clamp, uid } from '../lib.js';
import { state, update, toast, projectVersion, setUI } from '../core/store.js';
import { Btn, Section, Slider, Toggle, Seg, Select, Swatches } from './controls.js';
import { Icon } from './icons.js';
import * as A from '../core/actions.js';
import { captionGroups, resolveStyle } from '../core/captions.js';
import { ANIMS, OUTS, REVEALS, ACTIVES, LAYOUTS, CAPTION_TEMPLATES, allTemplates, saveUserTemplate, getTemplate } from '../data/captionTemplates.js';
import { F, FONT_CHOICES } from '../data/brand.js';
import { player } from '../engine/player.js';

const setPath = (obj, path, v) => {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { o[ks[i]] = o[ks[i]] && typeof o[ks[i]] === 'object' ? { ...o[ks[i]] } : {}; o = o[ks[i]]; }
  if (v === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = v;
};

// Escribe una propiedad de estilo en el ámbito elegido (todo el vídeo o un bloque)
function writer(scope) {
  return (path, v) => {
    if (scope === 'all') update(pp => { const s = structuredClone(pp.captions.style || {}); setPath(s, path, v); pp.captions.style = s; }, { key: 'cs' + path });
    else A.wordMutate(scope, w => { const gs = { ...(w.gs || {}) }; const s = structuredClone(gs.style || {}); setPath(s, path, v); gs.style = s; w.gs = gs; }, 'gs' + scope + path);
  };
}

const WEIGHTS = { [F.head]: [400, 500, 700], [F.body]: [400, 500, 600, 700, 800, 900], [F.serif]: [400, 500, 600, 700, 800, 900], [F.script]: [400], [F.mono]: [400, 500, 700] };
const pct = (v) => Math.round(v * 100) + '%';

function EffectCard({ title, on, onToggle, children }) {
  return html`<div class="fx-card">
    <div class=${'toggle' + (on ? ' on' : '')} onClick=${() => onToggle(!on)}><span class="t-label">${title}</span><span class="switch"></span></div>
    ${on && html`<div class="stack" style="padding-top:6px">${children}</div>`}
  </div>`;
}

function TextTab({ st, set, scope }) {
  const p = state.project;
  const fam = st.font.family;
  return html`<div class="stack">
    <${Select} label="Tipografía TBS" value=${fam} options=${FONT_CHOICES.map(f => [f.family, f.label])} onChange=${v => { set('font.family', v); if (!(WEIGHTS[v] || []).includes(st.font.weight)) set('font.weight', (WEIGHTS[v] || [700]).slice(-1)[0]); }} />
    <div class="row">
      <div class="grow"><${Select} value=${String(st.font.weight)} onChange=${v => set('font.weight', parseInt(v))} options=${(WEIGHTS[fam] || [400, 700]).map(w => [String(w), { 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extrabold', 900: 'Black' }[w] || String(w)])} /></div>
      <button class=${'btn icon sm' + (st.font.style === 'italic' ? ' on' : '')} title="Cursiva" onClick=${() => set('font.style', st.font.style === 'italic' ? 'normal' : 'italic')} style="font-family:var(--font-serif);font-style:italic;font-weight:700">I</button>
      <button class=${'btn icon sm' + (st.font.upper ? ' on' : '')} title="Mayúsculas" onClick=${() => set('font.upper', !st.font.upper)} style="font-weight:800">AA</button>
    </div>
    ${scope === 'all'
      ? html`<${Slider} label="Tamaño" value=${p.captions.size} min=${0.4} max=${2.2} step=${0.01} format=${pct} onInput=${v => update(pp => { pp.captions.size = v; }, { key: 'capsize' })} />`
      : html`<${Slider} label="Tamaño del bloque" value=${(A.findWord(scope)?.w.gs?.size) || 1} min=${0.4} max=${2.5} step=${0.01} format=${pct} onInput=${v => A.setGroupStyle(scope, { size: v })} />`}
    <${Slider} label="Interletrado" value=${st.font.ls ?? 0} min=${-0.12} max=${0.25} step=${0.005} center format=${v => (v * 100).toFixed(1).replace('.', ',') + '%'} onInput=${v => set('font.ls', v)} />
    <${Slider} label="Interlineado" value=${st.font.lh ?? 1.15} min=${0.75} max=${1.8} step=${0.01} format=${v => v.toFixed(2).replace('.', ',')} onInput=${v => set('font.lh', v)} />
    <${Swatches} label="Color del texto" value=${st.color} onChange=${v => set('color', v)} />
    <div class="sub-title">Palabras destacadas</div>
    <${Swatches} label="Destacado 1 (clic)" value=${st.hl?.color} onChange=${v => set('hl.color', v)} />
    <div class="grid2">
      <${Select} label="Tipografía" value=${st.hl?.family || ''} options=${[['', 'Igual'], [F.serif, 'Playfair itálica'], [F.script, 'Sacramento'], [F.head, 'Space Grotesk'], [F.body, 'Raleway']]}
        onChange=${v => { set('hl.family', v || undefined); set('hl.style', v === F.serif ? 'italic' : undefined); set('hl.weight', v === F.script ? 400 : v ? 600 : undefined); }} />
      <${Select} label="Tamaño" value=${String(st.hl?.scale || 1)} options=${[['1', 'Igual'], ['1.15', '+15%'], ['1.3', '+30%'], ['1.6', '+60%'], ['2.3', 'Enorme']]} onChange=${v => set('hl.scale', parseFloat(v))} />
    </div>
    <${Swatches} label="Destacado 2 (segundo clic en la palabra)" value=${st.hl2?.color} onChange=${v => set('hl2.color', v)} />
    <div class="sub-title">Maquetación</div>
    <${Seg} small value=${st.align} onChange=${v => set('align', v)} options=${[['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']]} />
    <${Select} value=${st.layout} options=${LAYOUTS.map(l => [l.id, l.name])} onChange=${v => set('layout', v)} />
    <div class="grid2">
      <${Slider} label="Ancho máx." value=${st.maxW ?? 0.9} min=${0.35} max=${1} step=${0.01} format=${pct} onInput=${v => set('maxW', v)} />
      <${Slider} label="Líneas máx." value=${st.maxLines ?? 2} min=${1} max=${4} step=${1} format=${v => String(v)} onInput=${v => set('maxLines', v)} />
    </div>
  </div>`;
}

function EffectsTab({ st, set }) {
  const p = state.project;
  const b = st.box || {};
  return html`<div class="stack">
    <${EffectCard} title="Sombra" on=${!!st.shadow?.on} onToggle=${v => set('shadow.on', v)}>
      <${Swatches} value=${st.shadow.color} onChange=${v => set('shadow.color', v)} />
      <${Slider} label="Opacidad" value=${st.shadow.opacity ?? 0.55} min=${0} max=${1} step=${0.01} format=${pct} onInput=${v => set('shadow.opacity', v)} />
      <${Slider} label="Desenfoque" value=${st.shadow.blur ?? 18} min=${0} max=${70} step=${1} format=${v => v + ' px'} onInput=${v => set('shadow.blur', v)} />
      <${Slider} label="Distancia" value=${st.shadow.y ?? 3} min=${-20} max=${30} step=${0.5} center format=${v => v + ' px'} onInput=${v => set('shadow.y', v)} />
    </${EffectCard}>
    <${EffectCard} title="Contorno" on=${!!st.stroke?.on} onToggle=${v => set('stroke.on', v)}>
      <${Swatches} value=${st.stroke.color} onChange=${v => set('stroke.color', v)} />
      <${Slider} label="Grosor" value=${st.stroke.w ?? 3} min=${0.5} max=${12} step=${0.5} format=${v => v + ' px'} onInput=${v => set('stroke.w', v)} />
      <${Slider} label="Opacidad" value=${st.stroke.opacity ?? 1} min=${0.1} max=${1} step=${0.01} format=${pct} onInput=${v => set('stroke.opacity', v)} />
    </${EffectCard}>
    <${EffectCard} title="Brillo (glow)" on=${!!st.glow?.on} onToggle=${v => set('glow.on', v)}>
      <${Swatches} value=${st.glow.color} onChange=${v => set('glow.color', v)} />
      <${Slider} label="Intensidad" value=${st.glow.alpha ?? 0.6} min=${0.1} max=${1} step=${0.01} format=${pct} onInput=${v => set('glow.alpha', v)} />
      <${Slider} label="Radio" value=${st.glow.blur ?? 28} min=${4} max=${90} step=${1} format=${v => v + ' px'} onInput=${v => set('glow.blur', v)} />
    </${EffectCard}>
    <${EffectCard} title="Fondo" on=${!!b.on} onToggle=${v => set('box.on', v)}>
      <${Seg} small value=${b.mode || 'block'} onChange=${v => set('box.mode', v)} options=${[['block', 'Bloque'], ['line', 'Por línea'], ['word', 'Por palabra']]} />
      <${Swatches} value=${b.color} onChange=${v => set('box.color', v)} />
      <${Slider} label="Opacidad" value=${b.opacity ?? 0.8} min=${0.05} max=${1} step=${0.01} format=${pct} onInput=${v => set('box.opacity', v)} />
      <${Slider} label="Redondeo" value=${b.radius ?? 14} min=${0} max=${60} step=${1} format=${v => v + ' px'} onInput=${v => set('box.radius', v)} />
      <div class="grid2">
        <${Slider} label="Margen X" value=${b.padX ?? 20} min=${4} max=${60} step=${1} format=${v => v + ''} onInput=${v => set('box.padX', v)} />
        <${Slider} label="Margen Y" value=${b.padY ?? 10} min=${2} max=${40} step=${1} format=${v => v + ''} onInput=${v => set('box.padY', v)} />
      </div>
      ${(b.mode || 'block') === 'block' && html`<${Toggle} label="Efecto cristal" sub="Desenfoca el vídeo detrás" value=${!!b.blur} onChange=${v => { set('box.blur', v ? 16 : 0); set('box.ring', v); }} />`}
    </${EffectCard}>
    <${Toggle} label="Legibilidad automática" sub="Refuerza la sombra si el fondo es claro" value=${p.captions.autoReadable} onChange=${v => update(pp => { pp.captions.autoReadable = v; })} />
    <${Toggle} label="Decoración: caja de selección" sub="Marco discontinuo con tiradores (estilo Mirko)" value=${st.deco === 'select'} onChange=${v => set('deco', v ? 'select' : 'none')} />
  </div>`;
}

function AnimTab({ st, set, scope }) {
  const g = scope !== 'all' ? captionGroups(state.project, projectVersion).find(x => x.id === scope) : null;
  const preview = () => {
    const groups = captionGroups(state.project, projectVersion);
    const gg = g || groups.find(x => x.start >= player.duration * 0) || groups[0];
    if (!gg) return;
    player.seek(Math.max(0, gg.start - 0.05)); player.play();
    setTimeout(() => player.pause(), Math.min(4000, (gg.end - gg.start + 0.6) * 1000));
  };
  return html`<div class="stack">
    <div class="field"><span class="field-label">Entrada</span>
      <div class="anim-grid">${ANIMS.map(a => html`<button class=${'chip' + (st.anim === a.id ? ' on' : '')} onClick=${() => set('anim', a.id)}>${a.name}</button>`)}</div>
    </div>
    <div class="field"><span class="field-label">Aparición</span><${Seg} small value=${st.reveal} onChange=${v => set('reveal', v)} options=${REVEALS.map(r => [r.id, r.name])} /></div>
    <${Slider} label="Duración de la animación" value=${st.animDur ?? 1} min=${0.4} max=${2.5} step=${0.05} format=${v => v < 0.8 ? 'Rápida' : v > 1.4 ? 'Lenta' : 'Normal'} onInput=${v => set('animDur', v)} />
    ${['letters', 'wave'].includes(st.anim) && html`<${Slider} label="Retardo entre letras" value=${st.stagger ?? 0.03} min=${0.005} max=${0.09} step=${0.005} format=${v => Math.round(v * 1000) + ' ms'} onInput=${v => set('stagger', v)} />`}
    <div class="field"><span class="field-label">Palabra que suena</span><${Seg} small value=${st.active?.mode || 'none'} onChange=${v => set('active.mode', v)} options=${ACTIVES.map(a => [a.id, a.name])} /></div>
    ${st.active?.mode && st.active.mode !== 'none' && st.active.mode !== 'scale' && html`<${Swatches} label="Color de la palabra que suena" value=${st.active.color} onChange=${v => set('active.color', v)} />`}
    <div class="field"><span class="field-label">Salida</span><${Seg} small value=${st.out || 'none'} onChange=${v => set('out', v)} options=${OUTS.map(o => [o.id, o.name])} /></div>
    <${Btn} icon="play" onClick=${preview}>Ver la animación</${Btn}>
  </div>`;
}

function PosTab({ st, scope }) {
  const p = state.project;
  const setPos = (x, y, fit = false) => {
    if (scope === 'all') update(pp => { if (x !== null) pp.captions.posX = x; if (y !== null) pp.captions.posY = y; if (fit) pp.captions.posFree = false; }, { key: 'cappos' });
    else A.setGroupStyle(scope, { ...(x !== null ? { posX: x } : {}), ...(y !== null ? { posY: y } : {}) });
  };
  const px = st.posX ?? 0.5, py = st.posY ?? 0.64;
  const grid = [[0.3, 0.22], [0.5, 0.22], [0.7, 0.22], [0.3, 0.5], [0.5, 0.5], [0.7, 0.5], [0.3, 0.68], [0.5, 0.68], [0.7, 0.68]];
  const gs = scope !== 'all' ? A.findWord(scope)?.w.gs : null;
  return html`<div class="stack">
    <div class="pos-pad">${grid.map(([x, y]) => html`<button class=${'pos-cell' + (Math.abs(px - x) < 0.05 && Math.abs(py - y) < 0.05 ? ' on' : '')} onClick=${() => setPos(x, y, true)}><span></span></button>`)}</div>
    <${Slider} label="Horizontal" value=${px} min=${0.1} max=${0.9} step=${0.005} format=${pct} onInput=${v => setPos(v, null)} />
    <${Slider} label="Vertical" value=${py} min=${0.08} max=${0.92} step=${0.005} format=${pct} onInput=${v => setPos(null, v)} />
    <div class="row" style="justify-content:center;gap:4px">
      <${Btn} cls="icon sm" title="Subir un poco" onClick=${() => setPos(null, clamp(py - 0.01, 0.05, 0.95))}><span style="transform:rotate(-90deg);display:inline-flex"><${Icon} name="chevronRight" /></span></${Btn}>
      <${Btn} cls="icon sm" title="Bajar un poco" onClick=${() => setPos(null, clamp(py + 0.01, 0.05, 0.95))}><span style="transform:rotate(90deg);display:inline-flex"><${Icon} name="chevronRight" /></span></${Btn}>
      <${Btn} cls="icon sm" title="Izquierda" onClick=${() => setPos(clamp(px - 0.01, 0.05, 0.95), null)}><span style="transform:rotate(180deg);display:inline-flex"><${Icon} name="chevronRight" /></span></${Btn}>
      <${Btn} cls="icon sm" title="Derecha" onClick=${() => setPos(clamp(px + 0.01, 0.05, 0.95), null)}><${Icon} name="chevronRight" /></${Btn}>
      ${scope !== 'all' && (gs?.posY !== undefined || gs?.posX !== undefined) && html`<${Btn} cls="sm ghost" onClick=${() => A.setGroupStyle(scope, { posX: null, posY: null })}>Posición general</${Btn}>`}
    </div>
    <div class="dim small">Arrastra el texto directamente en el reproductor: el imán lo centra o lo pega a los márgenes seguros según su alineación (mantén Alt para moverlo sin imán). Doble clic para cambiar el texto.</div>
    ${scope === 'all'
      ? html`<${Toggle} label="Texto detrás de la persona" sub="La persona tapa el texto (IA)" value=${p.captions.behind} onChange=${v => update(pp => { pp.captions.behind = v; })} />
             <${Toggle} label="Evitar tapar la cara" value=${p.captions.avoidFace} onChange=${v => update(pp => { pp.captions.avoidFace = v; })} />`
      : html`<${Toggle} label="Detrás de la persona" value=${st.behind} onChange=${v => A.setGroupStyle(scope, { behind: v })} />
             <${Toggle} label="Ocultar este bloque" value=${st.hidden} onChange=${v => A.setGroupStyle(scope, { hidden: v || null })} />`}
  </div>`;
}

export function CaptionStyleEditor() {
  const p = state.project, ui = state.ui;
  const sel = ui.sel?.type === 'group' ? ui.sel.id : null;
  const [tab, setTab] = useState('text');
  const scopeMode = ui.capScope || 'all';
  const setScopeMode = (v) => setUI({ capScope: v });
  const scope = sel && scopeMode === 'group' ? sel : 'all';
  const g = sel ? captionGroups(p, projectVersion).find(x => x.id === sel) : null;
  const st = resolveStyle(p.captions, scope === 'all' ? null : g?.ov);
  if (scope === 'all') { st.posX = p.captions.posX ?? 0.5; st.posY = p.captions.posY; }
  const set = writer(scope);
  const [naming, setNaming] = useState(null);
  const tplName = getTemplate(scope === 'all' ? p.captions.template : (g?.ov?.template || p.captions.template)).name;
  const reset = () => {
    if (scope === 'all') update(pp => { pp.captions.style = {}; pp.captions.color = null; pp.captions.hlColor = null; pp.captions.anim = null; });
    else A.setGroupStyle(scope, { style: null, template: null, anim: null, reveal: null, size: null, color: null, hlColor: null, posX: null, posY: null, upper: null });
  };
  const saveTpl = () => {
    const name = (naming || '').trim() || 'Mi plantilla';
    const full = resolveStyle(p.captions, scope === 'all' ? null : g?.ov);
    full.font.size /= (p.captions.size || 1) * (g?.ov?.size || 1);
    const t = { ...full, id: 'user_' + uid('t'), name, ref: 'Plantilla guardada', cat: 'Mis plantillas', words: p.captions.wordsPerGroup, maxChars: p.captions.maxChars };
    // la plantilla guarda también la posición (X/Y)
    t.posX = scope === 'all' ? (p.captions.posX ?? 0.5) : (g?.ov?.posX ?? p.captions.posX ?? 0.5);
    t.posY = scope === 'all' ? p.captions.posY : (g?.ov?.posY ?? p.captions.posY);
    delete t.behind; delete t.hidden; delete t.ownPos; delete t.freePos;
    saveUserTemplate(t);
    update(pp => { pp.captions.template = t.id; pp.captions.style = {}; pp.captions.posX = t.posX; pp.captions.posY = t.posY; });
    setNaming(null);
    toast('Plantilla guardada en “Mis plantillas”');
  };
  return html`
    <div class="insp-head"><h3 class="insp-title">Estilo de subtítulos</h3><span class="tag fluor">${tplName}</span></div>
    <div class="insp-body">
      ${sel && html`<div style="margin-bottom:10px"><${Seg} small value=${scopeMode} onChange=${setScopeMode} options=${[['all', 'Todo el vídeo'], ['group', 'Solo este bloque']]} /></div>`}
      ${scope !== 'all' && g && html`<div class="note small" style="margin-bottom:10px">“${g.text}”</div>`}
      <div class="tabs">
        ${[['text', 'Texto'], ['fx', 'Efectos'], ['anim', 'Animación'], ['pos', 'Posición']].map(([k, l]) => html`<button class=${tab === k ? 'on' : ''} onClick=${() => setTab(k)}>${l}</button>`)}
      </div>
      <div style="padding-top:12px">
        ${tab === 'text' && html`<${TextTab} st=${st} set=${set} scope=${scope} />`}
        ${tab === 'fx' && html`<${EffectsTab} st=${st} set=${set} />`}
        ${tab === 'anim' && html`<${AnimTab} st=${st} set=${set} scope=${scope} />`}
        ${tab === 'pos' && html`<${PosTab} st=${st} scope=${scope} />`}
      </div>
      <div class="section" style="margin-top:12px">
        <div class="stack">
          ${naming !== null ? html`<div class="row"><input class="input grow" placeholder="Nombre de la plantilla" value=${naming} onInput=${e => setNaming(e.target.value)} onKeyDown=${e => e.key === 'Enter' && saveTpl()} autofocus /><${Btn} cls="fluor sm" onClick=${saveTpl}>Guardar</${Btn}></div>`
            : html`<${Btn} icon="save" onClick=${() => setNaming('')}>Guardar como mi plantilla</${Btn}>`}
          <${Btn} cls="ghost" onClick=${reset}>Restablecer ${scope === 'all' ? 'a la plantilla' : 'este bloque'}</${Btn}>
        </div>
      </div>
    </div>`;
}
