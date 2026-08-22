import { resolveApiUrl } from "../../shared/creator-api.js";

const ANNOTATION_TOOLS = new Set(["select", "brush", "rectangle", "arrow", "grid", "marker", "text", "eraser"]);

export function openResultImageAnnotation(ui, payload = {}) {
  ui.resultImageAnnotation = {
    open: true,
    imageUrl: String(payload.imageUrl ?? "").trim(),
    imageName: String(payload.imageName ?? "当前图片").trim(),
    scope: ["asset", "composer"].includes(payload.scope) ? payload.scope : "storyboard",
    contextScope: payload.contextScope === "asset" ? "asset" : "storyboard",
    targetId: String(payload.targetId ?? "").trim(),
    taskId: String(payload.taskId ?? "").trim(),
    assetKind: String(payload.assetKind ?? "").trim(),
    tool: "brush",
    color: "#ef4444",
    brushSize: 24,
    gridRows: 4,
    gridColumns: 4,
    text: "标注",
    annotations: [],
    eraserStrokes: [],
    redo: [],
    submitting: false,
    error: "",
    editingAnnotationIndex: -1,
    imageUrls: Array.isArray(payload.imageUrls)
      ? payload.imageUrls.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [],
  };
  return ui.resultImageAnnotation;
}

export function closeResultImageAnnotation(ui) {
  ui.resultImageAnnotation = null;
}

export function selectResultAnnotationTool(workbench, tool) {
  const state = workbench?.ui?.resultImageAnnotation;
  if (!state || !ANNOTATION_TOOLS.has(tool)) return false;
  state.tool = tool;
  if (tool !== "text") state.editingAnnotationIndex = -1;
  syncToolbar(workbench.root, state);
  return true;
}

export function undoResultImageAnnotation(workbench) {
  const state = workbench?.ui?.resultImageAnnotation;
  if (!state?.annotations?.length) return false;
  state.redo = [...(state.redo ?? []), state.annotations.at(-1)];
  state.annotations = state.annotations.slice(0, -1);
  redrawResultAnnotation(workbench);
  return true;
}

export function redoResultImageAnnotation(workbench) {
  const state = workbench?.ui?.resultImageAnnotation;
  const annotation = state?.redo?.at(-1);
  if (!state || !annotation) return false;
  state.redo = state.redo.slice(0, -1);
  state.annotations = [...(state.annotations ?? []), annotation];
  redrawResultAnnotation(workbench);
  return true;
}

export function clearResultImageAnnotation(workbench) {
  const state = workbench?.ui?.resultImageAnnotation;
  if (!state) return false;
  state.redo = [...(state.redo ?? []), ...(state.annotations ?? []).slice().reverse()];
  state.annotations = [];
  state.eraserStrokes = [];
  redrawResultAnnotation(workbench);
  return true;
}

export function mountResultImageAnnotation(workbench) {
  const state = workbench?.ui?.resultImageAnnotation;
  const canvas = workbench?.root?.querySelector?.("[data-result-annotation-canvas]");
  if (!state?.open || !canvas || canvas.dataset.annotationBound === "true") return false;
  canvas.dataset.annotationBound = "true";
  const image = new Image();
  let objectUrl = "";
  let imageUrlIndex = 0;
  const cleanupObjectUrl = () => {
    if (!objectUrl) return;
    URL.revokeObjectURL?.(objectUrl);
    objectUrl = "";
  };
  image.onload = () => {
    if (!workbench.ui.resultImageAnnotation || canvas.isConnected === false) return;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    workbench.resultImageAnnotationSource = image;
    workbench.resultImageAnnotationObjectUrlCleanup = cleanupObjectUrl;
    workbench.root?.querySelector?.("[data-result-annotation-loading]")?.remove?.();
    redrawResultAnnotation(workbench);
  };
  image.onerror = () => {
    cleanupObjectUrl();
    imageUrlIndex += 1;
    if (imageUrlIndex < (state.imageUrls?.length ?? 0)) {
      void loadCurrentImage();
      return;
    }
    setStatus(workbench.root, "图片载入失败，请稍后重试。");
  };
  const loadCurrentImage = async () => {
    const sourceUrl = state.imageUrls?.[imageUrlIndex] || state.imageUrl;
    try {
      const source = await loadResultAnnotationImage(sourceUrl);
      objectUrl = source.objectUrl;
      image.crossOrigin = source.crossOrigin ?? "";
      image.src = source.url;
    } catch {
      imageUrlIndex += 1;
      if (imageUrlIndex < (state.imageUrls?.length ?? 0)) {
        void loadCurrentImage();
      } else {
        setStatus(workbench.root, "图片载入失败，请稍后重试。");
      }
    }
  };
  void loadCurrentImage();

  let gesture = null;
  canvas.addEventListener("pointerdown", (event) => {
    const point = annotationPoint(canvas, event);
    if (!point) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    const tool = state.tool;
    if (tool === "eraser") {
      gesture = { tool, points: [point], changed: false };
      redrawResultAnnotation(workbench, {
        type: "eraser",
        points: gesture.points,
        width: Number(state.brushSize) || 24,
      });
      return;
    }
    if (tool === "marker" || tool === "text") {
      if (tool === "text") {
        const existingIndex = findAnnotationIndex(state.annotations, point, (annotation) => annotation.type === "text");
        if (existingIndex >= 0) {
          const existing = state.annotations[existingIndex];
          state.editingAnnotationIndex = existingIndex;
          state.text = existing.text || "标注";
          const textInput = workbench.root?.querySelector?.('[data-result-annotation-field="text"]');
          if (textInput) textInput.value = state.text;
          return;
        }
        state.editingAnnotationIndex = -1;
      }
      state.redo = [];
      state.annotations = [...state.annotations, tool === "marker"
        ? createMarker(state, point)
        : createText(state, point)];
      redrawResultAnnotation(workbench);
      return;
    }
    if (tool === "select") {
      const index = findAnnotationIndex(state.annotations, point);
      if (index >= 0) gesture = { tool, index, last: point };
      return;
    }
    gesture = tool === "brush"
      ? { tool, points: [point] }
      : { tool, start: point, end: point };
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!gesture) return;
    const point = annotationPoint(canvas, event);
    if (!point) return;
    if (gesture.tool === "eraser") {
      gesture.points.push(point);
      gesture.changed = true;
      redrawResultAnnotation(workbench, {
        type: "eraser",
        points: gesture.points,
        width: Number(state.brushSize) || 24,
      });
      return;
    }
    if (gesture.tool === "brush") gesture.points.push(point);
    else if (gesture.tool === "select") {
      moveAnnotation(state.annotations[gesture.index], point.x - gesture.last.x, point.y - gesture.last.y);
      gesture.last = point;
    } else gesture.end = point;
    redrawResultAnnotation(workbench, gesture.tool === "select"
      ? null
      : {
          ...gesture,
          type: gesture.tool,
          color: state.color,
          width: Number(state.brushSize) || 24,
        });
  });
  const finish = (event) => {
    if (!gesture) return;
    canvas.releasePointerCapture?.(event.pointerId);
    if (gesture.tool === "eraser") {
      if (gesture.changed) {
        state.eraserStrokes = [...(state.eraserStrokes ?? []), {
          points: gesture.points,
          width: Number(state.brushSize) || 24,
        }];
        state.redo = [];
      }
      gesture = null;
      redrawResultAnnotation(workbench);
      return;
    }
    if (gesture.tool !== "select") {
      const annotation = gesture.tool === "brush"
        ? { type: "brush", points: gesture.points, color: state.color, width: Number(state.brushSize) || 24, eraserStrokeStart: state.eraserStrokes.length }
        : {
            type: gesture.tool,
            start: gesture.start,
            end: gesture.end,
            color: state.color,
            width: Number(state.brushSize) || 24,
            ...(gesture.tool === "grid" ? {
              rows: clampGridValue(state.gridRows, 1, 20),
              columns: clampGridValue(state.gridColumns, 1, 20),
            } : {}),
            eraserStrokeStart: state.eraserStrokes.length,
          };
      state.annotations = [...state.annotations, annotation];
    }
    state.redo = [];
    gesture = null;
    redrawResultAnnotation(workbench);
  };
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);
  for (const input of workbench.root?.querySelectorAll?.("[data-result-annotation-field]") ?? []) {
    input.addEventListener("input", () => {
      const field = input.dataset.resultAnnotationField;
      state[field] = ["brushSize", "gridRows", "gridColumns"].includes(field) ? Number(input.value) : input.value;
      if (field === "text" && Number.isInteger(state.editingAnnotationIndex) && state.editingAnnotationIndex >= 0) {
        const annotation = state.annotations?.[state.editingAnnotationIndex];
        if (annotation?.type === "text") {
          annotation.text = state.text || "标注";
          state.redo = [];
          redrawResultAnnotation(workbench);
        }
      }
    });
  }
  return true;
}

export async function loadResultAnnotationImage(value) {
  const url = String(value ?? "").trim();
  const resolvedUrl = await resolveAnnotationImageSourceUrl(url);
  if (/^(?:data:|blob:)/i.test(resolvedUrl)) {
    return { url: resolvedUrl, objectUrl: "" };
  }
  const parsed = new URL(resolvedUrl, globalThis.window?.location?.href ?? "http://localhost/");
  if (typeof globalThis.fetch !== "function") {
    throw new Error("result_annotation_image_fetch_unavailable");
  }
  const pageOrigin = globalThis.window?.location?.origin ?? "";
  const backendOrigin = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(pageOrigin) &&
    globalThis.window?.location?.port !== "4310"
    ? `${new URL(pageOrigin).protocol}//${new URL(pageOrigin).hostname}:4310`
    : new URL(resolveApiUrl("/api/"), globalThis.window?.location?.href ?? "http://localhost/").origin;
  const requestUrls = [];
  const pushRequestUrl = (candidate) => {
    const normalized = String(candidate ?? "").trim();
    if (normalized && !requestUrls.includes(normalized)) {
      requestUrls.push(normalized);
    }
  };
  if (/^\/api\/storage\/objects\//i.test(parsed.pathname)) {
    const sameOriginProxyUrl = new URL(`${parsed.pathname}?proxy=1`, globalThis.window?.location?.href ?? "http://localhost/");
    pushRequestUrl(sameOriginProxyUrl.href);
    const proxyUrl = new URL(resolveApiUrl(`${parsed.pathname}?proxy=1`), globalThis.window?.location?.href ?? "http://localhost/");
    pushRequestUrl(proxyUrl.href);
    if (
      /^(?:localhost|127\.0\.0\.1)$/i.test(proxyUrl.hostname) &&
      proxyUrl.port !== "4310"
    ) {
      const devBackendUrl = new URL(proxyUrl.href);
      devBackendUrl.hostname = proxyUrl.hostname;
      devBackendUrl.port = "4310";
      pushRequestUrl(devBackendUrl.href);
    }
  } else {
    pushRequestUrl(parsed.href);
  }
  let lastError = null;
  for (const requestUrl of requestUrls) {
    const requestOrigin = new URL(requestUrl).origin;
    const preferredCredentials = requestOrigin === pageOrigin || requestOrigin === backendOrigin ? "include" : "omit";
    const credentialModes = preferredCredentials === "include" ? ["include", "omit"] : ["omit"];
    for (const credentials of credentialModes) {
      try {
        let response = await globalThis.fetch(requestUrl, { credentials });
        // The storage proxy may return 304 when the thumbnail is already cached.
        // A 304 has no body for us to turn into an Image, so retry once without
        // cache validators before treating the load as failed.
        if (response.status === 304) {
          response = await globalThis.fetch(requestUrl, { credentials, cache: "no-store" });
        }
        if (!response.ok) {
          lastError = new Error(`result_annotation_image_fetch_failed:${response.status}`);
          continue;
        }
        const blob = await response.blob();
        if (!blob?.size) {
          lastError = new Error("result_annotation_image_empty");
          continue;
        }
        const objectUrl = URL.createObjectURL(blob);
        return { url: objectUrl, objectUrl };
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw lastError ?? new Error("result_annotation_image_fetch_failed");
}

async function resolveAnnotationImageSourceUrl(value) {
  const url = String(value ?? "").trim();
  if (!url || /^(?:data:|blob:)/i.test(url)) {
    return url;
  }
  const pageHref = globalThis.window?.location?.href ?? "http://localhost/";
  const parsed = new URL(url, pageHref);
  const pageOrigin = globalThis.window?.location?.origin ?? "";
  const backendOrigin = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(pageOrigin) &&
    globalThis.window?.location?.port !== "4310"
    ? `${new URL(pageOrigin).protocol}//${new URL(pageOrigin).hostname}:4310`
    : new URL(resolveApiUrl("/api/"), pageHref).origin;
  if (parsed.origin === pageOrigin || parsed.origin === backendOrigin || !/^[a-z][a-z\d+\-.]*:/i.test(url)) {
    return resolveApiUrl(url);
  }
  if (/^\/api\/storage\/objects\/[^/]+\/content\?proxy=1(?:[&#]|$)/i.test(url)) {
    return resolveApiUrl(url);
  }
  return resolveStorageAnnotationProxyUrl(url);
}

async function resolveStorageAnnotationProxyUrl(sourceUrl) {
  const resolveUrl = resolveApiUrl(`/api/storage/resolve?sourceUrl=${encodeURIComponent(String(sourceUrl ?? "").trim())}`);
  const response = await globalThis.fetch(resolveUrl, { credentials: "include" });
  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error("storage_annotation_proxy_resolve_failed");
    }
  }
  if (!response.ok) {
    throw new Error(String(payload?.error ?? payload?.message ?? `storage_annotation_proxy_resolve_failed:${response.status}`));
  }
  const proxyUrl = String(payload?.data?.proxyUrl ?? payload?.proxyUrl ?? "").trim();
  if (!proxyUrl) {
    throw new Error("storage_annotation_proxy_url_missing");
  }
  return resolveApiUrl(proxyUrl);
}

export function encodeResultImageAnnotation(workbench) {
  const canvas = workbench?.root?.querySelector?.("[data-result-annotation-canvas]");
  if (!canvas?.width || !canvas?.height || typeof canvas.toBlob !== "function") {
    return Promise.reject(new Error("result_annotation_canvas_unavailable"));
  }
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("result_annotation_encode_failed")), "image/png");
    } catch (error) {
      reject(error);
    }
  });
}

function redrawResultAnnotation(workbench, draft = null) {
  const canvas = workbench?.root?.querySelector?.("[data-result-annotation-canvas]");
  const image = workbench?.resultImageAnnotationSource;
  const state = workbench?.ui?.resultImageAnnotation;
  const context = canvas?.getContext?.("2d");
  if (!canvas || !image || !state || !context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const layer = canvas.ownerDocument?.createElement?.("canvas");
  const layerContext = layer?.getContext?.("2d");
  if (!layer || !layerContext) {
    for (const annotation of state.annotations ?? []) drawAnnotation(context, annotation);
    if (draft?.type !== "eraser") drawAnnotation(context, draft);
    return;
  }
  layer.width = canvas.width;
  layer.height = canvas.height;
  for (const annotation of state.annotations ?? []) {
    layerContext.clearRect(0, 0, layer.width, layer.height);
    drawAnnotation(layerContext, annotation);
    const eraserStrokeStart = Number.isInteger(annotation.eraserStrokeStart) ? annotation.eraserStrokeStart : 0;
    for (const stroke of (state.eraserStrokes ?? []).slice(eraserStrokeStart)) eraseAnnotationLayer(layerContext, stroke);
    if (draft?.type === "eraser") eraseAnnotationLayer(layerContext, draft);
    context.drawImage(layer, 0, 0);
  }
  if (draft && draft.type !== "eraser") {
    layerContext.clearRect(0, 0, layer.width, layer.height);
    drawAnnotation(layerContext, draft);
    context.drawImage(layer, 0, 0);
  }
}

function eraseAnnotationLayer(context, stroke) {
  const points = stroke?.points ?? [];
  if (!points.length) return;
  context.save();
  context.globalCompositeOperation = "destination-out";
  context.lineWidth = Math.max(2, Number(stroke.width) || 24);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) context.lineTo(point.x, point.y);
  if (points.length === 1) context.lineTo(points[0].x + 0.01, points[0].y + 0.01);
  context.stroke();
  context.restore();
}

function drawAnnotation(context, annotation) {
  if (!annotation) return;
  const width = Math.max(2, Number(annotation.width) || 24);
  context.save();
  context.strokeStyle = annotation.color || "#ef4444";
  context.fillStyle = annotation.color || "#ef4444";
  context.lineWidth = width;
  context.lineCap = "round";
  context.lineJoin = "round";
  if (annotation.type === "brush") {
    const points = annotation.points ?? [];
    if (points.length) {
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) context.lineTo(point.x, point.y);
      context.stroke();
    }
  } else if (annotation.type === "rectangle") {
    context.strokeRect(annotation.start.x, annotation.start.y, annotation.end.x - annotation.start.x, annotation.end.y - annotation.start.y);
  } else if (annotation.type === "arrow") {
    drawArrow(context, annotation.start, annotation.end, width);
  } else if (annotation.type === "grid") {
    drawGrid(context, annotation, width);
  } else if (annotation.type === "marker") {
    const radius = Math.max(16, width * 1.15);
    context.beginPath();
    context.arc(annotation.x, annotation.y, radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#ffffff";
    context.font = `700 ${Math.round(radius * 1.15)}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(annotation.number), annotation.x, annotation.y + 1);
  } else if (annotation.type === "text") {
    context.font = `700 ${Math.max(16, Number(annotation.fontSize) || width * 2)}px sans-serif`;
    context.textBaseline = "top";
    context.fillText(annotation.text || "标注", annotation.x, annotation.y);
  }
  context.restore();
}

function drawGrid(context, annotation, width) {
  const start = annotation?.start;
  const end = annotation?.end;
  if (!start || !end) return;
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const right = Math.max(start.x, end.x);
  const bottom = Math.max(start.y, end.y);
  const rows = clampGridValue(annotation.rows, 1, 20);
  const columns = clampGridValue(annotation.columns, 1, 20);
  context.strokeRect(left, top, right - left, bottom - top);
  for (let index = 1; index < columns; index += 1) {
    const x = left + (right - left) * index / columns;
    context.beginPath();
    context.moveTo(x, top);
    context.lineTo(x, bottom);
    context.stroke();
  }
  for (let index = 1; index < rows; index += 1) {
    const y = top + (bottom - top) * index / rows;
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.stroke();
  }
}

function clampGridValue(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Math.round(Number(value) || minimum)));
}

function drawArrow(context, start, end, width) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const head = Math.max(18, width * 2.6);
  const shaftEnd = {
    x: end.x - Math.cos(angle) * head * 0.72,
    y: end.y - Math.sin(angle) * head * 0.72,
  };
  const previousLineCap = context.lineCap;
  context.lineCap = "butt";
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(shaftEnd.x, shaftEnd.y);
  context.stroke();
  context.lineCap = previousLineCap;
  context.beginPath();
  context.moveTo(end.x, end.y);
  context.lineTo(end.x - head * Math.cos(angle - Math.PI / 7), end.y - head * Math.sin(angle - Math.PI / 7));
  context.lineTo(end.x - head * Math.cos(angle + Math.PI / 7), end.y - head * Math.sin(angle + Math.PI / 7));
  context.closePath();
  context.fill();
}

function annotationPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect?.();
  if (!rect?.width || !rect?.height) return null;
  return {
    x: (event.clientX - rect.left) * canvas.width / rect.width,
    y: (event.clientY - rect.top) * canvas.height / rect.height,
  };
}

function createMarker(state, point) {
  const number = (state.annotations ?? []).filter((item) => item.type === "marker").length + 1;
  return { type: "marker", x: point.x, y: point.y, number, color: state.color, width: Number(state.brushSize) || 24, eraserStrokeStart: state.eraserStrokes.length };
}

function createText(state, point) {
  return { type: "text", x: point.x, y: point.y, text: state.text || "标注", color: state.color, fontSize: Math.max(16, (Number(state.brushSize) || 24) * 2), eraserStrokeStart: state.eraserStrokes.length };
}

function findAnnotationIndex(annotations = [], point, predicate = null) {
  for (let index = annotations.length - 1; index >= 0; index -= 1) {
    if ((!predicate || predicate(annotations[index])) && annotationBoundsHit(annotations[index], point)) return index;
  }
  return -1;
}

export function isResultImageAnnotationHit(annotation, point) {
  const pad = Math.max(16, Number(annotation.width) || 24);
  if (annotation.type === "marker") {
    return Math.hypot(point.x - annotation.x, point.y - annotation.y) <= Math.max(16, pad * 1.25);
  }
  if (annotation.type === "text") {
    const fontSize = Math.max(16, Number(annotation.fontSize) || pad * 2);
    const textWidth = Math.max(fontSize, String(annotation.text || "标注").length * fontSize * 0.62);
    return point.x >= annotation.x - pad && point.x <= annotation.x + textWidth + pad &&
      point.y >= annotation.y - pad && point.y <= annotation.y + fontSize + pad;
  }
  if (annotation.type === "rectangle") {
    const start = annotation.start;
    const end = annotation.end;
    if (!start || !end) return false;
    return distanceToSegment(point, start, { x: end.x, y: start.y }) <= pad ||
      distanceToSegment(point, { x: end.x, y: start.y }, end) <= pad ||
      distanceToSegment(point, end, { x: start.x, y: end.y }) <= pad ||
      distanceToSegment(point, { x: start.x, y: end.y }, start) <= pad;
  }
  if (annotation.type === "grid") {
    const start = annotation.start;
    const end = annotation.end;
    if (!start || !end) return false;
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const right = Math.max(start.x, end.x);
    const bottom = Math.max(start.y, end.y);
    const rows = clampGridValue(annotation.rows, 1, 20);
    const columns = clampGridValue(annotation.columns, 1, 20);
    const segments = [
      [{ x: left, y: top }, { x: right, y: top }],
      [{ x: right, y: top }, { x: right, y: bottom }],
      [{ x: right, y: bottom }, { x: left, y: bottom }],
      [{ x: left, y: bottom }, { x: left, y: top }],
    ];
    for (let index = 1; index < columns; index += 1) {
      const x = left + (right - left) * index / columns;
      segments.push([{ x, y: top }, { x, y: bottom }]);
    }
    for (let index = 1; index < rows; index += 1) {
      const y = top + (bottom - top) * index / rows;
      segments.push([{ x: left, y }, { x: right, y }]);
    }
    return (
      point.x >= left - pad && point.x <= right + pad && point.y >= top - pad && point.y <= bottom + pad
    ) || segments.some(([segmentStart, segmentEnd]) => distanceToSegment(point, segmentStart, segmentEnd) <= pad);
  }
  const points = annotation.type === "brush"
    ? annotation.points ?? []
    : [annotation.start, annotation.end].filter(Boolean);
  if (!points.length) return false;
  if (annotation.type === "arrow" && annotation.start && annotation.end) {
    const angle = Math.atan2(annotation.end.y - annotation.start.y, annotation.end.x - annotation.start.x);
    const head = Math.max(18, pad * 2.6);
    const left = {
      x: annotation.end.x - head * Math.cos(angle - Math.PI / 7),
      y: annotation.end.y - head * Math.sin(angle - Math.PI / 7),
    };
    const right = {
      x: annotation.end.x - head * Math.cos(angle + Math.PI / 7),
      y: annotation.end.y - head * Math.sin(angle + Math.PI / 7),
    };
    if (distanceToSegment(point, annotation.end, left) <= pad || distanceToSegment(point, annotation.end, right) <= pad) return true;
  }
  if (points.length === 1) return Math.hypot(point.x - points[0].x, point.y - points[0].y) <= pad;
  for (let index = 1; index < points.length; index += 1) {
    if (distanceToSegment(point, points[index - 1], points[index]) <= pad) return true;
  }
  return false;
}

function annotationBoundsHit(annotation, point) {
  return isResultImageAnnotationHit(annotation, point);
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const projection = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + projection * dx), point.y - (start.y + projection * dy));
}

function moveAnnotation(annotation, dx, dy) {
  if (!annotation) return;
  if (annotation.type === "marker" || annotation.type === "text") {
    annotation.x += dx;
    annotation.y += dy;
  } else if (annotation.type === "brush") {
    for (const point of annotation.points ?? []) {
      point.x += dx;
      point.y += dy;
    }
  } else {
    annotation.start.x += dx;
    annotation.start.y += dy;
    annotation.end.x += dx;
    annotation.end.y += dy;
  }
}

function syncToolbar(root, state) {
  for (const button of root?.querySelectorAll?.("[data-action='select-result-annotation-tool']") ?? []) {
    const active = button.dataset.annotationTool === state.tool;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  for (const field of root?.querySelectorAll?.("[data-result-annotation-grid-setting]") ?? []) {
    field.hidden = state.tool !== "grid";
  }
}

function setStatus(root, message) {
  const status = root?.querySelector?.("[data-result-annotation-status]");
  if (status) status.textContent = message;
}
