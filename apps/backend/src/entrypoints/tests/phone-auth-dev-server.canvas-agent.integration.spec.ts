import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import {
  createUserPasswordHash,
  defaultPasswordFromPhone,
} from "../../modules/identity/team-account-credentials.service.ts";
import { grantCredits } from "../../modules/credit-billing/credit-ledger.service.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

describe("Canvas Agent HTTP integration", { concurrency: false }, () => {
  it("keeps Canvas Agent conversations and events scoped to the owner/member principal", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({
      db,
      env: { NODE_ENV: "test", AUTH_SESSION_REDIS_CACHE_ENABLED: "false" },
      repairScheduler: { enabled: false },
    });
    const ownerUserId = randomUUID();
    const otherUserId = randomUUID();
    const memberId = randomUUID();
    const peerMemberId = randomUUID();
    const ownerPhone = uniquePhone("138");
    const otherPhone = uniquePhone("139");
    const canvasId = randomUUID();
    const storageObjectId = randomUUID();
    try {
      await seedUser(db, ownerUserId, ownerPhone);
      await seedUser(db, otherUserId, otherPhone);
      await db.query(
        `
          INSERT INTO team_members (
            id, user_id, member_account, member_account_suffix, member_login_account,
            member_name, member_password_hash, member_credits, status
          ) VALUES
            ($1, $2, 'canvas-agent-member', 'uagent', 'canvas-agent-member@uagent',
             'Canvas Agent Member', $3, 1000, 'active'),
            ($4, $2, 'canvas-agent-peer', 'uagent', 'canvas-agent-peer@uagent',
             'Canvas Agent Peer', $5, 1000, 'active')
        `,
        [
          memberId,
          ownerUserId,
          await createUserPasswordHash("agent-member-password"),
          peerMemberId,
          await createUserPasswordHash("agent-peer-password"),
        ],
      );
      await db.query(
        `
          INSERT INTO creator_canvas_projects
            (id, title, status, server_revision, created_by_user_id, updated_by_user_id)
          VALUES ($1, 'Agent integration canvas', 'active', 1, $2, $2)
        `,
        [canvasId, ownerUserId],
      );
      await db.query(
        `
          INSERT INTO team_member_canvases (id, member_id, user_id, canvas_id)
          VALUES ($1, $2, $3, $4), ($5, $6, $3, $4)
        `,
        [randomUUID(), memberId, ownerUserId, canvasId, randomUUID(), peerMemberId],
      );
      await db.query(
        `
          INSERT INTO storage_objects (
            id,canvas_project_id,bucket,object_key,content_type,size_bytes,
            created_by_user_id,provider,status
          ) VALUES ($1,$2,'canvas-agent-test','grants/reference.png','image/png',128,$3,'creator-dev','available')
        `,
        [storageObjectId, canvasId, ownerUserId],
      );
      await seedAgentModel(db);
      await db.query(
        `INSERT INTO runtime_config_entries (key, value_json, value_type, scope)
         VALUES ('canvas_agent.runtime', $1::jsonb, 'json', 'global')`,
        [JSON.stringify({ defaultModelCode: "canvas-agent-test-model", expertModelCode: "canvas-agent-test-model" })],
      );
      await server.listen(0);

      const ownerCookie = await passwordLogin(server.origin, ownerPhone);
      const otherCookie = await passwordLogin(server.origin, otherPhone);
      const memberCookie = await teamMemberPasswordLogin(
        server.origin,
        "canvas-agent-member@uagent",
        "agent-member-password",
      );
      const peerMemberCookie = await teamMemberPasswordLogin(
        server.origin,
        "canvas-agent-peer@uagent",
        "agent-peer-password",
      );

      const agentModels = await api(server.origin, `/api/canvas/${canvasId}/agent-models`, memberCookie);
      assert.equal(agentModels.status, 200, JSON.stringify(agentModels.body));
      assert.deepEqual(agentModels.body.data.models.map((model: { modelCode: string }) => model.modelCode), ["canvas-agent-test-model"]);
      assert.equal("providerConfig" in agentModels.body.data.models[0], false);
      assert.equal(JSON.stringify(agentModels.body.data.models).includes("test-agent-key"), false);
      const memberStorageHealth = await api(server.origin, `/api/canvas/${canvasId}/storage-health`, memberCookie);
      assert.equal(memberStorageHealth.status, 200, JSON.stringify(memberStorageHealth.body));
      assert.equal(memberStorageHealth.body.data.health.objects.count, 1);
      const memberAnnotationLayers = await api(server.origin, `/api/canvas/${canvasId}/annotation-layers?nodeKey=image-node`, memberCookie);
      assert.equal(memberAnnotationLayers.status, 200, JSON.stringify(memberAnnotationLayers.body));
      assert.deepEqual(memberAnnotationLayers.body.data.layers, []);
      const otherModels = await api(server.origin, `/api/canvas/${canvasId}/agent-models`, otherCookie);
      assert.equal(otherModels.status, 404, JSON.stringify(otherModels.body));

      const memberConversation = await api(server.origin, `/api/canvas/${canvasId}/conversations`, memberCookie, {
        method: "POST",
        body: { title: "成员 Agent" },
      });
      assert.equal(memberConversation.status, 201, JSON.stringify(memberConversation.body));
      const conversationId = String(memberConversation.body.data.conversation.id);

      const createdGrant = await api(
        server.origin,
        `/api/canvas/${canvasId}/conversations/${conversationId}/file-grants`,
        memberCookie,
        { method: "POST", body: { storageObjectId, purpose: "agent-reference", expiresInSeconds: 600 } },
      );
      assert.equal(createdGrant.status, 201, JSON.stringify(createdGrant.body));
      const grantId = String(createdGrant.body.data.grant.id);
      const grants = await api(
        server.origin,
        `/api/canvas/${canvasId}/conversations/${conversationId}/file-grants`,
        memberCookie,
      );
      assert.equal(grants.status, 200, JSON.stringify(grants.body));
      assert.deepEqual(grants.body.data.grants.map((grant: { id: string }) => grant.id), [grantId]);
      const peerGrants = await api(
        server.origin,
        `/api/canvas/${canvasId}/conversations/${conversationId}/file-grants`,
        peerMemberCookie,
      );
      assert.equal(peerGrants.status, 404, JSON.stringify(peerGrants.body));
      const revokedGrant = await api(
        server.origin,
        `/api/canvas/${canvasId}/conversations/${conversationId}/file-grants/${grantId}`,
        memberCookie,
        { method: "DELETE" },
      );
      assert.equal(revokedGrant.status, 200, JSON.stringify(revokedGrant.body));

      const memberTask = await api(
        server.origin,
        `/api/canvas/${canvasId}/conversations/${conversationId}/messages`,
        memberCookie,
        {
          method: "POST",
          body: { mode: "b", message: "生成一份分镜计划" },
        },
      );
      assert.equal(memberTask.status, 202, JSON.stringify(memberTask.body));
      const taskId = String(memberTask.body.data.task.id);

      const taskRow = await db.query<{
        owner_user_id: string;
        actor_team_member_id: string | null;
        model_code: string;
      }>(
        "SELECT owner_user_id, actor_team_member_id, model_code FROM canvas_agent_tasks WHERE id = $1",
        [taskId],
      );
      assert.deepEqual(taskRow.rows[0], {
        owner_user_id: ownerUserId,
        actor_team_member_id: memberId,
        model_code: "canvas-agent-test-model",
      });

      const messageHistory = await api(
        server.origin,
        `/api/canvas/${canvasId}/conversations/${conversationId}/messages?limit=20`,
        memberCookie,
      );
      assert.equal(messageHistory.status, 200, JSON.stringify(messageHistory.body));
      assert.equal(messageHistory.body.data.messages.length, 1);
      assert.equal(messageHistory.body.data.messages[0].role, "user");
      assert.deepEqual(messageHistory.body.data.messages[0].content, { text: "生成一份分镜计划" });
      assert.equal("modelConfigSnapshot" in messageHistory.body.data.messages[0], false);
      const peerMessageHistory = await api(
        server.origin,
        `/api/canvas/${canvasId}/conversations/${conversationId}/messages`,
        peerMemberCookie,
      );
      assert.equal(peerMessageHistory.status, 404, JSON.stringify(peerMessageHistory.body));

      const memberEvents = await api(
        server.origin,
        `/api/canvas/${canvasId}/agent-tasks/${taskId}/events`,
        memberCookie,
      );
      assert.equal(memberEvents.status, 200, JSON.stringify(memberEvents.body));
      assert.ok(memberEvents.body.data.events.some((event: { eventType: string }) => event.eventType === "task.created"));

      const eventSequence = Math.max(...memberEvents.body.data.events.map((event: { sequence: number }) => event.sequence));
      const eventStream = await fetch(
        `${server.origin}/api/canvas/${canvasId}/agent-tasks/${taskId}/events?stream=1`,
        { headers: { accept: "text/event-stream", cookie: memberCookie, "last-event-id": "0" } },
      );
      assert.equal(eventStream.status, 200);
      assert.match(eventStream.headers.get("content-type") ?? "", /^text\/event-stream/);
      const eventStreamText = await eventStream.text();
      assert.match(eventStreamText, /event: task\.created/);
      assert.match(eventStreamText, /id: 1\n/);

      const resumedEventStream = await fetch(
        `${server.origin}/api/canvas/${canvasId}/agent-tasks/${taskId}/events?stream=1&after=0`,
        { headers: { accept: "text/event-stream", cookie: memberCookie, "last-event-id": String(eventSequence) } },
      );
      assert.equal(resumedEventStream.status, 200);
      const resumedEventStreamText = await resumedEventStream.text();
      assert.doesNotMatch(resumedEventStreamText, /\nid: \d+\n/);
      assert.match(resumedEventStreamText, new RegExp(`canvas-agent cursor ${eventSequence}`));

      const liveAbort = new AbortController();
      const liveEventStream = await fetch(
        `${server.origin}/api/canvas/${canvasId}/agent-tasks/${taskId}/events?live=1`,
        {
          headers: { accept: "text/event-stream", cookie: memberCookie, "last-event-id": String(eventSequence) },
          signal: liveAbort.signal,
        },
      );
      assert.equal(liveEventStream.status, 200);
      const replanResult = await api(
        server.origin,
        `/api/canvas/${canvasId}/agent-tasks/${taskId}/replan`,
        memberCookie,
        { method: "POST", body: { reason: "live stream regression" } },
      );
      assert.equal(replanResult.status, 200, JSON.stringify(replanResult.body));
      const liveEventText = await readSseUntil(liveEventStream.body?.getReader(), "event: task.replanned");
      liveAbort.abort();
      assert.match(liveEventText, /event: task\.replanned/);
      assert.match(liveEventText, new RegExp(`id: ${eventSequence + 1}\\n`));

      const ownerEvents = await api(
        server.origin,
        `/api/canvas/${canvasId}/agent-tasks/${taskId}/events`,
        ownerCookie,
      );
      assert.equal(ownerEvents.status, 200, JSON.stringify(ownerEvents.body));

      const peerMemberEvents = await api(
        server.origin,
        `/api/canvas/${canvasId}/agent-tasks/${taskId}/events`,
        peerMemberCookie,
      );
      assert.equal(peerMemberEvents.status, 404, JSON.stringify(peerMemberEvents.body));

      const otherEvents = await api(
        server.origin,
        `/api/canvas/${canvasId}/agent-tasks/${taskId}/events`,
        otherCookie,
      );
      assert.equal(otherEvents.status, 404, JSON.stringify(otherEvents.body));

      const conversations = await api(
        server.origin,
        `/api/canvas/${canvasId}/conversations`,
        memberCookie,
      );
      assert.equal(conversations.status, 200, JSON.stringify(conversations.body));
      assert.equal(conversations.body.data.conversations.length, 1);
      assert.equal(conversations.body.data.conversations[0].id, conversationId);
      assert.equal(conversations.body.data.conversations[0].taskId, taskId);

      const renamed = await api(
        server.origin,
        `/api/canvas/${canvasId}/conversations`,
        memberCookie,
        { method: "PATCH", body: { conversationId, title: "成员 Agent（已归档）", status: "archived", pinned: true } },
      );
      assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
      assert.equal(renamed.body.data.conversation.status, "archived");
      assert.equal(renamed.body.data.conversation.pinned, true);

      const restored = await api(
        server.origin,
        `/api/canvas/${canvasId}/conversations`,
        memberCookie,
        { method: "PATCH", body: { conversationId, status: "active" } },
      );
      assert.equal(restored.status, 200, JSON.stringify(restored.body));
      assert.equal(restored.body.data.conversation.status, "active");

      const deleted = await api(
        server.origin,
        `/api/canvas/${canvasId}/conversations?conversationId=${encodeURIComponent(conversationId)}`,
        memberCookie,
        { method: "DELETE" },
      );
      assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
      const grantState = await db.query<{ status: string }>(
        "SELECT status FROM canvas_agent_file_grants WHERE id = $1",
        [grantId],
      );
      assert.equal(grantState.rows[0]?.status, "revoked");
      const taskState = await db.query<{ status: string }>(
        "SELECT status FROM canvas_agent_tasks WHERE id = $1",
        [taskId],
      );
      assert.equal(taskState.rows[0]?.status, "cancel_requested");

      const otherConversation = await api(
        server.origin,
        `/api/canvas/${canvasId}/conversations`,
        otherCookie,
        { method: "POST", body: { title: "越权 Agent" } },
      );
      assert.equal(otherConversation.status, 404, JSON.stringify(otherConversation.body));
    } finally {
      await server.close().catch(() => undefined);
      await db.close();
    }
  });

});

async function seedUser(db: Awaited<ReturnType<typeof createMigratedTestDb>>, userId: string, phone: string) {
  await db.query(
    "INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1, $2, $3, 'active')",
    [userId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
  );
}

async function seedAgentModel(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  await db.query(
    `
      INSERT INTO ai_model_configs (
        id, model_code, display_name, provider_name, provider_model, provider_protocol,
        invocation_mode, media_type, task_modes_json, capabilities_json, parameter_schema_json,
        default_params_json, provider_config_json, pricing_json, limits_json, ui_config_json,
        status, sort_order, remark
      ) VALUES ($1, 'canvas-agent-test-model', 'Canvas Agent Test', 'test', 'test-chat',
        'openai_compatible_chat', 'stream', 'text', '["text.canvas_agent"]'::jsonb,
        '{"stream":true,"toolCalling":true,"jsonSchema":true,"contextWindow":8192}'::jsonb,
        '{}'::jsonb, '{}'::jsonb,
        '{"baseURL":"https://agent.example.test","apiKey":"test-agent-key"}'::jsonb,
        '{"baseCredits":1}'::jsonb, '{}'::jsonb, '{"agentEligible":true}'::jsonb,
        'active', -1000, 'integration test')
    `,
    [randomUUID()],
  );
}

async function seedGenerationAccess(db: Awaited<ReturnType<typeof createMigratedTestDb>>, userId: string) {
  const now = new Date();
  await db.query(
    `
      INSERT INTO user_memberships
        (id, user_id, membership_tier, purchase_at, expires_at, gift_credits, status, created_at, updated_at)
      VALUES ($1, $2, 'professional', $3, $4, 0, 'active', $3, $3)
    `,
    [randomUUID(), userId, now, new Date(now.getTime() + 86_400_000)],
  );
  await db.query(
    `
      INSERT INTO user_entitlements
        (id, user_id, entitlement_key, status, source, expires_at, created_at, updated_at)
      VALUES ($1, $2, 'priority_generation', 'active', 'dev_seed', $3, $4, $4)
    `,
    [randomUUID(), userId, new Date(now.getTime() + 86_400_000), now],
  );
  await grantCredits(db, {
    userId,
    amount: 100,
    sourceType: "test_credit_seed",
    sourceId: randomUUID(),
    reason: "Canvas Agent integration test",
    createdByUserId: userId,
    now,
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

async function teamMemberPasswordLogin(origin: string, account: string, password: string) {
  const response = await fetch(`${origin}/api/auth/password/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account, password, actorType: "team_member" }),
  });
  assert.equal(response.status, 200, await response.text());
  return response.headers.get("set-cookie") ?? "";
}

async function api(
  origin: string,
  path: string,
  cookie: string,
  options: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
) {
  const response = await fetch(`${origin}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.headers ?? {}),
      cookie,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
}

async function readSseUntil(
  reader: ReadableStreamDefaultReader<Uint8Array> | undefined,
  marker: string,
) {
  assert.ok(reader, "SSE response body is required");
  const decoder = new TextDecoder();
  let text = "";
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        while (!text.includes(marker)) {
          const next = await reader.read();
          if (next.done) break;
          text += decoder.decode(next.value, { stream: true });
        }
        return text + decoder.decode();
      })(),
      new Promise<string>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`SSE marker timeout: ${marker}`)), 7_000);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function uniquePhone(prefix: string) {
  return `${prefix}${String(Math.floor(Math.random() * 1_000_00000)).padStart(8, "0")}`;
}
