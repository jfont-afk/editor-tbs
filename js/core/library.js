// Biblioteca de proyectos (pantalla de inicio, como en Premiere / DaVinci / CapCut).
// Todos los proyectos viven en una carpeta del ordenador que elige el usuario ("Proyectos TBS"):
//   Proyectos TBS/<Proyecto>/proyecto.tbsedit · portada.jpg · Brutos/ · Versiones/ · Exportaciones/ · Miniaturas/
// Para pasar un proyecto a otra persona se comparte un .zip con el proyecto y sus brutos.
import { state, runtime, emit, toast, busy, resetHistory, touchProject, setUI } from './store.js';
import { idbGet, idbPut } from './persist.js';
import * as PF from './projectFolder.js';

const PROJECT_FILE = 'proyecto.tbsedit';
const FFLATE = 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js';

export const lib = { ws: null, perm: 'none', projects: null, loading: false }; // perm: none | prompt | granted
const set = (patch) => { Object.assign(lib, patch); emit(); };

export async function initLibrary() {
  const ws = await idbGet('workspace');
  if (!ws) { set({ ws: null, perm: 'none', projects: [] }); return; }
  let perm = 'prompt';
  try { perm = await ws.queryPermission({ mode: 'readwrite' }); } catch {}
  set({ ws, perm: perm === 'granted' ? 'granted' : 'prompt' });
  if (perm === 'granted') await refresh();
}

// Pedir permiso (necesita un clic del usuario)
export async function grantAccess() {
  if (!lib.ws) return;
  try {
    const perm = await lib.ws.requestPermission({ mode: 'readwrite' });
    set({ perm: perm === 'granted' ? 'granted' : 'prompt' });
    if (perm === 'granted') await refresh();
  } catch (e) { toast('No se pudo acceder a la carpeta: ' + e.message, 'err'); }
}

export async function chooseWorkspace() {
  if (!PF.hasFolderAPI()) { toast('Tu navegador no permite carpetas. Usa Google Chrome.', 'err'); return; }
  let h;
  try { h = await window.showDirectoryPicker({ id: 'tbs-workspace', mode: 'readwrite', startIn: 'documents' }); } catch { return; }
  await idbPut('workspace', h);
  set({ ws: h, perm: 'granted' });
  await refresh();
  toast(`Tus proyectos se guardarán en “${h.name}”`);
}

async function readProject(dirHandle) {
  try {
    const f = await (await dirHandle.getFileHandle(PROJECT_FILE)).getFile();
    const data = JSON.parse(await f.text());
    const p = data.project || {};
    let thumb = null;
    try { thumb = URL.createObjectURL(await (await dirHandle.getFileHandle('portada.jpg')).getFile()); } catch {}
    const dur = (p.clips || []).reduce((s, c) => s + Math.max(0, (c.out - c.in) / (c.speed || 1)), 0);
    return { name: dirHandle.name, title: p.name || dirHandle.name, handle: dirHandle, savedAt: data.savedAt || f.lastModified, dur, format: p.format?.label || '9:16', clips: (p.clips || []).length, thumb };
  } catch { return null; }
}

export async function refresh() {
  if (!lib.ws || lib.perm !== 'granted') return;
  set({ loading: true });
  for (const p of lib.projects || []) if (p.thumb) URL.revokeObjectURL(p.thumb);
  const out = [];
  try {
    for await (const [, h] of lib.ws.entries()) {
      if (h.kind !== 'directory') continue;
      const info = await readProject(h);
      if (info) out.push(info);
    }
  } catch (e) { console.warn(e); }
  out.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  set({ projects: out, loading: false });
}

async function uniqueName(base) {
  const clean = (base || 'Proyecto').replace(/[\\/:*?"<>|]+/g, '').trim() || 'Proyecto';
  let name = clean, i = 2;
  for (;;) {
    try { await lib.ws.getDirectoryHandle(name); name = `${clean} (${i++})`; } catch { return name; }
  }
}

// Proyecto nuevo en blanco dentro de la carpeta de proyectos
export async function createProject(title) {
  if (!lib.ws) { await chooseWorkspace(); if (!lib.ws) return; }
  const name = await uniqueName(title || 'Proyecto nuevo');
  const dir = await lib.ws.getDirectoryHandle(name, { create: true });
  const { newProject } = await import('./store.js');
  for (const rt of runtime.assets.values()) { try { URL.revokeObjectURL(rt.url); } catch {} }
  runtime.assets.clear();
  state.project = newProject();
  state.project.name = title || name;
  resetHistory();
  await PF.attachFolder(dir);
  await PF.saveNow();
  touchProject();
  setUI({ home: false, restore: null, sel: null, tab: 'media' });
  const { player } = await import('../engine/player.js');
  player.seek(0);
  refresh();
}

// Guarda el proyecto que está abierto (sin carpeta) dentro de la carpeta de proyectos
export async function saveCurrentToLibrary() {
  if (!lib.ws) { await chooseWorkspace(); if (!lib.ws) return; }
  const name = await uniqueName(state.project.name);
  const dir = await lib.ws.getDirectoryHandle(name, { create: true });
  await PF.attachFolder(dir);
  for (const a of state.project.assets) {
    const rt = runtime.assets.get(a.id);
    if (rt?.file && !a.raw) { const raw = await PF.copyRaw(a, rt.file); if (raw) a.raw = raw; }
  }
  await PF.saveNow();
  await PF.saveVersion(true);
  toast(`Proyecto guardado en “${lib.ws.name}/${name}”`);
  refresh();
}

export async function openProject(info) {
  await PF.openFolder(info.handle);
  setUI({ home: false });
}

export async function deleteProject(info) {
  try { await lib.ws.removeEntry(info.name, { recursive: true }); toast(`“${info.title}” eliminado`); }
  catch (e) { toast('No se pudo eliminar: ' + e.message, 'err'); }
  refresh();
}

async function copyDir(from, to) {
  for await (const [name, h] of from.entries()) {
    if (h.kind === 'directory') await copyDir(h, await to.getDirectoryHandle(name, { create: true }));
    else {
      const w = await (await to.getFileHandle(name, { create: true })).createWritable();
      await (await h.getFile()).stream().pipeTo(w);
    }
  }
}

export async function duplicateProject(info) {
  busy({ title: 'Duplicando proyecto', text: info.title, progress: null });
  try {
    const name = await uniqueName(info.title + ' copia');
    const to = await lib.ws.getDirectoryHandle(name, { create: true });
    await copyDir(info.handle, to);
    // cambiar el nombre dentro del archivo
    const fh = await to.getFileHandle(PROJECT_FILE);
    const data = JSON.parse(await (await fh.getFile()).text());
    data.project.name = name; data.savedAt = Date.now();
    const w = await fh.createWritable(); await w.write(JSON.stringify(data)); await w.close();
  } catch (e) { toast('No se pudo duplicar: ' + e.message, 'err'); }
  busy(null);
  refresh();
}

export async function renameProject(info, title) {
  try {
    const fh = await info.handle.getFileHandle(PROJECT_FILE);
    const data = JSON.parse(await (await fh.getFile()).text());
    data.project.name = title;
    const w = await fh.createWritable(); await w.write(JSON.stringify(data)); await w.close();
    if (PF.currentDir() && PF.currentDir().name === info.name) { state.project.name = title; touchProject(); }
  } catch (e) { toast('No se pudo renombrar: ' + e.message, 'err'); }
  refresh();
}

// ---------- Compartir: .zip con el proyecto y sus brutos ----------
async function* walk(d, prefix = '') {
  for await (const [name, h] of d.entries()) {
    if (h.kind === 'directory') { if (['Versiones', 'Exportaciones'].includes(name) && !prefix) continue; yield* walk(h, prefix + name + '/'); }
    else yield { path: prefix + name, handle: h };
  }
}

export async function exportZip(info) {
  if (!window.showSaveFilePicker) { toast('Tu navegador no permite guardar archivos. Usa Google Chrome.', 'err'); return; }
  let out;
  try { out = await window.showSaveFilePicker({ suggestedName: `${info.title}.tbsproyecto.zip`, types: [{ description: 'Proyecto del Editor TBS', accept: { 'application/zip': ['.zip'] } }] }); } catch { return; }
  // si es el proyecto abierto, primero se guarda todo (y se copian los brutos que falten)
  if (PF.currentDir() && PF.currentDir().name === info.name) {
    for (const a of state.project.assets) { const rt = runtime.assets.get(a.id); if (rt?.file && !a.raw) { const raw = await PF.copyRaw(a, rt.file); if (raw) a.raw = raw; } }
    await PF.saveNow();
  }
  const fflate = await import(FFLATE);
  const files = [];
  for await (const f of walk(info.handle)) files.push(f);
  const total = (await Promise.all(files.map(async f => (await f.handle.getFile()).size))).reduce((a, b) => a + b, 0) || 1;
  const w = await out.createWritable();
  let chain = Promise.resolve(), done = 0, err = null;
  const zip = new fflate.Zip((e, data) => { if (e) err = e; else chain = chain.then(() => w.write(data)); });
  const b = { title: 'Preparando el proyecto para compartir', text: info.title, progress: 0 };
  busy(b);
  try {
    for (const f of files) {
      const file = await f.handle.getFile();
      const entry = new fflate.ZipPassThrough(`${info.name}/${f.path}`); // sin comprimir: los vídeos ya lo están
      entry.mtime = file.lastModified;
      zip.add(entry);
      const reader = file.stream().getReader();
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) { entry.push(new Uint8Array(0), true); break; }
        entry.push(value);
        done += value.length;
        await chain;
        if (err) throw err;
        busy({ ...b, progress: done / total, text: `${f.path} · ${Math.round(done / 1048576)} de ${Math.round(total / 1048576)} MB` });
      }
    }
    zip.end();
    await chain;
    await w.close();
    toast('Proyecto listo para compartir: envía el .zip y ábrelo con "Importar proyecto"', 'ok', 7000);
  } catch (e) { console.error(e); try { await w.abort(); } catch {} toast('No se pudo crear el .zip: ' + e.message, 'err'); }
  busy(null);
}

export async function importZip() {
  if (!lib.ws) { await chooseWorkspace(); if (!lib.ws) return; }
  let fh;
  try { [fh] = await window.showOpenFilePicker({ types: [{ description: 'Proyecto del Editor TBS (.zip)', accept: { 'application/zip': ['.zip'] } }] }); } catch { return; }
  const file = await fh.getFile();
  const fflate = await import(FFLATE);
  const base = file.name.replace(/\.tbsproyecto\.zip$|\.zip$/i, '');
  const rootName = await uniqueName(base);
  const root = await lib.ws.getDirectoryHandle(rootName, { create: true });
  let chain = Promise.resolve(), done = 0, found = false;
  const b = { title: 'Importando proyecto', text: file.name, progress: 0 };
  busy(b);
  const uz = new fflate.Unzip();
  uz.register(fflate.UnzipInflate);
  uz.onfile = (f) => {
    // se quita la carpeta raíz del .zip (el nombre del proyecto original)
    let path = f.name.split('/').filter(Boolean);
    if (path.length > 1) path = path.slice(1);
    if (!path.length || f.name.endsWith('/')) return;
    if (path[path.length - 1] === PROJECT_FILE) found = true;
    const wp = (async () => {
      let d = root;
      for (const part of path.slice(0, -1)) d = await d.getDirectoryHandle(part, { create: true });
      return (await d.getFileHandle(path[path.length - 1], { create: true })).createWritable();
    })();
    f.ondata = (e, data, final) => {
      if (e) { console.error(e); return; }
      chain = chain.then(async () => { const w = await wp; if (data.length) await w.write(data); if (final) await w.close(); });
    };
    f.start();
  };
  try {
    const reader = file.stream().getReader();
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) { uz.push(new Uint8Array(0), true); break; }
      uz.push(value);
      done += value.length;
      await chain;
      busy({ ...b, progress: done / file.size, text: `${Math.round(done / 1048576)} de ${Math.round(file.size / 1048576)} MB` });
    }
    await chain;
  } catch (e) { console.error(e); toast('No se pudo importar: ' + e.message, 'err'); busy(null); return; }
  busy(null);
  if (!found) { toast('Ese .zip no contiene un proyecto del Editor TBS', 'err'); try { await lib.ws.removeEntry(rootName, { recursive: true }); } catch {} return; }
  await refresh();
  const info = (lib.projects || []).find(p => p.name === rootName);
  if (info) await openProject(info);
  toast('Proyecto importado');
}
