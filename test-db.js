import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'comic_ai',
  user: 'postgres',
  password: 'postgres'
});

async function checkTask() {
  try {
    await client.connect();
    console.log('✓ 数据库连接成功');

    const taskId = '44f963f7-ea2e-404a-b77b-ef256c317342';

    // Check provider_requests
    const prResult = await client.query(`
      SELECT
        pr.id,
        pr.attempt_id,
        pr.external_submission_started_at,
        pr.external_task_id,
        pr.created_at
      FROM provider_requests pr
      WHERE pr.task_id = $1
      ORDER BY pr.created_at DESC
      LIMIT 3
    `, [taskId]);

    console.log('\n=== Provider Requests ===');
    if (prResult.rows.length === 0) {
      console.log('没有找到provider_request记录');
    } else {
      prResult.rows.forEach((row, i) => {
        console.log(`\n记录 ${i + 1}:`);
        console.log(`  id: ${row.id}`);
        console.log(`  attempt_id: ${row.attempt_id || 'NULL ❌'}`);
        console.log(`  external_task_id: ${row.external_task_id || 'NULL'}`);
        console.log(`  external_submission_started_at: ${row.external_submission_started_at || 'NULL'}`);
      });
    }

    // Check task status
    const taskResult = await client.query(`
      SELECT id, status, current_attempt_id, attempt_count
      FROM tasks
      WHERE id = $1
    `, [taskId]);

    console.log('\n=== Task Status ===');
    if (taskResult.rows.length > 0) {
      const task = taskResult.rows[0];
      console.log(`  status: ${task.status}`);
      console.log(`  attempt_count: ${task.attempt_count}`);
      console.log(`  current_attempt_id: ${task.current_attempt_id || 'NULL'}`);
    }

  } catch (error) {
    console.error('错误:', error.message);
  } finally {
    await client.end();
  }
}

checkTask();
