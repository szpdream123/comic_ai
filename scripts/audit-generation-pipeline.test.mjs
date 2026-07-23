import assert from "node:assert/strict";
import { test } from "node:test";

import { auditGenerationPipeline } from "./audit-generation-pipeline.mjs";

test("generation pipeline audit is read-only and aggregates findings", async () => {
  const statements = [];
  const db = {
    async query(sql, params) {
      statements.push({ sql, params });
      return {
        rows: statements.length <= 2
          ? [{
              task_id: `task-${statements.length}`,
              occurrences: statements.length === 1 ? 2 : 30,
              audit_total_count: 1,
              audit_occurrence_count: statements.length === 1 ? 2 : 30,
            }]
          : [],
      };
    },
  };

  const report = await auditGenerationPipeline(db, new Date("2026-07-21T00:00:00.000Z"));

  assert.equal(report.mode, "dry-run");
  assert.equal(report.checks.length, 13);
  assert.equal(report.totalFindings, 2);
  assert.equal(report.totalActionableFindings, 1);
  assert.equal(report.totalInformationalFindings, 1);
  assert.equal(report.checks[0]?.severity, "actionable");
  assert.equal(report.checks[0]?.occurrenceCount, 2);
  assert.equal(report.checks[1]?.severity, "info");
  assert.equal(report.checks[1]?.occurrenceCount, 30);
  assert.equal(statements.length, 13);
  assert.equal(statements.every(({ sql }) => /^\s*SELECT\b/i.test(sql)), true);
  assert.equal(statements.some(({ sql }) => /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP)\b/i.test(sql)), false);
  assert.match(statements[0].sql, /active_occurrences > 0/);
  assert.match(statements[1].sql, /active_occurrences = 0/);
  assert.match(statements[3].sql, /generation_queue_stage_assignments/);
  assert.match(statements[6].sql, /ambiguous_provider_submission_terminal/);
  assert.match(statements[6].sql, /IN \('408', '429'\)/);
  assert.match(statements[7].sql, /external_submission_terminal_timeout/);
  assert.match(statements[8].sql, /artifact_transfer_failure_provider_state_stale/);
  assert.match(statements[9].sql, /definitive_http_response_terminal/);
  assert.match(statements[9].sql, /NOT IN \('408', '429'\)/);
});
