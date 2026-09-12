-- Additive fence for newly tagged Agent work. Do not infer/backfill ownership
-- of historical tasks. Old runtimes have no session scope and cannot steal a
-- scoped claim even when they ignore all new application-side SQL filters.
CREATE OR REPLACE FUNCTION canvas_agent_scope_allowed(snapshot jsonb)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN snapshot ? 'agentExecutionScope' THEN
    COALESCE(snapshot->>'agentExecutionScope' ~ '^[a-f0-9]{32}$'
      AND snapshot->>'agentExecutionScope' = current_setting('comic_ai.agent_execution_scope', true), false)
    ELSE true END;
$$;

CREATE OR REPLACE FUNCTION canvas_agent_execution_fence()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  row_data jsonb;
  snapshot jsonb;
  old_snapshot jsonb;
BEGIN
  -- Check both sides so updates cannot erase or move a protected relationship.
  FOR row_data IN SELECT value FROM jsonb_array_elements(
    jsonb_build_array(CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
                      CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END))
  LOOP
    IF row_data = 'null'::jsonb THEN CONTINUE; END IF;
    snapshot := NULL;
    IF TG_TABLE_NAME IN ('tasks', 'workflows') THEN
      snapshot := row_data->'input_snapshot_json';
    ELSIF TG_TABLE_NAME = 'canvas_agent_tasks' THEN
      SELECT input_snapshot_json INTO snapshot FROM tasks WHERE id = (row_data->>'workflow_task_id')::uuid;
    ELSIF TG_TABLE_NAME IN ('task_attempts', 'generation_queue_stage_assignments',
        'provider_requests','credit_reservations','credit_reservation_allocations',
        'ai_generation_task_snapshots','generation_stage_successors') THEN
      SELECT input_snapshot_json INTO snapshot FROM tasks WHERE id = (row_data->>'task_id')::uuid;
      IF snapshot IS NULL THEN
        SELECT input_snapshot_json INTO snapshot FROM workflows WHERE id = (row_data->>'workflow_id')::uuid;
      END IF;
    ELSIF TG_TABLE_NAME = 'outbox_events' THEN
      SELECT input_snapshot_json INTO snapshot FROM tasks WHERE id::text = row_data->'payload_json'->>'taskId';
    ELSIF TG_TABLE_NAME = 'canvas_agent_conversation_locks' THEN
      -- Do not let an old scanner hold the conversation lock before the task
      -- claim is rejected. Preserve legacy and matching active conversations.
      IF EXISTS (SELECT 1 FROM canvas_agent_tasks a WHERE a.conversation_id = (row_data->>'conversation_id')::uuid
          AND a.status IN ('queued','running','cancel_requested','waiting_external','waiting_approval'))
        AND NOT EXISTS (SELECT 1 FROM canvas_agent_tasks a JOIN tasks t ON t.id = a.workflow_task_id
          WHERE a.conversation_id = (row_data->>'conversation_id')::uuid
          AND a.status IN ('queued','running','cancel_requested','waiting_external','waiting_approval')
          AND canvas_agent_scope_allowed(t.input_snapshot_json)) THEN RETURN NULL;
      END IF;
    ELSE
      SELECT t.input_snapshot_json INTO snapshot FROM canvas_agent_tasks a
        JOIN tasks t ON t.id = a.workflow_task_id WHERE a.id = (row_data->>'task_id')::uuid;
    END IF;
    IF NOT canvas_agent_scope_allowed(snapshot) THEN RETURN NULL; END IF;
  END LOOP;
  IF TG_TABLE_NAME = 'outbox_events' AND TG_OP <> 'DELETE' AND snapshot ? 'agentExecutionScope' THEN
    -- Every durable successor (submit, poll, finalize, repair) inherits the
    -- original task's routing identity, never one supplied by a publisher.
    NEW.payload_json := NEW.payload_json || jsonb_build_object('agentExecutionScope', snapshot->>'agentExecutionScope');
  END IF;
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME IN ('tasks', 'workflows') THEN
    old_snapshot := to_jsonb(OLD)->'input_snapshot_json';
    IF old_snapshot ? 'agentExecutionScope' AND (
        old_snapshot->'agentExecutionScope' IS DISTINCT FROM to_jsonb(NEW)->'input_snapshot_json'->'agentExecutionScope'
        OR old_snapshot->'workerEnvironment' IS DISTINCT FROM to_jsonb(NEW)->'input_snapshot_json'->'workerEnvironment') THEN
      RAISE EXCEPTION 'agent_execution_scope_immutable';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'tasks','workflows','task_attempts','canvas_agent_tasks',
    'canvas_agent_conversation_locks','canvas_agent_outbox',
    'canvas_agent_steps','canvas_agent_events','canvas_agent_messages',
    'canvas_agent_approvals','outbox_events','generation_queue_stage_assignments',
    'provider_requests','credit_reservations','credit_reservation_allocations',
    'ai_generation_task_snapshots','generation_stage_successors'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS agent_execution_scope_fence ON %I', target);
    EXECUTE format('CREATE TRIGGER agent_execution_scope_fence BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION canvas_agent_execution_fence()', target);
  END LOOP;
END;
$$;
