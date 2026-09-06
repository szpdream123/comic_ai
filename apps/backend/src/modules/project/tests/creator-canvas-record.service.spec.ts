import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import type { CanvasActorScope } from "../../identity/canvas-actor-scope.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createWorkflowWithTasks } from "../../workflow-task/workflow-task.service.ts";
import {
  isCanvasPlainTextTranscriptionRequest,
  runCanvasPlainTextTranscription,
} from "../canvas-audio-text-input.service.ts";
import {
  attachCanvasTaskResultToHistory,
  appendCanvasNodeArtifact,
  createCanvasNodeRun,
  findCanvasByCanvasProjectId,
  getCanvasRevision,
  listCanvasRevisions,
  listCanvasNodeRuns,
  normalizeCanvasDocument,
  saveCanvasByCanvasProjectId,
  selectCanvasNodeArtifact,
} from "../creator-canvas-record.service.ts";

const userId = "00000000-0000-4000-8000-000000000701";

describe("creator canvas record service", { concurrency: false }, () => {
  it("preserves protocol edge kinds while normalizing historical documents", () => {
    const document = normalizeCanvasDocument({
      nodes: [{ id: "a", type: "ai-text" }, { id: "b", type: "ai-image" }],
      edges: [{
        id: "reference-1",
        kind: "reference",
        sourceNodeId: "a",
        sourcePortId: "out",
        targetNodeId: "b",
        targetPortId: "in",
      }],
    }, { canvasProjectId: "canvas-1", now: "2026-07-25T00:00:00.000Z" });
    assert.equal(document.edges[0]?.kind, "reference");
  });

  it("accepts React Flow edge fields from the standalone canvas runtime", () => {
    const document = normalizeCanvasDocument({
      runtime: "ai-canvas",
      nodes: [{ id: "a", type: "ai-text", data: { label: "文本" } }, { id: "b", type: "ai-image" }],
      edges: [{ id: "edge-1", source: "a", target: "b", sourceHandle: "out_text", targetHandle: "in_asset" }],
    }, { canvasProjectId: "canvas-1", now: "2026-07-25T00:00:00.000Z" });
    assert.equal(document.runtime, "ai-canvas");
    assert.equal(document.edges[0]?.sourceNodeId, "a");
    assert.equal(document.edges[0]?.targetPortId, "in_asset");
    assert.equal(document.edges[0]?.source, "a");
  });

  it("uses a team-member scope for document access and records the actual actor", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUser(db);
      const memberId = "00000000-0000-4000-8000-000000000799";
      await db.query(
        `
          INSERT INTO team_members (
            id, user_id, member_account, member_account_suffix, member_login_account,
            member_name, member_password_hash, member_credits, status
          )
          VALUES ($1, $2, 'canvas-editor', 'u00799', 'canvas-editor@u00799', 'Canvas Editor', 'hash', 0, 'active')
        `,
        [memberId, userId],
      );
      const canvas = await createStandaloneCanvas(db, {
        userId,
        now: new Date("2026-06-12T08:00:00.000Z"),
      });
      const actorScope: CanvasActorScope = {
        canvasId: canvas.canvasProjectId,
        ownerUserId: userId,
        principal: "team_member",
        actorTeamMemberId: memberId,
        principalKey: `member:${memberId}`,
        capabilities: [capabilities.canvasView, capabilities.canvasEdit, capabilities.canvasRun],
      };

      const saved = await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: canvas.canvasProjectId,
        actorScope,
        clientRevision: canvas.serverRevision,
        document: {
          ...canvas.document,
          viewport: { ...canvas.document.viewport, x: 42 },
        },
        events: [{ type: "canvas.viewport.updated" }],
        now: new Date("2026-06-12T08:01:00.000Z"),
      });
      const loaded = await findCanvasByCanvasProjectId(db, {
        canvasProjectId: canvas.canvasProjectId,
        actorScope,
      });
      const actors = await db.query<{
        revision_actor: string | null;
        event_actor: string | null;
      }>(
        `
          SELECT
            (SELECT actor_team_member_id::text FROM creator_canvas_revisions
             WHERE canvas_project_id = $1 AND server_revision = $2) AS revision_actor,
            (SELECT actor_team_member_id::text FROM creator_canvas_events
             WHERE canvas_project_id = $1 AND server_revision = $2 LIMIT 1) AS event_actor
        `,
        [canvas.canvasProjectId, saved.serverRevision],
      );

      assert.equal(loaded?.serverRevision, saved.serverRevision);
      assert.deepEqual(actors.rows[0], { revision_actor: memberId, event_actor: memberId });
    } finally {
      await db.close();
    }
  });

  it("reuses cached canvas payloads while applying current relational positions", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUser(db);
      const canvas = await createStandaloneCanvas(db, {
        userId,
        now: new Date("2026-06-12T08:10:00.000Z"),
      });
      const saved = await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: canvas.canvasProjectId,
        userId,
        clientRevision: canvas.serverRevision,
        document: {
          ...canvas.document,
          nodes: [canvasNode("node-1", "image", 10, 20, "image", "Image")],
        },
        now: new Date("2026-06-12T08:11:00.000Z"),
      });
      let documentReads = 0;
      let positionReads = 0;
      const countingDb = {
        async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
          if (sql.includes("FROM creator_canvas_documents")) documentReads += 1;
          if (sql.includes("FROM creator_canvas_nodes")) positionReads += 1;
          return db.query<T>(sql, params);
        },
      };

      const first = await findCanvasByCanvasProjectId(countingDb, {
        canvasProjectId: canvas.canvasProjectId,
        userId,
      });
      assert.equal(first?.document.nodes[0]?.position?.x, 10);
      first!.document.viewport.x = 999;
      await db.query(
        "UPDATE creator_canvas_nodes SET position_x = 90, position_y = 120 WHERE canvas_project_id = $1 AND node_key = 'node-1'",
        [canvas.canvasProjectId],
      );

      const second = await findCanvasByCanvasProjectId(countingDb, {
        canvasProjectId: canvas.canvasProjectId,
        userId,
      });
      assert.equal(second?.serverRevision, saved.serverRevision);
      assert.equal(second?.document.viewport.x, 0);
      assert.deepEqual(second?.document.nodes[0]?.position, { x: 90, y: 120 });
      assert.equal(documentReads, 1);
      assert.equal(positionReads, 2);
    } finally {
      await db.close();
    }
  });

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
      const imageRun = await createCanvasNodeRun(db, {
        canvasProjectId: canvas.canvasProjectId,
        nodeKey: "image-1",
        idempotencyKey: "removed-image-run",
        status: "succeeded",
        mediaKind: "image",
        userId,
        now: new Date("2026-06-12T11:01:10.000Z"),
      });
      await appendCanvasNodeArtifact(db, {
        canvasProjectId: canvas.canvasProjectId,
        nodeKey: "image-1",
        runId: imageRun.id,
        artifactKind: "image",
        url: "https://cdn.example.test/removed-image.png",
        selected: true,
        userId,
        now: new Date("2026-06-12T11:01:20.000Z"),
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
        active_runs: number;
        deleted_runs: number;
        active_artifacts: number;
        deleted_artifacts: number;
        revision_count: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM creator_canvas_nodes WHERE canvas_project_id = $1 AND deleted_at IS NULL) AS active_nodes,
            (SELECT count(*)::int FROM creator_canvas_nodes WHERE canvas_project_id = $1 AND deleted_at IS NOT NULL) AS deleted_nodes,
            (SELECT count(*)::int FROM creator_canvas_edges WHERE canvas_project_id = $1 AND deleted_at IS NULL) AS active_edges,
            (SELECT count(*)::int FROM creator_canvas_edges WHERE canvas_project_id = $1 AND deleted_at IS NOT NULL) AS deleted_edges,
            (SELECT count(*)::int FROM creator_canvas_node_runs WHERE canvas_project_id = $1 AND deleted_at IS NULL) AS active_runs,
            (SELECT count(*)::int FROM creator_canvas_node_runs WHERE canvas_project_id = $1 AND deleted_at IS NOT NULL) AS deleted_runs,
            (SELECT count(*)::int FROM creator_canvas_node_artifacts WHERE canvas_project_id = $1 AND deleted_at IS NULL) AS active_artifacts,
            (SELECT count(*)::int FROM creator_canvas_node_artifacts WHERE canvas_project_id = $1 AND deleted_at IS NOT NULL) AS deleted_artifacts,
            (SELECT count(*)::int FROM creator_canvas_revisions WHERE canvas_project_id = $1) AS revision_count
        `,
        [canvas.canvasProjectId],
      );

      assert.deepEqual(rows.rows[0], {
        active_nodes: 1,
        deleted_nodes: 1,
        active_edges: 0,
        deleted_edges: 1,
        active_runs: 0,
        deleted_runs: 1,
        active_artifacts: 0,
        deleted_artifacts: 1,
        revision_count: 3,
      });
    } finally {
      await db.close();
    }
  });

  it("cleans active history left on deleted nodes while preserving style-reference history", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedUser(db);
      const canvas = await createStandaloneCanvas(db, {
        userId,
        now: new Date("2026-06-12T11:05:00.000Z"),
      });
      const styleReferenceBase = canvasNode("style-reference-1", "text", 420, 20, "text", "Style Reference");
      const saved = await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: canvas.canvasProjectId,
        userId,
        clientRevision: canvas.serverRevision,
        document: {
          ...canvas.document,
          nodes: [
            canvasNode("removed-1", "image", 10, 20, "image", "Removed"),
            {
              ...styleReferenceBase,
              data: { ...styleReferenceBase.data, source: "style-reference" },
            },
          ],
          edges: [],
        },
        now: new Date("2026-06-12T11:06:00.000Z"),
      });
      const removedRun = await createCanvasNodeRun(db, {
        canvasProjectId: canvas.canvasProjectId,
        nodeKey: "removed-1",
        idempotencyKey: "orphaned-run",
        status: "succeeded",
        mediaKind: "image",
        userId,
        now: new Date("2026-06-12T11:06:10.000Z"),
      });
      const styleReferenceRun = await createCanvasNodeRun(db, {
        canvasProjectId: canvas.canvasProjectId,
        nodeKey: "style-reference-1",
        idempotencyKey: "style-reference-run",
        status: "succeeded",
        mediaKind: "text",
        userId,
        now: new Date("2026-06-12T11:06:20.000Z"),
      });
      await appendCanvasNodeArtifact(db, {
        canvasProjectId: canvas.canvasProjectId,
        nodeKey: "removed-1",
        runId: removedRun.id,
        artifactKind: "image",
        url: "https://cdn.example.test/orphaned.png",
        userId,
        now: new Date("2026-06-12T11:06:30.000Z"),
      });
      await appendCanvasNodeArtifact(db, {
        canvasProjectId: canvas.canvasProjectId,
        nodeKey: "style-reference-1",
        runId: styleReferenceRun.id,
        artifactKind: "text",
        userId,
        now: new Date("2026-06-12T11:06:40.000Z"),
      });
      await db.query(
        `UPDATE creator_canvas_nodes SET deleted_at = $2 WHERE canvas_project_id = $1 AND node_key = 'removed-1'`,
        [canvas.canvasProjectId, new Date("2026-06-12T11:07:00.000Z")],
      );

      await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: canvas.canvasProjectId,
        userId,
        clientRevision: saved.serverRevision,
        document: {
          ...saved.document,
          viewport: { ...saved.document.viewport, x: 1 },
          nodes: [],
          edges: [],
        },
        now: new Date("2026-06-12T11:08:00.000Z"),
      });

      const rows = await db.query<{
        active_nodes: number;
        deleted_nodes: number;
        active_runs: number;
        deleted_runs: number;
        active_artifacts: number;
        deleted_artifacts: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM creator_canvas_nodes WHERE canvas_project_id = $1 AND deleted_at IS NULL) AS active_nodes,
            (SELECT count(*)::int FROM creator_canvas_nodes WHERE canvas_project_id = $1 AND deleted_at IS NOT NULL) AS deleted_nodes,
            (SELECT count(*)::int FROM creator_canvas_node_runs WHERE canvas_project_id = $1 AND deleted_at IS NULL) AS active_runs,
            (SELECT count(*)::int FROM creator_canvas_node_runs WHERE canvas_project_id = $1 AND deleted_at IS NOT NULL) AS deleted_runs,
            (SELECT count(*)::int FROM creator_canvas_node_artifacts WHERE canvas_project_id = $1 AND deleted_at IS NULL) AS active_artifacts,
            (SELECT count(*)::int FROM creator_canvas_node_artifacts WHERE canvas_project_id = $1 AND deleted_at IS NOT NULL) AS deleted_artifacts
        `,
        [canvas.canvasProjectId],
      );

      assert.deepEqual(rows.rows[0], {
        active_nodes: 1,
        deleted_nodes: 1,
        active_runs: 1,
        deleted_runs: 1,
        active_artifacts: 1,
        deleted_artifacts: 1,
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

  it("retries a canvas save after a transient PostgreSQL transaction failure", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUser(db);
      const canvas = await createStandaloneCanvas(db, {
        userId,
        now: new Date("2026-06-12T11:15:00.000Z"),
      });
      let injected = false;
      const retryingDb = {
        async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
          if (!injected && sql.includes("UPDATE creator_canvas_projects")) {
            injected = true;
            throw Object.assign(new Error("deadlock detected"), { code: "40P01" });
          }
          return db.query<T>(sql, params);
        },
      };

      const saved = await saveCanvasByCanvasProjectId(retryingDb, {
        canvasProjectId: canvas.canvasProjectId,
        userId,
        clientRevision: canvas.serverRevision,
        document: {
          ...canvas.document,
          viewport: { ...canvas.document.viewport, x: 12 },
        },
        now: new Date("2026-06-12T11:16:00.000Z"),
      });

      assert.equal(injected, true);
      assert.equal(saved.serverRevision, canvas.serverRevision + 1);
      const persisted = await findCanvasByCanvasProjectId(db, {
        canvasProjectId: canvas.canvasProjectId,
        userId,
      });
      assert.equal(persisted?.serverRevision, saved.serverRevision);
      assert.equal(persisted?.document.viewport.x, 12);
    } finally {
      await db.close();
    }
  });

  it("allows reconnecting an endpoint after its previous edge was removed", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUser(db);
      const canvas = await createStandaloneCanvas(db, {
        userId,
        now: new Date("2026-06-12T11:17:00.000Z"),
      });
      const nodes = [
        canvasNode("source", "script", 0, 0, "text", "Source"),
        canvasNode("target", "image", 420, 0, "image", "Target"),
      ];
      const first = await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: canvas.canvasProjectId,
        userId,
        clientRevision: canvas.serverRevision,
        document: {
          ...canvas.document,
          nodes,
          edges: [{
            id: "edge-first",
            kind: "execution",
            sourceNodeId: "source",
            sourcePortId: "out-text",
            targetNodeId: "target",
            targetPortId: "in-text",
          }],
        },
        now: new Date("2026-06-12T11:18:00.000Z"),
      });
      const removed = await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: canvas.canvasProjectId,
        userId,
        clientRevision: first.serverRevision,
        document: { ...first.document, edges: [] },
        now: new Date("2026-06-12T11:19:00.000Z"),
      });

      const reconnected = await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: canvas.canvasProjectId,
        userId,
        clientRevision: removed.serverRevision,
        document: {
          ...removed.document,
          edges: [{
            id: "edge-second",
            kind: "execution",
            sourceNodeId: "source",
            sourcePortId: "out-text",
            targetNodeId: "target",
            targetPortId: "in-text",
          }],
        },
        now: new Date("2026-06-12T11:20:00.000Z"),
      });

      assert.equal(reconnected.document.edges[0]?.id, "edge-second");
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

  it("creates a source-text node after a successful Canvas audio transcription", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUser(db);
      const canvas = await createStandaloneCanvas(db, {
        userId,
        now: new Date("2026-06-12T12:10:00.000Z"),
      });
      const saved = await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: canvas.canvasProjectId,
        userId,
        clientRevision: canvas.serverRevision,
        document: {
          ...canvas.document,
          nodes: [canvasNode("audio-1", "audio", 80, 90, "audio", "音频")],
          edges: [],
        },
        now: new Date("2026-06-12T12:11:00.000Z"),
      });
      const taskId = randomUUID();
      await createWorkflowWithTasks(db, {
        userId,
        projectId: null,
        canvasProjectId: saved.canvasProjectId,
        workflowType: "canvas_audio_generation",
        inputSnapshot: { targetType: "canvas", targetId: "audio-1" },
        tasks: [{
          id: taskId,
          taskType: "episode_generate_audio",
          queueName: "generation-submit-audio",
          targetEntityType: "canvas",
          targetEntityId: saved.canvasProjectId,
          inputSnapshot: { targetType: "canvas", targetId: "audio-1" },
        }],
      });
      const result = await attachCanvasTaskResultToHistory(db, {
        canvasProjectId: saved.canvasProjectId,
        nodeKey: "audio-1",
        taskId,
        mediaKind: "audio",
        result: {
          mediaKind: "audio",
          sourceUrl: "https://cdn.example.test/transcript-audio.mp3",
          transcript: "第一句。第二句。",
          audioGenerationMode: "transcription",
        },
        userId,
        now: new Date("2026-06-12T12:12:00.000Z"),
      });
      assert.ok(result?.artifactId);
      const current = await findCanvasByCanvasProjectId(db, { canvasProjectId: saved.canvasProjectId, userId });
      const transcriptNode = current?.document.nodes.find((node) => node.type === "source-text");
      assert.equal(transcriptNode?.data?.text, "第一句。第二句。");
      assert.equal(transcriptNode?.data?.sourceAudioNodeId, "audio-1");
      assert.equal(transcriptNode?.data?.transcriptionTaskId, taskId);
    } finally {
      await db.close();
    }
  });

  it("writes successful Canvas image task results back to the active node", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUser(db);
      const canvas = await createStandaloneCanvas(db, {
        userId,
        now: new Date("2026-06-12T12:14:00.000Z"),
      });
      const saved = await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: canvas.canvasProjectId,
        userId,
        clientRevision: canvas.serverRevision,
        document: {
          ...canvas.document,
          nodes: [{
            ...canvasNode("image-1", "ai-image", 80, 90, "image", "图片"),
            data: {
              ...canvasNode("image-1", "ai-image", 80, 90, "image", "图片").data,
              status: "queued",
              taskId: "90000000-0000-4000-8000-000000000101",
              lastTaskId: "90000000-0000-4000-8000-000000000101",
            },
          }],
          edges: [],
        },
        now: new Date("2026-06-12T12:15:00.000Z"),
      });
      await createCanvasNodeRun(db, {
        canvasProjectId: saved.canvasProjectId,
        nodeKey: "image-1",
        idempotencyKey: "image-result-run",
        status: "queued",
        mediaKind: "image",
        taskId: "90000000-0000-4000-8000-000000000101",
        targetType: "canvas",
        targetId: "image-1",
        userId,
        now: new Date("2026-06-12T12:15:30.000Z"),
      });

      await attachCanvasTaskResultToHistory(db, {
        canvasProjectId: saved.canvasProjectId,
        nodeKey: "image-1",
        taskId: "90000000-0000-4000-8000-000000000101",
        mediaKind: "image",
        result: {
          mediaKind: "image",
          previewUrl: "https://cdn.example.test/canvas-node-result.png",
          storageObjectId: "80000000-0000-4000-8000-000000000101",
        },
        userId,
        now: new Date("2026-06-12T12:16:00.000Z"),
      });

      const current = await findCanvasByCanvasProjectId(db, { canvasProjectId: saved.canvasProjectId, userId });
      const node = current?.document.nodes.find((item) => item.id === "image-1");
      assert.equal(node?.data?.status, "completed");
      assert.equal(node?.data?.previewUrl, "https://cdn.example.test/canvas-node-result.png");
      assert.equal(node?.data?.imageUrl, "https://cdn.example.test/canvas-node-result.png");
      assert.equal(node?.data?.storageObjectId, "80000000-0000-4000-8000-000000000101");
    } finally {
      await db.close();
    }
  });

  it("converts plain text into a linked source-text run without provider, task, or billing records", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUser(db);
      const canvas = await createStandaloneCanvas(db, {
        userId,
        now: new Date("2026-06-12T12:20:00.000Z"),
      });
      const sourceNode = {
        ...canvasNode("text-1", "source-text", 80, 90, "text", "原始文本"),
        data: {
          ...canvasNode("text-1", "source-text", 80, 90, "text", "原始文本").data,
          text: "第一句。\n第二句。",
          ports: { inputs: [], outputs: [{ id: "out-text", kind: "text" }] },
        },
      };
      const audioNode = {
        ...canvasNode("audio-1", "ai-audio", 520, 90, "audio", "音频转录"),
        data: {
          ...canvasNode("audio-1", "ai-audio", 520, 90, "audio", "音频转录").data,
          prompt: "",
          audioGenerationMode: "transcription",
          ports: { inputs: [{ id: "in-text", kind: "text" }], outputs: [{ id: "out-audio", kind: "audio" }] },
        },
      };
      const saved = await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: canvas.canvasProjectId,
        userId,
        clientRevision: canvas.serverRevision,
        document: {
          ...canvas.document,
          nodes: [sourceNode, audioNode],
          edges: [{
            id: "text-to-transcription",
            sourceNodeId: "text-1",
            sourcePortId: "out-text",
            targetNodeId: "audio-1",
            targetPortId: "in-text",
            data: { kind: "text" },
          }],
        },
        now: new Date("2026-06-12T12:21:00.000Z"),
      });
      const actorScope: CanvasActorScope = {
        canvasId: saved.canvasProjectId,
        ownerUserId: userId,
        principal: "owner",
        actorTeamMemberId: null,
        principalKey: `owner:${userId}`,
        capabilities: [capabilities.canvasView, capabilities.canvasEdit, capabilities.canvasRun, capabilities.canvasManage],
      };
      const body = {
        kind: "audio",
        mode: "transcription",
        transcriptionInputKind: "text",
        textInput: "",
        parameters: { mode: "transcription", transcriptionInputKind: "text" },
        canvasContext: {
          upstreamTextFragments: [{ nodeId: "text-1", text: "第一句。\n第二句。" }],
        },
      };
      assert.equal(isCanvasPlainTextTranscriptionRequest(saved, "audio-1", body), true);

      const result = await runCanvasPlainTextTranscription(db, {
        canvas: saved,
        nodeKey: "audio-1",
        idempotencyKey: "plain-text-transcription-1",
        body,
        actorScope,
        userId,
        now: new Date("2026-06-12T12:22:00.000Z"),
      });
      const replayed = await runCanvasPlainTextTranscription(db, {
        canvas: result.canvas,
        nodeKey: "audio-1",
        idempotencyKey: "plain-text-transcription-1",
        body,
        actorScope,
        userId,
        now: new Date("2026-06-12T12:23:00.000Z"),
      });
      const current = await findCanvasByCanvasProjectId(db, { canvasProjectId: saved.canvasProjectId, userId });
      const transcriptNodes = current?.document.nodes.filter((node) => node.data?.transcriptionRunId === result.runId) ?? [];
      const sideEffects = await db.query<{
        task_count: number;
        provider_count: number;
        reservation_count: number;
        artifact_count: number;
        artifact_urls: number;
      }>(`
        SELECT
          (SELECT count(*)::int FROM tasks) AS task_count,
          (SELECT count(*)::int FROM provider_requests) AS provider_count,
          (SELECT count(*)::int FROM credit_reservations) AS reservation_count,
          (SELECT count(*)::int FROM creator_canvas_node_artifacts WHERE run_id=$1) AS artifact_count,
          (SELECT count(*)::int FROM creator_canvas_node_artifacts WHERE run_id=$1 AND (url IS NOT NULL OR thumbnail_url IS NOT NULL)) AS artifact_urls
      `, [result.runId]);

      assert.equal(result.status, "succeeded");
      assert.equal(result.taskId, null);
      assert.equal(result.localConversion, true);
      assert.equal(result.creditCost, 0);
      assert.equal(replayed.replayed, true);
      assert.equal(replayed.runId, result.runId);
      assert.equal(replayed.artifact.id, result.artifact.id);
      assert.equal(replayed.canvas.serverRevision, result.canvas.serverRevision);
      assert.equal(transcriptNodes.length, 1);
      assert.equal(transcriptNodes[0]?.data?.text, "第一句。\n第二句。");
      assert.deepEqual(transcriptNodes[0]?.data?.sourceTextNodeIds, ["text-1"]);
      assert.equal(transcriptNodes[0]?.data?.sourceArtifactId, result.artifact.id);
      assert.deepEqual(sideEffects.rows[0], {
        task_count: 0,
        provider_count: 0,
        reservation_count: 0,
        artifact_count: 1,
        artifact_urls: 0,
      });
    } finally {
      await db.close();
    }
  });

  it("synchronizes music lyrics to the audio node with stable task and artifact ids", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUser(db);
      const canvas = await createStandaloneCanvas(db, {
        userId,
        now: new Date("2026-06-12T12:30:00.000Z"),
      });
      const saved = await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: canvas.canvasProjectId,
        userId,
        clientRevision: canvas.serverRevision,
        document: {
          ...canvas.document,
          nodes: [{
            ...canvasNode("audio-music", "ai-audio", 80, 90, "audio", "音乐生成"),
            data: {
              ...canvasNode("audio-music", "ai-audio", 80, 90, "audio", "音乐生成").data,
              audioGenerationMode: "music",
              lyricsMode: "generate",
            },
          }],
          edges: [],
        },
        now: new Date("2026-06-12T12:31:00.000Z"),
      });
      const taskId = randomUUID();
      await createWorkflowWithTasks(db, {
        userId,
        projectId: null,
        canvasProjectId: saved.canvasProjectId,
        workflowType: "canvas_audio_generation",
        inputSnapshot: { targetType: "canvas", targetId: "audio-music" },
        tasks: [{
          id: taskId,
          taskType: "episode_generate_audio",
          queueName: "generation-submit-audio",
          targetEntityType: "canvas",
          targetEntityId: saved.canvasProjectId,
          inputSnapshot: { targetType: "canvas", targetId: "audio-music" },
        }],
      });
      const attached = await attachCanvasTaskResultToHistory(db, {
        canvasProjectId: saved.canvasProjectId,
        nodeKey: "audio-music",
        taskId,
        mediaKind: "audio",
        result: {
          mediaKind: "audio",
          sourceUrl: "https://cdn.example.test/music.mp3",
          audioGenerationMode: "music",
          lyricsMode: "generate",
          lyrics: "沿着微光回家",
        },
        userId,
        now: new Date("2026-06-12T12:32:00.000Z"),
      });
      const current = await findCanvasByCanvasProjectId(db, { canvasProjectId: saved.canvasProjectId, userId });
      const musicNode = current?.document.nodes.find((node) => node.id === "audio-music");

      assert.equal(musicNode?.data?.lyrics, "沿着微光回家");
      assert.equal(musicNode?.data?.lyricsMode, "generate");
      assert.equal(musicNode?.data?.lyricsTaskId, taskId);
      assert.equal(musicNode?.data?.lyricsArtifactId, attached?.artifactId);
      assert.equal("url" in (musicNode?.data ?? {}), false);
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
