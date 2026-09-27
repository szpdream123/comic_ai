import assert from "node:assert/strict";
import { it } from "node:test";
import { createPromptSimplificationController, canSimplifyPrompt, withPromptSimplificationLoading } from "../src/features/production-workbench/episode-prompt-simplification.js";

const model = { modelCode: "short", mediaType: "image", parameterSchema: { prompt: { maxLength: 3 } } };
function setup(overrides = {}) {
  let snapshot = { scope: "episode:storyboard:one:image", episodeId: "episode", model, prompt: "原始长提示词" };
  const originals = {};
  const calls = [];
  const controller = createPromptSimplificationController({
    getSnapshot: () => snapshot,
    request: async (...args) => { calls.push(args); return { prompt: "短稿" }; },
    preview: async () => true,
    apply: (prompt) => { snapshot = { ...snapshot, prompt }; },
    getOriginal: (scope) => originals[scope],
    saveOriginal: (scope, prompt) => { originals[scope] = prompt; },
    notify: () => {}, changed: () => {},
    ...overrides,
  });
  return { controller, calls, read: () => snapshot, change: (patch) => { snapshot = { ...snapshot, ...patch }; controller.observe(); } };
}

it("only an explicit request followed by acceptance changes the prompt; original can be restored", async () => {
  const state = setup();
  state.controller.observe();
  assert.equal(state.calls.length, 0);
  await state.controller.start();
  assert.equal(state.read().prompt, "短稿");
  assert.equal(state.calls.length, 1);
  state.controller.restore();
  assert.equal(state.read().prompt, "原始长提示词");
});

it("expires the previous original when a consumed draft is cleared and a new draft is simplified", async () => {
  const state = setup();
  await state.controller.start();
  state.change({ prompt: "" });
  assert.equal(state.controller.restore(), false);
  state.change({ prompt: "全新独立的长提示词" });
  await state.controller.start();
  assert.equal(state.read().prompt, "短稿");
  assert.equal(state.controller.restore(), true);
  assert.equal(state.read().prompt, "全新独立的长提示词");
});

it("retains the original through manual edits to the adopted suggestion", async () => {
  const state = setup();
  await state.controller.start();
  state.change({ prompt: "继续手动调整精简稿" });
  await state.controller.start();
  assert.equal(state.controller.restore(), true);
  assert.equal(state.read().prompt, "原始长提示词");
});

it("keeps the first original across repeated simplification and scope switches without edits", async () => {
  let requests = 0;
  const state = setup({ request: async () => ({ prompt: ++requests === 1 ? "短稿" : "短" }) });
  await state.controller.start();
  state.change({ scope: "episode:asset:another:image", prompt: "别的素材草稿" });
  assert.equal(state.controller.restore(), false);
  state.change({ scope: "episode:storyboard:one:image", prompt: "短稿",
    model: { ...model, parameterSchema: { prompt: { maxLength: 1 } } } });
  await state.controller.start();
  assert.equal(state.read().prompt, "短");
  assert.equal(state.controller.restore(), true);
  assert.equal(state.read().prompt, "原始长提示词");
});

it("expires persisted originals when the observed draft is cleared", () => {
  let snapshot = { scope: "saved", model, prompt: "短稿" };
  let original = "之前保存的长提示词";
  const controller = createPromptSimplificationController({
    getSnapshot: () => snapshot,
    getOriginal: () => original,
    saveOriginal: (_scope, prompt) => { original = prompt; },
    apply: (prompt) => { snapshot = { ...snapshot, prompt }; },
    changed: () => {}, notify: () => {},
  });
  controller.observe();
  snapshot = { ...snapshot, prompt: "" };
  assert.equal(controller.restore(), false);
  assert.equal(snapshot.prompt, "");
  assert.equal(original, undefined);
});

it("cancel and failures preserve the input and failed request retries reuse the key", async () => {
  const canceled = setup({ preview: async () => false });
  await canceled.controller.start();
  assert.equal(canceled.read().prompt, "原始长提示词");
  const keys = [];
  const failed = setup({ request: async (_episode, _body, options) => { keys.push(options.idempotencyKey); throw new Error("offline"); } });
  await failed.controller.start();
  await failed.controller.start();
  assert.equal(failed.read().prompt, "原始长提示词");
  assert.equal(keys[0], keys[1]);
});

it("ignores late results after input, model or scope changes and blocks duplicate clicks", async () => {
  for (const patch of [{ prompt: "新内容" }, { model: { ...model, modelCode: "another" } }, { scope: "episode:storyboard:two:image" }]) {
    let finish;
    let requests = 0;
    let previews = 0;
    const state = setup({ request: () => { requests += 1; return new Promise((resolve) => { finish = resolve; }); }, preview: async () => { previews += 1; return true; } });
    const pending = state.controller.start();
    await state.controller.start();
    assert.equal(requests, 1);
    state.change(patch);
    finish({ prompt: "短稿" });
    await pending;
    assert.equal(previews, 0);
    assert.equal(state.read().prompt, patch.prompt ?? "原始长提示词");
  }
});

it("confirmation also checks staleness and restores only the current input scope", async () => {
  let accept;
  const state = setup({ preview: () => new Promise((resolve) => { accept = resolve; }) });
  const pending = state.controller.start();
  await Promise.resolve();
  state.change({ scope: "episode:asset:one:image" });
  accept(true);
  await pending;
  assert.equal(state.read().prompt, "原始长提示词");
  assert.equal(state.controller.restore(), false);
});

it("offers simplification only for actual measurable overflow, never tokens or lip sync", () => {
  assert.equal(canSimplifyPrompt({ model, prompt: "1234" }), true);
  assert.equal(canSimplifyPrompt({ model, prompt: "123" }), false);
  assert.equal(canSimplifyPrompt({ model, prompt: "1234", mediaMode: "lip-sync" }), false);
  assert.equal(canSimplifyPrompt({ model: { ...model, parameterSchema: { prompt: { maxLength: 3, limitUnit: "tokens" } } }, prompt: "1234" }), false);
  assert.equal(canSimplifyPrompt({ model: { ...model, parameterSchema: { prompt: { maxLength: 3, limitUnit: "bytes" } } }, prompt: "中文" }), true);
});

it("starts a new attempt after a definitive 400 failure but retains the key for pending 409", async () => {
  for (const status of [400, 409]) {
    const keys = [];
    const state = setup({ request: async (_episode, _body, options) => {
      keys.push(options.idempotencyKey);
      throw Object.assign(new Error("failed"), { status });
    } });
    await state.controller.start();
    await state.controller.start();
    assert.equal(keys[0] === keys[1], status === 409);
  }
});

it("preserves rich editor mention markers exactly when adopting a preview", async () => {
  const state = setup({ request: async () => ({ prompt: "【@主角】回头" }) });
  await state.controller.start();
  assert.equal(state.read().prompt, "【@主角】回头");
});

it("keeps a busy dialog visible until the request settles and cleans it up on success or failure", async () => {
  for (const fails of [false, true]) {
    let mounted;
    let finish;
    let focusRestored = false;
    const document = {
      activeElement: { isConnected: true, focus() { focusRestored = true; } },
      body: { append(node) { mounted = node; } },
      createElement() { return {
        children: [], attributes: {}, listeners: {}, open: false,
        setAttribute(key, value) { this.attributes[key] = value; },
        append(...nodes) { this.children.push(...nodes); },
        addEventListener(type, listener) { this.listeners[type] = listener; },
        showModal() { this.open = true; }, close() { this.open = false; },
        remove() { mounted = null; },
      }; },
    };
    const pending = withPromptSimplificationLoading(() => new Promise((resolve, reject) => {
      finish = () => fails ? reject(new Error("offline")) : resolve({ prompt: "短稿" });
    }), document);
    assert.equal(mounted.open, true);
    assert.equal(mounted.attributes["aria-busy"], "true");
    assert.ok(mounted.children.some((node) => node.attributes.role === "status"));
    assert.equal(focusRestored, false);
    finish();
    if (fails) await assert.rejects(pending, /offline/);
    else assert.deepEqual(await pending, { prompt: "短稿" });
    assert.equal(mounted, null);
    assert.equal(focusRestored, true);
  }
});
