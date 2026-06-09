ALTER TABLE storyboard_prompt_templates
  ALTER COLUMN output_package_id DROP NOT NULL;

UPDATE storyboard_prompt_templates
SET camera_package_ids = '[]'::jsonb,
    output_package_id = NULL,
    updated_at = NOW()
WHERE deleted_at IS NULL
  AND (
    camera_package_ids <> '[]'::jsonb
    OR output_package_id IS NOT NULL
  );

DELETE FROM storyboard_prompt_package_versions
WHERE package_id IN (
  SELECT id
  FROM storyboard_prompt_packages
  WHERE package_type IN ('camera', 'output')
);

DELETE FROM storyboard_prompt_packages
WHERE package_type IN ('camera', 'output');

DELETE FROM character_prompt_templates
WHERE stage IN ('merge', 'grid');

DELETE FROM scene_prompt_templates
WHERE stage IN ('extract', 'merge', 'detail', 'image');

DELETE FROM shot_prompt_templates
WHERE stage IN ('panel', 'camera', 'image');

ALTER TABLE storyboard_prompt_packages
  DROP CONSTRAINT IF EXISTS storyboard_prompt_packages_package_type_check,
  ADD CONSTRAINT storyboard_prompt_packages_package_type_check
    CHECK (package_type IN ('genre', 'emotion', 'taboo'));

ALTER TABLE character_prompt_templates
  DROP CONSTRAINT IF EXISTS character_prompt_templates_stage_check,
  ADD CONSTRAINT character_prompt_templates_stage_check
    CHECK (stage IN ('extract'));

ALTER TABLE scene_prompt_templates
  DROP CONSTRAINT IF EXISTS scene_prompt_templates_stage_check,
  ADD CONSTRAINT scene_prompt_templates_stage_check
    CHECK (stage IN ('split'));

ALTER TABLE shot_prompt_templates
  DROP CONSTRAINT IF EXISTS shot_prompt_templates_stage_check,
  ADD CONSTRAINT shot_prompt_templates_stage_check
    CHECK (stage IN ('outline'));
