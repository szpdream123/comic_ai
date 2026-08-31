import type {
  ProviderAdapter,
  ProviderPollInput,
  ProviderPollResult,
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
} from "./provider-response-diagnostics.ts";
import { ModelError } from "./model-error.ts";

const defaultModel = "sd_2.0_special";
const transientAuthPollLimit = 3;

/** Adapter for 客易云 Model Center video models. */
export class GlobalAiOpcVideoProviderAdapter implements ProviderAdapter {
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
      buildGlobalAiOpcVideoPayload(input, this.config.model),
    );
    const response = await fetchImpl(this.config.createTaskEndpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(redactedRequest),
    });
    const payload = await readJsonResponse(response, "global_ai_opc_video", redactedRequest);
    const externalRequestId = findFirstString(payload, [
      ["id"], ["task_id"], ["taskId"], ["data", "id"], ["data", "task_id"],
      ["data", "taskId"], ["result", "id"], ["result", "task_id"], ["result", "taskId"],
    ]);
    if (!externalRequestId) {
      const providerErrorCode = findFirstScalarString(payload, [["code"], ["error", "code"], ["data", "code"]]);
      const providerMessage = findFirstString(payload, [["msg"], ["message"], ["error", "message"], ["data", "message"]]);
      throw attachProviderRedactedRequest(
        providerResponseError(
          ["global_ai_opc_video_submission_missing_task_id", providerErrorCode, providerMessage].filter(Boolean).join(":"),
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
        model: this.config.model ?? defaultModel,
        providerStatus: findProviderStatus(payload) ?? null,
      }, payload),
    };
  }

  async poll(input: ProviderPollInput): Promise<ProviderPollResult> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const response = await fetchImpl(
      this.config.queryTaskEndpoint.replace("{taskId}", encodeURIComponent(input.externalRequestId)),
      { method: "GET", headers: { authorization: `Bearer ${this.config.apiKey}` } },
    );
    if (response.status === 401) {
      const { text, diagnostics } = await readProviderResponseDiagnostics(response);
      let payload: Record<string, unknown> = {};
      try { payload = JSON.parse(text) as Record<string, unknown>; } catch { /* retain diagnostics preview */ }
      const redactedPayload = readObject(input.redactedPayload);
      const previousProviderResponse = readObject(redactedPayload.providerResponseRedacted);
      const transientAuthPollCount = Math.max(
        0,
        readInteger(previousProviderResponse.transientAuthPollCount) ?? 0,
      ) + 1;
      const retrying = transientAuthPollCount <= transientAuthPollLimit;
      return {
        status: retrying ? "accepted" : "failed",
        redactedResponse: attachProviderRawResponse({
          failureCode: retrying
            ? "global_ai_opc_video_poll_transient_auth"
            : "global_ai_opc_video_poll_authentication_failed",
          providerStatus: retrying ? "accepted" : "failed",
          taskId: input.externalRequestId,
          providerErrorCode: findFirstScalarString(payload, [["code"], ["error", "code"], ["data", "code"]]) ?? null,
          providerMessage: findFirstString(payload, [["msg"], ["message"], ["error", "message"], ["data", "message"]]) ?? null,
          transientAuthPollCount,
          diagnostics,
        }, payload),
      };
    }
    const payload = await readJsonResponse(response, "global_ai_opc_video_poll");
    const rawProviderStatus = findProviderStatus(payload);
    const providerStatus = normalizeProviderStatus(rawProviderStatus);
    if (!providerStatus) {
      const providerErrorCode = findFirstScalarString(payload, [["code"], ["error", "code"], ["data", "code"]]);
      const providerMessage = findFirstString(payload, [["msg"], ["message"], ["error", "message"], ["data", "message"]]);
      return {
        status: "failed",
        redactedResponse: attachProviderRawResponse({
          failureCode: providerErrorCode || providerMessage
            ? "global_ai_opc_video_poll_business_error"
            : "global_ai_opc_video_poll_invalid_response",
          providerStatus: rawProviderStatus ?? null,
          taskId: input.externalRequestId,
          providerErrorCode: providerErrorCode ?? null,
          providerMessage: providerMessage ?? "客易云查询响应缺少任务状态",
        }, payload),
      };
    }
    return {
      status: providerStatus,
      videoUrl: findFirstString(payload, [
        ["result_url"], ["video_url"], ["url"], ["data", "result_url"], ["data", "video_url"],
        ["data", "url"], ["result", "result_url"], ["result", "video_url"], ["result", "url"],
      ]),
      redactedResponse: attachProviderRawResponse({
        providerStatus,
        taskId: input.externalRequestId,
        transientAuthPollCount: 0,
        providerErrorCode: findFirstString(payload, [["error", "code"], ["data", "error", "code"], ["result", "error", "code"]]) ?? null,
        providerMessage: findFirstString(payload, [["error", "message"], ["msg"], ["message"], ["data", "message"], ["result", "message"]]) ?? null,
      }, payload),
    };
  }

  async cancel(input: { externalRequestId: string }) {
    return {
      status: "not_cancelable" as const,
      redactedResponse: { providerStatus: "not_cancelable", taskId: input.externalRequestId },
    };
  }
}

export function buildGlobalAiOpcVideoPayload(
  input: ProviderSubmissionInput,
  model?: string,
): Record<string, unknown> {
  const payload = input.redactedPayload;
  const parameters = readObject(payload.parameters);
  const prompt = readString(payload.prompt) ?? readString(payload.motionPrompt) ?? "";
  const firstImage = firstUrl([
    readString(payload.firstFrameUrl), readString(payload.imageUrl),
    readMediaUrl(payload.firstFrame), readMediaUrl(parameters.firstFrame),
  ]);
  const lastImage = firstUrl([
    readString(payload.lastFrameUrl), readMediaUrl(payload.lastFrame), readMediaUrl(parameters.lastFrame),
  ]);
  const orderedReferenceImages = readMediaUrlArray(parameters.filePaths);
  const orderedReferenceImageSet = new Set(orderedReferenceImages);
  const compatibilityReferenceImages = dedupeUrls([
    ...readMediaUrlArray(payload.referenceImages),
    ...readMediaUrlArray(parameters.referenceImages),
    ...readMediaUrlArray(parameters.referenceUploads),
  ]).filter((url) => !orderedReferenceImageSet.has(url));
  if ([firstImage, lastImage, ...orderedReferenceImages, ...compatibilityReferenceImages]
    .some((url) => /^blob:/i.test(url ?? ""))) {
    throw ModelError.fromUnknown(new Error("global_ai_opc_video_blob_image_url_invalid"), {
      failureCode: "model_parameter_invalid",
      mediaType: "video",
      phase: "prepare",
    });
  }
  const referenceImages = [...orderedReferenceImages, ...compatibilityReferenceImages];
  const referenceVideos = dedupeUrls([
    ...readMediaUrlArray(payload.referenceVideos),
    readString(payload.referenceVideoUrl), readString(payload.sourceVideoUrl),
    readMediaUrl(payload.sourceVideo), ...readMediaUrlArray(parameters.referenceVideos),
    ...readMediaUrlArray(parameters.videoFilePaths),
  ]);
  const referenceAudios = dedupeUrls([
    ...readMediaUrlArray(payload.referenceAudios),
    readString(payload.referenceAudioUrl), readString(payload.audioUrl),
    readMediaUrl(payload.referenceAudio), ...readMediaUrlArray(parameters.referenceAudios),
    ...readMediaUrlArray(parameters.referenceAudio), ...readMediaUrlArray(parameters.audioFilePaths),
  ]).filter((url) => !/^blob:/i.test(url));
  const requestedReferenceMode = readString(parameters.referenceMode)?.toLowerCase();
  const generationMode = readString(parameters.mode)?.toLowerCase();
  const hasReferenceMedia = referenceImages.some((url) => url !== firstImage && url !== lastImage)
    || referenceVideos.length > 0
    || referenceAudios.length > 0;
  const explicitFrameMode = requestedReferenceMode === "frame"
    || generationMode === "first-frame"
    || generationMode === "first-last-frame";
  const explicitReferenceMode = requestedReferenceMode === "image"
    || generationMode === "reference-video";
  const frameMode = firstImage !== undefined
    && (explicitFrameMode || (!explicitReferenceMode && !hasReferenceMedia));
  return removeUndefinedValues({
    model: model?.trim() || defaultModel,
    prompt,
    reference_images: !frameMode && referenceImages.length ? referenceImages : undefined,
    reference_videos: !frameMode && referenceVideos.length ? referenceVideos : undefined,
    reference_audios: !frameMode && referenceAudios.length ? referenceAudios : undefined,
    first_image: frameMode ? firstImage : undefined,
    last_image: frameMode ? lastImage : undefined,
    duration: readInteger(parameters.durationSec) ?? readInteger(parameters.duration),
    aspect_ratio: readString(parameters.aspectRatio) ?? readString(parameters.ratio),
    resolution: readString(parameters.resolution),
    seed: readInteger(parameters.seed),
    generate_audio: readBoolean(parameters.generateAudio) ?? readBoolean(parameters.generate_audio),
    tools: Array.isArray(parameters.tools) ? parameters.tools : undefined,
    watermark: readBoolean(parameters.watermark) ?? false,
  });
}

async function readJsonResponse(response: Response, prefix: string, request?: Record<string, unknown>) {
  if (!response.ok) {
    const { text, diagnostics } = await readProviderResponseDiagnostics(response);
    let code: string | null = null;
    let message: string | null = diagnostics.responseBodyPreview || null;
    try {
      const payload = JSON.parse(text) as Record<string, unknown>;
      code = findFirstString(payload, [["code"], ["error", "code"], ["data", "code"]]) ?? null;
      message = findFirstString(payload, [["message"], ["error", "message"], ["data", "message"]]) ?? message;
    } catch { /* retain diagnostics preview */ }
    const error = providerResponseError([`${prefix}_${response.status}`, code, message].filter(Boolean).join(":"), diagnostics);
    throw request ? attachProviderRedactedRequest(error, request) : error;
  }
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const error = providerResponseError(`${prefix}_invalid_json`, providerResponseDiagnostics(response, text));
    throw request ? attachProviderRedactedRequest(error, request) : error;
  }
}

function findProviderStatus(payload: Record<string, unknown>) {
  return findFirstString(payload, [["status"], ["task_status"], ["taskStatus"], ["data", "status"], ["data", "task_status"], ["result", "status"]]);
}

function normalizeProviderStatus(status: string | undefined): ProviderPollResult["status"] | undefined {
  const value = status?.toLowerCase();
  if (["completed", "succeeded", "success", "done", "finished"].includes(value ?? "")) return "succeeded";
  if (["failed", "error", "canceled", "cancelled"].includes(value ?? "")) return "failed";
  if (["processing", "running", "generating"].includes(value ?? "")) return "running";
  if (["queued", "pending", "submitted", "accepted"].includes(value ?? "")) return "accepted";
  return undefined;
}

function findFirstString(payload: Record<string, unknown>, paths: string[][]) {
  for (const path of paths) {
    let value: unknown = payload;
    for (const segment of path) {
      if (!value || typeof value !== "object") { value = undefined; break; }
      value = (value as Record<string, unknown>)[segment];
    }
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}
function findFirstScalarString(payload: Record<string, unknown>, paths: string[][]) {
  for (const path of paths) {
    let value: unknown = payload;
    for (const segment of path) {
      if (!value || typeof value !== "object") { value = undefined; break; }
      value = (value as Record<string, unknown>)[segment];
    }
    if ((typeof value === "string" || typeof value === "number") && String(value).trim()) return String(value).trim();
  }
  return undefined;
}
function readObject(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function readString(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function readInteger(value: unknown) { const parsed = typeof value === "number" ? value : Number(value); return Number.isInteger(parsed) ? parsed : undefined; }
function readBoolean(value: unknown) { return typeof value === "boolean" ? value : undefined; }
function readMediaUrl(value: unknown): string | undefined {
  if (typeof value === "string") return readString(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return ["url", "sourceUrl", "downloadUrl", "previewUrl", "publicUrl", "src"].map((key) => readString(record[key])).find(Boolean);
}
function readMediaUrlArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => readMediaUrlArray(item));
  const url = readMediaUrl(value); return url ? [url] : [];
}
function firstUrl(values: Array<string | undefined>) { return values.find((value) => Boolean(value)); }
function dedupeUrls(values: Array<string | undefined>) { return [...new Set(values.filter((value): value is string => Boolean(value)))]; }
function removeUndefinedValues(value: Record<string, unknown>) { return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)); }
