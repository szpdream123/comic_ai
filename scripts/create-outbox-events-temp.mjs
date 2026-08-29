import { createDevDb } from '../apps/backend/src/modules/shared/db/dev-db.ts';
import { randomUUID } from 'node:crypto';

const db = await createDevDb();
const taskIds = ['d4063dc8-5791-4a74-83a8-c901ece79177', 'f18bab12-5271-4914-b5b4-4c1599cb142b'];

try {
  console.log('为任务创建新的出站箱事件...\n');

  for (const taskId of taskIds) {
    const taskInfo = await db.query(`
      SELECT
        t.workflow_id::text,
        s.model_code,
        s.media_type
      FROM tasks t
      JOIN ai_generation_task_snapshots s ON t.id = s.task_id
      WHERE t.id = $1::uuid
    `, [taskId]);

    if (taskInfo.rows.length > 0) {
      const task = taskInfo.rows[0];
      const eventId = randomUUID();

      const payload = {
        workflowId: task.workflow_id,
        taskId: taskId,
        mediaType: task.media_type,
        modelCode: task.model_code
      };

      await db.query(`
        INSERT INTO outbox_events (
          id,
          event_type,
          payload_json,
          status,
          created_at,
          updated_at
        ) VALUES (
          $1::uuid,
          'generation.task.created',
          $2::jsonb,
          'pending',
          now(),
          now()
        )
      `, [eventId, JSON.stringify(payload)]);

      console.log(`✓ 已为任务 ${taskId.substring(0, 13)}... 创建出站箱事件`);
      console.log(`  模型: ${task.model_code}`);
      console.log(`  媒体类型: ${task.media_type}`);
    }
  }

  console.log('\n✓ 完成！出站箱调度器将在下一个周期（约10秒内）处理这些事件。');
  console.log('\n请等待约30秒，然后检查任务状态。');

} finally {
  await db.close();
}
