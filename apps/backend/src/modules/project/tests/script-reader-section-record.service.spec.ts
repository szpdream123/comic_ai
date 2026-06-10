import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  createScriptReaderSection,
  deleteScriptReaderSection,
  ensureScriptReaderSectionsForProject,
  listScriptReaderSectionsForProject,
  updateScriptReaderSection,
} from "../script-reader-section-record.service.ts";

describe("script reader section records", { concurrency: false }, () => {
  it("creates, updates, lists, and permanently deletes project script reader sections", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedProject(db);
      const now = new Date("2026-06-09T08:00:00.000Z");
      const created = await createScriptReaderSection(db, {
        organizationId: ids.organizationId,
        projectId: ids.projectId,
        scriptId: ids.scriptId,
        title: "第1章 迷雾",
        body: "初始剧情",
        createdByUserId: ids.userId,
        now,
      });

      assert.equal(created.sequence, 1);
      assert.equal(created.title, "第1章 迷雾");

      const updated = await updateScriptReaderSection(db, {
        organizationId: ids.organizationId,
        projectId: ids.projectId,
        sectionId: created.id,
        title: "第1章 改名",
        body: "改后的剧情正文",
        now: new Date("2026-06-09T08:01:00.000Z"),
      });

      assert.equal(updated?.title, "第1章 改名");
      assert.equal(updated?.body, "改后的剧情正文");

      const listed = await listScriptReaderSectionsForProject(db, {
        organizationId: ids.organizationId,
        projectId: ids.projectId,
      });
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.id, created.id);

      assert.equal(
        await deleteScriptReaderSection(db, {
          organizationId: ids.organizationId,
          projectId: ids.projectId,
          sectionId: created.id,
        }),
        true,
      );
      assert.deepEqual(
        await listScriptReaderSectionsForProject(db, {
          organizationId: ids.organizationId,
          projectId: ids.projectId,
        }),
        [],
      );
    } finally {
      await db.close();
    }
  });

  it("ensures a default section from existing episodes when none exists", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedProject(db);
      await db.query(
        `
          INSERT INTO episodes (
            id, organization_id, project_id, title, sequence, status,
            created_by_user_id, created_at, updated_at
          )
          VALUES (
            $1, $2, $3, '第1章 迷雾', 1, 'draft',
            $4, $5, $5
          )
        `,
        [ids.episodeId, ids.organizationId, ids.projectId, ids.userId, new Date("2026-06-09T08:00:00.000Z")],
      );

      const sections = await ensureScriptReaderSectionsForProject(db, {
        organizationId: ids.organizationId,
        projectId: ids.projectId,
        scriptId: ids.scriptId,
        createdByUserId: ids.userId,
        now: new Date("2026-06-09T08:02:00.000Z"),
      });

      assert.equal(sections.length, 1);
      assert.equal(sections[0]?.title, "第1章 迷雾");
      assert.equal(sections[0]?.episodeId, ids.episodeId);
      assert.match(sections[0]?.body ?? "", /待上传剧本/);
    } finally {
      await db.close();
    }
  });
});

const ids = {
  userId: "00000000-0000-4000-8000-000000000001",
  organizationId: "10000000-0000-4000-8000-000000000001",
  workspaceId: "20000000-0000-4000-8000-000000000001",
  projectId: "30000000-0000-4000-8000-000000000001",
  scriptId: "40000000-0000-4000-8000-000000000001",
  episodeId: "50000000-0000-4000-8000-000000000001",
};

async function seedProject(db: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ($1, '+8613800138000', 'active')
    `,
    [ids.userId],
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ($1, 'Org', 'active')
    `,
    [ids.organizationId],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, 'Workspace', 'active')
    `,
    [ids.workspaceId, ids.organizationId],
  );
  await db.query(
    `
      INSERT INTO projects (
        id, organization_id, workspace_id, name, aspect_ratio, resolution,
        phase, created_by_user_id
      )
      VALUES ($1, $2, $3, '第一项目', '9:16', '1080p', 'script_input', $4)
    `,
    [ids.projectId, ids.organizationId, ids.workspaceId, ids.userId],
  );
  await db.query(
    `
      INSERT INTO scripts (
        id, organization_id, project_id, status, input_text, created_by_user_id
      )
      VALUES ($1, $2, $3, 'ready', '剧本文本', $4)
    `,
    [ids.scriptId, ids.organizationId, ids.projectId, ids.userId],
  );
}
