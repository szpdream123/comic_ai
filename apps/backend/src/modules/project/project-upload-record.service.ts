import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export interface ProjectUploadRecord {
  id: string;
  organizationId: string;
  workspaceId: string | null;
  projectId: string | null;
  storageObjectId: string | null;
  uploadSessionId: string | null;
  actorUserId: string | null;
  actorDisplayName: string | null;
  actorPhoneE164: string | null;
  projectName: string | null;
  pageKey: string;
  pageUrl: string | null;
  sourceAction: string;
  fileName: string;
  objectKey: string | null;
  bucket: string | null;
  provider: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  publicUrl: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

interface ProjectUploadRecordRow {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  project_id: string | null;
  storage_object_id: string | null;
  upload_session_id: string | null;
  actor_user_id: string | null;
  actor_display_name: string | null;
  actor_phone_e164: string | null;
  project_name: string | null;
  page_key: string;
  page_url: string | null;
  source_action: string;
  file_name: string;
  object_key: string | null;
  bucket: string | null;
  provider: string | null;
  content_type: string | null;
  size_bytes: number | string | null;
  public_url: string | null;
  status: string;
  error_message: string | null;
  created_at: Date;
  completed_at: Date | null;
}

export async function createProjectUploadRecord(
  db: SqlDatabase,
  input: Omit<ProjectUploadRecord, "id" | "createdAt" | "completedAt"> & {
    now: Date;
  },
) {
  const row = await queryOne<ProjectUploadRecordRow>(
    db,
    `
      INSERT INTO project_upload_records (
        id, organization_id, workspace_id, project_id, storage_object_id, upload_session_id,
        actor_user_id, actor_display_name, actor_phone_e164, project_name,
        page_key, page_url, source_action, file_name, object_key, bucket, provider,
        content_type, size_bytes, public_url, status, error_message, created_at, completed_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17,
        $18, $19, $20, $21, $22, $23, $24
      )
      RETURNING *
    `,
    [
      randomUUID(),
      input.organizationId,
      input.workspaceId,
      input.projectId,
      input.storageObjectId,
      input.uploadSessionId,
      input.actorUserId,
      input.actorDisplayName,
      input.actorPhoneE164,
      input.projectName,
      input.pageKey,
      input.pageUrl,
      input.sourceAction,
      input.fileName,
      input.objectKey,
      input.bucket,
      input.provider,
      input.contentType,
      input.sizeBytes,
      input.publicUrl,
      input.status,
      input.errorMessage,
      input.now,
      null,
    ],
  );
  return projectUploadRecordFromRow(row!);
}

export async function completeProjectUploadRecord(
  db: SqlDatabase,
  input: {
    uploadSessionId: string;
    storageObjectId?: string | null;
    objectKey?: string | null;
    bucket?: string | null;
    provider?: string | null;
    contentType?: string | null;
    sizeBytes?: number | null;
    publicUrl?: string | null;
    status: string;
    errorMessage?: string | null;
    now: Date;
  },
) {
  const row = await queryOne<ProjectUploadRecordRow>(
    db,
    `
      UPDATE project_upload_records
      SET storage_object_id = COALESCE($2, storage_object_id),
          object_key = COALESCE($3, object_key),
          bucket = COALESCE($4, bucket),
          provider = COALESCE($5, provider),
          content_type = COALESCE($6, content_type),
          size_bytes = COALESCE($7, size_bytes),
          public_url = COALESCE($8, public_url),
          status = $9,
          error_message = $10,
          completed_at = $11
      WHERE upload_session_id = $1
      RETURNING *
    `,
    [
      input.uploadSessionId,
      input.storageObjectId ?? null,
      input.objectKey ?? null,
      input.bucket ?? null,
      input.provider ?? null,
      input.contentType ?? null,
      input.sizeBytes ?? null,
      input.publicUrl ?? null,
      input.status,
      input.errorMessage ?? null,
      input.now,
    ],
  );
  return row ? projectUploadRecordFromRow(row) : null;
}

function projectUploadRecordFromRow(row: ProjectUploadRecordRow): ProjectUploadRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    storageObjectId: row.storage_object_id,
    uploadSessionId: row.upload_session_id,
    actorUserId: row.actor_user_id,
    actorDisplayName: row.actor_display_name,
    actorPhoneE164: row.actor_phone_e164,
    projectName: row.project_name,
    pageKey: row.page_key,
    pageUrl: row.page_url,
    sourceAction: row.source_action,
    fileName: row.file_name,
    objectKey: row.object_key,
    bucket: row.bucket,
    provider: row.provider,
    contentType: row.content_type,
    sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    publicUrl: row.public_url,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}
