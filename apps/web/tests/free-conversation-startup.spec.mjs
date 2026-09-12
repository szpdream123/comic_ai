import assert from "node:assert/strict";
import test from "node:test";
import { initProductionWorkbench, syncWorkbenchRouteStateForTest } from "../src/features/production-workbench/index.js";
import { createCanvasAgentController } from "../src/features/new-canvas/canvas-agent-panel.js";

test("a direct free-conversation route selects free APIs before the first controller is mounted", async () => {
  const previous = new Map(["window", "document", "localStorage", "sessionStorage"].map((key) => [key, globalThis[key]]));
  const storage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const calls = [];
  const editors = [];
  const editorHost = {
    dataset: {}, isConnected: true, ownerDocument: { querySelector() { return null; } },
    querySelector() { return null; },
  };
  const createController = (workbench) => createCanvasAgentController({
    surface: { querySelector(selector) { return selector === "[data-agent-prompt-editor]" ? editorHost : null; } },
    workbench,
    loadPromptEditorModule: async () => ({
      mountPromptEditor(_host, options) { editors.push(options); return { captureState() { return null; }, destroy() {} }; },
    }),
  });
  let workbench;
  let controller;
  try {
    globalThis.localStorage = globalThis.sessionStorage = storage;
    globalThis.window = {
      localStorage: storage,
      location: { hash: "#free-generation", pathname: "/", protocol: "http:", host: "localhost", search: "" },
      addEventListener() {}, removeEventListener() {},
    };
    globalThis.document = {
      body: { classList: { toggle() {} }, setAttribute() {} },
      addEventListener() {}, removeEventListener() {}, querySelectorAll() { return []; },
    };
    workbench = await initProductionWorkbench({
      root: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } },
      session: null,
      deferInitialRender: true,
      api: {
        async listFreeGenerationConversations() { calls.push("free"); return { conversations: [] }; },
        async listCanvasAgentConversations() { calls.push("canvas"); return { conversations: [] }; },
      },
    });
    // A previous canvas selection must not choose the controller's API surface.
    workbench.ui.selectedCanvasProjectId = "previous-canvas";
    controller = createController(workbench);
    await controller.resume();
    assert.deepEqual(calls, ["free"]);
    assert.equal(workbench.ui.canvasAgentOnly, true);
    assert.equal(workbench.ui.canvasAgentCapabilityProfile, "media_generation_only");
    await controller.syncPromptEditor();
    assert.equal(editors.at(-1).ariaLabel, "自由生成指令");
    assert.match(editors.at(-1).placeholder, /输入想法、剧本或上传参考/);
    controller.dispose();

    workbench.ui.canvasAgentCapabilityProfile = "";
    workbench.ui.canvasAgentOnly = false;
    workbench.ui.canvasAgent.freeGenerationConversationsLoaded = false;
    controller = createController(workbench);
    await controller.resume();
    assert.deepEqual(calls, ["free", "canvas"]);
    controller.dispose();

    syncWorkbenchRouteStateForTest(workbench, "#free-generation");
    controller = createController(workbench);
    await controller.resume();
    assert.deepEqual(calls, ["free", "canvas", "free"]);
    await controller.syncPromptEditor();
    assert.equal(editors.at(-1).ariaLabel, "自由生成指令");
  } finally {
    controller?.dispose();
    workbench?.disposeCanvasLiveSubscription();
    workbench?.disposeTaskCenterPolling();
    for (const [key, value] of previous) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
