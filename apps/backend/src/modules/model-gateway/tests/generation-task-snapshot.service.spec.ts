import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  markGenerationTaskSnapshotFailed,
  markGenerationTaskSnapshotManualReviewRequired,
  markGenerationTaskSnapshotResultUnknown,
  markGenerationTaskSnapshotRunning,
  upsertQueuedGenerationTaskSnapshot,
} from "../generation-task-snapshot.service.ts";

const projectId = "40000000-0000-4000-8000-000000000001";
const episodeId = "90000000-0000-4000-8000-000000000001";

describe("generation task snapshot service", () => {
  it("updates running, result_unknown, and manual_review_required states with notice types", async () => {
    const db = await createMigratedTestDb();
    try {
      const ids = await seedSnapshotFixture(db);

      await markGenerationTaskSnapshotRunning(db, {
        taskId: ids.taskId,
        attemptId: ids.attemptId,
        providerRequestId: ids.providerRequestId,
        progressStage: "provider_rendering",
        progressPercent: 35,
        providerStatus: { providerStatus: "running" },
        now: new Date("2026-06-03T05:01:00.000Z"),
      });
      let snapshot = await loadSnapshot(db, ids.taskId);
      assert.equal(snapshot?.status, "running");
      assert.equal(snapshot?.progress_stage, "provider_rendering");
      assert.equal(snapshot?.progress_percent, 35);
      assert.equal(snapshot?.credit_status, "reserved");
      assert.deepEqual(snapshot?.provider_status_json, { providerStatus: "running" });

      await markGenerationTaskSnapshotResultUnknown(db, {
        taskId: ids.taskId,
        attemptId: ids.attemptId,
        providerRequestId: ids.providerRequestId,
        failure: {
          failureCode: "provider_result_unknown",
          displayMessage: "任务状态待确认，请稍后刷新",
        },
        providerStatus: { providerStatus: "unknown" },
        now: new Date("2026-06-03T05:02:00.000Z"),
      });
      snapshot = await loadSnapshot(db, ids.taskId);
      assert.equal(snapshot?.status, "result_unknown");
      assert.equal(snapshot?.credit_status, "manual_review_required");
      assert.equal(snapshot?.failure_json?.noticeType, "manual_review");
      assert.equal(snapshot?.failure_json?.failureCode, "provider_result_unknown");

      await markGenerationTaskSnapshotManualReviewRequired(db, {
        taskId: ids.taskId,
        attemptId: ids.attemptId,
        providerRequestId: ids.providerRequestId,
        progressStage: "asset_persist_failed",
        failure: {
          failureCode: "provider_output_persist_failed",
          displayMessage: "已保存到平台存储，正在等待后台补写资产记录",
          storageObjectKey: "AIManhuaDrama/20260603/video.mp4",
        },
        creditSummary: { reserved: 135 },
        now: new Date("2026-06-03T05:03:00.000Z"),
      });
      snapshot = await loadSnapshot(db, ids.taskId);
      assert.equal(snapshot?.status, "manual_review_required");
      assert.equal(snapshot?.progress_stage, "asset_persist_failed");
      assert.equal(snapshot?.credit_status, "manual_review_required");
      assert.equal(snapshot?.failure_json?.noticeType, "manual_review");
      assert.equal(snapshot?.failure_json?.storageObjectKey, "AIManhuaDrama/20260603/video.mp4");
      assert.deepEqual(snapshot?.credit_summary_json, { reserved: 135 });
    } finally {
      await db.close();
    }
  });

  it("translates provider error messages before storing snapshot failure fields", async () => {
    const db = await createMigratedTestDb();
    try {
      const ids = await seedSnapshotFixture(db);

      await markGenerationTaskSnapshotFailed(db, {
        taskId: ids.taskId,
        attemptId: ids.attemptId,
        providerRequestId: ids.providerRequestId,
        failure: {
          failureCode: "provider_failed",
          displayMessage: "The model seedance-2-0-i2v does not exist.",
          providerMessage: "OpenAI upstream overloaded",
          providerName: "OpenAI",
        },
        providerStatus: {
          providerStatus: "failed",
          provider: "OpenAI",
          providerLabel: "OpenAI",
          diagnostics: {
            statusText: "Service Unavailable",
            responseBodyPreview: '{"error":{"message":"OpenAI upstream overloaded","code":"temporarily_unavailable"}}',
          },
          artifact: { b64Json: "A".repeat(256 * 1024) },
        },
        now: new Date("2026-06-03T05:04:00.000Z"),
      });

      const snapshot = await loadSnapshot(db, ids.taskId);

      assert.equal(snapshot?.failure_json?.displayMessage, "当前模型不可用或账号没有权限，请检查模型配置和账号权限后重试。");
      assert.equal(snapshot?.failure_json?.providerMessage, "模型服务繁忙或暂时不可用，请稍后重试。");
      assert.equal(snapshot?.failure_json?.providerName, undefined);
      assert.equal(snapshot?.provider_status_json.provider, undefined);
      assert.equal(snapshot?.provider_status_json.providerLabel, undefined);
      assert.deepEqual(snapshot?.provider_status_json.diagnostics, {
        statusText: "模型服务繁忙或暂时不可用，请稍后重试。",
        responseBodyPreview: "模型服务繁忙或暂时不可用，请稍后重试。",
      });
      assert.deepEqual(snapshot?.provider_status_json.artifact, {
        b64Json: "[binary omitted: base64, 262144 chars]",
      });
      assert.deepEqual(snapshot?.task_center_diagnostics_json, {
        diagnostics: {
          statusText: "模型服务繁忙或暂时不可用，请稍后重试。",
          responseBodyPreview: "模型服务繁忙或暂时不可用，请稍后重试。",
        },
      });
      assert.ok(Buffer.byteLength(JSON.stringify(snapshot?.provider_status_json), "utf8") < 64 * 1024);

      await markGenerationTaskSnapshotRunning(db, {
        taskId: ids.taskId,
        attemptId: ids.attemptId,
        providerRequestId: ids.providerRequestId,
        progressStage: "provider_rendering",
        progressPercent: 60,
        now: new Date("2026-06-03T05:05:00.000Z"),
      });
      const afterLatePoll = await loadSnapshot(db, ids.taskId);
      assert.equal(afterLatePoll?.status, "failed");
      assert.equal(afterLatePoll?.progress_stage, "failed");
    } finally {
      await db.close();
    }
  });
});

async function seedSnapshotFixture(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  const workflowId = randomUUID();
  const taskId = randomUUID();
  const attemptId = randomUUID();
  const providerRequestId = randomUUID();
  const userId = "30000000-0000-4000-8000-000000000002";

  await db.query("INSERT INTO users (id, phone_e164, status) VALUES ($1, $2, 'active')", [
    userId,
    "13800138000",
  ]);
      await db.query(
    `
      INSERT INTO projects (
        id,
        name,
        aspect_ratio,
        resolution,
        phase,
        owner_user_id,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, 'Snapshot Test Project', '9:16', '1080p', 'shot_generation', $2, $2, $3, $3)
    `,
    [projectId,
      userId,
      new Date("2026-06-03T05:00:00.000Z")],
  );
  await db.query(
    `
      INSERT INTO episodes (
        id,
        project_id,
        title,
        sequence,
        status,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, 'Snapshot Test Episode', 1, 'draft', $3, $4, $4)
    `,
    [episodeId,
      projectId,
      userId,
      new Date("2026-06-03T05:00:00.000Z")],
  );
  await db.query(
    `
      INSERT INTO workflows (
        id,
        project_id,
        workflow_type,
        status,
        input_snapshot_json,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, 'episode_generation', 'running', '{}'::jsonb, $3, $4, $4)
    `,
    [workflowId,
      projectId,
      userId,
      new Date("2026-06-03T05:00:00.000Z")],
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
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, 'episode_generate_video', 'queued', 'generation-submit-video', '{}'::jsonb, 'episode', $4, $5, $5)
    `,
    [taskId,
      projectId,
      workflowId,
      episodeId,
      new Date("2026-06-03T05:00:00.000Z")],
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
        started_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, 1, 'running', $5, $5, $5)
    `,
    [attemptId,
      projectId,
      workflowId,
      taskId,
      new Date("2026-06-03T05:00:00.000Z")],
  );
  await db.query("UPDATE tasks SET current_attempt_id = $2 WHERE id = $1", [taskId, attemptId]);
  await db.query(
    `
      INSERT INTO provider_requests (
        id,
        project_id,
        workflow_id,
        task_id,
        attempt_id,
        provider_name,
        provider_operation,
        request_key,
        request_hash,
        status,
        payload_ref,
        payload_hash,
        payload_redacted_json,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, 'volcengine', 'episode.video.generate', $6, $6, 'running', 'payload-ref', $6, '{}'::jsonb, $7, $7)
    `,
    [providerRequestId,
      projectId,
      workflowId,
      taskId,
      attemptId,
      randomUUID(),
      new Date("2026-06-03T05:00:00.000Z"),
      ],
  );
  await upsertQueuedGenerationTaskSnapshot(db, {
    projectId,
    episodeId,
    targetType: "episode",
    targetId: episodeId,
    workflowId,
    taskId,
    modelConfigId: "70000000-0000-4000-8000-000000000002",
    creditReservationId: null,
    modelCode: "seedance-i2v-pro",
    mediaType: "video",
    taskMode: "video.image_to_video",
    estimatedCredits: 135,
    requestSummary: {},
    creditSummary: { reserved: 135 },
    now: new Date("2026-06-03T05:00:00.000Z"),
  });
  return { workflowId, taskId, attemptId, providerRequestId };
}

async function loadSnapshot(db: Awaited<ReturnType<typeof createMigratedTestDb>>, taskId: string) {
  const result = await db.query<{
    status: string;
    progress_stage: string;
    progress_percent: number | null;
    provider_status_json: Record<string, unknown>;
    task_center_diagnostics_json: Record<string, unknown>;
    failure_json: Record<string, unknown> | null;
    credit_status: string;
    credit_summary_json: Record<string, unknown>;
  }>(
    `
      SELECT status, progress_stage, progress_percent, provider_status_json, task_center_diagnostics_json,
             failure_json, credit_status, credit_summary_json
      FROM ai_generation_task_snapshots
      WHERE task_id = $1
    `,
    [taskId],
  );
  return result.rows[0] ?? null;
}
