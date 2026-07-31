import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEmptyTestDb } from "../../shared/db/test-db.ts";
import {
  deleteEpisodeForProject,
  EpisodeGenerationInProgressError,
} from "../episode-record.service.ts";

describe("episode record service", () => {
  it("detaches generation task snapshots before deleting an episode", async () => {
    const db = await createEmptyTestDb();
    const projectId = "10000000-0000-4000-8000-000000000001";
    const episodeId = "20000000-0000-4000-8000-000000000001";

    try {
      await createEpisodeDeletionSchema(db);
      await db.query("INSERT INTO episodes (id, project_id) VALUES ($1, $2)", [
        episodeId,
        projectId,
      ]);
      await db.query(
        `INSERT INTO ai_generation_task_snapshots (id, project_id, episode_id)
         VALUES ($1, $2, $3)`,
        ["30000000-0000-4000-8000-000000000001", null, episodeId],
      );
      await db.query(
        `INSERT INTO creator_canvas_node_runs (id, generation_snapshot_id)
         VALUES ($1, $2)`,
        ["40000000-0000-4000-8000-000000000001", "30000000-0000-4000-8000-000000000001"],
      );

      const deleted = await deleteEpisodeForProject(db, { projectId, episodeId });

      assert.equal(deleted, true);
      assert.equal(
        (await db.query<{ episode_id: string | null }>(
          "SELECT episode_id FROM ai_generation_task_snapshots WHERE id = $1",
          ["30000000-0000-4000-8000-000000000001"],
        )).rows[0]?.episode_id,
        null,
      );
      assert.equal(
        (await db.query<{ generation_snapshot_id: string | null }>(
          "SELECT generation_snapshot_id FROM creator_canvas_node_runs WHERE id = $1",
          ["40000000-0000-4000-8000-000000000001"],
        )).rows[0]?.generation_snapshot_id,
        "30000000-0000-4000-8000-000000000001",
      );
      assert.equal(
        (await db.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM episodes WHERE id = $1",
          [episodeId],
        )).rows[0]?.count,
        0,
      );
    } finally {
      await db.close();
    }
  });

  it("rolls back dependent record deletion when deleting the episode fails", async () => {
    const db = await createEmptyTestDb();
    const projectId = "10000000-0000-4000-8000-000000000001";
    const episodeId = "20000000-0000-4000-8000-000000000001";

    try {
      await createEpisodeDeletionSchema(db);
      await db.query("INSERT INTO episodes (id, project_id) VALUES ($1, $2)", [
        episodeId,
        projectId,
      ]);
      await db.query(
        `INSERT INTO ai_generation_task_snapshots (id, project_id, episode_id)
         VALUES ($1, $2, $3)`,
        ["30000000-0000-4000-8000-000000000001", projectId, episodeId],
      );

      const failingDb = {
        query<T>(sql: string, params?: unknown[]) {
          if (/DELETE\s+FROM\s+episodes/i.test(sql)) {
            throw new Error("forced_episode_delete_failure");
          }
          return db.query<T>(sql, params);
        },
      };

      await assert.rejects(
        deleteEpisodeForProject(failingDb, { projectId, episodeId }),
        /forced_episode_delete_failure/,
      );
      assert.equal(
        (await db.query<{ episode_id: string | null }>(
          "SELECT episode_id FROM ai_generation_task_snapshots WHERE id = $1",
          ["30000000-0000-4000-8000-000000000001"],
        )).rows[0]?.episode_id,
        episodeId,
      );
    } finally {
      await db.close();
    }
  });

  it("does not detach an episode owned by another project", async () => {
    const db = await createEmptyTestDb();
    const projectId = "10000000-0000-4000-8000-000000000001";
    const otherProjectId = "10000000-0000-4000-8000-000000000002";
    const episodeId = "20000000-0000-4000-8000-000000000001";

    try {
      await createEpisodeDeletionSchema(db);
      await db.query("INSERT INTO episodes (id, project_id) VALUES ($1, $2)", [episodeId, projectId]);
      await db.query(
        `INSERT INTO ai_generation_task_snapshots (id, project_id, episode_id)
         VALUES ($1, $2, $3)`,
        ["30000000-0000-4000-8000-000000000001", projectId, episodeId],
      );

      assert.equal(
        await deleteEpisodeForProject(db, { projectId: otherProjectId, episodeId }),
        false,
      );
      assert.equal(
        (await db.query<{ episode_id: string | null }>(
          "SELECT episode_id FROM ai_generation_task_snapshots WHERE id = $1",
          ["30000000-0000-4000-8000-000000000001"],
        )).rows[0]?.episode_id,
        episodeId,
      );
      assert.equal(
        (await db.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM episodes WHERE id = $1",
          [episodeId],
        )).rows[0]?.count,
        1,
      );
    } finally {
      await db.close();
    }
  });

  it("keeps the episode and snapshot while an attached generation task is active", async () => {
    const db = await createEmptyTestDb();
    const projectId = "10000000-0000-4000-8000-000000000001";
    const episodeId = "20000000-0000-4000-8000-000000000001";
    const taskId = "50000000-0000-4000-8000-000000000001";
    const resumableTaskId = "50000000-0000-4000-8000-000000000002";

    try {
      await createEpisodeDeletionSchema(db);
      await db.query("INSERT INTO episodes (id, project_id) VALUES ($1, $2)", [episodeId, projectId]);
      await db.query(
        "INSERT INTO tasks (id, status) VALUES ($1, 'running')",
        [taskId],
      );
      await db.query(
        "INSERT INTO tasks (id, status) VALUES ($1, 'manual_review_required')",
        [resumableTaskId],
      );
      await db.query(
        `INSERT INTO ai_generation_task_snapshots (id, project_id, episode_id, task_id, status)
         VALUES ($1, $2, $3, $4, 'running')`,
        ["30000000-0000-4000-8000-000000000001", projectId, episodeId, taskId],
      );
      await db.query(
        `INSERT INTO ai_generation_task_snapshots (id, project_id, episode_id, task_id, status)
         VALUES ($1, $2, $3, $4, 'manual_review_required')`,
        ["30000000-0000-4000-8000-000000000002", projectId, episodeId, resumableTaskId],
      );

      await assert.rejects(
        deleteEpisodeForProject(db, { projectId, episodeId }),
        EpisodeGenerationInProgressError,
      );
      await db.query("UPDATE tasks SET status = 'succeeded' WHERE id = $1", [taskId]);
      await assert.rejects(
        deleteEpisodeForProject(db, { projectId, episodeId }),
        EpisodeGenerationInProgressError,
      );
      assert.equal(
        (await db.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM episodes WHERE id = $1",
          [episodeId],
        )).rows[0]?.count,
        1,
      );
      assert.equal(
        (await db.query<{ episode_id: string | null }>(
          "SELECT episode_id FROM ai_generation_task_snapshots WHERE task_id = $1",
          [taskId],
        )).rows[0]?.episode_id,
        episodeId,
      );
    } finally {
      await db.close();
    }
  });
});

async function createEpisodeDeletionSchema(
  db: Awaited<ReturnType<typeof createEmptyTestDb>>,
) {
  await db.query(`
    CREATE TABLE episodes (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL
    );
    CREATE TABLE tasks (
      id uuid PRIMARY KEY,
      status text NOT NULL
    );
    CREATE TABLE ai_generation_task_snapshots (
      id uuid PRIMARY KEY,
      project_id uuid,
      episode_id uuid REFERENCES episodes(id),
      task_id uuid REFERENCES tasks(id),
      status text,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE creator_canvas_node_runs (
      id uuid PRIMARY KEY,
      generation_snapshot_id uuid REFERENCES ai_generation_task_snapshots(id)
    );
    CREATE TABLE episode_asset_conversation_threads (
      project_id uuid NOT NULL,
      episode_id uuid NOT NULL
    );
    CREATE TABLE episode_generation_drafts (
      project_id uuid NOT NULL,
      episode_id uuid NOT NULL
    );
    CREATE TABLE export_records (
      project_id uuid NOT NULL,
      episode_id uuid
    );
    CREATE TABLE shots (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL,
      episode_id uuid
    );
    CREATE TABLE shot_reference_assets (
      project_id uuid NOT NULL,
      shot_id uuid NOT NULL
    );
    CREATE TABLE calibration_items (
      shot_id uuid NOT NULL
    );
  `);
}
