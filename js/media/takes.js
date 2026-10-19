// Detección de tomas repetidas y muletillas a partir de la transcripción.
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]+/g, '');

export const FILLERS = new Set(['eh', 'ehh', 'ehhh', 'em', 'emm', 'emmm', 'mm', 'mmm', 'mmmm', 'ah', 'ahh', 'uh', 'um', 'umm', 'hmm', 'esteee', 'eeh', 'eeeh']);
export const isFiller = (w) => FILLERS.has(norm(w.text));

export function phrases(words, gap = 0.7) {
  const out = [];
  let cur = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.del) continue;
    const prev = cur[cur.length - 1];
    if (prev && (w.start - prev.end > gap || /[.?!…]$/.test(prev.text.trim()))) { out.push(cur); cur = []; }
    cur.push(w);
  }
  if (cur.length) out.push(cur);
  return out.map(ws => ({ words: ws, start: ws[0].start, end: ws[ws.length - 1].end, text: ws.map(w => w.text).join(' ').replace(/\s+/g, ' ').trim(), toks: ws.map(w => norm(w.text)).filter(Boolean) }));
}

function lcs(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[m][n];
}

/**
 * Sugiere tomas descartables: frases que se repiten poco después (se conserva la última toma).
 * @returns [{start,end,text,keepText,score}]
 */
export function detectTakes(words) {
  const ph = phrases(words);
  const res = [];
  for (let i = 0; i < ph.length; i++) {
    const a = ph[i];
    if (a.toks.length < 2) continue;
    for (let j = i + 1; j <= Math.min(ph.length - 1, i + 3); j++) {
      const b = ph[j];
      if (b.start - a.end > 25) break;
      const k = Math.min(a.toks.length, b.toks.length, 7);
      const head = lcs(a.toks.slice(0, k), b.toks.slice(0, k)) / k;
      const full = lcs(a.toks, b.toks) / Math.max(1, Math.min(a.toks.length, b.toks.length));
      const score = Math.max(head, full * 0.95);
      if (score >= 0.6 && (head >= 0.5 || full >= 0.75)) {
        // Se elimina la toma anterior (y lo que hay entre ella y la buena)
        const mid = ph.slice(i + 1, j);
        const end = b.start - 0.06;
        res.push({ start: Math.max(0, a.start - 0.04), end, text: [a.text, ...mid.map(m => m.text)].join(' '), keepText: b.text, score });
        i = j - 1; // continúa desde la toma buena
        break;
      }
    }
  }
  return res;
}

export function fillerRanges(words) {
  return words.filter(w => !w.del && isFiller(w)).map(w => ({ start: w.start - 0.02, end: w.end + 0.02, id: w.id }));
}
