import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createDevDb } from "../apps/backend/src/modules/shared/db/dev-db.ts";
import { queryOne } from "../apps/backend/src/modules/shared/db/sql.ts";
import { buildStorageObjectPublicUrl } from "../apps/backend/src/modules/storage/upload-session.service.ts";
import { ensureProjectUploadRecordForStorageObject } from "../apps/backend/src/modules/project/project-upload-record.service.ts";

export async function backfillProjectUploadRecords(input) {
  const now = input.now ?? new Date();
  const batchSize = Math.max(1, Number(input.batchSize ?? 500));
  const dryRun = Boolean(input.dryRun);
  const rows = await input.db.query(
    `
      SELECT
        so.id,
        so.organization_id,
        so.bucket,
        so.object_key,
        so.content_type,
        so.metadata_json
      FROM storage_objects so
      WHERE so.status IN ('available', 'pending_upload')
        AND so.content_type IS NOT NULL
        AND so.content_type <> ''
        AND (
          so.content_type LIKE 'image/%'
          OR so.content_type LIKE 'video/%'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM project_upload_records pur
          WHERE pur.organization_id = so.organization_id
            AND pur.storage_object_id = so.id
        )
      ORDER BY so.created_at ASC, so.id ASC
      LIMIT $1
    `,
    [batchSize],
  );

  const results = [];
  for (const row of rows.rows) {
    const sourceAction = inferSourceAction({
      objectKey: row.object_key,
      contentType: row.content_type,
      metadata: row.metadata_json ?? {},
    });
    const publicUrl = buildStorageObjectPublicUrl(input.runtime, {
      bucket: row.bucket,
      objectKey: row.object_key,
    });
    if (!dryRun) {
      await ensureProjectUploadRecordForStorageObject(input.db, {
        organizationId: row.organization_id,
        storageObjectId: row.id,
        pageKey: "project",
        sourceAction,
        publicUrl,
        status: "uploaded",
        now,
      });
    }
    results.push({
      storageObjectId: row.id,
      organizationId: row.organization_id,
      sourceAction,
      publicUrl,
    });
  }

  const remaining = await queryOne(
    input.db,
    `
      SELECT COUNT(*)::bigint AS count
      FROM storage_objects so
      WHERE so.status IN ('available', 'pending_upload')
        AND so.content_type IS NOT NULL
        AND so.content_type <> ''
        AND (
          so.content_type LIKE 'image/%'
          OR so.content_type LIKE 'video/%'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM project_upload_records pur
          WHERE pur.organization_id = so.organization_id
            AND pur.storage_object_id = so.id
        )
    `,
  );

  return {
    dryRun,
    processed: results.length,
    remaining: Number(remaining?.count ?? 0),
    records: results,
  };
}

export function inferSourceAction(input) {
  const objectKey = String(input.objectKey || "").toLowerCase();
  const contentType = String(input.contentType || "").toLowerCase();
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  const provider = String(metadata.provider || "").toLowerCase();

  if (provider === "gpt-image-2" || objectKey.includes("/gpt-image-2/") || objectKey.includes("gpt-image-")) {
    return "generate_image";
  }
  if (provider === "seedance" || objectKey.includes("/seedance/") || objectKey.includes("seedance-video-")) {
    return "generate_video";
  }
  if (contentType.startsWith("video/")) {
    return "legacy_upload_video";
  }
  return "legacy_upload_image";
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

function runtimeFromEnv(env) {
  return {
    mode: env.STORAGE_ADAPTER_MODE?.trim() || env.STORAGE_PROVIDER?.trim() || "cos",
    provider: env.STORAGE_PROVIDER?.trim() || "cos",
    bucket: env.STORAGE_BUCKET?.trim() || "",
    region: env.STORAGE_REGION?.trim() || "",
    publicBaseUrl: env.STORAGE_PUBLIC_BASE_URL?.trim() || env.STORAGE_ENDPOINT?.trim() || "",
    adapter: {},
  };
}

async function main() {
  loadDotEnvFile();
  const db = await createDevDb();
  try {
    const args = parseCliArgs(process.argv.slice(2));
    const result = await backfillProjectUploadRecords({
      db,
      runtime: runtimeFromEnv(process.env),
      dryRun: args.dryRun,
      batchSize: args.batchSize,
      now: new Date(),
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
