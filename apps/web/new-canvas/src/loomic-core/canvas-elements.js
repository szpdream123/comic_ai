const VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".mov"];

export function generateCanvasId() {
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 20);
}

export function isVideoUrl(url) {
  if (!url) return false;
  try {
    const pathname = new URL(url, "https://placeholder.invalid").pathname.toLowerCase();
    return VIDEO_EXTENSIONS.some((extension) => pathname.endsWith(extension));
  } catch {
    const value = String(url).toLowerCase();
    return VIDEO_EXTENSIONS.some((extension) => value.includes(extension));
  }
}

export function scaleToFit(width, height, maxSize) {
  if (!width || !height) return { width: maxSize, height: maxSize };
  if (width <= maxSize && height <= maxSize) return { width, height };
  const ratio = Math.min(maxSize / width, maxSize / height);
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

export function getViewportCenter(appState = {}) {
  const zoom = appState.zoom?.value ?? 1;
  return {
    x: -(appState.scrollX ?? 0) + (appState.width ?? window.innerWidth) / (2 * zoom),
    y: -(appState.scrollY ?? 0) + (appState.height ?? window.innerHeight) / (2 * zoom),
  };
}

export function createTextNodeElement(api, options = {}) {
  const text = String(options.text ?? "输入文本...");
  const fontSize = Number(options.fontSize) || 24;
  const lineHeight = 1.25;
  const id = generateCanvasId();
  const width = Math.max(160, Math.ceil(text.length * fontSize));
  const height = Math.ceil(fontSize * lineHeight);
  const placement = findCanvasPlacement(api, width, height);
  const element = {
    type: "text",
    id,
    ...placement,
    width,
    height,
    angle: 0,
    strokeColor: options.strokeColor ?? "#1b1b1b",
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
    fontSize,
    fontFamily: Number(options.fontFamily) || 5,
    text,
    textAlign: "left",
    verticalAlign: "top",
    containerId: null,
    originalText: text,
    autoResize: true,
    lineHeight,
    customData: { type: "text-node", title: text, ...(options.customData ?? {}) },
  };
  api.updateScene({ elements: [...api.getSceneElements(), element], captureUpdate: "IMMEDIATELY" });
  return id;
}

export function createExcalidrawImageElement(options) {
  const element = {
    type: "image",
    id: generateCanvasId(),
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.height,
    angle: 0,
    fileId: options.fileId,
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
  };
  if (options.title || options.source || options.storageUrl || options.storageObjectId || options.mimeType) {
    element.customData = {
      ...(options.title ? { title: options.title } : {}),
      ...(options.source ? { source: options.source } : {}),
      ...(options.storageUrl ? { storageUrl: options.storageUrl } : {}),
      ...(options.storageObjectId ? { storageObjectId: options.storageObjectId } : {}),
      ...(options.mimeType ? { mimeType: options.mimeType } : {}),
      ...(options.cloudArchiveStatus ? { cloudArchiveStatus: options.cloudArchiveStatus } : {}),
      ...(options.sourceAction ? { sourceAction: options.sourceAction } : {}),
    };
  }
  return element;
}

export function createExcalidrawVideoElement(options) {
  return {
    type: "embeddable",
    id: generateCanvasId(),
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.height,
    angle: 0,
    strokeColor: "#000000",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    roundness: { type: 3 },
    boundElements: null,
    frameId: null,
    index: null,
    seed: Math.floor(Math.random() * 2_000_000_000),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2_000_000_000),
    isDeleted: false,
    updated: Date.now(),
    link: options.url,
    locked: false,
    customData: {
      isVideo: true,
      mediaKind: "video",
      mimeType: options.mimeType || "video/mp4",
      durationSeconds: options.durationSeconds,
      title: options.title?.slice(0, 60),
      prompt: options.title,
      ...(options.source ? { source: options.source } : {}),
      ...(options.sourceKind ? { sourceKind: options.sourceKind } : {}),
      ...(options.storageUrl ? { storageUrl: options.storageUrl } : {}),
      ...(options.storageObjectId ? { storageObjectId: options.storageObjectId } : {}),
      ...(options.cloudArchiveStatus ? { cloudArchiveStatus: options.cloudArchiveStatus } : {}),
      ...(options.sourceAction ? { sourceAction: options.sourceAction } : {}),
    },
  };
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error("无法读取文件"));
    reader.readAsDataURL(blob);
  });
}

function readImageDimensions(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("无法解析图片尺寸"));
    image.src = dataUrl;
  });
}

export function findCanvasPlacement(api, width, height) {
  const elements = api.getSceneElements().filter((element) => !element.isDeleted);
  if (!elements.length) {
    const center = getViewportCenter(api.getAppState());
    return { x: center.x - width / 2, y: center.y - height / 2 };
  }
  const rightmost = elements.reduce((candidate, element) => {
    const right = (element.x ?? 0) + (element.width ?? 0);
    return right > candidate.right ? { element, right } : candidate;
  }, { element: elements[0], right: -Infinity });
  return {
    x: rightmost.right + 40,
    y: (rightmost.element.y ?? 0) + (rightmost.element.height ?? 0) / 2 - height / 2,
  };
}

export async function insertImageFileOnCanvas(api, file, options = {}) {
  const dataURL = await readBlobAsDataUrl(file);
  const sourceSize = await readImageDimensions(dataURL);
  const dimensions = scaleToFit(sourceSize.width, sourceSize.height, options.maxSize ?? 600);
  if (typeof options.shouldInsert === "function" && !options.shouldInsert()) return null;
  const placement = options.placement ?? findCanvasPlacement(api, dimensions.width, dimensions.height);
  const fileId = generateCanvasId();
  api.addFiles([{ id: fileId, dataURL, mimeType: file.type || "image/png", created: Date.now() }]);
  const element = createExcalidrawImageElement({
    fileId,
    ...placement,
    ...dimensions,
    title: options.title ?? file.name,
    source: options.source ?? "uploaded",
    storageUrl: options.storageUrl,
    storageObjectId: options.storageObjectId,
    mimeType: options.mimeType ?? file.type,
    cloudArchiveStatus: options.cloudArchiveStatus,
    sourceAction: options.sourceAction,
  });
  api.updateScene({ elements: [...api.getSceneElements(), element], captureUpdate: "IMMEDIATELY" });
  return element.id;
}

export async function insertImageOnCanvas(api, artifact, options = {}) {
  const response = await fetch(artifact.url);
  if (!response.ok) throw new Error(`图片读取失败: ${response.status}`);
  const blob = await response.blob();
  const file = new File([blob], artifact.title || "image", { type: artifact.mimeType || blob.type });
  return insertImageFileOnCanvas(api, file, {
    placement: artifact.placement,
    title: artifact.title,
    source: "generated",
    storageUrl: artifact.storageUrl || artifact.url,
    storageObjectId: artifact.storageObjectId,
    mimeType: artifact.mimeType || blob.type,
    cloudArchiveStatus: stableMediaUrl(artifact.url) ? "archived" : "local-only",
    sourceAction: "generated",
    shouldInsert: options.shouldInsert,
  });
}

export async function insertVideoOnCanvas(api, artifact, options = {}) {
  if (typeof options.shouldInsert === "function" && !options.shouldInsert()) return null;
  const dimensions = scaleToFit(artifact.width || 1280, artifact.height || 720, 800);
  const placement = artifact.placement ?? findCanvasPlacement(api, dimensions.width, dimensions.height);
  const element = createExcalidrawVideoElement({
    url: artifact.url,
    ...placement,
    ...dimensions,
    mimeType: artifact.mimeType,
    durationSeconds: artifact.durationSeconds,
    title: artifact.title,
    source: "generated",
    sourceKind: "generated",
    storageUrl: artifact.storageUrl || artifact.url,
    storageObjectId: artifact.storageObjectId,
    cloudArchiveStatus: stableMediaUrl(artifact.url) ? "archived" : "local-only",
    sourceAction: "generated",
  });
  api.updateScene({ elements: [...api.getSceneElements(), element], captureUpdate: "IMMEDIATELY" });
  return element.id;
}

function stableMediaUrl(value) {
  const url = String(value ?? "").trim();
  return Boolean(url) && !/^(?:data:|blob:)/i.test(url);
}
