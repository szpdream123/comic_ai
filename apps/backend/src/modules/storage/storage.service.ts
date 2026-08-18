import { createHash, randomUUID } from "node:crypto";

import {
  authorizeCanvasActor,
  CanvasAuthorizationError,
  assertCanvasActorAction,
  type CanvasActorScope,
} from "../identity/canvas-actor-scope.service.ts";
import {
  resolveUserActorContext,
  UserAuthorizationError,
} from "../identity/user-actor-context.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export type StorageObjectStatus =
  | "pending_upload"
  | "available"
  | "delete_failed"
  | "deleted"
  | "failed";

export interface StorageObjectRecord {
  id: string;
  userId: string | null;
  projectId: string | null;
  canvasProjectId?: string;
  bucket: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number | null;
  checksum: string | null;
  provider: string;
  status: StorageObjectStatus;
  etag: string | null;
  versionId: string | null;
  lastVerifiedAt: Date | null;
  deletedAt: Date | null;
  metadata: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: Date;
}

export interface StorageAdapter {
  createSignedReadUrl(input: {
    bucket: string;
    objectKey: string;
    expiresAt: Date;
    responseContentDisposition?: string | null;
  }): Promise<{ url: string; expiresAt: Date }>;
  putObject?(input: {
    bucket: string;
    objectKey: string;
    body: Uint8Array | ReadableStream<Uint8Array> | NodeJS.ReadableStream;
    contentType?: string | null;
    contentLength?: number | null;
    cacheControl?: string | null;
    timeoutMs?: number | null;
  }): Promise<{
    eTag?: string | null;
    versionId?: string | null;
  }>;
  headObject?(input: {
    bucket: string;
    objectKey: string;
  }): Promise<{
    exists: boolean;
    contentType?: string | null;
    contentLength?: number | null;
    eTag?: string | null;
    checksum?: string | null;
    versionId?: string | null;
  }>;
  copyObject?(input: {
    sourceBucket: string;
    sourceObjectKey: string;
    destinationBucket: string;
    destinationObjectKey: string;
  }): Promise<{
    eTag?: string | null;
    versionId?: string | null;
  }>;
  deleteObject?(input: {
    bucket: string;
    objectKey: string;
  }): Promise<void>;
}

interface StorageObjectRow {
  id: string;
  project_id: string | null;
  canvas_project_id: string | null;
  bucket: string;
  object_key: string;
  content_type: string;
  size_bytes: number | string | null;
  checksum: string | null;
  provider: string;
  status: StorageObjectStatus;
  etag: string | null;
  version_id: string | null;
  last_verified_at: Date | null;
  deleted_at: Date | null;
  metadata_json: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: Date;
}

interface ProjectScopeRow {
  owner_user_id: string;
}

interface CanvasScopeRow {
  created_by_user_id: string | null;
}

export class StorageAccessError extends Error {
  constructor(
    readonly code:
      | "invalid_storage_scope"
      | "invalid_object_name"
      | "storage_object_not_found"
      | "storage_upload_not_ready",
  ) {
    super(code);
  }
}

export async function createScopedStorageObject(
  db: SqlDatabase,
  input: {
    userId: string;
    actorScope?: CanvasActorScope;
    projectId?: string | null;
    canvasProjectId?: string | null;
    bucket: string;
    objectName: string;
    contentType: string;
    sizeBytes?: number | null;
    checksum?: string | null;
    provider?: string;
    status?: StorageObjectStatus;
    etag?: string | null;
    versionId?: string | null;
    metadata?: Record<string, unknown>;
    createdByUserId?: string | null;
    now: Date;
  },
): Promise<StorageObjectRecord> {
  if (input.actorScope) {
    if (input.canvasProjectId !== input.actorScope.canvasId) {
      throw new StorageAccessError("invalid_storage_scope");
    }
    if (input.userId !== input.actorScope.ownerUserId) {
      throw new StorageAccessError("invalid_storage_scope");
    }
    assertCanvasActorAction(input.actorScope, "edit");
  }
  await assertStorageScope(db, {
    userId: input.userId,
    projectId: input.projectId ?? null,
    canvasProjectId: input.canvasProjectId ?? null,
  });

  const objectId = randomUUID();
  const objectKey = buildScopedObjectKey({
    projectId: input.projectId ?? null,
    objectId,
    objectName: input.objectName,
    now: input.now,
  });

  const row = await queryOne<StorageObjectRow>(
    db,
    `
      INSERT INTO storage_objects (
        id,
        project_id,
        canvas_project_id,
        bucket,
        object_key,
        content_type,
        size_bytes,
        checksum,
        provider,
        status,
        etag,
        version_id,
        last_verified_at,
        deleted_at,
        metadata_json,
        created_by_user_id,
        created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15::jsonb, $16, $17
      )
      RETURNING *
    `,
    [
      objectId,
      input.projectId ?? null,
      input.canvasProjectId ?? null,
      input.bucket,
      objectKey,
      input.contentType,
      input.sizeBytes ?? null,
      input.checksum ?? null,
      input.provider ?? "legacy",
      input.status ?? "available",
      input.etag ?? null,
      input.versionId ?? null,
      input.status === "available" ? input.now : null,
      null,
      JSON.stringify(input.metadata ?? {}),
      input.createdByUserId ?? input.userId,
      input.now,
    ],
  );

  return storageObjectFromRow(row!);
}

export async function findGenerationStorageObject(
  db: SqlDatabase,
  input: {
    userId: string;
    bucket: string;
    taskId: string;
    attemptId: string | null;
  },
): Promise<StorageObjectRecord | undefined> {
  const row = await queryOne<StorageObjectRow>(
    db,
    `
      SELECT *
      FROM storage_objects
      WHERE created_by_user_id = $1
        AND bucket = $2
        AND metadata_json->>'taskId' = $3
        AND metadata_json->>'attemptId' IS NOT DISTINCT FROM $4
        AND status IN ('available', 'pending_upload', 'failed')
      ORDER BY
        CASE status
          WHEN 'available' THEN 0
          WHEN 'pending_upload' THEN 1
          ELSE 2
        END,
        created_at ASC
      LIMIT 1
    `,
    [input.userId, input.bucket, input.taskId, input.attemptId],
  );

  return row ? storageObjectFromRow(row) : undefined;
}

export async function createOrReuseGenerationStorageObject(
  db: SqlDatabase,
  input: {
    userId: string;
    projectId?: string | null;
    canvasProjectId?: string | null;
    bucket: string;
    objectName: string;
    contentType: string;
    sizeBytes?: number | null;
    provider?: string;
    status?: StorageObjectStatus;
    metadata: Record<string, unknown> & { taskId: string; attemptId: string | null };
    createdByUserId?: string | null;
    now: Date;
  },
): Promise<StorageObjectRecord> {
  const ownerUserId = input.createdByUserId ?? input.userId;
  const existing = await findGenerationStorageObject(db, {
    userId: ownerUserId,
    bucket: input.bucket,
    taskId: input.metadata.taskId,
    attemptId: input.metadata.attemptId,
  });
  if (existing) return existing;

  await assertStorageScope(db, {
    userId: input.userId,
    projectId: input.projectId ?? null,
    canvasProjectId: input.canvasProjectId ?? null,
  });

  const objectId = buildGenerationStorageObjectId(input.metadata.taskId, input.metadata.attemptId);
  const objectKey = buildGenerationObjectKey({ objectId, objectName: input.objectName });
  const row = await queryOne<StorageObjectRow>(
    db,
    `
      INSERT INTO storage_objects (
        id, project_id, canvas_project_id, bucket, object_key, content_type,
        size_bytes, checksum, provider, status, etag, version_id,
        last_verified_at, deleted_at, metadata_json, created_by_user_id, created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, NULL, $8, $9,
        NULL, NULL, NULL, NULL, $10::jsonb, $11, $12
      )
      ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
      RETURNING *
    `,
    [
      objectId,
      input.projectId ?? null,
      input.canvasProjectId ?? null,
      input.bucket,
      objectKey,
      input.contentType,
      input.sizeBytes ?? null,
      input.provider ?? "legacy",
      input.status ?? "pending_upload",
      JSON.stringify(input.metadata),
      ownerUserId,
      input.now,
    ],
  );

  return storageObjectFromRow(row!);
}

export async function createSignedReadUrl(
  db: SqlDatabase,
  input: {
    sessionToken?: string;
    actorScope?: CanvasActorScope;
    storageObjectId: string;
    adapter: StorageAdapter;
    now: Date;
    expiresInSeconds: number;
  },
): Promise<{
  url: string;
  expiresAt: Date;
  object: StorageObjectRecord;
}> {
  const object = await findStorageObject(db, input.storageObjectId);
  if (!object || object.status === "deleted" || object.deletedAt) {
    throw new StorageAccessError("storage_object_not_found");
  }

  if (object.canvasProjectId) {
    try {
      if (input.actorScope) {
        if (input.actorScope.canvasId !== object.canvasProjectId) {
          throw new CanvasAuthorizationError("canvas_not_found");
        }
        assertCanvasActorAction(input.actorScope, "view");
      } else {
        await authorizeCanvasActor(db, {
          sessionToken: input.sessionToken ?? "",
          canvasId: object.canvasProjectId,
          action: "view",
          now: input.now,
        });
      }
    } catch (error) {
      if (error instanceof CanvasAuthorizationError) {
        const authorizedByCharacterReference = await canReadCanvasCharacterStorageReference(db, {
          sessionToken: input.sessionToken,
          actorScope: input.actorScope,
          storageObjectId: object.id,
          now: input.now,
        });
        if (!authorizedByCharacterReference) {
          throw new StorageAccessError("storage_object_not_found");
        }
      } else {
        throw error;
      }
    }
  }

  const actor = object.canvasProjectId
    ? null
    : await resolveUserActorContext(db, {
        sessionToken: input.sessionToken ?? "",
        projectId: object.projectId ?? undefined,
        now: input.now,
      });

  if (
    !object.canvasProjectId && !object.projectId && object.userId !== actor!.userId
  ) {
    throw new UserAuthorizationError("project_not_found");
  }

  const expiresAt = new Date(input.now.getTime() + input.expiresInSeconds * 1000);
  const signed = await input.adapter.createSignedReadUrl({
    bucket: object.bucket,
    objectKey: object.objectKey,
    expiresAt,
    responseContentDisposition: input.responseContentDisposition,
  });

  return {
    ...signed,
    object,
  };
}

async function canReadCanvasCharacterStorageReference(
  db: SqlDatabase,
  input: {
    sessionToken?: string;
    actorScope?: CanvasActorScope;
    storageObjectId: string;
    now: Date;
  },
) {
  const references = await db.query<{
    scope: "canvas" | "global";
    canvas_id: string | null;
    owner_user_id: string;
    principal_key: string | null;
  }>(`
    SELECT DISTINCT character.scope,character.canvas_id,character.owner_user_id,character.principal_key
    FROM canvas_character_asset_references reference
    JOIN canvas_character_assets character ON character.id=reference.character_id
    WHERE reference.storage_object_id=$1
      AND reference.deleted_at IS NULL
      AND character.deleted_at IS NULL
  `, [input.storageObjectId]);
  if (!references.rows.length) return false;
  if (input.actorScope) {
    assertCanvasActorAction(input.actorScope, "view");
    return references.rows.some((reference) => reference.scope === "canvas"
      ? reference.canvas_id === input.actorScope!.canvasId
        && reference.owner_user_id === input.actorScope!.ownerUserId
      : reference.owner_user_id === input.actorScope!.ownerUserId
        && reference.principal_key === input.actorScope!.principalKey);
  }
  const actor = await resolveUserActorContext(db, {
    sessionToken: input.sessionToken ?? "",
    now: input.now,
  });
  const principalKey = actor.teamMember ? `member:${actor.teamMember.id}` : `owner:${actor.userId}`;
  for (const reference of references.rows) {
    if (reference.owner_user_id !== actor.userId) continue;
    if (reference.scope === "global" && reference.principal_key === principalKey) return true;
    if (reference.scope === "canvas" && reference.canvas_id) {
      try {
        await authorizeCanvasActor(db, {
          sessionToken: input.sessionToken ?? "",
          canvasId: reference.canvas_id,
          action: "view",
          now: input.now,
        });
        return true;
      } catch (error) {
        if (!(error instanceof CanvasAuthorizationError)) throw error;
      }
    }
  }
  return false;
}

export async function buildSignedObjectUrls(
  db: SqlDatabase,
  input: {
    sessionToken?: string;
    actorScope?: CanvasActorScope;
    storageObjectId: string;
    adapter: StorageAdapter;
    now: Date;
    expiresInSeconds: number;
    publicBaseUrl?: string | null;
    region?: string | null;
  },
) {
  const signed = await createSignedReadUrl(db, input);
  return {
    storageObjectId: signed.object.id,
    bucket: signed.object.bucket,
    objectKey: signed.object.objectKey,
    previewUrl: signed.url,
    sourceUrl: signed.url,
    downloadUrl: signed.url,
    expiresAt: signed.expiresAt,
  };
}

export async function findStorageObject(
  db: SqlDatabase,
  storageObjectId: string,
): Promise<StorageObjectRecord | undefined> {
  const row = await queryOne<StorageObjectRow>(
    db,
    "SELECT * FROM storage_objects WHERE id = $1",
    [storageObjectId],
  );

  return row ? storageObjectFromRow(row) : undefined;
}

export async function findStorageObjectByKey(
  db: SqlDatabase,
  input: {
    userId: string;
    objectKey: string;
  },
): Promise<StorageObjectRecord | undefined> {
  const row = await queryOne<StorageObjectRow>(
    db,
    `
      SELECT *
      FROM storage_objects
      WHERE created_by_user_id = $1
        AND object_key = $2
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [input.userId, input.objectKey],
  );

  return row ? storageObjectFromRow(row) : undefined;
}

export async function markStorageObjectAvailable(
  db: SqlDatabase,
  input: {
    storageObjectId: string;
    sizeBytes?: number | null;
    checksum?: string | null;
    etag?: string | null;
    versionId?: string | null;
    contentType?: string | null;
    metadata?: Record<string, unknown>;
    now: Date;
  },
): Promise<StorageObjectRecord | undefined> {
  const row = await queryOne<StorageObjectRow>(
    db,
    `
      UPDATE storage_objects
      SET content_type = COALESCE($2, content_type),
          size_bytes = COALESCE($3, size_bytes),
          checksum = COALESCE($4, checksum),
          etag = COALESCE($5, etag),
          version_id = COALESCE($6, version_id),
          metadata_json = COALESCE($7::jsonb, metadata_json),
          status = 'available',
          last_verified_at = $8
      WHERE id = $1
      RETURNING *
    `,
    [
      input.storageObjectId,
      input.contentType ?? null,
      input.sizeBytes ?? null,
      input.checksum ?? null,
      input.etag ?? null,
      input.versionId ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.now,
    ],
  );

  return row ? storageObjectFromRow(row) : undefined;
}

export async function markStorageObjectFailed(
  db: SqlDatabase,
  input: {
    storageObjectId: string;
    status: Extract<StorageObjectStatus, "failed" | "delete_failed" | "deleted">;
    now: Date;
  },
) {
  const row = await queryOne<StorageObjectRow>(
    db,
    `
      UPDATE storage_objects
      SET status = $2,
          deleted_at = CASE WHEN $2 = 'deleted' THEN $3 ELSE deleted_at END,
          last_verified_at = $3
      WHERE id = $1
      RETURNING *
    `,
    [input.storageObjectId, input.status, input.now],
  );

  return row ? storageObjectFromRow(row) : undefined;
}

export async function deleteStorageObjectRecord(
  db: SqlDatabase,
  input: {
    storageObjectId: string;
    adapter: StorageAdapter;
    localObjectStore?: {
      deleteObject(input: { bucket: string; objectKey: string }): Promise<void>;
    } | null;
    now: Date;
  },
) {
  const object = await findStorageObject(db, input.storageObjectId);
  if (!object) {
    throw new StorageAccessError("storage_object_not_found");
  }

  try {
    if (object.status !== "deleted") {
      const deleteObject =
        typeof input.adapter.deleteObject === "function"
          ? input.adapter.deleteObject.bind(input.adapter)
          : typeof input.localObjectStore?.deleteObject === "function"
            ? input.localObjectStore.deleteObject.bind(input.localObjectStore)
            : null;
      if (deleteObject) {
        await deleteObject({
          bucket: object.bucket,
          objectKey: object.objectKey,
        });
      }
    }
    return markStorageObjectFailed(db, {
      storageObjectId: input.storageObjectId,
      status: "deleted",
      now: input.now,
    });
  } catch {
    return markStorageObjectFailed(db, {
      storageObjectId: input.storageObjectId,
      status: "delete_failed",
      now: input.now,
    });
  }
}

async function assertStorageScope(
  db: SqlDatabase,
  input: {
    userId: string;
    projectId: string | null;
    canvasProjectId: string | null;
  },
) {
  if (input.projectId && input.canvasProjectId) {
    throw new StorageAccessError("invalid_storage_scope");
  }
  if (input.canvasProjectId) {
    const canvas = await queryOne<CanvasScopeRow>(
      db,
      "SELECT created_by_user_id FROM creator_canvas_projects WHERE id = $1 AND deleted_at IS NULL",
      [input.canvasProjectId],
    );
    if (!canvas || canvas.created_by_user_id !== input.userId) {
      throw new StorageAccessError("invalid_storage_scope");
    }
    return;
  }
  if (input.projectId) {
    const project = await queryOne<ProjectScopeRow>(
      db,
      "SELECT owner_user_id FROM projects WHERE id = $1",
      [input.projectId],
    );

    if (!project || project.owner_user_id !== input.userId) {
      throw new StorageAccessError("invalid_storage_scope");
    }
    return;
  }

  const user = await queryOne<{ id: string }>(
    db,
    "SELECT id FROM users WHERE id = $1 AND status = 'active'",
    [input.userId],
  );

  if (!user) {
    throw new StorageAccessError("invalid_storage_scope");
  }
}

function buildScopedObjectKey(input: {
  projectId: string | null;
  objectId: string;
  objectName: string;
  now: Date;
}) {
  const safeName = sanitizeObjectName(input.objectName);
  const rootPrefix = sanitizeStorageFolderName(
    process.env.STORAGE_OBJECT_ROOT_PREFIX?.trim() || "AIManhuaDrama",
  );
  const dateFolder = formatStorageDateFolder(
    input.now,
    process.env.STORAGE_OBJECT_DATE_TIMEZONE?.trim() || "Asia/Shanghai",
  );

  return [
    rootPrefix,
    dateFolder,
    `${input.objectId}-${safeName}`,
  ].join("/");
}

function buildGenerationStorageObjectId(taskId: string, attemptId: string | null) {
  const hex = createHash("sha256")
    .update(`generation-artifact\0${taskId}\0${attemptId ?? ""}`)
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function buildGenerationObjectKey(input: { objectId: string; objectName: string }) {
  const rootPrefix = sanitizeStorageFolderName(
    process.env.STORAGE_OBJECT_ROOT_PREFIX?.trim() || "AIManhuaDrama",
  );
  return [
    rootPrefix,
    "generation",
    `${input.objectId}-${sanitizeObjectName(input.objectName)}`,
  ].join("/");
}

function sanitizeObjectName(objectName: string) {
  const basename = objectName.trim().split(/[\\/]/).filter(Boolean).at(-1) ?? "";
  const safeName = basename.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");

  if (!safeName || /^https?:/i.test(objectName)) {
    throw new StorageAccessError("invalid_object_name");
  }

  return safeName;
}

function sanitizeStorageFolderName(folderName: string) {
  const safeName = folderName.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return safeName || "AIManhuaDrama";
}

function formatStorageDateFolder(now: Date, timeZone: string) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find((part) => part.type === "year")?.value ?? "1970";
    const month = parts.find((part) => part.type === "month")?.value ?? "01";
    const day = parts.find((part) => part.type === "day")?.value ?? "01";
    return `${year}${month}${day}`;
  } catch {
    const year = now.getUTCFullYear();
    const month = `${now.getUTCMonth() + 1}`.padStart(2, "0");
    const day = `${now.getUTCDate()}`.padStart(2, "0");
    return `${year}${month}${day}`;
  }
}

function storageObjectFromRow(row: StorageObjectRow): StorageObjectRecord {
  return {
    id: row.id,
    userId: row.created_by_user_id,
    projectId: row.project_id,
    ...(row.canvas_project_id ? { canvasProjectId: row.canvas_project_id } : {}),
    bucket: row.bucket,
    objectKey: row.object_key,
    contentType: row.content_type,
    sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    checksum: row.checksum,
    provider: row.provider,
    status: row.status,
    etag: row.etag,
    versionId: row.version_id,
    lastVerifiedAt: row.last_verified_at,
    deletedAt: row.deleted_at,
    metadata: row.metadata_json,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}
