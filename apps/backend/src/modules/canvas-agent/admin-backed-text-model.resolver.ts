import type { SqlDatabase } from "../shared/db/sql.ts";
import {
  findActiveAiModelConfigByCode,
  type AiModelConfigRecord,
} from "../model-catalog/ai-model-config.store.ts";
import { createGenerationModelConfigSnapshotForTask } from "../model-gateway/generation-model-config-snapshot.ts";
import { TextModelGatewayError } from "../model-gateway/text-model-gateway.errors.ts";
import type {
  TextModelResolution,
  TextModelResolver,
} from "../model-gateway/text-model-gateway.service.ts";
import type { CanvasAgentModelSnapshot } from "./canvas-agent.types.ts";

export interface ResolvedCanvasAgentTextModel extends TextModelResolution {
  snapshot: CanvasAgentModelSnapshot;
  pricing: Record<string, unknown>;
  capabilities: Record<string, unknown>;
}

export class AdminBackedTextModelResolver implements TextModelResolver {
  constructor(
    private readonly db: SqlDatabase,
    private readonly options: {
      allowFailedCompatibilityProbe?: boolean;
      requireAgentCompatibility?: boolean;
    } = {},
  ) {}

  async resolve(modelCode: string): Promise<ResolvedCanvasAgentTextModel> {
    const model = await findActiveAiModelConfigByCode(this.db, modelCode);
    if (!model) {
      throw new TextModelGatewayError("model_not_configured");
    }
    assertTextModelEligible(model);
    if (this.options.requireAgentCompatibility !== false && model.taskModes.includes("text.canvas_agent")) {
      if (!this.options.allowFailedCompatibilityProbe && await hasFailedCanvasAgentCompatibilityProbe(this.db, model.id)) {
        throw new TextModelGatewayError("model_disabled");
      }
      assertAgentEligible(model);
    }

    const apiKey = readString(model.providerConfig.apiKey);
    const baseURL = readString(model.providerConfig.baseURL);
    if (!apiKey) {
      throw new TextModelGatewayError("provider_auth_missing");
    }
    if (!baseURL) {
      throw new TextModelGatewayError("model_not_configured");
    }

    const routeSnapshot = await createGenerationModelConfigSnapshotForTask(this.db, model);
    const providerConfigRevisionId = readString(routeSnapshot.providerConfigRevisionId)
      || `current:${model.id}`;
    const credentialVersionRef = readString(routeSnapshot.credentialVersionRef)
      || `revision:${providerConfigRevisionId}`;
    const snapshot: CanvasAgentModelSnapshot = {
      version: 1,
      modelConfigId: model.id,
      modelCode: model.modelCode,
      displayName: model.displayName,
      providerName: model.providerName,
      providerModel: model.providerModel,
      providerProtocol: model.providerProtocol,
      providerConfigRevisionId,
      credentialVersionRef,
      capabilities: model.capabilities,
      pricing: model.pricing,
      limits: model.limits,
      providerConfig: sanitizeProviderConfig(model.providerConfig),
    };

    return {
      id: model.modelCode,
      label: model.displayName,
      providerName: model.providerName,
      providerModel: model.providerModel,
      baseURL,
      apiKey,
      apiKeyEnv: "admin_secret_values",
      enabled: true,
      providerProtocol: model.providerProtocol,
      providerConfigRevisionId,
      credentialVersionRef,
      snapshot,
      pricing: model.pricing,
      capabilities: model.capabilities,
    };
  }
}

function assertTextModelEligible(model: AiModelConfigRecord) {
  if (model.mediaType !== "text") {
    throw new TextModelGatewayError("model_not_configured");
  }
  if (!["openai_compatible_chat", "cumob_chat", "modelflare_responses"].includes(model.providerProtocol) || model.invocationMode !== "stream") {
    throw new TextModelGatewayError("model_not_configured");
  }
}

export async function listAvailableCanvasAgentModels(db: SqlDatabase) {
  const result = await db.query<{
    model_code: string;
    display_name: string;
    capabilities_json: Record<string, unknown>;
    pricing_json: Record<string, unknown>;
    status: string;
  }>(`
    SELECT model_code,display_name,capabilities_json,pricing_json,status
    FROM ai_model_configs
    WHERE status='active' AND media_type='text'
      AND provider_protocol IN ('openai_compatible_chat','cumob_chat','modelflare_responses') AND invocation_mode='stream'
      AND (
        NOT task_modes_json ? 'text.canvas_agent'
        OR (
          ui_config_json->>'agentEligible'='true'
          AND capabilities_json->>'stream'='true'
          AND (
            (capabilities_json->>'toolCalling'='true' AND capabilities_json->>'jsonSchema'='true')
            OR capabilities_json->>'structuredJsonPrompt'='true'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM canvas_agent_model_compatibility_probes probe
            WHERE probe.model_config_id = ai_model_configs.id
              AND probe.status = 'failed'
          )
          AND CASE
            WHEN capabilities_json->>'contextWindow' ~ '^[0-9]+([.][0-9]+)?$'
            THEN (capabilities_json->>'contextWindow')::numeric
            ELSE 0
          END > 0
        )
      )
    ORDER BY sort_order ASC,updated_at DESC,model_code ASC
  `);
  return result.rows.map((row) => ({
    modelCode: row.model_code,
    modelLabel: row.display_name,
    capabilities: sanitizePublicModelRecord(row.capabilities_json),
    pricing: sanitizePublicModelRecord(row.pricing_json),
  }));
}

async function hasFailedCanvasAgentCompatibilityProbe(db: SqlDatabase, modelConfigId: string) {
  const result = await db.query<{ failed: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM canvas_agent_model_compatibility_probes
      WHERE model_config_id = $1 AND status = 'failed'
    ) AS failed
  `, [modelConfigId]);
  return result.rows[0]?.failed === true;
}

function assertAgentEligible(model: AiModelConfigRecord) {
  if (model.mediaType !== "text" || !model.taskModes.includes("text.canvas_agent")) {
    throw new TextModelGatewayError("model_not_configured");
  }
  if (!["openai_compatible_chat", "cumob_chat", "modelflare_responses"].includes(model.providerProtocol) || model.invocationMode !== "stream") {
    throw new TextModelGatewayError("model_not_configured");
  }
  if (model.uiConfig.agentEligible !== true) {
    throw new TextModelGatewayError("model_disabled");
  }
  if (model.capabilities.stream !== true) {
    throw new TextModelGatewayError("model_not_configured");
  }
  const nativeStructuredTools = model.capabilities.toolCalling === true && model.capabilities.jsonSchema === true;
  if (!nativeStructuredTools && model.capabilities.structuredJsonPrompt !== true) {
    throw new TextModelGatewayError("model_not_configured");
  }
  const contextWindow = Number(model.capabilities.contextWindow ?? 0);
  if (!Number.isFinite(contextWindow) || contextWindow <= 0) {
    throw new TextModelGatewayError("model_not_configured");
  }
}

function sanitizeProviderConfig(value: Record<string, unknown>): Record<string, unknown> {
  return sanitizeValue(value) as Record<string, unknown>;
}

function sanitizeValue(value: unknown, key = ""): unknown {
  if (/(api[-_]?key|authorization|cookie|password|secret|token)/i.test(key)) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item)).filter((item) => item !== undefined);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([entryKey, entryValue]) => [entryKey, sanitizeValue(entryValue, entryKey)] as const)
      .filter(([, entryValue]) => entryValue !== undefined),
  );
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizePublicModelRecord(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      if (/(api[-_]?key|authorization|cookie|password|secret|token|credential|env|ref)/i.test(key)) return [];
      if (Array.isArray(entry)) return [[key, entry.filter((item) => item === null || ["string", "number", "boolean"].includes(typeof item))]];
      if (entry && typeof entry === "object") return [[key, sanitizePublicModelRecord(entry as Record<string, unknown>)]];
      return [[key, entry]];
    }),
  );
}

export const __adminBackedTextModelTestUtils = { sanitizePublicModelRecord };
