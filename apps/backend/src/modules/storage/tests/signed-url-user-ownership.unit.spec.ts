import assert from "node:assert/strict";
import { test } from "node:test";

import { createAuthSession } from "../../identity/session.service.ts";
import { UserAuthorizationError } from "../../identity/user-actor-context.service.ts";
import type { SqlDatabase } from "../../shared/db/sql.ts";
import { createSignedReadUrl, type StorageAdapter } from "../storage.service.ts";

process.env.AUTH_SECRET_PEPPER ??= "signed-url-user-ownership-test-pepper";

const userId = "00000000-0000-4000-8000-000000000001";
const otherUserId = "00000000-0000-4000-8000-000000000002";
const projectId = "30000000-0000-4000-8000-000000000001";
const now = new Date("2026-07-10T10:00:00.000Z");

test("signed URLs enforce project and direct user ownership", async () => {
  const token = "signed-url-owner-session";
  const session = await createAuthSession({ userId, token, now });
  let objectOwner = otherUserId;
  let objectProjectId: string | null = projectId;
  let projectOwner = otherUserId;

  const db: SqlDatabase = {
    async query<T>(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      let rows: unknown[] = [];
      if (normalized.includes("FROM storage_objects")) {
        rows = [{
          id: "50000000-0000-4000-8000-000000000001",
          project_id: objectProjectId,
          bucket: "private-assets",
          object_key: "asset.png",
          content_type: "image/png",
          size_bytes: 10,
          checksum: null,
          provider: "test",
          status: "available",
          etag: null,
          version_id: null,
          last_verified_at: now,
          deleted_at: null,
          metadata_json: {},
          created_by_user_id: objectOwner,
          created_at: now,
        }];
      } else if (normalized.includes("FROM auth_sessions")) {
        rows = [{
          id: session.session.id,
          user_id: session.session.userId,
          status: session.session.status,
          session_token_hash: session.session.sessionTokenHash,
          session_token_hash_version: session.session.sessionTokenHashVersion,
          expires_at: session.session.expiresAt,
          last_seen_at: session.session.lastSeenAt,
          revoked_at: session.session.revokedAt,
        }];
      } else if (normalized.includes("FROM users")) {
        rows = [{ id: userId, status: "active" }];
      } else if (normalized.includes("FROM team_member_auth_sessions")) {
        rows = [];
      } else if (normalized.includes("FROM projects")) {
        rows = projectOwner === userId ? [{ id: projectId }] : [];
      }
      return { rows: rows as T[] };
    },
  };
  let signedCount = 0;
  const adapter: StorageAdapter = {
    async createSignedReadUrl() {
      signedCount += 1;
      return { url: "signed://private-assets/asset.png", expiresAt: now };
    },
  };

  await assert.rejects(
    createSignedReadUrl(db, { sessionToken: token, storageObjectId: "foreign-project", adapter, now, expiresInSeconds: 60 }),
    (error: unknown) => error instanceof UserAuthorizationError && error.code === "project_not_found",
  );

  objectProjectId = null;
  await assert.rejects(
    createSignedReadUrl(db, { sessionToken: token, storageObjectId: "foreign-user", adapter, now, expiresInSeconds: 60 }),
    (error: unknown) => error instanceof UserAuthorizationError && error.code === "project_not_found",
  );

  objectOwner = userId;
  await createSignedReadUrl(db, { sessionToken: token, storageObjectId: "owned-user", adapter, now, expiresInSeconds: 60 });
  projectOwner = userId;
  objectProjectId = projectId;
  await createSignedReadUrl(db, { sessionToken: token, storageObjectId: "owned-project", adapter, now, expiresInSeconds: 60 });
  assert.equal(signedCount, 2);
});
