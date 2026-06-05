import type {
  AiModelConfigRecord,
  AiModelDispatchPolicyRecord,
} from "./ai-model-config.store.ts";

export class GenerationModelExecutionResolutionError extends Error {
  constructor(
    readonly code: string,
    readonly message: string,
  ) {
    super(code);
  }
}

export interface GenerationModelExecution {
  providerExecutor: "gpt-image-2" | "seedance" | "mock";
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
      "Generation model is required",
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
      "Current model is not configured",
    );
  }

  return {
    providerExecutor: providerExecutorFromProtocol(input.kind, input.modelConfig.providerProtocol),
    queueName: input.dispatchPolicy?.submitQueueName || input.fallbackQueueName,
    taskMode: taskModeFromParameters(input.kind, input.parameters),
    parameters: mergeDefaultParameters(input.modelConfig.defaultParams, input.parameters),
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
): GenerationModelExecution["providerExecutor"] {
  const protocol = providerProtocol.trim().replaceAll("-", "_");
  if (kind === "image" && protocol === "openai_images") {
    return "gpt-image-2";
  }
  if (kind === "video" && protocol === "volcengine_ark_video") {
    return "seedance";
  }
  throw new GenerationModelExecutionResolutionError(
    "model_provider_unsupported",
    "Current model provider is not supported for generation",
  );
}

function mergeDefaultParameters(
  defaultParams: Record<string, unknown>,
  parameters: Record<string, unknown>,
) {
  return {
    ...defaultParams,
    ...parameters,
  };
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
    return "video.first_last_frame";
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
