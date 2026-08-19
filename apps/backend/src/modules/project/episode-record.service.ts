import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";

export interface EpisodeRecord {
  id: string;
  projectId: string;
  title: string;
  sequence: number;
  status: "draft" | "ready" | "archived";
  coverImageUrl: string | null;
  coverStorageObjectId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface EpisodeRow {
  id: string;
  project_id: string;
  title: string;
  sequence: number | string;
  status: EpisodeRecord["status"];
  cover_image_url: string | null;
  cover_storage_object_id: string | null;
  created_by_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export class EpisodeGenerationInProgressError extends Error {
  readonly code = "episode_generation_in_progress";

  constructor() {
    super("episode_generation_in_progress");
    this.name = "EpisodeGenerationInProgressError";
  }
}

export async function replaceEpisodesForProject(
  db: SqlDatabase,
  input: {
    projectId: string;
    createdByUserId: string;
    episodes: Array<{
      id?: string;
      title: string;
      sequence: number;
      status?: EpisodeRecord["status"];
    }>;
    now: Date;
  },
): Promise<EpisodeRecord[]> {
  const existingEpisodes = await listEpisodesForProject(db, {
    projectId: input.projectId,
  });
  const episodes = input.episodes.map((episode) => ({
    ...episode,
    id:
      existingEpisodes.find((existing) => existing.id === episode.id)?.id
      ?? existingEpisodes.find((existing) => existing.sequence === episode.sequence)?.id
      ?? episode.id
      ?? randomUUID(),
  }));
  for (const episode of episodes) {
    await insertEpisode(db, {
      projectId: input.projectId,
      createdByUserId: input.createdByUserId,
      id: episode.id,
      title: episode.title,
      sequence: episode.sequence,
      status: episode.status ?? "draft",
      now: input.now,
      replaceExisting: true,
    });
  }
  await db.query(
    `
      DELETE FROM episodes
      WHERE project_id = $1
        AND NOT (id = ANY($2::uuid[]))
    `,
    [input.projectId, episodes.map((episode) => episode.id)],
  );

  return listEpisodesForProject(db, {
    projectId: input.projectId,
  });
}

export async function listEpisodesForProject(
  db: SqlDatabase,
  input: {
    projectId: string;
  },
): Promise<EpisodeRecord[]> {
  const result = await db.query<EpisodeRow>(
    `
      SELECT *
      FROM episodes
      WHERE project_id = $1
      ORDER BY sequence ASC, created_at ASC, id ASC
    `,
    [input.projectId],
  );

  return result.rows.map(episodeFromRow);
}

export async function createEpisodeForProject(
  db: SqlDatabase,
  input: {
    projectId: string;
    title: string;
    createdByUserId: string;
    now: Date;
  },
): Promise<EpisodeRecord> {
  const sequence = await getNextEpisodeSequence(db, input);
  const id = randomUUID();
  await insertEpisode(db, {
    ...input,
    id,
    sequence,
    status: "draft",
  });
  const episodes = await listEpisodesForProject(db, input);
  return episodes.find((episode) => episode.id === id)!;
}

export async function createEpisodeForProjectWithId(
  db: SqlDatabase,
  input: {
    projectId: string;
    episodeId: string;
    title: string;
    createdByUserId: string;
    now: Date;
  },
): Promise<EpisodeRecord> {
  const sequence = await getNextEpisodeSequence(db, input);
  await insertEpisode(db, {
    projectId: input.projectId,
    id: input.episodeId,
    title: input.title,
    sequence,
    status: "draft",
    createdByUserId: input.createdByUserId,
    now: input.now,
  });
  const episodes = await listEpisodesForProject(db, input);
  return episodes.find((episode) => episode.id === input.episodeId)!;
}

export async function updateEpisodeForProject(
  db: SqlDatabase,
  input: {
    projectId: string;
    episodeId: string;
    title?: string | null;
    status?: EpisodeRecord["status"] | null;
    coverImageUrl?: string | null;
    coverStorageObjectId?: string | null;
    now: Date;
  },
): Promise<EpisodeRecord | null> {
  const row = (
    await db.query<EpisodeRow>(
      `
        UPDATE episodes
        SET title = COALESCE(NULLIF($3, ''), title),
            status = COALESCE($4, status),
            cover_image_url = CASE WHEN $7::boolean THEN $5::text ELSE cover_image_url END,
            cover_storage_object_id = CASE WHEN $8::boolean THEN $6::uuid ELSE cover_storage_object_id END,
            updated_at = $9
        WHERE project_id = $1
          AND id = $2
        RETURNING *
      `,
      [
        input.projectId,
        input.episodeId,
        input.title?.trim() ?? null,
        input.status ?? null,
        input.coverImageUrl ?? null,
        input.coverStorageObjectId ?? null,
        input.coverImageUrl !== undefined,
        input.coverStorageObjectId !== undefined,
        input.now,
      ],
    )
  ).rows[0];

  return row ? episodeFromRow(row) : null;
}

export async function deleteEpisodeForProject(
  db: SqlDatabase,
  input: {
    projectId: string;
    episodeId: string;
  },
): Promise<boolean> {
  await db.query("BEGIN");
  try {
    const episode = await db.query<{ id: string }>(
      `
        SELECT id
        FROM episodes
        WHERE project_id = $1
          AND id = $2
        FOR UPDATE
      `,
      [input.projectId, input.episodeId],
    );
    if (!episode.rows[0]) {
      await db.query("COMMIT");
      return false;
    }
    const activeGeneration = await db.query<{ id: string }>(
      `
        SELECT task.id
        FROM ai_generation_task_snapshots snapshot
        JOIN tasks task ON task.id = snapshot.task_id
        WHERE snapshot.episode_id = $1
          AND task.status IN ('queued', 'running', 'cancel_requested', 'result_unknown', 'manual_review_required')
        LIMIT 1
        FOR UPDATE OF task, snapshot
      `,
      [input.episodeId],
    );
    if (activeGeneration.rows[0]) {
      throw new EpisodeGenerationInProgressError();
    }
    await db.query(
      `
        UPDATE ai_generation_task_snapshots
        SET episode_id = NULL,
            updated_at = now()
        WHERE episode_id = $1
      `,
      [input.episodeId],
    );
    await db.query(
      `
        DELETE FROM episode_asset_conversation_threads
        WHERE project_id = $1
          AND episode_id = $2
      `,
      [input.projectId, input.episodeId],
    );
    await db.query(
      `
        DELETE FROM episode_generation_drafts
        WHERE project_id = $1
          AND episode_id = $2
      `,
      [input.projectId, input.episodeId],
    );
    await db.query(
      `
        DELETE FROM export_records
        WHERE project_id = $1
          AND episode_id = $2
      `,
      [input.projectId, input.episodeId],
    );
    await db.query(
      `
        DELETE FROM shot_reference_assets
        WHERE project_id = $1
          AND shot_id IN (
            SELECT id
            FROM shots
            WHERE project_id = $1
              AND episode_id = $2
          )
      `,
      [input.projectId, input.episodeId],
    );
    await db.query(
      `
        DELETE FROM calibration_items
        WHERE shot_id IN (
            SELECT id
            FROM shots
            WHERE project_id = $1
              AND episode_id = $2
          )
      `,
      [input.projectId, input.episodeId],
    );
    await db.query(
      `
        DELETE FROM shots
        WHERE project_id = $1
          AND episode_id = $2
      `,
      [input.projectId, input.episodeId],
    );
    const result = await db.query<{ id: string }>(
      `
        DELETE FROM episodes
        WHERE project_id = $1
          AND id = $2
        RETURNING id
      `,
      [input.projectId, input.episodeId],
    );

    await db.query("COMMIT");
    return Boolean(result.rows[0]);
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function insertEpisode(
  db: SqlDatabase,
  input: {
    projectId: string;
    id: string;
    title: string;
    sequence: number;
    status: EpisodeRecord["status"];
    createdByUserId: string;
    now: Date;
    replaceExisting?: boolean;
  },
) {
  const conflictClause = input.replaceExisting
    ? `ON CONFLICT (id) DO UPDATE
       SET title = EXCLUDED.title,
           sequence = EXCLUDED.sequence,
           status = EXCLUDED.status,
           updated_at = EXCLUDED.updated_at
       WHERE episodes.project_id = EXCLUDED.project_id`
    : "";
  await db.query(
    `
      INSERT INTO episodes (
        id,
        project_id,
        title,
        sequence,
        status,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
      ${conflictClause}
    `,
    [
      input.id,
      input.projectId,
      input.title.trim() || `剧集 ${input.sequence}`,
      input.sequence,
      input.status,
      input.createdByUserId,
      input.now,
    ],
  );
}

async function getNextEpisodeSequence(
  db: SqlDatabase,
  input: {
    projectId: string;
  },
) {
  const row = (
    await db.query<{ next_sequence: number }>(
      `
        SELECT COALESCE(MAX(sequence), 0)::int + 1 AS next_sequence
        FROM episodes
        WHERE project_id = $1
      `,
      [input.projectId],
    )
  ).rows[0];

  return row?.next_sequence ?? 1;
}

function episodeFromRow(row: EpisodeRow): EpisodeRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    sequence: Number(row.sequence),
    status: row.status,
    coverImageUrl: row.cover_image_url,
    coverStorageObjectId: row.cover_storage_object_id,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
