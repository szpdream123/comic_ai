import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type { GenerationBullMQPublisher } from "./generation-bullmq.publisher.ts";
import type { GenerationQueueConfig } from "./generation-queue.config.ts";
import { appendGenerationTaskCreatedOutboxEvent } from "./generation-outbox.service.ts";

interface GenerationRepairTaskRow {
  task_id: string;
  organization_id: string;
  workflow_id: string;
  queue_name: string;
  input_snapshot_json: Record<string, unknown> | string;
  target_entity_type: string;
  target_entity_id: string;
}

interface RunningSeedancePollRepairRow {
  task_id: string;
  workflow_id: string;
  input_snapshot_json: Record<string, unknown> | string;
}

const defaultStaleDispatchMs = 2 * 60 * 1000;

export async function repairQueuedGenerationTaskOutbox(
  db: SqlDatabase,
  input: {
    now: Date;
    limit: number;
    staleDispatchMs?: number;
  },
): Promise<{ repairedTaskIds: string[] }> {
  const staleCutoff = new Date(
    input.now.getTime() - (input.staleDispatchMs ?? defaultStaleDispatchMs),
  );
  const candidates = await db.query<GenerationRepairTaskRow>(
    `
      SELECT
        t.id AS task_id,
        t.organization_id,
        t.workflow_id,
        t.queue_name,
        t.input_snapshot_json,
        t.target_entity_type,
        t.target_entity_id
      FROM tasks t
      WHERE t.status = 'queued'
        AND t.task_type = 'episode_generate_video'
        AND t.scheduled_at <= $1
        AND t.input_snapshot_json->>'providerExecutor' = 'seedance'
        AND (
          t.last_dispatched_at IS NULL
          OR t.last_dispatched_at < $2
        )
        AND NOT EXISTS (
          SELECT 1
          FROM outbox_events oe
          WHERE oe.organization_id = t.organization_id
            AND oe.event_type = 'generation.task.created'
            AND oe.payload_json->>'taskId' = t.id::text
            AND oe.status IN ('pending', 'processing', 'failed')
          LIMIT 1
        )
      ORDER BY t.scheduled_at ASC, t.id ASC
      LIMIT $3
    `,
    [input.now, staleCutoff, input.limit],
  );

  const repairedTaskIds: string[] = [];
  for (const candidate of candidates.rows) {
    const claimed = await markGenerationTaskRedisRepairClaimed(db, {
      taskId: candidate.task_id,
      now: input.now,
      staleCutoff,
    });
    if (!claimed) {
      continue;
    }

    const snapshot = parseSnapshot(candidate.input_snapshot_json);
    await appendGenerationTaskCreatedOutboxEvent(db, {
      organizationId: candidate.organization_id,
      workflowId: candidate.workflow_id,
      taskId: candidate.task_id,
      kind: "video",
      modelCode: readString(snapshot.model) || "seedance-i2v-pro",
      queueName: candidate.queue_name,
      targetType: readString(snapshot.targetType) || candidate.target_entity_type,
      targetId: readString(snapshot.targetId) || candidate.target_entity_id,
      providerExecutor: "seedance",
      availableAt: input.now,
    });
    repairedTaskIds.push(candidate.task_id);
  }

  return { repairedTaskIds };
}

export async function repairRunningSeedancePollJobs(
  db: SqlDatabase,
  input: {
    now: Date;
    limit: number;
    staleDispatchMs?: number;
    config: GenerationQueueConfig;
    publisher: GenerationBullMQPublisher;
  },
): Promise<{ repairedTaskIds: string[] }> {
  const staleCutoff = new Date(
    input.now.getTime() - (input.staleDispatchMs ?? defaultStaleDispatchMs),
  );
  const candidates = await db.query<RunningSeedancePollRepairRow>(
    `
      SELECT
        t.id AS task_id,
        t.workflow_id,
        t.input_snapshot_json
      FROM tasks t
      WHERE t.status = 'running'
        AND t.task_type = 'episode_generate_video'
        AND t.input_snapshot_json->>'providerExecutor' = 'seedance'
        AND EXISTS (
          SELECT 1
          FROM provider_requests pr
          WHERE pr.organization_id = t.organization_id
            AND pr.task_id = t.id
            AND (t.current_attempt_id IS NULL OR pr.attempt_id = t.current_attempt_id)
            AND pr.external_submission_started_at IS NOT NULL
            AND pr.external_request_id IS NOT NULL
            AND pr.status IN ('submitted', 'accepted', 'running')
          LIMIT 1
        )
        AND (
          t.last_dispatched_at IS NULL
          OR t.last_dispatched_at < $2
        )
      ORDER BY t.updated_at ASC, t.id ASC
      LIMIT $1
    `,
    [input.limit, staleCutoff],
  );

  const repairedTaskIds: string[] = [];
  for (const candidate of candidates.rows) {
    const claimed = await markRunningPollRepairClaimed(db, {
      taskId: candidate.task_id,
      now: input.now,
      staleCutoff,
    });
    if (!claimed) {
      continue;
    }

    const snapshot = parseSnapshot(candidate.input_snapshot_json);
    await input.publisher.add(
      input.config.queues.pollVideo,
      "generation.video.poll.repair",
      {
        taskId: candidate.task_id,
        workflowId: candidate.workflow_id,
        mediaType: "video",
        modelCode: readString(snapshot.model) || "seedance-i2v-pro",
        providerExecutor: "seedance",
        pollAttempt: 1,
      },
      {
        jobId: `generation.video.poll.repair:${candidate.task_id}:${input.now.getTime()}`,
        delay: 0,
        attempts: 1,
        removeOnComplete: {
          age: 86400,
          count: 10000,
        },
        removeOnFail: {
          age: 604800,
          count: 50000,
        },
      },
    );
    repairedTaskIds.push(candidate.task_id);
  }

  return { repairedTaskIds };
}

async function markGenerationTaskRedisRepairClaimed(
  db: SqlDatabase,
  input: {
    taskId: string;
    now: Date;
    staleCutoff: Date;
  },
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    db,
    `
      UPDATE tasks
      SET last_dispatched_at = $2,
          updated_at = $2
      WHERE id = $1
        AND status = 'queued'
        AND task_type = 'episode_generate_video'
        AND input_snapshot_json->>'providerExecutor' = 'seedance'
        AND (
          last_dispatched_at IS NULL
          OR last_dispatched_at < $3
        )
      RETURNING id
    `,
    [input.taskId, input.now, input.staleCutoff],
  );

  return Boolean(row);
}

async function markRunningPollRepairClaimed(
  db: SqlDatabase,
  input: {
    taskId: string;
    now: Date;
    staleCutoff: Date;
  },
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    db,
    `
      UPDATE tasks
      SET last_dispatched_at = $2,
          updated_at = $2
      WHERE id = $1
        AND status = 'running'
        AND task_type = 'episode_generate_video'
        AND input_snapshot_json->>'providerExecutor' = 'seedance'
        AND (
          last_dispatched_at IS NULL
          OR last_dispatched_at < $3
        )
      RETURNING id
    `,
    [input.taskId, input.now, input.staleCutoff],
  );

  return Boolean(row);
}

function parseSnapshot(value: Record<string, unknown> | string) {
  return typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : value;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
