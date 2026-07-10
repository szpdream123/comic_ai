import type {
  ProviderAdapter,
  ProviderSubmissionInput,
  ProviderSubmissionResult,
} from "./provider-adapter.contract.ts";
import {
  providerResponseDiagnostics,
  providerResponseError,
  type ProviderResponseDiagnostics,
} from "./provider-response-diagnostics.ts";

const defaultModel = "sd2_manxue_720p";
const defaultRequestTimeoutMs = 120_000;

export class GlobalAiOpcVideoProviderAdapter implements ProviderAdapter {
  constructor(
    private readonly config: {
      apiKey: string;
      model?: string;
      createTaskEndpoint: string;
      queryTaskEndpoint?: string;
      fetchImpl?: typeof fetch;
      requestTimeoutMs?: number;
      defaultRequestParams?: Record<string, unknown>;
    },
  ) {}

  async submit(input: ProviderSubmissionInput): Promise<ProviderSubmissionResult> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const requestPayload = buildGlobalAiOpcVideoPayload(input, {
      model: this.config.model,
      defaultRequestParams: this.config.defaultRequestParams,
    });
    const response = await fetchWithTimeout(
      fetchImpl,
      this.config.createTaskEndpoint,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      },
      this.config.requestTimeoutMs,
    );
    const payload = await readJsonResponse(response, "global_ai_opc_video");
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
    ]);
    if (!externalRequestId) {
      throw providerResponseError(
        "global_ai_opc_video_invalid_response",
        providerDiagnosticsFromPayload(response, payload),
      );
    }

    return {
      externalRequestId,
      status: "accepted",
      redactedRequest: requestPayload,
      redactedResponse: {
        model: readString(requestPayload.model) ?? this.config.model ?? defaultModel,
        providerStatus: findProviderStatus(payload) ?? null,
      },
    };
  }

  async poll(input: { externalRequestId: string }): Promise<{
    status: "accepted" | "running" | "succeeded" | "failed";
    videoUrl?: string;
    redactedResponse: Record<string, unknown>;
  }> {
    if (!this.config.queryTaskEndpoint) {
      throw new Error("global_ai_opc_video_query_endpoint_required");
    }

    const fetchImpl = this.config.fetchImpl ?? fetch;
    const response = await fetchWithTimeout(
      fetchImpl,
      this.config.queryTaskEndpoint
        .replace("{taskId}", encodeURIComponent(input.externalRequestId))
        .replace("{id}", encodeURIComponent(input.externalRequestId)),
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
        },
      },
      this.config.requestTimeoutMs,
    );
    const payload = await readJsonResponse(response, "global_ai_opc_video_poll");
    const providerStatus = findProviderStatus(payload);

    return {
      status: normalizeProviderStatus(providerStatus),
      videoUrl: findVideoUrl(payload),
      redactedResponse: {
        model: this.config.model ?? defaultModel,
        taskId: input.externalRequestId,
        providerStatus: providerStatus ?? null,
        providerErrorCode: findProviderErrorCode(payload),
        providerMessage: findProviderMessage(payload),
      },
    };
  }
}

export function buildGlobalAiOpcVideoPayload(
  input: ProviderSubmissionInput,
  config: {
    model?: string;
    defaultRequestParams?: Record<string, unknown>;
  } = {},
): Record<string, unknown> {
  const payload = input.redactedPayload;
  const parameters = readObject(payload.parameters);
  const defaults = config.defaultRequestParams ?? {};
  const prompt = readString(payload.prompt) ?? readString(payload.motionPrompt) ?? readString(parameters.prompt) ?? "";
  const duration = readInteger(parameters.durationSec) ?? readInteger(parameters.duration) ?? readInteger(defaults.duration);
  const ratio =
    readString(parameters.ratio) ??
    readString(parameters.aspectRatio) ??
    readString(parameters.aspect_ratio) ??
    readString(defaults.ratio) ??
    readString(defaults.aspectRatio);
  const resolution = readString(parameters.resolution) ?? readString(defaults.resolution);
  const firstImageUrl = firstHttpUrl([
    readString(payload.firstFrameUrl),
    readString(payload.imageUrl),
    readMediaUrl(parameters.firstFrame),
    readMediaUrl(parameters.imageReference),
  ]);
  const lastImageUrl = firstHttpUrl([
    readString(payload.lastFrameUrl),
    readMediaUrl(parameters.lastFrame),
  ]);
  const referenceImageUrls = dedupeHttpUrls([
    readString(payload.referenceImageUrl),
    ...readMediaUrlArray(payload.referenceImages),
    ...readMediaUrlArray(parameters.referenceImages),
    ...readMediaUrlArray(parameters.referenceUploads),
    ...readMediaUrlArray(parameters.quickReferences),
  ]);
  const videoUrls = dedupeHttpUrls([
    readString(payload.referenceVideoUrl),
    readString(payload.sourceVideoUrl),
    ...readMediaUrlArray(payload.videos),
    ...readMediaUrlArray(parameters.videos),
    ...readMediaUrlArray(parameters.referenceVideos),
    ...readMediaUrlArray(parameters.editSourceVideo),
    ...readMediaUrlArray(parameters.sourceVideo),
  ]);
  const audioUrls = dedupeHttpUrls([
    readString(payload.referenceAudioUrl),
    readString(payload.audioUrl),
    ...readMediaUrlArray(payload.audios),
    ...readMediaUrlArray(parameters.audios),
    ...readMediaUrlArray(parameters.referenceAudio),
  ]);
  const referenceMode = isReferenceMediaMode(parameters) || videoUrls.length > 0 || audioUrls.length > 0;
  const referenceModeImageUrls = dedupeHttpUrls([
    firstImageUrl,
    lastImageUrl,
    ...referenceImageUrls,
  ]);
  if (/^openAiSora2/i.test(config.model?.trim() ?? "")) {
    const size = readString(parameters.size) ?? readString(defaults.size);
    return stripUndefined({
      model: config.model,
      prompt,
      size,
      aspect_ratio: size ? undefined : ratio,
      seconds: duration,
      input_reference: referenceModeImageUrls.length ? referenceModeImageUrls.slice(0, 1) : undefined,
    });
  }
  if (/^grok_/i.test(config.model?.trim() ?? "")) {
    return stripUndefined({
      model: config.model,
      prompt,
      duration,
      aspect_ratio: ratio,
      resolution,
      image_urls: referenceModeImageUrls.length ? referenceModeImageUrls : undefined,
    });
  }
  if (/^happyhorse-1\.0-r2v(?:-economy)?$/i.test(config.model?.trim() ?? "")) {
    return stripUndefined({
      model: config.model,
      prompt,
      referenceImages: referenceModeImageUrls.length ? referenceModeImageUrls : undefined,
      duration,
      ratio,
      resolution: normalizeHappyHorseResolution(resolution),
      seed: readInteger(parameters.seed) ?? readInteger(defaults.seed),
    });
  }
  const imageFields = referenceMode
    ? {
        referenceImages: referenceModeImageUrls.length ? referenceModeImageUrls : undefined,
      }
    : {
        first_image: firstImageUrl,
        last_image: firstImageUrl ? lastImageUrl : undefined,
        referenceImages: firstImageUrl || !referenceImageUrls.length ? undefined : referenceImageUrls,
      };

  return stripUndefined({
    ...defaults,
    model: resolveGlobalAiOpcVideoModel(config.model, {
      resolution,
      hasReferenceVideos: videoUrls.length > 0,
    }),
    prompt,
    ...imageFields,
    referenceVideos: videoUrls.length ? videoUrls : undefined,
    referenceAudios: audioUrls.length ? audioUrls : undefined,
    duration,
    ratio,
    seed: readInteger(parameters.seed) ?? readInteger(defaults.seed),
    generate_audio: readBoolean(parameters.generateAudio) ?? readBoolean(defaults.generate_audio),
    watermark: readBoolean(parameters.watermark) ?? readBoolean(defaults.watermark),
  });
}

function resolveGlobalAiOpcVideoModel(
  model: string | undefined,
  input: {
    resolution?: string;
    hasReferenceVideos: boolean;
  },
) {
  const configured = model?.trim() || defaultModel;
  const resolution = normalizeGlobalAiOpcResolution(input.resolution) ?? "720p";
  if (/^sd2_manxue(?:_video)?(?:_fast)?_(?:720p|1080p|2k|4k)$/i.test(configured)) {
    return configured;
  }
  if (configured === "sd2_manxue") {
    return input.hasReferenceVideos ? `sd2_manxue_video_${resolution}` : `sd2_manxue_${resolution}`;
  }
  if (configured === "sd2_manxue_fast") {
    const fastResolution = resolution === "1080p" ? "1080p" : "720p";
    return input.hasReferenceVideos ? `sd2_manxue_video_fast_${fastResolution}` : `sd2_manxue_fast_${fastResolution}`;
  }
  if (configured === "sd2_manxue_video") {
    return `sd2_manxue_video_${resolution}`;
  }
  if (configured === "sd2_manxue_video_fast") {
    const fastResolution = resolution === "1080p" ? "1080p" : "720p";
    return `sd2_manxue_video_fast_${fastResolution}`;
  }
  return configured;
}

function normalizeGlobalAiOpcResolution(value: string | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["720p", "1080p", "2k", "4k"].includes(normalized) ? normalized : undefined;
}

function normalizeHappyHorseResolution(value: string | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return ["720P", "1080P"].includes(normalized) ? normalized : undefined;
}

function isReferenceMediaMode(parameters: Record<string, unknown>) {
  const mode = readString(parameters.mode)?.toLowerCase() ?? "";
  return mode.includes("reference");
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs = defaultRequestTimeoutMs,
) {
  const timeout = readPositiveInteger(timeoutMs) ?? defaultRequestTimeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error("global_ai_opc_video_timeout"));
  }, timeout);
  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw Object.assign(new Error("global_ai_opc_video_timeout"), {
        failureCode: "global_ai_opc_video_timeout",
        providerDiagnostics: buildFetchFailureDiagnostics(url, error),
      });
    }
    throw Object.assign(new Error(readErrorMessage(error) || "global_ai_opc_video_network_error"), {
      failureCode: "global_ai_opc_video_network_error",
      providerDiagnostics: buildFetchFailureDiagnostics(url, error),
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readJsonResponse(response: Response, prefix: string) {
  const text = await response.text();
  const diagnostics = providerResponseDiagnostics(response, text);
  if (!response.ok) {
    throw providerResponseError(`${prefix}_${response.status}`, diagnostics);
  }
  if (!text.trim()) {
    throw providerResponseError(`${prefix}_empty_response`, diagnostics);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw providerResponseError(`${prefix}_invalid_json`, diagnostics);
  }
}

function providerDiagnosticsFromPayload(response: Response, payload: Record<string, unknown>) {
  return providerResponseDiagnostics(response, JSON.stringify(payload));
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
  ]);
}

function normalizeProviderStatus(status: string | undefined): "accepted" | "running" | "succeeded" | "failed" {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (["success", "succeeded", "completed", "complete", "done", "finish", "finished"].includes(normalized)) return "succeeded";
  if (["failed", "failure", "error", "canceled", "cancelled"].includes(normalized)) return "failed";
  if (["running", "processing", "generating", "in_progress", "progress"].includes(normalized)) return "running";
  return "accepted";
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
    ["data", "result_url"],
    ["data", "resultUrl"],
    ["data", "url"],
    ["result", "video_url"],
    ["result", "videoUrl"],
    ["result", "content_url"],
    ["result", "contentUrl"],
    ["result", "result_url"],
    ["result", "resultUrl"],
    ["result", "url"],
  ]);
}

function findProviderErrorCode(payload: Record<string, unknown>) {
  return findFirstString(payload, [
    ["error", "code"],
    ["code"],
    ["data", "error", "code"],
    ["data", "code"],
    ["result", "error", "code"],
    ["result", "code"],
  ]);
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
    ["result", "error"],
    ["result", "error", "message"],
  ]);
}

function findFirstString(payload: unknown, paths: string[][]): string | undefined {
  for (const path of paths) {
    let current = payload;
    for (const key of path) {
      const object = readObject(current);
      current = object[key];
    }
    const value = readString(current);
    if (value) return value;
  }
  return undefined;
}

function readMediaUrlArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(readMediaUrl).filter(Boolean);
  }
  const single = readMediaUrl(value);
  return single ? [single] : [];
}

function readMediaUrl(value: unknown): string {
  if (typeof value === "string") return value.trim();
  const object = readObject(value);
  return (
    readString(object.url) ??
    readString(object.previewUrl) ??
    readString(object.src) ??
    readString(object.remoteUrl) ??
    readString(object.publicUrl) ??
    ""
  );
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.floor(parsed) : undefined;
  }
  return undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return undefined;
}

function readPositiveInteger(value: unknown): number | undefined {
  const parsed = readInteger(value);
  return parsed && parsed > 0 ? parsed : undefined;
}

function dedupeStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim() ?? "").filter(Boolean)));
}

function dedupeHttpUrls(values: Array<string | undefined>) {
  return dedupeStrings(values).filter(isHttpUrl);
}

function firstHttpUrl(values: Array<string | undefined>) {
  return dedupeHttpUrls(values)[0];
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function stripUndefined(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "");
}

function buildFetchFailureDiagnostics(url: string, error: unknown): ProviderResponseDiagnostics {
  return {
    httpStatus: 0,
    statusText: "Network Error",
    contentType: null,
    responseBodyLength: Buffer.byteLength(readErrorMessage(error), "utf8"),
    responseBodyPreview: readErrorMessage(error),
    requestId: null,
  };
}
