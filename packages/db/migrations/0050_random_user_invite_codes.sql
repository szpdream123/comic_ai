CREATE OR REPLACE FUNCTION generate_random_user_invite_code_candidate()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  generated text := '';
  position_index integer;
BEGIN
  FOR position_index IN 1..10 LOOP
    generated := generated || substr(alphabet, floor(random() * 36)::integer + 1, 1);
  END LOOP;

  RETURN generated;
END;
$$;

CREATE OR REPLACE FUNCTION generate_user_invite_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  candidate text;
BEGIN
  LOOP
    candidate := generate_random_user_invite_code_candidate();

    IF NOT EXISTS (
      SELECT 1
      FROM users
      WHERE invite_code = candidate
    ) THEN
      RETURN candidate;
    END IF;
  END LOOP;
END;
$$;

DO $$
DECLARE
  user_record record;
  candidate text;
BEGIN
  FOR user_record IN
    SELECT id
    FROM users
    ORDER BY created_at ASC, id ASC
  LOOP
    LOOP
      candidate := generate_random_user_invite_code_candidate();

      BEGIN
        UPDATE users
        SET invite_code = candidate,
            updated_at = now()
        WHERE id = user_record.id;

        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          NULL;
      END;
    END LOOP;
  END LOOP;
END;
$$;

ALTER TABLE users
  ALTER COLUMN invite_code SET DEFAULT generate_user_invite_code();
