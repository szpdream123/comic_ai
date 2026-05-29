import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";

export const shotReferenceRoles = [
  "character",
  "scene",
  "prop",
  "reference_image",
  "reference_video",
  "reference_audio",
  "first_frame",
  "last_frame",
  "source_video",
  "locked_character",
] as const;

export type ShotReferenceRole = (typeof shotReferenceRoles)[number];

export interface ShotReferenceRecord {
  id: string;
  organizationId: string;
  projectId: string;
  shotId: string;
  assetId: string;
  assetVersionId: string | null;
  role: ShotReferenceRole;
  sortOrder: number;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  assetType?: string;
  assetKey?: string;
  label?: unknown;
  storageObjectId?: string | null;
  previewUrl?: string | null;
}

interface ShotReferenceRow {
  id: string;
  organization_id: string;
  project_id: string;
  shot_id: string;
  asset_id: string;
  asset_version_id: string | null;
  reference_role: ShotReferenceRole;
  sort_order: number | string;
  created_by_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  asset_type?: string;
  asset_key?: string;
  metadata_json?: Record<string, unknown> | null;
  storage_object_id?: string | null;
  storage_object_key?: string | null;
}

export async function replaceShotReferencesForShot(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    shotId: string;
    createdByUserId: string;
    items: Array<{
      role: string;
      assetId: string;
      assetVersionId?: string | null;
      sortOrder?: number | null;
    }>;
    now: Date;
  },
): Promise<ShotReferenceRecord[]> {
  validateReferenceItems(input.items);

  await db.query("BEGIN");
  try {
    await db.query(
      `
        DELETE FROM shot_reference_assets
        WHERE organization_id = $1
          AND project_id = $2
          AND shot_id = $3
      `,
      [input.organizationId, input.projectId, input.shotId],
    );

    for (const [index, item] of input.items.entries()) {
      await db.query(
        `
          INSERT INTO shot_reference_assets (
            id,
            organization_id,
            project_id,
            shot_id,
            asset_id,
            asset_version_id,
            reference_role,
            sort_order,
            created_by_user_id,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
        `,
        [
          randomUUID(),
          input.organizationId,
          input.projectId,
          input.shotId,
          item.assetId,
          item.assetVersionId ?? null,
          item.role,
          item.sortOrder ?? index,
          input.createdByUserId,
          input.now,
        ],
      );
    }

    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }

  return listShotReferencesForProject(db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    shotId: input.shotId,
  });
}

export async function listShotReferencesForProject(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    shotId?: string | null;
  },
): Promise<ShotReferenceRecord[]> {
  const result = await db.query<ShotReferenceRow>(
    `
      SELECT
        r.*,
        a.asset_type,
        a.asset_key,
        COALESCE(selected_version.metadata_json, latest_version.metadata_json) AS metadata_json,
        COALESCE(selected_version.storage_object_id, latest_version.storage_object_id) AS storage_object_id,
        COALESCE(selected_version.storage_object_key, latest_version.storage_object_key) AS storage_object_key
      FROM shot_reference_assets r
      JOIN assets a
        ON a.organization_id = r.organization_id
       AND a.id = r.asset_id
      LEFT JOIN asset_versions selected_version
        ON selected_version.organization_id = r.organization_id
       AND selected_version.id = r.asset_version_id
      LEFT JOIN LATERAL (
        SELECT *
        FROM asset_versions
        WHERE organization_id = r.organization_id
          AND asset_id = r.asset_id
        ORDER BY version_number DESC
        LIMIT 1
      ) latest_version ON true
      WHERE r.organization_id = $1
        AND r.project_id = $2
        AND ($3::uuid IS NULL OR r.shot_id = $3::uuid)
      ORDER BY r.shot_id ASC, r.sort_order ASC, r.created_at ASC
    `,
    [input.organizationId, input.projectId, input.shotId ?? null],
  );

  return result.rows.map(referenceFromRow);
}

function validateReferenceItems(
  items: Array<{
    role: string;
    assetId: string;
    assetVersionId?: string | null;
    sortOrder?: number | null;
  }>,
) {
  const allowedRoles = new Set<string>(shotReferenceRoles);
  for (const item of items) {
    if (!allowedRoles.has(item.role)) {
      throw new Error("invalid_shot_reference_role");
    }
    if (!item.assetId?.trim()) {
      throw new Error("invalid_shot_reference_asset");
    }
  }
}

function referenceFromRow(row: ShotReferenceRow): ShotReferenceRecord {
  const metadata = normalizeMetadata(row.metadata_json);
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    shotId: row.shot_id,
    assetId: row.asset_id,
    assetVersionId: row.asset_version_id,
    role: row.reference_role,
    sortOrder: Number(row.sort_order),
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    assetType: row.asset_type,
    assetKey: row.asset_key,
    label: metadata?.label ?? row.asset_key,
    storageObjectId: row.storage_object_id ?? null,
    previewUrl: getPreviewUrl(row.storage_object_key ?? null, metadata),
  };
}

function normalizeMetadata(value: Record<string, unknown> | null | undefined) {
  return value ?? null;
}

function getPreviewUrl(
  storageObjectKey: string | null,
  metadata: Record<string, unknown> | null,
) {
  const previewUrl = metadata?.previewUrl ?? metadata?.sourceUrl;
  if (typeof previewUrl === "string" && previewUrl.trim()) {
    return previewUrl;
  }
  if (typeof storageObjectKey === "string" && storageObjectKey.startsWith("data:")) {
    return storageObjectKey;
  }
  return null;
}
