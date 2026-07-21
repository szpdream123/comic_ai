export const CANVAS_EXPORT_EMPTY = "canvas_export_empty";

function canvasExportError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export async function exportCanvasImage(api, options = {}) {
  const elements = (api?.getSceneElements?.() ?? []).filter((element) => !element?.isDeleted);
  if (!elements.length) {
    throw canvasExportError(CANVAS_EXPORT_EMPTY, "画布中暂无可导出的内容。");
  }

  const exportToBlob = options.exportToBlob
    ?? (await import("@excalidraw/excalidraw")).exportToBlob;
  return exportToBlob({
    elements,
    appState: {
      ...(api?.getAppState?.() ?? {}),
      exportBackground: options.exportBackground ?? true,
    },
    files: api?.getFiles?.() ?? {},
    mimeType: options.mimeType ?? "image/png",
    maxWidthOrHeight: options.maxWidthOrHeight,
  });
}

export function downloadCanvasImageBlob(blob, options = {}) {
  if (!blob || (Number.isFinite(blob.size) && blob.size <= 0)) {
    throw canvasExportError("canvas_export_blob_empty", "导出的图片内容为空。");
  }

  const documentRef = options.document ?? globalThis.document;
  const urlApi = options.urlApi ?? globalThis.URL;
  const host = documentRef?.body ?? documentRef?.documentElement;
  if (!documentRef?.createElement || !host?.appendChild || !urlApi?.createObjectURL || !urlApi?.revokeObjectURL) {
    throw canvasExportError("canvas_export_download_unavailable", "当前浏览器无法下载导出的图片。");
  }

  const objectUrl = urlApi.createObjectURL(blob);
  let anchor;
  try {
    anchor = documentRef.createElement("a");
    anchor.href = objectUrl;
    anchor.download = options.filename ?? "loomic-canvas.png";
    anchor.hidden = true;
    host.appendChild(anchor);
    anchor.click();
  } finally {
    anchor?.remove?.();
    urlApi.revokeObjectURL(objectUrl);
  }
}
