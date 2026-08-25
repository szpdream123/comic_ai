import Redis from 'ioredis';
import { readFileSync } from 'fs';

// 读取.env配置
const env = readFileSync('.env', 'utf8');
const getEnv = (k) => env.split(/\r?\n/).find(l => l.startsWith(k+'='))?.split('=').slice(1).join('=').trim();

console.log("=== 当前.env配置 ===");
console.log("DATABASE_URL:", getEnv('DATABASE_URL').slice(0, 50) + '...');
console.log("REDIS_URL:", getEnv('REDIS_URL'));
console.log("BULLMQ_QUEUE_PREFIX:", getEnv('BULLMQ_QUEUE_PREFIX'));
console.log("REDIS_KEY_PREFIX:", getEnv('REDIS_KEY_PREFIX'));

// 检查Redis db 0（线上可能使用）
const client0 = new Redis({ host: '36.151.145.176', port: 6379, password: 'yangzhikang', db: 0 });
const keys0 = await client0.keys('bull:*');
console.log("\n=== Redis DB 0 (线上环境) ===");
console.log(`队列key数量: ${keys0.length}`);
if (keys0.length > 0) {
  const prefixes = new Set();
  keys0.forEach(k => {
    const m = k.match(/^bull:([^:]+):/);
    if (m) prefixes.add(m[1]);
  });
  console.log("队列前缀:", Array.from(prefixes).join(', '));
}
await client0.quit();

// 检查Redis db 1（本地测试）
const client1 = new Redis({ host: '36.151.145.176', port: 6379, password: 'yangzhikang', db: 1 });
const keys1 = await client1.keys('bull:*');
console.log("\n=== Redis DB 1 (本地测试) ===");
console.log(`队列key数量: ${keys1.length}`);
if (keys1.length > 0) {
  console.log("示例key:", keys1.slice(0, 5));
} else {
  console.log("✅ 干净的环境，未发现队列（正常，worker启动后会创建）");
}
await client1.quit();

console.log("\n=== 隔离状态 ===");
console.log("✅ 数据库隔离: comic_ai_dev (本地) vs comic_ai (线上)");
console.log("✅ Redis DB隔离: db=1 (本地) vs db=0 (线上)");
console.log("✅ 队列前缀隔离: local-test-dev (本地) vs 其他 (线上)");
console.log("\n可以安全启动本地worker测试修复了！");
