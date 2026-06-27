CREATE TABLE IF NOT EXISTS payment_logs (
  id uuid PRIMARY KEY,
  organization_id uuid NULL REFERENCES organizations(id),
  workspace_id uuid NULL REFERENCES workspaces(id),
  user_id uuid NULL REFERENCES users(id),
  order_id uuid NULL REFERENCES billing_orders(id),
  payment_intent_id uuid NULL REFERENCES payment_intents(id),
  provider_event_id uuid NULL REFERENCES payment_provider_events(id),
  provider text NOT NULL CHECK (provider IN ('paylab', 'wechat_pay', 'alipay')),
  merchant_order_no text NOT NULL,
  provider_trade_id text NULL,
  recharge_title text NULL,
  recharge_description text NULL,
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL DEFAULT 'CNY' CHECK (currency IN ('CNY')),
  request_time timestamptz NOT NULL,
  request_params_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_headers_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  callback_time timestamptz NULL,
  callback_params_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  callback_headers_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  callback_count integer NOT NULL DEFAULT 0,
  success boolean NOT NULL DEFAULT false,
  processing_status text NULL CHECK (
    processing_status IN (
      'received',
      'processed',
      'duplicate',
      'rejected',
      'unmatched',
      'manual_review_required'
    )
  ),
  failure_code text NULL,
  event_type text NULL CHECK (
    event_type IN (
      'payment_succeeded',
      'payment_failed',
      'payment_closed',
      'refund_succeeded',
      'unknown'
    )
  ),
  provider_event_dedup_key text NULL,
  signature_status text NULL CHECK (
    signature_status IN ('unverified', 'verified', 'invalid')
  ),
  raw_request_hash text NULL,
  raw_callback_hash text NULL,
  callback_result_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  extra_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, merchant_order_no),
  UNIQUE (provider, provider_event_dedup_key),
  FOREIGN KEY (organization_id, order_id)
    REFERENCES billing_orders (organization_id, id),
  FOREIGN KEY (organization_id, payment_intent_id)
    REFERENCES payment_intents (organization_id, id),
  FOREIGN KEY (organization_id, provider_event_id)
    REFERENCES payment_provider_events (organization_id, id)
);

CREATE INDEX IF NOT EXISTS payment_logs_request_time_idx
  ON payment_logs (provider, request_time DESC);

CREATE INDEX IF NOT EXISTS payment_logs_order_idx
  ON payment_logs (organization_id, order_id, request_time DESC);
