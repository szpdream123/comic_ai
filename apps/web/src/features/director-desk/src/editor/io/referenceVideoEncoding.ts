import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
  canEncodeVideo,
  type OutputFormat,
  type VideoCodec,
} from "mediabunny";
import type { ReferenceVideoExportFormat } from "./referenceVideoExport";

export interface ReferenceVideoFrame {
  index: number;
  timestamp: number;
  duration: number;
  progress: number;
}

export interface ReferenceVideoEncodingChoice {
  bitrate: number;
  codec: VideoCodec;
  hardwareAcceleration: "no-preference" | "prefer-software" | "prefer-hardware";
}

export function createReferenceVideoFramePlan(durationSeconds: number, fps: number): ReferenceVideoFrame[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("参考视频时长必须大于 0 秒");
  }
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error("参考视频帧率必须大于 0 FPS");
  }

  const frameCount = Math.max(1, Math.round(durationSeconds * fps));
  const frameDuration = durationSeconds / frameCount;
  return Array.from({ length: frameCount }, (_, index) => {
    const timestamp = index * frameDuration;
    return {
      index,
      timestamp,
      duration: frameDuration,
      progress: timestamp / durationSeconds,
    };
  });
}

function createOutputFormat(format: ReferenceVideoExportFormat): OutputFormat {
  if (format === "mp4") return new Mp4OutputFormat({ fastStart: "in-memory" });
  if (format === "webm") return new WebMOutputFormat();
  throw new Error("当前浏览器无法逐帧编码 OGG 视频，请选择 MP4 或 WebM");
}

export function getReferenceVideoCodecCandidates(format: ReferenceVideoExportFormat): VideoCodec[] {
  if (format === "mp4") return ["avc", "hevc", "av1", "vp9"];
  if (format === "webm") return ["vp9", "av1", "vp8"];
  return [];
}

export async function selectReferenceVideoEncoding(input: {
  bitrate: number;
  format: ReferenceVideoExportFormat;
  height: number;
  width: number;
}, probe = canEncodeVideo): Promise<ReferenceVideoEncodingChoice | null> {
  const codecBitrateCaps: Partial<Record<VideoCodec, number>> = {
    av1: 20_000_000,
    hevc: 30_000_000,
    vp8: 20_000_000,
    vp9: 30_000_000,
  };
  const hardwareOptions = ["no-preference", "prefer-software", "prefer-hardware"] as const;

  for (const codec of getReferenceVideoCodecCandidates(input.format)) {
    const codecBitrate = Math.min(input.bitrate, codecBitrateCaps[codec] ?? input.bitrate);
    const bitrateOptions = [...new Set([
      codecBitrate,
      Math.min(codecBitrate, 20_000_000),
      Math.min(codecBitrate, 12_000_000),
    ])];
    for (const bitrate of bitrateOptions) {
      for (const hardwareAcceleration of hardwareOptions) {
        const supported = await probe(codec, {
          bitrate,
          hardwareAcceleration,
          height: input.height,
          latencyMode: "quality",
          width: input.width,
        });
        if (supported) return { bitrate, codec, hardwareAcceleration };
      }
    }
  }
  return null;
}

export async function encodeReferenceVideo(input: {
  bitrate: number;
  canvas: HTMLCanvasElement;
  durationSeconds: number;
  format: ReferenceVideoExportFormat;
  fps: number;
  renderFrame: (frame: ReferenceVideoFrame) => Promise<void> | void;
}): Promise<Blob> {
  const { bitrate, canvas, durationSeconds, format, fps, renderFrame } = input;
  const encoding = await selectReferenceVideoEncoding({
    bitrate,
    format,
    height: canvas.height,
    width: canvas.width,
  });
  if (!encoding) {
    throw new Error(`当前浏览器不支持 ${canvas.width}×${canvas.height} 的 ${format.toUpperCase()} 逐帧编码，请改用其他格式或降低画质`);
  }

  const target = new BufferTarget();
  const outputFormat = createOutputFormat(format);
  const output = new Output({ format: outputFormat, target });
  const source = new CanvasSource(canvas, {
    bitrate: encoding.bitrate,
    codec: encoding.codec,
    hardwareAcceleration: encoding.hardwareAcceleration,
    keyFrameInterval: 2,
    latencyMode: "quality",
  });
  output.addVideoTrack(source, {
    frameRate: fps,
    maximumPacketCount: Math.max(1, Math.round(durationSeconds * fps)),
  });

  try {
    await output.start();
    for (const frame of createReferenceVideoFramePlan(durationSeconds, fps)) {
      await renderFrame(frame);
      await source.add(frame.timestamp, frame.duration);
    }
    await output.finalize();
  } catch (error) {
    if (output.state === "started") await output.cancel();
    throw error;
  }

  if (!target.buffer) throw new Error("参考视频编码失败");
  return new Blob([target.buffer], { type: outputFormat.mimeType });
}
