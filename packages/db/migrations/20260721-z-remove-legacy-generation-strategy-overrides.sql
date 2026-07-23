UPDATE ai_model_configs
SET provider_config_json = provider_config_json
      - 'timeoutMs'
      - 'requestTimeoutMs'
      - 'pollIntervalMs'
      - 'maxPollAttempts',
    updated_at = now()
WHERE media_type IN ('image', 'video', 'audio')
  AND provider_config_json ?| ARRAY[
    'timeoutMs',
    'requestTimeoutMs',
    'pollIntervalMs',
    'maxPollAttempts'
  ];

UPDATE ai_model_dispatch_policies AS policy
SET polling_interval_ms = 30000,
    polling_backoff_json = '{}'::jsonb,
    retry_policy_json = retry_policy_json - 'pollAttempts',
    updated_at = now()
FROM ai_model_configs AS model
WHERE model.id = policy.model_config_id
  AND model.media_type IN ('image', 'video', 'audio')
  AND (
    policy.polling_interval_ms <> 30000
    OR policy.polling_backoff_json <> '{}'::jsonb
    OR policy.retry_policy_json ? 'pollAttempts'
  );
