CREATE TABLE IF NOT EXISTS sms_send_records (
  id uuid PRIMARY KEY,
  phone_e164 text NOT NULL,
  challenge_id uuid NULL REFERENCES login_challenges(id),
  provider text NOT NULL CHECK (provider IN ('tencent', 'dev')),
  status text NOT NULL CHECK (
    status IN ('requested', 'sent', 'failed', 'rate_limited')
  ),
  ip_address_hash text NULL,
  user_agent_hash text NULL,
  provider_request_id text NULL,
  error_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sms_send_records_phone_created_idx
  ON sms_send_records (phone_e164, created_at DESC);

CREATE INDEX IF NOT EXISTS sms_send_records_phone_status_created_idx
  ON sms_send_records (phone_e164, status, created_at DESC);
