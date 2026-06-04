import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export interface AiModelConfigRecord {
  id: string;
  modelCode: string;
  displayName: string;
  providerName: string;
  providerModel: string;
  providerProtocol: string;
  invocationMode: string;
  mediaType: string;
  taskModes: string[];
  capabilities: Record<string, unknown>;
  parameterSchema: Record<string, unknown>;
  defaultParams: Record<string, unknown>;
  providerConfig: Record<string, unknown>;
  pricing: Record<string, unknown>;
  limits: Record<string, unknown>;
  uiConfig: Record<string, unknown>;
  status: string;
  sortOrder: number;
  remark: string | null;
}

export interface AiModelDispatchPolicyRecord {
  id: string;
  modelConfigId: string;
  submitQueueName: string;
  pollQueueName: string | null;
  finalizeQueueName: string | null;
  providerRpmLimit: number;
  providerConcurrentLimit: number;
  submitConcurrencyLimit: number;
  pollingIntervalMs: number;
  pollingConcurrencyLimit: number;
  status: string;
}

interface AiModelConfigRow {
  id: string;
  model_code: string;
  display_name: string;
  provider_name: string;
  provider_model: string;
  provider_protocol: string;
  invocation_mode: string;
  media_type: string;
  task_modes_json: unknown;
  capabilities_json: unknown;
  parameter_schema_json: unknown;
  default_params_json: unknown;
  provider_config_json: unknown;
  pricing_json: unknown;
  limits_json: unknown;
  ui_config_json: unknown;
  status: string;
  sort_order: number | string;
  remark: string | null;
}

interface AiModelDispatchPolicyRow {
  id: string;
  model_config_id: string;
  submit_queue_name: string;
  poll_queue_name: string | null;
  finalize_queue_name: string | null;
  provider_rpm_limit: number | string;
  provider_concurrent_limit: number | string;
  submit_concurrency_limit: number | string;
  polling_interval_ms: number | string;
  polling_concurrency_limit: number | string;
  status: string;
}

export async function findActiveAiModelConfigByCode(
  db: SqlDatabase,
  modelCode: string,
): Promise<AiModelConfigRecord | undefined> {
  const normalizedModelCode = modelCode.trim();
  if (!normalizedModelCode) {
    return undefined;
  }

  const row = await queryOne<AiModelConfigRow>(
    db,
    `
      SELECT *
      FROM ai_model_configs
      WHERE model_code = $1
        AND status = 'active'
      LIMIT 1
    `,
    [normalizedModelCode],
  );

  return row ? aiModelConfigFromRow(row) : undefined;
}

export async function listActiveAiModelConfigs(
  db: SqlDatabase,
  input: { mediaType?: string } = {},
): Promise<AiModelConfigRecord[]> {
  const params: unknown[] = [];
  const mediaFilter = input.mediaType?.trim()
    ? "AND media_type = $1"
    : "";
  if (mediaFilter) {
    params.push(input.mediaType!.trim());
  }

  const result = await db.query<AiModelConfigRow>(
    `
      SELECT *
      FROM ai_model_configs
      WHERE status = 'active'
      ${mediaFilter}
      ORDER BY sort_order ASC, updated_at DESC
    `,
    params,
  );

  return result.rows.map(aiModelConfigFromRow);
}

export async function findActiveAiModelDispatchPolicyByModelCode(
  db: SqlDatabase,
  modelCode: string,
): Promise<AiModelDispatchPolicyRecord | undefined> {
  const normalizedModelCode = modelCode.trim();
  if (!normalizedModelCode) {
    return undefined;
  }

  const row = await queryOne<AiModelDispatchPolicyRow>(
    db,
    `
      SELECT p.*
      FROM ai_model_dispatch_policies p
      JOIN ai_model_configs m
        ON m.id = p.model_config_id
      WHERE m.model_code = $1
        AND m.status = 'active'
        AND p.status = 'active'
      LIMIT 1
    `,
    [normalizedModelCode],
  );

  return row ? aiModelDispatchPolicyFromRow(row) : undefined;
}

function aiModelConfigFromRow(row: AiModelConfigRow): AiModelConfigRecord {
  return {
    id: row.id,
    modelCode: row.model_code,
    displayName: row.display_name,
    providerName: row.provider_name,
    providerModel: row.provider_model,
    providerProtocol: row.provider_protocol,
    invocationMode: row.invocation_mode,
    mediaType: row.media_type,
    taskModes: parseJsonArray(row.task_modes_json),
    capabilities: parseJsonObject(row.capabilities_json),
    parameterSchema: parseJsonObject(row.parameter_schema_json),
    defaultParams: parseJsonObject(row.default_params_json),
    providerConfig: parseJsonObject(row.provider_config_json),
    pricing: parseJsonObject(row.pricing_json),
    limits: parseJsonObject(row.limits_json),
    uiConfig: parseJsonObject(row.ui_config_json),
    status: row.status,
    sortOrder: Number(row.sort_order),
    remark: row.remark,
  };
}

function aiModelDispatchPolicyFromRow(row: AiModelDispatchPolicyRow): AiModelDispatchPolicyRecord {
  return {
    id: row.id,
    modelConfigId: row.model_config_id,
    submitQueueName: row.submit_queue_name,
    pollQueueName: row.poll_queue_name,
    finalizeQueueName: row.finalize_queue_name,
    providerRpmLimit: Number(row.provider_rpm_limit),
    providerConcurrentLimit: Number(row.provider_concurrent_limit),
    submitConcurrencyLimit: Number(row.submit_concurrency_limit),
    pollingIntervalMs: Number(row.polling_interval_ms),
    pollingConcurrencyLimit: Number(row.polling_concurrency_limit),
    status: row.status,
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    return parseJsonObject(JSON.parse(value) as unknown);
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseJsonArray(value: unknown): string[] {
  if (typeof value === "string") {
    return parseJsonArray(JSON.parse(value) as unknown);
  }
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}
