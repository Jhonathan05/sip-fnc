CREATE TABLE IF NOT EXISTS user_prefs (
  sub TEXT PRIMARY KEY,
  display_mode TEXT NOT NULL DEFAULT 'full' CHECK (display_mode IN ('full', 'first')),
  photo TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
