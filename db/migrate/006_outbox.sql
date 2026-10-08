-- 006_outbox: bandeja de salida de notificaciones (campana/email/discord).
-- Idempotente: IF NOT EXISTS + ref UNIQUE (clave de idempotencia del scheduler).
CREATE TABLE IF NOT EXISTS outbox (
  id SERIAL PRIMARY KEY,
  canal TEXT NOT NULL CHECK (canal IN ('email', 'discord', 'campana')),
  titulo TEXT NOT NULL,
  detalle TEXT NOT NULL DEFAULT '',
  destino TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  roles TEXT[] NOT NULL DEFAULT '{}',
  ref TEXT UNIQUE,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviado', 'fallido', 'leida')),
  intentos INT NOT NULL DEFAULT 0,
  next_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_outbox_estado ON outbox (estado, next_at);
