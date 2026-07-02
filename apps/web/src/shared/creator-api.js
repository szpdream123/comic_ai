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
      const error = new Error(
        errorPayload.message ?? errorPayload.error ?? errorPayload.errorCode ?? `request_failed:${response.status}`,
      );
      error.status = response.status;
      error.errorCode = errorPayload.errorCode ?? errorPayload.error ?? `request_failed:${response.status}`;
      error.details = errorPayload.details ?? null;
      error.requestId = payload.requestId ?? null;
      error.data = errorPayload;
      error.taskId =
        typeof errorPayload.taskId === "string" && errorPayload.taskId.trim()
          ? errorPayload.taskId.trim()
          : typeof errorPayload.details?.taskId === "string" && errorPayload.details.taskId.trim()
            ? errorPayload.details.taskId.trim()
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
  readJsonCache.clear();
}

function clearReadRequestCaches() {
  clearFetchJsonCache();
  clearReadJsonCache();
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
      fetchJson(url, {
        ...fetchOptions,
        dedupeKey: fetchOptions.dedupeKey ?? cacheKey,
      }).then((result) => {
        cacheReadJson(cacheKey, Promise.resolve(result));
      }).catch(() => {
        cached.refreshing = false;
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
  if (/^https?:\/\//i.test(url)) {
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

function postJson(url, body) {
  return fetchJson(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  }).then((result) => {
    clearReadRequestCaches();
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
    const message = payload.message ?? payload.error ?? payload.errorCode ?? text;
    const error = new Error(message || `request_failed:${response.status}`);
    error.status = response.status;
    error.errorCode = payload.errorCode ?? payload.error ?? `request_failed:${response.status}`;
    error.details = payload.details ?? null;
    error.requestId = payload.requestId ?? null;
    throw error;
  }
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
  const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() || "message";
  const dataText = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!dataText) {
    return { event: eventName, data: null };
  }
  try {
    const data = JSON.parse(dataText);
    const inferredEventName =
      data && typeof data === "object" && typeof data.type === "string" && data.type.trim()
        ? data.type.trim()
        : eventName;
    return { event: inferredEventName, data };
  } catch {
    return { event: eventName, data: dataText };
  }
}

export const creatorApiTestHooks = {
  postJsonSse,
};

async function postMultipart(url, formData) {
  const result = await fetchJson(url, {
    method: "POST",
    body: formData,
  });
  clearReadRequestCaches();
  return result;
}

function patchJson(url, body) {
  return fetchJson(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  }).then((result) => {
    clearReadRequestCaches();
    return result;
  });
}

function putJson(url, body) {
  return fetchJson(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
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

function postJsonWithIdempotency(url, body, options = {}) {
  return fetchJson(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key":
        options.idempotencyKey ??
        buildActionIdempotencyKey(options.action ?? url, body ?? {}),
    },
    body: JSON.stringify(body ?? {}),
  }).then((result) => {
    clearReadRequestCaches();
    return result;
  });
}

const LOCAL_PAYMENT_CALLBACK_SECRET = "dev-payment-secret";

function paymentCallbackSignatureBase(input) {
  return [
    input.provider,
    input.providerEventDedupKey,
    input.merchantOrderNo,
    input.providerTradeId,
    input.eventType,
    input.amountMinor,
    input.currency,
    input.merchantId,
  ].join("|");
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signPaymentCallback(input, secret = LOCAL_PAYMENT_CALLBACK_SECRET) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("payment_callback_crypto_unavailable");
  }
  const encoder = new TextEncoder();
  const key = await subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await subtle.sign("HMAC", key, encoder.encode(paymentCallbackSignatureBase(input)));
  return bytesToHex(new Uint8Array(signature));
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
    asciiSafeToken(options.projectId ?? "workspace", "workspace"),
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
    asciiSafeToken(input.projectId ?? "workspace", "workspace"),
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
  if (prepared?.upload?.url && shouldUseSameOriginUploadProxy()) {
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
      const error = new Error(
        payload.message ?? payload.error ?? payload.errorCode ?? `upload_failed:${xhr.status}`,
      );
      error.status = xhr.status;
      error.errorCode = payload.errorCode ?? payload.error ?? `upload_failed:${xhr.status}`;
      error.details = payload.details ?? null;
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
    return fetchJsonWithTtl("/api/auth/session", {
      cacheKey: "GET /api/auth/session",
      cacheTtlMs: 30000,
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

  getCanvasProjects() {
    return fetchJsonWithTtl("/api/creator/canvas-projects", {
      cacheKey: "GET /api/creator/canvas-projects",
      cacheTtlMs: 60000,
    });
  },

  createCanvasProject(input) {
    return postJsonWithIdempotency("/api/creator/canvas-projects", input, {
      action: "canvas-project.create",
    });
  },

  updateCanvasProject(projectId, input) {
    return patchJson(`/api/creator/canvas-projects/${encodeURIComponent(projectId)}`, input);
  },

  deleteCanvasProject(projectId) {
    return deleteJson(`/api/creator/canvas-projects/${encodeURIComponent(projectId)}`);
  },

  getStandaloneCanvas(canvasProjectId) {
    const path = `/api/creator/canvas-projects/${encodeURIComponent(canvasProjectId)}/canvas`;
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 30000,
    });
  },

  saveStandaloneCanvas(canvasProjectId, input) {
    return putJson(`/api/creator/canvas-projects/${encodeURIComponent(canvasProjectId)}/canvas`, input);
  },

  getProjectCanvas(projectId) {
    const path = `/api/creator/projects/${encodeURIComponent(projectId)}/canvas`;
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 30000,
    });
  },

  saveProjectCanvas(projectId, input) {
    return putJson(`/api/creator/projects/${encodeURIComponent(projectId)}/canvas`, input);
  },

  runCanvasNode(canvasProjectId, nodeKey, input, options = {}) {
    return postJsonWithIdempotency(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/nodes/${encodeURIComponent(nodeKey)}/run`,
      input,
      {
        action: "canvas.node.run",
        idempotencyKey: options.idempotencyKey,
      },
    );
  },

  listCanvasNodeRuns(canvasProjectId, nodeKey) {
    return fetchJson(`/api/canvas/${encodeURIComponent(canvasProjectId)}/nodes/${encodeURIComponent(nodeKey)}/runs`);
  },

  selectCanvasNodeArtifact(canvasProjectId, artifactId, input = {}) {
    return postJson(
      `/api/canvas/${encodeURIComponent(canvasProjectId)}/artifacts/${encodeURIComponent(artifactId)}/select`,
      input,
    );
  },

  getWorkspaceScripts() {
    return fetchJsonWithTtl("/api/creator/scripts", {
      cacheKey: "GET /api/creator/scripts",
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
    return postJson("/api/creator/project/select", input);
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

  getAssetLibrary() {
    return fetchJsonWithTtl("/api/creator/assets/library", {
      cacheKey: "GET /api/creator/assets/library",
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

  completeUpload(uploadSessionId, input) {
    return postJson(`/api/storage/upload-sessions/${encodeURIComponent(uploadSessionId)}/complete`, input);
  },

  abortUpload(uploadSessionId) {
    return postJson(`/api/storage/upload-sessions/${encodeURIComponent(uploadSessionId)}/abort`, {});
  },

  async uploadFile(file, options = {}) {
    validateUploadFile(file, options.uploadLimits ?? defaultUploadLimits);
    return this.prepareUpload(
      {
        projectId: options.projectId ?? null,
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
      try {
        const uploadResult = await uploadPreparedFile(prepared, file, {
          onProgress: options.onProgress,
          signal: options.signal,
        });
        const completed = await this.completeUpload(prepared.uploadSessionId, {
          eTag: uploadResult?.eTag ?? null,
        });
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
      } catch (error) {
        if (prepared?.uploadSessionId) {
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

  generateAsset(input) {
    return postJson("/api/creator/assets/generate", input);
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

  getScriptReaderSections(projectId, input = {}) {
    const query = input.scriptId ? `?scriptId=${encodeURIComponent(input.scriptId)}` : "";
    const path = `/api/creator/projects/${encodeURIComponent(projectId)}/script-reader-sections${query}`;
    return fetchJsonWithTtl(path, {
      cacheKey: `GET ${path}`,
      cacheTtlMs: 30000,
    });
  },

  createScriptReaderSection(projectId, input) {
    return postJson(
      `/api/creator/projects/${encodeURIComponent(projectId)}/script-reader-sections`,
      input,
    );
  },

  importScriptDocument(input) {
    return postJsonWithIdempotency("/api/creator/scripts/import-document", input, {
      action: "script.import-document",
    });
  },

  updateScriptReaderSection(projectId, sectionId, input) {
    return patchJson(
      `/api/creator/projects/${encodeURIComponent(projectId)}/script-reader-sections/${encodeURIComponent(sectionId)}`,
      input,
    );
  },

  deleteScriptReaderSection(projectId, sectionId) {
    return deleteJson(
      `/api/creator/projects/${encodeURIComponent(projectId)}/script-reader-sections/${encodeURIComponent(sectionId)}`,
    );
  },

  updateScriptCard(projectId, scriptId, input) {
    return patchJson(
      `/api/creator/projects/${encodeURIComponent(projectId)}/scripts/${encodeURIComponent(scriptId)}`,
      input,
    );
  },

  deleteScriptCard(projectId, scriptId) {
    return deleteJson(
      `/api/creator/projects/${encodeURIComponent(projectId)}/scripts/${encodeURIComponent(scriptId)}`,
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
    return fetchJsonWithTtl("/api/creator/storyboard-prompt/packages?status=enabled&pageSize=500", {
      cacheKey: "GET /api/creator/storyboard-prompt/packages?status=enabled&pageSize=500",
      cacheTtlMs: 600000,
      unwrapEnvelope: false,
    });
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

  createAiScriptAnalysisStream(projectId, input, options = {}) {
    return postJsonSse(
      `/api/creator/projects/${encodeURIComponent(projectId)}/ai-script-analysis?stream=1`,
      input,
      options,
    );
  },

  commitAiStoryboardPreview(projectId, input) {
    return postJson(
      `/api/creator/projects/${encodeURIComponent(projectId)}/ai-storyboard-preview/commit`,
      input,
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

  async simulatePaymentCallback(input) {
    const merchantOrderNo = String(input?.merchantOrderNo ?? "").trim();
    if (!merchantOrderNo) {
      throw new Error("payment_callback_merchant_order_no_required");
    }
    const provider = String(input?.provider ?? "wechat_pay");
    const providerTradeId = String(
      input?.providerTradeId ?? `local-sim-trade:${merchantOrderNo}`,
    );
    const body = {
      provider,
      providerEventDedupKey: String(
        input?.providerEventDedupKey ?? `local-sim:${merchantOrderNo}:${providerTradeId}`,
      ),
      merchantOrderNo,
      providerTradeId,
      eventType: String(input?.eventType ?? "payment_succeeded"),
      amountMinor: Number(input?.amountMinor ?? 0),
      currency: String(input?.currency ?? "CNY"),
      merchantId: String(input?.merchantId ?? "comic-ai-dev-merchant"),
    };
    const signature = await signPaymentCallback(body);
    return postJson("/api/billing/payment-callback/mock", {
      ...body,
      signature,
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

  createImageTask(episodeId, input, options = {}) {
    return postJsonWithIdempotency(
      `/api/episodes/${encodeURIComponent(episodeId)}/generation/image-tasks`,
      input,
      {
        action: "episode.generation.image",
        idempotencyKey: options.idempotencyKey,
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
      },
    );
  },

  getGenerationTask(taskId) {
    return fetchJson(`/api/generation-tasks/${encodeURIComponent(taskId)}`);
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
    );
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

  generateImages(input) {
    return postJsonWithIdempotency("/api/creator/images/generate", input, {
      action: "generation.images",
    });
  },

  generateVideos(input) {
    return postJsonWithIdempotency("/api/creator/videos/generate", input, {
      action: "generation.videos",
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
