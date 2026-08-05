import { estimateDepth } from "./depth-estimator.js";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.target !== "offscreen-document" || message.type !== "process-video") {
    return undefined;
  }

  convertToDepthVideo(message.input)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({
      ok: false,
      error: { code: "processing_failed", message: error.message }
    }));

  return true;
});

async function convertToDepthVideo({ dataUrl, fileName }) {
  const sourceBlob = await (await fetch(dataUrl)).blob();
  const sourceUrl = URL.createObjectURL(sourceBlob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.src = sourceUrl;

  try {
    await waitForEvent(video, "loadedmetadata");
    if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration)) {
      throw new Error("The selected video has no readable frames.");
    }

    const canvas = document.createElement("canvas");
    const { width, height } = constrainVideoSize(video.videoWidth, video.videoHeight);
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: selectWebmMimeType() });
    const chunks = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });

    const finished = new Promise((resolve, reject) => {
      recorder.addEventListener("stop", resolve, { once: true });
      recorder.addEventListener("error", () => reject(new Error("The browser could not encode WebM output.")), { once: true });
    });

    recorder.start();
    await drawDepthFrames(video, canvas, context);
    recorder.stop();
    await finished;

    const outputBlob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
    return {
      dataUrl: await blobToDataUrl(outputBlob),
      fileName: toWebmFileName(fileName),
      mimeType: outputBlob.type,
      byteLength: outputBlob.size
    };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(sourceUrl);
  }
}

async function drawDepthFrames(video, canvas, context) {
  const frameStep = 1 / 8;
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
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
}

function seekVideo(video, time) {
  return new Promise((resolve, reject) => {
    const onSeeked = () => resolve();
    const onError = () => reject(new Error("视频帧读取失败。"));
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = time;
  });
}

function constrainVideoSize(width, height) {
  const maxEdge = 640;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(2, Math.round((width * scale) / 2) * 2),
    height: Math.max(2, Math.round((height * scale) / 2) * 2),
  };
}

function selectWebmMimeType() {
  const types = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  const type = types.find((candidate) => MediaRecorder.isTypeSupported(candidate));
  if (!type) throw new Error("This browser cannot encode WebM video.");
  return type;
}

function waitForEvent(target, type) {
  return new Promise((resolve, reject) => {
    target.addEventListener(type, resolve, { once: true });
    target.addEventListener("error", () => reject(new Error("The selected video could not be decoded.")), { once: true });
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result), { once: true });
    reader.addEventListener("error", () => reject(new Error("Could not prepare the output video.")), { once: true });
    reader.readAsDataURL(blob);
  });
}

function toWebmFileName(fileName) {
  const baseName = String(fileName || "depth").replace(/\.[^.]+$/, "");
  return `${baseName}-depth.webm`;
}
