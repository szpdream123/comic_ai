import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { CanvasAgentContextService } from "../canvas-agent-context.service.ts";
import { CanvasAgentExecutor } from "../canvas-agent-executor.ts";
import { CanvasAgentPolicyService } from "../canvas-agent-policy.service.ts";
import {
  CanvasAgentExternalToolBoundary,
  CanvasAgentKnowledgeService,
  __canvasAgentKnowledgeTestUtils,
} from "../canvas-agent-knowledge.service.ts";
import type { CanvasAgentActor } from "../canvas-agent.types.ts";
import { CanvasAgentToolRegistry } from "../canvas-agent-tool.registry.ts";
import {
  createCanvasAgentStep,
  createCanvasAgentTask,
  decideCanvasAgentApproval,
  incrementCanvasAgentMetrics,
  interjectCanvasAgentTask,
  requestCanvasAgentApproval,
} from "../canvas-agent-task.service.ts";

describe("Canvas Agent knowledge and external boundaries", { concurrency: false }, () => {
  it("scopes memory, compacts context, and persists provider document citations", async () => {
    const db = await createMigratedTestDb();
    const userId = randomUUID();
    const canvasId = randomUUID();
    const conversationId = randomUUID();
    const actor: CanvasAgentActor = {
      ownerUserId: userId,
      actorTeamMemberId: null,
      capabilities: new Set(["canvas:view", "canvas:run"]),
    };
    try {
      await db.query("INSERT INTO users (id,phone_e164,status) VALUES ($1,$2,'active')", [userId, uniquePhone()]);
      await db.query(`
        INSERT INTO creator_canvas_projects
          (id,title,status,server_revision,created_by_user_id,updated_by_user_id)
        VALUES ($1,'Knowledge canvas','active',1,$2,$2)
      `, [canvasId, userId]);
      await db.query(`
        INSERT INTO canvas_agent_conversations
          (id,canvas_id,owner_user_id,title,created_at,updated_at)
        VALUES ($1,$2,$3,'Knowledge conversation',now(),now())
      `, [conversationId, canvasId, userId]);

      const knowledge = new CanvasAgentKnowledgeService(db);
      await knowledge.remember({
        canvasId, conversationId, actor, key: "style.palette",
        value: { primary: "red" }, now: new Date("2026-07-25T10:00:00Z"),
      });
      await knowledge.remember({
        canvasId, conversationId, actor, key: "style.palette",
        value: { primary: "blue" }, now: new Date("2026-07-25T10:01:00Z"),
      });
      const memories = await knowledge.listMemories({ canvasId, conversationId, actor });
      assert.equal(memories.length, 1);
      assert.deepEqual(memories[0]?.value, { primary: "blue" });

      const editable = await knowledge.remember({
        canvasId, conversationId, actor, key: "character.lead",
        value: { name: "Rin", category: "character" }, taskId: null, stepId: null,
        now: new Date("2026-07-25T10:01:10Z"),
      });
      const edited = await knowledge.updateMemory({
        canvasId, conversationId, memoryId: editable.id, actor,
        key: "character.protagonist", value: { name: "Rin revised" }, category: "character",
        now: new Date("2026-07-25T10:01:11Z"),
      });
      assert.equal(edited.category, "character");
      assert.equal(edited.source, "user");
      assert.deepEqual(edited.value, { name: "Rin revised", category: "character" });
      const disabled = await knowledge.updateMemory({
        canvasId, conversationId, memoryId: editable.id, actor, status: "revoked",
        now: new Date("2026-07-25T10:01:12Z"),
      });
      assert.equal(disabled.status, "revoked");
      assert.equal((await knowledge.listMemories({ canvasId, conversationId, actor, category: "character" })).length, 0);
      assert.equal((await knowledge.listMemories({ canvasId, conversationId, actor, category: "character", includeInactive: true })).length, 1);
      const enabled = await knowledge.updateMemory({
        canvasId, conversationId, memoryId: editable.id, actor, status: "active",
        now: new Date("2026-07-25T10:01:13Z"),
      });
      assert.equal(enabled.status, "active");
      assert.equal((await knowledge.listMemories({ canvasId, conversationId, actor, source: "user" })).length, 2);
      assert.deepEqual(await knowledge.deleteMemory({ canvasId, conversationId, memoryId: editable.id, actor }), { id: editable.id, deleted: true });

      for (let sequence = 1; sequence <= 10; sequence += 1) {
        await db.query(`
          INSERT INTO canvas_agent_messages
            (id,conversation_id,sequence,role,content_json,created_by_user_id,created_at)
          VALUES ($1,$2,$3,'user',$4::jsonb,$5,now())
        `, [randomUUID(), conversationId, sequence, JSON.stringify({ text: `message-${sequence}` }), userId]);
      }
      const context = new CanvasAgentContextService({
        db,
        loadCanvasContext: async () => ({ revision: 1 }),
        knowledge,
        maxMessages: 8,
        maxSerializedChars: 100_000,
      });
      const built = await context.build({ canvasId, conversationId, actor });
      assert.equal("truncated" in built && built.truncated, true);
      assert.equal(built.summary.throughSequence, 2);
      assert.equal(built.memories.length, 1);
      const storedSummary = await db.query<{ summary_json: Record<string, unknown> }>(
        "SELECT summary_json FROM canvas_agent_conversations WHERE id=$1",
        [conversationId],
      );
      assert.equal(Number(storedSummary.rows[0]?.summary_json.throughSequence), 2);

      const content = "Provider API authentication and retry guidance. Use bounded retries and idempotency keys.";
      await db.query(`
        INSERT INTO canvas_agent_provider_documents
          (id,provider_name,document_key,title,canonical_url,content_text,content_hash)
        VALUES ($1,'example','authentication','Authentication','https://docs.example.test/auth',$2,$3)
      `, [randomUUID(), content, createHash("sha256").update(content).digest("hex")]);
      const document = await knowledge.readProviderDocument({
        providerName: "example", documentKey: "authentication", query: "retry",
        canvasId, conversationId, actor, now: new Date("2026-07-25T10:02:00Z"),
      });
      assert.match(document.content, /retry/i);
      assert.equal(document.citation.sourceType, "provider_docs");
      assert.equal((await knowledge.listCitations({ canvasId, conversationId, actor })).length, 1);

      const task = await createCanvasAgentTask(db, {
        canvasId, conversationId, actor, mode: "b", modelCode: "agent-test",
        modelConfigSnapshot: {
          version: 1, modelConfigId: randomUUID(), modelCode: "agent-test",
          providerName: "test", providerModel: "test", providerProtocol: "openai_compatible_chat",
          providerConfigRevisionId: "revision:test", credentialVersionRef: "credential:test",
          capabilities: {}, pricing: { baseCredits: 1 }, limits: {}, providerConfig: {},
        },
        baseRevision: 1, userMessage: { text: "remember this" }, now: new Date("2026-07-25T10:03:00Z"),
      });
      const step = await createCanvasAgentStep(db, {
        taskId: task.id, kind: "tool", toolId: "memory.write", callId: "memory-call-1",
        effect: "memory_write", input: { key: "approved.memory", value: { approved: true } },
        now: new Date("2026-07-25T10:03:01Z"),
      });
      const approval = await requestCanvasAgentApproval(db, {
        taskId: task.id, stepId: step.id, actor, effect: "memory_write", reason: "explicit memory write",
        now: new Date("2026-07-25T10:03:02Z"),
      });
      await decideCanvasAgentApproval(db, {
        taskId: task.id, approvalId: approval.id, actor, decision: "approved",
        now: new Date("2026-07-25T10:03:03Z"),
      });
      let approvedInput: Record<string, unknown> | null = null;
      let executionCount = 0;
      let authorizationCount = 0;
      const tools = new CanvasAgentToolRegistry().register({
        id: "memory.write", description: "test", effect: "memory_write", requiredCapability: "canvas:run",
        inputSchema: { type: "object" },
        execute: async (input) => {
          executionCount += 1;
          approvedInput = input;
          return { status: "waiting_external", output: { accepted: true } };
        },
      });
      const executor = new CanvasAgentExecutor({
        db,
        textGateway: {} as never,
        context: {} as never,
        policy: new CanvasAgentPolicyService(),
        tools,
        billing: {} as never,
        resolveActor: async () => {
          authorizationCount += 1;
          return actor;
        },
        now: () => new Date("2026-07-25T10:03:04Z"),
      });
      const resumed = await executor.execute(task.id);
      assert.deepEqual(approvedInput, { key: "approved.memory", value: { approved: true } });
      assert.equal(executionCount, 1);
      assert.equal(authorizationCount, 2);
      assert.equal(resumed?.status, "waiting_external");
      await interjectCanvasAgentTask(db, {
        taskId: task.id,
        conversationId,
        actor,
        content: { text: "adjust direction" },
        now: new Date("2026-07-25T10:03:05Z"),
      });
      await incrementCanvasAgentMetrics(db, {
        taskId: task.id,
        increments: {
          modelRoundCount: 1,
          modelDurationMs: 12,
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
        now: new Date("2026-07-25T10:03:06Z"),
      });
      await incrementCanvasAgentMetrics(db, {
        taskId: task.id,
        increments: { modelDurationMs: 8 },
        now: new Date("2026-07-25T10:03:07Z"),
      });
      const taskMetrics = await db.query<{ metrics_json: Record<string, number> }>(
        "SELECT metrics_json FROM canvas_agent_tasks WHERE id=$1",
        [task.id],
      );
      assert.deepEqual({ ...taskMetrics.rows[0]?.metrics_json, toolDurationMs: 0 }, {
        approvalRequestCount: 1,
        completionTokens: 5,
        interjectionCount: 1,
        modelDurationMs: 20,
        modelRoundCount: 1,
        policyDenyCount: 0,
        promptTokens: 10,
        toolCallCount: 0,
        toolDurationMs: 0,
        totalTokens: 15,
      });
      assert.ok(Number(taskMetrics.rows[0]?.metrics_json.toolDurationMs) >= 0);

      const expertTask = await createCanvasAgentTask(db, {
        canvasId, conversationId, actor, mode: "expert", modelCode: "agent-test",
        modelConfigSnapshot: task.modelConfigSnapshot,
        baseRevision: 1, userMessage: { text: "read-only analysis" },
        now: new Date("2026-07-25T10:04:00Z"),
      });
      const expertStep = await createCanvasAgentStep(db, {
        taskId: expertTask.id, kind: "tool", toolId: "memory.write", callId: "expert-memory-call",
        effect: "memory_write", input: { key: "must.not.write", value: { denied: true } },
        now: new Date("2026-07-25T10:04:01Z"),
      });
      const expertApproval = await requestCanvasAgentApproval(db, {
        taskId: expertTask.id, stepId: expertStep.id, actor, effect: "memory_write", reason: "legacy approval",
        now: new Date("2026-07-25T10:04:02Z"),
      });
      await decideCanvasAgentApproval(db, {
        taskId: expertTask.id, approvalId: expertApproval.id, actor, decision: "approved",
        now: new Date("2026-07-25T10:04:03Z"),
      });
      const deniedExpert = await executor.execute(expertTask.id);
      assert.equal(deniedExpert?.status, "failed");
      assert.equal(deniedExpert?.failureCode, "policy_denied");
      assert.equal(executionCount, 1);
      const expertMetrics = await db.query<{ metrics_json: Record<string, number> }>(
        "SELECT metrics_json FROM canvas_agent_tasks WHERE id=$1",
        [expertTask.id],
      );
      assert.equal(expertMetrics.rows[0]?.metrics_json.approvalRequestCount, 1);
      assert.equal(expertMetrics.rows[0]?.metrics_json.policyDenyCount, 1);

      const providerTask = await createCanvasAgentTask(db, {
        canvasId, conversationId, actor, mode: "b", modelCode: "agent-test",
        modelConfigSnapshot: task.modelConfigSnapshot,
        baseRevision: 1, userMessage: { text: "analyze only" },
        now: new Date("2026-07-25T10:05:01Z"),
      });
      let providerAuthorizationCount = 0;
      let providerRequest: Record<string, unknown> | undefined;
      const providerExecutor = new CanvasAgentExecutor({
        db,
        textGateway: {
          chat: {
            completions: {
              async create(request: Record<string, unknown>) {
                providerRequest = request;
                return {
                  providerRequestId: null as never,
                  stream: (async function* () {
                    yield { choices: [{ delta: { content: '{"kind":"final","message":"done"}' } }] };
                  })(),
                  abort() {},
                  completed: Promise.resolve({
                    status: "succeeded" as const,
                    usage: {
                      input_tokens: 9,
                      output_tokens: 4,
                      cache_read_input_tokens: 3,
                      total_tokens: 13,
                    },
                    usageSource: "provider" as const,
                  }),
                };
              },
            },
          },
        } as never,
        context,
        policy: new CanvasAgentPolicyService(),
        tools: new CanvasAgentToolRegistry(),
        billing: {
          estimateRound: () => 1,
          reserveRound: async () => ({ kind: "reservation" as const, reservationId: null, amount: 1 }),
          settleRound: async () => ({ consumed: 1, released: 0 }),
        } as never,
        resolveActor: async () => {
          providerAuthorizationCount += 1;
          return actor;
        },
        now: () => new Date("2026-07-25T10:05:02Z"),
      });
      const providerResult = await providerExecutor.execute(providerTask.id);
      assert.equal(providerResult?.status, "succeeded");
      assert.equal(Object.hasOwn(providerRequest ?? {}, "max_tokens"), false);
      assert.equal(providerAuthorizationCount, 3);
      const providerMetrics = await db.query<{ metrics_json: Record<string, number> }>(
        "SELECT metrics_json FROM canvas_agent_tasks WHERE id=$1",
        [providerTask.id],
      );
      assert.equal(providerMetrics.rows[0]?.metrics_json.modelRoundCount, 1);
      assert.equal(providerMetrics.rows[0]?.metrics_json.promptTokens, 9);
      assert.equal(providerMetrics.rows[0]?.metrics_json.completionTokens, 4);
      assert.equal(providerMetrics.rows[0]?.metrics_json.totalTokens, 16);
      const completionEvent = await db.query<{ event_json: Record<string, unknown> }>(
        "SELECT event_json FROM canvas_agent_events WHERE task_id=$1 AND event_type='task.succeeded' LIMIT 1",
        [providerTask.id],
      );
      assert.deepEqual(completionEvent.rows[0]?.event_json.tokenUsage, {
        promptTokens: 9,
        completionTokens: 4,
        totalTokens: 16,
      });

      const invalidResponseTask = await createCanvasAgentTask(db, {
        canvasId, conversationId, actor, mode: "b", modelCode: "agent-test",
        modelConfigSnapshot: task.modelConfigSnapshot,
        baseRevision: 1, userMessage: { text: "return invalid JSON" },
        now: new Date("2026-07-25T10:06:00Z"),
      });
      const invalidResponseExecutor = new CanvasAgentExecutor({
        db,
        textGateway: {
          chat: {
            completions: {
              async create() {
                return {
                  providerRequestId: null as never,
                  stream: (async function* () {
                    yield { choices: [{ delta: { content: "" } }] };
                  })(),
                  abort() {},
                  completed: Promise.resolve({
                    status: "succeeded" as const,
                    usage: { prompt_tokens: 9, completion_tokens: 2_048, total_tokens: 2_057 },
                    usageSource: "provider" as const,
                  }),
                };
              },
            },
          },
        } as never,
        context,
        policy: new CanvasAgentPolicyService(),
        tools: new CanvasAgentToolRegistry(),
        billing: {
          estimateRound: () => 1,
          reserveRound: async () => ({ kind: "reservation" as const, reservationId: null, amount: 1 }),
          settleRound: async () => ({ consumed: 1, released: 0 }),
        } as never,
        resolveActor: async () => actor,
        now: () => new Date("2026-07-25T10:06:01Z"),
      });
      const invalidResponseResult = await invalidResponseExecutor.execute(invalidResponseTask.id);
      assert.equal(invalidResponseResult?.status, "failed");
      assert.equal(invalidResponseResult?.failureCode, "canvas_agent_model_response_invalid_json");
      const invalidResponseStep = await db.query<{ status: string; error_code: string | null }>(
        "SELECT status,error_code FROM canvas_agent_steps WHERE task_id=$1 ORDER BY step_no DESC LIMIT 1",
        [invalidResponseTask.id],
      );
      assert.deepEqual(invalidResponseStep.rows[0], {
        status: "failed",
        error_code: "canvas_agent_model_response_invalid_json",
      });
    } finally {
      await db.close();
    }
  });

  it("defaults Web and MCP policies to disabled and enforces exact allowlists", async () => {
    const db = await createMigratedTestDb();
    try {
      const boundary = new CanvasAgentExternalToolBoundary(db);
      await assert.rejects(
        boundary.authorize({ kind: "web", targetId: "search-primary", domain: "docs.example.test" }),
        /canvas_agent_web_disabled/,
      );
      await db.query(`
        INSERT INTO canvas_agent_external_tool_policies
          (id,tool_kind,target_id,enabled,allowed_domains_json,allowed_operations_json)
        VALUES
          ($1,'web','search-primary',true,'["docs.example.test"]'::jsonb,'[]'::jsonb),
          ($2,'mcp','asset-server',true,'[]'::jsonb,'["asset.read"]'::jsonb)
      `, [randomUUID(), randomUUID()]);
      await boundary.authorize({ kind: "web", targetId: "search-primary", domain: "docs.example.test" });
      await assert.rejects(
        boundary.authorize({ kind: "web", targetId: "search-primary", domain: "other.example.test" }),
        /canvas_agent_web_domain_not_allowed/,
      );
      await boundary.authorize({ kind: "mcp", targetId: "asset-server", operation: "asset.read" });
      await assert.rejects(
        boundary.authorize({ kind: "mcp", targetId: "asset-server", operation: "asset.delete" }),
        /canvas_agent_mcp_operation_not_allowed/,
      );
    } finally {
      await db.close();
    }
  });

  it("normalizes citation URLs and rejects unsafe schemes", () => {
    assert.equal(
      __canvasAgentKnowledgeTestUtils.canonicalizeUrl("https://docs.example.test/page#section"),
      "https://docs.example.test/page",
    );
    assert.throws(
      () => __canvasAgentKnowledgeTestUtils.canonicalizeUrl("file:///tmp/provider.txt"),
      /canvas_agent_citation_url_invalid/,
    );
  });
});

function uniquePhone() {
  return `136${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}`;
}
