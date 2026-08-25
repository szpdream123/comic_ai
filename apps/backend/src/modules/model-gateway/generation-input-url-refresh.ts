import type { SqlDatabase } from "../shared/db/sql.ts";
import type { UploadSessionRuntime } from "../storage/upload-session.service.ts";

const mediaUrlKeys = new Set([
  "url", "src", "sourceUrl", "downloadUrl", "previewUrl", "publicUrl",
  "storageUrl", "mediaUrl", "imageUrl", "videoUrl", "audioUrl", "resultUrl",
]);

export interface GenerationInputUrlRefreshDiagnostic {
  stage: string;
  status: "started" | "succeeded" | "failed" | "skipped";
  path?: string;
  details?: Record<string, unknown>;
  error?: {
    name?: string;
    code?: string;
    message: string;
  };
}

export async function refreshGenerationInputUrls(
  db: SqlDatabase,
  value: unknown,
  input: {
    runtime: UploadSessionRuntime;
    now: Date;
    expiresInSeconds: number;
    projectId?: string | null;
    canvasProjectId?: string | null;
    onDiagnostic?: (diagnostic: GenerationInputUrlRefreshDiagnostic) => void;
  },
): Promise<unknown> {
  const report = (diagnostic: GenerationInputUrlRefreshDiagnostic) => {
    try {
      input.onDiagnostic?.(diagnostic);
    } catch {
      // Diagnostics must never change the refresh result.
    }
  };
  const errorDetails = (error: unknown) => {
    if (error instanceof Error) {
      const record = error as Error & { code?: unknown };
      return {
        name: record.name,
        ...(typeof record.code === "string" ? { code: record.code } : {}),
        message: record.message,
      };
    }
    return { message: String(error) };
  };

  report({ stage: "refresh_inputs", status: "started" });
  const byStorageObjectId = new Map<string, Promise<string | null>>();
  const bySourceUrl = new Map<string, Promise<string | null>>();
  const byAssetVersionId = new Map<string, Promise<string | null>>();
  const signStorageObject = (storageObjectId: string, path: string) => {
    const normalized = storageObjectId.trim();
    let pending = byStorageObjectId.get(normalized);
    if (!pending) {
      report({
        stage: "storage_object_lookup",
        status: "started",
        path,
        details: { storageObjectId: normalized },
      });
      pending = db.query<{ bucket: string; object_key: string }>(`
        SELECT bucket, object_key
        FROM storage_objects
        WHERE id=$1 AND status='available' AND deleted_at IS NULL
        LIMIT 1
      `, [normalized]).catch((error) => {
        report({
          stage: "storage_object_lookup",
          status: "failed",
          path,
          details: { storageObjectId: normalized },
          error: errorDetails(error),
        });
        throw error;
      }).then(async (result) => {
        const object = result.rows[0];
        if (!object) {
          report({
            stage: "storage_object_lookup",
            status: "failed",
            path,
            details: { storageObjectId: normalized, reason: "storage_object_not_available" },
          });
          return null;
        }
        report({
          stage: "storage_object_lookup",
          status: "succeeded",
          path,
          details: { storageObjectId: normalized },
        });
        report({
          stage: "storage_object_sign",
          status: "started",
          path,
          details: { storageObjectId: normalized },
        });
        try {
          const signed = await input.runtime.adapter.createSignedReadUrl({
            bucket: object.bucket,
            objectKey: object.object_key,
            expiresAt: new Date(input.now.getTime() + input.expiresInSeconds * 1000),
          });
          if (!signed?.url?.trim()) {
            throw Object.assign(new Error("storage_signed_url_empty"), { code: "STORAGE_SIGNED_URL_EMPTY" });
          }
          report({
            stage: "storage_object_sign",
            status: "succeeded",
            path,
            details: { storageObjectId: normalized },
          });
          return signed.url;
        } catch (error) {
          report({
            stage: "storage_object_sign",
            status: "failed",
            path,
            details: { storageObjectId: normalized },
            error: errorDetails(error),
          });
          throw error;
        }
      });
      byStorageObjectId.set(normalized, pending);
    }
    return pending;
  };
  const signSourceUrl = (sourceUrl: string, path: string) => {
    let pending = bySourceUrl.get(sourceUrl);
    if (!pending) {
      report({ stage: "source_url_parse", status: "started", path });
      pending = resolveStorageIdentity(sourceUrl).then(async (identity) => {
        if (!identity) {
          report({
            stage: "source_url_parse",
            status: "skipped",
            path,
            details: { reason: "unsupported_source_url" },
          });
          return null;
        }
        report({
          stage: "source_url_parse",
          status: "succeeded",
          path,
          details: { bucket: identity.bucket, objectKey: identity.objectKey },
        });
        if (input.runtime.region && identity.region.toLowerCase() !== input.runtime.region.toLowerCase()) {
          report({
            stage: "source_url_region_check",
            status: "failed",
            path,
            details: { sourceRegion: identity.region, runtimeRegion: input.runtime.region },
          });
          return null;
        }
        report({ stage: "source_storage_lookup", status: "started", path });
        let result;
        try {
          result = await db.query<{ id: string }>(`
            SELECT id
            FROM storage_objects
            WHERE bucket=$1 AND object_key=$2 AND status='available' AND deleted_at IS NULL
            LIMIT 1
          `, [identity.bucket, identity.objectKey]);
          report({
            stage: "source_storage_lookup",
            status: "succeeded",
            path,
            details: { found: Boolean(result.rows[0]) },
          });
        } catch (error) {
          report({ stage: "source_storage_lookup", status: "failed", path, error: errorDetails(error) });
          throw error;
        }
        if (result.rows[0]) return signStorageObject(result.rows[0].id, path);
        report({ stage: "source_url_sign", status: "started", path });
        try {
          const signed = await input.runtime.adapter.createSignedReadUrl({
            bucket: identity.bucket,
            objectKey: identity.objectKey,
            expiresAt: new Date(input.now.getTime() + input.expiresInSeconds * 1000),
          });
          if (!signed?.url?.trim()) {
            throw Object.assign(new Error("storage_signed_url_empty"), { code: "STORAGE_SIGNED_URL_EMPTY" });
          }
          report({ stage: "source_url_sign", status: "succeeded", path });
          return signed.url;
        } catch (error) {
          report({ stage: "source_url_sign", status: "failed", path, error: errorDetails(error) });
          throw error;
        }
      });
      bySourceUrl.set(sourceUrl, pending);
    }
    return pending;
  };
  const signAssetVersion = (assetVersionId: string, path: string) => {
    const normalized = assetVersionId.trim();
    let pending = byAssetVersionId.get(normalized);
    if (!pending) {
      report({ stage: "asset_version_lookup", status: "started", path, details: { assetVersionId: normalized } });
      pending = (async () => {
        if (!input.projectId && !input.canvasProjectId) {
          report({
            stage: "asset_version_lookup",
            status: "skipped",
            path,
            details: { assetVersionId: normalized, reason: "project_context_missing" },
          });
          return null;
        }
        let result;
        try {
          result = await db.query<{
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
        } catch (error) {
          report({
            stage: "asset_version_lookup",
            status: "failed",
            path,
            details: { assetVersionId: normalized },
            error: errorDetails(error),
          });
          throw error;
        }
        const row = result.rows[0];
        if (!row) {
          report({
            stage: "asset_version_lookup",
            status: "failed",
            path,
            details: { assetVersionId: normalized, reason: "asset_version_not_found" },
          });
          return null;
        }
        report({ stage: "asset_version_lookup", status: "succeeded", path, details: { assetVersionId: normalized } });
        if (row.storage_object_id && row.object_status === "available") {
          return signStorageObject(row.storage_object_id, path);
        }
        let metadata: Record<string, unknown>;
        if (typeof row.metadata_json === "string") {
          try {
            metadata = JSON.parse(row.metadata_json) as Record<string, unknown>;
          } catch (error) {
            report({ stage: "asset_metadata_parse", status: "failed", path, error: errorDetails(error) });
            metadata = {};
          }
        } else {
          metadata = row.metadata_json ?? {};
        }
        for (const candidate of [metadata.sourceUrl, metadata.previewUrl, metadata.fixedImageUrl, metadata.url]) {
          if (typeof candidate !== "string" || !candidate.trim()) continue;
          const refreshed = await signSourceUrl(candidate, path);
          if (refreshed) return refreshed;
          // Legacy assets may predate the storage_objects row; keep a valid COS
          // URL as a last resort instead of falling back to its stale object key.
          const identity = await resolveStorageIdentity(candidate);
          if (identity && (!input.runtime.region || identity.region.toLowerCase() === input.runtime.region.toLowerCase())) {
            return candidate;
          }
        }
        report({
          stage: "asset_version_sign",
          status: "failed",
          path,
          details: { assetVersionId: normalized, reason: "asset_media_url_missing" },
        });
        return null;
      })();
      byAssetVersionId.set(normalized, pending);
    }
    return pending;
  };
  const visit = async (candidate: unknown, path = "$"): Promise<unknown> => {
    if (typeof candidate === "string") {
      const storageObjectId = storageObjectIdFromContentUrl(candidate);
      if (storageObjectId) return (await signStorageObject(storageObjectId, path)) ?? candidate;
      return (await signSourceUrl(candidate, path)) ?? candidate;
    }
    if (Array.isArray(candidate)) return Promise.all(candidate.map((item, index) => visit(item, `${path}[${index}]`)));
    if (!candidate || typeof candidate !== "object") return candidate;
    const record = candidate as Record<string, unknown>;
    const storageObjectId = typeof record.storageObjectId === "string" ? record.storageObjectId.trim() : "";
    const assetVersionId = typeof record.assetVersionId === "string" ? record.assetVersionId.trim() : "";
    const signedUrl = storageObjectId
      ? await signStorageObject(storageObjectId, `${path}.storageObjectId`)
      : assetVersionId
        ? await signAssetVersion(assetVersionId, `${path}.assetVersionId`)
        : null;
    const entries = await Promise.all(Object.entries(record).map(async ([key, item]) => [
      key,
      signedUrl && mediaUrlKeys.has(key) && typeof item === "string" ? signedUrl : await visit(item, `${path}.${key}`),
    ] as const));
    if (signedUrl && !entries.some(([key, item]) => mediaUrlKeys.has(key) && typeof item === "string" && item.trim())) {
      entries.push(["url", signedUrl]);
    }
    return Object.fromEntries(entries);
  };
  return visit(value).then((result) => {
    report({ stage: "refresh_inputs", status: "succeeded" });
    return result;
  }).catch((error) => {
    report({ stage: "refresh_inputs", status: "failed", error: errorDetails(error) });
    throw error;
  });
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
