import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canvasVersionFingerprint,
  createCanvasVersionHistoryStore,
  summarizeCanvasVersion,
} from "../new-canvas/src/loomic-core/canvas-version-history.js";

const adapter = await readFile(new URL("../new-canvas/src/loomic-core/canvas-document-adapter.js", import.meta.url), "utf8");
const panel = await readFile(new URL("../new-canvas/src/loomic-shell/CanvasVersionHistoryPanel.jsx", import.meta.url), "utf8");
const shell = await readFile(new URL("../new-canvas/src/loomic-shell/LoomicCanvasShell.jsx", import.meta.url), "utf8");
const logoMenu = await readFile(new URL("../new-canvas/src/loomic-shell/CanvasLogoMenu.jsx", import.meta.url), "utf8");
const entry = await readFile(new URL("../new-canvas/src/main.jsx", import.meta.url), "utf8");

function memoryStore(initial = null) {
  let value = initial;
  return {
    async load() { return value; },
    async save(next) { value = next; },
    async remove() { value = null; },
    get value() { return value; },
  };
}

function content(label, viewport = {}) {
  return {
    elements: [
      { id: "text", type: "text", x: 10, y: 20, width: 100, height: 40, text: label, version: 1, versionNonce: 9, updated: 1 },
      { id: "image", type: "image", x: 250, y: 20, width: 120, height: 80, fileId: "file" },
      { id: "edge", type: "arrow", x: 110, y: 40, width: 140, height: 20 },
    ],
    appState: { viewBackgroundColor: "#fff", gridModeEnabled: true, scrollX: viewport.x ?? 0, scrollY: viewport.y ?? 0, zoom: { value: viewport.zoom ?? 1 } },
    files: { file: { id: "file", mimeType: "image/png", dataURL: "data:image/png;base64,abc" } },
  };
}

test("history fingerprints ignore viewport and transient element revisions but retain content changes", () => {
  const first = content("第一版", { x: 0, zoom: 1 });
  const navigated = content("第一版", { x: -900, zoom: 4 });
  navigated.elements[0].version = 22;
  navigated.elements[0].versionNonce = 333;
  navigated.elements[0].updated = 999;
  assert.equal(canvasVersionFingerprint(first), canvasVersionFingerprint(navigated));
  assert.notEqual(canvasVersionFingerprint(first), canvasVersionFingerprint(content("第二版")));
  assert.deepEqual(summarizeCanvasVersion(first), { nodeCount: 2, edgeCount: 1, mediaCount: 1 });
});

test("history snapshots deduplicate consecutive saves and keep the latest viewport metadata", async () => {
  const persistence = memoryStore();
  let clock = 0;
  const history = createCanvasVersionHistoryStore({
    store: persistence,
    now: () => `2026-07-19T00:00:0${clock++}.000Z`,
    idFactory: () => "version-one",
  });
  await history.record(content("同一内容", { x: 0 }), { source: "cloud", serverRevision: 4 });
  const result = await history.record(content("同一内容", { x: -200 }), { source: "cloud", serverRevision: 5 });
  assert.equal(result.deduplicated, true);
  const entries = await history.list();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].serverRevision, 5);
  const saved = await history.get(entries[0].id);
  assert.equal(saved.content.appState.scrollX, -200);

  const localHistory = createCanvasVersionHistoryStore({ store: memoryStore(), idFactory: () => "local" });
  await localHistory.record(content("本地"), { source: "local", serverRevision: null });
  assert.equal((await localHistory.list())[0].serverRevision, null);
});

test("history snapshots are bounded by count and serialized bytes", async () => {
  const persistence = memoryStore();
  let id = 0;
  const history = createCanvasVersionHistoryStore({ store: persistence, maxEntries: 3, maxBytes: 100000, idFactory: () => `v${++id}` });
  for (const label of ["一", "二", "三", "四", "五"]) await history.record(content(label));
  assert.deepEqual((await history.list()).map((entry) => entry.id), ["v5", "v4", "v3"]);

  const tiny = createCanvasVersionHistoryStore({ store: memoryStore(), maxBytes: 10 });
  assert.deepEqual(await tiny.record(content("过大")), { saved: false, reason: "too_large" });
  assert.deepEqual(await tiny.list(), []);
});

test("history list hides document bodies while get returns an isolated restoration snapshot", async () => {
  const history = createCanvasVersionHistoryStore({ store: memoryStore(), idFactory: () => "snapshot" });
  let notifications = 0;
  const unsubscribe = history.subscribe(() => { notifications += 1; });
  await history.record(content("可恢复"), { source: "local" });
  const listed = await history.list();
  assert.equal(Object.hasOwn(listed[0], "content"), false);
  const restored = await history.get("snapshot");
  restored.content.elements[0].text = "已修改副本";
  assert.equal((await history.get("snapshot")).content.elements[0].text, "可恢复");
  await history.clear();
  assert.equal(notifications, 2);
  assert.deepEqual(await history.list(), []);
  unsubscribe();
});

test("failed history persistence never exposes a version that disappears after refresh", async () => {
  const persistence = memoryStore();
  const history = createCanvasVersionHistoryStore({ store: persistence, idFactory: () => "stable" });
  await history.record(content("已保存"));
  persistence.save = async () => { throw new Error("disk full"); };
  await assert.rejects(history.record(content("未写入")), /disk full/);
  const entries = await history.list();
  assert.equal(entries.length, 1);
  assert.equal((await history.get("stable")).content.elements[0].text, "已保存");
});

test("version history panel is read-only until a confirmed safe restore", () => {
  assert.match(logoMenu, />版本历史<\/MenuItem>/);
  assert.match(shell, /<CanvasVersionHistoryPanel/);
  assert.match(panel, /history\.listHistory\(append \? \{ cursor: nextCursorRef\.current, limit: 25 \} : \{ limit: 25 \}\)/);
  assert.match(panel, /加载更多版本/);
  assert.match(panel, /loadEntries\(\{ append: true \}\)/);
  assert.match(panel, /new Map\(combined\.map\(\(entry\) => \[entry\.id, entry\]\)\)/);
  assert.match(panel, /history\.getHistoryEntry\(selectedId\)/);
  assert.match(panel, /confirmingId !== entryId/);
  assert.match(panel, /确认恢复/);
  assert.match(panel, /版本画布预览/);
  assert.doesNotMatch(panel, /history\.(?:save|record|remove)\(/);
});

test("restore snapshots the current scene, applies the target, then persists with rollback protection", () => {
  const readIndex = entry.indexOf("canvasStorage.getHistoryEntry?.(versionId)");
  const snapshotIndex = entry.indexOf("const currentContent = snapshotCanvasContent(canvasApi)", readIndex);
  const saveIndex = entry.indexOf("canvasStorage.save(canvasContext.canvasId, currentContent)", snapshotIndex);
  const applyIndex = entry.indexOf("applyVersionContentToCanvasApi(canvasApi, entry.content)", saveIndex);
  const hydratedRestoreIndex = entry.indexOf("const restoredContent = applyVersionContentToCanvasApi(canvasApi, entry.content)", saveIndex);
  const restoreSaveIndex = entry.indexOf("canvasStorage.save(canvasContext.canvasId, restoredContent)", hydratedRestoreIndex);
  assert.ok(readIndex >= 0 && snapshotIndex > readIndex && saveIndex > snapshotIndex && hydratedRestoreIndex > saveIndex && applyIndex > hydratedRestoreIndex && restoreSaveIndex > applyIndex);
  assert.match(entry, /saveResult\?\.status === "conflict"/);
  assert.match(entry, /restoreResult\?\.status === "conflict"/);
  assert.match(entry, /applyVersionContentToCanvasApi\(canvasApi, currentContent\)/);
  assert.match(entry, /version restore rollback failed/);
  assert.match(entry, /function applyVersionContentToCanvasApi/);
  assert.match(entry, /captureUpdate: "IMMEDIATELY"/);
  assert.match(adapter, /recordHistory\(normalized, "cloud"\)/);
  assert.match(adapter, /recordHistory\(normalized, "local"\)/);
  assert.match(adapter, /return \{ status: "conflict"/);
});
