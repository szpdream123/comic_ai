import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { grantCredits, reserveCredits } from "../../credit-billing/credit-ledger.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { expireAudioGenerationPollJob } from "../audio-generation.worker.ts";
import { expireGptImagePollJob } from "../gpt-image.worker.ts";
import { expireSeedanceVideoPollJob } from "../seedance-video.worker.ts";

describe("generation poll expiration", { concurrency: false }, () => {
  it("fails active image, video, and audio tasks even when poll identifiers are missing", async () => {
    const db = await createMigratedTestDb();
    const now = new Date("2026-07-22T12:00:00.000Z");

    try {
      const seeded = await seedIncompletePollTasks(db);
      await grantCredits(db, {
        userId: seeded.userId,
        amount: 20,
        sourceType: "test_grant",
        sourceId: "70000000-0000-4000-8000-000000000402",
        reason: "poll expiration refund test grant",
        now,
      });
      const imageReservation = await reserveCredits(db, {
        userId: seeded.userId,
        amount: 20,
        sourceType: "workflow_task",
        sourceId: seeded.imageTaskId,
        reason: "poll expiration refund test reservation",
        projectId: seeded.projectId,
        workflowId: seeded.imageWorkflowId,
        taskId: seeded.imageTaskId,
        now,
      });
      await db.query(
        `
          UPDATE credit_reservations
          SET status = 'manual_review_required'
          WHERE id = $1
        `,
        [imageReservation.reservation.id],
      );

      await expireGptImagePollJob(db, { taskId: seeded.imageTaskId, now });
      await expireGptImagePollJob(db, { taskId: seeded.projectAssetTaskId, now });
      await expireSeedanceVideoPollJob(db, { taskId: seeded.videoTaskId, now, env: {} });
      await expireAudioGenerationPollJob(db, { taskId: seeded.audioTaskId, now });

      const tasks = await db.query<{ id: string; status: string; failure_code: string | null }>(`
        SELECT id, status, failure_code
        FROM tasks
        WHERE id = ANY($1::uuid[])
        ORDER BY id
      `, [[seeded.imageTaskId, seeded.videoTaskId, seeded.audioTaskId, seeded.projectAssetTaskId]]);
      const snapshots = await db.query<{ task_id: string; status: string; credit_status: string }>(`
        SELECT task_id, status, credit_status
        FROM ai_generation_task_snapshots
        WHERE task_id = ANY($1::uuid[])
        ORDER BY task_id
      `, [[seeded.imageTaskId, seeded.videoTaskId, seeded.audioTaskId, seeded.projectAssetTaskId]]);
      const reservation = await db.query<{
        status: string;
        amount_reserved: number;
        amount_released: number;
      }>(
        "SELECT status, amount_reserved, amount_released FROM credit_reservations WHERE id = $1",
        [imageReservation.reservation.id],
      );
      const teamAsset = await db.query<{ asset_status: string }>(
        "SELECT asset_status FROM team_assets WHERE id = $1",
        [seeded.teamAssetId],
      );
      const projectAsset = await db.query<{ generation_status: string; failure_code: string }>(
        `
          SELECT
            metadata_json->>'generationStatus' AS generation_status,
            metadata_json->'generationResult'->>'failureCode' AS failure_code
          FROM asset_versions
          WHERE asset_id = $1
          ORDER BY version_number DESC
          LIMIT 1
        `,
        [seeded.projectAssetId],
      );

      assert.deepEqual(tasks.rows, [
        { id: seeded.imageTaskId, status: "failed", failure_code: "provider_poll_timeout" },
        { id: seeded.videoTaskId, status: "failed", failure_code: "provider_poll_timeout" },
        { id: seeded.audioTaskId, status: "failed", failure_code: "audio_provider_poll_timeout" },
        { id: seeded.projectAssetTaskId, status: "failed", failure_code: "provider_poll_timeout" },
      ]);
      assert.deepEqual(snapshots.rows, [
        { task_id: seeded.imageTaskId, status: "failed", credit_status: "released" },
        { task_id: seeded.videoTaskId, status: "failed", credit_status: "released" },
        { task_id: seeded.audioTaskId, status: "failed", credit_status: "released" },
        { task_id: seeded.projectAssetTaskId, status: "failed", credit_status: "released" },
      ]);
      assert.deepEqual(reservation.rows[0], {
        status: "released",
        amount_reserved: 0,
        amount_released: 20,
      });
      assert.equal(teamAsset.rows[0]?.asset_status, "failed");
      assert.deepEqual(projectAsset.rows[0], {
        generation_status: "failed",
        failure_code: "provider_poll_timeout",
      });
    } finally {
      await db.close();
    }
  });
});

async function seedIncompletePollTasks(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  const userId = "70000000-0000-4000-8000-000000000401";
  const projectId = "30000000-0000-4000-8000-000000000401";
  const imageWorkflowId = "40000000-0000-4000-8000-000000000401";
  const videoWorkflowId = "40000000-0000-4000-8000-000000000402";
  const audioWorkflowId = "40000000-0000-4000-8000-000000000403";
  const imageTaskId = "50000000-0000-4000-8000-000000000401";
  const videoTaskId = "50000000-0000-4000-8000-000000000402";
  const audioTaskId = "50000000-0000-4000-8000-000000000403";
  const teamAssetId = "60000000-0000-4000-8000-000000000401";
  const projectAssetId = "60000000-0000-4000-8000-000000000402";
  const projectAssetWorkflowId = "40000000-0000-4000-8000-000000000404";
  const projectAssetTaskId = "50000000-0000-4000-8000-000000000404";
  const submittedAt = new Date("2026-07-22T10:00:00.000Z");

  await db.query("INSERT INTO users (id, phone_e164, status) VALUES ($1, '13800138401', 'active')", [userId]);
  await db.query(
    `
      INSERT INTO team_assets (
        id, admin_user_id, asset_name, asset_prompt, asset_category, asset_status,
        resource_type, created_by_name, updated_by_name, created_user_id
      )
      VALUES ($1, $2, 'Poll expiration asset', 'Poll expiration asset', 'character',
        'generating', 'image/png', 'Admin', 'Admin', $2)
    `,
    [teamAssetId, userId],
  );
  await db.query(
    `
      INSERT INTO projects (id, name, aspect_ratio, resolution, phase, created_by_user_id, owner_user_id)
      VALUES ($1, 'Poll expiration test', '16:9', '1080p', 'script_input', $2, $2)
    `,
    [projectId, userId],
  );
  await db.query(
    `
      INSERT INTO workflows (id, project_id, workflow_type, status, input_snapshot_json, created_by_user_id)
      VALUES
        ($1, $4, 'episode_image_generation', 'running', '{}'::jsonb, $5),
        ($2, $4, 'episode_video_generation', 'running', '{}'::jsonb, $5),
        ($3, $4, 'episode_audio_generation', 'running', '{}'::jsonb, $5)
    `,
    [imageWorkflowId, videoWorkflowId, audioWorkflowId, projectId, userId],
  );
  await db.query(
    `
      INSERT INTO tasks (
        id, project_id, workflow_id, task_type, status, failure_code, queue_name,
        input_snapshot_json, target_entity_type, target_entity_id
      )
      VALUES
        ($1, $4, $5, 'episode_generate_image', 'result_unknown', 'provider_result_unknown', 'generation-poll-image',
          jsonb_build_object('providerExecutor', 'gpt-image-2', 'kind', 'image', 'cost', 0,
            'targetType', 'team_asset', 'targetId', $8::text), 'team_asset', $8::uuid),
        ($2, $4, $6, 'episode_generate_video', 'result_unknown', 'provider_result_unknown', 'generation-poll-video',
          '{"providerExecutor":"seedance","kind":"video","cost":0}'::jsonb, 'episode', $2),
        ($3, $4, $7, 'episode_generate_audio', 'result_unknown', 'provider_result_unknown', 'generation-poll-audio',
          '{"providerExecutor":"aliyun-bailian-audio","kind":"audio","cost":0}'::jsonb, 'episode', $3)
    `,
    [imageTaskId, videoTaskId, audioTaskId, projectId, imageWorkflowId, videoWorkflowId, audioWorkflowId, teamAssetId],
  );
  await db.query(
    `
      INSERT INTO ai_generation_task_snapshots (
        id, user_id, project_id, target_type, target_id, workflow_id, task_id,
        model_code, media_type, task_mode, status, progress_stage, credit_status,
        submitted_at, started_at
      )
      VALUES
        ('90000000-0000-4000-8000-000000000401', $1, $2, 'team_asset', $10, $6, $3,
          'gpt-image-2-cn', 'image', 'image.generate', 'result_unknown', 'provider_result_unknown',
          'manual_review_required', $9, $9),
        ('90000000-0000-4000-8000-000000000402', $1, $2, 'episode', $4, $7, $4,
          'seedance-i2v-pro', 'video', 'video.image_to_video', 'result_unknown', 'provider_result_unknown',
          'manual_review_required', $9, $9),
        ('90000000-0000-4000-8000-000000000403', $1, $2, 'episode', $5, $8, $5,
          'cosyvoice-v2', 'audio', 'audio.text_to_speech', 'result_unknown', 'provider_result_unknown',
          'manual_review_required', $9, $9)
    `,
    [userId, projectId, imageTaskId, videoTaskId, audioTaskId, imageWorkflowId, videoWorkflowId, audioWorkflowId, submittedAt, teamAssetId],
  );
  await db.query(
    `
      INSERT INTO assets (
        id, project_id, asset_type, asset_key, created_by_user_id, created_at, updated_at
      )
      VALUES ($1, $2, 'character_sheet', 'poll-expiration-project-asset', $3, $4, $4)
    `,
    [projectAssetId, projectId, userId, submittedAt],
  );
  await db.query(
    `
      INSERT INTO asset_versions (
        id, asset_id, version_number, storage_object_key, metadata_json,
        created_by_user_id, created_at
      )
      VALUES (
        '80000000-0000-4000-8000-000000000401', $1, 1,
        'project-assets/poll-expiration-pending.png',
        jsonb_build_object(
          'generationTaskId', $2::text,
          'generationStatus', 'running',
          'generationResult', jsonb_build_object('taskId', $2::text, 'status', 'running')
        ),
        $3, $4
      )
    `,
    [projectAssetId, projectAssetTaskId, userId, submittedAt],
  );
  await db.query(
    `
      INSERT INTO workflows (
        id, project_id, workflow_type, status, input_snapshot_json, created_by_user_id
      )
      VALUES ($1, $2, 'episode_image_generation', 'running', '{}'::jsonb, $3)
    `,
    [projectAssetWorkflowId, projectId, userId],
  );
  await db.query(
    `
      INSERT INTO tasks (
        id, project_id, workflow_id, task_type, status, failure_code, queue_name,
        input_snapshot_json, target_entity_type, target_entity_id
      )
      VALUES (
        $1, $2, $3, 'episode_generate_image', 'result_unknown', 'provider_result_unknown',
        'generation-poll-image', jsonb_build_object(
          'providerExecutor', 'gpt-image-2',
          'kind', 'image',
          'cost', 0,
          'targetType', 'asset',
          'targetId', $4::text,
          'projectAssetId', $4::text
        ),
        'asset', $4::uuid
      )
    `,
    [projectAssetTaskId, projectId, projectAssetWorkflowId, projectAssetId],
  );
  await db.query(
    `
      INSERT INTO ai_generation_task_snapshots (
        id, user_id, project_id, target_type, target_id, workflow_id, task_id,
        model_code, media_type, task_mode, status, progress_stage, credit_status,
        submitted_at, started_at
      )
      VALUES (
        '90000000-0000-4000-8000-000000000404', $1, $2, 'asset', $3, $4, $5,
        'gpt-image-2-cn', 'image', 'image.generate', 'result_unknown',
        'provider_result_unknown', 'manual_review_required', $6, $6
      )
    `,
    [userId, projectId, projectAssetId, projectAssetWorkflowId, projectAssetTaskId, submittedAt],
  );

  return {
    userId,
    projectId,
    imageWorkflowId,
    imageTaskId,
    teamAssetId,
    projectAssetId,
    projectAssetTaskId,
    videoTaskId,
    audioTaskId,
  };
}
