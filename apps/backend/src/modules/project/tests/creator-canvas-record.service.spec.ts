import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  appendCanvasNodeArtifact,
  createCanvasNodeRun,
  getOrCreateProjectCanvas,
  listCanvasNodeRuns,
  saveProjectCanvas,
  selectCanvasNodeArtifact,
} from "../creator-canvas-record.service.ts";

const organizationId = "10000000-0000-4000-8000-000000000701";
const workspaceId = "20000000-0000-4000-8000-000000000701";
const userId = "00000000-0000-4000-8000-000000000701";
const projectId = "30000000-0000-4000-8000-000000000701";

describe("creator canvas record service", { concurrency: false }, () => {
  it("keeps one active canvas per business project and persists the full graph", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedProject(db);
      const first = await getOrCreateProjectCanvas(db, {
        organizationId,
        workspaceId,
        projectId,
        userId,
        now: new Date("2026-06-12T10:00:00.000Z"),
      });
      const second = await getOrCreateProjectCanvas(db, {
        organizationId,
        workspaceId,
        projectId,
        userId,
        now: new Date("2026-06-12T10:01:00.000Z"),
      });

      const saved = await saveProjectCanvas(db, {
        organizationId,
        workspaceId,
        projectId,
        userId,
        clientRevision: first.serverRevision,
        document: {
          ...first.document,
          viewport: { x: 32, y: -16, zoom: 0.8, gridVisible: true, snapEnabled: false },
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
              data: { kind: "text" },
            },
          ],
        },
        events: [{ type: "node.added", targetType: "node", targetKey: "image-1" }],
        now: new Date("2026-06-12T10:02:00.000Z"),
      });

      const rows = await db.query<{
        canvas_count: number;
        document_count: number;
        revision_count: number;
        event_count: number;
        node_count: number;
        edge_count: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM creator_canvas_projects WHERE project_id = $1 AND deleted_at IS NULL) AS canvas_count,
            (SELECT count(*)::int FROM creator_canvas_documents WHERE canvas_project_id = $2) AS document_count,
            (SELECT count(*)::int FROM creator_canvas_revisions WHERE canvas_project_id = $2) AS revision_count,
            (SELECT count(*)::int FROM creator_canvas_events WHERE canvas_project_id = $2) AS event_count,
            (SELECT count(*)::int FROM creator_canvas_nodes WHERE canvas_project_id = $2 AND deleted_at IS NULL) AS node_count,
            (SELECT count(*)::int FROM creator_canvas_edges WHERE canvas_project_id = $2 AND deleted_at IS NULL) AS edge_count
        `,
        [projectId, first.canvasProjectId],
      );
      const imageNode = await db.query<{
        position_x: string;
        position_y: string;
        title: string;
        media_kind: string;
        data_json: { prompt?: string };
      }>(
        `
          SELECT position_x, position_y, title, media_kind, data_json
          FROM creator_canvas_nodes
          WHERE canvas_project_id = $1 AND node_key = 'image-1'
        `,
        [first.canvasProjectId],
      );

      assert.equal(second.canvasProjectId, first.canvasProjectId);
      assert.equal(saved.serverRevision, 2);
      assert.deepEqual(rows.rows[0], {
        canvas_count: 1,
        document_count: 2,
        revision_count: 2,
        event_count: 1,
        node_count: 2,
        edge_count: 1,
      });
      assert.equal(imageNode.rows[0]?.position_x, "420");
      assert.equal(imageNode.rows[0]?.position_y, "20");
      assert.equal(imageNode.rows[0]?.title, "Image");
      assert.equal(imageNode.rows[0]?.media_kind, "image");
      assert.equal(imageNode.rows[0]?.data_json.prompt, "Image prompt");
    } finally {
      await db.close();
    }
  });

  it("soft-deletes removed nodes and edges while keeping revision history", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedProject(db);
      const canvas = await getOrCreateProjectCanvas(db, {
        organizationId,
        workspaceId,
        projectId,
        userId,
        now: new Date("2026-06-12T11:00:00.000Z"),
      });
      const withGraph = await saveProjectCanvas(db, {
        organizationId,
        workspaceId,
        projectId,
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

      await saveProjectCanvas(db, {
        organizationId,
        workspaceId,
        projectId,
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

  it("records generated image and video artifacts as selectable node history", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedProject(db);
      const canvas = await getOrCreateProjectCanvas(db, {
        organizationId,
        workspaceId,
        projectId,
        userId,
        now: new Date("2026-06-12T12:00:00.000Z"),
      });
      const saved = await saveProjectCanvas(db, {
        organizationId,
        workspaceId,
        projectId,
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
        organizationId,
        workspaceId,
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
        organizationId,
        workspaceId,
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
        organizationId,
        workspaceId,
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
        organizationId,
        workspaceId,
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
        organizationId,
        canvasProjectId: saved.canvasProjectId,
        nodeKey: "image-1",
      });
      await selectCanvasNodeArtifact(db, {
        organizationId,
        canvasProjectId: saved.canvasProjectId,
        artifactId: firstArtifact.id,
        selectionRole: "current",
        userId,
        now: new Date("2026-06-12T12:06:00.000Z"),
      });
      const historyAfterSelect = await listCanvasNodeRuns(db, {
        organizationId,
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

async function seedProject(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ($1, '+86138001701', 'active')
    `,
    [userId],
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ($1, 'Canvas Org', 'active')
    `,
    [organizationId],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, 'Canvas Workspace', 'active')
    `,
    [workspaceId, organizationId],
  );
  await db.query(
    `
      INSERT INTO projects (
        id,
        organization_id,
        workspace_id,
        name,
        aspect_ratio,
        resolution,
        phase,
        created_by_user_id
      )
      VALUES ($1, $2, $3, 'Canvas Project', '9:16', '1080p', 'shot_generation', $4)
    `,
    [projectId, organizationId, workspaceId, userId],
  );
}
