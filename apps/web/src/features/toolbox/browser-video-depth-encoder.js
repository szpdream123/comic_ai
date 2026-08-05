import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
  canEncodeVideo,
} from "mediabunny";

const ENCODING_CANDIDATES = [
  { codec: "vp9", container: "webm" },
  { codec: "vp8", container: "webm" },
  { codec: "av1", container: "webm" },
  { codec: "avc", container: "mp4" },
];
const DEFAULT_BITRATE = 4_000_000;
const MIN_BITRATE = 1_500_000;
const MAX_BITRATE = 16_000_000;

export function createVideoDepthFramePlan(durationSeconds, fps) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("视频时长必须大于 0 秒。");
  }
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error("视频帧率必须大于 0 FPS。");
  }
  const frameCount = Math.max(1, Math.round(durationSeconds * fps));
  const frameDuration = durationSeconds / frameCount;
  return Array.from({ length: frameCount }, (_, index) => ({
    index,
    frameCount,
    timestamp: index * frameDuration,
    duration: frameDuration,
  }));
}

export async function selectVideoDepthEncoding(
  { width, height, bitrate = resolveVideoDepthBitrate(width, height), encoding = "auto" },
  probe = canEncodeVideo,
) {
  const candidates = encoding === "auto"
    ? ENCODING_CANDIDATES
    : ENCODING_CANDIDATES.filter((candidate) => candidate.codec === encoding);
  for (const candidate of candidates) {
    const options = {
      bitrate,
      hardwareAcceleration: "no-preference",
      height,
      latencyMode: "quality",
      width,
    };
    if (await probe(candidate.codec, options)) return { ...candidate, ...options };
  }
  return null;
}

function resolveVideoDepthBitrate(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return DEFAULT_BITRATE;
  }
  const bitrate = Math.round(DEFAULT_BITRATE * ((width * height) / (1280 * 720)));
  return Math.max(MIN_BITRATE, Math.min(MAX_BITRATE, bitrate));
}

export async function encodeVideoDepthFrames({
  canvas,
  durationSeconds,
  fps,
  encoding = "auto",
  renderFrame,
}) {
  const selectedEncoding = await selectVideoDepthEncoding({
    width: canvas.width,
    height: canvas.height,
    encoding,
  });
  if (!selectedEncoding) {
    throw new Error(encoding === "auto"
      ? "当前电脑浏览器不支持本地处理，请升级或更换浏览器"
      : `当前浏览器不支持 ${String(encoding).toUpperCase()} 编码。请改用自动编码。`);
  }

  const framePlan = createVideoDepthFramePlan(durationSeconds, fps);
  const target = new BufferTarget();
  const format = selectedEncoding.container === "mp4" ? new Mp4OutputFormat() : new WebMOutputFormat();
  const output = new Output({ format, target });
  const source = new CanvasSource(canvas, {
    bitrate: selectedEncoding.bitrate,
    codec: selectedEncoding.codec,
    hardwareAcceleration: selectedEncoding.hardwareAcceleration,
    keyFrameInterval: 2,
    latencyMode: selectedEncoding.latencyMode,
  });
  output.addVideoTrack(source, {
    maximumPacketCount: framePlan.length,
  });

  try {
    await output.start();
    for (const frame of framePlan) {
      await renderFrame(frame);
      await source.add(frame.timestamp, frame.duration);
    }
    await output.finalize();
  } catch (error) {
    if (output.state === "started") await output.cancel();
    throw error;
  }

  if (!target.buffer) throw new Error("当前电脑浏览器不支持本地处理，请升级或更换浏览器");
  return {
    file: new Blob([target.buffer], { type: format.mimeType }),
    fileExtension: format.fileExtension,
    mimeType: format.mimeType,
  };
}
