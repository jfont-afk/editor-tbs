// Términos en inglés (y nombres propios) dentro de vídeos en español.
// Whisper suele escribirlos "como suenan" ("estop los", "treiding", "price acción"…).
// Tras transcribir se buscan esas formas (exactas o muy parecidas fonéticamente) y se corrigen.

// término: variantes habituales tal y como las escribe Whisper en español
export const GLOSSARY_DEFAULT = {
  'trading': ['treding', 'treiding', 'treidin', 'tradin', 'treidings', 'tradings'],
  'trader': ['treider', 'treder', 'treiders', 'trejder'],
  'traders': ['treiders', 'treders'],
  'stop loss': ['estop los', 'estoplos', 'stop los', 'stoplos', 'estop loss'],
  'take profit': ['teik profit', 'teic profit', 'tei profit', 'teik prófit'],
  'broker': ['bróker', 'brocker', 'brouker', 'bróquer', 'broquer'],
  'brokers': ['brókers', 'brockers', 'broukers'],
  'forex': ['fórex', 'forés', 'foreks'],
  'price action': ['price acción', 'prais acción', 'prais action', 'praise action', 'prices acción'],
  'swing trading': ['suin treding', 'suing trading', 'swin trading', 'suin trading'],
  'day trading': ['dei trading', 'dey trading', 'dei treding'],
  'scalping': ['escalping', 'escalpin', 'scalpin', 'escálping'],
  'breakout': ['breikaut', 'breik aut', 'brekaut', 'break out'],
  'pullback': ['pulbak', 'pul bak', 'pullbac', 'pull back'],
  'bullish': ['bulish', 'búlish', 'bulis'],
  'bearish': ['berish', 'bérish', 'beris'],
  'setup': ['setap', 'set up', 'setúp', 'sétap'],
  'timeframe': ['taimfreim', 'time frame', 'taim freim', 'timefreim'],
  'backtesting': ['bactesting', 'bak testing', 'back testing'],
  'drawdown': ['drodaun', 'drau daun', 'draw down'],
  'leverage': ['leverich', 'líverich'],
  'spread': ['espred', 'esprit', 'spred'],
  'margin call': ['marjin col', 'margin col', 'márgin call'],
  'hedge fund': ['hech fund', 'hedge fon', 'hech fond'],
  'cash flow': ['cash flou', 'cas flou', 'cashflow', 'kesh flow'],
  'mindset': ['maindset', 'main set', 'mainset'],
  'feedback': ['fidbak', 'fid back', 'fidback'],
  'staking': ['esteiking', 'steiking', 'estaking'],
  'blockchain': ['blocchein', 'block chain', 'blokchein', 'blockchein'],
  'wallet': ['uolet', 'walet', 'uálet'],
  'bitcoin': ['bitcóin', 'bitcoins', 'bit coin', 'bitcon'],
  'ethereum': ['ezerium', 'etereum', 'ethereum'],
  'ETF': ['etef', 'e te efe', 'etefe', 'etf'],
  'ETFs': ['etefs', 'etfs'],
  'S&P 500': ['sp 500', 'es and pi 500', 'esandpí 500', 'es and pi quinientos', 's&p500'],
  'Nasdaq': ['nasdac', 'nasdak', 'násdaq'],
  'Dow Jones': ['dau jons', 'dow jons', 'dau jones'],
  'TradingView': ['trading view', 'tradinviú', 'trading viu', 'treding view'],
  'MetaTrader': ['meta trader', 'metatreider', 'meta treider'],
  'Binance': ['bainans', 'bináns', 'binans'],
  'Coinbase': ['coin base', 'coinbeis', 'koinbeis'],
  'prop firm': ['prop firms', 'propfirm', 'prop ferm'],
  'funding': ['fanding', 'fándin', 'fondin'],
  'coaching': ['coching', 'couching', 'cóuching'],
  'webinar': ['uebinar', 'güebinar', 'uébinar'],
  'online': ['onlain', 'on line', 'onláin'],
  'marketing': ['márketing', 'marquetin', 'marketin'],
  'networking': ['networquin', 'networkin', 'net working'],
  'startup': ['estartap', 'start up', 'startap'],
  'business': ['bisnes', 'bísnes', 'bussines', 'business'],
  'Traders Business School': ['treiders bisnes skul', 'traders business escuela', 'traders bisnes school', 'treiders business school'],
  'TBS': ['tebeese', 'te be ese'],
};

const USER_KEY = 'tbs-glossary';
// Glosario propio: texto con una línea por término → "término = variante, variante"
export function userGlossary() { try { return localStorage.getItem(USER_KEY) || ''; } catch { return ''; } }
export function saveUserGlossary(txt) { try { localStorage.setItem(USER_KEY, txt); } catch {} }

function parseUser(txt) {
  const out = {};
  for (const line of String(txt).split('\n')) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const [term, alts] = l.split('=').map(s => s.trim());
    if (!term) continue;
    out[term] = (alts || '').split(',').map(s => s.trim()).filter(Boolean);
  }
  return out;
}

// Clave "como suena" para comparar español escrito con inglés
export function soundKey(s) {
  let k = String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9ñ]/g, '');
  k = k.replace(/ph/g, 'f').replace(/th/g, 't').replace(/sh/g, 's').replace(/ck/g, 'k').replace(/qu/g, 'k').replace(/q/g, 'k')
    .replace(/c(?=[aou]|$|[^eih])/g, 'k').replace(/w/g, 'u').replace(/y$/g, 'i').replace(/z/g, 's').replace(/v/g, 'b')
    .replace(/h/g, '').replace(/ea|ee/g, 'i').replace(/oo/g, 'u').replace(/ai|ay|ei|ey/g, 'e').replace(/ou/g, 'au')
    .replace(/^es(?=[ptk])/, 's').replace(/x/g, 'ks').replace(/(.)\1+/g, '$1').replace(/ng$/, 'n').replace(/g$/, '');
  return k;
}

function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function buildIndex() {
  const all = { ...GLOSSARY_DEFAULT, ...parseUser(userGlossary()) };
  const entries = [];
  for (const [term, alts] of Object.entries(all)) {
    // cada forma recuerda cuántas palabras tiene: la búsqueda aproximada solo compara ventanas del mismo tamaño
    const keys = [term, ...alts].map(s => ({ k: soundKey(s), n: s.trim().split(/\s+/).length })).filter(x => x.k);
    const exact = new Set([term.toLowerCase(), ...alts.map(a => a.toLowerCase())].map(s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9& ]/g, '')));
    entries.push({ term, keys, exact });
  }
  return entries;
}

const STOP = new Set('y e o u a el la los las lo de del en que con por para un una mi tu su se es al le me te no si ya'.split(' '));
const clean = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9& ]/g, '');

/**
 * Corrige las palabras de una transcripción (in situ). Une varias palabras en una si el término es compuesto.
 * Devuelve el número de correcciones.
 */
export function applyGlossary(words) {
  const entries = buildIndex();
  let n = 0;
  const live = words.filter(w => !w.del);
  for (let i = 0; i < live.length; i++) {
    let done = false;
    for (let len = 3; len >= 1 && !done; len--) {
      if (i + len > live.length) continue;
      const span = live.slice(i, i + len);
      // no unir a través de pausas largas
      if (len > 1 && span.some((w, k) => k > 0 && w.start - span[k - 1].end > 0.6)) continue;
      const raw = span.map(w => w.text.trim()).join(' ');
      const trail = (raw.match(/[.,;:!?…»"”)]+$/) || [''])[0];
      const lead = (raw.match(/^[¿¡«"“(]+/) || [''])[0];
      const plain = clean(raw.slice(lead.length, raw.length - trail.length));
      if (plain.replace(/\s/g, '').length < 3) continue;
      const key = soundKey(plain);
      let hit = null;
      for (const e of entries) {
        if (e.exact.has(plain)) { hit = e; break; }
        if (key.length < 5) continue;
        // en las coincidencias aproximadas no se tragan palabras cortas del español ("y", "el", "de"…)
        if (len > 1 && plain.split(/\s+/).some(w => STOP.has(w))) continue;
        for (const { k, n } of e.keys) {
          if (n !== len) continue;
          const max = k.length >= 9 ? 2 : k.length >= 6 ? 1 : 0;
          if (k === key || (max && lev(k, key, max) <= max)) { hit = e; break; }
        }
        if (hit) break;
      }
      if (!hit) continue;
      // solo corrige si cambia algo de verdad
      const bare = raw.slice(lead.length, raw.length - trail.length);
      if (bare === hit.term) { done = true; i += len - 1; continue; }
      const cap = /^\p{Lu}/u.test(bare) && hit.term === hit.term.toLowerCase();
      const term = cap ? hit.term[0].toUpperCase() + hit.term.slice(1) : hit.term;
      span[0].text = lead + term + trail;
      if (len > 1) { span[0].end = span[len - 1].end; for (let k = 1; k < len; k++) span[k].del = true; }
      n++; done = true; i += len - 1;
    }
  }
  return n;
}
