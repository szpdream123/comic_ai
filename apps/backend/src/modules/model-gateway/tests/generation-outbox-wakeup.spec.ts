import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Client } from "pg";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  createGenerationOutboxWakeSignal,
  generationOutboxWakeChannel,
} from "../generation-outbox-wakeup.ts";

describe("generation outbox wakeup", { concurrency: false }, () => {
  it("coalesces notifications and keeps timeout scanning as a fallback", async () => {
    const signal = createGenerationOutboxWakeSignal();
    signal.notify();
    signal.notify();

    assert.equal(await signal.wait(100), "notified");
    assert.equal(await signal.wait(1), "timeout");
    signal.close();
    assert.equal(await signal.wait(100), "closed");
  });

  it("notifies PostgreSQL listeners when a generation event becomes ready", async () => {
    const db = await createMigratedTestDb();
    const connectionString = process.env.DATABASE_URL?.trim();
    assert.ok(connectionString);
    const listener = new Client({ connectionString });
    const outboxEventId = "90000000-0000-4000-8000-000000000091";

    try {
      await listener.connect();
      await listener.query(`LISTEN ${generationOutboxWakeChannel}`);
      const notification = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("generation_outbox_notify_timeout")), 5_000);
        listener.on("notification", (message) => {
          if (message.channel === generationOutboxWakeChannel && message.payload === outboxEventId) {
            clearTimeout(timeout);
            resolve(message.payload);
          }
        });
      });
      await db.query(`
        INSERT INTO outbox_events (id, event_type, payload_json, status, available_at, created_at, updated_at)
        VALUES ($1, 'generation.task.created', '{}'::jsonb, 'pending', now(), now(), now())
      `, [outboxEventId]);

      assert.equal(await notification, outboxEventId);
    } finally {
      await listener.query(`UNLISTEN ${generationOutboxWakeChannel}`).catch(() => undefined);
      await listener.end().catch(() => undefined);
      await db.close();
    }
  });
});
