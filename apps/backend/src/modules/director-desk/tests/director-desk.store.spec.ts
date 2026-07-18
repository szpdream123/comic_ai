import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { SqlDirectorDeskStore } from "../director-desk.store.ts";

describe("SQL director desk store", () => {
  it("creates concurrent sequential desk keys and keeps every operation user-scoped", async () => {
    const db = await createMigratedTestDb();
    try {
      const firstUserId = randomUUID();
      const secondUserId = randomUUID();
      await db.query(
        "INSERT INTO users (id, phone_e164, status) VALUES ($1, $2, 'active'), ($3, $4, 'active')",
        [firstUserId, "18571521874", secondUserId, "18571521875"],
      );
      const store = new SqlDirectorDeskStore(db);
      const now = new Date("2026-07-18T08:00:00.000Z");

      const created = await Promise.all([
        store.create({ userId: firstUserId, createdByMemberId: null, deskKey: null, name: null, now }),
        store.create({ userId: firstUserId, createdByMemberId: null, deskKey: null, name: null, now }),
      ]);
      assert.deepEqual(created.map((desk) => desk.id).sort(), ["desk_1", "desk_2"]);
      assert.equal((await store.list({ userId: secondUserId })).length, 0);

      assert.equal(await store.writeScene({
        userId: secondUserId,
        deskKey: "desk_1",
        scene: { blocked: true },
        now,
      }), false);
      assert.equal(await store.writeSceneIfEmpty({
        userId: firstUserId,
        deskKey: "desk_1",
        scene: { migrated: true },
        now,
      }), true);
      assert.equal(await store.writeSceneIfEmpty({
        userId: firstUserId,
        deskKey: "desk_1",
        scene: { overwritten: true },
        now,
      }), false);
      assert.equal(await store.delete({ userId: secondUserId, deskKey: "desk_1" }), false);
      assert.deepEqual(await store.readScene({ userId: firstUserId, deskKey: "desk_1" }), { migrated: true });
    } finally {
      await db.close();
    }
  });

  it("records the creating team member and restores an ensured archived desk", async () => {
    const db = await createMigratedTestDb();
    try {
      const userId = randomUUID();
      const memberId = randomUUID();
      await db.query(
        "INSERT INTO users (id, phone_e164, status) VALUES ($1, $2, 'active')",
        [userId, "18571521876"],
      );
      await db.query(
        `
          INSERT INTO team_members (
            id, user_id, member_account, member_account_suffix, member_login_account,
            member_name, member_password_hash, status
          )
          VALUES (
            $1, $2, 'desk-member', 'member01', 'desk-member@member01',
            '导演成员', 'test', 'active'
          )
        `,
        [memberId, userId],
      );
      const store = new SqlDirectorDeskStore(db);
      const first = await store.create({
        userId,
        createdByMemberId: memberId,
        deskKey: "host-instance",
        name: "现场导演台",
        now: new Date("2026-07-18T08:00:00.000Z"),
      });
      await store.update({
        userId,
        deskKey: first.id,
        status: "archived",
        now: new Date("2026-07-18T09:00:00.000Z"),
      });
      const restored = await store.create({
        userId,
        createdByMemberId: memberId,
        deskKey: first.id,
        name: null,
        now: new Date("2026-07-18T10:00:00.000Z"),
      });
      const row = await db.query<{ created_by_member_id: string; status: string }>(
        "SELECT created_by_member_id, status FROM director_desks WHERE user_id = $1 AND desk_key = $2",
        [userId, first.id],
      );

      assert.equal(restored.name, "现场导演台");
      assert.equal(row.rows[0]?.created_by_member_id, memberId);
      assert.equal(row.rows[0]?.status, "active");
    } finally {
      await db.close();
    }
  });
});
