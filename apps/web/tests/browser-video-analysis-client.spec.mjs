import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createBrowserVideoAnalysisFramePlan,
} from "../src/features/toolbox/browser-video-analysis-decoder.js";
import {
  __browserVideoAnalysisTestUtils,
  checkBrowserVideoAnalysis,
  installBrowserVideoAnalysis,
  isBrowserVideoAnalysisInstalled,
  uninstallBrowserVideoAnalysis,
} from "../src/features/toolbox/browser-video-analysis-client.js";
import { __videoAnalysisPluginTestUtils } from "../src/features/toolbox/video-analysis-plugin-client.js";
import {
  buildBrowserPoseAnalysis,
  poseControlsFromLandmarks,
} from "../src/features/toolbox/browser-video-pose-runtime.js";

test("browser video analysis creates a complete ordered timeline at no less than 6 FPS", () => {
  const minimum = createBrowserVideoAnalysisFramePlan(13.033, 1);
  const higher = createBrowserVideoAnalysisFramePlan(2, 8);

  assert.equal(minimum.frameRate, 6);
  assert.equal(minimum.frames.length, 78);
  assert.equal(minimum.frames[0].timestampMs, 0);
  assert.equal(minimum.frames[1].timestampMs, 167);
  assert.equal(minimum.frames.at(-1).timestampMs, 12_833);
  assert.equal(minimum.frames.every((frame, index) => !index || frame.timestamp > minimum.frames[index - 1].timestamp), true);
  assert.equal(higher.frameRate, 8);
  assert.equal(higher.frames.length, 16);
  assert.throws(() => createBrowserVideoAnalysisFramePlan(300.01, 6), /300 秒/);
});

test("lightweight pose tracking preserves people when detection order changes", () => {
  const person = (x, height, controls) => ({
    anchor: { x, y: 0.55 },
    footY: 0.9,
    height,
    bbox: [x - 0.08, 0.9 - height, x + 0.08, 0.9],
    confidence: 0.9,
    controls,
  });
  const analysis = buildBrowserPoseAnalysis([
    { timestampMs: 0, detections: [person(0.5, 0.72, { "leftElbow.bend": 30 }), person(0.2, 0.42, {})] },
    { timestampMs: 167, detections: [person(0.22, 0.42, {}), person(0.52, 0.72, { "leftElbow.bend": 65 })] },
    { timestampMs: 334, detections: [person(0.54, 0.72, { "leftElbow.bend": 80 }), person(0.24, 0.42, {})] },
  ], 500);

  assert.equal(analysis.tracks.length, 2);
  assert.equal(analysis.tracks[0].isPrimary, true);
  assert.deepEqual(analysis.tracks[0].samples.map((sample) => sample.x), [0.5, 0.52, 0.54]);
  assert.equal(analysis.tracks[0].samples.at(-1).controls["leftElbow.bend"], 70.46);
  assert.ok(analysis.tracks[0].samples[0].depth < analysis.tracks[1].samples[0].depth);
});

test("lightweight pose tracking limits one-frame joint flips", () => {
  const detection = (bend) => ({
    anchor: { x: 0.5, y: 0.55 }, footY: 0.9, height: 0.7,
    bbox: [0.35, 0.2, 0.65, 0.9], confidence: 0.9,
    controls: { "leftElbow.bend": bend, "torso.roll": bend },
  });
  const analysis = buildBrowserPoseAnalysis([
    { timestampMs: 0, detections: [detection(0)] },
    { timestampMs: 167, detections: [detection(140)] },
  ], 334);

  assert.equal(analysis.tracks[0].samples[1].controls["leftElbow.bend"], 24.7);
  assert.equal(analysis.tracks[0].samples[1].controls["torso.roll"], 18.2);
});

test("lightweight pose tracking rejects impossible one-frame identity jumps", () => {
  const person = (x) => ({
    anchor: { x, y: 0.55 }, footY: 0.9, height: 0.6,
    bbox: [x - 0.08, 0.3, x + 0.08, 0.9], confidence: 0.9, controls: {},
  });
  const analysis = buildBrowserPoseAnalysis([
    { timestampMs: 0, detections: [person(0.2)] },
    { timestampMs: 167, detections: [person(0.23)] },
    { timestampMs: 334, detections: [person(0.75)] },
    { timestampMs: 501, detections: [person(0.78)] },
  ], 668);

  assert.equal(analysis.tracks.length, 2);
  assert.deepEqual(analysis.tracks.map((track) => track.samples.map((sample) => sample.x))
    .sort((left, right) => left[0] - right[0]), [
    [0.2, 0.23],
    [0.75, 0.78],
  ]);
});

test("pose landmarks produce director-compatible arm and leg controls", () => {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 }));
  const world = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));
  const set = (index, x, y, z = 0) => {
    landmarks[index] = { x, y, z, visibility: 1 };
    world[index] = { x, y, z };
  };
  set(0, 0.5, 0.2);
  set(7, 0.45, 0.25); set(8, 0.55, 0.25);
  set(11, 0.6, 0.4); set(12, 0.4, 0.4);
  set(13, 0.7, 0.4, -0.1); set(14, 0.3, 0.4, -0.1);
  set(15, 0.7, 0.55); set(16, 0.3, 0.55);
  set(19, 0.68, 0.6); set(20, 0.32, 0.6);
  set(23, 0.55, 0.62); set(24, 0.45, 0.62);
  set(25, 0.6, 0.78, -0.05); set(26, 0.4, 0.78, -0.05);
  set(27, 0.57, 0.94); set(28, 0.43, 0.94);
  const controls = poseControlsFromLandmarks(landmarks, world);

  assert.equal(controls["body.roll"], 0);
  assert.equal(controls["torso.roll"], 0);
  assert.equal(controls["head.roll"], 0);
  assert.equal(controls["leftShoulder.spread"], 90);
  assert.equal(controls["rightShoulder.spread"], -90);
  assert.ok(controls["leftElbow.bend"] > 0);
  assert.ok(Number.isFinite(controls["rightHip.pitch"]));
  assert.ok(controls["rightKnee.bend"] >= 0);
});

test("video prompt key frames follow visual similarity and never repeat", () => {
  const timelineFrames = Array.from({ length: 14 }, (_, index) => ({
    index,
    timestampMs: index * 1_000,
    fileName: `frame-${index}.jpg`,
    url: `blob:frame-${index}`,
  }));
  timelineFrames.push({ ...timelineFrames[5], fileName: "duplicate-frame.jpg" });
  const frameSignatures = timelineFrames.map((frame) => ({
    timestampMs: frame.timestampMs,
    signature: Array(3).fill(frame.timestampMs < 5_000 ? 0.2 : frame.timestampMs < 10_000 ? 0.91 : 0.2),
  }));
  const selected = __videoAnalysisPluginTestUtils.selectSimilarityKeyFrames({
    source: { durationMs: 13_000 },
    timelineFrames,
  }, {
    frameSignatures,
    maxIntervalMs: 8_000,
  });

  assert.deepEqual(selected.map((frame) => frame.timestampMs), [0, 5_000, 10_000]);
  assert.equal(new Set(selected.map((frame) => frame.timestampMs)).size, selected.length);
  assert.equal(__videoAnalysisPluginTestUtils.calculateSignatureDifference([0, 0.5], [0.5, 1]), 0.5);

  const blackFiltered = __videoAnalysisPluginTestUtils.selectSimilarityKeyFrames({
    timelineFrames: [
      { timestampMs: 0, url: "blob:black" },
      { timestampMs: 1_000, url: "blob:visible-1" },
      { timestampMs: 2_000, url: "blob:visible-2" },
    ],
  }, {
    frameSignatures: [
      { timestampMs: 0, signature: Array(27).fill(0.01) },
      { timestampMs: 1_000, signature: Array(27).fill(0.2) },
      { timestampMs: 2_000, signature: Array(27).fill(0.91) },
    ],
  });
  assert.deepEqual(blackFiltered.map((frame) => frame.timestampMs), [1_000, 2_000]);
  assert.equal(__videoAnalysisPluginTestUtils.isMostlyBlackSignature(Array(27).fill(0.01)), true);
  assert.equal(__videoAnalysisPluginTestUtils.isObscuredSignature(Array(27).fill(0.99)), true);
  assert.equal(__videoAnalysisPluginTestUtils.isObscuredSignature(Array(27).fill(0.5)), true);
  assert.equal(__videoAnalysisPluginTestUtils.isMostlyBlackSignature(Array.from({ length: 27 }, (_, index) => Math.floor(index / 3) % 2 ? 0.6 : 0.2)), false);
});

test("video analysis detects ordered shot segments from visual changes", () => {
  const segments = __videoAnalysisPluginTestUtils.detectShotSegments([
    { timestampMs: 0, signature: [0.1, 0.1, 0.1] },
    { timestampMs: 400, signature: [0.8, 0.8, 0.8] },
    { timestampMs: 1_000, signature: [0.85, 0.85, 0.85] },
    { timestampMs: 2_000, signature: [0.1, 0.1, 0.1] },
  ], 3_000);

  assert.deepEqual(segments.map(({ startMs, endMs }) => ({ startMs, endMs })), [
    { startMs: 0, endMs: 2_000 },
    { startMs: 2_000, endMs: 3_000 },
  ]);
  assert.equal(segments[1].confidence, 1);
});

test("video analysis ignores isolated motion spikes but keeps sustained scene replacements", () => {
  const isolatedSpike = __videoAnalysisPluginTestUtils.detectShotSegments([
    { timestampMs: 0, signature: [0.1, 0.1, 0.1] },
    { timestampMs: 200, signature: [0.1, 0.1, 0.1] },
    { timestampMs: 400, signature: [0.1, 0.1, 0.1] },
    { timestampMs: 600, signature: [0.9, 0.9, 0.9] },
    { timestampMs: 800, signature: [0.1, 0.1, 0.1] },
    { timestampMs: 1_000, signature: [0.1, 0.1, 0.1] },
  ], 1_200);
  assert.deepEqual(isolatedSpike.map((segment) => segment.startMs), [0]);

  const sustainedReplacement = __videoAnalysisPluginTestUtils.detectShotSegments([
    { timestampMs: 0, signature: [0.1, 0.1, 0.1] },
    { timestampMs: 200, signature: [0.1, 0.1, 0.1] },
    { timestampMs: 400, signature: [0.1, 0.1, 0.1] },
    { timestampMs: 600, signature: [0.9, 0.9, 0.9] },
    { timestampMs: 800, signature: [0.9, 0.9, 0.9] },
  ], 1_000);
  assert.deepEqual(sustainedReplacement.map((segment) => segment.startMs), [0, 600]);
});

test("video analysis preserves rapid stable montage cuts", () => {
  const segments = __videoAnalysisPluginTestUtils.detectShotSegments([
    { timestampMs: 0, signature: [0.1, 0.1, 0.1] },
    { timestampMs: 200, signature: [0.1, 0.1, 0.1] },
    { timestampMs: 400, signature: [0.1, 0.1, 0.1] },
    { timestampMs: 600, signature: [0.5, 0.5, 0.5] },
    { timestampMs: 800, signature: [0.5, 0.5, 0.5] },
    { timestampMs: 1_000, signature: [0.5, 0.5, 0.5] },
    { timestampMs: 1_200, signature: [0.9, 0.9, 0.9] },
    { timestampMs: 1_400, signature: [0.9, 0.9, 0.9] },
  ], 1_600);

  assert.deepEqual(segments.map((segment) => segment.startMs), [0, 600, 1_200]);
});

test("browser video analysis decoder uses Mediabunny capability probing and ordered canvas extraction", async () => {
  const source = await readFile(
    new URL("../src/features/toolbox/browser-video-analysis-decoder.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /Input/);
  assert.match(source, /BlobSource/);
  assert.match(source, /ALL_FORMATS/);
  assert.match(source, /videoTrack\.canDecode\(\)/);
  assert.match(source, /canvasesAtTimestamps/);
  assert.match(source, /readBrowserVideoSourceFrameRate/);
  assert.match(source, /videoTrack\.computePacketStats\(120\)/);
});

test("browser video analysis plugin resources keep their public toolbox paths after production bundling", () => {
  const decoderUrl = new URL(__browserVideoAnalysisTestUtils.resolveDecoderBundleUrl());
  const poseRuntimeUrl = new URL(__browserVideoAnalysisTestUtils.resolvePoseRuntimeBundleUrl());

  assert.equal(decoderUrl.pathname, "/src/features/toolbox/browser-video-analysis-decoder.bundle.js");
  assert.equal(poseRuntimeUrl.pathname, "/src/features/toolbox/browser-video-pose-runtime.bundle.js");
});

test("browser video analysis installs its decoder bundle into browser storage and uninstalls cleanly", async (context) => {
  const originals = captureBrowserGlobals();
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
  context.after(() => restoreBrowserGlobals(originals));
  context.after(() => {
    if (originalLocation) Object.defineProperty(globalThis, "location", originalLocation);
    else delete globalThis.location;
  });
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { origin: "https://acceptance.example:8443" },
  });
  const entries = new Map();
  const requests = [];
  installSupportedBrowserMocks();
  globalThis.caches = {
    async open() {
      return {
        async match(path) { return entries.get(String(path)); },
        async put(path, response) { entries.set(String(path), response); },
        async delete(path) { return entries.delete(String(path)); },
      };
    },
  };
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: {
        "content-type": "text/javascript",
        "content-length": "3",
      },
    });
  };

  assert.deepEqual(await checkBrowserVideoAnalysis(), {
    ready: true,
    installed: false,
    plugin: "video-analysis",
    version: "browser-6-stable-tracks",
    frameRate: 6,
    device: "浏览器本地解析",
  });
  const progress = [];
  await installBrowserVideoAnalysis({ verifyRuntime: false, onProgress: (value) => progress.push(value) });
  assert.equal(await isBrowserVideoAnalysisInstalled(), true);
  assert.equal(requests.length, 9);
  const toolboxRequests = requests
    .map((request) => new URL(request))
    .filter((request) => request.pathname.startsWith("/src/features/toolbox/"));
  assert.deepEqual(toolboxRequests.map((request) => request.pathname), [
    "/src/features/toolbox/browser-video-analysis-decoder.bundle.js",
    "/src/features/toolbox/browser-video-analysis-wasm.bundle.js",
    "/src/features/toolbox/browser-video-analysis-ffmpeg-worker.js",
    "/src/features/toolbox/browser-video-analysis-ffmpeg-core.js",
    "/src/features/toolbox/browser-video-analysis-ffmpeg-core.wasm",
    "/src/features/toolbox/browser-video-pose-runtime.bundle.js",
  ]);
  assert.equal(toolboxRequests.every((request) => request.origin === "https://acceptance.example:8443"), true);
  assert.ok(requests.includes(__browserVideoAnalysisTestUtils.resolveDecoderBundleUrl()));
  assert.ok(requests.includes(__browserVideoAnalysisTestUtils.resolvePoseRuntimeBundleUrl()));
  assert.ok(requests.includes(__browserVideoAnalysisTestUtils.resolvePoseModelUrl()));
  assert.equal(progress.at(-1).progress, 100);

  await uninstallBrowserVideoAnalysis();
  assert.equal(await isBrowserVideoAnalysisInstalled(), false);
});

test("browser video analysis stops installation immediately when canceled", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    installBrowserVideoAnalysis({ signal: controller.signal, verifyRuntime: false }),
    (error) => error?.name === "AbortError",
  );
});

test("browser WASM video analysis forwards cancellation to every expensive FFmpeg operation", async () => {
  const source = await readFile(
    new URL("../src/features/toolbox/browser-video-analysis-wasm.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /ffmpeg\.load\([\s\S]*signal: options\.signal/);
  assert.match(source, /ffmpeg\.writeFile\([\s\S]*signal: options\.signal/);
  assert.match(source, /ffmpeg\.exec\([\s\S]*signal: options\.signal/);
  assert.match(source, /ffmpeg\.readFile\([\s\S]*signal: options\.signal/);
});

test("browser video analysis reports unsupported when browser runtime APIs are unavailable", async (context) => {
  const originals = captureBrowserGlobals();
  context.after(() => restoreBrowserGlobals(originals));
  installSupportedBrowserMocks();
  globalThis.Worker = undefined;
  globalThis.WebAssembly = undefined;
  globalThis.caches = { async open() { return { async match() { return undefined; } }; } };

  assert.deepEqual(await checkBrowserVideoAnalysis(), {
    ready: false,
    installed: false,
    error: "当前电脑浏览器不支持本地视频解析，请升级或更换浏览器",
  });
});

test("browser video analysis keeps the WASM path available without WebCodecs", async (context) => {
  const originals = captureBrowserGlobals();
  context.after(() => restoreBrowserGlobals(originals));
  installSupportedBrowserMocks();
  globalThis.VideoDecoder = undefined;
  globalThis.VideoFrame = undefined;
  globalThis.caches = { async open() { return { async match() { return undefined; } }; } };

  const health = await checkBrowserVideoAnalysis();
  assert.equal(health.ready, true);
  assert.equal(health.installed, false);
  assert.equal(health.version, "browser-6-stable-tracks");
});

function installSupportedBrowserMocks() {
  globalThis.Worker = class Worker {};
  globalThis.VideoDecoder = class VideoDecoder {};
  globalThis.VideoFrame = class VideoFrame {};
  globalThis.createImageBitmap = async () => ({ close() {} });
  globalThis.document = {
    createElement(type) {
      assert.equal(type, "canvas");
      return {
        getContext() { return {}; },
        toBlob() {},
      };
    },
  };
  if (typeof globalThis.URL.createObjectURL !== "function") {
    globalThis.URL.createObjectURL = () => "blob:test";
  }
  if (typeof globalThis.URL.revokeObjectURL !== "function") {
    globalThis.URL.revokeObjectURL = () => undefined;
  }
}

function captureBrowserGlobals() {
  return {
    caches: globalThis.caches,
    document: globalThis.document,
    fetch: globalThis.fetch,
    indexedDB: globalThis.indexedDB,
    WebAssembly: globalThis.WebAssembly,
    Worker: globalThis.Worker,
    VideoDecoder: globalThis.VideoDecoder,
    VideoFrame: globalThis.VideoFrame,
    createImageBitmap: globalThis.createImageBitmap,
    createObjectURL: globalThis.URL.createObjectURL,
    revokeObjectURL: globalThis.URL.revokeObjectURL,
  };
}

function restoreBrowserGlobals(originals) {
  globalThis.caches = originals.caches;
  globalThis.document = originals.document;
  globalThis.fetch = originals.fetch;
  globalThis.indexedDB = originals.indexedDB;
  globalThis.WebAssembly = originals.WebAssembly;
  globalThis.Worker = originals.Worker;
  globalThis.VideoDecoder = originals.VideoDecoder;
  globalThis.VideoFrame = originals.VideoFrame;
  globalThis.createImageBitmap = originals.createImageBitmap;
  globalThis.URL.createObjectURL = originals.createObjectURL;
  globalThis.URL.revokeObjectURL = originals.revokeObjectURL;
}
