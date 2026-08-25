#!/usr/bin/env node
import Redis from "ioredis";

async function checkRedis() {
  const redisUrl = process.env.REDIS_URL;
  const prefix = process.env.REDIS_KEY_PREFIX || "";

  console.log(`Connecting to Redis: ${redisUrl}`);
  console.log(`Key Prefix: ${prefix}`);

  const client = new Redis(redisUrl);

  // List all keys with our prefix
  const pattern = prefix ? `${prefix}*` : "*";
  console.log(`\nSearching for keys: ${pattern}`);

  const keys = await client.keys(pattern);
  console.log(`\nFound ${keys.length} keys with prefix`);

  // Group by queue
  const queueKeys = keys.filter(k => k.includes("generation"));
  console.log(`\nGeneration-related keys (${queueKeys.length}):`);

  for (const key of queueKeys.slice(0, 20)) {
    console.log(`  ${key}`);

    // If it's a list, show length
    const type = await client.type(key);
    if (type === "list") {
      const len = await client.lLen(key);
      console.log(`    Type: list, Length: ${len}`);
    } else if (type === "zset") {
      const len = await client.zCard(key);
      console.log(`    Type: zset, Length: ${len}`);
    } else {
      console.log(`    Type: ${type}`);
    }
  }

  // Check specific queue
  const videoQueueKey = prefix ? `${prefix}:generation-submit-video:wait` : "generation-submit-video:wait";
  console.log(`\nChecking specific queue: ${videoQueueKey}`);
  const videoLen = await client.llen(videoQueueKey);
  console.log(`Length: ${videoLen}`);

  await client.quit();
}

checkRedis().catch(console.error);
