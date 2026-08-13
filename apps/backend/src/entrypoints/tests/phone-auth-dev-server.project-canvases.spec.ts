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

  it("serves the formal Canvas API while retaining the canvas-projects compatibility alias", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db, env: { NODE_ENV: "test" } });
    try {
      const formalUserId = "00000000-0000-4000-8000-000000000882";
      const formalPhone = "13800138882";
      const normalizedPhone = normalizeCnPhone(formalPhone);
      await db.query(
        `INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1, $2, $3, 'active')`,
        [formalUserId, normalizedPhone, await createUserPasswordHash(defaultPasswordFromPhone(normalizedPhone))],
      );
      await server.listen(0);

      const unauthenticated = await fetch(`${server.origin}/api/creator/canvases`);
      assert.equal(unauthenticated.status, 401);

      const login = await fetch(`${server.origin}/api/auth/password/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account: formalPhone,
          password: defaultPasswordFromPhone(normalizedPhone),
        }),
      });
      assert.equal(login.status, 200, await login.text());
      const cookie = login.headers.get("set-cookie") ?? "";

      const invalidCanvasResponse = await fetch(`${server.origin}/api/creator/canvases/not-a-uuid`, {
        headers: { cookie },
      });
      assert.equal(invalidCanvasResponse.status, 404, await invalidCanvasResponse.text());

      const createResponse = await fetch(`${server.origin}/api/creator/canvases`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "formal-canvas-create",
          cookie,
        },
        body: JSON.stringify({ title: "正式 Canvas API" }),
      });
      const created = await createResponse.json();
      assert.equal(createResponse.status, 201, JSON.stringify(created));
      const canvasId = created.data.project.id;

      const replayCreateResponse = await fetch(`${server.origin}/api/creator/canvases`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "formal-canvas-create",
          cookie,
        },
        body: JSON.stringify({ title: "正式 Canvas API" }),
      });
      const replayCreated = await replayCreateResponse.json();
      assert.equal(replayCreateResponse.status, 201, JSON.stringify(replayCreated));
      assert.equal(replayCreated.data.project.id, canvasId);

      const replayListResponse = await fetch(`${server.origin}/api/creator/canvases`, {
        headers: { cookie },
      });
      const replayList = await replayListResponse.json();
      assert.equal(replayList.data.projects.length, 1);

      const itemResponse = await fetch(`${server.origin}/api/creator/canvases/${canvasId}`, {
        headers: { cookie },
      });
      const item = await itemResponse.json();
      assert.equal(itemResponse.status, 200, JSON.stringify(item));
      assert.equal(item.data.project.title, "正式 Canvas API");

      const saveResponse = await fetch(`${server.origin}/api/creator/canvases/${canvasId}/document`, {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          clientRevision: 1,
          document: {
            version: 1,
            canvasProjectId: canvasId,
            viewport: { x: 0, y: 0, zoom: 1 },
            nodes: [],
            edges: [],
          },
          events: [],
        }),
      });
      const saved = await saveResponse.json();
      assert.equal(saveResponse.status, 200, JSON.stringify(saved));

      const documentResponse = await fetch(`${server.origin}/api/creator/canvases/${canvasId}/document`, {
        headers: { cookie },
      });
      const documentBody = await documentResponse.json();
      assert.equal(documentResponse.status, 200, JSON.stringify(documentBody));
      assert.equal(documentBody.data.canvas.document.canvasProjectId, canvasId);

      const revisionsResponse = await fetch(`${server.origin}/api/creator/canvases/${canvasId}/revisions?limit=20`, {
        headers: { cookie },
      });
      const revisions = await revisionsResponse.json();
      assert.equal(revisionsResponse.status, 200, JSON.stringify(revisions));
      assert.ok(revisions.data.revisions.length >= 1);
      const revisionId = revisions.data.revisions[0].id;
      const revisionResponse = await fetch(
        `${server.origin}/api/creator/canvases/${canvasId}/revisions/${revisionId}`,
        { headers: { cookie } },
      );
      assert.equal(revisionResponse.status, 200, await revisionResponse.text());

      const renameResponse = await fetch(`${server.origin}/api/creator/canvases/${canvasId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ title: "正式 Canvas API 2", expectedTitle: "正式 Canvas API" }),
      });
      assert.equal(renameResponse.status, 200, await renameResponse.text());

      const deleteResponse = await fetch(`${server.origin}/api/creator/canvases/${canvasId}`, {
        method: "DELETE",
        headers: { cookie },
      });
      assert.equal(deleteResponse.status, 200, await deleteResponse.text());

      const deletedListResponse = await fetch(`${server.origin}/api/creator/canvases?includeDeleted=true`, {
        headers: { cookie },
      });
      const deletedList = await deletedListResponse.json();
      assert.equal(deletedListResponse.status, 200, JSON.stringify(deletedList));
      assert.equal(deletedList.data.projects.find((canvas) => canvas.id === canvasId)?.status, "deleted");

      const restoreResponse = await fetch(`${server.origin}/api/creator/canvases/${canvasId}/restore`, {
        method: "POST",
        headers: { "idempotency-key": "formal-canvas-restore", cookie },
      });
      const restored = await restoreResponse.json();
      assert.equal(restoreResponse.status, 200, JSON.stringify(restored));
      assert.equal(restored.data.project.status, "draft");

      const legacyListResponse = await fetch(`${server.origin}/api/creator/canvas-projects`, {
        headers: { cookie },
      });
      const legacyList = await legacyListResponse.json();
      assert.equal(legacyListResponse.status, 200, JSON.stringify(legacyList));
      assert.equal(legacyList.data.projects.find((canvas) => canvas.id === canvasId)?.title, "正式 Canvas API 2");

      const legacyDocumentResponse = await fetch(
        `${server.origin}/api/creator/canvas-projects/${canvasId}/canvas`,
        { headers: { cookie } },
      );
      assert.equal(legacyDocumentResponse.status, 200, await legacyDocumentResponse.text());
    } finally {
      await server.close().catch(() => undefined);
      await db.close();
    }
  });
});
