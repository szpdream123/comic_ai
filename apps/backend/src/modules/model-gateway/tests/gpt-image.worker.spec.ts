import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createPhoneAuthDevServer } from "../../../entrypoints/phone-auth-dev-server.ts";
import { createAssetVersionSnapshot } from "../../project/asset-version-record.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createScopedStorageObject } from "../../storage/storage.service.ts";
import type { UploadSessionRuntime } from "../../storage/upload-session.service.ts";
import {
  finalizeGptImageArtifactJob,
  persistGptImageArtifactJob,
  processGptImageSubmitJob,
} from "../gpt-image.worker.ts";

describe("GPT Image 2 BullMQ worker service", () => {
  it("submits, defers finalization, then uploads the generated image to storage, persists the result, and consumes credits", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_model = 'gpt-image-2',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://image-gateway.example.test","endpoint":"/v1/images/generations","apiKeyEnv":"GPT_IMAGE2_API_KEY"}'::jsonb,
            pricing_json = pricing_json || '{"baseCredits":77}'::jsonb
        WHERE model_code = 'gpt-image-2-cn'
      `,
    );
    const providerCalls: Array<{ url: string; body: string }> = [];
    const uploadedBodies: unknown[] = [];
    const runtime: UploadSessionRuntime = {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "creator-test",
      region: "ap-guangzhou",
      publicBaseUrl: "https://platform-storage.example.test",
      adapter: {
        async createSignedReadUrl(input) {
          return {
            url: `https://platform-storage.example.test/${input.objectKey}`,
            expiresAt: input.expiresAt,
          };
        },
        async putObject(input) {
          uploadedBodies.push(input.body);
          return { eTag: "gpt-image-worker-etag" };
        },
      },
    };
    const env = {
      NODE_ENV: "test",
      GPT_IMAGE2_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
      GPT_IMAGE2_API_KEY: "gpt-image-test-key",
      STORAGE_PUBLIC_BASE_URL: "https://platform-storage.example.test",
      GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS: "3",
      GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS: "0",
    };
    const fetchImpl = (async (url, init) => {
      providerCalls.push({
        url: String(url),
        body: String(init?.body ?? ""),
      });
      return new Response(
        JSON.stringify({
          created: 1_717_200_000,
          data: [
            {
              b64_json: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64"),
              revised_prompt: "polished comic panel",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-request-id": "gpt-image-request-1",
          },
        },
      );
    }) as typeof fetch;
    const server = createPhoneAuthDevServer({
      db,
      env,
      fetchImpl,
      storageRuntime: runtime,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const created = await createProjectAndEpisode(server.origin, cookie);
      const imageTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/image-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "gpt-image-worker-image-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            prompt: "draw the second comic image",
            model: "gpt-image-2-cn",
            parameters: {
              aspectRatio: "9:16",
              quality: "high",
            },
          }),
        },
      );
      const imageTask = (await imageTaskResponse.json()).data;
      const queuedSnapshot = await db.query<{
        status: string;
        progress_stage: string;
        credit_status: string;
        estimated_credits: number | string;
        model_code: string;
        media_type: string;
      }>(
        `
          SELECT status, progress_stage, credit_status, estimated_credits, model_code, media_type
          FROM ai_generation_task_snapshots
          WHERE task_id = $1
        `,
        [imageTask.taskId],
      );

      const submitResult = await processGptImageSubmitJob(db, {
        taskId: imageTask.taskId,
        runtime,
        env,
        fetchImpl,
        now: new Date("2026-06-03T04:00:00.000Z"),
      });
      const runningTaskResponse = await fetch(
        `${server.origin}/api/generation-tasks/${imageTask.taskId}`,
        { headers: { cookie } },
      );
      const runningTask = (await runningTaskResponse.json()).data;
      assert.equal(uploadedBodies.length, 0);
      const finalizeResult = await finalizeGptImageArtifactJob(db, {
        taskId: imageTask.taskId,
        runtime,
        env,
        fetchImpl,
        now: new Date("2026-06-03T04:00:05.000Z"),
      });
      const completedTaskResponse = await fetch(
        `${server.origin}/api/generation-tasks/${imageTask.taskId}`,
        { headers: { cookie } },
      );
      const completedTask = (await completedTaskResponse.json()).data;
      const completedSnapshot = await db.query<{
        status: string;
        progress_stage: string;
        credit_status: string;
        result_assets_json: Array<{ url?: string; mediaKind?: string }>;
      }>(
        `
          SELECT status, progress_stage, credit_status, result_assets_json
          FROM ai_generation_task_snapshots
          WHERE task_id = $1
        `,
        [imageTask.taskId],
      );
      const reservation = await db.query<{
        amount_reserved: number | string;
        amount_consumed: number | string;
        status: string;
      }>(
        "SELECT amount_reserved, amount_consumed, status FROM credit_reservations WHERE task_id = $1",
        [imageTask.taskId],
      );

      assert.equal(imageTaskResponse.status, 200);
      assert.equal(imageTask.status, "queued");
      assert.deepEqual(queuedSnapshot.rows[0], {
        status: "queued",
        progress_stage: "queued",
        credit_status: "reserved",
        estimated_credits: 77,
        model_code: "gpt-image-2-cn",
        media_type: "image",
      });
      assert.deepEqual(submitResult, { status: "submitted" });
      assert.equal(providerCalls[0]?.url, "https://image-gateway.example.test/v1/images/generations");
      assert.match(providerCalls[0]?.body ?? "", /gpt-image-2/);
      assert.equal(runningTaskResponse.status, 200);
      assert.equal(runningTask.status, "running");
      assert.deepEqual(finalizeResult, { status: "succeeded" });
      assert.equal(uploadedBodies.length, 1);
      assert.equal(uploadedBodies[0] instanceof Uint8Array, true);
      assert.equal(completedTaskResponse.status, 200);
      assert.equal(completedTask.status, "succeeded");
      assert.equal(completedTask.result.mediaKind, "image");
      assert.match(completedTask.result.imageUrl, /platform-storage\.example\.test/);
      assert.equal(completedSnapshot.rows[0]?.status, "succeeded");
      assert.equal(completedSnapshot.rows[0]?.progress_stage, "completed");
      assert.equal(completedSnapshot.rows[0]?.credit_status, "consumed");
      assert.equal(completedSnapshot.rows[0]?.result_assets_json[0]?.mediaKind, "image");
      assert.match(completedSnapshot.rows[0]?.result_assets_json[0]?.url ?? "", /platform-storage\.example\.test/);
      assert.equal(Number(reservation.rows[0]?.amount_reserved ?? -1), 0);
      assert.equal(Number(reservation.rows[0]?.amount_consumed ?? -1), 77);
      assert.equal(reservation.rows[0]?.status, "settled");
    } finally {
      await server.close();
    }
  });

  it("resolves referenceAssetVersionIds into GPT Image 2 edits multipart references", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_model = 'gpt-image-2',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://image-gateway.example.test","endpoint":"/v1/images/generations","editEndpoint":"/v1/images/edits","apiKeyEnv":"GPT_IMAGE2_API_KEY"}'::jsonb
        WHERE model_code = 'gpt-image-2-cn'
      `,
    );
    const providerCalls: Array<{ url: string; body: BodyInit | null | undefined }> = [];
    const runtime: UploadSessionRuntime = {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "creator-test",
      region: "ap-guangzhou",
      publicBaseUrl: "https://platform-storage.example.test",
      adapter: {
        async createSignedReadUrl(input) {
          return {
            url: `https://platform-storage.example.test/${input.objectKey}`,
            expiresAt: input.expiresAt,
          };
        },
        async putObject() {
          return { eTag: "gpt-image-worker-edit-etag" };
        },
      },
    };
    const env = {
      NODE_ENV: "test",
      GPT_IMAGE2_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
      GPT_IMAGE2_API_KEY: "gpt-image-test-key",
      STORAGE_PUBLIC_BASE_URL: "https://platform-storage.example.test",
      GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS: "3",
      GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS: "0",
    };
    const fetchImpl = (async (url, init) => {
      const requestUrl = String(url);
      if (requestUrl.startsWith("https://platform-storage.example.test/")) {
        return new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: {
            "content-type": "image/png",
            "content-length": "4",
          },
        });
      }
      providerCalls.push({
        url: requestUrl,
        body: init?.body,
      });
      return new Response(
        JSON.stringify({
          created: 1_717_200_001,
          data: [
            {
              b64_json: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64"),
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-request-id": "gpt-image-edit-request-1",
          },
        },
      );
    }) as typeof fetch;
    const server = createPhoneAuthDevServer({
      db,
      env,
      fetchImpl,
      storageRuntime: runtime,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const created = await createProjectAndEpisode(server.origin, cookie);
      const projectScope = await db.query<{
        organization_id: string;
        workspace_id: string;
        created_by_user_id: string | null;
      }>(
        "SELECT organization_id, workspace_id, created_by_user_id FROM projects WHERE id = $1",
        [created.projectId],
      );
      const storageObject = await createScopedStorageObject(db, {
        organizationId: projectScope.rows[0]!.organization_id,
        workspaceId: projectScope.rows[0]!.workspace_id,
        projectId: created.projectId,
        bucket: runtime.bucket,
        objectName: "references/hero.png",
        contentType: "image/png",
        sizeBytes: 4,
        provider: runtime.provider,
        status: "available",
        metadata: { label: "hero reference" },
        createdByUserId: projectScope.rows[0]!.created_by_user_id,
        now: new Date("2026-06-03T04:05:00.000Z"),
      });
      const referenceVersion = await createAssetVersionSnapshot(db, {
        organizationId: projectScope.rows[0]!.organization_id,
        projectId: created.projectId,
        assetType: "character_sheet",
        assetKey: "hero-reference",
        createdByUserId: projectScope.rows[0]!.created_by_user_id ?? "",
        storageObjectId: storageObject.id,
        storageObjectKey: storageObject.objectKey,
        metadata: {
          mimeType: "image/png",
          label: "hero reference",
          previewUrl: `https://platform-storage.example.test/${storageObject.objectKey}`,
        },
        sourceTaskId: null,
        sourceAttemptId: null,
        now: new Date("2026-06-03T04:05:01.000Z"),
      });
      const imageTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/image-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "gpt-image-worker-reference-image-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            prompt: "draw the same hero in a new panel",
            model: "gpt-image-2-cn",
            referenceAssetVersionIds: [referenceVersion.version.id],
            parameters: {
              aspectRatio: "9:16",
              quality: "high",
            },
          }),
        },
      );
      const imageTask = (await imageTaskResponse.json()).data;

      const submitResult = await processGptImageSubmitJob(db, {
        taskId: imageTask.taskId,
        runtime,
        env,
        fetchImpl,
        now: new Date("2026-06-03T04:06:00.000Z"),
      });

      assert.equal(imageTaskResponse.status, 200);
      assert.deepEqual(submitResult, { status: "submitted" });
      assert.equal(providerCalls[0]?.url, "https://image-gateway.example.test/v1/images/edits");
      assert.equal(providerCalls[0]?.body instanceof FormData, true);
      assert.equal((providerCalls[0]?.body as FormData).getAll("image").length, 1);
    } finally {
      await server.close();
    }
  });

  it("keeps uploaded GPT Image 2 storage objects in manual review when asset persistence fails", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET provider_model = 'gpt-image-2',
            provider_config_json = provider_config_json
              || '{"baseURL":"https://image-gateway.example.test","endpoint":"/v1/images/generations","apiKeyEnv":"GPT_IMAGE2_API_KEY"}'::jsonb,
            pricing_json = pricing_json || '{"baseCredits":77}'::jsonb
        WHERE model_code = 'gpt-image-2-cn'
      `,
    );
    const runtime: UploadSessionRuntime = {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "creator-test",
      region: "ap-guangzhou",
      publicBaseUrl: "https://platform-storage.example.test",
      adapter: {
        async createSignedReadUrl(input) {
          return {
            url: `https://platform-storage.example.test/${input.objectKey}`,
            expiresAt: input.expiresAt,
          };
        },
        async putObject() {
          return { eTag: "gpt-image-worker-etag" };
        },
      },
    };
    const env = {
      NODE_ENV: "test",
      GPT_IMAGE2_PROVIDER_ENABLED: "true",
      BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
      GPT_IMAGE2_API_KEY: "gpt-image-test-key",
      STORAGE_PUBLIC_BASE_URL: "https://platform-storage.example.test",
      GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS: "3",
      GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS: "0",
    };
    const fetchImpl = (async () => new Response(
      JSON.stringify({
        data: [
          {
            b64_json: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64"),
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;
    const server = createPhoneAuthDevServer({
      db,
      env,
      fetchImpl,
      storageRuntime: runtime,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138011");
      const created = await createProjectAndEpisode(server.origin, cookie, "gpt-image-persist-failure-project");
      const imageTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/image-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "gpt-image-persist-failure-task",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            prompt: "draw the second comic image",
            model: "gpt-image-2-cn",
            parameters: {
              aspectRatio: "9:16",
              quality: "high",
            },
          }),
        },
      );
      const imageTask = (await imageTaskResponse.json()).data;
      await processGptImageSubmitJob(db, {
        taskId: imageTask.taskId,
        runtime,
        env,
        fetchImpl,
        now: new Date("2026-06-03T04:30:00.000Z"),
      });
      await db.query(
        `
          UPDATE tasks
          SET project_id = NULL,
              input_snapshot_json = input_snapshot_json || $2::jsonb
          WHERE id = $1
        `,
        [
          imageTask.taskId,
          JSON.stringify({ targetType: "asset", assetType: "role" }),
        ],
      );

      const finalizeResult = await finalizeGptImageArtifactJob(db, {
        taskId: imageTask.taskId,
        runtime,
        env,
        fetchImpl,
        now: new Date("2026-06-03T04:31:00.000Z"),
      });
      const snapshot = await db.query<{
        status: string;
        credit_status: string;
        failure_json: { failureCode?: string; noticeType?: string; storageObjectKey?: string } | null;
      }>(
        `
          SELECT status, credit_status, failure_json
          FROM ai_generation_task_snapshots
          WHERE task_id = $1
        `,
        [imageTask.taskId],
      );
      const reservation = await db.query<{
        amount_reserved: number | string;
        amount_released: number | string;
        status: string;
      }>(
        "SELECT amount_reserved, amount_released, status FROM credit_reservations WHERE task_id = $1",
        [imageTask.taskId],
      );

      assert.deepEqual(finalizeResult, {
        status: "failed",
        failureCode: "provider_output_persist_failed",
      });
      assert.equal(snapshot.rows[0]?.status, "manual_review_required");
      assert.equal(snapshot.rows[0]?.credit_status, "manual_review_required");
      assert.equal(snapshot.rows[0]?.failure_json?.failureCode, "provider_output_persist_failed");
      assert.equal(snapshot.rows[0]?.failure_json?.noticeType, "manual_review");
      assert.match(snapshot.rows[0]?.failure_json?.storageObjectKey ?? "", /gpt-image/);
      assert.equal(Number(reservation.rows[0]?.amount_reserved ?? -1), 77);
      assert.equal(Number(reservation.rows[0]?.amount_released ?? -1), 0);
      assert.equal(reservation.rows[0]?.status, "manual_review_required");

      await db.query(
        `
          UPDATE tasks
          SET project_id = $2,
              input_snapshot_json = input_snapshot_json || $3::jsonb
          WHERE id = $1
        `,
        [
          imageTask.taskId,
          created.projectId,
          JSON.stringify({ targetType: "episode", targetId: created.episodeId, assetType: null }),
        ],
      );
      const retryRuntime: UploadSessionRuntime = {
        ...runtime,
        adapter: {
          async createSignedReadUrl(input) {
            return {
              url: `https://platform-storage.example.test/${input.objectKey}`,
              expiresAt: new Date("2026-06-03T05:01:00.000Z"),
            };
          },
          async putObject() {
            throw new Error("persist-only retry must not upload again");
          },
        },
      };
      const retryResult = await persistGptImageArtifactJob(db, {
        taskId: imageTask.taskId,
        runtime: retryRuntime,
        env,
        now: new Date("2026-06-03T04:32:00.000Z"),
      });
      const persisted = await db.query<{ status: string; asset_version_id: string | null }>(
        `
          SELECT t.status, av.id AS asset_version_id
          FROM tasks t
          LEFT JOIN asset_versions av
            ON av.organization_id = t.organization_id
           AND av.source_task_id = t.id
          WHERE t.id = $1
          ORDER BY av.created_at DESC NULLS LAST
          LIMIT 1
        `,
        [imageTask.taskId],
      );

      assert.deepEqual(retryResult, { status: "succeeded" });
      assert.equal(persisted.rows[0]?.status, "succeeded");
      assert.ok(persisted.rows[0]?.asset_version_id);
    } finally {
      await server.close();
    }
  });

  it("rejects GPT Image 2 reference asset versions over the configured maxReferences limit", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET limits_json = limits_json || '{"maxReferences":1}'::jsonb
        WHERE model_code = 'gpt-image-2-cn'
      `,
    );
    const runtime: UploadSessionRuntime = {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "creator-test",
      region: "ap-guangzhou",
      publicBaseUrl: "https://platform-storage.example.test",
      adapter: {
        async createSignedReadUrl(input) {
          return {
            url: `https://platform-storage.example.test/${input.objectKey}`,
            expiresAt: input.expiresAt,
          };
        },
        async putObject() {
          return { eTag: "unused" };
        },
      },
    };
    const server = createPhoneAuthDevServer({
      db,
      env: {
        NODE_ENV: "test",
        GPT_IMAGE2_PROVIDER_ENABLED: "true",
        GPT_IMAGE2_API_KEY: "gpt-image-test-key",
      },
      storageRuntime: runtime,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const created = await createProjectAndEpisode(server.origin, cookie);
      const projectScope = await db.query<{
        organization_id: string;
        workspace_id: string;
        created_by_user_id: string | null;
      }>(
        "SELECT organization_id, workspace_id, created_by_user_id FROM projects WHERE id = $1",
        [created.projectId],
      );
      const referenceVersionIds = [];
      for (const index of [1, 2]) {
        const storageObject = await createScopedStorageObject(db, {
          organizationId: projectScope.rows[0]!.organization_id,
          workspaceId: projectScope.rows[0]!.workspace_id,
          projectId: created.projectId,
          bucket: runtime.bucket,
          objectName: `references/hero-${index}.png`,
          contentType: "image/png",
          sizeBytes: 4,
          provider: runtime.provider,
          status: "available",
          createdByUserId: projectScope.rows[0]!.created_by_user_id,
          now: new Date(`2026-06-03T04:1${index}:00.000Z`),
        });
        const referenceVersion = await createAssetVersionSnapshot(db, {
          organizationId: projectScope.rows[0]!.organization_id,
          projectId: created.projectId,
          assetType: "character_sheet",
          assetKey: `hero-reference-${index}`,
          createdByUserId: projectScope.rows[0]!.created_by_user_id ?? "",
          storageObjectId: storageObject.id,
          storageObjectKey: storageObject.objectKey,
          metadata: {
            mimeType: "image/png",
            label: `hero reference ${index}`,
          },
          sourceTaskId: null,
          sourceAttemptId: null,
          now: new Date(`2026-06-03T04:1${index}:01.000Z`),
        });
        referenceVersionIds.push(referenceVersion.version.id);
      }

      const imageTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/image-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "gpt-image-worker-reference-limit",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            prompt: "draw with too many references",
            model: "gpt-image-2-cn",
            referenceAssetVersionIds: referenceVersionIds,
            parameters: {
              aspectRatio: "9:16",
            },
          }),
        },
      );
      const body = await imageTaskResponse.json();

      assert.equal(imageTaskResponse.status, 400);
      assert.equal(body.errorCode, "model_reference_limit_exceeded");
    } finally {
      await server.close();
    }
  });

  it("rejects GPT Image 2 reference asset versions that do not exist", async () => {
    const db = await createMigratedTestDb();
    const runtime: UploadSessionRuntime = {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "creator-test",
      region: "ap-guangzhou",
      publicBaseUrl: "https://platform-storage.example.test",
      adapter: {
        async createSignedReadUrl(input) {
          return {
            url: `https://platform-storage.example.test/${input.objectKey}`,
            expiresAt: input.expiresAt,
          };
        },
        async putObject() {
          return { eTag: "unused" };
        },
      },
    };
    const server = createPhoneAuthDevServer({
      db,
      env: {
        NODE_ENV: "test",
        GPT_IMAGE2_PROVIDER_ENABLED: "true",
        GPT_IMAGE2_API_KEY: "gpt-image-test-key",
      },
      storageRuntime: runtime,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const created = await createProjectAndEpisode(server.origin, cookie);
      const imageTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/image-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "gpt-image-worker-reference-missing",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            prompt: "draw with a missing reference",
            model: "gpt-image-2-cn",
            referenceAssetVersionIds: ["00000000-0000-4000-8000-000000000001"],
          }),
        },
      );
      const body = await imageTaskResponse.json();

      assert.equal(imageTaskResponse.status, 400);
      assert.equal(body.errorCode, "model_reference_not_found");
    } finally {
      await server.close();
    }
  });

  it("rejects GPT Image 2 reference asset versions whose storage object is unavailable", async () => {
    const db = await createMigratedTestDb();
    const runtime: UploadSessionRuntime = {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "creator-test",
      region: "ap-guangzhou",
      publicBaseUrl: "https://platform-storage.example.test",
      adapter: {
        async createSignedReadUrl(input) {
          return {
            url: `https://platform-storage.example.test/${input.objectKey}`,
            expiresAt: input.expiresAt,
          };
        },
        async putObject() {
          return { eTag: "unused" };
        },
      },
    };
    const server = createPhoneAuthDevServer({
      db,
      env: {
        NODE_ENV: "test",
        GPT_IMAGE2_PROVIDER_ENABLED: "true",
        GPT_IMAGE2_API_KEY: "gpt-image-test-key",
      },
      storageRuntime: runtime,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const created = await createProjectAndEpisode(server.origin, cookie);
      const projectScope = await db.query<{
        organization_id: string;
        workspace_id: string;
        created_by_user_id: string | null;
      }>(
        "SELECT organization_id, workspace_id, created_by_user_id FROM projects WHERE id = $1",
        [created.projectId],
      );
      const storageObject = await createScopedStorageObject(db, {
        organizationId: projectScope.rows[0]!.organization_id,
        workspaceId: projectScope.rows[0]!.workspace_id,
        projectId: created.projectId,
        bucket: runtime.bucket,
        objectName: "references/unavailable-hero.png",
        contentType: "image/png",
        sizeBytes: 4,
        provider: runtime.provider,
        status: "uploading",
        createdByUserId: projectScope.rows[0]!.created_by_user_id,
        now: new Date("2026-06-03T04:20:00.000Z"),
      });
      const referenceVersion = await createAssetVersionSnapshot(db, {
        organizationId: projectScope.rows[0]!.organization_id,
        projectId: created.projectId,
        assetType: "character_sheet",
        assetKey: "unavailable-hero-reference",
        createdByUserId: projectScope.rows[0]!.created_by_user_id ?? "",
        storageObjectId: storageObject.id,
        storageObjectKey: storageObject.objectKey,
        metadata: {
          mimeType: "image/png",
          label: "unavailable hero reference",
        },
        sourceTaskId: null,
        sourceAttemptId: null,
        now: new Date("2026-06-03T04:20:01.000Z"),
      });

      const imageTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/image-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "gpt-image-worker-reference-unavailable",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            prompt: "draw with an unavailable reference",
            model: "gpt-image-2-cn",
            referenceAssetVersionIds: [referenceVersion.version.id],
          }),
        },
      );
      const body = await imageTaskResponse.json();

      assert.equal(imageTaskResponse.status, 400);
      assert.equal(body.errorCode, "model_reference_unavailable");
    } finally {
      await server.close();
    }
  });

  it("rejects GPT Image 2 reference MIME types outside the configured model allowlist", async () => {
    const db = await createMigratedTestDb();
    await db.query(
      `
        UPDATE ai_model_configs
        SET limits_json = limits_json || '{"allowedMimeTypes":["image/png"]}'::jsonb
        WHERE model_code = 'gpt-image-2-cn'
      `,
    );
    const runtime: UploadSessionRuntime = {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "creator-test",
      region: "ap-guangzhou",
      publicBaseUrl: "https://platform-storage.example.test",
      adapter: {
        async createSignedReadUrl(input) {
          return {
            url: `https://platform-storage.example.test/${input.objectKey}`,
            expiresAt: input.expiresAt,
          };
        },
        async putObject() {
          return { eTag: "unused" };
        },
      },
    };
    const server = createPhoneAuthDevServer({
      db,
      env: {
        NODE_ENV: "test",
        GPT_IMAGE2_PROVIDER_ENABLED: "true",
        GPT_IMAGE2_API_KEY: "gpt-image-test-key",
      },
      storageRuntime: runtime,
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const cookie = await login(server.origin, "13800138000");
      const created = await createProjectAndEpisode(server.origin, cookie);
      const projectScope = await db.query<{
        organization_id: string;
        workspace_id: string;
        created_by_user_id: string | null;
      }>(
        "SELECT organization_id, workspace_id, created_by_user_id FROM projects WHERE id = $1",
        [created.projectId],
      );
      const storageObject = await createScopedStorageObject(db, {
        organizationId: projectScope.rows[0]!.organization_id,
        workspaceId: projectScope.rows[0]!.workspace_id,
        projectId: created.projectId,
        bucket: runtime.bucket,
        objectName: "references/webp-hero.webp",
        contentType: "image/webp",
        sizeBytes: 4,
        provider: runtime.provider,
        status: "available",
        createdByUserId: projectScope.rows[0]!.created_by_user_id,
        now: new Date("2026-06-03T04:30:00.000Z"),
      });
      const referenceVersion = await createAssetVersionSnapshot(db, {
        organizationId: projectScope.rows[0]!.organization_id,
        projectId: created.projectId,
        assetType: "character_sheet",
        assetKey: "webp-hero-reference",
        createdByUserId: projectScope.rows[0]!.created_by_user_id ?? "",
        storageObjectId: storageObject.id,
        storageObjectKey: storageObject.objectKey,
        metadata: {
          mimeType: "image/webp",
          label: "webp hero reference",
        },
        sourceTaskId: null,
        sourceAttemptId: null,
        now: new Date("2026-06-03T04:30:01.000Z"),
      });

      const imageTaskResponse = await fetch(
        `${server.origin}/api/episodes/${created.episodeId}/generation/image-tasks`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "gpt-image-worker-reference-mime",
            cookie,
          },
          body: JSON.stringify({
            targetType: "episode",
            targetId: created.episodeId,
            prompt: "draw with a webp reference",
            model: "gpt-image-2-cn",
            referenceAssetVersionIds: [referenceVersion.version.id],
          }),
        },
      );
      const body = await imageTaskResponse.json();

      assert.equal(imageTaskResponse.status, 400);
      assert.equal(body.errorCode, "model_reference_mime_not_allowed");
    } finally {
      await server.close();
    }
  });
});

async function login(origin: string, phone: string) {
  const requestResponse = await fetch(`${origin}/api/auth/code/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  const requested = await requestResponse.json();
  const debugResponse = await fetch(`${origin}/api/auth/dev/challenges/${requested.challengeId}`);
  const debug = await debugResponse.json();
  const verifyResponse = await fetch(`${origin}/api/auth/code/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      challengeId: requested.challengeId,
      phone,
      code: debug.code,
    }),
  });
  assert.equal(verifyResponse.status, 200);
  return verifyResponse.headers.get("set-cookie") ?? "";
}

async function createProjectAndEpisode(origin: string, cookie: string) {
  const createResponse = await fetch(`${origin}/api/creator/project/create`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "gpt-image-worker-project",
      cookie,
    },
    body: JSON.stringify({
      name: "GPT Image Worker",
      scriptInput: "Episode 1: Worker handles GPT Image 2.",
      aspectRatio: "9:16",
      resolution: "1080p",
    }),
  });
  const created = await createResponse.json();
  const episodeResponse = await fetch(`${origin}/api/projects/${created.project.id}/episodes`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
    },
    body: JSON.stringify({ title: "GPT Image Worker Task" }),
  });
  const episode = await episodeResponse.json();
  return { projectId: created.project.id, episodeId: episode.data.episode.id };
}
