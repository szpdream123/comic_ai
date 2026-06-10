import type {
  ProviderAdapter,
  ProviderSubmissionInput,
  ProviderSubmissionResult,
} from "./provider-adapter.contract.ts";

const defaultModel = "happyhorse-1.0-r2v";

export class AliyunBailianVideoProviderAdapter implements ProviderAdapter {
  constructor(
    private readonly config: {
      apiKey: string;
      model?: string;
      createTaskEndpoint: string;
      queryTaskEndpoint?: string;
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
        "x-dashscope-async": "enable",
      },
      body: JSON.stringify(buildCreateTaskPayload(input, this.config.model)),
    });

    if (!response.ok) {
      const error = await readProviderError(response);
      throw new Error(
        [
          `aliyun_bailian_video_${response.status}`,
          error.providerErrorCode,
          error.providerMessage,
        ].filter(Boolean).join(":"),
      );
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const externalRequestId = findFirstString(payload, [
      ["output", "task_id"],
      ["output", "taskId"],
      ["task_id"],
      ["taskId"],
      ["data", "task_id"],
      ["data", "taskId"],
    ]);

    if (!externalRequestId) {
      throw new Error("aliyun_bailian_video_invalid_response");
    }

    return {
      externalRequestId,
      status: "accepted",
      redactedResponse: {
        model: this.config.model ?? defaultModel,
        providerStatus:
          findFirstString(payload, [
            ["output", "task_status"],
            ["output", "taskStatus"],
            ["task_status"],
            ["status"],
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
      throw new Error("aliyun_bailian_video_query_endpoint_required");
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
      throw new Error(
        [
          `aliyun_bailian_video_poll_${response.status}`,
          error.providerErrorCode,
          error.providerMessage,
        ].filter(Boolean).join(":"),
      );
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const providerStatus = findFirstString(payload, [
      ["output", "task_status"],
      ["output", "taskStatus"],
      ["task_status"],
      ["status"],
    ]);

    return {
      status: normalizeProviderStatus(providerStatus),
      videoUrl: findFirstString(payload, [
        ["output", "video_url"],
        ["output", "videoUrl"],
        ["output", "results", "video_url"],
        ["output", "results", "videoUrl"],
        ["data", "video_url"],
        ["data", "videoUrl"],
        ["video_url"],
        ["videoUrl"],
      ]),
      redactedResponse: {
        providerStatus: providerStatus ?? null,
        taskId: input.externalRequestId,
        providerErrorCode:
          findFirstString(payload, [
            ["code"],
            ["error", "code"],
            ["output", "code"],
            ["output", "error", "code"],
          ]) ?? null,
        providerMessage:
          findFirstString(payload, [
            ["message"],
            ["error", "message"],
            ["output", "message"],
            ["output", "error", "message"],
          ]) ?? null,
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
  const media = dedupeStrings([
    readString(payload.firstFrameUrl),
    readString(payload.imageUrl),
    readString(payload.referenceImageUrl),
    ...readMediaUrlArray(payload.referenceImages),
    ...readMediaUrlArray(parameters.referenceImages),
    ...readMediaUrlArray(parameters.referenceUploads),
  ].filter((item): item is string => Boolean(item)));

  return {
    model: model ?? defaultModel,
    input: {
      prompt: readString(payload.prompt) ?? readString(payload.motionPrompt) ?? "",
      media: media.map((url) => ({
        type: "reference_image",
        url,
      })),
    },
    parameters: {
      ...optionalPayloadField("ratio", readString(parameters.aspectRatio)),
      ...optionalPayloadField("duration", readInteger(parameters.durationSec)),
      ...optionalPayloadField("resolution", normalizeResolution(parameters.resolution)),
      ...optionalPayloadField("seed", readInteger(parameters.seed)),
      ...optionalPayloadField("watermark", readBoolean(parameters.watermark)),
    },
  };
}

function optionalPayloadField(key: string, value: unknown) {
  return value === undefined ? {} : { [key]: value };
}

function normalizeProviderStatus(
  status: string | undefined,
): "accepted" | "running" | "succeeded" | "failed" {
  const normalized = status?.trim().toLowerCase();
  if (normalized === "succeeded" || normalized === "success" || normalized === "completed") {
    return "succeeded";
  }
  if (normalized === "failed" || normalized === "error" || normalized === "canceled" || normalized === "cancelled") {
    return "failed";
  }
  if (normalized === "running" || normalized === "processing") {
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

function dedupeStrings(values: string[]) {
  return [...new Set(values)];
}

function normalizeResolution(value: unknown) {
  const resolution = readString(value);
  if (!resolution) {
    return undefined;
  }
  const normalized = resolution.toUpperCase();
  if (normalized === "720P" || normalized === "1080P") {
    return normalized;
  }
  return resolution;
}

async function readProviderError(response: Response) {
  try {
    const payload = (await response.json()) as Record<string, unknown>;
    return {
      providerErrorCode:
        findFirstString(payload, [
          ["code"],
          ["error", "code"],
          ["output", "code"],
          ["output", "error", "code"],
        ]) ?? null,
      providerMessage:
        findFirstString(payload, [
          ["message"],
          ["error", "message"],
          ["output", "message"],
          ["output", "error", "message"],
        ]) ?? null,
    };
  } catch {
    const body = await response.text().catch(() => "");
    return {
      providerErrorCode: null,
      providerMessage: body.trim().slice(0, 500) || null,
    };
  }
}
