import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const asset = name => readFileSync(new URL(`../ai-canvas-runtime/assets/${name}`, import.meta.url), "utf8");
const main = asset("main-upstream-665b2cc.js");
const controller = asset("conversationExecutionController-CGzzIkBM.js");
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  const timers = new Map();
  let timerId = 0;
  const state = {
    agentTasks: [], messages: [], activeConversationId: "conversation", currentProjectId: "project",
    upsertAgentTask(task) { this.agentTasks = this.agentTasks.map(t => t.id === task.id ? task : t); },
    updateMessage(id, patch) { this.messages = this.messages.map(m => m.id === id ? { ...m, ...patch } : m); },
  };
  const sandbox = vm.createContext({
    $: { getState: () => state }, AbortController, DOMException, console,
    KT() {}, ZT() {}, Rm: new Set(["completed", "failed", "stopped"]),
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  vm.runInContext(main.slice(main.indexOf("var FT="), main.indexOf("var UT=")), sandbox);
  vm.runInContext(main.slice(main.indexOf("var QT="), main.indexOf("function gE(")), sandbox);
  vm.runInContext(controller.slice(controller.indexOf("function canAutoResumeAgentTask("), controller.indexOf("function scheduleAgentAutoResume(")), sandbox);
  const api = vm.runInContext("({schedule:RT, scheduled:zT, active:HT, run:iE, pause:aE, stop:oE, stopConversation:sE, stopProject:cE, resume:dE, transition:rE, wait:hE, approve:uE, autoResume:canAutoResumeAgentTask})", sandbox);
  const task = id => state.agentTasks.find(t => t.id === id);
  function add(id) {
    state.agentTasks.push({ id, projectId: "project", conversationId: "conversation", status: "queued", steps: [] });
    state.messages.push({ id: `${id}-message`, agentTaskId: id, role: "assistant", status: "queued", content: "" });
    return task(id);
  }
  function schedule(id, run) {
    add(id);
    return api.schedule({ taskId: id, conversationId: "conversation", onStart: () => state.updateMessage(`${id}-message`, { status: "streaming" }), run: () => api.run(id, run) });
  }
  function approval(id) {
    return schedule(id, async signal => {
      api.transition(id, "waiting_approval", { steps: [{ id: "step", status: "waiting_approval", approval: { id: `${id}-approval`, status: "pending" } }] });
      state.updateMessage(`${id}-message`, { status: "preview", content: "等待确认：生成媒体内容" });
      await api.wait(`${id}-approval`, signal);
      return "completed";
    });
  }
  return { api, timers, state, task, schedule, approval };
}

test("a follow-up releases a conversation blocked by approval without approving generation", async () => {
  const f = fixture(); let calls = 0;
  f.approval("video"); await tick();
  f.schedule("question", async () => { calls++; return "completed"; }); await tick();
  assert.equal(calls, 1);
  assert.equal(f.task("video").status, "paused");
  assert.equal(f.task("video").pausedReason, "followup_requested");
  assert.equal(f.task("video").steps[0].approval.status, "expired");
  assert.equal(f.api.approve("video-approval", { approved: true }), false);
  assert.equal(f.api.autoResume(f.task("video")), false);
  assert.equal(f.timers.size, 0);
});

test("messages queued before the old task reaches approval also get unblocked", async () => {
  const f = fixture(); let calls = 0;
  f.approval("video");
  f.schedule("question", async () => { calls++; return "completed"; }); await tick();
  assert.equal(calls, 1);
  assert.equal(f.task("video").pausedReason, "followup_requested");
});

test("unanswered approval pauses after ten minutes without automatic retries", async () => {
  const f = fixture(); f.approval("video"); await tick();
  const timer = [...f.timers.values()][0];
  assert.equal(timer?.delay, 600_000);
  timer.callback(); await tick();
  assert.equal(f.task("video").status, "paused");
  assert.equal(f.task("video").pausedReason, "approval_timeout");
  assert.equal(f.task("video").steps[0].approval.status, "expired");
  assert.equal(f.api.active("conversation"), undefined);
  assert.equal(f.api.autoResume(f.task("video")), false);
  assert.equal(f.timers.size, 0);
});

for (const action of ["pause", "stop"]) {
  test(`${action} removes a queued task so it cannot execute later`, async () => {
    const f = fixture(); let release, calls = 0;
    f.schedule("first", () => new Promise(resolve => { release = resolve; })); await tick();
    f.schedule("second", async () => { calls++; return "completed"; });
    f.api[action]("second");
    assert.equal(f.api.scheduled("second"), false);
    release("completed"); await tick();
    assert.equal(calls, 0);
    assert.equal(f.task("second").status, action === "pause" ? "paused" : "stopped");
  });
  test(`${action} before the scheduled microtask starts does not run the task`, async () => {
    const f = fixture(); let calls = 0;
    f.schedule("task", async () => { calls++; return "completed"; });
    f.api[action]("task"); await tick();
    assert.equal(calls, 0);
    assert.equal(f.task("task").status, action === "pause" ? "paused" : "stopped");
  });
}

test("ordinary running tasks remain serialized and complete in order", async () => {
  const f = fixture(); let release; const calls = [];
  f.schedule("first", () => new Promise(resolve => { calls.push("first"); release = resolve; })); await tick();
  f.schedule("second", async () => { calls.push("second"); return "completed"; }); await tick();
  assert.deepEqual(calls, ["first"]);
  release("completed"); await tick();
  assert.deepEqual(calls, ["first", "second"]);
});

test("an explicit approval completes normally and clears its timeout", async () => {
  const f = fixture(); f.approval("video"); await tick();
  assert.equal(f.api.approve("video-approval", { approved: true }), true);
  // The executor normally transitions back to running after approval.
  f.api.transition("video", "running"); await tick();
  assert.equal(f.task("video").status, "completed");
  assert.equal(f.timers.size, 0);
});

test("a message in a different conversation does not interrupt approval", async () => {
  const f = fixture(); f.approval("video"); await tick();
  let calls = 0;
  f.api.schedule({ taskId: "other", conversationId: "other-conversation", run: async () => { calls++; } });
  await tick();
  assert.equal(calls, 1);
  assert.equal(f.task("video").status, "waiting_approval");
  assert.equal(f.timers.size, 1);
  f.api.stop("video"); await tick();
  assert.equal(f.timers.size, 0);
});

test("paused approval is rendered as paused rather than preparing or waiting", () => {
  const chat = asset("ChatPanel-CEPa9giE.js");
  const labels = chat.slice(chat.indexOf("Ze={"), chat.indexOf(",Qe="));
  const fn = chat.slice(chat.indexOf("function tt("), chat.indexOf("function nt("));
  const label = vm.runInNewContext(`var ${labels}; ${fn}; tt`);
  for (const [reason, expected] of [["approval_timeout", "等待确认超时，已暂停"], ["followup_requested", "已暂停待确认操作，先处理新消息"]]) {
    assert.equal(label({ status: "paused", pausedReason: reason }, { status: "pending", title: "生成媒体内容" }, s => s), expected);
  }
});

test("page-recovered tasks require an explicit resume", () => {
  const f = fixture();
  assert.equal(f.api.autoResume({ status: "paused", pausedReason: "app_restarted" }), false);
});

for (const action of ["pause", "stop", "stopConversation", "stopProject"]) {
  test(`${action} expires approval controls and settles the assistant message`, async () => {
    const f = fixture(); f.approval("video"); await tick();
    f.api[action](action === "stopConversation" ? "conversation" : action === "stopProject" ? "project" : "video"); await tick();
    assert.equal(f.task("video").steps[0].approval.status, "expired");
    assert.equal(f.task("video").steps[0].status, "skipped");
    assert.equal(f.state.messages[0].status, "interrupted");
    assert.equal(f.state.messages[0].content.includes("等待确认"), false);
    assert.equal(f.api.approve("video-approval", { approved: true }), false);
  });
}

test("timeout settles preview and manual resume does not retain a pending approval step", async () => {
  const f = fixture(); f.approval("video"); await tick();
  [...f.timers.values()][0].callback(); await tick();
  assert.equal(f.state.messages[0].status, "interrupted");
  f.api.resume("video");
  assert.equal(f.task("video").currentStepId, undefined);
  await f.api.run("video", async () => "completed");
  assert.equal(f.task("video").steps.some(s => s.status === "pending" || s.status === "waiting_approval"), false);
});

for (const action of ["pause", "stop"]) {
  test(`${action} before the scheduled microtask also settles the streaming message`, async () => {
    const f = fixture(); f.schedule("task", async () => "completed");
    f.api[action]("task"); await tick();
    assert.equal(f.state.messages[0].status, "interrupted");
  });
}

test("failed media generation cannot automatically resume and repeat a paid operation", () => {
  assert.equal(fixture().api.autoResume({ status: "paused", pausedReason: "media_generation_failed" }), false);
});

test("a model request timeout pauses and frees the queue without an automatic retry", async () => {
  const f = fixture(); let calls = 0;
  f.schedule("timeout", async () => { throw Object.assign(Error("model timed out"), { code: "AGENT_MODEL_TIMEOUT" }); });
  f.schedule("followup", async () => { calls++; return "completed"; }); await tick();
  assert.equal(f.task("timeout").status, "paused");
  assert.equal(f.task("timeout").pausedReason, "model_request_timeout");
  assert.equal(f.api.autoResume(f.task("timeout")), false);
  assert.equal(calls, 1);
});

test("manual resume clears expired approval steps recovered from disk", () => {
  const f = fixture(); f.state.agentTasks.push({ id: "recovered", status: "paused", steps: [{ status: "pending", approval: { status: "expired" } }], currentStepId: "old" });
  f.api.resume("recovered");
  assert.equal(f.task("recovered").steps[0].status, "skipped");
  assert.equal(f.task("recovered").currentStepId, undefined);
});

test("manual resume clears pause placeholders before streaming the new answer", () => {
  const state = { agentTasks: [{ id: "task", conversationId: "c", projectId: "p" }], messages: [{ id: "m", status: "interrupted", content: "确认超时，任务已暂停，可手动继续" }], updateMessage(id, patch) { Object.assign(this.messages[0], patch); } };
  const source = controller.slice(controller.indexOf("function vp("), controller.indexOf("var agentAutoResumeAttempts"));
  const resume = new Function("w", "ce", "pe", "Gn", `${source};return vp;`)({ getState: () => state }, options => { options.onStart(); return { state: "started" }; }, () => {}, () => true);
  resume("task", "m", undefined, true);
  assert.equal(state.messages[0].status, "streaming");
  assert.equal(state.messages[0].content, "");
});
