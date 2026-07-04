import type {
  ProviderAdapter,
  ProviderSubmissionInput,
  ProviderSubmissionResult,
} from "./provider-adapter.contract.ts";
import {
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
    const response = await fetchImpl(this.config.createTaskEndpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(buildExtraTokenVideoPayload(input, this.config.model)),
    });
    const payload = await readJsonResponse(response, "extra_token_video");
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
      throw providerResponseError(
        "extra_token_video_invalid_response",
        providerDiagnosticsFromPayload(response, payload),
      );
    }

    return {
      externalRequestId,
      status: "accepted",
      redactedResponse: {
        model: this.config.model ?? defaultModel,
        providerStatus: findProviderStatus(payload) ?? null,
      },
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
    const payload = await readJsonResponse(response, "extra_token_video_poll");
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
  const referenceImageUrls = dedupeStrings([
    ...readMediaUrlArray(payload.referenceImages),
    ...readMediaUrlArray(parameters.referenceImages),
    ...readMediaUrlArray(parameters.referenceUploads),
    ...readMediaUrlArray(parameters.quickReferences),
  ].filter((url) => url !== firstFrameUrl && url !== lastFrameUrl));
  const referenceVideoUrls = dedupeStrings([
    readString(payload.referenceVideoUrl),
    readString(payload.sourceVideoUrl),
    readMediaUrl(payload.sourceVideo),
    ...readMediaUrlArray(payload.videos),
    ...readMediaUrlArray(parameters.videos),
    ...readMediaUrlArray(parameters.referenceVideos),
    ...readMediaUrlArray(parameters.editSourceVideo),
    ...readMediaUrlArray(parameters.sourceVideo),
  ]);
  const referenceAudioUrls = dedupeStrings([
    readString(payload.referenceAudioUrl),
    readString(payload.audioUrl),
    readMediaUrl(payload.referenceAudio),
    ...readMediaUrlArray(payload.audios),
    ...readMediaUrlArray(parameters.audios),
    ...readMediaUrlArray(parameters.referenceAudio),
  ]);

  return removeUndefinedValues({
    model: model ?? defaultModel,
    content: buildContent({
      prompt,
      firstFrameUrl,
      lastFrameUrl,
      referenceImageUrls,
      referenceVideoUrls,
      referenceAudioUrls,
    }),
    ratio: readString(parameters.ratio) ?? readString(parameters.aspectRatio),
    resolution: readString(parameters.resolution),
    duration: readInteger(parameters.durationSec) ?? readInteger(parameters.duration),
    seed: readInteger(parameters.seed),
    generate_audio: readBoolean(parameters.generateAudio),
    return_last_frame: readBoolean(parameters.returnLastFrame),
    watermark: readBoolean(parameters.watermark) ?? false,
  });
}

function buildContent(input: {
  prompt: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  referenceImageUrls: string[];
  referenceVideoUrls: string[];
  referenceAudioUrls: string[];
}) {
  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: input.prompt,
    },
  ];
  if (input.firstFrameUrl) {
    content.push({
      type: "image_url",
      image_url: {
        url: input.firstFrameUrl,
      },
      role: "first_frame",
    });
  }
  if (input.lastFrameUrl) {
    content.push({
      type: "image_url",
      image_url: {
        url: input.lastFrameUrl,
      },
      role: "last_frame",
    });
  }
  for (const referenceImageUrl of input.referenceImageUrls) {
    content.push({
      type: "image_url",
      image_url: {
        url: referenceImageUrl,
      },
      role: "reference_image",
    });
  }
  for (const referenceVideoUrl of input.referenceVideoUrls) {
    content.push({
      type: "video_url",
      video_url: {
        url: referenceVideoUrl,
      },
      role: "reference_video",
    });
  }
  for (const referenceAudioUrl of input.referenceAudioUrls) {
    content.push({
      type: "audio_url",
      audio_url: {
        url: referenceAudioUrl,
      },
      role: "reference_audio",
    });
  }
  return content;
}

async function readJsonResponse(response: Response, prefix: string) {
  if (!response.ok) {
    const error = await readProviderError(response);
    throw providerResponseError(
      [
        `${prefix}_${response.status}`,
        error.providerErrorCode,
        error.providerMessage,
      ].filter(Boolean).join(":"),
      error.diagnostics,
    );
  }
  const text = await response.text();
  if (!text.trim()) {
    throw providerResponseError(`${prefix}_empty_response`, providerResponseDiagnostics(response, text));
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw providerResponseError(`${prefix}_invalid_json`, providerResponseDiagnostics(response, text));
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
