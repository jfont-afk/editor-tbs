import { html } from '../lib.js';
import { state, setUI } from '../core/store.js';
import { Btn, Slider, Toggle } from './controls.js';
import { VOZ_CLARA, NEUTRAL, isVozClara, hasFx } from '../audio/fx.js';

const db = (v) => (v > 0 ? '+' : '') + v.toFixed(1).replace('.', ',') + ' dB';
const pct = (v) => (v < 0.005 ? 'No' : Math.round(v * 100) + '%');
const sec = (v) => (v < 0.01 ? 'No' : v.toFixed(1).replace('.', ',') + ' s');

// Corrección de audio de un clip o de un audio de la pista de audio.
// set(patch, key) cambia los ajustes `fx`; todo se oye al reproducir y sale igual al exportar.
export function AudioFixes({ fx, set, track = false, applyAll }) {
  const f = { ...NEUTRAL, ...(fx || {}) };
  const voz = isVozClara(f);
  const orig = !!state.ui.audioOrig;
  return html`<div class="stack">
    <div class="row" style="gap:6px">
      <${Btn} cls=${'grow ' + (voz ? 'primary' : 'fluor')} icon=${voz ? 'check' : 'mic'} onClick=${() => set(voz ? NEUTRAL : VOZ_CLARA)}>${voz ? 'Voz clara activada' : 'Voz clara'}</${Btn}>
      ${hasFx(f) && html`<${Btn} cls=${'sm' + (orig ? ' primary' : '')} title="Escucha el sonido sin corregir para comparar" onClick=${() => setUI({ audioOrig: !orig })}>${orig ? 'Oyendo el original' : 'Comparar'}</${Btn}>`}
    </div>
    <div class="dim small">${voz
      ? 'Quita retumbe y ruido de fondo, suaviza las eses, da presencia a la voz e iguala el volumen. Se oye al reproducir.'
      : 'Un clic para que la voz suene limpia y cercana. Debajo puedes ajustar cada cosa.'}</div>
    <${Toggle} label="Quitar retumbe" sub="Golpes, tráfico, aire acondicionado (graves por debajo de 80 Hz)" value=${!!f.hp} onChange=${v => set({ hp: v ? 1 : 0 })} />
    <${Slider} label="Reducir ruido de fondo" value=${f.gate} min=${0} max=${1} step=${0.01} format=${pct} onInput=${v => set({ gate: v }, 'gate')} />
    <${Slider} label="Suavizar las eses" value=${f.deess} min=${0} max=${1} step=${0.01} format=${pct} onInput=${v => set({ deess: v }, 'deess')} />
    <${Slider} label="Cuerpo" value=${f.body} min=${-6} max=${6} step=${0.5} center format=${db} onInput=${v => set({ body: v }, 'body')} />
    <${Slider} label="Presencia" value=${f.presence} min=${0} max=${8} step=${0.5} format=${db} onInput=${v => set({ presence: v }, 'pres')} />
    <${Slider} label="Brillo" value=${f.air} min=${-6} max=${6} step=${0.5} center format=${db} onInput=${v => set({ air: v }, 'air')} />
    <${Slider} label="Igualar volumen" value=${f.comp} min=${0} max=${1} step=${0.01} format=${pct} onInput=${v => set({ comp: v }, 'comp')} />
    ${track && html`<${Slider} label="Bajar mientras se habla" value=${f.duck || 0} min=${0} max=${1} step=${0.01} format=${v => (v < 0.005 ? 'No' : '−' + Math.round(v * 20) + ' dB')} onInput=${v => set({ duck: v }, 'duck')} />`}
    <div class="field-label" style="margin-bottom:-4px"><span>Fundidos</span></div>
    <div class="grid2">
      <${Slider} label="Entrada" value=${f.fadeIn || 0} min=${0} max=${3} step=${0.1} format=${sec} onInput=${v => set({ fadeIn: v }, 'fi')} />
      <${Slider} label="Salida" value=${f.fadeOut || 0} min=${0} max=${3} step=${0.1} format=${sec} onInput=${v => set({ fadeOut: v }, 'fo')} />
    </div>
    ${applyAll && html`<${Btn} cls="sm block" icon="copy" onClick=${applyAll}>Usar estos ajustes en todos los clips</${Btn}>`}
  </div>`;
}
