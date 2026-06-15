DO $$
DECLARE
  legacy_constraint record;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'episode_generation_drafts'
      AND column_name IN ('organization_id', 'episode_id', 'target_type', 'target_id', 'mode')
    GROUP BY table_name
    HAVING COUNT(*) = 5
  ) THEN
    RETURN;
  END IF;

  FOR legacy_constraint IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = current_schema()
      AND rel.relname = 'episode_generation_drafts'
      AND con.contype = 'u'
      AND (
        SELECT array_agg(att.attname::text ORDER BY keys.ordinality)
        FROM unnest(con.conkey) WITH ORDINALITY AS keys(attnum, ordinality)
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = keys.attnum
      ) = ARRAY['organization_id', 'episode_id', 'target_type', 'target_id']::text[]
  LOOP
    EXECUTE format('ALTER TABLE episode_generation_drafts DROP CONSTRAINT %I', legacy_constraint.conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = current_schema()
      AND rel.relname = 'episode_generation_drafts'
      AND con.contype = 'u'
      AND (
        SELECT array_agg(att.attname::text ORDER BY keys.ordinality)
        FROM unnest(con.conkey) WITH ORDINALITY AS keys(attnum, ordinality)
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = keys.attnum
      ) = ARRAY['organization_id', 'episode_id', 'target_type', 'target_id', 'mode']::text[]
  ) THEN
    ALTER TABLE episode_generation_drafts
      ADD CONSTRAINT episode_generation_drafts_mode_unique
      UNIQUE (organization_id, episode_id, target_type, target_id, mode);
  END IF;
END $$;
