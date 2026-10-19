import { uid, clamp } from '../lib.js';
import { state, runtime, update, setUI, toast, busy, emit, projectVersion, touchProject } from './store.js';
import * as TL from './timeline.js';
import { probeFile, analyzeAudio, makeThumbs, imageThumb, fileKind } from '../media/assets.js';
import { detectSilences, autoThreshold } from '../media/silence.js';
import { detectTakes, fillerRanges } from '../media/takes.js';
import { captionGroups } from './captions.js';
import { MOTIONS } from '../render/motions.js';
import { transcribe, autoHighlight } from '../ai/transcribe.js';
import { player, timeBus } from '../engine/player.js';

const P = () => state.project;
export const assetById = (id) => P().assets.find(a => a.id === id);

// ---------- Importar ----------
export async function importFiles(files, handles = []) {
  const list = [...files];
  let added = 0;
  for (let i = 0; i < list.length; i++) {
    const file = list[i];
    const kind = fileKind(file);
    if (!kind) { toast(`Formato no compatible: ${file.name}`, 'err'); continue; }
    if (kind === 'audio') { toast('Los archivos de solo audio llegarán en una próxima versión', 'err'); continue; }
    try {
      busy({ title: 'Importando', text: file.name, progress: null });
      const { asset, url } = await probeFile(file);
      runtime.assets.set(asset.id, { file, url, kind, handle: handles[i] || null, thumbs: [], audio: null, status: 'analyzing' });
      const firstVideo = !P().clips.length;
      update(p => {
        p.assets.push(asset);
        const c = TL.newClip(asset, 0, kind === 'image' ? 4 : asset.duration);
        p.clips.push(c);
        if (firstVideo && p.name === 'Proyecto sin título') p.name = file.name.replace(/\.[^.]+$/, '');
      });
      added++;
      busy(null);
      analyzeAsset(asset);
      // copia del bruto en la carpeta del proyecto
      const PF = await import('./projectFolder.js');
      if (PF.folderActive()) {
        const raw = await PF.copyRaw(asset, file).catch(() => null);
        if (raw) update(pp => { const a = pp.assets.find(x => x.id === asset.id); if (a) a.raw = raw; }, { history: false });
      }
    } catch (e) {
      busy(null);
      console.error(e);
      toast(`No se pudo abrir ${file.name}`, 'err');
    }
  }
  if (added) { player.seek(timeBus.t); toast(added === 1 ? 'Vídeo añadido a la línea de tiempo' : `${added} archivos añadidos`); }
}

export async function analyzeAsset(asset) {
  const rt = runtime.assets.get(asset.id);
  if (!rt) return;
  rt.status = 'analyzing'; emit();
  try {
    if (asset.kind === 'image') rt.thumbs = await imageThumb(rt.url);
    else {
      const [thumbs, audio] = await Promise.all([makeThumbs(rt.url, asset.duration), analyzeAudio(rt.file)]);
      rt.thumbs = thumbs; rt.audio = audio;
      if (!audio) update(p => { const a = p.assets.find(x => x.id === asset.id); if (a) a.hasAudio = false; }, { history: false });
    }
  } catch (e) { console.error('análisis', e); }
  rt.status = 'ready';
  touchProject();
}

export function addAssetToTimeline(assetId) {
  const a = assetById(assetId);
  if (!a) return;
  update(p => p.clips.push(TL.newClip(a, 0, a.kind === 'image' ? 4 : a.duration)));
}

export function removeAsset(assetId) {
  update(p => {
    p.clips = p.clips.filter(c => c.assetId !== assetId);
    p.assets = p.assets.filter(a => a.id !== assetId);
    delete p.transcripts[assetId];
  });
  player.seek(Math.min(timeBus.t, player.duration));
}

// ---------- Edición básica ----------
export function splitAtPlayhead() {
  const t = timeBus.t;
  let ok = false;
  update(p => { ok = TL.splitAt(p, t); });
  if (!ok) toast('Coloca el cursor dentro de un clip para cortar', 'err');
  player.seek(t);
}

export function deleteSelection() {
  const sel = state.ui.sel;
  if (!sel) return;
  if (sel.type === 'clip') { update(p => TL.deleteClip(p, sel.id)); setUI({ sel: null }); player.seek(Math.min(timeBus.t, player.duration)); }
  else if (sel.type === 'overlay') { update(p => { p.overlays = p.overlays.filter(o => o.id !== sel.id); }); setUI({ sel: null }); }
  else if (sel.type === 'group') { setGroupStyle(sel.id, { hidden: true }); }
}

export function trimPlayhead(edge) {
  let r = null;
  update(p => { r = TL.trimToPlayhead(p, timeBus.t, edge); });
  if (r === null) toast('Nada que recortar en esta posición', 'err');
  else player.seek(r);
}

export function trimClip(id, edge, value) {
  const c = P().clips.find(x => x.id === id);
  if (!c) return;
  const a = assetById(c.assetId);
  update(p => TL.trimClip(p, id, edge, value, a.kind === 'image' ? 3600 : a.duration), { key: 'trim' + id + edge });
}

export function moveClip(id, toIndex) { update(p => TL.moveClip(p, id, toIndex)); player.seek(timeBus.t); }

export function updateClip(id, patch, key) {
  update(p => { const c = p.clips.find(x => x.id === id); if (c) Object.assign(c, typeof patch === 'function' ? patch(c) : patch); }, { key });
}

export function duplicateClip(id) {
  update(p => {
    const i = p.clips.findIndex(c => c.id === id);
    if (i < 0) return;
    p.clips.splice(i + 1, 0, { ...structuredClone(p.clips[i]), id: uid('c'), transition: null });
  });
}

// ---------- Silencios ----------
export function silenceDefaults() {
  const a = P().assets.find(x => runtime.assets.get(x.id)?.audio);
  const rms = a ? runtime.assets.get(a.id).audio.rms : null;
  return { threshold: rms ? autoThreshold(rms) : -40, minSilence: 0.45, padding: 0.12 };
}

export function findSilences(opts) {
  const p = P();
  const byAsset = new Map();
  const preview = [];
  for (const a of p.assets) {
    const rt = runtime.assets.get(a.id);
    if (!rt?.audio || !p.clips.some(c => c.assetId === a.id)) continue;
    const ranges = detectSilences(rt.audio.rms, opts);
    byAsset.set(a.id, ranges);
    for (const r of ranges) preview.push(...TL.sourceRangeToTimeline(p, a.id, r.start, r.end));
  }
  return { byAsset, preview, total: preview.reduce((s, r) => s + r.end - r.start, 0) };
}

export function removeSilences(byAsset) {
  let removed = 0;
  update(p => { for (const [id, ranges] of byAsset) removed += TL.removeSourceRanges(p, id, ranges); });
  setUI({ silencePreview: null });
  player.seek(Math.min(timeBus.t, player.duration));
  return removed;
}

// ---------- Transcripción ----------
export async function transcribeAll({ model, lang, force = false }) {
  const p = P();
  const todo = p.assets.filter(a => a.kind === 'video' && a.hasAudio !== false && p.clips.some(c => c.assetId === a.id) && (force || !p.transcripts[a.id]));
  if (!todo.length) { toast('No hay vídeos pendientes de transcribir'); return; }
  for (const a of todo) {
    const rt = runtime.assets.get(a.id);
    if (!rt.audio) {
      busy({ title: 'Analizando audio', text: a.name, progress: null });
      rt.audio = await analyzeAudio(rt.file);
      if (!rt.audio) { busy(null); toast(`${a.name} no tiene audio`, 'err'); continue; }
    }
    const b = { title: 'Generando subtítulos', text: 'Preparando el modelo de voz…', progress: null };
    busy(b);
    try {
      const { idbGet, idbPut } = await import('./persist.js');
      const cacheKey = `tr|${a.name}|${a.size}|${a.duration.toFixed(2)}|${model}|${lang}`;
      const cached = !force ? await idbGet(cacheKey) : null;
      const words = cached?.length ? cached.map(w => ({ ...w, id: uid('w') })) : await transcribe(rt.audio, {
        model, lang,
        onProgress: (e) => {
          if (e.phase === 'download') busy({ ...b, text: `Descargando el modelo de voz (solo la primera vez)… ${e.total ? Math.round(e.loaded / 1048576) + ' / ' + Math.round(e.total / 1048576) + ' MB' : ''}`, progress: e.p });
          else if (e.phase === 'ready') busy({ ...b, text: `Modelo listo (${e.device === 'webgpu' ? 'GPU' : 'CPU'}). Transcribiendo…`, progress: 0 });
          else if (e.phase === 'transcribe') busy({ ...b, text: `Transcribiendo ${a.name} · parte ${e.i} de ${e.n}${e.text ? ' — “' + e.text.trim().slice(0, 60) + '…”' : ''}`, progress: e.p });
        },
      });
      if (!cached?.length) idbPut(cacheKey, words.map(({ text, start, end }) => ({ text, start, end, hl: 0 })));
      update(pp => { pp.transcripts[a.id] = { lang, model, words }; });
      // destacados automáticos (1 por bloque)
      const groups = captionGroups(state.project, projectVersion);
      const marks = new Set(autoHighlight(groups));
      if (marks.size) update(pp => { for (const w of pp.transcripts[a.id].words) if (marks.has(w.id)) w.hl = 1; }, { history: false });
    } catch (e) {
      console.error(e);
      busy(null);
      toast('No se pudo transcribir: ' + e.message, 'err', 6000);
      return;
    }
  }
  busy(null);
  toast('Subtítulos generados');
}

export function findWord(id) {
  for (const [assetId, tr] of Object.entries(P().transcripts)) {
    const w = tr.words.find(x => x.id === id);
    if (w) return { assetId, w, tr };
  }
  return null;
}

export function wordMutate(id, fn, key) {
  update(p => {
    for (const tr of Object.values(p.transcripts)) {
      const w = tr.words.find(x => x.id === id);
      if (w) { fn(w, tr); break; }
    }
  }, { key });
}

export const cycleHighlight = (id) => wordMutate(id, w => { w.hl = ((w.hl | 0) + 1) % 3; });
export const editWordText = (id, text) => wordMutate(id, w => { w.text = text; });
export const splitBefore = (id) => wordMutate(id, w => { w.br = true; });
export const joinWithPrev = (id) => wordMutate(id, w => { w.br = false; });

export function setGroupStyle(groupId, patch) {
  wordMutate(groupId, w => {
    const gs = { ...(w.gs || {}) };
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === undefined) delete gs[k]; else gs[k] = v; }
    w.gs = Object.keys(gs).length ? gs : undefined;
  }, 'gs' + groupId + Object.keys(patch).join());
}

export function clearManualBreaks() {
  update(p => { for (const tr of Object.values(p.transcripts)) for (const w of tr.words) delete w.br; });
}

export function runAutoHighlight() {
  const groups = captionGroups(P(), projectVersion);
  const marks = new Set(autoHighlight(groups));
  update(p => { for (const tr of Object.values(p.transcripts)) for (const w of tr.words) w.hl = marks.has(w.id) ? 1 : 0; });
}

// Borra palabras = corta el vídeo en esos instantes
export function removeWords(ids) {
  const set = new Set(ids);
  const byAsset = new Map();
  for (const [assetId, tr] of Object.entries(P().transcripts)) {
    const ws = tr.words;
    const ranges = [];
    for (let i = 0; i < ws.length; i++) {
      if (!set.has(ws[i].id)) continue;
      const prev = ws[i - 1], next = ws[i + 1];
      const s = prev ? Math.max(prev.end, ws[i].start - 0.08) : ws[i].start - 0.08;
      const e = next ? Math.min(next.start, ws[i].end + 0.05) : ws[i].end + 0.1;
      const last = ranges[ranges.length - 1];
      if (last && s - last.end < 0.2) last.end = e; else ranges.push({ start: s, end: e });
    }
    if (ranges.length) byAsset.set(assetId, ranges);
  }
  let removed = 0;
  update(p => { for (const [id, rs] of byAsset) removed += TL.removeSourceRanges(p, id, rs); });
  setUI({ wordSel: [] });
  player.seek(Math.min(timeBus.t, player.duration));
  return removed;
}

export function findTakes() {
  const out = [];
  for (const [assetId, tr] of Object.entries(P().transcripts)) {
    for (const s of detectTakes(tr.words)) {
      const tl = TL.sourceRangeToTimeline(P(), assetId, s.start, s.end);
      if (tl.length) out.push({ ...s, assetId, tl: tl[0].start, id: uid('k') });
    }
  }
  return out;
}

export function applyRanges(list) {
  const byAsset = new Map();
  for (const r of list) { if (!byAsset.has(r.assetId)) byAsset.set(r.assetId, []); byAsset.get(r.assetId).push({ start: r.start, end: r.end }); }
  let removed = 0;
  update(p => { for (const [id, rs] of byAsset) removed += TL.removeSourceRanges(p, id, rs); });
  player.seek(Math.min(timeBus.t, player.duration));
  return removed;
}

export function findFillers() {
  const out = [];
  for (const [assetId, tr] of Object.entries(P().transcripts)) for (const r of fillerRanges(tr.words)) out.push({ ...r, assetId });
  return out;
}

// ---------- Auto-encuadre de la cabeza (TikTok) ----------
export async function autoFrameHeads({ mode = 'follow', y = 0.32, maxZoom = 1.8, only = null } = {}) {
  const p = P();
  const assets = p.assets.filter(a => a.kind === 'video' && p.clips.some(c => c.assetId === a.id) && (!only || only.includes(a.id)));
  if (!assets.length) { toast('No hay vídeos en la línea de tiempo', 'err'); return; }
  const { analyzeFaces, clearReframeCache } = await import('../ai/reframe.js');
  try {
    for (const a of assets) {
      if (state.project.faceTracks?.[a.id]) continue;
      const rt = runtime.assets.get(a.id);
      if (!rt) continue;
      const b = { title: 'Encuadrando la cabeza', text: `Buscando la cara en ${a.name}…`, progress: 0 };
      busy(b);
      const { idbGet, idbPut } = await import('./persist.js');
      const key = `face|${a.name}|${a.size}|${a.duration.toFixed(2)}`;
      let tr = await idbGet(key);
      if (!tr?.pts) {
        tr = await analyzeFaces(rt.url, a.duration, pr => busy({ ...b, progress: pr }));
        tr.pts = tr.pts.map(q => q && q.map(v => Math.round(v * 10000) / 10000));
        idbPut(key, tr);
      }
      update(pp => { pp.faceTracks = { ...(pp.faceTracks || {}), [a.id]: tr }; }, { history: false });
    }
  } catch (e) {
    console.error(e); busy(null); toast('No se pudo analizar la cara: ' + e.message, 'err', 6000); return;
  }
  busy(null);
  const ids = new Set(assets.map(a => a.id));
  update(pp => pp.clips.forEach(c => { if (ids.has(c.assetId)) c.reframe = { mode, y, x: 0.5, maxZoom }; }));
  clearReframeCache();
  const found = assets.filter(a => state.project.faceTracks?.[a.id]?.pts?.[0]).length;
  toast(found ? 'Cabeza colocada en la zona superior central' : 'No se ha encontrado ninguna cara', found ? 'ok' : 'err');
}

export function setReframe(patch) {
  update(pp => pp.clips.forEach(c => { if (c.reframe) Object.assign(c.reframe, patch); }), { key: 'rf' + Object.keys(patch).join() });
  import('../ai/reframe.js').then(m => m.clearReframeCache());
}
export function clearReframe() { update(pp => pp.clips.forEach(c => { c.reframe = null; })); }

// ---------- Transiciones con lógica ----------
export function smartTransitions() {
  let n = 0;
  update(p => {
    p.clips.forEach((c, i) => {
      if (i === 0) { c.transition = null; return; }
      const prev = p.clips[i - 1];
      const jump = prev.assetId === c.assetId && Math.abs(c.in - prev.out) < 1.5;
      if (jump) c.transition = p.autoZoom ? null : { type: 'punch', dur: 0.25 };
      else c.transition = { type: 'blur', dur: 0.4 };
      if (c.transition) n++;
    });
  });
  return n;
}

// ---------- Motions ----------
export function addOverlay(type) {
  const M = MOTIONS[type];
  if (!M) return;
  const total = player.duration || 10;
  const t = timeBus.t;
  const long = M.dur >= 999;
  const o = {
    id: uid('o'), type, start: long ? 0 : Math.min(t, Math.max(0, total - 0.5)), dur: long ? Math.max(1, total) : M.dur,
    x: M.x ?? 0.5, y: M.y ?? 0.5, scale: 1, rot: 0, props: structuredClone(M.props), animIn: M.animIn, animOut: M.animOut, behind: false,
  };
  update(p => p.overlays.push(o));
  setUI({ sel: { type: 'overlay', id: o.id } });
  if (!long) player.seek(Math.min(o.start + 0.5, total));
}

export function updateOverlay(id, patch, key) {
  update(p => {
    const o = p.overlays.find(x => x.id === id);
    if (!o) return;
    if (typeof patch === 'function') patch(o);
    else for (const [k, v] of Object.entries(patch)) { if (k === 'props') o.props = { ...o.props, ...v }; else o[k] = v; }
  }, { key });
}

export function duplicateOverlay(id) {
  update(p => {
    const o = p.overlays.find(x => x.id === id);
    if (!o) return;
    const c = { ...structuredClone(o), id: uid('o'), start: o.start + o.dur };
    p.overlays.push(c);
  });
}

export function overlayZ(id, dir) {
  update(p => {
    const i = p.overlays.findIndex(o => o.id === id);
    if (i < 0) return;
    const [o] = p.overlays.splice(i, 1);
    p.overlays.splice(clamp(i + dir, 0, p.overlays.length), 0, o);
  });
}
