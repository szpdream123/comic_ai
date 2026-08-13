import type { SqlDatabase } from "../shared/db/sql.ts";

export async function failOrphanedTeamAssetGenerations(
  db: SqlDatabase,
  input: { staleBefore: Date; now: Date; limit?: number },
) {
  const limit = Math.max(1, Math.min(500, Math.trunc(input.limit ?? 100)));
  const failed = await db.query<{ id: string }>(`
    WITH candidates AS (
      SELECT asset.id
      FROM team_assets asset
      WHERE asset.asset_status = 'generating'
        AND asset.updated_at < $1
        AND NOT EXISTS (
          SELECT 1
          FROM tasks task
          WHERE task.input_snapshot_json->>'targetType' = 'team_asset'
            AND task.input_snapshot_json->>'targetId' = asset.id::text
            AND task.status IN ('queued','running','cancel_requested','result_unknown','manual_review_required')
        )
        AND NOT EXISTS (
          SELECT 1
          FROM provider_requests request
          WHERE request.payload_ref = 'creator://team-assets/' || asset.id::text
            AND request.status IN ('created','submitted','accepted','running','succeeded','result_unknown','manual_review_required')
        )
      ORDER BY asset.updated_at ASC, asset.id ASC
      LIMIT $2
      FOR UPDATE SKIP LOCKED
    )
    UPDATE team_assets asset
    SET asset_status = 'failed', updated_at = $3
    FROM candidates
    WHERE asset.id = candidates.id
      AND asset.asset_status = 'generating'
    RETURNING asset.id
  `, [input.staleBefore, limit, input.now]);
  return { failedAssetIds: failed.rows.map((row) => row.id) };
}
