import { resolveStaticAssetUrl } from "../../shared/static-asset-url.js";
import {
  addCanvasNode,
  resolveCanvasModelOptions,
  updateCanvasNodeData,
} from "../production-workbench/canvas/canvas-state.js";
import { resolveCanvasMediaNodeSource } from "../production-workbench/canvas/canvas-media-node.js";
import { createCanvasCameraStudioViewportController } from "./camera-studio-viewport.js";

const MEDIA_TOOLS = [
  { id: "crop", label: "裁剪" },
  { id: "outpaint", label: "扩图" },
  { id: "remove_background", label: "抠图" },
  { id: "free_view", label: "自由视角" },
  { id: "camera_studio", label: "Camera Studio" },
  { id: "slice", label: "切片" },
  { id: "composite", label: "合成" },
  { id: "annotation", label: "标注" },
  { id: "batch_grid", label: "宫格" },
];

const MEDIA_TOOLS_WITH_INSTRUCTION = new Set(["outpaint", "remove_background", "free_view"]);

const CANVAS_ANNOTATION_UPLOAD_LIMITS = {
  image: {
    label: "标注图片",
    maxBytes: 30 * 1024 * 1024,
    mimeTypes: ["image/png"],
    extensions: [".png"],
  },
  vector: {
    label: "矢量标注",
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: ["application/json"],
    extensions: [".json"],
  },
};

const CAMERA_STUDIO_CAMERA_PRESETS = {
  front: { yaw: 0, pitch: 0 },
  three_quarter: { yaw: 45, pitch: 0 },
  profile: { yaw: 90, pitch: 0 },
  back: { yaw: 180, pitch: 0 },
  high: { yaw: 20, pitch: 38, lens: "50mm" },
  low: { yaw: -20, pitch: -24, lens: "24mm" },
  overhead: { yaw: 0, pitch: 76, lens: "35mm" },
  dutch: { yaw: 25, pitch: 4, roll: 18, lens: "35mm" },
};

const CAMERA_STUDIO_LIGHT_PRESETS = {
  front: { yaw: 0, pitch: 18 },
  left: { yaw: -90, pitch: 25 },
  right: { yaw: 90, pitch: 25 },
  top: { yaw: 0, pitch: 72 },
  back: { yaw: 180, pitch: 25 },
  bottom: { yaw: 0, pitch: -45 },
};

export function ensureCanvasMediaToolsState(ui = {}) {
  const state = ui.canvasMediaTools && typeof ui.canvasMediaTools === "object" ? ui.canvasMediaTools : {};
  Object.assign(state, {
    open: false,
    tool: "crop",
    instruction: "",
    cropX: 0,
    cropY: 0,
    cropWidth: 100,
    cropHeight: 100,
    outpaintPixels: 256,
    backgroundFeatherPixels: 8,
    preserveShadow: true,
    viewAzimuthDegrees: 0,
    viewElevationDegrees: 0,
    viewDistanceScale: 1,
    cameraFocalLengthMm: 50,
    cameraAperture: 2.8,
    cameraLightingPreset: "softbox",
    cameraStudioMode: "camera",
    cameraStudioActiveControl: "camera",
    cameraYawDegrees: 0,
    cameraPitchDegrees: 0,
    cameraRollDegrees: 0,
    cameraDistance: "medium",
    cameraLens: "35mm",
    cameraPromptEnhance: true,
    lightYawDegrees: 45,
    lightPitchDegrees: 30,
    lightIntensityPercent: 65,
    lightTemperature: "neutral",
    lightColor: "#ffffff",
    lightRimEnabled: false,
    lightFillEnabled: true,
    cameraPromptCopied: false,
    sliceRows: 2,
    sliceColumns: 2,
    sliceGapPixels: 0,
    sliceRowPositions: [0.5],
    sliceColumnPositions: [0.5],
    compositeBlendMode: "normal",
    compositeOpacityPercent: 100,
    compositeAlignment: "center",
    compositeSecondaryArtifactId: "",
    compositeSecondarySource: null,
    compositeUpload: null,
    brushSize: 24,
    annotationTool: "brush",
    annotationColor: "#ef4444",
    annotationText: "",
    annotationFontSize: 32,
    annotationNumber: 1,
    annotations: [],
    selectedAnnotationId: "",
    annotationRedo: [],
    layerKind: "mask",
    annotationMode: "draw",
    vectorStrokes: [],
    annotationLayers: [],
    annotationLayersLoading: false,
    selectedArtifactIds: [],
    batchGroup: null,
    status: "idle",
    error: "",
    derivationId: "",
    taskId: "",
    generationModelCode: "",
    ...state,
  });
  if (state.status === "idle") {
    state.status = recoveredMediaStatus(state);
  }
  ui.canvasMediaTools = state;
  return state;
}

export function renderCanvasMediaToolsShell(ui = {}) {
  const state = ensureCanvasMediaToolsState(ui);
  if (!state.open) return "";
  const selected = ui.canvasDocument?.nodes?.find?.((node) => node.id === ui.selectedCanvasNodeId);
  const sourcePreviewUrl = resolveMediaSourcePreviewUrl(selected);
  const artifacts = mediaArtifactsForNode(ui, selected?.id);
  const canvasArtifacts = mediaArtifactsForCanvas(ui, selected?.id);
  const imageModelOptions = resolveMediaImageModelOptions(ui);
  syncMediaGenerationModelCode(ui, state, selected, imageModelOptions);
  const generating = state.status === "running";
  const busy = generating || state.status === "submitting";
  const submitLabel = generating ? "生成中" : busy ? "提交中" : "开始处理";
  return `
    <div class="canvas-media-tools-backdrop" data-media-action="close">
      <aside class="canvas-media-tools-drawer canvas-media-tools-modal is-${escapeAttr(state.tool)} ${state.tool === "camera_studio" ? "is-camera-studio" : ""}" role="dialog" aria-label="媒体编辑" aria-modal="true">
        <button type="button" class="canvas-media-drawer-grip" data-media-drawer-grip data-media-action="drawer-grip" aria-label="关闭媒体编辑" title="点击或向下滑动关闭"></button>
        <header><strong>媒体编辑</strong><button type="button" data-media-action="close" aria-label="关闭">×</button></header>
        <div class="canvas-media-tool-tabs" role="tablist">
          ${MEDIA_TOOLS.map((tool) => `<button type="button" role="tab" aria-selected="${state.tool === tool.id}" class="${state.tool === tool.id ? "active" : ""}" data-media-action="select-tool" data-media-tool="${tool.id}">${tool.label}</button>`).join("")}
        </div>
        <section>
          <label><span>源节点</span><input value="${escapeAttr(selected?.data?.title ?? selected?.id ?? "未选择图片")}" disabled /></label>
          ${MEDIA_TOOLS_WITH_INSTRUCTION.has(state.tool) ? `<label class="canvas-media-instruction-field"><span>编辑要求</span><textarea data-media-field="instruction" placeholder="描述构图、视角或需要保留的内容">${escapeHtml(state.instruction)}</textarea></label>` : ""}
          ${state.tool === "free_view"
            ? renderFreeViewPreview(selected, sourcePreviewUrl, state)
            : !["crop", "slice", "annotation", "camera_studio"].includes(state.tool) ? renderMediaSourcePreview(selected, sourcePreviewUrl) : ""}
          ${state.tool === "crop" ? `
            ${renderCropStage(state, selected, sourcePreviewUrl)}
            <div class="canvas-media-crop-grid">
              ${numberField("X", "cropX", state.cropX, 0, 100)}
              ${numberField("Y", "cropY", state.cropY, 0, 100)}
              ${numberField("宽度", "cropWidth", state.cropWidth, 1, 100)}
              ${numberField("高度", "cropHeight", state.cropHeight, 1, 100)}
            </div>
          ` : ""}
          ${state.tool === "outpaint" ? numberField("扩展像素", "outpaintPixels", state.outpaintPixels, 32, 2048) : ""}
          ${state.tool === "slice" ? renderSliceStage(state, selected, sourcePreviewUrl) : ""}
          ${renderProfessionalControls(state, canvasArtifacts, sourcePreviewUrl)}
          ${state.tool === "annotation" ? `
            <div class="canvas-media-annotation-stage" style="background-image:url('${escapeAttr(sourcePreviewUrl)}')">
              <canvas width="640" height="360" tabindex="0" data-media-annotation-canvas aria-label="图片标注画布"></canvas>
              <textarea class="canvas-media-annotation-text-editor" data-media-annotation-text-editor aria-label="编辑标注文字" hidden></textarea>
            </div>
            <div class="canvas-media-annotation-toolbar" role="toolbar" aria-label="标注工具">
              <button type="button" class="${state.annotationTool === "select" ? "active" : ""}" aria-pressed="${state.annotationTool === "select"}" data-media-action="annotation-tool" data-annotation-tool="select">选择</button>
              <button type="button" class="${state.annotationTool === "brush" ? "active" : ""}" aria-pressed="${state.annotationTool === "brush"}" data-media-action="annotation-tool" data-annotation-tool="brush">画笔</button>
              <button type="button" class="${state.annotationTool === "rectangle" ? "active" : ""}" aria-pressed="${state.annotationTool === "rectangle"}" data-media-action="annotation-tool" data-annotation-tool="rectangle">矩形</button>
              <button type="button" class="${state.annotationTool === "arrow" ? "active" : ""}" aria-pressed="${state.annotationTool === "arrow"}" data-media-action="annotation-tool" data-annotation-tool="arrow">箭头</button>
              <button type="button" class="${state.annotationTool === "marker" ? "active" : ""}" aria-pressed="${state.annotationTool === "marker"}" data-media-action="annotation-tool" data-annotation-tool="marker">编号</button>
              <button type="button" class="${state.annotationTool === "text" ? "active" : ""}" aria-pressed="${state.annotationTool === "text"}" data-media-action="annotation-tool" data-annotation-tool="text">文字</button>
              <button type="button" class="${state.annotationTool === "eraser" ? "active" : ""}" aria-pressed="${state.annotationTool === "eraser"}" data-media-action="annotation-tool" data-annotation-tool="eraser">橡皮擦</button>
              <button type="button" data-media-action="annotation-undo">撤销</button>
              <button type="button" data-media-action="annotation-redo">重做</button>
              <button type="button" data-media-action="annotation-clear">清空</button>
            </div>
            <div class="canvas-media-crop-grid">
              ${numberField("画笔", "brushSize", state.brushSize, 2, 96)}
              <label><span>颜色</span><input type="color" data-media-field="annotationColor" value="${escapeAttr(state.annotationColor)}" /></label>
              ${state.annotationTool === "text" ? `<label><span>文字</span><input data-media-field="annotationText" value="${escapeAttr(state.annotationText)}" /></label>` : ""}
              ${state.annotationTool === "text" ? numberField("字号", "annotationFontSize", state.annotationFontSize, 8, 120) : ""}
              <label><span>图层</span><select data-media-field="layerKind"><option value="mask" ${state.layerKind === "mask" ? "selected" : ""}>蒙版</option><option value="raster_annotation" ${state.layerKind === "raster_annotation" ? "selected" : ""}>栅格标注</option><option value="vector_annotation" ${state.layerKind === "vector_annotation" ? "selected" : ""}>矢量标注</option></select></label>
            </div>
            ${renderAnnotationLayerList(state, sourcePreviewUrl)}
          ` : ""}
          ${state.tool === "batch_grid" ? renderBatchGrid(state, artifacts) : ""}
        </section>
        ${renderMediaLimits(ui, state, selected)}
        <footer>
          ${["outpaint", "remove_background", "free_view", "camera_studio"].includes(state.tool)
            ? renderMediaModelField(state, imageModelOptions)
            : ""}
          <div class="canvas-media-submit-controls">
            <button type="button" data-media-action="submit" ${busy || !selected ? "disabled" : ""}>${submitLabel}</button>
          </div>
        </footer>
        ${state.error ? `<p class="canvas-media-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
      </aside>
    </div>
  `;
}

export function createCanvasMediaToolsController({ surface, workbench, render }) {
  const state = ensureCanvasMediaToolsState(workbench.ui ?? (workbench.ui = {}));
  let cameraStudioViewportController = null;
  const bindCameraStudioViewport = () => cameraStudioViewportController?.bind?.(cameraStudioViewportState(workbench, state));
  const rerender = () => {
    const current = surface?.querySelector?.(".canvas-media-tools-backdrop");
    if (!current || typeof document === "undefined") {
      const result = render?.();
      if (result && typeof result.then === "function") {
        return result.then((value) => {
          void bindCameraStudioViewport();
          return value;
        });
      }
      void bindCameraStudioViewport();
      return result;
    }
    const template = document.createElement("template");
    template.innerHTML = renderCanvasMediaToolsShell(workbench.ui);
    const next = template.content.firstElementChild;
    if (!next) {
      current.remove?.();
      void bindCameraStudioViewport();
      return true;
    }
    const currentAnnotationCanvas = current.querySelector?.("[data-media-annotation-canvas]");
    const nextAnnotationCanvas = next.querySelector?.("[data-media-annotation-canvas]");
    if (currentAnnotationCanvas && nextAnnotationCanvas) {
      nextAnnotationCanvas.replaceWith(currentAnnotationCanvas);
    }
    current.replaceWith?.(next);
    void bindCameraStudioViewport();
    return true;
  };
  const applyViewportPatch = (kind, patch = {}) => {
    const prefix = kind === "light" ? "light" : "camera";
    const fields = [
      [`${prefix}YawDegrees`, patch.yaw ?? patch.yawDegrees],
      [`${prefix}PitchDegrees`, patch.pitch ?? patch.pitchDegrees],
    ];
    for (const [field, value] of fields) {
      if (!Number.isFinite(Number(value))) continue;
      state[field] = Math.round(Number(value) * 10) / 10;
      syncCameraStudioLiveElements(surface, state, field);
    }
    cameraStudioViewportController?.update?.(cameraStudioViewportState(workbench, state));
  };
  cameraStudioViewportController = createCanvasCameraStudioViewportController({
    surface,
    onCameraChange: (patch) => applyViewportPatch("camera", patch),
    onLightChange: (patch) => applyViewportPatch("light", patch),
  });
  const annotationHistory = [];
  let cropDrag = null;
  let sliceDrag = null;
  let freeViewDrag = null;
  let annotationDrag = null;
  let annotationSelectionDrag = null;
  let annotationTextEditor = null;
  let drawerDrag = null;
  let suppressDrawerGripClick = false;
  let restoreFocusTarget = null;
  let copyFeedbackTimer = null;
  const commitAnnotationTextEdit = () => {
    if (!annotationTextEditor) return false;
    const { element, annotation } = annotationTextEditor;
    const text = String(element.value ?? "").trim();
    if (text) annotation.text = text;
    else state.annotations = (state.annotations ?? []).filter((item) => item.id !== annotation.id);
    element.hidden = true;
    annotationTextEditor = null;
    const canvas = surface?.querySelector?.("[data-media-annotation-canvas]");
    redrawStructuredAnnotations(canvas, state);
    return true;
  };
  const refreshRecoveryState = async () => {
    const before = mediaRecoveryRenderSnapshot(state);
    await refreshCanvasMediaRecoveryState(workbench, state).catch((error) => {
      state.error = friendlyError(error);
      rerender();
    });
    if (before !== mediaRecoveryRenderSnapshot(state)) rerender();
  };
  const closeAndRestoreFocus = async () => {
    const closeAnimation = animateMediaDrawerClose(surface);
    if (closeAnimation) await closeAnimation;
    state.open = false;
    await rerender();
    const currentTrigger = surface?.querySelector?.('button[data-media-action="open"]');
    const focusTarget = restoreFocusTarget?.isConnected === false ? currentTrigger : restoreFocusTarget ?? currentTrigger;
    focusTarget?.focus?.();
    restoreFocusTarget = null;
  };
  return {
    async handleChange(target) {
      if (!target?.matches?.("[data-media-composite-upload]")) return false;
      const [file] = [...(target.files ?? [])];
      target.value = "";
      if (!file) return true;
      if (!String(file.type ?? "").toLowerCase().startsWith("image/")) {
        state.error = "合成只支持上传图片。";
        await rerender();
        return true;
      }
      if (typeof workbench.api?.uploadFile !== "function") {
        state.error = "图片上传接口暂不可用。";
        await rerender();
        return true;
      }
      state.status = "submitting";
      state.error = "";
      await rerender();
      try {
        const payload = await workbench.api.uploadFile(file, {
          category: "canvas-derivations",
          projectId: null,
          canvasProjectId: String(workbench.ui?.selectedCanvasProjectId ?? "") || null,
        });
        const upload = payload?.upload ?? payload;
        const storageObjectId = String(upload?.storageObjectId ?? "").trim();
        const url = String(
          storageObjectId
            ? `/api/storage/objects/${encodeURIComponent(storageObjectId)}/content?proxy=1`
            : upload?.previewUrl ?? upload?.publicUrl ?? "",
        ).trim();
        if (!url) throw new Error("canvas_media_upload_missing");
        const artifactId = `upload:${storageObjectId || Date.now()}`;
        state.compositeUpload = { artifactId, title: file.name || "上传图片", url, source: { storageObjectId: storageObjectId || null, url } };
        state.compositeSecondaryArtifactId = artifactId;
        state.compositeSecondarySource = state.compositeUpload.source;
        state.status = "idle";
      } catch (error) {
        state.status = "failed";
        state.error = friendlyError(error);
      }
      await rerender();
      return true;
    },
    handleInput(target) {
      const field = String(target?.dataset?.mediaField ?? "");
      const colorField = String(target?.dataset?.mediaColorHex ?? "");
      if (colorField === "lightColor") {
        const color = normalizeCameraStudioLightColor(target.value);
        if (String(target.value ?? "").trim().toLowerCase() !== color) return false;
        state.lightColor = color;
        state.lightTemperature = "custom";
        state.cameraPromptCopied = false;
        syncCameraStudioLiveElements(surface, state, colorField);
        cameraStudioViewportController.update(cameraStudioViewportState(workbench, state));
        return true;
      }
      if (!field) return false;
      if (field === "batchArtifact") {
        const id = String(target.value ?? "");
        state.selectedArtifactIds = target.checked
          ? [...new Set([...(state.selectedArtifactIds ?? []), id])]
          : (state.selectedArtifactIds ?? []).filter((item) => item !== id);
      } else {
        state[field] = ["number", "range"].includes(target.type)
          ? Number(target.value)
          : target.type === "checkbox"
            ? target.checked === true
            : String(target.value ?? "");
        if (field === "lightColor") {
          state.lightColor = normalizeCameraStudioLightColor(state.lightColor);
          state.lightTemperature = "custom";
        }
        if (field === "cameraLens" && state.cameraLens !== "fisheye") {
          const focalLength = Number.parseInt(state.cameraLens, 10);
          if (Number.isFinite(focalLength)) {
            state.cameraFocalLengthMm = focalLength;
            if (state.tool === "camera_studio") syncCameraStudioLiveElements(surface, state, "cameraFocalLengthMm");
          }
        }
        if (field === "compositeSecondaryArtifactId") {
          const artifact = [...mediaArtifactsForCanvas(workbench.ui, workbench.ui?.selectedCanvasNodeId), state.compositeUpload].filter(Boolean).find((item) => item.artifactId === state.compositeSecondaryArtifactId);
          state.compositeSecondarySource = artifact ? artifact.source : null;
        }
        if (field === "sliceRows" || field === "sliceColumns") {
          normalizeAllSliceLinePositions(state);
          const focusField = field;
          const focusValue = String(target.value ?? "");
          const nextRender = rerender();
          if (nextRender && typeof nextRender.then === "function") {
            void nextRender.then(() => {
              const nextField = surface?.querySelector?.(`[data-media-field="${focusField}"]`);
              if (!nextField) return;
              nextField.focus?.();
              nextField.value = focusValue;
            });
          } else {
            const nextField = surface?.querySelector?.(`[data-media-field="${focusField}"]`);
            if (nextField) {
              nextField.focus?.();
              nextField.value = focusValue;
            }
          }
        }
      }
      if (field === "layerKind" && state.tool === "annotation") {
        syncAnnotationLayerPreview(surface, state);
      }
      if (["annotationColor", "brushSize"].includes(field) && state.tool === "annotation") {
        syncAnnotationLayerPreview(surface, state);
      }
      if (field === "lightTemperature") {
        if (state.lightTemperature !== "custom") {
          state.lightColor = cameraStudioTemperatureColor(state.lightTemperature);
        }
        if (state.tool === "camera_studio") syncCameraStudioLiveElements(surface, state, "lightColor");
      }
      if (state.tool === "camera_studio" && /^(camera|light)/.test(field)) {
        state.cameraPromptCopied = false;
        syncCameraStudioLiveElements(surface, state, field);
        cameraStudioViewportController.update(cameraStudioViewportState(workbench, state));
      }
      if (state.tool === "free_view" && /^(viewAzimuthDegrees|viewElevationDegrees|viewDistanceScale)$/.test(field)) {
        syncFreeViewLiveElements(surface, state);
      }
      if (state.tool === "crop" && field.startsWith("crop")) {
        syncCropVisualElements(surface, state);
      }
      return true;
    },
    handlePointerDown(event, target) {
      if (annotationTextEditor && !target?.closest?.("[data-media-annotation-text-editor]")) {
        commitAnnotationTextEdit();
        if (target?.matches?.("[data-media-annotation-canvas]")) return true;
      }
      const drawerGripCandidate = target?.matches?.("[data-media-drawer-grip]")
        ? target
        : target?.closest?.("[data-media-drawer-grip]");
      const drawerGrip = Object.prototype.hasOwnProperty.call(drawerGripCandidate?.dataset ?? {}, "mediaDrawerGrip")
        ? drawerGripCandidate
        : null;
      if (drawerGrip) {
        const drawer = drawerGrip.closest?.(".canvas-media-tools-drawer") ?? surface?.querySelector?.(".canvas-media-tools-drawer");
        if (!drawer || !isMobileMediaDrawer(drawer)) return false;
        drawerDrag = {
          drawer,
          pointerId: event.pointerId,
          startY: Number(event.clientY),
          currentY: Number(event.clientY),
        };
        drawer.classList?.add?.("is-dragging");
        drawerGrip.setPointerCapture?.(event.pointerId);
        return true;
      }
      const cropHandle = target?.closest?.("[data-media-crop-handle]") ?? (target?.matches?.("[data-media-crop-handle]") ? target : null);
      if (cropHandle) {
        const stage = cropHandle.closest?.("[data-media-crop-stage]") ?? surface?.querySelector?.("[data-media-crop-stage]");
        const rect = stage?.getBoundingClientRect?.();
        if (!rect?.width || !rect?.height) return false;
        cropDrag = {
          handle: String(cropHandle.dataset.mediaCropHandle ?? "move"),
          pointerId: event.pointerId,
          clientX: Number(event.clientX),
          clientY: Number(event.clientY),
          rect,
          crop: cropRect(state),
          changed: false,
        };
        cropHandle.setPointerCapture?.(event.pointerId);
        return true;
      }
      const sliceHandle = target?.closest?.("[data-media-slice-handle]") ?? (target?.matches?.("[data-media-slice-handle]") ? target : null);
      if (sliceHandle && state.tool === "slice") {
        const stage = sliceHandle.closest?.("[data-media-slice-stage]") ?? surface?.querySelector?.("[data-media-slice-stage]");
        const rect = stage?.getBoundingClientRect?.();
        if (!rect?.width || !rect?.height) return false;
        sliceDrag = {
          axis: sliceHandle.dataset.mediaSliceAxis === "row" ? "row" : "column",
          index: Math.max(0, Number(sliceHandle.dataset.mediaSliceIndex) || 0),
          pointerId: event.pointerId,
          rect,
        };
        sliceHandle.setPointerCapture?.(event.pointerId);
        return true;
      }
      const freeViewPreview = state.tool === "free_view"
        ? target?.closest?.("[data-free-view-preview]")
        : null;
      if (freeViewPreview) {
        freeViewDrag = {
          pointerId: event.pointerId,
          clientX: Number(event.clientX),
          clientY: Number(event.clientY),
          preview: freeViewPreview,
        };
        freeViewPreview.setPointerCapture?.(event.pointerId);
        freeViewPreview.classList?.add?.("is-dragging");
        return true;
      }
      if (!target?.matches?.("[data-media-annotation-canvas]")) return false;
      const annotationPointValue = annotationPoint(target, event);
      if (!annotationPointValue) return false;
      const snapshot = captureAnnotationCanvas(target);
      if (snapshot) {
        annotationHistory.push(snapshot);
        if (annotationHistory.length > 30) annotationHistory.shift();
      }
      state.annotationDrawing = true;
      if (state.annotationTool === "select") {
        const hit = findAnnotationAtPoint(state.annotations, annotationPointValue);
        state.selectedAnnotationId = hit?.id ?? "";
        const selected = hit ? state.annotations.find((item) => item.id === hit.id) : null;
        if (selected) annotationSelectionDrag = { canvas: target, pointerId: event.pointerId, last: annotationPointValue, annotation: selected };
        redrawStructuredAnnotations(target, state);
        target.setPointerCapture?.(event.pointerId);
        return true;
      }
      if (state.annotationTool === "eraser") {
        const hit = findAnnotationAtPoint(state.annotations, annotationPointValue);
        if (hit) {
          const removedIndex = (state.annotations ?? []).findIndex((item) => item.id === hit.id);
          state.annotations = (state.annotations ?? []).filter((item) => item.id !== hit.id);
          if (hit.type === "brush" && removedIndex >= 0) state.vectorStrokes.splice(removedIndex, 1);
          redrawStructuredAnnotations(target, state);
        } else {
          const legacyHit = findAnnotationAtPoint(strokesToAnnotations(state.vectorStrokes), annotationPointValue);
          if (legacyHit) {
            const legacyIndex = Number(String(legacyHit.id).split('-').at(-1));
            if (Number.isInteger(legacyIndex) && legacyIndex >= 0) state.vectorStrokes.splice(legacyIndex, 1);
            redrawVectorStrokes(target, state.vectorStrokes, state.layerKind);
          } else {
            eraseAnnotationPixel(target, event, state);
            state.annotationDrawing = true;
          }
        }
        if (state.annotationTool === "eraser" && state.annotationDrawing !== true) state.annotationDrawing = false;
        return true;
      }
      if (["rectangle", "arrow"].includes(state.annotationTool)) {
        annotationDrag = { canvas: target, pointerId: event.pointerId, start: annotationPointValue, end: annotationPointValue };
        target.setPointerCapture?.(event.pointerId);
        return true;
      }
      if (state.annotationTool === "marker" || state.annotationTool === "text") {
        addStructuredAnnotation(state, annotationPointValue, annotationPointValue);
        redrawStructuredAnnotations(target, state);
        state.annotationDrawing = false;
        return true;
      }
      if (state.annotationMode !== "erase") {
        state.vectorStrokes.push({ width: Number(state.brushSize) || 24, points: [annotationPointValue] });
      }
      drawAnnotationPoint(target, event, state, true);
      target.setPointerCapture?.(event.pointerId);
      return true;
    },
    handlePointerMove(event, target) {
      if (drawerDrag && event.pointerId === drawerDrag.pointerId) {
        drawerDrag.currentY = Number(event.clientY);
        const offset = Math.max(0, drawerDrag.currentY - drawerDrag.startY);
        drawerDrag.drawer.style?.setProperty?.("--canvas-media-drawer-offset", `${offset}px`);
        return true;
      }
      if (cropDrag && event.pointerId === cropDrag.pointerId) {
        updateCropFromPointer(state, cropDrag, event);
        syncCropVisualElements(surface, state);
        return true;
      }
      if (sliceDrag && event.pointerId === sliceDrag.pointerId) {
        updateSliceLineFromPointer(state, sliceDrag, event);
        syncSliceVisualElements(surface, state);
        return true;
      }
      if (freeViewDrag && event.pointerId === freeViewDrag.pointerId) {
        const deltaX = Number(event.clientX) - freeViewDrag.clientX;
        const deltaY = Number(event.clientY) - freeViewDrag.clientY;
        freeViewDrag.clientX = Number(event.clientX);
        freeViewDrag.clientY = Number(event.clientY);
        state.viewAzimuthDegrees = clamp((Number(state.viewAzimuthDegrees) || 0) + deltaX * 0.6, -180, 180);
        state.viewElevationDegrees = clamp((Number(state.viewElevationDegrees) || 0) - deltaY * 0.45, -90, 90);
        syncFreeViewLiveElements(surface, state);
        return true;
      }
      if (annotationDrag && target?.matches?.("[data-media-annotation-canvas]")) {
        const point = annotationPoint(target, event);
        if (point) annotationDrag.end = point;
        redrawStructuredAnnotations(target, state, createAnnotationDraft(state, annotationDrag.start, annotationDrag.end));
        return true;
      }
      if (annotationSelectionDrag && event.pointerId === annotationSelectionDrag.pointerId) {
        const point = annotationPoint(target, event);
        if (point) {
          const dx = point.x - annotationSelectionDrag.last.x;
          const dy = point.y - annotationSelectionDrag.last.y;
          moveAnnotation(annotationSelectionDrag.annotation, dx, dy);
          annotationSelectionDrag.last = point;
          redrawStructuredAnnotations(target, state);
        }
        return true;
      }
      if (!state.annotationDrawing || !target?.matches?.("[data-media-annotation-canvas]")) return false;
      if (state.annotationTool === "eraser") {
        eraseAnnotationPixel(target, event, state);
        return true;
      }
      if (state.annotationMode !== "erase") {
        const point = annotationPoint(target, event);
        if (point) state.vectorStrokes.at(-1)?.points?.push?.(point);
      }
      drawAnnotationPoint(target, event, state, false);
      return true;
    },
    handlePointerUp(event, target) {
      if (drawerDrag && event.pointerId === drawerDrag.pointerId) {
        const { drawer, startY, currentY } = drawerDrag;
        target?.releasePointerCapture?.(event.pointerId);
        drawerDrag = null;
        const offset = Math.max(0, currentY - startY);
        suppressDrawerGripClick = offset > 6;
        drawer.classList?.remove?.("is-dragging");
        if (shouldDismissMediaDrawer(offset, drawer.getBoundingClientRect?.().height)) {
          void closeAndRestoreFocus();
        } else {
          drawer.style?.removeProperty?.("--canvas-media-drawer-offset");
        }
        return true;
      }
      if (cropDrag && event.pointerId === cropDrag.pointerId) {
        target?.releasePointerCapture?.(event.pointerId);
        const changed = cropDrag.changed;
        cropDrag = null;
        if (changed) rerender();
        return true;
      }
      if (sliceDrag && event.pointerId === sliceDrag.pointerId) {
        target?.releasePointerCapture?.(event.pointerId);
        sliceDrag = null;
        rerender();
        return true;
      }
      if (freeViewDrag && event.pointerId === freeViewDrag.pointerId) {
        freeViewDrag.preview?.releasePointerCapture?.(event.pointerId);
        freeViewDrag.preview?.classList?.remove?.("is-dragging");
        freeViewDrag = null;
        return true;
      }
      if (annotationDrag && event.pointerId === annotationDrag.pointerId) {
        const canvas = annotationDrag.canvas;
        const point = annotationPoint(canvas, event);
        if (point) annotationDrag.end = point;
        addStructuredAnnotation(state, annotationDrag.start, annotationDrag.end);
        redrawStructuredAnnotations(canvas, state);
        canvas.releasePointerCapture?.(event.pointerId);
        annotationDrag = null;
        state.annotationDrawing = false;
        return true;
      }
      if (annotationSelectionDrag && event.pointerId === annotationSelectionDrag.pointerId) {
        annotationSelectionDrag.canvas.releasePointerCapture?.(event.pointerId);
        annotationSelectionDrag = null;
        state.annotationDrawing = false;
        return true;
      }
      if (!state.annotationDrawing) return false;
      state.annotationDrawing = false;
      if (state.annotationTool === "brush" && state.annotationMode !== "erase") {
        const stroke = state.vectorStrokes?.at?.(-1);
        if (stroke?.points?.length > 1) {
          state.annotations = [...(state.annotations ?? []), {
            id: `brush-${Date.now()}-${state.annotations?.length ?? 0}`,
            type: "brush",
            color: state.annotationColor,
            strokeWidth: stroke.width,
            points: stroke.points,
          }];
        }
      }
      target?.releasePointerCapture?.(event.pointerId);
      return true;
    },
    handleKeydown(event, target) {
      if (!state.open) return false;
      if (target?.matches?.("[data-media-annotation-text-editor]")) {
        if (event.key === "Escape") {
          event.preventDefault?.();
          target.hidden = true;
          annotationTextEditor = null;
          return true;
        }
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault?.();
          commitAnnotationTextEdit();
          return true;
        }
        return false;
      }
      const cropHandle = target?.closest?.("[data-media-crop-handle]") ?? (target?.matches?.("[data-media-crop-handle]") ? target : null);
      if (cropHandle && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event?.key)) {
        event.preventDefault?.();
        nudgeCrop(state, String(cropHandle.dataset.mediaCropHandle ?? "move"), event.key, event.shiftKey ? 5 : 1);
        rerender();
        return true;
      }
      if (event?.key === "Escape") {
        event.preventDefault?.();
        event.stopPropagation?.();
        void closeAndRestoreFocus();
        return true;
      }
      if (event?.key !== "Tab") return false;
      const drawer = surface?.querySelector?.(".canvas-media-tools-drawer");
      const focusable = mediaDrawerFocusableElements(drawer);
      if (!focusable.length) return false;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!drawer?.contains?.(target)) {
        event.preventDefault?.();
        (event.shiftKey ? last : first)?.focus?.();
        return true;
      }
      if (event.shiftKey && target === first) {
        event.preventDefault?.();
        last?.focus?.();
        return true;
      }
      if (!event.shiftKey && target === last) {
        event.preventDefault?.();
        first?.focus?.();
        return true;
      }
      return false;
    },
    handleDoubleClick(event, target) {
      if (state.tool !== "annotation" || !target?.matches?.("[data-media-annotation-canvas]")) return false;
      const point = annotationPoint(target, event);
      const hit = findAnnotationAtPoint(state.annotations, point);
      if (!hit || hit.type !== "text") return false;
      const annotation = state.annotations.find((item) => item.id === hit.id);
      const editor = surface?.querySelector?.("[data-media-annotation-text-editor]");
      const rect = target.getBoundingClientRect?.();
      if (!annotation || !editor || !rect?.width || !rect?.height) return false;
      commitAnnotationTextEdit();
      editor.value = annotation.text;
      editor.style.left = `${Math.max(0, annotation.x * rect.width / target.width)}px`;
      editor.style.top = `${Math.max(0, annotation.y * rect.height / target.height)}px`;
      editor.style.fontSize = `${Math.max(12, annotation.fontSize * rect.width / target.width)}px`;
      editor.hidden = false;
      annotationTextEditor = { element: editor, annotation };
      editor.focus?.();
      editor.select?.();
      return true;
    },
    handleBlur(target) {
      if (target?.matches?.("[data-media-annotation-text-editor]")) return commitAnnotationTextEdit();
      return false;
    },
    async handleAction(target, event) {
      const action = String(target?.dataset?.mediaAction ?? "");
      if (!action) return false;
      if (action === "drawer-grip") {
        commitAnnotationTextEdit();
        if (suppressDrawerGripClick) {
          suppressDrawerGripClick = false;
          return true;
        }
        await closeAndRestoreFocus();
        return true;
      }
      if (action === "close") {
        commitAnnotationTextEdit();
        if (target.matches?.(".canvas-media-tools-backdrop") && event && target !== event.target) {
          return true;
        }
        await closeAndRestoreFocus();
        return true;
      }
      if (action === "open") {
        restoreFocusTarget = target?.focus ? target : activeElementForSurface(surface);
        state.recoveryNodeId = String(workbench.ui?.selectedCanvasNodeId ?? "");
        if (MEDIA_TOOLS.some((tool) => tool.id === target.dataset.mediaTool)) {
          state.tool = target.dataset.mediaTool;
        }
        state.open = true;
        state.error = "";
        if (typeof workbench.ensureCanvasGenerationConfig === "function") {
          await workbench.ensureCanvasGenerationConfig({ mediaType: "image" }).catch((error) => {
            state.error = `模型列表加载失败：${friendlyError(error)}`;
          });
        }
        await rerender();
        focusFirstMediaDrawerControl(surface);
        if (state.tool === "annotation") await loadAnnotationLayers(workbench, state, rerender);
        void refreshRecoveryState();
        return true;
      }
      if (action === "select-tool") {
        commitAnnotationTextEdit();
        state.tool = MEDIA_TOOLS.some((tool) => tool.id === target.dataset.mediaTool) ? target.dataset.mediaTool : "crop";
        state.error = "";
        if (["outpaint", "remove_background", "free_view", "camera_studio"].includes(state.tool)
          && typeof workbench.ensureCanvasGenerationConfig === "function") {
          await workbench.ensureCanvasGenerationConfig({ mediaType: "image" }).catch((error) => {
            state.error = `模型列表加载失败：${friendlyError(error)}`;
          });
        }
        await rerender();
        if (state.tool === "annotation") await loadAnnotationLayers(workbench, state, rerender);
        return true;
      }
      if (action === "composite-upload-trigger") {
        surface?.querySelector?.("[data-media-composite-upload]")?.click?.();
        return true;
      }
      if (action === "camera-studio-mode") {
        const mode = String(target.dataset.cameraStudioMode ?? "");
        state.cameraStudioMode = ["camera", "lighting", "dual"].includes(mode) ? mode : "camera";
        if (state.cameraStudioMode !== "dual") state.cameraStudioActiveControl = state.cameraStudioMode;
        state.cameraPromptCopied = false;
        rerender();
        return true;
      }
      if (action === "camera-studio-control") {
        state.cameraStudioActiveControl = target.dataset.cameraStudioControl === "lighting" ? "lighting" : "camera";
        state.cameraPromptCopied = false;
        rerender();
        return true;
      }
      if (action === "camera-studio-preset") {
        applyCameraStudioPreset(state, target.dataset.cameraStudioPreset);
        state.cameraPromptCopied = false;
        rerender();
        return true;
      }
      if (action === "camera-studio-reset") {
        resetCameraStudioState(state);
        rerender();
        return true;
      }
      if (action === "camera-studio-copy") {
        try {
          const writeText = globalThis.navigator?.clipboard?.writeText;
          if (typeof writeText !== "function") throw new Error("clipboard_unavailable");
          await writeText.call(globalThis.navigator.clipboard, buildCameraStudioPrompt(state));
          state.cameraPromptCopied = true;
          state.error = "";
          rerender();
          if (copyFeedbackTimer !== null) clearTimeout(copyFeedbackTimer);
          copyFeedbackTimer = setTimeout(() => {
            state.cameraPromptCopied = false;
            copyFeedbackTimer = null;
            rerender();
          }, 1_600);
        } catch {
          state.cameraPromptCopied = false;
          state.error = "提示词复制失败";
          rerender();
        }
        return true;
      }
      if (action === "annotation-mode") {
        state.annotationMode = target.dataset.annotationMode === "erase" ? "erase" : "draw";
        for (const button of surface?.querySelectorAll?.("[data-media-action='annotation-mode']") ?? []) {
          const active = button.dataset.annotationMode === state.annotationMode;
          button.classList?.toggle?.("active", active);
          button.setAttribute?.("aria-pressed", String(active));
        }
        return true;
      }
      if (action === "annotation-tool") {
        commitAnnotationTextEdit();
        state.annotationTool = ["select", "brush", "rectangle", "arrow", "marker", "text", "eraser"].includes(target.dataset.annotationTool)
          ? target.dataset.annotationTool
          : "brush";
        state.annotationMode = "draw";
        rerender();
        return true;
      }
      if (action === "annotation-undo") {
        const removedAnnotation = state.annotations?.at?.(-1);
        const removedStroke = state.vectorStrokes?.at?.(-1);
        if (removedAnnotation || removedStroke) state.annotationRedo.push({ annotation: removedAnnotation ?? null, stroke: removedStroke ?? null });
        state.vectorStrokes.pop();
        state.annotations = (state.annotations ?? []).slice(0, -1);
        const canvas = surface?.querySelector?.("[data-media-annotation-canvas]");
        restoreAnnotationCanvas(canvas, annotationHistory.pop());
        syncAnnotationLayerPreview(surface, state);
        return true;
      }
      if (action === "annotation-redo") {
        const next = state.annotationRedo?.pop?.();
        if (next?.annotation) state.annotations = [...(state.annotations ?? []), next.annotation];
        if (next?.stroke) state.vectorStrokes = [...(state.vectorStrokes ?? []), next.stroke];
        const canvas = surface?.querySelector?.("[data-media-annotation-canvas]");
        redrawStructuredAnnotations(canvas, state);
        return true;
      }
      if (action === "annotation-clear") {
        const canvas = surface?.querySelector?.("[data-media-annotation-canvas]");
        const snapshot = captureAnnotationCanvas(canvas);
        if (snapshot) annotationHistory.push(snapshot);
        canvas?.getContext?.("2d")?.clearRect?.(0, 0, canvas.width, canvas.height);
        state.vectorStrokes = [];
        state.annotations = [];
        return true;
      }
      if (action === "load-annotation-layer") {
        const layer = (state.annotationLayers ?? []).find((item) => item.id === target.dataset.layerId);
        await loadAnnotationLayer(surface, layer, state);
        await rerender();
        return true;
      }
      if (action === "submit") {
        if (state.tool === "crop") await submitLocalCrop(workbench, state, rerender);
        else if (state.tool === "slice") await submitLocalSlice(workbench, state, rerender);
        else if (state.tool === "composite") await submitLocalComposite(workbench, state, rerender);
        else if (state.tool === "annotation") await submitAnnotation(workbench, state, rerender, surface);
        else if (state.tool === "batch_grid") await submitBatchGroup(workbench, state, rerender);
        else await submitDerivation(workbench, state, rerender);
        await persistCanvasMediaRecoveryState(workbench, state);
        return true;
      }
      if (action === "select-batch-artifact") {
        const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
        const artifactId = String(target.dataset.artifactId ?? "");
        if (canvasId && state.batchGroup?.id && artifactId) {
          await workbench.api?.selectCanvasImageBatchArtifact?.(canvasId, state.batchGroup.id, { artifactId });
          state.batchGroup = { ...state.batchGroup, selectedArtifactId: artifactId };
          rerender();
        }
        return true;
      }
      return false;
    },
    handleWheel(event, target) {
      if (state.tool !== "free_view" || !target?.closest?.("[data-free-view-preview]")) return false;
      state.viewDistanceScale = clamp((Number(state.viewDistanceScale) || 1) + Number(event.deltaY || 0) * 0.004, 0.1, 5);
      syncFreeViewLiveElements(surface, state);
      return true;
    },
    dispose() {
      state.open = false;
      state.annotationDrawing = false;
      cropDrag = null;
      freeViewDrag = null;
      drawerDrag = null;
      suppressDrawerGripClick = false;
      annotationHistory.length = 0;
      restoreFocusTarget = null;
      if (copyFeedbackTimer !== null) clearTimeout(copyFeedbackTimer);
      copyFeedbackTimer = null;
      cameraStudioViewportController.dispose();
      surface?.querySelector?.(".canvas-media-tools-backdrop")?.remove?.();
    },
  };
}

function cameraStudioViewportState(workbench, state) {
  const selected = workbench?.ui?.canvasDocument?.nodes?.find?.((node) => node.id === workbench?.ui?.selectedCanvasNodeId);
  return {
    imageUrl: resolveMediaSourcePreviewUrl(selected),
    cameraStudioMode: state.cameraStudioMode,
    cameraStudioActiveControl: state.cameraStudioActiveControl,
    cameraYawDegrees: state.cameraYawDegrees,
    cameraPitchDegrees: state.cameraPitchDegrees,
    cameraRollDegrees: state.cameraRollDegrees,
    lightYawDegrees: state.lightYawDegrees,
    lightPitchDegrees: state.lightPitchDegrees,
    lightIntensityPercent: state.lightIntensityPercent,
    lightTemperature: state.lightTemperature,
    lightColor: state.lightColor,
    lightPreset: state.cameraLightingPreset,
    lightRimEnabled: state.lightRimEnabled,
    lightFillEnabled: state.lightFillEnabled,
  };
}

export function shouldDismissMediaDrawer(offset, drawerHeight) {
  const height = Math.max(0, Number(drawerHeight) || 0);
  return Math.max(0, Number(offset) || 0) >= Math.min(120, Math.max(72, height * 0.18));
}

function isMobileMediaDrawer(drawer) {
  if (globalThis.matchMedia?.("(max-width: 760px)")?.matches === true) return true;
  return Number(drawer?.getBoundingClientRect?.().width ?? Infinity) <= 760;
}

function animateMediaDrawerClose(surface) {
  const drawer = surface?.querySelector?.(".canvas-media-tools-drawer");
  const backdrop = surface?.querySelector?.(".canvas-media-tools-backdrop");
  if (!drawer?.classList || globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true) return null;
  drawer.classList.add("is-closing");
  backdrop?.classList?.add?.("is-closing");
  return new Promise((resolve) => globalThis.setTimeout?.(resolve, 170));
}

export async function refreshCanvasMediaRecoveryState(workbench, state = ensureCanvasMediaToolsState(workbench?.ui ?? {})) {
  const canvasId = String(workbench?.ui?.selectedCanvasProjectId ?? "");
  const nodeId = String(state.recoveryNodeId ?? workbench?.ui?.selectedCanvasNodeId ?? "");
  if (!canvasId || !nodeId) return { active: false };
  const recovery = readCanvasMediaRecovery(workbench, nodeId);
  if (state.recoveryNodeId !== nodeId) {
    state.recoveryNodeId = nodeId;
    state.derivationId = String(recovery.derivationId ?? "");
    state.taskId = String(recovery.taskId ?? "");
    state.annotationLayerId = String(recovery.annotationLayerId ?? "");
    state.batchGroup = recovery.batchGroupId ? { id: String(recovery.batchGroupId), status: "processing" } : null;
  }
  const derivationId = String(state.derivationId ?? recovery.derivationId ?? "");
  const batchGroupId = String(state.batchGroup?.id ?? recovery.batchGroupId ?? "");
  const taskId = String(state.taskId ?? recovery.taskId ?? "");
  const canPollTask = Boolean(taskId && typeof workbench.api?.getGenerationTask === "function");
  const canRefresh = Boolean(
    canPollTask
      || derivationId && typeof workbench.api?.getCanvasMediaDerivation === "function"
      || batchGroupId && typeof workbench.api?.getCanvasImageBatchGroup === "function",
  );
  const taskResult = canPollTask
    ? await workbench.api.getGenerationTask(taskId).catch(() => null)
    : null;
  const task = taskResult?.task ?? taskResult?.data?.task ?? taskResult;
  const taskStatus = normalizeMediaTaskStatus(task?.status ?? task?.taskStatus ?? task?.workflowStatus);
  const shouldReadDerivation = Boolean(
    derivationId
      && typeof workbench.api?.getCanvasMediaDerivation === "function"
      && (!canPollTask || ["completed", "failed"].includes(taskStatus)),
  );
  const [derivationResult, batchResult] = await Promise.all([
    shouldReadDerivation
      ? workbench.api.getCanvasMediaDerivation(canvasId, derivationId).catch(() => null)
      : null,
    batchGroupId && typeof workbench.api?.getCanvasImageBatchGroup === "function"
      ? workbench.api.getCanvasImageBatchGroup(canvasId, batchGroupId).catch(() => null)
      : null,
  ]);
  const derivation = derivationResult?.derivation ?? derivationResult?.data?.derivation ?? derivationResult;
  const batchGroup = batchResult?.group ?? batchResult?.data?.group ?? batchResult;
  if (derivation && typeof derivation === "object") {
    state.derivationId = String(derivation.id ?? derivationId);
    state.taskId = String(derivation.taskId ?? derivation.task_id ?? state.taskId ?? "");
    applyDerivationNodeState(workbench, derivation, task);
  } else if (task && typeof task === "object") {
    applyDerivationNodeState(workbench, {
      node_key: nodeId,
      task_id: taskId,
      status: taskStatus || "running",
      task,
    }, task);
  }
  if (batchGroup && typeof batchGroup === "object") state.batchGroup = batchGroup;
  const statuses = [
    derivation ? normalizeMediaRecoveryStatus(derivation.status ?? "running") : taskStatus || null,
    state.batchGroup?.id ? recoveredBatchStatus(state.batchGroup) : null,
  ].filter(Boolean);
  if (statuses.includes("failed")) state.status = "failed";
  else if (statuses.includes("running")) state.status = "running";
  else if (statuses.includes("completed") || state.annotationLayerId) state.status = "completed";
  else state.status = "idle";
  return { active: state.status === "running" && canRefresh, status: state.status };
}

function applyDerivationNodeState(workbench, derivation, task = null) {
  const document = workbench?.ui?.canvasDocument;
  const nodeId = String(derivation?.node_key ?? derivation?.nodeKey ?? workbench?.ui?.selectedCanvasNodeId ?? "");
  if (!document || !nodeId || !Array.isArray(document.nodes)) return;
  const derivationStatus = normalizeMediaRecoveryStatus(derivation?.status ?? "running");
  const status = ["completed", "failed"].includes(derivationStatus)
    ? derivationStatus
    : normalizeMediaTaskStatus(task?.status ?? task?.taskStatus ?? derivation?.status ?? "running") || "running";
  const artifact = derivation?.output_artifact ?? derivation?.outputArtifact ?? null;
  const artifactUrl = String(artifact?.url ?? artifact?.thumbnail_url ?? artifact?.thumbnailUrl ?? "").trim()
    || (artifact?.storage_object_id || artifact?.storageObjectId
      ? `/api/storage/objects/${encodeURIComponent(String(artifact.storage_object_id ?? artifact.storageObjectId))}/content?proxy=1`
      : "");
  const patch = status === "completed"
    ? {
        status: "ready",
        generationStage: "completed",
        generationProgress: 100,
        ...(artifactUrl ? { url: artifactUrl, previewUrl: artifactUrl, resultUrl: artifactUrl, resultImageUrl: artifactUrl } : {}),
        ...(artifact?.storage_object_id || artifact?.storageObjectId ? { storageObjectId: artifact.storage_object_id ?? artifact.storageObjectId } : {}),
        ...(artifact?.asset_id || artifact?.assetId ? { assetId: artifact.asset_id ?? artifact.assetId } : {}),
        ...(artifact?.asset_version_id || artifact?.assetVersionId ? { assetVersionId: artifact.asset_version_id ?? artifact.assetVersionId } : {}),
        source: "canvas_derivation",
      }
    : status === "failed"
      ? { status: "error", generationStage: "failed" }
      : {
          status: "running",
          source: "canvas_derivation",
          generationStage: String(task?.progressStage ?? task?.progress_stage ?? task?.stage ?? "image_generating"),
          generationProgress: Number(task?.progress ?? task?.progressPercent ?? task?.progress_percent ?? 0) || 0,
          taskId: derivation?.task_id ?? derivation?.taskId ?? task?.id ?? undefined,
        };
  const current = document.nodes.find((node) => String(node?.id ?? "") === nodeId);
  if (!current) return;
  const changed = Object.entries(patch).some(([key, value]) => current.data?.[key] !== value);
  if (!changed) return;
  const nextDocument = updateCanvasNodeData(document, nodeId, patch);
  workbench.ui.canvasDocument = nextDocument;
  if (typeof workbench.updateCanvasDocument === "function") {
    workbench.updateCanvasDocument(nextDocument, { scheduleSave: false });
  }
  if (status === "completed" && typeof workbench.saveCanvasNow === "function") {
    void workbench.saveCanvasNow();
  }
  if (typeof workbench.newCanvasInstance?.update === "function") {
    void workbench.newCanvasInstance.update({ nodeOnly: true, nodeId });
  } else if (typeof workbench.refreshCanvasSurface === "function") {
    void workbench.refreshCanvasSurface();
  }
}

function normalizeMediaTaskStatus(status) {
  const value = String(status ?? "").trim().toLowerCase();
  if (["succeeded", "completed", "success"].includes(value)) return "completed";
  if (["failed", "canceled", "cancelled", "result_unknown", "manual_review_required"].includes(value)) return "failed";
  if (["queued", "pending", "running", "processing", "submitted", "in_progress"].includes(value)) return "running";
  return "";
}

function mediaRecoveryRenderSnapshot(state) {
  return JSON.stringify([
    state?.status ?? "",
    state?.error ?? "",
    state?.derivationId ?? "",
    state?.taskId ?? "",
    state?.batchGroup?.status ?? "",
    state?.batchGroup?.selectedArtifactId ?? "",
  ]);
}

export async function persistCanvasMediaRecoveryState(workbench, state) {
  const canvasId = String(workbench?.ui?.selectedCanvasProjectId ?? "");
  const nodeId = String(state?.recoveryNodeId ?? workbench?.ui?.selectedCanvasNodeId ?? "");
  if (!canvasId || !nodeId) return null;
  state.recoveryNodeId = nodeId;
  const uiState = workbench.ui.canvasSessionUiState && typeof workbench.ui.canvasSessionUiState === "object"
    ? workbench.ui.canvasSessionUiState
    : {};
  const mediaRecoveryByNode = uiState.mediaRecoveryByNode && typeof uiState.mediaRecoveryByNode === "object"
    ? uiState.mediaRecoveryByNode
    : {};
  workbench.ui.canvasSessionUiState = {
    ...uiState,
    mediaRecoveryByNode: {
      ...mediaRecoveryByNode,
      [nodeId]: {
        derivationId: String(state.derivationId ?? ""),
        taskId: String(state.taskId ?? ""),
        annotationLayerId: String(state.annotationLayerId ?? ""),
        batchGroupId: String(state.batchGroup?.id ?? ""),
      },
    },
  };
  if (typeof workbench.api?.saveCanvasSession !== "function") return null;
  return workbench.api.saveCanvasSession(canvasId, {
    viewport: workbench.ui.canvasDocument?.viewport ?? { x: 0, y: 0, zoom: 1 },
    selectedNodeKeys: [nodeId],
    selectedEdgeKeys: [],
    uiState: workbench.ui.canvasSessionUiState,
    lastSeenRevision: Number(workbench.ui.canvasServerRevision ?? 1) || 1,
  }).catch(() => null);
}

function readCanvasMediaRecovery(workbench, nodeId) {
  const byNode = workbench?.ui?.canvasSessionUiState?.mediaRecoveryByNode;
  const recovery = byNode && typeof byNode === "object" ? byNode[nodeId] : null;
  return recovery && typeof recovery === "object" ? recovery : {};
}

function normalizeMediaRecoveryStatus(status) {
  const value = String(status ?? "").trim().toLowerCase();
  if (["succeeded", "completed", "detached", "selected"].includes(value)) return "completed";
  if (["failed", "canceled", "cancelled", "result_unknown", "manual_review_required"].includes(value)) return "failed";
  return value ? "running" : null;
}

function activeElementForSurface(surface) {
  return surface?.getRootNode?.()?.activeElement ?? surface?.ownerDocument?.activeElement ?? null;
}

function focusFirstMediaDrawerControl(surface) {
  const drawer = surface?.querySelector?.(".canvas-media-tools-drawer");
  const preferred = drawer?.querySelector?.('[data-media-action="close"]');
  (preferred ?? mediaDrawerFocusableElements(drawer)[0])?.focus?.();
}

function mediaDrawerFocusableElements(drawer) {
  if (!drawer?.querySelectorAll) return [];
  return [...drawer.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((element) => element?.getAttribute?.("aria-hidden") !== "true");
}

async function submitDerivation(workbench, state, rerender) {
  const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
  const selectedNodeId = String(workbench.ui?.selectedCanvasNodeId ?? "");
  let node = workbench.ui?.canvasDocument?.nodes?.find?.((item) => item.id === selectedNodeId);
  let source = sourceBinding(node);
  if (!canvasId || !node || !Object.values(source).some(Boolean)) {
    state.error = "请选择包含云端资产的图片节点。";
    rerender();
    return;
  }
  if (state.tool === "composite" && !state.compositeSecondaryArtifactId) {
    state.error = "请选择用于合成的第二张图片。";
    rerender();
    return;
  }
  const imageModelOptions = resolveMediaImageModelOptions(workbench.ui);
  syncMediaGenerationModelCode(workbench.ui, state, node, imageModelOptions);
  const modelCode = String(state.generationModelCode ?? "").trim();
  if (state.tool === "outpaint" && !modelCode) {
    state.error = "请选择生成模型。";
    rerender();
    return;
  }
  const api = workbench.api ?? {};
  if (typeof api.startCanvasMediaDerivation !== "function" || typeof api.createImageGenerationTask !== "function" || typeof api.attachCanvasMediaDerivationTask !== "function") {
    state.error = "媒体编辑接口暂不可用。";
    rerender();
    return;
  }
  state.status = "submitting";
  state.error = "";
  rerender();
  try {
    // Keep the derivation base revision aligned with the live canvas before creating a task.
    if (typeof workbench.refreshCanvasAfterAgentPatch === "function") {
      await workbench.refreshCanvasAfterAgentPatch().catch(() => null);
    }
    node = workbench.ui?.canvasDocument?.nodes?.find?.((item) => item.id === selectedNodeId);
    source = sourceBinding(node);
    if (!node || !Object.values(source).some(Boolean)) throw new Error("canvas_derivation_source_missing");
    const baseCanvasRevision = Number(workbench.ui?.canvasServerRevision ?? 1) || 1;
    const requestSnapshot = buildRequestSnapshot(state);
    const derivationInput = {
      nodeKey: node.id,
      derivationType: state.tool,
      baseCanvasRevision,
      source,
      requestSnapshot,
    };
    let startedPayload;
    try {
      startedPayload = await api.startCanvasMediaDerivation(canvasId, derivationInput);
    } catch (error) {
      const code = String(error?.errorCode ?? error?.code ?? "");
      if (Number(error?.status) !== 409 || !/(stale|mismatch)/i.test(code)) throw error;
      if (typeof workbench.refreshCanvasAfterAgentPatch !== "function") throw error;
      await workbench.refreshCanvasAfterAgentPatch().catch(() => null);
      startedPayload = await api.startCanvasMediaDerivation(canvasId, {
        ...derivationInput,
        baseCanvasRevision: Number(workbench.ui?.canvasServerRevision ?? baseCanvasRevision) || baseCanvasRevision,
      });
    }
    const derivation = startedPayload?.derivation ?? startedPayload;
    const derivationId = String(derivation?.id ?? "");
    if (!derivationId) throw new Error("canvas_derivation_missing");
    state.derivationId = derivationId;
    state.recoveryNodeId = node.id;
    const generationPrompt = ["camera_studio", "free_view"].includes(state.tool)
      ? [state.instruction.trim(), state.tool === "camera_studio" ? requestSnapshot.cameraStudio?.prompt : buildFreeViewPrompt(state)].filter(Boolean).join(", ")
      : state.instruction.trim() || MEDIA_TOOLS.find((tool) => tool.id === state.tool)?.label || "媒体编辑";
    const generationPayload = await api.createImageGenerationTask({
      target: { kind: "canvas", canvasProjectId: canvasId, nodeId: node.id },
      targetType: "canvas",
      targetId: node.id,
      model: modelCode || node.data?.modelCode || workbench.ui?.canvasGenerationModelCode,
      prompt: generationPrompt,
      parameters: {
        ...requestSnapshot,
        derivationId,
        referenceImages: buildGenerationReferenceImages(node),
      },
    });
    const taskId = String(generationPayload?.taskId ?? generationPayload?.task?.id ?? "");
    if (!taskId) throw new Error("canvas_derivation_task_missing");
    await api.attachCanvasMediaDerivationTask(canvasId, derivationId, taskId);
    workbench.registerCanvasMediaGenerationTask?.(generationPayload?.task ?? generationPayload, {
      taskId,
      status: "queued",
      kind: "image",
      mediaKind: "image",
      targetType: "canvas",
      targetId: node.id,
      prompt: generationPrompt,
      model: modelCode || node.data?.modelCode || workbench.ui?.canvasGenerationModelCode || null,
    });
    state.taskId = taskId;
    state.status = "running";
    applyDerivationNodeState(workbench, { id: derivationId, node_key: node.id, task_id: taskId, status: "running" });
  } catch (error) {
    if (state.derivationId && typeof api.failCanvasMediaDerivation === "function") {
      await api.failCanvasMediaDerivation(canvasId, state.derivationId, {
        failure: {
          failureCode: String(error?.errorCode ?? error?.code ?? "canvas_generation_submit_failed"),
          message: String(error?.message ?? "媒体生成任务创建失败"),
        },
      }).catch(() => null);
    }
    state.status = "failed";
    state.error = friendlyError(error);
  }
  rerender();
}

function buildGenerationReferenceImages(node) {
  const data = node?.data ?? {};
  const url = resolveMediaSourcePreviewUrl(node);
  const storageObjectId = String(data.storageObjectId ?? data.sourceStorageObjectId ?? data.resultStorageObjectId ?? "").trim();
  if (storageObjectId) return [{ storageObjectId, ...(url ? { url } : {}) }];
  return url ? [url] : [];
}

async function submitLocalCrop(workbench, state, rerender) {
  const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
  const node = workbench.ui?.canvasDocument?.nodes?.find?.((item) => item.id === workbench.ui.selectedCanvasNodeId);
  const sourceUrl = resolveMediaSourcePreviewUrl(node);
  if (!node || !sourceUrl) {
    state.error = "请选择包含图片源的节点。";
    rerender();
    return;
  }
  if (typeof Image !== "function" || typeof document === "undefined") {
    state.error = "当前浏览器不支持本地裁剪。";
    rerender();
    return;
  }
  if (typeof workbench.api?.uploadFile !== "function") {
    state.error = "图片上传接口暂不可用。";
    rerender();
    return;
  }
  state.status = "submitting";
  state.error = "";
  rerender();
  try {
    const blob = await cropImageBlob(sourceUrl, state);
    const fileName = `canvas-crop-${Date.now()}.png`;
    const file = typeof File === "function"
      ? new File([blob], fileName, { type: "image/png", lastModified: Date.now() })
      : blob;
    const uploadedPayload = await workbench.api.uploadFile(file, {
      category: "canvas-derivations",
      projectId: null,
      canvasProjectId: canvasId || null,
    });
    const upload = uploadedPayload?.upload ?? uploadedPayload;
    const storageObjectId = String(upload?.storageObjectId ?? "").trim();
    const previewUrl = String(
      storageObjectId
        ? `/api/storage/objects/${encodeURIComponent(storageObjectId)}/content?proxy=1`
        : upload?.previewUrl ?? upload?.publicUrl ?? createObjectUrl(blob) ?? "",
    ).trim();
    if (!previewUrl) throw new Error("canvas_crop_upload_missing");
    const canvasDocument = workbench.ui?.canvasDocument;
    if (!canvasDocument || !Array.isArray(canvasDocument.nodes)) throw new Error("canvas_document_missing");
    const position = {
      x: Number(node.position?.x ?? 0) + Number(node.size?.width ?? 420) + 72,
      y: Number(node.position?.y ?? 0),
    };
    let nextDocument = addCanvasNode(canvasDocument, { type: "source-image", position });
    const createdNode = nextDocument.nodes.at(-1);
    nextDocument = updateCanvasNodeData(nextDocument, createdNode.id, {
      title: "裁剪结果",
      status: "ready",
      source: "canvas_crop",
      mediaKind: "image",
      fileName,
      mimeType: "image/png",
      previewUrl,
      url: previewUrl,
      storageObjectId: storageObjectId || null,
      storageObjectKey: upload?.storageObjectKey ?? "",
      parentNodeId: node.id,
    });
    const canSaveImmediately = typeof workbench.saveCanvasNow === "function";
    if (typeof workbench.updateCanvasDocument === "function") {
      workbench.updateCanvasDocument(nextDocument, canSaveImmediately ? { scheduleSave: false } : { immediateSave: true });
    }
    else workbench.ui.canvasDocument = nextDocument;
    workbench.ui.selectedCanvasNodeId = createdNode.id;
    if (canSaveImmediately) await workbench.saveCanvasNow();
    workbench.ui.toast = "裁剪结果已创建为图片节点。";
    state.status = "completed";
  } catch (error) {
    state.status = "failed";
    state.error = friendlyError(error);
    workbench.ui.toast = `裁剪结果保存失败：${state.error}`;
  }
  await workbench.refreshCanvasSurface?.();
  rerender();
}

function cropImageBlob(sourceUrl, state) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const width = Number(image.naturalWidth || image.width);
        const height = Number(image.naturalHeight || image.height);
        if (!width || !height) throw new Error("canvas_crop_source_dimensions_missing");
        const crop = cropRect(state);
        const sourceX = Math.round(width * crop.x / 100);
        const sourceY = Math.round(height * crop.y / 100);
        const sourceWidth = Math.max(1, Math.round(width * crop.width / 100));
        const sourceHeight = Math.max(1, Math.round(height * crop.height / 100));
        const canvas = document.createElement("canvas");
        canvas.width = sourceWidth;
        canvas.height = sourceHeight;
        const context = canvas.getContext?.("2d");
        if (!context) throw new Error("canvas_crop_context_unavailable");
        context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
        if (typeof canvas.toBlob !== "function") throw new Error("canvas_crop_encode_unavailable");
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("canvas_crop_encode_failed")), "image/png");
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error("canvas_crop_source_load_failed"));
    image.src = sourceUrl;
  });
}

async function submitLocalSlice(workbench, state, rerender) {
  const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
  const node = workbench.ui?.canvasDocument?.nodes?.find?.((item) => item.id === workbench.ui.selectedCanvasNodeId);
  const sourceUrl = resolveMediaSourcePreviewUrl(node);
  const rows = Math.max(1, Math.min(12, Math.floor(Number(state.sliceRows) || 0)));
  const columns = Math.max(1, Math.min(12, Math.floor(Number(state.sliceColumns) || 0)));
  const gapPixels = Math.max(0, Math.floor(Number(state.sliceGapPixels) || 0));
  const rowBounds = [0, ...getSliceLinePositions(state, "row", rows), 1];
  const columnBounds = [0, ...getSliceLinePositions(state, "column", columns), 1];
  if (!node || !sourceUrl) {
    state.error = "请选择包含图片源的节点。";
    rerender();
    return;
  }
  if (typeof Image !== "function" || typeof document === "undefined") {
    state.error = "当前浏览器不支持本地切片。";
    rerender();
    return;
  }
  if (typeof workbench.api?.uploadFile !== "function") {
    state.error = "图片上传接口暂不可用。";
    rerender();
    return;
  }
  state.status = "submitting";
  state.error = "";
  rerender();
  try {
    const image = await loadMediaImage(sourceUrl);
    const width = Number(image.naturalWidth || image.width);
    const height = Number(image.naturalHeight || image.height);
    if (!width || !height || gapPixels * (columns - 1) >= width || gapPixels * (rows - 1) >= height) throw new Error("canvas_slice_gap_too_large");
    let nextDocument = workbench.ui?.canvasDocument;
    if (!nextDocument || !Array.isArray(nextDocument.nodes)) throw new Error("canvas_document_missing");
    const createdNodes = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const rawX = Math.round(width * columnBounds[column]);
        const rawY = Math.round(height * rowBounds[row]);
        const rawRight = Math.round(width * columnBounds[column + 1]);
        const rawBottom = Math.round(height * rowBounds[row + 1]);
        const sourceX = rawX + (column > 0 ? Math.floor(gapPixels / 2) : 0);
        const sourceY = rawY + (row > 0 ? Math.floor(gapPixels / 2) : 0);
        const sourceRight = rawRight - (column < columns - 1 ? Math.ceil(gapPixels / 2) : 0);
        const sourceBottom = rawBottom - (row < rows - 1 ? Math.ceil(gapPixels / 2) : 0);
        const tileWidth = Math.max(1, sourceRight - sourceX);
        const tileHeight = Math.max(1, sourceBottom - sourceY);
        const blob = await renderMediaBlob(image, sourceX, sourceY, tileWidth, tileHeight);
        const index = row * columns + column + 1;
        const fileName = `canvas-slice-${Date.now()}-${index}.png`;
        const upload = await uploadLocalMedia(workbench, blob, fileName, canvasId);
        const position = {
          x: Number(node.position?.x ?? 0) + Number(node.size?.width ?? 420) + 72 + column * 36,
          y: Number(node.position?.y ?? 0) + row * 36,
        };
        nextDocument = addLocalMediaNode(nextDocument, position, {
          title: `切片 ${index}`,
          source: "canvas_slice",
          parentNodeId: node.id,
          slice: {
            row,
            column,
            rows,
            columns,
            gapPixels,
          },
          fileName,
          ...upload,
        });
        createdNodes.push(nextDocument.nodes.at(-1));
      }
    }
    const canSaveImmediately = typeof workbench.saveCanvasNow === "function";
    if (typeof workbench.updateCanvasDocument === "function") {
      workbench.updateCanvasDocument(nextDocument, canSaveImmediately ? { scheduleSave: false } : { immediateSave: true });
    } else workbench.ui.canvasDocument = nextDocument;
    workbench.ui.selectedCanvasNodeId = createdNodes[0]?.id ?? node.id;
    if (canSaveImmediately) await workbench.saveCanvasNow();
    workbench.ui.toast = `${createdNodes.length} 个切片已创建为图片节点。`;
    state.status = "completed";
  } catch (error) {
    state.status = "failed";
    state.error = friendlyError(error);
    workbench.ui.toast = `切片结果保存失败：${state.error}`;
  }
  await workbench.refreshCanvasSurface?.();
  rerender();
}

async function submitLocalComposite(workbench, state, rerender) {
  const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
  const node = workbench.ui?.canvasDocument?.nodes?.find?.((item) => item.id === workbench.ui.selectedCanvasNodeId);
  const sourceUrl = resolveMediaSourcePreviewUrl(node);
  const secondarySource = state.compositeSecondarySource && typeof state.compositeSecondarySource === "object"
    ? state.compositeSecondarySource
    : mediaArtifactsForCanvas(workbench.ui, node?.id).find((artifact) => artifact.artifactId === state.compositeSecondaryArtifactId)?.source ?? null;
  const secondaryUrl = resolveMediaArtifactSourceUrl(secondarySource);
  if (!node || !sourceUrl) {
    state.error = "请选择包含图片源的节点。";
    rerender();
    return;
  }
  if (!state.compositeSecondaryArtifactId || !secondaryUrl) {
    state.error = "请选择包含可访问图片源的第二张图片。";
    rerender();
    return;
  }
  if (typeof Image !== "function" || typeof document === "undefined") {
    state.error = "当前浏览器不支持本地合成。";
    rerender();
    return;
  }
  if (typeof workbench.api?.uploadFile !== "function") {
    state.error = "图片上传接口暂不可用。";
    rerender();
    return;
  }
  state.status = "submitting";
  state.error = "";
  rerender();
  try {
    const [baseImage, secondaryImage] = await Promise.all([loadMediaImage(sourceUrl), loadMediaImage(secondaryUrl)]);
    const width = Number(baseImage.naturalWidth || baseImage.width);
    const height = Number(baseImage.naturalHeight || baseImage.height);
    if (!width || !height) throw new Error("canvas_composite_source_dimensions_missing");
    const blob = await compositeMediaBlob(baseImage, secondaryImage, state, width, height);
    const fileName = `canvas-composite-${Date.now()}.png`;
    const upload = await uploadLocalMedia(workbench, blob, fileName, canvasId);
    const canvasDocument = workbench.ui?.canvasDocument;
    if (!canvasDocument || !Array.isArray(canvasDocument.nodes)) throw new Error("canvas_document_missing");
    const position = {
      x: Number(node.position?.x ?? 0) + Number(node.size?.width ?? 420) + 72,
      y: Number(node.position?.y ?? 0),
    };
    const nextDocument = addLocalMediaNode(canvasDocument, position, {
      title: "合成结果",
      source: "canvas_composite",
      parentNodeId: node.id,
      fileName,
      ...upload,
    });
    const createdNode = nextDocument.nodes.at(-1);
    const canSaveImmediately = typeof workbench.saveCanvasNow === "function";
    if (typeof workbench.updateCanvasDocument === "function") {
      workbench.updateCanvasDocument(nextDocument, canSaveImmediately ? { scheduleSave: false } : { immediateSave: true });
    } else workbench.ui.canvasDocument = nextDocument;
    workbench.ui.selectedCanvasNodeId = createdNode.id;
    if (canSaveImmediately) await workbench.saveCanvasNow();
    workbench.ui.toast = "合成结果已创建为图片节点。";
    state.status = "completed";
  } catch (error) {
    state.status = "failed";
    state.error = friendlyError(error);
    workbench.ui.toast = `合成结果保存失败：${state.error}`;
  }
  await workbench.refreshCanvasSurface?.();
  rerender();
}

function loadMediaImage(sourceUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("canvas_media_source_load_failed"));
    image.src = sourceUrl;
  });
}

function renderMediaBlob(image, sourceX, sourceY, sourceWidth, sourceHeight) {
  const canvas = document.createElement("canvas");
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;
  const context = canvas.getContext?.("2d");
  if (!context) return Promise.reject(new Error("canvas_media_context_unavailable"));
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
  return canvasBlob(canvas);
}

async function renderAnnotatedMediaBlob(sourceUrl, annotationCanvas) {
  const image = await loadMediaImage(sourceUrl);
  const sourceWidth = Number(image.naturalWidth || image.width);
  const sourceHeight = Number(image.naturalHeight || image.height);
  const annotationWidth = Number(annotationCanvas?.width);
  const annotationHeight = Number(annotationCanvas?.height);
  if (!sourceWidth || !sourceHeight || !annotationWidth || !annotationHeight) {
    throw new Error("canvas_annotation_source_dimensions_missing");
  }
  const output = document.createElement("canvas");
  output.width = sourceWidth;
  output.height = sourceHeight;
  const context = output.getContext?.("2d");
  if (!context) throw new Error("canvas_annotation_context_unavailable");
  const scale = Math.min(annotationWidth / sourceWidth, annotationHeight / sourceHeight);
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const offsetX = (annotationWidth - renderedWidth) / 2;
  const offsetY = (annotationHeight - renderedHeight) / 2;
  context.drawImage(image, 0, 0, sourceWidth, sourceHeight);
  context.drawImage(annotationCanvas, offsetX, offsetY, renderedWidth, renderedHeight, 0, 0, sourceWidth, sourceHeight);
  return canvasBlob(output);
}

function compositeMediaBlob(baseImage, secondaryImage, state, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext?.("2d");
  if (!context) return Promise.reject(new Error("canvas_media_context_unavailable"));
  context.drawImage(baseImage, 0, 0, width, height);
  const secondaryWidth = Number(secondaryImage.naturalWidth || secondaryImage.width);
  const secondaryHeight = Number(secondaryImage.naturalHeight || secondaryImage.height);
  const alignment = String(state.compositeAlignment ?? "center");
  const x = alignment.endsWith("right") ? width - secondaryWidth : alignment.endsWith("left") ? 0 : Math.round((width - secondaryWidth) / 2);
  const y = alignment.startsWith("bottom") ? height - secondaryHeight : alignment.startsWith("top") ? 0 : Math.round((height - secondaryHeight) / 2);
  context.save?.();
  context.globalAlpha = Math.max(0, Math.min(1, Number(state.compositeOpacityPercent) / 100));
  context.globalCompositeOperation = ["normal", "multiply", "screen", "overlay"].includes(state.compositeBlendMode)
    ? state.compositeBlendMode === "normal" ? "source-over" : state.compositeBlendMode
    : "source-over";
  context.drawImage(secondaryImage, x, y, secondaryWidth, secondaryHeight);
  context.restore?.();
  return canvasBlob(canvas);
}

async function uploadLocalMedia(workbench, blob, fileName, canvasId) {
  const file = typeof File === "function"
    ? new File([blob], fileName, { type: "image/png", lastModified: Date.now() })
    : blob;
  const uploadedPayload = await workbench.api.uploadFile(file, {
    category: "canvas-derivations",
    projectId: null,
    canvasProjectId: canvasId || null,
  });
  const upload = uploadedPayload?.upload ?? uploadedPayload;
  const storageObjectId = String(upload?.storageObjectId ?? "").trim();
  const previewUrl = String(
    storageObjectId
      ? `/api/storage/objects/${encodeURIComponent(storageObjectId)}/content?proxy=1`
      : upload?.previewUrl ?? upload?.publicUrl ?? createObjectUrl(blob) ?? "",
  ).trim();
  if (!previewUrl) throw new Error("canvas_media_upload_missing");
  return {
    status: "ready",
    mediaKind: "image",
    mimeType: "image/png",
    previewUrl,
    url: previewUrl,
    storageObjectId: storageObjectId || null,
    storageObjectKey: upload?.storageObjectKey ?? "",
  };
}

function addLocalMediaNode(document, position, data) {
  let nextDocument = addCanvasNode(document, { type: "source-image", position });
  const createdNode = nextDocument.nodes.at(-1);
  return updateCanvasNodeData(nextDocument, createdNode.id, data);
}

function createObjectUrl(blob) {
  try {
    return typeof globalThis.URL?.createObjectURL === "function" ? globalThis.URL.createObjectURL(blob) : "";
  } catch {
    return "";
  }
}

async function submitAnnotation(workbench, state, rerender, surface) {
  const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
  const node = workbench.ui?.canvasDocument?.nodes?.find?.((item) => item.id === workbench.ui.selectedCanvasNodeId);
  const canvas = surface?.querySelector?.("[data-media-annotation-canvas]");
  const sourceUrl = resolveMediaSourcePreviewUrl(node);
  if (!canvasId || !node || !canvas || typeof workbench.api?.uploadFile !== "function" || typeof workbench.api?.createCanvasAnnotationLayer !== "function") {
    state.error = "标注上传接口暂不可用。";
    rerender();
    return;
  }
  state.status = "submitting";
  state.error = "";
  rerender();
  try {
    const vector = state.layerKind === "vector_annotation";
    if (vector && !(state.vectorStrokes ?? []).some((stroke) => stroke.points?.length > 1)) {
      throw new Error("canvas_vector_annotation_empty");
    }
    const blob = vector
      ? new Blob([JSON.stringify({ version: 1, width: canvas.width, height: canvas.height, annotations: normalizeAnnotations(state.annotations), strokes: state.vectorStrokes })], { type: "application/json" })
      : await canvasBlob(canvas);
    const file = typeof File === "function"
      ? new File([blob], `canvas-${state.layerKind}-${Date.now()}.${vector ? "json" : "png"}`, { type: blob.type })
      : blob;
    const uploadedPayload = await workbench.api.uploadFile(file, {
      category: "canvas-annotations",
      projectId: null,
      uploadLimits: CANVAS_ANNOTATION_UPLOAD_LIMITS,
    });
    const upload = uploadedPayload?.upload ?? uploadedPayload;
    const layerStorageObjectId = String(upload?.storageObjectId ?? "");
    if (!layerStorageObjectId) throw new Error("canvas_annotation_upload_missing");
    const source = sourceBinding(node);
    const result = await workbench.api.createCanvasAnnotationLayer(canvasId, {
      nodeKey: node.id,
      layerKind: state.layerKind,
      sourceAssetId: source.assetId,
      sourceAssetVersionId: source.assetVersionId,
      layerStorageObjectId,
      projectionPolicy: "retain",
      metadata: {
        width: canvas.width,
        height: canvas.height,
        ...(vector ? { format: "canvas-vector-v1", strokeCount: state.vectorStrokes.length } : {}),
      },
    });
    state.annotationLayerId = String(result?.layer?.id ?? result?.id ?? "");
    if (!sourceUrl || typeof Image !== "function" || typeof document === "undefined") {
      throw new Error("canvas_annotation_output_unavailable");
    }
    const annotatedBlob = await renderAnnotatedMediaBlob(sourceUrl, canvas);
    const fileName = `canvas-annotation-result-${Date.now()}.png`;
    const annotationResult = await uploadLocalMedia(workbench, annotatedBlob, fileName, canvasId);
    const canvasDocument = workbench.ui?.canvasDocument;
    if (!canvasDocument || !Array.isArray(canvasDocument.nodes)) throw new Error("canvas_document_missing");
    const position = {
      x: Number(node.position?.x ?? 0) + Number(node.size?.width ?? 420) + 72,
      y: Number(node.position?.y ?? 0),
    };
    const nextDocument = addLocalMediaNode(canvasDocument, position, {
      title: "标注结果",
      source: "canvas_annotation",
      parentNodeId: node.id,
      annotationLayerId: state.annotationLayerId || null,
      annotationLayerStorageObjectId: layerStorageObjectId,
      fileName,
      ...annotationResult,
    });
    const createdNode = nextDocument.nodes.at(-1);
    const canSaveImmediately = typeof workbench.saveCanvasNow === "function";
    if (typeof workbench.updateCanvasDocument === "function") {
      workbench.updateCanvasDocument(nextDocument, canSaveImmediately ? { scheduleSave: false } : { immediateSave: true });
    } else workbench.ui.canvasDocument = nextDocument;
    workbench.ui.selectedCanvasNodeId = createdNode?.id ?? node.id;
    if (canSaveImmediately) await workbench.saveCanvasNow();
    if (typeof workbench.api?.listCanvasAnnotationLayers === "function") {
      const layersPayload = await workbench.api.listCanvasAnnotationLayers(canvasId, { nodeKey: node.id, limit: 100 });
      state.annotationLayers = Array.isArray(layersPayload?.layers)
        ? layersPayload.layers
        : Array.isArray(layersPayload?.data?.layers) ? layersPayload.data.layers : [];
    }
    workbench.ui.toast = "标注结果已创建为图片节点。";
    state.status = "completed";
  } catch (error) {
    state.status = "failed";
    state.error = friendlyError(error);
    workbench.ui.toast = `标注结果保存失败：${state.error}`;
  }
  await workbench.refreshCanvasSurface?.();
  rerender();
}

async function submitBatchGroup(workbench, state, rerender) {
  const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
  const nodeId = String(workbench.ui?.selectedCanvasNodeId ?? "");
  const artifactIds = [...new Set(state.selectedArtifactIds ?? [])].filter(Boolean);
  if (!canvasId || !nodeId || artifactIds.length < 2 || typeof workbench.api?.createCanvasImageBatchGroup !== "function") {
    state.error = "请至少选择两个图片结果。";
    rerender();
    return;
  }
  state.status = "submitting";
  state.error = "";
  rerender();
  try {
    const payload = await workbench.api.createCanvasImageBatchGroup(canvasId, {
      nodeKey: nodeId,
      artifacts: artifactIds.map((artifactId, index) => ({ artifactId, parameters: { batchIndex: index } })),
    });
    state.batchGroup = payload?.group ?? payload;
    state.status = recoveredBatchStatus(state.batchGroup);
  } catch (error) {
    state.status = "failed";
    state.error = friendlyError(error);
  }
  rerender();
}

function drawAnnotationPoint(canvas, event, state, start) {
  const context = canvas.getContext?.("2d");
  const rect = canvas.getBoundingClientRect?.();
  if (!context || !rect?.width || !rect?.height) return;
  const x = (Number(event.clientX) - rect.left) * canvas.width / rect.width;
  const y = (Number(event.clientY) - rect.top) * canvas.height / rect.height;
  context.save?.();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.globalCompositeOperation = state.annotationMode === "erase" ? "destination-out" : "source-over";
  context.strokeStyle = String(state.annotationColor || "#ef4444");
  context.lineWidth = Math.max(2, Math.min(96, Number(state.brushSize) || 24));
  if (start) {
    context.beginPath();
    context.moveTo(x, y);
  } else {
    context.lineTo(x, y);
    context.stroke();
  }
  context.restore?.();
}

function annotationPoint(canvas, event) {
  const rect = canvas?.getBoundingClientRect?.();
  if (!rect?.width || !rect?.height) return null;
  return {
    x: (Number(event.clientX) - rect.left) * canvas.width / rect.width,
    y: (Number(event.clientY) - rect.top) * canvas.height / rect.height,
  };
}

function captureAnnotationCanvas(canvas) {
  const context = canvas?.getContext?.("2d");
  if (!context?.getImageData || !canvas?.width || !canvas?.height) return null;
  try { return context.getImageData(0, 0, canvas.width, canvas.height); } catch { return null; }
}

function restoreAnnotationCanvas(canvas, snapshot) {
  const context = canvas?.getContext?.("2d");
  if (!context || !snapshot) return false;
  context.clearRect?.(0, 0, canvas.width, canvas.height);
  context.putImageData?.(snapshot, 0, 0);
  return true;
}

async function loadAnnotationLayers(workbench, state, rerender) {
  const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
  const nodeKey = String(workbench.ui?.selectedCanvasNodeId ?? "");
  if (!canvasId || !nodeKey || typeof workbench.api?.listCanvasAnnotationLayers !== "function") return;
  state.annotationLayersLoading = true;
  state.error = "";
  try {
    const payload = await workbench.api.listCanvasAnnotationLayers(canvasId, { nodeKey, limit: 100 });
    state.annotationLayers = Array.isArray(payload?.layers)
      ? payload.layers
      : Array.isArray(payload?.data?.layers) ? payload.data.layers : [];
  } catch (error) {
    state.error = friendlyError(error);
  } finally {
    state.annotationLayersLoading = false;
  }
  await rerender();
}

async function loadAnnotationLayer(surface, layer, state) {
  const canvas = surface?.querySelector?.("[data-media-annotation-canvas]");
  const previewUrl = String(layer?.previewUrl ?? "");
  if (!canvas || !previewUrl || typeof Image !== "function") {
    state.error = "canvas_annotation_layer_preview_unavailable";
    return false;
  }
  const context = canvas.getContext?.("2d");
  if (!context) return false;
  state.error = "";
  state.layerKind = ["mask", "raster_annotation", "vector_annotation"].includes(layer?.layerKind)
    ? layer.layerKind
    : "mask";
  if (layer?.layerKind === "vector_annotation") {
    if (typeof fetch !== "function") {
      state.error = "canvas_annotation_layer_preview_unavailable";
      return false;
    }
    try {
      const response = await fetch(previewUrl, { credentials: "include" });
      if (!response.ok) throw new Error(`canvas_vector_annotation_load_failed:${response.status}`);
      const payload = await response.json();
      state.vectorStrokes = normalizeVectorStrokes(payload?.strokes);
      state.annotations = normalizeAnnotations(payload?.annotations ?? strokesToAnnotations(state.vectorStrokes));
      state.layerKind = "vector_annotation";
      redrawStructuredAnnotations(canvas, state);
      state.annotationLayerId = String(layer?.id ?? "");
      return true;
    } catch (error) {
      state.error = friendlyError(error);
      return false;
    }
  }
  await new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      context.clearRect?.(0, 0, canvas.width, canvas.height);
      context.drawImage?.(image, 0, 0, canvas.width, canvas.height);
      resolve();
    };
    image.onerror = () => reject(new Error("canvas_annotation_layer_load_failed"));
    image.src = previewUrl;
  }).catch((error) => {
    state.error = friendlyError(error);
  });
  if (!state.error) state.annotationLayerId = String(layer?.id ?? "");
  return !state.error;
}

function canvasBlob(canvas) {
  if (typeof canvas?.toBlob !== "function") {
    return Promise.reject(new Error("canvas_annotation_encode_unavailable"));
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("canvas_annotation_encode_failed")), "image/png");
  });
}

function mediaArtifactsForNode(ui, nodeId) {
  return (Array.isArray(ui.canvasAssets) ? ui.canvasAssets : [])
    .filter((asset) => asset.mediaKind === "image" && (!nodeId || asset.nodeKey === nodeId))
    .map((asset) => ({
      artifactId: String(asset.artifactId ?? asset.id ?? ""),
      url: asset.thumbnailUrl ?? asset.url ?? "",
      title: asset.title ?? asset.prompt ?? "图片结果",
    }))
    .filter((asset) => asset.artifactId);
}

function mediaArtifactsForCanvas(ui, excludeNodeId = "") {
  const assets = (Array.isArray(ui.canvasAssets) ? ui.canvasAssets : [])
    .filter((asset) => asset.mediaKind === "image")
    .map((asset) => ({
      artifactId: String(asset.artifactId ?? asset.id ?? ""),
      url: asset.thumbnailUrl ?? asset.url ?? (asset.storageObjectId
        ? `/api/storage/objects/${encodeURIComponent(asset.storageObjectId)}/content?proxy=1`
        : ""),
      title: asset.title ?? asset.prompt ?? "图片结果",
      source: {
        artifactId: String(asset.artifactId ?? asset.id ?? "") || null,
        assetId: asset.assetId ?? null,
        assetVersionId: asset.assetVersionId ?? null,
        storageObjectId: asset.storageObjectId ?? null,
        url: asset.thumbnailUrl ?? asset.url ?? null,
      },
    }))
    .filter((asset) => asset.artifactId);
  const nodes = (Array.isArray(ui.canvasDocument?.nodes) ? ui.canvasDocument.nodes : [])
    .filter((node) => String(node?.id ?? "") !== String(excludeNodeId ?? ""))
    .filter((node) => ["image", "source-image", "upload"].includes(String(node?.type ?? "")) && String(node?.data?.mediaKind ?? "image") === "image")
    .map((node) => {
      const url = resolveMediaSourcePreviewUrl(node);
      const data = node?.data ?? {};
      const artifactId = String(data.artifactId ?? data.assetId ?? data.assetVersionId ?? data.storageObjectId ?? node?.id ?? "");
      if (!url || !artifactId) return null;
      return {
        artifactId: `node:${artifactId}`,
        url,
        title: data.title ?? data.fileName ?? "画布图片",
        source: {
          artifactId: null,
          assetId: data.assetId ?? null,
          assetVersionId: data.assetVersionId ?? null,
          storageObjectId: data.storageObjectId ?? null,
          url,
        },
      };
    })
    .filter(Boolean);
  const seen = new Set();
  return [...assets, ...nodes].filter((asset) => {
    const key = `${asset.artifactId}|${asset.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderBatchGrid(state, artifacts) {
  if (!artifacts.length) return '<p class="canvas-media-empty">当前节点没有可加入宫格的图片结果。</p>';
  return `
    <div class="canvas-media-batch-grid">
      ${artifacts.map((artifact) => `
        <label class="canvas-media-batch-item ${state.batchGroup?.selectedArtifactId === artifact.artifactId ? "selected" : ""}">
          <input type="checkbox" data-media-field="batchArtifact" value="${escapeAttr(artifact.artifactId)}" ${(state.selectedArtifactIds ?? []).includes(artifact.artifactId) ? "checked" : ""} />
          ${artifact.url ? `<img src="${escapeAttr(artifact.url)}" alt="" />` : ""}
          <span>${escapeHtml(artifact.title)}</span>
          ${state.batchGroup?.items?.some?.((item) => item.artifactId === artifact.artifactId) ? `<button type="button" data-media-action="select-batch-artifact" data-artifact-id="${escapeAttr(artifact.artifactId)}" ${state.batchGroup?.selectedArtifactId === artifact.artifactId ? "disabled" : ""}>${state.batchGroup?.selectedArtifactId === artifact.artifactId ? "主结果" : "设为主结果"}</button>` : ""}
        </label>
      `).join("")}
    </div>
  `;
}

function renderAnnotationLayerList(state, sourcePreviewUrl = "") {
  if (state.annotationLayersLoading) return '<p class="canvas-media-empty">正在加载已有图层...</p>';
  const layers = Array.isArray(state.annotationLayers) ? state.annotationLayers : [];
  if (!layers.length) return '<p class="canvas-media-empty">当前节点没有已保存图层。</p>';
  return `<div class="canvas-media-layer-list" aria-label="已有标注图层">
    ${layers.map((layer) => `<article class="canvas-media-layer-item">
      ${layer.previewUrl && sourcePreviewUrl
        ? `<div class="canvas-media-layer-preview" style="background-image:url('${escapeAttr(sourcePreviewUrl)}')"><img src="${escapeAttr(layer.previewUrl)}" alt="" /></div>`
        : layer.previewUrl
          ? `<img src="${escapeAttr(layer.previewUrl)}" alt="" />`
          : '<span class="canvas-media-layer-placeholder" aria-hidden="true"></span>'}
      <div><strong>${escapeHtml(annotationLayerLabel(layer.layerKind))}</strong><small>${escapeHtml(layer.status ?? "active")}</small></div>
      <button type="button" data-media-action="load-annotation-layer" data-layer-id="${escapeAttr(layer.id)}" ${layer.previewUrl ? "" : "disabled"}>加载</button>
    </article>`).join("")}
  </div>`;
}

function renderMediaSourcePreview(node, previewUrl = resolveMediaSourcePreviewUrl(node)) {
  const title = String(node?.data?.title ?? node?.id ?? "未选择图片");
  return `<figure class="canvas-media-source-preview" aria-label="当前处理源图">
    ${previewUrl
      ? `<img src="${escapeAttr(previewUrl)}" alt="当前源图：${escapeAttr(title)}" />`
      : '<div class="canvas-media-source-preview-empty">当前节点没有可预览的图片</div>'}
    <figcaption><strong>${escapeHtml(title)}</strong><small>当前处理源图</small></figcaption>
  </figure>`;
}

function renderFreeViewPreview(node, previewUrl, state) {
  const title = String(node?.data?.title ?? node?.id ?? "未选择图片");
  const yaw = clamp(Number(state.viewAzimuthDegrees) || 0, -180, 180);
  const pitch = clamp(Number(state.viewElevationDegrees) || 0, -90, 90);
  const distance = clamp(Number(state.viewDistanceScale) || 1, 0.1, 5);
  const rotateY = clamp(yaw * 0.3, -54, 54);
  const rotateX = clamp(-pitch * 0.22, -20, 20);
  const scale = clamp(1.08 - distance * 0.08, 0.7, 1.08);
  return `<figure class="canvas-media-source-preview canvas-free-view-preview" data-free-view-preview style="--free-view-yaw:${rotateY}deg;--free-view-pitch:${rotateX}deg;--free-view-scale:${scale}">
    <div class="canvas-free-view-stage">
      ${previewUrl
        ? `<img data-free-view-image src="${escapeAttr(previewUrl)}" alt="当前源图：${escapeAttr(title)}" />`
        : '<div class="canvas-media-source-preview-empty">当前节点没有可预览的图片</div>'}
      <span class="canvas-free-view-readout" data-free-view-readout>${formatFreeViewReadout(yaw, pitch, distance)}</span>
    </div>
    <figcaption><strong>${escapeHtml(title)}</strong><small>自由视角预览</small></figcaption>
  </figure>`;
}

function formatFreeViewReadout(yaw, pitch, distance) {
  return `水平 ${Math.round(yaw)}° · 俯仰 ${Math.round(pitch)}° · 距离 ${distance.toFixed(1)}x`;
}

function syncFreeViewLiveElements(surface, state) {
  const preview = surface?.querySelector?.("[data-free-view-preview]");
  const yaw = clamp(Number(state.viewAzimuthDegrees) || 0, -180, 180);
  const pitch = clamp(Number(state.viewElevationDegrees) || 0, -90, 90);
  const distance = clamp(Number(state.viewDistanceScale) || 1, 0.1, 5);
  const fields = {
    viewAzimuthDegrees: yaw,
    viewElevationDegrees: pitch,
    viewDistanceScale: distance,
  };
  for (const [field, value] of Object.entries(fields)) {
    const input = surface?.querySelector?.(`[data-media-field="${field}"]`);
    if (input && String(input.value) !== String(value)) input.value = String(value);
  }
  if (!preview) return;
  preview.style?.setProperty?.("--free-view-yaw", `${clamp(yaw * 0.3, -54, 54)}deg`);
  preview.style?.setProperty?.("--free-view-pitch", `${clamp(-pitch * 0.22, -20, 20)}deg`);
  preview.style?.setProperty?.("--free-view-scale", String(clamp(1.08 - distance * 0.08, 0.7, 1.08)));
  const readout = preview.querySelector?.("[data-free-view-readout]");
  if (readout) readout.textContent = formatFreeViewReadout(yaw, pitch, distance);
}

function resolveMediaSourcePreviewUrl(node) {
  return String(
    resolveCanvasMediaNodeSource(node, "image")
      || node?.data?.resultImageUrl
      || node?.data?.sourceUrl
      || "",
  ).trim();
}

function resolveMediaArtifactSourceUrl(source) {
  return String(
    source?.url
      || source?.previewUrl
      || (source?.storageObjectId
        ? `/api/storage/objects/${encodeURIComponent(source.storageObjectId)}/content?proxy=1`
        : "")
      || "",
  ).trim();
}

function renderCropStage(state, node, imageUrl = resolveMediaSourcePreviewUrl(node)) {
  const crop = cropRect(state);
  return `<div class="canvas-media-crop-stage" data-media-crop-stage style="background-image:url('${escapeAttr(imageUrl)}')">
    <div class="canvas-media-crop-shade" aria-hidden="true"></div>
    <div class="canvas-media-crop-selection" data-media-crop-handle="move" tabindex="0" role="group" aria-label="裁剪区域，方向键移动" style="left:${crop.x}%;top:${crop.y}%;width:${crop.width}%;height:${crop.height}%">
      ${["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((handle) => `<button type="button" class="canvas-media-crop-handle is-${handle}" data-media-crop-handle="${handle}" aria-label="调整裁剪区域 ${handle}"></button>`).join("")}
    </div>
  </div>`;
}

function renderSliceStage(state, node, imageUrl = resolveMediaSourcePreviewUrl(node)) {
  const rows = Math.max(1, Math.min(12, Math.floor(Number(state.sliceRows) || 0)));
  const columns = Math.max(1, Math.min(12, Math.floor(Number(state.sliceColumns) || 0)));
  const rowPositions = getSliceLinePositions(state, "row", rows);
  const columnPositions = getSliceLinePositions(state, "column", columns);
  const rowBounds = [0, ...rowPositions, 1];
  const columnBounds = [0, ...columnPositions, 1];
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      cells.push(`<span class="canvas-media-slice-cell" data-media-slice-cell data-media-slice-row="${row}" data-media-slice-column="${column}" style="left:${columnBounds[column] * 100}%;top:${rowBounds[row] * 100}%;width:${(columnBounds[column + 1] - columnBounds[column]) * 100}%;height:${(rowBounds[row + 1] - rowBounds[row]) * 100}%">${row + 1}-${column + 1}</span>`);
    }
  }
  return `<div class="canvas-media-slice-stage" data-media-slice-stage>
    <img src="${escapeAttr(imageUrl)}" alt="切片预览" draggable="false" />
    <div class="canvas-media-slice-overlay" aria-label="切片网格 ${rows} 行 ${columns} 列">
      ${cells.join("")}
      ${rowPositions.map((position, index) => `<button type="button" class="canvas-media-slice-line is-row" data-media-slice-handle data-media-slice-axis="row" data-media-slice-index="${index}" style="top:${position * 100}%" aria-label="移动第 ${index + 1} 条行切片线"><span>行 ${index + 1}</span></button>`).join("")}
      ${columnPositions.map((position, index) => `<button type="button" class="canvas-media-slice-line is-column" data-media-slice-handle data-media-slice-axis="column" data-media-slice-index="${index}" style="left:${position * 100}%" aria-label="移动第 ${index + 1} 条纵向切片线"><span>列 ${index + 1}</span></button>`).join("")}
      <strong class="canvas-media-slice-count">${rows} 行 × ${columns} 列</strong>
    </div>
  </div>`;
}

function getSliceLinePositions(state, axis, count = axis === "row" ? state.sliceRows : state.sliceColumns) {
  const lineCount = Math.max(0, Math.min(11, Math.floor(Number(count) || 0) - 1));
  const key = axis === "row" ? "sliceRowPositions" : "sliceColumnPositions";
  const existing = Array.isArray(state[key]) ? state[key].map(Number).filter(Number.isFinite) : [];
  const positions = Array.from({ length: lineCount }, (_, index) => existing[index] ?? (index + 1) / (lineCount + 1));
  positions.sort((left, right) => left - right);
  for (let index = 0; index < positions.length; index += 1) {
    const minimum = index === 0 ? 0.01 : positions[index - 1] + 0.01;
    const maximum = index === positions.length - 1 ? 0.99 : 0.99 - (positions.length - index - 1) * 0.01;
    positions[index] = roundSlicePosition(clamp(positions[index], minimum, maximum));
  }
  state[key] = positions;
  return positions;
}

function normalizeAllSliceLinePositions(state) {
  getSliceLinePositions(state, "row", state.sliceRows);
  getSliceLinePositions(state, "column", state.sliceColumns);
}

function roundSlicePosition(value) {
  return Math.round(Number(value) * 10_000) / 10_000;
}

function updateSliceLineFromPointer(state, drag, event) {
  const coordinate = drag.axis === "row"
    ? (Number(event.clientY) - drag.rect.top) / drag.rect.height
    : (Number(event.clientX) - drag.rect.left) / drag.rect.width;
  const positions = getSliceLinePositions(state, drag.axis, drag.axis === "row" ? state.sliceRows : state.sliceColumns);
  const previous = positions[drag.index - 1] ?? 0.01;
  const next = positions[drag.index + 1] ?? 0.99;
  positions[drag.index] = roundSlicePosition(clamp(coordinate, previous + 0.01, next - 0.01));
  state[drag.axis === "row" ? "sliceRowPositions" : "sliceColumnPositions"] = positions;
}

function syncSliceVisualElements(surface, state) {
  const rows = Math.max(1, Math.min(12, Math.floor(Number(state.sliceRows) || 0)));
  const columns = Math.max(1, Math.min(12, Math.floor(Number(state.sliceColumns) || 0)));
  const rowBounds = [0, ...getSliceLinePositions(state, "row", rows), 1];
  const columnBounds = [0, ...getSliceLinePositions(state, "column", columns), 1];
  for (const line of surface?.querySelectorAll?.("[data-media-slice-handle]") ?? []) {
    const index = Math.max(0, Number(line.dataset.mediaSliceIndex) || 0);
    const axis = line.dataset.mediaSliceAxis === "row" ? "row" : "column";
    const position = (axis === "row" ? rowBounds[index + 1] : columnBounds[index + 1]) * 100;
    line.style[axis === "row" ? "top" : "left"] = `${position}%`;
  }
  for (const cell of surface?.querySelectorAll?.("[data-media-slice-cell]") ?? []) {
    const row = Math.max(0, Number(cell.dataset.mediaSliceRow) || 0);
    const column = Math.max(0, Number(cell.dataset.mediaSliceColumn) || 0);
    cell.style.left = `${columnBounds[column] * 100}%`;
    cell.style.top = `${rowBounds[row] * 100}%`;
    cell.style.width = `${(columnBounds[column + 1] - columnBounds[column]) * 100}%`;
    cell.style.height = `${(rowBounds[row + 1] - rowBounds[row]) * 100}%`;
  }
}

function cropRect(state) {
  const x = clamp(Number(state.cropX), 0, 99);
  const y = clamp(Number(state.cropY), 0, 99);
  const width = clamp(Number(state.cropWidth), 1, 100 - x);
  const height = clamp(Number(state.cropHeight), 1, 100 - y);
  return { x, y, width, height };
}

function updateCropFromPointer(state, drag, event) {
  const dx = (Number(event.clientX) - drag.clientX) * 100 / drag.rect.width;
  const dy = (Number(event.clientY) - drag.clientY) * 100 / drag.rect.height;
  const next = resizeCropRect(drag.crop, drag.handle, dx, dy);
  if (
    next.x !== drag.crop.x
    || next.y !== drag.crop.y
    || next.width !== drag.crop.width
    || next.height !== drag.crop.height
  ) {
    drag.changed = true;
  }
  Object.assign(state, { cropX: next.x, cropY: next.y, cropWidth: next.width, cropHeight: next.height });
}

function nudgeCrop(state, handle, key, step) {
  const dx = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
  const dy = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
  const next = resizeCropRect(cropRect(state), handle, dx, dy);
  Object.assign(state, { cropX: next.x, cropY: next.y, cropWidth: next.width, cropHeight: next.height });
}

function resizeCropRect(rect, handle, dx, dy) {
  let { x, y, width, height } = rect;
  if (handle === "move") {
    x = clamp(x + dx, 0, 100 - width);
    y = clamp(y + dy, 0, 100 - height);
  } else {
    if (handle.includes("w")) {
      const right = x + width;
      x = clamp(x + dx, 0, right - 1);
      width = right - x;
    }
    if (handle.includes("e")) width = clamp(width + dx, 1, 100 - x);
    if (handle.includes("n")) {
      const bottom = y + height;
      y = clamp(y + dy, 0, bottom - 1);
      height = bottom - y;
    }
    if (handle.includes("s")) height = clamp(height + dy, 1, 100 - y);
  }
  return {
    x: roundPercent(x), y: roundPercent(y),
    width: roundPercent(width), height: roundPercent(height),
  };
}

function syncCropVisualElements(surface, state) {
  const crop = cropRect(state);
  const selection = surface?.querySelector?.(".canvas-media-crop-selection");
  if (selection?.style) {
    selection.style.left = `${crop.x}%`;
    selection.style.top = `${crop.y}%`;
    selection.style.width = `${crop.width}%`;
    selection.style.height = `${crop.height}%`;
  }
  for (const input of surface?.querySelectorAll?.("[data-media-field^='crop']") ?? []) {
    if (input.dataset.mediaField in state) input.value = state[input.dataset.mediaField];
  }
}

function normalizeVectorStrokes(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 500).map((stroke) => ({
    width: clamp(Number(stroke?.width) || 24, 2, 96),
    points: Array.isArray(stroke?.points)
      ? stroke.points.slice(0, 10_000).map((point) => ({ x: Number(point?.x) || 0, y: Number(point?.y) || 0 }))
      : [],
  })).filter((stroke) => stroke.points.length > 1);
}

function strokesToAnnotations(strokes) {
  return normalizeVectorStrokes(strokes).map((stroke, index) => ({
    id: `brush-${index}`,
    type: "brush",
    color: "#ef4444",
    strokeWidth: stroke.width,
    points: stroke.points,
  }));
}

function normalizeAnnotations(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 1000).filter((item) => ["rectangle", "brush", "arrow", "marker", "text"].includes(item?.type)).map((item, index) => ({
    ...item,
    id: String(item.id ?? `annotation-${index}`),
    color: String(item.color ?? "#ef4444"),
    strokeWidth: clamp(Number(item.strokeWidth) || 4, 1, 96),
  }));
}

function addStructuredAnnotation(state, start, end) {
  const tool = state.annotationTool;
  const color = String(state.annotationColor || "#ef4444");
  const strokeWidth = ["rectangle", "arrow"].includes(tool)
    ? clamp(Number(state.brushSize) || 4, 1, 8)
    : clamp(Number(state.brushSize) || 4, 1, 96);
  const base = { id: `${tool}-${Date.now()}-${state.annotations?.length ?? 0}`, color, strokeWidth };
  let annotation;
  if (tool === "rectangle") annotation = { ...base, type: "rectangle", x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
  else if (tool === "arrow") annotation = { ...base, type: "arrow", startX: start.x, startY: start.y, endX: end.x, endY: end.y };
  else if (tool === "marker") {
    annotation = { ...base, type: "marker", number: Number(state.annotationNumber) || 1, x: end.x, y: end.y, size: 24 };
    state.annotationNumber = Math.max(1, Number(state.annotationNumber) || 1) + 1;
  }
  else if (tool === "text") annotation = { ...base, type: "text", text: String(state.annotationText || "标注"), x: end.x, y: end.y, fontSize: clamp(Number(state.annotationFontSize) || 32, 8, 120) };
  if (annotation) state.annotations = [...(state.annotations ?? []), annotation];
}

function createAnnotationDraft(state, start, end) {
  const tool = state.annotationTool;
  if (!['rectangle', 'arrow'].includes(tool)) return null;
  const base = {
    id: '__draft__',
    color: String(state.annotationColor || '#ef4444'),
    strokeWidth: clamp(Number(state.brushSize) || 4, 1, 8),
    type: tool,
  };
  return tool === 'rectangle'
    ? { ...base, x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) }
    : { ...base, startX: start.x, startY: start.y, endX: end.x, endY: end.y };
}

function eraseAnnotationPixel(canvas, event, state) {
  const context = canvas?.getContext?.('2d');
  if (!context) return;
  const previousMode = state.annotationMode;
  state.annotationMode = 'erase';
  drawAnnotationPoint(canvas, event, state, true);
  drawAnnotationPoint(canvas, event, state, false);
  state.annotationMode = previousMode;
}

function findAnnotationAtPoint(annotations, point) {
  const items = normalizeAnnotations(annotations).reverse();
  return items.find((item) => {
    if (item.type === "rectangle") return point.x >= item.x - 12 && point.x <= item.x + item.width + 12 && point.y >= item.y - 12 && point.y <= item.y + item.height + 12;
    if (item.type === "marker" || item.type === "text") return Math.hypot(point.x - item.x, point.y - item.y) <= Math.max(item.size ?? item.fontSize ?? 32, 32);
    if (item.type === "arrow") return distanceToSegment(point, { x: item.startX, y: item.startY }, { x: item.endX, y: item.endY }) < 18;
    return item.points?.some((candidate) => Math.hypot(point.x - candidate.x, point.y - candidate.y) < 18);
  });
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (!dx && !dy) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function moveAnnotation(annotation, dx, dy) {
  if (!annotation) return;
  if (annotation.type === "rectangle" || annotation.type === "marker" || annotation.type === "text") {
    annotation.x += dx; annotation.y += dy;
  } else if (annotation.type === "arrow") {
    annotation.startX += dx; annotation.startY += dy; annotation.endX += dx; annotation.endY += dy;
  } else if (annotation.type === "brush") {
    annotation.points = annotation.points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
  }
}

function redrawStructuredAnnotations(canvas, state, draft = null) {
  const context = canvas?.getContext?.("2d");
  if (!context) return;
  context.save?.();
  context.globalCompositeOperation = "source-over";
  context.clearRect?.(0, 0, canvas.width, canvas.height);
  for (const item of [...normalizeAnnotations(state.annotations), ...(draft ? [draft] : [])]) {
    const drawColor = String(item.color || state.annotationColor || "#ef4444");
    context.strokeStyle = drawColor;
    context.fillStyle = drawColor;
    context.lineWidth = ["rectangle", "arrow"].includes(item.type) ? Math.min(item.strokeWidth, 8) : item.strokeWidth;
    context.lineCap = item.type === "arrow" ? "butt" : "round";
    context.lineJoin = item.type === "arrow" ? "miter" : "round";
    if (item.id === '__draft__') context.setLineDash?.([8, 6]);
    if (item.type === "rectangle") context.strokeRect?.(item.x, item.y, item.width, item.height);
    else if (item.type === "arrow") {
      context.beginPath?.(); context.moveTo?.(item.startX, item.startY); context.lineTo?.(item.endX, item.endY); context.stroke?.();
      const angle = Math.atan2(item.endY - item.startY, item.endX - item.startX);
      const head = Math.max(10, Math.min(22, context.lineWidth * 3));
      context.beginPath?.(); context.moveTo?.(item.endX, item.endY); context.lineTo?.(item.endX - head * Math.cos(angle - Math.PI / 6), item.endY - head * Math.sin(angle - Math.PI / 6)); context.moveTo?.(item.endX, item.endY); context.lineTo?.(item.endX - head * Math.cos(angle + Math.PI / 6), item.endY - head * Math.sin(angle + Math.PI / 6)); context.stroke?.();
    } else if (item.type === "marker") { context.beginPath?.(); context.arc?.(item.x, item.y, item.size / 2, 0, Math.PI * 2); context.fill?.(); context.fillStyle = "#fff"; context.font = `${Math.max(12, item.size * .6)}px sans-serif`; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText?.(String(item.number), item.x, item.y); }
    else if (item.type === "text") context.font = `${item.fontSize}px sans-serif`, context.fillText?.(item.text, item.x, item.y);
    else if (item.type === "brush") { context.beginPath?.(); context.moveTo?.(item.points[0].x, item.points[0].y); for (const point of item.points.slice(1)) context.lineTo?.(point.x, point.y); context.stroke?.(); }
    if (item.id === '__draft__') context.setLineDash?.([]);
  }
  const selected = normalizeAnnotations(state.annotations).find((item) => item.id === state.selectedAnnotationId);
  if (selected) {
    context.save?.();
    context.strokeStyle = "rgba(14,165,233,.95)";
    context.setLineDash?.([6, 4]);
    const bounds = annotationBounds(selected);
    if (bounds) context.strokeRect?.(bounds.x - 8, bounds.y - 8, bounds.width + 16, bounds.height + 16);
    context.restore?.();
  }
  context.restore?.();
}

function annotationBounds(item) {
  if (item.type === "rectangle") return { x: item.x, y: item.y, width: item.width, height: item.height };
  if (item.type === "arrow") return { x: Math.min(item.startX, item.endX), y: Math.min(item.startY, item.endY), width: Math.abs(item.endX - item.startX), height: Math.abs(item.endY - item.startY) };
  if (item.type === "marker" || item.type === "text") return { x: item.x - 16, y: item.y - 16, width: item.size ?? item.fontSize ?? 32, height: item.size ?? item.fontSize ?? 32 };
  const xs = item.points?.map((point) => point.x) ?? [], ys = item.points?.map((point) => point.y) ?? [];
  if (!xs.length) return null;
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

function syncAnnotationLayerPreview(surface, state) {
  const canvas = surface?.querySelector?.("[data-media-annotation-canvas]");
  if (!canvas) return;
  if (state.annotations?.length) redrawStructuredAnnotations(canvas, state);
  else if (state.vectorStrokes?.length) redrawVectorStrokes(canvas, state.vectorStrokes, state.layerKind);
}

function redrawVectorStrokes(canvas, strokes, layerKind = "vector_annotation") {
  const context = canvas?.getContext?.("2d");
  if (!context) return;
  context.clearRect?.(0, 0, canvas.width, canvas.height);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.globalCompositeOperation = "source-over";
  context.strokeStyle = layerKind === "mask" ? "rgba(255,255,255,.95)" : "rgba(255,64,64,.9)";
  for (const stroke of normalizeVectorStrokes(strokes)) {
    context.lineWidth = stroke.width;
    context.beginPath?.();
    context.moveTo?.(stroke.points[0].x, stroke.points[0].y);
    for (const point of stroke.points.slice(1)) context.lineTo?.(point.x, point.y);
    context.stroke?.();
  }
}

function renderMediaLimits(ui, state, node) {
  const balanceCandidates = [ui.creditBalance, ui.episodeGenerationConfig?.creditBalance];
  const balance = balanceCandidates.map(Number).find((value) => Number.isFinite(value) && value >= 0);
  const referenceLimit = [
    node?.data?.referenceImageLimit,
    node?.data?.modelLimits?.maxReferenceImages,
    ui.episodeGenerationConfig?.selectedModel?.limits?.maxReferenceImages,
  ].map(Number).find((value) => Number.isFinite(value) && value > 0);
  const rows = [
    Number.isFinite(balance) ? ["积分余额", String(balance)] : null,
    state.tool === "composite" ? ["合成输入", `${state.compositeSecondaryArtifactId ? 2 : 1}/2`] : null,
    Number.isFinite(referenceLimit) ? ["模型参考图上限", String(referenceLimit)] : null,
  ].filter(Boolean);
  if (!rows.length) return "";
  return `<dl class="canvas-media-limits" aria-label="生成配额与限制">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>`;
}

function resolveMediaImageModelOptions(ui = {}) {
  return resolveCanvasModelOptions(ui.episodeGenerationConfig ?? {}, "image");
}

function syncMediaGenerationModelCode(ui, state, node, options = []) {
  const optionCodes = new Set(options.map((option) => option.modelCode));
  const candidates = [
    state.generationModelCode,
    node?.data?.modelCode,
    ui.canvasGenerationModelCode,
    ui.episodeGenerationConfig?.defaultImageModelCode,
    options[0]?.modelCode,
  ].map((value) => String(value ?? "").trim()).filter(Boolean);
  state.generationModelCode = candidates.find((code) => !optionCodes.size || optionCodes.has(code)) ?? "";
  return state.generationModelCode;
}

function renderMediaModelField(state, options = []) {
  const selected = String(state.generationModelCode ?? "");
  const choices = options.length
    ? options.map((option) => {
      const label = option.modelLabel || option.modelCode;
      return `<option value="${escapeAttr(option.modelCode)}" ${option.modelCode === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
    }).join("")
    : '<option value="">暂无可用图片模型</option>';
  return `<label class="canvas-media-submit-model"><select aria-label="图片模型" data-media-field="generationModelCode" ${options.length ? "" : "disabled"}>${choices}</select></label>`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundPercent(value) {
  return Math.round(value * 10) / 10;
}

function annotationLayerLabel(kind) {
  if (kind === "mask") return "蒙版";
  if (kind === "vector_annotation") return "矢量标注";
  return "栅格标注";
}

function buildRequestSnapshot(state) {
  return {
    instruction: state.instruction.trim(),
    ...(state.tool === "crop" ? { crop: { x: Number(state.cropX), y: Number(state.cropY), width: Number(state.cropWidth), height: Number(state.cropHeight), unit: "percent" } } : {}),
    ...(state.tool === "outpaint" ? { outpaintPixels: Number(state.outpaintPixels) } : {}),
    ...(state.tool === "remove_background" ? { removeBackground: { featherPixels: Number(state.backgroundFeatherPixels), preserveShadow: state.preserveShadow === true } } : {}),
    ...(state.tool === "free_view" ? { camera: { azimuthDegrees: Number(state.viewAzimuthDegrees), elevationDegrees: Number(state.viewElevationDegrees), distanceScale: Number(state.viewDistanceScale) } } : {}),
    ...(state.tool === "camera_studio" ? { cameraStudio: {
      focalLengthMm: Number(state.cameraFocalLengthMm),
      aperture: Number(state.cameraAperture),
      lightingPreset: String(state.cameraLightingPreset),
      mode: String(state.cameraStudioMode),
      activeControl: String(state.cameraStudioActiveControl),
      camera: {
        yawDegrees: Number(state.cameraYawDegrees),
        pitchDegrees: Number(state.cameraPitchDegrees),
        rollDegrees: Number(state.cameraRollDegrees),
        distance: String(state.cameraDistance),
        lens: String(state.cameraLens),
        promptEnhance: state.cameraPromptEnhance === true,
      },
      light: {
        yawDegrees: Number(state.lightYawDegrees),
        pitchDegrees: Number(state.lightPitchDegrees),
        intensityPercent: Number(state.lightIntensityPercent),
        temperature: String(state.lightTemperature),
        color: normalizeCameraStudioLightColor(state.lightColor),
        rimLight: state.lightRimEnabled === true,
        fillLight: state.lightFillEnabled === true,
      },
      prompt: buildCameraStudioPrompt(state),
    } } : {}),
    ...(state.tool === "slice" ? { slice: { rows: Number(state.sliceRows), columns: Number(state.sliceColumns), gapPixels: Number(state.sliceGapPixels) } } : {}),
    ...(state.tool === "composite" ? { composite: {
      blendMode: String(state.compositeBlendMode),
      opacity: Number(state.compositeOpacityPercent) / 100,
      alignment: String(state.compositeAlignment),
      secondaryArtifactId: String(state.compositeSecondaryArtifactId),
      secondarySource: state.compositeSecondarySource && typeof state.compositeSecondarySource === "object"
        ? { ...state.compositeSecondarySource }
        : null,
    } } : {}),
  };
}

function buildFreeViewPrompt(state) {
  const yaw = Math.round(clamp(Number(state.viewAzimuthDegrees) || 0, -180, 180));
  const pitch = Math.round(clamp(Number(state.viewElevationDegrees) || 0, -90, 90));
  const distance = clamp(Number(state.viewDistanceScale) || 1, 0.1, 5).toFixed(1);
  return `Edit the reference image only. Preserve the same subject and scene. Change viewpoint to horizontal ${yaw} degrees, vertical ${pitch} degrees, camera distance ${distance}x.`;
}

function renderProfessionalControls(state, artifacts = [], sourcePreviewUrl = "") {
  if (state.tool === "remove_background") {
    return `<div class="canvas-media-parameter-grid">
      ${numberField("边缘羽化", "backgroundFeatherPixels", state.backgroundFeatherPixels, 0, 64)}
      ${checkboxField("保留投影", "preserveShadow", state.preserveShadow)}
    </div>`;
  }
  if (state.tool === "free_view") {
    return `<div class="canvas-media-parameter-grid">
      ${numberField("水平角度", "viewAzimuthDegrees", state.viewAzimuthDegrees, -180, 180)}
      ${numberField("俯仰角度", "viewElevationDegrees", state.viewElevationDegrees, -90, 90)}
      ${numberField("镜头距离", "viewDistanceScale", state.viewDistanceScale, 0.1, 5, 0.1)}
    </div>`;
  }
  if (state.tool === "camera_studio") {
    return renderCameraStudioControls(state, sourcePreviewUrl);
  }
  if (state.tool === "slice") {
    return `<div class="canvas-media-parameter-grid">
      ${numberField("行数", "sliceRows", state.sliceRows, 1, 12)}
      ${numberField("列数", "sliceColumns", state.sliceColumns, 1, 12)}
      ${numberField("间距像素", "sliceGapPixels", state.sliceGapPixels, 0, 128)}
    </div>`;
  }
  if (state.tool === "composite") {
    const options = [...artifacts, state.compositeUpload].filter(Boolean);
    const selected = options.find((artifact) => artifact.artifactId === state.compositeSecondaryArtifactId);
    return `<div class="canvas-media-parameter-grid">
      <label class="canvas-media-parameter-span"><span>第二张图片</span><select data-media-field="compositeSecondaryArtifactId" required><option value="">请选择图片节点</option>${options.map((artifact) => `<option value="${escapeAttr(artifact.artifactId)}" ${artifact.artifactId === state.compositeSecondaryArtifactId ? "selected" : ""}>${escapeHtml(artifact.title)}</option>`).join("")}</select></label>
      <div class="canvas-media-composite-upload canvas-media-parameter-span"><input type="file" accept="image/*" data-media-composite-upload hidden /><button type="button" data-media-action="composite-upload-trigger">上传图片</button><small>仅支持图片文件</small></div>
      <figure class="canvas-media-composite-preview ${selected?.url ? "is-selected" : "is-empty"}">${selected?.url ? `<img src="${escapeAttr(selected.url)}" alt="${escapeAttr(selected.title)}" /><figcaption><strong>${escapeHtml(selected.title)}</strong><small>已选择作为第二张图片</small></figcaption>` : `<div class="canvas-media-composite-preview-empty">请选择图片节点或上传图片</div>`}</figure>
      ${selectField("混合模式", "compositeBlendMode", state.compositeBlendMode, [["normal", "正常"], ["multiply", "正片叠底"], ["screen", "滤色"], ["overlay", "叠加"]])}
      ${numberField("不透明度 %", "compositeOpacityPercent", state.compositeOpacityPercent, 0, 100)}
      ${selectField("对齐", "compositeAlignment", state.compositeAlignment, [["center", "居中"], ["top_left", "左上"], ["top_right", "右上"], ["bottom_left", "左下"], ["bottom_right", "右下"]])}
    </div>`;
  }
  return "";
}

function renderCameraStudioControls(state, sourcePreviewUrl = "") {
  const mode = ["camera", "lighting", "dual"].includes(state.cameraStudioMode) ? state.cameraStudioMode : "camera";
  const activeControl = mode === "dual"
    ? (state.cameraStudioActiveControl === "lighting" ? "lighting" : "camera")
    : mode;
  const prompt = buildCameraStudioPrompt(state);
  return `<div class="canvas-camera-studio-workspace">
    <div class="canvas-camera-studio-main">
      ${renderCameraStudioViewport(state, sourcePreviewUrl)}
      <label class="canvas-media-instruction-field canvas-camera-studio-instruction"><span>编辑要求</span><textarea data-media-field="instruction" placeholder="描述构图、视角或需要保留的内容">${escapeHtml(state.instruction)}</textarea></label>
    </div>
    <div class="canvas-camera-studio-controls">
    <div class="canvas-camera-studio-segments" role="tablist" aria-label="摄影棚模式">
      ${cameraStudioSegment("camera", "摄影机", mode, "camera-studio-mode", "cameraStudioMode")}
      ${cameraStudioSegment("lighting", "打光", mode, "camera-studio-mode", "cameraStudioMode")}
      ${cameraStudioSegment("dual", "联动", mode, "camera-studio-mode", "cameraStudioMode")}
    </div>
    ${mode === "dual" ? `<div class="canvas-camera-studio-segments compact" role="group" aria-label="联动控制对象">
      ${cameraStudioSegment("camera", "摄影机", activeControl, "camera-studio-control", "cameraStudioControl")}
      ${cameraStudioSegment("lighting", "主光源", activeControl, "camera-studio-control", "cameraStudioControl")}
    </div>` : ""}
    ${activeControl === "camera" ? renderCameraStudioCameraControls(state) : renderCameraStudioLightControls(state)}
    <div class="canvas-camera-studio-prompt">
      <div><strong>STUDIO PROMPT</strong><span>${escapeHtml(mode.toUpperCase())}</span></div>
      <p data-camera-studio-prompt>${escapeHtml(prompt)}</p>
      <div class="canvas-camera-studio-actions">
        <button type="button" data-media-action="camera-studio-reset">重置参数</button>
        <button type="button" data-media-action="camera-studio-copy">${state.cameraPromptCopied ? "已复制" : "复制提示词"}</button>
      </div>
      </div>
    </div>
  </div>`;
}

function renderCameraStudioViewport(state, sourcePreviewUrl) {
  const mode = ["camera", "lighting", "dual"].includes(state.cameraStudioMode) ? state.cameraStudioMode : "camera";
  const activeControl = mode === "dual"
    ? (state.cameraStudioActiveControl === "lighting" ? "lighting" : "camera")
    : mode;
  const readoutValue = activeControl === "lighting" ? state.lightYawDegrees : state.cameraYawDegrees;
  return `<div class="canvas-camera-studio-viewport canvas-media-source-preview" role="application" tabindex="0" aria-label="摄影棚三维视口，可拖动调整${activeControl === "lighting" ? "灯光" : "摄影机"}方向"
    data-camera-studio-viewport data-source-url="${escapeAttr(sourcePreviewUrl)}" data-studio-mode="${escapeAttr(mode)}" data-active-control="${escapeAttr(activeControl)}"
    data-camera-yaw="${escapeAttr(state.cameraYawDegrees)}" data-camera-pitch="${escapeAttr(state.cameraPitchDegrees)}" data-camera-roll="${escapeAttr(state.cameraRollDegrees)}"
    data-camera-focal-length="${escapeAttr(state.cameraFocalLengthMm)}" data-camera-aperture="${escapeAttr(state.cameraAperture)}"
    data-light-yaw="${escapeAttr(state.lightYawDegrees)}" data-light-pitch="${escapeAttr(state.lightPitchDegrees)}" data-light-intensity="${escapeAttr(state.lightIntensityPercent)}"
    data-light-temperature="${escapeAttr(state.lightTemperature)}" data-light-color="${escapeAttr(normalizeCameraStudioLightColor(state.lightColor))}" data-light-preset="${escapeAttr(state.cameraLightingPreset)}" data-light-rim="${escapeAttr(state.lightRimEnabled)}" data-light-fill="${escapeAttr(state.lightFillEnabled)}">
    <canvas data-camera-studio-canvas aria-hidden="true"></canvas>
    ${sourcePreviewUrl ? `<img class="canvas-camera-studio-viewport-image" src="${escapeAttr(sourcePreviewUrl)}" alt="" aria-hidden="true" draggable="false" />` : '<div class="canvas-camera-studio-viewport-empty">当前节点没有可预览的图片</div>'}
    <span class="canvas-camera-studio-axis is-yaw" aria-hidden="true">YAW</span>
    <span class="canvas-camera-studio-axis is-pitch" aria-hidden="true">PITCH</span>
    <div class="canvas-camera-studio-readout" aria-live="polite"><span data-camera-studio-readout-kind>${activeControl === "lighting" ? "LIGHT" : "CAM"}</span><strong data-camera-studio-readout-value>${escapeHtml(readoutValue)}°</strong></div>
    <div class="canvas-camera-studio-legend" aria-hidden="true"><span class="canvas-camera-studio-legend-item is-camera">摄影机</span><span class="canvas-camera-studio-legend-item is-light">主光源</span></div>
  </div>`;
}

function renderCameraStudioCameraControls(state) {
  return `<div class="canvas-camera-studio-panel" data-camera-studio-panel="camera">
    <strong>摄影机参数</strong>
    <div class="canvas-camera-studio-presets" aria-label="机位预设">
      ${[["front", "正面"], ["three_quarter", "右前 3/4"], ["profile", "侧面"], ["back", "背面"], ["high", "高机位"], ["low", "低机位"], ["overhead", "俯拍"], ["dutch", "荷兰角"]]
        .map(([value, label]) => `<button type="button" data-media-action="camera-studio-preset" data-camera-studio-preset="camera:${value}">${label}</button>`).join("")}
    </div>
    <div class="canvas-camera-studio-ranges">
      ${rangeField("水平角度", "cameraYawDegrees", state.cameraYawDegrees, -180, 180, 1, "°")}
      ${rangeField("垂直角度", "cameraPitchDegrees", state.cameraPitchDegrees, -80, 80, 1, "°")}
      ${rangeField("画面倾斜", "cameraRollDegrees", state.cameraRollDegrees, -45, 45, 1, "°")}
    </div>
    <div class="canvas-media-parameter-grid">
      ${selectField("景别", "cameraDistance", state.cameraDistance, [["far", "远景"], ["full", "全身"], ["medium", "中景"], ["close", "近景"], ["extreme-close", "特写"]])}
      ${selectField("镜头", "cameraLens", state.cameraLens, [["15mm", "15mm"], ["24mm", "24mm"], ["35mm", "35mm"], ["50mm", "50mm"], ["85mm", "85mm"], ["200mm", "200mm"], ["fisheye", "鱼眼"]])}
      ${numberField("焦距 mm", "cameraFocalLengthMm", state.cameraFocalLengthMm, 12, 200)}
      ${numberField("光圈", "cameraAperture", state.cameraAperture, 1, 22, 0.1)}
      ${checkboxField("电影感增强", "cameraPromptEnhance", state.cameraPromptEnhance)}
    </div>
  </div>`;
}

function renderCameraStudioLightControls(state) {
  return `<div class="canvas-camera-studio-panel" data-camera-studio-panel="lighting">
    <strong>主光源参数</strong>
    <div class="canvas-camera-studio-presets" aria-label="灯光预设">
      ${[["front", "正面光"], ["left", "左侧光"], ["right", "右侧光"], ["top", "顶光"], ["back", "逆光"], ["bottom", "底光"]]
        .map(([value, label]) => `<button type="button" data-media-action="camera-studio-preset" data-camera-studio-preset="light:${value}">${label}</button>`).join("")}
    </div>
    <div class="canvas-camera-studio-ranges">
      ${rangeField("水平角度", "lightYawDegrees", state.lightYawDegrees, -180, 180, 1, "°")}
      ${rangeField("垂直角度", "lightPitchDegrees", state.lightPitchDegrees, -80, 80, 1, "°")}
      ${rangeField("光照强度", "lightIntensityPercent", state.lightIntensityPercent, 0, 100, 1, "%")}
    </div>
    <div class="canvas-media-parameter-grid">
      ${renderCameraStudioLightColorField(state)}
      ${selectField("色温", "lightTemperature", state.lightTemperature, [["cool", "冷光"], ["neutral", "中性"], ["warm", "暖光"], ["custom", "自定义"]])}
      ${selectField("布光", "cameraLightingPreset", state.cameraLightingPreset, [["softbox", "柔光箱"], ["three_point", "三点布光"], ["rim_light", "轮廓光"], ["natural", "自然光"]])}
      ${checkboxField("轮廓光", "lightRimEnabled", state.lightRimEnabled)}
      ${checkboxField("柔和补光", "lightFillEnabled", state.lightFillEnabled)}
    </div>
  </div>`;
}

function cameraStudioSegment(value, label, selected, action, dataKey) {
  const attribute = dataKey === "cameraStudioControl" ? "data-camera-studio-control" : "data-camera-studio-mode";
  return `<button type="button" role="tab" aria-selected="${selected === value}" class="${selected === value ? "active" : ""}" data-media-action="${action}" ${attribute}="${value}">${label}</button>`;
}

function rangeField(label, field, value, min, max, step = 1, suffix = "") {
  return `<label class="canvas-camera-studio-range"><span>${label}</span><output data-media-output="${field}" data-suffix="${escapeAttr(suffix)}">${escapeHtml(value)}${escapeHtml(suffix)}</output><input type="range" min="${min}" max="${max}" step="${step}" data-media-field="${field}" value="${escapeAttr(value)}" /></label>`;
}

function renderCameraStudioLightColorField(state) {
  const color = normalizeCameraStudioLightColor(state.lightColor);
  return `<label class="canvas-camera-studio-light-color canvas-media-parameter-span"><span>光源颜色</span><span class="canvas-camera-studio-light-color-controls"><input type="color" data-media-field="lightColor" value="${escapeAttr(color)}" aria-label="选择光源颜色" /><input type="text" data-media-color-hex="lightColor" value="${escapeAttr(color)}" inputmode="text" maxlength="7" spellcheck="false" aria-label="光源颜色 HEX 值" /></span></label>`;
}

function syncCameraStudioLiveElements(surface, state, field) {
  const output = surface?.querySelector?.(`[data-media-output="${field}"]`);
  if (output) output.textContent = `${state[field]}${output.dataset?.suffix ?? ""}`;
  const input = surface?.querySelector?.(`[data-media-field="${field}"]`);
  if (input && String(input.value) !== String(state[field])) input.value = String(state[field]);
  if (field === "lightColor") {
    const color = normalizeCameraStudioLightColor(state.lightColor);
    const hexInput = surface?.querySelector?.('[data-media-color-hex="lightColor"]');
    if (hexInput && String(hexInput.value) !== color) hexInput.value = color;
  }
  const prompt = surface?.querySelector?.("[data-camera-studio-prompt]");
  if (prompt) prompt.textContent = buildCameraStudioPrompt(state);
  const copyButton = surface?.querySelector?.('[data-media-action="camera-studio-copy"]');
  if (copyButton) copyButton.textContent = "复制提示词";
  syncCameraStudioViewportDataset(surface?.querySelector?.("[data-camera-studio-viewport]"), state);
  const activeControl = state.cameraStudioMode === "dual" ? state.cameraStudioActiveControl : state.cameraStudioMode;
  const readoutKind = surface?.querySelector?.("[data-camera-studio-readout-kind]");
  const readoutValue = surface?.querySelector?.("[data-camera-studio-readout-value]");
  if (readoutKind) readoutKind.textContent = activeControl === "lighting" ? "LIGHT" : "CAM";
  if (readoutValue) readoutValue.textContent = `${activeControl === "lighting" ? state.lightYawDegrees : state.cameraYawDegrees}°`;
}

function syncCameraStudioViewportDataset(viewport, state) {
  if (!viewport?.dataset) return;
  Object.assign(viewport.dataset, {
    studioMode: String(state.cameraStudioMode),
    activeControl: String(state.cameraStudioMode === "dual" ? state.cameraStudioActiveControl : state.cameraStudioMode),
    cameraYaw: String(state.cameraYawDegrees),
    cameraPitch: String(state.cameraPitchDegrees),
    cameraRoll: String(state.cameraRollDegrees),
    cameraFocalLength: String(state.cameraFocalLengthMm),
    cameraAperture: String(state.cameraAperture),
    lightYaw: String(state.lightYawDegrees),
    lightPitch: String(state.lightPitchDegrees),
    lightIntensity: String(state.lightIntensityPercent),
    lightTemperature: String(state.lightTemperature),
    lightColor: normalizeCameraStudioLightColor(state.lightColor),
    lightPreset: String(state.cameraLightingPreset),
    lightRim: String(state.lightRimEnabled),
    lightFill: String(state.lightFillEnabled),
  });
}

function applyCameraStudioPreset(state, presetToken) {
  const [kind, id] = String(presetToken ?? "").split(":");
  if (kind === "camera") {
    const preset = CAMERA_STUDIO_CAMERA_PRESETS[id];
    if (!preset) return false;
    state.cameraYawDegrees = preset.yaw;
    state.cameraPitchDegrees = preset.pitch;
    state.cameraRollDegrees = preset.roll ?? 0;
    if (preset.lens) {
      state.cameraLens = preset.lens;
      const focalLength = Number.parseInt(preset.lens, 10);
      if (Number.isFinite(focalLength)) state.cameraFocalLengthMm = focalLength;
    }
    return true;
  }
  if (kind === "light") {
    const preset = CAMERA_STUDIO_LIGHT_PRESETS[id];
    if (!preset) return false;
    state.lightYawDegrees = preset.yaw;
    state.lightPitchDegrees = preset.pitch;
    return true;
  }
  return false;
}

function resetCameraStudioState(state) {
  Object.assign(state, {
    cameraStudioMode: "camera",
    cameraStudioActiveControl: "camera",
    cameraYawDegrees: 0,
    cameraPitchDegrees: 0,
    cameraRollDegrees: 0,
    cameraDistance: "medium",
    cameraLens: "35mm",
    cameraFocalLengthMm: 50,
    cameraAperture: 2.8,
    cameraPromptEnhance: true,
    cameraLightingPreset: "softbox",
    lightYawDegrees: 45,
    lightPitchDegrees: 30,
    lightIntensityPercent: 65,
    lightTemperature: "neutral",
    lightColor: "#ffffff",
    lightRimEnabled: false,
    lightFillEnabled: true,
    cameraPromptCopied: false,
  });
}

function buildCameraStudioPrompt(state) {
  const mode = ["camera", "lighting", "dual"].includes(state.cameraStudioMode) ? state.cameraStudioMode : "camera";
  const cameraTerms = [
    describeCameraYaw(state.cameraYawDegrees),
    describeCameraPitch(state.cameraPitchDegrees),
    ({ far: "wide framing", full: "full-body framing", medium: "medium framing", close: "close framing", "extreme-close": "extreme close framing" })[state.cameraDistance] ?? "medium framing",
    describeCameraStudioLens(state),
    describeCameraStudioAperture(state.cameraAperture),
  ];
  if (Math.abs(Number(state.cameraRollDegrees)) >= 1) cameraTerms.push(`${Math.round(Number(state.cameraRollDegrees))} degree dutch angle`);
  if (state.cameraPromptEnhance === true) cameraTerms.push("natural composition, clear detail");
  const lightTerms = [
    describeLightDirection(state.lightYawDegrees, state.lightPitchDegrees),
    `${Math.round(Number(state.lightIntensityPercent) || 0)}% intensity`,
    ({ cool: "cool daylight color temperature", neutral: "neutral studio color temperature", warm: "warm tungsten color temperature" })[state.lightTemperature] ?? "neutral studio color temperature",
    ({ softbox: "softbox lighting", three_point: "three-point studio lighting", rim_light: "rim-light setup", natural: "natural-light setup" })[state.cameraLightingPreset] ?? "softbox lighting",
  ];
  if (state.lightTemperature === "custom") lightTerms.push(`custom ${normalizeCameraStudioLightColor(state.lightColor)} light color`);
  if (state.lightRimEnabled === true) lightTerms.push("subtle rim light");
  if (state.lightFillEnabled === true) lightTerms.push("soft fill light");
  const sections = ["Edit the reference image only. Preserve the same subject, clothing, and scene."];
  if (mode === "camera" || mode === "dual") sections.push(`Camera: ${cameraTerms.join(", ")}.`);
  if (mode === "lighting" || mode === "dual") sections.push(`Lighting: ${lightTerms.join(", ")}.`);
  return sections.join(" ");
}

function cameraStudioTemperatureColor(value) {
  return ({ cool: "#90c8ff", warm: "#ffa652", neutral: "#ffffff" })[String(value ?? "")] ?? "#ffffff";
}

function normalizeCameraStudioLightColor(value) {
  const color = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "#ffffff";
}

function describeCameraStudioLens(state) {
  if (state.cameraLens === "fisheye") return "fisheye lens";
  const focalLength = Math.max(12, Math.min(200, Number(state.cameraFocalLengthMm) || Number.parseInt(state.cameraLens, 10) || 35));
  if (focalLength <= 15) return `${focalLength}mm ultra-wide lens`;
  if (focalLength <= 28) return `${focalLength}mm wide lens`;
  return `${focalLength}mm lens`;
}

function describeCameraStudioAperture(value) {
  const aperture = Math.max(1, Math.min(22, Number(value) || 2.8));
  if (aperture <= 2) return `f/${aperture}, shallow depth of field`;
  if (aperture <= 4) return `f/${aperture}, soft background`;
  if (aperture <= 8) return `f/${aperture}, balanced depth of field`;
  return `f/${aperture}, deep depth of field`;
}

function describeCameraYaw(value) {
  const yaw = normalizeAngle(value);
  if (yaw >= -22.5 && yaw < 22.5) return "front angle";
  if (yaw >= 22.5 && yaw < 67.5) return "front-right three-quarter angle";
  if (yaw >= 67.5 && yaw < 112.5) return "right profile angle";
  if (yaw >= 112.5 && yaw < 157.5) return "rear-right three-quarter angle";
  if (yaw >= 157.5 || yaw < -157.5) return "rear angle";
  if (yaw >= -157.5 && yaw < -112.5) return "rear-left three-quarter angle";
  if (yaw >= -112.5 && yaw < -67.5) return "left profile angle";
  return "front-left three-quarter angle";
}

function describeCameraPitch(value) {
  const pitch = Number(value) || 0;
  if (pitch >= 65) return "overhead angle";
  if (pitch > 15) return "high angle";
  if (pitch < -12) return "low angle";
  return "eye-level angle";
}

function describeLightDirection(yawValue, pitchValue) {
  const yaw = normalizeAngle(yawValue);
  const direction = yaw >= 45 && yaw < 135
    ? "right-side"
    : yaw <= -45 && yaw > -135
      ? "left-side"
      : yaw >= 135 || yaw <= -135 ? "back" : "front";
  const pitch = Number(pitchValue) || 0;
  return `${direction}${pitch > 20 ? " elevated" : pitch < -15 ? " low" : ""} key light`;
}

function normalizeAngle(value) {
  const normalized = ((Number(value) + 180) % 360 + 360) % 360 - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function recoveredMediaStatus(state) {
  if (state.annotationLayerId) return "completed";
  if (state.batchGroup?.id) return recoveredBatchStatus(state.batchGroup);
  if (state.derivationId || state.taskId) return "running";
  return "idle";
}

function recoveredBatchStatus(group) {
  const status = String(group?.status ?? "").trim().toLowerCase();
  if (["completed", "succeeded", "selected"].includes(status)) return "completed";
  if (["failed", "canceled", "cancelled"].includes(status)) return "failed";
  return "running";
}

function sourceBinding(node) {
  const data = node?.data ?? {};
  return {
    assetId: data.assetId ?? data.sourceAssetId ?? null,
    assetVersionId: data.assetVersionId ?? data.sourceAssetVersionId ?? null,
    storageObjectId: data.storageObjectId ?? data.sourceStorageObjectId ?? data.resultStorageObjectId ?? null,
  };
}

function numberField(label, field, value, min, max, step = 1) {
  return `<label><span>${label}</span><input type="number" min="${min}" max="${max}" step="${step}" data-media-field="${field}" value="${escapeAttr(value)}" /></label>`;
}

function checkboxField(label, field, checked) {
  return `<label class="canvas-media-checkbox"><input type="checkbox" data-media-field="${field}" ${checked ? "checked" : ""} /><span>${label}</span></label>`;
}

function selectField(label, field, value, options) {
  return `<label><span>${label}</span><select data-media-field="${field}">${options.map(([optionValue, optionLabel]) => `<option value="${escapeAttr(optionValue)}" ${value === optionValue ? "selected" : ""}>${optionLabel}</option>`).join("")}</select></label>`;
}

function statusLabel(state) {
  if (state.status === "running") return "图片生成中（处理中）";
  if (state.status === "completed") return "处理完成";
  if (state.status === "failed") return "提交失败";
  if (state.status === "submitting") return "正在创建任务";
  return "等待操作";
}

function friendlyError(error) {
  return String(error?.message ?? error?.errorCode ?? error ?? "媒体编辑失败");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function escapeAttr(value) {
  return escapeHtml(resolveStaticAssetUrl(value));
}
