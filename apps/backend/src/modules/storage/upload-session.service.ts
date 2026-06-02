import { randomUUID } from "node:crypto";

import qcloudCosSts from "qcloud-cos-sts";

import type { ActorContext } from "../organization/actor-context.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import {
  buildSignedObjectUrls,
  createScopedStorageObject,
  findStorageObject,
  markStorageObjectAvailable,
  markStorageObjectFailed,
  type StorageAdapter,
  type StorageObjectRecord,
} from "./storage.service.ts";

type UploadSessionStatus =
  | "created"
  | "uploading"
  | "uploaded"
  | "aborted"
  | "expired"
  | "failed";

export interface StorageUploadSessionRecord {
  id: string;
  organizationId: string;
  workspaceId: string | null;
  projectId: string | null;
  storageObjectId: string;
  purpose: string;
  status: UploadSessionStatus;
  contentType: string;
  expectedSizeBytes: number | null;
  originalFileName: string;
  checksum: string | null;
  idempotencyKey: string;
  expiresAt: Date;
  completedAt: Date | null;
  createdByUserId: string | null;
  createdAt: Date;
}

interface StorageUploadSessionRow {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  project_id: string | null;
  storage_object_id: string;
  purpose: string;
  status: UploadSessionStatus;
  content_type: string;
  expected_size_bytes: number | string | null;
  original_file_name: string;
  checksum: string | null;
  idempotency_key: string;
  expires_at: Date;
  completed_at: Date | null;
  created_by_user_id: string | null;
  created_at: Date;
}

export interface UploadSessionRuntime {
  mode: string;
  provider: string;
  bucket: string;
  region: string;
  adapter: StorageAdapter;
  publicBaseUrl?: string | null;
  stsSecretId?: string | null;
  stsSecretKey?: string | null;
  stsDurationSeconds?: number;
  localUploadUrlPath?: string;
  localObjectStore?: {
    headObject(input: { bucket: string; objectKey: string }): Promise<{
      exists: boolean;
      contentType?: string | null;
      contentLength?: number | null;
      checksum?: string | null;
      eTag?: string | null;
      versionId?: string | null;
    }>;
    deleteObject(input: { bucket: string; objectKey: string }): Promise<void>;
  };
}

export async function createUploadSession(
  db: SqlDatabase,
  input: {
    actor: ActorContext;
    sessionToken: string;
    projectId?: string | null;
    purpose: string;
    fileName: string;
    contentType: string;
    sizeBytes?: number | null;
    checksum?: string | null;
    multipart?: boolean | null;
    idempotencyKey: string;
    now: Date;
    runtime: UploadSessionRuntime;
  },
) {
  const existing = await findUploadSessionByIdempotencyKey(db, {
    organizationId: input.actor.organizationId,
    createdByUserId: input.actor.actorId,
    idempotencyKey: input.idempotencyKey,
  });
  if (existing) {
    const object = await findStorageObject(db, existing.storageObjectId);
    if (!object) {
      throw new Error("upload_session_storage_object_missing");
    }
    return buildUploadSessionResponse(existing, object, input.runtime, input.now);
  }

  const storageObject = await createScopedStorageObject(db, {
    organizationId: input.actor.organizationId,
    workspaceId: input.actor.workspaceId,
    projectId: input.projectId ?? null,
    bucket: input.runtime.bucket,
    objectName: `${input.purpose}/${input.fileName}`,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes ?? null,
    checksum: input.checksum ?? null,
    provider: input.runtime.provider,
    status: "pending_upload",
    metadata: {
      purpose: input.purpose,
      originalFileName: input.fileName,
      multipart: Boolean(input.multipart),
    },
    createdByUserId: input.actor.actorId,
    now: input.now,
  });

  const expiresAt = new Date(
    input.now.getTime() + (input.runtime.stsDurationSeconds ?? 1800) * 1000,
  );
  const session = await insertUploadSession(db, {
    id: randomUUID(),
    organizationId: input.actor.organizationId,
    workspaceId: input.actor.workspaceId,
    projectId: input.projectId ?? null,
    storageObjectId: storageObject.id,
    purpose: input.purpose,
    status: "created",
    contentType: input.contentType,
    expectedSizeBytes: input.sizeBytes ?? null,
    originalFileName: input.fileName,
    checksum: input.checksum ?? null,
    idempotencyKey: input.idempotencyKey,
    expiresAt,
    completedAt: null,
    createdByUserId: input.actor.actorId,
    createdAt: input.now,
  });

  return buildUploadSessionResponse(session, storageObject, input.runtime, input.now);
}

export async function completeUploadSession(
  db: SqlDatabase,
  input: {
    actor: ActorContext;
    sessionToken: string;
    uploadSessionId: string;
    checksum?: string | null;
    eTag?: string | null;
    now: Date;
    runtime: UploadSessionRuntime;
    signedUrlExpiresInSeconds: number;
  },
) {
  const session = await requireOwnedUploadSession(db, input.actor, input.uploadSessionId);
  const object = await findStorageObject(db, session.storageObjectId);
  if (!object) {
    throw new Error("upload_session_storage_object_missing");
  }

  const remote = await headRuntimeObject(input.runtime, {
    bucket: object.bucket,
    objectKey: object.objectKey,
  });

  if (!remote?.exists) {
    throw new Error("storage_object_not_found");
  }

  const updatedObject = await markStorageObjectAvailable(db, {
    storageObjectId: object.id,
    sizeBytes: remote.contentLength ?? session.expectedSizeBytes,
    checksum: input.checksum ?? remote.checksum ?? session.checksum,
    etag: input.eTag ?? remote.eTag ?? null,
    versionId: remote.versionId ?? null,
    contentType: remote.contentType ?? session.contentType,
    metadata: {
      ...object.metadata,
      uploadSessionId: session.id,
    },
    now: input.now,
  });

  const updatedSession = await queryOne<StorageUploadSessionRow>(
    db,
    `
      UPDATE storage_upload_sessions
      SET status = 'uploaded',
          completed_at = $2
      WHERE id = $1
      RETURNING *
    `,
    [session.id, input.now],
  );

  return {
    uploadSession: uploadSessionFromRow(updatedSession!),
    storageObject: updatedObject!,
    urls: await buildSignedObjectUrls(db, {
      sessionToken: input.sessionToken,
      storageObjectId: object.id,
      adapter: input.runtime.adapter,
      now: input.now,
      expiresInSeconds: input.signedUrlExpiresInSeconds,
    }),
  };
}

export function buildStorageObjectPublicUrl(
  runtime: UploadSessionRuntime,
  object: {
    bucket: string;
    objectKey: string;
  },
) {
  const configuredBaseUrl = String(runtime.publicBaseUrl ?? "").trim().replace(/\/+$/g, "");
  if (configuredBaseUrl) {
    return `${configuredBaseUrl}/${object.objectKey}`;
  }
  if (runtime.mode === "cos" && runtime.bucket && runtime.region) {
    return `https://${runtime.bucket}.cos.${runtime.region}.myqcloud.com/${object.objectKey}`;
  }
  return null;
}

export async function abortUploadSession(
  db: SqlDatabase,
  input: {
    actor: ActorContext;
    uploadSessionId: string;
    now: Date;
    runtime: UploadSessionRuntime;
  },
) {
  const session = await requireOwnedUploadSession(db, input.actor, input.uploadSessionId);
  const object = await findStorageObject(db, session.storageObjectId);
  if (!object) {
    throw new Error("upload_session_storage_object_missing");
  }

  try {
    await deleteRuntimeObject(input.runtime, {
      bucket: object.bucket,
      objectKey: object.objectKey,
    });
    await markStorageObjectFailed(db, {
      storageObjectId: object.id,
      status: "deleted",
      now: input.now,
    });
  } catch {
    await markStorageObjectFailed(db, {
      storageObjectId: object.id,
      status: "failed",
      now: input.now,
    });
  }

  const updated = await queryOne<StorageUploadSessionRow>(
    db,
    `
      UPDATE storage_upload_sessions
      SET status = 'aborted',
          completed_at = $2
      WHERE id = $1
      RETURNING *
    `,
    [session.id, input.now],
  );

  return uploadSessionFromRow(updated!);
}

export async function expireStaleUploadSessions(
  db: SqlDatabase,
  input: {
    now: Date;
  },
) {
  const result = await db.query<StorageUploadSessionRow>(
    `
      UPDATE storage_upload_sessions
      SET status = 'expired'
      WHERE status IN ('created', 'uploading')
        AND expires_at < $1
      RETURNING *
    `,
    [input.now],
  );

  return result.rows.map(uploadSessionFromRow);
}

export async function listProblemStorageObjects(
  db: SqlDatabase,
  input: {
    now: Date;
  },
) {
  const result = await db.query<{
    id: string;
    status: string;
    object_key: string;
  }>(
    `
      SELECT id, status, object_key
      FROM storage_objects
      WHERE status IN ('delete_failed', 'failed')
         OR (status = 'pending_upload' AND created_at < ($1::timestamptz - interval '30 minutes'))
      ORDER BY created_at ASC
    `,
    [input.now],
  );

  return result.rows;
}

export async function runStorageRepairJob(
  db: SqlDatabase,
  input: {
    now: Date;
    runtime: UploadSessionRuntime;
  },
) {
  const expiredSessions = await expireStaleUploadSessions(db, { now: input.now });
  const stalePendingObjects = await db.query<{
    id: string;
  }>(
    `
      SELECT id
      FROM storage_objects
      WHERE status = 'pending_upload'
        AND created_at < ($1::timestamptz - interval '30 minutes')
      ORDER BY created_at ASC
    `,
    [input.now],
  );
  const failedPendingObjectIds: string[] = [];
  for (const row of stalePendingObjects.rows) {
    await markStorageObjectFailed(db, {
      storageObjectId: row.id,
      status: "failed",
      now: input.now,
    });
    failedPendingObjectIds.push(row.id);
  }

  const deleteFailedObjects = await db.query<{
    id: string;
    bucket: string;
    object_key: string;
  }>(
    `
      SELECT id, bucket, object_key
      FROM storage_objects
      WHERE status = 'delete_failed'
      ORDER BY created_at ASC
    `,
  );
  const retriedDeleteObjectIds: string[] = [];
  for (const row of deleteFailedObjects.rows) {
    try {
      await deleteRuntimeObject(input.runtime, {
        bucket: row.bucket,
        objectKey: row.object_key,
      });
      await markStorageObjectFailed(db, {
        storageObjectId: row.id,
        status: "deleted",
        now: input.now,
      });
      retriedDeleteObjectIds.push(row.id);
    } catch {
      await markStorageObjectFailed(db, {
        storageObjectId: row.id,
        status: "delete_failed",
        now: input.now,
      });
    }
  }

  const danglingObjects = await db.query<{
    id: string;
    bucket: string;
    object_key: string;
    created_at: Date;
  }>(
    `
      SELECT DISTINCT o.id, o.bucket, o.object_key, o.created_at
      FROM storage_upload_sessions s
      JOIN storage_objects o
        ON o.organization_id = s.organization_id
       AND o.id = s.storage_object_id
      WHERE s.status = 'uploaded'
        AND s.completed_at IS NOT NULL
        AND s.completed_at < ($1::timestamptz - interval '15 minutes')
        AND o.status IN ('available', 'pending_upload')
        AND NOT EXISTS (
          SELECT 1
          FROM asset_versions av
          WHERE av.storage_object_id = o.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM export_records er
          WHERE er.storage_object_id = o.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM projects p
          WHERE p.cover_storage_object_id = o.id
        )
      ORDER BY o.created_at ASC
    `,
    [input.now],
  );
  const danglingObjectIds: string[] = [];
  for (const row of danglingObjects.rows) {
    try {
      await deleteRuntimeObject(input.runtime, {
        bucket: row.bucket,
        objectKey: row.object_key,
      });
      await markStorageObjectFailed(db, {
        storageObjectId: row.id,
        status: "deleted",
        now: input.now,
      });
      await db.query(
        `
          UPDATE storage_upload_sessions
          SET status = 'failed'
          WHERE storage_object_id = $1
            AND status = 'uploaded'
        `,
        [row.id],
      );
      danglingObjectIds.push(row.id);
    } catch {
      await markStorageObjectFailed(db, {
        storageObjectId: row.id,
        status: "delete_failed",
        now: input.now,
      });
    }
  }

  const verifiedAvailableObjects = await db.query<{
    id: string;
    bucket: string;
    object_key: string;
  }>(
    `
      SELECT id, bucket, object_key
      FROM storage_objects
      WHERE status = 'available'
        AND last_verified_at < ($1::timestamptz - interval '30 minutes')
      ORDER BY last_verified_at ASC
    `,
    [input.now],
  );
  const missingObjectIds: string[] = [];
  for (const row of verifiedAvailableObjects.rows) {
    const remote = await headRuntimeObject(input.runtime, {
      bucket: row.bucket,
      objectKey: row.object_key,
    });
    if (remote?.exists) {
      continue;
    }
    await markStorageObjectFailed(db, {
      storageObjectId: row.id,
      status: "failed",
      now: input.now,
    });
    missingObjectIds.push(row.id);
  }

  return {
    expiredSessionIds: expiredSessions.map((session) => session.id),
    failedPendingObjectIds,
    retriedDeleteObjectIds,
    danglingObjectIds,
    missingObjectIds,
  };
}

export async function findUploadSession(
  db: SqlDatabase,
  uploadSessionId: string,
) {
  const row = await queryOne<StorageUploadSessionRow>(
    db,
    "SELECT * FROM storage_upload_sessions WHERE id = $1",
    [uploadSessionId],
  );
  return row ? uploadSessionFromRow(row) : undefined;
}

async function requireOwnedUploadSession(
  db: SqlDatabase,
  actor: ActorContext,
  uploadSessionId: string,
) {
  const session = await findUploadSession(db, uploadSessionId);
  if (!session || session.organizationId !== actor.organizationId) {
    throw new Error("upload_session_not_found");
  }
  if (session.createdByUserId && session.createdByUserId !== actor.actorId) {
    throw new Error("upload_session_not_found");
  }
  if (
    session.workspaceId &&
    actor.workspaceId &&
    session.workspaceId !== actor.workspaceId
  ) {
    throw new Error("upload_session_scope_invalid");
  }
  return session;
}

async function findUploadSessionByIdempotencyKey(
  db: SqlDatabase,
  input: {
    organizationId: string;
    createdByUserId: string;
    idempotencyKey: string;
  },
) {
  const row = await queryOne<StorageUploadSessionRow>(
    db,
    `
      SELECT *
      FROM storage_upload_sessions
      WHERE organization_id = $1
        AND created_by_user_id = $2
        AND idempotency_key = $3
      LIMIT 1
    `,
    [input.organizationId, input.createdByUserId, input.idempotencyKey],
  );
  return row ? uploadSessionFromRow(row) : undefined;
}

async function insertUploadSession(
  db: SqlDatabase,
  input: StorageUploadSessionRecord,
) {
  const row = await queryOne<StorageUploadSessionRow>(
    db,
    `
      INSERT INTO storage_upload_sessions (
        id,
        organization_id,
        workspace_id,
        project_id,
        storage_object_id,
        purpose,
        status,
        content_type,
        expected_size_bytes,
        original_file_name,
        checksum,
        idempotency_key,
        expires_at,
        completed_at,
        created_by_user_id,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `,
    [
      input.id,
      input.organizationId,
      input.workspaceId,
      input.projectId,
      input.storageObjectId,
      input.purpose,
      input.status,
      input.contentType,
      input.expectedSizeBytes,
      input.originalFileName,
      input.checksum,
      input.idempotencyKey,
      input.expiresAt,
      input.completedAt,
      input.createdByUserId,
      input.createdAt,
    ],
  );
  return uploadSessionFromRow(row!);
}

async function buildUploadSessionResponse(
  session: StorageUploadSessionRecord,
  object: StorageObjectRecord,
  runtime: UploadSessionRuntime,
  now: Date,
) {
  const base = {
    uploadSessionId: session.id,
    storageObjectId: object.id,
    bucket: object.bucket,
    region: runtime.region,
    objectKey: object.objectKey,
    provider: runtime.provider,
    expiresAt: session.expiresAt,
    upload: runtime.localUploadUrlPath
      ? {
          method: "PUT",
          url: `${runtime.localUploadUrlPath}/${encodeURIComponent(session.id)}/blob`,
          headers: {
            "content-type": object.contentType,
          },
          issuedAt: now.toISOString(),
        }
      : undefined,
  };

  if (runtime.mode === "cos" && runtime.stsSecretId && runtime.stsSecretKey) {
    const credential = await qcloudCosSts.getCredential({
      secretId: runtime.stsSecretId,
      secretKey: runtime.stsSecretKey,
      durationSeconds: runtime.stsDurationSeconds ?? 1800,
      bucket: object.bucket,
      region: runtime.region,
      policy: qcloudCosSts.getPolicy([
        { action: "name/cos:PutObject", bucket: object.bucket, region: runtime.region, prefix: object.objectKey },
        { action: "name/cos:PostObject", bucket: object.bucket, region: runtime.region, prefix: object.objectKey },
        { action: "name/cos:InitiateMultipartUpload", bucket: object.bucket, region: runtime.region, prefix: object.objectKey },
        { action: "name/cos:UploadPart", bucket: object.bucket, region: runtime.region, prefix: object.objectKey },
        { action: "name/cos:CompleteMultipartUpload", bucket: object.bucket, region: runtime.region, prefix: object.objectKey },
        { action: "name/cos:AbortMultipartUpload", bucket: object.bucket, region: runtime.region, prefix: object.objectKey },
      ]),
    });

    return {
      ...base,
      credentials: {
        tmpSecretId: credential.credentials?.tmpSecretId,
        tmpSecretKey: credential.credentials?.tmpSecretKey,
        sessionToken: credential.credentials?.sessionToken,
        expiredTime: credential.expiredTime,
        startTime: credential.startTime,
      },
    };
  }

  return base;
}

function uploadSessionFromRow(row: StorageUploadSessionRow): StorageUploadSessionRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    storageObjectId: row.storage_object_id,
    purpose: row.purpose,
    status: row.status,
    contentType: row.content_type,
    expectedSizeBytes:
      row.expected_size_bytes === null ? null : Number(row.expected_size_bytes),
    originalFileName: row.original_file_name,
    checksum: row.checksum,
    idempotencyKey: row.idempotency_key,
    expiresAt: row.expires_at,
    completedAt: row.completed_at,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}

async function headRuntimeObject(
  runtime: UploadSessionRuntime,
  input: {
    bucket: string;
    objectKey: string;
  },
) {
  if (runtime.mode === "cos" || runtime.mode === "s3_compatible") {
    return runtime.adapter.headObject?.(input);
  }
  return runtime.localObjectStore?.headObject(input);
}

async function deleteRuntimeObject(
  runtime: UploadSessionRuntime,
  input: {
    bucket: string;
    objectKey: string;
  },
) {
  if (runtime.mode === "cos" || runtime.mode === "s3_compatible") {
    return runtime.adapter.deleteObject?.(input);
  }
  return runtime.localObjectStore?.deleteObject(input);
}
