import { uid, clamp } from '../lib.js';

export const MIN_CLIP = 0.1;

export const clipDur = (c) => Math.max(0, (c.out - c.in) / (c.speed || 1));

// Clips con su posición en la línea de tiempo
export function layoutClips(clips) {
  let t = 0;
  return clips.map((c, i) => {
    const d = clipDur(c);
    const o = { clip: c, index: i, start: t, end: t + d, dur: d };
    t += d;
    return o;
  });
}

export function totalDuration(p) {
  let t = 0;
  for (const c of p.clips) t += clipDur(c);
  return t;
}

export function clipAt(p, t) {
  const lay = layoutClips(p.clips);
  if (!lay.length) return null;
  for (const l of lay) {
    if (t >= l.start && t < l.end) return { ...l, src: l.clip.in + (t - l.start) * (l.clip.speed || 1) };
  }
  const last = lay[lay.length - 1];
  if (t >= last.end - 1e-6) return { ...last, src: last.clip.out - 1e-3 };
  return { ...lay[0], src: lay[0].clip.in };
}

export function clipStart(p, id) {
  let t = 0;
  for (const c of p.clips) { if (c.id === id) return t; t += clipDur(c); }
  return 0;
}

export function newClip(asset, inT = 0, outT = asset.duration) {
  return { id: uid('c'), assetId: asset.id, in: inT, out: outT, speed: 1, volume: 1, color: null, transition: null, zoom: 1 };
}

// ---------- Operaciones (mutan el proyecto; usar dentro de update) ----------
export function splitAt(p, t) {
  const hit = clipAt(p, t);
  if (!hit) return false;
  const { clip, index } = hit;
  const src = hit.src;
  if (src - clip.in < MIN_CLIP || clip.out - src < MIN_CLIP) return false;
  const b = { ...structuredClone(clip), id: uid('c'), in: src, transition: null };
  clip.out = src;
  p.clips.splice(index + 1, 0, b);
  return true;
}

export function deleteClip(p, id) {
  const i = p.clips.findIndex(c => c.id === id);
  if (i < 0) return;
  const start = clipStart(p, id);
  const d = clipDur(p.clips[i]);
  p.clips.splice(i, 1);
  shiftOverlays(p, start, -d);
}

// Desplaza motions que empiezan después de "from" (edición magnética)
export function shiftOverlays(p, from, delta) {
  for (const o of p.overlays) {
    if (o.start >= from - 1e-3) o.start = Math.max(0, o.start + delta);
  }
}

export function trimClip(p, id, edge, value, assetDur) {
  const c = p.clips.find(x => x.id === id);
  if (!c) return;
  if (edge === 'in') c.in = clamp(value, 0, c.out - MIN_CLIP);
  else c.out = clamp(value, c.in + MIN_CLIP, assetDur ?? Infinity);
}

export function moveClip(p, id, toIndex) {
  const i = p.clips.findIndex(c => c.id === id);
  if (i < 0) return;
  const [c] = p.clips.splice(i, 1);
  p.clips.splice(clamp(toIndex, 0, p.clips.length), 0, c);
}

// Recorta el inicio/final del clip bajo el cursor hasta el cursor (Q / W)
export function trimToPlayhead(p, t, edge) {
  const hit = clipAt(p, t);
  if (!hit) return null;
  const { clip } = hit;
  if (edge === 'in') {
    if (hit.src - clip.in < 0.02) return null;
    const removed = (hit.src - clip.in) / (clip.speed || 1);
    clip.in = Math.min(hit.src, clip.out - MIN_CLIP);
    shiftOverlays(p, hit.start + removed, -removed);
    return hit.start;
  } else {
    if (clip.out - hit.src < 0.02) return null;
    const removed = (clip.out - hit.src) / (clip.speed || 1);
    clip.out = Math.max(hit.src, clip.in + MIN_CLIP);
    shiftOverlays(p, hit.start + clipDur(clip) + removed, -removed);
    return t;
  }
}

// Quita rangos de tiempo de un archivo (silencios, tomas, palabras borradas) de todos sus clips.
export function removeSourceRanges(p, assetId, ranges) {
  if (!ranges.length) return 0;
  const rs = [...ranges].sort((a, b) => a.start - b.start);
  let removedTotal = 0;
  const out = [];
  let oldCursor = 0;
  const removedOld = []; // rangos eliminados en coordenadas de la línea de tiempo anterior
  for (const c of p.clips) {
    const sp = c.speed || 1;
    if (c.assetId !== assetId) { out.push(c); oldCursor += clipDur(c); continue; }
    let segs = [{ in: c.in, out: c.out }];
    for (const r of rs) {
      const next = [];
      for (const s of segs) {
        if (r.end <= s.in || r.start >= s.out) { next.push(s); continue; }
        if (r.start > s.in) next.push({ in: s.in, out: r.start });
        if (r.end < s.out) next.push({ in: r.end, out: s.out });
      }
      segs = next;
    }
    segs = segs.filter(s => s.out - s.in >= 0.06);
    // huecos entre segmentos conservados = tiempo eliminado
    let prev = c.in;
    for (const s of [...segs, { in: c.out, out: c.out }]) {
      if (s.in - prev > 1e-4) removedOld.push({ start: oldCursor + (prev - c.in) / sp, end: oldCursor + (s.in - c.in) / sp });
      prev = s.out;
    }
    const before = clipDur(c);
    let after = 0;
    segs.forEach((s, k) => {
      const nc = { ...structuredClone(c), id: k === 0 ? c.id : uid('c'), in: s.in, out: s.out, transition: k === 0 ? c.transition : null };
      out.push(nc);
      after += clipDur(nc);
    });
    removedTotal += before - after;
    oldCursor += before;
  }
  p.clips = out;
  // Reubica las motions según el tiempo eliminado antes de su inicio
  const mapT = (T) => {
    let d = 0;
    for (const r of removedOld) {
      if (r.end <= T) d += r.end - r.start;
      else if (r.start < T) d += T - r.start;
    }
    return Math.max(0, T - d);
  };
  for (const o of p.overlays) {
    const s = mapT(o.start), e = mapT(o.start + o.dur);
    o.start = s; o.dur = Math.max(0.3, e - s);
  }
  return removedTotal;
}

// Convierte un tiempo del archivo a tiempo de línea de tiempo (primer clip que lo contiene)
export function sourceToTimeline(p, assetId, src) {
  let t = 0;
  for (const c of p.clips) {
    const d = clipDur(c);
    if (c.assetId === assetId && src >= c.in && src <= c.out) return t + (src - c.in) / (c.speed || 1);
    t += d;
  }
  return null;
}

// Rangos de la línea de tiempo que corresponden a un rango del archivo
export function sourceRangeToTimeline(p, assetId, s, e) {
  const res = [];
  let t = 0;
  for (const c of p.clips) {
    const d = clipDur(c);
    if (c.assetId === assetId) {
      const a = Math.max(s, c.in), b = Math.min(e, c.out);
      if (b > a) res.push({ start: t + (a - c.in) / (c.speed || 1), end: t + (b - c.in) / (c.speed || 1) });
    }
    t += d;
  }
  return res;
}

// Puntos de corte (para transiciones y zoom alterno)
export function cutPoints(p) {
  const lay = layoutClips(p.clips);
  return lay.slice(1).map((l, i) => ({ t: l.start, prev: lay[i].clip, next: l.clip }));
}
