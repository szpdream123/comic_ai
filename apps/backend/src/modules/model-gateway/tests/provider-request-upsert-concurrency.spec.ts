import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  ProviderRequestConflictError,
  createOrReuseProviderRequest,
  submitProviderRequest,
} from "../provider-request.service.ts";
import { ModelError } from "../model-error.ts";

describe("provider request deterministic upsert", { concurrency: false }, () => {
  it("reuses the same request key under concurrent duplicate callers", async () => {
    const db = await createMigratedTestDb();

    try {

      const results = await Promise.all([
        createOrReuseProviderRequest(db, providerInput()),
        createOrReuseProviderRequest(db, providerInput()),
      ]);
      const count = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM provider_requests",
      );

      assert.equal(results[0]?.request.id, results[1]?.request.id);
      assert.deepEqual(
        results.map((result) => result.kind).sort(),
        ["created", "reused"],
      );
      assert.equal(count.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("returns a deterministic conflict for the same key with a different payload", async () => {
    const db = await createMigratedTestDb();

    try {
      await createOrReuseProviderRequest(db, providerInput());

      await assert.rejects(
        createOrReuseProviderRequest(db, {
          ...providerInput(),
          payloadHash: "payload-hash-2",
        }),
        ProviderRequestConflictError,
      );
    } finally {
      await db.close();
    }
  });

  it("atomically binds a prepared task request only to the durable current attempt", async () => {
    const db = await createMigratedTestDb();
    const workflowId = "40000000-0000-4000-8000-000000000401";
    const taskId = "50000000-0000-4000-8000-000000000401";
    const staleAttemptId = "61000000-0000-4000-8000-000000000401";
    const attemptId = "60000000-0000-4000-8000-000000000401";
    try {
      await db.query(`
        INSERT INTO workflows (id, workflow_type, status, input_snapshot_json)
        VALUES ('${workflowId}', 'episode_image_generation', 'running', '{}'::jsonb);
        INSERT INTO tasks (
          id, workflow_id, task_type, status, queue_name, input_snapshot_json,
          target_entity_type, target_entity_id
        ) VALUES (
          '${taskId}', '${workflowId}', 'episode_generate_image', 'running',
          'generation-submit-image', '{}'::jsonb, 'asset', '${taskId}'
        );
        INSERT INTO task_attempts (
          id, workflow_id, task_id, attempt_number, status, started_at
        ) VALUES (
          '${staleAttemptId}', '${workflowId}', '${taskId}', 1, 'failed',
          '2026-05-09T09:00:00.000Z'
        ), (
          '${attemptId}', '${workflowId}', '${taskId}', 2, 'running',
          '2026-05-09T10:00:00.000Z'
        );
        UPDATE tasks
        SET current_attempt_id = '${attemptId}', attempt_count = 2
        WHERE id = '${taskId}';
      `);
      const input = {
        ...providerInput(),
        workflowId,
        taskId,
        requestKey: "prepared-task-request-401",
      };
      await createOrReuseProviderRequest(db, { ...input, attemptId: staleAttemptId });

      let providerCalls = 0;
      const stale = await submitProviderRequest(db, {
        ...input,
        attemptId: staleAttemptId,
        adapter: {
          async submit() {
            providerCalls += 1;
            return {
              status: "succeeded" as const,
              externalRequestId: "external-request-401",
              redactedResponse: {},
            };
          },
        },
      });
      assert.equal(stale.kind, "submitted");
      assert.equal(providerCalls, 1);

      await submitProviderRequest(db, {
        ...input,
        attemptId,
        adapter: {
          async submit() {
            return {
              status: "succeeded" as const,
              externalRequestId: "external-request-401",
              redactedResponse: {},
            };
          },
        },
      });
      const request = await db.query<{ attempt_id: string | null; status: string }>(
        "SELECT attempt_id, status FROM provider_requests WHERE request_key = $1",
        [input.requestKey],
      );

      assert.deepEqual(request.rows[0], { attempt_id: staleAttemptId, status: "succeeded" });
    } finally {
      await db.close();
    }
  });

  it("submits without blocking on the durable attempt terminal state", async () => {
    const db = await createMigratedTestDb();
    const workflowId = "40000000-0000-4000-8000-000000000403";
    const taskId = "50000000-0000-4000-8000-000000000403";
    const attemptId = "60000000-0000-4000-8000-000000000403";
    try {
      await db.query(`
        INSERT INTO workflows (id, workflow_type, status, input_snapshot_json)
        VALUES ('${workflowId}', 'episode_image_generation', 'running', '{}'::jsonb);
        INSERT INTO tasks (
          id, workflow_id, task_type, status, queue_name, input_snapshot_json,
          target_entity_type, target_entity_id
        ) VALUES (
          '${taskId}', '${workflowId}', 'episode_generate_image', 'running',
          'generation-submit-image', '{}'::jsonb, 'asset', '${taskId}'
        );
        INSERT INTO task_attempts (
          id, workflow_id, task_id, attempt_number, status, started_at
        ) VALUES (
          '${attemptId}', '${workflowId}', '${taskId}', 1, 'running',
          '2026-05-09T10:00:00.000Z'
        );
        UPDATE tasks
        SET current_attempt_id = '${attemptId}', attempt_count = 1
        WHERE id = '${taskId}';
      `);
      const input = {
        ...providerInput(),
        workflowId,
        taskId,
        attemptId,
        requestKey: "terminal-current-attempt-request-403",
      };
      const prepared = await createOrReuseProviderRequest(db, input);
      await db.query(
        `
          UPDATE tasks
          SET status = 'failed', failure_code = 'lease_expired_before_provider_submission'
          WHERE id = $1
        `,
        [taskId],
      );
      await db.query(
        `
          UPDATE task_attempts
          SET status = 'failed', failure_code = 'lease_expired_before_provider_submission'
          WHERE id = $1
        `,
        [attemptId],
      );

      let providerCalls = 0;
      const result = await submitProviderRequest(db, {
        ...input,
        adapter: {
          async submit() {
            providerCalls += 1;
            return {
              status: "accepted" as const,
              externalRequestId: "external-request-403",
              redactedResponse: {},
            };
          },
        },
      });
      const request = await db.query<{
        status: string;
        external_submission_started_at: Date | string | null;
      }>(
        `
          SELECT status, external_submission_started_at
          FROM provider_requests
          WHERE id = $1
        `,
        [prepared.request.id],
      );

      assert.equal(result.kind, "submitted");
      assert.equal(providerCalls, 1);
      assert.equal(request.rows[0]?.status, "accepted");
      assert.ok(request.rows[0]?.external_submission_started_at);
    } finally {
      await db.close();
    }
  });

  it("starts a provider request while the durable current task is still queued", async () => {
    const db = await createMigratedTestDb();
    const workflowId = "40000000-0000-4000-8000-000000000406";
    const taskId = "50000000-0000-4000-8000-000000000406";
    const attemptId = "60000000-0000-4000-8000-000000000406";
    try {
      await db.query(`
        INSERT INTO workflows (id, workflow_type, status, input_snapshot_json)
        VALUES ('${workflowId}', 'episode_image_generation', 'running', '{}'::jsonb);
        INSERT INTO tasks (
          id, workflow_id, task_type, status, queue_name, input_snapshot_json,
          target_entity_type, target_entity_id
        ) VALUES (
          '${taskId}', '${workflowId}', 'episode_generate_image', 'queued',
          'generation-submit-image', '{}'::jsonb, 'asset', '${taskId}'
        );
        INSERT INTO task_attempts (
          id, workflow_id, task_id, attempt_number, status, started_at
        ) VALUES (
          '${attemptId}', '${workflowId}', '${taskId}', 1, 'created',
          '2026-05-09T10:00:00.000Z'
        );
        UPDATE tasks
        SET current_attempt_id = '${attemptId}', attempt_count = 1
        WHERE id = '${taskId}';
      `);
      const input = {
        ...providerInput(),
        workflowId,
        taskId,
        attemptId,
        requestKey: "queued-current-attempt-request-406",
      };

      const result = await submitProviderRequest(db, {
        ...input,
        adapter: {
          async submit() {
            return {
              status: "accepted" as const,
              externalRequestId: "external-request-queue-406",
              redactedResponse: {},
            };
          },
        },
      });
      const request = await db.query<{
        status: string;
        external_submission_started_at: Date | string | null;
        external_request_id: string | null;
      }>(
        `
          SELECT status, external_submission_started_at, external_request_id
          FROM provider_requests
          WHERE request_key = $1
        `,
        [input.requestKey],
      );

      assert.equal(result.kind, "submitted");
      assert.equal(result.request.externalRequestId, "external-request-queue-406");
      assert.equal(request.rows[0]?.external_request_id, "external-request-queue-406");
      assert.ok(request.rows[0]?.external_submission_started_at);
      assert.notEqual(request.rows[0]?.status, "failed");
    } finally {
      await db.close();
    }
  });

  it("binds a prepared request while the current attempt is still being activated", async () => {
    const db = await createMigratedTestDb();
    const workflowId = "40000000-0000-4000-8000-000000000405";
    const taskId = "50000000-0000-4000-8000-000000000405";
    const attemptId = "60000000-0000-4000-8000-000000000405";
    try {
      await db.query(`
        INSERT INTO workflows (id, workflow_type, status, input_snapshot_json)
        VALUES ('${workflowId}', 'episode_image_generation', 'running', '{}'::jsonb);
        INSERT INTO tasks (
          id, workflow_id, task_type, status, queue_name, input_snapshot_json,
          target_entity_type, target_entity_id, attempt_count
        ) VALUES (
          '${taskId}', '${workflowId}', 'episode_generate_image', 'running',
          'generation-submit-image', '{}'::jsonb, 'asset', '${taskId}', 1
        );
        INSERT INTO task_attempts (
          id, workflow_id, task_id, attempt_number, status, started_at
        ) VALUES (
          '${attemptId}', '${workflowId}', '${taskId}', 1, 'created',
          '2026-05-09T10:00:00.000Z'
        );
        UPDATE tasks SET current_attempt_id = '${attemptId}' WHERE id = '${taskId}';
      `);
      const input = {
        ...providerInput(),
        workflowId,
        taskId,
        attemptId,
        requestKey: "activation-window-request-405",
      };
      await createOrReuseProviderRequest(db, { ...input, attemptId: null });
      const result = await submitProviderRequest(db, {
        ...input,
        adapter: {
          async submit() {
            return {
              status: "accepted" as const,
              externalRequestId: "external-current-405",
              redactedResponse: {},
            };
          },
        },
      });
      assert.equal(result.kind, "submitted");
      assert.equal(result.request.externalRequestId, "external-current-405");
    } finally {
      await db.close();
    }
  });

  it("does not recover or reuse an externally-started request from a historical attempt", async () => {
    const db = await createMigratedTestDb();
    const workflowId = "40000000-0000-4000-8000-000000000402";
    const taskId = "50000000-0000-4000-8000-000000000402";
    const staleAttemptId = "61000000-0000-4000-8000-000000000402";
    const attemptId = "60000000-0000-4000-8000-000000000402";
    try {
      await db.query(`
        INSERT INTO workflows (id, workflow_type, status, input_snapshot_json)
        VALUES ('${workflowId}', 'episode_image_generation', 'running', '{}'::jsonb);
        INSERT INTO tasks (
          id, workflow_id, task_type, status, queue_name, input_snapshot_json,
          target_entity_type, target_entity_id
        ) VALUES (
          '${taskId}', '${workflowId}', 'episode_generate_image', 'running',
          'generation-submit-image', '{}'::jsonb, 'asset', '${taskId}'
        );
        INSERT INTO task_attempts (
          id, workflow_id, task_id, attempt_number, status, started_at
        ) VALUES (
          '${staleAttemptId}', '${workflowId}', '${taskId}', 1, 'failed',
          '2026-05-09T09:00:00.000Z'
        ), (
          '${attemptId}', '${workflowId}', '${taskId}', 2, 'running',
          '2026-05-09T10:00:00.000Z'
        );
        UPDATE tasks
        SET current_attempt_id = '${attemptId}', attempt_count = 2
        WHERE id = '${taskId}';
      `);
      const input = {
        ...providerInput(),
        workflowId,
        taskId,
        requestKey: "started-historical-task-request-402",
      };
      const prepared = await createOrReuseProviderRequest(db, {
        ...input,
        attemptId: staleAttemptId,
      });
      await db.query(
        `
          UPDATE provider_requests
          SET status = 'submitted', external_submission_started_at = $2
          WHERE id = $1
        `,
        [prepared.request.id, new Date("2026-05-09T09:01:00.000Z")],
      );

      let submitCalls = 0;
      let recoverCalls = 0;
      await assert.rejects(
        submitProviderRequest(db, {
          ...input,
          attemptId,
          adapter: {
            async submit() {
              submitCalls += 1;
              throw new Error("historical request must not be submitted again");
            },
            async recoverSubmission() {
              recoverCalls += 1;
              throw new Error("historical request recovery failed");
            },
          },
        }),
      );
      const request = await db.query<{
        attempt_id: string | null;
        status: string;
        external_submission_started_at: Date | string | null;
      }>(
        `
          SELECT attempt_id, status, external_submission_started_at
          FROM provider_requests
          WHERE id = $1
        `,
        [prepared.request.id],
      );

      assert.equal(submitCalls, 0);
      assert.equal(recoverCalls, 1);
      assert.equal(request.rows[0]?.attempt_id, staleAttemptId);
      assert.equal(request.rows[0]?.status, "submitted");
      assert.ok(request.rows[0]?.external_submission_started_at);
    } finally {
      await db.close();
    }
  });

  it("creates an attempt-scoped request after a historical provider request definitively failed", async () => {
    const db = await createMigratedTestDb();
    const workflowId = "40000000-0000-4000-8000-000000000404";
    const taskId = "50000000-0000-4000-8000-000000000404";
    const staleAttemptId = "61000000-0000-4000-8000-000000000404";
    const attemptId = "60000000-0000-4000-8000-000000000404";
    try {
      await db.query(`
        INSERT INTO workflows (id, workflow_type, status, input_snapshot_json)
        VALUES ('${workflowId}', 'episode_image_generation', 'running', '{}'::jsonb);
        INSERT INTO tasks (
          id, workflow_id, task_type, status, queue_name, input_snapshot_json,
          target_entity_type, target_entity_id
        ) VALUES (
          '${taskId}', '${workflowId}', 'episode_generate_image', 'running',
          'generation-submit-image', '{}'::jsonb, 'asset', '${taskId}'
        );
        INSERT INTO task_attempts (
          id, workflow_id, task_id, attempt_number, status, started_at
        ) VALUES (
          '${staleAttemptId}', '${workflowId}', '${taskId}', 1, 'failed',
          '2026-05-09T09:00:00.000Z'
        ), (
          '${attemptId}', '${workflowId}', '${taskId}', 2, 'running',
          '2026-05-09T10:00:00.000Z'
        );
        UPDATE tasks
        SET current_attempt_id = '${attemptId}', attempt_count = 2
        WHERE id = '${taskId}';
      `);
      const input = {
        ...providerInput(),
        workflowId,
        taskId,
        requestKey: "failed-historical-task-request-404",
      };
      const historical = await createOrReuseProviderRequest(db, {
        ...input,
        attemptId: staleAttemptId,
      });
      await db.query(
        `
          UPDATE provider_requests
          SET status = 'failed',
              failure_code = 'provider_failed',
              external_submission_started_at = $2,
              external_request_id = 'external-failed-404'
          WHERE id = $1
        `,
        [historical.request.id, new Date("2026-05-09T09:01:00.000Z")],
      );

      let submitCalls = 0;
      const result = await submitProviderRequest(db, {
        ...input,
        attemptId,
        adapter: {
          async submit() {
            submitCalls += 1;
            return {
              status: "accepted" as const,
              externalRequestId: "external-current-404",
              redactedResponse: {},
            };
          },
        },
      });
      const requests = await db.query<{
        attempt_id: string | null;
        request_key: string;
        status: string;
      }>(
        `
          SELECT attempt_id, request_key, status
          FROM provider_requests
          WHERE task_id = $1
          ORDER BY request_key
        `,
        [taskId],
      );

      assert.equal(result.kind, "submitted");
      assert.equal(submitCalls, 1);
      assert.deepEqual(requests.rows, [
        {
          attempt_id: staleAttemptId,
          request_key: input.requestKey,
          status: "failed",
        },
        {
          attempt_id: attemptId,
          request_key: `${input.requestKey}:retry:${attemptId}`,
          status: "accepted",
        },
      ]);
    } finally {
      await db.close();
    }
  });

  it("treats a SanBao invalid response as a definitive submission failure", async () => {
    const db = await createMigratedTestDb();

    try {
      await assert.rejects(
        submitProviderRequest(db, {
          ...providerInput(),
          providerName: "san-bao",
          requestKey: "san-bao-invalid-response",
          adapter: {
            async submit() {
              throw ModelError.fromUnknown("invalid response", {
                failureCode: "san_bao_invalid_response",
                mediaType: "video",
                phase: "submit",
              });
            },
          },
        }),
      );

      const result = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM provider_requests WHERE request_key = $1",
        ["san-bao-invalid-response"],
      );
      assert.equal(result.rows[0]?.status, "failed");
      assert.equal(result.rows[0]?.failure_code, "san_bao_invalid_response");
    } finally {
      await db.close();
    }
  });

  it("treats a SanBao HTTP parameter error as a definitive submission failure", async () => {
    const db = await createMigratedTestDb();

    try {
      await assert.rejects(
        submitProviderRequest(db, {
          ...providerInput(),
          providerName: "san-bao",
          requestKey: "san-bao-bad-request",
          adapter: {
            async submit() {
              throw ModelError.fromUnknown("invalid reference asset", {
                failureCode: "san_bao_bad_request",
                mediaType: "image",
                phase: "submit",
              });
            },
          },
        }),
      );

      const result = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM provider_requests WHERE request_key = $1",
        ["san-bao-bad-request"],
      );
      assert.equal(result.rows[0]?.status, "failed");
      assert.equal(result.rows[0]?.failure_code, "san_bao_bad_request");
    } finally {
      await db.close();
    }
  });
});

function providerInput() {
  return {
    projectId: null,
    providerName: "mock-image",
    providerOperation: "shot.image.generate",
    requestKey: "task-1:attempt-1",
    requestHash: "hash-1",
    payloadRef: "payloads/task-1.json",
    payloadHash: "payload-hash-1",
    redactedPayload: { prompt: "[redacted]" },
    createdByUserId: null,
    now: new Date("2026-05-09T10:00:00.000Z"),
  };
}
