const DEFAULT_PANORAMA_LIMITS = Object.freeze({
  yaw: Object.freeze({ min: -180, max: 180, initial: 180 }),
  pitch: Object.freeze({ min: -85, max: 85, initial: 0 }),
  fov: Object.freeze({ min: 35, max: 120, initial: 95 }),
});

const MAX_STORYBOARD_AXIS_CELLS = 12;

export const CANVAS_PANORAMA_VIEW_LIMITS = DEFAULT_PANORAMA_LIMITS;

export function normalizeCanvasPanoramaView(view = {}, limits = DEFAULT_PANORAMA_LIMITS) {
  const normalizedLimits = normalizePanoramaLimits(limits);
  return {
    yaw: roundViewValue(clampFinite(view?.yaw ?? view?.panoramaYaw, normalizedLimits.yaw.initial, normalizedLimits.yaw.min, normalizedLimits.yaw.max)),
    pitch: roundViewValue(clampFinite(view?.pitch ?? view?.panoramaPitch, normalizedLimits.pitch.initial, normalizedLimits.pitch.min, normalizedLimits.pitch.max)),
    fov: roundViewValue(clampFinite(view?.fov ?? view?.hfov ?? view?.panoramaFov, normalizedLimits.fov.initial, normalizedLimits.fov.min, normalizedLimits.fov.max)),
  };
}

export function applyCanvasPanoramaDrag(view = {}, drag = {}, options = {}) {
  const limits = options?.limits ?? DEFAULT_PANORAMA_LIMITS;
  const current = normalizeCanvasPanoramaView(view, limits);
  const sensitivity = clampFinite(options?.sensitivity, 0.18, 0, 4);
  const deltaX = finiteNumber(drag?.deltaX ?? drag?.movementX, 0);
  const deltaY = finiteNumber(drag?.deltaY ?? drag?.movementY, 0);
  return normalizeCanvasPanoramaView({
    yaw: current.yaw - deltaX * sensitivity,
    pitch: current.pitch + deltaY * sensitivity,
    fov: current.fov,
  }, limits);
}

export function applyCanvasPanoramaZoom(view = {}, wheelDelta = 0, options = {}) {
  const limits = options?.limits ?? DEFAULT_PANORAMA_LIMITS;
  const current = normalizeCanvasPanoramaView(view, limits);
  const delta = finiteNumber(
    typeof wheelDelta === "object" ? wheelDelta?.delta ?? wheelDelta?.deltaY : wheelDelta,
    0,
  );
  const sensitivity = clampFinite(options?.sensitivity, 0.05, 0, 2);
  return normalizeCanvasPanoramaView({ ...current, fov: current.fov + delta * sensitivity }, limits);
}

export function renderCanvasPanoramaNodeBody(node = {}, options = {}) {
  const data = nodeData(node);
  const nodeId = String(options?.nodeId ?? node?.id ?? data?.id ?? "");
  const imageUrl = safeImageUrl(firstValue(
    options?.imageUrl,
    data?.imageUrl,
    data?.url,
    data?.previewUrl,
    data?.thumbnailUrl,
    data?.src,
    data?.outputUrl,
    data?.resultUrl,
    data?.assetUrl,
  ));
  const label = String(options?.label ?? data?.title ?? data?.label ?? "360 全景图");
  const mode = normalizePanoramaMode(options?.mode ?? data?.previewMode ?? data?.panoramaMode);
  const view = normalizeCanvasPanoramaView(options?.view ?? data?.panoramaView ?? {
    yaw: data?.panoramaYaw ?? data?.panoYaw,
    pitch: data?.panoramaPitch ?? data?.panoPitch,
    fov: data?.panoramaFov ?? data?.panoFov,
  });
  const status = String(options?.status ?? data?.status ?? (imageUrl ? "ready" : "empty")).toLowerCase();
  const fullscreen = options?.fullscreen === true || data?.panoFullscreen === true || data?.panoramaFullscreen === true;
  const disabled = !imageUrl;
  const preview = renderPanoramaPreview({ data, imageUrl, label, mode, nodeId, status, view });

  return `<section class="canvas-panorama-node-body is-${mode}${fullscreen ? " is-fullscreen" : ""}" data-canvas-panorama-body data-node-id="${escapeAttr(nodeId)}" data-panorama-mode="${mode}" aria-label="${escapeAttr(label)}">
    <div class="canvas-panorama-mode-switch" role="group" aria-label="全景预览模式">
      <button type="button" data-action="set-canvas-panorama-mode" data-node-id="${escapeAttr(nodeId)}" data-panorama-mode="image" aria-pressed="${mode === "image"}">图片</button>
      <button type="button" data-action="set-canvas-panorama-mode" data-node-id="${escapeAttr(nodeId)}" data-panorama-mode="3d" aria-pressed="${mode === "3d"}">3D</button>
    </div>
    ${preview}
    <div class="canvas-panorama-actions" role="toolbar" aria-label="全景工具">
      <button type="button" data-action="pick-canvas-panorama-file" data-node-id="${escapeAttr(nodeId)}" aria-label="上传全景图" title="上传全景图"><span aria-hidden="true">+</span></button>
      <button type="button" data-action="capture-canvas-panorama-view" data-node-id="${escapeAttr(nodeId)}" data-panorama-yaw="${view.yaw}" data-panorama-pitch="${view.pitch}" data-panorama-fov="${view.fov}" aria-label="截取当前全景视角" title="截取当前全景视角"${disabledAttr(disabled)}><span aria-hidden="true">▣</span></button>
      <button type="button" data-action="toggle-canvas-panorama-fullscreen" data-node-id="${escapeAttr(nodeId)}" aria-label="${fullscreen ? "退出全屏" : "全屏查看"}" title="${fullscreen ? "退出全屏" : "全屏查看"}" aria-pressed="${fullscreen}"${disabledAttr(disabled)}><span aria-hidden="true">${fullscreen ? "↙" : "↗"}</span></button>
    </div>
    <input type="file" accept="image/*" data-canvas-upload-input data-canvas-panorama-input data-node-id="${escapeAttr(nodeId)}" tabindex="-1" aria-hidden="true" hidden />
  </section>`;
}

export function normalizeCanvasStoryboardGrid(input = {}, options = {}) {
  const data = nodeData(input);
  const requestedRows = boundedGridCount(options?.rows ?? data?.storyboardRows ?? data?.rows, 3);
  const requestedColumns = boundedGridCount(options?.columns ?? options?.cols ?? data?.storyboardCols ?? data?.columns ?? data?.cols, 3);
  const rowPositions = normalizeGridPositions(options?.rowPositions ?? data?.storyboardRowPositions);
  const columnPositions = normalizeGridPositions(options?.columnPositions ?? options?.colPositions ?? data?.storyboardColPositions);
  const requestedMode = String(options?.mode ?? data?.storyboardGridMode ?? data?.gridMode ?? "").toLowerCase();
  const mode = requestedMode === "custom" || requestedMode === "uniform"
    ? requestedMode
    : rowPositions.length || columnPositions.length ? "custom" : "uniform";
  const rowBoundaries = mode === "custom" && rowPositions.length
    ? [0, ...rowPositions, 100]
    : uniformBoundaries(requestedRows);
  const columnBoundaries = mode === "custom" && columnPositions.length
    ? [0, ...columnPositions, 100]
    : uniformBoundaries(requestedColumns);

  return {
    mode,
    rows: rowBoundaries.length - 1,
    columns: columnBoundaries.length - 1,
    rowBoundaries,
    columnBoundaries,
    rowPositions: rowBoundaries.slice(1, -1),
    columnPositions: columnBoundaries.slice(1, -1),
    cellCount: (rowBoundaries.length - 1) * (columnBoundaries.length - 1),
  };
}

export function resizeCanvasStoryboardGridPositions(values = [], cellCount = 1) {
  const count = boundedGridCount(cellCount, 1);
  const desiredPositionCount = count - 1;
  const positions = normalizeGridPositions(values);
  if (desiredPositionCount === 0) return [];
  if (!positions.length) return uniformBoundaries(count).slice(1, -1);

  while (positions.length > desiredPositionCount) positions.pop();
  while (positions.length < desiredPositionCount) {
    const boundaries = [0, ...positions, 100];
    let widestIndex = 0;
    for (let index = 1; index < boundaries.length - 1; index += 1) {
      if (boundaries[index + 1] - boundaries[index] > boundaries[widestIndex + 1] - boundaries[widestIndex]) {
        widestIndex = index;
      }
    }
    positions.push(roundPercent((boundaries[widestIndex] + boundaries[widestIndex + 1]) / 2));
    positions.sort((left, right) => left - right);
  }
  return positions;
}

export function updateCanvasStoryboardGridPosition(values = [], index = 0, value = 50) {
  const positions = normalizeGridPositions(values);
  const positionIndex = Math.floor(finiteNumber(index, -1));
  if (positionIndex < 0 || positionIndex >= positions.length) return positions;
  const { minimum, maximum } = storyboardPositionBounds(positions, positionIndex);
  positions[positionIndex] = roundPercent(clampFinite(value, positions[positionIndex], minimum, maximum));
  return positions;
}

export function normalizeCanvasStoryboardCells(input = {}, options = {}) {
  const data = nodeData(input);
  const grid = normalizeCanvasStoryboardGrid(data, options);
  const extracted = Array.isArray(options?.extracted ?? data?.storyboardExtracted)
    ? options?.extracted ?? data.storyboardExtracted
    : [];
  const overrides = Array.isArray(options?.overrides ?? data?.storyboardOverrides)
    ? options?.overrides ?? data.storyboardOverrides
    : [];
  const selectedIndex = integerOr(options?.selectedCellIndex ?? data?.storyboardSelectedCell ?? data?.selectedCellIndex, -1);
  const editing = options?.editing === true || data?.storyboardEditing === true || data?.editing === true;
  const sourceUrl = safeImageUrl(firstValue(options?.imageUrl, data?.imageUrl, data?.thumbnailUrl, data?.previewUrl, data?.url, data?.src, data?.resultUrl, data?.assetUrl));
  const cells = [];

  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const index = row * grid.columns + column;
      const left = grid.columnBoundaries[column];
      const right = grid.columnBoundaries[column + 1];
      const top = grid.rowBoundaries[row];
      const bottom = grid.rowBoundaries[row + 1];
      const override = normalizeStoryboardOverride(overrides[index]);
      const isExtracted = Boolean(extracted[index]);
      const empty = isExtracted && !override;
      cells.push({
        id: `storyboard-cell-${row + 1}-${column + 1}`,
        index,
        row,
        column,
        label: `分镜 ${row + 1}-${column + 1}`,
        selected: index === selectedIndex,
        extracted: isExtracted,
        empty,
        override,
        editable: editing,
        draggable: editing && !empty && Boolean(override?.url || sourceUrl),
        sourceRect: {
          x: roundPercent(left),
          y: roundPercent(top),
          width: roundPercent(right - left),
          height: roundPercent(bottom - top),
        },
      });
    }
  }
  return cells;
}

export function calculateCanvasStoryboardSourceRect(cell = {}, sourceSize = {}, sourceHeight) {
  const width = Math.floor(finiteNumber(
    typeof sourceSize === "object" ? sourceSize?.width ?? sourceSize?.naturalWidth : sourceSize,
    0,
  ));
  const height = Math.floor(finiteNumber(
    typeof sourceSize === "object" ? sourceSize?.height ?? sourceSize?.naturalHeight : sourceHeight,
    0,
  ));
  if (width <= 0 || height <= 0) return null;
  const percentRect = cell?.sourceRect ?? cell?.rect ?? cell;
  const left = clampFinite(percentRect?.x ?? percentRect?.left, 0, 0, 100);
  const top = clampFinite(percentRect?.y ?? percentRect?.top, 0, 0, 100);
  const right = clampFinite(left + finiteNumber(percentRect?.width, 0), left, left, 100);
  const bottom = clampFinite(top + finiteNumber(percentRect?.height, 0), top, top, 100);
  const x = Math.min(width - 1, Math.max(0, Math.round(width * left / 100)));
  const y = Math.min(height - 1, Math.max(0, Math.round(height * top / 100)));
  const pixelRight = Math.min(width, Math.max(x + 1, Math.round(width * right / 100)));
  const pixelBottom = Math.min(height, Math.max(y + 1, Math.round(height * bottom / 100)));
  return {
    x,
    y,
    width: pixelRight - x,
    height: pixelBottom - y,
    right: pixelRight,
    bottom: pixelBottom,
    index: integerOr(cell?.index, -1),
    row: integerOr(cell?.row, -1),
    column: integerOr(cell?.column, -1),
  };
}

export function renderCanvasStoryboardNodeBody(node = {}, options = {}) {
  const data = nodeData(node);
  const nodeId = String(options?.nodeId ?? node?.id ?? data?.id ?? "");
  const label = String(options?.label ?? data?.title ?? data?.label ?? "宫格分镜");
  const imageUrl = safeImageUrl(firstValue(options?.imageUrl, data?.imageUrl, data?.thumbnailUrl, data?.previewUrl, data?.url, data?.src, data?.resultUrl, data?.assetUrl));
  const grid = normalizeCanvasStoryboardGrid(data, options);
  const cells = normalizeCanvasStoryboardCells(data, { ...options, imageUrl });
  const editing = options?.editing === true || data?.storyboardEditing === true || data?.editing === true;
  const error = String(options?.error ?? data?.error ?? "").trim();

  return `<section class="canvas-storyboard-node-body is-${grid.mode}${editing ? " is-editing" : ""}" data-canvas-storyboard-body data-node-id="${escapeAttr(nodeId)}" data-storyboard-grid-mode="${grid.mode}" aria-label="${escapeAttr(label)}">
    <div class="canvas-storyboard-controls">
      <div class="canvas-storyboard-mode-switch" role="group" aria-label="分镜网格模式">
        <button type="button" data-action="set-canvas-storyboard-grid-mode" data-node-id="${escapeAttr(nodeId)}" data-storyboard-grid-mode="uniform" aria-pressed="${grid.mode === "uniform"}">均分</button>
        <button type="button" data-action="set-canvas-storyboard-grid-mode" data-node-id="${escapeAttr(nodeId)}" data-storyboard-grid-mode="custom" aria-pressed="${grid.mode === "custom"}">自定义</button>
      </div>
      <button type="button" data-action="toggle-canvas-storyboard-edit" data-node-id="${escapeAttr(nodeId)}" aria-pressed="${editing}" aria-label="${editing ? "退出分镜编辑" : "编辑分镜"}">${editing ? "完成" : "编辑"}</button>
    </div>
    ${editing ? renderStoryboardGridEditor({ grid, nodeId }) : ""}
    ${imageUrl ? renderStoryboardGrid({ cells, grid, imageUrl, nodeId }) : `<div class="canvas-storyboard-empty" role="status"><span>无图像</span><button type="button" data-action="pick-canvas-storyboard-image" data-node-id="${escapeAttr(nodeId)}">添加图片</button></div>`}
    <output class="canvas-storyboard-count" aria-label="分镜格数量">${grid.cellCount}</output>
    ${error ? `<p class="canvas-storyboard-error" role="alert">${escapeHtml(error)}</p>` : ""}
    <input type="file" accept="image/*" data-canvas-upload-input data-canvas-storyboard-input data-node-id="${escapeAttr(nodeId)}" tabindex="-1" aria-hidden="true" hidden />
  </section>`;
}

function renderStoryboardGridEditor({ grid, nodeId }) {
  const axisStepper = (axis, label, value) => `<div class="canvas-storyboard-axis-stepper" role="group" aria-label="${label}数量">
    <span>${label}</span>
    <button type="button" data-action="adjust-canvas-storyboard-grid-axis" data-node-id="${escapeAttr(nodeId)}" data-storyboard-axis="${axis}" data-storyboard-delta="-1" aria-label="减少${label}"${disabledAttr(value <= 1)}>−</button>
    <output aria-label="当前${label}数量">${value}</output>
    <button type="button" data-action="adjust-canvas-storyboard-grid-axis" data-node-id="${escapeAttr(nodeId)}" data-storyboard-axis="${axis}" data-storyboard-delta="1" aria-label="增加${label}"${disabledAttr(value >= MAX_STORYBOARD_AXIS_CELLS)}>+</button>
  </div>`;
  return `<div class="canvas-storyboard-grid-editor" aria-label="分镜网格设置">
    <div class="canvas-storyboard-axis-controls">
      ${axisStepper("rows", "行", grid.rows)}
      ${axisStepper("columns", "列", grid.columns)}
    </div>
    ${grid.mode === "custom" ? `<div class="canvas-storyboard-position-editors">
      ${renderStoryboardPositionEditor("rows", "横向分隔线", grid.rowPositions, nodeId)}
      ${renderStoryboardPositionEditor("columns", "竖向分隔线", grid.columnPositions, nodeId)}
    </div>` : ""}
  </div>`;
}

function renderStoryboardPositionEditor(axis, label, positions, nodeId) {
  return `<fieldset class="canvas-storyboard-position-editor"><legend>${label}</legend>
    ${positions.length ? positions.map((position, index) => {
      const { minimum, maximum } = storyboardPositionBounds(positions, index);
      return `<label><span>${index + 1}</span><input type="number" inputmode="decimal" min="${formatPercent(minimum)}" max="${formatPercent(maximum)}" step="0.1" value="${formatPercent(position)}" data-canvas-storyboard-position-input data-node-id="${escapeAttr(nodeId)}" data-storyboard-axis="${axis}" data-storyboard-position-index="${index}" aria-label="${label} ${index + 1} 位置百分比" /><small>%</small></label>`;
    }).join("") : `<span class="canvas-storyboard-position-empty">无分隔线</span>`}
  </fieldset>`;
}

function renderPanoramaPreview({ data, imageUrl, label, mode, nodeId, status, view }) {
  if (status === "loading" || status === "uploading" || status === "queued" || status === "running") {
    return `<div class="canvas-panorama-status" role="status" aria-live="polite">${status === "uploading" ? "上传中" : "全景图处理中"}</div>`;
  }
  const error = String(data?.error ?? "").trim();
  if (status === "error" || status === "failed" || error) {
    return `<div class="canvas-panorama-status is-error" role="alert"><span>${escapeHtml(error || "无法加载全景图")}</span><button type="button" data-action="retry-canvas-panorama" data-node-id="${escapeAttr(nodeId)}">重试</button></div>`;
  }
  if (!imageUrl) {
    return `<div class="canvas-panorama-empty" role="status"><span>暂无全景图</span><button type="button" data-action="pick-canvas-panorama-file" data-node-id="${escapeAttr(nodeId)}">上传全景图</button></div>`;
  }
  if (mode === "image") {
    return `<figure class="canvas-panorama-image-preview"><img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(`${label}图片预览`)}" draggable="false" loading="lazy" /></figure>`;
  }
  const objectPositionX = roundViewValue((180 - view.yaw) / 360 * 100);
  const objectPositionY = roundViewValue((85 - view.pitch) / 170 * 100);
  const zoomScale = roundViewValue(Math.max(1, 95 / view.fov));
  return `<div class="canvas-panorama-viewer" role="application" tabindex="0" data-panorama-drag-target data-panorama-three-root data-panorama-url="${escapeAttr(imageUrl)}" data-panorama-keyboard-controls="true" data-node-id="${escapeAttr(nodeId)}" data-panorama-yaw="${view.yaw}" data-panorama-pitch="${view.pitch}" data-panorama-fov="${view.fov}" aria-label="${escapeAttr(`${label} 3D 全景视图，支持拖动、方向键和缩放控制`)}" style="--canvas-panorama-yaw:${view.yaw};--canvas-panorama-pitch:${view.pitch};--canvas-panorama-fov:${view.fov};touch-action:none">
    <canvas class="canvas-panorama-three-canvas" data-panorama-three-canvas aria-hidden="true"></canvas>
    <img class="canvas-panorama-texture" src="${escapeAttr(imageUrl)}" alt="" aria-hidden="true" draggable="false" style="object-position:${objectPositionX}% ${objectPositionY}%;transform:scale(${zoomScale})" />
    <div class="canvas-panorama-zoom-controls" role="group" aria-label="全景缩放">
      <button type="button" data-action="zoom-canvas-panorama" data-node-id="${escapeAttr(nodeId)}" data-panorama-zoom="in" aria-label="放大全景" title="放大全景">+</button>
      <button type="button" data-action="reset-canvas-panorama-view" data-node-id="${escapeAttr(nodeId)}" aria-label="重置全景视角" title="重置全景视角">◎</button>
      <button type="button" data-action="zoom-canvas-panorama" data-node-id="${escapeAttr(nodeId)}" data-panorama-zoom="out" aria-label="缩小全景" title="缩小全景">−</button>
    </div>
  </div>`;
}

function renderStoryboardGrid({ cells, grid, imageUrl, nodeId }) {
  return `<div class="canvas-storyboard-grid" role="grid" aria-label="分镜格" aria-rowcount="${grid.rows}" aria-colcount="${grid.columns}" style="position:relative">
    ${cells.map((cell) => renderStoryboardCell(cell, imageUrl, nodeId)).join("")}
  </div>`;
}

function renderStoryboardCell(cell, sourceUrl, nodeId) {
  const rect = cell.sourceRect;
  const style = `left:${formatPercent(rect.x)}%;top:${formatPercent(rect.y)}%;width:${formatPercent(rect.width)}%;height:${formatPercent(rect.height)}%`;
  const classes = [
    "canvas-storyboard-cell",
    cell.selected ? "is-selected" : "",
    cell.empty ? "is-empty" : "",
    cell.override ? "has-override" : "",
    cell.draggable ? "is-draggable" : "",
  ].filter(Boolean).join(" ");
  const preview = renderStoryboardCellPreview(cell, sourceUrl);
  const actionLabel = cell.empty ? `选择${cell.label}并添加图片` : `选择${cell.label}`;
  return `<div class="${classes}" role="gridcell" aria-rowindex="${cell.row + 1}" aria-colindex="${cell.column + 1}" aria-selected="${cell.selected}" data-storyboard-cell-index="${cell.index}" data-storyboard-row="${cell.row}" data-storyboard-column="${cell.column}" data-storyboard-empty="${cell.empty}" style="${style}">
    <button class="canvas-storyboard-cell-select" type="button" data-action="select-canvas-storyboard-cell" data-node-id="${escapeAttr(nodeId)}" data-storyboard-cell-index="${cell.index}" aria-label="${escapeAttr(actionLabel)}">${preview}</button>
    ${cell.draggable ? `<button class="canvas-storyboard-cell-extract" type="button" draggable="true" data-action="extract-canvas-storyboard-cell" data-storyboard-drag-source data-node-id="${escapeAttr(nodeId)}" data-storyboard-cell-index="${cell.index}" aria-label="拖出${escapeAttr(cell.label)}为图片" title="拖出为图片" style="touch-action:none"><span aria-hidden="true">↗</span></button>` : ""}
  </div>`;
}

function renderStoryboardCellPreview(cell, sourceUrl) {
  if (cell.empty) return `<span class="canvas-storyboard-cell-empty" aria-hidden="true">+</span>`;
  if (cell.override?.url) {
    const overrideLabel = cell.override.label ? `${cell.label}：${cell.override.label}` : cell.label;
    return `<img class="canvas-storyboard-cell-fill" src="${escapeAttr(cell.override.url)}" alt="${escapeAttr(overrideLabel)}" draggable="false" loading="lazy" />`;
  }
  const rect = cell.sourceRect;
  const imageStyle = `width:${formatPercent(10000 / rect.width)}%;height:${formatPercent(10000 / rect.height)}%;left:${formatPercent(-rect.x / rect.width * 100)}%;top:${formatPercent(-rect.y / rect.height * 100)}%`;
  return `<img class="canvas-storyboard-cell-source" src="${escapeAttr(sourceUrl)}" alt="${escapeAttr(cell.label)}" draggable="false" loading="lazy" style="${imageStyle}" />`;
}

function normalizePanoramaMode(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["3d", "360", "panorama", "interactive"].includes(normalized) ? "3d" : "image";
}

function normalizePanoramaLimits(limits = {}) {
  return {
    yaw: normalizeLimit(limits?.yaw, DEFAULT_PANORAMA_LIMITS.yaw),
    pitch: normalizeLimit(limits?.pitch, DEFAULT_PANORAMA_LIMITS.pitch),
    fov: normalizeLimit(limits?.fov, DEFAULT_PANORAMA_LIMITS.fov),
  };
}

function normalizeLimit(value, fallback) {
  let min = finiteNumber(value?.min, fallback.min);
  let max = finiteNumber(value?.max, fallback.max);
  if (min > max) [min, max] = [max, min];
  return { min, max, initial: clampFinite(value?.initial, fallback.initial, min, max) };
}

function normalizeGridPositions(values) {
  if (!Array.isArray(values)) return [];
  const unique = new Set();
  for (const value of values) {
    const position = finiteNumber(value, Number.NaN);
    if (Number.isFinite(position) && position > 0 && position < 100) unique.add(roundPercent(position));
  }
  return [...unique].sort((left, right) => left - right).slice(0, MAX_STORYBOARD_AXIS_CELLS - 1);
}

function storyboardPositionBounds(positions, index) {
  const lowerBoundary = index === 0 ? 0 : positions[index - 1];
  const upperBoundary = index === positions.length - 1 ? 100 : positions[index + 1];
  const gap = Math.min(0.1, Math.max(0.000001, (upperBoundary - lowerBoundary) / 3));
  return {
    minimum: roundPercent(lowerBoundary + gap),
    maximum: roundPercent(upperBoundary - gap),
  };
}

function uniformBoundaries(count) {
  return Array.from({ length: count + 1 }, (_, index) => roundPercent(index / count * 100));
}

function normalizeStoryboardOverride(value) {
  if (!value) return null;
  const source = typeof value === "string" ? { url: value } : value;
  const url = safeImageUrl(firstValue(source?.url, source?.imageUrl, source?.thumbnailUrl, source?.src));
  if (!url) return null;
  return {
    url,
    label: String(source?.label ?? source?.title ?? source?.fileName ?? ""),
    filePath: String(source?.filePath ?? ""),
    assetId: String(source?.assetId ?? ""),
  };
}

function nodeData(value) {
  return value?.data && typeof value.data === "object" ? value.data : value ?? {};
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") ?? "";
}

function safeImageUrl(value) {
  const url = String(value ?? "").trim();
  if (!url || /[\u0000-\u001f\u007f]/.test(url)) return "";
  if (/^(?:https?:|blob:|asset:)/i.test(url)) return url;
  if (/^data:image\/(?:png|jpe?g|webp|gif|avif);/i.test(url)) return url;
  if (/^(?:\/|\.\/|\.\.\/)/.test(url) || /^[A-Za-z0-9_~-][^:]*$/.test(url)) return url;
  return "";
}

function boundedGridCount(value, fallback) {
  return Math.max(1, Math.min(MAX_STORYBOARD_AXIS_CELLS, Math.floor(finiteNumber(value, fallback))));
}

function integerOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampFinite(value, fallback, min, max) {
  return Math.min(max, Math.max(min, finiteNumber(value, fallback)));
}

function roundViewValue(value) {
  return Math.round(value * 10000) / 10000;
}

function roundPercent(value) {
  return Math.round(value * 1000000) / 1000000;
}

function formatPercent(value) {
  return String(roundPercent(value));
}

function disabledAttr(disabled) {
  return disabled ? ' disabled aria-disabled="true"' : "";
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

function escapeAttr(value) {
  return escapeHtml(value);
}
