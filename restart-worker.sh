#!/bin/bash
# Worker 重启脚本

echo "=========================================="
echo "重启 Worker (启用隔离功能)"
echo "=========================================="
echo ""

# 检查 ENABLE_WORKER_ISOLATION 配置
if grep -q "ENABLE_WORKER_ISOLATION=true" .env; then
  echo "✓ Worker隔离已启用"
else
  echo "⚠️  警告: .env 中未找到 ENABLE_WORKER_ISOLATION=true"
  echo "添加配置中..."
  echo "" >> .env
  echo "# Worker Isolation - 隔离本地和线上任务" >> .env
  echo "ENABLE_WORKER_ISOLATION=true" >> .env
  echo "✓ 配置已添加"
fi

echo ""
echo "正在查找并停止运行中的 worker 进程..."

# 查找并停止 worker 进程
pkill -f "seedance-video.worker" && echo "✓ 已停止旧的 worker 进程" || echo "ℹ️  未找到运行中的 worker"

sleep 2

echo ""
echo "启动新的 worker 进程..."
echo "=========================================="
echo ""

# 启动 worker
node src/modules/model-gateway/seedance-video.worker.ts

# 或者使用 npm script
# npm run worker
