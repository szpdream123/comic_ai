import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";

import type { TextChatGatewayLike } from "../../modules/ai-storyboard/ai-storyboard-preview.service.ts";
import {
  createUserPasswordHash,
  defaultPasswordFromPhone,
} from "../../modules/identity/team-account-credentials.service.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

it("runs an authenticated director canvas node idempotently and enforces canvas ownership", async () => {
  const db = await createMigratedTestDb();
  const gateway = new DirectorGateway();
  const server = createPhoneAuthDevServer({
    db,
    textChatGateway: gateway,
    env: { NODE_ENV: "test", AUTH_SESSION_REDIS_CACHE_ENABLED: "false" },
    repairScheduler: { enabled: false },
  });
  const phone = "13900000061";
  const otherPhone = "13900000062";
  const userId = randomUUID();
  const otherUserId = randomUUID();
  try {
    await db.query(
      "INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1, $2, $3, 'active')",
      [userId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
    );
    await db.query(
      "INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1, $2, $3, 'active')",
      [otherUserId, otherPhone, await createUserPasswordHash(defaultPasswordFromPhone(otherPhone))],
    );
    await server.listen(0);
    const cookie = await passwordLogin(server.origin, phone);
    const otherCookie = await passwordLogin(server.origin, otherPhone);

    const create = await api(server.origin, "/api/creator/canvas-projects", cookie, {
      method: "POST",
      headers: { "idempotency-key": "director-http-canvas" },
      body: { title: "导演节点 HTTP" },
    });
    assert.equal(create.status, 201);
    const canvasProjectId = String(create.body.data.project.id);
    const save = await api(server.origin, `/api/creator/canvas-projects/${canvasProjectId}/canvas`, cookie, {
      method: "PUT",
      body: {
        clientRevision: 1,
        document: {
          version: 2,
          canvasProjectId,
          projectId: canvasProjectId,
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [
            {
              id: "script-1",
              type: "script",
              position: { x: 0, y: 0 },
              size: { width: 320, height: 180 },
              data: {
                text: "主角推门进入废弃剧院。",
                ports: { inputs: [], outputs: [{ id: "out_text", kind: "text" }] },
              },
            },
            {
              id: "director-1",
              type: "director",
              position: { x: 400, y: 0 },
              size: { width: 360, height: 220 },
              data: {
                instructions: "用一个长镜头建立空间",
                ports: { inputs: [{ id: "in_any", kind: "any" }], outputs: [{ id: "out_text", kind: "text" }] },
                loomicElement: { type: "rectangle", customData: { type: "director-node" } },
              },
            },
          ],
          edges: [{
            id: "edge-1",
            sourceNodeId: "script-1",
            sourcePortId: "out_text",
            targetNodeId: "director-1",
            targetPortId: "in_any",
            data: { kind: "text" },
          }],
          groups: [],
        },
      },
    });
    assert.equal(save.status, 200);

    const path = `/api/canvas/${canvasProjectId}/nodes/director-1/run`;
    const anonymous = await fetch(`${server.origin}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "director-http-run" },
      body: JSON.stringify({ kind: "director", prompt: "强调压迫感" }),
    });
    assert.equal(anonymous.status, 401);

    const missingKey = await api(server.origin, path, cookie, {
      method: "POST",
      body: { kind: "director", prompt: "强调压迫感" },
    });
    assert.equal(missingKey.status, 400);
    assert.equal(missingKey.body.errorCode, "idempotency_key_required");

    const forbidden = await api(server.origin, path, otherCookie, {
      method: "POST",
      headers: { "idempotency-key": "director-http-other" },
      body: { kind: "director", prompt: "强调压迫感" },
    });
    assert.equal(forbidden.status, 404);
    assert.equal(gateway.calls.length, 0);

    const first = await api(server.origin, path, cookie, {
      method: "POST",
      headers: { "idempotency-key": "director-http-run" },
      body: {
        kind: "director",
        mediaKind: "text",
        prompt: "强调压迫感",
        instructions: "镜头不要跳轴",
        canvasContext: {
          upstreamTextFragments: ["竖屏 9:16 构图", "参考 https://private.example/SECRET 和 data:image/png;base64,SECRET"],
          upstreamNodeIds: ["script-1"],
          mediaReferences: [{
            nodeId: "image-1",
            name: "剧院参考图",
            kind: "image",
            url: "https://storage.example.test/signed.png?token=SECRET",
            dataURL: "data:image/png;base64,SECRET",
            blobUrl: "blob:http://127.0.0.1/SECRET",
          }],
          privateToken: "SECRET",
        },
      },
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.data.status, "succeeded");
    assert.equal(first.body.data.result.text, "长镜头缓慢推进，保持舞台轴线。");
    assert.equal(first.body.data.artifact.artifactKind, "text");
    assert.equal(first.body.data.artifact.metadata.directorInstructions, "长镜头缓慢推进，保持舞台轴线。");
    assert.equal(gateway.calls.length, 1);
    assert.match(gateway.calls[0]?.prompt ?? "", /主角推门进入废弃剧院/);
    assert.match(gateway.calls[0]?.prompt ?? "", /9:16/);
    assert.match(gateway.calls[0]?.prompt ?? "", /剧院参考图/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /https:|data:image|blob:http|SECRET/);

    const replay = await api(server.origin, path, cookie, {
      method: "POST",
      headers: { "idempotency-key": "director-http-run" },
      body: {
        kind: "director",
        mediaKind: "text",
        prompt: "强调压迫感",
        instructions: "镜头不要跳轴",
        canvasContext: {
          upstreamTextFragments: ["竖屏 9:16 构图", "参考 https://private.example/SECRET 和 data:image/png;base64,SECRET"],
          upstreamNodeIds: ["script-1"],
          mediaReferences: [{
            name: "剧院参考图",
            kind: "image",
            url: "https://storage.example.test/signed.png?token=SECRET",
            dataURL: "data:image/png;base64,SECRET",
            blobUrl: "blob:http://127.0.0.1/SECRET",
          }],
          privateToken: "SECRET",
        },
      },
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.data.runId, first.body.data.runId);
    assert.equal(replay.body.data.replayed, true);
    assert.equal(replay.body.data.result.text, "长镜头缓慢推进，保持舞台轴线。");
    assert.equal(gateway.calls.length, 1);

    const conflict = await api(server.origin, path, cookie, {
      method: "POST",
      headers: { "idempotency-key": "director-http-run" },
      body: { kind: "director", prompt: "改成手持追拍" },
    });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.errorCode, "canvas_director_idempotency_conflict");
    assert.equal(gateway.calls.length, 1);
  } finally {
    await server.close().catch(() => undefined);
    await db.close();
  }
});

class DirectorGateway implements TextChatGatewayLike {
  readonly calls: Array<{ model: string; prompt: string }> = [];

  async completeJson(input: { model: string; prompt: string }) {
    this.calls.push(input);
    return JSON.stringify({
      directorInstructions: "长镜头缓慢推进，保持舞台轴线。 ",
      shots: [{ order: 1, action: "推门", camera: "长镜头推进", prompt: "废弃剧院压迫感" }],
      continuityNotes: ["保持舞台轴线"],
      negativeConstraints: ["不要跳轴"],
    });
  }
}

async function passwordLogin(origin: string, phone: string) {
  const response = await fetch(`${origin}/api/auth/password/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account: phone, password: defaultPasswordFromPhone(phone) }),
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie") ?? "";
}

async function api(
  origin: string,
  path: string,
  cookie: string,
  options: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
) {
  const response = await fetch(`${origin}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
      ...(options.headers ?? {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
}
