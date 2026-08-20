UPDATE ai_model_configs
SET ui_config_json = jsonb_set(
  COALESCE(ui_config_json, '{}'::jsonb),
  '{toolboxTools}',
  COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(tool_name) ORDER BY tool_name)
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(ui_config_json->'toolboxTools') = 'array'
            THEN ui_config_json->'toolboxTools'
          ELSE '[]'::jsonb
        END
      ) AS tools(tool_name)
      WHERE tool_name <> 'prompt-reverse'
    ),
    '[]'::jsonb
  ),
  true
),
updated_at = now()
WHERE model_code = 'cumob-gpt-5-6-sol'
  AND NOT (
    COALESCE(capabilities_json->>'imageInput', 'false') = 'true'
    OR COALESCE(capabilities_json->'input', '[]'::jsonb) ?| ARRAY['image', 'image_url', 'input_image']
  );
