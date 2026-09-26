import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolveCanvasAssistantModelId } from "../ai-canvas-runtime/assets/canvasAgentBatch.js";

const asset = new URL("../ai-canvas-runtime/assets/conversationExecutionController-CGzzIkBM.js", import.meta.url);
const source = readFileSync(asset, "utf8");

async function fixture(nodes, options = {}) {
  const state = {
    nodes: nodes.map(node => ({ type: "ai-image", data: { type: "ai-image", prompt: "draw", ...node.data }, ...node })),
    edges: options.edges ?? [], currentProjectId: "p", projects: [], config: options.config ?? {},
    incrementRevision() {}, getCurrentRevision: () => 1,
  };
  const start = source.indexOf('E({id:`canvas_run_nodes`');
  const end = source.indexOf(',E({id:`canvas_duplicate_node`', start);
  const bindings = {
    E: value => value, ga: {}, ea: Number(source.match(/ea=(\d+),ta=/)?.[1]), A() {}, j() {},
    M: input => input.nodeIds, w: { getState: () => state }, Wt: options.runNode ?? (async () => ({ success: true })),
    Sa: (model, targets) => options.resolveModel?.(model, targets) ?? ({ patch: { model, provider: "general" } }),
  };
  if (source.includes("runCanvasAgentBatch")) {
    bindings.runCanvasAgentBatch = (await import("../ai-canvas-runtime/assets/canvasAgentBatch.js")).runCanvasAgentBatch;
  }
  const tool = new Function(...Object.keys(bindings), `return ${source.slice(start, end)}`)(...Object.values(bindings));
  const abort = new AbortController();
  const execute = () => tool.execute({ projectId: "p", signal: abort.signal }, { nodeIds: nodes.map(n => n.id) });
  return { state, execute, abort };
}

test("canvas assistant starts all ten independent images before any image finishes", async () => {
  const started = [], releases = [];
  const { execute } = await fixture(Array.from({ length: 10 }, (_, i) => ({ id: String(i) })), {
    runNode: id => { started.push(id); return new Promise(resolve => releases.push(() => resolve({ success: true }))); },
  });
  const task = execute();
  await new Promise(resolve => setImmediate(resolve));
  try { assert.equal(started.length, 10); }
  finally { releases.forEach(release => release()); }
  assert.equal((await task).summary, "已运行 10/10 个节点");
});

test("canvas assistant uses the displayed default without reselecting and preserves explicit node models", async () => {
  const calls = [];
  const { execute } = await fixture([{ id: "default" }, { id: "explicit", data: { type: "ai-image", model: "general/explicit", provider: "general" } }], {
    config: { assistantImageModelId: "comic-ai/image/preferred", generalModels: [{ id: "comic-ai/image/preferred", category: "image" }] },
    runNode: async (...args) => { calls.push(args); return { success: true }; },
  });
  await execute();
  assert.equal(calls.find(args => args[0] === "default")?.[3]?.model, "general/comic-ai/image/preferred");
  assert.equal(calls.find(args => args[0] === "explicit")?.[3]?.model ?? "general/explicit", "general/explicit");
});

test("catalog bridge hydrates the cached image default and a video default without replacing explicit choices", () => {
  const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const bridge = app.slice(app.indexOf("function createAiCanvasRuntimeCatalogBridge"), app.indexOf("function createAiCanvasRuntimeScaleBridge"));
  let cached = { "ai-image": "general/comic-ai/image/cached" };
  const createBridge = new Function("localStorage", "resolveAiCanvasRuntimeModelPricing", `${bridge}; return createAiCanvasRuntimeCatalogBridge`)(
    { getItem: () => JSON.stringify(cached) }, () => ({}),
  );
  let state = { config: {} };
  const store = { getState: () => state, setState: patch => { state = { ...state, ...patch }; } };
  const context = { models: [{ id: "first", category: "image" }, { id: "cached", category: "image" }, { id: "video", category: "video" }] };
  createBridge(store, context);
  assert.equal(state.config.assistantImageModelId, "general/comic-ai/image/cached");
  assert.equal(state.config.assistantVideoModelId, "general/comic-ai/video/video");
  state.config.assistantImageModelId = "general/custom";
  createBridge(store, context);
  assert.equal(state.config.assistantImageModelId, "general/custom");
  cached = { "ai-image": "dreamina/image-choice", "ai-video": "general/removed-model" };
  state = { config: {} };
  createBridge(store, context);
  assert.equal(state.config.assistantImageModelId, "dreamina/image-choice");
  assert.equal(state.config.assistantVideoModelId, "general/removed-model", "an unavailable selection must be validated, never silently replaced with a different paid model");
});

test("dependent images wait for upstream output while independent images run together", async () => {
  const started = [], release = new Map();
  const { execute } = await fixture([
    { id: "downstream", data: { type: "ai-image", prompt: "use @{upstream/cell/0:reference}" } },
    { id: "upstream" }, { id: "independent" }, { id: "linked" },
  ], {
    edges: [{ source: "upstream", target: "linked" }],
    runNode: id => { started.push(id); return new Promise(resolve => release.set(id, () => resolve({ success: true }))); },
  });
  const task = execute();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, ["upstream", "independent"]);
  release.get("upstream")(); release.get("independent")();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, ["upstream", "independent", "downstream", "linked"]);
  release.get("downstream")(); release.get("linked")();
  assert.equal((await task).summary, "已运行 4/4 个节点");
});

test("parallel workflow results keep the real canvas revision guard valid until the wave completes", async () => {
  const upstream = readFileSync(new URL("../ai-canvas-runtime/assets/main-upstream-665b2cc.js", import.meta.url), "utf8");
  const guards = upstream.slice(upstream.indexOf("function xA("), upstream.indexOf("function wA("));
  const { capture, valid } = new Function(`let yA = new Map(), bA = 0; ${guards}; return { capture: xA, valid: CA };`)();
  let revision = 1;
  const releases = new Map();
  let page;
  page = await fixture([{ id: "fast" }, { id: "workflow", data: { type: "ai-image", workflowId: "wf", provider: "workflow-api" } }], {
    runNode: id => {
      const guard = capture(page.state, id);
      return new Promise(resolve => releases.set(id, () => resolve({ success: valid(guard, page.state) })));
    },
  });
  page.state.getCurrentRevision = () => revision;
  page.state.incrementRevision = () => revision++;
  const task = page.execute();
  await new Promise(resolve => setImmediate(resolve));
  releases.get("fast")();
  await new Promise(resolve => setImmediate(resolve));
  releases.get("workflow")();
  assert.equal((await task).summary, "已运行 2/2 个节点");
  assert.ok(revision > 1);
});

test("one rejected generation does not abort independent images or launch failed dependents", async () => {
  const started = [];
  const { execute } = await fixture([{ id: "bad" }, { id: "good" }, { id: "dependent" }, { id: "busy", data: { type: "ai-image", status: "loading" } }], {
    edges: [{ source: "bad", target: "dependent" }],
    runNode: async id => { started.push(id); if (id === "bad") throw Error("provider failed"); return { success: true }; },
  });
  const result = await execute();
  assert.deepEqual(started, ["bad", "good"]);
  assert.deepEqual(JSON.parse(result.modelContent).results.map(r => r.status), ["failed", "success", "skipped", "skipped"]);
});

test("abort and project switches prevent later dependency waves from starting", async () => {
  for (const reason of ["abort", "switch"]) {
    const started = [];
    let page;
    page = await fixture([{ id: "upstream" }, { id: "downstream" }], {
      edges: [{ source: "upstream", target: "downstream" }],
      runNode: async id => { started.push(id); if (reason === "abort") page.abort.abort(); else page.state.currentProjectId = "other"; return { success: true }; },
    });
    if (reason === "abort") await assert.rejects(page.execute(), { name: "AbortError" });
    else assert.equal((await page.execute()).status, "error");
    assert.deepEqual(started, ["upstream"]);
  }
});

test("cycles and incompatible defaults fail without starting generation", async () => {
  let count = 0;
  const cycle = await fixture([{ id: "a" }, { id: "b" }], {
    edges: [{ source: "a", target: "b" }, { source: "b", target: "a" }],
    runNode: async () => { count++; return { success: true }; },
  });
  assert.equal((await cycle.execute()).status, "error");
  const invalid = await fixture([{ id: "invalid" }], {
    config: { assistantImageModelId: "general/disabled" },
    resolveModel: () => ({ error: "model unavailable" }),
    runNode: async () => { count++; return { success: true }; },
  });
  assert.equal((await invalid.execute()).status, "error");
  assert.equal(count, 0);
});

test("existing project/workflow defaults and serial non-image execution are retained", async () => {
  const calls = [], release = [];
  const { execute, state } = await fixture([
    { id: "one", data: { type: "ai-video", workflowId: "wf", provider: "workflow-api" } },
    { id: "two", data: { type: "ai-video" } },
  ], { runNode: (...args) => { calls.push(args); return new Promise(resolve => release.push(() => resolve({ success: true }))); } });
  state.projects = [{ id: "p", settings: { defaultModels: { video: "general/project" } } }];
  const task = execute();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, [["one"]]);
  release[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, [["one"], ["two"]]);
  release[1]();
  assert.equal((await task).status, "success");
});

test("direct media generation uses the assistant default and keeps explicit requests and routing fallback", () => {
  const state = {
    config: { assistantImageModelId: "general/selected" },
    projects: [{ id: "p", settings: { defaultModels: { image: "general/project" }, modelAutoRouting: true } }],
    workflows: [],
  };
  const body = source.slice(source.indexOf("function Ua("), source.indexOf("function Wa("));
  const resolve = new Function("w", "resolveCanvasAssistantModelId", "Xt", `${body};return Ua;`)(
    { getState: () => state }, resolveCanvasAssistantModelId, () => [{ value: "general/routed", mediaKind: "image", label: "draw" }],
  );
  const context = { projectId: "p", mode: "autonomous" };
  assert.equal(resolve({ kind: "image", prompt: "draw" }, context).modelRef, "general/selected");
  assert.equal(resolve({ kind: "image", prompt: "draw", modelRef: "general/explicit" }, context).modelRef, "general/explicit");
  delete state.config.assistantImageModelId;
  assert.equal(resolve({ kind: "image", prompt: "draw" }, context).modelRef, "general/routed");
  state.projects[0].settings.modelAutoRouting = false;
  assert.equal(resolve({ kind: "image", prompt: "draw" }, context).modelRef, "general/project");
});

test("app state tells the assistant which catalog model is the current default", () => {
  const body = source.slice(source.indexOf("function Hi("), source.indexOf("function Ui("));
  const list = new Function("$t", "gn", "Xt", "resolveCanvasAssistantModelId", `${body};return Hi;`)(
    () => [], () => true, () => [{ value: "general/chosen", label: "Chosen", mediaKind: "image", provider: "general", description: "image model" }], resolveCanvasAssistantModelId,
  );
  const models = list({ config: { assistantImageModelId: "general/chosen" }, workflows: [] });
  assert.match(models[0].description, /AI 助手当前默认模型/);
  assert.equal(models[0].id, "general/chosen");
});

test("conversation selection is resolved before computing model-specific video defaults", () => {
  const state = {
    config: { assistantVideoModelId: "general/selected" },
    agentTasks: [{ id: "task", goal: "生成视频" }], workflows: [],
    projects: [{ id: "p", settings: { generation: { videoAspectRatio: "16:9", videoResolution: "720p", videoDuration: 5 } } }],
  };
  const body = source.slice(source.indexOf("function Ua("), source.indexOf("function Wa("));
  const mention = source.slice(source.indexOf("function di("), source.indexOf("function fi("));
  const mentionPattern = source.slice(source.indexOf("oi=/"), source.indexOf(",si={", source.indexOf("oi=/")));
  const resolve = new Function("w", "resolveCanvasAssistantModelId", "vn", `const ${mentionPattern};${mention};${body};return Ua;`)(
    { getState: () => state }, resolveCanvasAssistantModelId, id => ({ provider: id.startsWith("general/") ? "general" : "builtin" }),
  );
  const context = { projectId: "p", taskId: "task", mode: "collaborative" };
  const selected = resolve({ kind: "video", modelRef: "builtin/guessed" }, context);
  assert.equal(selected.modelRef, "general/selected");
  assert.equal(selected.resolution, undefined);
  state.agentTasks[0].goal = "生成视频 @model{builtin/explicit|指定模型}";
  const explicit = resolve({ kind: "video" }, context);
  assert.equal(explicit.modelRef, "builtin/explicit");
  assert.equal(explicit.resolution, "720p");
  assert.equal(resolve({ kind: "video", resolution: "1080p" }, context).resolution, "1080p");
});

test("an already selected conversation model survives approval preparation without a model picker", () => {
  const executor = readFileSync(new URL("../ai-canvas-runtime/assets/agentRoundExecutor-D3Qh0nGj.js", import.meta.url), "utf8");
  const body = executor.slice(executor.indexOf("function pn("), executor.indexOf("function mn("));
  const state = { config: { assistantImageModelId: "general/image-choice", assistantVideoModelId: "general/video-choice" } };
  const prepare = new Function("S", "resolveCanvasAssistantModelId", `${body};return pn;`)(
    { getState: () => state }, resolveCanvasAssistantModelId,
  );
  for (const kind of ["image", "video"]) {
    for (const mode of ["collaborative", "autonomous"]) {
      const prepared = { definition: { id: "media_generate", effect: "media_generation" }, input: { kind, modelRef: `general/${kind}-choice`, prompt: "生成素材", deliveryMode: "chat" } };
      const result = prepare(prepared, "帮我生成素材", mode);
      assert.equal(result.prepared.input.modelRef, prepared.input.modelRef);
      assert.equal(result.inputRequest, undefined, "a checked model must not open another model picker");
    }
  }
  const unspecified = { definition: { id: "media_generate", effect: "media_generation" }, input: { kind: "image", modelRef: "general/model-invented-by-ai" } };
  for (const mode of ["collaborative", "autonomous"]) {
    const selected = prepare(unspecified, "生成图片", mode);
    assert.equal(selected.inputRequest, undefined);
    assert.equal(selected.prepared.input.modelRef, "general/image-choice");
    const explicit = prepare(unspecified, "生成图片 @model{general/explicit|指定模型}", mode);
    assert.equal(explicit.inputRequest, undefined);
    assert.equal(explicit.prepared.input.modelRef, "general/explicit");
  }
  state.config = {};
  assert.equal(prepare({ ...unspecified, input: { kind: "image" } }, "生成图片", "collaborative").inputRequest?.kind, "media_model");
});

test("selected conversation models still pass through the real media authorization checks", () => {
  const start = source.indexOf("resolveInput:Ua,authorize:") + "resolveInput:Ua,authorize:".length;
  const body = source.slice(start, source.indexOf(",summarizeInput:", start));
  const state = {
    config: { generalModels: [{ id: "selected", modelId: "provider-model", providerConfigId: "backend" }], providers: { backend: { baseUrl: "https://example.invalid" } } },
    agentTasks: [], workflows: [], currentProjectId: "p",
  };
  const authorize = new Function("w", "vn", `return ${body};`)(
    { getState: () => state }, id => id === "general/selected" ? { value: id, provider: "general", mediaKind: "image", label: "Selected" } : undefined,
  );
  const context = { projectId: "p", taskId: "task" };
  const input = { kind: "image", modelRef: "general/selected", deliveryMode: "canvas" };
  assert.equal(authorize(context, input).allowed, true);
  assert.equal(authorize(context, { ...input, modelRef: "general/unavailable" }).allowed, false);
  assert.equal(authorize(context, { ...input, kind: "video" }).allowed, false);
  state.config.providers = {};
  assert.equal(authorize(context, input).allowed, false);
});
