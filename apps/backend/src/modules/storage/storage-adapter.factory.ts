import type { StorageAdapter } from "./storage.service.ts";
import { CreatorDevStorageAdapter } from "./creator-dev.storage-adapter.ts";
import { PublicBaseUrlStorageAdapter } from "./public-base-url.storage-adapter.ts";
import { S3CompatibleStorageAdapter } from "./s3-compatible.storage-adapter.ts";

export function createStorageAdapterFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): StorageAdapter {
  const mode = (env.STORAGE_ADAPTER_MODE ?? "dev").trim();

  if (mode === "public_base_url") {
    const baseUrl = env.STORAGE_PUBLIC_BASE_URL?.trim();
    if (!baseUrl) {
      throw new Error("storage_public_base_url_required");
    }

    return new PublicBaseUrlStorageAdapter(baseUrl);
  }

  if (mode === "cos" || mode === "s3_compatible") {
    const region = env.STORAGE_REGION?.trim();
    const bucket = env.STORAGE_BUCKET?.trim();
    const accessKeyId = (env.STORAGE_ACCESS_KEY_ID ?? env.STORAGE_COS_SECRET_ID)?.trim();
    const secretAccessKey =
      (env.STORAGE_SECRET_ACCESS_KEY ?? env.STORAGE_COS_SECRET_KEY)?.trim();
    if (!region) {
      throw new Error("storage_region_required");
    }
    if (!accessKeyId || !secretAccessKey) {
      throw new Error("storage_credentials_required");
    }

    const configuredEndpoint = env.STORAGE_ENDPOINT?.trim() || "";
    const endpoint = mode === "cos"
      ? `https://cos.${region}.myqcloud.com`
      : configuredEndpoint;
    const forcePathStyle = mode === "cos"
      ? false
      : String(env.STORAGE_FORCE_PATH_STYLE ?? "").trim() === "true";
    return new S3CompatibleStorageAdapter({
      endpoint,
      region,
      accessKeyId,
      secretAccessKey,
      forcePathStyle,
    });
  }

  return new CreatorDevStorageAdapter();
}
