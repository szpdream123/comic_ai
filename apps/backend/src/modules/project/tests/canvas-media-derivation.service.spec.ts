import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import type { CanvasActorScope } from "../../identity/canvas-actor-scope.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createScopedStorageObject, markStorageObjectAvailable } from "../../storage/storage.service.ts";
import {
  applyCanvasAnnotationSourceReplacement,
  completeCanvasCardSnapshot,
  completeCanvasMediaDerivation,
  createCanvasAnnotationLayer,
  createCanvasImageBatchGroup,
  failCanvasCardSnapshot,
  getCanvasImageBatchGroup,
  getLatestCanvasCardSnapshot,
  listCanvasAnnotationLayers,
  reconcileCanvasMediaDerivations,
  selectCanvasImageBatchArtifact,
  startCanvasCardSnapshot,
  startCanvasMediaDerivation,
} from "../canvas-media-derivation.service.ts";
import { appendCanvasNodeArtifact } from "../creator-canvas-record.service.ts";
import { createWorkflowWithTasks } from "../../workflow-task/workflow-task.service.ts";

describe("Canvas media derivation runtime", { concurrency: false }, () => {
  it("reconciles terminal generation tasks without requiring a connected client", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedCanvas(db);
    try {
      const workflow = await createWorkflowWithTasks(db, {
        userId: fixture.userId,
        projectId: null,
        canvasProjectId: fixture.canvasId,
        workflowType: "canvas_media_derivation",
        inputSnapshot: {},
        tasks: [{
          taskType: "episode_generate_image",
          queueName: "generation-submit-image",
          targetEntityType: "canvas",
          targetEntityId: fixture.canvasId,
          inputSnapshot: {},
        }],
      });
      const taskId = workflow.tasks[0]!.id;
      const outputStorage = await createScopedStorageObject(db, {
        userId: fixture.userId,
        canvasProjectId: fixture.canvasId,
        bucket: "test",
        objectName: "removed-background.png",
        contentType: "image/png",
        sizeBytes: 10,
        provider: "creator-dev",
        status: "pending_upload",
        metadata: { taskId },
        createdByUserId: fixture.userId,
        now: new Date("2026-07-30T00:00:00.000Z"),
      });
      await markStorageObjectAvailable(db, {
        storageObjectId: outputStorage.id,
        sizeBytes: 10,
        contentType: "image/png",
        now: new Date("2026-07-30T00:00:01.000Z"),
      });
      const derivation = await startCanvasMediaDerivation(db, {
        canvasProjectId: fixture.canvasId,
        nodeKey: "image-node",
        derivationType: "remove_background",
        baseCanvasRevision: 1,
        source: { assetId: null, assetVersionId: null, storageObjectId: null },
        taskId,
        actorScope: fixture.scope,
        now: new Date("2026-07-30T00:00:00.000Z"),
      });
      await db.query("UPDATE tasks SET status='succeeded' WHERE id=$1", [taskId]);
      const result = await reconcileCanvasMediaDerivations(db, {
        now: new Date("2026-07-30T00:01:00.000Z"),
        resolveArtifact: async (resolvedTaskId) => ({
          mediaType: "image",
          storageObjectId: resolvedTaskId === taskId ? outputStorage.id : "",
          sourceUrl: "https://cdn.test/removed-background.png",
        }),
      });
      assert.deepEqual(result.completedDerivationIds, [derivation.id]);
      const stored = await db.query<{ status: string }>(
        "SELECT status FROM creator_canvas_media_derivations WHERE id=$1",
        [derivation.id],
      );
      assert.equal(stored.rows[0]?.status, "succeeded");
    } finally {
      await db.close();
    }
  });

  it("attaches derivation output only when revision and source binding are unchanged", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedCanvas(db);
    try {
      const attached = await startCanvasMediaDerivation(db, {
        canvasProjectId: fixture.canvasId, nodeKey: "image-node", derivationType: "crop",
        baseCanvasRevision: 1, source: { assetId: null, assetVersionId: null, storageObjectId: null },
        actorScope: fixture.scope, now: new Date("2026-07-30T01:00:00.000Z"),
      });
      const attachedResult = await completeCanvasMediaDerivation(db, {
        derivationId: attached.id,
        artifact: { artifactKind: "image", url: "https://cdn.test/crop.png" },
        now: new Date("2026-07-30T01:01:00.000Z"),
      });
      assert.equal(attachedResult.status, "succeeded");
      assert.equal(attachedResult.attached, true);

      const detached = await startCanvasMediaDerivation(db, {
        canvasProjectId: fixture.canvasId, nodeKey: "image-node", derivationType: "outpaint",
        baseCanvasRevision: 1, source: { assetId: null, assetVersionId: null, storageObjectId: null },
        actorScope: fixture.scope, now: new Date("2026-07-30T01:02:00.000Z"),
      });
      const nextDocument = {
        version: 2,
        canvasProjectId: fixture.canvasId,
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [{ id: "image-node", type: "image", data: { sourceAssetVersionId: randomUUID() } }],
        edges: [],
      };
      await db.query(`
        INSERT INTO creator_canvas_documents
          (id,canvas_project_id,schema_version,server_revision,document_json,node_count,edge_count,created_by_user_id,updated_by_user_id)
        VALUES ($1,$2,2,2,$3::jsonb,1,0,$4,$4)
      `, [randomUUID(), fixture.canvasId, JSON.stringify(nextDocument), fixture.userId]);
      const latestDocument = await db.query<{ id: string }>(
        "SELECT id FROM creator_canvas_documents WHERE canvas_project_id=$1 AND server_revision=2",
        [fixture.canvasId],
      );
      await db.query(
        "UPDATE creator_canvas_projects SET server_revision=2, latest_document_id=$2 WHERE id=$1",
        [fixture.canvasId, latestDocument.rows[0]!.id],
      );
      const detachedResult = await completeCanvasMediaDerivation(db, {
        derivationId: detached.id,
        artifact: { artifactKind: "image", url: "https://cdn.test/outpaint.png" },
        now: new Date("2026-07-30T01:03:00.000Z"),
      });
      assert.equal(detachedResult.status, "detached");
      assert.equal(detachedResult.attached, false);
      const artifact = await db.query<{ selected: boolean; metadata_json: Record<string, unknown> }>(
        "SELECT selected, metadata_json FROM creator_canvas_node_artifacts WHERE id=$1",
        [detachedResult.artifactId],
      );
      assert.equal(artifact.rows[0]?.selected, false);
      assert.equal(artifact.rows[0]?.metadata_json.detached, true);
    } finally {
      await db.close();
    }
  });

  it("keeps image batch results independent and selects one without deleting siblings", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedCanvas(db);
    try {
      const first = await appendCanvasNodeArtifact(db, {
        canvasProjectId: fixture.canvasId, nodeKey: "image-node", artifactKind: "image", url: "https://cdn.test/1.png", userId: fixture.userId, now: new Date(),
      });
      const second = await appendCanvasNodeArtifact(db, {
        canvasProjectId: fixture.canvasId, nodeKey: "image-node", artifactKind: "image", url: "https://cdn.test/2.png", userId: fixture.userId, now: new Date(),
      });
      const group = await createCanvasImageBatchGroup(db, {
        canvasProjectId: fixture.canvasId, nodeKey: "image-node", artifacts: [
          { artifactId: first.id, parameters: { seed: 1 } },
          { artifactId: second.id, parameters: { seed: 2 } },
        ], actorScope: fixture.scope, now: new Date(),
      });
      await selectCanvasImageBatchArtifact(db, {
        groupId: group.id, artifactId: second.id, actorScope: fixture.scope, now: new Date(),
      });
      const listed = await getCanvasImageBatchGroup(db, group.id, fixture.canvasId);
      assert.equal(listed.selectedArtifactId, second.id);
      assert.equal(listed.items.length, 2);
      const artifacts = await db.query<{ id: string; deleted_at: Date | null }>(
        "SELECT id, deleted_at FROM creator_canvas_node_artifacts WHERE id = ANY($1::uuid[])",
        [[first.id, second.id]],
      );
      assert.equal(artifacts.rows.length, 2);
      assert.equal(artifacts.rows.every((row) => row.deleted_at === null), true);
    } finally {
      await db.close();
    }
  });

  it("assetizes annotations/masks, rejects inline data, and applies replacement policy", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedCanvas(db);
    try {
      const storage = await createScopedStorageObject(db, {
        userId: fixture.userId, canvasProjectId: fixture.canvasId, bucket: "test", objectName: "mask.png",
        contentType: "image/png", sizeBytes: 10, provider: "creator-dev", status: "pending_upload", metadata: {}, createdByUserId: fixture.userId, now: new Date(),
      });
      await markStorageObjectAvailable(db, { storageObjectId: storage.id, sizeBytes: 10, contentType: "image/png", now: new Date() });
      await assert.rejects(
        createCanvasAnnotationLayer(db, {
          canvasProjectId: fixture.canvasId, nodeKey: "image-node", layerKind: "mask", layerStorageObjectId: storage.id,
          metadata: { mask: "data:image/png;base64,AAAA" }, actorScope: fixture.scope, now: new Date(),
        }),
        (error: unknown) => (error as { code?: string }).code === "canvas_annotation_inline_data_forbidden",
      );
      const layer = await createCanvasAnnotationLayer(db, {
        canvasProjectId: fixture.canvasId, nodeKey: "image-node", layerKind: "vector_annotation", layerStorageObjectId: storage.id,
        projectionPolicy: "discard", metadata: { tool: "brush" }, actorScope: fixture.scope, now: new Date(),
      });
      const activeLayers = await listCanvasAnnotationLayers(db, {
        canvasProjectId: fixture.canvasId,
        nodeKey: "image-node",
        actorScope: fixture.scope,
      });
      assert.equal(activeLayers.length, 1);
      assert.equal(activeLayers[0]?.id, layer.id);
      assert.equal(activeLayers[0]?.layerStorageObjectId, storage.id);
      assert.deepEqual(activeLayers[0]?.metadata, { tool: "brush" });
      const replacement = await applyCanvasAnnotationSourceReplacement(db, {
        canvasProjectId: fixture.canvasId, nodeKey: "image-node", sourceAssetVersionId: randomUUID(), now: new Date(),
      });
      assert.equal(replacement.affected, 1);
      const status = await db.query<{ status: string }>("SELECT status FROM creator_canvas_annotation_layers WHERE id=$1", [layer.id]);
      assert.equal(status.rows[0]?.status, "discarded");
      assert.equal((await listCanvasAnnotationLayers(db, {
        canvasProjectId: fixture.canvasId,
        nodeKey: "image-node",
        actorScope: fixture.scope,
      })).length, 0);
      assert.equal((await listCanvasAnnotationLayers(db, {
        canvasProjectId: fixture.canvasId,
        nodeKey: "image-node",
        actorScope: fixture.scope,
        includeInactive: true,
      })).length, 1);
    } finally {
      await db.close();
    }
  });

  it("records card snapshots by revision and lets failed snapshots remain non-blocking", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedCanvas(db);
    try {
      const pending = await startCanvasCardSnapshot(db, { canvasProjectId: fixture.canvasId, canvasRevision: 1, userId: fixture.userId, now: new Date() });
      await failCanvasCardSnapshot(db, { snapshotId: pending.id, error: { code: "renderer_timeout" }, now: new Date() });
      assert.equal((await getLatestCanvasCardSnapshot(db, { canvasProjectId: fixture.canvasId }))?.status, "failed");
      const ready = await startCanvasCardSnapshot(db, { canvasProjectId: fixture.canvasId, canvasRevision: 2, userId: fixture.userId, now: new Date() });
      const storage = await createScopedStorageObject(db, {
        userId: fixture.userId, canvasProjectId: fixture.canvasId, bucket: "test", objectName: "card.webp",
        contentType: "image/webp", sizeBytes: 10, provider: "creator-dev", status: "pending_upload", metadata: {}, createdByUserId: fixture.userId, now: new Date(),
      });
      await markStorageObjectAvailable(db, { storageObjectId: storage.id, sizeBytes: 10, contentType: "image/webp", now: new Date() });
      await completeCanvasCardSnapshot(db, { snapshotId: ready.id, storageObjectId: storage.id, width: 320, height: 180, now: new Date() });
      const latest = await getLatestCanvasCardSnapshot(db, { canvasProjectId: fixture.canvasId, canvasRevision: 2 });
      assert.equal(latest?.status, "ready");
      assert.equal(latest?.canvasRevision, 2);
      assert.equal(latest?.storageObjectId, storage.id);
    } finally {
      await db.close();
    }
  });
});

async function seedCanvas(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  const userId = randomUUID();
  const canvasId = randomUUID();
  const documentId = randomUUID();
  await db.query("INSERT INTO users (id, status) VALUES ($1, 'active')", [userId]);
  await db.query(`
    INSERT INTO creator_canvas_projects (id,title,status,server_revision,latest_document_id,created_by_user_id,updated_by_user_id)
    VALUES ($1,'Media Canvas','active',1,NULL,$2,$2)
  `, [canvasId, userId]);
  await db.query(`
    INSERT INTO creator_canvas_documents
      (id,canvas_project_id,schema_version,server_revision,document_json,node_count,edge_count,created_by_user_id,updated_by_user_id)
    VALUES ($1,$2,2,1,$3::jsonb,1,0,$4,$4)
  `, [documentId, canvasId, JSON.stringify({ version: 2, canvasProjectId: canvasId, nodes: [{ id: "image-node", type: "image", data: {} }], edges: [] }), userId]);
  await db.query("UPDATE creator_canvas_projects SET latest_document_id=$2 WHERE id=$1", [canvasId, documentId]);
  const scope: CanvasActorScope = {
    canvasId, ownerUserId: userId, principal: "owner", actorTeamMemberId: null,
    principalKey: `owner:${userId}`,
    capabilities: [capabilities.canvasView, capabilities.canvasEdit, capabilities.canvasRun, capabilities.canvasManage],
  };
  await db.query(`
    INSERT INTO creator_canvas_nodes (id,canvas_project_id,node_key,node_type,title,status,media_kind,created_by_user_id,updated_by_user_id)
    VALUES ($1,$2,'image-node','image','Image','idle','image',$3,$3)
  `, [randomUUID(), canvasId, userId]);
  return { userId, canvasId, scope };
}
