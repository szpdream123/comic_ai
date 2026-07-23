import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

import { applySqlMigration, loadSqlMigrations } from "../migrations.ts";
import { createMigratedTestDb } from "../test-db.ts";

describe("20260722 generation migrations", { concurrency: false }, () => {
  it("registers every migration in lexical order", async () => {
    const migrationDirectory = join(process.cwd(), "packages", "db", "migrations");
    const files = (await readdir(migrationDirectory))
      .filter((name) => name.startsWith("20260722-") && name.endsWith(".sql"))
      .sort();
    const registered = (await loadSqlMigrations())
      .map((migration) => migration.name)
      .filter((name) => name.startsWith("20260722-"));

    assert.deepEqual(registered, files);
  });

  it("normalizes only media model snapshots without changing task state", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(`
        INSERT INTO workflows (id, workflow_type, status, input_snapshot_json, created_at, updated_at)
        VALUES (
          '99000000-0000-4000-8000-000000000001',
          'snapshot_timeout_test',
          'running',
          '{}'::jsonb,
          '2026-07-23T00:00:00.000Z',
          '2026-07-23T00:00:00.000Z'
        )
      `);
      await db.query(`
        INSERT INTO tasks (
          id, workflow_id, task_type, status, queue_name, input_snapshot_json,
          target_entity_type, target_entity_id, created_at, updated_at
        ) VALUES
        (
          '99000000-0000-4000-8000-000000000011',
          '99000000-0000-4000-8000-000000000001',
          'episode_generate_image', 'failed', 'generation-submit-image',
          '{"billing":{"reserved":7},"modelConfigSnapshot":{"config":{"mediaType":"image","providerConfig":{"endpoint":"/image","timeoutMs":80000,"requestTimeoutMs":81000,"pollIntervalMs":82000,"maxPollAttempts":3,"keep":"image"}}}}'::jsonb,
          'episode', '99000000-0000-4000-8000-000000000101',
          '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'
        ),
        (
          '99000000-0000-4000-8000-000000000012',
          '99000000-0000-4000-8000-000000000001',
          'episode_generate_audio', 'succeeded', 'generation-submit-audio',
          '{"billing":{"reserved":8},"modelConfigSnapshot":{"config":{"mediaType":"audio","providerConfig":{"endpoint":"/audio","timeoutMs":120000,"pollIntervalMs":3000,"keep":"audio"}}}}'::jsonb,
          'episode', '99000000-0000-4000-8000-000000000102',
          '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'
        ),
        (
          '99000000-0000-4000-8000-000000000013',
          '99000000-0000-4000-8000-000000000001',
          'episode_generate_video', 'canceled', 'generation-submit-video',
          '{"billing":{"reserved":9},"modelConfigSnapshot":{"config":{"mediaType":"video","providerConfig":{"endpoint":"/video","timeoutMs":600000,"maxPollAttempts":10,"keep":"video"}}}}'::jsonb,
          'episode', '99000000-0000-4000-8000-000000000103',
          '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'
        ),
        (
          '99000000-0000-4000-8000-000000000014',
          '99000000-0000-4000-8000-000000000001',
          'unrelated_task', 'running', 'unrelated',
          '{"modelConfigSnapshot":{"config":{"mediaType":"video","providerConfig":{"timeoutMs":600000,"keep":"unrelated"}}}}'::jsonb,
          'team_asset', '99000000-0000-4000-8000-000000000104',
          '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'
        ),
        (
          '99000000-0000-4000-8000-000000000015',
          '99000000-0000-4000-8000-000000000001',
          'no_model_snapshot_task', 'running', 'unrelated',
          '{"other":{"timeoutMs":600000,"keep":"no-snapshot"}}'::jsonb,
          'team_asset', '99000000-0000-4000-8000-000000000105',
          '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'
        )
      `);

      await applySqlMigration(
        db,
        process.cwd(),
        "20260722-zzz-normalize-generation-task-snapshot-timeouts.sql",
      );
      const rows = await db.query<{
        task_type: string;
        status: string;
        updated_at: Date | string;
        input_snapshot_json: Record<string, unknown>;
      }>(`
        SELECT task_type, status, updated_at, input_snapshot_json
        FROM tasks
        WHERE workflow_id = '99000000-0000-4000-8000-000000000001'
        ORDER BY task_type
      `);
      const byType = new Map(rows.rows.map((row) => [row.task_type, row]));
      for (const [taskType, expectedStatus, expectedTimeout, expectedKeep, expectedReserved] of [
        ["episode_generate_image", "failed", 3600000, "image", 7],
        ["episode_generate_audio", "succeeded", 3600000, "audio", 8],
        ["episode_generate_video", "canceled", 10800000, "video", 9],
        ["unrelated_task", "running", 10800000, "unrelated", undefined],
      ] as const) {
        const row = byType.get(taskType);
        const snapshot = row?.input_snapshot_json as {
          billing?: { reserved?: number };
          modelConfigSnapshot?: { config?: { providerConfig?: Record<string, unknown> } };
        };
        const providerConfig = snapshot.modelConfigSnapshot?.config?.providerConfig ?? {};
        assert.equal(row?.status, expectedStatus);
        assert.equal(new Date(row?.updated_at ?? 0).toISOString(), "2026-07-23T00:00:00.000Z");
        assert.equal(snapshot.billing?.reserved, expectedReserved);
        assert.equal(providerConfig.timeoutMs, expectedTimeout);
        assert.equal(providerConfig.keep, expectedKeep);
        assert.equal("requestTimeoutMs" in providerConfig, false);
        assert.equal("pollIntervalMs" in providerConfig, false);
        assert.equal("maxPollAttempts" in providerConfig, false);
      }
      const noSnapshot = byType.get("no_model_snapshot_task")?.input_snapshot_json as {
        other?: Record<string, unknown>;
      };
      assert.deepEqual(noSnapshot, { other: { timeoutMs: 600000, keep: "no-snapshot" } });
    } finally {
      await db.close();
    }
  });

  it("creates the required tables, columns, indexes, and constraints", async () => {
    const db = await createMigratedTestDb();
    try {
      const relations = await db.query<{ name: string | null }>(`
        SELECT to_regclass(name)::text AS name
        FROM unnest(ARRAY[
          'outbox_dispatch_fair_cursors',
          'generation_queue_shards',
          'generation_queue_stage_assignments',
          'generation_stage_successors',
          'provider_webhook_inbox'
        ]) name
        ORDER BY name
      `);
      assert.equal(relations.rows.every((row) => row.name !== null), true);

      const columns = await db.query<{ table_name: string; column_name: string }>(`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND (table_name, column_name) IN (
            ('provider_requests', 'next_poll_at'),
            ('provider_requests', 'poll_deadline_at'),
            ('provider_requests', 'provider_config_revision_id'),
            ('provider_requests', 'credential_version_ref'),
            ('outbox_events', 'provider_route_key'),
            ('ai_generation_task_snapshots', 'provider_config_revision_id')
          )
      `);
      assert.equal(columns.rows.length, 6);

      const indexes = await db.query<{ indexname: string }>(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname = ANY($1::text[])
      `, [[
        "provider_requests_due_poll_idx",
        "outbox_events_generation_route_stage_idx",
        "generation_queue_shards_accepting_idx",
        "generation_stage_successors_orphan_idx",
        "provider_webhook_inbox_pending_idx",
        "ai_generation_task_snapshots_user_updated_task_idx",
      ]]);
      assert.equal(indexes.rows.length, 6);

      const constraints = await db.query<{ conname: string }>(`
        SELECT conname
        FROM pg_constraint
        WHERE connamespace = current_schema()::regnamespace
          AND conname = ANY($1::text[])
      `, [[
        "provider_requests_poll_sequence_check",
        "generation_queue_shards_admitted_count_check",
        "generation_stage_successors_unique_stage",
        "provider_webhook_inbox_provider_event_key",
        "scripts_owner_user_id_fkey",
      ]]);
      assert.equal(constraints.rows.length, 5);

      const cumobModels = await db.query<{
        invocation_mode: string;
        query_task_endpoint: string | null;
        async_request: boolean | null;
        timeout_ms: string | null;
      }>(`
        SELECT
          invocation_mode,
          provider_config_json->>'queryTaskEndpoint' AS query_task_endpoint,
          (provider_config_json->'defaultRequestParams'->>'async')::boolean AS async_request,
          provider_config_json->>'timeoutMs' AS timeout_ms
        FROM ai_model_configs
        WHERE model_code IN ('cumob-gpt-image-2-pro', 'cumob-gpt-image-2-vip', 'cumob-gpt-image-2')
      `);
      assert.ok(cumobModels.rows.length >= 2);
      assert.equal(cumobModels.rows.every((row) => row.invocation_mode === "async_polling"), true);
      assert.equal(cumobModels.rows.every((row) => row.query_task_endpoint === "/v1/status/{taskId}"), true);
      assert.equal(cumobModels.rows.every((row) => row.async_request === true), true);
      assert.equal(cumobModels.rows.every((row) => row.timeout_ms === null), true);

      const cumobPolicies = await db.query<{
        poll_queue_name: string | null;
        polling_interval_ms: number;
      }>(`
        SELECT policy.poll_queue_name, policy.polling_interval_ms
        FROM ai_model_dispatch_policies policy
        JOIN ai_model_configs model ON model.id = policy.model_config_id
        WHERE model.model_code IN ('cumob-gpt-image-2-pro', 'cumob-gpt-image-2-vip', 'cumob-gpt-image-2')
      `);
      assert.equal(cumobPolicies.rows.every((row) => row.poll_queue_name === "generation-poll-image"), true);
      assert.equal(cumobPolicies.rows.every((row) => Number(row.polling_interval_ms) === 30000), true);
    } finally {
      await db.close();
    }
  });
});
