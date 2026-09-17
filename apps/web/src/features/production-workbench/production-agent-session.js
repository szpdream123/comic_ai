import { escapeAttr, escapeHtml } from "./markup.js";

export const productionAgentSessionActions = [
  "close-production-agent-session",
  "stop-production-agent-session",
  "approve-production-agent-session",
  "reject-production-agent-session",
  "select-production-agent-artifact",
  "open-production-agent-project",
  "send-production-agent-message",
  "continue-production-agent-session",
  "load-more-production-agent-source",
];

const ACTIVE_TASK_STATUSES = new Set(["queued", "running", "waiting_approval"]);
const TERMINAL_TASK_STATUSES = new Set(["succeeded", "failed", "canceled"]);
const PRODUCTION_AGENT_SCROLL_STICKY_THRESHOLD_PX = 72;

export function emptyProductionAgentSession() {
  return {
    open: false,
    status: "idle",
    conversation: null,
    task: null,
    messages: [],
    events: [],
    selectedArtifact: null,
    selectedArtifactLocked: false,
    draft: "",
    streamText: "",
    streamToolId: "",
    eventCursor: 0,
    error: "",
  };
}

export function productionAgentConversationId(session = {}) {
  return String(session?.conversation?.id ?? session?.conversationId ?? "").trim();
}

export function productionAgentTaskId(session = {}) {
  return String(
    session?.task?.id ??
    session?.task?.taskId ??
    session?.conversation?.taskId ??
    "",
  ).trim();
}

export function productionAgentSessionMode(session = {}, fallback = "auto") {
  return "auto";
}

export function isProductionAgentSessionPolling(session = {}) {
  if (!session?.open) return false;
  const status = String(session?.task?.status ?? session?.conversation?.taskStatus ?? session?.status ?? "").trim();
  return ACTIVE_TASK_STATUSES.has(status);
}

export function captureProductionAgentTimelineScroll(element, options = {}) {
  if (!element) {
    return { scrollTop: 0, stickToBottom: true };
  }
  const scrollTop = Number(element.scrollTop ?? 0);
  const scrollHeight = Number(element.scrollHeight ?? 0);
  const clientHeight = Number(element.clientHeight ?? 0);
  return {
    scrollTop,
    stickToBottom:
      options.forceStickToBottom === true
      || scrollHeight <= 0
      || clientHeight <= 0
      || scrollHeight - (scrollTop + clientHeight) <= PRODUCTION_AGENT_SCROLL_STICKY_THRESHOLD_PX,
  };
}

export function restoreProductionAgentTimelineScroll(element, scrollState, options = {}) {
  if (!element) return;
  const stickToBottom = options.forceStickToBottom === true
    || scrollState?.stickToBottom === true;
  const apply = () => {
    if (element.isConnected === false) return;
    const maxScrollTop = Math.max(
      0,
      Number(element.scrollHeight ?? 0) - Number(element.clientHeight ?? 0),
    );
    if (stickToBottom) {
      element.scrollTop = maxScrollTop;
      return;
    }
    if (Number.isFinite(Number(scrollState?.scrollTop))) {
      element.scrollTop = Math.min(Math.max(0, Number(scrollState.scrollTop)), maxScrollTop);
    }
  };
  apply();
  if (!stickToBottom) return;
  const requestFrame = globalThis.requestAnimationFrame?.bind(globalThis);
  if (requestFrame) {
    requestFrame(() => {
      apply();
      requestFrame(apply);
    });
  } else {
    globalThis.setTimeout?.(apply, 0);
  }
  [80, 180, 360].forEach((delay) => {
    globalThis.setTimeout?.(apply, delay);
  });
}

export function unwrapProductionAgentList(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    if (Array.isArray(payload[key])) return payload[key];
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.data)) return payload.data;
  }
  return [];
}

export function unwrapProductionAgentRecord(payload, key) {
  if (!payload || typeof payload !== "object") return payload ?? null;
  if (payload[key] && typeof payload[key] === "object") return payload[key];
  return payload;
}

export function mergeProductionAgentSessionPoll(session = {}, payload = {}) {
  const conversation = unwrapProductionAgentRecord(payload.conversation ?? session.conversation, "conversation");
  const messages = unwrapProductionAgentList(payload.messages ?? session.messages, "messages");
  const events = unwrapProductionAgentList(payload.events ?? session.events, "events");
  const task = unwrapProductionAgentRecord(payload.task, "task")
    ?? session.task
    ?? (conversation?.taskId
      ? { id: conversation.taskId, status: conversation.taskStatus ?? session.status ?? "running" }
      : null);
  const status = String(task?.status ?? conversation?.taskStatus ?? session.status ?? "running").trim() || "running";
  const files = collectProductionAgentWorkspaceFiles(conversation);
  const selected = resolveProductionAgentSelectedFile(session, files);
  const created = resolveProductionAgentCreatedProject({ ...session, conversation, task, messages, events });
  const error = String(payload.error ?? (status === "failed" ? friendlyProductionAgentFailure(task, session) : session.error) ?? "").trim();
  return {
    ...emptyProductionAgentSession(),
    ...session,
    open: session.open !== false,
    status,
    conversation,
    task,
    messages,
    events,
    selectedArtifact: selected.path,
    selectedArtifactLocked: selected.locked,
    draft: session.draft ?? "",
    streamText: payload.streamText ?? session.streamText ?? "",
    streamToolId: payload.streamToolId ?? session.streamToolId ?? "",
    eventCursor: Math.max(Number(session.eventCursor ?? 0), maxProductionAgentEventCursor(events)),
    createdProjectId: created.projectId || session.createdProjectId || null,
    createdEpisodeId: created.episodeId || session.createdEpisodeId || null,
    error: status === "failed" || payload.error ? error : "",
  };
}

const PRODUCTION_AGENT_FAILURE_MESSAGES = {
  production_agent_round_budget_exceeded: "分析步骤过多，已停止。请发送「继续」或缩小范围后再试。",
  production_agent_model_response_invalid: "模型返回格式异常，请重试。",
  production_agent_model_call_failed: "模型调用失败，请稍后重试。",
  production_agent_canvas_tool_forbidden: "不允许调用画布工具。",
  production_agent_skill_not_found: "未找到所选 Skill。",
  production_agent_tool_execution_failed: "工具执行失败，请重试。",
  production_agent_tool_input_invalid: "工具参数无效，请重试。",
  production_agent_tool_not_allowed: "当前不允许使用该工具。",
  production_agent_skill_file_not_found: "未找到 Skill 文件。",
  production_agent_artifact_not_found: "未找到产物文件。",
  production_agent_project_json_required: "请先收口 project.json。",
  production_agent_use_format_project: "请使用收口项目，而不是直接写入 project.json。",
  production_agent_storyboards_incomplete: "分镜尚未覆盖全部剧本，请继续补全后再收口。",
  production_agent_characters_incomplete: "角色尚未覆盖全部剧本，请继续补全后再收口。",
  production_agent_scenes_incomplete: "场景尚未覆盖全部剧本，请继续补全后再收口。",
  production_agent_props_incomplete: "道具尚未覆盖全部剧本，请继续补全后再收口。",
  provider_output_truncated: "模型输出被截断。请点「继续全部」，或缩小单次产物后再试。",
  user_canceled: "已停止项目制作。",
  user_rejected: "已拒绝该操作。",
};

function friendlyProductionAgentFailure(task = {}, session = {}) {
  const message = String(task?.failureMessage ?? task?.message ?? "").trim();
  const code = String(task?.failureCode ?? "").trim();
  if (/402\s*Insufficient Balance|Insufficient Balance|insufficient[_\s-]?balance|余额不足/i.test(`${code} ${message}`)) {
    return "模型渠道余额不足，请充值或更换模型后再试。";
  }
  const mapped = PRODUCTION_AGENT_FAILURE_MESSAGES[code] || PRODUCTION_AGENT_FAILURE_MESSAGES[message];
  if (mapped) return mapped;
  if (code.startsWith("production_agent_storyboards_incomplete") || message.startsWith("production_agent_storyboards_incomplete")) {
    return "分镜尚未覆盖全部剧本，请继续补全后再收口。";
  }
  if (code.startsWith("production_agent_characters_incomplete") || message.startsWith("production_agent_characters_incomplete")) {
    return "角色尚未覆盖全部剧本，请继续补全后再收口。";
  }
  if (code.startsWith("production_agent_scenes_incomplete") || message.startsWith("production_agent_scenes_incomplete")) {
    return "场景尚未覆盖全部剧本，请继续补全后再收口。";
  }
  if (code.startsWith("production_agent_props_incomplete") || message.startsWith("production_agent_props_incomplete")) {
    return "道具尚未覆盖全部剧本，请继续补全后再收口。";
  }
  return message || code || session.error || "项目制作失败";
}

export function applyProductionAgentLiveEvent(session = {}, event = {}) {
  const eventType = String(event?.eventType ?? "");
  const payload = event?.event && typeof event.event === "object" ? event.event : {};
  const events = unwrapProductionAgentList(session.events, "events");
  const nextEvents = events.some((item) => String(item?.id ?? "") === String(event?.id ?? "") && String(item?.sequence ?? "") === String(event?.sequence ?? ""))
    ? events
    : [...events, event];
  const taskStatus = eventType === "task.status" ? String(payload.status ?? session.task?.status ?? "") : String(session.task?.status ?? session.status ?? "");
  const streamText = eventType === "model.delta" ? String(payload.text ?? "") : (["model.thinking", "tool.succeeded", "tool.failed", "task.status"].includes(eventType) ? "" : session.streamText ?? "");
  const streamToolId = eventType === "model.delta" ? String(payload.toolId ?? "") : (eventType.startsWith("tool.") ? String(payload.toolId ?? session.streamToolId ?? "") : session.streamToolId ?? "");
  return mergeProductionAgentSessionPoll(session, {
    events: nextEvents,
    task: taskStatus ? { ...(session.task ?? {}), id: event.taskId ?? session.task?.id, status: taskStatus, failureCode: payload.failureCode ?? session.task?.failureCode, failureMessage: payload.message ?? session.task?.failureMessage } : session.task,
    streamText,
    streamToolId,
    eventCursor: Math.max(Number(session.eventCursor ?? 0), Number(event.sequence ?? 0)),
  });
}

function maxProductionAgentEventCursor(events = []) {
  return (Array.isArray(events) ? events : []).reduce((max, event) => Math.max(max, Number(event?.sequence ?? 0)), 0);
}

export function resolveProductionAgentCreatedProject(session = {}) {
  const conversation = session?.conversation ?? {};
  let projectId = String(conversation.createdProjectId ?? session?.createdProjectId ?? "").trim();
  let episodeId = String(conversation.createdEpisodeId ?? session?.createdEpisodeId ?? "").trim();
  const inspect = (value) => {
    if (!value || typeof value !== "object") return;
    const nextProjectId = String(value.projectId ?? value.createdProjectId ?? "").trim();
    const nextEpisodeId = String(value.episodeId ?? value.createdEpisodeId ?? "").trim();
    if (!projectId && nextProjectId) projectId = nextProjectId;
    if (!episodeId && nextEpisodeId) episodeId = nextEpisodeId;
  };
  for (const event of Array.isArray(session?.events) ? session.events : []) {
    inspect(event?.event);
    inspect(event?.event?.output);
  }
  for (const message of Array.isArray(session?.messages) ? session.messages : []) {
    inspect(message?.content);
    inspect(message?.content?.output);
  }
  return { projectId, episodeId };
}

export function renderProductionAgentSession(ui = {}) {
  const session = ui.productionAgentSession;
  if (!session?.open) return "";
  const status = String(session.task?.status ?? session.status ?? "").trim();
  const running = ACTIVE_TASK_STATUSES.has(status);
  const created = resolveProductionAgentCreatedProject(session);
  const canContinue = !running && !created.projectId && ["succeeded", "failed", "canceled", "paused"].includes(status);
  const files = collectProductionAgentWorkspaceFiles(session.conversation);
  const selectedFile = resolveProductionAgentSelectedFile(session, files).file;
  const timeline = buildProductionAgentTimeline(session);
  const draft = String(session.draft ?? "");
  const canSend = Boolean(draft.trim()) && !running;
  return `
    <section class="single-episode-ai-overlay production-agent-session" role="dialog" aria-modal="true" aria-label="项目制作 Agent">
      <div class="single-episode-ai-overlay-top">
        <button class="single-episode-ai-back" type="button" data-action="close-production-agent-session">‹ 返回</button>
        <div class="single-episode-ai-top-status">
          <p>项目制作 Agent</p>
          <h3>DeepSeek</h3>
        </div>
        <div class="single-episode-ai-overlay-actions">
          ${running ? `<button class="single-episode-ai-create" type="button" data-action="stop-production-agent-session">停止</button>` : ""}
        </div>
      </div>
      <div class="production-agent-session-body">
        <div class="production-agent-session-chat">
          <div class="production-agent-session-timeline canvas-agent-timeline" aria-live="polite">
            ${timeline.length ? timeline.map((item, index) => renderProductionAgentTimelineItem(item, { canContinue, isLast: index === timeline.length - 1 })).join("") : `<div class="canvas-agent-empty"><p>你好！我是灵曦AI的项目制作 Agent。<br />上传的剧本已在右侧工作区，我会按所选 Skill 逐步分析。</p></div>`}
            ${running ? renderProductionAgentLiveStatus(session) : ""}
            ${session.error ? `<div class="canvas-agent-task-failed" role="status"><i aria-hidden="true"></i><span><strong>失败</strong><small>${escapeHtml(session.error)}</small></span></div>` : ""}
            ${canContinue ? `<div class="production-agent-session-success"><p>当前步骤已暂停，尚未完成全部产物。</p>${renderProductionAgentContinueActions(lastAssistantText(session))}</div>` : ""}
            ${created.projectId ? `<div class="production-agent-session-success"><p>项目已创建</p><button type="button" data-action="open-production-agent-project">进入工作台</button></div>` : ""}
          </div>
          <form class="production-agent-session-composer" data-production-agent-composer aria-label="继续对话">
            <textarea
              data-production-agent-draft
              rows="5"
              maxlength="8000"
              placeholder="${running ? "Agent 正在处理，完成后可继续发送" : "输入补充要求、只要角色、停在某一步，或让它继续…"}"
            >${escapeHtml(draft)}</textarea>
            <button type="button" data-action="send-production-agent-message" ${canSend ? "" : "disabled"}>发送</button>
          </form>
        </div>
        <aside class="production-agent-session-workspace" aria-label="会话工作区">
          <div class="production-agent-session-workspace-nav">
            <h3>工作区</h3>
            ${renderProductionAgentWorkspaceGroups(files, selectedFile)}
          </div>
          ${selectedFile ? renderProductionAgentArtifactPreview(session, selectedFile) : ""}
        </aside>
      </div>
    </section>
  `;
}

function renderProductionAgentArtifactPreview(session = {}, file = {}) {
  const preview = resolveProductionAgentFilePreview(session, file);
  const remaining = Math.max(0, preview.totalChars - preview.text.length);
  return `
    <div class="production-agent-session-preview">
      <div class="production-agent-session-artifact-meta">
        <span>${escapeHtml(formatProductionAgentCharCount(preview.text.length))}${preview.totalChars > preview.text.length ? ` / ${escapeHtml(formatProductionAgentCharCount(preview.totalChars))}` : ""}</span>
      </div>
      <pre class="production-agent-session-artifact">${escapeHtml(preview.text)}</pre>
      ${remaining > 0 ? `<button type="button" class="production-agent-session-load-more" data-action="load-more-production-agent-source">继续加载 ${escapeHtml(formatProductionAgentCharCount(Math.min(remaining, 8000)))}</button>` : ""}
    </div>
  `;
}

function resolveProductionAgentSelectedFile(session = {}, files = []) {
  const previewableFiles = files.filter((file) => file.kind !== "skill");
  const latestArtifact = [...previewableFiles].reverse().find((file) => file.kind === "artifact" || file.kind === "project") ?? null;
  const locked = session.selectedArtifactLocked === true
    && previewableFiles.some((file) => file.path === session.selectedArtifact);
  const path = locked
    ? String(session.selectedArtifact ?? "")
    : String(latestArtifact?.path ?? previewableFiles[0]?.path ?? "");
  const file = previewableFiles.find((item) => item.path === path) ?? latestArtifact ?? previewableFiles[0] ?? null;
  return { file, path: file?.path || null, locked };
}

function resolveProductionAgentFilePreview(session = {}, file = {}) {
  if (file.kind === "source") {
    const loaded = String(session.sourcePreview?.text ?? file.content ?? "");
    const totalChars = Number(session.sourcePreview?.totalChars ?? session.conversation?.source?.totalChars ?? loaded.length);
    return { text: loaded, totalChars };
  }
  if (file.kind === "skill") {
    const loaded = String(session.skillPreviews?.[file.path] ?? file.content ?? "");
    return { text: loaded || "点选后加载 Skill 内容", totalChars: loaded.length };
  }
  const content = String(file.content ?? "");
  const maxChars = 8000;
  return {
    text: content.length > maxChars ? content.slice(0, maxChars) : content,
    totalChars: content.length,
  };
}

function formatProductionAgentCharCount(value) {
  const count = Number(value ?? 0);
  if (count >= 10000) return `${Math.round(count / 1000)}k 字`;
  return `${count} 字`;
}

function renderProductionAgentWorkspaceGroups(files = [], selectedFile = null) {
  if (!files.length) return `<p class="production-agent-session-empty">暂无文件</p>`;
  const groups = [
    { kind: "source", title: "源文本" },
    { kind: "skill", title: "Skill" },
    { kind: "artifact", title: "产物" },
    { kind: "project", title: "项目" },
  ];
  return groups.map((group) => {
    const items = files.filter((file) => file.kind === group.kind);
    if (!items.length) return "";
    return `<section class="production-agent-session-file-group">
      <h4>${escapeHtml(group.title)}</h4>
      <ul class="production-agent-session-files">${items.map((file) => `
        <li>
          ${file.kind === "skill"
            ? `<span class="production-agent-session-file is-static">${escapeHtml(file.label || file.path)}</span>`
            : `<button type="button" class="production-agent-session-file${file.path === selectedFile?.path ? " is-active" : ""}" data-action="select-production-agent-artifact" data-path="${escapeAttr(file.path)}">${escapeHtml(file.label || file.path)}</button>`}
        </li>
      `).join("")}</ul>
    </section>`;
  }).join("");
}

function collectProductionAgentWorkspaceFiles(conversation = {}) {
  const files = [];
  const seen = new Set();
  const push = (path, content, kind, label = "") => {
    const nextPath = String(path ?? "").trim();
    if (!nextPath || seen.has(nextPath)) return;
    seen.add(nextPath);
    files.push({ path: nextPath, content: String(content ?? ""), kind, label: label || nextPath });
  };
  const source = conversation?.source && typeof conversation.source === "object" ? conversation.source : {};
  const sourceName = String(source.scriptFileName ?? source.fileName ?? "源文本").trim();
  if (sourceName) push(sourceName, source.previewText ?? source.text ?? "", "source");
  for (const skill of Array.isArray(conversation?.skillCatalog) ? conversation.skillCatalog : []) {
    const skillName = String(skill?.name ?? "Skill").trim() || "Skill";
    const skillId = String(skill?.id ?? skillName).trim() || skillName;
    push(`skill/${skillId}`, String(skill?.description ?? ""), "skill", skillName);
  }
  const artifacts = conversation?.workspace?.artifacts;
  if (artifacts && typeof artifacts === "object") {
    for (const [path, content] of Object.entries(artifacts)) {
      push(path, content, "artifact");
    }
  }
  if (conversation?.workspace?.projectJson) {
    push("project.json", JSON.stringify(conversation.workspace.projectJson, null, 2), "project");
  }
  return files;
}

function buildProductionAgentTimeline(session = {}) {
  const items = [];
  const seenTools = new Set();
  for (const message of Array.isArray(session.messages) ? session.messages : []) {
    const role = String(message?.role ?? "").trim();
    const content = message?.content && typeof message.content === "object" ? message.content : {};
    const text = resolveMessageText(message);
    const toolId = String(content.toolId ?? message?.toolId ?? "").trim();
    const createdAt = message?.createdAt ?? message?.created_at ?? "";
    if (role === "user" || role === "assistant") {
      if (text) items.push({ type: role, text, createdAt });
      continue;
    }
    if (role === "system") continue;
    if (toolId || role === "tool") {
      const key = `${toolId}:${content.callId ?? content.path ?? text}`;
      seenTools.add(key);
      items.push({
        type: toolId === "create_project" && (content.status === "succeeded" || content.output?.projectId) ? "create-project" : "tool",
        toolId: toolId || "tool",
        summary: summarizeProductionAgentTool(toolId, content, text),
        createdAt,
      });
    }
  }
  const decidedApprovals = new Set(
    (Array.isArray(session.events) ? session.events : [])
      .filter((event) => ["approval.decided", "approval.approved", "approval.rejected"].includes(String(event?.eventType ?? "")))
      .map((event) => String(event?.event?.approvalId ?? "")),
  );
  for (const event of Array.isArray(session.events) ? session.events : []) {
    const eventType = String(event?.eventType ?? "");
    const payload = event?.event && typeof event.event === "object" ? event.event : {};
    const toolId = String(payload.toolId ?? "").trim();
    if (eventType === "approval.requested") {
      const approvalId = String(payload.approvalId ?? "").trim();
      if (!approvalId || decidedApprovals.has(approvalId)) continue;
      items.push({
        type: "approval",
        approvalId,
        toolId,
        summary: String(payload.reason ?? payload.summary ?? "该操作需要你的确认后才能继续。").trim(),
      });
      continue;
    }
    if (toolId === "create_project" && (eventType.includes("succeeded") || payload.status === "succeeded" || payload.output?.projectId || payload.projectId)) {
      items.push({
        type: "create-project",
        toolId,
        summary: summarizeProductionAgentTool(toolId, payload, "项目已创建"),
      });
    }
  }
  if (resolveProductionAgentCreatedProject(session).projectId && !items.some((item) => item.type === "create-project")) {
    items.push({ type: "create-project", toolId: "create_project", summary: "项目已创建" });
  }
  return items;
}

function renderProductionAgentTimelineItem(item, options = {}) {
  if (item.type === "user" || item.type === "assistant") {
    const title = item.type === "user" ? "你" : "灵曦";
    const time = formatProductionAgentTime(item.createdAt);
    const showContinue = item.type === "assistant" && options.canContinue && options.isLast;
    return `<article class="canvas-agent-event" data-event-role="${escapeAttr(item.type)}" data-event-kind="answer">
      <i aria-hidden="true"></i>
      <div>
        <span class="canvas-agent-event-title"><strong>${title}</strong></span>
        <p>${escapeHtml(item.text).replaceAll("\n", "<br>")}</p>
        ${showContinue ? renderProductionAgentContinueActions(item.text) : ""}
        ${time ? `<div class="canvas-agent-message-footer"><time class="canvas-agent-message-time">${escapeHtml(time)}</time></div>` : ""}
      </div>
    </article>`;
  }
  if (item.type === "tool") {
    return `<article class="canvas-agent-event" data-event-role="tool" data-event-kind="file">
      <i aria-hidden="true"></i>
      <div>
        <span class="canvas-agent-event-title"><strong>${escapeHtml(productionAgentToolLabel(item.toolId))}</strong><span class="canvas-agent-event-title-meta"><em>工具</em></span></span>
        <p>${escapeHtml(item.summary)}</p>
      </div>
    </article>`;
  }
  if (item.type === "approval") {
    return `<article class="canvas-agent-event production-agent-session-approval" data-event-role="assistant" data-event-kind="file">
      <i aria-hidden="true"></i>
      <div>
        <span class="canvas-agent-event-title"><strong>需要确认</strong><span class="canvas-agent-event-title-meta"><em>${escapeHtml(productionAgentToolLabel(item.toolId))}</em></span></span>
        <p>${escapeHtml(item.summary)}</p>
        <div class="production-agent-session-approval-actions">
          <button type="button" data-action="approve-production-agent-session" data-approval-id="${escapeAttr(item.approvalId)}">继续</button>
          <button type="button" data-action="reject-production-agent-session" data-approval-id="${escapeAttr(item.approvalId)}">停止</button>
        </div>
      </div>
    </article>`;
  }
  if (item.type === "create-project") {
    return `<article class="canvas-agent-event" data-event-role="assistant" data-event-kind="file">
      <i aria-hidden="true"></i>
      <div>
        <span class="canvas-agent-event-title"><strong>创建项目</strong></span>
        <p>${escapeHtml(item.summary || "项目已创建")}</p>
        <div class="production-agent-session-approval-actions">
          <button type="button" data-action="open-production-agent-project">进入工作台</button>
        </div>
      </div>
    </article>`;
  }
  return "";
}

function productionAgentToolLabel(toolId) {
  return ({
    load_skill: "加载 Skill",
    list_skill_files: "查看 Skill 文件",
    read_skill_file: "读取 Skill 文件",
    read_source: "读取源文本",
    write_artifact: "写入产物",
    read_artifact: "读取产物",
    ask_user: "询问你",
    format_project: "收口项目格式",
    create_project: "创建项目",
  })[String(toolId ?? "")] || String(toolId ?? "工具");
}

function summarizeProductionAgentTool(toolId, content = {}, fallback = "") {
  const output = content.output && typeof content.output === "object" ? content.output : content;
  if (toolId === "load_skill") return `已加载 ${output.path ?? "SKILL.md"}`;
  if (toolId === "read_skill_file") {
    const files = Array.isArray(output.files) ? output.files : [];
    const paths = files.map((file) => String(file?.path ?? "").trim()).filter(Boolean);
    if (paths.length > 1) return `已读取 ${paths.join("、")}`;
    return `已读取 ${output.path ?? paths[0] ?? "Skill 文件"}`;
  }
  if (toolId === "write_artifact") return `已写入 ${output.path ?? "产物"}`;
  if (toolId === "format_project") {
    if (output.incomplete) {
      const uncovered = output.uncovered && typeof output.uncovered === "object" ? output.uncovered : {};
      const parts = [
        ["角色", uncovered.characters],
        ["场景", uncovered.scenes],
        ["道具", uncovered.props],
        ["分镜", uncovered.storyboards],
      ].filter(([, items]) => Array.isArray(items) && items.length)
        .map(([label, items]) => `${label}缺 ${items.join("、")}`);
      return parts.length
        ? `尚未覆盖全部剧本，已暂停收口：${parts.join("；")}`
        : "尚未覆盖全部剧本，已暂停收口，请继续补全角色、场景、道具或分镜。";
    }
    const summary = output.summary && typeof output.summary === "object" ? output.summary : {};
    return `已收口 project.json：角色 ${summary.characterCount ?? 0}、场景 ${summary.sceneCount ?? 0}、道具 ${summary.propCount ?? 0}、分镜 ${summary.shotCount ?? 0}`;
  }
  if (toolId === "create_project") return output.projectId ? `项目已创建 ${output.projectId}` : "项目已创建";
  if (toolId === "ask_user") return String(output.question ?? fallback);
  return String(output.summary ?? output.path ?? fallback ?? toolId).trim();
}

function renderProductionAgentLiveStatus(session = {}) {
  const streamText = String(session.streamText ?? "").trim();
  const streamToolId = String(session.streamToolId ?? "").trim();
  if (streamText) {
    return `<article class="canvas-agent-event is-streaming" data-event-role="assistant" data-event-kind="answer" role="status">
      <i aria-hidden="true"></i>
      <div>
        <span class="canvas-agent-event-title"><strong>灵曦</strong></span>
        <p class="production-agent-session-stream">${escapeHtml(streamText).replaceAll("\n", "<br>")}</p>
      </div>
    </article>`;
  }
  if (streamToolId) {
    return `<div class="canvas-agent-thinking" role="status"><i aria-hidden="true"></i><span>正在生成 ${escapeHtml(productionAgentToolLabel(streamToolId))}</span></div>`;
  }
  return `<div class="canvas-agent-thinking" role="status"><i aria-hidden="true"></i><span>${escapeHtml(resolveProductionAgentActivity(session))}</span></div>`;
}

function resolveProductionAgentActivity(session = {}) {
  const events = Array.isArray(session.events) ? session.events : [];
  const latest = events.at(-1);
  const eventType = String(latest?.eventType ?? "");
  const toolId = String(latest?.event?.toolId ?? "");
  if (eventType === "approval.requested") return "正在等待你的确认";
  if (eventType === "model.thinking") return toolId ? `正在准备 ${productionAgentToolLabel(toolId)}` : "正在分析并生成内容";
  if (eventType === "tool.succeeded") return toolId ? `正在完成 ${productionAgentToolLabel(toolId)}` : "正在整理结果";
  if (eventType === "tool.failed") return "工具执行失败，正在调整";
  if (eventType === "model.delta") return toolId ? `正在生成 ${productionAgentToolLabel(toolId)}` : "正在输出内容";
  if (eventType.startsWith("tool.") || eventType.includes("step")) {
    return toolId ? `正在执行 ${productionAgentToolLabel(toolId)}` : "正在思考中";
  }
  return "正在思考中";
}

function formatProductionAgentTime(value) {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function lastAssistantText(session = {}) {
  const messages = Array.isArray(session.messages) ? session.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (String(message?.role ?? "").trim() !== "assistant") continue;
    const text = resolveMessageText(message);
    if (text) return text;
  }
  return "";
}

const PRODUCTION_AGENT_STEP_OPTIONS = [
  { id: "characters", label: "角色", pattern: /角色|character/i },
  { id: "scenes", label: "场景", pattern: /场景|scene/i },
  { id: "props", label: "道具", pattern: /道具|prop/i },
  { id: "shots", label: "分镜", pattern: /分镜|shot|storyboard/i },
  { id: "format", label: "收口项目", pattern: /format_project|收口|project\.json/i },
  { id: "create", label: "创建项目", pattern: /create_project|创建项目/i },
];

export function extractProductionAgentNextSteps(text = "") {
  return PRODUCTION_AGENT_STEP_OPTIONS.filter((option) => option.pattern.test(String(text ?? "")));
}

export function productionAgentContinuePrompt(step = "all") {
  if (step === "characters") return "继续抽取角色。不要询问确认，直接基于已有剧本写出角色表产物。";
  if (step === "scenes") return "继续抽取场景。不要询问确认，直接基于已有剧本写出场景设定产物。";
  if (step === "props") return "继续抽取道具。不要询问确认，直接基于已有剧本写出道具表产物。";
  if (step === "shots") return "继续抽取分镜。不要询问确认，直接基于已有剧本写出分镜表产物。";
  if (step === "format") return "继续收口项目。不要询问确认，直接调用 format_project。";
  if (step === "create") return "继续创建项目。不要询问确认，直接调用 create_project。";
  return "继续。不要询问确认，直接写出剩余产物，然后 format_project 并 create_project。";
}

function renderProductionAgentContinueActions(text = "") {
  const steps = extractProductionAgentNextSteps(text);
  const buttons = [
    `<button type="button" data-action="continue-production-agent-session" data-step="all">继续全部</button>`,
    ...steps.map((step) => `<button type="button" data-action="continue-production-agent-session" data-step="${escapeAttr(step.id)}">${escapeHtml(step.label)}</button>`),
  ];
  return `<div class="production-agent-session-approval-actions">${buttons.join("")}</div>`;
}

function resolveMessageText(message) {
  if (typeof message?.text === "string" && message.text.trim()) return message.text.trim();
  const content = message?.content;
  if (typeof content === "string") return content.trim();
  if (content && typeof content === "object") {
    const text = content.message ?? content.text ?? content.content ?? content.summary;
    if (typeof text === "string") return text.trim();
  }
  return "";
}

export { ACTIVE_TASK_STATUSES, TERMINAL_TASK_STATUSES };
