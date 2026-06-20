ALTER TABLE admin_secret_values
  ADD COLUMN IF NOT EXISTS request_domain text NULL;

UPDATE admin_secret_values AS secret
SET request_domain = model_domains.request_domain
FROM (
  SELECT
    provider_config_json->>'apiKeyEnv' AS secret_key,
    MIN(
      COALESCE(
        NULLIF(provider_config_json->>'baseURL', ''),
        NULLIF(provider_config_json->>'endpoint', ''),
        NULLIF(provider_config_json->>'requestPath', ''),
        NULLIF(provider_config_json->>'createTaskEndpoint', '')
      )
    ) AS request_domain
  FROM ai_model_configs
  WHERE provider_config_json ? 'apiKeyEnv'
  GROUP BY provider_config_json->>'apiKeyEnv'
) AS model_domains
WHERE secret.secret_key = model_domains.secret_key
  AND COALESCE(NULLIF(secret.request_domain, ''), '') = ''
  AND COALESCE(NULLIF(model_domains.request_domain, ''), '') <> '';

UPDATE admin_secret_values
SET request_domain = 'https://api.deepseek.com'
WHERE secret_key = 'DEEPSEEK_API_KEY'
  AND COALESCE(NULLIF(request_domain, ''), '') = '';

UPDATE admin_secret_values
SET request_domain = 'https://ark.cn-beijing.volces.com'
WHERE secret_key IN ('SEEDANCE_API_KEY', 'VOLCENGINE_ARK_API_KEY')
  AND COALESCE(NULLIF(request_domain, ''), '') = '';

UPDATE admin_secret_values
SET request_domain = 'https://code.shoestravel.xin'
WHERE secret_key = 'GPT_IMAGE2_API_KEY'
  AND COALESCE(NULLIF(request_domain, ''), '') = '';

UPDATE admin_secret_values
SET request_domain = 'https://dashscope.aliyuncs.com'
WHERE secret_key = 'ALIYUNBAILIAN_API_KEY'
  AND COALESCE(NULLIF(request_domain, ''), '') = '';
