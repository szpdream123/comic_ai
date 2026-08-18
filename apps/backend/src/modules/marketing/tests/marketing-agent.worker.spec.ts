import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { PGlite } from "@electric-sql/pglite";

import type { SqlDatabase } from "../../shared/db/sql.ts";
import { createMarketingService } from "../application/marketing.service.ts";
import { PostgresMarketingAgentRunStore } from "../infrastructure/postgres-marketing-agent-store.ts";
import type { MarketingAgentJson, MarketingAgentStageProvider } from "../ports/marketing-agent.ts";
import { MarketingAgentWorker } from "../workers/marketing-agent.worker.ts";

describe("marketing agent worker", () => {
  it("runs research -> strategy -> copy -> media -> compliance with approved citations", async () => {
    const fixture = await createFixture("internal", { objective: "Explain verified capabilities" });
    try {
      const calls: string[] = [];
      const providers = localProviders(fixture.segmentId, calls);
      const worker = new MarketingAgentWorker({ store: fixture.store, providers });
      const results = await worker.processUntilIdle();

      assert.deepEqual(results.map((result) => `${result.stage}:${result.status}`), [
        "research:succeeded",
        "strategy:succeeded",
        "copy:succeeded",
        "media:succeeded",
        "compliance:succeeded",
      ]);
      assert.deepEqual(calls, ["research", "strategy", "copy", "media", "compliance"]);
      const run = await fixture.db.query<{ status: string; current_stage: string; output_json: MarketingAgentJson }>(
        "SELECT status, current_stage, output_json FROM marketing_agent_runs WHERE id = $1",
        [fixture.runId],
      );
      assert.equal(run.rows[0]?.status, "succeeded");
      assert.equal(run.rows[0]?.current_stage, "compliance");
      assert.equal((run.rows[0]?.output_json as Record<string, unknown>).result != null, true);
      const steps = await fixture.db.query<{ stage: string; status: string; provider_name: string; input_summary: string }>(
        "SELECT stage, status, provider_name, input_summary FROM marketing_agent_steps WHERE run_id = $1 ORDER BY created_at",
        [fixture.runId],
      );
      assert.equal(steps.rows.length, 5);
      assert.ok(steps.rows.every((step) => step.status === "succeeded"));
      assert.ok(steps.rows.every((step) => step.provider_name.startsWith("local-")));
      assert.ok(steps.rows.every((step) => /sha256=[a-f0-9]{64}/.test(step.input_summary)));
      const usage = await fixture.db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM marketing_agent_usage_records WHERE run_id = $1",
        [fixture.runId],
      );
      assert.equal(usage.rows[0]?.count, 5);
    } finally {
      await fixture.close();
    }
  });

  it("requires explicit external provider approval and does not fabricate output", async () => {
    const fixture = await createFixture("internal", { publicBrief: "safe", secret: "must-not-leave" });
    let called = false;
    try {
      const provider: MarketingAgentStageProvider = {
        stage: "research",
        name: "external-unapproved",
        execution: "external",
        async execute() {
          called = true;
          return { output: { fabricated: true } };
        },
      };
      const result = await new MarketingAgentWorker({ store: fixture.store, providers: [provider] }).processNext();
      assert.equal(result?.status, "manual_review_required");
      assert.equal(result?.failureCode, "marketing_agent_provider_approval_required");
      assert.equal(called, false);
      const step = await fixture.db.query<{ status: string; output_json: MarketingAgentJson; error_code: string }>(
        "SELECT status, output_json, error_code FROM marketing_agent_steps WHERE run_id = $1 AND stage = 'research'",
        [fixture.runId],
      );
      assert.equal(step.rows[0]?.status, "manual_review_required");
      assert.equal(step.rows[0]?.error_code, "marketing_agent_provider_approval_required");
      assert.equal(Object.hasOwn(step.rows[0]?.output_json as object, "fabricated"), false);
    } finally {
      await fixture.close();
    }
  });

  it("stops generated strategy when it does not cite approved knowledge", async () => {
    const fixture = await createFixture("internal", { objective: "Create an original strategy" });
    try {
      const providers = localProviders(fixture.segmentId, []);
      providers[1] = {
        ...providers[1]!,
        async execute() {
          return { output: { strategy: "uncited" }, knowledgeSegmentIds: [] };
        },
      };
      const results = await new MarketingAgentWorker({ store: fixture.store, providers }).processUntilIdle();
      assert.deepEqual(results.map((result) => `${result.stage}:${result.status}`), [
        "research:succeeded",
        "strategy:manual_review_required",
      ]);
      assert.equal(results[1]?.failureCode, "marketing_agent_approved_citations_required");
      const run = await fixture.db.query<{ status: string; current_stage: string }>(
        "SELECT status, current_stage FROM marketing_agent_runs WHERE id = $1",
        [fixture.runId],
      );
      assert.deepEqual(run.rows[0], { status: "manual_review_required", current_stage: "strategy" });
    } finally {
      await fixture.close();
    }
  });

  it("externalizes only approved fields and audits classification, hash and approval", async () => {
    const fixture = await createFixture("restricted", { publicBrief: "approved summary", secret: "must-not-leave" });
    let received: MarketingAgentJson | null = null;
    try {
      const provider: MarketingAgentStageProvider = {
        stage: "research",
        name: "approved-research-api",
        modelVersion: "research-v2",
        execution: "external",
        approval: {
          approved: true,
          approvalReference: "DPA-2026-08-15",
          dataClassifications: ["restricted"],
          allowedInputPaths: ["runInput.publicBrief"],
        },
        async execute(request) {
          received = request.input;
          return {
            output: { summary: "researched" }, sourceIds: [randomUUID()],
            usage: { inputTokens: 12, outputTokens: 8, estimatedCost: 0.0025 },
          };
        },
      };
      const result = await new MarketingAgentWorker({ store: fixture.store, providers: [provider] }).processNext();
      assert.equal(result?.status, "succeeded");
      assert.deepEqual(received, { runInput: { publicBrief: "approved summary" } });
      const audit = await fixture.db.query<{ event_type: string; detail_json: Record<string, unknown> }>(
        "SELECT event_type, detail_json FROM marketing_audit_events WHERE campaign_id = $1",
        [fixture.campaignId],
      );
      assert.equal(audit.rows[0]?.event_type, "agent.externalization");
      assert.equal(audit.rows[0]?.detail_json.dataClassification, "restricted");
      assert.equal(audit.rows[0]?.detail_json.approvalReference, "DPA-2026-08-15");
      assert.match(String(audit.rows[0]?.detail_json.contentSha256), /^[a-f0-9]{64}$/);
      const usage = await fixture.db.query<{ provider_name: string; input_tokens: number; output_tokens: number; estimated_cost: number }>(
        "SELECT provider_name, input_tokens, output_tokens, estimated_cost FROM marketing_agent_usage_records WHERE run_id = $1",
        [fixture.runId],
      );
      assert.deepEqual(usage.rows[0], {
        provider_name: "approved-research-api", input_tokens: 12, output_tokens: 8, estimated_cost: "0.0025",
      });
    } finally {
      await fixture.close();
    }
  });

  it("reclaims a stale running step and fences the previous execution token", async () => {
    const fixture = await createFixture("public", { topic: "recovery" });
    try {
      const first = await fixture.store.claimNext({
        now: new Date("2026-08-15T00:00:00.000Z"),
        staleBefore: new Date("2026-08-14T23:45:00.000Z"),
        executionToken: "first-token",
      });
      assert.ok(first);
      const replacement = await fixture.store.claimNext({
        now: new Date("2026-08-15T00:16:00.000Z"),
        staleBefore: new Date("2026-08-15T00:01:00.000Z"),
        executionToken: "replacement-token",
      });
      assert.equal(replacement?.stepId, first.stepId);

      const staleWrite = await fixture.store.completeStep({
        stepId: first.stepId,
        executionToken: first.executionToken,
        stage: "research",
        output: { result: { stale: true } },
        sourceIds: [],
        knowledgeSegmentIds: [],
        finishedAt: new Date("2026-08-15T00:17:00.000Z"),
      });
      assert.equal(staleWrite, false);
      const replacementWrite = await fixture.store.completeStep({
        stepId: replacement!.stepId,
        executionToken: replacement!.executionToken,
        stage: "research",
        output: { result: { recovered: true } },
        sourceIds: [],
        knowledgeSegmentIds: [],
        finishedAt: new Date("2026-08-15T00:18:00.000Z"),
      });
      assert.equal(replacementWrite, true);
      const run = await fixture.db.query<{ current_stage: string; status: string }>(
        "SELECT current_stage, status FROM marketing_agent_runs WHERE id = $1",
        [fixture.runId],
      );
      assert.deepEqual(run.rows[0], { current_stage: "strategy", status: "running" });
    } finally {
      await fixture.close();
    }
  });

  it("requeues only the current failed or manual-review step through an atomic retry", async () => {
    const fixture = await createFixture("internal", { topic: "manual retry" });
    try {
      const claimed = await fixture.store.claimNext({
        now: new Date("2026-08-15T00:00:00.000Z"),
        staleBefore: new Date("2026-08-14T23:45:00.000Z"),
        executionToken: "manual-token",
      });
      assert.ok(claimed);
      await fixture.store.requireManualReview({
        stepId: claimed.stepId,
        executionToken: claimed.executionToken,
        errorCode: "marketing_agent_provider_approval_required",
        detail: { reason: "approval missing" },
        finishedAt: new Date("2026-08-15T00:01:00.000Z"),
      });

      const retried = await createMarketingService({ db: fixture.db }).retryAgentRun(fixture.runId, fixture.adminId);
      assert.deepEqual(retried, { id: fixture.runId, status: "queued", stage: "research" });
      const state = await fixture.db.query<{ run_status: string; step_status: string; output_json: MarketingAgentJson }>(
        `SELECT run.status AS run_status, step.status AS step_status, step.output_json
         FROM marketing_agent_runs AS run
         JOIN marketing_agent_steps AS step ON step.run_id = run.id AND step.stage = run.current_stage
         WHERE run.id = $1`,
        [fixture.runId],
      );
      assert.deepEqual(state.rows[0], { run_status: "queued", step_status: "queued", output_json: {} });
    } finally {
      await fixture.close();
    }
  });

  it("creates all five recoverable steps and preserves requested knowledge references", async () => {
    const fixture = await createFixture("public", { topic: "existing fixture" });
    try {
      const created = await createMarketingService({ db: fixture.db }).startAgentRun({
        campaignId: fixture.campaignId,
        idempotencyKey: `agent-${randomUUID()}`,
        dataClassification: "internal",
        input: { objective: "Generate cited content", knowledgeSegmentIds: [fixture.segmentId] },
      }, fixture.adminId);
      const run = await fixture.db.query<{ status: string; knowledge_segment_ids_json: string[]; step_count: number }>(
        `SELECT run.status, run.knowledge_segment_ids_json, count(step.id)::int AS step_count
         FROM marketing_agent_runs AS run
         JOIN marketing_agent_steps AS step ON step.run_id = run.id
         WHERE run.id = $1
         GROUP BY run.id`,
        [created.id],
      );
      assert.equal(run.rows[0]?.status, "queued");
      assert.deepEqual(run.rows[0]?.knowledge_segment_ids_json, [fixture.segmentId]);
      assert.equal(run.rows[0]?.step_count, 5);
    } finally {
      await fixture.close();
    }
  });
});

function localProviders(segmentId: string, calls: string[]): MarketingAgentStageProvider[] {
  return (["research", "strategy", "copy", "media", "compliance"] as const).map((stage) => ({
    stage,
    name: `local-${stage}`,
    modelVersion: `test-${stage}-v1`,
    execution: "local" as const,
    async execute(request) {
      calls.push(stage);
      assert.equal(request.systemRules.length >= 4, true);
      return {
        output: stage === "compliance" ? { stage, passed: true } : { stage, generated: true },
        sourceIds: stage === "research" ? [randomUUID()] : [],
        knowledgeSegmentIds: stage === "strategy" || stage === "copy" || stage === "media" ? [segmentId] : [],
      };
    },
  }));
}

async function createFixture(classification: "public" | "internal" | "restricted", input: MarketingAgentJson) {
  const raw = new PGlite();
  const db: SqlDatabase = {
    async query<T>(sql: string, params?: unknown[]) {
      const result = await raw.query(sql, params as never[] | undefined);
      return { rows: result.rows as T[] };
    },
  };
  await raw.exec(`
    CREATE TABLE marketing_agent_runs (
      id uuid PRIMARY KEY, campaign_id uuid NOT NULL, idempotency_key text NOT NULL UNIQUE,
      status text NOT NULL DEFAULT 'queued', current_stage text NOT NULL DEFAULT 'research',
      data_classification text NOT NULL, input_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      output_json jsonb NOT NULL DEFAULT '{}'::jsonb, knowledge_segment_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
      failure_code text NULL, created_by_admin_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE marketing_campaigns (
      id uuid PRIMARY KEY, project_id uuid NOT NULL, status text NOT NULL,
      platform_constraints_json jsonb NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE TABLE marketing_agent_steps (
      id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES marketing_agent_runs(id) ON DELETE CASCADE,
      stage text NOT NULL, status text NOT NULL DEFAULT 'queued', input_summary text NOT NULL DEFAULT '',
      output_json jsonb NOT NULL DEFAULT '{}'::jsonb, provider_name text NULL,
      source_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb, knowledge_segment_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
      error_code text NULL, started_at timestamptz NULL, finished_at timestamptz NULL,
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (run_id, stage)
    );
    CREATE TABLE marketing_agent_usage_records (
      id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES marketing_agent_runs(id) ON DELETE CASCADE,
      step_id uuid NOT NULL REFERENCES marketing_agent_steps(id) ON DELETE CASCADE UNIQUE,
      campaign_id uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
      stage text NOT NULL, provider_name text NOT NULL, data_classification text NOT NULL,
      input_tokens integer NULL, output_tokens integer NULL, media_seconds numeric NULL,
      estimated_cost numeric NULL, usage_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      recorded_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE marketing_sources (
      id uuid PRIMARY KEY, source_url text NULL, status text NOT NULL, authorization_status text NOT NULL
    );
    CREATE TABLE marketing_knowledge_documents (
      id uuid PRIMARY KEY, project_id uuid NULL, source_id uuid NULL REFERENCES marketing_sources(id), status text NOT NULL
    );
    CREATE TABLE marketing_knowledge_segments (
      id uuid PRIMARY KEY, document_id uuid NOT NULL REFERENCES marketing_knowledge_documents(id),
      content text NOT NULL, summary text NOT NULL
    );
    CREATE TABLE marketing_audit_events (
      id uuid PRIMARY KEY, project_id uuid NULL, campaign_id uuid NULL, content_variant_id uuid NULL,
      publish_job_id uuid NULL, actor_type text NOT NULL, actor_id text NOT NULL,
      event_type text NOT NULL, detail_json jsonb NOT NULL
    );
  `);
  const runId = randomUUID();
  const campaignId = randomUUID();
  const projectId = randomUUID();
  const adminId = randomUUID();
  const documentId = randomUUID();
  const segmentId = randomUUID();
  await db.query("INSERT INTO marketing_campaigns (id, project_id, status) VALUES ($1, $2, 'active')", [campaignId, projectId]);
  await db.query(
    `INSERT INTO marketing_agent_runs (
       id, campaign_id, idempotency_key, data_classification, input_json,
       knowledge_segment_ids_json, created_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`,
    [runId, campaignId, randomUUID(), classification, JSON.stringify(input), JSON.stringify([segmentId]), adminId],
  );
  await db.query(
    "INSERT INTO marketing_knowledge_documents (id, project_id, status) VALUES ($1, $2, 'approved')",
    [documentId, projectId],
  );
  await db.query(
    "INSERT INTO marketing_knowledge_segments (id, document_id, content, summary) VALUES ($1, $2, 'Approved fact', 'Approved summary')",
    [segmentId, documentId],
  );
  return {
    db,
    store: new PostgresMarketingAgentRunStore(db),
    runId,
    campaignId,
    adminId,
    segmentId,
    close: () => raw.close(),
  };
}
