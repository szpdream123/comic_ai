import type { SqlDatabase } from "../../shared/db/sql.ts";
import {
  MARKETING_AGENT_STAGES,
  type ClaimedMarketingAgentStep,
  type MarketingAgentDataClassification,
  type MarketingAgentJson,
  type MarketingAgentKnowledgeSegment,
  type MarketingAgentRunStore,
  type MarketingAgentStage,
} from "../ports/marketing-agent.ts";

export class PostgresMarketingAgentRunStore implements MarketingAgentRunStore {
  private nextEnsureStepsAtMs = 0;
  private ensureStepsPending: Promise<void> | null = null;

  constructor(private readonly db: SqlDatabase) {}

  async claimNext(input: { now: Date; staleBefore: Date; executionToken: string }) {
    await this.ensureStepsIfDue(input.now);
    const result = await this.db.query<{
      step_id: string;
      run_id: string;
      campaign_id: string;
      created_by_admin_id: string;
      stage: MarketingAgentStage;
      data_classification: MarketingAgentDataClassification;
      input_json: MarketingAgentJson | string;
      knowledge_segment_ids_json: string[] | string;
    }>(
      `WITH candidate AS (
         SELECT step.id
         FROM marketing_agent_steps AS step
         JOIN marketing_agent_runs AS run ON run.id = step.run_id
         WHERE run.status IN ('queued', 'running')
           AND step.stage = run.current_stage
           AND (
             step.status = 'queued'
             OR (step.status = 'running' AND step.started_at < $2)
           )
         ORDER BY run.created_at, step.created_at
         FOR UPDATE OF step SKIP LOCKED
         LIMIT 1
       ), claimed AS (
         UPDATE marketing_agent_steps AS step
         SET status = 'running', started_at = $1, finished_at = NULL, error_code = NULL,
             output_json = jsonb_build_object('executionToken', $3::text)
         FROM candidate
         WHERE step.id = candidate.id
         RETURNING step.id, step.run_id, step.stage
       )
       SELECT claimed.id AS step_id, run.id AS run_id, run.campaign_id, run.created_by_admin_id, claimed.stage,
              run.data_classification, run.input_json, run.knowledge_segment_ids_json
       FROM claimed
       JOIN marketing_agent_runs AS run ON run.id = claimed.run_id`,
      [input.now, input.staleBefore, input.executionToken],
    );
    const row = result.rows[0];
    if (!row) return null;
    await this.db.query(
      "UPDATE marketing_agent_runs SET status = 'running', updated_at = $2 WHERE id = $1 AND status IN ('queued', 'running')",
      [row.run_id, input.now],
    );
    return {
      stepId: row.step_id,
      executionToken: input.executionToken,
      runId: row.run_id,
      campaignId: row.campaign_id,
      createdByAdminId: row.created_by_admin_id,
      stage: row.stage,
      dataClassification: row.data_classification,
      runInput: jsonValue(row.input_json),
      knowledgeSegmentIds: stringArray(row.knowledge_segment_ids_json),
    } satisfies ClaimedMarketingAgentStep;
  }

  async listSucceededOutputs(runId: string) {
    const result = await this.db.query<{ stage: MarketingAgentStage; output_json: MarketingAgentJson | string }>(
      `SELECT stage, output_json
       FROM marketing_agent_steps
       WHERE run_id = $1 AND status IN ('succeeded', 'skipped')
       ORDER BY created_at`,
      [runId],
    );
    return Object.fromEntries(result.rows.map((row) => [row.stage, jsonValue(row.output_json)])) as Partial<Record<MarketingAgentStage, MarketingAgentJson>>;
  }

  async loadApprovedKnowledgeSegments(ids: string[], campaignId: string) {
    if (!ids.length) return [];
    const result = await this.db.query<{
      id: string;
      document_id: string;
      content: string;
      summary: string;
      source_url: string | null;
    }>(
      `SELECT segment.id, segment.document_id, segment.content, segment.summary, source.source_url
       FROM marketing_knowledge_segments AS segment
       JOIN marketing_knowledge_documents AS document ON document.id = segment.document_id
       JOIN marketing_campaigns AS campaign ON campaign.id = $2
       LEFT JOIN marketing_sources AS source ON source.id = document.source_id
       WHERE segment.id = ANY($1::uuid[])
         AND document.status = 'approved'
         AND (document.project_id = campaign.project_id OR document.project_id IS NULL)
         AND (source.id IS NULL OR (source.status = 'active' AND source.authorization_status IN ('owned', 'authorized')))`,
      [ids, campaignId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      documentId: row.document_id,
      content: row.content,
      summary: row.summary,
      sourceUrl: row.source_url,
    })) satisfies MarketingAgentKnowledgeSegment[];
  }

  async recordStepInput(input: { stepId: string; executionToken: string; inputSummary: string; providerName: string }) {
    const result = await this.db.query<{ id: string }>(
      `UPDATE marketing_agent_steps
       SET input_summary = $3, provider_name = $4
       WHERE id = $1 AND status = 'running' AND output_json->>'executionToken' = $2
       RETURNING id`,
      [input.stepId, input.executionToken, input.inputSummary, input.providerName],
    );
    return Boolean(result.rows[0]);
  }

  async recordExternalization(input: {
    runId: string;
    campaignId: string;
    stage: MarketingAgentStage;
    providerName: string;
    dataClassification: MarketingAgentDataClassification;
    contentSha256: string;
    approvalReference: string;
    allowedInputPaths: string[];
  }) {
    await this.db.query(
      `INSERT INTO marketing_audit_events (
         id, campaign_id, actor_type, actor_id, event_type, detail_json
       ) VALUES (gen_random_uuid(), $1, 'system', 'marketing-agent-worker', 'agent.externalization', $2::jsonb)`,
      [input.campaignId, JSON.stringify({
        runId: input.runId,
        stage: input.stage,
        provider: input.providerName,
        dataClassification: input.dataClassification,
        contentSha256: input.contentSha256,
        approvalReference: input.approvalReference,
        allowedInputPaths: input.allowedInputPaths,
        fieldClassifications: Object.fromEntries(
          input.allowedInputPaths.map((path) => [path, input.dataClassification]),
        ),
      })],
    );
  }

  async completeStep(input: {
    stepId: string;
    executionToken: string;
    stage: MarketingAgentStage;
    output: MarketingAgentJson;
    sourceIds: string[];
    knowledgeSegmentIds: string[];
    finishedAt: Date;
  }) {
    const nextStage = MARKETING_AGENT_STAGES[MARKETING_AGENT_STAGES.indexOf(input.stage) + 1] ?? null;
    await this.db.query("BEGIN");
    try {
      const changed = await this.db.query<{ run_id: string }>(
        `UPDATE marketing_agent_steps
         SET status = 'succeeded', output_json = $3::jsonb, source_ids_json = $4::jsonb,
             knowledge_segment_ids_json = $5::jsonb, finished_at = $6, error_code = NULL
         WHERE id = $1 AND status = 'running' AND output_json->>'executionToken' = $2
         RETURNING run_id`,
        [input.stepId, input.executionToken, JSON.stringify(input.output), JSON.stringify(input.sourceIds),
          JSON.stringify(input.knowledgeSegmentIds), input.finishedAt],
      );
      const runId = changed.rows[0]?.run_id;
      if (!runId) {
        await this.db.query("ROLLBACK");
        return false;
      }
      const usage = marketingAgentUsage(input.output);
      await this.db.query(
        `INSERT INTO marketing_agent_usage_records (
           id, run_id, step_id, campaign_id, stage, provider_name, data_classification,
           input_tokens, output_tokens, media_seconds, estimated_cost, usage_json, recorded_at
         )
         SELECT gen_random_uuid(), $2, step.id, run.campaign_id, $3, COALESCE(step.provider_name, 'unknown'),
                run.data_classification, $4, $5, $6, $7, $8::jsonb, $9
         FROM marketing_agent_steps AS step
         JOIN marketing_agent_runs AS run ON run.id = step.run_id
         WHERE step.id = $1
         ON CONFLICT (step_id) DO NOTHING`,
        [input.stepId, runId, input.stage, usage.inputTokens, usage.outputTokens, usage.mediaSeconds,
          usage.estimatedCost, JSON.stringify(usage.raw), input.finishedAt],
      );
      if (nextStage) {
        await this.db.query(
          `UPDATE marketing_agent_runs
           SET status = 'running', current_stage = $2, updated_at = $3,
               knowledge_segment_ids_json = (
                 SELECT COALESCE(jsonb_agg(DISTINCT value), '[]'::jsonb)
                 FROM jsonb_array_elements_text(knowledge_segment_ids_json || $4::jsonb)
               )
           WHERE id = $1`,
          [runId, nextStage, input.finishedAt, JSON.stringify(input.knowledgeSegmentIds)],
        );
      } else {
        await this.db.query(
          `UPDATE marketing_agent_runs
           SET status = 'succeeded', output_json = $2::jsonb, failure_code = NULL, updated_at = $3
           WHERE id = $1`,
          [runId, JSON.stringify(input.output), input.finishedAt],
        );
      }
      await this.db.query("COMMIT");
      return true;
    } catch (error) {
      await this.db.query("ROLLBACK");
      throw error;
    }
  }

  async requireManualReview(input: {
    stepId: string;
    executionToken: string;
    errorCode: string;
    detail: MarketingAgentJson;
    finishedAt: Date;
  }) {
    return await this.finishWithStatus({ ...input, status: "manual_review_required" });
  }

  async failStep(input: { stepId: string; executionToken: string; errorCode: string; finishedAt: Date }) {
    return await this.finishWithStatus({ ...input, status: "failed", detail: {} });
  }

  private async ensureSteps() {
    await this.db.query(
      `INSERT INTO marketing_agent_steps (id, run_id, stage, input_summary)
       SELECT gen_random_uuid(), run.id, stage.name, 'Pending agent execution'
       FROM marketing_agent_runs AS run
       CROSS JOIN (VALUES ('research'), ('strategy'), ('copy'), ('media'), ('compliance')) AS stage(name)
       WHERE run.status IN ('queued', 'running')
       ON CONFLICT (run_id, stage) DO NOTHING`,
    );
  }

  private async ensureStepsIfDue(now: Date) {
    if (this.ensureStepsPending) {
      await this.ensureStepsPending;
      return;
    }
    if (now.getTime() < this.nextEnsureStepsAtMs) return;
    this.nextEnsureStepsAtMs = now.getTime() + 60_000;
    const pending = this.ensureSteps().catch((error) => {
      this.nextEnsureStepsAtMs = 0;
      throw error;
    }).finally(() => {
      if (this.ensureStepsPending === pending) this.ensureStepsPending = null;
    });
    this.ensureStepsPending = pending;
    await pending;
  }

  private async finishWithStatus(input: {
    stepId: string;
    executionToken: string;
    errorCode: string;
    detail: MarketingAgentJson;
    finishedAt: Date;
    status: "failed" | "manual_review_required";
  }) {
    await this.db.query("BEGIN");
    try {
      const changed = await this.db.query<{ run_id: string }>(
        `UPDATE marketing_agent_steps
         SET status = $3, output_json = $4::jsonb, error_code = $5, finished_at = $6
         WHERE id = $1 AND status = 'running' AND output_json->>'executionToken' = $2
         RETURNING run_id`,
        [input.stepId, input.executionToken, input.status, JSON.stringify(input.detail), input.errorCode, input.finishedAt],
      );
      const runId = changed.rows[0]?.run_id;
      if (!runId) {
        await this.db.query("ROLLBACK");
        return false;
      }
      await this.db.query(
        "UPDATE marketing_agent_runs SET status = $2, failure_code = $3, updated_at = $4 WHERE id = $1",
        [runId, input.status, input.errorCode, input.finishedAt],
      );
      await this.db.query("COMMIT");
      return true;
    } catch (error) {
      await this.db.query("ROLLBACK");
      throw error;
    }
  }
}

function marketingAgentUsage(output: MarketingAgentJson) {
  const record = output && typeof output === "object" && !Array.isArray(output)
    ? (output as Record<string, unknown>)
    : {};
  const usage = record.usage && typeof record.usage === "object" && !Array.isArray(record.usage)
    ? record.usage as Record<string, unknown>
    : {};
  return {
    inputTokens: nonNegativeInteger(usage.inputTokens),
    outputTokens: nonNegativeInteger(usage.outputTokens),
    mediaSeconds: nonNegativeNumber(usage.mediaSeconds),
    estimatedCost: nonNegativeNumber(usage.estimatedCost),
    raw: usage,
  };
}

function nonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function nonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function jsonValue(value: MarketingAgentJson | string) {
  return typeof value === "string" ? JSON.parse(value) as MarketingAgentJson : value;
}

function stringArray(value: string[] | string) {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
}
