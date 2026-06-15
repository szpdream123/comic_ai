import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  deleteScriptCardRecord,
  updateScriptCardRecord,
} from "../script-card-record.service.ts";

describe("script card records", { concurrency: false }, () => {
  it("updates script card metadata without changing the owning project", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedProject(db);
      const updated = await updateScriptCardRecord(db, {
        organizationId: ids.organizationId,
        projectId: ids.projectId,
        scriptId: ids.scriptId,
        title: "独立剧本标题",
        coverImageUrl: "/uploads/scripts/cover.png",
        coverStorageObjectId: null,
        now: new Date("2026-06-09T08:10:00.000Z"),
      });

      assert.equal(updated?.title, "独立剧本标题");
      assert.equal(updated?.coverImageUrl, "/uploads/scripts/cover.png");

      const project = (
        await db.query<{ name: string; cover_image_url: string | null }>(
          "SELECT name, cover_image_url FROM projects WHERE id = $1",
          [ids.projectId],
        )
      ).rows[0];
      assert.equal(project?.name, "项目原名");
      assert.equal(project?.cover_image_url, "/uploads/projects/original.png");
    } finally {
      await db.close();
    }
  });

  it("soft deletes a script card without deleting the project", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedProject(db);
      const deleted = await deleteScriptCardRecord(db, {
        organizationId: ids.organizationId,
        projectId: ids.projectId,
        scriptId: ids.scriptId,
        now: new Date("2026-06-09T08:11:00.000Z"),
      });

      assert.equal(deleted?.id, ids.scriptId);
      assert.ok(deleted?.deletedAt instanceof Date);

      const projectCount = (
        await db.query<{ count: number | string }>(
          "SELECT count(*) AS count FROM projects WHERE id = $1",
          [ids.projectId],
        )
      ).rows[0]?.count;
      assert.equal(Number(projectCount), 1);
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
        id, organization_id, workspace_id, name, cover_image_url, aspect_ratio,
        resolution, phase, created_by_user_id
      )
      VALUES ($1, $2, $3, '项目原名', '/uploads/projects/original.png', '9:16', '1080p', 'script_input', $4)
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
