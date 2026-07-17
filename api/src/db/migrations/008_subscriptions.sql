-- MawinguOps — multi-channel subscriptions + delivery audit log.
--
-- Farmers (or anyone) can subscribe to the weekly advisory by SMS or email:
-- via USSD (menu option 3, phone captured from the session), or via the web
-- dashboard's subscribe form. pipeline/broadcast_advisory.py fans the canonical
-- advisory out to every active subscription after each pipeline run, and sends
-- an extra immediate alert when the drought trigger category escalates.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact VARCHAR(120) NOT NULL,            -- phone number or email address
  channel VARCHAR(10) NOT NULL,             -- 'sms' | 'email'
  location VARCHAR(50) NOT NULL DEFAULT 'machakos',
  crop VARCHAR(20) NOT NULL DEFAULT 'maize',
  language VARCHAR(5) NOT NULL DEFAULT 'sw',
  tier VARCHAR(10) NOT NULL DEFAULT 'free', -- future paid tiers; not enforced yet
  active BOOLEAN NOT NULL DEFAULT TRUE,
  consent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contact, channel)
);

CREATE TABLE IF NOT EXISTS delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES subscriptions(id),
  channel VARCHAR(10) NOT NULL,
  status VARCHAR(20) NOT NULL,              -- 'sent' | 'failed' | 'dry_run'
  trigger_reason VARCHAR(20) NOT NULL,      -- 'weekly_digest' | 'escalation'
  advisory_text TEXT NOT NULL,
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_active
  ON subscriptions(active, channel);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_sent
  ON delivery_logs(sent_at DESC);
