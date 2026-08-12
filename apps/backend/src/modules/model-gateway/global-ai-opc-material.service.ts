import { createHash, randomUUID } from "node:crypto";

import { findActiveAiModelConfigByCode } from "../model-catalog/ai-model-config.store.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

const GLOBAL_AI_OPC_ASSET_UPLOAD_PATH = "/asset/seedance2/assetUpload";
const GLOBAL_AI_OPC_ASSET_DETAIL_PATH = "/asset/seedance2/assetDetail";
const GLOBAL_AI_OPC_ASSET_REQUEST_TIMEOUT_MS = 8_000;
const GLOBAL_AI_OPC_ASSET_RETRY_DELAY_MS = 60_000;

type GlobalAiOpcAssetType = "Image" | "Video" | "Audio";

interface ProviderMaterialRow {
  id: string;
  provider_asset_id: string | null;
  provider_status: string;
  last_checked_at: Date | string | null;
}

interface GlobalAiOpcAssetResponse {
  assetId?: string;
  status?: string;
  errorMessage?: string | null;
}

interface MaterialSlot {
  assetType: GlobalAiOpcAssetType;
  sourceKey: string;
  sourceUrl: string;
  storageObjectId: string | null;
  replace(value: string): void;
}

export async function registerGeneratedImageWithGlobalAiOpc(
  db: SqlDatabase,
  input: {
    storageObjectId: string;
    sourceUrl: string;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    now: Date;
  },
): Promise<void> {
  if (!input.storageObjectId.trim() || !isHttpUrl(input.sourceUrl)) return;

  const modelConfig = await findActiveAiModelConfigByCode(db, "seedance-2.5-c1")
    ?? await findActiveAiModelConfigByCode(db, "MiniMax-H3-c4");
  if (
    modelConfig?.providerProtocol !== "globalaiopc_video"
    || readString(modelConfig.providerConfig.requestFormat) !== "globalaiopc_model_center_video"
  ) return;

  const apiKey = resolveProviderApiKey(modelConfig.providerConfig, input.env);
  const providerAccountHash = sha256(apiKey);
  const sourceKey = `storage:${input.storageObjectId}`;
  const material: MaterialSlot = {
    assetType: "Image",
    sourceKey,
    sourceUrl: input.sourceUrl,
    storageObjectId: input.storageObjectId,
    replace: () => undefined,
  };

  try {
    await resolveGlobalAiOpcAssetId(db, {
      ...material,
      apiKey,
      providerAccountHash,
      baseUrl: readString(modelConfig.providerConfig.baseURL)
        ?? "https://zcbservice.aizfw.cn/kyyReactApiServer",
      fetchImpl: input.fetchImpl ?? fetch,
      now: input.now,
    });
  } finally {
    await aliasProviderMaterialByUrl(db, {
      providerAccountHash,
      storageSourceKey: sourceKey,
      sourceUrl: input.sourceUrl,
      now: input.now,
    });
  }
}

export async function prepareGlobalAiOpcVideoMaterials(
  db: SqlDatabase,
  input: {
    requestBody: Record<string, unknown>;
    providerConfig: Record<string, unknown>;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    now: Date;
  },
): Promise<Record<string, unknown>> {
  const requestBody = structuredClone(input.requestBody);
  const slots = collectGlobalAiOpcMaterialSlots(requestBody);
  if (!slots.length) return requestBody;

  const apiKey = resolveProviderApiKey(input.providerConfig, input.env);
  const providerAccountHash = sha256(apiKey);
  const baseUrl = readString(input.providerConfig.baseURL) ?? "https://zcbservice.aizfw.cn/kyyReactApiServer";
  const fetchImpl = input.fetchImpl ?? fetch;

  await Promise.all(slots.map(async (slot) => {
    try {
      const assetId = await resolveGlobalAiOpcAssetId(db, {
        ...slot,
        apiKey,
        providerAccountHash,
        baseUrl,
        fetchImpl,
        now: input.now,
      });
      if (assetId) slot.replace(`assetId://${assetId}`);
    } catch {
      // Material registration is a provider-only optimization; the existing URL remains the fallback.
    }
  }));

  return requestBody;
}

async function resolveGlobalAiOpcAssetId(
  db: SqlDatabase,
  input: MaterialSlot & {
    apiKey: string;
    providerAccountHash: string;
    baseUrl: string;
    fetchImpl: typeof fetch;
    now: Date;
  },
) {
  let mapping = await findProviderMaterial(db, input);
  if (mapping?.provider_status === "ACTIVE" && mapping.provider_asset_id) {
    return mapping.provider_asset_id;
  }

  if (mapping?.provider_asset_id) {
    const detail = await requestGlobalAiOpcAsset(input, GLOBAL_AI_OPC_ASSET_DETAIL_PATH, {
      assetId: mapping.provider_asset_id,
    });
    await updateProviderMaterial(db, mapping.id, detail, input.now);
    return detail.status === "ACTIVE" && detail.assetId
      ? detail.assetId
      : null;
  }

  if (mapping && !canRetryProviderMaterial(mapping, input.now)) return null;

  if (!mapping) {
    mapping = await claimProviderMaterial(db, input);
    if (!mapping) return null;
  }

  try {
    const uploaded = await requestGlobalAiOpcAsset(input, GLOBAL_AI_OPC_ASSET_UPLOAD_PATH, {
      assetType: input.assetType,
      url: input.sourceUrl,
      name: `comic-ai-${input.assetType.toLowerCase()}-${input.sourceKey.slice(-12)}`,
    });
    await updateProviderMaterial(db, mapping.id, uploaded, input.now);
    return uploaded.status === "ACTIVE" && uploaded.assetId
      ? uploaded.assetId
      : null;
  } catch (error) {
    await markProviderMaterialFailed(db, mapping.id, error, input.now).catch(() => undefined);
    throw error;
  }
}

async function findProviderMaterial(
  db: SqlDatabase,
  input: Pick<MaterialSlot, "sourceKey" | "assetType"> & { providerAccountHash: string },
) {
  return queryOne<ProviderMaterialRow>(db, `
    SELECT id, provider_asset_id, provider_status, last_checked_at
    FROM provider_material_assets
    WHERE provider='globalaiopc'
      AND provider_account_hash=$1
      AND source_key=$2
      AND asset_type=$3
    LIMIT 1
  `, [input.providerAccountHash, input.sourceKey, input.assetType]);
}

async function claimProviderMaterial(
  db: SqlDatabase,
  input: MaterialSlot & { providerAccountHash: string; now: Date },
) {
  return queryOne<ProviderMaterialRow>(db, `
    INSERT INTO provider_material_assets (
      id, provider, provider_account_hash, source_key, storage_object_id,
      asset_type, provider_status, last_checked_at, created_at, updated_at
    )
    VALUES ($1, 'globalaiopc', $2, $3, $4, $5, 'PENDING', $6, $6, $6)
    ON CONFLICT (provider, provider_account_hash, source_key, asset_type) DO NOTHING
    RETURNING id, provider_asset_id, provider_status, last_checked_at
  `, [
    randomUUID(),
    input.providerAccountHash,
    input.sourceKey,
    input.storageObjectId,
    input.assetType,
    input.now,
  ]);
}

async function aliasProviderMaterialByUrl(
  db: SqlDatabase,
  input: {
    providerAccountHash: string;
    storageSourceKey: string;
    sourceUrl: string;
    now: Date;
  },
) {
  await db.query(`
    INSERT INTO provider_material_assets (
      id, provider, provider_account_hash, source_key, storage_object_id,
      asset_type, provider_asset_id, provider_status, provider_error,
      last_checked_at, created_at, updated_at
    )
    SELECT $1, provider, provider_account_hash, $2, storage_object_id,
           asset_type, provider_asset_id, provider_status, provider_error,
           last_checked_at, $3, $3
    FROM provider_material_assets
    WHERE provider='globalaiopc'
      AND provider_account_hash=$4
      AND source_key=$5
      AND asset_type='Image'
    ON CONFLICT (provider, provider_account_hash, source_key, asset_type) DO UPDATE
    SET storage_object_id=COALESCE(EXCLUDED.storage_object_id, provider_material_assets.storage_object_id),
        provider_asset_id=COALESCE(EXCLUDED.provider_asset_id, provider_material_assets.provider_asset_id),
        provider_status=EXCLUDED.provider_status,
        provider_error=EXCLUDED.provider_error,
        last_checked_at=EXCLUDED.last_checked_at,
        updated_at=$3
  `, [
    randomUUID(),
    `url:${sha256(input.sourceUrl)}`,
    input.now,
    input.providerAccountHash,
    input.storageSourceKey,
  ]);
}

async function updateProviderMaterial(
  db: SqlDatabase,
  id: string,
  response: GlobalAiOpcAssetResponse,
  now: Date,
) {
  await db.query(`
    UPDATE provider_material_assets
    SET provider_asset_id=COALESCE($2, provider_asset_id),
        provider_status=COALESCE($3, provider_status),
        provider_error=$4,
        last_checked_at=$5,
        updated_at=$5
    WHERE id=$1
  `, [
    id,
    readString(response.assetId) ?? null,
    readString(response.status)?.toUpperCase() ?? null,
    readString(response.errorMessage) ?? null,
    now,
  ]);
}

async function markProviderMaterialFailed(
  db: SqlDatabase,
  id: string,
  error: unknown,
  now: Date,
) {
  await db.query(`
    UPDATE provider_material_assets
    SET provider_status='FAILED', provider_error=$2, last_checked_at=$3, updated_at=$3
    WHERE id=$1
  `, [id, readErrorMessage(error).slice(0, 500), now]);
}

function canRetryProviderMaterial(mapping: ProviderMaterialRow, now: Date) {
  if (!mapping.last_checked_at) return true;
  return now.getTime() - new Date(mapping.last_checked_at).getTime() >= GLOBAL_AI_OPC_ASSET_RETRY_DELAY_MS;
}

async function requestGlobalAiOpcAsset(
  input: { apiKey: string; baseUrl: string; fetchImpl: typeof fetch },
  path: string,
  body: Record<string, unknown>,
): Promise<GlobalAiOpcAssetResponse> {
  const response = await input.fetchImpl(joinUrl(input.baseUrl, path), {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(GLOBAL_AI_OPC_ASSET_REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(text) as unknown;
    payload = readObject(parsed);
  } catch {
    // The status code below provides a stable, non-secret diagnostic.
  }
  if (!response.ok) throw new Error(`global_ai_opc_asset_http_${response.status}`);
  const result = readObject(payload.data);
  const source = Object.keys(result).length ? result : payload;
  const assetId = readString(source.assetId) ?? readString(source.asset_id);
  const status = readString(source.status)?.toUpperCase();
  if (!assetId || !status) throw new Error("global_ai_opc_asset_invalid_response");
  return {
    assetId,
    status,
    errorMessage: readString(source.errorMessage) ?? readString(source.error_message) ?? null,
  };
}

function collectGlobalAiOpcMaterialSlots(requestBody: Record<string, unknown>) {
  const slots: MaterialSlot[] = [];
  const parameters = readObject(requestBody.parameters);
  const fields: Array<[Record<string, unknown>, string, GlobalAiOpcAssetType]> = [
    [requestBody, "firstFrameUrl", "Image"],
    [requestBody, "lastFrameUrl", "Image"],
    [requestBody, "imageUrl", "Image"],
    [requestBody, "referenceImageUrl", "Image"],
    [requestBody, "referenceImages", "Image"],
    [requestBody, "referenceVideoUrl", "Video"],
    [requestBody, "sourceVideoUrl", "Video"],
    [requestBody, "videos", "Video"],
    [requestBody, "referenceAudioUrl", "Audio"],
    [requestBody, "audioUrl", "Audio"],
    [requestBody, "audios", "Audio"],
    [parameters, "firstFrame", "Image"],
    [parameters, "lastFrame", "Image"],
    [parameters, "imageReference", "Image"],
    [parameters, "referenceImages", "Image"],
    [parameters, "referenceUploads", "Image"],
    [parameters, "quickReferences", "Image"],
    [parameters, "filePaths", "Image"],
    [parameters, "videos", "Video"],
    [parameters, "referenceVideos", "Video"],
    [parameters, "editSourceVideo", "Video"],
    [parameters, "sourceVideo", "Video"],
    [parameters, "videoFilePaths", "Video"],
    [parameters, "audios", "Audio"],
    [parameters, "referenceAudio", "Audio"],
    [parameters, "audioFilePaths", "Audio"],
  ];
  for (const [owner, key, assetType] of fields) {
    collectSlotsFromValue(owner, key, assetType, slots);
  }
  const stableSourceKeys = new Map(
    slots
      .filter((slot) => slot.storageObjectId)
      .map((slot) => [`${slot.assetType}:${slot.sourceUrl}`, slot.sourceKey]),
  );
  for (const slot of slots) {
    slot.sourceKey = stableSourceKeys.get(`${slot.assetType}:${slot.sourceUrl}`) ?? slot.sourceKey;
  }
  const unique = new Map<string, MaterialSlot>();
  for (const slot of slots) {
    const key = `${slot.assetType}:${slot.sourceKey}`;
    const existing = unique.get(key);
    if (!existing) {
      unique.set(key, slot);
      continue;
    }
    const previousReplace = existing.replace;
    existing.replace = (value) => {
      previousReplace(value);
      slot.replace(value);
    };
  }
  return [...unique.values()];
}

function collectSlotsFromValue(
  owner: Record<string, unknown>,
  key: string,
  assetType: GlobalAiOpcAssetType,
  slots: MaterialSlot[],
) {
  const value = owner[key];
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectSlot(item, assetType, (next) => { value[index] = next; }, slots));
    return;
  }
  collectSlot(value, assetType, (next) => { owner[key] = next; }, slots);
}

function collectSlot(
  value: unknown,
  assetType: GlobalAiOpcAssetType,
  replaceValue: (value: unknown) => void,
  slots: MaterialSlot[],
) {
  if (typeof value === "string") {
    const sourceUrl = value.trim();
    if (!isHttpUrl(sourceUrl)) return;
    slots.push({
      assetType,
      sourceKey: `url:${sha256(sourceUrl)}`,
      sourceUrl,
      storageObjectId: null,
      replace: replaceValue,
    });
    return;
  }
  const object = readObject(value);
  if (!Object.keys(object).length) return;
  const urlKey = ["url", "previewUrl", "src", "remoteUrl", "publicUrl"]
    .find((candidate) => isHttpUrl(readString(object[candidate]) ?? ""));
  if (!urlKey) return;
  const sourceUrl = readString(object[urlKey])!;
  const storageObjectId = readString(object.storageObjectId) ?? null;
  slots.push({
    assetType,
    sourceKey: storageObjectId ? `storage:${storageObjectId}` : `url:${sha256(sourceUrl)}`,
    sourceUrl,
    storageObjectId,
    replace: (next) => { object[urlKey] = next; },
  });
}

function resolveProviderApiKey(providerConfig: Record<string, unknown>, env: NodeJS.ProcessEnv) {
  const direct = readString(providerConfig.apiKey);
  if (direct) return direct;
  const envName = readString(providerConfig.apiKeyEnv);
  const apiKey = envName ? env[envName]?.trim() : "";
  if (!apiKey) throw new Error("provider_api_key_missing");
  return apiKey;
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/g, "")}/${path.replace(/^\/+/, "")}`;
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "");
}
