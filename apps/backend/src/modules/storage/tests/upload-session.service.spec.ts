import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthSession } from "../../identity/session.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { findStorageObject, type StorageAdapter } from "../storage.service.ts";
import {
  abortUploadSession,
  completeUploadSession,
  createUploadSession,
  findUploadSession,
  runStorageRepairJob,
  type UploadSessionRuntime,
} from "../upload-session.service.ts";

describe("upload session service", () => {
  it("replays prepare requests by idempotency key", async () => {
    const db = await createMigratedTestDb();
    const localObjectStore = new LocalObjectStoreStub();

    try {
      await seedUploadTenants(db);
      const runtime = createRuntime(localObjectStore);
      const actor = createActor("00000000-0000-4000-8000-000000000001");

      const first = await createUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        projectId: "40000000-0000-4000-8000-000000000001",
        purpose: "storyboard-videos",
        fileName: "shot-01.mp4",
        contentType: "video/mp4",
        sizeBytes: 2048,
        checksum: "checksum-1",
        multipart: true,
        idempotencyKey: "upload:storyboard-videos:shot-01.mp4",
        now: new Date("2026-05-27T02:00:00.000Z"),
        runtime,
      });
      const replay = await createUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        projectId: "40000000-0000-4000-8000-000000000001",
        purpose: "storyboard-videos",
        fileName: "shot-01.mp4",
        contentType: "video/mp4",
        sizeBytes: 2048,
        checksum: "checksum-1",
        multipart: true,
        idempotencyKey: "upload:storyboard-videos:shot-01.mp4",
        now: new Date("2026-05-27T02:01:00.000Z"),
        runtime,
      });

      assert.equal(replay.uploadSessionId, first.uploadSessionId);
      assert.equal(replay.storageObjectId, first.storageObjectId);
      assert.equal(
        first.objectKey,
        `AIManhuaDrama/20260527/${first.storageObjectId}-shot-01.mp4`,
      );
      assert.equal(
        replay.upload?.url,
        `/api/storage/upload-sessions/${encodeURIComponent(first.uploadSessionId)}/blob`,
      );
    } finally {
      await db.close();
    }
  });

  it("completes a local upload and marks the object available", async () => {
    const db = await createMigratedTestDb();
    const localObjectStore = new LocalObjectStoreStub();

    try {
      await seedUploadTenants(db);
      const runtime = createRuntime(localObjectStore);
      const actor = createActor("00000000-0000-4000-8000-000000000001");
      const prepared = await createUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        projectId: "40000000-0000-4000-8000-000000000001",
        purpose: "storyboard-images",
        fileName: "shot-01.png",
        contentType: "image/png",
        sizeBytes: 1024,
        checksum: "checksum-2",
        multipart: false,
        idempotencyKey: "upload:storyboard-images:shot-01.png",
        now: new Date("2026-05-27T02:10:00.000Z"),
        runtime,
      });
      localObjectStore.put(prepared.objectKey, {
        contentType: "image/png",
        contentLength: 1024,
        checksum: "checksum-2",
        eTag: "etag-2",
      });

      const completed = await completeUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        uploadSessionId: prepared.uploadSessionId,
        eTag: "etag-2",
        now: new Date("2026-05-27T02:11:00.000Z"),
        runtime,
        signedUrlExpiresInSeconds: 900,
      });

      const storedObject = await findStorageObject(db, prepared.storageObjectId);
      const storedSession = await findUploadSession(db, prepared.uploadSessionId);

      assert.equal(completed.storageObject.status, "available");
      assert.equal(completed.storageObject.etag, "etag-2");
      assert.equal(
        prepared.objectKey,
        `AIManhuaDrama/20260527/${prepared.storageObjectId}-shot-01.png`,
      );
      assert.equal(completed.urls.sourceUrl, `signed://creator-dev/${prepared.objectKey}`);
      assert.equal(storedObject?.status, "available");
      assert.equal(storedSession?.status, "uploaded");
    } finally {
      await db.close();
    }
  });

  it("aborts an upload and tombstones the object", async () => {
    const db = await createMigratedTestDb();
    const localObjectStore = new LocalObjectStoreStub();

    try {
      await seedUploadTenants(db);
      const runtime = createRuntime(localObjectStore);
      const actor = createActor("00000000-0000-4000-8000-000000000001");
      const prepared = await createUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        projectId: "40000000-0000-4000-8000-000000000001",
        purpose: "asset-import/character",
        fileName: "hero.png",
        contentType: "image/png",
        sizeBytes: 512,
        checksum: null,
        multipart: false,
        idempotencyKey: "upload:asset-import/character:hero.png",
        now: new Date("2026-05-27T02:20:00.000Z"),
        runtime,
      });
      localObjectStore.put(prepared.objectKey, {
        contentType: "image/png",
        contentLength: 512,
      });

      const aborted = await abortUploadSession(db, {
        actor,
        uploadSessionId: prepared.uploadSessionId,
        now: new Date("2026-05-27T02:21:00.000Z"),
        runtime,
      });

      const storedObject = await findStorageObject(db, prepared.storageObjectId);

      assert.equal(aborted.status, "aborted");
      assert.equal(storedObject?.status, "deleted");
      assert.equal(localObjectStore.has(prepared.objectKey), false);
    } finally {
      await db.close();
    }
  });

  it("rejects another user trying to complete someone else's upload session", async () => {
    const db = await createMigratedTestDb();
    const localObjectStore = new LocalObjectStoreStub();

    try {
      await seedUploadTenants(db);
      const runtime = createRuntime(localObjectStore);
      const prepared = await createUploadSession(db, {
        actor: createActor("00000000-0000-4000-8000-000000000001"),
        sessionToken: "owner-token",
        projectId: "40000000-0000-4000-8000-000000000001",
        purpose: "storyboard-images",
        fileName: "private.png",
        contentType: "image/png",
        sizeBytes: 256,
        checksum: null,
        multipart: false,
        idempotencyKey: "upload:storyboard-images:private.png",
        now: new Date("2026-05-27T02:30:00.000Z"),
        runtime,
      });

      await assert.rejects(
        completeUploadSession(db, {
          actor: createActor("00000000-0000-4000-8000-000000000002"),
          sessionToken: "teammate-token",
          uploadSessionId: prepared.uploadSessionId,
          now: new Date("2026-05-27T02:31:00.000Z"),
          runtime,
          signedUrlExpiresInSeconds: 900,
        }),
        /upload_session_not_found/,
      );
    } finally {
      await db.close();
    }
  });

  it("repairs expired, dangling, and delete-failed storage records", async () => {
    const db = await createMigratedTestDb();
    const localObjectStore = new LocalObjectStoreStub();

    try {
      await seedUploadTenants(db);
      const runtime = createRuntime(localObjectStore);
      const actor = createActor("00000000-0000-4000-8000-000000000001");

      const stale = await createUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        projectId: "40000000-0000-4000-8000-000000000001",
        purpose: "storyboard-images",
        fileName: "stale.png",
        contentType: "image/png",
        sizeBytes: 64,
        checksum: null,
        multipart: false,
        idempotencyKey: "upload:storyboard-images:stale.png",
        now: new Date("2026-05-27T01:00:00.000Z"),
        runtime,
      });

      const dangling = await createUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        projectId: "40000000-0000-4000-8000-000000000001",
        purpose: "storyboard-images",
        fileName: "dangling.png",
        contentType: "image/png",
        sizeBytes: 128,
        checksum: null,
        multipart: false,
        idempotencyKey: "upload:storyboard-images:dangling.png",
        now: new Date("2026-05-27T01:05:00.000Z"),
        runtime,
      });
      localObjectStore.put(dangling.objectKey, {
        contentType: "image/png",
        contentLength: 128,
      });
      await completeUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        uploadSessionId: dangling.uploadSessionId,
        now: new Date("2026-05-27T01:06:00.000Z"),
        runtime,
        signedUrlExpiresInSeconds: 900,
      });

      const retryDelete = await createUploadSession(db, {
        actor,
        sessionToken: "owner-token",
        projectId: "40000000-0000-4000-8000-000000000001",
        purpose: "storyboard-images",
        fileName: "delete-failed.png",
        contentType: "image/png",
        sizeBytes: 256,
        checksum: null,
        multipart: false,
        idempotencyKey: "upload:storyboard-images:delete-failed.png",
        now: new Date("2026-05-27T01:10:00.000Z"),
        runtime,
      });
      localObjectStore.put(retryDelete.objectKey, {
        contentType: "image/png",
        contentLength: 256,
      });
      await db.query(
        `
          UPDATE storage_objects
          SET status = 'delete_failed'
          WHERE id = $1
        `,
        [retryDelete.storageObjectId],
      );

      const report = await runStorageRepairJob(db, {
        now: new Date("2026-05-27T02:00:00.000Z"),
        runtime,
      });

      const staleSession = await findUploadSession(db, stale.uploadSessionId);
      const staleObject = await findStorageObject(db, stale.storageObjectId);
      const danglingSession = await findUploadSession(db, dangling.uploadSessionId);
      const danglingObject = await findStorageObject(db, dangling.storageObjectId);
      const retriedObject = await findStorageObject(db, retryDelete.storageObjectId);

      assert.deepEqual(
        [...report.expiredSessionIds].sort(),
        [stale.uploadSessionId, retryDelete.uploadSessionId].sort(),
      );
      assert.deepEqual(report.failedPendingObjectIds, [stale.storageObjectId]);
      assert.deepEqual(report.danglingObjectIds, [dangling.storageObjectId]);
      assert.deepEqual(report.retriedDeleteObjectIds, [retryDelete.storageObjectId]);
      assert.equal(staleSession?.status, "expired");
      assert.equal(staleObject?.status, "failed");
      assert.equal(danglingSession?.status, "failed");
      assert.equal(danglingObject?.status, "deleted");
      assert.equal(localObjectStore.has(dangling.objectKey), false);
      assert.equal(retriedObject?.status, "deleted");
      assert.equal(localObjectStore.has(retryDelete.objectKey), false);
    } finally {
      await db.close();
    }
  });
});

class SignedUrlOnlyAdapter implements StorageAdapter {
  async createSignedReadUrl(input: {
    bucket: string;
    objectKey: string;
    expiresAt: Date;
  }) {
    return {
      url: `signed://${input.bucket}/${input.objectKey}`,
      expiresAt: input.expiresAt,
    };
  }
}

class LocalObjectStoreStub {
  #objects = new Map<
    string,
    {
      contentType?: string | null;
      contentLength?: number | null;
      checksum?: string | null;
      eTag?: string | null;
      versionId?: string | null;
    }
  >();

  put(
    objectKey: string,
    value: {
      contentType?: string | null;
      contentLength?: number | null;
      checksum?: string | null;
      eTag?: string | null;
      versionId?: string | null;
    },
  ) {
    this.#objects.set(objectKey, value);
  }

  has(objectKey: string) {
    return this.#objects.has(objectKey);
  }

  async headObject(input: { bucket: string; objectKey: string }) {
    const object = this.#objects.get(input.objectKey);
    if (!object) {
      return { exists: false };
    }
    return {
      exists: true,
      contentType: object.contentType ?? null,
      contentLength: object.contentLength ?? null,
      checksum: object.checksum ?? null,
      eTag: object.eTag ?? null,
      versionId: object.versionId ?? null,
    };
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

function createActor(actorId: string) {
  return {
    actorId,
    organizationId: "10000000-0000-4000-8000-000000000001",
    workspaceId: "20000000-0000-4000-8000-000000000001",
    role: "owner_admin" as const,
    capabilities: [],
  };
}

async function seedUploadTenants(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES
        ('00000000-0000-4000-8000-000000000001', '+8613800138000', 'active'),
        ('00000000-0000-4000-8000-000000000002', '+8613800138001', 'active')
    `,
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ('10000000-0000-4000-8000-000000000001', 'Org One', 'active')
    `,
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES (
        '20000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        'Workspace One',
        'active'
      )
    `,
  );
  await db.query(
    `
      INSERT INTO memberships (
        id,
        organization_id,
        workspace_id,
        user_id,
        role,
        status
      )
      VALUES
        (
          '30000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001',
          '20000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000001',
          'owner_admin',
          'active'
        ),
        (
          '30000000-0000-4000-8000-000000000002',
          '10000000-0000-4000-8000-000000000001',
          '20000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000002',
          'creator',
          'active'
        )
    `,
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
      VALUES (
        '40000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        'Upload Project',
        '9:16',
        '1080p',
        'script_input',
        '00000000-0000-4000-8000-000000000001'
      )
    `,
  );

  await insertSession(db, {
    userId: "00000000-0000-4000-8000-000000000001",
    token: "owner-token",
  });
  await insertSession(db, {
    userId: "00000000-0000-4000-8000-000000000002",
    token: "teammate-token",
  });
}

async function insertSession(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: { userId: string; token: string },
) {
  const created = await createAuthSession({
    userId: input.userId,
    token: input.token,
    now: new Date("2026-05-27T01:00:00.000Z"),
  });

  await db.query(
    `
      INSERT INTO auth_sessions (
        id,
        user_id,
        status,
        session_token_hash,
        expires_at,
        last_seen_at,
        revoked_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      created.session.id,
      created.session.userId,
      created.session.status,
      created.session.sessionTokenHash,
      created.session.expiresAt,
      created.session.lastSeenAt,
      created.session.revokedAt,
      new Date("2026-05-27T01:00:00.000Z"),
    ],
  );
}
