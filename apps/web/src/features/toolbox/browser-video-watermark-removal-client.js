import {
  checkBrowserWatermarkRemoval,
  createWatermarkRemovalCanvasWorkspace,
  runBrowserWatermarkRemovalCanvas,
} from "./browser-watermark-removal-client.js";

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_DURATION_SECONDS = 15;
const FRAME_RATE = 6;
const MAX_OUTPUT_FRAME_RATE = 12;
const MAX_OUTPUT_EDGE = 854;

export async function runBrowserVideoWatermarkRemoval(file, maskDataUrl, { onProgress } = {}) {
  if (!(file instanceof Blob)) throw new Error("请先选择需要处理的视频。");
  if (file.size > MAX_VIDEO_BYTES) throw new Error("视频不能超过 50 MB。");
  if (!String(maskDataUrl ?? "").startsWith("data:image/")) throw new Error("请先在首帧标记需要去除的水印区域。");
  const support = await checkBrowserWatermarkRemoval();
  if (!support.ready) throw new Error(support.error);
  if (!support.installed) throw new Error("请先安装本地去水印插件。");

  const sourceUrl = globalThis.URL.createObjectURL(file);
  const video = globalThis.document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = sourceUrl;
  try {
    await waitForEvent(video, "loadedmetadata", "无法读取所选视频。");
    if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error("所选视频没有可读取的画面。");
    }
    if (video.duration > MAX_DURATION_SECONDS) {
      throw new Error(`首版跟踪去水印仅支持 ${MAX_DURATION_SECONDS} 秒以内的视频。`);
    }

    const outputSize = constrainSize(video.videoWidth, video.videoHeight, MAX_OUTPUT_EDGE);
    const canvas = globalThis.document.createElement("canvas");
    canvas.width = outputSize.width;
    canvas.height = outputSize.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("浏览器无法创建视频处理画布。");

    await seekVideo(video, 0);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const baseMask = await loadMaskCanvas(maskDataUrl, canvas.width, canvas.height);
    const tracker = createWatermarkRegionTracker(context, baseMask);
    const watermarkWorkspace = createWatermarkRemovalCanvasWorkspace();
    const [{ encodeVideoDepthFrames }, { readBrowserVideoSourceFrameRate }] = await Promise.all([
      import("./browser-video-depth-encoder.bundle.js"),
      import("./browser-video-analysis-decoder.bundle.js"),
    ]);
    const sourceFrameRate = await readBrowserVideoSourceFrameRate(file).catch(() => 0);
    const outputFrameRate = resolveOutputFrameRate(sourceFrameRate);
    onProgress?.({ progress: 2, message: "正在建立首帧水印跟踪" });
    const output = await encodeVideoDepthFrames({
      canvas,
      durationSeconds: video.duration,
      fps: outputFrameRate,
      renderFrame: async (frame) => {
        await seekVideo(video, Math.min(Math.max(0, video.duration - 0.001), frame.timestamp));
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const trackedMask = tracker.track(context);
        await runBrowserWatermarkRemovalCanvas(canvas, trackedMask, { workspace: watermarkWorkspace });
        onProgress?.({
          progress: Math.min(99, 4 + Math.round(((frame.index + 1) / frame.frameCount) * 95)),
          message: "正在去除水印中",
        });
      },
    });
    onProgress?.({ progress: 100, message: "视频去水印完成" });
    return {
      downloadUrl: globalThis.URL.createObjectURL(output.file),
      fileName: `${baseName(file.name || "video")}-watermark-removed${output.fileExtension || ".webm"}`,
    };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    globalThis.URL.revokeObjectURL(sourceUrl);
  }
}

function createWatermarkRegionTracker(initialContext, baseMask) {
  const bounds = findMaskBounds(baseMask.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, baseMask.width, baseMask.height).data, baseMask.width, baseMask.height);
  if (!bounds) throw new Error("请先在首帧标记需要去除的水印区域。");
  const initialPixels = initialContext.getImageData(0, 0, baseMask.width, baseMask.height).data;
  const samples = createTrackingSamples(initialPixels, baseMask.width, baseMask.height, bounds);
  const mask = globalThis.document.createElement("canvas");
  mask.width = baseMask.width;
  mask.height = baseMask.height;
  const maskContext = mask.getContext("2d");
  if (!maskContext) throw new Error("浏览器无法创建视频水印蒙版。");
  let position = { left: bounds.left, top: bounds.top };
  return {
    track(context) {
      const pixels = context.getImageData(0, 0, baseMask.width, baseMask.height).data;
      position = findBestTrackedPosition(pixels, baseMask.width, baseMask.height, bounds, samples, position);
      maskContext.clearRect(0, 0, mask.width, mask.height);
      maskContext.drawImage(baseMask, position.left - bounds.left, position.top - bounds.top);
      return mask;
    },
  };
}

function resolveOutputFrameRate(sourceFrameRate) {
  const source = Number(sourceFrameRate);
  return Math.min(MAX_OUTPUT_FRAME_RATE, Number.isFinite(source) && source > 0 ? Math.round(source) : FRAME_RATE);
}

function createTrackingSamples(pixels, width, height, bounds) {
  const columns = Math.max(4, Math.min(12, Math.ceil(bounds.width / 12)));
  const rows = Math.max(3, Math.min(8, Math.ceil(bounds.height / 10)));
  const samples = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = Math.min(width - 1, Math.round(bounds.left + ((column + 0.5) / columns) * Math.max(1, bounds.width - 1)));
      const y = Math.min(height - 1, Math.round(bounds.top + ((row + 0.5) / rows) * Math.max(1, bounds.height - 1)));
      samples.push({ x: x - bounds.left, y: y - bounds.top, value: luminance(pixels, x, y, width) });
    }
  }
  return samples;
}

function findBestTrackedPosition(pixels, width, height, bounds, samples, previous) {
  const range = Math.max(12, Math.min(44, Math.round(Math.max(bounds.width, bounds.height) * 0.45)));
  const step = 4;
  let best = { ...previous, score: Infinity };
  for (let offsetY = -range; offsetY <= range; offsetY += step) {
    for (let offsetX = -range; offsetX <= range; offsetX += step) {
      const left = Math.max(0, Math.min(width - bounds.width, previous.left + offsetX));
      const top = Math.max(0, Math.min(height - bounds.height, previous.top + offsetY));
      let score = 0;
      for (const sample of samples) score += Math.abs(sample.value - luminance(pixels, left + sample.x, top + sample.y, width));
      if (score < best.score) best = { left, top, score };
    }
  }
  return { left: best.left, top: best.top };
}

function findMaskBounds(pixels, width, height) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (pixels[offset] <= 8 && pixels[offset + 3] <= 8) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }
  return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
}

function luminance(pixels, x, y, width) {
  const offset = (Math.round(y) * width + Math.round(x)) * 4;
  return pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722;
}

async function loadMaskCanvas(maskDataUrl, width, height) {
  const image = await loadImage(maskDataUrl);
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(image, 0, 0, width, height);
  return canvas;
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new globalThis.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取水印蒙版。"));
    image.src = source;
  });
}

function waitForEvent(target, name, message) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(name, success);
      target.removeEventListener("error", failure);
    };
    const success = () => { cleanup(); resolve(); };
    const failure = () => { cleanup(); reject(new Error(message)); };
    target.addEventListener(name, success, { once: true });
    target.addEventListener("error", failure, { once: true });
  });
}

async function seekVideo(video, time) {
  if (Math.abs(video.currentTime - time) < 0.004 && video.readyState >= 2) return;
  video.currentTime = time;
  await waitForEvent(video, "seeked", "无法读取视频画面。");
}

function constrainSize(width, height, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(2, Math.round((width * scale) / 2) * 2),
    height: Math.max(2, Math.round((height * scale) / 2) * 2),
  };
}

function baseName(name) {
  return String(name).replace(/\.[^.]+$/, "") || "video";
}

export const __browserVideoWatermarkRemovalTestUtils = {
  findMaskBounds,
  findBestTrackedPosition,
  resolveOutputFrameRate,
};
