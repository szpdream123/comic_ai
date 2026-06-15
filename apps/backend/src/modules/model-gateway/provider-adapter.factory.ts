import type { ProviderAdapter } from "./provider-adapter.contract.ts";
import { AliyunBailianVideoProviderAdapter } from "./aliyun-bailian-video.provider-adapter.ts";
import { createCreatorDevProviderAdapter } from "./creator-dev.provider-adapter.ts";
import { HttpProviderAdapter } from "./http-provider-adapter.ts";
import { OpenAIImagesProviderAdapter } from "./openai-images.provider-adapter.ts";
import { SeedanceVideoProviderAdapter } from "./seedance-video.provider-adapter.ts";
import { VolcengineArkImageProviderAdapter } from "./volcengine-ark-image.provider-adapter.ts";

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
  const providerProtocol = modelConfig.providerProtocol.trim().replaceAll("-", "_");
  const providerConfig = modelConfig.providerConfig ?? {};

  if (providerProtocol === "openai_images") {
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

  if (providerProtocol === "custom_http") {
    const requestFormat = readNonEmptyString(providerConfig.requestFormat);
    const createTaskEndpoint = resolveProviderEndpoint(providerConfig, "createTaskEndpoint");
    const imageGenerationEndpoint = resolveProviderEndpoint(providerConfig);
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

  if (providerProtocol === "creator_dev" || providerProtocol === "dev") {
    return createCreatorDevProviderAdapter();
  }

  throw new Error("provider_adapter_missing");
}

function resolveProviderEndpoint(
  providerConfig: Record<string, unknown>,
  endpointField = "endpoint",
): string | undefined {
  const endpoint = readNonEmptyString(providerConfig[endpointField]);
  const baseURL = readNonEmptyString(providerConfig.baseURL);

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

function joinUrl(baseURL: string, endpoint: string): string {
  return `${baseURL.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
}
