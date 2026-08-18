import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createCanvasMediaToolsController,
  ensureCanvasMediaToolsState,
  persistCanvasMediaRecoveryState,
  refreshCanvasMediaRecoveryState,
  renderCanvasMediaToolsShell,
  shouldDismissMediaDrawer,
} from "../src/features/new-canvas/media-tools-drawer.js";
import { validateUploadFile } from "../src/shared/creator-api.js";

test("Canvas media tools render for selected image nodes", () => {
  const ui = {
    selectedCanvasNodeId: "image-node",
    canvasDocument: { nodes: [{ id: "image-node", type: "image", data: { title: "主图" } }] },
  };
  ensureCanvasMediaToolsState(ui).open = true;
  const shell = renderCanvasMediaToolsShell(ui);
  assert.match(shell, /裁剪/);
  assert.match(shell, /Camera Studio/);
  assert.match(shell, /开始处理/);
  assert.match(shell, /data-media-drawer-grip/);
});

test("Canvas media tools show the selected storage image across every editor", () => {
  const ui = {
    selectedCanvasNodeId: "source-image",
    canvasDocument: {
      nodes: [{ id: "source-image", type: "source-image", data: { title: "待处理原图", storageObjectId: "storage-source" } }],
    },
    canvasMediaTools: { open: true, tool: "outpaint" },
  };
  const state = ensureCanvasMediaToolsState(ui);
  for (const tool of ["outpaint", "remove_background", "free_view", "camera_studio", "slice", "composite", "batch_grid"]) {
    state.tool = tool;
    const shell = renderCanvasMediaToolsShell(ui);
    assert.match(shell, /canvas-media-source-preview/);
    assert.match(shell, /\/api\/storage\/objects\/storage-source\/content\?proxy=1/);
    assert.match(shell, /待处理原图/);
  }

  state.tool = "crop";
  assert.match(renderCanvasMediaToolsShell(ui), /canvas-media-crop-stage[^>]+storage-source/);
  state.tool = "annotation";
  assert.match(renderCanvasMediaToolsShell(ui), /canvas-media-annotation-stage[^>]+storage-source/);
});

test("Canvas mobile media drawer uses a bounded swipe threshold", () => {
  assert.equal(shouldDismissMediaDrawer(71, 640), false);
  assert.equal(shouldDismissMediaDrawer(116, 640), true);
  assert.equal(shouldDismissMediaDrawer(90, 400), true);
});

test("media tool button actions replace only the drawer when it is already open", async () => {
  const previousDocument = globalThis.document;
  let fullRenders = 0;
  let drawerReplaced = false;
  const nextDrawer = { querySelector() { return null; } };
  const currentDrawer = {
    querySelector() { return null; },
    replaceWith() { drawerReplaced = true; },
  };
  const surface = {
    querySelector(selector) {
      return selector === ".canvas-media-tools-backdrop" ? currentDrawer : null;
    },
  };
  globalThis.document = {
    createElement() {
      const template = { content: { firstElementChild: nextDrawer } };
      Object.defineProperty(template, "innerHTML", { set() {} });
      return template;
    },
  };
  try {
    const ui = {
      selectedCanvasNodeId: "image-node",
      canvasDocument: { nodes: [{ id: "image-node", type: "image", data: {} }] },
      canvasMediaTools: { open: true, tool: "crop" },
    };
    const controller = createCanvasMediaToolsController({
      surface,
      workbench: { ui },
      render() { fullRenders += 1; },
    });

    await controller.handleAction({ dataset: { mediaAction: "select-tool", mediaTool: "annotation" } });

    assert.equal(ensureCanvasMediaToolsState(ui).tool, "annotation");
    assert.equal(drawerReplaced, true);
    assert.equal(fullRenders, 0);
    controller.dispose();
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("Canvas crop number inputs update the preview selection immediately", () => {
  const selection = { style: {} };
  const cropInputs = [];
  const surface = {
    querySelector(selector) {
      return selector === ".canvas-media-crop-selection" ? selection : null;
    },
    querySelectorAll(selector) {
      return selector === "[data-media-field^='crop']" ? cropInputs : [];
    },
  };
  const ui = {
    selectedCanvasNodeId: "source-image-node",
    canvasDocument: { nodes: [{ id: "source-image-node", type: "source-image", data: {} }] },
    canvasMediaTools: { open: true, tool: "crop" },
  };
  const controller = createCanvasMediaToolsController({ surface, workbench: { ui }, render() {} });

  controller.handleInput({ dataset: { mediaField: "cropWidth" }, type: "number", value: "50" });

  assert.equal(selection.style.width, "50%");
  controller.dispose();
});

test("Canvas local crop waits for the new node to be persisted", async () => {
  const previousDocument = globalThis.document;
  const previousImage = globalThis.Image;
  const calls = [];
  globalThis.Image = class {
    naturalWidth = 800;
    naturalHeight = 600;
    set src(value) {
      this.currentSrc = value;
      this.onload?.();
    }
  };
  globalThis.document = {
    createElement(tagName) {
      assert.equal(tagName, "canvas");
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage() {} }),
        toBlob: (callback) => callback(new Blob(["cropped"], { type: "image/png" })),
      };
    },
  };
  try {
    const ui = {
      selectedCanvasProjectId: "canvas-crop",
      selectedCanvasNodeId: "source-image-node",
      canvasDocument: {
        version: 1,
        nodes: [{
          id: "source-image-node",
          type: "source-image",
          position: { x: 10, y: 20 },
          size: { width: 300, height: 300 },
          data: { url: "/api/storage/objects/source/content?proxy=1" },
        }],
        edges: [],
      },
      canvasMediaTools: { open: true, tool: "crop" },
    };
    const workbench = {
      ui,
      api: {
        async uploadFile(_file, options) {
          calls.push(["upload", options]);
          return { upload: { storageObjectId: "crop-storage" } };
        },
      },
      updateCanvasDocument(document, options) {
        calls.push(["update", options]);
        ui.canvasDocument = document;
      },
      async saveCanvasNow() {
        calls.push(["save", ui.canvasDocument.nodes.at(-1)?.data?.storageObjectId]);
      },
      async refreshCanvasSurface() {
        calls.push(["refresh"]);
      },
    };
    const controller = createCanvasMediaToolsController({ surface: {}, workbench, render() {} });
    const state = ensureCanvasMediaToolsState(ui);

    await controller.handleAction({ dataset: { mediaAction: "submit" } });

    assert.deepEqual(calls[0][1], {
      category: "canvas-derivations",
      projectId: null,
      canvasProjectId: "canvas-crop",
    });
    assert.deepEqual(calls.slice(1), [
      ["update", { scheduleSave: false }],
      ["save", "crop-storage"],
      ["refresh"],
    ]);
    assert.equal(ui.canvasDocument.nodes.at(-1).data.url, "/api/storage/objects/crop-storage/content?proxy=1");
    assert.equal(state.status, "completed");
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousImage === undefined) delete globalThis.Image;
    else globalThis.Image = previousImage;
  }
});

test("Canvas media tools create a derivation, generation task, and task binding", async () => {
  const calls = [];
  const ui = {
    selectedCanvasProjectId: "canvas-1",
    selectedCanvasNodeId: "image-node",
    canvasServerRevision: 7,
    canvasGenerationModelCode: "image-model",
    canvasDocument: {
      nodes: [{
        id: "image-node",
        type: "image",
        data: { storageObjectId: "storage-1", url: "https://cdn.test/source.png", modelCode: "image-model" },
      }],
    },
  };
  const workbench = {
    ui,
    api: {
      async startCanvasMediaDerivation(canvasId, input) {
        calls.push(["start", canvasId, input]);
        return { derivation: { id: "derivation-1" } };
      },
      async createImageGenerationTask(input) {
        calls.push(["generate", input]);
        return { taskId: "task-1" };
      },
      async attachCanvasMediaDerivationTask(canvasId, derivationId, taskId) {
        calls.push(["attach", canvasId, derivationId, taskId]);
        return { derivation: { id: derivationId, taskId } };
      },
    },
  };
  let renders = 0;
  const controller = createCanvasMediaToolsController({ surface: {}, workbench, render: () => { renders += 1; } });
  const state = ensureCanvasMediaToolsState(ui);
  state.tool = "outpaint";
  state.instruction = "向外扩展画面";
  await controller.handleAction({ dataset: { mediaAction: "submit" } });

  assert.equal(calls[0][0], "start");
  assert.equal(calls[0][2].baseCanvasRevision, 7);
  assert.deepEqual(calls[0][2].source, { assetId: null, assetVersionId: null, storageObjectId: "storage-1" });
  assert.equal(calls[1][0], "generate");
  assert.equal(calls[1][1].parameters.derivationId, "derivation-1");
  assert.deepEqual(calls[2], ["attach", "canvas-1", "derivation-1", "task-1"]);
  assert.equal(state.status, "running");
  assert.equal(renders >= 2, true);
});

test("Canvas outpaint exposes image models and submits the selected model", async () => {
  let generationInput = null;
  const ui = {
    selectedCanvasProjectId: "canvas-1",
    selectedCanvasNodeId: "image-node",
    episodeGenerationConfig: {
      defaultImageModelCode: "image-fast",
      models: [
        { modelCode: "image-fast", modelLabel: "快速图片模型", mediaType: "image" },
        { modelCode: "image-quality", modelLabel: "高质量图片模型", mediaType: "image" },
      ],
    },
    canvasDocument: {
      nodes: [{ id: "image-node", type: "image", data: { storageObjectId: "storage-1", url: "/source.png" } }],
    },
    canvasMediaTools: { open: true, tool: "outpaint" },
  };
  const workbench = {
    ui,
    api: {
      async startCanvasMediaDerivation() { return { derivation: { id: "derivation-outpaint" } }; },
      async createImageGenerationTask(input) { generationInput = input; return { taskId: "task-outpaint" }; },
      async attachCanvasMediaDerivationTask() {},
    },
  };
  const controller = createCanvasMediaToolsController({ surface: {}, workbench, render() {} });
  const state = ensureCanvasMediaToolsState(ui);

  assert.match(renderCanvasMediaToolsShell(ui), /data-media-field="generationModelCode"/);
  assert.match(renderCanvasMediaToolsShell(ui), /高质量图片模型/);
  controller.handleInput({ dataset: { mediaField: "generationModelCode" }, type: "select-one", value: "image-quality" });
  await controller.handleAction({ dataset: { mediaAction: "submit" } });

  assert.equal(state.status, "running");
  assert.equal(generationInput.model, "image-quality");
  controller.dispose();
});

test("Canvas crop is processed locally and never calls model generation APIs", async () => {
  const previousDocument = globalThis.document;
  const previousImage = globalThis.Image;
  const calls = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext() {
      return { drawImage(...args) { calls.push(["drawImage", ...args.slice(1)]); } };
    },
    toBlob(callback) {
      calls.push(["toBlob", this.width, this.height]);
      callback(new Blob(["crop"], { type: "image/png" }));
    },
  };
  globalThis.document = { createElement() { return canvas; } };
  globalThis.Image = class {
    naturalWidth = 800;
    naturalHeight = 600;
    set src(value) {
      this.source = value;
      queueMicrotask(() => this.onload?.());
    }
  };
  try {
    const ui = {
      selectedCanvasProjectId: "canvas-1",
      selectedCanvasNodeId: "image-node",
      canvasDocument: {
        nodes: [{
          id: "image-node",
          type: "source-image",
          position: { x: 40, y: 60 },
          size: { width: 320, height: 180 },
          data: { url: "/uploads/source.png", mediaKind: "image" },
        }],
        edges: [],
      },
      canvasMediaTools: { open: true, tool: "crop", cropX: 10, cropY: 20, cropWidth: 50, cropHeight: 40 },
    };
    const workbench = {
      ui,
      api: {
        async uploadFile(file, options) {
          calls.push(["upload", file, options]);
          return { upload: { storageObjectId: "cropped-storage", previewUrl: "/uploads/cropped.png" } };
        },
        async startCanvasMediaDerivation() { throw new Error("model_api_must_not_be_called"); },
        async createImageGenerationTask() { throw new Error("model_api_must_not_be_called"); },
      },
    };
    const controller = createCanvasMediaToolsController({ surface: {}, workbench, render() {} });
    const state = ensureCanvasMediaToolsState(ui);
    await controller.handleAction({ dataset: { mediaAction: "submit" } });

    assert.deepEqual(calls[0], ["drawImage", 80, 120, 400, 240, 0, 0, 400, 240]);
    assert.deepEqual(calls[1], ["toBlob", 400, 240]);
    assert.equal(calls[2][0], "upload");
    assert.equal(state.status, "completed");
    assert.equal(ui.canvasDocument.nodes.length, 2);
    assert.equal(ui.canvasDocument.nodes.at(-1).data.storageObjectId, "cropped-storage");
    controller.dispose();
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousImage === undefined) delete globalThis.Image;
    else globalThis.Image = previousImage;
  }
});

test("Canvas media tools include professional parameters in derivation snapshots", async () => {
  const snapshots = [];
  const ui = {
    selectedCanvasProjectId: "canvas-1",
    selectedCanvasNodeId: "image-node",
    canvasDocument: {
      nodes: [{ id: "image-node", type: "image", data: { storageObjectId: "storage-1", modelCode: "image-model" } }],
    },
    canvasAssets: [{ artifactId: "artifact-secondary", mediaKind: "image", assetId: "asset-secondary", assetVersionId: "version-secondary" }],
  };
  const workbench = {
    ui,
    api: {
      async startCanvasMediaDerivation(_canvasId, input) {
        snapshots.push(input.requestSnapshot);
        return { derivation: { id: `derivation-${snapshots.length}` } };
      },
      async createImageGenerationTask() {
        return { taskId: `task-${snapshots.length}` };
      },
      async attachCanvasMediaDerivationTask() {},
    },
  };
  const controller = createCanvasMediaToolsController({ surface: {}, workbench, render() {} });
  const state = ensureCanvasMediaToolsState(ui);
  const cases = [
    ["remove_background", { backgroundFeatherPixels: 12, preserveShadow: false }, "removeBackground", { featherPixels: 12, preserveShadow: false }],
    ["free_view", { viewAzimuthDegrees: 35, viewElevationDegrees: -12, viewDistanceScale: 1.4 }, "camera", { azimuthDegrees: 35, elevationDegrees: -12, distanceScale: 1.4 }],
    ["camera_studio", { cameraFocalLengthMm: 85, cameraAperture: 1.8, cameraLightingPreset: "rim_light" }, "cameraStudio", {
      focalLengthMm: 85,
      aperture: 1.8,
      lightingPreset: "rim_light",
      mode: "camera",
      activeControl: "camera",
      camera: {
        yawDegrees: 0,
        pitchDegrees: 0,
        rollDegrees: 0,
        distance: "medium",
        lens: "35mm",
        promptEnhance: true,
      },
      light: {
        yawDegrees: 45,
        pitchDegrees: 30,
        intensityPercent: 65,
        temperature: "neutral",
        rimLight: false,
        fillLight: true,
      },
      prompt: "front camera view, eye-level shot, medium-shot framing, 35mm cinematic lens, cinematic composition, coherent subject identity, high detail",
    }],
  ];

  for (const [tool, values, snapshotKey, expected] of cases) {
    Object.assign(state, values, { tool });
    await controller.handleAction({ dataset: { mediaAction: "submit" } });
    assert.deepEqual(snapshots.at(-1)[snapshotKey], expected);
  }

  state.open = true;
  state.tool = "camera_studio";
  assert.match(renderCanvasMediaToolsShell(ui), /焦距 mm/);
  assert.match(renderCanvasMediaToolsShell(ui), /摄影机/);
  assert.match(renderCanvasMediaToolsShell(ui), /右前 3\/4/);
  assert.match(renderCanvasMediaToolsShell(ui), /STUDIO PROMPT/);
  await controller.handleAction({ dataset: { mediaAction: "camera-studio-mode", cameraStudioMode: "lighting" } });
  assert.match(renderCanvasMediaToolsShell(ui), /三点布光/);
  assert.match(renderCanvasMediaToolsShell(ui), /灯光预设/);
});

test("Canvas Camera Studio matches upstream camera, lighting, and linked controls", async () => {
  const yawOutput = { dataset: { suffix: "°" }, textContent: "" };
  const promptOutput = { textContent: "" };
  const copyButton = { textContent: "已复制" };
  const surface = {
    querySelector(selector) {
      if (selector === '[data-media-output="cameraYawDegrees"]') return yawOutput;
      if (selector === "[data-camera-studio-prompt]") return promptOutput;
      if (selector === '[data-media-action="camera-studio-copy"]') return copyButton;
      return null;
    },
  };
  const ui = {
    selectedCanvasNodeId: "image-node",
    canvasDocument: { nodes: [{ id: "image-node", type: "image", data: {} }] },
    canvasMediaTools: { open: true, tool: "camera_studio" },
  };
  const controller = createCanvasMediaToolsController({ surface, workbench: { ui }, render() {} });
  const state = ensureCanvasMediaToolsState(ui);

  await controller.handleAction({ dataset: { mediaAction: "camera-studio-mode", cameraStudioMode: "dual" } });
  await controller.handleAction({ dataset: { mediaAction: "camera-studio-control", cameraStudioControl: "lighting" } });
  await controller.handleAction({ dataset: { mediaAction: "camera-studio-preset", cameraStudioPreset: "light:top" } });

  assert.equal(state.cameraStudioMode, "dual");
  assert.equal(state.cameraStudioActiveControl, "lighting");
  assert.deepEqual([state.lightYawDegrees, state.lightPitchDegrees], [0, 72]);
  assert.match(renderCanvasMediaToolsShell(ui), /主光源参数/);
  assert.match(renderCanvasMediaToolsShell(ui), /柔和补光/);

  await controller.handleAction({ dataset: { mediaAction: "camera-studio-control", cameraStudioControl: "camera" } });
  await controller.handleAction({ dataset: { mediaAction: "camera-studio-preset", cameraStudioPreset: "camera:dutch" } });
  assert.deepEqual(
    [state.cameraYawDegrees, state.cameraPitchDegrees, state.cameraRollDegrees, state.cameraLens],
    [25, 4, 18, "35mm"],
  );
  assert.match(renderCanvasMediaToolsShell(ui), /18 degree dutch angle/);

  controller.handleInput({ dataset: { mediaField: "cameraYawDegrees" }, type: "range", value: "90" });
  assert.equal(state.cameraYawDegrees, 90);
  assert.equal(yawOutput.textContent, "90°");
  assert.match(promptOutput.textContent, /right profile camera view/);
  assert.equal(copyButton.textContent, "复制提示词");

  await controller.handleAction({ dataset: { mediaAction: "camera-studio-reset" } });
  assert.equal(state.cameraStudioMode, "camera");
  assert.deepEqual([state.cameraYawDegrees, state.cameraPitchDegrees, state.cameraRollDegrees], [0, 0, 0]);
});

test("Canvas crop stage supports pointer resizing and keyboard movement", () => {
  const ui = {
    selectedCanvasNodeId: "image-node",
    canvasDocument: { nodes: [{ id: "image-node", type: "image", data: { url: "/content/source.png" } }] },
    canvasMediaTools: { open: true, tool: "crop", cropX: 10, cropY: 10, cropWidth: 50, cropHeight: 50 },
  };
  const stage = { getBoundingClientRect: () => ({ width: 400, height: 200 }) };
  const handle = {
    dataset: { mediaCropHandle: "se" },
    closest(selector) { return selector === "[data-media-crop-handle]" ? this : stage; },
    setPointerCapture() {},
    releasePointerCapture() {},
  };
  const selection = { style: {} };
  const surface = {
    querySelector(selector) { return selector === ".canvas-media-crop-selection" ? selection : stage; },
    querySelectorAll() { return []; },
  };
  const controller = createCanvasMediaToolsController({ surface, workbench: { ui }, render() {} });
  const state = ensureCanvasMediaToolsState(ui);

  assert.match(renderCanvasMediaToolsShell(ui), /data-media-crop-handle="se"/);
  assert.equal(controller.handlePointerDown({ pointerId: 1, clientX: 100, clientY: 100 }, handle), true);
  assert.equal(controller.handlePointerMove({ pointerId: 1, clientX: 140, clientY: 120 }, handle), true);
  assert.deepEqual([state.cropWidth, state.cropHeight], [60, 60]);
  controller.handlePointerUp({ pointerId: 1 }, handle);

  let prevented = false;
  assert.equal(controller.handleKeydown({ key: "ArrowLeft", preventDefault() { prevented = true; } }, handle), true);
  assert.equal(prevented, true);
  assert.equal(state.cropWidth, 59);
});

test("Canvas media drawer ignores clicks inside its backdrop and skips redraws for unchanged crops", async () => {
  let renders = 0;
  const ui = {
    selectedCanvasNodeId: "image-node",
    canvasDocument: { nodes: [{ id: "image-node", type: "image", data: {} }] },
    canvasMediaTools: { open: true, tool: "crop" },
  };
  const stage = { getBoundingClientRect: () => ({ width: 400, height: 200 }) };
  const handle = {
    dataset: { mediaCropHandle: "move" },
    closest(selector) { return selector === "[data-media-crop-handle]" ? this : stage; },
    setPointerCapture() {},
    releasePointerCapture() {},
  };
  const backdrop = {
    dataset: { mediaAction: "close" },
    matches(selector) { return selector === ".canvas-media-tools-backdrop"; },
  };
  const controller = createCanvasMediaToolsController({
    surface: { querySelector: () => null, querySelectorAll: () => [] },
    workbench: { ui },
    render() { renders += 1; },
  });
  const state = ensureCanvasMediaToolsState(ui);

  await controller.handleAction(backdrop, { target: {} });
  assert.equal(state.open, true);

  assert.equal(controller.handlePointerDown({ pointerId: 1, clientX: 100, clientY: 100 }, handle), true);
  assert.equal(controller.handlePointerUp({ pointerId: 1 }, handle), true);
  assert.equal(renders, 0);
});

test("Canvas composite is processed locally and never calls model generation APIs", async () => {
  const previousDocument = globalThis.document;
  const previousImage = globalThis.Image;
  const calls = [];
  globalThis.Image = class {
    naturalWidth = 320;
    naturalHeight = 240;
    set src(value) {
      this.source = value;
      queueMicrotask(() => this.onload?.());
    }
  };
  globalThis.document = {
    createElement() {
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage(...args) { calls.push(["drawImage", ...args.slice(1)]); },
          save() {},
          restore() {},
        }),
        toBlob(callback) { calls.push(["toBlob", this.width, this.height]); callback(new Blob(["composite"], { type: "image/png" })); },
      };
    },
  };
  const ui = {
    selectedCanvasProjectId: "canvas-composite",
    selectedCanvasNodeId: "image-node",
    canvasDocument: { nodes: [{ id: "image-node", type: "image", position: { x: 0, y: 0 }, data: { url: "/source.png" } }] },
    canvasAssets: [{ artifactId: "artifact-2", mediaKind: "image", title: "第二张", assetId: "asset-2", assetVersionId: "version-2", storageObjectId: "storage-2" }],
  };
  const workbench = {
    ui,
    api: {
      async uploadFile() { calls.push(["upload"]); return { upload: { storageObjectId: "composite-storage" } }; },
      async startCanvasMediaDerivation() { throw new Error("model_api_must_not_be_called"); },
      async createImageGenerationTask() { throw new Error("model_api_must_not_be_called"); },
    },
  };
  try {
    const controller = createCanvasMediaToolsController({ surface: {}, workbench, render() {} });
    const state = ensureCanvasMediaToolsState(ui);
    state.tool = "composite";
    controller.handleInput({ dataset: { mediaField: "compositeSecondaryArtifactId" }, type: "select-one", value: "artifact-2" });
    await controller.handleAction({ dataset: { mediaAction: "submit" } });

    assert.equal(calls.at(-1)[0], "upload");
    assert.equal(state.status, "completed");
    assert.equal(ui.canvasDocument.nodes.length, 2);
    assert.equal(ui.canvasDocument.nodes.at(-1).data.storageObjectId, "composite-storage");
    controller.dispose();
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousImage === undefined) delete globalThis.Image;
    else globalThis.Image = previousImage;
  }
});

test("Canvas slice is processed locally and creates one node per tile", async () => {
  const previousDocument = globalThis.document;
  const previousImage = globalThis.Image;
  const uploads = [];
  globalThis.Image = class {
    naturalWidth = 800;
    naturalHeight = 600;
    set src(value) { this.source = value; queueMicrotask(() => this.onload?.()); }
  };
  globalThis.document = {
    createElement() {
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage() {} }),
        toBlob(callback) { callback(new Blob(["slice"], { type: "image/png" })); },
      };
    },
  };
  try {
    const ui = {
      selectedCanvasProjectId: "canvas-slice",
      selectedCanvasNodeId: "image-node",
      canvasDocument: { nodes: [{ id: "image-node", type: "source-image", data: { url: "/source.png" } }], edges: [] },
      canvasMediaTools: { tool: "slice", sliceRows: 2, sliceColumns: 2, sliceGapPixels: 8 },
    };
    const workbench = {
      ui,
      api: {
        async uploadFile() { const id = `slice-${uploads.length + 1}`; uploads.push(id); return { upload: { storageObjectId: id } }; },
        async startCanvasMediaDerivation() { throw new Error("model_api_must_not_be_called"); },
        async createImageGenerationTask() { throw new Error("model_api_must_not_be_called"); },
      },
    };
    const controller = createCanvasMediaToolsController({ surface: {}, workbench, render() {} });
    const state = ensureCanvasMediaToolsState(ui);
    await controller.handleAction({ dataset: { mediaAction: "submit" } });
    assert.equal(state.status, "completed");
    assert.equal(uploads.length, 4);
    assert.equal(ui.canvasDocument.nodes.length, 5);
    assert.equal(ui.canvasDocument.nodes.at(-1).data.source, "canvas_slice");
    controller.dispose();
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousImage === undefined) delete globalThis.Image;
    else globalThis.Image = previousImage;
  }
});

test("Canvas vector annotation uploads structured strokes", async () => {
  let uploadedPayload = null;
  let layerInput = null;
  const context = { beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, clearRect() {} };
  const canvas = {
    width: 640,
    height: 360,
    matches: (selector) => selector === "[data-media-annotation-canvas]",
    getContext: () => context,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }),
    setPointerCapture() {},
    releasePointerCapture() {},
  };
  const ui = {
    selectedCanvasProjectId: "canvas-vector",
    selectedCanvasNodeId: "image-node",
    canvasDocument: { nodes: [{ id: "image-node", type: "image", data: { assetId: "asset-1", assetVersionId: "version-1" } }] },
  };
  const workbench = {
    ui,
    api: {
      async uploadFile(file, options) {
        validateUploadFile(file, options.uploadLimits);
        uploadedPayload = JSON.parse(await file.text());
        return { upload: { storageObjectId: "vector-storage" } };
      },
      async createCanvasAnnotationLayer(_canvasId, input) { layerInput = input; return { layer: { id: "vector-layer" } }; },
    },
  };
  const controller = createCanvasMediaToolsController({ surface: { querySelector: () => canvas }, workbench, render() {} });
  const state = ensureCanvasMediaToolsState(ui);
  state.tool = "annotation";
  state.layerKind = "vector_annotation";
  controller.handlePointerDown({ clientX: 10, clientY: 20, pointerId: 1 }, canvas);
  controller.handlePointerMove({ clientX: 30, clientY: 40, pointerId: 1 }, canvas);
  controller.handlePointerUp({ pointerId: 1 }, canvas);
  await controller.handleAction({ dataset: { mediaAction: "submit" } });

  assert.equal(uploadedPayload.version, 1);
  assert.equal(uploadedPayload.strokes[0].points.length, 2);
  assert.equal(layerInput.layerKind, "vector_annotation");
  assert.deepEqual(layerInput.metadata, { width: 640, height: 360, format: "canvas-vector-v1", strokeCount: 1 });
});

test("Canvas annotation uploads the raster and creates a recoverable layer", async () => {
  const calls = [];
  const annotationCanvas = {
    width: 640,
    height: 360,
    toBlob(callback) {
      callback(new Blob(["annotation"], { type: "image/png" }));
    },
  };
  const ui = {
    selectedCanvasProjectId: "canvas-annotation",
    selectedCanvasNodeId: "image-node",
    canvasDocument: {
      nodes: [{ id: "image-node", type: "image", data: { assetId: "asset-1", assetVersionId: "version-1" } }],
    },
  };
  const workbench = {
    ui,
    api: {
      async uploadFile(file, options) {
        validateUploadFile(file, options.uploadLimits);
        calls.push(["upload", file.type, options]);
        return { upload: { storageObjectId: "annotation-storage-1" } };
      },
      async createCanvasAnnotationLayer(canvasId, input) {
        calls.push(["layer", canvasId, input]);
        return { layer: { id: "layer-1" } };
      },
    },
  };
  const controller = createCanvasMediaToolsController({
    surface: { querySelector: () => annotationCanvas },
    workbench,
    render() {},
  });
  const state = ensureCanvasMediaToolsState(ui);
  state.tool = "annotation";
  state.layerKind = "raster_annotation";

  await controller.handleAction({ dataset: { mediaAction: "submit" } });

  assert.deepEqual(calls[0].slice(0, 2), ["upload", "image/png"]);
  assert.equal(calls[0][2].category, "canvas-annotations");
  assert.equal(calls[0][2].projectId, null);
  assert.deepEqual(calls[1], ["layer", "canvas-annotation", {
    nodeKey: "image-node",
    layerKind: "raster_annotation",
    sourceAssetId: "asset-1",
    sourceAssetVersionId: "version-1",
    layerStorageObjectId: "annotation-storage-1",
    projectionPolicy: "retain",
    metadata: { width: 640, height: 360 },
  }]);
  assert.equal(state.annotationLayerId, "layer-1");
  assert.equal(state.status, "completed");
});

test("Canvas annotation fails explicitly when canvas encoding is unavailable", async () => {
  const ui = {
    selectedCanvasProjectId: "canvas-annotation",
    selectedCanvasNodeId: "image-node",
    canvasDocument: { nodes: [{ id: "image-node", type: "image", data: { storageObjectId: "storage-1" } }] },
  };
  const controller = createCanvasMediaToolsController({
    surface: { querySelector: () => ({ width: 640, height: 360 }) },
    workbench: {
      ui,
      api: { async uploadFile() {}, async createCanvasAnnotationLayer() {} },
    },
    render() {},
  });
  const state = ensureCanvasMediaToolsState(ui);
  state.tool = "annotation";

  await controller.handleAction({ dataset: { mediaAction: "submit" } });

  assert.equal(state.status, "failed");
  assert.equal(state.error, "canvas_annotation_encode_unavailable");
});

test("Canvas image batch creates a group and selects its primary artifact", async () => {
  const calls = [];
  const ui = {
    selectedCanvasProjectId: "canvas-batch",
    selectedCanvasNodeId: "image-node",
    canvasAssets: [
      { artifactId: "artifact-1", nodeKey: "image-node", mediaKind: "image", title: "结果一" },
      { artifactId: "artifact-2", nodeKey: "image-node", mediaKind: "image", title: "结果二" },
    ],
    canvasDocument: { nodes: [{ id: "image-node", type: "image", data: {} }] },
  };
  const workbench = {
    ui,
    api: {
      async createCanvasImageBatchGroup(canvasId, input) {
        calls.push(["create", canvasId, input]);
        return {
          group: {
            id: "group-1",
            status: "processing",
            items: [{ artifactId: "artifact-1" }, { artifactId: "artifact-2" }],
          },
        };
      },
      async selectCanvasImageBatchArtifact(canvasId, groupId, input) {
        calls.push(["select", canvasId, groupId, input]);
      },
    },
  };
  const controller = createCanvasMediaToolsController({ surface: {}, workbench, render() {} });
  const state = ensureCanvasMediaToolsState(ui);
  state.tool = "batch_grid";
  controller.handleInput({ dataset: { mediaField: "batchArtifact" }, value: "artifact-1", checked: true });
  controller.handleInput({ dataset: { mediaField: "batchArtifact" }, value: "artifact-2", checked: true });

  await controller.handleAction({ dataset: { mediaAction: "submit" } });
  assert.deepEqual(calls[0], ["create", "canvas-batch", {
    nodeKey: "image-node",
    artifacts: [
      { artifactId: "artifact-1", parameters: { batchIndex: 0 } },
      { artifactId: "artifact-2", parameters: { batchIndex: 1 } },
    ],
  }]);
  assert.equal(state.status, "running");

  await controller.handleAction({ dataset: { mediaAction: "select-batch-artifact", artifactId: "artifact-2" } });
  assert.deepEqual(calls[1], ["select", "canvas-batch", "group-1", { artifactId: "artifact-2" }]);
  assert.equal(state.batchGroup.selectedArtifactId, "artifact-2");

  state.open = true;
  const shell = renderCanvasMediaToolsShell(ui);
  assert.match(shell, /宫格分组/);
  assert.match(shell, /group-1/);
  assert.match(shell, /artifact-2[^>]*" disabled>主结果/);
});

test("Canvas media host binds and removes annotation pointer listeners", () => {
  const source = readFileSync(new URL("../src/features/new-canvas/index.js", import.meta.url), "utf8");
  for (const eventName of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
    assert.match(source, new RegExp(`addEventListener\\("${eventName}"`));
    assert.match(source, new RegExp(`removeEventListener\\("${eventName}"`));
  }
});

test("Canvas annotation pointer handlers draw, release capture, and reset on dispose", () => {
  const operations = [];
  const context = {
    beginPath() { operations.push("begin"); },
    moveTo() { operations.push("moveTo"); },
    lineTo() { operations.push("lineTo"); },
    stroke() { operations.push("stroke"); },
  };
  const canvas = {
    width: 640,
    height: 360,
    matches: (selector) => selector === "[data-media-annotation-canvas]",
    getContext: () => context,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 180 }),
    setPointerCapture: (pointerId) => operations.push(`capture:${pointerId}`),
    releasePointerCapture: (pointerId) => operations.push(`release:${pointerId}`),
  };
  let removed = false;
  const ui = {};
  const controller = createCanvasMediaToolsController({
    surface: { querySelector: () => ({ remove() { removed = true; } }) },
    workbench: { ui },
    render() {},
  });
  const state = ensureCanvasMediaToolsState(ui);

  assert.equal(controller.handlePointerDown({ clientX: 16, clientY: 18, pointerId: 7 }, canvas), true);
  assert.equal(controller.handlePointerMove({ clientX: 20, clientY: 22, pointerId: 7 }, canvas), true);
  assert.equal(controller.handlePointerUp({ pointerId: 7 }, canvas), true);
  assert.deepEqual(operations, ["begin", "moveTo", "capture:7", "lineTo", "stroke", "release:7"]);

  controller.handlePointerDown({ clientX: 16, clientY: 18, pointerId: 8 }, canvas);
  controller.dispose();
  assert.equal(state.annotationDrawing, false);
  assert.equal(removed, true);
});

test("Canvas annotation supports erase, undo, and loading the persisted layer list", async () => {
  const operations = [];
  const snapshot = { id: "snapshot-1" };
  const context = {
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() { operations.push(this.globalCompositeOperation); },
    getImageData() { return snapshot; }, clearRect() { operations.push("clear"); },
    putImageData(value) { operations.push(`restore:${value.id}`); },
  };
  const canvas = {
    width: 640, height: 360,
    matches: (selector) => selector === "[data-media-annotation-canvas]",
    getContext: () => context,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }),
    setPointerCapture() {}, releasePointerCapture() {},
  };
  const ui = {
    selectedCanvasProjectId: "canvas-layers",
    selectedCanvasNodeId: "image-node",
    canvasDocument: { nodes: [{ id: "image-node", type: "image", data: {} }] },
  };
  const workbench = {
    ui,
    api: {
      async listCanvasAnnotationLayers(canvasId, input) {
        assert.equal(canvasId, "canvas-layers");
        assert.equal(input.nodeKey, "image-node");
        return { layers: [{ id: "layer-1", layerKind: "mask", status: "active", previewUrl: "https://cdn.test/layer.png" }] };
      },
    },
  };
  const surface = {
    querySelector(selector) { return selector === "[data-media-annotation-canvas]" ? canvas : null; },
    querySelectorAll() { return []; },
  };
  const controller = createCanvasMediaToolsController({ surface, workbench, render() {} });
  const state = ensureCanvasMediaToolsState(ui);
  state.open = true;
  await controller.handleAction({ dataset: { mediaAction: "select-tool", mediaTool: "annotation" } });
  assert.equal(state.annotationLayers.length, 1);
  assert.match(renderCanvasMediaToolsShell(ui), /data-layer-id="layer-1"/);

  await controller.handleAction({ dataset: { mediaAction: "annotation-mode", annotationMode: "erase" } });
  controller.handlePointerDown({ clientX: 10, clientY: 10, pointerId: 1 }, canvas);
  controller.handlePointerMove({ clientX: 20, clientY: 20, pointerId: 1 }, canvas);
  controller.handlePointerUp({ pointerId: 1 }, canvas);
  assert.equal(operations.includes("destination-out"), true);
  await controller.handleAction({ dataset: { mediaAction: "annotation-undo" } });
  assert.equal(operations.includes("restore:snapshot-1"), true);
});

test("Canvas annotation loads a persisted raster layer and rerenders its state", async () => {
  const operations = [];
  const context = {
    clearRect() {},
    drawImage() { operations.push("draw-image"); },
  };
  const canvas = {
    width: 640,
    height: 360,
    getContext: () => context,
  };
  const ui = {
    selectedCanvasProjectId: "canvas-layers",
    selectedCanvasNodeId: "image-node",
    canvasDocument: { nodes: [{ id: "image-node", type: "image", data: { url: "https://cdn.test/source.png" } }] },
  };
  const workbench = { ui, api: {} };
  const surface = { querySelector: () => canvas };
  const previousImage = globalThis.Image;
  globalThis.Image = class {
    set src(value) {
      this.url = value;
      queueMicrotask(() => this.onload?.());
    }
  };
  try {
    const controller = createCanvasMediaToolsController({ surface, workbench, render() {} });
    const state = ensureCanvasMediaToolsState(ui);
    state.open = true;
    state.tool = "annotation";
    state.annotationLayers = [{ id: "layer-1", layerKind: "mask", previewUrl: "https://cdn.test/layer.png" }];

    await controller.handleAction({ dataset: { mediaAction: "load-annotation-layer", layerId: "layer-1" } });

    assert.deepEqual(operations, ["draw-image"]);
    assert.equal(state.annotationLayerId, "layer-1");
    assert.equal(state.error, "");
    assert.match(renderCanvasMediaToolsShell(ui), /canvas-media-layer-preview/);
    controller.dispose();
  } finally {
    if (previousImage === undefined) delete globalThis.Image;
    else globalThis.Image = previousImage;
  }
});

test("Canvas media tools expose persisted derivation and task recovery state", () => {
  const ui = {
    selectedCanvasNodeId: "image-node",
    canvasDocument: { nodes: [{ id: "image-node", type: "image", data: {} }] },
    canvasMediaTools: {
      open: true,
      status: "idle",
      derivationId: "derivation-recovered",
      taskId: "task-recovered",
    },
  };

  const state = ensureCanvasMediaToolsState(ui);
  const shell = renderCanvasMediaToolsShell(ui);

  assert.equal(state.status, "running");
  assert.match(shell, /已恢复的媒体任务/);
  assert.match(shell, /derivation-recovered/);
  assert.match(shell, /task-recovered/);
  assert.match(shell, /处理中/);
});

test("Canvas media recovery persists stable IDs in the principal session and refreshes terminal state", async () => {
  const calls = [];
  const ui = {
    selectedCanvasProjectId: "canvas-recovery",
    selectedCanvasNodeId: "image-node",
    canvasServerRevision: 9,
    canvasDocument: { viewport: { x: 12, y: 24, zoom: 1.2 }, nodes: [{ id: "image-node", type: "image", data: {} }] },
    canvasSessionUiState: {},
  };
  const workbench = {
    ui,
    api: {
      async saveCanvasSession(canvasId, input) {
        calls.push(["save", canvasId, input]);
        return { session: input };
      },
      async getCanvasMediaDerivation(canvasId, derivationId) {
        calls.push(["derivation", canvasId, derivationId]);
        return { derivation: { id: derivationId, task_id: "task-recovered", status: "succeeded" } };
      },
      async getCanvasImageBatchGroup(canvasId, groupId) {
        calls.push(["batch", canvasId, groupId]);
        return { group: { id: groupId, status: "selected", selectedArtifactId: "artifact-2" } };
      },
    },
  };
  const state = ensureCanvasMediaToolsState(ui);
  Object.assign(state, {
    derivationId: "derivation-recovered",
    taskId: "task-recovered",
    batchGroup: { id: "group-recovered", status: "processing" },
  });

  await persistCanvasMediaRecoveryState(workbench, state);
  assert.deepEqual(ui.canvasSessionUiState.mediaRecoveryByNode["image-node"], {
    derivationId: "derivation-recovered",
    taskId: "task-recovered",
    annotationLayerId: "",
    batchGroupId: "group-recovered",
  });
  assert.equal(calls[0][2].lastSeenRevision, 9);

  ui.canvasMediaTools = { open: true, status: "idle" };
  const recovered = ensureCanvasMediaToolsState(ui);
  const result = await refreshCanvasMediaRecoveryState(workbench, recovered);

  assert.equal(result.active, false);
  assert.equal(recovered.status, "completed");
  assert.equal(recovered.taskId, "task-recovered");
  assert.equal(recovered.batchGroup.selectedArtifactId, "artifact-2");
  assert.deepEqual(calls.slice(1).map((entry) => entry.slice(0, 3)), [
    ["derivation", "canvas-recovery", "derivation-recovered"],
    ["batch", "canvas-recovery", "group-recovered"],
  ]);
});

test("Canvas media drawer traps focus, closes on Escape, and restores the current trigger", async () => {
  const focusLog = [];
  const opener = { dataset: { mediaAction: "open" }, isConnected: true, focus() { focusLog.push("opener"); } };
  const currentTrigger = { focus() { focusLog.push("current-trigger"); } };
  const first = { focus() { focusLog.push("first"); }, getAttribute() { return null; } };
  const last = { focus() { focusLog.push("last"); }, getAttribute() { return null; } };
  const drawer = {
    contains(target) { return target === first || target === last; },
    querySelector(selector) { return selector === '[data-media-action="close"]' ? first : null; },
    querySelectorAll() { return [first, last]; },
  };
  const surface = {
    querySelector(selector) {
      if (selector === ".canvas-media-tools-drawer") return drawer;
      if (selector === 'button[data-media-action="open"]') return currentTrigger;
      return null;
    },
  };
  const ui = {};
  const controller = createCanvasMediaToolsController({
    surface,
    workbench: { ui },
    render() { opener.isConnected = false; },
  });

  await controller.handleAction(opener);
  assert.equal(ensureCanvasMediaToolsState(ui).open, true);
  assert.deepEqual(focusLog, ["first"]);

  const forward = { key: "Tab", preventDefault() { focusLog.push("prevent"); } };
  assert.equal(controller.handleKeydown(forward, last), true);
  assert.deepEqual(focusLog.slice(-2), ["prevent", "first"]);

  const backward = { key: "Tab", shiftKey: true, preventDefault() { focusLog.push("prevent"); } };
  assert.equal(controller.handleKeydown(backward, first), true);
  assert.deepEqual(focusLog.slice(-2), ["prevent", "last"]);

  const outside = { key: "Tab", preventDefault() { focusLog.push("prevent"); } };
  assert.equal(controller.handleKeydown(outside, {}), true);
  assert.deepEqual(focusLog.slice(-2), ["prevent", "first"]);

  const escape = {
    key: "Escape",
    preventDefault() { focusLog.push("prevent-escape"); },
    stopPropagation() { focusLog.push("stop-escape"); },
  };
  assert.equal(controller.handleKeydown(escape, last), true);
  await Promise.resolve();
  assert.equal(ensureCanvasMediaToolsState(ui).open, false);
  assert.deepEqual(focusLog.slice(-3), ["prevent-escape", "stop-escape", "current-trigger"]);
});

test("new Canvas CSS disables workflow motion when reduced motion is requested", () => {
  const css = readFileSync(new URL("../src/features/new-canvas/new-canvas.css", import.meta.url), "utf8");
  const workbenchCss = readFileSync(new URL("../src/features/production-workbench/production-workbench.css", import.meta.url), "utf8");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  const backdropRule = css.match(/\.canvas-media-tools-backdrop\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
  const drawerRule = css.match(/\.canvas-media-tools-drawer\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
  assert.doesNotMatch(backdropRule, /animation\s*:/);
  assert.doesNotMatch(drawerRule, /animation\s*:/);
  assert.match(workbenchCss, /\.canvas-x6-mount \.x6-edge:is\(\.is-canvas-edge-connecting, \.is-canvas-edge-flowing\)[\s\S]*?animation:\s*none/);
  assert.match(css, /\.new-canvas-root \.canvas-x6-generation-track > i[\s\S]*?transition:\s*none !important/);
});
