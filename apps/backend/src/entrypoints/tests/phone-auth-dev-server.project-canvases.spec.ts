import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeCnPhone } from "../../modules/identity/phone-auth.utils.ts";
import {
  createUserPasswordHash,
  defaultPasswordFromPhone,
} from "../../modules/identity/team-account-credentials.service.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

const userId = "00000000-0000-4000-8000-000000000881";
const projectId = "30000000-0000-4000-8000-000000000881";
const phone = "13800138881";

describe("removed project canvas HTTP routes", { concurrency: false }, () => {
  it("keeps independent canvases separate and rejects legacy project canvas routes", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db, env: { NODE_ENV: "test" } });
    try {
      const normalizedPhone = normalizeCnPhone(phone);
      await db.query(
        `INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1, $2, $3, 'active')`,
        [userId, normalizedPhone, await createUserPasswordHash(defaultPasswordFromPhone(normalizedPhone))],
      );
      await db.query(
        `
          INSERT INTO projects (
            id, name, aspect_ratio, resolution, phase, owner_user_id, created_by_user_id
          ) VALUES ($1, '独立项目', '9:16', '1080p', 'script_input', $2, $2)
        `,
        [projectId, userId],
      );
      await server.listen(0);
      const login = await fetch(`${server.origin}/api/auth/password/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account: phone, password: defaultPasswordFromPhone(normalizedPhone) }),
      });
      assert.equal(login.status, 200, await login.text());
      const cookie = login.headers.get("set-cookie") ?? "";

      const created = await fetch(`${server.origin}/api/creator/canvas-projects`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ title: "独立画布" }),
      });
      const createdBody = await created.json();
      assert.equal(created.status, 201, JSON.stringify(createdBody));

      for (const legacyPath of [
        `/api/creator/projects/${projectId}/canvas`,
        `/api/creator/projects/${projectId}/canvases`,
      ]) {
        const response = await fetch(`${server.origin}${legacyPath}`, { headers: { cookie } });
        assert.equal(response.status, 404);
      }

      const counts = await db.query<{ project_count: number; canvas_count: number }>(`
        SELECT
          (SELECT count(*)::int FROM projects) AS project_count,
          (SELECT count(*)::int FROM creator_canvas_projects) AS canvas_count
      `);
      assert.deepEqual(counts.rows[0], { project_count: 1, canvas_count: 1 });
    } finally {
      await server.close().catch(() => undefined);
      await db.close();
    }
  });
});
