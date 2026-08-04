import { resolveCanvasMediaNodeSource, resolveCanvasMediaUrl } from "./canvas-media-node.js";
import { canvasConnectedVideoNodeIds } from "./canvas-group-node.js";

function text(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function mediaUrl(node = {}) {
  const data = node.data ?? {};
  return text(data.previewUrl ?? data.url ?? data.imageUrl ?? data.resultUrl ?? data.assetUrl ?? data.thumbnailUrl);
}

function scriptWorkflowChildren(document = {}, scriptNodeId) {
  return (Array.isArray(document.nodes) ? document.nodes : [])
    .filter((node) => text(node?.data?.workflowParentId) === text(scriptNodeId));
}

function scriptWorkflowInputText(document = {}, scriptNodeId) {
  const nodes = Array.isArray(document.nodes) ? document.nodes : [];
  const nodeById = new Map(nodes.map((node) => [text(node?.id), node]));
  return (Array.isArray(document.edges) ? document.edges : [])
    .filter((edge) => text(edge?.targetNodeId) === text(scriptNodeId))
    .map((edge) => nodeById.get(text(edge?.sourceNodeId))?.data ?? {})
    .map((data) => text(data.outputText ?? data.resultText ?? data.text))
    .filter(Boolean)
    .join("\n\n");
}

function workspaceAssetCard(node = {}) {
  const data = node.data ?? {};
  const nodeId = text(node.id);
  const url = mediaUrl(node);
  const status = text(data.status) || "ready";
  const kindLabel = data.workflowKind === "character" ? "角色" : data.workflowKind === "scene" ? "场景" : "道具";
  const prompt = String(data.prompt ?? "");
  return `<article class="script-workspace-asset-card" data-script-workspace-child="${escapeAttr(nodeId)}">
    <header class="script-workspace-asset-card-header"><span class="script-workspace-asset-kind"><i aria-hidden="true"></i>${kindLabel}</span><button type="button" class="script-workspace-asset-delete" data-action="delete-canvas-node" data-node-id="${escapeAttr(nodeId)}" aria-label="删除${kindLabel}">×</button></header>
    <input class="script-workspace-child-title" data-canvas-script-child-input data-node-id="${escapeAttr(nodeId)}" data-script-child-field="title" value="${escapeAttr(data.title ?? `未命名${kindLabel}`)}" aria-label="${kindLabel}名称" />
    <div class="script-workspace-asset-body">
      <div class="script-workspace-asset-preview">${url
        ? `<img src="${escapeAttr(url)}" alt="${escapeAttr(data.title ?? `${kindLabel}参考图`)}" loading="lazy" />`
        : `<span><b aria-hidden="true">＋</b>待生成参考图</span>`}</div>
      <label class="script-workspace-asset-description"><span>${kindLabel}描述</span><textarea data-canvas-script-child-input data-node-id="${escapeAttr(nodeId)}" data-script-child-field="prompt" aria-label="${escapeAttr(data.title ?? kindLabel)}提示词" placeholder="输入${kindLabel}外观、环境与细节描述">${escapeHtml(prompt)}</textarea><small>${prompt.length} / 2500</small></label>
    </div>
    <footer><small class="script-workspace-asset-status" data-status="${escapeAttr(status)}"><i aria-hidden="true"></i>${escapeHtml(status === "succeeded" ? "已生成" : status === "running" ? "生成中" : "待生成")}</small><button type="button" data-action="run-canvas-node" data-node-id="${escapeAttr(nodeId)}">${status === "succeeded" ? "重新生成" : "生成参考图"}</button></footer>
  </article>`;
}

function workspaceBatchButton(scriptNodeId, kind, count, label) {
  return `<button type="button" data-action="open-canvas-script-batch-modal" data-node-id="${escapeAttr(scriptNodeId)}" data-batch-kind="${kind}" ${count ? "" : "disabled"}>${label}</button>`;
}

function workspaceShotRow(node = {}, index, selected = false) {
  const data = node.data ?? {};
  const nodeId = text(node.id);
  const referenceCount = Array.isArray(data.scriptWorkflowReferenceNodeIds) ? data.scriptWorkflowReferenceNodeIds.length : 0;
  const videoUrl = resolveCanvasMediaNodeSource(node, "video");
  const posterUrl = resolveCanvasMediaUrl(data.thumbnailUrl ?? data.videoPosterUrl ?? data.posterUrl, "image");
  const videoPreview = videoUrl
    ? `<button class="script-workspace-shot-video-preview" type="button" data-action="toggle-canvas-video-fullscreen" data-node-id="${escapeAttr(nodeId)}" aria-label="查看镜头 ${index + 1} 视频"><video src="${escapeAttr(videoUrl)}"${posterUrl ? ` poster="${escapeAttr(posterUrl)}"` : ""} muted playsinline preload="metadata" tabindex="-1"></video><span aria-hidden="true">▶</span></button>`
    : `<div class="script-workspace-shot-video-placeholder" data-script-shot-video-placeholder="true" role="img" aria-label="镜头 ${index + 1} 尚未生成视频"><span aria-hidden="true">--</span><small>未生成</small></div>`;
  return `<tr data-script-workspace-child="${escapeAttr(nodeId)}">
    <td class="script-workspace-shot-select"><input type="checkbox" data-canvas-script-shot-selection data-node-id="${escapeAttr(nodeId)}" ${selected ? "checked" : ""} aria-label="选择镜头 ${index + 1}" /></td>
    <td>${index + 1}</td>
    <td class="script-workspace-shot-video-cell">${videoPreview}</td>
    <td><textarea data-canvas-script-child-input data-node-id="${escapeAttr(nodeId)}" data-script-child-field="prompt" aria-label="镜头 ${index + 1} 最终提示词" placeholder="输入最终提示词，并使用 @ 引用资产">${escapeHtml(data.prompt ?? "")}</textarea></td>
    <td><button type="button" data-action="open-canvas-script-workspace-reference-picker" data-node-id="${escapeAttr(nodeId)}">@ 引用 ${referenceCount}</button></td>
    <td><button type="button" data-action="delete-canvas-node" data-node-id="${escapeAttr(nodeId)}" aria-label="删除镜头">删除</button></td>
  </tr>`;
}

function workspaceReferences(children = [], shotNodeId) {
  const shot = children.find((node) => text(node.id) === text(shotNodeId));
  const referenced = new Set(Array.isArray(shot?.data?.scriptWorkflowReferenceNodeIds)
    ? shot.data.scriptWorkflowReferenceNodeIds.map(text)
    : []);
  return children.filter((node) => ["character", "scene", "prop"].includes(text(node?.data?.workflowKind)))
    .map((node) => `<label class="script-workspace-reference-option"><input type="checkbox" data-canvas-script-workspace-reference data-script-shot-node-id="${escapeAttr(shotNodeId)}" data-reference-node-id="${escapeAttr(node.id)}" ${referenced.has(text(node.id)) ? "checked" : ""} /><span>${escapeHtml(node.data?.title ?? "未命名资产")}</span><small>${escapeHtml(node.data?.workflowKind === "character" ? "角色" : node.data?.workflowKind === "scene" ? "场景" : "道具")}</small></label>`).join("");
}

const LIVE_PROMPT_STAGES = [
  { id: "shot", label: "分镜", index: "01" },
  { id: "character", label: "角色", index: "02" },
  { id: "scene", label: "场景", index: "03" },
  { id: "prop", label: "道具", index: "04" },
];

function livePromptStatusLabel(status) {
  return ({ pending: "等待中", running: "生成中", completed: "已完成", failed: "失败" })[text(status)] ?? "等待中";
}

function renderLivePromptStage(stage, livePreview = {}, scriptNodeId = "") {
  const value = livePreview.stages?.[stage.id] ?? {};
  const status = text(value.status) || "pending";
  const responseText = text(value.responseText);
  return `<article class="script-workspace-live-card" data-live-prompt-stage="${escapeAttr(stage.id)}" data-live-prompt-status="${escapeAttr(status)}">
    <header><span><i>${stage.index}</i><strong>${stage.label}实时结果</strong></span><div class="script-workspace-live-card-actions"><button type="button" data-action="open-canvas-script-stage-regenerate" data-node-id="${escapeAttr(scriptNodeId)}" data-script-stage="${escapeAttr(stage.id)}" ${status === "running" ? "disabled" : ""}>${status === "running" ? "生成中" : status === "completed" ? "重新生成" : "单独生成"}</button><small><b aria-hidden="true"></b><span data-script-live-status-label>${livePromptStatusLabel(status)}</span></small></div></header>
    <div class="script-workspace-live-columns">
      <section><h4>模型实时返回</h4><pre data-script-live-response aria-live="polite">${responseText ? escapeHtml(responseText) : status === "running" ? "正在等待模型返回内容…" : "暂无返回内容"}</pre></section>
    </div>
  </article>`;
}

function workspaceSkillSelect(ui, scriptNode, category, label) {
  const skills = [
    ...(Array.isArray(ui.canvasTextOfficialSkills) ? ui.canvasTextOfficialSkills : []),
    ...(Array.isArray(ui.canvasTextPrivateSkills) ? ui.canvasTextPrivateSkills : []),
  ].filter((skill) => text(skill?.category ?? skill?.promptCategory) === category);
  const selectedId = text(scriptNode.data?.workflowSkillIds?.[category]);
  const effectiveId = skills.some((skill) => text(skill?.id) === selectedId) ? selectedId : text(skills[0]?.id);
  return `<label><span>${escapeHtml(label)}</span><select data-canvas-script-workflow-skill data-node-id="${escapeAttr(scriptNode.id)}" data-script-skill-category="${escapeAttr(category)}" aria-label="${escapeAttr(label)}技能" ${skills.length ? "" : "disabled"}>${skills.length
    ? skills.map((skill) => `<option value="${escapeAttr(skill.id)}" ${text(skill.id) === effectiveId ? "selected" : ""}>${escapeHtml(skill.title ?? skill.name ?? "未命名技能")}</option>`).join("")
    : `<option value="">暂无可用技能</option>`}</select></label>`;
}

function renderCanvasScriptWorkspaceBase(ui = {}) {
  const workspace = ui.canvasScriptWorkspace;
  if (!workspace?.open || !workspace.scriptNodeId) return "";
  const document = ui.canvasDocument ?? {};
  const scriptNode = (Array.isArray(document.nodes) ? document.nodes : []).find((node) => text(node.id) === text(workspace.scriptNodeId) && node.type === "script");
  if (!scriptNode) return "";
  const children = scriptWorkflowChildren(document, scriptNode.id);
  const activeStep = ["live", "assets", "shots"].includes(text(workspace.activeStep)) ? workspace.activeStep : "live";
  const livePreview = ui.canvasScriptLivePreviewByNodeId?.[scriptNode.id] ?? scriptNode.data?.workflowLivePreview ?? {};
  const assetsByKind = {
    character: children.filter((node) => text(node?.data?.workflowKind) === "character"),
    scene: children.filter((node) => text(node?.data?.workflowKind) === "scene"),
    prop: children.filter((node) => text(node?.data?.workflowKind) === "prop"),
  };
  const shots = children.filter((node) => text(node?.data?.workflowKind) === "storyboard");
  const connectedVideoNodeIds = canvasConnectedVideoNodeIds(document, scriptNode.id);
  const shotNodeIds = new Set(shots.map((node) => text(node.id)));
  const selectedShotNodeIds = new Set((Array.isArray(workspace.selectedShotNodeIds) ? workspace.selectedShotNodeIds : [])
    .map(text)
    .filter((nodeId) => shotNodeIds.has(nodeId)));
  const selectedShotId = text(workspace.referencePickerShotId);
  const generatedScriptNode = children.filter((node) => text(node?.data?.workflowKind) === "script").at(-1);
  const generatedScriptText = text(generatedScriptNode?.data?.text ?? generatedScriptNode?.data?.outputText ?? generatedScriptNode?.data?.resultText);
  const inputText = scriptWorkflowInputText(document, scriptNode.id);
  const scriptReady = Boolean(inputText || generatedScriptText || text(scriptNode.data?.text));
  const parsing = text(ui.canvasScriptParsingNodeId) === text(scriptNode.id);
  const readyAssets = Object.values(assetsByKind).flat().filter((node) => Boolean(mediaUrl(node))).length;
  const completedPromptCount = LIVE_PROMPT_STAGES.filter((stage) => text(livePreview.stages?.[stage.id]?.status) === "completed").length;
  return `<section class="script-workspace-layer" data-script-workspace-layer aria-label="脚本节点工作区">
    <div class="script-workspace-backdrop" data-action="close-canvas-script-workspace"></div>
    <section class="script-workspace" role="dialog" aria-modal="true" aria-labelledby="script-workspace-title">
      <header class="script-workspace-header"><div><small>脚本分镜</small><h2 id="script-workspace-title">${escapeHtml(scriptNode.data?.title === "剧本工作流" ? "脚本分镜" : scriptNode.data?.title ?? "脚本分镜")}</h2></div><div class="script-workspace-header-actions"><button type="button" data-action="download-canvas-selection" data-node-id="${escapeAttr(scriptNode.id)}" data-node-ids="${escapeAttr(JSON.stringify(connectedVideoNodeIds))}" ${connectedVideoNodeIds.length ? "" : "disabled"}>下载视频</button><button type="button" data-action="close-canvas-script-workspace" aria-label="关闭脚本分镜工作区">关闭</button></div></header>
      <nav class="script-workspace-steps" aria-label="脚本分镜步骤">
        <button type="button" data-action="set-canvas-script-workspace-step" data-script-workspace-step="live" aria-current="${activeStep === "live" ? "step" : "false"}"><b>1</b><span>提示词<small data-script-live-completed-count>${completedPromptCount}/4 已返回</small></span></button>
        <button type="button" data-action="set-canvas-script-workspace-step" data-script-workspace-step="assets" aria-current="${activeStep === "assets" ? "step" : "false"}"><b>2</b><span>准备资产<small>${readyAssets}/${Object.values(assetsByKind).flat().length} 已生成</small></span></button>
        <button type="button" data-action="set-canvas-script-workspace-step" data-script-workspace-step="shots" aria-current="${activeStep === "shots" ? "step" : "false"}"><b>3</b><span>确认镜头<small>${shots.length} 条镜头</small></span></button>
      </nav>
      <div class="script-workspace-content">
        ${activeStep === "live" ? `<section class="script-workspace-live"><header><div><h3>实时提示词</h3><p>仅显示模型正在返回的最新结果。</p></div><span class="script-workspace-live-overall" data-status="${escapeAttr(livePreview.status ?? "idle")}"><i aria-hidden="true"></i><span data-script-live-overall-label>${parsing || livePreview.status === "running" ? "正在生成" : livePreview.status === "completed" ? "生成完成" : livePreview.status === "failed" ? "生成失败" : "等待开始"}</span></span></header><div class="script-workspace-live-grid">${LIVE_PROMPT_STAGES.map((stage) => renderLivePromptStage(stage, livePreview, scriptNode.id)).join("")}</div></section>` : ""}
        ${activeStep === "assets" ? `<section class="script-workspace-assets"><header><div><h3>准备资产</h3><p>集中编辑角色、场景和道具，生成后可直接被分镜引用。</p></div><span class="script-workspace-assets-total">共 ${Object.values(assetsByKind).flat().length} 项资产</span></header>${[["character", "角色"], ["scene", "场景"], ["prop", "道具"]].map(([kind, label]) => `<section class="script-workspace-asset-section"><header class="script-workspace-asset-section-header"><h4>${label}<small>${assetsByKind[kind].length} 项</small></h4><button type="button" data-action="add-canvas-script-workflow-child" data-node-id="${escapeAttr(scriptNode.id)}" data-script-child-kind="${kind}">＋ 添加${label}</button></header><div class="script-workspace-asset-grid">${assetsByKind[kind].length ? assetsByKind[kind].map(workspaceAssetCard).join("") : `<p class="script-workspace-empty">暂无${label}，点击右上角添加</p>`}</div></section>`).join("")}</section>` : ""}
        ${activeStep === "shots" ? `<section class="script-workspace-shots"><header><div><h3>确认镜头</h3><p>每行对应画布上的一个分镜视频节点。</p></div><div class="script-workspace-shot-actions"><span data-script-shot-selection-count>已选 ${selectedShotNodeIds.size} 项</span><button type="button" class="is-danger" data-action="delete-selected-canvas-script-shots" data-node-id="${escapeAttr(scriptNode.id)}" ${selectedShotNodeIds.size ? "" : "disabled"}>批量删除</button><button type="button" data-action="add-canvas-script-workflow-child" data-node-id="${escapeAttr(scriptNode.id)}" data-script-child-kind="storyboard">添加镜头</button></div></header><div class="script-workspace-table-wrap"><table><thead><tr><th class="script-workspace-shot-select"><input type="checkbox" data-canvas-script-shot-select-all ${shots.length && selectedShotNodeIds.size === shots.length ? "checked" : ""} ${shots.length ? "" : "disabled"} aria-label="全选镜头" /></th><th>镜号</th><th class="script-workspace-shot-video-cell">视频</th><th>最终提示词</th><th>参考图</th><th>操作</th></tr></thead><tbody>${shots.length ? shots.map((node, index) => workspaceShotRow(node, index, selectedShotNodeIds.has(text(node.id)))).join("") : `<tr><td colspan="6" class="script-workspace-empty">尚未创建分镜。添加镜头后会在画布中创建对应视频节点。</td></tr>`}</tbody></table></div></section>` : ""}
      </div>
      ${selectedShotId ? `<aside class="script-workspace-reference-picker" role="dialog" aria-label="选择分镜参考图"><header><strong>镜头参考图</strong><button type="button" data-action="close-canvas-script-workspace-reference-picker">关闭</button></header><div>${workspaceReferences(children, selectedShotId) || `<p class="script-workspace-empty">请先添加角色、场景或道具节点。</p>`}</div></aside>` : ""}
    </section>
  </section>`;
}

export function renderCanvasScriptWorkspace(ui = {}) {
  const html = renderCanvasScriptWorkspaceBase(ui);
  if (!html) return html;
  const workspace = ui.canvasScriptWorkspace;
  const scriptNodeId = text(workspace?.scriptNodeId);
  const children = scriptWorkflowChildren(ui.canvasDocument ?? {}, scriptNodeId);
  const assetCount = children.filter((node) => ["character", "scene", "prop"].includes(text(node?.data?.workflowKind))).length;
  const shotCount = children.filter((node) => text(node?.data?.workflowKind) === "storyboard").length;
  return html
    .replace(/(<span class="script-workspace-assets-total">[^<]*<\/span>)/, (match) => match + workspaceBatchButton(scriptNodeId, "image", assetCount, "批量生成图片"))
    .replace(/(<span data-script-shot-selection-count>[^<]*<\/span>)/, (match) => match + workspaceBatchButton(scriptNodeId, "video", shotCount, "批量生成视频"));
}
