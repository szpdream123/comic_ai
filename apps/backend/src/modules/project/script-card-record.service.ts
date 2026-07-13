import type { SqlDatabase } from "../shared/db/sql.ts";

export interface ScriptCardRecord {
  id: string;
  projectId: string;
  title: string | null;
  coverImageUrl: string | null;
  coverStorageObjectId: string | null;
  deletedAt: Date | null;
  updatedAt: Date;
}

interface ScriptCardRow {
  id: string;
  project_id: string;
  title: string | null;
  cover_image_url: string | null;
  cover_storage_object_id: string | null;
  deleted_at: Date | string | null;
  updated_at: Date | string;
}

export async function updateScriptCardRecord(
  db: SqlDatabase,
  input: {
    projectId: string;
    scriptId: string;
    title?: string | null;
    coverImageUrl?: string | null;
    coverStorageObjectId?: string | null;
    now: Date;
  },
): Promise<ScriptCardRecord | null> {
  const result = await db.query<ScriptCardRow>(
    `
      UPDATE scripts
      SET title = CASE WHEN $3::text IS NULL THEN title ELSE NULLIF($3::text, '') END,
          cover_image_url = COALESCE($4, cover_image_url),
          cover_storage_object_id = COALESCE($5::uuid, cover_storage_object_id),
          updated_at = $6
      WHERE project_id = $1
        AND id = $2
        AND deleted_at IS NULL
      RETURNING id, project_id, title, cover_image_url,
        cover_storage_object_id, deleted_at, updated_at
    `,
    [
      input.projectId,
      input.scriptId,
      input.title?.trim() ?? null,
      input.coverImageUrl ?? null,
      input.coverStorageObjectId ?? null,
      input.now,
    ],
  );

  return result.rows[0] ? scriptCardFromRow(result.rows[0]) : null;
}

export async function deleteScriptCardRecord(
  db: SqlDatabase,
  input: {
    projectId: string;
    scriptId: string;
    now: Date;
  },
): Promise<ScriptCardRecord | null> {
  const result = await db.query<ScriptCardRow>(
    `
      UPDATE scripts
      SET deleted_at = $3,
          updated_at = $3
      WHERE project_id = $1
        AND id = $2
        AND deleted_at IS NULL
      RETURNING id, project_id, title, cover_image_url,
        cover_storage_object_id, deleted_at, updated_at
    `,
    [input.projectId, input.scriptId, input.now],
  );

  return result.rows[0] ? scriptCardFromRow(result.rows[0]) : null;
}

function scriptCardFromRow(row: ScriptCardRow): ScriptCardRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    coverImageUrl: row.cover_image_url,
    coverStorageObjectId: row.cover_storage_object_id,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
    updatedAt: new Date(row.updated_at),
  };
}
