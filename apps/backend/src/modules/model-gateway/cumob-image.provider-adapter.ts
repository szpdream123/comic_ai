import type {
  MediaGenerationArtifact,
  ProviderAdapter,
  ProviderSubmissionInput,
  ProviderSubmissionResult,
} from "./provider-adapter.contract.ts";
import { recordProviderAdapterRequest } from "./provider-adapter.contract.ts";
import { generationProviderHttpTimeoutMsFor } from "./generation-timeout.policy.ts";
import {
  attachProviderRawResponse,
  providerResponseDiagnostics,
  providerResponseError,
  type ProviderResponseDiagnostics,
} from "./provider-response-diagnostics.ts";

const defaultModel = "gpt-image-2";
const defaultEndpoint = "https://api.cumob.com/v1/images/generations";
const defaultQueryTaskEndpoint = "https://api.cumob.com/v1/status/{taskId}";
const defaultRequestTimeoutMs = generationProviderHttpTimeoutMsFor("image");

export class CumobImageProviderAdapter implements ProviderAdapter {
  constructor(
    private readonly config: {
      apiKey: string;
      model?: string;
      endpoint?: string;
      queryTaskEndpoint?: string;
      fetchImpl?: typeof fetch;
      requestTimeoutMs?: number;
      defaultRequestParams?: Record<string, unknown>;
    },
  ) {}

  async submit(input: ProviderSubmissionInput): Promise<ProviderSubmissionResult> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const requestBody = await recordProviderAdapterRequest(
      input,
      buildCumobImagePayload(input, {
        model: this.config.model,
        defaultRequestParams: this.config.defaultRequestParams,
      }),
    );
    const { response, text } = await fetchTextWithTimeout(
      fetchImpl,
      this.config.endpoint ?? defaultEndpoint,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    );

    if (!response.ok) {
      const error = withFailureCode(
        providerResponseError(`cumob_image_${response.status}`, providerResponseDiagnostics(response, text)),
        `cumob_image_${response.status}`,
      );
      if (response.status === 429) {
        throw Object.assign(error, {
          retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
        });
      }
      throw error;
    }

    const diagnostics = providerResponseDiagnostics(response, text);
    const payload = parseCumobResponse(text, diagnostics);
    const artifacts = collectImageArtifacts(payload);
    const externalRequestId = findFirstString(payload, [
      ["id"],
      ["task_id"],
      ["taskId"],
      ["data", "id"],
      ["data", "task_id"],
      ["data", "taskId"],
    ]);
    if (!externalRequestId) {
      throw withFailureCode(
        providerResponseError("cumob_image_invalid_response", diagnostics),
        "cumob_image_invalid_response",
      );
    }
    const providerFailure = findProviderFailureMessage(payload);
    const status = providerFailure
      ? "failed"
      : normalizeProviderStatus(findProviderStatus(payload));

    if (status === "failed") {
      throw withFailureCode(
        providerResponseError(
          `cumob_image_failed:${providerFailure ?? findProviderMessage(payload) ?? "provider_failed"}`,
          diagnostics,
        ),
        "cumob_image_failed",
      );
    }
    return {
      externalRequestId,
      status: artifacts.length > 0 ? "succeeded" : status,
      redactedResponse: attachProviderRawResponse({
        model: this.config.model ?? defaultModel,
        providerStatus: findProviderStatus(payload) ?? null,
        progress: readNumber(payload.progress),
        imageCount: artifacts.length,
        revisedPrompt: findFirstString(payload, [
          ["data", "0", "revised_prompt"],
          ["data", "0", "revisedPrompt"],
        ]) ?? null,
      }, payload),
      artifacts: artifacts.length > 0 ? artifacts : undefined,
    };
  }

  async poll(input: { externalRequestId: string }) {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const endpoint = (this.config.queryTaskEndpoint ?? defaultQueryTaskEndpoint)
      .replace("{taskId}", encodeURIComponent(input.externalRequestId))
      .replace("{id}", encodeURIComponent(input.externalRequestId));
    const { response, text } = await fetchTextWithTimeout(
      fetchImpl,
      endpoint,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
        },
      },
    );
    if (!response.ok) {
      throw withFailureCode(
        providerResponseError(`cumob_image_poll_${response.status}`, providerResponseDiagnostics(response, text)),
        `cumob_image_poll_${response.status}`,
      );
    }

    const diagnostics = providerResponseDiagnostics(response, text);
    const payload = parseCumobResponse(text, diagnostics);
    const providerStatus = findProviderStatus(payload);
    const providerFailure = findProviderFailureMessage(payload);
    const status = providerFailure ? "failed" : normalizeProviderStatus(providerStatus);
    const artifacts = collectImageArtifacts(payload);
    return {
      status,
      redactedResponse: attachProviderRawResponse({
        model: this.config.model ?? defaultModel,
        taskId: input.externalRequestId,
        providerStatus: providerStatus ?? null,
        progress: readNumber(payload.progress),
        imageCount: artifacts.length,
        providerMessage: providerFailure ?? findProviderMessage(payload) ?? null,
      }, payload),
      artifacts: artifacts.length > 0 ? artifacts : undefined,
    };
  }
}

export function buildCumobImagePayload(
  input: ProviderSubmissionInput,
  config: {
    model?: string;
    defaultRequestParams?: Record<string, unknown>;
  } = {},
): Record<string, unknown> {
  const payload = input.redactedPayload;
  const parameters = readObject(payload.parameters);
  const defaults = config.defaultRequestParams ?? {};
  const prompt =
    readString(payload.prompt) ??
    readString(parameters.prompt) ??
    readString(payload.title) ??
    "";
  const images = collectImageUrls(payload);
  const requestedQuality = readString(parameters.quality);
  const size = normalizeCumobSize(
    readString(parameters.size) ??
    readString(parameters.imageSize) ??
    readString(parameters.imageResolution),
  ) ??
    normalizeCumobSize(requestedQuality) ??
    normalizeCumobSize(readString(defaults.size));
  const quality =
    normalizeCumobQuality(requestedQuality) ??
    normalizeCumobQuality(readString(defaults.quality));

  return stripUndefined({
    model: config.model ?? defaultModel,
    prompt,
    size,
    aspect_ratio:
      readString(parameters.aspect_ratio) ??
      readString(parameters.aspectRatio) ??
      readString(parameters.imageAspectRatio) ??
      readString(defaults.aspect_ratio),
    images: images.length > 0 ? images : undefined,
    quality,
    stream: false,
    async: true,
    metadata: readObjectOrUndefined(parameters.metadata),
  });
}

function collectImageUrls(payload: Record<string, unknown>) {
  const parameters = readObject(payload.parameters);
  return dedupeStrings([
    ...readMediaUrlArray(payload.images),
    ...readMediaUrlArray(payload.referenceImages),
    ...readMediaUrlArray(payload.references),
    readMediaUrl(payload.imageUrl),
    readMediaUrl(payload.image_url),
    ...readMediaUrlArray(parameters.images),
    ...readMediaUrlArray(parameters.referenceImages),
    ...readMediaUrlArray(parameters.quickReferences),
    ...readMediaUrlArray(parameters.references),
    readMediaUrl(parameters.imageReference),
    readMediaUrl(parameters.imageUrl),
    readMediaUrl(parameters.image_url),
  ]);
}

function collectImageArtifacts(payload: Record<string, unknown>): MediaGenerationArtifact[] {
  const artifacts: MediaGenerationArtifact[] = [];
  const seen = new Set<string>();
  const candidates = [
    ...(Array.isArray(payload.data) ? payload.data : []),
    ...(Array.isArray(payload.results) ? payload.results : []),
  ];
  for (const candidate of candidates) {
    const object = readObject(candidate);
    const url = readString(object.url);
    if (url && !seen.has(`url:${url}`)) {
      seen.add(`url:${url}`);
      artifacts.push({
        mediaType: "image",
        mimeType: "image/png",
        fileExtension: "png",
        url,
      });
    }
    const b64Json = readString(object.b64_json);
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

async function fetchTextWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
) {
  const timeout = defaultRequestTimeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error("cumob_image_timeout"));
  }, timeout);
  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
    const text = await response.text();
    return { response, text };
  } catch (error) {
    if (controller.signal.aborted) {
      throw Object.assign(new Error("cumob_image_timeout"), {
        failureCode: "cumob_image_timeout",
        providerDiagnostics: buildFetchFailureDiagnostics(url, error),
      });
    }
    throw Object.assign(new Error(readErrorMessage(error) || "cumob_image_network_error"), {
      failureCode: "cumob_image_network_error",
      providerDiagnostics: buildFetchFailureDiagnostics(url, error),
    });
  } finally {
    clearTimeout(timer);
  }
}

function parseCumobResponse(text: string, diagnostics: ProviderResponseDiagnostics) {
  if (!text.trim()) {
    throw withFailureCode(providerResponseError("cumob_image_empty_response", diagnostics), "cumob_image_empty_response");
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw withFailureCode(providerResponseError("cumob_image_invalid_json", diagnostics), "cumob_image_invalid_json");
  }
}

function withFailureCode<T extends Error>(error: T, failureCode: string): T {
  return Object.assign(error, { failureCode });
}

function parseRetryAfterMs(value: string | null): number | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  const seconds = Number(normalized);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1000);
  }
  const retryAt = Date.parse(normalized);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - Date.now()) : undefined;
}

function buildFetchFailureDiagnostics(endpoint: string, error: unknown) {
  const cause = readErrorCause(error);
  return stripUndefined({
    endpoint,
    errorName: readErrorName(error),
    errorMessage: readErrorMessage(error),
    causeName: readErrorName(cause),
    causeMessage: readErrorMessage(cause),
    causeCode: readErrorCode(cause) ?? readErrorCode(error),
  });
}

function readErrorCause(error: unknown) {
  return error && typeof error === "object" ? (error as { cause?: unknown }).cause : undefined;
}

function readErrorName(error: unknown) {
  return error && typeof error === "object" && typeof (error as { name?: unknown }).name === "string"
    ? String((error as { name: string }).name)
    : undefined;
}

function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : typeof error === "string" ? error : undefined;
}

function readErrorCode(error: unknown) {
  return error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
    ? String((error as { code: string }).code)
    : undefined;
}

function findProviderStatus(payload: Record<string, unknown>) {
  return findFirstString(payload, [
    ["status"],
    ["task_status"],
    ["taskStatus"],
    ["data", "status"],
    ["data", "task_status"],
    ["data", "taskStatus"],
  ]);
}

function findProviderMessage(payload: Record<string, unknown>) {
  return findFirstString(payload, [
    ["failure_reason"],
    ["message"],
    ["error"],
    ["error", "message"],
    ["data", "message"],
    ["data", "error"],
    ["data", "error", "message"],
  ]);
}

function findProviderFailureMessage(payload: Record<string, unknown>) {
  return findFirstString(payload, [
    ["failure_reason"],
    ["error"],
    ["error", "message"],
    ["data", "failure_reason"],
    ["data", "error"],
    ["data", "error", "message"],
  ]);
}

function normalizeProviderStatus(status: string | undefined): "accepted" | "running" | "succeeded" | "failed" {
  const normalized = status?.trim().toLowerCase();
  if (["succeeded", "success", "completed", "done", "finished"].includes(normalized ?? "")) {
    return "succeeded";
  }
  if (["running", "processing", "generating"].includes(normalized ?? "")) {
    return "running";
  }
  if (["failed", "error", "canceled", "cancelled", "violation", "timeout"].includes(normalized ?? "")) {
    return "failed";
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
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      current = current[Number(segment)];
      continue;
    }
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function normalizeCumobQuality(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized && ["auto", "low", "medium", "high"].includes(normalized)
    ? normalized
    : undefined;
}

function normalizeCumobSize(value: string | undefined) {
  const normalized = value?.trim().toUpperCase();
  return normalized && ["1K", "2K", "4K"].includes(normalized) ? normalized : undefined;
}

function stripUndefined(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readObjectOrUndefined(value: unknown): Record<string, unknown> | undefined {
  const object = readObject(value);
  return Object.keys(object).length > 0 ? object : undefined;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readMediaUrl(value: unknown): string | undefined {
  if (typeof value === "string") {
    return readString(value);
  }
  const object = readObject(value);
  return readString(object.url) ??
    readString(object.sourceUrl) ??
    readString(object.downloadUrl) ??
    readString(object.previewUrl) ??
    readString(object.publicUrl) ??
    readString(object.src);
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
