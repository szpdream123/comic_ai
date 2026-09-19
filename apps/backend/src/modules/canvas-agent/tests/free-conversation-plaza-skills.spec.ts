import assert from "node:assert/strict";
import test from "node:test";
import { CanvasAgentContextService } from "../canvas-agent-context.service.ts";
import { __canvasAgentExecutorTestUtils } from "../canvas-agent-executor.ts";

const actor = { ownerUserId: "user-1", actorTeamMemberId: null, capabilities: new Set<string>() };
const messageInput = {
  modelInput: { protocol: {}, context: {} }, modelCapabilities: {},
  canvasId: "canvas-1", conversationId: "conversation-1", actor,
  capabilityProfile: "media_generation_only" as const,
};

test("explicit plaza selections stop when unavailable, empty, or failing to load", async () => {
  for (const resolvePlazaSkill of [
    undefined,
    async () => null,
    async () => ({ id: "selected", title: "导演", content: " " }),
    async () => { throw new Error("private database details"); },
  ]) {
    await assert.rejects(__canvasAgentExecutorTestUtils.buildCanvasAgentModelMessages({
      ...messageInput,
      context: { messages: [{ role: "user", content: { text: "创作", plazaSkillIds: ["selected"] } }] },
      resolvePlazaSkill,
    }), /所选技能暂时无法加载/);
  }
});

test("unrecognized slash tokens keep their existing fallback", async () => {
  const messages = await __canvasAgentExecutorTestUtils.buildCanvasAgentModelMessages({
    ...messageInput,
    context: { messages: [{ role: "user", content: { text: "/unknown 写故事" } }] },
    resolvePlazaSkill: async () => null,
  });
  assert.doesNotMatch(String(messages[0].content), /Plaza skill/);
});

async function contextForTask(contents: Record<string, unknown>[], latest: Record<string, unknown> | null = { text: "蓝色" }) {
  const service = new CanvasAgentContextService({
    db: { async query(sql: string, params: unknown[] = []) {
      if (sql.includes("SELECT summary_json")) return { rows: [{ summary_json: {} }] };
      if (sql.includes("FROM canvas_agent_messages") && sql.includes("task_id=$1")) {
        assert.deepEqual(params, ["current-task", "conversation-1"]);
        assert.match(sql, /conversation_id=\$2/);
        return { rows: contents.map((content_json, index) => ({ content_json, sequence: 200 - index })) };
      }
      if (sql.includes("FROM canvas_agent_messages")) return { rows: latest
        ? [{ role: "user", content_json: latest, sequence: 200 }]
        : Array.from({ length: 9 }, (_, index) => ({ role: "tool", content_json: { toolId: "creative.read", output: {} }, sequence: 209 - index })) };
      if (sql.includes("SELECT id FROM canvas_agent_conversations")) return { rows: [{ id: "conversation-1" }] };
      if (sql.includes("canvas_agent_file_grants")) return { rows: [] };
      throw new Error(`unexpected_query:${sql}`);
    } } as never,
    maxMessages: 8,
    loadCanvasContext: async () => { throw new Error("canvas must not load"); },
  });
  return service.build({ canvasId: "canvas-1", conversationId: "conversation-1", taskId: "current-task", actor, capabilityProfile: "media_generation_only" });
}

test("clarification retains newest same-task plaza selection outside retained conversation", async () => {
  const context = await contextForTask([
    { text: "蓝色" }, { text: "修改", plazaSkillIds: ["new"] }, { text: "开始", plazaSkillIds: ["old"] },
  ]);
  const resolved: string[] = [];
  const messages = await __canvasAgentExecutorTestUtils.buildCanvasAgentModelMessages({
    ...messageInput, context,
    resolvePlazaSkill: async ({ skillId }) => {
      resolved.push(String(skillId));
      return { id: String(skillId), title: "导演", content: "保留完整执行规则" };
    },
  });
  assert.deepEqual(resolved, ["new"]);
  assert.match(String(messages[0].content), /保留完整执行规则/);
});

test("same-task skill references in text survive a clarification", async () => {
  const context = await contextForTask([{ text: "蓝色" }, { text: "@skill{selected|导演} 创作" }]);
  assert.deepEqual(context.messages.at(-1)?.content.plazaSkillIds, ["selected"]);
});

test("selected skill survives when recent tool messages evict every user message", async () => {
  const context = await contextForTask([{ text: "蓝色" }, { text: "开始", plazaSkillIds: ["selected"] }], null);
  const user = context.messages.find(message => message.role === "user");
  assert.deepEqual(user?.content.plazaSkillIds, ["selected"]);
  assert.equal(user?.content.text, "蓝色");
  assert.equal(context.messages.at(-1)?.role, "tool");
  assert.equal("truncated" in context && context.truncated, true);
});

test("explicit empty selection stays cleared on the latest user message", async () => {
  const latest = { text: "新的创作", plazaSkillIds: [] };
  const context = await contextForTask([latest, { text: "开始", plazaSkillIds: ["old"] }], latest);
  assert.deepEqual(context.messages.at(-1)?.content.plazaSkillIds, []);
});

test("new tasks and explicit clear or built-in selection do not resurrect old plaza skills", async () => {
  for (const contents of [
    [{ text: "蓝色" }],
    [{ text: "蓝色" }, { text: "换技能", plazaSkillIds: [] }, { text: "开始", plazaSkillIds: ["old"] }],
    [{ text: "蓝色" }, { text: "/storyboard 新任务" }, { text: "开始", plazaSkillIds: ["old"] }],
    [{ text: "蓝色" }, { text: "/另一个技能 新任务" }, { text: "开始", plazaSkillIds: ["old"] }],
  ]) {
    const context = await contextForTask(contents);
    assert.equal(context.messages.at(-1)?.content.plazaSkillIds, undefined);
  }
});
