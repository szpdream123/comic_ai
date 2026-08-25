#!/usr/bin/env node
import Redis from "ioredis";

async function checkCompletedJobs() {
  const redisUrl = process.env.REDIS_URL;
  const prefix = process.env.REDIS_KEY_PREFIX || "";

  console.log(`Connecting to Redis: ${redisUrl}`);
  console.log(`Key Prefix: ${prefix}`);

  const client = new Redis(redisUrl);

  const taskId = "d445a363-599c-453a-af48-ac9d66ebdbb7";

  // Check completed jobs in video queue
  const completedKey = prefix ? `${prefix}:generation-submit-video:completed` : "generation-submit-video:completed";
  console.log(`\nChecking completed jobs: ${completedKey}`);

  const completedLen = await client.zcard(completedKey);
  console.log(`Completed jobs count: ${completedLen}`);

  if (completedLen > 0) {
    // Get recent completed job IDs
    const jobIds = await client.zrange(completedKey, -10, -1);
    console.log(`\nRecent completed job IDs (last 10):`);
    for (const jobId of jobIds) {
      console.log(`  ${jobId}`);

      // Check if this is our task
      if (jobId.includes(taskId)) {
        console.log(`    ^^^ This is our task!`);

        // Get job data
        const jobKey = prefix ? `${prefix}:generation-submit-video:${jobId}` : `generation-submit-video:${jobId}`;
        const jobData = await client.hgetall(jobKey);
        console.log(`    Job data:`, jobData);
      }
    }
  }

  // Check failed jobs
  const failedKey = prefix ? `${prefix}:generation-submit-video:failed` : "generation-submit-video:failed";
  const failedLen = await client.zcard(failedKey);
  console.log(`\nFailed jobs count: ${failedLen}`);

  if (failedLen > 0) {
    const failedJobIds = await client.zrange(failedKey, -10, -1);
    console.log(`\nRecent failed job IDs (last 10):`);
    for (const jobId of failedJobIds) {
      console.log(`  ${jobId}`);
      if (jobId.includes(taskId)) {
        console.log(`    ^^^ This is our task!`);
      }
    }
  }

  await client.quit();
}

checkCompletedJobs().catch(console.error);
