import type { ProviderAdapter } from "./provider-adapter.contract.ts";
import { AliyunBailianAudioProviderAdapter } from "./aliyun-bailian-audio.provider-adapter.ts";
import { ApiMartAudioProviderAdapter } from "./apimart-audio.provider-adapter.ts";
import { AliyunBailianVideoProviderAdapter } from "./aliyun-bailian-video.provider-adapter.ts";
import { BananaRouterProviderAdapter } from "./bananarouter.provider-adapter.ts";
import {
  ChiYuanVideoProviderAdapter,
  isChiYuanVideoRequestFormat,
  validateChiYuanVideoProviderConfig,
} from "./chiyuan-video.provider-adapter.ts";
import { createCreatorDevProviderAdapter } from "./creator-dev.provider-adapter.ts";
import { CumobImageProviderAdapter } from "./cumob-image.provider-adapter.ts";
import { ExtraTokenVideoProviderAdapter } from "./extra-token-video.provider-adapter.ts";
import { GlobalAiOpcVideoProviderAdapter } from "./globalaiopc-video.provider-adapter.ts";
import { HttpProviderAdapter } from "./http-provider-adapter.ts";
import { LingdongApiProviderAdapter } from "./lingdong-api.provider-adapter.ts";
import { ModelError } from "./model-error.ts";
import { OpenAIImagesProviderAdapter } from "./openai-images.provider-adapter.ts";
import { SaierVideoProviderAdapter } from "./saier-video.provider-adapter.ts";
import { SanBaoProviderAdapter } from "./san-bao.provider-adapter.ts";
import { SeedanceVideoProviderAdapter } from "./seedance-video.provider-adapter.ts";
import { VolcengineArkImageProviderAdapter } from "./volcengine-ark-image.provider-adapter.ts";
import { GlobalAiOpcImageProviderAdapter } from "./global-ai-opc-image.provider-adapter.ts";
import { GlobalAiOpcSoundCloneProviderAdapter } from "./globalaiopc-sound-clone.provider-adapter.ts";
import {
  normalizeProviderProtocol,
  resolveImageProviderAdapterKey,
} from "../model-catalog/provider-adapter-routing.ts";

export interface ModelProviderAdapterConfig {
  providerProtocol: string;
  providerModel?: string | null;
  mediaType?: string | null;
  providerConfig?: Record<string, unknown> | null;
  invocationMode?: string | null;
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
  if (providerProtocol === "san_bao") {
    const mediaType = modelConfig.mediaType?.trim();
    if (mediaType !== "image" && mediaType !== "video") {
      throw ModelError.fromUnknown(new Error("provider_media_type_required"), {
        failureCode: "provider_adapter_missing",
      });
    }
    const createTaskEndpoint = resolveProviderEndpoint(providerConfig, "createTaskEndpoint")
      ?? resolveProviderEndpoint(providerConfig);
    const queryTaskEndpoint = resolveProviderEndpoint(providerConfig, "queryTaskEndpoint");
    if (!createTaskEndpoint || !queryTaskEndpoint) {
      throw ModelError.fromUnknown(new Error("provider_endpoint_required"), {
        failureCode: "provider_adapter_missing",
      });
    }
    let apiKey: string;
    try {
      apiKey = resolveProviderApiKey(providerConfig, env);
    } catch (error) {
      throw ModelError.fromUnknown(error, {
        failureCode: error && typeof error === "object" && typeof (error as { failureCode?: unknown }).failureCode === "string"
          ? (error as { failureCode: string }).failureCode
          : "provider_api_key_missing",
        mediaType,
        phase: "prepare",
      });
    }
    return new SanBaoProviderAdapter({
      apiKey,
      model: modelConfig.providerModel?.trim() || undefined,
      modelVariants: readRecord(providerConfig.modelVariants),
      mediaType,
      createTaskEndpoint,
      queryTaskEndpoint,
      fetchImpl,
    });
  }
  if (providerProtocol === "banana_router") {
    const configError = validateBananaRouterProviderConfig(modelConfig);
    if (configError) {
      throw ModelError.fromUnknown(new Error(configError), {
        failureCode: "provider_adapter_missing",
      });
    }
    const createTaskEndpoint = resolveBananaRouterEndpoint(providerConfig, "createTaskEndpoint");
    const requestFormat = readNonEmptyString(providerConfig.requestFormat);
    if (!createTaskEndpoint) {
      throw ModelError.fromUnknown(new Error("provider_endpoint_required"), {
        failureCode: "provider_adapter_missing",
      });
    }
    if (!isBananaRouterRequestFormat(requestFormat)) {
      throw ModelError.fromUnknown(new Error("provider_request_format_required"), {
        failureCode: "provider_adapter_missing",
      });
    }
    return new BananaRouterProviderAdapter({
      apiKey: resolveBananaRouterApiKey(providerConfig, env),
      model: modelConfig.providerModel?.trim() || undefined,
      requestFormat,
      createTaskEndpoint,
      editEndpoint: resolveBananaRouterEndpoint(providerConfig, "editEndpoint"),
      queryTaskEndpoint: resolveBananaRouterEndpoint(providerConfig, "queryTaskEndpoint"),
      resultFormat: resolveProviderResultFormat(providerConfig),
      fetchImpl,
    });
  }
  if (providerProtocol === "chiyuan_video") {
    const configError = validateChiYuanVideoProviderConfig({
      mediaType: modelConfig.mediaType,
      providerModel: modelConfig.providerModel,
      providerConfig,
    }, { allowRuntimeResolvedApiKey: true });
    if (configError) {
      throw providerAdapterConfigError(configError, { providerProtocol });
    }
    if (modelConfig.mediaType?.trim() !== "video") {
      throw providerAdapterConfigError("provider_request_format_media_mismatch", { providerProtocol });
    }
    const requestFormat = readNonEmptyString(providerConfig.requestFormat);
    if (!isChiYuanVideoRequestFormat(requestFormat)) {
      throw providerAdapterConfigError("provider_request_format_required", { providerProtocol });
    }
    const createTaskEndpoint = resolveProviderEndpoint(providerConfig, "createTaskEndpoint");
    const queryTaskEndpoint = resolveProviderEndpoint(providerConfig, "queryTaskEndpoint");
    if (!createTaskEndpoint) {
      throw providerAdapterConfigError("provider_endpoint_required", { providerProtocol });
    }
    if (!queryTaskEndpoint) {
      throw providerAdapterConfigError("provider_query_endpoint_required", { providerProtocol });
    }
    return new ChiYuanVideoProviderAdapter({
      apiKey: resolveProviderApiKey(providerConfig, env),
      model: modelConfig.providerModel?.trim() || undefined,
      requestFormat,
      createTaskEndpoint,
      queryTaskEndpoint,
      fetchImpl,
    });
  }
  const imageAdapterKey = resolveImageProviderAdapterKey(providerProtocol, providerConfig);

  if (imageAdapterKey === "openai_images") {
    const endpoint = resolveProviderEndpoint(providerConfig);
    if (!endpoint) {
      throw providerAdapterConfigError("provider_endpoint_required", { providerProtocol });
    }

    return new OpenAIImagesProviderAdapter({
      apiKey: resolveProviderApiKey(providerConfig, env),
      model: modelConfig.providerModel?.trim() || undefined,
      endpoint,
      editEndpoint: resolveProviderEndpoint(providerConfig, "editEndpoint"),
      resultFormat: resolveProviderResultFormat(providerConfig),
      fetchImpl,
    });
  }

  if (imageAdapterKey === "lingdong_api") {
    const mediaType = readNonEmptyString(providerConfig.mediaType);

    if (mediaType === "video") {
      return new LingdongApiProviderAdapter({
        apiKey: resolveProviderApiKey(providerConfig, env),
        model: modelConfig.providerModel?.trim() || undefined,
        mediaType: "video",
        createTaskEndpoint: "https://www.lingdongapi.com/v1/video/generations",
        queryTaskEndpoint: "https://www.lingdongapi.com/v1/video/generations/{taskId}",
        fetchImpl,
      });
    }

    const imageEndpoint = resolveProviderEndpoint(providerConfig);
    if (!imageEndpoint) {
      throw providerAdapterConfigError("provider_endpoint_required", { providerProtocol });
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
      throw providerAdapterConfigError("provider_endpoint_required", { providerProtocol });
    }

    return new CumobImageProviderAdapter({
      apiKey: resolveProviderApiKey(providerConfig, env),
      model: modelConfig.providerModel?.trim() || undefined,
      endpoint,
      queryTaskEndpoint: resolveProviderEndpoint(providerConfig, "queryTaskEndpoint"),
      defaultRequestParams: readRecord(providerConfig.defaultRequestParams),
      fetchImpl,
    });
  }

  if (imageAdapterKey === "global_ai_opc_image") {
    const createTaskEndpoint =
      resolveProviderEndpoint(providerConfig, "createTaskEndpoint") ??
      resolveProviderEndpoint(providerConfig);
    if (!createTaskEndpoint) {
      throw providerAdapterConfigError("provider_endpoint_required", { providerProtocol });
    }
    return new GlobalAiOpcImageProviderAdapter({
      apiKey: resolveProviderApiKey(providerConfig, env),
      model: modelConfig.providerModel?.trim() || undefined,
      createTaskEndpoint,
      queryTaskEndpoint: resolveProviderEndpoint(providerConfig, "queryTaskEndpoint"),
      requestFormat: readNonEmptyString(providerConfig.requestFormat),
      defaultRequestParams: readRecord(providerConfig.defaultRequestParams),
      fetchImpl,
    });
  }

  if (imageAdapterKey === "volcengine_ark_image") {
    const createTaskEndpoint =
      resolveProviderEndpoint(providerConfig, "createTaskEndpoint") ??
      resolveProviderEndpoint(providerConfig);
    if (!createTaskEndpoint) {
      throw providerAdapterConfigError("provider_endpoint_required", { providerProtocol });
    }

    return new VolcengineArkImageProviderAdapter({
      apiKey: resolveProviderApiKey(providerConfig, env),
      model: modelConfig.providerModel?.trim() || undefined,
      createTaskEndpoint,
      queryTaskEndpoint: resolveProviderEndpoint(providerConfig, "queryTaskEndpoint"),
      outputFormat: readNonEmptyString(providerConfig.outputFormat),
      fetchImpl,
    });
  }

  if (providerProtocol === "extra_token_video") {
    const extraTokenBaseURL = resolveExtraTokenVideoBaseURL(providerConfig);
    if (!extraTokenBaseURL) {
      throw providerAdapterConfigError("provider_endpoint_required", { providerProtocol });
    }

    return new ExtraTokenVideoProviderAdapter({
      apiKey: resolveProviderApiKey(providerConfig, env),
      model: modelConfig.providerModel?.trim() || undefined,
      createTaskEndpoint: joinUrl(extraTokenBaseURL, "/api/v1/video-generation"),
      queryTaskEndpoint: joinUrl(extraTokenBaseURL, "/api/v1/video-generation/tasks/{taskId}?model={model}"),
      fetchImpl,
    });
  }

  if (providerProtocol === "globalaiopc_video" || providerProtocol === "global_ai_opc_video") {
    if (modelConfig.mediaType?.trim() !== "video") {
      throw providerAdapterConfigError("provider_request_format_media_mismatch", { providerProtocol });
    }
    const createTaskEndpoint = resolveProviderEndpoint(providerConfig, "createTaskEndpoint");
    const queryTaskEndpoint = resolveProviderEndpoint(providerConfig, "queryTaskEndpoint");
    if (!createTaskEndpoint) {
      throw providerAdapterConfigError("provider_endpoint_required", { providerProtocol });
    }
    if (!queryTaskEndpoint) {
      throw providerAdapterConfigError("provider_query_endpoint_required", { providerProtocol });
    }
    return new GlobalAiOpcVideoProviderAdapter({
      apiKey: resolveProviderApiKey(providerConfig, env),
      model: modelConfig.providerModel?.trim() || undefined,
      createTaskEndpoint,
      queryTaskEndpoint,
      fetchImpl,
    });
  }

  if (providerProtocol === "saier_video") {
    const createTaskEndpoint = resolveProviderEndpoint(providerConfig, "createTaskEndpoint");
    const queryTaskEndpoint = resolveProviderEndpoint(providerConfig, "queryTaskEndpoint");
    if (!createTaskEndpoint) {
      throw providerAdapterConfigError("provider_endpoint_required", { providerProtocol });
    }
    if (!queryTaskEndpoint) {
      throw providerAdapterConfigError("provider_query_endpoint_required", { providerProtocol });
    }

    return new SaierVideoProviderAdapter({
      apiKey: resolveProviderApiKey(providerConfig, env),
      model: modelConfig.providerModel?.trim() || undefined,
      createTaskEndpoint,
      queryTaskEndpoint,
      fetchImpl,
    });
  }

  if (providerProtocol === "globalaiopc_sound_clone" || providerProtocol === "global_ai_opc_sound_clone") {
    if (modelConfig.mediaType?.trim() !== "audio") {
      throw providerAdapterConfigError("provider_request_format_media_mismatch", { providerProtocol });
    }
    const createTaskEndpoint = resolveProviderEndpoint(providerConfig, "createTaskEndpoint");
    const queryTaskEndpoint = resolveProviderEndpoint(providerConfig, "queryTaskEndpoint");
    if (!createTaskEndpoint || !queryTaskEndpoint) {
      throw providerAdapterConfigError("provider_endpoint_required", { providerProtocol });
    }
    return new GlobalAiOpcSoundCloneProviderAdapter({
      apiKey: resolveProviderApiKey(providerConfig, env),
      createTaskEndpoint,
      queryTaskEndpoint,
      fetchImpl,
    });
  }

  if (providerProtocol === "custom_http") {
    const requestFormat = readNonEmptyString(providerConfig.requestFormat);
    const createTaskEndpoint = resolveProviderEndpoint(providerConfig, "createTaskEndpoint");
    const imageGenerationEndpoint = resolveProviderEndpoint(providerConfig);
    const extraTokenBaseURL = resolveExtraTokenVideoBaseURL(providerConfig);
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
        throw providerAdapterConfigError("provider_endpoint_required", { providerProtocol });
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
        throw providerAdapterConfigError("provider_endpoint_required", { providerProtocol });
      }

      return new VolcengineArkImageProviderAdapter({
        apiKey: resolveProviderApiKey(providerConfig, env),
        model: modelConfig.providerModel?.trim() || undefined,
        createTaskEndpoint: endpoint,
        queryTaskEndpoint: createTaskEndpoint
          ? resolveProviderEndpoint(providerConfig, "queryTaskEndpoint")
          : undefined,
        outputFormat: readNonEmptyString(providerConfig.outputFormat),
        fetchImpl,
      });
    }

    const endpoint = resolveProviderEndpoint(providerConfig);
    if (!endpoint) {
      throw providerAdapterConfigError("provider_endpoint_required", { providerProtocol });
    }

    return new HttpProviderAdapter({
      endpoint,
      apiKey: resolveOptionalProviderApiKey(providerConfig, env),
      fetchImpl,
    });
  }

  if (providerProtocol === "volcengine_ark_video") {
    const createTaskEndpoint = resolveProviderEndpoint(providerConfig, "createTaskEndpoint");
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
      throw providerAdapterConfigError("provider_endpoint_required", { providerProtocol });
    }

    return new SeedanceVideoProviderAdapter({
      apiKey: resolveProviderApiKey(providerConfig, env),
      model: modelConfig.providerModel?.trim() || undefined,
      createTaskEndpoint,
      queryTaskEndpoint: resolveProviderEndpoint(providerConfig, "queryTaskEndpoint"),
      fetchImpl,
    });
  }

  if (providerProtocol === "aliyun_bailian_audio") {
    const createTaskEndpoint = resolveProviderEndpoint(providerConfig, "createTaskEndpoint");
    if (!createTaskEndpoint) {
      throw providerAdapterConfigError("provider_endpoint_required", { providerProtocol });
    }

    return new AliyunBailianAudioProviderAdapter({
      apiKey: resolveProviderApiKey(providerConfig, env),
      model: modelConfig.providerModel?.trim() || undefined,
      createTaskEndpoint,
      queryTaskEndpoint: resolveProviderEndpoint(providerConfig, "queryTaskEndpoint"),
      fetchImpl,
    });
  }

  if (providerProtocol === "apimart_audio") {
    const baseURL = readNonEmptyString(providerConfig.baseURL);
    if (!baseURL) throw providerAdapterConfigError("provider_endpoint_required", { providerProtocol });
    return new ApiMartAudioProviderAdapter({
      apiKey: resolveProviderApiKey(providerConfig, env),
      model: modelConfig.providerModel?.trim() || undefined,
      lyricsEndpoint: joinUrl(baseURL, readNonEmptyString(providerConfig.lyricsPath) || "/music/generations/lyricsFlowMusic"),
      musicEndpoint: joinUrl(baseURL, readNonEmptyString(providerConfig.musicPath) || "/music/generations"),
      queryTaskEndpoint: joinUrl(baseURL, readNonEmptyString(providerConfig.queryTaskPath) || "/music/tasks/{taskId}?language=zh"),
      fetchImpl,
    });
  }

  if (providerProtocol === "aliyun_bailian_video") {
    const createTaskEndpoint = resolveProviderEndpoint(providerConfig, "createTaskEndpoint");
    if (!createTaskEndpoint) {
      throw providerAdapterConfigError("provider_endpoint_required", { providerProtocol });
    }

    return new AliyunBailianVideoProviderAdapter({
      apiKey: resolveProviderApiKey(providerConfig, env),
      model: modelConfig.providerModel?.trim() || undefined,
      createTaskEndpoint,
      queryTaskEndpoint: resolveProviderEndpoint(providerConfig, "queryTaskEndpoint"),
      fetchImpl,
    });
  }

  if (providerProtocol === "creator_dev" || providerProtocol === "dev") {
    return createCreatorDevProviderAdapter();
  }

  throw providerAdapterConfigError("provider_adapter_missing", {
    providerProtocol,
    mediaType: readNonEmptyString(modelConfig.mediaType) ?? null,
  });
}

// Adapter construction runs at submissionStage "provider_adapter_init", before
// any provider HTTP call. These used to be bare `new Error(...)`, carrying
// neither `failureCode` nor `code`, so readErrorFailureCode() returned
// undefined and the worker collapsed a precise configuration fault into the
// generic "provider_submission_failed" with the misleading
// "修改素材或提示词" message. Attaching failureCode keeps the real cause.
function providerAdapterConfigError(
  failureCode: string,
  details: Record<string, unknown> = {},
) {
  return Object.assign(new Error(failureCode), { failureCode, ...details });
}

export function validateBananaRouterProviderConfig(
  modelConfig: ModelProviderAdapterConfig,
): string | null {
  if (normalizeProviderProtocol(modelConfig.providerProtocol) !== "banana_router") return null;
  const providerConfig = modelConfig.providerConfig ?? {};
  const requestFormat = readNonEmptyString(providerConfig.requestFormat);
  if (!isBananaRouterRequestFormat(requestFormat)) return "provider_request_format_required";

  const createEndpoint = resolveProviderEndpoint(providerConfig, "createTaskEndpoint");
  if (!isBananaRouterEndpoint(createEndpoint)) return "provider_endpoint_invalid";
  const editEndpoint = resolveProviderEndpoint(providerConfig, "editEndpoint");
  if (editEndpoint && !isBananaRouterEndpoint(editEndpoint)) return "provider_endpoint_invalid";
  const queryEndpoint = resolveProviderEndpoint(providerConfig, "queryTaskEndpoint");
  if (queryEndpoint && !isBananaRouterEndpoint(queryEndpoint)) return "provider_endpoint_invalid";

  const mediaType = modelConfig.mediaType?.trim();
  const invocationMode = modelConfig.invocationMode?.trim();
  if (mediaType && mediaType !== "image" && mediaType !== "video") {
    return "provider_request_format_media_mismatch";
  }
  if (mediaType === "image" || requestFormat === "banana_router_openai_images") {
    if (
      requestFormat !== "banana_router_openai_images" ||
      invocationMode !== "async_polling"
    ) {
      return "provider_request_format_media_mismatch";
    }
    if (!isBananaRouterImageEndpoint(createEndpoint, "/v1/images/generations/async")) {
      return "provider_request_format_media_mismatch";
    }
    if (!isBananaRouterImageEndpoint(editEndpoint, "/v1/images/edits/async")) {
      return "provider_request_format_media_mismatch";
    }
    if (!isBananaRouterImageQueryEndpoint(queryEndpoint)) {
      return "provider_query_endpoint_required";
    }
  }
  if (mediaType === "video") {
    if (requestFormat === "banana_router_openai_images" || (invocationMode && invocationMode !== "async_polling")) {
      return "provider_request_format_media_mismatch";
    }
    if (!queryEndpoint || !queryEndpoint.includes("{taskId}")) {
      return "provider_query_endpoint_required";
    }
  }
  return null;
}

function resolveProviderEndpoint(
  providerConfig: Record<string, unknown>,
  endpointField = "endpoint",
): string | undefined {
  const configuredEndpoint = readNonEmptyString(providerConfig[endpointField]);
  const requestPath = endpointField === "endpoint" || endpointField === "createTaskEndpoint"
    ? readNonEmptyString(providerConfig.requestPath)
    : undefined;
  const preferConfiguredEndpoint = endpointField === "createTaskEndpoint"
    && [
      "global_ai_opc_model_center_seedream_image",
      "globalaiopc_model_center_video",
    ].includes(String(providerConfig.requestFormat ?? ""));
  const endpoint = preferConfiguredEndpoint
    ? configuredEndpoint ?? requestPath
    : requestPath ?? configuredEndpoint;
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

  const configuredApiKey = readNonEmptyString(env[apiKeyEnv]);
  if (configuredApiKey) {
    return configuredApiKey;
  }

  throw Object.assign(new Error("provider_api_key_missing"), {
    failureCode: "provider_api_key_missing",
    apiKeyEnv,
  });
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

  return readNonEmptyString(env[apiKeyEnv]);
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

function resolveBananaRouterEndpoint(
  providerConfig: Record<string, unknown>,
  endpointField: string,
): string | undefined {
  const endpoint = resolveProviderEndpoint(providerConfig, endpointField);
  if (!endpoint) return undefined;
  try {
    const url = new URL(endpoint);
    if (
      url.origin !== "https://api.bananarouter.com" ||
      url.username ||
      url.password
    ) {
      throw new Error("provider_endpoint_invalid");
    }
  } catch (error) {
    throw ModelError.fromUnknown(error, {
      failureCode: "provider_adapter_missing",
    });
  }
  return endpoint;
}

function isBananaRouterEndpoint(endpoint: string | undefined): boolean {
  if (!endpoint) return false;
  try {
    const url = new URL(endpoint);
    return url.origin === "https://api.bananarouter.com" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isBananaRouterImageEndpoint(endpoint: string | undefined, expectedPath: string): boolean {
  if (!endpoint) return false;
  try {
    const url = new URL(endpoint);
    return url.origin === "https://api.bananarouter.com" &&
      url.pathname.replace(/\/+$/g, "") === expectedPath;
  } catch {
    return false;
  }
}

function isBananaRouterImageQueryEndpoint(endpoint: string | undefined): boolean {
  if (!endpoint || !endpoint.includes("{taskId}")) return false;
  try {
    const url = new URL(endpoint);
    return url.origin === "https://api.bananarouter.com" &&
      decodeURIComponent(url.pathname).replace(/\/+$/g, "") === "/v1/async-tasks/{taskId}";
  } catch {
    return false;
  }
}

function resolveBananaRouterApiKey(
  providerConfig: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): string {
  try {
    return resolveProviderApiKey(providerConfig, env);
  } catch (error) {
    throw ModelError.fromUnknown(error);
  }
}

function isBananaRouterRequestFormat(value: string | undefined): value is
  | "banana_router_openai_images"
  | "banana_router_sora_video"
  | "banana_router_seedance_video" {
  return value === "banana_router_openai_images" ||
    value === "banana_router_sora_video" ||
    value === "banana_router_seedance_video";
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
