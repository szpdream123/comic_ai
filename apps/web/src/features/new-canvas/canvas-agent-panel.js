import { resolveStaticAssetUrl } from "../../shared/static-asset-url.js";
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
import { downloadCanvasAsset } from "../production-workbench/canvas/canvas-asset-transfer.js";
import {
  normalizeHomeAgentGenerationModel,
  renderHomeAgentModelPicker,
} from "../production-workbench/home-agent-model-picker.js";
import { renderPromptAttachmentCard } from "../production-workbench/episode-workbench-rebuilt.js?video-category=2&storyboard-style-picker=1";
import { renderCanvasMarkdownPreview } from "../production-workbench/project-detail.js";
import { renderNewCanvasChromeRail } from "./canvas-chrome.js";
import { describeGenerationProgress } from "./free-conversation-progress.js";

const AGENT_MODES = [
  { id: "b", label: "审核批准", description: "读取和分析自动进行，修改画布等有副作用的操作会先请求你的批准。" },
  { id: "c", label: "自动执行", description: "按照管理员策略自动执行，高风险操作仍可能需要你的批准。" },
  { id: "plan", label: "计划模式", description: "只生成执行计划，不修改画布或执行有副作用的操作。" },
  { id: "expert", label: "分析模式", description: "只进行只读分析，不修改画布或执行其他操作。" },
];

const FREE_GENERATION_PERMISSION_MODES = [
  {
    id: "full_access",
    label: "完全访问",
    description: "直接提交图片、视频或音频生成任务，并按所选模型与参数的现有规则结算积分。",
  },
  {
    id: "approval_required",
    label: "审批确认",
    description: "每次提交生成任务前先请求确认；确认后才会扣除积分并开始生成。",
  },
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
const DEFAULT_MEDIA_COMPOSER_HEIGHT = 224;
const MEDIA_COMPOSER_MIN_HEIGHT = 176;
const MEDIA_COMPOSER_MAX_HEIGHT = 560;
const PROMPT_EDITOR_MODULE_URL = "/vendor/prompt-editor.js?v=20260810-2";
const AGENT_ATTACHMENT_UPLOAD_CONCURRENCY = 2;
const AGENT_ATTACHMENT_UPLOAD_LIMITS = {
  image: {
    label: "图片",
    maxBytes: 30 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
    extensions: [".jpg", ".jpeg", ".png", ".webp", ".avif"],
  },
  video: {
    label: "视频",
    maxBytes: 50 * 1024 * 1024,
    mimeTypes: ["video/mp4", "video/webm", "video/quicktime"],
    extensions: [".mp4", ".webm", ".mov"],
  },
  audio: {
    label: "音频",
    maxBytes: 15 * 1024 * 1024,
    mimeTypes: ["audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/webm"],
    extensions: [".mp3", ".m4a", ".ogg", ".wav", ".webm"],
  },
  document: {
    label: "文档",
    maxBytes: 10 * 1024 * 1024,
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
const PERSISTED_CANVAS_PROJECT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const FREE_GENERATION_KINDS = [
  { id: "image", label: "生成图片" },
  { id: "video", label: "生成视频" },
  { id: "audio", label: "音频生成" },
];
const FREE_VISUAL_STYLES = [
  { id: "realistic", label: "真人写实" }, { id: "anime", label: "日系动漫" },
  { id: "3d", label: "3D动画" }, { id: "watercolor", label: "水彩插画" },
  { id: "ink", label: "国风水墨" }, { id: "pixel", label: "像素艺术" },
];
// Keep legacy style IDs readable for existing conversations; new choices come from project styles.
function freeVisualStyles(agent) {
  const catalog = agent.projectVisualStyles ?? [];
  const selected = FREE_VISUAL_STYLES.find(style => style.id === agent.visualStyleId);
  return catalog.length
    ? [...(selected && !catalog.some(style => style.id === selected.id) ? [selected] : []), ...catalog]
    : [selected ?? FREE_VISUAL_STYLES[1]];
}

function renderFreeVisualStylePicker(agent, busy) {
  return `<label class="canvas-agent-style-select">
    <span class="canvas-agent-style-select-label">画面风格</span>
    <span class="canvas-agent-style-select-control">
      <select data-agent-field="visualStyleId" aria-label="图片和视频默认风格" ${busy ? "disabled" : ""}>${freeVisualStyles(agent).map(style => `<option value="${escapeAttr(style.id)}" ${style.id === agent.visualStyleId ? "selected" : ""}>${escapeHtml(style.label)}</option>`).join("")}</select>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>
    </span>
  </label>`;
}
const FREE_CONVERSATION_MODES = [
  { id: "agent", label: "Agent", description: "由 Agent 按需要调用已配置的图片、视频和音频模型。" },
  { id: "image", label: "图片", description: "只生成图片。" },
  { id: "video", label: "视频", description: "只生成视频。" },
  { id: "audio", label: "音频", description: "只生成音频。" },
];
const FREE_CONVERSATION_SKILLS = [
  { id: "character-design", label: "角色设计", category: "视觉设计", description: "从人物特点到可延续的角色形象", output: "角色设定 · 形象图" },
  { id: "series-images", label: "系列图片", category: "视觉设计", description: "锁定人物和画风，变化场景与构图", output: "共同设定 · 系列画面" },
  { id: "image-to-video", label: "图片转视频", category: "视频创作", description: "保留参考图主体，设计动作和镜头", output: "镜头描述 · 动态视频" },
  { id: "scene-design", label: "场景设计", category: "视觉设计", description: "设计空间、光线、氛围与场景细节", output: "场景设定 · 氛围图" },
  { id: "poster-design", label: "海报设计", category: "视觉设计", description: "围绕主题与用途安排画面和文字", output: "设计方案 · 海报图片" },
  { id: "story-development", label: "故事创作", category: "故事与分镜", description: "把一个想法展开为人物与故事大纲", output: "故事梗概 · 情节大纲" },
  { id: "storyboard", label: "分镜设计", category: "故事与分镜", description: "拆解场景、景别、动作与镜头节奏", output: "分镜脚本 · 逐镜提示词" },
  { id: "short-video", label: "短视频创作", category: "视频创作", description: "从创作目标到镜头方案和视频片段", output: "创作计划 · 视频片段" },
];

const AGENT_HEADER_ICON_PATHS = {
  new: '<path d="M12 5v14M5 12h14" />',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" />',
  close: '<path d="M5 12h14" /><path d="m13 6 6 6-6 6" />',
  open: '<path d="M19 12H5" /><path d="m11 6-6 6 6 6" />',
  expand: '<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5" />',
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
  const persistedMediaComposerHeight = Number(persisted?.mediaComposerHeight);
  const mode = AGENT_MODES.some((item) => item.id === previous.mode) ? previous.mode : "b";
  Object.assign(previous, {
    conversationId: "",
    conversations: [],
    freeGenerationConversationsLoaded: false,
    taskId: "",
    mode,
    modelCode: String(previous.modelCode ?? ui.canvasAgentModelCode ?? ""),
    models: [],
    modelsStatus: "idle",
    modelsError: "",
    promptDraft: "",
    skillLibraryOpen: false,
    skillQuery: "",
    selectedSkillId: "",
    selectedModelOverrides: {},
    visualStyleId: "anime",
    visualStylePending: false,
    composerSettingsOpen: false,
    copiedMessageKey: "",
    promptCreativeDocumentId: "",
    promptMention: null,
    promptNodeReferences: [],
    promptAttachments: [],
    promptPreferredModels: {},
    generationKind: FREE_CONVERSATION_MODES.some((item) => item.id === previous.generationKind)
      ? previous.generationKind
      : "agent",
    generationModels: [],
    generationModelsStatus: "idle",
    generationModelsError: "",
    generationModelCodes: {},
    generationParameters: {},
    generationMenuOpen: "",
    generationPermissionMode: previous.generationPermissionMode === "approval_required" ? "approval_required" : "full_access",
    generationPermissionMenuOpen: previous.generationPermissionMenuOpen === true,
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
    mediaComposerHeight: DEFAULT_MEDIA_COMPOSER_HEIGHT,
    historyOpen: false,
    modeMenuOpen: false,
    titleEditing: false,
    titleEditingConversationId: "",
    titleDraft: "",
    taskFilter: "active",
    taskItems: [],
    taskCenterStatus: "idle",
    taskCenterError: "",
    memoryEvents: [],
    skippedStepIds: [],
    mediaPreview: null,
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
  if (Number.isFinite(persistedMediaComposerHeight)) {
    previous.mediaComposerHeight = Math.min(
      MEDIA_COMPOSER_MAX_HEIGHT,
      Math.max(MEDIA_COMPOSER_MIN_HEIGHT, Math.round(persistedMediaComposerHeight)),
    );
  }
  ui.canvasAgent = previous;
  if (ui.canvasAgentCapabilityProfile === "media_generation_only") {
    if (!previous.visualStylePending) {
      for (const message of previous.messages ?? []) {
        if (message.role !== "user") continue;
        const text = String(message.text ?? message.content?.text ?? "").replace(/^\/[\w-]+\s+/, "");
        for (const clause of text.split(/[。；;\n]/)) {
          if (clause.startsWith("风格描述：")) continue;
          if (/[吗么?？]|是不是|是否/.test(clause) && !/请(?:帮我)?(?:生成|制作|改|用|画)|帮我(?:生成|制作|改|画)|改成|改为|采用|使用|创作风格[：:]/.test(clause)) continue;
          const projectStyle = (previous.projectVisualStyles ?? []).find(style => clause.trim() === `创作风格：${style.label}`);
          if (projectStyle) {
            previous.visualStyleId = projectStyle.id;
            continue;
          }
          for (const match of clause.matchAll(/真人写实|真人实拍|写实风格|写实画风|日系动漫|动漫风格|动漫画风|二次元|3D动画|水彩插画|水彩风格|国风水墨|水墨风格|像素艺术|像素风格/gi)) {
            if (/(?:不|不要|避免|禁止|并非|不是)[^，。；;\n]*$/.test(clause.slice(0, match.index).split(/而是|改成|改为|换成/).at(-1))) continue;
            const id = /写实|实拍/.test(match[0]) ? "realistic" : /动漫|二次元/.test(match[0]) ? "anime" : /3d/i.test(match[0]) ? "3d" : /水彩/.test(match[0]) ? "watercolor" : /水墨/.test(match[0]) ? "ink" : "pixel";
            previous.visualStyleId = id;
          }
        }
      }
    }
    if (previous.visualStyleId === "anime" && !previous.visualStylePending) {
      const anime = (!(previous.messages ?? []).some(message => message.role === "user") && (previous.projectVisualStyles ?? []).find(style => /^(?:CG|GC)\s*(?:动画|动漫)(?:风格)?$/i.test(style.label)))
        || (previous.projectVisualStyles ?? []).find(style => style.code === "anime_2d" || /^(二次元|动漫|日系动漫)$/.test(style.label));
      if (anime) previous.visualStyleId = anime.id;
    }
    const prefix = /^\/([\w-]+)(?:\s+|$)/.exec(String(previous.promptDraft ?? ""));
    if (FREE_CONVERSATION_SKILLS.some(skill => skill.id === prefix?.[1])) {
      previous.selectedSkillId = prefix[1];
      previous.promptDraft = previous.promptDraft.slice(prefix[0].length);
    }
  }
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
  const mediaComposerHeight = Number(agent.mediaComposerHeight);
  if (ui.canvasAgentCapabilityProfile === "media_generation_only") {
    ui.canvasSessionUiState = {
      ...current,
      canvasAgent: {
        ...currentAgent,
        ...(Number.isFinite(mediaComposerHeight) ? { mediaComposerHeight } : {}),
      },
    };
    return ui.canvasSessionUiState;
  }
  ui.canvasSessionUiState = {
    ...current,
    // Preserve the standalone free-generation surface across project reloads.
    canvasAgentCapabilityProfile: ui.canvasAgentCapabilityProfile === "media_generation_only"
      ? "media_generation_only"
      : "canvas",
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
  const mediaOnly = ui.canvasAgentCapabilityProfile === "media_generation_only";
  if (agent.panelOpen === false) return "";
  const pendingApproval = findPendingApproval(agent.events, agent.skippedStepIds);
  const approvalPresentation = pendingApproval ? resolveAgentApprovalPresentation(agent.events, pendingApproval) : null;
  const active = Boolean(agent.taskId)
    && !TERMINAL_STATUSES.has(agent.status)
    && !(mediaOnly && (
      hasPendingCreativeQuestion(agent.messages)
      || (normalizeFreeGenerationKind(agent.generationKind) !== "agent" && hasSettledMediaGeneration(agent))
    ));
  const busy = Boolean(agent.busyAction);
  const models = Array.isArray(agent.models) ? agent.models : [];
  const selectedConversation = (agent.conversations ?? []).find((conversation) => conversation.id === agent.conversationId);
  const conversationArchived = selectedConversation?.status === "archived";
  const modelSelectDisabled = false;
  const modelSubmissionUnavailable = agent.modelsStatus !== "ready" || !models.length;
  const selectedMode = AGENT_MODES.find((mode) => mode.id === agent.mode) ?? AGENT_MODES[0];
  const timelineEmpty = !active
    && !collapseAgentTimelineEvents(agent.events).length
    && !collapseAgentGenerationMessages(agent.messages).length;
  agent.panelView = "timeline";
  const panelView = "timeline";
  const conversationTitle = selectedConversation?.title || "新会话";
  const titleMarkup = agent.titleEditing && (!mediaOnly || !agent.titleEditingConversationId)
    ? `<input class="canvas-agent-title-input" type="text" data-agent-field="conversationTitle" value="${escapeAttr(agent.titleDraft || conversationTitle)}" maxlength="10" aria-label="当前会话名称" />`
    : `<strong class="canvas-agent-title" data-agent-conversation-title title="双击修改会话名称">${escapeHtml(conversationTitle)}</strong>`;
  if (mediaOnly) {
    return renderMediaOnlyAgentPanel({
      agent,
      active,
      busy,
      conversationArchived,
      modelSelectDisabled,
      models,
      pendingApproval: approvalPresentation,
      selectedMode,
      timelineEmpty,
      titleMarkup,
    });
  }
  return `
    <aside class="canvas-agent-panel ${agent.historyOpen ? "history-open" : panelView === "timeline" ? "" : "has-special-view"}${agent.conversationId ? " has-conversation" : ""}${timelineEmpty ? " timeline-empty" : ""}" data-canvas-agent-panel aria-label="Canvas Agent">
      <div class="canvas-agent-resize-handle" data-canvas-agent-resize role="separator" aria-orientation="vertical" aria-label="调整 Agent 面板宽度"></div>
      <header class="canvas-agent-head">
        ${titleMarkup}
        <div class="canvas-agent-head-actions">
          <button type="button" class="canvas-agent-icon-button" data-agent-action="new-conversation" aria-label="新建对话" title="新建对话">${renderAgentHeaderIcon("new")}</button>
          <button type="button" class="canvas-agent-icon-button ${agent.historyOpen ? "active" : ""}" data-agent-action="open-agent-history" aria-label="历史对话" title="历史对话" aria-expanded="${agent.historyOpen}">${renderAgentHeaderIcon("history")}</button>
          ${mediaOnly ? "" : `<button type="button" class="canvas-agent-icon-button" data-agent-action="close-agent-panel" aria-label="关闭 Agent 面板" title="关闭">${renderAgentHeaderIcon("close")}</button>`}
        </div>
      </header>

      ${agent.historyOpen ? renderAgentHistoryPopover(agent) : ""}

      ${agent.historyOpen ? "" : (panelView === "tasks" ? renderAgentTaskCenter(agent, busy) : panelView === "memory" ? renderAgentMemoryPanel(agent, busy) : `
      <section class="canvas-agent-timeline${timelineEmpty ? " is-empty" : ""}" aria-label="Agent 事件" aria-live="polite">
        ${renderAgentTimeline(agent, mediaOnly ? null : ui.canvasDocument, active, { mediaOnly, fileGrants: agent.fileGrants })}
      </section>

      ${approvalPresentation ? renderAgentApprovalCard(approvalPresentation, busy) : ""}

      ${agent.taskId && !mediaOnly ? `<div class="canvas-agent-rewind-control">
        <button type="button" data-agent-action="rewind" ${busy ? "disabled" : ""} title="恢复最近一次 Agent 检查点">回退最近检查点</button>
      </div>` : ""}

      <footer class="canvas-agent-composer">
        <div class="canvas-agent-prompt-surface">
          <div class="canvas-agent-prompt-editor-host episode-prompt-editor-host" data-agent-prompt-editor>
            <textarea id="canvas-agent-prompt-input" data-agent-field="promptDraft" placeholder="${conversationArchived ? "恢复会话后继续发送" : mediaOnly ? "描述要生成的图片或视频，可添加参考素材" : "描述要分析、规划或修改的画布内容，输入 @ 引入节点"}" ${busy || conversationArchived ? "disabled" : ""}>${escapeHtml(agent.promptDraft)}</textarea>
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
            <input type="file" data-agent-attachment-input accept="image/*,video/*,audio/*,.txt,.md,.markdown,.csv,.json,.docx,.pdf" multiple hidden />
            <label class="canvas-agent-model-picker">
              <select data-agent-field="modelCode" ${modelSelectDisabled ? "disabled" : ""} aria-label="文本模型">
                ${models.length
                  ? models.map((model) => `<option value="${escapeAttr(model.modelCode)}" ${model.modelCode === agent.modelCode ? "selected" : ""}>${escapeHtml(model.modelLabel || model.modelCode)}</option>`).join("")
                  : `<option value="">${agent.modelsStatus === "loading" ? "正在加载模型" : "暂无可用文本模型"}</option>`}
              </select>
              ${agent.modelsError ? `<small>${escapeHtml(agent.modelsError)}</small>` : ""}
            </label>
            ${renderAgentContextUsage(agent)}
            <button type="button" class="canvas-agent-send-button${active ? " is-running" : ""}" data-agent-action="send" aria-label="${active ? "停止 Agent 任务" : "发送 Agent 指令"}" title="${active ? "停止 Agent 任务" : "发送 Agent 指令"}" aria-busy="${active}" ${busy || conversationArchived || (!active && modelSubmissionUnavailable) ? "disabled" : ""}>${renderAgentComposerActionIcon(active)}</button>
          </span>
        </div>
        ${agent.error ? `<p class="canvas-agent-error" role="alert">${escapeHtml(agent.error)}</p>` : ""}
      </footer>
      `)}
    </aside>
  `;
}

function renderMediaOnlyAgentPanel({
  agent,
  active,
  busy,
  conversationArchived,
  modelSelectDisabled,
  models,
  pendingApproval,
  selectedMode,
  timelineEmpty,
  titleMarkup,
}) {
  const generationKind = normalizeFreeGenerationKind(agent.generationKind);
  const agentGeneration = generationKind === "agent";
  const selectedGenerationModel = agentGeneration ? null : resolveSelectedFreeGenerationModel(agent, generationKind);
  const generationUnavailable = agentGeneration
    ? !hasSelectedFreeConversationTextModel(agent)
    : agent.generationModelsStatus !== "ready" || !selectedGenerationModel;
  const promptAction = active && agentGeneration && agent.status === "waiting_external"
    ? "interject-prompt"
    : active ? "stop" : "send";
  const promptActionLabel = promptAction === "stop" ? "停止生成" : promptAction === "interject-prompt" ? "发送补充要求" : "发送生成指令";
  return `
    <aside class="canvas-agent-panel is-media-only is-focus-layout${agent.conversationId ? " has-conversation" : ""}${timelineEmpty ? " timeline-empty" : ""}" data-canvas-agent-panel aria-label="自由生成">
      <nav class="canvas-agent-media-sidebar" aria-label="创作会话">
        <header class="canvas-agent-media-sidebar-head">
          <strong>开启创作</strong>
        </header>
        <button type="button" class="canvas-agent-media-new" data-agent-action="new-conversation" aria-label="新对话">
          ${renderAgentHeaderIcon("new")}
          <span>新对话</span>
        </button>
        ${renderAgentMediaConversationList(agent)}
      </nav>
      <main class="canvas-agent-media-workspace">
        <header class="canvas-agent-head canvas-agent-media-head">
          ${titleMarkup}
          <div class="canvas-agent-head-actions">
            <div class="canvas-agent-current-model">
              ${renderCurrentTextModelPicker(agent, modelSelectDisabled)}
            </div>
            <span class="canvas-agent-status ${escapeAttr(agent.status)}">${escapeHtml(agentStatusLabel(agent))}</span>
          </div>
        </header>
        <div class="canvas-agent-media-timeline-wrap">
          <section class="canvas-agent-timeline${timelineEmpty ? " is-empty" : ""}" aria-label="生成记录" aria-live="polite">
            <div class="canvas-agent-media-feed">
              ${renderAgentTimeline(agent, null, active, { mediaOnly: true, fileGrants: agent.fileGrants })}
            </div>
          </section>
        </div>
        ${pendingApproval ? renderAgentApprovalCard(pendingApproval, busy) : ""}
        <form class="home-agent-composer canvas-agent-media-composer is-focus-composer" data-free-generation-form style="--canvas-agent-media-composer-height: ${Math.min(MEDIA_COMPOSER_MAX_HEIGHT, Math.max(MEDIA_COMPOSER_MIN_HEIGHT, Math.round(Number(agent.mediaComposerHeight) || DEFAULT_MEDIA_COMPOSER_HEIGHT)))}px">
          <div class="canvas-agent-media-composer-resize" data-agent-media-composer-resize role="separator" aria-orientation="horizontal" aria-label="拖动调整输入框高度" tabindex="0" title="拖动调整输入框高度"><span aria-hidden="true"></span></div>
          <div class="home-agent-composer-content canvas-agent-media-composer-content" data-home-agent-attachment-list>
            <div class="episode-replica-textarea has-inline-attachments">
              <div class="episode-replica-ref-strip inline-upload-tray">
                <button class="episode-replica-upload-card combined uploadable" type="button" data-agent-action="pick-attachments" aria-label="添加或拖入图片、视频、音频或文件" ${busy || conversationArchived || agent.attachmentUploading ? "disabled" : ""}>
                  <span>+</span><strong>添加素材</strong>
                </button>
                ${renderFreeGenerationPromptAttachmentCards(agent)}
                <input type="file" data-agent-attachment-input accept="image/*,video/*,audio/*,.txt,.md,.markdown,.csv,.json,.docx,.pdf" multiple hidden />
              </div>
              <div class="canvas-agent-media-prompt-editor episode-prompt-editor-host" data-agent-prompt-editor>
                <textarea class="home-agent-rich-editor" id="canvas-agent-prompt-input" data-agent-field="promptDraft" placeholder="${conversationArchived ? "恢复会话后继续发送" : agentGeneration ? "输入想法、剧本或上传参考，使用 / 选择技能，@ 引用素材" : `描述想${generationKind === "image" ? "生成的图片" : generationKind === "video" ? "生成的视频" : "生成的音频"}，输入 @ 引用素材`}" ${busy || conversationArchived ? "disabled" : ""}>${escapeHtml(agent.promptDraft)}</textarea>
              </div>
            </div>
          </div>
          ${agent.status === "waiting_external" ? '<p class="canvas-agent-submission-note">当前媒体已提交，补充要求将用于后续处理；重新生成会再次计费。</p>' : ""}
          <footer class="home-agent-composer-footer canvas-agent-generation-config" aria-label="${escapeAttr(FREE_CONVERSATION_MODES.find((kind) => kind.id === generationKind)?.label ?? "生成配置")}">
            ${renderFreeConversationModePicker(agent, busy)}
            <div class="canvas-agent-customize">
              <button type="button" class="canvas-agent-composer-tool" data-agent-action="toggle-composer-settings" aria-expanded="${Boolean(agent.composerSettingsOpen)}" aria-label="自定义模型、风格与参数" title="选择图片、视频模型、风格和生成参数" ${busy ? "disabled" : ""}>${renderComposerToolIcon("settings")}<span>自定义</span></button>
              <section class="canvas-agent-customize-panel" role="dialog" aria-label="自定义生成设置" ${agent.composerSettingsOpen ? "" : "hidden"}>
                <header><strong>创作设置</strong><button type="button" data-agent-action="toggle-composer-settings" aria-label="关闭生成设置">×</button></header>
                <div class="canvas-agent-visible-models" role="group" aria-label="默认生成模型">${renderFreeGenerationModelPickers(agent, agent.generationModelsStatus === "loading")}</div>
                ${renderFreeVisualStylePicker(agent, busy)}
                ${agent.visualStylesError ? `<small class="canvas-agent-model-hint" role="status">${escapeHtml(agent.visualStylesError)}</small>` : ""}
                ${renderFreeConversationParameters(agent)}
                ${renderFreeGenerationPermissionModeControl(agent, busy)}
                <p>默认使用所选模型与风格，正文中的明确要求优先。</p>
              </section>
            </div>
            ${renderFreeConversationSkills(busy, agent)}
            <div class="home-agent-submit-group canvas-agent-media-submit-group">
              ${renderAgentContextUsage(agent)}
              <button class="canvas-agent-send-button${promptAction === "stop" ? " is-running" : ""}" type="button" data-agent-action="${promptAction}" aria-label="${promptActionLabel}" title="${promptActionLabel}" aria-busy="${promptAction === "stop"}" ${busy || (!active && generationUnavailable) ? "disabled" : ""}>${renderAgentComposerActionIcon(promptAction === "stop")}</button>
            </div>
          </footer>
          ${agent.error ? `<p class="canvas-agent-error" role="alert">${escapeHtml(sanitizeMediaOnlyAgentCopy(agent.error))}</p>` : ""}
        </form>
        ${renderAgentMediaPreview(agent)}
      </main>
    </aside>
  `;
}

function renderFreeGenerationPermissionModeControl(agent, busy) {
  const selectedPermission = FREE_GENERATION_PERMISSION_MODES.find(
    (permission) => permission.id === agent.generationPermissionMode,
  ) ?? FREE_GENERATION_PERMISSION_MODES[0];
  const menuOpen = agent.generationPermissionMenuOpen === true;
  return `<div class="canvas-agent-generation-permission canvas-agent-mode-picker" role="group" aria-label="生成权限">
    <span>权限</span>
    ${menuOpen ? `<div class="canvas-agent-mode-menu canvas-agent-permission-menu" role="listbox" aria-label="选择生成权限">
      ${FREE_GENERATION_PERMISSION_MODES.map((permission) => `<button type="button" role="option" aria-selected="${permission.id === selectedPermission.id}" class="canvas-agent-mode-option ${permission.id === selectedPermission.id ? "active" : ""}" data-agent-action="set-free-generation-permission" data-permission-mode="${permission.id}">
        <span><strong>${escapeHtml(permission.label)}</strong><small>${escapeHtml(permission.description)}</small></span>
        ${permission.id === selectedPermission.id ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>' : ""}
      </button>`).join("")}
    </div>` : ""}
    <button type="button" class="canvas-agent-mode-trigger canvas-agent-permission-trigger ${menuOpen ? "active" : ""}" data-agent-action="toggle-free-generation-permission-menu" aria-haspopup="listbox" aria-expanded="${menuOpen}" title="选择生成权限" ${busy ? "disabled" : ""}>
      <span>${escapeHtml(selectedPermission.label)}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 14 5-5 5 5" /></svg>
    </button>
  </div>`;
}

function renderFreeGenerationPromptAttachmentCards(agent) {
  return (Array.isArray(agent.promptAttachments) ? agent.promptAttachments : [])
    .map((attachment, index) => renderPromptAttachmentCard(attachment, index, true, {
      actionAttribute: "data-agent-action",
      cardAction: "",
      removeAction: "remove-agent-attachment",
    }))
    .join("");
}

function renderFreeConversationModePicker(agent, disabled) {
  const selected = normalizeFreeGenerationKind(agent.generationKind);
  const open = agent.generationMenuOpen === "free-generation:kind";
  const label = selected === "agent" ? "Agent 模式" : FREE_CONVERSATION_MODES.find(mode => mode.id === selected)?.label;
  return `<div class="canvas-agent-free-mode-picker" role="group" aria-label="创作方式">
    <button type="button" class="canvas-agent-composer-tool canvas-agent-kind-trigger" data-agent-action="toggle-free-generation-menu" data-field="kind" aria-expanded="${open}" aria-haspopup="listbox" aria-label="选择创作模式" ${disabled ? "disabled" : ""}>${renderComposerToolIcon("agent")}<span>${escapeHtml(label)}</span><span aria-hidden="true">⌄</span></button>
    <div class="canvas-agent-kind-options" role="listbox" aria-label="创作模式" ${open ? "" : "hidden"}>
    ${FREE_CONVERSATION_MODES.map((mode) => `<button type="button" class="${mode.id === selected ? "active" : ""}" data-agent-action="select-free-generation-kind" data-value="${escapeAttr(mode.id)}" aria-pressed="${mode.id === selected}" title="${escapeAttr(mode.description)}" ${disabled ? "disabled" : ""}>${escapeHtml(mode.label)}</button>`).join("")}
    </div>
  </div>`;
}

function renderComposerToolIcon(kind) {
  const paths = kind === "settings" ? '<path d="M4 7h7m4 0h5M4 17h3m4 0h9"/><circle cx="13" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>' : kind === "skill" ? '<path d="M14 5a5 5 0 0 0-6 6L3 16a3 3 0 0 0 5 5l5-5a5 5 0 0 0 6-6l-3 3-4-4 3-3Z"/>' : '<path d="m14 3-9 9 7 1-2 8 9-10-7-1 2-7Z"/>';
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
}

function renderFreeConversationSkills(disabled, agent = {}) {
  const selectedId = agent.selectedSkillId || /^\/([\w-]+)(?:\s|$)/.exec(agent.promptDraft ?? "")?.[1];
  const selected = FREE_CONVERSATION_SKILLS.find(skill => skill.id === selectedId);
  return `<div class="canvas-agent-free-skills" role="group" aria-label="内置创作技能">
    <button type="button" class="canvas-agent-skill-library-trigger canvas-agent-composer-tool" data-agent-action="toggle-skill-library" aria-label="技能库" aria-expanded="${Boolean(agent.skillLibraryOpen)}" ${disabled ? "disabled" : ""}>${renderComposerToolIcon("skill")}<span>技能</span></button>
    ${selected ? `<span class="canvas-agent-selected-skill">${escapeHtml(selected.label)}<button type="button" data-agent-action="clear-free-conversation-skill" aria-label="移除当前技能" ${disabled ? "disabled" : ""}>×</button></span>` : FREE_CONVERSATION_SKILLS.slice(0, 3).map((skill) => `<button type="button" data-agent-action="select-free-conversation-skill" data-skill-id="${escapeAttr(skill.id)}" title="${escapeAttr(skill.description)}" ${disabled ? "disabled" : ""}>${escapeHtml(skill.label)}</button>`).join("")}
    ${agent.skillLibraryOpen ? `<section class="canvas-agent-skill-library" role="dialog" aria-label="创作技能库"><header><div><strong>选择一项创作技能</strong><small>告诉 Agent 你想完成什么</small></div><button type="button" data-agent-action="toggle-skill-library" aria-label="关闭技能库">×</button></header><input type="search" data-agent-field="skillQuery" value="${escapeAttr(agent.skillQuery ?? "")}" placeholder="搜索创作技能" aria-label="搜索创作技能" /><div class="canvas-agent-skill-results" data-skill-results>${renderFreeConversationSkillResults(agent)}</div></section>` : ""}
  </div>`;
}

function renderFreeConversationSkillResults(agent) {
  const query = String(agent.skillQuery ?? "").trim().toLowerCase();
  const skills = FREE_CONVERSATION_SKILLS.filter(skill => `${skill.label} ${skill.description} ${skill.output} ${skill.category}`.toLowerCase().includes(query));
  if (!skills.length) return '<p class="canvas-agent-skill-empty">没有匹配的技能，也可以直接描述你的想法。</p>';
  return ["视觉设计", "故事与分镜", "视频创作"].map(category => {
    const items = skills.filter(skill => skill.category === category);
    return items.length ? `<section><h4>${category}</h4><div>${items.map(skill => `<button type="button" data-agent-action="select-free-conversation-skill" data-skill-id="${skill.id}"><strong>${skill.label}</strong><span>${skill.description}</span><small>${skill.output}</small></button>`).join("")}</div></section>` : "";
  }).join("");
}

function renderFreeGenerationModelPickers(agent, disabled) {
  return FREE_GENERATION_KINDS.map((kind) => {
    const models = listFreeGenerationModels(agent, kind.id);
    const selectedModel = resolveSelectedFreeGenerationModel(agent, kind.id);
    const label = kind.id === "image" ? "图片" : kind.id === "video" ? "视频" : "音频";
    const modelLabel = selectedModel?.modelLabel
      ?? (agent.generationModelsStatus === "loading" ? "正在加载" : "未配置");
    return renderHomeAgentModelPicker({
      models,
      mediaType: kind.id,
      selectedModelCode: selectedModel?.modelCode ?? "",
      open: agent.generationMenuOpen === `free-generation:model:${kind.id}`,
      disabled,
      triggerLabel: `${label} · ${modelLabel}`,
      ariaLabel: `选择${label}模型`,
      menuField: `model:${kind.id}`,
      toggleAction: "toggle-free-generation-menu",
      selectAction: "select-free-generation-model",
      actionAttribute: "data-agent-action",
    });
  }).join("");
}

function renderFreeConversationParameters(agent) {
  const labels = { aspectRatio: "画幅", aspect_ratio: "画幅", ratio: "画幅", duration: "时长", durationSeconds: "时长（秒）", resolution: "清晰度", voice: "音色", speed: "语速" };
  return FREE_GENERATION_KINDS.map(kind => {
    const model = resolveSelectedFreeGenerationModel(agent, kind.id);
    const schema = model?.parameterSchema?.properties ?? model?.parameterSchema ?? {};
    const values = resolveFreeGenerationParameterValues(agent, kind.id, model);
    const fields = Object.entries(schema).filter(([key, field]) => labels[key] && Array.isArray(field?.enum) && field.enum.length);
    return fields.length ? `<fieldset class="canvas-agent-parameter-fields"><legend>${kind.id === "image" ? "图片" : kind.id === "video" ? "视频" : "音频"}参数</legend>${fields.map(([key, field]) => `<label>${escapeHtml(field.label || labels[key])}<select data-agent-field="generationParameter" data-generation-kind="${kind.id}" data-generation-parameter="${escapeAttr(key)}"><option value="" ${values[key] == null ? "selected" : ""} disabled>自动</option>${field.enum.map(value => `<option value="${escapeAttr(String(value))}" ${String(values[key]) === String(value) ? "selected" : ""}>${escapeHtml(String(value))}</option>`).join("")}</select></label>`).join("")}</fieldset>` : "";
  }).join("");
}

function renderCurrentTextModelPicker(agent, disabled) {
  const models = Array.isArray(agent.models) ? agent.models : [];
  const selected = models.find((model) => model.modelCode === agent.modelCode) ?? models[0] ?? null;
  const label = selected?.modelLabel ?? (agent.modelsStatus === "loading" ? "正在加载" : "暂无文本模型");
  const open = agent.generationMenuOpen === "free-generation:text-model";
  return `<div class="home-agent-model-picker">
    <button type="button" class="home-agent-model-trigger${open ? " active" : ""}" data-agent-action="toggle-free-generation-menu" data-field="text-model" aria-haspopup="dialog" aria-expanded="${open}" aria-label="切换当前文本模型" title="切换当前文本模型" ${disabled ? "disabled" : ""}>${renderAgentTextModelIcon()}<span>当前 · ${escapeHtml(label)}</span></button>
    ${open ? `<section class="home-agent-model-menu" role="dialog" aria-label="选择文本模型">
      <div class="home-agent-model-options" role="listbox" aria-label="文本模型">
        ${models.map((model, index) => `<button type="button" role="option" aria-selected="${model.modelCode === selected?.modelCode}" class="home-agent-model-option${model.modelCode === selected?.modelCode ? " active" : ""}" data-agent-action="select-agent-text-model" data-model-index="${index}">
          <span class="home-agent-model-option-icon" aria-hidden="true">${renderAgentTextModelIcon()}</span>
          <span><strong>${escapeHtml(model.modelLabel || model.modelCode)}</strong></span>
        </button>`).join("")}
      </div>
    </section>` : ""}
  </div>`;
}

function renderAgentTextModelIcon() {
  return '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M8.5 9h7M8.5 12h7M8.5 15h4" /></svg>';
}

function normalizeFreeGenerationKind(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return FREE_CONVERSATION_MODES.some((item) => item.id === normalized) ? normalized : "agent";
}

function hasSelectedFreeConversationTextModel(agent) {
  const modelCode = String(agent?.modelCode ?? "").trim();
  return agent?.modelsStatus === "ready"
    && Boolean(modelCode)
    && (Array.isArray(agent?.models) ? agent.models : []).some((model) => model?.modelCode === modelCode);
}

function normalizeFreeGenerationMediaType(value) {
  const normalized = String(value ?? "").trim().toLowerCase().replaceAll("-", "_");
  if (normalized.includes("video") || ["i2v", "t2v", "lip_sync"].includes(normalized)) return "video";
  if (normalized.includes("image") || ["i2i", "t2i", "multi_reference"].includes(normalized)) return "image";
  if (normalized.includes("audio") || normalized.includes("speech") || ["tts", "music"].includes(normalized)) return "audio";
  return normalized;
}

function normalizeFreeGenerationModel(model = {}) {
  const display = normalizeHomeAgentGenerationModel(model);
  if (!display) return null;
  return {
    ...display,
    remark: display.description,
    parameterSchema: model?.parameterSchema && typeof model.parameterSchema === "object" && !Array.isArray(model.parameterSchema)
      ? model.parameterSchema
      : {},
    defaultParams: model?.defaultParams && typeof model.defaultParams === "object" && !Array.isArray(model.defaultParams)
      ? model.defaultParams
      : {},
    credits: model?.credits,
    displayBaseCost: model?.displayBaseCost,
    baseCredits: model?.baseCredits,
    pricing: model?.pricing,
    pricingJson: model?.pricingJson,
    pricing_json: model?.pricing_json,
    billingMode: model?.billingMode,
    billing_mode: model?.billing_mode,
    resolutionCredits: model?.resolutionCredits,
    resolution_credits: model?.resolution_credits,
    unit: model?.unit,
  };
}

function listFreeGenerationModels(agent, kind) {
  const mediaType = normalizeFreeGenerationKind(kind);
  return (Array.isArray(agent?.generationModels) ? agent.generationModels : [])
    .filter((model) => model?.mediaType === mediaType && model?.modelCode);
}

function resolveSelectedFreeGenerationModel(agent, kind) {
  const mediaType = normalizeFreeGenerationKind(kind);
  const models = listFreeGenerationModels(agent, mediaType);
  const selectedCode = String(agent?.generationModelCodes?.[mediaType] ?? "").trim();
  return models.find((model) => model.modelCode === selectedCode) ?? models[0] ?? null;
}

function resolveFreeGenerationParameterValues(agent, kind, model) {
  const mediaType = normalizeFreeGenerationKind(kind);
  const saved = agent?.generationParameters?.[mediaType];
  return {
    ...(model?.defaultParams ?? {}),
    ...(saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {}),
  };
}

function coerceFreeGenerationParameterValue(model, field, value) {
  const schema = model?.parameterSchema?.properties?.[field] ?? model?.parameterSchema?.[field];
  if (schema?.type === "boolean") return String(value) === "true";
  if (schema?.type === "integer") {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : value;
  }
  if (schema?.type === "number") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}

function renderAgentMediaConversationList(agent) {
  const conversations = Array.isArray(agent.conversations) ? agent.conversations : [];
  return `<section class="canvas-agent-media-conversations" aria-label="历史对话">
    <header><span>最近</span><small>${conversations.length}</small></header>
    <div class="canvas-agent-media-conversation-list">
      ${conversations.length
        ? conversations.map((conversation) => {
          const current = String(conversation.id) === String(agent.conversationId);
          const editing = agent.titleEditing === true
            && String(agent.titleEditingConversationId ?? "") === String(conversation.id);
          return `<div class="canvas-agent-media-conversation-row${current ? " active" : ""}">
          ${editing
            ? `<div class="canvas-agent-media-conversation-item is-editing">
              <span aria-hidden="true">${renderAgentHeaderIcon("history")}</span>
              <input class="canvas-agent-media-conversation-title-input" type="text" data-agent-field="conversationTitle" data-conversation-id="${escapeAttr(conversation.id)}" value="${escapeAttr(agent.titleDraft || conversation.title || "新会话")}" maxlength="10" aria-label="会话名称" />
            </div>`
            : `<button type="button" class="canvas-agent-media-conversation-item" data-agent-action="select-agent-conversation" data-conversation-id="${escapeAttr(conversation.id)}" title="${escapeAttr(conversation.title || "未命名会话")}" ${current ? 'aria-current="page"' : ""}>
              <span aria-hidden="true">${renderAgentHeaderIcon("history")}</span>
              <strong data-agent-conversation-title data-conversation-id="${escapeAttr(conversation.id)}" title="双击修改会话名称">${escapeHtml(conversation.title || "未命名会话")}</strong>
            </button>`}
          <button type="button" class="canvas-agent-media-conversation-delete danger" data-agent-action="delete-conversation" data-conversation-id="${escapeAttr(conversation.id)}" aria-label="删除会话 ${escapeAttr(conversation.title || "未命名会话")}" title="删除会话">${renderAgentHeaderIcon("trash")}</button>
        </div>`;
        }).join("")
        : `<p>暂无历史对话</p>`}
    </div>
  </section>`;
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

export function renderNewCanvasLayout(canvasMarkup, ui = {}, auxiliaryMarkup = "", minimapMarkup = "", options = {}) {
  const sessionReady = ui.canvasSessionUiStateReady !== false;
  const agentOnly = options.agentOnly === true || ui.canvasAgentOnly === true;
  const agentPanelClosed = !sessionReady || ui.canvasAgent?.panelOpen === false;
  const agentPanelWidth = resolveCanvasAgentPanelWidth(ui);
  const sidebarWidth = ui.canvasSidebarCollapsed !== false
    ? 0
    : ["assets", "history"].includes(ui.canvasSidebarMode)
      ? Math.max(264, (Math.min(6, Math.max(2, Number(ui.canvasAssetLayoutColumns ?? 3) || 3)) * 118))
      : 264;
  return `
    <div class="new-canvas-layout ${agentOnly ? "is-agent-only" : ""} ${agentPanelClosed ? "is-agent-collapsed" : ""}" style="--canvas-agent-panel-width:${agentPanelWidth}px">
      ${agentOnly ? "" : `
      <div class="new-canvas-workspace" data-new-canvas-workspace style="--new-canvas-sidebar-width:${sidebarWidth}px;--new-canvas-sidebar-half-width:${sidebarWidth / 2}px">${canvasMarkup}${minimapMarkup}${renderNewCanvasChromeRail(ui)}${sessionReady && agentPanelClosed ? renderCanvasAgentReopenButton() : ""}</div>
      `}
      ${sessionReady ? renderCanvasAgentPanel(ui) : ""}
      ${sessionReady && !agentOnly ? renderCanvasAgentRewindConfirmModal(ui) : ""}
      ${agentOnly ? "" : auxiliaryMarkup}
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
  capabilityProfile = workbench?.ui?.canvasAgentCapabilityProfile ?? "",
}) {
  const ui = workbench.ui ?? (workbench.ui = {});
  const mediaOnly = capabilityProfile === "media_generation_only";
  const agentApi = mediaOnly
    ? {
        createConversation: (input) => workbench.api?.createFreeGenerationConversation?.(input),
        listConversations: (input) => workbench.api?.listFreeGenerationConversations?.(input),
        updateConversation: (input) => workbench.api?.updateFreeGenerationConversation?.(input),
        deleteConversation: (conversationId) => workbench.api?.deleteFreeGenerationConversation?.(conversationId),
        sendMessage: (_canvasId, conversationId, input) => workbench.api?.sendFreeGenerationMessage?.(conversationId, input),
        listMessages: (_canvasId, conversationId, input) => workbench.api?.listFreeGenerationMessages?.(conversationId, input),
        listFileGrants: (_canvasId, conversationId, input) => workbench.api?.listFreeGenerationFileGrants?.(conversationId, input),
        createFileGrant: (_canvasId, conversationId, input) => workbench.api?.createFreeGenerationFileGrant?.(conversationId, input),
        revokeFileGrant: (_canvasId, conversationId, grantId) => workbench.api?.revokeFreeGenerationFileGrant?.(conversationId, grantId),
        listEvents: (_canvasId, taskId, input) => workbench.api?.listFreeGenerationEvents?.(taskId, input),
        streamEvents: typeof workbench.api?.streamFreeGenerationEvents === "function"
          ? (_canvasId, taskId, input) => workbench.api.streamFreeGenerationEvents(taskId, input)
          : undefined,
        controlTask: (_canvasId, taskId, action, input) => workbench.api?.controlFreeGenerationTask?.(taskId, action, input),
        listModels: () => workbench.api?.listFreeGenerationModels?.(),
      }
    : {
        createConversation: (input) => workbench.api?.createCanvasAgentConversation?.(String(workbench.ui?.selectedCanvasProjectId ?? ""), input),
        listConversations: (input) => workbench.api?.listCanvasAgentConversations?.(String(workbench.ui?.selectedCanvasProjectId ?? ""), input),
        updateConversation: (input) => workbench.api?.updateCanvasAgentConversation?.(String(workbench.ui?.selectedCanvasProjectId ?? ""), input),
        deleteConversation: (conversationId) => workbench.api?.deleteCanvasAgentConversation?.(String(workbench.ui?.selectedCanvasProjectId ?? ""), conversationId),
        sendMessage: (canvasId, conversationId, input) => workbench.api?.sendCanvasAgentMessage?.(canvasId, conversationId, input),
        listMessages: (canvasId, conversationId, input) => workbench.api?.listCanvasAgentMessages?.(canvasId, conversationId, input),
        listFileGrants: (canvasId, conversationId, input) => workbench.api?.listCanvasAgentFileGrants?.(canvasId, conversationId, input),
        createFileGrant: (canvasId, conversationId, input) => workbench.api?.createCanvasAgentFileGrant?.(canvasId, conversationId, input),
        revokeFileGrant: (canvasId, conversationId, grantId) => workbench.api?.revokeCanvasAgentFileGrant?.(canvasId, conversationId, grantId),
        listEvents: (canvasId, taskId, input) => workbench.api?.listCanvasAgentEvents?.(canvasId, taskId, input),
        streamEvents: typeof workbench.api?.streamCanvasAgentEvents === "function"
          ? (canvasId, taskId, input) => workbench.api.streamCanvasAgentEvents(canvasId, taskId, input)
          : undefined,
        controlTask: (canvasId, taskId, action, input) => workbench.api?.controlCanvasAgentTask?.(canvasId, taskId, action, input),
        listModels: () => workbench.api?.listCanvasAgentModels?.(String(workbench.ui?.selectedCanvasProjectId ?? "")),
      };
  if (capabilityProfile) ui.canvasAgentCapabilityProfile = capabilityProfile;
  const agent = ensureCanvasAgentState(ui);
  if (mediaOnly) {
    agent.mode = "c";
    agent.promptNodeReferences = [];
    agent.rewindConfirmOpen = false;
    agent.modeMenuOpen = false;
  }
  const shouldStartNewFreeGenerationTask = () => (
    mediaOnly
    && agent.status === "waiting_external"
    && normalizeFreeGenerationKind(agent.generationKind) !== "agent"
  );
  const shouldAnswerCreativeQuestion = () => mediaOnly && hasPendingCreativeQuestion(agent.messages);
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
      const references = mediaOnly ? [] : (Array.isArray(agent.promptNodeReferences) ? agent.promptNodeReferences : []);
      const attachmentReferences = listCanvasAgentPromptEditorAttachmentReferences(agent, {
        ordinalLabels: mediaOnly,
      });
      if (mediaOnly) {
        agent.promptDraft = replaceCanvasAgentPromptAttachmentTokenLabels(
          agent.promptDraft,
          attachmentReferences,
        );
      }
      const handle = module.mountPromptEditor(editorHost, {
        ariaLabel: mediaOnly ? "自由生成指令" : "Agent 指令，输入 @ 引入画布节点",
        editable: !agent.busyAction && !isSelectedAgentConversationArchived(agent),
        id: "canvas-agent-prompt-input",
        mentionReferences: [
          ...references.map(buildAgentPromptEditorReference),
          ...attachmentReferences,
        ],
        maxSuggestions: Number.MAX_SAFE_INTEGER,
        placeholder: isSelectedAgentConversationArchived(agent)
          ? "恢复会话后继续发送"
          : mediaOnly
            ? (normalizeFreeGenerationKind(agent.generationKind) === "agent"
              ? "输入想法、剧本或上传参考，使用 / 选择技能，@ 引用素材"
              : `描述要生成的${normalizeFreeGenerationKind(agent.generationKind) === "image" ? "图片" : normalizeFreeGenerationKind(agent.generationKind) === "video" ? "视频" : "音频"}，输入 @ 引用素材`)
            : "描述要分析、规划或修改的画布内容，输入 @ 引入节点",
        prompt: mergeAgentPromptReferenceTokens(agent.promptDraft, references),
        restoreState: options.restoreState ?? null,
        getSuggestions: () => mediaOnly
          ? listCanvasAgentPromptEditorAttachmentReferences(agent, { ordinalLabels: true })
          : listCanvasAgentNodeReferences(workbench.ui).map(buildAgentPromptEditorReference),
        onMentionSelect(item) {
          const referenceId = String(item.referenceId ?? item.assetId ?? item.id ?? "");
          const reference = listCanvasAgentNodeReferences(workbench.ui)
            .find((candidate) => candidate.nodeId === referenceId);
          if (!reference) return item;
          agent.promptNodeReferences = [
            ...(Array.isArray(agent.promptNodeReferences) ? agent.promptNodeReferences : [])
              .filter((candidate) => candidate.nodeId !== reference.nodeId),
            reference,
          ];
          return buildAgentPromptEditorReference(reference);
        },
        onMentionsChange(mentions) {
          const mentionReferenceIds = new Set((Array.isArray(mentions) ? mentions : [])
            .map((mention) => String(mention.referenceId ?? mention.assetId ?? mention.id ?? "")));
          const referenceByNodeId = new Map(
            listCanvasAgentNodeReferences(workbench.ui).map((reference) => [reference.nodeId, reference]),
          );
          const seenNodeIds = new Set();
          agent.promptNodeReferences = (Array.isArray(mentions) ? mentions : [])
            .map((mention) => referenceByNodeId.get(String(mention.referenceId ?? mention.assetId ?? mention.id ?? "")))
            .filter((reference) => reference && !seenNodeIds.has(reference.nodeId) && seenNodeIds.add(reference.nodeId));
          const attachments = Array.isArray(agent.promptAttachments) ? agent.promptAttachments : [];
          const retainedAttachments = mediaOnly
            ? attachments
            : attachments.filter((attachment) => mentionReferenceIds.has(
              `attachment:${String(attachment?.id ?? attachment?.storageObjectId ?? attachment?.fileGrantId ?? "").trim()}`,
            ));
          const removedAttachments = attachments.filter((attachment) => !retainedAttachments.includes(attachment));
          agent.promptAttachments = retainedAttachments;
          const canvasId = mediaOnly ? "free-generation" : String(workbench.ui?.selectedCanvasProjectId ?? "");
          if (canvasId && agent.conversationId && typeof agentApi.revokeFileGrant === "function") {
            for (const attachment of removedAttachments.filter((item) => item?.fileGrantId)) {
              void Promise.resolve(agentApi.revokeFileGrant(
                canvasId,
                agent.conversationId,
                attachment.fileGrantId,
              )).catch(() => undefined);
            }
          }
        },
        onChange({ prompt }) {
          agent.promptDraft = String(prompt ?? "");
          if (mediaOnly && agent.promptDraft.trim() === "/" && !agent.skillLibraryOpen) {
            agent.skillLibraryOpen = true;
            agent.skillQuery = "";
            queueMicrotask(() => { syncPanel(); surface.querySelector?.('[data-agent-field="skillQuery"]')?.focus?.(); });
          }
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
  const syncPanel = ({ liveOnly = false } = {}) => {
    const current = surface.querySelector?.("[data-canvas-agent-panel]");
    if (!current || typeof document === "undefined") return false;
    const timelineScroll = captureAgentTimelineScroll(current.querySelector?.(".canvas-agent-timeline"));
    const template = document.createElement("template");
    template.innerHTML = renderCanvasAgentPanel(ui);
    const next = template.content.firstElementChild;
    if (!next) return false;
    if (current.querySelector?.(".canvas-agent-config-disclosure[open]")) next.querySelector?.(".canvas-agent-config-disclosure")?.setAttribute("open", "");
    if (liveOnly && mediaOnly) {
      const currentTimeline = current.querySelector?.(".canvas-agent-timeline");
      const nextTimeline = next.querySelector?.(".canvas-agent-timeline");
      const currentStatus = current.querySelector?.(".canvas-agent-status");
      const nextStatus = next.querySelector?.(".canvas-agent-status");
      if (!currentTimeline || !nextTimeline) return false;
      const timelinePatched = syncAgentTimelineEntries(currentTimeline, nextTimeline);
      if (!timelinePatched) currentTimeline.replaceWith(nextTimeline);
      if (currentStatus && nextStatus) {
        currentStatus.className = nextStatus.className;
        currentStatus.textContent = nextStatus.textContent;
      }
      const currentSubmitGroup = current.querySelector?.(".canvas-agent-media-submit-group");
      const nextSubmitGroup = next.querySelector?.(".canvas-agent-media-submit-group");
      if (currentSubmitGroup && nextSubmitGroup && currentSubmitGroup.outerHTML !== nextSubmitGroup.outerHTML) {
        currentSubmitGroup.replaceWith(nextSubmitGroup);
      }
      const currentApproval = current.querySelector?.(".canvas-agent-approval");
      const nextApproval = next.querySelector?.(".canvas-agent-approval");
      if (currentApproval && nextApproval) currentApproval.replaceWith(nextApproval);
      else if (currentApproval) currentApproval.remove();
      else if (nextApproval) current.querySelector?.("[data-free-generation-form]")?.insertAdjacentElement?.("beforebegin", nextApproval);
      const currentError = current.querySelector?.(".canvas-agent-error");
      const currentNote = current.querySelector?.(".canvas-agent-submission-note");
      const nextNote = next.querySelector?.(".canvas-agent-submission-note");
      if (currentNote && !nextNote) currentNote.remove();
      else if (!currentNote && nextNote) current.querySelector?.(".canvas-agent-generation-config")?.insertAdjacentElement?.("beforebegin", nextNote);
      const nextError = next.querySelector?.(".canvas-agent-error");
      if (currentError && nextError) currentError.replaceWith(nextError);
      else if (currentError) currentError.remove();
      else if (nextError) current.querySelector?.("[data-free-generation-form]")?.insertAdjacentElement?.("afterend", nextError);
      restoreAgentTimelineScroll(
        timelinePatched ? currentTimeline : nextTimeline,
        timelineScroll,
        shouldFollowLatestTimeline(),
      );
      return true;
    }
    const promptInputState = promptEditorMount?.handle?.captureState?.() ?? null;
    disposePromptEditor();
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
  const syncMediaPreview = () => {
    const panel = surface.querySelector?.("[data-canvas-agent-panel]");
    const workspace = panel?.querySelector?.(".canvas-agent-media-workspace");
    if (!workspace) return false;
    const existing = panel.querySelector?.(".canvas-agent-media-lightbox");
    existing?.remove?.();
    if (agent.mediaPreview) {
      workspace.insertAdjacentHTML?.("beforeend", renderAgentMediaPreview(agent));
    }
    return Boolean(existing) || Boolean(agent.mediaPreview);
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
  const conversationCache = new Map();
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
    if (mediaOnly) return;
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
      () => void (mediaOnly && agent.status === "waiting_external"
        ? poll()
        : typeof agentApi.streamEvents === "function" ? stream() : poll()),
      Math.max(0, delay),
    );
  };

  const stream = async () => {
    if (disposed || streamInFlight || !agent.taskId) return;
    const canvasId = mediaOnly ? "free-generation" : String(workbench.ui?.selectedCanvasProjectId ?? "");
    if (!canvasId || typeof agentApi.streamEvents !== "function") return void poll();
    const taskId = agent.taskId;
    const generation = realtimeGeneration;
    const abortController = new AbortController();
    streamAbortController = abortController;
    streamInFlight = true;
    agent.polling = true;
    try {
      for await (const message of agentApi.streamEvents(canvasId, taskId, {
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
        const refreshedCreativeMessages = await refreshCreativeConversationMessages([event]);
        agent.error = "";
        if (mediaOnly && agent.status === "waiting_external") {
          await hydrateMediaMessages();
          syncPanel({ liveOnly: true });
          break;
        }
        syncPanel({ liveOnly: mediaOnly });
        if (TERMINAL_STATUSES.has(agent.status)) {
          if (!refreshedCreativeMessages) await refreshConversationMessages(agent.conversationId);
          syncPanel({ liveOnly: mediaOnly });
          break;
        }
      }
    } catch (error) {
      if (!abortController.signal.aborted && generation === realtimeGeneration) {
        agent.error = friendlyAgentError(error);
        syncPanel({ liveOnly: mediaOnly });
      }
    } finally {
      if (streamAbortController === abortController) streamAbortController = null;
      streamInFlight = false;
      if (!disposed && generation === realtimeGeneration && agent.taskId === taskId) schedulePoll(1_000);
    }
  };

  const poll = async () => {
    if (disposed || pollInFlight || !agent.taskId) return;
    const canvasId = mediaOnly ? "free-generation" : String(workbench.ui?.selectedCanvasProjectId ?? "");
    if (!canvasId || typeof agentApi.listEvents !== "function") return;
    pollInFlight = true;
    try {
      const payload = await agentApi.listEvents(canvasId, agent.taskId, {
        after: agent.sequence,
        limit: 200,
      });
      const events = Array.isArray(payload?.events) ? payload.events : [];
      let panelChanged = false;
      if (events.length) {
        reduceCanvasAgentEvents(agent, events);
        refreshCanvasAfterAgentMutation(events);
        agent.error = "";
        panelChanged = true;
        const refreshedCreativeMessages = await refreshCreativeConversationMessages(events);
        if (TERMINAL_STATUSES.has(agent.status) && !refreshedCreativeMessages) await refreshConversationMessages(agent.conversationId);
      }
      if (mediaOnly && agent.status === "waiting_external") {
        const previousMediaState = mediaMessageStateSignature(agent.messages);
        if (!(agent.messages ?? []).some(message => message.taskId === agent.taskId && message.generationTaskId)) {
          await refreshConversationMessages(agent.conversationId);
        }
        await hydrateMediaMessages();
        panelChanged = panelChanged || previousMediaState !== mediaMessageStateSignature(agent.messages);
      }
      if (panelChanged) syncPanel({ liveOnly: mediaOnly });
    } catch (error) {
      agent.error = friendlyAgentError(error);
      syncPanel({ liveOnly: mediaOnly });
    } finally {
      pollInFlight = false;
      schedulePoll();
    }
  };

  const ensureConversation = async () => {
    if (agent.conversationId) return agent.conversationId;
    const payload = await agentApi.createConversation({
      title: mediaOnly ? "自由生成" : "画布协作",
      ...(capabilityProfile ? { capabilityProfile } : {}),
    });
    const id = String(payload?.conversation?.id ?? payload?.id ?? "");
    if (!id) throw new Error("canvas_agent_conversation_missing");
    agent.conversationId = id;
    return id;
  };

  const hydrateMediaMessages = async () => {
    const conversationId = agent.conversationId;
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
    if (disposed || agent.conversationId !== conversationId) return agent.messages;
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
    const canvasId = mediaOnly ? "free-generation" : String(workbench.ui?.selectedCanvasProjectId ?? "");
    if (!canvasId || !conversationId || typeof agentApi.listMessages !== "function") return agent.messages;
    const payload = await agentApi.listMessages(canvasId, conversationId, { limit: 200 });
    if (agent.conversationId !== conversationId) return agent.messages;
    const rows = Array.isArray(payload?.messages) ? payload.messages : [];
    agent.messages = rows.map(normalizeAgentMessage).filter((message) => message.text || message.generationTaskId || message.creative).slice(-200);
    await hydrateMediaMessages();
    return agent.messages;
  };

  const refreshCreativeConversationMessages = async (incoming = []) => {
    if (!mediaOnly || !agent.conversationId) return false;
    const needsRefresh = (Array.isArray(incoming) ? incoming : []).some((event) => {
      const type = String(event?.eventType ?? "");
      if (type === "creative.updated") return true;
      if (type === "task.waiting_external" || type === "step.waiting_external") return true;
      return type === "task.paused" && String(event?.event?.reason ?? "") === "creative_question";
    });
    if (!needsRefresh) return false;
    await refreshConversationMessages(agent.conversationId);
    return true;
  };

  const cacheConversation = (conversationId = agent.conversationId) => {
    const id = String(conversationId ?? "").trim();
    if (!id) return;
    conversationCache.set(id, {
      taskId: agent.taskId,
      status: agent.status,
      events: [...agent.events],
      sequence: agent.sequence,
      messages: [...agent.messages],
      fileGrants: [...agent.fileGrants],
      fileGrantsStatus: agent.fileGrantsStatus,
    });
  };

  const restoreCachedConversation = (conversationId) => {
    const cached = conversationCache.get(String(conversationId ?? "").trim());
    if (!cached) return false;
    agent.taskId = cached.taskId;
    agent.status = cached.status;
    agent.events = [...cached.events];
    agent.sequence = cached.sequence;
    agent.messages = [...cached.messages];
    agent.messagesStatus = "ready";
    agent.fileGrants = [...cached.fileGrants];
    agent.fileGrantsStatus = cached.fileGrantsStatus;
    fileGrantsConversationId = conversationId;
    return true;
  };

  const loadTaskEvents = async (canvasId, taskId) => {
    if (!canvasId || !taskId || typeof agentApi.listEvents !== "function") return [];
    try {
      const payload = await agentApi.listEvents(canvasId, taskId, { after: 0, limit: 1000 });
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
    const conversation = (agent.conversations ?? []).find((item) => String(item.id) === conversationId);
    const cachedConversationIsStable = !conversation?.taskId || TERMINAL_STATUSES.has(String(conversation.taskStatus ?? ""));
    if (cachedConversationIsStable && restoreCachedConversation(conversationId)) {
      syncPanel();
      return agent.messages;
    }
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
      promptCreativeDocumentId: "",
      selectedSkillId: "",
      selectedModelOverrides: {},
      visualStyleId: "anime",
      visualStylePending: false,
      composerSettingsOpen: false,
      error: "",
    });
    syncPanel();
    if (!conversationId) return [];
    const canvasId = mediaOnly ? "free-generation" : String(workbench.ui?.selectedCanvasProjectId ?? "");
    if (!canvasId || typeof agentApi.listMessages !== "function") {
      agent.messagesStatus = "unavailable";
      agent.error = "会话历史暂不可用";
      syncPanel();
      return [];
    }
    try {
      await refreshConversationMessages(conversationId);
      cacheConversation(conversationId);
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
    const canvasId = mediaOnly ? "free-generation" : String(workbench.ui?.selectedCanvasProjectId ?? "");
    if (!canvasId || !conversationId || typeof agentApi.listFileGrants !== "function") {
      agent.fileGrants = [];
      agent.fileGrantsStatus = "unavailable";
      fileGrantsConversationId = "";
      return [];
    }
    agent.fileGrantsStatus = "loading";
    try {
      const payload = await agentApi.listFileGrants(canvasId, conversationId);
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
    const references = mediaOnly ? [] : (Array.isArray(agent.promptNodeReferences) ? agent.promptNodeReferences : []);
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
      if (typeof agentApi.createFileGrant !== "function") {
        throw new Error("canvas_agent_file_grant_unavailable");
      }
      const payload = await agentApi.createFileGrant(canvasId, conversationId, {
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
    const canvasId = mediaOnly ? "free-generation" : String(workbench.ui?.selectedCanvasProjectId ?? "");
    const candidates = Array.from(files ?? []).filter(Boolean).slice(0, 8);
    if (!canvasId || !candidates.length) return;
    if (typeof workbench.api?.uploadFile !== "function" || typeof agentApi.createFileGrant !== "function") {
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
      const selectedFiles = candidates.slice(0, remaining);
      let nextIndex = 0;
      let uploadFailure = null;
      const uploadOne = async (file) => {
        const kind = resolveAgentAttachmentKind(file);
        if (!kind) throw new Error(`不支持的附件类型：${file.name || "文件"}`);
        const result = await workbench.api.uploadFile(file, {
          category: mediaOnly ? "free-generation-attachments" : "canvas-agent-attachments",
          projectId: null,
          ...(mediaOnly ? {} : { canvasProjectId: canvasId }),
          uploadLimits: AGENT_ATTACHMENT_UPLOAD_LIMITS,
        });
        const upload = result?.upload ?? result ?? {};
        const storageObjectId = String(upload.storageObjectId ?? result?.storageObject?.id ?? "").trim();
        if (!storageObjectId) throw new Error("canvas_agent_attachment_upload_missing");
        const grant = await agentApi.createFileGrant(canvasId, conversationId, {
          storageObjectId,
          purpose: `Canvas Agent attachment: ${String(file.name ?? "attachment").slice(0, 120)}`,
          expiresInSeconds: 3_600,
        });
        const fileGrantId = String(grant?.grant?.id ?? "").trim();
        if (!fileGrantId) throw new Error("canvas_agent_attachment_grant_missing");
        return {
          id: storageObjectId,
          storageObjectId,
          fileGrantId,
          name: String(file.name ?? "附件").slice(0, 160),
          contentType: String(file.type ?? "application/octet-stream").toLowerCase(),
          sizeBytes: Number(file.size ?? 0),
          kind,
          previewUrl: kind === "image" || kind === "video"
            ? `/api/storage/objects/${encodeURIComponent(storageObjectId)}/content?thumbnail=1`
            : "",
        };
      };
      const worker = async () => {
        while (!uploadFailure && nextIndex < selectedFiles.length) {
          const index = nextIndex;
          nextIndex += 1;
          try {
            uploaded[index] = await uploadOne(selectedFiles[index]);
          } catch (error) {
            uploadFailure ??= error;
          }
        }
      };
      await Promise.all(
        Array.from(
          { length: Math.min(AGENT_ATTACHMENT_UPLOAD_CONCURRENCY, selectedFiles.length) },
          () => worker(),
        ),
      );
      if (uploadFailure) throw uploadFailure;
      await loadFileGrants(conversationId);
    } finally {
      const completedUploads = uploaded.filter(Boolean);
      if (completedUploads.length) {
        agent.promptAttachments = [...current, ...completedUploads];
        if (!mediaOnly) {
          agent.promptDraft = appendAgentPromptAttachmentTokens(agent.promptDraft, completedUploads);
        }
      }
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
    if (mediaOnly && agent.modelsStatus === "ready") return agent.models;
    const canvasId = mediaOnly ? "free-generation" : String(workbench.ui?.selectedCanvasProjectId ?? "");
    if (!canvasId || typeof agentApi.listModels !== "function") {
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
      const payload = await agentApi.listModels();
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

  const loadGenerationModels = async () => {
    if (!mediaOnly || disposed || agent.generationModelsStatus === "loading") return agent.generationModels;
    if (agent.generationModelsStatus === "ready") return agent.generationModels;
    if (typeof workbench.api?.listGlobalGenerationConfig !== "function") {
      agent.generationModels = [];
      agent.generationModelsStatus = "unavailable";
      agent.generationModelsError = "生成模型配置暂不可用";
      syncPanel();
      return [];
    }
    agent.generationModelsStatus = "loading";
    agent.generationModelsError = "";
    syncPanel();
    try {
      const payloads = await Promise.all(FREE_GENERATION_KINDS.map((kind) => (
        workbench.api.listGlobalGenerationConfig({ mediaType: kind.id })
      )));
      const byCode = new Map();
      for (const payload of payloads) {
        for (const rawModel of Array.isArray(payload?.models) ? payload.models : []) {
          const model = normalizeFreeGenerationModel(rawModel);
          if (model) byCode.set(`${model.mediaType}:${model.modelCode}`, model);
        }
      }
      agent.generationModels = [...byCode.values()];
      agent.generationModelsStatus = "ready";
      for (const kind of FREE_GENERATION_KINDS) {
        const models = listFreeGenerationModels(agent, kind.id);
        const configuredDefault = String(
          payloads.find((payload) => Array.isArray(payload?.models) && payload.models.some((model) => normalizeFreeGenerationMediaType(model?.mediaType ?? model?.media_type ?? model?.mediaKind) === kind.id))?.[
            kind.id === "image" ? "defaultImageModelCode" : kind.id === "video" ? "defaultVideoModelCode" : "defaultAudioModelCode"
          ] ?? "",
        ).trim();
        const selected = models.find((model) => model.modelCode === String(agent.generationModelCodes?.[kind.id] ?? "").trim())
          ?? models.find((model) => model.modelCode === configuredDefault)
          ?? models[0]
          ?? null;
        agent.generationModelCodes[kind.id] = selected?.modelCode ?? "";
        if (selected) {
          agent.generationParameters[kind.id] = resolveFreeGenerationParameterValues(agent, kind.id, selected);
        }
      }
      if (!agent.generationModels.length) agent.generationModelsError = "管理员尚未启用生成模型";
    } catch (error) {
      agent.generationModels = [];
      agent.generationModelsStatus = "unavailable";
      agent.generationModelsError = sanitizeMediaOnlyAgentCopy(friendlyAgentError(error));
    }
    syncPanel();
    return agent.generationModels;
  };

  const loadVisualStyles = async () => {
    if (!mediaOnly || disposed || typeof workbench.api?.getProjectStyles !== "function") return;
    try {
      const payload = await workbench.api.getProjectStyles();
      if (disposed) return;
      const rows = Array.isArray(payload?.styles) ? payload.styles : Array.isArray(payload?.data) ? payload.data : [];
      agent.projectVisualStyles = rows.filter(style => style && style.status !== "disabled").map(style => ({
        id: String(style.id ?? style.code ?? ""), label: String(style.name ?? ""), code: String(style.code ?? ""),
        instruction: String(style.promptContent ?? style.prompt_content ?? ""),
      })).filter(style => style.id && style.label && style.instruction);
      if (agent.visualStyleId === "anime" && !agent.visualStylePending) {
        const anime = (!(agent.messages ?? []).some(message => message.role === "user") && agent.projectVisualStyles.find(style => /^(?:CG|GC)\s*(?:动画|动漫)(?:风格)?$/i.test(style.label)))
          || agent.projectVisualStyles.find(style => style.code === "anime_2d" || /^(二次元|动漫|日系动漫)$/.test(style.label));
        if (anime) agent.visualStyleId = anime.id;
      }
      agent.visualStylesError = "";
    } catch {
      agent.visualStylesError = "项目风格暂未加载，可稍后重新打开会话。";
    }
    syncPanel();
  };

  const loadConversations = async ({ force = false } = {}) => {
    if (disposed || typeof agentApi.listConversations !== "function") return [];
    if (mediaOnly && agent.freeGenerationConversationsLoaded && !force) return agent.conversations;
    const canvasId = mediaOnly ? "free-generation" : String(workbench.ui?.selectedCanvasProjectId ?? "");
    if (!canvasId) return [];
    try {
      const payload = await agentApi.listConversations({ limit: 50 });
      agent.conversations = Array.isArray(payload?.conversations) ? payload.conversations : [];
      if (mediaOnly) agent.freeGenerationConversationsLoaded = true;
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
    const canvasId = mediaOnly ? "free-generation" : String(workbench.ui?.selectedCanvasProjectId ?? "");
    if (!canvasId || typeof agentApi.listMessages !== "function") {
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
        const payload = await agentApi.listMessages(canvasId, conversation.id, { limit: 200 });
        return {
          conversation,
          messages: (Array.isArray(payload?.messages) ? payload.messages : []).map(normalizeAgentMessage),
        };
      }));
      const seeds = collectAgentTaskSeeds(histories, agent);
      const items = await Promise.all([...seeds.values()].map(async (seed) => {
        let events = seed.taskId === agent.taskId ? [...agent.events] : [];
        if (!events.length && typeof agentApi.listEvents === "function") {
          try {
            const payload = await agentApi.listEvents(canvasId, seed.taskId, { after: 0, limit: 1000 });
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
    const canvasId = mediaOnly ? "free-generation" : String(workbench.ui?.selectedCanvasProjectId ?? "");
    if (!canvasId || !taskId) throw new Error("canvas_agent_task_missing");
    const payload = await agentApi.controlTask(canvasId, taskId, action, input);
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
    loadGenerationModels,
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
      if (agent.generationMenuOpen && !target?.closest?.(".home-agent-model-picker, .canvas-agent-free-mode-picker, .episode-replica-control-wrap, .episode-replica-video-settings-wrap")) {
        agent.generationMenuOpen = "";
        syncPanel();
        return true;
      }
      if (agent.generationPermissionMenuOpen && !target?.closest?.(".canvas-agent-generation-permission")) {
        agent.generationPermissionMenuOpen = false;
        syncPanel();
        return true;
      }
      if (!agent.modeMenuOpen || target?.closest?.(".canvas-agent-mode-picker")) return false;
      agent.modeMenuOpen = false;
      syncPanel();
      return true;
    },
    handleInput(target) {
      if (target?.matches?.("[data-agent-attachment-input]")) {
        const files = Array.from(target.files ?? []);
        target.value = "";
        void run("upload-agent-attachments", () => uploadAgentAttachments(files));
        return true;
      }
      const field = String(target?.dataset?.agentField ?? "");
      if (field === "visualStyleId" && mediaOnly) {
        if (!freeVisualStyles(agent).some(style => style.id === target.value)) return true;
        const settingsScrollTop = surface.querySelector?.(".canvas-agent-customize-panel")?.scrollTop ?? 0;
        agent.visualStyleId = target.value;
        agent.visualStylePending = true;
        syncPanel();
        if (target.tagName === "SELECT") {
          surface.querySelector?.('[data-agent-field="visualStyleId"]')?.focus?.({ preventScroll: true });
          const settings = surface.querySelector?.(".canvas-agent-customize-panel");
          if (settings) settings.scrollTop = settingsScrollTop;
        }
        return true;
      }
      if (field === "skillQuery" && mediaOnly) {
        agent.skillQuery = String(target.value ?? "").slice(0, 100);
        const results = surface.querySelector?.("[data-skill-results]");
        if (results) results.innerHTML = renderFreeConversationSkillResults(agent);
        return true;
      }
      if (field === "generationModelCode") {
        const kind = normalizeFreeGenerationKind(target?.dataset?.generationKind ?? agent.generationKind);
        const model = listFreeGenerationModels(agent, kind).find((item) => item.modelCode === String(target.value ?? ""));
        if (!model) return true;
        agent.generationModelCodes[kind] = model.modelCode;
        agent.selectedModelOverrides[kind] = model.modelCode;
        agent.generationParameters[kind] = { ...(model.defaultParams ?? {}) };
        syncPanel();
        return true;
      }
      if (field === "generationKind") {
        agent.generationKind = normalizeFreeGenerationKind(target.value);
        if (mediaOnly) agent.mode = "c";
        syncPanel();
        return true;
      }
      if (field === "generationParameter") {
        const kind = normalizeFreeGenerationKind(target?.dataset?.generationKind ?? agent.generationKind);
        const parameter = String(target?.dataset?.generationParameter ?? "").trim();
        const model = resolveSelectedFreeGenerationModel(agent, kind);
        if (!parameter || !model) return true;
        agent.generationParameters[kind] = {
          ...resolveFreeGenerationParameterValues(agent, kind, model),
          [parameter]: coerceFreeGenerationParameterValue(model, parameter, target.value),
        };
        syncPanel();
        return true;
      }
      if (field === "conversationTitle") {
        agent.titleDraft = Array.from(String(target.value ?? "")).slice(0, 10).join("");
        return true;
      }
      if (!field || !Object.hasOwn(agent, field)) return false;
      const value = String(target.value ?? "");
      if (field === "conversationId" && value !== agent.conversationId) {
        cacheConversation();
        agent.conversationId = value;
        void loadMessages(value);
        return true;
      }
      agent[field] = value;
      if (field === "promptDraft") {
        if (mediaOnly && value.trim() === "/" && !agent.skillLibraryOpen) {
          agent.skillLibraryOpen = true;
          agent.skillQuery = "";
          syncPanel();
          queueMicrotask(() => surface.querySelector?.('[data-agent-field="skillQuery"]')?.focus?.());
          return true;
        }
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
      if (event.key === "Escape" && mediaOnly && (agent.composerSettingsOpen || agent.generationMenuOpen === "free-generation:kind")) {
        event.preventDefault();
        const settings = agent.composerSettingsOpen;
        agent.composerSettingsOpen = false;
        agent.generationMenuOpen = "";
        syncPanel();
        queueMicrotask(() => surface.querySelector?.(settings ? '[data-agent-action="toggle-composer-settings"]' : '[data-field="kind"]')?.focus?.());
        return true;
      }
      if (event.key === "Escape" && agent.skillLibraryOpen) {
        event.preventDefault();
        agent.skillLibraryOpen = false;
        syncPanel();
        queueMicrotask(() => surface.querySelector?.('[data-agent-action="toggle-skill-library"]')?.focus?.());
        return true;
      }
      if (event.key === "Enter" && target?.dataset?.agentField === "skillQuery") {
        event.preventDefault();
        return true;
      }
      if (event.key === "Escape" && agent.generationPermissionMenuOpen) {
        event.preventDefault();
        agent.generationPermissionMenuOpen = false;
        syncPanel();
        queueMicrotask(() => surface.querySelector?.('[data-agent-action="toggle-free-generation-permission-menu"]')?.focus?.());
        return true;
      }
      if (event.key === "Escape" && agent.modeMenuOpen) {
        event.preventDefault();
        agent.modeMenuOpen = false;
        syncPanel();
        queueMicrotask(() => surface.querySelector?.('[data-agent-action="toggle-mode-menu"]')?.focus?.());
        return true;
      }
      if (event.key === "Escape" && agent.mediaPreview) {
        event.preventDefault();
        agent.mediaPreview = null;
        if (!syncMediaPreview()) syncPanel();
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
          agent.titleEditingConversationId = "";
          syncPanel();
          return true;
        }
        return false;
      }
      if (target?.dataset?.agentField !== "promptDraft" || event.key !== "Enter" || event.shiftKey) return false;
      event.preventDefault();
      void this.handleAction({ dataset: { agentAction: agent.taskId && !TERMINAL_STATUSES.has(agent.status) && !shouldStartNewFreeGenerationTask() ? "interject-prompt" : "send" } });
      return true;
    },
    handleDoubleClick(target) {
      const conversationTarget = target?.closest?.("[data-agent-conversation-title]")
        ?? target?.closest?.("[data-agent-action=\"select-agent-conversation\"]");
      const targetConversationId = String(conversationTarget?.dataset?.conversationId ?? "");
      const conversationId = targetConversationId || String(agent.conversationId ?? "");
      if (!conversationTarget || !conversationId) return false;
      const conversation = (agent.conversations ?? []).find((item) => item.id === conversationId);
      agent.conversationId = conversationId;
      agent.titleDraft = normalizeConversationTitle(conversation?.title ?? "新会话");
      agent.titleEditing = true;
      agent.titleEditingConversationId = mediaOnly && targetConversationId ? conversationId : "";
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
      if (action === "set-generation-kind") {
        agent.generationKind = normalizeFreeGenerationKind(target.dataset.generationKind);
        syncPanel();
        return true;
      }
      if (action === "select-free-conversation-skill") {
        const skillId = String(target.dataset.skillId ?? "").trim();
        if (!FREE_CONVERSATION_SKILLS.some((skill) => skill.id === skillId)) return true;
        agent.selectedSkillId = skillId;
        const knownSkillIds = FREE_CONVERSATION_SKILLS.map((skill) => skill.id).join("|");
        const existingSkillPrefix = new RegExp(`^(?:/(?:${knownSkillIds})(?:\\s+|$))+`);
        agent.promptDraft = String(agent.promptDraft ?? "").replace(existingSkillPrefix, "").replace(/^\/\s*$/, "").trimStart();
        agent.skillLibraryOpen = false;
        syncPanel();
        return true;
      }
      if (mediaOnly && ["copy-agent-text", "reuse-agent-text"].includes(action)) {
        const message = target.dataset.messageId ? agent.messages.find(item => item.id === target.dataset.messageId) : agent.messages[Number(target.dataset.messageIndex)];
        if (!message || !["user", "assistant"].includes(message.role) || !message.text) return true;
        const text = reusableMessageText(message, agent);
        if (action === "copy-agent-text") {
          try {
            if (!globalThis.navigator?.clipboard?.writeText) throw new Error("clipboard_unavailable");
            await globalThis.navigator.clipboard.writeText(text);
            agent.copiedMessageKey = String(message.id ?? target.dataset.messageIndex);
            agent.error = "";
          } catch {
            agent.copiedMessageKey = "";
            agent.error = "复制未成功，可以点击“放入输入框”后手动复制。";
          }
        } else {
          agent.promptDraft = [String(agent.promptDraft ?? "").trimEnd(), text].filter(Boolean).join("\n\n");
          agent.error = "";
        }
        syncPanel();
        if (action === "reuse-agent-text") queueMicrotask(() => surface.querySelector?.('[data-agent-prompt-input], [data-agent-field="promptDraft"]')?.focus?.());
        return true;
      }
      if (action === "toggle-skill-library" && mediaOnly) {
        agent.composerSettingsOpen = false;
        agent.skillLibraryOpen = !agent.skillLibraryOpen;
        agent.generationMenuOpen = "";
        agent.skillQuery = "";
        syncPanel();
        queueMicrotask(() => surface.querySelector?.(agent.skillLibraryOpen ? '[data-agent-field="skillQuery"]' : '[data-agent-action="toggle-skill-library"]')?.focus?.());
        return true;
      }
      if (action === "clear-free-conversation-skill" && mediaOnly) {
        agent.selectedSkillId = "";
        const ids = FREE_CONVERSATION_SKILLS.map(skill => skill.id).join("|");
        agent.promptDraft = String(agent.promptDraft ?? "").replace(new RegExp(`^/(?:${ids})(?:\\s+|$)`), "");
        syncPanel();
        return true;
      }
      if (action === "reuse-agent-media" && mediaOnly) {
        const message = agent.messages.find(item => item.id === String(target.dataset.messageId ?? ""));
        const media = message?.media;
        if (!media?.storageObjectId || !media.url || !isSuccessfulAgentMediaStatus(media.status)) return true;
        const intent = String(target.dataset.intent ?? "reference");
        if (intent === "video" && media.kind !== "image") return true;
        await run(action, async () => {
          const conversationId = agent.conversationId;
          const payload = await agentApi.createFileGrant("free-generation", conversationId, { storageObjectId: media.storageObjectId, purpose: "generation_reference", expiresInSeconds: 3600 });
          const grantId = String(payload?.grant?.id ?? "");
          if (!grantId) throw new Error("canvas_agent_file_grant_unavailable");
          if (disposed || agent.conversationId !== conversationId) return;
          agent.promptAttachments = [...agent.promptAttachments.filter(item => item.storageObjectId !== media.storageObjectId), {
            id: media.storageObjectId, storageObjectId: media.storageObjectId, fileGrantId: grantId,
            kind: media.kind, name: media.title || "已选作品", previewUrl: media.previewUrl || media.url,
          }];
          if (intent === "video") {
            agent.generationKind = "agent";
            const ids = FREE_CONVERSATION_SKILLS.map(skill => skill.id).join("|");
            const draft = String(agent.promptDraft ?? "").replace(new RegExp(`^/(?:${ids})(?:\\s+|$)`), "");
            agent.selectedSkillId = "image-to-video";
            agent.promptDraft = draft || "以已选图片为参考，保留人物和画风，生成一段视频。";
          } else if (intent === "revise" && !String(agent.promptDraft ?? "").trim()) {
            agent.generationKind = "agent";
            agent.promptDraft = "保留已选作品的主体与画风，只调整：";
          }
        });
        return true;
      }
      if (action === "continue-creative-document") {
        const title = String(target.dataset.documentTitle ?? "文档").trim().slice(0, 160);
        const documentId = String(target.dataset.documentId ?? "").trim().slice(0, 160);
        if (!documentId) return true;
        const prompt = `继续编辑《${title}》：`;
        agent.promptCreativeDocumentId = documentId;
        if (!String(agent.promptDraft ?? "").trim()) agent.promptDraft = prompt;
        syncPanel();
        return true;
      }
      if (action === "answer-creative-question") {
        const answer = String(target.dataset.answer ?? "").trim();
        const questionTaskId = String(target.dataset.questionTaskId ?? "").trim();
        const questionId = String(target.dataset.questionId ?? "").trim();
        const fromPrompt = target.dataset.fromPrompt === "true";
        const pendingQuestion = resolvePendingCreativeQuestion(agent.messages);
        if (
          !answer
          || agent.status !== "paused"
          || !questionTaskId
          || questionTaskId !== String(agent.taskId ?? "")
          || !pendingQuestion
          || questionId !== String(pendingQuestion.creative?.id ?? "")
        ) return true;
        agent.promptCreativeDocumentId = "";
        agent.interjectionDraft = answer;
        await this.handleAction({ dataset: { agentAction: "interject" } });
        if (agent.error) return true;
        if (fromPrompt) {
          agent.promptDraft = "";
          agent.selectedSkillId = "";
          agent.selectedModelOverrides = {};
          agent.visualStylePending = false;
          agent.promptMention = null;
          agent.promptNodeReferences = [];
          agent.promptAttachments = [];
        }
        await run("resume", () => control("resume"));
        return true;
      }
      if (action === "toggle-free-generation-permission-menu") {
        agent.generationPermissionMenuOpen = !agent.generationPermissionMenuOpen;
        agent.generationMenuOpen = "";
        agent.modeMenuOpen = false;
        syncPanel();
        if (agent.generationPermissionMenuOpen) {
          queueMicrotask(() => surface.querySelector?.('[data-agent-action="set-free-generation-permission"][aria-selected="true"]')?.focus?.());
        }
        return true;
      }
      if (action === "set-free-generation-permission") {
        agent.generationPermissionMode = target.dataset.permissionMode === "approval_required"
          ? "approval_required"
          : "full_access";
        agent.generationPermissionMenuOpen = false;
        syncPanel();
        queueMicrotask(() => surface.querySelector?.('[data-agent-action="toggle-free-generation-permission-menu"]')?.focus?.());
        return true;
      }
      if (action === "toggle-free-generation-menu") {
        agent.skillLibraryOpen = false;
        const field = String(target.dataset.field ?? "").trim();
        if (field === "kind") agent.composerSettingsOpen = false;
        const scopedField = field ? `free-generation:${field}` : "";
        agent.generationMenuOpen = agent.generationMenuOpen === scopedField ? "" : scopedField;
        syncPanel();
        return true;
      }
      if (action === "toggle-composer-settings" && mediaOnly) {
        agent.composerSettingsOpen = !agent.composerSettingsOpen;
        agent.skillLibraryOpen = false;
        agent.generationMenuOpen = "";
        agent.generationPermissionMenuOpen = false;
        syncPanel();
        queueMicrotask(() => surface.querySelector?.(agent.composerSettingsOpen ? '.canvas-agent-customize-panel button' : '[data-agent-action="toggle-composer-settings"]')?.focus?.());
        return true;
      }
      if (action === "select-free-generation-model") {
        const kind = normalizeFreeGenerationKind(target.dataset.modelKind ?? agent.generationKind);
        const modelCode = String(target.dataset.modelId ?? "").trim();
        const models = listFreeGenerationModels(agent, kind);
        const modelIndex = Number(target.dataset.modelIndex);
        const model = Number.isInteger(modelIndex) && modelIndex >= 0
          ? models[modelIndex]
          : models.find((item) => item.modelCode === modelCode);
        if (!model) return true;
        agent.generationModelCodes[kind] = model.modelCode;
        agent.selectedModelOverrides[kind] = model.modelCode;
        agent.generationParameters[kind] = { ...(model.defaultParams ?? {}) };
        agent.generationMenuOpen = "";
        syncPanel();
        return true;
      }
      if (action === "select-agent-text-model") {
        const modelIndex = Number(target.dataset.modelIndex);
        const model = Number.isInteger(modelIndex) && modelIndex >= 0
          ? agent.models[modelIndex]
          : null;
        if (!model?.modelCode) return true;
        agent.modelCode = model.modelCode;
        agent.generationMenuOpen = "";
        syncPanel();
        return true;
      }
      if (action === "select-free-generation-kind") {
        agent.generationKind = normalizeFreeGenerationKind(target.dataset.value);
        agent.mode = "c";
        agent.generationMenuOpen = "";
        syncPanel();
        return true;
      }
      if (action === "select-free-generation-parameter") {
        const kind = normalizeFreeGenerationKind(agent.generationKind);
        const parameter = String(target.dataset.field ?? "").trim();
        const model = resolveSelectedFreeGenerationModel(agent, kind);
        if (!parameter || !model) return true;
        agent.generationParameters[kind] = {
          ...resolveFreeGenerationParameterValues(agent, kind, model),
          [parameter]: coerceFreeGenerationParameterValue(model, parameter, target.dataset.value),
        };
        agent.generationMenuOpen = String(target.dataset.keepMenuOpenMenu ?? agent.generationMenuOpen);
        syncPanel();
        return true;
      }
      if (action === "open-agent-media-preview") {
        const messageId = String(target.dataset.messageId ?? "");
        const media = (agent.messages ?? []).find((item) => String(item.id ?? "") === messageId)?.media;
        if (!media?.url || !["image", "video"].includes(media.kind)) return true;
        agent.mediaPreview = {
          kind: media.kind,
          title: String(media.title ?? "生成结果"),
          url: String(media.sourceUrl ?? media.url),
        };
        if (!syncMediaPreview()) syncPanel();
        return true;
      }
      if (action === "download-agent-media") {
        const messageId = String(target.dataset.messageId ?? "");
        const media = (agent.messages ?? []).find((item) => String(item.id ?? "") === messageId)?.media;
        if (!media?.url || !["image", "video", "audio"].includes(media.kind)) return true;
        try {
          await downloadAgentMedia(media);
        } catch (error) {
          agent.error = `媒体下载失败：${String(error?.message ?? "请稍后重试")}`;
          syncPanel();
        }
        return true;
      }
      if (action === "close-agent-media-preview") {
        agent.mediaPreview = null;
        if (!syncMediaPreview()) syncPanel();
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
          const canvasId = mediaOnly ? "free-generation" : String(workbench.ui?.selectedCanvasProjectId ?? "");
          if (attachment?.fileGrantId && canvasId && agent.conversationId
            && typeof agentApi.revokeFileGrant === "function") {
            await agentApi.revokeFileGrant(canvasId, agent.conversationId, attachment.fileGrantId);
          }
          if (attachment) {
            agent.promptDraft = removeAgentPromptAttachmentToken(agent.promptDraft, attachment);
          }
          agent.promptAttachments = (Array.isArray(agent.promptAttachments) ? agent.promptAttachments : [])
            .filter((item) => String(item?.id ?? "") !== attachmentId);
        });
        return true;
      }
      if (action === "open-agent-history") {
        agent.historyOpen = !agent.historyOpen;
        if (agent.historyOpen) await loadConversations({ force: true });
        syncPanel();
        return true;
      }
      if (action === "select-agent-conversation") {
        const conversationId = String(target.dataset.conversationId ?? "");
        if (!conversationId || conversationId === String(agent.conversationId ?? "")) return true;
        agent.historyOpen = false;
        agent.titleEditing = false;
        agent.titleEditingConversationId = "";
        cacheConversation();
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
            url: media.sourceUrl || media.url,
            previewUrl: media.previewUrl || media.url,
            sourceUrl: media.sourceUrl || media.url,
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
        Object.assign(agent, { conversationId: "", taskId: "", status: "idle", events: [], messages: [], fileGrants: [], memoryRecords: [], promptAttachments: [], promptCreativeDocumentId: "", sequence: 0, error: "", panelView: "timeline", panelOpen: true, historyOpen: false, titleEditing: false, titleEditingConversationId: "", titleDraft: "", mediaPreview: null });
        persistCanvasAgentUiState(workbench.ui, agent);
        void Promise.resolve(workbench.persistCanvasSession?.()).catch(() => undefined);
        if (mediaOnly) {
          syncPanel();
          return true;
        }
        await run(action, async () => {
          const hasPriorMessage = agent.messages.length > 0;
          const conversationId = await ensureConversation();
          agent.conversations = [{ id: conversationId, title: mediaOnly ? "自由生成" : "画布协作", status: "active" }, ...(agent.conversations ?? []).filter((item) => item.id !== conversationId)];
        });
        return true;
      }
      if (action === "save-conversation-title") {
        await run(action, async () => {
          const canvasId = mediaOnly ? "free-generation" : String(workbench.ui?.selectedCanvasProjectId ?? "");
          const conversationId = agent.conversationId;
          const conversation = (agent.conversations ?? []).find((item) => item.id === conversationId);
          if (!canvasId || !conversation) throw new Error("canvas_agent_conversation_missing");
          const title = normalizeConversationTitle(agent.titleDraft || conversation.title);
          if (typeof agentApi.updateConversation === "function") {
            const payload = await agentApi.updateConversation({
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
            agent.titleEditingConversationId = "";
          }
        });
        return true;
      }
      if (action === "grant-selected-file") {
        await run(action, async () => {
          const canvasId = mediaOnly ? "free-generation" : String(workbench.ui?.selectedCanvasProjectId ?? "");
          const selectedFile = resolveSelectedAgentFileReference(workbench.ui);
          if (!canvasId || !agent.conversationId || !selectedFile?.storageObjectId) {
            throw new Error("canvas_agent_file_grant_target_missing");
          }
          if (typeof agentApi.createFileGrant !== "function") {
            throw new Error("canvas_agent_file_grant_unavailable");
          }
          await agentApi.createFileGrant(canvasId, agent.conversationId, {
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
          const canvasId = mediaOnly ? "free-generation" : String(workbench.ui?.selectedCanvasProjectId ?? "");
          const grantId = String(target.dataset.grantId ?? "");
          if (!canvasId || !agent.conversationId || !grantId || typeof agentApi.revokeFileGrant !== "function") {
            throw new Error("canvas_agent_file_grant_unavailable");
          }
          await agentApi.revokeFileGrant(canvasId, agent.conversationId, grantId);
          agent.fileGrants = agent.fileGrants.filter((grant) => grant.id !== grantId);
        });
        return true;
      }
     if (action === "archive-conversation" || action === "restore-conversation") {
       await run(action, async () => {
         const canvasId = mediaOnly ? "free-generation" : String(workbench.ui?.selectedCanvasProjectId ?? "");
          const conversationId = String(target.dataset.conversationId ?? agent.conversationId);
          if (!canvasId || !conversationId) throw new Error("canvas_agent_conversation_missing");
         const status = action === "archive-conversation" ? "archived" : "active";
         const payload = await agentApi.updateConversation({
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
          const canvasId = mediaOnly ? "free-generation" : String(workbench.ui?.selectedCanvasProjectId ?? "");
          const deletedId = String(target.dataset.conversationId ?? agent.conversationId);
          if (!canvasId || !deletedId) throw new Error("canvas_agent_conversation_missing");
          const deletingCurrentConversation = deletedId === agent.conversationId;
          if (deletingCurrentConversation) stopPolling();
          await agentApi.deleteConversation(deletedId);
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
          const canvasId = mediaOnly ? "free-generation" : String(workbench.ui?.selectedCanvasProjectId ?? "");
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
          const payload = await agentApi.updateConversation({
            conversationId: agent.conversationId,
            ...patch,
          });
          const updated = payload?.conversation ?? patch;
          agent.conversations = (agent.conversations ?? []).map((item) => item.id === agent.conversationId ? { ...item, ...updated } : item);
        });
        return true;
      }
      if (action === "send") {
        if (shouldAnswerCreativeQuestion()) {
          return this.handleAction({ dataset: {
            agentAction: "answer-creative-question",
            questionTaskId: String(agent.taskId ?? ""),
            questionId: String(resolvePendingCreativeQuestion(agent.messages)?.creative?.id ?? ""),
            answer: String(agent.promptDraft ?? ""),
            fromPrompt: "true",
          } });
        }
        if (agent.taskId && !TERMINAL_STATUSES.has(agent.status) && !shouldStartNewFreeGenerationTask()) {
          await run("stop", () => control("stop"));
          return true;
        }
        await run(action, async () => {
          if (mediaOnly) agent.mode = "c";
          const text = mediaOnly ? freeConversationSubmissionText(agent) : String(agent.promptDraft ?? "").trim();
          const modelCode = String(agent.modelCode ?? "").trim();
          const creativeDocumentId = String(agent.promptCreativeDocumentId ?? "").trim();
          if (!text) throw new Error("请输入 Agent 指令。");
          if (mediaOnly && isFreeConversationSkillOnlyPrompt(text)) {
            throw new Error("请在已选技能后补充具体创作需求。");
          }
          if (!mediaOnly && (
            agent.modelsStatus !== "ready"
            || !agent.models.some((model) => model.modelCode === modelCode)
          )) {
            throw new Error("管理员尚未配置可用文本模型。");
          }
          if (!mediaOnly) {
            const selectedModel = agent.models.find((model) => model.modelCode === modelCode);
            assertAgentModelMediaSupport(selectedModel, agent.promptAttachments, agent.promptNodeReferences);
          }
          const generationKind = normalizeFreeGenerationKind(agent.generationKind);
          const agentGeneration = generationKind === "agent";
          const selectedGenerationModel = mediaOnly && !agentGeneration
            ? resolveSelectedFreeGenerationModel(agent, generationKind)
            : null;
          if (mediaOnly && !agentGeneration && !selectedGenerationModel) {
            throw new Error("当前生成类型没有可用模型，请切换类型或联系管理员配置。");
          }
          if (mediaOnly && agentGeneration && !hasSelectedFreeConversationTextModel(agent)) {
            throw new Error("管理员尚未配置可用文本模型。");
          }
          const preferredModels = mediaOnly
            ? Object.fromEntries(FREE_GENERATION_KINDS.map((kind) => [
                kind.id,
                resolveSelectedFreeGenerationModel(agent, kind.id)?.modelCode ?? "",
              ]).filter(([, modelCode]) => modelCode))
            : agent.promptPreferredModels;
          const preferredGenerationParameters = mediaOnly
            ? Object.fromEntries(FREE_GENERATION_KINDS.map((kind) => {
                const selectedModel = resolveSelectedFreeGenerationModel(agent, kind.id);
                return agentGeneration && !selectedModel
                  ? null
                  : [kind.id, resolveFreeGenerationParameterValues(agent, kind.id, selectedModel)];
              }).filter(Boolean))
            : {};
          const hasPriorMessage = agent.messages.length > 0;
          const conversationId = await ensureConversation();
          const canvasId = mediaOnly ? "free-generation" : String(workbench.ui?.selectedCanvasProjectId ?? "");
          const { references, fileGrantIds, messageNodeReferences } = await prepareAgentMessageNodeReferences(
            canvasId,
            conversationId,
          );
          const payload = await agentApi.sendMessage(canvasId, conversationId, {
            ...(modelCode ? { modelCode } : {}),
            mode: agent.mode,
            ...(capabilityProfile ? { capabilityProfile } : {}),
            ...(mediaOnly ? { budget: { generationPermissionMode: agent.generationPermissionMode } } : {}),
            message: {
              text,
              ...(creativeDocumentId ? { creativeDocumentId } : {}),
              ...(mediaOnly || Object.keys(agent.promptPreferredModels ?? {}).length ? {
                preferredModels,
              } : {}),
              ...(mediaOnly ? {
                preferredGenerationParameters,
              } : {}),
              ...(mediaOnly && !agentGeneration ? { preferredGenerationKind: generationKind } : {}),
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
          if (mediaOnly && !hasPriorMessage) {
            const title = normalizeConversationTitle(text);
            const existingConversation = (agent.conversations ?? []).find((item) => item.id === conversationId);
            if (existingConversation) {
              agent.conversations = agent.conversations.map((item) => item.id === conversationId ? { ...item, title } : item);
            } else {
              agent.conversations = [{ id: conversationId, title, status: "active" }, ...(agent.conversations ?? [])];
            }
            if (typeof agentApi.updateConversation === "function") {
              try {
                const updated = await agentApi.updateConversation({ conversationId, title });
                const conversation = updated?.conversation ?? { title };
                agent.conversations = agent.conversations.map((item) => item.id === conversationId ? { ...item, ...conversation } : item);
              } catch {
                // The generation task remains valid if its presentation title cannot be updated.
              }
            }
          }
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
          agent.selectedSkillId = "";
          agent.selectedModelOverrides = {};
          agent.visualStylePending = false;
          agent.promptCreativeDocumentId = "";
          agent.promptMention = null;
          agent.promptNodeReferences = [];
          agent.promptAttachments = [];
          agent.promptPreferredModels = {};
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
        if (mediaOnly) return true;
        agent.rewindConfirmOpen = false;
        if (typeof renderLayout === "function") await renderLayout();
        else syncPanel();
        await run("rewind", async () => {
          const canvasId = mediaOnly ? "free-generation" : String(workbench.ui?.selectedCanvasProjectId ?? "");
          if (!canvasId || !agent.taskId || typeof workbench.api?.rewindCanvasAgentTask !== "function") {
            throw new Error("canvas_agent_rewind_unavailable");
          }
          await workbench.api.rewindCanvasAgentTask(canvasId, agent.taskId, {});
          await poll();
        });
        return true;
      }
      if (action === "interject" || action === "interject-prompt") {
        if (action === "interject-prompt" && shouldAnswerCreativeQuestion()) {
          return this.handleAction({ dataset: {
            agentAction: "answer-creative-question",
            questionTaskId: String(agent.taskId ?? ""),
            questionId: String(resolvePendingCreativeQuestion(agent.messages)?.creative?.id ?? ""),
            answer: String(agent.promptDraft ?? ""),
            fromPrompt: "true",
          } });
        }
        await run(action, async () => {
          if (mediaOnly) agent.mode = "c";
          const fromPrompt = action === "interject-prompt";
          const text = mediaOnly ? (fromPrompt ? freeConversationSubmissionText(agent) : freeConversationModelSelectionText(agent, String(agent.interjectionDraft ?? "").trim())) : String(fromPrompt ? agent.promptDraft : agent.interjectionDraft ?? "").trim();
          if (!text) throw new Error("请输入插话内容。");
          if (mediaOnly && isFreeConversationSkillOnlyPrompt(text)) {
            throw new Error("请在已选技能后补充具体创作需求。");
          }
          if (!mediaOnly) {
            const selectedModel = agent.models.find((model) => model.modelCode === String(agent.modelCode ?? "").trim());
            assertAgentModelMediaSupport(selectedModel, agent.promptAttachments, agent.promptNodeReferences);
          }
          const canvasId = mediaOnly ? "free-generation" : String(workbench.ui?.selectedCanvasProjectId ?? "");
          const generationKind = normalizeFreeGenerationKind(agent.generationKind);
          const agentGeneration = generationKind === "agent";
          const creativeDocumentId = String(agent.promptCreativeDocumentId ?? "").trim();
          const { references, fileGrantIds, messageNodeReferences } = await prepareAgentMessageNodeReferences(
            canvasId,
            agent.conversationId,
          );
          await control("interject", {
            message: {
              text,
              ...(creativeDocumentId ? { creativeDocumentId } : {}),
              ...(mediaOnly || Object.keys(agent.promptPreferredModels ?? {}).length ? {
                preferredModels: mediaOnly
                  ? (agentGeneration
                    ? Object.fromEntries(FREE_GENERATION_KINDS.map((kind) => [
                        kind.id,
                        resolveSelectedFreeGenerationModel(agent, kind.id)?.modelCode ?? "",
                      ]).filter(([, modelCode]) => modelCode))
                    : { [generationKind]: resolveSelectedFreeGenerationModel(agent, generationKind)?.modelCode })
                  : agent.promptPreferredModels,
              } : {}),
              ...(mediaOnly ? {
                preferredGenerationParameters: agentGeneration
                  ? Object.fromEntries(FREE_GENERATION_KINDS.map((kind) => {
                      const selected = resolveSelectedFreeGenerationModel(agent, kind.id);
                      return selected ? [kind.id, resolveFreeGenerationParameterValues(agent, kind.id, selected)] : null;
                    }).filter(Boolean))
                  : {
                      [generationKind]: resolveFreeGenerationParameterValues(
                        agent,
                        generationKind,
                        resolveSelectedFreeGenerationModel(agent, generationKind),
                      ),
                    },
              } : {}),
              ...(mediaOnly && !agentGeneration ? { preferredGenerationKind: generationKind } : {}),
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
            agent.selectedSkillId = "";
            agent.selectedModelOverrides = {};
            agent.visualStylePending = false;
            agent.promptCreativeDocumentId = "";
            agent.promptMention = null;
            agent.promptNodeReferences = [];
            agent.promptAttachments = [];
            agent.promptPreferredModels = {};
          }
          else agent.interjectionDraft = "";
          agent.selectedModelOverrides = {};
          agent.visualStylePending = false;
          agent.promptCreativeDocumentId = "";
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
      const canvasId = mediaOnly ? "" : String(workbench.ui?.selectedCanvasProjectId ?? "").trim();
      if (
        canvasId
        && !PERSISTED_CANVAS_PROJECT_ID_PATTERN.test(canvasId)
        && typeof workbench.saveCanvasNow === "function"
      ) {
        try {
          await workbench.saveCanvasNow();
        } catch (error) {
          agent.error = friendlyAgentError(error);
          syncPanel();
        }
      }
      const modelsPromise = loadModels();
      const generationModelsPromise = loadGenerationModels();
      const visualStylesPromise = loadVisualStyles();
      await loadConversations();
      await Promise.all([
        loadMessages(agent.conversationId),
        modelsPromise,
        generationModelsPromise,
        visualStylesPromise,
      ]);
      schedulePoll(0);
    },
    async stagePrompt(input = {}) {
      const text = String(input.text ?? "").trim();
      if (!text) throw new Error("请输入 Agent 指令。");
      const mode = String(input.mode ?? "").trim();
      if (mediaOnly) {
        agent.mode = "c";
      } else if (mode) {
        agent.mode = AGENT_MODES.some((item) => item.id === mode) ? mode : "b";
      }
      agent.panelOpen = true;
      agent.promptDraft = text;
      agent.promptCreativeDocumentId = "";
      agent.promptPreferredModels = Object.fromEntries(
        ["image", "video", "audio"]
          .map((mediaType) => [mediaType, String(input.preferredModels?.[mediaType] ?? "").trim()])
          .filter(([, modelCode]) => modelCode),
      );
      if (mediaOnly && input.preferredGenerationKind) {
        agent.generationKind = normalizeFreeGenerationKind(input.preferredGenerationKind);
      }
      persistCanvasAgentUiState(ui, agent);
      void Promise.resolve(workbench.persistCanvasSession?.()).catch(() => undefined);
      if (!syncPanelVisibility()) {
        if (typeof renderLayout === "function") await renderLayout();
      } else {
        syncPanel();
      }
      return true;
    },
    async submitPrompt(input = {}, options = {}) {
      if (options.staged !== true) await this.stagePrompt(input);
      if (Array.from(input.files ?? []).length) {
        await uploadAgentAttachments(input.files);
      }
      if (!mediaOnly) {
        const selectedModel = agent.models.find((model) => model.modelCode === agent.modelCode);
        if (!agentModelSupportsMedia(selectedModel, agent.promptAttachments, agent.promptNodeReferences)) {
          const compatibleModel = agent.models.find((model) =>
            agentModelSupportsMedia(model, agent.promptAttachments, agent.promptNodeReferences),
          );
          if (compatibleModel) agent.modelCode = compatibleModel.modelCode;
        }
      }
      const active = Boolean(agent.taskId) && !TERMINAL_STATUSES.has(agent.status) && !shouldStartNewFreeGenerationTask();
      const handled = await this.handleAction({
        dataset: {
          agentAction: active ? "interject-prompt" : "send",
        },
      });
      if (agent.error) throw new Error(agent.error);
      return handled;
    },
    dispose() {
      disposed = true;
      if (progressClock) clearInterval(progressClock);
      stopPolling();
      disposePromptEditor();
      for (const timer of canvasRefreshRetryTimers) clearTimeout(timer);
      canvasRefreshRetryTimers.clear();
    },
  };
  // A clock tick only updates text; it must not remount the editor or replay media.
  const progressClock = mediaOnly && typeof document !== "undefined" ? setInterval(() => {
    if (disposed) return;
    const history = agent.messages.map(message => message.media).filter(Boolean);
    for (const element of surface.querySelectorAll?.("[data-generation-clock]") ?? []) {
      const media = history.find(item => item.taskId === element.dataset.generationClock);
      if (!media) continue;
      const state = describeGenerationProgress(media, history);
      const elapsed = element.querySelector?.("[data-generation-elapsed]");
      const estimate = element.querySelector?.("[data-generation-estimate]");
      if (elapsed && elapsed.textContent !== state.elapsed) elapsed.textContent = state.elapsed;
      if (estimate && estimate.textContent !== state.estimate) estimate.textContent = state.estimate;
    }
  }, 1000) : null;
  progressClock?.unref?.();
  submitPromptFromEditor = () => {
    void controller.handleAction({
      dataset: {
        agentAction: agent.taskId && !TERMINAL_STATUSES.has(agent.status) && !shouldStartNewFreeGenerationTask() ? "interject-prompt" : "send",
      },
    });
    return true;
  };
  if (typeof document !== "undefined") queueMicrotask(() => void syncPromptEditor());
  return controller;
}

function syncAgentTimelineEntries(currentTimeline, nextTimeline) {
  const currentEntries = Array.from(currentTimeline.querySelectorAll?.("[data-agent-timeline-entry]") ?? []);
  const nextEntries = Array.from(nextTimeline.querySelectorAll?.("[data-agent-timeline-entry]") ?? []);
  if (!currentEntries.length || !nextEntries.length) return false;
  const currentById = new Map(currentEntries.map((entry) => [entry.dataset.agentTimelineEntry, entry]));
  const nextIds = new Set(nextEntries.map((entry) => entry.dataset.agentTimelineEntry));
  if (currentEntries.some((entry) => !entry.dataset.agentTimelineEntry) || nextEntries.some((entry) => !entry.dataset.agentTimelineEntry)) {
    return false;
  }
  for (const entry of currentEntries) {
    if (!nextIds.has(entry.dataset.agentTimelineEntry)) entry.remove();
  }
  for (const nextEntry of nextEntries) {
    const currentEntry = currentById.get(nextEntry.dataset.agentTimelineEntry);
    if (!currentEntry || !currentEntry.isConnected) {
      currentTimeline.append(nextEntry.cloneNode(true));
    } else if (currentEntry.outerHTML !== nextEntry.outerHTML) {
      currentEntry.replaceWith(nextEntry.cloneNode(true));
    }
  }
  return true;
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

function listCanvasAgentPromptEditorAttachmentReferences(agent = {}, { ordinalLabels = false } = {}) {
  const ordinalByKind = new Map();
  return (Array.isArray(agent.promptAttachments) ? agent.promptAttachments : [])
    .map((attachment) => {
      const attachmentId = String(
        attachment?.id ?? attachment?.storageObjectId ?? attachment?.fileGrantId ?? "",
      ).trim();
      if (!attachmentId) return null;
      const mediaKind = ["image", "video", "audio", "document"].includes(attachment?.kind)
        ? attachment.kind
        : "document";
      const ordinal = (ordinalByKind.get(mediaKind) ?? 0) + 1;
      ordinalByKind.set(mediaKind, ordinal);
      const referenceId = `attachment:${attachmentId}`;
      const label = ordinalLabels
        ? `${mediaKind === "video" ? "视频" : mediaKind === "audio" ? "音频" : mediaKind === "image" ? "图" : "文档"}${ordinal}`
        : String(attachment?.name ?? "附件");
      return {
        id: referenceId,
        assetId: referenceId,
        assetKind: mediaKind,
        description: `${mediaKind === "video" ? "视频" : mediaKind === "audio" ? "音频" : mediaKind === "image" ? "图片" : "文档"}附件`,
        label,
        name: label,
        legacyLabel: String(attachment?.name ?? "附件"),
        preview: mediaKind === "image" ? String(attachment?.previewUrl ?? "") : "",
        referenceId,
        source: ["video", "audio"].includes(mediaKind) ? String(attachment?.previewUrl ?? "") : "",
      };
    })
    .filter(Boolean);
}

function replaceCanvasAgentPromptAttachmentTokenLabels(prompt, references = []) {
  let value = String(prompt ?? "");
  for (const reference of references) {
    const legacyLabel = String(reference?.legacyLabel ?? "").trim();
    const label = String(reference?.label ?? "").trim();
    if (!legacyLabel || !label || legacyLabel === label) continue;
    value = value.split(`【@${legacyLabel}】`).join(`【@${label}】`);
  }
  return value;
}

function appendAgentPromptAttachmentTokens(prompt, attachments = []) {
  const value = String(prompt ?? "");
  const tokens = (Array.isArray(attachments) ? attachments : [])
    .map((attachment) => `【@${String(attachment?.name ?? "附件").trim()}】`);
  if (!tokens.length) return value;
  return `${value}${value && !/\s$/u.test(value) ? " " : ""}${tokens.join(" ")}`;
}

function removeAgentPromptAttachmentToken(prompt, attachment = {}) {
  const value = String(prompt ?? "");
  const token = `【@${String(attachment?.name ?? "附件").trim()}】`;
  let start = value.indexOf(token);
  if (start < 0) return value;
  let end = start + token.length;
  if (end < value.length && /\s/u.test(value[end])) end += 1;
  else if (start > 0 && /\s/u.test(value[start - 1])) start -= 1;
  return `${value.slice(0, start)}${value.slice(end)}`;
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
    ${steps.length ? `<ol class="canvas-agent-step-list">${steps.slice(-8).map((step) => `<li data-step-status="${escapeAttr(step.status)}"><i aria-hidden="true"></i><span><strong>${escapeHtml(agentToolDisplayName(step.toolId) || agentEventLabel(`step.${step.status}`))}</strong><small>${escapeHtml(agentStepStatusText(step.status))}</small></span></li>`).join("")}</ol>` : ""}
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
    return '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 16.5a4.5 4.5 0 0 1-7.7 3.2l-6.4-6.4a6 6 0 0 1 8.5-8.5l6.1 6.1a3.75 3.75 0 0 1-5.3 5.3l-5.7-5.7a1.5 1.5 0 0 1 2.1-2.1l5.3 5.3" /></svg>';
  }
  return "";
}

function resolveAgentAttachmentKind(file = {}) {
  const type = String(file.type ?? "").toLowerCase();
  const name = String(file.name ?? "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("text/") || [".txt", ".md", ".markdown", ".csv", ".json", ".docx", ".pdf"].some((extension) => name.endsWith(extension))) return "document";
  return "";
}

function serializeAgentAttachment(attachment = {}) {
  return {
    fileGrantId: String(attachment.fileGrantId ?? "").trim(),
    name: String(attachment.name ?? "附件").trim().slice(0, 160),
    contentType: String(attachment.contentType ?? "application/octet-stream").trim().toLowerCase(),
    sizeBytes: Math.max(0, Number(attachment.sizeBytes ?? 0) || 0),
    kind: ["image", "video", "audio", "document"].includes(attachment.kind) ? attachment.kind : "document",
  };
}

function agentAttachmentKindLabel(kind) {
  return kind === "video" ? "VID" : kind === "audio" ? "AUD" : kind === "image" ? "IMG" : "DOC";
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
      ? isAgentThumbnailUrl(item.previewUrl)
        ? `<img src="${escapeAttr(item.previewUrl)}" alt="" />`
        : `<video src="${escapeAttr(item.previewUrl)}"${item.posterUrl ? ` poster="${escapeAttr(item.posterUrl)}"` : ""} muted playsinline preload="metadata" aria-hidden="true"></video>`
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
          resolveCanvasMediaNodeSource(node, mediaKind, { assets, thumbnail: mediaKind === "image" })
          || `/api/storage/objects/${encodeURIComponent(file.storageObjectId)}/content?thumbnail=1`,
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
            resolveCanvasMediaNodeSource(node, mediaKind, { assets, thumbnail: mediaKind === "image" })
            || (file?.storageObjectId
              ? `/api/storage/objects/${encodeURIComponent(file.storageObjectId)}/content?thumbnail=1`
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

function renderAgentTimeline(agent, canvasDocument = null, active = false, options = {}) {
  const generationHistory = (agent.messages ?? []).map(message => message.media).filter(Boolean);
  const hasCurrentMedia = (agent.messages ?? []).some(message => message.media && message.taskId === agent.taskId);
  const timelineEvents = collapseAgentTimelineEvents(agent.events).slice(-30);
  const collapsedMessages = collapseAgentGenerationMessages(agent.messages);
  const successfulMediaTaskIds = new Set(collapsedMessages
    .filter((message) => message.role === "tool" && isSuccessfulAgentMediaStatus(message?.media?.status))
    .map((message) => String(message.taskId ?? ""))
    .filter(Boolean));
  const failedMediaTaskIds = new Set(collapsedMessages
    .filter((message) => message.role === "tool" && isFailedAgentMediaStatus(message?.media?.status))
    .map((message) => String(message.taskId ?? ""))
    .filter(Boolean));
  const timelineMessages = collapsedMessages
    .filter((message) => message.role !== "tool" || message.media || message.generationTaskId || message.creative)
    .filter((message) => !shouldHideSupersededAgentFailure(message, successfulMediaTaskIds, failedMediaTaskIds))
    .filter((message) => message.role !== "assistant" || Boolean(sanitizeAssistantAgentCopy(message.text, options)));
  const availableModelChoices = options.mediaOnly ? (Array.isArray(agent.models) ? agent.models : []) : [];
  const currentTextModelLabel = (Array.isArray(agent.models) ? agent.models : [])
    .find((model) => model?.modelCode === agent.modelCode)?.modelLabel ?? "";
  const taskFailed = Boolean(agent.taskId) && ["failed", "result_unknown", "manual_review_required"].includes(agent.status);
  const entries = [
    ...timelineMessages.map((message, index) => {
      const creativeOnly = message.role === "tool" && Boolean(message.creative) && !message.media && !message.generationTaskId;
      return {
        id: `message-${message.id || index}`,
        messageId: String(message.id ?? ""),
        messageIndex: agent.messages.indexOf(message),
        taskId: String(message.taskId ?? ""),
        role: message.role,
        type: creativeOnly ? "" : message.interjection ? "用户追加" : agentMessageLabel(message.role),
        summary: creativeOnly ? "" : message.text,
        createdAt: message.createdAt,
        nodeReferences: message.nodeReferences,
        attachments: message.attachments,
        status: "message",
        kind: message.role === "assistant" ? "answer" : "message",
        citations: normalizeAgentCitations(message.citations),
        media: message.media ?? null,
        creative: message.creative ?? null,
        creativeQuestionActionable: isCurrentCreativeQuestion(agent, message),
        canvasNodeId: resolveAgentMediaCanvasNodeId(canvasDocument, message, message.media),
      };
    }),
    ...(active && !(options.mediaOnly && agent.status === "waiting_external" && hasCurrentMedia) ? [{
      id: "agent-thinking",
      status: "working",
      summary: resolveAgentActivityMessage(timelineEvents),
      activity: true,
    }] : taskFailed ? [{
      id: "agent-failed",
      status: "failed",
      summary: resolveAgentTaskFailure(timelineEvents, options),
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
    return options.mediaOnly
      ? '<div class="canvas-agent-empty canvas-agent-creation-welcome"><span>灵曦 · 创作助手</span><h2>从一个想法，到一件作品</h2><p>描述目标，或选择技能开始。<br />我会沿用你的参考，补齐关键选择，陪你调整到满意。</p><div><button type="button" data-agent-action="select-free-conversation-skill" data-skill-id="character-design">设计一个角色 <span>↗</span></button><button type="button" data-agent-action="select-free-conversation-skill" data-skill-id="storyboard">把故事变成分镜 <span>↗</span></button><button type="button" data-agent-action="select-free-conversation-skill" data-skill-id="image-to-video">让图片动起来 <span>↗</span></button></div></div>'
      : '<div class="canvas-agent-empty"><p>你好！我是灵曦AI的媒体创作工作流 Agent，可以帮你生成剧本、图片、视频内容。<br />有需求请告诉我哦~！我来帮你实现。</p></div>';
  }
  return entries.map((entry) => entry.activity
    ? options.mediaOnly
      ? `<article class="canvas-agent-event" data-agent-timeline-entry="${escapeAttr(entry.id)}" data-event-status="working" data-event-kind="answer" data-event-role="assistant" role="status">
      <i aria-hidden="true"></i>
      <div>
        <span class="canvas-agent-event-title"><strong>灵曦</strong></span>
        <p>${escapeHtml(entry.summary)}</p>
      </div>
    </article>`
      : `<div class="canvas-agent-thinking" role="status"><i aria-hidden="true"></i><span>${escapeHtml(entry.summary)}</span></div>`
    : entry.failure
      ? `<div class="canvas-agent-task-failed" data-agent-timeline-entry="${escapeAttr(entry.id)}" role="status"><i aria-hidden="true"></i><span><strong>失败</strong><small>${escapeHtml(entry.summary || "任务执行失败，请稍后重试。")}</small></span></div>`
    : `
    <article class="canvas-agent-event" data-agent-timeline-entry="${escapeAttr(entry.id)}" data-event-status="${escapeAttr(entry.status)}" data-event-kind="${escapeAttr(entry.kind)}" data-event-role="${escapeAttr(entry.role ?? "")}">
      <i aria-hidden="true"></i>
      <div>
        ${entry.type ? renderAgentEventTitle(entry) : ""}
        ${entry.summary ? `<p>${renderAgentMessageSummary(entry, canvasDocument, { ...options, currentTextModelLabel, generationModels: agent.generationModels })}</p>` : ""}
        ${renderAgentModelChoices(entry, availableModelChoices, options)}
        ${entry.attachments?.length ? renderAgentMessageAttachments(entry.attachments, options.fileGrants) : ""}
        ${entry.media ? renderAgentMedia(entry.media, entry.messageId, entry.canvasNodeId, { ...options, generationHistory }) : ""}
        ${entry.creative ? renderAgentCreativeCard(entry.creative, Boolean(agent.busyAction), entry.taskId, entry.creativeQuestionActionable) : ""}
        ${entry.metadata?.length ? `<div class="canvas-agent-event-meta">${entry.metadata.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
        ${entry.citations?.length ? `<ol class="canvas-agent-citations" aria-label="引用来源">${entry.citations.map((citation) => renderAgentCitation(citation)).join("")}</ol>` : ""}
        <div class="canvas-agent-message-footer">
          ${entry.createdAt ? `<time class="canvas-agent-message-time" datetime="${escapeAttr(entry.createdAt)}">${escapeHtml(formatAgentMessageTime(entry.createdAt))}</time>` : ""}
          ${options.mediaOnly && ["user", "assistant"].includes(entry.role) && entry.summary && (entry.messageId || entry.messageIndex >= 0) ? renderAgentTextActions(entry, agent) : ""}
        </div>
      </div>
    </article>
  `).join("");
}

function isSuccessfulAgentMediaStatus(status) {
  return ["completed", "succeeded", "success"].includes(String(status ?? "").toLowerCase());
}

function isFailedAgentMediaStatus(status) {
  return ["failed", "canceled", "cancelled", "result_unknown", "manual_review_required"].includes(String(status ?? "").toLowerCase());
}

function shouldHideSupersededAgentFailure(message, successfulTaskIds, failedTaskIds) {
  if (message?.role !== "assistant") return false;
  const taskId = String(message?.taskId ?? "");
  if (!taskId || !successfulTaskIds.has(taskId) || failedTaskIds.has(taskId)) return false;
  return sanitizeMediaOnlyAgentCopy(message.text) === "生成任务执行失败，请检查模型配置或参考素材后重试。";
}

function renderAgentEventTitle(entry = {}) {
  const kind = entry.kind && !["message", "answer"].includes(entry.kind)
    ? `<em>${escapeHtml(agentEventKindLabel(entry.kind))}</em>`
    : "";
  return `<span class="canvas-agent-event-title"><strong>${escapeHtml(entry.type)}</strong>${kind ? `<span class="canvas-agent-event-title-meta">${kind}</span>` : ""}</span>`;
}

function formatAgentMessageTime(value) {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
    return event.toolId ? `正在准备 ${agentToolDisplayName(event.toolId)}` : "正在思考中";
  }
  if (eventType === "step.running") {
    return event.toolId ? `正在执行 ${agentToolDisplayName(event.toolId)}` : "正在思考中";
  }
  if (eventType === "step.succeeded") return event.toolId ? `正在完成 ${agentToolDisplayName(event.toolId)}` : "正在整理结果";
  return "正在思考中";
}

function resolveAgentTaskFailure(events = [], options = {}) {
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
  if (isHumanReadableAgentText(message)) return options.mediaOnly ? sanitizeMediaOnlyAgentCopy(message) : message;
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
  const output = code ? `${detail}（${code}）` : `${detail}，请稍后重试。`;
  return options.mediaOnly ? sanitizeMediaOnlyAgentCopy(output) : output;
}

export function normalizeAgentMessage(message = {}) {
  const content = message.content && typeof message.content === "object" ? message.content : {};
  const output = content.output && typeof content.output === "object" ? content.output : {};
  const role = ["system", "user", "assistant", "tool"].includes(message.role) ? message.role : "assistant";
  const text = String(
    content.text ?? content.message ?? message.text ??
    (role === "tool" && content.toolId ? `${agentToolDisplayName(content.toolId)} 已执行` : ""),
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
    creative: normalizeAgentCreative(output.creative),
  };
}

function normalizeAgentCreative(value) {
  const creative = value && typeof value === "object" && !Array.isArray(value) ? value : null;
  const type = String(creative?.type ?? "").trim();
  if (type === "skill") {
    const skillId = String(creative.skillId ?? "").trim();
    return skillId ? { type, skillId, title: String(creative.title ?? skillId).trim() } : null;
  }
  if (type === "plan") {
    return {
      type,
      title: String(creative.title ?? "创作计划").trim(),
      goal: String(creative.goal ?? "").trim(),
      constraints: String(creative.constraints ?? "").trim(),
      steps: (Array.isArray(creative.steps) ? creative.steps : []).slice(0, 12).map((step) => ({
        id: String(step?.id ?? "").trim(),
        title: String(step?.title ?? "未命名步骤").trim(),
        status: ["pending", "running", "completed"].includes(String(step?.status ?? "")) ? String(step.status) : "pending",
      })),
    };
  }
  if (type === "question") {
    const question = String(creative.question ?? "").trim();
    return question ? {
      type,
      id: String(creative.id ?? "").trim(),
      question,
      options: (Array.isArray(creative.options) ? creative.options : [])
        .map((option) => String(option ?? "").trim()).filter(Boolean).slice(0, 8),
    } : null;
  }
  if (type === "document") {
    const documentId = String(creative.documentId ?? "").trim();
    return documentId ? {
      type,
      documentId,
      title: String(creative.title ?? "创作文档").trim(),
      content: String(creative.content ?? ""),
      version: Math.max(1, Number(creative.version ?? 1) || 1),
    } : null;
  }
  return null;
}

function renderAgentCreativeCard(creative, busy, taskId = "", questionActionable = false) {
  creative = normalizeAgentCreative(creative);
  if (!creative) return "";
  if (creative.type === "skill") {
    return `<section class="canvas-agent-creative-card skill"><strong>已启用技能</strong><span>${escapeHtml(creative.title)}</span></section>`;
  }
  if (creative.type === "plan") {
    return `<section class="canvas-agent-creative-card plan" aria-label="创作计划">
      <header><strong>${escapeHtml(creative.title || "创作计划")}</strong><span>计划</span></header>
      ${creative.goal ? `<p>${escapeHtml(creative.goal)}</p>` : ""}
      ${creative.constraints ? `<small>${escapeHtml(creative.constraints)}</small>` : ""}
      ${creative.steps.length ? `<ol>${creative.steps.map((step) => `<li data-plan-step-status="${escapeAttr(step.status)}"><i aria-hidden="true"></i><span>${escapeHtml(step.title)}</span><small>${escapeHtml(step.status === "completed" ? "已完成" : step.status === "running" ? "进行中" : "待开始")}</small></li>`).join("")}</ol>` : ""}
    </section>`;
  }
  if (creative.type === "question") {
    return `<section class="canvas-agent-creative-card question" aria-label="Agent 需要你的选择">
      <strong>需要你的选择</strong><p>${escapeHtml(creative.question)}</p>
      ${creative.options.length ? `<div>${creative.options.map((option) => `<button type="button" data-agent-action="answer-creative-question" data-question-id="${escapeAttr(creative.id)}" data-question-task-id="${escapeAttr(taskId)}" data-answer="${escapeAttr(option)}" ${busy || !questionActionable ? "disabled" : ""}>${escapeHtml(option)}</button>`).join("")}</div>` : ""}
    </section>`;
  }
  if (creative.type === "document") {
    return `<section class="canvas-agent-creative-card document" aria-label="创作文档">
      <header><strong>${escapeHtml(creative.title)}</strong><span>版本 ${escapeHtml(creative.version)}</span></header>
      <div class="canvas-agent-creative-document-markdown">${renderCanvasMarkdownPreview(creative.content)}</div>
      <footer><button type="button" data-agent-action="continue-creative-document" data-document-id="${escapeAttr(creative.documentId)}" data-document-title="${escapeAttr(creative.title)}" ${busy ? "disabled" : ""}>继续编辑</button></footer>
    </section>`;
  }
  return "";
}

function hasPendingCreativeQuestion(messages = []) {
  return Boolean(resolvePendingCreativeQuestion(messages));
}

function resolvePendingCreativeQuestion(messages = []) {
  const latestCreative = [...(Array.isArray(messages) ? messages : [])]
    .reverse()
    .find((message) => message?.creative?.type === "question" || message?.role === "user");
  return latestCreative?.creative?.type === "question" ? latestCreative : null;
}

function isCurrentCreativeQuestion(agent = {}, message = {}) {
  const pendingQuestion = resolvePendingCreativeQuestion(agent.messages);
  return agent.status === "paused"
    && String(message?.taskId ?? "") === String(agent.taskId ?? "")
    && Boolean(pendingQuestion)
    && String(message?.creative?.id ?? "") !== ""
    && String(message?.creative?.id ?? "") === String(pendingQuestion?.creative?.id ?? "");
}

function isFreeConversationSkillOnlyPrompt(text) {
  const normalized = String(text ?? "").trim();
  return FREE_CONVERSATION_SKILLS.some((skill) => normalized === `/${skill.id}`);
}

function freeConversationSubmissionText(agent) {
  const text = String(agent.promptDraft ?? "").trim();
  const skill = FREE_CONVERSATION_SKILLS.find(item => item.id === agent.selectedSkillId);
  const body = text ? freeConversationModelSelectionText(agent, text) : "";
  return skill ? `/${skill.id} ${body}`.trim() : body;
}

function freeConversationModelSelectionText(agent, text) {
  if (!text) return "";
  if ((agent.visualStylePending || (!agent.messages?.some(message => message.role === "user") && agent.projectVisualStyles?.length)) && normalizeFreeGenerationKind(agent.generationKind) !== "audio") {
    const style = freeVisualStyles(agent).find(item => item.id === agent.visualStyleId);
    if (style) text = `创作风格：${style.label}。\n${style.instruction ? `风格描述：${JSON.stringify(style.instruction)}\n` : ""}${text}`;
  }
  if (normalizeFreeGenerationKind(agent.generationKind) !== "agent") return text;
  const choices = Object.entries(agent.selectedModelOverrides ?? {}).filter(([kind, code]) => listFreeGenerationModels(agent, kind).some(model => model.modelCode === code));
  const labels = { image: "图片", video: "视频", audio: "音频" };
  return [...choices.map(([kind, code]) => `${labels[kind]}模型用 ${code}。`), text].join("\n");
}

function renderAgentTextActions(entry, agent) {
  const copied = agent.copiedMessageKey === String(entry.messageId || entry.messageIndex);
  const copyLabel = copied ? "已复制" : "复制";
  const copyIcon = copied ? '<path d="m5 12 4 4L19 6"/>' : '<rect x="8" y="3" width="12" height="14" rx="3"/><path d="M16 17v1a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3h1"/>';
  return `<div class="canvas-agent-text-actions" aria-label="文字消息操作"><button type="button" data-agent-action="copy-agent-text" data-message-id="${escapeAttr(entry.messageId)}" data-message-index="${entry.messageIndex}" aria-label="${copyLabel}" title="${copyLabel}"><svg viewBox="0 0 24 24" aria-hidden="true">${copyIcon}</svg></button><button type="button" data-agent-action="reuse-agent-text" data-message-id="${escapeAttr(entry.messageId)}" data-message-index="${entry.messageIndex}" aria-label="放入输入框" title="放入输入框，编辑后再次发送"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14l-1 6ZM12 21h9"/></svg></button></div>`;
}

function reusableMessageText(message, agent) {
  let text = message.role === "assistant" ? sanitizeAssistantAgentCopy(message.text, { mediaOnly: true }) : String(message.text);
  const prefix = /^\/([\w-]+)(?:\s+|$)/.exec(text);
  const skill = FREE_CONVERSATION_SKILLS.find(item => item.id === prefix?.[1]);
  if (skill) text = `【${skill.label}】\n${text.slice(prefix[0].length)}`;
  // Reuse the user's words, not the catalog prompt automatically attached at submission.
  text = text.replace(/(^|\n)创作风格：[^\n。]+。\r?\n风格描述："[^\n]*"(?:\r?\n|$)/g, "$1");
  for (const model of agent.generationModels ?? []) if (model.modelCode && model.modelLabel) text = text.replaceAll(`模型用 ${model.modelCode}。`, `模型用 ${model.modelLabel}。`);
  return text;
}

function normalizeAgentAttachments(value) {
  return (Array.isArray(value) ? value : []).map((attachment) => ({
    storageObjectId: String(attachment?.storageObjectId ?? attachment?.id ?? ""),
    fileGrantId: String(attachment?.fileGrantId ?? ""),
    name: String(attachment?.name ?? "附件"),
    contentType: String(attachment?.contentType ?? "application/octet-stream"),
    sizeBytes: Math.max(0, Number(attachment?.sizeBytes ?? 0) || 0),
    kind: ["image", "video", "audio", "document"].includes(attachment?.kind) ? attachment.kind : "document",
    previewUrl: String(attachment?.previewUrl ?? attachment?.url ?? "").trim(),
  })).filter((attachment) => attachment.fileGrantId);
}

function renderAgentMessageAttachments(attachments, fileGrants = []) {
  return `<div class="canvas-agent-message-attachments" aria-label="消息附件">${normalizeAgentAttachments(attachments)
    .map((attachment) => {
      const storageObjectId = attachment.storageObjectId || String(
        (Array.isArray(fileGrants) ? fileGrants : [])
          .find((grant) => String(grant?.id ?? "") === attachment.fileGrantId)
          ?.storageObjectId ?? "",
      );
      const previewUrl = attachment.previewUrl || (
        ["image", "video"].includes(attachment.kind) && storageObjectId
          ? `/api/storage/objects/${encodeURIComponent(storageObjectId)}/content?thumbnail=1`
          : ""
      );
      const isPreviewable = Boolean(previewUrl && ["image", "video"].includes(attachment.kind));
      const previewKind = attachment.kind === "video" && isAgentThumbnailUrl(previewUrl) ? "image" : attachment.kind;
      const thumbnail = attachment.kind === "image" && previewUrl
        ? `<img src="${escapeAttr(previewUrl)}" alt="" loading="lazy" />`
        : attachment.kind === "video" && previewUrl
          ? isAgentThumbnailUrl(previewUrl)
            ? `<img src="${escapeAttr(previewUrl)}" alt="" loading="lazy" />`
            : `<video src="${escapeAttr(previewUrl)}" muted playsinline preload="metadata" aria-hidden="true"></video>`
          : `<b>${escapeHtml(agentAttachmentKindLabel(attachment.kind))}</b>`;
      return `<span class="canvas-agent-message-attachment ${escapeAttr(attachment.kind)}"${isPreviewable ? ` data-agent-message-attachment-preview data-preview-url="${escapeAttr(previewUrl)}" data-preview-kind="${escapeAttr(previewKind)}" tabindex="0" aria-label="${escapeAttr(`${agentAttachmentKindLabel(attachment.kind)}附件 ${attachment.name}，悬停或聚焦预览`)}"` : ""}>
        <span class="canvas-agent-message-attachment-thumb">${thumbnail}</span>
        <em>${escapeHtml(attachment.name)}</em>
      </span>`;
    })
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

function renderAgentMessageSummary(entry, canvasDocument, options = {}) {
  if (options.mediaOnly && entry?.role === "user") {
    const prefix = /^\/([\w-]+)(?:\s+|$)/.exec(String(entry.summary ?? ""));
    const skill = FREE_CONVERSATION_SKILLS.find(item => item.id === prefix?.[1]);
    if (skill) return `<span class="canvas-agent-selected-skill" title="${escapeAttr(skill.description)}">${escapeHtml(skill.label)}</span> ${renderAgentMessageSummary({ ...entry, summary: String(entry.summary).slice(prefix[0].length) }, canvasDocument, options)}`;
  }
  let text = entry?.role === "assistant"
    ? sanitizeAssistantAgentCopy(entry?.summary, options)
    : String(entry?.summary ?? "");
  if (options.mediaOnly && entry?.role === "user") {
    text = text.replace(/(^|\n)(创作风格：[^\n。]+。\r?\n)风格描述："[^\n]*"(?:\r?\n|$)/g, "$1$2");
    for (const model of options.generationModels ?? []) {
      if (model.modelCode && model.modelLabel) text = text.replaceAll(`模型用 ${model.modelCode}。`, `模型：${model.modelLabel}。`);
    }
  }
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

function renderAgentModelChoices(entry, models = [], options = {}) {
  if (!options.mediaOnly || entry?.role !== "assistant" || !isPublicModelAnswer(entry?.summary) || !models.length) return "";
  const modelDisplayName = publicModelAnswerDisplayName(entry?.summary);
  return `
    <div class="canvas-agent-model-choices" aria-label="可切换模型">
      <span>可用模型</span>
      <div>
        ${models.map((model, index) => {
          const label = String(model?.modelLabel ?? "").trim();
          if (!label) return "";
          const selected = label === modelDisplayName;
          return `<button type="button" class="${selected ? "is-selected" : ""}" data-agent-action="select-agent-text-model" data-model-index="${index}" aria-pressed="${selected}" title="切换至${escapeAttr(label)}">${escapeHtml(label)}</button>`;
        }).join("")}
      </div>
    </div>
  `;
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
  const storageObjectId = String(data.storageObjectId ?? data.storage_object_id ?? "").trim();
  const source = ["image", "video", "audio"].includes(mediaKind)
    ? (storageObjectId && ["image", "video"].includes(mediaKind)
      ? `/api/storage/objects/${encodeURIComponent(storageObjectId)}/content?thumbnail=1`
      : resolveCanvasMediaNodeSource(node ?? { data }, mediaKind))
    : "";
  const poster = mediaKind === "video" ? String(data.thumbnailUrl ?? data.posterUrl ?? "").trim() : "";
  const thumb = mediaKind === "video" && source
    ? (poster || isAgentThumbnailUrl(source)
        ? `<img src="${escapeAttr(poster || source)}" alt="" draggable="false" />`
        : `<video src="${escapeAttr(source)}" muted playsinline preload="metadata" aria-hidden="true"></video>`)
    : mediaKind === "image" && source
      ? `<img src="${escapeAttr(source)}" alt="" draggable="false" />`
      : `<span class="episode-prompt-editor-mention-fallback" aria-hidden="true">${escapeHtml(reference.title.slice(0, 1) || "@")}</span>`;
  return `<span class="episode-prompt-editor-mention canvas-agent-message-node-reference" data-node-id="${escapeAttr(reference.nodeId)}" aria-label="引用节点${escapeAttr(reference.title)}" title="节点：${escapeAttr(reference.title)}">
    ${thumb}<span class="episode-prompt-editor-mention-label">${escapeHtml(reference.title)}</span>
  </span>`;
}

function isAgentThumbnailUrl(value) {
  return /(?:[?&])thumbnail=1(?:&|$)/u.test(String(value ?? ""));
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

function hasSettledMediaGeneration(agent = {}) {
  const currentTaskId = String(agent.taskId ?? "").trim();
  const generationMessages = collapseAgentGenerationMessages(agent.messages)
    .filter((message) => message?.role === "tool" && String(message?.generationTaskId ?? ""))
    .filter((message) => !currentTaskId || String(message?.taskId ?? "") === currentTaskId);
  if (!generationMessages.length) return false;
  const terminalStatuses = new Set([
    "completed", "succeeded", "success", "failed", "canceled", "cancelled", "result_unknown", "manual_review_required",
  ]);
  return generationMessages.every((message) => terminalStatuses.has(String(message?.media?.status ?? "").toLowerCase()));
}

function mediaMessageStateSignature(messages = []) {
  return JSON.stringify((Array.isArray(messages) ? messages : []).map((message) => ({
    id: String(message?.id ?? ""),
    generationTaskId: String(message?.generationTaskId ?? ""),
    media: message?.media ? {
      status: String(message.media.status ?? ""),
      url: String(message.media.url ?? ""),
      error: String(message.media.error ?? ""),
      progressStage: message.media.progressStage,
      submittedAt: message.media.submittedAt,
      returnedAt: message.media.returnedAt,
      model: message.media.model,
    } : null,
  })));
}

export function normalizeAgentMediaTask(task = {}) {
  const result = task.result && typeof task.result === "object" ? task.result : {};
  const audioItem = Array.isArray(task.generatedAudioItems) ? task.generatedAudioItems[0] : null;
  const rawKind = String(task.kind ?? result.mediaKind ?? (audioItem ? "audio" : "image")).toLowerCase();
  const kind = ["video", "audio"].includes(rawKind) ? rawKind : "image";
  const storageObjectId = String(result.storageObjectId ?? "").trim();
  const sourceUrl = storageObjectId
    ? `/api/storage/objects/${encodeURIComponent(storageObjectId)}/content`
    : normalizeAgentMediaUrl(
      result.sourceUrl ?? result.downloadUrl ?? result.imageUrl ?? result.videoUrl ?? result.audioUrl ??
      audioItem?.audioUrl ?? task.url ?? result.previewUrl,
    );
  const storagePreviewUrl = storageObjectId
    ? `/api/storage/objects/${encodeURIComponent(storageObjectId)}/content?thumbnail=1`
    : "";
  const previewUrl = normalizeAgentMediaUrl(
    storagePreviewUrl || result.thumbnailUrl || result.previewUrl || sourceUrl,
  ) || sourceUrl;
  const posterUrl = kind === "video"
    ? normalizeAgentMediaUrl(storagePreviewUrl || result.thumbnailUrl || result.posterUrl)
    : "";
  const status = String(task.status ?? "queued").toLowerCase();
  return {
    taskId: String(task.taskId ?? task.id ?? ""),
    kind,
    status,
    progressStage: String(task.progressStage ?? ""),
    model: String(task.modelCode ?? task.model ?? task.modelName ?? ""),
    submittedAt: String(task.submittedAt ?? task.createdAt ?? ""),
    startedAt: String(task.startedAt ?? ""),
    returnedAt: String(task.returnedAt ?? ""),
    url: previewUrl,
    previewUrl,
    sourceUrl,
    posterUrl,
    prompt: String(task.prompt ?? "").trim().slice(0, 2_000),
    title: String(result.title ?? result.fileName ?? `${kind} 生成结果`).trim().slice(0, 160),
    error: String(task.failure?.displayMessage ?? task.failure?.providerMessage ?? task.failureCode ?? "").trim().slice(0, 500),
    artifactId: String(result.artifactId ?? ""),
    storageObjectId,
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

function renderAgentMedia(media, messageIndex, canvasNodeId, options = {}) {
  const ready = ["completed", "succeeded", "success"].includes(media.status) && Boolean(media.url);
  const failed = ["failed", "canceled", "cancelled", "result_unknown", "manual_review_required"].includes(media.status);
  if (!ready) {
    if (options.mediaOnly) {
      const progress = describeGenerationProgress(media, options.generationHistory);
      return `<div class="canvas-agent-generation-card ${progress.active ? "is-generating" : "is-settled"}" data-generation-clock="${escapeAttr(media.taskId)}" data-generation-stage="${escapeAttr(progress.stage)}">
        <div class="canvas-agent-generation-preview" aria-hidden="true"><span>${media.kind === "video" ? "▶" : media.kind === "audio" ? "♫" : "✦"}</span></div>
        <div class="canvas-agent-generation-detail"><strong role="status">${escapeHtml(progress.title)}</strong><span>${escapeHtml(media.model || "正在同步生成模型")}</span>
          <small data-generation-elapsed>${escapeHtml(progress.elapsed)}</small>
          <p data-generation-estimate>${escapeHtml(progress.estimate)}</p>
          <div class="canvas-agent-generation-stages" aria-label="生成阶段"><span class="${progress.stage === "queued" ? "active" : ""}">排队</span><i>›</i><span class="${progress.stage === "rendering" ? "active" : ""}">生成</span><i>›</i><span class="${progress.stage === "saving" ? "active" : ""}">保存结果</span></div>
        </div></div>`;
    }
    return `<div class="canvas-agent-media-status ${failed ? "is-error" : ""}" role="status">${escapeHtml(failed ? media.error || "媒体生成失败" : "媒体生成中")}</div>`;
  }
  const isExpandable = options.mediaOnly === true && ["image", "video"].includes(media.kind);
  const previewUrl = String(media.previewUrl ?? media.url ?? "");
  const sourceUrl = String(media.sourceUrl ?? media.url ?? "");
  const preview = media.kind === "video"
    ? media.posterUrl
      ? `<img src="${escapeAttr(media.posterUrl)}" alt="${escapeAttr(media.title || "Agent 生成视频")}" loading="lazy" />`
      : `<video src="${escapeAttr(previewUrl)}" ${isExpandable ? "muted playsinline" : "controls"} preload="metadata"></video>`
    : media.kind === "audio"
      ? `<audio src="${escapeAttr(sourceUrl)}" controls preload="metadata"></audio>`
      : `<img src="${escapeAttr(previewUrl)}" alt="${escapeAttr(media.title || "Agent 生成图片")}" loading="lazy" />`;
  const previewContent = isExpandable
    ? `<button type="button" class="canvas-agent-media-preview" data-agent-action="open-agent-media-preview" data-message-id="${escapeAttr(String(messageIndex))}" aria-label="放大查看${escapeAttr(media.kind === "video" ? "视频" : "图片")}" title="放大查看">${preview}<span aria-hidden="true">${renderAgentHeaderIcon("expand")}</span></button>`
    : preview;
  return `<figure class="canvas-agent-media${isExpandable ? " is-expandable" : ""}" data-media-kind="${escapeAttr(media.kind)}">
    ${previewContent}
    ${media.prompt ? `<figcaption>${escapeHtml(media.prompt)}</figcaption>` : ""}
    <div class="canvas-agent-media-actions">
      ${options.mediaOnly && media.storageObjectId ? `<button type="button" data-agent-action="reuse-agent-media" data-message-id="${escapeAttr(String(messageIndex))}" data-intent="reference">作为参考</button><button type="button" data-agent-action="reuse-agent-media" data-message-id="${escapeAttr(String(messageIndex))}" data-intent="revise">继续调整</button>${media.kind === "image" ? `<button type="button" data-agent-action="reuse-agent-media" data-message-id="${escapeAttr(String(messageIndex))}" data-intent="video">生成视频</button>` : ""}` : ""}
      <button type="button" data-agent-action="download-agent-media" data-message-id="${escapeAttr(String(messageIndex))}">下载原始${media.kind === "video" ? "视频" : media.kind === "image" ? "图片" : "音频"}</button>
      ${options.mediaOnly === true ? "" : `<button type="button" data-agent-action="${canvasNodeId ? "locate-agent-canvas-node" : "add-media-to-canvas"}" data-message-id="${escapeAttr(String(messageIndex))}">${canvasNodeId ? "定位节点" : "添加到画布"}</button>`}
    </div>
  </figure>`;
}

function renderAgentMediaPreview(agent) {
  const preview = agent.mediaPreview;
  if (!preview?.url || !["image", "video"].includes(preview.kind)) return "";
  const media = preview.kind === "video"
    ? `<video src="${escapeAttr(preview.url)}" controls autoplay playsinline></video>`
    : `<img src="${escapeAttr(preview.url)}" alt="${escapeAttr(preview.title || "生成图片")}" />`;
  return `<section class="canvas-agent-media-lightbox" role="dialog" aria-modal="true" aria-label="${escapeAttr(preview.kind === "video" ? "视频预览" : "图片预览")}">
    <button type="button" class="canvas-agent-media-lightbox-backdrop" data-agent-action="close-agent-media-preview" aria-label="关闭预览"></button>
    <div class="canvas-agent-media-lightbox-content">
      <button type="button" class="canvas-agent-media-lightbox-close" data-agent-action="close-agent-media-preview" aria-label="关闭预览" title="关闭预览">${renderAgentHeaderIcon("close")}</button>
      ${media}
    </div>
  </section>`;
}

async function downloadAgentMedia(media = {}) {
  const fileName = String(media.title ?? `${media.kind === "video" ? "生成视频" : media.kind === "audio" ? "生成音频" : "生成图片"}`).trim() || "生成媒体";
  if (media.storageObjectId) {
    await downloadCanvasAsset({ storageObjectId: media.storageObjectId, fileName });
    return;
  }
  const sourceUrl = String(media.sourceUrl ?? media.url ?? "").trim();
  if (!sourceUrl || typeof globalThis.fetch !== "function") throw new Error("原始媒体地址不可用");
  const response = await globalThis.fetch(sourceUrl, { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error(`读取媒体失败（${response.status}）`);
  const blob = await response.blob();
  const documentRef = globalThis.document;
  const urlApi = globalThis.URL;
  if (!documentRef?.createElement || typeof urlApi?.createObjectURL !== "function") throw new Error("当前浏览器不支持下载");
  const objectUrl = urlApi.createObjectURL(blob);
  try {
    const anchor = documentRef.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.hidden = true;
    documentRef.body?.append?.(anchor);
    anchor.click?.();
    anchor.remove?.();
  } finally {
    urlApi.revokeObjectURL?.(objectUrl);
  }
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
  const summary = approval.effect === "media_generation"
    ? "该操作需积分扣费，请问是否继续？"
    : isHumanReadableAgentText(approval.summary) ? approval.summary : "该操作需要你的确认后才能继续。";
  return `<section class="canvas-agent-approval" data-approval-effect="${escapeAttr(approval.effect)}"${approval.toolId ? ` data-agent-tool-id="${escapeAttr(approval.toolId)}"` : ""} aria-label="${escapeAttr(`${approval.label}待确认`)}">
    <div class="canvas-agent-approval-head">
      <span class="canvas-agent-approval-badge">待确认 · ${escapeHtml(approval.label)}</span>
    </div>
    <p>${escapeHtml(summary)}</p>
    ${approval.effect === "media_generation" ? "" : `<small>${escapeHtml(approval.detail)}</small>`}
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
  if (agent.status === "waiting_external" && hasSettledMediaGeneration(agent)) {
    const mediaMessages = collapseAgentGenerationMessages(agent.messages)
      .filter((message) => message?.role === "tool" && String(message?.generationTaskId ?? ""));
    const hasFailure = mediaMessages.some((message) => ["failed", "canceled", "cancelled", "result_unknown", "manual_review_required"]
      .includes(String(message?.media?.status ?? "").toLowerCase()));
    return `${hasFailure ? "生成失败" : "已完成"}${agent.polling ? " · 同步中" : ""}`;
  }
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

function agentToolDisplayName(toolId) {
  return String(toolId ?? "").trim() ? "灵曦AI" : "";
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
    event.toolId ? agentToolDisplayName(event.toolId) : "",
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
  const toolSummary = event.toolId ? `${agentToolDisplayName(event.toolId)} 正在处理` : "";
  return String(
    failureCode ?? event.message ?? event.reason ?? (
      toolSummary || event.effect || event.status || event.errorCode || event.failureCode ||
      (event.stepId ? `步骤 ${event.stepId}` : "状态已更新")
    ),
  );
}

function friendlyAgentError(error) {
  const message = String(error?.message ?? error ?? "Agent 请求失败");
  const errorCode = String(error?.errorCode ?? "").trim();
  const labels = {
    provider_auth_missing: "当前 Agent 模型未配置可用密钥，请切换模型或联系管理员配置。",
    canvas_agent_conversation_missing: "会话创建失败，请重试。",
    canvas_agent_task_missing: "未找到 Agent 任务，请重新发送。",
    canvas_agent_memory_unavailable: "画布记忆接口暂不可用。",
    canvas_agent_memory_not_found: "这条画布记忆已不存在，请刷新后重试。",
    canvas_agent_memory_key_conflict: "当前会话已有相同记忆键。",
    canvas_agent_memory_key_invalid: "记忆键仅支持字母、数字及 . _ : -。",
    canvas_agent_memory_too_large: "记忆内容超过 16 KB 限制。",
  };
  return labels[errorCode] ?? labels[message] ?? message;
}

function sanitizeMediaOnlyAgentCopy(value) {
  const message = String(value ?? "").trim()
    .replace(/canvas\s+agent/giu, "灵曦AI")
    .replace(/我是\s+灵曦AI/gu, "我是灵曦AI");
  if (!message) return "";
  if (/(?:model_(?:provider_unsupported|not_configured)|provider[_\s-]*(?:unsupported|not[_\s-]*configured))/iu.test(message)) {
    return "当前所选生成模型暂不可用，请在右侧切换可用模型后重试。";
  }
  if (/(?:generation_queue_error|manual_review_required)/iu.test(message)) {
    return "生成任务暂时无法完成，请稍后重试。";
  }
  if (/canvas|画布/iu.test(message)) {
    if (/模型|model/iu.test(message)) return "当前生成类型没有可用模型，请切换模型或联系管理员配置。";
    if (/节点|node|引用|reference/iu.test(message)) return "当前生成引用已失效，请重新选择参考素材。";
    return "生成任务执行失败，请检查模型配置或参考素材后重试。";
  }
  return message;
}

function sanitizeAssistantAgentCopy(value, options = {}) {
  const message = String(value ?? "").trim()
    .replace(/canvas\s+agent/giu, "灵曦AI")
    .replace(/我是\s+灵曦AI/gu, "我是灵曦AI");
  if (message === "我是灵曦AI。出于安全与稳定性考虑，平台内部详情不对外提供。") {
    return "当前会话使用的模型可在右上角查看和切换。";
  }
  if (isLingxiBrandUnfamiliarity(message)) return lingxiBrandIntroduction;
  if (/(?:model_(?:provider_unsupported|not_configured)|provider[_\s-]*(?:unsupported|not[_\s-]*configured))/iu.test(message)) {
    return "当前所选生成模型暂不可用，请在右侧切换可用模型后重试。";
  }
  if (/(?:generation_queue_error|manual_review_required)/iu.test(message)) {
    return "生成任务暂时无法完成，请稍后重试。";
  }
  const mediaModelSwitchGuidance = mediaModelSwitchGuidanceFor(message);
  if (mediaModelSwitchGuidance) return mediaModelSwitchGuidance;
  if (isSensitiveAssistantDisclosure(message)) {
    return safeAssistantDisclosureReply(message);
  }
  return options.mediaOnly ? sanitizeMediaOnlyAgentCopy(message) : message;
}

function safeAssistantDisclosureReply(message) {
  return isBackendModelDisclosure(message)
    ? "当前会话使用的模型可在右上角查看和切换。"
    : "请描述你的创作需求，我会继续协助。";
}

function mediaModelSwitchGuidanceFor(value) {
  const message = String(value ?? "").trim().toLowerCase();
  if (!message) return "";
  const mediaKind = "(?:图片|图像|视频|音频|声音|image|video|audio|voice)";
  const model = "(?:模型|model)";
  const action = "(?:切换|更换|换成|改成|切到|换到|选择|选用|switch|change)";
  if (!new RegExp(`${action}.{0,16}${mediaKind}.{0,8}${model}|${mediaKind}.{0,8}${model}.{0,16}${action}`, "u").test(message)) return "";
  if (/(?:视频|video)/u.test(message)) return "可以切换视频模型，请在侧边栏的“视频”模型按钮中选择需要的模型。";
  if (/(?:音频|声音|audio|voice)/u.test(message)) return "可以切换音频模型，请在侧边栏的“音频”模型按钮中选择需要的模型。";
  return "可以切换图片模型，请在侧边栏的“图片”模型按钮中选择需要的模型。";
}

function isPublicModelAnswer(value) {
  const message = String(value ?? "").trim()
    .replace(/canvas\s+agent/giu, "灵曦AI")
    .replace(/我是\s+灵曦AI/gu, "我是灵曦AI");
  return /^我是灵曦AI，当前会话使用的模型为.+。$/u.test(message);
}

function publicModelAnswerDisplayName(value) {
  const message = String(value ?? "").trim()
    .replace(/canvas\s+agent/giu, "灵曦AI")
    .replace(/我是\s+灵曦AI/gu, "我是灵曦AI");
  return message.match(/^我是灵曦AI，当前会话使用的模型为(.+)。$/u)?.[1] ?? "";
}

const lingxiBrandIntroduction = "灵曦AI是 AI 创作平台，为创作者提供从灵感和剧本，到角色、场景、分镜，以及图片、视频和音频生成的一体化创作能力。";

function isLingxiBrandUnfamiliarity(value) {
  const message = String(value ?? "");
  return /灵曦(?:AI|剧场)?/u.test(message)
    && /(?:无法确认|无法确定|不清楚|不知道|缺乏(?:足够)?信息|同名(?:公司|品牌)?|公开资料)/u.test(message);
}

function isBackendModelDisclosure(value) {
  const message = String(value ?? "");
  const internalModelDetails = /(?:模型(?:代码|标识|编号|\s*(?:id|code|name))|model[ _-]?(?:id|code|name)|供应商|provider|平台配置|底层模型|后台模型)/iu.test(message);
  const modelCode = /\b(?:gpt|claude|gemini|deepseek|qwen|cumo|seedance|flux|kling|midjourney)[\w.-]*-\d[\w.-]*\b/iu.test(message);
  return internalModelDetails || modelCode;
}

function isSensitiveAssistantDisclosure(value) {
  const message = String(value ?? "");
  const internalData = /(?:后台|管理后台|系统提示|数据库|连接字符串|日志|密钥|api[ _-]?key|access[ _-]?token|secret|密码|凭据)/iu.test(message);
  const personalOrCrossUserData = /(?:其他用户|别的用户|用户(?:资料|信息|数据|手机号|邮箱|地址|订单|余额)|个人(?:资料|信息)|身份证|银行卡|手机号|电子?邮箱)/iu.test(message);
  const pricing = /(?:价格|收费|费率|成本|积分|余额|套餐|账单|订单|支付|充值)/iu.test(message);
  return isBackendModelDisclosure(message) || internalData || personalOrCrossUserData || pricing;
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

function assertAgentModelMediaSupport(model, attachments = [], references = []) {
  if (!agentModelSupportsMedia(model, attachments, references)) {
    const mediaKinds = [...(Array.isArray(attachments) ? attachments : []), ...(Array.isArray(references) ? references : [])]
      .map((item) => String(item?.kind ?? item?.mediaKind ?? "").trim().toLowerCase());
    if (mediaKinds.includes("image")) {
      throw new Error("当前 Agent 模型不支持图片分析，请切换支持图片输入的模型。");
    }
    if (mediaKinds.includes("video")) {
      throw new Error("当前 Agent 模型不支持视频分析，请切换支持视频输入的模型。");
    }
  }
}

function agentModelSupportsMedia(model, attachments = [], references = []) {
  const capabilities = model?.capabilities && typeof model.capabilities === "object"
    ? model.capabilities
    : {};
  const declaredInputs = new Set([capabilities.input, capabilities.inputs]
    .flatMap((value) => Array.isArray(value) ? value : typeof value === "string" ? [value] : [])
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean));
  const supportsImage = capabilities.vision === true
    || capabilities.imageInput === true
    || capabilities.multimodal === true
    || ["image", "image_url", "input_image", "vision", "multimodal"]
      .some((capability) => declaredInputs.has(capability));
  const supportsVideo = capabilities.videoInput === true
    || capabilities.video === true
    || capabilities.multimodal === true
    || ["video", "video_url", "input_video", "input_file", "multimodal"]
      .some((capability) => declaredInputs.has(capability));
  const mediaKinds = [...(Array.isArray(attachments) ? attachments : []), ...(Array.isArray(references) ? references : [])]
    .map((item) => String(item?.kind ?? item?.mediaKind ?? "").trim().toLowerCase());
  return (!mediaKinds.includes("image") || supportsImage)
    && (!mediaKinds.includes("video") || supportsVideo);
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
  return escapeHtml(resolveStaticAssetUrl(value)).replaceAll("`", "&#96;");
}
