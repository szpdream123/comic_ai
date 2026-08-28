import type {
  ProviderAdapter,
  ProviderPollInput,
  ProviderPollResult,
  ProviderSubmissionInput,
  ProviderSubmissionResult,
} from "./provider-adapter.contract.ts";
import { recordProviderAdapterRequest } from "./provider-adapter.contract.ts";
import {
  attachProviderRedactedRequest,
  providerResponseDiagnostics,
  providerResponseError,
  readProviderRawResponse,
  readProviderResponseDiagnostics,
} from "./provider-response-diagnostics.ts";
import { ModelError } from "./model-error.ts";
import { SeedanceVideoProviderAdapter } from "./seedance-video.provider-adapter.ts";

export type ChiYuanVideoRequestFormat =
  | "chiyuan_seedance_official"
  | "chiyuan_seedance_super_resolution";

export class ChiYuanVideoProviderAdapter implements ProviderAdapter {
  private readonly officialAdapter: SeedanceVideoProviderAdapter | null;

  constructor(
    private readonly config: {
      apiKey: string;
      model?: string;
      requestFormat: ChiYuanVideoRequestFormat;
      createTaskEndpoint: string;
      queryTaskEndpoint: string;
      fetchImpl?: typeof fetch;
    },
  ) {
    this.officialAdapter = config.requestFormat === "chiyuan_seedance_official"
      ? new SeedanceVideoProviderAdapter({
        apiKey: config.apiKey,
        model: config.model,
        createTaskEndpoint: config.createTaskEndpoint,
        queryTaskEndpoint: config.queryTaskEndpoint,
        fetchImpl: config.fetchImpl,
      })
      : null;
  }

  async submit(input: ProviderSubmissionInput): Promise<ProviderSubmissionResult> {
    if (this.officialAdapter) {
      let result: ProviderSubmissionResult;
      try {
        result = await this.officialAdapter.submit({
          ...input,
          recordRedactedRequest: input.recordRedactedRequest
            ? async (request) => input.recordRedactedRequest?.(sanitizeChiYuanAuditRecord(request))
            : undefined,
        });
      } catch (error) {
        throw sanitizeOfficialAdapterError(error, input.redactedPayload, "submit");
      }
      const rawResponse = readRecord(readProviderRawResponse(result.redactedResponse));
      const providerStatus = findProviderStatus(rawResponse)
        ?? readString(result.redactedResponse?.providerStatus);
      if (normalizeProviderStatus(providerStatus) === "failed") {
        const providerErrorCode = findFirstScalarString(rawResponse, [
          ["code"], ["error", "code"], ["data", "error", "code"],
        ]);
        const providerMessage = findFirstString(rawResponse, [
          ["message"], ["error", "message"], ["data", "error", "message"],
        ]);
        throw attachProviderRedactedRequest(
          providerResponseError(
            [
              "chiyuan_video_submission_failed",
              providerErrorCode ? String(sanitizeChiYuanAuditValue(providerErrorCode)) : undefined,
              providerMessage ? String(sanitizeChiYuanAuditValue(providerMessage)) : undefined,
            ].filter(Boolean).join(":"),
            safeBusinessFailureDiagnostics(rawResponse),
          ),
          sanitizeChiYuanAuditRecord(result.redactedRequest ?? {}),
        );
      }
      return {
        ...result,
        redactedRequest: sanitizeChiYuanAuditRecord(result.redactedRequest ?? {}),
        redactedResponse: sanitizeChiYuanAuditRecord(result.redactedResponse ?? {}),
      };
    }
    return this.submitSuperResolution(input);
  }

  async poll(input: ProviderPollInput): Promise<ProviderPollResult> {
    if (this.officialAdapter) {
      let result: ProviderPollResult;
      try {
        result = await this.officialAdapter.poll(input);
      } catch (error) {
        throw sanitizeOfficialAdapterError(error, undefined, "poll");
      }
      const rawResponse = readRecord(readProviderRawResponse(result.redactedResponse));
      return normalizeTerminalVideoResult({
        ...result,
        videoUrl: result.videoUrl ?? findChiYuanVideoUrl(rawResponse),
        redactedResponse: sanitizeChiYuanAuditRecord(result.redactedResponse),
      });
    }
    return this.pollSuperResolution(input);
  }

  async cancel(input: { externalRequestId: string }) {
    return {
      status: "not_cancelable" as const,
      redactedResponse: {
        providerStatus: "not_cancelable",
        taskId: input.externalRequestId,
      },
    };
  }

  private async submitSuperResolution(
    input: ProviderSubmissionInput,
  ): Promise<ProviderSubmissionResult> {
    const requestPayload = buildSuperResolutionPayload(input, this.config.model);
    const redactedRequest = await recordProviderAdapterRequest(
      input,
      sanitizeChiYuanAuditRecord(requestPayload),
    );
    const response = await (this.config.fetchImpl ?? fetch)(this.config.createTaskEndpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(requestPayload),
    });
    const payload = await readJsonResponse(response, "chiyuan_video_submit", redactedRequest);
    const externalRequestId = findFirstString(payload, [
      ["id"], ["task_id"], ["taskId"], ["data", "id"], ["data", "task_id"], ["data", "taskId"],
    ]);
    const providerStatus = findProviderStatus(payload);
    if (normalizeProviderStatus(providerStatus) === "failed") {
      const providerErrorCode = findFirstScalarString(payload, [
        ["code"], ["error", "code"], ["data", "code"], ["data", "error", "code"],
      ]);
      const providerMessage = findFirstString(payload, [
        ["message"], ["error", "message"], ["data", "message"], ["data", "error", "message"],
      ]);
      const safeProviderErrorCode = providerErrorCode
        ? String(sanitizeChiYuanAuditValue(providerErrorCode))
        : undefined;
      const safeProviderMessage = providerMessage
        ? String(sanitizeChiYuanAuditValue(providerMessage))
        : undefined;
      throw attachProviderRedactedRequest(
        providerResponseError(
          ["chiyuan_video_submission_failed", safeProviderErrorCode, safeProviderMessage]
            .filter(Boolean)
            .join(":"),
          safeProviderResponseDiagnostics(response, payload),
        ),
        redactedRequest,
      );
    }
    if (!externalRequestId) {
      throw attachProviderRedactedRequest(
        providerResponseError(
          "chiyuan_video_submission_missing_task_id",
          safeProviderResponseDiagnostics(response, payload),
        ),
        redactedRequest,
      );
    }
    return {
      externalRequestId,
      status: normalizeSubmissionStatus(providerStatus),
      redactedRequest,
      redactedResponse: {
        providerStatus: providerStatus ?? null,
        model: this.config.model ?? null,
        queryTaskEndpoint: this.config.queryTaskEndpoint,
      },
    };
  }

  private async pollSuperResolution(input: ProviderPollInput): Promise<ProviderPollResult> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const queryEndpoints = superResolutionQueryEndpointCandidates(
      this.config.queryTaskEndpoint,
      input.redactedPayload,
    );
    let response: Response | undefined;
    let queryTaskEndpoint = this.config.queryTaskEndpoint;
    for (const endpoint of queryEndpoints) {
      queryTaskEndpoint = endpoint;
      response = await fetchImpl(taskEndpoint(endpoint, input.externalRequestId), {
        method: "GET",
        headers: { authorization: `Bearer ${this.config.apiKey}` },
      });
      if (response.status !== 404) break;
    }
    if (!response) throw new Error("chiyuan_video_query_endpoint_required");
    const payload = await readJsonResponse(response, "chiyuan_video_poll");
    const providerStatus = findProviderStatus(payload);
    return normalizeTerminalVideoResult({
      status: normalizeProviderStatus(providerStatus),
      videoUrl: findChiYuanVideoUrl(payload),
      redactedResponse: sanitizeChiYuanAuditRecord({
        providerStatus: providerStatus ?? null,
        taskId: input.externalRequestId,
        queryTaskEndpoint,
        progress: readPath(payload, ["progress"]) ?? readPath(payload, ["data", "progress"]) ?? null,
        providerErrorCode: findFirstScalarString(payload, [
          ["code"], ["error", "code"], ["data", "code"], ["data", "error", "code"],
        ]) ?? null,
        providerMessage: findFirstString(payload, [
          ["message"], ["error", "message"], ["data", "message"], ["data", "error", "message"],
        ]) ?? null,
      }),
    });
  }
}

export function isChiYuanVideoRequestFormat(value: string | undefined): value is ChiYuanVideoRequestFormat {
  return value === "chiyuan_seedance_official" || value === "chiyuan_seedance_super_resolution";
}

export function validateChiYuanVideoProviderConfig(input: {
  mediaType?: unknown;
  providerModel?: unknown;
  providerConfig?: Record<string, unknown>;
}, options: { allowRuntimeResolvedApiKey?: boolean } = {}) {
  const config = input.providerConfig ?? {};
  const requestFormat = readString(config.requestFormat);
  if (readString(input.mediaType) !== "video" || !isChiYuanVideoRequestFormat(requestFormat)) {
    return "chiyuan_provider_config_invalid";
  }
  if (
    readString(config.apiKeyEnv) !== "ChiYuan_API_KEY"
    || (!options.allowRuntimeResolvedApiKey && readString(config.apiKey))
  ) {
    return "chiyuan_provider_config_invalid";
  }
  const baseURL = normalizeBaseUrl(readString(config.baseURL));
  if (baseURL !== "https://cy.apistudio.cc") return "chiyuan_provider_config_invalid";

  const official = requestFormat === "chiyuan_seedance_official";
  const expectedModel = official
    ? "doubao-seedance-2-0-mini-260615"
    : "doubao-seedance-2-5-260628";
  const expectedCreatePath = "/api/v3/contents/generations/tasks";
  const expectedQueryPaths = [
    "/api/v3/contents/generations/tasks/{taskId}",
    "/api/v3/contents/generations/tasks/{task_id}",
  ];
  if (readString(input.providerModel) !== expectedModel) return "chiyuan_provider_config_invalid";
  if (resolveChiYuanConfiguredEndpoint(baseURL, readString(config.createTaskEndpoint)) !== `${baseURL}${expectedCreatePath}`) {
    return "chiyuan_provider_config_invalid";
  }
  const requestPath = readString(config.requestPath);
  if (requestPath && resolveChiYuanConfiguredEndpoint(baseURL, requestPath) !== `${baseURL}${expectedCreatePath}`) {
    return "chiyuan_provider_config_invalid";
  }
  if (!expectedQueryPaths.some((path) => (
    resolveChiYuanConfiguredEndpoint(baseURL, readString(config.queryTaskEndpoint)) === `${baseURL}${path}`
  ))) {
    return "chiyuan_provider_config_invalid";
  }
  return null;
}

function buildSuperResolutionPayload(
  input: ProviderSubmissionInput,
  model?: string,
): Record<string, unknown> {
  const payload = input.redactedPayload;
  const parameters = readRecord(payload.parameters);
  const firstFrameUrl = firstString([
    readString(payload.firstFrameUrl),
    readString(payload.imageUrl),
    readString(payload.referenceImageUrl),
    readMediaUrl(payload.firstFrame),
    readMediaUrl(parameters.firstFrame),
  ]);
  const referenceImageUrls = dedupe([
    ...readMediaUrlArray(payload.referenceImages),
    ...readMediaUrlArray(parameters.referenceImages),
    ...readMediaUrlArray(parameters.referenceUploads),
  ]);
  const duration = readInteger(parameters.durationSec) ?? readInteger(parameters.duration);
  const resolution = readString(parameters.resolution);
  const images = dedupe([firstFrameUrl, ...referenceImageUrls].filter((value): value is string => Boolean(value)));
  const prompt = readString(payload.prompt) ?? readString(payload.motionPrompt) ?? "";
  return removeUndefined({
    model,
    content: [
      { type: "text", text: prompt },
      ...images.map((url) => ({
        type: "image_url",
        image_url: { url },
        role: "reference_image",
      })),
    ],
    generate_audio: readBoolean(parameters.generateAudio) ?? true,
    ratio: readString(parameters.ratio) ?? readString(parameters.aspectRatio),
    duration,
    resolution,
    watermark: readBoolean(parameters.watermark) ?? false,
    seed: readInteger(parameters.seed),
    omni_reference_task_type: images.length > 0 ? "reference" : undefined,
    output_format: "mov",
  });
}

async function readJsonResponse(
  response: Response,
  prefix: string,
  request?: Record<string, unknown>,
) {
  if (!response.ok) {
    const { text, diagnostics } = await readProviderResponseDiagnostics(response);
    const parsed = parseRecord(text);
    const code = findFirstScalarString(parsed, [["code"], ["error", "code"], ["data", "code"]]);
    const message = findFirstString(parsed, [["message"], ["error", "message"], ["data", "message"]])
      ?? diagnostics.responseBodyPreview;
    const safeCode = code ? String(sanitizeChiYuanAuditValue(code)) : undefined;
    const safeMessage = message ? String(sanitizeChiYuanAuditValue(message)) : undefined;
    const error = providerResponseError(
      [`${prefix}_${response.status}`, safeCode, safeMessage].filter(Boolean).join(":"),
      Object.keys(parsed).length
        ? safeProviderResponseDiagnostics(response, parsed)
        : providerResponseDiagnostics(
            response,
            String(sanitizeChiYuanAuditValue(diagnostics.responseBodyPreview)),
          ),
    );
    throw request ? attachProviderRedactedRequest(error, request) : error;
  }
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const error = providerResponseError(
      `${prefix}_invalid_json`,
      providerResponseDiagnostics(
        response,
        String(sanitizeChiYuanAuditValue(text.trim().slice(0, 1000))),
      ),
    );
    throw request ? attachProviderRedactedRequest(error, request) : error;
  }
}

function findProviderStatus(payload: Record<string, unknown>) {
  return findFirstString(payload, [
    ["status"], ["task_status"], ["taskStatus"], ["data", "status"], ["result", "status"],
  ]);
}

function findChiYuanVideoUrl(payload: Record<string, unknown>) {
  return findFirstString(payload, [
    ["url"], ["result_url"], ["video_url"], ["videoUrl"], ["metadata", "url"],
    ["content", "video_url"], ["content", "videoUrl"],
    ["data", "result_url"], ["data", "url"], ["data", "video_url"], ["data", "videoUrl"],
    ["data", "metadata", "url"], ["data", "content", "video_url"], ["data", "content", "videoUrl"],
    ["data", "data", "result_url"], ["data", "data", "url"],
    ["data", "data", "content", "video_url"], ["data", "data", "content", "videoUrl"],
    ["result", "url"], ["result", "result_url"], ["result", "video_url"], ["result", "videoUrl"],
  ]);
}

function normalizeSubmissionStatus(status: string | undefined): ProviderSubmissionResult["status"] {
  const normalized = normalizeProviderStatus(status);
  return normalized === "failed" ? "accepted" : normalized;
}

function normalizeProviderStatus(status: string | undefined): ProviderPollResult["status"] {
  const normalized = status?.trim().toLowerCase();
  if (["succeeded", "success", "completed", "done", "finished"].includes(normalized ?? "")) return "succeeded";
  if (["failed", "error", "canceled", "cancelled"].includes(normalized ?? "")) return "failed";
  if (["running", "processing", "in_progress", "generating"].includes(normalized ?? "")) return "running";
  return "accepted";
}

function taskEndpoint(endpoint: string, taskId: string) {
  const encoded = encodeURIComponent(taskId);
  return endpoint.replace("{taskId}", encoded).replace("{task_id}", encoded);
}

function superResolutionQueryEndpointCandidates(
  configuredEndpoint: string,
  redactedPayload: Record<string, unknown> | undefined,
) {
  const payload = redactedPayload ?? {};
  const recordedEndpoint = readString(readPath(payload, ["providerResponseRedacted", "queryTaskEndpoint"]));
  const capturedEndpoint = readString(readPath(payload, [
    "modelConfigSnapshot",
    "config",
    "providerConfig",
    "queryTaskEndpoint",
  ]));
  const candidates = [recordedEndpoint, capturedEndpoint, configuredEndpoint]
    .flatMap((endpoint) => endpoint ? [endpoint, ...legacySiblingQueryEndpoints(endpoint)] : [])
    .map((endpoint) => normalizeChiYuanQueryEndpoint(configuredEndpoint, endpoint))
    .filter((endpoint): endpoint is string => Boolean(endpoint));
  return [...new Set(candidates)];
}

function legacySiblingQueryEndpoints(endpoint: string) {
  if (endpoint.includes("/api/v3/contents/generations/tasks/")) {
    const v1Generation = endpoint.replace(
      "/api/v3/contents/generations/tasks/",
      "/v1/video/generations/",
    );
    return [v1Generation, v1Generation.replace("/v1/video/generations/", "/v1/videos/")];
  }
  if (endpoint.includes("/api/v3/contents/generations/tasks/{")) {
    const v1Generation = endpoint.replace(
      "/api/v3/contents/generations/tasks/{",
      "/v1/video/generations/{",
    );
    return [v1Generation, v1Generation.replace("/v1/video/generations/{", "/v1/videos/{")];
  }
  if (endpoint.includes("/v1/video/generations/")) {
    return [endpoint.replace("/v1/video/generations/", "/v1/videos/")];
  }
  return endpoint.includes("/v1/video/generations/{")
    ? [endpoint.replace("/v1/video/generations/{", "/v1/videos/{")]
    : [];
}

function normalizeChiYuanQueryEndpoint(configuredEndpoint: string, endpoint: string) {
  try {
    const configured = new URL(configuredEndpoint);
    const resolved = new URL(endpoint, `${configured.origin}/`);
    if (resolved.origin !== configured.origin || resolved.search || resolved.hash) return undefined;
    const pathname = decodeURIComponent(resolved.pathname);
    if (![
      /^\/api\/v3\/contents\/generations\/tasks\/\{task(?:I|_i)d\}$/,
      /^\/v1\/video\/generations\/\{task(?:I|_i)d\}$/,
      /^\/v1\/videos\/\{task(?:I|_i)d\}$/,
    ].some((pattern) => pattern.test(pathname))) {
      return undefined;
    }
    return `${resolved.origin}${pathname}`;
  } catch {
    return undefined;
  }
}

function parseRecord(value: string) {
  try {
    return readRecord(JSON.parse(value));
  } catch {
    return {};
  }
}

function findFirstString(payload: Record<string, unknown>, paths: string[][]) {
  for (const path of paths) {
    const value = readPath(payload, path);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function findFirstScalarString(payload: Record<string, unknown>, paths: string[][]) {
  for (const path of paths) {
    const value = readPath(payload, path);
    if ((typeof value === "string" || typeof value === "number") && String(value).trim()) return String(value).trim();
  }
  return undefined;
}

function readPath(payload: Record<string, unknown>, path: string[]) {
  let current: unknown = payload;
  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function readMediaUrl(value: unknown): string | undefined {
  if (typeof value === "string") return readString(value);
  const record = readRecord(value);
  return firstString(["url", "sourceUrl", "downloadUrl", "previewUrl", "publicUrl", "src"].map((key) => readString(record[key])));
}

function readMediaUrlArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => readMediaUrlArray(item));
  const url = readMediaUrl(value);
  return url ? [url] : [];
}

function firstString(values: Array<string | undefined>) {
  return values.find((value): value is string => Boolean(value));
}

function dedupe(values: string[]) {
  return [...new Set(values)];
}

function removeUndefined(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function normalizeTerminalVideoResult(result: ProviderPollResult): ProviderPollResult {
  if (result.status !== "succeeded" || result.videoUrl) return result;
  return {
    ...result,
    status: "running",
    redactedResponse: {
      ...result.redactedResponse,
      providerMessage: "provider_succeeded_without_video_url",
    },
  };
}

function safeBusinessFailureDiagnostics(payload: Record<string, unknown>) {
  const safePayload = JSON.stringify(sanitizeChiYuanAuditRecord(payload));
  return {
    httpStatus: 200,
    statusText: null,
    contentType: "application/json",
    requestId: null,
    responseBodyLength: Buffer.byteLength(safePayload, "utf8"),
    responseBodyPreview: safePayload.slice(0, 1000),
  };
}

function safeProviderResponseDiagnostics(response: Response, payload: Record<string, unknown>) {
  return providerResponseDiagnostics(
    response,
    JSON.stringify(sanitizeChiYuanAuditRecord(payload)),
  );
}

function sanitizeChiYuanAuditRecord(value: Record<string, unknown>): Record<string, unknown> {
  return sanitizeChiYuanAuditValue(value) as Record<string, unknown>;
}

function sanitizeChiYuanAuditValue(value: unknown, parentKey = ""): unknown {
  const normalizedKey = parentKey.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (["authorization", "apikey", "token", "accesstoken", "secret"].includes(normalizedKey)) {
    return "[redacted]";
  }
  if (typeof value === "string") {
    if (/^Bearer\s+/i.test(value)) return "Bearer [redacted]";
    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        url.username = "";
        url.password = "";
        url.search = "";
        url.hash = "";
        return url.toString();
      } catch {
        return "[redacted-url]";
      }
    }
    return value
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
      .replace(/https?:\/\/[^\s"'<>]+/gi, (url) => sanitizeEmbeddedUrl(url));
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeChiYuanAuditValue(entry, parentKey));
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    key,
    sanitizeChiYuanAuditValue(entry, key),
  ]));
}

function sanitizeOfficialAdapterError(
  error: unknown,
  fallbackRequest: Record<string, unknown> | undefined,
  phase: "submit" | "poll",
) {
  const source = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const diagnostics = readRecord(source.providerDiagnostics);
  const safeDiagnostics = Object.keys(diagnostics).length
    ? sanitizeChiYuanAuditRecord(diagnostics)
    : undefined;
  const message = error instanceof Error
    ? String(sanitizeChiYuanAuditValue(error.message))
    : String(sanitizeChiYuanAuditValue(error));
  const normalized = ModelError.fromUnknown(message, {
    mediaType: "video",
    phase,
    providerDiagnostics: safeDiagnostics,
  });
  const request = readRecord(source.providerRedactedRequest);
  const safeRequest = Object.keys(request).length
    ? sanitizeChiYuanAuditRecord(request)
    : fallbackRequest
      ? sanitizeChiYuanAuditRecord(fallbackRequest)
      : undefined;
  return safeRequest ? attachProviderRedactedRequest(normalized, safeRequest) : normalized;
}

function sanitizeEmbeddedUrl(value: string) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "[redacted-url]";
  }
}

function normalizeBaseUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

function resolveChiYuanConfiguredEndpoint(baseURL: string, endpoint: string | undefined) {
  if (!endpoint || endpoint.includes("?") || endpoint.includes("#")) return undefined;
  if (/^https?:\/\//i.test(endpoint)) {
    try {
      const url = new URL(endpoint);
      if (url.username || url.password || url.search || url.hash) return undefined;
      return `${url.origin}${url.pathname}`;
    } catch {
      return undefined;
    }
  }
  return endpoint.startsWith("/") ? `${baseURL}${endpoint}` : undefined;
}
