import { canvasAssetNodeData } from "../production-workbench/canvas/canvas-asset-library.js";
import {
  addCanvasNode,
  resolveCanvasNodePlacement,
  updateCanvasNodeData,
} from "../production-workbench/canvas/canvas-state.js";
import {
  resolveCanvasMediaNodeSource,
  resolveCanvasMediaStableIdentity,
} from "../production-workbench/canvas/canvas-media-node.js";
import { renderNewCanvasChromeRail } from "./canvas-chrome.js";

const AGENT_MODES = [
  { id: "b", label: "审核批准", description: "读取和分析自动进行，修改画布等有副作用的操作会先请求你的批准。" },
  { id: "c", label: "自动执行", description: "按照管理员策略自动执行，高风险操作仍可能需要你的批准。" },
  { id: "plan", label: "计划模式", description: "只生成执行计划，不修改画布或执行有副作用的操作。" },
  { id: "expert", label: "分析模式", description: "只进行只读分析，不修改画布或执行其他操作。" },
];

const TERMINAL_STATUSES = new Set([
  "succeeded",
  "completed",
  "success",
  "done",
  "finished",
  "failed",
  "canceled",
  "result_unknown",
  "manual_review_required",
]);
const LEGACY_CANVAS_AGENT_PANEL_WIDTH = 480;
const DEFAULT_CANVAS_AGENT_PANEL_WIDTH = 600;
const CANVAS_AGENT_PANEL_MIN_WIDTH = 300;
const PROMPT_EDITOR_MODULE_URL = "/vendor/prompt-editor.js?v=20260729-4";
const AGENT_ATTACHMENT_UPLOAD_LIMITS = {
  image: {
    label: "图片",
    maxBytes: 20 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
    extensions: [".jpg", ".jpeg", ".png", ".webp", ".avif"],
  },
  video: {
    label: "视频",
    maxBytes: 500 * 1024 * 1024,
    mimeTypes: ["video/mp4", "video/webm", "video/quicktime"],
    extensions: [".mp4", ".webm", ".mov"],
  },
  document: {
    label: "文档",
    maxBytes: 20 * 1024 * 1024,
    mimeTypes: [
      "text/plain",
      "text/markdown",
      "text/csv",
      "application/json",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    extensions: [".txt", ".md", ".markdown", ".csv", ".json", ".pdf", ".docx"],
  },
  blockedExtensions: [".7z", ".bat", ".cmd", ".com", ".dmg", ".exe", ".gz", ".html", ".js", ".msi", ".ps1", ".rar", ".sh", ".tar", ".zip"],
};

const AGENT_HEADER_ICON_PATHS = {
  new: '<path d="M12 5v14M5 12h14" />',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" />',
  close: '<path d="M5 12h14" /><path d="m13 6 6 6-6 6" />',
  open: '<path d="M19 12H5" /><path d="m11 6-6 6 6 6" />',
  trash: '<path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="m9 7 1-3h4l1 3" /><path d="M6 7l1 14h10l1-14" />',
  pin: '<path d="m15 4 5 5-3 1-4 4v4l-2 2-2-2v-4l-4-4-3-1 5-5z" /><path d="M12 20v2" />',
};

function renderAgentHeaderIcon(name) {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${AGENT_HEADER_ICON_PATHS[name] ?? AGENT_HEADER_ICON_PATHS.history}</svg>`;
}

function renderAgentComposerActionIcon(running = false) {
  return running
    ? '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" /></svg>'
    : '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20V4" /><path d="m5 11 7-7 7 7" /></svg>';
}

export function ensureCanvasAgentState(ui = {}) {
  const previous = ui.canvasAgent && typeof ui.canvasAgent === "object" ? ui.canvasAgent : {};
  const persisted = ui.canvasSessionUiState?.canvasAgent;
  const persistedPanelOpen = typeof persisted?.panelOpen === "boolean" ? persisted.panelOpen : null;
  const persistedPanelWidth = Number(persisted?.panelWidth);
  const mode = AGENT_MODES.some((item) => item.id === previous.mode) ? previous.mode : "b";
  Object.assign(previous, {
    conversationId: "",
    conversations: [],
    taskId: "",
    mode,
    modelCode: String(previous.modelCode ?? ui.canvasAgentModelCode ?? ""),
    models: [],
    modelsStatus: "idle",
    modelsError: "",
    promptDraft: "",
    promptMention: null,
    promptNodeReferences: [],
    promptAttachments: [],
    attachmentUploading: false,
    interjectionDraft: "",
    status: "idle",
    events: [],
    messages: [],
    messagesStatus: "idle",
    fileGrants: [],
    fileGrantsStatus: "idle",
    memoryRecords: [],
    memoryRecordsStatus: "idle",
    memoryRecordsError: "",
    memoryCategoryFilter: "",
    memorySourceFilter: "",
    memoryEditingId: "",
    memoryDraftKey: "",
    memoryDraftCategory: "general",
    memoryDraftValue: "",
    panelView: "timeline",
    panelOpen: true,
    panelWidth: DEFAULT_CANVAS_AGENT_PANEL_WIDTH,
    historyOpen: false,
    modeMenuOpen: false,
    titleEditing: false,
    titleDraft: "",
    taskFilter: "active",
    taskItems: [],
    taskCenterStatus: "idle",
    taskCenterError: "",
    memoryEvents: [],
    skippedStepIds: [],
    rewindConfirmOpen: false,
    sequence: 0,
    busyAction: "",
    error: "",
    polling: false,
    ...previous,
    mode,
    ...(Number(previous.panelWidth) === LEGACY_CANVAS_AGENT_PANEL_WIDTH
      ? { panelWidth: DEFAULT_CANVAS_AGENT_PANEL_WIDTH }
      : {}),
  });
  if (persistedPanelOpen !== null) previous.panelOpen = persistedPanelOpen;
  if (Number.isFinite(persistedPanelWidth)) previous.panelWidth = persistedPanelWidth;
  ui.canvasAgent = previous;
  return previous;
}

export function persistCanvasAgentUiState(ui = {}, agent = {}) {
  const current = ui.canvasSessionUiState && typeof ui.canvasSessionUiState === "object"
    ? ui.canvasSessionUiState
    : {};
  const currentAgent = current.canvasAgent && typeof current.canvasAgent === "object"
    ? current.canvasAgent
    : {};
  const panelWidth = Number(agent.panelWidth);
  ui.canvasSessionUiState = {
    ...current,
    canvasAgent: {
      ...currentAgent,
      panelOpen: agent.panelOpen !== false,
      ...(Number.isFinite(panelWidth) ? { panelWidth } : {}),
    },
  };
  return ui.canvasSessionUiState;
}

export function renderCanvasAgentPanel(ui = {}) {
  const agent = ensureCanvasAgentState(ui);
  if (agent.panelOpen === false) return "";
  const pendingApproval = findPendingApproval(agent.events, agent.skippedStepIds);
  const approvalPresentation = pendingApproval ? resolveAgentApprovalPresentation(agent.events, pendingApproval) : null;
  const active = Boolean(agent.taskId) && !TERMINAL_STATUSES.has(agent.status);
  const busy = Boolean(agent.busyAction);
  const models = Array.isArray(agent.models) ? agent.models : [];
  const selectedConversation = (agent.conversations ?? []).find((conversation) => conversation.id === agent.conversationId);
  const conversationArchived = selectedConversation?.status === "archived";
  const modelSelectDisabled = busy || agent.modelsStatus !== "ready" || !models.length;
  const selectedMode = AGENT_MODES.find((mode) => mode.id === agent.mode) ?? AGENT_MODES[0];
  const timelineEmpty = !active
    && !collapseAgentTimelineEvents(agent.events).length
    && !collapseAgentGenerationMessages(agent.messages).length;
  agent.panelView = "timeline";
  const panelView = "timeline";
  const conversationTitle = selectedConversation?.title || "新会话";
  const titleMarkup = agent.titleEditing
    ? `<input class="canvas-agent-title-input" type="text" data-agent-field="conversationTitle" value="${escapeAttr(agent.titleDraft || conversationTitle)}" maxlength="10" aria-label="当前会话名称" />`
    : `<strong class="canvas-agent-title" data-agent-conversation-title title="双击修改会话名称">${escapeHtml(conversationTitle)}</strong>`;
  return `
    <aside class="canvas-agent-panel ${agent.historyOpen ? "history-open" : panelView === "timeline" ? "" : "has-special-view"}${agent.conversationId ? " has-conversation" : ""}${timelineEmpty ? " timeline-empty" : ""}" data-canvas-agent-panel aria-label="Canvas Agent">
      <div class="canvas-agent-resize-handle" data-canvas-agent-resize role="separator" aria-orientation="vertical" aria-label="调整 Agent 面板宽度"></div>
      <header class="canvas-agent-head">
        ${titleMarkup}
        <div class="canvas-agent-head-actions">
          <button type="button" class="canvas-agent-icon-button" data-agent-action="new-conversation" aria-label="新建对话" title="新建对话">${renderAgentHeaderIcon("new")}</button>
          <button type="button" class="canvas-agent-icon-button ${agent.historyOpen ? "active" : ""}" data-agent-action="open-agent-history" aria-label="历史对话" title="历史对话" aria-expanded="${agent.historyOpen}">${renderAgentHeaderIcon("history")}</button>
          <button type="button" class="canvas-agent-icon-button" data-agent-action="close-agent-panel" aria-label="关闭 Agent 面板" title="关闭">${renderAgentHeaderIcon("close")}</button>
        </div>
      </header>

      ${agent.historyOpen ? renderAgentHistoryPopover(agent) : ""}

      ${agent.historyOpen ? "" : (panelView === "tasks" ? renderAgentTaskCenter(agent, busy) : panelView === "memory" ? renderAgentMemoryPanel(agent, busy) : `
      <section class="canvas-agent-timeline${timelineEmpty ? " is-empty" : ""}" aria-label="Agent 事件" aria-live="polite">
        ${renderAgentTimeline(agent, ui.canvasDocument, active)}
      </section>

      ${approvalPresentation ? renderAgentApprovalCard(approvalPresentation, busy) : ""}

      ${agent.taskId ? `<div class="canvas-agent-rewind-control">
        <button type="button" data-agent-action="rewind" ${busy ? "disabled" : ""} title="恢复最近一次 Agent 检查点">回退最近检查点</button>
      </div>` : ""}

      <footer class="canvas-agent-composer">
        <div class="canvas-agent-prompt-surface">
          ${renderAgentPromptAttachmentChips(agent)}
          <div class="canvas-agent-prompt-editor-host episode-prompt-editor-host" data-agent-prompt-editor>
            <textarea id="canvas-agent-prompt-input" data-agent-field="promptDraft" placeholder="${conversationArchived ? "恢复会话后继续发送" : "描述要分析、规划或修改的画布内容，输入 @ 引入节点"}" ${busy || conversationArchived ? "disabled" : ""}>${escapeHtml(agent.promptDraft)}</textarea>
          </div>
        </div>
        <div class="canvas-agent-composer-footer">
          <div class="canvas-agent-composer-left">
            <div class="canvas-agent-mode-picker">
              ${agent.modeMenuOpen ? `<div class="canvas-agent-mode-menu" role="listbox" aria-label="Agent 模式">
                ${AGENT_MODES.map((mode) => `<button type="button" role="option" aria-selected="${agent.mode === mode.id}" class="canvas-agent-mode-option ${agent.mode === mode.id ? "active" : ""}" data-agent-action="set-mode" data-agent-mode="${mode.id}">
                  <span><strong>${escapeHtml(mode.label)}</strong><small>${escapeHtml(mode.description)}</small></span>
                  ${agent.mode === mode.id ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>' : ""}
                </button>`).join("")}
              </div>` : ""}
              <button type="button" class="canvas-agent-mode-trigger ${agent.modeMenuOpen ? "active" : ""}" data-agent-action="toggle-mode-menu" aria-haspopup="listbox" aria-expanded="${agent.modeMenuOpen}" title="选择 Agent 模式">
                <span>${escapeHtml(selectedMode.label)}</span>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 14 5-5 5 5" /></svg>
              </button>
            </div>
            <span class="canvas-agent-status ${escapeAttr(agent.status)}">${escapeHtml(agentStatusLabel(agent))}</span>
          </div>
          <span class="canvas-agent-composer-actions">
            <button type="button" class="canvas-agent-attachment-button" data-agent-action="pick-attachments" aria-label="添加图片、视频或文件" title="添加图片、视频或文件" ${busy || conversationArchived || agent.attachmentUploading ? "disabled" : ""}>${renderAgentAttachmentIcon("add")}</button>
            <input type="file" data-agent-attachment-input accept="image/*,video/*,.txt,.md,.markdown,.csv,.json,.docx,.pdf" multiple hidden />
            <label class="canvas-agent-model-picker">
              <select data-agent-field="modelCode" ${modelSelectDisabled ? "disabled" : ""} aria-label="文本模型">
                ${models.length
                  ? models.map((model) => `<option value="${escapeAttr(model.modelCode)}" ${model.modelCode === agent.modelCode ? "selected" : ""}>${escapeHtml(model.modelLabel || model.modelCode)}</option>`).join("")
                  : `<option value="">${agent.modelsStatus === "loading" ? "正在加载模型" : "暂无可用文本模型"}</option>`}
              </select>
              ${agent.modelsError ? `<small>${escapeHtml(agent.modelsError)}</small>` : ""}
            </label>
            ${renderAgentContextUsage(agent)}
            <button type="button" class="canvas-agent-send-button${active ? " is-running" : ""}" data-agent-action="send" aria-label="${active ? "停止 Agent 任务" : "发送 Agent 指令"}" title="${active ? "停止 Agent 任务" : "发送 Agent 指令"}" aria-busy="${active}" ${busy || conversationArchived || (!active && modelSelectDisabled) ? "disabled" : ""}>${renderAgentComposerActionIcon(active)}</button>
          </span>
        </div>
        ${agent.error ? `<p class="canvas-agent-error" role="alert">${escapeHtml(agent.error)}</p>` : ""}
      </footer>
      `)}
    </aside>
  `;
}

function renderAgentHistoryPopover(agent) {
  const conversations = Array.isArray(agent.conversations) ? agent.conversations : [];
  return `<section class="canvas-agent-history" aria-label="历史对话">
    <header><strong>历史对话</strong><span>${conversations.length} 条</span></header>
    <div class="canvas-agent-history-list">
      ${conversations.length
        ? conversations.map((conversation) => `<div class="canvas-agent-history-row">
         <button type="button" class="canvas-agent-history-item ${String(conversation.id) === String(agent.conversationId) ? "active" : ""}" data-agent-action="select-agent-conversation" data-conversation-id="${escapeAttr(conversation.id)}">
           <strong>${escapeHtml(conversation.title || "未命名会话")}</strong>
           <small>${escapeHtml(conversation.status === "archived" ? "已归档" : "最近使用")}</small>
         </button>
          <button type="button" class="canvas-agent-history-status" data-agent-action="${conversation.status === "archived" ? "restore-conversation" : "archive-conversation"}" data-conversation-id="${escapeAttr(conversation.id)}">${conversation.status === "archived" ? "恢复" : "归档"}</button>
         <button type="button" class="canvas-agent-history-delete danger" data-agent-action="delete-conversation" data-conversation-id="${escapeAttr(conversation.id)}" aria-label="删除会话 ${escapeAttr(conversation.title || "未命名会话")}" title="删除会话">${renderAgentHeaderIcon("trash")}</button>
        </div>`).join("")
        : `<p>暂无历史对话</p>`}
    </div>
  </section>`;
}

export function renderNewCanvasLayout(canvasMarkup, ui = {}, auxiliaryMarkup = "", minimapMarkup = "") {
  const sessionReady = ui.canvasSessionUiStateReady !== false;
  const agentPanelClosed = !sessionReady || ui.canvasAgent?.panelOpen === false;
  const agentPanelWidth = resolveCanvasAgentPanelWidth(ui);
  const sidebarWidth = ui.canvasSidebarCollapsed !== false
    ? 0
    : ["assets", "history"].includes(ui.canvasSidebarMode)
      ? Math.max(264, (Math.min(6, Math.max(2, Number(ui.canvasAssetLayoutColumns ?? 3) || 3)) * 118))
      : 264;
  return `
    <div class="new-canvas-layout ${agentPanelClosed ? "is-agent-collapsed" : ""}" style="--canvas-agent-panel-width:${agentPanelWidth}px">
      <div class="new-canvas-workspace" data-new-canvas-workspace style="--new-canvas-sidebar-width:${sidebarWidth}px;--new-canvas-sidebar-half-width:${sidebarWidth / 2}px">${canvasMarkup}${minimapMarkup}${renderNewCanvasChromeRail(ui)}${sessionReady && agentPanelClosed ? renderCanvasAgentReopenButton() : ""}</div>
      ${sessionReady ? renderCanvasAgentPanel(ui) : ""}
      ${sessionReady ? renderCanvasAgentRewindConfirmModal(ui) : ""}
      ${auxiliaryMarkup}
    </div>
  `;
}

function renderCanvasAgentReopenButton() {
  return `<button type="button" class="canvas-agent-reopen" data-agent-action="open-agent-panel" aria-label="展开 Agent 面板" title="展开 Agent 面板">${renderAgentHeaderIcon("open")}</button>`;
}

function renderCanvasAgentRewindConfirmModal(ui = {}) {
  if (ui.canvasAgent?.rewindConfirmOpen !== true) return "";
  return `
    <section class="modal-backdrop delete-project-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="canvas-agent-rewind-confirm-title" aria-describedby="canvas-agent-rewind-confirm-description">
      <div class="delete-project-modal asset-delete-modal">
        <div class="delete-project-head">
          <div class="delete-project-icon warning" aria-hidden="true">!</div>
          <div>
            <h2 id="canvas-agent-rewind-confirm-title">回退最近检查点</h2>
            <p id="canvas-agent-rewind-confirm-description">将按最近检查点创建补偿 revision，确定回退吗？</p>
          </div>
          <button class="modal-close" type="button" data-agent-action="cancel-rewind" aria-label="关闭">×</button>
        </div>
        <div class="delete-project-actions">
          <button class="secondary-action delete-cancel-button" type="button" data-agent-action="cancel-rewind">取消</button>
          <button class="delete-confirm-button" type="button" data-agent-action="confirm-rewind">确定回退</button>
        </div>
      </div>
    </section>
  `;
}

export function resolveCanvasAgentPanelMaxWidth() {
  const viewportWidth = Number(globalThis.window?.innerWidth);
  const width = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : DEFAULT_CANVAS_AGENT_PANEL_WIDTH * 2;
  return Math.max(CANVAS_AGENT_PANEL_MIN_WIDTH, Math.floor(width / 2));
}

function resolveCanvasAgentPanelWidth(ui = {}) {
  const width = Number(ui.canvasAgent?.panelWidth);
  return Number.isFinite(width)
    ? Math.min(resolveCanvasAgentPanelMaxWidth(), Math.max(CANVAS_AGENT_PANEL_MIN_WIDTH, Math.round(width)))
    : Math.min(resolveCanvasAgentPanelMaxWidth(), DEFAULT_CANVAS_AGENT_PANEL_WIDTH);
}

export function reduceCanvasAgentEvents(agent, incoming = []) {
  const bySequence = new Map(
    (Array.isArray(agent.events) ? agent.events : [])
      .map((event) => [Number(event?.sequence ?? 0), event]),
  );
  for (const event of Array.isArray(incoming) ? incoming : []) {
    const sequence = Number(event?.sequence ?? 0);
    if (sequence > 0) bySequence.set(sequence, event);
  }
  agent.events = [...bySequence.values()]
    .sort((left, right) => Number(left.sequence) - Number(right.sequence))
    .slice(-500);
  agent.sequence = agent.events.reduce((max, event) => Math.max(max, Number(event?.sequence ?? 0)), Number(agent.sequence ?? 0));
  for (const event of agent.events) {
    const nextStatus = statusFromEvent(event);
    if (nextStatus) agent.status = nextStatus;
  }
  syncCurrentAgentTaskItem(agent);
  return agent;
}

function centerAgentCanvasNode(graph, cell, surface, canvasDocument, nodeId) {
  const centerRenderedNode = () => {
    const graphMount = surface?.querySelector?.("[data-canvas-x6-mount]");
    const nodeElement = [...(graphMount?.querySelectorAll?.(".x6-node") ?? [])]
      .find((element) => String(element?.getAttribute?.("data-cell-id") ?? "") === String(nodeId ?? ""));
    const graphRect = graphMount?.getBoundingClientRect?.();
    const nodeRect = nodeElement?.getBoundingClientRect?.();
    const renderedBounds = [
      graphRect?.left, graphRect?.top, graphRect?.right, graphRect?.bottom,
      nodeRect?.left, nodeRect?.top, nodeRect?.right, nodeRect?.bottom,
    ].map(Number);
    if (
      !renderedBounds.every(Number.isFinite)
      || Number(graphRect.right) <= Number(graphRect.left)
      || Number(graphRect.bottom) <= Number(graphRect.top)
      || Number(nodeRect.right) <= Number(nodeRect.left)
      || Number(nodeRect.bottom) <= Number(nodeRect.top)
      || typeof graph?.translate !== "function"
    ) return false;
    const deltaX = (Number(graphRect.left) + Number(graphRect.right) - Number(nodeRect.left) - Number(nodeRect.right)) / 2;
    const deltaY = (Number(graphRect.top) + Number(graphRect.bottom) - Number(nodeRect.top) - Number(nodeRect.bottom)) / 2;
    if (Math.abs(deltaX) >= 0.5 || Math.abs(deltaY) >= 0.5) {
      const translation = graph.translate() ?? {};
      graph.translate(
        Number(translation.tx ?? 0) + deltaX,
        Number(translation.ty ?? 0) + deltaY,
      );
    }
    return true;
  };
  const settleRenderedCenter = () => {
    const requestFrame = globalThis.requestAnimationFrame?.bind(globalThis);
    if (requestFrame) {
      let remainingFrames = 3;
      const settleCenter = () => requestFrame(() => {
        centerRenderedNode();
        remainingFrames -= 1;
        if (remainingFrames > 0) settleCenter();
      });
      settleCenter();
    }
  };
  if (centerRenderedNode()) {
    settleRenderedCenter();
    return;
  }
  const canvasNode = canvasDocument?.nodes?.find?.((node) => String(node?.id ?? "") === String(nodeId ?? ""));
  const cellSize = cell?.getSize?.() ?? {};
  const x = Number(canvasNode?.position?.x);
  const y = Number(canvasNode?.position?.y);
  const width = Number(canvasNode?.size?.width ?? cellSize.width);
  const height = Number(canvasNode?.size?.height ?? cellSize.height);
  if ([x, y, width, height].every(Number.isFinite) && typeof graph?.centerPoint === "function") {
    graph.centerPoint(x + (width / 2), y + (height / 2));
  } else graph?.centerCell?.(cell);
  settleRenderedCenter();
}

export function createCanvasAgentController({
  surface,
  workbench,
  renderPanel,
  renderLayout,
  pollIntervalMs = 1500,
  loadPromptEditorModule = () => import(PROMPT_EDITOR_MODULE_URL),
}) {
  const ui = workbench.ui ?? (workbench.ui = {});
  const agent = ensureCanvasAgentState(ui);
  let promptEditorMount = null;
  let promptEditorMountToken = null;
  let submitPromptFromEditor = () => false;
  const shouldFollowLatestTimeline = () => Boolean(agent.taskId);
  const captureTimelineScroll = () => captureAgentTimelineScroll(
    surface.querySelector?.(".canvas-agent-timeline"),
  );
  const restoreTimelineScroll = (state) => restoreAgentTimelineScroll(
    surface.querySelector?.(".canvas-agent-timeline"),
    state,
    shouldFollowLatestTimeline(),
  );
  const disposePromptEditor = () => {
    promptEditorMountToken = null;
    try {
      promptEditorMount?.handle?.destroy?.();
    } catch {
      // The fallback textarea remains available if the rich editor cannot unmount cleanly.
    }
    promptEditorMount = null;
  };
  const syncPromptEditor = async (options = {}) => {
    const editorHost = surface.querySelector?.("[data-agent-prompt-editor]") ?? null;
    if (!editorHost?.dataset || !editorHost?.ownerDocument || typeof editorHost.querySelector !== "function") {
      disposePromptEditor();
      return false;
    }
    if (promptEditorMount?.element === editorHost) return true;
    disposePromptEditor();
    const token = Symbol("canvas-agent-prompt-editor");
    promptEditorMountToken = token;
    editorHost.dataset.promptEditorStatus = "loading";
    try {
      const module = await loadPromptEditorModule();
      if (promptEditorMountToken !== token || !editorHost.isConnected) return false;
      const references = Array.isArray(agent.promptNodeReferences) ? agent.promptNodeReferences : [];
      const handle = module.mountPromptEditor(editorHost, {
        ariaLabel: "Agent 指令，输入 @ 引入画布节点",
        editable: !agent.busyAction && !isSelectedAgentConversationArchived(agent),
        id: "canvas-agent-prompt-input",
        mentionReferences: references.map(buildAgentPromptEditorReference),
        maxSuggestions: Number.MAX_SAFE_INTEGER,
        placeholder: isSelectedAgentConversationArchived(agent)
          ? "恢复会话后继续发送"
          : "描述要分析、规划或修改的画布内容，输入 @ 引入节点",
        prompt: mergeAgentPromptReferenceTokens(agent.promptDraft, references),
        restoreState: options.restoreState ?? null,
        getSuggestions: () => listCanvasAgentNodeReferences(workbench.ui).map(buildAgentPromptEditorReference),
        onMentionSelect(item) {
          const reference = listCanvasAgentNodeReferences(workbench.ui)
            .find((candidate) => candidate.nodeId === String(item.referenceId ?? item.assetId ?? item.id ?? ""));
          if (!reference) return item;
          agent.promptNodeReferences = [
            ...(Array.isArray(agent.promptNodeReferences) ? agent.promptNodeReferences : [])
              .filter((candidate) => candidate.nodeId !== reference.nodeId),
            reference,
          ];
          return buildAgentPromptEditorReference(reference);
        },
        onMentionsChange(mentions) {
          const referenceByNodeId = new Map(
            listCanvasAgentNodeReferences(workbench.ui).map((reference) => [reference.nodeId, reference]),
          );
          const seenNodeIds = new Set();
          agent.promptNodeReferences = (Array.isArray(mentions) ? mentions : [])
            .map((mention) => referenceByNodeId.get(String(mention.referenceId ?? mention.assetId ?? mention.id ?? "")))
            .filter((reference) => reference && !seenNodeIds.has(reference.nodeId) && seenNodeIds.add(reference.nodeId));
        },
        onChange({ prompt }) {
          agent.promptDraft = String(prompt ?? "");
        },
      });
      const input = editorHost.querySelector?.("[data-tiptap-prompt-editor]");
      input?.setAttribute?.("data-agent-prompt-input", "");
      input?.addEventListener?.("keydown", (event) => {
        if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
        const mentionMenu = editorHost.ownerDocument?.querySelector?.(".episode-prompt-editor-menu:not([hidden])");
        if (mentionMenu) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        submitPromptFromEditor();
      }, { capture: true });
      editorHost.dataset.promptEditorStatus = "ready";
      promptEditorMount = { element: editorHost, handle };
      return true;
    } catch (error) {
      if (promptEditorMountToken !== token) return false;
      editorHost.dataset.promptEditorStatus = "fallback";
      console.error("[new-canvas] Agent prompt editor mount failed", error);
      return false;
    }
  };
  const syncPanel = () => {
    const current = surface.querySelector?.("[data-canvas-agent-panel]");
    if (!current || typeof document === "undefined") return false;
    const timelineScroll = captureAgentTimelineScroll(current.querySelector?.(".canvas-agent-timeline"));
    const promptInputState = promptEditorMount?.handle?.captureState?.() ?? null;
    disposePromptEditor();
    const template = document.createElement("template");
    template.innerHTML = renderCanvasAgentPanel(ui);
    const next = template.content.firstElementChild;
    if (!next) return false;
    current.replaceWith(next);
    renderPanel?.(next);
    restoreAgentTimelineScroll(
      next.querySelector?.(".canvas-agent-timeline"),
      timelineScroll,
      shouldFollowLatestTimeline(),
    );
    void syncPromptEditor({ restoreState: promptInputState });
    return true;
  };
  const syncPromptMentionMenu = () => {
    const input = surface.querySelector?.('[data-agent-field="promptDraft"]');
    const currentMenu = surface.querySelector?.(".canvas-agent-mention-menu");
    currentMenu?.remove?.();
    if (!input || !agent.promptMention?.open || typeof input.insertAdjacentHTML !== "function") return false;
    input.insertAdjacentHTML("afterend", renderAgentPromptMentionMenu(agent, ui));
    return true;
  };
  const syncPanelVisibility = () => {
    const layout = surface.querySelector?.(".new-canvas-layout");
    const workspace = surface.querySelector?.("[data-new-canvas-workspace]");
    if (!layout || !workspace) return false;
    const panelOpen = agent.panelOpen !== false;
    layout.classList?.toggle?.("is-agent-collapsed", !panelOpen);
    const currentPanel = surface.querySelector?.("[data-canvas-agent-panel]");
    const reopenButton = surface.querySelector?.(".canvas-agent-reopen");
    if (panelOpen) {
      reopenButton?.remove?.();
      if (!currentPanel) {
        if (typeof workspace.insertAdjacentHTML !== "function") return false;
        workspace.insertAdjacentHTML("afterend", renderCanvasAgentPanel(ui));
      }
    } else {
      currentPanel?.remove?.();
      if (!reopenButton) {
        if (typeof workspace.insertAdjacentHTML !== "function") return false;
        workspace.insertAdjacentHTML("beforeend", renderCanvasAgentReopenButton());
      }
    }
    return true;
  };
  let pollTimer = null;
  let pollInFlight = false;
  let streamAbortController = null;
  let streamInFlight = false;
  let realtimeGeneration = 0;
  let fileGrantsConversationId = Array.isArray(agent.fileGrants) && agent.fileGrants.some((grant) => grant?.status === "active")
    ? String(agent.conversationId ?? "")
    : "";
  let disposed = false;
  const refreshedCanvasEventKeys = new Set();
  const canvasRefreshRetryTimers = new Set();
  const canvasRefreshRetryDelaysMs = [250, 750, 1_500, 3_000, 5_000, 5_000];

  const canvasDocumentHasGenerationResult = (generationTaskId) => {
    const nodes = workbench.ui?.canvasDocument?.nodes;
    if (!Array.isArray(nodes)) return false;
    return nodes.some((node) => {
      const data = node?.data ?? {};
      const taskId = String(data.lastTaskId ?? data.taskId ?? data.generationTaskId ?? "").trim();
      if (taskId !== generationTaskId) return false;
      const status = String(data.status ?? "").trim().toLowerCase();
      return ["completed", "succeeded"].includes(status) && Boolean(
        String(data.storageObjectId ?? data.resultStorageObjectId ?? "").trim()
        || String(data.imageUrl ?? data.resultUrl ?? data.url ?? data.previewUrl ?? "").trim(),
      );
    });
  };

  const retryCanvasRefreshAfterGeneration = (generationTaskId, attempt = 0) => {
    if (disposed || canvasDocumentHasGenerationResult(generationTaskId)) return;
    if (attempt >= canvasRefreshRetryDelaysMs.length) return;
    const timer = setTimeout(async () => {
      canvasRefreshRetryTimers.delete(timer);
      if (disposed || canvasDocumentHasGenerationResult(generationTaskId)) return;
      try {
        await Promise.resolve(workbench.refreshCanvasAfterAgentPatch());
      } catch {
        // A later retry can recover from a transient canvas head failure.
      }
      retryCanvasRefreshAfterGeneration(generationTaskId, attempt + 1);
    }, canvasRefreshRetryDelaysMs[attempt]);
    canvasRefreshRetryTimers.add(timer);
  };

  const refreshCanvasAfterAgentMutation = (incoming = []) => {
    if (typeof workbench.refreshCanvasAfterAgentPatch !== "function") return;
    for (const event of Array.isArray(incoming) ? incoming : []) {
      const eventType = String(event?.eventType ?? "");
      const stepId = String(event?.event?.stepId ?? "");
      const generationTaskId = String(event?.event?.generationTaskId ?? "");
      let refreshKey = "";
      if (eventType === "step.succeeded" && stepId) {
        const created = (agent.events ?? []).find((candidate) =>
          candidate?.eventType === "step.created"
          && String(candidate?.event?.stepId ?? "") === stepId
          && String(candidate?.event?.toolId ?? "") === "canvas.patch",
        );
        if (created) refreshKey = `canvas.patch:${stepId}`;
      } else if (eventType === "task.waiting_external" && generationTaskId) {
        refreshKey = `generation.queued:${generationTaskId}`;
      } else if (eventType === "generation.completed_wakeup" && generationTaskId) {
        refreshKey = `generation.completed:${generationTaskId}`;
      }
      if (!refreshKey || refreshedCanvasEventKeys.has(refreshKey)) continue;
      refreshedCanvasEventKeys.add(refreshKey);
      void Promise.resolve(workbench.refreshCanvasAfterAgentPatch()).catch(() => undefined);
      if (eventType === "generation.completed_wakeup" && generationTaskId) {
        retryCanvasRefreshAfterGeneration(generationTaskId);
      }
    }
  };

  const stopPolling = () => {
    realtimeGeneration += 1;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    streamAbortController?.abort();
    streamAbortController = null;
    agent.polling = false;
  };

  const schedulePoll = (delay = pollIntervalMs) => {
    stopPolling();
    if (disposed || !agent.taskId || TERMINAL_STATUSES.has(agent.status)) return;
    agent.polling = true;
    pollTimer = setTimeout(
      () => void (typeof workbench.api?.streamCanvasAgentEvents === "function" ? stream() : poll()),
      Math.max(0, delay),
    );
  };

  const stream = async () => {
    if (disposed || streamInFlight || !agent.taskId) return;
    const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
    if (!canvasId || typeof workbench.api?.streamCanvasAgentEvents !== "function") return void poll();
    const taskId = agent.taskId;
    const generation = realtimeGeneration;
    const abortController = new AbortController();
    streamAbortController = abortController;
    streamInFlight = true;
    agent.polling = true;
    try {
      for await (const message of workbench.api.streamCanvasAgentEvents(canvasId, taskId, {
        after: agent.sequence,
        limit: 200,
        signal: abortController.signal,
      })) {
        if (disposed || agent.taskId !== taskId || generation !== realtimeGeneration) break;
        if (message?.event === "access.revoked") throw new Error("canvas_agent_access_revoked");
        const event = message?.data;
        if (!event || typeof event !== "object" || !event.eventType) continue;
        reduceCanvasAgentEvents(agent, [event]);
        refreshCanvasAfterAgentMutation([event]);
        agent.error = "";
        syncPanel();
        if (TERMINAL_STATUSES.has(agent.status)) {
          await refreshConversationMessages(agent.conversationId);
          syncPanel();
          break;
        }
      }
    } catch (error) {
      if (!abortController.signal.aborted && generation === realtimeGeneration) {
        agent.error = friendlyAgentError(error);
        syncPanel();
      }
    } finally {
      if (streamAbortController === abortController) streamAbortController = null;
      streamInFlight = false;
      if (!disposed && generation === realtimeGeneration && agent.taskId === taskId) schedulePoll(1_000);
    }
  };

  const poll = async () => {
    if (disposed || pollInFlight || !agent.taskId) return;
    const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
    if (!canvasId || typeof workbench.api?.listCanvasAgentEvents !== "function") return;
    pollInFlight = true;
    try {
      const payload = await workbench.api.listCanvasAgentEvents(canvasId, agent.taskId, {
        after: agent.sequence,
        limit: 200,
      });
      const events = Array.isArray(payload?.events) ? payload.events : [];
      if (events.length) {
        reduceCanvasAgentEvents(agent, events);
        refreshCanvasAfterAgentMutation(events);
        agent.error = "";
        if (TERMINAL_STATUSES.has(agent.status)) await refreshConversationMessages(agent.conversationId);
        syncPanel();
      }
    } catch (error) {
      agent.error = friendlyAgentError(error);
      syncPanel();
    } finally {
      pollInFlight = false;
      schedulePoll();
    }
  };

  const ensureConversation = async () => {
    if (agent.conversationId) return agent.conversationId;
    const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
    const payload = await workbench.api.createCanvasAgentConversation(canvasId, { title: "画布协作" });
    const id = String(payload?.conversation?.id ?? payload?.id ?? "");
    if (!id) throw new Error("canvas_agent_conversation_missing");
    agent.conversationId = id;
    return id;
  };

  const hydrateMediaMessages = async () => {
    agent.messages = collapseAgentGenerationMessages(agent.messages);
    const taskIds = [...new Set((agent.messages ?? []).map((message) => message.generationTaskId).filter(Boolean))];
    if (!taskIds.length) return agent.messages;
    let items = [];
    try {
      if (typeof workbench.api?.getGenerationTasks === "function") {
        const payload = await workbench.api.getGenerationTasks(taskIds);
        items = Array.isArray(payload?.items) ? payload.items : [];
      } else if (typeof workbench.api?.getGenerationTask === "function") {
        items = (await Promise.all(taskIds.map((taskId) => workbench.api.getGenerationTask(taskId).catch(() => null)))).filter(Boolean);
      }
    } catch {
      return agent.messages;
    }
    const byTaskId = new Map(items.map((task) => [String(task?.taskId ?? task?.id ?? ""), normalizeAgentMediaTask(task)]));
    agent.messages = agent.messages.map((message) => {
      const media = byTaskId.get(message.generationTaskId) ?? message.media ?? null;
      return {
        ...message,
        media,
        canvasNodeId: resolveAgentMediaCanvasNodeId(workbench.ui?.canvasDocument, message, media),
      };
    });
    return agent.messages;
  };

  const refreshConversationMessages = async (conversationId) => {
    const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
    if (!canvasId || !conversationId || typeof workbench.api?.listCanvasAgentMessages !== "function") return agent.messages;
    const payload = await workbench.api.listCanvasAgentMessages(canvasId, conversationId, { limit: 200 });
    if (agent.conversationId !== conversationId) return agent.messages;
    const rows = Array.isArray(payload?.messages) ? payload.messages : [];
    agent.messages = rows.map(normalizeAgentMessage).filter((message) => message.text || message.generationTaskId).slice(-200);
    await hydrateMediaMessages();
    return agent.messages;
  };

  const loadTaskEvents = async (canvasId, taskId) => {
    if (!canvasId || !taskId || typeof workbench.api?.listCanvasAgentEvents !== "function") return [];
    try {
      const payload = await workbench.api.listCanvasAgentEvents(canvasId, taskId, { after: 0, limit: 1000 });
      const events = Array.isArray(payload?.events) ? payload.events : [];
      if (agent.taskId === taskId) {
        reduceCanvasAgentEvents(agent, events);
        syncPanel();
      }
      return events;
    } catch {
      // Conversation messages remain usable if the task event endpoint is temporarily unavailable.
      return [];
    }
  };

  const loadMessages = async (conversationId) => {
    stopPolling();
    if (fileGrantsConversationId && fileGrantsConversationId !== conversationId) {
      agent.fileGrants = [];
      agent.fileGrantsStatus = "idle";
      fileGrantsConversationId = "";
    }
    Object.assign(agent, {
      taskId: "",
      status: "idle",
      events: [],
      messages: [],
      sequence: 0,
      messagesStatus: conversationId ? "loading" : "idle",
      promptAttachments: [],
      error: "",
    });
    syncPanel();
    if (!conversationId) return [];
    const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
    if (!canvasId || typeof workbench.api?.listCanvasAgentMessages !== "function") {
      agent.messagesStatus = "unavailable";
      agent.error = "会话历史暂不可用";
      syncPanel();
      return [];
    }
    try {
      await refreshConversationMessages(conversationId);
      const conversation = (agent.conversations ?? []).find((item) => String(item.id) === conversationId);
      if (conversation?.taskId) {
        agent.taskId = String(conversation.taskId);
        agent.status = String(conversation.taskStatus ?? "queued");
        if (TERMINAL_STATUSES.has(agent.status)) {
          // Terminal task history is useful for the timeline, but must not delay the conversation render.
          void loadTaskEvents(canvasId, agent.taskId);
        } else {
          // The live endpoint replays the initial history before waiting for new events.
          schedulePoll(0);
        }
      }
      agent.messagesStatus = "ready";
    } catch (error) {
      if (agent.conversationId !== conversationId) return [];
      agent.messagesStatus = "unavailable";
      agent.error = friendlyAgentError(error);
    }
    syncPanel();
    return agent.messages;
  };

  const loadFileGrants = async (conversationId = agent.conversationId) => {
    const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
    if (!canvasId || !conversationId || typeof workbench.api?.listCanvasAgentFileGrants !== "function") {
      agent.fileGrants = [];
      agent.fileGrantsStatus = "unavailable";
      fileGrantsConversationId = "";
      return [];
    }
    agent.fileGrantsStatus = "loading";
    try {
      const payload = await workbench.api.listCanvasAgentFileGrants(canvasId, conversationId);
      if (agent.conversationId !== conversationId) return [];
      agent.fileGrants = (Array.isArray(payload?.grants) ? payload.grants : [])
        .map(normalizeAgentFileGrant)
        .filter((grant) => grant.id && grant.status === "active");
      agent.fileGrantsStatus = "ready";
      fileGrantsConversationId = conversationId;
    } catch (error) {
      if (agent.conversationId !== conversationId) return [];
      agent.fileGrants = [];
      agent.fileGrantsStatus = "unavailable";
      fileGrantsConversationId = "";
      agent.error = friendlyAgentError(error);
    }
    syncPanel();
    return agent.fileGrants;
  };

  const prepareAgentMessageNodeReferences = async (canvasId, conversationId) => {
    const references = Array.isArray(agent.promptNodeReferences) ? agent.promptNodeReferences : [];
    const fileGrantIds = [];
    const grantIdByNodeId = new Map();
    if (references.some((reference) => reference.storageObjectId) && fileGrantsConversationId !== conversationId) {
      await loadFileGrants(conversationId);
    }
    for (const reference of references.filter((item) => item.storageObjectId)) {
      const existing = (Array.isArray(agent.fileGrants) ? agent.fileGrants : [])
        .find((grant) => grant.storageObjectId === reference.storageObjectId && grant.status === "active");
      if (existing?.id) {
        fileGrantIds.push(existing.id);
        grantIdByNodeId.set(reference.nodeId, existing.id);
        continue;
      }
      if (typeof workbench.api?.createCanvasAgentFileGrant !== "function") {
        throw new Error("canvas_agent_file_grant_unavailable");
      }
      const payload = await workbench.api.createCanvasAgentFileGrant(canvasId, conversationId, {
        storageObjectId: reference.storageObjectId,
        purpose: `Canvas Agent reference: ${reference.title}`,
        expiresInSeconds: 3_600,
      });
      const grantId = String(payload?.grant?.id ?? "").trim();
      if (grantId) {
        fileGrantIds.push(grantId);
        grantIdByNodeId.set(reference.nodeId, grantId);
      }
    }
    if (fileGrantIds.length) await loadFileGrants(conversationId);
    const attachments = Array.isArray(agent.promptAttachments) ? agent.promptAttachments : [];
    const attachmentGrantIds = attachments
      .map((attachment) => String(attachment?.fileGrantId ?? "").trim())
      .filter(Boolean);
    return {
      references,
      attachments,
      fileGrantIds: [...new Set([...fileGrantIds, ...attachmentGrantIds])],
      messageNodeReferences: references.map((reference) => ({
        nodeId: reference.nodeId,
        title: reference.title,
        mediaKind: reference.mediaKind || (reference.storageObjectId ? "image" : "node"),
        ...(grantIdByNodeId.get(reference.nodeId)
          ? { fileGrantId: grantIdByNodeId.get(reference.nodeId) }
          : {}),
      })),
    };
  };

  const uploadAgentAttachments = async (files) => {
    const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
    const candidates = Array.from(files ?? []).filter(Boolean).slice(0, 8);
    if (!canvasId || !candidates.length) return;
    if (typeof workbench.api?.uploadFile !== "function" || typeof workbench.api?.createCanvasAgentFileGrant !== "function") {
      throw new Error("canvas_agent_attachment_upload_unavailable");
    }
    const conversationId = await ensureConversation();
    const current = Array.isArray(agent.promptAttachments) ? agent.promptAttachments : [];
    const remaining = Math.max(0, 8 - current.length);
    if (!remaining) throw new Error("最多可添加 8 个附件。");
    agent.attachmentUploading = true;
    syncPanel();
    const uploaded = [];
    try {
      for (const file of candidates.slice(0, remaining)) {
        const kind = resolveAgentAttachmentKind(file);
        if (!kind) throw new Error(`不支持的附件类型：${file.name || "文件"}`);
        const result = await workbench.api.uploadFile(file, {
          category: "canvas-agent-attachments",
          projectId: null,
          canvasProjectId: canvasId,
          uploadLimits: AGENT_ATTACHMENT_UPLOAD_LIMITS,
        });
        const upload = result?.upload ?? result ?? {};
        const storageObjectId = String(upload.storageObjectId ?? result?.storageObject?.id ?? "").trim();
        if (!storageObjectId) throw new Error("canvas_agent_attachment_upload_missing");
        const grant = await workbench.api.createCanvasAgentFileGrant(canvasId, conversationId, {
          storageObjectId,
          purpose: `Canvas Agent attachment: ${String(file.name ?? "attachment").slice(0, 120)}`,
          expiresInSeconds: 3_600,
        });
        const fileGrantId = String(grant?.grant?.id ?? "").trim();
        if (!fileGrantId) throw new Error("canvas_agent_attachment_grant_missing");
        uploaded.push({
          id: storageObjectId,
          storageObjectId,
          fileGrantId,
          name: String(file.name ?? "附件").slice(0, 160),
          contentType: String(file.type ?? "application/octet-stream").toLowerCase(),
          sizeBytes: Number(file.size ?? 0),
          kind,
          previewUrl: kind === "image" || kind === "video"
            ? `/api/storage/objects/${encodeURIComponent(storageObjectId)}/content?proxy=1`
            : "",
        });
      }
      await loadFileGrants(conversationId);
    } finally {
      if (uploaded.length) agent.promptAttachments = [...current, ...uploaded];
      agent.attachmentUploading = false;
      syncPanel();
    }
  };

  const loadMemories = async (conversationId = agent.conversationId) => {
    const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
    if (!canvasId || !conversationId || typeof workbench.api?.listCanvasAgentMemories !== "function") {
      agent.memoryRecords = [];
      agent.memoryRecordsStatus = "unavailable";
      agent.memoryRecordsError = conversationId ? "记忆记录接口暂不可用" : "请先选择会话";
      syncPanel();
      return [];
    }
    agent.memoryRecordsStatus = "loading";
    agent.memoryRecordsError = "";
    syncPanel();
    try {
      const payload = await workbench.api.listCanvasAgentMemories(canvasId, conversationId, { includeInactive: true });
      if (agent.conversationId !== conversationId) return [];
      const rows = Array.isArray(payload?.memories)
        ? payload.memories
        : Array.isArray(payload?.records)
          ? payload.records
          : Array.isArray(payload?.items) ? payload.items : [];
      agent.memoryRecords = rows.map(normalizeAgentMemoryRecord).filter((record) => record.id && record.key);
      agent.memoryRecordsStatus = "ready";
    } catch (error) {
      if (agent.conversationId !== conversationId) return [];
      agent.memoryRecords = [];
      agent.memoryRecordsStatus = "unavailable";
      agent.memoryRecordsError = friendlyAgentError(error);
    }
    syncPanel();
    return agent.memoryRecords;
  };

  const loadModels = async () => {
    if (disposed || agent.modelsStatus === "loading") return agent.models;
    const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
    if (!canvasId || typeof workbench.api?.listCanvasAgentModels !== "function") {
      agent.models = [];
      agent.modelsStatus = "unavailable";
      agent.modelsError = "文本模型列表暂不可用";
      syncPanel();
      return [];
    }
    agent.modelsStatus = "loading";
    agent.modelsError = "";
    syncPanel();
    try {
      const payload = await workbench.api.listCanvasAgentModels(canvasId);
      const rows = Array.isArray(payload?.models) ? payload.models : Array.isArray(payload) ? payload : [];
      agent.models = rows.map(normalizeAgentModel).filter((model) => model.modelCode);
      agent.modelsStatus = "ready";
      if (!agent.models.some((model) => model.modelCode === agent.modelCode)) {
        agent.modelCode = agent.models[0]?.modelCode ?? "";
      }
      if (!agent.models.length) agent.modelsError = "管理员尚未配置可用文本模型";
    } catch (error) {
      agent.models = [];
      agent.modelsStatus = "unavailable";
      agent.modelsError = friendlyAgentError(error);
    }
    syncPanel();
    return agent.models;
  };

  const loadConversations = async () => {
    if (disposed || typeof workbench.api?.listCanvasAgentConversations !== "function") return [];
    const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
    if (!canvasId) return [];
    try {
      const payload = await workbench.api.listCanvasAgentConversations(canvasId, { limit: 50 });
      agent.conversations = Array.isArray(payload?.conversations) ? payload.conversations : [];
      if (!agent.conversations.some((conversation) => String(conversation.id) === agent.conversationId)) {
        agent.conversationId = String(agent.conversations[0]?.id ?? "");
      }
      syncPanel();
    } catch (error) {
      agent.error = friendlyAgentError(error);
      syncPanel();
    }
    return agent.conversations;
  };

  const loadTaskCenter = async () => {
    const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
    if (!canvasId || typeof workbench.api?.listCanvasAgentMessages !== "function") {
      agent.taskCenterStatus = "unavailable";
      agent.taskCenterError = "任务记录暂不可用";
      syncPanel();
      return agent.taskItems;
    }
    agent.taskCenterStatus = "loading";
    agent.taskCenterError = "";
    syncPanel();
    try {
      if (!agent.conversations.length) await loadConversations();
      const conversations = Array.isArray(agent.conversations) ? agent.conversations : [];
      const histories = await Promise.all(conversations.map(async (conversation) => {
        const payload = await workbench.api.listCanvasAgentMessages(canvasId, conversation.id, { limit: 200 });
        return {
          conversation,
          messages: (Array.isArray(payload?.messages) ? payload.messages : []).map(normalizeAgentMessage),
        };
      }));
      const seeds = collectAgentTaskSeeds(histories, agent);
      const items = await Promise.all([...seeds.values()].map(async (seed) => {
        let events = seed.taskId === agent.taskId ? [...agent.events] : [];
        if (!events.length && typeof workbench.api?.listCanvasAgentEvents === "function") {
          try {
            const payload = await workbench.api.listCanvasAgentEvents(canvasId, seed.taskId, { after: 0, limit: 1000 });
            events = Array.isArray(payload?.events) ? payload.events : [];
          } catch {
            events = [];
          }
        }
        return buildAgentTaskItem(seed, events);
      }));
      agent.taskItems = items.sort((left, right) => right.updatedAt - left.updatedAt);
      agent.memoryEvents = collectAgentMemoryEvents(agent.taskItems, agent.events);
      agent.taskCenterStatus = "ready";
    } catch (error) {
      agent.taskCenterStatus = "unavailable";
      agent.taskCenterError = friendlyAgentError(error);
    }
    syncPanel();
    return agent.taskItems;
  };

  const run = async (action, operation) => {
    if (agent.busyAction) return;
    agent.busyAction = action;
    agent.error = "";
    syncPanel();
    try {
      await operation();
    } catch (error) {
      agent.error = friendlyAgentError(error);
    } finally {
      agent.busyAction = "";
      syncPanel();
    }
  };

  const control = async (action, input = {}, taskId = agent.taskId) => {
    const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
    if (!canvasId || !taskId) throw new Error("canvas_agent_task_missing");
    const payload = await workbench.api.controlCanvasAgentTask(canvasId, taskId, action, input);
    const resultStatus = String(payload?.result?.status ?? "");
    if (resultStatus) {
      if (taskId === agent.taskId) agent.status = resultStatus;
      updateAgentTaskItemStatus(agent, taskId, resultStatus);
    }
    if (taskId === agent.taskId) schedulePoll(0);
    return payload;
  };

  const controller = {
    syncPanel,
    syncPromptEditor,
    captureTimelineScroll,
    restoreTimelineScroll,
    loadModels,
    loadMessages,
    loadFileGrants,
    loadMemories,
    loadTaskCenter,
    handleClick(target) {
      if (
        agent.promptMention?.open
        && !target?.closest?.(".canvas-agent-mention-menu, [data-agent-field=\"promptDraft\"]")
      ) {
        agent.promptMention = null;
        syncPromptMentionMenu();
        return true;
      }
      if (!agent.modeMenuOpen || target?.closest?.(".canvas-agent-mode-picker")) return false;
      agent.modeMenuOpen = false;
      syncPanel();
      return true;
    },
    handleInput(target) {
      if (target?.matches?.("[data-agent-attachment-input]")) {
        const files = target.files;
        target.value = "";
        void run("upload-agent-attachments", () => uploadAgentAttachments(files));
        return true;
      }
      const field = String(target?.dataset?.agentField ?? "");
      if (field === "conversationTitle") {
        agent.titleDraft = Array.from(String(target.value ?? "")).slice(0, 10).join("");
        return true;
      }
      if (!field || !Object.hasOwn(agent, field)) return false;
      const value = String(target.value ?? "");
      if (field === "conversationId" && value !== agent.conversationId) {
        agent.conversationId = value;
        void loadMessages(value);
        return true;
      }
      agent[field] = value;
      if (field === "promptDraft") {
        const activeQuery = resolveAgentPromptMentionQuery(value, target.selectionStart);
        agent.promptMention = activeQuery ? { ...(agent.promptMention ?? {}), ...activeQuery, open: true } : null;
        syncPromptMentionMenu();
      }
      return true;
    },
    handleBlur(target) {
      if (target?.dataset?.agentField !== "conversationTitle" || !agent.titleEditing || agent.busyAction) {
        return false;
      }
      const savePromise = this.handleAction({ dataset: { agentAction: "save-conversation-title" } });
      const trackedSave = savePromise.finally(() => {
        if (agent.titleSavePromise === trackedSave) agent.titleSavePromise = null;
      });
      agent.titleSavePromise = trackedSave;
      return true;
    },
    handleKeydown(event, target) {
      if (event.key === "Escape" && agent.modeMenuOpen) {
        event.preventDefault();
        agent.modeMenuOpen = false;
        syncPanel();
        queueMicrotask(() => surface.querySelector?.('[data-agent-action="toggle-mode-menu"]')?.focus?.());
        return true;
      }
      if (event.key === "Escape" && agent.promptMention?.open && target?.dataset?.agentField === "promptDraft") {
        event.preventDefault();
        agent.promptMention = null;
        syncPromptMentionMenu();
        return true;
      }
      if (target?.dataset?.agentField === "conversationTitle") {
        if (event.key === "Enter") {
          event.preventDefault();
          void this.handleAction({ dataset: { agentAction: "save-conversation-title" } });
          return true;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          agent.titleEditing = false;
          syncPanel();
          return true;
        }
        return false;
      }
      if (target?.dataset?.agentField !== "promptDraft" || event.key !== "Enter" || event.shiftKey) return false;
      event.preventDefault();
      void this.handleAction({ dataset: { agentAction: agent.taskId && !TERMINAL_STATUSES.has(agent.status) ? "interject-prompt" : "send" } });
      return true;
    },
    handleDoubleClick(target) {
      if (!target?.closest?.("[data-agent-conversation-title]") || !agent.conversationId) return false;
      const conversation = (agent.conversations ?? []).find((item) => item.id === agent.conversationId);
      agent.titleDraft = normalizeConversationTitle(conversation?.title ?? "新会话");
      agent.titleEditing = true;
      syncPanel();
      queueMicrotask(() => {
        const input = surface.querySelector?.('[data-agent-field="conversationTitle"]');
        input?.focus?.();
        input?.select?.();
      });
      return true;
    },
    async handleAction(target) {
      const action = String(target?.dataset?.agentAction ?? "");
      if (!action) return false;
      if (action !== "save-conversation-title" && agent.titleSavePromise) {
        await agent.titleSavePromise;
      }
      if (action === "toggle-mode-menu") {
        agent.modeMenuOpen = !agent.modeMenuOpen;
        syncPanel();
        if (agent.modeMenuOpen) {
          queueMicrotask(() => surface.querySelector?.('[data-agent-action="set-mode"][aria-selected="true"]')?.focus?.());
        }
        return true;
      }
      if (action === "set-mode") {
        const mode = String(target.dataset.agentMode ?? "b");
        agent.mode = AGENT_MODES.some((item) => item.id === mode) ? mode : "b";
        agent.modeMenuOpen = false;
        syncPanel();
        queueMicrotask(() => surface.querySelector?.('[data-agent-action="toggle-mode-menu"]')?.focus?.());
        return true;
      }
      if (action === "select-agent-node-mention") {
        const nodeId = String(target.dataset.nodeId ?? "");
        const reference = listCanvasAgentFileReferences(workbench.ui).find((item) => item.nodeId === nodeId);
        const mention = agent.promptMention;
        if (!reference || !mention?.open) return true;
        const before = agent.promptDraft.slice(0, Number(mention.start));
        const after = agent.promptDraft.slice(Number(mention.end));
        const prefix = before && !/\s$/u.test(before) ? " " : "";
        const suffix = after && !/^\s/u.test(after) ? " " : "";
        agent.promptDraft = `${before}${prefix}${suffix}${after}`;
        agent.promptNodeReferences = [
          ...(Array.isArray(agent.promptNodeReferences) ? agent.promptNodeReferences : []).filter((item) => item.nodeId !== nodeId),
          reference,
        ];
        agent.promptMention = null;
        syncPanel();
        queueMicrotask(() => {
          const input = surface.querySelector?.('[data-agent-field="promptDraft"]');
          input?.focus?.();
          const caret = before.length + prefix.length + suffix.length;
          input?.setSelectionRange?.(caret, caret);
        });
        return true;
      }
      if (action === "remove-agent-node-reference") {
        const nodeId = String(target.dataset.nodeId ?? "");
        agent.promptNodeReferences = (Array.isArray(agent.promptNodeReferences) ? agent.promptNodeReferences : [])
          .filter((reference) => reference.nodeId !== nodeId);
        syncPanel();
        queueMicrotask(() => surface.querySelector?.('[data-agent-field="promptDraft"]')?.focus?.());
        return true;
      }
      if (action === "pick-attachments") {
        surface.querySelector?.("[data-agent-attachment-input]")?.click?.();
        return true;
      }
      if (action === "remove-agent-attachment") {
        const attachmentId = String(target.dataset.attachmentId ?? "");
        await run(action, async () => {
          const attachment = (Array.isArray(agent.promptAttachments) ? agent.promptAttachments : [])
            .find((item) => String(item?.id ?? "") === attachmentId);
          const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
          if (attachment?.fileGrantId && canvasId && agent.conversationId
            && typeof workbench.api?.revokeCanvasAgentFileGrant === "function") {
            await workbench.api.revokeCanvasAgentFileGrant(canvasId, agent.conversationId, attachment.fileGrantId);
          }
          agent.promptAttachments = (Array.isArray(agent.promptAttachments) ? agent.promptAttachments : [])
            .filter((item) => String(item?.id ?? "") !== attachmentId);
        });
        return true;
      }
      if (action === "open-agent-history") {
        agent.historyOpen = !agent.historyOpen;
        if (agent.historyOpen) await loadConversations();
        syncPanel();
        return true;
      }
      if (action === "select-agent-conversation") {
        const conversationId = String(target.dataset.conversationId ?? "");
        if (!conversationId) return true;
        agent.historyOpen = false;
        agent.conversationId = conversationId;
        await loadMessages(conversationId);
        syncPanel();
        return true;
      }
      if (action === "close-agent-panel" || action === "open-agent-panel") {
        agent.panelOpen = action === "open-agent-panel";
        agent.historyOpen = false;
        persistCanvasAgentUiState(workbench.ui, agent);
        void Promise.resolve(workbench.persistCanvasSession?.()).catch(() => undefined);
        if (!syncPanelVisibility()) {
          if (typeof renderLayout === "function") await renderLayout();
          else syncPanel();
        }
        return true;
      }
      if (action === "open-task-center" || action === "open-memory") {
        agent.panelView = action === "open-task-center" ? "tasks" : "memory";
        syncPanel();
        await run(action === "open-task-center" ? "load-agent-history" : "load-agent-memories", action === "open-task-center" ? loadTaskCenter : loadMemories);
        return true;
      }
      if (action === "close-agent-view") {
        agent.panelView = "timeline";
        syncPanel();
        return true;
      }
      if (action === "set-task-filter") {
        agent.taskFilter = target.dataset.taskFilter === "all" ? "all" : "active";
        syncPanel();
        return true;
      }
      if (action === "refresh-agent-history") {
        await run("load-agent-history", loadTaskCenter);
        return true;
      }
      if (action === "refresh-agent-memories") {
        await run("load-agent-memories", loadMemories);
        return true;
      }
      if (action === "edit-agent-memory") {
        const memoryId = String(target.dataset.memoryId ?? "");
        const record = agent.memoryRecords.find((item) => item.id === memoryId);
        if (!record) return true;
        agent.memoryEditingId = memoryId;
        agent.memoryDraftKey = record.key;
        agent.memoryDraftCategory = record.category || "general";
        agent.memoryDraftValue = JSON.stringify(record.value, null, 2);
        syncPanel();
        return true;
      }
      if (action === "cancel-agent-memory-edit") {
        agent.memoryEditingId = "";
        syncPanel();
        return true;
      }
      if (action === "save-agent-memory") {
        await run(action, async () => {
          const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
          const memoryId = String(target.dataset.memoryId ?? agent.memoryEditingId ?? "");
          if (!canvasId || !agent.conversationId || !memoryId || typeof workbench.api?.updateCanvasAgentMemory !== "function") {
            throw new Error("canvas_agent_memory_unavailable");
          }
          let value;
          try {
            value = JSON.parse(String(agent.memoryDraftValue ?? ""));
          } catch {
            throw new Error("记忆内容必须是有效的 JSON 对象。");
          }
          if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("记忆内容必须是 JSON 对象。");
          const key = String(agent.memoryDraftKey ?? "").trim();
          if (!key) throw new Error("记忆键不能为空。");
          const currentRecord = agent.memoryRecords.find((record) => record.id === memoryId);
          await workbench.api.updateCanvasAgentMemory(canvasId, agent.conversationId, memoryId, {
            key,
            value,
            category: String(agent.memoryDraftCategory || "general"),
            status: currentRecord?.status === "revoked" ? "revoked" : "active",
          });
          agent.memoryEditingId = "";
          await loadMemories();
        });
        return true;
      }
      if (action === "toggle-agent-memory") {
        await run(action, async () => {
          const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
          const memoryId = String(target.dataset.memoryId ?? "");
          const record = agent.memoryRecords.find((item) => item.id === memoryId);
          if (!canvasId || !agent.conversationId || !record || typeof workbench.api?.updateCanvasAgentMemory !== "function") {
            throw new Error("canvas_agent_memory_unavailable");
          }
          await workbench.api.updateCanvasAgentMemory(canvasId, agent.conversationId, memoryId, {
            status: record.status === "active" ? "revoked" : "active",
          });
          await loadMemories();
        });
        return true;
      }
      if (action === "delete-agent-memory") {
        if (typeof globalThis.window?.confirm === "function" && !globalThis.window.confirm("确定永久删除这条画布记忆吗？")) return true;
        await run(action, async () => {
          const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
          const memoryId = String(target.dataset.memoryId ?? "");
          if (!canvasId || !agent.conversationId || !memoryId || typeof workbench.api?.deleteCanvasAgentMemory !== "function") {
            throw new Error("canvas_agent_memory_unavailable");
          }
          await workbench.api.deleteCanvasAgentMemory(canvasId, agent.conversationId, memoryId);
          agent.memoryRecords = agent.memoryRecords.filter((record) => record.id !== memoryId);
          if (agent.memoryEditingId === memoryId) agent.memoryEditingId = "";
        });
        return true;
      }
      if (action === "inspect-memories") {
        agent.promptDraft = "请使用 memory.read 读取并整理当前画布已确认的记忆，按约束、决定、偏好和事实分类列出。";
        agent.panelView = "timeline";
        syncPanel();
        return true;
      }
      if (action === "select-agent-task") {
        const taskId = String(target.dataset.taskId ?? "");
        const item = (agent.taskItems ?? []).find((task) => task.taskId === taskId);
        if (!item) return true;
        await run(action, async () => {
          stopPolling();
          agent.conversationId = item.conversationId;
          await loadMessages(item.conversationId);
          agent.taskId = item.taskId;
          agent.status = item.status;
          agent.events = [...item.events];
          agent.sequence = item.events.reduce((max, event) => Math.max(max, Number(event?.sequence ?? 0)), 0);
          agent.panelView = "timeline";
          if (!TERMINAL_STATUSES.has(agent.status)) schedulePoll(0);
        });
        return true;
      }
      if (action === "skip-step") {
        const taskId = String(target.dataset.taskId ?? agent.taskId ?? "");
        const stepId = String(target.dataset.stepId ?? "");
        if (!taskId || !stepId) return true;
        await run(action, async () => {
          const taskStatus = String((agent.taskItems ?? []).find((task) => task.taskId === taskId)?.status ?? (taskId === agent.taskId ? agent.status : ""));
          await control("skip", { stepId, reason: "user_requested" }, taskId);
          const nextTaskStatus = taskStatus === "paused" ? "paused" : "queued";
          if (taskId === agent.taskId) agent.status = nextTaskStatus;
          updateAgentTaskItemStatus(agent, taskId, nextTaskStatus);
          markAgentStepSkipped(agent, taskId, stepId);
          if (taskId === agent.taskId) schedulePoll(0);
        });
        return true;
      }
      if (action === "add-media-to-canvas" || action === "locate-agent-canvas-node") {
        const messageId = String(target.dataset.messageId ?? "");
        const message = (agent.messages ?? []).find((item) => item.id === messageId);
        if (!message) return true;
        const locatedNodeId = resolveAgentMediaCanvasNodeId(workbench.ui?.canvasDocument, message, message.media);
        if (locatedNodeId) {
          const nodeId = locatedNodeId;
          message.canvasNodeId = nodeId;
          workbench.ui.selectedCanvasNodeId = nodeId;
          workbench.ui.canvasEditorOpen = true;
          workbench.onCanvasNodeSelected?.(nodeId);
          const cell = workbench.canvasGraph?.getCellById?.(nodeId);
          if (cell) {
            workbench.canvasGraph.select?.(cell);
            centerAgentCanvasNode(workbench.canvasGraph, cell, surface, workbench.ui?.canvasDocument, nodeId);
          }
          return true;
        }
        const media = message.media;
        if (!media?.url || !["image", "video", "audio"].includes(media.kind)) return true;
        const document = workbench.ui?.canvasDocument;
        if (!document) return true;
        const type = `source-${media.kind}`;
        const position = resolveCanvasNodePlacement(document, { type, position: { x: 220, y: 180 } });
        let nextDocument = addCanvasNode(document, { type, position });
        const nodeId = String(nextDocument.nodes.at(-1)?.id ?? "");
        nextDocument = updateCanvasNodeData(nextDocument, nodeId, {
          ...canvasAssetNodeData({
            id: media.assetVersionId || media.storageObjectId || media.taskId,
            artifactId: media.artifactId,
            storageObjectId: media.storageObjectId,
            assetId: media.assetId,
            assetVersionId: media.assetVersionId,
            kind: media.kind,
            title: media.title || "Agent 生成产物",
            url: media.url,
          }),
          source: "canvas_agent",
          generationTaskId: media.taskId,
          prompt: media.prompt,
        });
        if (typeof workbench.updateCanvasDocument === "function") workbench.updateCanvasDocument(nextDocument);
        else workbench.ui.canvasDocument = nextDocument;
        message.canvasNodeId = nodeId;
        workbench.ui.selectedCanvasNodeId = nodeId;
        workbench.ui.canvasEditorOpen = true;
        await workbench.refreshCanvasSurface?.();
        return true;
      }
      if (action === "new-conversation") {
        stopPolling();
        Object.assign(agent, { conversationId: "", taskId: "", status: "idle", events: [], messages: [], fileGrants: [], memoryRecords: [], promptAttachments: [], sequence: 0, error: "", panelView: "timeline", panelOpen: true, historyOpen: false, titleEditing: false, titleDraft: "" });
        persistCanvasAgentUiState(workbench.ui, agent);
        void Promise.resolve(workbench.persistCanvasSession?.()).catch(() => undefined);
        await run(action, async () => {
          const conversationId = await ensureConversation();
          agent.conversations = [{ id: conversationId, title: "画布协作", status: "active" }, ...(agent.conversations ?? []).filter((item) => item.id !== conversationId)];
        });
        return true;
      }
      if (action === "save-conversation-title") {
        await run(action, async () => {
          const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
          const conversationId = agent.conversationId;
          const conversation = (agent.conversations ?? []).find((item) => item.id === conversationId);
          if (!canvasId || !conversation) throw new Error("canvas_agent_conversation_missing");
          const title = normalizeConversationTitle(agent.titleDraft || conversation.title);
          if (typeof workbench.api?.updateCanvasAgentConversation === "function") {
            const payload = await workbench.api.updateCanvasAgentConversation(canvasId, {
              conversationId,
              title,
            });
            const updated = payload?.conversation ?? { title };
            agent.conversations = (agent.conversations ?? []).map((item) => item.id === conversationId ? { ...item, ...updated } : item);
          } else {
            agent.conversations = (agent.conversations ?? []).map((item) => item.id === conversationId ? { ...item, title } : item);
          }
          if (agent.conversationId === conversationId) {
            agent.titleDraft = title;
            agent.titleEditing = false;
          }
        });
        return true;
      }
      if (action === "grant-selected-file") {
        await run(action, async () => {
          const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
          const selectedFile = resolveSelectedAgentFileReference(workbench.ui);
          if (!canvasId || !agent.conversationId || !selectedFile?.storageObjectId) {
            throw new Error("canvas_agent_file_grant_target_missing");
          }
          if (typeof workbench.api?.createCanvasAgentFileGrant !== "function") {
            throw new Error("canvas_agent_file_grant_unavailable");
          }
          await workbench.api.createCanvasAgentFileGrant(canvasId, agent.conversationId, {
            storageObjectId: selectedFile.storageObjectId,
            purpose: `Canvas Agent reference: ${selectedFile.title}`,
            expiresInSeconds: 3_600,
          });
          await loadFileGrants(agent.conversationId);
        });
        return true;
      }
      if (action === "revoke-file-grant") {
        await run(action, async () => {
          const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
          const grantId = String(target.dataset.grantId ?? "");
          if (!canvasId || !agent.conversationId || !grantId || typeof workbench.api?.revokeCanvasAgentFileGrant !== "function") {
            throw new Error("canvas_agent_file_grant_unavailable");
          }
          await workbench.api.revokeCanvasAgentFileGrant(canvasId, agent.conversationId, grantId);
          agent.fileGrants = agent.fileGrants.filter((grant) => grant.id !== grantId);
        });
        return true;
      }
     if (action === "archive-conversation" || action === "restore-conversation") {
       await run(action, async () => {
         const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
          const conversationId = String(target.dataset.conversationId ?? agent.conversationId);
          if (!canvasId || !conversationId) throw new Error("canvas_agent_conversation_missing");
         const status = action === "archive-conversation" ? "archived" : "active";
         const payload = await workbench.api.updateCanvasAgentConversation(canvasId, {
            conversationId,
           status,
         });
          const updated = payload?.conversation ?? { id: conversationId, status };
         agent.conversations = (agent.conversations ?? []).map((conversation) =>
            conversation.id === conversationId ? { ...conversation, ...updated } : conversation,
         );
       });
        return true;
      }
      if (action === "delete-conversation") {
        await run(action, async () => {
          const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
          const deletedId = String(target.dataset.conversationId ?? agent.conversationId);
          if (!canvasId || !deletedId) throw new Error("canvas_agent_conversation_missing");
          const deletingCurrentConversation = deletedId === agent.conversationId;
          if (deletingCurrentConversation) stopPolling();
          await workbench.api.deleteCanvasAgentConversation(canvasId, deletedId);
          agent.conversations = (agent.conversations ?? []).filter((conversation) => conversation.id !== deletedId);
          if (deletingCurrentConversation) {
            agent.conversationId = String(agent.conversations[0]?.id ?? "");
            await loadMessages(agent.conversationId);
          }
        });
        return true;
      }
      if (action === "toggle-pin-conversation" || action === "rename-conversation") {
        await run(action, async () => {
          const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
          const conversation = (agent.conversations ?? []).find((item) => item.id === agent.conversationId);
          if (!canvasId || !conversation) throw new Error("canvas_agent_conversation_missing");
          const patch = action === "toggle-pin-conversation"
            ? { pinned: !conversation.pinned }
            : (() => {
                const nextTitle = typeof globalThis.window?.prompt === "function"
                  ? globalThis.window.prompt("会话名称", conversation.title || "画布协作")
                  : conversation.title;
                return nextTitle == null ? null : { title: String(nextTitle).trim().slice(0, 200) };
              })();
          if (!patch) return;
          const payload = await workbench.api.updateCanvasAgentConversation(canvasId, {
            conversationId: agent.conversationId,
            ...patch,
          });
          const updated = payload?.conversation ?? patch;
          agent.conversations = (agent.conversations ?? []).map((item) => item.id === agent.conversationId ? { ...item, ...updated } : item);
        });
        return true;
      }
      if (action === "send") {
        if (agent.taskId && !TERMINAL_STATUSES.has(agent.status)) {
          await run("stop", () => control("stop"));
          return true;
        }
        await run(action, async () => {
          const text = String(agent.promptDraft ?? "").trim();
          const modelCode = String(agent.modelCode ?? "").trim();
          if (!text) throw new Error("请输入 Agent 指令。");
          if (
            agent.modelsStatus !== "ready"
            || !agent.models.some((model) => model.modelCode === modelCode)
          ) {
            throw new Error("管理员尚未配置可用文本模型。");
          }
          const conversationId = await ensureConversation();
          const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
          const { references, fileGrantIds, messageNodeReferences } = await prepareAgentMessageNodeReferences(
            canvasId,
            conversationId,
          );
          const payload = await workbench.api.sendCanvasAgentMessage(canvasId, conversationId, {
            modelCode,
            mode: agent.mode,
            message: {
              text,
              ...(references.length ? {
                nodeReferences: messageNodeReferences,
                fileGrantIds,
              } : {}),
              ...(agent.promptAttachments.length ? {
                attachments: agent.promptAttachments.map(serializeAgentAttachment),
                fileGrantIds,
              } : {}),
            },
          });
          const task = payload?.task ?? payload;
          const taskId = String(task?.id ?? task?.taskId ?? "");
          if (!taskId) throw new Error("canvas_agent_task_missing");
          agent.taskId = taskId;
          agent.status = String(task?.status ?? "queued");
          agent.events = [];
          agent.skippedStepIds = [];
          agent.sequence = 0;
          agent.messages = [...agent.messages, {
            role: "user",
            text,
            taskId,
            createdAt: new Date().toISOString(),
            nodeReferences: messageNodeReferences,
            attachments: agent.promptAttachments.map(serializeAgentAttachment),
          }].slice(-200);
          syncCurrentAgentTaskItem(agent, { goal: text, conversationId });
          agent.promptDraft = "";
          agent.promptMention = null;
          agent.promptNodeReferences = [];
          agent.promptAttachments = [];
          schedulePoll(0);
        });
        return true;
      }
      if (["pause", "resume", "stop"].includes(action)) {
        await run(action, () => control(action));
        return true;
      }
      if (action === "replan") {
        await run(action, () => control("replan", { reason: agent.interjectionDraft || "user_requested" }));
        return true;
      }
      if (action === "rewind") {
        agent.rewindConfirmOpen = true;
        if (typeof renderLayout === "function") await renderLayout();
        else syncPanel();
        return true;
      }
      if (action === "cancel-rewind") {
        agent.rewindConfirmOpen = false;
        if (typeof renderLayout === "function") await renderLayout();
        else syncPanel();
        return true;
      }
      if (action === "confirm-rewind") {
        agent.rewindConfirmOpen = false;
        if (typeof renderLayout === "function") await renderLayout();
        else syncPanel();
        await run("rewind", async () => {
          const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
          if (!canvasId || !agent.taskId || typeof workbench.api?.rewindCanvasAgentTask !== "function") {
            throw new Error("canvas_agent_rewind_unavailable");
          }
          await workbench.api.rewindCanvasAgentTask(canvasId, agent.taskId, {});
          await poll();
        });
        return true;
      }
      if (action === "interject" || action === "interject-prompt") {
        await run(action, async () => {
          const fromPrompt = action === "interject-prompt";
          const text = String(fromPrompt ? agent.promptDraft : agent.interjectionDraft ?? "").trim();
          if (!text) throw new Error("请输入插话内容。");
          const canvasId = String(workbench.ui?.selectedCanvasProjectId ?? "");
          const { references, fileGrantIds, messageNodeReferences } = await prepareAgentMessageNodeReferences(
            canvasId,
            agent.conversationId,
          );
          await control("interject", {
            message: {
              text,
              ...(references.length ? { nodeReferences: messageNodeReferences, fileGrantIds } : {}),
              ...(agent.promptAttachments.length ? {
                attachments: agent.promptAttachments.map(serializeAgentAttachment),
                fileGrantIds,
              } : {}),
            },
          });
          agent.messages = [...agent.messages, {
            role: "user",
            text,
            interjection: true,
            nodeReferences: messageNodeReferences,
            attachments: agent.promptAttachments.map(serializeAgentAttachment),
          }].slice(-20);
          if (fromPrompt) {
            agent.promptDraft = "";
            agent.promptMention = null;
            agent.promptNodeReferences = [];
            agent.promptAttachments = [];
          }
          else agent.interjectionDraft = "";
        });
        return true;
      }
      if (action === "approve" || action === "reject") {
        await run(action, () => control("approve", {
          approvalId: String(target.dataset.approvalId ?? ""),
          decision: action === "reject" ? "rejected" : "approved",
        }));
        return true;
      }
      return false;
    },
    async resume() {
      const modelsPromise = loadModels();
      await loadConversations();
      await Promise.all([
        loadMessages(agent.conversationId),
        modelsPromise,
      ]);
      schedulePoll(0);
    },
    dispose() {
      disposed = true;
      stopPolling();
      disposePromptEditor();
      for (const timer of canvasRefreshRetryTimers) clearTimeout(timer);
      canvasRefreshRetryTimers.clear();
    },
  };
  submitPromptFromEditor = () => {
    void controller.handleAction({
      dataset: {
        agentAction: agent.taskId && !TERMINAL_STATUSES.has(agent.status) ? "interject-prompt" : "send",
      },
    });
    return true;
  };
  if (typeof document !== "undefined") queueMicrotask(() => void syncPromptEditor());
  return controller;
}

function buildAgentPromptEditorReference(reference = {}) {
  const mediaKind = String(reference.mediaKind ?? (reference.storageObjectId ? "image" : "node")).trim().toLowerCase();
  return {
    id: String(reference.nodeId ?? ""),
    assetId: String(reference.nodeId ?? ""),
    assetKind: mediaKind,
    description: `${mediaKind === "video" ? "视频" : mediaKind === "audio" ? "音频" : "图片"}节点`,
    label: String(reference.title ?? "画布节点"),
    name: String(reference.title ?? "画布节点"),
    preview: mediaKind === "video"
      ? String(reference.posterUrl ?? "")
      : String(reference.previewUrl ?? ""),
    referenceId: String(reference.nodeId ?? ""),
    source: mediaKind === "video" ? String(reference.previewUrl ?? "") : "",
  };
}

function mergeAgentPromptReferenceTokens(prompt, references = []) {
  let value = String(prompt ?? "");
  const missingTokens = references
    .map((reference) => `【@${String(reference.title ?? "画布节点").trim()}】`)
    .filter((token) => !value.includes(token));
  if (!missingTokens.length) return value;
  return `${missingTokens.join(" ")}${value ? ` ${value}` : ""}`;
}

function isSelectedAgentConversationArchived(agent = {}) {
  return Boolean((agent.conversations ?? []).find((conversation) => conversation.id === agent.conversationId)?.archivedAt);
}

const ACTIVE_AGENT_TASK_STATUSES = new Set([
  "queued", "running", "waiting_approval", "waiting_external", "paused", "cancel_requested",
]);
const SKIPPABLE_AGENT_TASK_STATUSES = new Set(["queued", "waiting_approval", "paused"]);

function countActiveAgentTasks(agent) {
  const ids = new Set();
  for (const task of Array.isArray(agent.taskItems) ? agent.taskItems : []) {
    if (ACTIVE_AGENT_TASK_STATUSES.has(task.status)) ids.add(task.taskId);
  }
  for (const conversation of Array.isArray(agent.conversations) ? agent.conversations : []) {
    if (conversation?.taskId && ACTIVE_AGENT_TASK_STATUSES.has(String(conversation.taskStatus ?? "queued"))) {
      ids.add(String(conversation.taskId));
    }
  }
  if (agent.taskId && ACTIVE_AGENT_TASK_STATUSES.has(agent.status)) ids.add(agent.taskId);
  return ids.size;
}

function renderAgentTaskCenter(agent, busy) {
  const filter = agent.taskFilter === "all" ? "all" : "active";
  const items = (Array.isArray(agent.taskItems) ? agent.taskItems : [])
    .filter((task) => filter === "all" || ACTIVE_AGENT_TASK_STATUSES.has(task.status));
  const activeCount = countActiveAgentTasks(agent);
  const loading = agent.taskCenterStatus === "loading" || agent.busyAction === "load-agent-history";
  return `<section class="canvas-agent-special-view canvas-agent-task-center" aria-label="Agent 任务中心">
    <header class="canvas-agent-special-head">
      <span><strong>任务中心</strong><small>${activeCount} 进行中</small></span>
      <div class="canvas-agent-task-filter" role="tablist" aria-label="任务范围">
        <button type="button" role="tab" aria-selected="${filter === "active"}" class="${filter === "active" ? "active" : ""}" data-agent-action="set-task-filter" data-task-filter="active">进行中</button>
        <button type="button" role="tab" aria-selected="${filter === "all"}" class="${filter === "all" ? "active" : ""}" data-agent-action="set-task-filter" data-task-filter="all">全部</button>
      </div>
      <button type="button" class="canvas-agent-close-view" data-agent-action="close-agent-view" aria-label="关闭任务中心" title="关闭">×</button>
    </header>
    <div class="canvas-agent-special-content">
      ${loading && !items.length ? renderAgentSpecialEmpty("正在同步任务", "读取已持久化的会话、消息和任务事件。") : ""}
      ${!loading && !items.length ? renderAgentSpecialEmpty(filter === "active" ? "暂无进行中的任务" : "暂无任务记录", "发送 Agent 指令后，任务会在这里汇总。") : ""}
      ${items.map((task) => renderAgentTaskCenterItem(task, busy)).join("")}
      ${agent.taskCenterError ? `<p class="canvas-agent-error" role="alert">${escapeHtml(agent.taskCenterError)}</p>` : ""}
    </div>
    <footer class="canvas-agent-special-footer">
      <button type="button" data-agent-action="refresh-agent-history" ${busy ? "disabled" : ""}>刷新</button>
    </footer>
  </section>`;
}

function renderAgentTaskCenterItem(task, busy) {
  const steps = Array.isArray(task.steps) ? task.steps : [];
  const activeStep = [...steps].reverse().find((step) => isSkippableAgentStep(step));
  const completed = steps.filter((step) => ["succeeded", "failed", "canceled", "skipped"].includes(step.status)).length;
  return `<article class="canvas-agent-task-item" data-task-status="${escapeAttr(task.status)}">
    <header>
      <div>
        <strong>${escapeHtml(task.goal || "Agent 任务")}</strong>
        <span>${escapeHtml(task.conversationTitle || "画布协作")}</span>
      </div>
      <span class="canvas-agent-task-state">${escapeHtml(agentStatusText(task.status))}</span>
    </header>
    ${steps.length ? `<div class="canvas-agent-task-progress"><span>${completed}/${steps.length} 步</span><i style="--task-progress:${Math.round((completed / steps.length) * 100)}%"></i></div>` : ""}
    ${steps.length ? `<ol class="canvas-agent-step-list">${steps.slice(-8).map((step) => `<li data-step-status="${escapeAttr(step.status)}"><i aria-hidden="true"></i><span><strong>${escapeHtml(step.toolId || agentEventLabel(`step.${step.status}`))}</strong><small>${escapeHtml(agentStepStatusText(step.status))}</small></span></li>`).join("")}</ol>` : ""}
    <footer>
      ${activeStep && SKIPPABLE_AGENT_TASK_STATUSES.has(task.status) ? `<button type="button" data-agent-action="skip-step" data-task-id="${escapeAttr(task.taskId)}" data-step-id="${escapeAttr(activeStep.stepId)}" ${busy ? "disabled" : ""}>跳过此步</button>` : ""}
      <button type="button" data-agent-action="select-agent-task" data-task-id="${escapeAttr(task.taskId)}" ${busy ? "disabled" : ""}>打开任务</button>
    </footer>
  </article>`;
}

function renderAgentMemoryPanel(agent, busy) {
  const records = Array.isArray(agent.memoryRecords) ? agent.memoryRecords : [];
  const categoryFilter = String(agent.memoryCategoryFilter ?? "");
  const sourceFilter = String(agent.memorySourceFilter ?? "");
  const visibleRecords = records.filter((record) =>
    (!categoryFilter || record.category === categoryFilter)
    && (!sourceFilter || record.source === sourceFilter),
  );
  const categories = [...new Set(records.map((record) => record.category).filter(Boolean))].sort();
  const sources = [...new Set(records.map((record) => record.source).filter(Boolean))].sort();
  const loading = agent.memoryRecordsStatus === "loading" || agent.busyAction === "load-agent-memories";
  return `<section class="canvas-agent-special-view canvas-agent-memory" aria-label="画布记忆">
    <header class="canvas-agent-special-head">
      <span><strong>画布记忆</strong><small>${visibleRecords.length === records.length ? `${records.length} 条记录` : `${visibleRecords.length}/${records.length} 条记录`}</small></span>
      <button type="button" class="canvas-agent-close-view" data-agent-action="close-agent-view" aria-label="关闭画布记忆" title="关闭">×</button>
    </header>
    <div class="canvas-agent-memory-filters" aria-label="记忆筛选">
      <label><span>分类</span><select data-agent-field="memoryCategoryFilter">
        <option value="">全部分类</option>
        ${categories.map((category) => `<option value="${escapeAttr(category)}" ${category === categoryFilter ? "selected" : ""}>${escapeHtml(agentMemoryCategoryLabel(category))}</option>`).join("")}
      </select></label>
      <label><span>来源</span><select data-agent-field="memorySourceFilter">
        <option value="">全部来源</option>
        ${sources.map((source) => `<option value="${escapeAttr(source)}" ${source === sourceFilter ? "selected" : ""}>${escapeHtml(agentMemorySourceLabel(source))}</option>`).join("")}
      </select></label>
    </div>
    <div class="canvas-agent-special-content">
      ${loading && !records.length ? renderAgentSpecialEmpty("正在同步记忆", "读取当前会话已持久化的画布记忆。") : ""}
      ${!loading && agent.memoryRecordsStatus === "ready" && !records.length ? renderAgentSpecialEmpty("还没有画布记忆", "经确认保存的记忆会出现在这里。") : ""}
      ${!loading && records.length && !visibleRecords.length ? renderAgentSpecialEmpty("没有匹配的记忆", "调整分类或来源筛选条件。") : ""}
      ${visibleRecords.map((record) => renderAgentMemoryRecord(record, agent, busy)).join("")}
      ${agent.memoryRecordsError ? `<p class="canvas-agent-error" role="alert">${escapeHtml(agent.memoryRecordsError)}</p>` : ""}
    </div>
    <footer class="canvas-agent-special-footer">
      <button type="button" data-agent-action="refresh-agent-memories" ${busy ? "disabled" : ""}>刷新</button>
    </footer>
  </section>`;
}

function renderAgentMemoryRecord(record, agent, busy) {
  const editing = agent.memoryEditingId === record.id;
  if (editing) {
    return `<article class="canvas-agent-memory-item is-editing" data-memory-id="${escapeAttr(record.id)}">
      <label><span>记忆键</span><input type="text" data-agent-field="memoryDraftKey" value="${escapeAttr(agent.memoryDraftKey)}" maxlength="120" /></label>
      <label><span>分类</span><select data-agent-field="memoryDraftCategory">${renderAgentMemoryCategoryOptions(agent.memoryDraftCategory)}</select></label>
      <label><span>内容 JSON</span><textarea data-agent-field="memoryDraftValue" rows="7">${escapeHtml(agent.memoryDraftValue)}</textarea></label>
      <small>来源 ${escapeHtml(agentMemorySourceLabel(record.source))} · ${escapeHtml(formatAgentActivityTime(record.updatedAt))}</small>
      <footer>
        <button type="button" data-agent-action="cancel-agent-memory-edit" ${busy ? "disabled" : ""}>取消</button>
        <button type="button" data-agent-action="save-agent-memory" data-memory-id="${escapeAttr(record.id)}" ${busy ? "disabled" : ""}>保存</button>
      </footer>
    </article>`;
  }
  return `<article class="canvas-agent-memory-item ${record.status === "active" ? "" : "is-inactive"}" data-memory-id="${escapeAttr(record.id)}">
    <header>
      <div><strong>${escapeHtml(record.key)}</strong><span>${escapeHtml(agentMemoryCategoryLabel(record.category))}</span></div>
      <span>${record.status === "active" ? "已启用" : "已停用"}</span>
    </header>
    <pre>${escapeHtml(formatAgentMemoryValue(record.value))}</pre>
    <small>${escapeHtml(agentMemorySourceLabel(record.source))} · ${escapeHtml(formatAgentActivityTime(record.updatedAt))}</small>
    <footer>
      <button type="button" data-agent-action="edit-agent-memory" data-memory-id="${escapeAttr(record.id)}" ${busy ? "disabled" : ""}>编辑</button>
      <button type="button" data-agent-action="toggle-agent-memory" data-memory-id="${escapeAttr(record.id)}" ${busy ? "disabled" : ""}>${record.status === "active" ? "停用" : "启用"}</button>
      <button type="button" class="danger" data-agent-action="delete-agent-memory" data-memory-id="${escapeAttr(record.id)}" ${busy ? "disabled" : ""}>删除</button>
    </footer>
  </article>`;
}

function renderAgentMemoryCategoryOptions(selected) {
  const options = ["general", "constraint", "decision", "preference", "fact", "other"];
  if (selected && !options.includes(selected)) options.push(selected);
  return options.map((category) => `<option value="${escapeAttr(category)}" ${category === selected ? "selected" : ""}>${escapeHtml(agentMemoryCategoryLabel(category))}</option>`).join("");
}

function renderAgentSpecialEmpty(title, detail) {
  return `<div class="canvas-agent-special-empty"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></div>`;
}

function renderAgentSkipStepButton(agent, busy) {
  const step = resolveCurrentAgentStep(agent.events, agent.skippedStepIds);
  if (!step) return "";
  return `<button type="button" data-agent-action="skip-step" data-task-id="${escapeAttr(agent.taskId)}" data-step-id="${escapeAttr(step.stepId)}" ${busy ? "disabled" : ""}>跳过此步</button>`;
}

export function resolveAgentContextUsage(agent = {}) {
  const model = (Array.isArray(agent.models) ? agent.models : []).find((item) => item.modelCode === agent.modelCode);
  const capabilities = model?.capabilities && typeof model.capabilities === "object" ? model.capabilities : {};
  const declaredWindow = Number(capabilities.contextWindow ?? capabilities.context_window ?? 0);
  const contextWindow = Number.isFinite(declaredWindow) && declaredWindow > 0 ? Math.trunc(declaredWindow) : 32_000;
  const declaredOutput = Number(capabilities.maxOutputTokens ?? capabilities.outputBudget ?? capabilities.max_tokens ?? 0);
  const outputBudget = Number.isFinite(declaredOutput) && declaredOutput > 0
    ? Math.min(Math.trunc(declaredOutput), Math.max(1_024, contextWindow - 1_024))
    : Math.min(4_096, Math.max(1_024, Math.floor(contextWindow / 8)));
  const inputBudget = Math.max(1_024, contextWindow - outputBudget);
  let estimatedTokens = 1_200;
  for (const message of Array.isArray(agent.messages) ? agent.messages : []) {
    if (!message?.text || !["user", "assistant"].includes(message.role)) continue;
    estimatedTokens += 8 + estimateAgentTextTokens(message.text);
  }
  const ratio = estimatedTokens / inputBudget;
  return {
    estimatedTokens,
    contextWindow,
    inputBudget,
    ratio,
    source: declaredWindow > 0 ? "declared" : "default",
  };
}

function renderAgentContextUsage(agent) {
  if (!agent.conversationId) return "";
  const usage = resolveAgentContextUsage(agent);
  const percent = Math.max(0, Math.round(usage.ratio * 100));
  const angle = Math.round(Math.min(1, Math.max(0, usage.ratio)) * 360);
  const tone = usage.ratio >= 0.9 ? "danger" : usage.ratio >= 0.75 ? "warning" : "normal";
  const source = usage.source === "declared" ? "模型配置声明" : "保守默认值";
  const title = `上下文占用（估算）：约 ${usage.estimatedTokens.toLocaleString()} token；输入预算 ${usage.inputBudget.toLocaleString()} token；上下文窗口 ${usage.contextWindow.toLocaleString()} token（${source}）`;
  return `<span class="canvas-agent-context-usage ${tone}" style="--context-angle:${angle}deg" role="img" aria-label="上下文占用约 ${percent}%" title="${escapeAttr(title)}"><i aria-hidden="true"></i><small>${percent}%</small></span>`;
}

function estimateAgentTextTokens(value) {
  const text = String(value ?? "");
  const cjk = text.match(/[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/g)?.length ?? 0;
  return Math.ceil(cjk + (text.length - cjk) / 4);
}

function collectAgentTaskSeeds(histories, agent) {
  const seeds = new Map();
  const ensureSeed = (taskId, conversation, patch = {}) => {
    const id = String(taskId ?? "");
    if (!id) return null;
    const previous = seeds.get(id) ?? {
      taskId: id,
      conversationId: String(conversation?.id ?? patch.conversationId ?? ""),
      conversationTitle: String(conversation?.title ?? patch.conversationTitle ?? "画布协作"),
      taskStatus: String(conversation?.taskId === id ? conversation.taskStatus ?? "" : patch.taskStatus ?? ""),
      goal: "",
      messages: [],
      updatedAt: parseAgentActivityTime(conversation?.updatedAt),
    };
    Object.assign(previous, patch);
    seeds.set(id, previous);
    return previous;
  };
  for (const history of histories) {
    const conversation = history.conversation;
    if (conversation?.taskId) ensureSeed(conversation.taskId, conversation);
    for (const message of history.messages) {
      if (!message.taskId) continue;
      const seed = ensureSeed(message.taskId, conversation);
      seed.messages.push(message);
      if (!seed.goal && message.role === "user") seed.goal = message.text;
      seed.updatedAt = Math.max(seed.updatedAt, parseAgentActivityTime(message.createdAt));
    }
  }
  for (const task of Array.isArray(agent.taskItems) ? agent.taskItems : []) {
    if (!seeds.has(task.taskId)) ensureSeed(task.taskId, null, task);
  }
  if (agent.taskId) {
    const conversation = (agent.conversations ?? []).find((item) => item.id === agent.conversationId);
    const seed = ensureSeed(agent.taskId, conversation, { taskStatus: agent.status, conversationId: agent.conversationId });
    if (!seed.goal) seed.goal = [...(agent.messages ?? [])].reverse().find((message) => message.role === "user")?.text ?? "";
    seed.messages = agent.messages.filter((message) => !message.taskId || message.taskId === agent.taskId);
  }
  return seeds;
}

function buildAgentTaskItem(seed, events) {
  const normalizedEvents = [...events].sort((left, right) => Number(left?.sequence ?? 0) - Number(right?.sequence ?? 0));
  let status = String(seed.taskStatus ?? "");
  for (const event of normalizedEvents) status = statusFromEvent(event) || status;
  if (!status && seed.messages.some((message) => message.role === "assistant")) status = "succeeded";
  if (!status) status = "unknown";
  const updatedAt = normalizedEvents.reduce((latest, event) => Math.max(latest, parseAgentActivityTime(event?.createdAt)), seed.updatedAt || 0);
  return {
    taskId: seed.taskId,
    conversationId: seed.conversationId,
    conversationTitle: seed.conversationTitle,
    goal: seed.goal || seed.conversationTitle,
    status,
    updatedAt,
    events: normalizedEvents,
    steps: normalizeAgentSteps(normalizedEvents),
  };
}

function normalizeAgentSteps(events = []) {
  const steps = new Map();
  for (const record of events) {
    const event = record?.event && typeof record.event === "object" ? record.event : {};
    const stepId = String(event.stepId ?? "");
    if (!stepId) continue;
    const previous = steps.get(stepId) ?? { stepId, toolId: "", effect: "", status: "created", sequence: Number(record.sequence ?? 0) };
    if (event.toolId) previous.toolId = String(event.toolId);
    if (event.effect) previous.effect = String(event.effect);
    const eventType = String(record.eventType ?? "");
    if (eventType.startsWith("step.")) previous.status = eventType.slice(5);
    if (eventType === "approval.requested") previous.status = "waiting_approval";
    if (eventType === "approval.rejected") previous.status = "canceled";
    previous.sequence = Math.max(previous.sequence, Number(record.sequence ?? 0));
    steps.set(stepId, previous);
  }
  return [...steps.values()].sort((left, right) => left.sequence - right.sequence);
}

function resolveCurrentAgentStep(events = [], skippedStepIds = []) {
  const skipped = new Set(Array.isArray(skippedStepIds) ? skippedStepIds : []);
  return [...normalizeAgentSteps(events)].reverse().find((step) => isSkippableAgentStep(step) && !skipped.has(step.stepId)) ?? null;
}

function isSkippableAgentStep(step) {
  return ["created", "waiting_approval"].includes(String(step?.status ?? ""));
}

function syncCurrentAgentTaskItem(agent, patch = {}) {
  const taskId = String(agent.taskId ?? "");
  if (!taskId) return;
  const items = Array.isArray(agent.taskItems) ? agent.taskItems : [];
  const previous = items.find((item) => item.taskId === taskId);
  const conversation = (agent.conversations ?? []).find((item) => item.id === (patch.conversationId ?? agent.conversationId));
  const next = {
    taskId,
    conversationId: String(patch.conversationId ?? previous?.conversationId ?? agent.conversationId ?? ""),
    conversationTitle: String(previous?.conversationTitle ?? conversation?.title ?? "画布协作"),
    goal: String(patch.goal ?? previous?.goal ?? [...(agent.messages ?? [])].reverse().find((message) => message.role === "user")?.text ?? "Agent 任务"),
    status: String(agent.status ?? previous?.status ?? "queued"),
    updatedAt: Date.now(),
    events: [...(agent.events ?? [])],
    steps: normalizeAgentSteps(agent.events),
  };
  agent.taskItems = [next, ...items.filter((item) => item.taskId !== taskId)];
}

function updateAgentTaskItemStatus(agent, taskId, status) {
  agent.taskItems = (Array.isArray(agent.taskItems) ? agent.taskItems : []).map((item) =>
    item.taskId === taskId ? { ...item, status, updatedAt: Date.now() } : item,
  );
}

function markAgentStepSkipped(agent, taskId, stepId) {
  if (!agent.skippedStepIds.includes(stepId)) agent.skippedStepIds = [...agent.skippedStepIds, stepId];
  agent.taskItems = (Array.isArray(agent.taskItems) ? agent.taskItems : []).map((item) => item.taskId === taskId ? {
    ...item,
    status: "queued",
    updatedAt: Date.now(),
    steps: item.steps.map((step) => step.stepId === stepId ? { ...step, status: "skipped" } : step),
  } : item);
}

function collectAgentMemoryEvents(taskItems = [], currentEvents = []) {
  const records = [...taskItems.flatMap((task) => task.events ?? []), ...(Array.isArray(currentEvents) ? currentEvents : [])];
  const seen = new Set();
  return records.flatMap((record) => {
    const id = String(record?.id ?? `${record?.taskId ?? ""}:${record?.sequence ?? ""}`);
    if (!id || seen.has(id) || agentEventKind(record) !== "memory") return [];
    seen.add(id);
    const event = record?.event && typeof record.event === "object" ? record.event : {};
    return [{
      id,
      taskId: String(record?.taskId ?? ""),
      eventType: String(record?.eventType ?? ""),
      toolId: String(event.toolId ?? (event.effect === "memory_write" ? "memory.write" : "")),
      summary: agentEventSummary(record),
      createdAt: record?.createdAt,
    }];
  }).sort((left, right) => parseAgentActivityTime(right.createdAt) - parseAgentActivityTime(left.createdAt));
}

export function normalizeAgentMemoryRecord(record = {}) {
  const value = record.value && typeof record.value === "object" && !Array.isArray(record.value)
    ? record.value
    : record.valueJson && typeof record.valueJson === "object" && !Array.isArray(record.valueJson)
      ? record.valueJson
      : {};
  const key = String(record.key ?? record.memoryKey ?? "").trim();
  const category = String(record.category ?? value.category ?? inferAgentMemoryCategory(key) ?? "other").trim().toLowerCase();
  const source = String(
    record.source ?? value.source ?? (record.sourceTaskId || record.sourceStepId ? "agent_task" : "manual"),
  ).trim().toLowerCase();
  return {
    id: String(record.id ?? ""),
    key,
    value,
    category: category || "other",
    source: source || "manual",
    status: String(record.status ?? "active").toLowerCase() === "active" ? "active" : "revoked",
    sourceTaskId: String(record.sourceTaskId ?? ""),
    sourceStepId: String(record.sourceStepId ?? ""),
    updatedAt: String(record.updatedAt ?? record.createdAt ?? ""),
  };
}

function inferAgentMemoryCategory(key) {
  const prefix = String(key ?? "").split(/[.:-]/, 1)[0]?.toLowerCase();
  return {
    constraint: "constraint", constraints: "constraint",
    decision: "decision", decisions: "decision",
    preference: "preference", preferences: "preference",
    fact: "fact", facts: "fact",
  }[prefix] ?? "";
}

function agentMemoryCategoryLabel(category) {
  return {
    general: "通用", constraint: "约束", decision: "决定", preference: "偏好", fact: "事实", other: "其他",
  }[category] ?? (category || "其他");
}

function agentMemorySourceLabel(source) {
  return {
    agent_step: "Agent 步骤", agent_task: "Agent 任务", task: "Agent 任务", user: "用户确认", manual: "手动记录",
    import: "导入", provider: "Provider", tool: "工具",
  }[source] ?? (source || "未知来源");
}

function formatAgentMemoryValue(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function agentStatusText(status) {
  return {
    idle: "未开始", queued: "排队中", running: "执行中", waiting_approval: "等待审批",
    waiting_external: "等待生成", paused: "已暂停", succeeded: "已完成", completed: "已完成", success: "已完成", done: "已完成", finished: "已完成", failed: "失败",
    cancel_requested: "停止中", canceled: "已停止", result_unknown: "结果待确认",
    manual_review_required: "需要复核", unknown: "记录已结束",
  }[status] ?? String(status ?? "未知");
}

function agentStepStatusText(status) {
  return {
    created: "等待", running: "执行中", waiting_approval: "待确认", waiting_external: "等待外部结果",
    succeeded: "完成", failed: "失败", canceled: "已停止", skipped: "已跳过",
  }[status] ?? String(status ?? "未知");
}

function agentMemoryStatusText(eventType) {
  if (eventType === "approval.requested") return "待确认";
  if (eventType === "approval.approved") return "已确认";
  if (eventType === "approval.rejected") return "已拒绝";
  if (eventType === "step.succeeded") return "已保存";
  if (eventType === "step.failed") return "失败";
  return "记忆活动";
}

function parseAgentActivityTime(value) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatAgentActivityTime(value) {
  const timestamp = parseAgentActivityTime(value);
  if (!timestamp) return "时间未知";
  return new Date(timestamp).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function renderAgentFileGrants(agent, selectedFile, busy) {
  const grants = Array.isArray(agent.fileGrants) ? agent.fileGrants : [];
  const canGrant = Boolean(selectedFile?.storageObjectId) && agent.fileGrantsStatus !== "loading";
  return `<section class="canvas-agent-file-grants" aria-label="会话文件授权">
    <header>
      <span><strong>会话文件</strong><small>${grants.length}</small></span>
      <button type="button" data-agent-action="grant-selected-file" ${busy || !canGrant ? "disabled" : ""} title="授权后可在 Agent 请求中用作图像或视频参考">授权所选</button>
    </header>
    ${grants.length ? `<ul>${grants.map((grant) => `<li>
      <span><strong>${escapeHtml(grant.purpose || "画布文件")}</strong><small>${escapeHtml(formatAgentGrantExpiry(grant.expiresAt))}</small></span>
      <button type="button" data-agent-action="revoke-file-grant" data-grant-id="${escapeAttr(grant.id)}" ${busy ? "disabled" : ""} aria-label="撤销文件授权">撤销</button>
    </li>`).join("")}</ul>` : `<p>${selectedFile ? `当前所选：${escapeHtml(selectedFile.title)}` : "选择包含已存储文件的节点后可授权"}</p>`}
  </section>`;
}

function renderAgentPromptMentionMenu(agent, ui) {
  const mention = agent.promptMention;
  if (!mention?.open) return "";
  const query = String(mention.query ?? "").trim().toLocaleLowerCase();
  const items = listCanvasAgentFileReferences(ui)
    .filter((item) => !query || [item.title, item.mediaKind, item.nodeId].some((value) => String(value ?? "").toLocaleLowerCase().includes(query)))
    .slice(0, 12);
  const content = items.length
    ? items.map((item) => `<button type="button" class="canvas-agent-mention-option" data-agent-action="select-agent-node-mention" data-node-id="${escapeAttr(item.nodeId)}">
        <span class="canvas-agent-mention-thumb">${renderAgentMentionPreview(item)}</span>
        <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.mediaKind || "节点")}</small></span>
      </button>`).join("")
    : `<p class="canvas-agent-mention-status">${query ? "没有匹配的已存储节点" : "暂无可引用的已存储节点"}</p>`;
  return `<div class="canvas-agent-mention-menu" role="listbox" aria-label="可引用节点">${content}</div>`;
}

function renderAgentPromptReferenceChips(agent) {
  const references = Array.isArray(agent.promptNodeReferences) ? agent.promptNodeReferences : [];
  if (!references.length) return "";
  return `<div class="canvas-agent-reference-chips" aria-label="已引入节点">
    ${references.map((reference) => `<span class="canvas-agent-reference-chip">
      <span class="canvas-agent-reference-thumb">${renderAgentMentionPreview(reference)}</span>
      <strong>${escapeHtml(reference.title || "画布节点")}</strong>
      <button type="button" data-agent-action="remove-agent-node-reference" data-node-id="${escapeAttr(reference.nodeId)}" aria-label="移除 ${escapeAttr(reference.title || "画布节点")}" title="移除引用">×</button>
    </span>`).join("")}
  </div>`;
}

function renderAgentPromptAttachmentChips(agent) {
  const attachments = Array.isArray(agent.promptAttachments) ? agent.promptAttachments : [];
  if (!attachments.length) return "";
  return `<div class="canvas-agent-attachment-chips" aria-label="已添加附件">
    ${attachments.map((attachment) => `<span class="canvas-agent-attachment-chip" data-attachment-kind="${escapeAttr(attachment.kind)}">
      <span class="canvas-agent-attachment-thumb">${renderAgentAttachmentPreview(attachment)}</span>
      <span><strong>${escapeHtml(attachment.name || "附件")}</strong><small>${escapeHtml(formatAgentAttachmentMeta(attachment))}</small></span>
      <button type="button" data-agent-action="remove-agent-attachment" data-attachment-id="${escapeAttr(attachment.id)}" aria-label="移除 ${escapeAttr(attachment.name || "附件")}" title="移除附件">×</button>
    </span>`).join("")}
  </div>`;
}

function renderAgentAttachmentPreview(attachment = {}) {
  if (attachment.kind === "image" && attachment.previewUrl) {
    return `<img src="${escapeAttr(attachment.previewUrl)}" alt="" loading="lazy" />`;
  }
  if (attachment.kind === "video") return '<b aria-hidden="true">VID</b>';
  return `<b aria-hidden="true">${escapeHtml(agentAttachmentKindLabel(attachment.kind))}</b>`;
}

function renderAgentAttachmentIcon(name) {
  if (name === "add") {
    return '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /><path d="M19 16.5a4.5 4.5 0 0 1-7.7 3.2l-6.4-6.4a6 6 0 0 1 8.5-8.5l6.1 6.1a3.75 3.75 0 0 1-5.3 5.3l-5.7-5.7a1.5 1.5 0 0 1 2.1-2.1l5.3 5.3" /></svg>';
  }
  return "";
}

function resolveAgentAttachmentKind(file = {}) {
  const type = String(file.type ?? "").toLowerCase();
  const name = String(file.name ?? "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("text/") || [".txt", ".md", ".markdown", ".csv", ".json", ".docx", ".pdf"].some((extension) => name.endsWith(extension))) return "document";
  return "";
}

function serializeAgentAttachment(attachment = {}) {
  return {
    fileGrantId: String(attachment.fileGrantId ?? "").trim(),
    name: String(attachment.name ?? "附件").trim().slice(0, 160),
    contentType: String(attachment.contentType ?? "application/octet-stream").trim().toLowerCase(),
    sizeBytes: Math.max(0, Number(attachment.sizeBytes ?? 0) || 0),
    kind: ["image", "video", "document"].includes(attachment.kind) ? attachment.kind : "document",
  };
}

function agentAttachmentKindLabel(kind) {
  return kind === "video" ? "VID" : kind === "image" ? "IMG" : "DOC";
}

function formatAgentAttachmentMeta(attachment = {}) {
  const size = Number(attachment.sizeBytes ?? 0);
  const sizeLabel = size > 1024 * 1024
    ? `${(size / (1024 * 1024)).toFixed(1)} MB`
    : size > 1024 ? `${Math.ceil(size / 1024)} KB`
      : size ? `${size} B` : "";
  return [agentAttachmentKindLabel(attachment.kind), sizeLabel].filter(Boolean).join(" · ");
}

function renderAgentMentionPreview(item = {}) {
  const mediaKind = String(item.mediaKind ?? "").trim().toLowerCase();
  if (mediaKind === "video") {
    return item.previewUrl
      ? `<video src="${escapeAttr(item.previewUrl)}"${item.posterUrl ? ` poster="${escapeAttr(item.posterUrl)}"` : ""} muted playsinline preload="metadata" aria-hidden="true"></video>`
      : '<b aria-hidden="true">VID</b>';
  }
  return item.previewUrl ? `<img src="${escapeAttr(item.previewUrl)}" alt="" />` : "@";
}

function listCanvasAgentFileReferences(ui = {}) {
  return (Array.isArray(ui.canvasDocument?.nodes) ? ui.canvasDocument.nodes : [])
    .map((node) => {
      const file = resolveCanvasNodeFileReference(ui, node);
      if (!file) return null;
      const data = node.data && typeof node.data === "object" ? node.data : {};
      const rawMediaKind = String(data.mediaKind ?? node.type ?? "").trim().toLowerCase();
      const mediaKind = rawMediaKind.includes("video")
        ? "video"
        : rawMediaKind.includes("audio") ? "audio" : "image";
      const assets = [ui.canvasAssets, ui.canvasAssetProjectAssets, ui.canvasLibraryAssets]
        .flatMap((items) => Array.isArray(items) ? items : []);
      return {
        ...file,
        nodeId: String(node.id ?? ""),
        mediaKind,
        previewUrl: String(
          resolveCanvasMediaNodeSource(node, mediaKind, { assets })
          || `/api/storage/objects/${encodeURIComponent(file.storageObjectId)}/content?proxy=1`,
        ).trim(),
        posterUrl: mediaKind === "video"
          ? String(data.thumbnailUrl ?? data.posterUrl ?? "").trim()
          : "",
      };
    })
    .filter(Boolean);
}

function listCanvasAgentNodeReferences(ui = {}) {
  return (Array.isArray(ui.canvasDocument?.nodes) ? ui.canvasDocument.nodes : [])
    .map((node) => {
      const data = node?.data && typeof node.data === "object" ? node.data : {};
      const file = resolveCanvasNodeFileReference(ui, node);
      const rawKind = String(data.mediaKind ?? node?.type ?? "node").trim().toLowerCase();
      const mediaKind = rawKind.includes("video")
        ? "video"
        : rawKind.includes("audio")
          ? "audio"
          : rawKind.includes("image")
            ? "image"
            : rawKind.includes("text") || rawKind.includes("markdown")
              ? "text"
              : rawKind.includes("director")
                ? "director"
                : rawKind.includes("storyboard") ? "storyboard" : "node";
      const assets = [ui.canvasAssets, ui.canvasAssetProjectAssets, ui.canvasLibraryAssets]
        .flatMap((items) => Array.isArray(items) ? items : []);
      const previewUrl = ["image", "video", "audio"].includes(mediaKind)
        ? String(
            resolveCanvasMediaNodeSource(node, mediaKind, { assets })
            || (file?.storageObjectId
              ? `/api/storage/objects/${encodeURIComponent(file.storageObjectId)}/content?proxy=1`
              : ""),
          ).trim()
        : "";
      return {
        ...(file ?? {}),
        nodeId: String(node?.id ?? ""),
        title: String(data.title ?? data.label ?? data.name ?? node?.title ?? node?.type ?? "画布节点").trim().slice(0, 120),
        mediaKind,
        previewUrl,
        posterUrl: mediaKind === "video"
          ? String(data.thumbnailUrl ?? data.posterUrl ?? "").trim()
          : "",
      };
    })
    .filter((reference) => reference.nodeId);
}

function resolveAgentPromptMentionQuery(value, selectionStart) {
  const text = String(value ?? "");
  const cursor = Math.max(0, Math.min(text.length, Number(selectionStart ?? text.length)));
  const triggerStart = text.lastIndexOf("@", cursor - 1);
  if (triggerStart < 0) return null;
  const query = text.slice(triggerStart + 1, cursor);
  if (/[@\s:]/u.test(query)) return null;
  return { start: triggerStart, end: cursor, query };
}

function resolveCanvasNodeFileReference(ui, node) {
  const data = node?.data && typeof node.data === "object" ? node.data : {};
  const assets = [ui.canvasAssets, ui.canvasAssetProjectAssets, ui.canvasLibraryAssets]
    .flatMap((items) => Array.isArray(items) ? items : []);
  const stableIdentity = resolveCanvasMediaStableIdentity(data, assets);
  const referencedAsset = assets.find((asset) => {
    const nodeAssetIds = [data.assetId, data.assetVersionId, data.asset?.id, data.asset?.assetId, data.asset?.assetVersionId]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);
    const assetIds = [asset?.id, asset?.assetId, asset?.assetVersionId, asset?.latestVersion?.id, asset?.latestVersion?.assetVersionId]
      .map((value) => String(value ?? "").trim());
    return nodeAssetIds.some((id) => assetIds.includes(id));
  });
  const storageObjectId = [
    data.storageObjectId,
    data.storage_object_id,
    data.sourceStorageObjectId,
    data.resultStorageObjectId,
    data.mediaStorageObjectId,
    data.file?.storageObjectId,
    data.asset?.storageObjectId,
    data.asset?.latestVersion?.storageObjectId,
    data.latestVersion?.storageObjectId,
    data.artifact?.storageObjectId,
    data.storage?.storageObjectId,
    data.result?.storageObjectId,
    stableIdentity.storageObjectId,
    referencedAsset?.storageObjectId,
    referencedAsset?.latestVersion?.storageObjectId,
  ].map((value) => String(value ?? "").trim()).find(Boolean) ?? "";
  return storageObjectId ? {
    storageObjectId,
    title: String(data.title ?? data.name ?? node?.title ?? node?.type ?? "画布文件").trim().slice(0, 120),
  } : null;
}

function resolveSelectedAgentFileReference(ui = {}) {
  const nodeId = String(ui.selectedCanvasNodeId ?? "");
  const node = (Array.isArray(ui.canvasDocument?.nodes) ? ui.canvasDocument.nodes : [])
    .find((item) => String(item?.id ?? "") === nodeId);
  if (!node) return null;
  return resolveCanvasNodeFileReference(ui, node);
}

function normalizeAgentFileGrant(grant = {}) {
  return {
    id: String(grant.id ?? ""),
    storageObjectId: String(grant.storageObjectId ?? ""),
    purpose: String(grant.purpose ?? ""),
    status: String(grant.status ?? "active"),
    expiresAt: String(grant.expiresAt ?? ""),
  };
}

const AGENT_TIMELINE_BOTTOM_THRESHOLD = 32;

function captureAgentTimelineScroll(timeline) {
  if (!timeline) return { stickToBottom: true, scrollTop: 0 };
  const scrollTop = Number(timeline.scrollTop) || 0;
  const scrollHeight = Number(timeline.scrollHeight) || 0;
  const clientHeight = Number(timeline.clientHeight) || 0;
  return {
    stickToBottom: scrollHeight - clientHeight - scrollTop <= AGENT_TIMELINE_BOTTOM_THRESHOLD,
    scrollTop,
  };
}

function restoreAgentTimelineScroll(timeline, state, forceStickToBottom = false) {
  if (!timeline) return;
  const stickToBottom = forceStickToBottom || state?.stickToBottom;
  const apply = () => {
    const scrollHeight = Number(timeline.scrollHeight) || 0;
    const clientHeight = Number(timeline.clientHeight) || 0;
    const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
    timeline.scrollTop = stickToBottom
      ? maxScrollTop
      : Math.min(Math.max(0, Number(state?.scrollTop) || 0), maxScrollTop);
  };
  apply();
  if (stickToBottom && typeof requestAnimationFrame === "function") {
    requestAnimationFrame(apply);
  }
}

function formatAgentGrantExpiry(value) {
  const timestamp = Date.parse(String(value ?? ""));
  if (!Number.isFinite(timestamp)) return "有效期未知";
  const minutes = Math.max(0, Math.ceil((timestamp - Date.now()) / 60_000));
  return minutes > 60 ? `${Math.ceil(minutes / 60)} 小时后到期` : `${minutes} 分钟后到期`;
}

export function collapseAgentTimelineEvents(events = []) {
  const standalone = [];
  const steps = new Map();
  for (const record of Array.isArray(events) ? events : []) {
    const event = record?.event && typeof record.event === "object" ? record.event : {};
    const stepId = String(event.stepId ?? "");
    if (!stepId) {
      standalone.push(record);
      continue;
    }
    const previous = steps.get(stepId);
    steps.set(stepId, {
      ...(previous ?? {}),
      ...record,
      event: { ...(previous?.event ?? {}), ...event },
    });
  }
  return [...standalone, ...steps.values()]
    .sort((left, right) => Number(left?.sequence ?? 0) - Number(right?.sequence ?? 0));
}

function renderAgentTimeline(agent, canvasDocument = null, active = false) {
  const timelineEvents = collapseAgentTimelineEvents(agent.events).slice(-30);
  const timelineMessages = collapseAgentGenerationMessages(agent.messages)
    .filter((message) => message.role !== "tool" || message.media || message.generationTaskId);
  const taskFailed = Boolean(agent.taskId) && ["failed", "result_unknown", "manual_review_required"].includes(agent.status);
  const entries = [
    ...timelineMessages.map((message, index) => ({
      id: `message-${message.id || index}`,
      messageId: String(message.id ?? ""),
      role: message.role,
      type: message.interjection ? "用户追加" : agentMessageLabel(message.role),
      summary: message.text,
      nodeReferences: message.nodeReferences,
      attachments: message.attachments,
      status: "message",
      kind: message.role === "assistant" ? "answer" : "message",
      citations: normalizeAgentCitations(message.citations),
      media: message.media ?? null,
      canvasNodeId: resolveAgentMediaCanvasNodeId(canvasDocument, message, message.media),
    })),
    ...(active ? [{
      id: "agent-thinking",
      status: "working",
      summary: resolveAgentActivityMessage(timelineEvents),
      activity: true,
    }] : taskFailed ? [{
      id: "agent-failed",
      status: "failed",
      summary: resolveAgentTaskFailure(timelineEvents),
      failure: true,
    }] : agent.taskId ? [] : timelineEvents.map((event) => ({
      id: event.id ?? `event-${event.sequence}`,
      type: agentEventLabel(event.eventType),
      summary: agentEventSummary(event),
      status: event.eventType,
      kind: agentEventKind(event),
      metadata: agentEventMetadata(event),
    }))),
  ].slice(-40);
  if (!entries.length) {
    return '<div class="canvas-agent-empty"><p>你好！我是灵曦AI的媒体创作工作流 Agent，可以帮你生成剧本、图片、视频内容。<br />有需求请告诉我哦~！我来帮你实现。</p></div>';
  }
  return entries.map((entry) => entry.activity
    ? `<div class="canvas-agent-thinking" role="status"><i aria-hidden="true"></i><span>${escapeHtml(entry.summary)}</span></div>`
    : entry.failure
      ? `<div class="canvas-agent-task-failed" role="status"><i aria-hidden="true"></i><span><strong>失败</strong><small>${escapeHtml(entry.summary || "任务执行失败，请稍后重试。")}</small></span></div>`
    : `
    <article class="canvas-agent-event" data-event-status="${escapeAttr(entry.status)}" data-event-kind="${escapeAttr(entry.kind)}" data-event-role="${escapeAttr(entry.role ?? "")}">
      <i aria-hidden="true"></i>
      <div>
        <span class="canvas-agent-event-title"><strong>${escapeHtml(entry.type)}</strong>${entry.kind && !["message", "answer"].includes(entry.kind) ? `<em>${escapeHtml(agentEventKindLabel(entry.kind))}</em>` : ""}</span>
        ${entry.summary ? `<p>${renderAgentMessageSummary(entry, canvasDocument)}</p>` : ""}
        ${entry.attachments?.length ? renderAgentMessageAttachments(entry.attachments) : ""}
        ${entry.media ? renderAgentMedia(entry.media, entry.messageId, entry.canvasNodeId) : ""}
        ${entry.metadata?.length ? `<div class="canvas-agent-event-meta">${entry.metadata.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
        ${entry.citations?.length ? `<ol class="canvas-agent-citations" aria-label="引用来源">${entry.citations.map((citation) => renderAgentCitation(citation)).join("")}</ol>` : ""}
      </div>
    </article>
  `).join("");
}

function resolveAgentActivityMessage(events = []) {
  const latest = [...events].reverse().find((entry) => entry?.eventType !== "task.interjected") ?? events.at(-1);
  const event = latest?.event && typeof latest.event === "object" ? latest.event : {};
  const eventType = String(latest?.eventType ?? "");
  if (eventType === "task.created") return "正在准备任务";
  if (eventType === "task.started") return "正在思考中";
  if (eventType === "task.interjected") return "正在处理补充要求";
  if (eventType === "task.replanned") return "正在调整执行计划";
  if (eventType === "task.waiting_external" || eventType === "step.waiting_external") return "正在等待生成结果";
  if (eventType === "step.waiting_approval" || eventType === "approval.requested") return "正在等待你的确认";
  if (eventType === "step.created") {
    return event.toolId ? `正在准备 ${event.toolId}` : "正在思考中";
  }
  if (eventType === "step.running") {
    return event.toolId ? `正在执行 ${event.toolId}` : "正在思考中";
  }
  if (eventType === "step.succeeded") return event.toolId ? `正在完成 ${event.toolId}` : "正在整理结果";
  return "正在思考中";
}

function resolveAgentTaskFailure(events = []) {
  const reversed = [...events].reverse();
  const failed = reversed.find((record) => {
    const event = record?.event && typeof record.event === "object" ? record.event : {};
    return String(record?.eventType ?? "") === "step.failed" && String(event.errorCode ?? "").trim();
  }) ?? reversed.find((record) => {
    const event = record?.event && typeof record.event === "object" ? record.event : {};
    const eventType = String(record?.eventType ?? "");
    return eventType === "task.failed"
      || eventType === "step.failed"
      || (eventType === "generation.completed_wakeup" && String(event.status ?? "").toLowerCase() === "failed");
  });
  const event = failed?.event && typeof failed.event === "object" ? failed.event : {};
  const message = String(event.message ?? "").trim();
  if (isHumanReadableAgentText(message)) return message;
  const code = String(event.errorCode ?? event.failureCode ?? "").trim();
  const labels = {
    "402 Insufficient Balance": "模型服务余额不足",
    provider_failed: "图片模型服务暂时不可用",
    provider_stream_error: "模型服务响应中断",
    canvas_agent_tool_input_invalid: "Agent 提交的工具参数无效",
    canvas_agent_generation_model_required: "未选择可用的图片生成模型",
    canvas_agent_generation_target_node_not_found: "引用的画布节点已不存在",
    canvas_agent_generation_target_kind_mismatch: "引用节点类型与生成类型不匹配",
  };
  const detail = labels[code] ?? "任务执行失败";
  return code ? `${detail}（${code}）` : `${detail}，请稍后重试。`;
}

export function normalizeAgentMessage(message = {}) {
  const content = message.content && typeof message.content === "object" ? message.content : {};
  const output = content.output && typeof content.output === "object" ? content.output : {};
  const role = ["system", "user", "assistant", "tool"].includes(message.role) ? message.role : "assistant";
  const text = String(
    content.text ?? content.message ?? message.text ??
    (role === "tool" && content.toolId ? `${content.toolId} 已执行` : ""),
  ).trim();
  return {
    id: String(message.id ?? ""),
    taskId: String(message.taskId ?? ""),
    createdAt: String(message.createdAt ?? ""),
    sequence: Number(message.sequence ?? 0),
    role,
    text,
    nodeReferences: normalizeAgentNodeReferences(content.nodeReferences ?? message.nodeReferences),
    attachments: normalizeAgentAttachments(content.attachments ?? message.attachments),
    interjection: Boolean(message.interjection),
    citations: normalizeAgentCitations(content.citations),
    generationTaskId: String(content.generationTaskId ?? output.generationTaskId ?? ""),
    canvasNodeId: String(content.canvasNodeId ?? output.canvasNodeId ?? ""),
  };
}

function normalizeAgentAttachments(value) {
  return (Array.isArray(value) ? value : []).map((attachment) => ({
    id: String(attachment?.storageObjectId ?? attachment?.fileGrantId ?? ""),
    fileGrantId: String(attachment?.fileGrantId ?? ""),
    name: String(attachment?.name ?? "附件"),
    contentType: String(attachment?.contentType ?? "application/octet-stream"),
    sizeBytes: Math.max(0, Number(attachment?.sizeBytes ?? 0) || 0),
    kind: ["image", "video", "document"].includes(attachment?.kind) ? attachment.kind : "document",
  })).filter((attachment) => attachment.fileGrantId);
}

function renderAgentMessageAttachments(attachments) {
  return `<div class="canvas-agent-message-attachments" aria-label="消息附件">${normalizeAgentAttachments(attachments)
    .map((attachment) => `<span><b>${escapeHtml(agentAttachmentKindLabel(attachment.kind))}</b><em>${escapeHtml(attachment.name)}</em></span>`)
    .join("")}</div>`;
}

function normalizeAgentNodeReferences(value) {
  return (Array.isArray(value) ? value : []).map((reference) => ({
    nodeId: String(reference?.nodeId ?? ""),
    title: String(reference?.title ?? "画布节点"),
    mediaKind: String(reference?.mediaKind ?? "node"),
    fileGrantId: String(reference?.fileGrantId ?? ""),
  })).filter((reference) => reference.nodeId);
}

function renderAgentMessageSummary(entry, canvasDocument) {
  const text = String(entry?.summary ?? "");
  const references = normalizeAgentNodeReferences(entry?.nodeReferences);
  if (entry?.role !== "user" || !references.length) return escapeHtml(text);
  const referencesByTitle = new Map();
  for (const reference of references) {
    const title = reference.title.trim();
    referencesByTitle.set(title, [...(referencesByTitle.get(title) ?? []), reference]);
  }
  let cursor = 0;
  let html = "";
  for (const match of text.matchAll(/【@([^】]+)】/gu)) {
    const index = Number(match.index ?? 0);
    html += escapeHtml(text.slice(cursor, index));
    const title = String(match[1] ?? "").trim();
    const reference = referencesByTitle.get(title)?.shift();
    html += reference
      ? renderAgentMessageNodeReference(reference, canvasDocument)
      : escapeHtml(match[0]);
    cursor = index + match[0].length;
  }
  return html + escapeHtml(text.slice(cursor));
}

function renderAgentMessageNodeReference(reference, canvasDocument) {
  const node = (Array.isArray(canvasDocument?.nodes) ? canvasDocument.nodes : [])
    .find((candidate) => String(candidate?.id ?? "") === reference.nodeId);
  const data = node?.data && typeof node.data === "object" ? node.data : {};
  const rawKind = String(reference.mediaKind ?? data.mediaKind ?? node?.type ?? "node").toLowerCase();
  const mediaKind = rawKind.includes("video")
    ? "video"
    : rawKind.includes("audio")
      ? "audio"
      : rawKind.includes("image") ? "image" : rawKind;
  const source = ["image", "video", "audio"].includes(mediaKind)
    ? resolveCanvasMediaNodeSource(node ?? { data }, mediaKind)
    : "";
  const poster = mediaKind === "video" ? String(data.thumbnailUrl ?? data.posterUrl ?? "").trim() : "";
  const thumb = mediaKind === "video" && source
    ? (poster
        ? `<img src="${escapeAttr(poster)}" alt="" draggable="false" />`
        : `<video src="${escapeAttr(source)}" muted playsinline preload="metadata" aria-hidden="true"></video>`)
    : mediaKind === "image" && source
      ? `<img src="${escapeAttr(source)}" alt="" draggable="false" />`
      : `<span class="episode-prompt-editor-mention-fallback" aria-hidden="true">${escapeHtml(reference.title.slice(0, 1) || "@")}</span>`;
  return `<span class="episode-prompt-editor-mention canvas-agent-message-node-reference" data-node-id="${escapeAttr(reference.nodeId)}" aria-label="引用节点${escapeAttr(reference.title)}" title="节点：${escapeAttr(reference.title)}">
    ${thumb}<span class="episode-prompt-editor-mention-label">${escapeHtml(reference.title)}</span>
  </span>`;
}

export function collapseAgentGenerationMessages(messages = []) {
  const collapsed = [];
  const indexByTaskId = new Map();
  for (const message of Array.isArray(messages) ? messages : []) {
    const generationTaskId = String(message?.generationTaskId ?? "");
    if (message?.role !== "tool" || !generationTaskId) {
      collapsed.push(message);
      continue;
    }
    const previousIndex = indexByTaskId.get(generationTaskId);
    if (previousIndex === undefined) {
      indexByTaskId.set(generationTaskId, collapsed.length);
      collapsed.push(message);
      continue;
    }
    const previous = collapsed[previousIndex];
    collapsed[previousIndex] = {
      ...previous,
      ...message,
      id: previous.id || message.id,
      text: previous.text || message.text,
      canvasNodeId: message.canvasNodeId || previous.canvasNodeId || "",
    };
  }
  return collapsed;
}

export function normalizeAgentMediaTask(task = {}) {
  const result = task.result && typeof task.result === "object" ? task.result : {};
  const audioItem = Array.isArray(task.generatedAudioItems) ? task.generatedAudioItems[0] : null;
  const rawKind = String(task.kind ?? result.mediaKind ?? (audioItem ? "audio" : "image")).toLowerCase();
  const kind = ["video", "audio"].includes(rawKind) ? rawKind : "image";
  const url = normalizeAgentMediaUrl(
    result.imageUrl ?? result.videoUrl ?? result.audioUrl ?? result.sourceUrl ?? result.previewUrl ??
    audioItem?.audioUrl ?? task.url,
  );
  const status = String(task.status ?? "queued").toLowerCase();
  return {
    taskId: String(task.taskId ?? task.id ?? ""),
    kind,
    status,
    url,
    prompt: String(task.prompt ?? "").trim().slice(0, 2_000),
    title: String(result.title ?? result.fileName ?? `${kind} 生成结果`).trim().slice(0, 160),
    error: String(task.failure?.displayMessage ?? task.failure?.providerMessage ?? task.failureCode ?? "").trim().slice(0, 500),
    artifactId: String(result.artifactId ?? ""),
    storageObjectId: String(result.storageObjectId ?? ""),
    assetId: String(result.assetId ?? ""),
    assetVersionId: String(result.assetVersionId ?? ""),
    canvasNodeId: String(
      task.canvasNodeId ?? result.canvasNodeId ??
      (String(task.targetType ?? "") === "canvas" ? task.targetId : "") ?? "",
    ),
  };
}

function resolveAgentMediaCanvasNodeId(document, message = {}, media = null) {
  const nodes = Array.isArray(document?.nodes) ? document.nodes : [];
  const explicitIds = [message.canvasNodeId, media?.canvasNodeId]
    .map((value) => String(value ?? ""))
    .filter(Boolean);
  const explicitNode = nodes.find((node) => explicitIds.includes(String(node?.id ?? "")));
  if (explicitNode) return String(explicitNode.id);
  const generationTaskId = String(media?.taskId ?? message.generationTaskId ?? "");
  if (!generationTaskId) return "";
  const taskNode = nodes.find((node) => [
    node?.data?.generationTaskId,
    node?.data?.lastTaskId,
    node?.data?.taskId,
  ].some((value) => String(value ?? "") === generationTaskId));
  return String(taskNode?.id ?? "");
}

function renderAgentMedia(media, messageIndex, canvasNodeId) {
  const ready = ["completed", "succeeded", "success"].includes(media.status) && Boolean(media.url);
  const failed = ["failed", "canceled", "cancelled", "result_unknown"].includes(media.status);
  if (!ready) {
    return `<div class="canvas-agent-media-status ${failed ? "is-error" : ""}" role="status">${escapeHtml(failed ? media.error || "媒体生成失败" : "媒体生成中")}</div>`;
  }
  const preview = media.kind === "video"
    ? `<video src="${escapeAttr(media.url)}" controls preload="metadata"></video>`
    : media.kind === "audio"
      ? `<audio src="${escapeAttr(media.url)}" controls preload="metadata"></audio>`
      : `<img src="${escapeAttr(media.url)}" alt="${escapeAttr(media.title || "Agent 生成图片")}" loading="lazy" />`;
  return `<figure class="canvas-agent-media" data-media-kind="${escapeAttr(media.kind)}">
    ${preview}
    ${media.prompt ? `<figcaption>${escapeHtml(media.prompt)}</figcaption>` : ""}
    <div class="canvas-agent-media-actions">
      <button type="button" data-agent-action="${canvasNodeId ? "locate-agent-canvas-node" : "add-media-to-canvas"}" data-message-id="${escapeAttr(String(messageIndex))}">${canvasNodeId ? "定位节点" : "添加到画布"}</button>
    </div>
  </figure>`;
}

function normalizeAgentMediaUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\/(?!\/)/.test(raw)) return raw;
  // Agent media must always resolve through the signed/proxy storage path.
  // Inline data URLs can be unbounded and would put media bytes into HTML.
  if (/^data:/i.test(raw)) return "";
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeAgentCitations(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.flatMap((citation) => {
    if (!citation || typeof citation !== "object") return [];
    const id = String(citation.id ?? "").trim();
    const title = String(citation.title ?? citation.sourceKey ?? "来源").trim().slice(0, 240);
    const canonicalUrl = normalizeAgentCitationUrl(citation.canonicalUrl);
    const dedupeKey = id || `${title}:${canonicalUrl}`;
    if (!dedupeKey || seen.has(dedupeKey)) return [];
    seen.add(dedupeKey);
    return [{
      id,
      title,
      canonicalUrl,
      sourceType: citation.sourceType === "web" ? "web" : "provider_docs",
      excerpt: String(citation.excerpt ?? "").trim().slice(0, 360),
    }];
  }).slice(0, 20);
}

function normalizeAgentCitationUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function renderAgentCitation(citation) {
  const sourceLabel = citation.sourceType === "web" ? "网页" : "Provider 文档";
  const content = `<span>${escapeHtml(citation.title)}</span><small>${sourceLabel}</small>${citation.excerpt ? `<p>${escapeHtml(citation.excerpt)}</p>` : ""}`;
  return citation.canonicalUrl
    ? `<li><a href="${escapeAttr(citation.canonicalUrl)}" target="_blank" rel="noopener noreferrer" title="在新窗口打开来源">${content}</a></li>`
    : `<li><div>${content}</div></li>`;
}

function agentMessageLabel(role) {
  return { system: "系统", user: "用户", assistant: "灵曦", tool: "工具" }[role] ?? "灵曦";
}

function findPendingApproval(events = [], skippedStepIds = []) {
  const skipped = new Set(Array.isArray(skippedStepIds) ? skippedStepIds : []);
  const decided = new Set(events
    .filter((event) => ["approval.approved", "approval.rejected"].includes(event?.eventType))
    .map((event) => String(event?.event?.approvalId ?? "")));
  return [...events].reverse().find((event) =>
    event?.eventType === "approval.requested"
      && !skipped.has(String(event?.event?.stepId ?? ""))
      && !decided.has(String(event?.event?.approvalId ?? "")),
  ) ?? null;
}

export function resolveAgentApprovalPresentation(events = [], approvalEvent = null) {
  if (!approvalEvent) return null;
  const event = approvalEvent.event && typeof approvalEvent.event === "object" ? approvalEvent.event : {};
  const effect = String(event.effect ?? "canvas_write");
  const metadata = {
    read: ["读取数据", "只读取当前授权范围内的数据。"],
    canvas_write: ["画布修改", "会修改当前画布节点、连接或设置。"],
    media_generation: ["生成媒体", "会提交生成任务并按现有计费规则结算。"],
    asset_write: ["写入资产", "会创建或更新当前用户范围内的资产。"],
    memory_write: ["保存记忆", "会把明确确认的信息写入当前画布的 Agent 记忆。"],
    config_write: ["后台配置", "不会写入 API Key；新连接保持空白，已有 Secret Reference 保留原值。"],
    external_network: ["访问外部网络", "会按管理员策略访问获准的外部站点。"],
    mcp: ["调用 MCP", "会调用管理员已允许的远程 MCP 工具。"],
  }[effect] ?? ["受控操作", "该操作需要当前用户明确确认后才能继续。"];
  const stepId = String(event.stepId ?? "");
  const stepEvent = [...events].reverse().find((candidate) => {
    const candidateEvent = candidate?.event && typeof candidate.event === "object" ? candidate.event : {};
    return stepId && String(candidateEvent.stepId ?? "") === stepId && Boolean(candidateEvent.toolId);
  });
  return {
    approvalId: String(event.approvalId ?? ""),
    effect,
    label: metadata[0],
    detail: metadata[1],
    summary: String(event.reason ?? agentEventSummary(approvalEvent) ?? "").trim(),
    toolId: String(stepEvent?.event?.toolId ?? ""),
  };
}

function renderAgentApprovalCard(approval, busy) {
  const summary = isHumanReadableAgentText(approval.summary) ? approval.summary : "该操作需要你的确认后才能继续。";
  return `<section class="canvas-agent-approval" data-approval-effect="${escapeAttr(approval.effect)}"${approval.toolId ? ` data-agent-tool-id="${escapeAttr(approval.toolId)}"` : ""} aria-label="${escapeAttr(`${approval.label}待确认`)}">
    <div class="canvas-agent-approval-head">
      <span class="canvas-agent-approval-badge">待确认 · ${escapeHtml(approval.label)}</span>
    </div>
    <p>${escapeHtml(summary)}</p>
    <small>${escapeHtml(approval.detail)}</small>
    <div class="canvas-agent-approval-actions">
      <button type="button" class="danger" data-agent-action="reject" data-approval-id="${escapeAttr(approval.approvalId)}" ${busy ? "disabled" : ""}>拒绝</button>
      <button type="button" data-agent-action="approve" data-approval-id="${escapeAttr(approval.approvalId)}" ${busy ? "disabled" : ""}>确认执行</button>
    </div>
  </section>`;
}

function isHumanReadableAgentText(value) {
  const text = String(value ?? "").trim();
  return Boolean(text) && !/^[a-z][a-z0-9_.:-]*(?:_[a-z0-9_.:-]+)*$/i.test(text);
}

function statusFromEvent(event) {
  const type = String(event?.eventType ?? "");
  if (type === "task.interjected") return "";
  if (type === "approval.requested") return "waiting_approval";
  if (type === "approval.approved" || type === "task.resumed" || type === "task.replanned") return "queued";
  if (type === "approval.rejected") return "canceled";
  if (type === "task.started") return "running";
  if (type === "task.stop_requested") return "cancel_requested";
  if (type.startsWith("task.")) return type.slice(5);
  return "";
}

function agentStatusLabel(agent) {
  if (agent.busyAction) return "正在提交";
  const labels = {
    idle: "未开始", queued: "排队中", running: "执行中", waiting_approval: "等待审批",
    waiting_external: "等待生成", paused: "已暂停", succeeded: "已完成", completed: "已完成", success: "已完成", done: "已完成", finished: "已完成", failed: "失败",
    cancel_requested: "停止中", canceled: "已停止", result_unknown: "结果待确认",
    manual_review_required: "需要人工复核",
  };
  return `${labels[agent.status] ?? agent.status}${agent.polling ? " · 同步中" : ""}`;
}

function agentEventLabel(type) {
  const labels = {
    "task.created": "任务创建", "task.started": "开始执行", "task.succeeded": "灵曦回复",
    "task.failed": "执行失败", "task.paused": "任务暂停", "task.resumed": "继续执行",
    "task.stop_requested": "请求停止", "task.replanned": "重新规划", "task.interjected": "已接收插话",
    "step.created": "准备工具", "step.running": "工具执行中", "step.succeeded": "工具完成",
    "step.failed": "工具失败", "step.waiting_approval": "等待工具审批", "step.waiting_external": "等待外部任务",
    "tool.input_rejected": "工具参数无效", "tool.duplicate_rejected": "重复工具调用",
    "policy.decided": "策略检查", "conversation.deleted": "会话已删除",
    "approval.requested": "等待审批", "approval.approved": "审批通过", "approval.rejected": "审批拒绝",
    "step.created": "步骤创建", "step.running": "步骤执行", "step.succeeded": "步骤完成",
    "policy.decided": "策略判定", "generation.completed_wakeup": "生成结果返回",
  };
  return labels[type] ?? String(type ?? "Agent 事件");
}

function agentEventKind(record) {
  const event = record?.event ?? {};
  const toolId = String(event.toolId ?? "").toLowerCase();
  const effect = String(event.effect ?? "").toLowerCase();
  if (toolId.startsWith("web_") || effect === "external_network") return "research";
  if (toolId.startsWith("mcp.") || effect === "mcp") return "mcp";
  if (toolId.startsWith("file_grant.") || toolId.startsWith("file.")) return "file";
  if (toolId.startsWith("memory.") || effect === "memory_write") return "memory";
  if (effect === "media_generation" || /(?:image|video|audio|media)\./.test(toolId)) return "media";
  if (effect === "canvas_write" || toolId.startsWith("canvas.")) return "canvas";
  if (String(record?.eventType ?? "").startsWith("approval.")) return "approval";
  if (String(record?.eventType ?? "").startsWith("policy.")) return "policy";
  return "task";
}

function agentEventKindLabel(kind) {
  return {
    research: "联网研究", mcp: "MCP", file: "文件授权", memory: "记忆", media: "媒体",
    canvas: "画布", approval: "审批", policy: "策略", task: "任务",
  }[kind] ?? "任务";
}

function agentEventMetadata(record) {
  const event = record?.event ?? {};
  const tokenUsage = event.tokenUsage && typeof event.tokenUsage === "object" ? event.tokenUsage : {};
  const promptTokens = normalizeAgentTokenCount(tokenUsage.promptTokens);
  const completionTokens = normalizeAgentTokenCount(tokenUsage.completionTokens);
  const totalTokens = normalizeAgentTokenCount(tokenUsage.totalTokens) || promptTokens + completionTokens;
  const creditUsage = event.creditUsage && typeof event.creditUsage === "object" ? event.creditUsage : {};
  const consumedCredits = normalizeAgentTokenCount(creditUsage.consumedCredits);
  const values = [
    totalTokens ? `实际 Token ${formatAgentTokenCount(totalTokens)}` : "",
    consumedCredits ? `实际扣除 ${formatAgentTokenCount(consumedCredits)} 积分` : "",
    event.toolId ? `工具 ${event.toolId}` : "",
    event.decision ? `决策 ${event.decision}` : "",
    event.errorCode || event.failureCode ? `错误 ${event.errorCode ?? event.failureCode}` : "",
    event.providerRequestId ? `请求 ${event.providerRequestId}` : "",
    event.generationTaskId ? `媒体任务 ${event.generationTaskId}` : "",
  ].filter(Boolean);
  return [...new Set(values)].slice(0, 4);
}

function normalizeAgentTokenCount(value) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function formatAgentTokenCount(value) {
  return normalizeAgentTokenCount(value).toLocaleString("zh-CN");
}

function agentEventSummary(record) {
  const event = record?.event ?? {};
  const eventType = String(record?.eventType ?? "");
  const failureCode = eventType.endsWith(".failed") || eventType.endsWith(".rejected")
    ? event.errorCode ?? event.failureCode
    : null;
  if (["approval.requested", "policy.decided"].includes(eventType)) {
    const detail = event.message ?? event.reason;
    if (isHumanReadableAgentText(detail)) return String(detail);
    return eventType === "approval.requested" ? "等待你的确认" : "正在确认执行方式";
  }
  return String(
    failureCode ?? event.message ?? event.reason ?? event.toolId ?? event.effect ?? event.status ?? event.errorCode ?? event.failureCode ??
    (event.stepId ? `步骤 ${event.stepId}` : "状态已更新"),
  );
}

function friendlyAgentError(error) {
  const message = String(error?.message ?? error ?? "Agent 请求失败");
  const labels = {
    canvas_agent_conversation_missing: "会话创建失败，请重试。",
    canvas_agent_task_missing: "未找到 Agent 任务，请重新发送。",
    canvas_agent_memory_unavailable: "画布记忆接口暂不可用。",
    canvas_agent_memory_not_found: "这条画布记忆已不存在，请刷新后重试。",
    canvas_agent_memory_key_conflict: "当前会话已有相同记忆键。",
    canvas_agent_memory_key_invalid: "记忆键仅支持字母、数字及 . _ : -。",
    canvas_agent_memory_too_large: "记忆内容超过 16 KB 限制。",
  };
  return labels[message] ?? message;
}

function normalizeConversationTitle(value) {
  const title = Array.from(String(value ?? "").trim()).slice(0, 10).join("");
  return title || "新会话";
}

function normalizeAgentModel(model = {}) {
  const modelCode = String(model.modelCode ?? model.code ?? model.id ?? "").trim();
  return {
    modelCode,
    modelLabel: String(model.modelLabel ?? model.name ?? model.label ?? modelCode).trim(),
    capabilities: model.capabilities && typeof model.capabilities === "object" ? model.capabilities : {},
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
