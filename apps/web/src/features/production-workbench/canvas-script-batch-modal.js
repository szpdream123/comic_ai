import { CANVAS_IMAGE_GENERATION_SKILL_CATEGORIES, normalizeCanvasTextSkills } from "./canvas-text-skill-modal.js";
import { renderGenerationControlMenu } from "./generation-control-menu.js";
import { disabled, escapeAttr, escapeHtml } from "./markup.js";
import { resolveCanvasModelOptions } from "./canvas/canvas-state.js";

const WORKFLOW_KIND_LABELS = Object.freeze({
  character: "角色",
  scene: "场景",
  prop: "道具",
  storyboard: "分镜",
});

export function resolveCanvasScriptBatchItems(canvasDocument, scriptNodeId, batchKind = "image") {
  const nodes = Array.isArray(canvasDocument?.nodes) ? canvasDocument.nodes : [];
  const normalizedScriptNodeId = String(scriptNodeId ?? "").trim();
  const scriptNode = nodes.find((node) => String(node?.id ?? "") === normalizedScriptNodeId && node?.type === "script");
  if (!scriptNode) return [];
  const workflowKinds = batchKind === "video"
    ? new Set(["storyboard"])
    : new Set(["character", "scene", "prop"]);
  const order = new Map((Array.isArray(scriptNode.data?.workflowNodes) ? scriptNode.data.workflowNodes : [])
    .map((item, index) => [String(item?.id ?? ""), index]));
  return nodes
    .filter((node) => (
      String(node?.data?.workflowParentId ?? "") === normalizedScriptNodeId
      && workflowKinds.has(String(node?.data?.workflowKind ?? ""))
    ))
    .sort((left, right) => (
      (order.get(String(left?.id ?? "")) ?? Number.MAX_SAFE_INTEGER)
      - (order.get(String(right?.id ?? "")) ?? Number.MAX_SAFE_INTEGER)
    ))
    .map((node) => ({
      id: String(node.id ?? ""),
      title: String(node.data?.title ?? WORKFLOW_KIND_LABELS[node.data?.workflowKind] ?? "未命名节点").trim(),
      prompt: String(node.data?.prompt ?? node.data?.summary ?? "").trim(),
      kind: String(node.data?.workflowKind ?? ""),
      status: String(node.data?.status ?? "ready").trim().toLowerCase(),
      taskId: String(node.data?.taskId ?? node.data?.generationTaskId ?? "").trim(),
      previewUrl: resolveBatchItemPreviewUrl(node.data),
      modelCode: String(node.data?.modelCode ?? "").trim(),
      skillId: String(node.data?.promptSkillId ?? "").trim(),
      skillCategory: String(node.data?.promptSkillCategory ?? "").trim(),
      skillSource: String(node.data?.promptSkillSource ?? "").trim(),
      skillTitle: String(node.data?.promptSkillTitle ?? "").trim(),
      skillPriceCredits: Math.max(0, Math.round(Number(node.data?.promptSkillPriceCredits) || 0)),
    }));
}

export function resolveCanvasScriptBatchInitialState({
  canvasDocument,
  scriptNodeId,
  batchKind = "image",
  generationConfig = {},
} = {}) {
  const normalizedKind = batchKind === "video" ? "video" : "image";
  const items = resolveCanvasScriptBatchItems(canvasDocument, scriptNodeId, normalizedKind);
  const modelOptions = resolveCanvasModelOptions(generationConfig, normalizedKind);
  const availableModelCodes = new Set(modelOptions.map((item) => item.modelCode));
  const itemModelCode = items.find((item) => availableModelCodes.has(item.modelCode))?.modelCode ?? "";
  const configuredDefault = normalizedKind === "video"
    ? generationConfig?.defaultVideoModelCode
    : generationConfig?.defaultImageModelCode;
  const modelCode = itemModelCode
    || (availableModelCodes.has(String(configuredDefault ?? "")) ? String(configuredDefault) : "")
    || modelOptions[0]?.modelCode
    || "";
  const firstSkill = items.find((item) => item.skillId && item.skillCategory) ?? null;
  const selectedSkill = normalizedKind === "image"
    && !CANVAS_IMAGE_GENERATION_SKILL_CATEGORIES.includes(firstSkill?.skillCategory)
    ? null
    : firstSkill;
  const defaultCategory = normalizedKind === "image"
    ? (selectedSkill?.skillCategory || "image_style")
    : selectedSkill?.skillCategory || "all";
  return {
    open: true,
    scriptNodeId: String(scriptNodeId ?? ""),
    batchKind: normalizedKind,
    selectedNodeIds: items.map((item) => item.id),
    modelCode,
    skillId: selectedSkill?.skillId ?? "",
    skillCategory: defaultCategory,
    selectedSkillCategory: selectedSkill?.skillCategory ?? "",
    skillSource: selectedSkill?.skillSource === "private" ? "private" : "official",
    skillTitle: selectedSkill?.skillTitle ?? "",
    skillPriceCredits: selectedSkill?.skillPriceCredits ?? 0,
    skillPage: 1,
    openControlMenu: "",
    submitting: false,
  };
}

export function renderCanvasScriptBatchModal({
  modal = null,
  canvasDocument = null,
  generationConfig = {},
  officialSkills = [],
  privateSkills = [],
  officialPagination = {},
  privatePagination = {},
  skillsLoading = false,
} = {}) {
  if (modal?.open !== true) return "";
  const batchKind = modal.batchKind === "video" ? "video" : "image";
  const items = resolveCanvasScriptBatchItems(canvasDocument, modal.scriptNodeId, batchKind);
  const selectedIds = new Set((Array.isArray(modal.selectedNodeIds) ? modal.selectedNodeIds : []).map(String));
  const selectedCount = items.filter((item) => selectedIds.has(item.id)).length;
  const allSelected = items.length > 0 && selectedCount === items.length;
  const modelOptions = resolveCanvasModelOptions(generationConfig, batchKind);
  const selectedSkill = [
    ...normalizeCanvasTextSkills(officialSkills, "official"),
    ...normalizeCanvasTextSkills(privateSkills, "private"),
  ].find((item) => item.id === modal.skillId) ?? null;
  const title = batchKind === "video" ? "分镜批量生成视频" : "资产批量生成图片";
  const eyebrow = batchKind === "video" ? "STORYBOARD VIDEO QUEUE" : "ASSET IMAGE QUEUE";
  const actionLabel = batchKind === "video" ? "批量生成视频" : "批量生成图片";
  const openControlMenu = String(modal.openControlMenu ?? "");
  const selectedModel = modelOptions.find((model) => model.modelCode === modal.modelCode) ?? null;
  const modelLabel = selectedModel?.modelLabel || selectedModel?.modelCode || `暂无可用${batchKind === "video" ? "视频" : "图片"}模型`;
  const skillTitle = selectedSkill?.title || String(modal.skillTitle ?? "").trim();
  const skillPriceCredits = selectedSkill?.priceCredits ?? Math.max(0, Math.round(Number(modal.skillPriceCredits) || 0));
  const skillLabel = skillTitle
    ? `${skillTitle}${skillPriceCredits ? ` · ${skillPriceCredits} 积分` : ""}`
    : "选择技能";
  return `
    <section class="canvas-script-batch-layer" data-canvas-script-batch-modal="true">
      <button class="canvas-script-batch-scrim" type="button" data-action="close-canvas-script-batch-modal" aria-label="关闭批量生成"></button>
      <div class="canvas-script-batch-modal" role="dialog" aria-modal="true" aria-labelledby="canvas-script-batch-title">
        <header class="canvas-script-batch-header">
          <div>
            <span>${eyebrow}</span>
            <h2 id="canvas-script-batch-title">${title}</h2>
            <p>${batchKind === "video" ? "仅显示当前脚本分镜组内的视频节点" : "仅显示当前脚本资产组内的角色、场景与道具节点"}</p>
          </div>
          <button type="button" data-action="close-canvas-script-batch-modal" aria-label="关闭" title="关闭">×</button>
        </header>
        <div class="canvas-script-batch-summary">
          <button type="button" data-action="toggle-canvas-script-batch-all" aria-pressed="${allSelected}">
            <span class="canvas-script-batch-check ${allSelected ? "is-checked" : ""}" aria-hidden="true">${allSelected ? "✓" : ""}</span>
            ${allSelected ? "取消全选" : "选择全部"}
          </button>
          <span>已选 <strong>${selectedCount}</strong> / ${items.length}</span>
          <small>${batchKind === "video" ? "VIDEO" : "IMAGE"}</small>
        </div>
        <div class="canvas-script-batch-list" role="list" aria-label="${title}节点列表">
          ${items.length
            ? items.map((item, index) => renderBatchItem(item, index, selectedIds.has(item.id))).join("")
            : `<div class="canvas-script-batch-empty">当前脚本${batchKind === "video" ? "分镜组" : "资产组"}内还没有可生成节点</div>`}
        </div>
        <footer class="canvas-script-batch-footer">
          <div class="canvas-script-batch-controls">
            <fieldset class="canvas-script-batch-control ${openControlMenu === "model" ? "is-open" : ""}" ${disabled(!modelOptions.length || modal.submitting)}>
              <legend>生成模型</legend>
              ${renderGenerationControlMenu({
                field: "model",
                label: modelLabel,
                openMenu: openControlMenu,
                options: modelOptions.map((model) => [model.modelCode, model.modelLabel || model.modelCode]),
                action: "set-canvas-script-batch-model",
                toggleAction: "toggle-canvas-script-batch-control-menu",
                selectedValue: modal.modelCode,
              })}
            </fieldset>
            <fieldset class="canvas-script-batch-control" ${disabled(modal.submitting)}>
              <legend>生成技能 <small>非必填</small></legend>
              <button
                class="episode-replica-control"
                type="button"
                data-action="open-canvas-script-batch-skill-modal"
                aria-haspopup="dialog"
                aria-expanded="false"
                title="${escapeAttr(skillLabel)}"
              >${escapeHtml(skillLabel)}</button>
            </fieldset>
          </div>
          <div class="canvas-script-batch-submit-row">
            <p>${skillTitle ? `技能：${escapeHtml(skillTitle)}` : "未选择技能，仅使用节点最终提示词"}</p>
            <button class="canvas-script-batch-submit" type="button" data-action="submit-canvas-script-batch" ${disabled(!selectedCount || !modal.modelCode || modal.submitting)}>
              ${modal.submitting ? "正在提交..." : `${actionLabel}（${selectedCount}）`}
            </button>
          </div>
        </footer>
      </div>
    </section>
  `;
}

function renderBatchItem(item, index, selected) {
  const kindLabel = WORKFLOW_KIND_LABELS[item.kind] ?? "节点";
  const status = batchStatusLabel(item.status, item.taskId);
  return `
    <button class="canvas-script-batch-item ${selected ? "is-selected" : ""}" type="button" role="listitem" data-action="toggle-canvas-script-batch-item" data-node-id="${escapeAttr(item.id)}" aria-pressed="${selected}">
      <span class="canvas-script-batch-check ${selected ? "is-checked" : ""}" aria-hidden="true">${selected ? "✓" : ""}</span>
      <span class="canvas-script-batch-index">${String(index + 1).padStart(2, "0")}</span>
      <span class="canvas-script-batch-thumb ${item.previewUrl ? "has-preview" : ""}">${item.previewUrl
        ? `<img src="${escapeAttr(item.previewUrl)}" alt="" loading="lazy" />`
        : `<b>${escapeHtml(kindLabel.slice(0, 1))}</b>`}</span>
      <span class="canvas-script-batch-copy">
        <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(kindLabel)}</small></span>
        <em>${escapeHtml(item.prompt || "暂无最终提示词")}</em>
      </span>
      <span class="canvas-script-batch-status is-${escapeAttr(status.tone)}"><i></i>${escapeHtml(status.label)}</span>
    </button>
  `;
}

function resolveBatchItemPreviewUrl(data = {}) {
  return String(
    data.previewUrl
    ?? data.thumbnailUrl
    ?? data.imageUrl
    ?? data.videoPosterUrl
    ?? data.posterUrl
    ?? data.resultUrl
    ?? data.url
    ?? "",
  ).trim();
}

function batchStatusLabel(status, taskId = "") {
  if (taskId && ["running", "queued", "pending", "submitted", "processing"].includes(status)) return { label: "生成中", tone: "running" };
  if (["completed", "succeeded", "success"].includes(status)) return { label: "已完成", tone: "completed" };
  if (["failed", "canceled", "skipped"].includes(status)) return { label: "需重试", tone: "failed" };
  return { label: "待生成", tone: "ready" };
}
