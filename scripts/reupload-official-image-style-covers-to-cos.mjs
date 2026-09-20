import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import pg from "pg";

import { createStorageAdapterFromEnv } from "../apps/backend/src/modules/storage/storage-adapter.factory.ts";

const apply = process.argv.includes("--apply");
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
if (!adapter.putObject || !adapter.headObject) {
  throw new Error("Cloud storage adapter must support putObject and headObject");
}

const dateFolder = formatOfficialAssetStorageDateFolder(
  new Date(),
  process.env.STORAGE_OBJECT_DATE_TIMEZONE?.trim() || "Asia/Shanghai",
);
const client = new pg.Client({ connectionString: databaseUrl });

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function formatOfficialAssetStorageDateFolder(now, timeZone) {
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

function styleCodeFromCoverUrl(coverImageUrl) {
  const value = String(coverImageUrl || "").trim();
  const publicMatch = value.match(/\/api\/public\/style-covers\/([^/?#]+)$/i);
  if (publicMatch?.[1]) return decodeURIComponent(publicMatch[1]);
  const fileMatch = value.match(/\/admin\/assets\/prompt-covers\/([^/?#]+)\.webp$/i);
  if (fileMatch?.[1]) return decodeURIComponent(fileMatch[1]);
  const officialMatch = value.match(/\/officialStyles\/([^/?#]+)\.webp$/i);
  if (officialMatch?.[1]) return decodeURIComponent(officialMatch[1]);
  return "";
}

try {
  await client.connect();
  const result = await client.query(`
    SELECT id, name, cover_image_url, cover_storage_object_id
    FROM prompts
    WHERE prompt_category = 'image_style'
      AND is_official = true
      AND deleted_at IS NULL
    ORDER BY name ASC, id ASC
  `);

  const mappings = [];
  for (const row of result.rows) {
    const styleCode = styleCodeFromCoverUrl(row.cover_image_url);
    if (!styleCode) {
      throw new Error(`Unable to resolve style cover file for ${row.name} (${row.id})`);
    }
    const fileName = `${styleCode}.webp`;
    const localPath = join(localRoot, fileName);
    const bytes = await readFile(localPath);
    const objectKey = `${rootPrefix}/promptCovers/${dateFolder}/${randomUUID()}-${fileName}`;
    mappings.push({
      ...row,
      styleCode,
      fileName,
      localPath,
      bytes,
      checksum: sha256(bytes),
      objectKey,
      publicUrl: `${publicBaseUrl}/${objectKey}`,
    });
  }

  if (!mappings.length) {
    throw new Error("Official image style covers were not found");
  }

  console.log(`${apply ? "Apply" : "Dry run"}: reupload ${mappings.length} official image_style covers to COS.`);
  for (const [index, item] of mappings.entries()) {
    console.log(`[${index + 1}/${mappings.length}] ${item.name} ${item.cover_image_url} -> ${item.publicUrl}`);
  }
  if (!apply) {
    console.log("Run again with --apply to upload and update the database.");
  } else {
    for (const [index, item] of mappings.entries()) {
      const uploaded = await adapter.putObject({
        bucket,
        objectKey: item.objectKey,
        body: item.bytes,
        contentType: "image/webp",
        contentLength: item.bytes.byteLength,
      });
      const head = await adapter.headObject({ bucket, objectKey: item.objectKey });
      if (!head?.exists || Number(head.contentLength) !== item.bytes.byteLength) {
        throw new Error(`Cloud storage verification failed for ${item.name} using STORAGE_BUCKET`);
      }

      const publicResponse = await fetch(item.publicUrl, { method: "GET", headers: { range: "bytes=0-0" } });
      if (!publicResponse.ok) {
        throw new Error(`Public URL verification failed for ${item.name} using STORAGE_ENDPOINT (${publicResponse.status})`);
      }
      await publicResponse.body?.cancel();

      await client.query("BEGIN");
      try {
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
            randomUUID(),
            bucket,
            item.objectKey,
            item.bytes.byteLength,
            item.checksum,
            JSON.stringify({
              source: "official_image_style_cover_reupload",
              styleCode: item.styleCode,
              publicUrl: item.publicUrl,
            }),
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
            SELECT $1, $2, 'admin-image-prompts', '/admin/prompts',
              'admin_image_style_cover_reupload', $3, $4, $5, $6, 'image/webp', $7, $8,
              'uploaded', now(), now()
            WHERE NOT EXISTS (
              SELECT 1 FROM project_upload_records
              WHERE storage_object_id = $2 AND source_action = 'admin_image_style_cover_reupload'
            )
          `,
          [
            randomUUID(),
            trackedStorageObjectId,
            item.fileName,
            item.objectKey,
            bucket,
            storageMode === "cos" ? "tencent_cos" : "s3_compatible",
            item.bytes.byteLength,
            item.publicUrl,
          ],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      console.log(`[${index + 1}/${mappings.length}] uploaded ${item.name} -> ${item.publicUrl}`);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
