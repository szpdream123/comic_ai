import type {
  ProviderAdapter,
  ProviderSubmissionInput,
  ProviderSubmissionResult,
} from "./provider-adapter.contract.ts";
import {
  providerResponseError,
  readProviderResponseDiagnostics,
  type ProviderResponseDiagnostics,
} from "./provider-response-diagnostics.ts";

const defaultModel = "doubao-seedance-2-0-260128";

export class SeedanceVideoProviderAdapter implements ProviderAdapter {
  constructor(
    private readonly config: {
      apiKey: string;
      model?: string;
      createTaskEndpoint: string;
      queryTaskEndpoint?: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async submit(
    input: ProviderSubmissionInput,
  ): Promise<ProviderSubmissionResult> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const response = await fetchImpl(this.config.createTaskEndpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(buildCreateTaskPayload(input, this.config.model)),
    });

    if (!response.ok) {
      const error = await readProviderError(response);
      throw providerResponseError(
        [
          `seedance_video_${response.status}`,
          error.providerErrorCode,
          error.providerMessage,
        ].filter(Boolean).join(":"),
        error.diagnostics,
      );
    }

    const payload = (await response.json()) as Record<string, unknown>;
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
      throw new Error("seedance_video_invalid_response");
    }

    return {
      externalRequestId,
      status: "accepted",
      redactedResponse: {
        model: this.config.model ?? defaultModel,
        providerStatus:
          findFirstString(payload, [
            ["status"],
            ["data", "status"],
            ["result", "status"],
          ]) ?? null,
      },
    };
  }

  async poll(input: { externalRequestId: string }): Promise<{
    status: "accepted" | "running" | "succeeded" | "failed";
    videoUrl?: string;
    redactedResponse: Record<string, unknown>;
  }> {
    if (!this.config.queryTaskEndpoint) {
      throw new Error("seedance_video_query_endpoint_required");
    }

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

    if (!response.ok) {
      const error = await readProviderError(response);
      throw providerResponseError(
        [
          `seedance_video_poll_${response.status}`,
          error.providerErrorCode,
          error.providerMessage,
        ].filter(Boolean).join(":"),
        error.diagnostics,
      );
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const providerStatus = normalizeProviderStatus(
      findFirstString(payload, [
        ["status"],
        ["data", "status"],
        ["result", "status"],
      ]),
    );

    return {
      status: providerStatus,
      videoUrl: findFirstString(payload, [
        ["video_url"],
        ["videoUrl"],
        ["content", "video_url"],
        ["content", "videoUrl"],
        ["data", "video_url"],
        ["data", "videoUrl"],
        ["data", "content", "video_url"],
        ["data", "content", "videoUrl"],
        ["data", "result", "video_url"],
        ["data", "result", "videoUrl"],
        ["result", "video_url"],
        ["result", "videoUrl"],
        ["result", "content", "video_url"],
        ["result", "content", "videoUrl"],
      ]),
      redactedResponse: {
        providerStatus,
        taskId: input.externalRequestId,
        providerErrorCode:
          findFirstString(payload, [
            ["error", "code"],
            ["data", "error", "code"],
            ["result", "error", "code"],
          ]) ?? null,
        providerMessage:
          findFirstString(payload, [
            ["message"],
            ["error", "message"],
            ["data", "message"],
            ["data", "error", "message"],
            ["result", "message"],
            ["result", "error", "message"],
          ]) ?? null,
      },
    };
  }

  async cancel(input: { externalRequestId: string }): Promise<{
    status: "canceled" | "not_cancelable" | "failed";
    redactedResponse: Record<string, unknown>;
  }> {
    if (!this.config.queryTaskEndpoint) {
      throw new Error("seedance_video_query_endpoint_required");
    }

    const fetchImpl = this.config.fetchImpl ?? fetch;
    const response = await fetchImpl(
      this.config.queryTaskEndpoint.replace(
        "{taskId}",
        encodeURIComponent(input.externalRequestId),
      ),
      {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
        },
      },
    );
    if (response.ok) {
      return {
        status: "canceled",
        redactedResponse: {
          providerStatus: "canceled",
          taskId: input.externalRequestId,
        },
      };
    }

    const error = await readProviderError(response);
    const status = response.status === 404 || response.status === 409 ? "not_cancelable" : "failed";
    return {
      status,
      redactedResponse: {
        providerStatus: status,
        taskId: input.externalRequestId,
        providerHttpStatus: response.status,
        providerErrorCode: error.providerErrorCode,
        providerMessage: error.providerMessage,
      },
    };
  }
}

function buildCreateTaskPayload(
  input: ProviderSubmissionInput,
  model?: string,
): Record<string, unknown> {
  const payload = input.redactedPayload;
  const parameters =
    payload.parameters && typeof payload.parameters === "object"
      ? (payload.parameters as Record<string, unknown>)
      : {};
  const prompt = readString(payload.prompt) ?? readString(payload.motionPrompt) ?? "";
  const firstFrameUrl =
    readString(payload.firstFrameUrl) ??
    readString(payload.imageUrl) ??
    readString(payload.referenceImageUrl);
  const lastFrameUrl =
    readString(payload.lastFrameUrl) ??
    readMediaUrl(payload.lastFrame) ??
    readMediaUrl(parameters.lastFrame);
  const referenceImageUrls = [
    ...readMediaUrlArray(payload.referenceImages),
    ...readMediaUrlArray(parameters.referenceImages),
    ...readMediaUrlArray(parameters.referenceUploads),
  ];
  const referenceVideoUrl =
    readString(payload.referenceVideoUrl) ??
    readString(payload.sourceVideoUrl) ??
    readMediaUrl(payload.sourceVideo) ??
    readMediaUrl(parameters.sourceVideo) ??
    readMediaUrl(parameters.editSourceVideo);
  const referenceAudioUrl =
    readString(payload.referenceAudioUrl) ??
    readString(payload.audioUrl) ??
    readMediaUrl(payload.referenceAudio) ??
    readMediaUrl(parameters.referenceAudio);

  return {
    model: model ?? defaultModel,
    content: buildContent({
      prompt,
      firstFrameUrl,
      lastFrameUrl,
      referenceImageUrls,
      referenceVideoUrl,
      referenceAudioUrl,
    }),
    ...optionalPayloadField("ratio", readString(parameters.aspectRatio)),
    ...optionalPayloadField("resolution", readString(parameters.resolution)),
    ...optionalPayloadField("duration", readInteger(parameters.durationSec)),
    ...optionalPayloadField("seed", readInteger(parameters.seed)),
    ...optionalPayloadField("camera_fixed", readBoolean(parameters.cameraFixed)),
    ...optionalPayloadField("return_last_frame", readBoolean(parameters.returnLastFrame)),
    ...optionalPayloadField("generate_audio", readBoolean(parameters.generateAudio)),
    watermark: readBoolean(parameters.watermark) ?? false,
  };
}

function buildContent(input: {
  prompt: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  referenceImageUrls: string[];
  referenceVideoUrl?: string;
  referenceAudioUrl?: string;
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
  if (input.referenceVideoUrl) {
    content.push({
      type: "video_url",
      video_url: {
        url: input.referenceVideoUrl,
      },
      role: "reference_video",
    });
  }
  if (input.referenceAudioUrl) {
    content.push({
      type: "audio_url",
      audio_url: {
        url: input.referenceAudioUrl,
      },
      role: "reference_audio",
    });
  }
  return content;
}

function optionalPayloadField(key: string, value: unknown) {
  return value === undefined ? {} : { [key]: value };
}

function normalizeProviderStatus(
  status: string | undefined,
): "accepted" | "running" | "succeeded" | "failed" {
  const normalized = status?.trim().toLowerCase();
  if (
    normalized === "succeeded" ||
    normalized === "success" ||
    normalized === "completed" ||
    normalized === "done"
  ) {
    return "succeeded";
  }
  if (
    normalized === "failed" ||
    normalized === "error" ||
    normalized === "canceled" ||
    normalized === "cancelled"
  ) {
    return "failed";
  }
  if (
    normalized === "running" ||
    normalized === "processing" ||
    normalized === "generating"
  ) {
    return "running";
  }
  return "accepted";
}

function findFirstString(
  payload: Record<string, unknown>,
  paths: string[][],
): string | undefined {
  for (const path of paths) {
    const value = readPath(payload, path);
    if (typeof value === "string" && value.trim().length > 0) {
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

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
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

function readInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
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
      providerErrorCode:
        findFirstString(payload, [
          ["code"],
          ["error", "code"],
          ["data", "code"],
          ["data", "error", "code"],
          ["result", "error", "code"],
        ]) ?? null,
      providerMessage:
        findFirstString(payload, [
          ["message"],
          ["error", "message"],
          ["data", "message"],
          ["data", "error", "message"],
          ["result", "message"],
          ["result", "error", "message"],
        ]) ?? null,
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
