ALTER TABLE sms_send_records
  ADD COLUMN IF NOT EXISTS verification_code text NULL,
  ADD COLUMN IF NOT EXISTS sms_content text NULL,
  ADD COLUMN IF NOT EXISTS ip_address text NULL;

