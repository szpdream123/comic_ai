import type { AiModelConfigRecord } from "./ai-model-config.store.ts";

export class GenerationModelRequestValidationError extends Error {
  constructor(
    readonly code: string,
    readonly message: string,
  ) {
    super(code);
  }
}

export function validateGenerationModelRequest(input: {
  kind: "image" | "video";
  modelCode: string;
  modelConfig: AiModelConfigRecord | undefined;
  parameters: Record<string, unknown>;
  prompt: string;
}) {
  if (!input.modelCode) {
    return;
  }
  if (!input.modelConfig) {
    throw new GenerationModelRequestValidationError(
      "model_not_configured",
      "Current model is not configured",
    );
  }
  if (input.modelConfig.mediaType !== input.kind) {
    throw new GenerationModelRequestValidationError(
      "model_media_type_mismatch",
      "Current model media type does not match the requested generation",
    );
  }
  validateGenerationTaskMode(input.modelConfig, input.parameters);
  validateGenerationPromptLength(input.modelConfig, input.prompt);
  validateGenerationEnumParameter(input.modelConfig.parameterSchema.aspectRatio, input.parameters.aspectRatio);
  if (input.kind === "image") {
    validateGenerationEnumParameter(
      input.modelConfig.parameterSchema.quality,
      input.parameters.quality ?? input.parameters.resolution,
    );
  } else {
    validateGenerationEnumParameter(
      input.modelConfig.parameterSchema.resolution,
      input.parameters.resolution ?? input.parameters.quality,
    );
    validateGenerationEnumParameter(input.modelConfig.parameterSchema.durationSec, input.parameters.durationSec);
  }
  validateGenerationIntegerParameter(input.modelConfig.parameterSchema.count, input.parameters.count);
}

function validateGenerationTaskMode(
  modelConfig: AiModelConfigRecord,
  parameters: Record<string, unknown>,
) {
  const mode = readString(parameters.mode);
  if (!mode || !modelConfig.taskModes.length) {
    return;
  }
  const aliases = generationTaskModeAliases(mode);
  const supportedByTaskModes = modelConfig.taskModes.some((taskMode) => aliases.has(taskMode));
  const supportedByUiModes = readStringArray(modelConfig.uiConfig.supportedModes)
    .some((taskMode) => aliases.has(taskMode));
  if (!supportedByTaskModes && !supportedByUiModes) {
    throw new GenerationModelRequestValidationError(
      "model_task_mode_unsupported",
      "Current model does not support this generation mode",
    );
  }
}

function generationTaskModeAliases(mode: string): Set<string> {
  const normalized = mode.trim();
  const snake = normalized.replaceAll("-", "_");
  const aliases = new Set([normalized, snake]);
  if (normalized === "single-image") {
    aliases.add("image.generate");
    aliases.add("image.edit");
    aliases.add("image.reference_generate");
    aliases.add("image");
    aliases.add("text_to_image");
    aliases.add("image_to_image");
  } else if (normalized === "multi-image") {
    aliases.add("image.reference_generate");
    aliases.add("image.generate");
    aliases.add("image");
    aliases.add("multi_reference");
    aliases.add("image_to_image");
  } else if (normalized === "first-frame") {
    aliases.add("video.image_to_video");
    aliases.add("video");
    aliases.add("image_to_video");
  } else if (normalized === "reference-video") {
    aliases.add("video.reference_guided_video");
    aliases.add("video.image_to_video");
    aliases.add("video");
    aliases.add("reference_video");
  } else if (normalized === "first-last-frame") {
    aliases.add("video.first_last_frame");
    aliases.add("video.first_last_frame_to_video");
    aliases.add("first_last_frame_to_video");
    aliases.add("video");
  } else if (normalized === "edit-video") {
    aliases.add("video.video_to_video");
    aliases.add("video");
  } else if (normalized === "lip-sync") {
    aliases.add("video.lip_sync");
    aliases.add("lip_sync");
    aliases.add("video");
  }
  return aliases;
}

function validateGenerationPromptLength(modelConfig: AiModelConfigRecord, prompt: string) {
  const schemaMaxLength = Number(
    modelConfig.parameterSchema.prompt &&
      typeof modelConfig.parameterSchema.prompt === "object" &&
      !Array.isArray(modelConfig.parameterSchema.prompt)
      ? (modelConfig.parameterSchema.prompt as Record<string, unknown>).maxLength
      : undefined,
  );
  const limitMaxLength = Number(modelConfig.limits.maxPromptLength);
  const maxLength = Number.isFinite(schemaMaxLength) && schemaMaxLength > 0
    ? schemaMaxLength
    : limitMaxLength;
  if (Number.isFinite(maxLength) && maxLength > 0 && [...prompt].length > maxLength) {
    throw new GenerationModelRequestValidationError(
      "model_prompt_too_long",
      "Prompt is too long",
    );
  }
}

function validateGenerationEnumParameter(schema: unknown, value: unknown) {
  const allowed = readEnumValues(schema);
  if (!allowed.length || value == null || value === "") {
    return;
  }
  const normalizedValue = String(value).trim();
  if (!allowed.includes(normalizedValue)) {
    throw new GenerationModelRequestValidationError(
      "model_parameter_unsupported",
      "Generation parameter is not supported by the selected model",
    );
  }
}

function validateGenerationIntegerParameter(schema: unknown, value: unknown) {
  if (value == null || value === "") {
    return;
  }
  const minimum = readNumberSchemaBound(schema, "minimum");
  const maximum = readNumberSchemaBound(schema, "maximum");
  if (minimum == null && maximum == null) {
    return;
  }
  const parsed = Number(value);
  if (
    !Number.isInteger(parsed) ||
    (minimum != null && parsed < minimum) ||
    (maximum != null && parsed > maximum)
  ) {
    throw new GenerationModelRequestValidationError(
      "model_parameter_unsupported",
      "Generation parameter is not supported by the selected model",
    );
  }
}

function readString(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
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

function readEnumValues(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  const schema = value as Record<string, unknown>;
  const enumValues = readStringArray(schema.enum);
  if (enumValues.length) {
    return enumValues;
  }
  return readStringArray(schema.options);
}

function readNumberSchemaBound(schema: unknown, key: "minimum" | "maximum"): number | null {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return null;
  }
  const value = Number((schema as Record<string, unknown>)[key]);
  return Number.isFinite(value) ? value : null;
}
