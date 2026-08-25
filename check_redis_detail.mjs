import Redis from 'ioredis';

const client = new Redis({ 
  host: '36.151.145.176',
  port: 6379,
  password: 'yangzhikang'
});

console.log("=== 检查Redis中所有bull开头的key ===");
const allKeys = await client.keys('bull:*');
console.log(`总共找到 ${allKeys.length} 个bull key\n`);

// 按前缀分组
const byPrefix = {};
allKeys.forEach(k => {
  const match = k.match(/^bull:([^:]+):/);
  const prefix = match ? match[1] : 'unknown';
  if (!byPrefix[prefix]) byPrefix[prefix] = [];
  byPrefix[prefix].push(k);
});

for (const [prefix, keys] of Object.entries(byPrefix)) {
  console.log(`\n前缀 "${prefix}": ${keys.length} keys`);
  console.log("示例key:", keys.slice(0, 3).join('\n           '));
}

// 检查comic-ai-dev前缀
console.log("\n=== 检查comic-ai-dev前缀 ===");
const devKeys = await client.keys('bull:comic-ai-dev:*');
console.log(`找到 ${devKeys.length} 个comic-ai-dev key`);
if (devKeys.length > 0) {
  console.log("示例:", devKeys.slice(0, 5));
}

client.disconnect();
