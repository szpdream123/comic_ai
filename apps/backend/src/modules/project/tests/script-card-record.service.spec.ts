import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  deleteScriptCardRecord,
  updateScriptCardRecord,
} from "../script-card-record.service.ts";

describe("script card records", { concurrency: false }, () => {
  it("updates script card metadata within its owning user", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedScript(db);
      const updated = await updateScriptCardRecord(db, {
        ownerUserId: ids.userId,
        scriptId: ids.scriptId,
        title: "独立剧本标题",
        coverImageUrl: "/uploads/scripts/cover.png",
        coverStorageObjectId: null,
        now: new Date("2026-06-09T08:10:00.000Z"),
      });

      assert.equal(updated?.title, "独立剧本标题");
      assert.equal(updated?.coverImageUrl, "/uploads/scripts/cover.png");
      assert.equal(updated?.ownerUserId, ids.userId);
    } finally {
      await db.close();
    }
  });

  it("soft deletes only a script owned by the requested user", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedScript(db);
      const deleted = await deleteScriptCardRecord(db, {
        ownerUserId: ids.userId,
        scriptId: ids.scriptId,
        now: new Date("2026-06-09T08:11:00.000Z"),
      });

      assert.equal(deleted?.id, ids.scriptId);
      assert.ok(deleted?.deletedAt instanceof Date);

      const repeated = await deleteScriptCardRecord(db, {
        ownerUserId: ids.otherUserId,
        scriptId: ids.scriptId,
        now: new Date("2026-06-09T08:12:00.000Z"),
      });
      assert.equal(repeated, null);
    } finally {
      await db.close();
    }
  });
});

const ids = {
  userId: "00000000-0000-4000-8000-000000000001",
  otherUserId: "00000000-0000-4000-8000-000000000002",
  scriptId: "40000000-0000-4000-8000-000000000001",
};

async function seedScript(db: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES
        ($1, '13800138000', 'active'),
        ($2, '13800138001', 'active')
    `,
    [ids.userId, ids.otherUserId],
  );
  await db.query(
    `
      INSERT INTO scripts (
        id,
        owner_user_id,
        status,
        input_text,
        created_by_user_id
      )
      VALUES ($1, $2, 'ready', '剧本文本', $2)
    `,
    [ids.scriptId, ids.userId],
  );
}
