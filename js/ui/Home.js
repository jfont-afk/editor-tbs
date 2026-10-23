import { html, useState, useEffect, fmtDur } from '../lib.js';
import { state, setUI } from '../core/store.js';
import { Icon } from './icons.js';
import { Btn } from './controls.js';
import { logoSVG } from '../data/brandLogo.js';
import * as L from '../core/library.js';
import * as PF from '../core/projectFolder.js';
import * as C from '../core/cloud.js';
import { AccountMenu } from './Account.js';

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
  // con cuenta y sin carpeta elegida, el proyecto vive en la nube; con carpeta, también se guarda ahí
  const inFolder = !!L.lib.ws && L.lib.perm === 'granted';
  const go = async () => { onClose(); const t = name.trim() || 'Proyecto nuevo'; if (inFolder) await L.createProject(t); else await C.newCloudProject(t); };
  return html`<div class="modal-back" onClick=${e => e.target === e.currentTarget && onClose()}><div class="modal">
    <h3>Proyecto nuevo</h3>
    <p>${inFolder ? html`Se crea una carpeta con su nombre dentro de <b>${L.lib.ws.name}</b>. Ahí se guardan los brutos, las versiones y las exportaciones.` : html`Se guarda en tu cuenta y lo verás desde cualquier ordenador. Los vídeos se quedan en tu ordenador.`}</p>
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

function CloudCard({ p }) {
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const open = () => C.openCloudProject(p);
  const isOpen = state.project.cloudId === p.id;
  const m = p.meta || {};
  return html`<div class=${'proj-card' + (isOpen ? ' open' : '')} onMouseLeave=${() => setMenu(false)}>
    <button class="pc-thumb" onClick=${open} title=${'Abrir ' + p.title}>
      ${p.thumb ? html`<img src=${p.thumb} alt="" />` : html`<span class="pc-empty"><${Icon} name="film" /></span>`}
      <span class="pc-fmt">${m.format || '9:16'}</span>
      ${m.dur > 0 && html`<span class="pc-dur">${fmtDur(m.dur)}</span>`}
    </button>
    <div class="pc-info">
      ${renaming !== null
        ? html`<input class="input" autofocus value=${renaming} onInput=${e => setRenaming(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') { C.renameCloudProject(p, renaming.trim() || p.title); setRenaming(null); } if (e.key === 'Escape') setRenaming(null); }} onBlur=${() => setRenaming(null)} />`
        : html`<b title=${p.title}>${p.title}</b>`}
      <span>${ago(p.updated_at)}${m.clips ? ` · ${m.clips} clip${m.clips === 1 ? '' : 's'}` : ''}${isOpen ? ' · abierto' : ''}</span>
    </div>
    <button class="pc-more" title="Más opciones" onClick=${() => setMenu(!menu)}><${Icon} name="settings" /></button>
    ${menu && html`<div class="pc-menu">
      <button onClick=${open}><${Icon} name="folder" />Abrir</button>
      <button onClick=${() => { setMenu(false); setRenaming(p.title); }}><${Icon} name="pencil" />Cambiar el nombre</button>
      <button class="danger" onClick=${() => { setMenu(false); setConfirmDel(true); }}><${Icon} name="trash" />Eliminar…</button>
    </div>`}
    ${confirmDel && html`<div class="modal-back" onClick=${e => e.target === e.currentTarget && setConfirmDel(false)}><div class="modal">
      <h3>¿Eliminar “${p.title}” de la nube?</h3>
      <p>Se borra el proyecto de tu cuenta (cortes, subtítulos, motions…). Los vídeos de tu ordenador no se tocan. No se puede deshacer.</p>
      <div class="row" style="justify-content:flex-end"><${Btn} onClick=${() => setConfirmDel(false)}>Cancelar</${Btn}><${Btn} cls="cta" onClick=${() => { setConfirmDel(false); C.deleteCloudProject(p); }}>Eliminar</${Btn}></div>
    </div></div>`}
  </div>`;
}

export function Home() {
  const lib = L.lib, ui = state.ui;
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  useEffect(() => { if (lib.perm === 'granted') L.refresh(); C.refresh(); }, []);
  const cl = C.cloud;
  const cloudList = (cl.projects || []).filter(p => !q || p.title.toLowerCase().includes(q.toLowerCase()));
  const folders = PF.hasFolderAPI();
  const list = (lib.projects || []).filter(p => !q || p.title.toLowerCase().includes(q.toLowerCase()));
  const auto = ui.homeAuto;
  const canClose = state.project.clips.length > 0 || !!PF.currentDir();
  return html`<div class="home">
    <header class="home-top">
      <span class="brand-mark" dangerouslySetInnerHTML=${{ __html: logoSVG('#ffffff', 'full', '#f22b11') }}></span>
      <span class="brand-sub">Editor</span>
      <span class="top-spacer"></span>
      ${lib.ws && html`<button class="btn sm ghost" title="Cambiar la carpeta de proyectos" onClick=${L.chooseWorkspace}><${Icon} name="folder" />${lib.ws.name}</button>`}
      ${cl.on && html`<${AccountMenu} />`}
      ${canClose && html`<${Btn} cls="sm" icon="x" onClick=${() => setUI({ home: false })}>Volver al proyecto</${Btn}>`}
    </header>
    <div class="home-body">
      <div class="home-head">
        <div>
          <h1>Proyectos</h1>
          <p class="muted">Abre cualquier proyecto guardado, crea uno nuevo o importa uno que te hayan pasado.</p>
        </div>
        <div class="row wrap" style="gap:8px">
          <${Btn} cls="cta lg" icon="plus" onClick=${() => (cl.on || (lib.ws && lib.perm === 'granted') ? setCreating(true) : L.chooseWorkspace().then(() => L.lib.ws && setCreating(true)))}>Proyecto nuevo</${Btn}>
          ${folders && html`<${Btn} cls="lg" icon="download" onClick=${L.importZip}>Importar proyecto</${Btn}>
          <${Btn} cls="lg ghost" icon="folder" onClick=${async () => { await PF.openFolder(); if (PF.currentDir()) setUI({ home: false }); }}>Abrir carpeta…</${Btn}>`}
        </div>
      </div>

      ${cl.on && html`
        <div class="row" style="gap:8px;margin:22px 0 12px">
          <h2 class="home-h2 grow">En tu cuenta · ${cloudList.length} proyecto${cloudList.length === 1 ? '' : 's'}${cl.loading ? ' · cargando…' : ''}</h2>
          <input class="input" style="max-width:260px" placeholder="Buscar…" value=${q} onInput=${e => setQ(e.target.value)} />
          <button class="tl-icon" title="Actualizar" onClick=${C.refresh}><${Icon} name="repeat" /></button>
        </div>
        <div class="proj-grid">
          <button class="proj-card new" onClick=${() => setCreating(true)}><span class="pc-thumb"><span class="pc-empty"><${Icon} name="plus" /></span></span><div class="pc-info"><b>Proyecto nuevo</b><span>Empieza desde cero</span></div></button>
          ${cloudList.map(p => html`<${CloudCard} key=${p.id} p=${p} />`)}
        </div>
        <p class="dim small" style="margin-top:10px">Se guardan solos en tu cuenta y los ves desde cualquier ordenador. Los vídeos no se suben: si abres el proyecto en otro ordenador, te pedirá que busques los archivos.</p>
        ${folders && html`<h2 class="home-h2" style="margin-top:30px">En tu ordenador (opcional)</h2>`}`}
      ${!folders && !cl.on && html`<div class="home-setup">
        <span class="hs-ico"><${Icon} name="folder" /></span>
        <div><h3>Este navegador no permite carpetas de proyecto</h3><p>Ábrelo con <b>Google Chrome</b> o Microsoft Edge en un ordenador para guardar y abrir proyectos.</p></div>
      </div>`}
      ${folders && !lib.ws && html`<div class="home-setup">
        <span class="hs-ico"><${Icon} name="folder" /></span>
        <div><h3>${cl.on ? 'Carpeta de proyectos en tu ordenador' : 'Elige dónde guardar tus proyectos'}</h3>
          <p>${cl.on ? 'Opcional: además de en tu cuenta, guarda cada proyecto con sus vídeos originales, versiones y exportaciones. ' : ''}Crea o elige una carpeta en tu ordenador (por ejemplo <b>Documentos/Proyectos TBS</b>). Cada proyecto tendrá dentro su propia carpeta con los vídeos originales, así se puede abrir en cualquier ordenador.</p></div>
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
          <h2 class="home-h2 grow">${cl.on ? `Carpeta “${lib.ws.name}” · ` : ''}${list.length} proyecto${list.length === 1 ? '' : 's'}${lib.loading ? ' · cargando…' : ''}</h2>
          ${!cl.on && html`<input class="input" style="max-width:260px" placeholder="Buscar…" value=${q} onInput=${e => setQ(e.target.value)} />`}
          <button class="tl-icon" title="Actualizar" onClick=${L.refresh}><${Icon} name="repeat" /></button>
        </div>
        <div class="proj-grid">
          <button class="proj-card new" onClick=${() => setCreating(true)}><span class="pc-thumb"><span class="pc-empty"><${Icon} name="plus" /></span></span><div class="pc-info"><b>Proyecto nuevo</b><span>Empieza desde cero</span></div></button>
          ${list.map(p => html`<${ProjectCard} key=${p.name} p=${p} />`)}
        </div>
        ${!list.length && !lib.loading && html`<p class="muted" style="margin-top:12px">Aún no hay proyectos en esta carpeta.</p>`}`}
      ${folders && html`<p class="dim small" style="margin-top:28px">Para pasar un proyecto a otra persona: menú del proyecto › <b>Compartir (.zip)</b>. Ella lo abre con <b>Importar proyecto</b> (incluye los vídeos originales, subtítulos, motions y miniaturas).</p>`}
    </div>
    ${creating && html`<${NewModal} onClose=${() => setCreating(false)} />`}
  </div>`;
}
