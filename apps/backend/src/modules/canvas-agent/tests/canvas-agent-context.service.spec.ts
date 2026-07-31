import assert from "node:assert/strict";
import test from "node:test";

import type { SqlDatabase } from "../../shared/db/sql.ts";
import { CanvasAgentContextService } from "../canvas-agent-context.service.ts";

test("Canvas Agent resolves a file grant with its storage content type", async () => {
  const db: SqlDatabase = {
    async query<T>(sql: string) {
      if (sql.includes("UPDATE canvas_agent_file_grants")) return { rows: [] as T[] };
      if (sql.includes("JOIN storage_objects storage")) {
        return { rows: [{
          storage_object_id: "storage-video",
          purpose: "动作参考",
          content_type: "video/mp4",
        }] as T[] };
      }
      throw new Error(`unexpected_query:${sql}`);
    },
  };
  const service = new CanvasAgentContextService({
    db,
    loadCanvasContext: async () => ({}),
  });
  const grant = await service.resolveFileGrant({
    grantId: "grant-video",
    canvasId: "canvas-1",
    conversationId: "conversation-1",
    actor: {
      ownerUserId: "owner-1",
      actorTeamMemberId: null,
      capabilities: new Set(),
    },
    now: new Date("2026-07-31T00:00:00.000Z"),
  });
  assert.deepEqual(grant, {
    storageObjectId: "storage-video",
    purpose: "动作参考",
    contentType: "video/mp4",
  });
});

test("Canvas Agent context compacts long conversations without loading 1000 messages", async () => {
  let initialLimit = 0;
  let storedSummary: Record<string, unknown> | undefined;
  const db: SqlDatabase = {
    async query<T>(sql: string, params: unknown[] = []) {
      if (sql.includes("SELECT summary_json FROM canvas_agent_conversations")) {
        return { rows: [{ summary_json: {} }] as T[] };
      }
      if (sql.includes("UPDATE canvas_agent_file_grants")) {
        return { rows: [] as T[] };
      }
      if (sql.includes("FROM canvas_agent_file_grants file_grant")) {
        return { rows: [] as T[] };
      }
      if (sql.includes("SELECT id FROM canvas_agent_conversations")) {
        return { rows: [{ id: "conversation-1" }] as T[] };
      }
      if (sql.includes("COUNT(*) OVER()")) {
        const rows = Array.from({ length: 80 }, (_, index) => {
          const sequence = 112 - index;
          return {
            role: "user",
            content_json: { text: `message-${sequence}` },
            sequence,
            total_count: 112,
          };
        });
        return { rows: rows as T[] };
      }
      if (sql.includes("FROM canvas_agent_messages")) {
        initialLimit = Number(params[2]);
        const rows = Array.from({ length: 9 }, (_, index) => {
          const sequence = 120 - index;
          return { role: "user", content_json: { text: `message-${sequence}` }, sequence };
        });
        return { rows: rows as T[] };
      }
      if (sql.includes("UPDATE canvas_agent_conversations")) {
        storedSummary = JSON.parse(String(params[4]));
        return { rows: [] as T[] };
      }
      throw new Error(`unexpected_query:${sql}`);
    },
  };
  const service = new CanvasAgentContextService({
    db,
    loadCanvasContext: async () => ({ revision: 1 }),
    maxMessages: 8,
    maxSerializedChars: 100_000,
  });

  const context = await service.build({
    canvasId: "10000000-0000-4000-8000-000000000001",
    conversationId: "20000000-0000-4000-8000-000000000001",
    actor: {
      ownerUserId: "30000000-0000-4000-8000-000000000001",
      actorTeamMemberId: null,
      capabilities: new Set(),
    },
  });

  assert.equal(initialLimit, 9);
  assert.equal(context.messages.length, 8);
  assert.equal(context.messages[0]?.sequence, 113);
  assert.equal(context.messages.at(-1)?.sequence, 120);
  assert.deepEqual(context.fileGrants, []);
  assert.equal(storedSummary?.throughSequence, 112);
  assert.equal(storedSummary?.messageCount, 112);
  assert.equal(Array.isArray(storedSummary?.items) ? storedSummary.items.length : 0, 80);
});
