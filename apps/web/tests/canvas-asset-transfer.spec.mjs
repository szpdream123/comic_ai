import assert from "node:assert/strict";
import test from "node:test";

import {
  copyCanvasAsset,
  downloadCanvasAsset,
  downloadCanvasAssetArchive,
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

  assert.equal(calls[0][0], "/api/storage/objects/storage%2F1/content?download=1");
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

test("Canvas batch download writes every media and text item into one archive", async () => {
  const files = [];
  const operations = [];
  class JSZipStub {
    file(name, blob) { files.push([name, blob]); }
    async generateAsync(options) {
      assert.deepEqual(options, { type: "blob", compression: "STORE" });
      return new Blob(["zip"], { type: "application/zip" });
    }
  }
  const anchor = { click: () => operations.push("click"), remove: () => operations.push("remove") };
  const result = await downloadCanvasAssetArchive({
    items: [
      { storageObjectId: "storage-1", fileName: "镜头", mediaKind: "video" },
      { storageObjectId: "storage-2", fileName: "镜头", mediaKind: "video" },
      { textContent: "旁白内容", fileName: "旁白.txt", mediaKind: "text" },
    ],
    fileName: "运行组.zip",
    JSZipCtor: JSZipStub,
    fetchImpl: async () => responseFromChunks([new Uint8Array([1])], "video/mp4"),
    documentRef: { createElement: () => anchor, body: { append: () => operations.push("append") } },
    urlApi: { createObjectURL: () => "blob:zip", revokeObjectURL: (url) => operations.push(`revoke:${url}`) },
  });

  assert.deepEqual(files.map(([name]) => name), ["镜头.mp4", "镜头-2.mp4", "旁白.txt"]);
  assert.equal(files[2][1].type, "text/plain;charset=utf-8");
  assert.equal(anchor.download, "运行组.zip");
  assert.deepEqual(operations, ["append", "click", "remove", "revoke:blob:zip"]);
  assert.deepEqual({ downloaded: result.downloaded, failed: result.failed, total: result.total }, { downloaded: 3, failed: 0, total: 3 });
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
