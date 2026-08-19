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
    assert.match(shell, tool === "slice" ? /canvas-media-slice-stage/ : /canvas-media-source-preview/);
    assert.match(shell, /\/api\/storage\/objects\/storage-source\/content\?proxy=1/);
    assert.match(shell, /待处理原图/);
  }

  state.tool = "crop";
  assert.match(renderCanvasMediaToolsShell(ui), /canvas-media-crop-stage[^>]+storage-source/);
  state.tool = "annotation";
  assert.match(renderCanvasMediaToolsShell(ui), /canvas-media-annotation-stage[^>]+storage-source/);
});

test("Canvas slice preview exposes numbered cells and draggable row/column guides", () => {
  const ui = {
    selectedCanvasNodeId: "source-image",
    canvasDocument: {
      nodes: [{ id: "source-image", type: "source-image", data: { url: "/source.png" } }],
    },
    canvasMediaTools: { open: true, tool: "slice", sliceRows: 3, sliceColumns: 2 },
  };
  const shell = renderCanvasMediaToolsShell(ui);
  assert.match(shell, /canvas-media-slice-stage/);
  assert.match(shell, /canvas-media-slice-count[^>]*>3 行 × 2 列</);
  assert.equal((shell.match(/data-media-slice-handle/g) ?? []).length, 3);
  assert.match(shell, /data-media-slice-axis="row"/);
  assert.match(shell, /data-media-slice-axis="column"/);
  assert.match(shell, /切片预览/);
});

test("Canvas composite only offers image nodes and renders upload/selection preview", () => {
  const ui = {
    selectedCanvasNodeId: "base",
    canvasDocument: { nodes: [
      { id: "base", type: "source-image", data: { url: "/base.png", mediaKind: "image" } },
      { id: "image", type: "source-image", data: { url: "/image.png", mediaKind: "image", title: "图片节点" } },
      { id: "upload", type: "upload", data: { url: "/upload.png", mediaKind: "image", title: "上传图片" } },
      { id: "video", type: "source-video", data: { url: "/video.mp4", mediaKind: "video", title: "AI 视频" } },
    ] },
    canvasMediaTools: { open: true, tool: "composite", compositeSecondaryArtifactId: "node:image" },
  };
  const shell = renderCanvasMediaToolsShell(ui);
  assert.match(shell, /图片节点/);
  assert.match(shell, /上传图片/);
  assert.doesNotMatch(shell, /AI 视频/);
  assert.match(shell, /data-media-composite-upload/);
  assert.match(shell, /canvas-media-composite-preview/);
});

test("Canvas composite upload becomes the selected second image", async () => {
  const ui = { selectedCanvasProjectId: "canvas-composite", canvasMediaTools: { open: true, tool: "composite" } };
  const workbench = {
    ui,
    api: { async uploadFile() { return { upload: { storageObjectId: "secondary-upload" } }; } },
  };
  const controller = createCanvasMediaToolsController({ surface: {}, workbench, render() {} });
  const target = {
    files: [{ name: "secondary.png", type: "image/png" }],
    value: "selected-file",
    matches(selector) { return selector === "[data-media-composite-upload]"; },
  };
  assert.equal(await controller.handleChange(target), true);
  assert.equal(target.value, "");
  assert.equal(ui.canvasMediaTools.compositeSecondaryArtifactId, "upload:secondary-upload");
  assert.equal(ui.canvasMediaTools.compositeUpload.title, "secondary.png");
  assert.match(ui.canvasMediaTools.compositeUpload.url, /secondary-upload/);
  controller.dispose();
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

test("Canvas free view updates its preview when camera parameters change", () => {
  const preview = {
    style: { setProperty(name, value) { this[name] = value; } },
    classList: { add() {}, remove() {} },
    querySelector() { return readout; },
    setPointerCapture() {},
    releasePointerCapture() {},
  };
  const readout = { textContent: "" };
  const inputs = {
    viewAzimuthDegrees: { value: "0" },
    viewElevationDegrees: { value: "0" },
    viewDistanceScale: { value: "1" },
  };
  const ui = {
    selectedCanvasNodeId: "source-image-node",
    canvasDocument: { nodes: [{ id: "source-image-node", type: "source-image", data: { storageObjectId: "storage-source" } }] },
    canvasMediaTools: { open: true, tool: "free_view" },
  };
  const surface = {
    querySelector(selector) {
      if (selector === "[data-free-view-preview]") return preview;
      const match = selector.match(/^\[data-media-field="([^"]+)"\]$/);
      return match ? inputs[match[1]] ?? null : null;
    },
  };
  const controller = createCanvasMediaToolsController({ surface, workbench: { ui }, render() {} });

  controller.handleInput({ dataset: { mediaField: "viewAzimuthDegrees" }, type: "number", value: "90" });
  controller.handleInput({ dataset: { mediaField: "viewElevationDegrees" }, type: "number", value: "-20" });
  controller.handleInput({ dataset: { mediaField: "viewDistanceScale" }, type: "number", value: "2" });

  assert.equal(preview.style["--free-view-yaw"], "27deg");
  assert.equal(preview.style["--free-view-pitch"], "4.4deg");
  assert.match(readout.textContent, /水平 90°/);
  assert.match(readout.textContent, /距离 2.0x/);
  assert.equal(inputs.viewAzimuthDegrees.value, "90");
  assert.equal(inputs.viewElevationDegrees.value, "-20");
  assert.equal(inputs.viewDistanceScale.value, "2");

  const pointerTarget = { closest(selector) { return selector === "[data-free-view-preview]" ? preview : null; } };
  controller.handlePointerDown({ clientX: 10, clientY: 10, pointerId: 1 }, pointerTarget);
  controller.handlePointerMove({ clientX: 60, clientY: -10, pointerId: 1 }, pointerTarget);
  controller.handlePointerUp({ pointerId: 1 }, pointerTarget);
  assert.equal(ui.canvasMediaTools.viewAzimuthDegrees, 120);
  assert.equal(ui.canvasMediaTools.viewElevationDegrees, -11);
  assert.equal(inputs.viewAzimuthDegrees.value, "120");
  assert.equal(inputs.viewElevationDegrees.value, "-11");
  controller.handleWheel({ deltaY: 50 }, pointerTarget);
  assert.equal(ui.canvasMediaTools.viewDistanceScale, 2.2);
  assert.equal(inputs.viewDistanceScale.value, "2.2");
  controller.dispose();
});

test("Canvas free view sends camera parameters as an image edit instruction", async () => {
  let generationInput = null;
  const ui = {
    selectedCanvasProjectId: "canvas-free-view",
    selectedCanvasNodeId: "image-node",
    canvasDocument: { nodes: [{ id: "image-node", type: "source-image", data: { storageObjectId: "source-storage", modelCode: "image-model" } }] },
    canvasMediaTools: {
      open: true,
      tool: "free_view",
      instruction: "保持主体不变",
      viewAzimuthDegrees: 35,
      viewElevationDegrees: -12,
      viewDistanceScale: 1.4,
    },
  };
  const workbench = {
    ui,
    api: {
      async startCanvasMediaDerivation() { return { derivation: { id: "derivation-free-view" } }; },
      async createImageGenerationTask(input) { generationInput = input; return { taskId: "task-free-view" }; },
      async attachCanvasMediaDerivationTask() {},
    },
  };
  const controller = createCanvasMediaToolsController({ surface: {}, workbench, render() {} });

  await controller.handleAction({ dataset: { mediaAction: "submit" } });

  assert.match(generationInput.prompt, /保持主体不变/);
  assert.match(generationInput.prompt, /horizontal 35 degrees/);
  assert.match(generationInput.prompt, /vertical -12 degrees/);
  assert.match(generationInput.prompt, /camera distance 1\.4x/);
  assert.equal(ui.canvasMediaTools.status, "running");
  controller.dispose();
});

test("Canvas local crop waits for the new node to be persisted", async () => {
  const previousDocument = globalThis.document;
  const previousImage = globalThis.Image;
  const calls = [];
  let saveCount = 0;
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
  const taskCenterRegistrations = [];
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
    updateCanvasDocument(nextDocument) { ui.canvasDocument = nextDocument; },
    registerCanvasMediaGenerationTask(task, defaults) { taskCenterRegistrations.push({ task, defaults }); },
    async saveCanvasNow() { saveCount += 1; },
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
      async getGenerationTask(taskId) {
        calls.push(["poll", taskId]);
        return { taskId, status: "running" };
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
  assert.equal(ui.canvasDocument.nodes[0].data.status, "running");
  assert.equal(ui.canvasDocument.nodes[0].data.source, "canvas_derivation");
  assert.equal(ui.canvasDocument.nodes[0].data.generationStage, "image_generating");
  assert.equal(taskCenterRegistrations.length, 1);
  assert.equal(taskCenterRegistrations[0].defaults.taskId, "task-1");
  assert.equal(taskCenterRegistrations[0].defaults.targetType, "canvas");
  assert.equal(taskCenterRegistrations[0].defaults.targetId, "image-node");
  assert.equal(calls.some(([name]) => name === "poll"), false);
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
        { modelCode: "image-fast", modelLabel: "快速图片模型", providerName: "内部提供方", mediaType: "image" },
        { modelCode: "image-quality", modelLabel: "高质量图片模型", providerName: "外部提供方", mediaType: "image" },
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

  const shell = renderCanvasMediaToolsShell(ui);
  assert.match(shell, /data-media-field="generationModelCode"/);
  assert.match(shell, /高质量图片模型/);
  assert.doesNotMatch(shell, /内部提供方|外部提供方/);
  assert.match(shell, /canvas-media-submit-model[\s\S]*canvas-media-submit-controls[\s\S]*data-media-action="submit"/);
  assert.ok(shell.indexOf("canvas-media-submit-model") > shell.indexOf("<footer>"));
  assert.doesNotMatch(shell, /图片模型（提供方）/);
  assert.doesNotMatch(shell, /等待操作/);
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
        color: "#ffffff",
        rimLight: false,
        fillLight: true,
      },
      prompt: "Edit the reference image only. Preserve the same subject, clothing, and scene. Camera: front angle, eye-level angle, medium framing, 85mm lens, f/1.8, shallow depth of field, natural composition, clear detail.",
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
  const viewport = { dataset: {} };
  const surface = {
    querySelector(selector) {
      if (selector === '[data-media-output="cameraYawDegrees"]') return yawOutput;
      if (selector === "[data-camera-studio-prompt]") return promptOutput;
      if (selector === '[data-media-action="camera-studio-copy"]') return copyButton;
      if (selector === "[data-camera-studio-viewport]") return viewport;
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
  controller.handleInput({ dataset: { mediaField: "cameraFocalLengthMm" }, type: "number", value: "105" });
  controller.handleInput({ dataset: { mediaField: "cameraAperture" }, type: "number", value: "4" });
  controller.handleInput({ dataset: { mediaField: "lightPitchDegrees" }, type: "range", value: "55" });
  controller.handleInput({ dataset: { mediaField: "cameraLightingPreset" }, type: "select-one", value: "rim_light" });
  controller.handleInput({ dataset: { mediaField: "lightRimEnabled" }, type: "checkbox", checked: true });
  controller.handleInput({ dataset: { mediaField: "lightFillEnabled" }, type: "checkbox", checked: false });
  controller.handleInput({ dataset: { mediaField: "lightColor" }, type: "color", value: "#9E8181" });
  assert.equal(state.cameraYawDegrees, 90);
  assert.equal(yawOutput.textContent, "90°");
  assert.match(promptOutput.textContent, /right profile angle/);
  assert.equal(copyButton.textContent, "复制提示词");
  assert.equal(viewport.dataset.cameraYaw, "90");
  assert.equal(viewport.dataset.cameraPitch, "4");
  assert.equal(viewport.dataset.cameraRoll, "18");
  assert.equal(viewport.dataset.cameraFocalLength, "105");
  assert.equal(viewport.dataset.cameraAperture, "4");
  assert.equal(viewport.dataset.lightPitch, "55");
  assert.equal(viewport.dataset.lightPreset, "rim_light");
  assert.equal(viewport.dataset.lightColor, "#9e8181");
  assert.equal(state.lightTemperature, "custom");
  assert.equal(viewport.dataset.lightRim, "true");
  assert.equal(viewport.dataset.lightFill, "false");
  assert.equal(viewport.dataset.activeControl, "camera");
  assert.match(promptOutput.textContent, /subtle rim light/);
  assert.match(promptOutput.textContent, /custom #9e8181 light color/);
  assert.doesNotMatch(promptOutput.textContent, /soft fill light/);

  await controller.handleAction({ dataset: { mediaAction: "camera-studio-reset" } });
  assert.equal(state.cameraStudioMode, "camera");
  assert.deepEqual([state.cameraYawDegrees, state.cameraPitchDegrees, state.cameraRollDegrees], [0, 0, 0]);
});

test("Canvas Camera Studio renders a Three.js viewport with source and interaction state", () => {
  const ui = {
    selectedCanvasNodeId: "image-node",
    canvasDocument: {
      nodes: [{
        id: "image-node",
        type: "image",
        data: { title: "摄影棚源图", storageObjectId: "studio-source" },
      }],
    },
    canvasMediaTools: {
      open: true,
      tool: "camera_studio",
      cameraStudioMode: "dual",
      cameraStudioActiveControl: "lighting",
      cameraYawDegrees: 35,
      cameraPitchDegrees: -12,
      cameraRollDegrees: 8,
      cameraFocalLengthMm: 85,
      cameraAperture: 1.4,
      lightYawDegrees: -55,
      lightPitchDegrees: 42,
      lightIntensityPercent: 78,
      lightColor: "#9e8181",
      cameraLightingPreset: "three_point",
      lightRimEnabled: true,
      lightFillEnabled: true,
    },
  };

  const shell = renderCanvasMediaToolsShell(ui);

  assert.match(shell, /data-camera-studio-viewport/);
  assert.match(shell, /<canvas data-camera-studio-canvas/);
  assert.match(shell, /data-source-url="\/api\/storage\/objects\/studio-source\/content\?proxy=1"/);
  assert.match(shell, /canvas-camera-studio-viewport-image[^>]+studio-source/);
  assert.match(shell, /data-studio-mode="dual"/);
  assert.match(shell, /data-active-control="lighting"/);
  assert.match(shell, /data-camera-yaw="35"/);
  assert.match(shell, /data-camera-pitch="-12"/);
  assert.match(shell, /data-camera-roll="8"/);
  assert.match(shell, /data-camera-focal-length="85"/);
  assert.match(shell, /data-camera-aperture="1.4"/);
  assert.match(shell, /data-light-yaw="-55"/);
  assert.match(shell, /data-light-pitch="42"/);
  assert.match(shell, /data-light-intensity="78"/);
  assert.match(shell, /data-light-color="#9e8181"/);
  assert.match(shell, /data-media-field="lightColor"/);
  assert.match(shell, /data-media-color-hex="lightColor"/);
  assert.match(shell, /data-light-preset="three_point"/);
  assert.match(shell, /data-media-field="lightRimEnabled" checked/);
  assert.match(shell, /data-media-field="lightFillEnabled" checked/);
  assert.match(shell, /data-camera-studio-readout-value>-55°/);
});

test("Canvas Camera Studio generation combines user instruction with effective studio semantics", async () => {
  let derivationInput = null;
  let generationInput = null;
  const ui = {
    selectedCanvasProjectId: "canvas-studio",
    selectedCanvasNodeId: "image-node",
    canvasDocument: {
      nodes: [{
        id: "image-node",
        type: "image",
        data: { storageObjectId: "studio-source", url: "/source.png", modelCode: "image-model" },
      }],
    },
    canvasMediaTools: {
      open: true,
      tool: "camera_studio",
      instruction: "保留人物身份和服装",
      cameraStudioMode: "dual",
      cameraStudioActiveControl: "camera",
      cameraYawDegrees: 90,
      cameraPitchDegrees: 10,
      cameraRollDegrees: 0,
      cameraDistance: "medium",
      cameraLens: "35mm",
      cameraFocalLengthMm: 85,
      cameraAperture: 1.4,
      cameraPromptEnhance: false,
      lightYawDegrees: -90,
      lightPitchDegrees: 25,
      lightIntensityPercent: 72,
      lightTemperature: "warm",
      cameraLightingPreset: "three_point",
      lightRimEnabled: false,
      lightFillEnabled: true,
    },
  };
  const workbench = {
    ui,
    api: {
      async startCanvasMediaDerivation(_canvasId, input) {
        derivationInput = input;
        return { derivation: { id: "derivation-studio" } };
      },
      async createImageGenerationTask(input) {
        generationInput = input;
        return { taskId: "task-studio" };
      },
      async attachCanvasMediaDerivationTask() {},
    },
  };
  const controller = createCanvasMediaToolsController({ surface: {}, workbench, render() {} });

  await controller.handleAction({ dataset: { mediaAction: "submit" } });

  const studioPrompt = derivationInput.requestSnapshot.cameraStudio.prompt;
  assert.match(studioPrompt, /right profile angle/);
  assert.match(studioPrompt, /85mm lens/);
  assert.match(studioPrompt, /f\/1\.4, shallow depth of field/);
  assert.match(studioPrompt, /three-point studio lighting/);
  assert.match(studioPrompt, /Edit the reference image only/);
  assert.doesNotMatch(studioPrompt, /subject identity|cinematic composition/i);
  assert.ok(studioPrompt.length < 320);
  assert.equal(generationInput.parameters.cameraStudio.prompt, studioPrompt);
  assert.match(generationInput.prompt, /保留人物身份和服装/);
  assert.match(generationInput.prompt, /85mm lens/);
  assert.match(generationInput.prompt, /f\/1\.4, shallow depth of field/);
  assert.match(generationInput.prompt, /three-point studio lighting/);
  assert.notEqual(generationInput.prompt, ui.canvasMediaTools.instruction);
  assert.equal(ui.canvasMediaTools.status, "running");
  controller.dispose();
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
  const previousDocument = globalThis.document;
  const previousImage = globalThis.Image;
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
  globalThis.Image = class {
    naturalWidth = 640;
    naturalHeight = 360;
    set src(value) { this.source = value; queueMicrotask(() => this.onload?.()); }
  };
  globalThis.document = {
    createElement() {
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage() {} }),
        toBlob(callback) { callback(new Blob(["annotation-result"], { type: "image/png" })); },
      };
    },
  };
  try {
    const ui = {
      selectedCanvasProjectId: "canvas-vector",
      selectedCanvasNodeId: "image-node",
      canvasDocument: { nodes: [{ id: "image-node", type: "image", data: { assetId: "asset-1", assetVersionId: "version-1", storageObjectId: "source-storage" } }] },
    };
    const workbench = {
      ui,
      api: {
        async uploadFile(file, options) {
          if (options.category === "canvas-annotations") {
            validateUploadFile(file, options.uploadLimits);
            uploadedPayload = JSON.parse(await file.text());
            return { upload: { storageObjectId: "vector-storage" } };
          }
          return { upload: { storageObjectId: "vector-result-storage" } };
        },
        async createCanvasAnnotationLayer(_canvasId, input) { layerInput = input; return { layer: { id: "vector-layer" } }; },
      },
    };
    const controller = createCanvasMediaToolsController({
      surface: { querySelector: (selector) => selector === "[data-media-annotation-canvas]" ? canvas : null },
      workbench,
      render() {},
    });
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
    assert.equal(ui.canvasDocument.nodes.at(-1).data.source, "canvas_annotation");
    assert.equal(ui.canvasDocument.nodes.at(-1).data.storageObjectId, "vector-result-storage");
    controller.dispose();
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousImage === undefined) delete globalThis.Image;
    else globalThis.Image = previousImage;
  }
});

test("Canvas annotation uploads the raster and creates a recoverable layer", async () => {
  const previousDocument = globalThis.document;
  const previousImage = globalThis.Image;
  const calls = [];
  let saveCount = 0;
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
      nodes: [{ id: "image-node", type: "image", data: { assetId: "asset-1", assetVersionId: "version-1", storageObjectId: "source-storage" } }],
    },
  };
  globalThis.Image = class {
    naturalWidth = 640;
    naturalHeight = 360;
    set src(value) { this.source = value; queueMicrotask(() => this.onload?.()); }
  };
  globalThis.document = {
    createElement() {
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage() {} }),
        toBlob(callback) { callback(new Blob(["annotation-result"], { type: "image/png" })); },
      };
    },
  };
  const workbench = {
    ui,
    updateCanvasDocument(nextDocument) { ui.canvasDocument = nextDocument; },
    async saveCanvasNow() { saveCount += 1; },
    api: {
      async uploadFile(file, options) {
        validateUploadFile(file, options.uploadLimits);
        calls.push(["upload", file.type, options]);
        return { upload: { storageObjectId: options.category === "canvas-annotations" ? "annotation-storage-1" : "annotation-result-storage" } };
      },
      async createCanvasAnnotationLayer(canvasId, input) {
        calls.push(["layer", canvasId, input]);
        return { layer: { id: "layer-1" } };
      },
    },
  };
  try {
    const controller = createCanvasMediaToolsController({
      surface: { querySelector: (selector) => selector === "[data-media-annotation-canvas]" ? annotationCanvas : null },
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
    assert.equal(calls[2][0], "upload");
    assert.equal(calls[2][2].category, "canvas-derivations");
    assert.equal(state.annotationLayerId, "layer-1");
    assert.equal(state.status, "completed");
    assert.equal(ui.canvasDocument.nodes.length, 2);
    assert.equal(ui.canvasDocument.nodes.at(-1).data.title, "标注结果");
    assert.equal(ui.canvasDocument.nodes.at(-1).data.storageObjectId, "annotation-result-storage");
    assert.equal(saveCount, 1);
    controller.dispose();
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousImage === undefined) delete globalThis.Image;
    else globalThis.Image = previousImage;
  }
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
  assert.doesNotMatch(shell, /宫格分组|group-1/);
  assert.match(shell, /data-media-action="submit" disabled>生成中<\/button>/);
  assert.match(shell, /artifact-2[^>]*" disabled>主结果/);
});

test("Canvas media host binds and removes annotation pointer listeners", () => {
  const source = readFileSync(new URL("../src/features/new-canvas/index.js", import.meta.url), "utf8");
  for (const eventName of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
    assert.match(source, new RegExp(`addEventListener\\("${eventName}"`));
    assert.match(source, new RegExp(`removeEventListener\\("${eventName}"`));
  }
  assert.match(source, /isMediaBackdropClick/);
  assert.match(source, /mediaActionTarget\.dataset\?\.mediaAction !== "close"/);
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
  const layerInput = { value: "mask" };
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
    querySelector(selector) {
      if (selector === "[data-media-annotation-canvas]") return canvas;
      if (selector === '[data-media-field="layerKind"]') return layerInput;
      return null;
    },
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

  await controller.handleAction({ dataset: { mediaAction: "annotation-mode", annotationMode: "draw" } });
  controller.handlePointerDown({ clientX: 10, clientY: 10, pointerId: 2 }, canvas);
  controller.handlePointerMove({ clientX: 20, clientY: 20, pointerId: 2 }, canvas);
  controller.handlePointerUp({ pointerId: 2 }, canvas);
  controller.handleInput({ dataset: { mediaField: "layerKind" }, type: "select-one", value: "raster_annotation" });
  assert.equal(context.strokeStyle, "#ef4444");
  controller.handleInput({ dataset: { mediaField: "layerKind" }, type: "select-one", value: "mask" });
  assert.equal(context.strokeStyle, "#ef4444");

  controller.handleInput({ dataset: { mediaField: "layerKind" }, type: "select-one", value: "raster_annotation" });
  controller.handleInput({ dataset: { mediaField: "annotationColor" }, type: "color", value: "#22c55e" });
  assert.equal(context.strokeStyle, "#ef4444");

  await controller.handleAction({ dataset: { mediaAction: "annotation-tool", annotationTool: "arrow" } });
  controller.handlePointerDown({ clientX: 10, clientY: 10, pointerId: 3 }, canvas);
  controller.handlePointerMove({ clientX: 120, clientY: 80, pointerId: 3 }, canvas);
  controller.handlePointerUp({ clientX: 120, clientY: 80, pointerId: 3 }, canvas);
  assert.equal(context.strokeStyle, "#22c55e");
  assert.equal(context.lineWidth <= 8, true);
  assert.equal(context.globalCompositeOperation ?? "source-over", "source-over");
});

test("Canvas annotation commits and closes text editing before an outside canvas click", () => {
  const context = { clearRect() {}, stroke() {}, fill() {}, beginPath() {}, moveTo() {}, lineTo() {}, fillText() {} };
  const canvas = {
    width: 640,
    height: 360,
    matches: (selector) => selector === "[data-media-annotation-canvas]",
    closest: () => null,
    getContext: () => context,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }),
  };
  const editor = {
    hidden: true,
    value: "",
    style: {},
    matches: (selector) => selector === "[data-media-annotation-text-editor]",
    focus() {},
    select() {},
  };
  const surface = {
    querySelector(selector) {
      if (selector === "[data-media-annotation-canvas]") return canvas;
      if (selector === "[data-media-annotation-text-editor]") return editor;
      return null;
    },
  };
  const ui = { selectedCanvasNodeId: "image-node", canvasDocument: { nodes: [{ id: "image-node", type: "image", data: {} }] } };
  const controller = createCanvasMediaToolsController({ surface, workbench: { ui }, render() {} });
  const state = ensureCanvasMediaToolsState(ui);
  state.open = true;
  state.tool = "annotation";
  state.annotationTool = "text";
  state.annotations = [{ id: "text-1", type: "text", text: "原文本", x: 100, y: 100, fontSize: 32, color: "#ef4444", strokeWidth: 4 }];

  assert.equal(controller.handleDoubleClick({ clientX: 100, clientY: 100 }, canvas), true);
  assert.equal(editor.hidden, false);
  editor.value = "修改后的文本";
  assert.equal(controller.handlePointerDown({ clientX: 300, clientY: 200, pointerId: 1 }, canvas), true);
  assert.equal(editor.hidden, true);
  assert.equal(state.annotations[0].text, "修改后的文本");
  assert.equal(state.annotations.length, 1);
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

test("Canvas media tools hide persisted task identifiers and show generation on the action", () => {
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
  assert.doesNotMatch(shell, /已恢复的媒体任务|派生任务|生成任务|derivation-recovered|task-recovered|处理中/);
  assert.match(shell, /data-media-action="submit" disabled>生成中<\/button>/);
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
  assert.match(css, /\.new-canvas-root \.canvas-media-tools-drawer\.is-camera-studio[\s\S]*?\.canvas-camera-studio-presets button/);
  assert.match(css, /\.canvas-camera-studio-prompt p[\s\S]*?color:\s*var\(--new-canvas-foreground\)/);
  assert.match(css, /\.canvas-media-slice-stage\s*\{[\s\S]*?aspect-ratio:\s*16 \/ 9/);
  assert.match(css, /\.canvas-media-slice-stage > img\s*\{[\s\S]*?position:\s*absolute/);
  assert.match(css, /\.canvas-free-view-stage > img\s*\{[\s\S]*?width:\s*auto[\s\S]*?height:\s*auto[\s\S]*?object-fit:\s*contain/);
  assert.match(css, /\.canvas-media-tools-drawer \.canvas-free-view-stage\s*\{[\s\S]*?min-height:\s*220px/);
});
