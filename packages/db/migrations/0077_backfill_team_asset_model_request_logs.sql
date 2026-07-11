INSERT INTO user_model_request_logs (
  id,
  provider_request_id,
  workspace_id,
  project_id,
  workflow_id,
  task_id,
  attempt_id,
  user_id,
  provider_name,
  provider_operation,
  model_id,
  provider_model,
  request_key,
  request_hash,
  payload_hash,
  payload_summary,
  request_format,
  request_body_json,
  request_text,
  response_text,
  response_usage_json,
  response_finish_reasons_json,
  status,
  failure_code,
  started_at,
  completed_at,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  request.id,
  request.workspace_id,
  NULL,
  NULL,
  NULL,
  NULL,
  request.created_by_user_id,
  request.provider_name,
  request.provider_operation,
  COALESCE(NULLIF(request.payload_redacted_json->>'model', ''), model.model_code, request.provider_name),
  COALESCE(model.provider_model, NULLIF(request.payload_redacted_json->>'model', ''), request.provider_name),
  request.request_key,
  request.request_hash,
  request.payload_hash,
  LEFT(request.payload_redacted_json->>'prompt', 200),
  'team_asset_image_generation',
  request.payload_redacted_json,
  request.payload_redacted_json->>'prompt',
  request.response_redacted_json::text,
  NULL,
  '[]'::jsonb,
  CASE
    WHEN request.status = 'succeeded' THEN 'succeeded'
    WHEN request.status IN ('failed', 'result_unknown') THEN 'failed'
    WHEN request.status = 'canceled' THEN 'canceled'
    ELSE 'submitted'
  END,
  request.failure_code,
  COALESCE(request.external_submission_started_at, request.created_at),
  CASE
    WHEN request.status IN ('succeeded', 'failed', 'result_unknown', 'canceled') THEN request.updated_at
    ELSE NULL
  END,
  request.created_at,
  request.updated_at
FROM provider_requests request
LEFT JOIN ai_model_configs model
  ON model.model_code = request.payload_redacted_json->>'model'
WHERE request.payload_ref LIKE 'creator://team-assets/%'
  AND request.created_by_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM user_model_request_logs existing
    WHERE existing.provider_request_id = request.id
  );
