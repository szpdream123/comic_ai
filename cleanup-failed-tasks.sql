-- 清理脚本：删除所有未完成的 provider_requests 和 tasks
-- ⚠️ 警告：这会删除所有 pending/failed 的任务，仅在开发环境使用

-- 1. 删除所有 failed 状态的 provider_requests
DELETE FROM provider_requests
WHERE status IN ('failed', 'created')
  AND created_at > NOW() - INTERVAL '24 hours';

-- 2. 删除所有 failed/queued 状态的任务
DELETE FROM tasks
WHERE status IN ('failed', 'queued')
  AND task_type = 'episode_generate_video'
  AND created_at > NOW() - INTERVAL '24 hours';

-- 3. 验证清理结果
SELECT
  '清理后状态' as info,
  status,
  COUNT(*) as count
FROM tasks
WHERE task_type = 'episode_generate_video'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;

SELECT
  '清理后 provider_requests' as info,
  status,
  COUNT(*) as count
FROM provider_requests
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;
