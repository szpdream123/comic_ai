import type { SqlDatabase } from "../shared/db/sql.ts";
import {
  findActiveAiModelConfigByCode,
  resolveAiModelConfigSecretReferences,
  type AiModelConfigRecord,
} from "../model-catalog/ai-model-config.store.ts";

const snapshotVersion = 1;

export function createGenerationModelConfigSnapshot(modelConfig: AiModelConfigRecord) {
  return {
    version: snapshotVersion,
    config: {
      id: modelConfig.id,
      modelCode: modelConfig.modelCode,
      displayName: modelConfig.displayName,
      providerName: modelConfig.providerName,
      providerModel: modelConfig.providerModel,
      providerProtocol: modelConfig.providerProtocol,
      invocationMode: modelConfig.invocationMode,
      mediaType: modelConfig.mediaType,
      providerConfig: sanitizeProviderConfig(modelConfig.providerConfig),
    },
  };
}

export async function resolveGenerationModelConfigForTask(
  db: SqlDatabase,
  taskSnapshot: Record<string, unknown>,
  modelCode: string,
) {
  const captured = parseGenerationModelConfigSnapshot(taskSnapshot.modelConfigSnapshot);
  if (captured && captured.modelCode === modelCode) {
    return resolveAiModelConfigSecretReferences(db, captured);
  }
  return findActiveAiModelConfigByCode(db, modelCode);
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
