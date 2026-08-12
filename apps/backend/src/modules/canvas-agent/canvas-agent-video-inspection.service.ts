import { spawn } from "node:child_process";

import ffprobeInstaller from "@ffprobe-installer/ffprobe";

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_PROCESS_OUTPUT_BYTES = 256 * 1024;

interface VideoProbePayload {
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    avg_frame_rate?: string;
    r_frame_rate?: string;
    channels?: number;
    sample_rate?: string;
    duration?: string;
  }>;
  format?: {
    format_name?: string;
    duration?: string;
    size?: string;
    bit_rate?: string;
  };
}

export async function inspectCanvasAgentVideoUrl(
  sourceUrl: string,
  options: { ffprobePath?: string; timeoutMs?: number } = {},
) {
  const url = new URL(sourceUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("canvas_agent_video_inspection_url_invalid");
  }
  const stdout = await runFfprobe(options.ffprobePath ?? ffprobeInstaller.path, [
    "-v", "error",
    "-show_entries", "format=format_name,duration,size,bit_rate:stream=codec_type,codec_name,width,height,avg_frame_rate,r_frame_rate,channels,sample_rate,duration",
    "-of", "json",
    sourceUrl,
  ], Math.max(1_000, Math.min(60_000, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS)));
  return parseCanvasAgentVideoProbe(stdout);
}

export function parseCanvasAgentVideoProbe(stdout: string) {
  let payload: VideoProbePayload;
  try {
    payload = JSON.parse(stdout) as VideoProbePayload;
  } catch {
    throw new Error("canvas_agent_video_probe_invalid");
  }
  const video = payload.streams?.find((stream) => stream.codec_type === "video");
  if (!video) throw new Error("canvas_agent_video_stream_missing");
  const audio = payload.streams?.find((stream) => stream.codec_type === "audio");
  const durationSeconds = finitePositiveNumber(payload.format?.duration)
    ?? finitePositiveNumber(video.duration)
    ?? null;
  const frameRate = parseFrameRate(video.avg_frame_rate) ?? parseFrameRate(video.r_frame_rate);
  return {
    version: 1,
    source: "ffprobe",
    durationMs: durationSeconds === null ? null : Math.round(durationSeconds * 1_000),
    container: {
      formatName: cleanString(payload.format?.format_name),
      sizeBytes: roundedPositiveNumber(payload.format?.size),
      bitRate: roundedPositiveNumber(payload.format?.bit_rate),
    },
    video: {
      codec: cleanString(video.codec_name),
      width: roundedPositiveNumber(video.width),
      height: roundedPositiveNumber(video.height),
      frameRate: frameRate === null ? null : Math.round(frameRate * 1_000) / 1_000,
    },
    hasAudio: Boolean(audio),
    audio: audio ? {
      codec: cleanString(audio.codec_name),
      channels: roundedPositiveNumber(audio.channels),
      sampleRate: roundedPositiveNumber(audio.sample_rate),
    } : null,
  };
}

function runFfprobe(executablePath: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, args, {
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = Buffer.alloc(0);
    let stderrBytes = 0;
    let settled = false;
    const fail = (code: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      reject(new Error(code));
    };
    const timer = setTimeout(() => fail("canvas_agent_video_probe_timeout"), timeoutMs);
    timer.unref?.();
    child.stdout.on("data", (chunk: Buffer) => {
      if (settled) return;
      if (stdout.length + chunk.length > MAX_PROCESS_OUTPUT_BYTES) {
        fail("canvas_agent_video_probe_output_too_large");
        return;
      }
      stdout = Buffer.concat([stdout, chunk]);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > MAX_PROCESS_OUTPUT_BYTES) fail("canvas_agent_video_probe_output_too_large");
    });
    child.once("error", () => fail("canvas_agent_video_probe_unavailable"));
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error("canvas_agent_video_probe_failed"));
        return;
      }
      resolve(stdout.toString("utf8"));
    });
  });
}

function cleanString(value: unknown) {
  return String(value ?? "").trim() || null;
}

function finitePositiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function roundedPositiveNumber(value: unknown) {
  const number = finitePositiveNumber(value);
  return number === null ? null : Math.round(number);
}

function parseFrameRate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const [numeratorRaw, denominatorRaw] = raw.split("/");
  const numerator = Number(numeratorRaw);
  const denominator = denominatorRaw === undefined ? 1 : Number(denominatorRaw);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || numerator <= 0 || denominator <= 0) {
    return null;
  }
  return numerator / denominator;
}
