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
    if (kind === 'audio') { await importAudio(file, handles[i]); continue; }
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

// ---------- Pista de audio (micro externo, música, voz en off) ----------
async function importAudio(file, handle) {
  try {
    busy({ title: 'Importando audio', text: file.name, progress: null });
    const { asset, url } = await probeFile(file);
    runtime.assets.set(asset.id, { file, url, kind: 'audio', handle: handle || null, thumbs: [], audio: null, status: 'analyzing' });
    const clip = { id: uid('au'), assetId: asset.id, start: 0, in: 0, out: asset.duration, volume: 1 };
    update(p => { p.assets.push(asset); (p.audio = p.audio || []).push(clip); });
    busy(null);
    setUI({ sel: { type: 'audio', id: clip.id } });
    await analyzeAsset(asset);
    const PF = await import('./projectFolder.js');
    if (PF.folderActive()) {
      const raw = await PF.copyRaw(asset, file).catch(() => null);
      if (raw) update(pp => { const a = pp.assets.find(x => x.id === asset.id); if (a) a.raw = raw; }, { history: false });
    }
    toast('Audio añadido a la pista de audio. Pulsa "Sincronizar" si es el mismo sonido que el del vídeo.', 'ok', 6000);
  } catch (e) { busy(null); console.error(e); toast(`No se pudo abrir ${file.name}`, 'err'); }
}

export function updateAudio(id, patch, key) {
  update(p => { const c = (p.audio || []).find(x => x.id === id); if (c) Object.assign(c, typeof patch === 'function' ? patch(c) : patch); }, { key });
  player.resyncAudio();
}

// Envolvente de energía (100 por segundo) del audio de la línea de tiempo de vídeo
function timelineEnvelope(p) {
  const lay = TL.layoutClips(p.clips);
  const total = TL.totalDuration(p);
  const env = new Float32Array(Math.ceil(total * 100) + 1);
  for (const l of lay) {
    const rms = runtime.assets.get(l.clip.assetId)?.audio?.rms;
    if (!rms) continue;
    const sp = l.clip.speed || 1;
    const a = Math.floor(l.start * 100), b = Math.floor(l.end * 100);
    for (let i = a; i < b && i < env.length; i++) {
      const src = l.clip.in + (i / 100 - l.start) * sp;
      env[i] = rms[Math.min(rms.length - 1, Math.max(0, Math.round(src * 100)))] || 0;
    }
  }
  return env;
}
// Realza los ataques (sílabas, golpes) para que la comparación sea precisa
function onsets(env) {
  const n = env.length, out = new Float32Array(n);
  const lg = env.map(v => Math.log(v + 1e-4));
  let mean = 0; for (const v of lg) mean += v; mean /= Math.max(1, n);
  for (let i = 1; i < n; i++) out[i] = Math.max(0, lg[i] - lg[i - 1]) + 0.25 * (lg[i] - mean);
  let m = 0; for (const v of out) m += v; m /= Math.max(1, n);
  let s = 0; for (let i = 0; i < n; i++) { out[i] -= m; s += out[i] * out[i]; }
  s = Math.sqrt(s) || 1;
  for (let i = 0; i < n; i++) out[i] /= s;
  return out;
}
/**
 * Mejor desfase entre dos envolventes (100 por segundo): devuelve el retardo (s) que hay que aplicar a "b"
 * para que coincida con "a" y la calidad de la coincidencia (0–1).
 */
export function bestLag(a, b, maxLag = null) {
  const A = onsets(a), B = onsets(b);
  const minL = -(B.length - 50), maxL = A.length - 50;
  const lo = maxLag ? Math.max(minL, -maxLag * 100) : minL, hi = maxLag ? Math.min(maxL, maxLag * 100) : maxL;
  let best = -Infinity, bestL = 0, second = -Infinity;
  for (let L = lo; L <= hi; L++) {
    let s = 0;
    const i0 = Math.max(0, L), i1 = Math.min(A.length, B.length + L);
    for (let i = i0; i < i1; i++) s += A[i] * B[i - L];
    if (s > best) { if (Math.abs(L - bestL) > 20) second = best; best = s; bestL = L; }
    else if (s > second && Math.abs(L - bestL) > 20) second = s;
  }
  const conf = best > 0 ? Math.max(0, Math.min(1, (best - Math.max(0, second)) / best * 2)) : 0;
  return { lag: bestL / 100, score: best, conf };
}

// Sincroniza un audio de la pista de audio con el sonido del vídeo (como "sincronizar por forma de onda")
export async function syncAudioClip(id) {
  const p = P();
  const c = (p.audio || []).find(x => x.id === id);
  if (!c) return;
  const rtA = runtime.assets.get(c.assetId);
  if (!rtA?.audio) { toast('El audio aún se está analizando, prueba en unos segundos', 'err'); return; }
  if (!p.clips.some(cl => runtime.assets.get(cl.assetId)?.audio)) { toast('El vídeo no tiene sonido para comparar', 'err'); return; }
  busy({ title: 'Sincronizando audio', text: 'Comparando las dos formas de onda…', progress: null });
  await new Promise(r => setTimeout(r, 30));
  const V = timelineEnvelope(p);
  const { lag, conf } = bestLag(V, rtA.audio.rms);
  busy(null);
  // lag = segundo de la línea de tiempo en el que empieza el archivo de audio
  update(pp => {
    const cc = pp.audio.find(x => x.id === id);
    if (lag >= 0) { cc.start = lag; cc.in = 0; } else { cc.start = 0; cc.in = -lag; }
    cc.out = Math.max(cc.in + 0.5, cc.out);
  });
  player.resyncAudio();
  toast(conf > 0.25 ? `Audio sincronizado (desfase ${lag >= 0 ? '+' : ''}${lag.toFixed(2).replace('.', ',')} s)` : 'Sincronizado, pero la coincidencia es débil: revisa que sea el mismo sonido', conf > 0.25 ? 'ok' : 'err', 6000);
  return { lag, conf };
}

// ---------- Montaje avanzado: persona duplicada ----------
// Dos tomas verticales con el trípode quieto: en una la persona está a la izquierda (dejando hueco a la derecha)
// y en la otra a la derecha. Se alinean para que se respondan y se juntan las dos mitades.

// Voz (1) / silencio (0), 100 por segundo, con un pequeño margen para no cortar sílabas
function speechActivity(rms) {
  const thr = Math.pow(10, autoThreshold(rms) / 20);
  const n = rms.length, act = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (rms[i] > thr) for (let k = Math.max(0, i - 12); k < Math.min(n, i + 25); k++) act[k] = 1;
  return act;
}
/** Desfase (s) de la toma B respecto a A para que hablen por turnos (B-tiempo = A-tiempo + desfase). */
export function bestTurnOffset(actA, actB) {
  const nA = actA.length, nB = actB.length;
  let best = -Infinity, bestOff = 0;
  for (let off = -(nA - 200); off <= nB - 200; off += 2) {
    let s = 0;
    const t0 = Math.max(0, -off), t1 = Math.min(nA, nB - off);
    if (t1 - t0 < 200) continue;
    for (let t = t0; t < t1; t++) {
      const a = actA[t], b = actB[t + off];
      s += a !== b ? 1 : a ? -3 : 0; // premia que hable uno solo, penaliza que hablen a la vez
    }
    if (s > best) { best = s; bestOff = off; }
  }
  return bestOff / 100;
}
const median = (arr) => { const v = arr.filter(x => isFinite(x)).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
function lumaOf(assetId) {
  const th = runtime.assets.get(assetId)?.thumbs || [];
  if (!th.length) return null;
  const c = new OffscreenCanvas(16, 16), x = c.getContext('2d');
  let s = 0, n = 0;
  for (const t of th.slice(0, 8)) {
    x.drawImage(t.bmp, 0, 0, 16, 16);
    const d = x.getImageData(0, 0, 16, 16).data;
    for (let i = 0; i < d.length; i += 4) { s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; }
  }
  return s / n / 255;
}

// Cambia los ajustes de la persona duplicada en todos los clips del mismo montaje
export function updateDual(clipId, patch, key) {
  const c0 = P().clips.find(c => c.id === clipId);
  if (!c0?.dual) return;
  update(p => {
    for (const c of p.clips) {
      if (!c.dual || c.assetId !== c0.assetId || c.dual.assetId !== c0.dual.assetId) continue;
      c.dual = { ...c.dual, ...(typeof patch === 'function' ? patch(c.dual) : patch) };
    }
  }, { key });
  player.seek(timeBus.t);
}

export async function createDualMontage({ leftId, rightId, removePauses = true, feather = 0.035 } = {}) {
  const p = P();
  const A = assetById(leftId), B = assetById(rightId);
  if (!A || !B || A.id === B.id) { toast('Elige dos tomas distintas', 'err'); return; }
  busy({ title: 'Montaje de persona duplicada', text: 'Analizando el audio de las dos tomas…', progress: null });
  try {
    for (const a of [A, B]) {
      const rt = runtime.assets.get(a.id);
      if (!rt.audio) rt.audio = await analyzeAudio(rt.file);
      if (!rt.audio) throw new Error(`${a.name} no tiene sonido`);
    }
    // ¿quién está a la izquierda? (posición de la cara)
    busy({ title: 'Montaje de persona duplicada', text: 'Buscando a la persona en cada toma…', progress: null });
    await ensureFaceTracks([A.id, B.id]).catch(() => {});
    const fx = (id) => median((state.project.faceTracks?.[id]?.pts || []).filter(Boolean).map(q => q[0]));
    let L = A, R = B, xL = fx(A.id), xR = fx(B.id);
    if (xL !== null && xR !== null && xL > xR) { [L, R] = [B, A]; [xL, xR] = [xR, xL]; }
    busy({ title: 'Montaje de persona duplicada', text: 'Alineando las tomas para que os respondáis…', progress: null });
    await new Promise(r => setTimeout(r, 20));
    const actL = speechActivity(runtime.assets.get(L.id).audio.rms), actR = speechActivity(runtime.assets.get(R.id).audio.rms);
    const off = bestTurnOffset(actL, actR);
    const r0 = Math.max(0, -off), r1 = Math.min(L.duration, R.duration - off);
    const split = xL !== null && xR !== null ? clamp((xL + xR) / 2, 0.2, 0.8) : 0.5;
    const lL = lumaOf(L.id), lR = lumaOf(R.id);
    const gain = lL && lR ? clamp(lL / lR - 1, -0.25, 0.25) : 0;
    const clip = { ...TL.newClip(L, r0, r1), dual: { assetId: R.id, off, split, feather, gain: Math.round(gain * 100) / 100, audio: 'ab', swap: false } };
    update(pp => {
      pp.clips = [clip];
      if (removePauses) {
        // quitar los ratos en los que no habla ninguno (deja 0,15 s de aire)
        const ranges = [];
        let s = null;
        const i0 = Math.ceil(r0 * 100), i1 = Math.floor(r1 * 100);
        for (let i = i0; i <= i1; i++) {
          const talk = i < i1 && (actL[i] || actR[i + Math.round(off * 100)]);
          if (!talk && s === null) s = i;
          if ((talk || i === i1) && s !== null) {
            if ((i - s) / 100 > 0.6) ranges.push({ start: s / 100 + 0.15, end: i / 100 - 0.15 });
            s = null;
          }
        }
        TL.removeSourceRanges(pp, L.id, ranges);
      }
    });
    busy(null);
    setUI({ sel: { type: 'clip', id: state.project.clips[0]?.id } });
    player.seek(0);
    toast(`Montaje creado: ${L.name} a la izquierda y ${R.name} a la derecha (desfase ${off >= 0 ? '+' : ''}${off.toFixed(2).replace('.', ',')} s)`, 'ok', 7000);
  } catch (e) { busy(null); console.error(e); toast('No se pudo crear el montaje: ' + e.message, 'err', 6000); }
}

export async function analyzeAsset(asset) {
  const rt = runtime.assets.get(asset.id);
  if (!rt) return;
  rt.status = 'analyzing'; emit();
  try {
    if (asset.kind === 'image') rt.thumbs = await imageThumb(rt.url);
    else if (asset.kind === 'audio') rt.audio = await analyzeAudio(rt.file);
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
    p.overlays = p.overlays.filter(o => o.props?.assetId !== assetId);
    p.audio = (p.audio || []).filter(o => o.assetId !== assetId);
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
  else if (sel.type === 'audio') { update(p => { p.audio = (p.audio || []).filter(o => o.id !== sel.id); }); setUI({ sel: null }); player.resyncAudio(); }
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
  // la velocidad cambia la duración: se vuelve a sincronizar el reproductor
  if (patch && patch.speed !== undefined) player.seek(Math.min(timeBus.t, player.duration));
}

// ---------- Corrección de audio (fx) ----------
export function setClipFx(id, patch, key) {
  updateClip(id, c => ({ fx: { ...(c.fx || {}), ...patch } }), key && 'fx' + key + id);
}
export function setAudioFx(id, patch, key) {
  updateAudio(id, c => ({ fx: { ...(c.fx || {}), ...patch } }), key && 'afx' + key + id);
}
// Los mismos ajustes (sin los fundidos, que son de cada clip) en todos los clips del vídeo
export function applyFxToAllClips(fx) {
  const { fadeIn, fadeOut, duck, ...rest } = fx || {};
  update(p => { for (const c of p.clips) c.fx = { ...(c.fx || {}), ...rest }; });
  toast('Ajustes de audio aplicados a todos los clips');
}

// Copia del clip justo detrás del original, o en la posición "toIndex" (Alt + arrastrar)
export function duplicateClip(id, toIndex) {
  const nid = uid('c');
  update(p => {
    const i = p.clips.findIndex(c => c.id === id);
    if (i < 0) return;
    p.clips.splice(clamp(toIndex ?? i + 1, 0, p.clips.length), 0, { ...structuredClone(p.clips[i]), id: nid, transition: null });
  });
  setUI({ sel: { type: 'clip', id: nid } });
  player.seek(timeBus.t);
  return nid;
}

// Sin "patch", la copia va justo detrás del original
export function duplicateOverlay(id, patch, key) {
  const nid = uid('o');
  update(p => {
    const o = p.overlays.find(x => x.id === id);
    if (o) p.overlays.push({ ...structuredClone(o), id: nid, ...(patch || { start: o.start + o.dur }) });
  }, { key });
  setUI({ sel: { type: 'overlay', id: nid } });
  return nid;
}

export function duplicateAudio(id, patch, key) {
  const nid = uid('au');
  update(p => {
    const a = (p.audio || []).find(x => x.id === id);
    if (a) p.audio.push({ ...structuredClone(a), id: nid, ...(patch || { start: a.start + (a.out - a.in) }) });
  }, { key });
  setUI({ sel: { type: 'audio', id: nid } });
  player.resyncAudio();
  return nid;
}

// Ctrl/Cmd + D: duplica lo seleccionado justo a continuación
export function duplicateSelection() {
  const sel = state.ui.sel;
  if (!sel) return toast('Selecciona un clip, motion o audio para duplicarlo', 'err');
  if (sel.type === 'clip') duplicateClip(sel.id);
  else if (sel.type === 'overlay') duplicateOverlay(sel.id);
  else if (sel.type === 'audio') duplicateAudio(sel.id);
  else toast('Los bloques de subtítulos no se duplican: usa "Nuevo bloque" en Texto', 'err');
}

// Ctrl/Cmd + C / V: copia lo seleccionado y lo pega en el cursor
let clipboard = null;
export function copySelection() {
  const sel = state.ui.sel, p = P();
  const src = !sel ? null : sel.type === 'clip' ? p.clips.find(c => c.id === sel.id)
    : sel.type === 'overlay' ? p.overlays.find(o => o.id === sel.id)
    : sel.type === 'audio' ? (p.audio || []).find(a => a.id === sel.id) : null;
  if (!src) return false;
  clipboard = { type: sel.type, item: structuredClone(src) };
  toast('Copiado. Pega con Ctrl+V en la posición del cursor', 'ok', 2500);
  return true;
}
export function pasteClipboard() {
  if (!clipboard) return false;
  const { type, item } = clipboard, t = timeBus.t;
  if (type === 'clip') {
    if (!assetById(item.assetId)) return false;
    const nid = uid('c');
    update(p => {
      // en un borde se inserta ahí; en mitad de un clip, se corta y la copia queda en el cursor
      const lay = TL.layoutClips(p.clips);
      let idx = lay.findIndex(l => t < l.end - 0.15);
      if (idx < 0) idx = lay.length;
      else if (t > lay[idx].start + 0.15 && TL.splitAt(p, t)) idx++;
      p.clips.splice(idx, 0, { ...structuredClone(item), id: nid, transition: null });
    });
    setUI({ sel: { type: 'clip', id: nid } });
    player.seek(t);
  } else if (type === 'overlay') {
    const nid = uid('o');
    update(p => { p.overlays.push({ ...structuredClone(item), id: nid, start: t }); });
    setUI({ sel: { type: 'overlay', id: nid } });
  } else if (type === 'audio') {
    if (!assetById(item.assetId)) return false;
    const nid = uid('au');
    update(p => { (p.audio = p.audio || []).push({ ...structuredClone(item), id: nid, start: t }); });
    setUI({ sel: { type: 'audio', id: nid } });
    player.resyncAudio();
  }
  return true;
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
  const todo = p.assets.filter(a => a.kind === 'video' && a.hasAudio !== false && p.clips.some(c => c.assetId === a.id || c.dual?.assetId === a.id) && (force || !p.transcripts[a.id]));
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
      // términos en inglés y nombres propios (glosario)
      const { applyGlossary } = await import('../ai/glossary.js');
      const fixed = applyGlossary(words);
      update(pp => { pp.transcripts[a.id] = { lang, model, words, glossary: fixed }; });
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

// Vuelve a pasar el glosario por todas las transcripciones
export async function runGlossary() {
  const { applyGlossary } = await import('../ai/glossary.js');
  let n = 0;
  update(p => { for (const tr of Object.values(p.transcripts)) n += applyGlossary(tr.words); });
  toast(n ? `${n} término${n > 1 ? 's' : ''} corregido${n > 1 ? 's' : ''}` : 'No había nada que corregir');
  return n;
}

// ---------- Imágenes libres (pestaña Texto) ----------
export function addImageOverlay(assetId) {
  const total = player.duration || 10, t = timeBus.t;
  const o = { id: uid('o'), type: 'imagen', start: Math.min(t, Math.max(0, total - 0.5)), dur: Math.min(4, Math.max(0.5, total - t)), x: 0.5, y: 0.4, scale: 1, rot: 0, props: { ...structuredClone(MOTIONS.imagen.props), assetId }, animIn: 'pop', animOut: 'fade', behind: false };
  update(p => p.overlays.push(o));
  setUI({ sel: { type: 'overlay', id: o.id } });
  player.seek(o.start + 0.3);
}
export async function importImageOverlays(files) {
  for (const file of [...files]) {
    if (fileKind(file) !== 'image') { toast(`${file.name} no es una imagen`, 'err'); continue; }
    try {
      const { asset, url } = await probeFile(file);
      runtime.assets.set(asset.id, { file, url, kind: 'image', handle: null, thumbs: [], audio: null, status: 'analyzing' });
      update(p => { p.assets.push(asset); });
      analyzeAsset(asset);
      addImageOverlay(asset.id);
      const PF = await import('./projectFolder.js');
      if (PF.folderActive()) {
        const raw = await PF.copyRaw(asset, file).catch(() => null);
        if (raw) update(pp => { const a = pp.assets.find(x => x.id === asset.id); if (a) a.raw = raw; }, { history: false });
      }
    } catch (e) { console.error(e); toast(`No se pudo abrir ${file.name}`, 'err'); }
  }
}

// ---------- Bloques de subtítulos: editar texto, mover palabras, bloques nuevos ----------
const normKey = (s) => String(s).toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
const groupsNow = () => captionGroups(P(), projectVersion);

// Fija un bloque exacto: la primera palabra abre bloque y el resto se queda unido (aunque supere el nº de palabras).
function pinBlock(words, gs) {
  words.forEach((w, i) => { w.br = i === 0 ? true : false; if (i === 0) delete w.nl; delete w.gs; });
  if (words[0] && gs) words[0].gs = gs;
}
function wordIndex(p) {
  const m = new Map();
  for (const tr of Object.values(p.transcripts)) for (const w of tr.words) m.set(w.id, { w, tr });
  return m;
}

/**
 * Texto editado en el reproductor (doble clic) → palabras del bloque.
 * Las palabras que no cambian conservan sus tiempos; las nuevas se reparten el tiempo de la anterior;
 * las borradas solo desaparecen del subtítulo (el vídeo no se corta). Intro = salto de línea.
 */
export function editBlockText(groupId, text) {
  const groups = groupsNow();
  const gi = groups.findIndex(g => g.id === groupId);
  if (gi < 0) return;
  const g = groups[gi], next = groups[gi + 1];
  const toks = [];
  let nl = false;
  for (const part of String(text).replace(/\r/g, '').split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) { if (part.includes('\n') && toks.length) nl = true; continue; }
    toks.push({ text: part, nl }); nl = false;
  }
  const ids = g.items.map(x => x.w.id);
  update(p => {
    const idx = wordIndex(p);
    const olds = ids.map(id => idx.get(id)).filter(Boolean);
    if (!olds.length) return;
    const gs = olds.find(o => o.w.gs)?.w.gs;
    // alineación (LCS) entre lo que había y lo escrito
    const A = olds.map(o => normKey(o.w.text)), B = toks.map(t => normKey(t.text));
    const n = A.length, m = B.length;
    const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] && A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const order = []; // palabras finales en orden
    const extra = new Map(); // ancla → palabras nuevas detrás de ella
    let head = [];      // palabras nuevas antes de la primera conservada
    let anchor = null, runO = [], runT = [];
    const set = (o, t) => { o.w.text = t.text; if (t.nl) o.w.nl = true; else delete o.w.nl; delete o.w.del; order.push(o); anchor = o; };
    const flush = () => {
      const k = Math.min(runO.length, runT.length);
      for (let q = 0; q < k; q++) set(olds[runO[q]], toks[runT[q]]);
      for (let q = k; q < runO.length; q++) { olds[runO[q]].w.del = true; delete olds[runO[q]].w.gs; }
      for (let q = k; q < runT.length; q++) {
        const t = toks[runT[q]];
        const nw = { id: uid('w'), text: t.text, start: 0, end: 0, hl: 0, ...(t.nl ? { nl: true } : {}) };
        if (anchor) { if (!extra.has(anchor)) extra.set(anchor, []); extra.get(anchor).push(nw); } else head.push(nw);
      }
      runO = []; runT = [];
    };
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && A[i] && A[i] === B[j]) { flush(); set(olds[i++], toks[j++]); }
      else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) runT.push(j++);
      else runO.push(i++);
    }
    flush();
    // Colocar las palabras nuevas: se reparten el tiempo de su ancla
    const place = (o, list, before) => {
      const w = o.w, s = w.start, e = Math.max(w.end, s + 0.12 * (list.length + 1));
      const d = (e - s) / (list.length + 1);
      const k0 = o.tr.words.indexOf(w);
      if (before) {
        list.forEach((nw, q) => { nw.start = s + d * q; nw.end = s + d * (q + 1); });
        w.start = s + d * list.length; w.end = e;
        o.tr.words.splice(k0, 0, ...list);
      } else {
        w.end = s + d;
        list.forEach((nw, q) => { nw.start = s + d * (q + 1); nw.end = s + d * (q + 2); });
        o.tr.words.splice(k0 + 1, 0, ...list);
      }
    };
    for (const [o, list] of extra) place(o, list, false);
    let final = order.flatMap(o => [o.w, ...(extra.get(o) || [])]);
    if (head.length) {
      if (order[0]) { place(order[0], head, true); final = [...head, ...final]; }
      else {
        // se ha reescrito todo con palabras nuevas: ocupan el tiempo del bloque original
        const o0 = olds[0], s = g.items[0].w.start, e = Math.max(olds[olds.length - 1].w.end, s + 0.12 * head.length);
        const d = (e - s) / head.length;
        head.forEach((nw, q) => { nw.start = s + d * q; nw.end = s + d * (q + 1); });
        o0.tr.words.splice(o0.tr.words.indexOf(o0.w), 0, ...head);
        final = head;
      }
    }
    if (final.length) pinBlock(final, gs);
    if (next) { const nx = idx.get(next.id); if (nx) nx.w.br = true; }
  });
}

// Arrastrar una palabra a otro bloque contiguo (anterior o siguiente)
export function moveWordToBlock(wordId, targetId) {
  const groups = groupsNow();
  const gi = groups.findIndex(g => g.items.some(x => x.w.id === wordId));
  const ti = groups.findIndex(g => g.id === targetId);
  if (gi < 0 || ti < 0 || gi === ti) return false;
  if (Math.abs(gi - ti) !== 1) { toast('Solo se pueden mover palabras al bloque de al lado', 'err'); return false; }
  const src = groups[gi], dst = groups[ti];
  const k = src.items.findIndex(x => x.w.id === wordId);
  const idsOf = (arr) => arr.map(x => x.w.id);
  const lo = Math.min(gi, ti), hi = Math.max(gi, ti);
  let first, second;
  if (ti < gi) { first = [...idsOf(dst.items), ...idsOf(src.items.slice(0, k + 1))]; second = idsOf(src.items.slice(k + 1)); }
  else { first = idsOf(src.items.slice(0, k)); second = [...idsOf(src.items.slice(k)), ...idsOf(dst.items)]; }
  const after = groups[hi + 1];
  update(p => {
    const idx = wordIndex(p);
    const gsLo = groups[lo].ov, gsHi = groups[hi].ov;
    const get = (ids) => ids.map(id => idx.get(id)?.w).filter(Boolean);
    const a = get(first), b = get(second);
    if (a.length) pinBlock(a, gsLo);
    if (b.length) pinBlock(b, gsHi);
    if (after) { const x = idx.get(after.id); if (x) x.w.br = true; }
  });
  return true;
}

// Bloque nuevo en el cursor: si hay voz, divide el bloque ahí; si es un hueco, crea un texto nuevo
export function newBlockAtPlayhead(text = 'Texto nuevo') {
  const t = timeBus.t;
  const groups = groupsNow();
  const g = groups.find(x => t >= x.start && t < x.end);
  if (g) {
    const it = g.items.find(x => t < x.te) || g.items[g.items.length - 1];
    if (it && it !== g.items[0]) { splitBefore(it.w.id); setUI({ sel: { type: 'group', id: it.w.id } }); toast('Bloque dividido en el cursor'); return; }
  }
  const p = P();
  const hit = TL.clipAt(p, t);
  if (!hit) return;
  const nextG = groups.find(x => x.start > t + 0.01);
  const dur = Math.max(0.4, Math.min(1.6, (nextG ? nextG.start : t + 1.6) - t));
  const toks = text.split(/\s+/).filter(Boolean);
  const sp = hit.clip.speed || 1;
  const s0 = hit.src, s1 = Math.min(hit.clip.out, s0 + dur * sp);
  const ws = toks.map((tx, i) => ({ id: uid('w'), text: tx, start: s0 + (s1 - s0) * i / toks.length, end: s0 + (s1 - s0) * (i + 1) / toks.length, hl: 0, br: i === 0 ? true : false }));
  update(pp => {
    const aid = hit.clip.assetId;
    const tr = pp.transcripts[aid] || (pp.transcripts[aid] = { lang: 'manual', model: 'manual', words: [] });
    let k = tr.words.findIndex(w => w.start >= s0);
    if (k < 0) k = tr.words.length;
    tr.words.splice(k, 0, ...ws);
    const after = tr.words[k + ws.length];
    if (after) after.br = true;
    pp.captions.enabled = true;
  });
  setUI({ sel: { type: 'group', id: ws[0].id }, editCap: ws[0].id });
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
// Analiza (o recupera de la caché) la posición de la cara en los vídeos de la línea de tiempo
export async function ensureFaceTracks(only = null) {
  const p = P();
  const assets = p.assets.filter(a => a.kind === 'video' && p.clips.some(c => c.assetId === a.id) && (!only || only.includes(a.id)));
  if (!assets.length) return [];
  const { analyzeFaces } = await import('../ai/reframe.js');
  for (const a of assets) {
    if (state.project.faceTracks?.[a.id]) continue;
    const rt = runtime.assets.get(a.id);
    if (!rt) continue;
    const b = { title: 'Buscando la cara', text: `Analizando ${a.name}…`, progress: 0 };
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
  busy(null);
  return assets;
}

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

export function overlayZ(id, dir) {
  update(p => {
    const i = p.overlays.findIndex(o => o.id === id);
    if (i < 0) return;
    const [o] = p.overlays.splice(i, 1);
    p.overlays.splice(clamp(i + dir, 0, p.overlays.length), 0, o);
  });
}
