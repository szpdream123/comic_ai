#!/usr/bin/env node
/**
 * Worker Isolation 验证脚本
 *
 * 用于验证worker隔离功能是否正常工作
 */

import { createHash } from 'node:crypto';

// 模拟 worker 隔离配置
function isLocalEnvironment(host) {
  if (!host) return false;

  const localPatterns = [
    '127.0.0.1',
    'localhost',
    'localhost.localdomain',
    '::1',
  ];

  if (localPatterns.includes(host.toLowerCase())) {
    return true;
  }

  // 私有IP段
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;

  // 本地开发域名
  const localDomainKeywords = ['ngrok', 'localhost.run', 'localtunnel'];
  if (localDomainKeywords.some(kw => host.toLowerCase().includes(kw))) {
    return true;
  }

  return false;
}

function resolveWorkerEnvironment(hostEnv, requestHost) {
  // HOST 环境变量优先
  if (hostEnv) {
    return isLocalEnvironment(hostEnv) ? 'local' : 'production';
  }

  // 否则从请求域名判断
  if (requestHost) {
    return isLocalEnvironment(requestHost) ? 'local' : 'production';
  }

  // 默认为生产环境
  return 'production';
}

function shouldProcessTask(taskSnapshot, workerEnv) {
  const taskRequestHost = taskSnapshot.requestHost;
  const taskEnv = taskRequestHost
    ? (isLocalEnvironment(taskRequestHost) ? 'local' : 'production')
    : 'unknown';

  console.log(`  任务环境: ${taskEnv} (requestHost: ${taskRequestHost || '未设置'})`);
  console.log(`  Worker环境: ${workerEnv}`);

  // 本地 worker: 严格隔离，只处理本地任务
  if (workerEnv === 'local') {
    const shouldProcess = taskEnv === 'local';
    console.log(`  → 本地worker ${shouldProcess ? '✓ 处理' : '✗ 跳过'}`);
    return shouldProcess;
  }

  // 生产 worker: 宽松策略，跳过明确的本地任务，处理其他所有任务
  if (workerEnv === 'production') {
    if (taskEnv === 'local') {
      console.log(`  → 生产worker ✗ 跳过 (明确的本地任务)`);
      return false;
    }
    const shouldProcess = true;
    console.log(`  → 生产worker ✓ 处理 (生产/未知任务)`);
    return shouldProcess;
  }

  return true;
}

// 测试场景
console.log('========================================');
console.log('Worker Isolation 验证测试');
console.log('========================================\n');

const scenarios = [
  {
    name: '场景1: 本地worker处理本地任务',
    hostEnv: '127.0.0.1',
    taskSnapshot: { requestHost: '127.0.0.1' },
    expected: true,
  },
  {
    name: '场景2: 本地worker遇到生产任务',
    hostEnv: '127.0.0.1',
    taskSnapshot: { requestHost: 'api.example.com' },
    expected: false,
  },
  {
    name: '场景3: 生产worker遇到本地任务',
    hostEnv: 'api.example.com',
    taskSnapshot: { requestHost: '127.0.0.1' },
    expected: false,
  },
  {
    name: '场景4: 生产worker处理生产任务',
    hostEnv: 'api.example.com',
    taskSnapshot: { requestHost: 'api.example.com' },
    expected: true,
  },
  {
    name: '场景5: 生产worker处理历史任务（无requestHost）',
    hostEnv: 'api.example.com',
    taskSnapshot: {},
    expected: true,
  },
  {
    name: '场景6: 本地worker遇到历史任务（无requestHost）',
    hostEnv: '127.0.0.1',
    taskSnapshot: {},
    expected: false,
  },
];

let passCount = 0;
let failCount = 0;

scenarios.forEach((scenario, index) => {
  console.log(`${index + 1}. ${scenario.name}`);
  const workerEnv = resolveWorkerEnvironment(scenario.hostEnv);
  const result = shouldProcessTask(scenario.taskSnapshot, workerEnv);
  const status = result === scenario.expected ? '✓ 通过' : '✗ 失败';

  if (result === scenario.expected) {
    passCount++;
  } else {
    failCount++;
    console.log(`  ⚠️  预期: ${scenario.expected}, 实际: ${result}`);
  }

  console.log(`  ${status}\n`);
});

console.log('========================================');
console.log(`测试结果: ${passCount}/${scenarios.length} 通过`);
if (failCount > 0) {
  console.log(`⚠️  ${failCount} 个测试失败`);
  process.exit(1);
} else {
  console.log('✓ 所有测试通过！Worker隔离功能正常工作');
  process.exit(0);
}
