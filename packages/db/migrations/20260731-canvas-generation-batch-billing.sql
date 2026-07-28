ALTER TABLE creator_canvas_generation_batches
  ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'per_item',
  ADD COLUMN IF NOT EXISTS credit_reservation_id uuid NULL REFERENCES credit_reservations(id),
  ADD COLUMN IF NOT EXISTS estimated_credits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settled_credits integer NOT NULL DEFAULT 0;

ALTER TABLE creator_canvas_generation_batch_items
  ADD COLUMN IF NOT EXISTS billing_allocation_key text NULL,
  ADD COLUMN IF NOT EXISTS estimated_credits integer NOT NULL DEFAULT 0;

ALTER TABLE creator_canvas_generation_batches
  DROP CONSTRAINT IF EXISTS creator_canvas_generation_batches_billing_mode_check,
  ADD CONSTRAINT creator_canvas_generation_batches_billing_mode_check CHECK (
    billing_mode IN ('per_item', 'batch_reservation')
  ),
  DROP CONSTRAINT IF EXISTS creator_canvas_generation_batches_billing_binding_check,
  ADD CONSTRAINT creator_canvas_generation_batches_billing_binding_check CHECK (
    (billing_mode = 'per_item' AND credit_reservation_id IS NULL)
    OR (billing_mode = 'batch_reservation' AND credit_reservation_id IS NOT NULL)
  ),
  DROP CONSTRAINT IF EXISTS creator_canvas_generation_batches_credit_totals_check,
  ADD CONSTRAINT creator_canvas_generation_batches_credit_totals_check CHECK (
    estimated_credits >= 0
    AND settled_credits >= 0
    AND settled_credits <= estimated_credits
  );

CREATE UNIQUE INDEX IF NOT EXISTS creator_canvas_generation_batches_reservation_uidx
  ON creator_canvas_generation_batches (credit_reservation_id)
  WHERE credit_reservation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS creator_canvas_generation_batch_items_allocation_key_uidx
  ON creator_canvas_generation_batch_items (batch_id, billing_allocation_key)
  WHERE billing_allocation_key IS NOT NULL;

ALTER TABLE creator_canvas_generation_batch_items
  DROP CONSTRAINT IF EXISTS creator_canvas_generation_batch_items_estimated_credits_check,
  ADD CONSTRAINT creator_canvas_generation_batch_items_estimated_credits_check CHECK (
    estimated_credits >= 0
  );

CREATE OR REPLACE VIEW generation_task_credit_reservations AS
SELECT
  reservation.id,
  reservation.project_id,
  reservation.canvas_project_id,
  reservation.workflow_id,
  COALESCE(item.task_id, reservation.task_id) AS task_id,
  reservation.amount_total,
  COALESCE(item.estimated_credits, reservation.amount_reserved) AS amount_reserved,
  reservation.amount_consumed,
  reservation.amount_released,
  reservation.status,
  reservation.source_type,
  reservation.source_id,
  reservation.reason,
  reservation.metadata_json,
  reservation.created_by_user_id,
  reservation.created_at,
  reservation.updated_at,
  reservation.user_id
FROM credit_reservations reservation
LEFT JOIN creator_canvas_generation_batch_items item
  ON item.credit_reservation_id = reservation.id
WHERE reservation.task_id IS NOT NULL OR item.task_id IS NOT NULL;
