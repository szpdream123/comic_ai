CREATE SEQUENCE IF NOT EXISTS user_invite_code_seq
  AS bigint
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  NO MAXVALUE;

CREATE OR REPLACE FUNCTION generate_user_invite_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  sequence_value bigint;
  working_value bigint;
  encoded text := '';
  remainder_index integer;
BEGIN
  sequence_value := nextval('user_invite_code_seq');
  working_value := sequence_value;

  WHILE working_value > 0 LOOP
    remainder_index := (working_value % 36)::integer;
    encoded := substr(alphabet, remainder_index + 1, 1) || encoded;
    working_value := working_value / 36;
  END LOOP;

  IF encoded = '' THEN
    encoded := '0';
  END IF;

  RETURN lpad(encoded, 10, '0');
END;
$$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS invite_code text;

UPDATE users
SET invite_code = generate_user_invite_code(),
    updated_at = now()
WHERE invite_code IS NULL;

ALTER TABLE users
  ALTER COLUMN invite_code SET DEFAULT generate_user_invite_code();

ALTER TABLE users
  ALTER COLUMN invite_code SET NOT NULL;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_invite_code_format_check;

ALTER TABLE users
  ADD CONSTRAINT users_invite_code_format_check
  CHECK (invite_code ~ '^[0-9A-Z]{10}$');

CREATE UNIQUE INDEX IF NOT EXISTS users_invite_code_key
  ON users (invite_code);
