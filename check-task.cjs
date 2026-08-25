const { Client } = require('pg');

const taskId = 'aascdef0-d47e-4ae1-936c-4615a7065792';

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'comic_ai',
  user: 'postgres',
  password: 'postgres'
});

client.connect()
  .then(() => {
    console.log('✓ 连接成功\n');
    return client.query(`
      SELECT
        pr.id,
        pr.attempt_id,
        pr.external_submission_started_at,
        pr.external_task_id,
        pr.provider_submission_status
      FROM provider_requests pr
      WHERE pr.task_id = $1
      ORDER BY pr.created_at DESC
      LIMIT 3
    `, [taskId]);
  })
  .then(result => {
    if (result.rows.length === 0) {
      console.log('❌ 没有找到provider_request记录（任务可能还在队列中等待处理）\n');
    } else {
      console.log('=== Provider Requests ===\n');
      result.rows.forEach((row, i) => {
        console.log(`记录 ${i + 1}:`);
        console.log(`  id: ${row.id}`);
        console.log(`  attempt_id: ${row.attempt_id ? '✓ ' + row.attempt_id : '❌ NULL'}`);
        console.log(`  external_task_id: ${row.external_task_id || 'NULL'}`);
        console.log(`  external_submission_started_at: ${row.external_submission_started_at || 'NULL'}`);
        console.log(`  provider_submission_status: ${row.provider_submission_status}`);
        console.log('');
      });
    }
    return client.end();
  })
  .catch(err => {
    console.error('错误:', err.message);
    client.end();
  });
