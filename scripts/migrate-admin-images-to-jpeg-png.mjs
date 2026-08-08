import { createHash, randomUUID } from "node:crypto";
import { basename, extname } from "node:path";

import pg from "pg";

import { normalizeAdminManagedImageUpload } from "../apps/backend/src/entrypoints/phone-auth-dev-server.ts";
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
  || (storageMode === "cos" ? `https://${bucket}.cos.${region}.myqcloud.com` : "")
).replace(/\/+$/g, "");
if (!publicBaseUrl) {
  throw new Error("Cloud storage URL failed: STORAGE_PUBLIC_BASE_URL is required");
}

const rootPrefix = (process.env.STORAGE_OFFICIAL_ASSET_ROOT_PREFIX?.trim() || "officialAssets")
  .replace(/^\/+|\/+$/g, "");
const adapter = createStorageAdapterFromEnv(process.env);
if (!adapter.putObject || !adapter.headObject || !adapter.deleteObject || !adapter.createSignedReadUrl) {
  throw new Error("Cloud storage adapter must support read, upload, verify, and rollback delete operations");
}

const client = new pg.Client({ connectionString: databaseUrl });
const prepared = [];

try {
  await client.connect();
  const candidates = await client.query(
    `
      SELECT id, project_id, canvas_project_id, bucket, object_key, content_type,
             size_bytes, metadata_json, created_by_user_id, provider
      FROM storage_objects
      WHERE object_key LIKE $1
        AND status <> 'deleted'
        AND content_type IN ('image/avif', 'image/webp')
        AND COALESCE(metadata_json->>'imageFormatMigrationStatus', '') <> 'completed'
      ORDER BY object_key ASC
    `,
    [`${rootPrefix}/%`],
  );

  for (const [index, row] of candidates.rows.entries()) {
    if (row.bucket !== bucket) {
      throw new Error(`Storage bucket mismatch for ${row.object_key}`);
    }
    const unsupportedReferences = await countUnsupportedReferences(client, row.id);
    if (unsupportedReferences.length) {
      throw new Error(`Unsupported storage references for ${row.object_key}: ${unsupportedReferences.join(", ")}`);
    }
    const libraryReference = await client.query(
      `SELECT COUNT(*)::int AS count FROM library_asset_versions WHERE storage_object_key = $1 OR preview_url LIKE $2`,
      [row.object_key, `%${row.object_key}%`],
    );
    if (Number(libraryReference.rows[0]?.count ?? 0) > 0) {
      throw new Error(`Library asset reference migration is not supported for ${row.object_key}`);
    }

    const sourceRead = await adapter.createSignedReadUrl({
      bucket,
      objectKey: row.object_key,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    const sourceResponse = await fetch(sourceRead.url);
    if (!sourceResponse.ok) {
      throw new Error(`Cloud storage read failed for ${row.object_key}: HTTP ${sourceResponse.status}`);
    }
    const sourceBytes = new Uint8Array(await sourceResponse.arrayBuffer());
    const normalized = await normalizeAdminManagedImageUpload({
      bytes: sourceBytes,
      fileName: basename(row.object_key),
    });
    const sourceExtension = extname(row.object_key);
    const targetObjectKey = `${sourceExtension ? row.object_key.slice(0, -sourceExtension.length) : row.object_key}${extname(normalized.fileName)}`;
    const targetPublicUrl = `${publicBaseUrl}/${encodeObjectKey(targetObjectKey)}`;
    const existingTarget = await client.query(
      `SELECT id FROM storage_objects WHERE bucket = $1 AND object_key = $2 LIMIT 1`,
      [bucket, targetObjectKey],
    );
    if (existingTarget.rowCount) {
      throw new Error(`Target storage object already exists in database: ${targetObjectKey}`);
    }
    const existingCloudTarget = await adapter.headObject({ bucket, objectKey: targetObjectKey });
    if (existingCloudTarget.exists) {
      throw new Error(`Target storage object already exists in cloud storage: ${targetObjectKey}`);
    }

    prepared.push({ row, normalized, targetObjectKey, targetPublicUrl });
    console.log(
      `[${index + 1}/${candidates.rows.length}] ${row.object_key} -> ${targetObjectKey} (${normalized.contentType})`,
    );
  }

  const jpegCount = prepared.filter((item) => item.normalized.contentType === "image/jpeg").length;
  const pngCount = prepared.length - jpegCount;
  if (!apply) {
    console.log(`Dry run complete: ${prepared.length} images ready, JPEG=${jpegCount}, PNG=${pngCount}.`);
    console.log("Run again with --apply to upload converted objects and update database references.");
  } else {
    let migrated = 0;
    for (const item of prepared) {
      await migrateOne(client, adapter, bucket, item);
      migrated += 1;
      console.log(`[${migrated}/${prepared.length}] migrated ${item.row.object_key} -> ${item.targetObjectKey}`);
    }
    console.log(`Migration complete: ${migrated} images migrated, JPEG=${jpegCount}, PNG=${pngCount}.`);
    console.log("Original AVIF/WebP objects remain in cloud storage and are marked as superseded for rollback.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}

async function migrateOne(client, adapter, bucket, item) {
  const checksum = createHash("sha256").update(item.normalized.bytes).digest("hex");
  const newStorageObjectId = randomUUID();
  let uploaded = false;
  try {
    const uploadResult = await adapter.putObject({
      bucket,
      objectKey: item.targetObjectKey,
      body: item.normalized.bytes,
      contentType: item.normalized.contentType,
      contentLength: item.normalized.bytes.byteLength,
    });
    uploaded = true;
    const head = await adapter.headObject({ bucket, objectKey: item.targetObjectKey });
    if (
      !head.exists
      || head.contentType !== item.normalized.contentType
      || Number(head.contentLength) !== item.normalized.bytes.byteLength
    ) {
      throw new Error(`Cloud storage verification failed for ${item.targetObjectKey}`);
    }
    const verifyResponse = await fetch(item.targetPublicUrl);
    if (!verifyResponse.ok) {
      throw new Error(`Public URL verification failed for ${item.targetObjectKey}: HTTP ${verifyResponse.status}`);
    }
    const verifiedBytes = new Uint8Array(await verifyResponse.arrayBuffer());
    if (createHash("sha256").update(verifiedBytes).digest("hex") !== checksum) {
      throw new Error(`Public URL checksum verification failed for ${item.targetObjectKey}`);
    }

    await client.query("BEGIN");
    try {
      const migratedAt = new Date();
      await client.query(
        `
          INSERT INTO storage_objects (
            id, project_id, canvas_project_id, bucket, object_key, content_type, size_bytes,
            checksum, metadata_json, created_by_user_id, provider, status, etag, version_id,
            last_verified_at, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, 'available', $12, $13, $14, $14)
        `,
        [
          newStorageObjectId,
          item.row.project_id,
          item.row.canvas_project_id,
          bucket,
          item.targetObjectKey,
          item.normalized.contentType,
          item.normalized.bytes.byteLength,
          checksum,
          JSON.stringify({
            ...(item.row.metadata_json ?? {}),
            imageFormatMigrationStatus: "completed",
            sourceStorageObjectId: item.row.id,
            sourceObjectKey: item.row.object_key,
            sourceContentType: item.row.content_type,
            migratedAt: migratedAt.toISOString(),
          }),
          item.row.created_by_user_id,
          item.row.provider,
          uploadResult.eTag ?? head.eTag ?? null,
          uploadResult.versionId ?? head.versionId ?? null,
          migratedAt,
        ],
      );
      await client.query(
        `
          UPDATE prompts
          SET cover_storage_object_id = $2,
              cover_image_url = $3,
              updated_at = now()
          WHERE cover_storage_object_id = $1
             OR cover_image_url LIKE $4
        `,
        [item.row.id, newStorageObjectId, item.targetPublicUrl, `%${item.row.object_key}%`],
      );
      await client.query(
        `
          UPDATE project_upload_records
          SET storage_object_id = $2,
              file_name = $3,
              object_key = $4,
              content_type = $5,
              size_bytes = $6,
              public_url = $7
          WHERE storage_object_id = $1
        `,
        [
          item.row.id,
          newStorageObjectId,
          basename(item.targetObjectKey),
          item.targetObjectKey,
          item.normalized.contentType,
          item.normalized.bytes.byteLength,
          item.targetPublicUrl,
        ],
      );
      await client.query(
        `
          UPDATE storage_objects
          SET metadata_json = metadata_json || $2::jsonb
          WHERE id = $1
        `,
        [
          item.row.id,
          JSON.stringify({
            imageFormatMigrationStatus: "completed",
            supersededByStorageObjectId: newStorageObjectId,
            supersededByObjectKey: item.targetObjectKey,
            supersededAt: migratedAt.toISOString(),
          }),
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    if (uploaded) {
      await adapter.deleteObject({ bucket, objectKey: item.targetObjectKey }).catch(() => undefined);
    }
    throw error;
  }
}

async function countUnsupportedReferences(client, storageObjectId) {
  const relations = await client.query(
    `
      SELECT tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'storage_objects'
        AND tc.table_schema = current_schema()
        AND tc.table_name NOT IN ('prompts', 'project_upload_records')
    `,
  );
  const referenced = [];
  for (const relation of relations.rows) {
    const tableName = quoteIdentifier(relation.table_name);
    const columnName = quoteIdentifier(relation.column_name);
    const result = await client.query(
      `SELECT COUNT(*)::int AS count FROM ${tableName} WHERE ${columnName} = $1`,
      [storageObjectId],
    );
    const count = Number(result.rows[0]?.count ?? 0);
    if (count > 0) referenced.push(`${relation.table_name}.${relation.column_name}=${count}`);
  }
  return referenced;
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function encodeObjectKey(value) {
  return String(value).split("/").map(encodeURIComponent).join("/");
}
