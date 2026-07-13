import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { capabilities } from "../../../../../../../packages/contracts/domain/capabilities.ts";
import { operationNames } from "../../../../../../../packages/contracts/domain/operation-names.ts";
import { AuditValidationError } from "../../../audit/audit.service.ts";
import { createMigratedTestDb } from "../../db/test-db.ts";
import { runIdempotentCommand } from "../platform-command-runtime.ts";

const userId = "00000000-0000-4000-8000-000000000001";
const projectId = "40000000-0000-4000-8000-000000000001";
const adminAccountId = "80000000-0000-4000-8000-000000000001";

describe("platform command runtime", { concurrency: false }, () => {
  it("commits business write, idempotency response, and audit atomically", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedScope(db);
      let executeCount = 0;

      const first = await runIdempotentCommand({
        db,
        operationName: operationNames.projectCreate,
        capability: capabilities.projectCreate,
        idempotencyKey: "runtime-create-project",
        requestHash: "request-hash-1",
        now: new Date("2026-05-17T10:00:00.000Z"),
        resolveActor: async () => actor(),
        replay: async ({ idempotencyRecord }) => ({
          projectId: idempotencyRecord.responseResourceId!,
        }),
        execute: async () => {
          executeCount += 1;
          await insertProject(db, projectId);

          return {
            result: { projectId },
            responseResourceType: "project",
            responseResourceId: projectId,
            responseSnapshot: { projectId },
            audit: {
              eventType: "project.created",
              targetType: "project",
              targetId: projectId,
            },
          };
        },
      });
      const replay = await runIdempotentCommand({
        db,
        operationName: operationNames.projectCreate,
        capability: capabilities.projectCreate,
        idempotencyKey: "runtime-create-project",
        requestHash: "request-hash-1",
        now: new Date("2026-05-17T10:00:01.000Z"),
        resolveActor: async () => actor(),
        replay: async ({ idempotencyRecord }) => ({
          projectId: idempotencyRecord.responseResourceId!,
        }),
        execute: async () => {
          throw new Error("execute_should_not_run_on_replay");
        },
      });
      const counts = await db.query<{
        project_count: number;
        idempotency_count: number;
        audit_count: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM projects) AS project_count,
            (SELECT count(*)::int FROM idempotency_records WHERE status = 'succeeded') AS idempotency_count,
            (SELECT count(*)::int FROM audit_events) AS audit_count
        `,
      );

      assert.equal(first.idempotencyResult, "created");
      assert.equal(replay.idempotencyResult, "replayed");
      assert.deepEqual(first.result, { projectId });
      assert.deepEqual(replay.result, { projectId });
      assert.equal(executeCount, 1);
      assert.deepEqual(counts.rows[0], {
        project_count: 1,
        idempotency_count: 1,
        audit_count: 1,
      });
    } finally {
      await db.close();
    }
  });

  it("rolls back business and idempotency writes when audit append fails", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedScope(db);

      await assert.rejects(
        runIdempotentCommand({
          db,
          operationName: operationNames.projectCreate,
          capability: capabilities.projectCreate,
          idempotencyKey: "runtime-audit-rollback",
          requestHash: "request-hash-2",
          now: new Date("2026-05-17T10:00:00.000Z"),
          resolveActor: async () => actor(),
          replay: async () => {
            throw new Error("replay_should_not_run");
          },
          execute: async () => {
            await insertProject(db, projectId);

            return {
              result: { projectId },
              responseResourceType: "project",
              responseResourceId: projectId,
              responseSnapshot: { projectId },
              audit: {
                eventType: "project.created",
                targetType: "project",
                targetId: projectId,
                sensitive: true,
              },
            };
          },
        }),
        AuditValidationError,
      );
      const counts = await db.query<{
        project_count: number;
        idempotency_count: number;
        audit_count: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM projects) AS project_count,
            (SELECT count(*)::int FROM idempotency_records) AS idempotency_count,
            (SELECT count(*)::int FROM audit_events) AS audit_count
        `,
      );

      assert.deepEqual(counts.rows[0], {
        project_count: 0,
        idempotency_count: 0,
        audit_count: 0,
      });
    } finally {
      await db.close();
    }
  });

  it("isolates administrator commands without impersonating a business user", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedScope(db);
      await db.query(
        `
          INSERT INTO admin_accounts (id, login_name, password_hash, display_name)
          VALUES ($1, 'runtime-admin', 'test-hash', 'Runtime Admin')
        `,
        [adminAccountId],
      );

      await runIdempotentCommand({
        db,
        operationName: operationNames.opsManualSettleTask,
        capability: capabilities.opsSettle,
        idempotencyKey: "runtime-admin-command",
        requestHash: "admin-request-hash",
        now: new Date("2026-05-17T10:00:00.000Z"),
        resolveActor: async () => ({
          userId: null,
          adminAccountId,
          capabilities: [capabilities.opsSettle],
        }),
        replay: async () => ({ ok: true }),
        execute: async () => ({
          result: { ok: true },
          responseResourceType: "task",
          responseResourceId: projectId,
          audit: {
            eventType: "ops.manual_settle_task",
            targetType: "task",
            targetId: projectId,
            reason: "Verified provider outcome",
            sensitive: true,
          },
        }),
      });

      const idempotency = await db.query<{
        scope_key: string;
        user_id: string | null;
        admin_account_id: string | null;
      }>(
        "SELECT scope_key, user_id, admin_account_id FROM idempotency_records WHERE idempotency_key = $1",
        ["runtime-admin-command"],
      );
      const audit = await db.query<{
        actor_user_id: string | null;
        actor_admin_account_id: string | null;
      }>(
        "SELECT actor_user_id, actor_admin_account_id FROM audit_events WHERE event_type = $1",
        ["ops.manual_settle_task"],
      );

      assert.deepEqual(idempotency.rows[0], {
        scope_key: `admin:${adminAccountId}`,
        user_id: null,
        admin_account_id: adminAccountId,
      });
      assert.deepEqual(audit.rows[0], {
        actor_user_id: null,
        actor_admin_account_id: adminAccountId,
      });
    } finally {
      await db.close();
    }
  });
});

function actor() {
  return {
    userId,
    capabilities: [capabilities.projectCreate],
  };
}

async function seedScope(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ($1, '13800138000', 'active')
    `,
    [userId],
  );


}

async function insertProject(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  id: string,
) {
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
      VALUES ($1, 'Runtime Project', '9:16', '1080p', 'script_input', $2, $2)
    `,
    [id,
      userId],
  );
}
