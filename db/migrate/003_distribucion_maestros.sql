-- 003_distribucion_maestros: maestros del módulo Distribución (Fase 2).
CREATE TABLE IF NOT EXISTS circunscripciones (
  codigo TEXT PRIMARY KEY,
  nombre TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS municipios (
  codigo TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  circunscripcion TEXT REFERENCES circunscripciones(codigo)
);

CREATE TABLE IF NOT EXISTS tipos_distribucion (
  codigo TEXT PRIMARY KEY,
  nombre TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS distribucion_municipio (
  id SERIAL PRIMARY KEY,
  numero INT NOT NULL,
  tipo INT NOT NULL,
  ano INT NOT NULL CHECK (ano BETWEEN 2000 AND 2100),
  ppto NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (ppto >= 0),
  municipio TEXT NOT NULL REFERENCES municipios(codigo),
  valor NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (numero, tipo, ano, municipio)
);
CREATE INDEX IF NOT EXISTS idx_distmun_ano ON distribucion_municipio (ano);
CREATE INDEX IF NOT EXISTS idx_distmun_municipio ON distribucion_municipio (municipio);
