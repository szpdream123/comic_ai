import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createCanvasProjectNameSync,
  initialCanvasProjectNameSaveState,
  mergeCanvasSaveStates,
  normalizeCanvasProjectName,
} from "../new-canvas/src/loomic-shell/project-name-sync.js";

const newCanvasPage = await readFile(new URL("../new-canvas/src/main.jsx", import.meta.url), "utf8");
const canvasShellSource = await readFile(new URL("../new-canvas/src/loomic-shell/LoomicCanvasShell.jsx", import.meta.url), "utf8");

test("project name sync keeps a failed title pending and retries it", async () => {
  const states = [];
  const pending = [];
  let attempts = 0;
  const sync = createCanvasProjectNameSync({
    save: async (title) => {
      attempts += 1;
      assert.equal(title, "新标题");
      if (attempts === 1) throw new Error("offline");
    },
    onPendingChange: (title) => pending.push(title),
    onStateChange: (state) => states.push(state),
  });

  await assert.rejects(sync.schedule(" 新标题 "), /offline/);
  assert.equal(sync.pendingTitle(), "新标题");
  assert.deepEqual(states, ["saving", "error"]);

  await sync.flush();
  assert.equal(sync.pendingTitle(), "");
  assert.equal(attempts, 2);
  assert.deepEqual(pending, ["新标题", ""]);
  assert.deepEqual(states, ["saving", "error", "saving", "saved"]);
});

test("project name sync serializes rapid edits and persists the latest title", async () => {
  const saved = [];
  let releaseFirst;
  const first = new Promise((resolve) => { releaseFirst = resolve; });
  const sync = createCanvasProjectNameSync({
    save: async (title) => {
      saved.push(title);
      if (saved.length === 1) await first;
    },
  });

  const firstSave = sync.schedule("标题一");
  const secondSave = sync.schedule("标题二");
  await Promise.resolve();
  releaseFirst();
  await Promise.all([firstSave, secondSave]);

  assert.deepEqual(saved, ["标题一", "标题二"]);
  assert.equal(sync.pendingTitle(), "");
});

test("project name conflicts freeze queued writes until an explicit retry or discard", async () => {
  const saved = [];
  const states = [];
  const pending = [];
  const conflict = new Error("title conflict");
  conflict.errorCode = "canvas_project_title_conflict";
  let attempts = 0;
  const sync = createCanvasProjectNameSync({
    save: async (title) => {
      saved.push(title);
      attempts += 1;
      if (attempts === 1) throw conflict;
    },
    onPendingChange: (title) => pending.push(title),
    onStateChange: (state) => states.push(state),
  });

  const first = sync.schedule("本地标题一");
  const second = sync.schedule("本地标题二");
  await assert.rejects(first, /title conflict/);
  await assert.rejects(second, /title conflict/);
  assert.deepEqual(saved, ["本地标题一"]);
  assert.equal(sync.pendingTitle(), "本地标题二");
  assert.ok(states.includes("conflict"));

  await sync.retryConflict();
  assert.deepEqual(saved, ["本地标题一", "本地标题二"]);
  assert.equal(sync.pendingTitle(), "");

  const discarded = createCanvasProjectNameSync({
    initialPendingTitle: "待放弃标题",
    onPendingChange: (title) => pending.push(title),
    onStateChange: (state) => states.push(state),
  });
  assert.deepEqual(discarded.discard(), { status: "discarded" });
  assert.equal(discarded.pendingTitle(), "");
  assert.equal(pending.at(-1), "");
  assert.equal(states.at(-1), "saved");
});

test("project name normalization keeps the persisted contract bounded", () => {
  assert.equal(normalizeCanvasProjectName("   "), "未命名创意画布");
  assert.equal(normalizeCanvasProjectName(` ${"甲".repeat(60)} `).length, 50);
});

test("combined save state never hides a document conflict or title failure", () => {
  assert.equal(mergeCanvasSaveStates("conflict", "saving"), "conflict");
  assert.equal(mergeCanvasSaveStates("saved", "error"), "error");
  assert.equal(mergeCanvasSaveStates("dirty", "saving"), "saving");
  assert.equal(mergeCanvasSaveStates("loading", "saved"), "loading");
  assert.equal(mergeCanvasSaveStates("loading", "local"), "local");
  assert.equal(mergeCanvasSaveStates("saved", "saved"), "saved");
  assert.match(canvasShellSource, /saveState === "loading"[\s\S]*?正在检查保存状态/);
});

test("a restored pending project title starts in a local-only save state", () => {
  assert.equal(initialCanvasProjectNameSaveState("待同步标题"), "local");
  assert.equal(initialCanvasProjectNameSaveState("  "), "saved");
  assert.match(newCanvasPage, /useState\(\(\) => initialCanvasProjectNameSaveState\([\s\S]*?projectNamePendingKey/);
});

test("project title patches use CAS and expose both explicit conflict resolutions", () => {
  assert.match(newCanvasPage, /updateCanvasProject\(canvasContext\.projectId, \{[\s\S]*?title,[\s\S]*?expectedTitle: projectNameServerTitleRef\.current/);
  assert.match(newCanvasPage, /projectNameSync\.discard\(\)/);
  assert.match(newCanvasPage, /projectNameSync\.retryConflict\(\)/);
  assert.match(newCanvasPage, /使用云端标题/);
  assert.match(newCanvasPage, /保留本地并覆盖/);
});
