import { state, runtime, emit, projectVersion, onProjectChange, subscribe } from '../core/store.js';
import { imageHooks } from '../render/motions.js';
import { clipAt, layoutClips, totalDuration } from '../core/timeline.js';
import { captionGroups } from '../core/captions.js';
import { Compositor } from '../render/compositor.js';
import { clamp } from '../lib.js';

// Canal ligero de tiempo (evita re-renderizar toda la interfaz 60 veces por segundo)
const timeSubs = new Set();
export const timeBus = {
  t: 0,
  sub(fn) { timeSubs.add(fn); return () => timeSubs.delete(fn); },
  set(t) { this.t = t; timeSubs.forEach(f => f(t)); },
};

const hidden = document.createElement('div');
hidden.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none';
document.body.appendChild(hidden);

function makeVideo(url) {
  const v = document.createElement('video');
  v.src = url; v.preload = 'auto'; v.playsInline = true; v.crossOrigin = 'anonymous';
  hidden.appendChild(v);
  return v;
}

class Player {
  constructor() {
    this.comp = new Compositor();
    this.canvas = null; this.ctx = null;
    this.dirty = true;
    this.cur = null;        // { clipId, el }
    this.prep = null;       // { clipId, el, ready }
    this.seeking = false; this.pendingSeek = null;
    this.clockBase = 0; this.clockT = 0;
    this.info = null;
    this.onInfo = null;
    this.muted = false;
    onProjectChange(() => { this.comp.invalidate(); this.dirty = true; });
    // al cambiar la selección se vuelve a dibujar (p. ej. marcos del zoom dinámico)
    subscribe(() => { if (state.ui.sel !== this._lastSel) { this._lastSel = state.ui.sel; this.dirty = true; } });
    imageHooks.onLoad = () => { this.dirty = true; };
    const loop = () => { this.tick(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  attach(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.dirty = true;
  }

  els(assetId) {
    const rt = runtime.assets.get(assetId);
    if (!rt) return null;
    if (!rt.videos) {
      if (rt.kind === 'image') {
        const img = new Image(); img.src = rt.url; rt.videos = [img, img];
      } else rt.videos = [makeVideo(rt.url), makeVideo(rt.url)];
    }
    return rt.videos;
  }

  isVideo(el) { return el instanceof HTMLVideoElement; }

  // Elemento para un clip, distinto del que se está usando ahora
  pick(clip, avoid) {
    const v = this.els(clip.assetId);
    if (!v) return null;
    return v[0] === avoid ? v[1] : v[0];
  }

  get duration() { return totalDuration(state.project); }

  requestRender() { this.dirty = true; }

  seek(t) {
    const p = state.project;
    t = clamp(t, 0, Math.max(0, this.duration - 1 / 60));
    timeBus.set(t);
    state.ui.time = t;
    const hit = clipAt(p, t);
    if (!hit) { this.cur = null; this.dirty = true; emit(); return; }
    let el = this.cur && this.cur.clipId === hit.clip.id ? this.cur.el : (this.cur && this.cur.el && runtime.assets.get(hit.clip.assetId)?.videos?.includes(this.cur.el) ? this.cur.el : this.pick(hit.clip, null));
    if (!el) return;
    this.cur = { clipId: hit.clip.id, el };
    if (this.isVideo(el)) {
      if (state.ui.playing) {
        el.currentTime = hit.src;
        this.clockBase = performance.now(); this.clockT = t;
      } else this.queueSeek(el, hit.src);
    } else this.dirty = true;
    this.prep = null;
    emit();
  }

  queueSeek(el, src) {
    if (this.seeking) { this.pendingSeek = { el, src }; return; }
    if (Math.abs(el.currentTime - src) < 0.004 && el.readyState >= 2) { this.dirty = true; return; }
    this.seeking = true;
    const done = () => {
      this.seeking = false; this.dirty = true;
      if (this.pendingSeek) { const ps = this.pendingSeek; this.pendingSeek = null; this.queueSeek(ps.el, ps.src); }
    };
    el.addEventListener('seeked', done, { once: true });
    el.currentTime = src;
    setTimeout(() => { if (this.seeking) done(); }, 700);
  }

  play() {
    const p = state.project;
    if (!p.clips.length) return;
    if (timeBus.t >= this.duration - 0.05) this.seek(0);
    state.ui.playing = true;
    const hit = clipAt(p, timeBus.t);
    if (!hit) return;
    this.cur = { clipId: hit.clip.id, el: (this.cur?.clipId === hit.clip.id && this.cur.el) || this.pick(hit.clip, null) };
    const el = this.cur.el;
    if (this.isVideo(el)) {
      if (Math.abs(el.currentTime - hit.src) > 0.05) el.currentTime = hit.src;
      this.applyAudio(el, hit.clip);
      el.play().catch(() => {});
    }
    this.clockBase = performance.now(); this.clockT = timeBus.t;
    this.prepareNext(hit);
    emit();
  }

  pause() {
    state.ui.playing = false;
    if (this.cur?.el && this.isVideo(this.cur.el)) this.cur.el.pause();
    if (this.prep?.el && this.isVideo(this.prep.el)) this.prep.el.pause();
    state.ui.time = timeBus.t;
    this.dirty = true;
    emit();
  }

  toggle() { state.ui.playing ? this.pause() : this.play(); }

  applyAudio(el, clip) {
    el.volume = clamp(clip.volume ?? 1, 0, 1);
    el.muted = this.muted || state.project.muted || (clip.volume ?? 1) <= 0.001;
    el.playbackRate = clip.speed || 1;
  }

  prepareNext(hit) {
    const p = state.project;
    const next = p.clips[hit.index + 1];
    if (!next) { this.prep = null; return; }
    const el = this.pick(next, this.cur?.el);
    if (!el) return;
    const prep = { clipId: next.id, el, ready: !this.isVideo(el) };
    this.prep = prep;
    if (this.isVideo(el)) {
      el.pause();
      const ok = () => { prep.ready = true; };
      el.addEventListener('seeked', ok, { once: true });
      el.currentTime = next.in;
    }
  }

  tick() {
    const p = state.project;
    if (state.ui.playing) {
      const lay = layoutClips(p.clips);
      const curL = lay.find(l => l.clip.id === this.cur?.clipId);
      if (!curL) { this.pause(); return; }
      const el = this.cur.el;
      let t;
      const clock = this.clockT + (performance.now() - this.clockBase) / 1000;
      if (this.isVideo(el) && !el.paused && !el.seeking) {
        const vt = curL.start + (el.currentTime - curL.clip.in) / (curL.clip.speed || 1);
        t = Math.abs(vt - clock) > 0.12 ? vt : Math.max(vt, Math.min(clock, vt + 0.05));
      } else t = clock;
      if (t >= curL.end - 0.012) {
        // siguiente clip
        const nextL = lay[curL.index + 1];
        if (this.isVideo(el)) el.pause();
        if (!nextL) { timeBus.set(curL.end); this.pause(); this.seek(Math.max(0, curL.end - 0.02)); return; }
        let nel;
        if (this.prep && this.prep.clipId === nextL.clip.id) nel = this.prep.el;
        else { nel = this.pick(nextL.clip, el); if (this.isVideo(nel)) nel.currentTime = nextL.clip.in; }
        this.cur = { clipId: nextL.clip.id, el: nel };
        if (this.isVideo(nel)) { this.applyAudio(nel, nextL.clip); nel.play().catch(() => {}); }
        this.clockBase = performance.now(); this.clockT = nextL.start;
        t = nextL.start;
        this.prepareNext({ index: curL.index + 1 });
      }
      timeBus.set(t);
      this.dirty = true;
    }
    if (this.dirty && this.ctx) { this.dirty = false; this.draw(); }
  }

  frameSource(t) {
    const p = state.project;
    const hit = clipAt(p, t);
    if (!hit || !this.cur || this.cur.clipId !== hit.clip.id) {
      if (!hit) return null;
      const el = this.cur?.el;
      if (!el) return null;
      const asset = p.assets.find(a => a.id === hit.clip.assetId);
      if (!runtime.assets.get(hit.clip.assetId)?.videos?.includes(el)) return null;
      return { el, hit, asset };
    }
    const asset = p.assets.find(a => a.id === hit.clip.assetId);
    return { el: this.cur.el, hit, asset };
  }

  draw() {
    const p = state.project;
    const c = this.canvas;
    if (!c) return;
    const t = timeBus.t;
    const src = this.frameSource(t);
    if (src && this.isVideo(src.el) && src.el.readyState < 2) { this.dirty = true; return; }
    this.comp.setLogo(p.brand?.logo || null);
    // mientras se edita un zoom dinámico se ve el plano completo con los marcos inicial y final
    const sel = state.ui.sel;
    const zsel = !state.ui.playing && sel?.type === 'overlay' ? p.overlays.find(o => o.id === sel.id && o.type === 'zoom' && o.props.mode === 'dinamico') : null;
    this.info = this.comp.render(this.ctx, c.width, c.height, t, src, {
      project: p, version: projectVersion, groups: captionGroups(p, projectVersion), total: this.duration,
      safeZone: state.ui.safeZone, compare: state.ui.compare, editing: !state.ui.playing, maxDim: state.ui.playing ? 1280 : 1920,
      camEdit: zsel ? zsel.id : null,
    });
    if (this.info?.maskMissing) this.dirty = true;
    this.onInfo && this.onInfo(this.info);
  }

  // Captura el fotograma actual a resolución completa
  async capture(withOverlays = true) {
    const p = state.project;
    const W = p.format.w, H = p.format.h;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const t = timeBus.t;
    const src = this.frameSource(t);
    if (!withOverlays) {
      const comp = this.comp;
      comp.render(ctx, W, H, t, src, { project: { ...p, overlays: [], captions: { ...p.captions, enabled: false } }, version: -1, groups: [], total: this.duration, safeZone: state.ui.safeZone, compare: false, editing: false });
    } else {
      this.comp.render(ctx, W, H, t, src, { project: p, version: projectVersion, groups: captionGroups(p, projectVersion), total: this.duration, safeZone: state.ui.safeZone, compare: false, editing: false });
    }
    this.dirty = true;
    return c;
  }
}

export const player = new Player();
