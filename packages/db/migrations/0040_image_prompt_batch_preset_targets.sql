ALTER TABLE image_prompt_styles
  ADD COLUMN IF NOT EXISTS batch_preset_target text NULL;

ALTER TABLE image_prompt_styles
  DROP CONSTRAINT IF EXISTS image_prompt_styles_code_check,
  ADD CONSTRAINT image_prompt_styles_code_check
    CHECK (code ~ '^[a-z0-9_-]+$');

ALTER TABLE image_prompt_styles
  DROP CONSTRAINT IF EXISTS image_prompt_styles_batch_preset_target_check,
  ADD CONSTRAINT image_prompt_styles_batch_preset_target_check
    CHECK (batch_preset_target IS NULL OR batch_preset_target IN ('scene', 'character', 'prop'));

UPDATE image_prompt_styles
SET batch_preset_target = CASE
      WHEN code IN ('scene-vr', 'scene-overlook', 'scene-wide') THEN 'scene'
      WHEN code = 'character-triple' THEN 'character'
      WHEN code = 'prop-triple' THEN 'prop'
      ELSE batch_preset_target
    END,
    updated_at = now()
WHERE deleted_at IS NULL
  AND (
    code IN ('scene-vr', 'scene-overlook', 'scene-wide', 'character-triple', 'prop-triple')
  );
