import { clamp } from '../lib.js';
import { ColorGL, colorValues, isNeutral } from './color.js';
import { layoutCaption, drawCaption, regionLuma, needsBoost, clearMetrics } from './captions.js';
import { MOTIONS, drawKnockout } from './motions.js';
import { animIn, animOut, applyState, ease } from './anim.js';
import { safeRect } from '../data/brand.js';
import { groupAt, resolveStyle } from '../core/captions.js';
import { layoutClips } from '../core/timeline.js';
import { personMask, facesAt, facesCached } from '../ai/vision.js';
import { trackAt, trackMedian, reframeRect } from '../ai/reframe.js';

export const TRANSITIONS = [
  { id: 'none', name: 'Corte', dur: 0 },
  { id: 'punch', name: 'Zoom golpe', dur: 0.3 },
  { id: 'flash', name: 'Flash', dur: 0.3 },
  { id: 'dip', name: 'Fundido a negro', dur: 0.5 },
  { id: 'blur', name: 'Desenfoque', dur: 0.4 },
  { id: 'whip', name: 'Barrido', dur: 0.3 },
];

const mk = (w = 2, h = 2) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

/**
 * Dibuja una imagen de la fuente (fotograma o máscara, que comparten encuadre) en su sitio:
 * espejo, recorte (fracciones de la fuente) y transformación libre (centro, escala, giro).
 */
export function drawPlaced(g, img, vr, iw, ih) {
  const c = vr.crop;
  const cl = c?.l || 0, cr = c?.r || 0, ct = c?.t || 0, cb = c?.b || 0;
  const sx = cl * iw, sy = ct * ih, sW = Math.max(1, iw * (1 - cl - cr)), sH = Math.max(1, ih * (1 - ct - cb));
  const fx = vr.x + vr.w / 2, fy = vr.y + vr.h / 2;
  // con espejo, el recorte izquierdo de la fuente se ve a la derecha
  const rx = (vr.flip ? -(vr.w / 2) + cr * vr.w : -(vr.w / 2) + cl * vr.w), ry = -(vr.h / 2) + ct * vr.h;
  const dw = vr.w * (1 - cl - cr), dh = vr.h * (1 - ct - cb);
  const T = vr.tf;
  g.save();
  g.translate(T ? T.cx : fx, T ? T.cy : fy);
  if (T?.r) g.rotate(T.r);
  if (T && T.s !== 1) g.scale(T.s, T.s);
  if (vr.flip) {
    g.scale(-1, 1);
    g.drawImage(img, sx, sy, sW, sH, -(rx + dw), ry, dw, dh);
  } else g.drawImage(img, sx, sy, sW, sH, rx, ry, dw, dh);
  g.restore();
}

// Rectángulo visible del clip (con recorte y transformación) en px del lienzo, para la caja de selección
export function placedBox(vr) {
  const c = vr.crop;
  const cl = c?.l || 0, cr = c?.r || 0, ct = c?.t || 0, cb = c?.b || 0;
  const s = vr.tf?.s || 1;
  const fx = vr.tf ? vr.tf.cx : vr.x + vr.w / 2, fy = vr.tf ? vr.tf.cy : vr.y + vr.h / 2;
  const ox = vr.flip ? (cr - cl) / 2 : (cl - cr) / 2;
  return { x: fx + ox * vr.w * s, y: fy + (ct - cb) / 2 * vr.h * s, w: vr.w * (1 - cl - cr) * s, h: vr.h * (1 - ct - cb) * s, rot: vr.tf?.r || 0, full: { x: fx, y: fy, w: vr.w * s, h: vr.h * s } };
}

// Curvas de aceleración del zoom (como en DaVinci: lineal, suave, acelera, frena…)
export const ZOOM_CURVES = {
  suave: { name: 'Suave', f: ease.inOutCubic },
  lineal: { name: 'Lineal', f: (x) => x },
  acelera: { name: 'Acelera', f: (x) => x * x * x },
  frena: { name: 'Frena', f: ease.outCubic },
  rapido: { name: 'Explosivo', f: ease.outExpo },
  rebote: { name: 'Rebote', f: (x) => ease.outBack(x, 1.7) },
};
export const ZOOM_FROM = { x: 0.5, y: 0.5, s: 1 }, ZOOM_TO = { x: 0.5, y: 0.4, s: 1.45 };
// Progreso 0..1 del zoom según velocidad y curva
export function zoomProgress(P, lt, d) {
  const mode = P.mode || 'in';
  const sp = P.speed || (mode === 'golpe' ? 'rapido' : 'lento');
  const dur = sp === 'rapido' ? Math.min(0.28, d) : sp === 'normal' ? Math.min(1, d) : d;
  const curve = (ZOOM_CURVES[P.curve] || ZOOM_CURVES[mode === 'golpe' ? 'frena' : 'suave']).f;
  return curve(clamp(lt / Math.max(0.05, dur), 0, 1));
}

export class Compositor {
  constructor() {
    this.gl = new ColorGL();
    this.base = mk(); this.bctx = this.base.getContext('2d');
    this.person = mk(); this.pctx = this.person.getContext('2d');
    this.cut = mk(); this.cutCtx = this.cut.getContext('2d');
    this.tmp = mk();
    this.probe = mk(48, 85); this.probeCtx = this.probe.getContext('2d', { willReadFrequently: true });
    this.layoutMemo = new Map();
    this.placeMemo = new Map();
    this.styleMemo = new Map();
    this.faceQueue = new Set();
    this.zoomMemo = { v: -1, map: new Map() };
    this.logo = null; this.logoSrc = null;
    this.maxDim = 1920;
  }

  setLogo(dataUrl) {
    if (dataUrl === this.logoSrc) return;
    this.logoSrc = dataUrl;
    if (!dataUrl) { this.logo = null; return; }
    const img = new Image();
    img.onload = () => { this.logo = img; };
    img.src = dataUrl;
  }

  invalidate() { this.layoutMemo.clear(); this.placeMemo.clear(); this.styleMemo.clear(); clearMetrics(); }

  ensure(c, W, H) { if (c.width !== W || c.height !== H) { c.width = W; c.height = H; } }

  // Zoom alterno en cortes del mismo plano (oculta los saltos tras quitar silencios)
  autoZoomFor(p, version, clipId) {
    if (!p.autoZoom) return 1;
    if (this.zoomMemo.v !== version) {
      const map = new Map();
      let k = 0, prev = null;
      for (const c of p.clips) {
        if (prev && prev.assetId === c.assetId && Math.abs(c.in - prev.out) < 1.5) k++;
        else k = 0;
        map.set(c.id, k % 2 ? 1.12 : 1);
        prev = c;
      }
      this.zoomMemo = { v: version, map };
    }
    return this.zoomMemo.map.get(clipId) || 1;
  }

  // Zooms de cámara (pestaña Efectos). skipId: zoom dinámico que se está editando (se ve sin aplicar).
  cameraZoom(p, t, skipId = null) {
    let z = 1, ax = 0.5, ay = 0.42, win = null, follow = false;
    for (const o of (p.overlaysHidden ? [] : p.overlays)) {
      if (o.type !== 'zoom' || t < o.start || t >= o.start + o.dur || o.id === skipId) continue;
      const P = o.props, lt = t - o.start;
      const k = zoomProgress(P, lt, o.dur);
      const mode = P.mode || 'in';
      if (mode === 'dinamico') {
        const a = P.from || ZOOM_FROM, b = P.to || ZOOM_TO;
        win = { cx: a.x + (b.x - a.x) * k, cy: a.y + (b.y - a.y) * k, s: a.s + (b.s - a.s) * k };
        continue;
      }
      const A = P.amount || 1.25;
      const amt = mode === 'out' ? A + (1 - A) * k : mode === 'respira' ? 1 + (A - 1) * Math.sin(Math.PI * clamp(lt / o.dur, 0, 1)) : 1 + (A - 1) * k;
      z *= amt; ax = o.x; ay = o.y; follow = follow || !!P.follow;
    }
    return { z, ax, ay, win, follow };
  }

  /**
   * Dibuja el fotograma del instante t.
   * src: { el, hit, asset } | null   (el ya está en el fotograma correcto)
   * o: { project, version, groups, total, safeZone, compare, editing, maxDim }
   */
  render(ctx, W, H, t, src, o) {
    const p = o.project;
    const u = Math.min(W, H) / 1080;
    const safe = safeRect({ id: p.format.id, w: W, h: H }, o.safeZone || 'tiktok');
    this.ensure(this.base, W, H);
    const b = this.bctx;
    b.imageSmoothingQuality = 'high'; // escalado de máxima calidad (nitidez al reducir 4K → 1080)
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalAlpha = 1; b.filter = 'none';
    b.fillStyle = '#000'; b.fillRect(0, 0, W, H);
    const info = { cap: null, ovs: [], vrect: null };
    let vr = null;

    if (src && src.el && src.hit) {
      const { el, hit, asset } = src;
      const clip = hit.clip;
      const sw = el.videoWidth || el.naturalWidth || asset.width, sh = el.videoHeight || el.naturalHeight || asset.height;
      if (sw && sh) {
        let frame = el;
        if (!o.compare) {
          const v = colorValues(clip.color || p.color);
          if (!isNeutral(v)) frame = this.gl.render(el, sw, sh, v, t, o.maxDim || this.maxDim) || el;
        }
        // Encuadre
        const lt = t - hit.start;
        let z = (clip.zoom || 1) * this.autoZoomFor(p, o.version, clip.id);
        if (asset.kind === 'image') z *= 1 + 0.06 * clamp(lt / Math.max(0.5, hit.dur), 0, 1);
        const cam = this.cameraZoom(p, t, o.camEdit);
        z *= cam.z;
        let dx = 0, blurPx = 0, flash = 0, dip = 0;
        const tr = clip.transition;
        if (tr && tr.type !== 'none' && hit.index > 0) {
          const d = tr.dur || 0.3;
          if (lt < d) {
            const k = lt / d;
            if (tr.type === 'punch') z *= 1 + 0.18 * (1 - ease.outCubic(k));
            if (tr.type === 'whip') { dx = (1 - ease.outCubic(k)) * W * 0.4; blurPx = (1 - k) * 28 * u; }
            if (tr.type === 'blur' && lt < d / 2) blurPx = (1 - lt / (d / 2)) * 34 * u;
            if (tr.type === 'flash' && lt < d / 2) flash = 1 - lt / (d / 2);
            if (tr.type === 'dip' && lt < d / 2) dip = 1 - lt / (d / 2);
          }
        }
        // mitad de salida de la transición del clip siguiente
        const next = p.clips[hit.index + 1];
        if (next?.transition && next.transition.type !== 'none') {
          const d = next.transition.dur || 0.3, rem = hit.end - t;
          if (rem < d / 2) {
            const k = 1 - rem / (d / 2);
            if (next.transition.type === 'flash') flash = Math.max(flash, k);
            if (next.transition.type === 'dip') dip = Math.max(dip, k);
            if (next.transition.type === 'blur') blurPx = Math.max(blurPx, k * 34 * u);
            if (next.transition.type === 'whip') { dx = -k * W * 0.3; blurPx = Math.max(blurPx, k * 28 * u); }
          }
        }
        const fit = p.fit === 'blur' && Math.abs(sw / sh - W / H) > 0.05 ? 'contain' : 'cover';
        const s = fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
        let w = sw * s, h = sh * s;
        let x = (W - w) / 2 + (fit === 'cover' ? (clip.cropX || 0) * (w - W) / 2 : 0);
        let y = (H - h) / 2 + (fit === 'cover' ? (clip.cropY || 0) * (h - H) / 2 : 0);
        let ax = cam.z !== 1 ? cam.ax * W : W / 2, ay = cam.z !== 1 ? cam.ay * H : H * 0.42;
        // Auto-encuadre de la cabeza
        const rf = fit === 'cover' && clip.reframe ? clip.reframe : null;
        const track = rf ? p.faceTracks?.[asset.id] : null;
        let fpos = track ? (rf.mode === 'follow' ? trackAt(track, hit.src) : trackMedian(track, clip.in, clip.out, `${clip.id}|${clip.in}|${clip.out}`)) : null;
        if (fpos && clip.flipX) fpos = [1 - fpos[0], ...fpos.slice(1)];
        if (fpos) {
          const R = reframeRect(W, H, w, h, fpos[0], fpos[1], rf.x ?? 0.5, rf.y ?? 0.32, rf.maxZoom || 1.8, clip.zoom || 1);
          x = R.x; y = R.y; w = R.w; h = R.h;
          z /= (clip.zoom || 1); // el zoom del clip ya se ha usado como mínimo
          if (cam.z === 1) { ax = (rf.x ?? 0.5) * W; ay = (rf.y ?? 0.32) * H; }
        }
        // Zoom que sigue la cara: el punto fijo del zoom es la cabeza
        if (cam.follow && cam.z !== 1) {
          const ft = p.faceTracks?.[asset.id];
          const fp = ft ? trackAt(ft, hit.src) : null;
          if (fp) { ax = x + (clip.flipX ? 1 - fp[0] : fp[0]) * w; ay = y + fp[1] * h; }
        }
        // Zoom dinámico: ventana que va del marco inicial al final (sin bordes negros)
        if (cam.win && fit === 'cover') {
          const s = Math.max(1, cam.win.s);
          const cx = clamp(cam.win.cx, 0.5 / s, 1 - 0.5 / s) * W, cy = clamp(cam.win.cy, 0.5 / s, 1 - 0.5 / s) * H;
          x = (x - cx) * s + W / 2; y = (y - cy) * s + H / 2; w *= s; h *= s;
        }
        x = ax + (x - ax) * z; y = ay + (y - ay) * z; w *= z; h *= z;
        x += dx;
        // Posición, escala, giro y recorte del clip (arrastrando en el reproductor)
        const tf = clip.tf || null, crop = clip.crop || null;
        vr = { x, y, w, h, sw, sh, flip: !!clip.flipX, crop, tf: tf ? { cx: x + w / 2 + (tf.x || 0) * W, cy: y + h / 2 + (tf.y || 0) * H, s: tf.s || 1, r: tf.r || 0 } : null };
        const bgr = clip.bg?.remove ? clip.bg : null;
        const moved = !!(tf || crop || bgr);
        if (fit === 'contain' || (moved && (clip.bg?.fill || 'blur') === 'blur')) {
          const cs = Math.max(W / sw, H / sh) * 1.08;
          b.save(); b.filter = `blur(${(40 * u).toFixed(0)}px) brightness(0.55)`;
          b.drawImage(frame, (W - sw * cs) / 2, (H - sh * cs) / 2, sw * cs, sh * cs);
          b.restore();
        } else if (moved && clip.bg?.fill && clip.bg.fill !== 'black') { b.fillStyle = clip.bg.fill; b.fillRect(0, 0, W, H); }
        if (blurPx > 0.5) b.filter = `blur(${blurPx.toFixed(1)}px)`;
        if (bgr) {
          // Quitar el fondo: solo la persona (máscara de IA) sobre el relleno elegido
          const m = personMask(el, `${asset.id}@${hit.src.toFixed(3)}`);
          if (m) {
            this.ensure(this.cut, W, H);
            const cc = this.cutCtx;
            cc.setTransform(1, 0, 0, 1, 0, 0); cc.globalCompositeOperation = 'source-over'; cc.filter = 'none';
            cc.clearRect(0, 0, W, H);
            drawPlaced(cc, frame, vr, sw, sh);
            cc.globalCompositeOperation = 'destination-in';
            cc.filter = `blur(${Math.max(1, 2 * u).toFixed(1)}px)`;
            drawPlaced(cc, m, vr, m.width, m.height);
            cc.filter = 'none'; cc.globalCompositeOperation = 'source-over';
            b.drawImage(this.cut, 0, 0);
          } else info.maskMissing = true;
        } else drawPlaced(b, frame, vr, sw, sh);
        b.filter = 'none';
        // Persona duplicada: la otra toma ocupa la otra mitad, con la unión difuminada
        if (clip.dual && src.el2) this.drawDual(b, src, clip, vr, W, H, t, o, p);
        if (flash > 0) { b.fillStyle = `rgba(255,255,255,${(flash * 0.95).toFixed(3)})`; b.fillRect(0, 0, W, H); }
        if (dip > 0) { b.fillStyle = `rgba(0,0,0,${dip.toFixed(3)})`; b.fillRect(0, 0, W, H); }
        info.vrect = vr;
        info.clipId = clip.id;
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.filter = 'none';
    ctx.drawImage(this.base, 0, 0);

    const env = { W, H, u, safe, base: this.base, tmp: this.tmp, t, total: o.total || 0, editing: !!o.editing, logo: this.logo };

    // --- Subtítulos ---
    let cap = null;
    if (p.captions.enabled && o.groups?.length) {
      const g = groupAt(o.groups, t);
      if (g) {
        // el estilo solo cambia al editar el proyecto: se reutiliza en cada fotograma
        const sk = `${o.version}|${g.id}`;
        let st = this.styleMemo.get(sk);
        if (!st) { st = resolveStyle(p.captions, g.ov); if (this.styleMemo.size > 400) this.styleMemo.clear(); this.styleMemo.set(sk, st); }
        if (!st.hidden) {
          const place = this.placeCaption(ctx, g, st, env, src, vr, o);
          cap = { g, st, L: place.L, boost: place.boost };
          info.cap = { id: g.id, x: place.L.bx, y: place.L.by, w: place.L.bw, h: place.L.bh };
        }
      }
    }

    // --- Motions activas ---
    const active = p.overlaysHidden ? [] : p.overlays.filter(ov => t >= ov.start && t < ov.start + ov.dur && MOTIONS[ov.type]);
    const behindOv = active.filter(ov => ov.behind);
    const frontOv = active.filter(ov => !ov.behind);
    const capBehind = cap && cap.st.behind;

    let mask = null;
    if ((capBehind || behindOv.length) && src?.el && vr) {
      mask = personMask(src.el, `${src.asset.id}@${src.hit.src.toFixed(3)}`);
    }
    const drawCap = () => drawCaption(ctx, cap.g, t, cap.st, cap.L, env, { backdrop: this.base, boost: cap.boost });

    behindOv.forEach(ov => this.drawOverlay(ctx, ov, t, env, info));
    if (capBehind) drawCap();
    if (mask && (capBehind || behindOv.length)) {
      this.ensure(this.person, W, H);
      const pc = this.pctx;
      pc.setTransform(1, 0, 0, 1, 0, 0);
      pc.globalCompositeOperation = 'source-over';
      pc.clearRect(0, 0, W, H);
      pc.drawImage(this.base, 0, 0);
      pc.globalCompositeOperation = 'destination-in';
      pc.filter = `blur(${Math.max(1, 2.5 * u).toFixed(1)}px)`;
      drawPlaced(pc, mask, vr, mask.width, mask.height);
      pc.filter = 'none';
      pc.globalCompositeOperation = 'source-over';
      ctx.drawImage(this.person, 0, 0);
    }
    if (cap && !capBehind) drawCap();
    frontOv.forEach(ov => this.drawOverlay(ctx, ov, t, env, info));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.filter = 'none';
    info.maskMissing = !!info.maskMissing || ((capBehind || behindOv.length > 0) && !mask);
    return info;
  }

  drawDual(b, src, clip, vr, W, H, t, o, p) {
    const d = clip.dual, el2 = src.el2;
    const sw2 = el2.videoWidth || el2.width, sh2 = el2.videoHeight || el2.height;
    if (!sw2 || !sh2) return;
    let f2 = el2;
    if (!o.compare) {
      const v = colorValues(clip.color || p.color);
      if (!isNeutral(v)) f2 = this.gl.render(el2, sw2, sh2, v, t, o.maxDim || this.maxDim) || el2;
    }
    this.ensure(this.cut, W, H);
    const cc = this.cutCtx;
    cc.setTransform(1, 0, 0, 1, 0, 0); cc.globalCompositeOperation = 'source-over';
    cc.clearRect(0, 0, W, H);
    cc.filter = d.gain ? `brightness(${(1 + d.gain).toFixed(3)})` : 'none';
    drawPlaced(cc, f2, vr, sw2, sh2);
    cc.filter = 'none';
    // máscara: se ve solo el lado de esta toma, con un degradado (desenfoque) en la unión
    const sx = vr.x + (d.split ?? 0.5) * vr.w, fw = Math.max(1, (d.feather ?? 0.03) * W);
    const g = cc.createLinearGradient(sx - fw, 0, sx + fw, 0);
    const right = !d.swap; // la toma secundaria va a la derecha salvo que se inviertan
    g.addColorStop(0, `rgba(0,0,0,${right ? 0 : 1})`); g.addColorStop(1, `rgba(0,0,0,${right ? 1 : 0})`);
    cc.globalCompositeOperation = 'destination-in';
    cc.fillStyle = g; cc.fillRect(0, 0, W, H);
    cc.globalCompositeOperation = 'source-over';
    b.drawImage(this.cut, 0, 0);
  }

  placeCaption(ctx, g, st, env, src, vr, o) {
    const p = o.project;
    const key = `${g.id}|${o.version}|${env.W}|${o.safeZone}`;
    let m = this.placeMemo.get(key);
    if (!m) {
      let posY = st.posY;
      let L = layoutCaption(ctx, g, st, env, posY);
      let final = true;
      if (p.captions.avoidFace && !st.ownPos && src?.el && vr && !st.behind) {
        // 1) seguimiento de cara ya calculado (instantáneo) · 2) caché · 3) detección (6 ms; al reproducir, en segundo plano)
        let faces;
        const track = p.faceTracks?.[src.asset.id];
        const q = track?.pts?.length ? trackAt(track, src.hit.src) : null;
        if (track?.pts?.length) {
          if (q && q[2] > 0 && isFinite(q[0])) {
            const fh = q[2], fw = fh * 0.8 * (vr.sh / vr.sw);
            faces = [{ x: q[0] - fw / 2, y: q[1] - fh * 0.42, w: fw, h: fh }];
          } else faces = [];
        } else if (o.fast) {
          faces = facesCached(src.asset.id, src.hit.src);
          if (faces === undefined) {
            faces = null;
            const el = src.el, id = src.asset.id, ts = src.hit.src, k = id + '@' + Math.round(ts * 4);
            if (!this.faceQueue.has(k)) {
              this.faceQueue.add(k);
              (window.requestIdleCallback || setTimeout)(() => { facesAt(el, id, ts); this.faceQueue.delete(k); this.onAsync && this.onAsync(); });
            }
          }
        } else faces = facesAt(src.el, src.asset.id, src.hit.src);
        if (faces === null) final = false;
        else if (faces.length) {
          const fr = faces.map(f => ({ x: vr.x + (vr.flip ? 1 - f.x - f.w : f.x) * vr.w, y: vr.y + f.y * vr.h - f.h * vr.h * 0.25, w: f.w * vr.w, h: f.h * vr.h * 1.35 }));
          const hit = (L) => fr.some(f => L.bx < f.x + f.w && L.bx + L.bw > f.x && L.by < f.y + f.h && L.by + L.bh > f.y);
          if (hit(L)) {
            const f = fr.reduce((a, c) => (c.w * c.h > a.w * a.h ? c : a));
            const margin = 30 * env.u;
            const cands = [(f.y + f.h + margin + L.bh / 2) / env.H, (f.y - margin - L.bh / 2) / env.H];
            for (const c of cands) {
              const L2 = layoutCaption(ctx, g, st, env, c);
              if (!hit(L2)) { L = L2; posY = c; break; }
            }
          }
        }
      }
      let boost = false;
      m = { L, boost, posY };
      if (final && p.captions.autoReadable && !st.box?.on && st.shadow?.on) {
        const pr = this.probeCtx, pw = this.probe.width, ph = this.probe.height;
        const rect = { x: L.bx, y: L.by, w: L.bw, h: L.bh };
        if (o.fast && window.createImageBitmap) {
          // reproduciendo: se mide el fondo sin bloquear la GPU (llega uno o dos fotogramas después)
          const mm = m;
          createImageBitmap(this.base, { resizeWidth: pw, resizeHeight: ph, resizeQuality: 'low' }).then(bmp => {
            pr.drawImage(bmp, 0, 0); bmp.close();
            if (needsBoost(st, regionLuma(pr, pw, ph, env.W, env.H, rect))) { mm.boost = true; this.onAsync && this.onAsync(); }
          }).catch(() => {});
        } else {
          pr.drawImage(this.base, 0, 0, pw, ph);
          m.boost = needsBoost(st, regionLuma(pr, pw, ph, env.W, env.H, rect));
        }
      }
      if (final) this.placeMemo.set(key, m);
      if (this.placeMemo.size > 800) this.placeMemo.clear();
    }
    return m;
  }

  drawOverlay(ctx, ov, t, env, info) {
    const M = MOTIONS[ov.type];
    const lt = t - ov.start;
    const inS = animIn(ov.animIn ?? M.animIn ?? 'fade', clamp(lt / 0.4, 0, 1), 0, 100 * env.u);
    const outS = animOut(ov.animOut ?? M.animOut ?? 'fade', clamp((lt - (ov.dur - 0.3)) / 0.3, 0, 1), 100 * env.u);
    if (M.camera && !env.editing) return;
    if (M.knockout) {
      drawKnockout(ctx, ov, lt, env, { alpha: inS.alpha * outS.alpha, scale: inS.scale * outS.scale });
      info.ovs.push({ id: ov.id, x: ov.x * env.W, y: ov.y * env.H, w: env.W * 0.8, h: 300 * env.u * (ov.scale || 1), rot: 0 });
      return;
    }
    ctx.save();
    ctx.globalAlpha = 1;
    if (!M.full) {
      ctx.translate(ov.x * env.W, ov.y * env.H);
      if (ov.rot) ctx.rotate(ov.rot);
      const sc = ov.scale || 1;
      ctx.scale(sc, sc);
    }
    applyState(ctx, inS, 0, 0);
    applyState(ctx, outS, 0, 0);
    let box = { w: 200, h: 100 };
    try { box = M.draw(ctx, ov, lt, env) || box; } catch (e) { console.error('motion', ov.type, e); }
    ctx.restore();
    ctx.letterSpacing = '0px';
    if (!M.full) info.ovs.push({ id: ov.id, x: ov.x * env.W, y: ov.y * env.H, w: box.w * (ov.scale || 1), h: box.h * (ov.scale || 1), rot: ov.rot || 0 });
    else info.ovs.push({ id: ov.id, x: env.W / 2, y: env.H / 2, w: env.W * 0.98, h: env.H * 0.98, rot: 0, full: true });
  }
}

export function clipLayout(p) { return layoutClips(p.clips); }
