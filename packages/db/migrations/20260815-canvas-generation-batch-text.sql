ALTER TABLE creator_canvas_generation_batch_items
  ADD COLUMN IF NOT EXISTS run_id uuid NULL REFERENCES creator_canvas_node_runs(id);

CREATE INDEX IF NOT EXISTS creator_canvas_generation_batch_items_run_idx
  ON creator_canvas_generation_batch_items (run_id)
  WHERE run_id IS NOT NULL;
