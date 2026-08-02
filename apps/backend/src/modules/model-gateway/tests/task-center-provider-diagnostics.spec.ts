import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEmptyTestDb } from "../../shared/db/test-db.ts";
import { applySqlMigration } from "../../shared/db/migrations.ts";
import {
  buildTaskCenterProviderDiagnostics,
  taskCenterProviderDiagnosticsSql,
} from "../task-center-provider-diagnostics.ts";

describe("task center provider diagnostics", () => {
  it("builds a bounded write-time summary without carrying provider artifacts", () => {
    const summary = buildTaskCenterProviderDiagnostics({
      diagnostics: {
        httpStatus: 400,
        responseBodyPreview: "image_url must be public",
        opaqueBinary: "X".repeat(256 * 1024),
      },
      data: [{ b64_json: "A".repeat(256 * 1024) }],
      error: { message: "invalid image URL", code: "invalid_request" },
    });

    assert.deepEqual(summary, {
      diagnostics: {
        httpStatus: 400,
        responseBodyPreview: "image_url must be public",
      },
      error: { message: "invalid image URL", code: "invalid_request" },
    });
    assert.ok(Buffer.byteLength(JSON.stringify(summary), "utf8") < 8 * 1024);
  });

  it("projects only bounded diagnostic fields from arbitrary provider responses", async () => {
    const db = await createEmptyTestDb();
    try {
      const response = {
        diagnostics: { httpStatus: 400, responseBodyPreview: "invalid image URL" },
        providerMessage: "provider rejected the request",
        message: "provider rejected the request",
        status: 400,
        data: [{ b64_json: "D".repeat(256 * 1024) }],
        artifact: { b64Json: "A".repeat(256 * 1024) },
        futureProviderPayload: { opaqueBinary: "B".repeat(256 * 1024) },
      };
      const result = await db.query<{ projection: Record<string, unknown> }>(
        `
          WITH input(response_json) AS (VALUES ($1::jsonb))
          SELECT ${taskCenterProviderDiagnosticsSql("input.response_json")} AS projection
          FROM input
        `,
        [JSON.stringify(response)],
      );
      const projection = result.rows[0]!.projection;

      assert.deepEqual(projection, {
        diagnostics: response.diagnostics,
        message: response.message,
        providerMessage: response.providerMessage,
        status: response.status,
      });
      assert.equal(Object.hasOwn(projection, "artifact"), false);
      assert.equal(Object.hasOwn(projection, "data"), false);
      assert.equal(Object.hasOwn(projection, "futureProviderPayload"), false);
      assert.ok(Buffer.byteLength(JSON.stringify(projection), "utf8") < 8 * 1024);
    } finally {
      await db.close();
    }
  });

  it("keeps actionable nested diagnostics while omitting unrelated oversized fields", async () => {
    const db = await createEmptyTestDb();
    try {
      const result = await db.query<{ projection: Record<string, unknown> }>(
        `
          WITH input(response_json) AS (VALUES ($1::jsonb))
          SELECT ${taskCenterProviderDiagnosticsSql("input.response_json")} AS projection
          FROM input
        `,
        [JSON.stringify({
          diagnostics: {
            responseBodyPreview: "image_url must be a publicly reachable http or https URL",
            harmlessContext: "X".repeat(40 * 1024),
          },
          errorCode: "provider_failed",
        })],
      );

      assert.deepEqual(result.rows[0]!.projection, {
        diagnostics: {
          responseBodyPreview: "image_url must be a publicly reachable http or https URL",
        },
        errorCode: "provider_failed",
      });
    } finally {
      await db.close();
    }
  });

  it("round-trips a write-time summary at the raw UTF-8 field boundary", async () => {
    const db = await createEmptyTestDb();
    try {
      const summary = buildTaskCenterProviderDiagnostics({
        diagnostics: {
          responseBodyPreview: `${'"'.repeat(600)}image_url must be public`,
        },
      });
      const result = await db.query<{ projection: Record<string, unknown> }>(
        `
          WITH input(response_json) AS (VALUES ($1::jsonb))
          SELECT ${taskCenterProviderDiagnosticsSql("input.response_json")} AS projection
          FROM input
        `,
        [JSON.stringify(summary)],
      );

      assert.deepEqual(result.rows[0]?.projection, summary);
    } finally {
      await db.close();
    }
  });

  it("bounds a maximum-size task-center page independently of provider payload size", async () => {
    const db = await createEmptyTestDb();
    try {
      const response = {
        diagnostics: { responseBodyPreview: "D".repeat(1500) },
        providerDiagnostics: { responseBodyPreview: "P".repeat(700) },
        providerRawResponse: "R".repeat(700),
        responseBodyPreview: "B".repeat(700),
        providerMessage: "M".repeat(120),
        errorMessage: "E".repeat(120),
        message: "G".repeat(120),
        artifact: { b64Json: "A".repeat(256 * 1024) },
      };
      const result = await db.query<{
        item_count: number;
        max_item_bytes: number;
        total_bytes: string;
      }>(
        `
          WITH input(response_json) AS (VALUES ($1::jsonb)),
          page AS (
            SELECT input.response_json
            FROM input
            CROSS JOIN generate_series(1, 200)
          ),
          projected AS (
            SELECT ${taskCenterProviderDiagnosticsSql("page.response_json")} AS value
            FROM page
          )
          SELECT
            COUNT(*)::int AS item_count,
            MAX(octet_length(value::text))::int AS max_item_bytes,
            SUM(octet_length(value::text))::text AS total_bytes
          FROM projected
        `,
        [JSON.stringify(response)],
      );

      assert.equal(result.rows[0]!.item_count, 200);
      assert.ok(result.rows[0]!.max_item_bytes < 8 * 1024);
      assert.ok(Number(result.rows[0]!.total_bytes) < 200 * 8 * 1024);
    } finally {
      await db.close();
    }
  });

  it("keeps null responses null and rejects unsafe SQL expressions", async () => {
    const db = await createEmptyTestDb();
    try {
      const result = await db.query<{ projection: Record<string, unknown> | null }>(
        `
          WITH input(response_json) AS (VALUES (NULL::jsonb))
          SELECT ${taskCenterProviderDiagnosticsSql("input.response_json")} AS projection
          FROM input
        `,
      );

      assert.equal(result.rows[0]!.projection, null);
      assert.throws(
        () => taskCenterProviderDiagnosticsSql("input.response_json; SELECT 1"),
        /task_center_provider_response_expression_invalid/,
      );
    } finally {
      await db.close();
    }
  });

  it("adds and backfills bounded task-center diagnostic columns idempotently", async () => {
    const db = await createEmptyTestDb();
    try {
      await db.query(`
        CREATE TABLE provider_requests (
          id uuid PRIMARY KEY,
          task_id uuid,
          response_redacted_json jsonb,
          status text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE ai_generation_task_snapshots (
          id uuid PRIMARY KEY,
          provider_status_json jsonb NOT NULL DEFAULT '{}'::jsonb
        );
        INSERT INTO provider_requests (id, task_id, status, response_redacted_json)
        VALUES (
          '10000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000002',
          'failed',
          jsonb_build_object(
          'diagnostics', jsonb_build_object(
            'httpStatus', 400,
            'body', 'invalid image URL body',
            'details', 'invalid image URL details',
            'contentType', 'application/json',
            'responseBodyPreview', repeat('中', 1024)
          ),
          'data', jsonb_build_array(jsonb_build_object('b64_json', repeat('A', 262144)))
          )
        );
        INSERT INTO ai_generation_task_snapshots (id, provider_status_json)
        VALUES ('10000000-0000-4000-8000-000000000003', jsonb_build_object(
          'diagnostics', jsonb_build_object('httpStatus', 503),
          'artifact', jsonb_build_object('b64Json', repeat('B', 262144))
        ));
      `);

      await applySqlMigration(db, process.cwd(), "20260824-task-center-provider-diagnostics.sql");
      await applySqlMigration(db, process.cwd(), "20260824-task-center-provider-diagnostics.sql");
      await applySqlMigration(db, process.cwd(), "20260824-z-task-center-provider-diagnostics-index.sql");
      await applySqlMigration(db, process.cwd(), "20260824-z-task-center-provider-diagnostics-index.sql");
      await db.query(`
        INSERT INTO provider_requests (id, task_id, status, response_redacted_json)
        VALUES (
          '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000002',
          'result_unknown',
          '{"providerMessage":"first provider message"}'::jsonb
        );
        UPDATE provider_requests
        SET status = 'failed',
            response_redacted_json = '{"providerMessage":"second provider message"}'::jsonb
        WHERE id = '00000000-0000-4000-8000-000000000001';
      `);

      const provider = await db.query<{
        summary: Record<string, unknown>;
        projection: Record<string, unknown>;
      }>(
        `
          SELECT task_center_diagnostics_json AS summary,
                 ${taskCenterProviderDiagnosticsSql("provider_requests.task_center_diagnostics_json")} AS projection
          FROM provider_requests
          WHERE id = '10000000-0000-4000-8000-000000000001'
        `,
      );
      const snapshot = await db.query<{ summary: Record<string, unknown> }>(
        "SELECT task_center_diagnostics_json AS summary FROM ai_generation_task_snapshots",
      );
      const providerSummary = provider.rows[0]?.summary;
      const responseBodyPreview = String(
        (providerSummary?.diagnostics as Record<string, unknown> | undefined)?.responseBodyPreview ?? "",
      );
      assert.equal(
        Buffer.byteLength(responseBodyPreview, "utf8") <= 1024,
        true,
      );
      assert.equal(responseBodyPreview.startsWith("中"), true);
      assert.deepEqual(provider.rows[0]?.projection, providerSummary);
      assert.deepEqual(providerSummary, {
        diagnostics: {
          httpStatus: 400,
          body: "invalid image URL body",
          details: "invalid image URL details",
          contentType: "application/json",
          responseBodyPreview,
        },
      });
      assert.deepEqual(snapshot.rows[0]?.summary, {
        diagnostics: { httpStatus: 503 },
      });
      await db.query(`
        UPDATE ai_generation_task_snapshots
        SET provider_status_json = '{"providerMessage":"second snapshot message"}'::jsonb
        WHERE id = '10000000-0000-4000-8000-000000000003'
      `);
      const refreshedSnapshot = await db.query<{ summary: Record<string, unknown> }>(`
        SELECT task_center_diagnostics_json AS summary
        FROM ai_generation_task_snapshots
        WHERE id = '10000000-0000-4000-8000-000000000003'
      `);
      assert.deepEqual(refreshedSnapshot.rows[0]?.summary, {
        providerMessage: "second snapshot message",
      });
      const triggerBackfill = await db.query<{
        summary: Record<string, unknown>;
        backfilled_at: Date | string | null;
      }>(`
        SELECT task_center_diagnostics_json AS summary,
               task_center_diagnostics_backfilled_at AS backfilled_at
        FROM provider_requests
        WHERE id = '00000000-0000-4000-8000-000000000001'
      `);
      assert.deepEqual(triggerBackfill.rows[0]?.summary, {
        providerMessage: "second provider message",
      });
      assert.ok(triggerBackfill.rows[0]?.backfilled_at);
      const index = await db.query<{ is_valid: boolean }>(`
        SELECT index_record.indisvalid AS is_valid
        FROM pg_index index_record
        WHERE index_record.indexrelid = 'provider_requests_task_center_diagnostics_idx'::regclass
      `);
      assert.equal(index.rows[0]?.is_valid, true);
    } finally {
      await db.close();
    }
  });
});
