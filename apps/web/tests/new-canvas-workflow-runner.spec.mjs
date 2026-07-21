import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildCanvasWorkflowGenerationPlan,
  createCanvasWorkflowRunQueue,
} from "../new-canvas/src/loomic-core/canvas-generation-execution.js";
import { estimateCanvasGenerationBatchCredits } from "../new-canvas/src/loomic-core/canvas-generation-credits.js";
import { markCanvasDrawingArrowsNonWorkflow } from "../new-canvas/src/loomic-core/canvas-workflow-edges.js";

const editorSource = await readFile(new URL("../new-canvas/src/loomic-core/CanvasEditor.jsx", import.meta.url), "utf8");
const bottomBarSource = await readFile(new URL("../new-canvas/src/loomic-core/CanvasBottomBar.jsx", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../new-canvas/src/main.jsx", import.meta.url), "utf8");
const sharedAppSource = await readFile(new URL("../app.js", import.meta.url), "utf8");
const sharedLoginSource = await readFile(new URL("../new-canvas/src/shared-login.js", import.meta.url), "utf8");

function node(id, type, order) {
  return { id, type: "rectangle", x: order * 100, customData: { type, prompt: id } };
}

function edge(id, source, target) {
  return {
    id,
    type: "arrow",
    startBinding: { elementId: source },
    endBinding: { elementId: target },
    customData: { workflowEdge: true },
  };
}

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("workflow generation plan follows typed-edge topology rather than canvas element order", () => {
  const elements = [
    node("video", "video-generator", 0),
    node("image", "image-generator", 1),
    { id: "script", type: "text", text: "镜头描述" },
    edge("script-image", "script", "image"),
    edge("image-video", "image", "video"),
  ];

  assert.deepEqual(buildCanvasWorkflowGenerationPlan(elements).map((request) => request.elementId), ["image", "video"]);
});

test("ordinary drawing arrows do not affect the billable workflow plan while port edges do", () => {
  const target = node("target", "image-generator", 0);
  const source = node("source", "image-generator", 1);
  const ordinary = markCanvasDrawingArrowsNonWorkflow([
    target,
    source,
    { id: "ordinary", type: "arrow", startBinding: { elementId: "source" }, endBinding: { elementId: "target" } },
  ]);
  assert.deepEqual(buildCanvasWorkflowGenerationPlan(ordinary).map((request) => request.elementId), ["target", "source"]);

  const portConnected = [target, source, edge("port-edge", "source", "target")];
  assert.deepEqual(buildCanvasWorkflowGenerationPlan(portConnected).map((request) => request.elementId), ["source", "target"]);
});

test("duplicate typed edges do not duplicate nodes in the billable workflow plan", () => {
  const elements = [
    { id: "script", type: "text", text: "雨夜" },
    node("image", "image-generator", 1),
    edge("first", "script", "image"),
    edge("duplicate", "script", "image"),
  ];
  assert.deepEqual(buildCanvasWorkflowGenerationPlan(elements).map((request) => request.elementId), ["image"]);
});

test("workflow generation plan executes director text before downstream generators", () => {
  const elements = [
    node("image", "image-generator", 0),
    node("director", "director-node", 1),
    node("video", "video-generator", 2),
    edge("director-image", "director", "image"),
    edge("image-video", "image", "video"),
  ];

  assert.deepEqual(buildCanvasWorkflowGenerationPlan(elements).map((request) => request.elementId), ["director", "image", "video"]);
});

test("workflow generation plan explicitly blocks a restored dependency cycle", () => {
  const elements = [
    node("image-a", "image-generator", 0),
    node("image-b", "image-generator", 1),
    edge("a-b", "image-a", "image-b"),
    edge("b-a", "image-b", "image-a"),
  ];
  assert.throws(
    () => buildCanvasWorkflowGenerationPlan(elements),
    (error) => error.code === "canvas_workflow_cycle"
      && /循环连接/.test(error.message)
      && error.details.edgeIds.length === 2,
  );
});

test("workflow credit estimate only exposes a total when every node cost is known", () => {
  assert.deepEqual(estimateCanvasGenerationBatchCredits([
    { model: { mediaType: "image", pricing: { baseCredits: 18 } }, parameters: {} },
    { model: { mediaType: "video", pricing: { baseCredits: 3, billingMode: "duration" } }, parameters: { durationSec: 8 } },
  ]), { estimatedCredits: 42, knownCredits: 42, unknownCount: 0, itemCount: 2 });
  assert.deepEqual(estimateCanvasGenerationBatchCredits([
    { model: { mediaType: "image", pricing: { baseCredits: 18 } }, parameters: {} },
    { model: null, parameters: {} },
  ]), { estimatedCredits: null, knownCredits: 18, unknownCount: 1, itemCount: 2 });
});

test("workflow queue only executes after start and pauses after the current task finishes", async () => {
  const calls = [];
  let finishFirst;
  const first = new Promise((resolve) => { finishFirst = resolve; });
  const queue = createCanvasWorkflowRunQueue({
    execute: async (request) => {
      calls.push(request.elementId);
      if (request.elementId === "image") await first;
    },
  });
  const requests = [{ elementId: "image" }, { elementId: "video" }];

  assert.deepEqual(calls, []);
  const firstDrain = queue.start(requests);
  assert.deepEqual(calls, ["image"]);
  queue.pause();
  assert.equal(queue.getState().status, "pausing");
  finishFirst();
  await firstDrain;
  assert.equal(queue.getState().status, "paused");
  assert.deepEqual(queue.getState().pendingNodeIds, ["video"]);

  queue.resume();
  await tick();
  assert.deepEqual(calls, ["image", "video"]);
  assert.equal(queue.getState().status, "completed");
  assert.equal(queue.getState().completed, 2);
});

test("workflow queue stops on failure until the user continues", async () => {
  const calls = [];
  const queue = createCanvasWorkflowRunQueue({
    execute: async (request) => {
      calls.push(request.elementId);
      if (request.elementId === "image") throw new Error("image failed");
    },
  });

  await queue.start([{ elementId: "image" }, { elementId: "video" }]);
  assert.equal(queue.getState().status, "failed");
  assert.equal(queue.getState().completed, 0);
  assert.deepEqual(queue.getState().pendingNodeIds, ["video"]);
  assert.deepEqual(queue.getState().failures, [{ id: "image", message: "image failed" }]);

  queue.resume();
  await tick();
  assert.deepEqual(calls, ["image", "video"]);
  assert.equal(queue.getState().status, "completed_with_errors");
  assert.equal(queue.getState().completed, 1);
});

test("workflow queue retries failed nodes explicitly without duplicating pending nodes", async () => {
  const calls = [];
  let attempts = 0;
  const queue = createCanvasWorkflowRunQueue({
    execute: async (request) => {
      calls.push(request.elementId);
      if (request.elementId === "image" && attempts++ === 0) throw new Error("image failed");
    },
  });

  await queue.start([{ elementId: "image", type: "image-generator" }, { elementId: "video", type: "video-generator" }]);
  assert.equal(queue.getState().status, "failed");
  queue.resume();
  await tick();
  assert.equal(queue.getState().status, "completed_with_errors");
  assert.deepEqual(calls, ["image", "video"]);

  queue.retryFailures([{ elementId: "image", type: "image-generator" }, { elementId: "image", type: "image-generator" }]);
  await tick();
  await tick();
  assert.deepEqual(calls, ["image", "video", "image"]);
  assert.equal(queue.getState().status, "completed");
  assert.equal(queue.getState().completed, 2);
  assert.deepEqual(queue.getState().failures, []);
});

test("restored failed workflow retries the failed node before persisted pending work", async () => {
  const calls = [];
  const snapshots = [];
  const queue = createCanvasWorkflowRunQueue({
    initialSnapshot: {
      state: { status: "failed", total: 2, completed: 0, failures: [{ id: "image", message: "image failed" }] },
      pendingRequests: [{ elementId: "video", type: "video-generator" }],
    },
    execute: async (request) => calls.push(request.elementId),
    onSnapshotChange: (snapshot) => snapshots.push(snapshot ? structuredClone(snapshot) : null),
  });
  await tick();
  assert.deepEqual(calls, []);

  queue.retryFailures([{ elementId: "image", type: "image-generator" }]);
  assert.deepEqual(snapshots[0].state.failures, []);
  assert.deepEqual(snapshots[0].pendingRequests.map((request) => request.elementId), ["image", "video"]);
  await tick();
  await tick();
  assert.deepEqual(calls, ["image", "video"]);
  assert.equal(queue.getState().status, "completed");
  assert.equal(queue.getState().completed, 2);
  assert.equal(snapshots.at(-1), null);
});

test("stop only clears queued nodes while the current paid task is allowed to finish", async () => {
  const calls = [];
  let finishCurrent;
  const current = new Promise((resolve) => { finishCurrent = resolve; });
  const queue = createCanvasWorkflowRunQueue({
    execute: async (request) => {
      calls.push(request.elementId);
      await current;
    },
  });

  const drain = queue.start([{ elementId: "image" }, { elementId: "video" }]);
  queue.stop();
  assert.equal(queue.getState().status, "stopping");
  assert.deepEqual(queue.getState().pendingNodeIds, []);
  assert.deepEqual(calls, ["image"]);
  finishCurrent();
  await drain;
  assert.equal(queue.getState().status, "stopped");
  assert.equal(queue.getState().completed, 1);
  assert.deepEqual(calls, ["image"]);
});

test("stop aborts the local wait and does not record cancellation as a workflow failure", async () => {
  let receivedSignal;
  const queue = createCanvasWorkflowRunQueue({
    execute: (_request, execution) => new Promise((_resolve, reject) => {
      receivedSignal = execution.signal;
      execution.signal.addEventListener("abort", () => reject(Object.assign(new Error("canceled"), { code: "canvas_generation_canceled" })), { once: true });
    }),
  });
  const drain = queue.start([{ elementId: "video" }, { elementId: "next" }]);
  queue.stop();
  await drain;
  assert.equal(receivedSignal.aborted, true);
  assert.equal(queue.getState().status, "stopped");
  assert.deepEqual(queue.getState().failures, []);
  assert.deepEqual(queue.getState().pendingNodeIds, []);
});

test("workflow queue restores an interrupted current request before pending requests", async () => {
  const calls = [];
  let finishRecovered;
  const recovered = new Promise((resolve) => { finishRecovered = resolve; });
  const queue = createCanvasWorkflowRunQueue({
    initialSnapshot: {
      version: 1,
      state: { status: "running", total: 3, completed: 1, failures: [] },
      currentRequest: { elementId: "image", type: "image-generator" },
      pendingRequests: [{ elementId: "video", type: "video-generator" }],
    },
    execute: async (request) => {
      calls.push(request.elementId);
      if (request.elementId === "image") await recovered;
    },
  });

  assert.deepEqual(queue.getState().pendingNodeIds, ["image", "video"]);
  await tick();
  assert.deepEqual(calls, ["image"]);
  finishRecovered();
  await tick();
  await tick();
  assert.deepEqual(calls, ["image", "video"]);
  assert.equal(queue.getState().status, "completed");
  assert.equal(queue.getState().completed, 3);
});

test("workflow queue preserves paused and failed snapshots until the user resumes", async () => {
  const pausedCalls = [];
  const paused = createCanvasWorkflowRunQueue({
    initialSnapshot: {
      state: { status: "paused", total: 2, completed: 1, failures: [] },
      pendingRequests: [{ elementId: "video", type: "video-generator" }],
    },
    execute: async (request) => pausedCalls.push(request.elementId),
  });
  await tick();
  assert.equal(paused.getState().status, "paused");
  assert.deepEqual(pausedCalls, []);
  paused.resume();
  await tick();
  assert.deepEqual(pausedCalls, ["video"]);

  const failedCalls = [];
  const failed = createCanvasWorkflowRunQueue({
    initialSnapshot: {
      state: { status: "failed", total: 2, completed: 0, failures: [{ id: "image", message: "image failed" }] },
      pendingRequests: [{ elementId: "video", type: "video-generator" }],
    },
    execute: async (request) => failedCalls.push(request.elementId),
  });
  await tick();
  assert.equal(failed.getState().status, "failed");
  assert.deepEqual(failed.getState().failures, [{ id: "image", message: "image failed" }]);
  assert.deepEqual(failedCalls, []);
  failed.resume();
  await tick();
  assert.deepEqual(failedCalls, ["video"]);
  assert.equal(failed.getState().status, "completed_with_errors");
});

test("workflow queue persists progress and explicit stop clears its snapshot", async () => {
  const snapshots = [];
  let finishCurrent;
  const current = new Promise((resolve) => { finishCurrent = resolve; });
  const queue = createCanvasWorkflowRunQueue({
    execute: async () => current,
    onSnapshotChange: (snapshot) => snapshots.push(snapshot ? structuredClone(snapshot) : null),
  });

  const drain = queue.start([{ elementId: "image" }, { elementId: "video" }]);
  assert.equal(snapshots.at(-1).currentRequest.elementId, "image");
  assert.deepEqual(snapshots.at(-1).pendingRequests.map((request) => request.elementId), ["video"]);
  queue.stop();
  assert.equal(snapshots.at(-1), null);
  finishCurrent();
  await drain;
  assert.equal(snapshots.at(-1), null);
});

test("workflow execution is wired to explicit controls while single-node primary Enter remains available", () => {
  assert.match(editorSource, /const runCanvasWorkflow = useCallback/);
  assert.match(editorSource, /plan = buildCanvasWorkflowGenerationPlan\(elements\)/);
  assert.match(editorSource, /工作流连接无效，请检查后重试/);
  assert.match(editorSource, /buildCanvasWorkflowGenerationPlan\(elements\)/);
  assert.match(editorSource, /estimateCanvasGenerationBatchCredits\(plan\.map/);
  assert.match(editorSource, /积分不足，请先充值/);
  assert.match(editorSource, /最终积分以后端校验为准/);
  assert.match(editorSource, /creditBalance < creditEstimate\.estimatedCredits/);
  assert.match(editorSource, /onRunWorkflow=\{runCanvasWorkflow\}/);
  assert.match(editorSource, /matchesCanvasShortcut\(event, "generate"\)/);
  assert.match(editorSource, /executeCanvasNodeGeneration\(\{ api, request, onGenerate, generationConfig: generationConfigRef\.current \}\)/);
  assert.match(editorSource, /if \(!currentRequest\) return Promise\.reject\(new Error\("生成节点已删除或不可运行，工作流已暂停。"\)\)/);
  assert.doesNotMatch(editorSource, /buildCanvasNodeGenerationRequest\(element\) \?\? request/);
  assert.match(bottomBarSource, /运行工作流/);
  assert.match(bottomBarSource, /当前任务完成后暂停/);
  assert.match(bottomBarSource, /停止排队并尝试取消当前任务/);
  assert.match(editorSource, /signal: execution\?\.signal/);
  assert.match(mainSource, /signal: execution\.signal/);
  assert.match(bottomBarSource, /失败节点/);
  assert.match(bottomBarSource, /重试失败节点/);
  assert.match(editorSource, /retryCanvasWorkflowFailures/);
  assert.match(editorSource, /controller\.retryFailures\(requests\)/);
  assert.match(editorSource, /WORKFLOW_RUN_STORAGE_PREFIX/);
  assert.match(editorSource, /initialSnapshot: readWorkflowRunSnapshot\(canvasId\)/);
  assert.match(editorSource, /onSnapshotChange: \(snapshot\) => persistWorkflowRunSnapshot\(canvasId, snapshot\)/);
  assert.match(editorSource, /request\.__restoredWorkflowCurrent/);
  assert.match(editorSource, /element\?\.customData\?\.taskId/);
  assert.match(editorSource, /waitForExistingCanvasGeneration\(api, request\.elementId\)/);
  assert.match(editorSource, /controller\.dispose\(\)/);
});

test("page reload resumes persisted running tasks without submitting a new generation", () => {
  assert.match(mainSource, /collectCanvasGenerationResumeCandidates\(api\.getSceneElements/);
  assert.match(mainSource, /resumedGenerationKeysRef\.current\.has\(resumeKey\)/);
  assert.match(mainSource, /onGenerate: \(\) => resumeCanvasGeneration\(\{/);
  assert.match(mainSource, /taskId,/);
  assert.doesNotMatch(mainSource, /resumeCanvasGeneration\([\s\S]*createStandaloneCanvasGenerationTask/);
});

test("successful shared login reload resets resume keys before polling the persisted task", () => {
  assert.match(sharedLoginSource, /openLoginModal\(\)/);
  assert.match(sharedAppSource, /const completeLoginSuccess = \(\) => \{[\s\S]*window\.location\.reload\(\)/);
  assert.match(mainSource, /const resumedGenerationKeysRef = useRef\(new Set\(\)\)/);
  assert.match(mainSource, /resumedGenerationKeysRef\.current\.add\(resumeKey\)[\s\S]*resumeCanvasGeneration\(\{/);
  assert.match(mainSource, /if \(authenticationRequired\) void openSharedLoginModal\(\)/);
  assert.doesNotMatch(mainSource, /if \(authenticationRequired\)[\s\S]{0,180}createStandaloneCanvasGenerationTask/);
});
