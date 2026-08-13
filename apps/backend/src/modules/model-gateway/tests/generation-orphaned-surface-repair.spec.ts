import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { failOrphanedTeamAssetGenerations } from "../generation-orphaned-surface-repair.service.ts";

describe("generation orphaned surface repair", { concurrency: false }, () => {
  it("fails only stale generating team assets that have no task or submitted request", async () => {
    const db = await createMigratedTestDb();
    const userId = randomUUID();
    const staleAssetId = randomUUID();
    const recentAssetId = randomUUID();
    try {
      await db.query("INSERT INTO users (id,status) VALUES ($1,'active')", [userId]);
      await db.query(`
        INSERT INTO team_assets (
          id,admin_user_id,asset_name,asset_prompt,asset_category,asset_status,
          resource_type,created_by_name,updated_by_name,created_user_id,created_at,updated_at
        ) VALUES
          ($1,$3,'Stale','stale','character','generating','image','Owner','Owner',$3,$4,$4),
          ($2,$3,'Recent','recent','character','generating','image','Owner','Owner',$3,$5,$5)
      `, [staleAssetId, recentAssetId, userId, new Date("2026-07-30T08:00:00.000Z"), new Date("2026-07-30T08:20:00.000Z")]);

      const repaired = await failOrphanedTeamAssetGenerations(db, {
        staleBefore: new Date("2026-07-30T08:10:00.000Z"),
        now: new Date("2026-07-30T08:30:00.000Z"),
      });
      assert.deepEqual(repaired.failedAssetIds, [staleAssetId]);
      const assets = await db.query<{ id: string; asset_status: string }>(
        "SELECT id,asset_status FROM team_assets WHERE id=ANY($1::uuid[]) ORDER BY asset_name",
        [[staleAssetId, recentAssetId]],
      );
      assert.deepEqual(assets.rows.map((row) => row.asset_status), ["generating", "failed"]);
    } finally {
      await db.close();
    }
  });

  it("keeps every non-terminal provider request state from being marked orphaned", async () => {
    const db = await createMigratedTestDb();
    const userId = randomUUID();
    const statuses = ["created", "submitted", "accepted", "running", "succeeded", "result_unknown", "manual_review_required"];
    const assetIds = statuses.map(() => randomUUID());
    try {
      await db.query("INSERT INTO users (id,status) VALUES ($1,'active')", [userId]);
      for (let index = 0; index < statuses.length; index += 1) {
        const assetId = assetIds[index];
        await db.query(`
          INSERT INTO team_assets (
            id,admin_user_id,asset_name,asset_prompt,asset_category,asset_status,
            resource_type,created_by_name,updated_by_name,created_user_id,created_at,updated_at
          ) VALUES ($1,$2,$3,'prompt','character','generating','image','Owner','Owner',$2,$4,$4)
        `, [assetId, userId, `Asset-${index}`, new Date("2026-07-30T08:00:00.000Z")]);
        await db.query(`
          INSERT INTO provider_requests (
            id,provider_name,provider_operation,request_key,request_hash,payload_ref,payload_hash,
            status,created_by_user_id,created_at,updated_at
          ) VALUES ($1,'test','image.generate',$2,'hash',$3,'hash',$4,$5,$6,$6)
        `, [randomUUID(), `request-${index}`, `creator://team-assets/${assetId}`, statuses[index], userId, new Date("2026-07-30T08:00:00.000Z")]);
      }

      const repaired = await failOrphanedTeamAssetGenerations(db, {
        staleBefore: new Date("2026-07-30T08:10:00.000Z"),
        now: new Date("2026-07-30T08:30:00.000Z"),
      });
      assert.deepEqual(repaired.failedAssetIds, []);
      const assets = await db.query<{ asset_status: string }>(
        "SELECT asset_status FROM team_assets WHERE id=ANY($1::uuid[])",
        [assetIds],
      );
      assert.deepEqual(assets.rows.map((row) => row.asset_status), statuses.map(() => "generating"));
    } finally {
      await db.close();
    }
  });
});
