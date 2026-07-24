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

  it("updates a project name only from the expected server name", async () => {
    const db = await createMigratedTestDb();
    try {
      const owner = await seedAuthenticatedUser(db, {
        userId: "00000000-0000-4000-8000-000000000003",
        phone: "13800138003",
        token: "creator-project-name-cas-owner",
      });
      const creator = createCreatorApplication({ db });
      const created = await creator.createProject({
        user: owner,
        body: { name: "原项目名", scriptInput: "Episode 1", aspectRatio: "16:9", resolution: "1080p" },
        idempotencyKey: "creator-project-name-cas-create",
        now: new Date("2026-07-12T08:03:00.000Z"),
      });
      const projectId = String((created.body as { project: { id: string } }).project.id);

      const first = await creator.updateProject({
        user: owner,
        body: { projectId, name: "服务端新名称", expectedName: "原项目名" },
        now: new Date("2026-07-12T08:04:00.000Z"),
      });
      const stale = await creator.updateProject({
        user: owner,
        body: { projectId, name: "迟到旧请求", expectedName: "原项目名" },
        now: new Date("2026-07-12T08:05:00.000Z"),
      });
      const stored = await db.query<{ name: string }>("SELECT name FROM projects WHERE id = $1", [projectId]);

      assert.equal(first.status, 200);
      assert.equal((first.body as { project: { name: string } }).project.name, "服务端新名称");
      assert.equal(stale.status, 409);
      assert.deepEqual(stale.body, {
        error: "project_name_conflict",
        details: { currentName: "服务端新名称" },
      });
      assert.equal(stored.rows[0]?.name, "服务端新名称");
    } finally {
      await db.close();
    }
  });

  it("rejects a viewer team member attempting to rename a project", async () => {
    const db = await createMigratedTestDb();
    try {
      const owner = await seedAuthenticatedUser(db, {
        userId: "00000000-0000-4000-8000-000000000004",
        phone: "13800138004",
        token: "creator-project-name-viewer-owner",
      });
      const creator = createCreatorApplication({ db });
      const created = await creator.createProject({
        user: owner,
        body: { name: "仅可查看项目", scriptInput: "Episode 1", aspectRatio: "16:9", resolution: "1080p" },
        idempotencyKey: "creator-project-name-viewer-create",
        now: new Date("2026-07-12T08:06:00.000Z"),
      });
      const projectId = String((created.body as { project: { id: string } }).project.id);
      const viewer = await seedTeamMemberSession(db, {
        ownerUserId: owner.id,
        projectId,
        memberId: "00000000-0000-4000-8000-000000000104",
        token: "creator-project-name-viewer-member",
        role: "viewer",
      });

      await assert.rejects(
        creator.updateProject({
          user: viewer,
          body: { projectId, name: "越权名称" },
          now: new Date("2026-07-12T08:07:00.000Z"),
        }),
        (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "capability_missing"),
      );
      const stored = await db.query<{ name: string }>("SELECT name FROM projects WHERE id = $1", [projectId]);
      assert.equal(stored.rows[0]?.name, "仅可查看项目");
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

  it("keeps storage objects referenced by current and historical canvas documents when deleting project assets", async () => {
    const db = await createMigratedTestDb();

    try {
      const user = await seedAuthenticatedUser(db, {
        userId: "00000000-0000-4000-8000-000000000101",
        phone: "13800138101",
        token: "creator-canvas-asset-reference-retention",
      });
      const deletedObjectKeys: string[] = [];
      const creator = createCreatorApplication({
        db,
        storageRuntime: {
          mode: "test",
          provider: "test",
          bucket: "creator-test",
          region: "test-region",
          adapter: {
            async deleteObject(input) {
              deletedObjectKeys.push(input.objectKey);
            },
          },
        },
      });
      const created = await creator.createProject({
        user,
        body: {
          name: "Canvas asset reference retention",
          scriptInput: "Episode 1",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-canvas-asset-reference-retention",
        now: new Date("2026-07-21T08:00:00.000Z"),
      });
      const projectId = String((created.body as { project: { id: string } }).project.id);
      const currentStorageObjectId = "00000000-0000-4000-8000-000000000102";
      const historicalStorageObjectId = "00000000-0000-4000-8000-000000000103";
      const currentAssetId = "00000000-0000-4000-8000-000000000104";
      const historicalAssetId = "00000000-0000-4000-8000-000000000105";
      const unreferencedStorageObjectId = "00000000-0000-4000-8000-000000000108";
      const unreferencedAssetId = "00000000-0000-4000-8000-000000000109";
      const artifactStorageObjectId = "00000000-0000-4000-8000-000000000131";
      const artifactAssetId = "00000000-0000-4000-8000-000000000132";

      await db.query(
        `
          INSERT INTO storage_objects (
            id, project_id, bucket, object_key, content_type,
            provider, status, created_by_user_id
          )
          VALUES
            ($1, $3, 'creator-test', 'canvas/current.png', 'image/png', 'test', 'available', $4),
            ($2, $3, 'creator-test', 'canvas/historical.png', 'image/png', 'test', 'available', $4),
            ($5, $3, 'creator-test', 'canvas/unreferenced.png', 'image/png', 'test', 'available', $4)
        `,
        [currentStorageObjectId, historicalStorageObjectId, projectId, user.id, unreferencedStorageObjectId],
      );
      await db.query(
        `
          INSERT INTO assets (
            id, project_id, asset_type, asset_key, created_by_user_id
          )
          VALUES
            ($1, $3, 'character_sheet', 'canvas-current', $4),
            ($2, $3, 'scene_reference', 'canvas-historical', $4),
            ($5, $3, 'prop_reference', 'canvas-unreferenced', $4)
        `,
        [currentAssetId, historicalAssetId, projectId, user.id, unreferencedAssetId],
      );
      await db.query(
        `
          INSERT INTO asset_versions (
            id, asset_id, version_number, storage_object_key, storage_object_id,
            metadata_json, created_by_user_id
          )
          VALUES
            ('00000000-0000-4000-8000-000000000106', $1, 1, 'canvas/current.png', $3, '{}'::jsonb, $5),
            ('00000000-0000-4000-8000-000000000107', $2, 1, 'canvas/historical.png', $4, '{}'::jsonb, $5),
            ('00000000-0000-4000-8000-000000000110', $6, 1, 'canvas/unreferenced.png', $7, '{}'::jsonb, $5)
        `,
        [
          currentAssetId,
          historicalAssetId,
          currentStorageObjectId,
          historicalStorageObjectId,
          user.id,
          unreferencedAssetId,
          unreferencedStorageObjectId,
        ],
      );
      await db.query(
        `
          INSERT INTO storage_objects (
            id, project_id, bucket, object_key, content_type,
            provider, status, created_by_user_id
          )
          VALUES ($1, $2, 'creator-test', 'canvas/artifact.mp4', 'video/mp4', 'test', 'available', $3)
        `,
        [artifactStorageObjectId, projectId, user.id],
      );
      await db.query(
        `
          INSERT INTO assets (id, project_id, asset_type, asset_key, created_by_user_id)
          VALUES ($1, $2, 'shot_video', 'canvas-artifact', $3)
        `,
        [artifactAssetId, projectId, user.id],
      );
      await db.query(
        `
          INSERT INTO asset_versions (
            id, asset_id, version_number, storage_object_key,
            storage_object_id, metadata_json, created_by_user_id
          )
          VALUES ('00000000-0000-4000-8000-000000000133', $1, 1,
                  'canvas/artifact.mp4', NULL, '{}'::jsonb, $2)
        `,
        [artifactAssetId, user.id],
      );

      const canvas = await createStandaloneCanvas(db, {
        userId: user.id,
        now: new Date("2026-07-21T08:01:00.000Z"),
      });
      const withBothReferences = await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: canvas.canvasProjectId,
        userId: user.id,
        clientRevision: canvas.serverRevision,
        document: {
          ...canvas.document,
          nodes: [
            { id: "current-reference", type: "image", data: { loomicElement: { customData: { resultStorageObjectId: currentStorageObjectId } } } },
            { id: "historical-reference", type: "image", data: { loomicElement: { customData: { resultStorageObjectId: historicalStorageObjectId } } } },
            { id: "artifact-reference", type: "output", data: {} },
          ],
          edges: [],
        },
        now: new Date("2026-07-21T08:02:00.000Z"),
      });
      await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: canvas.canvasProjectId,
        userId: user.id,
        clientRevision: withBothReferences.serverRevision,
        document: {
          ...withBothReferences.document,
          nodes: [
            { id: "current-reference", type: "image", data: { loomicElement: { customData: { resultStorageObjectId: currentStorageObjectId } } } },
            { id: "artifact-reference", type: "output", data: {} },
          ],
          edges: [],
        },
        now: new Date("2026-07-21T08:03:00.000Z"),
      });
      await db.query(
        `
          INSERT INTO creator_canvas_node_artifacts (
            id, canvas_project_id, node_key, artifact_kind,
            asset_id, asset_version_id, storage_object_id,
            selected, created_by_user_id
          )
          VALUES ('00000000-0000-4000-8000-000000000134', $1,
                  'artifact-reference', 'video', $2,
                  NULL, NULL, true, $3)
        `,
        [canvas.canvasProjectId, artifactAssetId, user.id],
      );

      const currentDelete = await creator.deleteProjectAsset({
        user,
        assetId: currentAssetId,
        now: new Date("2026-07-21T08:04:00.000Z"),
      });
      const historicalDelete = await creator.deleteProjectAsset({
        user,
        assetId: historicalAssetId,
        now: new Date("2026-07-21T08:05:00.000Z"),
      });
      const unreferencedDelete = await creator.deleteProjectAsset({
        user,
        assetId: unreferencedAssetId,
        now: new Date("2026-07-21T08:06:00.000Z"),
      });
      const artifactDelete = await creator.deleteProjectAsset({
        user,
        assetId: artifactAssetId,
        now: new Date("2026-07-21T08:07:00.000Z"),
      });
      const rows = await db.query<{
        id: string;
        status: string;
        deleted_at: Date | string | null;
      }>(
        `
          SELECT id, status, deleted_at
          FROM storage_objects
          WHERE id = ANY($1::uuid[])
          ORDER BY id
        `,
        [[currentStorageObjectId, historicalStorageObjectId, unreferencedStorageObjectId, artifactStorageObjectId]],
      );
      const deletedAssetRows = await db.query<{ count: number }>(
        `
          SELECT count(*)::int AS count
          FROM assets
          WHERE id = ANY($1::uuid[])
        `,
        [[currentAssetId, historicalAssetId, unreferencedAssetId, artifactAssetId]],
      );
      const detachedArtifact = await db.query<{
        asset_id: string | null;
        asset_version_id: string | null;
        storage_object_id: string | null;
      }>(
        `
          SELECT asset_id, asset_version_id, storage_object_id
          FROM creator_canvas_node_artifacts
          WHERE canvas_project_id = $1
            AND node_key = 'artifact-reference'
        `,
        [canvas.canvasProjectId],
      );

      assert.equal(currentDelete.status, 200);
      assert.equal(historicalDelete.status, 200);
      assert.equal(unreferencedDelete.status, 200);
      assert.equal(artifactDelete.status, 200);
      assert.equal(deletedAssetRows.rows[0]?.count, 0);
      assert.deepEqual(detachedArtifact.rows, [{
        asset_id: null,
        asset_version_id: null,
        storage_object_id: null,
      }]);
      assert.deepEqual(deletedObjectKeys, ["canvas/unreferenced.png"]);
      assert.deepEqual(
        rows.rows.map((row) => ({ id: row.id, status: row.status, deleted: row.deleted_at !== null })),
        [
          { id: currentStorageObjectId, status: "available", deleted: false },
          { id: historicalStorageObjectId, status: "available", deleted: false },
          { id: unreferencedStorageObjectId, status: "deleted", deleted: true },
          { id: artifactStorageObjectId, status: "available", deleted: false },
        ],
      );
    } finally {
      await db.close();
    }
  });

  it("keeps project storage objects referenced by independent canvases while deleting unreferenced objects", async () => {
    const db = await createMigratedTestDb();

    try {
      const user = await seedAuthenticatedUser(db, {
        userId: "00000000-0000-4000-8000-000000000111",
        phone: "13800138111",
        token: "creator-project-delete-canvas-retention",
      });
      const deletedObjectKeys: string[] = [];
      const creator = createCreatorApplication({
        db,
        storageRuntime: {
          mode: "test",
          provider: "test",
          bucket: "creator-test",
          region: "test-region",
          adapter: {
            async deleteObject(input) {
              deletedObjectKeys.push(input.objectKey);
            },
          },
        },
      });
      const source = await creator.createProject({
        user,
        body: { name: "Deleted source", scriptInput: "Episode 1", aspectRatio: "9:16", resolution: "1080p" },
        idempotencyKey: "creator-project-delete-canvas-retention-source",
        now: new Date("2026-07-21T09:00:00.000Z"),
      });
      const surviving = await creator.createProject({
        user,
        body: { name: "Surviving project", scriptInput: "Episode 2", aspectRatio: "9:16", resolution: "1080p" },
        idempotencyKey: "creator-project-delete-canvas-retention-surviving",
        now: new Date("2026-07-21T09:01:00.000Z"),
      });
      const sourceProjectId = String((source.body as { project: { id: string } }).project.id);
      const survivingProjectId = String((surviving.body as { project: { id: string } }).project.id);
      const currentStorageObjectId = "00000000-0000-4000-8000-000000000112";
      const historicalStorageObjectId = "00000000-0000-4000-8000-000000000113";
      const sourceOnlyStorageObjectId = "00000000-0000-4000-8000-000000000114";
      const artifactStorageObjectId = "00000000-0000-4000-8000-000000000115";

      await db.query(
        `
          INSERT INTO storage_objects (
            id, project_id, bucket, object_key, content_type,
            provider, status, created_by_user_id
          )
          VALUES
            ($1, $4, 'creator-test', 'project-delete/current.png', 'image/png', 'test', 'available', $5),
            ($2, $4, 'creator-test', 'project-delete/historical.png', 'image/png', 'test', 'available', $5),
            ($3, $4, 'creator-test', 'project-delete/source-only.png', 'image/png', 'test', 'available', $5)
        `,
        [currentStorageObjectId, historicalStorageObjectId, sourceOnlyStorageObjectId, sourceProjectId, user.id],
      );
      await db.query(
        `
          INSERT INTO storage_objects (
            id, project_id, bucket, object_key, content_type,
            provider, status, created_by_user_id
          )
          VALUES ($1, $2, 'creator-test', 'project-delete/artifact.mp4',
                  'video/mp4', 'test', 'available', $3)
        `,
        [artifactStorageObjectId, sourceProjectId, user.id],
      );
      const artifactAssetId = "00000000-0000-4000-8000-000000000117";
      const artifactAssetVersionId = "00000000-0000-4000-8000-000000000118";
      await db.query(
        `
          INSERT INTO assets (id, project_id, asset_type, asset_key, created_by_user_id)
          VALUES ($1, $2, 'shot_video', 'project-delete-artifact', $3)
        `,
        [artifactAssetId, sourceProjectId, user.id],
      );
      await db.query(
        `
          INSERT INTO asset_versions (
            id, asset_id, version_number, storage_object_key,
            storage_object_id, metadata_json, created_by_user_id
          )
          VALUES ($1, $2, 1, 'project-delete/artifact.mp4', NULL, '{}'::jsonb, $3)
        `,
        [artifactAssetVersionId, artifactAssetId, user.id],
      );

      const survivingCanvas = await createStandaloneCanvas(db, {
        userId: user.id,
        now: new Date("2026-07-21T09:04:00.000Z"),
      });
      const withBothReferences = await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: survivingCanvas.canvasProjectId,
        userId: user.id,
        clientRevision: survivingCanvas.serverRevision,
        document: {
          ...survivingCanvas.document,
          nodes: [
            { id: "current", type: "image", data: { loomicElement: { customData: { resultStorageObjectId: currentStorageObjectId } } } },
            { id: "historical", type: "image", data: { loomicElement: { customData: { resultStorageObjectId: historicalStorageObjectId } } } },
            { id: "artifact-reference", type: "output", data: {} },
          ],
          edges: [],
        },
        now: new Date("2026-07-21T09:05:00.000Z"),
      });
      await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: survivingCanvas.canvasProjectId,
        userId: user.id,
        clientRevision: withBothReferences.serverRevision,
        document: {
          ...withBothReferences.document,
          nodes: [
            { id: "current", type: "image", data: { loomicElement: { customData: { resultStorageObjectId: currentStorageObjectId } } } },
            { id: "artifact-reference", type: "output", data: {} },
          ],
          edges: [],
        },
        now: new Date("2026-07-21T09:06:00.000Z"),
      });
      await db.query(
        `
          INSERT INTO creator_canvas_node_artifacts (
            id, canvas_project_id, node_key, artifact_kind,
            asset_id, asset_version_id, storage_object_id,
            selected, created_by_user_id
          )
          VALUES
            ('00000000-0000-4000-8000-000000000116', $1,
             'artifact-reference', 'video', $2, $3, NULL, true, $4),
            ('00000000-0000-4000-8000-000000000119', $1,
             'artifact-reference', 'video', $2, NULL, NULL, false, $4)
        `,
        [survivingCanvas.canvasProjectId, artifactAssetId, artifactAssetVersionId, user.id],
      );

      const deleted = await creator.deleteProject({
        user,
        body: { projectId: sourceProjectId },
        now: new Date("2026-07-21T09:07:00.000Z"),
      });
      const storageRows = await db.query<{ id: string; project_id: string | null; status: string }>(
        `
          SELECT id, project_id, status
          FROM storage_objects
          WHERE id = ANY($1::uuid[])
          ORDER BY id
        `,
        [[currentStorageObjectId, historicalStorageObjectId, sourceOnlyStorageObjectId, artifactStorageObjectId]],
      );
      const projectRows = await db.query<{ id: string }>(
        "SELECT id FROM projects WHERE id = ANY($1::uuid[]) ORDER BY id",
        [[sourceProjectId, survivingProjectId]],
      );
      const detachedArtifact = await db.query<{
        asset_id: string | null;
        asset_version_id: string | null;
        storage_object_id: string | null;
      }>(
        `
          SELECT asset_id, asset_version_id, storage_object_id
          FROM creator_canvas_node_artifacts
          WHERE canvas_project_id = $1
            AND node_key = 'artifact-reference'
          ORDER BY id
        `,
        [survivingCanvas.canvasProjectId],
      );
      assert.equal(deleted.status, 200);
      assert.deepEqual(deletedObjectKeys, ["project-delete/source-only.png"]);
      assert.deepEqual(storageRows.rows, [
        { id: currentStorageObjectId, project_id: null, status: "available" },
        { id: historicalStorageObjectId, project_id: null, status: "available" },
        { id: artifactStorageObjectId, project_id: null, status: "available" },
      ]);
      assert.deepEqual(projectRows.rows.map((row) => row.id), [survivingProjectId]);
      assert.deepEqual(detachedArtifact.rows, [
        {
          asset_id: null,
          asset_version_id: null,
          storage_object_id: artifactStorageObjectId,
        },
        {
          asset_id: null,
          asset_version_id: null,
          storage_object_id: null,
        },
      ]);
    } finally {
      await db.close();
    }
  });
});

async function createStandaloneCanvas(
  db: SqlDatabase,
  input: { userId: string; now: Date },
) {
  const canvasProjectId = randomUUID();
  const documentId = randomUUID();
  const document = {
    version: 2,
    canvasProjectId,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    edges: [],
    groups: [],
    createdAt: input.now.toISOString(),
    updatedAt: input.now.toISOString(),
  };
  await db.query(
    `
      INSERT INTO creator_canvas_projects (
        id, title, status, server_revision,
        created_by_user_id, updated_by_user_id, created_at, updated_at
      )
      VALUES ($1, 'Independent Canvas', 'active', 1, $2, $2, $3, $3)
    `,
    [canvasProjectId, input.userId, input.now],
  );
  await db.query(
    `
      INSERT INTO creator_canvas_documents (
        id, canvas_project_id, schema_version, server_revision, document_json,
        viewport_json, node_count, edge_count, created_by_user_id, updated_by_user_id,
        created_at, updated_at
      )
      VALUES ($1, $2, 2, 1, $3::jsonb, $4::jsonb, 0, 0, $5, $5, $6, $6)
    `,
    [
      documentId,
      canvasProjectId,
      JSON.stringify(document),
      JSON.stringify(document.viewport),
      input.userId,
      input.now,
    ],
  );
  await db.query(
    "UPDATE creator_canvas_projects SET latest_document_id = $2 WHERE id = $1",
    [canvasProjectId, documentId],
  );
  return { canvasProjectId, serverRevision: 1, document };
}

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

async function seedTeamMemberSession(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: {
    ownerUserId: string;
    projectId: string;
    memberId: string;
    token: string;
    role: "producer" | "creator" | "viewer";
  },
) {
  const now = new Date("2026-07-12T08:06:30.000Z");
  await db.query(
    `
      INSERT INTO team_members (
        id, user_id, member_account, member_account_suffix, member_login_account,
        member_name, member_password_hash, member_credits, status
      )
      VALUES ($1, $2, 'project-name-member', 'u00104', 'project-name-member@u00104', '项目成员', 'hash', 0, 'active')
    `,
    [input.memberId, input.ownerUserId],
  );
  await db.query(
    "INSERT INTO team_member_projects (id, member_id, user_id, project_id, role) VALUES ($1, $2, $3, $4, $5)",
    ["00000000-0000-4000-8000-000000000204", input.memberId, input.ownerUserId, input.projectId, input.role],
  );
  const session = await createAuthSession({ userId: input.ownerUserId, token: input.token, now });
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
      now,
    ],
  );
  await db.query(
    `
      INSERT INTO team_member_auth_sessions (
        id, auth_session_id, user_id, member_id, status, expires_at, last_seen_at, created_at
      )
      VALUES ($1, $2, $3, $4, 'active', $5, $6, $6)
    `,
    ["00000000-0000-4000-8000-000000000304", session.session.id, input.ownerUserId, input.memberId, session.session.expiresAt, now],
  );
  return { id: input.ownerUserId, sessionToken: input.token };
}
