import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  handleGenerationFinalizeArtifactJob,
  handleGenerationPollAudioJob,
  handleGenerationSubmitAudioJob,
} from "../generation-bullmq.worker.ts";
import { loadGenerationQueueConfig } from "../generation-queue.config.ts";
import { __audioGenerationWorkerTestUtils } from "../audio-generation.worker.ts";

function baseProcessors(overrides: Record<string, unknown> = {}) {
  return {
    async submitSeedanceVideo() { return { status: "skipped" as const }; },
    async pollSeedanceVideo() { return { status: "skipped" as const }; },
    async expireSeedanceVideo() { return { status: "failed" as const, failureCode: "unused" }; },
    ...overrides,
  };
}

describe("audio generation pipeline", () => {
  it("preserves ambiguous provider submissions for manual review instead of releasing credits", () => {
    assert.equal(__audioGenerationWorkerTestUtils.shouldPreserveAudioSubmissionAsResultUnknown("result_unknown"), true);
    assert.equal(__audioGenerationWorkerTestUtils.shouldPreserveAudioSubmissionAsResultUnknown("failed"), false);
  });

  it("routes asynchronous audio submit to the shared poll queue", async () => {
    const jobs: Array<{ queue: string; name: string; data: Record<string, unknown> }> = [];
    const result = await handleGenerationSubmitAudioJob({
      job: { data: {
        taskId: "audio-task-1",
        workflowId: "audio-workflow-1",
        mediaType: "audio",
        modelCode: "cosyvoice-v2",
        providerExecutor: "aliyun-bailian-audio",
      } },
      config: loadGenerationQueueConfig({ GENERATION_POLL_VIDEO_INTERVAL_MS: "5000" }),
      publisher: { async add(queue, name, data) { jobs.push({ queue, name, data }); } },
      processors: baseProcessors({
        async submitAudio() { return { status: "submitted" as const, providerStatus: "waiting" as const }; },
      }),
      now: new Date("2026-07-20T00:00:00.000Z"),
    });
    assert.deepEqual(result, { status: "submitted", queuedPoll: true });
    assert.equal(jobs[0]?.queue, "generation-poll-video");
    assert.equal(jobs[0]?.name, "generation.audio.poll");
    assert.equal(jobs[0]?.data.mediaType, "audio");
    assert.equal(jobs[0]?.data.pollAttempt, 1);
  });

  it("routes synchronous and polled success to real artifact finalization", async () => {
    const jobs: Array<{ name: string; data: Record<string, unknown> }> = [];
    const publisher = { async add(_queue: string, name: string, data: Record<string, unknown>) { jobs.push({ name, data }); } };
    const config = loadGenerationQueueConfig({});
    const submit = await handleGenerationSubmitAudioJob({
      job: { data: {
        taskId: "audio-sync",
        workflowId: "workflow-sync",
        mediaType: "audio",
        modelCode: "cosyvoice-v2",
        providerExecutor: "aliyun-bailian-audio",
      } },
      config,
      publisher,
      processors: baseProcessors({
        async submitAudio() { return { status: "submitted" as const, providerStatus: "succeeded" as const }; },
      }),
      now: new Date("2026-07-20T00:00:00.000Z"),
    });
    assert.deepEqual(submit, { status: "submitted", queuedFinalize: true });
    assert.equal(jobs[0]?.name, "generation.audio.finalize");
    assert.equal(jobs[0]?.data.artifactKind, "audio");

    const poll = await handleGenerationPollAudioJob({
      job: { data: {
        taskId: "audio-async",
        workflowId: "workflow-async",
        mediaType: "audio",
        modelCode: "cosyvoice-v2",
        providerExecutor: "aliyun-bailian-audio",
        pollAttempt: 2,
      } },
      config,
      publisher,
      processors: baseProcessors({ async pollAudio() { return { status: "succeeded" as const }; } }),
      now: new Date("2026-07-20T00:00:05.000Z"),
    });
    assert.deepEqual(poll, { status: "succeeded", queuedPoll: false, queuedFinalize: true });
    assert.equal(jobs[1]?.name, "generation.audio.finalize");
  });

  it("invokes only the audio finalizer for audio artifacts", async () => {
    let calls = 0;
    const result = await handleGenerationFinalizeArtifactJob({
      job: { data: {
        taskId: "audio-finalize",
        workflowId: "workflow-finalize",
        mediaType: "audio",
        modelCode: "cosyvoice-v2",
        providerExecutor: "aliyun-bailian-audio",
        artifactKind: "audio",
      } },
      config: loadGenerationQueueConfig({}),
      publisher: { async add() {} },
      processors: baseProcessors({
        async finalizeAudioArtifact() { calls += 1; return { status: "succeeded" as const }; },
      }),
      now: new Date("2026-07-20T00:00:10.000Z"),
    });
    assert.equal(calls, 1);
    assert.deepEqual(result, { status: "succeeded" });
  });

  it("keeps baseline and migration model metadata aligned without unsupported controls or secrets", async () => {
    const [schema, seed, migration, correction] = await Promise.all([
      readFile("packages/db/baseline/user-centric-schema.sql", "utf8"),
      readFile("packages/db/baseline/model-reference-seed.sql", "utf8"),
      readFile("packages/db/migrations/20260720-add-aliyun-bailian-audio-model.sql", "utf8"),
      readFile("packages/db/migrations/20260720-correct-cosyvoice-v2-contract.sql", "utf8"),
    ]);
    assert.match(schema, /aliyun_bailian_audio/);
    for (const sql of [seed, migration]) {
      assert.match(sql, /'cosyvoice-v1'/);
      assert.match(sql, /'audio'/);
      assert.match(sql, /ALIYUNBAILIAN_API_KEY/);
      assert.match(sql, /generation-submit-image/);
      assert.doesNotMatch(sql, /"(?:pause|interjection|intensity|timbre|effect)"\s*:/);
      assert.doesNotMatch(sql, /Bearer\s+[A-Za-z0-9._-]+/);
    }
    assert.match(correction, /'cosyvoice-v2'/);
    assert.match(correction, /invocation_mode = 'sync'/);
    assert.match(correction, /SpeechSynthesizer/);
    assert.match(correction, /poll_queue_name = NULL/);
    assert.match(correction, /"voice":"longxiaochun_v2"/);
    assert.doesNotMatch(correction, /"(?:pause|interjection|intensity|timbre|effect)"\s*:/);
    assert.doesNotMatch(correction, /Bearer\s+[A-Za-z0-9._-]+/);
  });
});
