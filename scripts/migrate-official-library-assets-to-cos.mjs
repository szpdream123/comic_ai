import { readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";

import pg from "pg";

import { createStorageAdapterFromEnv } from "../apps/backend/src/modules/storage/storage-adapter.factory.ts";

const apply = process.argv.includes("--apply");
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("PostgreSQL connection failed: DATABASE_URL is required");

const storageMode = process.env.STORAGE_ADAPTER_MODE?.trim();
if (storageMode !== "cos") {
  throw new Error("Cloud storage connection failed: STORAGE_ADAPTER_MODE must be cos");
}

const bucket = process.env.STORAGE_BUCKET?.trim();
const region = process.env.STORAGE_REGION?.trim();
if (!bucket) throw new Error("Cloud storage connection failed: STORAGE_BUCKET is required");
if (!region) throw new Error("Cloud storage connection failed: STORAGE_REGION is required");

const schemaName = process.env.DATABASE_SCHEMA?.trim() || "public";
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schemaName)) {
  throw new Error("PostgreSQL connection failed: DATABASE_SCHEMA is invalid");
}

const rootPrefix = (process.env.STORAGE_OFFICIAL_ASSET_ROOT_PREFIX?.trim() || "officialAssets")
  .replace(/^\/+|\/+$/g, "");
const localUrlPrefix = "/assets/library/official/";
const localRoot = resolve(process.cwd(), "apps", "web", "assets", "library", "official");
const localRootPrefix = `${localRoot}${process.platform === "win32" ? "\\" : "/"}`;
const adapter = createStorageAdapterFromEnv(process.env);
const client = new pg.Client({ connectionString: databaseUrl });

function officialObjectKey(relativePath) {
  return `${rootPrefix}/library/${relativePath}`;
}

function publicUrlForObject(objectKey) {
  const configuredBaseUrl = process.env.STORAGE_PUBLIC_BASE_URL?.trim();
  if (configuredBaseUrl) {
    const url = new URL(configuredBaseUrl);
    const basePath = url.pathname.replace(/\/+$/g, "");
    url.pathname = `${basePath}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  }
  return `https://${bucket}.cos.${region}.myqcloud.com/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
}

function relativePathFromLocalUrl(value) {
  if (typeof value !== "string" || !value.startsWith(localUrlPrefix)) return null;
  const relativePath = decodeURIComponent(value.slice(localUrlPrefix.length).split(/[?#]/, 1)[0] ?? "");
  if (!relativePath || relativePath.includes("\\") || relativePath.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Invalid official asset URL: ${value}`);
  }
  return relativePath;
}

function contentTypeForPath(path) {
  switch (extname(path).toLowerCase()) {
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".svg": return "image/svg+xml";
    default: throw new Error(`Unsupported official asset file type: ${path}`);
  }
}

function collectLocalUrls(value, urls = new Set()) {
  if (typeof value === "string") {
    if (relativePathFromLocalUrl(value)) urls.add(value);
    return urls;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectLocalUrls(item, urls);
    return urls;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectLocalUrls(item, urls);
  }
  return urls;
}

function replaceLocalUrls(value, urlMap) {
  if (typeof value === "string") return urlMap.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => replaceLocalUrls(item, urlMap));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceLocalUrls(item, urlMap)]));
  }
  return value;
}

function hasLocalUrl(value) {
  return collectLocalUrls(value).size > 0;
}

async function mapWithConcurrency(items, limit, operation) {
  const results = new Array(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await operation(items[index], index);
    }
  }));
  return results;
}

async function buildMappings(rows) {
  const localUrls = new Set();
  for (const row of rows) {
    collectLocalUrls(row.preview_url, localUrls);
    collectLocalUrls(row.metadata_json, localUrls);
  }

  return await Promise.all([...localUrls].sort().map(async (localUrl) => {
    const relativePath = relativePathFromLocalUrl(localUrl);
    const localPath = resolve(localRoot, relativePath);
    if (!localPath.startsWith(localRootPrefix)) {
      throw new Error(`Local official asset resolves outside the approved directory: ${localUrl}`);
    }
    const fileStat = await stat(localPath);
    if (!fileStat.isFile()) throw new Error(`Local official asset is not a file: ${localUrl}`);
    const objectKey = officialObjectKey(relativePath);
    return {
      localUrl,
      localPath,
      objectKey,
      publicUrl: publicUrlForObject(objectKey),
      contentType: contentTypeForPath(relativePath),
      contentLength: fileStat.size,
    };
  }));
}

async function uploadAndVerify(item) {
  const bytes = await readFile(item.localPath);
  const uploaded = await adapter.putObject?.({
    bucket,
    objectKey: item.objectKey,
    body: bytes,
    contentType: item.contentType,
    contentLength: bytes.byteLength,
    cacheControl: "public, max-age=31536000",
  });
  if (!uploaded) throw new Error("Cloud storage upload failed: configured adapter does not support putObject");

  const head = await adapter.headObject?.({ bucket, objectKey: item.objectKey });
  if (!head?.exists || Number(head.contentLength) !== bytes.byteLength) {
    throw new Error(`Cloud storage verification failed for ${item.localUrl}`);
  }

  const response = await fetch(item.publicUrl, {
    method: "GET",
    headers: { range: "bytes=0-0" },
  });
  if (!response.ok) {
    throw new Error(`Public COS URL verification failed for ${item.localUrl} (${response.status})`);
  }
  await response.body?.cancel();
}

try {
  await client.connect();
  await client.query(`SET search_path TO "${schemaName}", public`);
  const versions = await client.query(`
    SELECT lav.id, lav.preview_url, lav.storage_object_key, lav.metadata_json
    FROM library_asset_versions lav
    JOIN library_assets la ON la.id = lav.library_asset_id
    WHERE la.scope = 'official'
    ORDER BY lav.id
  `);
  const mappings = await buildMappings(versions.rows);
  const versionsToUpdate = versions.rows.filter((row) => hasLocalUrl(row.preview_url) || hasLocalUrl(row.metadata_json));

  if (!mappings.length) {
    console.log("No local official asset URLs require migration.");
  } else if (!apply) {
    console.log(`Dry run: ${mappings.length} official asset files and ${versionsToUpdate.length} asset versions are ready for COS migration.`);
    console.log("Run again with --apply to upload files, verify public COS URLs, and update PostgreSQL.");
  } else {
    console.log(`Uploading and verifying ${mappings.length} official asset files...`);
    await mapWithConcurrency(mappings, 4, async (item, index) => {
      await uploadAndVerify(item);
      console.log(`[${index + 1}/${mappings.length}] uploaded ${item.localUrl}`);
    });

    const urlMap = new Map(mappings.map((item) => [item.localUrl, item.publicUrl]));
    const objectKeyMap = new Map(mappings.map((item) => [item.localUrl, item.objectKey]));
    await client.query("BEGIN");
    try {
      for (const row of versionsToUpdate) {
        const previewUrl = replaceLocalUrls(row.preview_url, urlMap);
        const metadata = replaceLocalUrls(row.metadata_json, urlMap);
        const storageObjectKey = objectKeyMap.get(row.preview_url) ?? row.storage_object_key;
        await client.query(
          `
            UPDATE library_asset_versions
            SET preview_url = $2,
                storage_object_key = $3,
                metadata_json = $4::jsonb
            WHERE id = $1
          `,
          [row.id, previewUrl, storageObjectKey, JSON.stringify(metadata)],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }

    const verification = await client.query(`
      SELECT lav.preview_url, lav.metadata_json
      FROM library_asset_versions lav
      JOIN library_assets la ON la.id = lav.library_asset_id
      WHERE la.scope = 'official'
    `);
    const unresolved = verification.rows.filter((row) => hasLocalUrl(row.preview_url) || hasLocalUrl(row.metadata_json));
    if (unresolved.length > 0) {
      throw new Error(`Migration verification failed: ${unresolved.length} official asset versions still reference local URLs`);
    }
    console.log(`Migrated ${mappings.length} official asset files and updated ${versionsToUpdate.length} asset versions to COS URLs.`);
  }
} finally {
  await client.end().catch(() => undefined);
}
