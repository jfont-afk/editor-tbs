import { html, useState } from '../lib.js';
import { useStore, setUI, update, undo, redo, canUndo, canRedo } from '../core/store.js';
import { Icon } from './icons.js';
import { Btn, Progress } from './controls.js';
import { Preview } from './Preview.js';
import { Timeline } from './Timeline.js';
import { Inspector } from './Inspector.js';
import { MediaPanel } from './panels/MediaPanel.js';
import { EditPanel } from './panels/EditPanel.js';
import { CaptionsPanel } from './panels/CaptionsPanel.js';
import { MotionsPanel } from './panels/MotionsPanel.js';
import { ColorPanel } from './panels/ColorPanel.js';
import { EffectsPanel } from './panels/EffectsPanel.js';
import { logoSVG } from '../data/brandLogo.js';
import { Splitters, layout, layoutStyle, resetLayout, setWideTimeline } from './Splitters.js';
import { ThumbPanel } from './panels/ThumbPanel.js';
import { ExportPanel } from './panels/ExportPanel.js';
import { FORMATS } from '../data/brand.js';
import * as PF from '../core/projectFolder.js';
import { folderState } from '../core/projectFolder.js';

export const TABS = [
  { id: 'media', name: 'Medios', icon: 'folder', Panel: MediaPanel },
  { id: 'edit', name: 'Editar', icon: 'scissors', Panel: EditPanel },
  { id: 'captions', name: 'Texto', icon: 'type', Panel: CaptionsPanel },
  { id: 'motions', name: 'Motions', icon: 'sparkles', Panel: MotionsPanel },
  { id: 'effects', name: 'Efectos', icon: 'zoomIn', Panel: EffectsPanel },
  { id: 'color', name: 'Color', icon: 'palette', Panel: ColorPanel },
  { id: 'thumb', name: 'Miniatura', icon: 'image', Panel: ThumbPanel },
  { id: 'export', name: 'Exportar', icon: 'export', Panel: ExportPanel },
];

function ProjectMenu() {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState(null);
  const fs = folderState;
  const run = (fn) => async () => { setOpen(false); await fn(); };
  const status = fs.status === 'saving' ? 'Guardando…' : fs.status === 'saved' ? 'Guardado' : fs.status === 'error' ? 'Error al guardar' : 'Sin carpeta';
  return html`<div class="pmenu">
    <button class=${'btn sm ' + (fs.name ? '' : 'ghost')} onClick=${() => setOpen(!open)} title="Proyecto y guardado local">
      <${Icon} name="folder" />${fs.name ? html`<span class="pm-name">${fs.name}</span><span class=${'pm-dot ' + fs.status}></span>` : 'Proyecto'}<${Icon} name="chevronDown" />
    </button>
    ${open && html`<div class="pm-pop" onMouseLeave=${() => setOpen(false)}>
      <div class="pm-status">${fs.name ? html`Carpeta: <b>${fs.name}</b> · ${status}` : html`Guarda el proyecto en una carpeta para tener <b>brutos, versiones y exportaciones</b> en tu disco, como en Premiere o DaVinci.`}</div>
      <button onClick=${run(PF.saveAsFolder)}><${Icon} name="save" />${fs.name ? 'Guardar como en otra carpeta…' : 'Guardar en una carpeta…'}</button>
      <button onClick=${run(() => PF.openFolder())}><${Icon} name="folder" />Abrir proyecto…</button>
      ${fs.name && html`<button onClick=${run(() => PF.saveVersion(false))}><${Icon} name="copy" />Guardar versión <span class="kbd">Ctrl+S</span></button>
        <button onClick=${async () => setVersions(await PF.listVersions())}><${Icon} name="undo" />Versiones anteriores…</button>`}
      <label class="pm-check"><input type="checkbox" checked=${fs.copyRaw} onChange=${e => { fs.copyRaw = e.target.checked; }} /> Copiar los brutos a la carpeta</label>
      ${versions && html`<div class="pm-versions">${versions.length ? versions.slice(0, 15).map(v => html`<button onClick=${run(() => PF.restoreVersion(v.name))}>${v.name.replace('.tbsedit', '').replace('_', ' · ').replace(/-(\d\d)-(\d\d)$/, ':$1:$2')}</button>`) : html`<span class="dim small">Aún no hay versiones</span>`}</div>`}
    </div>`}
  </div>`;
}

// Diseño de la interfaz: línea de tiempo a todo el ancho y volver a los tamaños por defecto
function LayoutMenu() {
  const [open, setOpen] = useState(false);
  return html`<div class="pmenu">
    <${Btn} cls=${'icon ghost' + (open ? ' on' : '')} icon="layout" title="Diseño de la interfaz" onClick=${() => setOpen(!open)} />
    ${open && html`<div class="pm-pop right" onMouseLeave=${() => setOpen(false)}>
      <div class="pm-status">Arrastra los <b>divisores</b> entre zonas para cambiar el tamaño del reproductor, de las propiedades y de la línea de tiempo. Doble clic en un divisor = tamaño por defecto.</div>
      <label class="pm-check"><input type="checkbox" checked=${layout.wideTl} onChange=${e => setWideTimeline(e.target.checked)} /> Línea de tiempo a todo el ancho (también debajo del reproductor)</label>
      <button onClick=${() => { resetLayout(); document.querySelector('.app')?.style.removeProperty('--player-w'); setOpen(false); }}><${Icon} name="reset" />Restablecer los tamaños</button>
    </div>`}
  </div>`;
}

function TopBar({ s }) {
  const p = s.project;
  return html`<header class="topbar">
    <div class="brand">
      <span class="brand-mark" title="Traders Business School" dangerouslySetInnerHTML=${{ __html: logoSVG('#ffffff', 'full', '#f22b11') }}></span>
      <span class="brand-sub">Editor</span>
    </div>
    <span class="top-sep"></span>
    <${ProjectMenu} />
    <input class="proj-name" value=${p.name} onChange=${e => update(pp => { pp.name = e.target.value || 'Proyecto sin título'; })} title="Nombre del proyecto" />
    <div class="top-spacer"></div>
    <${LayoutMenu} />
    <${Btn} cls="icon ghost" icon="undo" title="Deshacer (Ctrl+Z)" disabled=${!canUndo()} onClick=${undo} />
    <${Btn} cls="icon ghost" icon="redo" title="Rehacer (Ctrl+Y)" disabled=${!canRedo()} onClick=${redo} />
    <${Btn} cls="cta" icon="download" disabled=${!p.clips.length} onClick=${() => setUI({ tab: 'export' })}>Exportar</${Btn}>
  </header>`;
}

// Menú vertical: una sección = una tarea
function Rail({ s }) {
  const p = s.project;
  return html`<nav class="rail">
    ${TABS.map(t => html`<button class=${'rail-btn' + (s.ui.tab === t.id ? ' active' : '')} onClick=${() => setUI({ tab: t.id })} title=${t.name}>
      <${Icon} name=${t.icon} />${t.name}
      ${t.id === 'captions' && p.clips.length > 0 && !Object.keys(p.transcripts).length && html`<span class="rail-dot"></span>`}
    </button>`)}
  </nav>`;
}

function BusyModal({ b }) {
  if (!b) return null;
  return html`<div class="modal-back"><div class="modal">
    <h3>${b.title}</h3>
    <p>${b.text}</p>
    <${Progress} value=${b.progress} />
    ${b.eta != null && html`<p class="small dim" style="margin:10px 0 0">Tiempo restante aprox.: ${Math.ceil(b.eta)} s</p>`}
    ${b.cancel && html`<div style="margin-top:16px;display:flex;justify-content:flex-end"><${Btn} onClick=${b.cancel}>Cancelar</${Btn}></div>`}
  </div></div>`;
}

function RestoreModal({ r }) {
  if (!r) return null;
  const when = r.savedAt ? new Date(r.savedAt).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const relink = async () => {
    const { relinkFiles } = await import('../core/persist.js');
    if (window.showOpenFilePicker) {
      try { const hs = await window.showOpenFilePicker({ multiple: true }); return relinkFiles(await Promise.all(hs.map(h => h.getFile())), hs); } catch (e) { if (e.name === 'AbortError') return; }
    }
    const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true;
    inp.onchange = () => relinkFiles(inp.files); inp.click();
  };
  if (r.folder) return html`<div class="modal-back"><div class="modal">
    <h3>¿Seguimos con <em style="font-family:var(--font-serif);color:var(--text)">${r.folder.name}</em>?</h3>
    <p>Es la carpeta del último proyecto. Se abrirá con sus brutos, versiones y exportaciones.</p>
    <div class="row" style="justify-content:flex-end">
      <${Btn} onClick=${async () => (await import('../core/persist.js')).discardRestore()}>Proyecto nuevo</${Btn}>
      <${Btn} icon="folder" onClick=${async () => { await PF.openFolder(); if (PF.folderActive()) (await import('../core/persist.js')).discardRestore(); }}>Abrir otro…</${Btn}>
      <${Btn} cls="fluor" onClick=${async () => { const ok = await PF.reopenLast(r.folder); if (ok) (await import('../core/persist.js')).discardRestore(); }}>Abrir proyecto</${Btn}>
    </div>
  </div></div>`;
  return html`<div class="modal-back"><div class="modal">
    ${r.missing ? html`
      <h3>Faltan archivos</h3>
      <p>No se han podido abrir: <b>${r.missing.map(a => a.name).join(', ')}</b>. Selecciónalos de nuevo para seguir editando.</p>
      <div class="row" style="justify-content:flex-end">
        <${Btn} onClick=${async () => (await import('../core/persist.js')).discardRestore()}>Seguir sin ellos</${Btn}>
        <${Btn} cls="fluor" icon="folder" onClick=${relink}>Buscar archivos</${Btn}>
      </div>` : html`
      <h3>¿Continuar donde lo dejaste?</h3>
      <p>Hay un proyecto guardado: <b>${r.project.name}</b>${when ? ` (${when})` : ''} · ${r.project.clips.length} clips.</p>
      <div class="row" style="justify-content:flex-end">
        <${Btn} onClick=${async () => (await import('../core/persist.js')).discardRestore()}>Empezar de cero</${Btn}>
        <${Btn} cls="fluor" onClick=${async () => (await import('../core/persist.js')).restoreProject()}>Continuar el proyecto</${Btn}>
      </div>`}
  </div></div>`;
}

export function App() {
  const s = useStore();
  const tab = TABS.find(t => t.id === s.ui.tab) || TABS[0];
  const showInsp = s.ui.tab !== 'thumb' && (!!s.ui.sel || ['edit', 'captions', 'motions', 'effects', 'color'].includes(s.ui.tab));
  const fmt = s.ui.tab === 'thumb' ? (s.project.thumb?.format || '9x16') : s.project.format.id;
  return html`<div class=${'app fmt-' + fmt + (showInsp ? '' : ' no-insp') + (s.ui.sel ? ' has-sel' : '') + (layout.wideTl ? ' wide-tl' : '')} style=${layoutStyle(fmt)}>
    <${TopBar} s=${s} />
    <${Rail} s=${s} />
    <aside class="panel"><${tab.Panel} /></aside>
    <aside class="insp"><button class="btn sm ghost insp-close" onClick=${() => setUI({ sel: null })}><${Icon} name="chevronRight" style="transform:rotate(180deg)" />Volver a ${tab.name}</button><${Inspector} /></aside>
    ${s.ui.tab === 'thumb' ? html`<${ThumbPanel.Stage} />` : html`<${Preview} />`}
    <${Timeline} />
    <${BusyModal} b=${s.ui.busy} />
    ${!s.ui.busy && html`<${RestoreModal} r=${s.ui.restore} />`}
    <div class="toasts">${s.ui.toasts.map(t => html`<div class=${'toast' + (t.kind === 'err' ? ' err' : '')} key=${t.id}>${t.text}</div>`)}</div>
    <${Splitters} fmt=${fmt} showInsp=${showInsp} />
  </div>`;
}
