import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";

import {
  createUserPasswordHash,
  defaultPasswordFromPhone,
} from "../../modules/identity/team-account-credentials.service.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

it("rejects image and video generation for non-generator canvas nodes before side effects", async () => {
  const db = await createMigratedTestDb();
  const server = createPhoneAuthDevServer({
    db,
    env: {
      NODE_ENV: "test",
      AUTH_SESSION_REDIS_CACHE_ENABLED: "false",
    },
    repairScheduler: { enabled: false },
  });
  const userId = randomUUID();
  const phone = "13900000029";

  try {
    await db.query(
      `
        INSERT INTO users (id, phone_e164, password_hash, status)
        VALUES ($1, $2, $3, 'active')
      `,
      [userId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
    );
    await server.listen(0);
    const loginResponse = await fetch(`${server.origin}/api/auth/password/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        account: phone,
        password: defaultPasswordFromPhone(phone),
      }),
    });
    assert.equal(loginResponse.status, 200);
    const cookie = loginResponse.headers.get("set-cookie") ?? "";

    const createResponse = await fetch(`${server.origin}/api/creator/canvas-projects`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "canvas-node-type-project-create",
        cookie,
      },
      body: JSON.stringify({ title: "节点类型校验画布" }),
    });
    const created = await createResponse.json();
    assert.equal(createResponse.status, 201, JSON.stringify(created));
    const canvasProjectId = created.data.project.id;

    const saveResponse = await fetch(`${server.origin}/api/creator/canvas-projects/${canvasProjectId}/canvas`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        clientRevision: 1,
        document: {
          version: 1,
          canvasProjectId,
          projectId: canvasProjectId,
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [{
            id: "script-node",
            type: "script",
            position: { x: 100, y: 100 },
            data: {
              mediaKind: "text",
              text: "不能作为生成节点运行",
              ports: { inputs: [], outputs: [{ id: "out_text", kind: "text" }] },
            },
          }],
          edges: [],
        },
        events: [],
      }),
    });
    assert.equal(saveResponse.status, 200, await saveResponse.text());

    const imageResponse = await fetch(`${server.origin}/api/generation/image-tasks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "canvas-invalid-image-node",
        cookie,
      },
      body: JSON.stringify({
        target: { kind: "canvas", canvasProjectId, nodeId: "script-node" },
        prompt: "不应提交图片任务",
        model: "global-ai-opc-gpt-image-2",
      }),
    });
    const imagePayload = await imageResponse.json();
    assert.equal(imageResponse.status, 400, JSON.stringify(imagePayload));
    assert.equal(imagePayload.errorCode, "canvas_image_node_invalid");

    const videoResponse = await fetch(`${server.origin}/api/canvas/${canvasProjectId}/nodes/script-node/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "canvas-invalid-video-node",
        cookie,
      },
      body: JSON.stringify({
        kind: "video",
        prompt: "不应提交视频任务",
        model: "seedance-1.0-pro",
      }),
    });
    const videoPayload = await videoResponse.json();
    assert.equal(videoResponse.status, 400, JSON.stringify(videoPayload));
    assert.equal(videoPayload.errorCode, "canvas_video_node_invalid");

    const sideEffects = await db.query<{
      project_count: number;
      episode_count: number;
      run_count: number;
      task_count: number;
    }>(
      `
        SELECT
          (SELECT count(*)::int FROM projects) AS project_count,
          (SELECT count(*)::int FROM episodes) AS episode_count,
          (SELECT count(*)::int FROM creator_canvas_node_runs) AS run_count,
          (SELECT count(*)::int FROM tasks) AS task_count
      `,
    );
    assert.deepEqual(sideEffects.rows[0], {
      project_count: 0,
      episode_count: 0,
      run_count: 0,
      task_count: 0,
    });
  } finally {
    await server.close();
  }
});
