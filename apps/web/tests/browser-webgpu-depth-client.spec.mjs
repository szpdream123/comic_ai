import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createVideoDepthFramePlan,
  selectVideoDepthEncoding,
} from "../src/features/toolbox/browser-video-depth-encoder.js";
import {
  installBrowserWebGpuDepth,
  isBrowserWebGpuDepthInstalled,
  mapDepthColor,
  checkBrowserWebGpuDepth,
  resolveProcessingSettings,
  uninstallBrowserWebGpuDepth,
} from "../src/features/toolbox/browser-webgpu-depth-client.js";

test("video depth encoder keeps a ten-second output on a deterministic frame timeline", () => {
  const frames = createVideoDepthFramePlan(10, 8);
  const fractionalFrames = createVideoDepthFramePlan(10.03, 8);

  assert.equal(frames.length, 80);
  assert.equal(frames[0].timestamp, 0);
  assert.equal(frames.at(-1).timestamp + frames.at(-1).duration, 10);
  assert.equal(frames.reduce((total, frame) => total + frame.duration, 0), 10);
  assert.equal(fractionalFrames.at(-1).timestamp + fractionalFrames.at(-1).duration, 10.03);
});

test("video depth encoder selects a browser-supported WebM codec", async () => {
  const checked = [];
  const selected = await selectVideoDepthEncoding({ width: 640, height: 360 }, async (codec) => {
    checked.push(codec);
    return codec === "vp8";
  });

  assert.deepEqual(checked, ["vp9", "vp8"]);
  assert.equal(selected.codec, "vp8");
});

test("video depth encoder honors an explicitly selected codec", async () => {
  const checked = [];
  const selected = await selectVideoDepthEncoding({ width: 640, height: 360, encoding: "av1" }, async (codec) => {
    checked.push(codec);
    return codec === "av1";
  });

  assert.deepEqual(checked, ["av1"]);
  assert.equal(selected.codec, "av1");
});

test("video depth encoder falls back to H.264 MP4 when WebM codecs are unavailable", async () => {
  const checked = [];
  const selected = await selectVideoDepthEncoding({ width: 640, height: 360 }, async (codec) => {
    checked.push(codec);
    return codec === "avc";
  });

  assert.deepEqual(checked, ["vp9", "vp8", "av1", "avc"]);
  assert.equal(selected.codec, "avc");
  assert.equal(selected.container, "mp4");
});

test("video depth color options map the model output into visible palette variants", () => {
  assert.deepEqual(mapDepthColor(32, "grayscale"), [32, 32, 32]);
  assert.deepEqual(mapDepthColor(32, "inverse"), [223, 223, 223]);
  assert.notDeepEqual(mapDepthColor(128, "spectral"), [128, 128, 128]);
  assert.notDeepEqual(mapDepthColor(128, "heatmap"), [128, 128, 128]);
});

test("browser depth generation encodes completed depth frames instead of recording wall-clock time", async () => {
  const source = await readFile(new URL("../src/features/toolbox/browser-webgpu-depth-client.js", import.meta.url), "utf8");

  assert.match(source, /encodeVideoDepthFrames/);
  assert.match(source, /clearRect[\s\S]*putImageData/);
  assert.doesNotMatch(source, /captureStream|MediaRecorder|setTimeout/);
});

test("browser WebGPU depth plugin installs each model resource once and can uninstall", async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalVideoEncoder = globalThis.VideoEncoder;
  const originalVideoFrame = globalThis.VideoFrame;
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;
  const entries = new Map();
  const requests = [];
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { gpu: { async requestAdapter() { return {}; } } },
  });
  globalThis.VideoEncoder = class VideoEncoder {};
  globalThis.VideoFrame = class VideoFrame {};
  globalThis.caches = {
    async open() {
      return {
        async match(path) { return entries.get(String(path)); },
        async put(path, response) { entries.set(String(path), response); },
        async delete(path) { return entries.delete(String(path)); },
      };
    },
  };
  globalThis.fetch = async (path) => {
    requests.push(String(path));
    return new Response(new Uint8Array([1]), {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    });
  };

  try {
    await installBrowserWebGpuDepth();
    assert.equal(requests.length, 3);
    assert.equal(new Set(requests).size, 3);
    assert.equal(await isBrowserWebGpuDepthInstalled(), true);

    await uninstallBrowserWebGpuDepth();
    assert.equal(await isBrowserWebGpuDepthInstalled(), false);
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete globalThis.navigator;
    globalThis.VideoEncoder = originalVideoEncoder;
    globalThis.VideoFrame = originalVideoFrame;
    globalThis.caches = originalCaches;
    globalThis.fetch = originalFetch;
  }
});

test("browser depth falls back to WASM and conservatively clamps low-capability processing", async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalCaches = globalThis.caches;
  const originalVideoEncoder = globalThis.VideoEncoder;
  const originalVideoFrame = globalThis.VideoFrame;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { hardwareConcurrency: 2, deviceMemory: 4 },
  });
  globalThis.VideoEncoder = class VideoEncoder {};
  globalThis.VideoFrame = class VideoFrame {};
  globalThis.caches = { async open() { return { async match() { return undefined; } }; } };

  try {
    const support = await checkBrowserWebGpuDepth();
    const settings = resolveProcessingSettings({ resolution: "2k", frameRate: 24, backend: support.backend });
    assert.equal(support.ready, true);
    assert.equal(support.backend, "wasm");
    assert.equal(settings.maxEdge, 854);
    assert.equal(settings.frameRate, 6);
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete globalThis.navigator;
    globalThis.VideoEncoder = originalVideoEncoder;
    globalThis.VideoFrame = originalVideoFrame;
    globalThis.caches = originalCaches;
  }
});

test("browser depth returns the single unsupported message when local processing cannot run", async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalVideoEncoder = globalThis.VideoEncoder;
  const originalVideoFrame = globalThis.VideoFrame;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
  globalThis.VideoEncoder = undefined;
  globalThis.VideoFrame = undefined;

  try {
    const support = await checkBrowserWebGpuDepth();
    assert.deepEqual(support, {
      ready: false,
      error: "当前电脑浏览器不支持本地处理，请升级或更换浏览器",
    });
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete globalThis.navigator;
    globalThis.VideoEncoder = originalVideoEncoder;
    globalThis.VideoFrame = originalVideoFrame;
  }
});
