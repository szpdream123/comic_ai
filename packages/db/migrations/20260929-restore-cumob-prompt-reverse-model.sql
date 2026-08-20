UPDATE ai_model_configs
SET capabilities_json = jsonb_set(
      COALESCE(capabilities_json, '{}'::jsonb),
      '{input}',
      (
        SELECT jsonb_agg(to_jsonb(input_name) ORDER BY input_name)
        FROM (
          SELECT DISTINCT input_name
          FROM jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(capabilities_json->'input') = 'array'
                THEN capabilities_json->'input'
              ELSE '[]'::jsonb
            END
          ) AS existing(input_name)
          UNION ALL SELECT 'image_url'
        ) AS inputs
      ),
      true
    ),
    ui_config_json = jsonb_set(
      COALESCE(ui_config_json, '{}'::jsonb),
      '{toolboxTools}',
      '["prompt-reverse"]'::jsonb,
      true
    ),
    updated_at = now()
WHERE model_code = 'cumob-gpt-5-6-sol'
  AND status = 'active';
