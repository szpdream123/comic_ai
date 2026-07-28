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

it("runs authenticated ai-text and ai-markdown canvas nodes through the text gateway", async () => {
  const db = await createMigratedTestDb();
  const gateway = new TextGateway();
  const server = createPhoneAuthDevServer({
    db,
    textChatGateway: gateway,
    env: { NODE_ENV: "test", AUTH_SESSION_REDIS_CACHE_ENABLED: "false" },
    repairScheduler: { enabled: false },
  });
  const phone = "13900000063";
  const userId = randomUUID();
  try {
    await db.query(
      "INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1, $2, $3, 'active')",
      [userId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
    );
    await server.listen(0);
    const cookie = await passwordLogin(server.origin, phone);
    const create = await api(server.origin, "/api/creator/canvas-projects", cookie, {
      method: "POST",
      headers: { "idempotency-key": "canvas-text-http-canvas" },
      body: { title: "AI text node HTTP" },
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
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [
            {
              id: "source-1",
              type: "source-text",
              position: { x: 0, y: 0 },
              size: { width: 320, height: 180 },
              data: {
                text: "旧剧院的雨夜开场。",
                ports: { inputs: [], outputs: [{ id: "out_text", kind: "text" }] },
              },
            },
            {
              id: "ai-text-1",
              type: "ai-text",
              position: { x: 400, y: 0 },
              size: { width: 360, height: 220 },
              data: {
                mediaKind: "text",
                ports: {
                  inputs: [{ id: "in_text", kind: "text" }],
                  outputs: [{ id: "out_text", kind: "text" }],
                },
              },
            },
            {
              id: "ai-markdown-1",
              type: "ai-markdown",
              position: { x: 400, y: 300 },
              size: { width: 360, height: 220 },
              data: {
                mediaKind: "text",
                ports: {
                  inputs: [{ id: "in_text", kind: "text" }],
                  outputs: [{ id: "out_text", kind: "text" }],
                },
              },
            },
          ],
          edges: [
            {
              id: "edge-text",
              sourceNodeId: "source-1",
              sourcePortId: "out_text",
              targetNodeId: "ai-text-1",
              targetPortId: "in_text",
              data: { kind: "text" },
            },
            {
              id: "edge-markdown",
              sourceNodeId: "source-1",
              sourcePortId: "out_text",
              targetNodeId: "ai-markdown-1",
              targetPortId: "in_text",
              data: { kind: "text" },
            },
          ],
          groups: [],
        },
      },
    });
    assert.equal(save.status, 200);

    const textRun = await api(server.origin, `/api/canvas/${canvasProjectId}/nodes/ai-text-1/run`, cookie, {
      method: "POST",
      headers: { "idempotency-key": "canvas-text-http-run" },
      body: { kind: "text", mediaKind: "text", prompt: "改写为悬疑风格" },
    });
    assert.equal(textRun.status, 200);
    assert.equal(textRun.body.data.status, "succeeded");
    assert.equal(textRun.body.data.result.text, "AI 文本结果");
    assert.equal(textRun.body.data.result.format, "text");
    assert.equal(textRun.body.data.artifact.artifactKind, "text");
    const textReplay = await api(server.origin, `/api/canvas/${canvasProjectId}/nodes/ai-text-1/run`, cookie, {
      method: "POST",
      headers: { "idempotency-key": "canvas-text-http-run" },
      body: { kind: "text", mediaKind: "text", prompt: "改写为悬疑风格" },
    });
    assert.equal(textReplay.status, 200);
    assert.equal(textReplay.body.data.runId, textRun.body.data.runId);
    assert.equal(textReplay.body.data.replayed, true);
    assert.equal(gateway.calls.length, 1);

    const markdownRun = await api(server.origin, `/api/canvas/${canvasProjectId}/nodes/ai-markdown-1/run`, cookie, {
      method: "POST",
      headers: { "idempotency-key": "canvas-markdown-http-run" },
      body: { mediaKind: "text", instructions: "整理为提纲" },
    });
    assert.equal(markdownRun.status, 200);
    assert.equal(markdownRun.body.data.result.text, "# AI Markdown 结果");
    assert.equal(markdownRun.body.data.result.format, "markdown");
    assert.equal(gateway.calls.length, 2);
    assert.equal(gateway.calls[0]?.responseFormat, "text");
    assert.match(gateway.calls[0]?.prompt ?? "", /旧剧院的雨夜开场/);
    assert.match(gateway.calls[1]?.prompt ?? "", /Markdown/);
  } finally {
    await server.close().catch(() => undefined);
    await db.close();
  }
});

class TextGateway implements TextChatGatewayLike {
  readonly calls: Array<{
    model: string;
    prompt: string;
    responseFormat?: "json_object" | "text";
  }> = [];

  async completeJson(input: {
    model: string;
    prompt: string;
    responseFormat?: "json_object" | "text";
  }) {
    this.calls.push(input);
    return input.prompt.includes("Markdown") ? "# AI Markdown 结果" : "AI 文本结果";
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
