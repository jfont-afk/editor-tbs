// Proyectos en la nube por cuenta (versión web en Cloudflare con inicio de sesión).
// Se guarda el proyecto (cortes, subtítulos, motions, color…), no los vídeos: esos siguen en el ordenador.
// En local (Abrir Editor.bat) no hay cuenta y todo funciona como antes.
import { uid, debounce } from '../lib.js';
import { state, emit, toast, onProjectChange, setUI, resetHistory, touchProject, runtime } from './store.js';
import { idbGet, idbPut, setDbScope } from './persist.js';

export const cloud = { on: false, user: null, projects: null, loading: false, status: 'off', savedAt: null };
const set = (patch) => { Object.assign(cloud, patch); emit(); };
let base = 0;           // updated_at del servidor cuando se abrió/guardó (detecta guardados desde otro sitio)
let lastThumbAt = 0;
let warned = false;

async function api(path, opts = {}) {
  const r = await fetch(path, {
    method: opts.method || 'GET', credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined, keepalive: !!opts.keepalive,
  });
  let d = {};
  try { d = await r.json(); } catch {}
  if (!r.ok) throw Object.assign(new Error(d.error || 'Error ' + r.status), { status: r.status, data: d });
  return d;
}

export async function initCloud() {
  try {
    const r = await fetch('/api/me', { credentials: 'same-origin', headers: { accept: 'application/json' } });
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) cloud.user = await r.json();
  } catch {}
  if (!cloud.user) return;
  cloud.on = true;
  // cada cuenta tiene su propio guardado en este navegador (dos personas en el mismo ordenador no se mezclan)
  setDbScope(cloud.user.id);
  onProjectChange(() => { if (worthSaving()) { set({ status: 'pending' }); autosave(); } });
  window.addEventListener('pagehide', () => { if (cloud.status === 'pending') save({ keepalive: true }); });
  refresh();
}

const worthSaving = () => cloud.on && (state.project.clips.length > 0 || state.project.assets.length > 0);
const autosave = debounce(() => save(), 3000);

function meta(p) {
  const dur = (p.clips || []).reduce((s, c) => s + Math.max(0, (c.out - c.in) / (c.speed || 1)), 0);
  return { format: p.format?.label || '9:16', dur, clips: (p.clips || []).length };
}
async function thumb() {
  if (Date.now() - lastThumbAt < 60e3) return null;
  try {
    const { player } = await import('../engine/player.js');
    const src = player.canvas;
    if (!src || !state.project.clips.length) return null;
    const w = 240, h = Math.round(w * src.height / src.width);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(src, 0, 0, w, h);
    lastThumbAt = Date.now();
    return c.toDataURL('image/jpeg', 0.75);
  } catch { return null; }
}

export async function save({ keepalive = false } = {}) {
  if (!worthSaving()) return;
  const p = state.project;
  if (!p.cloudId) p.cloudId = uid('p');
  set({ status: 'saving' });
  // los archivos de este ordenador se recuerdan para volver a abrir el proyecto sin buscarlos
  const handles = {};
  for (const a of p.assets) { const h = runtime.assets.get(a.id)?.handle; if (h) handles[a.id] = h; }
  idbPut('handles:' + p.cloudId, handles);
  try {
    const d = await api('/api/projects/' + p.cloudId, { method: 'PUT', keepalive, body: { title: p.name, meta: meta(p), thumb: keepalive ? null : await thumb(), project: p, base } });
    base = d.updated_at;
    set({ status: 'saved', savedAt: Date.now() });
  } catch (e) {
    if (e.status === 409) {
      // se ha guardado desde otro ordenador o pestaña: este se guarda como copia para no pisar nada
      p.cloudId = uid('p'); p.name = p.name + ' (copia)'; base = 0;
      toast('Este proyecto se había cambiado en otro sitio: lo guardo como copia', 'err', 6000);
      touchProject();
      return;
    }
    set({ status: 'error' });
    if (e.status === 401) { toast('Tu sesión ha caducado. Vuelve a entrar para guardar.', 'err', 8000); return; }
    if (!warned || e.status === 413) { warned = true; toast('No se pudo guardar en la nube: ' + e.message, 'err', 6000); }
  }
}

export async function refresh() {
  if (!cloud.on) return;
  set({ loading: true });
  try { const d = await api('/api/projects'); set({ projects: d.projects, loading: false }); }
  catch (e) { set({ loading: false }); if (e.status === 401) location.href = '/login'; }
}

function clearRuntime() {
  for (const rt of runtime.assets.values()) { try { URL.revokeObjectURL(rt.url); } catch {} }
  runtime.assets.clear();
}

export async function openCloudProject(info) {
  if (cloud.status === 'pending') await save();
  let d;
  try { d = await api('/api/projects/' + info.id); } catch (e) { toast('No se pudo abrir: ' + e.message, 'err'); return; }
  const PF = await import('./projectFolder.js');
  if (PF.folderActive()) { await PF.saveNow(); PF.closeFolder(); }
  clearRuntime();
  const project = d.project;
  project.cloudId = d.id;
  base = d.updated_at;
  lastThumbAt = 0;
  const handles = (await idbGet('handles:' + d.id)) || {};
  const { restoreProject } = await import('./persist.js');
  await restoreProject({ project, handles, savedAt: d.updated_at });
  setUI({ home: false, sel: null });
  set({ status: 'saved', savedAt: d.updated_at });
}

export async function newCloudProject(title) {
  if (cloud.status === 'pending') await save();
  const PF = await import('./projectFolder.js');
  if (PF.folderActive()) { await PF.saveNow(); PF.closeFolder(); }
  const { newProject } = await import('./store.js');
  clearRuntime();
  state.project = newProject();
  state.project.name = title || 'Proyecto nuevo';
  state.project.cloudId = uid('p');
  base = 0; lastThumbAt = 0;
  resetHistory();
  const P = await import('./persist.js');
  await P.enableAutosave();
  touchProject();
  setUI({ home: false, restore: null, homeAuto: null, sel: null, tab: 'media' });
  const { player } = await import('../engine/player.js');
  player.seek(0);
}

export async function renameCloudProject(info, title) {
  try {
    await api('/api/projects/' + info.id, { method: 'PATCH', body: { title } });
    if (state.project.cloudId === info.id) { state.project.name = title; touchProject(); }
  } catch (e) { toast('No se pudo renombrar: ' + e.message, 'err'); }
  refresh();
}

export async function deleteCloudProject(info) {
  try {
    await api('/api/projects/' + info.id, { method: 'DELETE' });
    // el proyecto abierto deja de estar vinculado (si se sigue editando, se guarda como uno nuevo)
    if (state.project.cloudId === info.id) { state.project.cloudId = null; base = 0; }
    toast(`“${info.title}” eliminado de la nube`);
  } catch (e) { toast('No se pudo eliminar: ' + e.message, 'err'); }
  refresh();
}
