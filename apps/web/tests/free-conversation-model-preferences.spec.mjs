import assert from "node:assert/strict";
import { test } from "node:test";
import { createCanvasAgentController, renderCanvasAgentPanel } from "../src/features/new-canvas/canvas-agent-panel.js";
const action = (agentAction, extra = {}) => ({ dataset: { agentAction, ...extra } });

test("chosen media models survive page recreation and are used in the next request, isolated by account", async () => {
  const saved = new Map();
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) } });
  const controllers = [];
  const sent = [];
  function page(userId, enabled = true) {
    const workbench = { session: { user: { id: userId } }, ui: { canvasAgentCapabilityProfile: "media_generation_only", canvasAgent: { modelCode: "text", modelsStatus: "ready", models: [{ modelCode: "text" }], promptDraft: "生成一个镜头" } }, api: {
      async listGlobalGenerationConfig({ mediaType }) { return { models: [{ modelCode: `${mediaType}-default`, mediaType, enabled: true }, { modelCode: `${mediaType}-chosen`, mediaType, enabled }] }; },
      async createFreeGenerationConversation() { return { conversation: { id: "c" } }; },
      async sendFreeGenerationMessage(id, input) { sent.push(input); return { task: { id: "t", status: "queued" } }; },
    } };
    const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench });
    controllers.push(controller);
    return { controller, agent: workbench.ui.canvasAgent };
  }
  try {
    const first = page("a");
    await first.controller.handleAction(action("reload-generation-models"));
    await first.controller.handleAction(action("select-free-generation-model", { modelKind: "video", modelId: "video-chosen" }));
    first.controller.handleInput({ dataset: { agentField: "generationModelCode", generationKind: "image" }, value: "image-chosen" });
    first.controller.dispose();
    const refreshed = page("a");
    await refreshed.controller.handleAction(action("reload-generation-models"));
    assert.equal(refreshed.agent.generationModelCodes.video, "video-chosen");
    assert.equal(refreshed.agent.generationModelCodes.image, "image-chosen");
    await refreshed.controller.handleAction(action("send"));
    assert.equal(sent[0].message.preferredModels.video, "video-chosen");
    assert.equal(sent[0].message.preferredModels.image, "image-chosen");
    const other = page("b");
    await other.controller.handleAction(action("reload-generation-models"));
    assert.equal(other.agent.generationModelCodes.video, "video-default");
    const removed = page("a", false);
    await removed.controller.handleAction(action("reload-generation-models"));
    assert.equal(removed.agent.generationModelCodes.video, "video-default");
    assert.equal(removed.agent.selectedModelOverrides.video, undefined);
  } finally {
    controllers.forEach(controller => controller.dispose());
    if (original) Object.defineProperty(globalThis, "localStorage", original); else delete globalThis.localStorage;
  }
});

test("custom settings trigger keeps its label independent of selected style", () => {
  const html = renderCanvasAgentPanel({ canvasAgentCapabilityProfile: "media_generation_only", canvasAgent: { visualStyleId: "realistic", visualStylePending: true } });
  const trigger = html.match(/<button[^>]*data-agent-action="toggle-composer-settings"[\s\S]*?<\/button>/)?.[0];
  assert.match(trigger, /<span>自定义<\/span>/);
});
