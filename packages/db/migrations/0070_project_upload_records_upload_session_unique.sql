WITH ranked_project_upload_records AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY upload_session_id
      ORDER BY
        CASE
          WHEN status = 'uploaded' THEN 2
          WHEN completed_at IS NOT NULL OR public_url IS NOT NULL THEN 1
          ELSE 0
        END DESC,
        COALESCE(completed_at, created_at) DESC,
        created_at DESC,
        id DESC
    ) AS keep_rank
  FROM project_upload_records
  WHERE upload_session_id IS NOT NULL
)
DELETE FROM project_upload_records pur
USING ranked_project_upload_records ranked
WHERE pur.id = ranked.id
  AND ranked.keep_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS project_upload_records_upload_session_unique_idx
  ON project_upload_records (upload_session_id)
  WHERE upload_session_id IS NOT NULL;
