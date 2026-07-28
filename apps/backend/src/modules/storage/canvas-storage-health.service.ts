import { capabilities } from "../../../../../packages/contracts/domain/capabilities.ts";
import type { CanvasActorScope } from "../identity/canvas-actor-scope.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";

export async function getCanvasStorageHealth(
  db: SqlDatabase,
  input: { canvasProjectId: string; actorScope: CanvasActorScope },
) {
  if (input.actorScope.canvasId !== input.canvasProjectId
    || !input.actorScope.capabilities.includes(capabilities.canvasView)) {
    throw new Error("canvas_storage_health_forbidden");
  }
  const [objects, orphaned, fingerprints, thumbnails] = await Promise.all([
    db.query<{
      object_count: number | string;
      total_bytes: number | string;
      available_count: number | string;
      failed_count: number | string;
      pending_count: number | string;
    }>(`
      SELECT COUNT(*) AS object_count,
             COALESCE(SUM(size_bytes),0) AS total_bytes,
             COUNT(*) FILTER (WHERE status='available') AS available_count,
             COUNT(*) FILTER (WHERE status='failed') AS failed_count,
             COUNT(*) FILTER (WHERE status NOT IN ('available','failed','deleted')) AS pending_count
      FROM storage_objects
      WHERE canvas_project_id=$1 AND created_by_user_id=$2 AND status <> 'deleted'
    `, [input.canvasProjectId, input.actorScope.ownerUserId]),
    db.query<{ id: string; size_bytes: number | string }>(`
      SELECT object.id,object.size_bytes
      FROM storage_objects object
      WHERE object.canvas_project_id=$1 AND object.created_by_user_id=$2
        AND object.status='available'
        AND NOT EXISTS (SELECT 1 FROM creator_canvas_upload_fingerprints value WHERE value.storage_object_id=object.id)
        AND NOT EXISTS (SELECT 1 FROM creator_canvas_node_artifacts value WHERE value.storage_object_id=object.id AND value.deleted_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM creator_canvas_annotation_layers value WHERE value.layer_storage_object_id=object.id AND value.status IN ('active','reprojected'))
        AND NOT EXISTS (SELECT 1 FROM creator_canvas_card_snapshots value WHERE value.storage_object_id=object.id AND value.status='ready')
        AND NOT EXISTS (SELECT 1 FROM canvas_agent_file_grants value WHERE value.storage_object_id=object.id AND value.status='active')
      ORDER BY object.created_at ASC,object.id ASC
      LIMIT 100
    `, [input.canvasProjectId, input.actorScope.ownerUserId]),
    db.query<{
      entry_count: number | string;
      reused_entry_count: number | string;
      avoided_upload_count: number | string;
    }>(`
      SELECT COUNT(*) AS entry_count,
             COUNT(*) FILTER (WHERE reuse_count > 0) AS reused_entry_count,
             COALESCE(SUM(reuse_count),0) AS avoided_upload_count
      FROM creator_canvas_upload_fingerprints
      WHERE canvas_project_id=$1 AND owner_user_id=$2
    `, [input.canvasProjectId, input.actorScope.ownerUserId]),
    db.query<{
      visual_artifact_count: number | string;
      missing_thumbnail_count: number | string;
    }>(`
      SELECT COUNT(*) AS visual_artifact_count,
             COUNT(*) FILTER (WHERE NULLIF(btrim(thumbnail_url),'') IS NULL) AS missing_thumbnail_count
      FROM creator_canvas_node_artifacts
      WHERE canvas_project_id=$1 AND deleted_at IS NULL AND artifact_kind IN ('image','video','panorama')
    `, [input.canvasProjectId]),
  ]);
  const objectSummary = objects.rows[0];
  const fingerprintSummary = fingerprints.rows[0];
  const thumbnailSummary = thumbnails.rows[0];
  const orphanBytes = orphaned.rows.reduce((sum, row) => sum + Number(row.size_bytes ?? 0), 0);
  const failedCount = Number(objectSummary?.failed_count ?? 0);
  const missingThumbnailCount = Number(thumbnailSummary?.missing_thumbnail_count ?? 0);
  return {
    status: failedCount > 0 ? "degraded" : orphaned.rows.length > 0 || missingThumbnailCount > 0 ? "attention" : "healthy",
    objects: {
      count: Number(objectSummary?.object_count ?? 0),
      totalBytes: Number(objectSummary?.total_bytes ?? 0),
      availableCount: Number(objectSummary?.available_count ?? 0),
      failedCount,
      pendingCount: Number(objectSummary?.pending_count ?? 0),
    },
    orphaned: {
      count: orphaned.rows.length,
      bytes: orphanBytes,
      sampleStorageObjectIds: orphaned.rows.slice(0, 20).map((row) => row.id),
      truncated: orphaned.rows.length === 100,
    },
    fingerprints: {
      entryCount: Number(fingerprintSummary?.entry_count ?? 0),
      reusedEntryCount: Number(fingerprintSummary?.reused_entry_count ?? 0),
      avoidedUploadCount: Number(fingerprintSummary?.avoided_upload_count ?? 0),
    },
    thumbnails: {
      visualArtifactCount: Number(thumbnailSummary?.visual_artifact_count ?? 0),
      missingCount: missingThumbnailCount,
    },
  };
}
