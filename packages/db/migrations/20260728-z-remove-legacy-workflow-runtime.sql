-- Retire the legacy workflow runtime while preserving completed task history.

UPDATE ai_model_configs
SET status = 'disabled',
    updated_at = now()
WHERE provider_protocol = 'comfyui'
  AND status = 'active';

UPDATE tasks
SET status = 'failed',
    failure_code = 'legacy_workflow_runtime_removed',
    locked_by = NULL,
    locked_until = NULL,
    heartbeat_at = NULL,
    updated_at = now()
WHERE status NOT IN ('succeeded', 'failed', 'canceled')
  AND id IN (
    SELECT DISTINCT task.id
    FROM tasks task
    LEFT JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
    LEFT JOIN ai_model_configs model ON model.id = snapshot.model_config_id
    WHERE lower(task.input_snapshot_json->>'providerExecutor') = 'comfyui'
       OR lower(snapshot.request_summary_json->>'providerExecutor') = 'comfyui'
       OR lower(model.provider_protocol) = 'comfyui'
       OR EXISTS (
         SELECT 1
         FROM provider_requests provider_request
         WHERE provider_request.task_id = task.id
           AND lower(provider_request.provider_name) = 'comfyui'
       )
  );

UPDATE task_attempts
SET status = 'failed',
    failure_code = 'legacy_workflow_runtime_removed',
    locked_by = NULL,
    locked_until = NULL,
    heartbeat_at = NULL,
    finished_at = COALESCE(finished_at, now()),
    updated_at = now()
WHERE status NOT IN ('succeeded', 'failed', 'canceled')
  AND task_id IN (
    SELECT DISTINCT task.id
    FROM tasks task
    LEFT JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
    LEFT JOIN ai_model_configs model ON model.id = snapshot.model_config_id
    WHERE lower(task.input_snapshot_json->>'providerExecutor') = 'comfyui'
       OR lower(snapshot.request_summary_json->>'providerExecutor') = 'comfyui'
       OR lower(model.provider_protocol) = 'comfyui'
       OR EXISTS (
         SELECT 1
         FROM provider_requests provider_request
         WHERE provider_request.task_id = task.id
           AND lower(provider_request.provider_name) = 'comfyui'
       )
  );

UPDATE provider_requests
SET status = 'failed',
    failure_code = 'legacy_workflow_runtime_removed',
    next_poll_at = NULL,
    poll_deadline_at = NULL,
    updated_at = now()
WHERE status NOT IN ('succeeded', 'failed', 'canceled')
  AND (
    lower(provider_name) = 'comfyui'
    OR task_id IN (
      SELECT DISTINCT task.id
      FROM tasks task
      LEFT JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
      LEFT JOIN ai_model_configs model ON model.id = snapshot.model_config_id
      WHERE lower(task.input_snapshot_json->>'providerExecutor') = 'comfyui'
         OR lower(snapshot.request_summary_json->>'providerExecutor') = 'comfyui'
         OR lower(model.provider_protocol) = 'comfyui'
    )
  );

UPDATE ai_generation_task_snapshots
SET status = 'failed',
    progress_stage = 'failed',
    failure_json = COALESCE(failure_json, '{}'::jsonb) || jsonb_build_object(
      'failureCode', 'legacy_workflow_runtime_removed',
      'reason', 'legacy workflow runtime was removed by a forward migration'
    ),
    failed_at = COALESCE(failed_at, now()),
    updated_at = now()
WHERE status NOT IN ('succeeded', 'failed', 'canceled')
  AND (
    lower(request_summary_json->>'providerExecutor') = 'comfyui'
    OR provider_request_id IN (
      SELECT id
      FROM provider_requests
      WHERE lower(provider_name) = 'comfyui'
    )
    OR model_config_id IN (
      SELECT id
      FROM ai_model_configs
      WHERE provider_protocol = 'comfyui'
    )
    OR task_id IN (
      SELECT DISTINCT task.id
      FROM tasks task
      WHERE lower(task.input_snapshot_json->>'providerExecutor') = 'comfyui'
    )
  );

UPDATE workflows
SET status = 'failed',
    failure_code = 'legacy_workflow_runtime_removed',
    failure_message = 'legacy workflow runtime was removed by a forward migration',
    finished_at = COALESCE(finished_at, now()),
    updated_at = now()
WHERE status NOT IN ('succeeded', 'partial_succeeded', 'failed', 'canceled')
  AND id IN (
    SELECT DISTINCT task.workflow_id
    FROM tasks task
    LEFT JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
    LEFT JOIN ai_model_configs model ON model.id = snapshot.model_config_id
    WHERE lower(task.input_snapshot_json->>'providerExecutor') = 'comfyui'
       OR lower(snapshot.request_summary_json->>'providerExecutor') = 'comfyui'
       OR lower(model.provider_protocol) = 'comfyui'
       OR EXISTS (
         SELECT 1
         FROM provider_requests provider_request
         WHERE provider_request.task_id = task.id
           AND lower(provider_request.provider_name) = 'comfyui'
       )
       OR EXISTS (
         SELECT 1
         FROM provider_requests provider_request
         WHERE provider_request.workflow_id = task.workflow_id
           AND lower(provider_request.provider_name) = 'comfyui'
       )
  );

-- Existing disabled/archived rows cannot retain a protocol removed by the new check.
UPDATE ai_model_configs
SET provider_protocol = 'custom_http',
    updated_at = now()
WHERE provider_protocol = 'comfyui';

ALTER TABLE ai_model_configs
  DROP CONSTRAINT IF EXISTS ai_model_configs_provider_protocol_check;

ALTER TABLE ai_model_configs
  ADD CONSTRAINT ai_model_configs_provider_protocol_check CHECK (provider_protocol IN (
    'creator_dev',
    'openai_images',
    'openai_compatible_chat',
    'cumob_chat',
    'volcengine_ark_image',
    'volcengine_ark_video',
    'aliyun_bailian_video',
    'aliyun_bailian_audio',
    'apimart_audio',
    'globalaiopc_video',
    'lingdong_api',
    'cumob_image',
    'global_ai_opc_image',
    'extra_token_video',
    'saier_video',
    'banana_router',
    'custom_http'
  ));

-- Remove the internal foreign keys first; DROP TABLE without CASCADE then exposes
-- any unexpected external dependency instead of silently deleting it.
DO $$
BEGIN
  IF to_regclass('comfyui_workflows') IS NOT NULL THEN
    ALTER TABLE comfyui_workflows
      DROP CONSTRAINT IF EXISTS comfyui_workflows_current_version_fkey;
  END IF;
  IF to_regclass('comfyui_workflow_versions') IS NOT NULL THEN
    ALTER TABLE comfyui_workflow_versions
      DROP CONSTRAINT IF EXISTS comfyui_workflow_versions_workflow_id_fkey;
  END IF;
END;
$$;

DROP TABLE IF EXISTS comfyui_workflow_versions;
DROP TABLE IF EXISTS comfyui_workflows;
DROP FUNCTION IF EXISTS reject_comfyui_workflow_version_mutation();
