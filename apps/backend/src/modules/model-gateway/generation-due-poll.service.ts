import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import { appendGenerationTaskPollRequestedOutboxEvent } from "./generation-outbox.service.ts";
import { readGenerationProviderRouteReferences } from "./generation-model-config-snapshot.ts";

type GenerationMediaType = "image" | "video" | "audio";

interface DuePollRow {
  provider_request_id: string;
  task_id: string;
  workflow_id: string;
  user_id: string;
  task_type: string;
  input_snapshot_json: Record<string, unknown> | string;
  poll_sequence: number | string;
  poll_deadline_at: Date | string | null;
}

export async function scheduleGenerationProviderPoll(
  db: SqlDatabase,
  input: {
    taskId: string;
    nextPollAttempt: number;
    nextPollAt: Date;
    pollDeadlineAt: Date;
    now: Date;
  },
) {
  return queryOne<{ id: string; poll_sequence: number | string; next_poll_at: Date | string }>(
    db,
    `
      UPDATE provider_requests
      SET poll_sequence = GREATEST(poll_sequence, $2 - 1),
          next_poll_at = $3,
          poll_deadline_at = COALESCE(poll_deadline_at, $4),
          updated_at = GREATEST(updated_at, $5)
      WHERE id = (
        SELECT id
        FROM provider_requests
        WHERE task_id = $1
          AND external_submission_started_at IS NOT NULL
          AND status IN ('submitted', 'accepted', 'running', 'result_unknown')
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
      )
      RETURNING id, poll_sequence, next_poll_at
    `,
    [
      input.taskId,
      Math.max(1, Math.floor(input.nextPollAttempt)),
      input.nextPollAt,
      input.pollDeadlineAt,
      input.now,
    ],
  );
}

export async function clearGenerationProviderPoll(
  db: SqlDatabase,
  input: { providerRequestId: string; now: Date },
) {
  await db.query(
    `
      UPDATE provider_requests
      SET next_poll_at = NULL,
          updated_at = GREATEST(updated_at, $2)
      WHERE id = $1
    `,
    [input.providerRequestId, input.now],
  );
}

export async function enqueueDueGenerationPolls(
  db: SqlDatabase,
  input: {
    now: Date;
    limit: number;
    maxAttempts: Record<GenerationMediaType, number>;
  },
): Promise<{ enqueuedTaskIds: string[] }> {
  await db.query("BEGIN");
  try {
    const due = await db.query<DuePollRow>(
      `
        SELECT
          request.id AS provider_request_id,
          task.id AS task_id,
          task.workflow_id,
          COALESCE(workflow.created_by_user_id, project.owner_user_id) AS user_id,
          task.task_type,
          task.input_snapshot_json,
          request.poll_sequence,
          request.poll_deadline_at
        FROM provider_requests request
        JOIN tasks task ON task.id = request.task_id
        JOIN workflows workflow ON workflow.id = task.workflow_id
        LEFT JOIN projects project ON project.id = task.project_id
        WHERE request.next_poll_at IS NOT NULL
          AND request.next_poll_at <= $1
          AND request.status IN ('submitted', 'accepted', 'running', 'result_unknown')
          AND task.status IN ('running', 'result_unknown')
        ORDER BY request.next_poll_at, request.id
        LIMIT $2
        FOR UPDATE OF request SKIP LOCKED
      `,
      [input.now, Math.max(1, Math.floor(input.limit))],
    );
    const enqueuedTaskIds: string[] = [];
    for (const row of due.rows) {
      const mediaType = mediaTypeFromTaskType(row.task_type);
      const sequence = Number(row.poll_sequence ?? 0) + 1;
      const deadlineExceeded = row.poll_deadline_at
        ? new Date(row.poll_deadline_at).getTime() <= input.now.getTime()
        : false;
      const pollAttempt = deadlineExceeded
        ? input.maxAttempts[mediaType]
        : Math.min(sequence, input.maxAttempts[mediaType]);
      await db.query(
        `
          UPDATE provider_requests
          SET poll_sequence = $2,
              next_poll_at = NULL,
              updated_at = GREATEST(updated_at, $3)
          WHERE id = $1
        `,
        [row.provider_request_id, sequence, input.now],
      );
      const snapshot = parseRecord(row.input_snapshot_json);
      const routeReferences = readGenerationProviderRouteReferences(snapshot);
      await appendGenerationTaskPollRequestedOutboxEvent(db, {
        userId: row.user_id,
        workflowId: row.workflow_id,
        taskId: row.task_id,
        kind: mediaType,
        modelCode: readString(snapshot.model) || null,
        providerExecutor: readString(snapshot.providerExecutor) || defaultProviderExecutor(mediaType),
        ...routeReferences,
        pollAttempt,
        availableAt: input.now,
      });
      await db.query(
        "UPDATE tasks SET last_dispatched_at = $2, updated_at = GREATEST(updated_at, $2) WHERE id = $1",
        [row.task_id, input.now],
      );
      enqueuedTaskIds.push(row.task_id);
    }
    await db.query("COMMIT");
    return { enqueuedTaskIds };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

function mediaTypeFromTaskType(taskType: string): GenerationMediaType {
  if (taskType === "episode_generate_image") return "image";
  if (taskType === "episode_generate_video") return "video";
  if (taskType === "episode_generate_audio") return "audio";
  throw new Error(`generation_due_poll_unsupported_task_type:${taskType}`);
}

function defaultProviderExecutor(mediaType: GenerationMediaType) {
  return mediaType === "image"
    ? "gpt-image-2"
    : mediaType === "video" ? "seedance" : "aliyun-bailian-audio";
}

function parseRecord(value: Record<string, unknown> | string) {
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
