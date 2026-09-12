import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import { CanvasAgentContextService } from "../canvas-agent-context.service.ts";
import { CanvasAgentExecutor } from "../canvas-agent-executor.ts";
import { CanvasAgentPolicyService } from "../canvas-agent-policy.service.ts";
import {
  createCanvasAgentTask,
  interjectCanvasAgentTask,
  resumeCanvasAgentTask,
} from "../canvas-agent-task.service.ts";
import { registerFreeConversationArtifactTools } from "../free-conversation-artifacts.ts";
import { CanvasAgentToolRegistry, createDefaultCanvasAgentToolRegistry } from "../canvas-agent-tool.registry.ts";
import type { CanvasAgentActor } from "../canvas-agent.types.ts";
import { registerFreeConversationTools } from "../free-conversation-tools.ts";

test("free conversation pauses on a blocking question and resumes the same task with the user's answer", async () => {
  const fixture = await createFixture();
  const modelRequests: string[] = [];
  let modelTurn = 0;
  const turns = [
    {
      kind: "tool_call",
      toolId: "creative.ask",
      callId: "ask-outfit",
      input: { question: "主角穿什么颜色？", options: ["蓝色", "红色"] },
    },
    {
      kind: "tool_call",
      toolId: "creative.document",
      callId: "save-character-brief",
      input: { title: "主角设定", content: "主角穿蓝色连衣裙，长发。" },
    },
    { kind: "final", message: "已保存主角设定。" },
  ];
  const registry = new CanvasAgentToolRegistry();
  registerFreeConversationTools(registry, { db: fixture.db });
  const executor = new CanvasAgentExecutor({
    db: fixture.db,
    context: new CanvasAgentContextService({
      db: fixture.db,
      loadCanvasContext: async () => ({ shouldNotLoadInFreeConversation: true }),
    }),
    textGateway: {
      chat: {
        completions: {
          create: async (request: Record<string, unknown>) => {
            modelRequests.push(JSON.stringify(request));
            return streamResult(turns[modelTurn++] ?? turns.at(-1)!);
          },
        },
      },
    } as never,
    policy: new CanvasAgentPolicyService(),
    tools: registry,
    billing: noOpBilling(),
    resolveActor: async () => fixture.actor,
    now: () => fixture.now,
  });
  try {
    const paused = await executor.execute(fixture.task.id);
    assert.equal(paused.status, "paused");

    const question = await fixture.db.query<{ content_json: Record<string, unknown> }>(`
      SELECT content_json FROM canvas_agent_messages
      WHERE task_id=$1 AND role='tool' ORDER BY sequence DESC LIMIT 1
    `, [fixture.task.id]);
    assert.deepEqual(question.rows[0]?.content_json, {
      toolId: "creative.ask",
      callId: "ask-outfit",
      output: { creative: { type: "question", id: paused.currentStepId, question: "主角穿什么颜色？", options: ["蓝色", "红色"] } },
    });
    const updates = await fixture.db.query<{ event_type: string; event_json: Record<string, unknown> }>(`
      SELECT event_type,event_json FROM canvas_agent_events
      WHERE task_id=$1 AND event_type IN ('creative.updated','task.paused') ORDER BY sequence
    `, [fixture.task.id]);
    assert.deepEqual(updates.rows.map(row => row.event_type), ["creative.updated", "task.paused"]);
    assert.equal(updates.rows[0].event_json.toolId, "creative.ask");

    await interjectCanvasAgentTask(fixture.db, {
      taskId: fixture.task.id,
      conversationId: fixture.conversationId,
      actor: fixture.actor,
      content: { text: "蓝色连衣裙，长发。" },
      now: fixture.now,
    });
    const resumed = await resumeCanvasAgentTask(fixture.db, { taskId: fixture.task.id, now: fixture.now });
    assert.equal(resumed.id, fixture.task.id);
    assert.equal(resumed.status, "queued");

    const completed = await executor.execute(fixture.task.id);
    assert.equal(completed.id, fixture.task.id);
    assert.equal(completed.status, "succeeded");

    assert.equal(modelRequests.length, 3);
    assert.match(modelRequests[1] ?? "", /设计主角设定/);
    assert.match(modelRequests[1] ?? "", /蓝色连衣裙，长发/);
    const saved = await fixture.db.query<{ summary_json: { creative?: { documents?: Array<Record<string, unknown>> } } }>(
      "SELECT summary_json FROM canvas_agent_conversations WHERE id=$1",
      [fixture.conversationId],
    );
    const document = saved.rows[0]?.summary_json.creative?.documents?.[0];
    assert.equal(saved.rows[0]?.summary_json.creative?.documents?.length, 1);
    assert.equal(document?.type, "document");
    assert.equal(document?.title, "主角设定");
    assert.equal(document?.content, "主角穿蓝色连衣裙，长发。");
    assert.equal(document?.version, 1);
    assert.match(String(document?.documentId), /^[0-9a-f-]{36}$/i);
    assert.match(String(document?.sourceStepId), /^[0-9a-f-]{36}$/i);
  } finally {
    await fixture.db.close();
  }
});

test("a completed free-conversation artifact becomes a scoped grant passed to generation.create", async () => {
  const fixture = await createFixture();
  const sourceTaskId = randomUUID();
  const sourceStorageObjectId = randomUUID();
  let generationInput: Record<string, unknown> | undefined;
  const context = new CanvasAgentContextService({
    db: fixture.db,
    loadCanvasContext: async () => ({}),
  });
  const registry = createDefaultCanvasAgentToolRegistry({
    readCanvas: async () => ({}),
    patchCanvas: async () => ({ revision: 1 }),
    context,
    generationIntake: {
      create: async (input) => {
        generationInput = input as unknown as Record<string, unknown>;
        return { generationTaskId: randomUUID() };
      },
    },
  });
  registerFreeConversationArtifactTools(registry, { db: fixture.db, context });
  try {
    await fixture.db.query(`
      INSERT INTO tasks (
        id,project_id,canvas_project_id,workflow_id,task_type,status,queue_name,input_snapshot_json,
        target_entity_type,target_entity_id,max_attempts
      ) VALUES ($1,NULL,$2,$3,'episode_generate_image','succeeded','test','{}'::jsonb,'canvas_agent_conversation',$4,1)
    `, [sourceTaskId, fixture.canvasId, randomUUID(), fixture.conversationId]);
    await fixture.db.query(`
      INSERT INTO storage_objects (
        id,canvas_project_id,created_by_user_id,content_type,status,deleted_at
      ) VALUES ($1,$2,$3,'image/png','available',NULL)
    `, [sourceStorageObjectId, fixture.canvasId, fixture.actor.ownerUserId]);
    await fixture.db.query(`
      INSERT INTO ai_generation_task_snapshots (
        task_id,user_id,canvas_project_id,target_type,target_id,media_type,status,result_assets_json,created_at
      ) VALUES ($1,$2,$3,'canvas_agent_conversation',$4,'image','succeeded',$5::jsonb,$6)
    `, [
      sourceTaskId,
      fixture.actor.ownerUserId,
      fixture.canvasId,
      fixture.conversationId,
      JSON.stringify([{ storageObjectId: sourceStorageObjectId, mediaKind: "image", url: "https://provider.example/source.png" }]),
      fixture.now,
    ]);
    const toolContext = {
      canvasId: fixture.canvasId,
      conversationId: fixture.conversationId,
      agentTaskId: fixture.task.id,
      agentStepId: randomUUID(),
      callId: "reference-then-generate",
      actor: fixture.actor,
      capabilityProfile: "media_generation_only" as const,
    };
    const artifact = await registry.execute("creative.artifacts", {}, toolContext);
    assert.deepEqual(artifact.output, {
      artifacts: [{
        generationTaskId: sourceTaskId,
        storageObjectId: sourceStorageObjectId,
        mediaKind: "image",
        contentType: "image/png",
      }],
    });
    const reference = await registry.execute("creative.reference", { storageObjectId: sourceStorageObjectId }, toolContext);
    const generated = await registry.execute("generation.create", {
      kind: "video",
      fileGrantIds: [reference.output.fileGrantId],
      request: { model: "video-model", prompt: "让这张图片中的角色回头" },
    }, toolContext);

    assert.equal(generated.status, "waiting_external");
    assert.equal(generationInput?.placement, "detached");
    assert.deepEqual((generationInput?.request as { parameters?: Record<string, unknown> }).parameters?.referenceImages, [{
      storageObjectId: sourceStorageObjectId,
      tag: "图1",
    }]);
    assert.doesNotMatch(JSON.stringify(generationInput), /provider\.example/);
  } finally {
    await fixture.db.close();
  }
});

test("executor preserves omission compatibility while respecting explicit generation fileGrantIds", async () => {
  const cases: Array<{
    name: string;
    modelFileGrantIds?: string[];
    expectedStorageObjectIds: "none" | "original" | "new";
  }> = [
    { name: "an explicit empty array", modelFileGrantIds: [], expectedStorageObjectIds: "none" },
    { name: "an explicit new grant", modelFileGrantIds: ["new"], expectedStorageObjectIds: "new" },
    { name: "an omitted field", expectedStorageObjectIds: "original" },
  ];
  for (const scenario of cases) {
    const originalGrantId = randomUUID();
    const newGrantId = randomUUID();
    const fixture = await createFixture({
      userMessage: { text: "请基于这张参考图生成视频。", fileGrantIds: [originalGrantId] },
    });
    const originalStorageObjectId = randomUUID();
    const newStorageObjectId = randomUUID();
    let generationInput: Record<string, unknown> | undefined;
    const context = new CanvasAgentContextService({ db: fixture.db, loadCanvasContext: async () => ({}) });
    const registry = createDefaultCanvasAgentToolRegistry({
      readCanvas: async () => ({}),
      patchCanvas: async () => ({ revision: 1 }),
      context,
      now: () => fixture.now,
      generationIntake: {
        create: async (input) => {
          generationInput = input as unknown as Record<string, unknown>;
          return { generationTaskId: randomUUID() };
        },
      },
    });
    try {
      await seedActiveImageGrant(fixture, originalGrantId, originalStorageObjectId);
      await seedActiveImageGrant(fixture, newGrantId, newStorageObjectId);
      assert.equal((await context.resolveFileGrant({
        grantId: newGrantId,
        canvasId: fixture.canvasId,
        conversationId: fixture.conversationId,
        actor: fixture.actor,
        now: fixture.now,
      })).storageObjectId, newStorageObjectId);
      const explicitGrantIds = scenario.modelFileGrantIds?.map((grantId) => grantId === "new" ? newGrantId : grantId);
      const executor = new CanvasAgentExecutor({
        db: fixture.db,
        context,
        textGateway: {
          chat: {
            completions: {
              create: async () => streamResult({
                kind: "tool_call",
                toolId: "generation.create",
                callId: `generate-${scenario.name}`,
                input: {
                  kind: "video",
                  ...(explicitGrantIds === undefined ? {} : { fileGrantIds: explicitGrantIds }),
                  request: { model: "video-model", prompt: "角色轻轻转身" },
                },
              }),
            },
          },
        } as never,
        policy: new CanvasAgentPolicyService(),
        tools: registry,
        billing: noOpBilling(),
        resolveActor: async () => fixture.actor,
        now: () => fixture.now,
      });
      const result = await executor.execute(fixture.task.id);
      const steps = await fixture.db.query<{ input_json: Record<string, unknown> }>(
        "SELECT input_json FROM canvas_agent_steps WHERE task_id=$1 AND tool_id='generation.create' ORDER BY step_no LIMIT 1",
        [fixture.task.id],
      );
      assert.equal(result.status, "waiting_external", scenario.name);
      const expectedGrantIds = scenario.expectedStorageObjectIds === "none"
        ? []
        : scenario.expectedStorageObjectIds === "new"
          ? [newGrantId]
          : [originalGrantId];
      assert.deepEqual(steps.rows[0]?.input_json.fileGrantIds ?? [], expectedGrantIds, scenario.name);
      const references = (generationInput?.request as { parameters?: { referenceImages?: Array<{ storageObjectId: string }> } })
        .parameters?.referenceImages ?? [];
      const expectedStorageObjectIds = scenario.expectedStorageObjectIds === "none"
        ? []
        : scenario.expectedStorageObjectIds === "new"
          ? [newStorageObjectId]
          : [originalStorageObjectId];
      assert.deepEqual(references.map((reference) => reference.storageObjectId), expectedStorageObjectIds, scenario.name);
    } finally {
      await fixture.db.close();
    }
  }
});

test("generation intake receives Wan instead of the repeated UI default after another conversation turn", async () => {
  const fixture = await createFixture({ userMessage: { text: "稍后给你剧本，模型用wan3.0", preferredModels: { video: "sd_2.0_special" } } });
  try {
    await fixture.db.exec(`CREATE TABLE ai_model_configs (model_code text, display_name text, media_type text, status text);
      INSERT INTO ai_model_configs VALUES ('wan3.0-r2v','Wan3.0（秒计费）','video','active'),('sd_2.0_special','Seedance 2.0','video','active');`);
    await fixture.db.query(`INSERT INTO canvas_agent_messages (id, conversation_id, task_id, sequence, role, content_json, created_at)
      SELECT gen_random_uuid(), $1, $2, n, 'assistant', '{"message":"剧本讨论"}'::jsonb, $3 FROM generate_series(2,90) n`, [fixture.conversationId, fixture.task.id, fixture.now]);
    const task = await createCanvasAgentTask(fixture.db, { canvasId: fixture.canvasId, conversationId: fixture.conversationId, actor: fixture.actor, mode: "c", modelCode: "free-conversation-test", modelConfigSnapshot: modelSnapshot(), budget: { capabilityProfile: "media_generation_only" }, baseRevision: 1, userMessage: { text: "第三幕，生成15秒视频", preferredModels: { video: "sd_2.0_special" }, preferredGenerationParameters: { video: { seedOnly: true } } }, now: fixture.now });
    let submitted: any;
    const context = new CanvasAgentContextService({ db: fixture.db, loadCanvasContext: async () => ({}) });
    const tools = createDefaultCanvasAgentToolRegistry({ readCanvas: async () => ({}), patchCanvas: async () => ({ revision: 1 }), context, now: () => fixture.now, generationIntake: { create: async input => { submitted = input; return { generationTaskId: randomUUID() }; } } });
    const executor = new CanvasAgentExecutor({ db: fixture.db, context, tools, policy: new CanvasAgentPolicyService(), billing: noOpBilling(), resolveActor: async () => fixture.actor, now: () => fixture.now, textGateway: { chat: { completions: { create: async () => streamResult({ kind: "tool_call", toolId: "generation.create", callId: "video", input: { kind: "video", request: { model: "sd_2.0_special", prompt: "晚风告白", parameters: { duration: 15 } } } }) } } } as never });
    assert.equal((await executor.execute(task.id)).status, "waiting_external");
    assert.equal(submitted.request.model, "wan3.0-r2v");
    assert.equal(submitted.request.parameters.duration, 15);
    assert.equal(submitted.request.parameters.seedOnly, undefined);
  } finally { await fixture.db.close(); }
});

test("a known anime reference pauses a realistic request before intake but remains usable for anime", async () => {
  for (const { selected, directReference } of [{selected:"真人写实",directReference:false},{selected:"日系动漫",directReference:false},{selected:"真人写实",directReference:true}]) {
    const grantId = randomUUID();
    const storageId = randomUUID();
    const generationId = randomUUID();
    const fixture = await createFixture({ userMessage: { text: `创作风格：${selected}。生成视频`, fileGrantIds: [grantId] } });
    try {
      await seedActiveImageGrant(fixture, grantId, storageId);
      await fixture.db.query(`INSERT INTO ai_generation_task_snapshots (task_id,user_id,canvas_project_id,target_type,target_id,media_type,status,result_assets_json,created_at)
        VALUES ($1,$2,$3,'canvas_agent_conversation',$4,'image','succeeded',$5::jsonb,$6)`, [generationId,fixture.actor.ownerUserId,fixture.canvasId,fixture.conversationId,JSON.stringify([{storageObjectId:storageId}]),fixture.now]);
      await fixture.db.query(`INSERT INTO canvas_agent_steps (id,task_id,step_no,kind,status,tool_id,input_json,input_fingerprint,effect,generation_task_id,created_at,updated_at)
        VALUES ($1,$2,1,'tool','succeeded','generation.create','{"request":{"prompt":"动漫风格插画：校园人物"}}'::jsonb,'source','read',$3,$4,$4)`, [randomUUID(),fixture.task.id,generationId,fixture.now]);
      let submissions = 0;
      const context = new CanvasAgentContextService({db:fixture.db,loadCanvasContext:async()=>({})});
      const tools = createDefaultCanvasAgentToolRegistry({readCanvas:async()=>({}),patchCanvas:async()=>({revision:1}),context,now:()=>fixture.now,generationIntake:{create:async input=>{submissions++;assert.match(String(input.request.prompt),new RegExp(selected));return{generationTaskId:randomUUID()};}}});
      registerFreeConversationTools(tools,{db:fixture.db});
      const executor = new CanvasAgentExecutor({db:fixture.db,context,tools,policy:new CanvasAgentPolicyService(),billing:noOpBilling(),resolveActor:async()=>fixture.actor,now:()=>fixture.now,textGateway:{chat:{completions:{create:async()=>streamResult({kind:"tool_call",toolId:"generation.create",callId:"video",input:{kind:"video",...(directReference?{fileGrantIds:[]}:{}),request:{model:"wan3.0-r2v",prompt:"人物走进校园",...(directReference?{parameters:{referenceImages:[{storageObjectId:storageId}]}}:{})}}})}}} as never});
      const result = await executor.execute(fixture.task.id);
      assert.equal(result.status, selected === "真人写实" ? "paused" : "waiting_external");
      assert.equal(submissions, selected === "真人写实" ? 0 : 1);
    } finally {await fixture.db.close();}
  }
});

async function createFixture(input: { userMessage?: Record<string, unknown> } = {}) {
  const db = new PGlite();
  const now = new Date("2026-09-04T00:00:00.000Z");
  const canvasId = randomUUID();
  const conversationId = randomUUID();
  const actor: CanvasAgentActor = {
    ownerUserId: randomUUID(),
    actorTeamMemberId: null,
    capabilities: new Set(["canvas:run"]),
  };
  await db.exec(`
    CREATE TABLE workflows (
      id uuid PRIMARY KEY, project_id uuid NULL, canvas_project_id uuid NULL,
      workflow_type text NOT NULL, status text NOT NULL, input_snapshot_json jsonb NOT NULL,
      created_by_user_id uuid NOT NULL, failure_code text NULL, finished_at timestamptz NULL, updated_at timestamptz NULL
    );
    CREATE TABLE tasks (
      id uuid PRIMARY KEY, project_id uuid NULL, canvas_project_id uuid NULL, workflow_id uuid NOT NULL,
      task_type text NOT NULL, status text NOT NULL, queue_name text NOT NULL, input_snapshot_json jsonb NOT NULL,
      target_entity_type text NOT NULL, target_entity_id uuid NOT NULL, max_attempts integer NOT NULL,
      attempt_count integer NOT NULL DEFAULT 0, current_attempt_id uuid NULL, locked_by text NULL,
      locked_until timestamptz NULL, heartbeat_at timestamptz NULL, failure_code text NULL, updated_at timestamptz NULL
    );
    CREATE TABLE canvas_agent_conversations (
      id uuid PRIMARY KEY, canvas_id uuid NOT NULL, owner_user_id uuid NOT NULL,
      actor_team_member_id uuid NULL, title text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'active',
      summary_json jsonb NOT NULL DEFAULT '{}'::jsonb, shard_id integer NULL,
      created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, deleted_at timestamptz NULL
    );
    CREATE TABLE canvas_agent_tasks (
      id uuid PRIMARY KEY, canvas_id uuid NOT NULL, conversation_id uuid NOT NULL, workflow_id uuid NOT NULL,
      workflow_task_id uuid NOT NULL, owner_user_id uuid NOT NULL, actor_team_member_id uuid NULL,
      mode text NOT NULL, status text NOT NULL, model_code text NOT NULL,
      model_config_snapshot_json jsonb NOT NULL, budget_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      metrics_json jsonb NOT NULL DEFAULT '{}'::jsonb, current_step_id uuid NULL, base_revision integer NOT NULL,
      event_sequence bigint NOT NULL DEFAULT 0, lease_owner text NULL, lease_expires_at timestamptz NULL,
      heartbeat_at timestamptz NULL, failure_code text NULL, created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL, completed_at timestamptz NULL
    );
    CREATE TABLE canvas_agent_steps (
      id uuid PRIMARY KEY, task_id uuid NOT NULL, step_no integer NOT NULL, kind text NOT NULL,
      status text NOT NULL, tool_id text NULL, call_id text NULL, input_json jsonb NOT NULL,
      input_fingerprint text NOT NULL, effect text NOT NULL, approval_id uuid NULL, provider_request_id uuid NULL,
      generation_task_id uuid NULL, credit_reservation_id uuid NULL, checkpoint_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      output_summary text NULL, error_code text NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
      completed_at timestamptz NULL
    );
    CREATE TABLE canvas_agent_events (
      id uuid PRIMARY KEY, task_id uuid NOT NULL, sequence bigint NOT NULL, event_type text NOT NULL,
      event_json jsonb NOT NULL, created_at timestamptz NOT NULL
    );
    CREATE TABLE canvas_agent_messages (
      id uuid PRIMARY KEY, conversation_id uuid NOT NULL, task_id uuid NULL, sequence bigint NOT NULL,
      role text NOT NULL, content_json jsonb NOT NULL, created_by_user_id uuid NULL,
      actor_team_member_id uuid NULL, created_at timestamptz NOT NULL
    );
    CREATE TABLE canvas_agent_outbox (
      id uuid PRIMARY KEY, task_id uuid NOT NULL, event_key text NOT NULL UNIQUE,
      payload_json jsonb NOT NULL, status text NOT NULL DEFAULT 'pending', available_at timestamptz NOT NULL DEFAULT now(),
      locked_by text NULL, locked_at timestamptz NULL, dispatched_at timestamptz NULL, attempt_count integer NOT NULL DEFAULT 0,
      last_error text NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
    );
    CREATE TABLE canvas_agent_file_grants (
      id uuid PRIMARY KEY, conversation_id uuid NOT NULL, canvas_id uuid NOT NULL, storage_object_id uuid NOT NULL,
      owner_user_id uuid NOT NULL, actor_team_member_id uuid NULL, purpose text NOT NULL, status text NOT NULL DEFAULT 'active',
      expires_at timestamptz NOT NULL, revoked_at timestamptz NULL, created_at timestamptz NOT NULL
    );
    CREATE TABLE storage_objects (
      id uuid PRIMARY KEY, canvas_project_id uuid NOT NULL, created_by_user_id uuid NOT NULL,
      content_type text NOT NULL, status text NOT NULL, deleted_at timestamptz NULL
    );
    CREATE TABLE ai_generation_task_snapshots (
      task_id uuid PRIMARY KEY, user_id uuid NOT NULL, canvas_project_id uuid NOT NULL,
      target_type text NOT NULL, target_id uuid NOT NULL, media_type text NOT NULL, status text NOT NULL,
      result_assets_json jsonb NOT NULL, created_at timestamptz NOT NULL
    );
  `);
  await db.query(`
    INSERT INTO canvas_agent_conversations (
      id,canvas_id,owner_user_id,actor_team_member_id,title,status,summary_json,shard_id,created_at,updated_at
    ) VALUES ($1,$2,$3,NULL,'自由会话','active','{}'::jsonb,0,$4,$4)
  `, [conversationId, canvasId, actor.ownerUserId, now]);
  const task = await createCanvasAgentTask(db, {
    canvasId,
    conversationId,
    actor,
    mode: "c",
    modelCode: "free-conversation-test",
    modelConfigSnapshot: modelSnapshot(),
    budget: { capabilityProfile: "media_generation_only" },
    baseRevision: 1,
    userMessage: input.userMessage ?? { text: "请帮我设计主角设定。" },
    now,
  });
  return { db, now, canvasId, conversationId, actor, task };
}

async function seedActiveImageGrant(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  grantId: string,
  storageObjectId: string,
) {
  await fixture.db.query(`
    INSERT INTO storage_objects (id,canvas_project_id,created_by_user_id,content_type,status,deleted_at)
    VALUES ($1,$2,$3,'image/png','available',NULL)
  `, [storageObjectId, fixture.canvasId, fixture.actor.ownerUserId]);
  await fixture.db.query(`
    INSERT INTO canvas_agent_file_grants (
      id,conversation_id,canvas_id,storage_object_id,owner_user_id,actor_team_member_id,
      purpose,status,expires_at,created_at
    ) VALUES ($1,$2,$3,$4,$5,NULL,'test_reference','active',$6,$7)
  `, [
    grantId,
    fixture.conversationId,
    fixture.canvasId,
    storageObjectId,
    fixture.actor.ownerUserId,
    new Date("2036-09-04T00:00:00.000Z"),
    fixture.now,
  ]);
}

function streamResult(turn: Record<string, unknown>) {
  return {
    providerRequestId: null,
    stream: (async function* () {
      yield { choices: [{ delta: { content: JSON.stringify(turn) } }] };
    })(),
    abort() {},
    completed: Promise.resolve({
      status: "succeeded" as const,
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      usageSource: "provider" as const,
    }),
  };
}

function modelSnapshot() {
  return {
    version: 1,
    modelConfigId: randomUUID(),
    modelCode: "free-conversation-test",
    providerName: "test",
    providerModel: "test",
    providerProtocol: "openai_compatible_chat",
    providerConfigRevisionId: "revision:test",
    credentialVersionRef: "credential:test",
    capabilities: {},
    pricing: { baseCredits: 1 },
    limits: {},
    providerConfig: {},
  };
}

function noOpBilling() {
  return {
    estimateRound: () => 1,
    reserveRound: async () => ({ kind: "reservation" as const, reservationId: null, amount: 1 }),
    settleRound: async () => ({ consumed: 1, released: 0 }),
    settleTask: async () => ({ consumed: 1, totalTokens: 1 }),
  } as never;
}
