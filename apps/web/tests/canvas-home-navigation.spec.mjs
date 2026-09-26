import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

// Exercise the existing bridge without booting the entire workbench UI.
const source = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
const bridgeSource = source.slice(source.indexOf("function getAiCanvasRuntimeProjectBridge("), source.indexOf("async function openAiCanvasRuntimeSkills("));
function bridge(flush, navigate, workbench = { ui: { selectedCanvasProjectId: "canvas-1" } }) {
  return vm.runInNewContext(`(${bridgeSource})`, {
    buildAiCanvasRuntimeProjectCatalog: () => [],
    countTaskCenterActiveTasks: () => 0,
    flushProjectCanvasSave: flush,
    handleAction: navigate,
  })(workbench);
}

for (const [callback, targetTab] of [["onOpenHome", "home"], ["onOpenProjects", "new-canvas"]]) {
test(`${targetTab} navigation waits for pending canvas save before leaving`, async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const calls = [];
  const context = bridge(() => { calls.push("save"); return pending; }, (_workbench, target) => {
    calls.push(target.dataset.tab);
  });
  const navigation = context[callback]();
  await new Promise(setImmediate);
  assert.deepEqual(calls, ["save"]);
  release();
  await navigation;
  assert.deepEqual(calls, ["save", targetTab]);
});

test(`${targetTab}: failed canvas save prevents navigation and exposes the error`, async () => {
  let navigated = false;
  const failure = new Error("保存失败");
  const context = bridge(async () => { throw failure; }, () => { navigated = true; });
  await assert.rejects(async () => context[callback](), /保存失败/);
  assert.equal(navigated, false);
});

test(`${targetTab} waits for the latest queued save and position request`, async () => {
  let releaseFirst, releaseLatest, releasePosition;
  const first = new Promise((resolve) => { releaseFirst = resolve; });
  const latest = new Promise((resolve) => { releaseLatest = resolve; });
  const positions = new Promise((resolve) => { releasePosition = resolve; });
  const workbench = { ui: {}, canvasSaveLock: first, canvasPositionSaveInFlight: positions };
  first.then(() => { workbench.canvasSaveLock = latest; });
  latest.then(() => { workbench.canvasSaveLock = null; });
  positions.then(() => { workbench.canvasPositionSaveInFlight = null; });
  let navigated = false;
  const context = bridge(async () => {}, () => { navigated = true; }, workbench);
  const result = context[callback]();
  releaseFirst();
  await new Promise(setImmediate);
  assert.equal(navigated, false);
  releasePosition();
  await new Promise(setImmediate);
  assert.equal(navigated, false);
  releaseLatest();
  await result;
  assert.equal(navigated, true);
});

test(`${targetTab}: a rejected position save keeps the user on canvas`, async () => {
  let rejectPosition;
  const pending = new Promise((_resolve, reject) => { rejectPosition = reject; });
  const workbench = { ui: {}, canvasPositionSaveInFlight: pending };
  let navigated = false;
  const result = bridge(async () => {}, () => { navigated = true; }, workbench)[callback]();
  const assertion = assert.rejects(result, /position_save_failed/);
  rejectPosition(new Error("position_save_failed"));
  await assertion;
  assert.equal(navigated, false);
  assert.equal(workbench.ui.canvasSaveStatus, "pending");
  workbench.canvasPositionSaveInFlight = null;
  let saved = false;
  await bridge(async () => {
    assert.equal(workbench.ui.canvasSaveStatus, "pending");
    saved = true;
  }, () => { assert.equal(saved, true); navigated = true; }, workbench)[callback]();
  assert.equal(navigated, true);
});

test(`${targetTab}: retrying navigation retries a failed document save`, async () => {
  const workbench = { ui: { canvasSaveStatus: "error" } };
  await bridge(async () => {
    assert.equal(workbench.ui.canvasSaveStatus, "pending");
  }, () => {}, workbench)[callback]();
});
}
