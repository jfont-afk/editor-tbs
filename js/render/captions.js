import { clamp } from '../lib.js';
import { animIn, animOut, ease, applyState, rrect, withAlpha, luminance, LETTER_ANIMS } from './anim.js';

const metricsCache = new Map();
export function fontStr(f, size) {
  return `${f.style === 'italic' ? 'italic ' : ''}${f.weight} ${size.toFixed(2)}px "${f.family}"`;
}
function vmetrics(ctx, font) {
  const key = font.replace(/[\d.]+px/, '100px');
  let m = metricsCache.get(key);
  if (!m) {
    const prev = ctx.font;
    ctx.font = key;
    const mm = ctx.measureText('HÁÉgjyp');
    const mc = ctx.measureText('HXE');
    m = { asc: mm.actualBoundingBoxAscent / 100, desc: mm.actualBoundingBoxDescent / 100, cap: mc.actualBoundingBoxAscent / 100 };
    ctx.font = prev;
    metricsCache.set(key, m);
  }
  const size = parseFloat(font.match(/([\d.]+)px/)[1]);
  return { asc: m.asc * size, desc: m.desc * size, cap: m.cap * size };
}
export function clearMetrics() { metricsCache.clear(); }

const glowOf = (g) => (g && g.on !== false && (g.blur || 0) > 0 ? g : null);

// Tipografía efectiva de una palabra (normal / destacado 1 / destacado 2)
export function wordFont(st, hl) {
  const base = { family: st.font.family, weight: st.font.weight, style: st.font.style, upper: st.font.upper, lower: !st.font.upper && !!st.font.lower, ls: st.font.ls ?? 0, scale: 1, color: st.color, glow: glowOf(st.glow) };
  // nivel 2 dentro del texto (cuando no se usa como título) se ve como la destacada
  const h = hl === 1 ? st.hl : hl === 2 ? (st.hl2 && Object.keys(st.hl2).length ? st.hl2 : st.hl) : null;
  if (!h) return base;
  return {
    family: h.family || base.family, weight: h.weight || base.weight, style: h.style || (h.family ? 'normal' : base.style),
    upper: h.upper ?? base.upper, lower: h.upper ? false : base.lower, ls: h.ls ?? (h.family ? Math.min(0, base.ls) * 0.3 : base.ls), scale: h.scale || 1, color: h.color || base.color,
    glow: h.glow !== undefined ? glowOf(h.glow) : base.glow,
  };
}

export function cleanWord(raw, st, wf) {
  let t = raw.trim().replace(/[.,;:…]+$/u, '');
  if (st.punct === 'strip') t = t.replace(/^[«"“'¿¡(]+|[»"”')]+$/gu, '');
  if (!t) t = raw.trim();
  return wf.upper ? t.toLocaleUpperCase('es-ES') : wf.lower ? t.toLocaleLowerCase('es-ES') : t;
}

/**
 * Calcula la maquetación de un bloque de subtítulos.
 * env: { W, H, u, safe:{x,y,w,h} }
 */
export function layoutCaption(ctx, g, st, env, posYOverride) {
  const { u, safe, W, H } = env;
  const maxW = safe.w * (st.layout === 'spread' ? Math.min(0.86, st.maxW) : st.maxW || 0.9);
  const maxLines = st.maxLines || 2;
  let fs = st.font.size * u;
  let lines, items;
  // Palabras "muy destacadas" (nivel 2): salen como título aparte, a todo el ancho
  const heroOn = st.heroMode && st.heroMode !== 'off';
  const heroItems = heroOn ? g.items.filter(x => x.w.hl === 2) : [];
  const src = heroItems.length ? g.items.filter(x => x.w.hl !== 2) : g.items;
  // "Subtítulo + título": lo que se dice antes del título va encima y lo de después, debajo (se lee en orden)
  const split = heroItems.length && st.heroMode === 'stack';
  const heroPos = heroItems.length ? g.items.indexOf(heroItems[0]) : -1;
  const segOf = (it) => (split && g.items.indexOf(it) > heroPos ? 1 : 0);
  // Jerarquía sin destacados: se amplía la palabra más relevante del bloque
  let autoBig = -1;
  if (st.layout === 'hier' && !src.some(x => x.w.hl)) {
    let best = 0;
    src.forEach((x, i) => { const n = x.w.text.replace(/[^\p{L}\p{N}]/gu, '').length; if (n > best) { best = n; autoBig = i; } });
    if (best < 3) autoBig = -1;
  }
  // saltos de línea puestos a mano (doble clic en el texto → Intro)
  const forced = src.reduce((n, x, i) => n + (i > 0 && x.w.nl ? 1 : 0), 0);
  for (let attempt = 0; attempt < 12; attempt++) {
    items = src.map((it, i) => {
      const wf = wordFont(st, i === autoBig ? 1 : (it.w.hl | 0));
      const size = fs * wf.scale;
      const font = fontStr(wf, size);
      ctx.font = font;
      ctx.letterSpacing = `${(wf.ls * size).toFixed(2)}px`;
      const text = cleanWord(it.w.text, st, wf);
      const m = ctx.measureText(text);
      const vm = vmetrics(ctx, font);
      // tinta real de la palabra (para apilar el título pegado al texto, sin huecos)
      return { it, i, seg: segOf(it), wf, size, font, text, w: m.width, inkDesc: m.actualBoundingBoxDescent, big: wf.scale > 1.3, level: i === autoBig ? 1 : (it.w.hl | 0), ...vm };
    });
    ctx.letterSpacing = '0px';
    ctx.font = fontStr(st.font, fs);
    const space = ctx.measureText(' ').width * (st.font.family.includes('Mono') ? 1 : 1.0) + Math.max(-0.02, st.font.ls || 0) * fs;
    lines = [];
    const push = (x) => { const l = lines[lines.length - 1]; if (!l) lines.push({ items: [x], w: x.w }); else { l.items.push(x); l.w += space + x.w; } };
    if (st.layout === 'stack') {
      let cur = null;
      for (const x of items) {
        if (cur && !x.it.w.nl && x.seg === cur.items[0].seg && cur.items.length === 1 && cur.items[0].text.length <= 2 && cur.w + space + x.w <= maxW) { cur.items.push(x); cur.w += space + x.w; continue; }
        cur = { items: [x], w: x.w }; lines.push(cur);
      }
    } else if (st.layout === 'hier') {
      // palabras grandes en su propia línea; las pequeñas se agrupan
      for (const x of items) {
        const last = lines[lines.length - 1];
        if (x.big || !last || last.big || x.it.w.nl || x.seg !== last.items[last.items.length - 1].seg || last.w + space + x.w > maxW * 0.8) lines.push({ items: [x], w: x.w, big: x.big });
        else push(x);
      }
    } else {
      let cur = { items: [], w: 0 };
      for (const x of items) {
        const add = cur.items.length ? space + x.w : x.w;
        if (cur.items.length && (x.it.w.nl || x.seg !== cur.items[cur.items.length - 1].seg || cur.w + add > maxW)) { lines.push(cur); cur = { items: [x], w: x.w }; }
        else { cur.items.push(x); cur.w += add; }
      }
      if (cur.items.length) lines.push(cur);
    }
    // Escalonado: siempre en dos líneas si hay al menos dos palabras
    if (st.layout === 'stagger' && !forced && !split && lines.length === 1 && items.length >= 2) {
      const half = Math.ceil(items.length / 2);
      const a = items.slice(0, half), b = items.slice(half);
      const wsum = (arr) => arr.reduce((s, x) => s + x.w, 0) + space * (arr.length - 1);
      lines = [{ items: a, w: wsum(a) }, { items: b, w: wsum(b) }];
    }
    for (const l of lines) l.space = space;
    const tooWide = lines.some(l => l.w > maxW + 0.5);
    const segs = new Set(items.map(x => x.seg)).size;
    const limit = Math.max(st.layout === 'hier' || st.layout === 'stack' ? Math.max(maxLines, 4) : maxLines, forced + 1) + segs - 1;
    if (lines.length <= limit && !tooWide) break;
    fs *= 0.9;
  }
  if (st.layout === 'spread') {
    for (const l of lines) {
      const n = l.items.length;
      if (n < 2) continue;
      const sum = l.items.reduce((a, x) => a + x.w, 0);
      const target = Math.min(maxW, Math.max(l.w, sum + l.space * (n - 1) * 3.2));
      l.space = (target - sum) / (n - 1);
      l.w = target;
    }
  }
  // Alturas de línea
  let bh = 0, bw = 0;
  lines = lines.filter(l => l.items.length);
  for (const l of lines) {
    const big = Math.max(...l.items.map(x => x.size));
    l.h = big * (st.font.lh || 1.15);
    l.asc = Math.max(...l.items.map(x => x.cap));
    bh += l.h; bw = Math.max(bw, l.w);
  }
  const area0 = st.freePos ? { x: W * 0.04, y: 0, w: W * 0.92, h: H } : safe;
  const hero = heroItems.length ? layoutHero(ctx, heroItems, st, env, area0) : null;
  const nbh = bh; // alto del subtítulo normal
  // Bloques encima y debajo del título. El título se apoya en la TINTA de las letras (no en el interlineado);
  // heroGap (en tamaños de letra del subtítulo) puede ser negativo para que se monten, como en las portadas
  const pre = lines.filter(l => !l.items[0].seg), post = lines.filter(l => l.items[0].seg);
  const sumH = (arr) => arr.reduce((a2, l) => a2 + l.h, 0);
  const inkDesc = (l) => Math.max(0, ...l.items.map(x => x.inkDesc || 0));
  const lineFs = (l) => Math.max(...l.items.map(x => x.size));
  let gapA = 0, gapB = 0;
  if (hero && st.heroMode === 'stack') {
    if (pre.length) { const l = pre[pre.length - 1]; gapA = lineFs(l) * (st.heroGap ?? 0.16) - (l.h / 2 - l.asc / 2 - inkDesc(l)); }
    if (post.length) { const l = post[0]; gapB = lineFs(l) * (st.heroGapBelow ?? st.heroGap ?? 0.16) - (l.h / 2 - l.asc / 2); }
    bh = sumH(pre) + gapA + hero.h + gapB + sumH(post);
    bw = Math.max(bw, hero.w);
  } else if (hero) { bw = Math.max(bw, hero.w); bh = Math.max(bh, hero.h); }
  // Escalonado: líneas desplazadas a izquierda y derecha
  if (st.layout === 'stagger' && lines.length > 1) {
    const off = Math.min(W * 0.07, (maxW - bw) / 2 + W * 0.04);
    lines.forEach((l, i) => { l.shift = (i % 2 ? 1 : -1) * off; });
    bw += off * 2;
  }
  const box = st.box?.on ? st.box : null;
  const padX = box && box.mode === 'block' ? (box.padX ?? 20) * u : 0;
  const padY = box && box.mode === 'block' ? (box.padY ?? 10) * u : 0;
  let cx = (st.posX ?? 0.5) * W;
  let cy = (posYOverride ?? st.posY) * H;
  // Mantener dentro de la zona segura (o solo dentro del encuadre si se ha colocado a mano)
  const area = st.freePos ? { x: 0, y: 0, w: W, h: H } : safe;
  const top = area.y + padY, bottom = area.y + area.h - padY;
  if (cy - bh / 2 < top) cy = top + bh / 2;
  if (cy + bh / 2 > bottom) cy = Math.max(top + bh / 2, bottom - bh / 2);
  const left = area.x + padX, right = area.x + area.w - padX;
  if (cx - bw / 2 < left) cx = left + bw / 2;
  if (cx + bw / 2 > right) cx = Math.max(left + bw / 2, right - bw / 2);
  // alineación de las líneas: respecto al bloque, o al borde del título (texto pequeño en la esquina del título)
  const la = hero && st.heroAlign ? st.heroAlign : st.align;
  const placeLines = (arr, y) => {
    for (const l of arr) {
      l.cy = y + l.h / 2;
      l.base = l.cy + l.asc / 2;
      let x = la === 'left' ? cx - bw / 2 : la === 'right' ? cx + bw / 2 - l.w : cx - l.w / 2;
      x += l.shift || 0;
      l.x0 = x;
      for (const it of l.items) { it.x = x; it.cx = x + it.w / 2; it.base = l.base; it.line = l; x += it.w + l.space; }
      y += l.h;
    }
    return y;
  };
  if (hero && st.heroMode === 'stack') {
    // encima · título · debajo
    const y0 = cy - bh / 2;
    const ht = placeLines(pre, y0) + gapA;
    placeHero(hero, cx, ht, la, bw);
    placeLines(post, ht + hero.h + gapB);
  } else {
    // "título solo" y "título detrás": el subtítulo y el título comparten centro
    placeLines(lines, hero ? cy - nbh / 2 : cy - bh / 2);
    if (hero) placeHero(hero, cx, cy - hero.h / 2, la, bw);
  }
  return { fs, lines, items, cx, cy, hero, bx: cx - bw / 2 - padX, by: cy - bh / 2 - padY, bw: bw + padX * 2, bh: bh + padY * 2 };
}

/**
 * Título de las palabras "muy destacadas": lo más grande posible dentro del ancho seguro,
 * en una o dos líneas equilibradas (lo que permita la letra más grande).
 */
function layoutHero(ctx, heroItems, st, env, area) {
  const { u, H } = env;
  const h = st.hero || {};
  const fam = h.family || st.font.family;
  const f = { family: fam, weight: h.weight || 700, style: h.style || 'normal' };
  const words = heroItems.map(x => { let t = x.w.text.trim().replace(/[.,;:…]+$/u, ''); t = t.replace(/^[«"“'¿¡(]+|[»"”')]+$/gu, ''); return h.upper ? t.toLocaleUpperCase('es-ES') : t; });
  const ls = h.ls ?? -0.04;
  const measure = (s) => { ctx.font = fontStr(f, 100); ctx.letterSpacing = `${(ls * 100).toFixed(2)}px`; const w = ctx.measureText(s).width; ctx.letterSpacing = '0px'; return w; };
  const targetW = area.w * (h.width ?? 0.94);
  const maxFs = Math.min(300 * u, H * 0.2);
  const options = [[words.join(' ')]];
  for (let k = 1; k < words.length; k++) options.push([words.slice(0, k).join(' '), words.slice(k).join(' ')]);
  let best = null;
  for (const ls2 of options) {
    const wmax = Math.max(...ls2.map(measure));
    let fs = Math.min(maxFs, targetW / Math.max(1, wmax) * 100);
    fs = Math.min(fs, (H * 0.3) / (ls2.length * 0.98));
    // a igualdad, mejor una línea; dos líneas solo si ganan bastante tamaño
    const score = fs * (ls2.length === 1 ? 1.12 : 1);
    if (!best || score > best.score) best = { lines: ls2, fs, score };
  }
  const fs = best.fs;
  const font = fontStr(f, fs);
  ctx.font = font; ctx.letterSpacing = `${(ls * fs).toFixed(2)}px`;
  const lh = fs * 0.98;
  const vm = vmetrics(ctx, font);
  // cada línea ocupa solo su tinta real (una palabra en minúsculas no reserva el alto de las mayúsculas)
  const lines = best.lines.map(t => { const m = ctx.measureText(t); return { text: t, w: m.width, asc: m.actualBoundingBoxAscent, desc: m.actualBoundingBoxDescent }; });
  ctx.letterSpacing = '0px';
  const w = Math.max(...lines.map(l => l.w));
  const lgap = fs * 0.06;
  const ul = h.underline ? Math.max(0, fs * 0.1 + Math.max(4 * u, fs * 0.075) - lines[lines.length - 1].desc) : 0;
  const ink = lines.reduce((a, l) => a + l.asc + l.desc, 0) + lgap * (lines.length - 1) + ul;
  return { lines, fs, font, ls: ls * fs, lh, lgap, cap: vm.cap, w, h: ink, ts: heroItems[0].ts, style: h };
}
function heroBox(hero) {
  const x0 = Math.min(...hero.lines.map(l => l.x)), x1 = Math.max(...hero.lines.map(l => l.x + l.w));
  return { x: x0, y: hero.top, w: x1 - x0, h: hero.h };
}
function placeHero(hero, cx, top, align, blockW) {
  hero.top = top;
  const bw = Math.max(blockW || 0, hero.w);
  let y = top;
  hero.lines.forEach((l) => {
    l.x = align === 'left' ? cx - bw / 2 : align === 'right' ? cx + bw / 2 - l.w : cx - l.w / 2;
    l.base = y + l.asc;
    y = l.base + l.desc + hero.lgap;
  });
}

// Dibuja el título (palabras muy destacadas) con su animación
function drawHero(ctx, hero, t, st, u) {
  const h = hero.style || {};
  const t0 = hero.ts;
  if (t < t0 - 1e-3) return;
  const k = t - t0;
  const col = h.color || C_FLUOR;
  const cx = hero.lines.reduce((a, l) => a + l.x + l.w / 2, 0) / hero.lines.length;
  const cy = hero.top + hero.h / 2;
  ctx.save();
  // "título detrás": palabra gigante semitransparente detrás del subtítulo
  if (h.alpha != null) ctx.globalAlpha *= h.alpha;
  // ligero asentamiento de todo el título
  const settle = 1 + 0.06 * (1 - ease.outCubic(clamp(k / 0.6, 0, 1)));
  ctx.translate(cx, cy); ctx.scale(settle, settle); ctx.translate(-cx, -cy);
  ctx.font = hero.font; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.letterSpacing = `${hero.ls.toFixed(2)}px`;
  const sh = st.shadow?.on ? { c: withAlpha(st.shadow.color || '#000000', Math.min(0.75, (st.shadow.opacity ?? 0.55) + 0.1)), b: (st.shadow.blur ?? 18) * u * 1.4, y: (st.shadow.y ?? 3) * u * 1.4 } : null;
  const paint = (txt, x, y, alpha = 1) => {
    ctx.save();
    ctx.globalAlpha *= alpha;
    if (h.glow) { ctx.shadowColor = withAlpha(col, 0.8); ctx.shadowBlur = hero.fs * 0.35; ctx.fillStyle = col; ctx.fillText(txt, x, y); }
    if (sh) { ctx.shadowColor = sh.c; ctx.shadowBlur = sh.b; ctx.shadowOffsetY = sh.y; }
    if (st.stroke?.on && st.stroke.w > 0) { ctx.lineJoin = 'round'; ctx.lineWidth = st.stroke.w * u * 2.6; ctx.strokeStyle = withAlpha(st.stroke.color || '#000', st.stroke.opacity ?? 1); ctx.strokeText(txt, x, y); }
    ctx.fillStyle = col; ctx.fillText(txt, x, y);
    ctx.restore();
  };
  const anim = h.anim || 'mask';
  let charIdx = 0;
  hero.lines.forEach((l, li) => {
    if (anim === 'pop' || anim === 'blur') {
      // palabra a palabra con golpe / todo con desenfoque
      const parts = anim === 'pop' ? l.text.split(' ') : [l.text];
      let x = l.x;
      parts.forEach((wd, wi) => {
        const ww = ctx.measureText(wd).width;
        const p = clamp((k - (li * 0.1 + wi * 0.08)) / (anim === 'pop' ? 0.32 : 0.45), 0, 1);
        if (p > 0) {
          ctx.save();
          const s = anim === 'pop' ? 0.45 + 0.55 * ease.outBack(p, 1.9) : 1.12 - 0.12 * ease.outCubic(p);
          const wx = x + ww / 2, wy = l.base - hero.cap / 2;
          ctx.translate(wx, wy); ctx.scale(s, s); ctx.translate(-wx, -wy);
          if (anim === 'blur' && p < 1) ctx.filter = `blur(${((1 - p) * 16 * u).toFixed(1)}px)`;
          paint(wd, x, l.base, clamp(p * 2, 0, 1));
          ctx.restore();
        }
        x += ww + ctx.measureText(' ').width;
      });
    } else {
      // máscara: cada letra sube desde la línea base, escalonada
      const chars = [...l.text];
      let prefix = '';
      ctx.save();
      ctx.beginPath(); ctx.rect(l.x - hero.fs * 0.3, l.base - hero.lh * 1.05, l.w + hero.fs * 0.6, hero.lh * 1.3); ctx.clip();
      chars.forEach((ch) => {
        const x = l.x + ctx.measureText(prefix).width;
        prefix += ch;
        const p = clamp((k - charIdx * (anim === 'letters' ? 0.035 : 0.016)) / 0.42, 0, 1);
        charIdx++;
        if (p <= 0 || ch === ' ') return;
        const e = ease.outQuart(p);
        const dy = anim === 'letters' ? -(1 - e) * hero.fs * 0.35 : (1 - e) * hero.lh * 0.95;
        paint(ch, x, l.base + dy, anim === 'letters' ? e : clamp(p * 1.6, 0, 1));
      });
      ctx.restore();
    }
  });
  // tachado: barra que cruza el título de izquierda a derecha
  if (h.strike) {
    const p = ease.outExpo(clamp((k - 0.3) / 0.45, 0, 1));
    if (p > 0) {
      ctx.save(); ctx.letterSpacing = '0px'; ctx.fillStyle = h.strike;
      for (const l of hero.lines) {
        const th = hero.fs * 0.085, ext = hero.fs * 0.06;
        rrect(ctx, l.x - ext, l.base - hero.fs * 0.27 - th / 2, (l.w + ext * 2) * p, th, th * 0.2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
  // subrayado que se dibuja de izquierda a derecha
  if (h.underline && h.line) {
    const last = hero.lines[hero.lines.length - 1];
    const p = ease.outExpo(clamp((k - 0.28) / 0.5, 0, 1));
    if (p > 0) {
      const th = Math.max(4 * u, hero.fs * 0.075);
      ctx.save(); ctx.letterSpacing = '0px';
      ctx.fillStyle = h.line;
      rrect(ctx, last.x, last.base + hero.fs * 0.1, last.w * p, th, th / 2);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
  ctx.letterSpacing = '0px';
}
const C_FLUOR = '#daff0a';

function shadowOf(st, boost) {
  if (boost) return { blur: 26, x: 0, y: 3, color: 'rgba(0,0,0,0.85)', strong: true };
  const s = st.shadow;
  if (!s || !s.on) return null;
  return { blur: s.blur ?? 18, x: s.x || 0, y: s.y ?? 3, color: withAlpha(s.color || '#000000', s.opacity ?? 0.55) };
}

function drawWordText(ctx, x, it, color, st, u, opts, glowMul = 1, ls) {
  ctx.font = it.font;
  ctx.letterSpacing = `${(ls ?? it.wf.ls * it.size).toFixed(2)}px`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const text = opts.text ?? it.text;
  const glow = it.wf.glow;
  if (glow && glowMul > 0.01) {
    ctx.save();
    ctx.shadowColor = withAlpha(glow.color, clamp((glow.alpha ?? 0.6) * glowMul, 0, 1));
    ctx.shadowBlur = glow.blur * u;
    ctx.fillStyle = color;
    ctx.fillText(text, x, it.base);
    if ((glow.alpha ?? 0.6) > 0.7) ctx.fillText(text, x, it.base);
    ctx.restore();
  }
  if (st.stroke?.on && st.stroke.w > 0) {
    ctx.save();
    ctx.lineJoin = 'round'; ctx.miterLimit = 2;
    ctx.lineWidth = st.stroke.w * u * 2;
    ctx.strokeStyle = withAlpha(st.stroke.color || '#000000', st.stroke.opacity ?? 1);
    ctx.strokeText(text, x, it.base);
    ctx.restore();
  }
  // la legibilidad automática solo refuerza la sombra si está activada (si la quitas, no vuelve)
  const boost = opts.boost && !st.box?.on && !!st.shadow?.on;
  const sh = shadowOf(st, boost);
  if (boost && !st.stroke?.on) {
    // fondo claro: contorno oscuro suave para separar el texto
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, it.size * 0.07);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(text, x, it.base);
    ctx.restore();
  }
  ctx.save();
  if (sh) { ctx.shadowColor = sh.color; ctx.shadowBlur = sh.blur * u; ctx.shadowOffsetX = sh.x * u; ctx.shadowOffsetY = sh.y * u; }
  ctx.fillStyle = color;
  ctx.fillText(text, x, it.base);
  if (sh?.strong) { ctx.shadowBlur = 8 * u; ctx.fillText(text, x, it.base); }
  ctx.restore();
}

// Dibuja una palabra letra a letra con animación escalonada
function drawLetters(ctx, it, color, st, u, opts, t, appear, dur, glowMul) {
  const chars = [...it.text];
  ctx.font = it.font;
  const ls = it.wf.ls * it.size;
  ctx.letterSpacing = `${ls.toFixed(2)}px`;
  const n = chars.length;
  const stag = st.stagger ?? 0.03;
  let prefix = '';
  const xs = chars.map(c => { const w = ctx.measureText(prefix).width; prefix += c; return w; });
  for (let i = 0; i < n; i++) {
    const p = clamp((t - appear - i * stag) / dur, 0, 1);
    if (p <= 0) continue;
    const s = animIn(st.anim, p, i, it.size);
    ctx.save();
    const cx = it.x + xs[i] + it.size * 0.25, cy = it.base - it.cap / 2;
    applyState(ctx, s, cx, cy);
    drawWordText(ctx, it.x + xs[i], it, color, st, u, { ...opts, text: chars[i] }, glowMul, 0);
    ctx.restore();
  }
}

function boxColor(b) { return withAlpha(b.color || '#121214', b.opacity ?? 0.8); }

/**
 * Dibuja un bloque en el tiempo t (segundos de línea de tiempo).
 * opts: { backdrop: canvas para el efecto cristal, boost: refuerzo de contraste }
 */
export function drawCaption(ctx, g, t, st, L, env, opts = {}) {
  const { u } = env;
  const k = st.animDur || 1;
  const inDur = (st.reveal === 'word' ? 0.32 : 0.42) * k;
  // salida
  let outS = null;
  if (st.out && st.out !== 'none' && g.fadeOut !== false) {
    const od = 0.2;
    const q = clamp((t - (g.end - od)) / od, 0, 1);
    if (q > 0) outS = animOut(st.out, q, L.fs);
    if (q >= 1) return;
  }
  ctx.save();
  if (outS) applyState(ctx, outS, L.cx, L.cy);

  const letterAnim = LETTER_ANIMS.has(st.anim);
  const blockAnim = st.reveal === 'group' && !letterAnim && st.anim !== 'rise';
  const gp = clamp((t - g.start) / inDur, 0, 1);
  if (blockAnim) applyState(ctx, animIn(st.anim, gp, 0, L.fs), L.cx, L.cy);

  // "Título solo": el subtítulo se retira justo cuando empieza el título
  const soloFade = L.hero && st.heroMode === 'solo' ? 1 - clamp((t - L.hero.ts) / 0.14, 0, 1) : 1;
  ctx.save();
  ctx.globalAlpha *= soloFade;

  const box = st.box?.on ? st.box : null;
  // Fondo del bloque (caja o cristal)
  if (box && box.mode === 'block') {
    const r = (box.radius ?? 12) * u;
    if (box.blur && opts.backdrop) {
      ctx.save();
      rrect(ctx, L.bx, L.by, L.bw, L.bh, r);
      ctx.clip();
      ctx.filter = `blur(${(box.blur * u).toFixed(1)}px)`;
      ctx.drawImage(opts.backdrop, 0, 0, env.W, env.H);
      ctx.restore();
    }
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 12 * u; ctx.shadowOffsetY = 11 * u;
    rrect(ctx, L.bx, L.by, L.bw, L.bh, r);
    ctx.fillStyle = boxColor(box);
    ctx.fill();
    ctx.restore();
    if (box.ring) {
      ctx.save();
      rrect(ctx, L.bx, L.by, L.bw, L.bh, r);
      ctx.clip();
      ctx.lineWidth = 3 * u * 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      rrect(ctx, L.bx, L.by, L.bw, L.bh, r);
      ctx.stroke();
      ctx.restore();
    }
  }
  if (box && box.mode === 'line') {
    ctx.save();
    ctx.fillStyle = boxColor(box);
    for (const l of L.lines) {
      const px = (box.padX ?? 16) * u, py = (box.padY ?? 8) * u;
      const hgt = l.asc + py * 2 + l.h * 0.22;
      rrect(ctx, l.x0 - px, l.cy - hgt / 2, l.w + px * 2, hgt, (box.radius ?? 10) * u);
      ctx.fill();
    }
    ctx.restore();
  }

  // el título va debajo del texto cuando están montados (el texto pequeño se lee encima) o en "título detrás"
  const heroFirst = L.hero && (st.heroMode === 'behind' || (st.heroMode === 'stack' && (st.heroGap ?? 0) < 0));
  if (heroFirst) drawHero(ctx, L.hero, t, st, u);
  const act = st.active || { mode: 'none' };
  for (const l of L.lines) {
    for (const it of l.items) {
      const w = it.it;
      const appear = st.reveal === 'word' ? w.ts : g.start;
      if (t < appear - 1e-4) continue;
      const level = it.level ?? (w.w.hl | 0);
      const isActive = t >= w.ts && t < Math.max(w.te, w.ts + 0.08);
      const spoken = t >= w.te;
      ctx.save();
      const p = clamp((t - appear) / inDur, 0, 1);
      if (!blockAnim && !letterAnim && st.reveal === 'word') {
        applyState(ctx, animIn(st.anim, p, it.i, it.size), it.cx, it.base - it.cap / 2);
      }
      // Máscara que sube (rise)
      if (st.anim === 'rise') {
        const pr = st.reveal === 'word' ? p : clamp((t - g.start - (l === L.lines[0] ? 0 : L.lines.indexOf(l) * 0.06)) / inDur, 0, 1);
        const s = animIn('rise', pr, 0, it.size);
        ctx.beginPath();
        ctx.rect(it.x - it.size * 0.3, it.base - it.size * 1.2, it.w + it.size * 0.6, it.size * 1.2 + it.size * 0.32);
        ctx.clip();
        ctx.translate(0, s.clipUp * it.size * 1.15);
        ctx.globalAlpha *= s.alpha;
      }
      let color = level ? it.wf.color : st.color;
      const glowMul = st.anim === 'glowIn' ? ease.outCubic(clamp((t - appear) / 0.4, 0, 1)) : 1;
      // Caja por palabra
      if (box && box.mode === 'word') {
        const px = (box.padX ?? 12) * u, py = (box.padY ?? 6) * u;
        const cy = it.base - it.cap / 2;
        ctx.save();
        rrect(ctx, it.x - px, cy - it.cap / 2 - py, it.w + px * 2, it.cap + py * 2, (box.radius ?? 12) * u);
        ctx.fillStyle = level === 1 ? (st.hl?.box || boxColor(box)) : boxColor(box);
        ctx.fill();
        ctx.restore();
      }
      // Efecto en la palabra que suena
      if (act.mode !== 'none' && (isActive || (act.keep && spoken))) {
        const kk = clamp((t - w.ts) / 0.12, 0, 1);
        if (act.mode === 'color') color = act.color;
        if (act.mode === 'scale' && isActive) {
          const s = 1 + ((act.scale || 1.08) - 1) * ease.outCubic(kk);
          const cx = it.cx, cy = it.base - it.cap / 2;
          ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
        }
        if (act.mode === 'pill' && isActive) {
          const s = 0.75 + 0.25 * ease.outBack(kk, 1.8);
          const px = it.size * 0.2, py = it.size * 0.16;
          const cx = it.cx, cy = it.base - it.cap / 2;
          ctx.save();
          ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
          rrect(ctx, it.x - px, cy - it.cap / 2 - py, it.w + px * 2, it.cap + py * 2, it.size * 0.22);
          ctx.fillStyle = act.color;
          ctx.fill();
          ctx.restore();
          color = act.ink || '#000';
        }
        if (act.mode === 'underline' && isActive) {
          const prog = ease.outCubic(clamp((t - w.ts) / 0.18, 0, 1));
          ctx.save();
          ctx.fillStyle = act.color;
          rrect(ctx, it.x, it.base + it.size * 0.1, it.w * prog, it.size * 0.09, it.size * 0.045);
          ctx.fill();
          ctx.restore();
        }
      }
      if (st.reveal === 'char') {
        const dur = Math.max(0.08, (w.te - w.ts) * 0.85);
        const n = it.text.length;
        const vis = t >= w.te ? n : Math.max(0, Math.ceil(n * clamp((t - w.ts) / dur, 0, 1)));
        if (vis > 0) drawWordText(ctx, it.x, it, color, st, u, { ...opts, text: it.text.slice(0, vis) }, glowMul);
        if (isActive && Math.floor(t * 4) % 2 === 0) {
          ctx.font = it.font;
          const cw = ctx.measureText(it.text.slice(0, vis)).width;
          ctx.fillStyle = st.hl?.color || '#fff';
          ctx.fillRect(it.x + cw + it.size * 0.06, it.base - it.cap, it.size * 0.08, it.cap * 1.15);
        }
      } else if (letterAnim && st.anim !== 'tracking') {
        drawLetters(ctx, it, color, st, u, opts, t, appear + (st.reveal === 'group' ? it.i * 0.05 : 0), 0.38 * k, glowMul);
      } else if (st.anim === 'tracking') {
        const pr = clamp((t - appear) / (0.6 * k), 0, 1);
        const e = ease.outQuint(pr);
        const extra = (1 - e) * it.size * 0.32;
        const n = Math.max(1, [...it.text].length - 1);
        const s = animIn('tracking', pr, 0, it.size);
        ctx.globalAlpha *= s.alpha;
        if (s.blur > 0.3) ctx.filter = `blur(${s.blur.toFixed(1)}px)`;
        drawWordText(ctx, it.x - extra * n / 2, it, color, st, u, opts, glowMul, it.wf.ls * it.size + extra);
      } else if (act.mode === 'wipe') {
        drawWordText(ctx, it.x, it, color, st, u, opts, glowMul);
        const prog = spoken ? (act.keep ? 1 : 0) : isActive ? clamp((t - w.ts) / Math.max(0.05, w.te - w.ts), 0, 1) : 0;
        if (prog > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(it.x - it.size * 0.1, it.base - it.size * 1.3, (it.w + it.size * 0.2) * prog, it.size * 1.8);
          ctx.clip();
          drawWordText(ctx, it.x, it, act.color, st, u, { ...opts, boost: false }, glowMul);
          ctx.restore();
        }
      } else {
        drawWordText(ctx, it.x, it, color, st, u, opts, glowMul);
      }
      // tachado de la palabra destacada
      if (level && st.hl?.strike) {
        const pr = ease.outExpo(clamp((t - w.ts - 0.08) / 0.35, 0, 1));
        if (pr > 0) { ctx.save(); ctx.fillStyle = st.hl.strike; const th = it.size * 0.09; rrect(ctx, it.x - it.size * 0.05, it.base - it.size * 0.27 - th / 2, (it.w + it.size * 0.1) * pr, th, th * 0.2); ctx.fill(); ctx.restore(); }
      }
      ctx.restore();
    }
  }
  ctx.restore();
  // Título (palabras muy destacadas)
  if (L.hero && !heroFirst) drawHero(ctx, L.hero, t, st, u);
  // Decoración: caja de selección tipo editor (alrededor del bloque o solo del título, con cursor)
  if (st.deco === 'select') {
    const pad = 22 * u;
    const hb = L.hero && st.decoTarget === 'hero' ? heroBox(L.hero) : null;
    if (hb && t < L.hero.ts) { /* la caja aparece con el título */ } else {
    const r0 = hb || { x: L.bx, y: L.by, w: L.bw, h: L.bh };
    const x = r0.x - pad, y = r0.y - pad * 0.7, w = r0.w + pad * 2, h = r0.h + pad * 1.4;
    const kk = ease.outCubic(clamp((t - g.start) / 0.45, 0, 1));
    ctx.save();
    ctx.globalAlpha *= kk;
    ctx.setLineDash([10 * u, 7 * u]);
    ctx.lineWidth = 2.5 * u;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    const hs = 14 * u;
    for (const [hx, hy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
      ctx.lineWidth = 2.5 * u; ctx.strokeStyle = st.hl?.color || '#daff0a'; ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
    }
    if (st.cursor) {
      // puntero de ratón en la esquina inferior derecha
      const s = 46 * u, px = x + w - s * 0.25, py = y + h - s * 0.3;
      ctx.beginPath();
      ctx.moveTo(px, py); ctx.lineTo(px, py + s); ctx.lineTo(px + s * 0.27, py + s * 0.74); ctx.lineTo(px + s * 0.46, py + s * 1.12);
      ctx.lineTo(px + s * 0.6, py + s * 1.05); ctx.lineTo(px + s * 0.42, py + s * 0.68); ctx.lineTo(px + s * 0.78, py + s * 0.66); ctx.closePath();
      ctx.fillStyle = '#121214'; ctx.fill(); ctx.lineWidth = 2.5 * u; ctx.strokeStyle = '#ffffff'; ctx.lineJoin = 'round'; ctx.stroke();
    }
    ctx.restore();
    }
  }
  ctx.restore();
  ctx.letterSpacing = '0px';
  ctx.filter = 'none';
}

// Luminancia media de una zona del fotograma (para la legibilidad automática)
export function regionLuma(probeCtx, probeW, probeH, W, H, r) {
  const x = clamp(Math.floor(r.x / W * probeW), 0, probeW - 1), y = clamp(Math.floor(r.y / H * probeH), 0, probeH - 1);
  const w = clamp(Math.ceil(r.w / W * probeW), 1, probeW - x), h = clamp(Math.ceil(r.h / H * probeH), 1, probeH - y);
  const d = probeCtx.getImageData(x, y, w, h).data;
  let s = 0, s2 = 0;
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    s += l; s2 += l * l;
  }
  const mean = s / n;
  return { mean, std: Math.sqrt(Math.max(0, s2 / n - mean * mean)) };
}

export function needsBoost(st, luma) {
  if (st.box?.on || !st.shadow?.on) return false;
  const textL = luminance(st.color);
  if (textL > 0.55) return luma.mean > 0.48 || (luma.mean > 0.33 && luma.std > 0.2);
  return false;
}
