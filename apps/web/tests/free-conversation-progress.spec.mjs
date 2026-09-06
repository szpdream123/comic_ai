import assert from "node:assert/strict";
import test from "node:test";
import { createCanvasAgentController, normalizeAgentMediaTask, renderCanvasAgentPanel } from "../src/features/new-canvas/canvas-agent-panel.js";

test("free media keeps authoritative stage, model and timing fields for live progress", () => {
  const task = normalizeAgentMediaTask({ taskId: "g1", kind: "video", status: "polling", model: "Video Pro", progressStage: "provider_rendering", submittedAt: "2026-09-05T00:00:00Z", startedAt: "2026-09-05T00:00:10Z", returnedAt: null });
  assert.equal(task.progressStage, "provider_rendering");
  assert.equal(task.model, "Video Pro");
  assert.equal(task.submittedAt, "2026-09-05T00:00:00Z");
  const html = renderCanvasAgentPanel({ canvasAgentCapabilityProfile: "media_generation_only", canvasAgent: { taskId: "a1", status: "waiting_external", messages: [{ id: "m1", role: "tool", taskId: "a1", generationTaskId: "g1", media: task }] } });
  assert.match(html, /视频生成中/);
  assert.match(html, /data-generation-elapsed/);
  assert.match(html, /暂无可靠预估/);
  assert.doesNotMatch(html, /正在等待生成结果/);
});

for (const transport of ["stream", "poll", "delayed-poll"]) test(`new ${transport} waiting event discovers media before any tool message is loaded`, async () => {
  const queried = [];
  let waiting = false;
  let readsAfterWaiting = 0;
  const event = { id: "e1", sequence: 1, eventType: "task.waiting_external", event: { generationTaskId: "g1" } };
  const workbench = {
    ui: { canvasAgentCapabilityProfile: "media_generation_only", canvasAgent: { modelCode: "text", modelsStatus: "ready", models: [{ modelCode: "text" }], promptDraft: "生成校园行走视频", generationKind: "agent" } },
    api: {
      async createFreeGenerationConversation() { return { conversation: { id: "c1" } }; },
      async sendFreeGenerationMessage() { return { task: { id: "a1", status: "queued" } }; },
      async listFreeGenerationMessages() { if (waiting) readsAfterWaiting++; return { messages: waiting && (transport !== "delayed-poll" || readsAfterWaiting > 2) ? [{ id: "m1", taskId: "a1", role: "tool", content: { generationTaskId: "g1" } }] : [] }; },
      async getGenerationTasks(ids) { queried.push(...ids); return { items: [{ taskId: "g1", status: "polling", kind: "video", progressStage: "provider_rendering" }] }; },
      async listFreeGenerationEvents() { const events = waiting ? [] : [event]; waiting = true; return { events }; },
      ...(transport === "stream" ? { async *streamFreeGenerationEvents() { waiting = true; yield { data: event }; } } : {}),
    },
  };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench, pollIntervalMs: 1 });
  try {
    await controller.handleAction({ dataset: { agentAction: "send" } });
    for (let i = 0; i < 40 && !queried.length; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(queried.includes("g1"), "the new media task must be queried without reloading the page");
    assert.equal(workbench.ui.canvasAgent.messages.find(m => m.generationTaskId === "g1")?.media?.progressStage, "provider_rendering");
  } finally { controller.dispose(); }
});
