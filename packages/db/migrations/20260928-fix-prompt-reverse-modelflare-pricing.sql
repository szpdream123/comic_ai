UPDATE ai_model_configs
SET pricing_json = COALESCE(pricing_json, '{}'::jsonb)
  || jsonb_build_object(
    'canvasAgentBillingMode', 'token',
    'canvasAgentTokenCreditsPerMillion', 4000,
    'minimumCredits', 1
  ),
  updated_at = now()
WHERE model_code = 'modelflare-gpt-5-6-sol'
  AND status = 'active'
  AND COALESCE(pricing_json->>'canvasAgentBillingMode', '') <> 'token';
