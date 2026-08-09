/**
 * @typedef {"character" | "scene" | "prop"} AssetCandidateGroup
 *
 * @typedef {object} CreatorState
 * @property {object | null} project
 * @property {object | null} script
 * @property {object | null} assetReview
 * @property {object | null} assetCandidates
 * @property {object | null} calibration
 * @property {Array<object>} shots
 * @property {object | null} exportPreview
 */

function normalizeErrorResponse(payload, fallbackCode, fallbackMessage = fallbackCode) {
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const nested = source.error && typeof source.error === "object" && !Array.isArray(source.error)
    ? source.error
    : null;
  const failure = source.failure && typeof source.failure === "object" && !Array.isArray(source.failure)
    ? source.failure
    : nested?.failure && typeof nested.failure === "object" && !Array.isArray(nested.failure)
      ? nested.failure
      : null;
  const firstPrimitiveText = (candidates, fallback) => {
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        return String(candidate);
      }
    }
    return String(fallback);
  };
  const message = firstPrimitiveText([
    failure?.displayMessage,
    nested?.message,
    source.message,
    typeof source.error === "string" ? source.error : null,
    source.errorCode,
    nested?.code,
    fallbackMessage,
  ], fallbackMessage);
  const errorCode = firstPrimitiveText([
    nested?.code,
    nested?.errorCode,
    source.errorCode,
    typeof source.error === "string" ? source.error : null,
    fallbackCode,
  ], fallbackCode);
  return {
    message,
    errorCode,
    details: failure?.details ?? nested?.details ?? source.details ?? null,
    failure,
    noticeType: failure?.noticeType ?? nested?.noticeType ?? source.noticeType ?? null,
    providerStatus: failure?.providerStatus ?? nested?.providerStatus ?? source.providerStatus ?? null,
    providerErrorCode: failure?.providerErrorCode ?? nested?.providerErrorCode ?? source.providerErrorCode ?? null,
    providerMessage: failure?.providerMessage ?? nested?.providerMessage ?? source.providerMessage ?? null,
  };
}

async function fetchJson(url, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 10000;
  const unwrapEnvelope = options.unwrapEnvelope !== false;
  const dedupeKey = options.dedupeKey ?? null;
  const dedupeTtlMs = Number.isFinite(options.dedupeTtlMs) ? options.dedupeTtlMs : 1500;
  if (dedupeKey) {
    const cached = getCachedFetchJson(dedupeKey, dedupeTtlMs);
    if (cached) {
      return cached;
    }
  }
  const controller = new AbortController();
  const externalSignal = options.signal;
  const abortFromExternalSignal = () => controller.abort();
  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener?.("abort", abortFromExternalSignal, { once: true });
  }
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const {
    timeoutMs: _timeoutMs,
    unwrapEnvelope: _unwrapEnvelope,
    dedupeKey: _dedupeKey,
    dedupeTtlMs: _dedupeTtlMs,
    signal: _signal,
    ...fetchOptions
  } = options;

  const request = (async () => {
    let response;
    try {
      response = await fetch(resolveApiUrl(url), {
        credentials: "include",
        ...fetchOptions,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        if (externalSignal?.aborted) {
          throw error;
        }
        throw new Error("request_timeout");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener?.("abort", abortFromExternalSignal);
    }

    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        const error = new Error("unexpected_response");
        error.status = response.status ?? 0;
        error.errorCode = "unexpected_response";
        error.details = {
          contentType: response.headers?.get?.("content-type") ?? "",
          preview: text.slice(0, 120),
          url: response.url ?? "",
        };
        throw error;
      }
    }

    if (!response.ok) {
      const errorPayload =
        payload?.data && typeof payload.data === "object" && !Array.isArray(payload.data)
          ? payload.data
          : payload;
      const normalizedError = normalizeErrorResponse(
        errorPayload,
        `request_failed:${response.status}`,
      );
      const error = new Error(normalizedError.message);
      error.status = response.status;
      error.errorCode = normalizedError.errorCode;
      error.details = normalizedError.details;
      error.failure = normalizedError.failure;
      error.noticeType = normalizedError.noticeType;
      error.providerStatus = normalizedError.providerStatus;
      error.providerErrorCode = normalizedError.providerErrorCode;
      error.providerMessage = normalizedError.providerMessage;
      error.requestId = payload.requestId ?? null;
      error.data = errorPayload;
      error.taskId =
        typeof errorPayload.taskId === "string" && errorPayload.taskId.trim()
          ? errorPayload.taskId.trim()
          : typeof normalizedError.details?.taskId === "string" && normalizedError.details.taskId.trim()
            ? normalizedError.details.taskId.trim()
            : null;
      throw error;
    }

    if (
      unwrapEnvelope &&
      payload &&
      typeof payload === "object" &&
      Object.prototype.hasOwnProperty.call(payload, "data") &&
      Object.prototype.hasOwnProperty.call(payload, "requestId")
    ) {
      return payload.data;
    }

    return payload;
  })();
  if (dedupeKey) {
    cacheFetchJson(dedupeKey, request);
  }
  return request;
}

const fetchJsonCache = new Map();
const readJsonCache = new Map();
const readJsonCacheVersions = new Map();

function getCachedFetchJson(key, ttlMs) {
  const cached = fetchJsonCache.get(key);
  if (!cached) {
    return null;
  }
  if (Date.now() - cached.createdAt > ttlMs) {
    fetchJsonCache.delete(key);
    return null;
  }
  return cached.promise;
}

function cacheFetchJson(key, promise) {
  fetchJsonCache.set(key, {
    createdAt: Date.now(),
    promise,
  });
  promise.catch(() => {
    if (fetchJsonCache.get(key)?.promise === promise) {
      fetchJsonCache.delete(key);
    }
  });
}

function clearFetchJsonCache(key) {
  if (key) {
    fetchJsonCache.delete(key);
    return;
  }
  fetchJsonCache.clear();
}

function getCachedReadJson(key, ttlMs) {
  const cached = readJsonCache.get(key);
  if (!cached) {
    return null;
  }
  if (Date.now() - cached.createdAt > ttlMs) {
    readJsonCache.delete(key);
    return null;
  }
  return cached;
}

function cacheReadJson(key, promise) {
  readJsonCache.set(key, {
    createdAt: Date.now(),
    promise,
    refreshing: false,
  });
  promise.catch(() => {
    if (readJsonCache.get(key)?.promise === promise) {
      readJsonCache.delete(key);
    }
  });
}

function clearReadJsonCache() {
  for (const key of readJsonCache.keys()) {
    invalidateReadJsonCacheKey(key);
  }
  readJsonCache.clear();
}

function clearReadRequestCaches() {
  clearFetchJsonCache();
  clearReadJsonCache();
}

function clearProjectSelectionReadCaches() {
  for (const key of fetchJsonCache.keys()) {
    if (isProjectSelectionReadCacheKey(key)) {
      fetchJsonCache.delete(key);
    }
  }
  for (const key of readJsonCache.keys()) {
    if (isProjectSelectionReadCacheKey(key)) {
      invalidateReadJsonCacheKey(key);
    }
  }
}

function invalidateReadJsonCacheKey(key) {
  readJsonCacheVersions.set(key, (readJsonCacheVersions.get(key) ?? 0) + 1);
  readJsonCache.delete(key);
}

function isProjectSelectionReadCacheKey(key) {
  return key === "GET /api/creator/state" || key.startsWith("GET /api/creator/assets/library");
}

function fetchJsonWithTtl(url, options = {}) {
  const {
    cacheKey = `GET ${url}`,
    cacheTtlMs = 30000,
    silentRefreshOnHit = true,
    silentRefreshMinAgeMs = 5000,
    ...fetchOptions
  } = options;
  if (!Number.isFinite(cacheTtlMs) || cacheTtlMs <= 0 || fetchOptions.cache === "no-store") {
    return fetchJson(url, fetchOptions);
  }
  const cached = getCachedReadJson(cacheKey, cacheTtlMs);
  if (cached) {
    const shouldRefreshSilently =
      silentRefreshOnHit &&
      !cached.refreshing &&
      Date.now() - cached.createdAt > Math.max(0, silentRefreshMinAgeMs);
    if (shouldRefreshSilently) {
      cached.refreshing = true;
      const cacheVersion = readJsonCacheVersions.get(cacheKey) ?? 0;
      fetchJson(url, {
        ...fetchOptions,
        dedupeKey: fetchOptions.dedupeKey ?? cacheKey,
      }).then((result) => {
        if ((readJsonCacheVersions.get(cacheKey) ?? 0) === cacheVersion) {
          cacheReadJson(cacheKey, Promise.resolve(result));
        }
      }).catch(() => {
        if (readJsonCache.get(cacheKey) === cached) {
          cached.refreshing = false;
        }
      });
    }
    return cached.promise;
  }
  const request = fetchJson(url, {
    ...fetchOptions,
    dedupeKey: fetchOptions.dedupeKey ?? cacheKey,
  });
  cacheReadJson(cacheKey, request);
  return request;
}

export function resolveApiUrl(url) {
  if (typeof window === "undefined") {
    return url;
  }
  if (/^(?:https?:|data:|blob:)/i.test(url)) {
    return url;
  }
  const backendOwnedPath = /^\/(?:api|uploads|vendor)(?:\/|$)/.test(url);
  const localHttpHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(
    window.location.host ?? "",
  );
  const localBackendPort = /^(?:431\d|4320|4322|4325|4399)$/.test(window.location.port ?? "");
  const shouldUseDevBackend =
    window.location.protocol === "file:" ||
    (backendOwnedPath && localHttpHost && !localBackendPort);
  const origin =
    shouldUseDevBackend
      ? "http://127.0.0.1:4310"
      : window.location.origin;
  return new URL(url, origin).toString();
}

const toolboxVideoDepthPluginBaseUrl = "http://127.0.0.1:48123";

function resolveToolboxVideoDepthPluginUrl(path = "") {
  const configured = typeof globalThis !== "undefined" && typeof globalThis.__COMIC_AI_VIDEO_DEPTH_PLUGIN_URL__ === "string"
    ? globalThis.__COMIC_AI_VIDEO_DEPTH_PLUGIN_URL__.trim()
    : "";
  const base = (configured || toolboxVideoDepthPluginBaseUrl).replace(/\/$/, "");
  return `${base}/${String(path).replace(/^\//, "")}`;
}

async function fetchToolboxVideoDepthPlugin(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Number(options.timeoutMs ?? 5000));
  const { timeoutMs: _timeoutMs, ...fetchOptions } = options;
  try {
    const response = await fetch(resolveToolboxVideoDepthPluginUrl(path), {
      mode: "cors",
      ...fetchOptions,
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { message: text };
      }
    }
    if (!response.ok) {
      throw new Error(String(payload?.message ?? payload?.error ?? `plugin_request_failed:${response.status}`));
    }
    return payload?.data && typeof payload.data === "object" ? payload.data : payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("本地插件连接超时");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

const uploadCompletionTimeoutMs = 60000;
const uploadCompletionRetryLimit = 1;

function isRetriableUploadCompletionError(error) {
  const status = Number(error?.status ?? 0);
  if (status >= 400 && status < 500) {
    return false;
  }
  const message = String(error?.message ?? error?.errorCode ?? "");
  return (
    message === "request_timeout" ||
    error?.name === "TypeError" ||
    status >= 500
  );
}

async function completeUploadWithRetry(api, uploadSessionId, input, options = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await api.completeUpload(uploadSessionId, input, options);
    } catch (error) {
      if (attempt >= uploadCompletionRetryLimit || !isRetriableUploadCompletionError(error)) {
        throw error;
      }
      attempt += 1;
    }
  }
}

function buildUploadFileResult(prepared, file, completed, uploadResult) {
  return {
    upload: {
      provider: prepared.provider,
      uploadSessionId: prepared.uploadSessionId,
      storageObjectId: completed.storageObject?.id ?? prepared.storageObjectId,
      storageObjectKey: completed.storageObject?.objectKey ?? prepared.objectKey,
      publicUrl: completed.urls?.sourceUrl ?? completed.urls?.previewUrl ?? "",
      sourceUrl: completed.urls?.sourceUrl ?? completed.urls?.previewUrl ?? "",
      mimeType:
        completed.storageObject?.contentType ??
        (file.type || "application/octet-stream"),
      byteSize: completed.storageObject?.sizeBytes ?? file.size,
      originalFileName: file.name,
      eTag: completed.storageObject?.etag ?? uploadResult?.eTag ?? null,
    },
    storageObject: completed.storageObject,
    urls: completed.urls,
    uploadRecord: completed.uploadRecord ?? null,
  };
}

async function resolveCompletedUploadFromSessionStatus(api, prepared, file, uploadResult) {
  if (!uploadResult || !prepared?.uploadSessionId || typeof api.getUploadSession !== "function") {
    return null;
  }
  try {
    const status = await api.getUploadSession(prepared.uploadSessionId);
    if (
      status?.uploadSession?.status !== "uploaded" ||
      status?.storageObject?.status !== "available"
    ) {
      return null;
    }
    return buildUploadFileResult(prepared, file, status, uploadResult);
  } catch {
    return null;
  }
}

function postJson(url, body, options = {}) {
  const {
    cacheInvalidation = "all",
    ...fetchOptions
  } = options;
  return fetchJson(url, {
    ...fetchOptions,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  }).then((result) => {
    if (cacheInvalidation === "project-selection") {
      clearProjectSelectionReadCaches();
    } else {
      clearReadRequestCaches();
    }
    return result;
  });
}

async function* postJsonSse(url, body, options = {}) {
  const response = await fetch(resolveApiUrl(url), {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
      "idempotency-key":
        options.idempotencyKey ??
        buildActionIdempotencyKey(url, body ?? {}),
    },
    body: JSON.stringify(body ?? {}),
    signal: options.signal,
  });
  await assertSseResponse(response);
  yield* readSseResponse(response, options);
}

async function* getSse(url, options = {}) {
  const response = await fetch(resolveApiUrl(url), {
    method: "GET",
    credentials: "include",
    headers: { accept: "text/event-stream", ...(options.headers ?? {}) },
    cache: "no-store",
    signal: options.signal,
  });
  await assertSseResponse(response);
  yield* readSseResponse(response, options);
}

async function assertSseResponse(response) {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = {};
      }
    }
    const normalizedError = normalizeErrorResponse(
      payload,
      `request_failed:${response.status}`,
      text || `request_failed:${response.status}`,
    );
    const error = new Error(normalizedError.message);
    error.status = response.status;
    error.errorCode = normalizedError.errorCode;
    error.details = normalizedError.details;
    error.failure = normalizedError.failure;
    error.noticeType = normalizedError.noticeType;
    error.providerStatus = normalizedError.providerStatus;
    error.providerErrorCode = normalizedError.providerErrorCode;
    error.providerMessage = normalizedError.providerMessage;
    error.requestId = payload.requestId ?? null;
    throw error;
  }
}

async function* readSseResponse(response, options = {}) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    return;
  }
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const event = parseSseMessage(part);
        if (event) {
          yield event;
        }
      }
    }
  } finally {
    if (options.signal?.aborted) {
      await reader.cancel().catch(() => {});
    }
  }
  buffer += decoder.decode();
  const event = parseSseMessage(buffer);
  if (event) {
    yield event;
  }
}

function parseSseMessage(raw) {
  const text = String(raw ?? "").trim();
  if (!text) {
    return null;
  }
  const lines = text.split(/\r?\n/);
  const id = lines.find((line) => line.startsWith("id:"))?.slice(3).trim() || "";
  const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() || "message";
  const dataText = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!dataText) {
    return { event: eventName, data: null, ...(id ? { id } : {}) };
  }
  try {
    const data = JSON.parse(dataText);
    const inferredEventName =
      data && typeof data === "object" && typeof data.type === "string" && data.type.trim()
        ? data.type.trim()
        : eventName;
    return { event: inferredEventName, data, ...(id ? { id } : {}) };
  } catch {
    return { event: eventName, data: dataText, ...(id ? { id } : {}) };
  }
}

export const creatorApiTestHooks = {
  postJsonSse,
  getSse,
};

async function postMultipart(url, formData) {
  const result = await fetchJson(url, {
    method: "POST",
    body: formData,
  });
  clearReadRequestCaches();
  return result;
}

function patchJson(url, body, options = {}) {
  return fetchJson(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    timeoutMs: options.timeoutMs,
  }).then((result) => {
    clearReadRequestCaches();
    return result;
  });
}

function putJson(url, body, options = {}) {
  return fetchJson(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    timeoutMs: options.timeoutMs,
  }).then((result) => {
    clearReadRequestCaches();
    return result;
  });
}

function putJsonKeepalive(url, body) {
  return fetchJson(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    keepalive: true,
  }).then((result) => {
    clearReadRequestCaches();
    return result;
  });
}

function deleteJson(url, body) {
  return fetchJson(url, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  }).then((result) => {
    clearReadRequestCaches();
    return result;
  });
}

function asciiSafeToken(value, fallback = "token") {
  const normalized = String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]+/g, "-")
    .replace(/[^A-Za-z0-9._:-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function buildActionIdempotencyKey(action, input = {}) {
  const actionToken = asciiSafeToken(action, "action");
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${actionToken}:${globalThis.crypto.randomUUID()}`;
  }
  return `${actionToken}:${Date.now()}`;
}

const pendingIdempotencyKeys = new Map();

function pendingIdempotencySignature(url, action, body) {
  return `${String(action ?? url)}:${String(url)}:${JSON.stringify(body ?? {})}`;
}

function resolvePendingIdempotencyKey(url, body, options) {
  if (options.idempotencyKey) {
    return { key: options.idempotencyKey, signature: null };
  }
  const signature = pendingIdempotencySignature(url, options.action, body);
  const existing = pendingIdempotencyKeys.get(signature);
  if (existing) {
    return { key: existing, signature };
  }
  const key = buildActionIdempotencyKey(options.action ?? url, body ?? {});
  pendingIdempotencyKeys.set(signature, key);
  if (pendingIdempotencyKeys.size > 100) {
    pendingIdempotencyKeys.delete(pendingIdempotencyKeys.keys().next().value);
  }
  return { key, signature };
}

function postJsonWithIdempotency(url, body, options = {}) {
  const pending = resolvePendingIdempotencyKey(url, body, options);
  return fetchJson(url, {
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": pending.key,
    },
    body: JSON.stringify(body ?? {}),
  }).then((result) => {
    if (pending.signature) {
      pendingIdempotencyKeys.delete(pending.signature);
    }
    clearReadRequestCaches();
    return result;
  });
}

let cosBrowserSdkPromise = null;

export const defaultUploadLimits = {
  image: {
    label: "图片",
    maxBytes: 20 * 1024 * 1024,
    maxReferencesPerTask: 30,
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
    extensions: [".jpg", ".jpeg", ".png", ".webp", ".avif"],
  },
  video: {
    label: "视频",
    maxBytes: 500 * 1024 * 1024,
    recommendedMaxDurationSeconds: 15 * 60,
    mimeTypes: ["video/mp4", "video/webm", "video/quicktime"],
    extensions: [".mp4", ".webm", ".mov"],
  },
  audio: {
    label: "音频",
    maxBytes: 100 * 1024 * 1024,
    mimeTypes: ["audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a"],
    extensions: [".mp3", ".wav", ".m4a"],
  },
  blockedExtensions: [
    ".7z",
    ".bat",
    ".cmd",
    ".com",
    ".dmg",
    ".exe",
    ".gz",
    ".html",
    ".js",
    ".msi",
    ".ps1",
    ".rar",
    ".sh",
    ".tar",
    ".zip",
  ],
};

function buildUploadId(file, options = {}) {
  return [
    "upload",
    asciiSafeToken(options.projectId ?? options.canvasProjectId ?? "user", "user"),
    asciiSafeToken(options.purpose ?? options.category ?? "misc", "misc"),
    asciiSafeToken(file?.name ?? "file", "file"),
    Number(file?.size ?? 0),
    Number(file?.lastModified ?? 0),
  ].join(":");
}

function extensionOfFileName(fileName) {
  const match = String(fileName ?? "").trim().toLowerCase().match(/(\.[^.\\/]+)$/);
  return match?.[1] ?? "";
}

function normalizeMimeType(value) {
  return String(value ?? "").split(";")[0].trim().toLowerCase();
}

function resolveUploadLimitKind(file, limits = defaultUploadLimits) {
  const mimeType = normalizeMimeType(file?.type);
  const extension = extensionOfFileName(file?.name);
  for (const [kind, rule] of Object.entries(limits ?? {})) {
    if (kind === "blockedExtensions" || !rule || typeof rule !== "object") {
      continue;
    }
    if (
      Array.isArray(rule.mimeTypes) &&
      Array.isArray(rule.extensions) &&
      (rule.mimeTypes.includes(mimeType) || rule.extensions.includes(extension))
    ) {
      return kind;
    }
  }
  return null;
}

export function validateUploadFile(file, limits = defaultUploadLimits) {
  const extension = extensionOfFileName(file?.name);
  const blockedExtensions = Array.isArray(limits?.blockedExtensions)
    ? limits.blockedExtensions
    : defaultUploadLimits.blockedExtensions;
  if (!extension || blockedExtensions.includes(extension)) {
    const error = new Error("不支持上传该文件类型");
    error.errorCode = "upload_type_not_allowed";
    error.details = { extension };
    throw error;
  }
  const kind = resolveUploadLimitKind(file, limits);
  if (!kind) {
    const error = new Error("仅支持图片、视频或音频文件");
    error.errorCode = "upload_type_not_allowed";
    error.details = { extension };
    throw error;
  }
  const rule = limits[kind];
  const mimeType = normalizeMimeType(file?.type || "application/octet-stream");
  if (!rule.mimeTypes.includes(mimeType)) {
    const error = new Error(`${rule.label} MIME 类型不在允许列表中`);
    error.errorCode = "upload_mime_not_allowed";
    error.details = { kind, mimeType };
    throw error;
  }
  const size = Number(file?.size ?? 0);
  if (Number.isFinite(size) && size > rule.maxBytes) {
    const error = new Error(`${rule.label}文件超过上传大小限制`);
    error.errorCode = "upload_file_too_large";
    error.details = { kind, maxBytes: rule.maxBytes, sizeBytes: size };
    throw error;
  }
  return { kind, rule };
}

function buildUploadIdFromInput(input = {}) {
  return [
    "upload",
    asciiSafeToken(input.projectId ?? input.canvasProjectId ?? "user", "user"),
    asciiSafeToken(input.purpose ?? "misc", "misc"),
    asciiSafeToken(input.fileName ?? "file", "file"),
    Number(input.sizeBytes ?? 0),
    asciiSafeToken(input.checksum ?? "nochecksum", "nochecksum"),
  ].join(":");
}

async function loadCosBrowserSdk() {
  if (typeof window === "undefined") {
    throw new Error("cos_browser_only");
  }
  if (window.COS) {
    return window.COS;
  }
  if (!cosBrowserSdkPromise) {
    cosBrowserSdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = resolveApiUrl("/vendor/cos-js-sdk-v5/dist/cos-js-sdk-v5.min.js");
      script.async = true;
      script.onload = () => {
        if (window.COS) {
          resolve(window.COS);
          return;
        }
        reject(new Error("cos_sdk_load_failed"));
      };
      script.onerror = () => reject(new Error("cos_sdk_load_failed"));
      document.head.append(script);
    });
  }
  return cosBrowserSdkPromise;
}

function uploadPreparedFile(prepared, file, options = {}) {
  if (prepared?.upload?.url && shouldUsePreparedUploadProxy(options)) {
    return uploadPreparedFileWithXhr(prepared, file, options);
  }
  if (prepared?.credentials?.tmpSecretId) {
    return uploadPreparedFileWithCos(prepared, file, options);
  }
  if (prepared?.upload?.url) {
    return uploadPreparedFileWithXhr(prepared, file, options);
  }
  throw new Error("upload_target_missing");
}

function shouldUsePreparedUploadProxy(options = {}) {
  if (shouldUseSameOriginUploadProxy()) {
    return true;
  }
  const purpose = String(options.purpose ?? options.category ?? "").trim().toLowerCase();
  return purpose.startsWith("team-assets/");
}

function shouldUseSameOriginUploadProxy() {
  if (typeof window === "undefined") {
    return false;
  }
  const protocol = String(window.location?.protocol ?? "").toLowerCase();
  const hostname = String(window.location?.hostname ?? "").toLowerCase();
  return (
    protocol === "file:" ||
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "::1"
  );
}

async function uploadPreparedFileWithCos(prepared, file, options = {}) {
  const COS = await loadCosBrowserSdk();
  const cos = new COS({
    SecretId: prepared.credentials.tmpSecretId,
    SecretKey: prepared.credentials.tmpSecretKey,
    SecurityToken: prepared.credentials.sessionToken,
    StartTime: prepared.credentials.startTime,
    ExpiredTime: prepared.credentials.expiredTime,
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (options.signal) {
        options.signal.removeEventListener("abort", abortUpload);
      }
      callback(value);
    };
    const abortUpload = () => {
      finish(reject, new Error("upload_aborted"));
    };
    if (options.signal) {
      if (options.signal.aborted) {
        abortUpload();
        return;
      }
      options.signal.addEventListener("abort", abortUpload, { once: true });
    }

    cos.putObject(
      {
        Bucket: prepared.bucket,
        Region: prepared.region,
        Key: prepared.objectKey,
        Body: file,
        onProgress(progress) {
          options.onProgress?.({
            loaded: progress.loaded ?? 0,
            total: progress.total ?? file.size,
            progress: progress.percent ?? 0,
          });
        },
      },
      (error, data) => {
        if (error) {
          finish(reject, error);
          return;
        }
        finish(resolve, {
          eTag: data?.ETag?.replaceAll?.('"', "") ?? data?.ETag ?? null,
        });
      },
    );
  });
}

function uploadPreparedFileWithXhr(prepared, file, options = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(prepared.upload.method ?? "PUT", resolveApiUrl(prepared.upload.url), true);
    xhr.withCredentials = true;
    Object.entries(prepared.upload.headers ?? {}).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return;
      }
      options.onProgress?.({
        loaded: event.loaded,
        total: event.total,
        progress: event.total > 0 ? event.loaded / event.total : 0,
      });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({
          eTag: xhr.getResponseHeader("etag"),
        });
        return;
      }
      let payload = {};
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        payload = {};
      }
      const normalizedError = normalizeErrorResponse(payload, `upload_failed:${xhr.status}`);
      const error = new Error(normalizedError.message);
      error.status = xhr.status;
      error.errorCode = normalizedError.errorCode;
      error.details = normalizedError.details;
      error.failure = normalizedError.failure;
      error.noticeType = normalizedError.noticeType;
      error.providerStatus = normalizedError.providerStatus;
      error.providerErrorCode = normalizedError.providerErrorCode;
      error.providerMessage = normalizedError.providerMessage;
      reject(error);
    };
    xhr.onerror = () => reject(new Error("upload_failed"));
    xhr.onabort = () => reject(new Error("upload_aborted"));
    if (options.signal) {
      if (options.signal.aborted) {
        xhr.abort();
        return;
      }
      options.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(file);
  });
}

export const creatorApi = {
  getSession() {
    const options = arguments[0] ?? {};
    return fetchJsonWithTtl(
      "/api/auth/session",
      options.fresh === true
        ? { cache: "no-store" }
        : {
            cacheKey: "GET /api/auth/session",
            cacheTtlMs: 5 * 60 * 1000,
            silentRefreshOnHit: false,
          },
    );
  },

  getCreditBalance() {
    return fetchJson("/api/auth/credit-balance", {
      cache: "no-store",
      dedupeKey: "GET /api/auth/credit-balance",
      dedupeTtlMs: 1500,
    });
  },

  async updateAccountProfile(input) {
    const result = await patchJson("/api/auth/profile", {
      displayName: String(input?.displayName ?? ""),
    });
    clearFetchJsonCache("GET /api/auth/session");
    return result;
  },

  async changeAccountPassword(input) {
    const result = await postJsonWithIdempotency(
      "/api/auth/password",
      {
        currentPassword: String(input?.currentPassword ?? ""),
        newPassword: String(input?.newPassword ?? ""),
      },
      { action: "auth.password.change" },
    );
    clearFetchJsonCache("GET /api/auth/session");
    return result;
  },

  getInviteSummary() {
    return fetchJson("/api/auth/invite-summary");
  },

  logout() {
    return postJson("/api/auth/logout");
  },

  getCreatorState() {
    return fetchJsonWithTtl("/api/creator/state", {
      cacheKey: "GET /api/creator/state",
      cacheTtlMs: 15000,
    });
  },

  getCreditLedger(options = {}) {
    const page = Number(options.page ?? 1);
    const pageSize = Number(options.pageSize ?? 10);
    const params = new URLSearchParams();
    if (Number.isFinite(page) && page > 0) {
      params.set("page", String(Math.max(1, Math.round(page))));
    }
    if (Number.isFinite(pageSize) && pageSize > 0) {
      params.set("pageSize", String(Math.min(100, Math.round(pageSize))));
    }
    const query = params.toString();
    return fetchJson(`/api/creator/credits/ledger${query ? `?${query}` : ""}`);
  },

  getCommunityBoard() {
    return fetchJsonWithTtl("/api/community", {
      cacheKey: "GET /api/community",
      cacheTtlMs: 300000,
    });
  },

  getAnnouncements() {
    return fetchJson("/api/announcements", { dedupeKey: "GET /api/announcements" });
  },

  getToolboxPromptReverseModels(options = {}) {
    return fetchJsonWithTtl("/api/toolbox/prompt-reverse/models", {
      cacheKey: "GET /api/toolbox/prompt-reverse/models",
      cacheTtlMs: Number.isFinite(options.cacheTtlMs) ? options.cacheTtlMs : 30000,
      cache: options.fresh === true ? "no-store" : undefined,
    });
  },

  runToolboxPromptReverse(input = {}) {
    return postJsonWithIdempotency("/api/toolbox/prompt-reverse", input, {
      action: "toolbox.prompt-reverse",
      timeoutMs: 600000,
    });
  },

  checkToolboxVideoDepthPlugin() {
    return fetchToolboxVideoDepthPlugin("health", { timeoutMs: 2500 });
  },

  createToolboxVideoDepthJob(file) {
    const formData = new FormData();
    formData.set("file", file);
    return fetchToolboxVideoDepthPlugin("jobs", {
      method: "POST",
      body: formData,
      timeoutMs: 120000,
    });
  },

  getToolboxVideoDepthJob(jobId) {
    return fetchToolboxVideoDepthPlugin(`jobs/${encodeURIComponent(jobId)}`, { timeoutMs: 10000 });
  },

  getToolboxVideoDepthOutputUrl(jobId) {
    return resolveToolboxVideoDepthPluginUrl(`jobs/${encodeURIComponent(jobId)}/output`);
  },

  async getCustomerSupportConfig() {
    const response = await fetchJsonWithTtl("/api/public/customer-support", {
      cacheKey: "GET /api/public/customer-support",
      cacheTtlMs: 30000,
    });
    return response?.data && typeof response.data === "object" ? response.data : response;
  },

  submitCommunityFeedback(input) {
    return postJson("/api/community/feedback", input);
  },

  submitCommunityFeature(input) {
    return postJson("/api/community/features", input);
  },

  voteCommunityFeature(featureId) {
    return postJson(`/api/community/features/${encodeURIComponent(featureId)}/vote`, {});
  },

  getTeamOverview() {
    return fetchJsonWithTtl("/api/creator/team/overview", {
      cacheKey: "GET /api/creator/team/overview",
      cacheTtlMs: 30000,
    });
  },

  getTeamMembers() {
    return fetchJsonWithTtl("/api/creator/team/members", {
      cacheKey: "GET /api/creator/team/members",
      cacheTtlMs: 30000,
    });
  },

  getTeamMemberAssignableResources(input = {}) {
    const type = String(input.type ?? "").trim();
    const page = Number(input.page ?? 1);
    const pageSize = Number(input.pageSize ?? 10);
    const params = new URLSearchParams();
    if (type) {
      params.set("type", type);
    }
    params.set("page", String(Number.isFinite(page) && page > 0 ? Math.floor(page) : 1));
    params.set("pageSize", String(Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 10));
    const path = `/api/creator/team/assignable-resources?${params.toString()}`;
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 30000,
    });
  },

  createTeamMember(input) {
    return postJsonWithIdempotency("/api/creator/team/members", input, {
      action: "team.member.create",
    });
  },

  updateTeamMember(memberId, input) {
    return patchJson(`/api/creator/team/members/${encodeURIComponent(memberId)}`, input);
  },

  createProject(input) {
    return postJsonWithIdempotency("/api/creator/project/create", input, {
      action: "project.create",
    });
  },

  getProjects(input = {}) {
    const params = new URLSearchParams();
    const page = Number(input.page ?? 1);
    params.set("page", String(Number.isFinite(page) && page > 0 ? Math.floor(page) : 1));
    const pageSize = Number(input.pageSize ?? 18);
    params.set("pageSize", String(Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 18));
    const keyword = String(input.keyword ?? "").trim();
    if (keyword) {
      params.set("keyword", keyword);
    }
    const query = params.toString();
    const path = `/api/creator/projects?${query}`;
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 30000,
    });
  },

  getCanvasProjects(input = {}) {
    const path = input.includeDeleted === true
      ? "/api/creator/canvases?includeDeleted=true"
      : "/api/creator/canvases";
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 60000,
    });
  },

  // Standalone Canvas aliases keep the new in-app host independent from the
  // historical production-workbench naming while sharing the same contracts.
  listCanvases(input = {}) {
    return this.getCanvasProjects(input);
  },

  createCanvasProject(input) {
    return postJsonWithIdempotency("/api/creator/canvases", input, {
      action: "canvas-project.create",
    });
  },

  createCanvas(input) {
    return this.createCanvasProject(input);
  },

  updateCanvasProject(projectId, input) {
    return patchJson(`/api/creator/canvases/${encodeURIComponent(projectId)}`, input);
  },

  deleteCanvasProject(projectId) {
    return deleteJson(`/api/creator/canvases/${encodeURIComponent(projectId)}`);
  },

  getCanvas(canvasProjectId) {
    return fetchJson(
      `/api/creator/canvases/${encodeURIComponent(canvasProjectId)}`,
      { cache: "no-store" },
    );
  },

  restoreCanvas(canvasProjectId, options = {}) {
    return postJsonWithIdempotency(
      `/api/creator/canvases/${encodeURIComponent(canvasProjectId)}/restore`,
      {},
      {
        action: "canvas.restore",
        idempotencyKey: options.idempotencyKey,
      },
    );
  },

  getStandaloneCanvas(canvasProjectId) {
    const path = `/api/creator/canvases/${encodeURIComponent(canvasProjectId)}/document`;
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 30000,
    });
  },

  getCanvasDocument(canvasProjectId) {
    return this.getStandaloneCanvas(canvasProjectId);
  },

  saveStandaloneCanvas(canvasProjectId, input, options = {}) {
    return putJson(`/api/creator/canvases/${encodeURIComponent(canvasProjectId)}/document`, input, options);
  },

  saveCanvasDocument(canvasProjectId, input) {
    return this.saveStandaloneCanvas(canvasProjectId, input);
  },

  saveCanvasNodePositions(canvasProjectId, input, options = {}) {
    return patchJson(`/api/creator/canvases/${encodeURIComponent(canvasProjectId)}/positions`, input, options);
  },

  listToolPresets() {
    return fetchJsonWithTtl("/api/creator/tool-presets?includeArchived=true", {
      cacheKey: "GET /api/creator/tool-presets?includeArchived=true",
      cacheTtlMs: 30000,
    });
  },

  getToolPreset(presetId) {
    return fetchJson(
      `/api/creator/tool-presets/${encodeURIComponent(presetId)}`,
      { cache: "no-store" },
    );
  },

  createToolPreset(input, options = {}) {
    return postJsonWithIdempotency("/api/creator/tool-presets", input, {
      action: "canvas.tool-preset.create",
      idempotencyKey: options.idempotencyKey,
      signal: options.signal,
    });
  },

  updateToolPreset(presetId, input) {
    return patchJson(`/api/creator/tool-presets/${encodeURIComponent(presetId)}`, input);
  },

  deleteToolPreset(presetId) {
    return deleteJson(`/api/creator/tool-presets/${encodeURIComponent(presetId)}`);
  },

  duplicateToolPreset(presetId, input = {}, options = {}) {
    return postJsonWithIdempotency(
      `/api/creator/tool-presets/${encodeURIComponent(presetId)}/duplicate`,
      input,
      {
        action: "canvas.tool-preset.duplicate",
        idempotencyKey: options.idempotencyKey,
        signal: options.signal,
      },
    );
  },

  listToolPresetVersions(presetId) {
    return fetchJson(
      `/api/creator/tool-presets/${encodeURIComponent(presetId)}/versions`,
      { cache: "no-store" },
    );
  },

  getToolPresetVersion(presetId, versionNumber) {
    return fetchJson(
      `/api/creator/tool-presets/${encodeURIComponent(presetId)}/versions/${encodeURIComponent(versionNumber)}`,
      { cache: "no-store" },
    );
  },

  getCanvasHead(canvasProjectId) {
    return fetchJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/head`,
      { cache: "no-store" },
    );
  },

  streamCanvasLive(canvasProjectId, input = {}) {
    const lastEventId = String(input.lastEventId ?? "").trim();
    return getSse(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/live`,
      {
        signal: input.signal,
        headers: lastEventId ? { "last-event-id": lastEventId } : {},
      },
    );
  },

  reportCanvasFrontendError(canvasProjectId, input = {}) {
    return postJson(`/api/canvas/${encodeURIComponent(canvasProjectId)}/telemetry/frontend-errors`, {
      kind: String(input.kind ?? "error").slice(0, 40),
      component: "new-canvas",
    });
  },

  getCanvasSession(canvasProjectId) {
    return fetchJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/session`,
      { cache: "no-store" },
    );
  },

  saveCanvasSession(canvasProjectId, input = {}) {
    return putJsonKeepalive(`/api/canvas/${encodeURIComponent(canvasProjectId)}/session`, input);
  },

  listCanvasRevisions(canvasProjectId, input = {}) {
    const requestedLimit = Number(input.limit ?? 50);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, Math.floor(requestedLimit)))
      : 50;
    const beforeRevision = Number(input.beforeRevision);
    const cursor = Number.isFinite(beforeRevision) && beforeRevision > 0
      ? `&beforeRevision=${Math.trunc(beforeRevision)}`
      : "";
    return fetchJson(
      `/api/creator/canvases/${encodeURIComponent(canvasProjectId)}/revisions?limit=${limit}${cursor}`,
      { cache: "no-store" },
    );
  },

  getCanvasRevision(canvasProjectId, revisionId) {
    return fetchJson(
      `/api/creator/canvases/${encodeURIComponent(canvasProjectId)}/revisions/${encodeURIComponent(revisionId)}`,
      { cache: "no-store" },
    );
  },

  runCanvasNode(canvasProjectId, nodeKey, input, options = {}) {
    return postJsonWithIdempotency(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/nodes/${encodeURIComponent(nodeKey)}/run`,
      input,
      {
        action: "canvas.node.run",
        idempotencyKey: options.idempotencyKey,
        signal: options.signal,
        timeoutMs: 60000,
      },
    );
  },

  runCanvasTextNodeStream(canvasProjectId, nodeKey, input, options = {}) {
    return postJsonSse(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/nodes/${encodeURIComponent(nodeKey)}/run?stream=1`,
      input,
      {
        idempotencyKey: options.idempotencyKey,
        signal: options.signal,
      },
    );
  },

  runCanvas(canvasProjectId, nodeKey, input, options = {}) {
    return this.runCanvasNode(canvasProjectId, nodeKey, input, options);
  },

  listCanvasNodeRuns(canvasProjectId, nodeKey) {
    return fetchJson(`/api/canvas/${encodeURIComponent(canvasProjectId)}/nodes/${encodeURIComponent(nodeKey)}/runs`);
  },

  listCanvasRuns(canvasProjectId, nodeKey) {
    return this.listCanvasNodeRuns(canvasProjectId, nodeKey);
  },

  createCanvasGenerationBatch(canvasProjectId, input, options = {}) {
    return postJsonWithIdempotency(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/generation-batches`,
      input,
      { action: "canvas.batch.create", idempotencyKey: options.idempotencyKey, signal: options.signal },
    );
  },

  getCanvasGenerationBatch(canvasProjectId, batchId) {
    return fetchJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/generation-batches/${encodeURIComponent(batchId)}`,
      { cache: "no-store" },
    );
  },

  reconcileCanvasGenerationBatch(canvasProjectId, batchId) {
    return postJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/generation-batches/${encodeURIComponent(batchId)}/reconcile`,
      {},
    );
  },

  cancelCanvasGenerationBatch(canvasProjectId, batchId) {
    return postJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/generation-batches/${encodeURIComponent(batchId)}/cancel`,
      {},
    );
  },

  listCanvasGenerationHistory(canvasProjectId, input = {}) {
    const params = new URLSearchParams();
    for (const key of ["nodeKey", "status", "mediaKind", "search", "cursor", "limit", "format"]) {
      if (input[key] != null && input[key] !== "") params.set(key, String(input[key]));
    }
    const query = params.toString();
    return fetchJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/generation-history${query ? `?${query}` : ""}`,
      { cache: "no-store" },
    );
  },

  exportCanvasGenerationHistory(canvasProjectId, input = {}) {
    return this.listCanvasGenerationHistory(canvasProjectId, { ...input, format: "json" });
  },

  deleteCanvasGenerationRun(canvasProjectId, runId) {
    return deleteJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/generation-history/${encodeURIComponent(runId)}`,
    );
  },

  deleteCanvasGenerationHistory(canvasProjectId, input) {
    return deleteJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/generation-history`,
      input,
    );
  },

  updateCanvasArtifactTags(canvasProjectId, artifactId, input = {}) {
    return patchJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/artifacts/${encodeURIComponent(artifactId)}/tags`,
      input,
    );
  },

  getCanvasSettings(canvasProjectId) {
    return fetchJson(`/api/canvas/${encodeURIComponent(canvasProjectId)}/settings`, { cache: "no-store" });
  },

  updateCanvasSettings(canvasProjectId, input) {
    return patchJson(`/api/canvas/${encodeURIComponent(canvasProjectId)}/settings`, input);
  },

  materializeCanvasStyleReferenceAsset(canvasProjectId, input) {
    return postJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/style-reference-assets`,
      input,
    );
  },

  importCanvasStyleReferenceAsset(canvasProjectId, input) {
    return postJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/style-reference-assets/import`,
      input,
    );
  },

  listCanvasCharacters(canvasProjectId, input = {}) {
    const params = new URLSearchParams();
    for (const key of ["scope", "limit"]) {
      if (input[key] != null && input[key] !== "") params.set(key, String(input[key]));
    }
    const query = params.toString();
    return fetchJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/characters${query ? `?${query}` : ""}`,
      { cache: "no-store" },
    );
  },

  getCanvasCharacter(canvasProjectId, characterId) {
    return fetchJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/characters/${encodeURIComponent(characterId)}`,
      { cache: "no-store" },
    );
  },

  createCanvasCharacter(canvasProjectId, input) {
    return postJson(`/api/canvas/${encodeURIComponent(canvasProjectId)}/characters`, input);
  },

  updateCanvasCharacter(canvasProjectId, characterId, input) {
    return patchJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/characters/${encodeURIComponent(characterId)}`,
      input,
    );
  },

  deleteCanvasCharacter(canvasProjectId, characterId, input) {
    return deleteJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/characters/${encodeURIComponent(characterId)}`,
      input,
    );
  },

  copyCanvasCharacter(canvasProjectId, characterId, input) {
    return postJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/characters/${encodeURIComponent(characterId)}/copy`,
      input,
    );
  },

  addCanvasCharacterReference(canvasProjectId, characterId, input) {
    return postJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/characters/${encodeURIComponent(characterId)}/references`,
      input,
    );
  },

  updateCanvasCharacterReference(canvasProjectId, characterId, referenceId, input) {
    return patchJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/characters/${encodeURIComponent(characterId)}/references/${encodeURIComponent(referenceId)}`,
      input,
    );
  },

  deleteCanvasCharacterReference(canvasProjectId, characterId, referenceId, input) {
    return deleteJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/characters/${encodeURIComponent(characterId)}/references/${encodeURIComponent(referenceId)}`,
      input,
    );
  },

  registerCanvasUploadFingerprint(canvasProjectId, input) {
    return postJson(`/api/canvas/${encodeURIComponent(canvasProjectId)}/uploads/fingerprint`, input);
  },

  getCanvasStorageHealth(canvasProjectId) {
    return fetchJson(`/api/canvas/${encodeURIComponent(canvasProjectId)}/storage-health`, { cache: "no-store" });
  },

  getCanvasAssetReferences(canvasProjectId, input = {}) {
    const params = new URLSearchParams();
    for (const key of ["storageObjectId", "assetId", "assetVersionId"]) {
      if (input[key]) params.set(key, String(input[key]));
    }
    return fetchJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/asset-references?${params}`,
      { cache: "no-store" },
    );
  },

  selectCanvasNodeArtifact(canvasProjectId, artifactId, input = {}) {
    return postJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/artifacts/${encodeURIComponent(artifactId)}/select`,
      input,
    );
  },

  appendCanvasDirectorArtifact(canvasProjectId, nodeKey, input = {}) {
    return postJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/nodes/${encodeURIComponent(nodeKey)}/director-artifacts`,
      input,
    );
  },

  createDirectorDesk(input = {}) {
    return postJson("/api/director-desks", input);
  },

  listDirectorDesks() {
    return fetchJson("/api/director-desks", { cache: "no-store" });
  },

  listCanvasAgentEvents(canvasProjectId, taskId, input = {}) {
    const after = Number(input.after ?? 0);
    const limit = Number(input.limit ?? 200);
    const params = new URLSearchParams({
      after: String(Number.isFinite(after) ? Math.max(0, Math.trunc(after)) : 0),
      limit: String(Number.isFinite(limit) ? Math.min(1000, Math.max(1, Math.trunc(limit))) : 200),
    });
    return fetchJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/agent-tasks/${encodeURIComponent(taskId)}/events?${params}`,
      { cache: "no-store" },
    );
  },

  streamCanvasAgentEvents(canvasProjectId, taskId, input = {}) {
    const after = Number(input.after ?? 0);
    const limit = Number(input.limit ?? 200);
    const cursor = Number.isFinite(after) ? Math.max(0, Math.trunc(after)) : 0;
    const params = new URLSearchParams({
      live: "1",
      limit: String(Number.isFinite(limit) ? Math.min(1000, Math.max(1, Math.trunc(limit))) : 200),
    });
    return getSse(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/agent-tasks/${encodeURIComponent(taskId)}/events?${params}`,
      {
        signal: input.signal,
        headers: cursor > 0 ? { "last-event-id": String(cursor) } : {},
      },
    );
  },

  listCanvasAgentModels(canvasProjectId) {
    return fetchJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/agent-models`,
      { cache: "no-store" },
    );
  },

  createCanvasAgentConversation(canvasProjectId, input = {}) {
    return postJson(`/api/canvas/${encodeURIComponent(canvasProjectId)}/conversations`, input);
  },

  listCanvasAgentConversations(canvasProjectId, input = {}) {
    const params = new URLSearchParams();
    if (input.limit != null) params.set("limit", String(input.limit));
    const query = params.toString();
    return fetchJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/conversations${query ? `?${query}` : ""}`,
      { cache: "no-store" },
    );
  },

  updateCanvasAgentConversation(canvasProjectId, input = {}) {
    return patchJson(`/api/canvas/${encodeURIComponent(canvasProjectId)}/conversations`, input);
  },

  deleteCanvasAgentConversation(canvasProjectId, conversationId) {
    return fetchJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/conversations?conversationId=${encodeURIComponent(conversationId)}`,
      { method: "DELETE" },
    );
  },

  sendCanvasAgentMessage(canvasProjectId, conversationId, input = {}) {
    return postJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
      input,
    );
  },

  listCanvasAgentMessages(canvasProjectId, conversationId, input = {}) {
    const limit = Number(input.limit ?? 200);
    const params = new URLSearchParams({
      limit: String(Number.isFinite(limit) ? Math.min(500, Math.max(1, Math.trunc(limit))) : 200),
    });
    return fetchJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/conversations/${encodeURIComponent(conversationId)}/messages?${params}`,
      { cache: "no-store" },
    );
  },

  listCanvasAgentFileGrants(canvasProjectId, conversationId, input = {}) {
    const params = new URLSearchParams();
    if (input.includeInactive === true) params.set("includeInactive", "true");
    const query = params.toString();
    return fetchJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/conversations/${encodeURIComponent(conversationId)}/file-grants${query ? `?${query}` : ""}`,
      { cache: "no-store" },
    );
  },

  createCanvasAgentFileGrant(canvasProjectId, conversationId, input = {}) {
    return postJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/conversations/${encodeURIComponent(conversationId)}/file-grants`,
      input,
    );
  },

  revokeCanvasAgentFileGrant(canvasProjectId, conversationId, grantId) {
    return fetchJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/conversations/${encodeURIComponent(conversationId)}/file-grants/${encodeURIComponent(grantId)}`,
      { method: "DELETE" },
    );
  },

  listCanvasAgentMemories(canvasProjectId, conversationId, input = {}) {
    const params = new URLSearchParams();
    if (input.includeInactive === true) params.set("includeInactive", "true");
    if (input.category) params.set("category", String(input.category));
    if (input.source) params.set("source", String(input.source));
    const query = params.toString();
    return fetchJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/conversations/${encodeURIComponent(conversationId)}/memories${query ? `?${query}` : ""}`,
      { cache: "no-store" },
    );
  },

  updateCanvasAgentMemory(canvasProjectId, conversationId, memoryId, input = {}) {
    return patchJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/conversations/${encodeURIComponent(conversationId)}/memories/${encodeURIComponent(memoryId)}`,
      input,
    );
  },

  deleteCanvasAgentMemory(canvasProjectId, conversationId, memoryId) {
    return fetchJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/conversations/${encodeURIComponent(conversationId)}/memories/${encodeURIComponent(memoryId)}`,
      { method: "DELETE" },
    );
  },

  controlCanvasAgentTask(canvasProjectId, taskId, action, input = {}) {
    return postJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/agent-tasks/${encodeURIComponent(taskId)}/${encodeURIComponent(action)}`,
      input,
    );
  },

  rewindCanvasAgentTask(canvasProjectId, taskId, input = {}) {
    return postJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/agent-tasks/${encodeURIComponent(taskId)}/rewind`,
      input,
    );
  },

  listCanvasUserConfigs(input = {}) {
    const params = new URLSearchParams();
    if (input.type) params.set("type", String(input.type));
    if (input.includeArchived) params.set("includeArchived", "true");
    if (input.limit != null) params.set("limit", String(input.limit));
    const query = params.toString();
    return fetchJson(`/api/canvas-library/configs${query ? `?${query}` : ""}`, { cache: "no-store" });
  },

  createCanvasUserConfig(input) {
    return postJson("/api/canvas-library/configs", input);
  },

  getCanvasUserConfig(configId, input = {}) {
    const params = new URLSearchParams();
    if (input.versionId) params.set("versionId", String(input.versionId));
    if (input.type) params.set("type", String(input.type));
    const query = params.toString();
    return fetchJson(
      `/api/canvas-library/configs/${encodeURIComponent(configId)}${query ? `?${query}` : ""}`,
      { cache: "no-store" },
    );
  },

  listCanvasUserConfigVersions(configId, input = {}) {
    const params = new URLSearchParams();
    if (input.limit != null) params.set("limit", String(input.limit));
    const query = params.toString();
    return fetchJson(
      `/api/canvas-library/configs/${encodeURIComponent(configId)}/versions${query ? `?${query}` : ""}`,
      { cache: "no-store" },
    );
  },

  createCanvasUserConfigVersion(configId, input) {
    return postJson(`/api/canvas-library/configs/${encodeURIComponent(configId)}/versions`, input);
  },

  archiveCanvasUserConfig(configId) {
    return deleteJson(`/api/canvas-library/configs/${encodeURIComponent(configId)}`);
  },

  startCanvasMediaDerivation(canvasProjectId, input) {
    return postJson(`/api/canvas/${encodeURIComponent(canvasProjectId)}/derivations`, input);
  },

  getCanvasMediaDerivation(canvasProjectId, derivationId) {
    return fetchJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/derivations/${encodeURIComponent(derivationId)}`,
      { cache: "no-store" },
    );
  },

  attachCanvasMediaDerivationTask(canvasProjectId, derivationId, taskId) {
    return postJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/derivations/${encodeURIComponent(derivationId)}/attach-task`,
      { taskId },
    );
  },

  completeCanvasMediaDerivation(canvasProjectId, derivationId, input) {
    return postJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/derivations/${encodeURIComponent(derivationId)}/complete`,
      input,
    );
  },

  failCanvasMediaDerivation(canvasProjectId, derivationId, input) {
    return postJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/derivations/${encodeURIComponent(derivationId)}/fail`,
      input,
    );
  },

  createCanvasImageBatchGroup(canvasProjectId, input) {
    return postJson(`/api/canvas/${encodeURIComponent(canvasProjectId)}/image-batch-groups`, input);
  },

  getCanvasImageBatchGroup(canvasProjectId, groupId) {
    return fetchJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/image-batch-groups/${encodeURIComponent(groupId)}`,
      { cache: "no-store" },
    );
  },

  selectCanvasImageBatchArtifact(canvasProjectId, groupId, input) {
    return postJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/image-batch-groups/${encodeURIComponent(groupId)}/select`,
      input,
    );
  },

  createCanvasAnnotationLayer(canvasProjectId, input) {
    return postJson(`/api/canvas/${encodeURIComponent(canvasProjectId)}/annotation-layers`, input);
  },

  listCanvasAnnotationLayers(canvasProjectId, input = {}) {
    const params = new URLSearchParams();
    if (input.nodeKey) params.set("nodeKey", String(input.nodeKey));
    if (input.includeInactive === true) params.set("includeInactive", "true");
    if (input.limit != null) params.set("limit", String(input.limit));
    const query = params.toString();
    return fetchJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/annotation-layers${query ? `?${query}` : ""}`,
      { cache: "no-store" },
    );
  },

  startCanvasCardSnapshot(canvasProjectId, input) {
    return postJson(`/api/canvas/${encodeURIComponent(canvasProjectId)}/card-snapshots`, input);
  },

  getCanvasCardSnapshot(canvasProjectId, input = {}) {
    const params = new URLSearchParams();
    if (input.canvasRevision != null) params.set("canvasRevision", String(input.canvasRevision));
    const query = params.toString();
    return fetchJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/card-snapshots${query ? `?${query}` : ""}`,
      { cache: "no-store" },
    );
  },

  selectCanvasArtifact(canvasProjectId, artifactId, input = {}) {
    return this.selectCanvasNodeArtifact(canvasProjectId, artifactId, input);
  },

  getUserScripts(input = {}) {
    const params = new URLSearchParams();
    if (input.page != null) params.set("page", String(input.page));
    if (input.pageSize != null) params.set("pageSize", String(input.pageSize));
    const query = params.toString();
    const path = `/api/creator/scripts${query ? `?${query}` : ""}`;
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 30000,
    });
  },

  getProjectDetail(projectId) {
    const path = `/api/creator/projects/${encodeURIComponent(projectId)}/detail`;
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 30000,
    });
  },

  getProjectDetailV2(projectId) {
    const path = `/api/projects/${encodeURIComponent(projectId)}/detail`;
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 30000,
    });
  },

  selectProject(input) {
    return postJson("/api/creator/project/select", input, {
      cacheInvalidation: "project-selection",
    });
  },

  updateProject(input) {
    return patchJson("/api/creator/project", input);
  },

  deleteProject(input) {
    return deleteJson("/api/creator/project", input);
  },

  updateProjectCover(input) {
    return postJson("/api/creator/project/cover", input);
  },

  parseScript() {
    return postJsonWithIdempotency("/api/creator/parse", {}, {
      action: "project.parse",
    });
  },

  confirmAsset(input) {
    return postJson("/api/creator/assets/confirm", input);
  },

  confirmAllAssets() {
    return postJson("/api/creator/assets/confirm-all");
  },

  updateAssetLabel(input) {
    return postJson("/api/creator/assets/update-label", input);
  },

  getAssetLibrary(projectId = null) {
    const normalizedProjectId = String(projectId ?? "").trim();
    const path = normalizedProjectId
      ? `/api/creator/assets/library?projectId=${encodeURIComponent(normalizedProjectId)}`
      : "/api/creator/assets/library";
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 60000,
    });
  },

  getLibraryAssets(input = {}) {
    const params = new URLSearchParams();
    if (input.scope) {
      params.set("scope", input.scope);
    }
    const hasSearchQuery = String(input.query ?? "").trim().length > 0;
    if (input.category && !hasSearchQuery) {
      params.set("category", input.category);
    }
    if (input.folder && !hasSearchQuery) {
      params.set("folder", input.folder);
    }
    if (input.query) {
      params.set("q", input.query);
    }
    const query = params.toString();
    const path = `/api/creator/library/assets${query ? `?${query}` : ""}`;
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 60000,
    });
  },

  getAgentAssets(input = {}) {
    const params = new URLSearchParams();
    if (input.includeArchived) params.set("includeArchived", "true");
    const query = params.toString();
    const path = `/api/creator/agent-assets${query ? `?${query}` : ""}`;
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 30000,
    });
  },

  createAgentAsset(input = {}) {
    return postJson("/api/creator/agent-assets", input).then((result) => {
      clearReadRequestCaches();
      return result;
    });
  },

  updateAgentAsset(assetId, input = {}) {
    return patchJson(`/api/creator/agent-assets/${encodeURIComponent(assetId)}`, input);
  },

  deleteAgentAsset(assetId) {
    return deleteJson(`/api/creator/agent-assets/${encodeURIComponent(assetId)}`);
  },

  getBrandKits() {
    const path = "/api/creator/brand-kits";
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 30000,
    });
  },

  getBrandKit(kitId) {
    const path = `/api/creator/brand-kits/${encodeURIComponent(kitId)}`;
    return fetchJson(path, { dedupeKey: `GET ${path}` });
  },

  createBrandKit(input = {}) {
    return postJson("/api/creator/brand-kits", input).then((result) => {
      clearReadRequestCaches();
      return result;
    });
  },

  updateBrandKit(kitId, input = {}) {
    return patchJson(`/api/creator/brand-kits/${encodeURIComponent(kitId)}`, input);
  },

  duplicateBrandKit(kitId) {
    return postJson(`/api/creator/brand-kits/${encodeURIComponent(kitId)}/duplicate`, {}).then((result) => {
      clearReadRequestCaches();
      return result;
    });
  },

  deleteBrandKit(kitId) {
    return deleteJson(`/api/creator/brand-kits/${encodeURIComponent(kitId)}`);
  },

  createBrandKitAsset(kitId, input = {}) {
    return postJson(`/api/creator/brand-kits/${encodeURIComponent(kitId)}/assets`, input).then((result) => {
      clearReadRequestCaches();
      return result;
    });
  },

  updateBrandKitAsset(kitId, assetId, input = {}) {
    return patchJson(`/api/creator/brand-kits/${encodeURIComponent(kitId)}/assets/${encodeURIComponent(assetId)}`, input);
  },

  deleteBrandKitAsset(kitId, assetId) {
    return deleteJson(`/api/creator/brand-kits/${encodeURIComponent(kitId)}/assets/${encodeURIComponent(assetId)}`);
  },

  getProjectBrandKit(projectId) {
    const path = `/api/creator/projects/${encodeURIComponent(projectId)}/brand-kit`;
    return fetchJson(path, { dedupeKey: `GET ${path}` });
  },

  updateProjectBrandKit(projectId, input = {}) {
    return patchJson(`/api/creator/projects/${encodeURIComponent(projectId)}/brand-kit`, input);
  },

  uploadTeamAsset(file, input = {}) {
    const formData = new FormData();
    formData.set("file", file);
    formData.set("category", input.category ?? "character");
    formData.set("assetName", input.assetName ?? file?.name?.replace?.(/\.[^.]+$/, "") ?? "未命名资产");
    if (input.assetPrompt) {
      formData.set("assetPrompt", input.assetPrompt);
    }
    return postMultipart("/api/creator/team-assets/upload", formData);
  },

  updateTeamAsset(assetId, input = {}) {
    return patchJson(`/api/creator/team-assets/${encodeURIComponent(assetId)}`, input);
  },

  importProjectAssetToTeamLibrary(input = {}) {
    return postJson("/api/creator/team-assets/import-project-asset", input);
  },

  replaceTeamAssetFile(assetId, file, input = {}) {
    const formData = new FormData();
    formData.set("file", file);
    if (input.name) {
      formData.set("assetName", input.name);
    }
    if (input.prompt !== undefined) {
      formData.set("assetPrompt", input.prompt);
    }
    return postMultipart(`/api/creator/team-assets/${encodeURIComponent(assetId)}/upload`, formData);
  },

  deleteTeamAsset(assetId) {
    return deleteJson(`/api/creator/team-assets/${encodeURIComponent(assetId)}`, {});
  },

  getPersonalMediaLibrarySummary(input = {}) {
    const params = new URLSearchParams();
    if (input.media) {
      params.set("media", input.media);
    }
    if (input.range) {
      params.set("range", input.range);
    }
    const keyword = String(input.keyword ?? "").trim();
    if (keyword) {
      params.set("keyword", keyword);
    }
    const query = params.toString();
    const path = `/api/creator/media-library/summary${query ? `?${query}` : ""}`;
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 30000,
    });
  },

  getPersonalMediaLibrary(input = {}) {
    const params = new URLSearchParams();
    if (input.media) {
      params.set("media", input.media);
    }
    if (input.range) {
      params.set("range", input.range);
    }
    const keyword = String(input.keyword ?? "").trim();
    if (keyword) {
      params.set("keyword", keyword);
    }
    const page = Number(input.page ?? 1);
    params.set("page", String(Number.isFinite(page) && page > 0 ? Math.floor(page) : 1));
    const pageSize = Number(input.pageSize ?? 12);
    params.set("pageSize", String(Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 12));
    const query = params.toString();
    const path = `/api/creator/media-library${query ? `?${query}` : ""}`;
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 30000,
    });
  },

  updateProjectAsset(assetId, input) {
    return patchJson(`/api/creator/assets/${encodeURIComponent(assetId)}`, input);
  },

  deleteProjectAsset(assetId) {
    return deleteJson(`/api/creator/assets/${encodeURIComponent(assetId)}`);
  },

  prepareUpload(input, options = {}) {
    const fallbackIdempotencyKey = options.file
      ? buildUploadId(options.file, {
          projectId: input?.projectId ?? null,
          canvasProjectId: input?.canvasProjectId ?? null,
          purpose: input?.purpose ?? null,
        })
      : buildUploadIdFromInput(input);
    return fetchJson("/api/storage/upload-sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": options.idempotencyKey ?? fallbackIdempotencyKey,
      },
      body: JSON.stringify(input ?? {}),
    }).then((result) => {
      clearReadRequestCaches();
      return result;
    });
  },

  completeUpload(uploadSessionId, input, options = {}) {
    return postJson(
      `/api/storage/upload-sessions/${encodeURIComponent(uploadSessionId)}/complete`,
      input,
      options,
    );
  },

  abortUpload(uploadSessionId) {
    return postJson(`/api/storage/upload-sessions/${encodeURIComponent(uploadSessionId)}/abort`, {});
  },

  getUploadSession(uploadSessionId) {
    return fetchJson(
      `/api/storage/upload-sessions/${encodeURIComponent(uploadSessionId)}`,
      { cache: "no-store" },
    );
  },

  async uploadFile(file, options = {}) {
    validateUploadFile(file, options.uploadLimits ?? defaultUploadLimits);
    return this.prepareUpload(
      {
        projectId: options.projectId ?? null,
        canvasProjectId: options.canvasProjectId ?? null,
        purpose: options.purpose ?? options.category ?? "misc",
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        multipart: false,
      },
      {
        idempotencyKey: options.idempotencyKey ?? buildUploadId(file, options),
        file,
      },
    ).then(async (prepared) => {
      let uploadResult = null;
      try {
        uploadResult = await uploadPreparedFile(prepared, file, {
          onProgress: options.onProgress,
          signal: options.signal,
          purpose: options.purpose ?? options.category ?? "misc",
        });
        let completed;
        try {
          completed = await completeUploadWithRetry(
            this,
            prepared.uploadSessionId,
            {
              eTag: uploadResult?.eTag ?? null,
            },
            {
              timeoutMs: uploadCompletionTimeoutMs,
            },
          );
        } catch (error) {
          const recovered = await resolveCompletedUploadFromSessionStatus(
            this,
            prepared,
            file,
            uploadResult,
          );
          if (recovered) {
            return recovered;
          }
          throw error;
        }
        return buildUploadFileResult(prepared, file, completed, uploadResult);
      } catch (error) {
        if (!uploadResult && prepared?.uploadSessionId) {
          try {
            await this.abortUpload(prepared.uploadSessionId);
          } catch {
            // Keep the original upload failure as the surfaced error.
          }
        }
        throw error;
      }
    });
  },

  importAsset(input) {
    return postJson("/api/creator/assets/import", input);
  },

  getAssetVersions(assetId) {
    const path = `/api/creator/assets/versions/${encodeURIComponent(assetId)}`;
    return fetchJson(path, { dedupeKey: `GET ${path}` });
  },

  getProjectEpisodes(projectId) {
    const path = `/api/creator/projects/${encodeURIComponent(projectId)}/episodes`;
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 30000,
    });
  },

  getScriptReaderSections(scriptId) {
    const path = `/api/creator/scripts/${encodeURIComponent(scriptId)}/sections`;
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 30000,
    });
  },

  createScriptReaderSection(scriptId, input) {
    return postJson(
      `/api/creator/scripts/${encodeURIComponent(scriptId)}/sections`,
      input,
    );
  },

  importScriptDocument(input) {
    return postJsonWithIdempotency("/api/creator/scripts/import-document", input, {
      action: "script.import-document",
    });
  },

  updateScriptReaderSection(scriptId, sectionId, input) {
    return patchJson(
      `/api/creator/scripts/${encodeURIComponent(scriptId)}/sections/${encodeURIComponent(sectionId)}`,
      input,
    );
  },

  deleteScriptReaderSection(scriptId, sectionId) {
    return deleteJson(
      `/api/creator/scripts/${encodeURIComponent(scriptId)}/sections/${encodeURIComponent(sectionId)}`,
    );
  },

  updateScriptCard(scriptId, input) {
    return patchJson(
      `/api/creator/scripts/${encodeURIComponent(scriptId)}`,
      input,
    );
  },

  deleteScriptCard(scriptId) {
    return deleteJson(
      `/api/creator/scripts/${encodeURIComponent(scriptId)}`,
    );
  },

  getProjectMembers(projectId) {
    const path = `/api/creator/projects/${encodeURIComponent(projectId)}/members`;
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 30000,
    });
  },

  createProjectMember(projectId, input, options = {}) {
    return postJsonWithIdempotency(
      `/api/creator/projects/${encodeURIComponent(projectId)}/members`,
      input,
      {
        action: "project.member.create",
        idempotencyKey: options.idempotencyKey,
      },
    );
  },

  updateProjectMember(projectId, memberId, input) {
    return patchJson(
      `/api/creator/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(memberId)}`,
      input,
    );
  },

  getProjectStats(projectId) {
    const path = `/api/creator/projects/${encodeURIComponent(projectId)}/stats`;
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 30000,
    });
  },

  getProjectTeamDashboardExportUrl(projectId, params = {}) {
    const query = new URLSearchParams();
    if (params.tab) {
      query.set("tab", String(params.tab));
    }
    if (params.dateShortcut) {
      query.set("dateShortcut", String(params.dateShortcut));
    }
    if (params.role && params.role !== "all") {
      query.set("role", String(params.role));
    }
    if (params.status && params.status !== "all") {
      query.set("status", String(params.status));
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return resolveApiUrl(`/api/creator/projects/${encodeURIComponent(projectId)}/team-dashboard/export${suffix}`);
  },

  getBillingPackages() {
    return fetchJsonWithTtl("/api/billing/packages", {
      cacheKey: "GET /api/billing/packages",
      cacheTtlMs: 300000,
      unwrapEnvelope: false,
    });
  },

  getMembershipPlans() {
    return fetchJsonWithTtl("/api/membership/plans", {
      cacheKey: "GET /api/membership/plans",
      cacheTtlMs: 300000,
      unwrapEnvelope: false,
    });
  },

  getMembershipStatus(options = {}) {
    return fetchJsonWithTtl(
      "/api/membership/status",
      options.fresh === true
        ? {
            cache: "no-store",
            unwrapEnvelope: false,
          }
        : {
            cacheKey: "GET /api/membership/status",
            cacheTtlMs: 60000,
            unwrapEnvelope: false,
          },
    );
  },

  createMembershipOrder(input, options = {}) {
    return postJsonWithIdempotency("/api/membership/orders", input, {
      action: "membership.order.create",
      idempotencyKey: options.idempotencyKey,
    });
  },

  createMembershipCheckout(input, options = {}) {
    return postJsonWithIdempotency("/api/membership/checkout", input, {
      action: "membership.checkout.create",
      idempotencyKey: options.idempotencyKey,
    });
  },

  getStoryboardPromptPackages() {
    return fetchJsonWithTtl("/api/creator/storyboard-prompt/packages?status=enabled&pageSize=500&compact=1", {
      cacheKey: "GET /api/creator/storyboard-prompt/packages?status=enabled&pageSize=500&compact=1",
      cacheTtlMs: 600000,
      unwrapEnvelope: false,
    });
  },

  getPromptSkills(input = {}) {
    const params = new URLSearchParams();
    if (input.category && input.category !== "all") params.set("category", input.category);
    if (String(input.query ?? "").trim()) params.set("query", String(input.query).trim());
    const page = Math.max(1, Math.floor(Number(input.page) || 1));
    const pageSize = Math.max(1, Math.min(100, Math.floor(Number(input.pageSize) || 12)));
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    const source = input.source === "private" ? "library" : "catalog";
    return fetchJson(`/api/creator/prompt-skills/${source}?${params.toString()}`, { cache: "no-store", unwrapEnvelope: false });
  },

  getPromptMarketplace(input = {}) {
    const params = new URLSearchParams();
    if (input.category && input.category !== "all") params.set("category", input.category);
    if (String(input.query ?? "").trim()) params.set("query", String(input.query).trim());
    const page = Math.max(1, Math.floor(Number(input.page) || 1));
    const pageSize = Math.max(1, Math.min(100, Math.floor(Number(input.pageSize) || 12)));
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (input.includeRanking === false) params.set("includeRanking", "false");
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    const url = `/api/creator/prompt-marketplace${suffix}`;
    return fetchJson(url, {
      cache: "no-store",
      unwrapEnvelope: false,
      dedupeKey: `GET ${url}`,
    });
  },

  getPromptMarketplaceLibrary(input = {}) {
    const params = new URLSearchParams();
    if (input.category && input.category !== "all") params.set("category", input.category);
    if (String(input.query ?? "").trim()) params.set("query", String(input.query).trim());
    if (input.page != null) params.set("page", String(Math.max(1, Math.floor(Number(input.page) || 1))));
    if (input.pageSize != null) params.set("pageSize", String(Math.max(1, Math.min(100, Math.floor(Number(input.pageSize) || 12)))));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return fetchJson(`/api/creator/prompt-marketplace/library${suffix}`, { cache: "no-store", unwrapEnvelope: false });
  },

  setPromptMarketplaceDefault(category, itemId) {
    return fetchJson(`/api/creator/prompt-marketplace/defaults/${encodeURIComponent(category)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId }),
    });
  },

  clearPromptMarketplaceDefault(category) {
    return fetchJson(`/api/creator/prompt-marketplace/defaults/${encodeURIComponent(category)}`, { method: "DELETE" });
  },

  createPromptMarketplaceItem(input) {
    return postJson("/api/creator/prompt-marketplace/items", input);
  },

  updatePromptMarketplaceItem(itemId, input) {
    return fetchJson(`/api/creator/prompt-marketplace/items/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  },

  purchasePromptMarketplaceItem(itemId) {
    return postJson(`/api/creator/prompt-marketplace/items/${encodeURIComponent(itemId)}/purchase`, {});
  },

  usePromptMarketplaceItem(itemId) {
    return postJson(`/api/creator/prompt-marketplace/items/${encodeURIComponent(itemId)}/use`, {});
  },

  ratePromptMarketplaceItem(itemId, rating) {
    return postJson(`/api/creator/prompt-marketplace/items/${encodeURIComponent(itemId)}/rating`, { rating });
  },

  removePromptMarketplaceLibraryItem(itemId) {
    return fetchJson(`/api/creator/prompt-marketplace/library/${encodeURIComponent(itemId)}`, { method: "DELETE" });
  },

  deletePromptMarketplaceItem(itemId) {
    return fetchJson(`/api/creator/prompt-marketplace/items/${encodeURIComponent(itemId)}`, { method: "DELETE" });
  },

  createAiStoryboardPreview(projectId, input, options = {}) {
    return fetchJson(`/api/creator/projects/${encodeURIComponent(projectId)}/ai-storyboard-preview`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key":
          options.idempotencyKey ??
          buildActionIdempotencyKey("creator.ai-storyboard-preview", input ?? {}),
      },
      body: JSON.stringify(input ?? {}),
      timeoutMs: 180000,
      signal: options.signal,
    });
  },

  createAiStoryboardPreviewStream(projectId, input, options = {}) {
    return postJsonSse(
      `/api/creator/projects/${encodeURIComponent(projectId)}/ai-storyboard-preview?stream=1`,
      input,
      options,
    );
  },

  createProjectAiScriptAnalysisStream(projectId, input, options = {}) {
    return postJsonSse(
      `/api/creator/projects/${encodeURIComponent(projectId)}/ai-script-analysis?stream=1`,
      input,
      options,
    );
  },

  createUserAiScriptAnalysisStream(input, options = {}) {
    return postJsonSse(
      "/api/creator/scripts/ai-script-analysis?stream=1",
      input,
      options,
    );
  },

  commitAiStoryboardPreview(projectId, input) {
    return postJson(
      `/api/creator/projects/${encodeURIComponent(projectId)}/ai-storyboard-preview/commit`,
      input,
      { timeoutMs: 60000 },
    );
  },

  getProjectStyles() {
    return fetchJsonWithTtl("/api/creator/project-styles?category=official&status=enabled&pageSize=500", {
      cacheKey: "GET /api/creator/project-styles?category=official&status=enabled&pageSize=500",
      cacheTtlMs: 600000,
      unwrapEnvelope: false,
    });
  },

  getBatchImageStyles() {
    return fetchJsonWithTtl("/api/creator/project-styles?category=batch&status=enabled&pageSize=500", {
      cacheKey: "GET /api/creator/project-styles?category=batch&status=enabled&pageSize=500",
      cacheTtlMs: 600000,
      unwrapEnvelope: false,
    });
  },

  createBillingOrder(input, options = {}) {
    return postJsonWithIdempotency("/api/billing/orders", input, {
      action: "billing.order.create",
      idempotencyKey: options.idempotencyKey,
    });
  },

  createPaymentIntent(input, options = {}) {
    return postJsonWithIdempotency("/api/billing/payment-intents", input, {
      action: "billing.intent.create",
      idempotencyKey: options.idempotencyKey,
    });
  },

  requestEnterpriseContact(input, options = {}) {
    return postJsonWithIdempotency("/api/billing/enterprise-contact-requests", input, {
      action: "billing.enterprise-contact.create",
      idempotencyKey: options.idempotencyKey,
    });
  },

  getBillingOrder(orderId) {
    return fetchJson(`/api/billing/orders/${encodeURIComponent(orderId)}`, { unwrapEnvelope: false });
  },

  getPaymentIntent(paymentIntentId) {
    return fetchJson(`/api/billing/payment-intents/${encodeURIComponent(paymentIntentId)}`, { unwrapEnvelope: false });
  },

  getGenerationQueueHealth() {
    return fetchJson("/api/admin/ops/generation-queues", { unwrapEnvelope: false });
  },

  operateGenerationQueueJob(input, options = {}) {
    return postJsonWithIdempotency("/api/admin/ops/generation-queues/jobs", input, {
      action: "ops.generation-queue-job",
      idempotencyKey: options.idempotencyKey,
    });
  },

  retryGenerationFinalize(input, options = {}) {
    return postJsonWithIdempotency("/api/admin/ops/tasks/retry-finalize", input, {
      action: "ops.retry-finalize",
      idempotencyKey: options.idempotencyKey,
    });
  },

  retryGenerationPersistAsset(input, options = {}) {
    return postJsonWithIdempotency("/api/admin/ops/tasks/retry-persist-asset", input, {
      action: "ops.retry-persist-asset",
      idempotencyKey: options.idempotencyKey,
    });
  },

  createEpisode(input) {
    return postJson("/api/creator/episodes", input);
  },

  createProjectEpisode(projectId, input) {
    return postJsonWithIdempotency(
      `/api/projects/${encodeURIComponent(projectId)}/episodes`,
      input,
      {
        action: "project.episode.create",
      },
    );
  },

  updateEpisode(input) {
    return patchJson("/api/creator/episodes", input);
  },

  updateProjectEpisode(projectId, episodeId, input) {
    return patchJson(
      `/api/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}`,
      input,
    );
  },

  deleteEpisode(input) {
    return deleteJson("/api/creator/episodes", input);
  },

  deleteProjectEpisode(projectId, episodeId) {
    return deleteJson(
      `/api/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}`,
    );
  },

  listProjectExportTasks(projectId, params = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.pageSize) query.set("pageSize", String(params.pageSize));
    const suffix = query.toString() ? `?${query}` : "";
    const path = `/api/projects/${encodeURIComponent(projectId)}/export-tasks${suffix}`;
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 15000,
    });
  },

  getEpisodeWorkbench(episodeId) {
    const path = `/api/episodes/${encodeURIComponent(episodeId)}/workbench`;
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 15000,
    });
  },

  listEpisodeAssets(episodeId, params = {}) {
    const query = new URLSearchParams();
    if (params.assetType) query.set("assetType", params.assetType);
    if (params.page) query.set("page", String(params.page));
    if (params.pageSize) query.set("pageSize", String(params.pageSize));
    const suffix = query.toString() ? `?${query}` : "";
    const path = `/api/episodes/${encodeURIComponent(episodeId)}/assets${suffix}`;
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 15000,
    });
  },

  createEpisodeAsset(episodeId, input) {
    return postJson(`/api/episodes/${encodeURIComponent(episodeId)}/assets`, input);
  },

  importEpisodeAsset(episodeId, input) {
    return postJson(`/api/episodes/${encodeURIComponent(episodeId)}/assets/import`, input);
  },

  updateEpisodeAsset(episodeId, assetId, input) {
    return patchJson(
      `/api/episodes/${encodeURIComponent(episodeId)}/assets/${encodeURIComponent(assetId)}`,
      input,
    );
  },

  deleteEpisodeAsset(episodeId, assetId) {
    return deleteJson(`/api/episodes/${encodeURIComponent(episodeId)}/assets/${encodeURIComponent(assetId)}`);
  },

  deleteEpisodeAssetsByType(episodeId, assetType) {
    const query = new URLSearchParams({ assetType: String(assetType ?? "") });
    return deleteJson(`/api/episodes/${encodeURIComponent(episodeId)}/assets?${query}`);
  },

  saveEpisodeAssetToLibrary(episodeId, assetId) {
    return postJson(
      `/api/episodes/${encodeURIComponent(episodeId)}/assets/${encodeURIComponent(assetId)}/save-to-library`,
      {},
    );
  },

  listStoryboards(episodeId, params = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.pageSize) query.set("pageSize", String(params.pageSize));
    query.set("includeDraftPayload", params.includeDraftPayload === true ? "1" : "0");
    const suffix = query.toString() ? `?${query}` : "";
    const path = `/api/episodes/${encodeURIComponent(episodeId)}/storyboards${suffix}`;
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 15000,
    });
  },

  getAssetConversationHistory(episodeId, assetId, mediaMode = "image") {
    const query = new URLSearchParams();
    query.set("mediaMode", mediaMode === "video" ? "video" : "image");
    query.set("includeMessages", "0");
    const path = `/api/episodes/${encodeURIComponent(episodeId)}/assets/${encodeURIComponent(assetId)}/conversation?${query}`;
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 15000,
    });
  },

  saveAssetConversationMessages(episodeId, assetId, input) {
    return postJson(
      `/api/episodes/${encodeURIComponent(episodeId)}/assets/${encodeURIComponent(assetId)}/conversation/messages`,
      input,
    );
  },

  getStoryboardConversationHistory(episodeId, storyboardId, mediaMode = "image") {
    const query = new URLSearchParams();
    query.set("mediaMode", mediaMode === "video" ? "video" : "image");
    query.set("includeMessages", "0");
    const path = `/api/episodes/${encodeURIComponent(episodeId)}/storyboards/${encodeURIComponent(storyboardId)}/conversation?${query}`;
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 15000,
    });
  },

  saveStoryboardConversationMessages(episodeId, storyboardId, input) {
    return postJson(
      `/api/episodes/${encodeURIComponent(episodeId)}/storyboards/${encodeURIComponent(storyboardId)}/conversation/messages`,
      input,
    );
  },

  deleteStoryboardConversationTurn(episodeId, storyboardId, taskId, mediaMode = "image") {
    const query = new URLSearchParams();
    query.set("mediaMode", mediaMode === "video" ? "video" : "image");
    return deleteJson(
      `/api/episodes/${encodeURIComponent(episodeId)}/storyboards/${encodeURIComponent(storyboardId)}/conversation/messages/${encodeURIComponent(taskId)}?${query}`,
    );
  },

  deleteAssetConversationTurn(episodeId, assetId, taskId, mediaMode = "image") {
    const query = new URLSearchParams();
    query.set("mediaMode", mediaMode === "video" ? "video" : "image");
    return deleteJson(
      `/api/episodes/${encodeURIComponent(episodeId)}/assets/${encodeURIComponent(assetId)}/conversation/messages/${encodeURIComponent(taskId)}?${query}`,
    );
  },

  listGenerationTasks(episodeId, params = {}) {
    const query = new URLSearchParams();
    if (params.targetType) query.set("targetType", params.targetType);
    if (params.targetId) query.set("targetId", params.targetId);
    if (params.page) query.set("page", String(params.page));
    if (params.pageSize) query.set("pageSize", String(params.pageSize));
    const suffix = query.toString() ? `?${query}` : "";
    const path = `/api/episodes/${encodeURIComponent(episodeId)}/generation-tasks${suffix}`;
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 10000,
    });
  },

  listGenerationConfig(episodeId, options = {}) {
    const queryParams = new URLSearchParams();
    if (options.fresh === true) {
      queryParams.set("t", String(Date.now()));
    }
    if (options.mediaType) {
      queryParams.set("mediaType", String(options.mediaType));
    }
    const query = queryParams.toString() ? `?${queryParams}` : "";
    const path = `/api/episodes/${encodeURIComponent(episodeId)}/generation-config${query}`;
    return fetchJsonWithTtl(
      path,
      options.fresh === true
        ? { cache: "no-store" }
        : {
            cacheKey: `GET ${path}`,
            cacheTtlMs: 300000,
          },
    );
  },

  listBatchImageModelOptions(episodeId, options = {}) {
    const query = options.fresh === true ? `?t=${Date.now()}` : "";
    const path = `/api/episodes/${encodeURIComponent(episodeId)}/batch-image-model-options${query}`;
    return fetchJsonWithTtl(
      path,
      options.fresh === true
        ? { cache: "no-store" }
        : {
            cacheKey: `GET ${path}`,
            cacheTtlMs: 300000,
          },
    );
  },

  listGlobalGenerationConfig(options = {}) {
    const queryParams = new URLSearchParams();
    if (options.fresh === true) {
      queryParams.set("t", String(Date.now()));
    }
    if (options.mediaType) {
      queryParams.set("mediaType", String(options.mediaType));
    }
    const query = queryParams.toString() ? `?${queryParams}` : "";
    const path = `/api/generation-config${query}`;
    return fetchJsonWithTtl(
      path,
      options.fresh === true
        ? { cache: "no-store" }
        : {
            cacheKey: `GET ${path}`,
            cacheTtlMs: 300000,
          },
    );
  },

  listGlobalBatchImageModelOptions(options = {}) {
    const query = options.fresh === true ? `?t=${Date.now()}` : "";
    const path = `/api/batch-image-model-options${query}`;
    return fetchJsonWithTtl(
      path,
      options.fresh === true
        ? { cache: "no-store" }
        : {
            cacheKey: `GET ${path}`,
            cacheTtlMs: 300000,
          },
    );
  },

  createImageGenerationTask(input, options = {}) {
    return postJsonWithIdempotency(
      "/api/generation/image-tasks",
      input,
      {
        action: "generation.image",
        idempotencyKey: options.idempotencyKey,
        timeoutMs: 60000,
        signal: options.signal,
      },
    );
  },

  createVideoTask(episodeId, input, options = {}) {
    return postJsonWithIdempotency(
      `/api/episodes/${encodeURIComponent(episodeId)}/generation/video-tasks`,
      input,
      {
        action: "episode.generation.video",
        idempotencyKey: options.idempotencyKey,
        timeoutMs: 60000,
      },
    );
  },

  getGenerationTask(taskId, options = {}) {
    return fetchJson(`/api/generation-tasks/${encodeURIComponent(taskId)}`, { signal: options.signal });
  },

  cancelGenerationTask(taskId) {
    return postJson(`/api/generation-tasks/${encodeURIComponent(taskId)}/cancel`, {});
  },

  getGenerationTasks(taskIds) {
    const normalizedTaskIds = Array.from(new Set(
      (Array.isArray(taskIds) ? taskIds : [])
        .map((taskId) => String(taskId ?? "").trim())
        .filter(Boolean),
    ));
    if (!normalizedTaskIds.length) {
      return Promise.resolve({ items: [] });
    }
    return postJson("/api/generation-tasks/batch", { taskIds: normalizedTaskIds });
  },

  listTaskCenterTasks(params = {}, options = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.pageSize) query.set("pageSize", String(params.pageSize));
    if (params.status && params.status !== "all") query.set("status", String(params.status));
    if (params.kind && params.kind !== "all") query.set("kind", String(params.kind));
    if (params.search) query.set("search", String(params.search));
    if (params.updatedAfter) query.set("updatedAfter", String(params.updatedAfter));
    if (params.cursor) query.set("cursor", String(params.cursor));
    if (Array.isArray(params.taskIds) && params.taskIds.length) {
      query.set("taskIds", Array.from(new Set(params.taskIds.map((taskId) => String(taskId ?? "").trim()).filter(Boolean))).join(","));
    }
    const suffix = query.toString() ? `?${query}` : "";
    return fetchJson(`/api/task-center/tasks${suffix}`, options);
  },

  bindFileResource(episodeId, input) {
    return postJson(`/api/episodes/${encodeURIComponent(episodeId)}/file-resources/bind`, input);
  },

  setFixedImage(episodeId, assetId, input, options = {}) {
    return postJsonWithIdempotency(
      `/api/episodes/${encodeURIComponent(episodeId)}/assets/${encodeURIComponent(assetId)}/set-fixed-image`,
      input,
      {
        action: "episode.asset.set-fixed-image",
        idempotencyKey: options.idempotencyKey,
      },
    );
  },

  clearFixedImage(episodeId, assetId) {
    return deleteJson(
      `/api/episodes/${encodeURIComponent(episodeId)}/assets/${encodeURIComponent(assetId)}/fixed-image`,
    );
  },

  setStoryboardImage(episodeId, storyboardId, input, options = {}) {
    return postJsonWithIdempotency(
      `/api/episodes/${encodeURIComponent(episodeId)}/storyboards/${encodeURIComponent(storyboardId)}/set-current-image`,
      input,
      {
        action: "episode.storyboard.set-current-image",
        idempotencyKey: options.idempotencyKey,
      },
    );
  },

  setStoryboardVideo(episodeId, storyboardId, input, options = {}) {
    return postJsonWithIdempotency(
      `/api/episodes/${encodeURIComponent(episodeId)}/storyboards/${encodeURIComponent(storyboardId)}/set-current-video`,
      input,
      {
        action: "episode.storyboard.set-current-video",
        idempotencyKey: options.idempotencyKey,
      },
    );
  },

  deleteFileResource(episodeId, fileId, input = {}) {
    return deleteJson(
      `/api/episodes/${encodeURIComponent(episodeId)}/file-resources/${encodeURIComponent(fileId)}`,
      input,
    ).catch((error) => {
      if (error?.status === 404 && error?.errorCode === "resource_not_found") {
        return { deleted: false, missing: true };
      }
      throw error;
    });
  },

  createEpisodeExportTask(episodeId, input, options = {}) {
    return postJsonWithIdempotency(
      `/api/episodes/${encodeURIComponent(episodeId)}/export-tasks`,
      input,
      {
        action: "episode.export.original-video",
        idempotencyKey: options.idempotencyKey,
      },
    );
  },

  saveDraft(episodeId, targetType, targetId, input) {
    return patchJson(
      `/api/episodes/${encodeURIComponent(episodeId)}/generation-drafts/${encodeURIComponent(targetType)}/${encodeURIComponent(targetId)}`,
      input,
    );
  },

  createShot(input) {
    return postJson("/api/creator/shots", input);
  },

  updateShot(input) {
    return patchJson("/api/creator/shots", input);
  },

  importShotMedia(shotId, input) {
    return postJson(`/api/creator/shots/${encodeURIComponent(shotId)}/media/import`, input);
  },

  deleteShotMedia(shotId, input) {
    const assetVersionId = input?.assetVersionId;
    const kind = input?.kind;
    const ignoreMissingShotMedia = (error) => {
      const message = String(error instanceof Error ? error.message : error);
      if (message.includes("shot_media_not_found")) {
        return { deleted: false, missing: true };
      }
      throw error;
    };
    if (assetVersionId && kind) {
      return fetchJson(
        `/api/creator/shots/${encodeURIComponent(shotId)}/media/${encodeURIComponent(assetVersionId)}?kind=${encodeURIComponent(kind)}`,
        {
          method: "DELETE",
        },
      ).catch(ignoreMissingShotMedia);
    }
    return deleteJson(`/api/creator/shots/${encodeURIComponent(shotId)}/media`, input).catch(ignoreMissingShotMedia);
  },

  replaceShotReferences(shotId, input) {
    return postJson(`/api/creator/shots/${encodeURIComponent(shotId)}/references`, input);
  },

  deleteShot(input) {
    return deleteJson("/api/creator/shots", input);
  },

  reorderShots(input) {
    return postJson("/api/creator/shots/reorder", input);
  },

  runCalibration() {
    return postJsonWithIdempotency("/api/creator/calibration/run", {}, {
      action: "calibration.run",
    });
  },

  skipCalibration(input) {
    return postJsonWithIdempotency("/api/creator/calibration/skip", input, {
      action: "calibration.skip",
    });
  },

  overrideCalibration(input) {
    return postJsonWithIdempotency("/api/creator/calibration/override", input, {
      action: "calibration.override",
    });
  },

  generateVideos(input) {
    return postJsonWithIdempotency("/api/creator/videos/generate", input, {
      action: "generation.videos",
      timeoutMs: 60000,
    });
  },

  previewExport() {
    return postJsonWithIdempotency("/api/creator/export/preview", {}, {
      action: "export.preview",
    });
  },

  getExportHistory() {
    return fetchJson("/api/creator/export/history");
  },

  collectEpisodeEvent(input) {
    return postJson("/api/creator/episode-events", input);
  },
};
