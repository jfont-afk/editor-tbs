-- Base de datos D1 del Editor TBS (cuentas, invitaciones, sesiones y proyectos en la nube)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  pass TEXT NOT NULL,                 -- pbkdf2$<iteraciones>$<sal b64>$<hash b64>
  role TEXT NOT NULL DEFAULT 'user',  -- admin | user
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_login INTEGER
);

-- Enlaces de invitación (crear cuenta) y de cambio de contraseña. Solo se guarda el hash del token.
CREATE TABLE IF NOT EXISTS invites (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'invite', -- invite | reset
  role TEXT NOT NULL DEFAULT 'user',
  email TEXT,                          -- opcional: la invitación solo vale para este correo
  user_id TEXT,                        -- en "reset": la cuenta a la que se cambia la contraseña
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  used_by TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

-- Proyectos guardados por cuenta (el proyecto, no los vídeos: esos siguen en el ordenador)
CREATE TABLE IF NOT EXISTS projects (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  meta TEXT NOT NULL DEFAULT '{}',     -- { format, dur, clips }
  thumb TEXT,                          -- portada pequeña (data URL JPEG)
  data BLOB NOT NULL,                  -- JSON del proyecto comprimido (gzip)
  size INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- Intentos fallidos de inicio de sesión (bloqueo temporal)
CREATE TABLE IF NOT EXISTS login_fails (
  k TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  until INTEGER NOT NULL
);

-- Preferencias de cada cuenta (p. ej. si ya ha visto el tutorial de bienvenida)
CREATE TABLE IF NOT EXISTS user_prefs (
  user_id TEXT NOT NULL,
  k TEXT NOT NULL,
  v TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, k)
);
