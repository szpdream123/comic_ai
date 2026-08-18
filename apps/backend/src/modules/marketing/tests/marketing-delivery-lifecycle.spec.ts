import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { createMarketingService } from "../application/marketing.service.ts";
import type { SqlDatabase, SqlQueryResult } from "../../shared/db/sql.ts";
import type { StorageAdapter } from "../../storage/storage.service.ts";

describe("marketing delivery asset lifecycle", () => {
  it("copies a source object into the job delivery prefix before scheduling", async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const copied: Array<Parameters<NonNullable<StorageAdapter["copyObject"]>>[0]> = [];
    const sourceId = randomUUID();
    const contentVariantId = randomUUID();
    const campaignId = randomUUID();
    const adminId = randomUUID();
    const ownerUserId = randomUUID();
    const checksum = createHash("sha256").update("delivery-source").digest("hex");
    const db: SqlDatabase = {
      async query<T>(sql: string, params: unknown[] = []): Promise<SqlQueryResult<T>> {
        queries.push({ sql, params });
        if (sql.includes("FROM storage_objects WHERE id = $1")) {
          return rows<T>({
            id: sourceId,
            bucket: "creator-assets",
            object_key: "projects/original/source video.mp4",
            content_type: "video/mp4",
            size_bytes: 1234,
            checksum,
            status: "available",
            deleted_at: null,
          });
        }
        if (sql.includes("FROM marketing_content_variants AS variant")) {
          return rows<T>({
            campaign_id: campaignId, status: "approved", platform: "douyin", owner_user_id: ownerUserId,
            asset_manifest_json: [{ type: "video", storageObjectId: sourceId, authorizationStatus: "owned" }],
          });
        }
        if (sql.includes("INSERT INTO marketing_publish_jobs")) return rows<T>({ id: params[0] });
        if (sql.includes("SELECT status FROM marketing_publish_jobs") && sql.includes("FOR UPDATE")) {
          return rows<T>({ status: "preparing_assets" });
        }
        if (sql.includes("count(*)::int AS count FROM marketing_delivery_assets")) return rows<T>({ count: 0 });
        return { rows: [] };
      },
    };
    const storageAdapter: StorageAdapter = {
      async createSignedReadUrl(input) {
        return { url: "https://cos.example.test/signed", expiresAt: input.expiresAt };
      },
      async copyObject(input) {
        copied.push(input);
        return { eTag: "delivery-copy" };
      },
      async deleteObject() {
        assert.fail("creating a delivery copy must not delete the source object");
      },
    };
    const service = createMarketingService({ db, storageAdapter });

    const job = await service.createPublishJob({
      campaignId,
      contentVariantId,
      platform: "douyin",
      executorAccountRef: "douyin-account-1",
      idempotencyKey: randomUUID(),
      scheduledAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      assets: [{ type: "video", storageObjectId: sourceId }],
    }, adminId);

    assert.equal(copied.length, 1);
    assert.deepEqual(copied[0], {
      sourceBucket: "creator-assets",
      sourceObjectKey: "projects/original/source video.mp4",
      destinationBucket: "creator-assets",
      destinationObjectKey: copied[0]!.destinationObjectKey,
    });
    assert.match(copied[0]!.destinationObjectKey, new RegExp(`^marketing-delivery/${job.id}/[0-9a-f-]+-source-video\\.mp4$`));
    const assetInsert = queries.find((query) => query.sql.includes("INSERT INTO marketing_delivery_assets"));
    assert.equal(assetInsert?.params[2], contentVariantId);
    assert.equal(assetInsert?.params[3], ownerUserId);
    assert.equal(assetInsert?.params[5], sourceId);
    assert.equal(assetInsert?.params[6], "creator-assets");
    assert.equal(assetInsert?.params[7], copied[0]!.destinationObjectKey);
    assert.equal(assetInsert?.params[14], "copying");
    assert.equal(assetInsert?.params[15], adminId);
    assert.ok(assetInsert?.params[13] instanceof Date);
    assert.ok(queries.some((query) => query.sql.includes("status = 'scheduled'") && query.params[0] === job.id));
  });

  it("signs only the delivery copy for at most four hours", async () => {
    const now = new Date("2026-08-15T04:00:00.000Z");
    const jobId = randomUUID();
    const assetId = randomUUID();
    const signedRequests: Array<Parameters<StorageAdapter["createSignedReadUrl"]>[0]> = [];
    const db: SqlDatabase = {
      async query<T>(sql: string): Promise<SqlQueryResult<T>> {
        if (sql.includes("FROM marketing_executors") && sql.includes("worker_id = $1")) {
          return rows<T>({
            id: randomUUID(),
            capabilities_json: {
              platforms: [{ platform: "douyin", accountRefs: ["account-1"] }],
              platformCapabilities: [{ platform: "douyin", supportsVideo: true, supportsImagePost: false }],
            },
          });
        }
        if (sql.includes("WITH expired AS")) return { rows: [] };
        if (sql.includes("WITH candidate AS")) {
          return rows<T>({
            id: jobId,
            campaign_id: randomUUID(),
            content_variant_id: randomUUID(),
            platform: "douyin",
            executor_account_ref: "account-1",
            idempotency_key: randomUUID(),
            scheduled_at: now,
            not_before: new Date(now.getTime() - 60_000),
            execute_deadline: new Date(now.getTime() + 8 * 60 * 60_000),
            delivery_id: randomUUID(),
            attempt_id: randomUUID(),
            lease_until: new Date(now.getTime() + 5 * 60_000),
            title: "title",
            body_json: {},
            content_type: "video",
          });
        }
        if (sql.includes("FROM marketing_delivery_assets AS asset")) {
          return rows<T>({
            id: assetId,
            asset_type: "video",
            storage_object_id: randomUUID(),
            delivery_url: null,
            sha256: "a".repeat(64),
            content_type: "video/mp4",
            size_bytes: 1234,
            expires_at: new Date(now.getTime() + 8 * 60 * 60_000),
            bucket: "creator-assets",
            object_key: `marketing-delivery/${jobId}/${assetId}-video.mp4`,
            storage_status: "available",
            deleted_at: null,
          });
        }
        return { rows: [] };
      },
    };
    const storageAdapter: StorageAdapter = {
      async createSignedReadUrl(input) {
        signedRequests.push(input);
        return { url: "https://cos.example.test/signed-delivery", expiresAt: input.expiresAt };
      },
    };
    const service = createMarketingService({ db, storageAdapter });

    const claimed = await service.claimNext("worker-1", now);

    assert.ok(claimed);
    assert.equal(signedRequests[0]?.objectKey, `marketing-delivery/${jobId}/${assetId}-video.mp4`);
    assert.equal(signedRequests[0]?.expiresAt.getTime(), now.getTime() + 4 * 60 * 60_000);
    assert.equal(claimed.assets[0]?.expiresAt, new Date(now.getTime() + 4 * 60 * 60_000).toISOString());
  });

  it("does not schedule a job when the delivery copy fails", async () => {
    const sourceId = randomUUID();
    const contentVariantId = randomUUID();
    const campaignId = randomUUID();
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const db: SqlDatabase = {
      async query<T>(sql: string, params: unknown[] = []): Promise<SqlQueryResult<T>> {
        queries.push({ sql, params });
        if (sql.includes("FROM storage_objects WHERE id = $1")) {
          return rows<T>({
            id: sourceId,
            bucket: "creator-assets",
            object_key: "source.mp4",
            content_type: "video/mp4",
            size_bytes: 1,
            checksum: "b".repeat(64),
            status: "available",
            deleted_at: null,
          });
        }
        if (sql.includes("FROM marketing_content_variants AS variant")) {
          return rows<T>({
            campaign_id: campaignId, status: "approved", platform: "douyin", owner_user_id: randomUUID(),
            asset_manifest_json: [{ type: "video", storageObjectId: sourceId, authorizationStatus: "owned" }],
          });
        }
        if (sql.includes("INSERT INTO marketing_publish_jobs")) return rows<T>({ id: params[0] });
        return { rows: [] };
      },
    };
    const service = createMarketingService({
      db,
      storageAdapter: {
        async createSignedReadUrl(input) {
          return { url: "https://cos.example.test/signed", expiresAt: input.expiresAt };
        },
        async copyObject() {
          throw new Error("copy failed");
        },
      },
    });

    await assert.rejects(
      service.createPublishJob({
        campaignId,
        contentVariantId,
        platform: "douyin",
        executorAccountRef: "account-1",
        idempotencyKey: randomUUID(),
        scheduledAt: new Date(Date.now() + 60_000).toISOString(),
        assets: [{ type: "video", storageObjectId: sourceId }],
      }, randomUUID()),
      (error: unknown) => error instanceof Error && "code" in error && error.code === "marketing_delivery_copy_failed",
    );

    assert.ok(queries.some((query) => query.sql.includes("delivery_state = 'copy_failed'")));
    assert.ok(queries.some((query) => query.sql.includes("status = 'failed'") && query.sql.includes("preparing_assets")));
    assert.equal(queries.some((query) => query.sql.includes("status = 'scheduled'")), false);
  });

  it("expires overdue attention and claims terminal delivery assets with a concurrent-safe lock", async () => {
    const now = new Date("2026-08-15T12:00:00.000Z");
    const asset = {
      id: randomUUID(),
      publish_job_id: randomUUID(),
      delivery_bucket: "creator-assets",
      delivery_object_key: `marketing-delivery/${randomUUID()}/video.mp4`,
      delete_attempts: 1,
      campaign_id: randomUUID(),
      content_variant_id: randomUUID(),
    };
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const db: SqlDatabase = {
      async query<T>(sql: string, params: unknown[] = []): Promise<SqlQueryResult<T>> {
        queries.push({ sql, params });
        if (sql.includes("candidates AS (")) return rows<T>(asset);
        return { rows: [] };
      },
    };
    let deleteCalls = 0;
    const storageAdapter: StorageAdapter = {
      async createSignedReadUrl(input) {
        return { url: "https://cos.example.test/signed", expiresAt: input.expiresAt };
      },
      async deleteObject(input) {
        deleteCalls += 1;
        assert.deepEqual(input, { bucket: asset.delivery_bucket, objectKey: asset.delivery_object_key });
        if (deleteCalls === 1) throw new Error("simulated delete failure");
      },
    };
    const service = createMarketingService({ db, storageAdapter });

    assert.deepEqual(await service.cleanupExpiredDeliveryAssets(now), { claimed: 1, deleted: 0, failed: 1 });
    assert.deepEqual(await service.cleanupExpiredDeliveryAssets(now), { claimed: 1, deleted: 1, failed: 0 });

    const claimSql = queries.find((query) => query.sql.includes("candidates AS ("))?.sql ?? "";
    assert.match(claimSql, /job\.status IN \('succeeded', 'failed', 'needs_attention', 'canceled', 'result_unknown', 'stale'\)/);
    assert.match(claimSql, /attention\.status = 'open'/);
    assert.match(claimSql, /delivery_asset_retention_expired/);
    assert.match(claimSql, /FOR UPDATE OF asset SKIP LOCKED/);
    assert.ok(queries.some((query) => query.sql.includes("delivery_state = 'delete_failed'")));
    assert.ok(queries.some((query) => query.sql.includes("delivery_state = 'deleted'")));
    assert.ok(queries.some((query) => query.params.includes("delivery_asset.delete_failed")));
    assert.ok(queries.some((query) => query.params.includes("delivery_asset.deleted")));
  });
});

function rows<T>(...values: unknown[]): SqlQueryResult<T> {
  return { rows: values as T[] };
}
