import type { SqlDatabase } from "../shared/db/sql.ts";
import type { UploadSessionRuntime } from "../storage/upload-session.service.ts";

const mediaUrlKeys = new Set([
  "url", "src", "sourceUrl", "downloadUrl", "previewUrl", "publicUrl",
  "storageUrl", "mediaUrl", "imageUrl", "videoUrl", "audioUrl", "resultUrl",
]);

export async function refreshGenerationInputUrls(
  db: SqlDatabase,
  value: unknown,
  input: {
    runtime: UploadSessionRuntime;
    now: Date;
    expiresInSeconds: number;
    projectId?: string | null;
    canvasProjectId?: string | null;
  },
): Promise<unknown> {
  const byStorageObjectId = new Map<string, Promise<string | null>>();
  const bySourceUrl = new Map<string, Promise<string | null>>();
  const byAssetVersionId = new Map<string, Promise<string | null>>();
  const signStorageObject = (storageObjectId: string) => {
    const normalized = storageObjectId.trim();
    let pending = byStorageObjectId.get(normalized);
    if (!pending) {
      pending = db.query<{ bucket: string; object_key: string }>(`
        SELECT bucket, object_key
        FROM storage_objects
        WHERE id=$1 AND status='available' AND deleted_at IS NULL
        LIMIT 1
      `, [normalized]).then(async (result) => {
        const object = result.rows[0];
        if (!object) return null;
        return (await input.runtime.adapter.createSignedReadUrl({
          bucket: object.bucket,
          objectKey: object.object_key,
          expiresAt: new Date(input.now.getTime() + input.expiresInSeconds * 1000),
        })).url;
      });
      byStorageObjectId.set(normalized, pending);
    }
    return pending;
  };
  const signSourceUrl = (sourceUrl: string) => {
    let pending = bySourceUrl.get(sourceUrl);
    if (!pending) {
      pending = resolveStorageIdentity(sourceUrl).then(async (identity) => {
        if (!identity) return null;
        if (input.runtime.region && identity.region.toLowerCase() !== input.runtime.region.toLowerCase()) return null;
        const result = await db.query<{ id: string }>(`
          SELECT id
          FROM storage_objects
          WHERE bucket=$1 AND object_key=$2 AND status='available' AND deleted_at IS NULL
          LIMIT 1
        `, [identity.bucket, identity.objectKey]);
        if (result.rows[0]) return signStorageObject(result.rows[0].id);
        return input.runtime.adapter.createSignedReadUrl({
          bucket: identity.bucket,
          objectKey: identity.objectKey,
          expiresAt: new Date(input.now.getTime() + input.expiresInSeconds * 1000),
        }).then((signed) => signed.url);
      });
      bySourceUrl.set(sourceUrl, pending);
    }
    return pending;
  };
  const signAssetVersion = (assetVersionId: string) => {
    const normalized = assetVersionId.trim();
    let pending = byAssetVersionId.get(normalized);
    if (!pending) {
      pending = (async () => {
        if (!input.projectId && !input.canvasProjectId) return null;
        const result = await db.query<{
          storage_object_id: string | null;
          bucket: string | null;
          object_key: string | null;
          object_status: string | null;
          metadata_json: Record<string, unknown> | string | null;
        }>(input.projectId
          ? `
            SELECT av.storage_object_id,
                   so.bucket,
                   so.object_key,
                   so.status AS object_status,
                   av.metadata_json
            FROM asset_versions av
            JOIN assets a ON a.id=av.asset_id AND a.project_id=$1
            LEFT JOIN storage_objects so ON so.id=av.storage_object_id
            WHERE av.id=$2
            LIMIT 1
          `
          : `
            SELECT COALESCE(artifact.storage_object_id, av.storage_object_id) AS storage_object_id,
                   so.bucket,
                   so.object_key,
                   so.status AS object_status,
                   av.metadata_json
            FROM asset_versions av
            JOIN assets a ON a.id=av.asset_id AND a.canvas_project_id=$1
            LEFT JOIN creator_canvas_node_artifacts artifact
              ON artifact.canvas_project_id=$1
             AND artifact.asset_version_id=av.id
             AND artifact.deleted_at IS NULL
            LEFT JOIN storage_objects so ON so.id=COALESCE(artifact.storage_object_id, av.storage_object_id)
            WHERE av.id=$2
            ORDER BY artifact.selected DESC NULLS LAST, artifact.updated_at DESC NULLS LAST, artifact.id DESC NULLS LAST
            LIMIT 1
          `,
          [input.projectId ?? input.canvasProjectId, normalized],
        );
        const row = result.rows[0];
        if (!row) return null;
        if (row.storage_object_id && row.object_status === "available") {
          return signStorageObject(row.storage_object_id);
        }
        const metadata = typeof row.metadata_json === "string"
          ? (() => { try { return JSON.parse(row.metadata_json) as Record<string, unknown>; } catch { return {}; } })()
          : row.metadata_json ?? {};
        for (const candidate of [metadata.sourceUrl, metadata.previewUrl, metadata.fixedImageUrl, metadata.url]) {
          if (typeof candidate !== "string" || !candidate.trim()) continue;
          const refreshed = await signSourceUrl(candidate);
          if (refreshed) return refreshed;
          // Legacy assets may predate the storage_objects row; keep a valid COS
          // URL as a last resort instead of falling back to its stale object key.
          const identity = await resolveStorageIdentity(candidate);
          if (identity && (!input.runtime.region || identity.region.toLowerCase() === input.runtime.region.toLowerCase())) {
            return candidate;
          }
        }
        return null;
      })();
      byAssetVersionId.set(normalized, pending);
    }
    return pending;
  };
  const visit = async (candidate: unknown): Promise<unknown> => {
    if (typeof candidate === "string") {
      const storageObjectId = storageObjectIdFromContentUrl(candidate);
      if (storageObjectId) return (await signStorageObject(storageObjectId)) ?? candidate;
      return (await signSourceUrl(candidate)) ?? candidate;
    }
    if (Array.isArray(candidate)) return Promise.all(candidate.map(visit));
    if (!candidate || typeof candidate !== "object") return candidate;
    const record = candidate as Record<string, unknown>;
    const storageObjectId = typeof record.storageObjectId === "string" ? record.storageObjectId.trim() : "";
    const assetVersionId = typeof record.assetVersionId === "string" ? record.assetVersionId.trim() : "";
    const signedUrl = storageObjectId
      ? await signStorageObject(storageObjectId)
      : assetVersionId
        ? await signAssetVersion(assetVersionId)
        : null;
    const entries = await Promise.all(Object.entries(record).map(async ([key, item]) => [
      key,
      signedUrl && mediaUrlKeys.has(key) && typeof item === "string" ? signedUrl : await visit(item),
    ] as const));
    if (signedUrl && !entries.some(([key, item]) => mediaUrlKeys.has(key) && typeof item === "string" && item.trim())) {
      entries.push(["url", signedUrl]);
    }
    return Object.fromEntries(entries);
  };
  return visit(value);
}

function storageObjectIdFromContentUrl(value: string) {
  try {
    const match = new URL(value, "https://storage.invalid").pathname.match(/^\/api\/storage\/objects\/([^/]+)\/content$/);
    return match ? decodeURIComponent(match[1] ?? "") : "";
  } catch {
    return "";
  }
}

async function resolveStorageIdentity(value: string) {
  try {
    const url = new URL(value);
    const match = url.hostname.match(/^(.+)\.cos\.([a-z0-9-]+)\.myqcloud\.com$/i);
    if (url.protocol !== "https:" || !match) return null;
    return {
      bucket: match[1] ?? "",
      region: match[2] ?? "",
      objectKey: url.pathname.replace(/^\/+/, "").split("/").map(decodeURIComponent).join("/"),
    };
  } catch {
    return null;
  }
}
