import { createHash, randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";

import pg from "pg";

import { createStorageAdapterFromEnv } from "../apps/backend/src/modules/storage/storage-adapter.factory.ts";

const apply = process.argv.includes("--apply");
const promptIdArgument = process.argv.find((argument) => argument.startsWith("--prompt-id="));
const promptId = promptIdArgument?.slice("--prompt-id=".length).trim();
if (!promptId) throw new Error("--prompt-id is required");
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("PostgreSQL connection failed: DATABASE_URL is required");

const storageMode = process.env.STORAGE_ADAPTER_MODE?.trim();
if (!storageMode || storageMode === "dev") {
  throw new Error("Cloud storage connection failed: STORAGE_ADAPTER_MODE must select cloud storage");
}

const bucket = process.env.STORAGE_BUCKET?.trim();
const region = process.env.STORAGE_REGION?.trim();
if (!bucket) throw new Error("Cloud storage connection failed: STORAGE_BUCKET is required");
if (!region) throw new Error("Cloud storage connection failed: STORAGE_REGION is required");

const publicBaseUrl = (
  process.env.STORAGE_PUBLIC_BASE_URL?.trim()
  || process.env.STORAGE_ENDPOINT?.trim()
  || (storageMode === "cos" ? `https://${bucket}.cos.${region}.myqcloud.com` : "")
).replace(/\/+$/g, "");
if (!publicBaseUrl) {
  throw new Error("Cloud storage URL failed: STORAGE_PUBLIC_BASE_URL or STORAGE_ENDPOINT is required");
}

const rootPrefix = (process.env.STORAGE_OFFICIAL_ASSET_ROOT_PREFIX?.trim() || "officialAssets")
  .replace(/^\/+|\/+$/g, "");
const localRoot = join(process.cwd(), "apps", "admin", "assets", "prompt-covers");
const adapter = createStorageAdapterFromEnv(process.env);
const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();
  const result = await client.query(`
    SELECT id, name, cover_image_url
    FROM prompts
    WHERE id = $1
      AND prompt_category = 'image_style'
      AND is_official = true
      AND deleted_at IS NULL
      AND cover_image_url LIKE '/admin/assets/prompt-covers/%'
  `, [promptId]);

  const mappings = [];
  for (const row of result.rows) {
    const actualFileName = basename(row.cover_image_url);
    const localPath = join(localRoot, actualFileName);
    const fileStat = await stat(localPath);
    if (!fileStat.isFile()) throw new Error(`Local cover is not a file: ${localPath}`);
    const objectKey = `${rootPrefix}/promptCovers/officialStyles/${actualFileName}`;
    mappings.push({ ...row, localPath, actualFileName, objectKey, publicUrl: `${publicBaseUrl}/${objectKey}` });
  }

  if (!mappings.length) {
    throw new Error("Official prompt cover was not found or is already migrated");
  } else if (!apply) {
    console.log(`Dry run: ${mappings.length} official prompt cover is ready for migration.`);
    for (const [index, item] of mappings.entries()) {
      console.log(`[${index + 1}/${mappings.length}] ${item.name} -> ${item.publicUrl}`);
    }
    console.log("Run again with --apply to upload and update the database.");
  } else {
    for (const [index, item] of mappings.entries()) {
      const bytes = await readFile(item.localPath);
      const checksum = createHash("sha256").update(bytes).digest("hex");
      const uploaded = await adapter.putObject?.({
        bucket,
        objectKey: item.objectKey,
        body: bytes,
        contentType: "image/webp",
        contentLength: bytes.byteLength,
      });
      if (!uploaded) throw new Error("Cloud storage upload failed: configured adapter does not support putObject");

      const head = await adapter.headObject?.({ bucket, objectKey: item.objectKey });
      if (!head?.exists || Number(head.contentLength) !== bytes.byteLength) {
        throw new Error(`Cloud storage verification failed for ${item.code} using STORAGE_BUCKET`);
      }

      const publicResponse = await fetch(item.publicUrl, { method: "GET", headers: { range: "bytes=0-0" } });
      if (!publicResponse.ok) {
        throw new Error(`Public URL verification failed for ${item.code} using STORAGE_ENDPOINT (${publicResponse.status})`);
      }
      await publicResponse.body?.cancel();

      await client.query("BEGIN");
      try {
        const storageObjectId = randomUUID();
        const stored = await client.query(
          `
            INSERT INTO storage_objects (
              id, bucket, object_key, content_type, size_bytes, checksum, metadata_json,
              provider, status, etag, version_id, last_verified_at
            )
            VALUES ($1, $2, $3, 'image/webp', $4, $5, $6::jsonb, $7, 'available', $8, $9, now())
            ON CONFLICT (bucket, object_key)
            DO UPDATE SET
              content_type = EXCLUDED.content_type,
              size_bytes = EXCLUDED.size_bytes,
              checksum = EXCLUDED.checksum,
              metadata_json = storage_objects.metadata_json || EXCLUDED.metadata_json,
              provider = EXCLUDED.provider,
              status = 'available',
              etag = EXCLUDED.etag,
              version_id = EXCLUDED.version_id,
              last_verified_at = now(),
              deleted_at = NULL
            RETURNING id
          `,
          [
            storageObjectId,
            bucket,
            item.objectKey,
            bytes.byteLength,
            checksum,
            JSON.stringify({ source: "official_prompt_cover_migration", styleCode: item.code, publicUrl: item.publicUrl }),
            storageMode === "cos" ? "tencent_cos" : "s3_compatible",
            uploaded.eTag ?? null,
            uploaded.versionId ?? null,
          ],
        );
        const trackedStorageObjectId = stored.rows[0].id;

        await client.query(
          `
            UPDATE prompts
            SET cover_image_url = $2,
                cover_storage_object_id = $3,
                updated_at = now()
            WHERE id = $1
              AND prompt_category = 'image_style'
              AND is_official = true
              AND deleted_at IS NULL
          `,
          [item.id, item.publicUrl, trackedStorageObjectId],
        );
        await client.query(
          `
            INSERT INTO project_upload_records (
              id, storage_object_id, page_key, page_url, source_action, file_name,
              object_key, bucket, provider, content_type, size_bytes, public_url,
              status, created_at, completed_at
            )
            SELECT $1, $2, 'admin-image-prompts', '/admin/image-prompt/styles',
              'admin_prompt_cover_migration', $3, $4, $5, $6, 'image/webp', $7, $8,
              'uploaded', now(), now()
            WHERE NOT EXISTS (
              SELECT 1 FROM project_upload_records
              WHERE storage_object_id = $2 AND source_action = 'admin_prompt_cover_migration'
            )
          `,
          [
            randomUUID(),
            trackedStorageObjectId,
            item.actualFileName,
            item.objectKey,
            bucket,
            storageMode === "cos" ? "tencent_cos" : "s3_compatible",
            bytes.byteLength,
            item.publicUrl,
          ],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }

      console.log(`[${index + 1}/${mappings.length}] migrated ${item.name} -> ${item.publicUrl}`);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
