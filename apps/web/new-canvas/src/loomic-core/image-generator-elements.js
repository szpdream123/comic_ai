import { findCanvasPlacement, generateCanvasId } from "./canvas-elements.js";
import { deleteCanvasLayers } from "./canvas-layer-operations.js";
import { createCanvasWorkflowConnection } from "./canvas-ports.js";

const RATIO_DIMENSIONS = {
  "1:1": { width: 1024, height: 1024 },
  "16:9": { width: 1024, height: 576 },
  "9:16": { width: 576, height: 1024 },
  "4:3": { width: 1024, height: 768 },
  "3:4": { width: 768, height: 1024 },
};

const GENERATION_INPUT_FIELDS = new Set([
  "prompt", "inputImages", "model", "modelLabel", "parameters", "aspectRatio", "quality", "outputCount",
  "styleId", "styleCode", "styleName", "stylePrompt", "styleSource",
]);

function inputAwareUpdates(element, updates) {
  if (updates?.inputUpdated !== undefined) return updates;
  const data = element?.customData ?? {};
  const hasBaseline = Boolean(data.taskId || data.resultUrl || data.status === "completed");
  return hasBaseline && Object.keys(updates ?? {}).some((key) => GENERATION_INPUT_FIELDS.has(key))
    ? { ...updates, inputUpdated: true }
    : updates;
}

export function getImageDisplayDimensions(aspectRatio, maxSize = 400) {
  const source = resolveRatioDimensions(aspectRatio);
  const scale = Math.min(maxSize / source.width, maxSize / source.height);
  return { width: Math.round(source.width * scale), height: Math.round(source.height * scale) };
}

export function getImageGenerationDimensions(aspectRatio, quality) {
  const source = resolveRatioDimensions(aspectRatio);
  const multiplier = quality === "ultra" ? 4 : quality === "hd" ? 2 : 1;
  return { width: source.width * multiplier, height: source.height * multiplier };
}

function resolveRatioDimensions(aspectRatio) {
  if (RATIO_DIMENSIONS[aspectRatio]) return RATIO_DIMENSIONS[aspectRatio];
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(String(aspectRatio ?? ""));
  if (!match) return RATIO_DIMENSIONS["1:1"];
  const widthRatio = Number(match[1]);
  const heightRatio = Number(match[2]);
  if (!(widthRatio > 0) || !(heightRatio > 0)) return RATIO_DIMENSIONS["1:1"];
  return widthRatio >= heightRatio
    ? { width: 1024, height: Math.max(1, Math.round(1024 * heightRatio / widthRatio)) }
    : { width: Math.max(1, Math.round(1024 * widthRatio / heightRatio)), height: 1024 };
}

export function createImageGeneratorElement(api, options = {}) {
  const aspectRatio = options.aspectRatio ?? "1:1";
  const dimensions = getImageDisplayDimensions(aspectRatio);
  const id = generateCanvasId();
  const placement = options.placement ?? (
    Number.isFinite(options.anchor?.x) && Number.isFinite(options.anchor?.y)
      ? { x: options.anchor.x - dimensions.width / 2, y: options.anchor.y - dimensions.height / 2 }
      : findCanvasPlacement(api, dimensions.width, dimensions.height)
  );
  const element = {
    type: "rectangle", id,
    ...placement,
    ...dimensions,
    angle: 0, strokeColor: "#8d8b86", backgroundColor: "#f1f0ed",
    fillStyle: "solid", strokeWidth: 1, strokeStyle: "dashed", roughness: 0,
    opacity: 100, groupIds: [], roundness: { type: 3 }, boundElements: null,
    frameId: null, index: null, seed: Math.floor(Math.random() * 2_000_000_000),
    version: 1, versionNonce: Math.floor(Math.random() * 2_000_000_000),
    isDeleted: false, updated: Date.now(), link: null, locked: false,
    customData: {
      type: "image-generator", status: "idle", prompt: options.prompt ?? "",
      model: options.model ?? "", modelLabel: options.modelLabel ?? "", aspectRatio,
      quality: options.quality ?? "hd", parameters: options.parameters ?? {}, inputImages: options.inputImages ?? [], inputUpdated: false,
    },
  };
  api.updateScene({ elements: [...api.getSceneElements(), element], captureUpdate: options.captureUpdate ?? "IMMEDIATELY" });
  return id;
}

export function createImageToImageGenerator(api, sourceElementId) {
  const source = api?.getSceneElements?.().find((element) => element.id === sourceElementId && !element.isDeleted);
  if (!source || source.type !== "image") return null;
  const width = Math.max(1, Number(source.width) || 1);
  const height = Math.max(1, Number(source.height) || 1);
  const aspectRatio = `${Math.round(width)}:${Math.round(height)}`;
  const dimensions = getImageDisplayDimensions(aspectRatio);
  const elementId = createImageGeneratorElement(api, {
    aspectRatio,
    placement: {
      x: (Number(source.x) || 0) + width + 80,
      y: (Number(source.y) || 0) + height / 2 - dimensions.height / 2,
    },
  });
  const connection = createCanvasWorkflowConnection(api.getSceneElements?.() ?? [], sourceElementId, elementId);
  if (!connection.ok) return elementId;
  api.updateScene({
    elements: connection.elements,
    appState: { selectedElementIds: { [elementId]: true } },
    captureUpdate: "IMMEDIATELY",
  });
  return elementId;
}

export function isImageGeneratorElement(element) {
  return element?.customData?.type === "image-generator";
}

export function getImageGeneratorData(element) {
  return isImageGeneratorElement(element) ? element.customData : null;
}

function updateGenerator(api, elementId, transform) {
  const elements = api.getSceneElements().map((element) => {
    if (element.id !== elementId || !isImageGeneratorElement(element)) return element;
    return {
      ...transform(element),
      version: (element.version ?? 1) + 1,
      versionNonce: Math.floor(Math.random() * 2_000_000_000),
      updated: Date.now(),
    };
  });
  api.updateScene({ elements, captureUpdate: "IMMEDIATELY" });
}

export function updateImageGeneratorElement(api, elementId, updates) {
  updateGenerator(api, elementId, (element) => ({ ...element, customData: { ...element.customData, ...inputAwareUpdates(element, updates) } }));
}

export function resizeImageGeneratorElement(api, elementId, aspectRatio) {
  const dimensions = getImageDisplayDimensions(aspectRatio);
  updateGenerator(api, elementId, (element) => {
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    return {
      ...element,
      x: centerX - dimensions.width / 2,
      y: centerY - dimensions.height / 2,
      ...dimensions,
      customData: { ...element.customData, aspectRatio },
    };
  });
}

export function deleteImageGeneratorElement(api, elementId) {
  api.updateScene({ elements: deleteCanvasLayers(api.getSceneElements(), [elementId]), captureUpdate: "IMMEDIATELY" });
}
