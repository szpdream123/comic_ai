import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { createAuthSession } from "../../identity/session.service.ts";
import type { SqlDatabase } from "../../shared/db/sql.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createCreatorApplication } from "../creator-application.service.ts";
import { saveCanvasByCanvasProjectId } from "../creator-canvas-record.service.ts";
import { listShotsForProject, upsertShotsForProject } from "../shot-record.service.ts";

process.env.AUTH_SECRET_PEPPER ??= "creator-application-user-test-pepper";

describe("creator application user ownership", { concurrency: false }, () => {
  it("lists only projects owned by the authenticated user", async () => {
    const db = await createMigratedTestDb();
    try {
      const first = await seedAuthenticatedUser(db, {
        userId: "00000000-0000-4000-8000-000000000001",
        phone: "13800138001",
        token: "creator-first-user",
      });
      const second = await seedAuthenticatedUser(db, {
        userId: "00000000-0000-4000-8000-000000000002",
        phone: "13800138002",
        token: "creator-second-user",
      });
      const creator = createCreatorApplication({ db });

      await creator.createProject({
        user: first,
        body: { name: "First Project", scriptInput: "Episode 1", aspectRatio: "9:16", resolution: "1080p" },
        idempotencyKey: "first-project",
        now: new Date("2026-07-12T08:00:00.000Z"),
      });
      await creator.createProject({
        user: second,
        body: { name: "Second Project", scriptInput: "Episode 1", aspectRatio: "16:9", resolution: "1080p" },
        idempotencyKey: "second-project",
        now: new Date("2026-07-12T08:01:00.000Z"),
      });

      const firstProjects = await creator.listProjects({ user: first, now: new Date("2026-07-12T08:02:00.000Z") });
      const secondProjects = await creator.listProjects({ user: second, now: new Date("2026-07-12T08:02:00.000Z") });
      assert.deepEqual((firstProjects.body as { projects: Array<{ name: string }> }).projects.map((item) => item.name), ["First Project"]);
      assert.deepEqual((secondProjects.body as { projects: Array<{ name: string }> }).projects.map((item) => item.name), ["Second Project"]);
    } finally {
      await db.close();
    }
  });

  it("paginates user scripts without exposing another user's scripts", async () => {
    const db = await createMigratedTestDb();
    try {
      const first = await seedAuthenticatedUser(db, {
        userId: "00000000-0000-4000-8000-000000000011",
        phone: "13800138011",
        token: "script-first-user",
      });
      const second = await seedAuthenticatedUser(db, {
        userId: "00000000-0000-4000-8000-000000000012",
        phone: "13800138012",
        token: "script-second-user",
      });
      const creator = createCreatorApplication({ db });
      for (const [index, title] of ["One", "Two", "Three"].entries()) {
        await creator.importScriptDocument({
          user: first,
          body: { title, scriptInput: `Episode ${index + 1}` },
          now: new Date(Date.parse("2026-07-12T09:00:00.000Z") + index * 1000),
        });
      }
      await creator.importScriptDocument({
        user: second,
        body: { title: "Foreign", scriptInput: "Episode 1" },
        now: new Date("2026-07-12T09:05:00.000Z"),
      });

      const page = await creator.listUserScripts({
        user: first,
        now: new Date("2026-07-12T09:06:00.000Z"),
        page: 1,
        pageSize: 2,
        includeUntitled: true,
      });
      const body = page.body as { scripts: Array<{ title: string }>; pagination: { total: number; pageSize: number } };
      assert.equal(body.pagination.total, 3);
      assert.equal(body.pagination.pageSize, 2);
      assert.equal(body.scripts.length, 2);
      assert.equal(body.scripts.some((script) => script.title === "Foreign"), false);
    } finally {
      await db.close();
    }
  });

  it("replays project creation and parsing from the original user-scoped snapshots", async () => {
    const db = await createMigratedTestDb();

    try {
      const user = await seedAuthenticatedUser(db, {
        userId: "00000000-0000-4000-8000-000000000021",
        phone: "13800138021",
        token: "creator-user-snapshot-replay",
      });
      const creator = createCreatorApplication({ db });
      const body = {
        name: "Creator user snapshot replay",
        scriptInput: "Episode 10: Replay must not drift with live state.",
        aspectRatio: "9:16",
        resolution: "1080p",
      };

      const created = await creator.createProject({
        user,
        body,
        idempotencyKey: "creator-user-snapshot-create",
        now: new Date("2026-07-12T10:00:00.000Z"),
      });
      const parsed = await creator.parseScript({
        user,
        idempotencyKey: "creator-user-snapshot-parse",
        now: new Date("2026-07-12T10:01:00.000Z"),
      });
      const createReplay = await creator.createProject({
        user,
        body,
        idempotencyKey: "creator-user-snapshot-create",
        now: new Date("2026-07-12T10:02:00.000Z"),
      });
      const parseReplay = await creator.parseScript({
        user,
        idempotencyKey: "creator-user-snapshot-parse",
        now: new Date("2026-07-12T10:03:00.000Z"),
      });
      const counts = await db.query<{
        projects: number;
        workflows: number;
        parse_tasks: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM projects WHERE owner_user_id = $1) AS projects,
            (SELECT count(*)::int FROM workflows WHERE created_by_user_id = $1) AS workflows,
            (
              SELECT count(*)::int
              FROM tasks task
              JOIN workflows workflow ON workflow.id = task.workflow_id
              WHERE workflow.created_by_user_id = $1
                AND task.task_type = 'parse_script'
            ) AS parse_tasks
        `,
        [user.id],
      );

      assert.equal(created.status, 200);
      assert.equal(createReplay.status, 200);
      assert.deepEqual(createReplay.body.project, created.body.project);
      assert.deepEqual(createReplay.body.script, created.body.script);
      assert.equal(parsed.status, 202);
      assert.equal(parseReplay.status, 202);
      assert.deepEqual(parseReplay.body.workflow, parsed.body.workflow);
      assert.deepEqual(counts.rows[0], { projects: 1, workflows: 1, parse_tasks: 1 });
    } finally {
      await db.close();
    }
  });

  it("claims an image retry before concurrent user requests start provider work", async () => {
    const db = await createMigratedTestDb();

    try {
      const user = await seedAuthenticatedUser(db, {
        userId: "00000000-0000-4000-8000-000000000031",
        phone: "13800138031",
        token: "creator-user-image-retry-race",
      });
      const creator = createCreatorApplication({ db });
      await prepareCreatorShots(creator, user, "image-retry-race", new Date("2026-07-12T11:00:00.000Z"));
      const shot = await db.query<{ id: string }>(
        "SELECT id FROM shots ORDER BY created_at ASC LIMIT 1",
      );
      const shotId = shot.rows[0]?.id;
      assert.ok(shotId);
      await db.query(
        `
          UPDATE shots
          SET image_status = 'failed',
              current_image_asset_version_id = NULL,
              video_status = 'not_ready',
              updated_at = $2
          WHERE id = $1
        `,
        [shotId, new Date("2026-07-12T11:04:00.000Z")],
      );

      const results = await Promise.all([
        creator.retryShotImage({
          user,
          body: { shotId },
          now: new Date("2026-07-12T11:05:00.000Z"),
        }),
        creator.retryShotImage({
          user,
          body: { shotId },
          now: new Date("2026-07-12T11:05:00.000Z"),
        }),
      ]);
      const counts = await db.query<{ tasks: number; provider_requests: number }>(
        `
          SELECT
            (SELECT count(*)::int FROM tasks WHERE task_type = 'generate_shot_image') AS tasks,
            (
              SELECT count(*)::int
              FROM provider_requests
              WHERE provider_operation = 'shot.image.generate'
            ) AS provider_requests
        `,
      );

      assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
      assert.deepEqual(counts.rows[0], { tasks: 1, provider_requests: 1 });
    } finally {
      await db.close();
    }
  });

  it("rejects creator image batches above 30 tasks and video batches above 10 tasks", async () => {
    const db = await createMigratedTestDb();

    try {
      const user = await seedAuthenticatedUser(db, {
        userId: "00000000-0000-4000-8000-000000000035",
        phone: "13800138035",
        token: "creator-user-batch-limits",
      });
      const creator = createCreatorApplication({ db });
      const created = await creator.createProject({
        user,
        body: {
          name: "Creator batch limits",
          scriptInput: "Episode 1",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-user-batch-limits-create",
        now: new Date("2026-07-12T11:30:00.000Z"),
      });
      const projectId = String((created.body as { project: { id: string } }).project.id);
      const now = new Date("2026-07-12T11:31:00.000Z");
      await upsertShotsForProject(db, {
        projectId,
        createdByUserId: user.id,
        now,
        shots: Array.from({ length: 31 }, (_, index) => ({
          id: randomUUID(),
          userId: user.id,
          projectId,
          episodeId: null,
          title: `Shot ${index + 1}`,
          description: "Batch limit fixture",
          sortOrder: index,
          contentRevision: 1,
          contentStatus: "ready" as const,
          imageStatus: "completed" as const,
          videoStatus: "ready" as const,
          currentImageAssetVersionId: randomUUID(),
          currentVideoAssetVersionId: null,
          activeImageTaskId: null,
          activeImageRevision: null,
          activeVideoTaskId: null,
          activeVideoImageAssetVersionId: null,
          completedImageAssetVersionIds: [],
          completedVideoAssetVersionIds: [],
          createdByUserId: user.id,
          createdAt: now,
          updatedAt: now,
        })),
      });

      const imageResult = await creator.generateProjectShotImages({ user, now });
      const videoResult = await creator.generateVideos({ user, now });

      assert.deepEqual(imageResult, {
        status: 400,
        body: { error: "creator_image_batch_limit_exceeded" },
      });
      assert.deepEqual(videoResult, {
        status: 400,
        body: { error: "creator_video_batch_limit_exceeded" },
      });
    } finally {
      await db.close();
    }
  });

  it("claims a video retry before concurrent user requests start provider work", async () => {
    const db = await createMigratedTestDb();

    try {
      const user = await seedAuthenticatedUser(db, {
        userId: "00000000-0000-4000-8000-000000000041",
        phone: "13800138041",
        token: "creator-user-video-retry-race",
      });
      const creator = createCreatorApplication({ db });
      await prepareCreatorShots(creator, user, "video-retry-race", new Date("2026-07-12T12:00:00.000Z"));
      await creator.generateProjectShotImages({
        user,
        now: new Date("2026-07-12T12:03:00.000Z"),
      });
      const shot = await db.query<{ id: string }>(
        "SELECT id FROM shots ORDER BY created_at ASC LIMIT 1",
      );
      const shotId = shot.rows[0]?.id;
      assert.ok(shotId);
      await db.query(
        `
          UPDATE shots
          SET video_status = 'failed',
              current_video_asset_version_id = NULL,
              updated_at = $2
          WHERE id = $1
        `,
        [shotId, new Date("2026-07-12T12:04:00.000Z")],
      );

      const results = await Promise.all([
        creator.retryShotVideo({
          user,
          body: { shotId },
          now: new Date("2026-07-12T12:05:00.000Z"),
        }),
        creator.retryShotVideo({
          user,
          body: { shotId },
          now: new Date("2026-07-12T12:05:00.000Z"),
        }),
      ]);
      const counts = await db.query<{ tasks: number; provider_requests: number }>(
        `
          SELECT
            (SELECT count(*)::int FROM tasks WHERE task_type = 'generate_shot_video') AS tasks,
            (
              SELECT count(*)::int
              FROM provider_requests
              WHERE provider_operation = 'shot.video.generate'
            ) AS provider_requests
        `,
      );

      assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
      assert.deepEqual(counts.rows[0], { tasks: 1, provider_requests: 1 });
    } finally {
      await db.close();
    }
  });

  it("does not expose a reserved generation object key as an asset preview", async () => {
    const db = await createMigratedTestDb();
    const previousPublicBaseUrl = process.env.STORAGE_PUBLIC_BASE_URL;
    process.env.STORAGE_PUBLIC_BASE_URL = "https://storage.example.test";

    try {
      const user = await seedAuthenticatedUser(db, {
        userId: "00000000-0000-4000-8000-000000000051",
        phone: "13800138051",
        token: "creator-user-reserved-generation-preview",
      });
      let signedReadCalls = 0;
      const creator = createCreatorApplication({
        db,
        storageRuntime: {
          mode: "test",
          provider: "test",
          bucket: "creator-test",
          region: "test-region",
          adapter: {
            async createSignedReadUrl(input) {
              signedReadCalls += 1;
              return {
                url: `https://signed.example.test/${input.objectKey}`,
                expiresAt: input.expiresAt,
              };
            },
          },
        },
      });
      const created = await creator.createProject({
        user,
        body: {
          name: "Reserved generation preview",
          scriptInput: "Episode 1: The image is still being generated.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-reserved-generation-preview",
        now: new Date("2026-07-14T06:45:00.000Z"),
      });
      const projectId = String((created.body as { project: { id: string } }).project.id);
      await db.query(
        `
          INSERT INTO assets (
            id, project_id, asset_type, asset_key, created_by_user_id, created_at, updated_at
          )
          VALUES ($1, $2, 'character_sheet', 'character-generating', $3, $4, $4)
        `,
        [
          "00000000-0000-4000-8000-000000000052",
          projectId,
          user.id,
          new Date("2026-07-14T06:45:01.000Z"),
        ],
      );
      await db.query(
        `
          INSERT INTO asset_versions (
            id, asset_id, version_number, storage_object_key, storage_object_id,
            metadata_json, created_by_user_id, created_at
          )
          VALUES ($1, $2, 1, $3, NULL, $4::jsonb, $5, $6)
        `,
        [
          "00000000-0000-4000-8000-000000000053",
          "00000000-0000-4000-8000-000000000052",
          "library/character/reserved-generation-object",
          JSON.stringify({
            label: "Generating character",
            source: "generated",
            generationTaskId: "00000000-0000-4000-8000-000000000054",
            generationStatus: "created",
            previewUrl: null,
            sourceUrl: null,
          }),
          user.id,
          new Date("2026-07-14T06:45:01.000Z"),
        ],
      );

      const detail = await creator.getProjectDetail({
        user,
        projectId,
        now: new Date("2026-07-14T06:45:02.000Z"),
      });
      const character = (detail.body as {
        assetsByType: { character: Array<{ previewUrl: string | null; latestVersion: { previewUrl: string | null } }> };
      }).assetsByType.character.find((asset) => asset.latestVersion != null);

      assert.equal(character?.previewUrl, null);
      assert.equal(character?.latestVersion.previewUrl, null);
      assert.equal(signedReadCalls, 0);
    } finally {
      if (previousPublicBaseUrl === undefined) {
        delete process.env.STORAGE_PUBLIC_BASE_URL;
      } else {
        process.env.STORAGE_PUBLIC_BASE_URL = previousPublicBaseUrl;
      }
      await db.close();
    }
  });

  it("filters episode assets in SQL before project detail rows cross the database boundary", async () => {
    const db = await createMigratedTestDb();

    try {
      const user = await seedAuthenticatedUser(db, {
        userId: "00000000-0000-4000-8000-000000000061",
        phone: "13800138061",
        token: "creator-project-detail-asset-filter",
      });
      const creator = createCreatorApplication({ db });
      const created = await creator.createProject({
        user,
        body: {
          name: "Project detail asset filter",
          scriptInput: "Episode 1",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-project-detail-asset-filter",
        now: new Date("2026-07-16T06:00:00.000Z"),
      });
      const projectId = String((created.body as { project: { id: string } }).project.id);
      const assetIds = [
        "00000000-0000-4000-8000-000000000062",
        "00000000-0000-4000-8000-000000000063",
        "00000000-0000-4000-8000-000000000064",
      ];
      await db.query(
        `
          INSERT INTO assets (
            id, project_id, asset_type, asset_key, created_by_user_id, created_at, updated_at
          )
          VALUES
            ($1, $4, 'character_sheet', 'global-character', $5, $6, $6),
            ($2, $4, 'character_sheet', 'empty-episode-character', $5, $6, $6),
            ($3, $4, 'character_sheet', 'episode-character', $5, $6, $6)
        `,
        [...assetIds, projectId, user.id, new Date("2026-07-16T06:00:01.000Z")],
      );
      await db.query(
        `
          INSERT INTO asset_versions (
            id, asset_id, version_number, storage_object_key, metadata_json,
            created_by_user_id, created_at
          )
          VALUES
            ($1, $4, 1, 'global-character.png', $7::jsonb, $10, $11),
            ($2, $5, 1, 'empty-episode-character.png', $8::jsonb, $10, $11),
            ($3, $6, 1, 'episode-character.png', $9::jsonb, $10, $11)
        `,
        [
          "00000000-0000-4000-8000-000000000065",
          "00000000-0000-4000-8000-000000000066",
          "00000000-0000-4000-8000-000000000067",
          ...assetIds,
          JSON.stringify({ label: "Global character" }),
          JSON.stringify({ label: "Empty episode character", episodeId: "" }),
          JSON.stringify({ label: "Episode character", episodeId: "episode-1" }),
          user.id,
          new Date("2026-07-16T06:00:01.000Z"),
        ],
      );

      let fetchedAssetRows = -1;
      let queriedScripts = false;
      let captureLibraryQueries = false;
      const libraryQueries: string[] = [];
      const observedDb: SqlDatabase = {
        async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
          const result = await db.query<T>(sql, params);
          if (captureLibraryQueries) {
            libraryQueries.push(sql);
          }
          if (sql.includes("FROM scripts")) {
            queriedScripts = true;
          }
          if (sql.includes("FROM assets a") && sql.includes("LEFT JOIN LATERAL")) {
            fetchedAssetRows = result.rows.length;
          }
          return result;
        },
      };
      const detail = await createCreatorApplication({ db: observedDb }).getProjectDetail({
        user,
        projectId,
        now: new Date("2026-07-16T06:00:02.000Z"),
      });
      const characters = (detail.body as {
        assetsByType: { character: Array<{ assetKey: string }> };
      }).assetsByType.character;

      assert.equal(fetchedAssetRows, 2);
      assert.deepEqual(
        characters.map((asset) => asset.assetKey).sort(),
        ["empty-episode-character", "global-character"],
      );
      assert.equal(queriedScripts, false);
      captureLibraryQueries = true;
      const library = await createCreatorApplication({ db: observedDb }).listAssetLibrary({
        user,
        projectId,
        now: new Date("2026-07-16T06:00:03.000Z"),
      });
      captureLibraryQueries = false;
      assert.deepEqual(
        (library.body as { assets: Array<{ assetKey: string }> }).assets.map((asset) => asset.assetKey).sort(),
        ["empty-episode-character", "global-character"],
      );
      assert.equal(
        libraryQueries.some((sql) => /FROM (?:shots|episodes|export_records|shot_reference_assets)/.test(sql)),
        false,
      );
    } finally {
      await db.close();
    }
  });

  it("projects a terminal generation task over stale project asset metadata", async () => {
    const db = await createMigratedTestDb();

    try {
      const user = await seedAuthenticatedUser(db, {
        userId: "00000000-0000-4000-8000-000000000055",
        phone: "13800138055",
        token: "creator-project-asset-terminal-projection",
      });
      const creator = createCreatorApplication({ db });
      const created = await creator.createProject({
        user,
        body: {
          name: "Project asset terminal projection",
          scriptInput: "Episode 1",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-project-asset-terminal-projection",
        now: new Date("2026-07-22T15:00:00.000Z"),
      });
      const projectId = String((created.body as { project: { id: string } }).project.id);
      const assetId = "00000000-0000-4000-8000-000000000056";
      const taskId = "00000000-0000-4000-8000-000000000057";
      const workflowId = "00000000-0000-4000-8000-000000000058";
      await db.query(
        `
          INSERT INTO assets (
            id, project_id, asset_type, asset_key, created_by_user_id, created_at, updated_at
          )
          VALUES ($1, $2, 'scene_reference', 'stale-generating-scene', $3, $4, $4)
        `,
        [assetId, projectId, user.id, new Date("2026-07-22T15:00:01.000Z")],
      );
      await db.query(
        `
          INSERT INTO asset_versions (
            id, asset_id, version_number, storage_object_key, metadata_json,
            created_by_user_id, created_at
          )
          VALUES (
            '00000000-0000-4000-8000-000000000059', $1, 1,
            'project-assets/stale-generating-scene.png',
            jsonb_build_object(
              'label', 'Stale generating scene',
              'generationTaskId', $2::text,
              'generationStatus', 'running',
              'generationResult', jsonb_build_object('taskId', $2::text, 'status', 'running')
            ),
            $3, $4
          )
        `,
        [assetId, taskId, user.id, new Date("2026-07-22T15:00:01.000Z")],
      );
      await db.query(
        `
          INSERT INTO workflows (
            id, project_id, workflow_type, status, input_snapshot_json, created_by_user_id
          )
          VALUES ($1, $2, 'episode_image_generation', 'failed', '{}'::jsonb, $3)
        `,
        [workflowId, projectId, user.id],
      );
      await db.query(
        `
          INSERT INTO tasks (
            id, project_id, workflow_id, task_type, status, failure_code, queue_name,
            input_snapshot_json, target_entity_type, target_entity_id
          )
          VALUES (
            $1, $2, $3, 'episode_generate_image', 'failed', 'provider_poll_timeout',
            'generation-poll-image', jsonb_build_object('targetType', 'asset', 'targetId', $4::text),
            'asset', $4::uuid
          )
        `,
        [taskId, projectId, workflowId, assetId],
      );

      const library = await creator.listAssetLibrary({
        user,
        projectId,
        now: new Date("2026-07-22T15:00:02.000Z"),
      });
      const detail = await creator.getProjectDetail({
        user,
        projectId,
        now: new Date("2026-07-22T15:00:02.000Z"),
      });
      const libraryAsset = (library.body as {
        assets: Array<{ id: string; latestVersion: { metadata: Record<string, unknown> } }>;
      }).assets.find((asset) => asset.id === assetId);
      const detailAsset = (detail.body as {
        assetsByType: { scene: Array<{ id: string; latestVersion: { metadata: Record<string, unknown> } }> };
      }).assetsByType.scene.find((asset) => asset.id === assetId);

      assert.equal(libraryAsset?.latestVersion.metadata.generationStatus, "failed");
      assert.equal(
        (libraryAsset?.latestVersion.metadata.generationResult as Record<string, unknown>)?.failureCode,
        "provider_poll_timeout",
      );
      assert.equal(detailAsset?.latestVersion.metadata.generationStatus, "failed");
    } finally {
      await db.close();
    }
  });

  it("does not fetch unused shot draft columns for project detail", async () => {
    const db = await createMigratedTestDb();

    try {
      const user = await seedAuthenticatedUser(db, {
        userId: "00000000-0000-4000-8000-000000000071",
        phone: "13800138071",
        token: "creator-project-detail-shot-columns",
      });
      const creator = createCreatorApplication({ db });
      const created = await creator.createProject({
        user,
        body: {
          name: "Project detail shot columns",
          scriptInput: "Episode 1",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-project-detail-shot-columns",
        now: new Date("2026-07-16T06:10:00.000Z"),
      });
      const projectId = String((created.body as { project: { id: string } }).project.id);
      await db.query(
        `
          INSERT INTO shots (
            id, project_id, title, description, sort_order, content_revision,
            content_status, image_status, video_status, created_by_user_id,
            created_at, updated_at, scene_analysis, plot_preview, prompt_draft, tts_draft
          )
          VALUES (
            $1, $2, 'Shot 001', 'Opening shot', 1, 1,
            'ready', 'ready', 'not_ready', $3, $4, $4,
            $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb
          )
        `,
        [
          "00000000-0000-4000-8000-000000000072",
          projectId,
          user.id,
          new Date("2026-07-16T06:10:01.000Z"),
          JSON.stringify({ payload: "scene".repeat(100) }),
          JSON.stringify({ payload: "plot".repeat(100) }),
          JSON.stringify({ payload: "prompt".repeat(100) }),
          JSON.stringify({ payload: "tts".repeat(100) }),
        ],
      );

      let fetchedShotColumns: string[] = [];
      const observedDb: SqlDatabase = {
        async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
          const result = await db.query<T>(sql, params);
          if (sql.includes("FROM shots") && sql.includes("ORDER BY sort_order ASC")) {
            fetchedShotColumns = Object.keys((result.rows[0] ?? {}) as Record<string, unknown>);
          }
          return result;
        },
      };
      const shots = await listShotsForProject(observedDb, { projectId });

      assert.equal(shots.length, 1);
      assert.equal(shots[0]?.title, "Shot 001");
      assert.equal(fetchedShotColumns.includes("scene_analysis"), false);
      assert.equal(fetchedShotColumns.includes("plot_preview"), false);
      assert.equal(fetchedShotColumns.includes("prompt_draft"), false);
      assert.equal(fetchedShotColumns.includes("tts_draft"), false);
    } finally {
      await db.close();
    }
  });

  it("selects a project with overview-only data and reuses the authenticated actor", async () => {
    const db = await createMigratedTestDb();

    try {
      const user = await seedAuthenticatedUser(db, {
        userId: "00000000-0000-4000-8000-000000000081",
        phone: "13800138081",
        token: "creator-project-overview-select",
      });
      const creator = createCreatorApplication({ db });
      const created = await creator.createProject({
        user,
        body: {
          name: "Project overview select",
          scriptInput: "Episode 1",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-project-overview-select",
        now: new Date("2026-07-16T06:20:00.000Z"),
      });
      const projectId = String((created.body as { project: { id: string } }).project.id);
      await creator.createProject({
        user,
        body: {
          name: "Newer project must not replace selection",
          scriptInput: "Episode 2",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-project-overview-newer-project",
        now: new Date("2026-07-16T06:20:00.500Z"),
      });
      const observedSql: string[] = [];
      const observedDb: SqlDatabase = {
        async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
          observedSql.push(sql.replace(/\s+/g, " ").trim().toLowerCase());
          return db.query<T>(sql, params);
        },
      };

      const selectedCreator = createCreatorApplication({ db: observedDb });
      const selected = await selectedCreator.selectProject({
        user: {
          ...user,
          actor: {
            userId: user.id,
            capabilities: [],
          },
        },
        projectId,
        now: new Date("2026-07-16T06:20:01.000Z"),
      });
      const body = selected.body as Record<string, unknown>;

      assert.equal(selected.status, 200);
      assert.deepEqual(Object.keys(body).sort(), ["assetSummary", "episodes", "project"]);
      assert.equal(observedSql.some((sql) => sql.includes(" from scripts")), false);
      assert.equal(observedSql.some((sql) => sql.includes(" from auth_sessions")), false);
      assert.equal(observedSql.some((sql) => sql.includes(" from users")), false);
      assert.equal(observedSql.some((sql) => sql.includes(" from team_member_auth_sessions")), false);
      assert.equal(observedSql.some((sql) => sql.includes(" from shot_reference_assets")), false);
      assert.equal(observedSql.some((sql) => sql.includes(" from export_records")), false);
      assert.equal(
        observedSql.some((sql) => sql.includes(" from shots") && sql.includes(" order by sort_order asc")),
        false,
      );
      const state = await selectedCreator.getState({ user });
      assert.equal(state.body.project?.id, projectId);
    } finally {
      await db.close();
    }
  });

  it("lists episode summaries without building full project detail", async () => {
    const db = await createMigratedTestDb();

    try {
      const user = await seedAuthenticatedUser(db, {
        userId: "00000000-0000-4000-8000-000000000091",
        phone: "13800138091",
        token: "creator-project-episode-summary",
      });
      const creator = createCreatorApplication({ db });
      const created = await creator.createProject({
        user,
        body: {
          name: "Project episode summary",
          scriptInput: "Episode 1",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-project-episode-summary",
        now: new Date("2026-07-16T06:30:00.000Z"),
      });
      const projectId = String((created.body as { project: { id: string } }).project.id);
      const observedSql: string[] = [];
      const observedDb: SqlDatabase = {
        async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
          observedSql.push(sql.replace(/\s+/g, " ").trim().toLowerCase());
          return db.query<T>(sql, params);
        },
      };

      const result = await createCreatorApplication({ db: observedDb }).listProjectEpisodes({
        user: {
          ...user,
          actor: {
            userId: user.id,
            capabilities: [],
          },
        },
        projectId,
        now: new Date("2026-07-16T06:30:01.000Z"),
      });

      assert.equal(result.status, 200);
      assert.ok(Array.isArray((result.body as { episodes: unknown[] }).episodes));
      assert.equal(observedSql.some((sql) => sql.includes(" from scripts")), false);
      assert.equal(observedSql.some((sql) => sql.includes(" from assets a")), false);
      assert.equal(observedSql.some((sql) => sql.includes(" from shot_reference_assets")), false);
      assert.equal(observedSql.some((sql) => sql.includes(" from export_records")), false);
      assert.equal(observedSql.some((sql) => sql.includes(" from auth_sessions")), false);
    } finally {
      await db.close();
    }
  });

});

async function prepareCreatorShots(
  creator: ReturnType<typeof createCreatorApplication>,
  user: { id: string; sessionToken: string },
  key: string,
  startedAt: Date,
) {
  await creator.createProject({
    user,
    body: {
      name: `Creator ${key}`,
      scriptInput: "Episode 1: Concurrent retry must not fork provider work.",
      aspectRatio: "9:16",
      resolution: "1080p",
    },
    idempotencyKey: `creator-${key}-create`,
    now: startedAt,
  });
  await creator.parseScript({
    user,
    idempotencyKey: `creator-${key}-parse`,
    now: new Date(startedAt.getTime() + 60_000),
  });
  await creator.confirmAllAssets({ user });
  await creator.runCalibration({
    user,
    now: new Date(startedAt.getTime() + 120_000),
  });
}

async function seedAuthenticatedUser(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: { userId: string; phone: string; token: string },
) {
  await db.query("INSERT INTO users (id, phone_e164, status) VALUES ($1, $2, 'active')", [input.userId, input.phone]);
  const sessionNow = new Date();
  const session = await createAuthSession({
    userId: input.userId,
    token: input.token,
    now: sessionNow,
    ttlMs: 24 * 60 * 60 * 1000,
  });
  await db.query(
    `
      INSERT INTO auth_sessions (
        id, user_id, status, session_token_hash, session_token_hash_version,
        expires_at, last_seen_at, revoked_at, created_at
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
      sessionNow,
    ],
  );
  return { id: input.userId, sessionToken: input.token };
}
