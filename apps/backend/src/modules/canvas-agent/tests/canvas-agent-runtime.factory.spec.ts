import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  failOrphanedCanvasAgentGenerationNodes,
  findCanvasByCanvasProjectId,
} from "../../project/creator-canvas-record.service.ts";
import { __canvasAgentRuntimeTestUtils } from "../canvas-agent-runtime.factory.ts";
import {
  loadCanvasAgentRuntimeConfiguration,
  normalizeCanvasAgentRuntimeConfiguration,
  selectCanvasAgentModelCode,
} from "../canvas-agent-runtime-config.service.ts";

describe("Canvas Agent runtime composition", () => {
  it("keeps image billing modes distinct without changing video billing", () => {
    const pricing = {
      baseCredits: 90,
      resolutionCredits: { "4K": 160 },
    };
    const parameters = { resolution: "4K", durationSec: 10 };

    assert.equal(__canvasAgentRuntimeTestUtils.generationCredits({ ...pricing, billingMode: "fixed" }, parameters, "image"), 90);
    assert.equal(__canvasAgentRuntimeTestUtils.generationCredits({ ...pricing, billingMode: "duration" }, parameters, "image"), 160);
    assert.equal(__canvasAgentRuntimeTestUtils.generationCredits({ ...pricing, billingMode: "fixed" }, parameters, "video"), 160);
    assert.equal(__canvasAgentRuntimeTestUtils.generationCredits({ ...pricing, billingMode: "duration" }, parameters, "video"), 1600);
  });

  it("applies bounded JSON patch operations without mutating the input", () => {
    const document = {
      version: 1,
      canvasProjectId: "canvas-1",
      viewport: {},
      nodes: [{ id: "node-1", type: "text", data: { text: "before" } }],
      edges: [],
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
    };
    const patched = __canvasAgentRuntimeTestUtils.applyCanvasPatch(document, [
      { op: "replace", path: "/nodes/0/data/text", value: "after" },
      { op: "add", path: "/nodes/-", value: { id: "node-2", type: "image" } },
      {
        type: "addEdge",
        edge: {
          id: "edge-1",
          kind: "execution",
          sourceNodeId: "node-1",
          sourcePortId: "out_text",
          targetNodeId: "node-2",
          targetPortId: "in_asset",
          data: {},
        },
      },
    ]);

    assert.equal(document.nodes.length, 1);
    assert.equal((patched.nodes as Array<Record<string, unknown>>).length, 2);
    assert.equal((patched.edges as Array<Record<string, unknown>>)[0]?.id, "edge-1");
    assert.equal((((patched.nodes as Array<Record<string, unknown>>)[0]?.data) as Record<string, unknown>).text, "after");
    assert.throws(
      () => __canvasAgentRuntimeTestUtils.applyCanvasPatch(document, [{ op: "copy", path: "/nodes" }]),
      /canvas_agent_patch_operation_invalid/,
    );
  });

  it("resolves Canvas patch array entries by stable node and edge ids", () => {
    const document = {
      nodes: [
        { id: "canvas-group-23", type: "group" },
        { id: "node-1", type: "text", data: { text: "before" } },
      ],
      edges: [{ id: "edge-1", sourceNodeId: "canvas-group-23", targetNodeId: "node-1" }],
    };

    const patched = __canvasAgentRuntimeTestUtils.applyCanvasPatch(document, [
      { op: "replace", path: "/nodes/node-1/data/text", value: "after" },
      { op: "remove", path: "/nodes/canvas-group-23" },
      { op: "remove", path: "/edges/edge-1" },
    ]);

    assert.deepEqual((patched.nodes as Array<Record<string, unknown>>).map((node) => node.id), ["node-1"]);
    assert.equal((((patched.nodes as Array<Record<string, unknown>>)[0]?.data) as Record<string, unknown>).text, "after");
    assert.deepEqual(patched.edges, []);
  });

  it("keeps Canvas node keys separate from UUID generation scope targets", () => {
    const targets = __canvasAgentRuntimeTestUtils.resolveCanvasAgentGenerationTargets({
      canvasId: "9c310821-dbb1-46f3-866e-09240007ef31",
      kind: "image",
      agentStepId: "step-1",
    });

    assert.deepEqual(targets, {
      scopeTargetId: "9c310821-dbb1-46f3-866e-09240007ef31",
      nodeKey: "canvas-agent-image-step-1",
    });
    assert.deepEqual(__canvasAgentRuntimeTestUtils.resolveCanvasAgentGenerationTargets({
      canvasId: "9c310821-dbb1-46f3-866e-09240007ef31",
      kind: "image",
      agentStepId: "step-2",
      targetNodeId: "referenced-image-node",
    }), {
      scopeTargetId: "9c310821-dbb1-46f3-866e-09240007ef31",
      nodeKey: "referenced-image-node",
    });
  });

  it("registers a supervised worker launcher for development and production", () => {
    const launcherPath = join(process.cwd(), "scripts", "run-canvas-agent-worker.mjs");
    const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");
    const development = readFileSync(join(process.cwd(), "scripts", "run-creator-dev-stack.mjs"), "utf8");
    const production = readFileSync(join(process.cwd(), "scripts", "run-phone-auth-production.mjs"), "utf8");

    assert.equal(existsSync(launcherPath), true);
    assert.match(packageJson, /"worker:canvas-agent"/);
    assert.match(development, /supervisor\.start\("canvas-agent"/);
    assert.match(production, /supervisor\.start\("canvas-agent"/);
    const launcher = readFileSync(launcherPath, "utf8");
    assert.match(launcher, /createCanvasAgentWorkerRuntime/);
    assert.match(launcher, /canvas_agent_task_deferred/);
    assert.match(launcher, /CANVAS_AGENT_OUTBOX_DISPATCH_INTERVAL_MS[\s\S]*?60_000/);
    assert.match(launcher, /CANVAS_AGENT_FALLBACK_SCAN_INTERVAL_MS, 5_000/);
    assert.match(launcher, /loadCanvasAgentRuntimeConfiguration/);
    assert.match(launcher, /webSearchModelCode: runtimeConfiguration\.webSearchModelCode/);
    assert.match(launcher, /new Worker\(/);
    assert.match(launcher, /CanvasAgentOutboxService/);
    assert.match(launcher, /createCanvasAgentOutboxWakeSignal/);
    assert.match(launcher, /LISTEN.*canvasAgentOutboxWakeChannel/);
    assert.match(launcher, /outboxWakeSignal\.wait/);
    assert.match(launcher, /runMaintenanceOnce/);
    assert.match(launcher, /runQueuedOnce/);
    assert.doesNotMatch(launcher, /runUntilStopped/);
    assert.match(launcher, /createDevDb/);
  });

  it("maps the admin runtime configuration into bounded C-mode policy settings", async () => {
    const normalized = normalizeCanvasAgentRuntimeConfiguration({
      defaultModelCode: " agent-default ",
      expertModelCode: "agent-expert",
      webSearchModelCode: "search-primary",
      maxRounds: 999,
      maxToolCalls: 40,
      allowAutomaticCanvasWrites: true,
      allowAutomaticMediaGeneration: false,
      webSearchProvider: "search-primary",
      mcpAllowlist: ["assets", "assets", ""],
    });
    assert.equal(normalized.maxRounds, 64);
    assert.equal(normalized.maxToolCalls, 40);
    assert.equal(normalized.defaultModelCode, "agent-default");
    assert.equal(normalized.expertModelCode, "agent-expert");
    assert.equal(normalized.webSearchModelCode, "search-primary");
    assert.equal(selectCanvasAgentModelCode(normalized, "b", null), "agent-default");
    assert.equal(selectCanvasAgentModelCode(normalized, "c", undefined), "agent-default");
    assert.equal(selectCanvasAgentModelCode(normalized, "plan", ""), "agent-default");
    assert.equal(selectCanvasAgentModelCode(normalized, "expert", null), "agent-expert");
    assert.equal(selectCanvasAgentModelCode(normalized, "expert", "agent-explicit"), "agent-explicit");
    assert.equal(selectCanvasAgentModelCode({ defaultModelCode: "agent-default", expertModelCode: null }, "expert", null), "agent-default");
    assert.equal(normalized.policy.allowAutomaticCanvasWrites, true);
    assert.equal(normalized.policy.allowAutomaticMediaGeneration, false);
    assert.deepEqual(normalized.policy.webSearchProviderAllowlist, ["search-primary"]);
    assert.deepEqual(normalized.policy.mcpServerAllowlist, ["assets"]);
    const legacySearchSelection = normalizeCanvasAgentRuntimeConfiguration({ webSearchProvider: "legacy-search" });
    assert.equal(legacySearchSelection.webSearchModelCode, "legacy-search");

    const queries: string[] = [];
    const loaded = await loadCanvasAgentRuntimeConfiguration({
      async query<T>(sql: string) {
        queries.push(sql);
        return { rows: [{ value_json: { defaultModelCode: "loaded-default", allowAutomaticCanvasWrites: false, maxRounds: 6 } }] as T[] };
      },
    });
    assert.match(queries[0] ?? "", /runtime_config_entries/);
    assert.equal(loaded.maxRounds, 6);
    assert.equal(loaded.defaultModelCode, "loaded-default");
    assert.equal(loaded.policy.allowAutomaticCanvasWrites, false);
  });

  it("creates an idempotent running Canvas node for Agent media generation", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedActorFixture(db);
    const stepId = randomUUID();
    const taskId = randomUUID();
    const input = {
      canvasId: fixture.canvasId,
      conversationId: randomUUID(),
      agentTaskId: randomUUID(),
      agentStepId: stepId,
      ownerUserId: fixture.userId,
      actorTeamMemberId: fixture.memberId,
      idempotencyKey: `canvas-agent:${stepId}`,
      kind: "image" as const,
      request: { model: "image-model", prompt: "一座雨夜城市" },
      taskId,
      nodeKey: `canvas-agent-image-${stepId}`,
      modelCode: "image-model",
      prompt: "一座雨夜城市",
      now: new Date("2026-07-30T08:00:00.000Z"),
    };
    try {
      await __canvasAgentRuntimeTestUtils.upsertCanvasAgentGenerationNode(db, input);
      await __canvasAgentRuntimeTestUtils.upsertCanvasAgentGenerationNode(db, input);
      const canvas = await findCanvasByCanvasProjectId(db, {
        canvasProjectId: fixture.canvasId,
        userId: fixture.userId,
      });
      const node = canvas?.document.nodes.find((item) => item.id === input.nodeKey);

      assert.equal(canvas?.serverRevision, 2);
      assert.equal(node?.type, "ai-image");
      assert.equal(node?.data?.status, "queued");
      assert.equal(node?.data?.taskId, taskId);
      assert.equal(node?.data?.generationStage, "task_created");
      assert.equal(node?.data?.source, "canvas_agent");
    } finally {
      await db.close();
    }
  });

  it("fails stale Canvas Agent nodes that reference a missing generation task", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedActorFixture(db);
    const stepId = randomUUID();
    const taskId = randomUUID();
    const nodeKey = `canvas-agent-image-${stepId}`;
    try {
      await __canvasAgentRuntimeTestUtils.upsertCanvasAgentGenerationNode(db, {
        canvasId: fixture.canvasId,
        conversationId: randomUUID(),
        agentTaskId: randomUUID(),
        agentStepId: stepId,
        ownerUserId: fixture.userId,
        actorTeamMemberId: fixture.memberId,
        idempotencyKey: `canvas-agent:${stepId}`,
        kind: "image",
        request: { model: "image-model", prompt: "一座雨夜城市" },
        taskId,
        nodeKey,
        modelCode: "image-model",
        prompt: "一座雨夜城市",
        now: new Date("2026-07-30T08:00:00.000Z"),
      });

      const repaired = await failOrphanedCanvasAgentGenerationNodes(db, {
        staleBefore: new Date("2026-07-30T08:01:00.000Z"),
        now: new Date("2026-07-30T08:02:00.000Z"),
      });
      assert.deepEqual(repaired.failedNodeKeys, [nodeKey]);
      const canvas = await findCanvasByCanvasProjectId(db, {
        canvasProjectId: fixture.canvasId,
        userId: fixture.userId,
      });
      const node = canvas?.document.nodes.find((item) => item.id === nodeKey);
      assert.equal(node?.data?.status, "failed");
      assert.equal(node?.data?.failureCode, "generation_task_missing");
    } finally {
      await db.close();
    }
  });

  it("revokes an owner runtime actor when the owner account is disabled", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedActorFixture(db);
    try {
      await db.query("UPDATE users SET status='disabled' WHERE id=$1", [fixture.userId]);
      await assert.rejects(
        __canvasAgentRuntimeTestUtils.resolveRuntimeActor(db, {
          canvasId: fixture.canvasId,
          ownerUserId: fixture.userId,
          actorTeamMemberId: null,
        }),
        /canvas_agent_actor_access_revoked/,
      );
    } finally {
      await db.close();
    }
  });

  it("revokes a member runtime actor when the owner account is disabled", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedActorFixture(db);
    try {
      await db.query("UPDATE users SET status='disabled' WHERE id=$1", [fixture.userId]);
      await assert.rejects(
        __canvasAgentRuntimeTestUtils.resolveRuntimeActor(db, {
          canvasId: fixture.canvasId,
          ownerUserId: fixture.userId,
          actorTeamMemberId: fixture.memberId,
        }),
        /canvas_agent_actor_access_revoked/,
      );
    } finally {
      await db.close();
    }
  });

  it("revokes a member runtime actor when the Canvas assignment is removed", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedActorFixture(db);
    try {
      await db.query("DELETE FROM team_member_canvases WHERE member_id=$1 AND canvas_id=$2", [
        fixture.memberId,
        fixture.canvasId,
      ]);
      await assert.rejects(
        __canvasAgentRuntimeTestUtils.resolveRuntimeActor(db, {
          canvasId: fixture.canvasId,
          ownerUserId: fixture.userId,
          actorTeamMemberId: fixture.memberId,
        }),
        /canvas_agent_actor_access_revoked/,
      );
    } finally {
      await db.close();
    }
  });
});

async function seedActorFixture(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  const userId = randomUUID();
  const memberId = randomUUID();
  const canvasId = randomUUID();
  const memberAccount = `runtime-${memberId.slice(0, 8)}`;
  const memberAccountSuffix = memberId.slice(0, 6);
  await db.query("INSERT INTO users (id, status) VALUES ($1, 'active')", [userId]);
  await db.query(
    `INSERT INTO team_members (
       id, user_id, member_account, member_account_suffix, member_login_account,
       member_name, member_password_hash, member_credits, status
     ) VALUES ($1, $2, $3, $4, $5, 'Runtime Member', 'hash', 100, 'active')`,
    [memberId, userId, memberAccount, memberAccountSuffix, `${memberAccount}@${memberAccountSuffix}`],
  );
  await db.query(
    `INSERT INTO creator_canvas_projects
       (id, title, status, server_revision, created_by_user_id, updated_by_user_id)
     VALUES ($1, 'Runtime Canvas', 'active', 1, $2, $2)`,
    [canvasId, userId],
  );
  await db.query(
    "INSERT INTO team_member_canvases (id, member_id, user_id, canvas_id) VALUES ($1, $2, $3, $4)",
    [randomUUID(), memberId, userId, canvasId],
  );
  return { userId, memberId, canvasId };
}
