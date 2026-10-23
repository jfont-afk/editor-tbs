-- Preferencias de cada cuenta (p. ej. si ya ha visto el tutorial de bienvenida)
CREATE TABLE IF NOT EXISTS user_prefs (
  user_id TEXT NOT NULL,
  k TEXT NOT NULL,
  v TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, k)
);
