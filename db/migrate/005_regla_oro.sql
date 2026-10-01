-- 005_regla_oro: regla de oro anual por municipio (paso 1: % sin valores).
CREATE TABLE IF NOT EXISTS regla_oro_anual (
  vigencia INT NOT NULL CHECK (vigencia BETWEEN 2000 AND 2100),
  municipio TEXT NOT NULL REFERENCES municipios(codigo),
  regla NUMERIC(18,8) NOT NULL CHECK (regla >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (vigencia, municipio)
);
