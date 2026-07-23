import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { operationNames } from "../../../../../../../packages/contracts/domain/operation-names.ts";
import { createMigratedTestDb } from "../../db/test-db.ts";
import {
  beginOrReplayCommand,
  IdempotencyConflictError,
} from "../idempotency.service.ts";
import { SqlIdempotencyRecordStore } from "../persistent-idempotency.store.ts";

describe("persistent idempotency records", () => {
  it("persists processing records and replays the same operation key without side effects", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUsers(db);
      const store = new SqlIdempotencyRecordStore(db);

      const first = await beginOrReplayCommand(store, {
        ...userScope(userOneId),
        operationName: operationNames.scriptParse,
        idempotencyKey: "parse-once",
        requestHash: "request-hash-1",
      });
      const duplicate = await beginOrReplayCommand(store, {
        ...userScope(userOneId),
        operationName: operationNames.scriptParse,
        idempotencyKey: "parse-once",
        requestHash: "request-hash-1",
      });
      const rows = await db.query(
        "SELECT id FROM idempotency_records WHERE user_id = $1 AND operation_name = $2",
        [userOneId, operationNames.scriptParse],
      );

      assert.equal(first.kind, "created");
      assert.equal(duplicate.kind, "processing");
      assert.equal(duplicate.record.id, first.record.id);
      assert.equal(rows.rows.length, 1);
    } finally {
      await db.close();
    }
  });

  it("renews expired processing records with the latest request hash", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUsers(db);
      const store = new SqlIdempotencyRecordStore(db);
      const first = await beginOrReplayCommand(store, {
        ...userScope(userOneId),
        operationName: operationNames.scriptParse,
        idempotencyKey: "expired-parse-once",
        requestHash: "expired-request-hash-1",
      });
      await db.query(
        "UPDATE idempotency_records SET expires_at = $2 WHERE id = $1",
        [first.record.id, new Date(0)],
      );

      const renewed = await beginOrReplayCommand(store, {
        ...userScope(userOneId),
        operationName: operationNames.scriptParse,
        idempotencyKey: "expired-parse-once",
        requestHash: "expired-request-hash-2",
      });
      const row = await db.query<{ request_hash: string; status: string; expires_at: Date | string }>(
        "SELECT request_hash, status, expires_at FROM idempotency_records WHERE id = $1",
        [first.record.id],
      );

      assert.equal(renewed.kind, "created");
      assert.equal(renewed.record.id, first.record.id);
      assert.equal(row.rows[0]?.request_hash, "expired-request-hash-2");
      assert.equal(row.rows[0]?.status, "processing");
      assert.ok(new Date(row.rows[0]!.expires_at).getTime() > Date.now());
    } finally {
      await db.close();
    }
  });

  it("returns completed resource metadata on replay after the operation succeeds", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUsers(db);
      const store = new SqlIdempotencyRecordStore(db);

      await beginOrReplayCommand(store, {
        ...userScope(userOneId),
        operationName: operationNames.exportCreate,
        idempotencyKey: "export-once",
        requestHash: "request-hash-2",
      });
      const completed = await beginOrReplayCommand(store, {
        ...userScope(userOneId),
        operationName: operationNames.exportCreate,
        idempotencyKey: "export-once",
        requestHash: "request-hash-2",
        responseResourceType: "workflow",
        responseResourceId: "50000000-0000-4000-8000-000000000001",
      });
      const replay = await beginOrReplayCommand(store, {
        ...userScope(userOneId),
        operationName: operationNames.exportCreate,
        idempotencyKey: "export-once",
        requestHash: "request-hash-2",
      });

      assert.equal(completed.kind, "replayed");
      assert.equal(completed.record.status, "succeeded");
      assert.equal(replay.kind, "replayed");
      assert.equal(replay.record.responseResourceType, "workflow");
      assert.equal(replay.record.responseResourceId, "50000000-0000-4000-8000-000000000001");
    } finally {
      await db.close();
    }
  });

  it("rejects same user operation keys with different request hashes", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUsers(db);
      const store = new SqlIdempotencyRecordStore(db);

      await beginOrReplayCommand(store, {
        ...userScope(userOneId),
        operationName: operationNames.projectCreate,
        idempotencyKey: "create-project-once",
        requestHash: "request-hash-3",
      });

      await assert.rejects(
        beginOrReplayCommand(store, {
          ...userScope(userOneId),
          operationName: operationNames.projectCreate,
          idempotencyKey: "create-project-once",
          requestHash: "different-request-hash",
        }),
        (error: unknown) => {
          assert.ok(error instanceof IdempotencyConflictError);
          assert.equal(error.code, "idempotency_conflict");
          return true;
        },
      );
    } finally {
      await db.close();
    }
  });

  it("scopes the same operation key independently per user", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUsers(db);
      const store = new SqlIdempotencyRecordStore(db);

      const firstOrg = await beginOrReplayCommand(store, {
        ...userScope(userOneId),
        operationName: operationNames.projectCreate,
        idempotencyKey: "client-key",
        requestHash: "org-one-hash",
      });
      const secondOrg = await beginOrReplayCommand(store, {
        ...userScope(userTwoId),
        operationName: operationNames.projectCreate,
        idempotencyKey: "client-key",
        requestHash: "org-two-hash",
      });

      assert.equal(firstOrg.kind, "created");
      assert.equal(secondOrg.kind, "created");
      assert.notEqual(firstOrg.record.id, secondOrg.record.id);
    } finally {
      await db.close();
    }
  });

  it("scopes the same operation key independently for users and administrators", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUsers(db);
      await db.query(
        `
          INSERT INTO admin_accounts (id, login_name, password_hash, display_name)
          VALUES ($1, 'idempotency-admin', 'test-hash', 'Idempotency Admin')
        `,
        [adminAccountId],
      );
      const store = new SqlIdempotencyRecordStore(db);
      const command = {
        operationName: operationNames.projectCreate,
        idempotencyKey: "shared-actor-key",
        requestHash: "shared-request-hash",
      };

      const userResult = await beginOrReplayCommand(store, {
        ...userScope(userOneId),
        ...command,
      });
      const adminResult = await beginOrReplayCommand(store, {
        scopeKey: `admin:${adminAccountId}`,
        adminAccountId,
        ...command,
      });
      const rows = await db.query<{
        scope_key: string;
        user_id: string | null;
        admin_account_id: string | null;
      }>(
        `
          SELECT scope_key, user_id, admin_account_id
          FROM idempotency_records
          WHERE operation_name = $1 AND idempotency_key = $2
          ORDER BY scope_key
        `,
        [command.operationName, command.idempotencyKey],
      );

      assert.equal(userResult.kind, "created");
      assert.equal(adminResult.kind, "created");
      assert.notEqual(userResult.record.id, adminResult.record.id);
      assert.deepEqual(rows.rows, [
        {
          scope_key: `admin:${adminAccountId}`,
          user_id: null,
          admin_account_id: adminAccountId,
        },
        {
          scope_key: `user:${userOneId}`,
          user_id: userOneId,
          admin_account_id: null,
        },
      ]);
    } finally {
      await db.close();
    }
  });

  it("returns deterministic processing replay for concurrent same-key callers", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUsers(db);
      const store = new SqlIdempotencyRecordStore(db);

      const results = await Promise.all([
        beginOrReplayCommand(store, {
          ...userScope(userOneId),
          operationName: operationNames.projectCreate,
          idempotencyKey: "concurrent-create",
          requestHash: "request-hash-concurrent",
        }),
        beginOrReplayCommand(store, {
          ...userScope(userOneId),
          operationName: operationNames.projectCreate,
          idempotencyKey: "concurrent-create",
          requestHash: "request-hash-concurrent",
        }),
      ]);
      const rows = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM idempotency_records WHERE idempotency_key = 'concurrent-create'",
      );

      assert.deepEqual(
        results.map((result) => result.kind).sort(),
        ["created", "processing"],
      );
      assert.equal(results[0]?.record.id, results[1]?.record.id);
      assert.equal(rows.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });
});

const userOneId = "00000000-0000-4000-8000-000000000001";
const userTwoId = "00000000-0000-4000-8000-000000000002";
const adminAccountId = "80000000-0000-4000-8000-000000000001";

function userScope(userId: string) {
  return { scopeKey: `user:${userId}`, userId };
}

async function seedUsers(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ($1, '13800138001', 'active'), ($2, '13800138002', 'active')
    `,
    [userOneId, userTwoId],
  );
}
