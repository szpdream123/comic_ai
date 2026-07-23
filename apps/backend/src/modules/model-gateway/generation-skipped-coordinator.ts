import { queryOne } from "../shared/db/sql.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";

export type GenerationSkippedNextAction = "submit" | "poll" | "finalize" | "stop";

type GenerationSkippedFacts = {
  task_status: string;
  provider_request_id: string | null;
  provider_status: string | null;
  external_request_id: string | null;
  external_submission_started_at: Date | string | null;
  has_artifact: boolean;
};

/**
 * Decide the successor for a skipped queue attempt from durable state.
 * A provider request ID is required before polling. The external-start marker
 * still prevents resubmission, but it cannot identify a supplier task by itself.
 */
export async function resolveGenerationSkippedNextAction(
  db: SqlDatabase,
  input: { taskId: string },
): Promise<GenerationSkippedNextAction> {
  const facts = await queryOne<GenerationSkippedFacts>(
    db,
    `
      SELECT
        t.status AS task_status,
        pr.id AS provider_request_id,
        pr.status AS provider_status,
        pr.external_request_id,
        pr.external_submission_started_at,
        (
          pr.response_redacted_json ? 'artifact'
          OR pr.response_redacted_json ? 'videoUrl'
          OR pr.response_redacted_json ? 'audioUrl'
        ) AS has_artifact
      FROM tasks t
      LEFT JOIN LATERAL (
        SELECT request.*
        FROM provider_requests request
        WHERE request.task_id = t.id
        ORDER BY request.updated_at DESC, request.created_at DESC
        LIMIT 1
      ) pr ON true
      WHERE t.id = $1
      LIMIT 1
    `,
    [input.taskId],
  );

  if (!facts) return "stop";
  if (["succeeded", "failed", "canceled", "manual_review_required"].includes(facts.task_status)) {
    return "stop";
  }
  if (facts.has_artifact || facts.provider_status === "succeeded") {
    return "finalize";
  }
  if (facts.external_request_id) {
    return "poll";
  }
  if (facts.external_submission_started_at) return "stop";
  if (facts.task_status === "queued") return "submit";
  // A failed or ambiguous provider request is an explicit outcome. Do not
  // turn it into a blind retry; only a never-started request may be submitted.
  if (facts.provider_request_id && facts.provider_status === "created") {
    return "submit";
  }
  return "stop";
}
