#!/bin/bash
# 快速状态检查脚本

echo "=========================================="
echo "Worker 隔离功能状态检查"
echo "=========================================="
echo ""

echo "1. 环境变量配置："
echo "---"
grep -E "ENABLE_WORKER_ISOLATION|WORKER_ENVIRONMENT" .env 2>/dev/null || echo "  未找到相关配置"
echo ""

echo "2. Worker 进程状态："
echo "---"
# Windows 使用 tasklist
if command -v tasklist &> /dev/null; then
  tasklist | grep -i node | grep -i "seedance\|worker" || echo "  未找到运行中的worker进程"
else
  ps aux | grep "[s]eedance-video.worker" || echo "  未找到运行中的worker进程"
fi
echo ""

echo "3. 关键文件检查："
echo "---"
for file in \
  "apps/backend/src/modules/model-gateway/worker-isolation.config.ts" \
  "apps/backend/src/modules/model-gateway/request-host-middleware.ts"
do
  if [ -f "$file" ]; then
    echo "  ✓ $file"
  else
    echo "  ✗ $file (缺失)"
  fi
done
echo ""

echo "=========================================="
echo "诊断建议"
echo "=========================================="
echo ""
echo "请提供以下信息以继续诊断："
echo ""
echo "A. Worker启动日志（是否显示 'Worker Isolation: ENABLED'？）"
echo ""
echo "B. 执行 diagnose-attempt-binding.sql 中的SQL查询结果"
echo ""
echo "C. 最新失败任务的 task_id"
echo ""
echo "或者，请告诉我："
echo "- Worker是否成功重启？"
echo "- 是否看到任何错误消息？"
echo "- 问题是否在重启后依然持续？"
