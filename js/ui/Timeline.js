import { html, useRef, useEffect, useState, useMemo, clamp, fmtTime } from '../lib.js';
import { state, setUI, update, runtime, projectVersion, undo, redo, canUndo, canRedo } from '../core/store.js';
import { layoutClips, totalDuration, clipDur } from '../core/timeline.js';
import { captionGroups } from '../core/captions.js';
import { player, timeBus } from '../engine/player.js';
import { PEAKS_PER_SEC, thumbAt } from '../media/assets.js';
import { MOTIONS } from '../render/motions.js';
import { Icon } from './icons.js';
import { Btn } from './controls.js';
import * as A from '../core/actions.js';

const HEAD = 104; // = ancho de .tl-head en css/app.css
const H = { ruler: 26, ov: 26, cap: 34, video: 92 };

function Ruler({ width, pps, dur }) {
  const ref = useRef();
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.min(32000, width * dpr)); c.height = H.ruler * dpr;
    c.style.width = width + 'px';
    const x = c.getContext('2d'); x.scale(dpr, dpr);
    x.clearRect(0, 0, width, H.ruler);
    const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120];
    const major = steps.find(s => s * pps >= 70) || 120;
    const minor = major / 5;
    x.font = '500 10px "Geist Mono", monospace'; x.textBaseline = 'top';
    for (let t = 0; t <= dur + major; t += minor) {
      const px = Math.round(t * pps) + 0.5;
      const isMaj = Math.abs(t / major - Math.round(t / major)) < 1e-6;
      x.fillStyle = isMaj ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)';
      x.fillRect(px, isMaj ? 14 : 19, 1, isMaj ? 12 : 7);
      if (isMaj) { x.fillStyle = 'rgba(255,255,255,0.55)'; x.fillText(fmtTime(t), px + 4, 4); }
    }
  }, [width, pps, dur]);
  return html`<canvas ref=${ref}></canvas>`;
}

function ClipCanvas({ clip, asset, w, pps }) {
  const ref = useRef();
  const rt = runtime.assets.get(clip.assetId);
  const nThumbs = rt?.thumbs?.length || 0, hasAudio = !!rt?.audio;
  useEffect(() => {
    const c = ref.current; if (!c || !asset) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(1, Math.min(8000, Math.round(w)));
    const ch = H.video - 10;
    c.width = cw * dpr; c.height = ch * dpr;
    const x = c.getContext('2d'); x.scale(dpr, dpr);
    x.fillStyle = '#1b1b20'; x.fillRect(0, 0, cw, ch);
    const k = cw / w; // por si se ha limitado el ancho
    // Tira de fotogramas
    const thH = ch;
    const first = rt?.thumbs?.[0]?.bmp;
    if (first) {
      const tw = Math.max(24, thH * first.width / first.height);
      for (let px = 0; px < cw; px += tw) {
        const srcT = clip.in + ((px + tw / 2) / k) / pps * (clip.speed || 1);
        const bmp = thumbAt(clip.assetId, srcT);
        if (bmp) x.drawImage(bmp, px, 0, tw, thH);
      }
      x.fillStyle = 'rgba(10,10,12,0.35)'; x.fillRect(0, 0, cw, ch);
    }
    // Forma de onda
    const peaks = rt?.audio?.peaks;
    if (peaks) {
      const base = ch - 3, amp = ch * 0.42;
      x.fillStyle = 'rgba(255,255,255,0.6)';
      for (let px = 0; px < cw; px++) {
        const s0 = clip.in + (px / k) / pps * (clip.speed || 1), s1 = clip.in + ((px + 1) / k) / pps * (clip.speed || 1);
        const a = Math.floor(s0 * PEAKS_PER_SEC), b = Math.max(a + 1, Math.floor(s1 * PEAKS_PER_SEC));
        let m = 0; for (let i = a; i < b; i++) if (peaks[i] > m) m = peaks[i];
        const hgt = Math.min(1, Math.pow(m, 0.7)) * amp;
        x.fillRect(px, base - hgt, 1, hgt);
      }
    }
  }, [w, pps, clip.in, clip.out, clip.speed, nThumbs, hasAudio]);
  return html`<canvas ref=${ref}></canvas>`;
}

function lanes(overlays) {
  const sorted = [...overlays].sort((a, b) => a.start - b.start);
  const ends = [];
  const map = new Map();
  for (const o of sorted) {
    let l = ends.findIndex(e => e <= o.start + 1e-3);
    if (l < 0) { l = ends.length; ends.push(0); }
    ends[l] = o.start + o.dur;
    map.set(o.id, l);
  }
  return { map, count: Math.max(1, ends.length) };
}

export function Timeline() {
  const p = state.project, ui = state.ui;
  const scrollRef = useRef(), phRef = useRef();
  const pps = ui.pxPerSec;
  const dur = totalDuration(p);
  const lay = layoutClips(p.clips);
  const width = Math.max(600, (dur + 6) * pps);
  const groups = captionGroups(p, projectVersion);
  const L = lanes(p.overlays);
  const [drop, setDrop] = useState(null);

  // Cabezal sin re-render
  useEffect(() => timeBus.sub((t) => {
    if (phRef.current) phRef.current.style.left = (HEAD + t * state.ui.pxPerSec) + 'px';
    const sc = scrollRef.current;
    if (sc && state.ui.playing) {
      const x = HEAD + t * state.ui.pxPerSec;
      if (x > sc.scrollLeft + sc.clientWidth - 60) sc.scrollLeft = x - HEAD - 40;
    }
  }), []);
  useEffect(() => { if (phRef.current) phRef.current.style.left = (HEAD + timeBus.t * pps) + 'px'; });

  const seekFromEvent = (e) => {
    const sc = scrollRef.current;
    const r = sc.getBoundingClientRect();
    const x = e.clientX - r.left + sc.scrollLeft - HEAD;
    player.seek(clamp(x / pps, 0, dur));
  };
  const scrub = (e) => {
    if (e.button !== 0) return;
    if (state.ui.playing) player.pause();
    seekFromEvent(e);
    const mv = (ev) => seekFromEvent(ev);
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };

  const fit = () => {
    const sc = scrollRef.current; if (!sc || !dur) return;
    setUI({ pxPerSec: clamp((sc.clientWidth - HEAD - 40) / dur, 4, 400) });
  };

  // Arrastrar clip (reordenar) o recortar bordes
  const clipDown = (e, l, mode) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setUI({ sel: { type: 'clip', id: l.clip.id } });
    const sx = e.clientX;
    const c0 = { in: l.clip.in, out: l.clip.out };
    let moved = false;
    const mv = (ev) => {
      const dx = ev.clientX - sx;
      if (Math.abs(dx) > 4) moved = true;
      if (!moved) return;
      const sp = l.clip.speed || 1;
      if (mode === 'l') A.trimClip(l.clip.id, 'in', c0.in + dx / pps * sp);
      else if (mode === 'r') A.trimClip(l.clip.id, 'out', c0.out + dx / pps * sp);
      else {
        const sc = scrollRef.current, r = sc.getBoundingClientRect();
        const x = (ev.clientX - r.left + sc.scrollLeft - HEAD) / pps;
        let idx = lay.findIndex(o => x < o.start + o.dur / 2);
        if (idx < 0) idx = lay.length;
        setDrop(idx);
      }
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      if (mode === 'body') {
        if (moved) {
          const sc = scrollRef.current, r = sc.getBoundingClientRect();
          const x = (ev.clientX - r.left + sc.scrollLeft - HEAD) / pps;
          let idx = lay.findIndex(o => x < o.start + o.dur / 2);
          if (idx < 0) idx = lay.length;
          if (idx > l.index) idx--;
          if (idx !== l.index) A.moveClip(l.clip.id, idx);
        } else player.seek((ev.clientX - scrollRef.current.getBoundingClientRect().left + scrollRef.current.scrollLeft - HEAD) / pps);
        setDrop(null);
      } else if (moved) player.seek(mode === 'l' ? l.start : Math.max(l.start, l.start + clipDur(state.project.clips.find(c => c.id === l.clip.id) || l.clip) - 0.04));
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };

  const ovDown = (e, o, mode) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setUI({ sel: { type: 'overlay', id: o.id } });
    const sx = e.clientX, s0 = o.start, d0 = o.dur;
    const snaps = [0, timeBus.t, ...lay.map(l => l.start), dur];
    const snap = (v) => { for (const s of snaps) if (Math.abs(s - v) * pps < 7) return s; return v; };
    const mv = (ev) => {
      const dt = (ev.clientX - sx) / pps;
      if (mode === 'body') A.updateOverlay(o.id, { start: Math.max(0, snap(s0 + dt)) }, 'ovm' + o.id);
      else if (mode === 'l') { const ns = clamp(snap(s0 + dt), 0, s0 + d0 - 0.2); A.updateOverlay(o.id, { start: ns, dur: s0 + d0 - ns }, 'ovl' + o.id); }
      else A.updateOverlay(o.id, { dur: Math.max(0.2, snap(s0 + d0 + dt) - s0) }, 'ovr' + o.id);
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };

  const sel = ui.sel;
  const ovH = Math.max(H.ov + 8, L.count * (H.ov - 2) + 10);

  return html`<section class="timeline">
    <div class="tl-toolbar">
      <button class="tl-icon" title="Deshacer (Ctrl+Z)" disabled=${!canUndo()} onClick=${undo}><${Icon} name="undo" /></button>
      <button class="tl-icon" title="Rehacer (Ctrl+Y)" disabled=${!canRedo()} onClick=${redo}><${Icon} name="redo" /></button>
      <span class="top-sep" style="height:18px;margin:0 4px"></span>
      <button class="tl-icon" title="Cortar en el cursor (S)" onClick=${A.splitAtPlayhead}><${Icon} name="scissors" /></button>
      <button class="tl-icon" title="Recortar inicio hasta el cursor (Q)" onClick=${() => A.trimPlayhead('in')}><${Icon} name="trimL" /></button>
      <button class="tl-icon" title="Recortar final desde el cursor (W)" onClick=${() => A.trimPlayhead('out')}><${Icon} name="trimR" /></button>
      <button class="tl-icon" title="Eliminar selección (Supr)" disabled=${!sel} onClick=${A.deleteSelection}><${Icon} name="trash" /></button>
      ${sel?.type === 'clip' && html`<button class="tl-icon" title="Duplicar clip" onClick=${() => A.duplicateClip(sel.id)}><${Icon} name="copy" /></button>`}
      <div class="top-spacer"></div>
      <span class="dim small tl-count" style="font-family:var(--font-mono);margin-right:6px;white-space:nowrap">${p.clips.length} ${p.clips.length === 1 ? 'clip' : 'clips'} · ${fmtTime(dur)}</span>
      <button class=${'tl-icon' + (p.autoZoom ? ' on' : '')} title="Zoom alterno en los cortes" onClick=${() => update(pp => { pp.autoZoom = !pp.autoZoom; })}><${Icon} name="magnet" /></button>
      <button class="tl-icon" title="Alejar" onClick=${() => setUI({ pxPerSec: clamp(pps / 1.4, 4, 400) })}><${Icon} name="zoomOut" /></button>
      <input class="range tl-zoom" type="range" min="4" max="400" step="1" value=${pps} style=${`--p:${(pps - 4) / 396 * 100}%`} onInput=${e => setUI({ pxPerSec: +e.target.value })} />
      <button class="tl-icon" title="Acercar" onClick=${() => setUI({ pxPerSec: clamp(pps * 1.4, 4, 400) })}><${Icon} name="zoomIn" /></button>
      <button class="tl-icon" title="Ajustar a la ventana" onClick=${fit}><${Icon} name="frame" /></button>
    </div>
    <div class="tl-scroll" ref=${scrollRef} onWheel=${e => { if (e.ctrlKey) { e.preventDefault(); setUI({ pxPerSec: clamp(pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 4, 400) }); } }}>
      <div class="tl-inner" style=${`width:${HEAD + width}px`}>
        <div class="tl-row ruler" style=${`height:${H.ruler}px`}>
          <div class="tl-head corner"></div>
          <div class="tl-lane tl-ruler" style=${`width:${width}px`} onPointerDown=${scrub}><${Ruler} width=${width} pps=${pps} dur=${dur} /></div>
        </div>
        <div class="tl-row" style=${`height:${ovH}px`}>
          <div class="tl-head"><${Icon} name="sparkles" />Motions
            <span class="hicons"><button class=${'hicon' + (p.overlaysHidden ? ' off' : '')} title=${p.overlaysHidden ? 'Mostrar motions' : 'Ocultar motions'} onClick=${() => update(pp => { pp.overlaysHidden = !pp.overlaysHidden; })}><${Icon} name=${p.overlaysHidden ? 'eyeOff' : 'eye'} /></button></span></div>
          <div class="tl-lane" style=${`width:${width}px`} onPointerDown=${scrub}>
            ${p.overlays.map(o => {
              const M = MOTIONS[o.type];
              const l = L.map.get(o.id) || 0;
              const w = Math.max(10, Math.min(o.dur, Math.max(dur, 1) - o.start) * pps);
              return html`<div class=${'tl-ov' + (sel?.id === o.id ? ' sel' : '')} style=${`left:${o.start * pps}px;width:${w}px;top:${5 + l * (H.ov - 2)}px`} onPointerDown=${e => ovDown(e, o, 'body')} title=${M?.name}>
                <span class="tl-handle l" onPointerDown=${e => ovDown(e, o, 'l')}></span>
                ${M?.name || o.type}${o.behind ? ' · detrás' : ''}
                <span class="tl-handle r" onPointerDown=${e => ovDown(e, o, 'r')}></span>
              </div>`;
            })}
          </div>
        </div>
        <div class="tl-row" style=${`height:${H.cap}px`}>
          <div class="tl-head"><${Icon} name="captions" />Subtítulos
            <span class="hicons"><button class=${'hicon' + (!p.captions.enabled ? ' off' : '')} title=${p.captions.enabled ? 'Ocultar subtítulos' : 'Mostrar subtítulos'} onClick=${() => update(pp => { pp.captions.enabled = !pp.captions.enabled; })}><${Icon} name=${p.captions.enabled ? 'eye' : 'eyeOff'} /></button></span></div>
          <div class="tl-lane" style=${`width:${width}px`} onPointerDown=${scrub}>
            ${p.captions.enabled && groups.map(g => html`<div class=${'tl-cap' + (sel?.id === g.id ? ' sel' : '') + ((g.ov?.behind ?? p.captions.behind) ? ' behind' : '')} style=${`left:${g.start * pps}px;width:${Math.max(4, (g.end - g.start) * pps - 2)}px;${g.ov?.hidden ? 'opacity:.35' : ''}`}
              onPointerDown=${e => { e.stopPropagation(); setUI({ sel: { type: 'group', id: g.id }, tab: 'captions' }); player.seek(g.start + 0.01); }} title=${g.text}>${g.text}</div>`)}
          </div>
        </div>
        <div class="tl-row" style=${`height:${H.video}px`}>
          <div class="tl-head" style="flex-direction:column;align-items:flex-start;justify-content:center;gap:4px">
            <span class="row" style="gap:6px;width:100%"><${Icon} name="film" />Vídeo
              <span class="hicons"><button class=${'hicon' + (p.muted ? ' off' : '')} title=${p.muted ? 'Activar audio' : 'Silenciar pista'} onClick=${() => update(pp => { pp.muted = !pp.muted; })}><${Icon} name=${p.muted ? 'mute' : 'volume'} /></button></span></span>
            <button class="cover-btn" style="margin-left:0;height:40px;width:68px" title="Crear la portada / miniatura" onClick=${() => setUI({ tab: 'thumb' })}><${Icon} name="image" />Portada</button>
          </div>
          <div class="tl-lane" style=${`width:${width}px`} onPointerDown=${scrub}>
            ${lay.map(l => {
              const a = p.assets.find(x => x.id === l.clip.assetId);
              const w = Math.max(6, l.dur * pps);
              return html`<div key=${l.clip.id} class=${'tl-clip' + (sel?.id === l.clip.id ? ' sel' : '')} style=${`left:${l.start * pps}px;width:${w - 1}px`} onPointerDown=${e => clipDown(e, l, 'body')}>
                <${ClipCanvas} clip=${l.clip} asset=${a} w=${w - 1} pps=${pps} />
                ${w > 60 && html`<span class="name">${a?.name || ''}${runtime.assets.get(l.clip.assetId)?.status === 'analyzing' ? ' · analizando…' : ''}</span>`}
                ${l.clip.transition && l.clip.transition.type !== 'none' && html`<span class="trans" title="Transición"><${Icon} name="zap" /></span>`}
                <span class="tl-handle l" onPointerDown=${e => clipDown(e, l, 'l')}></span>
                <span class="tl-handle r" onPointerDown=${e => clipDown(e, l, 'r')}></span>
              </div>`;
            })}
            ${drop !== null && html`<div style=${`position:absolute;top:2px;bottom:2px;width:3px;border-radius:3px;background:var(--white);left:${(drop < lay.length ? lay[drop].start : dur) * pps - 1}px;z-index:5`}></div>`}
            ${(ui.silencePreview || []).map(r => html`<div class="tl-sil" style=${`left:${r.start * pps}px;width:${Math.max(2, (r.end - r.start) * pps)}px`}></div>`)}
            ${!p.clips.length && html`<div class="tl-empty" style="inset:0">Importa un vídeo para empezar</div>`}
          </div>
        </div>
        <div class="tl-playhead" ref=${phRef} style=${`left:${HEAD + timeBus.t * pps}px`}></div>
      </div>
    </div>
  </section>`;
}
