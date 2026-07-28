-- Canvas prompt directive catalogs are immutable user-owned config versions.
-- Keep the existing table and audit semantics; only widen the type allowlist.
ALTER TABLE canvas_user_configs
  DROP CONSTRAINT IF EXISTS canvas_user_configs_type_check;

ALTER TABLE canvas_user_configs
  ADD CONSTRAINT canvas_user_configs_type_check
  CHECK (config_type IN ('style', 'skill', 'toolbar', 'slash_command', 'preset'));

CREATE INDEX IF NOT EXISTS canvas_user_configs_prompt_directive_idx
  ON canvas_user_configs (user_id, config_type, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL AND config_type IN ('slash_command', 'preset');
