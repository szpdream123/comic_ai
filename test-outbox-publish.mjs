#!/usr/bin/env node
/**
 * Test script to manually trigger outbox dispatcher and see detailed logs
 */
import pg from 'pg';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL
});

await client.connect();

console.log('Creating a test outbox event for MiniMax H3...');

// Create a new test task
const taskResult = await client.query(`
  INSERT INTO tasks (
    id, workflow_id, status, input_snapshot_json,
    created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    gen_random_uuid(),
    'queued',
    '{"kind": "video", "model": "MiniMax-H3-768p", "workerEnvironment": "local"}',
    NOW(),
    NOW()
  )
  RETURNING id, workflow_id
`);

const task = taskResult.rows[0];
console.log('Created test task:', task.id);

// Create outbox event
await client.query(`
  INSERT INTO outbox_events (
    id, event_type, status, payload_json,
    available_at, created_at
  ) VALUES (
    gen_random_uuid(),
    'generation.task.created',
    'pending',
    jsonb_build_object(
      'taskId', $1,
      'workflowId', $2,
      'mediaType', 'video',
      'modelCode', 'MiniMax-H3-768p',
      'providerExecutor', 'seedance',
      'queueName', 'generation-submit-video',
      'targetType', 'storyboard',
      'targetId', gen_random_uuid()::text
    ),
    NOW(),
    NOW()
  )
  RETURNING id
`, [task.id, task.workflow_id]);

const event = await client.query(`
  SELECT id FROM outbox_events
  WHERE payload_json->>'taskId' = $1
  ORDER BY created_at DESC
  LIMIT 1
`, [task.id]);

console.log('Created outbox event:', event.rows[0].id);
console.log('\nWait 15 seconds for outbox dispatcher to process...');
console.log('Watch backend.log for [generation-outbox] logs\n');

await new Promise(resolve => setTimeout(resolve, 15000));

// Check results
const eventStatus = await client.query(`
  SELECT status, error_message, processed_at
  FROM outbox_events
  WHERE id = $1
`, [event.rows[0].id]);

const taskStatus = await client.query(`
  SELECT status, current_attempt_id
  FROM tasks
  WHERE id = $1
`, [task.id]);

const assignment = await client.query(`
  SELECT status, published_at, redis_job_id
  FROM generation_queue_stage_assignments
  WHERE task_id = $1
  ORDER BY created_at DESC
  LIMIT 1
`, [task.id]);

console.log('\n=== Results ===');
console.log('Outbox Event Status:', eventStatus.rows[0]);
console.log('Task Status:', taskStatus.rows[0]);
console.log('Shard Assignment:', assignment.rows[0] || 'None');

await client.end();
