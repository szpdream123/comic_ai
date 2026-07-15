import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthSession } from "../../identity/session.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createCreatorApplication } from "../creator-application.service.ts";

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
