import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import type { CanvasActorScope } from "../../identity/canvas-actor-scope.service.ts";
import { appendCanvasNodeArtifact } from "../../project/creator-canvas-record.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { getCanvasStorageHealth } from "../canvas-storage-health.service.ts";

test("Canvas storage health reports scoped objects, orphans, fingerprint reuse, and thumbnails", async () => {
  const db = await createMigratedTestDb();
  const userId = randomUUID();
  const canvasId = randomUUID();
  const referencedObjectId = randomUUID();
  const fingerprintObjectId = randomUUID();
  const orphanObjectId = randomUUID();
  const failedObjectId = randomUUID();
  const now = new Date("2026-07-25T18:00:00.000Z");
  const scope: CanvasActorScope = {
    canvasId,
    ownerUserId: userId,
    principal: "owner",
    actorTeamMemberId: null,
    principalKey: `owner:${userId}`,
    capabilities: [capabilities.canvasView, capabilities.canvasEdit, capabilities.canvasRun, capabilities.canvasManage],
  };
  try {
    await db.query("INSERT INTO users (id,status) VALUES ($1,'active')", [userId]);
    await db.query(`
      INSERT INTO creator_canvas_projects (id,title,status,server_revision,created_by_user_id,updated_by_user_id)
      VALUES ($1,'Storage health','active',1,$2,$2)
    `, [canvasId, userId]);
    await db.query(`
      INSERT INTO creator_canvas_nodes (id,canvas_project_id,node_key,node_type,title,status,media_kind,created_by_user_id,updated_by_user_id)
      VALUES ($1,$2,'image-node','image','Image','idle','image',$3,$3)
    `, [randomUUID(), canvasId, userId]);
    for (const [id, status, size] of [
      [referencedObjectId, "available", 100],
      [fingerprintObjectId, "available", 200],
      [orphanObjectId, "available", 300],
      [failedObjectId, "failed", 400],
    ]) {
      await db.query(`
        INSERT INTO storage_objects
          (id,canvas_project_id,bucket,object_key,content_type,size_bytes,created_by_user_id,provider,status,created_at)
        VALUES ($1,$2,'test',$3,'image/png',$4,$5,'creator-dev',$6,$7)
      `, [id, canvasId, `${id}.png`, size, userId, status, now]);
    }
    await appendCanvasNodeArtifact(db, {
      canvasProjectId: canvasId,
      nodeKey: "image-node",
      artifactKind: "image",
      storageObjectId: referencedObjectId,
      userId,
      now,
    });
    await db.query(`
      INSERT INTO creator_canvas_upload_fingerprints
        (id,canvas_project_id,owner_user_id,fingerprint,content_type,size_bytes,storage_object_id,created_at,last_reused_at,reuse_count)
      VALUES ($1,$2,$3,$4,'image/png',200,$5,$6,$6,2)
    `, [randomUUID(), canvasId, userId, "a".repeat(64), fingerprintObjectId, now]);

    const health = await getCanvasStorageHealth(db, { canvasProjectId: canvasId, actorScope: scope });
    assert.equal(health.status, "degraded");
    assert.deepEqual(health.objects, {
      count: 4,
      totalBytes: 1000,
      availableCount: 3,
      failedCount: 1,
      pendingCount: 0,
    });
    assert.equal(health.orphaned.count, 1);
    assert.equal(health.orphaned.bytes, 300);
    assert.deepEqual(health.orphaned.sampleStorageObjectIds, [orphanObjectId]);
    assert.equal(health.fingerprints.avoidedUploadCount, 2);
    assert.equal(health.thumbnails.missingCount, 1);
  } finally {
    await db.close();
  }
});
