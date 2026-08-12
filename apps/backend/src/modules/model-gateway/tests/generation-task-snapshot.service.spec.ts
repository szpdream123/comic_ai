import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createCanvasNodeRun } from "../../project/creator-canvas-record.service.ts";
import {
  markGenerationTaskSnapshotFailed,
  markGenerationTaskSnapshotManualReviewRequired,
  markGenerationTaskSnapshotResultUnknown,
  markGenerationTaskSnapshotRunning,
  markGenerationTaskSnapshotSucceeded,
  upsertQueuedGenerationTaskSnapshot,
} from "../generation-task-snapshot.service.ts";

const projectId = "40000000-0000-4000-8000-000000000001";
const episodeId = "90000000-0000-4000-8000-000000000001";

describe("generation task snapshot service", () => {
  it("persists successful Canvas task results into node run history", async () => {
    const db = await createMigratedTestDb();
    try {
      const ids = await seedSnapshotFixture(db);
      const canvas = await createSnapshotCanvas(db, {
        userId: ids.userId,
        now: new Date("2026-06-03T05:00:30.000Z"),
      });
      await db.query(`
        UPDATE ai_generation_task_snapshots
        SET project_id=NULL,
            canvas_project_id=$2,
            target_type='canvas',
            target_id=$2,
            media_type='image',
            request_summary_json=jsonb_build_object('canvasNodeId', 'image-1')
        WHERE task_id=$1
      `, [ids.taskId, canvas.canvasProjectId]);
      await db.query(
        `
          INSERT INTO storage_objects (
            id, canvas_project_id, bucket, object_key, content_type,
            size_bytes, created_by_user_id, provider, status
          )
          VALUES ($1, $2, 'snapshot-test', 'canvas/image-1.png', 'image/png',
                  128, $3, 'test', 'available')
        `,
        ["80000000-0000-4000-8000-000000000001", canvas.canvasProjectId, ids.userId],
      );
      const run = await createCanvasNodeRun(db, {
        canvasProjectId: canvas.canvasProjectId,
        nodeKey: "image-1",
        idempotencyKey: "snapshot-canvas-image-1",
        status: "queued",
        mediaKind: "image",
        taskId: ids.taskId,
        targetType: "canvas",
        targetId: "image-1",
        userId: ids.userId,
        now: new Date("2026-06-03T05:00:30.000Z"),
      });
      await db.query("UPDATE tasks SET status = 'succeeded' WHERE id = $1", [ids.taskId]);
      await db.query("UPDATE task_attempts SET status = 'succeeded' WHERE id = $1", [ids.attemptId]);

      await markGenerationTaskSnapshotSucceeded(db, {
        taskId: ids.taskId,
        attemptId: ids.attemptId,
        providerRequestId: ids.providerRequestId,
        resultAssets: [{
          mediaKind: "image",
          storageObjectId: "80000000-0000-4000-8000-000000000001",
          previewUrl: "https://cdn.example.test/canvas-image.png",
        }],
        now: new Date("2026-06-03T05:01:00.000Z"),
      });

      const persisted = await db.query<{
        status: string;
        artifact_count: number;
        storage_object_id: string | null;
      }>(`
        SELECT run.status,
               count(artifact.id)::int AS artifact_count,
               max(artifact.storage_object_id::text) AS storage_object_id
        FROM creator_canvas_node_runs run
        LEFT JOIN creator_canvas_node_artifacts artifact ON artifact.run_id=run.id
        WHERE run.id=$1
        GROUP BY run.status
      `, [run.id]);
      assert.deepEqual(persisted.rows[0], {
        status: "succeeded",
        artifact_count: 1,
        storage_object_id: "80000000-0000-4000-8000-000000000001",
      });
    } finally {
      await db.close();
    }
  });

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

      await db.query("UPDATE tasks SET status = 'result_unknown' WHERE id = $1", [ids.taskId]);
      await db.query("UPDATE task_attempts SET status = 'result_unknown' WHERE id = $1", [ids.attemptId]);
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

      await db.query("UPDATE tasks SET status = 'manual_review_required' WHERE id = $1", [ids.taskId]);
      await db.query("UPDATE task_attempts SET status = 'manual_review_required' WHERE id = $1", [ids.attemptId]);
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

  it("does not let a historical attempt overwrite the current task snapshot", async () => {
    const db = await createMigratedTestDb();
    try {
      const ids = await seedSnapshotFixture(db);
      const currentAttemptId = randomUUID();
      await db.query(
        `
          INSERT INTO task_attempts (
            id, project_id, workflow_id, task_id, attempt_number, status,
            started_at, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, 2, 'running', $5, $5, $5)
        `,
        [
          currentAttemptId,
          projectId,
          ids.workflowId,
          ids.taskId,
          new Date("2026-06-03T05:01:00.000Z"),
        ],
      );
      await db.query(
        `
          UPDATE tasks
          SET current_attempt_id = $1,
              attempt_count = 2,
              status = 'running',
              updated_at = $3
          WHERE id = $2
        `,
        [
          currentAttemptId,
          ids.taskId,
          new Date("2026-06-03T05:01:00.000Z"),
        ],
      );

      await markGenerationTaskSnapshotRunning(db, {
        taskId: ids.taskId,
        attemptId: ids.attemptId,
        providerRequestId: ids.providerRequestId,
        progressStage: "provider_rendering",
        progressPercent: 80,
        now: new Date("2026-06-03T05:02:00.000Z"),
      });
      await markGenerationTaskSnapshotFailed(db, {
        taskId: ids.taskId,
        attemptId: ids.attemptId,
        providerRequestId: ids.providerRequestId,
        failure: { failureCode: "late_attempt_failure" },
        now: new Date("2026-06-03T05:03:00.000Z"),
      });
      const snapshot = await loadSnapshot(db, ids.taskId);

      assert.equal(snapshot?.status, "queued");
      assert.equal(snapshot?.progress_stage, "task_created");
      assert.equal(snapshot?.progress_percent, 10);
    } finally {
      await db.close();
    }
  });

  it("does not let a delayed terminal snapshot overwrite a resumed attempt", async () => {
    const db = await createMigratedTestDb();
    try {
      const ids = await seedSnapshotFixture(db);
      await db.query("UPDATE tasks SET status = 'result_unknown' WHERE id = $1", [ids.taskId]);
      await db.query("UPDATE task_attempts SET status = 'result_unknown' WHERE id = $1", [ids.attemptId]);
      await markGenerationTaskSnapshotResultUnknown(db, {
        taskId: ids.taskId,
        attemptId: ids.attemptId,
        failure: { failureCode: "provider_poll_timeout" },
        now: new Date("2026-06-03T05:01:00.000Z"),
      });
      await db.query("UPDATE tasks SET status = 'running', failure_code = NULL WHERE id = $1", [ids.taskId]);
      await db.query("UPDATE task_attempts SET status = 'running', failure_code = NULL WHERE id = $1", [ids.attemptId]);
      await markGenerationTaskSnapshotRunning(db, {
        taskId: ids.taskId,
        attemptId: ids.attemptId,
        progressStage: "provider_poll_resumed",
        progressPercent: 50,
        now: new Date("2026-06-03T05:02:00.000Z"),
      });

      await markGenerationTaskSnapshotResultUnknown(db, {
        taskId: ids.taskId,
        attemptId: ids.attemptId,
        failure: { failureCode: "delayed_old_poll_timeout" },
        now: new Date("2026-06-03T05:03:00.000Z"),
      });
      const snapshot = await loadSnapshot(db, ids.taskId);

      assert.equal(snapshot?.status, "running");
      assert.equal(snapshot?.progress_stage, "provider_poll_resumed");
      assert.equal(snapshot?.failure_json?.failureCode, "provider_poll_timeout");
    } finally {
      await db.close();
    }
  });

  it("translates provider error messages before storing snapshot failure fields", async () => {
    const db = await createMigratedTestDb();
    try {
      const ids = await seedSnapshotFixture(db);

      await db.query("UPDATE tasks SET status = 'failed' WHERE id = $1", [ids.taskId]);
      await db.query("UPDATE task_attempts SET status = 'failed' WHERE id = $1", [ids.attemptId]);
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
  await db.query(
    "UPDATE tasks SET status = 'running', current_attempt_id = $2 WHERE id = $1",
    [taskId, attemptId],
  );
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
  return { workflowId, taskId, attemptId, providerRequestId, userId };
}

async function createSnapshotCanvas(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: { userId: string; now: Date },
) {
  const canvasProjectId = randomUUID();
  const documentId = randomUUID();
  const nowIso = input.now.toISOString();
  const document = {
    version: 2,
    canvasProjectId,
    viewport: { x: 0, y: 0, zoom: 1, gridVisible: true, snapEnabled: true },
    nodes: [],
    edges: [],
    groups: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await db.query(`
    INSERT INTO creator_canvas_projects (
      id,title,status,server_revision,
      created_by_user_id,updated_by_user_id,created_at,updated_at
    ) VALUES ($1,'Snapshot Canvas','active',1,$2,$2,$3,$3)
  `, [canvasProjectId, input.userId, input.now]);
  await db.query(`
    INSERT INTO creator_canvas_documents (
      id,canvas_project_id,schema_version,server_revision,document_json,viewport_json,
      node_count,edge_count,created_by_user_id,updated_by_user_id,created_at,updated_at
    ) VALUES ($1,$2,2,1,$3::jsonb,$4::jsonb,0,0,$5,$5,$6,$6)
  `, [documentId, canvasProjectId, JSON.stringify(document), JSON.stringify(document.viewport), input.userId, input.now]);
  await db.query("UPDATE creator_canvas_projects SET latest_document_id=$2 WHERE id=$1", [canvasProjectId, documentId]);
  await db.query(
    `
      INSERT INTO creator_canvas_nodes (
        id, canvas_project_id, node_key, node_type, title, status,
        media_kind, source_kind, created_by_user_id, updated_by_user_id,
        created_at, updated_at
      )
      VALUES ($1, $2, 'image-1', 'ai-image', 'Snapshot Image', 'idle',
              'image', 'generation', $3, $3, $4, $4)
    `,
    [randomUUID(), canvasProjectId, input.userId, input.now],
  );
  return { canvasProjectId };
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
