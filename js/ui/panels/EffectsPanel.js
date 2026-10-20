import { html, useState, uid } from '../../lib.js';
import { state, update, setUI, toast } from '../../core/store.js';
import { Btn, Section, Slider, Seg, Toggle } from '../controls.js';
import { Icon } from '../icons.js';
import { COLOR_SLIDERS } from '../../render/color.js';
import { ZOOM_FROM, ZOOM_TO } from '../../render/compositor.js';
import { clipAt } from '../../core/timeline.js';
import { player, timeBus } from '../../engine/player.js';
import * as A from '../../core/actions.js';

// Zooms de cámara listos para usar (se añaden en el cursor)
const ZOOMS = [
  { id: 'rapido', name: 'Zoom rápido', sub: 'Entra de golpe y se queda', icon: 'zoomIn', dur: 1.6, props: { mode: 'in', amount: 1.3, speed: 'rapido', curve: 'frena' } },
  { id: 'lento', name: 'Zoom lento', sub: 'Acercamiento continuo', icon: 'zoomIn', dur: 4, props: { mode: 'in', amount: 1.15, speed: 'lento', curve: 'lineal' } },
  { id: 'dentro', name: 'Hacia dentro', sub: 'Suave, en 1 segundo', icon: 'zoomIn', dur: 2.5, props: { mode: 'in', amount: 1.3, speed: 'normal', curve: 'suave' } },
  { id: 'fuera', name: 'Hacia fuera', sub: 'Empieza cerca y se abre', icon: 'zoomOut', dur: 2.5, props: { mode: 'out', amount: 1.35, speed: 'normal', curve: 'suave' } },
  { id: 'golpe', name: 'Golpe', sub: 'Punch-in para remarcar', icon: 'zap', dur: 1.2, props: { mode: 'golpe', amount: 1.22, speed: 'rapido', curve: 'rapido' } },
  { id: 'respira', name: 'Respiración', sub: 'Entra y vuelve', icon: 'repeat', dur: 3, props: { mode: 'respira', amount: 1.12, speed: 'lento', curve: 'suave' } },
  { id: 'dinamico', name: 'Zoom dinámico', sub: 'Marco inicial → final, como DaVinci', icon: 'frame', dur: 3, props: { mode: 'dinamico', speed: 'lento', curve: 'suave' } },
];

export function EffectsPanel() {
  const p = state.project, ui = state.ui;
  const selClip = ui.sel?.type === 'clip' ? p.clips.find(c => c.id === ui.sel.id) : null;
  const [scope, setScope] = useState(selClip?.color ? 'clip' : 'all');
  const [follow, setFollow] = useState(true);
  const target = scope === 'clip' ? (selClip || clipAt(p, timeBus.t)?.clip) : null;
  const col = scope === 'clip' ? (target?.color || p.color) : p.color;
  const write = (fn, key) => update(pp => {
    if (scope === 'clip' && target) {
      const c = pp.clips.find(x => x.id === target.id);
      c.color = { ...(c.color || structuredClone(pp.color)) };
      fn(c.color);
    } else fn(pp.color);
  }, { key });
  const fx = COLOR_SLIDERS.filter(s => s.fx);
  const zooms = p.overlays.filter(o => o.type === 'zoom').sort((a, b) => a.start - b.start);

  const addZoom = async (z) => {
    if (!p.clips.length) return;
    const total = player.duration || 10;
    const t = Math.min(timeBus.t, Math.max(0, total - 0.5));
    const props = { ...z.props, follow: z.props.mode !== 'dinamico' && follow };
    if (z.props.mode === 'dinamico') { props.from = { ...ZOOM_FROM }; props.to = { ...ZOOM_TO }; }
    const o = { id: uid('o'), type: 'zoom', start: t, dur: Math.min(z.dur, Math.max(0.5, total - t)), x: 0.5, y: 0.42, scale: 1, rot: 0, props, animIn: 'none', animOut: 'none', behind: false };
    update(pp => pp.overlays.push(o));
    setUI({ sel: { type: 'overlay', id: o.id } });
    if (props.follow && !p.assets.every(a => a.kind !== 'video' || p.faceTracks?.[a.id])) {
      try { await A.ensureFaceTracks(); } catch (e) { console.error(e); toast('No se pudo analizar la cara', 'err'); }
    }
    if (z.props.mode === 'dinamico') toast('Mueve y redimensiona los marcos Inicio y Final en el reproductor', 'ok', 5000);
    player.seek(t + 0.05);
  };

  return html`
    <div class="panel-head">
      <h2 class="panel-title">Efectos</h2>
      <p class="panel-desc">Zooms de cámara y acabado de la imagen.</p>
    </div>
    <div class="panel-body">
      <${Section} title="Zoom de cámara" hint="se añade en el cursor">
        <div class="stack">
          <${Toggle} label="Encuadrar hacia la cara" sub="El zoom se acerca a la cabeza y la sigue (IA)" value=${follow} onChange=${setFollow} />
          <div class="zoom-grid">
            ${ZOOMS.map(z => html`<button class="zoom-card" disabled=${!p.clips.length} onClick=${() => addZoom(z)} title=${'Añadir ' + z.name}>
              <span class="zc-ico"><${Icon} name=${z.icon} /></span>
              <span class="zc-txt"><b>${z.name}</b><small>${z.sub}</small></span>
            </button>`)}
          </div>
          ${zooms.length > 0 && html`<div class="zoom-list">
            ${zooms.map(o => html`<button class=${'zl-row' + (ui.sel?.id === o.id ? ' on' : '')} onClick=${() => { setUI({ sel: { type: 'overlay', id: o.id } }); player.seek(o.start + 0.02); }}>
              <span>${(ZOOMS.find(z => z.props.mode === o.props.mode && (o.props.mode !== 'in' || z.props.speed === o.props.speed)) || ZOOMS[2]).name}</span>
              <span class="dim">${o.start.toFixed(1).replace('.', ',')} s · ${o.dur.toFixed(1).replace('.', ',')} s${o.props.follow ? ' · cara' : ''}</span>
            </button>`)}
          </div>`}
          <div class="dim small">Selecciónalo para cambiar la cantidad, la velocidad y la curva de aceleración a la derecha. Su duración se ajusta en la línea de tiempo.</div>
        </div>
      </${Section}>
      <${Section} title="Imagen">
        <div class="stack">
          <${Seg} small value=${scope} onChange=${setScope} options=${[['all', 'Todo el vídeo'], ['clip', 'Clip actual']]} />
          ${fx.map(s => html`<${Slider} key=${s.k} label=${s.name} value=${col[s.k] || 0} min=${s.min} max=${s.max} step=${s.step}
            format=${v => Math.round(v * 100)} onInput=${v => write(c => { c[s.k] = v; }, 'fx' + s.k + scope)} />`)}
          <${Btn} cls="sm ghost" onClick=${() => write(c => { for (const s of fx) c[s.k] = 0; })}>Quitar efectos de imagen</${Btn}>
        </div>
      </${Section}>
    </div>`;
}
