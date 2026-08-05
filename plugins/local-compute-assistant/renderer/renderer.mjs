import { estimateDepth } from "./estimate-depth.mjs";

const MAX_EDGE = 640;
const FRAMES_PER_SECOND = 8;

window.localCompute.onProcess((job) => {
  convertToDepthVideo(job)
    .then((dataUrl) => window.localCompute.complete({ id: job.id, ok: true, dataUrl }))
    .catch((error) => window.localCompute.complete({ id: job.id, ok: false, error: error.message }));
});
window.localCompute.ready();

async function convertToDepthVideo({ inputUrl }) {
  if (!navigator.gpu || !await navigator.gpu.requestAdapter()) {
    throw new Error("当前电脑不支持 WebGPU，无法使用本地 GPU 深度处理。");
  }
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.src = inputUrl;
  try {
    await waitForEvent(video, "loadedmetadata");
    if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration)) {
      throw new Error("所选视频没有可读取的画面。");
    }
    const { width, height } = constrainVideoSize(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const stream = canvas.captureStream(FRAMES_PER_SECOND);
    const recorder = new MediaRecorder(stream, { mimeType: selectWebmMimeType() });
    const chunks = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    const finished = new Promise((resolve, reject) => {
      recorder.addEventListener("stop", resolve, { once: true });
      recorder.addEventListener("error", () => reject(new Error("无法编码 WebM 输出视频。")), { once: true });
    });
    recorder.start();
    await drawDepthFrames(video, canvas, context);
    recorder.stop();
    await finished;
    return blobToDataUrl(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
}

async function drawDepthFrames(video, canvas, context) {
  const frameStep = 1 / FRAMES_PER_SECOND;
  const frameCount = Math.max(1, Math.ceil(video.duration / frameStep));
  for (let index = 0; index < frameCount; index += 1) {
    await seekVideo(video, Math.min(video.duration, index * frameStep));
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const output = await estimateDepth(canvas);
    const { data, width, height, channels } = output.depth;
    const image = context.createImageData(width, height);
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const intensity = data[pixel * channels];
      const offset = pixel * 4;
      image.data[offset] = intensity;
      image.data[offset + 1] = intensity;
      image.data[offset + 2] = intensity;
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    await new Promise((resolve) => setTimeout(resolve, 1000 / FRAMES_PER_SECOND));
  }
}

function seekVideo(video, time) {
  return new Promise((resolve, reject) => {
    video.addEventListener("seeked", resolve, { once: true });
    video.addEventListener("error", () => reject(new Error("视频帧读取失败。")), { once: true });
    video.currentTime = time;
  });
}

function constrainVideoSize(width, height) {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  return {
    width: Math.max(2, Math.round((width * scale) / 2) * 2),
    height: Math.max(2, Math.round((height * scale) / 2) * 2)
  };
}

function selectWebmMimeType() {
  const type = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
    .find((candidate) => MediaRecorder.isTypeSupported(candidate));
  if (!type) throw new Error("本地助手无法编码 WebM 视频。");
  return type;
}

function waitForEvent(target, type) {
  return new Promise((resolve, reject) => {
    target.addEventListener(type, resolve, { once: true });
    target.addEventListener("error", () => reject(new Error("无法读取所选视频。")), { once: true });
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result), { once: true });
    reader.addEventListener("error", () => reject(new Error("无法保存深度视频。")), { once: true });
    reader.readAsDataURL(blob);
  });
}
