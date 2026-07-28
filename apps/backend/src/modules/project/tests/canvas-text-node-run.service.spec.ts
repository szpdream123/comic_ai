import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TextChatGatewayLike } from "../../ai-storyboard/ai-storyboard-preview.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { saveCanvasByCanvasProjectId } from "../creator-canvas-record.service.ts";
import {
  CANVAS_TEXT_NODE_INPUT_MAX_LENGTH,
  CANVAS_TEXT_NODE_OUTPUT_MAX_LENGTH,
  CanvasTextNodeRunError,
  runCanvasTextNode,
} from "../canvas-text-node-run.service.ts";

const userId = "00000000-0000-4000-8000-000000000762";
const canvasProjectId = "30000000-0000-4000-8000-000000000762";

describe("canvas text node run service", { concurrency: false }, () => {
  it("generates text, persists a text artifact, and replays without another gateway call", async () => {
    const db = await createMigratedTestDb();
    const gateway = new StubGateway("改写后的雨夜开场。\n人物从巷口走出。");
    try {
      const canvas = await seedCanvas(db);
      const first = await runCanvasTextNode(db, {
        canvas,
        nodeKey: "ai-text-1",
        idempotencyKey: "text-run-1",
        body: { prompt: "改写得更有悬疑感", model: "deepseek-chat" },
        userId,
        gateway,
        now: new Date("2026-07-26T02:00:00.000Z"),
      });

      assert.equal(first.status, "succeeded");
      assert.equal(first.replayed, false);
      assert.equal(first.result.text, "改写后的雨夜开场。\n人物从巷口走出。");
      assert.equal(first.result.format, "text");
      assert.equal(first.artifact.artifactKind, "text");
      assert.equal(gateway.calls.length, 1);
      assert.equal(gateway.calls[0]?.responseFormat, "text");
      assert.match(gateway.calls[0]?.prompt ?? "", /改写得更有悬疑感/);
      assert.match(gateway.calls[0]?.prompt ?? "", /雨夜街道/);

      const replayed = await runCanvasTextNode(db, {
        canvas,
        nodeKey: "ai-text-1",
        idempotencyKey: "text-run-1",
        body: { prompt: "改写得更有悬疑感", model: "deepseek-chat" },
        userId,
        gateway,
        now: new Date("2026-07-26T02:01:00.000Z"),
      });
      assert.equal(replayed.runId, first.runId);
      assert.equal(replayed.replayed, true);
      assert.equal(gateway.calls.length, 1);

      const stored = await db.query<{
        status: string;
        media_kind: string;
        input_snapshot_json: Record<string, unknown>;
        output_snapshot_json: Record<string, unknown>;
        artifact_kind: string;
        url: string | null;
        metadata_json: Record<string, unknown>;
      }>(
        `
          SELECT run.status, run.media_kind, run.input_snapshot_json, run.output_snapshot_json,
                 artifact.artifact_kind, artifact.url, artifact.metadata_json
          FROM creator_canvas_node_runs run
          JOIN creator_canvas_node_artifacts artifact ON artifact.run_id = run.id
          WHERE run.id = $1
        `,
        [first.runId],
      );
      assert.equal(stored.rows[0]?.status, "succeeded");
      assert.equal(stored.rows[0]?.media_kind, "text");
      assert.equal(stored.rows[0]?.input_snapshot_json.format, "text");
      assert.deepEqual(stored.rows[0]?.input_snapshot_json.upstreamNodeIds, ["source-1"]);
      assert.equal(stored.rows[0]?.output_snapshot_json.text, first.result.text);
      assert.equal(stored.rows[0]?.artifact_kind, "text");
      assert.equal(stored.rows[0]?.url, null);
      assert.equal(stored.rows[0]?.metadata_json.text, first.result.text);
    } finally {
      await db.close();
    }
  });

  it("uses Markdown output instructions for ai-markdown nodes", async () => {
    const db = await createMigratedTestDb();
    const gateway = new StubGateway("# 场景\n\n- 雨夜\n- 巷口");
    try {
      const canvas = await seedCanvas(db);
      const result = await runCanvasTextNode(db, {
        canvas,
        nodeKey: "ai-markdown-1",
        idempotencyKey: "markdown-run-1",
        body: { instructions: "整理为场景清单" },
        userId,
        gateway,
        now: new Date("2026-07-26T03:00:00.000Z"),
      });
      assert.equal(result.result.format, "markdown");
      assert.match(gateway.calls[0]?.prompt ?? "", /Markdown/);
      assert.equal(result.artifact.metadata.format, "markdown");
    } finally {
      await db.close();
    }
  });

  it("rejects idempotency conflicts and invalid or oversized input before another model call", async () => {
    const db = await createMigratedTestDb();
    const gateway = new StubGateway("first output");
    try {
      const canvas = await seedCanvas(db);
      await runCanvasTextNode(db, {
        canvas,
        nodeKey: "ai-text-1",
        idempotencyKey: "shared-key",
        body: { prompt: "first prompt" },
        userId,
        gateway,
        now: new Date("2026-07-26T04:00:00.000Z"),
      });
      await assert.rejects(
        runCanvasTextNode(db, {
          canvas,
          nodeKey: "ai-text-1",
          idempotencyKey: "shared-key",
          body: { prompt: "different prompt" },
          userId,
          gateway,
          now: new Date("2026-07-26T04:01:00.000Z"),
        }),
        (error: unknown) => error instanceof CanvasTextNodeRunError
          && error.code === "canvas_text_idempotency_conflict"
          && error.status === 409,
      );
      await assert.rejects(
        runCanvasTextNode(db, {
          canvas,
          nodeKey: "source-1",
          idempotencyKey: "wrong-node",
          body: { prompt: "test" },
          userId,
          gateway,
          now: new Date(),
        }),
        (error: unknown) => error instanceof CanvasTextNodeRunError
          && error.code === "canvas_text_node_invalid",
      );
      await assert.rejects(
        runCanvasTextNode(db, {
          canvas,
          nodeKey: "ai-text-1",
          idempotencyKey: "oversized-input",
          body: { prompt: "x".repeat(CANVAS_TEXT_NODE_INPUT_MAX_LENGTH + 1) },
          userId,
          gateway,
          now: new Date(),
        }),
        (error: unknown) => error instanceof CanvasTextNodeRunError
          && error.code === "canvas_text_input_too_long",
      );
      assert.equal(gateway.calls.length, 1);
      const count = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM creator_canvas_node_runs");
      assert.equal(count.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("persists gateway and output-limit failures without creating an artifact", async () => {
    const db = await createMigratedTestDb();
    try {
      const canvas = await seedCanvas(db);
      await assert.rejects(
        runCanvasTextNode(db, {
          canvas,
          nodeKey: "ai-text-1",
          idempotencyKey: "gateway-failure",
          body: { prompt: "generate" },
          userId,
          gateway: new StubGateway(new Error("provider unavailable")),
          now: new Date("2026-07-26T05:00:00.000Z"),
        }),
        (error: unknown) => error instanceof CanvasTextNodeRunError
          && error.code === "canvas_text_generation_failed"
          && typeof error.details.runId === "string",
      );
      await assert.rejects(
        runCanvasTextNode(db, {
          canvas,
          nodeKey: "ai-markdown-1",
          idempotencyKey: "oversized-output",
          body: { prompt: "generate" },
          userId,
          gateway: new StubGateway("x".repeat(CANVAS_TEXT_NODE_OUTPUT_MAX_LENGTH + 1)),
          now: new Date("2026-07-26T05:01:00.000Z"),
        }),
        (error: unknown) => error instanceof CanvasTextNodeRunError
          && error.code === "canvas_text_response_too_long"
          && typeof error.details.runId === "string",
      );
      const failed = await db.query<{
        idempotency_key: string;
        status: string;
        failure_json: Record<string, unknown>;
        artifact_count: number;
      }>(
        `
          SELECT run.idempotency_key, run.status, run.failure_json,
                 count(artifact.id)::int AS artifact_count
          FROM creator_canvas_node_runs run
          LEFT JOIN creator_canvas_node_artifacts artifact ON artifact.run_id = run.id
          GROUP BY run.idempotency_key, run.status, run.failure_json
          ORDER BY run.idempotency_key
        `,
      );
      assert.deepEqual(failed.rows.map((row) => ({
        key: row.idempotency_key,
        status: row.status,
        code: row.failure_json.failureCode,
        artifacts: row.artifact_count,
      })), [
        { key: "gateway-failure", status: "failed", code: "canvas_text_generation_failed", artifacts: 0 },
        { key: "oversized-output", status: "failed", code: "canvas_text_response_too_long", artifacts: 0 },
      ]);
    } finally {
      await db.close();
    }
  });
});

class StubGateway implements TextChatGatewayLike {
  readonly calls: Array<{ model: string; prompt: string; responseFormat?: "json_object" | "text" }> = [];

  constructor(private readonly response: string | Error) {}

  async completeJson(input: { model: string; prompt: string; responseFormat?: "json_object" | "text" }) {
    this.calls.push(input);
    if (this.response instanceof Error) throw this.response;
    return this.response;
  }
}

async function seedCanvas(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  await db.query(
    "INSERT INTO users (id, phone_e164, status) VALUES ($1, '13800138762', 'active')",
    [userId],
  );
  await db.query(
    `
      INSERT INTO creator_canvas_projects (
        id, title, status, server_revision, created_by_user_id, updated_by_user_id, created_at, updated_at
      )
      VALUES ($1, 'AI text canvas', 'active', 1, $2, $2, $3, $3)
    `,
    [canvasProjectId, userId, new Date("2026-07-26T01:00:00.000Z")],
  );
  return saveCanvasByCanvasProjectId(db, {
    canvasProjectId,
    userId,
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
            text: "雨夜街道，人物从巷口入场。",
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
          id: "source-text",
          sourceNodeId: "source-1",
          sourcePortId: "out_text",
          targetNodeId: "ai-text-1",
          targetPortId: "in_text",
          data: { kind: "text" },
        },
        {
          id: "source-markdown",
          sourceNodeId: "source-1",
          sourcePortId: "out_text",
          targetNodeId: "ai-markdown-1",
          targetPortId: "in_text",
          data: { kind: "text" },
        },
      ],
      groups: [],
      createdAt: "2026-07-26T01:00:00.000Z",
      updatedAt: "2026-07-26T01:00:00.000Z",
    },
    now: new Date("2026-07-26T01:01:00.000Z"),
  });
}
