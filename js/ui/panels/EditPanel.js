import { html, useState, useEffect, useMemo, fmtDur, fmtTime } from '../../lib.js';
import { state, runtime, update, setUI, toast, projectVersion } from '../../core/store.js';
import { Btn, Section, Slider, Toggle, Seg } from '../controls.js';
import { Icon } from '../icons.js';
import * as A from '../../core/actions.js';
import { timelineWords } from '../../core/captions.js';
import { isFiller } from '../../media/takes.js';
import { player, timeBus } from '../../engine/player.js';

function Silences() {
  const p = state.project;
  const ready = p.assets.some(a => runtime.assets.get(a.id)?.audio);
  const [o, setO] = useState(null);
  const [found, setFound] = useState(null);
  useEffect(() => { if (ready && !o) setO(A.silenceDefaults()); }, [ready]);
  useEffect(() => () => setUI({ silencePreview: null }), []);
  const detect = (opts = o) => {
    const r = A.findSilences(opts);
    setFound(r);
    setUI({ silencePreview: r.preview });
  };
  if (!p.clips.length) return html`<div class="note">Importa un vídeo para quitar silencios.</div>`;
  if (!ready || !o) return html`<div class="note">Analizando el audio…</div>`;
  const ch = (k) => (v) => { const n = { ...o, [k]: v }; setO(n); if (found) detect(n); };
  return html`<div class="stack">
    <${Slider} label="Umbral de silencio" value=${o.threshold} min=${-65} max=${-15} step=${1} format=${v => v + ' dB'} onInput=${ch('threshold')} hint="(más alto = corta más)" />
    <${Slider} label="Pausa mínima" value=${o.minSilence} min=${0.15} max=${2} step=${0.05} format=${v => v.toFixed(2).replace('.', ',') + ' s'} onInput=${ch('minSilence')} />
    <${Slider} label="Margen alrededor de la voz" value=${o.padding} min=${0} max=${0.4} step=${0.01} format=${v => v.toFixed(2).replace('.', ',') + ' s'} onInput=${ch('padding')} />
    <div class="row">
      <${Btn} cls="grow" icon="silence" onClick=${() => detect()}>Detectar silencios</${Btn}>
      <${Btn} cls="fluor grow" icon="scissors" disabled=${!found || !found.preview.length} onClick=${() => {
        const r = A.removeSilences(found.byAsset); setFound(null);
        toast(`Silencios eliminados: ${fmtDur(r)} menos`);
      }}>Eliminar</${Btn}>
    </div>
    ${found && html`<div class=${'note ' + (found.preview.length ? 'warn' : 'ok')}>${found.preview.length
      ? html`<b>${found.preview.length}</b> silencios · <b>${fmtDur(found.total)}</b> se quitarán (marcados en rojo en la línea de tiempo).`
      : 'No hay silencios con estos ajustes.'}</div>`}
  </div>`;
}

function Takes() {
  const p = state.project;
  const has = Object.keys(p.transcripts).length > 0;
  const [list, setList] = useState(null);
  const [checked, setChecked] = useState({});
  if (!has) return html`<div class="note">Genera la transcripción (pestaña <b>Subtítulos</b>) para detectar tomas repetidas y muletillas.</div>`;
  return html`<div class="stack">
    <div class="row">
      <${Btn} cls="grow" icon="repeat" onClick=${() => { const l = A.findTakes(); setList(l); setChecked(Object.fromEntries(l.map(x => [x.id, true]))); if (!l.length) toast('No se han encontrado tomas repetidas'); }}>Detectar tomas repetidas</${Btn}>
    </div>
    ${list && list.length > 0 && html`<div class="stack">
      ${list.map(k => html`<div class="group" key=${k.id}>
        <div class="group-top"><span>${fmtTime(k.tl)}</span><span class="spacer"></span>
          <label class="row small" style="gap:6px;cursor:pointer"><input type="checkbox" checked=${checked[k.id]} onChange=${e => setChecked({ ...checked, [k.id]: e.target.checked })} />quitar</label></div>
        <div class="small" style="text-decoration:line-through;color:var(--red-300)">${k.text}</div>
        <div class="small" style="margin-top:4px;color:var(--green-200)">Se queda: ${k.keepText}</div>
        <button class="btn sm ghost" style="margin-top:4px" onClick=${() => { player.seek(k.tl); player.play(); }}><${Icon} name="play" />Escuchar</button>
      </div>`)}
      <${Btn} cls="fluor" icon="scissors" onClick=${() => {
        const r = A.applyRanges(list.filter(k => checked[k.id])); setList(null);
        toast(`Tomas eliminadas: ${fmtDur(r)} menos`);
      }}>Quitar tomas marcadas</${Btn}>
    </div>`}
    <${Btn} icon="silence" onClick=${() => {
      const f = A.findFillers();
      if (!f.length) { toast('No hay muletillas (eh, mmm…) en la transcripción'); return; }
      const r = A.applyRanges(f); toast(`${f.length} muletillas eliminadas (${fmtDur(r)})`);
    }}>Quitar muletillas (eh, mmm…)</${Btn}>
  </div>`;
}

function TextEdit() {
  const p = state.project, ui = state.ui;
  const words = useMemo(() => timelineWords(p), [projectVersion]);
  const [cur, setCur] = useState(null);
  const [anchor, setAnchor] = useState(null);
  useEffect(() => timeBus.sub(t => {
    const w = words.find(x => t >= x.ts && t < x.te);
    setCur(w ? w.w.id : null);
  }), [words]);
  if (!Object.keys(p.transcripts).length) return html`<div class="note">Cuando generes los subtítulos podrás <b>editar el vídeo como un texto</b>: selecciona palabras y bórralas para cortar esos trozos.</div>`;
  const sel = new Set(ui.wordSel);
  const click = (e, i, w) => {
    if (e.shiftKey && anchor !== null) {
      const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)];
      setUI({ wordSel: words.slice(a, b + 1).map(x => x.w.id) });
    } else if (e.ctrlKey || e.metaKey) {
      setUI({ wordSel: sel.has(w.w.id) ? ui.wordSel.filter(x => x !== w.w.id) : [...ui.wordSel, w.w.id] });
      setAnchor(i);
    } else {
      setUI({ wordSel: [w.w.id] }); setAnchor(i);
      player.seek(w.ts + 0.01);
    }
  };
  return html`<div class="stack">
    <div class="row">
      <${Btn} cls="sm danger" icon="trash" disabled=${!sel.size} onClick=${() => { const r = A.removeWords(ui.wordSel); toast(`Cortado: ${fmtDur(r)}`); }}>Borrar selección (${sel.size})</${Btn}>
      <span class="dim small">Clic · Mayús+clic para un tramo</span>
    </div>
    <div class="words" onKeyDown=${e => { if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size) { e.preventDefault(); A.removeWords(ui.wordSel); } }} tabindex="0">
      ${words.map((w, i) => html`<span key=${w.w.id} class=${'word' + (sel.has(w.w.id) ? ' sel' : '') + (cur === w.w.id ? ' cur' : '') + (isFiller(w.w) ? ' filler' : '') + (w.w.hl ? ' hl' + w.w.hl : '')}
        onClick=${e => click(e, i, w)}>${w.w.text} </span>`)}
    </div>
  </div>`;
}

function HeadFrame() {
  const p = state.project;
  const rf = p.clips.find(c => c.reframe)?.reframe;
  const [mode, setMode] = useState(rf?.mode || 'follow');
  if (!p.clips.length) return html`<div class="note">Importa un vídeo primero.</div>`;
  return html`<div class="stack">
    <div class="dim small" style="line-height:1.5">Detecta la cara y ajusta zoom y posición para que la cabeza quede en la zona superior central, siempre por encima de los subtítulos.</div>
    <${Seg} value=${rf?.mode || mode} onChange=${v => { setMode(v); if (rf) A.setReframe({ mode: v }); }} options=${[['follow', 'Seguir movimiento'], ['fixed', 'Encuadre fijo']]} />
    ${rf && html`
      <${Slider} label="Altura de la cabeza" value=${rf.y ?? 0.32} min=${0.18} max=${0.5} step=${0.005} format=${v => Math.round(v * 100) + '%'} onInput=${v => A.setReframe({ y: v })} />
      <${Slider} label="Zoom máximo" value=${rf.maxZoom ?? 1.8} min=${1} max=${2.5} step=${0.05} format=${v => Math.round(v * 100) + '%'} onInput=${v => A.setReframe({ maxZoom: v })} />`}
    <div class="row">
      <${Btn} cls="fluor grow" icon="user" onClick=${() => A.autoFrameHeads({ mode, y: rf?.y ?? 0.32, maxZoom: rf?.maxZoom ?? 1.8 })}>${rf ? 'Volver a encuadrar' : 'Colocar la cabeza arriba'}</${Btn}>
      ${rf && html`<${Btn} cls="ghost" onClick=${A.clearReframe}>Quitar</${Btn}>`}
    </div>
  </div>`;
}

export function EditPanel() {
  const p = state.project;
  return html`
    <div class="panel-head">
      <h2 class="panel-title">Editar</h2>
      <p class="panel-desc">Cortes, silencios, tomas y encuadre.</p>
    </div>
    <div class="panel-body">
      <${Section} collapsible open=${true} icon="scissors" title="Cortes" hint="S · Q · W">
        <div class="grid2">
          <${Btn} icon="scissors" kbd="S" onClick=${A.splitAtPlayhead}>Cortar</${Btn}>
          <${Btn} icon="trash" kbd="Supr" disabled=${state.ui.sel?.type !== 'clip'} onClick=${A.deleteSelection}>Borrar clip</${Btn}>
          <${Btn} icon="trimL" kbd="Q" onClick=${() => A.trimPlayhead('in')}>Inicio aquí</${Btn}>
          <${Btn} icon="trimR" kbd="W" onClick=${() => A.trimPlayhead('out')}>Final aquí</${Btn}>
        </div>
      </${Section}>
      <${Section} collapsible open=${true} icon="silence" title="Quitar silencios"><${Silences} /></${Section}>
      <${Section} collapsible open=${false} icon="user" title="Encuadre de la cabeza" hint="TikTok"><${HeadFrame} /></${Section}>
      <${Section} collapsible open=${false} icon="repeat" title="Tomas repetidas y muletillas"><${Takes} /></${Section}>
      <${Section} collapsible open=${false} icon="zap" title="Ritmo y transiciones">
        <div class="stack">
          <${Toggle} label="Zoom alterno en los cortes" sub="Oculta los saltos de plano tras quitar silencios" value=${p.autoZoom} onChange=${v => update(pp => { pp.autoZoom = v; })} />
          <${Btn} icon="wand" onClick=${() => { const n = A.smartTransitions(); toast(n ? `${n} transiciones aplicadas con lógica` : 'Transiciones actualizadas'); }}>Transiciones inteligentes</${Btn}>
          <div class="dim small">Mismo plano → zoom golpe (o zoom alterno). Cambio de plano → desenfoque suave. Puedes cambiar cada una en el inspector del clip.</div>
        </div>
      </${Section}>
      <${Section} collapsible open=${false} icon="text" title="Editar con el texto"><${TextEdit} /></${Section}>
    </div>`;
}
