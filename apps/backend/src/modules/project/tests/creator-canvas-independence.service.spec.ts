import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  findCanvasByCanvasProjectId,
  saveCanvasByCanvasProjectId,
} from "../creator-canvas-record.service.ts";

describe("creator canvas independence", () => {
  it("authorizes by canvas owner and never persists a project id", async () => {
    const db = await createMigratedTestDb();
    const ownerUserId = randomUUID();
    const otherUserId = randomUUID();
    const canvasProjectId = randomUUID();
    const documentId = randomUUID();
    const now = new Date("2026-07-22T10:00:00.000Z");

    try {
      await db.query(
        "INSERT INTO users (id, status) VALUES ($1, 'active'), ($2, 'active')",
        [ownerUserId, otherUserId],
      );
      await db.query(
        `
          INSERT INTO creator_canvas_projects (
            id, title, status, server_revision, created_by_user_id, updated_by_user_id,
            created_at, updated_at
          )
          VALUES ($1, '独立画布', 'active', 1, $2, $2, $3, $3)
        `,
        [canvasProjectId, ownerUserId, now],
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
          JSON.stringify({
            version: 2,
            canvasProjectId,
            viewport: { x: 0, y: 0, zoom: 1 },
            nodes: [],
            edges: [],
            groups: [],
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          }),
          JSON.stringify({ x: 0, y: 0, zoom: 1 }),
          ownerUserId,
          now,
        ],
      );
      await db.query(
        "UPDATE creator_canvas_projects SET latest_document_id = $2 WHERE id = $1",
        [canvasProjectId, documentId],
      );

      const owned = await findCanvasByCanvasProjectId(db, { canvasProjectId, userId: ownerUserId });
      const hidden = await findCanvasByCanvasProjectId(db, { canvasProjectId, userId: otherUserId });
      assert.ok(owned);
      assert.equal(hidden, null);
      assert.equal(Object.hasOwn(owned.document, "projectId"), false);

      const saved = await saveCanvasByCanvasProjectId(db, {
        canvasProjectId,
        userId: ownerUserId,
        clientRevision: owned.serverRevision,
        document: { ...owned.document, projectId: randomUUID() },
        now: new Date("2026-07-22T10:01:00.000Z"),
      });
      const stored = await db.query<{ document_json: Record<string, unknown> }>(
        "SELECT document_json FROM creator_canvas_documents WHERE canvas_project_id = $1",
        [canvasProjectId],
      );

      assert.equal(Object.hasOwn(saved, "projectId"), false);
      assert.equal(Object.hasOwn(saved.document, "projectId"), false);
      assert.equal(Object.hasOwn(stored.rows[0]?.document_json ?? {}, "projectId"), false);
    } finally {
      await db.close();
    }
  });
});
