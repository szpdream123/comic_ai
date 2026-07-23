import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { loadProjectBundleFromSql } from "../creator-state-hydration.service.ts";

describe("creator state hydration", { concurrency: false }, () => {
  it("loads only the project's source document and ignores independent scripts", async () => {
    const db = await createMigratedTestDb();

    try {
      await db.query(
        `INSERT INTO users (id, phone_e164, status)
         VALUES ($1, '13800138000', 'active')`,
        [ids.userId],
      );
      await db.query(
        `INSERT INTO projects (
           id, name, aspect_ratio, resolution, phase,
           owner_user_id, created_by_user_id
         ) VALUES ($1, '项目源文档', '9:16', '1080p', 'script_input', $2, $2)`,
        [ids.projectId, ids.userId],
      );
      await db.query(
        `INSERT INTO project_source_documents (
           id, project_id, status, input_text, created_by_user_id
         ) VALUES ($1, $2, 'ready', '项目自己的输入文本', $3)`,
        [ids.sourceDocumentId, ids.projectId, ids.userId],
      );
      await db.query(
        `INSERT INTO scripts (
           id, owner_user_id, title, status, input_text, created_by_user_id
         ) VALUES ($1, $2, '独立剧本', 'ready', '不属于项目', $2)`,
        [ids.independentScriptId, ids.userId],
      );

      const bundle = await loadProjectBundleFromSql(db, {
        projectId: ids.projectId,
        scriptId: ids.sourceDocumentId,
      });
      const unrelated = await loadProjectBundleFromSql(db, {
        projectId: ids.projectId,
        scriptId: ids.independentScriptId,
      });

      assert.equal(bundle?.script?.id, ids.sourceDocumentId);
      assert.equal(bundle?.script?.inputText, "项目自己的输入文本");
      assert.equal(unrelated?.script, null);
    } finally {
      await db.close();
    }
  });
});

const ids = {
  userId: "00000000-0000-4000-8000-000000000001",
  projectId: "10000000-0000-4000-8000-000000000001",
  sourceDocumentId: "20000000-0000-4000-8000-000000000001",
  independentScriptId: "30000000-0000-4000-8000-000000000001",
};
