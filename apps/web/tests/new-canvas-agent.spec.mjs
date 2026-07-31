import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collapseAgentGenerationMessages,
  collapseAgentTimelineEvents,
  createCanvasAgentController,
  ensureCanvasAgentState,
  normalizeAgentMediaTask,
  normalizeAgentMemoryRecord,
  normalizeAgentMessage,
  reduceCanvasAgentEvents,
  renderCanvasAgentPanel,
  resolveAgentContextUsage,
  resolveAgentApprovalPresentation,
} from "../src/features/new-canvas/canvas-agent-panel.js";

test("Canvas Agent timeline collapses lifecycle events by step", () => {
  const events = [
    { id: "task-started", sequence: 1, eventType: "task.started", event: {} },
    { id: "patch-created", sequence: 2, eventType: "step.created", event: { stepId: "patch-1", toolId: "canvas.patch" } },
    { id: "patch-policy", sequence: 3, eventType: "policy.decided", event: { stepId: "patch-1", decision: "require_approval" } },
    { id: "patch-running-1", sequence: 4, eventType: "step.running", event: { stepId: "patch-1" } },
    { id: "patch-running-2", sequence: 5, eventType: "step.running", event: { stepId: "patch-1" } },
    { id: "patch-succeeded", sequence: 6, eventType: "step.succeeded", event: { stepId: "patch-1" } },
    { id: "model-created", sequence: 7, eventType: "step.created", event: { stepId: "model-1", kind: "model" } },
    { id: "model-running-1", sequence: 8, eventType: "step.running", event: { stepId: "model-1" } },
    { id: "model-running-2", sequence: 9, eventType: "step.running", event: { stepId: "model-1" } },
  ];

  const collapsed = collapseAgentTimelineEvents(events);
  assert.deepEqual(collapsed.map((event) => event.eventType), ["task.started", "step.succeeded", "step.running"]);
  assert.equal(collapsed[1].event.toolId, "canvas.patch");
  assert.equal(collapsed[1].event.decision, "require_approval");

  const html = renderCanvasAgentPanel({ canvasAgent: { events } });
  assert.equal((html.match(/data-event-status="step\.succeeded"/g) ?? []).length, 1);
  assert.equal((html.match(/data-event-status="step\.running"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /data-event-status="step\.created"|data-event-status="policy\.decided"/);
  assert.match(html, /工具 canvas\.patch/);
});

test("Canvas Agent timeline shows failure codes instead of stale policy reasons", () => {
  const events = [
    { id: "generation-created", sequence: 1, eventType: "step.created", event: { stepId: "generation-1", toolId: "generation.create" } },
    { id: "generation-policy", sequence: 2, eventType: "policy.decided", event: { stepId: "generation-1", decision: "require_approval", reason: "b_mode_effect" } },
    { id: "generation-failed", sequence: 3, eventType: "step.failed", event: { stepId: "generation-1", errorCode: "canvas_agent_generation_model_required" } },
    { id: "task-failed", sequence: 4, eventType: "task.failed", event: { status: "failed", failureCode: "canvas_agent_duplicate_side_effect" } },
  ];

  const html = renderCanvasAgentPanel({ canvasAgent: { events } });
  assert.match(html, /canvas_agent_generation_model_required/);
  assert.match(html, /canvas_agent_duplicate_side_effect/);
  assert.doesNotMatch(html, />b_mode_effect</);
});

test("Canvas Agent completion displays actual token usage", () => {
  const html = renderCanvasAgentPanel({
    canvasAgent: {
      events: [{
        id: "task-completed",
        sequence: 1,
        eventType: "task.succeeded",
        event: {
          message: "画布任务已完成",
          tokenUsage: { promptTokens: 1_200, completionTokens: 345, totalTokens: 1_545 },
        },
      }],
    },
  });

  assert.match(html, /实际 Token 1,545/);
  assert.doesNotMatch(html, /输入 1,200|输出 345/);
});

test("Canvas Agent panel exposes conversation modes, composer, and task controls", () => {
  const ui = {
    canvasAgent: {
      mode: "expert",
      modeMenuOpen: true,
      modelCode: "agent-text-1",
      taskId: "task-1",
      status: "running",
      events: [],
    },
  };
  const html = renderCanvasAgentPanel(ui);
  assert.match(html, /data-agent-action="toggle-mode-menu"/);
  assert.match(html, /data-agent-mode="b"/);
  assert.match(html, /data-agent-mode="c"/);
  assert.match(html, /data-agent-mode="plan"/);
  assert.match(html, /data-agent-mode="expert"/);
  assert.match(html, /审核批准/);
  assert.match(html, /自动执行/);
  assert.match(html, /计划模式/);
  assert.match(html, /分析模式/);
  assert.match(html, /修改画布等有副作用的操作会先请求你的批准/);
  assert.match(html, /role="listbox"/);
  assert.doesNotMatch(html, /role="tablist"/);
  assert.match(html, /data-agent-action="pause"/);
  assert.match(html, /data-agent-action="replan"/);
  assert.match(html, /data-agent-action="stop"/);
  assert.match(html, /data-agent-action="interject"/);
  assert.match(html, /<select[^>]+data-agent-field="modelCode"[^>]+disabled/);
  assert.match(html, /aria-label="文本模型"/);
  assert.match(html, /暂无可用文本模型/);
  assert.doesNotMatch(html, /<input[^>]+data-agent-field="modelCode"/);
});

test("Canvas Agent mode menu opens upward and applies the selected mode", async () => {
  const workbench = { ui: { canvasAgent: { mode: "b" } }, api: {} };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
  });

  await controller.handleAction({ dataset: { agentAction: "toggle-mode-menu" } });
  assert.equal(workbench.ui.canvasAgent.modeMenuOpen, true);
  assert.match(renderCanvasAgentPanel(workbench.ui), /class="canvas-agent-mode-menu"/);

  await controller.handleAction({ dataset: { agentAction: "set-mode", agentMode: "c" } });
  assert.equal(workbench.ui.canvasAgent.mode, "c");
  assert.equal(workbench.ui.canvasAgent.modeMenuOpen, false);
  assert.match(renderCanvasAgentPanel(workbench.ui), /class="canvas-agent-mode-trigger [^"]*"[^>]*>[\s\S]*自动执行/);
  controller.dispose();
});

test("Canvas Agent mode menu closes when clicking outside the picker", async () => {
  const workbench = { ui: { canvasAgent: { mode: "b" } }, api: {} };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
  });

  await controller.handleAction({ dataset: { agentAction: "toggle-mode-menu" } });
  assert.equal(workbench.ui.canvasAgent.modeMenuOpen, true);
  assert.equal(controller.handleClick({ closest: () => null }), true);
  assert.equal(workbench.ui.canvasAgent.modeMenuOpen, false);
  controller.dispose();
});

test("Canvas Agent closes without rerendering the workspace or resetting the hand tool", async () => {
  let renderLayoutCalls = 0;
  let panelRemoved = false;
  let reopenMarkup = "";
  const layout = {
    classList: {
      toggle(name, enabled) {
        assert.equal(name, "is-agent-collapsed");
        assert.equal(enabled, true);
      },
    },
  };
  const workspace = {
    insertAdjacentHTML(position, markup) {
      assert.equal(position, "beforeend");
      reopenMarkup = markup;
    },
  };
  const panel = { remove() { panelRemoved = true; } };
  const workbench = {
    ui: {
      canvasDocument: { viewport: { interactionMode: "hand" } },
      canvasAgent: { panelOpen: true },
    },
    api: {},
  };
  const controller = createCanvasAgentController({
    surface: {
      querySelector(selector) {
        if (selector === ".new-canvas-layout") return layout;
        if (selector === "[data-new-canvas-workspace]") return workspace;
        if (selector === "[data-canvas-agent-panel]") return panel;
        return null;
      },
    },
    workbench,
    renderLayout() {
      renderLayoutCalls += 1;
      workbench.ui.canvasDocument.viewport.interactionMode = "default";
    },
  });

  await controller.handleAction({ dataset: { agentAction: "close-agent-panel" } });

  assert.equal(panelRemoved, true);
  assert.match(reopenMarkup, /data-agent-action="open-agent-panel"/);
  assert.equal(renderLayoutCalls, 0);
  assert.equal(workbench.ui.canvasDocument.viewport.interactionMode, "hand");
  controller.dispose();
});

test("Canvas Agent timeline follows new messages unless the user scrolled up", () => {
  const previousDocument = globalThis.document;
  const runSync = (scrollTop) => {
    const currentTimeline = { scrollTop, scrollHeight: 500, clientHeight: 100 };
    const nextTimeline = { scrollTop: 0, scrollHeight: 700, clientHeight: 100 };
    let nextPanel = null;
    const currentPanel = {
      querySelector(selector) {
        return selector === ".canvas-agent-timeline" ? currentTimeline : null;
      },
      replaceWith(panel) {
        nextPanel = panel;
      },
    };
    const renderedPanel = {
      querySelector(selector) {
        return selector === ".canvas-agent-timeline" ? nextTimeline : null;
      },
    };
    globalThis.document = {
      createElement() {
        return { content: { firstElementChild: renderedPanel } };
      },
    };
    const controller = createCanvasAgentController({
      surface: { querySelector: () => currentPanel },
      workbench: { ui: { canvasAgent: {} }, api: {} },
    });
    controller.syncPanel();
    controller.dispose();
    assert.equal(nextPanel, renderedPanel);
    return nextTimeline.scrollTop;
  };

  try {
    assert.equal(runSync(400), 600);
    assert.equal(runSync(160), 160);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("Canvas Agent keeps the latest message visible across an external canvas rerender", () => {
  let timeline = { scrollTop: 400, scrollHeight: 500, clientHeight: 100 };
  const controller = createCanvasAgentController({
    surface: {
      querySelector(selector) {
        return selector === ".canvas-agent-timeline" ? timeline : null;
      },
    },
    workbench: { ui: { canvasAgent: {} }, api: {} },
  });

  const state = controller.captureTimelineScroll();
  timeline = { scrollTop: 0, scrollHeight: 900, clientHeight: 100 };
  controller.restoreTimelineScroll(state);

  assert.equal(timeline.scrollTop, 800);
  controller.dispose();
});

test("Canvas Agent event reducer deduplicates sequences and exposes pending approval", () => {
  const ui = {};
  const agent = ensureCanvasAgentState(ui);
  reduceCanvasAgentEvents(agent, [
    { id: "event-1", sequence: 1, eventType: "task.started", event: {} },
    { id: "event-2", sequence: 2, eventType: "approval.requested", event: { approvalId: "approval-1", reason: "canvas_write" } },
    { id: "event-2b", sequence: 2, eventType: "approval.requested", event: { approvalId: "approval-1", reason: "canvas_write" } },
  ]);
  assert.equal(agent.events.length, 2);
  assert.equal(agent.sequence, 2);
  assert.equal(agent.status, "waiting_approval");
  assert.match(renderCanvasAgentPanel(ui), /data-approval-id="approval-1"/);
});

test("Canvas Agent approval identifies the controlled effect and originating tool", () => {
  const events = [
    { sequence: 1, eventType: "step.created", event: { stepId: "step-1", toolId: "provider.config.apply" } },
    { sequence: 2, eventType: "approval.requested", event: { approvalId: "approval-1", stepId: "step-1", effect: "config_write", reason: "应用配置草稿" } },
  ];
  const presentation = resolveAgentApprovalPresentation(events, events[1]);
  assert.deepEqual(presentation, {
    approvalId: "approval-1",
    effect: "config_write",
    label: "后台配置",
    detail: "不会写入 API Key；新连接保持空白，已有 Secret Reference 保留原值。",
    summary: "应用配置草稿",
    toolId: "provider.config.apply",
  });
  const html = renderCanvasAgentPanel({ canvasAgent: { events, status: "waiting_approval" } });
  assert.match(html, /data-approval-effect="config_write"/);
  assert.match(html, /provider\.config\.apply/);
  assert.match(html, /确认执行/);
});

test("Canvas Agent controller reuses creator-api aliases for conversation, messages, polling, and controls", async () => {
  const calls = [];
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-1",
      canvasAgent: { mode: "plan", modelCode: "agent-text-1", promptDraft: "整理当前画布" },
    },
    api: {
      async listCanvasAgentModels(canvasId) {
        calls.push(["models", canvasId]);
        return { models: [{ modelCode: "agent-text-1", modelLabel: "Agent Text 1" }] };
      },
      async createCanvasAgentConversation(canvasId, input) {
        calls.push(["conversation", canvasId, input]);
        return { conversation: { id: "conversation-1" } };
      },
      async sendCanvasAgentMessage(canvasId, conversationId, input) {
        calls.push(["message", canvasId, conversationId, input]);
        return { task: { id: "task-1", status: "queued" } };
      },
      async listCanvasAgentEvents(canvasId, taskId, input) {
        calls.push(["events", canvasId, taskId, input]);
        return { events: [] };
      },
      async controlCanvasAgentTask(canvasId, taskId, action, input) {
        calls.push(["control", canvasId, taskId, action, input]);
        return { result: { status: action === "pause" ? "paused" : action === "stop" ? "cancel_requested" : "queued" } };
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    pollIntervalMs: 60_000,
  });
  await controller.loadModels();
  await controller.handleAction({ dataset: { agentAction: "send" } });
  assert.deepEqual(calls[0], ["models", "canvas-1"]);
  assert.deepEqual(calls[1], ["conversation", "canvas-1", { title: "画布协作" }]);
  assert.equal(calls[2][0], "message");
  assert.deepEqual(calls[2][3], {
    modelCode: "agent-text-1",
    mode: "plan",
    message: { text: "整理当前画布" },
  });
  await controller.handleAction({ dataset: { agentAction: "pause" } });
  assert.deepEqual(calls[3].slice(0, 4), ["control", "canvas-1", "task-1", "pause"]);
  assert.equal(workbench.ui.canvasAgent.status, "paused");
  workbench.ui.canvasAgent.interjectionDraft = "先调整人物关系";
  await controller.handleAction({ dataset: { agentAction: "resume" } });
  await controller.handleAction({ dataset: { agentAction: "replan" } });
  await controller.handleAction({ dataset: { agentAction: "interject" } });
  await controller.handleAction({ dataset: { agentAction: "approve", approvalId: "approval-1" } });
  await controller.handleAction({ dataset: { agentAction: "reject", approvalId: "approval-2" } });
  await controller.handleAction({ dataset: { agentAction: "stop" } });
  const controls = calls.filter((call) => call[0] === "control");
  assert.deepEqual(controls.map((call) => call[3]), [
    "pause", "resume", "replan", "interject", "approve", "approve", "stop",
  ]);
  assert.deepEqual(controls[3][4], { message: { text: "先调整人物关系" } });
  assert.deepEqual(controls[4][4], { approvalId: "approval-1", decision: "approved" });
  assert.deepEqual(controls[5][4], { approvalId: "approval-2", decision: "rejected" });
  controller.dispose();
});

test("Canvas Agent controller consumes live SSE and stops reconnecting after a terminal event", async () => {
  const streamCalls = [];
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-live",
      canvasAgent: {
        mode: "b",
        modelCode: "agent-text-1",
        models: [{ modelCode: "agent-text-1", modelLabel: "Agent Text 1" }],
        modelsStatus: "ready",
        promptDraft: "实时执行",
      },
    },
    api: {
      async createCanvasAgentConversation() {
        return { conversation: { id: "conversation-live" } };
      },
      async sendCanvasAgentMessage() {
        return { task: { id: "task-live", status: "queued" } };
      },
      async *streamCanvasAgentEvents(canvasId, taskId, input) {
        streamCalls.push([canvasId, taskId, input.after, Boolean(input.signal)]);
        yield { data: { id: "event-1", sequence: 1, eventType: "task.started", event: {} } };
        yield { data: { id: "event-2", sequence: 2, eventType: "task.succeeded", event: {} } };
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    pollIntervalMs: 1,
  });
  await controller.handleAction({ dataset: { agentAction: "send" } });
  for (let index = 0; index < 20 && workbench.ui.canvasAgent.status !== "succeeded"; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.deepEqual(streamCalls, [["canvas-live", "task-live", 0, true]]);
  assert.equal(workbench.ui.canvasAgent.sequence, 2);
  assert.equal(workbench.ui.canvasAgent.status, "succeeded");
  assert.equal(workbench.ui.canvasAgent.polling, false);
  controller.dispose();
});

test("Canvas Agent refreshes the canvas as soon as canvas.patch succeeds", async () => {
  const refreshes = [];
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-live",
      canvasAgent: {
        mode: "b",
        modelCode: "agent-text-1",
        models: [{ modelCode: "agent-text-1", modelLabel: "Agent Text 1" }],
        modelsStatus: "ready",
        promptDraft: "连接节点",
      },
    },
    refreshCanvasAfterAgentPatch() {
      refreshes.push("canvas.patch");
    },
    api: {
      async createCanvasAgentConversation() {
        return { conversation: { id: "conversation-live" } };
      },
      async sendCanvasAgentMessage() {
        return { task: { id: "task-live", status: "queued" } };
      },
      async *streamCanvasAgentEvents() {
        yield { data: { id: "event-1", sequence: 1, eventType: "step.created", event: { stepId: "patch-1", toolId: "canvas.patch" } } };
        yield { data: { id: "event-2", sequence: 2, eventType: "step.succeeded", event: { stepId: "patch-1" } } };
        yield { data: { id: "event-3", sequence: 3, eventType: "task.succeeded", event: {} } };
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    pollIntervalMs: 1,
  });
  await controller.handleAction({ dataset: { agentAction: "send" } });
  for (let index = 0; index < 20 && !refreshes.length; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.deepEqual(refreshes, ["canvas.patch"]);
  controller.dispose();
});

test("Canvas Agent refreshes the canvas when media generation starts and completes", async () => {
  const refreshes = [];
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-live",
      canvasAgent: {
        mode: "c",
        modelCode: "agent-text-1",
        models: [{ modelCode: "agent-text-1", modelLabel: "Agent Text 1" }],
        modelsStatus: "ready",
        promptDraft: "生成一张图片",
      },
    },
    refreshCanvasAfterAgentPatch() {
      refreshes.push("refresh");
    },
    api: {
      async createCanvasAgentConversation() {
        return { conversation: { id: "conversation-live" } };
      },
      async sendCanvasAgentMessage() {
        return { task: { id: "task-live", status: "queued" } };
      },
      async *streamCanvasAgentEvents() {
        yield { data: { id: "event-1", sequence: 1, eventType: "step.created", event: { stepId: "generation-step", toolId: "generation.create" } } };
        yield { data: { id: "event-2", sequence: 2, eventType: "task.waiting_external", event: { stepId: "generation-step", generationTaskId: "generation-1" } } };
        yield { data: { id: "event-3", sequence: 3, eventType: "generation.completed_wakeup", event: { generationTaskId: "generation-1", status: "succeeded" } } };
        yield { data: { id: "event-4", sequence: 4, eventType: "task.succeeded", event: {} } };
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    pollIntervalMs: 1,
  });

  await controller.handleAction({ dataset: { agentAction: "send" } });
  for (let index = 0; index < 20 && refreshes.length < 2; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }

  assert.equal(refreshes.length, 2);
  controller.dispose();
});

test("Canvas Agent retries the completion refresh until generated media reaches the canvas", async () => {
  let refreshCount = 0;
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-live",
      canvasDocument: {
        nodes: [{
          id: "agent-image",
          type: "ai-image",
          data: { status: "running", taskId: "generation-1" },
        }],
      },
      canvasAgent: {
        mode: "c",
        modelCode: "agent-text-1",
        models: [{ modelCode: "agent-text-1", modelLabel: "Agent Text 1" }],
        modelsStatus: "ready",
        promptDraft: "生成一张图片",
      },
    },
    refreshCanvasAfterAgentPatch() {
      refreshCount += 1;
      if (refreshCount < 3) return;
      workbench.ui.canvasDocument = {
        nodes: [{
          id: "agent-image",
          type: "ai-image",
          data: {
            status: "completed",
            taskId: "generation-1",
            storageObjectId: "storage-1",
            resultUrl: "/generated/tree.png",
          },
        }],
      };
    },
    api: {
      async createCanvasAgentConversation() {
        return { conversation: { id: "conversation-live" } };
      },
      async sendCanvasAgentMessage() {
        return { task: { id: "task-live", status: "queued" } };
      },
      async *streamCanvasAgentEvents() {
        yield { data: { id: "event-1", sequence: 1, eventType: "task.waiting_external", event: { stepId: "generation-step", generationTaskId: "generation-1" } } };
        yield { data: { id: "event-2", sequence: 2, eventType: "generation.completed_wakeup", event: { generationTaskId: "generation-1", status: "succeeded" } } };
        yield { data: { id: "event-3", sequence: 3, eventType: "task.succeeded", event: {} } };
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    pollIntervalMs: 1,
  });

  await controller.handleAction({ dataset: { agentAction: "send" } });
  for (let index = 0; index < 80 && !workbench.ui.canvasDocument.nodes[0].data.resultUrl; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.equal(refreshCount, 3);
  assert.equal(workbench.ui.canvasDocument.nodes[0].data.resultUrl, "/generated/tree.png");
  controller.dispose();
});

test("Canvas Agent restores message history and manages archived conversations", async () => {
  const calls = [];
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-1",
      canvasAgent: {
        conversationId: "conversation-1",
        conversations: [
          { id: "conversation-1", title: "当前会话", status: "active" },
          { id: "conversation-2", title: "历史会话", status: "archived" },
        ],
      },
    },
    api: {
      async listCanvasAgentMessages(canvasId, conversationId, input) {
        calls.push(["history", canvasId, conversationId, input]);
        return {
          messages: conversationId === "conversation-1"
            ? [
                { id: "message-1", sequence: 1, role: "user", content: { text: "分析构图" } },
                {
                  id: "message-2",
                  sequence: 2,
                  role: "assistant",
                  content: {
                    message: "构图分析完成",
                    citations: [{
                      id: "citation-1",
                      title: "构图参考",
                      sourceType: "web",
                      canonicalUrl: "https://docs.example.test/composition",
                      excerpt: "主体位于画面三分线交点。",
                    }],
                  },
                },
              ]
            : [{ id: "message-3", sequence: 1, role: "tool", content: { toolId: "canvas.read" } }],
        };
      },
      async updateCanvasAgentConversation(canvasId, input) {
        calls.push(["update", canvasId, input]);
        return { conversation: { id: input.conversationId, status: input.status } };
      },
      async deleteCanvasAgentConversation(canvasId, conversationId) {
        calls.push(["delete", canvasId, conversationId]);
        return { conversation: { id: conversationId } };
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    pollIntervalMs: 60_000,
  });

  await controller.loadMessages("conversation-1");
  assert.deepEqual(workbench.ui.canvasAgent.messages.map((message) => [message.role, message.text]), [
    ["user", "分析构图"],
    ["assistant", "构图分析完成"],
  ]);
  const historyHtml = renderCanvasAgentPanel(workbench.ui);
  assert.match(historyHtml, /<strong>Agent<\/strong><\/span>\s*<p>构图分析完成<\/p>/);
  assert.match(historyHtml, /href="https:\/\/docs\.example\.test\/composition"/);
  assert.match(historyHtml, /rel="noopener noreferrer"/);
  workbench.ui.canvasAgent.historyOpen = true;
  const historyListHtml = renderCanvasAgentPanel(workbench.ui);
  assert.match(historyListHtml, /data-agent-action="archive-conversation" data-conversation-id="conversation-1">归档/);
  assert.match(historyListHtml, /data-agent-action="restore-conversation" data-conversation-id="conversation-2">恢复/);
  await controller.handleAction({
    dataset: { agentAction: "restore-conversation", conversationId: "conversation-2" },
  });
  assert.deepEqual(calls.filter((call) => call[0] === "update").map((call) => call[2]), [
    { conversationId: "conversation-2", status: "active" },
  ]);
  workbench.ui.canvasAgent.historyOpen = false;

  await controller.handleAction({ dataset: { agentAction: "archive-conversation" } });
  assert.equal(workbench.ui.canvasAgent.conversations[0].status, "archived");
  workbench.ui.canvasAgent.historyOpen = true;
  assert.match(renderCanvasAgentPanel(workbench.ui), /data-agent-action="restore-conversation" data-conversation-id="conversation-1">恢复/);
  workbench.ui.canvasAgent.historyOpen = false;
  await controller.handleAction({ dataset: { agentAction: "restore-conversation" } });
  assert.equal(workbench.ui.canvasAgent.conversations[0].status, "active");

  controller.handleInput({ dataset: { agentField: "conversationId" }, value: "conversation-2" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(workbench.ui.canvasAgent.messages.map((message) => [message.role, message.text]), [
    ["tool", "canvas.read 已执行"],
  ]);
  await controller.handleAction({ dataset: { agentAction: "delete-conversation" } });
  assert.equal(workbench.ui.canvasAgent.conversationId, "conversation-1");
  assert.equal(workbench.ui.canvasAgent.conversations.length, 1);
  assert.deepEqual(calls.filter((call) => call[0] === "update").map((call) => call[2].status), ["active", "archived", "active"]);
  assert.ok(calls.some((call) => call[0] === "delete" && call[2] === "conversation-2"));
  controller.dispose();
});

test("Canvas Agent edits and persists the current conversation title", async () => {
  const calls = [];
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-title",
      canvasAgent: {
        conversationId: "conversation-title",
        conversations: [{ id: "conversation-title", title: "当前会话" }],
      },
    },
    api: {
      async updateCanvasAgentConversation(canvasId, input) {
        calls.push([canvasId, input]);
        return { conversation: { id: input.conversationId, title: input.title } };
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
  });

  const initialHtml = renderCanvasAgentPanel(workbench.ui);
  assert.match(initialHtml, /class="canvas-agent-panel[^"]*has-conversation"/);
  assert.match(initialHtml, /data-agent-conversation-title[^>]*>当前会话<\/strong>/);
  assert.doesNotMatch(initialHtml, /CANVAS AGENT|智能协作/);
  assert.match(initialHtml, /class="canvas-agent-model canvas-agent-model-top"/);
  assert.doesNotMatch(initialHtml, /data-agent-field="conversationId"|data-agent-action="toggle-pin-conversation"/);

  const titleTarget = { closest: (selector) => selector === "[data-agent-conversation-title]" ? {} : null };
  assert.equal(controller.handleDoubleClick(titleTarget), true);
  assert.equal(workbench.ui.canvasAgent.titleEditing, true);
  assert.match(renderCanvasAgentPanel(workbench.ui), /data-agent-field="conversationTitle"[^>]+maxlength="10"/);

  assert.equal(controller.handleInput({
    dataset: { agentField: "conversationTitle" },
    value: "超长会话名称一二三四五六七八九",
  }), true);
  assert.equal(workbench.ui.canvasAgent.titleDraft, "超长会话名称一二三四");
  assert.equal(controller.handleBlur({ dataset: { agentField: "conversationTitle" } }), true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls, [["canvas-title", {
    conversationId: "conversation-title",
    title: "超长会话名称一二三四",
  }]]);
  assert.equal(workbench.ui.canvasAgent.conversations[0].title, "超长会话名称一二三四");
  assert.equal(workbench.ui.canvasAgent.titleEditing, false);
  controller.dispose();
});

test("Canvas Agent history view shows only the list and deletes a selected row", async () => {
  const calls = [];
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-history",
      canvasAgent: {
        conversationId: "conversation-current",
        historyOpen: true,
        conversations: [
          { id: "conversation-current", title: "当前会话", status: "active" },
          { id: "conversation-old", title: "历史会话", status: "archived" },
        ],
        messages: [{ role: "assistant", text: "不应显示" }],
      },
    },
    api: {
      async deleteCanvasAgentConversation(canvasId, conversationId) {
        calls.push([canvasId, conversationId]);
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
  });

  const historyHtml = renderCanvasAgentPanel(workbench.ui);
  assert.match(historyHtml, /class="canvas-agent-panel[^"]*history-open[^"]*"/);
  assert.match(historyHtml, /class="canvas-agent-history"/);
  assert.match(historyHtml, /class="canvas-agent-history-delete danger"[^>]+data-conversation-id="conversation-old"[^>]*>.*<svg/);
  assert.doesNotMatch(historyHtml, /data-agent-field="conversationId"/);
  assert.doesNotMatch(historyHtml, /data-agent-field="promptDraft"/);
  assert.doesNotMatch(historyHtml, /不应显示/);

  await controller.handleAction({
    dataset: { agentAction: "delete-conversation", conversationId: "conversation-old" },
  });
  assert.deepEqual(calls, [["canvas-history", "conversation-old"]]);
  assert.equal(workbench.ui.canvasAgent.conversationId, "conversation-current");
  assert.deepEqual(workbench.ui.canvasAgent.conversations.map((item) => item.id), ["conversation-current"]);
  controller.dispose();
});

test("Canvas Agent renders safe clickable citations and structured tool activity", () => {
  const ui = {
    canvasAgent: {
      messages: [{
        role: "assistant",
        text: "已完成资料核对",
        citations: [],
      }],
      events: [
        { sequence: 1, eventType: "step.created", event: { toolId: "web_search", effect: "external_network", stepId: "step-1" } },
        { sequence: 2, eventType: "policy.decided", event: { toolId: "mcp.call", effect: "mcp", decision: "allow" } },
      ],
    },
  };
  const agent = ensureCanvasAgentState(ui);
  agent.messages = [{
    role: "assistant",
    text: "已完成资料核对",
    citations: [
      { id: "citation-1", title: "Provider 文档", canonicalUrl: "https://docs.example.test/guide", sourceType: "web", excerpt: "安全摘录" },
      { id: "citation-2", title: "禁止协议", canonicalUrl: "javascript:alert(1)", sourceType: "web" },
    ],
  }].map((message) => ({ ...message }));
  const html = renderCanvasAgentPanel(ui);
  assert.match(html, /data-event-kind="research"/);
  assert.match(html, /data-event-kind="mcp"/);
  assert.match(html, /联网研究/);
  assert.match(html, /工具 web_search/);
  assert.match(html, /决策 allow/);
  assert.doesNotMatch(html, /javascript:alert/);
});

test("Canvas Agent renders generation media and adds the stable result to the canvas", async () => {
  const message = normalizeAgentMessage({
    id: "message-media-1",
    role: "tool",
    content: { toolId: "media.generate", output: { generationTaskId: "task-media-1" } },
  });
  message.media = normalizeAgentMediaTask({
    taskId: "task-media-1",
    kind: "image",
    status: "completed",
    prompt: "雨夜街道",
    result: {
      imageUrl: "/api/storage/preview-1",
      storageObjectId: "storage-1",
      assetId: "asset-1",
      assetVersionId: "asset-version-1",
    },
  });
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-media",
      canvasDocument: { version: 1, canvasProjectId: "canvas-media", viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [] },
      canvasAgent: { messages: [message] },
    },
    updateCanvasDocument(document) {
      this.ui.canvasDocument = document;
    },
    async refreshCanvasSurface() {},
    api: {},
  };
  const initialHtml = renderCanvasAgentPanel(workbench.ui);
  assert.match(initialHtml, /<img src="\/api\/storage\/preview-1"/);
  assert.match(initialHtml, /data-agent-action="add-media-to-canvas"/);

  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench });
  await controller.handleAction({ dataset: { agentAction: "add-media-to-canvas", messageId: "message-media-1" } });
  const node = workbench.ui.canvasDocument.nodes[0];
  assert.equal(node.type, "source-image");
  assert.equal(node.data.storageObjectId, "storage-1");
  assert.equal(node.data.assetVersionId, "asset-version-1");
  assert.equal(node.data.generationTaskId, "task-media-1");
  assert.match(renderCanvasAgentPanel(workbench.ui), /data-agent-action="locate-agent-canvas-node"/);
  controller.dispose();
});

test("Canvas Agent locates a grouped media node at its absolute canvas center", async () => {
  const calls = [];
  const cell = {
    getSize() { return { width: 240, height: 160 }; },
  };
  const graph = {
    getCellById(nodeId) {
      calls.push(["get-cell", nodeId]);
      return cell;
    },
    select(selectedCell) {
      calls.push(["select", selectedCell]);
    },
    centerPoint(x, y) {
      calls.push(["center-point", x, y]);
    },
    centerCell(selectedCell) {
      calls.push(["center-cell", selectedCell]);
    },
  };
  const message = {
    id: "message-grouped-media",
    role: "tool",
    canvasNodeId: "node-grouped-media",
    media: { kind: "image", status: "completed", url: "/api/storage/grouped-media" },
  };
  const workbench = {
    canvasGraph: graph,
    ui: {
      canvasDocument: {
        nodes: [
          { id: "group-1", type: "group", position: { x: 1_200, y: 700 }, size: { width: 900, height: 600 } },
          { id: "node-grouped-media", type: "source-image", parentGroupId: "group-1", position: { x: 1_640, y: 920 }, size: { width: 240, height: 160 } },
        ],
      },
      canvasAgent: { messages: [message] },
    },
    onCanvasNodeSelected(nodeId) {
      calls.push(["selection-only", nodeId]);
    },
    async refreshCanvasSurface() {
      throw new Error("locating a node must not rerender the Agent panel");
    },
    api: {},
  };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench });

  await controller.handleAction({ dataset: { agentAction: "locate-agent-canvas-node", messageId: message.id } });

  assert.deepEqual(calls, [
    ["selection-only", "node-grouped-media"],
    ["get-cell", "node-grouped-media"],
    ["select", cell],
    ["center-point", 1_760, 1_000],
  ]);
  assert.equal(workbench.ui.selectedCanvasNodeId, "node-grouped-media");
  assert.equal(workbench.ui.canvasEditorOpen, true);
  controller.dispose();
});

test("Canvas Agent centers a located node using its rendered canvas bounds", async () => {
  const calls = [];
  const cell = { getSize() { return { width: 240, height: 160 }; } };
  let translation = { tx: 30, ty: 40 };
  const graph = {
    getCellById() { return cell; },
    select() {},
    translate(x, y) {
      if (arguments.length === 0) return translation;
      translation = { tx: x, ty: y };
      calls.push(["translate", x, y]);
    },
    centerPoint(x, y) {
      calls.push(["center-point", x, y]);
    },
  };
  const nodeElement = {
    getAttribute(name) { return name === "data-cell-id" ? "node-media" : null; },
    getBoundingClientRect() { return { left: 110, top: 90, right: 210, bottom: 190 }; },
  };
  const graphMount = {
    querySelectorAll() { return [nodeElement]; },
    getBoundingClientRect() { return { left: 10, top: 40, right: 1_010, bottom: 640 }; },
  };
  const surface = {
    querySelector(selector) {
      return selector === "[data-canvas-x6-mount]" ? graphMount : null;
    },
  };
  const message = {
    id: "message-media",
    role: "tool",
    canvasNodeId: "node-media",
    media: { kind: "image", status: "completed", url: "/api/storage/media" },
  };
  const workbench = {
    canvasGraph: graph,
    ui: {
      canvasDocument: {
        nodes: [{ id: "node-media", position: { x: 1_640, y: 920 }, size: { width: 240, height: 160 } }],
      },
      canvasAgent: { messages: [message] },
    },
    async refreshCanvasSurface() { throw new Error("locating a node must not rerender the Agent panel"); },
    api: {},
  };
  const controller = createCanvasAgentController({ surface, workbench });

  await controller.handleAction({ dataset: { agentAction: "locate-agent-canvas-node", messageId: message.id } });

  assert.deepEqual(calls, [["translate", 380, 240]]);
  controller.dispose();
});

test("Canvas Agent re-centers a located node after the graph viewport finishes resizing", async () => {
  const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
  const frames = [];
  globalThis.requestAnimationFrame = (callback) => {
    frames.push(callback);
    return frames.length;
  };
  try {
    let translation = { tx: 0, ty: 0 };
    let graphRect = { left: 0, top: 0, right: 400, bottom: 300 };
    let nodeRect = { left: 50, top: 50, right: 150, bottom: 150 };
    const graph = {
      getCellById() { return {}; },
      select() {},
      translate(x, y) {
        if (arguments.length === 0) return translation;
        const deltaX = x - translation.tx;
        const deltaY = y - translation.ty;
        translation = { tx: x, ty: y };
        nodeRect = {
          left: nodeRect.left + deltaX,
          top: nodeRect.top + deltaY,
          right: nodeRect.right + deltaX,
          bottom: nodeRect.bottom + deltaY,
        };
      },
    };
    const nodeElement = {
      getAttribute(name) { return name === "data-cell-id" ? "node-media" : null; },
      getBoundingClientRect() { return nodeRect; },
    };
    const graphMount = {
      querySelectorAll() { return [nodeElement]; },
      getBoundingClientRect() { return graphRect; },
    };
    const workbench = {
      canvasGraph: graph,
      ui: {
        canvasDocument: { nodes: [{ id: "node-media" }] },
        canvasAgent: { messages: [{ id: "message-media", canvasNodeId: "node-media" }] },
      },
      async refreshCanvasSurface() { throw new Error("locating a node must not rerender the Agent panel"); },
      api: {},
    };
    const controller = createCanvasAgentController({
      surface: { querySelector: () => graphMount },
      workbench,
    });

    await controller.handleAction({ dataset: { agentAction: "locate-agent-canvas-node", messageId: "message-media" } });
    graphRect = { left: 0, top: 0, right: 1_000, bottom: 600 };
    while (frames.length) frames.shift()();

    assert.deepEqual(translation, { tx: 400, ty: 200 });
    assert.equal((nodeRect.left + nodeRect.right) / 2, 500);
    assert.equal((nodeRect.top + nodeRect.bottom) / 2, 300);
    controller.dispose();
  } finally {
    globalThis.requestAnimationFrame = previousRequestAnimationFrame;
  }
});

test("Canvas Agent merges generation submission and completion into one media card", () => {
  const media = normalizeAgentMediaTask({
    taskId: "task-media-1",
    kind: "image",
    status: "completed",
    targetType: "canvas",
    targetId: "canvas-agent-image-step-1",
    result: { imageUrl: "/api/storage/preview-1" },
  });
  const messages = [
    normalizeAgentMessage({
      id: "message-submit",
      sequence: 6,
      role: "tool",
      content: { toolId: "generation.create", output: { generationTaskId: "task-media-1" } },
    }),
    normalizeAgentMessage({
      id: "message-complete",
      sequence: 7,
      role: "tool",
      content: { generationTaskId: "task-media-1", status: "succeeded" },
    }),
  ].map((message) => ({ ...message, media, canvasNodeId: media.canvasNodeId }));

  assert.equal(collapseAgentGenerationMessages(messages).length, 1);
  const html = renderCanvasAgentPanel({
    canvasDocument: { nodes: [{ id: "canvas-agent-image-step-1", data: { generationTaskId: "task-media-1" } }] },
    canvasAgent: { messages },
  });
  assert.equal((html.match(/class="canvas-agent-media"/g) ?? []).length, 1);
  assert.match(html, /generation\.create 已执行/);
  assert.match(html, /data-agent-action="locate-agent-canvas-node"/);
  assert.doesNotMatch(html, /data-agent-action="add-media-to-canvas"/);

  const missingNodeHtml = renderCanvasAgentPanel({
    canvasDocument: { nodes: [] },
    canvasAgent: { messages },
  });
  assert.match(missingNodeHtml, /data-agent-action="add-media-to-canvas"/);
  assert.doesNotMatch(missingNodeHtml, /data-agent-action="locate-agent-canvas-node"/);
});


test("Canvas Agent grants and revokes the selected persisted canvas file", async () => {
  const calls = [];
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-file",
      selectedCanvasNodeId: "node-file",
      canvasDocument: {
        nodes: [{ id: "node-file", type: "source-image", data: { title: "角色参考", storageObjectId: "storage-1" } }],
      },
      canvasAgent: { conversationId: "conversation-file", conversations: [{ id: "conversation-file", title: "文件会话" }] },
    },
    api: {
      async listCanvasAgentFileGrants(canvasId, conversationId) {
        calls.push(["list-grants", canvasId, conversationId]);
        return { grants: [{ id: "grant-1", storageObjectId: "storage-1", purpose: "角色参考", status: "active", expiresAt: "2099-01-01T00:00:00.000Z" }] };
      },
      async createCanvasAgentFileGrant(canvasId, conversationId, input) {
        calls.push(["create-grant", canvasId, conversationId, input]);
        return { grant: { id: "grant-2" } };
      },
      async revokeCanvasAgentFileGrant(canvasId, conversationId, grantId) {
        calls.push(["revoke-grant", canvasId, conversationId, grantId]);
        return { revokedGrantId: grantId };
      },
    },
  };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench });
  await controller.loadFileGrants();
  const html = renderCanvasAgentPanel(workbench.ui);
  assert.match(html, /data-agent-action="grant-selected-file"/);
  assert.match(html, /data-agent-action="revoke-file-grant" data-grant-id="grant-1"/);
  await controller.handleAction({ dataset: { agentAction: "grant-selected-file" } });
  assert.deepEqual(calls[1], ["create-grant", "canvas-file", "conversation-file", {
    storageObjectId: "storage-1",
    purpose: "Canvas Agent reference: 角色参考",
    expiresInSeconds: 3600,
  }]);
  await controller.handleAction({ dataset: { agentAction: "revoke-file-grant", grantId: "grant-1" } });
  assert.ok(calls.some((call) => call[0] === "revoke-grant" && call[3] === "grant-1"));
  controller.dispose();
});

test("Canvas Agent exposes task center, canvas memory, and estimated context usage", () => {
  const ui = {
    canvasAgent: {
      conversationId: "conversation-usage",
      modelCode: "agent-long-context",
      modelsStatus: "ready",
      models: [{
        modelCode: "agent-long-context",
        modelLabel: "Long Context",
        capabilities: { contextWindow: 16_000, maxOutputTokens: 2_000 },
      }],
      messages: [
        { role: "user", text: "分析当前画布人物关系" },
        { role: "assistant", text: "已整理人物关系。" },
      ],
      conversations: [{ id: "conversation-usage", title: "人物关系" }],
    },
  };
  const usage = resolveAgentContextUsage(ui.canvasAgent);
  assert.equal(usage.contextWindow, 16_000);
  assert.equal(usage.inputBudget, 14_000);
  assert.ok(usage.estimatedTokens > 1_200);

  const html = renderCanvasAgentPanel(ui);
  assert.doesNotMatch(html, /data-agent-action="open-task-center"/);
  assert.doesNotMatch(html, /data-agent-action="open-memory"/);
  assert.match(html, /class="canvas-agent-context-usage normal"/);
  assert.match(html, /aria-label="上下文占用约 \d+%"/);

  ui.canvasAgent.panelView = "memory";
  const memoryHtml = renderCanvasAgentPanel(ui);
  assert.doesNotMatch(memoryHtml, /aria-label="画布记忆"/);
  assert.doesNotMatch(memoryHtml, /data-agent-action="refresh-agent-memories"/);
  assert.match(memoryHtml, /data-agent-action="send"/);
});

test("Canvas Agent memory panel reads real records and supports filter, edit, toggle, and delete", async () => {
  const calls = [];
  const records = [
    {
      id: "memory-1",
      key: "preference.visual_style",
      value: { text: "水墨风格" },
      category: "preference",
      source: "agent_task",
      status: "active",
      sourceTaskId: "task-1",
      updatedAt: "2026-07-27T08:00:00.000Z",
    },
    {
      id: "memory-2",
      key: "fact.hero_name",
      value: { text: "林默" },
      category: "fact",
      source: "manual",
      status: "revoked",
      updatedAt: "2026-07-27T07:00:00.000Z",
    },
  ];
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-memory",
      canvasAgent: {
        conversationId: "conversation-memory",
        conversations: [{ id: "conversation-memory", title: "记忆会话" }],
        panelView: "memory",
      },
    },
    api: {
      async listCanvasAgentMemories(canvasId, conversationId, input) {
        calls.push(["list", canvasId, conversationId, input]);
        return { memories: records };
      },
      async updateCanvasAgentMemory(canvasId, conversationId, memoryId, input) {
        calls.push(["update", canvasId, conversationId, memoryId, input]);
        return { memory: { id: memoryId, ...input } };
      },
      async deleteCanvasAgentMemory(canvasId, conversationId, memoryId) {
        calls.push(["delete", canvasId, conversationId, memoryId]);
        return { deletedMemoryId: memoryId };
      },
    },
  };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench });
  await controller.loadMemories();
  assert.deepEqual(calls[0], ["list", "canvas-memory", "conversation-memory", { includeInactive: true }]);
  assert.equal(workbench.ui.canvasAgent.memoryRecords.length, 2);

  let html = renderCanvasAgentPanel(workbench.ui);
  assert.doesNotMatch(html, /preference\.visual_style/);
  assert.doesNotMatch(html, /Agent 任务/);
  assert.doesNotMatch(html, /data-agent-action="edit-agent-memory"/);
  assert.doesNotMatch(html, /data-agent-action="toggle-agent-memory"/);
  assert.match(html, /data-agent-action="send"/);

  controller.handleInput({ dataset: { agentField: "memoryCategoryFilter" }, value: "fact" });
  html = renderCanvasAgentPanel(workbench.ui);
  assert.doesNotMatch(html, /preference\.visual_style/);
  assert.doesNotMatch(html, /fact\.hero_name/);

  await controller.handleAction({ dataset: { agentAction: "edit-agent-memory", memoryId: "memory-1" } });
  controller.handleInput({ dataset: { agentField: "memoryDraftKey" }, value: "preference.art_style" });
  controller.handleInput({ dataset: { agentField: "memoryDraftCategory" }, value: "preference" });
  controller.handleInput({ dataset: { agentField: "memoryDraftValue" }, value: '{"text":"赛博水墨"}' });
  await controller.handleAction({ dataset: { agentAction: "save-agent-memory", memoryId: "memory-1" } });
  const editCall = calls.find((call) => call[0] === "update" && call[3] === "memory-1");
  assert.deepEqual(editCall[4], {
    key: "preference.art_style",
    value: { text: "赛博水墨" },
    category: "preference",
    status: "active",
  });
  assert.equal(Object.hasOwn(editCall[4], "source"), false);

  await controller.handleAction({ dataset: { agentAction: "toggle-agent-memory", memoryId: "memory-2" } });
  assert.ok(calls.some((call) => call[0] === "update" && call[3] === "memory-2" && call[4].status === "active"));
  await controller.handleAction({ dataset: { agentAction: "delete-agent-memory", memoryId: "memory-1" } });
  assert.ok(calls.some((call) => call[0] === "delete" && call[3] === "memory-1"));
  controller.dispose();
});

test("Canvas Agent memory normalization preserves provenance and derives legacy categories", () => {
  assert.deepEqual(normalizeAgentMemoryRecord({
    id: "memory-legacy",
    memoryKey: "decision.aspect_ratio",
    valueJson: { ratio: "16:9" },
    sourceStepId: "step-1",
    status: "disabled",
    updatedAt: "2026-07-27T00:00:00.000Z",
  }), {
    id: "memory-legacy",
    key: "decision.aspect_ratio",
    value: { ratio: "16:9" },
    category: "decision",
    source: "agent_task",
    status: "revoked",
    sourceTaskId: "",
    sourceStepId: "step-1",
    updatedAt: "2026-07-27T00:00:00.000Z",
  });
});

test("Canvas Agent task center aggregates existing conversation events and uses the durable skip control", async () => {
  const calls = [];
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-tasks",
      canvasAgent: {
        conversationId: "conversation-task",
        taskId: "task-active",
        status: "queued",
        conversations: [{
          id: "conversation-task",
          title: "镜头规划",
          taskId: "task-active",
          taskStatus: "queued",
          updatedAt: "2026-07-27T08:00:00.000Z",
        }],
      },
    },
    api: {
      async listCanvasAgentMessages(canvasId, conversationId, input) {
        calls.push(["messages", canvasId, conversationId, input]);
        return {
          messages: [{
            id: "message-task",
            taskId: "task-active",
            role: "user",
            content: { text: "规划三段镜头" },
            createdAt: "2026-07-27T08:00:00.000Z",
          }],
        };
      },
      async listCanvasAgentEvents(canvasId, taskId, input) {
        calls.push(["events", canvasId, taskId, input]);
        return {
          events: [
            { id: "event-created", taskId, sequence: 1, eventType: "task.resumed", event: {}, createdAt: "2026-07-27T08:00:01.000Z" },
            { id: "event-step", taskId, sequence: 2, eventType: "step.created", event: { stepId: "step-memory", toolId: "memory.write", effect: "memory_write" }, createdAt: "2026-07-27T08:00:02.000Z" },
          ],
        };
      },
      async controlCanvasAgentTask(canvasId, taskId, action, input) {
        calls.push(["control", canvasId, taskId, action, input]);
        return { result: { status: "queued" } };
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    pollIntervalMs: 60_000,
  });

  await controller.loadTaskCenter();
  const agent = workbench.ui.canvasAgent;
  assert.equal(agent.taskItems.length, 1);
  assert.equal(agent.taskItems[0].goal, "规划三段镜头");
  assert.equal(agent.memoryEvents.length, 1);
  agent.panelView = "tasks";
  const taskHtml = renderCanvasAgentPanel(workbench.ui);
  assert.doesNotMatch(taskHtml, /aria-label="Agent 任务中心"/);
  assert.doesNotMatch(taskHtml, /规划三段镜头/);
  assert.doesNotMatch(taskHtml, /data-agent-action="skip-step"[^>]+data-step-id="step-memory"/);

  await controller.handleAction({
    dataset: { agentAction: "skip-step", taskId: "task-active", stepId: "step-memory" },
  });
  const controls = calls.filter((call) => call[0] === "control");
  assert.deepEqual(controls.map((call) => call[3]), ["skip"]);
  assert.deepEqual(controls[0][4], { stepId: "step-memory", reason: "user_requested" });
  assert.equal(agent.taskItems[0].steps[0].status, "skipped");
  assert.doesNotMatch(renderCanvasAgentPanel(workbench.ui), /data-step-id="step-memory"[^>]*>跳过此步/);
  controller.dispose();
});

test("Canvas Agent resumes a waiting task after skipping and hides the stale approval", async () => {
  const calls = [];
  const events = [
    { id: "step", taskId: "task-waiting", sequence: 1, eventType: "step.created", event: { stepId: "step-waiting", toolId: "canvas.update", effect: "canvas_write" } },
    { id: "approval", taskId: "task-waiting", sequence: 2, eventType: "approval.requested", event: { approvalId: "approval-waiting", stepId: "step-waiting", effect: "canvas_write" } },
  ];
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-waiting",
      canvasAgent: {
        conversationId: "conversation-waiting",
        taskId: "task-waiting",
        status: "waiting_approval",
        events,
        taskItems: [{
          taskId: "task-waiting",
          conversationId: "conversation-waiting",
          status: "waiting_approval",
          events,
          steps: [{ stepId: "step-waiting", toolId: "canvas.update", status: "waiting_approval" }],
        }],
      },
    },
    api: {
      async controlCanvasAgentTask(canvasId, taskId, action, input) {
        calls.push([canvasId, taskId, action, input]);
        return { result: { status: action === "resume" ? "queued" : "waiting_approval" } };
      },
    },
  };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench, pollIntervalMs: 60_000 });
  assert.match(renderCanvasAgentPanel(workbench.ui), /data-approval-id="approval-waiting"/);
  await controller.handleAction({ dataset: { agentAction: "skip-step", taskId: "task-waiting", stepId: "step-waiting" } });
  assert.deepEqual(calls.map((call) => call[2]), ["skip"]);
  assert.equal(workbench.ui.canvasAgent.status, "queued");
  assert.doesNotMatch(renderCanvasAgentPanel(workbench.ui), /data-approval-id="approval-waiting"/);
  controller.dispose();
});
