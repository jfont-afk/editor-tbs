import { layoutClips } from './timeline.js';
import { getTemplate } from '../data/captionTemplates.js';

// Palabras de la transcripción llevadas a la línea de tiempo (siguen a los cortes automáticamente)
export function timelineWords(p) {
  const out = [];
  for (const l of layoutClips(p.clips)) {
    const c = l.clip;
    const tr = p.transcripts[c.assetId];
    if (!tr) continue;
    const sp = c.speed || 1;
    for (const w of tr.words) {
      if (w.del) continue;
      const mid = (w.start + w.end) / 2;
      if (mid < c.in || mid >= c.out) continue;
      const a = Math.max(w.start, c.in), b = Math.min(w.end, c.out);
      out.push({ w, ts: l.start + (a - c.in) / sp, te: l.start + (Math.max(b, a + 0.04) - c.in) / sp, clipId: c.id });
    }
  }
  return out;
}

const endsSentence = (s) => /[.?!…:;]["»”)]?$/.test(s.trim());

export function groupWords(words, s) {
  const N = Math.max(1, s.wordsPerGroup | 0);
  const groups = [];
  let cur = null;
  const close = () => { if (cur && cur.items.length) groups.push(cur); cur = null; };
  for (let i = 0; i < words.length; i++) {
    const it = words[i];
    const prev = cur?.items[cur.items.length - 1];
    let brk = false;
    if (!cur) brk = true;
    else if (it.w.br === true) brk = true;
    else if (it.w.br === false) brk = cur.items.length >= 12;
    else {
      const chars = cur.items.reduce((a, x) => a + x.w.text.trim().length + 1, 0) + it.w.text.trim().length;
      if (cur.items.length >= N) brk = true;
      else if (N > 1 && chars > s.maxChars) brk = true;
      else if (prev && it.ts - prev.te > s.gapBreak) brk = true;
      else if (prev && s.breakOnPunct && endsSentence(prev.w.text)) brk = true;
      else if (prev && prev.clipId !== it.clipId && it.ts - prev.te > 0.25) brk = true;
    }
    if (brk) { close(); cur = { items: [] }; }
    cur.items.push(it);
  }
  close();
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const first = g.items[0], last = g.items[g.items.length - 1];
    g.id = first.w.id;
    g.start = first.ts;
    const next = groups[i + 1];
    const hold = last.te + 0.45;
    g.end = next ? Math.min(next.items[0].ts, Math.max(last.te, Math.min(hold, next.items[0].ts))) : hold;
    if (next && next.items[0].ts - last.te < 0.35) g.end = next.items[0].ts;
    // solo se desvanece si después hay un hueco (si no, corte limpio sin parpadeo)
    g.fadeOut = !next || next.items[0].ts - g.end > 0.05;
    g.ov = g.items.find(x => x.w.gs)?.w.gs || null;
    g.text = g.items.map(x => x.w.text.trim()).join(' ');
  }
  return groups;
}

let cacheV = -1, cacheGroups = [];
export function captionGroups(p, version) {
  if (version === cacheV) return cacheGroups;
  cacheV = version;
  cacheGroups = groupWords(timelineWords(p), p.captions);
  return cacheGroups;
}

export function groupAt(groups, t) {
  for (const g of groups) if (t >= g.start && t < g.end) return g;
  return null;
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
export function deepMerge(base, patch) {
  if (!patch) return base;
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) continue;
    if (isObj(v) && isObj(base[k])) base[k] = deepMerge({ ...base[k] }, v);
    else base[k] = isObj(v) ? structuredClone(v) : v;
  }
  return base;
}

// Estilo final = plantilla + ajustes globales + ajustes del bloque
export function resolveStyle(settings, ov) {
  const tpl = getTemplate(ov?.template || settings.template);
  const st = structuredClone(tpl);
  if (!ov?.template) {
    // campos antiguos (compatibilidad)
    if (settings.color) st.color = settings.color;
    if (settings.hlColor) st.hl = { ...st.hl, color: settings.hlColor };
    if (settings.anim) st.anim = settings.anim;
    deepMerge(st, settings.style);
  }
  st.font.size *= (settings.size || 1) * (ov?.size || 1);
  if (settings.upper === 'on') st.font.upper = true;
  if (settings.upper === 'off') st.font.upper = false;
  if (ov?.color) st.color = ov.color;
  if (ov?.hlColor) st.hl = { ...st.hl, color: ov.hlColor };
  if (ov?.anim) st.anim = ov.anim;
  if (ov?.reveal) st.reveal = ov.reveal;
  if (ov?.upper === 'on') st.font.upper = true;
  if (ov?.upper === 'off') st.font.upper = false;
  deepMerge(st, ov?.style);
  st.posY = ov?.posY ?? (ov?.template ? tpl.posY : settings.posY);
  st.posX = ov?.posX ?? (ov?.template ? 0.5 : (settings.posX ?? 0.5));
  st.behind = ov?.behind ?? settings.behind;
  st.hidden = !!ov?.hidden;
  return st;
}

// SRT
export function toSRT(groups) {
  const ts = (t) => {
    const ms = Math.round(t * 1000);
    const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, r = ms % 1000;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(r).padStart(3, '0')}`;
  };
  return groups.map((g, i) => `${i + 1}\n${ts(g.start)} --> ${ts(g.end)}\n${g.text}\n`).join('\n');
}
