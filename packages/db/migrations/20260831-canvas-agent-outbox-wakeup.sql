CREATE OR REPLACE FUNCTION notify_canvas_agent_outbox_ready()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'pending'
    AND (
      TG_OP = 'INSERT'
      OR OLD.status IS DISTINCT FROM NEW.status
      OR OLD.available_at IS DISTINCT FROM NEW.available_at
    )
  THEN
    PERFORM pg_notify('canvas_agent_outbox_ready', NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS canvas_agent_outbox_ready_notify ON canvas_agent_outbox;
CREATE TRIGGER canvas_agent_outbox_ready_notify
AFTER INSERT OR UPDATE OF status, available_at ON canvas_agent_outbox
FOR EACH ROW
EXECUTE FUNCTION notify_canvas_agent_outbox_ready();
