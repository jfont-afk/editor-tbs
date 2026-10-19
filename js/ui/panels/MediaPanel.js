import { html, useState, fmtDur } from '../../lib.js';
import { state, runtime, update } from '../../core/store.js';
import { Icon } from '../icons.js';
import { Btn, Section, Seg, Toggle } from '../controls.js';
import * as A from '../../core/actions.js';

function thumbUrl(id) {
  const rt = runtime.assets.get(id);
  const b = rt?.thumbs?.[Math.floor((rt.thumbs.length || 1) / 3)]?.bmp;
  if (!b) return null;
  if (rt._thumbUrl) return rt._thumbUrl;
  const c = document.createElement('canvas'); c.width = b.width; c.height = b.height;
  c.getContext('2d').drawImage(b, 0, 0);
  rt._thumbUrl = c.toDataURL('image/jpeg', 0.7);
  return rt._thumbUrl;
}

export function MediaPanel() {
  const p = state.project;
  const [over, setOver] = useState(false);
  return html`
    <div class="panel-head">
      <h2 class="panel-title">Medios</h2>
      <p class="panel-desc">Tus vídeos y fotos del proyecto.</p>
    </div>
    <div class="panel-body">
      <div class=${'dropzone' + (over ? ' over' : '')}
        onDragOver=${e => { e.preventDefault(); setOver(true); }} onDragLeave=${() => setOver(false)}
        onDrop=${e => { e.preventDefault(); setOver(false); window.__dropFiles(e); }}>
        <${Icon} name="upload" />
        <h3>Arrastra vídeos o fotos</h3>
        <button class="btn fluor" onClick=${() => window.__openFiles()}><${Icon} name="folder" />Elegir archivos</button>
      </div>
      ${p.assets.length > 0 && html`<${Section} title="En el proyecto" hint=${p.assets.length + ' archivo(s)'}>
        <div class="stack">
          ${p.assets.map(a => {
            const rt = runtime.assets.get(a.id);
            const used = p.clips.filter(c => c.assetId === a.id).length;
            const turl = thumbUrl(a.id);
            return html`<div class="asset" key=${a.id}>
              <div class="asset-thumb" style=${turl ? `background-image:url(${turl})` : ''}><span>${a.kind === 'image' ? 'FOTO' : fmtDur(a.duration)}</span></div>
              <div style="min-width:0">
                <div class="asset-name" title=${a.name}>${a.name}</div>
                <div class="asset-meta">${a.width}×${a.height}${a.kind === 'video' ? (a.hasAudio === false ? ' · sin audio' : '') : ''} · ${used} en línea de tiempo${rt?.status === 'analyzing' ? ' · analizando…' : ''}${!rt ? ' · falta el archivo' : ''}</div>
              </div>
              <div class="row" style="gap:2px">
                <${Btn} cls="icon sm ghost" icon="plus" title="Añadir otra vez al final" disabled=${!rt} onClick=${() => A.addAssetToTimeline(a.id)} />
                <${Btn} cls="icon sm ghost danger" icon="trash" title="Quitar del proyecto" onClick=${() => A.removeAsset(a.id)} />
              </div>
            </div>`;
          })}
        </div>
      </${Section}>`}
      <${Section} collapsible open=${false} icon="frame" title="Encuadre de vídeos horizontales">
        <${Seg} value=${p.fit} onChange=${v => update(pp => { pp.fit = v; })} options=${[['cover', 'Rellenar (recorta)'], ['blur', 'Completo + fondo desenfocado']]} />
      </${Section}>
      <${Section} collapsible open=${false} icon="shield" title="Logo de la marca">
        <div class="stack">
          <div class="note">El logo se usa en la motion <b>Logo</b> y en las miniaturas. Sube el SVG o PNG del Design System (assets/logos).</div>
          <div class="row">
            ${p.brand?.logo && html`<img src=${p.brand.logo} style="height:34px;max-width:140px;object-fit:contain;background:#000;border-radius:8px;padding:4px" />`}
            <label class="btn sm"><${Icon} name="upload" />${p.brand?.logo ? 'Cambiar logo' : 'Subir logo'}
              <input type="file" accept="image/svg+xml,image/png,image/webp" style="display:none" onChange=${e => {
                const f = e.target.files[0]; if (!f) return;
                const r = new FileReader(); r.onload = () => update(pp => { pp.brand = { ...(pp.brand || {}), logo: r.result }; }); r.readAsDataURL(f);
              }} />
            </label>
            ${p.brand?.logo && html`<${Btn} cls="sm ghost" onClick=${() => update(pp => { pp.brand.logo = null; })}>Quitar</${Btn}>`}
          </div>
        </div>
      </${Section}>
    </div>`;
}
