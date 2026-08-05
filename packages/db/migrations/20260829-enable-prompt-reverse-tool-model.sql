UPDATE ai_model_configs
SET ui_config_json = COALESCE(ui_config_json, '{}'::jsonb)
      || jsonb_build_object(
        'toolboxTools',
        (
          SELECT jsonb_agg(DISTINCT enabled_tool)
          FROM (
            SELECT jsonb_array_elements_text(
              CASE
                WHEN jsonb_typeof(ui_config_json->'toolboxTools') = 'array'
                  THEN ui_config_json->'toolboxTools'
                ELSE '[]'::jsonb
              END
            ) AS enabled_tool
            UNION ALL
            SELECT 'prompt-reverse'
          ) enabled_tools
        )
      ),
    updated_at = now()
WHERE model_code = 'cumob-gpt-5-6-sol';
