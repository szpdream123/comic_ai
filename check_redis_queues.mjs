import Redis from 'ioredis';

const client = new Redis({ 
  host: '36.151.145.176',
  port: 6379,
  password: 'yangzhikang'
});

console.log("=== Redis中的BullMQ队列 ===");
const keys = await client.keys('bull:*');
const prefixes = new Set();
keys.forEach(k => {
  const match = k.match(/^bull:([^:]+):/);
  if (match) prefixes.add(match[1]);
});

console.log("发现的队列前缀:", Array.from(prefixes).sort());
console.log("队列总数:", keys.length);

for (const prefix of Array.from(prefixes).sort()) {
  const prefixKeys = keys.filter(k => k.startsWith(`bull:${prefix}:`));
  console.log(`\n前缀 "${prefix}": ${prefixKeys.length} 个key`);
  
  // 显示该前缀下的队列名
  const queues = new Set();
  prefixKeys.forEach(k => {
    const match = k.match(/^bull:[^:]+:([^:]+):/);
    if (match) queues.add(match[1]);
  });
  console.log("  队列:", Array.from(queues).slice(0, 10).join(', '));
  
  // 检查活跃任务
  const active = await client.llen(`bull:${prefix}:generation.video.submit:active`);
  const waiting = await client.llen(`bull:${prefix}:generation.video.submit:wait`);
  if (active > 0 || waiting > 0) {
    console.log(`  ⚠️  video.submit: active=${active}, waiting=${waiting}`);
  }
}

client.disconnect();
