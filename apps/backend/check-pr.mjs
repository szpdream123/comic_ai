import pg from 'pg';

const pool = new pg.Pool({
  host: 'localhost',
  port: 5432,
  database: 'comic_ai',
  user: 'postgres',
  password: 'postgres'
});

const taskId = 'd34a2c8c-8ae1-442b-a53a-49de96afc58d';

try {
  const result = await pool.query(`
    SELECT
      pr.id,
      pr.attempt_id,
      pr.external_submission_started_at,
      pr.external_task_id,
      pr.provider_submission_status,
      pr.created_at
    FROM provider_requests pr
    WHERE pr.task_id = $1
    ORDER BY pr.created_at DESC
    LIMIT 3
  `, [taskId]);

  console.log('\n=== Provider Requests for task', taskId, '===\n');
  
  if (result.rows.length === 0) {
    console.log('⚠️  没有找到provider_request记录');
    console.log('   可能原因：任务还在队列中等待worker处理\n');
  } else {
    result.rows.forEach((row, i) => {
      console.log(`记录 ${i + 1}:`);
      console.log(`  id: ${row.id}`);
      console.log(`  attempt_id: ${row.attempt_id ? '✓ ' + row.attempt_id : '❌ NULL - 这是BUG！'}`);
      console.log(`  external_task_id: ${row.external_task_id || '(NULL)'}`);
      console.log(`  external_submission_started_at: ${row.external_submission_started_at || '(NULL)'}`);
      console.log(`  provider_submission_status: ${row.provider_submission_status}`);
      console.log(`  created_at: ${row.created_at}`);
      console.log('');
    });
  }
} catch (error) {
  console.error('❌ 数据库查询失败:', error.message);
} finally {
  await pool.end();
}
