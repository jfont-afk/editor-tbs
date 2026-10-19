import { html, useState, useEffect } from '../../lib.js';
import { state, update, setUI, toast, defaultColor } from '../../core/store.js';
import { Btn, Section, Slider, Seg } from '../controls.js';
import { COLOR_PRESETS, COLOR_SLIDERS, ColorGL, colorValues, autoColor } from '../../render/color.js';
import { player, timeBus } from '../../engine/player.js';
import { clipAt } from '../../core/timeline.js';

let gl = null;
function presetThumbs(src) {
  if (!src) return {};
  gl = gl || new ColorGL();
  const el = src.el;
  const sw = el.videoWidth || el.naturalWidth, sh = el.videoHeight || el.naturalHeight;
  if (!sw) return {};
  const out = {};
  const tw = 120, th = Math.round(120 * 1.25);
  for (const pr of COLOR_PRESETS) {
    const v = colorValues({ ...defaultColor(), preset: pr.id });
    const c = document.createElement('canvas'); c.width = tw; c.height = th;
    const x = c.getContext('2d');
    const frame = gl.render(el, sw, sh, v, 0, 480) || el;
    const s = Math.max(tw / sw, th / sh);
    x.drawImage(frame, (tw - sw * s) / 2, (th - sh * s) / 2, sw * s, sh * s);
    out[pr.id] = c.toDataURL('image/jpeg', 0.8);
  }
  return out;
}

export function ColorPanel() {
  const p = state.project, ui = state.ui;
  const selClip = ui.sel?.type === 'clip' ? p.clips.find(c => c.id === ui.sel.id) : null;
  const [scope, setScope] = useState(selClip?.color ? 'clip' : 'all');
  const [thumbs, setThumbs] = useState({});
  const target = scope === 'clip' ? (selClip || clipAt(p, timeBus.t)?.clip) : null;
  const col = scope === 'clip' ? (target?.color || p.color) : p.color;

  const refresh = () => setThumbs(presetThumbs(player.frameSource(timeBus.t)));
  useEffect(() => { const id = setTimeout(refresh, 250); return () => clearTimeout(id); }, [p.clips.length]);

  const write = (fn, key) => update(pp => {
    if (scope === 'clip' && target) {
      const c = pp.clips.find(x => x.id === target.id);
      c.color = { ...(c.color || structuredClone(pp.color)) };
      fn(c.color);
    } else fn(pp.color);
  }, { key });

  return html`
    <div class="panel-head">
      <h2 class="panel-title">Color</h2>
      <p class="panel-desc">Looks y ajustes para todo el vídeo o un clip.</p>
    </div>
    <div class="panel-body">
      <${Section} title="Aplicar a">
        <${Seg} value=${scope} onChange=${setScope} options=${[['all', 'Todo el vídeo'], ['clip', 'Clip actual']]} />
        ${scope === 'clip' && target && html`<div class="row" style="margin-top:8px">
          <span class="dim small grow">${target.color ? 'Este clip tiene su propio color' : 'Usa el color general'}</span>
          ${target.color && html`<${Btn} cls="sm ghost" onClick=${() => update(pp => { pp.clips.find(c => c.id === target.id).color = null; })}>Usar el general</${Btn}>`}
        </div>`}
      </${Section}>
      <${Section} title="Looks" right=${html`<button class="chip" onClick=${refresh}>Actualizar miniaturas</button>`}>
        <div class="cards three">
          ${COLOR_PRESETS.map(pr => html`<button class=${'card' + (col.preset === pr.id ? ' on' : '')} onClick=${() => write(c => { c.preset = pr.id; })}>
            ${thumbs[pr.id] ? html`<img src=${thumbs[pr.id]} style="aspect-ratio:4/5;object-fit:cover" />` : html`<div style="aspect-ratio:4/5;background:#222"></div>`}
            <div class="card-label" style="font-size:11px">${pr.name}${pr.ref && html`<small>${pr.ref}</small>`}</div>
          </button>`)}
        </div>
      </${Section}>
      <${Section} title="Ajustes" right=${html`<span class="row" style="gap:4px">
        <button class="chip" onClick=${() => { const s = player.frameSource(timeBus.t); if (!s) return; const a = autoColor(s.el); write(c => Object.assign(c, a)); toast('Ajuste automático aplicado'); }}>Auto</button>
        <button class="chip" onClick=${() => write(c => Object.assign(c, defaultColor()))}>Restablecer</button></span>`}>
        <div class="stack">
          ${COLOR_SLIDERS.map(s => html`<${Slider} key=${s.k} label=${s.name} value=${col[s.k] || 0} min=${s.min} max=${s.max} step=${s.step} center=${s.min < 0}
            format=${v => (v > 0 && s.min < 0 ? '+' : '') + Math.round(v * 100)} onInput=${v => write(c => { c[s.k] = v; }, 'col' + s.k + scope)} />`)}
          <${Btn} cls=${ui.compare ? 'on' : ''} icon="contrast" onClick=${() => setUI({ compare: !ui.compare })}>${ui.compare ? 'Viendo el original' : 'Comparar con el original'}</${Btn}>
          ${scope === 'all' && p.clips.some(c => c.color) && html`<${Btn} cls="sm ghost" onClick=${() => update(pp => pp.clips.forEach(c => { c.color = null; }))}>Quitar el color propio de todos los clips</${Btn}>`}
        </div>
      </${Section}>
    </div>`;
}
