import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AI_CANVAS_MEDIA_CACHE_NAME,
  clearAiCanvasRuntimeMediaCache,
  installAiCanvasRuntimeMediaCache,
  isAiCanvasMediaCacheRequest,
  isAiCanvasMediaCacheUrl,
  persistAiCanvasMediaCacheResponse,
  resolveAiCanvasMediaCacheRequestUrl,
} from "../src/features/new-canvas/canvas-media-cache.js";

const ORIGIN = "http://127.0.0.1:4310";
const IMAGE_URL = `${ORIGIN}/api/storage/objects/11111111-1111-4111-8111-111111111111/content?proxy=1`;

function jsonResponse() {
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
}

function imageResponse(body = "img") {
  return new Response(body, { status: 200, headers: { "content-type": "image/png" } });
}

function createMemoryCache() {
  const store = new Map();
  return {
    store,
    async match(url) {
      const stored = store.get(String(url));
      return stored ? new Response(stored.body, { status: stored.status, headers: stored.headers }) : null;
    },
    async put(url, response) {
      store.set(String(url), {
        body: await response.blob(),
        status: response.status,
        headers: response.headers,
      });
    },
    async keys() {
      return [...store.keys()];
    },
    async delete(url) {
      return store.delete(String(url));
    },
  };
}

test("canvas media cache only matches storage image GETs", () => {
  assert.equal(isAiCanvasMediaCacheUrl("/api/storage/objects/obj-1/content?proxy=1", ORIGIN), true);
  assert.equal(isAiCanvasMediaCacheUrl("/api/storage/objects/obj-1/content?thumbnail=1", ORIGIN), true);
  assert.equal(isAiCanvasMediaCacheUrl("/api/storage/objects/obj-1/content?download=1", ORIGIN), false);
  assert.equal(isAiCanvasMediaCacheUrl("https://cdn.example/api/storage/objects/obj-1/content?proxy=1", ORIGIN), false);
  assert.equal(isAiCanvasMediaCacheUrl("blob:http://127.0.0.1/temp", ORIGIN), false);
  assert.equal(isAiCanvasMediaCacheRequest(IMAGE_URL, { method: "GET" }, ORIGIN), true);
  assert.equal(isAiCanvasMediaCacheRequest(IMAGE_URL, { method: "GET", cache: "no-store" }, ORIGIN), false);
  assert.equal(isAiCanvasMediaCacheRequest(IMAGE_URL, { method: "POST" }, ORIGIN), false);
  assert.equal(
    resolveAiCanvasMediaCacheRequestUrl("/api/storage/objects/obj-1/content?proxy=1", ORIGIN),
    `${ORIGIN}/api/storage/objects/obj-1/content?proxy=1`,
  );
});

test("canvas media cache stores image responses and reuses them on the next fetch", async () => {
  const cache = createMemoryCache();
  let stored;
  const storedReady = new Promise((resolve) => {
    stored = resolve;
  });
  const originalPut = cache.put.bind(cache);
  cache.put = async (url, response) => {
    await originalPut(url, response);
    stored();
  };
  const fetches = [];
  const networkFetch = async (url) => {
    fetches.push(url);
    return imageResponse(`net:${fetches.length}`);
  };
  const runtimeWindow = {
    location: { origin: ORIGIN },
    caches: {
      open: async () => cache,
    },
    fetch: networkFetch,
  };

  const bridge = installAiCanvasRuntimeMediaCache(runtimeWindow);
  const first = await runtimeWindow.fetch(IMAGE_URL, { credentials: "include" });
  assert.equal(await first.text(), "net:1");
  await storedReady;
  const second = await runtimeWindow.fetch(IMAGE_URL, { credentials: "include" });
  assert.equal(await second.text(), "net:1");
  assert.equal(fetches.length, 1);
  bridge.dispose();
  assert.notEqual(runtimeWindow.fetch.__comicAiMediaCache, true);
  await runtimeWindow.fetch(IMAGE_URL, { credentials: "include" });
  assert.equal(fetches.length, 2);
});

test("canvas media cache prunes the oldest entries past the cap", async () => {
  const cache = createMemoryCache();
  await persistAiCanvasMediaCacheResponse(cache, `${ORIGIN}/one`, imageResponse("a"), 2);
  await persistAiCanvasMediaCacheResponse(cache, `${ORIGIN}/two`, imageResponse("b"), 2);
  await persistAiCanvasMediaCacheResponse(cache, `${ORIGIN}/three`, imageResponse("c"), 2);
  assert.equal(cache.store.size, 2);
  assert.equal(cache.store.has(`${ORIGIN}/one`), false);
});

test("canvas media cache skips JSON and no-store requests", async () => {
  const cache = createMemoryCache();
  const fetches = [];
  const runtimeWindow = {
    location: { origin: ORIGIN },
    caches: { open: async () => cache },
    fetch: async (url, init) => {
      fetches.push({ url, init });
      return jsonResponse();
    },
  };
  installAiCanvasRuntimeMediaCache(runtimeWindow);
  await runtimeWindow.fetch(IMAGE_URL, { credentials: "include" });
  await runtimeWindow.fetch(IMAGE_URL, { credentials: "include", cache: "no-store" });
  assert.equal(cache.store.size, 0);
  assert.equal(fetches.length, 2);
});

test("logout clears the canvas media cache name", async () => {
  const deleted = [];
  await clearAiCanvasRuntimeMediaCache({
    delete: async (name) => {
      deleted.push(name);
      return true;
    },
  });
  assert.deepEqual(deleted, [AI_CANVAS_MEDIA_CACHE_NAME]);
  const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(appSource, /installAiCanvasRuntimeMediaCache\(runtimeWindow\)/);
  assert.match(appSource, /mediaCacheBridge\.dispose\(\)/);
  assert.match(appSource, /await clearAiCanvasRuntimeMediaCache\(\)/);
});
