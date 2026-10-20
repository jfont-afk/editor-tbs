import { html, fmtDur, fmtTime, clamp } from '../lib.js';
import { state, update, setUI, projectVersion } from '../core/store.js';
import { Btn, Section, Slider, Toggle, Seg, Select, TextInput, NumberInput, Swatches } from './controls.js';
import { Icon, TbsIcon } from './icons.js';
import { TBS_ICON_OPTIONS } from '../data/tbsIcons.js';
import * as A from '../core/actions.js';
import { MOTIONS } from '../render/motions.js';
import { TRANSITIONS, ZOOM_CURVES } from '../render/compositor.js';
import { CAPTION_TEMPLATES, ANIMS, REVEALS } from '../data/captionTemplates.js';
import { captionGroups } from '../core/captions.js';
import { clipStart, clipDur } from '../core/timeline.js';
import { player, timeBus } from '../engine/player.js';
import { CaptionStyleEditor } from './CaptionStyle.js';

const OV_ANIMS = [['none', 'Ninguna'], ['fade', 'Fundido'], ['pop', 'Pop'], ['bounce', 'Rebote'], ['soft', 'Suave'], ['lift', 'Subir'], ['drop', 'Caer'], ['focus', 'Enfoque'], ['slideL', 'Desde la izquierda'], ['slideR', 'Desde la derecha'], ['slideUp', 'Desde abajo'], ['zoom', 'Zoom']];

function ClipInspector({ c }) {
  const a = A.assetById(c.assetId);
  const start = clipStart(state.project, c.id);
  const tr = c.transition || { type: 'none', dur: 0 };
  return html`
    <div class="insp-head"><h3 class="insp-title">Clip</h3>
      <div class="row" style="gap:2px">
        <${Btn} cls="icon sm ghost" icon="copy" title="Duplicar" onClick=${() => A.duplicateClip(c.id)} />
        <${Btn} cls="icon sm ghost danger" icon="trash" title="Eliminar (Supr)" onClick=${A.deleteSelection} />
      </div></div>
    <div class="insp-body">
      <div class="dim small" style="margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a?.name} · empieza en ${fmtTime(start, true)} · dura ${fmtDur(clipDur(c))}</div>
      <${Section} title="Inicio y final del plano">
        <div class="grid2">
          <${NumberInput} label="Entrada (s)" value=${c.in.toFixed(2)} step=${0.04} min=${0} onInput=${v => A.trimClip(c.id, 'in', v)} />
          <${NumberInput} label="Salida (s)" value=${c.out.toFixed(2)} step=${0.04} onInput=${v => A.trimClip(c.id, 'out', v)} />
        </div>
        <div class="grid2" style="margin-top:8px">
          <${Btn} cls="sm" icon="trimL" onClick=${() => A.trimPlayhead('in')}>Inicio aquí</${Btn}>
          <${Btn} cls="sm" icon="trimR" onClick=${() => A.trimPlayhead('out')}>Final aquí</${Btn}>
        </div>
      </${Section}>
      <${Section} title="Transición de entrada">
        <div class="stack">
          <${Select} value=${tr.type} options=${TRANSITIONS.map(t => [t.id, t.name])} onChange=${v => A.updateClip(c.id, { transition: v === 'none' ? null : { type: v, dur: TRANSITIONS.find(t => t.id === v).dur } })} />
          ${tr.type !== 'none' && html`<${Slider} label="Duración" value=${tr.dur} min=${0.1} max=${1} step=${0.05} format=${v => v.toFixed(2).replace('.', ',') + ' s'} onInput=${v => A.updateClip(c.id, { transition: { ...tr, dur: v } }, 'trd' + c.id)} />`}
        </div>
      </${Section}>
      <${Section} title="Velocidad">
        <div class="stack">
          <${Seg} small value=${c.speed || 1} onChange=${v => A.updateClip(c.id, { speed: v })} options=${[[0.5, '0,5×'], [0.75, '0,75×'], [1, '1×'], [1.25, '1,25×'], [1.5, '1,5×'], [2, '2×']]} />
          <${Slider} label="Personalizada" value=${c.speed || 1} min=${0.25} max=${3} step=${0.05} format=${v => v.toFixed(2).replace('.', ',') + '×'} onInput=${v => A.updateClip(c.id, { speed: v }, 'sp' + c.id)} />
          <div class="dim small">La voz conserva su tono al exportar.</div>
        </div>
      </${Section}>
      <${Section} title="Encuadre">
        <div class="stack">
          <${Toggle} label="Espejo" sub="Voltear en horizontal" value=${!!c.flipX} onChange=${v => A.updateClip(c.id, { flipX: v })} />
          <${Slider} label="Zoom" value=${c.zoom || 1} min=${1} max=${2.5} step=${0.01} format=${v => Math.round(v * 100) + '%'} onInput=${v => A.updateClip(c.id, { zoom: v }, 'z' + c.id)} />
          <${Slider} label="Horizontal" value=${c.cropX || 0} min=${-1} max=${1} step=${0.01} center format=${v => Math.round(v * 100)} onInput=${v => A.updateClip(c.id, { cropX: v }, 'cx' + c.id)} />
          <${Slider} label="Vertical" value=${c.cropY || 0} min=${-1} max=${1} step=${0.01} center format=${v => Math.round(v * 100)} onInput=${v => A.updateClip(c.id, { cropY: v }, 'cy' + c.id)} />
        </div>
      </${Section}>
      <${Section} title="Audio">
        <${Slider} label="Volumen" value=${c.volume ?? 1} min=${0} max=${1} step=${0.01} format=${v => Math.round(v * 100) + '%'} onInput=${v => A.updateClip(c.id, { volume: v }, 'v' + c.id)} />
      </${Section}>
      <${Section} title="Color">
        <${Btn} cls="sm block" icon="palette" onClick=${() => setUI({ tab: 'color' })}>${c.color ? 'Editar el color de este clip' : 'Usa el color general · cambiar'}</${Btn}>
      </${Section}>
    </div>`;
}

// Mini gráfica de una curva de aceleración
function CurveIcon({ f }) {
  const pts = Array.from({ length: 21 }, (_, i) => { const x = i / 20; return `${(2 + x * 32).toFixed(1)},${(30 - clamp(f(x), -0.15, 1.15) * 26).toFixed(1)}`; }).join(' ');
  return html`<svg viewBox="0 0 36 34" width="36" height="34"><polyline points=${pts} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
}

function Field({ f, o }) {
  const v = o.props[f.k];
  const set = (val) => A.updateOverlay(o.id, { props: { [f.k]: val } }, 'p' + o.id + f.k);
  if (f.hide && f.hide(o.props)) return null;
  if (f.type === 'curve') return html`<div class="field"><span class="field-label">${f.label}</span>
    <div class="curve-grid">${Object.entries(ZOOM_CURVES).map(([k, c]) => html`<button class=${'curve-cell' + ((v || 'suave') === k ? ' on' : '')} title=${c.name} onClick=${() => set(k)}><${CurveIcon} f=${c.f} /><span>${c.name}</span></button>`)}</div></div>`;
  if (f.type === 'text') return html`<${TextInput} label=${f.label} value=${v ?? ''} onInput=${set} />`;
  if (f.type === 'textarea') return html`<${TextInput} label=${f.label} value=${v ?? ''} onInput=${set} multiline />`;
  if (f.type === 'select') return html`<${Select} label=${f.label} value=${v ?? ''} options=${f.options} onChange=${set} />`;
  if (f.type === 'toggle') return html`<${Toggle} label=${f.label} value=${!!v} onChange=${set} />`;
  if (f.type === 'number') return html`<${NumberInput} label=${f.label} value=${v} min=${f.min} max=${f.max} onInput=${set} />`;
  if (f.type === 'range') return html`<${Slider} label=${f.label} value=${v} min=${f.min} max=${f.max} step=${f.step} onInput=${set} />`;
  if (f.type === 'color') return html`<${Swatches} label=${f.label} value=${v} onChange=${set} />`;
  if (f.type === 'icon') return html`<div class="field"><span class="field-label">${f.label}</span>
    <div class="icon-grid">
      ${f.allowNone && html`<button class=${'icon-cell' + (!v ? ' on' : '')} title="Ninguno" onClick=${() => set('')}><${Icon} name="x" /></button>`}
      ${TBS_ICON_OPTIONS.map(([k, name]) => html`<button class=${'icon-cell' + (v === k ? ' on' : '')} title=${name} onClick=${() => set(k)}><${TbsIcon} name=${k} /></button>`)}
    </div></div>`;
  return null;
}

function OverlayInspector({ o }) {
  const M = MOTIONS[o.type];
  if (!M) return null;
  const set = (patch, key) => A.updateOverlay(o.id, patch, key);
  return html`
    <div class="insp-head"><h3 class="insp-title">${M.name}</h3>
      <div class="row" style="gap:2px">
        <${Btn} cls="icon sm ghost" icon="copy" title="Duplicar" onClick=${() => A.duplicateOverlay(o.id)} />
        <${Btn} cls="icon sm ghost danger" icon="trash" title="Eliminar (Supr)" onClick=${A.deleteSelection} />
      </div></div>
    <div class="insp-body">
      <${Section} title="Contenido"><div class="stack">${(M.fields || []).map(f => html`<${Field} key=${f.k} f=${f} o=${o} />`)}</div></${Section}>
      <${Section} title="Tiempo">
        <div class="grid2">
          <${NumberInput} label="Empieza (s)" value=${o.start.toFixed(2)} step=${0.1} min=${0} onInput=${v => set({ start: Math.max(0, v) }, 'st' + o.id)} />
          <${NumberInput} label="Dura (s)" value=${Math.min(o.dur, 9999).toFixed(2)} step=${0.1} min=${0.2} onInput=${v => set({ dur: Math.max(0.2, v) }, 'du' + o.id)} />
        </div>
        <div class="grid2" style="margin-top:8px">
          <${Btn} cls="sm" onClick=${() => set({ start: timeBus.t })}>Empezar en el cursor</${Btn}>
          <${Btn} cls="sm" onClick=${() => set({ dur: Math.max(0.2, timeBus.t - o.start) })}>Acabar en el cursor</${Btn}>
        </div>
      </${Section}>
      ${!M.full && !M.camera && html`<${Section} title="Posición">
        <div class="stack">
          <div class="grid3">
            <${Btn} cls="sm" onClick=${() => set({ x: 0.5, y: 0.25 })}>Arriba</${Btn}>
            <${Btn} cls="sm" onClick=${() => set({ x: 0.5, y: 0.5 })}>Centro</${Btn}>
            <${Btn} cls="sm" onClick=${() => set({ x: 0.5, y: 0.72 })}>Abajo</${Btn}>
          </div>
          <${Slider} label="Tamaño" value=${o.scale || 1} min=${0.2} max=${3} step=${0.01} format=${v => Math.round(v * 100) + '%'} onInput=${v => set({ scale: v }, 'sc' + o.id)} />
          <${Slider} label="Giro" value=${o.rot || 0} min=${-Math.PI} max=${Math.PI} step=${0.01} center format=${v => Math.round(v * 180 / Math.PI) + '°'} onInput=${v => set({ rot: v }, 'ro' + o.id)} />
          <div class="dim small">Arrástralo directamente en el reproductor. El imán lo centra y lo pega a los márgenes seguros.</div>
        </div>
      </${Section}>`}
      ${!M.camera && html`<${Toggle} label="Detrás de la persona" sub="Efecto sándwich: la persona tapa este elemento" value=${!!o.behind} onChange=${v => set({ behind: v })} />`}
      ${M.camera && html`<${Section} title=${o.props.mode === 'dinamico' ? 'Marcos del zoom' : 'Centro del zoom'}><div class="dim small">${o.props.mode === 'dinamico'
        ? 'En el reproductor verás el marco Inicio (blanco) y el Final (rojo): arrástralos y cambia su tamaño desde las esquinas. La cámara va de uno a otro con la curva elegida.'
        : o.props.follow ? 'El zoom se centra en la cara y la sigue mientras habla.' : 'Arrastra el recuadro en la vista previa para elegir hacia dónde se acerca la cámara.'}</div></${Section}>`}
      ${!M.camera && !(M.full && M.animIn === 'none') && html`<${Section} title="Animación">
        <div class="grid2">
          <${Select} label="Entrada" value=${o.animIn ?? M.animIn} options=${OV_ANIMS} onChange=${v => set({ animIn: v })} />
          <${Select} label="Salida" value=${o.animOut ?? M.animOut} options=${OV_ANIMS} onChange=${v => set({ animOut: v })} />
        </div>
      </${Section}>`}
      <${Section} title="Capa">
        <div class="grid2">
          <${Btn} cls="sm" onClick=${() => A.overlayZ(o.id, 1)}>Traer delante</${Btn}>
          <${Btn} cls="sm" onClick=${() => A.overlayZ(o.id, -1)}>Enviar detrás</${Btn}>
        </div>
      </${Section}>
    </div>`;
}

function GroupInspector({ gid }) {
  const p = state.project;
  const g = captionGroups(p, projectVersion).find(x => x.id === gid);
  if (!g) return html`<div class="insp-body dim" style="padding-top:16px">Bloque no encontrado.</div>`;
  const ov = g.ov || {};
  const set = (patch) => A.setGroupStyle(g.id, patch);
  return html`
    <div class="insp-head"><h3 class="insp-title">Bloque de subtítulos</h3>
      <${Btn} cls="sm ghost" onClick=${() => A.setGroupStyle(g.id, { template: null, anim: null, reveal: null, posY: null, size: null, color: null, hlColor: null, behind: null, hidden: null, upper: null })}>Restablecer</${Btn}></div>
    <div class="insp-body">
      <div class="note" style="margin-bottom:6px">“${g.text}”<br/><span class="dim small">${fmtTime(g.start, true)} → ${fmtTime(g.end, true)} · los cambios afectan solo a este bloque</span></div>
      <${Section} title="Estilo">
        <div class="stack">
          <${Select} label="Plantilla" value=${ov.template || ''} options=${[['', 'Igual que el resto'], ...CAPTION_TEMPLATES.map(t => [t.id, t.name])]} onChange=${v => set({ template: v || null })} />
          <div class="grid2">
            <${Select} label="Animación" value=${ov.anim || ''} options=${[['', 'Igual'], ...ANIMS.map(a => [a.id, a.name])]} onChange=${v => set({ anim: v || null })} />
            <${Select} label="Aparición" value=${ov.reveal || ''} options=${[['', 'Igual'], ...REVEALS.map(a => [a.id, a.name])]} onChange=${v => set({ reveal: v || null })} />
          </div>
          <${Slider} label="Tamaño" value=${ov.size || 1} min=${0.5} max=${2} step=${0.01} format=${v => Math.round(v * 100) + '%'} onInput=${v => set({ size: v })} />
          <${Swatches} label="Color" allowNone value=${ov.color || null} onChange=${v => set({ color: v })} />
          <${Swatches} label="Color destacado" allowNone value=${ov.hlColor || null} onChange=${v => set({ hlColor: v })} />
        </div>
      </${Section}>
      <${Section} title="Posición">
        <div class="stack">
          <${Toggle} label="Posición propia" value=${ov.posY !== undefined} onChange=${v => set({ posY: v ? p.captions.posY : null })} />
          ${ov.posY !== undefined && html`<${Slider} label="Altura" value=${ov.posY} min=${0.1} max=${0.9} step=${0.005} format=${v => Math.round(v * 100) + '%'} onInput=${v => set({ posY: v })} />`}
          <${Toggle} label="Detrás de la persona" value=${ov.behind ?? p.captions.behind} onChange=${v => set({ behind: v })} />
          <${Toggle} label="Ocultar este bloque" value=${!!ov.hidden} onChange=${v => set({ hidden: v || null })} />
        </div>
      </${Section}>
    </div>`;
}

function Help() {
  const p = state.project;
  const keys = [['Espacio', 'Reproducir / pausa'], ['S', 'Cortar en el cursor'], ['Q / W', 'Recortar inicio / final'], ['Supr', 'Eliminar selección'], ['← →', 'Fotograma a fotograma'], ['Mayús + ← →', 'Saltar 1 segundo'], ['Ctrl + Z / Y', 'Deshacer / rehacer'], ['Ctrl + rueda', 'Zoom de la línea de tiempo']];
  return html`
    <div class="insp-empty">
      <div class="ie-icon"><${Icon} name="move" /></div>
      <h3>Propiedades</h3>
      <p>Selecciona un <b>clip</b>, una <b>motion</b> o un <b>subtítulo</b> en el reproductor o en la línea de tiempo para editarlo aquí.</p>
    </div>
    <div class="insp-body">
      <${Section} collapsible open=${false} icon="settings" title="Atajos de teclado">
        <div class="stack" style="gap:6px">${keys.map(([k, d]) => html`<div class="row small"><span class="kbd" style="min-width:86px;text-align:center">${k}</span><span class="muted">${d}</span></div>`)}</div>
      </${Section}>
    </div>`;
}

export function Inspector() {
  const p = state.project, sel = state.ui.sel;
  if (sel?.type === 'clip') { const c = p.clips.find(x => x.id === sel.id); if (c) return html`<${ClipInspector} c=${c} />`; }
  if (sel?.type === 'overlay') { const o = p.overlays.find(x => x.id === sel.id); if (o) return html`<${OverlayInspector} o=${o} />`; }
  if (sel?.type === 'group' || (state.ui.tab === 'captions' && Object.keys(p.transcripts).length)) return html`<${CaptionStyleEditor} key=${sel?.id || 'all'} />`;
  return html`<${Help} />`;
}
