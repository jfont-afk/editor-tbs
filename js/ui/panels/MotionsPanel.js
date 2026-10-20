import { html, useState } from '../../lib.js';
import { state } from '../../core/store.js';
import { Section } from '../controls.js';
import { MOTIONS, MOTION_CATS } from '../../render/motions.js';
import * as A from '../../core/actions.js';
import { C } from '../../data/brand.js';

const cache = new Map();
export function motionPreview(id) {
  if (cache.has(id)) return cache.get(id);
  const M = MOTIONS[id];
  const W = 480, H = 270;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const bg = x.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#26262c'); bg.addColorStop(1, '#141417');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  const g = x.createRadialGradient(W * 0.5, H * 1.2, 10, W * 0.5, H * 1.2, H);
  g.addColorStop(0, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const fake = { id: 'prev_' + id, type: id, start: 0, dur: M.dur > 50 ? 6 : M.dur, x: 0.5, y: 0.5, scale: 1, rot: 0, props: structuredClone(M.props) };
  const u = 0.42;
  const env = { W, H, u, safe: { x: W * 0.08, y: H * 0.12, w: W * 0.84, h: H * 0.76 }, base: c, tmp: document.createElement('canvas'), t: 3, total: 6, editing: true, logo: null };
  const lt = Math.min(fake.dur * 0.7, 2.2);
  // medir
  const m = document.createElement('canvas').getContext('2d');
  let box = { w: 200, h: 100 };
  try { box = M.draw(m, fake, lt, env) || box; } catch {}
  const s = Math.min(1, (W * 0.86) / Math.max(1, box.w), (H * 0.8) / Math.max(1, box.h));
  x.save();
  if (!M.full) { x.translate(W / 2, H / 2); x.scale(s, s); }
  try { M.draw(x, fake, lt, env); } catch (e) { console.warn(id, e); }
  x.restore();
  if (M.knockout) {
    x.fillStyle = 'rgba(18,18,20,0.85)'; x.fillRect(0, 0, W, H);
    x.font = '700 120px "Space Grotesk"'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const gr = x.createLinearGradient(0, 80, W, 200); gr.addColorStop(0, '#c98b5a'); gr.addColorStop(1, '#5a7d9c');
    x.fillStyle = gr; x.fillText('INVERTIR', W / 2, H / 2);
  }
  const url = c.toDataURL('image/jpeg', 0.85);
  cache.set(id, url);
  return url;
}

export function MotionsPanel() {
  const p = state.project;
  const [cat, setCat] = useState('all');
  const entries = Object.entries(MOTIONS).filter(([, m]) => cat === 'all' || m.cat === cat);
  return html`
    <div class="panel-head">
      <h2 class="panel-title">Motions</h2>
      <p class="panel-desc">Toca un elemento para añadirlo en el cursor. Arrástralo en el reproductor (con imán) y edítalo a la derecha. Todos pueden ir detrás de la persona.</p>
    </div>
    <div class="panel-body">
      ${!p.clips.length && html`<div class="note" style="margin-bottom:10px">Importa un vídeo primero.</div>`}
      <div class="row wrap" style="gap:4px;margin:4px 0 12px">
        <button class=${'chip' + (cat === 'all' ? ' on' : '')} onClick=${() => setCat('all')}>Todo</button>
        ${MOTION_CATS.map(c => html`<button class=${'chip' + (cat === c.id ? ' on' : '')} onClick=${() => setCat(c.id)}>${c.name}</button>`)}
      </div>
      ${MOTION_CATS.filter(c => cat === 'all' || c.id === cat).map(c => html`<${Section} title=${c.name}>
        <div class="cards">
          ${entries.filter(([, m]) => m.cat === c.id).map(([id, m]) => html`<button class="card" key=${id} disabled=${!p.clips.length} onClick=${() => A.addOverlay(id)} title=${'Añadir ' + m.name}>
            <img src=${motionPreview(id)} style="aspect-ratio:16/9" />
            <div class="card-label">${m.name}</div>
          </button>`)}
        </div>
      </${Section}>`)}
    </div>`;
}
