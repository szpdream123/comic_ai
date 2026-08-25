#!/bin/bash
# Worker Isolation 启动前检查脚本

echo "=========================================="
echo "Worker Isolation - 启动前检查"
echo "=========================================="
echo ""

# 检查1: 验证核心文件是否存在
echo "1. 检查核心文件..."
FILES=(
  "apps/backend/src/modules/model-gateway/worker-isolation.config.ts"
  "apps/backend/src/modules/model-gateway/request-host-middleware.ts"
  "apps/backend/src/modules/model-gateway/seedance-video.worker.ts"
  "apps/backend/src/entrypoints/phone-auth-dev-server.ts"
)

ALL_EXISTS=true
for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✓ $file"
  else
    echo "  ✗ $file (缺失)"
    ALL_EXISTS=false
  fi
done
echo ""

# 检查2: 验证TypeScript编译
echo "2. 检查TypeScript编译..."
if npx tsc --project apps/backend/tsconfig.json --noEmit 2>&1 | grep -q "error TS"; then
  echo "  ✗ TypeScript编译有错误"
  npx tsc --project apps/backend/tsconfig.json --noEmit 2>&1 | grep "error TS" | head -5
else
  echo "  ✓ TypeScript编译通过"
fi
echo ""

# 检查3: 验证worker隔离逻辑
echo "3. 运行worker隔离验证测试..."
if [ -f "apps/backend/verify-worker-isolation.js" ]; then
  if node apps/backend/verify-worker-isolation.js > /dev/null 2>&1; then
    echo "  ✓ Worker隔离测试通过 (6/6)"
  else
    echo "  ✗ Worker隔离测试失败"
    node apps/backend/verify-worker-isolation.js
  fi
else
  echo "  ⚠ 验证脚本不存在，跳过"
fi
echo ""

# 检查4: 环境变量建议
echo "4. 环境变量配置..."
if [ -f "apps/backend/.env" ]; then
  if grep -q "ENABLE_WORKER_ISOLATION=true" apps/backend/.env; then
    echo "  ✓ ENABLE_WORKER_ISOLATION=true (已配置)"
  else
    echo "  ⚠ ENABLE_WORKER_ISOLATION 未设置或为false"
    echo "    建议在 apps/backend/.env 中添加:"
    echo "    ENABLE_WORKER_ISOLATION=true"
  fi
else
  echo "  ⚠ .env 文件不存在"
  echo "    建议创建 apps/backend/.env 并添加:"
  echo "    ENABLE_WORKER_ISOLATION=true"
fi
echo ""

# 检查5: Git状态
echo "5. Git状态..."
MODIFIED_COUNT=$(git status --short | grep -c "^ M")
if [ "$MODIFIED_COUNT" -gt 0 ]; then
  echo "  ℹ️  有 $MODIFIED_COUNT 个文件已修改但未提交"
  echo "    主要修改:"
  git status --short | grep "^ M" | grep -E "(worker-isolation|request-host|seedance-video)" | head -5
else
  echo "  ✓ 工作区干净"
fi
echo ""

# 总结
echo "=========================================="
echo "检查完成"
echo "=========================================="
echo ""

if [ "$ALL_EXISTS" = true ]; then
  echo "✓ 准备就绪！可以启动worker"
  echo ""
  echo "启动步骤:"
  echo "  1. 确保 .env 中有 ENABLE_WORKER_ISOLATION=true"
  echo "  2. 启动API服务器: cd apps/backend && npm run dev"
  echo "  3. 启动Worker: cd apps/backend && npm run worker"
  echo ""
  echo "验证隔离功能:"
  echo "  - 查看worker启动日志，应显示 'Worker Isolation: ENABLED'"
  echo "  - 发起本地请求，检查任务是否包含 requestHost='127.0.0.1'"
  echo "  - 确认本地worker只处理本地任务"
else
  echo "⚠️  有文件缺失，请检查上述错误"
  exit 1
fi
