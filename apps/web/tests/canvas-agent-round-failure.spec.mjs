import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../ai-canvas-runtime/assets/agentRoundExecutor-D3Qh0nGj.js", import.meta.url), "utf8");
const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const bind = (body, name, deps) => new Function(...Object.keys(deps), `${body};return ${name};`)(...Object.values(deps));

for (const failure of ["schema", "execution"]) {
  test(`media ${failure} failure pauses the round without another model request`, async () => {
    let task = { id: "task", projectId: "p", conversationId: "c", mode: "autonomous", goal: "generate video", steps: [], modelRounds: 0, toolCallCount: 0, budget: { maxParallelReadTools: 2 } };
    let requests = 0;
    const error = { callId: "call", toolId: "media_generate", status: "error", summary: "unsupported resolution" };
    const prepared = { definition: { id: "media_generate", title: "生成媒体内容", effect: "media_generation" }, input: { kind: "video" } };
    const state = { getCurrentRevision: () => 0 };
    const deps = {
      K() {}, J: () => task, S: { getState: () => state }, Y: (id, fn) => { task = fn(task); }, q: t => t.mode,
      Kt: () => [], nn: new WeakMap(), p: () => ({ exceeded: false }), foldSeriesReadTools: m => m,
      jt: () => ({ inputBudget: 100000 }), At: () => 0, oe: () => [], s() {}, l() {}, n() {},
      H: async ({ onEvent }) => { requests++; onEvent({ type: "tool.call.final", call: { callId: "call", toolId: "media_generate", input: { kind: "video" } } }); },
      filterRepeatedAgentReads: (t, calls) => calls,
      ae: () => failure === "schema" ? { ok: false, result: error } : { ok: true, prepared },
      pn: value => ({ prepared: value }), se: () => ({ outcome: "allow" }), on: () => "step", Z: s => s,
      Jt: () => "fingerprint", cn: () => undefined, an: (id, step) => task.steps.push(step),
      fn: async (items, limit, run) => { for (const item of items) await run(item); },
      dn: async () => ({ summary: error, modelContent: error.summary }),
    };
    const round = bind(extract("async function hn(", "export{"), "hn", deps);
    const result = await round({ taskId: "task", signal: new AbortController().signal, messages: [], fullText: "", totalToolResultChars: 0,
      transitionTask: (id, status, patch) => { task = { ...task, status, ...patch }; }, callbacks: {} });
    assert.equal(requests, 1);
    assert.equal(result.outcome, "paused");
    assert.equal(task.pausedReason, "media_generation_failed");
    assert.equal(task.errorMessage, "unsupported resolution");
  });
}

test("tool duration starts at execution and excludes time awaiting approval", async () => {
  let task = { mode: "collaborative", budget: {}, steps: [{ id: "step", approval: { status: "approved" }, toolCall: { startedAt: 1000 } }] };
  const deps = {
    K() {}, J: () => task, q: t => t.mode, ln: () => 0, se: () => ({ outcome: "require_approval" }),
    S: { getState: () => ({ currentProjectId: "p", getCurrentRevision: () => 1, historyIndex: 1 }) },
    X: (id, step, patch) => Object.assign(task.steps[0], patch), Jt: () => "fingerprint", Yt: () => undefined,
    s() {}, l() {}, n() {}, Z: s => s, $: value => value, Date: { now: () => 107100 },
  };
  const execute = bind(extract("async function dn(", "async function fn("), "dn", deps);
  await execute("task", { toolId: "media_generate", callId: "call" }, { input: {}, definition: { effect: "media_generation", execute: async () => ({ status: "success", summary: "ok", modelContent: "ok" }) } }, { projectId: "p", signal: new AbortController().signal }, task.steps[0]);
  assert.equal(task.steps[0].toolCall.startedAt, 107100);
  assert.equal(task.steps[0].toolCall.finishedAt - task.steps[0].toolCall.startedAt, 0);
});

test("approval rejects a selected model changed by input resolution", () => {
  const definition = { authorize: () => ({ allowed: true }) };
  const validate = bind(extract("function mn(", "async function compressLiveTaskContext("), "mn", {
    Z: s => s, ae: call => ({ ok: true, prepared: { definition, input: { ...call.input, modelRef: "general/changed-default" } } }),
  });
  const result = validate({ toolId: "media_generate", callId: "call" }, { definition, input: { kind: "video" } }, { kind: "media_model" }, { approved: true, inputValues: { modelRef: "general/approved" } }, { mode: "collaborative" });
  assert.equal(result.error?.status, "denied");
});
