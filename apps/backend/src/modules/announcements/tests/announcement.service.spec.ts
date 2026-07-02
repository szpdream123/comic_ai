import assert from "node:assert/strict";
import { test } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createAnnouncementService } from "../announcement.service.ts";

test("announcement service responses expose only title and body content", async () => {
  const service = createAnnouncementService({
    db: {
      query: async () => ({
        rows: [{
          id: "00000000-0000-4000-8000-000000000001",
          title: "七月活动上线",
          summary: "限时套餐已开放",
          body: "活动说明",
          action_label: "",
          action_url: "",
          status: "active",
          sort_order: 100,
          starts_at: null,
          ends_at: null,
          created_at: new Date("2026-07-02T09:00:00.000Z"),
          updated_at: new Date("2026-07-02T09:00:00.000Z"),
        }],
      }),
    } as never,
  });

  const result = await service.listAnnouncements();

  assert.equal(result.data.announcements[0]?.title, "七月活动上线");
  assert.equal(result.data.announcements[0]?.body, "活动说明");
  assert.equal("summary" in (result.data.announcements[0] ?? {}), false);
});

test("announcement service preserves administrator body whitespace", async () => {
  const body = "  创作路上，我们一直都在。\n      灵曦AI短剧运营团队";
  let capturedParams: unknown[] = [];
  const service = createAnnouncementService({
    db: {
      query: async (_sql: string, params: unknown[] = []) => {
        capturedParams = params;
        return {
          rows: [{
            id: String(params[0]),
            title: String(params[1]),
            body: String(params[2]),
            action_label: String(params[3] ?? ""),
            action_url: String(params[4] ?? ""),
            status: params[5] as "active",
            sort_order: Number(params[6] ?? 100),
            starts_at: params[7] as Date | null,
            ends_at: params[8] as Date | null,
            created_at: params[10] as Date,
            updated_at: params[10] as Date,
          }],
        };
      },
    } as never,
  });

  const saved = await service.saveAnnouncement({
    title: "排版公告",
    body,
    status: "active",
    actorAdminAccountId: null,
    now: new Date("2026-07-02T09:00:00.000Z"),
  });

  assert.equal(saved.status, 200);
  assert.equal(capturedParams[2], body);
  assert.equal(saved.body.announcement.body, body);
});

test("announcement service lists only active announcements inside the display window", async () => {
  const db = await createMigratedTestDb();
  const service = createAnnouncementService({ db });
  const now = new Date("2026-07-02T09:00:00.000Z");

  try {
    const current = await service.saveAnnouncement({
      title: "七月活动上线",
      body: "活动说明",
      actionLabel: "查看活动",
      actionUrl: "/pricing",
      sortOrder: 10,
      status: "active",
      startsAt: "2026-07-01T00:00:00.000Z",
      endsAt: "2026-07-03T00:00:00.000Z",
      actorAdminAccountId: null,
      now,
    });
    await service.saveAnnouncement({
      title: "未来活动",
      status: "active",
      startsAt: "2026-07-04T00:00:00.000Z",
      actorAdminAccountId: null,
      now,
    });
    await service.saveAnnouncement({
      title: "过期活动",
      status: "active",
      endsAt: "2026-07-02T09:00:00.000Z",
      actorAdminAccountId: null,
      now,
    });
    await service.saveAnnouncement({
      title: "停用活动",
      status: "inactive",
      actorAdminAccountId: null,
      now,
    });

    const active = await service.listActiveAnnouncements({ now });

    assert.equal(current.status, 200);
    assert.deepEqual(
      active.data.announcements.map((announcement) => announcement.title),
      ["七月活动上线"],
    );
    assert.equal("summary" in (active.data.announcements[0] ?? {}), false);
    assert.equal(active.data.version, current.body.announcement.updatedAt);
  } finally {
    await db.close();
  }
});

test("announcement updates produce a new public version without per-user read rows", async () => {
  const db = await createMigratedTestDb();
  const service = createAnnouncementService({ db });

  try {
    const created = await service.saveAnnouncement({
      title: "功能更新",
      body: "第一版说明",
      status: "active",
      actorAdminAccountId: null,
      now: new Date("2026-07-02T09:00:00.000Z"),
    });
    const first = await service.listActiveAnnouncements({ now: new Date("2026-07-02T09:30:00.000Z") });

    const updated = await service.saveAnnouncement({
      id: created.body.announcement.id,
      title: "功能更新",
      body: "第二版说明",
      status: "active",
      actorAdminAccountId: null,
      now: new Date("2026-07-02T10:00:00.000Z"),
    });
    const second = await service.listActiveAnnouncements({ now: new Date("2026-07-02T10:30:00.000Z") });
    const readTables = await db.query<{ table_name: string }>(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name LIKE '%announcement%read%'
      `,
    );

    assert.equal(updated.status, 200);
    assert.equal(second.data.announcements[0]?.body, "第二版说明");
    assert.notEqual(first.data.version, second.data.version);
    assert.deepEqual(readTables.rows, []);
  } finally {
    await db.close();
  }
});

test("announcement service rejects unsafe action urls", async () => {
  const db = await createMigratedTestDb();
  const service = createAnnouncementService({ db });

  try {
    const result = await service.saveAnnouncement({
      title: "链接校验",
      actionLabel: "查看",
      actionUrl: "//example.com/path",
      status: "active",
      actorAdminAccountId: null,
      now: new Date("2026-07-02T09:00:00.000Z"),
    });

    assert.equal(result.status, 400);
    assert.equal(result.body.error.code, "announcement_action_url_invalid");
  } finally {
    await db.close();
  }
});
