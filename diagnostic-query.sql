-- 核心诊断SQL - 一次性检查所有关键信息
-- 在数据库中执行此查询

-- 1. 检查最新失败任务的完整信息
WITH latest_failed_task AS (
  SELECT
    t.id,
    t.task_type,
    t.status,
    t.input_snapshot_json->>'requestHost' as request_host,
    t.input_snapshot_json->>'providerExecutor' as provider_executor,
    t.current_attempt_id,
    t.attempt_count,
    t.created_at
  FROM tasks t
  WHERE t.task_type = 'episode_generate_video'
    AND t.status = 'failed'
  ORDER BY t.created_at DESC
  LIMIT 1
),
-- 2. 检查对应的provider_request
provider_req AS (
  SELECT
    pr.id as provider_request_id,
    pr.task_id,
    pr.attempt_id as request_attempt_id,
    pr.status as request_status,
    pr.external_submission_started_at,
    pr.created_at as pr_created_at
  FROM provider_requests pr
  WHERE pr.task_id = (SELECT id FROM latest_failed_task)
  ORDER BY pr.created_at DESC
  LIMIT 1
)
-- 3. 合并显示
SELECT
  '=== 任务信息 ===' as section,
  lft.id as task_id,
  lft.request_host,
  lft.provider_executor,
  lft.current_attempt_id as task_current_attempt,
  lft.attempt_count,
  lft.created_at as task_created_at,
  '=== Provider Request ===' as section2,
  pr.provider_request_id,
  pr.request_attempt_id,
  CASE
    WHEN pr.request_attempt_id = lft.current_attempt_id THEN '✓ 匹配'
    WHEN pr.request_attempt_id IS NULL THEN '✗ NULL (问题根源)'
    ELSE '✗ 不匹配'
  END as attempt_binding_status,
  pr.request_status,
  pr.external_submission_started_at,
  '=== 诊断结论 ===' as section3,
  CASE
    WHEN lft.request_host IS NULL THEN '⚠️ requestHost未设置 - API服务器可能未重启'
    WHEN lft.request_host IN ('127.0.0.1', 'localhost') THEN '✓ requestHost已设置为本地'
    ELSE '✓ requestHost已设置: ' || lft.request_host
  END as request_host_status,
  CASE
    WHEN pr.request_attempt_id IS NULL THEN '❌ 绑定失败：provider_request的attempt_id为NULL'
    WHEN pr.request_attempt_id != lft.current_attempt_id THEN '❌ 绑定冲突：attempt_id不匹配'
    ELSE '✓ 绑定正常'
  END as binding_diagnosis
FROM latest_failed_task lft
LEFT JOIN provider_req pr ON pr.task_id = lft.id;

-- 4. 额外：检查最近1小时内所有任务的requestHost分布
SELECT
  '=== requestHost 分布统计 ===' as info,
  CASE
    WHEN input_snapshot_json->>'requestHost' IS NULL THEN '❌ 无requestHost'
    WHEN input_snapshot_json->>'requestHost' IN ('127.0.0.1', 'localhost') THEN '✓ 本地'
    ELSE '✓ 生产: ' || (input_snapshot_json->>'requestHost')
  END as host_category,
  status,
  COUNT(*) as count,
  MAX(created_at) as latest
FROM tasks
WHERE task_type = 'episode_generate_video'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY host_category, status
ORDER BY latest DESC;
