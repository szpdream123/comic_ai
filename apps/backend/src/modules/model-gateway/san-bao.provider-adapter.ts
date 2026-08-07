import type {
  MediaGenerationArtifact,
  ProviderAdapter,
  ProviderPollResult,
  ProviderSubmissionInput,
  ProviderSubmissionResult,
} from "./provider-adapter.contract.ts";
import { recordProviderAdapterRequest } from "./provider-adapter.contract.ts";
import { ModelError } from "./model-error.ts";
import {
  attachProviderRawResponse,
  attachProviderRedactedRequest,
  providerResponseDiagnostics,
} from "./provider-response-diagnostics.ts";
import { isSafePublicHttpsUrlLiteral } from "./provider-artifact-url-safety.ts";

export class SanBaoProviderAdapter implements ProviderAdapter {
  constructor(
    private readonly config: {
      apiKey: string;
      model?: string;
      modelVariants?: Record<string, unknown>;
      mediaType: "image" | "video";
      createTaskEndpoint: string;
      queryTaskEndpoint: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async submit(input: ProviderSubmissionInput): Promise<ProviderSubmissionResult> {
    const request = await recordProviderAdapterRequest(
      input,
      this.config.mediaType === "image"
        ? buildSanBaoImagePayload(input, this.config.model, this.config.modelVariants)
        : buildSanBaoVideoPayload(input, this.config.model),
    );
    try {
      const payload = await this.request(this.config.createTaskEndpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": input.providerRequestId,
        },
        body: JSON.stringify(request),
      }, "submit");
      const task = responseData(payload);
      const externalRequestId = readString(task.id) ?? readString(task.task_id) ?? readString(task.taskId);
      if (!externalRequestId) {
        throw sanBaoError("san_bao_invalid_response", this.config.mediaType, "submit", payload);
      }
      const status = normalizeStatus(readString(task.status));
      if (!status) {
        throw sanBaoError("san_bao_invalid_response", this.config.mediaType, "submit", payload);
      }
      if (status === "failed") {
        throw sanBaoError(resolveSanBaoTaskFailureCode(task), this.config.mediaType, "submit", payload);
      }
      const artifacts = status === "succeeded" ? collectArtifacts(task, this.config.mediaType) : [];
      if (status === "succeeded" && artifacts.length === 0) {
        throw sanBaoError("san_bao_invalid_response", this.config.mediaType, "submit", payload);
      }
      return {
        externalRequestId,
        status,
        redactedRequest: request,
        redactedResponse: attachProviderRawResponse({
          model: this.config.model ?? null,
          providerStatus: readString(task.status) ?? null,
          providerMessage: readString(task.error) ?? null,
          artifactCount: artifacts.length,
        }, payload),
        ...(artifacts.length ? { artifacts } : {}),
      };
    } catch (error) {
      throw attachProviderRedactedRequest(asSanBaoError(error, this.config.mediaType, "submit"), request);
    }
  }

  async poll(input: { externalRequestId: string }): Promise<ProviderPollResult> {
    const endpoint = this.config.queryTaskEndpoint
      .replace("{taskId}", encodeURIComponent(input.externalRequestId))
      .replace("{id}", encodeURIComponent(input.externalRequestId));
    const payload = await this.request(endpoint, {
      method: "GET",
      headers: { authorization: `Bearer ${this.config.apiKey}` },
    }, "poll");
    const task = responseData(payload);
    const providerStatus = readString(task.status);
    if (!providerStatus) {
      throw sanBaoError("san_bao_invalid_response", this.config.mediaType, "poll", payload);
    }
    const status = normalizeStatus(providerStatus);
    if (!status) {
      throw sanBaoError("san_bao_invalid_response", this.config.mediaType, "poll", payload);
    }
    const artifacts = status === "succeeded" ? collectArtifacts(task, this.config.mediaType) : [];
    if (status === "succeeded" && artifacts.length === 0) {
      throw sanBaoError("san_bao_invalid_response", this.config.mediaType, "poll", payload);
    }
    const failureCode = status === "failed" ? resolveSanBaoTaskFailureCode(task) : null;
    return {
      status,
      redactedResponse: attachProviderRawResponse({
        model: this.config.model ?? null,
        providerStatus,
        providerMessage: readString(task.error) ?? null,
        failureCode,
        providerErrorCode: failureCode,
        progress: readNumber(task.progress),
        artifactCount: artifacts.length,
      }, payload),
      ...(artifacts.length ? { artifacts } : {}),
      ...(this.config.mediaType === "video" && artifacts[0]?.url ? { videoUrl: artifacts[0].url } : {}),
    };
  }

  private async request(url: string, init: RequestInit, phase: "submit" | "poll") {
    let response: Response;
    try {
      response = await (this.config.fetchImpl ?? fetch)(url, init);
    } catch (error) {
      throw ModelError.fromUnknown(error, {
        failureCode: "san_bao_network_error",
        mediaType: this.config.mediaType,
        phase,
      });
    }
    const text = await response.text().catch(() => "");
    const diagnostics = providerResponseDiagnostics(response, text);
    if (!response.ok) {
      throw ModelError.fromUnknown(text || `san_bao_http_${response.status}`, {
        failureCode: sanBaoHttpFailureCode(response.status),
        mediaType: this.config.mediaType,
        phase,
        providerDiagnostics: diagnostics,
      });
    }
    if (!text.trim()) {
      throw ModelError.fromUnknown("san_bao_empty_response", {
        failureCode: "san_bao_invalid_response",
        mediaType: this.config.mediaType,
        phase,
        providerDiagnostics: diagnostics,
      });
    }
    try {
      const payload = JSON.parse(text) as unknown;
      if (!isRecord(payload)) throw new Error("san_bao_invalid_response");
      return payload;
    } catch (error) {
      throw ModelError.fromUnknown(error, {
        failureCode: "san_bao_invalid_response",
        mediaType: this.config.mediaType,
        phase,
        providerDiagnostics: diagnostics,
      });
    }
  }
}

export function buildSanBaoImagePayload(
  input: ProviderSubmissionInput,
  model?: string,
  modelVariants: Record<string, unknown> = {},
) {
  const payload = input.redactedPayload;
  const parameters = readRecord(payload.parameters);
  const images = collectMediaInputs(payload, parameters, "image");
  const usesResolutionModelVariants = Object.values(modelVariants).some((value) => Boolean(readString(value)));
  return removeUndefined({
    model: resolveSanBaoImageProviderModel(model, modelVariants, parameters),
    prompt: readString(payload.prompt) ?? readString(parameters.prompt) ?? readString(payload.title) ?? "",
    aspect_ratio: readString(parameters.aspect_ratio) ?? readString(parameters.aspectRatio) ?? readString(parameters.imageAspectRatio) ?? readString(parameters.size),
    images: images.length ? images : undefined,
    quality: usesResolutionModelVariants ? "high" : (readString(parameters.quality) ?? "high"),
    concurrency: readInteger(parameters.concurrency) ?? readInteger(parameters.count),
  });
}

export function resolveSanBaoImageProviderModel(
  fallbackModel: string | undefined,
  modelVariants: Record<string, unknown>,
  parameters: Record<string, unknown>,
) {
  const variants = Object.entries(modelVariants)
    .map(([key, value]) => [key.trim(), readString(value)] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[0] && entry[1]));
  if (!variants.length) {
    return fallbackModel;
  }
  const requestedResolution = readString(parameters.resolution);
  const defaultResolution = variants.find(([, value]) => value === fallbackModel)?.[0] ?? variants[0]?.[0];
  const selectedResolution = requestedResolution || defaultResolution;
  const selected = variants.find(([key]) => key.toLowerCase() === selectedResolution?.toLowerCase());
  if (!selected) {
    throw ModelError.fromUnknown(new Error("san_bao_image_resolution_invalid"), {
      failureCode: "model_parameter_invalid",
      mediaType: "image",
      phase: "prepare",
    });
  }
  return selected[1];
}

export function buildSanBaoVideoPayload(input: ProviderSubmissionInput, model?: string) {
  const payload = input.redactedPayload;
  const parameters = readRecord(payload.parameters);
  const images = collectMediaInputs(payload, parameters, "image");
  const videos = collectMediaInputs(payload, parameters, "video");
  const audios = collectMediaInputs(payload, parameters, "audio");
  return removeUndefined({
    model,
    prompt: readString(payload.prompt) ?? readString(payload.motionPrompt) ?? readString(parameters.prompt) ?? "",
    ratio: readString(parameters.ratio) ?? readString(parameters.aspectRatio) ?? readString(parameters.aspect_ratio),
    resolution: readString(parameters.resolution) ?? readString(parameters.videoResolution),
    duration: readInteger(parameters.duration) ?? readInteger(parameters.durationSec) ?? readInteger(parameters.videoDurationSec),
    concurrency: readInteger(parameters.concurrency) ?? readInteger(parameters.count),
    reference: readString(parameters.reference),
    images: images.length ? images : undefined,
    videos: videos.length ? videos : undefined,
    audios: audios.length ? audios : undefined,
  });
}

function collectMediaInputs(payload: Record<string, unknown>, parameters: Record<string, unknown>, mediaType: "image" | "video" | "audio") {
  const candidates = mediaType === "image"
    ? [payload.images, payload.referenceImages, payload.filePaths, payload.firstFrameUrl, payload.imageUrl, parameters.images, parameters.referenceImages, parameters.filePaths, parameters.quickReferences, parameters.firstFrame, parameters.lastFrame, parameters.imageReference]
    : mediaType === "video"
      ? [payload.videos, payload.videoFilePaths, payload.referenceVideoUrl, payload.sourceVideoUrl, parameters.videos, parameters.referenceVideos, parameters.sourceVideo, parameters.editSourceVideo, parameters.videoFilePaths]
      : [payload.audios, payload.audioFilePaths, payload.referenceAudioUrl, parameters.audios, parameters.referenceAudio, parameters.audioFilePaths];
  const seen = new Set<string>();
  const inputs: unknown[] = [];
  for (const item of candidates.flatMap(readMediaInputs)) {
    const key = typeof item === "string" ? `string:${item}` : `object:${JSON.stringify(item)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    inputs.push(item);
  }
  return inputs;
}

function readMediaInputs(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(readMediaInputs);
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  const item = readRecord(value);
  const url = readString(item.url) ?? readString(item.sourceUrl) ?? readString(item.publicUrl) ?? readString(item.previewUrl) ?? readString(item.downloadUrl) ?? readString(item.src);
  const tag = readString(item.tag) ?? readString(item.name) ?? readString(item.label);
  if (url) {
    return tag ? [{ tag, url }] : [url];
  }
  const explicitBase64 = readString(item.base64);
  const explicitData = readString(item.data);
  const base64 = explicitBase64 ?? explicitData;
  if (!base64) return [];
  return [removeUndefined({
    ...(tag ? { tag } : {}),
    ...(explicitBase64 ? { base64 } : { data: base64 }),
    mimeType: readString(item.mimeType),
    contentType: readString(item.contentType),
    fileName: readString(item.fileName) ?? readString(item.filename),
  })];
}

function readMediaUrls(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(readMediaUrls);
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  const item = readRecord(value);
  const url = readString(item.url) ?? readString(item.sourceUrl) ?? readString(item.publicUrl) ?? readString(item.src);
  return url ? [url] : [];
}

function collectArtifacts(task: Record<string, unknown>, mediaType: "image" | "video"): MediaGenerationArtifact[] {
  const urls = mediaType === "image"
    ? [task.image_url, task.imageUrl, ...readArray(task.images)]
    : [task.video_url, task.videoUrl, task.download_url, task.downloadUrl];
  const seen = new Set<string>();
  const artifacts: MediaGenerationArtifact[] = [];
  for (const value of urls.flatMap(readMediaUrls)) {
    if (seen.has(value)) continue;
    if (!isSafePublicHttpsUrlLiteral(value)) {
      throw sanBaoError("san_bao_artifact_url_invalid", mediaType, "poll", task);
    }
    seen.add(value);
    artifacts.push({
      mediaType,
      mimeType: mediaType === "image" ? "image/png" : "video/mp4",
      fileExtension: mediaType === "image" ? "png" : "mp4",
      url: value,
    });
  }
  return artifacts;
}

function responseData(payload: Record<string, unknown>) {
  const data = readRecord(payload.data);
  return Object.keys(data).length ? data : payload;
}

function normalizeStatus(status: string | undefined): "accepted" | "running" | "succeeded" | "failed" | null {
  const normalized = status?.toLowerCase();
  if (!normalized) return null;
  if (normalized === "succeeded") return "succeeded";
  if (normalized === "failed") return "failed";
  if (normalized === "processing") return "running";
  if (normalized === "queued") return "accepted";
  return null;
}

function sanBaoHttpFailureCode(status: number) {
  if (status === 400) return "san_bao_bad_request";
  if (status === 401) return "san_bao_authentication_failed";
  if (status === 402) return "san_bao_insufficient_balance";
  if (status === 403) return "san_bao_account_restricted";
  if (status === 413) return "san_bao_payload_too_large";
  if (status === 429) return "san_bao_rate_limited";
  if (status === 502) return "san_bao_service_unavailable";
  return "san_bao_provider_failed";
}

function resolveSanBaoTaskFailureCode(task: Record<string, unknown>) {
  const message = [task.error, task.message, task.reason, task.error_code, task.errorCode]
    .map((value) => readString(value))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/余额|积分不足|insufficient|balance|credit/.test(message)) return "san_bao_insufficient_balance";
  if (/api[ _-]?key|unauthorized|authentication|鉴权|密钥/.test(message)) return "san_bao_authentication_failed";
  if (/账号.*(?:限制|封禁)|account.*(?:restricted|blocked|disabled)/.test(message)) return "san_bao_account_restricted";
  if (/文件.*(?:过大|超限)|payload too large|file too large/.test(message)) return "san_bao_payload_too_large";
  if (/rate.?limit|too many requests|请求.*频繁/.test(message)) return "san_bao_rate_limited";
  if (/service unavailable|bad gateway|模型服务.*(?:异常|不可用)/.test(message)) return "san_bao_service_unavailable";
  if (/参数|提示词|比例|素材数量|invalid|unsupported|not supported/.test(message)) return "san_bao_bad_request";
  return "san_bao_provider_failed";
}

function sanBaoError(code: string, mediaType: "image" | "video", phase: "submit" | "poll", value: unknown) {
  return ModelError.fromUnknown(value, { failureCode: code, mediaType, phase });
}

function asSanBaoError(error: unknown, mediaType: "image" | "video", phase: "submit" | "poll") {
  return error instanceof ModelError ? error : ModelError.fromUnknown(error, { mediaType, phase });
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function readNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function removeUndefined(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
