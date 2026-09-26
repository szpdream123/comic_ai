import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../ai-canvas-runtime/assets/agentRoundExecutor-D3Qh0nGj.js", import.meta.url), "utf8");
const body = source.slice(source.indexOf("async function H("), source.indexOf("function Je("));

function fixture(stage = "fetch") {
  let timer, clearCount = 0, capturedSignal;
  const events = [], state = { setActiveRequestAbort(value) { this.activeRequestAbort = value; } };
  const stalled = signal => new Promise((resolve, reject) => {
    if (signal.aborted) reject(new DOMException("Aborted", "AbortError"));
    else signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
  const deps = {
    V: () => ({ usesConnectionProtocol: true, modelName: "test" }), S: { getState: () => state },
    Ge: async ({ messages }) => messages,
    O: ({ signal }) => { capturedSignal = signal; return { url: "https://example.invalid", init: { signal } }; },
    t: async (url, init) => stage === "fetch" ? stalled(init.signal) : {},
    Ne: async (response, { signal }) => stage === "stream" ? stalled(signal) : stage === "swallowed-abort" ? stalled(signal).catch(() => "partial") : "ok",
    qe: context => { assert.equal(context, "context"); return []; },
    AbortController, setTimeout: (callback, delay) => { timer = { callback, delay }; return 1; }, clearTimeout: () => clearCount++,
  };
  const request = new Function(...Object.keys(deps), `${body}; return H;`)(...Object.values(deps));
  const parent = new AbortController();
  const run = (options = { tools: [] }) => request({ messages: [], ...options, toolContextMessage: "context", signal: parent.signal, onEvent: event => events.push(event) });
  return { run, parent, events, state, get timer() { return timer; }, get clearCount() { return clearCount; }, get signal() { return capturedSignal; } };
}

for (const stage of ["fetch", "stream", "swallowed-abort"]) {
  test(`stalled model ${stage} is aborted after five minutes and releases its request handle`, async () => {
    const f = fixture(stage), promise = f.run();
    const rejected = assert.rejects(promise, error => error.code === "AGENT_MODEL_TIMEOUT");
    await new Promise(resolve => setImmediate(resolve));
    try { assert.equal(f.timer?.delay, 300000); }
    catch (error) { f.parent.abort(); await rejected.catch(() => {}); throw error; }
    f.timer.callback(); await rejected;
    assert.equal(f.signal.aborted, true);
    assert.equal(f.state.activeRequestAbort, null);
    assert.equal(f.clearCount, 1);
    assert.equal(f.events.find(e => e.type === "error")?.retryable, false);
  });
}

test("successful requests clear the deadline and an already-aborted parent never starts waiting", async () => {
  const success = fixture("success");
  assert.equal(await success.run(), "ok");
  assert.equal(success.clearCount, 1);
  const canceled = fixture(); canceled.parent.abort();
  const rejected = assert.rejects(canceled.run(), /取消/);
  // The captured signal is available after the request-preparation microtask.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(canceled.signal.aborted, true);
  await rejected;
});

test("ordinary chat without explicit tools still resolves the tool context", async () => {
  assert.equal(await fixture("success").run({}), "ok");
});
