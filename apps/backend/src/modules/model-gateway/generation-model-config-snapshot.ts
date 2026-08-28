import { createHash } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import {
  findActiveAiModelConfigByCode,
  resolveAiModelConfigSecretReferences,
  type AiModelConfigRecord,
} from "../model-catalog/ai-model-config.store.ts";
import {
  generationTimeoutMsFor,
  type GenerationTimeoutMediaType,
} from "./generation-timeout.policy.ts";

const snapshotVersion = 1;

/**
 * Returns a non-secret, stable identity for the provider configuration captured
 * with a generation task. The full provider config is never returned; only a
 * short digest is used by queue routing so endpoint/account/region changes
 * create a new route without exposing credentials in queue names or logs.
 */
export function createGenerationProviderRouteIdentity(taskSnapshot: Record<string, unknown>): string | undefined {
  const snapshot = readRecord(taskSnapshot.modelConfigSnapshot);
  if (Number(snapshot.version) !== snapshotVersion) return undefined;
  const config = readRecord(snapshot.config);
  const modelConfigId = readString(config.id);
  const modelCode = readString(config.modelCode);
  const providerName = readString(config.providerName);
  const providerModel = readString(config.providerModel);
  const providerProtocol = readString(config.providerProtocol);
  const invocationMode = readString(config.invocationMode);
  const providerConfigRevisionId = readString(snapshot.providerConfigRevisionId);
  const credentialVersionRef = readString(snapshot.credentialVersionRef);
  if (!providerName || !providerModel || !providerProtocol) return undefined;

  const providerConfig = sanitizeProviderConfig(readRecord(config.providerConfig));
  const providerConfigFingerprint = createHash("sha256")
    .update(canonicalJson(providerConfig))
    .digest("hex")
    .slice(0, 32);
  return [
    "v1",
    modelConfigId || modelCode || "unknown-model",
    providerName,
    providerModel,
    providerProtocol,
    invocationMode || "unknown-mode",
    providerConfigRevisionId || "unknown-revision",
    credentialVersionRef || "unknown-credential-version",
    providerConfigFingerprint,
  ].map((part) => encodeRoutePart(part)).join(".");
}

export function readGenerationProviderRouteReferences(taskSnapshot: Record<string, unknown>) {
  const snapshot = readRecord(taskSnapshot.modelConfigSnapshot);
  return {
    providerRouteIdentity: createGenerationProviderRouteIdentity(taskSnapshot) ?? null,
    providerConfigRevisionId: readString(snapshot.providerConfigRevisionId) || null,
    credentialVersionRef: readString(snapshot.credentialVersionRef) || null,
  };
}

export function createGenerationModelConfigSnapshot(
  modelConfig: AiModelConfigRecord,
  references: { providerConfigRevisionId?: string; credentialVersionRef?: string } = {},
) {
  return {
    version: snapshotVersion,
    providerConfigRevisionId: references.providerConfigRevisionId,
    credentialVersionRef: references.credentialVersionRef,
    config: {
      id: modelConfig.id,
      modelCode: modelConfig.modelCode,
      displayName: modelConfig.displayName,
      providerName: modelConfig.providerName,
      providerModel: modelConfig.providerModel,
      providerProtocol: modelConfig.providerProtocol,
      invocationMode: modelConfig.invocationMode,
      mediaType: modelConfig.mediaType,
      providerConfig: createSnapshotProviderConfig(modelConfig),
    },
  };
}

function createSnapshotProviderConfig(modelConfig: AiModelConfigRecord) {
  const providerConfig = sanitizeProviderConfig(modelConfig.providerConfig);
  delete providerConfig.timeoutMs;
  delete providerConfig.requestTimeoutMs;
  delete providerConfig.pollIntervalMs;
  delete providerConfig.maxPollAttempts;
  const mediaType = readString(modelConfig.mediaType);
  if (mediaType === "image" || mediaType === "video" || mediaType === "audio") {
    providerConfig.timeoutMs = generationTimeoutMsFor(mediaType as GenerationTimeoutMediaType);
  }
  return providerConfig;
}

export async function createGenerationModelConfigSnapshotForTask(
  db: SqlDatabase,
  modelConfig: AiModelConfigRecord,
) {
  const revision = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM ai_model_config_revisions
      WHERE model_config_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [modelConfig.id],
  );
  const providerConfigRevisionId = revision?.id ?? `current:${modelConfig.id}`;
  const credentialVersionRef = await resolveCredentialVersionRef(
    db,
    modelConfig.providerConfig,
    providerConfigRevisionId,
  );
  return createGenerationModelConfigSnapshot(modelConfig, {
    providerConfigRevisionId,
    credentialVersionRef,
  });
}

export async function resolveGenerationModelConfigForTask(
  db: SqlDatabase,
  taskSnapshot: Record<string, unknown>,
  modelCode: string,
) {
  const captured = parseGenerationModelConfigSnapshot(taskSnapshot.modelConfigSnapshot);
  if (captured && captured.modelCode === modelCode) {
    return resolveAiModelConfigSecretReferences(db, upgradeCapturedChiYuanSeedance25Contract(captured));
  }
  return findActiveAiModelConfigByCode(db, modelCode);
}

function upgradeCapturedChiYuanSeedance25Contract(modelConfig: AiModelConfigRecord): AiModelConfigRecord {
  const providerConfig = modelConfig.providerConfig;
  const usesLegacyEndpoint = (
    readString(providerConfig.requestPath) === "/v1/video/generations"
    && readString(providerConfig.createTaskEndpoint) === "/v1/video/generations"
    && readString(providerConfig.queryTaskEndpoint) === "/v1/video/generations/{taskId}"
  ) || (
    readString(providerConfig.requestPath) === "/v1/videos"
    && readString(providerConfig.createTaskEndpoint) === "/v1/videos"
    && readString(providerConfig.queryTaskEndpoint) === "/v1/videos/{taskId}"
  );
  if (
    modelConfig.providerProtocol !== "chiyuan_video"
    || modelConfig.providerModel !== "doubao-seedance-2-5-260628"
    || readString(providerConfig.requestFormat) !== "chiyuan_seedance_super_resolution"
    || !usesLegacyEndpoint
  ) {
    return modelConfig;
  }
  return {
    ...modelConfig,
    providerConfig: {
      ...providerConfig,
      requestPath: "/api/v3/contents/generations/tasks",
      createTaskEndpoint: "/api/v3/contents/generations/tasks",
      queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
    },
  };
}

function parseGenerationModelConfigSnapshot(value: unknown): AiModelConfigRecord | undefined {
  const snapshot = readRecord(value);
  if (Number(snapshot.version) !== snapshotVersion) {
    return undefined;
  }
  const config = readRecord(snapshot.config);
  const modelCode = readString(config.modelCode);
  const providerName = readString(config.providerName);
  const providerModel = readString(config.providerModel);
  const providerProtocol = readString(config.providerProtocol);
  if (!modelCode || !providerName || !providerModel || !providerProtocol) {
    return undefined;
  }
  return {
    id: readString(config.id),
    modelCode,
    displayName: readString(config.displayName),
    providerName,
    providerModel,
    providerProtocol,
    invocationMode: readString(config.invocationMode),
    mediaType: readString(config.mediaType),
    taskModes: readStringArray(config.taskModes),
    capabilities: readRecord(config.capabilities),
    parameterSchema: readRecord(config.parameterSchema),
    defaultParams: readRecord(config.defaultParams),
    providerConfig: readRecord(config.providerConfig),
    pricing: readRecord(config.pricing),
    limits: readRecord(config.limits),
    uiConfig: readRecord(config.uiConfig),
    status: readString(config.status),
    sortOrder: Number(config.sortOrder ?? 0),
    remark: readString(config.remark) || null,
  };
}

function sanitizeProviderConfig(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      if (isDirectCredentialField(key)) {
        return [];
      }
      if (Array.isArray(entry)) {
        return [[key, entry.map((item) => sanitizeProviderConfigValue(item))]];
      }
      if (entry && typeof entry === "object") {
        return [[key, sanitizeProviderConfig(entry as Record<string, unknown>)]];
      }
      return [[key, entry]];
    }),
  );
}

function sanitizeProviderConfigValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeProviderConfigValue(item));
  }
  if (value && typeof value === "object") {
    return sanitizeProviderConfig(value as Record<string, unknown>);
  }
  return value;
}

function isDirectCredentialField(key: string) {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (/(env|ref|reference|name)$/.test(normalized)) {
    return false;
  }
  return normalized === "authorization" ||
    normalized.includes("apikey") ||
    normalized.includes("token") ||
    normalized.includes("secret") ||
    normalized.includes("password") ||
    normalized.includes("credential");
}

async function resolveCredentialVersionRef(
  db: SqlDatabase,
  providerConfig: Record<string, unknown>,
  providerConfigRevisionId: string,
) {
  const references = collectCredentialReferences(providerConfig);
  const result = references.length
    ? await db.query<{
        id: string;
        secret_ref: string;
        secret_key: string;
        updated_at: Date | string;
      }>(
        `
          SELECT id, secret_ref, secret_key, updated_at
          FROM admin_secret_values
          WHERE secret_ref = ANY($1::text[])
             OR secret_key = ANY($1::text[])
          ORDER BY secret_ref, secret_key, updated_at DESC, id DESC
        `,
        [references],
      )
    : { rows: [] };
  const material = {
    providerConfigRevisionId,
    references,
    versions: result.rows.map((row) => ({
      id: row.id,
      secretRef: row.secret_ref,
      secretKey: row.secret_key,
      updatedAt: new Date(row.updated_at).toISOString(),
    })),
  };
  return `v1.${createHash("sha256").update(canonicalJson(material)).digest("hex").slice(0, 32)}`;
}

function collectCredentialReferences(value: Record<string, unknown>) {
  const references = new Set<string>();
  const visit = (record: Record<string, unknown>) => {
    for (const [key, entry] of Object.entries(record)) {
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        visit(entry as Record<string, unknown>);
        continue;
      }
      if (typeof entry !== "string" || !entry.trim()) continue;
      const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
      if (
        /(env|ref|reference|name|key)$/.test(normalized)
        && /(authorization|apikey|token|secret|password|credential)/.test(normalized)
      ) {
        references.add(entry.trim());
      }
    }
  };
  visit(value);
  return [...references].sort();
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(readString).filter(Boolean) : [];
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? "null" : encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function encodeRoutePart(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").slice(0, 120) || "unknown";
}
