import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  collapseAgentGenerationMessages,
  collapseAgentTimelineEvents,
  createCanvasAgentController,
  ensureCanvasAgentState,
  persistCanvasAgentUiState,
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
  assert.match(html, /灵曦AI/);
  assert.doesNotMatch(html, /canvas\.patch/);
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

test("free generation model answers show public names and expose switchable public choices", async () => {
  const workbench = {
    ui: {
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: {
        generationKind: "image",
        generationModelCodes: { image: "cumo-gpt-image-2-pro" },
        modelCode: "text-pro",
        models: [{
          modelCode: "text-pro",
          modelLabel: "文本创作 Pro",
        }, {
          modelCode: "text-fast",
          modelLabel: "文本创作 快速版",
        }],
        generationModels: [{
        modelCode: "cumo-gpt-image-2-pro",
        modelLabel: "Image-2（优惠）",
        mediaType: "image",
      }, {
        modelCode: "cumo-gpt-image-3-pro",
        modelLabel: "Image-3（高清）",
        mediaType: "image",
      }],
      messages: [{
        role: "assistant",
        text: "我是灵曦AI，当前会话使用的模型为文本创作 Pro。",
      }],
      },
    },
    api: {},
  };
  const html = renderCanvasAgentPanel(workbench.ui);

  assert.match(html, /我是灵曦AI，当前会话使用的模型为文本创作 Pro。/);
  assert.match(html, /可用模型/);
  assert.match(html, /文本创作 快速版/);
  assert.match(html, /data-agent-action="select-agent-text-model" data-model-index="0"/);
  assert.match(html, /data-agent-action="select-agent-text-model" data-model-index="1"/);
  assert.doesNotMatch(html, /Image-3（高清）/);
  assert.doesNotMatch(html, /cumo-gpt-image-2-pro/);

  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    capabilityProfile: "media_generation_only",
  });
  await controller.handleAction({ dataset: { agentAction: "select-agent-text-model", modelIndex: "1" } });
  assert.equal(workbench.ui.canvasAgent.modelCode, "text-fast");
  const historyHtml = renderCanvasAgentPanel(workbench.ui);
  assert.match(historyHtml, /我是灵曦AI，当前会话使用的模型为文本创作 Pro。/);
  assert.match(historyHtml, /data-model-index="0" aria-pressed="true"/);
  controller.dispose();
});

test("free generation sends text model switching requests to the current text model for analysis", async () => {
  let sentInput = null;
  const workbench = {
    ui: {
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: {
        promptDraft: "帮我将模型切换成 GPT",
        modelCode: "deepseek",
        generationModelsStatus: "ready",
        generationModels: [{ modelCode: "image-model", modelLabel: "Image", mediaType: "image" }],
      },
    },
    api: {
      async createFreeGenerationConversation() {
        return { conversation: { id: "free-text-model-guidance" } };
      },
      async sendFreeGenerationMessage(_conversationId, input) {
        sentInput = input;
        return { task: { id: "text-model-guidance-task", status: "queued" } };
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    capabilityProfile: "media_generation_only",
  });

  await controller.handleAction({ dataset: { agentAction: "send" } });

  assert.equal(sentInput.modelCode, "deepseek");
  assert.equal(sentInput.message.text, "帮我将模型切换成 GPT");
  assert.equal(workbench.ui.canvasAgent.taskId, "text-model-guidance-task");
  controller.dispose();
});

test("free generation sends media model switching requests to the current text model for analysis", async () => {
  let sentInput = null;
  const workbench = {
    ui: {
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: {
        promptDraft: "请切换视频模型",
        modelCode: "deepseek",
        generationKind: "video",
        generationModelsStatus: "ready",
        generationModels: [{ modelCode: "seedance", modelLabel: "Seedance", mediaType: "video" }],
      },
    },
    api: {
      async createFreeGenerationConversation() {
        return { conversation: { id: "free-media-model-analysis" } };
      },
      async sendFreeGenerationMessage(_conversationId, input) {
        sentInput = input;
        return { task: { id: "media-model-analysis-task", status: "queued" } };
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    capabilityProfile: "media_generation_only",
    pollIntervalMs: 60_000,
  });

  await controller.handleAction({ dataset: { agentAction: "send" } });

  assert.equal(sentInput.modelCode, "deepseek");
  assert.equal(sentInput.message.preferredGenerationKind, "video");
  assert.deepEqual(sentInput.message.preferredModels, { video: "seedance" });
  controller.dispose();
});

test("Canvas Agent timeline shows a step identifier only once", () => {
  const stepId = "step-unique";
  const html = renderCanvasAgentPanel({
    canvasAgent: {
      events: [{ id: "step-finished", sequence: 1, eventType: "step.succeeded", event: { stepId } }],
    },
  });

  assert.equal((html.match(new RegExp(stepId, "g")) ?? []).length, 1);
});

test("Canvas Agent condenses active task events into one thinking indicator", () => {
  const html = renderCanvasAgentPanel({
    canvasAgent: {
      taskId: "task-thinking",
      status: "running",
      events: [
        { id: "task-created", sequence: 1, eventType: "task.created", event: {} },
        { id: "task-started", sequence: 2, eventType: "task.started", event: {} },
        { id: "step-running", sequence: 3, eventType: "step.running", event: { stepId: "step-1", toolId: "canvas.patch" } },
      ],
    },
  });

  assert.match(html, /class="canvas-agent-thinking"/);
  assert.match(html, /正在执行 canvas\.patch/);
  assert.doesNotMatch(html, /data-event-status="task\.created"|data-event-status="task\.started"|data-event-status="step\.running"/);
});

test("Canvas Agent labels a running model step as thinking instead of tool execution", () => {
  const html = renderCanvasAgentPanel({
    canvasAgent: {
      taskId: "task-model-thinking",
      status: "running",
      events: [
        { id: "model-created", sequence: 1, eventType: "step.created", event: { stepId: "model-1", kind: "model" } },
        { id: "model-running", sequence: 2, eventType: "step.running", event: { stepId: "model-1" } },
      ],
    },
  });

  assert.match(html, /正在思考中/);
  assert.doesNotMatch(html, /正在执行工具/);
});

test("Canvas Agent stops the thinking state for completed task statuses", () => {
  const html = renderCanvasAgentPanel({
    canvasAgent: {
      taskId: "task-completed",
      status: "completed",
      events: [{ id: "task-completed", sequence: 1, eventType: "task.completed", event: {} }],
    },
  });

  assert.doesNotMatch(html, /class="canvas-agent-thinking"/);
  assert.match(html, /已完成/);
  assert.match(html, /aria-busy="false"/);
});

test("Canvas Agent keeps the external generation status after an interjection", () => {
  const agent = { status: "running", events: [] };
  reduceCanvasAgentEvents(agent, [
    { id: "generation-waiting", sequence: 1, eventType: "task.waiting_external", event: {} },
    { id: "interjected", sequence: 2, eventType: "task.interjected", event: {} },
  ]);
  assert.equal(agent.status, "waiting_external");
  const html = renderCanvasAgentPanel({
    canvasAgent: { taskId: "task-waiting", ...agent },
  });
  assert.match(html, /正在等待生成结果/);
  assert.doesNotMatch(html, /正在处理补充要求/);
});

test("free generation stops showing a waiting state as soon as every media task is terminal", () => {
  const html = renderCanvasAgentPanel({
    canvasAgentCapabilityProfile: "media_generation_only",
    canvasAgent: {
      taskId: "task-waiting",
      status: "waiting_external",
      events: [{ id: "generation-waiting", sequence: 1, eventType: "task.waiting_external", event: {} }],
      messages: [{
        id: "generation-message",
        taskId: "task-waiting",
        role: "tool",
        generationTaskId: "generation-1",
        media: { taskId: "generation-1", kind: "video", status: "succeeded", url: "/generated/clip.mp4" },
      }],
    },
  });

  assert.doesNotMatch(html, /正在等待生成结果/);
  assert.match(html, /generated\/clip\.mp4/);
});

test("free generation displays the text-model analysis message for a new task after an earlier media result", () => {
  const html = renderCanvasAgentPanel({
    canvasAgentCapabilityProfile: "media_generation_only",
    canvasAgent: {
      taskId: "new-task",
      status: "queued",
      messages: [
        {
          id: "previous-generation",
          taskId: "previous-task",
          role: "tool",
          generationTaskId: "generation-previous",
          media: { taskId: "generation-previous", kind: "video", status: "succeeded", url: "/generated/previous.mp4" },
        },
        { id: "new-request", taskId: "new-task", role: "user", text: "生成新的参考视频" },
      ],
    },
  });

  assert.match(html, /data-event-role="assistant"/);
  assert.match(html, /<strong>灵曦<\/strong>/);
  assert.match(html, /正在思考中/);
});

test("Canvas Agent shows only a failure state for a failed current task", () => {
  const html = renderCanvasAgentPanel({
    canvasAgent: {
      taskId: "task-failed",
      status: "failed",
      messages: [{ role: "tool", text: "canvas.read 已执行" }],
      events: [
        { id: "task-created", sequence: 1, eventType: "task.created", event: {} },
        { id: "task-started", sequence: 2, eventType: "task.started", event: {} },
        { id: "step-failed", sequence: 3, eventType: "step.failed", event: { stepId: "step-1", errorCode: "canvas_agent_model_response_invalid_json" } },
        { id: "task-failed", sequence: 4, eventType: "task.failed", event: { failureCode: "canvas_agent_model_response_invalid_json" } },
      ],
    },
  });

  assert.match(html, /class="canvas-agent-task-failed"[^>]*><i[^>]*><\/i><span><strong>失败<\/strong><small>任务执行失败（canvas_agent_model_response_invalid_json）<\/small><\/span>/);
  assert.doesNotMatch(html, /canvas\.read 已执行|data-event-status="task\.created"/);
});

test("Canvas Agent shows a readable reason when a generation task fails", () => {
  const html = renderCanvasAgentPanel({
    canvasAgent: {
      taskId: "task-provider-failed",
      status: "failed",
      events: [{
        id: "provider-failed",
        sequence: 1,
        eventType: "task.failed",
        event: { failureCode: "provider_failed" },
      }],
    },
  });
  assert.match(html, /图片模型服务暂时不可用（provider_failed）/);
});

test("Canvas Agent prefers the detailed failed step reason over a task-level provider error", () => {
  const html = renderCanvasAgentPanel({
    canvasAgent: {
      taskId: "task-insufficient-balance",
      status: "failed",
      events: [
        {
          id: "model-failed",
          sequence: 1,
          eventType: "step.failed",
          event: { errorCode: "402 Insufficient Balance" },
        },
        {
          id: "task-failed",
          sequence: 2,
          eventType: "task.failed",
          event: { failureCode: "provider_stream_error" },
        },
      ],
    },
  });
  assert.match(html, /模型服务余额不足（402 Insufficient Balance）/);
  assert.doesNotMatch(html, /模型服务响应中断（provider_stream_error）/);
});

test("Canvas Agent calls an interjection a user addition", () => {
  const html = renderCanvasAgentPanel({
    canvasAgent: {
      messages: [{ role: "user", interjection: true, text: "补充要求" }],
    },
  });
  assert.match(html, /<strong>用户追加<\/strong>/);
  assert.doesNotMatch(html, /用户插话/);
});

test("Canvas Agent empty timeline fills the space above the pinned composer", () => {
  const html = renderCanvasAgentPanel({ canvasAgent: { conversationId: "conversation-empty" } });
  assert.match(html, /class="canvas-agent-panel[^\"]*has-conversation[^\"]*timeline-empty"/);
  assert.match(html, /class="canvas-agent-timeline is-empty"/);
  assert.match(html, /canvas-agent-empty[\s\S]*?canvas-agent-composer/);
  assert.match(html, /你好！我是灵曦AI的媒体创作工作流 Agent，可以帮你生成剧本、图片、视频内容。/);
  assert.match(html, /有需求请告诉我哦~！我来帮你实现。/);
  assert.doesNotMatch(html, /等待指令/);
});

test("Canvas Agent keeps the timeline scrollable above the pinned composer", () => {
  const css = readFileSync(new URL("../src/features/new-canvas/new-canvas.css", import.meta.url), "utf8");
  assert.match(
    css,
    /\.canvas-agent-panel\.has-conversation\s*\{\s*grid-template-rows:\s*auto minmax\(0, 1fr\) auto auto auto;/,
  );
  assert.match(
    css,
    /\.canvas-agent-panel\.timeline-empty\.has-conversation\s*\{\s*grid-template-rows:\s*auto minmax\(0, 1fr\) auto auto auto;/,
  );
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
          creditUsage: { consumedCredits: 10, status: "consumed", scope: "task" },
        },
      }],
    },
  });

  assert.match(html, /实际 Token 1,545/);
  assert.match(html, /实际扣除 10 积分/);
  assert.doesNotMatch(html, /输入 1,200|输出 345/);
});

test("Canvas Agent panel exposes conversation modes and a running stop action", () => {
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
  assert.match(html, /class="canvas-agent-send-button is-running"/);
  assert.match(html, /data-agent-action="send"[^>]+aria-label="停止 Agent 任务"/);
  assert.doesNotMatch(html, /class="canvas-agent-task-controls"|class="canvas-agent-interject"/);
  assert.match(html, /<select[^>]+data-agent-field="modelCode"[^>]+disabled/);
  assert.match(html, /aria-label="文本模型"/);
  assert.match(html, /暂无可用文本模型/);
  assert.doesNotMatch(html, /<input[^>]+data-agent-field="modelCode"/);
});

test("Canvas Agent stops from the composer and sends Enter as an interjection while running", async () => {
  const calls = [];
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-running",
      canvasAgent: {
        conversationId: "conversation-running",
        taskId: "task-running",
        status: "running",
        modelCode: "agent-text-1",
        modelsStatus: "ready",
        models: [{ modelCode: "agent-text-1", modelLabel: "Agent" }],
        promptDraft: "请补充一个结尾",
      },
    },
    api: {
      async controlCanvasAgentTask(canvasId, taskId, action, input) {
        calls.push({ canvasId, taskId, action, input });
        return { result: { status: action === "stop" ? "cancel_requested" : "running" } };
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    pollIntervalMs: 60_000,
  });

  await controller.handleAction({ dataset: { agentAction: "send" } });
  assert.equal(calls[0].action, "stop");

  workbench.ui.canvasAgent.status = "running";
  workbench.ui.canvasAgent.promptDraft = "请补充一个结尾";
  await controller.handleKeydown(
    { key: "Enter", shiftKey: false, preventDefault() {} },
    { dataset: { agentField: "promptDraft" } },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls[1].action, "interject");
  assert.deepEqual(calls[1].input, { message: { text: "请补充一个结尾" } });
  assert.equal(workbench.ui.canvasAgent.promptDraft, "");
  controller.dispose();
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
  let sessionPersisted = false;
  const workbench = {
    ui: {
      canvasDocument: { viewport: { interactionMode: "hand" } },
      canvasAgent: { panelOpen: true },
    },
    api: {},
    persistCanvasSession() {
      sessionPersisted = true;
    },
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
  assert.equal(sessionPersisted, true);
  assert.equal(workbench.ui.canvasSessionUiState.canvasAgent.panelOpen, false);
  assert.match(reopenMarkup, /data-agent-action="open-agent-panel"/);
  assert.equal(renderLayoutCalls, 0);
  assert.equal(workbench.ui.canvasDocument.viewport.interactionMode, "hand");
  controller.dispose();
});

test("Canvas Agent timeline follows the latest task data through completion", () => {
  const previousDocument = globalThis.document;
  const runSync = ({ scrollTop, taskId = "", status = "idle" }) => {
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
      workbench: { ui: { canvasAgent: { taskId, status } }, api: {} },
    });
    controller.syncPanel();
    controller.dispose();
    assert.equal(nextPanel, renderedPanel);
    return nextTimeline.scrollTop;
  };

  try {
    assert.equal(runSync({ scrollTop: 160, taskId: "task-running", status: "running" }), 600);
    assert.equal(runSync({ scrollTop: 160, taskId: "task-completed", status: "succeeded" }), 600);
    assert.equal(runSync({ scrollTop: 160 }), 160);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("Canvas Agent keeps the latest task event visible across an external canvas rerender", () => {
  let timeline = { scrollTop: 160, scrollHeight: 500, clientHeight: 100 };
  const controller = createCanvasAgentController({
    surface: {
      querySelector(selector) {
        return selector === ".canvas-agent-timeline" ? timeline : null;
      },
    },
    workbench: { ui: { canvasAgent: { taskId: "task-running", status: "running" } }, api: {} },
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

test("Canvas Agent restores and persists the session panel state", () => {
  const ui = { canvasSessionUiState: { canvasAgent: { panelOpen: false, panelWidth: 420 } } };
  const agent = ensureCanvasAgentState(ui);
  assert.equal(agent.panelOpen, false);
  assert.equal(agent.panelWidth, 420);

  agent.panelOpen = true;
  agent.panelWidth = 520;
  persistCanvasAgentUiState(ui, agent);
  assert.deepEqual(ui.canvasSessionUiState.canvasAgent, { panelOpen: true, panelWidth: 520 });
});

test("media-only Agent renders a standalone conversation workspace with history and prior media", () => {
  const css = readFileSync(new URL("../src/features/new-canvas/new-canvas.css", import.meta.url), "utf8");
  const ui = { canvasAgentCapabilityProfile: "media_generation_only" };
  persistCanvasAgentUiState(ui, { mediaComposerHeight: 396 });
  assert.deepEqual(ui.canvasSessionUiState, { canvasAgent: { mediaComposerHeight: 396 } });

  const html = renderCanvasAgentPanel({
    canvasAgentCapabilityProfile: "media_generation_only",
    canvasAgent: {
      conversationId: "free-conversation",
      conversations: [
        { id: "free-conversation", title: "电影海报创作" },
        { id: "free-conversation-2", title: "山谷追逐镜头" },
      ],
      messages: [
        { role: "user", text: "生成电影海报", createdAt: "2026-08-14T09:05:00.000Z" },
        { role: "tool", generationTaskId: "task-poster", media: {
          taskId: "task-poster",
          kind: "image",
          status: "completed",
          url: "https://example.test/poster.png",
          title: "海报",
        } },
      ],
    },
  });

  assert.match(html, /生成电影海报/);
  assert.match(html, /class="canvas-agent-message-time" datetime="2026-08-14T09:05:00.000Z"/);
  assert.match(html, /生成电影海报[\s\S]*class="canvas-agent-message-time"/);
  assert.match(html, /poster\.png/);
  assert.match(html, /class="canvas-agent-media-sidebar"/);
  assert.match(html, /aria-label="创作会话"/);
  assert.match(html, /开启创作/);
  assert.match(html, /新对话/);
  assert.match(html, /电影海报创作/);
  assert.match(html, /山谷追逐镜头/);
  assert.match(html, /class="canvas-agent-media-workspace"/);
  assert.match(html, /canvas-agent-media-conversation-row active[\s\S]*?data-conversation-id="free-conversation"[^>]*aria-current="page"/);
  assert.doesNotMatch(html, /data-conversation-id="free-conversation"[^>]*disabled/);
  assert.match(html, /aria-label="生成记录"/);
  assert.match(html, /class="home-agent-composer canvas-agent-media-composer"/);
  assert.match(html, /--canvas-agent-media-composer-height: 272px/);
  assert.match(html, /data-agent-media-composer-resize[^>]*aria-label="拖动调整输入框高度"/);
  assert.match(html, /class="home-agent-composer-content canvas-agent-media-composer-content"/);
  assert.match(html, /class="home-agent-composer-footer canvas-agent-generation-config"/);
  assert.match(html, /canvas-agent-generation-config[\s\S]*?home-agent-submit-group canvas-agent-media-submit-group[\s\S]*?<button class="canvas-agent-send-button"[^>]*data-agent-action="send"[^>]*>\s*<svg[\s\S]*?<path d="M12 20V4"/);
  assert.doesNotMatch(html, /episode-replica-generate-label/);
  assert.doesNotMatch(html, /canvas-agent-generation-config[\s\S]*?<span>\d+<\/span>/);
  assert.match(html, /data-agent-action="toggle-free-generation-menu"/);
  assert.match(html, /class="canvas-agent-media-model-float"/);
  assert.match(html, /class="canvas-agent-current-model"/);
  assert.match(html, /当前 · 暂无文本模型/);
  assert.match(html, /图片 · 未配置/);
  assert.match(html, /视频 · 未配置/);
  assert.match(html, /音频 · 未配置/);
  assert.match(html, /data-field="model:image"/);
  assert.match(html, /data-field="model:video"/);
  assert.match(html, /data-field="model:audio"/);
  assert.match(css, /\.canvas-agent-media-model-float \.home-agent-model-trigger\s*\{[\s\S]*?opacity:\s*\.5;/);
  assert.match(css, /\.canvas-agent-media-model-float \.home-agent-model-picker:hover \.home-agent-model-trigger,[\s\S]*?opacity:\s*1;/);
  assert.match(css, /\.canvas-agent-media-model-float \.home-agent-model-picker:has\(\.home-agent-model-menu\)\s*\{[\s\S]*?z-index:\s*31;/);
  assert.match(css, /\.canvas-agent-panel\.is-media-only \.canvas-agent-media-model-float\s*\{[\s\S]*?right:\s*28px;/);
  assert.match(css, /\.canvas-agent-media-model-float \.home-agent-model-menu\s*\{[\s\S]*?left:\s*auto;[\s\S]*?right:\s*calc\(100% \+ 8px\);/);
  assert.match(css, /@media \(max-width:\s*760px\)\s*\{[\s\S]*?\.canvas-agent-panel\.is-media-only \.canvas-agent-media-model-float\s*\{[\s\S]*?right:\s*22px;/);
  assert.match(css, /\.canvas-agent-panel\.is-media-only \.canvas-agent-media-composer\s*\{[\s\S]*?height:\s*var\(--canvas-agent-media-composer-height, clamp\(13rem, 24dvh, 17rem\)\);[\s\S]*?min-height:\s*11rem;[\s\S]*?overflow:\s*hidden;/);
  assert.match(css, /\.canvas-agent-media-composer-resize\s*\{[\s\S]*?cursor:\s*ns-resize;[\s\S]*?touch-action:\s*none;/);
  assert.match(css, /\.canvas-agent-media-composer \.episode-replica-textarea\.has-inline-attachments,[\s\S]*?background:\s*var\(--new-canvas-field\) !important;/);
  assert.match(css, /\.canvas-agent-media-composer \.episode-replica-textarea\.has-inline-attachments\s*\{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/);
  assert.match(css, /@media \(min-width: 761px\) \{[\s\S]*?\.canvas-agent-panel\.is-media-only\s*\{[\s\S]*?width:\s*min\(1568px, calc\(100% - 48px\)\);/);
  assert.doesNotMatch(html, /data-field="generationKind"/);
  assert.doesNotMatch(html, /class="home-agent-composer-footer canvas-agent-generation-config"[\s\S]*home-agent-model-picker/);
  assert.doesNotMatch(html, /canvas-agent-generation-model"[^>]*>\s*<select|canvas-agent-generation-parameters/);
  assert.doesNotMatch(html, /episode-replica-video-settings-trigger/);
  assert.doesNotMatch(html, /class="canvas-agent-generation-kinds"|class="canvas-agent-mode-picker"|审核批准/);
  assert.doesNotMatch(html, /添加到画布|定位节点/);
  assert.doesNotMatch(html, /data-canvas-agent-resize|关闭 Agent 面板/);
  assert.match(css, /\.canvas-agent-panel\.is-media-only \.canvas-agent-generation-config\s*\{[\s\S]*?justify-content:\s*flex-end;/);
  assert.match(css, /\.canvas-agent-panel\.is-media-only \.canvas-agent-media-submit-group\s*\{[\s\S]*?margin-left:\s*auto;/);
  assert.match(css, /\.canvas-agent-composer button\.canvas-agent-send-button,[\s\S]*?\.canvas-agent-media-composer button\.canvas-agent-send-button\s*\{[\s\S]*?width:\s*46px;[\s\S]*?border-radius:\s*50%;/);
});

test("media-only Agent restores the resized composer height", () => {
  const ui = {
    canvasAgentCapabilityProfile: "media_generation_only",
    canvasSessionUiState: { canvasAgent: { mediaComposerHeight: 428 } },
  };
  const agent = ensureCanvasAgentState(ui);

  assert.equal(agent.mediaComposerHeight, 428);
  assert.match(renderCanvasAgentPanel(ui), /--canvas-agent-media-composer-height: 428px/);
});

test("media-only Agent reuses the canvas arrow and stop button states", () => {
  const idleHtml = renderCanvasAgentPanel({
    canvasAgentCapabilityProfile: "media_generation_only",
    canvasAgent: {},
  });
  const runningHtml = renderCanvasAgentPanel({
    canvasAgentCapabilityProfile: "media_generation_only",
    canvasAgent: { taskId: "generation-running", status: "running" },
  });

  assert.match(idleHtml, /<button class="canvas-agent-send-button"[^>]*data-agent-action="send"[^>]*><svg[\s\S]*?<path d="M12 20V4"/);
  assert.match(runningHtml, /<button class="canvas-agent-send-button is-running"[^>]*data-agent-action="stop"[^>]*><svg[\s\S]*?<rect x="6" y="6" width="12" height="12"/);
  assert.doesNotMatch(runningHtml, /episode-replica-generate-label/);
});

test("media-only Agent keeps generation model pickers enabled while a conversation is busy or archived", () => {
  const html = renderCanvasAgentPanel({
    canvasAgentCapabilityProfile: "media_generation_only",
    canvasAgent: {
      conversationId: "free-conversation",
      conversations: [{ id: "free-conversation", title: "已归档会话", status: "archived" }],
      taskId: "generation-task",
      status: "running",
      busyAction: "send",
      generationModelsStatus: "ready",
      generationModels: [
        { modelCode: "image-pro", modelLabel: "Image Pro", mediaType: "image", enabled: true },
        { modelCode: "video-pro", modelLabel: "Video Pro", mediaType: "video", enabled: true },
        { modelCode: "audio-pro", modelLabel: "Audio Pro", mediaType: "audio", enabled: true },
      ],
    },
  });

  assert.doesNotMatch(html, /data-field="model:image"[^>]*disabled/);
  assert.doesNotMatch(html, /data-field="model:video"[^>]*disabled/);
  assert.doesNotMatch(html, /data-field="model:audio"[^>]*disabled/);
  assert.doesNotMatch(html, /data-field="text-model"[^>]*disabled/);
});

test("media-only Agent hides a generic failure message superseded by a successful generation", () => {
  const html = renderCanvasAgentPanel({
    canvasAgentCapabilityProfile: "media_generation_only",
    canvasAgent: {
      taskId: "agent-task-1",
      status: "succeeded",
      messages: [
        {
          id: "tool-success", taskId: "agent-task-1", role: "tool", generationTaskId: "generation-1",
          media: { taskId: "generation-1", kind: "image", status: "succeeded", url: "/generated.png" },
        },
        {
          id: "obsolete-failure", taskId: "agent-task-1", role: "assistant",
          text: "Canvas service returned an internal message.",
        },
      ],
    },
  });

  assert.doesNotMatch(html, /生成任务执行失败，请检查模型配置或参考素材后重试。/);
  assert.match(html, /generated\.png/);
});

test("media-only Agent keeps a generation model menu open for option selection", async () => {
  const workbench = {
    ui: {
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: {
        generationMenuOpen: "free-generation:model:image",
        generationModelsStatus: "ready",
        generationModels: [
          { modelCode: "image-standard", modelLabel: "Image Standard", mediaType: "image", enabled: true },
          { modelCode: "image-pro", modelLabel: "Image Pro", mediaType: "image", enabled: true },
        ],
      },
    },
    api: {},
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    capabilityProfile: "media_generation_only",
  });
  const menuOptionTarget = {
    closest(selector) {
      return selector.includes(".home-agent-model-picker") ? {} : null;
    },
  };

  assert.equal(controller.handleClick(menuOptionTarget), false);
  assert.equal(workbench.ui.canvasAgent.generationMenuOpen, "free-generation:model:image");
  await controller.handleAction({
    dataset: { agentAction: "select-free-generation-model", modelKind: "image", modelId: "image-pro" },
  });
  assert.equal(workbench.ui.canvasAgent.generationModelCodes.image, "image-pro");
  assert.equal(workbench.ui.canvasAgent.generationMenuOpen, "");
  controller.dispose();
});

test("media-only Agent keeps readable theme surfaces over the home background", () => {
  const css = readFileSync(new URL("../src/features/new-canvas/new-canvas.css", import.meta.url), "utf8");
  const standaloneOverrides = css.slice(css.lastIndexOf("/* Let the configured home background"));

  assert.match(standaloneOverrides, /canvas-agent-media-workspace\s*\{\s*background: var\(--new-canvas-background\) !important;/);
  assert.match(standaloneOverrides, /canvas-agent-media-sidebar,[\s\S]*?background: var\(--new-canvas-panel\) !important;/);
  assert.match(standaloneOverrides, /canvas-agent-timeline\s*\{\s*background: var\(--new-canvas-background\) !important;/);
  assert.match(standaloneOverrides, /canvas-agent-event p,[\s\S]*?color: var\(--new-canvas-foreground\) !important;/);
  assert.doesNotMatch(standaloneOverrides, /canvas-agent-timeline\s*\{\s*background: transparent !important;/);
  assert.match(css, /:host-context\(\[data-workbench-theme="daylight"\]\)[\s\S]*?textarea\.home-agent-rich-editor\s*\{\s*color: #1b2730 !important;[\s\S]*?caret-color: #1b2730;/);
  assert.match(css, /textarea\.home-agent-rich-editor::placeholder\s*\{\s*color: #6c7e89 !important;\s*opacity: 1;/);
  assert.match(css, /canvas-agent-media-prompt-editor \.episode-prompt-editor-content\s*\{\s*color: #1b2730 !important;\s*caret-color: #1b2730;/);
  assert.match(css, /canvas-agent-media-prompt-editor \.episode-prompt-editor-content p\.is-editor-empty:first-child::before\s*\{\s*color: #6c7e89 !important;\s*opacity: 1;/);
});

test("media-only Agent reuses enabled generation models, remarks, parameters, and selected billing input", async () => {
  let sentInput = null;
  const workbench = {
    ui: {
      selectedCanvasProjectId: "93000000-0000-4000-8000-000000000099",
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: {},
    },
    api: {
      async listFreeGenerationModels() {
        return { models: [
          { modelCode: "agent-text", modelLabel: "Agent text" },
          { modelCode: "agent-text-fast", modelLabel: "Agent text Fast" },
        ] };
      },
      async listGlobalGenerationConfig({ mediaType }) {
        const models = {
          image: [{ modelCode: "image-pro", modelLabel: "Image Pro", mediaType: "image", enabled: true, remark: "适合角色与场景", apiKeyName: "我的图片密钥" }],
          video: [
            { modelCode: "video-disabled", modelLabel: "Disabled Video", mediaType: "video", enabled: false, remark: "不应显示" },
            { modelCode: "video-inactive", modelLabel: "Inactive Video", mediaType: "video", status: "inactive", description: "也不应显示" },
            { modelCode: "video-pro", modelLabel: "Video Pro", mediaType: "video", status: "active", remark: "适合动态镜头" },
            { modelCode: "video-fast", modelLabel: "Video Fast", mediaType: "video", status: "active" },
          ],
          audio: [{
            modelCode: "audio-pro",
            modelLabel: "Audio Pro",
            mediaType: "audio",
            enabled: true,
            summary: "旁白与配音",
            apiKeyName: "我的音频密钥",
            displayBaseCost: 12,
            parameterSchema: {
              voice: { type: "string", label: "音色", enum: ["narrator", "warm"] },
              speed: { type: "number", label: "语速", enum: [1, 1.2] },
            },
            defaultParams: { voice: "narrator", speed: 1 },
          }],
        };
        return {
          models: models[mediaType] ?? [],
          [`default${mediaType[0].toUpperCase()}${mediaType.slice(1)}ModelCode`]: `${mediaType}-pro`,
        };
      },
      async listFreeGenerationConversations() {
        return { conversations: [] };
      },
      async listFreeGenerationMessages() {
        return { messages: [] };
      },
      async createFreeGenerationConversation() {
        return { conversation: { id: "free-media-conversation" } };
      },
      async sendFreeGenerationMessage(_conversationId, input) {
        sentInput = input;
        return { task: { id: "free-media-task", status: "queued" } };
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    capabilityProfile: "media_generation_only",
    pollIntervalMs: 60_000,
  });

  await controller.resume();
  let html = renderCanvasAgentPanel(workbench.ui);
  assert.match(html, /当前 · Agent text/);
  assert.match(html, /图片 · Image Pro/);
  assert.match(html, /视频 · Video Pro/);
  assert.match(html, /音频 · Audio Pro/);
  await controller.handleAction({ dataset: { agentAction: "select-free-generation-model", modelKind: "video", modelId: "video-fast" } });
  assert.equal(workbench.ui.canvasAgent.generationModelCodes.video, "video-fast");
  html = renderCanvasAgentPanel(workbench.ui);
  assert.match(html, /当前 · Agent text/);
  assert.match(html, /描述想生成的视频/);
  await controller.handleAction({ dataset: { agentAction: "select-free-generation-model", modelKind: "audio", modelId: "audio-pro" } });
  assert.equal(workbench.ui.canvasAgent.mode, "c");
  html = renderCanvasAgentPanel(workbench.ui);
  assert.match(html, /Audio Pro/);
  assert.doesNotMatch(html, /NARRATOR|打开音频参数面板|audio-settings-panel/);
  assert.match(html, /<span>12<\/span>/);
  assert.doesNotMatch(html, /Disabled Video|Inactive Video|我的图片密钥|我的音频密钥/);

  assert.match(html, /当前 · Agent text/);
  await controller.handleAction({ dataset: { agentAction: "toggle-free-generation-menu", field: "text-model" } });
  html = renderCanvasAgentPanel(workbench.ui);
  assert.match(html, /Agent text Fast/);
  assert.match(html, /home-agent-model-menu/);
  assert.match(html, /home-agent-model-option-icon/);
  assert.match(html, /data-agent-action="select-agent-text-model"[^>]*data-model-index="1"/);
  assert.doesNotMatch(html, /Disabled Video|Inactive Video|我的图片密钥|我的音频密钥/);
  await controller.handleAction({ dataset: { agentAction: "select-agent-text-model", modelIndex: "1" } });
  assert.equal(workbench.ui.canvasAgent.modelCode, "agent-text-fast");
  assert.match(renderCanvasAgentPanel(workbench.ui), /当前 · Agent text Fast/);

  workbench.ui.canvasAgent.promptDraft = "生成温暖的开场旁白";
  await controller.handleAction({ dataset: { agentAction: "send" } });

  assert.equal(sentInput.modelCode, "agent-text-fast");
  assert.equal(sentInput.message.preferredGenerationKind, "audio");
  assert.equal(sentInput.mode, "c");
  assert.deepEqual(sentInput.message.preferredModels, { audio: "audio-pro" });
  assert.deepEqual(sentInput.message.preferredGenerationParameters, {
    audio: { voice: "narrator", speed: 1 },
  });
  controller.dispose();
});

test("media-only Agent ignores staged approval modes while regular Canvas Agent keeps its mode picker", async () => {
  const mediaWorkbench = {
    ui: { canvasAgentCapabilityProfile: "media_generation_only", canvasAgent: {} },
    api: {},
  };
  const mediaController = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench: mediaWorkbench,
    capabilityProfile: "media_generation_only",
  });
  await mediaController.stagePrompt({ text: "生成图片", mode: "b" });
  assert.equal(mediaWorkbench.ui.canvasAgent.mode, "c");
  assert.doesNotMatch(renderCanvasAgentPanel(mediaWorkbench.ui), /canvas-agent-mode-picker|审核批准/);
  mediaController.dispose();

  const canvasHtml = renderCanvasAgentPanel({ canvasAgent: {} });
  assert.match(canvasHtml, /class="canvas-agent-mode-picker"/);
  assert.match(canvasHtml, /审核批准/);
});

test("media-only Agent sends the selected generation permission mode", async () => {
  let sentInput = null;
  const workbench = {
    ui: {
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: {
        generationKind: "image",
        generationModelsStatus: "ready",
        generationModels: [{ modelCode: "image-model", modelLabel: "Image", mediaType: "image" }],
        generationModelCodes: { image: "image-model" },
      },
    },
    api: {
      async createFreeGenerationConversation() {
        return { conversation: { id: "free-permission-conversation" } };
      },
      async sendFreeGenerationMessage(_conversationId, input) {
        sentInput = input;
        return { task: { id: "free-permission-task", status: "queued" } };
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    capabilityProfile: "media_generation_only",
    pollIntervalMs: 60_000,
  });

  await controller.handleAction({ dataset: { agentAction: "set-free-generation-permission", permissionMode: "approval_required" } });
  assert.match(renderCanvasAgentPanel(workbench.ui), /canvas-agent-permission-trigger[^>]*>[\s\S]*?审批确认/);
  await controller.submitPrompt({ text: "生成一张海报" });

  assert.deepEqual(sentInput.budget, { generationPermissionMode: "approval_required" });
  controller.dispose();
});

test("media-only Agent permission picker opens upward with detailed explanations", async () => {
  const workbench = {
    ui: {
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: { generationPermissionMode: "full_access" },
    },
    api: {},
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    capabilityProfile: "media_generation_only",
  });

  await controller.handleAction({ dataset: { agentAction: "toggle-free-generation-permission-menu" } });

  let html = renderCanvasAgentPanel(workbench.ui);
  assert.equal(workbench.ui.canvasAgent.generationPermissionMenuOpen, true);
  assert.match(html, /canvas-agent-permission-menu/);
  assert.match(html, /role="listbox" aria-label="选择生成权限"/);
  assert.match(html, /直接提交图片、视频或音频生成任务/);
  assert.match(html, /确认后才会扣除积分并开始生成/);
  assert.match(html, /data-agent-action="set-free-generation-permission" data-permission-mode="approval_required"/);

  await controller.handleAction({ dataset: { agentAction: "set-free-generation-permission", permissionMode: "approval_required" } });

  html = renderCanvasAgentPanel(workbench.ui);
  assert.equal(workbench.ui.canvasAgent.generationPermissionMode, "approval_required");
  assert.equal(workbench.ui.canvasAgent.generationPermissionMenuOpen, false);
  assert.match(html, /canvas-agent-permission-trigger[^>]*>[\s\S]*?审批确认/);
  controller.dispose();
});

test("media-only Agent retains generation approval for user confirmation", async () => {
  const approvalCalls = [];
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-free-generation-approval",
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: {},
    },
    api: {
      async listFreeGenerationModels() {
        return { models: [] };
      },
      async listGlobalGenerationConfig({ mediaType }) {
        return mediaType === "image"
          ? { models: [{ modelCode: "image-model", modelLabel: "Image", mediaType: "image", enabled: true }] }
          : { models: [] };
      },
      async listFreeGenerationConversations() {
        return { conversations: [] };
      },
      async listFreeGenerationMessages() {
        return { messages: [] };
      },
      async createFreeGenerationConversation() {
        return { conversation: { id: "free-approval-conversation" } };
      },
      async sendFreeGenerationMessage() {
        return { task: { id: "free-approval-task", status: "queued" } };
      },
      async listFreeGenerationEvents() {
        return {
          events: [{
            sequence: 1,
            eventType: "approval.requested",
            event: { approvalId: "free-approval", stepId: "free-generation-step", effect: "media_generation" },
          }],
        };
      },
      async controlFreeGenerationTask(taskId, action, input) {
        approvalCalls.push({ taskId, action, input });
        return { result: { status: "queued" } };
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    capabilityProfile: "media_generation_only",
    pollIntervalMs: 0,
  });

  await controller.resume();
  await controller.submitPrompt({ text: "生成海报" });
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.deepEqual(approvalCalls, []);
  assert.match(renderCanvasAgentPanel(workbench.ui), /data-approval-id="free-approval"/);
  assert.match(renderCanvasAgentPanel(workbench.ui), /该操作需积分扣费，请问是否继续？/);
  assert.doesNotMatch(renderCanvasAgentPanel(workbench.ui), /会提交生成任务并按现有计费规则结算。/);
  assert.match(renderCanvasAgentPanel(workbench.ui), /确认执行/);
  controller.dispose();
});

test("media-only Agent inserts a pending approval card during a live timeline refresh", () => {
  const previousDocument = globalThis.document;
  const currentTimeline = {
    scrollTop: 0,
    scrollHeight: 300,
    clientHeight: 120,
    querySelectorAll: () => [],
    replaceWith() {},
  };
  const nextTimeline = {
    scrollTop: 0,
    scrollHeight: 300,
    clientHeight: 120,
    querySelectorAll: () => [],
  };
  const approval = { outerHTML: '<section class="canvas-agent-approval"></section>' };
  let inserted = null;
  const form = {
    insertAdjacentElement(position, element) {
      inserted = { position, element };
    },
  };
  const currentPanel = {
    querySelector(selector) {
      if (selector === ".canvas-agent-timeline") return currentTimeline;
      if (selector === "[data-free-generation-form]") return form;
      return null;
    },
  };
  const nextPanel = {
    querySelector(selector) {
      if (selector === ".canvas-agent-timeline") return nextTimeline;
      if (selector === ".canvas-agent-approval") return approval;
      return null;
    },
  };
  globalThis.document = {
    createElement() {
      return {
        content: { firstElementChild: nextPanel },
        set innerHTML(_markup) {},
      };
    },
  };
  const workbench = {
    ui: {
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: {
        taskId: "free-approval-task",
        status: "waiting_approval",
        events: [{
          sequence: 1,
          eventType: "approval.requested",
          event: { approvalId: "free-approval", effect: "media_generation" },
        }],
      },
    },
    api: {},
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => currentPanel },
    workbench,
    capabilityProfile: "media_generation_only",
  });

  try {
    assert.equal(controller.syncPanel({ liveOnly: true }), true);
    assert.deepEqual(inserted, { position: "beforebegin", element: approval });
  } finally {
    controller.dispose();
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("media-only Agent removes Canvas wording from visible failures without changing Canvas Agent errors", () => {
  const failedAgent = {
    taskId: "failed-task",
    status: "failed",
    events: [{
      sequence: 1,
      eventType: "step.failed",
      event: { stepId: "failed-step", errorCode: "canvas_agent_generation_model_required", message: "请在 Canvas 中配置图片模型" },
    }],
  };
  const mediaHtml = renderCanvasAgentPanel({
    canvasAgentCapabilityProfile: "media_generation_only",
    canvasAgent: failedAgent,
  });
  assert.match(mediaHtml, /当前生成类型没有可用模型/);
  assert.doesNotMatch(mediaHtml, /请在 Canvas|画布节点/iu);

  const canvasHtml = renderCanvasAgentPanel({ canvasAgent: failedAgent });
  assert.match(canvasHtml, /Canvas 中配置图片模型/);
});

test("media-only Agent presents legacy assistant branding as 灵曦AI", () => {
  const html = renderCanvasAgentPanel({
    canvasAgentCapabilityProfile: "media_generation_only",
    canvasAgent: { messages: [{ role: "assistant", text: "你好！我是 Canvas Agent。有什么可以帮你的吗？" }] },
  });

  assert.match(html, /你好！我是灵曦AI。有什么可以帮你的吗？/);
  assert.doesNotMatch(html, /Canvas Agent/);
});

test("media-only Agent preserves model guidance and replaces backend details", () => {
  const html = renderCanvasAgentPanel({
    canvasAgentCapabilityProfile: "media_generation_only",
    canvasAgent: {
      messages: [
        { role: "assistant", text: "当前是文本模型和媒体模型的集合，请在右上角切换文本模型。" },
        { role: "assistant", text: "当前模型代码为 cumo-gpt-image-2-pro。" },
      ],
    },
  });

  assert.match(html, /当前是文本模型和媒体模型的集合，请在右上角切换文本模型。/);
  assert.match(html, /当前会话使用的模型可在右上角查看和切换。/);
  assert.doesNotMatch(html, /cumo-gpt-image-2-pro/);
});

test("Agent chat hides internal, cross-user, and pricing disclosures", () => {
  for (const message of [
    "后台数据库中存有其他用户的资料。",
    "当前套餐价格为 99 元，账户余额为 20 积分。",
    "系统提示和 API key 可以直接提供。",
  ]) {
    const html = renderCanvasAgentPanel({
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: { messages: [{ role: "assistant", text: message }] },
    });
    assert.match(html, /请描述你的创作需求，我会继续协助。/);
    assert.doesNotMatch(html, /数据库|其他用户|价格|积分|系统提示|API key/iu);
  }
});

test("Agent chat introduces 灵曦 as the product brand instead of treating it as unknown", () => {
  const html = renderCanvasAgentPanel({
    canvasAgentCapabilityProfile: "media_generation_only",
    canvasAgent: {
      messages: [{
        role: "assistant",
        text: "我目前无法确认灵曦AI具体指哪家公司，公开资料和当前上下文中都没有足够信息。",
      }],
    },
  });

  assert.match(html, /灵曦AI是 AI 创作平台/);
  assert.doesNotMatch(html, /无法确认|没有足够信息/);
});

test("Canvas Agent stages a homepage prompt visibly even when the panel was closed", async () => {
  const ui = {
    canvasSessionUiState: { canvasAgent: { panelOpen: false, panelWidth: 420 } },
  };
  const layout = {
    classList: {
      toggle(name, enabled) {
        assert.equal(name, "is-agent-collapsed");
        assert.equal(enabled, false);
      },
    },
  };
  const workspace = {
    insertAdjacentHTML(position, markup) {
      assert.equal(position, "afterend");
      assert.match(markup, /首页传入的创作指令/);
    },
  };
  const surface = {
    querySelector(selector) {
      if (selector === ".new-canvas-layout") return layout;
      if (selector === "[data-new-canvas-workspace]") return workspace;
      return null;
    },
  };
  const controller = createCanvasAgentController({ surface, workbench: { ui, api: {} } });

  await controller.stagePrompt({ text: "首页传入的创作指令", mode: "c" });

  assert.equal(ui.canvasAgent.panelOpen, true);
  assert.equal(ui.canvasAgent.promptDraft, "首页传入的创作指令");
  assert.equal(ui.canvasAgent.mode, "c");
  assert.equal(ui.canvasSessionUiState.canvasAgent.panelOpen, true);
  assert.match(renderCanvasAgentPanel(ui), /首页传入的创作指令/);
  controller.dispose();
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
  assert.match(html, /data-agent-tool-id="provider\.config\.apply"/);
  assert.match(html, /provider\.config\.apply/);
  assert.doesNotMatch(html, /<code>provider\.config\.apply<\/code>/);
  assert.match(html, /确认执行/);
});

test("Canvas Agent approval hides internal policy codes from the visible summary", () => {
  const events = [{
    sequence: 1,
    eventType: "approval.requested",
    event: { approvalId: "approval-internal", effect: "media_generation", reason: "b_mode_effect" },
  }];
  const html = renderCanvasAgentPanel({ canvasAgent: { events, status: "waiting_approval" } });
  assert.doesNotMatch(html, />b_mode_effect</);
  assert.match(html, /该操作需要你的确认后才能继续。/);
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

test("Canvas Agent loads models without waiting for conversation history", async () => {
  const calls = [];
  let releaseConversations;
  const conversationsPending = new Promise((resolve) => { releaseConversations = resolve; });
  const workbench = {
    ui: { selectedCanvasProjectId: "canvas-fast-resume", canvasAgent: {} },
    api: {
      async listCanvasAgentConversations() {
        calls.push("conversations");
        await conversationsPending;
        return { conversations: [{ id: "conversation-fast-resume" }] };
      },
      async listCanvasAgentMessages() {
        calls.push("messages");
        return { messages: [] };
      },
      async listCanvasAgentModels() {
        calls.push("models");
        return { models: [{ modelCode: "agent-text-fast", modelLabel: "Agent Text Fast" }] };
      },
      async listCanvasAgentFileGrants() {
        return { grants: [] };
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    pollIntervalMs: 60_000,
  });

  const resumePending = controller.resume();
  await Promise.resolve();
  assert.deepEqual(calls, ["models", "conversations"]);
  releaseConversations();
  await resumePending;
  assert.deepEqual(calls, ["models", "conversations", "messages"]);
  controller.dispose();
});

test("Canvas Agent resumes an active task from the live stream without loading JSON events first", async () => {
  const calls = [];
  const workbench = {
    ui: { selectedCanvasProjectId: "canvas-active-resume", canvasAgent: {} },
    api: {
      async listCanvasAgentConversations() {
        calls.push("conversations");
        return {
          conversations: [{
            id: "conversation-active-resume",
            taskId: "task-active-resume",
            taskStatus: "running",
          }],
        };
      },
      async listCanvasAgentMessages() {
        calls.push("messages");
        return { messages: [] };
      },
      async listCanvasAgentModels() {
        calls.push("models");
        return { models: [{ modelCode: "agent-text-active", modelLabel: "Agent Text Active" }] };
      },
      async listCanvasAgentEvents() {
        calls.push("events");
        return { events: [] };
      },
      async *streamCanvasAgentEvents(canvasId, taskId, input) {
        calls.push(["live", canvasId, taskId, input.after]);
        yield {
          data: {
            id: "task-active-finished",
            sequence: 1,
            eventType: "task.succeeded",
            event: {},
          },
        };
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    pollIntervalMs: 60_000,
  });

  await controller.resume();
  for (let index = 0; index < 20 && !calls.some((call) => Array.isArray(call) && call[0] === "live"); index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }

  assert.equal(calls.includes("events"), false);
  assert.deepEqual(calls.find((call) => Array.isArray(call) && call[0] === "live"), [
    "live",
    "canvas-active-resume",
    "task-active-resume",
    0,
  ]);
  controller.dispose();
});

test("Canvas Agent returns from terminal resume while event history backfills without live polling", async () => {
  let releaseEvents;
  let streamCalls = 0;
  const eventsPending = new Promise((resolve) => { releaseEvents = resolve; });
  const workbench = {
    ui: { selectedCanvasProjectId: "canvas-terminal-resume", canvasAgent: {} },
    api: {
      async listCanvasAgentConversations() {
        return {
          conversations: [{
            id: "conversation-terminal-resume",
            taskId: "task-terminal-resume",
            taskStatus: "succeeded",
          }],
        };
      },
      async listCanvasAgentMessages() {
        return { messages: [] };
      },
      async listCanvasAgentModels() {
        return { models: [{ modelCode: "agent-text-terminal", modelLabel: "Agent Text Terminal" }] };
      },
      async listCanvasAgentEvents() {
        return eventsPending;
      },
      async *streamCanvasAgentEvents() {
        streamCalls += 1;
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    pollIntervalMs: 1,
  });

  let resumeFinished = false;
  const resumePending = controller.resume().then(() => { resumeFinished = true; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(resumeFinished, true);
  assert.equal(streamCalls, 0);
  assert.equal(workbench.ui.canvasAgent.polling, false);

  releaseEvents({
    events: [{ id: "terminal-event", sequence: 1, eventType: "task.succeeded", event: {} }],
  });
  await resumePending;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(workbench.ui.canvasAgent.sequence, 1);
  assert.equal(streamCalls, 0);
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
          { id: "conversation-1", title: "当前会话", status: "active", taskId: "task-completed", taskStatus: "succeeded" },
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
      async listCanvasAgentEvents(canvasId, taskId, input) {
        calls.push(["events", canvasId, taskId, input]);
        return {
          events: [{
            id: "task-completed-event",
            sequence: 9,
            eventType: "task.succeeded",
            event: {
              tokenUsage: { promptTokens: 58_258, completionTokens: 1_987, totalTokens: 60_245 },
              creditUsage: { consumedCredits: 362, status: "consumed", scope: "task" },
            },
          }],
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
  assert.match(historyHtml, /<strong>灵曦<\/strong><\/span>\s*<p>构图分析完成<\/p>/);
  assert.doesNotMatch(historyHtml, /实际 Token 60,245|实际扣除 362 积分/);
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
  assert.match(initialHtml, /\bhas-conversation\b/);
  assert.match(initialHtml, /data-agent-conversation-title[^>]*>当前会话<\/strong>/);
  assert.doesNotMatch(initialHtml, /CANVAS AGENT|智能协作/);
  assert.match(initialHtml, /class="canvas-agent-model-picker"[\s\S]*?data-agent-field="modelCode"[\s\S]*?canvas-agent-context-usage[\s\S]*?data-agent-action="send"/);
  assert.doesNotMatch(initialHtml, /canvas-agent-model-top|>模型<\/span>/);
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

test("free generation keeps media compact and opens an enlarged preview", async () => {
  const media = normalizeAgentMediaTask({
    taskId: "task-media-preview",
    kind: "video",
    status: "completed",
    result: { videoUrl: "https://example.com/preview.mp4", title: "森林镜头" },
  });
  const messages = [normalizeAgentMessage({
    id: "message-media-preview",
    role: "tool",
    content: { generationTaskId: "task-media-preview" },
  })].map((message) => ({ ...message, media }));
  const workbench = {
    ui: {
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: { messages },
    },
    api: {},
  };
  const html = renderCanvasAgentPanel(workbench.ui);
  const css = readFileSync(
    new URL("../src/features/new-canvas/new-canvas.css", import.meta.url),
    "utf8",
  );

  assert.match(html, /class="canvas-agent-media-preview"[^>]*data-agent-action="open-agent-media-preview"/);
  assert.match(html, /<video[^>]*muted playsinline[^>]*preload="metadata"><\/video>/);
  assert.match(css, /\.canvas-agent-panel\.is-media-only \.canvas-agent-media-preview\s*\{[\s\S]*?max-width:\s*min\(100%, 300px\)/);
  assert.match(css, /\.canvas-agent-panel\.is-media-only \.canvas-agent-media-preview img,[\s\S]*?max-height:\s*280px/);

  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    capabilityProfile: "media_generation_only",
  });
  await controller.handleAction({ dataset: { agentAction: "open-agent-media-preview", messageId: "message-media-preview" } });

  assert.deepEqual(workbench.ui.canvasAgent.mediaPreview, {
    kind: "video",
    title: "森林镜头",
    url: "https://example.com/preview.mp4",
  });
  assert.match(renderCanvasAgentPanel(workbench.ui), /canvas-agent-media-lightbox[\s\S]*?<video[^>]*controls autoplay playsinline/);

  let escapePrevented = false;
  assert.equal(controller.handleKeydown({ key: "Escape", preventDefault() { escapePrevented = true; } }, {}), true);
  assert.equal(escapePrevented, true);
  assert.equal(workbench.ui.canvasAgent.mediaPreview, null);
  controller.dispose();
});

test("free generation closes an enlarged preview without replacing the conversation panel", async () => {
  let removed = 0;
  let replaced = 0;
  const lightbox = { remove() { removed += 1; } };
  const workspace = { insertAdjacentHTML() {} };
  const panel = {
    querySelector(selector) {
      if (selector === ".canvas-agent-media-workspace") return workspace;
      if (selector === ".canvas-agent-media-lightbox") return lightbox;
      return null;
    },
    replaceWith() { replaced += 1; },
  };
  const workbench = {
    ui: {
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: { mediaPreview: { kind: "image", title: "海报", url: "https://example.com/poster.png" } },
    },
    api: {},
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: (selector) => selector === "[data-canvas-agent-panel]" ? panel : null },
    workbench,
    capabilityProfile: "media_generation_only",
  });

  await controller.handleAction({ dataset: { agentAction: "close-agent-media-preview" } });

  assert.equal(removed, 1);
  assert.equal(replaced, 0);
  assert.equal(workbench.ui.canvasAgent.mediaPreview, null);
  controller.dispose();
});


test("Canvas Agent grants and revokes the selected persisted canvas file", async () => {
  const calls = [];
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-file",
      selectedCanvasNodeId: "node-file",
      canvasDocument: {
        nodes: [{ id: "node-file", type: "source-image", data: { title: "角色参考", asset: { latestVersion: { storageObjectId: "storage-1" } } } }],
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
  assert.doesNotMatch(html, /class="canvas-agent-file-grants"/);
  assert.doesNotMatch(html, /data-agent-action="grant-selected-file"/);
  assert.doesNotMatch(html, /data-agent-action="revoke-file-grant"/);
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

test("Canvas Agent reuses the video-node prompt editor for inline @ canvas and uploaded references", async () => {
  const mounted = [];
  const promptInput = {
    addEventListener() {},
    setAttribute() {},
  };
  const editorHost = {
    dataset: {},
    isConnected: true,
    ownerDocument: { querySelector: () => null },
    querySelector(selector) {
      return selector === "[data-tiptap-prompt-editor]" ? promptInput : null;
    },
  };
  const surface = {
    querySelector(selector) {
      return selector === "[data-agent-prompt-editor]" ? editorHost : null;
    },
  };
  const workbench = {
    ui: {
      canvasDocument: {
        nodes: [
          { id: "node-text", type: "ai-text", data: { title: "故事梗概" } },
          { id: "node-image", type: "ai-image", data: { title: "角色图", storageObjectId: "storage-image" } },
          { id: "node-video", type: "ai-video", data: { title: "动作视频", storageObjectId: "storage-video", thumbnailUrl: "https://media.example.test/poster.jpg" } },
        ],
      },
      canvasAgent: {
        promptDraft: "继续生成",
        promptNodeReferences: [{ nodeId: "node-image", title: "角色图", storageObjectId: "storage-image", mediaKind: "image" }],
        promptAttachments: [{
          id: "storage-uploaded-image",
          storageObjectId: "storage-uploaded-image",
          fileGrantId: "grant-uploaded-image",
          name: "上传角色.png",
          contentType: "image/png",
          sizeBytes: 128,
          kind: "image",
          previewUrl: "/api/storage/objects/storage-uploaded-image/content?proxy=1",
        }],
      },
    },
  };
  const controller = createCanvasAgentController({
    surface,
    workbench,
    loadPromptEditorModule: async () => ({
      mountPromptEditor(_element, options) {
        mounted.push(options);
        return { captureState: () => null, destroy() {} };
      },
    }),
  });
  assert.match(renderCanvasAgentPanel(workbench.ui), /class="canvas-agent-prompt-editor-host episode-prompt-editor-host" data-agent-prompt-editor/);
  await controller.syncPromptEditor();
  assert.equal(mounted.length, 1);
  assert.equal(mounted[0].prompt, "【@角色图】 继续生成");
  assert.equal(mounted[0].mentionReferences.length, 2);
  const suggestions = await mounted[0].getSuggestions();
  assert.equal(suggestions.length, 3);
  assert.equal(suggestions[0].assetKind, "text");
  assert.equal(suggestions[0].label, "故事梗概");
  assert.equal(suggestions[2].assetKind, "video");
  assert.equal(suggestions[2].preview, "https://media.example.test/poster.jpg");
  assert.match(suggestions[2].source, /\/api\/storage\/objects\/storage-video\/content\?proxy=1/);
  mounted[0].onMentionSelect(suggestions[2]);
  mounted[0].onMentionsChange([suggestions[1], suggestions[2], mounted[0].mentionReferences[1]]);
  mounted[0].onChange({ prompt: "【@角色图】 【@动作视频】 【@上传角色.png】 继续生成" });
  assert.deepEqual(workbench.ui.canvasAgent.promptNodeReferences.map((item) => item.nodeId), ["node-image", "node-video"]);
  assert.equal(workbench.ui.canvasAgent.promptAttachments[0].fileGrantId, "grant-uploaded-image");
  assert.equal(workbench.ui.canvasAgent.promptDraft, "【@角色图】 【@动作视频】 【@上传角色.png】 继续生成");
  mounted[0].onMentionsChange([suggestions[1], suggestions[2]]);
  assert.equal(workbench.ui.canvasAgent.promptAttachments.length, 0);
  controller.dispose();
});

test("Canvas Agent turns @ node references into conversation file grants on send", async () => {
  const calls = [];
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-send-mention",
      canvasDocument: { nodes: [{ id: "node-reference", data: { title: "角色参考", storageObjectId: "storage-reference" } }] },
      canvasAgent: {
        conversationId: "conversation-send-mention",
        promptDraft: "使用引入节点生成视频",
        promptNodeReferences: [{ nodeId: "node-reference", title: "角色参考", storageObjectId: "storage-reference" }],
        modelCode: "agent-model",
        modelsStatus: "ready",
        models: [{ modelCode: "agent-model", modelLabel: "Agent" }],
      },
    },
    api: {
      async listCanvasAgentFileGrants() { return { grants: [] }; },
      async createCanvasAgentFileGrant(canvasId, conversationId, input) {
        calls.push(["grant", canvasId, conversationId, input]);
        return { grant: { id: "grant-reference" } };
      },
      async sendCanvasAgentMessage(canvasId, conversationId, input) {
        calls.push(["message", canvasId, conversationId, input]);
        return { task: { id: "task-reference", status: "queued" } };
      },
    },
  };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench });
  await controller.handleAction({ dataset: { agentAction: "send" } });
  assert.deepEqual(calls[0], ["grant", "canvas-send-mention", "conversation-send-mention", {
    storageObjectId: "storage-reference",
    purpose: "Canvas Agent reference: 角色参考",
    expiresInSeconds: 3600,
  }]);
  assert.deepEqual(calls[1][3].message.fileGrantIds, ["grant-reference"]);
  assert.deepEqual(calls[1][3].message.nodeReferences, [{
    nodeId: "node-reference",
    title: "角色参考",
    mediaKind: "image",
    fileGrantId: "grant-reference",
  }]);
  controller.dispose();
});

test("Canvas Agent defers file grant loading until a storage object reference is sent", async () => {
  const calls = [];
  const workbench = {
    ui: { selectedCanvasProjectId: "canvas-lazy-grants", canvasAgent: {} },
    api: {
      async listCanvasAgentConversations() {
        calls.push("conversations");
        return { conversations: [{ id: "conversation-lazy-grants" }] };
      },
      async listCanvasAgentMessages() {
        calls.push("messages");
        return { messages: [] };
      },
      async listCanvasAgentModels() {
        calls.push("models");
        return { models: [{ modelCode: "agent-lazy-grants", modelLabel: "Agent", capabilities: { vision: true } }] };
      },
      async listCanvasAgentFileGrants() {
        calls.push("list-grants");
        return { grants: [] };
      },
      async createCanvasAgentFileGrant() {
        calls.push("create-grant");
        return { grant: { id: "grant-lazy" } };
      },
      async sendCanvasAgentMessage(_canvasId, _conversationId, input) {
        calls.push(["message", input]);
        return { task: { id: "task-lazy-grants", status: "queued" } };
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    pollIntervalMs: 60_000,
  });

  await controller.resume();
  assert.equal(calls.includes("list-grants"), false);

  Object.assign(workbench.ui.canvasAgent, {
    promptDraft: "参考图片生成视频",
    promptNodeReferences: [{
      nodeId: "node-lazy-reference",
      title: "角色参考",
      storageObjectId: "storage-lazy-reference",
      mediaKind: "image",
    }],
  });
  await controller.handleAction({ dataset: { agentAction: "send" } });

  const grantListIndex = calls.indexOf("list-grants");
  const messageIndex = calls.findIndex((call) => Array.isArray(call) && call[0] === "message");
  assert.ok(grantListIndex >= 0);
  assert.ok(grantListIndex < messageIndex);
  assert.equal(calls.includes("create-grant"), true);
  controller.dispose();
});

test("Canvas Agent sends video node references with their media kind and grant mapping", async () => {
  const calls = [];
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-video-reference",
      canvasAgent: {
        conversationId: "conversation-video-reference",
        promptDraft: "参考这个视频生成新视频",
        promptNodeReferences: [{
          nodeId: "node-video",
          title: "动作参考",
          storageObjectId: "storage-video",
          mediaKind: "video",
        }],
        modelCode: "agent-model",
        modelsStatus: "ready",
        models: [{ modelCode: "agent-model", modelLabel: "Agent", capabilities: { videoInput: true } }],
      },
    },
    api: {
      async listCanvasAgentFileGrants() { return { grants: [] }; },
      async createCanvasAgentFileGrant() { return { grant: { id: "grant-video" } }; },
      async sendCanvasAgentMessage(_canvasId, _conversationId, input) {
        calls.push(input);
        return { task: { id: "task-video-reference", status: "queued" } };
      },
    },
  };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench });
  await controller.handleAction({ dataset: { agentAction: "send" } });
  assert.deepEqual(calls[0].message.nodeReferences, [{
    nodeId: "node-video",
    title: "动作参考",
    mediaKind: "video",
    fileGrantId: "grant-video",
  }]);
  controller.dispose();
});

test("Canvas Agent sends non-file node references without creating file grants", async () => {
  const calls = [];
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-text-reference",
      canvasAgent: {
        conversationId: "conversation-text-reference",
        promptDraft: "【@故事梗概】 根据这个节点继续",
        promptNodeReferences: [{ nodeId: "node-text", title: "故事梗概", mediaKind: "text" }],
        modelCode: "agent-model",
        modelsStatus: "ready",
        models: [{ modelCode: "agent-model", modelLabel: "Agent" }],
      },
    },
    api: {
      async listCanvasAgentFileGrants() { return { grants: [] }; },
      async createCanvasAgentFileGrant() { calls.push("unexpected-grant"); },
      async sendCanvasAgentMessage(_canvasId, _conversationId, input) {
        calls.push(input);
        return { task: { id: "task-text-reference", status: "queued" } };
      },
    },
  };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench });
  await controller.handleAction({ dataset: { agentAction: "send" } });
  assert.equal(calls.includes("unexpected-grant"), false);
  assert.deepEqual(calls[0].message.nodeReferences, [{
    nodeId: "node-text",
    title: "故事梗概",
    mediaKind: "text",
  }]);
  assert.deepEqual(calls[0].message.fileGrantIds, []);
  controller.dispose();
});

test("Canvas Agent keeps @ node references when the user interjects from the prompt", async () => {
  const calls = [];
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-interject-reference",
      canvasDocument: {
        nodes: [{
          id: "node-image",
          type: "ai-image",
          data: { title: "蓝色森林", storageObjectId: "storage-image" },
        }],
      },
      canvasAgent: {
        conversationId: "conversation-interject-reference",
        taskId: "task-interject-reference",
        status: "running",
        promptDraft: "【@蓝色森林】 再将这个节点删除",
        promptNodeReferences: [{
          nodeId: "node-image",
          title: "蓝色森林",
          mediaKind: "image",
          storageObjectId: "storage-image",
        }],
        fileGrants: [{ id: "grant-image", storageObjectId: "storage-image", status: "active" }],
        modelCode: "agent-model",
        modelsStatus: "ready",
        models: [{ modelCode: "agent-model", modelLabel: "Agent", capabilities: { input: ["image_url"] } }],
      },
    },
    api: {
      async controlCanvasAgentTask(canvasId, taskId, action, input) {
        calls.push({ canvasId, taskId, action, input });
        return { result: { status: "running" } };
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    pollIntervalMs: 60_000,
  });
  await controller.handleAction({ dataset: { agentAction: "interject-prompt" } });
  assert.deepEqual(calls, [{
    canvasId: "canvas-interject-reference",
    taskId: "task-interject-reference",
    action: "interject",
    input: {
      message: {
        text: "【@蓝色森林】 再将这个节点删除",
        fileGrantIds: ["grant-image"],
        nodeReferences: [{
          nodeId: "node-image",
          title: "蓝色森林",
          mediaKind: "image",
          fileGrantId: "grant-image",
        }],
      },
    },
  }]);
  assert.deepEqual(workbench.ui.canvasAgent.messages[0].nodeReferences, [{
    nodeId: "node-image",
    title: "蓝色森林",
    mediaKind: "image",
    fileGrantId: "grant-image",
  }]);
  assert.equal(workbench.ui.canvasAgent.promptDraft, "");
  assert.deepEqual(workbench.ui.canvasAgent.promptNodeReferences, []);
  controller.dispose();
});

test("Canvas Agent renders sent @ references as node placeholders in user messages", () => {
  const html = renderCanvasAgentPanel({
    canvasDocument: {
      nodes: [{
        id: "node-image",
        type: "ai-image",
        data: { title: "森林参考", storageObjectId: "storage-image" },
      }],
    },
    canvasAgent: {
      messages: [{
        id: "message-reference",
        role: "user",
        text: "使用【@森林参考】生成图片",
        nodeReferences: [{ nodeId: "node-image", title: "森林参考", mediaKind: "image" }],
      }],
    },
  });
  assert.match(html, /class="episode-prompt-editor-mention canvas-agent-message-node-reference"/);
  assert.match(html, /data-node-id="node-image"/);
  assert.match(html, /episode-prompt-editor-mention-label">森林参考/);
  assert.doesNotMatch(html, /使用【@森林参考】生成图片/);
});

test("Canvas Agent preserves node references when normalizing message history", () => {
  const message = normalizeAgentMessage({
    id: "history-reference",
    role: "user",
    content: {
      text: "查看【@故事梗概】",
      nodeReferences: [{ nodeId: "node-text", title: "故事梗概", mediaKind: "text" }],
    },
  });
  assert.deepEqual(message.nodeReferences, [{
    nodeId: "node-text",
    title: "故事梗概",
    mediaKind: "text",
    fileGrantId: "",
  }]);
});

test("Canvas Agent sent media attachments expose hover preview data", () => {
  const html = renderCanvasAgentPanel({
    canvasAgent: {
      messages: [normalizeAgentMessage({
        id: "message-media-attachment",
        role: "user",
        content: {
          text: "以此为参考",
          attachments: [{
            storageObjectId: "image-object-1",
            fileGrantId: "grant-image-1",
            name: "角色参考.png",
            kind: "image",
          }, {
            storageObjectId: "video-object-1",
            fileGrantId: "grant-video-1",
            name: "动作参考.mp4",
            kind: "video",
          }],
        },
      })],
    },
  });

  assert.match(html, /data-agent-message-attachment-preview/);
  assert.match(html, /data-preview-kind="image"/);
  assert.match(html, /data-preview-kind="video"/);
  assert.match(html, /image-object-1\/content\?proxy=1/);
  assert.match(html, /video-object-1\/content\?proxy=1/);
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

test("Canvas Agent renders uploaded references only inside the rich editor", () => {
  const html = renderCanvasAgentPanel({
    canvasAgent: {
      promptDraft: "【@character.png】 【@notes.md】",
      promptAttachments: [
        { id: "image-1", fileGrantId: "grant-1", name: "character.png", kind: "image", previewUrl: "/image.png" },
        { id: "document-1", fileGrantId: "grant-2", name: "notes.md", kind: "document" },
      ],
    },
  });

  assert.match(html, /data-agent-prompt-editor/);
  assert.doesNotMatch(html, /class="canvas-agent-attachment-chips"/);
  assert.doesNotMatch(html, /data-agent-action="remove-agent-attachment"/);
});

test("media-only Agent reuses the storyboard attachment tray above its shared rich editor", () => {
  const html = renderCanvasAgentPanel({
    canvasAgentCapabilityProfile: "media_generation_only",
    canvasAgent: {
      promptAttachments: [
        { id: "image-1", fileGrantId: "grant-1", name: "character.png", kind: "image", previewUrl: "/image.png" },
      ],
    },
  });

  assert.match(html, /class="home-agent-composer canvas-agent-media-composer"/);
  assert.match(html, /episode-replica-ref-strip inline-upload-tray/);
  assert.match(html, /episode-replica-upload-card combined uploadable/);
  assert.match(html, /data-agent-action="remove-agent-attachment"/);
  assert.match(html, /data-agent-prompt-editor/);
  assert.ok(html.indexOf("inline-upload-tray") < html.indexOf("data-agent-prompt-editor"));
});

test("media-only Agent exposes uploaded materials through the shared @ suggestion list", () => {
  const source = readFileSync(new URL("../src/features/new-canvas/canvas-agent-panel.js", import.meta.url), "utf8");

  assert.match(source, /ordinalLabels: mediaOnly/);
  assert.match(source, /getSuggestions: \(\) => mediaOnly\s*\? listCanvasAgentPromptEditorAttachmentReferences\(agent, \{ ordinalLabels: true \}\)/);
  assert.match(source, /const retainedAttachments = mediaOnly\s*\? attachments/);
  assert.match(source, /if \(!mediaOnly\) \{\s*agent\.promptDraft = appendAgentPromptAttachmentTokens/);
});

test("media-only Agent numbers uploaded @ references without moving their selected positions", async () => {
  const mounted = [];
  const promptInput = { addEventListener() {}, setAttribute() {} };
  const editorHost = {
    dataset: {},
    isConnected: true,
    ownerDocument: { querySelector: () => null },
    querySelector(selector) {
      return selector === "[data-tiptap-prompt-editor]" ? promptInput : null;
    },
  };
  const workbench = {
    ui: {
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: {
        promptDraft: "先生成开场画面 【@8b044875-3b10-4202-b9b0-0f0e2d598d9b.png】 再保持角色动作",
        promptAttachments: [
          { id: "8b044875-3b10-4202-b9b0-0f0e2d598d9b.png", name: "8b044875-3b10-4202-b9b0-0f0e2d598d9b.png", kind: "image" },
          { id: "scene.mp4", name: "scene.mp4", kind: "video" },
          { id: "voice.mp3", name: "voice.mp3", kind: "audio" },
        ],
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => editorHost },
    workbench,
    capabilityProfile: "media_generation_only",
    loadPromptEditorModule: async () => ({
      mountPromptEditor(_element, options) {
        mounted.push(options);
        return { captureState: () => null, destroy() {} };
      },
    }),
  });

  await controller.syncPromptEditor();

  assert.equal(mounted[0].prompt, "先生成开场画面 【@图1】 再保持角色动作");
  assert.equal(workbench.ui.canvasAgent.promptDraft, "先生成开场画面 【@图1】 再保持角色动作");
  assert.deepEqual(mounted[0].mentionReferences.map((reference) => reference.label), ["图1", "视频1", "音频1"]);
  assert.deepEqual((await mounted[0].getSuggestions()).map((reference) => reference.label), ["图1", "视频1", "音频1"]);
  const { createPromptEditorDocument } = await import("../src/features/production-workbench/prompt-editor-document.js");
  const editorDocument = createPromptEditorDocument(mounted[0].prompt, mounted[0].mentionReferences);
  const imageMention = editorDocument.content[0].content.find((node) => node.type === "assetMention");
  assert.equal(imageMention.attrs.referenceId, "attachment:8b044875-3b10-4202-b9b0-0f0e2d598d9b.png");
  controller.dispose();
});

test("Canvas Agent keeps the uploaded-reference editor visually unified", () => {
  const css = readFileSync(new URL("../src/features/new-canvas/new-canvas.css", import.meta.url), "utf8");
  const editorRule = css.match(/\.canvas-agent-prompt-editor-host \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(editorRule, /min-height: 72px/);
  assert.match(editorRule, /height: auto/);
  assert.match(editorRule, /border-radius: 0/);
  assert.match(editorRule, /background: transparent/);
});

test("prompt editor mention options select on pointer down without leaking the event", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/prompt-editor.js", import.meta.url), "utf8");
  const optionSource = source.match(/function createMentionOption\([\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(optionSource, /addEventListener\("pointerdown"/);
  assert.match(optionSource, /event\.preventDefault\(\)/);
  assert.match(optionSource, /event\.stopPropagation\(\)/);
  assert.match(optionSource, /onSelect\(index\)/);
});

test("prompt editor previews inline media above the reference only while hovered", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/prompt-editor.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/features/production-workbench/production-workbench.css", import.meta.url), "utf8");

  assert.match(source, /installMentionHoverPreview\(editor, element\)/);
  assert.match(source, /addEventListener\("pointerover", handlePointerOver\)/);
  assert.match(source, /addEventListener\("pointerout", handlePointerOut\)/);
  assert.match(source, /documentRef\.body\.append\(previewElement\)/);
  assert.match(source, /previewElement\?\.remove\(\)/);
  assert.match(css, /\.episode-prompt-editor-hover-preview \{/);
  assert.match(css, /position: fixed/);
  assert.match(css, /pointer-events: none/);
});

test("Canvas Agent snapshots selected files before clearing the attachment input", async () => {
  const calls = [];
  const selectedFiles = [
    { name: "character.png", type: "image/png", size: 128 },
    { name: "pose.png", type: "image/png", size: 256 },
  ];
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-attachment-upload",
      canvasAgent: {
        conversationId: "conversation-attachment-upload",
        conversations: [{ id: "conversation-attachment-upload", title: "附件上传" }],
      },
    },
    api: {
      async uploadFile(file, options) {
        calls.push(["upload", file, options]);
        return { upload: { storageObjectId: `storage-${file.name}` } };
      },
      async createCanvasAgentFileGrant(canvasId, conversationId, input) {
        calls.push(["grant", canvasId, conversationId, input]);
        return { grant: { id: `grant-${input.storageObjectId}` } };
      },
      async listCanvasAgentFileGrants() {
        return { grants: [
          { id: "grant-storage-character.png", storageObjectId: "storage-character.png", status: "active" },
          { id: "grant-storage-pose.png", storageObjectId: "storage-pose.png", status: "active" },
        ] };
      },
    },
  };
  const input = {
    matches(selector) { return selector === "[data-agent-attachment-input]"; },
    get files() { return selectedFiles; },
    set value(_value) { selectedFiles.length = 0; },
  };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench });

  assert.equal(controller.handleInput(input), true);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls[0][0], "upload");
  assert.equal(calls[0][1].name, "character.png");
  assert.equal(calls.filter((call) => call[0] === "upload").length, 2);
  assert.equal(workbench.ui.canvasAgent.promptAttachments[0].fileGrantId, "grant-storage-character.png");
  assert.equal(workbench.ui.canvasAgent.promptAttachments[1].fileGrantId, "grant-storage-pose.png");
  assert.equal(workbench.ui.canvasAgent.promptDraft, "【@character.png】 【@pose.png】");

  await controller.handleAction({
    dataset: { agentAction: "remove-agent-attachment", attachmentId: "storage-character.png" },
  });
  assert.equal(workbench.ui.canvasAgent.promptAttachments.length, 1);
  assert.equal(workbench.ui.canvasAgent.promptDraft, "【@pose.png】");
  controller.dispose();
});

test("media-only Agent uploads references and submits with the selected generation model without a text model", async () => {
  let sentInput = null;
  const file = { name: "character.png", type: "image/png", size: 64 };
  const audioFile = { name: "reference.mp3", type: "audio/mpeg", size: 128 };
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-free-generation-upload",
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: {},
    },
    api: {
      async listFreeGenerationModels() {
        return { models: [] };
      },
      async listGlobalGenerationConfig({ mediaType }) {
        return mediaType === "image"
          ? {
              models: [{ modelCode: "image-selected", modelLabel: "Selected image", mediaType: "image", enabled: true }],
              defaultImageModelCode: "image-selected",
            }
          : { models: [] };
      },
      async listFreeGenerationConversations() {
        return { conversations: [] };
      },
      async listFreeGenerationMessages() {
        return { messages: [] };
      },
      async createFreeGenerationConversation() {
        return { conversation: { id: "free-upload-conversation" } };
      },
      async uploadFile(inputFile) {
        assert.ok([file, audioFile].includes(inputFile));
        return { upload: { storageObjectId: inputFile === file ? "storage-character" : "storage-audio" } };
      },
      async createFreeGenerationFileGrant(_conversationId, input) {
        return { grant: { id: input.storageObjectId === "storage-character" ? "grant-character" : "grant-audio" } };
      },
      async listFreeGenerationFileGrants() {
        return { grants: [
          { id: "grant-character", storageObjectId: "storage-character", status: "active" },
          { id: "grant-audio", storageObjectId: "storage-audio", status: "active" },
        ] };
      },
      async sendFreeGenerationMessage(_conversationId, input) {
        sentInput = input;
        return { task: { id: "free-upload-task", status: "queued" } };
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    capabilityProfile: "media_generation_only",
    pollIntervalMs: 60_000,
  });

  await controller.resume();
  await controller.submitPrompt({ text: "基于参考素材生成角色海报", files: [file, audioFile] });

  assert.equal("modelCode" in sentInput, false);
  assert.deepEqual(sentInput.message.preferredModels, { image: "image-selected" });
  assert.deepEqual(sentInput.message.fileGrantIds, ["grant-character", "grant-audio"]);
  assert.equal(sentInput.message.attachments[0].fileGrantId, "grant-character");
  assert.equal(sentInput.message.attachments[1].kind, "audio");
  controller.dispose();
});

test("media-only Agent creates a new text-model task instead of interjecting while media generation is pending", async () => {
  const sent = [];
  const controls = [];
  const workbench = {
    ui: {
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: {
        conversationId: "free-video-conversation",
        conversations: [{ id: "free-video-conversation", title: "视频生成", status: "active" }],
        taskId: "waiting-media-task",
        status: "waiting_external",
        promptDraft: "基于参考图生成 5 秒视频",
        modelCode: "text-model",
        generationKind: "video",
        generationModelsStatus: "ready",
        generationModels: [{ modelCode: "video-model", modelLabel: "Video", mediaType: "video", enabled: true }],
        generationModelCodes: { video: "video-model" },
      },
    },
    api: {
      async sendFreeGenerationMessage(conversationId, input) {
        sent.push({ conversationId, input });
        return { task: { id: "next-video-task", status: "queued" } };
      },
      async controlFreeGenerationTask(taskId, action, input) {
        controls.push({ taskId, action, input });
        return { result: { status: "waiting_external" } };
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    capabilityProfile: "media_generation_only",
    pollIntervalMs: 60_000,
  });

  try {
    await controller.submitPrompt({ text: "基于参考图生成 5 秒视频" });

    assert.deepEqual(controls, []);
    assert.deepEqual(sent, [{
      conversationId: "free-video-conversation",
      input: {
        modelCode: "text-model",
        mode: "c",
        capabilityProfile: "media_generation_only",
        message: {
          text: "基于参考图生成 5 秒视频",
          preferredModels: { video: "video-model" },
          preferredGenerationKind: "video",
          preferredGenerationParameters: { image: {}, video: {}, audio: {} },
        },
      },
    }]);
    assert.equal(workbench.ui.canvasAgent.taskId, "next-video-task");
    assert.equal(workbench.ui.canvasAgent.status, "queued");
  } finally {
    controller.dispose();
  }
});

test("media-only Agent creates and titles a conversation from its first message, then supports switching and renaming", async () => {
  const createCalls = [];
  const messageLoads = [];
  const updateCalls = [];
  const workbench = {
    ui: {
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: {},
    },
    api: {
      async listFreeGenerationModels() {
        return { models: [] };
      },
      async listGlobalGenerationConfig({ mediaType }) {
        return mediaType === "image"
          ? {
              models: [{ modelCode: "image-first-message", modelLabel: "Image", mediaType: "image", enabled: true }],
              defaultImageModelCode: "image-first-message",
            }
          : { models: [] };
      },
      async listFreeGenerationConversations() {
        return { conversations: [] };
      },
      async listFreeGenerationMessages(conversationId) {
        messageLoads.push(conversationId);
        return { messages: [] };
      },
      async createFreeGenerationConversation(input) {
        createCalls.push(input);
        return { conversation: { id: "free-first-message" } };
      },
      async sendFreeGenerationMessage(conversationId, input) {
        assert.equal(conversationId, "free-first-message");
        assert.equal(input.message.text, "雨夜车站电影海报");
        return { task: { id: "free-first-message-task", status: "queued" } };
      },
      async updateFreeGenerationConversation(input) {
        updateCalls.push(input);
        return { conversation: { id: input.conversationId, title: input.title } };
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    capabilityProfile: "media_generation_only",
    pollIntervalMs: 60_000,
  });

  await controller.resume();
  await controller.handleAction({ dataset: { agentAction: "new-conversation" } });
  assert.equal(createCalls.length, 0);
  assert.equal(workbench.ui.canvasAgent.conversationId, "");

  workbench.ui.canvasAgent.promptDraft = "雨夜车站电影海报";
  await controller.handleAction({ dataset: { agentAction: "send" } });

  assert.equal(createCalls.length, 1);
  assert.deepEqual(workbench.ui.canvasAgent.conversations, [
    { id: "free-first-message", title: "雨夜车站电影海报", status: "active" },
  ]);
  assert.deepEqual(updateCalls[0], {
    conversationId: "free-first-message",
    title: "雨夜车站电影海报",
  });
  assert.match(renderCanvasAgentPanel(workbench.ui), /雨夜车站电影海报/);
  const selectedConversationHtml = renderCanvasAgentPanel(workbench.ui);
  assert.match(selectedConversationHtml, /canvas-agent-media-conversation-row active/);
  assert.match(selectedConversationHtml, /data-conversation-id="free-first-message"[^>]*aria-current="page"/);
  assert.doesNotMatch(selectedConversationHtml, /data-conversation-id="free-first-message"[^>]*disabled/);

  await controller.handleAction({ dataset: { agentAction: "new-conversation" } });
  assert.equal(createCalls.length, 1);
  await controller.handleAction({
    dataset: { agentAction: "select-agent-conversation", conversationId: "free-first-message" },
  });
  assert.equal(workbench.ui.canvasAgent.conversationId, "free-first-message");
  assert.deepEqual(messageLoads, ["free-first-message"]);

  await controller.handleAction({
    dataset: { agentAction: "select-agent-conversation", conversationId: "free-first-message" },
  });
  assert.deepEqual(messageLoads, ["free-first-message"]);

  assert.equal(controller.handleDoubleClick({
    closest() {
      return { dataset: { conversationId: "free-first-message" } };
    },
  }), true);
  assert.equal(workbench.ui.canvasAgent.titleEditing, true);
  assert.equal(workbench.ui.canvasAgent.titleEditingConversationId, "free-first-message");
  assert.match(renderCanvasAgentPanel(workbench.ui), /canvas-agent-media-conversation-title-input[^>]*data-conversation-id="free-first-message"/);
  workbench.ui.canvasAgent.titleDraft = "夜行列车";
  await controller.handleAction({ dataset: { agentAction: "save-conversation-title" } });
  assert.deepEqual(updateCalls.at(-1), {
    conversationId: "free-first-message",
    title: "夜行列车",
  });
  assert.equal(workbench.ui.canvasAgent.conversations[0].title, "夜行列车");
  controller.dispose();
});

test("Canvas Agent accepts a homepage prompt with automatic mode and attachments", async () => {
  let sentInput = null;
  const file = { name: "story.txt", type: "text/plain", size: 32 };
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-home-agent",
      canvasAgent: {},
    },
    api: {
      async listCanvasAgentModels() {
        return { models: [{ modelCode: "agent-text-1", modelLabel: "Agent" }] };
      },
      async listCanvasAgentConversations() {
        return { conversations: [] };
      },
      async createCanvasAgentConversation() {
        return { conversation: { id: "conversation-home-agent", title: "首页创作" } };
      },
      async listCanvasAgentMessages() {
        return { messages: [] };
      },
      async uploadFile(inputFile) {
        assert.equal(inputFile, file);
        return { upload: { storageObjectId: "storage-story" } };
      },
      async createCanvasAgentFileGrant() {
        return { grant: { id: "grant-story" } };
      },
      async listCanvasAgentFileGrants() {
        return { grants: [{ id: "grant-story", storageObjectId: "storage-story", status: "active" }] };
      },
      async sendCanvasAgentMessage(_canvasId, _conversationId, input) {
        sentInput = input;
        return { task: { id: "task-home-agent", status: "queued" } };
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    pollIntervalMs: 60_000,
  });

  await controller.resume();
  await controller.submitPrompt({
    text: "解析故事并生成分镜视频",
    mode: "c",
    files: [file],
    preferredModels: { image: "image-pro", video: "video-pro" },
  });

  assert.equal(workbench.ui.canvasAgent.mode, "c");
  assert.equal(workbench.ui.canvasAgent.panelOpen, true);
  assert.equal(sentInput.mode, "c");
  assert.match(sentInput.message.text, /解析故事并生成分镜视频/);
  assert.deepEqual(sentInput.message.preferredModels, { image: "image-pro", video: "video-pro" });
  assert.deepEqual(sentInput.message.fileGrantIds, ["grant-story"]);
  assert.deepEqual(sentInput.message.attachments[0], {
    fileGrantId: "grant-story",
    name: "story.txt",
    contentType: "text/plain",
    sizeBytes: 32,
    kind: "document",
  });
  controller.dispose();
});

test("Canvas Agent homepage prompt selects a compatible model for image analysis", async () => {
  let sentInput = null;
  const file = { name: "character.png", type: "image/png", size: 64 };
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-home-agent-image",
      canvasAgent: {},
    },
    api: {
      async listCanvasAgentModels() {
        return {
          models: [
            { modelCode: "text-only", modelLabel: "Text", capabilities: { input: ["prompt"] } },
            { modelCode: "vision", modelLabel: "Vision", capabilities: { input: ["prompt", "image_url"] } },
          ],
        };
      },
      async listCanvasAgentConversations() {
        return { conversations: [] };
      },
      async createCanvasAgentConversation() {
        return { conversation: { id: "conversation-home-agent-image", title: "首页创作" } };
      },
      async listCanvasAgentMessages() {
        return { messages: [] };
      },
      async uploadFile(inputFile) {
        assert.equal(inputFile, file);
        return { upload: { storageObjectId: "storage-image" } };
      },
      async createCanvasAgentFileGrant() {
        return { grant: { id: "grant-image" } };
      },
      async listCanvasAgentFileGrants() {
        return { grants: [{ id: "grant-image", storageObjectId: "storage-image", status: "active" }] };
      },
      async sendCanvasAgentMessage(_canvasId, _conversationId, input) {
        sentInput = input;
        return { task: { id: "task-home-agent-image", status: "queued" } };
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    pollIntervalMs: 60_000,
  });

  await controller.resume();
  assert.equal(workbench.ui.canvasAgent.modelCode, "text-only");
  await controller.submitPrompt({ text: "分析角色图片", mode: "c", files: [file] });

  assert.equal(sentInput.modelCode, "vision");
  assert.deepEqual(sentInput.message.fileGrantIds, ["grant-image"]);
  controller.dispose();
});

test("Canvas Agent attachment button renders a single paperclip icon", () => {
  const html = renderCanvasAgentPanel({ canvasAgent: {} });
  const button = html.match(/<button[^>]*canvas-agent-attachment-button[\s\S]*?<\/button>/)?.[0] ?? "";

  assert.match(button, /data-agent-action="pick-attachments"/);
  assert.match(button, /M19 16\.5/);
  assert.doesNotMatch(button, /M12 5v14M5 12h14/);
  assert.equal((button.match(/<path\b/g) ?? []).length, 1);
});

test("Canvas Agent persists a temporary canvas before loading models", async () => {
  const calls = [];
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-project-main",
      canvasAgent: {},
    },
    async saveCanvasNow() {
      calls.push("save-canvas");
      workbench.ui.selectedCanvasProjectId = "93000000-0000-4000-8000-000000000001";
    },
    api: {
      async listCanvasAgentModels(canvasId) {
        calls.push(["models", canvasId]);
        return { models: [{ modelCode: "deepseek-noval", modelLabel: "DeepSeek" }] };
      },
      async listCanvasAgentConversations(canvasId) {
        calls.push(["conversations", canvasId]);
        return { conversations: [] };
      },
    },
  };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench });

  await controller.resume();

  assert.deepEqual(calls, [
    "save-canvas",
    ["models", "93000000-0000-4000-8000-000000000001"],
    ["conversations", "93000000-0000-4000-8000-000000000001"],
  ]);
  assert.equal(workbench.ui.canvasAgent.models[0].modelCode, "deepseek-noval");
  controller.dispose();
});

test("Canvas Agent blocks image and video input when the selected model lacks those capabilities", async () => {
  const cases = [
    {
      mediaKind: "image",
      promptAttachments: [{ id: "image-1", fileGrantId: "grant-image", name: "character.png", kind: "image" }],
      promptNodeReferences: [],
      error: "当前 Agent 模型不支持图片分析，请切换支持图片输入的模型。",
    },
    {
      mediaKind: "video",
      promptAttachments: [],
      promptNodeReferences: [{ nodeId: "video-1", title: "动作参考", mediaKind: "video", storageObjectId: "storage-video" }],
      error: "当前 Agent 模型不支持视频分析，请切换支持视频输入的模型。",
    },
  ];

  for (const input of cases) {
    let sendCount = 0;
    const workbench = {
      ui: {
        selectedCanvasProjectId: `canvas-unsupported-${input.mediaKind}`,
        canvasAgent: {
          conversationId: `conversation-unsupported-${input.mediaKind}`,
          promptDraft: "分析这个素材",
          promptAttachments: input.promptAttachments,
          promptNodeReferences: input.promptNodeReferences,
          modelCode: "text-only",
          modelsStatus: "ready",
          models: [{ modelCode: "text-only", modelLabel: "Text only", capabilities: { input: ["text"] } }],
        },
      },
      api: {
        async sendCanvasAgentMessage() {
          sendCount += 1;
          return { task: { id: "unexpected-task", status: "queued" } };
        },
      },
    };
    const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench });
    await controller.handleAction({ dataset: { agentAction: "send" } });
    assert.equal(sendCount, 0);
    assert.equal(workbench.ui.canvasAgent.error, input.error);
    controller.dispose();
  }
});

test("media-only Agent interjection sends a video request with an image reference without text-model vision validation", async () => {
  const calls = [];
  const workbench = {
    ui: {
      canvasAgentCapabilityProfile: "media_generation_only",
      canvasAgent: {
        conversationId: "free-video-conversation",
        taskId: "free-video-task",
        status: "running",
        promptDraft: "基于这张参考图生成 5 秒视频",
        generationKind: "video",
        generationModelsStatus: "ready",
        generationModels: [{ modelCode: "video-model", modelLabel: "Video", mediaType: "video", enabled: true }],
        generationModelCodes: { video: "video-model" },
        promptAttachments: [{
          id: "image-reference",
          fileGrantId: "grant-image-reference",
          name: "character.png",
          kind: "image",
        }],
        models: [{ modelCode: "text-only", modelLabel: "Text only", capabilities: { input: ["text"] } }],
        modelCode: "text-only",
      },
    },
    api: {
      async controlFreeGenerationTask(taskId, action, input) {
        calls.push({ taskId, action, input });
        return { result: { status: "running" } };
      },
    },
  };
  const controller = createCanvasAgentController({
    surface: { querySelector: () => null },
    workbench,
    capabilityProfile: "media_generation_only",
  });

  try {
    await controller.handleAction({ dataset: { agentAction: "interject-prompt" } });

    assert.equal(workbench.ui.canvasAgent.error, "");
    assert.deepEqual(calls, [{
      taskId: "free-video-task",
      action: "interject",
      input: {
        message: {
          text: "基于这张参考图生成 5 秒视频",
          preferredModels: { video: "video-model" },
          preferredGenerationKind: "video",
          preferredGenerationParameters: { video: {} },
          attachments: [{
            fileGrantId: "grant-image-reference",
            name: "character.png",
            kind: "image",
            contentType: "application/octet-stream",
            sizeBytes: 0,
          }],
          fileGrantIds: ["grant-image-reference"],
        },
      },
    }]);
  } finally {
    controller.dispose();
  }
});

test("Canvas Agent still sends document attachments through a text-only model", async () => {
  const calls = [];
  const workbench = {
    ui: {
      selectedCanvasProjectId: "canvas-document-attachment",
      canvasAgent: {
        conversationId: "conversation-document-attachment",
        promptDraft: "分析文档",
        promptAttachments: [{
          id: "document-1",
          fileGrantId: "grant-document",
          name: "notes.md",
          contentType: "text/markdown",
          sizeBytes: 128,
          kind: "document",
        }],
        modelCode: "text-only",
        modelsStatus: "ready",
        models: [{ modelCode: "text-only", modelLabel: "Text only", capabilities: { input: ["text"] } }],
      },
    },
    api: {
      async sendCanvasAgentMessage(_canvasId, _conversationId, input) {
        calls.push(input);
        return { task: { id: "task-document", status: "queued" } };
      },
    },
  };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench });
  await controller.handleAction({ dataset: { agentAction: "send" } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].message.attachments[0].kind, "document");
  controller.dispose();
});
