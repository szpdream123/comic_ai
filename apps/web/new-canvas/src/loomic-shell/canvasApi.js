import { insertVideoOnCanvas } from "../loomic-core/canvas-elements.js";
import { duplicateCanvasSelection } from "../loomic-core/canvas-selection-clipboard.js";
import { isStableCanvasMediaUrl } from "../loomic-core/canvas-file-persistence.js";
import { createUploadedAudioNodeElement } from "../loomic-core/workflow-node-elements.js";

const MEDIA_ARCHIVE_RETRY_DELAYS = [2000, 10000];

export function generateCanvasId() {
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 20);
}

export function dispatchKeyToCanvas(key, options = {}) {
  const target = document.querySelector(".excalidraw-container");
  if (!target) return;
  target.dispatchEvent(new KeyboardEvent("keydown", {
    key,
    code: `Key${key.toUpperCase()}`,
    metaKey: Boolean(options.metaKey),
    ctrlKey: Boolean(options.metaKey),
    shiftKey: Boolean(options.shiftKey),
    bubbles: true,
    cancelable: true,
  }));
}

export function duplicateSelectedElements(api) {
  if (!api?.getAppState || !api?.getSceneElements || !api?.updateScene) return;
  const selectedIds = api.getAppState()?.selectedElementIds ?? {};
  const elements = api.getSceneElements();
  const result = duplicateCanvasSelection(elements, selectedIds);
  if (!result.clones.length) return;

  api.updateScene({
    elements: result.elements,
    appState: { selectedElementIds: result.selectedElementIds },
    captureUpdate: "IMMEDIATELY",
  });
  return result.clones;
}

function scaleToFit(width, height, maxSize = 600) {
  if (width <= maxSize && height <= maxSize) return { width, height };
  const ratio = Math.min(maxSize / width, maxSize / height);
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

function viewportCenter(appState) {
  const zoom = appState?.zoom?.value ?? 1;
  return {
    x: -(appState?.scrollX ?? 0) + (appState?.width ?? 0) / (2 * zoom),
    y: -(appState?.scrollY ?? 0) + (appState?.height ?? 0) / (2 * zoom),
  };
}

function placementFromAnchor(anchor, width, height) {
  if (!Number.isFinite(anchor?.x) || !Number.isFinite(anchor?.y)) return null;
  return { x: anchor.x - width / 2, y: anchor.y - height / 2 };
}

function shouldInsertImportedMedia(options) {
  return typeof options.shouldInsert !== "function" || options.shouldInsert();
}

export async function archiveCanvasMediaFile(file, options = {}) {
  if (!file || typeof options.assetClient?.uploadFile !== "function") return null;
  const retryDelays = Array.isArray(options.retryDelays) ? options.retryDelays : MEDIA_ARCHIVE_RETRY_DELAYS;
  const sleep = options.sleep ?? ((delay) => new Promise((resolve) => setTimeout(resolve, delay)));
  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await options.assetClient.uploadFile(file, {
        purpose: options.purpose ?? "new-canvas/media-import",
      });
      const upload = result?.upload ?? {};
      const storageUrl = String(
        result?.uploadRecord?.publicUrl ??
        upload.publicUrl ??
        upload.sourceUrl ??
        result?.urls?.sourceUrl ??
        result?.urls?.previewUrl ??
        "",
      ).trim();
      const storageObjectId = String(upload.storageObjectId ?? result?.storageObject?.id ?? "").trim();
      if (!isStableCanvasMediaUrl(storageUrl)) throw new Error("canvas_media_archive_url_invalid");
      return {
        storageUrl,
        storageObjectId,
        uploadSessionId: String(upload.uploadSessionId ?? "").trim(),
        mimeType: String(upload.mimeType ?? file.type ?? "application/octet-stream").trim(),
        sourceAction: options.purpose ?? "new-canvas/media-import",
      };
    } catch {
      const delay = retryDelays[attempt];
      if (delay === undefined) return null;
      options.onRetry?.({ attempt: attempt + 1, delay: Math.max(0, Number(delay) || 0) });
      await sleep(Math.max(0, Number(delay) || 0));
    }
  }
}

export function archiveCanvasImageFile(file, options = {}) {
  return archiveCanvasMediaFile(file, {
    ...options,
    purpose: options.purpose ?? "new-canvas/image-import",
    retryDelays: options.retryDelays ?? [],
  });
}

export function getCanvasRebindMediaKind(element) {
  if (element?.type === "image") return "image";
  if (element?.type === "embeddable" && (element.customData?.isVideo || element.customData?.mediaKind === "video")) return "video";
  if (element?.customData?.type === "audio-node" && element.customData?.sourceKind === "upload") return "audio";
  return "";
}

export function canvasElementRequiresSourceFile(element) {
  const customData = element?.customData ?? {};
  return Boolean(customData.requiresSourceFile)
    || ["failed", "needs-file"].includes(String(customData.cloudArchiveStatus ?? ""))
    || String(customData.archiveRetryState ?? "") === "needs-file";
}

export async function rebindCanvasMediaFile(api, elementId, file, options = {}) {
  if (!api || !elementId || !file) return false;
  const elements = api.getSceneElements?.() ?? [];
  const element = elements.find((item) => item.id === elementId && !item.isDeleted);
  const mediaKind = getCanvasRebindMediaKind(element);
  if (!mediaKind || !String(file.type ?? "").startsWith(`${mediaKind}/`)) {
    api.setToast?.({ message: "请选择与原素材相同类型的文件。", closable: true });
    return false;
  }

  const archive = await archiveCanvasMediaFile(file, {
    ...options,
    purpose: options.purpose ?? `new-canvas/${mediaKind}-rebind`,
    onRetry: options.onRetry ?? ((retry) => api.setToast?.({ message: `素材上传失败，${Math.ceil(retry.delay / 1000)} 秒后自动重试。`, closable: true })),
  });
  if (!archive) {
    api.setToast?.({ message: "源文件上传失败，原素材保持不变。", closable: true });
    return false;
  }

  let dataURL = "";
  if (mediaKind === "image") {
    try {
      dataURL = await (options.readFile ?? readCanvasFileAsDataUrl)(file);
    } catch {
      api.setToast?.({ message: "图片读取失败，原素材保持不变。", closable: true });
      return false;
    }
  }
  const durationSeconds = mediaKind === "image"
    ? undefined
    : await (options.readDuration ?? readCanvasFileMediaDuration)(file, mediaKind);
  const customData = {
    ...(element.customData ?? {}),
    title: file.name || element.customData?.title,
    ...(mediaKind === "audio" ? { fileName: file.name || element.customData?.fileName } : {}),
    ...(mediaKind !== "image" ? { sourceKind: "upload", mediaKind } : {}),
    source: "personal-library",
    status: "completed",
    cloudArchiveStatus: "archived",
    archiveRetryState: "archived",
    storageUrl: archive.storageUrl,
    storageObjectId: archive.storageObjectId,
    uploadSessionId: archive.uploadSessionId,
    sourceAction: archive.sourceAction,
    mimeType: archive.mimeType || file.type,
    ...(durationSeconds ? { durationSeconds } : {}),
    ...(mediaKind === "audio" ? { mediaUrl: archive.storageUrl } : {}),
  };
  delete customData.requiresSourceFile;
  delete customData.archiveError;
  const updated = {
    ...element,
    ...(mediaKind === "video" ? { link: archive.storageUrl } : {}),
    customData,
    version: (element.version ?? 1) + 1,
    versionNonce: Math.floor(Math.random() * 2_000_000_000),
    updated: Date.now(),
  };
  if (mediaKind === "image" && element.fileId) {
    api.addFiles?.([{ id: element.fileId, dataURL, mimeType: archive.mimeType || file.type, created: Date.now() }]);
  }
  api.updateScene?.({
    elements: elements.map((item) => item.id === element.id ? updated : item),
    appState: { selectedElementIds: { [element.id]: true } },
    captureUpdate: "IMMEDIATELY",
  });
  api.scrollToContent?.(updated, { fitToContent: false, animate: true, duration: 250 });
  api.setToast?.({ message: "源文件已重新绑定并归档。", closable: true });
  return true;
}

export function readCanvasFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("文件读取失败"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

export function readCanvasMediaDuration(dataUrl, mediaType) {
  if (typeof document === "undefined") return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const media = document.createElement(mediaType === "audio" ? "audio" : "video");
    const finish = (value) => {
      media.removeAttribute("src");
      resolve(Number.isFinite(value) && value > 0 ? Math.round(value * 10) / 10 : undefined);
    };
    media.preload = "metadata";
    media.onloadedmetadata = () => finish(Number(media.duration));
    media.onerror = () => finish(undefined);
    media.src = dataUrl;
  });
}

async function readCanvasFileMediaDuration(file, mediaType) {
  if (typeof globalThis.URL?.createObjectURL !== "function") return undefined;
  const localUrl = globalThis.URL.createObjectURL(file);
  try {
    return await readCanvasMediaDuration(localUrl, mediaType);
  } finally {
    globalThis.URL.revokeObjectURL?.(localUrl);
  }
}

export async function importImageToCanvas(api, file, options = {}) {
  if (!api || !file || !shouldInsertImportedMedia(options)) return Promise.resolve(false);
  const archiveRequested = typeof options.assetClient?.uploadFile === "function";
  const archive = await archiveCanvasImageFile(file, options);
  if (!shouldInsertImportedMedia(options)) return false;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("图片读取失败"));
    reader.onload = () => {
      if (!shouldInsertImportedMedia(options)) {
        resolve(false);
        return;
      }
      const dataURL = String(reader.result ?? "");
      const image = new Image();
      image.onerror = () => reject(new Error("图片解析失败"));
      image.onload = () => {
        if (!shouldInsertImportedMedia(options)) {
          resolve(false);
          return;
        }
        const fileId = generateCanvasId();
        api.addFiles?.([{ id: fileId, dataURL, mimeType: file.type || "image/png", created: Date.now() }]);
        const size = scaleToFit(image.naturalWidth || image.width, image.naturalHeight || image.height);
        const center = viewportCenter(api.getAppState?.() ?? {});
        const placement = placementFromAnchor(options.anchor, size.width, size.height) ?? {
          x: center.x - size.width / 2,
          y: center.y - size.height / 2,
        };
        const element = {
          type: "image",
          id: generateCanvasId(),
          ...placement,
          width: size.width,
          height: size.height,
          angle: 0,
          fileId,
          strokeColor: "#000000",
          backgroundColor: "transparent",
          fillStyle: "solid",
          strokeWidth: 1,
          strokeStyle: "solid",
          roughness: 0,
          opacity: 100,
          groupIds: [],
          roundness: null,
          boundElements: null,
          frameId: null,
          index: null,
          seed: Math.floor(Math.random() * 2_000_000_000),
          version: 1,
          versionNonce: Math.floor(Math.random() * 2_000_000_000),
          isDeleted: false,
          updated: Date.now(),
          link: null,
          locked: false,
          status: "saved",
          scale: [1, 1],
          crop: null,
          customData: {
            title: file.name,
            source: archive ? "personal-library" : "uploaded",
            cloudArchiveStatus: archive ? "archived" : "local-only",
            ...(archive?.storageUrl ? { storageUrl: archive.storageUrl } : {}),
            ...(archive?.storageObjectId ? { storageObjectId: archive.storageObjectId } : {}),
            ...(archive?.uploadSessionId ? { uploadSessionId: archive.uploadSessionId } : {}),
            ...(archive?.mimeType ? { mimeType: archive.mimeType } : {}),
            ...(archive?.sourceAction ? { sourceAction: archive.sourceAction } : {}),
          },
        };
        api.updateScene?.({
          elements: [...(api.getSceneElements?.() ?? []), element],
          captureUpdate: "IMMEDIATELY",
        });
        if (archiveRequested && !archive) {
          api.setToast?.({ message: "图片已插入画布，云端归档失败。", closable: true });
        }
        resolve(true);
      };
      image.src = dataURL;
    };
    reader.readAsDataURL(file);
  });
}

function updateInsertedMediaElement(api, elementId, customData) {
  const elements = api.getSceneElements?.() ?? [];
  const element = elements.find((item) => item.id === elementId);
  if (!element) return null;
  const updated = { ...element, customData: { ...element.customData, ...customData } };
  api.updateScene?.({
    elements: elements.map((item) => item.id === elementId ? updated : item),
    appState: { selectedElementIds: { [elementId]: true } },
    captureUpdate: "IMMEDIATELY",
  });
  api.scrollToContent?.(updated, { fitToContent: false, animate: true, duration: 250 });
  return updated;
}

export async function importVideoToCanvas(api, file, options = {}) {
  if (!api || !file || !shouldInsertImportedMedia(options)) return false;
  const archiveRequested = typeof options.assetClient?.uploadFile === "function";
  const archiveOptions = {
    ...options,
    purpose: options.purpose ?? "new-canvas/video-import",
    onRetry: options.onRetry ?? ((retry) => {
      if (shouldInsertImportedMedia(options)) api.setToast?.({ message: `视频上传失败，${Math.ceil(retry.delay / 1000)} 秒后自动重试。`, closable: true });
    }),
  };
  const archive = await archiveCanvasMediaFile(file, archiveOptions);
  if (!shouldInsertImportedMedia(options)) return false;
  if (!archive) {
    api.setToast?.({ message: archiveRequested ? "视频上传失败，未写入画布；请检查网络后重新导入。" : "当前环境无法归档视频，未写入画布。", closable: true });
    return false;
  }
  const durationSeconds = await readCanvasFileMediaDuration(file, "video");
  if (!shouldInsertImportedMedia(options)) return false;
  const elementId = await insertVideoOnCanvas(api, {
    url: archive.storageUrl,
    title: file.name,
    mimeType: archive?.mimeType || file.type || "video/mp4",
    durationSeconds,
    ...(options.anchor ? { placement: placementFromAnchor(options.anchor, 800, 450) } : {}),
  }, { shouldInsert: options.shouldInsert });
  if (!elementId || !shouldInsertImportedMedia(options)) return false;
  updateInsertedMediaElement(api, elementId, {
    title: file.name,
    sourceKind: "upload",
    source: archive ? "personal-library" : "uploaded",
    mediaKind: "video",
    mimeType: archive?.mimeType || file.type || "video/mp4",
    durationSeconds,
    status: "completed",
    cloudArchiveStatus: "archived",
    archiveRetryState: "archived",
    ...(archive?.storageUrl ? { storageUrl: archive.storageUrl } : {}),
    ...(archive?.storageObjectId ? { storageObjectId: archive.storageObjectId } : {}),
    ...(archive?.uploadSessionId ? { uploadSessionId: archive.uploadSessionId } : {}),
    ...(archive?.sourceAction ? { sourceAction: archive.sourceAction } : {}),
  });
  return true;
}

export async function importAudioToCanvas(api, file, options = {}) {
  if (!api || !file || !shouldInsertImportedMedia(options)) return false;
  const archiveRequested = typeof options.assetClient?.uploadFile === "function";
  const archiveOptions = {
    ...options,
    purpose: options.purpose ?? "new-canvas/audio-import",
    onRetry: options.onRetry ?? ((retry) => {
      if (shouldInsertImportedMedia(options)) api.setToast?.({ message: `音频上传失败，${Math.ceil(retry.delay / 1000)} 秒后自动重试。`, closable: true });
    }),
  };
  const archive = await archiveCanvasMediaFile(file, archiveOptions);
  if (!shouldInsertImportedMedia(options)) return false;
  if (!archive) {
    api.setToast?.({ message: archiveRequested ? "音频上传失败，未写入画布；请检查网络后重新导入。" : "当前环境无法归档音频，未写入画布。", closable: true });
    return false;
  }
  const durationSeconds = await readCanvasFileMediaDuration(file, "audio");
  if (!shouldInsertImportedMedia(options)) return false;
  const elementId = createUploadedAudioNodeElement(api, {
    title: file.name,
    fileName: file.name,
    mediaUrl: archive.storageUrl,
    storageUrl: archive?.storageUrl,
    storageObjectId: archive?.storageObjectId,
    uploadSessionId: archive?.uploadSessionId,
    sourceAction: archive?.sourceAction,
    source: archive ? "personal-library" : "uploaded",
    mimeType: archive?.mimeType || file.type || "audio/mpeg",
    durationSeconds,
    cloudArchiveStatus: "archived",
    ...(options.anchor ? { anchor: options.anchor } : {}),
  });
  const element = (api.getSceneElements?.() ?? []).find((item) => item.id === elementId);
  if (element) {
    api.updateScene?.({ appState: { selectedElementIds: { [elementId]: true } }, captureUpdate: "NONE" });
    api.scrollToContent?.(element, { fitToContent: false, animate: true, duration: 250 });
  }
  return true;
}

export async function importMediaFilesToCanvas(api, files, options = {}) {
  const supported = Array.from(files ?? []).filter((file) => /^(?:image|video|audio)\//.test(file?.type ?? ""));
  const results = [];
  for (const file of supported) {
    if (!shouldInsertImportedMedia(options)) {
      results.push(false);
      continue;
    }
    try {
      if (file.type.startsWith("video/")) {
        const importer = options.importVideo ?? importVideoToCanvas;
        results.push(Boolean(await importer(api, file, { ...options, purpose: options.videoPurpose ?? "new-canvas/video-import" })));
      } else if (file.type.startsWith("audio/")) {
        const importer = options.importAudio ?? importAudioToCanvas;
        results.push(Boolean(await importer(api, file, { ...options, purpose: options.audioPurpose ?? "new-canvas/audio-import" })));
      } else {
        const importer = options.importImage ?? importImageToCanvas;
        results.push(Boolean(await importer(api, file, { ...options, purpose: options.imagePurpose ?? "new-canvas/image-import" })));
      }
    } catch (error) {
      results.push(false);
      if (shouldInsertImportedMedia(options)) {
        api?.setToast?.({
          message: `${file.name || "素材"} 导入失败：${error instanceof Error ? error.message : "文件读取失败"}`,
          closable: true,
        });
      }
    }
  }
  return results;
}
