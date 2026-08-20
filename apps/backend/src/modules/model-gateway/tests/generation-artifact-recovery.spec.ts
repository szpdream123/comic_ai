import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  findGenerationArtifactHandoff,
  recordGenerationArtifactHandoff,
} from "../generation-artifact-handoff.service.ts";
import {
  handleGenerationFetchArtifactJob,
  handleGenerationFinalizeArtifactJob,
  handleGenerationPersistArtifactJob,
} from "../generation-bullmq.worker.ts";
import { loadGenerationQueueConfig } from "../generation-queue.config.ts";
import { GENERATION_ARTIFACT_FETCH_NOT_READY } from "../generation-skipped-coordinator.ts";
import { dispatchClaimedGenerationOutboxEvents } from "../generation-outbox.dispatcher.ts";
import {
  handleGptImageArtifactQueueExhaustion,
} from "../gpt-image-artifact-recovery.service.ts";
import {
  fetchAudioGenerationArtifactJob,
  finalizeAudioGenerationArtifactJob,
  persistAudioGenerationArtifactJob,
} from "../audio-generation.worker.ts";
import {
  fetchGptImageArtifactJob,
  finalizeGptImageArtifactJob,
  persistGptImageArtifactJob,
} from "../gpt-image.worker.ts";
import {
  fetchSeedanceVideoArtifactJob,
  finalizeSeedanceVideoArtifactJob,
  persistSeedanceVideoArtifactJob,
} from "../seedance-video.worker.ts";

function artifactStageTaskDb(
  taskStatus: string,
  failureCode: string | null = null,
  resolveOtherRows: (sql: string) => Record<string, unknown>[] = () => [],
) {
  return {
    async query(sql: string) {
      if (sql.includes("t.status AS task_status") && sql.includes("t.failure_code")) {
        return { rows: [{ task_status: taskStatus, failure_code: failureCode }] };
      }
      return { rows: resolveOtherRows(sql) };
    },
  } as never;
}

describe("generation artifact recovery", () => {
  it("binds every artifact provider result to the durable current attempt", async () => {
    const [videoSource, audioSource, imageSource, imageRecoverySource] = await Promise.all([
      readFile(new URL("../seedance-video.worker.ts", import.meta.url), "utf8"),
      readFile(new URL("../audio-generation.worker.ts", import.meta.url), "utf8"),
      readFile(new URL("../gpt-image.worker.ts", import.meta.url), "utf8"),
      readFile(new URL("../gpt-image-artifact-recovery.service.ts", import.meta.url), "utf8"),
    ]);
    const section = (source: string, start: string, end: string) => {
      const startIndex = source.indexOf(start);
      const endIndex = source.indexOf(end, startIndex + start.length);
      assert.notEqual(startIndex, -1, start);
      assert.notEqual(endIndex, -1, end);
      return source.slice(startIndex, endIndex);
    };

    for (const query of [
      section(videoSource, "async function findSeedanceTaskForFinalize", "async function ensureSeedanceFinalizeAttempt"),
      section(videoSource, "async function findSeedanceTaskForPersist", "async function persistSeedanceVideoArtifact"),
      section(imageSource, "async function findGptImageTaskForFinalize", "function readGptImageArtifactRecoveryDeadline"),
      section(imageSource, "async function findGptImageTaskForPersist", "async function findGenerationTaskSnapshotFailure"),
    ]) {
      assert.match(query, /pr\.attempt_id = t\.current_attempt_id/);
      assert.match(query, /pr\.attempt_id IS NULL AND t\.attempt_count = 1/);
    }
    const audioQuery = section(audioSource, "async function findAudioTask", "function findAudioArtifact");
    assert.match(audioQuery, /request\.attempt_id = t\.current_attempt_id/);
    assert.match(audioQuery, /request\.attempt_id IS NULL AND t\.attempt_count = 1/);
    assert.match(imageRecoverySource, /request\.attempt_id = task\.current_attempt_id/);
    assert.match(imageRecoverySource, /request\.attempt_id IS NULL AND task\.attempt_count = 1/);
  });

  it("retries every artifact stage when its durable task is still nonterminal", async () => {
    const taskId = "50000000-0000-4000-8000-000000000390";
    const now = new Date("2026-08-11T06:00:00.000Z");
    const runtime = {} as never;
    const nonterminalTaskDb = () => artifactStageTaskDb("running");
    const cases = [
      {
        name: "image legacy finalize",
        failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY,
        run: () => finalizeGptImageArtifactJob(nonterminalTaskDb(), { taskId, runtime, env: {}, now }),
      },
      {
        name: "image fetch",
        failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY,
        run: () => fetchGptImageArtifactJob(nonterminalTaskDb(), { taskId, runtime, env: {}, now }),
      },
      {
        name: "image persist",
        failureCode: "provider_output_persist_failed",
        run: () => persistGptImageArtifactJob(nonterminalTaskDb(), { taskId, runtime, env: {}, now }),
      },
      {
        name: "video legacy finalize",
        failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY,
        run: () => finalizeSeedanceVideoArtifactJob(nonterminalTaskDb(), { taskId, runtime, env: {}, now }),
      },
      {
        name: "video fetch",
        failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY,
        run: () => fetchSeedanceVideoArtifactJob(nonterminalTaskDb(), { taskId, runtime, env: {}, now }),
      },
      {
        name: "video persist",
        failureCode: "provider_output_persist_failed",
        run: () => persistSeedanceVideoArtifactJob(nonterminalTaskDb(), { taskId, runtime, env: {}, now }),
      },
      {
        name: "audio legacy finalize",
        failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY,
        run: () => finalizeAudioGenerationArtifactJob(nonterminalTaskDb(), { taskId, runtime, env: {}, now }),
      },
      {
        name: "audio fetch",
        failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY,
        run: () => fetchAudioGenerationArtifactJob(nonterminalTaskDb(), { taskId, runtime, env: {}, now }),
      },
      {
        name: "audio persist",
        failureCode: "provider_output_persist_failed",
        run: () => persistAudioGenerationArtifactJob(nonterminalTaskDb(), { taskId, runtime, env: {}, now }),
      },
    ];

    for (const testCase of cases) {
      assert.deepEqual(await testCase.run(), {
        status: "failed",
        failureCode: testCase.failureCode,
      }, testCase.name);
    }
  });

  it("still skips duplicate artifact work after the durable task is terminal", async () => {
    const result = await fetchGptImageArtifactJob(artifactStageTaskDb("succeeded"), {
      taskId: "50000000-0000-4000-8000-000000000390",
      runtime: {} as never,
      env: {},
      now: new Date("2026-08-11T06:00:00.000Z"),
    });

    assert.deepEqual(result, { status: "skipped" });
  });

  it("settles stale artifact fetch jobs without disturbing queued or canceling tasks", async () => {
    for (const taskStatus of ["queued", "cancel_requested"]) {
      let persistJobs = 0;
      const result = await handleGenerationFetchArtifactJob({
        job: {
          data: {
            taskId: `task-stale-artifact-${taskStatus}`,
            workflowId: "workflow-stale-artifact",
            mediaType: "image",
            modelCode: "gpt-image-2",
            providerExecutor: "gpt-image-2",
            artifactKind: "image",
            artifactStage: "fetch",
          },
        },
        config: loadGenerationQueueConfig({}),
        publisher: {
          async add() {
            persistJobs += 1;
          },
        },
        processors: {
          async fetchGptImageArtifact({ taskId, now }) {
            return fetchGptImageArtifactJob(artifactStageTaskDb(taskStatus), {
              taskId,
              runtime: {} as never,
              env: {},
              now,
            });
          },
        },
        now: new Date("2026-08-11T06:00:00.000Z"),
      } as never);

      assert.deepEqual(result, { status: "skipped", queuedPersist: false }, taskStatus);
      assert.equal(persistJobs, 0, taskStatus);
    }
  });

  it("retries non-ready legacy media finalizers at the BullMQ boundary", async () => {
    for (const media of [
      { mediaType: "image" as const, providerExecutor: "gpt-image-2", artifactKind: "image" as const },
      { mediaType: "video" as const, providerExecutor: "seedance", artifactKind: "video" as const },
      { mediaType: "audio" as const, providerExecutor: "aliyun-bailian-audio", artifactKind: "audio" as const },
    ]) {
      await assert.rejects(() => handleGenerationFinalizeArtifactJob({
        job: {
          data: {
            taskId: "50000000-0000-4000-8000-000000000390",
            workflowId: "workflow-artifact-stage-guard",
            modelCode: null,
            ...media,
          },
        },
        config: loadGenerationQueueConfig({}),
        publisher: { async add() {} },
        processors: {
          async finalizeGptImageArtifact() {
            return { status: "failed" as const, failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY };
          },
          async finalizeSeedanceVideoArtifact() {
            return { status: "failed" as const, failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY };
          },
          async finalizeAudioArtifact() {
            return { status: "failed" as const, failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY };
          },
        },
        now: new Date("2026-08-11T06:00:00.000Z"),
      } as never), (error: unknown) => {
        assert.equal((error as { failureCode?: string }).failureCode, GENERATION_ARTIFACT_FETCH_NOT_READY);
        assert.notEqual((error as Error).name, "UnrecoverableError");
        return true;
      });
    }
  });

  it("retries nonterminal media rows whose provider artifact is not durable yet", async () => {
    const taskId = "50000000-0000-4000-8000-000000000391";
    const now = new Date("2026-08-11T06:05:00.000Z");
    const runtime = {} as never;
    const row = {
      task_id: taskId,
      workflow_id: "workflow-artifact-missing",
      attempt_id: "attempt-artifact-missing",
      user_id: "user-artifact-missing",
      project_id: null,
      created_by_user_id: "user-artifact-missing",
      input_snapshot_json: {},
      provider_request_id: "provider-artifact-missing",
      external_request_id: "external-artifact-missing",
      provider_response_redacted_json: {},
      reservation_id: null,
      amount_reserved: null,
    };
    const dbFor = (taskType: "episode_generate_audio" | "episode_generate_video") =>
      artifactStageTaskDb("running", null, (sql) =>
        sql.includes(`t.task_type = '${taskType}'`) ? [row] : []);

    for (const testCase of [
      {
        name: "audio fetch",
        run: () => fetchAudioGenerationArtifactJob(dbFor("episode_generate_audio"), {
          taskId, runtime, env: {}, now,
        }),
      },
      {
        name: "audio legacy finalize",
        run: () => finalizeAudioGenerationArtifactJob(dbFor("episode_generate_audio"), {
          taskId, runtime, env: {}, now,
        }),
      },
      {
        name: "video legacy finalize",
        run: () => finalizeSeedanceVideoArtifactJob(dbFor("episode_generate_video"), {
          taskId, runtime, env: {}, now,
        }),
      },
    ]) {
      assert.deepEqual(await testCase.run(), {
        status: "failed",
        failureCode: GENERATION_ARTIFACT_FETCH_NOT_READY,
      }, testCase.name);
    }
  });

  it("keeps a transient exhausted image finalize wave running with a durable next retry", async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const db = createArtifactRecoveryDb({ taskStatus: "running", providerStatus: {}, queries });

    const outcome = await handleGptImageArtifactQueueExhaustion(db as never, {
      taskId: "task-image-retry",
      error: Object.assign(new Error("provider_artifact_download_503"), {
        failureCode: "provider_output_download_failed",
        httpStatus: 503,
      }),
      now: new Date("2026-08-03T10:00:00.000Z"),
    });

    assert.equal(outcome, "retry_pending");
    assert.ok(queries.some(({ sql }) => /UPDATE tasks task[\s\S]*SET status = 'running'/.test(sql)));
    const snapshotUpdate = queries.find(({ sql }) => sql.includes("UPDATE ai_generation_task_snapshots"));
    assert.ok(snapshotUpdate);
    assert.match(snapshotUpdate.sql, /progress_stage = 'asset_transfer_retry_pending'/);
    assert.match(String(snapshotUpdate.params[1]), /"round":1/);
    assert.match(String(snapshotUpdate.params[1]), /"nextRetryAt":"2026-08-03T10:02:00.000Z"/);
  });

  it("moves permanent image artifact failures to storage manual review without releasing credits", async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const db = createArtifactRecoveryDb({ taskStatus: "running", providerStatus: {}, queries });

    const outcome = await handleGptImageArtifactQueueExhaustion(db as never, {
      taskId: "task-image-manual",
      error: Object.assign(new Error("provider_artifact_download_404"), {
        failureCode: "provider_output_download_failed",
        httpStatus: 404,
      }),
      now: new Date("2026-08-03T10:00:00.000Z"),
    });

    assert.equal(outcome, "manual_review_required");
    assert.ok(queries.some(({ sql }) => /UPDATE tasks task[\s\S]*SET status = 'manual_review_required'/.test(sql)));
    const snapshotUpdate = queries.find(({ sql }) => sql.includes("UPDATE ai_generation_task_snapshots"));
    assert.ok(snapshotUpdate);
    assert.match(snapshotUpdate.sql, /progress_stage = 'asset_transfer_manual_review'/);
    assert.match(snapshotUpdate.sql, /credit_status = 'manual_review_required'/);
    assert.match(String(snapshotUpdate.params[2]), /admin_action_required/);
  });

  it("does not let a late exhausted callback overwrite a succeeded image task", async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const db = createArtifactRecoveryDb({ taskStatus: "succeeded", providerStatus: {}, queries });

    const outcome = await handleGptImageArtifactQueueExhaustion(db as never, {
      taskId: "task-image-succeeded",
      error: Object.assign(new Error("late timeout"), {
        failureCode: "provider_output_upload_failed",
      }),
      now: new Date("2026-08-03T10:00:00.000Z"),
    });

    assert.equal(outcome, "skipped");
    assert.equal(queries.some(({ sql }) => sql.includes("UPDATE ai_generation_task_snapshots")), false);
    assert.equal(queries.some(({ sql }) => /UPDATE tasks task/.test(sql)), false);
  });

  it("does not reopen a terminal artifact recovery after a duplicate exhausted callback", async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const db = createArtifactRecoveryDb({
      taskStatus: "manual_review_required",
      providerStatus: {
        artifactRecovery: {
          state: "manual_review",
          round: 8,
          startedAt: "2026-08-03T10:00:00.000Z",
          nextRetryAt: null,
          deadlineAt: "2026-08-03T16:00:00.000Z",
          lastFailureCode: "provider_output_upload_failed",
        },
      },
      queries,
    });

    const outcome = await handleGptImageArtifactQueueExhaustion(db as never, {
      taskId: "task-image-manual",
      error: Object.assign(new Error("late transient callback"), {
        failureCode: "provider_output_upload_failed",
        httpStatus: 503,
      }),
      now: new Date("2026-08-03T16:01:00.000Z"),
    });

    assert.equal(outcome, "skipped");
    assert.equal(queries.some(({ sql }) => sql.includes("UPDATE ai_generation_task_snapshots")), false);
    assert.equal(queries.some(({ sql }) => /UPDATE tasks task/.test(sql)), false);
  });

  it("does not reopen a failed task whose project asset target is gone", async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const db = createArtifactRecoveryDb({
      taskStatus: "failed",
      taskFailureCode: "project_asset_generation_target_missing",
      providerStatus: {},
      queries,
    });

    const outcome = await handleGptImageArtifactQueueExhaustion(db as never, {
      taskId: "task-image-missing-target",
      error: Object.assign(new Error("project_asset_generation_target_missing"), {
        failureCode: "project_asset_generation_target_missing",
      }),
      now: new Date("2026-08-03T16:01:00.000Z"),
    });

    assert.equal(outcome, "skipped");
    assert.equal(queries.some(({ sql }) => sql.includes("UPDATE ai_generation_task_snapshots")), false);
    assert.equal(queries.some(({ sql }) => /UPDATE tasks task/.test(sql)), false);
  });

  it("does not consume another recovery round before the durable retry time", async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const db = createArtifactRecoveryDb({
      taskStatus: "running",
      providerStatus: {
        artifactRecovery: {
          state: "retry_pending",
          round: 2,
          startedAt: "2026-08-03T10:00:00.000Z",
          nextRetryAt: "2026-08-03T10:20:00.000Z",
          deadlineAt: "2026-08-03T16:00:00.000Z",
          lastFailureCode: "provider_output_upload_failed",
        },
      },
      queries,
    });

    const outcome = await handleGptImageArtifactQueueExhaustion(db as never, {
      taskId: "task-image-retry",
      error: Object.assign(new Error("duplicate exhausted callback"), {
        failureCode: "provider_output_upload_failed",
      }),
      now: new Date("2026-08-03T10:05:00.000Z"),
    });

    assert.equal(outcome, "skipped");
    assert.equal(queries.some(({ sql }) => sql.includes("UPDATE ai_generation_task_snapshots")), false);
    assert.equal(queries.some(({ sql }) => /UPDATE tasks task/.test(sql)), false);
  });

  it("fails permanently when a provider-succeeded image has no artifact to finalize", async () => {
    const result = await fetchGptImageArtifactJob({
      async query(sql) {
        if (sql.includes("FROM tasks t") && sql.includes("LEFT JOIN provider_requests pr")) {
          return {
            rows: [{
              task_id: "task-no-artifact",
              workflow_id: "workflow-no-artifact",
              attempt_id: "attempt-no-artifact",
              user_id: "user-no-artifact",
              project_id: null,
              input_snapshot_json: {},
              created_by_user_id: "user-no-artifact",
              provider_request_id: "provider-no-artifact",
              external_request_id: "external-no-artifact",
              provider_response_redacted_json: {},
              reservation_id: null,
              amount_reserved: null,
            }],
          };
        }
        if (sql.includes("provider_status_json->'artifactHandoff'") || sql.includes("FROM storage_objects")) {
          return { rows: [] };
        }
        throw new Error(`unexpected_query:${sql}`);
      },
    } as never, {
      taskId: "task-no-artifact",
      runtime: {} as never,
      env: {},
      now: new Date("2026-08-03T10:00:00.000Z"),
    });

    assert.deepEqual(result, { status: "failed", failureCode: "provider_output_missing" });
  });

  it("does not start another artifact transfer while a finalize lease is active", async () => {
    let uploadCalls = 0;
    const result = await fetchGptImageArtifactJob({
      async query(sql) {
        if (sql.includes("FROM tasks t") && sql.includes("LEFT JOIN provider_requests pr")) {
          return {
            rows: [{
              task_id: "task-active-transfer",
              workflow_id: "workflow-active-transfer",
              attempt_id: "attempt-active-transfer",
              user_id: "user-active-transfer",
              project_id: null,
              input_snapshot_json: {},
              created_by_user_id: "user-active-transfer",
              provider_request_id: "provider-active-transfer",
              external_request_id: "external-active-transfer",
              provider_response_redacted_json: {
                artifact: {
                  mediaType: "image",
                  mimeType: "image/png",
                  url: "https://provider.example.test/result.png",
                },
              },
              reservation_id: null,
              amount_reserved: null,
            }],
          };
        }
        if (sql.includes("provider_status_json->'artifactHandoff'") || sql.includes("FROM storage_objects")) {
          return { rows: [] };
        }
        if (sql.includes("WITH claimed_task AS") && sql.includes("AS claimed")) {
          return { rows: [{ claimed: false }] };
        }
        throw new Error(`unexpected_query:${sql}`);
      },
    } as never, {
      taskId: "task-active-transfer",
      runtime: {
        bucket: "creator-test",
        adapter: {
          async putObject() {
            uploadCalls += 1;
            return {};
          },
        },
      } as never,
      env: {},
      now: new Date("2026-08-03T10:00:00.000Z"),
    });

    assert.deepEqual(result, { status: "skipped" });
    assert.equal(uploadCalls, 0);
  });

  it("marks missing provider image output unrecoverable at the queue boundary", async () => {
    const config = loadGenerationQueueConfig({});
    await assert.rejects(
      () => handleGenerationFetchArtifactJob({
        job: {
          data: {
            taskId: "task-no-artifact",
            workflowId: "workflow-no-artifact",
            mediaType: "image",
            modelCode: "gpt-image-2-cn",
            providerExecutor: "gpt-image-2",
            artifactKind: "image",
            artifactStage: "fetch",
          },
        },
        processors: {
          async fetchGptImageArtifact() {
            return { status: "failed" as const, failureCode: "provider_output_missing" };
          },
          async submitSeedanceVideo() { return { status: "settled" as const }; },
          async pollSeedanceVideo() { return { status: "waiting" as const }; },
          async finalizeSeedanceVideoArtifact() { return { status: "skipped" as const }; },
        },
        publisher: { async add() {} },
        config,
        now: new Date("2026-08-03T10:00:00.000Z"),
      } as never),
      (error: unknown) => {
        assert.equal((error as Error).name, "UnrecoverableError");
        assert.equal((error as { failureCode?: string }).failureCode, "provider_output_missing");
        return true;
      },
    );
  });

  it("marks missing output unrecoverable for legacy combined finalize jobs", async () => {
    const config = loadGenerationQueueConfig({});
    await assert.rejects(
      () => handleGenerationFinalizeArtifactJob({
        job: {
          data: {
            taskId: "task-no-artifact",
            workflowId: "workflow-no-artifact",
            mediaType: "image",
            modelCode: "gpt-image-2-cn",
            providerExecutor: "gpt-image-2",
            artifactKind: "image",
          },
        },
        processors: {
          async finalizeGptImageArtifact() {
            return { status: "failed" as const, failureCode: "provider_output_missing" };
          },
          async submitSeedanceVideo() { return { status: "settled" as const }; },
          async pollSeedanceVideo() { return { status: "waiting" as const }; },
          async finalizeSeedanceVideoArtifact() { return { status: "skipped" as const }; },
        },
        publisher: { async add() {} },
        config,
        now: new Date("2026-08-03T10:00:00.000Z"),
      } as never),
      (error: unknown) => {
        assert.equal((error as Error).name, "UnrecoverableError");
        assert.equal((error as { failureCode?: string }).failureCode, "provider_output_missing");
        return true;
      },
    );
  });

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

  it("recovers a legacy succeeded artifact when the durable handoff is absent", async () => {
    const handoff = await findGenerationArtifactHandoff({
      async query(sql) {
        if (sql.includes("provider_status_json->'artifactHandoff'")) {
          return {
            rows: [{
              handoff: null,
              snapshot_status: "succeeded",
              task_status: "succeeded",
              result_assets_json: [{ mediaKind: "image", storageObjectId: "storage-legacy-1" }],
              attempt_id: "attempt-legacy-1",
            }],
          };
        }
        if (sql.includes("SELECT object_key, content_type, COALESCE(last_verified_at, created_at) AS fetched_at")) {
          return {
            rows: [{
              object_key: "generation/legacy.png",
              content_type: "image/png",
              fetched_at: new Date("2026-07-24T11:58:00.000Z"),
            }],
          };
        }
        return { rows: [] };
      },
    } as never, "task-legacy-1");

    assert.deepEqual(handoff, {
      mediaType: "image",
      attemptId: "attempt-legacy-1",
      storageObjectId: "storage-legacy-1",
      storageObjectKey: "generation/legacy.png",
      contentType: "image/png",
      fetchedAt: "2026-07-24T11:58:00.000Z",
    });
  });

  it("continues persist recovery after a generation queue failure", async () => {
    let attemptReopened = false;
    let uploadRecordEnsured = false;
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
        if (sql.includes("WITH claimed_task AS") && sql.includes("AS claimed")) {
          return { rows: [{ claimed: true }] };
        }
        if (sql.includes("WITH released_task AS")) {
          return { rows: [] };
        }
        if (sql.includes("FROM project_upload_records")) {
          uploadRecordEnsured = true;
          return { rows: [{ id: "upload-record-1" }] };
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
    assert.equal(uploadRecordEnsured, true);
    assert.deepEqual(result, { status: "succeeded" });
  });
});

function createArtifactRecoveryDb(input: {
  taskStatus: string;
  taskFailureCode?: string | null;
  providerStatus: Record<string, unknown>;
  queries: Array<{ sql: string; params: unknown[] }>;
}) {
  return {
    async query(sql: string, params: unknown[] = []) {
      input.queries.push({ sql, params });
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
      if (sql.includes("FOR UPDATE OF task")) {
        return {
          rows: [{
            task_id: "task-image",
            workflow_id: "workflow-image",
            task_status: input.taskStatus,
            task_failure_code: input.taskFailureCode ?? null,
            current_attempt_id: "attempt-image",
            input_snapshot_json: {},
            provider_request_id: "provider-image",
            reservation_id: null,
            amount_reserved: null,
            provider_status_json: input.providerStatus,
          }],
        };
      }
      return { rows: [{ id: "updated" }] };
    },
  };
}

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
