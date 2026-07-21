const MEDIA_MODE_TOKENS = {
  image: new Set(["image", "text-to-image", "text_to_image", "image-to-image", "image_to_image", "multi-reference", "multi_reference"]),
  video: new Set(["video", "text-to-video", "text_to_video", "image-to-video", "image_to_video", "first-frame", "first_frame", "first-last-frame", "first_last_frame", "reference-video", "reference_video"]),
  audio: new Set(["audio", "text-to-audio", "text_to_audio", "text-to-speech", "text_to_speech", "tts", "speech"]),
};

const INPUT_PARAMETER_KEYS = new Set([
  "prompt",
  "negativePrompt",
  "referenceImages",
  "inputImages",
  "editInstruction",
  "motionPrompt",
]);

const PARAMETER_ALIASES = {
  aspectRatio: ["aspectRatio", "imageAspectRatio", "ratio"],
  imageAspectRatio: ["imageAspectRatio", "aspectRatio", "ratio"],
  ratio: ["ratio", "aspectRatio", "imageAspectRatio"],
  quality: ["quality", "resolution", "imageResolution", "size"],
  resolution: ["resolution", "quality", "imageResolution", "videoResolution", "size"],
  imageResolution: ["imageResolution", "quality", "resolution", "size"],
  videoResolution: ["videoResolution", "resolution", "quality"],
  size: ["size", "quality", "resolution", "imageResolution"],
  durationSec: ["durationSec", "videoDurationSec", "duration"],
  videoDurationSec: ["videoDurationSec", "durationSec", "duration"],
  count: ["count", "outputCount"],
};

function text(value) {
  return String(value ?? "").trim();
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeToken(value) {
  return text(value).toLowerCase().replace(/[._]/g, "-");
}

function modelMediaKind(model) {
  const explicit = text(model?.mediaType ?? model?.media_type ?? model?.mediaKind ?? model?.media_kind).toLowerCase();
  if (["image", "video", "audio"].includes(explicit)) return explicit;
  if (explicit) return explicit;
  const modes = array(model?.supportedModes ?? model?.modes ?? model?.capabilities).map(normalizeToken);
  if (modes.some((mode) => MEDIA_MODE_TOKENS.video.has(mode))) return "video";
  if (modes.some((mode) => MEDIA_MODE_TOKENS.audio.has(mode))) return "audio";
  if (modes.some((mode) => MEDIA_MODE_TOKENS.image.has(mode))) return "image";
  return "";
}

export function resolveCanvasGenerationModels(generationConfig, kind = "image") {
  const mediaKind = ["video", "audio"].includes(kind) ? kind : "image";
  return array(generationConfig?.models)
    .filter((model) => model && model.enabled !== false && model.disabled !== true)
    .filter((model) => {
      const resolvedKind = modelMediaKind(model);
      return mediaKind === "audio" ? resolvedKind === "audio" : !resolvedKind || resolvedKind === mediaKind;
    })
    .map((model) => ({
      code: text(model.modelCode ?? model.id),
      label: text(model.modelLabel ?? model.displayName ?? model.name ?? model.label ?? model.modelCode ?? model.id),
      provider: text(model.providerGroup ?? model.providerName ?? model.pipeline),
      remark: text(model.remark),
      raw: model,
    }))
    .filter((model) => model.code);
}

export function resolveCanvasGenerationModel(generationConfig, kind, requestedCode) {
  const models = resolveCanvasGenerationModels(generationConfig, kind);
  const requested = text(requestedCode);
  const configuredDefault = text(kind === "video"
    ? generationConfig?.defaultVideoModelCode
    : kind === "audio"
      ? generationConfig?.defaultAudioModelCode
    : generationConfig?.defaultImageModelCode);
  return models.find((model) => model.code === requested)
    ?? models.find((model) => model.code === configuredDefault)
    ?? models[0]
    ?? null;
}

function parameterOptions(parameter) {
  const source = array(parameter?.options).length ? parameter.options : array(parameter?.enum);
  return source
    .map((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const value = item.value ?? item.providerValue ?? item.id ?? item.label;
        const normalized = text(value);
        return normalized ? { value, label: text(item.label ?? item.name ?? value) || normalized } : null;
      }
      const normalized = text(item);
      return normalized ? { value: item, label: normalized } : null;
    })
    .filter(Boolean);
}

function isAspectRatioValue(value) {
  return /^(?:auto|\d+(?:\.\d+)?:\d+(?:\.\d+)?)$/i.test(text(value));
}

export function canvasParameterRepresentsAspectRatio(control) {
  if (["aspectRatio", "imageAspectRatio", "ratio"].includes(control?.key)) return true;
  return Boolean(control?.options?.length) && control.options.every((option) => isAspectRatioValue(option.value));
}

function valuesAsOptions(values) {
  return array(values).map((value) => ({ value, label: text(value) })).filter((option) => option.label);
}

function hasControl(controls, aliases) {
  return controls.some((control) => aliases.includes(control.key)
    || (aliases.includes("aspectRatio") && canvasParameterRepresentsAspectRatio(control)));
}

function addFallbackControl(controls, aliases, key, label, values) {
  if (hasControl(controls, aliases)) return;
  const options = valuesAsOptions(values);
  if (options.length) controls.push({ key, label, options, type: "string" });
}

function firstNonEmptyArray(...values) {
  return values.find((value) => Array.isArray(value) && value.length) ?? [];
}

export function resolveCanvasModelParameterControls(model, kind = "image") {
  const schema = model?.parameterSchema && typeof model.parameterSchema === "object" && !Array.isArray(model.parameterSchema)
    ? model.parameterSchema
    : {};
  const controls = Object.entries(schema)
    .filter(([key, parameter]) => parameter?.visible !== false && !INPUT_PARAMETER_KEYS.has(key))
    .map(([key, parameter]) => ({
      key,
      label: text(parameter?.label ?? parameter?.title ?? key) || key,
      options: parameterOptions(parameter),
      type: text(parameter?.type).toLowerCase(),
    }))
    .filter((control) => control.type === "boolean" || control.options.length);

  addFallbackControl(controls, ["aspectRatio", "imageAspectRatio", "ratio"], "aspectRatio", kind === "video" ? "视频比例" : "图片比例", model?.supportedRatios);
  if (kind === "video") {
    addFallbackControl(controls, ["resolution", "quality", "videoResolution"], "resolution", "分辨率", firstNonEmptyArray(model?.supportedQuality, model?.supportedResolutions));
    addFallbackControl(controls, ["durationSec", "videoDurationSec"], "durationSec", "视频时长", model?.supportedDurations);
  } else {
    addFallbackControl(controls, ["quality", "resolution", "imageResolution", "size"], "quality", "分辨率", firstNonEmptyArray(model?.supportedQuality, model?.supportedResolutions));
  }
  return controls;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function legacyValue(data, key) {
  if (PARAMETER_ALIASES[key]?.includes("aspectRatio")) return data?.aspectRatio;
  if (PARAMETER_ALIASES[key]?.includes("quality")) return data?.quality;
  if (PARAMETER_ALIASES[key]?.includes("resolution")) return data?.resolution;
  if (PARAMETER_ALIASES[key]?.includes("duration")) return data?.duration;
  if (PARAMETER_ALIASES[key]?.includes("outputCount")) return data?.outputCount;
  return undefined;
}

export function resolveCanvasParameterValue(data, model, control) {
  const parameters = data?.parameters && typeof data.parameters === "object" ? data.parameters : {};
  const ratioControl = canvasParameterRepresentsAspectRatio(control);
  const aliases = ratioControl
    ? [control.key, "aspectRatio", "imageAspectRatio", "ratio"]
    : PARAMETER_ALIASES[control.key] ?? [control.key];
  const defaults = model?.defaultParams && typeof model.defaultParams === "object" ? model.defaultParams : {};
  const candidate = firstDefined(
    ...aliases.map((key) => parameters[key]),
    ratioControl ? data?.aspectRatio : legacyValue(data, control.key),
    ...aliases.map((key) => defaults[key]),
    control.options[0]?.value,
  );
  if (control.type === "boolean") {
    return candidate === true || candidate === "true";
  }
  const matched = control.options.find((option) => String(option.value) === String(candidate));
  return matched?.value ?? control.options[0]?.value ?? "";
}

function canonicalLegacyPatch(parameters, controls = []) {
  const ratioControl = controls.find(canvasParameterRepresentsAspectRatio);
  const ratioValue = firstDefined(
    parameters.aspectRatio,
    parameters.imageAspectRatio,
    parameters.ratio,
    ratioControl ? parameters[ratioControl.key] : undefined,
  );
  const sizeRepresentsRatio = ratioControl?.key === "size";
  return {
    ...(ratioValue !== undefined
      ? { aspectRatio: ratioValue }
      : {}),
    ...(firstDefined(parameters.quality, parameters.imageResolution, sizeRepresentsRatio ? undefined : parameters.size) !== undefined
      ? { quality: firstDefined(parameters.quality, parameters.imageResolution, sizeRepresentsRatio ? undefined : parameters.size) }
      : {}),
    ...(firstDefined(parameters.resolution, parameters.videoResolution) !== undefined
      ? { resolution: firstDefined(parameters.resolution, parameters.videoResolution) }
      : {}),
    ...(firstDefined(parameters.durationSec, parameters.videoDurationSec) !== undefined
      ? { duration: Number(firstDefined(parameters.durationSec, parameters.videoDurationSec)) || firstDefined(parameters.durationSec, parameters.videoDurationSec) }
      : {}),
    ...(parameters.count !== undefined ? { outputCount: Number(parameters.count) || parameters.count } : {}),
  };
}

export function buildCanvasModelSelectionPatch(data, model, kind = "image", parameterOverrides = null) {
  if (!model) return {};
  const controls = resolveCanvasModelParameterControls(model, kind);
  const defaults = model.defaultParams && typeof model.defaultParams === "object" ? { ...model.defaultParams } : {};
  const overrideValues = parameterOverrides && typeof parameterOverrides === "object" ? parameterOverrides : {};
  const parameters = { ...defaults, ...overrideValues };
  for (const control of controls) {
    if (parameters[control.key] === undefined) parameters[control.key] = resolveCanvasParameterValue({ parameters }, model, control);
  }
  return markCanvasGeneratorInputUpdated(data, {
    model: text(model.modelCode ?? model.id),
    modelLabel: text(model.modelLabel ?? model.displayName ?? model.name ?? model.label ?? model.modelCode ?? model.id),
    parameters,
    ...canonicalLegacyPatch(parameters, controls),
  });
}

export function buildCanvasParameterPatch(data, key, value, model = null, kind = "image") {
  const parameters = data?.parameters && typeof data.parameters === "object" ? data.parameters : {};
  const nextParameters = { ...parameters, [key]: value };
  const controls = model ? resolveCanvasModelParameterControls(model, kind) : [];
  return markCanvasGeneratorInputUpdated(data, {
    parameters: nextParameters,
    ...canonicalLegacyPatch(nextParameters, controls),
  });
}

export function resolveCanvasGenerationPresets(generationConfig, kind, modelCode) {
  const mediaKind = ["video", "audio"].includes(kind) ? kind : "image";
  return array(generationConfig?.presets)
    .filter((preset) => {
      const presetKind = text(preset?.mediaType ?? preset?.mediaKind ?? preset?.kind).toLowerCase();
      const presetModel = text(preset?.modelCode ?? preset?.modelId ?? preset?.model);
      return (!presetKind || presetKind === mediaKind) && (!presetModel || presetModel === text(modelCode));
    })
    .map((preset, index) => ({
      id: text(preset.id ?? preset.code ?? preset.name ?? `preset-${index}`),
      label: text(preset.label ?? preset.name ?? preset.title ?? `预设 ${index + 1}`),
      parameters: preset.parameters && typeof preset.parameters === "object"
        ? preset.parameters
        : preset.parameterValues && typeof preset.parameterValues === "object"
          ? preset.parameterValues
          : {},
    }))
    .filter((preset) => preset.id && preset.label);
}

export function hasCanvasGenerationBaseline(data) {
  return Boolean(text(data?.taskId) || text(data?.resultUrl) || text(data?.status).toLowerCase() === "completed");
}

export function markCanvasGeneratorInputUpdated(data, updates) {
  return {
    ...updates,
    ...(hasCanvasGenerationBaseline(data) ? { inputUpdated: true } : {}),
  };
}
