// Editor TBS en Cloudflare: sirve la web solo a cuentas con sesión iniciada,
// gestiona invitaciones/cuentas (correo + contraseña) y guarda los proyectos por cuenta en D1.
// Los vídeos nunca se suben: siguen en el ordenador de cada persona.

const SESSION_DAYS = 30;
const INVITE_DAYS = 7;
const PBKDF2_ITER = 100000; // máximo que permite Workers
const MAX_PROJECT_BYTES = 1_900_000; // comprimido (D1 admite ~2 MB por fila)
const COOKIE = 'tbs_sess';

// Rutas que se pueden abrir sin sesión
const PUBLIC = [/^\/login\/?$/, /^\/invite\/[A-Za-z0-9_-]+\/?$/, /^\/api\/auth\//, /^\/favicon\.ico$/];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    try {
      if (path.startsWith('/api/') && req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req, url)) {
        return json({ error: 'Origen no permitido' }, 403);
      }
      const user = await currentUser(req, env);

      if (path === '/login' || path === '/login/') return user ? redirect(safeNext(url.searchParams.get('next'))) : html(loginPage(url));
      if (path === '/logout') { await endSession(req, env); return redirect('/login', clearCookie(url)); }
      const inv = path.match(/^\/invite\/([A-Za-z0-9_-]+)\/?$/);
      if (inv) return invitePage(env, inv[1]);

      if (path === '/api/auth/login' && req.method === 'POST') return login(req, env, url);
      if (path === '/api/auth/register' && req.method === 'POST') return register(req, env, url);
      if (path === '/api/auth/logout' && req.method === 'POST') { await endSession(req, env); return json({ ok: true }, 200, { 'set-cookie': clearCookie(url) }); }

      if (!user) {
        if (PUBLIC.some(r => r.test(path))) return new Response('No encontrado', { status: 404 });
        if (path.startsWith('/api/')) return json({ error: 'Inicia sesión' }, 401);
        const wantsPage = req.method === 'GET' && (req.headers.get('accept') || '').includes('text/html');
        if (wantsPage) return redirect('/login' + (path !== '/' ? '?next=' + encodeURIComponent(path + url.search) : ''));
        return new Response('Inicia sesión', { status: 401, headers: { 'cache-control': 'no-store' } });
      }

      const extra = user.renew ? { 'set-cookie': sessionCookie(user.renew, url) } : {};
      if (path === '/api/me') return json({ id: user.id, email: user.email, name: user.name, role: user.role, ...(await prefs(env, user.id)) }, 200, extra);
      if (path === '/api/me/prefs' && req.method === 'POST') return savePrefs(req, env, user);
      if (path === '/api/auth/password' && req.method === 'POST') return changePassword(req, env, user);
      if (path.startsWith('/api/projects')) return projects(req, env, user, path);
      if (path === '/cuenta' || path === '/cuenta/') return html(accountPage(user));
      if (path === '/admin' || path === '/admin/') return user.role === 'admin' ? html(adminPage(user)) : redirect('/');
      if (path.startsWith('/api/admin/')) return user.role === 'admin' ? admin(req, env, user, path, url) : json({ error: 'Solo administradores' }, 403);
      if (path.startsWith('/api/')) return json({ error: 'No encontrado' }, 404);

      // Web estática del editor
      if (/^\/(worker|wrangler|\.git|_pruebas)/.test(path)) return new Response('No encontrado', { status: 404 });
      const res = await env.ASSETS.fetch(req);
      const out = new Response(res.body, res);
      // revalidar siempre: tras publicar, nadie mezcla archivos viejos y nuevos
      out.headers.set('cache-control', 'no-cache');
      secure(out.headers);
      for (const [k, v] of Object.entries(extra)) out.headers.append(k, v);
      return out;
    } catch (e) {
      console.error(e);
      return path.startsWith('/api/') ? json({ error: 'Error del servidor' }, 500) : new Response('Error del servidor', { status: 500 });
    }
  },
};

// ---------- Utilidades ----------
function secure(h) {
  h.set('x-content-type-options', 'nosniff');
  h.set('referrer-policy', 'same-origin');
  h.set('x-frame-options', 'DENY');
}
function json(o, status = 200, headers = {}) {
  const h = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  secure(h);
  return new Response(JSON.stringify(o), { status, headers: h });
}
function html(body, status = 200) {
  const h = new Headers({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  secure(h);
  return new Response(body, { status, headers: h });
}
function redirect(to, cookie) {
  const h = new Headers({ location: to, 'cache-control': 'no-store' });
  if (cookie) h.append('set-cookie', cookie);
  return new Response(null, { status: 302, headers: h });
}
function sameOrigin(req, url) {
  const o = req.headers.get('origin');
  return !o || o === url.origin;
}
function safeNext(n) { return n && n.startsWith('/') && !n.startsWith('//') ? n : '/'; }
const now = () => Date.now();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const randomToken = (n = 32) => b64u(crypto.getRandomValues(new Uint8Array(n)));
async function sha256(s) { return b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))); }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const normEmail = (e) => String(e || '').trim().toLowerCase();
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;
async function body(req, max = 64 * 1024) {
  const len = +(req.headers.get('content-length') || 0);
  if (len > max) throw Object.assign(new Error('too big'), { status: 413 });
  const txt = await req.text();
  if (txt.length > max) throw Object.assign(new Error('too big'), { status: 413 });
  try { return JSON.parse(txt || '{}'); } catch { return {}; }
}

// ---------- Contraseñas ----------
async function hashPassword(pw, saltB64, iter = PBKDF2_ITER) {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
  return `pbkdf2$${iter}$${b64(salt)}$${b64(bits)}`;
}
async function checkPassword(pw, stored) {
  const [, iter, salt, hash] = String(stored || '').split('$');
  if (!salt || !hash) { await hashPassword(pw); return false; }
  const got = (await hashPassword(pw, salt, +iter)).split('$')[3];
  const a = new TextEncoder().encode(got), b = new TextEncoder().encode(hash);
  return a.length === b.length && crypto.subtle.timingSafeEqual(a, b);
}
function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (pw.length > 200) return 'La contraseña es demasiado larga.';
  return null;
}

// ---------- Sesiones ----------
function readCookie(req) {
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([A-Za-z0-9_-]+)'));
  return m ? m[1] : null;
}
function sessionCookie(token, url) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${url.protocol === 'https:' ? '; Secure' : ''}`;
}
function clearCookie(url) { return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${url.protocol === 'https:' ? '; Secure' : ''}`; }
async function startSession(env, userId) {
  const token = randomToken();
  await env.DB.prepare('INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), userId, now(), now() + SESSION_DAYS * 86400e3).run();
  return token;
}
async function currentUser(req, env) {
  const token = readCookie(req);
  if (!token) return null;
  const h = await sha256(token);
  const row = await env.DB.prepare('SELECT s.expires_at, u.id, u.email, u.name, u.role, u.disabled FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?').bind(h).first();
  if (!row || row.disabled || row.expires_at < now()) return null;
  // sesión deslizante: si quedan menos de 15 días, se alarga
  let renew = null;
  if (row.expires_at - now() < 15 * 86400e3) {
    await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE id_hash = ?').bind(now() + SESSION_DAYS * 86400e3, h).run();
    renew = token;
  }
  return { id: row.id, email: row.email, name: row.name, role: row.role, renew };
}
async function endSession(req, env) {
  const token = readCookie(req);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(await sha256(token)).run();
}

// ---------- Inicio de sesión ----------
async function tooMany(env, k) {
  const r = await env.DB.prepare('SELECT n, until FROM login_fails WHERE k = ?').bind(k).first();
  return r && r.until > now() && r.n >= (k.startsWith('ip:') ? 30 : 8);
}
async function fail(env, k) {
  await env.DB.prepare(`INSERT INTO login_fails (k, n, until) VALUES (?, 1, ?)
    ON CONFLICT(k) DO UPDATE SET n = CASE WHEN until < ? THEN 1 ELSE n + 1 END, until = ?`).bind(k, now() + 15 * 60e3, now(), now() + 15 * 60e3).run();
}
async function login(req, env, url) {
  const b = await body(req);
  const email = normEmail(b.email);
  const ip = 'ip:' + (req.headers.get('cf-connecting-ip') || '?');
  if (await tooMany(env, 'e:' + email) || await tooMany(env, ip)) return json({ error: 'Demasiados intentos. Espera 15 minutos.' }, 429);
  const u = await env.DB.prepare('SELECT id, pass, disabled FROM users WHERE email = ?').bind(email).first();
  const ok = await checkPassword(String(b.password || ''), u?.pass);
  if (!u || !ok || u.disabled) {
    await fail(env, 'e:' + email); await fail(env, ip);
    return json({ error: u?.disabled && ok ? 'Esta cuenta está desactivada.' : 'Correo o contraseña incorrectos.' }, 401);
  }
  await env.DB.prepare('DELETE FROM login_fails WHERE k = ?').bind('e:' + email).run();
  await env.DB.prepare('UPDATE users SET last_login = ? WHERE id = ?').bind(now(), u.id).run();
  const token = await startSession(env, u.id);
  return json({ ok: true, next: safeNext(b.next) }, 200, { 'set-cookie': sessionCookie(token, url) });
}

// Primera cuenta: enlace /invite/<SETUP_KEY> (secreto que se pone en Cloudflare). Solo vale mientras no haya ninguna cuenta.
async function setupInvite(env, token) {
  const key = env.SETUP_KEY;
  if (!key || key.length < 24 || token.length !== key.length) return null;
  const a = new TextEncoder().encode(token), b = new TextEncoder().encode(key);
  if (!crypto.subtle.timingSafeEqual(a, b)) return null;
  if (await env.DB.prepare('SELECT 1 FROM users LIMIT 1').first()) return null;
  return { token_hash: null, kind: 'invite', role: 'admin', email: null, setup: true };
}

async function findInvite(env, token) {
  const s = await setupInvite(env, token);
  if (s) return s;
  const r = await env.DB.prepare('SELECT * FROM invites WHERE token_hash = ?').bind(await sha256(token)).first();
  if (!r || r.used_at || r.expires_at < now()) return null;
  return r;
}

async function register(req, env, url) {
  const b = await body(req);
  const inv = await findInvite(env, String(b.token || ''));
  if (!inv) return json({ error: 'El enlace no es válido o ha caducado. Pide uno nuevo.' }, 400);
  const pwErr = passwordProblem(b.password);
  if (pwErr) return json({ error: pwErr }, 400);
  let userId;
  if (inv.kind === 'reset') {
    userId = inv.user_id;
    const u = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
    if (!u) return json({ error: 'La cuenta ya no existe.' }, 400);
  } else {
    const email = normEmail(inv.email || b.email);
    if (!validEmail(email)) return json({ error: 'Escribe un correo válido.' }, 400);
    const name = String(b.name || '').trim().slice(0, 80);
    if (!name) return json({ error: 'Escribe tu nombre.' }, 400);
    if (await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) return json({ error: 'Ya existe una cuenta con ese correo. Inicia sesión.' }, 409);
    userId = 'u_' + randomToken(12);
    b._email = email; b._name = name;
  }
  const pass = await hashPassword(b.password);
  if (inv.setup) {
    // primera cuenta de administrador: solo si sigue sin haber ninguna
    const r = await env.DB.prepare(`INSERT INTO users (id, email, name, pass, role, created_at, last_login)
      SELECT ?, ?, ?, ?, 'admin', ?, ? WHERE NOT EXISTS (SELECT 1 FROM users)`).bind(userId, b._email, b._name, pass, now(), now()).run();
    if (!r.meta?.changes) return json({ error: 'Este enlace ya se ha usado.' }, 400);
    const token = await startSession(env, userId);
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(token, url) });
  }
  // se marca la invitación como usada antes de crear nada (un enlace = una cuenta)
  const claim = await env.DB.prepare('UPDATE invites SET used_at = ?, used_by = ? WHERE token_hash = ? AND used_at IS NULL').bind(now(), userId, inv.token_hash).run();
  if (!claim.meta?.changes) return json({ error: 'Este enlace ya se ha usado.' }, 400);
  if (inv.kind === 'reset') {
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET pass = ? WHERE id = ?').bind(pass, userId),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
    ]);
  } else {
    await env.DB.prepare('INSERT INTO users (id, email, name, pass, role, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(userId, b._email, b._name, pass, inv.role === 'admin' ? 'admin' : 'user', now(), now()).run();
  }
  const token = await startSession(env, userId);
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(token, url) });
}

async function changePassword(req, env, user) {
  const b = await body(req);
  const u = await env.DB.prepare('SELECT pass FROM users WHERE id = ?').bind(user.id).first();
  if (!(await checkPassword(String(b.current || ''), u?.pass))) return json({ error: 'La contraseña actual no es correcta.' }, 400);
  const pwErr = passwordProblem(b.password);
  if (pwErr) return json({ error: pwErr }, 400);
  await env.DB.prepare('UPDATE users SET pass = ? WHERE id = ?').bind(await hashPassword(b.password), user.id).run();
  return json({ ok: true });
}

// ---------- Preferencias de la cuenta ----------
const PREF_KEYS = ['tour']; // tour = versión del tutorial de bienvenida que ya ha visto
async function prefs(env, userId) {
  try {
    const { results } = await env.DB.prepare('SELECT k, v FROM user_prefs WHERE user_id = ?').bind(userId).all();
    return { prefs: Object.fromEntries(results.map(r => [r.k, r.v])) };
  } catch { return { prefs: {} }; } // tabla aún sin crear
}
async function savePrefs(req, env, user) {
  const b = await body(req);
  const rows = PREF_KEYS.filter(k => b[k] !== undefined).map(k => env.DB.prepare(`INSERT INTO user_prefs (user_id, k, v, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at`).bind(user.id, k, String(b[k]).slice(0, 200), now()));
  if (rows.length) await env.DB.batch(rows);
  return json({ ok: true });
}

// ---------- Proyectos por cuenta ----------
async function gzip(str) {
  const s = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function gunzip(buf) {
  const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(s).text();
}
const validId = (id) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

async function projects(req, env, user, path) {
  const m = path.match(/^\/api\/projects\/?([A-Za-z0-9_-]*)$/);
  if (!m) return json({ error: 'No encontrado' }, 404);
  const id = m[1];
  if (!id) {
    if (req.method !== 'GET') return json({ error: 'Método no permitido' }, 405);
    const { results } = await env.DB.prepare('SELECT id, title, meta, thumb, size, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC').bind(user.id).all();
    return json({ projects: results.map(r => ({ ...r, meta: JSON.parse(r.meta || '{}') })) });
  }
  if (!validId(id)) return json({ error: 'Id no válido' }, 400);
  if (req.method === 'GET') {
    const r = await env.DB.prepare('SELECT id, title, data, updated_at FROM projects WHERE user_id = ? AND id = ?').bind(user.id, id).first();
    if (!r) return json({ error: 'No existe' }, 404);
    return json({ id: r.id, title: r.title, updated_at: r.updated_at, project: JSON.parse(await gunzip(new Uint8Array(r.data))) });
  }
  if (req.method === 'PUT') {
    let b;
    try { b = await body(req, 24 * 1024 * 1024); } catch { return json({ error: 'El proyecto es demasiado grande para guardarlo en la nube.' }, 413); }
    if (!b.project || typeof b.project !== 'object') return json({ error: 'Falta el proyecto' }, 400);
    const cur = await env.DB.prepare('SELECT updated_at FROM projects WHERE user_id = ? AND id = ?').bind(user.id, id).first();
    // otro ordenador lo ha guardado después de que este lo abriera
    if (cur && b.base && cur.updated_at > b.base) return json({ error: 'conflict', updated_at: cur.updated_at }, 409);
    const data = await gzip(JSON.stringify(b.project));
    if (data.byteLength > MAX_PROJECT_BYTES) return json({ error: 'El proyecto es demasiado grande para guardarlo en la nube.' }, 413);
    const thumb = typeof b.thumb === 'string' && b.thumb.startsWith('data:image/') && b.thumb.length < 200_000 ? b.thumb : null;
    const t = now();
    await env.DB.prepare(`INSERT INTO projects (user_id, id, title, meta, thumb, data, size, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, id) DO UPDATE SET title = excluded.title, meta = excluded.meta, thumb = COALESCE(excluded.thumb, projects.thumb), data = excluded.data, size = excluded.size, updated_at = excluded.updated_at`)
      .bind(user.id, id, String(b.title || 'Proyecto').slice(0, 120), JSON.stringify(b.meta || {}).slice(0, 2000), thumb, data, data.byteLength, t).run();
    return json({ ok: true, updated_at: t });
  }
  if (req.method === 'PATCH') {
    const b = await body(req);
    await env.DB.prepare('UPDATE projects SET title = ? WHERE user_id = ? AND id = ?').bind(String(b.title || 'Proyecto').slice(0, 120), user.id, id).run();
    return json({ ok: true });
  }
  if (req.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM projects WHERE user_id = ? AND id = ?').bind(user.id, id).run();
    return json({ ok: true });
  }
  return json({ error: 'Método no permitido' }, 405);
}

// ---------- Administración ----------
async function createLink(env, url, by, { kind = 'invite', role = 'user', email = null, userId = null, note = '', days = INVITE_DAYS }) {
  const token = randomToken(24);
  await env.DB.prepare('INSERT INTO invites (token_hash, kind, role, email, user_id, note, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(await sha256(token), kind, role, email, userId, note, by, now(), now() + Math.min(30, Math.max(1, days)) * 86400e3).run();
  return `${url.origin}/invite/${token}`;
}

async function admin(req, env, user, path, url) {
  if (path === '/api/admin/users' && req.method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT u.id, u.email, u.name, u.role, u.disabled, u.created_at, u.last_login,
      (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id) AS projects FROM users u ORDER BY u.created_at`).all();
    return json({ users: results, me: user.id });
  }
  if (path === '/api/admin/invites' && req.method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT token_hash, kind, role, email, note, created_at, expires_at FROM invites
      WHERE used_at IS NULL AND expires_at > ? ORDER BY created_at DESC`).bind(now()).all();
    return json({ invites: results });
  }
  if (path === '/api/admin/invites' && req.method === 'POST') {
    const b = await body(req);
    const email = b.email ? normEmail(b.email) : null;
    if (email && !validEmail(email)) return json({ error: 'Correo no válido' }, 400);
    const link = await createLink(env, url, user.id, { role: b.role === 'admin' ? 'admin' : 'user', email, note: String(b.note || '').slice(0, 120), days: +b.days || INVITE_DAYS });
    return json({ url: link });
  }
  let m = path.match(/^\/api\/admin\/invites\/([A-Za-z0-9_-]+)$/);
  if (m && req.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM invites WHERE token_hash = ? AND used_at IS NULL').bind(m[1]).run();
    return json({ ok: true });
  }
  m = path.match(/^\/api\/admin\/users\/([A-Za-z0-9_-]+)(\/reset)?$/);
  if (m) {
    const target = await env.DB.prepare('SELECT id, email FROM users WHERE id = ?').bind(m[1]).first();
    if (!target) return json({ error: 'No existe' }, 404);
    if (m[2] && req.method === 'POST') {
      const link = await createLink(env, url, user.id, { kind: 'reset', userId: target.id, email: target.email, days: 2 });
      return json({ url: link });
    }
    if (target.id === user.id) return json({ error: 'No puedes cambiar ni borrar tu propia cuenta desde aquí.' }, 400);
    if (req.method === 'PATCH') {
      const b = await body(req);
      if (b.role) await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(b.role === 'admin' ? 'admin' : 'user', target.id).run();
      if (b.disabled !== undefined) {
        await env.DB.prepare('UPDATE users SET disabled = ? WHERE id = ?').bind(b.disabled ? 1 : 0, target.id).run();
        if (b.disabled) await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id).run();
      }
      return json({ ok: true });
    }
    if (req.method === 'DELETE') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id),
        env.DB.prepare('DELETE FROM projects WHERE user_id = ?').bind(target.id),
        env.DB.prepare('DELETE FROM user_prefs WHERE user_id = ?').bind(target.id),
        env.DB.prepare('DELETE FROM users WHERE id = ?').bind(target.id),
      ]);
      return json({ ok: true });
    }
  }
  return json({ error: 'No encontrado' }, 404);
}

// ---------- Páginas ----------
const FAVICON = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23121214'/%3E%3Cpath d='M12 9v14l11-7z' fill='%23f22b11'/%3E%3C/svg%3E`;
const CSS = `
:root{color-scheme:dark;--bg:#0c0c0e;--card:#16161a;--line:#2a2a30;--text:#f2f2f3;--mute:#9a9aa3;--red:#f22b11;--red2:#dc270f;--ok:#daff0a}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:var(--bg);color:var(--text);font:15px/1.5 Raleway,system-ui,sans-serif;display:flex;flex-direction:column;align-items:center}
h1,h2,h3{font-family:"Space Grotesk",system-ui,sans-serif;letter-spacing:-.02em;margin:0 0 6px}
.wrap{width:100%;max-width:420px;padding:56px 16px}.wide{max-width:980px}
.mark{display:flex;align-items:center;gap:10px;margin-bottom:28px;font:700 20px "Space Grotesk",sans-serif}.mark i{width:30px;height:30px;border-radius:8px;background:#121214 url("${FAVICON}") center/cover;display:inline-block;border:1px solid var(--line)}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px}
label{display:block;font-size:13px;color:var(--mute);margin:14px 0 6px}
input,select{width:100%;padding:11px 12px;border-radius:10px;border:1px solid var(--line);background:#0f0f12;color:var(--text);font:inherit}
input:focus,select:focus{outline:2px solid #fff3;border-color:#555}
button,.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:11px 16px;border-radius:10px;border:1px solid var(--line);background:#222228;color:var(--text);font:600 14px "Space Grotesk",sans-serif;cursor:pointer;text-decoration:none}
button.cta{background:var(--red);border-color:var(--red);color:#fff;width:100%;margin-top:20px}button.cta:hover{background:var(--red2)}
button:disabled{opacity:.6;cursor:wait}.sm{padding:6px 10px;font-size:13px}.danger{color:#ff8a7a}
.err{color:#ff8a7a;font-size:14px;min-height:20px;margin-top:12px}.okmsg{color:var(--ok)}
.mute{color:var(--mute)}.small{font-size:13px}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:middle}th{color:var(--mute);font-weight:500}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.grow{flex:1}
.pill{font-size:12px;padding:2px 8px;border-radius:99px;background:#26262c}.pill.admin{background:#3a1410;color:#ffb3a8}
.link{display:flex;gap:8px;margin-top:12px}.link input{font-family:"Geist Mono",monospace;font-size:13px}
section{margin-top:28px}
@media (max-width:640px){.wrap{padding:32px 16px}table{font-size:13px}th:nth-child(4),td:nth-child(4){display:none}}`;

function shell(title, inner, script = '', wide = false) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><link rel="icon" href="${FAVICON}">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&family=Raleway:wght@400;500;600&family=Space+Grotesk:wght@500;700&display=swap">
<style>${CSS}</style></head><body><div class="wrap${wide ? ' wide' : ''}"><div class="mark"><i></i>Editor TBS</div>${inner}</div>
<script>
async function api(u, o = {}) {
  const r = await fetch(u, { method: o.method || 'GET', headers: { 'content-type': 'application/json' }, body: o.body ? JSON.stringify(o.body) : undefined, credentials: 'same-origin' });
  let d = {}; try { d = await r.json(); } catch {}
  if (!r.ok) throw new Error(d.error || 'Error ' + r.status);
  return d;
}
function form(id, fn) {
  const f = document.getElementById(id), err = f.querySelector('.err'), btn = f.querySelector('button[type=submit]');
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); err.textContent = ''; btn.disabled = true;
    try { await fn(Object.fromEntries(new FormData(f))); } catch (x) { err.textContent = x.message; }
    btn.disabled = false;
  });
}
${script}
</script></body></html>`;
}

function loginPage(url) {
  const next = safeNext(url.searchParams.get('next'));
  return shell('Entrar · Editor TBS', `
  <div class="card"><h1>Entrar</h1><p class="mute small">Accede con tu correo y contraseña de TBS.</p>
  <form id="f"><label>Correo</label><input name="email" type="email" autocomplete="username" required autofocus>
  <label>Contraseña</label><input name="password" type="password" autocomplete="current-password" required>
  <input type="hidden" name="next" value="${esc(next)}">
  <button class="cta" type="submit">Entrar</button><div class="err"></div></form></div>
  <p class="mute small" style="margin-top:16px">¿No tienes cuenta o has olvidado la contraseña? Pide a un administrador un enlace de invitación.</p>`,
  `form('f', async (v) => { const d = await api('/api/auth/login', { method: 'POST', body: v }); location.href = d.next || '/'; });`);
}

async function invitePage(env, token) {
  const inv = await findInvite(env, token);
  if (!inv) return html(shell('Enlace no válido', `<div class="card"><h1>Enlace no válido</h1><p class="mute">Este enlace ya se ha usado o ha caducado. Pide uno nuevo a un administrador.</p><p><a class="btn" href="/login">Ir a entrar</a></p></div>`), 404);
  const reset = inv.kind === 'reset';
  const tok = JSON.stringify(token);
  return html(shell(reset ? 'Nueva contraseña · Editor TBS' : 'Crear cuenta · Editor TBS', `
  <div class="card"><h1>${reset ? 'Nueva contraseña' : 'Crea tu cuenta'}</h1>
  <p class="mute small">${reset ? `Elige una contraseña nueva para <b>${esc(inv.email)}</b>.` : inv.setup ? 'Primera cuenta: serás <b>administrador</b> y podrás invitar a tu equipo.' : inv.role === 'admin' ? 'Invitación de <b>administrador</b>: podrás invitar a otras personas.' : 'Te han invitado al Editor TBS.'}</p>
  <form id="f">
    ${reset ? '' : `<label>Nombre</label><input name="name" autocomplete="name" required maxlength="80">
    <label>Correo</label><input name="email" type="email" autocomplete="username" required ${inv.email ? `value="${esc(inv.email)}" readonly` : ''}>`}
    <label>Contraseña (mínimo 10 caracteres)</label><input name="password" type="password" autocomplete="new-password" minlength="10" required>
    <label>Repite la contraseña</label><input name="password2" type="password" autocomplete="new-password" minlength="10" required>
    <button class="cta" type="submit">${reset ? 'Guardar contraseña' : 'Crear cuenta y entrar'}</button><div class="err"></div>
  </form></div>`,
  `form('f', async (v) => {
    if (v.password !== v.password2) throw new Error('Las contraseñas no coinciden.');
    await api('/api/auth/register', { method: 'POST', body: { ...v, token: ${tok} } });
    location.href = '/';
  });`));
}

function accountPage(user) {
  return shell('Tu cuenta · Editor TBS', `
  <div class="card"><h1>Tu cuenta</h1><p class="mute small">${esc(user.name)} · ${esc(user.email)}</p>
  <form id="pw"><label>Contraseña actual</label><input name="current" type="password" autocomplete="current-password" required>
  <label>Nueva contraseña (mínimo 10 caracteres)</label><input name="password" type="password" autocomplete="new-password" minlength="10" required>
  <button class="cta" type="submit">Cambiar contraseña</button><div class="err"></div></form></div>
  <p class="row" style="margin-top:16px"><a class="btn" href="/">Volver al editor</a><a class="btn" href="/logout">Cerrar sesión</a></p>`,
  `form('pw', async (v) => { await api('/api/auth/password', { method: 'POST', body: v }); document.getElementById('pw').reset(); document.querySelector('#pw .err').innerHTML = '<span class="okmsg">Contraseña cambiada.</span>'; });`);
}

function adminPage(user) {
  return shell('Administración · Editor TBS', `
  <div class="row"><div class="grow"><h1>Administración</h1><p class="mute small">Hola, ${esc(user.name || user.email)}. Invita a tu equipo y gestiona las cuentas.</p></div>
  <a class="btn" href="/">Abrir el editor</a><a class="btn" href="/logout">Salir</a></div>

  <section class="card"><h2>Invitar a alguien</h2>
  <p class="mute small">Se genera un enlace de un solo uso que caduca en 7 días. Envíalo por correo o chat: la persona elige su contraseña.</p>
  <form id="inv"><div class="row">
    <div class="grow"><label>Correo (opcional: el enlace solo valdrá para ese correo)</label><input name="email" type="email" placeholder="nombre@tbsweb.es"></div>
    <div style="min-width:160px"><label>Permisos</label><select name="role"><option value="user">Editor</option><option value="admin">Administrador</option></select></div>
  </div><button class="cta" type="submit" style="width:auto">Crear enlace de invitación</button><div class="err"></div></form>
  <div id="newlink"></div></section>

  <section class="card"><h2>Cuentas</h2><div id="users" class="mute">Cargando…</div></section>
  <section class="card"><h2>Invitaciones pendientes</h2><div id="invites" class="mute">Cargando…</div></section>
  <section class="card"><h2>Tu contraseña</h2>
  <form id="pw"><div class="row"><div class="grow"><label>Actual</label><input name="current" type="password" autocomplete="current-password" required></div>
  <div class="grow"><label>Nueva (mínimo 10)</label><input name="password" type="password" autocomplete="new-password" minlength="10" required></div></div>
  <button class="cta" type="submit" style="width:auto">Cambiar contraseña</button><div class="err"></div></form></section>`,
  `
const fmt = (t) => t ? new Date(t).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const h = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function showLink(el, title, url) {
  el.innerHTML = '<p class="okmsg small" style="margin-top:16px">' + h(title) + '</p><div class="link"><input readonly value="' + h(url) + '"><button class="sm" type="button">Copiar</button></div>';
  const inp = el.querySelector('input'); inp.select();
  el.querySelector('button').onclick = async () => { try { await navigator.clipboard.writeText(url); } catch { inp.select(); document.execCommand('copy'); } el.querySelector('button').textContent = 'Copiado'; };
}
async function loadUsers() {
  const { users, me } = await api('/api/admin/users');
  document.getElementById('users').innerHTML = '<table><tr><th>Nombre</th><th>Correo</th><th>Permisos</th><th>Último acceso</th><th>Proyectos</th><th></th></tr>' + users.map(u =>
    '<tr data-id="' + h(u.id) + '"><td>' + h(u.name) + (u.disabled ? ' <span class="pill">desactivada</span>' : '') + '</td><td>' + h(u.email) + '</td><td><span class="pill ' + (u.role === 'admin' ? 'admin' : '') + '">' + (u.role === 'admin' ? 'Administrador' : 'Editor') + '</span></td><td>' + fmt(u.last_login) + '</td><td>' + u.projects + '</td><td class="row" style="justify-content:flex-end">' +
    '<button class="sm" data-a="reset">Enlace de contraseña</button>' + (u.id === me ? '' :
      '<button class="sm" data-a="role">' + (u.role === 'admin' ? 'Quitar admin' : 'Hacer admin') + '</button><button class="sm" data-a="toggle">' + (u.disabled ? 'Activar' : 'Desactivar') + '</button><button class="sm danger" data-a="del">Borrar</button>') + '</td></tr>'
  ).join('') + '</table><div id="userlink"></div>';
  document.querySelectorAll('#users button').forEach(b => b.onclick = async () => {
    const id = b.closest('tr').dataset.id, u = users.find(x => x.id === id);
    try {
      if (b.dataset.a === 'reset') { const d = await api('/api/admin/users/' + id + '/reset', { method: 'POST' }); showLink(document.getElementById('userlink'), 'Enlace para que ' + u.email + ' elija una contraseña nueva (caduca en 2 días):', d.url); return; }
      if (b.dataset.a === 'role') await api('/api/admin/users/' + id, { method: 'PATCH', body: { role: u.role === 'admin' ? 'user' : 'admin' } });
      if (b.dataset.a === 'toggle') await api('/api/admin/users/' + id, { method: 'PATCH', body: { disabled: !u.disabled } });
      if (b.dataset.a === 'del') { if (!confirm('¿Borrar la cuenta de ' + u.email + ' y sus proyectos en la nube? No se puede deshacer.')) return; await api('/api/admin/users/' + id, { method: 'DELETE' }); }
      loadUsers();
    } catch (e) { alert(e.message); }
  });
}
async function loadInvites() {
  const { invites } = await api('/api/admin/invites');
  const el = document.getElementById('invites');
  if (!invites.length) { el.textContent = 'No hay invitaciones pendientes.'; return; }
  el.innerHTML = '<table><tr><th>Tipo</th><th>Correo</th><th>Creada</th><th>Caduca</th><th></th></tr>' + invites.map(i =>
    '<tr data-id="' + h(i.token_hash) + '"><td>' + (i.kind === 'reset' ? 'Contraseña' : i.role === 'admin' ? 'Administrador' : 'Editor') + '</td><td>' + h(i.email || 'cualquiera') + '</td><td>' + fmt(i.created_at) + '</td><td>' + fmt(i.expires_at) + '</td><td style="text-align:right"><button class="sm danger">Anular</button></td></tr>'
  ).join('') + '</table>';
  el.querySelectorAll('button').forEach(b => b.onclick = async () => { await api('/api/admin/invites/' + b.closest('tr').dataset.id, { method: 'DELETE' }); loadInvites(); });
}
form('inv', async (v) => { const d = await api('/api/admin/invites', { method: 'POST', body: v }); showLink(document.getElementById('newlink'), 'Enlace de invitación creado. Cópialo y envíalo:', d.url); document.getElementById('inv').reset(); loadInvites(); });
form('pw', async (v) => { await api('/api/auth/password', { method: 'POST', body: v }); document.getElementById('pw').reset(); alert('Contraseña cambiada'); });
loadUsers().catch(e => document.getElementById('users').textContent = e.message);
loadInvites().catch(e => document.getElementById('invites').textContent = e.message);
`, true);
}
