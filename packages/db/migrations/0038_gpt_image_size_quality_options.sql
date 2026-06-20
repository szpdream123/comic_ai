WITH option_sets AS (
  SELECT
    '[
      "auto",
      "1:1", "1024x1024", "2048x2048", "2880x2880",
      "2:3", "1024x1536", "2048x3072", "2336x3504",
      "3:2", "1536x1024", "3072x2048", "3504x2336",
      "3:4", "768x1024", "1536x2048", "2304x3072", "2448x3264",
      "4:3", "1024x768", "2048x1536", "3072x2304", "3264x2448",
      "4:5", "1024x1280", "2048x2560", "2560x3200",
      "5:4", "1280x1024", "2560x2048", "3200x2560",
      "9:16", "1024x1824", "1280x3840", "1920x3840", "2160x3840",
      "16:9", "1824x1024", "3840x1280", "3840x2160",
      "21:9"
    ]'::jsonb AS aspect_options,
    '["standard", "hd", "2K", "high", "medium", "low", "auto"]'::jsonb AS quality_options
)
UPDATE ai_model_configs AS c
SET parameter_schema_json = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              COALESCE(c.parameter_schema_json, '{}'::jsonb),
              '{aspectRatio}',
              COALESCE(c.parameter_schema_json->'aspectRatio', '{}'::jsonb)
                || jsonb_build_object(
                  'label', COALESCE(c.parameter_schema_json->'aspectRatio'->>'label', '画面比例'),
                  'type', 'enum',
                  'required', COALESCE((c.parameter_schema_json->'aspectRatio'->>'required')::boolean, false),
                  'options', option_sets.aspect_options,
                  'enum', option_sets.aspect_options
                ),
              true
            ),
            '{aspectRatio,options}',
            option_sets.aspect_options,
            true
          ),
          '{aspectRatio,enum}',
          option_sets.aspect_options,
          true
        ),
        '{quality,options}',
        option_sets.quality_options,
        true
      ),
      '{quality,enum}',
      option_sets.quality_options,
      true
    ),
    updated_at = now()
FROM option_sets
WHERE c.model_code IN ('gpt-image-2-cn', 'gpt-image-2-reference-cn');

WITH option_sets AS (
  SELECT '[
    "auto",
    "1:1", "1024x1024", "2048x2048", "2880x2880",
    "2:3", "1024x1536", "2048x3072", "2336x3504",
    "3:2", "1536x1024", "3072x2048", "3504x2336",
    "3:4", "768x1024", "1536x2048", "2304x3072", "2448x3264",
    "4:3", "1024x768", "2048x1536", "3072x2304", "3264x2448",
    "4:5", "1024x1280", "2048x2560", "2560x3200",
    "5:4", "1280x1024", "2560x2048", "3200x2560",
    "9:16", "1024x1824", "1280x3840", "1920x3840", "2160x3840",
    "16:9", "1824x1024", "3840x1280", "3840x2160",
    "21:9"
  ]'::jsonb AS aspect_options
)
UPDATE ai_model_configs AS c
SET parameter_schema_json = jsonb_set(
      COALESCE(c.parameter_schema_json, '{}'::jsonb),
      '{size,options}',
      option_sets.aspect_options,
      true
    ),
    updated_at = now()
FROM option_sets
WHERE c.model_code = 'gpt-image-2-reference-cn'
  AND c.parameter_schema_json ? 'size';

WITH option_sets AS (
  SELECT
    '[
      "auto",
      "1:1", "1024x1024", "2048x2048", "2880x2880",
      "2:3", "1024x1536", "2048x3072", "2336x3504",
      "3:2", "1536x1024", "3072x2048", "3504x2336",
      "3:4", "768x1024", "1536x2048", "2304x3072", "2448x3264",
      "4:3", "1024x768", "2048x1536", "3072x2304", "3264x2448",
      "4:5", "1024x1280", "2048x2560", "2560x3200",
      "5:4", "1280x1024", "2560x2048", "3200x2560",
      "9:16", "1024x1824", "1280x3840", "1920x3840", "2160x3840",
      "16:9", "1824x1024", "3840x1280", "3840x2160",
      "21:9"
    ]'::jsonb AS aspect_options,
    '["standard", "hd", "2K", "high", "medium", "low", "auto"]'::jsonb AS quality_options
)
UPDATE runtime_config_entries AS c
SET value_json = jsonb_set(
      jsonb_set(
        c.value_json,
        '{templates}',
        (
          SELECT jsonb_agg(
            CASE template->>'key'
              WHEN 'aspectRatio' THEN jsonb_set(template, '{options}', option_sets.aspect_options, true)
              WHEN 'quality' THEN jsonb_set(template, '{options}', option_sets.quality_options, true)
              ELSE template
            END
          )
          FROM jsonb_array_elements(COALESCE(c.value_json->'templates', '[]'::jsonb)) AS template
        ),
        true
      ),
      '{updatedByMigration}',
      to_jsonb('0038_gpt_image_size_quality_options'::text),
      true
    ),
    updated_at = now()
FROM option_sets
WHERE c.key = 'model.parameter_templates';
