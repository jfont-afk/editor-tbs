import { html, render } from './lib.js';
import { loadFonts } from './data/brand.js';
import { state, setUI, undo, redo, runtime } from './core/store.js';
import * as A from './core/actions.js';
import { player, timeBus } from './engine/player.js';
import { App } from './ui/App.js';
import { initPersistence } from './core/persist.js';

const ACCEPT = 'video/*,image/*,.mp4,.mov,.m4v,.webm,.mkv,.png,.jpg,.jpeg,.webp';

window.__openFiles = async () => {
  if (window.showOpenFilePicker) {
    try {
      const hs = await window.showOpenFilePicker({ multiple: true, types: [{ description: 'Vídeos e imágenes', accept: { 'video/*': ['.mp4', '.mov', '.m4v', '.webm', '.mkv'], 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] } }] });
      const files = await Promise.all(hs.map(h => h.getFile()));
      return A.importFiles(files, hs);
    } catch (e) { if (e.name === 'AbortError') return; }
  }
  const inp = document.createElement('input');
  inp.type = 'file'; inp.multiple = true; inp.accept = ACCEPT;
  inp.onchange = () => A.importFiles(inp.files);
  inp.click();
};

window.__dropFiles = async (e) => {
  const items = [...(e.dataTransfer?.items || [])].filter(i => i.kind === 'file');
  const handles = await Promise.all(items.map(i => (i.getAsFileSystemHandle ? i.getAsFileSystemHandle().catch(() => null) : null)));
  const files = [...(e.dataTransfer?.files || [])];
  A.importFiles(files, handles);
};

// La página nunca debe desplazarse (si algo la mueve, se recoloca)
const pin = () => {
  if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
  for (const el of [document.documentElement, document.body]) { if (el.scrollTop) el.scrollTop = 0; if (el.scrollLeft) el.scrollLeft = 0; }
};
window.addEventListener('scroll', pin, { passive: true });
document.addEventListener('scroll', pin, { passive: true, capture: false });
window.addEventListener('resize', pin);

// Soltar archivos en cualquier parte
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => { if (!e.defaultPrevented) { e.preventDefault(); window.__dropFiles(e); } });

// Atajos de teclado
window.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
  // con la pantalla de proyectos o una tarea en marcha, los atajos del editor no actúan
  if (state.ui.home || state.ui.busy) return;
  const k = e.key.toLowerCase();
  const fps = state.project.fps || 30;
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); player.seek(timeBus.t); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); player.seek(timeBus.t); return; }
  if ((e.ctrlKey || e.metaKey) && k === 's') {
    e.preventDefault();
    import('./core/projectFolder.js').then(async PF => {
      if (PF.folderActive()) return PF.saveVersion(false);
      const L = await import('./core/library.js');
      return L.lib.ws ? L.saveCurrentToLibrary() : PF.saveAsFolder();
    });
    return;
  }
  // Duplicar / copiar / pegar (Ctrl en Windows, Cmd en Mac)
  if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); A.duplicateSelection(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'c' && !String(window.getSelection() || '')) { if (A.copySelection()) e.preventDefault(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'v') { if (A.pasteClipboard()) e.preventDefault(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (k === ' ') { e.preventDefault(); player.toggle(); }
  else if (k === 's') { e.preventDefault(); A.splitAtPlayhead(); }
  else if (k === 'q') { e.preventDefault(); A.trimPlayhead('in'); }
  else if (k === 'w') { e.preventDefault(); A.trimPlayhead('out'); }
  else if (k === 'delete' || k === 'backspace') { e.preventDefault(); A.deleteSelection(); }
  else if (k === 'arrowleft') { e.preventDefault(); player.seek(timeBus.t - (e.shiftKey ? 1 : 1 / fps)); }
  else if (k === 'arrowright') { e.preventDefault(); player.seek(timeBus.t + (e.shiftKey ? 1 : 1 / fps)); }
  else if (k === 'home') { e.preventDefault(); player.seek(0); }
  else if (k === 'end') { e.preventDefault(); player.seek(player.duration); }
  else if (k === 'escape') setUI({ sel: null, wordSel: [] });
});

// Acceso para pruebas automatizadas
window.__editor = {
  state, actions: A, player, timeBus, runtime,
  // carga rápida del vídeo de pruebas (solo desarrollo)
  async loadTest(name = 'usuario2.mp4') {
    if (state.ui.restore || state.ui.home) (await import('./core/persist.js')).discardRestore();
    if (!state.project.assets.length) {
      const b = await (await fetch('/_pruebas/' + name)).blob();
      const real = name === 'usuario.mp4' ? '2026-10-02-132102806.mp4' : name === 'usuario2.mp4' ? '20261019_132003.mp4' : name;
      await A.importFiles([new File([b], real, { type: 'video/mp4', lastModified: 3 })]);
      await new Promise(r => setTimeout(r, 4000));
    }
    if (!Object.keys(state.project.transcripts).length) {
      const r = name === 'usuario.mp4' ? await fetch('/_pruebas/transcripcion.json').catch(() => null) : null;
      if (r?.ok) {
        const { uid } = await import('./lib.js');
        const { update } = await import('./core/store.js');
        const words = (await r.json()).map(([text, start, end]) => ({ id: uid('w'), text, start, end, hl: 0 }));
        update(p => { p.transcripts[p.assets[0].id] = { lang: 'spanish', model: 'prueba', words }; });
        A.runAutoHighlight();
      } else await A.transcribeAll({ model: 'onnx-community/whisper-base_timestamped', lang: 'spanish' });
    }
    return 'ok';
  },
  // hoja de contactos con varias plantillas renderizadas a resolución completa (solo desarrollo)
  async qa(ids, t, cols = 4, patch = null) {
    const S = await import('./core/store.js'); const Cp = await import('./core/captions.js');
    const p = state.project; const prev = p.captions.template; const prevStyle = p.captions.style;
    const W = 360, H = 640; const sheet = document.createElement('canvas'); const rows = Math.ceil(ids.length / cols);
    sheet.width = cols * W; sheet.height = rows * (H + 24);
    const sx = sheet.getContext('2d'); sx.fillStyle = '#000'; sx.fillRect(0, 0, sheet.width, sheet.height);
    player.seek(t); await new Promise(r => setTimeout(r, 700));
    for (let i = 0; i < ids.length; i++) {
      const [id, tt] = Array.isArray(ids[i]) ? ids[i] : [ids[i], t];
      p.captions.template = id; p.captions.style = patch || {}; S.touchProject();
      if (tt !== t) { player.seek(tt); await new Promise(r => setTimeout(r, 500)); }
      const c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
      player.comp.render(c.getContext('2d'), 1080, 1920, tt, player.frameSource(tt), { project: p, version: S.projectVersion, groups: Cp.captionGroups(p, S.projectVersion), total: player.duration, safeZone: 'tiktok', editing: false });
      const x = (i % cols) * W, y = Math.floor(i / cols) * (H + 24);
      sx.drawImage(c, x, y + 24, W, H); sx.fillStyle = '#daff0a'; sx.font = '700 16px sans-serif'; sx.fillText(id.replace('tbs-', '') + ' @' + tt, x + 6, y + 17);
    }
    p.captions.template = prev; p.captions.style = prevStyle; S.touchProject();
    let ov = document.getElementById('qa');
    if (!ov) { ov = document.createElement('div'); ov.id = 'qa'; ov.style.cssText = 'position:fixed;inset:0;z-index:999;background:#111;display:grid;place-items:center'; document.body.appendChild(ov); ov.onclick = () => ov.remove(); }
    ov.innerHTML = ''; sheet.style.cssText = 'max-width:100vw;max-height:100vh'; ov.appendChild(sheet);
    return 'ok';
  },
};

(async () => {
  await loadFonts();
  render(html`<${App} />`, document.getElementById('app'));
  initPersistence();
  import('./core/library.js').then(m => m.initLibrary());
})();
