import type {
  MediaGenerationArtifact,
  ProviderAdapter,
  ProviderSubmissionInput,
  ProviderSubmissionResult,
} from "./provider-adapter.contract.ts";
import { recordProviderAdapterRequest } from "./provider-adapter.contract.ts";
import {
  providerResponseDiagnostics,
  providerResponseError,
  type ProviderResponseDiagnostics,
} from "./provider-response-diagnostics.ts";

const defaultModel = "gpt-image-2";
const defaultEndpoint = "https://api.cumob.com/v1/images/generations";
const defaultRequestTimeoutMs = 60 * 60 * 1000;

export class CumobImageProviderAdapter implements ProviderAdapter {
  constructor(
    private readonly config: {
      apiKey: string;
      model?: string;
      endpoint?: string;
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
    const response = await fetchWithTimeout(
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
      this.config.requestTimeoutMs,
    );
    const text = await response.text();

    if (!response.ok) {
      throw withFailureCode(
        providerResponseError(`cumob_image_${response.status}`, providerResponseDiagnostics(response, text)),
        `cumob_image_${response.status}`,
      );
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
    ]) ?? response.headers.get("x-request-id") ?? input.providerRequestId;
    const status = normalizeProviderStatus(findProviderStatus(payload));

    if (status === "failed") {
      throw withFailureCode(
        providerResponseError(
          `cumob_image_failed:${findProviderMessage(payload) ?? "provider_failed"}`,
          diagnostics,
        ),
        "cumob_image_failed",
      );
    }
    if (status === "succeeded" && artifacts.length < 1) {
      throw withFailureCode(
        providerResponseError("cumob_image_invalid_response", diagnostics),
        "cumob_image_invalid_response",
      );
    }

    return {
      externalRequestId,
      status: artifacts.length > 0 ? "succeeded" : status,
      redactedResponse: {
        model: this.config.model ?? defaultModel,
        providerStatus: findProviderStatus(payload) ?? null,
        progress: readNumber(payload.progress),
        imageCount: artifacts.length,
        revisedPrompt: findFirstString(payload, [
          ["data", "0", "revised_prompt"],
          ["data", "0", "revisedPrompt"],
        ]) ?? null,
      },
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
    ...defaults,
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
    negative_prompts: readString(parameters.negative_prompts) ?? readString(parameters.negativePrompts),
    style: readString(parameters.style),
    seed: readString(parameters.seed),
    n: readPositiveInteger(parameters.n) ?? readPositiveInteger(parameters.count),
    stream: readBoolean(parameters.stream) ?? readBoolean(defaults.stream) ?? false,
    async: readBoolean(parameters.async) ?? readBoolean(defaults.async) ?? false,
    webhook: readString(parameters.webhook),
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
  for (const candidate of walkValues(payload)) {
    const object = readObject(candidate);
    const url =
      readString(object.url) ??
      readString(object.image_url) ??
      readString(object.imageUrl) ??
      readString(object.result_url) ??
      readString(object.resultUrl);
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

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs = defaultRequestTimeoutMs,
) {
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.floor(timeoutMs) : defaultRequestTimeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error("cumob_image_timeout"));
  }, timeout);
  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
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
    ["message"],
    ["error"],
    ["error", "message"],
    ["data", "message"],
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
  if (["failed", "error", "canceled", "cancelled"].includes(normalized ?? "")) {
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

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function readPositiveInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
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
