import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  recordGenerationArtifactHandoff,
} from "../generation-artifact-handoff.service.ts";
import {
  handleGenerationFetchArtifactJob,
  handleGenerationPersistArtifactJob,
} from "../generation-bullmq.worker.ts";
import { loadGenerationQueueConfig } from "../generation-queue.config.ts";
import { dispatchClaimedGenerationOutboxEvents } from "../generation-outbox.dispatcher.ts";
import { persistGptImageArtifactJob } from "../gpt-image.worker.ts";

describe("generation artifact recovery", () => {
  it("uses distinct shard assignments for repeated retry-finalize outbox events", async () => {
    const taskId = "50000000-0000-4000-8000-000000000035";
    const eventIds = [
      "90000000-0000-4000-8000-000000000035",
      "90000000-0000-4000-8000-000000000036",
    ];
    const reservedInputs: Array<Record<string, unknown>> = [];

    for (const eventId of eventIds) {
      const event = generationFinalizeOutboxEvent(eventId, taskId);
      await dispatchClaimedGenerationOutboxEvents({
        async query() {
          return { rows: [{ input_snapshot_json: {} }] };
        },
      } as never, {
        now: new Date("2026-07-24T12:00:00.000Z"),
        events: [event],
        config: loadGenerationQueueConfig({ GENERATION_QUEUE_SHARDING_ENABLED: "true" }),
        publisher: { async add() {} },
        shardStore: {
          async reserve(_db, input) {
            reservedInputs.push(input as unknown as Record<string, unknown>);
            return {
              ...input,
              routeCode: "rfinalize",
              shardId: "70000000-0000-4000-8000-000000000005",
              shardNo: 0,
              queueName: "generation-image-fetch-rfinalize-000",
              capacity: 600,
              rateLimitMax: 5,
              rateLimitDurationMs: 1000,
              admittedCount: 1,
              shardState: "accepting" as const,
              assignmentStatus: "publishing" as const,
            };
          },
          async markPublished() {
            return null;
          },
        },
      }, {
        async publish() {},
        async markProcessed() {
          return event;
        },
      });
    }

    assert.deepEqual(
      reservedInputs.map((input) => input.assignmentKey),
      eventIds.map((eventId) => `generation.task.finalize_requested:${taskId}:fetch:${eventId}`),
    );
  });

  it("uses distinct persist jobs for repeated retry-finalize recovery", async () => {
    const jobIds: string[] = [];
    const config = loadGenerationQueueConfig({});
    for (const outboxEventId of ["outbox-1", "outbox-2"]) {
      await handleGenerationFetchArtifactJob({
        job: {
          data: {
            outboxEventId,
            taskId: "task-retry-finalize-1",
            workflowId: "workflow-1",
            mediaType: "image",
            modelCode: "gpt-image-2-cn",
            providerExecutor: "gpt-image-2",
            artifactKind: "image",
            artifactStage: "fetch",
            finalizeMode: "retry_finalize",
          },
        },
        config,
        publisher: {
          async add(_queueName, _name, _data, options) {
            jobIds.push(String(options.jobId));
          },
        },
        processors: {
          async submitGptImage() { return { status: "skipped" as const }; },
          async pollGptImage() { return { status: "skipped" as const }; },
          async fetchGptImageArtifact() { return { status: "succeeded" as const }; },
        },
        now: new Date("2026-07-24T12:00:00.000Z"),
      });
    }

    assert.deepEqual(jobIds, [
      "generation.image.persist__task-retry-finalize-1__outbox-1",
      "generation.image.persist__task-retry-finalize-1__outbox-2",
    ]);
  });

  it("preserves the outbox event across rate-limit finalize retries", async () => {
    let retryData: Record<string, unknown> | undefined;
    const result = await handleGenerationFetchArtifactJob({
      job: {
        data: {
          outboxEventId: "outbox-rate-limit-1",
          taskId: "task-rate-limit-1",
          workflowId: "workflow-rate-limit-1",
          mediaType: "image",
          modelCode: "gpt-image-2-cn",
          providerExecutor: "gpt-image-2",
          artifactKind: "image",
          artifactStage: "fetch",
          finalizeMode: "retry_finalize",
        },
      },
      config: loadGenerationQueueConfig({}),
      publisher: {
        async add(_queueName, _name, data) {
          retryData = data as Record<string, unknown>;
        },
      },
      processors: {
        async submitGptImage() { return { status: "skipped" as const }; },
        async pollGptImage() { return { status: "skipped" as const }; },
        async fetchGptImageArtifact() { return { status: "succeeded" as const }; },
      },
      finalizeRateLimiter: {
        async acquireFinalizePermit() {
          return { granted: false, retryAfterMs: 1000, reason: "storage_busy" };
        },
      },
      now: new Date("2026-07-24T12:00:00.000Z"),
    });

    assert.deepEqual(result, {
      status: "rate_limited",
      failureCode: "storage_busy",
      queuedPersist: false,
    });
    assert.equal(retryData?.outboxEventId, "outbox-rate-limit-1");
    assert.equal(retryData?.finalizeMode, "retry_finalize");
  });

  it("preserves the outbox event when a persist retry is rate-limited", async () => {
    let retryData: Record<string, unknown> | undefined;
    const result = await handleGenerationPersistArtifactJob({
      job: {
        data: {
          outboxEventId: "outbox-persist-rate-limit-1",
          taskId: "task-persist-rate-limit-1",
          workflowId: "workflow-persist-rate-limit-1",
          mediaType: "image",
          modelCode: "gpt-image-2-cn",
          providerExecutor: "gpt-image-2",
          artifactKind: "image",
          artifactStage: "persist",
          finalizeMode: "retry_persist_asset",
        },
      },
      config: loadGenerationQueueConfig({}),
      publisher: {
        async add(_queueName, _name, data) {
          retryData = data as Record<string, unknown>;
        },
      },
      processors: {
        async submitGptImage() { return { status: "skipped" as const }; },
        async pollGptImage() { return { status: "skipped" as const }; },
        async persistGptImageArtifact() { return { status: "succeeded" as const }; },
      },
      finalizeRateLimiter: {
        async acquireFinalizePermit() {
          return { granted: false, retryAfterMs: 1000, reason: "storage_busy" };
        },
      },
      now: new Date("2026-07-24T12:00:00.000Z"),
    });

    assert.deepEqual(result, { status: "rate_limited", failureCode: "storage_busy" });
    assert.equal(retryData?.outboxEventId, "outbox-persist-rate-limit-1");
    assert.equal(retryData?.finalizeMode, "retry_persist_asset");
  });

  it("records a durable artifact handoff without reopening a failed task snapshot", async () => {
    let updateSql = "";
    await recordGenerationArtifactHandoff({
      async query(sql) {
        updateSql = sql;
        return { rows: [{ task_id: "task-1" }] };
      },
    } as never, {
      taskId: "task-1",
      mediaType: "image",
      attemptId: "attempt-1",
      storageObjectId: "storage-1",
      storageObjectKey: "generation/task-1.png",
      contentType: "image/png",
      now: new Date("2026-07-24T12:00:00.000Z"),
    });

    assert.match(updateSql, /SET status = CASE WHEN status IN \('queued', 'running'\) THEN 'running' ELSE status END/);
    assert.match(updateSql, /progress_stage = CASE WHEN status IN \('queued', 'running'\) THEN 'artifact_fetched' ELSE progress_stage END/);
    assert.match(updateSql, /status IN \('queued', 'running', 'failed', 'result_unknown', 'manual_review_required', 'succeeded'\)/);
  });

  it("continues persist recovery after a generation queue failure", async () => {
    let attemptReopened = false;
    const result = await persistGptImageArtifactJob({
      async query(sql) {
        if (sql.includes("FROM tasks t") && sql.includes("LEFT JOIN provider_requests pr")) {
          const acceptsQueueFailure = sql.includes("'generation_queue_error'");
          return {
            rows: acceptsQueueFailure
              ? [{
                  task_id: "task-1",
                  workflow_id: "workflow-1",
                  attempt_id: "attempt-1",
                  user_id: "user-1",
                  project_id: null,
                  input_snapshot_json: {},
                  created_by_user_id: "user-1",
                  provider_request_id: "provider-request-1",
                  external_request_id: "external-request-1",
                  provider_response_redacted_json: {},
                  reservation_id: null,
                  amount_reserved: null,
                }]
              : [],
          };
        }
        if (sql.includes("provider_status_json->'artifactHandoff'")) {
          return {
            rows: [{
              handoff: {
                mediaType: "image",
                attemptId: "attempt-1",
                storageObjectId: "storage-1",
                storageObjectKey: "generation/task-1.png",
                contentType: "image/png",
                fetchedAt: "2026-07-24T11:59:00.000Z",
              },
            }],
          };
        }
        if (sql.includes("SELECT true AS available")) {
          return { rows: [{ available: true }] };
        }
        if (sql.includes("SELECT failure_json")) {
          return { rows: [{ failure_json: null }] };
        }
        if (sql.includes("SELECT *") && sql.includes("FROM storage_objects")) {
          return {
            rows: [{
              id: "storage-1",
              project_id: null,
              canvas_project_id: null,
              bucket: "creator-test",
              object_key: "generation/task-1.png",
              content_type: "image/png",
              size_bytes: 8,
              checksum: null,
              provider: "creator-dev",
              status: "available",
              etag: null,
              version_id: null,
              last_verified_at: null,
              deleted_at: null,
              metadata_json: {},
              created_by_user_id: "user-1",
              created_at: new Date("2026-07-24T11:59:00.000Z"),
            }],
          };
        }
        if (sql.includes("UPDATE task_attempts attempt")) {
          attemptReopened = true;
          return { rows: [{ id: "attempt-1" }] };
        }
        if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
          return { rows: [] };
        }
        if (sql.includes("FOR UPDATE OF task, attempt")) {
          return {
            rows: attemptReopened
              ? [{ task_status: "manual_review_required", attempt_status: "manual_review_required" }]
              : [],
          };
        }
        if (sql.includes("UPDATE ai_generation_task_snapshots")) {
          return { rows: [] };
        }
        if (sql.includes("UPDATE task_attempts") && sql.includes("SET status = $3")) {
          return { rows: [{ id: "attempt-1" }] };
        }
        if (sql.includes("UPDATE tasks") && sql.includes("SET status = $2")) {
          return { rows: [{ id: "task-1" }] };
        }
        if (sql.includes("SELECT status FROM tasks WHERE workflow_id")) {
          return { rows: [{ status: "succeeded" }] };
        }
        if (sql.includes("UPDATE workflows")) {
          return { rows: [] };
        }
        throw new Error(`unexpected_query:${sql}`);
      },
    } as never, {
      taskId: "task-1",
      runtime: { publicBaseUrl: "https://storage.example.test" } as never,
      env: {},
      now: new Date("2026-07-24T12:00:00.000Z"),
    });

    assert.equal(attemptReopened, true);
    assert.deepEqual(result, { status: "succeeded" });
  });
});

function generationFinalizeOutboxEvent(id: string, taskId: string) {
  const now = new Date("2026-07-24T11:59:00.000Z");
  return {
    id,
    eventType: "generation.task.finalize_requested",
    payload: {
      workflowId: `workflow-${taskId}`,
      taskId,
      mediaType: "image",
      modelCode: "gpt-image-2-cn",
      providerExecutor: "gpt-image-2",
      artifactKind: "image",
      artifactStage: "fetch",
      finalizeMode: "retry_finalize",
    },
    status: "processing" as const,
    availableAt: now,
    processedAt: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };
}
