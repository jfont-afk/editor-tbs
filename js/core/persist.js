import { debounce } from '../lib.js';
import { state, runtime, onProjectChange, setUI, emit, resetHistory, toast, touchProject } from './store.js';
import { analyzeAsset } from './actions.js';
import { fingerprint } from '../media/assets.js';
import { player } from '../engine/player.js';

const DB = 'tbs-editor', STORE = 'kv';
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function idbPut(key, val) { try { await put(key, val); } catch (e) { console.warn(e); } }
export async function idbGet(key) { try { return await get(key); } catch { return undefined; } }
async function put(key, val) {
  const d = await db();
  return new Promise((res, rej) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
async function get(key) {
  const d = await db();
  return new Promise((res, rej) => { const tx = d.transaction(STORE, 'readonly'); const r = tx.objectStore(STORE).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

let ready = false;
const save = debounce(async () => {
  if (!ready) return;
  try {
    const p = state.project;
    const handles = {};
    for (const a of p.assets) { const h = runtime.assets.get(a.id)?.handle; if (h) handles[a.id] = h; }
    const { folderActive } = await import('./projectFolder.js');
    await put('project', { json: JSON.stringify(p), handles, savedAt: Date.now(), folder: folderActive() });
  } catch (e) { console.warn('autoguardado', e); }
}, 1200);

// Al arrancar se muestra la pantalla de proyectos; el autoguardado del navegador aparece ahí como
// "último proyecto" y no se sobrescribe hasta que se elige qué abrir.
export async function initPersistence() {
  onProjectChange(save);
  let auto = null;
  try {
    for (const key of ['project', 'project_unsaved']) {
      const saved = await get(key);
      if (!saved?.json) continue;
      const p = JSON.parse(saved.json);
      if (p.assets?.length && !state.project.assets.length && !saved.folder) { auto = { project: p, handles: saved.handles || {}, savedAt: saved.savedAt }; break; }
    }
  } catch (e) { console.warn(e); }
  const lastFolder = await get('lastFolder').catch(() => null);
  setUI({ home: true, homeAuto: auto, homeLastFolder: lastFolder || null });
  if (!auto) ready = true;
}
// Antes de empezar a autoguardar otro proyecto, el último sin carpeta se aparta para no perderlo
export async function enableAutosave() {
  if (!ready && state.ui.homeAuto) {
    const a = state.ui.homeAuto;
    try { await put('project_unsaved', { json: JSON.stringify(a.project), handles: a.handles || {}, savedAt: a.savedAt }); } catch (e) { console.warn(e); }
  }
  ready = true;
}

export async function discardRestore() {
  setUI({ restore: null, home: false });
  await enableAutosave();
  save();
}

async function attach(asset, file, handle) {
  const url = URL.createObjectURL(file);
  runtime.assets.set(asset.id, { file, url, kind: asset.kind, handle: handle || null, thumbs: [], audio: null, status: 'analyzing' });
  analyzeAsset(asset);
}

export async function restoreProject(r = state.ui.restore || state.ui.homeAuto) {
  if (!r) return;
  setUI({ home: false });
  state.project = r.project;
  resetHistory();
  const missing = [];
  for (const a of r.project.assets) {
    const h = r.handles[a.id];
    let ok = false;
    if (h) {
      try {
        let perm = await h.queryPermission({ mode: 'read' });
        if (perm !== 'granted') perm = await h.requestPermission({ mode: 'read' });
        if (perm === 'granted') { await attach(a, await h.getFile(), h); ok = true; }
      } catch (e) { console.warn(e); }
    }
    if (!ok) missing.push(a);
  }
  setUI({ restore: missing.length ? { ...r, missing } : null });
  ready = true;
  touchProject();
  player.seek(0);
  if (!missing.length) toast('Proyecto recuperado');
}

// Volver a vincular archivos que no se pudieron abrir (se emparejan por nombre y tamaño)
export async function relinkFiles(files, handles = []) {
  const r = state.ui.restore;
  const list = [...files];
  let n = 0;
  for (const a of state.project.assets) {
    if (runtime.assets.get(a.id)) continue;
    const i = list.findIndex(f => fingerprint({ name: f.name, size: f.size, lastModified: f.lastModified }) === fingerprint(a)) >= 0
      ? list.findIndex(f => fingerprint({ name: f.name, size: f.size, lastModified: f.lastModified }) === fingerprint(a))
      : list.findIndex(f => f.name === a.name && f.size === a.size);
    if (i >= 0) { await attach(a, list[i], handles[i]); n++; }
  }
  const still = state.project.assets.filter(a => !runtime.assets.get(a.id));
  setUI({ restore: still.length ? { ...r, missing: still } : null });
  touchProject();
  player.seek(0);
  toast(still.length ? `Faltan ${still.length} archivo(s)` : 'Archivos vinculados');
  emit();
}
