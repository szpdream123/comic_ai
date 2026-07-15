import type {
  AiModelConfigRecord,
  AiModelDispatchPolicyRecord,
} from "./ai-model-config.store.ts";
import {
  normalizeProviderProtocol,
  resolveImageProviderAdapterKey,
} from "./provider-adapter-routing.ts";

export class GenerationModelExecutionResolutionError extends Error {
  constructor(
    readonly code: string,
    readonly message: string,
  ) {
    super(code);
  }
}

export interface GenerationModelExecution {
  providerExecutor: "gpt-image-2" | "image-http" | "seedance" | "mock";
  queueName: string;
  taskMode: string;
  parameters: Record<string, unknown>;
}

export function resolveGenerationModelExecution(input: {
  kind: "image" | "video";
  modelCode: string;
  modelConfig: AiModelConfigRecord | undefined;
  dispatchPolicy: AiModelDispatchPolicyRecord | undefined;
  parameters: Record<string, unknown>;
  fallbackQueueName: string;
}): GenerationModelExecution {
  const modelCode = input.modelCode.trim();
  if (!modelCode) {
    throw new GenerationModelExecutionResolutionError(
      "model_required",
      "请选择生成模型。",
    );
  }
  if (!input.modelConfig && isLegacyMockModel(input.kind, modelCode)) {
    return {
      providerExecutor: "mock",
      queueName: input.fallbackQueueName,
      taskMode: taskModeFromParameters(input.kind, input.parameters),
      parameters: { ...input.parameters },
    };
  }
  if (!input.modelConfig) {
    throw new GenerationModelExecutionResolutionError(
      "model_not_configured",
      "当前模型未配置或已不可用。",
    );
  }

  return {
    providerExecutor: providerExecutorFromProtocol(
      input.kind,
      input.modelConfig.providerProtocol,
      input.modelConfig.providerConfig,
    ),
    queueName: input.dispatchPolicy?.submitQueueName || input.fallbackQueueName,
    taskMode: taskModeFromParameters(input.kind, input.parameters),
    parameters: mergeDefaultParameters(
      input.modelConfig.defaultParams,
      input.parameters,
      input.modelConfig.parameterSchema,
    ),
  };
}

function isLegacyMockModel(kind: "image" | "video", modelCode: string) {
  return (
    (kind === "image" && modelCode === "nano_banana_2") ||
    (kind === "video" && modelCode === "video_mock_1")
  );
}

function providerExecutorFromProtocol(
  kind: "image" | "video",
  providerProtocol: string,
  providerConfig: Record<string, unknown> = {},
): GenerationModelExecution["providerExecutor"] {
  const protocol = normalizeProviderProtocol(providerProtocol);
  if (kind === "image") {
    const adapterKey = resolveImageProviderAdapterKey(protocol, providerConfig);
    if (
      adapterKey === "openai_images" ||
      adapterKey === "lingdong_api" ||
      adapterKey === "cumob_image" ||
      adapterKey === "global_ai_opc_image" ||
      adapterKey === "volcengine_ark_image"
    ) {
      return "gpt-image-2";
    }
    if (adapterKey === "custom_http") {
      return "image-http";
    }
  }
  if (
    kind === "video" &&
    (
      protocol === "volcengine_ark_video" ||
      protocol === "aliyun_bailian_video" ||
      protocol === "globalaiopc_video" ||
      protocol === "global_ai_opc_video" ||
      protocol === "lingdong_api" ||
      protocol === "extra_token_video" ||
      protocol === "saier_video" ||
      isGlobalAiOpcVideoConfig(providerConfig) ||
      (protocol === "custom_http" && isVolcengineArkVideoCustomHttp(providerConfig))
    )
  ) {
    return "seedance";
  }
  throw new GenerationModelExecutionResolutionError(
    "model_provider_unsupported",
    "当前模型的生成通道暂不支持，请联系管理员检查模型配置。",
  );
}

function isGlobalAiOpcVideoCustomHttp(providerConfig: Record<string, unknown>) {
  const requestFormat = readString(providerConfig.requestFormat);
  if (requestFormat.startsWith("globalaiopc_")) {
    return true;
  }
  return [
    providerConfig.createTaskEndpoint,
    providerConfig.requestPath,
    providerConfig.endpoint,
    providerConfig.queryTaskEndpoint,
  ].some((value) => {
    const endpoint = readString(value).toLowerCase();
    return endpoint.includes("/sd2_manxue/") ||
      endpoint.includes("/sora/") ||
      endpoint.includes("/grok/") ||
      endpoint.includes("/happyhorse-r2v/") ||
      endpoint.includes("/v1/result/");
  });
}

function isLingdongVideoCustomHttp(providerConfig: Record<string, unknown>) {
  const requestFormat = readString(providerConfig.requestFormat);
  if (requestFormat === "lingdong_video") {
    return true;
  }
  if (isLingdongApiKey(providerConfig)) {
    return true;
  }
  return [
    providerConfig.baseURL,
    providerConfig.createTaskEndpoint,
    providerConfig.requestPath,
    providerConfig.endpoint,
    providerConfig.queryTaskEndpoint,
  ].some((value) => readString(value).includes("lingdongapi.com"));
}

function isLingdongApiKey(providerConfig: Record<string, unknown>) {
  const apiKeyEnv = readString(providerConfig.apiKeyEnv)?.toLowerCase() ?? "";
  const normalized = apiKeyEnv.replace(/[^a-z0-9]/g, "");
  return normalized === "sd2ld" || normalized.includes("lingdong");
}

function isVolcengineArkVideoCustomHttp(providerConfig: Record<string, unknown>) {
  const requestFormat = readString(providerConfig.requestFormat);
  if (requestFormat === "volcengine_ark_contents_generation") {
    return true;
  }
  return [
    providerConfig.createTaskEndpoint,
    providerConfig.requestPath,
    providerConfig.endpoint,
  ].some((value) => readString(value).includes("/contents/generations/tasks"));
}

function isGlobalAiOpcVideoConfig(providerConfig: Record<string, unknown>) {
  const apiKeyEnv = readString(providerConfig.apiKeyEnv).toUpperCase();
  const requestFormat = readString(providerConfig.requestFormat);
  if (apiKeyEnv === "GLOBAL_AI_OPC_API_KEY" && requestFormat.startsWith("globalaiopc_")) {
    return true;
  }
  if (apiKeyEnv === "GLOBAL_AI_OPC_API_KEY" && hasVideoEndpoint(providerConfig)) {
    return true;
  }
  if (requestFormat.startsWith("globalaiopc_") || requestFormat.startsWith("global_ai_opc_video")) {
    return true;
  }
  return false;
}

function hasVideoEndpoint(providerConfig: Record<string, unknown>) {
  return [
    providerConfig.createTaskEndpoint,
    providerConfig.requestPath,
    providerConfig.endpoint,
  ].some((value) => readString(value).toLowerCase().includes("/videos"));
}

function mergeDefaultParameters(
  defaultParams: Record<string, unknown>,
  parameters: Record<string, unknown>,
  parameterSchema: Record<string, unknown> = {},
) {
  const aliases = generationParameterAliases(parameters, parameterSchema);
  const merged = {
    ...defaultParams,
    ...parameters,
    ...aliases,
  };
  return normalizeEnumParameters(
    pruneParametersToSchema(merged, defaultParams, parameterSchema),
    parameterSchema,
  );
}

function pruneParametersToSchema(
  parameters: Record<string, unknown>,
  defaultParams: Record<string, unknown>,
  parameterSchema: Record<string, unknown>,
) {
  const allowedKeys = new Set(Object.keys(parameterSchema ?? {}));
  const defaultKeys = new Set(Object.keys(defaultParams ?? {}));
  const preservedKeys = new Set([
    "mode",
    "references",
    "referenceImages",
    "quickReferences",
    "mentionReferences",
    "firstFrame",
    "lastFrame",
    "editSourceVideo",
    "referenceUploads",
    "referenceVideos",
    "referenceAudio",
    "videos",
    "audios",
    "filePaths",
    "videoFilePaths",
    "audioFilePaths",
    "imageReference",
    "localReferenceRoles",
    "lipSyncConfig",
  ]);
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parameters)) {
    if (allowedKeys.has(key) || defaultKeys.has(key) || preservedKeys.has(key)) {
      next[key] = value;
    }
  }
  return next;
}

function generationParameterAliases(
  parameters: Record<string, unknown>,
  parameterSchema: Record<string, unknown>,
) {
  const aliases: Record<string, unknown> = {};
  copyGenerationParameterAlias(aliases, parameters, parameterSchema, "ratio", ["aspectRatio", "imageAspectRatio"]);
  copyGenerationParameterAlias(aliases, parameters, parameterSchema, "aspectRatio", ["ratio", "imageAspectRatio"]);
  copyGenerationParameterAlias(aliases, parameters, parameterSchema, "size", ["aspectRatio", "ratio", "imageAspectRatio"]);
  copyGenerationParameterAlias(aliases, parameters, parameterSchema, "resolution", ["videoResolution", "quality"]);
  copyGenerationParameterAlias(aliases, parameters, parameterSchema, "durationSec", ["videoDurationSec", "duration"]);
  return aliases;
}

function copyGenerationParameterAlias(
  target: Record<string, unknown>,
  parameters: Record<string, unknown>,
  parameterSchema: Record<string, unknown>,
  canonicalKey: string,
  aliasKeys: string[],
) {
  if (!(canonicalKey in parameterSchema) || parameters[canonicalKey] != null) {
    return;
  }
  for (const aliasKey of aliasKeys) {
    if (parameters[aliasKey] != null && parameters[aliasKey] !== "") {
      target[canonicalKey] = parameters[aliasKey];
      return;
    }
  }
}

function normalizeEnumParameters(
  parameters: Record<string, unknown>,
  parameterSchema: Record<string, unknown>,
) {
  const normalized = { ...parameters };
  for (const [key, schema] of Object.entries(parameterSchema)) {
    const allowed = readEnumValues(schema);
    if (!allowed.length) {
      continue;
    }
    const value = normalized[key];
    if (value == null || value === "") {
      normalized[key] = allowed[0];
      continue;
    }
    const requested = String(value).trim();
    if (allowed.includes(requested)) {
      normalized[key] = value;
      continue;
    }
    const canonical = allowed.find((candidate) => candidate.toLowerCase() === requested.toLowerCase());
    normalized[key] = canonical ?? allowed[0];
  }
  return normalized;
}

function readEnumValues(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  const schema = value as Record<string, unknown>;
  return readStringArray(schema.options).length
    ? readStringArray(schema.options)
    : readStringArray(schema.enum);
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => readEnumValue(item)).filter(Boolean)
    : [];
}

function readEnumValue(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const option = value as Record<string, unknown>;
    return readString(option.value) || readString(option.providerValue) || readString(option.label);
  }
  return readString(value);
}

function taskModeFromParameters(kind: "image" | "video", parameters: Record<string, unknown>) {
  const mode = readString(parameters.mode);
  if (kind === "image") {
    if (mode === "multi-image") {
      return "image.reference_generate";
    }
    return "image.generate";
  }

  if (mode === "reference-video") {
    return "video.reference_guided_video";
  }
  if (mode === "first-last-frame") {
    return "video.first_last_frame_to_video";
  }
  if (mode === "edit-video") {
    return "video.video_to_video";
  }
  if (mode === "lip-sync") {
    return "video.lip_sync";
  }
  return "video.image_to_video";
}

function readString(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}
