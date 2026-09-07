import assert from "node:assert/strict";
import test from "node:test";
import { createCanvasAgentController, renderCanvasAgentPanel } from "../src/features/new-canvas/canvas-agent-panel.js";

const action = (name, extra = {}) => ({ dataset: { agentAction: name, ...extra } });
function setup(state = {}, api = {}) {
  const ui = { canvasAgentCapabilityProfile: "media_generation_only", canvasAgent: state };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench: { ui, api } });
  return { ui, controller };
}

test("conversation drafts, references and pending choices restore to their own conversation", async () => {
  const { ui, controller } = setup({ conversationId: "a", promptDraft: "A的角色", selectedSkillId: "character-design", visualStyleId: "realistic", visualStylePending: true, promptAttachments: [{ id: "ref-a", fileGrantId: "grant-a" }], conversations: [{ id: "a" }, { id: "b" }] }, { async listFreeGenerationMessages() { return { messages: [] }; } });
  try {
    await controller.handleAction(action("select-agent-conversation", { conversationId: "b" }));
    assert.equal(ui.canvasAgent.promptDraft, "");
    assert.deepEqual(ui.canvasAgent.promptAttachments, []);
    ui.canvasAgent.promptDraft = "B的镜头";
    ui.canvasAgent.promptAttachments = [{ id: "ref-b", fileGrantId: "grant-b" }];
    ui.canvasAgent.selectedSkillId = "image-to-video";
    await controller.handleAction(action("select-agent-conversation", { conversationId: "a" }));
    assert.equal(ui.canvasAgent.promptDraft, "A的角色");
    assert.equal(ui.canvasAgent.promptAttachments[0].fileGrantId, "grant-a");
    assert.equal(ui.canvasAgent.selectedSkillId, "character-design");
    assert.equal(ui.canvasAgent.visualStylePending, true);
    await controller.handleAction(action("new-conversation"));
    assert.equal(ui.canvasAgent.promptDraft, "");
    assert.equal(ui.canvasAgent.selectedSkillId, "");
    await controller.handleAction(action("select-agent-conversation", { conversationId: "b" }));
    assert.equal(ui.canvasAgent.promptDraft, "B的镜头");
    assert.equal(ui.canvasAgent.promptAttachments[0].fileGrantId, "grant-b");
  } finally { controller.dispose(); }
});

test("late conversation loads cannot overwrite the selected conversation, including A-B-A", async () => {
  const requests = [];
  const { ui, controller } = setup({ conversations: [{ id: "a", taskId: "task-a", taskStatus: "succeeded" }, { id: "b", taskId: "task-b", taskStatus: "succeeded" }] }, {
    listFreeGenerationMessages(id) { return new Promise(resolve => requests.push({ id, resolve })); },
  });
  try {
    const firstA = controller.handleAction(action("select-agent-conversation", { conversationId: "a" }));
    const b = controller.handleAction(action("select-agent-conversation", { conversationId: "b" }));
    requests[1].resolve({ messages: [{ id: "b-message", role: "user", content: { text: "B" } }] });
    await b;
    assert.equal(ui.canvasAgent.taskId, "task-b");
    requests[0].resolve({ messages: [{ id: "old-a", role: "user", content: { text: "旧A" } }] });
    await firstA;
    assert.equal(ui.canvasAgent.taskId, "task-b");
    assert.equal(ui.canvasAgent.messages[0].id, "b-message");
    // Force fresh history loads and then return to the same ID while its old request is pending.
    ui.canvasAgent.conversations.forEach(item => { item.taskStatus = "running"; });
    const oldA = controller.handleAction(action("select-agent-conversation", { conversationId: "a" }));
    const nextB = controller.handleAction(action("select-agent-conversation", { conversationId: "b" }));
    const newA = controller.handleAction(action("select-agent-conversation", { conversationId: "a" }));
    requests[4].resolve({ messages: [{ id: "new-a", role: "user", content: { text: "最新A" } }] });
    await newA;
    requests[2].resolve({ messages: [{ id: "stale-a", role: "user", content: { text: "过期A" } }] });
    requests[3].resolve({ messages: [] });
    await Promise.all([oldA, nextB]);
    assert.equal(ui.canvasAgent.messages[0].id, "new-a");
    assert.equal(ui.canvasAgent.taskId, "task-a");
  } finally { controller.dispose(); }
});

test("interjecting during generation keeps the visible conversation history", async () => {
  const messages = Array.from({ length: 35 }, (_, i) => ({ id: `m${i}`, role: "user", text: `内容${i}` }));
  const calls = [];
  const { ui, controller } = setup({ conversationId: "a", taskId: "task-a", status: "waiting_external", promptDraft: "镜头慢一点", messages }, {
    async controlFreeGenerationTask(id, name, input) { calls.push({ id, name, input }); return {}; },
  });
  try {
    await controller.handleAction(action("interject-prompt"));
    assert.equal(calls[0].name, "interject");
    assert.equal(ui.canvasAgent.messages.length, 36);
    assert.equal(ui.canvasAgent.messages[0].id, "m0");
    assert.equal(ui.canvasAgent.promptDraft, "");
  } finally { controller.dispose(); }
});

test("returning to a newer active task resumes polling even if the sidebar still lists a completed task", async () => {
  const { ui, controller } = setup({ conversationId: "a", taskId: "new-a", status: "running", conversations: [{ id: "a", taskId: "old-a", taskStatus: "succeeded" }, { id: "b" }] }, {
    async listFreeGenerationMessages() { return { messages: [] }; },
  });
  try {
    await controller.handleAction(action("select-agent-conversation", { conversationId: "b" }));
    await controller.handleAction(action("select-agent-conversation", { conversationId: "a" }));
    assert.equal(ui.canvasAgent.taskId, "new-a");
    assert.equal(ui.canvasAgent.status, "running");
    assert.equal(ui.canvasAgent.polling, true);
  } finally { controller.dispose(); }
});

test("running Agent exposes separate stop and supplement controls; paused questions invite an answer", () => {
  const { ui, controller } = setup({ conversationId: "a", taskId: "task-a", status: "running" });
  try {
    const html = renderCanvasAgentPanel(ui);
    assert.match(html, /data-agent-action="interject-prompt"[^>]*aria-label="发送补充要求"/);
    assert.match(html, /data-agent-action="stop"/);
    ui.canvasAgent.status = "paused";
    ui.canvasAgent.messages = [{ role: "tool", taskId: "task-a", creative: { type: "question", id: "q", question: "选择画风", options: [] } }];
    assert.match(renderCanvasAgentPanel(ui), /aria-label="发送回答并继续"/);
  } finally { controller.dispose(); }
});

test("fallback editor does not send while a Chinese input method is composing", () => {
  const { ui, controller } = setup({ promptDraft: "角色" });
  try {
    let prevented = false;
    assert.equal(controller.handleKeydown({ key: "Enter", isComposing: true, preventDefault() { prevented = true; } }, { dataset: { agentField: "promptDraft" } }), false);
    assert.equal(prevented, false);
    assert.equal(ui.canvasAgent.promptDraft, "角色");
  } finally { controller.dispose(); }
});

test("uploading references blocks sending and switching; failed interjection keeps the draft", async () => {
  let calls = 0;
  const { ui, controller } = setup({ conversationId: "a", taskId: "task-a", status: "running", attachmentUploading: true, promptDraft: "保留人物", selectedSkillId: "image-to-video", promptAttachments: [{ id: "ref", fileGrantId: "grant" }] }, {
    async controlFreeGenerationTask() { calls += 1; throw new Error("network unavailable"); },
  });
  try {
    await controller.handleAction(action("interject-prompt"));
    await controller.handleAction(action("select-agent-conversation", { conversationId: "b" }));
    await controller.handleAction(action("new-conversation"));
    assert.equal(calls, 0);
    assert.equal(ui.canvasAgent.conversationId, "a");
    ui.canvasAgent.attachmentUploading = false;
    await controller.handleAction(action("interject-prompt"));
    assert.equal(calls, 1);
    assert.equal(ui.canvasAgent.promptDraft, "保留人物");
    assert.equal(ui.canvasAgent.promptAttachments[0].fileGrantId, "grant");
    assert.equal(ui.canvasAgent.selectedSkillId, "image-to-video");
  } finally { controller.dispose(); }
});

test("model load errors offer a working retry, including an empty ready catalog", async () => {
  let calls = 0;
  const { ui, controller } = setup({ generationModelsStatus: "ready", generationModelsError: "管理员尚未启用生成模型" }, {
    async listGlobalGenerationConfig({ mediaType }) { calls += 1; return { models: [{ modelCode: `${mediaType}-pro`, modelLabel: "可用模型", mediaType, enabled: true }] }; },
  });
  try {
    assert.match(renderCanvasAgentPanel(ui), /data-agent-action="reload-generation-models"/);
    await controller.handleAction(action("reload-generation-models"));
    assert.equal(calls, 3);
    assert.equal(ui.canvasAgent.generationModelsError, "");
    assert.equal(ui.canvasAgent.generationModels.length, 3);
  } finally { controller.dispose(); }
});

test("Escape closes the nested model menu before its parent settings; outside click keeps the editor intact", () => {
  const { ui, controller } = setup({ composerSettingsOpen: true, generationMenuOpen: "free-generation:model-video" });
  try {
    controller.handleKeydown({ key: "Escape", preventDefault() {} }, {});
    assert.equal(ui.canvasAgent.generationMenuOpen, "");
    assert.equal(ui.canvasAgent.composerSettingsOpen, true);
    controller.handleClick({ closest: () => null });
    assert.equal(ui.canvasAgent.composerSettingsOpen, false);
    ui.canvasAgent.skillLibraryOpen = true;
    controller.handleClick({ closest: selector => selector === "[data-agent-action]" ? {} : null });
    assert.equal(ui.canvasAgent.skillLibraryOpen, true, "toolbar action must remain available to its own handler");
    controller.handleClick({ closest: () => null });
    assert.equal(ui.canvasAgent.skillLibraryOpen, false);
  } finally { controller.dispose(); }
});
