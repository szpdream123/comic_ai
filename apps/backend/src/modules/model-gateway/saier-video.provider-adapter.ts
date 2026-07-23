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

const defaultModel = "mg-seedance2.0 -720p-15s";

export class SaierVideoProviderAdapter implements ProviderAdapter {
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
    const requestPayload = buildSaierVideoPayload(input, this.config.model);
    const redactedRequest = await recordProviderAdapterRequest(
      input,
      requestPayload,
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
      status: "accepted",
      redactedRequest,
      redactedResponse: attachProviderRawResponse({
        model: requestPayload.model,
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
      this.config.queryTaskEndpoint.replace(
        "{taskId}",
        encodeURIComponent(input.externalRequestId),
      ),
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
        },
      },
    );
    const payload = await readJsonResponse(response, "video_provider_poll");
    const providerStatus = normalizeProviderStatus(findProviderStatus(payload));

    return {
      status: providerStatus,
      videoUrl: findVideoUrl(payload),
      redactedResponse: attachProviderRawResponse({
        providerStatus,
        taskId: input.externalRequestId,
        providerErrorCode: findProviderErrorCode(payload),
        providerMessage: findProviderMessage(payload),
      }, payload),
    };
  }
}

export function buildSaierVideoPayload(
  input: ProviderSubmissionInput,
  model?: string,
): Record<string, unknown> {
  const payload = input.redactedPayload;
  const parameters = readObject(payload.parameters);
  const resolution = readString(parameters.resolution) ?? "720p";
  const prompt = readString(payload.prompt) ?? readString(payload.motionPrompt) ?? "";
  const firstFrameUrl = firstSubmittableUrl([
    readString(payload.firstFrameUrl),
    readString(payload.imageUrl),
    readString(payload.referenceImageUrl),
    readMediaUrl(parameters.firstFrame),
    readMediaUrl(parameters.imageReference),
  ]);
  const lastFrameUrl = firstSubmittableUrl([
    readString(payload.lastFrameUrl),
    readMediaUrl(payload.lastFrame),
    readMediaUrl(parameters.lastFrame),
  ]);
  const referenceImageUrls = dedupeSubmittableUrls([
    ...readMediaUrlArray(parameters.filePaths),
    firstFrameUrl,
    lastFrameUrl,
    ...readMediaUrlArray(payload.referenceImages),
    ...readMediaUrlArray(parameters.referenceImages),
    ...readMediaUrlArray(parameters.referenceUploads),
    ...readMediaUrlArray(parameters.quickReferences),
    ...readMediaUrlArray(parameters.mentionReferences),
  ]);
  const referenceVideoUrls = dedupeSubmittableUrls([
    ...readMediaUrlArray(parameters.videoFilePaths),
    readString(payload.referenceVideoUrl),
    readString(payload.sourceVideoUrl),
    readMediaUrl(payload.sourceVideo),
    ...readMediaUrlArray(payload.videos),
    ...readMediaUrlArray(parameters.videos),
    ...readMediaUrlArray(parameters.referenceVideos),
    ...readMediaUrlArray(parameters.editSourceVideo),
    ...readMediaUrlArray(parameters.sourceVideo),
  ]);
  const referenceAudioUrls = dedupeSubmittableUrls([
    ...readMediaUrlArray(parameters.audioFilePaths),
    readString(payload.referenceAudioUrl),
    readString(payload.audioUrl),
    readMediaUrl(payload.referenceAudio),
    ...readMediaUrlArray(payload.audios),
    ...readMediaUrlArray(parameters.audios),
    ...readMediaUrlArray(parameters.referenceAudio),
  ]);
  const content = buildReferenceContent({
    referenceImageUrls,
    referenceVideoUrls,
    referenceAudioUrls,
  });
  const metadata = removeUndefinedValues({
    ...(content.length ? { content } : {}),
    ratio: readString(parameters.ratio) ?? readString(parameters.aspectRatio),
    resolution: readString(parameters.resolution),
    seed: readInteger(parameters.seed),
    camera_fixed: readBoolean(parameters.camera_fixed) ?? readBoolean(parameters.cameraFixed),
    return_last_frame:
      readBoolean(parameters.return_last_frame) ?? readBoolean(parameters.returnLastFrame),
    generate_audio: readBoolean(parameters.generate_audio) ?? readBoolean(parameters.generateAudio),
    watermark: readBoolean(parameters.watermark) ?? false,
  });

  return removeUndefinedValues({
    model: resolveSaierModel(model, resolution),
    prompt,
    seconds: "1",
    metadata,
  });
}

function resolveSaierModel(model: string | undefined, resolution: string) {
  const template = model?.trim() || defaultModel;
  return template.replaceAll("{resolution}", resolution);
}

function buildReferenceContent(input: {
  referenceImageUrls: string[];
  referenceVideoUrls: string[];
  referenceAudioUrls: string[];
}) {
  return [
    ...input.referenceImageUrls.map((url) => ({
      type: "image_url",
      role: "reference_image",
      image_url: { url },
    })),
    ...input.referenceVideoUrls.map((url) => ({
      type: "video_url",
      role: "reference_video",
      video_url: { url },
    })),
    ...input.referenceAudioUrls.map((url) => ({
      type: "audio_url",
      role: "reference_audio",
      audio_url: { url },
    })),
  ];
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
    const error = providerResponseError(
      `${prefix}_empty_response`,
      providerResponseDiagnostics(response, text),
    );
    throw redactedRequest ? attachProviderRedactedRequest(error, redactedRequest) : error;
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const error = providerResponseError(
      `${prefix}_invalid_json`,
      providerResponseDiagnostics(response, text),
    );
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
  ]);
}

function findVideoUrl(payload: Record<string, unknown>) {
  return findFirstString(payload, [
    ["metadata", "url"],
    ["metadata", "video_url"],
    ["video_url"],
    ["videoUrl"],
    ["content", "video_url"],
    ["content", "videoUrl"],
    ["data", "metadata", "url"],
    ["data", "video_url"],
    ["data", "videoUrl"],
    ["data", "content", "video_url"],
    ["result", "metadata", "url"],
    ["result", "video_url"],
    ["result", "videoUrl"],
    ["result", "content", "video_url"],
  ]);
}

function findProviderErrorCode(payload: Record<string, unknown>) {
  return findFirstString(payload, [
    ["code"],
    ["error", "code"],
    ["data", "code"],
    ["data", "error", "code"],
    ["result", "error", "code"],
  ]) ?? null;
}

function findProviderMessage(payload: Record<string, unknown>) {
  return findFirstString(payload, [
    ["message"],
    ["error", "message"],
    ["data", "message"],
    ["data", "error", "message"],
    ["result", "message"],
    ["result", "error", "message"],
  ]) ?? null;
}

function normalizeProviderStatus(
  status: string | undefined,
): "accepted" | "running" | "succeeded" | "failed" {
  const normalized = status?.trim().toLowerCase();
  if (["succeeded", "success", "completed", "done"].includes(normalized ?? "")) {
    return "succeeded";
  }
  if (["failed", "error", "canceled", "cancelled"].includes(normalized ?? "")) {
    return "failed";
  }
  if (["running", "processing", "in_progress", "generating"].includes(normalized ?? "")) {
    return "running";
  }
  return "accepted";
}

function findFirstString(payload: Record<string, unknown>, paths: string[][]) {
  for (const path of paths) {
    const value = readPath(payload, path);
    const result = readString(value);
    if (result) {
      return result;
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

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
  if (Array.isArray(value)) {
    return value.flatMap((item) => readMediaUrlArray(item));
  }
  const url = readMediaUrl(value);
  return url ? [url] : [];
}

function firstSubmittableUrl(values: Array<string | undefined>) {
  return values.find(isSubmittableUrl);
}

function dedupeSubmittableUrls(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => isSubmittableUrl(value)))];
}

function isSubmittableUrl(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function readInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function removeUndefinedValues(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
