import type { TextGatewayChatCompletionChunk } from "../model-gateway/openai-compatible-text.adapter.ts";
import { OpenAICompatibleTextAdapter } from "../model-gateway/openai-compatible-text.adapter.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import {
  AdminBackedTextModelResolver,
  type ResolvedCanvasAgentTextModel,
} from "./admin-backed-text-model.resolver.ts";

export interface CanvasAgentModelCompatibilityProbeResult {
  ok: boolean;
  latencyMs: number;
  checks: Array<{
    key: "resolution" | "stream" | "usage" | "json_schema";
    status: "passed" | "failed";
    message?: string;
  }>;
  failureCode: string | null;
}

interface CanvasAgentProbeResolver {
  resolve(modelCode: string): Promise<ResolvedCanvasAgentTextModel>;
}

interface CanvasAgentProbeAdapter {
  createChatCompletionStream(input: {
    baseURL: string;
    apiKey: string;
    providerModel: string;
    request: {
      model: string;
      stream: true;
      messages: Array<{ role: "system" | "user"; content: string }>;
      response_format?: Record<string, unknown>;
      max_tokens: number;
    };
    signal?: AbortSignal;
  }): Promise<AsyncIterable<TextGatewayChatCompletionChunk>>;
}

export class CanvasAgentModelCompatibilityProbeService {
  private readonly resolver: CanvasAgentProbeResolver;
  private readonly adapter: CanvasAgentProbeAdapter;

  constructor(input: {
    db: SqlDatabase;
    resolver?: CanvasAgentProbeResolver;
    adapter?: CanvasAgentProbeAdapter;
    now?: () => number;
    timeoutMs?: number;
  }) {
    this.resolver = input.resolver ?? new AdminBackedTextModelResolver(input.db, {
      allowFailedCompatibilityProbe: true,
    });
    this.adapter = input.adapter ?? new OpenAICompatibleTextAdapter();
    this.now = input.now ?? Date.now;
    this.timeoutMs = Math.max(1_000, Number(input.timeoutMs ?? 15_000));
  }

  private readonly now: () => number;
  private readonly timeoutMs: number;

  async probe(modelCode: string): Promise<CanvasAgentModelCompatibilityProbeResult> {
    const startedAt = this.now();
    const checks: CanvasAgentModelCompatibilityProbeResult["checks"] = [];
    let model: ResolvedCanvasAgentTextModel;
    try {
      model = await this.resolver.resolve(modelCode);
      checks.push({ key: "resolution", status: "passed" });
    } catch {
      checks.push({ key: "resolution", status: "failed", message: "模型配置或密钥引用不可用" });
      return this.failed(startedAt, checks, "canvas_agent_model_resolution_failed");
    }

    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), this.timeoutMs);
    let responseText = "";
    let usageObserved = false;
    try {
      const structuredPromptFallback = model.capabilities.structuredJsonPrompt === true
        && model.capabilities.jsonSchema !== true;
      const stream = await this.adapter.createChatCompletionStream({
        baseURL: model.baseURL,
        apiKey: model.apiKey,
        providerModel: model.providerModel,
        request: {
          model: model.id,
          stream: true,
          messages: [
            {
              role: "system",
              content: structuredPromptFallback
                ? "Return only this JSON shape with no markdown or prose: {\"kind\":\"tool_call\",\"toolId\":\"canvas_read\",\"callId\":\"probe-call\",\"input\":{}}."
                : "Return only a JSON object matching the supplied Canvas Agent tool-call schema.",
            },
            { role: "user", content: "Canvas Agent compatibility probe." },
          ],
          ...(structuredPromptFallback
            ? {}
            : {
                response_format: {
                  type: "json_schema",
                  json_schema: {
                    name: "canvas_agent_probe",
                    strict: false,
                    schema: {
                      type: "object",
                      properties: {
                        kind: { type: "string", enum: ["tool_call"] },
                        toolId: { type: "string", enum: ["canvas_read"] },
                        callId: { type: "string" },
                        input: { type: "object" },
                      },
                      required: ["kind", "toolId", "callId", "input"],
                      additionalProperties: false,
                    },
                  },
                },
              }),
          max_tokens: structuredPromptFallback ? 256 : 32,
        },
        signal: abortController.signal,
      });
      for await (const chunk of stream) {
        if (isProbeUsage(chunk.usage)) usageObserved = true;
        for (const choice of chunk.choices ?? []) {
          const content = choice.delta?.content;
          if (typeof content === "string") responseText += content;
        }
      }
      checks.push({ key: "stream", status: "passed" });
    } catch {
      checks.push({ key: "stream", status: "failed", message: "模型不支持稳定的流式响应" });
      return this.failed(startedAt, checks, abortController.signal.aborted
        ? "canvas_agent_model_probe_timeout"
        : "canvas_agent_model_stream_failed");
    } finally {
      clearTimeout(timer);
    }

    if (!usageObserved) {
      checks.push({ key: "usage", status: "failed", message: "模型流式响应未返回可结算的 usage" });
      return this.failed(startedAt, checks, "canvas_agent_model_usage_missing");
    }
    checks.push({ key: "usage", status: "passed" });

    if (!isProbeJson(responseText)) {
      checks.push({ key: "json_schema", status: "failed", message: "模型未返回符合约束的 Agent 工具调用对象" });
      return this.failed(startedAt, checks, "canvas_agent_model_json_schema_failed");
    }
    checks.push({ key: "json_schema", status: "passed" });
    return {
      ok: true,
      latencyMs: Math.max(0, this.now() - startedAt),
      checks,
      failureCode: null,
    };
  }

  private failed(
    startedAt: number,
    checks: CanvasAgentModelCompatibilityProbeResult["checks"],
    failureCode: string,
  ): CanvasAgentModelCompatibilityProbeResult {
    return {
      ok: false,
      latencyMs: Math.max(0, this.now() - startedAt),
      checks,
      failureCode,
    };
  }
}

function isProbeJson(value: string) {
  try {
    const parsed = JSON.parse(value.trim()) as Record<string, unknown>;
    return Boolean(
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
      && parsed.kind === "tool_call" && parsed.toolId === "canvas_read"
      && typeof parsed.callId === "string" && parsed.callId.length > 0
      && parsed.input && typeof parsed.input === "object" && !Array.isArray(parsed.input),
    );
  } catch {
    return false;
  }
}

function isProbeUsage(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const usage = value as Record<string, unknown>;
  const promptTokens = Number(usage.prompt_tokens);
  const completionTokens = Number(usage.completion_tokens);
  const totalTokens = Number(usage.total_tokens);
  return Number.isFinite(promptTokens) && promptTokens >= 0
    && Number.isFinite(completionTokens) && completionTokens >= 0
    && Number.isFinite(totalTokens) && totalTokens > 0;
}
