import { createHash, randomUUID } from "node:crypto";
import { copyFile, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import pg from "pg";

import { defaultImagePromptStyles } from "../apps/backend/src/modules/admin-image-prompts/admin-image-prompt.service.ts";
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
const runtimeAssets = join(process.cwd(), "apps", "web", "ai-canvas-runtime", "assets");
const localCoverRoot = join(process.cwd(), "apps", "admin", "assets", "prompt-covers");
const adapter = createStorageAdapterFromEnv(process.env);
const client = new pg.Client({ connectionString: databaseUrl });

const STYLE_FILES = {
  realistic: "realistic-T7GbmowT.webp",
  anime: "anime-3z5pbFBr.webp",
  watercolor: "watercolor-p2lZGE99.webp",
  "oil-painting": "oil-painting-fORh04KK.webp",
  bewitching: "bewitching-r66yCk5Z.webp",
  sketch: "sketch-3b1ZD9Q8.webp",
  cyberpunk: "cyberpunk-nJwNA0xN.webp",
  "ink-wash": "ink-wash-r5pPiNKY.webp",
  "pixel-art": "pixel-art-fnqBy2iu.webp",
  "cg-game": "cg-game-eWvqc3R.webp",
  "3d-render": "3d-render-QHp8_bBE.webp",
  "flat-illustration": "flat-illustration-xpHh-jIt.webp",
  cinematic: "cinematic-7TkW3qXw.webp",
  vintage: "vintage-UoKRJRas.webp",
  "3d-guoman": "3d-guoman-hBUWPfEN.webp",
};

async function resolveCoverFile(code) {
  const preferred = STYLE_FILES[code];
  if (preferred) return join(runtimeAssets, preferred);
  const files = await readdir(runtimeAssets);
  const match = files.find((file) => file.startsWith(`${code}-`) && file.endsWith(".webp"));
  if (!match) throw new Error(`Cover file not found for ${code}`);
  return join(runtimeAssets, match);
}

try {
  await client.connect();
  const existing = await client.query(`
    SELECT id, name, is_official
    FROM prompts
    WHERE prompt_category = 'image_style'
      AND deleted_at IS NULL
    ORDER BY is_official DESC, updated_at DESC, id ASC
  `);
  console.log(`Current image_style prompts: ${existing.rows.length}`);
  for (const row of existing.rows) {
    console.log(`  ${row.is_official ? "official" : "private"} ${row.name} ${row.id}`);
  }

  const covers = [];
  for (const style of defaultImagePromptStyles) {
    const sourcePath = await resolveCoverFile(style.code);
    const bytes = await readFile(sourcePath);
    const objectKey = `${rootPrefix}/promptCovers/officialStyles/${style.code}.webp`;
    const localPath = join(localCoverRoot, `${style.code}.webp`);
    covers.push({
      ...style,
      sourcePath,
      localPath,
      objectKey,
      publicUrl: `${publicBaseUrl}/${objectKey}`,
      bytes,
      checksum: createHash("sha256").update(bytes).digest("hex"),
    });
  }

  if (!apply) {
    console.log(`Dry run: replace ${existing.rows.filter((row) => row.is_official).length} official styles with ${covers.length} canvas styles.`);
    for (const cover of covers) {
      console.log(`  ${cover.code} ${cover.name} -> ${cover.publicUrl}`);
    }
    console.log("Run again with --apply to upload covers and rewrite official image_style prompts.");
  } else {
    for (const cover of covers) {
      await copyFile(cover.sourcePath, cover.localPath);
      const uploaded = await adapter.putObject?.({
        bucket,
        objectKey: cover.objectKey,
        body: cover.bytes,
        contentType: "image/webp",
        contentLength: cover.bytes.byteLength,
      });
      if (!uploaded) throw new Error(`Cloud storage upload failed: ${cover.code}`);
      const head = await adapter.headObject?.({ bucket, objectKey: cover.objectKey });
      if (!head?.exists || Number(head.contentLength) !== cover.bytes.byteLength) {
        throw new Error(`Cloud storage verification failed for ${cover.code}`);
      }
      cover.etag = uploaded.eTag ?? null;
      cover.versionId = uploaded.versionId ?? null;
      console.log(`uploaded ${cover.code}`);
    }

    await client.query("BEGIN");
    try {
      await client.query("DELETE FROM prompt_official_defaults WHERE prompt_category = 'image_style'");
      await client.query(`
        DELETE FROM prompt_user_defaults
        WHERE prompt_category = 'image_style'
          AND prompt_id IN (
            SELECT id FROM prompts
            WHERE prompt_category = 'image_style'
              AND is_official = true
              AND deleted_at IS NULL
          )
      `);
      await client.query(`
        UPDATE prompts
        SET status = 'archived',
            is_published = false,
            deleted_at = now(),
            updated_at = now()
        WHERE prompt_category = 'image_style'
          AND is_official = true
          AND deleted_at IS NULL
      `);

      const now = new Date();
      for (const cover of covers) {
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
            cover.objectKey,
            cover.bytes.byteLength,
            cover.checksum,
            JSON.stringify({ source: "official_image_style_replace", styleCode: cover.code, publicUrl: cover.publicUrl }),
            storageMode === "cos" ? "tencent_cos" : "s3_compatible",
            cover.etag,
            cover.versionId,
          ],
        );
        const storageObjectId = stored.rows[0].id;
        await client.query(
          `
            INSERT INTO prompts (
              id, prompt_category, name, summary, cover_image_url, cover_storage_object_id, prompt_content,
              status, is_official, is_published, published_at, created_at, updated_at
            )
            VALUES ($1, 'image_style', $2, $3, $4, $5, $6, 'enabled', true, true, $7, $7, $7)
            ON CONFLICT (id)
            DO UPDATE SET
              name = EXCLUDED.name,
              summary = EXCLUDED.summary,
              cover_image_url = EXCLUDED.cover_image_url,
              cover_storage_object_id = EXCLUDED.cover_storage_object_id,
              prompt_content = EXCLUDED.prompt_content,
              status = 'enabled',
              is_official = true,
              is_published = true,
              published_at = EXCLUDED.published_at,
              deleted_at = NULL,
              updated_at = EXCLUDED.updated_at
          `,
          [
            cover.id,
            cover.name,
            cover.remark || "",
            `/api/public/style-covers/${encodeURIComponent(cover.code)}`,
            storageObjectId,
            cover.prompt_content,
            now,
          ],
        );
      }

      await client.query(
        `
          INSERT INTO prompt_official_defaults (prompt_category, prompt_id, created_at, updated_at)
          VALUES ('image_style', $1, $2, $2)
        `,
        [covers[0].id, now],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    const after = await client.query(`
      SELECT name FROM prompts
      WHERE prompt_category = 'image_style' AND is_official = true AND deleted_at IS NULL
      ORDER BY updated_at DESC, id ASC
    `);
    console.log(`Replaced official image styles: ${after.rows.map((row) => row.name).join(", ")}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
