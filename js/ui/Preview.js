import { html, useRef, useEffect, useState, useLayoutEffect, fmtTime, clamp } from '../lib.js';
import { state, setUI, update, projectVersion } from '../core/store.js';
import { player, timeBus } from '../engine/player.js';
import { safeRect, SAFE_ZONES, FORMATS } from '../data/brand.js';
import { Icon } from './icons.js';
import { Btn } from './controls.js';
import * as A from '../core/actions.js';
import { MOTIONS } from '../render/motions.js';
import { captionGroups, resolveStyle } from '../core/captions.js';
import { ZOOM_FROM, ZOOM_TO, placedBox } from '../render/compositor.js';

function Timecode() {
  const [t, setT] = useState(timeBus.t);
  useEffect(() => timeBus.sub(setT), []);
  return html`<div class="timecode"><b>${fmtTime(t, true, state.project.fps)}</b></div>`;
}
function Duration() {
  return html`<div class="timecode" style="text-align:right">${fmtTime(player.duration, true, state.project.fps)}</div>`;
}

function SafeOverlay({ p, ui, scale }) {
  if (!ui.showSafe) return null;
  const r = safeRect(p.format, ui.safeZone);
  const z = SAFE_ZONES[ui.safeZone];
  const s = scale;
  const showMock = p.format.id === '9x16' && z;
  return html`
    <div class="safe-zone" style=${`left:${r.x * s}px;top:${r.y * s}px;width:${r.w * s}px;height:${r.h * s}px`}>
      <span class="safe-label">Zona segura · ${z ? z.name : 'margen'}</span>
    </div>
    ${showMock && html`<div class="ui-mock" style=${`right:${18 * s}px;bottom:${(z.bottom - 40) * s}px;display:flex;flex-direction:column;gap:${34 * s}px;align-items:center`}>
      ${[0, 1, 2, 3].map(() => html`<div style=${`width:${74 * s}px;height:${74 * s}px;border-radius:50%;background:rgba(255,255,255,.55)`}></div>`)}
    </div>
    <div class="ui-mock" style=${`left:${40 * s}px;bottom:${150 * s}px;display:flex;flex-direction:column;gap:${14 * s}px`}>
      <div style=${`width:${300 * s}px;height:${26 * s}px;border-radius:6px;background:rgba(255,255,255,.6)`}></div>
      <div style=${`width:${620 * s}px;height:${22 * s}px;border-radius:6px;background:rgba(255,255,255,.4)`}></div>
      <div style=${`width:${480 * s}px;height:${22 * s}px;border-radius:6px;background:rgba(255,255,255,.4)`}></div>
    </div>`}`;
}

// Imán: centra o pega el bloque a los márgenes seguros según su alineación. Todo en px del lienzo.
function snapPos(cx, cy, w, h, W, H, safe, align) {
  const th = Math.max(W, H) * 0.014;
  const xs = [
    { v: W / 2, line: W / 2, pri: align === 'center' ? 0 : 1 },
    { v: safe.x + w / 2, line: safe.x, pri: align === 'left' ? 0 : 1 },
    { v: safe.x + safe.w - w / 2, line: safe.x + safe.w, pri: align === 'right' ? 0 : 1 },
  ];
  const ys = [
    { v: H / 2, line: H / 2, pri: 0 },
    { v: safe.y + h / 2, line: safe.y, pri: 1 },
    { v: safe.y + safe.h - h / 2, line: safe.y + safe.h, pri: 1 },
  ];
  const pick = (val, arr) => {
    let best = null;
    for (const c of arr) {
      const d = Math.abs(val - c.v) + c.pri * th * 0.35;
      if (Math.abs(val - c.v) < th && (!best || d < best.d)) best = { ...c, d };
    }
    return best;
  };
  const bx = pick(cx, xs), by = pick(cy, ys);
  const guides = [];
  if (bx) guides.push({ x: bx.line, safe: bx.line !== W / 2 });
  if (by) guides.push({ y: by.line, safe: by.line !== H / 2 });
  return { x: bx ? bx.v : cx, y: by ? by.v : cy, guides };
}

function SelectionBox({ rect, scale, label, onMoveStart, onScale, onRotate, onEnd, onDblClick, rot }) {
  if (!rect) return null;
  const w = rect.w * scale, h = rect.h * scale;
  const style = `left:${rect.x * scale - w / 2}px;top:${rect.y * scale - h / 2}px;width:${w}px;height:${h}px;transform:rotate(${rot || 0}rad)`;
  const handle = (kind) => (e) => {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    const box = e.currentTarget.closest('.preview-wrap').getBoundingClientRect();
    const cx = box.left + rect.x * scale, cy = box.top + rect.y * scale;
    const move = (ev) => {
      if (kind === 'scale') {
        const d0 = Math.hypot(sx - cx, sy - cy), d1 = Math.hypot(ev.clientX - cx, ev.clientY - cy);
        onScale && onScale(d1 / Math.max(1, d0));
      }
      if (kind === 'rot') onRotate && onRotate(Math.atan2(ev.clientY - cy, ev.clientX - cx) + Math.PI / 2);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); onEnd && onEnd(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  return html`<div class="sel-box" style=${style} onPointerDown=${onMoveStart} onDblClick=${onDblClick}>
    ${label && html`<span class="sel-name">${label}</span>`}
    ${onScale && html`<span class="h br" title="Tamaño" onPointerDown=${handle('scale')}></span><span class="h tl" title="Tamaño" onPointerDown=${handle('scale')}></span>`}
    ${onRotate && html`<span class="h rot" title="Girar" onPointerDown=${handle('rot')}></span>`}
  </div>`;
}

// Editor de texto sobre el propio subtítulo (doble clic): Intro = nueva línea, Ctrl+Intro o clic fuera = guardar, Esc = cancelar.
function CaptionTextEditor({ gid, rect, scale, boxW }) {
  const g = captionGroups(state.project, projectVersion).find(x => x.id === gid);
  const [val, setVal] = useState(g?.editText || '');
  const ref = useRef();
  const done = useRef(false);
  useEffect(() => { const el = ref.current; if (el) { el.focus(); el.select(); } }, []);
  if (!g) return null;
  const close = (save) => {
    if (done.current) return;
    done.current = true;
    if (save && val !== g.editText) A.editBlockText(gid, val);
    setUI({ editCap: null });
  };
  const lines = Math.max(1, val.split('\n').length);
  const w = Math.min(boxW - 16, Math.max(220, (rect ? rect.w * scale : 0) + 40));
  const cx = rect ? rect.x * scale : boxW / 2;
  const left = clamp(cx - w / 2, 8, boxW - w - 8);
  const top = rect ? Math.max(8, rect.y * scale - (lines * 24 + 24) / 2) : 40;
  return html`<div class="cap-editor" style=${`left:${left}px;top:${top}px;width:${w}px`} onPointerDown=${e => e.stopPropagation()}>
    <textarea ref=${ref} rows=${lines} value=${val} spellcheck="false"
      onInput=${e => setVal(e.target.value)}
      onKeyDown=${e => {
        if (e.key === 'Escape') { e.preventDefault(); close(false); }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); close(true); }
      }}
      onBlur=${() => close(true)}></textarea>
    <div class="cap-editor-foot"><span>Intro: nueva línea · Esc: cancelar</span><button class="btn sm primary" onPointerDown=${e => { e.preventDefault(); close(true); }}>Hecho</button></div>
  </div>`;
}

// Zoom dinámico (tipo DaVinci): marco inicial y final sobre el plano completo
function ZoomFrames({ ov, cw, ch, scale }) {
  const P = ov.props;
  const drag = (key, kind) => (e) => {
    e.preventDefault(); e.stopPropagation();
    const f0 = { ...(P[key] || (key === 'from' ? ZOOM_FROM : ZOOM_TO)) };
    const sx = e.clientX, sy = e.clientY;
    const wrap = e.currentTarget.closest('.preview-wrap').getBoundingClientRect();
    const cxp = wrap.left + f0.x * cw * scale, cyp = wrap.top + f0.y * ch * scale;
    const move = (ev) => {
      const f = { ...f0 };
      if (kind === 'move') { f.x = f0.x + (ev.clientX - sx) / (cw * scale); f.y = f0.y + (ev.clientY - sy) / (ch * scale); }
      else { const d0 = Math.hypot(sx - cxp, sy - cyp), d1 = Math.hypot(ev.clientX - cxp, ev.clientY - cyp); f.s = clamp(f0.s * d0 / Math.max(1, d1), 1, 4); }
      const hw = 0.5 / f.s;
      f.x = clamp(f.x, hw, 1 - hw); f.y = clamp(f.y, hw, 1 - hw);
      A.updateOverlay(ov.id, { props: { [key]: f } }, 'zf' + ov.id + key);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  return [['from', 'Inicio', P.from || ZOOM_FROM], ['to', 'Final', P.to || ZOOM_TO]].map(([key, label, f]) => {
    const w = cw / f.s * scale, h = ch / f.s * scale;
    return html`<div key=${key} class=${'zoom-frame ' + key} style=${`left:${f.x * cw * scale - w / 2}px;top:${f.y * ch * scale - h / 2}px;width:${w}px;height:${h}px`}>
      <span class="zf-label" title="Arrastra para mover" onPointerDown=${drag(key, 'move')}>${label} · ${Math.round(f.s * 100)}%</span>
      <span class="zf-move" title="Arrastra para mover" onPointerDown=${drag(key, 'move')}></span>
      <span class="h br" title="Tamaño del encuadre" onPointerDown=${drag(key, 'scale')}></span>
      <span class="h tl" title="Tamaño del encuadre" onPointerDown=${drag(key, 'scale')}></span>
    </div>`;
  });
}

// Doble clic sobre un texto libre o una motion con texto: se escribe directamente encima
function OverlayTextEditor({ ov, rect, scale, boxW }) {
  const ref = useRef();
  const key = 'text' in ov.props ? 'text' : 'title' in ov.props ? 'title' : null;
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  if (!key) return null;
  const val = String(ov.props[key] ?? '');
  const close = () => setUI({ editOv: null });
  const w = Math.min(boxW - 16, Math.max(220, (rect ? rect.w * scale : 0) + 40));
  const left = clamp((rect ? rect.x * scale : boxW / 2) - w / 2, 8, boxW - w - 8);
  const top = rect ? Math.max(8, rect.y * scale - 30) : 40;
  return html`<div class="cap-editor" style=${`left:${left}px;top:${top}px;width:${w}px`} onPointerDown=${e => e.stopPropagation()}>
    <textarea ref=${ref} rows=${Math.max(1, val.split('\n').length)} value=${val} spellcheck="false"
      onInput=${e => A.updateOverlay(ov.id, { props: { [key]: e.target.value } }, 'ovtext' + ov.id)}
      onKeyDown=${e => { if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); close(); } }}
      onBlur=${close}></textarea>
    <div class="cap-editor-foot"><span>Intro: nueva línea · *palabra* = acento</span><button class="btn sm primary" onPointerDown=${e => { e.preventDefault(); close(); }}>Hecho</button></div>
  </div>`;
}

// Clip seleccionado: marco rojo con tiradores (tamaño, giro) y, en modo recorte, bordes que recortan
function ClipBox({ edit, scale, cw, ch, crop, onMoveStart }) {
  const { box: b, vr, clip } = edit;
  const w = Math.abs(b.w) * scale, h = Math.abs(b.h) * scale;
  const style = `left:${b.x * scale - w / 2}px;top:${b.y * scale - h / 2}px;width:${w}px;height:${h}px;transform:rotate(${b.rot}rad)`;
  const drag = (kind) => (e) => {
    e.preventDefault(); e.stopPropagation();
    const wrap = e.currentTarget.closest('.preview-wrap').getBoundingClientRect();
    const cx = wrap.left + b.full.x * scale, cy = wrap.top + b.full.y * scale;
    const sx = e.clientX, sy = e.clientY;
    const tf0 = { x: 0, y: 0, s: 1, r: 0, ...(clip.tf || {}) };
    const c0 = { l: 0, r: 0, t: 0, b: 0, ...(clip.crop || {}) };
    const cos = Math.cos(tf0.r), sin = Math.sin(tf0.r);
    const move = (ev) => {
      if (kind === 'scale') {
        const d0 = Math.hypot(sx - cx, sy - cy), d1 = Math.hypot(ev.clientX - cx, ev.clientY - cy);
        A.updateClip(clip.id, { tf: { ...tf0, s: clamp(tf0.s * d1 / Math.max(1, d0), 0.1, 6) } }, 'ctfs' + clip.id);
      } else if (kind === 'rot') {
        let a = Math.atan2(ev.clientY - cy, ev.clientX - cx) + Math.PI / 2;
        for (const s of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) if (Math.abs(a - s) < 0.05) a = s;
        A.updateClip(clip.id, { tf: { ...tf0, r: a } }, 'ctfr' + clip.id);
      } else {
        // recorte: desplazamiento a lo largo del eje del clip (girado)
        const dx = (ev.clientX - sx) / scale, dy = (ev.clientY - sy) / scale;
        const ax = (dx * cos + dy * sin) / (vr.w * tf0.s), ay = (-dx * sin + dy * cos) / (vr.h * tf0.s);
        const n = { ...c0 };
        const L = vr.flip ? 'r' : 'l', R = vr.flip ? 'l' : 'r';
        if (kind === 'cl') n[L] = clamp(c0[L] + ax, 0, 0.92 - c0[R]);
        if (kind === 'cr') n[R] = clamp(c0[R] - ax, 0, 0.92 - c0[L]);
        if (kind === 'ct') n.t = clamp(c0.t + ay, 0, 0.92 - c0.b);
        if (kind === 'cb') n.b = clamp(c0.b - ay, 0, 0.92 - c0.t);
        A.updateClip(clip.id, { crop: n }, 'ccrop' + clip.id);
      }
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  return html`<div class=${'clip-box' + (crop ? ' crop' : '')} style=${style} onPointerDown=${onMoveStart}>
    <span class="sel-name">${crop ? 'Recortar · arrastra los bordes' : 'Clip · arrastra para mover'}</span>
    ${crop ? html`
      <span class="ce l" onPointerDown=${drag('cl')}></span><span class="ce r" onPointerDown=${drag('cr')}></span>
      <span class="ce t" onPointerDown=${drag('ct')}></span><span class="ce b" onPointerDown=${drag('cb')}></span>`
    : html`
      <span class="h tl" title="Tamaño" onPointerDown=${drag('scale')}></span><span class="h tr" title="Tamaño" onPointerDown=${drag('scale')}></span>
      <span class="h bl" title="Tamaño" onPointerDown=${drag('scale')}></span><span class="h br" title="Tamaño" onPointerDown=${drag('scale')}></span>
      <span class="h rot" title="Girar" onPointerDown=${drag('rot')}></span>`}
  </div>`;
}

// Barra flotante con las acciones del elemento seleccionado
function SelTools({ rect, scale, boxW, boxH, children }) {
  if (!rect) return null;
  const top = rect.y * scale - rect.h * scale / 2;
  const bottom = rect.y * scale + rect.h * scale / 2;
  const above = top > 52;
  const half = Math.min(boxW / 2, 160);
  const style = `left:${clamp(rect.x * scale, half, boxW - half)}px;${above ? `top:${top - 44}px` : `top:${Math.min(boxH - 44, bottom + 12)}px`}`;
  return html`<div class="sel-tools" style=${style} onPointerDown=${e => e.stopPropagation()}>${children}</div>`;
}

export function Preview() {
  const p = state.project, ui = state.ui;
  const areaRef = useRef(), canvasRef = useRef();
  const [box, setBox] = useState({ w: 270, h: 480 });
  const [info, setInfo] = useState(null);
  const [guides, setGuides] = useState([]);
  const [cropMode, setCropMode] = useState(false);
  useEffect(() => { if (ui.sel?.type !== 'clip') setCropMode(false); }, [ui.sel?.id]);
  const scaleStart = useRef(null);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const aw = r.width - 20, ah = r.height - 20;
      const ar = p.format.w / p.format.h;
      let w = aw, h = aw / ar;
      if (h > ah) { h = ah; w = ah * ar; }
      setBox({ w: Math.max(80, Math.floor(w)), h: Math.max(80, Math.floor(h)) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [p.format.id]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const k = Math.min(1, (box.w * dpr) / p.format.w);
    c.width = Math.round(p.format.w * k); c.height = Math.round(p.format.h * k);
    player.attach(c);
    // solo se vuelve a pintar la interfaz del reproductor si cambian las cajas (no en cada fotograma)
    let lastKey = '';
    const r1 = (v) => Math.round(v || 0);
    player.onInfo = (i) => {
      const key = !i ? '' : [i.clipId, i.cap ? [i.cap.id, r1(i.cap.x), r1(i.cap.y), r1(i.cap.w), r1(i.cap.h)].join(',') : '-',
        i.ovs.map(o => [o.id, r1(o.x), r1(o.y), r1(o.w), r1(o.h), Math.round((o.rot || 0) * 100)].join(',')).join(';'),
        i.vrect ? [r1(i.vrect.x), r1(i.vrect.y), r1(i.vrect.w), r1(i.vrect.h), i.vrect.tf ? [r1(i.vrect.tf.cx), r1(i.vrect.tf.cy), Math.round(i.vrect.tf.s * 100), Math.round(i.vrect.tf.r * 100)].join(',') : ''].join(',') : '-', c.width].join('|');
      if (key === lastKey) return;
      lastKey = key;
      setInfo(i ? { ...i, cw: c.width } : null);
    };
    player.requestRender();
    return () => { player.onInfo = null; };
  }, [box.w, box.h, p.format.id, !!p.clips.length]);

  const cw = canvasRef.current?.width || p.format.w, ch = canvasRef.current?.height || p.format.h;
  const scale = box.w / cw;
  const fscale = box.w / p.format.w; // escala desde px del formato
  const sel = ui.sel;
  const groups = captionGroups(p, projectVersion);

  // ¿El arrastre de un subtítulo mueve solo ese bloque?
  const capOwn = (gid) => {
    const g = groups.find(x => x.id === gid);
    return ui.capScope === 'group' || g?.ov?.posX !== undefined || g?.ov?.posY !== undefined;
  };

  // Arrastre directo (selecciona y mueve en el mismo gesto)
  const beginMove = (e, target) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const c = canvasRef.current;
    if (!c || !info) return;
    const W = c.width, H = c.height, k = W / p.format.w;
    const sr = safeRect(p.format, ui.safeZone);
    const safe = { x: sr.x * k, y: sr.y * k, w: sr.w * k, h: sr.h * k };
    let start, apply, align = 'center';
    if (target.type === 'overlay') {
      const ov = p.overlays.find(o => o.id === target.id), r = info.ovs.find(o => o.id === target.id);
      if (!ov) return;
      if (sel?.type !== 'overlay' || sel.id !== ov.id) setUI({ sel: { type: 'overlay', id: ov.id } });
      if (MOTIONS[ov.type]?.full && !MOTIONS[ov.type]?.camera) return;
      start = { x: ov.x, y: ov.y, w: r?.w || 0, h: r?.h || 0 };
      apply = (x, y) => A.updateOverlay(ov.id, { x: clamp(x, -0.2, 1.2), y: clamp(y, -0.2, 1.2) }, 'drag' + ov.id);
    } else {
      const gid = target.id, rc = info.cap;
      if (sel?.type !== 'group' || sel.id !== gid) setUI({ sel: { type: 'group', id: gid } });
      if (!rc) return;
      const g = groups.find(x => x.id === gid);
      align = resolveStyle(p.captions, g?.ov).align || 'center';
      start = { x: (rc.x + rc.w / 2) / W, y: (rc.y + rc.h / 2) / H, w: rc.w, h: rc.h };
      const own = capOwn(gid);
      apply = (x, y) => {
        x = clamp(x, 0.02, 0.98); y = clamp(y, 0.02, 0.98);
        if (own) A.setGroupStyle(gid, { posX: x, posY: y });
        else update(pp => { pp.captions.posX = x; pp.captions.posY = y; pp.captions.posFree = true; }, { key: 'capY' });
      };
    }
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true;
      const cx = start.x * W + (ev.clientX - sx) / scale, cy = start.y * H + (ev.clientY - sy) / scale;
      const s = state.ui.snap && !ev.altKey ? snapPos(cx, cy, start.w, start.h, W, H, safe, align) : { x: cx, y: cy, guides: [] };
      setGuides(s.guides);
      apply(s.x / W, s.y / H);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setGuides([]); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const hitTest = (e) => {
    const r = e.currentTarget.closest('.preview-wrap').getBoundingClientRect();
    const x = (e.clientX - r.left) / scale, y = (e.clientY - r.top) / scale;
    const hit = [...info.ovs].reverse().find(o => !o.full && Math.abs(x - o.x) < o.w / 2 && Math.abs(y - o.y) < o.h / 2);
    if (hit) return { type: 'overlay', id: hit.id };
    const c = info.cap;
    if (c && x > c.x - 8 && x < c.x + c.w + 8 && y > c.y - 8 && y < c.y + c.h + 8) return { type: 'group', id: c.id };
    return null;
  };
  const onCanvasDown = (e) => {
    if (!info) return;
    const hit = hitTest(e);
    if (hit) { beginMove(e, hit); return; }
    // clic en el vídeo: primero se selecciona el clip; si ya lo está, se arrastra
    if (info.clipId) {
      if (sel?.type === 'clip' && sel.id === info.clipId) beginClipMove(e);
      else setUI({ sel: { type: 'clip', id: info.clipId } });
      return;
    }
    setUI({ sel: null });
  };

  // ---- Clip: mover, escalar, girar y recortar en el reproductor ----
  const selClip = sel?.type === 'clip' && info?.clipId === sel.id && info?.vrect ? p.clips.find(c => c.id === sel.id) : null;
  function beginClipMove(e) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const c = p.clips.find(x => x.id === sel.id); if (!c) return;
    const W = cw, H = ch;
    const t0 = { x: c.tf?.x || 0, y: c.tf?.y || 0 };
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true;
      let nx = t0.x + (ev.clientX - sx) / scale / W, ny = t0.y + (ev.clientY - sy) / scale / H;
      const gs = [];
      if (state.ui.snap && !ev.altKey) { if (Math.abs(nx) < 0.012) { nx = 0; gs.push({ x: W / 2 }); } if (Math.abs(ny) < 0.012) { ny = 0; gs.push({ y: H / 2 }); } }
      setGuides(gs);
      A.updateClip(c.id, cc => ({ tf: { x: 0, y: 0, s: 1, r: 0, ...(cc.tf || {}), x: nx, y: ny } }), 'ctfmove' + c.id);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setGuides([]); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }
  const onCanvasDbl = (e) => {
    if (!info) return;
    const hit = hitTest(e);
    if (hit?.type === 'group') { player.pause(); setUI({ sel: hit, editCap: hit.id }); }
    else if (hit?.type === 'overlay') {
      const ov = p.overlays.find(o => o.id === hit.id);
      player.pause();
      if (ov && ('text' in ov.props || 'title' in ov.props)) setUI({ sel: hit, editOv: hit.id });
      else setUI({ sel: hit });
    }
  };

  // Selección actual
  let selRect = null, selLabel = null, onScale = null, onRotate = null, rot = 0, tools = null, moveStart = null, dbl = null, zoomEdit = null, clipEdit = null;
  const end = () => { scaleStart.current = null; };
  const selOv = sel?.type === 'overlay' ? p.overlays.find(o => o.id === sel.id) : null;
  if (selOv?.type === 'zoom' && (selOv.props.mode === 'dinamico' || selOv.props.follow)) {
    // zoom dinámico: marcos inicial/final · zoom que sigue la cara: no hay punto que mover
    const t = timeBus.t, inside = t >= selOv.start && t < selOv.start + selOv.dur;
    if (selOv.props.mode === 'dinamico' && inside) zoomEdit = selOv;
    tools = html`<${SelTools} rect=${{ x: cw / 2, y: ch * 0.06, w: 0, h: 0 }} scale=${scale} boxW=${box.w} boxH=${box.h}>
      ${selOv.props.mode === 'dinamico'
        ? html`<button class="st-btn" title="Intercambiar inicio y final" onClick=${() => A.updateOverlay(selOv.id, { props: { from: selOv.props.to || ZOOM_TO, to: selOv.props.from || ZOOM_FROM } })}><${Icon} name="repeat" /><span>Invertir</span></button>
               ${!inside && html`<button class="st-btn" onClick=${() => player.seek(selOv.start + 0.02)}><${Icon} name="play" /><span>Ir al zoom</span></button>`}`
        : html`<span class="st-note">Sigue la cara</span>`}
      <button class="st-btn danger" title="Eliminar (Supr)" onClick=${A.deleteSelection}><${Icon} name="trash" /></button>
    </${SelTools}>`;
  } else if (info && sel?.type === 'overlay') {
    const r = info.ovs.find(o => o.id === sel.id);
    const ov = selOv;
    const M = ov && MOTIONS[ov.type];
    if (r && ov && !r.full) {
      selRect = r; rot = r.rot; selLabel = M?.name;
      moveStart = (e) => beginMove(e, { type: 'overlay', id: ov.id });
      dbl = () => { player.pause(); if ('text' in ov.props || 'title' in ov.props) setUI({ editOv: ov.id }); };
      onScale = (k) => {
        if (!scaleStart.current) scaleStart.current = { s: ov.scale || 1 };
        A.updateOverlay(ov.id, { scale: clamp(scaleStart.current.s * k, 0.2, 5) }, 'scale' + ov.id);
      };
      onRotate = (a) => {
        const snap = Math.abs(a) < 0.06 ? 0 : a;
        A.updateOverlay(ov.id, { rot: snap }, 'rot' + ov.id);
      };
    }
    if (ov && !M?.camera && (r || M?.full)) {
      tools = html`<${SelTools} rect=${r && !r.full ? r : { x: cw / 2, y: ch * 0.12, w: 0, h: 0 }} scale=${scale} boxW=${box.w} boxH=${box.h}>
        <button class=${'st-btn' + (ov.behind ? ' on' : '')} title="Detrás de la persona (efecto sándwich)" onClick=${() => A.updateOverlay(ov.id, { behind: !ov.behind })}><${Icon} name="userBehind" /><span>Detrás</span></button>
        <button class="st-btn" title="Duplicar" onClick=${() => A.duplicateOverlay(ov.id)}><${Icon} name="copy" /></button>
        <button class="st-btn" title="Traer delante" onClick=${() => A.overlayZ(ov.id, 1)}><${Icon} name="bringFront" /></button>
        <button class="st-btn" title="Enviar detrás" onClick=${() => A.overlayZ(ov.id, -1)}><${Icon} name="sendBack" /></button>
        <button class=${'st-btn' + (ui.snap ? ' on' : '')} title="Imán (centro y márgenes seguros). Alt al arrastrar lo desactiva" onClick=${() => setUI({ snap: !ui.snap })}><${Icon} name="magnet" /></button>
        <button class="st-btn danger" title="Eliminar (Supr)" onClick=${A.deleteSelection}><${Icon} name="trash" /></button>
      </${SelTools}>`;
    }
  } else if (selClip) {
    const c = selClip;
    const bx = placedBox(info.vrect);
    clipEdit = { box: bx, vr: info.vrect, clip: c };
    tools = html`<${SelTools} rect=${{ x: bx.x, y: bx.y, w: Math.abs(bx.w), h: Math.abs(bx.h) }} scale=${scale} boxW=${box.w} boxH=${box.h}>
      <button class=${'st-btn' + (cropMode ? ' on' : '')} title="Recortar el encuadre" onClick=${() => setCropMode(!cropMode)}><${Icon} name="crop" /><span>Recortar</span></button>
      <button class=${'st-btn' + (c.bg?.remove ? ' on' : '')} title="Quitar el fondo (IA): deja solo a la persona" onClick=${() => A.updateClip(c.id, { bg: { fill: 'blur', ...(c.bg || {}), remove: !c.bg?.remove } })}><${Icon} name="userBehind" /><span>Quitar fondo</span></button>
      <button class=${'st-btn' + (c.flipX ? ' on' : '')} title="Espejo" onClick=${() => A.updateClip(c.id, { flipX: !c.flipX })}><${Icon} name="flip" /></button>
      <button class="st-btn" title="Restablecer posición, tamaño, giro y recorte" onClick=${() => { A.updateClip(c.id, { tf: null, crop: null }); setCropMode(false); }}><${Icon} name="reset" /></button>
      <button class=${'st-btn' + (ui.snap ? ' on' : '')} title="Imán al centro" onClick=${() => setUI({ snap: !ui.snap })}><${Icon} name="magnet" /></button>
    </${SelTools}>`;
  } else if (info?.cap && (sel?.type === 'group' || ui.tab === 'captions')) {
    const gid = info.cap.id;
    const g = groups.find(x => x.id === gid);
    const own = capOwn(gid);
    selRect = { x: info.cap.x + info.cap.w / 2, y: info.cap.y + info.cap.h / 2, w: info.cap.w, h: info.cap.h };
    selLabel = own ? 'Este bloque' : 'Subtítulos';
    moveStart = (e) => beginMove(e, { type: 'group', id: gid });
    dbl = () => { player.pause(); setUI({ sel: { type: 'group', id: gid }, editCap: gid }); };
    onScale = (k) => {
      if (!scaleStart.current) scaleStart.current = { s: own ? (g?.ov?.size || 1) : (p.captions.size || 1) };
      const v = clamp(scaleStart.current.s * k, 0.3, 3);
      if (own) A.setGroupStyle(gid, { size: v });
      else update(pp => { pp.captions.size = v; }, { key: 'capsize' });
    };
    if (sel?.type === 'group' && ui.editCap !== gid) {
      const st = resolveStyle(p.captions, g?.ov);
      const sizeBy = (f) => {
        if (own) A.setGroupStyle(gid, { size: clamp((g?.ov?.size || 1) * f, 0.3, 3) });
        else update(pp => { pp.captions.size = clamp((pp.captions.size || 1) * f, 0.3, 3); }, { key: 'capsize' });
      };
      tools = html`<${SelTools} rect=${selRect} scale=${scale} boxW=${box.w} boxH=${box.h}>
        <div class="st-seg" title="Qué se mueve y se edita">
          <button class=${!own ? 'on' : ''} onClick=${() => { setUI({ capScope: 'all' }); if (g?.ov?.posX !== undefined || g?.ov?.posY !== undefined) A.setGroupStyle(gid, { posX: null, posY: null }); }}>Todos</button>
          <button class=${own ? 'on' : ''} onClick=${() => setUI({ capScope: 'group' })}>Este</button>
        </div>
        <button class="st-btn" title="Editar el texto (doble clic)" onClick=${dbl}><${Icon} name="pencil" /></button>
        <button class="st-btn" title="Más pequeño" onClick=${() => sizeBy(1 / 1.1)}><${Icon} name="minus" /></button>
        <button class="st-btn" title="Más grande" onClick=${() => sizeBy(1.1)}><${Icon} name="plus" /></button>
        <button class=${'st-btn' + (st.behind ? ' on' : '')} title="Detrás de la persona" onClick=${() => own ? A.setGroupStyle(gid, { behind: !st.behind }) : update(pp => { pp.captions.behind = !pp.captions.behind; })}><${Icon} name="userBehind" /></button>
        <button class=${'st-btn' + (ui.snap ? ' on' : '')} title="Imán (centro y márgenes seguros según la alineación). Alt al arrastrar lo desactiva" onClick=${() => setUI({ snap: !ui.snap })}><${Icon} name="magnet" /></button>
      </${SelTools}>`;
    }
  }

  const editOv = ui.editOv && sel?.type === 'overlay' && sel.id === ui.editOv ? p.overlays.find(o => o.id === ui.editOv) : null;
  const editing = (ui.editCap && groups.some(x => x.id === ui.editCap)) || !!editOv;
  const capRectFor = (gid) => (info?.cap?.id === gid ? { x: info.cap.x + info.cap.w / 2, y: info.cap.y + info.cap.h / 2, w: info.cap.w, h: info.cap.h } : null);

  const empty = !p.clips.length;
  return html`<section class="stage">
    <div class="stage-head">
      <div class="seg fmt-seg">${FORMATS.map(f => html`<button class=${p.format.id === f.id ? 'on' : ''} title=${f.name + ' · ' + f.sub} onClick=${() => update(pp => { pp.format = { ...f }; })}>${f.label}</button>`)}</div>
      <span class="row" style="gap:2px">
        <button class=${'tl-icon' + (ui.compare ? ' on' : '')} title="Comparar con el original (sin color)" onClick=${() => setUI({ compare: !ui.compare })}><${Icon} name="contrast" /></button>
        <button class="tl-icon" title="Capturar fotograma (PNG)" onClick=${() => captureFrame()}><${Icon} name="camera" /></button>
        <button class=${'tl-icon' + (ui.snap ? ' on' : '')} title="Imán al mover (centro y márgenes seguros)" onClick=${() => setUI({ snap: !ui.snap })}><${Icon} name="magnet" /></button>
        <button class=${'tl-icon' + (ui.showSafe ? ' on' : '')} title="Mostrar zonas seguras" onClick=${() => setUI({ showSafe: !ui.showSafe })}><${Icon} name="shield" /></button>
        <select class="select mini" title="Zona segura de la red social" value=${ui.safeZone} onChange=${e => setUI({ safeZone: e.target.value })}>
          ${Object.entries(SAFE_ZONES).map(([k, z]) => html`<option value=${k} selected=${k === ui.safeZone}>${z.name}</option>`)}
        </select>
      </span>
    </div>
    <div class="stage-area" ref=${areaRef}>
      ${empty ? html`<${EmptyStage} />` : html`
      <div class="preview-wrap" style=${`width:${box.w}px;height:${box.h}px`}>
        ${ui.compare && html`<div class="compare-badge">Original</div>`}
        <canvas ref=${canvasRef} onPointerDown=${onCanvasDown} onDblClick=${onCanvasDbl}></canvas>
        <div class="preview-ui">
          <${SafeOverlay} p=${p} ui=${ui} scale=${fscale} />
          ${guides.map(gd => gd.x !== undefined
            ? html`<div class=${'snap-guide v' + (gd.safe ? ' safe' : '')} style=${`left:${gd.x * scale}px`}></div>`
            : html`<div class=${'snap-guide h' + (gd.safe ? ' safe' : '')} style=${`top:${gd.y * scale}px`}></div>`)}
          ${zoomEdit && html`<${ZoomFrames} ov=${zoomEdit} cw=${cw} ch=${ch} scale=${scale} />`}
          ${clipEdit && html`<${ClipBox} edit=${clipEdit} scale=${scale} cw=${cw} ch=${ch} crop=${cropMode} onMoveStart=${beginClipMove} />`}
          ${!editing && html`<${SelectionBox} rect=${selRect} scale=${scale} label=${tools ? null : selLabel} onMoveStart=${moveStart} onScale=${onScale} onRotate=${onRotate} onEnd=${end} onDblClick=${dbl} rot=${rot} />`}
          ${!editing && tools}
          ${editing && !editOv && html`<${CaptionTextEditor} key=${ui.editCap} gid=${ui.editCap} rect=${capRectFor(ui.editCap)} scale=${scale} boxW=${box.w} />`}
          ${editOv && html`<${OverlayTextEditor} key=${editOv.id} ov=${editOv} rect=${info?.ovs.find(o => o.id === editOv.id)} scale=${scale} boxW=${box.w} />`}
        </div>
      </div>`}
    </div>
    ${!empty && html`<div class="transport">
      <div class="tp-left"><${Timecode} /></div>
      <div class="tp-center">
        <${Btn} cls="icon ghost" icon="stepBack" title="Fotograma anterior (←)" onClick=${() => player.seek(timeBus.t - 1 / p.fps)} />
        <button class="play-btn" title="Reproducir (Espacio)" onClick=${() => player.toggle()}><${Icon} name=${ui.playing ? 'pause' : 'play'} /></button>
        <${Btn} cls="icon ghost" icon="stepFwd" title="Fotograma siguiente (→)" onClick=${() => player.seek(timeBus.t + 1 / p.fps)} />
      </div>
      <div class="tp-right"><${Duration} /></div>
    </div>`}
  </section>`;
}

export async function captureFrame() {
  const c = await player.capture(true);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const name = `${state.project.name.replace(/[^\w\- ]+/g, '')}_${fmtTime(timeBus.t).replace(':', 'm')}s.png`;
  const { downloadBlob } = await import('../lib.js');
  const { toast } = await import('../core/store.js');
  const PF = await import('../core/projectFolder.js');
  if (PF.folderActive() && await PF.saveToFolder('Miniaturas', name, blob)) { toast('Captura guardada en la carpeta del proyecto › Miniaturas'); return; }
  downloadBlob(blob, name);
  toast('Captura guardada en Descargas');
}

function EmptyStage() {
  const [over, setOver] = useState(false);
  return html`<div class="empty-stage">
    <span class="tag">Editor TBS · Redes sociales</span>
    <h2>Arrastra tu vídeo y <em>empieza</em> a editar</h2>
    <p class="muted">Cortes, silencios, color, subtítulos con estilo TBS, motions y miniaturas. Todo se procesa en tu ordenador.</p>
    <div class=${'dropzone' + (over ? ' over' : '')} style="width:100%"
      onDragOver=${e => { e.preventDefault(); setOver(true); }} onDragLeave=${() => setOver(false)}
      onDrop=${e => { e.preventDefault(); setOver(false); window.__dropFiles(e); }}>
      <${Icon} name="upload" />
      <h3>Suelta aquí tus vídeos</h3>
      <span class="muted small">MP4, MOV o WEBM · también fotos</span>
      <button class="btn fluor lg" onClick=${() => window.__openFiles()}><${Icon} name="folder" />Elegir archivos</button>
    </div>
  </div>`;
}
