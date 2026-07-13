import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthSession } from "../../identity/session.service.ts";
import { UserAuthorizationError as AuthorizationError } from "../../identity/user-actor-context.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  buildSignedObjectUrls,
  createScopedStorageObject,
  createSignedReadUrl,
  StorageAccessError,
  type StorageAdapter,
} from "../storage.service.ts";

describe("signed storage URLs", { concurrency: false }, () => {
  it("creates server-scoped object keys and signs URLs for the owning user", async () => {
    const db = await createMigratedTestDb();
    const adapter = new DeterministicStorageAdapter();

    try {
      await seedUsers(db);
      const object = await createScopedStorageObject(db, {
        userId: "00000000-0000-4000-8000-000000000001",
        projectId: "40000000-0000-4000-8000-000000000001",
        bucket: "creator-assets",
        objectName: "../shot-01.png",
        contentType: "image/png",
        sizeBytes: 1024,
        metadata: { kind: "shot_image" },
        createdByUserId: "00000000-0000-4000-8000-000000000001",
        now: new Date("2026-05-09T10:00:00.000Z"),
      });

      assert.match(
        object.objectKey,
        /^AIManhuaDrama\/20260509\/[0-9a-f-]+-shot-01\.png$/,
      );

      const signed = await createSignedReadUrl(db, {
        sessionToken: "owner-token",
        storageObjectId: object.id,
        adapter,
        now: new Date("2026-05-09T10:01:00.000Z"),
        expiresInSeconds: 60,
      });

      assert.equal(
        signed.url,
        `signed://creator-assets/${object.objectKey}?expires=2026-05-09T10:02:00.000Z`,
      );
      assert.equal(adapter.calls.length, 1);
    } finally {
      await db.close();
    }
  });

  it("rejects other users before creating a signed URL", async () => {
    const db = await createMigratedTestDb();
    const adapter = new DeterministicStorageAdapter();

    try {
      await seedUsers(db);
      const object = await createScopedStorageObject(db, {
        userId: "00000000-0000-4000-8000-000000000001",
        projectId: "40000000-0000-4000-8000-000000000001",
        bucket: "creator-assets",
        objectName: "shot-01.png",
        contentType: "image/png",
        now: new Date("2026-05-09T10:00:00.000Z"),
      });

      await assert.rejects(
        createSignedReadUrl(db, {
          sessionToken: "other-token",
          storageObjectId: object.id,
          adapter,
          now: new Date("2026-05-09T10:01:00.000Z"),
          expiresInSeconds: 60,
        }),
        (error: unknown) => {
          assert.ok(error instanceof AuthorizationError);
          assert.equal(error.code, "project_not_found");
          return true;
        },
      );
      assert.equal(adapter.calls.length, 0);
    } finally {
      await db.close();
    }
  });

  it("rejects public URLs as object names", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedUsers(db);
      await assert.rejects(
        createScopedStorageObject(db, {
          userId: "00000000-0000-4000-8000-000000000001",
          projectId: "40000000-0000-4000-8000-000000000001",
          bucket: "creator-assets",
          objectName: "https://example.test/shot-01.png",
          contentType: "image/png",
          now: new Date("2026-05-09T10:00:00.000Z"),
        }),
        (error: unknown) => {
          assert.ok(error instanceof StorageAccessError);
          assert.equal(error.code, "invalid_object_name");
          return true;
        },
      );
    } finally {
      await db.close();
    }
  });

  it("returns signed source URLs for video objects when a public base URL is configured", async () => {
    const db = await createMigratedTestDb();
    const adapter = new DeterministicStorageAdapter();
    const previousPublicBaseUrl = process.env.STORAGE_PUBLIC_BASE_URL;
    process.env.STORAGE_PUBLIC_BASE_URL = "https://cdn.example.test";

    try {
      await seedUsers(db);
      const imageObject = await createScopedStorageObject(db, {
        userId: "00000000-0000-4000-8000-000000000001",
        projectId: "40000000-0000-4000-8000-000000000001",
        bucket: "creator-assets",
        objectName: "shot-01.png",
        contentType: "image/png",
        now: new Date("2026-05-09T10:00:00.000Z"),
      });
      const videoObject = await createScopedStorageObject(db, {
        userId: "00000000-0000-4000-8000-000000000001",
        projectId: "40000000-0000-4000-8000-000000000001",
        bucket: "creator-assets",
        objectName: "shot-01.mp4",
        contentType: "video/mp4",
        now: new Date("2026-05-09T10:00:00.000Z"),
      });

      const imageUrls = await buildSignedObjectUrls(db, {
        sessionToken: "owner-token",
        storageObjectId: imageObject.id,
        adapter,
        now: new Date("2026-05-09T10:01:00.000Z"),
        expiresInSeconds: 60,
      });
      const videoUrls = await buildSignedObjectUrls(db, {
        sessionToken: "owner-token",
        storageObjectId: videoObject.id,
        adapter,
        now: new Date("2026-05-09T10:01:00.000Z"),
        expiresInSeconds: 60,
      });

      assert.equal(imageUrls.sourceUrl, `https://cdn.example.test/${imageObject.objectKey}`);
      assert.equal(
        videoUrls.sourceUrl,
        `signed://creator-assets/${videoObject.objectKey}?expires=2026-05-09T10:02:00.000Z`,
      );
      assert.equal(videoUrls.downloadUrl, videoUrls.sourceUrl);
    } finally {
      if (previousPublicBaseUrl === undefined) {
        delete process.env.STORAGE_PUBLIC_BASE_URL;
      } else {
        process.env.STORAGE_PUBLIC_BASE_URL = previousPublicBaseUrl;
      }
      await db.close();
    }
  });
});

class DeterministicStorageAdapter implements StorageAdapter {
  readonly calls: Array<{
    bucket: string;
    objectKey: string;
    expiresAt: Date;
  }> = [];

  async createSignedReadUrl(input: {
    bucket: string;
    objectKey: string;
    expiresAt: Date;
  }) {
    this.calls.push(input);
    return {
      url: `signed://${input.bucket}/${input.objectKey}?expires=${input.expiresAt.toISOString()}`,
      expiresAt: input.expiresAt,
    };
  }
}

async function seedUsers(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES
        ('00000000-0000-4000-8000-000000000001', '13800138000', 'active'),
        ('00000000-0000-4000-8000-000000000002', '13800138001', 'active')
    `,
  );


    await db.query(
    `
      INSERT INTO projects (
        id,
        name,
        aspect_ratio,
        resolution,
        phase,
        owner_user_id,
        created_by_user_id
      )
      VALUES ('40000000-0000-4000-8000-000000000001', 'Project One', '9:16', '1080p', 'script_input', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001')
    `,
  );

  await insertSession(db, {
    userId: "00000000-0000-4000-8000-000000000001",
    token: "owner-token",
  });
  await insertSession(db, {
    userId: "00000000-0000-4000-8000-000000000002",
    token: "other-token",
  });
}

async function insertSession(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: { userId: string; token: string },
) {
  const created = await createAuthSession({
    userId: input.userId,
    token: input.token,
    now: new Date("2026-05-09T09:00:00.000Z"),
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
      new Date("2026-05-09T09:00:00.000Z"),
    ],
  );
}
