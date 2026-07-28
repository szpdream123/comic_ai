import type { SqlDatabase } from "../shared/db/sql.ts";
import type { CanvasAgentPolicySettings } from "./canvas-agent-policy.service.ts";
import type { CanvasAgentMode } from "./canvas-agent.types.ts";

export interface CanvasAgentRuntimeConfiguration {
  defaultModelCode: string | null;
  expertModelCode: string | null;
  webSearchModelCode: string | null;
  maxRounds: number;
  maxToolCalls: number;
  policy: CanvasAgentPolicySettings;
}

export async function loadCanvasAgentRuntimeConfiguration(
  db: SqlDatabase,
): Promise<CanvasAgentRuntimeConfiguration> {
  const result = await db.query<{ value_json: unknown }>(
    "SELECT value_json FROM runtime_config_entries WHERE key='canvas_agent.runtime' LIMIT 1",
  );
  return normalizeCanvasAgentRuntimeConfiguration(result.rows[0]?.value_json);
}

export function normalizeCanvasAgentRuntimeConfiguration(
  value: unknown,
): CanvasAgentRuntimeConfiguration {
  const record = asRecord(value);
  return {
    defaultModelCode: optionalString(record.defaultModelCode),
    expertModelCode: optionalString(record.expertModelCode),
    webSearchModelCode: optionalString(record.webSearchModelCode ?? record.webSearchProvider),
    maxRounds: boundedInteger(record.maxRounds, 12, 1, 64),
    maxToolCalls: boundedInteger(record.maxToolCalls, 24, 1, 256),
    policy: {
      // Only C mode consults these automatic-write flags. B, Plan, and Expert
      // retain their stricter mode boundaries in CanvasAgentPolicyService.
      allowAutomaticCanvasWrites: record.allowAutomaticCanvasWrites !== false,
      allowAutomaticAssetWrites: record.allowAutomaticAssetWrites === true,
      allowAutomaticMediaGeneration: record.allowAutomaticMediaGeneration === true,
      webSearchProviderAllowlist: uniqueStrings(
        Array.isArray(record.webSearchProviderAllowlist)
          ? record.webSearchProviderAllowlist
          : record.webSearchProvider || record.webSearchModelCode
            ? [record.webSearchProvider ?? record.webSearchModelCode]
            : [],
      ),
      mcpServerAllowlist: uniqueStrings(
        Array.isArray(record.mcpServerAllowlist)
          ? record.mcpServerAllowlist
          : Array.isArray(record.mcpAllowlist) ? record.mcpAllowlist : [],
      ),
    },
  };
}

export function selectCanvasAgentModelCode(
  configuration: Pick<CanvasAgentRuntimeConfiguration, "defaultModelCode" | "expertModelCode">,
  mode: CanvasAgentMode,
  requestedModelCode: unknown,
) {
  const requested = optionalString(requestedModelCode);
  if (requested) return requested;
  return mode === "expert"
    ? configuration.expertModelCode ?? configuration.defaultModelCode
    : configuration.defaultModelCode;
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function uniqueStrings(value: unknown[]) {
  return [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))];
}

function optionalString(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
