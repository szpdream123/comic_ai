import assert from "node:assert/strict";
import test from "node:test";

import {
  CANVAS_IMAGE_LOAD_RETRY_DELAYS_MS,
  bindCanvasImageLoadRetry,
  getCanvasImageLoadRetryDelay,
  isRetryableCanvasImageSource,
} from "../src/features/production-workbench/canvas/canvas-image-load-retry.js";

function fakeImage(src = "") {
  const listeners = new Map();
  return {
    src,
    currentSrc: "",
    dataset: {},
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    emit(type) { listeners.get(type)?.(); },
  };
}

test("canvas image retry uses bounded backoff and excludes inline media", () => {
  assert.deepEqual(CANVAS_IMAGE_LOAD_RETRY_DELAYS_MS, [400, 1200, 2500]);
  assert.deepEqual(CANVAS_IMAGE_LOAD_RETRY_DELAYS_MS.map((_, attempt) => getCanvasImageLoadRetryDelay(attempt)), [400, 1200, 2500]);
  assert.equal(getCanvasImageLoadRetryDelay(3), null);
  assert.equal(getCanvasImageLoadRetryDelay(-1), 400);
  assert.equal(isRetryableCanvasImageSource("https://cdn.example/image.png"), true);
  assert.equal(isRetryableCanvasImageSource("asset://localhost/image.png"), true);
  assert.equal(isRetryableCanvasImageSource("/api/storage/objects/object-1/content?proxy=1"), true);
  assert.equal(isRetryableCanvasImageSource("data:image/png;base64,abc"), false);
  assert.equal(isRetryableCanvasImageSource("blob:https://example/id"), false);
});

test("canvas image retry reassigns a signed-safe fragment and stops after the bound", () => {
  const image = fakeImage("https://cdn.example/image.png?token=abc");
  const timers = [];
  const cleared = [];
  const unbind = bindCanvasImageLoadRetry(image, {
    setTimeoutImpl(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimeoutImpl(timer) { cleared.push(timer); },
  });

  image.emit("error");
  assert.deepEqual(timers.map((timer) => timer.delay), [400]);
  timers.shift().callback();
  assert.equal(image.src, "https://cdn.example/image.png?token=abc#canvas-image-retry=1");
  image.emit("error");
  assert.deepEqual(timers.map((timer) => timer.delay), [1200]);
  timers.shift().callback();
  image.emit("error");
  timers.shift().callback();
  image.emit("error");
  assert.equal(image.dataset.canvasImageRetryExhausted, "true");
  unbind();
  assert.ok(cleared.length >= 0);
});

test("canvas image retry resets attempts after a successful load", () => {
  const image = fakeImage("https://cdn.example/image.png");
  const timers = [];
  bindCanvasImageLoadRetry(image, {
    setTimeoutImpl(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    clearTimeoutImpl() {},
  });
  image.emit("error");
  timers.shift().callback();
  image.emit("load");
  image.emit("error");
  assert.equal(timers.at(-1)?.delay, 400);
});
