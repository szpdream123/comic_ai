import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCanvasGenerationPayload,
  cancelCanvasGeneration,
  collectUpstreamCanvasInput,
  extractGenerationArtifact,
  extractGenerationArtifacts,
  resumeCanvasGeneration,
  resolveGenerationTaskId,
  runCanvasGeneration,
} from "../new-canvas/src/loomic-core/canvas-generation.js";
import {
  applyCanvasGenerationMissingRecovery,
  applyCanvasGenerationServerTerminal,
  buildCanvasNodeGenerationRequest,
  canvasGenerationResultFromRun,
  collectCanvasGenerationResumeCandidates,
  collectCanvasGenerationServerRecoveryCandidates,
  executeCanvasNodeGeneration,
  canvasGenerationInputSignature,
  canvasGenerationInputsMatch,
  findCanvasGenerationServerRecovery,
  markCanvasNodeGenerationInputStale,
  isUnauthenticatedError,
  markCanvasNodeGenerationSubmitted,
} from "../new-canvas/src/loomic-core/canvas-generation-execution.js";
import { createImageToImageGenerator, updateImageGeneratorElement } from "../new-canvas/src/loomic-core/image-generator-elements.js";
import { updateVideoGeneratorElement } from "../new-canvas/src/loomic-core/video-generator-elements.js";
import {
  createExcalidrawImageElement,
  createExcalidrawVideoElement,
} from "../new-canvas/src/loomic-core/canvas-elements.js";
import {
  buildCanvasModelSelectionPatch,
  buildCanvasParameterPatch,
  markCanvasGeneratorInputUpdated,
  resolveCanvasGenerationModel,
  resolveCanvasGenerationModels,
  resolveCanvasModelParameterControls,
} from "../new-canvas/src/loomic-core/canvas-generation-models.js";
import {
  canvasGenerationCreditMessage,
  estimateCanvasGenerationCredits,
  normalizeCanvasCreditBalance,
  resolveCanvasGenerationCreditState,
} from "../new-canvas/src/loomic-core/canvas-generation-credits.js";
import {
  canvasDirectorRecoveryInputFromPayload,
  collectCanvasDirectorRecoveryCandidates,
  findLatestCanvasDirectorResult,
} from "../new-canvas/src/loomic-core/canvas-director-execution.js";
import { readFile } from "node:fs/promises";

const canvasEntry = await readFile(new URL("../new-canvas/src/main.jsx", import.meta.url), "utf8");
const sharedApp = await readFile(new URL("../app.js", import.meta.url), "utf8");
const generationConfigContext = await readFile(new URL("../new-canvas/src/loomic-core/CanvasGenerationConfigContext.jsx", import.meta.url), "utf8");
const canvasEditorSource = await readFile(new URL("../new-canvas/src/loomic-core/CanvasEditor.jsx", import.meta.url), "utf8");
const storyboardPanelSource = await readFile(new URL("../new-canvas/src/loomic-shell/CanvasStoryboardPanel.jsx", import.meta.url), "utf8");
const generatorPanels = await readFile(new URL("../new-canvas/src/loomic-core/GeneratorPanels.jsx", import.meta.url), "utf8");
const workflowNodePanel = await readFile(new URL("../new-canvas/src/loomic-core/WorkflowNodePanel.jsx", import.meta.url), "utf8");

test("new canvas generation credit estimate mirrors backend fixed, resolution, and duration billing", () => {
  assert.equal(estimateCanvasGenerationCredits({
    mediaType: "image",
    pricing: { baseCredits: 18, billingMode: "duration" },
    defaultParams: { durationSec: 9 },
  }, {}), 18);
  assert.equal(estimateCanvasGenerationCredits({
    mediaType: "video",
    pricing: {
      baseCredits: 12,
      billingMode: "duration",
      resolutionCredits: { "1080p": 3, "4k": 7 },
    },
    defaultParams: { durationSec: 5, resolution: "4k" },
  }, { resolution: "1080p", durationSec: 8 }), 24);
  assert.equal(estimateCanvasGenerationCredits({
    mediaType: "image",
    pricing: { baseCredits: 9, resolutionCredits: { "4k": 14 } },
  }, { quality: "4k", ratio: "16:9" }), 14);
  assert.equal(estimateCanvasGenerationCredits({
    mediaType: "video",
    pricing: { baseCredits: 5, billingMode: "duration", resolutionCredits: { "4k": 11 } },
    defaultParams: { durationSec: 2 },
  }, { resolution: "unknown" }), 10);
  assert.equal(estimateCanvasGenerationCredits({
    mediaType: "video",
    pricing: { baseCredits: 0.1, billingMode: "duration" },
  }, { durationSec: 2 }), 1);
  assert.equal(estimateCanvasGenerationCredits({ mediaType: "image", pricing: {} }, {}), null);
});

test("new canvas generation credit preflight only blocks a known insufficient balance", () => {
  assert.equal(normalizeCanvasCreditBalance({ availableCredits: 17, creditBalance: 99 }), 17);
  assert.equal(normalizeCanvasCreditBalance({ creditBalance: "21" }), 21);
  assert.equal(normalizeCanvasCreditBalance({}), null);
  const insufficient = resolveCanvasGenerationCreditState(
    { mediaType: "image", pricing: { baseCredits: 18 } },
    {},
    17,
  );
  assert.deepEqual(insufficient, { estimatedCredits: 18, availableCredits: 17, insufficient: true });
  assert.match(canvasGenerationCreditMessage(insufficient, "ready"), /积分不足，请先充值/);
  assert.equal(resolveCanvasGenerationCreditState({ mediaType: "image", pricing: {} }, {}, 0).insufficient, false);
  assert.equal(resolveCanvasGenerationCreditState({ mediaType: "image", pricing: { baseCredits: 18 } }, {}, null).insufficient, false);
});

async function assertSharedCreditPreflightBlocksEntry(source, wiringPattern) {
  let calls = 0;
  let scene = [{ id: "credit-node", type: "rectangle", customData: { type: "image-generator", prompt: "雨夜", model: "costly-image", status: "idle" } }];
  const toasts = [];
  const api = {
    getSceneElements: () => scene,
    getFiles: () => ({}),
    updateScene(update) { if (update.elements) scene = update.elements; },
    setToast(toast) { toasts.push(toast); },
  };
  const generationConfig = {
    config: {
      defaultImageModelCode: "costly-image",
      models: [{ modelCode: "costly-image", mediaType: "image", enabled: true, pricing: { baseCredits: 18 } }],
    },
    creditBalance: 5,
    creditStatus: "ready",
  };
  await assert.rejects(executeCanvasNodeGeneration({
    api,
    request: buildCanvasNodeGenerationRequest(scene[0]),
    generationConfig,
    async onGenerate() { calls += 1; return { taskId: "must-not-submit", artifact: null }; },
  }), (error) => error.code === "canvas_generation_credit_insufficient" && /积分不足，请先充值/.test(error.message));
  assert.match(source, wiringPattern);
  assert.equal(calls, 0);
  assert.equal(scene[0].customData.status, "idle");
  assert.match(toasts[0].message, /预计 18 积分，当前余额 5，积分不足，请先充值/);
}

test("keyboard generation shortcut cannot bypass a known insufficient credit balance", async () => {
  await assertSharedCreditPreflightBlocksEntry(
    canvasEditorSource,
    /executeCanvasNodeGeneration\(\{ api, request, onGenerate, generationConfig: generationConfigRef\.current \}\)/,
  );
});

test("storyboard generation cannot bypass a known insufficient credit balance", async () => {
  await assertSharedCreditPreflightBlocksEntry(
    storyboardPanelSource,
    /executeCanvasNodeGeneration\(\{ api, request, onGenerate, onStateChange: setGenerationState, generationConfig \}\)/,
  );
});

test("shared generation submission allows unknown cost or balance to reach backend validation", async () => {
  let calls = 0;
  let scene = [{ id: "unknown-credit", type: "rectangle", customData: { type: "image-generator", prompt: "雨夜", model: "unknown-cost", status: "idle" } }];
  const api = {
    getSceneElements: () => scene,
    getFiles: () => ({}),
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  await executeCanvasNodeGeneration({
    api,
    request: buildCanvasNodeGenerationRequest(scene[0]),
    generationConfig: {
      config: { models: [{ modelCode: "unknown-cost", mediaType: "image", pricing: {} }] },
      creditBalance: 0,
      creditStatus: "ready",
    },
    async onGenerate() { calls += 1; return { taskId: "backend-validates", artifact: null }; },
  });
  assert.equal(calls, 1);
  assert.equal(scene[0].customData.status, "completed");
});

test("new canvas personal generation panels load balance and enforce the credit preflight", () => {
  assert.match(generationConfigContext, /api\.getCreditBalance\(\)/);
  assert.match(generationConfigContext, /creditStatus: "ready"/);
  assert.match(generatorPanels, /GenerationCreditNotice/);
  assert.match(generatorPanels, /generationDisabled = generating \|\| credit\.insufficient/);
  const audioBranch = workflowNodePanel.indexOf(") : audioGenerator ? (");
  const audioCreditNotice = workflowNodePanel.indexOf("loomic-generation-credit", audioBranch);
  assert.ok(audioBranch > 0 && audioCreditNotice > audioBranch);
  assert.equal(workflowNodePanel.slice(0, audioBranch).includes("loomic-generation-credit"), false);
  assert.match(workflowNodePanel, /audioCredit\.insufficient/);
  assert.match(workflowNodePanel, /canvasGenerationCreditMessage\(audioCredit/);
});

test("stale and failed generation notices expose real update, retry, and dismiss actions", () => {
  assert.match(generatorPanels, /loomic-input-updated-trigger/);
  assert.match(generatorPanels, /primaryLabel=\{<>更新生成/);
  assert.match(generatorPanels, /primaryLabel="重新生成"/);
  assert.match(generatorPanels, /onClose=\{\(\) => \{\s*setStaleActionsOpen\(false\);\s*\}\}/);
  assert.doesNotMatch(generatorPanels, /onClose=\{\(\) => update\(\{[^}]*inputUpdated: false/);
  assert.match(generatorPanels, /generationNoticeDismissed: "failed"/);
  assert.match(workflowNodePanel, /输入已更新，更新生成后下游节点将使用新的导演指令/);
  assert.match(workflowNodePanel, /输入已更新，更新生成后将使用当前文本、音色和音频参数/);
  assert.match(workflowNodePanel, /onClose=\{\(\) => setStaleNoticeOpen\(false\)\}/);
  assert.doesNotMatch(workflowNodePanel, /onClose=\{\(\) => update\(\{ inputUpdated: false \}\)\}/);
});

test("new canvas generation collects bound upstream text and image inputs", () => {
  const elements = [
    { id: "text-1", type: "text", text: "雨夜街头", isDeleted: false },
    { id: "image-1", type: "image", fileId: "file-1", customData: { title: "角色参考", storageObjectId: "image-object" }, isDeleted: false },
    { id: "target", type: "rectangle", customData: { type: "image-generator" }, isDeleted: false },
    { id: "edge-1", type: "arrow", startBinding: { elementId: "text-1" }, endBinding: { elementId: "target" }, customData: { workflowEdge: true }, isDeleted: false },
    { id: "edge-2", type: "arrow", startBinding: { elementId: "image-1" }, endBinding: { elementId: "target" }, customData: { workflowEdge: true }, isDeleted: false },
  ];
  const input = collectUpstreamCanvasInput(elements, { "file-1": { dataURL: "data:image/png;base64,abc" } }, "target");
  assert.deepEqual(input.upstreamNodeIds, ["text-1", "image-1"]);
  assert.deepEqual(input.upstreamTextFragments, ["雨夜街头", "角色参考"]);
  assert.equal(input.referenceImages[0].url, "data:image/png;base64,abc");
  assert.equal(input.referenceImages[0].storageObjectId, "image-object");
});

test("new canvas generation stops when the preflight save detects a revision conflict", () => {
  assert.match(canvasEntry, /const generationSnapshot = snapshotCanvasContent\(canvasApi\)/);
  assert.match(canvasEntry, /const saveResult = await canvasStorage\.save\(canvasContext\.canvasId, generationSnapshot\)/);
  assert.match(canvasEntry, /saveResult\?\.status === "conflict"/);
  assert.match(canvasEntry, /请先处理保存冲突后再生成/);
  assert.match(canvasEntry, /throw new Error\("云端版本已更新/);
  assert.match(canvasEntry, /elements: generationSnapshot\.elements/);
  assert.match(canvasEntry, /files: generationSnapshot\.files/);
  assert.doesNotMatch(canvasEntry, /runCanvasGeneration\(\{[\s\S]{0,600}elements: canvasApi\.getSceneElements/);
});

test("submitted canvas tasks publish their id before polling and can be persisted on the node", async () => {
  let scene = [{ id: "image-node", type: "rectangle", version: 1, customData: { type: "image-generator", prompt: "雨夜", status: "idle" } }];
  let submittedPersisted = false;
  const canvasApi = {
    getSceneElements: () => scene,
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  const result = await runCanvasGeneration({
    api: {
      async createStandaloneCanvasGenerationTask() { return { id: "task-persisted", status: "queued" }; },
      async getGenerationTask(taskId) {
        assert.equal(taskId, "task-persisted");
        assert.equal(submittedPersisted, true);
        return { id: taskId, status: "completed", result: { artifacts: [{ url: "https://cdn.example/result.png", kind: "image" }] } };
      },
    },
    kind: "image",
    nodeId: "image-node",
    data: { prompt: "雨夜" },
    elements: scene,
    files: {},
    pollIntervalMs: 0,
    onProgress: async ({ taskId }) => {
      if (submittedPersisted) return;
      submittedPersisted = markCanvasNodeGenerationSubmitted(canvasApi, {
        type: "image-generator",
        elementId: "image-node",
        prompt: "雨夜",
      }, taskId);
    },
  });
  assert.equal(result.taskId, "task-persisted");
  assert.equal(scene[0].customData.taskId, "task-persisted");
  assert.equal(scene[0].customData.status, "running");
  assert.match(canvasEntry, /await persistSubmittedGeneration\(canvasApi, \{ \.\.\.request, elementId: nodeKey \}, taskId\)/);
  assert.match(canvasEntry, /canvasStorage\.save\(canvasContext\.canvasId, generationSnapshot\)/);
});

test("new canvas retries an indeterminate media submission with the same persisted idempotency key", async () => {
  let scene = [{
    id: "image-idempotent",
    type: "rectangle",
    version: 1,
    customData: { type: "image-generator", prompt: "雨夜", status: "idle" },
  }];
  const api = {
    getSceneElements: () => scene,
    getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  let firstKey = "";
  await assert.rejects(executeCanvasNodeGeneration({
    api,
    request: buildCanvasNodeGenerationRequest(scene[0]),
    async onGenerate(request) {
      firstKey = request.generationIdempotencyKey;
      throw new Error("request_timeout");
    },
  }), /request_timeout/);
  assert.match(firstKey, /^canvas-image:/);
  assert.equal(scene[0].customData.status, "failed");
  assert.equal(scene[0].customData.generationReplayPending, true);
  assert.equal(scene[0].customData.generationIdempotencyKey, firstKey);

  let replayKey = "";
  await executeCanvasNodeGeneration({
    api,
    request: buildCanvasNodeGenerationRequest(scene[0]),
    async onGenerate(request) {
      replayKey = request.generationIdempotencyKey;
      return { taskId: "task-replayed", artifact: null };
    },
  });
  assert.equal(replayKey, firstKey);
  assert.equal(scene[0].customData.generationReplayPending, false);
  assert.equal(scene[0].customData.taskId, "task-replayed");
});

test("generation input signatures ignore runtime state and use stable storage object ids", () => {
  const request = {
    type: "image-generator",
    prompt: "雨夜",
    model: "image-model",
    inputImages: [{ url: "https://signed.example/old", storageObjectId: "object-1" }],
    status: "idle",
  };
  const current = {
    customData: {
      type: "image-generator",
      prompt: "雨夜",
      model: "image-model",
      inputImages: [{ url: "https://signed.example/new", storageObjectId: "object-1", name: "新签名" }],
      status: "running",
      taskId: "task-1",
      inputUpdated: false,
    },
  };
  assert.equal(canvasGenerationInputsMatch(current, request), true);
  assert.equal(canvasGenerationInputSignature(current), canvasGenerationInputSignature(request));
  assert.equal(canvasGenerationInputsMatch({ ...current, customData: { ...current.customData, prompt: "雪夜" } }, request), false);
});

test("submitted task ids are not attached to a node whose inputs changed", () => {
  let scene = [{ id: "image-stale", type: "rectangle", customData: { type: "image-generator", prompt: "新提示", status: "running", inputUpdated: true } }];
  const api = {
    getSceneElements: () => scene,
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  const request = { elementId: "image-stale", type: "image-generator", prompt: "旧提示" };
  assert.equal(markCanvasNodeGenerationInputStale(api, request), true);
  assert.equal(scene[0].customData.taskId, null);
  assert.equal(scene[0].customData.inputUpdated, true);
  assert.equal(scene[0].customData.status, "idle");
});

test("late generation results do not overwrite a node edited while the task was running", async () => {
  let scene = [{ id: "image-late", type: "rectangle", customData: { type: "image-generator", prompt: "旧提示", status: "idle" } }];
  const api = {
    getSceneElements: () => scene,
    getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  await assert.rejects(executeCanvasNodeGeneration({
    api,
    request: buildCanvasNodeGenerationRequest(scene[0]),
    async onGenerate() {
      scene = scene.map((element) => ({ ...element, customData: { ...element.customData, prompt: "新提示" } }));
      return { taskId: "task-old", artifact: { url: "https://cdn.example/old.png", mimeType: "image/png" } };
    },
  }), (error) => error.code === "canvas_generation_stale_input");
  assert.equal(scene[0].customData.prompt, "新提示");
  assert.equal(scene[0].customData.taskId, null);
  assert.equal(scene[0].customData.staleGenerationTaskId, "task-old");
  assert.equal(scene[0].customData.inputUpdated, true);
  assert.equal(scene.some((element) => element.type === "image" && element.customData?.resultUrl === "https://cdn.example/old.png"), false);
});

test("upstream input changes reject task id attachment and late result insertion", async () => {
  let scene = [
    { id: "script-upstream", type: "text", text: "旧分镜" },
    { id: "image-downstream", type: "rectangle", customData: { type: "image-generator", prompt: "雨夜", status: "idle" } },
    {
      id: "script-edge",
      type: "arrow",
      startBinding: { elementId: "script-upstream" },
      endBinding: { elementId: "image-downstream" },
      customData: { workflowEdge: true },
    },
  ];
  const api = {
    getSceneElements: () => scene,
    getFiles: () => ({}),
    getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  await assert.rejects(executeCanvasNodeGeneration({
    api,
    request: buildCanvasNodeGenerationRequest(scene[1]),
    async onGenerate(executionRequest) {
      scene = scene.map((element) => element.id === "script-upstream" ? { ...element, text: "新分镜" } : element);
      assert.equal(markCanvasNodeGenerationSubmitted(api, executionRequest, "task-upstream-old"), false);
      return { taskId: "task-upstream-old", artifact: { url: "https://cdn.example/upstream-old.png", mimeType: "image/png" } };
    },
  }), (error) => error.code === "canvas_generation_stale_input");
  const target = scene.find((element) => element.id === "image-downstream");
  assert.equal(target.customData.taskId, null);
  assert.equal(target.customData.staleGenerationTaskId, "task-upstream-old");
  assert.equal(target.customData.inputUpdated, true);
  assert.equal(scene.some((element) => element.type === "image" && element.customData?.resultUrl === "https://cdn.example/upstream-old.png"), false);
});

test("workflow connection changes invalidate an in-flight dependency snapshot", async () => {
  let scene = [
    { id: "script-a", type: "text", text: "镜头 A" },
    { id: "script-b", type: "text", text: "镜头 B" },
    { id: "image-target", type: "rectangle", customData: { type: "image-generator", prompt: "雨夜", status: "idle" } },
    {
      id: "changing-edge",
      type: "arrow",
      startBinding: { elementId: "script-a" },
      endBinding: { elementId: "image-target" },
      customData: { workflowEdge: true },
    },
  ];
  const api = {
    getSceneElements: () => scene,
    getFiles: () => ({}),
    getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  await assert.rejects(executeCanvasNodeGeneration({
    api,
    request: buildCanvasNodeGenerationRequest(scene[2]),
    async onGenerate() {
      scene = scene.map((element) => element.id === "changing-edge"
        ? { ...element, startBinding: { elementId: "script-b" } }
        : element);
      return { taskId: "task-edge-old", artifact: { url: "https://cdn.example/edge-old.png", mimeType: "image/png" } };
    },
  }), (error) => error.code === "canvas_generation_stale_input");
  assert.equal(scene.find((element) => element.id === "image-target").customData.inputUpdated, true);
  assert.equal(scene.some((element) => element.type === "image" && element.customData?.resultUrl === "https://cdn.example/edge-old.png"), false);
});

test("new canvas forwards persisted idempotency keys to every media task API", async () => {
  const calls = [];
  const api = {
    async createImageGenerationTask(_payload, options) {
      calls.push(["image", options]);
      return { id: "task-image-keyed", status: "completed", result: { artifacts: [] } };
    },
    async runCanvasNode(_canvasProjectId, _nodeId, payload, options) {
      calls.push([payload.kind, options]);
      return { id: `task-${payload.kind}-keyed`, status: "completed", result: { artifacts: [] } };
    },
    async createStandaloneCanvasGenerationTask(_payload, options) {
      calls.push(["standalone", options]);
      return { id: "task-standalone-keyed", status: "completed", result: { artifacts: [] } };
    },
  };
  for (const kind of ["image", "video", "audio"]) {
    const result = await runCanvasGeneration({
      api,
      kind,
      nodeId: `${kind}-keyed`,
      data: { prompt: "雨夜", generationIdempotencyKey: `canvas-${kind}:stable` },
      elements: [],
      files: {},
      canvasProjectId: "canvas-project",
    });
    assert.equal(result.taskId, `task-${kind}-keyed`);
  }
  const standalone = await runCanvasGeneration({
    api,
    kind: "image",
    nodeId: "standalone-keyed",
    data: { prompt: "雨夜", generationIdempotencyKey: "canvas-image:standalone" },
    elements: [],
    files: {},
  });
  assert.equal(standalone.taskId, "task-standalone-keyed");
  assert.deepEqual(calls.map(([route, options]) => [route, options.idempotencyKey]), [
    ["image", "canvas-image:stable"],
    ["video", "canvas-video:stable"],
    ["audio", "canvas-audio:stable"],
    ["standalone", "canvas-image:standalone"],
  ]);
});

test("refresh makes an unconfirmed idempotent submission retryable when no server run exists", () => {
  let scene = [{
    id: "image-missing-run",
    type: "rectangle",
    version: 1,
    customData: {
      type: "image-generator",
      prompt: "雨夜",
      status: "running",
      generationIdempotencyKey: "canvas-image:missing-run",
      generationReplayPending: true,
    },
  }];
  const api = {
    getSceneElements: () => scene,
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  assert.equal(applyCanvasGenerationMissingRecovery(api, scene[0]), true);
  assert.equal(scene[0].customData.status, "failed");
  assert.equal(scene[0].customData.generationReplayPending, true);
  assert.match(scene[0].customData.error, /恢复同一次请求/);
  assert.match(canvasEntry, /if \(!recovery\) \{\s*applyCanvasGenerationMissingRecovery\(api, element\)/);
});

test("stopping generation distinguishes confirmed cancellation from a detached remote task", async () => {
  assert.deepEqual(await cancelCanvasGeneration({
    api: { async cancelGenerationTask(taskId) { return { status: "canceled", taskId }; } },
    taskId: "task-canceled",
  }), {
    canceled: true,
    taskId: "task-canceled",
    reason: "",
    result: { status: "canceled", taskId: "task-canceled" },
  });

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    runCanvasGeneration({
      api: {
        async createStandaloneCanvasGenerationTask() { return { taskId: "task-detached", status: "queued" }; },
        async cancelGenerationTask() {
          const error = new Error("not cancelable");
          error.errorCode = "generation_task_not_cancelable";
          error.details = { reason: "provider_cancel_not_supported" };
          throw error;
        },
      },
      kind: "image",
      nodeId: "image-node",
      data: { prompt: "雨夜" },
      elements: [],
      files: {},
      signal: controller.signal,
      pollIntervalMs: 0,
    }),
    (error) => error.code === "canvas_generation_detached" && error.taskId === "task-detached" && error.continuesRemotely === true,
  );
});

test("audio generation abort requests provider cancellation and retains detached task ids", async () => {
  for (const canceled of [true, false]) {
    const controller = new AbortController();
    const canceledTaskIds = [];
    await assert.rejects(runCanvasGeneration({
      api: {
        async createStandaloneCanvasGenerationTask() {
          controller.abort();
          return { taskId: canceled ? "audio-canceled" : "audio-detached", status: "queued" };
        },
        async cancelGenerationTask(taskId) {
          canceledTaskIds.push(taskId);
          if (canceled) return { status: "canceled", taskId };
          const error = new Error("provider cannot cancel");
          error.details = { reason: "provider_cancel_not_supported" };
          throw error;
        },
      },
      kind: "audio",
      nodeId: "audio-node",
      data: { prompt: "雨夜旁白", model: "audio-real" },
      elements: [],
      files: {},
      signal: controller.signal,
      pollIntervalMs: 0,
    }), (error) => canceled
      ? error.code === "canvas_generation_canceled" && error.taskId === "audio-canceled"
      : error.code === "canvas_generation_detached" && error.taskId === "audio-detached" && error.continuesRemotely === true);
    assert.deepEqual(canceledTaskIds, [canceled ? "audio-canceled" : "audio-detached"]);
  }
});

test("confirmed workflow cancellation leaves the node canceled instead of failed", async () => {
  let scene = [{ id: "video-node", type: "rectangle", version: 1, customData: { type: "video-generator", prompt: "雨夜", status: "idle" } }];
  const api = {
    getSceneElements: () => scene,
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  const error = Object.assign(new Error("生成任务已取消，未消耗的预留积分已释放。"), { code: "canvas_generation_canceled" });
  await assert.rejects(executeCanvasNodeGeneration({
    api,
    request: { type: "video-generator", elementId: "video-node" },
    async onGenerate() { throw error; },
  }), error);
  assert.equal(scene[0].customData.status, "canceled");
  assert.equal(scene[0].customData.cancellationConfirmed, true);
});

test("running canvas tasks resume by polling their existing id without another submission", async () => {
  const calls = [];
  const result = await resumeCanvasGeneration({
    api: {
      async getGenerationTask(taskId) {
        calls.push(["get", taskId]);
        return calls.length === 1
          ? { id: taskId, status: "running" }
          : { id: taskId, status: "completed", result: { artifacts: [{ url: "https://cdn.example/resumed.mp4", kind: "video", mimeType: "video/mp4" }] } };
      },
      async createStandaloneCanvasGenerationTask() { calls.push(["submit"]); },
    },
    kind: "video",
    taskId: "task-existing",
    pollIntervalMs: 0,
  });
  assert.deepEqual(calls, [["get", "task-existing"], ["get", "task-existing"]]);
  assert.equal(result.taskId, "task-existing");
  assert.equal(result.artifact.url, "https://cdn.example/resumed.mp4");
});

test("refresh resume rejects a persisted task after its upstream text changed", async () => {
  let scene = [
    { id: "resume-script", type: "text", text: "旧分镜" },
    { id: "resume-image", type: "rectangle", customData: { type: "image-generator", prompt: "雨夜", status: "idle" } },
    { id: "resume-edge", type: "arrow", startBinding: { elementId: "resume-script" }, endBinding: { elementId: "resume-image" }, customData: { workflowEdge: true } },
  ];
  const api = {
    getSceneElements: () => scene,
    getFiles: () => ({}),
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  const submittedRequest = {
    ...buildCanvasNodeGenerationRequest(scene[1]),
  };
  assert.equal(markCanvasNodeGenerationSubmitted(api, submittedRequest, "task-upstream-refresh"), true);
  assert.equal(scene[1].customData.generationInputSignature, canvasGenerationInputSignature({
    ...submittedRequest,
    __generationUpstreamInput: collectUpstreamCanvasInput(scene, {}, "resume-image"),
  }));
  scene = scene.map((element) => element.id === "resume-script" ? { ...element, text: "新分镜" } : element);
  let polled = false;
  await assert.rejects(executeCanvasNodeGeneration({
    api,
    request: buildCanvasNodeGenerationRequest(scene.find((element) => element.id === "resume-image")),
    async onGenerate() { polled = true; return { taskId: "task-upstream-refresh", artifact: null }; },
  }), (error) => error.code === "canvas_generation_stale_input" && error.taskId === "task-upstream-refresh");
  const target = scene.find((element) => element.id === "resume-image");
  assert.equal(polled, false);
  assert.equal(target.customData.taskId, null);
  assert.equal(target.customData.staleGenerationTaskId, "task-upstream-refresh");
  assert.equal(target.customData.inputUpdated, true);
  assert.equal(target.customData.status, "idle");
});

test("refresh resume rejects a persisted task after node generation parameters changed", async () => {
  let scene = [{
    id: "resume-parameters",
    type: "rectangle",
    customData: { type: "image-generator", prompt: "雨夜", parameters: { quality: "1K" }, status: "idle" },
  }];
  const api = {
    getSceneElements: () => scene,
    getFiles: () => ({}),
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  const submittedRequest = {
    ...buildCanvasNodeGenerationRequest(scene[0]),
    __generationUpstreamInput: collectUpstreamCanvasInput(scene, {}, "resume-parameters"),
  };
  assert.equal(markCanvasNodeGenerationSubmitted(api, submittedRequest, "task-parameters-refresh"), true);
  scene = [{ ...scene[0], customData: { ...scene[0].customData, parameters: { quality: "2K" } } }];
  let polled = false;
  await assert.rejects(executeCanvasNodeGeneration({
    api,
    request: buildCanvasNodeGenerationRequest(scene[0]),
    async onGenerate() { polled = true; return { taskId: "task-parameters-refresh", artifact: null }; },
  }), (error) => error.code === "canvas_generation_stale_input");
  assert.equal(polled, false);
  assert.equal(scene[0].customData.taskId, null);
  assert.equal(scene[0].customData.staleGenerationTaskId, "task-parameters-refresh");
  assert.equal(scene[0].customData.inputUpdated, true);
});

test("refresh resume rejects a persisted task after its workflow connection changed", async () => {
  let scene = [
    { id: "resume-script-a", type: "text", text: "镜头 A" },
    { id: "resume-script-b", type: "text", text: "镜头 B" },
    { id: "resume-connection", type: "rectangle", customData: { type: "image-generator", prompt: "雨夜", status: "idle" } },
    { id: "resume-changing-edge", type: "arrow", startBinding: { elementId: "resume-script-a" }, endBinding: { elementId: "resume-connection" }, customData: { workflowEdge: true } },
  ];
  const api = {
    getSceneElements: () => scene,
    getFiles: () => ({}),
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  const submittedRequest = {
    ...buildCanvasNodeGenerationRequest(scene[2]),
    __generationUpstreamInput: collectUpstreamCanvasInput(scene, {}, "resume-connection"),
  };
  assert.equal(markCanvasNodeGenerationSubmitted(api, submittedRequest, "task-connection-refresh"), true);
  scene = scene.map((element) => element.id === "resume-changing-edge"
    ? { ...element, startBinding: { elementId: "resume-script-b" } }
    : element);
  let polled = false;
  await assert.rejects(executeCanvasNodeGeneration({
    api,
    request: buildCanvasNodeGenerationRequest(scene.find((element) => element.id === "resume-connection")),
    async onGenerate() { polled = true; return { taskId: "task-connection-refresh", artifact: null }; },
  }), (error) => error.code === "canvas_generation_stale_input");
  const target = scene.find((element) => element.id === "resume-connection");
  assert.equal(polled, false);
  assert.equal(target.customData.taskId, null);
  assert.equal(target.customData.staleGenerationTaskId, "task-connection-refresh");
  assert.equal(target.customData.inputUpdated, true);
});

test("resumed generation reuses the existing completion path for artifact insertion", async () => {
  let scene = [{
    id: "video-resume",
    type: "rectangle",
    x: 0,
    y: 0,
    width: 480,
    height: 270,
    version: 1,
    customData: { type: "video-generator", prompt: "推进", status: "running", taskId: "task-video-resume" },
  }];
  const canvasApi = {
    getSceneElements: () => scene,
    getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  await executeCanvasNodeGeneration({
    api: canvasApi,
    request: buildCanvasNodeGenerationRequest(scene[0]),
    onGenerate: () => resumeCanvasGeneration({
      api: { async getGenerationTask(taskId) { return { id: taskId, status: "completed", result: { artifacts: [{ url: "https://cdn.example/resumed.mp4", kind: "video", mimeType: "video/mp4" }] } }; } },
      kind: "video",
      taskId: "task-video-resume",
      pollIntervalMs: 0,
    }),
  });

  assert.equal(scene.find((element) => element.id === "video-resume").customData.status, "completed");
  assert.equal(scene.find((element) => element.id === "video-resume").customData.taskId, "task-video-resume");
  assert.equal(scene.some((element) => element.type === "embeddable" && element.link === "https://cdn.example/resumed.mp4"), true);
});

test("resumed generation reuses the existing failure path without inserting media", async () => {
  let scene = [{ id: "image-resume", type: "rectangle", version: 1, customData: { type: "image-generator", prompt: "雨夜", status: "running", taskId: "task-image-resume" } }];
  const canvasApi = {
    getSceneElements: () => scene,
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  await assert.rejects(() => executeCanvasNodeGeneration({
    api: canvasApi,
    request: buildCanvasNodeGenerationRequest(scene[0]),
    onGenerate: () => resumeCanvasGeneration({
      api: { async getGenerationTask(taskId) { return { id: taskId, status: "failed", error: { message: "恢复任务失败" } }; } },
      kind: "image",
      taskId: "task-image-resume",
      pollIntervalMs: 0,
    }),
  }), /恢复任务失败/);

  assert.equal(scene.length, 1);
  assert.equal(scene[0].customData.status, "failed");
  assert.equal(scene[0].customData.taskId, "task-image-resume");
  assert.equal(scene[0].customData.error, "恢复任务失败");
});

test("authentication expiry detaches an existing paid task instead of marking it failed", async () => {
  let scene = [{
    id: "image-auth-resume",
    type: "rectangle",
    version: 1,
    customData: {
      type: "image-generator",
      status: "running",
      taskId: "task-auth-resume",
    },
  }];
  const api = {
    getSceneElements: () => scene,
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  const authError = Object.assign(new Error("unauthenticated"), { status: 401, errorCode: "unauthenticated" });

  await assert.rejects(executeCanvasNodeGeneration({
    api,
    request: buildCanvasNodeGenerationRequest(scene[0]),
    async onGenerate() { throw authError; },
  }), authError);

  assert.equal(isUnauthenticatedError(authError), true);
  assert.equal(scene[0].customData.status, "running");
  assert.equal(scene[0].customData.taskId, "task-auth-resume");
  assert.equal(scene[0].customData.pollingDetached, true);
  assert.equal(scene[0].customData.authRequired, true);
  assert.match(scene[0].customData.error, /登录后将继续恢复/);
});

test("authentication expiry before submission leaves the node retryable", async () => {
  let scene = [{
    id: "image-auth-new",
    type: "rectangle",
    version: 1,
    customData: { type: "image-generator", status: "completed", taskId: "task-previous-success" },
  }];
  const api = {
    getSceneElements: () => scene,
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  const authError = Object.assign(new Error("unauthenticated"), { status: 401 });
  await assert.rejects(executeCanvasNodeGeneration({
    api,
    request: buildCanvasNodeGenerationRequest(scene[0]),
    async onGenerate() { throw authError; },
  }), authError);

  assert.equal(scene[0].customData.status, "idle");
  assert.equal(scene[0].customData.taskId, "task-previous-success");
  assert.equal(scene[0].customData.authRequired, true);
  assert.equal(scene[0].customData.pollingDetached, false);
});

test("refresh recovery includes detached tasks and excludes confirmed cancellations", () => {
  const candidates = collectCanvasGenerationResumeCandidates([
    { id: "detached", customData: { type: "video-generator", status: "running", taskId: "task-detached", pollingDetached: true } },
    { id: "audio-detached", customData: { type: "audio-node", status: "running", taskId: "task-audio", pollingDetached: true } },
    { id: "audio-media", customData: { type: "audio-node", sourceKind: "generated", status: "running", taskId: "task-media" } },
    { id: "canceled", customData: { type: "video-generator", status: "canceled", taskId: "task-canceled" } },
    { id: "unsubmitted", customData: { type: "image-generator", status: "running" } },
    { id: "deleted", isDeleted: true, customData: { type: "image-generator", status: "running", taskId: "task-deleted" } },
  ]);
  assert.deepEqual(candidates.map((element) => element.id), ["detached", "audio-detached"]);
});

test("cross-device recovery only accepts the latest server run when its generation input still matches", () => {
  const element = {
    id: "image-cross-device",
    customData: { type: "image-generator", status: "idle", prompt: "雨夜", model: "image-real", parameters: { quality: "2K" } },
  };
  const payload = buildCanvasGenerationPayload({
    kind: "image",
    nodeId: element.id,
    data: element.customData,
    elements: [element],
    files: {},
    canvasProjectId: "canvas-server",
  });
  const matchingRun = {
    id: "run-latest",
    runNo: 3,
    status: "running",
    mediaKind: "image",
    taskId: "task-server",
    inputSnapshot: {
      ...payload,
      parameters: { ...payload.parameters, referenceImages: [{ url: "https://cdn.example.test/input.png?signature=old" }] },
    },
  };
  const payloadWithReference = {
    ...payload,
    parameters: { ...payload.parameters, referenceImages: [{ url: "https://cdn.example.test/input.png?signature=new" }] },
  };
  assert.deepEqual(
    findCanvasGenerationServerRecovery(element, { runs: [matchingRun] }, payloadWithReference),
    { action: "resume", status: "running", taskId: "task-server", run: matchingRun },
  );
  assert.equal(findCanvasGenerationServerRecovery(element, {
    runs: [
      { ...matchingRun, id: "run-newer", runNo: 4, inputSnapshot: { ...payload, prompt: "已修改" } },
      matchingRun,
    ],
  }, payload), null);
  assert.equal(findCanvasGenerationServerRecovery(element, {
    runs: [{ ...matchingRun, taskId: null }],
  }, payloadWithReference), null);
});

test("cross-device recovery excludes locally owned or edited task state", () => {
  const candidates = collectCanvasGenerationServerRecoveryCandidates([
    { id: "recover", customData: { type: "video-generator", status: "idle", prompt: "推进" } },
    { id: "owned", customData: { type: "video-generator", status: "running", taskId: "task-local" } },
    { id: "edited", customData: { type: "image-generator", status: "idle", inputUpdated: true } },
    { id: "complete", customData: { type: "image-generator", status: "completed", resultStorageObjectId: "result" } },
    { id: "audio-file", customData: { type: "audio-node", sourceKind: "generated" } },
  ]);
  assert.deepEqual(candidates.map((element) => element.id), ["recover"]);
  assert.match(canvasEntry, /listCanvasNodeRuns\(cloudCanvasProjectId, element\.id\)/);
  assert.match(canvasEntry, /findCanvasGenerationServerRecovery\(element, entry\.history, payload\)/);
  assert.match(canvasEntry, /resumeCanvasGeneration\(\{ api: creatorApi, kind, taskId: recovery\.taskId \}\)/);
});

test("completed server runs reuse selected artifacts and do not insert duplicate media", async () => {
  const run = {
    id: "run-complete",
    status: "succeeded",
    taskId: "task-complete",
    artifacts: [
      { id: "artifact-old", artifactKind: "video", url: "https://cdn.example.test/old.mp4", selected: false, metadata: { mimeType: "video/mp4" } },
      { id: "artifact-current", artifactKind: "video", url: "https://cdn.example.test/current.mp4", storageObjectId: "video-object", selected: true, selectionRole: "current", metadata: { mimeType: "video/mp4", title: "当前结果" } },
    ],
  };
  const result = canvasGenerationResultFromRun(run);
  assert.equal(result.taskId, "task-complete");
  assert.equal(result.artifact.storageObjectId, "video-object");

  let scene = [{ id: "video-generator", type: "rectangle", customData: { type: "video-generator", status: "running", taskId: "task-complete" } }];
  const api = {
    getSceneElements: () => scene,
    getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  const request = buildCanvasNodeGenerationRequest(scene[0]);
  await executeCanvasNodeGeneration({ api, request, async onGenerate() { return result; } });
  await executeCanvasNodeGeneration({ api, request, async onGenerate() { return result; } });
  assert.equal(scene.filter((element) => element.customData?.storageObjectId === "video-object").length, 1);
});

test("terminal server runs update the node without submitting another generation", () => {
  let scene = [{ id: "terminal", type: "rectangle", customData: { type: "image-generator", status: "idle", prompt: "雨夜" } }];
  const api = {
    getSceneElements: () => scene,
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  applyCanvasGenerationServerTerminal(api, scene[0], { status: "result_unknown", taskId: "task-unknown" });
  assert.equal(scene[0].customData.status, "failed");
  assert.equal(scene[0].customData.taskId, "task-unknown");
  assert.match(scene[0].customData.error, /结果未知/);
});

test("new canvas opens shared login for generation and recovery authentication failures", () => {
  assert.match(canvasEntry, /canvasStorage\.save[\s\S]+isUnauthenticatedError\(error\)[\s\S]+openSharedLoginModal/);
  assert.match(canvasEntry, /runCanvasGeneration\([\s\S]+\.catch\(async \(error\)[\s\S]+openSharedLoginModal/);
  assert.match(canvasEntry, /resumeCanvasGeneration\([\s\S]+isUnauthenticatedError\(error\)[\s\S]+openSharedLoginModal/);
  assert.match(sharedApp, /"\/api\/auth\/password\/login"/);
});

test("image-to-image action creates a real bound generator workflow without starting generation", () => {
  let scene = [{ id: "source", type: "image", fileId: "source-file", x: 10, y: 20, width: 320, height: 180, version: 1 }];
  const api = {
    getSceneElements: () => scene,
    getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  const generatorId = createImageToImageGenerator(api, "source");
  const generator = scene.find((element) => element.id === generatorId);
  const edge = scene.find((element) => element.type === "arrow");
  assert.equal(generator.customData.type, "image-generator");
  assert.equal(generator.customData.status, "idle");
  assert.equal(edge.startBinding.elementId, "source");
  assert.equal(edge.endBinding.elementId, generatorId);
  assert.equal(edge.customData.workflowEdge, true);
});

test("new canvas generation ignores arrows that are not executable workflow edges", () => {
  const elements = [
    { id: "text-valid", type: "text", text: "有效提示词" },
    { id: "text-visual", type: "text", text: "纯视觉箭头" },
    { id: "video", type: "rectangle", customData: { type: "video-generator", title: "不兼容视频" } },
    { id: "target", type: "rectangle", customData: { type: "image-generator" } },
    { id: "valid", type: "arrow", startBinding: { elementId: "text-valid" }, endBinding: { elementId: "target" }, customData: { workflowEdge: true } },
    { id: "disabled", type: "arrow", startBinding: { elementId: "text-visual" }, endBinding: { elementId: "target" }, customData: { workflowEdge: false } },
    { id: "mismatch", type: "arrow", startBinding: { elementId: "video" }, endBinding: { elementId: "target" }, customData: { workflowEdge: true } },
  ];

  const input = collectUpstreamCanvasInput(elements, {}, "target");
  assert.deepEqual(input.upstreamNodeIds, ["text-valid"]);
  assert.deepEqual(input.upstreamTextFragments, ["有效提示词"]);
});

test("new canvas generation forwards connected video and audio nodes through provider media fields", () => {
  const elements = [
    { id: "video-source", type: "embeddable", link: "https://cdn.example/reference.mp4", customData: { isVideo: true, mediaKind: "video", title: "参考视频", storageObjectId: "video-object" } },
    { id: "audio-source", type: "rectangle", customData: { type: "audio-node", mediaKind: "audio", mediaUrl: "https://cdn.example/reference.wav", title: "对白", storageObjectId: "audio-object" } },
    { id: "target", type: "rectangle", customData: { type: "video-generator" } },
    { id: "video-edge", type: "arrow", startBinding: { elementId: "video-source" }, endBinding: { elementId: "target" }, customData: { workflowEdge: true } },
    { id: "audio-edge", type: "arrow", startBinding: { elementId: "audio-source" }, endBinding: { elementId: "target" }, customData: { workflowEdge: true } },
  ];
  const payload = buildCanvasGenerationPayload({ kind: "video", nodeId: "target", data: { prompt: "合成镜头" }, elements, files: {} });
  assert.equal(payload.sourceVideoUrl, "https://cdn.example/reference.mp4");
  assert.equal(payload.referenceAudioUrl, "https://cdn.example/reference.wav");
  assert.deepEqual(payload.parameters.videoFilePaths, ["https://cdn.example/reference.mp4"]);
  assert.deepEqual(payload.parameters.audioFilePaths, ["https://cdn.example/reference.wav"]);
  assert.equal(payload.parameters.referenceVideos[0].storageObjectId, "video-object");
  assert.equal(payload.parameters.referenceAudios[0].storageObjectId, "audio-object");
  assert.deepEqual(payload.canvasContext.upstreamNodeIds, ["video-source", "audio-source"]);
});

test("new canvas generation builds a canvas-target image payload", () => {
  const payload = buildCanvasGenerationPayload({
    kind: "image",
    nodeId: "target",
    data: { prompt: "电影感", model: "image-model", aspectRatio: "16:9", quality: "hd" },
    elements: [],
    files: {},
    canvasProjectId: "canvas-project-1",
  });
  assert.equal(payload.prompt, "电影感");
  assert.equal(payload.target.canvasProjectId, "canvas-project-1");
  assert.equal(payload.target.nodeId, "target");
  assert.deepEqual(payload.parameters, { aspectRatio: "16:9", quality: "hd", count: 1 });
});

test("director generation uses the synchronous canvas node contract", async () => {
  const calls = [];
  const result = await runCanvasGeneration({
    api: {
      async runCanvasNode(canvasProjectId, nodeId, payload, options) {
        calls.push({ canvasProjectId, nodeId, payload, options });
        return { runId: "director-run-1", status: "succeeded", mediaKind: "text", result: { text: "先全景后近景。", structured: { shots: 2 } } };
      },
      async getGenerationTask() { throw new Error("director must not poll"); },
    },
    kind: "director",
    nodeId: "director-node",
    elements: [],
    files: {},
    canvasProjectId: "canvas-project-1",
    data: { instructions: "设计雨夜追逐镜头", directorIdempotencyKey: "director-key-1" },
  });

  assert.equal(result.result.text, "先全景后近景。");
  assert.deepEqual(calls, [{
    canvasProjectId: "canvas-project-1",
    nodeId: "director-node",
    options: { signal: undefined, idempotencyKey: "director-key-1" },
    payload: {
      kind: "director",
      mediaKind: "text",
      targetType: "canvas",
      targetId: "director-node",
      prompt: "设计雨夜追逐镜头",
      model: undefined,
      parameters: {},
      canvasContext: {
        upstreamNodeIds: [],
        upstreamTextFragments: [],
      },
      instructions: "设计雨夜追逐镜头",
      target: { kind: "canvas", canvasProjectId: "canvas-project-1", nodeId: "director-node" },
    },
  }]);
});

test("director generation sends media metadata without exposing connected asset URLs", () => {
  const elements = [
    { id: "image-source", type: "image", fileId: "image-file", customData: { title: "人物参考" } },
    { id: "video-source", type: "embeddable", link: "https://private.example/clip.mp4", customData: { isVideo: true, mediaKind: "video", title: "运镜参考" } },
    { id: "audio-source", type: "rectangle", customData: { type: "audio-node", mediaKind: "audio", mediaUrl: "blob:private-audio", title: "对白参考" } },
    { id: "director-node", type: "rectangle", customData: { type: "director-node" } },
    { id: "image-edge", type: "arrow", startBinding: { elementId: "image-source" }, endBinding: { elementId: "director-node" }, customData: { workflowEdge: true } },
    { id: "video-edge", type: "arrow", startBinding: { elementId: "video-source" }, endBinding: { elementId: "director-node" }, customData: { workflowEdge: true } },
    { id: "audio-edge", type: "arrow", startBinding: { elementId: "audio-source" }, endBinding: { elementId: "director-node" }, customData: { workflowEdge: true } },
  ];
  const payload = buildCanvasGenerationPayload({
    kind: "director",
    nodeId: "director-node",
    data: { instructions: "设计镜头" },
    elements,
    files: { "image-file": { dataURL: "data:image/png;base64,private" } },
  });

  assert.deepEqual(payload.canvasContext.mediaReferences, [
    { nodeId: "image-source", kind: "image", name: "人物参考" },
    { nodeId: "video-source", kind: "video", name: "运镜参考" },
    { nodeId: "audio-source", kind: "audio", name: "对白参考" },
  ]);
  assert.equal("referenceImages" in payload, false);
  assert.equal(JSON.stringify(payload).includes("private.example"), false);
  assert.equal(JSON.stringify(payload).includes("data:image"), false);
  assert.equal(JSON.stringify(payload).includes("blob:"), false);
});

test("director refresh recovery requires the highest successful run to match every stable input", () => {
  const elements = [
    { id: "script", type: "text", text: "雨夜追逐" },
    { id: "reference", type: "image", fileId: "reference-file", customData: { title: "人物参考", storageObjectId: "object-reference-v1" } },
    { id: "director", type: "rectangle", customData: { type: "director-node", instructions: "保持低机位", status: "running", directorReplayPending: true } },
    { id: "script-edge", type: "arrow", startBinding: { elementId: "script" }, endBinding: { elementId: "director" }, customData: { workflowEdge: true, sourcePortId: "out_text", targetPortId: "in_any", edgeKind: "text" } },
    { id: "reference-edge", type: "arrow", startBinding: { elementId: "reference" }, endBinding: { elementId: "director" }, customData: { workflowEdge: true, sourcePortId: "out_image", targetPortId: "in_any", edgeKind: "image" } },
  ];
  const payload = buildCanvasGenerationPayload({
    kind: "director",
    nodeId: "director",
    data: elements[2].customData,
    elements,
    files: { "reference-file": { dataURL: "/api/storage/objects/object-reference-v1/content" } },
  });
  const matchingInput = canvasDirectorRecoveryInputFromPayload(payload);
  assert.ok(matchingInput);
  assert.equal(matchingInput.mediaReferences[0].storageObjectId, "object-reference-v1");
  assert.deepEqual(matchingInput.upstreamNodeIds, ["reference", "script"]);
  assert.equal(matchingInput.connections.length, 2);

  const matchingRun = {
    id: "run-2",
    runNo: 2,
    status: "succeeded",
    inputSnapshot: { recoveryInput: matchingInput },
    outputSnapshot: { text: "匹配的最新导演结果" },
  };
  assert.equal(findLatestCanvasDirectorResult({ runs: [matchingRun] }, matchingInput)?.text, "匹配的最新导演结果");

  const changedPayload = buildCanvasGenerationPayload({
    kind: "director",
    nodeId: "director",
    data: { ...elements[2].customData, instructions: "改为高机位" },
    elements,
    files: { "reference-file": { dataURL: "/api/storage/objects/object-reference-v1/content" } },
  });
  assert.equal(findLatestCanvasDirectorResult({ runs: [matchingRun] }, canvasDirectorRecoveryInputFromPayload(changedPayload)), null);

  const mismatchedLatest = {
    ...matchingRun,
    id: "run-3",
    runNo: 3,
    inputSnapshot: { recoveryInput: { ...matchingInput, prompt: "旧输入" } },
    outputSnapshot: { text: "不应回填的新结果" },
  };
  assert.equal(findLatestCanvasDirectorResult({ runs: [matchingRun, mismatchedLatest] }, matchingInput), null);
  assert.equal(findLatestCanvasDirectorResult({ runs: [{ ...matchingRun, inputSnapshot: {} }] }, matchingInput), null);
});

test("director refresh recovery excludes edited nodes and unverifiable media", () => {
  assert.deepEqual(collectCanvasDirectorRecoveryCandidates([
    { id: "ready", customData: { type: "director-node", status: "running", directorReplayPending: true } },
    { id: "edited", customData: { type: "director-node", status: "running", directorReplayPending: true, inputUpdated: true } },
  ]).map((element) => element.id), ["ready"]);
  const payload = buildCanvasGenerationPayload({
    kind: "director",
    nodeId: "director",
    data: { instructions: "设计镜头" },
    elements: [
      { id: "image", type: "image", fileId: "local-image", customData: { title: "未归档参考" } },
      { id: "director", type: "rectangle", customData: { type: "director-node" } },
      { id: "edge", type: "arrow", startBinding: { elementId: "image" }, endBinding: { elementId: "director" }, customData: { workflowEdge: true } },
    ],
    files: { "local-image": { dataURL: "data:image/png;base64,local" } },
  });
  assert.equal(canvasDirectorRecoveryInputFromPayload(payload), null);
});

test("director replay polls its exact run history until the text result is available", async () => {
  const calls = [];
  const result = await runCanvasGeneration({
    api: {
      async runCanvasNode() {
        calls.push("run");
        return { runId: "director-running", status: "running", result: {} };
      },
      async listCanvasNodeRuns(canvasProjectId, nodeId) {
        calls.push([canvasProjectId, nodeId]);
        return calls.length === 2
          ? { runs: [{ id: "director-running", status: "running", outputSnapshot: {} }] }
          : { runs: [{ id: "director-running", runNo: 4, status: "succeeded", outputSnapshot: { text: "历史恢复结果", structured: { shots: 1 } } }] };
      },
    },
    kind: "director",
    nodeId: "director-node",
    data: { instructions: "设计镜头", directorIdempotencyKey: "director-replay-key" },
    elements: [],
    files: {},
    canvasProjectId: "canvas-project-1",
    pollIntervalMs: 0,
    maxPolls: 3,
  });

  assert.equal(result.id, "director-running");
  assert.equal(result.outputSnapshot.text, "历史恢复结果");
  assert.deepEqual(calls, ["run", ["canvas-project-1", "director-node"], ["canvas-project-1", "director-node"]]);
});

test("director history reports terminal failure instead of polling or replaying forever", async () => {
  await assert.rejects(runCanvasGeneration({
    api: {
      async runCanvasNode() { return { runId: "director-failed", status: "running", result: {} }; },
      async listCanvasNodeRuns() { return { runs: [{ id: "director-failed", status: "failed" }] }; },
    },
    kind: "director",
    nodeId: "director-node",
    data: { instructions: "设计镜头", directorIdempotencyKey: "director-failed-key" },
    elements: [],
    files: {},
    canvasProjectId: "canvas-project-1",
    pollIntervalMs: 0,
    maxPolls: 2,
  }), (error) => error.code === "canvas_director_run_failed" && error.runId === "director-failed");
});

test("director retries use a new idempotency key while running recovery reuses the persisted key", async () => {
  let scene = [{ id: "director-node", type: "rectangle", version: 1, customData: { type: "director-node", instructions: "设计镜头", status: "ready" } }];
  const api = {
    getSceneElements: () => scene,
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  const keys = [];
  await assert.rejects(executeCanvasNodeGeneration({
    api,
    request: { type: "director-node", elementId: "director-node", instructions: "设计镜头" },
    async onGenerate(request) {
      keys.push(request.directorIdempotencyKey);
      throw Object.assign(new Error("invalid request"), { status: 422 });
    },
  }), /invalid request/);
  await executeCanvasNodeGeneration({
    api,
    request: { type: "director-node", elementId: "director-node", instructions: "设计镜头" },
    async onGenerate(request) {
      keys.push(request.directorIdempotencyKey);
      return { result: { text: "重试成功" } };
    },
  });
  assert.match(keys[0], /^canvas-director:/);
  assert.match(keys[1], /^canvas-director:/);
  assert.notEqual(keys[0], keys[1]);

  scene[0] = { ...scene[0], customData: { ...scene[0].customData, status: "running", directorIdempotencyKey: "persisted-director-key" } };
  await executeCanvasNodeGeneration({
    api,
    request: { type: "director-node", elementId: "director-node", instructions: "设计镜头" },
    async onGenerate(request) {
      keys.push(request.directorIdempotencyKey);
      return { result: { text: "恢复成功" } };
    },
  });
  assert.equal(keys[2], "persisted-director-key");
});

test("indeterminate director transport failures stay replayable with the same idempotency key", async () => {
  let scene = [{ id: "director-node", type: "rectangle", version: 1, customData: { type: "director-node", instructions: "设计镜头", status: "ready" } }];
  const api = {
    getSceneElements: () => scene,
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  const keys = [];
  await assert.rejects(executeCanvasNodeGeneration({
    api,
    request: { type: "director-node", elementId: "director-node", instructions: "设计镜头" },
    async onGenerate(request) {
      keys.push(request.directorIdempotencyKey);
      throw Object.assign(new Error("response lost"), { status: 503 });
    },
  }), /response lost/);
  assert.equal(scene[0].customData.status, "running");
  assert.equal(scene[0].customData.directorReplayPending, true);
  assert.equal(scene[0].customData.directorIdempotencyKey, keys[0]);

  await executeCanvasNodeGeneration({
    api,
    request: { type: "director-node", elementId: "director-node", instructions: "设计镜头" },
    async onGenerate(request) {
      keys.push(request.directorIdempotencyKey);
      return { result: { text: "恢复成功" } };
    },
  });
  assert.equal(keys[1], keys[0]);
  assert.equal(scene[0].customData.directorReplayPending, false);
  assert.equal(scene[0].customData.directorResult, "恢复成功");
});

test("director execution persists textual output on the source node without media insertion", async () => {
  let scene = [{ id: "director-node", type: "rectangle", version: 1, customData: { type: "director-node", instructions: "设计镜头", status: "ready" } }];
  const api = {
    getSceneElements: () => scene,
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  await executeCanvasNodeGeneration({
    api,
    request: { type: "director-node", elementId: "director-node", instructions: "设计镜头" },
    async onGenerate() {
      return { runId: "director-run-2", runNo: 2, status: "succeeded", result: { text: "镜头缓慢推进。", structured: { motion: "push" } } };
    },
  });

  assert.equal(scene.length, 1);
  assert.equal(scene[0].customData.status, "completed");
  assert.equal(scene[0].customData.directorResult, "镜头缓慢推进。");
  assert.deepEqual(scene[0].customData.directorStructuredResult, { motion: "push" });
  assert.equal(scene[0].customData.directorRunId, "director-run-2");
});

test("new canvas generation sends panel reference images and video frame roles", () => {
  const payload = buildCanvasGenerationPayload({
    kind: "video",
    nodeId: "video-target",
    data: {
      prompt: "镜头缓慢推进",
      inputImages: ["data:image/png;base64,first", "https://cdn.example.com/last.png"],
    },
    elements: [],
    files: {},
  });
  assert.deepEqual(payload.referenceImages, [
    "data:image/png;base64,first",
    "https://cdn.example.com/last.png",
  ]);
  assert.equal(payload.firstFrameUrl, "data:image/png;base64,first");
  assert.equal(payload.lastFrameUrl, "https://cdn.example.com/last.png");
  assert.deepEqual(payload.parameters.referenceImages.map((item) => item.url), payload.referenceImages);
  assert.equal(payload.parameters.firstFrame.url, "data:image/png;base64,first");
  assert.equal(payload.parameters.lastFrame.url, "https://cdn.example.com/last.png");
  assert.deepEqual(payload.canvasContext.referenceImages.map((item) => item.name), ["首帧", "尾帧"]);
});

test("new canvas generation sends configured model parameters without replacing provider values", () => {
  const payload = buildCanvasGenerationPayload({
    kind: "video",
    nodeId: "target",
    data: {
      prompt: "镜头推进",
      model: "video-real-1",
      parameters: { ratio: "21:9", resolution: "1080p", durationSec: 8, count: 2, cameraMotion: "push" },
    },
    elements: [],
    files: {},
  });
  assert.equal(payload.model, "video-real-1");
  assert.deepEqual(payload.parameters, {
    ratio: "21:9",
    resolution: "1080p",
    durationSec: 8,
    count: 2,
    cameraMotion: "push",
    aspectRatio: "21:9",
  });
});

test("new canvas audio generation sends real TTS payload and keeps provider parameter keys", () => {
  const payload = buildCanvasGenerationPayload({
    kind: "audio",
    nodeId: "audio-target",
    canvasProjectId: "canvas-project",
    data: {
      prompt: "雨停之后，我们继续出发。",
      model: "cosyvoice-real",
      parameters: {
        voice: "longxiaochun_v2",
        format: "mp3",
        sampleRate: 24000,
        rate: 1.15,
        pitch: 0.9,
        volume: 60,
      },
    },
    elements: [],
    files: {},
  });
  assert.equal(payload.kind, "audio");
  assert.equal(payload.mediaKind, "audio");
  assert.equal(payload.text, "雨停之后，我们继续出发。");
  assert.equal(payload.prompt, payload.text);
  assert.equal(payload.model, "cosyvoice-real");
  assert.deepEqual(payload.parameters, {
    voice: "longxiaochun_v2",
    format: "mp3",
    sampleRate: 24000,
    rate: 1.15,
    pitch: 0.9,
    volume: 60,
  });
  assert.deepEqual(payload.target, { kind: "canvas", canvasProjectId: "canvas-project", nodeId: "audio-target" });
  assert.equal("episodeId" in payload, false);
});

test("standalone cloud canvas audio generation runs the persisted audio node endpoint", async () => {
  const calls = [];
  const result = await runCanvasGeneration({
    api: {
      async runCanvasNode(canvasProjectId, nodeId, payload) {
        calls.push({ canvasProjectId, nodeId, payload });
        return {
          taskId: "audio-task-standalone",
          status: "completed",
          result: {
            mediaKind: "audio",
            audioUrl: "https://cdn.example.test/standalone.mp3",
            mimeType: "audio/mpeg",
            storageObjectId: "audio-storage-standalone",
          },
        };
      },
      async createStandaloneCanvasGenerationTask() {
        throw new Error("standalone audio must use the persisted canvas node route");
      },
    },
    kind: "audio",
    nodeId: "audio-node",
    data: { prompt: "独立画布旁白", model: "cosyvoice-v2", type: "audio-node" },
    elements: [],
    files: {},
    canvasProjectId: "canvas-project-id",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].canvasProjectId, "canvas-project-id");
  assert.equal(calls[0].nodeId, "audio-node");
  assert.equal(calls[0].payload.kind, "audio");
  assert.equal(calls[0].payload.text, "独立画布旁白");
  assert.equal(result.artifact.storageObjectId, "audio-storage-standalone");
});

test("new canvas model catalog only exposes enabled models for the requested media kind", () => {
  const config = {
    defaultImageModelCode: "image-2",
    models: [
      { modelCode: "image-1", modelLabel: "图片一", mediaType: "image" },
      { modelCode: "image-2", modelLabel: "图片二", supportedModes: ["text_to_image"] },
      { modelCode: "video-1", modelLabel: "视频一", mediaType: "video" },
      { modelCode: "text-1", modelLabel: "文本一", mediaType: "text" },
      { modelCode: "disabled", modelLabel: "停用", mediaType: "image", disabled: true },
    ],
  };
  assert.deepEqual(resolveCanvasGenerationModels(config, "image").map((model) => model.code), ["image-1", "image-2"]);
  assert.equal(resolveCanvasGenerationModel(config, "image", "missing").code, "image-2");
  assert.deepEqual(resolveCanvasGenerationModels({ models: [
    ...config.models,
    { modelCode: "legacy-untyped", modelLabel: "未声明媒体类型" },
    { modelCode: "audio-1", modelLabel: "真实语音", mediaType: "audio" },
  ] }, "audio").map((model) => model.code), ["audio-1"]);
});

test("new canvas model selection applies real schema defaults and preserves provider parameter keys", () => {
  const model = {
    modelCode: "image-real",
    modelLabel: "真实图片模型",
    mediaType: "image",
    defaultParams: { ratio: "21:9", quality: "4K", count: 2 },
    parameterSchema: {
      ratio: { label: "图片比例", enum: ["16:9", "21:9"] },
      quality: { label: "清晰度", options: [{ value: "2K", label: "2K" }, { value: "4K", label: "4K" }] },
      count: { label: "输出数量", enum: [1, 2, 4], type: "integer" },
      prompt: { type: "string" },
    },
  };
  assert.deepEqual(resolveCanvasModelParameterControls(model, "image").map((control) => control.key), ["ratio", "quality", "count"]);
  assert.deepEqual(buildCanvasModelSelectionPatch({}, model, "image"), {
    model: "image-real",
    modelLabel: "真实图片模型",
    parameters: { ratio: "21:9", quality: "4K", count: 2 },
    aspectRatio: "21:9",
    quality: "4K",
    outputCount: 2,
  });
});

test("new canvas audio model selection persists the required default voice and official numeric defaults", () => {
  const model = {
    modelCode: "cosyvoice-v2",
    modelLabel: "CosyVoice V2",
    mediaType: "audio",
    defaultParams: {
      voice: "longxiaochun_v2",
      format: "mp3",
      sampleRate: 22050,
      volume: 50,
      rate: 1,
      pitch: 1,
    },
    parameterSchema: {
      voice: { type: "enum", required: true, options: ["longxiaochun_v2", "longwan_v2"] },
      format: { type: "enum", options: ["mp3", "wav"] },
      sampleRate: { type: "enum", options: [22050, 24000] },
      volume: { type: "integer", minimum: 0, maximum: 100, step: 1 },
      rate: { type: "number", minimum: 0.5, maximum: 2, step: 0.05 },
      pitch: { type: "number", minimum: 0.5, maximum: 2, step: 0.05 },
    },
  };
  assert.deepEqual(buildCanvasModelSelectionPatch({}, model, "audio"), {
    model: "cosyvoice-v2",
    modelLabel: "CosyVoice V2",
    parameters: {
      voice: "longxiaochun_v2",
      format: "mp3",
      sampleRate: 22050,
      volume: 50,
      rate: 1,
      pitch: 1,
    },
  });
});

test("new canvas exposes boolean video provider parameters and forwards embedded audio generation", () => {
  const model = {
    modelCode: "video-with-audio",
    modelLabel: "带音轨视频模型",
    mediaType: "video",
    defaultParams: { generateAudio: true },
    parameterSchema: {
      generateAudio: { label: "生成音频", type: "boolean" },
    },
  };
  const controls = resolveCanvasModelParameterControls(model, "video");
  assert.deepEqual(controls.map(({ key, type }) => ({ key, type })), [
    { key: "generateAudio", type: "boolean" },
  ]);
  const patch = buildCanvasParameterPatch(
    buildCanvasModelSelectionPatch({}, model, "video"),
    "generateAudio",
    false,
    model,
    "video",
  );
  assert.equal(patch.parameters.generateAudio, false);
  const payload = buildCanvasGenerationPayload({
    kind: "video",
    nodeId: "video-target",
    data: { prompt: "雨夜对白", model: model.modelCode, ...patch },
    elements: [],
    files: {},
  });
  assert.equal(payload.parameters.generateAudio, false);
});

test("new canvas treats ratio-shaped size options as aspect ratio without duplicating controls", () => {
  const model = {
    modelCode: "nano-real",
    modelLabel: "Nano Real",
    mediaType: "image",
    supportedRatios: ["16:9", "9:16"],
    supportedQuality: ["2K", "4k"],
    defaultParams: { size: "16:9", quality: "4k" },
    parameterSchema: {
      size: { label: "尺寸", enum: ["1:1", "16:9", "9:16"] },
      quality: { label: "清晰度", enum: ["2K", "4k"] },
    },
  };
  const controls = resolveCanvasModelParameterControls(model, "image");
  assert.deepEqual(controls.map((control) => control.key), ["size", "quality"]);
  assert.deepEqual(buildCanvasModelSelectionPatch({}, model, "image"), {
    model: "nano-real",
    modelLabel: "Nano Real",
    parameters: { size: "16:9", quality: "4k" },
    aspectRatio: "16:9",
    quality: "4k",
  });
  const payload = buildCanvasGenerationPayload({
    kind: "image",
    nodeId: "target",
    data: { prompt: "雨夜", model: "nano-real", parameters: { size: "16:9", quality: "4k" } },
    elements: [],
    files: {},
  });
  assert.equal(payload.parameters.size, "16:9");
  assert.equal(payload.parameters.aspectRatio, "16:9");
  assert.equal(payload.parameters.quality, "4k");
});

test("new canvas marks generated nodes when model inputs change and clears the marker during execution", async () => {
  const generated = { status: "completed", taskId: "task-1", parameters: { quality: "2K" } };
  assert.equal(markCanvasGeneratorInputUpdated(generated, { prompt: "新提示词" }).inputUpdated, true);
  assert.equal(buildCanvasParameterPatch(generated, "quality", "4K").inputUpdated, true);

  let scene = [{
    id: "image-updated",
    type: "rectangle",
    version: 1,
    customData: { type: "image-generator", prompt: "新提示词", taskId: "task-1", inputUpdated: true, generationNoticeDismissed: "failed" },
  }];
  const api = {
    getSceneElements: () => scene,
    getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  await executeCanvasNodeGeneration({
    api,
    request: buildCanvasNodeGenerationRequest(scene[0]),
    async onGenerate() {
      assert.equal(scene[0].customData.inputUpdated, false);
      assert.equal(scene[0].customData.generationNoticeDismissed, null);
      return { taskId: "task-2", artifact: null };
    },
  });
  assert.equal(scene[0].customData.inputUpdated, false);
  assert.equal(scene[0].customData.generationNoticeDismissed, null);
});

test("generator element updates mark indirect style and parameter input changes", () => {
  let scene = [
    { id: "image-style", type: "rectangle", version: 1, customData: { type: "image-generator", taskId: "image-task", prompt: "原提示" } },
    { id: "video-parameter", type: "rectangle", version: 1, customData: { type: "video-generator", resultUrl: "https://cdn.example/video.mp4", duration: 5 } },
  ];
  const api = {
    getSceneElements: () => scene,
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  updateImageGeneratorElement(api, "image-style", { prompt: "新提示", styleId: "style-1" });
  updateVideoGeneratorElement(api, "video-parameter", { duration: 8 });
  assert.equal(scene[0].customData.inputUpdated, true);
  assert.equal(scene[1].customData.inputUpdated, true);
});

test("new canvas generation resolves task ids and artifacts from nested task results", () => {
  const task = {
    platform: { tasks: [{ taskId: "task-9" }] },
    result: { artifacts: [{ kind: "video", mimeType: "video/mp4", previewUrl: "https://example.test/result.mp4" }] },
  };
  assert.equal(resolveGenerationTaskId(task), "task-9");
  assert.deepEqual(extractGenerationArtifact(task, "video"), {
    url: "https://example.test/result.mp4",
    mimeType: "video/mp4",
    title: "生成视频",
    width: undefined,
    height: undefined,
    durationSeconds: undefined,
    storageUrl: "https://example.test/result.mp4",
    storageObjectId: undefined,
  });
});

test("new canvas generation extracts the production task API direct result artifact", () => {
  const imageTask = {
    taskId: "task-image-direct",
    status: "succeeded",
    result: {
      mediaKind: "image",
      imageUrl: "/api/storage/upload-sessions/image/content",
      sourceUrl: "/api/storage/upload-sessions/image/content",
      downloadUrl: "/api/storage/upload-sessions/image/download",
    },
  };
  const videoTask = {
    taskId: "task-video-direct",
    status: "succeeded",
    result: {
      mediaKind: "video",
      videoUrl: "https://cdn.example.test/video.mp4",
      sourceUrl: "https://cdn.example.test/video.mp4",
    },
  };

  assert.deepEqual(extractGenerationArtifacts(imageTask, "image").map(({ url }) => url), [
    "/api/storage/upload-sessions/image/content",
  ]);
  assert.deepEqual(extractGenerationArtifacts(videoTask, "video").map(({ url }) => url), [
    "https://cdn.example.test/video.mp4",
  ]);
  const audioTask = {
    taskId: "task-audio-direct",
    status: "succeeded",
    result: {
      artifacts: [{ mediaType: "audio", mimeType: "audio/mpeg", audioUrl: "https://cdn.example.test/audio.mp3", storageObjectId: "audio-object" }],
    },
  };
  assert.deepEqual(extractGenerationArtifacts(audioTask, "audio").map(({ url, storageObjectId }) => ({ url, storageObjectId })), [
    { url: "https://cdn.example.test/audio.mp3", storageObjectId: "audio-object" },
  ]);
  assert.deepEqual(extractGenerationArtifacts(audioTask, "image"), []);
});

test("new canvas generation stops on manual review and unknown-result terminal states", async () => {
  for (const status of ["manual_review_required", "result_unknown"]) {
    let polls = 0;
    await assert.rejects(() => runCanvasGeneration({
      api: {
        async createStandaloneCanvasGenerationTask() {
          return {
            taskId: `task-${status}`,
            status,
            failure: { displayMessage: `${status} 已停止` },
          };
        },
        async getGenerationTask() {
          polls += 1;
          return {};
        },
      },
      kind: "image",
      nodeId: "image-node",
      data: { prompt: "雨夜" },
      elements: [],
      files: {},
      pollIntervalMs: 0,
    }), new RegExp(`${status} 已停止`));
    assert.equal(polls, 0);
  }
});

test("new canvas generation extracts every unique output artifact", () => {
  const task = { result: { artifacts: [
    { kind: "image", mimeType: "image/png", url: "https://example.test/one.png", title: "一" },
    { kind: "image", mimeType: "image/png", url: "https://example.test/two.png", title: "二" },
    { kind: "image", mimeType: "image/png", previewUrl: "https://example.test/two.png", title: "重复" },
  ] } };
  assert.deepEqual(extractGenerationArtifacts(task, "image").map(({ url }) => url), [
    "https://example.test/one.png",
    "https://example.test/two.png",
  ]);
});

test("new canvas generation never promotes echoed input references to output artifacts", () => {
  const withOutput = {
    result: {
      fixedImages: [{ mimeType: "image/png", url: "https://example.test/output.png" }],
      request: { referenceImages: [{ url: "https://example.test/input.png" }] },
    },
  };
  assert.deepEqual(extractGenerationArtifacts(withOutput, "image").map(({ url }) => url), [
    "https://example.test/output.png",
  ]);

  const inputOnly = {
    status: "completed",
    request: { referenceImages: [{ url: "https://example.test/input.png" }] },
    result: { request: { sourceUrl: "https://example.test/input.png" } },
  };
  assert.deepEqual(extractGenerationArtifacts(inputOnly, "image"), []);
});

test("shared canvas generation execution updates video nodes and inserts returned artifacts", async () => {
  let scene = [{
    id: "video-node",
    type: "rectangle",
    version: 1,
    x: 0,
    y: 0,
    width: 480,
    height: 270,
    customData: { type: "video-generator", prompt: "镜头推进", status: "idle", duration: 5 },
  }];
  const states = [];
  const api = {
    getSceneElements: () => scene,
    getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  const request = buildCanvasNodeGenerationRequest(scene[0]);
  const result = await executeCanvasNodeGeneration({
    api,
    request,
    async onGenerate(input) {
      assert.equal(input.elementId, "video-node");
      assert.equal(scene[0].customData.status, "running");
      return { taskId: "task-video", artifact: { url: "https://cdn.example/result.mp4", storageObjectId: "video-result-object", mimeType: "video/mp4", title: "推进镜头" } };
    },
    onStateChange: (state) => states.push(state),
  });

  assert.equal(result.taskId, "task-video");
  assert.equal(scene.find((element) => element.id === "video-node").customData.status, "completed");
  assert.equal(scene.find((element) => element.id === "video-node").customData.resultUrl, "https://cdn.example/result.mp4");
  assert.equal(scene.find((element) => element.id === "video-node").customData.resultStorageObjectId, "video-result-object");
  assert.equal(scene.some((element) => element.type === "embeddable" && element.link === "https://cdn.example/result.mp4"), true);
  const inserted = scene.find((element) => element.type === "embeddable" && element.link === "https://cdn.example/result.mp4");
  assert.equal(inserted.customData.source, "generated");
  assert.equal(inserted.customData.storageUrl, "https://cdn.example/result.mp4");
  assert.equal(inserted.customData.storageObjectId, "video-result-object");
  assert.equal(inserted.customData.cloudArchiveStatus, "archived");
  assert.deepEqual(states.map(({ running, error }) => [running, error]), [[true, ""], [false, ""]]);
});

test("shared canvas generation completes audio nodes only with archived audio artifacts", async () => {
  let scene = [{
    id: "audio-generator",
    type: "rectangle",
    version: 1,
    x: 0,
    y: 0,
    width: 340,
    height: 190,
    customData: { type: "audio-node", prompt: "旁白", model: "audio-real", status: "idle", mediaKind: "audio" },
  }];
  const api = {
    getSceneElements: () => scene,
    getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  await executeCanvasNodeGeneration({
    api,
    request: buildCanvasNodeGenerationRequest(scene[0]),
    async onGenerate() {
      return {
        taskId: "task-audio",
        artifact: {
          url: "https://cdn.example.test/narration.mp3",
          storageUrl: "https://cdn.example.test/narration.mp3",
          storageObjectId: "audio-object-1",
          mimeType: "audio/mpeg",
          title: "旁白",
        },
      };
    },
  });
  const generator = scene.find((element) => element.id === "audio-generator");
  const artifact = scene.find((element) => element.id !== "audio-generator" && element.customData?.sourceKind === "generated");
  assert.equal(generator.customData.status, "completed");
  assert.equal(generator.customData.taskId, "task-audio");
  assert.equal(generator.customData.resultStorageObjectId, "audio-object-1");
  assert.equal(artifact.customData.mediaUrl, "https://cdn.example.test/narration.mp3");
  assert.equal(artifact.customData.storageObjectId, "audio-object-1");
  assert.equal(artifact.customData.cloudArchiveStatus, "archived");
  assert.equal(artifact.customData.source, "generated");

  let invalidScene = [{ id: "invalid-audio", type: "rectangle", version: 1, customData: { type: "audio-node", prompt: "旁白", status: "idle" } }];
  const invalidApi = {
    getSceneElements: () => invalidScene,
    updateScene(update) { if (update.elements) invalidScene = update.elements; },
  };
  await assert.rejects(executeCanvasNodeGeneration({
    api: invalidApi,
    request: buildCanvasNodeGenerationRequest(invalidScene[0]),
    async onGenerate() { return { taskId: "invalid", artifact: { url: "https://cdn.example.test/unarchived.mp3", mimeType: "audio/mpeg" } }; },
  }), /未返回已归档/);
  assert.equal(invalidScene[0].customData.status, "failed");
  assert.equal(invalidScene.length, 1);
});

test("generated media elements retain stable artifact metadata for cloud persistence", () => {
  const image = createExcalidrawImageElement({
    fileId: "generated-file",
    x: 0,
    y: 0,
    width: 640,
    height: 360,
    title: "生成图片",
    source: "generated",
    storageUrl: "https://cdn.example.test/generated.png",
    storageObjectId: "generated-image-object",
    mimeType: "image/png",
    cloudArchiveStatus: "archived",
    sourceAction: "generated",
  });
  const video = createExcalidrawVideoElement({
    url: "https://cdn.example.test/generated.mp4",
    x: 0,
    y: 0,
    width: 640,
    height: 360,
    source: "generated",
    sourceKind: "generated",
    storageUrl: "https://cdn.example.test/generated.mp4",
    cloudArchiveStatus: "archived",
    sourceAction: "generated",
  });

  assert.deepEqual(image.customData, {
    title: "生成图片",
    source: "generated",
    storageUrl: "https://cdn.example.test/generated.png",
    storageObjectId: "generated-image-object",
    mimeType: "image/png",
    cloudArchiveStatus: "archived",
    sourceAction: "generated",
  });
  assert.equal(video.customData.source, "generated");
  assert.equal(video.customData.sourceKind, "generated");
  assert.equal(video.customData.storageUrl, "https://cdn.example.test/generated.mp4");
  assert.equal(video.customData.cloudArchiveStatus, "archived");
});

test("successful generation remains completed when local artifact insertion fails", async () => {
  let scene = [{ id: "image-node", type: "rectangle", version: 1, customData: { type: "image-generator", prompt: "雨夜", status: "idle" } }];
  const toasts = [];
  const api = {
    getSceneElements: () => scene,
    updateScene(update) { if (update.elements) scene = update.elements; },
    setToast(toast) { toasts.push(toast); },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 403 });
  try {
    await executeCanvasNodeGeneration({
      api,
      request: buildCanvasNodeGenerationRequest(scene[0]),
      async onGenerate() {
        return { taskId: "task-image", artifact: { url: "https://cdn.example.test/expired.png", mimeType: "image/png" } };
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(scene[0].customData.status, "completed");
  assert.equal(scene[0].customData.resultUrl, "https://cdn.example.test/expired.png");
  assert.match(scene[0].customData.artifactInsertError, /403/);
  assert.match(toasts[0].message, /生成已完成/);
});

test("shared canvas generation execution persists failed node state without inserting media", async () => {
  let scene = [{ id: "image-node", type: "rectangle", version: 1, customData: { type: "image-generator", prompt: "雨夜", status: "idle", generationNoticeDismissed: "failed" } }];
  const api = {
    getSceneElements: () => scene,
    updateScene(update) { if (update.elements) scene = update.elements; },
  };

  await assert.rejects(() => executeCanvasNodeGeneration({
    api,
    request: buildCanvasNodeGenerationRequest(scene[0]),
    async onGenerate() { throw new Error("供应商失败"); },
  }), /供应商失败/);
  assert.equal(scene.length, 1);
  assert.equal(scene[0].customData.status, "failed");
  assert.equal(scene[0].customData.error, "供应商失败");
  assert.equal(scene[0].customData.generationNoticeDismissed, null);
});
