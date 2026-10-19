// Carpeta de proyecto en el disco (como DaVinci / Premiere):
//   <Proyecto>/proyecto.tbsedit      ← proyecto (autoguardado)
//   <Proyecto>/Brutos/                ← copia de los vídeos originales
//   <Proyecto>/Versiones/             ← copias de seguridad con fecha
//   <Proyecto>/Exportaciones/         ← MP4 y SRT exportados
//   <Proyecto>/Miniaturas/            ← portadas y capturas
import { debounce } from '../lib.js';
import { state, runtime, emit, onProjectChange, toast, busy, resetHistory, touchProject, setUI } from './store.js';
import { idbGet, idbPut } from './persist.js';

const PROJECT_FILE = 'proyecto.tbsedit';
const SUBDIRS = ['Brutos', 'Versiones', 'Exportaciones', 'Miniaturas'];
let dir = null;
let lastVersionAt = 0;
let dirty = false;

export const folderState = { name: null, status: 'off', savedAt: null, copyRaw: true }; // status: off | saving | saved | error
const set = (patch) => { Object.assign(folderState, patch); emit(); };
export const hasFolderAPI = () => 'showDirectoryPicker' in window;
export const folderActive = () => !!dir;

async function sub(name) { return dir.getDirectoryHandle(name, { create: true }); }
async function exists(d, name) { try { await d.getFileHandle(name); return true; } catch { return false; } }

async function writeFile(d, name, data) {
  const fh = await d.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  if (data instanceof Blob && data.stream) await data.stream().pipeTo(w);
  else { await w.write(data); await w.close(); }
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function projectJSON() {
  return JSON.stringify({ app: 'Editor TBS', v: 1, savedAt: Date.now(), project: state.project }, null, 1);
}

// ---------- Guardado ----------
export async function saveNow() {
  if (!dir) return;
  try {
    set({ status: 'saving' });
    await writeFile(dir, PROJECT_FILE, projectJSON());
    dirty = false;
    set({ status: 'saved', savedAt: Date.now() });
    if (Date.now() - lastVersionAt > 5 * 60 * 1000) await saveVersion(true);
  } catch (e) { console.warn(e); set({ status: 'error' }); }
}
const autosave = debounce(saveNow, 1500);
onProjectChange(() => { if (dir) { dirty = true; set({ status: 'saving' }); autosave(); } });

export async function saveVersion(auto = false) {
  if (!dir) return false;
  const v = await sub('Versiones');
  await writeFile(v, `${stamp()}${auto ? '_auto' : ''}.tbsedit`, projectJSON());
  lastVersionAt = Date.now();
  // conservar las 40 más recientes
  const list = await listVersions();
  for (const f of list.slice(40)) { try { await v.removeEntry(f.name); } catch {} }
  if (!auto) toast('Versión guardada');
  return true;
}

export async function listVersions() {
  if (!dir) return [];
  const v = await sub('Versiones');
  const out = [];
  for await (const [name, h] of v.entries()) if (h.kind === 'file' && name.endsWith('.tbsedit')) out.push({ name });
  return out.sort((a, b) => b.name.localeCompare(a.name));
}

export async function restoreVersion(name) {
  const v = await sub('Versiones');
  const txt = await (await (await v.getFileHandle(name)).getFile()).text();
  const data = JSON.parse(txt);
  await saveVersion(true); // copia de seguridad del estado actual antes de restaurar
  state.project = data.project;
  resetHistory();
  await attachMissing();
  touchProject();
  toast('Versión restaurada');
}

// ---------- Brutos ----------
export async function copyRaw(asset, file) {
  if (!dir || !folderState.copyRaw) return null;
  const b = await sub('Brutos');
  let name = file.name;
  if (await exists(b, name)) {
    const f = await (await b.getFileHandle(name)).getFile();
    if (f.size === file.size) return 'Brutos/' + name; // ya está copiado
    const dot = name.lastIndexOf('.');
    name = `${name.slice(0, dot)}_${Date.now().toString(36)}${name.slice(dot)}`;
  }
  busy({ title: 'Guardando bruto', text: `Copiando ${file.name} a la carpeta del proyecto…`, progress: null });
  try { await writeFile(b, name, file); } finally { busy(null); }
  return 'Brutos/' + name;
}

async function fileFromPath(path) {
  const parts = path.split('/');
  let d = dir;
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
  const h = await d.getFileHandle(parts[parts.length - 1]);
  return { file: await h.getFile(), handle: h };
}

async function attachMissing() {
  const { analyzeAsset } = await import('./actions.js');
  const missing = [];
  for (const a of state.project.assets) {
    if (runtime.assets.get(a.id)) continue;
    try {
      const { file, handle } = await fileFromPath(a.raw || ('Brutos/' + a.name));
      runtime.assets.set(a.id, { file, url: URL.createObjectURL(file), kind: a.kind, handle, thumbs: [], audio: null, status: 'analyzing' });
      analyzeAsset(a);
    } catch { missing.push(a); }
  }
  return missing;
}

// ---------- Abrir / crear ----------
async function adopt(handle) {
  dir = handle;
  for (const s of SUBDIRS) await sub(s);
  await idbPut('lastFolder', handle);
  set({ name: handle.name, status: 'saved' });
}

/** Guarda el proyecto actual en una carpeta nueva (y copia sus brutos). */
export async function saveAsFolder() {
  if (!hasFolderAPI()) { toast('Tu navegador no permite carpetas de proyecto. Usa Google Chrome.', 'err'); return; }
  let h;
  try { h = await window.showDirectoryPicker({ id: 'tbs-proyectos', mode: 'readwrite', startIn: 'documents' }); } catch (e) { return; }
  await adopt(h);
  for (const a of state.project.assets) {
    const rt = runtime.assets.get(a.id);
    if (rt?.file && !a.raw) { const raw = await copyRaw(a, rt.file); if (raw) a.raw = raw; }
  }
  await saveNow();
  await saveVersion(true);
  toast(`Proyecto guardado en la carpeta “${h.name}”`);
}

/** Abre un proyecto desde su carpeta. */
export async function openFolder(handle) {
  if (!handle) {
    if (!hasFolderAPI()) { toast('Tu navegador no permite carpetas de proyecto. Usa Google Chrome.', 'err'); return; }
    try { handle = await window.showDirectoryPicker({ id: 'tbs-proyectos', mode: 'readwrite', startIn: 'documents' }); } catch { return; }
  }
  let txt;
  try { txt = await (await (await handle.getFileHandle(PROJECT_FILE)).getFile()).text(); }
  catch { toast('Esa carpeta no tiene ningún proyecto del Editor TBS', 'err'); return; }
  const data = JSON.parse(txt);
  for (const rt of runtime.assets.values()) { try { URL.revokeObjectURL(rt.url); } catch {} }
  runtime.assets.clear();
  await adopt(handle);
  state.project = data.project;
  resetHistory();
  setUI({ restore: null, sel: null });
  const missing = await attachMissing();
  touchProject();
  const { player } = await import('../engine/player.js');
  player.seek(0);
  if (missing.length) toast(`Faltan ${missing.length} bruto(s) en la carpeta Brutos`, 'err', 5000);
  else toast(`Proyecto “${handle.name}” abierto`);
}

export async function lastFolder() {
  const h = await idbGet('lastFolder');
  return h || null;
}

export async function reopenLast(h) {
  try {
    let perm = await h.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') perm = await h.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') { toast('Sin permiso para abrir la carpeta', 'err'); return false; }
    await openFolder(h);
    return true;
  } catch (e) { console.warn(e); toast('No se pudo abrir la carpeta: ' + e.message, 'err'); return false; }
}

export function closeFolder() { dir = null; set({ name: null, status: 'off' }); }

// Guardar archivos generados en la carpeta del proyecto
export async function saveToFolder(subdir, name, blob) {
  if (!dir) return false;
  try { await writeFile(await sub(subdir), name, blob); return true; } catch (e) { console.warn(e); return false; }
}

window.addEventListener('beforeunload', (e) => { if (dir && dirty) { saveNow(); e.preventDefault(); e.returnValue = ''; } });
