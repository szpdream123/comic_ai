import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildCanvasVideoCompositionRequest,
  canvasVideoCompositionInputSignature,
  canvasVideoCompositionOutputState,
  canvasVideoCompositionSettingsPatch,
  collectCanvasVideoCompositionClips,
  executeCanvasVideoComposition,
  isIndeterminateCanvasVideoCompositionError,
} from "../new-canvas/src/loomic-core/canvas-video-composition.js";
import {
  insertCloudAssetOnCanvas,
  normalizeCanvasNodeHistory,
} from "../new-canvas/src/loomic-shell/canvas-file-utils.js";

const creatorApiSource = await readFile(new URL("../src/shared/creator-api.js", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../new-canvas/src/main.jsx", import.meta.url), "utf8");
const editorSource = await readFile(new URL("../new-canvas/src/loomic-core/CanvasEditor.jsx", import.meta.url), "utf8");
const panelSource = await readFile(new URL("../new-canvas/src/loomic-core/WorkflowNodePanel.jsx", import.meta.url), "utf8");

function compositionScene({ includeUnarchived = false } = {}) {
  const elements = [
    { id: "image", type: "image", customData: { title: "封面", storageObjectId: "image-object" } },
    { id: "video", type: "embeddable", customData: { isVideo: true, title: "镜头", storageObjectId: "video-object", durationSeconds: 7 } },
    { id: "composition", type: "rectangle", customData: { type: "video-composition-node", width: 1920, height: 1080, fps: 30, imageDurationSeconds: 2.5, clipDurations: { video: 6 } } },
    { id: "edge-image", type: "arrow", startBinding: { elementId: "image" }, endBinding: { elementId: "composition" }, customData: { workflowEdge: true } },
    { id: "edge-video", type: "arrow", startBinding: { elementId: "video" }, endBinding: { elementId: "composition" }, customData: { workflowEdge: true } },
  ];
  if (includeUnarchived) {
    elements.splice(2, 0, { id: "unarchived", type: "rectangle", customData: { type: "image-generator", title: "本地结果" } });
    elements.push({ id: "edge-unarchived", type: "arrow", startBinding: { elementId: "unarchived" }, endBinding: { elementId: "composition" }, customData: { workflowEdge: true } });
  }
  return elements;
}

function canvasApi(initial) {
  let elements = initial;
  return {
    getSceneElements: () => elements,
    getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    updateScene(update) { if (update.elements) elements = update.elements; },
    setToast() {},
  };
}

test("video composition collects typed upstream clips in connection order with duration overrides", () => {
  const clips = collectCanvasVideoCompositionClips(compositionScene(), "composition", {
    imageDurationSeconds: 2.5,
    clipDurations: { video: 6 },
  });
  assert.deepEqual(clips, [
    { nodeId: "image", title: "封面", kind: "image", storageObjectId: "image-object", durationSeconds: 2.5 },
    { nodeId: "video", title: "镜头", kind: "video", storageObjectId: "video-object", durationSeconds: 6 },
  ]);
});

test("video composition input signature is stable for presentation edits and changes with executable inputs", () => {
  const original = compositionScene();
  const signature = canvasVideoCompositionInputSignature(original, "composition", original[2].customData);
  const presentationOnly = original.map((element) => element.id === "video"
    ? { ...element, x: 420, customData: { ...element.customData, title: "改名镜头", storageUrl: "https://signed.example/new" } }
    : element);
  assert.equal(canvasVideoCompositionInputSignature(presentationOnly, "composition", presentationOnly[2].customData), signature);

  const reordered = [
    ...original.filter((element) => element.type !== "arrow"),
    original.find((element) => element.id === "edge-video"),
    original.find((element) => element.id === "edge-image"),
  ];
  assert.notEqual(canvasVideoCompositionInputSignature(reordered, "composition", reordered[2].customData), signature);
  assert.notEqual(canvasVideoCompositionInputSignature(original, "composition", {
    ...original[2].customData,
    fps: 24,
  }), signature);
});

test("video composition output is reusable only when its archived result matches current inputs", () => {
  const elements = compositionScene();
  const signature = canvasVideoCompositionInputSignature(elements, "composition", elements[2].customData);
  elements[2] = {
    ...elements[2],
    customData: {
      ...elements[2].customData,
      status: "completed",
      inputUpdated: false,
      resultUrl: "https://cdn.example/composed.mp4",
      resultStorageObjectId: "composition-object",
      resultMimeType: "video/mp4",
      compositionInputSignature: signature,
    },
  };
  assert.equal(canvasVideoCompositionOutputState(elements, "composition").ready, true);
  elements[2].customData.fps = 24;
  const stale = canvasVideoCompositionOutputState(elements, "composition");
  assert.equal(stale.ready, false);
  assert.equal(stale.reason, "composition_output_stale");
});

test("editing composition settings marks an existing result for update", () => {
  assert.deepEqual(canvasVideoCompositionSettingsPatch({ resultUrl: "https://cdn.example/old.mp4", inputUpdated: false }, { fps: 30 }), {
    fps: 30,
    inputUpdated: true,
    generationNoticeDismissed: null,
  });
  assert.deepEqual(canvasVideoCompositionSettingsPatch({ status: "ready" }, { fps: 30 }), {
    fps: 30,
    generationNoticeDismissed: null,
  });
});

test("video composition clip storage falls back from an empty result id to the stable source id", () => {
  const elements = compositionScene();
  elements[1].customData.resultStorageObjectId = "";
  assert.equal(collectCanvasVideoCompositionClips(elements, "composition", elements[2].customData)[1].storageObjectId, "video-object");
});

test("video composition builds the exact backend request and identifies unarchived inputs", () => {
  const result = buildCanvasVideoCompositionRequest({
    elements: compositionScene({ includeUnarchived: true }),
    nodeId: "composition",
    canvasProjectId: "canvas-project",
    settings: { width: 1920, height: 1080, fps: 30, imageDurationSeconds: 2.5, clipDurations: { video: 6 } },
  });
  assert.deepEqual(result.payload, {
    canvasProjectId: "canvas-project",
    nodeId: "composition",
    width: 1920,
    height: 1080,
    fps: 30,
    clips: [
      { nodeId: "image", durationSeconds: 2.5 },
      { nodeId: "video", durationSeconds: 6 },
      { nodeId: "unarchived", durationSeconds: 2.5 },
    ],
  });
  assert.deepEqual(result.missingArchive.map((clip) => clip.nodeId), ["unarchived"]);
});

test("archived history images retain their storage object through insertion and composition", async () => {
  const originalFetch = globalThis.fetch;
  const originalFileReader = globalThis.FileReader;
  const originalImage = globalThis.Image;
  globalThis.fetch = async () => new Response(new Blob(["image"], { type: "image/png" }), {
    status: 200,
    headers: { "content-type": "image/png" },
  });
  globalThis.FileReader = class {
    readAsDataURL() {
      this.result = "data:image/png;base64,aW1hZ2U=";
      queueMicrotask(() => this.onload?.());
    }
  };
  globalThis.Image = class {
    naturalWidth = 1280;
    naturalHeight = 720;
    set src(_value) { queueMicrotask(() => this.onload?.()); }
  };

  try {
    const api = canvasApi([]);
    api.addFiles = () => undefined;
    const history = normalizeCanvasNodeHistory({
      artifacts: [{
        id: "history-image",
        artifactKind: "image",
        url: "https://cdn.example/history-image.png",
        storageObjectId: "history-image-object",
      }],
    }, "image-node");
    const imageId = await insertCloudAssetOnCanvas(api, history.artifacts[0]);
    const inserted = api.getSceneElements().find((element) => element.id === imageId);
    assert.equal(inserted.customData.storageObjectId, "history-image-object");

    api.updateScene({
      elements: [
        ...api.getSceneElements(),
        { id: "composition", type: "rectangle", customData: { type: "video-composition-node" } },
        { id: "edge-history-image", type: "arrow", startBinding: { elementId: imageId }, endBinding: { elementId: "composition" }, customData: { workflowEdge: true } },
      ],
    });
    const request = buildCanvasVideoCompositionRequest({
      elements: api.getSceneElements(),
      nodeId: "composition",
      canvasProjectId: "canvas-project",
    });
    assert.deepEqual(request.missingArchive, []);
    assert.equal(request.clips[0].storageObjectId, "history-image-object");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalFileReader === undefined) delete globalThis.FileReader;
    else globalThis.FileReader = originalFileReader;
    if (originalImage === undefined) delete globalThis.Image;
    else globalThis.Image = originalImage;
  }
});

test("video composition persists running and completed state and inserts a reusable archived video", async () => {
  const api = canvasApi(compositionScene());
  const persistedStatuses = [];
  let request = null;
  const result = await executeCanvasVideoComposition({
    api,
    nodeId: "composition",
    canvasProjectId: "canvas-project",
    async onPersist() {
      persistedStatuses.push(api.getSceneElements().find((element) => element.id === "composition").customData.status);
      return { source: "cloud" };
    },
    async onCompose(payload, options) {
      request = { payload, options };
      return {
        artifact: {
          url: "https://cdn.example/composed.mp4",
          storageUrl: "https://cdn.example/composed.mp4",
          storageObjectId: "composition-object",
          mimeType: "video/mp4",
          width: 1920,
          height: 1080,
          fps: 30,
          durationSeconds: 8.5,
        },
      };
    },
  });

  assert.equal(request.payload.canvasProjectId, "canvas-project");
  assert.match(request.options.idempotencyKey, /^canvas-video-composition:/);
  assert.deepEqual(persistedStatuses, ["running", "completed"]);
  const node = api.getSceneElements().find((element) => element.id === "composition");
  assert.equal(node.customData.status, "completed");
  assert.equal(node.customData.compositionRequestId, null);
  assert.equal(node.customData.lastCompositionRequestId, request.options.idempotencyKey);
  assert.equal(node.customData.resultStorageObjectId, "composition-object");
  assert.equal(node.customData.inputUpdated, false);
  assert.equal(node.customData.compositionInputSignature, canvasVideoCompositionInputSignature(api.getSceneElements(), "composition", node.customData));
  const inserted = api.getSceneElements().find((element) => element.type === "embeddable" && element.link === result.artifact.url);
  assert.equal(inserted.customData.storageObjectId, "composition-object");
  assert.equal(inserted.customData.cloudArchiveStatus, "archived");
});

test("video composition preserves a late artifact but marks the node stale when inputs change during execution", async () => {
  const api = canvasApi(compositionScene());
  await executeCanvasVideoComposition({
    api,
    nodeId: "composition",
    canvasProjectId: "canvas-project",
    async onPersist() { return { source: "cloud" }; },
    async onCompose() {
      const elements = api.getSceneElements();
      api.updateScene({
        elements: elements.map((element) => element.id === "composition"
          ? { ...element, customData: { ...element.customData, fps: 24 } }
          : element),
      });
      return { artifact: { url: "https://cdn.example/late.mp4", storageObjectId: "late-object", mimeType: "video/mp4" } };
    },
  });
  const node = api.getSceneElements().find((element) => element.id === "composition");
  assert.equal(node.customData.status, "completed");
  assert.equal(node.customData.resultStorageObjectId, "late-object");
  assert.equal(node.customData.inputUpdated, true);
  assert.equal(canvasVideoCompositionOutputState(api.getSceneElements(), "composition").ready, false);
});

test("video composition blocks unarchived clips without calling or fabricating a result", async () => {
  const api = canvasApi(compositionScene({ includeUnarchived: true }));
  let calls = 0;
  await assert.rejects(executeCanvasVideoComposition({
    api,
    nodeId: "composition",
    canvasProjectId: "canvas-project",
    async onPersist() { calls += 1; },
    async onCompose() { calls += 1; },
  }), (error) => error.code === "canvas_video_composition_clip_not_archived");
  assert.equal(calls, 0);
  assert.equal(api.getSceneElements().some((element) => element.type === "embeddable" && element.customData?.sourceAction === "new-canvas/video-composition"), false);
});

test("video composition does not call the backend when the running state cannot be saved", async () => {
  const api = canvasApi(compositionScene());
  let calls = 0;
  await assert.rejects(executeCanvasVideoComposition({
    api,
    nodeId: "composition",
    canvasProjectId: "canvas-project",
    async onPersist() { return undefined; },
    async onCompose() { calls += 1; },
  }), (error) => error.code === "canvas_video_composition_save_failed");
  assert.equal(calls, 0);
  const node = api.getSceneElements().find((element) => element.id === "composition");
  assert.equal(node.customData.status, "running");
  assert.match(node.customData.compositionRequestId, /^canvas-video-composition:/);
});

test("video composition rejects incomplete backend artifacts and persists failure", async () => {
  const api = canvasApi(compositionScene());
  const persistedStatuses = [];
  await assert.rejects(executeCanvasVideoComposition({
    api,
    nodeId: "composition",
    canvasProjectId: "canvas-project",
    async onPersist() {
      persistedStatuses.push(api.getSceneElements().find((element) => element.id === "composition").customData.status);
      return { source: "cloud" };
    },
    async onCompose() { return { artifact: { url: "https://cdn.example/incomplete.mp4", mimeType: "video/mp4" } }; },
  }), (error) => error.code === "canvas_video_composition_result_invalid");
  assert.deepEqual(persistedStatuses, ["running", "failed"]);
  assert.equal(api.getSceneElements().some((element) => element.link === "https://cdn.example/incomplete.mp4"), false);
});

test("a lost response keeps the active key and recovery replays with the same idempotency key", async () => {
  const api = canvasApi(compositionScene());
  const keys = [];
  const payloads = [];
  await assert.rejects(executeCanvasVideoComposition({
    api,
    nodeId: "composition",
    canvasProjectId: "canvas-project",
    async onPersist() { return { source: "cloud" }; },
    async onCompose(payload, options) {
      payloads.push(payload);
      keys.push(options.idempotencyKey);
      throw new Error("network unavailable");
    },
  }), /network unavailable/);
  const pending = api.getSceneElements().find((element) => element.id === "composition");
  assert.equal(pending.customData.status, "running");
  assert.equal(pending.customData.compositionRequestId, keys[0]);
  api.updateScene({
    elements: api.getSceneElements().map((element) => element.id === "composition"
      ? { ...element, customData: { ...element.customData, fps: 24 } }
      : element),
  });

  await executeCanvasVideoComposition({
    api,
    nodeId: "composition",
    canvasProjectId: "canvas-project",
    async onPersist() { return { source: "cloud" }; },
    async onCompose(payload, options) {
      payloads.push(payload);
      keys.push(options.idempotencyKey);
      return { artifact: { url: "https://cdn.example/replayed.mp4", storageObjectId: "replayed-object", mimeType: "video/mp4" } };
    },
  });
  assert.deepEqual(keys, [keys[0], keys[0]]);
  assert.deepEqual(payloads, [payloads[0], payloads[0]]);
  const completed = api.getSceneElements().find((element) => element.id === "composition");
  assert.equal(completed.customData.compositionRequestId, null);
  assert.equal(completed.customData.lastCompositionRequestId, keys[0]);
  assert.equal(completed.customData.inputUpdated, true);
  assert.equal(canvasVideoCompositionOutputState(api.getSceneElements(), "composition").ready, false);
});

test("a successful composition clears the active key so a deliberate rerun gets a new key", async () => {
  const api = canvasApi(compositionScene());
  const keys = [];
  const run = () => executeCanvasVideoComposition({
    api,
    nodeId: "composition",
    canvasProjectId: "canvas-project",
    async onPersist() { return { source: "cloud" }; },
    async onCompose(_payload, options) {
      keys.push(options.idempotencyKey);
      return { artifact: { url: `https://cdn.example/success-${keys.length}.mp4`, storageObjectId: `success-object-${keys.length}`, mimeType: "video/mp4" } };
    },
  });
  await run();
  await run();
  assert.equal(keys.length, 2);
  assert.notEqual(keys[0], keys[1]);
  const node = api.getSceneElements().find((element) => element.id === "composition");
  assert.equal(node.customData.lastCompositionRequestId, keys[1]);
  assert.equal(node.customData.compositionRequestId, null);
});

test("an explicit 422 clears the active key and the next attempt gets a new key", async () => {
  const api = canvasApi(compositionScene());
  const keys = [];
  await assert.rejects(executeCanvasVideoComposition({
    api,
    nodeId: "composition",
    canvasProjectId: "canvas-project",
    async onPersist() { return { source: "cloud" }; },
    async onCompose(_payload, options) {
      keys.push(options.idempotencyKey);
      throw Object.assign(new Error("invalid clip"), { status: 422, errorCode: "invalid_composition_clip" });
    },
  }), /invalid clip/);
  const failed = api.getSceneElements().find((element) => element.id === "composition");
  assert.equal(failed.customData.status, "failed");
  assert.equal(failed.customData.compositionRequestId, null);

  await executeCanvasVideoComposition({
    api,
    nodeId: "composition",
    canvasProjectId: "canvas-project",
    async onPersist() { return { source: "cloud" }; },
    async onCompose(_payload, options) {
      keys.push(options.idempotencyKey);
      return { artifact: { url: "https://cdn.example/retry.mp4", storageObjectId: "retry-object", mimeType: "video/mp4" } };
    },
  });
  assert.notEqual(keys[0], keys[1]);
});

test("idempotency processing and transport failures remain recoverable while explicit client failures do not", () => {
  assert.equal(isIndeterminateCanvasVideoCompositionError(Object.assign(new Error("processing"), { status: 409, errorCode: "idempotency_processing" })), true);
  assert.equal(isIndeterminateCanvasVideoCompositionError(new Error("network unavailable")), true);
  assert.equal(isIndeterminateCanvasVideoCompositionError(Object.assign(new Error("invalid"), { status: 422 })), false);
});

test("video composition UI and host use the real endpoint with preflight persistence", () => {
  assert.match(creatorApiSource, /createNewCanvasVideoComposition[\s\S]+"\/api\/new-canvas\/video-compositions"/);
  assert.match(mainSource, /creatorApi\.createNewCanvasVideoComposition\(payload, options\)/);
  assert.match(mainSource, /createNewCanvasVideoComposition\(payload, options\)\.catch[\s\S]+openSharedLoginModal/);
  assert.match(mainSource, /onCompose=\{composeVideoOnCanvas\}/);
  assert.match(editorSource, /const persistCurrentCanvas = useCallback/);
  assert.match(editorSource, /onPersistCanvas=\{persistCurrentCanvas\}/);
  assert.match(panelSource, /空空如也，请连接视频节点后操作/);
  assert.doesNotMatch(panelSource, /合成将按连接顺序读取已归档片段/);
  assert.match(panelSource, /合成视频/);
  assert.match(panelSource, /恢复合成结果/);
  assert.match(panelSource, /disabled=\{compositionSubmitting \|\|/);
  assert.doesNotMatch(panelSource, /disabled=\{compositionRecoverable \|\|/);
  assert.match(panelSource, /<video controls preload="metadata" src=\{data\.resultUrl\}/);
});
