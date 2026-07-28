import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { CanvasAgentKnowledgeService } from "../../modules/canvas-agent/canvas-agent-knowledge.service.ts";
import {
  createCanvasAgentStep,
  createCanvasAgentTask,
  requestCanvasAgentApproval,
  updateCanvasAgentStep,
} from "../../modules/canvas-agent/canvas-agent-task.service.ts";
import type { CanvasAgentActor } from "../../modules/canvas-agent/canvas-agent.types.ts";
import {
  createUserPasswordHash,
  defaultPasswordFromPhone,
} from "../../modules/identity/team-account-credentials.service.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

describe("Canvas Agent memory and skip HTTP", { concurrency: false }, () => {
  it("edits scoped memories and durably skips only safe steps", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({
      db,
      env: { NODE_ENV: "test", AUTH_SESSION_REDIS_CACHE_ENABLED: "false" },
      repairScheduler: { enabled: false },
    });
    const ownerUserId = randomUUID();
    const canvasId = randomUUID();
    const conversationId = randomUUID();
    const phone = uniquePhone();
    const actor: CanvasAgentActor = {
      ownerUserId,
      actorTeamMemberId: null,
      capabilities: new Set(["canvas:view", "canvas:run"]),
    };
    const now = new Date("2026-07-27T00:00:00.000Z");
    try {
      await db.query(
        "INSERT INTO users (id,phone_e164,password_hash,status) VALUES ($1,$2,$3,'active')",
        [ownerUserId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
      );
      await db.query(`
        INSERT INTO creator_canvas_projects (id,title,status,server_revision,created_by_user_id,updated_by_user_id)
        VALUES ($1,'Memory skip HTTP','active',1,$2,$2)
      `, [canvasId, ownerUserId]);
      await db.query(`
        INSERT INTO canvas_agent_conversations (id,canvas_id,owner_user_id,title,created_at,updated_at)
        VALUES ($1,$2,$3,'Memory conversation',$4,$4)
      `, [conversationId, canvasId, ownerUserId, now]);
      const knowledge = new CanvasAgentKnowledgeService(db);
      const stored = await knowledge.remember({
        canvasId, conversationId, actor, key: "style.palette",
        value: { primary: "blue", category: "style" }, now,
      });
      const task = await seedTask(db, { canvasId, conversationId, actor, now });
      const waitingStep = await createCanvasAgentStep(db, {
        taskId: task.id, kind: "tool", toolId: "canvas.update", callId: "update-1",
        effect: "canvas_write", input: { nodeId: "node-1" }, now,
      });
      await requestCanvasAgentApproval(db, {
        taskId: task.id, stepId: waitingStep.id, actor, effect: "canvas_write", reason: "write", now,
      });
      await server.listen(0);
      const cookie = await passwordLogin(server.origin, phone);

      const listed = await api(server.origin, `/api/canvas/${canvasId}/conversations/${conversationId}/memories?includeInactive=true&category=style&source=user`, cookie);
      assert.equal(listed.status, 200, JSON.stringify(listed.body));
      assert.equal(listed.body.data.memories[0].id, stored.id);
      assert.equal(listed.body.data.memories[0].source, "user");
      const disabled = await api(server.origin, `/api/canvas/${canvasId}/conversations/${conversationId}/memories/${stored.id}`, cookie, {
        method: "PATCH",
        body: { key: "style.palette.primary", value: { primary: "red" }, category: "style", status: "revoked" },
      });
      assert.equal(disabled.status, 200, JSON.stringify(disabled.body));
      assert.equal(disabled.body.data.memory.status, "revoked");
      assert.equal(disabled.body.data.memory.value.category, "style");
      const enabled = await api(server.origin, `/api/canvas/${canvasId}/conversations/${conversationId}/memories/${stored.id}`, cookie, {
        method: "PATCH", body: { status: "active" },
      });
      assert.equal(enabled.status, 200, JSON.stringify(enabled.body));

      const skipped = await api(server.origin, `/api/canvas/${canvasId}/agent-tasks/${task.id}/skip`, cookie, {
        method: "POST", body: { stepId: waitingStep.id, reason: "not needed" },
      });
      assert.equal(skipped.status, 200, JSON.stringify(skipped.body));
      assert.equal(skipped.body.data.result.status, "skipped");

      const runningTask = await seedTask(db, { canvasId, conversationId, actor, now: new Date("2026-07-27T00:01:00.000Z") });
      const runningStep = await createCanvasAgentStep(db, {
        taskId: runningTask.id, kind: "tool", toolId: "media.generate", callId: "generate-1",
        effect: "media_generation", input: {}, now,
      });
      await db.query("UPDATE canvas_agent_tasks SET status='running' WHERE id=$1", [runningTask.id]);
      await updateCanvasAgentStep(db, { stepId: runningStep.id, status: "running", fromStatuses: ["created"], now });
      const unsafe = await api(server.origin, `/api/canvas/${canvasId}/agent-tasks/${runningTask.id}/skip`, cookie, {
        method: "POST", body: { stepId: runningStep.id },
      });
      assert.equal(unsafe.status, 409, JSON.stringify(unsafe.body));
      assert.equal(unsafe.body.errorCode, "canvas_agent_step_skip_unsafe_running");

      const deleted = await api(server.origin, `/api/canvas/${canvasId}/conversations/${conversationId}/memories/${stored.id}`, cookie, { method: "DELETE" });
      assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
      assert.equal(deleted.body.data.memory.deleted, true);
    } finally {
      await server.close().catch(() => undefined);
      await db.close();
    }
  });
});

async function seedTask(db: Awaited<ReturnType<typeof createMigratedTestDb>>, input: {
  canvasId: string; conversationId: string; actor: CanvasAgentActor; now: Date;
}) {
  return createCanvasAgentTask(db, {
    ...input,
    mode: "b",
    modelCode: "agent-test",
    modelConfigSnapshot: {
      version: 1, modelConfigId: randomUUID(), modelCode: "agent-test",
      providerName: "test", providerModel: "test", providerProtocol: "openai_compatible_chat",
      providerConfigRevisionId: "revision:test", credentialVersionRef: "credential:test",
      capabilities: {}, pricing: {}, limits: {}, providerConfig: {},
    },
    baseRevision: 1,
    userMessage: { text: "test" },
  });
}

async function passwordLogin(origin: string, phone: string) {
  const response = await fetch(`${origin}/api/auth/password/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account: phone, password: defaultPasswordFromPhone(phone) }),
  });
  assert.equal(response.status, 200, await response.text());
  return response.headers.get("set-cookie") ?? "";
}

async function api(origin: string, path: string, cookie: string, options: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method: options.method ?? "GET",
    headers: { cookie, ...(options.body === undefined ? {} : { "content-type": "application/json" }) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
}

function uniquePhone() {
  return `136${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}`;
}
