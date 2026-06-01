import { TextModelGatewayError } from "./text-model-gateway.errors.ts";

export interface TextModelCatalogEntry {
  id: string;
  label: string;
  providerName: string;
  providerModel: string;
  baseURL: string;
  apiKeyEnv: string;
  enabled: boolean;
}

export interface ResolvedTextModelCatalogEntry extends TextModelCatalogEntry {
  apiKey: string;
}

export function createDefaultTextModelCatalog(): TextModelCatalogEntry[] {
  return [
    {
      id: "deepseek-chat",
      label: "DeepSeek Chat",
      providerName: "deepseek",
      providerModel: "deepseek-chat",
      baseURL: "https://api.deepseek.com",
      apiKeyEnv: "DEEPSEEK_API_KEY",
      enabled: true,
    },
    {
      id: "qwen-plus",
      label: "Qwen Plus",
      providerName: "qwen",
      providerModel: "qwen-plus",
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKeyEnv: "DASHSCOPE_API_KEY",
      enabled: true,
    },
  ];
}

export function resolveTextModelCatalogEntry(
  catalog: readonly TextModelCatalogEntry[],
  model: string,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedTextModelCatalogEntry {
  const normalizedModel = model.trim();
  const entry = catalog.find((candidate) => candidate.id === normalizedModel);

  if (!entry) {
    throw new TextModelGatewayError("model_not_configured");
  }

  if (!entry.enabled) {
    throw new TextModelGatewayError("model_disabled");
  }

  const apiKey = env[entry.apiKeyEnv]?.trim();
  if (!apiKey) {
    throw new TextModelGatewayError("provider_auth_missing");
  }

  return {
    ...entry,
    apiKey,
  };
}
