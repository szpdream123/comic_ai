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
    lightRimEnabled: false,
    lightFillEnabled: true,
    cameraPromptCopied: false,
    sliceRows: 2,
    sliceColumns: 2,
    sliceGapPixels: 0,
    compositeBlendMode: "normal",
    compositeOpacityPercent: 100,
    compositeAlignment: "center",
    compositeSecondaryArtifactId: "",
    compositeSecondarySource: null,
    brushSize: 24,
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
  const artifacts = mediaArtifactsForNode(ui, selected?.id);
  const canvasArtifacts = mediaArtifactsForCanvas(ui);
  const busy = state.status === "submitting";
  return `
    <div class="canvas-media-tools-backdrop" data-media-action="close">
      <aside class="canvas-media-tools-drawer" role="dialog" aria-label="媒体编辑" aria-modal="true">
        <button type="button" class="canvas-media-drawer-grip" data-media-drawer-grip data-media-action="drawer-grip" aria-label="关闭媒体编辑" title="点击或向下滑动关闭"></button>
        <header><strong>媒体编辑</strong><button type="button" data-media-action="close" aria-label="关闭">×</button></header>
        <div class="canvas-media-tool-tabs" role="tablist">
          ${MEDIA_TOOLS.map((tool) => `<button type="button" role="tab" aria-selected="${state.tool === tool.id}" class="${state.tool === tool.id ? "active" : ""}" data-media-action="select-tool" data-media-tool="${tool.id}">${tool.label}</button>`).join("")}
        </div>
        <section>
          <label><span>源节点</span><input value="${escapeAttr(selected?.data?.title ?? selected?.id ?? "未选择图片")}" disabled /></label>
          ${state.tool === "crop" ? `
            ${renderCropStage(state, selected)}
            <div class="canvas-media-crop-grid">
              ${numberField("X", "cropX", state.cropX, 0, 100)}
              ${numberField("Y", "cropY", state.cropY, 0, 100)}
              ${numberField("宽度", "cropWidth", state.cropWidth, 1, 100)}
              ${numberField("高度", "cropHeight", state.cropHeight, 1, 100)}
            </div>
          ` : ""}
          ${state.tool === "outpaint" ? numberField("扩展像素", "outpaintPixels", state.outpaintPixels, 32, 2048) : ""}
          ${renderProfessionalControls(state, canvasArtifacts)}
          ${state.tool === "annotation" ? `
            <div class="canvas-media-annotation-stage" style="background-image:url('${escapeAttr(selected?.data?.url ?? selected?.data?.previewUrl ?? "")}')">
              <canvas width="640" height="360" tabindex="0" data-media-annotation-canvas aria-label="图片标注画布"></canvas>
            </div>
            <div class="canvas-media-annotation-toolbar" role="toolbar" aria-label="标注工具">
              <button type="button" class="${state.annotationMode === "draw" ? "active" : ""}" aria-pressed="${state.annotationMode === "draw"}" data-media-action="annotation-mode" data-annotation-mode="draw">画笔</button>
              <button type="button" class="${state.annotationMode === "erase" ? "active" : ""}" aria-pressed="${state.annotationMode === "erase"}" data-media-action="annotation-mode" data-annotation-mode="erase">橡皮擦</button>
              <button type="button" data-media-action="annotation-undo">撤销</button>
              <button type="button" data-media-action="annotation-clear">清空</button>
            </div>
            <div class="canvas-media-crop-grid">
              ${numberField("画笔", "brushSize", state.brushSize, 2, 96)}
              <label><span>图层</span><select data-media-field="layerKind"><option value="mask" ${state.layerKind === "mask" ? "selected" : ""}>蒙版</option><option value="raster_annotation" ${state.layerKind === "raster_annotation" ? "selected" : ""}>栅格标注</option><option value="vector_annotation" ${state.layerKind === "vector_annotation" ? "selected" : ""}>矢量标注</option></select></label>
            </div>
            ${renderAnnotationLayerList(state)}
          ` : ""}
          ${state.tool === "batch_grid" ? renderBatchGrid(state, artifacts) : ""}
          ${!["annotation", "batch_grid"].includes(state.tool) ? `<label><span>编辑要求</span><textarea data-media-field="instruction" placeholder="描述构图、视角或需要保留的内容">${escapeHtml(state.instruction)}</textarea></label>` : ""}
        </section>
        ${renderMediaLimits(ui, state, selected)}
        ${renderRecoverySummary(state)}
        <footer>
          <span class="canvas-media-status">${statusLabel(state)}</span>
          <button type="button" data-media-action="submit" ${busy || !selected ? "disabled" : ""}>${busy ? "提交中" : "开始处理"}</button>
        </footer>
        ${state.error ? `<p class="canvas-media-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
      </aside>
    </div>
  `;
}

export function createCanvasMediaToolsController({ surface, workbench, render }) {
  const state = ensureCanvasMediaToolsState(workbench.ui ?? (workbench.ui = {}));
  const rerender = () => {
    const current = surface?.querySelector?.(".canvas-media-tools-backdrop");
    if (!current || typeof document === "undefined") return render?.();
    const template = document.createElement("template");
    template.innerHTML = renderCanvasMediaToolsShell(workbench.ui);
    const next = template.content.firstElementChild;
    if (!next) {
      current.remove?.();
      return true;
    }
    const currentAnnotationCanvas = current.querySelector?.("[data-media-annotation-canvas]");
    const nextAnnotationCanvas = next.querySelector?.("[data-media-annotation-canvas]");
    if (currentAnnotationCanvas && nextAnnotationCanvas) {
      nextAnnotationCanvas.replaceWith(currentAnnotationCanvas);
    }
    current.replaceWith?.(next);
    return true;
  };
  const annotationHistory = [];
  let cropDrag = null;
  let drawerDrag = null;
  let suppressDrawerGripClick = false;
  let restoreFocusTarget = null;
  let recoveryTimer = null;
  let recoveryGeneration = 0;
  let copyFeedbackTimer = null;
  const stopRecoveryPolling = () => {
    recoveryGeneration += 1;
    if (recoveryTimer !== null) clearTimeout(recoveryTimer);
    recoveryTimer = null;
  };
  const startRecoveryPolling = async () => {
    stopRecoveryPolling();
    const generation = recoveryGeneration;
    const result = await refreshCanvasMediaRecoveryState(workbench, state).catch((error) => {
      state.error = friendlyError(error);
      rerender();
      return { active: false };
    });
    rerender();
    if (!state.open || generation !== recoveryGeneration || !result.active) return;
    recoveryTimer = setTimeout(() => { void startRecoveryPolling(); }, 2_000);
  };
  const closeAndRestoreFocus = async () => {
    stopRecoveryPolling();
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
    handleInput(target) {
      const field = String(target?.dataset?.mediaField ?? "");
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
        if (field === "compositeSecondaryArtifactId") {
          const artifact = mediaArtifactsForCanvas(workbench.ui).find((item) => item.artifactId === state.compositeSecondaryArtifactId);
          state.compositeSecondarySource = artifact ? artifact.source : null;
        }
      }
      if (state.tool === "camera_studio" && /^(camera|light)/.test(field)) {
        state.cameraPromptCopied = false;
        syncCameraStudioLiveElements(surface, state, field);
      }
      return true;
    },
    handlePointerDown(event, target) {
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
      if (!target?.matches?.("[data-media-annotation-canvas]")) return false;
      const snapshot = captureAnnotationCanvas(target);
      if (snapshot) {
        annotationHistory.push(snapshot);
        if (annotationHistory.length > 30) annotationHistory.shift();
      }
      state.annotationDrawing = true;
      if (state.layerKind === "vector_annotation") {
        const point = annotationPoint(target, event);
        if (point) state.vectorStrokes.push({ width: Number(state.brushSize) || 24, points: [point] });
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
      if (!state.annotationDrawing || !target?.matches?.("[data-media-annotation-canvas]")) return false;
      if (state.layerKind === "vector_annotation") {
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
      if (!state.annotationDrawing) return false;
      state.annotationDrawing = false;
      target?.releasePointerCapture?.(event.pointerId);
      return true;
    },
    handleKeydown(event, target) {
      if (!state.open) return false;
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
    async handleAction(target, event) {
      const action = String(target?.dataset?.mediaAction ?? "");
      if (!action) return false;
      if (action === "drawer-grip") {
        if (suppressDrawerGripClick) {
          suppressDrawerGripClick = false;
          return true;
        }
        await closeAndRestoreFocus();
        return true;
      }
      if (action === "close") {
        if (target.matches?.(".canvas-media-tools-backdrop") && event && target !== event.target) {
          return true;
        }
        await closeAndRestoreFocus();
        return true;
      }
      if (action === "open") {
        restoreFocusTarget = target?.focus ? target : activeElementForSurface(surface);
        if (MEDIA_TOOLS.some((tool) => tool.id === target.dataset.mediaTool)) {
          state.tool = target.dataset.mediaTool;
        }
        state.open = true;
        state.error = "";
        await rerender();
        focusFirstMediaDrawerControl(surface);
        if (state.tool === "annotation") await loadAnnotationLayers(workbench, state, rerender);
        void startRecoveryPolling();
        return true;
      }
      if (action === "select-tool") {
        state.tool = MEDIA_TOOLS.some((tool) => tool.id === target.dataset.mediaTool) ? target.dataset.mediaTool : "crop";
        state.error = "";
        await rerender();
        if (state.tool === "annotation") await loadAnnotationLayers(workbench, state, rerender);
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
      if (action === "annotation-undo") {
        if (state.layerKind === "vector_annotation") state.vectorStrokes.pop();
        const canvas = surface?.querySelector?.("[data-media-annotation-canvas]");
        restoreAnnotationCanvas(canvas, annotationHistory.pop());
        if (state.layerKind === "vector_annotation") redrawVectorStrokes(canvas, state.vectorStrokes);
        return true;
      }
      if (action === "annotation-clear") {
        const canvas = surface?.querySelector?.("[data-media-annotation-canvas]");
        const snapshot = captureAnnotationCanvas(canvas);
        if (snapshot) annotationHistory.push(snapshot);
        canvas?.getContext?.("2d")?.clearRect?.(0, 0, canvas.width, canvas.height);
        if (state.layerKind === "vector_annotation") state.vectorStrokes = [];
        return true;
      }
      if (action === "load-annotation-layer") {
        const layer = (state.annotationLayers ?? []).find((item) => item.id === target.dataset.layerId);
        await loadAnnotationLayer(surface, layer, state);
        return true;
      }
      if (action === "submit") {
        if (state.tool === "annotation") await submitAnnotation(workbench, state, rerender, surface);
        else if (state.tool === "batch_grid") await submitBatchGroup(workbench, state, rerender);
        else await submitDerivation(workbench, state, rerender);
        await persistCanvasMediaRecoveryState(workbench, state);
        if (state.status === "running") void startRecoveryPolling();
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
    dispose() {
      stopRecoveryPolling();
      state.open = false;
      state.annotationDrawing = false;
      cropDrag = null;
      drawerDrag = null;
      suppressDrawerGripClick = false;
      annotationHistory.length = 0;
      restoreFocusTarget = null;
      if (copyFeedbackTimer !== null) clearTimeout(copyFeedbackTimer);
      copyFeedbackTimer = null;
      surface?.querySelector?.(".canvas-media-tools-backdrop")?.remove?.();
    },
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
  const nodeId = String(workbench?.ui?.selectedCanvasNodeId ?? "");
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
  const canRefresh = Boolean(
    derivationId && typeof workbench.api?.getCanvasMediaDerivation === "function"
      || batchGroupId && typeof workbench.api?.getCanvasImageBatchGroup === "function",
  );
  const [derivationResult, batchResult] = await Promise.all([
    derivationId && typeof workbench.api?.getCanvasMediaDerivation === "function"
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
  }
  if (batchGroup && typeof batchGroup === "object") state.batchGroup = batchGroup;
  const statuses = [
    derivationId ? normalizeMediaRecoveryStatus(derivation?.status ?? "running") : null,
    state.batchGroup?.id ? recoveredBatchStatus(state.batchGroup) : null,
  ].filter(Boolean);
  if (statuses.includes("failed")) state.status = "failed";
  else if (statuses.includes("running")) state.status = "running";
  else if (statuses.includes("completed") || state.annotationLayerId) state.status = "completed";
  else state.status = "idle";
  return { active: state.status === "running" && canRefresh, status: state.status };
}

export async function persistCanvasMediaRecoveryState(workbench, state) {
  const canvasId = String(workbench?.ui?.selectedCanvasProjectId ?? "");
  const nodeId = String(workbench?.ui?.selectedCanvasNodeId ?? "");
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
  const node = workbench.ui?.canvasDocument?.nodes?.find?.((item) => item.id === workbench.ui.selectedCanvasNodeId);
  const source = sourceBinding(node);
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
    const requestSnapshot = buildRequestSnapshot(state);
    const startedPayload = await api.startCanvasMediaDerivation(canvasId, {
      nodeKey: node.id,
      derivationType: state.tool,
      baseCanvasRevision: Number(workbench.ui?.canvasServerRevision ?? 1) || 1,
      source,
      requestSnapshot,
    });
    const derivation = startedPayload?.derivation ?? startedPayload;
    const derivationId = String(derivation?.id ?? "");
    if (!derivationId) throw new Error("canvas_derivation_missing");
    const generationPayload = await api.createImageGenerationTask({
      target: { kind: "canvas", canvasProjectId: canvasId, nodeId: node.id },
      targetType: "canvas",
      targetId: node.id,
      model: node.data?.modelCode ?? workbench.ui?.canvasGenerationModelCode,
      prompt: state.instruction.trim() || MEDIA_TOOLS.find((tool) => tool.id === state.tool)?.label || "媒体编辑",
      parameters: {
        ...requestSnapshot,
        derivationId,
        referenceImages: node.data?.url ? [node.data.url] : [],
      },
    });
    const taskId = String(generationPayload?.taskId ?? generationPayload?.task?.id ?? "");
    if (!taskId) throw new Error("canvas_derivation_task_missing");
    await api.attachCanvasMediaDerivationTask(canvasId, derivationId, taskId);
    state.derivationId = derivationId;
    state.taskId = taskId;
    state.status = "running";
  } catch (error) {
    state.status = "failed";
    state.error = friendlyError(error);
  }
  rerender();
}

async function submitAnnotation(workbench, state, rerender, surface) {
  const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
  const node = workbench.ui?.canvasDocument?.nodes?.find?.((item) => item.id === workbench.ui.selectedCanvasNodeId);
  const canvas = surface?.querySelector?.("[data-media-annotation-canvas]");
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
      ? new Blob([JSON.stringify({ version: 1, width: canvas.width, height: canvas.height, strokes: state.vectorStrokes })], { type: "application/json" })
      : await canvasBlob(canvas);
    const file = typeof File === "function"
      ? new File([blob], `canvas-${state.layerKind}-${Date.now()}.${vector ? "json" : "png"}`, { type: blob.type })
      : blob;
    const uploadedPayload = await workbench.api.uploadFile(file, { category: "canvas-annotations", projectId: null });
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
    if (typeof workbench.api?.listCanvasAnnotationLayers === "function") {
      const layersPayload = await workbench.api.listCanvasAnnotationLayers(canvasId, { nodeKey: node.id, limit: 100 });
      state.annotationLayers = Array.isArray(layersPayload?.layers)
        ? layersPayload.layers
        : Array.isArray(layersPayload?.data?.layers) ? layersPayload.data.layers : [];
    }
    state.status = "completed";
  } catch (error) {
    state.status = "failed";
    state.error = friendlyError(error);
  }
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
  context.lineCap = "round";
  context.lineJoin = "round";
  context.globalCompositeOperation = state.annotationMode === "erase" ? "destination-out" : "source-over";
  context.strokeStyle = state.layerKind === "mask" ? "rgba(255,255,255,.95)" : "rgba(255,64,64,.9)";
  context.lineWidth = Math.max(2, Math.min(96, Number(state.brushSize) || 24));
  if (start) {
    context.beginPath();
    context.moveTo(x, y);
  } else {
    context.lineTo(x, y);
    context.stroke();
  }
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
      redrawVectorStrokes(canvas, state.vectorStrokes);
      state.layerKind = "vector_annotation";
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

function mediaArtifactsForCanvas(ui) {
  return (Array.isArray(ui.canvasAssets) ? ui.canvasAssets : [])
    .filter((asset) => asset.mediaKind === "image")
    .map((asset) => ({
      artifactId: String(asset.artifactId ?? asset.id ?? ""),
      url: asset.thumbnailUrl ?? asset.url ?? "",
      title: asset.title ?? asset.prompt ?? "图片结果",
      source: {
        artifactId: String(asset.artifactId ?? asset.id ?? "") || null,
        assetId: asset.assetId ?? null,
        assetVersionId: asset.assetVersionId ?? null,
        storageObjectId: asset.storageObjectId ?? null,
      },
    }))
    .filter((asset) => asset.artifactId);
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

function renderAnnotationLayerList(state) {
  if (state.annotationLayersLoading) return '<p class="canvas-media-empty">正在加载已有图层...</p>';
  const layers = Array.isArray(state.annotationLayers) ? state.annotationLayers : [];
  if (!layers.length) return '<p class="canvas-media-empty">当前节点没有已保存图层。</p>';
  return `<div class="canvas-media-layer-list" aria-label="已有标注图层">
    ${layers.map((layer) => `<article class="canvas-media-layer-item">
      ${layer.previewUrl ? `<img src="${escapeAttr(layer.previewUrl)}" alt="" />` : '<span class="canvas-media-layer-placeholder" aria-hidden="true"></span>'}
      <div><strong>${escapeHtml(annotationLayerLabel(layer.layerKind))}</strong><small>${escapeHtml(layer.status ?? "active")}</small></div>
      <button type="button" data-media-action="load-annotation-layer" data-layer-id="${escapeAttr(layer.id)}" ${layer.previewUrl ? "" : "disabled"}>加载</button>
    </article>`).join("")}
  </div>`;
}

function renderCropStage(state, node) {
  const imageUrl = String(node?.data?.url ?? node?.data?.previewUrl ?? "");
  const crop = cropRect(state);
  return `<div class="canvas-media-crop-stage" data-media-crop-stage style="background-image:url('${escapeAttr(imageUrl)}')">
    <div class="canvas-media-crop-shade" aria-hidden="true"></div>
    <div class="canvas-media-crop-selection" data-media-crop-handle="move" tabindex="0" role="group" aria-label="裁剪区域，方向键移动" style="left:${crop.x}%;top:${crop.y}%;width:${crop.width}%;height:${crop.height}%">
      ${["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((handle) => `<button type="button" class="canvas-media-crop-handle is-${handle}" data-media-crop-handle="${handle}" aria-label="调整裁剪区域 ${handle}"></button>`).join("")}
    </div>
  </div>`;
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

function redrawVectorStrokes(canvas, strokes) {
  const context = canvas?.getContext?.("2d");
  if (!context) return;
  context.clearRect?.(0, 0, canvas.width, canvas.height);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.globalCompositeOperation = "source-over";
  context.strokeStyle = "rgba(255,64,64,.9)";
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

function renderProfessionalControls(state, artifacts = []) {
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
    return renderCameraStudioControls(state);
  }
  if (state.tool === "slice") {
    return `<div class="canvas-media-parameter-grid">
      ${numberField("行数", "sliceRows", state.sliceRows, 1, 12)}
      ${numberField("列数", "sliceColumns", state.sliceColumns, 1, 12)}
      ${numberField("间距像素", "sliceGapPixels", state.sliceGapPixels, 0, 128)}
    </div>`;
  }
  if (state.tool === "composite") {
    const selected = artifacts.find((artifact) => artifact.artifactId === state.compositeSecondaryArtifactId);
    return `<div class="canvas-media-parameter-grid">
      <label class="canvas-media-parameter-span"><span>第二张图片</span><select data-media-field="compositeSecondaryArtifactId" required><option value="">请选择图片结果</option>${artifacts.map((artifact) => `<option value="${escapeAttr(artifact.artifactId)}" ${artifact.artifactId === state.compositeSecondaryArtifactId ? "selected" : ""}>${escapeHtml(artifact.title)}</option>`).join("")}</select></label>
      ${selected?.url ? `<figure class="canvas-media-composite-preview"><img src="${escapeAttr(selected.url)}" alt="${escapeAttr(selected.title)}" /><figcaption>${escapeHtml(selected.title)}</figcaption></figure>` : ""}
      ${selectField("混合模式", "compositeBlendMode", state.compositeBlendMode, [["normal", "正常"], ["multiply", "正片叠底"], ["screen", "滤色"], ["overlay", "叠加"]])}
      ${numberField("不透明度 %", "compositeOpacityPercent", state.compositeOpacityPercent, 0, 100)}
      ${selectField("对齐", "compositeAlignment", state.compositeAlignment, [["center", "居中"], ["top_left", "左上"], ["top_right", "右上"], ["bottom_left", "左下"], ["bottom_right", "右下"]])}
    </div>`;
  }
  return "";
}

function renderCameraStudioControls(state) {
  const mode = ["camera", "lighting", "dual"].includes(state.cameraStudioMode) ? state.cameraStudioMode : "camera";
  const activeControl = mode === "dual"
    ? (state.cameraStudioActiveControl === "lighting" ? "lighting" : "camera")
    : mode;
  const prompt = buildCameraStudioPrompt(state);
  return `<div class="canvas-camera-studio-controls">
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
      ${selectField("色温", "lightTemperature", state.lightTemperature, [["cool", "冷光"], ["neutral", "中性"], ["warm", "暖光"]])}
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

function syncCameraStudioLiveElements(surface, state, field) {
  const output = surface?.querySelector?.(`[data-media-output="${field}"]`);
  if (output) output.textContent = `${state[field]}${output.dataset?.suffix ?? ""}`;
  const prompt = surface?.querySelector?.("[data-camera-studio-prompt]");
  if (prompt) prompt.textContent = buildCameraStudioPrompt(state);
  const copyButton = surface?.querySelector?.('[data-media-action="camera-studio-copy"]');
  if (copyButton) copyButton.textContent = "复制提示词";
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
    ({ far: "wide establishing framing", full: "full-body framing", medium: "medium-shot framing", close: "close-up framing", "extreme-close": "extreme close-up framing" })[state.cameraDistance] ?? "medium-shot framing",
    ({ "15mm": "15mm ultra-wide lens", "24mm": "24mm wide-angle lens", "35mm": "35mm cinematic lens", "50mm": "50mm natural perspective lens", "85mm": "85mm portrait lens", "200mm": "200mm telephoto lens compression", fisheye: "fisheye lens distortion" })[state.cameraLens] ?? `${Number(state.cameraFocalLengthMm) || 50}mm lens`,
  ];
  if (Math.abs(Number(state.cameraRollDegrees)) >= 1) cameraTerms.push(`${Math.round(Number(state.cameraRollDegrees))} degree dutch angle`);
  if (state.cameraPromptEnhance === true) cameraTerms.push("cinematic composition, coherent subject identity, high detail");
  const lightTerms = [
    describeLightDirection(state.lightYawDegrees, state.lightPitchDegrees),
    `${Math.round(Number(state.lightIntensityPercent) || 0)}% intensity`,
    ({ cool: "cool daylight color temperature", neutral: "neutral studio color temperature", warm: "warm tungsten color temperature" })[state.lightTemperature] ?? "neutral studio color temperature",
  ];
  if (state.lightRimEnabled === true) lightTerms.push("subtle rim light");
  if (state.lightFillEnabled === true) lightTerms.push("soft fill light");
  if (mode === "camera") return cameraTerms.join(", ");
  if (mode === "lighting") return lightTerms.join(", ");
  return [...cameraTerms, ...lightTerms].join(", ");
}

function describeCameraYaw(value) {
  const yaw = normalizeAngle(value);
  if (yaw >= -22.5 && yaw < 22.5) return "front camera view";
  if (yaw >= 22.5 && yaw < 67.5) return "front-right three-quarter view";
  if (yaw >= 67.5 && yaw < 112.5) return "right profile camera view";
  if (yaw >= 112.5 && yaw < 157.5) return "rear-right three-quarter view";
  if (yaw >= 157.5 || yaw < -157.5) return "rear camera view";
  if (yaw >= -157.5 && yaw < -112.5) return "rear-left three-quarter view";
  if (yaw >= -112.5 && yaw < -67.5) return "left profile camera view";
  return "front-left three-quarter view";
}

function describeCameraPitch(value) {
  const pitch = Number(value) || 0;
  if (pitch >= 65) return "overhead top-down shot";
  if (pitch > 15) return "high-angle shot";
  if (pitch < -12) return "low-angle shot";
  return "eye-level shot";
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

function renderRecoverySummary(state) {
  const rows = [
    state.derivationId ? ["派生任务", state.derivationId] : null,
    state.taskId ? ["生成任务", state.taskId] : null,
    state.annotationLayerId ? ["标注图层", state.annotationLayerId] : null,
    state.batchGroup?.id ? ["宫格分组", state.batchGroup.id] : null,
  ].filter(Boolean);
  if (!rows.length) return "";
  return `<dl class="canvas-media-recovery" aria-label="已恢复的媒体任务">
    ${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
  </dl>`;
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
  if (state.status === "running") return "处理中";
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
  return escapeHtml(value);
}
