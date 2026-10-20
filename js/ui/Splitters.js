import { html, useState, useLayoutEffect, clamp } from '../lib.js';
import { emit } from '../core/store.js';

// Tamaños de la interfaz elegidos por el usuario (como en CapCut o Premiere). Se guardan en el navegador.
const KEY = 'tbs-layout-v1';
function load() {
  try { return { playerW: {}, propsW: null, tlH: null, wideTl: false, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { playerW: {}, propsW: null, tlH: null, wideTl: false }; }
}
export const layout = load();
export function saveLayout() { try { localStorage.setItem(KEY, JSON.stringify(layout)); } catch {} emit(); }
export function resetLayout() { layout.playerW = {}; layout.propsW = null; layout.tlH = null; saveLayout(); }
export function setWideTimeline(v) { layout.wideTl = v; saveLayout(); }

// Estilo en línea del contenedor (las variables CSS que mueven la rejilla)
export function layoutStyle(fmt) {
  const s = [];
  const pk = fmt + (layout.wideTl ? '-w' : '');
  if (layout.playerW[pk]) s.push(`--player-w:${layout.playerW[pk]}px`);
  if (layout.propsW) s.push(`--props-w:${layout.propsW}px`);
  if (layout.tlH) s.push(`--tl-h:${layout.tlH}px`);
  return s.join(';');
}

const MIN = { player: 240, props: 240, panel: 260, tl: 110, main: 200 };

// Divisores arrastrables entre el panel, las propiedades, el reproductor y la línea de tiempo
export function Splitters({ fmt, showInsp }) {
  const [R, setR] = useState(null);
  const [tip, setTip] = useState(null);
  useLayoutEffect(() => {
    const app = document.querySelector('.app');
    if (!app) return;
    const measure = () => {
      if (window.innerWidth <= 760) { setR(null); return; }
      const a = app.getBoundingClientRect();
      const r = (sel) => {
        const e = app.querySelector(sel);
        if (!e || !e.offsetWidth) return null;
        const b = e.getBoundingClientRect();
        return { l: b.left - a.left, t: b.top - a.top, r: b.right - a.left, b: b.bottom - a.top, w: b.width, h: b.height };
      };
      setR({ W: a.width, H: a.height, panel: r(':scope > .panel'), insp: r(':scope > .insp'), stage: r(':scope > .stage'), tl: r(':scope > .timeline') });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(app);
    for (const el of app.children) ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [fmt, showInsp, layout.wideTl]);
  if (!R || !R.panel || !R.stage || !R.tl) return null;

  const app = () => document.querySelector('.app');
  const drag = (kind) => (e) => {
    e.preventDefault();
    const el = app();
    const sx = e.clientX, sy = e.clientY;
    const rail = R.panel.l - 6;
    const st = R.stage.w, pw = R.insp && showInsp ? R.insp.w : 0, th = R.tl.h;
    document.body.classList.add('resizing', kind === 'tl' ? 'row' : 'col');
    e.currentTarget.classList.add('drag');
    const target = e.currentTarget;
    let val = null;
    const move = (ev) => {
      if (kind === 'player') {
        const max = R.W - rail - pw - MIN.panel - 30;
        val = Math.round(clamp(st + (sx - ev.clientX), MIN.player, max));
        el.style.setProperty('--player-w', val + 'px');
        setTip({ x: ev.clientX, y: ev.clientY, t: `Reproductor ${val} px` });
      } else if (kind === 'props') {
        const max = R.W - rail - st - MIN.panel - 30;
        val = Math.round(clamp(pw + (sx - ev.clientX), MIN.props, Math.min(720, max)));
        el.style.setProperty('--props-w', val + 'px');
        setTip({ x: ev.clientX, y: ev.clientY, t: `Propiedades ${val} px` });
      } else {
        const max = R.H - 52 - MIN.main - 20;
        val = Math.round(clamp(th + (sy - ev.clientY), MIN.tl, max));
        el.style.setProperty('--tl-h', val + 'px');
        setTip({ x: ev.clientX, y: ev.clientY, t: `Línea de tiempo ${val} px` });
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing', 'row', 'col');
      target.classList.remove('drag');
      setTip(null);
      if (val !== null) {
        if (kind === 'player') layout.playerW = { ...layout.playerW, [fmt + (layout.wideTl ? '-w' : '')]: val };
        else if (kind === 'props') layout.propsW = val;
        else layout.tlH = val;
        saveLayout();
      }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  // doble clic = tamaño por defecto
  const reset = (kind) => () => {
    if (kind === 'player') { const p = { ...layout.playerW }; delete p[fmt + (layout.wideTl ? '-w' : '')]; layout.playerW = p; app().style.removeProperty('--player-w'); }
    else if (kind === 'props') { layout.propsW = null; app().style.removeProperty('--props-w'); }
    else { layout.tlH = null; app().style.removeProperty('--tl-h'); }
    saveLayout();
  };

  // posiciones: en el hueco entre zonas
  const leftOfStage = layout.wideTl ? (showInsp && R.insp ? R.insp.r : R.panel.r) : (showInsp && R.insp ? R.insp.r : R.panel.r);
  const vPlayer = { x: (leftOfStage + R.stage.l) / 2, t: R.stage.t, h: R.stage.h };
  const vProps = showInsp && R.insp ? { x: (R.panel.r + R.insp.l) / 2, t: R.insp.t, h: R.insp.h } : null;
  const hTl = { y: (R.panel.b + R.tl.t) / 2, l: R.tl.l, w: layout.wideTl ? R.tl.w : (showInsp && R.insp ? R.insp.r : R.panel.r) - R.tl.l };
  const title = 'Arrastra para cambiar el tamaño · doble clic: tamaño por defecto';
  return html`
    <div class="splitter v" title=${title} style=${`left:${vPlayer.x}px;top:${vPlayer.t}px;height:${vPlayer.h}px`} onPointerDown=${drag('player')} onDblClick=${reset('player')}></div>
    ${vProps && html`<div class="splitter v" title=${title} style=${`left:${vProps.x}px;top:${vProps.t}px;height:${vProps.h}px`} onPointerDown=${drag('props')} onDblClick=${reset('props')}></div>`}
    <div class="splitter h" title=${title} style=${`top:${hTl.y}px;left:${hTl.l}px;width:${hTl.w}px`} onPointerDown=${drag('tl')} onDblClick=${reset('tl')}></div>
    ${tip && html`<div class="splitter-tip" style=${`position:fixed;left:${tip.x}px;top:${tip.y}px`}>${tip.t}</div>`}`;
}
