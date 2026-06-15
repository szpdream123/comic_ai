import type {
  MediaGenerationArtifact,
  ProviderAdapter,
  ProviderSubmissionInput,
  ProviderSubmissionResult,
} from "./provider-adapter.contract.ts";
import {
  providerResponseError,
  readProviderResponseDiagnostics,
  type ProviderResponseDiagnostics,
} from "./provider-response-diagnostics.ts";

const defaultModel = "doubao-seedream-5-0-260128";
const defaultPollIntervalMs = 1500;
const defaultMaxPollAttempts = 80;

export class VolcengineArkImageProviderAdapter implements ProviderAdapter {
  constructor(
    private readonly config: {
      apiKey: string;
      model?: string;
      createTaskEndpoint: string;
      queryTaskEndpoint?: string;
      fetchImpl?: typeof fetch;
      outputFormat?: string;
      pollIntervalMs?: number;
      maxPollAttempts?: number;
    },
  ) {}

  async submit(
    input: ProviderSubmissionInput,
  ): Promise<ProviderSubmissionResult> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const createPayload = await this.postCreateTask(fetchImpl, input);
    const createArtifacts = collectImageArtifacts(createPayload);
    if (createArtifacts.length > 0) {
      return this.successResult(
        input,
        findFirstString(createPayload, [
          ["id"],
          ["request_id"],
          ["requestId"],
          ["data", "id"],
          ["data", "task_id"],
          ["data", "taskId"],
        ]) ?? input.providerRequestId,
        createPayload,
        createArtifacts,
      );
    }

    const externalRequestId = findFirstString(createPayload, [
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
      throw new Error("volcengine_ark_image_invalid_response");
    }

    if (!this.config.queryTaskEndpoint) {
      return {
        externalRequestId,
        status: "accepted",
        redactedResponse: this.redactedResponse(createPayload, externalRequestId),
      };
    }

    let latestPayload = createPayload;
    for (let attempt = 0; attempt < this.maxPollAttempts(); attempt += 1) {
      if (attempt > 0) {
        await sleep(this.pollIntervalMs());
      }
      latestPayload = await this.getTask(fetchImpl, externalRequestId);
      const providerStatus = normalizeProviderStatus(findProviderStatus(latestPayload));
      if (providerStatus === "failed") {
        throw new Error(`volcengine_ark_image_failed:${findProviderMessage(latestPayload) ?? "provider_failed"}`);
      }
      const artifacts = collectImageArtifacts(latestPayload);
      if (artifacts.length > 0 || providerStatus === "succeeded") {
        if (artifacts.length < 1) {
          throw new Error("volcengine_ark_image_artifact_missing");
        }
        return this.successResult(input, externalRequestId, latestPayload, artifacts);
      }
    }

    throw new Error("volcengine_ark_image_poll_timeout");
  }

  private async postCreateTask(fetchImpl: typeof fetch, input: ProviderSubmissionInput) {
    const payload = buildCreateTaskPayload(input, {
      model: this.config.model,
      outputFormat: this.config.outputFormat,
    });
    const response = await fetchImpl(this.config.createTaskEndpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok && hasPayloadField(payload, "output_format")) {
      const responseText = await response.text();
      if (isUnsupportedOutputFormatError(responseText)) {
        const retryPayload = { ...payload };
        delete retryPayload.output_format;
        const retryResponse = await fetchImpl(this.config.createTaskEndpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.config.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(retryPayload),
        });
        return readJsonResponse(retryResponse, "volcengine_ark_image");
      }
      return readJsonResponse(
        new Response(responseText, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        }),
        "volcengine_ark_image",
      );
    }
    return readJsonResponse(response, "volcengine_ark_image");
  }

  private async getTask(fetchImpl: typeof fetch, externalRequestId: string) {
    const queryTaskEndpoint = this.config.queryTaskEndpoint;
    if (!queryTaskEndpoint) {
      throw new Error("volcengine_ark_image_query_endpoint_required");
    }
    const response = await fetchImpl(
      queryTaskEndpoint.replace("{taskId}", encodeURIComponent(externalRequestId)),
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
        },
      },
    );
    return readJsonResponse(response, "volcengine_ark_image_poll");
  }

  private successResult(
    input: ProviderSubmissionInput,
    externalRequestId: string,
    payload: Record<string, unknown>,
    artifacts: MediaGenerationArtifact[],
  ): ProviderSubmissionResult {
    return {
      externalRequestId: externalRequestId || input.providerRequestId,
      status: "succeeded",
      redactedResponse: {
        ...this.redactedResponse(payload, externalRequestId),
        imageCount: artifacts.length,
      },
      artifacts,
    };
  }

  private redactedResponse(payload: Record<string, unknown>, externalRequestId: string) {
    return {
      model: this.config.model ?? defaultModel,
      taskId: externalRequestId,
      providerStatus: findProviderStatus(payload) ?? null,
      providerMessage: findProviderMessage(payload) ?? null,
    };
  }

  private pollIntervalMs() {
    return positiveInteger(this.config.pollIntervalMs) ?? defaultPollIntervalMs;
  }

  private maxPollAttempts() {
    return positiveInteger(this.config.maxPollAttempts) ?? defaultMaxPollAttempts;
  }
}

function buildCreateTaskPayload(
  input: ProviderSubmissionInput,
  config: { model?: string; outputFormat?: string } = {},
): Record<string, unknown> {
  const payload = input.redactedPayload;
  const parameters = readObject(payload.parameters);
  const prompt = readString(payload.prompt) ?? "";
  const references = collectReferenceImageUrls(payload);
  const model = config.model ?? defaultModel;
  const outputFormat = supportsOutputFormat(model)
    ? readString(parameters.outputFormat) ?? config.outputFormat
    : undefined;
  const imageGenerationPayload = {
    model,
    prompt,
    ...optionalPayloadField("size", readString(parameters.quality) ?? readString(parameters.resolution)),
    ...optionalPayloadField("response_format", readString(parameters.responseFormat)),
    ...optionalPayloadField("output_format", outputFormat),
    ...optionalPayloadField("seed", readInteger(parameters.seed)),
    watermark: readBoolean(parameters.watermark) ?? false,
  };

  if (references.length < 1) {
    return imageGenerationPayload;
  }

  return {
    ...imageGenerationPayload,
    content: [
      { type: "text", text: prompt },
      ...references.map((url) => ({
        type: "image_url",
        image_url: { url },
      })),
    ],
    ...optionalPayloadField("ratio", readString(parameters.aspectRatio)),
    ...optionalPayloadField("negative_prompt", readString(parameters.negativePrompt)),
  };
}

function supportsOutputFormat(model: string) {
  return /seedream-5/i.test(model);
}

function hasPayloadField(payload: Record<string, unknown>, field: string) {
  return Object.prototype.hasOwnProperty.call(payload, field);
}

function isUnsupportedOutputFormatError(responseText: string) {
  return /output_format/i.test(responseText) && /not supported|unsupported|invalid/i.test(responseText);
}

function collectReferenceImageUrls(payload: Record<string, unknown>) {
  const parameters = readObject(payload.parameters);
  const candidates = [
    ...readArray(payload.referenceImages),
    ...readArray(payload.references),
    ...readArray(parameters.referenceImages),
    ...readArray(parameters.references),
  ];
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const object = readObject(candidate);
    const url = readString(object.url) ?? readString(object.sourceUrl) ?? readString(object.previewUrl);
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

function collectImageArtifacts(payload: Record<string, unknown>): MediaGenerationArtifact[] {
  const artifacts: MediaGenerationArtifact[] = [];
  const seen = new Set<string>();
  for (const candidate of walkValues(payload)) {
    const object = readObject(candidate);
    const url =
      readString(object.image_url) ??
      readString(object.imageUrl) ??
      readString(object.url) ??
      readString(object.result_url) ??
      readString(object.resultUrl) ??
      readString(object.image);
    const b64Json = readString(object.b64_json) ?? readString(object.b64Json);
    const type = readString(object.type);
    if (type && !/image|output/i.test(type) && !url && !b64Json) {
      continue;
    }
    if (url && !seen.has(`url:${url}`)) {
      seen.add(`url:${url}`);
      artifacts.push({
        mediaType: "image",
        mimeType: readString(object.mimeType) ?? "image/png",
        fileExtension: "png",
        url,
      });
    }
    if (b64Json && !seen.has(`b64:${b64Json}`)) {
      seen.add(`b64:${b64Json}`);
      artifacts.push({
        mediaType: "image",
        mimeType: readString(object.mimeType) ?? "image/png",
        fileExtension: "png",
        b64Json,
      });
    }
  }
  return artifacts;
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
  return (await response.json()) as Record<string, unknown>;
}

function findProviderStatus(payload: Record<string, unknown>) {
  return findFirstString(payload, [
    ["status"],
    ["data", "status"],
    ["data", "task_status"],
    ["data", "taskStatus"],
    ["result", "status"],
    ["result", "task_status"],
    ["result", "taskStatus"],
  ]);
}

function findProviderMessage(payload: Record<string, unknown>) {
  return findFirstString(payload, [
    ["message"],
    ["error", "message"],
    ["data", "message"],
    ["data", "error", "message"],
    ["result", "message"],
    ["result", "error", "message"],
  ]);
}

function normalizeProviderStatus(status: string | undefined) {
  const normalized = status?.trim().toLowerCase();
  if (["succeeded", "success", "completed", "done"].includes(normalized ?? "")) {
    return "succeeded";
  }
  if (["failed", "error", "canceled", "cancelled"].includes(normalized ?? "")) {
    return "failed";
  }
  if (["running", "processing", "generating", "queued", "pending"].includes(normalized ?? "")) {
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

function optionalPayloadField(key: string, value: unknown) {
  return value === undefined ? {} : { [key]: value };
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

function positiveInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      providerMessage: findProviderMessage(payload) ?? null,
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
