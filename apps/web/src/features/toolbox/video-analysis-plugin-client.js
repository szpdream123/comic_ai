const REQUIRED_FRAME_RATE = 6;
const FRAMES_PER_TIMELINE_SHEET = 48;
const MAX_KEY_FRAMES = 12;
const MAX_MODEL_IMAGE_BYTES = 19 * 1024 * 1024;

export async function buildVideoModelFrameSheets(output, options = {}) {
  const frames = Array.isArray(output?.timelineFrames) ? output.timelineFrames : [];
  const frameRate = Number(output?.sampling?.frameRate ?? 0);
  if (frameRate < REQUIRED_FRAME_RATE || !frames.length) {
    throw new Error("视频时间轴不足 6 FPS，无法进行完整反推");
  }
  if (typeof globalThis.document?.createElement !== "function") {
    throw new Error("当前浏览器不支持整理视频时间轴");
  }

  const timelineSheets = [];
  let totalBytes = 0;
  const totalSheets = Math.ceil(frames.length / FRAMES_PER_TIMELINE_SHEET);
  for (let index = 0; index < frames.length; index += FRAMES_PER_TIMELINE_SHEET) {
    const sheetFrames = frames.slice(index, index + FRAMES_PER_TIMELINE_SHEET);
    const encoded = await renderFrameSheet(sheetFrames, {
      columns: 8,
      rows: 6,
      width: 1280,
      height: 960,
      label: `6 FPS 时间轴 ${Math.floor(index / FRAMES_PER_TIMELINE_SHEET) + 1}/${totalSheets}`,
    });
    totalBytes += encoded.byteLength;
    ensureModelImageBudget(totalBytes);
    timelineSheets.push(encoded.dataUrl);
    options.onProgress?.({
      progress: Math.round(((index + sheetFrames.length) / frames.length) * 85),
      stage: "timeline",
    });
  }

  const keyFrames = selectRepresentativeFrames(output, MAX_KEY_FRAMES);
  const keyFrameSheets = [];
  for (let index = 0; index < keyFrames.length; index += 1) {
    const encoded = await renderFrameSheet([keyFrames[index]], {
      columns: 1,
      rows: 1,
      width: 768,
      height: 768,
      label: `场景细节 ${index + 1}/${keyFrames.length}`,
    });
    totalBytes += encoded.byteLength;
    ensureModelImageBudget(totalBytes);
    keyFrameSheets.push(encoded.dataUrl);
    options.onProgress?.({
      progress: 85 + Math.round(((index + 1) / Math.max(1, keyFrames.length)) * 15),
      stage: "keyframes",
    });
  }

  const durationMsValue = Number(output?.source?.durationMs);
  return {
    frameSheetDataUrls: [...timelineSheets, ...keyFrameSheets],
    timelineSheetCount: timelineSheets.length,
    keyFrameCount: keyFrameSheets.length,
    frameRate,
    frameCount: frames.length,
    durationMs: Number.isFinite(durationMsValue) && durationMsValue > 0 ? durationMsValue : null,
  };
}

function selectRepresentativeFrames(output, limit) {
  const frames = Array.isArray(output?.timelineFrames) ? output.timelineFrames : [];
  const byFileName = new Map(frames.map((frame) => [String(frame?.fileName ?? ""), frame]));
  const candidates = (Array.isArray(output?.segments) ? output.segments : [])
    .map((segment) => byFileName.get(String(segment?.representativeFrame ?? "")))
    .filter(Boolean);
  const unique = [...new Map(candidates.map((frame) => [String(frame.url ?? frame.fileName), frame])).values()];
  if (unique.length <= limit) return unique;
  return Array.from({ length: limit }, (_, index) => unique[Math.round(index * (unique.length - 1) / (limit - 1))]);
}

async function renderFrameSheet(frames, layout) {
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("当前浏览器无法创建视频时间轴画布");
  context.fillStyle = "#080b10";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const headerHeight = 28;
  const tileWidth = canvas.width / layout.columns;
  const tileHeight = (canvas.height - headerHeight) / layout.rows;
  context.fillStyle = "#dce6ee";
  context.font = "600 14px sans-serif";
  context.fillText(layout.label, 10, 19);

  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    const bitmap = await loadFrameBitmap(resolvePluginArtifactUrl(frame?.url));
    const column = index % layout.columns;
    const row = Math.floor(index / layout.columns);
    const x = column * tileWidth;
    const y = headerHeight + row * tileHeight;
    drawContainedImage(context, bitmap, x, y, tileWidth, tileHeight);
    bitmap.close?.();
    context.fillStyle = "rgba(0,0,0,0.72)";
    context.fillRect(x + 3, y + tileHeight - 19, 74, 16);
    context.fillStyle = "#ffffff";
    context.font = "11px monospace";
    context.fillText(formatTimestamp(frame?.timestampMs), x + 7, y + tileHeight - 7);
  }

  const blob = await canvasToCompressedBlob(canvas);
  return { dataUrl: await blobToDataUrl(blob), byteLength: blob.size };
}

async function loadFrameBitmap(url) {
  const response = await fetch(url, { mode: "cors", cache: "no-store" });
  if (!response.ok) throw new Error(`读取本地视频帧失败：${response.status}`);
  const blob = await response.blob();
  if (typeof globalThis.createImageBitmap === "function") return globalThis.createImageBitmap(blob);
  return loadImageElement(blob);
}

function loadImageElement(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("读取本地视频帧失败"));
    };
    image.src = url;
  });
}

function drawContainedImage(context, image, x, y, width, height) {
  const sourceWidth = Number(image.width ?? image.naturalWidth ?? 1);
  const sourceHeight = Number(image.height ?? image.naturalHeight ?? 1);
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function canvasToCompressedBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((webp) => {
      if (webp?.type === "image/webp") {
        resolve(webp);
        return;
      }
      canvas.toBlob((jpeg) => jpeg ? resolve(jpeg) : reject(new Error("压缩视频时间轴失败")), "image/jpeg", 0.58);
    }, "image/webp", 0.64);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取视频时间轴失败"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(blob);
  });
}

function resolvePluginArtifactUrl(path) {
  return String(path ?? "");
}

function ensureModelImageBudget(totalBytes) {
  if (totalBytes > MAX_MODEL_IMAGE_BYTES) {
    throw new Error("视频时间轴超过模型单次输入容量，请缩短视频后重试");
  }
}

function formatTimestamp(value) {
  const totalMs = Math.max(0, Math.round(Number(value ?? 0)));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const milliseconds = totalMs % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

export const __videoAnalysisPluginTestUtils = {
  formatTimestamp,
  selectRepresentativeFrames,
};
