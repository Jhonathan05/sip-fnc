-- 001_init: distribuciones (4 por año), bitácora indefinida, tareas.
-- Postgres 16. Convención: montos NUMERIC(18,2) >= 0, fechas TIMESTAMPTZ, estados TEXT con CHECK.

CREATE TABLE IF NOT EXISTS distribuciones (
  id SERIAL PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('municipio_actual','municipio_anteriores','circunscripcion_actual','circunscripcion_anteriores')),
  vigencia INT NOT NULL CHECK (vigencia BETWEEN 2000 AND 2100),
  asignado NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (asignado >= 0),
  ejecutado NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (ejecutado >= 0),
  UNIQUE (tipo, vigencia)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_sub TEXT NOT NULL,
  actor_email TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  modulo TEXT NOT NULL DEFAULT '',
  entidad_id TEXT,
  detalle TEXT,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_actor_fecha ON audit_log (actor_sub, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_modulo_fecha ON audit_log (modulo, created_at DESC);
-- Retención indefinida (acta F0): particionar por año cuando supere ~1M filas.

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rol TEXT NOT NULL,
  titulo TEXT NOT NULL,
  detalle TEXT DEFAULT '',
  responsable TEXT DEFAULT '',
  area TEXT DEFAULT '',
  proceso TEXT DEFAULT '',
  fecha_limite DATE,
  automatica BOOLEAN NOT NULL DEFAULT FALSE,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','hecha')),
  hecha_por TEXT,
  hecha_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tasks_rol_estado ON tasks (rol, estado);
