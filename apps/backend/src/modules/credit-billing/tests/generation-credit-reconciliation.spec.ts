import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { grantCredits, reserveCredits } from "../credit-ledger.service.ts";
import {
  classifyGenerationCreditCandidate,
  reconcileGenerationCredits,
} from "../generation-credit-reconciliation.service.ts";

describe("generation credit reconciliation", () => {
  it("only auto-releases explicit provider HTTP rejections", () => {
    const rejected = classifyGenerationCreditCandidate(candidate({
      providers: [provider({
        status: "result_unknown",
        logStatus: "failed",
        logFailureCode: "provider_submission_failed",
        logResponseText: "seedance_video_404: endpoint not found",
      })],
    }));
    const serverError = classifyGenerationCreditCandidate(candidate({
      providers: [provider({
        status: "failed",
        logStatus: "failed",
        logFailureCode: "provider_submission_failed",
        logResponseText: "provider_500: internal server error",
      })],
    }));
    const ambiguous = ["fetch failed", "provider_408: timeout", "provider_429: rate limited"].map((message) =>
      classifyGenerationCreditCandidate(candidate({
        providers: [provider({
          status: "result_unknown",
          logStatus: "failed",
          logFailureCode: "provider_submission_ambiguous",
          logResponseText: message,
        })],
      }))
    );

    assert.equal(rejected.action, "release");
    assert.deepEqual(rejected.definitiveHttpStatuses, [404]);
    assert.equal(serverError.action, "release");
    assert.deepEqual(serverError.definitiveHttpStatuses, [500]);
    assert.equal(ambiguous.every((decision) => decision.action === "manual_review"), true);
  });

  it("consumes a single provider success even when platform output persistence failed", () => {
    const decision = classifyGenerationCreditCandidate(candidate({
      reservationStatus: "manual_review_required",
      providers: [provider({
        status: "succeeded",
        externalStarted: true,
        externalRequestId: "provider-task-1",
        responsePresent: true,
        logStatus: "succeeded",
      })],
    }));

    assert.equal(decision.action, "consume");
    assert.equal(decision.reason, "provider_succeeded_platform_output_unavailable");
  });

  it("applies a provider-success settlement once and is idempotent on replay", async () => {
    const db = await createMigratedTestDb();
    const ids = {
      user: randomUUID(),
      workflow: randomUUID(),
      task: randomUUID(),
      attempt: randomUUID(),
      provider: randomUUID(),
      snapshot: randomUUID(),
      target: randomUUID(),
    };
    const now = new Date("2026-07-21T12:00:00.000Z");

    try {
      await db.query(
        `INSERT INTO users (id, phone_e164, display_name, status) VALUES ($1, $2, 'Reconciliation', 'active')`,
        [ids.user, `138${String(Date.now()).slice(-8)}`],
      );
      await db.query(
        `
          INSERT INTO workflows (id, workflow_type, status, input_snapshot_json, created_by_user_id)
          VALUES ($1, 'episode_video_generate', 'failed', '{}'::jsonb, $2)
        `,
        [ids.workflow, ids.user],
      );
      await db.query(
        `
          INSERT INTO tasks (
            id, workflow_id, task_type, status, queue_name, input_snapshot_json,
            target_entity_type, target_entity_id, failure_code
          )
          VALUES ($1, $2, 'episode_generate_video', 'failed', 'generation', '{}'::jsonb,
                  'episode', $3, 'provider_output_storage_failed')
        `,
        [ids.task, ids.workflow, ids.target],
      );
      await db.query(
        `
          INSERT INTO task_attempts (
            id, workflow_id, task_id, attempt_number, status, failure_code
          )
          VALUES ($1, $2, $3, 1, 'failed', 'provider_output_storage_failed')
        `,
        [ids.attempt, ids.workflow, ids.task],
      );
      await db.query("UPDATE tasks SET current_attempt_id = $2 WHERE id = $1", [ids.task, ids.attempt]);
      await grantCredits(db, {
        userId: ids.user,
        amount: 100,
        sourceType: "test_generation_reconciliation",
        sourceId: randomUUID(),
        reason: "seed reconciliation credits",
        now,
      });
      const reserved = await reserveCredits(db, {
        userId: ids.user,
        workflowId: ids.workflow,
        taskId: ids.task,
        amount: 40,
        sourceType: "episode_generation_task",
        sourceId: ids.task,
        reason: "video generation",
        now,
      });
      await db.query(
        "UPDATE credit_reservations SET status = 'manual_review_required' WHERE id = $1",
        [reserved.reservation.id],
      );
      await db.query(
        `
          INSERT INTO provider_requests (
            id, workflow_id, task_id, attempt_id, provider_name, provider_operation,
            request_key, request_hash, payload_ref, payload_hash, payload_redacted_json,
            status, external_submission_started_at, external_request_id,
            response_redacted_json, created_by_user_id
          )
          VALUES ($1, $2, $3, $4, 'test-provider', 'episode.video.generate',
                  $5, $5, $5, $5, '{}'::jsonb, 'succeeded', $6, 'external-1',
                  '{"providerStatus":"completed"}'::jsonb, $7)
        `,
        [ids.provider, ids.workflow, ids.task, ids.attempt, ids.task, now, ids.user],
      );
      await db.query(
        `
          INSERT INTO ai_generation_task_snapshots (
            id, target_type, target_id, workflow_id, task_id, attempt_id,
            provider_request_id, credit_reservation_id, model_code, media_type,
            task_mode, status, progress_stage, request_summary_json,
            provider_status_json, result_assets_json, estimated_credits,
            credit_status, credit_summary_json, submitted_at, failed_at, user_id
          )
          VALUES ($1, 'episode', $2, $3, $4, $5, $6, $7, 'test-video', 'video',
                  'image_to_video', 'failed', 'failed', '{}'::jsonb, '{}'::jsonb,
                  '[]'::jsonb, 40, 'manual_review_required', '{}'::jsonb, $8, $8, $9)
        `,
        [
          ids.snapshot,
          ids.target,
          ids.workflow,
          ids.task,
          ids.attempt,
          ids.provider,
          reserved.reservation.id,
          now,
          ids.user,
        ],
      );

      const dryRun = await reconcileGenerationCredits(db, { now });
      const beforeApply = await readSettlementState(db, ids.task);
      const applied = await reconcileGenerationCredits(db, { apply: true, now });
      const afterApply = await readSettlementState(db, ids.task);
      const replay = await reconcileGenerationCredits(db, { apply: true, now });
      const afterReplay = await readSettlementState(db, ids.task);

      assert.equal(dryRun.mode, "dry-run");
      assert.equal(dryRun.decisions[0]?.action, "consume");
      assert.equal(beforeApply.reservation_status, "manual_review_required");
      assert.equal(beforeApply.amount_reserved, 40);
      assert.equal(beforeApply.allocation_count, 0);
      assert.equal(applied.counts.applied, 1);
      assert.equal(afterApply.reservation_status, "settled");
      assert.equal(afterApply.amount_reserved, 0);
      assert.equal(afterApply.amount_consumed, 40);
      assert.equal(afterApply.snapshot_credit_status, "consumed");
      assert.equal(afterApply.allocation_count, 1);
      assert.equal(afterApply.settlement_ledger_count, 1);
      assert.equal(replay.counts.applied, 0);
      assert.equal(replay.decisions.length, 0);
      assert.deepEqual(afterReplay, afterApply);
    } finally {
      await db.close();
    }
  });
});

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    taskId: "10000000-0000-4000-8000-000000000001",
    taskType: "episode_generate_video",
    taskStatus: "failed",
    taskFailureCode: "provider_submission_failed",
    currentAttemptId: "20000000-0000-4000-8000-000000000001",
    attemptStatus: "failed",
    attemptFailureCode: "provider_submission_failed",
    snapshotStatus: "failed",
    snapshotCreditStatus: "reserved",
    resultAssetCount: 0,
    reservationId: "30000000-0000-4000-8000-000000000001",
    reservationStatus: "active",
    amountTotal: 40,
    amountReserved: 40,
    amountConsumed: 0,
    amountReleased: 0,
    providers: [],
    ...overrides,
  } as Parameters<typeof classifyGenerationCreditCandidate>[0];
}

function provider(overrides: Record<string, unknown> = {}) {
  return {
    id: "40000000-0000-4000-8000-000000000001",
    status: "result_unknown",
    externalStarted: true,
    externalRequestId: null,
    responsePresent: false,
    logStatus: null,
    logFailureCode: null,
    logResponseText: null,
    ...overrides,
  };
}

async function readSettlementState(
  db: { query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> },
  taskId: string,
) {
  const result = await db.query<{
    reservation_status: string;
    amount_reserved: number;
    amount_consumed: number;
    snapshot_credit_status: string;
    allocation_count: number;
    settlement_ledger_count: number;
  }>(
    `
      SELECT reservation.status AS reservation_status,
             reservation.amount_reserved,
             reservation.amount_consumed,
             snapshot.credit_status AS snapshot_credit_status,
             (SELECT count(*)::int FROM credit_reservation_allocations allocation
              WHERE allocation.reservation_id = reservation.id) AS allocation_count,
             (SELECT count(*)::int FROM credit_ledger_entries ledger
              WHERE ledger.reservation_id = reservation.id
                AND ledger.entry_type IN ('consume', 'release')) AS settlement_ledger_count
      FROM credit_reservations reservation
      JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = reservation.task_id
      WHERE reservation.task_id = $1
    `,
    [taskId],
  );
  return result.rows[0]!;
}
