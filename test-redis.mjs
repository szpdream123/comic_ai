import Redis from 'ioredis';

const redisUrl = 'redis://:yangzhikang@36.151.145.176:6379/1';

console.log('Testing Redis connection...');
console.log('URL:', redisUrl);

const redis = new Redis(redisUrl, {
  connectTimeout: 10000,
  retryStrategy: null,
});

redis.on('connect', () => {
  console.log('✅ Redis connected successfully!');
  redis.ping((err, result) => {
    if (err) {
      console.error('❌ PING failed:', err);
    } else {
      console.log('✅ PING result:', result);
    }
    redis.disconnect();
    process.exit(0);
  });
});

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err.message);
  console.error('Error code:', err.code);
  redis.disconnect();
  process.exit(1);
});

setTimeout(() => {
  console.log('⏱️  Connection timeout');
  redis.disconnect();
  process.exit(1);
}, 15000);
