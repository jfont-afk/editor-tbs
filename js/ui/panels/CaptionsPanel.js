import { html, useState, useEffect, useRef, useMemo, fmtTime } from '../../lib.js';
import { state, update, setUI, projectVersion, toast } from '../../core/store.js';
import { Btn, Section, Slider, Toggle, Seg, Select, Swatches } from '../controls.js';
import { Icon } from '../icons.js';
import * as A from '../../core/actions.js';
import { captionGroups, resolveStyle } from '../../core/captions.js';
import { CAPTION_TEMPLATES, TEMPLATE_CATS, ANIMS, allTemplates, deleteUserTemplate } from '../../data/captionTemplates.js';
import { layoutCaption, drawCaption } from '../../render/captions.js';
import { WHISPER_MODELS, LANGS } from '../../ai/transcribe.js';
import { player, timeBus } from '../../engine/player.js';
import { C } from '../../data/brand.js';
import { MOTIONS } from '../../render/motions.js';
import { motionPreview } from './MotionsPanel.js';
import { runtime } from '../../core/store.js';
import { GLOSSARY_DEFAULT, userGlossary, saveUserGlossary } from '../../ai/glossary.js';

// ---------- Miniaturas de plantillas (renderizadas con el motor real) ----------
const SAMPLES = {
  1: [['invertir', 1]], 2: [['invertir', 0], ['mejor', 1]], 3: [['invierte', 0], ['con', 0], ['cabeza', 1]],
  4: [['aprende', 0], ['a', 0], ['invertir', 1], ['mejor', 0]], 5: [['aprende', 0], ['a', 0], ['invertir', 1], ['sin', 0], ['miedo', 0]],
};
export const previewCache = new Map();
export function templatePreview(tpl) {
  if (previewCache.has(tpl.id)) return previewCache.get(tpl.id);
  const W = 432, H = 540;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = C.n900; x.fillRect(0, 0, W, H);
  const g = x.createRadialGradient(W / 2, H * 1.05, 10, W / 2, H * 1.05, H * 0.8);
  g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // silueta suave de persona
  x.save(); x.filter = 'blur(6px)'; x.fillStyle = '#2b2b31';
  x.beginPath(); x.ellipse(W / 2, H * 0.36, W * 0.15, H * 0.13, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(W / 2, H * 0.9, W * 0.36, H * 0.32, 0, 0, Math.PI * 2); x.fill();
  x.restore();
  const n = Math.min(5, tpl.words);
  const words = SAMPLES[n].map(([text, hl], i) => ({ w: { id: 'p' + i, text, hl }, ts: i * 0.3, te: i * 0.3 + 0.3 }));
  const grp = { id: 'p0', items: words, start: 0, end: 10 };
  const st = resolveStyle({ template: tpl.id, size: 1, upper: 'auto', posY: tpl.posY }, null);
  st.posY = 0.55;
  const env = { W, H, u: Math.min(W, H) / 1080 * 1.9, safe: { x: W * 0.06, y: H * 0.06, w: W * 0.88, h: H * 0.88 } };
  const L = layoutCaption(x, grp, st, env);
  drawCaption(x, grp, words[words.length - 1].ts + 0.2, st, L, env, { backdrop: c });
  const url = c.toDataURL('image/jpeg', 0.85);
  previewCache.set(tpl.id, url);
  return url;
}

function Generate() {
  const p = state.project;
  const [model, setModel] = useState(WHISPER_MODELS[1].id);
  const [lang, setLang] = useState('spanish');
  const has = Object.keys(p.transcripts).length > 0;
  if (!p.clips.length) return html`<div class="note">Importa un vídeo para generar los subtítulos.</div>`;
  return html`<div class="stack">
    ${!has && html`<div class="note">La voz se transcribe <b>en tu ordenador</b> palabra a palabra. La primera vez se descarga el modelo; después queda guardado.</div>`}
    <div class="stack" style="gap:6px">
      ${WHISPER_MODELS.map(m => html`<button class=${'card' + (model === m.id ? ' on' : '')} style="padding:9px 11px" onClick=${() => setModel(m.id)}>
        <div style="font-weight:700">${m.name}</div><div class="dim small">${m.sub}</div></button>`)}
    </div>
    <${Select} label="Idioma" value=${lang} options=${LANGS} onChange=${setLang} />
    <${Btn} cls=${has ? '' : 'fluor lg'} icon="wand" onClick=${() => A.transcribeAll({ model, lang, force: has })}>${has ? 'Volver a transcribir' : 'Generar subtítulos'}</${Btn}>
  </div>`;
}

function Templates() {
  const p = state.project;
  const [cat, setCat] = useState('Todas');
  const [, force] = useState(0);
  const all = allTemplates();
  const cats = ['Todas', ...TEMPLATE_CATS, ...(all.some(t => t.cat === 'Mis plantillas') ? ['Mis plantillas'] : [])];
  const list = all.filter(t => cat === 'Todas' || t.cat === cat);
  return html`<div class="stack">
    <div class="row wrap" style="gap:4px">${cats.map(c => html`<button class=${'chip' + (cat === c ? ' on' : '')} onClick=${() => setCat(c)}>${c}</button>`)}</div>
    <div class="cards three">
      ${list.map(t => html`<div class=${'card' + (p.captions.template === t.id ? ' on' : '')} key=${t.id} title=${t.ref} role="button" tabindex="0"
        onClick=${() => update(pp => { pp.captions.template = t.id; pp.captions.wordsPerGroup = t.words || pp.captions.wordsPerGroup; pp.captions.maxChars = t.maxChars || pp.captions.maxChars; pp.captions.posY = t.posY ?? pp.captions.posY; pp.captions.posX = t.posX ?? 0.5; pp.captions.posFree = !!t.user; pp.captions.style = {}; pp.captions.anim = null; pp.captions.color = null; pp.captions.hlColor = null; })}>
        <img src=${templatePreview(t)} style="aspect-ratio:4/5" />
        <div class="card-label">${t.name}${t.cat === 'Mis plantillas' && html`<button class="gbtn" title="Borrar plantilla" onClick=${e => { e.stopPropagation(); deleteUserTemplate(t.id); previewCache.delete(t.id); force(n => n + 1); }}><${Icon} name="trash" /></button>`}</div>
      </div>`)}
    </div>
  </div>`;
}

function Settings() {
  const p = state.project, c = p.captions;
  const set = (k, key) => (v) => update(pp => { pp.captions[k] = v; }, { key: key || ('cap' + k) });
  return html`<div class="stack">
    <div class="field"><span class="field-label">Palabras en pantalla</span>
      <${Seg} value=${c.wordsPerGroup} onChange=${v => update(pp => { pp.captions.wordsPerGroup = v; pp.captions.maxChars = Math.max(12, v * 7); })} options=${[[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [8, '8']]} />
    </div>
    <${Slider} label="Tamaño" value=${c.size} min=${0.5} max=${1.8} step=${0.01} format=${v => Math.round(v * 100) + '%'} onInput=${set('size')} />
    <${Slider} label="Posición vertical" value=${c.posY} min=${0.1} max=${0.9} step=${0.005} format=${v => Math.round(v * 100) + '%'} onInput=${set('posY')} />
    <div class="grid3">
      <${Btn} cls="sm" onClick=${() => set('posY')(0.3)}>Arriba</${Btn}>
      <${Btn} cls="sm" onClick=${() => set('posY')(0.5)}>Centro</${Btn}>
      <${Btn} cls="sm" onClick=${() => set('posY')(0.66)}>Abajo</${Btn}>
    </div>
    <div class="field"><span class="field-label">Mayúsculas</span>
      <${Seg} value=${c.upper} onChange=${set('upper')} options=${[['auto', 'Plantilla'], ['on', 'MAYÚS'], ['off', 'minús']]} />
    </div>
    <${Swatches} label="Color del texto" allowNone value=${c.color} onChange=${set('color')} />
    <${Swatches} label="Color de las palabras destacadas" allowNone value=${c.hlColor} onChange=${set('hlColor')} />
    <${Select} label="Animación" value=${c.anim || ''} options=${[['', 'La de la plantilla'], ...ANIMS.map(a => [a.id, a.name])]} onChange=${v => set('anim')(v || null)} />
    <${Toggle} label="Texto detrás de la persona" sub="Recorta a la persona por delante del texto (IA)" value=${c.behind} onChange=${set('behind')} />
    <${Toggle} label="Legibilidad automática" sub="Refuerza el contraste y ajusta el tamaño" value=${c.autoReadable} onChange=${set('autoReadable')} />
    <${Toggle} label="Evitar tapar la cara" sub="Mueve el bloque si coincide con la cara" value=${c.avoidFace} onChange=${set('avoidFace')} />
    <${Toggle} label="Cortar en los signos de puntuación" value=${c.breakOnPunct} onChange=${set('breakOnPunct')} />
  </div>`;
}

function WordChip({ it }) {
  const [edit, setEdit] = useState(false);
  const w = it.w;
  if (edit) return html`<input class="gword-edit" autofocus value=${w.text}
    onKeyDown=${e => { if (e.key === 'Enter') { A.editWordText(w.id, e.target.value.trim() || w.text); setEdit(false); } if (e.key === 'Escape') setEdit(false); }}
    onBlur=${e => { A.editWordText(w.id, e.target.value.trim() || w.text); setEdit(false); }} />`;
  return html`<button class=${'gword' + (w.hl ? ' hl' + w.hl : '') + (w.nl ? ' nl' : '')} title="Clic: destacar · Doble clic: editar · Arrastra al bloque de al lado para moverla" draggable="true"
    onDragStart=${e => { e.dataTransfer.setData('text/x-tbs-word', w.id); e.dataTransfer.effectAllowed = 'move'; }}
    onClick=${e => { e.stopPropagation(); A.cycleHighlight(w.id); }} onDblClick=${e => { e.stopPropagation(); setEdit(true); }}>${w.text}</button>`;
}

function Groups() {
  const p = state.project, ui = state.ui;
  const groups = captionGroups(p, projectVersion);
  const [cur, setCur] = useState(null);
  const listRef = useRef();
  useEffect(() => timeBus.sub(t => {
    const g = groups.find(x => t >= x.start && t < x.end);
    setCur(g ? g.id : null);
  }), [groups]);
  useEffect(() => {
    if (!state.ui.playing || !cur || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-g="${cur}"]`);
    // desplaza solo la lista del panel (nunca la página)
    const box = el?.closest('.panel-body');
    if (el && box) {
      const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
      if (r.top < b.top) box.scrollTop -= b.top - r.top + 8;
      else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 8;
    }
  }, [cur]);
  const [over, setOver] = useState(null);
  if (!groups.length) return html`<div class="dim small">Aún no hay bloques.</div>`;
  return html`<div class="groups" ref=${listRef}>
    ${groups.map((g, gi) => {
      const behind = g.ov?.behind ?? p.captions.behind;
      return html`<div key=${g.id} data-g=${g.id} class=${'group' + (cur === g.id ? ' cur' : '') + (ui.sel?.id === g.id ? ' sel' : '') + (over === g.id ? ' drop' : '')}
        onDragOver=${e => { if (e.dataTransfer.types.includes('text/x-tbs-word')) { e.preventDefault(); setOver(g.id); } }}
        onDragLeave=${() => setOver(o => (o === g.id ? null : o))}
        onDrop=${e => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/x-tbs-word'); if (id) A.moveWordToBlock(id, g.id); }}
        onClick=${() => { setUI({ sel: { type: 'group', id: g.id } }); player.seek(g.start + 0.01); }}>
        <div class="group-top">
          <span>${fmtTime(g.start, true)}</span>
          ${g.ov?.template && html`<span class="tag fluor" style="height:16px;font-size:8px">propio</span>`}
          <span class="spacer"></span>
          <button class="gbtn" title="Editar el texto en el reproductor" onClick=${e => { e.stopPropagation(); player.seek(g.start + 0.01); player.pause(); setUI({ sel: { type: 'group', id: g.id }, editCap: g.id }); }}><${Icon} name="pencil" /></button>
          ${gi > 0 && html`<button class="gbtn" title="Unir con el bloque anterior" onClick=${e => { e.stopPropagation(); A.joinWithPrev(g.id); }}><${Icon} name="merge" /></button>`}
          <button class=${'gbtn' + (behind ? ' on' : '')} title="Detrás de la persona" onClick=${e => { e.stopPropagation(); A.setGroupStyle(g.id, { behind: !behind }); }}><${Icon} name="userBehind" /></button>
          <button class=${'gbtn' + (g.ov?.hidden ? ' on' : '')} title=${g.ov?.hidden ? 'Mostrar' : 'Ocultar este bloque'} onClick=${e => { e.stopPropagation(); A.setGroupStyle(g.id, { hidden: g.ov?.hidden ? null : true }); }}><${Icon} name=${g.ov?.hidden ? 'eyeOff' : 'eye'} /></button>
        </div>
        <div class="gw" style=${g.ov?.hidden ? 'opacity:.4' : ''}>
          ${g.items.map((it, i) => html`${i > 0 && html`<button class="gcut" title="Separar aquí" onClick=${e => { e.stopPropagation(); A.splitBefore(it.w.id); }}>|</button>`}<${WordChip} it=${it} />`)}
        </div>
      </div>`;
    })}
  </div>`;
}

// ---------- Glosario: términos en inglés dentro del español ----------
function Glossary() {
  const [txt, setTxt] = useState(userGlossary());
  const [open, setOpen] = useState(false);
  const n = Object.keys(GLOSSARY_DEFAULT).length;
  return html`<div class="stack">
    <div class="dim small">Se corrigen solos al transcribir ${n} términos de trading y marketing (stop loss, price action, broker, setup, TradingView…). Añade los tuyos: uno por línea, y si quieres, cómo lo escribe mal la transcripción después de “=”.</div>
    ${open ? html`<textarea class="input" rows="6" placeholder=${'Renta 4\nfunded account = fanded acaunt, fonded account\nMarco Dimio = marco dimio'} value=${txt} onInput=${e => setTxt(e.target.value)}></textarea>
      <div class="row" style="gap:6px"><${Btn} cls="sm primary" onClick=${async () => { saveUserGlossary(txt); await A.runGlossary(); }}>Guardar y aplicar</${Btn}><${Btn} cls="sm ghost" onClick=${() => setOpen(false)}>Cerrar</${Btn}></div>`
      : html`<div class="row" style="gap:6px"><${Btn} cls="sm" icon="pencil" onClick=${() => setOpen(true)}>Mis términos</${Btn}><${Btn} cls="sm" icon="check" onClick=${A.runGlossary}>Corregir ahora</${Btn}></div>`}
    <div class="dim small">Para vídeos con mucho inglés, el modelo <b>Preciso</b> o <b>Máximo</b> reconoce mejor los términos.</div>
  </div>`;
}

// ---------- Cajas de texto libres ----------
const TEXT_STYLES = ['texto', 'tituloeditorial', 'gancho', 'destino', 'tituloglow', 'etiqueta', 'cita', 'lowerthird', 'tachado', 'seleccion'];
function TextBoxes() {
  const p = state.project, ui = state.ui;
  const list = p.overlays.filter(o => TEXT_STYLES.includes(o.type)).sort((a, b) => a.start - b.start);
  const label = (o) => String(o.props.text || o.props.title || o.props.name || o.props.word || MOTIONS[o.type]?.name || '').split('\n')[0];
  return html`<div class="stack">
    <div class="cards">
      ${TEXT_STYLES.filter(id => MOTIONS[id]).map(id => html`<button class="card" key=${id} disabled=${!p.clips.length} onClick=${() => A.addOverlay(id)} title=${'Añadir ' + MOTIONS[id].name}>
        <img src=${motionPreview(id)} style="aspect-ratio:16/9" />
        <div class="card-label">${MOTIONS[id].name}</div>
      </button>`)}
    </div>
    ${list.length > 0 && html`<div class="zoom-list">${list.map(o => html`<button class=${'zl-row' + (ui.sel?.id === o.id ? ' on' : '')} onClick=${() => { setUI({ sel: { type: 'overlay', id: o.id } }); player.seek(o.start + 0.05); }}>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label(o)}</span><span class="dim">${fmtTime(o.start)}${o.behind ? ' · detrás' : ''}</span></button>`)}</div>`}
    <div class="dim small">Arrástralas en el reproductor (el imán las centra y las pega a los márgenes). Tipografía, mayúsculas, tamaño y color a la derecha.</div>
  </div>`;
}

// ---------- Imágenes libres ----------
function Images() {
  const p = state.project, ui = state.ui;
  const imgs = p.assets.filter(a => a.kind === 'image');
  const list = p.overlays.filter(o => o.type === 'imagen');
  const pick = () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    inp.onchange = () => A.importImageOverlays(inp.files); inp.click();
  };
  return html`<div class="stack">
    <div class=${'dropzone small'} onDragOver=${e => e.preventDefault()} onDrop=${e => { e.preventDefault(); A.importImageOverlays(e.dataTransfer.files); }}>
      <${Icon} name="imagePlus" />
      <span class="muted small">PNG, JPG o WEBP · logos, capturas, fotos</span>
      <${Btn} cls="primary" icon="upload" disabled=${!p.clips.length} onClick=${pick}>Añadir imagen</${Btn}>
    </div>
    ${imgs.length > 0 && html`<div class="field"><span class="field-label">Imágenes del proyecto</span>
      <div class="img-grid">${imgs.map(a => { const rt = runtime.assets.get(a.id); return html`<button class="img-cell" title=${'Añadir ' + a.name} onClick=${() => A.addImageOverlay(a.id)}>${rt?.url ? html`<img src=${rt.url} />` : a.name}</button>`; })}</div></div>`}
    ${list.length > 0 && html`<div class="zoom-list">${list.map(o => html`<button class=${'zl-row' + (ui.sel?.id === o.id ? ' on' : '')} onClick=${() => { setUI({ sel: { type: 'overlay', id: o.id } }); player.seek(o.start + 0.05); }}>
      <span>${p.assets.find(a => a.id === o.props.assetId)?.name || 'Imagen'}</span><span class="dim">${fmtTime(o.start)}${o.behind ? ' · detrás' : ''}</span></button>`)}</div>`}
  </div>`;
}

export function CaptionsPanel() {
  const p = state.project;
  const has = Object.keys(p.transcripts).length > 0;
  const [area, setArea] = useState('subs');
  const [sub, setSub] = useState(has ? 'tpl' : 'gen');
  const view = has ? sub : 'gen';
  const nGroups = has ? captionGroups(p, projectVersion).length : 0;
  return html`
    <div class="panel-head">
      <div class="row" style="justify-content:space-between">
        <h2 class="panel-title">Texto</h2>
        ${area === 'subs' && has && html`<${Toggle} label=${p.captions.enabled ? 'Subtítulos visibles' : 'Subtítulos ocultos'} value=${p.captions.enabled} onChange=${v => update(pp => { pp.captions.enabled = v; })} />`}
      </div>
      <div style="margin:8px 0 2px"><${Seg} value=${area} onChange=${setArea} options=${[['subs', 'Subtítulos'], ['text', 'Cajas de texto'], ['img', 'Imágenes']]} /></div>
      ${area === 'subs' && has && html`<div class="subtabs">
        ${[['gen', 'Generar'], ['tpl', 'Plantillas'], ['blocks', `Bloques · ${nGroups}`]].map(([k, l]) => html`<button class=${view === k ? 'on' : ''} onClick=${() => setSub(k)}>${l}</button>`)}
      </div>`}
    </div>
    <div class="panel-body">
      ${area === 'text' && html`<${Section} title="Estilos de texto" hint="se añade en el cursor"><${TextBoxes} /></${Section}>`}
      ${area === 'img' && html`<${Section} title="Imágenes"><${Images} /></${Section}>`}
      ${area === 'subs' && view === 'gen' && html`
        <${Section} title="Transcripción automática"><${Generate} /></${Section}>
        ${has && html`<${Section} title="Términos en inglés y nombres" hint="se corrigen solos"><${Glossary} /></${Section}>`}`}
      ${area === 'subs' && view === 'tpl' && html`
        <${Section} title="Palabras en pantalla">
          <div class="stack">
            <${Seg} value=${p.captions.wordsPerGroup} onChange=${v => update(pp => { pp.captions.wordsPerGroup = v; pp.captions.maxChars = Math.max(12, v * 7); })} options=${[[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [8, '8']]} />
            <${Toggle} label="Cortar en los signos de puntuación" value=${p.captions.breakOnPunct} onChange=${v => update(pp => { pp.captions.breakOnPunct = v; })} />
          </div>
        </${Section}>
        <${Section} title="Pack de plantillas" hint="ajusta el estilo a la derecha"><${Templates} /></${Section}>`}
      ${area === 'subs' && view === 'blocks' && html`
        <div class="row wrap" style="gap:6px;margin:6px 0 10px">
          <${Btn} cls="sm primary" icon="plus" onClick=${() => A.newBlockAtPlayhead()}>Bloque nuevo en el cursor</${Btn}>
          <${Btn} cls="sm" icon="sparkles" onClick=${A.runAutoHighlight}>Destacar automáticamente</${Btn}>
          <${Btn} cls="sm ghost" icon="repeat" onClick=${A.clearManualBreaks}>Reagrupar</${Btn}>
        </div>
        <div class="hint-box"><b>Clic</b> en una palabra = destacar · <b>doble clic</b> = corregir · <b>|</b> = separar · <b>arrastra</b> una palabra al bloque de al lado para moverla · <b>doble clic en el reproductor</b> para reescribir el bloque (Intro = dos líneas)</div>
        <${Groups} />`}
    </div>`;
}
