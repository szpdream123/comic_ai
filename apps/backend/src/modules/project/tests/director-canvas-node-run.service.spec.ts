import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TextChatGatewayLike } from "../../ai-storyboard/ai-storyboard-preview.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  getOrCreateProjectCanvas,
  saveProjectCanvas,
} from "../creator-canvas-record.service.ts";
import {
  DIRECTOR_NODE_INPUT_MAX_LENGTH,
  DirectorCanvasNodeRunError,
  runDirectorCanvasNode,
} from "../director-canvas-node-run.service.ts";

const userId = "00000000-0000-4000-8000-000000000761";
const projectId = "30000000-0000-4000-8000-000000000761";

describe("director canvas node run service", { concurrency: false }, () => {
  it("persists structured text output and replays the same run without another model call", async () => {
    const db = await createMigratedTestDb();
    const gateway = new StubGateway(JSON.stringify({
      directorInstructions: "低机位推进，雨夜保持冷色调。",
      shots: [{ order: 1, action: "人物入场", camera: "低机位推进", prompt: "雨夜街道人物入场" }],
      continuityNotes: ["服装保持一致"],
      negativeConstraints: ["不要跳轴"],
    }));
    try {
      const canvas = await seedDirectorCanvas(db);
      const first = await runDirectorCanvasNode(db, {
        canvas,
        nodeKey: "director-1",
        idempotencyKey: "director-run-1",
        body: { kind: "director", prompt: "强化悬疑氛围" },
        userId,
        gateway,
        now: new Date("2026-07-20T09:00:00.000Z"),
      });
      assert.equal(first.status, "succeeded");
      assert.equal(first.replayed, false);
      assert.equal(first.result.text, "低机位推进，雨夜保持冷色调。");
      assert.equal(first.artifact.artifactKind, "text");
      assert.equal(gateway.calls.length, 1);
      assert.match(gateway.calls[0]?.prompt ?? "", /雨夜街道/);
      assert.match(gateway.calls[0]?.prompt ?? "", /强化悬疑氛围/);

      const replayed = await runDirectorCanvasNode(db, {
        canvas,
        nodeKey: "director-1",
        idempotencyKey: "director-run-1",
        body: { kind: "director", prompt: "强化悬疑氛围" },
        userId,
        gateway,
        now: new Date("2026-07-20T09:01:00.000Z"),
      });
      assert.equal(replayed.runId, first.runId);
      assert.equal(replayed.replayed, true);
      assert.equal(gateway.calls.length, 1);

      const persisted = await db.query<{
        status: string;
        media_kind: string;
        input_snapshot_json: Record<string, unknown>;
        output_snapshot_json: Record<string, unknown>;
        artifact_kind: string;
        url: string | null;
        metadata_json: Record<string, unknown>;
        server_revision: number;
        document_json: { nodes: Array<{ id: string; data: Record<string, unknown> }> };
      }>(
        `
          SELECT run.status, run.media_kind, run.input_snapshot_json, run.output_snapshot_json,
                 artifact.artifact_kind, artifact.url, artifact.metadata_json,
                 project.server_revision, document.document_json
          FROM creator_canvas_node_runs run
          JOIN creator_canvas_node_artifacts artifact ON artifact.run_id = run.id
          JOIN creator_canvas_projects project ON project.id = run.canvas_project_id
          JOIN creator_canvas_documents document ON document.id = project.latest_document_id
          WHERE run.id = $1
        `,
        [first.runId],
      );
      const row = persisted.rows[0]!;
      assert.equal(row.status, "succeeded");
      assert.equal(row.media_kind, "text");
      assert.deepEqual(row.input_snapshot_json.recoveryInput, {
        version: 1,
        instructions: "",
        prompt: "强化悬疑氛围",
        model: "",
        upstreamNodeIds: ["script-1"],
        upstreamTextFragments: [],
        connections: [{
          sourceNodeId: "script-1",
          sourcePortId: "out_text",
          targetNodeId: "director-1",
          targetPortId: "in_any",
          kind: "text",
        }],
        mediaReferences: [],
      });
      assert.equal(row.artifact_kind, "text");
      assert.equal(row.url, null);
      assert.equal(row.metadata_json.directorInstructions, "低机位推进，雨夜保持冷色调。");
      assert.equal(row.server_revision, canvas.serverRevision);
      const directorNode = row.document_json.nodes.find((node) => node.id === "director-1");
      assert.equal(directorNode?.data.resultText, undefined);
    } finally {
      await db.close();
    }
  });

  it("persists a failed run when the text gateway rejects", async () => {
    const db = await createMigratedTestDb();
    const gateway = new StubGateway(new Error("provider unavailable"));
    try {
      const canvas = await seedDirectorCanvas(db);
      await assert.rejects(
        runDirectorCanvasNode(db, {
          canvas,
          nodeKey: "director-1",
          idempotencyKey: "director-run-failed",
          body: { kind: "director", instructions: "强调人物冲突" },
          userId,
          gateway,
          now: new Date("2026-07-20T10:00:00.000Z"),
        }),
        (error: unknown) => error instanceof DirectorCanvasNodeRunError
          && error.code === "canvas_director_generation_failed"
          && typeof error.details.runId === "string",
      );
      const failed = await db.query<{
        status: string;
        failure_json: Record<string, unknown>;
        artifact_count: number;
        document_json: { nodes: Array<{ id: string; data: Record<string, unknown> }> };
      }>(
        `
          SELECT run.status, run.failure_json,
                 count(artifact.id)::int AS artifact_count,
                 document.document_json
          FROM creator_canvas_node_runs run
          JOIN creator_canvas_projects project ON project.id = run.canvas_project_id
          JOIN creator_canvas_documents document ON document.id = project.latest_document_id
          LEFT JOIN creator_canvas_node_artifacts artifact ON artifact.run_id = run.id
          WHERE run.idempotency_key = 'director-run-failed'
          GROUP BY run.status, run.failure_json, document.document_json
        `,
      );
      assert.equal(failed.rows[0]?.status, "failed");
      assert.equal(failed.rows[0]?.failure_json.failureCode, "canvas_director_generation_failed");
      assert.equal(failed.rows[0]?.artifact_count, 0);
      const node = failed.rows[0]?.document_json.nodes.find((item) => item.id === "director-1");
      assert.equal(node?.data.failureCode, undefined);
    } finally {
      await db.close();
    }
  });

  it("allows only one model call for concurrent requests with the same idempotency key", async () => {
    const db = await createMigratedTestDb();
    const gateway = new DelayedGateway();
    try {
      const canvas = await seedDirectorCanvas(db);
      const request = () => runDirectorCanvasNode(db, {
        canvas,
        nodeKey: "director-1",
        idempotencyKey: "director-concurrent",
        body: { kind: "director", prompt: "并发生成" },
        userId,
        gateway,
        now: new Date("2026-07-20T09:30:00.000Z"),
      });
      const [first, second] = await Promise.all([request(), request()]);
      assert.equal(first.runId, second.runId);
      assert.equal(gateway.calls, 1);
      assert.ok([first.status, second.status].includes("succeeded"));
      const count = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM creator_canvas_node_runs WHERE idempotency_key = 'director-concurrent'",
      );
      assert.equal(count.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("rejects non-director nodes and oversized input before creating a run", async () => {
    const db = await createMigratedTestDb();
    const gateway = new StubGateway("{}");
    try {
      const canvas = await seedDirectorCanvas(db);
      await assert.rejects(
        runDirectorCanvasNode(db, {
          canvas,
          nodeKey: "script-1",
          idempotencyKey: "wrong-node",
          body: { kind: "director", prompt: "test" },
          userId,
          gateway,
          now: new Date(),
        }),
        (error: unknown) => error instanceof DirectorCanvasNodeRunError
          && error.code === "canvas_director_node_invalid",
      );
      await assert.rejects(
        runDirectorCanvasNode(db, {
          canvas,
          nodeKey: "director-1",
          idempotencyKey: "oversized-input",
          body: { kind: "director", prompt: "x".repeat(DIRECTOR_NODE_INPUT_MAX_LENGTH + 1) },
          userId,
          gateway,
          now: new Date(),
        }),
        (error: unknown) => error instanceof DirectorCanvasNodeRunError
          && error.code === "canvas_director_input_too_long",
      );
      assert.equal(gateway.calls.length, 0);
      const count = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM creator_canvas_node_runs");
      assert.equal(count.rows[0]?.count, 0);
    } finally {
      await db.close();
    }
  });
});

class StubGateway implements TextChatGatewayLike {
  readonly calls: Array<{ model: string; prompt: string }> = [];

  constructor(private readonly response: string | Error) {}

  async completeJson(input: { model: string; prompt: string }) {
    this.calls.push(input);
    if (this.response instanceof Error) throw this.response;
    return this.response;
  }
}

class DelayedGateway implements TextChatGatewayLike {
  calls = 0;

  async completeJson() {
    this.calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 25));
    return JSON.stringify({ directorInstructions: "并发结果", shots: [] });
  }
}

async function seedDirectorCanvas(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  await db.query(
    "INSERT INTO users (id, phone_e164, status) VALUES ($1, '13800138761', 'active')",
    [userId],
  );
  await db.query(
    `
      INSERT INTO projects (id, name, aspect_ratio, resolution, phase, owner_user_id, created_by_user_id)
      VALUES ($1, 'Director canvas', '9:16', '1080p', 'shot_generation', $2, $2)
    `,
    [projectId, userId],
  );
  const canvas = await getOrCreateProjectCanvas(db, { projectId, userId, now: new Date("2026-07-20T08:00:00.000Z") });
  return saveProjectCanvas(db, {
    projectId,
    userId,
    clientRevision: canvas.serverRevision,
    document: {
      ...canvas.document,
      nodes: [
        {
          id: "script-1",
          type: "script",
          position: { x: 0, y: 0 },
          size: { width: 320, height: 180 },
          data: {
            text: "雨夜街道，人物从巷口入场。",
            ports: { inputs: [], outputs: [{ id: "out_text", kind: "text" }] },
          },
        },
        {
          id: "director-1",
          type: "director",
          position: { x: 400, y: 0 },
          size: { width: 360, height: 220 },
          data: {
            instructions: "保持角色连续性",
            ports: { inputs: [{ id: "in_any", kind: "any" }], outputs: [{ id: "out_text", kind: "text" }] },
            loomicElement: {
              type: "rectangle",
              customData: { type: "director-node", workflowNodeType: "director" },
            },
          },
        },
      ],
      edges: [{
        id: "script-director",
        sourceNodeId: "script-1",
        sourcePortId: "out_text",
        targetNodeId: "director-1",
        targetPortId: "in_any",
        data: { kind: "text" },
      }],
    },
    now: new Date("2026-07-20T08:01:00.000Z"),
  });
}
