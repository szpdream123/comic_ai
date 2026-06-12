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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const { timeoutMs: _timeoutMs, unwrapEnvelope: _unwrapEnvelope, ...fetchOptions } = options;

  let response;
  try {
    response = await fetch(resolveApiUrl(url), {
      credentials: "include",
      ...fetchOptions,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("request_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
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
    const error = new Error(
      payload.message ?? payload.error ?? payload.errorCode ?? `request_failed:${response.status}`,
    );
    error.status = response.status;
    error.errorCode = payload.errorCode ?? payload.error ?? `request_failed:${response.status}`;
    error.details = payload.details ?? null;
    error.requestId = payload.requestId ?? null;
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
  const localBackendPort = /^(?:431\d|4399)$/.test(window.location.port ?? "");
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
  });
}

async function* postJsonSse(url, body, options = {}) {
  const response = await fetch(resolveApiUrl(url), {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
    },
    body: JSON.stringify(body ?? {}),
    signal: options.signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const error = new Error(text || `request_failed:${response.status}`);
    error.status = response.status;
    throw error;
  }
  const reader = response.body?.getReader?.();
  if (!reader) {
    return;
  }
  const decoder = new TextDecoder();
  let buffer = "";
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
    return { event: eventName, data: JSON.parse(dataText) };
  } catch {
    return { event: eventName, data: dataText };
  }
}

async function postMultipart(url, formData) {
  return fetchJson(url, {
    method: "POST",
    body: formData,
  });
}

function patchJson(url, body) {
  return fetchJson(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function deleteJson(url, body) {
  return fetchJson(url, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
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
    return fetchJson("/api/auth/session");
  },

  logout() {
    return postJson("/api/auth/logout");
  },

  getCreatorState() {
    return fetchJson("/api/creator/state");
  },

  getCreditLedger(options = {}) {
    const pageSize = Number(options.pageSize ?? 50);
    const params = new URLSearchParams();
    if (Number.isFinite(pageSize) && pageSize > 0) {
      params.set("pageSize", String(Math.min(100, Math.round(pageSize))));
    }
    const query = params.toString();
    return fetchJson(`/api/creator/credits/ledger${query ? `?${query}` : ""}`);
  },

  getTeamOverview() {
    return fetchJson("/api/creator/team/overview");
  },

  getTeamMembers() {
    return fetchJson("/api/creator/team/members");
  },

  createTeamMember(input) {
    return postJsonWithIdempotency("/api/creator/team/members", input, {
      action: "team.member.create",
    });
  },

  createProject(input) {
    return postJsonWithIdempotency("/api/creator/project/create", input, {
      action: "project.create",
    });
  },

  getProjects() {
    return fetchJson("/api/creator/projects");
  },

  getCanvasProjects() {
    return fetchJson("/api/creator/canvas-projects");
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

  getWorkspaceScripts() {
    return fetchJson("/api/creator/scripts");
  },

  getProjectDetail(projectId) {
    return fetchJson(`/api/creator/projects/${encodeURIComponent(projectId)}/detail`);
  },

  getProjectDetailV2(projectId) {
    return fetchJson(`/api/projects/${encodeURIComponent(projectId)}/detail`);
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
    return fetchJson("/api/creator/assets/library");
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
    return fetchJson(`/api/creator/library/assets${query ? `?${query}` : ""}`);
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
    return fetchJson(`/api/creator/assets/versions/${encodeURIComponent(assetId)}`);
  },

  getProjectEpisodes(projectId) {
    return fetchJson(`/api/creator/projects/${encodeURIComponent(projectId)}/episodes`);
  },

  getScriptReaderSections(projectId, input = {}) {
    const query = input.scriptId ? `?scriptId=${encodeURIComponent(input.scriptId)}` : "";
    return fetchJson(`/api/creator/projects/${encodeURIComponent(projectId)}/script-reader-sections${query}`);
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
    return fetchJson(`/api/creator/projects/${encodeURIComponent(projectId)}/members`);
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
    return fetchJson(`/api/creator/projects/${encodeURIComponent(projectId)}/stats`);
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
    return fetchJson("/api/billing/packages", { unwrapEnvelope: false });
  },

  getStoryboardPromptPackages() {
    return fetchJson("/api/creator/storyboard-prompt/packages?status=enabled&pageSize=500", {
      unwrapEnvelope: false,
    });
  },

  createAiStoryboardPreview(projectId, input) {
    return fetchJson(`/api/creator/projects/${encodeURIComponent(projectId)}/ai-storyboard-preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input ?? {}),
      timeoutMs: 180000,
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
    return fetchJson("/api/creator/project-styles?category=official&status=enabled&pageSize=500", {
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
    return fetchJson(`/api/projects/${encodeURIComponent(projectId)}/export-tasks${suffix}`);
  },

  getEpisodeWorkbench(episodeId) {
    return fetchJson(`/api/episodes/${encodeURIComponent(episodeId)}/workbench`);
  },

  listEpisodeAssets(episodeId, params = {}) {
    const query = new URLSearchParams();
    if (params.assetType) query.set("assetType", params.assetType);
    if (params.page) query.set("page", String(params.page));
    if (params.pageSize) query.set("pageSize", String(params.pageSize));
    const suffix = query.toString() ? `?${query}` : "";
    return fetchJson(`/api/episodes/${encodeURIComponent(episodeId)}/assets${suffix}`);
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
    return fetchJson(`/api/episodes/${encodeURIComponent(episodeId)}/storyboards${suffix}`);
  },

  getAssetConversationHistory(episodeId, assetId, mediaMode = "image") {
    const query = new URLSearchParams();
    query.set("mediaMode", mediaMode === "video" ? "video" : "image");
    return fetchJson(
      `/api/episodes/${encodeURIComponent(episodeId)}/assets/${encodeURIComponent(assetId)}/conversation?${query}`,
    );
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
    return fetchJson(
      `/api/episodes/${encodeURIComponent(episodeId)}/storyboards/${encodeURIComponent(storyboardId)}/conversation?${query}`,
    );
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
    return fetchJson(`/api/episodes/${encodeURIComponent(episodeId)}/generation-tasks${suffix}`);
  },

  listGenerationConfig(episodeId) {
    return fetchJson(`/api/episodes/${encodeURIComponent(episodeId)}/generation-config`);
  },

  listGlobalGenerationConfig() {
    return fetchJson("/api/generation-config");
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
