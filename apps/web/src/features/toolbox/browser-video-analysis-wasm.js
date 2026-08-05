import { FFmpeg } from "@ffmpeg/ffmpeg";

const REQUIRED_FRAME_RATE = 6;
const FRAME_MAX_EDGE = 360;

export async function probeBrowserVideoWasmRuntime(options = {}) {
  const ffmpeg = new FFmpeg();
  try {
    await ffmpeg.load({
      classWorkerURL: options.workerURL,
      coreURL: options.coreURL,
      wasmURL: options.wasmURL,
    });
    return true;
  } finally {
    ffmpeg.terminate();
  }
}

export async function decodeBrowserVideoTimelineWithWasm(file, options = {}) {
  if (!(file instanceof Blob)) throw new Error("未找到可处理的视频文件");
  const ffmpeg = new FFmpeg();
  const extension = extensionForFile(file);
  const inputPath = `/input.${extension}`;
  const outputDirectory = "/frames";
  const frameRate = REQUIRED_FRAME_RATE;
  const maxEdge = Math.max(240, Math.min(FRAME_MAX_EDGE, Math.round(Number(options.maxEdge) || FRAME_MAX_EDGE)));
  const frameUrls = [];
  try {
    await ffmpeg.load({
      classWorkerURL: options.workerURL,
      coreURL: options.coreURL,
      wasmURL: options.wasmURL,
    });
    ffmpeg.on("progress", (event) => {
      const progress = Number(event?.progress);
      if (Number.isFinite(progress)) {
        options.onProgress?.({ progress: Math.min(99, Math.round(progress * 99)), stage: "extracting_frames" });
      }
    });
    await ffmpeg.writeFile(inputPath, new Uint8Array(await file.arrayBuffer()));
    await ffmpeg.createDir(outputDirectory);
    const filter = `fps=${frameRate},scale=${maxEdge}:${maxEdge}:force_original_aspect_ratio=decrease`;
    const exitCode = await ffmpeg.exec([
      "-threads", "1",
      "-i", inputPath,
      "-vf", filter,
      "-q:v", "5",
      "-f", "image2",
      `${outputDirectory}/frame-%06d.jpg`,
    ]);
    if (exitCode !== 0) throw new Error("浏览器 WASM 解码器无法读取所选视频");

    const entries = (await ffmpeg.listDir(outputDirectory))
      .filter((entry) => entry && !entry.isDir && /^frame-\d{6}\.jpg$/i.test(String(entry.name)))
      .sort((left, right) => String(left.name).localeCompare(String(right.name)));
    if (!entries.length) throw new Error("浏览器 WASM 解码器没有生成视频画面");

    for (let index = 0; index < entries.length; index += 1) {
      const bytes = await ffmpeg.readFile(`${outputDirectory}/${entries[index].name}`);
      const url = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
      frameUrls.push(url);
      options.onProgress?.({
        progress: Math.min(99, Math.round(((index + 1) / entries.length) * 99)),
        stage: "extracting_frames",
      });
    }
    const durationMs = Math.round((entries.length / frameRate) * 1000);
    const timelineFrames = frameUrls.map((url, index) => ({
      index,
      timestampMs: Math.round(index * 1000 / frameRate),
      fileName: `browser-wasm-${String(index + 1).padStart(6, "0")}.jpg`,
      url,
    }));
    return {
      durationSeconds: durationMs / 1000,
      frameRate,
      frameCount: timelineFrames.length,
      sourceWidth: 0,
      sourceHeight: 0,
      outputWidth: 0,
      outputHeight: 0,
      contentType: "video/mp4",
      sourceFrameRate: 0,
      videoCodec: "",
      audioCodec: "",
      averageBitrate: 0,
      hasAudio: false,
      sourceDurationMs: durationMs,
      timelineFrames,
    };
  } catch (error) {
    frameUrls.forEach((url) => URL.revokeObjectURL(url));
    throw error;
  } finally {
    ffmpeg.terminate();
  }
}

function extensionForFile(file) {
  const name = String(file.name ?? "").toLowerCase();
  const fromName = name.match(/\.([a-z0-9]+)$/)?.[1];
  if (fromName && ["mp4", "webm", "mov", "mkv"].includes(fromName)) return fromName;
  const type = String(file.type ?? "").toLowerCase();
  if (type.includes("webm")) return "webm";
  if (type.includes("quicktime")) return "mov";
  return "mp4";
}
