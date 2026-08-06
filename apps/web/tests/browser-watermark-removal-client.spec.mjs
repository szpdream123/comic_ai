import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  buildWatermarkRemovalOutputPixelsForTest,
  __browserWatermarkRemovalTestUtils,
  checkBrowserWatermarkRemoval,
  installBrowserWatermarkRemoval,
  isBrowserWatermarkRemovalInstalled,
  resolveWatermarkOcrMatchesForTest,
  uninstallBrowserWatermarkRemoval,
} from "../src/features/toolbox/browser-watermark-removal-client.js";

test("watermark removal keeps model output transparent outside the selected mask", () => {
  const output = new Float32Array([
    10, 20,
    30, 40,
    50, 60,
  ]);
  const maskData = new Uint8ClampedArray([
    0, 0, 0, 255,
    255, 255, 255, 255,
  ]);

  assert.deepEqual(
    [...buildWatermarkRemovalOutputPixelsForTest(output, maskData, 2)],
    [10, 30, 50, 0, 20, 40, 60, 255],
  );
});

test("watermark removal converts normalized model output to display pixels", () => {
  const output = new Float32Array([
    0.5, 1,
    0.25, 0,
    0, 0.75,
  ]);
  const maskData = new Uint8ClampedArray([
    255, 255, 255, 255,
    255, 255, 255, 255,
  ]);

  assert.deepEqual(
    [...buildWatermarkRemovalOutputPixelsForTest(output, maskData, 2)],
    [128, 64, 0, 255, 255, 0, 191, 255],
  );
});

test("watermark removal hides the full selected area from the model input", () => {
  const imageData = new Uint8ClampedArray([
    255, 128, 64, 255,
    20, 40, 60, 255,
  ]);
  const maskData = new Uint8ClampedArray([
    255, 255, 255, 255,
    0, 0, 0, 255,
  ]);

  const { imageTensor, maskTensor } = __browserWatermarkRemovalTestUtils.buildWatermarkRemovalInputTensors(
    imageData,
    maskData,
    2,
  );

  assert.equal(imageTensor[0], 0);
  assert.ok(Math.abs(imageTensor[1] - (20 / 255)) < 1e-6);
  assert.equal(imageTensor[2], 0);
  assert.ok(Math.abs(imageTensor[3] - (40 / 255)) < 1e-6);
  assert.equal(imageTensor[4], 0);
  assert.ok(Math.abs(imageTensor[5] - (60 / 255)) < 1e-6);
  assert.deepEqual([...maskTensor], [1, 0]);
});

test("watermark removal finds only painted mask pixels", () => {
  const pixels = new Uint8ClampedArray(6 * 4 * 4);
  for (let y = 1; y < 3; y += 1) {
    for (let x = 2; x < 5; x += 1) pixels[(y * 6 + x) * 4] = 255;
  }

  assert.deepEqual(
    __browserWatermarkRemovalTestUtils.findWatermarkRemovalMaskBounds(pixels, 6, 4),
    { left: 2, top: 1, right: 5, bottom: 3, width: 3, height: 2 },
  );
});

test("watermark removal repairs a local high-resolution crop instead of shrinking the full image", () => {
  const maskBounds = { left: 80, top: 420, right: 350, bottom: 520, width: 270, height: 100 };
  const crop = __browserWatermarkRemovalTestUtils.resolveWatermarkRemovalCrop(maskBounds, 1600, 1000);

  assert.deepEqual(crop, {
    left: 0,
    top: 270,
    right: 675,
    bottom: 670,
    width: 675,
    height: 400,
  });
  assert.equal(crop.left <= maskBounds.left && crop.right >= maskBounds.right, true);
  assert.equal(crop.top <= maskBounds.top && crop.bottom >= maskBounds.bottom, true);
  assert.equal(crop.width < 1600 && crop.height < 1000, true);
});

test("watermark removal refines a broad selection to bright watermark strokes", () => {
  const width = 16;
  const height = 8;
  const imageData = new Uint8ClampedArray(width * height * 4);
  const rawMaskData = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    imageData[index * 4] = 80;
    imageData[index * 4 + 1] = 80;
    imageData[index * 4 + 2] = 80;
    imageData[index * 4 + 3] = 255;
    rawMaskData.fill(255, index * 4, index * 4 + 4);
  }
  for (let y = 1; y < 4; y += 1) {
    for (let x = 2; x < 6; x += 1) {
      const offset = (y * width + x) * 4;
      imageData[offset] = 250;
      imageData[offset + 1] = 250;
      imageData[offset + 2] = 250;
    }
  }
  const protectedOffset = (6 * width + 13) * 4;
  imageData[protectedOffset] = 178;
  imageData[protectedOffset + 1] = 150;
  imageData[protectedOffset + 2] = 135;

  const refined = __browserWatermarkRemovalTestUtils.refineWatermarkRemovalMaskData(
    imageData,
    rawMaskData,
    width,
    height,
  );
  const selectedPixels = [...Array(width * height).keys()].filter((index) => refined[index * 4] > 8).length;

  assert.equal(refined[(2 * width + 3) * 4], 255);
  assert.equal(refined[protectedOffset], 0);
  assert.equal(selectedPixels > 12 && selectedPixels < width * height, true);
});

test("watermark removal accepts a tightly framed bright text selection", () => {
  const width = 16;
  const height = 8;
  const imageData = new Uint8ClampedArray(width * height * 4);
  const rawMaskData = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    imageData[index * 4] = 30;
    imageData[index * 4 + 1] = 30;
    imageData[index * 4 + 2] = 30;
    imageData[index * 4 + 3] = 255;
    rawMaskData.fill(255, index * 4, index * 4 + 4);
  }
  for (let y = 1; y < 7; y += 1) {
    for (let x = 1; x < 13; x += 1) {
      const offset = (y * width + x) * 4;
      imageData[offset] = 255;
      imageData[offset + 1] = 255;
      imageData[offset + 2] = 255;
    }
  }
  const protectedOffset = (7 * width + 15) * 4;
  imageData[protectedOffset] = 175;
  imageData[protectedOffset + 1] = 145;
  imageData[protectedOffset + 2] = 130;

  const refined = __browserWatermarkRemovalTestUtils.refineWatermarkRemovalMaskData(
    imageData,
    rawMaskData,
    width,
    height,
  );

  assert.equal(refined[(3 * width + 5) * 4], 255);
  assert.equal(refined[protectedOffset], 0);
});

test("watermark removal also refines dark text on a bright selection", () => {
  const width = 16;
  const height = 8;
  const imageData = new Uint8ClampedArray(width * height * 4);
  const rawMaskData = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    imageData[index * 4] = 230;
    imageData[index * 4 + 1] = 230;
    imageData[index * 4 + 2] = 230;
    imageData[index * 4 + 3] = 255;
    rawMaskData.fill(255, index * 4, index * 4 + 4);
  }
  for (let y = 1; y < 4; y += 1) {
    for (let x = 2; x < 6; x += 1) {
      const offset = (y * width + x) * 4;
      imageData[offset] = 20;
      imageData[offset + 1] = 20;
      imageData[offset + 2] = 20;
    }
  }

  const refined = __browserWatermarkRemovalTestUtils.refineWatermarkRemovalMaskData(
    imageData,
    rawMaskData,
    width,
    height,
  );

  assert.equal(refined[(2 * width + 3) * 4], 255);
  assert.equal(refined[(7 * width + 15) * 4], 0);
});

test("watermark removal never falls back to deleting an unrecognized rectangle", () => {
  const width = 16;
  const height = 8;
  const imageData = new Uint8ClampedArray(width * height * 4);
  const rawMaskData = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    imageData[index * 4] = 150;
    imageData[index * 4 + 1] = 150;
    imageData[index * 4 + 2] = 150;
    imageData[index * 4 + 3] = 255;
    rawMaskData.fill(255, index * 4, index * 4 + 4);
  }
  for (let y = 2; y < 4; y += 1) {
    for (let x = 4; x < 7; x += 1) {
      const offset = (y * width + x) * 4;
      imageData[offset] = 170;
      imageData[offset + 1] = 170;
      imageData[offset + 2] = 170;
    }
  }

  const refined = __browserWatermarkRemovalTestUtils.refineWatermarkRemovalMaskData(
    imageData,
    rawMaskData,
    width,
    height,
  );

  assert.equal([...refined].some((value) => value > 8), false);
});

test("watermark removal prefers WebGPU and keeps the multithreaded WASM fallback", () => {
  const clientSource = readFileSync(new URL("../src/features/toolbox/browser-watermark-removal-client.js", import.meta.url), "utf8");
  const runtimeSource = readFileSync(new URL("../src/features/toolbox/browser-watermark-removal-runtime.js", import.meta.url), "utf8");
  const serverSource = readFileSync(new URL("../../backend/src/entrypoints/phone-auth-dev-server.ts", import.meta.url), "utf8");
  const runtimeModule = new URL("../vendor/ort-wasm-simd-threaded.mjs", import.meta.url);
  const runtimeWasm = new URL("../vendor/ort-wasm-simd-threaded.wasm", import.meta.url);

  assert.match(clientSource, /ort\.env\.wasm\.wasmPaths\s*=\s*"\/vendor\/"/);
  assert.match(clientSource, /ort\.env\.wasm\.proxy\s*=\s*true/);
  assert.match(clientSource, /executionProviders: \["webgpu"\]/);
  assert.match(clientSource, /executionProviders: \["wasm"\]/);
  assert.match(runtimeSource, /onnxruntime-web\/webgpu/);
  assert.match(serverSource, /cross-origin-opener-policy", "same-origin"/);
  assert.match(serverSource, /cross-origin-embedder-policy", "credentialless"/);
  assert.match(serverSource, /"ort-wasm-simd-threaded\.mjs"/);
  assert.match(serverSource, /"ort-wasm-simd-threaded\.wasm"/);
  assert.equal(existsSync(runtimeModule), true);
  assert.equal(existsSync(runtimeWasm), true);
  assert.doesNotMatch(clientSource, /watermark-ocr\.bundle|@paddlejs/);
});

test("watermark OCR CTC decoding collapses repeats and keeps mean confidence", () => {
  const dictionary = ["", "即", "梦", "A", "I", " "];
  const logits = new Float32Array([
    0.01, 0.98, 0.01, 0, 0, 0,
    0.01, 0.97, 0.02, 0, 0, 0,
    0.99, 0.01, 0, 0, 0, 0,
    0.01, 0, 0.96, 0.01, 0.02, 0,
    0.01, 0, 0, 0.95, 0.04, 0,
    0.01, 0, 0, 0.02, 0.94, 0.03,
  ]);
  const decoded = __browserWatermarkRemovalTestUtils.decodeOcrCtc(logits, [1, 6, 6], dictionary);

  assert.equal(decoded.text, "即梦AI");
  assert.equal(decoded.confidence > 0.95, true);
});

test("watermark OCR merges adjacent same-line components without joining other rows", () => {
  const merged = __browserWatermarkRemovalTestUtils.mergeOcrTextComponents([
    { left: 10, top: 10, right: 30, bottom: 30 },
    { left: 34, top: 11, right: 55, bottom: 31 },
    { left: 12, top: 70, right: 40, bottom: 90 },
  ]);

  assert.deepEqual(merged, [
    { left: 10, top: 10, right: 55, bottom: 31 },
    { left: 12, top: 70, right: 40, bottom: 90 },
  ]);
});

test("watermark OCR only auto-applies named platform text in a corner", () => {
  const result = resolveWatermarkOcrMatchesForTest(
    ["即梦AI", "普通字幕", "豆包"],
    [
      [[840, 900], [960, 900], [960, 940], [840, 940]],
      [[300, 400], [700, 400], [700, 450], [300, 450]],
      [[430, 400], [570, 400], [570, 440], [430, 440]],
    ],
    1000,
    1000,
  );

  assert.equal(result.regions.length, 1);
  assert.equal(result.regions[0].platform, "即梦");
  assert.equal(result.confidence >= 0.94, true);
});

test("watermark OCR normalizes traditional Jimeng text and rejects unknown marks", () => {
  const result = resolveWatermarkOcrMatchesForTest(
    ["即夢 AI", "某某相机"],
    [
      [[15, 20], [150, 20], [150, 55], [15, 55]],
      [[10, 930], [180, 930], [180, 970], [10, 970]],
    ],
    1000,
    1000,
  );

  assert.deepEqual(result.platforms, ["即梦"]);
  assert.equal(result.regions.length, 1);
});

test("watermark removal installs its browser model into local cache without a manual installer", async () => {
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;
  const entries = new Map();
  const requests = [];
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
    return new Response(new Uint8Array([1]), { status: 200 });
  };

  try {
    assert.equal((await checkBrowserWatermarkRemoval()).installed, false);
    await installBrowserWatermarkRemoval();
    assert.deepEqual(requests, [
      "/api/toolbox/watermark-removal/model",
      "/api/toolbox/watermark-removal/ocr/det",
      "/api/toolbox/watermark-removal/ocr/rec",
      "/api/toolbox/watermark-removal/ocr/dict",
    ]);
    assert.equal(await isBrowserWatermarkRemovalInstalled(), true);
  } finally {
    globalThis.caches = originalCaches;
    globalThis.fetch = originalFetch;
  }
});

test("watermark removal uninstall clears only its locally cached plugin resources", async () => {
  const originalCaches = globalThis.caches;
  const resourcePaths = [
    __browserWatermarkRemovalTestUtils.MODEL_CACHE_PATH,
    __browserWatermarkRemovalTestUtils.OCR_DETECTION_MODEL_CACHE_PATH,
    __browserWatermarkRemovalTestUtils.OCR_RECOGNITION_MODEL_CACHE_PATH,
    __browserWatermarkRemovalTestUtils.OCR_DICTIONARY_CACHE_PATH,
  ];
  const entries = new Map(resourcePaths.map((path) => [path, new Response(new Uint8Array([1]))]));
  entries.set("/models/another-tool/model.bin", new Response(new Uint8Array([2])));
  globalThis.caches = {
    async open() {
      return {
        async match(path) { return entries.get(String(path)); },
        async delete(path) { return entries.delete(String(path)); },
      };
    },
  };

  try {
    assert.equal(await isBrowserWatermarkRemovalInstalled(), true);
    await uninstallBrowserWatermarkRemoval();
    assert.equal(await isBrowserWatermarkRemovalInstalled(), false);
    assert.equal(entries.has("/models/another-tool/model.bin"), true);
    assert.equal(resourcePaths.every((path) => !entries.has(path)), true);
  } finally {
    globalThis.caches = originalCaches;
  }
});
