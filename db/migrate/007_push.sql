-- 007_push: suscripciones Web Push + canal push en outbox.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  fnc_sub TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_sub ON push_subscriptions (fnc_sub);
ALTER TABLE outbox DROP CONSTRAINT IF EXISTS outbox_canal_check;
ALTER TABLE outbox ADD CHECK (canal IN ('email', 'discord', 'campana', 'push'));
