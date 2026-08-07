import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type { CanvasAgentShardConfig } from "./canvas-agent-shard.config.ts";

interface ShardLoadRow {
  shard_id: number | string;
  active_task_count: number | string;
}

export async function assignCanvasAgentConversationShard(
  db: SqlDatabase,
  input: {
    conversationId: string;
    config: CanvasAgentShardConfig;
    now: Date;
  },
) {
  const existing = await queryOne<{ shard_id: number | string | null }>(
    db,
    "SELECT shard_id FROM canvas_agent_conversations WHERE id=$1 FOR UPDATE",
    [input.conversationId],
  );
  if (!existing) throw new Error("canvas_agent_conversation_not_found");
  if (existing.shard_id !== null) return Number(existing.shard_id);

  await db.query("SELECT pg_advisory_xact_lock(hashtext('canvas_agent_shard_assignment_v1'))");
  const shardIdsSql = input.config.enabled
    ? `
        SELECT 0::integer AS shard_id
        UNION
        SELECT shard_id
        FROM canvas_agent_conversations
        WHERE shard_id IS NOT NULL
      `
    : "SELECT 0::integer AS shard_id";
  const loads = await db.query<ShardLoadRow>(
    `
      WITH shard_ids AS (${shardIdsSql})
      SELECT shard.shard_id,
             COUNT(task.id) FILTER (WHERE task.status IN ('queued','running')) AS active_task_count
      FROM shard_ids shard
      LEFT JOIN canvas_agent_conversations conversation ON conversation.shard_id = shard.shard_id
      LEFT JOIN canvas_agent_tasks task ON task.conversation_id = conversation.id
      GROUP BY shard.shard_id
      ORDER BY active_task_count ASC, shard.shard_id ASC
    `,
  );
  const normalized = loads.rows.map((row) => ({
    shardId: Number(row.shard_id),
    activeTaskCount: Number(row.active_task_count),
  }));
  const shardId = selectCanvasAgentShardId(normalized, input.config);
  const assigned = await queryOne<{ shard_id: number | string }>(
    db,
    `
      UPDATE canvas_agent_conversations
      SET shard_id=$2, updated_at=$3
      WHERE id=$1 AND shard_id IS NULL
      RETURNING shard_id
    `,
    [input.conversationId, shardId, input.now],
  );
  return Number(assigned?.shard_id ?? shardId);
}

export function selectCanvasAgentShardId(
  loads: Array<{ shardId: number; activeTaskCount: number }>,
  config: Pick<CanvasAgentShardConfig, "shardCapacity" | "maxActiveShards">,
) {
  const ordered = [...loads].sort((left, right) =>
    left.activeTaskCount - right.activeTaskCount || left.shardId - right.shardId
  );
  const available = ordered.find((row) => row.activeTaskCount < config.shardCapacity);
  if (available) return available.shardId;
  const highestShardId = ordered.reduce((maximum, row) => Math.max(maximum, row.shardId), -1);
  return highestShardId + 1 < config.maxActiveShards
    ? highestShardId + 1
    : ordered[0]?.shardId ?? 0;
}

export async function listCanvasAgentShardIds(db: SqlDatabase) {
  const result = await db.query<{ shard_id: number | string }>(
    `
      SELECT shard_id
      FROM (
        SELECT 0::integer AS shard_id
        UNION
        SELECT DISTINCT conversation.shard_id
        FROM canvas_agent_conversations conversation
        JOIN canvas_agent_tasks task ON task.conversation_id = conversation.id
        WHERE conversation.shard_id IS NOT NULL
          AND task.status IN ('queued','running','cancel_requested')
      ) shards
      ORDER BY shard_id ASC
    `,
  );
  return result.rows.map((row) => Number(row.shard_id));
}
