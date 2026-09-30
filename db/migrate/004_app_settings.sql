-- 004_app_settings: configuración administrable (SMTP/Resend).
-- Los secretos van cifrados (AES-256-GCM); jamás en claro.
CREATE TABLE IF NOT EXISTS app_settings (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  secreto BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
