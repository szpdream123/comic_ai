import { readFileSync } from 'fs';

// 检查代码中队列名称的构造方式
const workerFile = 'apps/backend/src/modules/model-gateway/generation-bullmq.worker.ts';
const content = readFileSync(workerFile, 'utf8');

const queueNameMatches = content.match(/['"]generation[^'"]+['"]/g);
console.log("=== 代码中的队列名称 ===");
console.log([...new Set(queueNameMatches)].slice(0, 20).join('\n'));

console.log("\n=== 查找队列前缀使用 ===");
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('BULLMQ_QUEUE_PREFIX') || line.includes('queuePrefix')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
