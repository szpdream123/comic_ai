import assert from "node:assert/strict";
import { test } from "node:test";

import { createAuthSession } from "../../identity/session.service.ts";
import { AuthorizationError } from "../../organization/actor-context.service.ts";
import type { SqlDatabase } from "../../shared/db/sql.ts";
import { createSignedReadUrl, type StorageAdapter } from "../storage.service.ts";

process.env.AUTH_SECRET_PEPPER ??= "signed-url-user-ownership-test-pepper";

const userId = "00000000-0000-4000-8000-000000000001";
const otherUserId = "00000000-0000-4000-8000-000000000002";
const organizationId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "c0000000-0000-4000-8000-000000000001";
const projectId = "30000000-0000-4000-8000-000000000001";
const now = new Date("2026-07-10T10:00:00.000Z");

test("signed URLs reject project and workspace objects owned by another user", async () => {
  const token = "signed-url-owner-session";
  const session = await createAuthSession({ userId, token, now });
  const queries: string[] = [];
  const db: SqlDatabase = {
    async query<T>(sql: string, params: unknown[] = []) {
      queries.push(sql);
      const normalized = sql.replace(/\s+/g, " ").trim();
      let rows: unknown[] = [];
      if (normalized.includes("FROM storage_objects")) {
        const objectId = String(params[0]);
        const organizationOnly = objectId.endsWith("000003")
          || objectId.endsWith("000004")
          || objectId.endsWith("000005");
        rows = [{
          id: objectId,
          organization_id: organizationId,
          workspace_id: organizationOnly ? null : workspaceId,
          project_id: organizationOnly || objectId.endsWith("000002") ? null : projectId,
          bucket: "private-assets",
          object_key: "foreign.png",
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
          created_by_user_id: objectId.endsWith("000003")
            ? userId
            : objectId.endsWith("000005")
              ? null
              : otherUserId,
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
      } else if (normalized.includes("LEFT JOIN workspaces")) {
        rows = [{
          user_id: userId,
          user_status: "active",
          workspace_id: workspaceId,
          organization_id: organizationId,
          member_id: null,
          member_account: null,
          member_login_account: null,
          member_name: null,
          member_session_status: null,
          member_session_expires_at: null,
          member_status: null,
        }];
      } else if (normalized.includes("FROM team_member_auth_sessions")) {
        rows = [];
      } else if (normalized.includes("FROM users")) {
        rows = [{ id: userId, status: "active" }];
      } else if (normalized.includes("FROM organizations")) {
        rows = [{ id: organizationId }];
      } else if (normalized.includes("WITH legacy_owners")) {
        rows = [{ owner_count: 1, current_user_owned: true }];
      } else if (normalized.includes("FROM projects")) {
        rows = [{
          project_id: projectId,
          workspace_id: workspaceId,
          organization_id: organizationId,
          created_by_user_id: otherUserId,
        }];
      }
      return { rows: rows as T[] };
    },
  };
  const adapter: StorageAdapter = {
    async createSignedReadUrl() {
      assert.fail("foreign storage object must not be signed");
    },
  };

  await assert.rejects(
    createSignedReadUrl(db, {
      sessionToken: token,
      storageObjectId: "50000000-0000-4000-8000-000000000001",
      adapter,
      now,
      expiresInSeconds: 60,
    }),
    (error: unknown) => {
      assert.ok(error instanceof AuthorizationError);
      assert.equal(error.code, "project_not_found");
      return true;
    },
  );
  assert.ok(queries.some((sql) => /FROM\s+projects/i.test(sql)));

  await assert.rejects(
    createSignedReadUrl(db, {
      sessionToken: token,
      storageObjectId: "50000000-0000-4000-8000-000000000002",
      adapter,
      now,
      expiresInSeconds: 60,
    }),
    (error: unknown) => {
      assert.ok(error instanceof AuthorizationError);
      assert.equal(error.code, "membership_missing");
      return true;
    },
  );

  let signedOwnerObjects = 0;
  const ownerAdapter: StorageAdapter = {
    async createSignedReadUrl() {
      signedOwnerObjects += 1;
      return { url: "signed://private-assets/owned.png", expiresAt: now };
    },
  };
  await createSignedReadUrl(db, {
    sessionToken: token,
    storageObjectId: "50000000-0000-4000-8000-000000000003",
    adapter: ownerAdapter,
    now,
    expiresInSeconds: 60,
  });
  assert.equal(signedOwnerObjects, 1);

  for (const storageObjectId of [
    "50000000-0000-4000-8000-000000000004",
    "50000000-0000-4000-8000-000000000005",
  ]) {
    await assert.rejects(
      createSignedReadUrl(db, {
        sessionToken: token,
        storageObjectId,
        adapter,
        now,
        expiresInSeconds: 60,
      }),
      (error: unknown) => {
        assert.ok(error instanceof AuthorizationError);
        assert.ok(["organization_not_found", "membership_missing"].includes(error.code));
        return true;
      },
    );
  }
});
