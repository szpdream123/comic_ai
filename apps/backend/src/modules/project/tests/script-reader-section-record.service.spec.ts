import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  createScriptReaderSection,
  deleteScriptReaderSection,
  ensureScriptReaderSectionsForScript,
  listScriptReaderSectionsForScript,
  updateScriptReaderSection,
} from "../script-reader-section-record.service.ts";

describe("script reader section records", { concurrency: false }, () => {
  it("creates, updates, lists, and permanently deletes script reader sections", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedScript(db);
      const now = new Date("2026-06-09T08:00:00.000Z");
      const created = await createScriptReaderSection(db, {
        scriptId: ids.scriptId,
        title: "第1章 迷雾",
        body: "初始剧情",
        createdByUserId: ids.userId,
        now,
      });

      assert.equal(created.sequence, 1);
      assert.equal(created.title, "第1章 迷雾");

      const updated = await updateScriptReaderSection(db, {
        scriptId: ids.scriptId,
        sectionId: created.id,
        title: "第1章 改名",
        body: "改后的剧情正文",
        now: new Date("2026-06-09T08:01:00.000Z"),
      });

      assert.equal(updated?.title, "第1章 改名");
      assert.equal(updated?.body, "改后的剧情正文");

      const listed = await listScriptReaderSectionsForScript(db, {
        scriptId: ids.scriptId,
      });
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.id, created.id);

      assert.equal(
        await deleteScriptReaderSection(db, {
          scriptId: ids.scriptId,
          sectionId: created.id,
        }),
        true,
      );
      assert.deepEqual(
        await listScriptReaderSectionsForScript(db, {
          scriptId: ids.scriptId,
        }),
        [],
      );
    } finally {
      await db.close();
    }
  });

  it("ensures a default section from the independent script text", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedScript(db);

      const sections = await ensureScriptReaderSectionsForScript(db, {
        scriptId: ids.scriptId,
        createdByUserId: ids.userId,
        now: new Date("2026-06-09T08:02:00.000Z"),
      });

      assert.equal(sections.length, 1);
      assert.equal(sections[0]?.title, "第1章 迷雾");
      assert.equal(sections[0]?.scriptId, ids.scriptId);
      assert.equal(sections[0]?.body, "剧本文本");
    } finally {
      await db.close();
    }
  });
});

const ids = {
  userId: "00000000-0000-4000-8000-000000000001",
  scriptId: "40000000-0000-4000-8000-000000000001",
};

async function seedScript(db: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ($1, '13800138000', 'active')
    `,
    [ids.userId],
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
