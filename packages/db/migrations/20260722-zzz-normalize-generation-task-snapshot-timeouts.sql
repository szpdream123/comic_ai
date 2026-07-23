UPDATE tasks
SET input_snapshot_json = jsonb_set(
  input_snapshot_json,
  '{modelConfigSnapshot,config,providerConfig}',
  (
    COALESCE(
      input_snapshot_json #> '{modelConfigSnapshot,config,providerConfig}',
      '{}'::jsonb
    )
      - 'timeoutMs'
      - 'requestTimeoutMs'
      - 'pollIntervalMs'
      - 'maxPollAttempts'
  ) || jsonb_build_object(
    'timeoutMs',
    CASE input_snapshot_json->'modelConfigSnapshot'->'config'->>'mediaType'
      WHEN 'video' THEN 10800000
      ELSE 3600000
    END
  ),
  true
)
WHERE jsonb_typeof(input_snapshot_json->'modelConfigSnapshot') = 'object'
  AND input_snapshot_json->'modelConfigSnapshot'->'config'->>'mediaType' IN (
    'image',
    'audio',
    'video'
  )
  AND (
    input_snapshot_json->'modelConfigSnapshot'->'config'->'providerConfig' ?| ARRAY[
      'requestTimeoutMs',
      'pollIntervalMs',
      'maxPollAttempts'
    ]
    OR input_snapshot_json->'modelConfigSnapshot'->'config'->'providerConfig'->>'timeoutMs'
      IS DISTINCT FROM CASE input_snapshot_json->'modelConfigSnapshot'->'config'->>'mediaType'
        WHEN 'video' THEN '10800000'
        ELSE '3600000'
      END
  );
