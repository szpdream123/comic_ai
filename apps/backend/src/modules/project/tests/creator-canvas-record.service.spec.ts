import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createWorkflowWithTasks } from "../../workflow-task/workflow-task.service.ts";
import {
  attachCanvasTaskResultToHistory,
  appendCanvasNodeArtifact,
  createCanvasNodeRun,
  getCanvasRevision,
  listCanvasRevisions,
  listCanvasNodeRuns,
  saveCanvasByCanvasProjectId,
  selectCanvasNodeArtifact,
} from "../creator-canvas-record.service.ts";

const userId = "00000000-0000-4000-8000-000000000701";

describe("creator canvas record service", { concurrency: false }, () => {
  it("scopes run idempotency keys to a canvas project", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUser(db);
      const firstCanvas = await createStandaloneCanvas(db, {
        userId,
        now: new Date("2026-06-12T09:00:00.000Z"),
      });
      await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: firstCanvas.canvasProjectId,
        userId,
        clientRevision: firstCanvas.serverRevision,
        document: { ...firstCanvas.document, nodes: [canvasNode("node-1", "image", 0, 0, "image", "Image")], edges: [] },
        now: new Date("2026-06-12T09:00:30.000Z"),
      });
      const secondCanvas = await createStandaloneCanvas(db, {
        userId,
        now: new Date("2026-06-12T09:01:00.000Z"),
      });
      await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: secondCanvas.canvasProjectId,
        userId,
        clientRevision: secondCanvas.serverRevision,
        document: { ...secondCanvas.document, nodes: [canvasNode("node-1", "image", 0, 0, "image", "Image")], edges: [] },
        now: new Date("2026-06-12T09:01:30.000Z"),
      });

      const firstRun = await createCanvasNodeRun(db, {
        canvasProjectId: firstCanvas.canvasProjectId,
        nodeKey: "node-1",
        idempotencyKey: "shared-client-key",
        mediaKind: "image",
        userId,
        now: new Date("2026-06-12T09:02:00.000Z"),
      });
      const secondRun = await createCanvasNodeRun(db, {
        canvasProjectId: secondCanvas.canvasProjectId,
        nodeKey: "node-1",
        idempotencyKey: "shared-client-key",
        mediaKind: "image",
        userId,
        now: new Date("2026-06-12T09:03:00.000Z"),
      });

      assert.notEqual(firstRun.id, secondRun.id);
    } finally {
      await db.close();
    }
  });

  it("allocates distinct run numbers for concurrent starts on one node", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUser(db);
      const canvas = await createStandaloneCanvas(db, {
        userId,
        now: new Date("2026-06-12T09:10:00.000Z"),
      });
      await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: canvas.canvasProjectId,
        userId,
        clientRevision: canvas.serverRevision,
        document: {
          ...canvas.document,
          nodes: [canvasNode("node-1", "image", 0, 0, "image", "Image")],
          edges: [],
        },
        now: new Date("2026-06-12T09:10:30.000Z"),
      });

      const runs = await Promise.all([
        createCanvasNodeRun(db, {
          canvasProjectId: canvas.canvasProjectId,
          nodeKey: "node-1",
          idempotencyKey: "concurrent-run-a",
          mediaKind: "image",
          userId,
          now: new Date("2026-06-12T09:11:00.000Z"),
        }),
        createCanvasNodeRun(db, {
          canvasProjectId: canvas.canvasProjectId,
          nodeKey: "node-1",
          idempotencyKey: "concurrent-run-b",
          mediaKind: "image",
          userId,
          now: new Date("2026-06-12T09:11:01.000Z"),
        }),
      ]);

      assert.deepEqual(runs.map((run) => run.runNo).sort((a, b) => a - b), [1, 2]);
      assert.equal(new Set(runs.map((run) => run.id)).size, 2);
    } finally {
      await db.close();
    }
  });

  it("soft-deletes removed nodes and edges while keeping revision history", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedUser(db);
      const canvas = await createStandaloneCanvas(db, {
        userId,
        now: new Date("2026-06-12T11:00:00.000Z"),
      });
      const withGraph = await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: canvas.canvasProjectId,
        userId,
        clientRevision: canvas.serverRevision,
        document: {
          ...canvas.document,
          nodes: [
            canvasNode("script-1", "script", 10, 20, "text", "Script"),
            canvasNode("image-1", "image", 420, 20, "image", "Image"),
          ],
          edges: [
            {
              id: "edge-1",
              sourceNodeId: "script-1",
              sourcePortId: "out-text",
              targetNodeId: "image-1",
              targetPortId: "in-text",
            },
          ],
        },
        now: new Date("2026-06-12T11:01:00.000Z"),
      });

      await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: canvas.canvasProjectId,
        userId,
        clientRevision: withGraph.serverRevision,
        document: {
          ...withGraph.document,
          nodes: [canvasNode("script-1", "script", 10, 20, "text", "Script")],
          edges: [],
        },
        now: new Date("2026-06-12T11:02:00.000Z"),
      });

      const rows = await db.query<{
        active_nodes: number;
        deleted_nodes: number;
        active_edges: number;
        deleted_edges: number;
        revision_count: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM creator_canvas_nodes WHERE canvas_project_id = $1 AND deleted_at IS NULL) AS active_nodes,
            (SELECT count(*)::int FROM creator_canvas_nodes WHERE canvas_project_id = $1 AND deleted_at IS NOT NULL) AS deleted_nodes,
            (SELECT count(*)::int FROM creator_canvas_edges WHERE canvas_project_id = $1 AND deleted_at IS NULL) AS active_edges,
            (SELECT count(*)::int FROM creator_canvas_edges WHERE canvas_project_id = $1 AND deleted_at IS NOT NULL) AS deleted_edges,
            (SELECT count(*)::int FROM creator_canvas_revisions WHERE canvas_project_id = $1) AS revision_count
        `,
        [canvas.canvasProjectId],
      );

      assert.deepEqual(rows.rows[0], {
        active_nodes: 1,
        deleted_nodes: 1,
        active_edges: 0,
        deleted_edges: 1,
        revision_count: 3,
      });
    } finally {
      await db.close();
    }
  });

  it("batches graph persistence, wraps saves in a transaction, and skips unchanged documents", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedUser(db);
      const canvas = await createStandaloneCanvas(db, {
        userId,
        now: new Date("2026-06-12T11:10:00.000Z"),
      });
      const graphDocument = {
        ...canvas.document,
        nodes: Array.from({ length: 12 }, (_, index) =>
          canvasNode(`node-${index}`, "video", index * 100, index * 50, "video", `Node ${index}`),
        ),
        edges: Array.from({ length: 11 }, (_, index) => ({
          id: `edge-${index}`,
          sourceNodeId: `node-${index}`,
          sourcePortId: "out-video",
          targetNodeId: `node-${index + 1}`,
          targetPortId: "in-text",
        })),
      };
      const commands: string[] = [];
      const countingDb = {
        async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
          commands.push(sql.trim().replace(/\s+/g, " "));
          return db.query<T>(sql, params);
        },
      };

      const saved = await saveCanvasByCanvasProjectId(countingDb, {
        canvasProjectId: canvas.canvasProjectId,
        userId,
        clientRevision: canvas.serverRevision,
        document: graphDocument,
        now: new Date("2026-06-12T11:11:00.000Z"),
      });
      const commandCountAfterChangedSave = commands.length;
      const unchanged = await saveCanvasByCanvasProjectId(countingDb, {
        canvasProjectId: canvas.canvasProjectId,
        userId,
        clientRevision: saved.serverRevision,
        document: saved.document,
        now: new Date("2026-06-12T11:12:00.000Z"),
      });
      const counts = await db.query<{ document_count: number; revision_count: number }>(
        `
          SELECT
            (SELECT count(*)::int FROM creator_canvas_documents WHERE canvas_project_id = $1) AS document_count,
            (SELECT count(*)::int FROM creator_canvas_revisions WHERE canvas_project_id = $1) AS revision_count
        `,
        [canvas.canvasProjectId],
      );

      assert.ok(commandCountAfterChangedSave <= 12, `expected at most 12 SQL commands, received ${commandCountAfterChangedSave}`);
      assert.equal(commands.filter((sql) => sql === "BEGIN").length, 2);
      assert.equal(commands.filter((sql) => sql === "COMMIT").length, 2);
      assert.equal(commands.filter((sql) => sql === "ROLLBACK").length, 0);
      assert.equal(saved.serverRevision, 2);
      assert.equal(unchanged.serverRevision, 2);
      assert.deepEqual(counts.rows[0], { document_count: 1, revision_count: 2 });
    } finally {
      await db.close();
    }
  });

  it("samples autosave revision history instead of storing every full snapshot", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedUser(db);
      let canvas = await createStandaloneCanvas(db, {
        userId,
        now: new Date("2026-06-12T11:20:00.000Z"),
      });
      for (let revision = 2; revision <= 11; revision += 1) {
        canvas = await saveCanvasByCanvasProjectId(db, {
          canvasProjectId: canvas.canvasProjectId,
          userId,
          clientRevision: canvas.serverRevision,
          document: {
            ...canvas.document,
            viewport: { ...canvas.document.viewport, x: revision },
          },
          now: new Date(`2026-06-12T11:20:${String(revision).padStart(2, "0")}.000Z`),
        });
      }
      const revisions = await db.query<{ server_revision: number }>(
        `SELECT server_revision FROM creator_canvas_revisions WHERE canvas_project_id = $1 ORDER BY server_revision`,
        [canvas.canvasProjectId],
      );

      assert.deepEqual(revisions.rows.map((row) => row.server_revision), [1, 2, 10]);
    } finally {
      await db.close();
    }
  });

  it("lists bounded revision metadata and reads only owned valid revision documents", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedUser(db);
      const otherUserId = "00000000-0000-4000-8000-000000000702";
      await db.query(
        `INSERT INTO users (id, phone_e164, status) VALUES ($1, '13800138702', 'active')`,
        [otherUserId],
      );
      const first = await createStandaloneCanvas(db, {
        userId,
        now: new Date("2026-06-12T11:30:00.000Z"),
      });
      await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: first.canvasProjectId,
        userId,
        clientRevision: first.serverRevision,
        document: {
          ...first.document,
          nodes: [
            canvasNode("revision-node", "text", 10, 20, "text", "Revision"),
            canvasNode("revision-image", "image", 160, 20, "image", "Image"),
            { ...canvasNode("__loomic_scene_v1__", "loomic_scene", 0, 0, "text", "Scene"), type: "loomic_scene" },
          ],
          edges: [],
        },
        now: new Date("2026-06-12T11:31:00.000Z"),
      });

      const limited = await listCanvasRevisions(db, {
        canvasProjectId: first.canvasProjectId,
        userId,
        limit: 1,
      });
      assert.equal(limited?.length, 1);
      assert.equal(limited?.[0]?.serverRevision, 2);
      assert.deepEqual(limited?.[0]?.summary, { nodeCount: 2, edgeCount: 0, mediaCount: 1 });
      assert.equal(Object.prototype.hasOwnProperty.call(limited?.[0] ?? {}, "document"), false);
      const older = await listCanvasRevisions(db, {
        canvasProjectId: first.canvasProjectId,
        userId,
        limit: 1,
        beforeRevision: 2,
      });
      assert.equal(older?.length, 1);
      assert.equal(older?.[0]?.serverRevision, 1);

      const revision = await getCanvasRevision(db, {
        canvasProjectId: first.canvasProjectId,
        revisionId: limited![0]!.id,
        userId,
      });
      assert.equal(revision?.document.nodes[0]?.id, "revision-node");
      assert.equal(await listCanvasRevisions(db, {
        canvasProjectId: first.canvasProjectId,
        userId: otherUserId,
      }), null);
      assert.equal(await getCanvasRevision(db, {
        canvasProjectId: first.canvasProjectId,
        revisionId: limited![0]!.id,
        userId: otherUserId,
      }), null);

      const invalidDocument = {
        ...revision!.document,
        nodes: [
          canvasNode("cycle-a", "text", 0, 0, "text", "A"),
          canvasNode("cycle-b", "text", 100, 0, "text", "B"),
        ],
        edges: [
          { id: "a-b", sourceNodeId: "cycle-a", sourcePortId: "out-text", targetNodeId: "cycle-b", targetPortId: "in-text" },
          { id: "b-a", sourceNodeId: "cycle-b", sourcePortId: "out-text", targetNodeId: "cycle-a", targetPortId: "in-text" },
        ],
      };
      await db.query(
        `UPDATE creator_canvas_revisions SET document_json = $2::jsonb WHERE id = $1`,
        [limited![0]!.id, JSON.stringify(invalidDocument)],
      );
      await assert.rejects(
        () => getCanvasRevision(db, {
          canvasProjectId: first.canvasProjectId,
          revisionId: limited![0]!.id,
          userId,
        }),
        (error: unknown) => (error as { code?: string }).code === "canvas_connection_cycle",
      );
    } finally {
      await db.close();
    }
  });

  it("records generated image and video artifacts as selectable node history", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedUser(db);
      const canvas = await createStandaloneCanvas(db, {
        userId,
        now: new Date("2026-06-12T12:00:00.000Z"),
      });
      const saved = await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: canvas.canvasProjectId,
        userId,
        clientRevision: canvas.serverRevision,
        document: {
          ...canvas.document,
          nodes: [canvasNode("image-1", "image", 80, 90, "image", "Image")],
          edges: [],
        },
        now: new Date("2026-06-12T12:01:00.000Z"),
      });

      const firstRun = await createCanvasNodeRun(db, {
        canvasProjectId: saved.canvasProjectId,
        nodeKey: "image-1",
        idempotencyKey: "canvas-history:image:first",
        status: "succeeded",
        mediaKind: "image",
        targetType: "canvas",
        targetId: "image-1",
        inputSnapshot: { prompt: "first image" },
        userId,
        now: new Date("2026-06-12T12:02:00.000Z"),
      });
      const firstArtifact = await appendCanvasNodeArtifact(db, {
        canvasProjectId: saved.canvasProjectId,
        nodeKey: "image-1",
        runId: firstRun.id,
        artifactKind: "image",
        url: "https://cdn.example.test/image-1.png",
        thumbnailUrl: "https://cdn.example.test/image-1-thumb.png",
        selected: true,
        metadata: { prompt: "first image" },
        userId,
        now: new Date("2026-06-12T12:03:00.000Z"),
      });
      const secondRun = await createCanvasNodeRun(db, {
        canvasProjectId: saved.canvasProjectId,
        nodeKey: "image-1",
        idempotencyKey: "canvas-history:video:first",
        status: "succeeded",
        mediaKind: "video",
        targetType: "canvas",
        targetId: "image-1",
        inputSnapshot: { prompt: "first video" },
        userId,
        now: new Date("2026-06-12T12:04:00.000Z"),
      });
      const secondArtifact = await appendCanvasNodeArtifact(db, {
        canvasProjectId: saved.canvasProjectId,
        nodeKey: "image-1",
        runId: secondRun.id,
        artifactKind: "video",
        url: "https://cdn.example.test/video-1.mp4",
        thumbnailUrl: "https://cdn.example.test/video-1-poster.png",
        selected: true,
        metadata: { prompt: "first video" },
        userId,
        now: new Date("2026-06-12T12:05:00.000Z"),
      });

      const historyAfterSecond = await listCanvasNodeRuns(db, {
        canvasProjectId: saved.canvasProjectId,
        nodeKey: "image-1",
      });
      await selectCanvasNodeArtifact(db, {
        canvasProjectId: saved.canvasProjectId,
        artifactId: firstArtifact.id,
        selectionRole: "current",
        userId,
        now: new Date("2026-06-12T12:06:00.000Z"),
      });
      const historyAfterSelect = await listCanvasNodeRuns(db, {
        canvasProjectId: saved.canvasProjectId,
        nodeKey: "image-1",
      });

      assert.equal(firstRun.runNo, 1);
      assert.equal(secondRun.runNo, 2);
      assert.equal(historyAfterSecond.runs.length, 2);
      assert.equal(historyAfterSecond.artifacts.length, 2);
      assert.equal(historyAfterSecond.artifacts.find((item) => item.id === secondArtifact.id)?.selected, true);
      assert.equal(historyAfterSecond.artifacts.find((item) => item.id === firstArtifact.id)?.selected, false);
      assert.equal(historyAfterSelect.artifacts.find((item) => item.id === firstArtifact.id)?.selected, true);
      assert.equal(historyAfterSelect.artifacts.find((item) => item.id === secondArtifact.id)?.selected, false);
      assert.deepEqual(
        historyAfterSelect.artifacts.map((item) => item.artifactKind).sort(),
        ["image", "video"],
      );
    } finally {
      await db.close();
    }
  });

  it("persists a failed generation task into the latest canvas node document", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedUser(db);
      const canvas = await createStandaloneCanvas(db, {
        userId,
        now: new Date("2026-06-12T13:00:00.000Z"),
      });
      const taskId = "40000000-0000-4000-8000-000000000701";
      await createWorkflowWithTasks(db, {
        userId,
        projectId: null,
        canvasProjectId: canvas.canvasProjectId,
        workflowType: "canvas_image_generation",
        inputSnapshot: {},
        tasks: [{
          id: taskId,
          taskType: "canvas_generate_image",
          queueName: "generation-submit-image",
          targetEntityType: "canvas",
          targetEntityId: canvas.canvasProjectId,
          inputSnapshot: {},
        }],
      });
      await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: canvas.canvasProjectId,
        userId,
        clientRevision: canvas.serverRevision,
        document: {
          ...canvas.document,
          nodes: [{
            ...canvasNode("image-1", "image", 80, 90, "image", "Image"),
            data: {
              ...canvasNode("image-1", "image", 80, 90, "image", "Image").data,
              status: "running",
              taskId,
              lastTaskId: taskId,
              generationProgress: 10,
              generationStage: "task_created",
            },
          }],
          edges: [],
        },
        now: new Date("2026-06-12T13:01:00.000Z"),
      });

      await attachCanvasTaskResultToHistory(db, {
        canvasProjectId: canvas.canvasProjectId,
        nodeKey: "image-1",
        taskId,
        mediaKind: "image",
        failure: {
          failureCode: "task_timeout",
          displayMessage: "生成任务超过平台等待时间，已按失败处理并返还积分。",
        },
        userId,
        now: new Date("2026-06-12T13:02:00.000Z"),
      });
      const failedHistory = await listCanvasNodeRuns(db, {
        canvasProjectId: canvas.canvasProjectId,
        nodeKey: "image-1",
      });

      const persisted = await db.query<{
        server_revision: number;
        node_status: string;
        node_data: Record<string, unknown>;
        document_json: { nodes: Array<{ id: string; data: Record<string, unknown> }> };
      }>(
        `
          SELECT projects.server_revision,
                 nodes.status AS node_status,
                 nodes.data_json AS node_data,
                 documents.document_json
          FROM creator_canvas_projects projects
          JOIN creator_canvas_nodes nodes
            ON nodes.canvas_project_id = projects.id
           AND nodes.node_key = 'image-1'
           AND nodes.deleted_at IS NULL
          JOIN creator_canvas_documents documents
            ON documents.id = projects.latest_document_id
          WHERE projects.id = $1
        `,
        [canvas.canvasProjectId],
      );
      const documentNode = persisted.rows[0]?.document_json.nodes.find((node) => node.id === "image-1");
      assert.ok(documentNode);

      assert.equal(persisted.rows[0]?.server_revision, 3);
      assert.equal(persisted.rows[0]?.node_status, "failed");
      assert.equal(persisted.rows[0]?.node_data.generationProgress, 100);
      assert.equal(documentNode?.data.status, "failed");
      assert.equal(documentNode?.data.generationStage, "failed");
      assert.equal(documentNode?.data.failureCode, "task_timeout");
      assert.equal(failedHistory.runs[0]?.status, "failed");
      assert.equal(failedHistory.runs[0]?.failure.failureCode, "task_timeout");
      assert.equal(failedHistory.runs[0]?.failure.displayMessage, "生成任务超过平台等待时间，已按失败处理并返还积分。");

      const canceledTaskId = "40000000-0000-4000-8000-000000000702";
      await createWorkflowWithTasks(db, {
        userId,
        projectId: null,
        canvasProjectId: canvas.canvasProjectId,
        workflowType: "canvas_image_generation",
        inputSnapshot: {},
        tasks: [{
          id: canceledTaskId,
          taskType: "canvas_generate_image",
          queueName: "generation-submit-image",
          targetEntityType: "canvas",
          targetEntityId: canvas.canvasProjectId,
          inputSnapshot: {},
        }],
      });
      await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: canvas.canvasProjectId,
        userId,
        clientRevision: 3,
        document: {
          ...persisted.rows[0].document_json,
          nodes: [{
            ...documentNode,
            data: {
              ...documentNode.data,
              status: "running",
              taskId: canceledTaskId,
              lastTaskId: canceledTaskId,
              generationProgress: 20,
              generationStage: "provider_submitted",
            },
          }],
        },
        now: new Date("2026-06-12T13:03:00.000Z"),
      });

      const canceledHistory = await attachCanvasTaskResultToHistory(db, {
        canvasProjectId: canvas.canvasProjectId,
        nodeKey: "image-1",
        taskId: canceledTaskId,
        mediaKind: "image",
        failure: {
          failureCode: "user_canceled",
          displayMessage: "生成任务已取消。",
        },
        userId,
        now: new Date("2026-06-12T13:04:00.000Z"),
      });
      const canceledState = await db.query<{
        run_status: string;
        artifact_count: number;
        document_json: { nodes: Array<{ id: string; data: Record<string, unknown> }> };
      }>(
        `
          SELECT runs.status AS run_status,
                 count(artifacts.id)::int AS artifact_count,
                 documents.document_json
          FROM creator_canvas_node_runs runs
          JOIN creator_canvas_projects projects ON projects.id = runs.canvas_project_id
          JOIN creator_canvas_documents documents ON documents.id = projects.latest_document_id
          LEFT JOIN creator_canvas_node_artifacts artifacts
            ON artifacts.run_id = runs.id
           AND artifacts.deleted_at IS NULL
          WHERE runs.id = $1
          GROUP BY runs.status, documents.document_json
        `,
        [canceledHistory?.runId],
      );
      const canceledNode = canceledState.rows[0]?.document_json.nodes.find((node) => node.id === "image-1");
      assert.equal(canceledState.rows[0]?.run_status, "canceled");
      assert.equal(canceledState.rows[0]?.artifact_count, 0);
      assert.equal(canceledNode?.data.status, "canceled");
      assert.equal(canceledNode?.data.generationStage, "canceled");
      assert.equal(canceledNode?.data.failureCode, "user_canceled");
    } finally {
      await db.close();
    }
  });
});

function canvasNode(id: string, type: string, x: number, y: number, mediaKind: string, title: string) {
  return {
    id,
    type,
    position: { x, y },
    size: { width: 360, height: 240 },
    data: {
      title,
      prompt: `${title} prompt`,
      mediaKind,
      ports: {
        inputs: [{ id: "in-text", kind: "text" }],
        outputs: [{ id: mediaKind === "video" ? "out-video" : mediaKind === "image" ? "out-image" : "out-text", kind: mediaKind }],
      },
    },
  };
}

async function seedUser(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ($1, '13800138701', 'active')
    `,
    [userId],
  );
}

async function createStandaloneCanvas(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: { userId: string; now: Date },
) {
  const canvasProjectId = randomUUID();
  const documentId = randomUUID();
  const revisionId = randomUUID();
  const nowIso = input.now.toISOString();
  const document = {
    version: 2,
    canvasProjectId,
    viewport: { x: 0, y: 0, zoom: 1, gridVisible: true, snapEnabled: true },
    nodes: [],
    edges: [],
    groups: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await db.query(
    `
      INSERT INTO creator_canvas_projects (
        id, title, status, server_revision,
        created_by_user_id, updated_by_user_id, created_at, updated_at
      )
      VALUES ($1, 'Independent Canvas', 'active', 1, $2, $2, $3, $3)
    `,
    [canvasProjectId, input.userId, input.now],
  );
  await db.query(
    `
      INSERT INTO creator_canvas_documents (
        id, canvas_project_id, schema_version, server_revision, document_json,
        viewport_json, node_count, edge_count, created_by_user_id, updated_by_user_id,
        created_at, updated_at
      )
      VALUES ($1, $2, 2, 1, $3::jsonb, $4::jsonb, 0, 0, $5, $5, $6, $6)
    `,
    [
      documentId,
      canvasProjectId,
      JSON.stringify(document),
      JSON.stringify(document.viewport),
      input.userId,
      input.now,
    ],
  );
  await db.query(
    `
      INSERT INTO creator_canvas_revisions (
        id, canvas_project_id, server_revision, operation, document_json,
        summary_json, created_by_user_id, created_at
      )
      VALUES ($1, $2, 1, 'create', $3::jsonb, $4::jsonb, $5, $6)
    `,
    [revisionId, canvasProjectId, JSON.stringify(document), JSON.stringify({ nodeCount: 0, edgeCount: 0, mediaCount: 0 }), input.userId, input.now],
  );
  await db.query(
    "UPDATE creator_canvas_projects SET latest_document_id = $2 WHERE id = $1",
    [canvasProjectId, documentId],
  );
  return { canvasProjectId, serverRevision: 1, document };
}
