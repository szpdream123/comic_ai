import assert from "node:assert/strict";
import { it } from "node:test";

import { createAuthSession } from "../../identity/session.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { findStorageObject, type StorageAdapter } from "../../storage/storage.service.ts";
import {
  completeUploadSession,
  createUploadSession,
  runStorageRepairJob,
  type UploadSessionRuntime,
} from "../../storage/upload-session.service.ts";
import { createBrandKit, createBrandKitAsset } from "../brand-kit.service.ts";

it("keeps storage objects referenced by brand kit assets out of dangling cleanup", async () => {
  const db = await createMigratedTestDb();
  const localObjectStore = new LocalObjectStoreStub();
  const runtime = createRuntime(localObjectStore);
  const userId = "00000000-0000-4000-8000-000000000991";
  try {
    await db.query("INSERT INTO users (id, phone_e164, status) VALUES ($1, '13800138991', 'active')", [userId]);
    const session = await createAuthSession({
      userId,
      token: "brand-storage-owner-token",
      now: new Date("2026-07-20T01:00:00.000Z"),
    });
    await db.query(
      `
        INSERT INTO auth_sessions
          (id, user_id, status, session_token_hash, expires_at, last_seen_at, revoked_at, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        session.session.id,
        session.session.userId,
        session.session.status,
        session.session.sessionTokenHash,
        session.session.expiresAt,
        session.session.lastSeenAt,
        session.session.revokedAt,
        new Date("2026-07-20T01:00:00.000Z"),
      ],
    );
    const prepared = await createUploadSession(db, {
      actor: { userId, capabilities: [] },
      sessionToken: "brand-storage-owner-token",
      purpose: "new-canvas/brand-logo",
      fileName: "brand.png",
      contentType: "image/png",
      sizeBytes: 128,
      idempotencyKey: "brand-storage-retention",
      now: new Date("2026-07-20T01:01:00.000Z"),
      runtime,
    });
    localObjectStore.put(prepared.objectKey, { contentType: "image/png", contentLength: 128 });
    await completeUploadSession(db, {
      actor: { userId, capabilities: [] },
      sessionToken: "brand-storage-owner-token",
      uploadSessionId: prepared.uploadSessionId,
      now: new Date("2026-07-20T01:02:00.000Z"),
      runtime,
      signedUrlExpiresInSeconds: 900,
    });
    const kit = await createBrandKit(db, { adminUserId: userId, name: "Storage kit" });
    await createBrandKitAsset(db, {
      adminUserId: userId,
      kitId: kit.id,
      assetType: "logo",
      displayName: "Logo",
      storageObjectId: prepared.storageObjectId,
    });

    const report = await runStorageRepairJob(db, {
      now: new Date("2026-07-20T02:00:00.000Z"),
      runtime,
    });
    const object = await findStorageObject(db, prepared.storageObjectId);

    assert.deepEqual(report.danglingObjectIds, []);
    assert.equal(object?.status, "available");
    assert.equal(localObjectStore.has(prepared.objectKey), true);
  } finally {
    await db.close();
  }
});

class SignedUrlOnlyAdapter implements StorageAdapter {
  async createSignedReadUrl(input: { bucket: string; objectKey: string; expiresAt: Date }) {
    return { url: `signed://${input.bucket}/${input.objectKey}`, expiresAt: input.expiresAt };
  }
}

class LocalObjectStoreStub {
  #objects = new Map<string, { contentType?: string | null; contentLength?: number | null }>();

  put(objectKey: string, value: { contentType?: string | null; contentLength?: number | null }) {
    this.#objects.set(objectKey, value);
  }

  has(objectKey: string) {
    return this.#objects.has(objectKey);
  }

  async headObject(input: { bucket: string; objectKey: string }) {
    const object = this.#objects.get(input.objectKey);
    return object
      ? { exists: true, contentType: object.contentType, contentLength: object.contentLength }
      : { exists: false };
  }

  async deleteObject(input: { bucket: string; objectKey: string }) {
    this.#objects.delete(input.objectKey);
  }
}

function createRuntime(localObjectStore: LocalObjectStoreStub): UploadSessionRuntime {
  return {
    mode: "dev",
    provider: "dev",
    bucket: "creator-dev",
    region: "ap-shanghai",
    adapter: new SignedUrlOnlyAdapter(),
    stsDurationSeconds: 900,
    localUploadUrlPath: "/api/storage/upload-sessions",
    localObjectStore,
  };
}
