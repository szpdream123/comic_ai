const REQUIRED_FRAME_RATE = 6;
const FRAMES_PER_TIMELINE_SHEET = 48;
const MIN_KEY_FRAME_INTERVAL_MS = 1_000;
const MAX_KEY_FRAME_INTERVAL_MS = 8_000;
const KEY_FRAME_DIFFERENCE_THRESHOLD = 0.3;
const OBSCURED_FRAME_RATIO_THRESHOLD = 0.3;
const BLACK_FRAME_LUMINANCE_THRESHOLD = 0.08;
const BLACK_FRAME_AVERAGE_LUMINANCE_THRESHOLD = 0.38;
const WHITE_FRAME_LUMINANCE_THRESHOLD = 0.92;
const WHITE_FRAME_AVERAGE_LUMINANCE_THRESHOLD = 0.62;
const OVERLAY_LUMINANCE_STANDARD_DEVIATION = 0.06;
const MAX_MODEL_FRAME_SHEET_COUNT = 64;
const MAX_MODEL_IMAGE_BYTES = 19 * 1024 * 1024;
const MAX_KEY_FRAME_PREVIEW_DIMENSION = 1_920;

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
  const frameSignatures = [];
  let totalBytes = 0;
  const totalSheets = Math.ceil(frames.length / FRAMES_PER_TIMELINE_SHEET);
  const sourceWidth = Math.max(1, Number(output?.source?.width) || 16);
  const sourceHeight = Math.max(1, Number(output?.source?.height) || 9);
  const timelineTileWidth = 1280 / 8;
  const timelineTileHeight = timelineTileWidth * sourceHeight / sourceWidth;
  for (let index = 0; index < frames.length; index += FRAMES_PER_TIMELINE_SHEET) {
    const sheetFrames = frames.slice(index, index + FRAMES_PER_TIMELINE_SHEET);
    const encoded = await renderFrameSheet(sheetFrames, {
      columns: 8,
      rows: 6,
      width: 1280,
      height: Math.max(28 + 6, Math.round(28 + timelineTileHeight * 6)),
      label: `6 FPS 时间轴 ${Math.floor(index / FRAMES_PER_TIMELINE_SHEET) + 1}/${totalSheets}`,
      collectSignatures: true,
    });
    frameSignatures.push(...encoded.frameSignatures);
    totalBytes += encoded.byteLength;
    ensureModelImageBudget(totalBytes);
    timelineSheets.push(encoded.dataUrl);
    options.onProgress?.({
      progress: Math.round(((index + sheetFrames.length) / frames.length) * 85),
      stage: "timeline",
    });
  }

  const keyFrames = selectSimilarityKeyFrames(output, {
    frameSignatures,
    maxCount: Math.max(1, MAX_MODEL_FRAME_SHEET_COUNT - timelineSheets.length),
  });
  const keyFrameSheets = [];
  const keyFramePreviews = [];
  for (let index = 0; index < keyFrames.length; index += 1) {
    const preview = await renderKeyFramePreview(keyFrames[index]);
    totalBytes += preview.byteLength;
    ensureModelImageBudget(totalBytes);
    keyFrameSheets.push(preview.dataUrl);
    keyFramePreviews.push({
      dataUrl: preview.dataUrl,
      timestampMs: Math.max(0, Math.round(Number(keyFrames[index]?.timestampMs) || 0)),
    });
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
    keyFramePreviews,
  };
}

async function renderKeyFramePreview(frame) {
  const bitmap = await loadFrameBitmap(resolvePluginArtifactUrl(frame?.url));
  const sourceWidth = Math.max(1, Number(bitmap.width ?? bitmap.naturalWidth ?? 1));
  const sourceHeight = Math.max(1, Number(bitmap.height ?? bitmap.naturalHeight ?? 1));
  const scale = Math.min(1, MAX_KEY_FRAME_PREVIEW_DIMENSION / sourceWidth, MAX_KEY_FRAME_PREVIEW_DIMENSION / sourceHeight);
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("当前浏览器无法创建关键帧预览画布");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await canvasToPreviewBlob(canvas);
  return { dataUrl: await blobToDataUrl(blob), byteLength: blob.size };
}

function selectSimilarityKeyFrames(output, options = {}) {
  const frames = (Array.isArray(output?.timelineFrames) ? output.timelineFrames : [])
    .filter((frame) => Number.isFinite(Number(frame?.timestampMs)))
    .sort((left, right) => Number(left.timestampMs) - Number(right.timestampMs));
  const seenFrameTimestamps = new Set();
  const uniqueFrames = frames.filter((frame) => {
    const timestampMs = Math.round(Number(frame.timestampMs));
    if (seenFrameTimestamps.has(timestampMs)) return false;
    seenFrameTimestamps.add(timestampMs);
    return true;
  });
  if (!uniqueFrames.length) return [];

  const signaturesByTimestamp = new Map((Array.isArray(options.frameSignatures) ? options.frameSignatures : [])
    .map((entry) => [Math.round(Number(entry?.timestampMs) || 0), entry?.signature]));
  const usableFrames = uniqueFrames.filter((frame) => {
    const signature = signaturesByTimestamp.get(Math.round(Number(frame.timestampMs)));
    return !isObscuredSignature(signature);
  });
  if (!usableFrames.length) return [];
  const minIntervalMs = Math.max(250, Math.round(Number(options.minIntervalMs) || MIN_KEY_FRAME_INTERVAL_MS));
  const maxIntervalMs = Math.max(minIntervalMs, Math.round(Number(options.maxIntervalMs) || MAX_KEY_FRAME_INTERVAL_MS));
  const differenceThreshold = Math.max(0, Math.min(1, Number(options.differenceThreshold) || KEY_FRAME_DIFFERENCE_THRESHOLD));
  const deduplicated = [usableFrames[0]];
  let previous = usableFrames[0];
  for (const frame of usableFrames.slice(1, -1)) {
    const elapsedMs = Number(frame.timestampMs) - Number(previous.timestampMs);
    if (elapsedMs < minIntervalMs) continue;
    const previousSignature = signaturesByTimestamp.get(Math.round(Number(previous.timestampMs)));
    const currentSignature = signaturesByTimestamp.get(Math.round(Number(frame.timestampMs)));
    const hasComparableSignatures = Array.isArray(previousSignature)
      && Array.isArray(currentSignature)
      && previousSignature.length > 0
      && previousSignature.length === currentSignature.length;
    const difference = calculateSignatureDifference(previousSignature, currentSignature);
    if ((hasComparableSignatures && difference >= differenceThreshold) || (!hasComparableSignatures && elapsedMs >= maxIntervalMs)) {
      deduplicated.push(frame);
      previous = frame;
    }
  }
  const lastFrame = usableFrames.at(-1);
  const lastSelectedFrame = deduplicated.at(-1);
  const lastSelectedSignature = signaturesByTimestamp.get(Math.round(Number(lastSelectedFrame.timestampMs)));
  const lastFrameSignature = signaturesByTimestamp.get(Math.round(Number(lastFrame.timestampMs)));
  const hasComparableLastSignatures = Array.isArray(lastSelectedSignature)
    && Array.isArray(lastFrameSignature)
    && lastSelectedSignature.length > 0
    && lastSelectedSignature.length === lastFrameSignature.length;
  if (
    Math.round(Number(lastFrame.timestampMs)) !== Math.round(Number(lastSelectedFrame.timestampMs))
    && (!hasComparableLastSignatures || calculateSignatureDifference(lastSelectedSignature, lastFrameSignature) >= differenceThreshold)
  ) {
    deduplicated.push(lastFrame);
  }
  const maxCount = Math.max(1, Math.round(Number(options.maxCount) || deduplicated.length));
  if (deduplicated.length <= maxCount) return deduplicated;
  if (maxCount === 1) return [deduplicated[0]];
  return Array.from({ length: maxCount }, (_, index) => (
    deduplicated[Math.round(index * (deduplicated.length - 1) / (maxCount - 1))]
  ));
}

function isObscuredSignature(signature) {
  if (!Array.isArray(signature) || signature.length < 3 || signature.length % 3 !== 0) return false;
  let darkPixels = 0;
  let brightPixels = 0;
  let totalLuminance = 0;
  const pixelCount = signature.length / 3;
  const luminances = [];
  for (let index = 0; index < signature.length; index += 3) {
    const red = Number(signature[index]) || 0;
    const green = Number(signature[index + 1]) || 0;
    const blue = Number(signature[index + 2]) || 0;
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    totalLuminance += luminance;
    luminances.push(luminance);
    if (luminance <= BLACK_FRAME_LUMINANCE_THRESHOLD) darkPixels += 1;
    if (luminance >= WHITE_FRAME_LUMINANCE_THRESHOLD) brightPixels += 1;
  }
  const averageLuminance = totalLuminance / pixelCount;
  const variance = luminances.reduce((total, value) => total + (value - averageLuminance) ** 2, 0) / pixelCount;
  const standardDeviation = Math.sqrt(variance);
  return (darkPixels / pixelCount >= OBSCURED_FRAME_RATIO_THRESHOLD
    && averageLuminance <= BLACK_FRAME_AVERAGE_LUMINANCE_THRESHOLD)
    || (brightPixels / pixelCount >= OBSCURED_FRAME_RATIO_THRESHOLD
      && averageLuminance >= WHITE_FRAME_AVERAGE_LUMINANCE_THRESHOLD)
    || (standardDeviation <= OVERLAY_LUMINANCE_STANDARD_DEVIATION
      && averageLuminance >= 0.3
      && averageLuminance <= 0.7);
}

function calculateSignatureDifference(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || !left.length || left.length !== right.length) return 0;
  return left.reduce((total, value, index) => total + Math.abs(Number(value) - Number(right[index])), 0) / left.length;
}

async function renderFrameSheet(frames, layout) {
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("当前浏览器无法创建视频时间轴画布");
  const signatureCanvas = layout.collectSignatures ? globalThis.document.createElement("canvas") : null;
  const signatureContext = signatureCanvas?.getContext("2d", { alpha: false, willReadFrequently: true }) ?? null;
  if (signatureCanvas) {
    signatureCanvas.width = 16;
    signatureCanvas.height = 9;
  }
  const frameSignatures = [];
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
    if (signatureCanvas && signatureContext) {
      signatureContext.drawImage(bitmap, 0, 0, signatureCanvas.width, signatureCanvas.height);
      const pixels = signatureContext.getImageData(0, 0, signatureCanvas.width, signatureCanvas.height).data;
      const signature = [];
      for (let offset = 0; offset < pixels.length; offset += 4) {
        signature.push(pixels[offset] / 255, pixels[offset + 1] / 255, pixels[offset + 2] / 255);
      }
      frameSignatures.push({ timestampMs: Math.max(0, Math.round(Number(frame?.timestampMs) || 0)), signature });
    }
    bitmap.close?.();
    context.fillStyle = "rgba(0,0,0,0.72)";
    context.fillRect(x + 3, y + tileHeight - 19, 74, 16);
    context.fillStyle = "#ffffff";
    context.font = "11px monospace";
    context.fillText(formatTimestamp(frame?.timestampMs), x + 7, y + tileHeight - 7);
  }

  const blob = await canvasToCompressedBlob(canvas);
  return { dataUrl: await blobToDataUrl(blob), byteLength: blob.size, frameSignatures };
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

function canvasToPreviewBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((webp) => {
      if (webp?.type === "image/webp") {
        resolve(webp);
        return;
      }
      canvas.toBlob((jpeg) => jpeg ? resolve(jpeg) : reject(new Error("压缩关键帧预览失败")), "image/jpeg", 0.86);
    }, "image/webp", 0.9);
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
  calculateSignatureDifference,
  formatTimestamp,
  isMostlyBlackSignature: isObscuredSignature,
  isObscuredSignature,
  selectSimilarityKeyFrames,
};
