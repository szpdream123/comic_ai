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

describe("project multi-canvas HTTP routes", { concurrency: false }, () => {
  it("creates, isolates, copies, renames, saves, and safely deletes project canvases", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db, env: { NODE_ENV: "test" } });
    try {
      await db.query(
        `
          INSERT INTO users (id, phone_e164, password_hash, status)
          VALUES ($1, $2, $3, 'active')
        `,
        [
          userId,
          normalizeCnPhone(phone),
          await createUserPasswordHash(defaultPasswordFromPhone(normalizeCnPhone(phone))),
        ],
      );
      await db.query(
        `
          INSERT INTO projects (
            id, name, aspect_ratio, resolution, phase,
            owner_user_id, created_by_user_id
          )
          VALUES ($1, '多画布项目', '9:16', '1080p', 'script_input', $2, $2)
        `,
        [projectId, userId],
      );
      await server.listen(0);
      const login = await fetch(`${server.origin}/api/auth/password/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account: phone,
          password: defaultPasswordFromPhone(normalizeCnPhone(phone)),
        }),
      });
      assert.equal(login.status, 200, await login.text());
      const cookie = login.headers.get("set-cookie") ?? "";

      const legacyCreate = await jsonRequest(
        `${server.origin}/api/creator/projects/${projectId}/canvas`,
        { headers: { cookie } },
      );
      assert.equal(legacyCreate.status, 200, JSON.stringify(legacyCreate.body));
      const firstId = legacyCreate.body.data.canvas.canvasProjectId as string;

      const create = await jsonRequest(
        `${server.origin}/api/creator/projects/${projectId}/canvases`,
        {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ title: "镜头设计" }),
        },
      );
      assert.equal(create.status, 201, JSON.stringify(create.body));
      const secondId = create.body.data.canvas.canvasProjectId as string;
      assert.notEqual(secondId, firstId);

      const secondDocument = create.body.data.canvas.document as Record<string, unknown>;
      const save = await jsonRequest(
        `${server.origin}/api/creator/projects/${projectId}/canvases/${secondId}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({
            clientRevision: 1,
            document: {
              ...secondDocument,
              nodes: [
                canvasNode("prompt", "text", "text", "提示词"),
                {
                  ...canvasNode("image", "image", "image", "图片"),
                  data: {
                    ...canvasNode("image", "image", "image", "图片").data,
                    taskId: "transient-task",
                    runId: "transient-run",
                    generationProgress: 80,
                    storageObjectId: "60000000-0000-4000-8000-000000000881",
                    storageUrl: "https://cdn.example.test/project-canvas.png",
                  },
                },
              ],
              edges: [{
                id: "prompt-image",
                sourceNodeId: "prompt",
                sourcePortId: "out-text",
                targetNodeId: "image",
                targetPortId: "in-text",
                data: { kind: "text" },
              }],
            },
          }),
        },
      );
      assert.equal(save.status, 200, JSON.stringify(save.body));
      assert.equal(save.body.data.canvas.serverRevision, 2);

      const legacyStable = await jsonRequest(
        `${server.origin}/api/creator/projects/${projectId}/canvas`,
        { headers: { cookie } },
      );
      assert.equal(legacyStable.body.data.canvas.canvasProjectId, firstId);
      assert.equal(legacyStable.body.data.canvas.document.nodes.length, 0);

      const copy = await jsonRequest(
        `${server.origin}/api/creator/projects/${projectId}/canvases/${secondId}/copy`,
        {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ title: "镜头设计副本" }),
        },
      );
      assert.equal(copy.status, 201, JSON.stringify(copy.body));
      const copiedId = copy.body.data.canvas.canvasProjectId as string;
      const copiedImage = copy.body.data.canvas.document.nodes.find(
        (node: { id: string }) => node.id === "image",
      );
      assert.equal(copy.body.data.canvas.serverRevision, 1);
      assert.equal(copiedImage.data.taskId, undefined);
      assert.equal(copiedImage.data.runId, undefined);
      assert.equal(copiedImage.data.storageObjectId, "60000000-0000-4000-8000-000000000881");

      const rename = await jsonRequest(
        `${server.origin}/api/creator/projects/${projectId}/canvases/${copiedId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ title: "成片画布" }),
        },
      );
      assert.equal(rename.status, 200, JSON.stringify(rename.body));
      assert.equal(rename.body.data.canvas.title, "成片画布");

      const list = await jsonRequest(
        `${server.origin}/api/creator/projects/${projectId}/canvases`,
        { headers: { cookie } },
      );
      assert.equal(list.status, 200, JSON.stringify(list.body));
      assert.deepEqual(
        list.body.data.canvases.map((canvas: { canvasProjectId: string }) => canvas.canvasProjectId),
        [firstId, secondId, copiedId],
      );

      for (const canvasProjectId of [firstId, secondId]) {
        const deleted = await jsonRequest(
          `${server.origin}/api/creator/projects/${projectId}/canvases/${canvasProjectId}`,
          { method: "DELETE", headers: { cookie } },
        );
        assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
      }
      const deleteLast = await jsonRequest(
        `${server.origin}/api/creator/projects/${projectId}/canvases/${copiedId}`,
        { method: "DELETE", headers: { cookie } },
      );
      assert.equal(deleteLast.status, 409, JSON.stringify(deleteLast.body));
      assert.equal(deleteLast.body.errorCode, "last_project_canvas_delete_forbidden");

      const isolated = await db.query<{
        revision_count: number;
        node_count: number;
        edge_count: number;
        run_count: number;
        artifact_count: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM creator_canvas_revisions WHERE canvas_project_id = $1) AS revision_count,
            (SELECT count(*)::int FROM creator_canvas_nodes WHERE canvas_project_id = $1 AND deleted_at IS NULL) AS node_count,
            (SELECT count(*)::int FROM creator_canvas_edges WHERE canvas_project_id = $1 AND deleted_at IS NULL) AS edge_count,
            (SELECT count(*)::int FROM creator_canvas_node_runs WHERE canvas_project_id = $1) AS run_count,
            (SELECT count(*)::int FROM creator_canvas_node_artifacts WHERE canvas_project_id = $1) AS artifact_count
        `,
        [copiedId],
      );
      assert.deepEqual(isolated.rows[0], {
        revision_count: 1,
        node_count: 2,
        edge_count: 1,
        run_count: 0,
        artifact_count: 0,
      });
    } finally {
      await server.close().catch(() => undefined);
      await db.close();
    }
  });
});

function canvasNode(id: string, type: string, mediaKind: string, title: string) {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    size: { width: 360, height: 240 },
    data: {
      title,
      mediaKind,
      ports: {
        inputs: [{ id: "in-text", kind: "text" }],
        outputs: [{ id: type === "image" ? "out-image" : "out-text", kind: mediaKind }],
      },
    },
  };
}

async function jsonRequest(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  return {
    status: response.status,
    body: await response.json() as any,
  };
}
