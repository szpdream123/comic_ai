#!/usr/bin/env node

/**
 * 重试排队中的生成任务
 * 用于将卡住的任务重新加入队列或重启队列
 */

import { createDevDb } from "../apps/backend/src/modules/shared/db/dev-db.ts";
import { loadGenerationQueueConfig } from "../apps/backend/src/modules/model-gateway/generation-queue.config.ts";
import { createBullMQGenerationQueueJobOpsService } from "../apps/backend/src/modules/model-gateway/generation-queue-job-ops.service.ts";

// 从命令行参数或使用默认的任务ID
const taskIds = process.argv.slice(2);

if (taskIds.length === 0) {
  // 默认使用截图中的两个任务ID
  taskIds.push(
    "d4063dc8-5791-4a74-83a8-c901ece79177",
    "f18bab12-5271-4914-b5b4-4c1599cb142b"
  );
}

console.log(`[retry-queued-tasks] 准备处理任务: ${taskIds.join(", ")}`);

const db = await createDevDb();
const config = loadGenerationQueueConfig(process.env);

try {
  // 查询任务信息
  const tasksResult = await db.query(
    `
      SELECT
        t.id::text,
        t.status,
        t.external_submission_started,
        s.progress_stage,
        s.queue_name,
        s.redis_job_id
      FROM tasks t
      LEFT JOIN ai_generation_task_snapshots s ON t.id = s.task_id
      WHERE t.id = ANY($1::uuid[])
    `,
    [taskIds]
  );

  if (tasksResult.rows.length === 0) {
    console.error("[retry-queued-tasks] 未找到任何任务");
    process.exit(1);
  }

  console.log(`[retry-queued-tasks] 找到 ${tasksResult.rows.length} 个任务`);

  for (const task of tasksResult.rows) {
    console.log(`\n[retry-queued-tasks] 处理任务 ${task.id}`);
    console.log(`  状态: ${task.status}`);
    console.log(`  媒体类型: ${task.media_type}`);
    console.log(`  进度阶段: ${task.progress_stage}`);
    console.log(`  队列名称: ${task.queue_name || "未分配"}`);
    console.log(`  Redis Job ID: ${task.redis_job_id || "无"}`);

    if (task.status !== "queued") {
      console.log(`  跳过: 任务状态不是 queued (当前: ${task.status})`);
      continue;
    }

    // 检查队列是否存在
    if (!task.queue_name || !task.redis_job_id) {
      console.log(`  问题: 任务没有队列分配或 Redis Job ID`);
      console.log(`  尝试修复任务出站箱...`);

      // 重置任务到出站箱让维护进程重新处理
      await db.query(
        `
          UPDATE tasks
          SET external_submission_started = false,
              updated_at = now()
          WHERE id = $1
        `,
        [task.id]
      );

      await db.query(
        `
          UPDATE ai_generation_task_snapshots
          SET progress_stage = 'queued',
              queue_name = NULL,
              redis_job_id = NULL,
              updated_at = now()
          WHERE task_id = $1
        `,
        [task.id]
      );

      console.log(`  ✓ 已重置任务到出站箱，维护进程将重新处理`);
      continue;
    }

    // 尝试重试队列中的任务
    try {
      const jobOps = createBullMQGenerationQueueJobOpsService(config);

      console.log(`  尝试重试队列任务: ${task.queue_name} / ${task.redis_job_id}`);

      const result = await jobOps.operate({
        queueName: task.queue_name,
        jobId: task.redis_job_id,
        action: "retry",
      });

      if (result.status === 200) {
        console.log(`  ✓ 成功重试任务`);
        console.log(`    队列: ${result.body.queueName}`);
        console.log(`    任务名: ${result.body.jobName}`);
        console.log(`    之前状态: ${result.body.previousState}`);
      } else {
        console.log(`  ✗ 重试失败: ${JSON.stringify(result.body)}`);

        // 如果队列操作失败，尝试重置任务
        if (result.status === 404 || result.body.error === "generation_queue_job_not_found") {
          console.log(`  任务在队列中不存在，重置到出站箱...`);

          await db.query(
            `
              UPDATE tasks
              SET external_submission_started = false,
                  updated_at = now()
              WHERE id = $1
            `,
            [task.id]
          );

          await db.query(
            `
              UPDATE ai_generation_task_snapshots
              SET progress_stage = 'queued',
                  queue_name = NULL,
                  redis_job_id = NULL,
                  updated_at = now()
              WHERE task_id = $1
            `,
            [task.id]
          );

          console.log(`  ✓ 已重置任务，维护进程将重新分配`);
        }
      }
    } catch (error) {
      console.error(`  ✗ 操作失败: ${error.message}`);

      // 尝试重置任务作为后备方案
      console.log(`  尝试重置任务到出站箱...`);
      await db.query(
        `
          UPDATE tasks
          SET external_submission_started = false,
              updated_at = now()
          WHERE id = $1
        `,
        [task.id]
      );

      await db.query(
        `
          UPDATE ai_generation_task_snapshots
          SET progress_stage = 'queued',
              queue_name = NULL,
              redis_job_id = NULL,
              updated_at = now()
          WHERE task_id = $1
        `,
        [task.id]
      );

      console.log(`  ✓ 已重置任务`);
    }
  }

  console.log("\n[retry-queued-tasks] 检查队列健康状态...");

  // 检查 Redis 连接和队列状态
  try {
    const { createBullMQGenerationQueueHealthService } = await import("../apps/backend/src/modules/model-gateway/generation-queue-health.service.ts");
    const queueHealth = createBullMQGenerationQueueHealthService(config);

    const healthSnapshot = await queueHealth.inspect({ failedSampleSize: 10 });

    console.log(`\n队列健康状态: ${healthSnapshot.status}`);
    console.log(`Redis 状态: ${healthSnapshot.redis.status}`);
    console.log(`工作进程启用: ${healthSnapshot.workersEnabled}`);
    console.log(`出站箱调度器启用: ${healthSnapshot.outboxDispatcherEnabled}`);

    if (healthSnapshot.queues && healthSnapshot.queues.length > 0) {
      console.log(`\n活跃队列 (${healthSnapshot.queues.length}):`);
      for (const queue of healthSnapshot.queues.slice(0, 5)) {
        console.log(`  - ${queue.name}: waiting=${queue.waiting}, active=${queue.active}, failed=${queue.failed}`);
      }
    }

    await queueHealth.close();

    if (healthSnapshot.redis.status === "unavailable") {
      console.error("\n⚠️  警告: Redis 不可用，队列无法正常工作");
      console.log("请检查 Redis 服务是否运行，或重启队列工作进程");
    }
  } catch (error) {
    console.error(`无法检查队列健康状态: ${error.message}`);
  }

  console.log("\n[retry-queued-tasks] 完成");
  console.log("\n提示:");
  console.log("- 如果任务已重置到出站箱，维护进程会在下一个周期自动处理");
  console.log("- 如果 Redis 不可用，请重启 Redis 服务");
  console.log("- 如果需要手动重启队列维护进程，请运行: npm run generation:maintenance");

} catch (error) {
  console.error(`[retry-queued-tasks] 错误: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
} finally {
  await db.close();
}
