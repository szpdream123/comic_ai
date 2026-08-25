#!/usr/bin/env node
import Redis from "ioredis";

async function checkSpecificTask() {
  const redisUrl = process.env.REDIS_URL;
  const prefix = process.env.REDIS_KEY_PREFIX || "";

  console.log(`Connecting to Redis: ${redisUrl}`);
  console.log(`Key Prefix: ${prefix}`);

  const client = new Redis(redisUrl);

  const taskId = "d170ca02-044d-4fb5-9ad9-b60f76635cc7";
  const queuePrefix = prefix ? `${prefix}:generation-submit-video` : "generation-submit-video";

  // Check all possible queue states
  const states = ['wait', 'active', 'completed', 'failed', 'delayed', 'paused'];

  for (const state of states) {
    const key = `${queuePrefix}:${state}`;
    let count = 0;

    if (state === 'wait' || state === 'paused') {
      count = await client.llen(key);
    } else {
      count = await client.zcard(key);
    }

    if (count > 0) {
      console.log(`\n${state.toUpperCase()}: ${count} jobs`);

      // Get job IDs
      let jobIds = [];
      if (state === 'wait' || state === 'paused') {
        jobIds = await client.lrange(key, 0, -1);
      } else {
        jobIds = await client.zrange(key, 0, -1);
      }

      // Check if our task is in this state
      for (const jobId of jobIds) {
        if (jobId.includes(taskId.substring(0, 20))) {
          console.log(`  ✅ FOUND OUR TASK: ${jobId}`);
        }
      }

      console.log(`  First 3 jobs: ${jobIds.slice(0, 3).join(', ')}`);
    }
  }

  await client.quit();
}

checkSpecificTask().catch(console.error);
