const FRAME_INTERVAL_MS = 125;

export const CANVAS_ANIMATION_ACTIONS = Object.freeze([
  Object.freeze({ id: "idle", label: "待机", description: "自然呼吸和轻微重心起伏的原地循环" }),
  Object.freeze({ id: "walk", label: "行走", description: "左右腿和对侧手臂交替摆动的原地行走循环" }),
  Object.freeze({ id: "run", label: "奔跑", description: "包含触地、蹬地和腾空阶段的原地奔跑循环" }),
  Object.freeze({ id: "jump", label: "跳跃", description: "从下蹲、腾空到落地恢复的一次完整跳跃" }),
  Object.freeze({ id: "attack", label: "攻击", description: "从蓄力、命中到收势的一次完整攻击" }),
  Object.freeze({ id: "hit", label: "受击", description: "从冲击、后仰到恢复的一次完整受击" }),
]);

export const CANVAS_ANIMATION_FRAME_GRIDS = Object.freeze({
  6: Object.freeze({ cols: 3, rows: 2 }),
  8: Object.freeze({ cols: 4, rows: 2 }),
  10: Object.freeze({ cols: 5, rows: 2 }),
  12: Object.freeze({ cols: 4, rows: 3 }),
  16: Object.freeze({ cols: 4, rows: 4 }),
  20: Object.freeze({ cols: 5, rows: 4 }),
});

export const CANVAS_ANIMATION_FRAME_COUNTS = Object.freeze(
  Object.keys(CANVAS_ANIMATION_FRAME_GRIDS).map(Number),
);

const ACTION_BY_ID = new Map(CANVAS_ANIMATION_ACTIONS.map((action) => [action.id, action]));
const SHEET_ASPECT_RATIOS = Object.freeze({
  6: "3:2",
  8: "2:1",
  10: "21:9",
  12: "4:3",
  16: "1:1",
  20: "5:4",
});

export function normalizeCanvasAnimationState(data = {}) {
  const requestedAction = String(data.animationAction ?? data.action ?? "");
  const action = ACTION_BY_ID.has(requestedAction)
    ? requestedAction
    : "idle";
  const requestedFrames = Number(data.animationFrames ?? data.frames);
  const frames = CANVAS_ANIMATION_FRAME_COUNTS.includes(requestedFrames) ? requestedFrames : 8;
  const previewMode = (data.animationPreviewMode ?? data.previewMode) === "sheet" ? "sheet" : "playing";
  return {
    action,
    actionLabel: ACTION_BY_ID.get(action).label,
    frames,
    grid: CANVAS_ANIMATION_FRAME_GRIDS[frames],
    previewMode,
  };
}

export function normalizeCanvasAnimationNode(node = {}) {
  if (node?.type !== "ai-animation") return node;
  const state = normalizeCanvasAnimationState(node.data);
  return {
    ...node,
    data: {
      ...(node.data ?? {}),
      mediaKind: "image",
      animationAction: state.action,
      animationFrames: state.frames,
      animationPreviewMode: state.previewMode,
      ports: {
        inputs: [{ id: "in_asset", kind: "any", accepts: ["text", "image"], label: "文本/图片" }],
        outputs: [{ id: "out_image", kind: "image", label: "Sprite Sheet" }],
      },
    },
  };
}

export function resolveCanvasAnimationSheetAspectRatio(frameCount) {
  const frames = normalizeCanvasAnimationState({ animationFrames: frameCount }).frames;
  return SHEET_ASPECT_RATIOS[frames];
}

export function buildCanvasAnimationSpritePrompt(characterPrompt, input = {}) {
  const state = normalizeCanvasAnimationState(input);
  const action = ACTION_BY_ID.get(state.action);
  const sheetAspectRatio = String(input.sheetAspectRatio ?? resolveCanvasAnimationSheetAspectRatio(state.frames));
  const sequenceRule = ["idle", "walk", "run"].includes(state.action)
    ? "The motion must loop cleanly: the final frame leads into the first without repeating the first frame."
    : "Show one chronological action from preparation through recovery without duplicate or reordered poses.";
  return [
    "Reference image is authoritative. Preserve its character identity, face, hair, body, outfit, weapons, colors and style; change only pose and motion.",
    "If text conflicts, follow the reference; use text only for the action and unseen details.",
    String(characterPrompt ?? "").trim(),
    `Create one ${action.label} character animation Sprite Sheet with exactly ${state.frames} frames.`,
    `Action: ${action.description}. ${sequenceRule}`,
    `Use a ${state.grid.cols} column by ${state.grid.rows} row grid in left-to-right, top-to-bottom playback order; the complete sheet aspect ratio is ${sheetAspectRatio}.`,
    "Keep the same single character, scale, camera, lighting, colors and body proportions in every equally sized cell.",
    "Frame the full body as large as possible in every cell, filling most of the cell with only small consistent margins.",
    "Keep feet and body anchors stable inside each cell. Do not add text, frame numbers, borders, separators, extra characters, mirrored duplicates or motion trails.",
  ].filter(Boolean).join("\n");
}

export function resolveCanvasAnimationFrameGeometry(data = {}) {
  const state = normalizeCanvasAnimationState(data);
  const generatedAspect = positiveNumber(data.imageWidth) && positiveNumber(data.imageHeight)
    ? Number(data.imageWidth) / Number(data.imageHeight)
    : null;
  const sheetAspect = generatedAspect
    ?? parseAspectRatio(data.sheetAspectRatio ?? data.imageAspectRatio ?? data.aspectRatio)
    ?? state.grid.cols / state.grid.rows;
  const cellAspect = sheetAspect * state.grid.rows / state.grid.cols;
  const cellWidth = cellAspect >= 1 ? 100 : cellAspect * 100;
  const cellHeight = cellAspect >= 1 ? 100 / cellAspect : 100;
  const offsetX = (100 - cellWidth) / 2;
  const offsetY = (100 - cellHeight) / 2;
  const positions = Array.from({ length: state.frames }, (_, frameIndex) => ({
    x: offsetX - (frameIndex % state.grid.cols) * cellWidth,
    y: offsetY - Math.floor(frameIndex / state.grid.cols) * cellHeight,
  }));
  return {
    ...state,
    sheetAspect,
    cellWidth,
    cellHeight,
    imageWidth: cellWidth * state.grid.cols,
    imageHeight: cellHeight * state.grid.rows,
    positions,
  };
}

export function renderCanvasAnimationNodeBody(node = {}) {
  const data = node?.data ?? {};
  const state = normalizeCanvasAnimationState(data);
  const mediaUrl = resolveCanvasAnimationMediaUrl(data);
  const status = String(data.status ?? "ready").trim().toLowerCase();
  const failed = ["failed", "canceled", "manual_review_required", "result_unknown"].includes(status);
  const taskId = String(data.lastTaskId ?? data.taskId ?? data.generationTaskId ?? "").trim();
  const generating = !failed && (
    ["queued", "running", "processing"].includes(status)
    || (!mediaUrl && Boolean(taskId))
  );
  const preview = generating
    ? `<div class="canvas-animation-empty is-loading canvas-image-generation-mask" role="status" aria-label="正在生成图片"><span class="canvas-animation-spinner" aria-hidden="true"></span><strong>正在生成图片</strong><small>${state.frames} 帧 · ${state.grid.cols}×${state.grid.rows}</small></div>`
    : mediaUrl
      ? state.previewMode === "sheet"
      ? `<img class="canvas-animation-sheet" src="${escapeAttr(mediaUrl)}" alt="${escapeAttr(`${state.actionLabel} Sprite Sheet`)}" draggable="false" />`
      : renderPlayingPreview(mediaUrl, data, state)
      : failed
        ? `<div class="canvas-animation-empty is-failed" role="alert"><strong>Sprite Sheet 生成失败</strong><small>${escapeHtml(data.failureMessage ?? "请检查生成任务后重试")}</small></div>`
        : `<div class="canvas-animation-empty"><span class="canvas-animation-empty-icon" aria-hidden="true">▶</span><strong>描述角色并生成动画</strong><small>${state.actionLabel} · ${state.frames} 帧 · ${state.grid.cols}×${state.grid.rows}</small></div>`;
  return `<div class="canvas-animation-node-body" data-canvas-animation-body data-animation-frames="${state.frames}" data-animation-action="${state.action}">
    <div class="canvas-animation-preview ${state.previewMode === "playing" ? "is-playing" : "is-sheet"}">
      ${preview}
      <div class="canvas-animation-preview-switch" role="group" aria-label="预览模式">
        <button type="button" class="${state.previewMode === "playing" ? "active" : ""}" data-action="set-canvas-animation-preview-mode" data-node-id="${escapeAttr(node?.id ?? "")}" data-preview-mode="playing" aria-label="播放逐帧动画" title="播放逐帧动画" aria-pressed="${state.previewMode === "playing"}">▶</button>
        <button type="button" class="${state.previewMode === "sheet" ? "active" : ""}" data-action="set-canvas-animation-preview-mode" data-node-id="${escapeAttr(node?.id ?? "")}" data-preview-mode="sheet" aria-label="查看 Sprite Sheet" title="查看 Sprite Sheet" aria-pressed="${state.previewMode === "sheet"}">▦</button>
      </div>
    </div>
    <div class="canvas-animation-param-bar"><strong>${escapeHtml(state.actionLabel)}</strong><span>${state.frames} 帧</span><small>${state.grid.cols}×${state.grid.rows} Sprite Sheet</small></div>
  </div>`;
}

export function renderCanvasAnimationControls(node = {}) {
  const state = normalizeCanvasAnimationState(node?.data ?? {});
  const nodeId = escapeAttr(node?.id ?? "");
  return `<div class="canvas-animation-controls" aria-label="动画生成参数">
    <div class="canvas-animation-action-picker" role="group" aria-label="动画动作">
      ${CANVAS_ANIMATION_ACTIONS.map((action) => `<button type="button" class="${state.action === action.id ? "active" : ""}" data-action="set-canvas-animation-action" data-node-id="${nodeId}" data-animation-action="${action.id}" aria-label="${escapeAttr(action.label)}" title="${escapeAttr(action.description)}" aria-pressed="${state.action === action.id}">${escapeHtml(action.label)}</button>`).join("")}
    </div>
    <label class="canvas-animation-frame-picker"><span>帧数</span><select data-canvas-animation-frames data-node-id="${nodeId}" aria-label="生成帧数">${CANVAS_ANIMATION_FRAME_COUNTS.map((count) => `<option value="${count}" ${state.frames === count ? "selected" : ""}>${count} 帧</option>`).join("")}</select></label>
  </div>`;
}

export function resolveCanvasAnimationArtifactPatch(task = null, mediaUrl = "") {
  const result = task?.result ?? {};
  const generated = [
    ...(Array.isArray(task?.generatedOutputItems) ? task.generatedOutputItems : []),
    ...(Array.isArray(result?.generatedOutputItems) ? result.generatedOutputItems : []),
    ...(Array.isArray(task?.resultAssets) ? task.resultAssets : []),
    ...(Array.isArray(task?.assets) ? task.assets : []),
  ];
  const primary = generated[0] ?? {};
  const url = String(mediaUrl ?? "").trim();
  const artifactId = firstText(result.artifactId, task?.artifact?.id, primary.artifactId);
  const assetVersionId = firstText(result.assetVersionId, primary.assetVersionId, primary.versionId);
  const storageObjectId = firstText(result.storageObjectId, primary.storageObjectId);
  const imageWidth = firstPositiveNumber(result.width, result.imageWidth, primary.width, primary.imageWidth, task?.artifact?.metadata?.width);
  const imageHeight = firstPositiveNumber(result.height, result.imageHeight, primary.height, primary.imageHeight, task?.artifact?.metadata?.height);
  return {
    ...(url ? { imageUrl: url, thumbnailUrl: url, output: url } : {}),
    ...(artifactId ? { artifactId } : {}),
    ...(assetVersionId ? { assetVersionId } : {}),
    ...(storageObjectId ? { storageObjectId } : {}),
    ...(imageWidth ? { imageWidth, width: imageWidth } : {}),
    ...(imageHeight ? { imageHeight, height: imageHeight } : {}),
  };
}

function renderPlayingPreview(mediaUrl, data, state) {
  const geometry = resolveCanvasAnimationFrameGeometry(data);
  const duration = state.frames * FRAME_INTERVAL_MS;
  const animationName = `canvas-animation-frames-${state.frames}`;
  const keyframes = geometry.positions.map((_, frameIndex) => {
    const x = -((frameIndex % state.grid.cols) / state.grid.cols) * 100;
    const y = -(Math.floor(frameIndex / state.grid.cols) / state.grid.rows) * 100;
    return `${formatNumber((frameIndex / state.frames) * 100)}% { transform: translate(${formatNumber(x)}%, ${formatNumber(y)}%); }`;
  }).join(" ");
  const offsetX = (100 - geometry.cellWidth) / 2;
  const offsetY = (100 - geometry.cellHeight) / 2;
  return `<div class="canvas-animation-frame" role="img" aria-label="${escapeAttr(`${state.actionLabel}逐帧动画，共 ${state.frames} 帧`)}">
    <style>@keyframes ${animationName} { ${keyframes} 100% { transform: translate(0%, 0%); } }</style>
    <img src="${escapeAttr(mediaUrl)}" alt="" draggable="false" style="left:${formatNumber(offsetX)}%;top:${formatNumber(offsetY)}%;width:${formatNumber(geometry.imageWidth)}%;height:${formatNumber(geometry.imageHeight)}%;animation-name:${animationName};animation-duration:${duration}ms" />
  </div>`;
}

function resolveCanvasAnimationMediaUrl(data = {}) {
  const value = firstText(
    data.imageUrl,
    data.previewUrl,
    data.resultUrl,
    data.url,
    data.assetUrl,
    data.thumbnailUrl,
    data.output,
  );
  if (!value) return "";
  if (/^(?:https?:|blob:|data:image\/)/i.test(value)) return value;
  if (/^(?:\/|\.\/|\.\.\/)/.test(value) && !value.startsWith("//")) return value;
  return "";
}

function parseAspectRatio(value) {
  if (typeof value !== "string") return null;
  const [width, height] = value.split(":").map(Number);
  return positiveNumber(width) && positiveNumber(height) ? width / height : null;
}

function positiveNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function firstPositiveNumber(...values) {
  const value = values.find(positiveNumber);
  return value === undefined ? null : Number(value);
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function formatNumber(value) {
  return String(Math.round(Number(value) * 1_000_000) / 1_000_000);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
  })[character]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/["']/g, (character) => (character === '"' ? "&quot;" : "&#39;"));
}
