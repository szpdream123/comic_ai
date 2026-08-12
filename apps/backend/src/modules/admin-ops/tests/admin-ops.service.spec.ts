import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthSession } from "../../identity/session.service.ts";
import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { appendGenerationTaskPollRequestedOutboxEvent } from "../../model-gateway/generation-outbox.service.ts";
import { createAdminOpsService } from "../admin-ops.service.ts";

const adminUserId = "30000000-0000-4000-8000-000000000001";
const creatorUserId = "30000000-0000-4000-8000-000000000002";
const workflowId = "40000000-0000-4000-8000-000000000001";
const unknownTaskId = "50000000-0000-4000-8000-000000000001";
const failedTaskId = "50000000-0000-4000-8000-000000000002";
const attemptId = "60000000-0000-4000-8000-000000000001";
const providerRequestId = "70000000-0000-4000-8000-000000000001";
const reservationId = "a0000000-0000-4000-8000-000000000001";
const creditPackageId = "90000000-0000-4000-8000-000000000001";
const paidOrderId = "91000000-0000-4000-8000-000000000001";
const failedPaidOrderId = "91000000-0000-4000-8000-000000000002";
const paymentIntentId = "92000000-0000-4000-8000-000000000001";
const failedPaymentIntentId = "92000000-0000-4000-8000-000000000002";
const paymentRiskEventId = "93000000-0000-4000-8000-000000000001";
const failedPaymentProviderEventId = "93000000-0000-4000-8000-000000000002";
const retryEpisodeId = "94000000-0000-4000-8000-000000000001";
const membershipPlanId = "95000000-0000-4000-8000-000000000001";
const membershipPaidOrderId = "96000000-0000-4000-8000-000000000001";
const membershipPaymentIntentId = "97000000-0000-4000-8000-000000000001";

describe("admin ops service", { concurrency: false }, () => {
  it("lists stuck tasks for ops users and rejects ordinary creators", async () => {
    const db = await createMigratedTestDb();

    try {
      const { adminSession, creatorSession } = await seedOpsFixture(db);
      const service = createAdminOpsService({ db });

      const forbidden = await service.listItems({
        user: { sessionToken: creatorSession.token },
        now: new Date("2026-05-19T10:00:00.000Z"),
      });
      const listed = await service.listItems({
        user: { actor: adminOpsActor() },
        now: new Date("2026-05-19T10:00:00.000Z"),
      });

      assert.equal(forbidden.status, 403);
      assert.deepEqual(forbidden.body, { error: "ops_forbidden" });
      assert.equal(listed.status, 200);
      assert.deepEqual(
        listed.body.tasks.map((task) => ({
          id: task.id,
          status: task.status,
          providerStatus: task.providerStatus,
        })),
        [
          {
            id: unknownTaskId,
            status: "result_unknown",
            providerStatus: "result_unknown",
          },
          {
            id: failedTaskId,
            status: "failed",
            providerStatus: null,
          },
        ],
      );
    } finally {
      await db.close();
    }
  });

  it("requires a reason and writes audit when manually settling unknown tasks", async () => {
    const db = await createMigratedTestDb();

    try {
      const { adminSession } = await seedOpsFixture(db);
      const service = createAdminOpsService({ db });

      const missingReason = await service.manualSettleTask({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-manual-settle-missing-reason",
        body: {
          taskId: unknownTaskId,
          decision: "release",
          reason: " ",
        },
        now: new Date("2026-05-19T10:01:00.000Z"),
      });
      const settled = await service.manualSettleTask({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-manual-settle-release",
        body: {
          taskId: unknownTaskId,
          decision: "release",
          reason: "Provider confirmed no billable result.",
        },
        now: new Date("2026-05-19T10:02:00.000Z"),
      });
      const duplicate = await service.manualSettleTask({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-manual-settle-release",
        body: {
          taskId: unknownTaskId,
          decision: "release",
          reason: "Provider confirmed no billable result.",
        },
        now: new Date("2026-05-19T10:03:00.000Z"),
      });
      const audit = await db.query<{ event_type: string; reason: string | null }>(
        "SELECT event_type, reason FROM audit_events ORDER BY created_at ASC",
      );
      const attempt = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM task_attempts WHERE id = $1",
        [attemptId],
      );
      const provider = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM provider_requests WHERE id = $1",
        [providerRequestId],
      );
      const reservation = await db.query<{
        amount_reserved: number;
        amount_released: number;
        status: string;
      }>(
        "SELECT amount_reserved, amount_released, status FROM credit_reservations WHERE id = $1",
        [reservationId],
      );
      const ledger = await db.query<{ entry_type: string; amount: number }>(
        "SELECT entry_type, amount FROM credit_ledger_entries WHERE reservation_id = $1 AND entry_type = 'release'",
        [reservationId],
      );

      assert.equal(missingReason.status, 400);
      assert.deepEqual(missingReason.body, { error: "reason_required" });
      assert.equal(settled.status, 200);
      assert.equal(settled.body.task.status, "succeeded");
      assert.equal(duplicate.status, 200);
      assert.equal(duplicate.body.task.status, "succeeded");
      assert.deepEqual(attempt.rows[0], { status: "succeeded", failure_code: null });
      assert.deepEqual(provider.rows[0], { status: "succeeded", failure_code: null });
      assert.deepEqual(reservation.rows[0], {
        amount_reserved: 0,
        amount_released: 10,
        status: "released",
      });
      assert.deepEqual(ledger.rows, [{ entry_type: "release", amount: 10 }]);
      assert.deepEqual(audit.rows, [
        {
          event_type: "ops.task_manually_settled",
          reason: "Provider confirmed no billable result.",
        },
      ]);
    } finally {
      await db.close();
    }
  });

  it("can release a reservation that is already marked for manual review", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedOpsFixture(db);
      await db.query(
        "UPDATE credit_reservations SET status = 'manual_review_required' WHERE id = $1",
        [reservationId],
      );
      const service = createAdminOpsService({ db });

      const settled = await service.manualSettleTask({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-manual-settle-manual-review-release",
        body: {
          taskId: unknownTaskId,
          decision: "release",
          reason: "Provider confirmed no billable result.",
        },
        now: new Date("2026-05-19T10:02:00.000Z"),
      });
      const reservation = await db.query<{
        amount_reserved: number;
        amount_released: number;
        status: string;
      }>(
        "SELECT amount_reserved, amount_released, status FROM credit_reservations WHERE id = $1",
        [reservationId],
      );

      assert.equal(settled.status, 200);
      assert.deepEqual(reservation.rows[0], {
        amount_reserved: 0,
        amount_released: 10,
        status: "released",
      });
    } finally {
      await db.close();
    }
  });

  it("can manually settle an unknown task by consuming reserved credits", async () => {
    const db = await createMigratedTestDb();

    try {
      const { adminSession } = await seedOpsFixture(db);
      const service = createAdminOpsService({ db });

      const settled = await service.manualSettleTask({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-manual-settle-consume",
        body: {
          taskId: unknownTaskId,
          decision: "consume",
          reason: "Provider confirmed a billable result.",
        },
        now: new Date("2026-05-19T10:02:00.000Z"),
      });

      const reservation = await db.query<{
        amount_reserved: number;
        amount_consumed: number;
        status: string;
      }>(
        "SELECT amount_reserved, amount_consumed, status FROM credit_reservations WHERE id = $1",
        [reservationId],
      );
      const ledger = await db.query<{ entry_type: string; amount: number }>(
        "SELECT entry_type, amount FROM credit_ledger_entries WHERE reservation_id = $1 AND entry_type = 'consume'",
        [reservationId],
      );

      assert.equal(settled.status, 200);
      assert.equal(settled.body.task.status, "succeeded");
      assert.deepEqual(reservation.rows[0], {
        amount_reserved: 0,
        amount_consumed: 10,
        status: "settled",
      });
      assert.deepEqual(ledger.rows, [{ entry_type: "consume", amount: 10 }]);
    } finally {
      await db.close();
    }
  });

  it("keeps abnormal-cost settlements in manual review and marks the reservation", async () => {
    const db = await createMigratedTestDb();

    try {
      const { adminSession } = await seedOpsFixture(db);
      const service = createAdminOpsService({ db });

      const settled = await service.manualSettleTask({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-manual-settle-abnormal",
        body: {
          taskId: unknownTaskId,
          decision: "mark_abnormal_cost",
          reason: "Provider cost needs finance review.",
        },
        now: new Date("2026-05-19T10:02:00.000Z"),
      });

      const reservation = await db.query<{
        amount_reserved: number;
        status: string;
      }>(
        "SELECT amount_reserved, status FROM credit_reservations WHERE id = $1",
        [reservationId],
      );

      assert.equal(settled.status, 200);
      assert.equal(settled.body.task.status, "manual_review_required");
      assert.deepEqual(reservation.rows[0], {
        amount_reserved: 10,
        status: "manual_review_required",
      });
    } finally {
      await db.close();
    }
  });

  it("requires a reason and requeues retryable failed tasks", async () => {
    const db = await createMigratedTestDb();

    try {
      const { adminSession } = await seedOpsFixture(db);
      const service = createAdminOpsService({ db });

      const missingReason = await service.retryTask({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-retry-missing-reason",
        body: {
          taskId: failedTaskId,
          reason: "",
        },
        now: new Date("2026-05-19T10:04:00.000Z"),
      });
      const retried = await service.retryTask({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-retry-task",
        body: {
          taskId: failedTaskId,
          reason: "Transient provider timeout fixed.",
        },
        now: new Date("2026-05-19T10:05:00.000Z"),
      });
      const replay = await service.retryTask({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-retry-task",
        body: {
          taskId: failedTaskId,
          reason: "Transient provider timeout fixed.",
        },
        now: new Date("2026-05-19T10:06:00.000Z"),
      });
      const conflict = await service.retryTask({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-retry-task",
        body: {
          taskId: failedTaskId,
          reason: "Different reason.",
        },
        now: new Date("2026-05-19T10:07:00.000Z"),
      });
      const task = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM tasks WHERE id = $1",
        [failedTaskId],
      );
      const audit = await db.query<{ event_type: string; reason: string | null }>(
        "SELECT event_type, reason FROM audit_events ORDER BY created_at ASC",
      );

      assert.equal(missingReason.status, 400);
      assert.deepEqual(missingReason.body, { error: "reason_required" });
      assert.equal(retried.status, 200);
      assert.equal(retried.body.task.status, "queued");
      assert.equal(replay.status, 200);
      assert.equal(replay.body.task.id, retried.body.task.id);
      assert.equal(conflict.status, 409);
      assert.deepEqual(conflict.body, { error: "idempotency_conflict" });
      assert.deepEqual(task.rows[0], { status: "queued", failure_code: null });
      assert.deepEqual(audit.rows, [
        {
          event_type: "ops.task_retry_requested",
          reason: "Transient provider timeout fixed.",
        },
      ]);
    } finally {
      await db.close();
    }
  });

  it("recreates one generation outbox event when retrying a failed Seedance video task", async () => {
    const db = await createMigratedTestDb();

    try {
      const { adminSession } = await seedOpsFixture(db);
      await db.query(
        `
          UPDATE tasks
          SET task_type = 'episode_generate_video',
              queue_name = 'generation-submit-video',
              input_snapshot_json = $2::jsonb,
              target_entity_type = 'episode',
              target_entity_id = $3
          WHERE id = $1
        `,
        [
          failedTaskId,
          JSON.stringify({
            kind: "video",
            model: "seedance-i2v-pro",
            providerExecutor: "seedance",
            targetType: "episode",
            targetId: retryEpisodeId,
          }),
          retryEpisodeId,
        ],
      );
      const previousAttemptId = "95000000-0000-4000-8000-000000000019";
      await db.query(
        `
          INSERT INTO task_attempts (
            id, workflow_id, task_id, attempt_number, status, failure_code
          )
          VALUES ($1, $2, $3, 1, 'failed', 'provider_timeout')
        `,
        [previousAttemptId, workflowId, failedTaskId],
      );
      await db.query(
        "UPDATE tasks SET current_attempt_id = $2 WHERE id = $1",
        [failedTaskId, previousAttemptId],
      );
      const service = createAdminOpsService({ db });

      const retried = await service.retryTask({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-retry-seedance-video",
        body: {
          taskId: failedTaskId,
          reason: "Seedance provider timeout recovered.",
        },
        now: new Date("2026-05-19T10:08:00.000Z"),
      });
      const replay = await service.retryTask({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-retry-seedance-video",
        body: {
          taskId: failedTaskId,
          reason: "Seedance provider timeout recovered.",
        },
        now: new Date("2026-05-19T10:09:00.000Z"),
      });
      const outbox = await db.query<{
        event_type: string;
        payload_json: {
          workflowId: string;
          taskId: string;
          mediaType: string;
          modelCode: string;
          queueName: string;
          targetType: string;
          targetId: string;
          providerExecutor: string;
          dispatchToken: string;
        };
        status: string;
      }>(
        `
          SELECT event_type, payload_json, status
          FROM outbox_events
          WHERE event_type = 'generation.task.created'
          ORDER BY created_at ASC
        `,
      );
      const task = await db.query<{
        current_attempt_id: string | null;
        requested_at: string;
        timeout_at: string;
      }>(
        `
          SELECT current_attempt_id,
                 input_snapshot_json->>'requestedAt' AS requested_at,
                 input_snapshot_json->>'timeoutAt' AS timeout_at
          FROM tasks
          WHERE id = $1
        `,
        [failedTaskId],
      );

      assert.equal(retried.status, 200);
      assert.equal(retried.body.task.status, "queued");
      assert.equal(replay.status, 200);
      assert.equal(task.rows[0]?.current_attempt_id, null);
      assert.equal(new Date(task.rows[0]!.requested_at).toISOString(), "2026-05-19T10:08:00.000Z");
      assert.equal(new Date(task.rows[0]!.timeout_at).toISOString(), "2026-05-19T13:08:00.000Z");
      assert.equal(outbox.rows.length, 1);
      assert.deepEqual(outbox.rows[0], {
        event_type: "generation.task.created",
        payload_json: {
          workflowId,
          taskId: failedTaskId,
          mediaType: "video",
          modelCode: "seedance-i2v-pro",
          queueName: "generation-submit-video",
          targetType: "episode",
          targetId: retryEpisodeId,
          providerExecutor: "seedance",
          dispatchToken: "ops-retry-seedance-video",
        },
        status: "pending",
      });
    } finally {
      await db.close();
    }
  });

  it("recreates an audio submit outbox event when retrying a failed audio task", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedOpsFixture(db);
      await db.query(
        `
          UPDATE tasks
          SET task_type = 'episode_generate_audio',
              queue_name = 'generation-submit-audio',
              input_snapshot_json = $2::jsonb,
              target_entity_type = 'episode',
              target_entity_id = $3
          WHERE id = $1
        `,
        [
          failedTaskId,
          JSON.stringify({
            kind: "audio",
            model: "cosyvoice-v2",
            providerExecutor: "aliyun-bailian-audio",
            targetType: "episode",
            targetId: retryEpisodeId,
          }),
          retryEpisodeId,
        ],
      );
      const service = createAdminOpsService({ db });
      const retried = await service.retryTask({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-retry-audio",
        body: { taskId: failedTaskId, reason: "Audio provider recovered." },
        now: new Date("2026-05-19T10:09:30.000Z"),
      });
      const outbox = await db.query<{ payload_json: Record<string, unknown> }>(
        "SELECT payload_json FROM outbox_events WHERE event_type = 'generation.task.created'",
      );

      assert.equal(retried.status, 200);
      assert.deepEqual(outbox.rows[0]?.payload_json, {
        workflowId,
        taskId: failedTaskId,
        mediaType: "audio",
        modelCode: "cosyvoice-v2",
        queueName: "generation-submit-audio",
        targetType: "episode",
        targetId: retryEpisodeId,
        providerExecutor: "aliyun-bailian-audio",
        dispatchToken: "ops-retry-audio",
      });
    } finally {
      await db.close();
    }
  });

  it("resumes provider polling through outbox without resubmitting the generation", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedOpsFixture(db);
      await db.query(
        `
          UPDATE tasks
          SET task_type = 'episode_generate_video',
              queue_name = 'generation-submit-video',
              input_snapshot_json = '{"kind":"video","model":"seedance-i2v-pro","providerExecutor":"seedance","requestedAt":"2026-05-19T06:00:00.000Z","timeoutAt":"2026-05-19T09:00:00.000Z"}'::jsonb
          WHERE id = $1
        `,
        [unknownTaskId],
      );
      await db.query(
        `
          UPDATE provider_requests
          SET next_poll_at = '2026-05-19T09:00:00.000Z',
              poll_deadline_at = '2026-05-19T09:00:00.000Z',
              poll_sequence = 17
          WHERE id = $1
        `,
        [providerRequestId],
      );
      const oldPollEvent = await appendGenerationTaskPollRequestedOutboxEvent(db, {
        userId: creatorUserId,
        workflowId,
        taskId: unknownTaskId,
        attemptId,
        kind: "video",
        modelCode: "seedance-i2v-pro",
        providerExecutor: "seedance",
        pollAttempt: 1,
        availableAt: new Date("2026-05-19T09:00:00.000Z"),
      });
      await db.query("UPDATE outbox_events SET status = 'failed' WHERE id = $1", [oldPollEvent?.id]);
      const service = createAdminOpsService({ db });

      const recovered = await service.recoverTask({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-resume-provider-poll",
        body: {
          taskId: unknownTaskId,
          action: "resume_provider_poll",
          reason: "The external request still exists; resume status synchronization.",
        },
        now: new Date("2026-05-19T10:08:00.000Z"),
      });
      const replay = await service.recoverTask({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-resume-provider-poll",
        body: {
          taskId: unknownTaskId,
          action: "resume_provider_poll",
          reason: "The external request still exists; resume status synchronization.",
        },
        now: new Date("2026-05-19T10:09:00.000Z"),
      });
      const task = await db.query<{
        status: string;
        input_snapshot_json: Record<string, unknown>;
      }>(
        "SELECT status, input_snapshot_json FROM tasks WHERE id = $1",
        [unknownTaskId],
      );
      const provider = await db.query<{
        next_poll_at: Date | string | null;
        poll_deadline_at: Date | string | null;
        poll_sequence: number | string;
      }>(
        "SELECT next_poll_at, poll_deadline_at, poll_sequence FROM provider_requests WHERE id = $1",
        [providerRequestId],
      );
      const outbox = await db.query<{ event_type: string; payload_json: Record<string, unknown> }>(
        "SELECT event_type, payload_json FROM outbox_events ORDER BY created_at ASC",
      );

      assert.equal(recovered.status, 200);
      assert.equal(replay.status, 200);
      assert.equal(task.rows[0]?.status, "running");
      assert.equal(new Date(String(task.rows[0]?.input_snapshot_json.requestedAt)).toISOString(), "2026-05-19T10:08:00.000Z");
      assert.equal(new Date(String(task.rows[0]?.input_snapshot_json.timeoutAt)).toISOString(), "2026-05-19T13:08:00.000Z");
      assert.equal(provider.rows[0]?.next_poll_at, null);
      assert.equal(new Date(provider.rows[0]?.poll_deadline_at ?? 0).toISOString(), "2026-05-19T13:08:00.000Z");
      assert.equal(Number(provider.rows[0]?.poll_sequence), 0);
      assert.equal(outbox.rows.length, 2);
      assert.equal(outbox.rows[1]?.event_type, "generation.task.poll_requested");
      assert.equal(outbox.rows[1]?.payload_json.taskId, unknownTaskId);
      assert.equal(outbox.rows[1]?.payload_json.pollAttempt, 1);
      assert.equal(outbox.rows[1]?.payload_json.dispatchToken, "ops-resume-provider-poll");
      assert.equal(
        Number((await db.query("SELECT count(*)::int AS count FROM outbox_events WHERE event_type = 'generation.task.created'")).rows[0]?.count),
        0,
      );
    } finally {
      await db.close();
    }
  });

  it("resumes a failed image task from its existing external request", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedOpsFixture(db);
      await db.query(
        `
          UPDATE tasks
          SET task_type = 'episode_generate_image',
              status = 'failed',
              failure_code = 'generation_queue_error',
              queue_name = 'generation-submit-image',
              input_snapshot_json = '{"kind":"image","model":"global-ai-opc-nano-banana-2","providerExecutor":"gpt-image-2"}'::jsonb
          WHERE id = $1
        `,
        [unknownTaskId],
      );
      await db.query(
        "UPDATE task_attempts SET status = 'failed', failure_code = 'generation_queue_error' WHERE id = $1",
        [attemptId],
      );
      await db.query(
        "UPDATE provider_requests SET status = 'accepted', failure_code = NULL WHERE id = $1",
        [providerRequestId],
      );
      const service = createAdminOpsService({ db });

      const recovered = await service.recoverTask({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-resume-failed-image-poll",
        body: {
          taskId: unknownTaskId,
          action: "resume_provider_poll",
          reason: "Resume the accepted image request without another provider submission.",
        },
        now: new Date("2026-05-19T10:08:00.000Z"),
      });
      const task = await db.query<{ status: string }>(
        "SELECT status FROM tasks WHERE id = $1",
        [unknownTaskId],
      );
      const attempt = await db.query<{ status: string }>(
        "SELECT status FROM task_attempts WHERE id = $1",
        [attemptId],
      );
      const outbox = await db.query<{ event_type: string; payload_json: Record<string, unknown> }>(
        "SELECT event_type, payload_json FROM outbox_events ORDER BY created_at ASC",
      );

      assert.equal(recovered.status, 200);
      assert.equal(task.rows[0]?.status, "running");
      assert.equal(attempt.rows[0]?.status, "running");
      assert.equal(outbox.rows.length, 1);
      assert.equal(outbox.rows[0]?.event_type, "generation.task.poll_requested");
      assert.equal(outbox.rows[0]?.payload_json.taskId, unknownTaskId);
      assert.equal(outbox.rows[0]?.payload_json.providerExecutor, "gpt-image-2");
    } finally {
      await db.close();
    }
  });

  it("rebuilds finalization only from a verified succeeded provider request", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedOpsFixture(db);
      await db.query(
        `
          UPDATE tasks
          SET task_type = 'episode_generate_video',
              input_snapshot_json = '{"kind":"video","model":"seedance-i2v-pro","providerExecutor":"seedance"}'::jsonb
          WHERE id = $1
        `,
        [unknownTaskId],
      );
      const service = createAdminOpsService({ db });
      const rejected = await service.recoverTask({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-rebuild-before-success",
        body: {
          taskId: unknownTaskId,
          action: "rebuild_finalize",
          reason: "Attempt rebuild before provider success.",
        },
        now: new Date("2026-05-19T10:08:00.000Z"),
      });
      await db.query(
        "UPDATE provider_requests SET status = 'succeeded', failure_code = NULL WHERE id = $1",
        [providerRequestId],
      );
      await db.query(
        "UPDATE tasks SET status = 'failed', failure_code = 'generation_queue_error' WHERE id = $1",
        [unknownTaskId],
      );
      await db.query(
        "UPDATE workflows SET status = 'failed', failure_code = 'generation_queue_error', finished_at = $2 WHERE id = $1",
        [workflowId, new Date("2026-05-19T10:08:30.000Z")],
      );
      await db.query(
        "UPDATE task_attempts SET status = 'failed', failure_code = 'generation_queue_error', finished_at = $2 WHERE id = $1",
        [attemptId, new Date("2026-05-19T10:08:30.000Z")],
      );
      const recovered = await service.recoverTask({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-rebuild-after-success",
        body: {
          taskId: unknownTaskId,
          action: "rebuild_finalize",
          reason: "Provider succeeded but local finalization is missing.",
        },
        now: new Date("2026-05-19T10:09:00.000Z"),
      });
      const outbox = await db.query<{ event_type: string }>(
        "SELECT event_type FROM outbox_events ORDER BY created_at ASC",
      );

      assert.equal(rejected.status, 409);
      assert.deepEqual(rejected.body, { error: "task_recovery_not_allowed" });
      assert.equal(recovered.status, 200);
      const recoveredState = await db.query<{
        task_status: string;
        task_failure_code: string | null;
        attempt_status: string;
        attempt_failure_code: string | null;
        attempt_finished_at: Date | string | null;
        workflow_status: string;
        workflow_failure_code: string | null;
        workflow_finished_at: Date | string | null;
      }>(
        `
          SELECT task.status AS task_status,
                 task.failure_code AS task_failure_code,
                 attempt.status AS attempt_status,
                 attempt.failure_code AS attempt_failure_code,
                 attempt.finished_at AS attempt_finished_at,
                 workflow.status AS workflow_status,
                 workflow.failure_code AS workflow_failure_code,
                 workflow.finished_at AS workflow_finished_at
          FROM tasks task
          JOIN task_attempts attempt ON attempt.id = task.current_attempt_id
          JOIN workflows workflow ON workflow.id = task.workflow_id
          WHERE task.id = $1
        `,
        [unknownTaskId],
      );
      assert.deepEqual(recoveredState.rows[0], {
        task_status: "running",
        task_failure_code: null,
        attempt_status: "running",
        attempt_failure_code: null,
        attempt_finished_at: null,
        workflow_status: "running",
        workflow_failure_code: null,
        workflow_finished_at: null,
      });
      assert.equal(outbox.rows.length, 1);
      assert.equal(outbox.rows[0]?.event_type, "generation.task.finalize_requested");
    } finally {
      await db.close();
    }
  });

  it("queues only finalize work when retrying provider output persistence", async () => {
    const db = await createMigratedTestDb();

    try {
      const { adminSession } = await seedOpsFixture(db);
      await db.query(
        `
          UPDATE tasks
          SET task_type = 'episode_generate_video',
              status = 'manual_review_required',
              failure_code = 'provider_output_persist_failed',
              input_snapshot_json = $2::jsonb,
              target_entity_type = 'episode',
              target_entity_id = $3
          WHERE id = $1
        `,
        [
          failedTaskId,
          JSON.stringify({
            kind: "video",
            model: "seedance-i2v-pro",
            providerExecutor: "seedance",
          }),
          retryEpisodeId,
        ],
      );
      await db.query(
        `
          INSERT INTO ai_generation_task_snapshots (
        id,
        user_id,
        project_id,
        episode_id,
        target_type,
        target_id,
        workflow_id,
        task_id,
        model_code,
        media_type,
        task_mode,
        status,
        progress_stage,
        failure_json,
        credit_status,
        submitted_at
      )
          VALUES ('96000000-0000-4000-8000-000000000001', $4, NULL, NULL, 'episode', $1, $2, $3, 'seedance-i2v-pro', 'video', 'video.image_to_video', 'manual_review_required', 'manual_review_required', '{"failureCode":"provider_output_persist_failed","providerExecutor":"seedance","storageBucket":"creator-test","storageObjectKey":"generations/task/video.mp4"}'::jsonb, 'manual_review_required', '2026-05-19T10:09:00.000Z')
        `,
    [retryEpisodeId,
      workflowId,
      failedTaskId,
      creatorUserId],
      );
      const service = createAdminOpsService({ db });

      const missingReason = await service.retryPersistAsset({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-retry-persist-missing-reason",
        body: {
          taskId: failedTaskId,
          reason: " ",
        },
        now: new Date("2026-05-19T10:10:00.000Z"),
      });
      const retried = await service.retryPersistAsset({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-retry-persist-asset",
        body: {
          taskId: failedTaskId,
          reason: "Uploaded object exists; retry DB asset binding.",
        },
        now: new Date("2026-05-19T10:11:00.000Z"),
      });
      const replay = await service.retryPersistAsset({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-retry-persist-asset",
        body: {
          taskId: failedTaskId,
          reason: "Uploaded object exists; retry DB asset binding.",
        },
        now: new Date("2026-05-19T10:12:00.000Z"),
      });
      const outbox = await db.query<{
        event_type: string;
        payload_json: {
          workflowId: string;
          taskId: string;
          mediaType: string;
          modelCode: string;
          providerExecutor: string;
          artifactKind: string;
          artifactStage: string;
          finalizeMode: string;
          storageBucket: string;
        };
        status: string;
      }>(
        `
          SELECT event_type, payload_json, status
          FROM outbox_events
          ORDER BY created_at ASC
        `,
      );
      const audit = await db.query<{ event_type: string; reason: string | null }>(
        "SELECT event_type, reason FROM audit_events ORDER BY created_at ASC",
      );

      assert.equal(missingReason.status, 400);
      assert.deepEqual(missingReason.body, { error: "reason_required" });
      assert.equal(retried.status, 200);
      assert.equal(retried.body.task.status, "manual_review_required");
      assert.equal(replay.status, 200);
      assert.equal(outbox.rows.length, 1);
      assert.deepEqual(outbox.rows[0], {
        event_type: "generation.task.finalize_requested",
        payload_json: {
          workflowId,
          taskId: failedTaskId,
          mediaType: "video",
          modelCode: "seedance-i2v-pro",
          providerExecutor: "seedance",
          artifactKind: "video",
          storageBucket: "creator-test",
          finalizeMode: "retry_persist_asset",
          artifactStage: "persist",
        },
        status: "pending",
      });
      assert.deepEqual(audit.rows, [
        {
          event_type: "ops.task_persist_asset_retry_requested",
          reason: "Uploaded object exists; retry DB asset binding.",
        },
      ]);
    } finally {
      await db.close();
    }
  });

  it("lists payment risks and repairs paid orders that have not granted credits", async () => {
    const db = await createMigratedTestDb();

    try {
      const { adminSession } = await seedOpsFixture(db);
      await seedPaymentOpsFixture(db);
      const service = createAdminOpsService({ db });

      const listed = await service.listItems({
        user: { actor: adminOpsActor() },
        now: new Date("2026-05-19T11:00:00.000Z"),
      });
      const missingRiskReason = await service.markPaymentRiskReviewed({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-risk-missing-reason",
        body: {
          riskEventId: paymentRiskEventId,
          reason: " ",
        },
        now: new Date("2026-05-19T11:01:00.000Z"),
      });
      const reviewedRisk = await service.markPaymentRiskReviewed({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-risk-reviewed",
        body: {
          riskEventId: paymentRiskEventId,
          reason: "Provider notification was manually matched to finance report.",
        },
        now: new Date("2026-05-19T11:02:00.000Z"),
      });
      const missingRepairReason = await service.repairPaidWithoutCredit({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-repair-missing-reason",
        body: {
          orderId: paidOrderId,
          reason: "",
        },
        now: new Date("2026-05-19T11:03:00.000Z"),
      });
      const repaired = await service.repairPaidWithoutCredit({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-repair-paid-without-credit",
        body: {
          orderId: paidOrderId,
          reason: "Order paid but credit grant consumer had not run.",
        },
        now: new Date("2026-05-19T11:04:00.000Z"),
      });
      const replay = await service.repairPaidWithoutCredit({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-repair-paid-without-credit",
        body: {
          orderId: paidOrderId,
          reason: "Order paid but credit grant consumer had not run.",
        },
        now: new Date("2026-05-19T11:05:00.000Z"),
      });
      const conflict = await service.repairPaidWithoutCredit({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-repair-paid-without-credit",
        body: {
          orderId: paidOrderId,
          reason: "Different repair reason.",
        },
        now: new Date("2026-05-19T11:06:00.000Z"),
      });

      const user = await db.query<{
        credit_balance_cached: number;
      }>("SELECT credit_balance_cached FROM users WHERE id = $1", [adminUserId]);
      const order = await db.query<{
        credit_grant_ledger_entry_id: string | null;
      }>("SELECT credit_grant_ledger_entry_id FROM billing_orders WHERE id = $1", [
        paidOrderId,
      ]);
      const audit = await db.query<{ event_type: string; reason: string | null }>(
        "SELECT event_type, reason FROM audit_events ORDER BY created_at ASC",
      );

      assert.equal(listed.status, 200);
      assert.deepEqual(
        listed.body.paymentRisks.map((risk) => ({
          id: risk.id,
          riskType: risk.riskType,
          status: risk.status,
        })),
        [
          {
            id: paymentRiskEventId,
            riskType: "amount_mismatch",
            status: "open",
          },
        ],
      );
      assert.deepEqual(
        listed.body.paymentIssues.map((issue) => ({
          orderId: issue.orderId,
          issueType: issue.issueType,
        })),
        [
          {
            orderId: paidOrderId,
            issueType: "paid_without_credit",
          },
        ],
      );
      assert.equal(missingRiskReason.status, 400);
      assert.deepEqual(missingRiskReason.body, { error: "reason_required" });
      assert.equal(reviewedRisk.status, 200);
      assert.equal(reviewedRisk.body.risk.status, "reviewed");
      assert.equal(missingRepairReason.status, 400);
      assert.deepEqual(missingRepairReason.body, { error: "reason_required" });
      assert.equal(repaired.status, 200);
      assert.equal(repaired.body.issue.status, "resolved");
      assert.equal(repaired.body.creditGrant.amount, 120);
      assert.equal(replay.status, 200);
      assert.equal(replay.body.creditGrant.id, repaired.body.creditGrant.id);
      assert.equal(conflict.status, 409);
      assert.deepEqual(conflict.body, { error: "idempotency_conflict" });
      assert.equal(user.rows[0]?.credit_balance_cached, 120);
      assert.ok(order.rows[0]?.credit_grant_ledger_entry_id);
      assert.deepEqual(audit.rows, [
        {
          event_type: "ops.payment_risk_reviewed",
          reason: "Provider notification was manually matched to finance report.",
        },
        {
          event_type: "ops.payment_paid_without_credit_repaired",
          reason: "Order paid but credit grant consumer had not run.",
        },
      ]);
    } finally {
      await db.close();
    }
  });

  it("does not list or repair membership orders through paid-without-credit ops", async () => {
    const db = await createMigratedTestDb();

    try {
      const { adminSession } = await seedOpsFixture(db);
      await seedMembershipPaymentOpsFixture(db);
      const service = createAdminOpsService({ db });

      const listed = await service.listItems({
        user: { actor: adminOpsActor() },
        now: new Date("2026-05-19T11:10:00.000Z"),
      });
      const repaired = await service.repairPaidWithoutCredit({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-repair-membership-paid-without-credit",
        body: {
          orderId: membershipPaidOrderId,
          reason: "Membership orders are not repaired by legacy credit grants.",
        },
        now: new Date("2026-05-19T11:11:00.000Z"),
      });
      const ledgerCount = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM credit_ledger_entries WHERE source_type = 'payment_order' AND source_id = $1",
        [membershipPaidOrderId],
      );
      const order = await db.query<{ credit_grant_ledger_entry_id: string | null }>(
        "SELECT credit_grant_ledger_entry_id FROM billing_orders WHERE id = $1",
        [membershipPaidOrderId],
      );

      assert.equal(listed.status, 200);
      assert.deepEqual(listed.body.paymentIssues, []);
      assert.equal(repaired.status, 404);
      assert.deepEqual(repaired.body, { error: "payment_issue_not_found" });
      assert.equal(ledgerCount.rows[0]?.count, 0);
      assert.equal(order.rows[0]?.credit_grant_ledger_entry_id, null);
    } finally {
      await db.close();
    }
  });

  it("does not repair a paid credit order unless the payment intent and provider event succeeded", async () => {
    const db = await createMigratedTestDb();

    try {
      const { adminSession } = await seedOpsFixture(db);
      await seedFailedPaymentMarkedPaidOpsFixture(db);
      const service = createAdminOpsService({ db });

      const listed = await service.listItems({
        user: { actor: adminOpsActor() },
        now: new Date("2026-05-19T11:20:00.000Z"),
      });
      const repaired = await service.repairPaidWithoutCredit({
        user: { actor: adminOpsActor() },
        idempotencyKey: "ops-repair-failed-payment-marked-paid-safety",
        body: {
          orderId: failedPaidOrderId,
          reason: "Do not repair failed payment callbacks.",
        },
        now: new Date("2026-05-19T11:21:00.000Z"),
      });

      const ledgerCount = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM credit_ledger_entries WHERE source_type = 'payment_order' AND source_id = $1",
        [failedPaidOrderId],
      );
      const order = await db.query<{ credit_grant_ledger_entry_id: string | null }>(
        "SELECT credit_grant_ledger_entry_id FROM billing_orders WHERE id = $1",
        [failedPaidOrderId],
      );

      assert.equal(listed.status, 200);
      assert.deepEqual(listed.body.paymentIssues, []);
      assert.equal(repaired.status, 409);
      assert.deepEqual(repaired.body, { error: "payment_issue_not_repairable" });
      assert.equal(ledgerCount.rows[0]?.count, 0);
      assert.equal(order.rows[0]?.credit_grant_ledger_entry_id, null);
    } finally {
      await db.close();
    }
  });
});

async function seedOpsFixture(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES
        ($1, '13800138001', 'active'),
        ($2, '13800138000', 'active')
    `,
    [adminUserId, creatorUserId],
  );

  await db.query(
    "UPDATE users SET credit_reserved_cached = 10 WHERE id = $1",
    [creatorUserId],
  );


  const adminSession = await seedSession(db, adminUserId, "admin-ops-session");
  const creatorSession = await seedSession(db, creatorUserId, "creator-ops-session");
  await seedWorkflowAndTasks(db);

  return { adminSession, creatorSession };
}

async function seedSession(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  userId: string,
  token: string,
) {
  const session = await createAuthSession({
    userId,
    token,
    now: new Date("2026-05-19T09:00:00.000Z"),
  });
  await db.query(
    `
      INSERT INTO auth_sessions (
        id,
        user_id,
        status,
        session_token_hash,
        session_token_hash_version,
        expires_at,
        last_seen_at,
        revoked_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      session.session.id,
      session.session.userId,
      session.session.status,
      session.session.sessionTokenHash,
      session.session.sessionTokenHashVersion,
      session.session.expiresAt,
      session.session.lastSeenAt,
      session.session.revokedAt,
      new Date("2026-05-19T09:00:00.000Z"),
    ],
  );
  return session;
}

async function seedWorkflowAndTasks(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO workflows (
        id,
        project_id,
        workflow_type,
        status,
        input_snapshot_json,
        created_by_user_id
      )
      VALUES ($1, NULL, 'shot.image.generate', 'result_unknown', '{}'::jsonb, $2)
    `,
    [workflowId,
      creatorUserId],
  );
  await db.query(
    `
      INSERT INTO tasks (
        id,
        project_id,
        workflow_id,
        task_type,
        status,
        queue_name,
        input_snapshot_json,
        target_entity_type,
        target_entity_id,
        max_attempts,
        attempt_count,
        current_attempt_id,
        failure_code
      )
      VALUES
        ($1, NULL, $3, 'generate_shot_image', 'result_unknown', 'creator', '{}'::jsonb, 'shot', $1, 1, 1, NULL, 'lease_expired_after_external_start'),
        ($2, NULL, $3, 'generate_shot_video', 'failed', 'creator', '{}'::jsonb, 'shot', $2, 2, 1, NULL, 'provider_timeout')
    `,
    [unknownTaskId, failedTaskId, workflowId],
  );
  await db.query(
    `
      INSERT INTO task_attempts (
        id,
        project_id,
        workflow_id,
        task_id,
        attempt_number,
        status,
        failure_code
      )
      VALUES ($1, NULL, $2, $3, 1, 'result_unknown', 'lease_expired_after_external_start')
    `,
    [attemptId,
      workflowId,
      unknownTaskId],
  );
  await db.query(
    "UPDATE tasks SET current_attempt_id = $2 WHERE id = $1",
    [unknownTaskId, attemptId],
  );
  await db.query(
    `
      INSERT INTO provider_requests (
        id,
        workflow_id,
        task_id,
        attempt_id,
        provider_name,
        provider_operation,
        request_key,
        request_hash,
        payload_ref,
        payload_hash,
        payload_redacted_json,
        status,
        external_submission_started_at,
        external_request_id,
        failure_code
      )
      VALUES ($1, $2, $3, $4, 'mock-image', 'shot.image.generate', 'unknown-task', 'request-hash', 'payloads/unknown-task.json', 'payload-hash', '{}'::jsonb, 'result_unknown', '2026-05-19T09:30:00.000Z', 'external-unknown', 'lease_expired_after_external_start')
    `,
    [providerRequestId,
      workflowId,
      unknownTaskId,
      attemptId],
  );
  await db.query(
    `
      INSERT INTO credit_reservations (
        id,
        user_id,
        project_id,
        workflow_id,
        task_id,
        amount_total,
        amount_reserved,
        amount_consumed,
        amount_released,
        status,
        source_type,
        source_id,
        reason,
        metadata_json,
        created_by_user_id
      )
      VALUES ($1, $4, NULL, $2, $3, 10, 10, 0, 0, 'active', 'task', $3, 'test reservation', '{}'::jsonb, $4)
    `,
    [reservationId,
      workflowId,
      unknownTaskId,
      creatorUserId],
  );
}

async function seedPaymentOpsFixture(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO credit_packages (
        id,
        code,
        display_name,
        credits,
        amount_minor,
        currency,
        status
      )
      VALUES ($1, 'ops_120', 'Ops 120', 120, 9900, 'CNY', 'active')
    `,
    [creditPackageId],
  );
  await db.query(
    `
      INSERT INTO billing_orders (
        id,
        created_by_user_id,
        order_no,
        credit_package_id,
        package_snapshot_json,
        credits,
        amount_minor,
        currency,
        status,
        expires_at,
        paid_at,
        successful_payment_intent_id
      )
      VALUES ($1, $2, 'ORD-OPS-PAID-1', $3, '{"code":"ops_120","credits":120,"amountMinor":9900,"currency":"CNY"}'::jsonb, 120, 9900, 'CNY', 'paid', '2026-05-20T00:00:00.000Z', '2026-05-19T10:50:00.000Z', $4)
    `,
    [paidOrderId,
      adminUserId,
      creditPackageId,
      paymentIntentId],
  );
  await db.query(
    `
      INSERT INTO payment_intents (
        id,
        order_id,
        provider,
        product_mode,
        status,
        amount_minor,
        currency,
        merchant_order_no,
        provider_trade_id,
        provider_payload_hash,
        provider_safe_metadata_json,
        submitted_at,
        succeeded_at,
        expires_at
      )
      VALUES ($1, $2, 'wechat_pay', 'native_qr', 'succeeded', 9900, 'CNY', 'ORD-OPS-PAID-1', 'wx-ops-paid-1', 'payload-hash', '{}'::jsonb, '2026-05-19T10:49:00.000Z', '2026-05-19T10:50:00.000Z', '2026-05-20T00:00:00.000Z')
    `,
    [paymentIntentId,
      paidOrderId],
  );
  await db.query(
    `
      INSERT INTO payment_provider_events (
        id,
        order_id,
        payment_intent_id,
        provider,
        provider_event_dedup_key,
        merchant_order_no,
        provider_trade_id,
        event_type,
        signature_status,
        processing_status,
        raw_payload_hash,
        normalized_payload_json,
        ack_status,
        failure_code,
        received_at,
        processed_at,
        created_at,
        updated_at
      )
      VALUES ('93000000-0000-4000-8000-000000000011', $1, $2, 'wechat_pay', 'wechat-ops-paid-event-1', 'ORD-OPS-PAID-1', 'wx-ops-paid-1', 'payment_succeeded', 'verified', 'processed', 'payload-hash', '{}'::jsonb, 'sent_success', NULL, '2026-05-19T10:50:00.000Z', '2026-05-19T10:50:00.000Z', '2026-05-19T10:50:00.000Z', '2026-05-19T10:50:00.000Z')
    `,
    [paidOrderId,
      paymentIntentId],
  );
  await db.query(
    `
      INSERT INTO payment_risk_events (
        id,
        user_id,
        order_id,
        payment_intent_id,
        provider_event_id,
        risk_type,
        severity,
        decision,
        status,
        metadata_json,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, NULL, 'amount_mismatch', 'critical', 'manual_review', 'open', '{}'::jsonb, '2026-05-19T10:55:00.000Z', '2026-05-19T10:55:00.000Z')
    `,
    [paymentRiskEventId,
      adminUserId,
      paidOrderId,
      paymentIntentId],
  );
}

async function seedMembershipPaymentOpsFixture(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO membership_plans (
        id,
        code,
        display_name,
        tier,
        period_unit,
        period_count,
        amount_minor,
        gift_credits,
        seat_limit,
        status
      )
      VALUES ($1, 'ops_membership', 'Ops Membership', 'professional', 'month', 1, 19900, 10, 5, 'active')
    `,
    [membershipPlanId],
  );
  await db.query(
    `
      INSERT INTO billing_orders (
        id,
        created_by_user_id,
        order_no,
        product_type,
        membership_plan_id,
        package_snapshot_json,
        product_snapshot_json,
        credits,
        amount_minor,
        currency,
        status,
        expires_at,
        paid_at,
        successful_payment_intent_id
      )
      VALUES ($1, $2, 'ORD-OPS-MEMBERSHIP-1', 'membership_plan', $3, '{}'::jsonb, '{"code":"ops_membership","giftCredits":10,"amountMinor":19900,"currency":"CNY"}'::jsonb, 10, 19900, 'CNY', 'paid', '2026-05-20T00:00:00.000Z', '2026-05-19T10:50:00.000Z', $4)
    `,
    [membershipPaidOrderId, adminUserId, membershipPlanId, membershipPaymentIntentId],
  );
}

async function seedFailedPaymentMarkedPaidOpsFixture(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO credit_packages (
        id,
        code,
        display_name,
        credits,
        amount_minor,
        currency,
        status
      )
      VALUES ($1, 'ops_failed_120', 'Ops Failed 120', 120, 9900, 'CNY', 'active')
    `,
    [creditPackageId],
  );
  await db.query(
    `
      INSERT INTO billing_orders (
        id,
        created_by_user_id,
        order_no,
        credit_package_id,
        package_snapshot_json,
        credits,
        amount_minor,
        currency,
        status,
        expires_at,
        paid_at,
        successful_payment_intent_id
      )
      VALUES ($1, $2, 'ORD-OPS-FAILED-MARKED-PAID-1', $3, '{"code":"ops_failed_120","credits":120,"amountMinor":9900,"currency":"CNY"}'::jsonb, 120, 9900, 'CNY', 'paid', '2026-05-20T00:00:00.000Z', '2026-05-19T10:50:00.000Z', $4)
    `,
    [failedPaidOrderId,
      adminUserId,
      creditPackageId,
      failedPaymentIntentId],
  );
  await db.query(
    `
      INSERT INTO payment_intents (
        id,
        order_id,
        provider,
        product_mode,
        status,
        amount_minor,
        currency,
        merchant_order_no,
        provider_trade_id,
        provider_payload_hash,
        provider_safe_metadata_json,
        submitted_at,
        expires_at
      )
      VALUES ($1, $2, 'wechat_pay', 'native_qr', 'failed', 9900, 'CNY', 'ORD-OPS-FAILED-MARKED-PAID-1', 'wx-ops-failed-1', 'payload-hash', '{}'::jsonb, '2026-05-19T10:49:00.000Z', '2026-05-20T00:00:00.000Z')
    `,
    [failedPaymentIntentId,
      failedPaidOrderId],
  );
  await db.query(
    `
      INSERT INTO payment_provider_events (
        id,
        order_id,
        payment_intent_id,
        provider,
        provider_event_dedup_key,
        merchant_order_no,
        provider_trade_id,
        event_type,
        signature_status,
        processing_status,
        raw_payload_hash,
        normalized_payload_json,
        ack_status,
        failure_code,
        received_at,
        processed_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, 'wechat_pay', 'wechat-ops-failed-event-1', 'ORD-OPS-FAILED-MARKED-PAID-1', 'wx-ops-failed-1', 'payment_failed', 'verified', 'processed', 'payload-hash', '{}'::jsonb, 'sent_success', NULL, '2026-05-19T10:50:00.000Z', '2026-05-19T10:50:00.000Z', '2026-05-19T10:50:00.000Z', '2026-05-19T10:50:00.000Z')
    `,
    [failedPaymentProviderEventId, failedPaidOrderId, failedPaymentIntentId],
  );
}

function adminOpsActor() {
  return {
    userId: adminUserId,
    capabilities: [capabilities.opsSettle],
  };
}
