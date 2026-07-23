CREATE TABLE IF NOT EXISTS outbox_dispatch_fair_cursors (
  scope_key text NOT NULL,
  main_key text NOT NULL,
  cursor_key text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_key, main_key)
);

CREATE OR REPLACE FUNCTION notify_generation_outbox_ready()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_type IN (
      'generation.task.created',
      'generation.task.poll_requested',
      'generation.task.finalize_requested'
    )
    AND NEW.status IN ('pending', 'failed')
  THEN
    PERFORM pg_notify('generation_outbox_ready', NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS outbox_events_generation_ready_notify ON outbox_events;
CREATE TRIGGER outbox_events_generation_ready_notify
AFTER INSERT OR UPDATE OF status, available_at ON outbox_events
FOR EACH ROW
EXECUTE FUNCTION notify_generation_outbox_ready();
