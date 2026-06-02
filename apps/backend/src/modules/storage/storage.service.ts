import { randomUUID } from "node:crypto";

import {
  AuthorizationError,
  resolveActorContext,
} from "../organization/actor-context.service.ts";
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
  organizationId: string;
  workspaceId: string | null;
  projectId: string | null;
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
  }): Promise<{ url: string; expiresAt: Date }>;
  putObject?(input: {
    bucket: string;
    objectKey: string;
    body: Uint8Array;
    contentType?: string | null;
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
  deleteObject?(input: {
    bucket: string;
    objectKey: string;
  }): Promise<void>;
}

interface StorageObjectRow {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  project_id: string | null;
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
  organization_id: string;
  workspace_id: string;
}

interface WorkspaceScopeRow {
  organization_id: string;
}

interface OrganizationRow {
  id: string;
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
    organizationId: string;
    workspaceId?: string | null;
    projectId?: string | null;
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
  await assertStorageScope(db, {
    organizationId: input.organizationId,
    workspaceId: input.workspaceId ?? null,
    projectId: input.projectId ?? null,
  });

  const objectId = randomUUID();
  const objectKey = buildScopedObjectKey({
    organizationId: input.organizationId,
    workspaceId: input.workspaceId ?? null,
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
        organization_id,
        workspace_id,
        project_id,
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
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15, $16::jsonb, $17, $18
      )
      RETURNING *
    `,
    [
      objectId,
      input.organizationId,
      input.workspaceId ?? null,
      input.projectId ?? null,
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
      input.createdByUserId ?? null,
      input.now,
    ],
  );

  return storageObjectFromRow(row!);
}

export async function createSignedReadUrl(
  db: SqlDatabase,
  input: {
    sessionToken: string;
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
  if (!object) {
    throw new StorageAccessError("storage_object_not_found");
  }

  const actor = await resolveActorContext(db, {
    sessionToken: input.sessionToken,
    organizationId: object.workspaceId ? undefined : object.organizationId,
    workspaceId: object.workspaceId ?? undefined,
    now: input.now,
  });

  if (actor.organizationId !== object.organizationId) {
    throw new AuthorizationError("membership_missing");
  }

  const expiresAt = new Date(input.now.getTime() + input.expiresInSeconds * 1000);
  const signed = await input.adapter.createSignedReadUrl({
    bucket: object.bucket,
    objectKey: object.objectKey,
    expiresAt,
  });

  return {
    ...signed,
    object,
  };
}

export async function buildSignedObjectUrls(
  db: SqlDatabase,
  input: {
    sessionToken: string;
    storageObjectId: string;
    adapter: StorageAdapter;
    now: Date;
    expiresInSeconds: number;
  },
) {
  const signed = await createSignedReadUrl(db, input);
  const publicBaseUrl =
    process.env.STORAGE_PUBLIC_BASE_URL?.trim().replace(/\/+$/g, "") ||
    process.env.STORAGE_ENDPOINT?.trim().replace(/\/+$/g, "") ||
    "";
  const publicUrl = publicBaseUrl
    ? `${publicBaseUrl}/${signed.object.objectKey}`
    : signed.object.bucket && process.env.STORAGE_REGION?.trim()
      ? `https://${signed.object.bucket}.cos.${process.env.STORAGE_REGION.trim()}.myqcloud.com/${signed.object.objectKey}`
      : signed.url;
  console.log("[storage] buildSignedObjectUrls", {
    storageObjectId: signed.object.id,
    bucket: signed.object.bucket,
    objectKey: signed.object.objectKey,
    adapterUrl: signed.url,
    publicBaseUrl,
    publicUrl,
  });
  return {
    storageObjectId: signed.object.id,
    bucket: signed.object.bucket,
    objectKey: signed.object.objectKey,
    previewUrl: publicUrl,
    sourceUrl: publicUrl,
    downloadUrl: publicUrl,
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
    organizationId: string;
    workspaceId: string | null;
    projectId: string | null;
  },
) {
  if (input.projectId) {
    const project = await queryOne<ProjectScopeRow>(
      db,
      "SELECT organization_id, workspace_id FROM projects WHERE id = $1",
      [input.projectId],
    );

    if (
      !project ||
      project.organization_id !== input.organizationId ||
      project.workspace_id !== input.workspaceId
    ) {
      throw new StorageAccessError("invalid_storage_scope");
    }
    return;
  }

  if (input.workspaceId) {
    const workspace = await queryOne<WorkspaceScopeRow>(
      db,
      "SELECT organization_id FROM workspaces WHERE id = $1",
      [input.workspaceId],
    );

    if (!workspace || workspace.organization_id !== input.organizationId) {
      throw new StorageAccessError("invalid_storage_scope");
    }
    return;
  }

  const organization = await queryOne<OrganizationRow>(
    db,
    "SELECT id FROM organizations WHERE id = $1",
    [input.organizationId],
  );

  if (!organization) {
    throw new StorageAccessError("invalid_storage_scope");
  }
}

function buildScopedObjectKey(input: {
  organizationId: string;
  workspaceId: string | null;
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
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
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
