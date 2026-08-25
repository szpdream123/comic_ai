#!/bin/bash
echo "=== 当前状态检查 ==="
echo ""

# 1. 检查配置
echo "1. 环境变量配置:"
if grep -q "ENABLE_WORKER_ISOLATION=true" .env 2>/dev/null; then
  echo "  ✓ ENABLE_WORKER_ISOLATION=true (已配置)"
else
  echo "  ✗ ENABLE_WORKER_ISOLATION 未配置或为false"
fi
echo ""

# 2. 检查运行中的worker进程
echo "2. 运行中的 Worker 进程:"
if pgrep -f "seedance-video.worker" > /dev/null; then
  echo "  ✓ Worker 正在运行"
  ps aux | grep "[s]eedance-video.worker" | awk '{print "    PID:", $2, "启动时间:", $9}'
else
  echo "  ✗ Worker 未运行"
fi
echo ""

# 3. 检查代码文件
echo "3. Worker隔离文件:"
if [ -f "src/modules/model-gateway/worker-isolation.config.ts" ]; then
  echo "  ✓ worker-isolation.config.ts 存在"
else
  echo "  ✗ worker-isolation.config.ts 不存在"
fi
echo ""

echo "=== 下一步操作 ==="
echo ""
if pgrep -f "seedance-video.worker" > /dev/null; then
  echo "Worker 正在运行，需要重启才能应用新配置："
  echo "  1. 停止: Ctrl+C 或 pkill -f 'seedance-video.worker'"
  echo "  2. 启动: npm run worker"
else
  echo "Worker 未运行，请启动："
  echo "  npm run worker"
fi
