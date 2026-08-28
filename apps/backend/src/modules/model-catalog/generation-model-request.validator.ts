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
  kind: "image" | "video" | "audio";
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
  validateGenerationRequiredInputs(input.modelConfig, input.parameters);
  validateGenerationTaskMode(input.modelConfig, input.parameters);
  validateGenerationPromptLength(input.modelConfig, input.prompt);
  validateGenerationSchemaParameters(input.modelConfig.parameterSchema, input.parameters);
  validateLegacyGenerationParameterAliases(input.kind, input.modelConfig.parameterSchema, input.parameters);
}

function validateGenerationRequiredInputs(
  modelConfig: AiModelConfigRecord,
  parameters: Record<string, unknown>,
) {
  const referenceImageSchema = readObject(modelConfig.parameterSchema.referenceImages);
  const mode = String(parameters.mode ?? "").trim().toLowerCase();
  const supportsReferenceImages = Object.keys(referenceImageSchema).length > 0 ||
    modelConfig.capabilities.referenceImages === true ||
    modelConfig.limits.supportsReferenceImages === true;
  const requiresReferenceImage = modelConfig.modelCode === "wan3.0-r2v" ||
    referenceImageSchema.required === true ||
    (supportsReferenceImages && ["reference-video", "reference_image_to_video", "reference"].includes(mode));
  if (requiresReferenceImage && !hasGenerationReferenceImage(parameters)) {
    throw new GenerationModelRequestValidationError(
      "model_reference_media_required",
      "视频生成至少需要一张素材图片，请先添加或生成图片素材。",
    );
  }
  const sourceVideoSchema = readObject(modelConfig.parameterSchema.sourceVideo);
  const requiresReferenceVideo = modelConfig.capabilities.requiresReferenceVideo === true ||
    modelConfig.limits.requiresReferenceVideo === true ||
    sourceVideoSchema.required === true;
  if (!requiresReferenceVideo || hasGenerationReferenceVideo(parameters)) {
    return;
  }
  throw new GenerationModelRequestValidationError(
    "reference_video_required",
    "当前模型需要参考视频，请上传参考视频后再生成。",
  );
}

function hasGenerationReferenceImage(parameters: Record<string, unknown>) {
  return [
    parameters.firstFrame,
    parameters.firstFrameUrl,
    parameters.imageReference,
    parameters.imageUrl,
    parameters.referenceImages,
    parameters.quickReferences,
    parameters.referenceUploads,
    parameters.filePaths,
  ].some(hasGenerationMediaValue);
}

function hasGenerationReferenceVideo(parameters: Record<string, unknown>) {
  return [
    parameters.sourceVideo,
    parameters.sourceVideoUrl,
    parameters.referenceVideo,
    parameters.referenceVideoUrl,
    parameters.referenceVideos,
    parameters.videos,
    parameters.videoFilePaths,
    parameters.editSourceVideo,
  ].some(hasGenerationMediaValue);
}

function hasGenerationMediaValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.some(hasGenerationMediaValue);
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return [
    "url",
    "sourceUrl",
    "downloadUrl",
    "previewUrl",
    "publicUrl",
    "src",
    "assetVersionId",
    "storageObjectId",
    "fileId",
  ]
    .some((key) => hasGenerationMediaValue(record[key]));
}

function validateGenerationSchemaParameters(
  parameterSchema: Record<string, unknown>,
  parameters: Record<string, unknown>,
) {
  for (const [key, schema] of Object.entries(parameterSchema ?? {})) {
    if (shouldSkipGenerationParameterValidation(key)) {
      continue;
    }
    const value = readGenerationParameterValue(parameters, key, parameterSchema);
    validateGenerationEnumParameter(schema, value);
    validateGenerationNumericParameter(schema, value);
  }
}

function validateLegacyGenerationParameterAliases(
  kind: "image" | "video" | "audio",
  parameterSchema: Record<string, unknown>,
  parameters: Record<string, unknown>,
) {
  if (
    kind === "image" &&
    !("resolution" in parameterSchema) &&
    parameters.quality == null &&
    parameters.resolution != null
  ) {
    validateGenerationEnumParameter(parameterSchema.quality, parameters.resolution);
  }
  if (
    kind === "video" &&
    !("quality" in parameterSchema) &&
    parameters.resolution == null &&
    parameters.quality != null
  ) {
    validateGenerationEnumParameter(parameterSchema.resolution, parameters.quality);
  }
}

function readGenerationParameterValue(
  parameters: Record<string, unknown>,
  key: string,
  parameterSchema: Record<string, unknown>,
) {
  const directValue = parameters[key];
  if (directValue != null && directValue !== "") {
    return directValue;
  }
  if (key === "ratio") {
    return parameters.aspectRatio ?? parameters.imageAspectRatio;
  }
  if (key === "aspectRatio") {
    return parameters.ratio ?? parameters.imageAspectRatio;
  }
  if (key === "resolution") {
    return parameters.videoResolution ?? ("quality" in parameterSchema ? undefined : parameters.quality);
  }
  if (key === "durationSec") {
    return parameters.videoDurationSec ?? parameters.duration;
  }
  return directValue;
}

function shouldSkipGenerationParameterValidation(key: string) {
  return [
    "prompt",
    "negativePrompt",
    "referenceImages",
    "editInstruction",
  ].includes(key);
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
    aliases.add("video.reference_image_to_video");
    aliases.add("video.video_to_video");
    aliases.add("video.image_video_to_video");
    aliases.add("video");
    aliases.add("reference_video");
    aliases.add("reference_image_to_video");
    aliases.add("video_to_video");
    aliases.add("image_video_to_video");
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
  } else if (normalized === "tts" || normalized === "text-to-speech" || normalized === "text_to_speech") {
    aliases.add("audio.text_to_speech");
    aliases.add("audio");
  } else if (normalized === "music" || normalized === "music-generation" || normalized === "music_generation") {
    aliases.add("audio.music_generation");
    aliases.add("audio");
  } else if (normalized === "transcription" || normalized === "speech-to-text" || normalized === "speech_to_text") {
    aliases.add("audio.transcription");
    aliases.add("audio");
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

function validateGenerationNumericParameter(schema: unknown, value: unknown) {
  if (value == null || value === "") {
    return;
  }
  const minimum = readNumberSchemaBound(schema, "minimum");
  const maximum = readNumberSchemaBound(schema, "maximum");
  if (minimum == null && maximum == null) {
    return;
  }
  const parsed = Number(value);
  const schemaType = readString(readObject(schema).type);
  if (
    !Number.isFinite(parsed) ||
    (schemaType === "integer" && !Number.isInteger(parsed)) ||
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

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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
  const optionValues = readStringArray(schema.options);
  if (optionValues.length) {
    return optionValues;
  }
  return readStringArray(schema.enum);
}

function readNumberSchemaBound(schema: unknown, key: "minimum" | "maximum"): number | null {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return null;
  }
  const value = Number((schema as Record<string, unknown>)[key]);
  return Number.isFinite(value) ? value : null;
}
