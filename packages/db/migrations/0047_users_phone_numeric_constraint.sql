UPDATE users
SET phone_e164 = NULL,
    updated_at = now()
WHERE phone_e164 IS NOT NULL
  AND phone_e164 !~ '^1[0-9]{10}$';

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_phone_e164_format_check;

ALTER TABLE users
  ADD CONSTRAINT users_phone_e164_format_check
  CHECK (phone_e164 IS NULL OR phone_e164 ~ '^1[0-9]{10}$');
