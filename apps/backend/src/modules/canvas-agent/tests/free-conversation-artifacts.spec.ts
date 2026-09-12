import assert from "node:assert/strict";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import { registerFreeConversationArtifactTools } from "../free-conversation-artifacts.ts";
import { CanvasAgentToolRegistry } from "../canvas-agent-tool.registry.ts";

const ids = {
  canvas: "10000000-0000-4000-8000-000000000001",
  owner: "20000000-0000-4000-8000-000000000001",
  otherOwner: "20000000-0000-4000-8000-000000000002",
  member: "30000000-0000-4000-8000-000000000001",
  conversation: "40000000-0000-4000-8000-000000000001",
  otherConversation: "40000000-0000-4000-8000-000000000002",
  otherOwnerConversation: "40000000-0000-4000-8000-000000000003",
  imageTask: "50000000-0000-4000-8000-000000000001",
  otherConversationTask: "50000000-0000-4000-8000-000000000002",
  otherOwnerTask: "50000000-0000-4000-8000-000000000003",
  incompleteTask: "50000000-0000-4000-8000-000000000004",
  deletedTask: "50000000-0000-4000-8000-000000000005",
  imageStorage: "60000000-0000-4000-8000-000000000001",
  otherConversationStorage: "60000000-0000-4000-8000-000000000002",
  otherOwnerStorage: "60000000-0000-4000-8000-000000000003",
  incompleteStorage: "60000000-0000-4000-8000-000000000004",
  deletedStorage: "60000000-0000-4000-8000-000000000005",
};

test("creative.artifacts lists only completed available output from the exact free conversation", async () => {
  const db = await createArtifactDb();
  const grants = createGrantContext();
  const registry = registerFreeConversationArtifactTools(new CanvasAgentToolRegistry(), { db, context: grants.context });
  try {
    const result = await registry.execute("creative.artifacts", {}, mediaContext());

    assert.equal(result.status, "succeeded");
    assert.deepEqual(result.output, {
      artifacts: [{
        generationTaskId: ids.imageTask,
        storageObjectId: ids.imageStorage,
        mediaKind: "image",
        contentType: "image/png",
      }],
    });
    assert.doesNotMatch(JSON.stringify(result.output), /https?:\/\/|provider|secret/i);
    assert.equal(registry.get("creative.artifacts")?.effect, "read");
    assert.equal(registry.get("creative.artifacts")?.requiredCapability, "canvas:run");
  } finally {
    await db.close();
  }
});

test("creative.reference rejects cross-conversation, cross-owner, incomplete, and removed artifacts", async () => {
  const db = await createArtifactDb();
  const grants = createGrantContext();
  const registry = registerFreeConversationArtifactTools(new CanvasAgentToolRegistry(), { db, context: grants.context });
  try {
    for (const storageObjectId of [
      ids.otherConversationStorage,
      ids.otherOwnerStorage,
      ids.incompleteStorage,
      ids.deletedStorage,
    ]) {
      await assert.rejects(
        () => registry.execute("creative.reference", { storageObjectId }, mediaContext()),
        /canvas_agent_free_conversation_artifact_not_found/,
      );
    }
    assert.equal(grants.createCalls.length, 0);
  } finally {
    await db.close();
  }
});

test("creative.reference reuses an active grant and creates one once when none exists", async () => {
  const db = await createArtifactDb();
  const grants = createGrantContext();
  const registry = registerFreeConversationArtifactTools(new CanvasAgentToolRegistry(), { db, context: grants.context });
  try {
    const created = await registry.execute("creative.reference", { storageObjectId: ids.imageStorage }, mediaContext());
    assert.deepEqual(created, {
      status: "succeeded",
      output: {
        fileGrantId: "grant-created",
        generationTaskId: ids.imageTask,
        storageObjectId: ids.imageStorage,
        mediaKind: "image",
        contentType: "image/png",
      },
    });
    assert.deepEqual(grants.createCalls, [{
      canvasId: ids.canvas,
      conversationId: ids.conversation,
      storageObjectId: ids.imageStorage,
      purpose: "generation_reference",
      actor: mediaContext().actor,
    }]);

    const repeated = await registry.execute("creative.reference", { storageObjectId: ids.imageStorage }, mediaContext());
    assert.equal(repeated.output.fileGrantId, "grant-created");
    assert.equal(grants.createCalls.length, 1);
    assert.equal(registry.get("creative.reference")?.effect, "memory_write");
    assert.equal(registry.get("creative.reference")?.requiredCapability, "canvas:run");
  } finally {
    await db.close();
  }
});

test("free conversation artifact tools reject every non-media capability profile", async () => {
  const db = await createArtifactDb();
  const registry = registerFreeConversationArtifactTools(new CanvasAgentToolRegistry(), { db, context: createGrantContext().context });
  try {
    await assert.rejects(
      () => registry.execute("creative.artifacts", {}, { ...mediaContext(), capabilityProfile: undefined }),
      /canvas_agent_free_conversation_tool_not_allowed/,
    );
  } finally {
    await db.close();
  }
});

test("creative artifact tools require canvas:run and reject malformed storage IDs before querying", async () => {
  const db = await createArtifactDb();
  const registry = registerFreeConversationArtifactTools(new CanvasAgentToolRegistry(), { db, context: createGrantContext().context });
  try {
    await assert.rejects(
      () => registry.execute("creative.artifacts", {}, {
        ...mediaContext(), actor: { ...mediaContext().actor, capabilities: new Set() },
      }),
      /canvas_agent_forbidden/,
    );
    await assert.rejects(
      () => registry.execute("creative.reference", { storageObjectId: "not-a-uuid" }, mediaContext()),
      /canvas_agent_free_conversation_artifact_invalid/,
    );
  } finally {
    await db.close();
  }
});

function mediaContext() {
  return {
    canvasId: ids.canvas,
    conversationId: ids.conversation,
    agentTaskId: "70000000-0000-4000-8000-000000000001",
    agentStepId: "70000000-0000-4000-8000-000000000002",
    callId: "call-1",
    capabilityProfile: "media_generation_only" as const,
    actor: {
      ownerUserId: ids.owner,
      actorTeamMemberId: ids.member,
      capabilities: new Set(["canvas:run"]),
    },
  };
}

function createGrantContext() {
  const active: Array<{ id: string; storageObjectId: string }> = [];
  const createCalls: Array<Record<string, unknown>> = [];
  return {
    active,
    createCalls,
    context: {
      listFileGrants: async () => active,
      createFileGrant: async (input: Record<string, unknown>) => {
        createCalls.push({
          canvasId: input.canvasId,
          conversationId: input.conversationId,
          storageObjectId: input.storageObjectId,
          purpose: input.purpose,
          actor: input.actor,
        });
        active.push({ id: "grant-created", storageObjectId: String(input.storageObjectId) });
        return { id: "grant-created" };
      },
    },
  };
}

async function createArtifactDb() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE ai_generation_task_snapshots (
      task_id uuid PRIMARY KEY,
      user_id uuid NOT NULL,
      canvas_project_id uuid NOT NULL,
      target_type text NOT NULL,
      target_id uuid NOT NULL,
      media_type text NOT NULL,
      status text NOT NULL,
      result_assets_json jsonb NOT NULL,
      created_at timestamptz NOT NULL
    );
    CREATE TABLE tasks (id uuid PRIMARY KEY, status text NOT NULL);
    CREATE TABLE canvas_agent_conversations (
      id uuid PRIMARY KEY,
      canvas_id uuid NOT NULL,
      owner_user_id uuid NOT NULL,
      actor_team_member_id uuid NULL,
      deleted_at timestamptz NULL
    );
    CREATE TABLE storage_objects (
      id uuid PRIMARY KEY,
      canvas_project_id uuid NOT NULL,
      created_by_user_id uuid NOT NULL,
      content_type text NOT NULL,
      status text NOT NULL,
      deleted_at timestamptz NULL
    );

    INSERT INTO tasks (id,status) VALUES
      ('${ids.imageTask}','succeeded'),
      ('${ids.otherConversationTask}','succeeded'),
      ('${ids.otherOwnerTask}','succeeded'),
      ('${ids.incompleteTask}','running'),
      ('${ids.deletedTask}','succeeded');
    INSERT INTO canvas_agent_conversations (id,canvas_id,owner_user_id,actor_team_member_id,deleted_at) VALUES
      ('${ids.conversation}','${ids.canvas}','${ids.owner}','${ids.member}',NULL),
      ('${ids.otherConversation}','${ids.canvas}','${ids.owner}','${ids.member}',NULL),
      ('${ids.otherOwnerConversation}','${ids.canvas}','${ids.otherOwner}',NULL,NULL);
    INSERT INTO storage_objects (id,canvas_project_id,created_by_user_id,content_type,status,deleted_at) VALUES
      ('${ids.imageStorage}','${ids.canvas}','${ids.owner}','image/png','available',NULL),
      ('${ids.otherConversationStorage}','${ids.canvas}','${ids.owner}','image/jpeg','available',NULL),
      ('${ids.otherOwnerStorage}','${ids.canvas}','${ids.otherOwner}','image/webp','available',NULL),
      ('${ids.incompleteStorage}','${ids.canvas}','${ids.owner}','video/mp4','available',NULL),
      ('${ids.deletedStorage}','${ids.canvas}','${ids.owner}','image/png','available','2026-09-04T00:00:00Z');
    INSERT INTO ai_generation_task_snapshots (
      task_id,user_id,canvas_project_id,target_type,target_id,media_type,status,result_assets_json,created_at
    ) VALUES
      ('${ids.imageTask}','${ids.owner}','${ids.canvas}','canvas_agent_conversation','${ids.conversation}','image','succeeded',
        '[{"storageObjectId":"${ids.imageStorage}","mediaKind":"image","url":"https://provider.example/image.png","providerRequestId":"secret"}]','2026-09-04T00:00:00Z'),
      ('${ids.otherConversationTask}','${ids.owner}','${ids.canvas}','canvas_agent_conversation','${ids.otherConversation}','image','succeeded',
        '[{"storageObjectId":"${ids.otherConversationStorage}","mediaKind":"image"}]','2026-09-04T00:01:00Z'),
      ('${ids.otherOwnerTask}','${ids.otherOwner}','${ids.canvas}','canvas_agent_conversation','${ids.otherOwnerConversation}','image','succeeded',
        '[{"storageObjectId":"${ids.otherOwnerStorage}","mediaKind":"image"}]','2026-09-04T00:02:00Z'),
      ('${ids.incompleteTask}','${ids.owner}','${ids.canvas}','canvas_agent_conversation','${ids.conversation}','video','running',
        '[{"storageObjectId":"${ids.incompleteStorage}","mediaKind":"video"}]','2026-09-04T00:03:00Z'),
      ('${ids.deletedTask}','${ids.owner}','${ids.canvas}','canvas_agent_conversation','${ids.conversation}','image','succeeded',
        '[{"storageObjectId":"${ids.deletedStorage}","mediaKind":"image"}]','2026-09-04T00:04:00Z');
  `);
  return db;
}
