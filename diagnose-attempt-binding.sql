-- 诊断查询：检查最新失败任务的完整链路

-- 1. 查看最新失败任务
SELECT
  '=== 最新失败任务 ===' as info,
  t.id as task_id,
  t.status,
  t.current_attempt_id,
  t.attempt_count,
  t.input_snapshot_json->>'requestHost' as request_host,
  t.created_at
FROM tasks t
WHERE t.task_type = 'episode_generate_video'
  AND t.status = 'failed'
ORDER BY t.created_at DESC
LIMIT 1;

-- 2. 查看该任务的所有 attempts
WITH latest_failed AS (
  SELECT id FROM tasks
  WHERE task_type = 'episode_generate_video' AND status = 'failed'
  ORDER BY created_at DESC LIMIT 1
)
SELECT
  '=== Task Attempts ===' as info,
  ta.id as attempt_id,
  ta.attempt_number,
  ta.status,
  ta.locked_by as worker_id,
  ta.claimed_at,
  ta.started_at,
  ta.created_at
FROM task_attempts ta
WHERE ta.task_id = (SELECT id FROM latest_failed)
ORDER BY ta.attempt_number;

-- 3. 查看该任务的所有 provider_requests
WITH latest_failed AS (
  SELECT id FROM tasks
  WHERE task_type = 'episode_generate_video' AND status = 'failed'
  ORDER BY created_at DESC LIMIT 1
)
SELECT
  '=== Provider Requests ===' as info,
  pr.id as provider_request_id,
  pr.attempt_id,
  pr.request_key,
  pr.status,
  pr.external_submission_started_at,
  pr.created_at,
  CASE
    WHEN pr.attempt_id IS NULL THEN '❌ NULL'
    WHEN pr.attempt_id IN (SELECT id FROM task_attempts WHERE task_id = (SELECT id FROM latest_failed)) THEN '✓ 匹配某个attempt'
    ELSE '⚠️ 绑定到其他任务的attempt'
  END as binding_check
FROM provider_requests pr
WHERE pr.task_id = (SELECT id FROM latest_failed)
ORDER BY pr.created_at;

-- 4. 检查是否有旧的、未完成的provider_request被复用
WITH latest_failed AS (
  SELECT id FROM tasks
  WHERE task_type = 'episode_generate_video' AND status = 'failed'
  ORDER BY created_at DESC LIMIT 1
)
SELECT
  '=== Provider Request 复用情况 ===' as info,
  pr.id,
  pr.created_at as pr_created_at,
  t.created_at as task_created_at,
  CASE
    WHEN pr.created_at < t.created_at THEN '⚠️ provider_request比任务更早（被复用）'
    ELSE '✓ provider_request与任务同时创建'
  END as reuse_check
FROM provider_requests pr
JOIN tasks t ON t.id = pr.task_id
WHERE pr.task_id = (SELECT id FROM latest_failed);
