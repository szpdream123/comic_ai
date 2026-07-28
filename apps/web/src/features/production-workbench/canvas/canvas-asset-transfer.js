import { resolveApiUrl } from "../../../shared/creator-api.js";

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
    resolveApiUrl(`/api/storage/objects/${encodeURIComponent(storageObjectId)}/content`),
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

