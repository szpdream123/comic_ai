UPDATE ai_model_configs
SET invocation_mode = 'async_polling',
    capabilities_json = jsonb_set(capabilities_json, '{asyncPolling}', 'true'::jsonb, true),
    provider_config_json = jsonb_set(
      jsonb_set(
        jsonb_set(
          provider_config_json
            - 'timeoutMs'
            - 'requestTimeoutMs'
            - 'pollIntervalMs'
            - 'maxPollAttempts',
          '{queryTaskEndpoint}',
          to_jsonb('/v1/status/{taskId}'::text),
          true
        ),
        '{defaultRequestParams}',
        COALESCE(provider_config_json->'defaultRequestParams', '{}'::jsonb)
          || '{"stream":false,"async":true}'::jsonb,
        true
      ),
      '{inputSchema,request,async,const}',
      'true'::jsonb,
      true
    ),
    remark = CASE provider_model
      WHEN 'gpt-image-2-pro' THEN 'Cumob 图像生成 API 的 GPT Image 2 Pro 模型。POST /v1/images/generations 返回任务 ID，平台通过 GET /v1/status/{id} 轮询结果。'
      ELSE 'Cumob 图像生成 API 的 GPT Image 2 模型。POST /v1/images/generations 返回任务 ID，平台通过 GET /v1/status/{id} 轮询结果。'
    END,
    updated_at = now()
WHERE model_code IN (
  'cumob-gpt-image-2-pro',
  'cumob-gpt-image-2-vip',
  'cumob-gpt-image-2'
);

UPDATE ai_model_dispatch_policies AS policy
SET poll_queue_name = 'generation-poll-image',
    polling_interval_ms = 30000,
    updated_at = now()
FROM ai_model_configs AS model
WHERE model.id = policy.model_config_id
  AND model.model_code IN (
    'cumob-gpt-image-2-pro',
    'cumob-gpt-image-2-vip',
    'cumob-gpt-image-2'
  );
