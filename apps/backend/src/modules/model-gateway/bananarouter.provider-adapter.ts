import type {
  MediaGenerationArtifact,
  ProviderAdapter,
  ProviderPollResult,
  ProviderSubmissionInput,
  ProviderSubmissionResult,
} from "./provider-adapter.contract.ts";
import { recordProviderAdapterRequest } from "./provider-adapter.contract.ts";
import { ModelError } from "./model-error.ts";
import { isSafePublicHttpsUrlLiteral } from "./provider-artifact-url-safety.ts";
import {
  attachProviderRawResponse,
  attachProviderRedactedRequest,
  providerResponseDiagnostics,
  providerResponseError,
  type ProviderResponseDiagnostics,
} from "./provider-response-diagnostics.ts";

type BananaRouterRequestFormat =
  | "banana_router_openai_images"
  | "banana_router_sora_video"
  | "banana_router_seedance_video";

const BANANA_ROUTER_IMAGE_RESPONSE_MAX_BYTES = 64 * 1024 * 1024;
const BANANA_ROUTER_JSON_RESPONSE_MAX_BYTES = 4 * 1024 * 1024;
const BANANA_ROUTER_IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

export class BananaRouterProviderAdapter implements ProviderAdapter {
  constructor(
    private readonly config: {
      apiKey: string;
      model?: string;
      requestFormat: BananaRouterRequestFormat;
      createTaskEndpoint: string;
      editEndpoint?: string;
      queryTaskEndpoint?: string;
      resultFormat?: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async submit(input: ProviderSubmissionInput): Promise<ProviderSubmissionResult> {
    if (this.config.requestFormat === "banana_router_sora_video") {
      return this.submitSora(input);
    }
    if (this.config.requestFormat === "banana_router_seedance_video") {
      return this.submitSeedance(input);
    }
    if (this.config.requestFormat !== "banana_router_openai_images") {
      throw ModelError.fromUnknown(new Error("provider_adapter_missing"), {
        failureCode: "provider_adapter_missing",
      });
    }

    const referenceImageUrls = collectImageUrls(input.redactedPayload);
    const requestBody = await recordProviderAdapterRequest(
      input,
      buildImageRequest(input, this.config, referenceImageUrls),
    );
    const endpoint = referenceImageUrls.length > 0
      ? this.config.editEndpoint ?? this.config.createTaskEndpoint
      : this.config.createTaskEndpoint;
    if (!isAsyncImageEndpoint(endpoint)) {
      throw ModelError.fromUnknown(new Error("provider_request_format_media_mismatch"), {
        failureCode: "provider_adapter_missing",
      });
    }
    const response = await executeBananaRouterRequest(this.config.fetchImpl, endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
        "Idempotency-Key": input.providerRequestId,
      },
      body: JSON.stringify(requestBody),
    });
    const text = await readBananaRouterResponseText(
      response,
      BANANA_ROUTER_IMAGE_RESPONSE_MAX_BYTES,
      "banana_router_image_response_too_large",
    );
    const diagnostics = providerResponseDiagnostics(response, text);
    if (!response.ok) {
      throw attachProviderRedactedRequest(
        bananaRouterResponseError(`banana_router_image_${response.status}`, diagnostics),
        requestBody,
      );
    }
    if (!text.trim()) {
      throw attachProviderRedactedRequest(
        bananaRouterResponseError("banana_router_image_empty_response", diagnostics),
        requestBody,
      );
    }

    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(text);
    } catch {
      throw attachProviderRedactedRequest(
        bananaRouterResponseError("banana_router_image_invalid_json", diagnostics),
        requestBody,
      );
    }
    if (!isRecord(parsedPayload)) {
      throw attachProviderRedactedRequest(
        bananaRouterResponseError("banana_router_image_invalid_response", diagnostics),
        requestBody,
      );
    }
    const payload = parsedPayload;
    const externalRequestId = findFirstString(payload, [
      ["taskID"],
      ["taskId"],
      ["task_id"],
      ["data", "taskID"],
      ["data", "taskId"],
      ["data", "task_id"],
    ]);
    const providerStatus = findFirstString(payload, [["status"], ["data", "status"]]);
    const normalizedStatus = normalizeImageStatus(providerStatus);
    if (!externalRequestId || normalizedStatus === "failed") {
      throw attachProviderRedactedRequest(
        bananaRouterResponseError("banana_router_image_invalid_response", diagnostics),
        requestBody,
      );
    }
    return {
      externalRequestId,
      status: normalizedStatus === "running"
        ? "running"
        : "accepted",
      redactedRequest: requestBody,
      redactedResponse: attachProviderRawResponse({
        model: this.config.model ?? "gpt-image-2",
        providerStatus: providerStatus ?? null,
      }, payload),
    };
  }

  async recoverSubmission(
    input: ProviderSubmissionInput & { externalSubmissionStartedAt?: Date | null },
  ): Promise<ProviderSubmissionResult | null> {
    if (this.config.requestFormat !== "banana_router_openai_images") return null;
    if (
      input.externalSubmissionStartedAt &&
      Date.now() - input.externalSubmissionStartedAt.getTime() >= BANANA_ROUTER_IDEMPOTENCY_WINDOW_MS
    ) {
      return null;
    }
    return this.submit(input);
  }

  async poll(input: { externalRequestId: string }): Promise<ProviderPollResult> {
    if (this.config.requestFormat === "banana_router_openai_images") {
      return this.pollImage(input);
    }
    if (!this.config.queryTaskEndpoint) {
      throw ModelError.fromUnknown(new Error("video_provider_query_endpoint_required"), {
        failureCode: "provider_adapter_missing",
      });
    }
    const response = await executeBananaRouterRequest(
      this.config.fetchImpl,
      this.config.queryTaskEndpoint.replace("{taskId}", encodeURIComponent(input.externalRequestId)),
      {
        method: "GET",
        headers: { authorization: `Bearer ${this.config.apiKey}` },
      },
    );
    const payload = await readJsonResponse(response, "banana_router_video_poll");
    const providerStatus = findFirstString(payload, [
      ["status"],
      ["data", "status"],
      ["result", "status"],
    ]);
    const videoUrl = findFirstString(payload, [
      ["video_url"],
      ["videoUrl"],
      ["url"],
      ["content", "video_url"],
      ["content", "videoUrl"],
      ["data", "video_url"],
      ["data", "videoUrl"],
      ["data", "content", "video_url"],
      ["result", "video_url"],
      ["result", "videoUrl"],
    ]);
    const status = normalizeVideoStatus(providerStatus);
    if (videoUrl && !isSafeProviderArtifactUrl(videoUrl)) {
      throw bananaRouterResponseError(
        "banana_router_video_artifact_url_invalid",
        providerResponseDiagnostics(response, JSON.stringify(payload)),
      );
    }
    if (status === "succeeded" && !videoUrl) {
      throw bananaRouterResponseError(
        "banana_router_video_poll_invalid_response",
        providerResponseDiagnostics(response, JSON.stringify(payload)),
      );
    }
    return {
      status,
      videoUrl,
      redactedResponse: attachProviderRawResponse({
        taskId: input.externalRequestId,
        providerStatus: providerStatus ?? null,
      }, payload),
    };
  }

  private async pollImage(input: { externalRequestId: string }): Promise<ProviderPollResult> {
    if (!this.config.queryTaskEndpoint) {
      throw ModelError.fromUnknown(new Error("image_provider_query_endpoint_required"), {
        failureCode: "provider_adapter_missing",
      });
    }
    const response = await executeBananaRouterRequest(
      this.config.fetchImpl,
      this.config.queryTaskEndpoint.replace("{taskId}", encodeURIComponent(input.externalRequestId)),
      {
        method: "GET",
        headers: { authorization: `Bearer ${this.config.apiKey}` },
      },
    );
    const payload = await readJsonResponse(
      response,
      "banana_router_image_poll",
      undefined,
      BANANA_ROUTER_IMAGE_RESPONSE_MAX_BYTES,
    );
    const providerStatus = findFirstString(payload, [
      ["status"],
      ["data", "status"],
      ["result", "status"],
      ["response", "status"],
      ["output", "status"],
    ]);
    const status = normalizeImageStatus(providerStatus);
    const artifacts = imageArtifacts(readImageResultPayload(payload));
    if (status === "succeeded" && !artifacts.length) {
      throw bananaRouterResponseError(
        "banana_router_image_poll_invalid_response",
        providerResponseDiagnostics(response, JSON.stringify(payload)),
      );
    }
    return {
      status,
      redactedResponse: attachProviderRawResponse({
        taskId: input.externalRequestId,
        providerStatus: providerStatus ?? null,
        imageCount: artifacts.length,
      }, payload),
      ...(artifacts.length ? { artifacts } : {}),
    };
  }

  async cancel(input: { externalRequestId: string }): Promise<{
    status: "canceled" | "not_cancelable";
    redactedResponse: Record<string, unknown>;
  }> {
    if (this.config.requestFormat !== "banana_router_seedance_video") {
      return {
        status: "not_cancelable",
        redactedResponse: {
          taskId: input.externalRequestId,
          providerStatus: "not_cancelable",
        },
      };
    }
    if (!this.config.queryTaskEndpoint) {
      throw ModelError.fromUnknown(new Error("video_provider_query_endpoint_required"), {
        failureCode: "provider_adapter_missing",
      });
    }
    const response = await executeBananaRouterRequest(
      this.config.fetchImpl,
      this.config.queryTaskEndpoint.replace("{taskId}", encodeURIComponent(input.externalRequestId)),
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${this.config.apiKey}` },
      },
    );
    if (response.ok) {
      return {
        status: "canceled",
        redactedResponse: {
          taskId: input.externalRequestId,
          providerStatus: "canceled",
        },
      };
    }
    if (response.status === 404 || response.status === 409) {
      return {
        status: "not_cancelable",
        redactedResponse: {
          taskId: input.externalRequestId,
          providerStatus: "not_cancelable",
          providerHttpStatus: response.status,
        },
      };
    }
    await readJsonResponse(response, "banana_router_video_cancel");
    return {
      status: "not_cancelable",
      redactedResponse: { taskId: input.externalRequestId, providerStatus: "not_cancelable" },
    };
  }

  private async submitSora(input: ProviderSubmissionInput): Promise<ProviderSubmissionResult> {
    const redactedRequest = await recordProviderAdapterRequest(
      input,
      buildSoraRequest(input, this.config.model),
    );
    const response = await executeBananaRouterRequest(this.config.fetchImpl, this.config.createTaskEndpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(redactedRequest),
    });
    const payload = await readJsonResponse(response, "banana_router_sora", redactedRequest);
    const externalRequestId = findFirstString(payload, [["id"], ["data", "id"]]);
    if (!externalRequestId) {
      throw attachProviderRedactedRequest(
        bananaRouterResponseError(
          "banana_router_sora_invalid_response",
          providerResponseDiagnostics(response, JSON.stringify(payload)),
        ),
        redactedRequest,
      );
    }
    return {
      externalRequestId,
      status: "accepted",
      redactedRequest,
      redactedResponse: attachProviderRawResponse({
        model: this.config.model ?? "sora-2",
        providerStatus: findFirstString(payload, [["status"], ["data", "status"]]) ?? null,
      }, payload),
    };
  }

  private async submitSeedance(input: ProviderSubmissionInput): Promise<ProviderSubmissionResult> {
    const redactedRequest = await recordProviderAdapterRequest(
      input,
      buildSeedanceRequest(input, this.config.model),
    );
    const response = await executeBananaRouterRequest(this.config.fetchImpl, this.config.createTaskEndpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(redactedRequest),
    });
    const payload = await readJsonResponse(response, "banana_router_seedance", redactedRequest);
    const externalRequestId = findFirstString(payload, [
      ["id"],
      ["task_id"],
      ["taskId"],
      ["data", "id"],
      ["data", "task_id"],
    ]);
    if (!externalRequestId) {
      throw attachProviderRedactedRequest(
        bananaRouterResponseError(
          "banana_router_seedance_invalid_response",
          providerResponseDiagnostics(response, JSON.stringify(payload)),
        ),
        redactedRequest,
      );
    }
    return {
      externalRequestId,
      status: "accepted",
      redactedRequest,
      redactedResponse: attachProviderRawResponse({
        model: this.config.model ?? "doubao-seedance-2.0",
        providerStatus: findFirstString(payload, [["status"], ["data", "status"]]) ?? null,
      }, payload),
    };
  }
}

function buildImageRequest(
  input: ProviderSubmissionInput,
  config: { model?: string; resultFormat?: string },
  referenceImageUrls: string[],
) {
  const parameters = readRecord(input.redactedPayload.parameters);
  return removeUndefined({
    model: config.model ?? "gpt-image-2",
    prompt: readString(input.redactedPayload.prompt) ?? readString(input.redactedPayload.motionPrompt) ?? "",
    images: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
    size: readString(parameters.size),
    quality: readString(parameters.quality),
    response_format: normalizeImageResultFormat(config.resultFormat),
  });
}

function buildSoraRequest(input: ProviderSubmissionInput, model?: string) {
  const payload = input.redactedPayload;
  const parameters = readRecord(payload.parameters);
  const referenceImage = readString(payload.firstFrameUrl) ??
    readString(payload.imageUrl) ??
    readString(payload.referenceImageUrl) ??
    collectImageUrls(payload)[0];
  const duration = readInteger(parameters.durationSec) ?? readInteger(parameters.seconds);
  return removeUndefined({
    model: model ?? "sora-2",
    prompt: readString(payload.prompt) ?? readString(payload.motionPrompt) ?? "",
    size: soraSize(parameters),
    seconds: duration === undefined ? undefined : String(duration),
    input_reference: referenceImage ? { image_url: referenceImage } : undefined,
  });
}

function soraSize(parameters: Record<string, unknown>): string | undefined {
  const configuredSize = readString(parameters.size);
  if (configuredSize) return configuredSize;
  const ratio = readString(parameters.aspectRatio) ?? readString(parameters.ratio);
  if (ratio === "16:9") return "1280x720";
  if (ratio === "9:16") return "720x1280";
  return undefined;
}

function buildSeedanceRequest(input: ProviderSubmissionInput, model?: string) {
  const payload = input.redactedPayload;
  const parameters = readRecord(payload.parameters);
  const referenceImageUrls = collectImageUrls(payload);
  const referenceVideoUrl = readString(payload.referenceVideoUrl) ??
    readString(payload.sourceVideoUrl) ??
    readMediaUrls(payload.sourceVideo)[0] ??
    readMediaUrls(parameters.sourceVideo)[0];
  const referenceAudioUrl = readString(payload.referenceAudioUrl) ??
    readString(payload.audioUrl) ??
    readMediaUrls(payload.referenceAudio)[0] ??
    readMediaUrls(parameters.referenceAudio)[0];
  const hasReferenceMedia = referenceImageUrls.length > 0 || Boolean(referenceVideoUrl) || Boolean(referenceAudioUrl);
  const content: Array<Record<string, unknown>> = [{
    type: "text",
    text: readString(payload.prompt) ?? readString(payload.motionPrompt) ?? "",
  }];
  if (!hasReferenceMedia) {
    const firstFrameUrl = readString(payload.firstFrameUrl) ?? readString(payload.imageUrl);
    const lastFrameUrl = readString(payload.lastFrameUrl) ?? readMediaUrls(payload.lastFrame)[0];
    if (firstFrameUrl) {
      content.push({ type: "image_url", image_url: { url: firstFrameUrl }, role: "first_frame" });
    }
    if (lastFrameUrl) {
      content.push({ type: "image_url", image_url: { url: lastFrameUrl }, role: "last_frame" });
    }
  }
  for (const url of referenceImageUrls) {
    content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
  }
  if (referenceVideoUrl) {
    content.push({ type: "video_url", video_url: { url: referenceVideoUrl }, role: "reference_video" });
  }
  if (referenceAudioUrl) {
    content.push({ type: "audio_url", audio_url: { url: referenceAudioUrl }, role: "reference_audio" });
  }
  return removeUndefined({
    model: model ?? "doubao-seedance-2.0",
    content,
    ratio: readString(parameters.ratio) ?? readString(parameters.aspectRatio),
    resolution: readString(parameters.resolution),
    duration: readInteger(parameters.durationSec),
    seed: readInteger(parameters.seed),
    camera_fixed: readBoolean(parameters.cameraFixed),
    return_last_frame: readBoolean(parameters.returnLastFrame),
    generate_audio: readBoolean(parameters.generateAudio),
    watermark: readBoolean(parameters.watermark) ?? false,
  });
}

function collectImageUrls(payload: Record<string, unknown>): string[] {
  const parameters = readRecord(payload.parameters);
  return Array.from(new Set([
    ...readMediaUrls(payload.referenceImages),
    ...readMediaUrls(parameters.referenceImages),
    ...readMediaUrls(parameters.referenceUploads),
    ...readMediaUrls(parameters.quickReferences),
  ]));
}

function readMediaUrls(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(readMediaUrls);
  const direct = readString(value);
  if (direct) return [direct];
  const record = readRecord(value);
  return ["url", "imageUrl", "sourceUrl", "downloadUrl", "publicUrl", "src"]
    .map((key) => readString(record[key]))
    .filter((url): url is string => Boolean(url));
}

function imageArtifacts(payload: Record<string, unknown>): MediaGenerationArtifact[] {
  for (const value of [payload.resultImages, payload.data]) {
    if (!Array.isArray(value)) continue;
    const artifacts = value.flatMap((item) => {
      const record = readRecord(item);
      const b64Json = readString(record.b64_json);
      const rawUrl = readString(record.url);
      const url = rawUrl && isSafeProviderArtifactUrl(rawUrl) ? rawUrl : undefined;
      if (!b64Json && !url) return [];
      return [{
        mediaType: "image" as const,
        mimeType: "image/png",
        fileExtension: "png",
        ...(b64Json ? { b64Json } : {}),
        ...(url ? { url } : {}),
      }];
    });
    if (artifacts.length) return artifacts;
  }
  return [];
}

function readImageResultPayload(payload: Record<string, unknown>): Record<string, unknown> {
  if (imageArtifacts(payload).length > 0) return payload;
  for (const field of ["result", "response", "output", "data"]) {
    const candidate = payload[field];
    if (isRecord(candidate) && imageArtifacts(candidate).length > 0) {
      return candidate;
    }
  }
  return payload;
}

function isAsyncImageEndpoint(endpoint: string) {
  try {
    return ["/v1/images/generations/async", "/v1/images/edits/async"].includes(
      new URL(endpoint).pathname.replace(/\/+$/g, ""),
    );
  } catch {
    return false;
  }
}

function normalizeImageResultFormat(value: unknown) {
  const format = readString(value);
  return format === "url" || format === "b64_json" ? format : undefined;
}

function isSafeProviderArtifactUrl(value: string) {
  return isSafePublicHttpsUrlLiteral(value);
}

async function readJsonResponse(
  response: Response,
  prefix: string,
  redactedRequest?: Record<string, unknown>,
  maxBytes = BANANA_ROUTER_JSON_RESPONSE_MAX_BYTES,
) {
  const text = await readBananaRouterResponseText(
    response,
    maxBytes,
    `${prefix}_response_too_large`,
  );
  const diagnostics = providerResponseDiagnostics(response, text);
  const wrap = (error: Error) => redactedRequest
    ? attachProviderRedactedRequest(error, redactedRequest)
    : error;
  if (!response.ok) {
    throw wrap(bananaRouterResponseError(`${prefix}_${response.status}`, diagnostics));
  }
  if (!text.trim()) {
    throw wrap(bananaRouterResponseError(`${prefix}_empty_response`, diagnostics));
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw wrap(bananaRouterResponseError(`${prefix}_invalid_json`, diagnostics));
  }
  if (!isRecord(payload)) {
    throw wrap(bananaRouterResponseError(`${prefix}_invalid_response`, diagnostics));
  }
  return payload;
}

function bananaRouterResponseError(message: string, diagnostics: ProviderResponseDiagnostics) {
  return providerResponseError(message, { ...diagnostics });
}

async function readBananaRouterResponseText(response: Response, maxBytes: number, failureMessage: string) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw bananaRouterResponseError(failureMessage, {
      ...providerResponseDiagnostics(response, ""),
      responseBodyLength: declaredLength,
    });
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw bananaRouterResponseError(failureMessage, {
          ...providerResponseDiagnostics(response, ""),
          responseBodyLength: total,
        });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

async function executeBananaRouterRequest(
  fetchImpl: typeof fetch | undefined,
  endpoint: string,
  init: RequestInit,
) {
  try {
    return await (fetchImpl ?? fetch)(endpoint, init);
  } catch (error) {
    throw ModelError.fromUnknown(error, {
      failureCode: "model_provider_network_error",
    });
  }
}

function findFirstString(payload: Record<string, unknown>, paths: string[][]): string | undefined {
  for (const path of paths) {
    let current: unknown = payload;
    for (const segment of path) {
      if (!current || typeof current !== "object" || Array.isArray(current)) {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    const value = readString(current);
    if (value) return value;
  }
  return undefined;
}

function normalizeVideoStatus(status: string | undefined): ProviderPollResult["status"] {
  const normalized = status?.trim().toLowerCase();
  if (["succeeded", "success", "completed", "done"].includes(normalized ?? "")) return "succeeded";
  if (["failed", "error", "canceled", "cancelled"].includes(normalized ?? "")) return "failed";
  if (["running", "processing", "generating", "in_progress"].includes(normalized ?? "")) return "running";
  return "accepted";
}

function normalizeImageStatus(status: string | undefined): ProviderPollResult["status"] {
  if (status?.trim().toLowerCase() === "expired") return "failed";
  return normalizeVideoStatus(status);
}

function removeUndefined(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
