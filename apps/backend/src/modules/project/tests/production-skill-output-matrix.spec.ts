import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthSession } from "../../identity/session.service.ts";
import type { SqlDatabase } from "../../shared/db/sql.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createCreatorApplication } from "../creator-application.service.ts";
import { createProductionManifest } from "../production-agent.adapter.ts";

process.env.AUTH_SECRET_PEPPER ??= "production-skill-output-matrix-pepper";

type CommitPayload = {
  scriptText: string;
  scenes: Array<Record<string, unknown>>;
  characters: Array<Record<string, unknown>>;
  props: Array<Record<string, unknown>>;
  storyboards: Array<Record<string, unknown>>;
};

describe("Production Skill output commit matrix", { concurrency: false }, () => {
  it("writes only the stages emitted by the selected Skill into the existing project structures", async () => {
    const db = await createMigratedTestDb();
    const now = new Date("2026-09-16T08:00:00.000Z");
    try {
      const owner = await seedAuthenticatedUser(db, {
        userId: "00000000-0000-4000-8000-000000000096",
        phone: "13800138096",
        token: "production-skill-output-matrix-owner",
        now,
      });
      const creator = createCreatorApplication({ db });
      const cases: Array<{
        label: string;
        payload: CommitPayload;
        expectedAssetTypes: string[];
        expectedShots: number;
        expectedReferences: string[];
        expectedGenerationDrafts: number;
      }> = [
        {
          label: "script-only",
          payload: emptyPayload({ scriptText: "场景：旧车站。人物动作：主角走入候车厅。" }),
          expectedAssetTypes: [],
          expectedShots: 0,
          expectedReferences: [],
          expectedGenerationDrafts: 0,
        },
        {
          label: "character-only",
          payload: emptyPayload({
            characters: [{ characterName: "林岚", characterDescription: "短发侦探", characterImagePrompt: "短发，灰色风衣" }],
          }),
          expectedAssetTypes: ["character_sheet"],
          expectedShots: 0,
          expectedReferences: [],
          expectedGenerationDrafts: 0,
        },
        {
          label: "scene-only",
          payload: emptyPayload({
            scenes: [{ sceneName: "旧车站", sceneDescription: "雨夜中的废弃站台", sceneImagePrompt: "空站台，雨夜" }],
          }),
          expectedAssetTypes: ["scene_reference"],
          expectedShots: 0,
          expectedReferences: [],
          expectedGenerationDrafts: 0,
        },
        {
          label: "prop-only",
          payload: emptyPayload({
            props: [{ propName: "铜钥匙", propDescription: "边缘磨损", propImagePrompt: "黄铜旧钥匙特写" }],
          }),
          expectedAssetTypes: ["prop_reference"],
          expectedShots: 0,
          expectedReferences: [],
          expectedGenerationDrafts: 0,
        },
        {
          label: "shot-only",
          payload: emptyPayload({
            storyboards: [{ shotNo: 1, plot: "主角推开候车厅的门。", imagePrompt: "中景，雨夜候车厅" }],
          }),
          expectedAssetTypes: [],
          expectedShots: 1,
          expectedReferences: [],
          expectedGenerationDrafts: 1,
        },
        {
          label: "combined",
          payload: {
            scriptText: "场景：旧车站。人物动作：林岚用铜钥匙开门。",
            characters: [{ key: "character_linlan", characterName: "林岚", characterImagePrompt: "短发侦探" }],
            scenes: [{ key: "scene_station", sceneName: "旧车站", sceneImagePrompt: "雨夜空站台" }],
            props: [{ key: "prop_key", propName: "铜钥匙", propImagePrompt: "黄铜旧钥匙" }],
            storyboards: [{
              shotNo: 1,
              plot: "林岚在旧车站用铜钥匙开门。",
              characterKeys: ["character_linlan"],
              sceneKey: "scene_station",
              propKeys: ["prop_key"],
              videoPrompt: "镜头缓慢推近。",
            }],
          },
          expectedAssetTypes: ["character_sheet", "prop_reference", "scene_reference"],
          expectedShots: 1,
          expectedReferences: ["character", "scene", "prop"],
          expectedGenerationDrafts: 1,
        },
      ];

      for (const [index, testCase] of cases.entries()) {
        const created = await creator.createProject({
          user: owner,
          body: {
            name: `Production Skill ${testCase.label}`,
            scriptInput: `用户提供的原始文本 ${testCase.label}`,
            aspectRatio: "9:16",
            resolution: "1080p",
            projectType: "animation",
          },
          idempotencyKey: `production-skill-output-${testCase.label}`,
          now: new Date(now.getTime() + index * 60_000),
        });
        assert.equal(created.status, 200, `${testCase.label}: ${JSON.stringify(created.body)}`);
        const projectId = String((created.body as { project: { id: string } }).project.id);

        const manifest = createProductionManifest({ projectId }, { commitPayload: testCase.payload });
        assert.deepEqual(
          {
            script: Boolean(manifest.scriptText.trim()),
            characters: manifest.characters.length,
            scenes: manifest.scenes.length,
            props: manifest.props.length,
            shots: manifest.storyboards.length,
          },
          {
            script: Boolean(testCase.payload.scriptText.trim()),
            characters: testCase.payload.characters.length,
            scenes: testCase.payload.scenes.length,
            props: testCase.payload.props.length,
            shots: testCase.payload.storyboards.length,
          },
          `${testCase.label}: Manifest must not force stages that the selected Skill did not emit`,
        );

        const committed = await creator.commitAiStoryboardPreview({
          user: owner,
          projectId,
          body: {
            episodeTitle: `Skill output ${testCase.label}`,
            commitPayload: testCase.payload,
          },
          now: new Date(now.getTime() + index * 60_000 + 30_000),
        });
        assert.equal(committed.status, 200, `${testCase.label}: ${JSON.stringify(committed.body)}`);

        const persisted = await readProjectProductionCounts(db, projectId);
        assert.equal(persisted.episodes, 1, `${testCase.label}: the commit must create one project episode`);
        assert.deepEqual(persisted.assetTypes, testCase.expectedAssetTypes, `${testCase.label}: unexpected asset stages were written`);
        assert.equal(persisted.assetVersions, testCase.expectedAssetTypes.length, `${testCase.label}: each material must have one version`);
        assert.equal(persisted.shots, testCase.expectedShots, `${testCase.label}: unexpected shots were written`);
        assert.deepEqual(persisted.referenceRoles, testCase.expectedReferences, `${testCase.label}: shot asset references must use existing relations`);
        assert.equal(persisted.mediaTasks, 0, `${testCase.label}: committing structured output must not start media generation`);
        assert.equal(
          persisted.generationDrafts,
          testCase.expectedGenerationDrafts,
          `${testCase.label}: only storyboard media prompts may become confirmation drafts`,
        );
      }
    } finally {
      await db.close();
    }
  });
});

function emptyPayload(overrides: Partial<CommitPayload>): CommitPayload {
  return {
    scriptText: "",
    scenes: [],
    characters: [],
    props: [],
    storyboards: [],
    ...overrides,
  };
}

async function readProjectProductionCounts(db: SqlDatabase, projectId: string) {
  const counts = await db.query<{
    episodes: number;
    asset_versions: number;
    shots: number;
    generation_drafts: number;
    media_tasks: number;
  }>(
    `
      SELECT
        (SELECT count(*)::int FROM episodes WHERE project_id = $1) AS episodes,
        (SELECT count(*)::int FROM asset_versions version JOIN assets asset ON asset.id = version.asset_id WHERE asset.project_id = $1) AS asset_versions,
        (SELECT count(*)::int FROM shots WHERE project_id = $1) AS shots,
        (SELECT count(*)::int FROM episode_generation_drafts WHERE project_id = $1) AS generation_drafts,
        (SELECT count(*)::int FROM ai_generation_task_snapshots WHERE project_id = $1) AS media_tasks
    `,
    [projectId],
  );
  const assetTypes = await db.query<{ asset_type: string }>(
    "SELECT asset_type FROM assets WHERE project_id = $1 ORDER BY asset_type",
    [projectId],
  );
  const referenceRoles = await db.query<{ reference_role: string }>(
    "SELECT reference_role FROM shot_reference_assets WHERE project_id = $1 ORDER BY sort_order",
    [projectId],
  );
  const row = counts.rows[0]!;
  return {
    episodes: row.episodes,
    assetVersions: row.asset_versions,
    shots: row.shots,
    generationDrafts: row.generation_drafts,
    mediaTasks: row.media_tasks,
    assetTypes: assetTypes.rows.map((item) => item.asset_type),
    referenceRoles: referenceRoles.rows.map((item) => item.reference_role),
  };
}

async function seedAuthenticatedUser(
  db: SqlDatabase,
  input: { userId: string; phone: string; token: string; now: Date },
) {
  await db.query("INSERT INTO users (id, phone_e164, status) VALUES ($1, $2, 'active')", [input.userId, input.phone]);
  const session = await createAuthSession({
    userId: input.userId,
    token: input.token,
    now: input.now,
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
      input.now,
    ],
  );
  return { id: input.userId, sessionToken: input.token };
}
