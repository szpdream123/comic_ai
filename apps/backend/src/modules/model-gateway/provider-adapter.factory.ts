import type { ProviderAdapter } from "./provider-adapter.contract.ts";
import { createCreatorDevProviderAdapter } from "./creator-dev.provider-adapter.ts";
import { HttpProviderAdapter } from "./http-provider-adapter.ts";
import { OpenAIImagesProviderAdapter } from "./openai-images.provider-adapter.ts";
import { SeedanceVideoProviderAdapter } from "./seedance-video.provider-adapter.ts";

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
  const providerProtocol = modelConfig.providerProtocol.trim();
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
      fetchImpl,
    });
  }

  if (providerProtocol === "custom_http") {
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

  return endpoint ?? baseURL;
}

function resolveProviderApiKey(
  providerConfig: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): string {
  const apiKeyEnv = readNonEmptyString(providerConfig.apiKeyEnv);
  if (!apiKeyEnv) {
    throw new Error("provider_api_key_env_required");
  }

  const apiKey = env[apiKeyEnv]?.trim();
  if (!apiKey) {
    throw new Error("provider_api_key_missing");
  }

  return apiKey;
}

function resolveOptionalProviderApiKey(
  providerConfig: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): string | undefined {
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

function joinUrl(baseURL: string, endpoint: string): string {
  return `${baseURL.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
}
