import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  copyFile,
  link,
  mkdir,
  mkdtemp,
  open,
  realpath,
  rm,
  stat,
} from "node:fs/promises";
import { dirname, isAbsolute, extname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

const IMAGE_EXTENSIONS = new Set([".jpeg", ".jpg", ".png", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".m4v", ".mov", ".mp4", ".webm"]);
const AUDIO_EXTENSIONS = new Set([".aac", ".m4a", ".mp3", ".oga", ".ogg", ".wav", ".webm"]);

export interface VideoCompositionClip {
  kind: "image" | "video";
  sourcePath: string;
  durationSeconds: number;
  /** Optional source trim range. When omitted, durationSeconds is used as-is. */
  sourceIn?: number;
  sourceOut?: number;
  /** Transition metadata is preserved for callers; browser export currently renders it. */
  transitionIn?: {
    kind?: "none" | "dissolve" | "fade";
    duration?: number;
  };
}

export interface VideoCompositionAudio {
  sourcePath: string;
  /** Optional source trim range. The resulting audio is aligned to the video duration. */
  sourceIn?: number;
  sourceOut?: number;
  /** Linear gain, constrained to a practical range to avoid accidental clipping. */
  volume?: number;
  /** Timeline offset in seconds. The track starts after this offset. */
  timelineIn?: number;
  /** Optional fade durations in seconds. */
  fadeIn?: number;
  fadeOut?: number;
}

export interface VideoCompositionPlan {
  clips: VideoCompositionClip[];
  outputPath: string;
  /** Legacy single-track input or the production multi-track form. */
  audio?: VideoCompositionAudio | VideoCompositionAudio[];
  width?: number;
  height?: number;
  fps?: number;
}

export interface VideoCompositionLimits {
  maxClips?: number;
  maxClipDurationSeconds?: number;
  maxDurationSeconds?: number;
  maxInputFileBytes?: number;
  maxInputBytes?: number;
  maxOutputBytes?: number;
  timeoutMs?: number;
  maxProcessOutputBytes?: number;
}

export interface VideoCompositionOptions {
  allowedInputRoots: string[];
  allowedOutputRoot: string;
  tempRoot?: string;
  ffmpegPath?: string;
  ffprobePath?: string;
  limits?: VideoCompositionLimits;
}

export interface VideoCompositionArtifact {
  outputPath: string;
  contentType: "video/mp4";
  formatName: string;
  videoCodec: string;
  audioIncluded: boolean;
  clipCount: number;
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  sizeBytes: number;
}

interface NormalizedPlan {
  clips: VideoCompositionClip[];
  outputPath: string;
  audio?: VideoCompositionAudio[];
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
}

interface ResolvedLimits {
  maxClips: number;
  maxClipDurationSeconds: number;
  maxDurationSeconds: number;
  maxInputFileBytes: number;
  maxInputBytes: number;
  maxOutputBytes: number;
  timeoutMs: number;
  maxProcessOutputBytes: number;
}

interface ProbeResult {
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
  }>;
  format?: {
    format_name?: string;
    duration?: string;
    size?: string;
  };
}

export class VideoCompositionError extends Error {
  constructor(
    public readonly code: string,
    message = code,
    public readonly diagnostic?: string,
  ) {
    super(message);
    this.name = "VideoCompositionError";
  }
}

export function validateVideoCompositionPlan(
  input: VideoCompositionPlan,
  limitsInput: VideoCompositionLimits = {},
): NormalizedPlan {
  const limits = resolveLimits(limitsInput);
  if (!input || !Array.isArray(input.clips) || !input.clips.length) {
    throw new VideoCompositionError("video_composition_clips_required");
  }
  if (input.clips.length > limits.maxClips) {
    throw new VideoCompositionError("video_composition_clip_limit_exceeded");
  }
  if (!isSafeAbsolutePath(input.outputPath) || extname(input.outputPath).toLowerCase() !== ".mp4") {
    throw new VideoCompositionError("video_composition_output_path_invalid");
  }
  const width = normalizedEvenInteger(input.width ?? 1280, 16, 3840, "video_composition_width_invalid");
  const height = normalizedEvenInteger(input.height ?? 720, 16, 3840, "video_composition_height_invalid");
  if (width * height > 8_294_400) {
    throw new VideoCompositionError("video_composition_pixel_limit_exceeded");
  }
  const fps = normalizedInteger(input.fps ?? 30, 1, 60, "video_composition_fps_invalid");
  const clips = input.clips.map((clip) => {
    if (clip?.kind !== "image" && clip?.kind !== "video") {
      throw new VideoCompositionError("video_composition_clip_kind_invalid");
    }
    if (!isSafeAbsolutePath(clip.sourcePath)) {
      throw new VideoCompositionError("video_composition_source_path_invalid");
    }
    const extension = extname(clip.sourcePath).toLowerCase();
    const allowedExtensions = clip.kind === "image" ? IMAGE_EXTENSIONS : VIDEO_EXTENSIONS;
    if (!allowedExtensions.has(extension)) {
      throw new VideoCompositionError("video_composition_source_type_invalid");
    }
    const sourceIn = clip.sourceIn === undefined ? 0 : Number(clip.sourceIn);
    const sourceOut = clip.sourceOut === undefined ? undefined : Number(clip.sourceOut);
    if (!Number.isFinite(sourceIn) || sourceIn < 0) {
      throw new VideoCompositionError("video_composition_source_in_invalid");
    }
    if (sourceOut !== undefined && (!Number.isFinite(sourceOut) || sourceOut <= sourceIn)) {
      throw new VideoCompositionError("video_composition_source_out_invalid");
    }
    const durationSeconds = sourceOut === undefined
      ? Number(clip.durationSeconds)
      : sourceOut - sourceIn;
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0.1 || durationSeconds > limits.maxClipDurationSeconds) {
      throw new VideoCompositionError("video_composition_clip_duration_invalid");
    }
    const transitionKind = clip.transitionIn?.kind ?? "none";
    if (!["none", "dissolve", "fade"].includes(transitionKind)) {
      throw new VideoCompositionError("video_composition_transition_invalid");
    }
    const transitionDuration = Number(clip.transitionIn?.duration ?? 0);
    if (!Number.isFinite(transitionDuration) || transitionDuration < 0 || transitionDuration > durationSeconds) {
      throw new VideoCompositionError("video_composition_transition_duration_invalid");
    }
    return {
      kind: clip.kind,
      sourcePath: resolve(clip.sourcePath),
      durationSeconds: roundSeconds(durationSeconds),
      sourceIn: roundSeconds(sourceIn),
      sourceOut: roundSeconds(sourceIn + durationSeconds),
      transitionIn: { kind: transitionKind, duration: roundSeconds(transitionDuration) },
    };
  });
  const transitionOverlap = clips.slice(1).reduce((total, clip) => total + (clip.transitionIn?.duration ?? 0), 0);
  const durationSeconds = roundSeconds(clips.reduce((total, clip) => total + clip.durationSeconds, 0) - transitionOverlap);
  if (durationSeconds > limits.maxDurationSeconds) {
    throw new VideoCompositionError("video_composition_duration_limit_exceeded");
  }
  const rawAudioTracks = input.audio === undefined
    ? []
    : Array.isArray(input.audio) ? input.audio : [input.audio];
  if (rawAudioTracks.length > 8) {
    throw new VideoCompositionError("video_composition_audio_track_limit_exceeded");
  }
  const audio = rawAudioTracks.map((track) => {
    if (!track || !isSafeAbsolutePath(track.sourcePath)) {
      throw new VideoCompositionError("video_composition_audio_source_path_invalid");
    }
    if (!AUDIO_EXTENSIONS.has(extname(track.sourcePath).toLowerCase())) {
      throw new VideoCompositionError("video_composition_audio_source_type_invalid");
    }
    const sourceIn = track.sourceIn === undefined ? 0 : Number(track.sourceIn);
    const sourceOut = track.sourceOut === undefined ? undefined : Number(track.sourceOut);
    if (!Number.isFinite(sourceIn) || sourceIn < 0) {
      throw new VideoCompositionError("video_composition_audio_source_in_invalid");
    }
    if (sourceOut !== undefined && (!Number.isFinite(sourceOut) || sourceOut <= sourceIn)) {
      throw new VideoCompositionError("video_composition_audio_source_out_invalid");
    }
    const volume = track.volume === undefined ? 1 : Number(track.volume);
    if (!Number.isFinite(volume) || volume < 0 || volume > 4) {
      throw new VideoCompositionError("video_composition_audio_volume_invalid");
    }
    const timelineIn = track.timelineIn === undefined ? 0 : Number(track.timelineIn);
    if (!Number.isFinite(timelineIn) || timelineIn < 0 || timelineIn >= durationSeconds) {
      throw new VideoCompositionError("video_composition_audio_timeline_in_invalid");
    }
    const sourceDuration = sourceOut === undefined ? durationSeconds : sourceOut - sourceIn;
    const fadeIn = track.fadeIn === undefined ? 0 : Number(track.fadeIn);
    const fadeOut = track.fadeOut === undefined ? 0 : Number(track.fadeOut);
    if (!Number.isFinite(fadeIn) || fadeIn < 0 || fadeIn > sourceDuration) {
      throw new VideoCompositionError("video_composition_audio_fade_in_invalid");
    }
    if (!Number.isFinite(fadeOut) || fadeOut < 0 || fadeOut > sourceDuration) {
      throw new VideoCompositionError("video_composition_audio_fade_out_invalid");
    }
    return {
      sourcePath: resolve(track.sourcePath),
      sourceIn: roundSeconds(sourceIn),
      sourceOut: sourceOut === undefined ? undefined : roundSeconds(sourceOut),
      volume: roundSeconds(volume),
      timelineIn: roundSeconds(timelineIn),
      fadeIn: roundSeconds(fadeIn),
      fadeOut: roundSeconds(fadeOut),
    };
  });
  return {
    clips,
    outputPath: resolve(input.outputPath),
    ...(audio.length ? { audio } : {}),
    width,
    height,
    fps,
    durationSeconds,
  };
}

export async function composeVideoToMp4(
  input: VideoCompositionPlan,
  options: VideoCompositionOptions,
): Promise<VideoCompositionArtifact> {
  const limits = resolveLimits(options?.limits);
  const plan = validateVideoCompositionPlan(input, limits);
  if (!Array.isArray(options?.allowedInputRoots) || !options.allowedInputRoots.length) {
    throw new VideoCompositionError("video_composition_input_roots_required");
  }
  if (!isSafeAbsolutePath(options.allowedOutputRoot)) {
    throw new VideoCompositionError("video_composition_output_root_invalid");
  }
  const ffmpegPath = resolveExecutablePath(options.ffmpegPath ?? ffmpegInstaller.path, "ffmpeg");
  const ffprobePath = resolveExecutablePath(options.ffprobePath ?? ffprobeInstaller.path, "ffprobe");
  await assertExecutableFile(ffmpegPath, "video_composition_ffmpeg_unavailable");
  await assertExecutableFile(ffprobePath, "video_composition_ffprobe_unavailable");

  const inputRoots = await Promise.all(options.allowedInputRoots.map((root) => resolveExistingDirectory(root, "video_composition_input_root_invalid")));
  const outputRoot = await resolveExistingDirectory(options.allowedOutputRoot, "video_composition_output_root_invalid");
  const outputPath = await resolveOutputPath(plan.outputPath, outputRoot);
  const clips = [];
  let totalInputBytes = 0;
  for (const clip of plan.clips) {
    const sourcePath = await realpath(clip.sourcePath).catch(() => {
      throw new VideoCompositionError("video_composition_source_missing");
    });
    if (!inputRoots.some((root) => pathIsInside(root, sourcePath))) {
      throw new VideoCompositionError("video_composition_source_outside_allowed_roots");
    }
    const sourceStats = await stat(sourcePath);
    if (!sourceStats.isFile()) throw new VideoCompositionError("video_composition_source_not_file");
    if (sourceStats.size > limits.maxInputFileBytes) {
      throw new VideoCompositionError("video_composition_input_file_limit_exceeded");
    }
    totalInputBytes += sourceStats.size;
    if (totalInputBytes > limits.maxInputBytes) {
      throw new VideoCompositionError("video_composition_input_limit_exceeded");
    }
    clips.push({ ...clip, sourcePath });
  }
  const audio = [];
  for (const track of plan.audio ?? []) {
    const sourcePath = await realpath(track.sourcePath).catch(() => {
      throw new VideoCompositionError("video_composition_audio_source_missing");
    });
    if (!inputRoots.some((root) => pathIsInside(root, sourcePath))) {
      throw new VideoCompositionError("video_composition_audio_source_outside_allowed_roots");
    }
    const sourceStats = await stat(sourcePath);
    if (!sourceStats.isFile()) throw new VideoCompositionError("video_composition_audio_source_not_file");
    if (sourceStats.size > limits.maxInputFileBytes) {
      throw new VideoCompositionError("video_composition_input_file_limit_exceeded");
    }
    totalInputBytes += sourceStats.size;
    if (totalInputBytes > limits.maxInputBytes) {
      throw new VideoCompositionError("video_composition_input_limit_exceeded");
    }
    audio.push({ ...track, sourcePath });
  }

  const tempBase = resolve(options.tempRoot ?? tmpdir());
  await mkdir(tempBase, { recursive: true });
  const workRoot = await mkdtemp(join(tempBase, "comic-ai-video-compose-"));
  const workOutput = join(workRoot, "output.mp4");
  const publishStage = join(outputRoot, `.video-compose-${randomUUID()}.mp4`);
  let stageCreated = false;
  try {
    const args = buildFfmpegArguments({ ...plan, clips, ...(audio.length ? { audio } : {}) }, workOutput, limits.maxOutputBytes);
    await runMediaProcess(ffmpegPath, args, {
      timeoutMs: limits.timeoutMs,
      maxProcessOutputBytes: limits.maxProcessOutputBytes,
      outputPath: workOutput,
      maxOutputBytes: limits.maxOutputBytes,
      failureCode: "video_composition_ffmpeg_failed",
    });
    const artifact = await verifyMp4Artifact(workOutput, {
      ffprobePath,
      expectedDurationSeconds: plan.durationSeconds,
      expectedWidth: plan.width,
      expectedHeight: plan.height,
      expectedFps: plan.fps,
      expectedAudio: Boolean(audio.length),
      maxOutputBytes: limits.maxOutputBytes,
      timeoutMs: Math.min(limits.timeoutMs, 30_000),
      maxProcessOutputBytes: limits.maxProcessOutputBytes,
    });
    await copyFile(workOutput, publishStage, fsConstants.COPYFILE_EXCL);
    stageCreated = true;
    await link(publishStage, outputPath).catch((error: NodeJS.ErrnoException) => {
      if (error?.code === "EEXIST") throw new VideoCompositionError("video_composition_output_exists");
      throw error;
    });
    await rm(publishStage, { force: true }).catch(() => undefined);
    stageCreated = false;
    return {
      ...artifact,
      outputPath,
      contentType: "video/mp4",
      audioIncluded: Boolean(audio.length),
      clipCount: clips.length,
    };
  } finally {
    if (stageCreated) await rm(publishStage, { force: true }).catch(() => undefined);
    await rm(workRoot, { recursive: true, force: true });
  }
}

function buildFfmpegArguments(plan: NormalizedPlan, outputPath: string, maxOutputBytes: number) {
  const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-max_alloc", String(256 * 1024 * 1024)];
  for (const clip of plan.clips) {
    if (clip.kind === "video" && (clip.sourceIn ?? 0) > 0) {
      args.push("-ss", String(clip.sourceIn));
    }
    if (clip.kind === "image") {
      args.push("-loop", "1", "-framerate", String(plan.fps));
    }
    args.push("-protocol_whitelist", "file,pipe,crypto,data", "-i", clip.sourcePath);
  }
  const audioInputIndex = plan.clips.length;
  for (const track of plan.audio ?? []) {
    if ((track.sourceIn ?? 0) > 0) args.push("-ss", String(track.sourceIn));
    args.push("-protocol_whitelist", "file,pipe,crypto,data", "-i", track.sourcePath);
  }
  const filters = plan.clips.map((clip, index) => (
    `[${index}:v:0]scale=${plan.width}:${plan.height}:force_original_aspect_ratio=decrease,` +
    `pad=${plan.width}:${plan.height}:(ow-iw)/2:(oh-ih)/2:color=black,` +
    `setsar=1,fps=${plan.fps},tpad=stop_mode=clone:stop_duration=${clip.durationSeconds},` +
    `trim=duration=${clip.durationSeconds},setpts=PTS-STARTPTS[v${index}]`
  ));
  const hasTransitions = plan.clips.slice(1).some((clip) => Number(clip.transitionIn?.duration ?? 0) > 0);
  if (!hasTransitions) {
    filters.push(`${plan.clips.map((_, index) => `[v${index}]`).join("")}concat=n=${plan.clips.length}:v=1:a=0[outv]`);
  } else {
    const sequence: string[] = [];
    for (let index = 0; index < plan.clips.length; index += 1) {
      const clip = plan.clips[index]!;
      const incoming = index > 0 ? Math.min(clip.durationSeconds, Number(clip.transitionIn?.duration ?? 0)) : 0;
      const outgoing = index < plan.clips.length - 1
        ? Math.min(clip.durationSeconds, Number(plan.clips[index + 1]!.transitionIn?.duration ?? 0))
        : 0;
      const bodyDuration = clip.durationSeconds - incoming - outgoing;
      if (index > 0 && incoming > 0) {
        const previous = plan.clips[index - 1]!;
        const currentHead = `transition${index}Current`;
        const transition = `transition${index}`;
        filters.push(`[v${index}]trim=duration=${incoming},setpts=PTS-STARTPTS[${currentHead}]`);
        if (clip.transitionIn?.kind === "fade") {
          filters.push(`[${currentHead}]fade=t=in:st=0:d=${incoming}:color=black[${transition}]`);
        } else {
          const previousTail = `transition${index}Previous`;
          const progress = `T/${incoming}`;
          filters.push(`[v${index - 1}]trim=start=${previous.durationSeconds - incoming}:duration=${incoming},setpts=PTS-STARTPTS[${previousTail}]`);
          filters.push(`[${previousTail}][${currentHead}]blend=all_expr=A*(1-${progress})+B*(${progress}):shortest=1[${transition}]`);
        }
        sequence.push(`[${transition}]`);
      }
      if (bodyDuration > 0) {
        const body = `body${index}`;
        filters.push(`[v${index}]trim=start=${incoming}:duration=${bodyDuration},setpts=PTS-STARTPTS[${body}]`);
        sequence.push(`[${body}]`);
      }
    }
    filters.push(`${sequence.join("")}concat=n=${sequence.length}:v=1:a=0,trim=duration=${plan.durationSeconds},setpts=PTS-STARTPTS[outv]`);
  }
  if (plan.audio?.length) {
    const audioLabels = [];
    for (const [index, track] of plan.audio.entries()) {
      const audioDuration = track.sourceOut === undefined
        ? plan.durationSeconds
        : Math.min(plan.durationSeconds, Math.max(0.1, track.sourceOut - (track.sourceIn ?? 0)));
      const timelineIn = Number(track.timelineIn ?? 0);
      const filtersForTrack = [
        `aresample=async=1:first_pts=0`,
        `atrim=duration=${audioDuration}`,
        "asetpts=PTS-STARTPTS",
      ];
      if ((track.fadeIn ?? 0) > 0) filtersForTrack.push(`afade=t=in:st=0:d=${track.fadeIn}`);
      if ((track.fadeOut ?? 0) > 0) filtersForTrack.push(`afade=t=out:st=${Math.max(0, audioDuration - Number(track.fadeOut))}:d=${track.fadeOut}`);
      if ((track.volume ?? 1) !== 1) filtersForTrack.push(`volume=${track.volume ?? 1}`);
      if (timelineIn > 0) filtersForTrack.push(`adelay=${Math.round(timelineIn * 1000)}|${Math.round(timelineIn * 1000)}`);
      filtersForTrack.push("apad", `atrim=duration=${plan.durationSeconds}`);
      const label = `audio${index}`;
      filters.push(`[${audioInputIndex + index}:a:0]${filtersForTrack.join(",")}[${label}]`);
      audioLabels.push(`[${label}]`);
    }
    if (audioLabels.length === 1) {
      filters.push(`${audioLabels[0]}anull[outa]`);
    } else {
      filters.push(`${audioLabels.join("")}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0,atrim=duration=${plan.durationSeconds},asetpts=PTS-STARTPTS[outa]`);
    }
  }
  args.push(
    "-filter_complex", filters.join(";"),
    "-filter_complex_threads", "2",
    "-map", "[outv]",
    ...(plan.audio?.length ? ["-map", "[outa]"] : ["-an"]),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-threads", "2",
    "-pix_fmt", "yuv420p",
    "-r", String(plan.fps),
    ...(plan.audio?.length ? ["-c:a", "aac", "-b:a", "192k", "-shortest"] : []),
    "-movflags", "+faststart",
    "-fs", String(maxOutputBytes),
    "-y",
    outputPath,
  );
  return args;
}

async function verifyMp4Artifact(
  outputPath: string,
  input: {
    ffprobePath: string;
    expectedDurationSeconds: number;
    expectedWidth: number;
    expectedHeight: number;
    expectedFps: number;
    expectedAudio: boolean;
    maxOutputBytes: number;
    timeoutMs: number;
    maxProcessOutputBytes: number;
  },
) {
  const outputStats = await stat(outputPath).catch(() => null);
  if (!outputStats?.isFile() || outputStats.size <= 0) {
    throw new VideoCompositionError("video_composition_output_missing");
  }
  if (outputStats.size > input.maxOutputBytes) {
    throw new VideoCompositionError("video_composition_output_limit_exceeded");
  }
  const file = await open(outputPath, "r");
  try {
    const header = Buffer.alloc(12);
    const result = await file.read(header, 0, header.length, 0);
    if (result.bytesRead < 12 || header.toString("ascii", 4, 8) !== "ftyp") {
      throw new VideoCompositionError("video_composition_output_not_mp4");
    }
  } finally {
    await file.close();
  }
  const probe = await runMediaProcess(input.ffprobePath, [
    "-v", "error",
    "-show_entries", "format=format_name,duration,size:stream=codec_type,codec_name,width,height,r_frame_rate",
    "-of", "json",
    outputPath,
  ], {
    timeoutMs: input.timeoutMs,
    maxProcessOutputBytes: input.maxProcessOutputBytes,
    failureCode: "video_composition_ffprobe_failed",
  });
  let parsed: ProbeResult;
  try {
    parsed = JSON.parse(probe.stdout) as ProbeResult;
  } catch {
    throw new VideoCompositionError("video_composition_probe_invalid");
  }
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  const audio = parsed.streams?.find((stream) => stream.codec_type === "audio");
  const formatName = String(parsed.format?.format_name ?? "");
  const durationSeconds = Number(parsed.format?.duration);
  const sizeBytes = Number(parsed.format?.size ?? outputStats.size);
  const fps = parseFrameRate(video?.r_frame_rate);
  if (!formatName.split(",").includes("mp4")) throw new VideoCompositionError("video_composition_output_not_mp4");
  if (!video || video.codec_name !== "h264") throw new VideoCompositionError("video_composition_video_codec_invalid");
  if (input.expectedAudio && (!audio || audio.codec_name !== "aac")) {
    throw new VideoCompositionError("video_composition_audio_codec_invalid");
  }
  if (!input.expectedAudio && audio) {
    throw new VideoCompositionError("video_composition_unexpected_audio");
  }
  if (video.width !== input.expectedWidth || video.height !== input.expectedHeight) {
    throw new VideoCompositionError("video_composition_dimensions_invalid");
  }
  if (!Number.isFinite(durationSeconds) || Math.abs(durationSeconds - input.expectedDurationSeconds) > Math.max(0.2, 2 / input.expectedFps)) {
    throw new VideoCompositionError("video_composition_duration_invalid");
  }
  if (!Number.isFinite(fps) || Math.abs(fps - input.expectedFps) > 0.01) {
    throw new VideoCompositionError("video_composition_frame_rate_invalid");
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > input.maxOutputBytes) {
    throw new VideoCompositionError("video_composition_output_limit_exceeded");
  }
  return {
    formatName,
    videoCodec: video.codec_name,
    durationSeconds,
    width: video.width,
    height: video.height,
    fps,
    sizeBytes,
  };
}

async function runMediaProcess(
  executablePath: string,
  args: string[],
  options: {
    timeoutMs: number;
    maxProcessOutputBytes: number;
    outputPath?: string;
    maxOutputBytes?: number;
    failureCode: string;
  },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executablePath, args, {
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let stoppedCode = "";
    let settled = false;
    const stop = (code: string) => {
      if (settled || stoppedCode) return;
      stoppedCode = code;
      child.kill("SIGKILL");
    };
    const append = (current: Buffer, chunk: Buffer) => {
      const next = Buffer.concat([current, chunk]);
      if (next.length > options.maxProcessOutputBytes) {
        stop("video_composition_process_output_limit_exceeded");
        return next.subarray(Math.max(0, next.length - options.maxProcessOutputBytes));
      }
      return next;
    };
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    const timeout = setTimeout(() => stop("video_composition_timeout"), options.timeoutMs);
    const outputMonitor = options.outputPath && options.maxOutputBytes
      ? setInterval(() => {
          void stat(options.outputPath!).then((value) => {
            if (value.size > options.maxOutputBytes!) stop("video_composition_output_limit_exceeded");
          }).catch(() => undefined);
        }, 100)
      : null;
    const cleanup = () => {
      clearTimeout(timeout);
      if (outputMonitor) clearInterval(outputMonitor);
    };
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectPromise(new VideoCompositionError("video_composition_executor_unavailable", "video composition executor unavailable", error.message));
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      const diagnostic = stderr.toString("utf8").slice(-4000);
      if (stoppedCode) {
        rejectPromise(new VideoCompositionError(stoppedCode, stoppedCode, diagnostic));
        return;
      }
      if (code !== 0) {
        rejectPromise(new VideoCompositionError(options.failureCode, options.failureCode, diagnostic));
        return;
      }
      resolvePromise({ stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8") });
    });
  });
}

function resolveLimits(input: VideoCompositionLimits = {}): ResolvedLimits {
  return {
    maxClips: boundedInteger(input.maxClips, 50, 1, 200),
    maxClipDurationSeconds: boundedNumber(input.maxClipDurationSeconds, 120, 0.1, 600),
    maxDurationSeconds: boundedNumber(input.maxDurationSeconds, 600, 0.1, 3600),
    maxInputFileBytes: boundedInteger(input.maxInputFileBytes, 512 * 1024 * 1024, 1024, 4 * 1024 * 1024 * 1024),
    maxInputBytes: boundedInteger(input.maxInputBytes, 2 * 1024 * 1024 * 1024, 1024, 8 * 1024 * 1024 * 1024),
    maxOutputBytes: boundedInteger(input.maxOutputBytes, 512 * 1024 * 1024, 1024, 4 * 1024 * 1024 * 1024),
    timeoutMs: boundedInteger(input.timeoutMs, 120_000, 1, 30 * 60_000),
    maxProcessOutputBytes: boundedInteger(input.maxProcessOutputBytes, 1024 * 1024, 1024, 16 * 1024 * 1024),
  };
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  if (value === undefined) return fallback;
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < minimum || numeric > maximum) {
    throw new VideoCompositionError("video_composition_limits_invalid");
  }
  return numeric;
}

function boundedNumber(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  if (value === undefined) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < minimum || numeric > maximum) {
    throw new VideoCompositionError("video_composition_limits_invalid");
  }
  return numeric;
}

function normalizedInteger(value: unknown, minimum: number, maximum: number, code: string) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < minimum || numeric > maximum) throw new VideoCompositionError(code);
  return numeric;
}

function normalizedEvenInteger(value: unknown, minimum: number, maximum: number, code: string) {
  const numeric = normalizedInteger(value, minimum, maximum, code);
  if (numeric % 2 !== 0) throw new VideoCompositionError(code);
  return numeric;
}

function roundSeconds(value: number) {
  return Math.round(value * 1000) / 1000;
}

function isSafeAbsolutePath(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 4096
    && !value.includes("\0")
    && !value.includes("://")
    && isAbsolute(value);
}

function resolveExecutablePath(value: unknown, name: string) {
  if (!isSafeAbsolutePath(value)) throw new VideoCompositionError(`video_composition_${name}_unavailable`);
  return resolve(value);
}

async function assertExecutableFile(path: string, code: string) {
  const value = await stat(path).catch(() => null);
  if (!value?.isFile()) throw new VideoCompositionError(code);
}

async function resolveExistingDirectory(path: string, code: string) {
  if (!isSafeAbsolutePath(path)) throw new VideoCompositionError(code);
  const resolved = await realpath(path).catch(() => null);
  const value = resolved ? await stat(resolved).catch(() => null) : null;
  if (!resolved || !value?.isDirectory()) throw new VideoCompositionError(code);
  return resolved;
}

async function resolveOutputPath(path: string, outputRoot: string) {
  const outputPath = resolve(path);
  if (!pathIsInside(outputRoot, outputPath)) throw new VideoCompositionError("video_composition_output_outside_allowed_root");
  const parentPath = dirname(outputPath);
  await mkdir(parentPath, { recursive: true });
  const realParent = await realpath(parentPath);
  if (!pathIsInside(outputRoot, realParent)) throw new VideoCompositionError("video_composition_output_outside_allowed_root");
  const existing = await stat(outputPath).catch(() => null);
  if (existing) throw new VideoCompositionError("video_composition_output_exists");
  return outputPath;
}

function pathIsInside(root: string, candidate: string) {
  const pathDifference = relative(root, candidate);
  return pathDifference === "" || (!pathDifference.startsWith("..") && !isAbsolute(pathDifference));
}

function parseFrameRate(value: unknown) {
  const [numerator, denominator] = String(value ?? "").split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return Number.NaN;
  return numerator / denominator;
}
