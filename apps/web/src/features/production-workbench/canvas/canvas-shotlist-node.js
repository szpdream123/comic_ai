const SHOT_SIZE_OPTIONS = ["远景", "全景", "中景", "近景", "特写", "大特写"];
const SHOT_CAMERA_OPTIONS = ["固定", "推", "拉", "摇", "移", "跟", "升", "降", "手持", "环绕"];
const SHOT_TRANSITION_OPTIONS = ["切", "叠化", "淡入淡出"];
export const SHOTLIST_DEFAULT_COLUMNS = ["shotNo", "frame", "shotSize", "camera", "content", "dialogue", "duration"];
export const SHOTLIST_COLUMN_LABELS = {
  shotNo: "镜号", frame: "画面", shotSize: "景别", camera: "运镜", content: "内容",
  dialogue: "台词", audio: "音效/音乐", transition: "转场", duration: "时长", note: "备注",
};
const SHOTLIST_COLUMN_ORDER = ["shotNo", "frame", "shotSize", "camera", "content", "dialogue", "audio", "transition", "duration", "note"];

export function createCanvasShotRow(index = 1) {
  return {
    id: `shot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    shotNo: String(index), frame: null, shotSize: "", camera: "", content: "", dialogue: "",
    audio: "", transition: "", duration: 3, note: "",
  };
}

export function normalizeCanvasShotlistRows(value) {
  if (!Array.isArray(value)) return [];
  return value.map((row, index) => ({
    ...createCanvasShotRow(index + 1), ...row,
    id: String(row?.id ?? `shot-${index + 1}`), shotNo: String(row?.shotNo ?? index + 1),
    duration: Number(row?.duration) > 0 ? Number(row.duration) : 3,
    frame: row?.frame && typeof row.frame === "object" ? row.frame : null,
  }));
}

export function resolveCanvasShotlistColumns(value) {
  const enabled = new Set([
    ...SHOTLIST_DEFAULT_COLUMNS,
    ...(Array.isArray(value) ? value : []),
  ]);
  return SHOTLIST_COLUMN_ORDER.filter((key) => enabled.has(key));
}

export function computeCanvasShotlistDuration(rows) {
  return normalizeCanvasShotlistRows(rows).reduce((sum, row) => {
    const hasContent = row.frame || [row.shotSize, row.camera, row.content, row.dialogue, row.audio, row.note].some((v) => String(v ?? "").trim());
    return hasContent ? sum + (Number(row.duration) > 0 ? Number(row.duration) : 3) : sum;
  }, 0);
}

export function parseCanvasShotlistText(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return [];
  try {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
    const parsed = JSON.parse(fenced);
    const shots = Array.isArray(parsed) ? parsed : parsed?.shots;
    if (!Array.isArray(shots)) return [];
    return normalizeCanvasShotlistRows(shots);
  } catch {
    return [];
  }
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function renderFrame(frame, row, nodeId) {
  const url = String(frame?.url ?? frame?.previewUrl ?? frame?.thumbnailUrl ?? "").trim();
  if (!url) return `<button type="button" class="canvas-shotlist-frame is-empty" data-action="open-canvas-shotlist-picker" data-node-id="${esc(nodeId)}" data-row-id="${esc(row.id)}">选择画面</button>`;
  return `<div class="canvas-shotlist-frame"><img src="${esc(url)}" alt="" loading="lazy" /><button type="button" data-action="open-canvas-shotlist-picker" data-node-id="${esc(nodeId)}" data-row-id="${esc(row.id)}" aria-label="更换画面">↻</button><button type="button" data-action="unbind-canvas-shotlist-frame" data-node-id="${esc(nodeId)}" data-row-id="${esc(row.id)}" aria-label="解除画面">×</button></div>`;
}

function renderCell(row, column, nodeId) {
  const base = `data-node-id="${esc(nodeId)}" data-row-id="${esc(row.id)}" data-shotlist-field="${column}"`;
  if (column === "frame") return renderFrame(row.frame, row, nodeId);
  if (column === "shotNo") return `<input class="canvas-shotlist-input is-shot-no" ${base} value="${esc(row.shotNo)}" aria-label="镜号" />`;
  if (column === "duration") return `<input class="canvas-shotlist-input is-duration" type="number" min="0" step="0.5" ${base} value="${esc(row.duration)}" aria-label="时长" />`;
  const options = column === "shotSize" ? SHOT_SIZE_OPTIONS : column === "camera" ? SHOT_CAMERA_OPTIONS : column === "transition" ? SHOT_TRANSITION_OPTIONS : null;
  const value = row[column] ?? "";
  if (options) return `<input class="canvas-shotlist-input" list="${esc(nodeId)}-${column}-options" ${base} value="${esc(value)}" /><datalist id="${esc(nodeId)}-${column}-options">${options.map((item) => `<option value="${esc(item)}"></option>`).join("")}</datalist>`;
  return `<textarea class="canvas-shotlist-input is-text" rows="2" ${base}>${esc(value)}</textarea>`;
}

export function renderCanvasShotlistNodeBody(node = {}) {
  const nodeId = String(node?.id ?? "");
  const data = node?.data ?? {};
  const rows = normalizeCanvasShotlistRows(data.shotlistRows);
  const columns = resolveCanvasShotlistColumns(data.shotlistColumns);
  const total = computeCanvasShotlistDuration(rows);
  const title = String(data.title ?? "分镜表");
  const generating = ["running", "queued", "processing"].includes(String(data.status ?? "").toLowerCase());
  return `<section class="canvas-shotlist-node-body" data-canvas-shotlist-body data-node-id="${esc(nodeId)}" aria-label="${esc(title)}">
    <header class="canvas-shotlist-header"><strong>${esc(title)}</strong><span>共 ${rows.length} 镜 · ${total.toFixed(1)}″</span>${rows.some((row) => row.frame) ? `<button type="button" data-action="open-canvas-video-editor" data-node-id="${esc(nodeId)}" title="推送到视频剪辑器">推送剪辑</button>` : ""}<button type="button" data-action="run-canvas-node" data-node-id="${esc(nodeId)}" ${generating ? "disabled" : ""}>${generating ? "生成中" : "AI 生成"}</button><button type="button" data-action="add-canvas-shotlist-row" data-node-id="${esc(nodeId)}" aria-label="新增镜头">＋</button></header>
    <div class="canvas-shotlist-scroll"><table><thead><tr>${columns.map((column) => `<th>${esc(SHOTLIST_COLUMN_LABELS[column])}</th>`).join("")}<th aria-label="操作"></th></tr></thead><tbody>${rows.length ? rows.map((row) => `<tr data-shotlist-row-id="${esc(row.id)}">${columns.map((column) => `<td>${renderCell(row, column, nodeId)}</td>`).join("")}<td><button type="button" data-action="delete-canvas-shotlist-row" data-node-id="${esc(nodeId)}" data-row-id="${esc(row.id)}" aria-label="删除镜头">×</button></td></tr>`).join("") : `<tr><td colspan="${columns.length + 1}" class="is-empty">点击“＋”添加镜头，或使用 AI 生成</td></tr>`}</tbody></table></div>
  </section>`;
}
