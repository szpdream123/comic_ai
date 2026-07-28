import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import { findStorageObject } from "./storage.service.ts";

export class CanvasUploadFingerprintError extends Error {
  constructor(readonly code: string, message = code) { super(message); }
}

export async function registerOrReuseCanvasUploadFingerprint(
  db: SqlDatabase,
  input: {
    canvasProjectId: string;
    ownerUserId: string;
    storageObjectId: string;
    fingerprint: string;
    contentType: string;
    sizeBytes: number;
    now: Date;
  },
) {
  const fingerprint = input.fingerprint.trim().toLowerCase().replace(/^sha256:/, "");
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new CanvasUploadFingerprintError("canvas_upload_fingerprint_invalid");
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 0) throw new CanvasUploadFingerprintError("canvas_upload_size_invalid");
  const existing = await queryOne<{ id: string; storage_object_id: string }>(db, `
    SELECT id, storage_object_id
    FROM creator_canvas_upload_fingerprints
    WHERE canvas_project_id=$1 AND owner_user_id=$5
      AND fingerprint=$2 AND content_type=$3 AND size_bytes=$4
    LIMIT 1
  `, [input.canvasProjectId, fingerprint, input.contentType, input.sizeBytes, input.ownerUserId]);
  if (existing) {
    await db.query(`UPDATE creator_canvas_upload_fingerprints SET last_reused_at=$2, reuse_count=reuse_count+1 WHERE id=$1`, [existing.id, input.now]);
    const object = await findStorageObject(db, existing.storage_object_id);
    if (!object || object.status === "deleted" || object.status === "failed") {
      throw new CanvasUploadFingerprintError("canvas_upload_reuse_unavailable");
    }
    return { reused: true, fingerprint, storageObject: object };
  }
  const object = await findStorageObject(db, input.storageObjectId);
  if (!object || object.createdByUserId !== input.ownerUserId || object.status !== "available") {
    throw new CanvasUploadFingerprintError("canvas_upload_storage_object_invalid");
  }
  if (object.canvasProjectId && object.canvasProjectId !== input.canvasProjectId) {
    throw new CanvasUploadFingerprintError("canvas_upload_storage_scope_mismatch");
  }
  await db.query(`
    UPDATE storage_objects
    SET canvas_project_id=$2, project_id=NULL
    WHERE id=$1 AND created_by_user_id=$3 AND (canvas_project_id IS NULL OR canvas_project_id=$2)
  `, [input.storageObjectId, input.canvasProjectId, input.ownerUserId]);
  const row = await queryOne<{ id: string }>(db, `
    INSERT INTO creator_canvas_upload_fingerprints (
      id, canvas_project_id, owner_user_id, fingerprint, content_type, size_bytes,
      storage_object_id, created_at, last_reused_at, reuse_count
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,0)
    ON CONFLICT (canvas_project_id, fingerprint, content_type, size_bytes)
    DO UPDATE SET last_reused_at=EXCLUDED.last_reused_at, reuse_count=creator_canvas_upload_fingerprints.reuse_count+1
    RETURNING id
  `, [randomUUID(), input.canvasProjectId, input.ownerUserId, fingerprint, input.contentType, input.sizeBytes, input.storageObjectId, input.now]);
  const resolved = await queryOne<{ storage_object_id: string }>(db, "SELECT storage_object_id FROM creator_canvas_upload_fingerprints WHERE id=$1", [row!.id]);
  const resolvedObject = await findStorageObject(db, resolved!.storage_object_id);
  return { reused: false, fingerprint, storageObject: resolvedObject };
}
