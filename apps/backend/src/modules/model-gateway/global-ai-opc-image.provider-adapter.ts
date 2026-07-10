import type {
  MediaGenerationArtifact,
  ProviderAdapter,
  ProviderSubmissionInput,
  ProviderSubmissionResult,
} from "./provider-adapter.contract.ts";
import {
  providerResponseDiagnostics,
  providerResponseError,
  type ProviderResponseDiagnostics,
} from "./provider-response-diagnostics.ts";

const defaultBaseURL = "https://zcbservice.aizfw.cn/kyyReactApiServer";
const defaultGptImage2Path = "/v1/image2/images";
const defaultBananaPath = "/v1/banana/images";
const defaultQueryPath = "/v1/result/{taskId}";
const defaultModel = "gpt-image-2";
const defaultRequestTimeoutMs = 120_000;
const defaultPollIntervalMs = 2_000;
const defaultMaxPollAttempts = 180;

export class GlobalAiOpcImageProviderAdapter implements ProviderAdapter {
  constructor(
    private readonly config: {
      apiKey: string;
      model?: string;
      createTaskEndpoint?: string;
      queryTaskEndpoint?: string;
      fetchImpl?: typeof fetch;
      requestTimeoutMs?: number;
      pollIntervalMs?: number;
      maxPollAttempts?: number;
      requestFormat?: string;
      defaultRequestParams?: Record<string, unknown>;
    },
  ) {}

  async submit(input: ProviderSubmissionInput): Promise<ProviderSubmissionResult> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const model = this.config.model?.trim() || defaultModel;
    const createTaskEndpoint = this.config.createTaskEndpoint ?? defaultCreateTaskEndpoint(model, this.config.requestFormat);
    const requestBody = buildGlobalAiOpcImagePayload(input, {
      model,
      requestFormat: this.config.requestFormat,
      defaultRequestParams: this.config.defaultRequestParams,
    });
    const created = await fetchJsonWithTimeout(
      fetchImpl,
      createTaskEndpoint,
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

    const externalRequestId = findFirstString(created.payload, [
      ["id"],
      ["task_id"],
      ["taskId"],
      ["task", "id"],
      ["task", "task_id"],
      ["task", "taskId"],
      ["data", "id"],
      ["data", "task_id"],
      ["data", "taskId"],
      ["data", "task", "id"],
      ["data", "task", "task_id"],
      ["data", "task", "taskId"],
      ["result", "id"],
      ["result", "task_id"],
      ["result", "taskId"],
    ]);
    if (!externalRequestId) {
      throw withFailureCode(
        providerResponseError("global_ai_opc_image_invalid_response", created.diagnostics),
        "global_ai_opc_image_invalid_response",
      );
    }
    const createStatus = normalizeProviderStatus(findProviderStatus(created.payload));
    if (createStatus === "failed") {
      throw withFailureCode(
        providerResponseError(
          `global_ai_opc_image_failed:${findProviderMessage(created.payload) ?? "provider_failed"}`,
          created.diagnostics,
        ),
        "global_ai_opc_image_failed",
      );
    }

    const finalResult = await this.pollUntilTerminal(fetchImpl, externalRequestId);
    return {
      externalRequestId,
      status: "succeeded",
      redactedResponse: {
        model,
        createStatus: findProviderStatus(created.payload) ?? null,
        providerStatus: findProviderStatus(finalResult.payload) ?? null,
        amount: readNumber(finalResult.payload.amount),
        imageCount: finalResult.artifacts.length,
      },
      artifacts: finalResult.artifacts,
    };
  }

  private async pollUntilTerminal(fetchImpl: typeof fetch, taskId: string): Promise<{
    payload: Record<string, unknown>;
    artifacts: MediaGenerationArtifact[];
  }> {
    const queryTaskEndpoint = this.config.queryTaskEndpoint ?? joinUrl(defaultBaseURL, defaultQueryPath);
    const pollIntervalMs = readPositiveInteger(this.config.pollIntervalMs) ?? defaultPollIntervalMs;
    const maxPollAttempts = readPositiveInteger(this.config.maxPollAttempts) ?? defaultMaxPollAttempts;

    for (let attempt = 1; attempt <= maxPollAttempts; attempt += 1) {
      const result = await fetchJsonWithTimeout(
        fetchImpl,
        queryTaskEndpoint.replace("{taskId}", encodeURIComponent(taskId)).replace("{id}", encodeURIComponent(taskId)),
        {
          method: "GET",
          headers: {
            authorization: `Bearer ${this.config.apiKey}`,
          },
        },
        this.config.requestTimeoutMs,
      );
      const status = normalizeProviderStatus(findProviderStatus(result.payload));
      if (status === "failed") {
        throw withFailureCode(
          providerResponseError(
            `global_ai_opc_image_failed:${findProviderMessage(result.payload) ?? "provider_failed"}`,
            result.diagnostics,
          ),
          "global_ai_opc_image_failed",
        );
      }
      if (status === "succeeded") {
        const artifacts = collectImageArtifacts(result.payload);
        if (artifacts.length < 1) {
          throw withFailureCode(
            providerResponseError("global_ai_opc_image_invalid_response", result.diagnostics),
            "global_ai_opc_image_invalid_response",
          );
        }
        return { payload: result.payload, artifacts };
      }
      if (attempt < maxPollAttempts) {
        await delay(pollIntervalMs);
      }
    }

    throw Object.assign(new Error("global_ai_opc_image_poll_timeout"), {
      failureCode: "provider_poll_timeout",
    });
  }
}

export function buildGlobalAiOpcImagePayload(
  input: ProviderSubmissionInput,
  config: {
    model?: string;
    requestFormat?: string;
    defaultRequestParams?: Record<string, unknown>;
  } = {},
): Record<string, unknown> {
  const model = config.model?.trim() || defaultModel;
  const payload = input.redactedPayload;
  const parameters = readObject(payload.parameters);
  const defaults = config.defaultRequestParams ?? {};
  const prompt =
    readString(payload.prompt) ??
    readString(parameters.prompt) ??
    readString(payload.title) ??
    "";
  const imageUrls = collectImageUrls(payload);
  if (isBananaRequest(model, config.requestFormat)) {
    const bananaDefaults = omitKeys(defaults, ["quality", "ratio"]);
    const bananaResolution =
      readGptImage2Resolution(parameters.resolution) ??
      readGptImage2Resolution(parameters.quality) ??
      readGptImage2Resolution(defaults.resolution) ??
      readGptImage2Resolution(defaults.quality) ??
      "1k";
    return stripUndefined({
      ...bananaDefaults,
      model,
      prompt,
      resolution: bananaResolution,
      size:
        readAspectRatio(parameters.size) ??
        readAspectRatio(parameters.aspectRatio) ??
        readAspectRatio(parameters.imageAspectRatio) ??
        readAspectRatio(bananaDefaults.size) ??
        "1:1",
      image_urls: imageUrls,
    });
  }

  const explicitSize = readGptImage2Size(parameters) ?? readGptImage2Size(defaults);
  const qualityValue = readString(parameters.quality) ?? readString(defaults.quality);
  const qualityAsResolution = readGptImage2Resolution(qualityValue);
  const resolution =
    readGptImage2Resolution(parameters.resolution) ??
    readGptImage2Resolution(parameters.qualityResolution) ??
    qualityAsResolution ??
    readGptImage2Resolution(defaults.resolution) ??
    readGptImage2Resolution(defaults.quality) ??
    "1k";
  const ratio =
    readAspectRatio(parameters.ratio) ??
    readAspectRatio(parameters.aspectRatio) ??
    readAspectRatio(parameters.imageAspectRatio) ??
    readAspectRatio(parameters.size) ??
    readAspectRatio(defaults.ratio) ??
    readAspectRatio(defaults.aspectRatio) ??
    readAspectRatio(defaults.imageAspectRatio) ??
    readAspectRatio(defaults.size) ??
    "1:1";
  const usesSize = Boolean(explicitSize) && model !== "gpt-image-2-o";

  return stripUndefined({
    ...defaults,
    model,
    prompt,
    quality: model === "gpt-image-2-r"
      ? undefined
      : qualityAsResolution ? undefined : normalizeGptImage2Quality(qualityValue) ?? "low",
    size: usesSize ? explicitSize : undefined,
    resolution: usesSize ? undefined : resolution,
    ratio: usesSize ? undefined : ratio,
    image_urls: imageUrls,
  });
}

function defaultCreateTaskEndpoint(model: string, requestFormat: string | undefined) {
  return joinUrl(defaultBaseURL, isBananaRequest(model, requestFormat) ? defaultBananaPath : defaultGptImage2Path);
}

function isBananaRequest(model: string, requestFormat: string | undefined) {
  return model.startsWith("nano-banana") || requestFormat === "global_ai_opc_banana_image";
}

async function fetchJsonWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs = defaultRequestTimeoutMs,
) {
  const timeout = readPositiveInteger(timeoutMs) ?? defaultRequestTimeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error("global_ai_opc_image_timeout"));
  }, timeout);
  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
    const text = await response.text();
    const diagnostics = providerResponseDiagnostics(response, text);
    if (!response.ok) {
      throw withFailureCode(
        providerResponseError(`global_ai_opc_image_${response.status}`, diagnostics),
        `global_ai_opc_image_${response.status}`,
      );
    }
    return {
      response,
      diagnostics,
      payload: parseGlobalAiOpcResponse(text, diagnostics),
    };
  } catch (error) {
    if (readFailureCode(error)) {
      throw error;
    }
    if (controller.signal.aborted) {
      throw Object.assign(new Error("global_ai_opc_image_timeout"), {
        failureCode: "global_ai_opc_image_timeout",
        providerDiagnostics: buildFetchFailureDiagnostics(url, error),
      });
    }
    throw Object.assign(new Error(readErrorMessage(error) || "global_ai_opc_image_network_error"), {
      failureCode: "global_ai_opc_image_network_error",
      providerDiagnostics: buildFetchFailureDiagnostics(url, error),
    });
  } finally {
    clearTimeout(timer);
  }
}

function parseGlobalAiOpcResponse(text: string, diagnostics: ProviderResponseDiagnostics) {
  if (!text.trim()) {
    throw withFailureCode(
      providerResponseError("global_ai_opc_image_empty_response", diagnostics),
      "global_ai_opc_image_empty_response",
    );
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw withFailureCode(
      providerResponseError("global_ai_opc_image_invalid_json", diagnostics),
      "global_ai_opc_image_invalid_json",
    );
  }
}

function collectImageUrls(payload: Record<string, unknown>) {
  const parameters = readObject(payload.parameters);
  return dedupeStrings([
    ...readMediaUrlArray(payload.images),
    ...readMediaUrlArray(payload.referenceImages),
    ...readMediaUrlArray(payload.references),
    readMediaUrl(payload.imageUrl),
    readMediaUrl(payload.image_url),
    ...readMediaUrlArray(parameters.image_urls),
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
      readString(object.image_url) ??
      readString(object.imageUrl) ??
      readString(object.url) ??
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
    ["error"],
    ["message"],
    ["error", "message"],
    ["data", "error"],
    ["data", "message"],
    ["data", "error", "message"],
  ]);
}

function normalizeProviderStatus(status: string | undefined): "accepted" | "running" | "succeeded" | "failed" {
  const normalized = status?.trim().toLowerCase();
  if (["completed", "succeeded", "success", "done", "finished"].includes(normalized ?? "")) {
    return "succeeded";
  }
  if (["processing", "running", "generating"].includes(normalized ?? "")) {
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

function readGptImage2Size(parameters: Record<string, unknown>) {
  const size =
    readString(parameters.size) ??
    readString(parameters.imageSize) ??
    readString(parameters.imageResolution);
  return size && /^\d+x\d+$/i.test(size) ? size : undefined;
}

function readGptImage2Resolution(value: unknown) {
  const resolution = readString(value);
  return resolution && /^[124]k$/i.test(resolution) ? resolution.toLowerCase() : undefined;
}

function readAspectRatio(value: unknown) {
  const raw = readString(value);
  if (!raw) {
    return undefined;
  }
  if (/^\d+:\d+$/.test(raw)) {
    return raw;
  }
  const dimensions = raw.match(/^(\d+)x(\d+)$/i);
  if (!dimensions) {
    return undefined;
  }
  const width = Number(dimensions[1]);
  const height = Number(dimensions[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined;
  }
  const divisor = greatestCommonDivisor(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function normalizeGptImage2Quality(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized && ["low", "medium", "high"].includes(normalized) ? normalized : undefined;
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

function stripUndefined(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function omitKeys(input: Record<string, unknown>, keys: string[]) {
  const blocked = new Set(keys);
  return Object.fromEntries(Object.entries(input).filter(([key]) => !blocked.has(key)));
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

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readPositiveInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.floor(Math.abs(left));
  let b = Math.floor(Math.abs(right));
  while (b > 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
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

function readFailureCode(error: unknown) {
  return error && typeof error === "object" && typeof (error as { failureCode?: unknown }).failureCode === "string"
    ? String((error as { failureCode: string }).failureCode)
    : undefined;
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

function joinUrl(baseURL: string, endpoint: string): string {
  return `${baseURL.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
}

function delay(ms: number) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}
