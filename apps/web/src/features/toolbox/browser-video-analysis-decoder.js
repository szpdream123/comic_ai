import {
  ALL_FORMATS,
  BlobSource,
  CanvasSink,
  Input,
} from "mediabunny";

const REQUIRED_FRAME_RATE = 6;
const MAX_FRAME_RATE = 24;
const MAX_DURATION_SECONDS = 300;

export function createBrowserVideoAnalysisFramePlan(durationSeconds, requestedFrameRate = REQUIRED_FRAME_RATE) {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_DURATION_SECONDS) {
    throw new Error(duration > MAX_DURATION_SECONDS ? "视频时长不能超过 300 秒" : "视频时长无效");
  }
  const requested = Number(requestedFrameRate);
  const frameRate = Number.isFinite(requested)
    ? Math.max(REQUIRED_FRAME_RATE, Math.min(MAX_FRAME_RATE, Math.round(requested)))
    : REQUIRED_FRAME_RATE;
  const frameCount = Math.max(1, Math.round(duration * frameRate));
  return {
    frameRate,
    frames: Array.from({ length: frameCount }, (_, index) => ({
      index,
      frameCount,
      timestamp: index / frameRate,
      timestampMs: Math.round(index * 1000 / frameRate),
    })),
  };
}

export async function readBrowserVideoSourceFrameRate(file) {
  if (!(file instanceof Blob)) throw new Error("未找到可处理的视频文件");
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error("所选视频没有可读取的画面");
    const packetStats = await videoTrack.computePacketStats(120);
    const sourceFrameRate = Number(packetStats.averagePacketRate);
    return Number.isFinite(sourceFrameRate) && sourceFrameRate > 0
      ? Math.max(1, Math.min(60, Math.round(sourceFrameRate)))
      : 0;
  } finally {
    input.dispose();
  }
}

export async function decodeBrowserVideoTimeline(file, options = {}) {
  if (!(file instanceof Blob)) throw new Error("未找到可处理的视频文件");
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error("所选视频没有可读取的画面");
    if (!await videoTrack.canDecode()) throw new Error("当前浏览器无法解码所选视频");

    const metadataDuration = await videoTrack.getDurationFromMetadata();
    if (Number(metadataDuration) > MAX_DURATION_SECONDS) throw new Error("视频时长不能超过 300 秒");
    const durationSeconds = await input.computeDuration([videoTrack]);
    const plan = createBrowserVideoAnalysisFramePlan(durationSeconds, options.frameRate);
    const sourceWidth = await videoTrack.getDisplayWidth();
    const sourceHeight = await videoTrack.getDisplayHeight();
    if (!sourceWidth || !sourceHeight) throw new Error("所选视频没有可读取的画面");
    const outputSize = constrainFrameSize(sourceWidth, sourceHeight, Number(options.maxEdge) || 1920);
    const sink = new CanvasSink(videoTrack, {
      width: outputSize.width,
      height: outputSize.height,
      fit: "contain",
      poolSize: 2,
    });

    let extracted = 0;
    for await (const decoded of sink.canvasesAtTimestamps(plan.frames.map((frame) => frame.timestamp))) {
      const frame = plan.frames[extracted];
      if (!decoded || !frame) throw new Error("浏览器读取视频帧失败");
      await options.onFrame?.({
        canvas: decoded.canvas,
        index: frame.index,
        frameCount: frame.frameCount,
        timestamp: decoded.timestamp,
        timestampMs: frame.timestampMs,
      });
      extracted += 1;
      options.onProgress?.({ index: extracted, frameCount: plan.frames.length });
    }
    if (extracted !== plan.frames.length) throw new Error("浏览器没有生成完整的 6 FPS 时间轴");

    const audioTrack = await input.getPrimaryAudioTrack();
    const packetStats = await videoTrack.computePacketStats(120);
    return {
      durationSeconds,
      frameRate: plan.frameRate,
      frameCount: plan.frames.length,
      sourceWidth,
      sourceHeight,
      outputWidth: outputSize.width,
      outputHeight: outputSize.height,
      contentType: await input.getMimeType(),
      sourceFrameRate: packetStats.averagePacketRate,
      videoCodec: await videoTrack.getCodec() || "",
      audioCodec: audioTrack ? await audioTrack.getCodec() || "" : "",
      averageBitrate: packetStats.averageBitrate,
      hasAudio: Boolean(audioTrack),
    };
  } finally {
    input.dispose();
  }
}

function constrainFrameSize(width, height, maxEdge) {
  const edge = Math.max(240, Math.min(1920, Math.round(maxEdge)));
  const scale = Math.min(1, edge / Math.max(width, height));
  return {
    width: Math.max(2, Math.round((width * scale) / 2) * 2),
    height: Math.max(2, Math.round((height * scale) / 2) * 2),
  };
}
