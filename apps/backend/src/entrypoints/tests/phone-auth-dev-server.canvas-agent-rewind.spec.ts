import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";

import { capabilities } from "../../../../../packages/contracts/domain/capabilities.ts";
import {
  createCanvasAgentConversation,
  createCanvasAgentStep,
  createCanvasAgentTask,
  updateCanvasAgentStep,
} from "../../modules/canvas-agent/canvas-agent-task.service.ts";
import type { CanvasAgentActor } from "../../modules/canvas-agent/canvas-agent.types.ts";
import { createUserPasswordHash, defaultPasswordFromPhone } from "../../modules/identity/team-account-credentials.service.ts";
import { ensureCanvasCheckpointRevision } from "../../modules/project/creator-canvas-record.service.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

it("rewinds an Agent checkpoint whose throttled autosave revision has no history row", async () => {
  const db = await createMigratedTestDb();
  const server = createPhoneAuthDevServer({
    db,
    env: { NODE_ENV: "test", AUTH_SESSION_REDIS_CACHE_ENABLED: "false", NEW_CANVAS_ENABLED: "true" },
    repairScheduler: { enabled: false },
  });
  const userId = randomUUID();
  const phone = `135${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}`;
  const actor: CanvasAgentActor = {
    ownerUserId: userId,
    actorTeamMemberId: null,
    capabilities: new Set([capabilities.canvasView, capabilities.canvasEdit, capabilities.canvasRun]),
  };
  try {
    await db.query(
      "INSERT INTO users (id,phone_e164,password_hash,status) VALUES ($1,$2,$3,'active')",
      [userId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
    );
    await server.listen(0);
    const cookie = await passwordLogin(server.origin, phone);
    const created = await api(server.origin, "/api/creator/canvas-projects", cookie, {
      method: "POST",
      body: { title: "Agent rewind checkpoint" },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const canvasId = String(created.body.data.project.id);
    const initial = await api(server.origin, `/api/creator/canvases/${canvasId}/document`, cookie);
    assert.equal(initial.status, 200, JSON.stringify(initial.body));
    const initialCanvas = initial.body.data.canvas;
    const baseDocument = initialCanvas.document;
    const firstDocument = withSourceText(baseDocument, "before checkpoint");
    const firstSave = await api(server.origin, `/api/creator/canvases/${canvasId}/document`, cookie, {
      method: "PUT",
      body: { clientRevision: initialCanvas.serverRevision, document: firstDocument },
    });
    assert.equal(firstSave.status, 200, JSON.stringify(firstSave.body));
    const checkpointDocument = withSourceText(firstSave.body.data.canvas.document, "checkpoint state");
    const checkpointSave = await api(server.origin, `/api/creator/canvases/${canvasId}/document`, cookie, {
      method: "PUT",
      body: { clientRevision: firstSave.body.data.canvas.serverRevision, document: checkpointDocument },
    });
    assert.equal(checkpointSave.status, 200, JSON.stringify(checkpointSave.body));
    const checkpointRevision = Number(checkpointSave.body.data.canvas.serverRevision);
    const compacted = await db.query(
      "SELECT id FROM creator_canvas_revisions WHERE canvas_project_id=$1 AND server_revision=$2",
      [canvasId, checkpointRevision],
    );
    assert.equal(compacted.rows.length, 0);

    const conversation = await createCanvasAgentConversation(db, {
      canvasId,
      actor,
      title: "Rewind test",
      now: new Date(),
    });
    const task = await createCanvasAgentTask(db, {
      canvasId,
      conversationId: conversation.id,
      actor,
      mode: "b",
      modelCode: "rewind-test-model",
      modelConfigSnapshot: {},
      baseRevision: checkpointRevision,
      userMessage: { text: "change the canvas" },
      now: new Date(),
    });
    await createCanvasAgentStep(db, {
      taskId: task.id,
      kind: "model",
      effect: "read",
      input: {
        context: {
          canvas: {
            serverRevision: checkpointRevision,
            document: checkpointSave.body.data.canvas.document,
          },
        },
      },
      now: new Date(),
    });
    const writeStep = await createCanvasAgentStep(db, {
      taskId: task.id,
      kind: "tool",
      effect: "canvas_write",
      toolId: "canvas.patch",
      input: { expectedRevision: checkpointRevision, operations: [] },
      now: new Date(),
    });
    await updateCanvasAgentStep(db, {
      stepId: writeStep.id,
      status: "succeeded",
      checkpoint: { canvasId, revision: checkpointRevision, createdAt: new Date().toISOString() },
      now: new Date(),
    });

    const changedDocument = withSourceText(checkpointSave.body.data.canvas.document, "changed after checkpoint");
    const changed = await api(server.origin, `/api/creator/canvases/${canvasId}/document`, cookie, {
      method: "PUT",
      body: { clientRevision: checkpointRevision, document: changedDocument },
    });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    const rewound = await api(server.origin, `/api/canvas/${canvasId}/agent-tasks/${task.id}/rewind`, cookie, {
      method: "POST",
      body: {},
    });
    assert.equal(rewound.status, 200, JSON.stringify(rewound.body));
    const restored = await api(server.origin, `/api/creator/canvases/${canvasId}/document`, cookie);
    assert.equal(restored.body.data.canvas.document.nodes[0].data.text, "checkpoint state");

    const currentRevision = await ensureCanvasCheckpointRevision(db, {
      canvasProjectId: canvasId,
      userId,
      now: new Date(),
    });
    const durable = await db.query<{ operation: string }>(`
      SELECT operation FROM creator_canvas_revisions
      WHERE canvas_project_id=$1 AND server_revision=$2
    `, [canvasId, currentRevision]);
    assert.deepEqual(durable.rows, [{ operation: "agent_checkpoint" }]);
  } finally {
    await server.close().catch(() => undefined);
    await db.close();
  }
});

function withSourceText(document: Record<string, any>, value: string) {
  return {
    ...document,
    updatedAt: new Date().toISOString(),
    nodes: [{
      id: "source-1",
      type: "source-text",
      position: { x: 0, y: 0 },
      size: { width: 300, height: 300 },
      zIndex: 1,
      data: { text: value },
    }],
    edges: [],
    groups: [],
  };
}

async function passwordLogin(origin: string, phone: string) {
  const response = await fetch(`${origin}/api/auth/password/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account: phone, password: defaultPasswordFromPhone(phone) }),
  });
  assert.equal(response.status, 200, await response.text());
  return response.headers.get("set-cookie") ?? "";
}

async function api(
  origin: string,
  path: string,
  cookie: string,
  options: { method?: string; body?: unknown } = {},
) {
  const response = await fetch(`${origin}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      cookie,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
}
