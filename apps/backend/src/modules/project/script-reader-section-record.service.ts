import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";

export interface ScriptReaderSectionRecord {
  id: string;
  organizationId: string;
  projectId: string;
  scriptId: string | null;
  episodeId: string | null;
  title: string;
  body: string;
  sequence: number;
  status: "draft" | "ready" | "archived";
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ScriptReaderSectionRow {
  id: string;
  organization_id: string;
  project_id: string;
  script_id: string | null;
  episode_id: string | null;
  title: string;
  body: string;
  sequence: number | string;
  status: ScriptReaderSectionRecord["status"];
  created_by_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export async function listScriptReaderSectionsForProject(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    scriptId?: string | null;
  },
): Promise<ScriptReaderSectionRecord[]> {
  const result = await db.query<ScriptReaderSectionRow>(
    `
      SELECT *
      FROM script_reader_sections
      WHERE organization_id = $1
        AND project_id = $2
        AND ($3::uuid IS NULL OR script_id = $3::uuid)
        AND status <> 'archived'
      ORDER BY sequence ASC, created_at ASC, id ASC
    `,
    [input.organizationId, input.projectId, input.scriptId ?? null],
  );

  return result.rows.map(scriptReaderSectionFromRow);
}

export async function ensureScriptReaderSectionsForProject(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    scriptId?: string | null;
    createdByUserId: string;
    now: Date;
  },
): Promise<ScriptReaderSectionRecord[]> {
  const existing = await listScriptReaderSectionsForProject(db, input);
  if (existing.length) {
    return existing;
  }

  const episodes = (
    await db.query<{
      id: string;
      title: string;
      sequence: number | string;
    }>(
      `
        SELECT id, title, sequence
        FROM episodes
        WHERE organization_id = $1
          AND project_id = $2
          AND status <> 'archived'
        ORDER BY sequence ASC, created_at ASC, id ASC
      `,
      [input.organizationId, input.projectId],
    )
  ).rows;

  const script = (
    await db.query<{ id: string; input_text: string }>(
      `
        SELECT id, input_text
        FROM scripts
        WHERE organization_id = $1
          AND project_id = $2
          AND ($3::uuid IS NULL OR id = $3::uuid)
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      [input.organizationId, input.projectId, input.scriptId ?? null],
    )
  ).rows[0] ?? null;

  if (episodes.length) {
    for (const episode of episodes) {
      await insertScriptReaderSection(db, {
        organizationId: input.organizationId,
        projectId: input.projectId,
        scriptId: script?.id ?? input.scriptId ?? null,
        episodeId: episode.id,
        title: episode.title,
        body: defaultScriptReaderBody(input.projectId),
        sequence: Number(episode.sequence),
        createdByUserId: input.createdByUserId,
        now: input.now,
      });
    }
  } else {
    await insertScriptReaderSection(db, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      scriptId: script?.id ?? input.scriptId ?? null,
      episodeId: null,
      title: "第1章 迷雾",
      body: script?.input_text?.trim() || defaultScriptReaderBody(input.projectId),
      sequence: 1,
      createdByUserId: input.createdByUserId,
      now: input.now,
    });
  }

  return listScriptReaderSectionsForProject(db, input);
}

export async function createScriptReaderSection(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    scriptId?: string | null;
    episodeId?: string | null;
    title: string;
    body?: string | null;
    createdByUserId: string;
    now: Date;
  },
): Promise<ScriptReaderSectionRecord> {
  const sequence = await getNextScriptReaderSectionSequence(db, input);
  const id = await insertScriptReaderSection(db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    scriptId: input.scriptId ?? null,
    episodeId: input.episodeId ?? null,
    title: input.title,
    body: input.body ?? "",
    sequence,
    createdByUserId: input.createdByUserId,
    now: input.now,
  });
  return (await findScriptReaderSection(db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    sectionId: id,
  }))!;
}

export async function updateScriptReaderSection(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    sectionId: string;
    title?: string | null;
    body?: string | null;
    status?: ScriptReaderSectionRecord["status"] | null;
    now: Date;
  },
): Promise<ScriptReaderSectionRecord | null> {
  const result = await db.query<ScriptReaderSectionRow>(
    `
      UPDATE script_reader_sections
      SET title = COALESCE(NULLIF($4, ''), title),
          body = COALESCE($5, body),
          status = COALESCE($6, status),
          updated_at = $7
      WHERE organization_id = $1
        AND project_id = $2
        AND id = $3
      RETURNING *
    `,
    [
      input.organizationId,
      input.projectId,
      input.sectionId,
      input.title?.trim() ?? null,
      input.body ?? null,
      input.status ?? null,
      input.now,
    ],
  );

  return result.rows[0] ? scriptReaderSectionFromRow(result.rows[0]) : null;
}

export async function deleteScriptReaderSection(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    sectionId: string;
  },
): Promise<boolean> {
  const result = await db.query<{ id: string }>(
    `
      DELETE FROM script_reader_sections
      WHERE organization_id = $1
        AND project_id = $2
        AND id = $3
      RETURNING id
    `,
    [input.organizationId, input.projectId, input.sectionId],
  );

  return Boolean(result.rows[0]);
}

async function findScriptReaderSection(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    sectionId: string;
  },
) {
  const result = await db.query<ScriptReaderSectionRow>(
    `
      SELECT *
      FROM script_reader_sections
      WHERE organization_id = $1
        AND project_id = $2
        AND id = $3
      LIMIT 1
    `,
    [input.organizationId, input.projectId, input.sectionId],
  );
  return result.rows[0] ? scriptReaderSectionFromRow(result.rows[0]) : null;
}

async function insertScriptReaderSection(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    scriptId: string | null;
    episodeId: string | null;
    title: string;
    body: string;
    sequence: number;
    createdByUserId: string;
    now: Date;
  },
) {
  const id = randomUUID();
  await db.query(
    `
      INSERT INTO script_reader_sections (
        id, organization_id, project_id, script_id, episode_id, title, body,
        sequence, status, created_by_user_id, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9, $10, $10)
    `,
    [
      id,
      input.organizationId,
      input.projectId,
      input.scriptId,
      input.episodeId,
      input.title.trim() || `新增剧情 ${input.sequence}`,
      input.body,
      input.sequence,
      input.createdByUserId,
      input.now,
    ],
  );
  return id;
}

async function getNextScriptReaderSectionSequence(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
  },
) {
  const row = (
    await db.query<{ next_sequence: number }>(
      `
        SELECT COALESCE(MAX(sequence), 0)::int + 1 AS next_sequence
        FROM script_reader_sections
        WHERE organization_id = $1
          AND project_id = $2
      `,
      [input.organizationId, input.projectId],
    )
  ).rows[0];

  return row?.next_sequence ?? 1;
}

function defaultScriptReaderBody(projectId: string) {
  return `待上传剧本：${projectId}。请在项目详情中通过剧本上传、剧本库或分镜单上传补充正式素材。`;
}

function scriptReaderSectionFromRow(row: ScriptReaderSectionRow): ScriptReaderSectionRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    scriptId: row.script_id,
    episodeId: row.episode_id,
    title: row.title,
    body: row.body,
    sequence: Number(row.sequence),
    status: row.status,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
