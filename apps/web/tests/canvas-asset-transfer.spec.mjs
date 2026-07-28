import assert from "node:assert/strict";
import test from "node:test";

import {
  copyCanvasAsset,
  downloadCanvasAsset,
  fetchCanvasAssetBlob,
  normalizeCanvasAssetFileName,
} from "../src/features/production-workbench/canvas/canvas-asset-transfer.js";

function responseFromChunks(chunks, contentType = "image/png") {
  let index = 0;
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => name === "content-length" ? String(total) : name === "content-type" ? contentType : null },
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) return { done: true, value: undefined };
            return { done: false, value: chunks[index++] };
          },
        };
      },
    },
  };
}

test("Canvas asset transfer streams authenticated storage content with progress", async () => {
  const calls = [];
  const progress = [];
  const result = await fetchCanvasAssetBlob({
    storageObjectId: "storage/1",
    fetchImpl: async (url, options) => {
      calls.push([url, options]);
      return responseFromChunks([new Uint8Array([1, 2]), new Uint8Array([3])]);
    },
    onProgress: (event) => progress.push(event),
  });

  assert.equal(calls[0][0], "/api/storage/objects/storage%2F1/content");
  assert.equal(calls[0][1].credentials, "include");
  assert.equal(result.totalBytes, 3);
  assert.equal(result.blob.size, 3);
  assert.deepEqual(progress.map((event) => [event.loaded, event.total, event.progress]), [
    [2, 3, 2 / 3],
    [3, 3, 1],
    [3, 3, 1],
  ]);
});

test("Canvas asset transfer stops before the next chunk after cancellation", async () => {
  const controller = new AbortController();
  let reads = 0;
  await assert.rejects(fetchCanvasAssetBlob({
    storageObjectId: "storage-1",
    signal: controller.signal,
    fetchImpl: async () => ({
      ...responseFromChunks([]),
      body: {
        getReader() {
          return {
            async read() {
              reads += 1;
              controller.abort();
              return { done: false, value: new Uint8Array([1]) };
            },
          };
        },
      },
    }),
  }), (error) => error?.errorCode === "canvas_asset_transfer_cancelled");
  assert.equal(reads, 1);
});

test("Canvas asset download uses a sanitized filename and revokes its temporary URL", async () => {
  const operations = [];
  const anchor = { click: () => operations.push("click"), remove: () => operations.push("remove") };
  await downloadCanvasAsset({
    storageObjectId: "storage-1",
    fileName: "bad:name?.png",
    fetchImpl: async () => responseFromChunks([new Uint8Array([1])]),
    documentRef: { createElement: () => anchor, body: { append: () => operations.push("append") } },
    urlApi: { createObjectURL: () => "blob:test", revokeObjectURL: (url) => operations.push(`revoke:${url}`) },
  });
  assert.equal(anchor.download, "bad-name-.png");
  assert.deepEqual(operations, ["append", "click", "remove", "revoke:blob:test"]);
});

test("Canvas asset copy writes the fetched Blob through ClipboardItem", async () => {
  const clipboardWrites = [];
  class ClipboardItemStub {
    constructor(value) { this.value = value; }
  }
  await copyCanvasAsset({
    storageObjectId: "storage-1",
    fetchImpl: async () => responseFromChunks([new Uint8Array([1, 2])], "image/webp"),
    clipboard: { write: async (items) => clipboardWrites.push(items) },
    ClipboardItemCtor: ClipboardItemStub,
  });
  assert.equal(clipboardWrites.length, 1);
  assert.equal(clipboardWrites[0][0].value["image/webp"].size, 2);
});

test("Canvas asset transfer rejects truncated content and normalizes empty names", async () => {
  await assert.rejects(fetchCanvasAssetBlob({
    storageObjectId: "storage-1",
    fetchImpl: async () => ({
      ...responseFromChunks([new Uint8Array([1])]),
      headers: { get: (name) => name === "content-length" ? "2" : "image/png" },
    }),
  }), (error) => error?.errorCode === "canvas_asset_transfer_incomplete");
  assert.equal(normalizeCanvasAssetFileName("   "), "canvas-asset");
});
