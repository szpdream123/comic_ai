import { resolveApiUrl } from "../../../shared/creator-api.js";

const JSZIP_VENDOR_SRC = "/vendor/jszip/dist/jszip.min.js";
let jsZipLoadPromise = null;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function transferError(code, status = 0) {
  const error = new Error(code);
  error.errorCode = code;
  error.status = status;
  return error;
}

export function normalizeCanvasAssetFileName(value, fallback = "canvas-asset") {
  const normalized = text(value).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, " ");
  return normalized || fallback;
}

export async function fetchCanvasAssetBlob(input = {}) {
  const storageObjectId = text(input.storageObjectId);
  if (!storageObjectId) throw transferError("canvas_asset_storage_object_required");
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw transferError("canvas_asset_fetch_unavailable");

  const response = await fetchImpl(
    resolveApiUrl(`/api/storage/objects/${encodeURIComponent(storageObjectId)}/content?download=1`),
    {
      credentials: "include",
      cache: "no-store",
      signal: input.signal,
    },
  );
  if (!response?.ok) {
    throw transferError(`canvas_asset_transfer_failed:${Number(response?.status ?? 0)}`, Number(response?.status ?? 0));
  }

  const headerTotal = Number(response.headers?.get?.("content-length"));
  const totalBytes = Number.isFinite(headerTotal) && headerTotal >= 0 ? headerTotal : null;
  const contentType = text(response.headers?.get?.("content-type")?.split?.(";")?.[0]) || "application/octet-stream";
  const reader = response.body?.getReader?.();
  if (!reader) {
    const blob = await response.blob();
    input.onProgress?.({ loaded: blob.size, total: totalBytes ?? blob.size, progress: 1 });
    return { blob, totalBytes: blob.size, contentType };
  }

  const chunks = [];
  let loaded = 0;
  while (true) {
    if (input.signal?.aborted) throw transferError("canvas_asset_transfer_cancelled");
    const chunk = await reader.read();
    if (chunk.done) break;
    if (!chunk.value?.byteLength) continue;
    chunks.push(chunk.value);
    loaded += chunk.value.byteLength;
    input.onProgress?.({
      loaded,
      total: totalBytes,
      progress: totalBytes && totalBytes > 0 ? Math.min(1, loaded / totalBytes) : null,
    });
  }
  if (totalBytes !== null && loaded !== totalBytes) {
    throw transferError("canvas_asset_transfer_incomplete");
  }
  const blob = new Blob(chunks, { type: contentType });
  input.onProgress?.({ loaded, total: totalBytes ?? loaded, progress: 1 });
  return { blob, totalBytes: loaded, contentType };
}

export async function downloadCanvasAsset(input = {}) {
  const result = await fetchCanvasAssetBlob(input);
  const documentRef = input.documentRef ?? globalThis.document;
  const urlApi = input.urlApi ?? globalThis.URL;
  if (!documentRef?.createElement || typeof urlApi?.createObjectURL !== "function") {
    throw transferError("canvas_asset_download_unavailable");
  }
  const url = urlApi.createObjectURL(result.blob);
  try {
    const anchor = documentRef.createElement("a");
    anchor.href = url;
    anchor.download = normalizeCanvasAssetFileName(input.fileName);
    anchor.hidden = true;
    documentRef.body?.append?.(anchor);
    anchor.click?.();
    anchor.remove?.();
  } finally {
    urlApi.revokeObjectURL?.(url);
  }
  return result;
}

export async function downloadCanvasAssetArchive(input = {}) {
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) throw transferError("canvas_asset_archive_empty");
  const JSZipCtor = input.JSZipCtor ?? await loadCanvasJsZip(input.documentRef ?? globalThis.document);
  const zip = new JSZipCtor();
  const usedNames = new Set();
  let downloaded = 0;
  let failed = 0;
  for (const item of items) {
    try {
      const result = await fetchCanvasDownloadItemBlob(item, input);
      const fileName = uniqueCanvasArchiveFileName(
        normalizeCanvasAssetFileName(item.fileName, "canvas-asset"),
        result.contentType,
        usedNames,
      );
      zip.file(fileName, result.blob);
      downloaded += 1;
    } catch {
      failed += 1;
    }
  }
  if (!downloaded) throw transferError("canvas_asset_archive_download_failed");
  const archive = await zip.generateAsync({ type: "blob", compression: "STORE" });
  triggerBlobDownload(archive, ensureCanvasArchiveFileName(input.fileName), input);
  return { downloaded, failed, total: items.length, blob: archive };
}

export async function copyCanvasAsset(input = {}) {
  const result = await fetchCanvasAssetBlob(input);
  const clipboard = input.clipboard ?? globalThis.navigator?.clipboard;
  const ClipboardItemCtor = input.ClipboardItemCtor ?? globalThis.ClipboardItem;
  if (typeof clipboard?.write !== "function" || typeof ClipboardItemCtor !== "function") {
    throw transferError("canvas_asset_clipboard_unavailable");
  }
  await clipboard.write([new ClipboardItemCtor({ [result.contentType]: result.blob })]);
  return result;
}

async function fetchCanvasDownloadItemBlob(item, input) {
  const textContent = typeof item?.textContent === "string" ? item.textContent : "";
  if (textContent) {
    const contentType = text(item?.mediaKind).toLowerCase() === "markdown" ? "text/markdown" : "text/plain";
    return { blob: new Blob([textContent], { type: `${contentType};charset=utf-8` }), contentType };
  }
  if (text(item?.storageObjectId)) {
    return fetchCanvasAssetBlob({
      storageObjectId: item.storageObjectId,
      fetchImpl: input.fetchImpl,
      signal: input.signal,
    });
  }
  const url = text(item?.url);
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (!url || typeof fetchImpl !== "function") throw transferError("canvas_asset_download_source_missing");
  const response = await fetchImpl(resolveApiUrl(url), {
    credentials: "include",
    cache: "no-store",
    signal: input.signal,
  });
  if (!response?.ok) {
    throw transferError(`canvas_asset_transfer_failed:${Number(response?.status ?? 0)}`, Number(response?.status ?? 0));
  }
  const blob = await response.blob();
  const contentType = text(response.headers?.get?.("content-type")?.split?.(";")?.[0])
    || text(blob?.type?.split?.(";")?.[0])
    || "application/octet-stream";
  return { blob, contentType };
}

function loadCanvasJsZip(documentRef) {
  if (typeof globalThis.JSZip === "function") return Promise.resolve(globalThis.JSZip);
  if (!documentRef?.createElement) return Promise.reject(transferError("canvas_asset_archive_unavailable"));
  if (jsZipLoadPromise) return jsZipLoadPromise;
  jsZipLoadPromise = new Promise((resolve, reject) => {
    const existing = documentRef.querySelector?.(`script[src="${JSZIP_VENDOR_SRC}"]`);
    const script = existing ?? documentRef.createElement("script");
    const complete = () => {
      if (typeof globalThis.JSZip === "function") resolve(globalThis.JSZip);
      else reject(transferError("canvas_asset_archive_unavailable"));
    };
    script.addEventListener?.("load", complete, { once: true });
    script.addEventListener?.("error", () => reject(transferError("canvas_asset_archive_unavailable")), { once: true });
    if (!existing) {
      script.src = JSZIP_VENDOR_SRC;
      script.async = true;
      documentRef.head?.append?.(script);
    }
  }).catch((error) => {
    jsZipLoadPromise = null;
    throw error;
  });
  return jsZipLoadPromise;
}

function triggerBlobDownload(blob, fileName, input) {
  const documentRef = input.documentRef ?? globalThis.document;
  const urlApi = input.urlApi ?? globalThis.URL;
  if (!documentRef?.createElement || typeof urlApi?.createObjectURL !== "function") {
    throw transferError("canvas_asset_download_unavailable");
  }
  const url = urlApi.createObjectURL(blob);
  try {
    const anchor = documentRef.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.hidden = true;
    documentRef.body?.append?.(anchor);
    anchor.click?.();
    anchor.remove?.();
  } finally {
    urlApi.revokeObjectURL?.(url);
  }
}

function ensureCanvasArchiveFileName(value) {
  const fileName = normalizeCanvasAssetFileName(value, "canvas-download.zip");
  return fileName.toLowerCase().endsWith(".zip") ? fileName : `${fileName}.zip`;
}

function uniqueCanvasArchiveFileName(fileName, contentType, usedNames) {
  const extension = canvasContentTypeExtension(contentType);
  const withExtension = /\.[a-z0-9]{1,8}$/i.test(fileName) || !extension ? fileName : `${fileName}${extension}`;
  if (!usedNames.has(withExtension)) {
    usedNames.add(withExtension);
    return withExtension;
  }
  const match = /^(.*?)(\.[a-z0-9]{1,8})?$/i.exec(withExtension);
  const baseName = match?.[1] || "canvas-asset";
  const suffix = match?.[2] || "";
  let index = 2;
  while (usedNames.has(`${baseName}-${index}${suffix}`)) index += 1;
  const uniqueName = `${baseName}-${index}${suffix}`;
  usedNames.add(uniqueName);
  return uniqueName;
}

function canvasContentTypeExtension(contentType) {
  return ({
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/ogg": ".ogg",
    "text/plain": ".txt",
    "text/markdown": ".md",
  })[text(contentType).toLowerCase()] ?? "";
}
