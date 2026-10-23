import { html, useState } from '../lib.js';
import { Icon } from './icons.js';
import { cloud } from '../core/cloud.js';

// Cuenta (versión web): estado del guardado en la nube, administración y salir
export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const u = cloud.user;
  if (!u) return null;
  const st = { saving: 'Guardando en tu cuenta…', pending: 'Cambios sin guardar…', saved: 'Guardado en tu cuenta', error: 'No se pudo guardar en la nube' }[cloud.status] || 'Los proyectos se guardan en tu cuenta';
  const initial = (u.name || u.email || '?').trim()[0].toUpperCase();
  return html`<div class="pmenu">
    <button class="btn sm ghost acc-btn" onClick=${() => setOpen(!open)} title=${u.email}>
      <span class="acc-av">${initial}</span><span class=${'pm-dot ' + (cloud.status === 'pending' ? 'saving' : cloud.status)}></span>
    </button>
    ${open && html`<div class="pm-pop right" onMouseLeave=${() => setOpen(false)}>
      <div class="pm-status"><b>${u.name || u.email}</b><br /><span class="dim">${u.email}</span><br />${st}</div>
      ${u.role === 'admin' && html`<a class="pm-link" href="/admin"><${Icon} name="settings" />Administración e invitaciones</a>`}
      <a class="pm-link" href="/cuenta"><${Icon} name="pencil" />Cambiar la contraseña</a>
      <a class="pm-link" href="/logout"><${Icon} name="x" />Cerrar sesión</a>
    </div>`}
  </div>`;
}
