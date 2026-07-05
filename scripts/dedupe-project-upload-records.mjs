import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createDevDb } from "../apps/backend/src/modules/shared/db/dev-db.ts";
import { queryOne } from "../apps/backend/src/modules/shared/db/sql.ts";

export async function dedupeProjectUploadRecords(input) {
  const batchSize = Math.max(1, Number(input.batchSize ?? 500));
  const dryRun = Boolean(input.dryRun);
  const duplicateRows = await input.db.query(
    `
      WITH duplicate_sessions AS (
        SELECT upload_session_id
        FROM project_upload_records
        WHERE upload_session_id IS NOT NULL
        GROUP BY upload_session_id
        HAVING COUNT(*) > 1
        ORDER BY upload_session_id ASC
        LIMIT $1
      )
      SELECT
        pur.upload_session_id,
        pur.id,
        ROW_NUMBER() OVER (
          PARTITION BY pur.upload_session_id
          ORDER BY
            CASE
              WHEN pur.status = 'uploaded' THEN 2
              WHEN pur.completed_at IS NOT NULL OR pur.public_url IS NOT NULL THEN 1
              ELSE 0
            END DESC,
            COALESCE(pur.completed_at, pur.created_at) DESC,
            pur.created_at DESC,
            pur.id DESC
        ) AS keep_rank,
        COALESCE(pur.completed_at, pur.created_at) AS effective_at,
        pur.created_at
      FROM project_upload_records pur
      INNER JOIN duplicate_sessions ds
        ON ds.upload_session_id = pur.upload_session_id
      ORDER BY
        pur.upload_session_id ASC,
        COALESCE(pur.completed_at, pur.created_at) ASC,
        pur.created_at ASC,
        pur.id ASC
    `,
    [batchSize],
  );

  const sessions = [];
  const deleteRecordIds = [];
  let currentSession = null;
  for (const row of duplicateRows.rows) {
    if (!currentSession || currentSession.uploadSessionId !== row.upload_session_id) {
      currentSession = {
        uploadSessionId: row.upload_session_id,
        keepRecordId: null,
        deletedRecordIds: [],
      };
      sessions.push(currentSession);
    }
    if (Number(row.keep_rank) === 1) {
      currentSession.keepRecordId = row.id;
      continue;
    }
    currentSession.deletedRecordIds.push(row.id);
    deleteRecordIds.push(row.id);
  }

  if (!dryRun && deleteRecordIds.length > 0) {
    await input.db.query(
      `
        DELETE FROM project_upload_records
        WHERE id = ANY($1::uuid[])
      `,
      [deleteRecordIds],
    );
  }

  const remaining = await queryOne(
    input.db,
    `
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT upload_session_id
        FROM project_upload_records
        WHERE upload_session_id IS NOT NULL
        GROUP BY upload_session_id
        HAVING COUNT(*) > 1
      ) duplicate_sessions
    `,
  );

  return {
    dryRun,
    processedSessions: sessions.length,
    deletedRecords: deleteRecordIds.length,
    remainingSessions: Number(remaining?.count ?? 0),
    sessions,
  };
}

function parseCliArgs(argv) {
  const dryRun = argv.includes("--dry-run");
  const batchArg = argv.find((arg) => arg.startsWith("--batch-size="));
  const batchSize = batchArg ? Number(batchArg.split("=")[1]) : 1000;
  return { dryRun, batchSize };
}

function loadDotEnvFile(envFilePath = ".env") {
  if (!existsSync(envFilePath)) return;
  const content = readFileSync(envFilePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function main() {
  loadDotEnvFile();
  const db = await createDevDb();
  try {
    const args = parseCliArgs(process.argv.slice(2));
    const result = await dedupeProjectUploadRecords({
      db,
      dryRun: args.dryRun,
      batchSize: args.batchSize,
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await db.close?.();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
