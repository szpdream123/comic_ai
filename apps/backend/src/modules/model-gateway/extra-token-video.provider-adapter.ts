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

const defaultModel = "wan2.7-i2v";

export class ExtraTokenVideoProviderAdapter implements ProviderAdapter {
  constructor(
    private readonly config: {
      apiKey: string;
      model?: string;
      createTaskEndpoint: string;
      queryTaskEndpoint: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async submit(input: ProviderSubmissionInput): Promise<ProviderSubmissionResult> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const redactedRequest = await recordProviderAdapterRequest(
      input,
      buildExtraTokenVideoPayload(input, this.config.model),
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
      ["output", "id"],
      ["output", "task_id"],
      ["output", "taskId"],
      ["data", "id"],
      ["data", "task_id"],
      ["data", "taskId"],
      ["result", "id"],
      ["result", "task_id"],
      ["result", "taskId"],
    ]);
    if (!externalRequestId) {
      const error = providerResponseError(
        "video_provider_invalid_response",
        providerDiagnosticsFromPayload(response, payload),
      );
      throw attachProviderRedactedRequest(error, redactedRequest);
    }

    return {
      externalRequestId,
      status: "accepted",
      redactedRequest,
      redactedResponse: attachProviderRawResponse({
        model: this.config.model ?? defaultModel,
        providerStatus: findProviderStatus(payload) ?? null,
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
      this.config.queryTaskEndpoint
        .replace("{taskId}", encodeURIComponent(input.externalRequestId))
        .replace("{model}", encodeURIComponent(this.config.model ?? defaultModel)),
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
        model: this.config.model ?? defaultModel,
        taskId: input.externalRequestId,
        providerStatus: providerStatus ?? null,
        providerErrorCode: findProviderErrorCode(payload),
        providerMessage: findProviderMessage(payload),
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

function buildExtraTokenVideoPayload(
  input: ProviderSubmissionInput,
  model?: string,
): Record<string, unknown> {
  const payload = input.redactedPayload;
  const parameters = readObject(payload.parameters);
  const prompt = readString(payload.prompt) ?? readString(payload.motionPrompt) ?? "";
  const firstFrameUrl =
    readString(payload.firstFrameUrl) ??
    readString(payload.imageUrl) ??
    readString(payload.referenceImageUrl) ??
    readMediaUrl(parameters.firstFrame) ??
    readMediaUrl(parameters.imageReference);
  const lastFrameUrl =
    readString(payload.lastFrameUrl) ??
    readMediaUrl(payload.lastFrame) ??
    readMediaUrl(parameters.lastFrame);
  const filePathImageUrls = readMediaUrlArray(parameters.filePaths);
  const referenceImageUrls = dedupeStrings([
    ...readMediaUrlArray(payload.referenceImages),
    ...readMediaUrlArray(parameters.referenceImages),
    ...readMediaUrlArray(parameters.referenceUploads),
    ...readMediaUrlArray(parameters.quickReferences),
  ].filter((url) => url !== firstFrameUrl && url !== lastFrameUrl));
  const videoFilePathUrls = readMediaUrlArray(parameters.videoFilePaths);
  const referenceVideoUrls = dedupeStrings(videoFilePathUrls.length > 0
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
  const audioFilePathUrls = readMediaUrlArray(parameters.audioFilePaths);
  const referenceAudioUrls = dedupeStrings(audioFilePathUrls.length > 0
    ? audioFilePathUrls
    : [
      readString(payload.referenceAudioUrl),
      readString(payload.audioUrl),
      readMediaUrl(payload.referenceAudio),
      ...readMediaUrlArray(payload.audios),
      ...readMediaUrlArray(parameters.audios),
      ...readMediaUrlArray(parameters.referenceAudio),
    ]);
  const imageUrls = dedupeStrings([...filePathImageUrls, firstFrameUrl, lastFrameUrl, ...referenceImageUrls]);

  return removeUndefinedValues({
    model: model ?? defaultModel,
    input: removeUndefinedValues({
      prompt,
      media: buildMedia({
        imageUrls,
        referenceVideoUrls,
        referenceAudioUrls,
      }),
    }),
    parameters: removeUndefinedValues({
      duration: normalizeExtraTokenDuration(readInteger(parameters.durationSec) ?? readInteger(parameters.duration)),
      resolution: normalizeExtraTokenResolution(parameters.resolution),
      ratio: readString(parameters.ratio) ?? readString(parameters.aspectRatio),
      generate_audio: readBoolean(parameters.generate_audio) ?? readBoolean(parameters.generateAudio) ?? true,
      watermark: readBoolean(parameters.watermark) ?? false,
    }),
  });
}

function buildMedia(input: {
  imageUrls: string[];
  referenceVideoUrls: string[];
  referenceAudioUrls: string[];
}) {
  const media: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  const pushMedia = (
    role: string,
    type: string,
    field: "image_url" | "video_url" | "audio_url",
    url: string | undefined,
  ) => {
    const normalizedUrl = readString(url);
    if (!normalizedUrl || seen.has(normalizedUrl)) {
      return;
    }
    seen.add(normalizedUrl);
    media.push({
      role,
      type,
      [field]: {
        url: normalizedUrl,
      },
    });
  };
  for (const imageUrl of input.imageUrls) {
    pushMedia("reference_image", "image_url", "image_url", imageUrl);
  }
  for (const referenceVideoUrl of input.referenceVideoUrls) {
    pushMedia("reference_video", "video_url", "video_url", referenceVideoUrl);
  }
  for (const referenceAudioUrl of input.referenceAudioUrls) {
    pushMedia("reference_audio", "audio_url", "audio_url", referenceAudioUrl);
  }
  return media;
}

function normalizeExtraTokenDuration(value: number | undefined) {
  return value === undefined ? undefined : Math.max(value, 5);
}

function normalizeExtraTokenResolution(value: unknown) {
  const normalized = readString(value)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return normalized === "1080p" ? "1080p" : "720p";
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

function providerDiagnosticsFromPayload(response: Response, payload: Record<string, unknown>) {
  return providerResponseDiagnostics(response, JSON.stringify(payload));
}

function findProviderStatus(payload: Record<string, unknown>) {
  return findFirstString(payload, [
    ["status"],
    ["task_status"],
    ["taskStatus"],
    ["output", "status"],
    ["output", "task_status"],
    ["output", "taskStatus"],
    ["data", "status"],
    ["data", "task_status"],
    ["data", "taskStatus"],
    ["result", "status"],
    ["result", "task_status"],
    ["result", "taskStatus"],
  ]);
}

function findVideoUrl(payload: Record<string, unknown>) {
  return findFirstString(payload, [
    ["content_url"],
    ["contentUrl"],
    ["video_url"],
    ["videoUrl"],
    ["result_url"],
    ["resultUrl"],
    ["url"],
    ["output", "content_url"],
    ["output", "contentUrl"],
    ["output", "video_url"],
    ["output", "videoUrl"],
    ["output", "result_url"],
    ["output", "resultUrl"],
    ["output", "url"],
    ["data", "content_url"],
    ["data", "contentUrl"],
    ["data", "video_url"],
    ["data", "videoUrl"],
    ["data", "result_url"],
    ["data", "resultUrl"],
    ["data", "url"],
    ["result", "content_url"],
    ["result", "contentUrl"],
    ["result", "video_url"],
    ["result", "videoUrl"],
    ["result", "result_url"],
    ["result", "resultUrl"],
    ["result", "url"],
  ]);
}

function findProviderErrorCode(payload: Record<string, unknown>) {
  return findFirstString(payload, [
    ["code"],
    ["error", "code"],
    ["output", "code"],
    ["output", "error", "code"],
    ["data", "code"],
    ["data", "error", "code"],
    ["result", "error", "code"],
  ]) ?? null;
}

function findProviderMessage(payload: Record<string, unknown>) {
  return findFirstString(payload, [
    ["message"],
    ["error", "message"],
    ["output", "message"],
    ["output", "error", "message"],
    ["data", "message"],
    ["data", "error", "message"],
    ["result", "message"],
    ["result", "error", "message"],
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
  if (["running", "processing", "generating", "queued", "pending", "submitted"].includes(normalized ?? "")) {
    return "running";
  }
  return "accepted";
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
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
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

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
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
