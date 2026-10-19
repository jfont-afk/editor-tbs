import { html, useState, useRef, useEffect } from '../lib.js';
import { Icon } from './icons.js';
import { PALETTE } from '../data/brand.js';

export function Slider({ label, value, min = 0, max = 1, step = 0.01, onInput, format, center = false, hint }) {
  const pct = ((value - min) / (max - min)) * 100;
  const shown = format ? format(value) : (Math.round(value * 100) / 100).toString().replace('.', ',');
  return html`<label class="field">
    ${label && html`<div class="field-label"><span>${label}${hint ? html` <span class="dim small">${hint}</span>` : ''}</span><span class="val">${shown}</span></div>`}
    <input class=${'range' + (center ? ' center' : '')} type="range" min=${min} max=${max} step=${step} value=${value}
      style=${`--p:${pct}%`} onInput=${e => onInput(parseFloat(e.target.value))}
      onDblClick=${() => center && onInput(0)} />
  </label>`;
}

export function Toggle({ label, sub, value, onChange }) {
  return html`<div class=${'toggle' + (value ? ' on' : '')} onClick=${() => onChange(!value)} role="switch" aria-checked=${!!value}>
    <span class="t-label">${label}${sub && html`<small>${sub}</small>`}</span><span class="switch"></span>
  </div>`;
}

export function Seg({ value, options, onChange, small }) {
  return html`<div class="seg">${options.map(([v, l]) => html`
    <button class=${value === v ? 'on' : ''} onClick=${() => onChange(v)} style=${small ? 'font-size:11px' : ''}>${l}</button>`)}</div>`;
}

export function Select({ value, options, onChange, label }) {
  const sel = html`<select class="select" value=${value} onChange=${e => onChange(e.target.value)}>
    ${options.map(([v, l]) => html`<option value=${v} selected=${v === value}>${l}</option>`)}
  </select>`;
  return label ? html`<label class="field"><span class="field-label">${label}</span>${sel}</label>` : sel;
}

export function TextInput({ value, onInput, label, placeholder, multiline }) {
  const el = multiline
    ? html`<textarea class="textarea" value=${value} placeholder=${placeholder} onInput=${e => onInput(e.target.value)}></textarea>`
    : html`<input class="input" value=${value} placeholder=${placeholder} onInput=${e => onInput(e.target.value)} />`;
  return label ? html`<label class="field"><span class="field-label">${label}</span>${el}</label>` : el;
}

export function NumberInput({ value, onInput, label, min, max, step = 1 }) {
  return html`<label class="field">${label && html`<span class="field-label">${label}</span>`}
    <input class="input" type="number" min=${min} max=${max} step=${step} value=${value} onInput=${e => { const v = parseFloat(e.target.value); if (isFinite(v)) onInput(v); }} />
  </label>`;
}

// Selector de color con la paleta TBS (+ personalizado)
export function Swatches({ value, onChange, allowNone, label }) {
  const isCustom = value && !PALETTE.some(p => p.hex.toLowerCase() === String(value).toLowerCase() || p.id === value);
  const body = html`<div class="swatches">
    ${allowNone && html`<button class=${'swatch' + (!value ? ' on' : '')} title="Plantilla" style="background:repeating-linear-gradient(45deg,#333 0 4px,#222 4px 8px)" onClick=${() => onChange(null)}></button>`}
    ${PALETTE.map(p => html`<button title=${p.name} class=${'swatch' + ((value === p.hex || value === p.id) ? ' on' : '')} style=${`background:${p.hex}`} onClick=${() => onChange(p.hex)}></button>`)}
    <label class=${'swatch custom' + (isCustom ? ' on' : '')} title="Otro color"><input type="color" value=${isCustom ? value : '#ffffff'} onInput=${e => onChange(e.target.value)} /></label>
  </div>`;
  return label ? html`<div class="field"><span class="field-label">${label}</span>${body}</div>` : body;
}

// Sección con título; si es plegable recuerda si estaba abierta
export function Section({ title, hint, children, right, collapsible = false, open: defOpen = true, icon }) {
  const key = 'sec:' + title;
  const [open, setOpen] = useState(() => {
    if (!collapsible) return true;
    try { const v = localStorage.getItem(key); return v === null ? defOpen : v === '1'; } catch { return defOpen; }
  });
  const toggle = () => { const n = !open; setOpen(n); try { localStorage.setItem(key, n ? '1' : '0'); } catch {} };
  return html`<div class=${'section' + (collapsible ? ' collapsible' : '') + (open ? ' open' : '')}>
    ${title && (collapsible
      ? html`<button class="section-title sec-toggle" onClick=${toggle}>
          <span class="row" style="gap:8px">${icon && html`<${Icon} name=${icon} />`}${title}</span>
          <span class="row" style="gap:6px">${hint && html`<span class="hint">${hint}</span>`}<span class="chev"><${Icon} name="chevronDown" /></span></span>
        </button>`
      : html`<div class="section-title"><span>${title}</span>${right || (hint && html`<span class="hint">${hint}</span>`)}</div>`)}
    ${open && html`<div class="section-body">${children}</div>`}
  </div>`;
}

export function Btn({ icon, children, onClick, cls = '', title, disabled, kbd }) {
  return html`<button class=${'btn ' + cls} title=${title} disabled=${disabled} onClick=${onClick}>
    ${icon && html`<${Icon} name=${icon} />`}${children}${kbd && html`<span class="kbd">${kbd}</span>`}
  </button>`;
}

export function Progress({ value }) {
  const indet = value === null || value === undefined;
  return html`<div class=${'progress' + (indet ? ' indet' : '')}><div style=${`width:${Math.round((value || 0) * 100)}%`}></div></div>`;
}

// Canvas que se redibuja con una función (para previsualizaciones de plantillas)
export function DrawCanvas({ w, h, draw, deps = [], cls, style }) {
  const ref = useRef();
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr; c.height = h * dpr;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    draw(ctx, w, h);
  }, deps);
  return html`<canvas ref=${ref} class=${cls} style=${`width:100%;aspect-ratio:${w}/${h};display:block;${style || ''}`}></canvas>`;
}

export function useAnimationFrame(cb, active = true) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (!active) return;
    let id;
    const loop = (t) => { ref.current(t); id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [active]);
}
