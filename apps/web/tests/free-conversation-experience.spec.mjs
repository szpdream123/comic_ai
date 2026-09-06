import assert from "node:assert/strict";
import test from "node:test";
import { createCanvasAgentController, renderCanvasAgentPanel } from "../src/features/new-canvas/canvas-agent-panel.js";

test("skill library filters workflows and selects a skill without sending or destroying the draft", async () => {
  const ui = { canvasAgentCapabilityProfile: "media_generation_only", canvasAgent: { promptDraft: "雨后的校园" } };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench: { ui } });
  try {
    await controller.handleAction({ dataset: { agentAction: "toggle-skill-library" } });
    const html = renderCanvasAgentPanel(ui);
    assert.match(html, /搜索创作技能/);
    assert.match(html, /scene-design/);
    assert.match(html, /story-development/);
    controller.handleInput({ dataset: { agentField: "skillQuery" }, value: "分镜" });
    const filtered = renderCanvasAgentPanel(ui);
    assert.match(filtered, /data-skill-id="storyboard"/);
    assert.doesNotMatch(filtered, /data-skill-id="poster-design"/);
    await controller.handleAction({ dataset: { agentAction: "select-free-conversation-skill", skillId: "storyboard" } });
    assert.equal(ui.canvasAgent.promptDraft, "雨后的校园");
    assert.equal(ui.canvasAgent.selectedSkillId, "storyboard");
    assert.equal(ui.canvasAgent.skillLibraryOpen, false);
    await controller.handleAction({ dataset: { agentAction: "clear-free-conversation-skill" } });
    assert.equal(ui.canvasAgent.promptDraft, "雨后的校园");
  } finally { controller.dispose(); }
});

test("using a selected result for video obtains its grant and prepares only a draft", async () => {
  const calls = [];
  const ui = { canvasAgentCapabilityProfile: "media_generation_only", canvasAgent: { conversationId: "c1", promptDraft: "在校园散步", status: "succeeded", messages: [{ id: "m1", media: { taskId: "g1", status: "succeeded", kind: "image", storageObjectId: "chosen", url: "/api/storage/objects/chosen/content", title: "角色第一版" } }, { id: "m2", media: { storageObjectId: "other", kind: "image", url: "/other" } }] } };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench: { ui, api: {
    async createFreeGenerationFileGrant(conversationId, input) { calls.push({ conversationId, input }); return { grant: { id: "grant-chosen", storageObjectId: input.storageObjectId, status: "active" } }; },
    async sendFreeGenerationMessage() { assert.fail("choosing a result must not start paid generation"); },
  } } });
  try {
    await controller.handleAction({ dataset: { agentAction: "reuse-agent-media", messageId: "m1", intent: "video" } });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].input.storageObjectId, "chosen");
    assert.equal(ui.canvasAgent.promptAttachments[0].fileGrantId, "grant-chosen");
    assert.equal(ui.canvasAgent.generationKind, "agent");
    assert.equal(ui.canvasAgent.selectedSkillId, "image-to-video");
    assert.match(ui.canvasAgent.promptDraft, /在校园散步/);
    assert.match(renderCanvasAgentPanel(ui), /data-agent-action="reuse-agent-media"/);
  } finally { controller.dispose(); }
});

test("model selectors stay visible outside the parameter foldout and slash opens the Chinese skill menu", async () => {
  const ui = { canvasAgentCapabilityProfile: "media_generation_only", canvasAgent: {} };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench: { ui } });
  try {
    const html = renderCanvasAgentPanel(ui);
    assert.match(html.replace(/<details[\s\S]*?<\/details>/g, ""), /aria-label="选择视频模型"/);
    controller.handleInput({ dataset: { agentField: "promptDraft" }, value: "/", selectionStart: 1 });
    assert.equal(ui.canvasAgent.skillLibraryOpen, true);
    await controller.handleAction({ dataset: { agentAction: "select-free-conversation-skill", skillId: "character-design" } });
    assert.equal(ui.canvasAgent.promptDraft, "");
    assert.equal(ui.canvasAgent.selectedSkillId, "character-design");
    assert.match(renderCanvasAgentPanel(ui), /canvas-agent-selected-skill/);
    assert.doesNotMatch(renderCanvasAgentPanel(ui), />\/character-design/);
  } finally { controller.dispose(); }
});

test("failed reference authorization preserves existing draft and attachments", async () => {
  const ui = { canvasAgentCapabilityProfile: "media_generation_only", canvasAgent: { conversationId: "c1", promptDraft: "保留我的要求", promptAttachments: [{ id: "original", kind: "image" }], messages: [{ id: "m1", media: { status: "succeeded", kind: "image", storageObjectId: "chosen", url: "/chosen" } }] } };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench: { ui, api: { async createFreeGenerationFileGrant() { throw new Error("reference unavailable"); } } } });
  try {
    await controller.handleAction({ dataset: { agentAction: "reuse-agent-media", messageId: "m1", intent: "video" } });
    assert.equal(ui.canvasAgent.promptDraft, "保留我的要求");
    assert.equal(ui.canvasAgent.promptAttachments.length, 1);
    assert.ok(ui.canvasAgent.error);
  } finally { controller.dispose(); }
});

test("generation parameters expose only configured choices and retain typed values", () => {
  const ui = { canvasAgentCapabilityProfile: "media_generation_only", canvasAgent: { promptDraft: "校园散步", generationModels: [{ modelCode: "v1", mediaType: "video", parameterSchema: { properties: { duration: { type: "integer", enum: [5, 10] }, secret: { enum: ["hidden"] } } }, defaultParams: { duration: 5 } }], generationModelCodes: { video: "v1" } } };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench: { ui } });
  try {
    assert.match(renderCanvasAgentPanel(ui), /data-generation-parameter="duration"/);
    assert.doesNotMatch(renderCanvasAgentPanel(ui), /data-generation-parameter="secret"/);
    controller.handleInput({ dataset: { agentField: "generationParameter", generationKind: "video", generationParameter: "duration" }, value: "10" });
    assert.equal(ui.canvasAgent.generationParameters.video.duration, 10);
    assert.equal(ui.canvasAgent.promptDraft, "校园散步");
  } finally { controller.dispose(); }
});

test("selected Chinese skill and explicit model reach submission while the visible draft stays clean", async () => {
  const sent = [];
  const ui = { canvasAgentCapabilityProfile: "media_generation_only", canvasAgent: { promptDraft: "雨后的校园", modelCode: "text-pro", modelsStatus: "ready", models: [{ modelCode: "text-pro", modelLabel: "创作助手" }], generationModelsStatus: "ready", generationModels: [{ modelCode: "wan3.0-r2v", modelLabel: "Wan3.0", mediaType: "video" }], generationModelCodes: { video: "wan3.0-r2v" } } };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench: { ui, api: {
    async createFreeGenerationConversation() { return { conversation: { id: "c" } }; },
    async sendFreeGenerationMessage(id, input) { sent.push(input); return { task: { id: "t", status: "queued" } }; },
  } } });
  try {
    await controller.handleAction({ dataset: { agentAction: "select-free-conversation-skill", skillId: "image-to-video" } });
    await controller.handleAction({ dataset: { agentAction: "select-free-generation-model", modelKind: "video", modelId: "wan3.0-r2v" } });
    assert.equal(ui.canvasAgent.promptDraft, "雨后的校园");
    await controller.handleAction({ dataset: { agentAction: "send" } });
    assert.equal(sent[0].message.preferredModels.video, "wan3.0-r2v");
    assert.match(sent[0].message.text, /^\/image-to-video 视频模型用 wan3.0-r2v。\n雨后的校园$/);
    assert.equal(ui.canvasAgent.selectedSkillId, "");
  } finally { controller.dispose(); }
});
