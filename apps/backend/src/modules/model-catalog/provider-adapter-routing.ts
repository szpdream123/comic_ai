export type ImageProviderAdapterKey =
  | "openai_images"
  | "lingdong_api"
  | "cumob_image"
  | "global_ai_opc_image"
  | "volcengine_ark_image"
  | "san_bao"
  | "custom_http";

export type AudioProviderAdapterKey = "aliyun_bailian_audio" | "apimart_audio" | "globalaiopc_sound_clone";

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
  },
  {
    adapterKey: "global_ai_opc_image",
    protocols: ["global_ai_opc_image"],
    requestFormats: ["global_ai_opc_model_center_seedream_image"],
    apiKeyEnvs: ["GLOBAL_AI_OPC_API_KEY"],
  },
  {
    adapterKey: "volcengine_ark_image",
    protocols: ["volcengine_ark_image"],
    requestFormats: ["volcengine_ark_image", "volcengine_ark_images_generation"],
  },
  {
    adapterKey: "san_bao",
    protocols: ["san_bao"],
  },
  {
    adapterKey: "custom_http",
    protocols: ["custom_http"],
  },
];

const audioProviderRoutes: Array<{ adapterKey: AudioProviderAdapterKey; protocols: string[] }> = [
  { adapterKey: "aliyun_bailian_audio", protocols: ["aliyun_bailian_audio"] },
  { adapterKey: "apimart_audio", protocols: ["apimart_audio"] },
  { adapterKey: "globalaiopc_sound_clone", protocols: ["globalaiopc_sound_clone", "global_ai_opc_sound_clone"] },
];

export function resolveAudioProviderAdapterKey(providerProtocol: string): AudioProviderAdapterKey | undefined {
  const protocol = normalizeProviderProtocol(providerProtocol);
  return audioProviderRoutes.find((route) => route.protocols.includes(protocol))?.adapterKey;
}

export function resolveImageProviderAdapterKey(
  providerProtocol: string,
  providerConfig: Record<string, unknown> = {},
): ImageProviderAdapterKey | undefined {
  const protocol = normalizeProviderProtocol(providerProtocol);
  const requestFormat = readProviderConfigString(providerConfig.requestFormat);
  const apiKeyEnv = readProviderConfigString(providerConfig.apiKeyEnv).toUpperCase();

  if (protocol !== "custom_http") {
    return imageProviderRoutes.find((route) => route.protocols.includes(protocol))?.adapterKey;
  }

  for (const route of imageProviderRoutes) {
    if (route.adapterKey === "custom_http") {
      continue;
    }
    if (requestFormat && route.requestFormats?.includes(requestFormat)) {
      return route.adapterKey;
    }
    if (apiKeyEnv && route.apiKeyEnvs?.includes(apiKeyEnv)) {
      return route.adapterKey;
    }
  }

  return "custom_http";
}

export function normalizeProviderProtocol(value: string) {
  return value.trim().replaceAll("-", "_");
}

export function readProviderConfigString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}
