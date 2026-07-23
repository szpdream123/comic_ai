import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";

export interface ScriptReaderSectionRecord {
  id: string;
  scriptId: string;
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
  script_id: string;
  title: string;
  body: string;
  sequence: number | string;
  status: ScriptReaderSectionRecord["status"];
  created_by_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export async function listScriptReaderSectionsForScript(
  db: SqlDatabase,
  input: {
    scriptId: string;
  },
): Promise<ScriptReaderSectionRecord[]> {
  const result = await db.query<ScriptReaderSectionRow>(
    `
      SELECT *
      FROM script_reader_sections
      WHERE script_id = $1
        AND status <> 'archived'
      ORDER BY sequence ASC, created_at ASC, id ASC
    `,
    [input.scriptId],
  );

  return result.rows.map(scriptReaderSectionFromRow);
}

export async function listScriptReaderSectionsForProject(
  db: SqlDatabase,
  input: {
    projectId: string;
    scriptId?: string | null;
  },
): Promise<ScriptReaderSectionRecord[]> {
  const scriptId = input.scriptId?.trim();
  return scriptId ? listScriptReaderSectionsForScript(db, { scriptId }) : [];
}

export async function ensureScriptReaderSectionsForScript(
  db: SqlDatabase,
  input: {
    scriptId: string;
    createdByUserId: string;
    now: Date;
  },
): Promise<ScriptReaderSectionRecord[]> {
  const existing = await listScriptReaderSectionsForScript(db, input);
  if (existing.length) {
    return existing;
  }

  const script = (
    await db.query<{ id: string; input_text: string }>(
      `
        SELECT id, input_text
        FROM scripts
        WHERE id = $1
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [input.scriptId],
    )
  ).rows[0] ?? null;

  if (!script) return [];
  await insertScriptReaderSection(db, {
    scriptId: input.scriptId,
    title: "第1章 迷雾",
    body: script.input_text?.trim() || defaultScriptReaderBody(),
    sequence: 1,
    createdByUserId: input.createdByUserId,
    now: input.now,
  });

  return listScriptReaderSectionsForScript(db, input);
}

export async function createScriptReaderSection(
  db: SqlDatabase,
  input: {
    scriptId: string;
    title: string;
    body?: string | null;
    createdByUserId: string;
    now: Date;
  },
): Promise<ScriptReaderSectionRecord> {
  const sequence = await getNextScriptReaderSectionSequence(db, input);
  const id = await insertScriptReaderSection(db, {
    scriptId: input.scriptId,
    title: input.title,
    body: input.body ?? "",
    sequence,
    createdByUserId: input.createdByUserId,
    now: input.now,
  });
  return (await findScriptReaderSection(db, {
    scriptId: input.scriptId,
    sectionId: id,
  }))!;
}

export async function updateScriptReaderSection(
  db: SqlDatabase,
  input: {
    scriptId: string;
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
      SET title = COALESCE(NULLIF($3, ''), title),
          body = COALESCE($4, body),
          status = COALESCE($5, status),
          updated_at = $6
      WHERE script_id = $1
        AND id = $2
      RETURNING *
    `,
    [
      input.scriptId,
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
    scriptId: string;
    sectionId: string;
  },
): Promise<boolean> {
  const result = await db.query<{ id: string }>(
    `
      DELETE FROM script_reader_sections
      WHERE script_id = $1
        AND id = $2
      RETURNING id
    `,
    [input.scriptId, input.sectionId],
  );

  return Boolean(result.rows[0]);
}

async function findScriptReaderSection(
  db: SqlDatabase,
  input: {
    scriptId: string;
    sectionId: string;
  },
) {
  const result = await db.query<ScriptReaderSectionRow>(
    `
      SELECT *
      FROM script_reader_sections
      WHERE script_id = $1
        AND id = $2
      LIMIT 1
    `,
    [input.scriptId, input.sectionId],
  );
  return result.rows[0] ? scriptReaderSectionFromRow(result.rows[0]) : null;
}

async function insertScriptReaderSection(
  db: SqlDatabase,
  input: {
    scriptId: string;
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
        id, script_id, title, body,
        sequence, status, created_by_user_id, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $7)
    `,
    [
      id,
      input.scriptId,
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
    scriptId: string;
  },
) {
  const row = (
    await db.query<{ next_sequence: number }>(
      `
        SELECT COALESCE(MAX(sequence), 0)::int + 1 AS next_sequence
        FROM script_reader_sections
        WHERE script_id = $1
      `,
    [input.scriptId],
    )
  ).rows[0];

  return row?.next_sequence ?? 1;
}

function defaultScriptReaderBody() {
  return "待上传剧本。请补充正式素材。";
}

function scriptReaderSectionFromRow(row: ScriptReaderSectionRow): ScriptReaderSectionRecord {
  return {
    id: row.id,
    scriptId: row.script_id,
    title: row.title,
    body: row.body,
    sequence: Number(row.sequence),
    status: row.status,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
