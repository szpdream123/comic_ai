import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export interface CanvasAssetReferenceUsage {
  documentReferenceCount: number;
  revisionReferenceCount: number;
  artifactReferenceCount: number;
  total: number;
}

export class CanvasAssetReferenceError extends Error {
  constructor(readonly code = "canvas_asset_in_use", message = code) { super(message); }
}

export async function inspectCanvasAssetReferenceUsage(
  db: SqlDatabase,
  input: { canvasProjectId: string; storageObjectId?: string | null; assetId?: string | null; assetVersionId?: string | null },
): Promise<CanvasAssetReferenceUsage> {
  const usage = await queryOne<{
    document_reference_count: number | string;
    revision_reference_count: number | string;
    artifact_reference_count: number | string;
  }>(db, `
    SELECT
      (SELECT count(*)::int FROM creator_canvas_documents document
       WHERE document.canvas_project_id=$1 AND (
         ($2::uuid IS NOT NULL AND (document.document_json::text LIKE '%' || $2::text || '%')) OR
         ($3::uuid IS NOT NULL AND (document.document_json::text LIKE '%' || $3::text || '%')) OR
         ($4::uuid IS NOT NULL AND (document.document_json::text LIKE '%' || $4::text || '%'))
       )) AS document_reference_count,
      (SELECT count(*)::int FROM creator_canvas_revisions revision
       WHERE revision.canvas_project_id=$1 AND (
         ($2::uuid IS NOT NULL AND revision.document_json::text LIKE '%' || $2::text || '%') OR
         ($3::uuid IS NOT NULL AND revision.document_json::text LIKE '%' || $3::text || '%') OR
         ($4::uuid IS NOT NULL AND revision.document_json::text LIKE '%' || $4::text || '%')
       )) AS revision_reference_count,
      (SELECT count(*)::int FROM creator_canvas_node_artifacts artifact
       WHERE artifact.canvas_project_id=$1 AND artifact.deleted_at IS NULL AND (
         artifact.storage_object_id=$2 OR artifact.asset_id=$3 OR artifact.asset_version_id=$4
       )) AS artifact_reference_count
  `, [input.canvasProjectId, input.storageObjectId ?? null, input.assetId ?? null, input.assetVersionId ?? null]);
  const documentReferenceCount = Number(usage?.document_reference_count ?? 0);
  const revisionReferenceCount = Number(usage?.revision_reference_count ?? 0);
  const artifactReferenceCount = Number(usage?.artifact_reference_count ?? 0);
  return {
    documentReferenceCount,
    revisionReferenceCount,
    artifactReferenceCount,
    total: documentReferenceCount + revisionReferenceCount + artifactReferenceCount,
  };
}

export async function assertCanvasAssetDeletionAllowed(
  db: SqlDatabase,
  input: { canvasProjectId: string; storageObjectId?: string | null; assetId?: string | null; assetVersionId?: string | null },
) {
  const usage = await inspectCanvasAssetReferenceUsage(db, input);
  if (usage.total > 0) throw new CanvasAssetReferenceError();
  return usage;
}
