export async function seedUserWorkflowTaskAndAttempt(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(`
    INSERT INTO users (id, phone_e164, status)
    VALUES ('00000000-0000-4000-8000-000000000001', '13800138001', 'active')
  `);
  await db.query(`
    INSERT INTO workflows (id, workflow_type, status, input_snapshot_json, created_by_user_id)
    VALUES (
      '40000000-0000-4000-8000-000000000001',
      'image_generation',
      'running',
      '{}'::jsonb,
      '00000000-0000-4000-8000-000000000001'
    )
  `);
  await db.query(`
    INSERT INTO tasks (
      id, workflow_id, task_type, status, queue_name, locked_by, locked_until,
      heartbeat_at, input_snapshot_json, target_entity_type,
      target_entity_id, attempt_count
    )
    VALUES (
      '50000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'generate_image', 'running', 'image-generation', 'worker-1',
      '2026-05-09T09:58:00.000Z', '2026-05-09T09:57:30.000Z',
      '{}'::jsonb, 'shot',
      '60000000-0000-4000-8000-000000000001', 1
    )
  `);
  await db.query(`
    INSERT INTO task_attempts (
      id, workflow_id, task_id, attempt_number, status, locked_by, locked_until,
      heartbeat_at, started_at
    )
    VALUES (
      '70000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001', 1, 'running', 'worker-1',
      '2026-05-09T09:58:00.000Z', '2026-05-09T09:57:30.000Z',
      '2026-05-09T09:57:00.000Z'
    )
  `);
  await db.query(`
    UPDATE tasks
    SET current_attempt_id = '70000000-0000-4000-8000-000000000001'
    WHERE id = '50000000-0000-4000-8000-000000000001'
  `);
}
