// Canvas Note is intentionally a small, data-driven node for the X6 canvas.
// It keeps note content in the existing canvas node data so it participates in
// revision saves, clipboard snapshots, and the standard text-input event path.

const NOTE_KINDS = new Set(["text", "rectangle", "diamond", "ellipse", "arrow", "line", "freehand", "image"]);
const NOTE_LINE_TYPES = new Set(["straight", "curved"]);
const DEFAULT_NOTE_STYLE = Object.freeze({
  strokeColor: "#f3c969",
  backgroundColor: "rgba(243,201,105,.12)",
  strokeWidth: 2,
  strokeStyle: "solid",
  roundness: "round",
  fontSize: 18,
  textAlign: "left",
  opacity: 100,
});

const NOTE_STYLE_FIELDS = new Set([
  "strokeColor",
  "backgroundColor",
  "strokeWidth",
  "strokeStyle",
  "roundness",
  "fontSize",
  "textAlign",
  "opacity",
]);

const SAFE_COLOR_PATTERN = /^(?:#[0-9a-f]{3,8}|rgba?\(\s*[\d.%\s,+-]+\)|hsla?\(\s*[\d.%\s,+-]+\)|transparent)$/i;

function normalizeCanvasNoteColor(value, fallback) {
  const normalized = String(value ?? "").trim();
  return SAFE_COLOR_PATTERN.test(normalized) ? normalized : fallback;
}

export function normalizeCanvasNoteKind(value) {
  const kind = String(value ?? "text").trim().toLowerCase();
  return NOTE_KINDS.has(kind) ? kind : "text";
}

export function normalizeCanvasNoteLineType(value) {
  const lineType = String(value ?? "straight").trim().toLowerCase();
  return NOTE_LINE_TYPES.has(lineType) ? lineType : "straight";
}

export function normalizeCanvasNotePoints(value, width = 320, height = 220) {
  const maxWidth = Math.max(80, Number(width) || 320);
  const maxHeight = Math.max(64, Number(height) || 220);
  const points = Array.isArray(value) ? value : [];
  const normalized = points.slice(0, 128).map((point) => ({
    x: Math.max(0, Math.min(maxWidth, Number(point?.x))),
    y: Math.max(0, Math.min(maxHeight, Number(point?.y))),
  })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (normalized.length >= 2) return normalized;
  const inset = 4;
  return [{ x: inset, y: Math.max(inset, maxHeight / 2) }, { x: Math.max(inset, maxWidth - inset), y: Math.max(inset, maxHeight / 2) }];
}

export function scaleCanvasNotePoints(value, previousWidth, previousHeight, nextWidth, nextHeight) {
  const oldWidth = Math.max(1, Number(previousWidth) || 320);
  const oldHeight = Math.max(1, Number(previousHeight) || 220);
  const width = Math.max(80, Number(nextWidth) || oldWidth);
  const height = Math.max(64, Number(nextHeight) || oldHeight);
  const points = normalizeCanvasNotePoints(value, oldWidth, oldHeight);
  return points.map((point) => ({
    x: Math.max(0, Math.min(width, Number((point.x * width / oldWidth).toFixed(3)))),
    y: Math.max(0, Math.min(height, Number((point.y * height / oldHeight).toFixed(3)))),
  }));
}

export function resizeCanvasNoteDataPoints(canvasNode = {}, nextWidth, nextHeight) {
  if (String(canvasNode?.type ?? "") !== "canvas-note") return canvasNode;
  const data = canvasNode?.data && typeof canvasNode.data === "object" ? canvasNode.data : {};
  const nestedNote = data.note && typeof data.note === "object" ? data.note : null;
  const points = nestedNote?.points ?? data.points;
  if (!Array.isArray(points) || points.length < 2) return canvasNode;
  const previousWidth = Number(canvasNode?.size?.width) || 320;
  const previousHeight = Number(canvasNode?.size?.height) || 220;
  const nextPoints = scaleCanvasNotePoints(points, previousWidth, previousHeight, nextWidth, nextHeight);
  return {
    ...canvasNode,
    data: {
      ...data,
      ...(nestedNote
        ? { note: { ...nestedNote, points: nextPoints } }
        : { points: nextPoints }),
    },
  };
}

export function normalizeCanvasNoteStyle(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const strokeWidth = Number(source.strokeWidth);
  const fontSize = Number(source.fontSize);
  const strokeStyle = ["solid", "dashed", "dotted"].includes(String(source.strokeStyle))
    ? String(source.strokeStyle)
    : DEFAULT_NOTE_STYLE.strokeStyle;
  const roundness = ["round", "sharp"].includes(String(source.roundness))
    ? String(source.roundness)
    : DEFAULT_NOTE_STYLE.roundness;
  const textAlign = ["left", "center", "right"].includes(String(source.textAlign))
    ? String(source.textAlign)
    : DEFAULT_NOTE_STYLE.textAlign;
  return {
    ...DEFAULT_NOTE_STYLE,
    ...source,
    strokeColor: normalizeCanvasNoteColor(source.strokeColor, DEFAULT_NOTE_STYLE.strokeColor),
    backgroundColor: normalizeCanvasNoteColor(source.backgroundColor, DEFAULT_NOTE_STYLE.backgroundColor),
    strokeWidth: [1, 2, 4].includes(strokeWidth) ? strokeWidth : DEFAULT_NOTE_STYLE.strokeWidth,
    strokeStyle,
    roundness,
    textAlign,
    fontSize: Number.isFinite(fontSize) ? Math.max(12, Math.min(96, fontSize)) : DEFAULT_NOTE_STYLE.fontSize,
    opacity: Number.isFinite(Number(source.opacity))
      ? Math.max(0, Math.min(100, Number(source.opacity)))
      : DEFAULT_NOTE_STYLE.opacity,
  };
}

export function buildCanvasNoteStylePatch(currentStyle = {}, field, value) {
  const key = String(field ?? "");
  if (!NOTE_STYLE_FIELDS.has(key)) return null;
  const current = normalizeCanvasNoteStyle(currentStyle);
  let nextValue = value;
  if (["strokeWidth", "fontSize", "opacity"].includes(key)) {
    nextValue = Number(value);
  } else {
    nextValue = String(value ?? "").trim();
    if (key === "strokeColor" && !nextValue) nextValue = DEFAULT_NOTE_STYLE.strokeColor;
    if (key === "backgroundColor" && !nextValue) nextValue = DEFAULT_NOTE_STYLE.backgroundColor;
  }
  return normalizeCanvasNoteStyle({ ...current, [key]: nextValue });
}

export function renderCanvasNoteEditorFields(node = {}) {
  const data = node?.data ?? {};
  const style = normalizeCanvasNoteStyle(data.noteStyle ?? data.style);
  const option = (value, label, selected) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
  return `<div class="canvas-note-style-editor" data-canvas-note-style-editor>
    <header><strong>笔记样式</strong><small>自动保存</small></header>
    <div class="canvas-note-style-grid">
      <label><span>线条颜色</span><input type="color" value="${escapeHtml(toColorInputValue(style.strokeColor))}" data-canvas-note-style="strokeColor" aria-label="线条颜色" /></label>
      <label><span>填充颜色</span><input type="text" value="${escapeHtml(style.backgroundColor)}" data-canvas-note-style="backgroundColor" aria-label="填充颜色" /></label>
      <label><span>线条宽度</span><select data-canvas-note-style="strokeWidth" aria-label="线条宽度">${[1, 2, 4].map((value) => option(String(value), `${value}px`, String(style.strokeWidth))).join("")}</select></label>
      <label><span>线型</span><select data-canvas-note-style="strokeStyle" aria-label="线型">${option("solid", "实线", style.strokeStyle)}${option("dashed", "虚线", style.strokeStyle)}${option("dotted", "点线", style.strokeStyle)}</select></label>
      <label><span>圆角</span><select data-canvas-note-style="roundness" aria-label="圆角">${option("round", "圆角", style.roundness)}${option("sharp", "直角", style.roundness)}</select></label>
      <label><span>字号</span><input type="number" min="12" max="96" step="1" value="${escapeHtml(style.fontSize)}" data-canvas-note-style="fontSize" aria-label="字号" /></label>
      <label><span>对齐</span><select data-canvas-note-style="textAlign" aria-label="文本对齐">${option("left", "左对齐", style.textAlign)}${option("center", "居中", style.textAlign)}${option("right", "右对齐", style.textAlign)}</select></label>
      <label class="canvas-note-style-opacity"><span>透明度 <output data-canvas-note-opacity-output>${escapeHtml(style.opacity)}%</output></span><input type="range" min="0" max="100" step="1" value="${escapeHtml(style.opacity)}" data-canvas-note-style="opacity" aria-label="透明度" /></label>
    </div>
    <button type="button" class="canvas-note-style-reset" data-action="reset-canvas-note-style">恢复默认样式</button>
  </div>`;
}

function toColorInputValue(value) {
  const normalized = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : DEFAULT_NOTE_STYLE.strokeColor;
}

export function renderCanvasNoteNode(node = {}) {
  const nodeId = escapeHtml(node?.id ?? "");
  const data = node?.data ?? {};
  const note = data.note && typeof data.note === "object" ? data.note : data;
  const kind = normalizeCanvasNoteKind(note.noteKind ?? note.kind ?? data.noteKind ?? data.kind);
  const style = normalizeCanvasNoteStyle(note.noteStyle ?? note.style ?? data.noteStyle ?? data.style);
  const width = Math.max(80, Number(node?.size?.width ?? 320) || 320);
  const height = Math.max(64, Number(node?.size?.height ?? 220) || 220);
  const lineType = normalizeCanvasNoteLineType(note.lineType ?? note.style?.lineType ?? data.lineType);
  const title = String(data.title ?? "画布笔记").trim() || "画布笔记";
  const opacity = Math.max(0, Math.min(1, style.opacity / 100));
  const border = style.strokeStyle === "dashed" ? "dashed" : style.strokeStyle === "dotted" ? "dotted" : "solid";
  const text = escapeHtml(String(note.text ?? data.text ?? ""));
  const body = kind === "text"
    ? `<textarea class="canvas-note-text-input nodrag nopan nowheel" data-canvas-text-input data-node-id="${nodeId}" aria-label="画布笔记内容" placeholder="写下笔记..." spellcheck="false">${text}</textarea>`
    : kind === "image"
      ? renderCanvasNoteImage(note.imageUrl ?? data.imageUrl ?? data.url, title)
      : renderCanvasNoteShape(kind, width, height, style, node?.id, note.points ?? data.points, lineType);
  const kindLabel = ({
    text: "文本",
    rectangle: "矩形",
    diamond: "菱形",
    ellipse: "椭圆",
    arrow: "箭头",
    line: "直线",
    freehand: "手绘",
    image: "图片",
  })[kind];
  return `<article class="canvas-x6-special-node is-canvas-note canvas-note-kind-${kind}" data-node-id="${nodeId}" data-note-kind="${kind}" style="--canvas-note-stroke:${escapeHtml(style.strokeColor)};--canvas-note-fill:${escapeHtml(style.backgroundColor)};--canvas-note-opacity:${opacity};--canvas-note-border-style:${border};--canvas-note-font-size:${Math.max(12, Number(style.fontSize) || 18)}px;--canvas-note-text-align:${escapeHtml(style.textAlign)}">
    <header><strong>${escapeHtml(title)}</strong><small>${kindLabel}</small></header>
    <div class="canvas-note-body">${body}</div>
    <footer><span>画布笔记</span><span>${kindLabel}</span></footer>
  </article>`;
}

function renderCanvasNoteShape(kind, width, height, style, nodeId = "note", rawPoints, lineType = "straight") {
  const stroke = escapeHtml(style.strokeColor);
  const fill = escapeHtml(style.backgroundColor);
  const strokeWidth = Math.max(1, Number(style.strokeWidth) || 2);
  const dash = style.strokeStyle === "dashed" ? ' stroke-dasharray="10 7"' : style.strokeStyle === "dotted" ? ' stroke-dasharray="2 6"' : "";
  const inset = strokeWidth * 2;
  const radius = style.roundness === "sharp" ? 1 : Math.min(14, width / 8, height / 8);
  let shape = "";
  if (kind === "rectangle") {
    shape = `<rect x="${inset}" y="${inset}" width="${Math.max(1, width - inset * 2)}" height="${Math.max(1, height - inset * 2)}" rx="${radius}" />`;
  } else if (kind === "diamond") {
    shape = `<polygon points="${width / 2},${inset} ${width - inset},${height / 2} ${width / 2},${height - inset} ${inset},${height / 2}" />`;
  } else if (kind === "ellipse") {
    shape = `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${Math.max(1, width / 2 - inset)}" ry="${Math.max(1, height / 2 - inset)}" />`;
  } else {
    const hasCustomPoints = Array.isArray(rawPoints)
      && rawPoints.filter((point) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y))).length >= 2;
    const points = normalizeCanvasNotePoints(rawPoints, width, height);
    const startX = points[0].x;
    const startY = points[0].y;
    const endX = points.at(-1).x;
    const endY = points.at(-1).y;
    const markerId = `canvas-note-arrow-${String(nodeId ?? "note").replace(/[^a-zA-Z0-9_-]/g, "-")}-${strokeWidth}`;
    const marker = kind === "arrow" ? ` marker-end="url(#${markerId})"` : "";
    const midX = (startX + endX) / 2;
    const midY = kind === "freehand" ? Math.max(inset, height * 0.35) : startY;
    const pathData = hasCustomPoints
      ? buildCanvasNotePath(points, normalizeCanvasNoteLineType(lineType))
      : `M ${startX} ${startY} Q ${midX} ${midY} ${endX} ${endY}`;
    shape = `<path class="canvas-note-line-path" data-canvas-note-line-path d="${pathData}" fill="none"${marker} />${kind === "arrow" ? `<defs><marker id="${markerId}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" /></marker></defs>` : ""}`;
    const controls = renderCanvasNotePointControls(points, stroke, strokeWidth);
    return `<svg class="canvas-note-shape" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-label="${escapeHtml(kind)}" style="color:${stroke};opacity:${Math.max(0, Math.min(1, style.opacity / 100))}"><g fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dash}>${shape}</g>${controls}</svg>`;
  }
  return `<svg class="canvas-note-shape" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-label="${escapeHtml(kind)}" style="color:${stroke};opacity:${Math.max(0, Math.min(1, style.opacity / 100))}"><g fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dash}>${shape}</g></svg>`;
}

export function renderCanvasNotePointControls(points = [], stroke = "#f3c969", strokeWidth = 2) {
  if (!Array.isArray(points) || points.length < 2) return "";
  const radius = Math.max(4, Math.min(8, Number(strokeWidth) + 3));
  return `<g class="canvas-note-point-controls" data-canvas-note-point-controls aria-hidden="true">${points.map((point, index) => `<circle class="canvas-note-point-handle" data-canvas-note-point-index="${index}" cx="${Number(point.x)}" cy="${Number(point.y)}" r="${radius}" fill="#fff" fill-opacity=".92" stroke="${stroke}" stroke-width="${Math.max(1, Number(strokeWidth) || 2)}" />`).join("")}</g>`;
}

export function buildCanvasNotePath(points, lineType) {
  const [first, ...rest] = points;
  let path = `M ${first.x} ${first.y}`;
  if (lineType !== "curved") {
    return `${path}${rest.map((point) => ` L ${point.x} ${point.y}`).join("")}`;
  }
  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];
    const next = rest[index + 1];
    if (!next) {
      path += ` L ${current.x} ${current.y}`;
      continue;
    }
    const midpoint = { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 };
    path += ` Q ${current.x} ${current.y} ${midpoint.x} ${midpoint.y}`;
  }
  const last = rest[rest.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}

function renderCanvasNoteImage(url, title) {
  const source = String(url ?? "").trim();
  return source
    ? `<img class="canvas-note-image" src="${escapeHtml(source)}" alt="${escapeHtml(title)}" draggable="false" />`
    : `<div class="canvas-note-image-missing" role="status">图片不可用</div>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}
