import { createHash } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export const generationQueueShardCapacity = 600;
export const generationQueueShardRateLimitMax = 5;
export const generationQueueShardRateLimitDurationMs = 1_000;

export type GenerationQueueMediaType = "image" | "video" | "audio";
export type GenerationQueueStage = "submit" | "poll" | "fetch" | "persist";
export type GenerationQueueShardState = "accepting" | "full" | "draining" | "retired";

export interface GenerationQueueStageAssignment {
  assignmentKey: string;
  taskId: string;
  mediaType: GenerationQueueMediaType;
  stage: GenerationQueueStage;
  routeKey: string;
  routeCode: string;
  shardId: string;
  shardNo: number;
  queueName: string;
  capacity: number;
  rateLimitMax: number;
  rateLimitDurationMs: number;
  admittedCount: number;
  shardState: GenerationQueueShardState;
  assignmentStatus: "admitted" | "released";
}

export interface GenerationQueueStageRelease {
  assignmentKey: string;
  shardId: string;
  admittedCount: number;
  shardState: GenerationQueueShardState;
  released: boolean;
}

export async function listGenerationQueueShards(db: SqlDatabase) {
  const result = await db.query<{
    queue_name: string;
    media_type: GenerationQueueMediaType;
    stage: GenerationQueueStage;
    route_code: string;
    shard_no: number;
    state: GenerationQueueShardState;
  }>(`
    SELECT queue_name, media_type, stage, route_code, shard_no, state
    FROM generation_queue_shards
    WHERE state <> 'retired'
    ORDER BY queue_name ASC
  `);
  return result.rows.map((row) => ({
    queueName: row.queue_name,
    mediaType: row.media_type,
    stage: row.stage,
    routeCode: row.route_code,
    shardNo: row.shard_no,
    state: row.state,
  }));
}

interface AssignmentRow {
  assignment_key: string;
  task_id: string;
  media_type: GenerationQueueMediaType;
  stage: GenerationQueueStage;
  route_key: string;
  route_code: string;
  shard_id: string;
  shard_no: number;
  queue_name: string;
  capacity: number;
  rate_limit_max: number;
  rate_limit_duration_ms: number;
  admitted_count: number;
  shard_state: GenerationQueueShardState;
  assignment_status: "admitted" | "released";
}

interface ReleaseRow {
  assignment_key: string;
  shard_id: string;
  admitted_count: number;
  shard_state: GenerationQueueShardState;
  released: boolean;
}

export async function assignGenerationQueueStage(
  db: SqlDatabase,
  input: {
    assignmentKey: string;
    taskId: string;
    mediaType: GenerationQueueMediaType;
    stage: GenerationQueueStage;
    routeKey: string;
    now: Date;
    maxActiveShardsPerStage?: number;
    reopenThreshold?: number;
  },
): Promise<GenerationQueueStageAssignment> {
  const assignmentKey = requiredTrimmed(input.assignmentKey, "generation_queue_assignment_key_required");
  const routeKey = requiredTrimmed(input.routeKey, "generation_queue_route_key_required");
  const routeCode = createGenerationQueueRouteCode(routeKey);
  const row = await queryOne<AssignmentRow>(
    db,
    `
      SELECT *
      FROM assign_generation_queue_stage_with_limits($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      assignmentKey,
      input.taskId,
      input.mediaType,
      input.stage,
      routeKey,
      routeCode,
      input.now,
      normalizeLimit(input.maxActiveShardsPerStage, 256),
      normalizeThreshold(input.reopenThreshold, 300),
    ],
  );

  if (!row) {
    throw new Error("generation_queue_stage_assignment_failed");
  }
  return mapAssignment(row);
}

export async function releaseGenerationQueueStage(
  db: SqlDatabase,
  input: {
    assignmentKey: string;
    reason: string;
    now: Date;
    reopenThreshold?: number;
  },
): Promise<GenerationQueueStageRelease | null> {
  const assignmentKey = requiredTrimmed(input.assignmentKey, "generation_queue_assignment_key_required");
  const reason = requiredTrimmed(input.reason, "generation_queue_release_reason_required");
  const row = await queryOne<ReleaseRow>(
    db,
    `
      SELECT *
      FROM release_generation_queue_stage_with_threshold($1, $2, $3, $4)
    `,
    [assignmentKey, reason, input.now, normalizeThreshold(input.reopenThreshold, 300)],
  );

  return row ? {
    assignmentKey: row.assignment_key,
    shardId: row.shard_id,
    admittedCount: row.admitted_count,
    shardState: row.shard_state,
    released: row.released,
  } : null;
}

export async function retireIdleGenerationQueueShards(
  db: SqlDatabase,
  idleBefore: Date,
) {
  const row = await queryOne<{ retired_count: number }>(
    db,
    `SELECT retire_idle_generation_queue_shards($1)::int AS retired_count`,
    [idleBefore],
  );
  return row?.retired_count ?? 0;
}

export async function drainGenerationQueueShard(
  db: SqlDatabase,
  input: { shardId: string; now: Date },
) {
  const row = await queryOne<{ drain_generation_queue_shard: boolean }>(
    db,
    `SELECT drain_generation_queue_shard($1::uuid, $2)`,
    [input.shardId, input.now],
  );
  return row?.drain_generation_queue_shard === true;
}

function normalizeLimit(value: number | undefined, fallback: number) {
  return Number.isSafeInteger(value) && (value as number) > 0 ? Math.min(value as number, 10_000) : fallback;
}

function normalizeThreshold(value: number | undefined, fallback: number) {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? Math.min(value as number, generationQueueShardCapacity - 1) : fallback;
}

export function createGenerationQueueRouteCode(routeKey: string) {
  const normalizedRouteKey = requiredTrimmed(routeKey, "generation_queue_route_key_required");
  return `r${createHash("sha256").update(normalizedRouteKey).digest("hex").slice(0, 24)}`;
}

export function buildGenerationQueueName(input: {
  mediaType: GenerationQueueMediaType;
  stage: GenerationQueueStage;
  routeCode: string;
  shardNo: number;
}) {
  if (!/^[a-z0-9]+$/.test(input.routeCode)) {
    throw new Error("generation_queue_route_code_invalid");
  }
  if (!Number.isSafeInteger(input.shardNo) || input.shardNo < 0) {
    throw new Error("generation_queue_shard_no_invalid");
  }
  return `generation-${input.mediaType}-${input.stage}-${input.routeCode}-${String(input.shardNo).padStart(3, "0")}`;
}

function mapAssignment(row: AssignmentRow): GenerationQueueStageAssignment {
  return {
    assignmentKey: row.assignment_key,
    taskId: row.task_id,
    mediaType: row.media_type,
    stage: row.stage,
    routeKey: row.route_key,
    routeCode: row.route_code,
    shardId: row.shard_id,
    shardNo: row.shard_no,
    queueName: row.queue_name,
    capacity: row.capacity,
    rateLimitMax: row.rate_limit_max,
    rateLimitDurationMs: row.rate_limit_duration_ms,
    admittedCount: row.admitted_count,
    shardState: row.shard_state,
    assignmentStatus: row.assignment_status,
  };
}

function requiredTrimmed(value: string, errorCode: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(errorCode);
  }
  return normalized;
}
