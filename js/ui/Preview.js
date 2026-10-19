import { html, useRef, useEffect, useState, useLayoutEffect, fmtTime, clamp } from '../lib.js';
import { state, setUI, update, emit } from '../core/store.js';
import { player, timeBus } from '../engine/player.js';
import { safeRect, SAFE_ZONES, FORMATS } from '../data/brand.js';
import { Icon } from './icons.js';
import { Btn } from './controls.js';
import * as A from '../core/actions.js';
import { MOTIONS } from '../render/motions.js';

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
  const W = p.format.w, H = p.format.h;
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

function SelectionBox({ rect, scale, label, onDrag, onScale, onRotate, rot }) {
  if (!rect) return null;
  const w = rect.w * scale, h = rect.h * scale;
  const style = `left:${rect.x * scale - w / 2}px;top:${rect.y * scale - h / 2}px;width:${w}px;height:${h}px;transform:rotate(${rot || 0}rad)`;
  const drag = (kind) => (e) => {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    const box = e.currentTarget.closest('.preview-wrap').getBoundingClientRect();
    const cx = box.left + rect.x * scale, cy = box.top + rect.y * scale;
    const move = (ev) => {
      if (kind === 'move') onDrag((ev.clientX - sx) / scale, (ev.clientY - sy) / scale, ev);
      if (kind === 'scale') {
        const d0 = Math.hypot(sx - cx, sy - cy), d1 = Math.hypot(ev.clientX - cx, ev.clientY - cy);
        onScale && onScale(d1 / Math.max(1, d0));
      }
      if (kind === 'rot') onRotate && onRotate(Math.atan2(ev.clientY - cy, ev.clientX - cx) + Math.PI / 2);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); onDrag(null); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  return html`<div class="sel-box" style=${style} onPointerDown=${drag('move')}>
    ${label && html`<span class="sel-name">${label}</span>`}
    ${onScale && html`<span class="h br" onPointerDown=${drag('scale')}></span><span class="h tl" onPointerDown=${drag('scale')}></span>`}
    ${onRotate && html`<span class="h rot" onPointerDown=${drag('rot')}></span>`}
  </div>`;
}

export function Preview() {
  const p = state.project, ui = state.ui;
  const areaRef = useRef(), canvasRef = useRef();
  const [box, setBox] = useState({ w: 270, h: 480 });
  const [info, setInfo] = useState(null);
  const dragStart = useRef(null);

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
    player.onInfo = (i) => setInfo(i ? { ...i, cw: c.width } : null);
    player.requestRender();
    return () => { player.onInfo = null; };
  }, [box.w, box.h, p.format.id, !!p.clips.length]);

  const scale = box.w / (canvasRef.current?.width || p.format.w);
  const fscale = box.w / p.format.w; // escala desde px del formato
  const sel = ui.sel;

  // Selección
  let selRect = null, selLabel = null, onDrag = null, onScale = null, onRotate = null, rot = 0;
  if (info && sel?.type === 'overlay') {
    const r = info.ovs.find(o => o.id === sel.id);
    const ov = p.overlays.find(o => o.id === sel.id);
    if (r && ov && !r.full) {
      selRect = r; rot = r.rot; selLabel = MOTIONS[ov.type]?.name;
      onDrag = (dx, dy, ev) => {
        if (dx === null) { dragStart.current = null; return; }
        if (!dragStart.current) dragStart.current = { x: ov.x, y: ov.y };
        const cw = canvasRef.current.width, ch = canvasRef.current.height;
        let nx = dragStart.current.x + dx / cw, ny = dragStart.current.y + dy / ch;
        if (!ev.altKey) { if (Math.abs(nx - 0.5) < 0.015) nx = 0.5; }
        A.updateOverlay(ov.id, { x: clamp(nx, -0.2, 1.2), y: clamp(ny, -0.2, 1.2) }, 'drag' + ov.id);
      };
      onScale = (k) => {
        if (!dragStart.current) dragStart.current = { s: ov.scale || 1 };
        A.updateOverlay(ov.id, { scale: clamp((dragStart.current.s ?? ov.scale) * k, 0.2, 5) }, 'scale' + ov.id);
      };
      onRotate = (a) => {
        const snap = Math.abs(a) < 0.06 ? 0 : a;
        A.updateOverlay(ov.id, { rot: snap }, 'rot' + ov.id);
      };
    }
  } else if (info?.cap && (sel?.type === 'group' || ui.tab === 'captions')) {
    selRect = { x: info.cap.x + info.cap.w / 2, y: info.cap.y + info.cap.h / 2, w: info.cap.w, h: info.cap.h };
    selLabel = 'Subtítulos';
    const g = info.cap.id;
    onDrag = (dx, dy, ev) => {
      if (dx === null) { dragStart.current = null; return; }
      const fw = A.findWord(g);
      const hasOwn = fw?.w.gs?.posY !== undefined || fw?.w.gs?.posX !== undefined;
      if (!dragStart.current) dragStart.current = { y: hasOwn ? (fw.w.gs.posY ?? p.captions.posY) : p.captions.posY, x: hasOwn ? (fw.w.gs.posX ?? p.captions.posX ?? 0.5) : (p.captions.posX ?? 0.5) };
      const ny = clamp(dragStart.current.y + dy / canvasRef.current.height, 0.05, 0.95);
      let nx = clamp(dragStart.current.x + dx / canvasRef.current.width, 0.05, 0.95);
      if (!ev?.altKey && Math.abs(nx - 0.5) < 0.02) nx = 0.5; // imán al centro
      if (hasOwn) A.setGroupStyle(g, { posY: ny, posX: nx });
      else update(pp => { pp.captions.posY = ny; pp.captions.posX = nx; }, { key: 'capY' });
    };
  }

  const onCanvasDown = (e) => {
    if (!info) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / scale, y = (e.clientY - r.top) / scale;
    const hit = [...info.ovs].reverse().find(o => !o.full && Math.abs(x - o.x) < o.w / 2 && Math.abs(y - o.y) < o.h / 2);
    if (hit) { setUI({ sel: { type: 'overlay', id: hit.id } }); return; }
    if (info.cap && x > info.cap.x && x < info.cap.x + info.cap.w && y > info.cap.y && y < info.cap.y + info.cap.h) { setUI({ sel: { type: 'group', id: info.cap.id } }); return; }
    if (sel?.type !== 'clip') setUI({ sel: null });
  };

  const empty = !p.clips.length;
  return html`<section class="stage">
    <div class="stage-head">
      <div class="seg fmt-seg">${FORMATS.map(f => html`<button class=${p.format.id === f.id ? 'on' : ''} title=${f.name + ' · ' + f.sub} onClick=${() => update(pp => { pp.format = { ...f }; })}>${f.label}</button>`)}</div>
      <span class="row" style="gap:2px">
        <button class=${'tl-icon' + (ui.compare ? ' on' : '')} title="Comparar con el original (sin color)" onClick=${() => setUI({ compare: !ui.compare })}><${Icon} name="contrast" /></button>
        <button class="tl-icon" title="Capturar fotograma (PNG)" onClick=${() => captureFrame()}><${Icon} name="camera" /></button>
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
        <canvas ref=${canvasRef} onPointerDown=${onCanvasDown}></canvas>
        <div class="preview-ui">
          <${SafeOverlay} p=${p} ui=${ui} scale=${fscale} />
          <${SelectionBox} rect=${selRect} scale=${scale} label=${selLabel} onDrag=${onDrag} onScale=${onScale} onRotate=${onRotate} rot=${rot} />
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
