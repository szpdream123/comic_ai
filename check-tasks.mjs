import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

try {
  await client.connect();

  const result = await client.query(`
    SELECT
      id,
      status,
      media_type,
      input_snapshot_json->>'requestHost' as request_host,
      input_snapshot_json->>'workerEnvironment' as worker_env,
      created_at,
      updated_at
    FROM tasks
    WHERE media_type = 'video'
    ORDER BY created_at DESC
    LIMIT 10
  `);

  console.log('Recent video tasks:');
  console.log(JSON.stringify(result.rows, null, 2));

  await client.end();
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
