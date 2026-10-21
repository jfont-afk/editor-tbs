import { html, useState, useEffect, fmtDur } from '../lib.js';
import { state, setUI } from '../core/store.js';
import { Icon } from './icons.js';
import { Btn } from './controls.js';
import { logoSVG } from '../data/brandLogo.js';
import * as L from '../core/library.js';
import * as PF from '../core/projectFolder.js';

const ago = (ts) => {
  if (!ts) return '';
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'ahora mismo';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  if (s < 86400 * 7) return `hace ${Math.round(s / 86400)} días`;
  return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
};

function NewModal({ onClose }) {
  const [name, setName] = useState('');
  const go = async () => { onClose(); await L.createProject(name.trim() || 'Proyecto nuevo'); };
  return html`<div class="modal-back" onClick=${e => e.target === e.currentTarget && onClose()}><div class="modal">
    <h3>Proyecto nuevo</h3>
    <p>Se crea una carpeta con su nombre dentro de <b>${L.lib.ws?.name || 'tu carpeta de proyectos'}</b>. Ahí se guardan los brutos, las versiones y las exportaciones.</p>
    <input class="input" autofocus placeholder="Nombre del proyecto (p. ej. Reel invertir sin miedo)" value=${name} onInput=${e => setName(e.target.value)} onKeyDown=${e => e.key === 'Enter' && go()} />
    <div class="row" style="justify-content:flex-end;margin-top:14px"><${Btn} onClick=${onClose}>Cancelar</${Btn}><${Btn} cls="primary" onClick=${go}>Crear y empezar</${Btn}></div>
  </div></div>`;
}

function ProjectCard({ p }) {
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const open = () => L.openProject(p);
  const isOpen = PF.currentDir()?.name === p.name;
  return html`<div class=${'proj-card' + (isOpen ? ' open' : '')} onMouseLeave=${() => setMenu(false)}>
    <button class="pc-thumb" onClick=${open} title=${'Abrir ' + p.title}>
      ${p.thumb ? html`<img src=${p.thumb} alt="" />` : html`<span class="pc-empty"><${Icon} name="film" /></span>`}
      <span class="pc-fmt">${p.format}</span>
      ${p.dur > 0 && html`<span class="pc-dur">${fmtDur(p.dur)}</span>`}
    </button>
    <div class="pc-info">
      ${renaming !== null
        ? html`<input class="input" autofocus value=${renaming} onInput=${e => setRenaming(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') { L.renameProject(p, renaming.trim() || p.title); setRenaming(null); } if (e.key === 'Escape') setRenaming(null); }} onBlur=${() => setRenaming(null)} />`
        : html`<b title=${p.title}>${p.title}</b>`}
      <span>${ago(p.savedAt)}${p.clips ? ` · ${p.clips} clip${p.clips === 1 ? '' : 's'}` : ''}${isOpen ? ' · abierto' : ''}</span>
    </div>
    <button class="pc-more" title="Más opciones" onClick=${() => setMenu(!menu)}><${Icon} name="settings" /></button>
    ${menu && html`<div class="pc-menu">
      <button onClick=${open}><${Icon} name="folder" />Abrir</button>
      <button onClick=${() => { setMenu(false); L.exportZip(p); }}><${Icon} name="share" />Compartir (.zip)</button>
      <button onClick=${() => { setMenu(false); L.duplicateProject(p); }}><${Icon} name="copy" />Duplicar</button>
      <button onClick=${() => { setMenu(false); setRenaming(p.title); }}><${Icon} name="pencil" />Cambiar el nombre</button>
      <button class="danger" onClick=${() => { setMenu(false); setConfirmDel(true); }}><${Icon} name="trash" />Eliminar…</button>
    </div>`}
    ${confirmDel && html`<div class="modal-back" onClick=${e => e.target === e.currentTarget && setConfirmDel(false)}><div class="modal">
      <h3>¿Eliminar “${p.title}”?</h3>
      <p>Se borra su carpeta con los brutos, las versiones y las exportaciones. No se puede deshacer.</p>
      <div class="row" style="justify-content:flex-end"><${Btn} onClick=${() => setConfirmDel(false)}>Cancelar</${Btn}><${Btn} cls="cta" onClick=${() => { setConfirmDel(false); L.deleteProject(p); }}>Eliminar</${Btn}></div>
    </div></div>`}
  </div>`;
}

export function Home() {
  const lib = L.lib, ui = state.ui;
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  useEffect(() => { if (lib.perm === 'granted') L.refresh(); }, []);
  const list = (lib.projects || []).filter(p => !q || p.title.toLowerCase().includes(q.toLowerCase()));
  const auto = ui.homeAuto;
  const canClose = state.project.clips.length > 0 || !!PF.currentDir();
  return html`<div class="home">
    <header class="home-top">
      <span class="brand-mark" dangerouslySetInnerHTML=${{ __html: logoSVG('#ffffff', 'full', '#f22b11') }}></span>
      <span class="brand-sub">Editor</span>
      <span class="top-spacer"></span>
      ${lib.ws && html`<button class="btn sm ghost" title="Cambiar la carpeta de proyectos" onClick=${L.chooseWorkspace}><${Icon} name="folder" />${lib.ws.name}</button>`}
      ${canClose && html`<${Btn} cls="sm" icon="x" onClick=${() => setUI({ home: false })}>Volver al proyecto</${Btn}>`}
    </header>
    <div class="home-body">
      <div class="home-head">
        <div>
          <h1>Proyectos</h1>
          <p class="muted">Abre cualquier proyecto guardado, crea uno nuevo o importa uno que te hayan pasado.</p>
        </div>
        <div class="row wrap" style="gap:8px">
          <${Btn} cls="cta lg" icon="plus" onClick=${() => (lib.ws && lib.perm === 'granted' ? setCreating(true) : L.chooseWorkspace().then(() => L.lib.ws && setCreating(true)))}>Proyecto nuevo</${Btn}>
          <${Btn} cls="lg" icon="download" onClick=${L.importZip}>Importar proyecto</${Btn}>
          <${Btn} cls="lg ghost" icon="folder" onClick=${async () => { await PF.openFolder(); if (PF.currentDir()) setUI({ home: false }); }}>Abrir carpeta…</${Btn}>
        </div>
      </div>

      ${!lib.ws && html`<div class="home-setup">
        <span class="hs-ico"><${Icon} name="folder" /></span>
        <div><h3>Elige dónde guardar tus proyectos</h3>
          <p>Crea o elige una carpeta en tu ordenador (por ejemplo <b>Documentos/Proyectos TBS</b>). Cada proyecto tendrá dentro su propia carpeta con los vídeos originales, así se puede abrir en cualquier ordenador.</p></div>
        <${Btn} cls="primary lg" onClick=${L.chooseWorkspace}>Elegir carpeta</${Btn}>
      </div>`}
      ${lib.ws && lib.perm !== 'granted' && html`<div class="home-setup">
        <span class="hs-ico"><${Icon} name="folder" /></span>
        <div><h3>Acceso a “${lib.ws.name}”</h3><p>Chrome pide permiso cada vez que se abre el editor para leer tu carpeta de proyectos.</p></div>
        <${Btn} cls="primary lg" onClick=${L.grantAccess}>Ver mis proyectos</${Btn}>
      </div>`}

      ${auto && html`<div class="home-auto">
        <span class="hs-ico"><${Icon} name="undo" /></span>
        <div><h3>Último proyecto sin carpeta: ${auto.project.name}</h3><p>Guardado automáticamente en este navegador ${ago(auto.savedAt)} · ${auto.project.clips.length} clips. Ábrelo y usa “Guardar en Proyectos” para tenerlo en tu carpeta.</p></div>
        <${Btn} cls="primary" onClick=${async () => { const P = await import('../core/persist.js'); await P.restoreProject(auto); setUI({ homeAuto: null }); }}>Continuar</${Btn}>
      </div>`}

      ${lib.ws && lib.perm === 'granted' && html`
        <div class="row" style="gap:8px;margin:22px 0 12px">
          <h2 class="home-h2 grow">${list.length} proyecto${list.length === 1 ? '' : 's'}${lib.loading ? ' · cargando…' : ''}</h2>
          <input class="input" style="max-width:260px" placeholder="Buscar…" value=${q} onInput=${e => setQ(e.target.value)} />
          <button class="tl-icon" title="Actualizar" onClick=${L.refresh}><${Icon} name="repeat" /></button>
        </div>
        <div class="proj-grid">
          <button class="proj-card new" onClick=${() => setCreating(true)}><span class="pc-thumb"><span class="pc-empty"><${Icon} name="plus" /></span></span><div class="pc-info"><b>Proyecto nuevo</b><span>Empieza desde cero</span></div></button>
          ${list.map(p => html`<${ProjectCard} key=${p.name} p=${p} />`)}
        </div>
        ${!list.length && !lib.loading && html`<p class="muted" style="margin-top:12px">Aún no hay proyectos en esta carpeta.</p>`}`}
      <p class="dim small" style="margin-top:28px">Para pasar un proyecto a otra persona: menú del proyecto › <b>Compartir (.zip)</b>. Ella lo abre con <b>Importar proyecto</b> (incluye los vídeos originales, subtítulos, motions y miniaturas).</p>
    </div>
    ${creating && html`<${NewModal} onClose=${() => setCreating(false)} />`}
  </div>`;
}
