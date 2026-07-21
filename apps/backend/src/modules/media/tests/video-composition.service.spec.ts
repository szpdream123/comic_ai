import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

import {
  composeVideoToMp4,
  validateVideoCompositionPlan,
  VideoCompositionError,
} from "../video-composition.service.ts";

test("video composition plan rejects unsafe paths, unsupported media, and invalid timing", () => {
  const absolute = join(tmpdir(), "video-composition-plan");
  const valid = {
    clips: [{ kind: "image" as const, sourcePath: join(absolute, "frame.png"), durationSeconds: 1 }],
    outputPath: join(absolute, "result.mp4"),
    width: 320,
    height: 180,
    fps: 24,
  };
  assert.equal(validateVideoCompositionPlan(valid).durationSeconds, 1);
  assert.throws(
    () => validateVideoCompositionPlan({ ...valid, clips: [] }),
    (error: unknown) => isCompositionError(error, "video_composition_clips_required"),
  );
  assert.throws(
    () => validateVideoCompositionPlan({ ...valid, outputPath: join(absolute, "result.zip") }),
    (error: unknown) => isCompositionError(error, "video_composition_output_path_invalid"),
  );
  assert.throws(
    () => validateVideoCompositionPlan({ ...valid, clips: [{ ...valid.clips[0]!, sourcePath: "https://example.test/frame.png" }] }),
    (error: unknown) => isCompositionError(error, "video_composition_source_path_invalid"),
  );
  assert.throws(
    () => validateVideoCompositionPlan({ ...valid, clips: [{ ...valid.clips[0]!, sourcePath: join(absolute, "frame.svg") }] }),
    (error: unknown) => isCompositionError(error, "video_composition_source_type_invalid"),
  );
  assert.throws(
    () => validateVideoCompositionPlan({ ...valid, clips: [{ ...valid.clips[0]!, durationSeconds: 0 }] }),
    (error: unknown) => isCompositionError(error, "video_composition_clip_duration_invalid"),
  );
  assert.throws(
    () => validateVideoCompositionPlan({ ...valid, width: 319 }),
    (error: unknown) => isCompositionError(error, "video_composition_width_invalid"),
  );
  assert.throws(
    () => validateVideoCompositionPlan(valid, { maxClips: 0 }),
    (error: unknown) => isCompositionError(error, "video_composition_limits_invalid"),
  );
});

test("real ffmpeg composition preserves image/video order and ffprobe verifies the MP4 artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "comic-ai-video-composition-test-"));
  const inputRoot = join(root, "input");
  const outputRoot = join(root, "output");
  const tempRoot = join(root, "work");
  await Promise.all([mkdir(inputRoot), mkdir(outputRoot), mkdir(tempRoot)]);
  const imagePath = join(inputRoot, "red.png");
  const videoPath = join(inputRoot, "blue.mp4");
  const outputPath = join(outputRoot, "composed.mp4");
  try {
    await runBinary(ffmpegInstaller.path, [
      "-hide_banner", "-loglevel", "error", "-f", "lavfi",
      "-i", "color=c=red:s=80x120:d=0.1", "-frames:v", "1", "-y", imagePath,
    ]);
    await runBinary(ffmpegInstaller.path, [
      "-hide_banner", "-loglevel", "error", "-f", "lavfi",
      "-i", "color=c=blue:s=160x90:d=0.8", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", videoPath,
    ]);

    const artifact = await composeVideoToMp4({
      clips: [
        { kind: "image", sourcePath: imagePath, durationSeconds: 0.6 },
        { kind: "video", sourcePath: videoPath, durationSeconds: 0.8 },
      ],
      outputPath,
      width: 320,
      height: 180,
      fps: 24,
    }, {
      allowedInputRoots: [inputRoot],
      allowedOutputRoot: outputRoot,
      tempRoot,
      limits: { timeoutMs: 30_000, maxOutputBytes: 16 * 1024 * 1024 },
    });

    assert.equal(artifact.contentType, "video/mp4");
    assert.equal(artifact.videoCodec, "h264");
    assert.equal(artifact.audioIncluded, false);
    assert.equal(artifact.clipCount, 2);
    assert.equal(artifact.width, 320);
    assert.equal(artifact.height, 180);
    assert.equal(artifact.fps, 24);
    assert.ok(Math.abs(artifact.durationSeconds - 1.4) <= 0.1);
    assert.equal((await stat(outputPath)).size, artifact.sizeBytes);
    const header = await readFile(outputPath);
    assert.equal(header.toString("ascii", 4, 8), "ftyp");

    const probe = JSON.parse((await runBinary(ffprobeInstaller.path, [
      "-v", "error", "-show_entries", "format=format_name,duration:stream=codec_type,codec_name,width,height,r_frame_rate",
      "-of", "json", outputPath,
    ])).stdout.toString("utf8"));
    assert.ok(String(probe.format.format_name).split(",").includes("mp4"));
    assert.ok(Math.abs(Number(probe.format.duration) - 1.4) <= 0.1);
    assert.deepEqual(
      probe.streams.find((stream: { codec_type: string }) => stream.codec_type === "video"),
      { codec_name: "h264", codec_type: "video", width: 320, height: 180, r_frame_rate: "24/1" },
    );

    const firstFrame = (await runBinary(ffmpegInstaller.path, [
      "-hide_banner", "-loglevel", "error", "-ss", "0.2", "-i", outputPath,
      "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
    ])).stdout;
    const secondFrame = (await runBinary(ffmpegInstaller.path, [
      "-hide_banner", "-loglevel", "error", "-ss", "0.9", "-i", outputPath,
      "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
    ])).stdout;
    assertPixelDominant(firstFrame, 320, 160, 90, "red");
    assertPixelDominant(secondFrame, 320, 160, 90, "blue");
    assert.deepEqual(await readdir(tempRoot), []);

    const originalBytes = await readFile(outputPath);
    await assert.rejects(
      composeVideoToMp4({
        clips: [{ kind: "image", sourcePath: imagePath, durationSeconds: 0.2 }],
        outputPath,
        width: 320,
        height: 180,
        fps: 24,
      }, { allowedInputRoots: [inputRoot], allowedOutputRoot: outputRoot, tempRoot }),
      (error: unknown) => isCompositionError(error, "video_composition_output_exists"),
    );
    assert.deepEqual(await readFile(outputPath), originalBytes);

    await assert.rejects(
      composeVideoToMp4({
        clips: [{ kind: "video", sourcePath: videoPath, durationSeconds: 0.2 }],
        outputPath: join(outputRoot, "input-too-large.mp4"),
        width: 320,
        height: 180,
        fps: 24,
      }, {
        allowedInputRoots: [inputRoot],
        allowedOutputRoot: outputRoot,
        tempRoot,
        limits: { maxInputFileBytes: 1024 },
      }),
      (error: unknown) => isCompositionError(error, "video_composition_input_file_limit_exceeded"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("composition rejects sources outside the allowlist and never creates an artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "comic-ai-video-composition-scope-"));
  const inputRoot = join(root, "allowed");
  const outsideRoot = join(root, "outside");
  const outputRoot = join(root, "output");
  const tempRoot = join(root, "work");
  await Promise.all([mkdir(inputRoot), mkdir(outsideRoot), mkdir(outputRoot), mkdir(tempRoot)]);
  const outsideImage = join(outsideRoot, "outside.png");
  const outputPath = join(outputRoot, "blocked.mp4");
  try {
    await runBinary(ffmpegInstaller.path, [
      "-hide_banner", "-loglevel", "error", "-f", "lavfi",
      "-i", "color=c=red:s=32x32:d=0.1", "-frames:v", "1", "-y", outsideImage,
    ]);
    await assert.rejects(
      composeVideoToMp4({
        clips: [{ kind: "image", sourcePath: outsideImage, durationSeconds: 0.2 }],
        outputPath,
        width: 64,
        height: 64,
        fps: 12,
      }, { allowedInputRoots: [inputRoot], allowedOutputRoot: outputRoot, tempRoot }),
      (error: unknown) => isCompositionError(error, "video_composition_source_outside_allowed_roots"),
    );
    await assert.rejects(stat(outputPath), { code: "ENOENT" });
    assert.deepEqual(await readdir(tempRoot), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("failed and timed-out executions clean temporary data and do not publish partial MP4 files", async () => {
  const root = await mkdtemp(join(tmpdir(), "comic-ai-video-composition-failure-"));
  const inputRoot = join(root, "input");
  const outputRoot = join(root, "output");
  const tempRoot = join(root, "work");
  await Promise.all([mkdir(inputRoot), mkdir(outputRoot), mkdir(tempRoot)]);
  const invalidVideo = join(inputRoot, "invalid.mp4");
  const imagePath = join(inputRoot, "long.png");
  const failedOutput = join(outputRoot, "failed.mp4");
  const limitedOutput = join(outputRoot, "limited.mp4");
  const timedOutOutput = join(outputRoot, "timed-out.mp4");
  try {
    await writeFile(invalidVideo, "not an mp4");
    await runBinary(ffmpegInstaller.path, [
      "-hide_banner", "-loglevel", "error", "-f", "lavfi",
      "-i", "color=c=green:s=640x360:d=0.1", "-frames:v", "1", "-y", imagePath,
    ]);
    await assert.rejects(
      composeVideoToMp4({
        clips: [{ kind: "video", sourcePath: invalidVideo, durationSeconds: 1 }],
        outputPath: failedOutput,
        width: 320,
        height: 180,
        fps: 24,
      }, { allowedInputRoots: [inputRoot], allowedOutputRoot: outputRoot, tempRoot }),
      (error: unknown) => isCompositionError(error, "video_composition_ffmpeg_failed"),
    );
    assert.deepEqual(await readdir(tempRoot), []);
    await assert.rejects(stat(failedOutput), { code: "ENOENT" });

    await assert.rejects(
      composeVideoToMp4({
        clips: [{ kind: "image", sourcePath: imagePath, durationSeconds: 3 }],
        outputPath: limitedOutput,
        width: 640,
        height: 360,
        fps: 30,
      }, {
        allowedInputRoots: [inputRoot],
        allowedOutputRoot: outputRoot,
        tempRoot,
        limits: { maxOutputBytes: 1024, timeoutMs: 30_000 },
      }),
      (error: unknown) => isCompositionError(error, "video_composition_output_limit_exceeded"),
    );
    assert.deepEqual(await readdir(tempRoot), []);
    await assert.rejects(stat(limitedOutput), { code: "ENOENT" });

    await assert.rejects(
      composeVideoToMp4({
        clips: [{ kind: "image", sourcePath: imagePath, durationSeconds: 30 }],
        outputPath: timedOutOutput,
        width: 1920,
        height: 1080,
        fps: 60,
      }, {
        allowedInputRoots: [inputRoot],
        allowedOutputRoot: outputRoot,
        tempRoot,
        limits: { timeoutMs: 1 },
      }),
      (error: unknown) => isCompositionError(error, "video_composition_timeout"),
    );
    assert.deepEqual(await readdir(tempRoot), []);
    await assert.rejects(stat(timedOutOutput), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function isCompositionError(error: unknown, code: string) {
  return error instanceof VideoCompositionError && error.code === code;
}

function assertPixelDominant(
  frame: Buffer,
  width: number,
  x: number,
  y: number,
  color: "red" | "blue",
) {
  const offset = (y * width + x) * 3;
  const [red, green, blue] = frame.subarray(offset, offset + 3);
  assert.ok(frame.length >= width * (y + 1) * 3);
  if (color === "red") assert.ok(red! > 180 && red! > green! * 2 && red! > blue! * 2, `expected red pixel, received ${red},${green},${blue}`);
  else assert.ok(blue! > 180 && blue! > red! * 2 && blue! > green! * 2, `expected blue pixel, received ${red},${green},${blue}`);
}

function runBinary(executable: string, args: string[]) {
  return new Promise<{ stdout: Buffer; stderr: Buffer }>((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
      else reject(new Error(`binary exited ${code}: ${Buffer.concat(stderr).toString("utf8")}`));
    });
  });
}
