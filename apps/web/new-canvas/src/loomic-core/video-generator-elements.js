import { findCanvasPlacement, generateCanvasId } from "./canvas-elements.js";
import { deleteCanvasLayers } from "./canvas-layer-operations.js";

const RATIO_DIMENSIONS = {
  "16:9": { width: 480, height: 270 },
  "9:16": { width: 270, height: 480 },
  "1:1": { width: 400, height: 400 },
  "4:3": { width: 440, height: 330 },
  "3:4": { width: 330, height: 440 },
};

const GENERATION_INPUT_FIELDS = new Set([
  "prompt", "inputImages", "model", "modelLabel", "parameters", "aspectRatio", "duration", "resolution", "outputCount",
]);

function inputAwareUpdates(element, updates) {
  if (updates?.inputUpdated !== undefined) return updates;
  const data = element?.customData ?? {};
  const hasBaseline = Boolean(data.taskId || data.resultUrl || data.status === "completed");
  return hasBaseline && Object.keys(updates ?? {}).some((key) => GENERATION_INPUT_FIELDS.has(key))
    ? { ...updates, inputUpdated: true }
    : updates;
}

export function getVideoDisplayDimensions(aspectRatio) {
  if (RATIO_DIMENSIONS[aspectRatio]) return RATIO_DIMENSIONS[aspectRatio];
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(String(aspectRatio ?? ""));
  if (!match) return RATIO_DIMENSIONS["16:9"];
  const widthRatio = Number(match[1]);
  const heightRatio = Number(match[2]);
  if (!(widthRatio > 0) || !(heightRatio > 0)) return RATIO_DIMENSIONS["16:9"];
  return widthRatio >= heightRatio
    ? { width: 480, height: Math.max(1, Math.round(480 * heightRatio / widthRatio)) }
    : { width: Math.max(1, Math.round(480 * widthRatio / heightRatio)), height: 480 };
}

export function createVideoGeneratorElement(api, options = {}) {
  const aspectRatio = options.aspectRatio ?? "16:9";
  const dimensions = getVideoDisplayDimensions(aspectRatio);
  const id = generateCanvasId();
  const placement = options.placement ?? findCanvasPlacement(api, dimensions.width, dimensions.height);
  const element = {
    type: "rectangle", id,
    ...placement,
    ...dimensions,
    angle: 0, strokeColor: "#7f93a9", backgroundColor: "#edf1f4",
    fillStyle: "solid", strokeWidth: 1, strokeStyle: "dashed", roughness: 0,
    opacity: 100, groupIds: [], roundness: { type: 3 }, boundElements: null,
    frameId: null, index: null, seed: Math.floor(Math.random() * 2_000_000_000),
    version: 1, versionNonce: Math.floor(Math.random() * 2_000_000_000),
    isDeleted: false, updated: Date.now(), link: null, locked: false,
    customData: {
      type: "video-generator", status: "idle", prompt: "",
      model: options.model ?? "", modelLabel: options.modelLabel ?? "", aspectRatio,
      duration: options.duration ?? 5, resolution: options.resolution ?? "720p",
      parameters: options.parameters ?? {}, inputImages: [], inputUpdated: false,
    },
  };
  api.updateScene({ elements: [...api.getSceneElements(), element], captureUpdate: options.captureUpdate ?? "IMMEDIATELY" });
  return id;
}

export function isVideoGeneratorElement(element) {
  return element?.customData?.type === "video-generator";
}

export function getVideoGeneratorData(element) {
  return isVideoGeneratorElement(element) ? element.customData : null;
}

function updateGenerator(api, elementId, transform) {
  const elements = api.getSceneElements().map((element) => {
    if (element.id !== elementId || !isVideoGeneratorElement(element)) return element;
    return {
      ...transform(element), version: (element.version ?? 1) + 1,
      versionNonce: Math.floor(Math.random() * 2_000_000_000), updated: Date.now(),
    };
  });
  api.updateScene({ elements, captureUpdate: "IMMEDIATELY" });
}

export function updateVideoGeneratorElement(api, elementId, updates) {
  updateGenerator(api, elementId, (element) => ({ ...element, customData: { ...element.customData, ...inputAwareUpdates(element, updates) } }));
}

export function resizeVideoGeneratorElement(api, elementId, aspectRatio) {
  const dimensions = getVideoDisplayDimensions(aspectRatio);
  updateGenerator(api, elementId, (element) => {
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    return {
      ...element, x: centerX - dimensions.width / 2, y: centerY - dimensions.height / 2,
      ...dimensions, customData: { ...element.customData, aspectRatio },
    };
  });
}

export function deleteVideoGeneratorElement(api, elementId) {
  api.updateScene({ elements: deleteCanvasLayers(api.getSceneElements(), [elementId]), captureUpdate: "IMMEDIATELY" });
}
