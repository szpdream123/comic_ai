import type {
  MediaGenerationArtifact,
  ProviderAdapter,
  ProviderSubmissionInput,
  ProviderSubmissionResult,
} from "./provider-adapter.contract.ts";
import {
  attachProviderRedactedRequest,
  providerResponseError,
  readProviderResponseDiagnostics,
  type ProviderResponseDiagnostics,
} from "./provider-response-diagnostics.ts";

const defaultImageModel = "gpt-image-2";
const defaultVideoModel = "sora-2";

export class LingdongApiProviderAdapter implements ProviderAdapter {
  constructor(
    private readonly config: {
      apiKey: string;
      model?: string;
      mediaType: "image" | "video";
      imageEndpoint?: string;
      createTaskEndpoint?: string;
      queryTaskEndpoint?: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async submit(input: ProviderSubmissionInput): Promise<ProviderSubmissionResult> {
    return this.config.mediaType === "video"
      ? this.submitVideo(input)
      : this.submitImage(input);
  }

  async poll(input: { externalRequestId: string }): Promise<{
    status: "accepted" | "running" | "succeeded" | "failed";
    videoUrl?: string;
    redactedResponse: Record<string, unknown>;
  }> {
    if (this.config.mediaType !== "video") {
      throw new Error("video_provider_poll_unsupported");
    }
    if (!this.config.queryTaskEndpoint) {
      throw new Error("video_provider_query_endpoint_required");
    }

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
    const normalizedStatus = normalizeProviderStatus(providerStatus);

    return {
      status: normalizedStatus,
      videoUrl: resolveLingdongVideoContentUrl(payload, input.externalRequestId),
      redactedResponse: {
        model: this.config.model ?? defaultVideoModel,
        taskId: input.externalRequestId,
        providerStatus: providerStatus ?? null,
        providerErrorCode: findProviderErrorCode(payload),
        providerMessage: findProviderMessage(payload),
      },
    };
  }

  private async submitImage(input: ProviderSubmissionInput): Promise<ProviderSubmissionResult> {
    const endpoint = this.config.imageEndpoint;
    if (!endpoint) {
      throw new Error("image_provider_endpoint_required");
    }

    const fetchImpl = this.config.fetchImpl ?? fetch;
    const redactedRequest = buildLingdongImagePayload(input, this.config.model);
    const response = await fetchWithRedactedRequest(fetchImpl, endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(redactedRequest),
    }, redactedRequest);
    const payload = await readJsonResponse(response, "image_provider", redactedRequest);
    const artifacts = collectImageArtifacts(payload);
    if (artifacts.length < 1) {
      throw attachProviderRedactedRequest(providerResponseError(
        "image_provider_invalid_response",
        providerDiagnosticsFromPayload(response, payload),
      ), redactedRequest);
    }

    const externalRequestId =
      findFirstString(payload, [
        ["id"],
        ["request_id"],
        ["requestId"],
        ["data", "id"],
        ["data", "request_id"],
        ["data", "requestId"],
      ]) ?? input.providerRequestId;

    return {
      externalRequestId,
      status: "succeeded",
      redactedRequest,
      redactedResponse: {
        model: this.config.model ?? defaultImageModel,
        imageCount: artifacts.length,
        outputTypes: Array.from(
          new Set(
            artifacts.map((item) => item.b64Json ? "b64_json" : item.url ? "url" : "unknown").filter((item) => item !== "unknown"),
          ),
        ),
      },
      artifacts,
    };
  }

  private async submitVideo(input: ProviderSubmissionInput): Promise<ProviderSubmissionResult> {
    const endpoint = this.config.createTaskEndpoint;
    if (!endpoint) {
      throw new Error("video_provider_endpoint_required");
    }

    const fetchImpl = this.config.fetchImpl ?? fetch;
    const redactedRequest = buildLingdongVideoPayload(input, this.config.model);
    const response = await fetchWithRedactedRequest(fetchImpl, endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(redactedRequest),
    }, redactedRequest);
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
      throw attachProviderRedactedRequest(providerResponseError(
        "video_provider_invalid_response",
        providerDiagnosticsFromPayload(response, payload),
      ), redactedRequest);
    }

    return {
      externalRequestId,
      status: "accepted",
      redactedRequest,
      redactedResponse: {
        model: this.config.model ?? defaultVideoModel,
        providerStatus: findProviderStatus(payload) ?? null,
      },
    };
  }
}

function buildLingdongImagePayload(
  input: ProviderSubmissionInput,
  model?: string,
): Record<string, unknown> {
  const payload = input.redactedPayload;
  const parameters = readObject(payload.parameters);
  const prompt = readString(payload.prompt) ?? readString(payload.title) ?? "";
  const referenceImages = dedupeStrings([
    ...readMediaUrlArray(payload.referenceImages),
    ...readMediaUrlArray(payload.images),
    readMediaUrl(payload.imageUrl),
    readMediaUrl(payload.image_url),
    ...readMediaUrlArray(parameters.referenceImages),
    ...readMediaUrlArray(parameters.reference_images),
    ...readMediaUrlArray(parameters.images),
    readMediaUrl(parameters.imageUrl),
    readMediaUrl(parameters.image_url),
  ]);
  return {
    model: model ?? defaultImageModel,
    prompt,
    ...(referenceImages.length ? { reference_images: referenceImages } : {}),
    ...optionalPayloadField("size", readString(parameters.size) ?? readString(parameters.imageSize)),
    ...optionalPayloadField("quality", readString(parameters.quality)),
    ...optionalPayloadField("n", readInteger(parameters.count) ?? readInteger(parameters.n)),
    ...optionalPayloadField("seed", readInteger(parameters.seed)),
    ...optionalPayloadField("response_format", readString(parameters.responseFormat)),
  };
}

function buildLingdongVideoPayload(
  input: ProviderSubmissionInput,
  model?: string,
): Record<string, unknown> {
  const resolvedModel = model ?? defaultVideoModel;
  const payload = input.redactedPayload;
  const parameters = readObject(payload.parameters);
  const prompt = readString(payload.prompt) ?? readString(payload.motionPrompt) ?? "";
  const filePathImageUrls = readMediaUrlArray(parameters.filePaths);
  const videoFilePathUrls = readMediaUrlArray(parameters.videoFilePaths);
  const audioFilePathUrls = readMediaUrlArray(parameters.audioFilePaths);
  const images = dedupeStrings([
    ...filePathImageUrls,
    ...readMediaUrlArray(payload.images),
    ...readMediaUrlArray(parameters.images),
    readString(payload.firstFrameUrl),
    readString(payload.imageUrl),
    readString(payload.referenceImageUrl),
    ...readMediaUrlArray(payload.referenceImages),
    ...readMediaUrlArray(parameters.referenceImages),
    ...readMediaUrlArray(parameters.referenceUploads),
    ...readMediaUrlArray(parameters.quickReferences),
    readMediaUrl(parameters.firstFrame),
    readMediaUrl(parameters.imageReference),
  ]);
  const videos = dedupeStrings([
    ...videoFilePathUrls,
    readString(payload.referenceVideoUrl),
    readString(payload.sourceVideoUrl),
    ...readMediaUrlArray(payload.videos),
    ...readMediaUrlArray(parameters.videos),
    ...readMediaUrlArray(parameters.referenceVideos),
    ...readMediaUrlArray(parameters.editSourceVideo),
    ...readMediaUrlArray(parameters.sourceVideo),
  ]);
  const audios = dedupeStrings([
    ...audioFilePathUrls,
    readString(payload.referenceAudioUrl),
    ...readMediaUrlArray(payload.audios),
    ...readMediaUrlArray(parameters.audios),
    ...readMediaUrlArray(parameters.referenceAudio),
  ]);

  return {
    model: resolvedModel,
    ...optionalPayloadField("ratio", readString(parameters.ratio) ?? readString(parameters.aspect_ratio) ?? readString(parameters.aspectRatio) ?? readString(payload.ratio) ?? readString(payload.aspect_ratio) ?? readString(payload.aspectRatio)),
    ...optionalPayloadField("duration", readInteger(parameters.durationSec) ?? readInteger(parameters.duration) ?? readInteger(payload.durationSec) ?? readInteger(payload.duration)),
    ...optionalPayloadField("resolution", readString(parameters.resolution) ?? readString(payload.resolution)),
    generate_audio: readBoolean(parameters.generate_audio) ?? readBoolean(parameters.generateAudio) ?? readBoolean(payload.generate_audio) ?? readBoolean(payload.generateAudio) ?? true,
    watermark: readBoolean(parameters.watermark) ?? readBoolean(payload.watermark) ?? false,
    prompt,
    ...(images.length ? { images } : {}),
    ...(videos.length ? { videos } : {}),
    ...(audios.length ? { audios } : {}),
    ...optionalPayloadField("aspect_ratio", readString(parameters.aspect_ratio) ?? readString(parameters.aspectRatio) ?? readString(payload.aspect_ratio) ?? readString(payload.aspectRatio)),
    ...optionalPayloadField("orientation", readString(parameters.orientation) ?? readString(payload.orientation)),
    ...optionalPayloadField("size", readString(parameters.size) ?? readString(parameters.imageSize) ?? readString(payload.size) ?? readString(payload.imageSize)),
    ...optionalPayloadField("seed", readInteger(parameters.seed) ?? readInteger(payload.seed)),
  };
}

function resolveLingdongVideoContentUrl(
  payload: Record<string, unknown>,
  externalRequestId: string,
) {
  const explicit =
    findFirstString(payload, [
      ["content_url"],
      ["contentUrl"],
      ["video_url"],
      ["videoUrl"],
      ["result_url"],
      ["resultUrl"],
      ["url"],
      ["data", "content_url"],
      ["data", "contentUrl"],
      ["data", "video_url"],
      ["data", "videoUrl"],
      ["data", "result_url"],
      ["data", "resultUrl"],
      ["result", "content_url"],
      ["result", "contentUrl"],
      ["result", "video_url"],
      ["result", "videoUrl"],
      ["result", "result_url"],
      ["result", "resultUrl"],
    ]) ?? "";
  if (explicit && /\/v1\/videos\/[^/]+\/content$/i.test(explicit)) {
    return explicit;
  }
  if (normalizeProviderStatus(findProviderStatus(payload)) !== "succeeded") {
    return undefined;
  }
  return `https://www.lingdongapi.com/v1/videos/${encodeURIComponent(externalRequestId)}/content`;
}

function collectImageArtifacts(payload: Record<string, unknown>): MediaGenerationArtifact[] {
  const artifacts: MediaGenerationArtifact[] = [];
  const seen = new Set<string>();
  for (const candidate of walkValues(payload)) {
    const object = readObject(candidate);
    const url =
      readString(object.content_url) ??
      readString(object.contentUrl) ??
      readString(object.image_url) ??
      readString(object.imageUrl) ??
      readString(object.result_url) ??
      readString(object.resultUrl) ??
      readString(object.url);
    const b64Json = readString(object.b64_json) ?? readString(object.b64Json);
    if (url && !seen.has(`url:${url}`)) {
      seen.add(`url:${url}`);
      artifacts.push({
        mediaType: "image",
        mimeType: "image/png",
        fileExtension: "png",
        url,
      });
    }
    if (b64Json && !seen.has(`b64:${b64Json}`)) {
      seen.add(`b64:${b64Json}`);
      artifacts.push({
        mediaType: "image",
        mimeType: "image/png",
        fileExtension: "png",
        b64Json,
      });
    }
  }
  return artifacts;
}

async function fetchWithRedactedRequest(
  fetchImpl: typeof fetch,
  endpoint: string,
  init: RequestInit,
  redactedRequest: Record<string, unknown>,
) {
  try {
    return await fetchImpl(endpoint, init);
  } catch (error) {
    if (error instanceof Error) {
      throw attachProviderRedactedRequest(error, redactedRequest);
    }
    throw error;
  }
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
    throw redactedRequest ? attachProviderRedactedRequest(responseError, redactedRequest) : responseError;
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

function* walkValues(value: unknown): Generator<unknown> {
  yield value;
  if (Array.isArray(value)) {
    for (const item of value) {
      yield* walkValues(item);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      yield* walkValues(item);
    }
  }
}

function optionalPayloadField(key: string, value: unknown) {
  return value === undefined ? {} : { [key]: value };
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
