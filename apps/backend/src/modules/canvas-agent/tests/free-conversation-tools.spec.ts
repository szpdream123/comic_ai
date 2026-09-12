import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { CanvasAgentContextService } from "../canvas-agent-context.service.ts";
import { CanvasAgentToolRegistry, type CanvasAgentToolExecutionContext } from "../canvas-agent-tool.registry.ts";
import { __canvasAgentExecutorTestUtils as executor } from "../canvas-agent-executor.ts";
import { registerFreeConversationTools, freeConversationSkillInstructions } from "../free-conversation-tools.ts";

const scope: CanvasAgentToolExecutionContext = {
  canvasId: "canvas-1", conversationId: "conversation-1", agentTaskId: "task-1",
  agentStepId: "step-1", callId: "call-1", capabilityProfile: "media_generation_only",
  actor: { ownerUserId: "owner-1", actorTeamMemberId: null, capabilities: new Set(["canvas:run"]) },
};

test("free creation tools persist scoped state, document versions and bounded trusted skills", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`CREATE TABLE canvas_agent_conversations (
    id text PRIMARY KEY, canvas_id text, owner_user_id text, actor_team_member_id text,
    summary_json jsonb NOT NULL DEFAULT '{}', deleted_at timestamptz, updated_at timestamptz);
    INSERT INTO canvas_agent_conversations (id,canvas_id,owner_user_id,summary_json)
    VALUES ('conversation-1','canvas-1','owner-1','{"existing":"preserved"}');`);
  const registry = new CanvasAgentToolRegistry();
  registerFreeConversationTools(registry, { db });
  const execute = (id: string, input: Record<string, unknown>, context = scope) => registry.execute(id, input, context);
  await assert.rejects(execute("skill.load", { skillId: "arbitrary-script" }), /invalid|unknown/);
  assert.equal(freeConversationSkillInstructions("ordinary text /series-images"), "");
  assert.match(freeConversationSkillInstructions("/series-images 同一人物三张图"), /series-images/);
  await execute("skill.load", { skillId: "series-images" });
  await execute("creative.plan", { title: "角色海报", goal: "同一角色三张图", constraints: ["蓝衣"], steps: [{ id: "a", title: "角色设定", status: "completed" }] });
  const first = (await execute("creative.document", { title: "角色设定", content: "蓝衣少年" })).output.creative as Record<string, unknown>;
  assert.equal(first.version, 1);
  const same = (await execute("creative.document", { title: "角色设定", content: "蓝衣少年" })).output.creative;
  assert.deepEqual(same, first, "replaying a step must not create another document/version");
  const second = (await execute("creative.document", { documentId: first.documentId, title: "角色设定", content: "蓝衣少年，短发" }, { ...scope, agentStepId: "step-2" })).output.creative as Record<string, unknown>;
  assert.equal(second.version, 2);
  await assert.rejects(execute("creative.document", { documentId: "missing", title: "无主文档", content: "内容" }, { ...scope, agentStepId: "step-3" }), /document_not_found/);
  await assert.rejects(execute("creative.plan", { title: "超量", goal: "超量", steps: Array.from({ length: 13 }, (_, i) => ({ id: String(i), title: "步骤", status: "pending" })) }), /limit/);
  await assert.rejects(execute("creative.document", { title: "超量", content: "文".repeat(20001) }, { ...scope, agentStepId: "step-4" }), /limit/);
  await assert.rejects(execute("creative.read", {}, { ...scope, capabilityProfile: "canvas" }), /not_allowed/);
  await assert.rejects(execute("creative.read", {}, { ...scope, actor: { ...scope.actor, capabilities: new Set() } }), /forbidden/);
  for (const changed of [{ ownerUserId: "owner-2" }, { actorTeamMemberId: "member-2" }]) {
    await assert.rejects(execute("creative.read", {}, { ...scope, actor: { ...scope.actor, ...changed } }), /conversation_not_found/);
  }
  const state = (await execute("creative.read", {})).output.state as Record<string, any>;
  assert.equal(state.plan.goal, "同一角色三张图");
  assert.equal(state.documents[0].content, "蓝衣少年，短发");
  assert.equal(state.skillId, "series-images");
  const stored = await db.query<{ summary_json: Record<string, unknown> }>("SELECT summary_json FROM canvas_agent_conversations");
  assert.equal(stored.rows[0].summary_json.existing, "preserved");
  const question = (await execute("creative.ask", { question: "使用哪种风格？", options: ["水墨", "写实"] })).output.creative as Record<string, unknown>;
  assert.equal(question.id, scope.agentStepId);
  await Promise.all(["left", "right"].map(id => execute("creative.document", { title: id, content: id }, { ...scope, agentStepId: id })));
  const concurrentState = (await execute("creative.read", {})).output.state as Record<string, any>;
  assert.equal(concurrentState.documents.length, 3, "concurrent updates must preserve both documents");
  await db.exec(`CREATE TABLE canvas_agent_tasks (id text, budget_json jsonb);
    INSERT INTO canvas_agent_tasks VALUES ('task-1','{"capabilityProfile":"media_generation_only"}');
    CREATE TABLE canvas_agent_messages (conversation_id text,task_id text,role text,content_json jsonb,sequence integer);
    INSERT INTO canvas_agent_messages SELECT 'conversation-1','task-1','user','{"text":"后续修改"}',generate_series(1,90);
    CREATE TABLE canvas_agent_file_grants (id text,storage_object_id text,purpose text,status text,
      expires_at timestamptz,created_at timestamptz,revoked_at timestamptz,canvas_id text,
      conversation_id text,owner_user_id text,actor_team_member_id text);`);
  const restored = await new CanvasAgentContextService({ db, maxMessages: 8, loadCanvasContext: async () => { throw new Error("must_not_read_canvas"); } }).build({ ...scope });
  assert.equal(restored.truncated, true);
  assert.equal(restored.messages.length, 8);
  assert.deepEqual(restored.creative, concurrentState, "fresh context retains goals and document versions after old messages are omitted");
  assert.equal("summary" in restored, false);
  await db.query("UPDATE canvas_agent_conversations SET deleted_at=now()");
  await assert.rejects(execute("creative.plan", { title: "删除后", goal: "不得修改", steps: [{ id: "a", title: "a", status: "pending" }] }), /conversation_not_found/);
});

test("creative tools are available only in free conversations and never override a deny", () => {
  const tools = ["generation.create", "creative.plan", "creative.ask", "creative.document", "creative.read", "skill.load", "creative.artifacts", "creative.reference", "canvas.patch", "mcp.call"].map(id => ({ id, inputSchema: { properties: {} } }));
  assert.deepEqual(executor.toolsForCapabilityProfile(tools, "media_generation_only").map(t => t.id), tools.slice(0, 8).map(t => t.id));
  assert.deepEqual(executor.toolsForCapabilityProfile(tools, "canvas").map(t => t.id), ["generation.create", "canvas.patch", "mcp.call"]);
  executor.assertToolAllowedForCapabilityProfile("creative.plan", {}, "media_generation_only");
  assert.throws(() => executor.assertToolAllowedForCapabilityProfile("creative.plan", {}, "canvas"), /not_allowed/);
  assert.throws(() => executor.assertToolAllowedForCapabilityProfile("creative.unknown", {}, "media_generation_only"), /not_allowed/);
  const deny = { decision: "deny" as const, reason: "capability_missing" };
  assert.equal(executor.effectivePolicyForCapabilityProfile(deny, "media_generation_only", "creative.document"), deny);
  assert.equal(executor.effectivePolicyForCapabilityProfile({ decision: "require_approval", reason: "write" }, "media_generation_only", "creative.document").decision, "allow");
  assert.equal(executor.effectivePolicyForCapabilityProfile({ decision: "allow", reason: "run" }, "media_generation_only", "generation.create", { generationPermissionMode: "approval_required" }).decision, "require_approval");
});
