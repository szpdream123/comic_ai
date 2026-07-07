export type ImageProviderAdapterKey =
  | "openai_images"
  | "lingdong_api"
  | "cumob_image"
  | "global_ai_opc_image"
  | "custom_http";

interface ProviderAdapterRoute {
  adapterKey: ImageProviderAdapterKey;
  protocols: string[];
  requestFormats?: string[];
  apiKeyEnvs?: string[];
}

const imageProviderRoutes: ProviderAdapterRoute[] = [
  {
    adapterKey: "openai_images",
    protocols: ["openai_images"],
  },
  {
    adapterKey: "lingdong_api",
    protocols: ["lingdong_api"],
  },
  {
    adapterKey: "cumob_image",
    protocols: ["cumob_image"],
    requestFormats: ["cumob_image"],
    apiKeyEnvs: ["CUMOB_API_KEY"],
  },
  {
    adapterKey: "global_ai_opc_image",
    protocols: ["global_ai_opc_image"],
    requestFormats: ["global_ai_opc_gpt_image2", "global_ai_opc_banana_image"],
    apiKeyEnvs: ["GLOBAL_AI_OPC_API_KEY"],
  },
  {
    adapterKey: "custom_http",
    protocols: ["custom_http"],
  },
];

export function resolveImageProviderAdapterKey(
  providerProtocol: string,
  providerConfig: Record<string, unknown> = {},
): ImageProviderAdapterKey | undefined {
  const protocol = normalizeProviderProtocol(providerProtocol);
  const requestFormat = readProviderConfigString(providerConfig.requestFormat);
  const apiKeyEnv = readProviderConfigString(providerConfig.apiKeyEnv).toUpperCase();

  for (const route of imageProviderRoutes) {
    if (route.protocols.includes(protocol)) {
      return route.adapterKey;
    }
    if (requestFormat && route.requestFormats?.includes(requestFormat)) {
      return route.adapterKey;
    }
    if (apiKeyEnv && route.apiKeyEnvs?.includes(apiKeyEnv)) {
      return route.adapterKey;
    }
  }

  return undefined;
}

export function normalizeProviderProtocol(value: string) {
  return value.trim().replaceAll("-", "_");
}

export function readProviderConfigString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}
