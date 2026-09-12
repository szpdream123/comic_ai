import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { CanvasAgentToolRegistry, type CanvasAgentToolExecutionContext } from "../canvas-agent-tool.registry.ts";
import { freeConversationSkillInstructions, registerFreeConversationTools } from "../free-conversation-tools.ts";

const expectedSkills = [
  ["character-design", "角色设计"],
  ["scene-design", "场景设计"],
  ["series-images", "系列图片"],
  ["poster-design", "海报设计"],
  ["story-development", "故事创作"],
  ["storyboard", "分镜设计"],
  ["image-to-video", "图片转视频"],
  ["short-video", "短视频创作"],
] as const;

const scope: CanvasAgentToolExecutionContext = {
  canvasId: "canvas-1", conversationId: "conversation-1", agentTaskId: "task-1",
  agentStepId: "step-1", callId: "call-1", capabilityProfile: "media_generation_only",
  actor: { ownerUserId: "owner-1", actorTeamMemberId: null, capabilities: new Set(["canvas:run"]) },
};

test("the model registry advertises exactly eight trusted creative skills", () => {
  const registry = new CanvasAgentToolRegistry();
  registerFreeConversationTools(registry, { db: {} as never });
  const tool = registry.listForModel().find(tool => tool.id === "skill.load");
  assert.deepEqual(tool?.inputSchema.properties?.skillId.enum, expectedSkills.map(([id]) => id));
  for (const invalidId of ["arbitrary-script", "constructor", "__proto__", "scene-design-extra"]) {
    assert.throws(() => registry.validate("skill.load", { skillId: invalidId }), /input_invalid/);
    assert.equal(freeConversationSkillInstructions(`/${invalidId}`), "");
  }
});

test("each built-in slash command selects that workflow over a saved skill", () => {
  for (const [id, title] of expectedSkills) {
    const selected = freeConversationSkillInstructions(`/${id} 创作请求`, "character-design");
    assert.ok(selected.startsWith(`Built-in skill ${id} (${title}):`));
    assert.equal(selected, freeConversationSkillInstructions("继续", id));
    assert.equal(freeConversationSkillInstructions(`文本中 /${id}`), "");
    assert.equal(freeConversationSkillInstructions(`/${id}-extra`), "");
  }
});

test("skill.load activates every workflow in scoped durable state without creating media", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`CREATE TABLE canvas_agent_conversations (
    id text PRIMARY KEY, canvas_id text, owner_user_id text, actor_team_member_id text,
    summary_json jsonb NOT NULL DEFAULT '{}', deleted_at timestamptz, updated_at timestamptz);
    INSERT INTO canvas_agent_conversations (id,canvas_id,owner_user_id,summary_json)
    VALUES ('conversation-1','canvas-1','owner-1','{"existing":"preserved","creative":{"goal":"同一角色","documents":[]}}');`);
  const registry = new CanvasAgentToolRegistry();
  registerFreeConversationTools(registry, { db });
  for (const [index, [skillId, title]] of expectedSkills.entries()) {
    const result = await registry.execute("skill.load", { skillId }, { ...scope, agentStepId: `step-${index}` });
    assert.equal(result.status, "succeeded");
    assert.deepEqual(result.output.creative, { type: "skill", skillId, title });
    assert.equal(result.output.instructions, freeConversationSkillInstructions(`/${skillId}`));
    assert.equal(result.generationTaskId, undefined);
    const state = (await registry.execute("creative.read", {}, scope)).output.state;
    assert.deepEqual(state, { goal: "同一角色", documents: [], skillId, revision: index + 1 });
  }
  for (const context of [
    { ...scope, conversationId: "other-conversation" },
    { ...scope, actor: { ...scope.actor, ownerUserId: "other-owner" } },
    { ...scope, actor: { ...scope.actor, actorTeamMemberId: "other-member" } },
  ]) {
    await assert.rejects(registry.execute("skill.load", { skillId: "scene-design" }, context), /conversation_not_found/);
  }
  await assert.rejects(registry.execute("skill.load", { skillId: "scene-design" }, { ...scope, capabilityProfile: "canvas" }), /not_allowed/);
  await assert.rejects(registry.execute("skill.load", { skillId: "scene-design" }, { ...scope, actor: { ...scope.actor, capabilities: new Set() } }), /forbidden/);
  await assert.rejects(registry.execute("skill.load", { skillId: "untrusted" }, scope), /input_invalid/);
  const stored = await db.query<{ summary_json: { existing: string; creative: { skillId: string; revision: number } } }>("SELECT summary_json FROM canvas_agent_conversations");
  assert.equal(stored.rows[0].summary_json.existing, "preserved");
  assert.equal(stored.rows[0].summary_json.creative.skillId, "short-video");
  assert.equal(stored.rows[0].summary_json.creative.revision, 8, "rejected loads cannot mutate the active skill");
});
