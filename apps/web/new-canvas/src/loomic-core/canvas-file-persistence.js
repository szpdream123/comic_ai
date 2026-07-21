import { migrateLegacyCanvasWorkflowEdges } from "./canvas-workflow-edges.js";

const CLOUD_SOURCES = new Set([
  "personal-library",
  "official-library",
  "team-library",
  "episode-asset",
  "generation-history",
]);

const IMAGE_EXTENSIONS = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

function persistentUrlFor(element) {
  if (!element || element.isDeleted || element.type !== "image" || !element.fileId) return "";
  const customData = element.customData ?? {};
  const archived = customData.cloudArchiveStatus === "archived";
  const cloudSource = CLOUD_SOURCES.has(String(customData.source ?? ""));
  if (!archived && !cloudSource) return "";
  const storageUrl = String(customData.storageUrl ?? customData.resultUrl ?? "").trim();
  return isStableCanvasMediaUrl(storageUrl) ? storageUrl : "";
}

export function isStableCanvasMediaUrl(value) {
  const url = String(value ?? "").trim();
  return Boolean(url) && !/^(?:data:|blob:)/i.test(url);
}

export function storageObjectContentUrl(storageObjectId) {
  const normalized = String(storageObjectId ?? "").trim();
  return normalized ? `/api/storage/objects/${encodeURIComponent(normalized)}/content` : "";
}

function uploadedMediaKind(element) {
  const customData = element?.customData ?? {};
  if (element?.type === "embeddable" && (customData.isVideo || customData.mediaKind === "video")) return "video";
  if (customData.type === "audio-node" && ["upload", "generated"].includes(customData.sourceKind)) return "audio";
  return "";
}

export function hydrateCanvasElementsForDisplay(elements = []) {
  const migratedElements = migrateLegacyCanvasWorkflowEdges(elements);
  let changed = false;
  const hydrated = migratedElements.map((element) => {
    if (!element || element.isDeleted) return element;
    const customData = element.customData ?? {};
    const mediaKind = uploadedMediaKind(element);
    const storageUrl = storageObjectContentUrl(customData.storageObjectId);
    const resultUrl = storageObjectContentUrl(customData.resultStorageObjectId);
    if (!storageUrl && !resultUrl) return element;

    changed = true;
    const nextCustomData = { ...customData };
    let nextElement = element;
    if (storageUrl) {
      nextCustomData.storageUrl = storageUrl;
      if (mediaKind === "audio") nextCustomData.mediaUrl = storageUrl;
      if (mediaKind === "video") nextElement = { ...nextElement, link: storageUrl };
    }
    if (resultUrl) {
      nextCustomData.resultUrl = resultUrl;
      if (Array.isArray(customData.resultUrls)) nextCustomData.resultUrls = [resultUrl];
    }
    return { ...nextElement, customData: nextCustomData };
  });
  return changed ? hydrated : migratedElements;
}

function withoutEphemeralMediaFields(customData) {
  const next = { ...customData };
  for (const key of ["mediaUrl", "storageUrl", "resultUrl", "previewUrl"]) {
    if (/^(?:data:|blob:)/i.test(String(next[key] ?? ""))) delete next[key];
  }
  return next;
}

export function compactCanvasElementsForPersistence(elements = []) {
  let changed = false;
  const compacted = elements.map((element) => {
    const kind = uploadedMediaKind(element);
    if (!kind || element?.isDeleted) return element;
    const customData = element.customData ?? {};
    const stableUrl = [
      customData.storageUrl,
      kind === "video" ? element.link : customData.mediaUrl,
    ].find(isStableCanvasMediaUrl) ?? "";
    const currentUrl = kind === "video" ? String(element.link ?? "") : String(customData.mediaUrl ?? "");
    const archived = customData.cloudArchiveStatus === "archived" && Boolean(stableUrl);
    const hasEphemeralUrl = /^(?:data:|blob:)/i.test(currentUrl)
      || [customData.mediaUrl, customData.storageUrl, customData.resultUrl, customData.previewUrl]
        .some((value) => /^(?:data:|blob:)/i.test(String(value ?? "")));
    const needsStableReplacement = archived && currentUrl !== stableUrl;
    const invalidArchivedState = customData.cloudArchiveStatus === "archived" && !stableUrl;
    if (!hasEphemeralUrl && !needsStableReplacement && !invalidArchivedState) return element;

    changed = true;
    const nextCustomData = withoutEphemeralMediaFields(customData);
    if (archived) {
      nextCustomData.storageUrl = stableUrl;
      nextCustomData.cloudArchiveStatus = "archived";
      nextCustomData.archiveRetryState = "archived";
      nextCustomData.status = customData.status === "failed" ? "completed" : customData.status;
      if (kind === "audio") nextCustomData.mediaUrl = stableUrl;
      delete nextCustomData.archiveError;
      delete nextCustomData.requiresSourceFile;
    } else {
      nextCustomData.cloudArchiveStatus = "failed";
      nextCustomData.archiveRetryState = "needs-file";
      nextCustomData.status = "failed";
      nextCustomData.requiresSourceFile = true;
      nextCustomData.archiveError = "云端归档未完成，请重新导入源文件后重试。";
    }
    return {
      ...element,
      ...(kind === "video" ? { link: archived ? stableUrl : null } : {}),
      customData: nextCustomData,
    };
  });
  return changed ? compacted : elements;
}

export function compactCanvasFilesForPersistence(elements = [], files = {}) {
  const persistentUrls = new Map();
  const referencedFileIds = new Set();
  for (const element of elements) {
    const fileId = String(element?.fileId ?? "");
    if (fileId && !element?.isDeleted) referencedFileIds.add(fileId);
    const storageUrl = persistentUrlFor(element);
    if (storageUrl) persistentUrls.set(element.fileId, storageUrl);
  }

  const compacted = {};
  for (const [id, file] of Object.entries(files ?? {})) {
    if (!file || !referencedFileIds.has(String(id))) continue;
    const storageUrl = persistentUrls.get(id);
    compacted[id] = {
      id: file.id ?? id,
      dataURL: storageUrl || file.dataURL,
      mimeType: file.mimeType,
      created: file.created,
    };
  }
  return compacted;
}

export function hydrateCanvasFilesForDisplay(elements = [], files = {}) {
  const uploadSessionByFileId = new Map();
  const storageObjectByFileId = new Map();
  for (const element of elements) {
    const fileId = String(element?.fileId ?? "");
    const uploadSessionId = String(element?.customData?.uploadSessionId ?? "").trim();
    const storageObjectId = String(element?.customData?.storageObjectId ?? "").trim();
    if (fileId && uploadSessionId) uploadSessionByFileId.set(fileId, uploadSessionId);
    if (fileId && storageObjectId) storageObjectByFileId.set(fileId, storageObjectId);
  }
  let changed = false;
  const hydrated = {};
  for (const [fileId, file] of Object.entries(files ?? {})) {
    const uploadSessionId = uploadSessionByFileId.get(String(fileId));
    const storageObjectUrl = storageObjectContentUrl(storageObjectByFileId.get(String(fileId)));
    const dataURL = String(file?.dataURL ?? "");
    if (storageObjectUrl && !/^(?:data:|blob:)/i.test(dataURL)) {
      if (dataURL !== storageObjectUrl) changed = true;
      hydrated[fileId] = { ...file, dataURL: storageObjectUrl };
      continue;
    }
    if (!uploadSessionId || /^(?:data:|blob:|\/api\/storage\/upload-sessions\/)/i.test(dataURL)) {
      hydrated[fileId] = file;
      continue;
    }
    changed = true;
    hydrated[fileId] = {
      ...file,
      dataURL: `/api/storage/upload-sessions/${encodeURIComponent(uploadSessionId)}/content`,
    };
  }
  return changed ? hydrated : files;
}

export function hydrateCanvasContentForDisplay(content = {}) {
  const elements = hydrateCanvasElementsForDisplay(
    compactCanvasElementsForPersistence(content.elements ?? []),
  );
  return {
    ...content,
    elements,
    files: hydrateCanvasFilesForDisplay(elements, content.files ?? {}),
  };
}

export async function prepareCanvasReferenceImageSources(files = [], options = {}) {
  const sources = [];
  for (const file of files) {
    if (typeof options.archive === "function") {
      const archived = await options.archive(file, { purpose: "new-canvas/reference-image" });
      const storageUrl = String(archived?.storageUrl ?? "").trim();
      if (!isStableCanvasMediaUrl(storageUrl)) {
        throw new Error("canvas_reference_image_archive_failed");
      }
      sources.push(storageUrl);
      continue;
    }
    if (typeof options.read !== "function") throw new Error("canvas_reference_image_reader_missing");
    sources.push(await options.read(file));
  }
  return sources;
}

export function createCanvasImageArchiveTracker(initialFiles = {}) {
  const seenFileIds = new Set(Object.keys(initialFiles ?? {}));
  return {
    seed(files = {}) {
      for (const fileId of Object.keys(files ?? {})) seenFileIds.add(fileId);
    },
    collect(elements = [], files = {}) {
      const candidates = [];
      for (const element of elements) {
        if (!element || element.isDeleted || element.type !== "image" || !element.fileId) continue;
        const fileId = String(element.fileId);
        if (seenFileIds.has(fileId)) continue;
        const file = files?.[fileId];
        if (!file) continue;
        const customData = element.customData ?? {};
        const dataURL = String(file.dataURL ?? "");
        const archiveStatus = String(customData.cloudArchiveStatus ?? "");
        const alreadyClassified = Boolean(archiveStatus && archiveStatus !== "local-only") || CLOUD_SOURCES.has(String(customData.source ?? ""));
        if (alreadyClassified || !dataURL.startsWith("data:image/")) {
          seenFileIds.add(fileId);
          continue;
        }
        seenFileIds.add(fileId);
        candidates.push({ fileId, elementId: element.id, file });
      }
      return candidates;
    },
    has(fileId) {
      return seenFileIds.has(String(fileId ?? ""));
    },
    release(fileId) {
      seenFileIds.delete(String(fileId ?? ""));
    },
  };
}

export function canvasBinaryFileToUploadFile(fileId, binaryFile) {
  const dataURL = String(binaryFile?.dataURL ?? "");
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataURL);
  if (!match || !String(match[1] ?? "").startsWith("image/")) {
    throw new Error("canvas_image_data_url_invalid");
  }
  const mimeType = String(binaryFile?.mimeType ?? match[1] ?? "image/png");
  const encoded = match[3] ?? "";
  let bytes;
  if (match[2]) {
    const decoded = globalThis.atob(encoded.replace(/\s/g, ""));
    bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(encoded));
  }
  const extension = IMAGE_EXTENSIONS[mimeType] ?? "png";
  const name = `canvas-image-${String(fileId ?? "image").replace(/[^a-zA-Z0-9_-]+/g, "-")}.${extension}`;
  const blob = new Blob([bytes], { type: mimeType });
  if (typeof globalThis.File === "function") {
    return new File([blob], name, { type: mimeType, lastModified: Date.now() });
  }
  Object.defineProperty(blob, "name", { configurable: true, value: name });
  return blob;
}

export function applyCanvasImageArchiveResult(elements = [], fileId, archive, options = {}) {
  const normalizedFileId = String(fileId ?? "");
  const archived = Boolean(archive && (archive.storageUrl || archive.storageObjectId));
  let changed = false;
  const nextElements = elements.map((element) => {
    if (!element || element.isDeleted || element.type !== "image" || String(element.fileId ?? "") !== normalizedFileId) {
      return element;
    }
    changed = true;
    const customData = element.customData ?? {};
    return {
      ...element,
      customData: {
        ...customData,
        source: archived ? "personal-library" : String(customData.source ?? "uploaded"),
        cloudArchiveStatus: archived ? "archived" : "local-only",
        ...(archive?.storageUrl ? { storageUrl: archive.storageUrl } : {}),
        ...(archive?.storageObjectId ? { storageObjectId: archive.storageObjectId } : {}),
        ...(archive?.uploadSessionId ? { uploadSessionId: archive.uploadSessionId } : {}),
        ...(archive?.mimeType ? { mimeType: archive.mimeType } : {}),
        ...(archive?.sourceAction || options.sourceAction ? { sourceAction: archive?.sourceAction ?? options.sourceAction } : {}),
      },
      version: (element.version ?? 1) + 1,
      versionNonce: Math.floor(Math.random() * 2_000_000_000),
      updated: Date.now(),
    };
  });
  return { elements: changed ? nextElements : elements, changed, archived };
}

export function isCanvasImageArchiveCandidateCurrent(candidate, elements = [], files = {}) {
  const fileId = String(candidate?.fileId ?? "");
  if (!fileId) return false;
  const originalDataURL = String(candidate?.file?.dataURL ?? "");
  const currentDataURL = String(files?.[fileId]?.dataURL ?? "");
  if (!originalDataURL || currentDataURL !== originalDataURL) return false;
  return elements.some((element) => {
    if (!element || element.isDeleted || element.type !== "image" || String(element.fileId ?? "") !== fileId) return false;
    const customData = element.customData ?? {};
    const archiveStatus = String(customData.cloudArchiveStatus ?? "");
    const alreadyClassified = Boolean(archiveStatus && archiveStatus !== "local-only") || CLOUD_SOURCES.has(String(customData.source ?? ""));
    return !alreadyClassified;
  });
}

export async function archiveNewCanvasImageFiles({ tracker, elements = [], files = {}, archive, isCurrent, apply } = {}) {
  if (!tracker || typeof archive !== "function") return [];
  const candidates = tracker.collect(elements, files);
  return Promise.all(candidates.map(async (candidate) => {
    let result = null;
    try {
      const uploadFile = canvasBinaryFileToUploadFile(candidate.fileId, candidate.file);
      result = await archive(uploadFile, candidate);
    } catch {
      result = null;
    }
    if (typeof isCurrent === "function" && !await isCurrent(candidate)) {
      return { ...candidate, archive: result, stale: true };
    }
    await apply?.(candidate, result);
    return { ...candidate, archive: result, stale: false };
  }));
}
