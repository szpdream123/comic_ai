import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import type { UploadSessionRuntime } from "../../storage/upload-session.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createWorkflowWithTasks } from "../../workflow-task/workflow-task.service.ts";
import { finalizeAudioGenerationArtifactJob } from "../audio-generation.worker.ts";
import { finalizeGptImageArtifactJob, processGptImageSubmitJob } from "../gpt-image.worker.ts";
import { finalizeSeedanceVideoArtifactJob } from "../seedance-video.worker.ts";

const submittedAt = new Date("2026-07-26T10:00:00.000Z");
const finalizedAt = new Date("2026-07-26T10:01:00.000Z");

describe("Canvas generation Artifact revocation gates", { concurrency: false }, () => {
  it("blocks image Artifact persistence after the owner is disabled", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedCanvasActor(db);
    const effects = sideEffectSpies();
    try {
      const workflow = await createWorkflowWithTasks(db, {
        userId: fixture.userId,
        projectId: null,
        canvasProjectId: fixture.canvasId,
        workflowType: "episode_image_generation",
        inputSnapshot: {},
        tasks: [{
          taskType: "episode_generate_image",
          queueName: "generation-submit-image",
          targetEntityType: "canvas",
          targetEntityId: fixture.canvasId,
          inputSnapshot: {
            providerExecutor: "gpt-image-2",
            canvasProjectId: fixture.canvasId,
            targetType: "canvas",
            targetId: "image-node",
            prompt: "submitted before owner disable",
            model: "gpt-image-2-cn",
            parameters: { responseFormat: "b64_json" },
          },
        }],
      });
      const taskId = workflow.tasks[0]!.id;
      const submitted = await processGptImageSubmitJob(db, {
        taskId,
        runtime: effects.runtime,
        env: { GPT_IMAGE2_API_KEY: "test-key" },
        fetchImpl: (async () => {
          effects.fetchCalls += 1;
          return new Response(JSON.stringify({
            created: 1_717_200_000,
            data: [{ b64_json: Buffer.from("revoked image").toString("base64") }],
          }), { status: 200, headers: { "content-type": "application/json" } });
        }) as typeof fetch,
        now: submittedAt,
      });
      assert.deepEqual(submitted, { status: "submitted", providerStatus: "succeeded" });
      effects.fetchCalls = 0;
      await db.query("UPDATE users SET status='disabled' WHERE id=$1", [fixture.userId]);

      const result = await finalizeGptImageArtifactJob(db, {
        taskId,
        runtime: effects.runtime,
        env: { GPT_IMAGE2_API_KEY: "test-key" },
        fetchImpl: effects.fetch,
        now: finalizedAt,
      });

      assert.deepEqual(result, { status: "failed", failureCode: "canvas_assignment_revoked" });
      await assertNoArtifactEffects(db, fixture.canvasId, taskId, effects);
    } finally {
      await db.close();
    }
  });

  it("blocks video download and Artifact persistence after the Canvas is deleted", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedCanvasActor(db);
    const effects = sideEffectSpies();
    try {
      const taskId = await seedReadyAsyncArtifactTask(db, {
        userId: fixture.userId,
        canvasId: fixture.canvasId,
        taskType: "episode_generate_video",
        workflowType: "episode_video_generation",
        queueName: "generation-submit-video",
        snapshot: {
          providerExecutor: "seedance",
          canvasProjectId: fixture.canvasId,
          targetType: "canvas",
          targetId: "video-node",
          model: "seedance-i2v-pro",
        },
        providerName: "volcengine",
        providerOperation: "episode.video.generate",
        providerResponse: { status: "succeeded", videoUrl: "https://provider.example.test/result.mp4" },
      });
      await db.query("UPDATE creator_canvas_projects SET deleted_at=$2 WHERE id=$1", [fixture.canvasId, finalizedAt]);

      const result = await finalizeSeedanceVideoArtifactJob(db, {
        taskId,
        runtime: effects.runtime,
        env: {},
        fetchImpl: effects.fetch,
        now: finalizedAt,
      });

      assert.deepEqual(result, { status: "failed", failureCode: "canvas_assignment_revoked" });
      await assertNoArtifactEffects(db, fixture.canvasId, taskId, effects);
    } finally {
      await db.close();
    }
  });

  it("blocks audio download and Artifact persistence after member assignment revocation", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedCanvasActor(db, true);
    const effects = sideEffectSpies();
    try {
      const taskId = await seedReadyAsyncArtifactTask(db, {
        userId: fixture.userId,
        canvasId: fixture.canvasId,
        taskType: "episode_generate_audio",
        workflowType: "episode_audio_generation",
        queueName: "generation-submit-audio",
        snapshot: {
          providerExecutor: "aliyun-bailian-audio",
          canvasProjectId: fixture.canvasId,
          teamMemberId: fixture.memberId,
          targetType: "canvas",
          targetId: "audio-node",
          model: "cosyvoice-v2",
        },
        providerName: "aliyun-bailian",
        providerOperation: "audio.generate",
        providerResponse: {
          status: "succeeded",
          artifact: {
            mediaType: "audio",
            mimeType: "audio/mpeg",
            fileExtension: "mp3",
            url: "https://provider.example.test/result.mp3",
          },
        },
      });
      await db.query("DELETE FROM team_member_canvases WHERE member_id=$1 AND canvas_id=$2", [
        fixture.memberId,
        fixture.canvasId,
      ]);

      const result = await finalizeAudioGenerationArtifactJob(db, {
        taskId,
        runtime: effects.runtime,
        env: {},
        fetchImpl: effects.fetch,
        now: finalizedAt,
      });

      assert.deepEqual(result, { status: "failed", failureCode: "canvas_assignment_revoked" });
      await assertNoArtifactEffects(db, fixture.canvasId, taskId, effects);
    } finally {
      await db.close();
    }
  });
});

function sideEffectSpies() {
  const effects = {
    fetchCalls: 0,
    uploadCalls: 0,
    fetch: undefined as unknown as typeof fetch,
    runtime: undefined as unknown as UploadSessionRuntime,
  };
  effects.fetch = (async () => {
    effects.fetchCalls += 1;
    throw new Error("revoked Artifact must not be downloaded");
  }) as typeof fetch;
  effects.runtime = {
    mode: "cos",
    provider: "tencent_cos",
    bucket: "revocation-test",
    region: "ap-guangzhou",
    publicBaseUrl: "https://storage.example.test",
    adapter: {
      async putObject() {
        effects.uploadCalls += 1;
        throw new Error("revoked Artifact must not be uploaded");
      },
      async createSignedReadUrl(input) {
        return { url: `https://storage.example.test/${input.objectKey}`, expiresAt: input.expiresAt };
      },
    },
  } as UploadSessionRuntime;
  return effects;
}

async function seedCanvasActor(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  withMember = false,
) {
  const userId = randomUUID();
  const canvasId = randomUUID();
  const memberId = withMember ? randomUUID() : null;
  await db.query("INSERT INTO users (id,status) VALUES ($1,'active')", [userId]);
  await db.query(`
    INSERT INTO creator_canvas_projects
      (id,title,status,server_revision,created_by_user_id,updated_by_user_id)
    VALUES ($1,'Artifact revocation','active',1,$2,$2)
  `, [canvasId, userId]);
  if (memberId) {
    await db.query(`
      INSERT INTO team_members (
        id,user_id,member_account,member_account_suffix,member_login_account,
        member_name,member_password_hash,member_credits,status
      ) VALUES ($1,$2,'artifact-member','uartifact','artifact-member@uartifact',
        'Artifact Member','hash',100,'active')
    `, [memberId, userId]);
    await db.query(
      "INSERT INTO team_member_canvases (id,member_id,user_id,canvas_id) VALUES ($1,$2,$3,$4)",
      [randomUUID(), memberId, userId, canvasId],
    );
  }
  return { userId, canvasId, memberId };
}

async function seedReadyAsyncArtifactTask(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: {
    userId: string;
    canvasId: string;
    taskType: "episode_generate_video" | "episode_generate_audio";
    workflowType: string;
    queueName: string;
    snapshot: Record<string, unknown>;
    providerName: string;
    providerOperation: string;
    providerResponse: Record<string, unknown>;
  },
) {
  const workflow = await createWorkflowWithTasks(db, {
    userId: input.userId,
    projectId: null,
    canvasProjectId: input.canvasId,
    workflowType: input.workflowType,
    inputSnapshot: input.snapshot,
    tasks: [{
      taskType: input.taskType,
      queueName: input.queueName,
      targetEntityType: "canvas",
      targetEntityId: input.canvasId,
      inputSnapshot: input.snapshot,
    }],
  });
  const taskId = workflow.tasks[0]!.id;
  const attemptId = randomUUID();
  const providerRequestId = randomUUID();
  await db.query(`
    INSERT INTO task_attempts (
      id,project_id,workflow_id,task_id,attempt_number,status,
      locked_by,locked_until,heartbeat_at,started_at
    ) VALUES ($1,NULL,$2,$3,1,'running','artifact-test',$4,$4,$4)
  `, [attemptId, workflow.workflow.id, taskId, submittedAt]);
  await db.query(`
    UPDATE tasks
    SET status='running',current_attempt_id=$2,attempt_count=1,updated_at=$3
    WHERE id=$1
  `, [taskId, attemptId, submittedAt]);
  await db.query("UPDATE workflows SET status='running',updated_at=$2 WHERE id=$1", [workflow.workflow.id, submittedAt]);
  await db.query(`
    INSERT INTO provider_requests (
      id,project_id,canvas_project_id,workflow_id,task_id,attempt_id,
      provider_name,provider_operation,request_key,request_hash,payload_ref,payload_hash,
      payload_redacted_json,status,external_submission_started_at,external_request_id,
      response_redacted_json,created_by_user_id,created_at,updated_at
    ) VALUES (
      $1::uuid,NULL,$2,$3,$4,$5,$6,$7,($1::uuid)::text,($1::uuid)::text,($1::uuid)::text,($1::uuid)::text,
      '{}'::jsonb,'succeeded',$8,$9,$10::jsonb,$11,$8,$8
    )
  `, [
    providerRequestId,
    input.canvasId,
    workflow.workflow.id,
    taskId,
    attemptId,
    input.providerName,
    input.providerOperation,
    submittedAt,
    `external-${providerRequestId}`,
    JSON.stringify(input.providerResponse),
    input.userId,
  ]);
  return taskId;
}

async function assertNoArtifactEffects(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  canvasId: string,
  taskId: string,
  effects: { fetchCalls: number; uploadCalls: number },
) {
  const storage = await db.query<{ count: number | string }>("SELECT count(*) AS count FROM storage_objects");
  const versions = await db.query<{ count: number | string }>(
    "SELECT count(*) AS count FROM asset_versions WHERE source_task_id=$1",
    [taskId],
  );
  const artifacts = await db.query<{ count: number | string }>(
    "SELECT count(*) AS count FROM creator_canvas_node_artifacts WHERE canvas_project_id=$1",
    [canvasId],
  );
  assert.equal(effects.fetchCalls, 0);
  assert.equal(effects.uploadCalls, 0);
  assert.equal(Number(storage.rows[0]?.count), 0);
  assert.equal(Number(versions.rows[0]?.count), 0);
  assert.equal(Number(artifacts.rows[0]?.count), 0);
}
