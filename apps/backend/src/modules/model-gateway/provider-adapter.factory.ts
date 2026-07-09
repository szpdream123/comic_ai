import type { ProviderAdapter } from "./provider-adapter.contract.ts";
import { AliyunBailianVideoProviderAdapter } from "./aliyun-bailian-video.provider-adapter.ts";
import { createCreatorDevProviderAdapter } from "./creator-dev.provider-adapter.ts";
import { CumobImageProviderAdapter } from "./cumob-image.provider-adapter.ts";
import { ExtraTokenVideoProviderAdapter } from "./extra-token-video.provider-adapter.ts";
import { GlobalAiOpcImageProviderAdapter } from "./global-ai-opc-image.provider-adapter.ts";
import { GlobalAiOpcVideoProviderAdapter } from "./global-ai-opc-video.provider-adapter.ts";
import { HttpProviderAdapter } from "./http-provider-adapter.ts";
import { LingdongApiProviderAdapter } from "./lingdong-api.provider-adapter.ts";
import { OpenAIImagesProviderAdapter } from "./openai-images.provider-adapter.ts";
import { SeedanceVideoProviderAdapter } from "./seedance-video.provider-adapter.ts";
import { VolcengineArkImageProviderAdapter } from "./volcengine-ark-image.provider-adapter.ts";
import {
  normalizeProviderProtocol,
  resolveImageProviderAdapterKey,
} from "../model-catalog/provider-adapter-routing.ts";

export interface ModelProviderAdapterConfig {
  providerProtocol: string;
  providerModel?: string | null;
  providerConfig?: Record<string, unknown> | null;
}

export function createProviderAdapterFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
): ProviderAdapter {
  const mode = env.MODEL_PROVIDER_MODE ?? "dev";

  if (mode === "http") {
    const endpoint = env.MODEL_PROVIDER_ENDPOINT?.trim();
    if (!endpoint) {
      throw new Error("model_provider_endpoint_required");
    }

    return new HttpProviderAdapter({
      endpoint,
      apiKey: env.MODEL_PROVIDER_API_KEY?.trim() || undefined,
      fetchImpl,
    });
  }

  if (mode === "openai_images") {
    const apiKey = env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("openai_api_key_required");
    }

    return new OpenAIImagesProviderAdapter({
      apiKey,
      model: env.OPENAI_IMAGE_MODEL?.trim() || undefined,
      fetchImpl,
    });
  }

  return createCreatorDevProviderAdapter();
}

export function createProviderAdapterFromModelConfig(
  modelConfig: ModelProviderAdapterConfig,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
): ProviderAdapter {
  const providerProtocol = normalizeProviderProtocol(modelConfig.providerProtocol);
  const providerConfig = modelConfig.providerConfig ?? {};
  if (isGlobalAiOpcVideoConfig(providerProtocol, providerConfig)) {
    const createTaskEndpoint = resolveProviderEndpoint(providerConfig, "createTaskEndpoint");
    if (!createTaskEndpoint) {
      throw new Error("provider_endpoint_required");
    }

    return new GlobalAiOpcVideoProviderAdapter({
      apiKey: resolveProviderApiKey(providerConfig, env),
      model: modelConfig.providerModel?.trim() || undefined,
      createTaskEndpoint,
      queryTaskEndpoint: resolveProviderEndpoint(providerConfig, "queryTaskEndpoint"),
      requestTimeoutMs: resolveProviderTimeoutMs(providerConfig),
      defaultRequestParams: readRecord(providerConfig.defaultRequestParams),
      fetchImpl,
    });
  }

  const imageAdapterKey = resolveImageProviderAdapterKey(providerProtocol, providerConfig);

  if (imageAdapterKey === "openai_images") {
    const endpoint = resolveProviderEndpoint(providerConfig);
    if (!endpoint) {
      throw new Error("provider_endpoint_required");
    }

    return new OpenAIImagesProviderAdapter({
      apiKey: resolveProviderApiKey(providerConfig, env),
      model: modelConfig.providerModel?.trim() || undefined,
      endpoint,
      editEndpoint: resolveProviderEndpoint(providerConfig, "editEndpoint"),
      requestTimeoutMs: resolveProviderTimeoutMs(providerConfig),
      resultFormat: resolveProviderResultFormat(providerConfig),
      fetchImpl,
    });
  }

  if (imageAdapterKey === "lingdong_api") {
    const mediaType = readNonEmptyString(providerConfig.mediaType);
    const inferredMediaType = mediaType === "video" || mediaType === "image"
      ? mediaType
      : resolveProviderEndpoint(providerConfig, "queryTaskEndpoint")
      ? "video"
      : "image";

    if (inferredMediaType === "video") {
      const createTaskEndpoint = resolveProviderEndpoint(providerConfig, "createTaskEndpoint");
      if (!createTaskEndpoint) {
        throw new Error("provider_endpoint_required");
      }
      return new LingdongApiProviderAdapter({
        apiKey: resolveProviderApiKey(providerConfig, env),
        model: modelConfig.providerModel?.trim() || undefined,
        mediaType: "video",
        createTaskEndpoint,
        queryTaskEndpoint: resolveProviderEndpoint(providerConfig, "queryTaskEndpoint"),
        fetchImpl,
      });
    }

    const imageEndpoint = resolveProviderEndpoint(providerConfig);
    if (!imageEndpoint) {
      throw new Error("provider_endpoint_required");
    }
    return new LingdongApiProviderAdapter({
      apiKey: resolveProviderApiKey(providerConfig, env),
      model: modelConfig.providerModel?.trim() || undefined,
      mediaType: "image",
      imageEndpoint,
      fetchImpl,
    });
  }

  if (imageAdapterKey === "cumob_image") {
    const endpoint = resolveProviderEndpoint(providerConfig);
    if (!endpoint) {
      throw new Error("provider_endpoint_required");
    }

    return new CumobImageProviderAdapter({
      apiKey: resolveProviderApiKey(providerConfig, env),
      model: modelConfig.providerModel?.trim() || undefined,
      endpoint,
      requestTimeoutMs: resolveProviderTimeoutMs(providerConfig),
      defaultRequestParams: readRecord(providerConfig.defaultRequestParams),
      fetchImpl,
    });
  }

  if (imageAdapterKey === "global_ai_opc_image") {
    const createTaskEndpoint =
      resolveProviderEndpoint(providerConfig, "createTaskEndpoint") ??
      resolveProviderEndpoint(providerConfig);
    if (!createTaskEndpoint) {
      throw new Error("provider_endpoint_required");
    }

    return new GlobalAiOpcImageProviderAdapter({
      apiKey: resolveProviderApiKey(providerConfig, env),
      model: modelConfig.providerModel?.trim() || undefined,
      createTaskEndpoint,
      queryTaskEndpoint: resolveProviderEndpoint(providerConfig, "queryTaskEndpoint"),
      requestTimeoutMs: resolveProviderTimeoutMs(providerConfig),
      pollIntervalMs: resolveProviderPositiveInteger(providerConfig, "pollIntervalMs"),
      maxPollAttempts: resolveProviderPositiveInteger(providerConfig, "maxPollAttempts"),
      requestFormat: readNonEmptyString(providerConfig.requestFormat),
      defaultRequestParams: readRecord(providerConfig.defaultRequestParams),
      fetchImpl,
    });
  }

  if (providerProtocol === "custom_http") {
    const requestFormat = readNonEmptyString(providerConfig.requestFormat);
    const createTaskEndpoint = resolveProviderEndpoint(providerConfig, "createTaskEndpoint");
    const imageGenerationEndpoint = resolveProviderEndpoint(providerConfig);
    const extraTokenBaseURL = resolveExtraTokenVideoBaseURL(providerConfig);
    if (isGlobalAiOpcVideoConfig(providerConfig, createTaskEndpoint)) {
      return new GlobalAiOpcVideoProviderAdapter({
        apiKey: resolveProviderApiKey(providerConfig, env),
        model: modelConfig.providerModel?.trim() || undefined,
        createTaskEndpoint: createTaskEndpoint ?? joinUrl(resolveGlobalAiOpcBaseURL(providerConfig), "/v1/sd2_manxue/videos"),
        queryTaskEndpoint: resolveProviderEndpoint(providerConfig, "queryTaskEndpoint") ??
          joinUrl(resolveGlobalAiOpcBaseURL(providerConfig), "/v1/result/{taskId}"),
        requestFormat,
        fetchImpl,
      });
    }
    if (
      extraTokenBaseURL &&
      (
        requestFormat === "volcengine_ark_contents_generation" ||
        createTaskEndpoint?.includes("/contents/generations/tasks")
      )
    ) {
      return new ExtraTokenVideoProviderAdapter({
        apiKey: resolveProviderApiKey(providerConfig, env),
        model: modelConfig.providerModel?.trim() || undefined,
        createTaskEndpoint: joinUrl(extraTokenBaseURL, "/api/v1/video-generation"),
        queryTaskEndpoint: joinUrl(extraTokenBaseURL, "/api/v1/video-generation/tasks/{taskId}?model={model}"),
        fetchImpl,
      });
    }
    if (
      requestFormat === "volcengine_ark_contents_generation" ||
      createTaskEndpoint?.includes("/contents/generations/tasks")
    ) {
      if (!createTaskEndpoint) {
        throw new Error("provider_endpoint_required");
      }

      return new SeedanceVideoProviderAdapter({
        apiKey: resolveProviderApiKey(providerConfig, env),
        model: modelConfig.providerModel?.trim() || undefined,
        createTaskEndpoint,
        queryTaskEndpoint: resolveProviderEndpoint(providerConfig, "queryTaskEndpoint"),
        fetchImpl,
      });
    }
    if (
      requestFormat === "volcengine_ark_image" ||
      requestFormat === "volcengine_ark_images_generation" ||
      imageGenerationEndpoint?.includes("/images/generations")
    ) {
      const endpoint = createTaskEndpoint ?? imageGenerationEndpoint;
      if (!endpoint) {
        throw new Error("provider_endpoint_required");
      }

      return new VolcengineArkImageProviderAdapter({
        apiKey: resolveProviderApiKey(providerConfig, env),
        model: modelConfig.providerModel?.trim() || undefined,
        createTaskEndpoint: endpoint,
        queryTaskEndpoint: createTaskEndpoint
          ? resolveProviderEndpoint(providerConfig, "queryTaskEndpoint")
          : undefined,
        outputFormat: readNonEmptyString(providerConfig.outputFormat),
        pollIntervalMs: resolveProviderPositiveInteger(providerConfig, "pollIntervalMs"),
        maxPollAttempts: resolveProviderPositiveInteger(providerConfig, "maxPollAttempts"),
        fetchImpl,
      });
    }

    const endpoint = resolveProviderEndpoint(providerConfig);
    if (!endpoint) {
      throw new Error("provider_endpoint_required");
    }

    return new HttpProviderAdapter({
      endpoint,
      apiKey: resolveOptionalProviderApiKey(providerConfig, env),
      fetchImpl,
    });
  }

  if (providerProtocol === "volcengine_ark_video") {
    const createTaskEndpoint = resolveProviderEndpoint(providerConfig, "createTaskEndpoint");
    const lingdongVideoEndpoint = resolveLingdongVideoCreateEndpoint(providerConfig, createTaskEndpoint);
    if (lingdongVideoEndpoint) {
      return new LingdongApiProviderAdapter({
        apiKey: resolveProviderApiKey(providerConfig, env),
        model: modelConfig.providerModel?.trim() || undefined,
        mediaType: "video",
        createTaskEndpoint: lingdongVideoEndpoint,
        queryTaskEndpoint: resolveLingdongVideoQueryEndpoint(providerConfig),
        fetchImpl,
      });
    }
    const extraTokenBaseURL = resolveExtraTokenVideoBaseURL(providerConfig);
    if (extraTokenBaseURL) {
      return new ExtraTokenVideoProviderAdapter({
        apiKey: resolveProviderApiKey(providerConfig, env),
        model: modelConfig.providerModel?.trim() || undefined,
        createTaskEndpoint: joinUrl(extraTokenBaseURL, "/api/v1/video-generation"),
        queryTaskEndpoint: joinUrl(extraTokenBaseURL, "/api/v1/video-generation/tasks/{taskId}?model={model}"),
        fetchImpl,
      });
    }
    if (!createTaskEndpoint) {
      throw new Error("provider_endpoint_required");
    }

    return new SeedanceVideoProviderAdapter({
      apiKey: resolveProviderApiKey(providerConfig, env),
      model: modelConfig.providerModel?.trim() || undefined,
      createTaskEndpoint,
      queryTaskEndpoint: resolveProviderEndpoint(providerConfig, "queryTaskEndpoint"),
      fetchImpl,
    });
  }

  if (providerProtocol === "aliyun_bailian_video") {
    const createTaskEndpoint = resolveProviderEndpoint(providerConfig, "createTaskEndpoint");
    if (!createTaskEndpoint) {
      throw new Error("provider_endpoint_required");
    }

    return new AliyunBailianVideoProviderAdapter({
      apiKey: resolveProviderApiKey(providerConfig, env),
      model: modelConfig.providerModel?.trim() || undefined,
      createTaskEndpoint,
      queryTaskEndpoint: resolveProviderEndpoint(providerConfig, "queryTaskEndpoint"),
      fetchImpl,
    });
  }

  if (providerProtocol === "globalaiopc_video") {
    const createTaskEndpoint = resolveProviderEndpoint(providerConfig, "createTaskEndpoint");
    if (!createTaskEndpoint) {
      throw new Error("provider_endpoint_required");
    }
    const queryTaskEndpoint = resolveProviderEndpoint(providerConfig, "queryTaskEndpoint");
    if (!queryTaskEndpoint) {
      throw new Error("provider_query_endpoint_required");
    }

    return new GlobalAiOpcVideoProviderAdapter({
      apiKey: resolveProviderApiKey(providerConfig, env),
      model: modelConfig.providerModel?.trim() || undefined,
      createTaskEndpoint,
      queryTaskEndpoint,
      requestFormat: readNonEmptyString(providerConfig.requestFormat),
      fetchImpl,
    });
  }

  if (providerProtocol === "creator_dev" || providerProtocol === "dev") {
    return createCreatorDevProviderAdapter();
  }

  throw new Error("provider_adapter_missing");
}

function resolveProviderEndpoint(
  providerConfig: Record<string, unknown>,
  endpointField = "endpoint",
): string | undefined {
  const requestPath = endpointField === "endpoint" || endpointField === "createTaskEndpoint"
    ? readNonEmptyString(providerConfig.requestPath)
    : undefined;
  const endpoint = requestPath ?? readNonEmptyString(providerConfig[endpointField]);
  const baseURL = readNonEmptyString(providerConfig.baseURL);

  if (endpoint && isAbsoluteHttpUrl(endpoint)) {
    return endpoint;
  }

  if (baseURL && endpoint) {
    return joinUrl(baseURL, endpoint);
  }

  if (endpointField !== "endpoint") {
    return endpoint;
  }

  return endpoint ?? baseURL;
}

function resolveProviderApiKey(
  providerConfig: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): string {
  const directApiKey = readNonEmptyString(providerConfig.apiKey);
  if (directApiKey) {
    return directApiKey;
  }

  const apiKeyEnv = readNonEmptyString(providerConfig.apiKeyEnv);
  if (!apiKeyEnv) {
    throw Object.assign(new Error("provider_api_key_env_required"), {
      failureCode: "provider_api_key_env_required",
      apiKeyEnv: "",
    });
  }

  const apiKey = env[apiKeyEnv]?.trim();
  if (!apiKey) {
    throw Object.assign(new Error("provider_api_key_missing"), {
      failureCode: "provider_api_key_missing",
      apiKeyEnv,
    });
  }

  return apiKey;
}

function resolveOptionalProviderApiKey(
  providerConfig: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const directApiKey = readNonEmptyString(providerConfig.apiKey);
  if (directApiKey) {
    return directApiKey;
  }

  const apiKeyEnv = readNonEmptyString(providerConfig.apiKeyEnv);
  if (!apiKeyEnv) {
    return undefined;
  }

  return env[apiKeyEnv]?.trim() || undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function resolveProviderTimeoutMs(providerConfig: Record<string, unknown>): number | undefined {
  return resolveProviderPositiveInteger(providerConfig, "timeoutMs");
}

function resolveProviderPositiveInteger(
  providerConfig: Record<string, unknown>,
  fieldName: string,
): number | undefined {
  const raw = providerConfig[fieldName];
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
  }
  return undefined;
}

function resolveProviderResultFormat(providerConfig: Record<string, unknown>): string | undefined {
  const resultFormat = readNonEmptyString(providerConfig.resultFormat);
  return resultFormat === "b64_json" || resultFormat === "url"
    ? resultFormat
    : undefined;
}

function resolveExtraTokenVideoBaseURL(providerConfig: Record<string, unknown>): string | undefined {
  const baseURL = readNonEmptyString(providerConfig.baseURL);
  if (baseURL && isExtraTokenUrl(baseURL)) {
    return baseURL;
  }

  for (const field of ["endpoint", "requestPath", "createTaskEndpoint", "queryTaskEndpoint"]) {
    const endpoint = readNonEmptyString(providerConfig[field]);
    if (endpoint && isExtraTokenUrl(endpoint)) {
      return readUrlOrigin(endpoint);
    }
  }

  if (!isExtraTokenApiKey(providerConfig)) {
    return undefined;
  }

  if (readNonEmptyString(providerConfig.requestFormat) === "volcengine_ark_contents_generation" && baseURL && isVolcengineArkUrl(baseURL)) {
    return undefined;
  }

  if (baseURL && !isVolcengineArkUrl(baseURL)) {
    return baseURL;
  }

  return "https://www.extratoken.cn";
}

function isGlobalAiOpcVideoConfig(providerProtocol: string, providerConfig: Record<string, unknown>) {
  if (providerProtocol === "globalaiopc_video" || providerProtocol === "global_ai_opc_video") {
    return true;
  }
  const requestFormat = readNonEmptyString(providerConfig.requestFormat) ?? "";
  if (requestFormat.startsWith("globalaiopc_") || requestFormat.startsWith("global_ai_opc_video")) {
    return true;
  }
  const apiKeyEnv = readNonEmptyString(providerConfig.apiKeyEnv)?.toUpperCase() ?? "";
  return apiKeyEnv === "GLOBAL_AI_OPC_API_KEY" && hasVideoEndpoint(providerConfig);
}

function hasVideoEndpoint(providerConfig: Record<string, unknown>) {
  return [
    providerConfig.createTaskEndpoint,
    providerConfig.requestPath,
    providerConfig.endpoint,
  ].some((value) => readNonEmptyString(value)?.toLowerCase().includes("/videos"));
}

function isExtraTokenApiKey(providerConfig: Record<string, unknown>): boolean {
  const apiKeyEnv = readNonEmptyString(providerConfig.apiKeyEnv)?.toLowerCase() ?? "";
  const normalized = apiKeyEnv.replace(/[^a-z0-9]/g, "");
  return normalized.includes("extratoken") || normalized.includes("extratoekn");
}

function isExtraTokenUrl(value: string): boolean {
  const host = readUrlHost(value);
  return host === "extratoken.cn" || host.endsWith(".extratoken.cn");
}

function isVolcengineArkUrl(value: string): boolean {
  const host = readUrlHost(value);
  return host === "volces.com" || host.endsWith(".volces.com");
}

function readUrlHost(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function readUrlOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function readUrl(value: string | undefined): URL | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function joinUrl(baseURL: string, endpoint: string): string {
  return `${baseURL.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
}

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
