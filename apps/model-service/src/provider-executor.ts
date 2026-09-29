import OpenAI from "openai";
import { OpenAICompatibleTextAdapter, type OpenAICompatibleClient, type TextGatewayChatCompletionRequest } from "../../backend/src/modules/model-gateway/openai-compatible-text.adapter.ts";
import { CumobTextAdapter } from "../../backend/src/modules/model-gateway/cumob-text.adapter.ts";
import { GlobalAiOpcVideoProviderAdapter } from "../../backend/src/modules/model-gateway/globalaiopc-video.provider-adapter.ts";
import { AliyunBailianAudioProviderAdapter } from "../../backend/src/modules/model-gateway/aliyun-bailian-audio.provider-adapter.ts";
import type { ExecutionResult, ModelConfig, ModelResult, Operation, ProviderExecutor, Usage } from "./contracts.ts";

const requestTimeoutMs = 120_000;
const usageKeys = ["prompt_tokens", "completion_tokens", "total_tokens", "input_tokens", "output_tokens", "characters"];
const textFields = ["messages", "temperature", "max_tokens", "tools", "tool_choice", "response_format", "thinking"];

/** Low-level adapters only: no legacy gateway, logging, business tables, or submission retries. */
export function createProviderExecutor(options: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  resolveCredentials?: (model: ModelConfig) => Promise<ModelConfig>;
} = {}): ProviderExecutor {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const resolveCredentials = options.resolveCredentials ?? (async (model: ModelConfig) => model);

  function supports(model: ModelConfig, operation: Operation) {
    const protocol = model.providerProtocol.trim().toLowerCase();
    if (operation === "text") return model.mediaType === "text" && ["openai_compatible_chat", "cumob_chat"].includes(protocol);
    if (operation === "video") return model.mediaType === "video" && ["globalaiopc_video", "global_ai_opc_video"].includes(protocol);
    if (operation === "speech") return model.mediaType === "audio" && protocol === "aliyun_bailian_audio";
    // Existing Aliyun adapter synthesizes speech; its transcript output is not an ASR capability.
    // Modelflare currently drops tool calls/audio inputs, so cannot satisfy this text contract.
    return false;
  }

  async function execute(model: ModelConfig, operation: Operation, payload: Record<string, unknown>, requestId: string, externalId?: string): Promise<ExecutionResult> {
    const polling = externalId !== undefined;
    if (!supports(model, operation)) return failure("unsupported_operation");
    if (polling && operation !== "video") return failure("unsupported_poll_operation");
    let started = false;
    let responseStatus: number | undefined;
    // One deadline includes response-body consumption. SDK retries are disabled separately below.
    const deadline = AbortSignal.timeout(requestTimeoutMs);
    const boundedFetch: typeof fetch = async (input, init) => {
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      started = true;
      const response = await fetchImpl(input, {
        ...init, redirect: "error", signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
      });
      responseStatus = response.status;
      return response;
    };
    try {
      // Credential refresh must never replace the accepted routing/model snapshot.
      const current = await resolveCredentials(model);
      const config = model.providerConfig;
      const apiKey = string(current.providerConfig.apiKey) ?? string(env[string(current.providerConfig.apiKeyEnv) ?? string(config.apiKeyEnv) ?? ""]);
      if (!apiKey || !string(model.providerModel)) {
        if (polling) throw new Error("poll_configuration_invalid");
        return failure("provider_configuration_invalid");
      }

      if (operation === "text") {
        const baseURL = absoluteEndpoint(string(config.baseURL));
        if (!baseURL) return failure("provider_configuration_invalid");
        const merged = { ...model.defaultParams, ...payload };
        if (!Array.isArray(merged.messages) || !merged.messages.length) return failure("invalid_provider_input");
        const request = Object.fromEntries(textFields.filter((key) => merged[key] !== undefined).map((key) => [key, merged[key]])) as TextGatewayChatCompletionRequest;
        request.model = model.providerModel;
        request.stream = true;
        const adapter = model.providerProtocol.trim().toLowerCase() === "cumob_chat"
          ? new CumobTextAdapter({ fetcher: boundedFetch })
          : new OpenAICompatibleTextAdapter({ clientFactory: (clientConfig) => new OpenAI({
            ...clientConfig, fetch: boundedFetch, maxRetries: 0, timeout: requestTimeoutMs,
          }) as unknown as OpenAICompatibleClient });
        const stream = await adapter.createChatCompletionStream({ baseURL, apiKey, providerModel: model.providerModel, request, signal: deadline });
        let content = "";
        let id: string | undefined;
        let usage: Usage = null;
        let finishReason: string | undefined;
        const toolCalls = new Map<number, NonNullable<ModelResult["toolCalls"]>[number]>();
        for await (const chunk of stream) {
          if (string(chunk.id)) id = chunk.id;
          if (chunk.usage) usage = safeUsage(chunk.usage);
          const choice = chunk.choices?.find((item) => item.index === 0);
          if (!choice) continue;
          if (choice.finish_reason) finishReason = choice.finish_reason;
          if (typeof choice.delta?.content === "string") content += choice.delta.content;
          for (const delta of choice.delta?.tool_calls ?? []) {
            const index = Number.isInteger(delta.index) ? delta.index : toolCalls.size;
            const call = toolCalls.get(index) ?? { id: "", type: "function" as const, function: { name: "", arguments: "" } };
            if (typeof delta.id === "string") call.id += delta.id;
            if (typeof delta.function?.name === "string") call.function.name += delta.function.name;
            if (typeof delta.function?.arguments === "string") call.function.arguments += delta.function.arguments;
            toolCalls.set(index, call);
          }
        }
        if (!finishReason) throw new Error("incomplete_stream");
        const calls = [...toolCalls.entries()].sort(([left], [right]) => left - right).map(([, value]) => value);
        let outputError = finishReason === "content_filter" ? "provider_content_filtered"
          : !["stop", "tool_calls"].includes(finishReason) ? "provider_output_incomplete" : undefined;
        if (!outputError) {
          try {
            if (finishReason === "tool_calls" && !calls.length) throw new Error("tool_calls_missing");
            for (const call of calls) {
              if (!call.id || !call.function.name) throw new Error("tool_call_invalid");
              JSON.parse(call.function.arguments);
            }
            if (!calls.length && ["json_object", "json_schema"].includes(String(record(merged.response_format).type))) JSON.parse(content);
          } catch { outputError = "provider_output_invalid"; }
        }
        if (outputError) return { status: "failed", ...(id ? { externalId: id } : {}), result: { usage }, error: outputError };
        return { status: "succeeded", ...(id ? { externalId: id } : {}), result: { content, ...(calls.length ? { toolCalls: calls } : {}), usage } };
      }

      const createTaskEndpoint = endpoint(config, "createTaskEndpoint");
      const queryTaskEndpoint = operation === "video" ? endpoint(config, "queryTaskEndpoint") : undefined;
      if (!createTaskEndpoint || (operation === "video" && (!queryTaskEndpoint || !queryTaskEndpoint.includes("{taskId}")))) {
        if (polling) throw new Error("poll_configuration_invalid");
        return failure("provider_configuration_invalid");
      }
      const adapterConfig = { apiKey, model: model.providerModel, createTaskEndpoint, queryTaskEndpoint: queryTaskEndpoint!, fetchImpl: boundedFetch };
      const adapter = operation === "video" ? new GlobalAiOpcVideoProviderAdapter(adapterConfig) : new AliyunBailianAudioProviderAdapter(adapterConfig);
      const parameters = { ...model.defaultParams, ...record(payload.parameters) };
      if (polling) {
        const result = await adapter.poll({ externalRequestId: externalId, redactedPayload: { ...payload, parameters } });
        // Authentication/invalid API responses do not establish that the paid generation failed.
        if (responseStatus !== undefined && responseStatus >= 400) throw new Error("poll_unavailable");
        if (result.redactedResponse.failureCode) throw new Error("poll_unavailable");
        if (result.status === "failed") return failure("provider_generation_failed");
        const videoUrl = "videoUrl" in result ? result.videoUrl : undefined;
        if (result.status === "succeeded" && !safeMediaUrl(videoUrl)) throw new Error("poll_output_missing");
        return { status: result.status === "succeeded" ? "succeeded" : "running", externalId, result: {
          ...(result.status === "succeeded" ? { videoUrl: videoUrl as string } : {}), usage: null,
        } };
      }
      const result = await adapter.submit({
        providerRequestId: requestId, providerName: model.providerName, providerOperation: operation,
        requestKey: requestId, payloadRef: requestId, payloadHash: "", redactedPayload: { ...payload, parameters },
      });
      if (operation === "speech") {
        const audioUrl = result.artifacts?.find((artifact) => artifact.mediaType === "audio")?.url;
        if (!safeMediaUrl(audioUrl)) throw new Error("audio_output_missing");
        return { status: "succeeded", externalId: result.externalRequestId, result: {
          audioUrl, usage: safeUsage({ characters: result.redactedResponse?.usageCharacters }),
        } };
      }
      return { status: "running", externalId: result.externalRequestId, result: { usage: null } };
    } catch {
      if (polling) throw new Error("provider_poll_unavailable");
      if (!started) return failure("provider_configuration_or_input_invalid");
      if (responseStatus && responseStatus >= 400 && responseStatus < 500 && responseStatus !== 408) {
        return failure(responseStatus === 401 || responseStatus === 403 ? "provider_authentication_failed" : "provider_rejected");
      }
      // Never resubmit after transport loss, malformed acceptance, or truncated streaming output.
      throw new Error("provider_result_unknown");
    }
  }

  return { supports, submit: (model, operation, payload, requestId) => execute(model, operation, payload, requestId),
    poll: (model, operation, payload, externalId, requestId) => execute(model, operation, payload, requestId, externalId) };
}

function failure(error: string): ExecutionResult { return { status: "failed", result: { usage: null }, error }; }
function string(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function safeUsage(value: unknown): Usage {
  const source = record(value);
  const values = Object.fromEntries(usageKeys.filter((key) => typeof source[key] === "number" && Number.isFinite(source[key]) && (source[key] as number) >= 0).map((key) => [key, source[key] as number]));
  return Object.keys(values).length ? values : null;
}
function absoluteEndpoint(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? value : undefined;
  } catch { return undefined; }
}
function safeMediaUrl(value: unknown) { return typeof value === "string" && Boolean(absoluteEndpoint(value)); }
// Mirrors the existing adapter factory endpoint precedence without importing unrelated providers.
function endpoint(config: Record<string, unknown>, field: "createTaskEndpoint" | "queryTaskEndpoint") {
  const configured = string(config[field]);
  const path = field === "createTaskEndpoint" ? string(config.requestPath) : undefined;
  const preferred = field === "createTaskEndpoint" && config.requestFormat === "globalaiopc_model_center_video" ? configured ?? path : path ?? configured;
  if (!preferred) return undefined;
  if (/^https?:\/\//i.test(preferred)) return absoluteEndpoint(preferred);
  const base = string(config.baseURL);
  return base ? absoluteEndpoint(`${base.replace(/\/+$/, "")}/${preferred.replace(/^\/+/, "")}`) : undefined;
}
