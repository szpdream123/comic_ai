import assert from "node:assert/strict";
import test from "node:test";
import { createCanvasAgentController, renderCanvasAgentPanel } from "../src/features/new-canvas/canvas-agent-panel.js";

function fixture(overrides = {}, surface = { querySelector: () => null }) {
  const sent = [];
  const calls = [];
  const ui = { canvasAgentCapabilityProfile: "media_generation_only", canvasAgent: {
    promptDraft: "雨后的校园", modelCode: "text-pro", modelsStatus: "ready",
    models: [{ modelCode: "text-pro", modelLabel: "创作助手" }], generationModelsStatus: "ready",
  } };
  const api = {
    async getSkills() { calls.push("catalog"); return { items: [{ id: "director", title: "短片导演", summary: "先写分镜，再制作短片", slug: "director" }] }; },
    async getMySkills() { calls.push("mine"); return { items: [{ id: "my-skill", title: "我的角色设计" }] }; },
    async getSkillFavorites() { calls.push("favorites"); return { items: [{ id: "saved", title: "收藏的海报" }] }; },
    async createFreeGenerationConversation() { return { conversation: { id: "c" } }; },
    async sendFreeGenerationMessage(id, input) { sent.push(input); return { task: { id: "t", status: "queued" } }; },
    ...overrides,
  };
  const controller = createCanvasAgentController({ surface, workbench: { ui, api } });
  const action = (agentAction, data = {}) => controller.handleAction({ dataset: { agentAction, ...data } });
  return { ui, calls, sent, controller, action };
}

test("free conversation skill library hides project-workflow skills", async () => {
  const f = fixture({
    async getSkills() {
      return {
        items: [
          { id: "director", title: "短片导演", summary: "先写分镜，再制作短片", category: "short-drama" },
          { id: "plaza-workflow", title: "项目工作流 Skill", summary: "一键转分镜", category: "project-workflow" },
        ],
      };
    },
  });
  try {
    await f.action("toggle-skill-library");
    const html = renderCanvasAgentPanel(f.ui);
    assert.match(html, /短片导演/);
    assert.doesNotMatch(html, /项目工作流 Skill/);
    assert.equal(f.ui.canvasAgent.skillOfficialItems.some((skill) => skill.id === "plaza-workflow"), false);
  } finally { f.controller.dispose(); }
});

test("free conversation loads real skills and sends selected IDs without altering the user's draft", async () => {
  const f = fixture();
  try {
    await f.action("toggle-skill-library");
    assert.deepEqual(f.calls.sort(), ["catalog", "favorites", "mine"]);
    assert.match(renderCanvasAgentPanel(f.ui), /短片导演/);
    await f.action("select-free-plaza-skill", { skillId: "director" });
    assert.equal(f.ui.canvasAgent.promptDraft, "雨后的校园");
    assert.deepEqual(f.ui.canvasAgent.promptPlazaSkillIds, ["director"]);
    assert.match(renderCanvasAgentPanel(f.ui), /移除技能：短片导演/);
    await f.action("send");
    assert.deepEqual(f.sent[0].message.plazaSkillIds, ["director"]);
    assert.equal(f.sent[0].message.text, "雨后的校园");
    assert.deepEqual(f.ui.canvasAgent.promptPlazaSkillIds, ["director"], "keep the visible Skill active for follow-up turns");
    f.ui.canvasAgent.status = "succeeded";
    f.ui.canvasAgent.promptDraft = "改成写实风格";
    await f.action("send");
    assert.deepEqual(f.sent[1].message.plazaSkillIds, ["director"]);
    f.ui.canvasAgent.status = "succeeded";
    await f.action("remove-free-plaza-skill", { skillId: "director" });
    f.ui.canvasAgent.promptDraft = "不再使用这个技能";
    await f.action("send");
    assert.deepEqual(f.sent[2].message.plazaSkillIds, [], "explicitly clear the Skill on the next turn");
  } finally { f.controller.dispose(); }
});

test("history hydration preserves Skill selection and removal made while loading", async () => {
  for (const remove of [false, true]) {
    let finishMessages;
    const f = fixture({ listFreeGenerationMessages: () => new Promise(resolve => { finishMessages = resolve; }) });
    try {
      await f.controller.loadAgentSkills();
      f.ui.canvasAgent.conversationId = "c";
      const loading = f.controller.loadMessages("c");
      await f.action("select-free-plaza-skill", { skillId: "director" });
      if (remove) await f.action("remove-free-plaza-skill", { skillId: "director" });
      finishMessages({ messages: [{ role: "user", content: { text: "旧需求", plazaSkillIds: ["saved"] } }] });
      await loading;
      assert.deepEqual(f.ui.canvasAgent.promptPlazaSkillIds, remove ? [] : ["director"]);
    } finally { f.controller.dispose(); }
  }
});

test("history restores Skills and caches separate selections for each conversation", async () => {
  const f = fixture({ async listFreeGenerationMessages(id) {
    return { messages: [{ role: "user", content: { text: "需求", plazaSkillIds: id === "a" ? ["director"] : [] } }] };
  } });
  try {
    await f.controller.loadAgentSkills();
    await f.action("select-agent-conversation", { conversationId: "a" });
    assert.deepEqual(f.ui.canvasAgent.promptPlazaSkillIds, ["director"]);
    await f.action("remove-free-plaza-skill", { skillId: "director" });
    await f.action("select-agent-conversation", { conversationId: "b" });
    assert.deepEqual(f.ui.canvasAgent.promptPlazaSkillIds, []);
    await f.action("select-free-plaza-skill", { skillId: "saved" });
    await f.action("select-agent-conversation", { conversationId: "a" });
    assert.deepEqual(f.ui.canvasAgent.promptPlazaSkillIds, []);
    await f.action("select-agent-conversation", { conversationId: "b" });
    assert.deepEqual(f.ui.canvasAgent.promptPlazaSkillIds, ["saved"]);
  } finally { f.controller.dispose(); }
});

test("returning to a conversation before its first history response still restores Skills", async () => {
  const requests = [];
  const f = fixture({ listFreeGenerationMessages: id => new Promise(resolve => { requests.push({ id, resolve }); }) });
  try {
    await f.controller.loadAgentSkills();
    const firstA = f.action("select-agent-conversation", { conversationId: "a" });
    const firstB = f.action("select-agent-conversation", { conversationId: "b" });
    const secondA = f.action("select-agent-conversation", { conversationId: "a" });
    assert.deepEqual(requests.map(request => request.id), ["a", "b", "a"]);
    requests[2].resolve({ messages: [{ role: "user", content: { text: "需求", plazaSkillIds: ["director"] } }] });
    await secondA;
    assert.deepEqual(f.ui.canvasAgent.promptPlazaSkillIds, ["director"]);
    requests[0].resolve({ messages: [{ role: "user", content: { text: "旧记录", plazaSkillIds: ["saved"] } }] });
    requests[1].resolve({ messages: [] });
    await Promise.all([firstA, firstB]);
    assert.deepEqual(f.ui.canvasAgent.promptPlazaSkillIds, ["director"], "stale loads must not replace the restored selection");
    f.ui.canvasAgent.promptDraft = "继续创作";
    await f.action("send");
    assert.deepEqual(f.sent[0].message.plazaSkillIds, ["director"]);
  } finally { f.controller.dispose(); }
});

test("Skill catalog loads later pages so search can find less popular Skills", async () => {
  const pages = [];
  const results = { innerHTML: "" };
  const f = fixture({ async getSkills({ page }) {
    pages.push(page);
    return { totalPages: 2, items: page === 1
      ? Array.from({ length: 50 }, (_, index) => ({ id: `skill-${index}`, title: `常用技能 ${index}` }))
      : [{ id: "rare", title: "罕见创作技能" }] };
  } }, { querySelector: selector => selector === "[data-skill-results]" ? results : null });
  try {
    await f.action("toggle-skill-library");
    assert.deepEqual(pages, [1, 2]);
    f.controller.handleInput({ dataset: { agentField: "skillQuery" }, value: "罕见" });
    assert.match(results.innerHTML, /罕见创作技能/);
    await f.action("select-free-plaza-skill", { skillId: "rare" });
    assert.deepEqual(f.ui.canvasAgent.promptPlazaSkillIds, ["rare"]);
  } finally { f.controller.dispose(); }
});

test("catalog completion updates open results without replacing the focused search panel", async () => {
  let finishCatalog;
  let panelReads = 0;
  const results = { innerHTML: "" };
  const f = fixture({ getSkills: () => new Promise(resolve => { finishCatalog = resolve; }) }, {
    querySelector(selector) {
      if (selector === "[data-canvas-agent-panel]") panelReads += 1;
      return selector === "[data-skill-results]" ? results : null;
    },
  });
  try {
    f.ui.canvasAgent.skillLibraryOpen = true;
    const loading = f.controller.loadAgentSkills();
    f.controller.handleInput({ dataset: { agentField: "skillQuery" }, value: "导演" });
    const readsBeforeCompletion = panelReads;
    finishCatalog({ items: [{ id: "director", title: "短片导演" }] });
    await loading;
    assert.match(results.innerHTML, /短片导演/);
    assert.equal(panelReads, readsBeforeCompletion, "the open search input must not be replaced on completion");
    assert.equal(f.ui.canvasAgent.skillQuery, "导演");
  } finally { f.controller.dispose(); }
});

test("Skill picker supports keyboard selection and Escape", async () => {
  let focused = "";
  let clicked = 0;
  const choices = ["first", "second"].map(id => ({ focus() { focused = id; }, click() { clicked += 1; } }));
  const f = fixture({}, {
    querySelector: selector => selector === "[data-skill-results] button[data-skill-id]" ? choices[0] : null,
    querySelectorAll: () => choices,
  });
  try {
    f.ui.canvasAgent.skillLibraryOpen = true;
    const search = { dataset: { agentField: "skillQuery" } };
    const key = (value, target) => f.controller.handleKeydown({ key: value, preventDefault() {} }, target);
    assert.equal(key("ArrowDown", search), true);
    assert.equal(focused, "first");
    key("ArrowUp", choices[0]);
    assert.equal(focused, "second");
    key("Enter", search);
    assert.equal(clicked, 1);
    key("Escape", search);
    assert.equal(f.ui.canvasAgent.skillLibraryOpen, false);
  } finally { f.controller.dispose(); }
});

test("slash searches show callable Skills instead of filtering on the command prefix", async () => {
  const results = { innerHTML: "" };
  const f = fixture({}, { querySelector: selector => selector === "[data-skill-results]" ? results : null });
  try {
    await f.action("toggle-skill-library");
    for (const query of ["/", " / ", "//"]) {
      f.controller.handleInput({ dataset: { agentField: "skillQuery" }, value: query });
      assert.match(results.innerHTML, /data-skill-id="director"/, `${query} must list catalog Skills`);
      assert.match(results.innerHTML, /data-skill-id="storyboard"/, `${query} must retain built-in Skills`);
      assert.match(renderCanvasAgentPanel(f.ui), /data-skill-id="director"/, "rerendering must preserve slash search results");
    }
    f.controller.handleInput({ dataset: { agentField: "skillQuery" }, value: "/短片导演" });
    assert.match(results.innerHTML, /data-skill-id="director"/);
    assert.doesNotMatch(results.innerHTML, /data-skill-id="storyboard"/);
    await f.action("select-free-plaza-skill", { skillId: "director" });
    assert.equal(f.ui.canvasAgent.promptDraft, "雨后的校园");
    await f.action("send");
    assert.deepEqual(f.sent[0].message.plazaSkillIds, ["director"]);
  } finally { f.controller.dispose(); }
});

test("slash search works across favorites, personal Skills, and built-ins", async () => {
  const results = { innerHTML: "" };
  const f = fixture({}, { querySelector: selector => selector === "[data-skill-results]" ? results : null });
  try {
    await f.action("toggle-skill-library");
    for (const [source, query, id] of [["library", "/收藏", "saved"], ["mine", "/我的角色", "my-skill"], ["official", "/分镜", "storyboard"]]) {
      await f.action("set-agent-skill-source", { skillSource: source });
      f.controller.handleInput({ dataset: { agentField: "skillQuery" }, value: query });
      assert.match(results.innerHTML, new RegExp(`data-skill-id="${id}"`));
    }
    f.controller.handleInput({ dataset: { agentField: "skillQuery" }, value: "/没有这个技能" });
    assert.match(results.innerHTML, /没有匹配/);
    assert.doesNotMatch(results.innerHTML, /data-skill-id=/);
  } finally { f.controller.dispose(); }
});

test("committing an unchanged Skill search on blur preserves the result being clicked", async () => {
  let resultButton;
  const results = { set innerHTML(markup) { resultButton = { markup }; } };
  const f = fixture({}, { querySelector: selector => selector === "[data-skill-results]" ? results : null });
  try {
    await f.action("toggle-skill-library");
    const input = { dataset: { agentField: "skillQuery" }, value: "/导演" };
    f.controller.handleInput(input);
    const pointerDownTarget = resultButton;
    // The host forwards both input and change. Focusing a result commits the search
    // before mouseup; replacing its DOM here prevents the pending click entirely.
    f.controller.handleInput(input);
    assert.equal(resultButton, pointerDownTarget, "blur must not detach the pending click target");
    input.value = "/不存在";
    f.controller.handleInput(input);
    assert.notEqual(resultButton, pointerDownTarget, "a changed query must still update results");
  } finally { f.controller.dispose(); }
});

test("interjections retain selected Skills and send explicit removal", async () => {
  const controls = [];
  const f = fixture({ async controlFreeGenerationTask(taskId, action, input) { controls.push({ action, input }); return {}; } });
  try {
    await f.controller.loadAgentSkills();
    await f.action("select-free-plaza-skill", { skillId: "director" });
    Object.assign(f.ui.canvasAgent, { conversationId: "c", taskId: "t", status: "running" });
    await f.action("interject-prompt");
    assert.deepEqual(controls[0].input.message.plazaSkillIds, ["director"]);
    assert.deepEqual(f.ui.canvasAgent.promptPlazaSkillIds, ["director"]);
    await f.action("remove-free-plaza-skill", { skillId: "director" });
    f.ui.canvasAgent.interjectionDraft = "继续";
    await f.action("interject");
    assert.deepEqual(controls[1].input.message.plazaSkillIds, []);
  } finally { f.controller.dispose(); }
});

test("skills use Agent mode, deduplicate selection and remove only the selected skill", async () => {
  const f = fixture();
  try {
    await f.action("toggle-skill-library");
    f.ui.canvasAgent.generationKind = "image";
    await f.action("select-free-plaza-skill", { skillId: "director" });
    await f.action("select-free-plaza-skill", { skillId: "director" });
    await f.action("select-free-plaza-skill", { skillId: "saved" });
    assert.equal(f.ui.canvasAgent.generationKind, "agent");
    assert.deepEqual(f.ui.canvasAgent.promptPlazaSkillIds, ["director", "saved"]);
    await f.action("remove-free-plaza-skill", { skillId: "director" });
    assert.deepEqual(f.ui.canvasAgent.promptPlazaSkillIds, ["saved"]);
    assert.equal(f.ui.canvasAgent.promptDraft, "雨后的校园");
    await f.action("select-free-plaza-skill", { skillId: "missing" });
    assert.deepEqual(f.ui.canvasAgent.promptPlazaSkillIds, ["saved"]);
  } finally { f.controller.dispose(); }
});

test("failed Skill submission preserves draft and selected IDs", async () => {
  const f = fixture({ async sendFreeGenerationMessage() { throw new Error("request failed"); } });
  try {
    await f.action("toggle-skill-library");
    await f.action("select-free-plaza-skill", { skillId: "director" });
    await f.action("send");
    assert.equal(f.ui.canvasAgent.promptDraft, "雨后的校园");
    assert.deepEqual(f.ui.canvasAgent.promptPlazaSkillIds, ["director"]);
    assert.ok(f.ui.canvasAgent.error);
  } finally { f.controller.dispose(); }
});

test("catalog failure keeps built-ins available and offers retry", async () => {
  let fail = true;
  const f = fixture({ async getSkills() { if (fail) throw new Error("catalog unavailable"); return { items: [{ id: "director", title: "短片导演" }] }; } });
  try {
    await f.action("toggle-skill-library");
    assert.match(renderCanvasAgentPanel(f.ui), /reload-free-plaza-skills/);
    assert.match(renderCanvasAgentPanel(f.ui), /data-skill-id="storyboard"/);
    fail = false;
    await f.action("reload-free-plaza-skills");
    assert.equal(f.ui.canvasAgent.skillStatus, "ready");
    assert.match(renderCanvasAgentPanel(f.ui), /短片导演/);
  } finally { f.controller.dispose(); }
});
