import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  claimCanvasAgentConversationLock,
  heartbeatCanvasAgentConversationLock,
  releaseCanvasAgentConversationLock,
} from "../canvas-agent-task.service.ts";

test("Canvas Agent conversation locks serialize workers and recover after lease expiry", async () => {
  const db = await createMigratedTestDb();
  const userId = randomUUID();
  const canvasId = randomUUID();
  const conversationId = randomUUID();
  const startedAt = new Date("2026-07-25T14:00:00.000Z");
  try {
    await db.query("INSERT INTO users (id, phone_e164, status) VALUES ($1,$2,'active')", [userId, `13${String(Date.now()).slice(-9)}`]);
    await db.query(`
      INSERT INTO creator_canvas_projects (id,title,status,server_revision,created_by_user_id,updated_by_user_id)
      VALUES ($1,'Agent lock','active',1,$2,$2)
    `, [canvasId, userId]);
    await db.query(`
      INSERT INTO canvas_agent_conversations (id,canvas_id,owner_user_id,title,created_at,updated_at)
      VALUES ($1,$2,$3,'Lock test',$4,$4)
    `, [conversationId, canvasId, userId, startedAt]);

    assert.equal(await claimCanvasAgentConversationLock(db, {
      conversationId, workerId: "worker-a", leaseMs: 1_000, now: startedAt,
    }), true);
    assert.equal(await claimCanvasAgentConversationLock(db, {
      conversationId, workerId: "worker-b", leaseMs: 1_000, now: new Date(startedAt.getTime() + 500),
    }), false);
    assert.equal(await heartbeatCanvasAgentConversationLock(db, {
      conversationId, workerId: "worker-b", leaseMs: 1_000, now: new Date(startedAt.getTime() + 600),
    }), false);
    assert.equal(await claimCanvasAgentConversationLock(db, {
      conversationId, workerId: "worker-b", leaseMs: 1_000, now: new Date(startedAt.getTime() + 1_001),
    }), true);

    await releaseCanvasAgentConversationLock(db, { conversationId, workerId: "worker-a" });
    const held = await db.query<{ locked_by: string }>(
      "SELECT locked_by FROM canvas_agent_conversation_locks WHERE conversation_id=$1",
      [conversationId],
    );
    assert.equal(held.rows[0]?.locked_by, "worker-b");
    await releaseCanvasAgentConversationLock(db, { conversationId, workerId: "worker-b" });
    assert.equal((await db.query("SELECT 1 FROM canvas_agent_conversation_locks WHERE conversation_id=$1", [conversationId])).rows.length, 0);
  } finally {
    await db.close();
  }
});
