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
});

test("browser video analysis installs its decoder bundle into browser storage and uninstalls cleanly", async (context) => {
  const originals = captureBrowserGlobals();
  context.after(() => restoreBrowserGlobals(originals));
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
    version: "browser-2-wasm",
    frameRate: 6,
    device: "浏览器本地解析",
  });
  const progress = [];
  await installBrowserVideoAnalysis({ verifyRuntime: false, onProgress: (value) => progress.push(value) });
  assert.equal(await isBrowserVideoAnalysisInstalled(), true);
  assert.equal(requests.length, 5);
  assert.ok(requests.includes(__browserVideoAnalysisTestUtils.resolveDecoderBundleUrl()));
  assert.equal(progress.at(-1).progress, 100);

  await uninstallBrowserVideoAnalysis();
  assert.equal(await isBrowserVideoAnalysisInstalled(), false);
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
  assert.equal(health.version, "browser-2-wasm");
});

function installSupportedBrowserMocks() {
  globalThis.Worker = class Worker {};
  globalThis.VideoDecoder = class VideoDecoder {};
  globalThis.VideoFrame = class VideoFrame {};
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
  globalThis.URL.createObjectURL = originals.createObjectURL;
  globalThis.URL.revokeObjectURL = originals.revokeObjectURL;
}
