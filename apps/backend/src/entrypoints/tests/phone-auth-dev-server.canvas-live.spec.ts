import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { normalizeCnPhone } from "../../modules/identity/phone-auth.utils.ts";
import {
  createUserPasswordHash,
  defaultPasswordFromPhone,
} from "../../modules/identity/team-account-credentials.service.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import { createPhoneAuthDevServer, formatCanvasLiveSseChunk } from "../phone-auth-dev-server.ts";

describe.configure?.({ concurrency: 1 });

describe("canvas live HTTP", { concurrency: false }, () => {
  it("emits revision event IDs for Last-Event-ID resume", () => {
    assert.match(formatCanvasLiveSseChunk({
      type: "revision",
      eventId: "revision-event-2",
      sourceId: "server-a",
      canvasProjectId: "canvas-a",
      actorId: "owner-a",
      serverRevision: 2,
      at: "2026-07-26T00:00:00.000Z",
    }), /^id: revision-event-2\ndata:/);
  });

  it("authenticates the SSE channel and pushes a committed revision without waiting for polling", async () => {
    const db = await createMigratedTestDb();
    const phone = normalizeCnPhone("13800138991");
    const password = defaultPasswordFromPhone(phone);
    const userId = randomUUID();
    await db.query(
      `
        INSERT INTO users (id, phone_e164, password_hash, status)
        VALUES ($1, $2, $3, 'active')
      `,
      [userId, phone, await createUserPasswordHash(password)],
    );
    const server = createPhoneAuthDevServer({ db, env: { NODE_ENV: "test" } });
    const streamController = new AbortController();

    try {
      await server.listen(0);
      const loginResponse = await fetch(`${server.origin}/api/auth/password/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account: phone, password }),
      });
      assert.equal(loginResponse.status, 200);
      const cookie = loginResponse.headers.get("set-cookie") ?? "";

      const createResponse = await fetch(`${server.origin}/api/creator/canvas-projects`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ title: "Live canvas" }),
      });
      const created = await createResponse.json();
      const canvasProjectId = created.data.project.id;

      const anonymousResponse = await fetch(`${server.origin}/api/canvas/${canvasProjectId}/live`);
      assert.equal(anonymousResponse.status, 401);

      const liveResponse = await fetch(`${server.origin}/api/canvas/${canvasProjectId}/live`, {
        headers: { accept: "text/event-stream", cookie },
        signal: streamController.signal,
      });
      assert.equal(liveResponse.status, 200);
      assert.match(liveResponse.headers.get("content-type") ?? "", /^text\/event-stream/);
      const live = createSseReader(liveResponse);
      const presence = await live.next((event) => event.type === "presence");
      assert.equal(presence.canvasProjectId, canvasProjectId);
      assert.equal(presence.action, "snapshot");
      assert.equal(presence.members.length, 1);

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
            nodes: [{ id: "live-text", type: "text", data: { title: "Live revision" } }],
            edges: [],
          },
          events: [],
        }),
      });
      const saved = await saveResponse.json();
      assert.equal(saveResponse.status, 200);
      assert.equal(saved.data.canvas.serverRevision, 2);

      const revision = await live.next((event) => event.type === "revision");
      assert.equal(revision.canvasProjectId, canvasProjectId);
      assert.equal(revision.serverRevision, 2);

      await db.query("UPDATE users SET status = 'disabled' WHERE id = $1", [userId]);
      await assert.rejects(
        () => live.next(() => false),
        /canvas_live_sse_ended/,
      );
    } finally {
      streamController.abort();
      await server.close();
    }
  });

  it("requires authentication and returns the latest current canvas head", async () => {
    const db = await createMigratedTestDb();
    const phone = normalizeCnPhone("13800138992");
    const password = defaultPasswordFromPhone(phone);
    await db.query(
      `
        INSERT INTO users (id, phone_e164, password_hash, status)
        VALUES ($1, $2, $3, 'active')
      `,
      [randomUUID(), phone, await createUserPasswordHash(password)],
    );
    const server = createPhoneAuthDevServer({ db, env: { NODE_ENV: "test" } });

    try {
      await server.listen(0);
      const loginResponse = await fetch(`${server.origin}/api/auth/password/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account: phone, password }),
      });
      assert.equal(loginResponse.status, 200);
      const cookie = loginResponse.headers.get("set-cookie") ?? "";

      const createResponse = await fetch(`${server.origin}/api/creator/canvas-projects`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ title: "Head canvas" }),
      });
      const created = await createResponse.json();
      const canvasProjectId = created.data.project.id;

      const anonymousHeadResponse = await fetch(`${server.origin}/api/canvas/${canvasProjectId}/head`);
      assert.equal(anonymousHeadResponse.status, 401);

      for (const [clientRevision, nodeId] of [[1, "head-first"], [2, "head-latest"]] as const) {
        const saveResponse = await fetch(`${server.origin}/api/creator/canvas-projects/${canvasProjectId}/canvas`, {
          method: "PUT",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({
            clientRevision,
            document: {
              version: 1,
              canvasProjectId,
              projectId: canvasProjectId,
              viewport: { x: 0, y: 0, zoom: 1 },
              nodes: [{ id: nodeId, type: "text", data: { title: nodeId } }],
              edges: [],
            },
            events: [],
          }),
        });
        const saved = await saveResponse.json();
        assert.equal(saveResponse.status, 200);
        assert.equal(saved.data.canvas.serverRevision, clientRevision + 1);
      }

      const headResponse = await fetch(`${server.origin}/api/canvas/${canvasProjectId}/head`, {
        headers: { cookie },
      });
      const head = await headResponse.json();
      assert.equal(headResponse.status, 200);
      assert.equal(head.data.head.canvasProjectId, canvasProjectId);
      assert.equal(head.data.head.serverRevision, 3);
      assert.equal(head.data.head.document.nodes[0].id, "head-latest");

      const savedSessionResponse = await fetch(`${server.origin}/api/canvas/${canvasProjectId}/session`, {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          viewport: { x: 120, y: -40, zoom: 1.25 },
          selectedNodeKeys: ["head-latest"],
          selectedEdgeKeys: [],
          uiState: { sidebar: "assets" },
          lastSeenRevision: 3,
        }),
      });
      const savedSession = await savedSessionResponse.json();
      assert.equal(savedSessionResponse.status, 200, JSON.stringify(savedSession));
      assert.equal(savedSession.data.session.principalKey.startsWith("owner:"), true);

      const sessionResponse = await fetch(`${server.origin}/api/canvas/${canvasProjectId}/session`, {
        headers: { cookie },
      });
      const session = await sessionResponse.json();
      assert.equal(sessionResponse.status, 200, JSON.stringify(session));
      assert.deepEqual(session.data.session.viewport, { x: 120, y: -40, zoom: 1.25 });
      assert.deepEqual(session.data.session.selectedNodeKeys, ["head-latest"]);
      assert.equal(session.data.session.lastSeenRevision, 3);
    } finally {
      await server.close();
    }
  });
});

function createSseReader(response: Response) {
  const reader = response.body?.getReader();
  assert.ok(reader);
  const decoder = new TextDecoder();
  let buffer = "";
  const queued: Array<Record<string, unknown>> = [];

  return {
    async next(predicate: (event: Record<string, unknown>) => boolean) {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const queuedIndex = queued.findIndex(predicate);
        if (queuedIndex >= 0) return queued.splice(queuedIndex, 1)[0]!;
        const remaining = deadline - Date.now();
        const result = await Promise.race([
          reader.read(),
          new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("canvas_live_sse_timeout")), remaining)),
        ]);
        if (result.done) throw new Error("canvas_live_sse_ended");
        buffer += decoder.decode(result.value, { stream: true });
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const data = part.split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (!data) continue;
          try {
            const event = JSON.parse(data);
            if (event && typeof event === "object") queued.push(event);
          } catch {
            // Ignore malformed events; a later valid event can still complete the test.
          }
        }
      }
      throw new Error("canvas_live_sse_timeout");
    },
  };
}
