import type {
  ProviderAdapter,
  ProviderSubmissionInput,
  ProviderSubmissionResult,
} from "./provider-adapter.contract.ts";
import { recordProviderAdapterRequest } from "./provider-adapter.contract.ts";
import {
  attachProviderRawResponse,
  attachProviderRedactedRequest,
  providerResponseDiagnostics,
  providerResponseError,
  readProviderResponseDiagnostics,
  type ProviderResponseDiagnostics,
} from "./provider-response-diagnostics.ts";

const defaultModel = "sd2_manxue_720p";
const sd2BaseModels = new Set([
  "sd2_manxue",
  "sd2_manxue_fast",
  "sd2_manxue_video",
  "sd2_manxue_video_fast",
]);
const sd2ResolutionSuffixes = new Set(["720p", "1080p", "2k", "4k"]);

type GlobalAiOpcVideoFamily = "sd2_manxue" | "sora" | "grok" | "happyhorse_r2v";

export class GlobalAiOpcVideoProviderAdapter implements ProviderAdapter {
  constructor(
    private readonly config: {
      apiKey: string;
      model?: string;
      createTaskEndpoint: string;
      queryTaskEndpoint: string;
      requestFormat?: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async submit(input: ProviderSubmissionInput): Promise<ProviderSubmissionResult> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const redactedRequest = await recordProviderAdapterRequest(
      input,
      buildGlobalAiOpcVideoPayload(input, {
        model: this.config.model,
        family: resolveFamily(this.config),
      }),
    );
    const response = await fetchImpl(this.config.createTaskEndpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(redactedRequest),
    });
    const payload = await readJsonResponse(response, "video_provider", redactedRequest);
    const externalRequestId = findFirstString(payload, [
      ["id"],
      ["task_id"],
      ["taskId"],
      ["data", "id"],
      ["data", "task_id"],
      ["data", "taskId"],
      ["result", "id"],
      ["result", "task_id"],
      ["result", "taskId"],
      ["output", "id"],
      ["output", "task_id"],
      ["output", "taskId"],
    ]);
    if (!externalRequestId) {
      const error = providerResponseError(
        "video_provider_invalid_response",
        providerResponseDiagnostics(response, JSON.stringify(payload)),
      );
      throw attachProviderRedactedRequest(error, redactedRequest);
    }

    return {
      externalRequestId,
      status: normalizeProviderStatus(findProviderStatus(payload)) === "succeeded" ? "succeeded" : "accepted",
      redactedRequest,
      redactedResponse: attachProviderRawResponse({
        model: readString(redactedRequest.model) ?? this.config.model ?? defaultModel,
        providerStatus: findProviderStatus(payload) ?? null,
        providerErrorCode: findProviderErrorCode(payload),
        providerMessage: findProviderMessage(payload),
      }, payload),
    };
  }

  async poll(input: { externalRequestId: string }): Promise<{
    status: "accepted" | "running" | "succeeded" | "failed";
    videoUrl?: string;
    redactedResponse: Record<string, unknown>;
  }> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const response = await fetchImpl(
      this.config.queryTaskEndpoint.replace("{taskId}", encodeURIComponent(input.externalRequestId)),
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
        },
      },
    );
    const payload = await readJsonResponse(response, "video_provider_poll");
    const providerStatus = findProviderStatus(payload);

    return {
      status: normalizeProviderStatus(providerStatus),
      videoUrl: findVideoUrl(payload),
      redactedResponse: attachProviderRawResponse({
        taskId: input.externalRequestId,
        providerStatus: providerStatus ?? null,
        providerErrorCode: findProviderErrorCode(payload),
        providerMessage: findProviderMessage(payload),
        amount: readPath(payload, ["amount"]) ?? null,
        actualDuration: readPath(payload, ["actualDuration"]) ?? null,
      }, payload),
    };
  }

  async cancel(input: { externalRequestId: string }): Promise<{
    status: "not_cancelable";
    redactedResponse: Record<string, unknown>;
  }> {
    return {
      status: "not_cancelable",
      redactedResponse: {
        providerStatus: "not_cancelable",
        taskId: input.externalRequestId,
      },
    };
  }
}

function buildGlobalAiOpcVideoPayload(
  input: ProviderSubmissionInput,
  options: { model?: string; family: GlobalAiOpcVideoFamily },
): Record<string, unknown> {
  const payload = input.redactedPayload;
  const parameters = readObject(payload.parameters);
  const prompt = readString(payload.prompt) ?? readString(payload.motionPrompt) ?? "";
  if (options.family === "sora") {
    return removeUndefinedValues({
      model: options.model ?? "openAiSora2Plus",
      prompt,
      size: readString(parameters.size),
      aspect_ratio: readRatio(parameters),
      seconds: readInteger(parameters.seconds) ?? readDuration(parameters),
      input_reference: firstItems(buildReferenceImageUrls(payload, parameters), 1),
    });
  }
  if (options.family === "grok") {
    return removeUndefinedValues({
      model: options.model ?? "grok_video3",
      prompt,
      duration: readDuration(parameters),
      aspect_ratio: readRatio(parameters),
      resolution: readString(parameters.resolution),
      image_urls: buildReferenceImageUrls(payload, parameters),
    });
  }
  if (options.family === "happyhorse_r2v") {
    return removeUndefinedValues({
      model: options.model ?? "happyhorse-1.0-r2v",
      prompt,
      referenceImages: buildReferenceImageUrls(payload, parameters),
      duration: readDuration(parameters),
      ratio: readRatio(parameters),
      resolution: normalizeUpperPResolution(parameters.resolution),
      seed: readInteger(parameters.seed),
    });
  }

  const sd2ModelName = resolveSd2ModelName(options.model, parameters);
  if (isSeedance25SpecialModel(options.model) || sd2ModelName === "sd_2.5_special_v1") {
    return removeUndefinedValues({
      model: "sd_2.5_special_v1",
      prompt,
      duration: readDuration(parameters),
      aspect_ratio: readRatio(parameters),
      resolution: readString(parameters.resolution),
      reference_images: buildReferenceImageUrls(payload, parameters),
    });
  }
  const firstImage =
    readString(payload.firstFrameUrl) ??
    readString(payload.imageUrl) ??
    readString(payload.referenceImageUrl) ??
    readMediaUrl(parameters.firstFrame) ??
    readMediaUrl(parameters.imageReference);
  const lastImage =
    readString(payload.lastFrameUrl) ??
    readMediaUrl(payload.lastFrame) ??
    readMediaUrl(parameters.lastFrame);
  const useFrameMode = Boolean(firstImage);
  const referenceVideoUrls = buildReferenceVideoUrls(payload, parameters);
  if (referenceVideoUrls.length > 0 && !isSd2VideoReferenceModel(sd2ModelName)) {
    throw Object.assign(new Error("该模型不支持视频参考"), {
      failureCode: "model_reference_videos_unsupported",
      providerModel: sd2ModelName,
    });
  }

  return removeUndefinedValues({
    model: sd2ModelName,
    prompt,
    duration: readDuration(parameters),
    ratio: readRatio(parameters),
    first_image: useFrameMode ? firstImage : undefined,
    last_image: useFrameMode ? lastImage : undefined,
    referenceImages: useFrameMode ? [] : dedupeStrings([
      ...readMediaUrlArray(payload.referenceImages),
      ...readMediaUrlArray(parameters.referenceImages),
      ...readMediaUrlArray(parameters.referenceUploads),
      ...readMediaUrlArray(parameters.quickReferences),
      ...readMediaUrlArray(parameters.filePaths),
    ].filter((url) => url !== firstImage && url !== lastImage)),
    referenceVideos: useFrameMode || !isSd2VideoReferenceModel(sd2ModelName)
      ? []
      : referenceVideoUrls,
    referenceAudios: useFrameMode ? [] : buildReferenceAudioUrls(payload, parameters),
  });
}

function resolveFamily(config: { model?: string; requestFormat?: string; createTaskEndpoint: string }): GlobalAiOpcVideoFamily {
  const requestFormat = config.requestFormat?.trim();
  if (requestFormat === "globalaiopc_sora") return "sora";
  if (requestFormat === "globalaiopc_grok") return "grok";
  if (requestFormat === "globalaiopc_happyhorse_r2v") return "happyhorse_r2v";
  if (requestFormat === "globalaiopc_sd2_manxue") return "sd2_manxue";

  const endpoint = config.createTaskEndpoint.toLowerCase();
  if (endpoint.includes("/sora/")) return "sora";
  if (endpoint.includes("/grok/")) return "grok";
  if (endpoint.includes("/happyhorse-r2v/")) return "happyhorse_r2v";
  const model = config.model?.trim() ?? "";
  if (model.startsWith("openAiSora")) return "sora";
  if (model.startsWith("grok_")) return "grok";
  if (model.startsWith("happyhorse-")) return "happyhorse_r2v";
  return "sd2_manxue";
}

function resolveSd2ModelName(model: string | undefined, parameters: Record<string, unknown>) {
  const providerModel = readString(model) ?? defaultModel;
  const parts = providerModel.split("_");
  const currentSuffix = parts[parts.length - 1]?.toLowerCase();
  if (!sd2BaseModels.has(providerModel) || sd2ResolutionSuffixes.has(currentSuffix)) {
    return providerModel;
  }
  const resolution = normalizeSd2Resolution(parameters.resolution) ?? "720p";
  return `${providerModel}_${resolution}`;
}

function isSd2VideoReferenceModel(modelName: string) {
  return modelName.startsWith("sd2_manxue_video_") || modelName.startsWith("sd2_manxue_video_fast_");
}

function isSeedance25SpecialModel(model: string | undefined) {
  return /^sd_2\.5_special(?:_v1)?(?:_(?:720p|1080p))?$/i.test(model?.trim() ?? "");
}

function normalizeSd2Resolution(value: unknown) {
  const resolution = readString(value)?.toLowerCase();
  if (!resolution) return undefined;
  if (resolution === "2K".toLowerCase()) return "2k";
  if (resolution === "4K".toLowerCase()) return "4k";
  return sd2ResolutionSuffixes.has(resolution) ? resolution : undefined;
}

function normalizeUpperPResolution(value: unknown) {
  const resolution = readString(value);
  if (!resolution) return undefined;
  const normalized = resolution.toUpperCase();
  if (normalized === "720P" || normalized === "1080P") {
    return normalized;
  }
  return resolution;
}

async function readJsonResponse(
  response: Response,
  prefix: string,
  redactedRequest?: Record<string, unknown>,
) {
  if (!response.ok) {
    const error = await readProviderError(response);
    const responseError = providerResponseError(
      [
        `${prefix}_${response.status}`,
        error.providerErrorCode,
        error.providerMessage,
      ].filter(Boolean).join(":"),
      error.diagnostics,
    );
    throw redactedRequest
      ? attachProviderRedactedRequest(responseError, redactedRequest)
      : responseError;
  }
  const text = await response.text();
  if (!text.trim()) {
    const error = providerResponseError(`${prefix}_empty_response`, providerResponseDiagnostics(response, text));
    throw redactedRequest ? attachProviderRedactedRequest(error, redactedRequest) : error;
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const error = providerResponseError(`${prefix}_invalid_json`, providerResponseDiagnostics(response, text));
    throw redactedRequest ? attachProviderRedactedRequest(error, redactedRequest) : error;
  }
}

async function readProviderError(response: Response): Promise<{
  providerErrorCode: string | null;
  providerMessage: string | null;
  diagnostics: ProviderResponseDiagnostics;
}> {
  const { text, diagnostics } = await readProviderResponseDiagnostics(response);
  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    return {
      providerErrorCode: findProviderErrorCode(payload),
      providerMessage: findProviderMessage(payload),
      diagnostics,
    };
  } catch {
    return {
      providerErrorCode: null,
      providerMessage: diagnostics.responseBodyPreview || null,
      diagnostics,
    };
  }
}

function findProviderStatus(payload: Record<string, unknown>) {
  return findFirstString(payload, [
    ["status"],
    ["task_status"],
    ["taskStatus"],
    ["data", "status"],
    ["data", "task_status"],
    ["data", "taskStatus"],
    ["result", "status"],
    ["result", "task_status"],
    ["result", "taskStatus"],
    ["output", "status"],
    ["output", "task_status"],
    ["output", "taskStatus"],
  ]);
}

function findVideoUrl(payload: Record<string, unknown>) {
  return findFirstString(payload, [
    ["video_url"],
    ["videoUrl"],
    ["content_url"],
    ["contentUrl"],
    ["result_url"],
    ["resultUrl"],
    ["url"],
    ["data", "video_url"],
    ["data", "videoUrl"],
    ["data", "content_url"],
    ["data", "contentUrl"],
    ["result", "video_url"],
    ["result", "videoUrl"],
    ["output", "video_url"],
    ["output", "videoUrl"],
  ]);
}

function findProviderErrorCode(payload: Record<string, unknown>) {
  return findFirstString(payload, [
    ["code"],
    ["error", "code"],
    ["data", "code"],
    ["data", "error", "code"],
    ["result", "error", "code"],
    ["output", "error", "code"],
  ]) ?? null;
}

function findProviderMessage(payload: Record<string, unknown>) {
  return findFirstString(payload, [
    ["message"],
    ["error"],
    ["error", "message"],
    ["data", "message"],
    ["data", "error"],
    ["data", "error", "message"],
    ["result", "message"],
    ["result", "error", "message"],
    ["output", "message"],
    ["output", "error", "message"],
  ]) ?? null;
}

function normalizeProviderStatus(status: string | undefined): "accepted" | "running" | "succeeded" | "failed" {
  const normalized = status?.trim().toLowerCase();
  if (["succeeded", "success", "completed", "done", "finished"].includes(normalized ?? "")) {
    return "succeeded";
  }
  if (["failed", "error", "canceled", "cancelled"].includes(normalized ?? "")) {
    return "failed";
  }
  if (["running", "processing", "generating"].includes(normalized ?? "")) {
    return "running";
  }
  if (["queued", "pending", "submitted"].includes(normalized ?? "")) {
    return "accepted";
  }
  return "accepted";
}

function buildReferenceImageUrls(payload: Record<string, unknown>, parameters: Record<string, unknown>) {
  return dedupeStrings([
    readString(payload.firstFrameUrl),
    readString(payload.imageUrl),
    readString(payload.referenceImageUrl),
    readMediaUrl(parameters.firstFrame),
    readMediaUrl(parameters.imageReference),
    ...readMediaUrlArray(payload.referenceImages),
    ...readMediaUrlArray(parameters.referenceImages),
    ...readMediaUrlArray(parameters.referenceUploads),
    ...readMediaUrlArray(parameters.quickReferences),
    ...readMediaUrlArray(parameters.filePaths),
  ]);
}

function buildReferenceVideoUrls(payload: Record<string, unknown>, parameters: Record<string, unknown>) {
  const videoFilePathUrls = readMediaUrlArray(parameters.videoFilePaths);
  return dedupeStrings(videoFilePathUrls.length > 0
    ? videoFilePathUrls
    : [
      readString(payload.referenceVideoUrl),
      readString(payload.sourceVideoUrl),
      readMediaUrl(payload.sourceVideo),
      ...readMediaUrlArray(payload.videos),
      ...readMediaUrlArray(parameters.videos),
      ...readMediaUrlArray(parameters.referenceVideos),
      ...readMediaUrlArray(parameters.editSourceVideo),
      ...readMediaUrlArray(parameters.sourceVideo),
    ]);
}

function buildReferenceAudioUrls(payload: Record<string, unknown>, parameters: Record<string, unknown>) {
  const audioFilePathUrls = readMediaUrlArray(parameters.audioFilePaths);
  return dedupeStrings(audioFilePathUrls.length > 0
    ? audioFilePathUrls
    : [
      readString(payload.referenceAudioUrl),
      readString(payload.audioUrl),
      readMediaUrl(payload.referenceAudio),
      ...readMediaUrlArray(payload.audios),
      ...readMediaUrlArray(parameters.audios),
      ...readMediaUrlArray(parameters.referenceAudio),
      ...readMediaUrlArray(parameters.referenceAudios),
    ]);
}

function readRatio(parameters: Record<string, unknown>) {
  const ratio = readString(parameters.ratio) ?? readString(parameters.aspectRatio);
  return ratio && ratio !== "adaptive" ? ratio : undefined;
}

function readDuration(parameters: Record<string, unknown>) {
  return readInteger(parameters.durationSec) ?? readInteger(parameters.duration) ?? readInteger(parameters.seconds);
}

function findFirstString(payload: Record<string, unknown>, paths: string[][]): string | undefined {
  for (const path of paths) {
    const value = readPath(payload, path);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function readPath(payload: Record<string, unknown>, path: string[]) {
  let current: unknown = payload;
  for (const segment of path) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function removeUndefinedValues<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => {
      if (entryValue === undefined) return false;
      if (Array.isArray(entryValue) && entryValue.length === 0) return false;
      return true;
    }),
  ) as T;
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function readMediaUrl(value: unknown): string | undefined {
  if (typeof value === "string") {
    return readString(value);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["url", "sourceUrl", "downloadUrl", "previewUrl", "publicUrl", "src"]) {
    const url = readString(record[key]);
    if (url) {
      return url;
    }
  }
  return undefined;
}

function readMediaUrlArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    const url = readMediaUrl(value);
    return url ? [url] : [];
  }
  return value.map((item) => readMediaUrl(item)).filter((item): item is string => Boolean(item));
}

function dedupeStrings(values: Array<string | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = readString(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function firstItems<T>(values: T[], count: number) {
  return values.slice(0, count);
}
