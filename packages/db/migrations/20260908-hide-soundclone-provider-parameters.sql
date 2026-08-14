-- SoundClone provider fields are transport details. They must not be exposed to creators.
UPDATE ai_model_configs
SET parameter_schema_json = parameter_schema_json || jsonb_build_object(
  'voiceId', jsonb_build_object('label', '声音模型 ID', 'type', 'string', 'required', true, 'visible', false),
  'soundVersion', jsonb_build_object('type', 'enum', 'options', jsonb_build_array('v1', 'v2'), 'visible', false),
  'language', jsonb_build_object('type', 'string', 'visible', false),
  'emotion', jsonb_build_object('type', 'enum', 'options', jsonb_build_array('happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'neutral'), 'visible', false),
  'speed', jsonb_build_object('type', 'number', 'minimum', 0.5, 'maximum', 2, 'visible', false),
  'vol', jsonb_build_object('type', 'number', 'minimum', 0.01, 'maximum', 10, 'visible', false),
  'pitch', jsonb_build_object('type', 'integer', 'minimum', -12, 'maximum', 12, 'visible', false),
  'subtitleEnable', jsonb_build_object('type', 'boolean', 'visible', false),
  'subtitleType', jsonb_build_object('type', 'enum', 'options', jsonb_build_array('word'), 'visible', false)
), updated_at = now()
WHERE model_code = 'soundclone';
