import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export type AssetConversationMediaMode = "image" | "video";
export type AssetConversationMessageType = "user_request" | "task_status" | "result";
export type AssetConversationStatus = "queued" | "running" | "completed" | "failed" | "canceled";

const conversationTurnDeletedPayloadKey = "__conversationTurnDeleted";
const conversationTurnDeletedMessageKeyPrefix = "__deleted_turn__:";

export interface AssetConversationThread {
  threadId: string;
  projectId: string;
  episodeId: string;
  assetId: string;
  mediaMode: AssetConversationMediaMode;
  latestMessageAt: Date;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssetConversationMessage {
  messageId: string;
  threadId: string;
  turnId: string;
  messageKey: string;
  messageType: AssetConversationMessageType;
  status: AssetConversationStatus;
  taskId: string | null;
  payload: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AssetConversationThreadRow {
  id: string;
  project_id: string;
  episode_id: string;
  asset_id: string;
  media_mode: AssetConversationMediaMode;
  latest_message_at: Date | string;
  created_by_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface AssetConversationMessageRow {
  id: string;
  thread_id: string;
  turn_id: string;
  message_key: string;
  message_type: AssetConversationMessageType;
  status: AssetConversationStatus;
  task_id: string | null;
  payload_json: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface AssetConversationEntrySummaryRow {
  turn_key: string;
  order_created_at: Date | string;
  asset_id: string | null;
  media_kind: string | null;
  prompt_preview: string | null;
  quick_reference_items: unknown;
  attachment_items: unknown;
  mention_references: unknown;
  generated_audio_items: unknown;
  fixed_images: unknown;
  fixed_videos: unknown;
  selection_context: Record<string, unknown> | null;
  task_id: string | null;
  status: string | null;
  created_at: string | null;
  returned_at: string | null;
  selected_model_id: string | null;
  model_label: string | null;
  style_label: string | null;
  skill_id: string | null;
  aspect_ratio: string | null;
  resolution: string | null;
  credit_cost: number | string | null;
  failure_code: string | null;
  failure: Record<string, unknown> | null;
  notice_type: string | null;
}

const conversationSummaryItemKeys = [
  "id",
  "assetId",
  "assetVersionId",
  "storageObjectId",
  "resourceId",
  "kind",
  "type",
  "mediaType",
  "mimeType",
  "name",
  "label",
  "title",
  "fileName",
  "filename",
  "url",
  "previewUrl",
  "src",
  "coverUrl",
  "thumbnailUrl",
  "audioUrl",
  "publicUrl",
  "preview",
  "sourceUrl",
  "summary",
  "voiceName",
  "token",
  "referenceId",
  "composerOrder",
  "duration",
  "originalName",
  "isGenerationStyleReference",
] as const;

function compactConversationItemArraySql(sourceSql: string) {
  const allowedKeys = conversationSummaryItemKeys.map((key) => `'${key}'`).join(", ");
  return `
    COALESCE((
      SELECT jsonb_agg(
        CASE
          WHEN jsonb_typeof(item.value) = 'object' THEN COALESCE((
            SELECT jsonb_object_agg(field.key, field.value)
            FROM jsonb_each(item.value) AS field(key, value)
            WHERE field.key IN (${allowedKeys})
              AND field.value <> 'null'::jsonb
              AND field.value <> '""'::jsonb
          ), '{}'::jsonb)
          ELSE item.value
        END
        ORDER BY item.ordinality
      )
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(${sourceSql}) = 'array' THEN ${sourceSql}
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY AS item(value, ordinality)
    ), '[]'::jsonb)
  `;
}

function compactConversationObjectSql(sourceSql: string, allowedKeys: readonly string[]) {
  const allowedKeySql = allowedKeys.map((key) => `'${key}'`).join(", ");
  return `
    NULLIF(COALESCE((
      SELECT jsonb_object_agg(field.key, field.value)
      FROM jsonb_each(
        CASE
          WHEN jsonb_typeof(${sourceSql}) = 'object' THEN ${sourceSql}
          ELSE '{}'::jsonb
        END
      ) AS field(key, value)
      WHERE field.key IN (${allowedKeySql})
        AND field.value <> 'null'::jsonb
        AND field.value <> '""'::jsonb
    ), '{}'::jsonb), '{}'::jsonb)
  `;
}

export async function upsertAssetConversationThread(
  db: SqlDatabase,
  input: {
    projectId: string;
    episodeId: string;
    assetId: string;
    mediaMode: AssetConversationMediaMode;
    createdByUserId?: string | null;
    latestMessageAt?: Date;
    now: Date;
  },
): Promise<AssetConversationThread> {
  const row = await queryOne<AssetConversationThreadRow>(
    db,
    `
      INSERT INTO episode_asset_conversation_threads (
        id,
        project_id,
        episode_id,
        asset_id,
        media_mode,
        latest_message_at,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
      ON CONFLICT (project_id, episode_id, asset_id, media_mode)
      DO UPDATE SET
        latest_message_at = EXCLUDED.latest_message_at,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `,
    [
      randomUUID(),
      input.projectId,
      input.episodeId,
      input.assetId,
      input.mediaMode,
      input.latestMessageAt ?? input.now,
      input.createdByUserId ?? null,
      input.now,
    ],
  );

  return assetConversationThreadFromRow(row!);
}

export async function findAssetConversationThread(
  db: SqlDatabase,
  input: {
    projectId: string;
    episodeId: string;
    assetId: string;
    mediaMode: AssetConversationMediaMode;
  },
): Promise<AssetConversationThread | null> {
  const row = await queryOne<AssetConversationThreadRow>(
    db,
    `
      SELECT *
      FROM episode_asset_conversation_threads
      WHERE project_id = $1
        AND episode_id = $2
        AND asset_id = $3
        AND media_mode = $4
    `,
    [input.projectId, input.episodeId, input.assetId, input.mediaMode],
  );

  return row ? assetConversationThreadFromRow(row) : null;
}

export async function upsertAssetConversationMessages(
  db: SqlDatabase,
  input: {
    threadId: string;
    createdByUserId?: string | null;
    now: Date;
    messages: Array<{
      turnId: string;
      messageKey: string;
      messageType: AssetConversationMessageType;
      status?: AssetConversationStatus | null;
      taskId?: string | null;
      payload?: Record<string, unknown> | null;
    }>;
  },
): Promise<AssetConversationMessage[]> {
  if (!input.messages.length) {
    return [];
  }
  const serializedMessages = input.messages.map((item, index) => ({
    inputOrder: index,
    id: randomUUID(),
    turnId: item.turnId,
    messageKey: item.messageKey,
    messageType: item.messageType,
    status: item.status ?? "running",
    taskId: item.taskId ?? null,
    payload: item.payload ?? {},
  }));
  const result = await db.query<AssetConversationMessageRow>(
    `
      WITH locked_thread AS MATERIALIZED (
        SELECT id
        FROM episode_asset_conversation_threads
        WHERE id = $1
        FOR UPDATE
      ),
      incoming AS (
        SELECT
          (item->>'inputOrder')::int AS input_order,
          (item->>'id')::uuid AS id,
          item->>'turnId' AS turn_id,
          item->>'messageKey' AS message_key,
          item->>'messageType' AS message_type,
          item->>'status' AS status,
          NULLIF(item->>'taskId', '') AS task_id,
          COALESCE(item->'payload', '{}'::jsonb) AS payload_json
        FROM jsonb_array_elements($4::jsonb) AS item
      ),
      upserted AS (
        INSERT INTO episode_asset_conversation_messages (
          id,
          thread_id,
          turn_id,
          message_key,
          message_type,
          status,
          task_id,
          payload_json,
          created_by_user_id,
          created_at,
          updated_at
        )
        SELECT
          incoming.id,
          $1,
          incoming.turn_id,
          incoming.message_key,
          incoming.message_type,
          incoming.status,
          incoming.task_id,
          incoming.payload_json,
          $2,
          $3,
          $3
        FROM incoming
        CROSS JOIN locked_thread
        WHERE NOT EXISTS (
          SELECT 1
          FROM episode_asset_conversation_messages deleted_turn
          WHERE deleted_turn.thread_id = $1
            AND LEFT(deleted_turn.message_key, length('${conversationTurnDeletedMessageKeyPrefix}')) = '${conversationTurnDeletedMessageKeyPrefix}'
            AND deleted_turn.payload_json->>'${conversationTurnDeletedPayloadKey}' = 'true'
            AND deleted_turn.turn_id IN (
              incoming.turn_id,
              incoming.task_id,
              NULLIF(incoming.payload_json->>'taskId', '')
            )
        )
        ORDER BY incoming.input_order
        ON CONFLICT (thread_id, message_key)
        DO UPDATE SET
          turn_id = EXCLUDED.turn_id,
          message_type = EXCLUDED.message_type,
          status = EXCLUDED.status,
          task_id = EXCLUDED.task_id,
          payload_json = EXCLUDED.payload_json,
          updated_at = EXCLUDED.updated_at
        RETURNING *
      )
      SELECT upserted.*
      FROM upserted
      JOIN incoming USING (message_key)
      ORDER BY incoming.input_order
    `,
    [
      input.threadId,
      input.createdByUserId ?? null,
      input.now,
      JSON.stringify(serializedMessages),
    ],
  );

  return result.rows.map(assetConversationMessageFromRow);
}

export async function markAssetConversationGenerationSucceeded(
  db: SqlDatabase,
  input: {
    taskId: string;
    result: Record<string, unknown>;
    now: Date;
  },
) {
  const assetVersionId = input.result.assetVersionId ?? null;
  const storageObjectId = input.result.storageObjectId ?? null;
  const url = input.result.url ?? input.result.previewUrl ?? input.result.sourceUrl ?? null;
  const fixedVideo = {
    id: assetVersionId ?? storageObjectId ?? input.taskId,
    label: "分镜视频",
    src: url,
    url,
    storageObjectId,
    assetVersionId,
  };
  const patch = {
    status: "completed",
    taskId: input.taskId,
    returnedAt: input.now.toISOString(),
    assetVersionId,
    storageObjectId,
    url,
    previewUrl: input.result.previewUrl ?? url,
    sourceUrl: input.result.sourceUrl ?? url,
    downloadUrl: input.result.downloadUrl ?? url,
    fixedVideos: [fixedVideo],
  };
  await db.query(
    `
      UPDATE episode_asset_conversation_messages
      SET status = 'completed',
          payload_json = (payload_json - 'failure' - 'failureCode' - 'noticeType') || $2::jsonb,
          updated_at = $3
      WHERE turn_id = $1
         OR task_id = $1
         OR payload_json->>'taskId' = $1
    `,
    [input.taskId, JSON.stringify(patch), input.now],
  );
}

export async function listAssetConversationMessages(
  db: SqlDatabase,
  input: {
    threadId: string;
  },
): Promise<AssetConversationMessage[]> {
  const result = await db.query<AssetConversationMessageRow>(
    `
      SELECT *
      FROM episode_asset_conversation_messages
      WHERE thread_id = $1
        AND NOT (
          LEFT(message_key, length('${conversationTurnDeletedMessageKeyPrefix}')) = '${conversationTurnDeletedMessageKeyPrefix}'
          AND payload_json->>'${conversationTurnDeletedPayloadKey}' = 'true'
        )
      ORDER BY created_at ASC, id ASC
    `,
    [input.threadId],
  );

  return result.rows.map(assetConversationMessageFromRow);
}

export async function listAssetConversationEntrySummaries(
  db: SqlDatabase,
  input: {
    thread: AssetConversationThread;
  },
): Promise<Record<string, unknown>[]> {
  const result = await db.query<AssetConversationEntrySummaryRow>(
    `
      WITH ordered_messages AS (
        SELECT
          *,
          COALESCE(NULLIF(turn_id, ''), NULLIF(task_id, ''), message_key) AS turn_key
        FROM episode_asset_conversation_messages
        WHERE thread_id = $1
          AND NOT (
            LEFT(message_key, length('${conversationTurnDeletedMessageKeyPrefix}')) = '${conversationTurnDeletedMessageKeyPrefix}'
            AND payload_json->>'${conversationTurnDeletedPayloadKey}' = 'true'
          )
      ),
      turn_order AS (
        SELECT
          turn_key,
          MIN(created_at) AS order_created_at
        FROM ordered_messages
        GROUP BY turn_key
      ),
      recent_turn_order AS (
        SELECT
          turn_key,
          order_created_at
        FROM turn_order
        ORDER BY order_created_at DESC, turn_key DESC
        LIMIT 10
      ),
      user_requests AS (
        SELECT DISTINCT ON (turn_key)
          turn_key,
          payload_json,
          status,
          task_id
        FROM ordered_messages
        WHERE message_type = 'user_request'
        ORDER BY turn_key, created_at DESC, id DESC
      ),
      task_statuses AS (
        SELECT DISTINCT ON (turn_key)
          turn_key,
          payload_json,
          status,
          task_id
        FROM ordered_messages
        WHERE message_type = 'task_status'
        ORDER BY turn_key, created_at DESC, id DESC
      ),
      results AS (
        SELECT DISTINCT ON (turn_key)
          turn_key,
          payload_json,
          status,
          task_id
        FROM ordered_messages
        WHERE message_type = 'result'
        ORDER BY turn_key, created_at DESC, id DESC
      )
      SELECT
        recent_turn_order.turn_key,
        recent_turn_order.order_created_at,
        COALESCE(results.payload_json->>'assetId', task_statuses.payload_json->>'assetId', user_requests.payload_json->>'assetId') AS asset_id,
        COALESCE(results.payload_json->>'mediaKind', task_statuses.payload_json->>'mediaKind', user_requests.payload_json->>'mediaKind') AS media_kind,
        COALESCE(NULLIF(user_requests.payload_json->>'promptPreview', ''), NULLIF(results.payload_json->>'promptPreview', ''), NULLIF(task_statuses.payload_json->>'promptPreview', '')) AS prompt_preview,
        ${compactConversationItemArraySql("COALESCE(user_requests.payload_json->'quickReferenceItems', results.payload_json->'quickReferenceItems', task_statuses.payload_json->'quickReferenceItems', '[]'::jsonb)")} AS quick_reference_items,
        ${compactConversationItemArraySql("COALESCE(user_requests.payload_json->'attachmentItems', results.payload_json->'attachmentItems', task_statuses.payload_json->'attachmentItems', '[]'::jsonb)")} AS attachment_items,
        ${compactConversationItemArraySql("COALESCE(user_requests.payload_json->'mentionReferences', results.payload_json->'mentionReferences', task_statuses.payload_json->'mentionReferences', '[]'::jsonb)")} AS mention_references,
        ${compactConversationItemArraySql("COALESCE(user_requests.payload_json->'generatedAudioItems', results.payload_json->'generatedAudioItems', task_statuses.payload_json->'generatedAudioItems', '[]'::jsonb)")} AS generated_audio_items,
        ${compactConversationItemArraySql("COALESCE(results.payload_json->'fixedImages', task_statuses.payload_json->'fixedImages', '[]'::jsonb)")} AS fixed_images,
        ${compactConversationItemArraySql("COALESCE(results.payload_json->'fixedVideos', task_statuses.payload_json->'fixedVideos', '[]'::jsonb)")} AS fixed_videos,
        ${compactConversationObjectSql(
          "COALESCE(results.payload_json->'selectionContext', user_requests.payload_json->'selectionContext', task_statuses.payload_json->'selectionContext')",
          ["assetTab", "selectedAssetId", "selectedAssetName", "selectedStoryboardId", "storyboardId"],
        )} AS selection_context,
        COALESCE(results.task_id, task_statuses.task_id, user_requests.task_id, results.payload_json->>'taskId', task_statuses.payload_json->>'taskId', user_requests.payload_json->>'taskId') AS task_id,
        COALESCE(results.status, task_statuses.status, user_requests.status, results.payload_json->>'status', task_statuses.payload_json->>'status', user_requests.payload_json->>'status') AS status,
        COALESCE(results.payload_json->>'createdAt', task_statuses.payload_json->>'createdAt', user_requests.payload_json->>'createdAt') AS created_at,
        COALESCE(
          results.payload_json->>'returnedAt',
          task_statuses.payload_json->>'returnedAt',
          user_requests.payload_json->>'returnedAt',
          results.payload_json->>'completedAt',
          task_statuses.payload_json->>'completedAt',
          user_requests.payload_json->>'completedAt'
        ) AS returned_at,
        COALESCE(
          results.payload_json->>'selectedModelId',
          task_statuses.payload_json->>'selectedModelId',
          user_requests.payload_json->>'selectedModelId',
          results.payload_json->>'model',
          task_statuses.payload_json->>'model',
          user_requests.payload_json->>'model',
          results.payload_json->>'modelCode',
          task_statuses.payload_json->>'modelCode',
          user_requests.payload_json->>'modelCode'
        ) AS selected_model_id,
        COALESCE(
          results.payload_json->>'modelLabel',
          task_statuses.payload_json->>'modelLabel',
          user_requests.payload_json->>'modelLabel',
          results.payload_json->>'modelName',
          task_statuses.payload_json->>'modelName',
          user_requests.payload_json->>'modelName',
          results.payload_json->>'displayName',
          task_statuses.payload_json->>'displayName',
          user_requests.payload_json->>'displayName'
        ) AS model_label,
        COALESCE(results.payload_json->>'styleLabel', task_statuses.payload_json->>'styleLabel', user_requests.payload_json->>'styleLabel') AS style_label,
        COALESCE(results.payload_json->>'skillId', task_statuses.payload_json->>'skillId', user_requests.payload_json->>'skillId') AS skill_id,
        COALESCE(results.payload_json->>'aspectRatio', task_statuses.payload_json->>'aspectRatio', user_requests.payload_json->>'aspectRatio') AS aspect_ratio,
        COALESCE(results.payload_json->>'resolution', task_statuses.payload_json->>'resolution', user_requests.payload_json->>'resolution') AS resolution,
        COALESCE(results.payload_json->>'creditCost', task_statuses.payload_json->>'creditCost', user_requests.payload_json->>'creditCost') AS credit_cost,
        COALESCE(results.payload_json->>'failureCode', task_statuses.payload_json->>'failureCode', user_requests.payload_json->>'failureCode') AS failure_code,
        ${compactConversationObjectSql(
          "COALESCE(results.payload_json->'failure', task_statuses.payload_json->'failure', user_requests.payload_json->'failure')",
          ["failureCode", "displayMessage", "providerMessage", "errorMessage", "noticeType"],
        )} AS failure,
        COALESCE(results.payload_json->>'noticeType', task_statuses.payload_json->>'noticeType', user_requests.payload_json->>'noticeType') AS notice_type
      FROM recent_turn_order
      LEFT JOIN user_requests ON user_requests.turn_key = recent_turn_order.turn_key
      LEFT JOIN task_statuses ON task_statuses.turn_key = recent_turn_order.turn_key
      LEFT JOIN results ON results.turn_key = recent_turn_order.turn_key
      ORDER BY recent_turn_order.order_created_at ASC, recent_turn_order.turn_key ASC
    `,
    [input.thread.threadId],
  );
  const modelCodes = [...new Set(
    result.rows.map((row) => String(row.selected_model_id ?? "").trim()).filter(Boolean),
  )];
  const modelDisplayNames = new Map<string, string>();
  if (modelCodes.length) {
    const modelRows = await db.query<{ model_code: string; display_name: string }>(
      `SELECT model_code, display_name FROM ai_model_configs WHERE model_code = ANY($1::text[])`,
      [modelCodes],
    );
    for (const model of modelRows.rows) {
      const modelCode = String(model.model_code ?? "").trim();
      const displayName = String(model.display_name ?? "").trim();
      if (modelCode && displayName) modelDisplayNames.set(modelCode, displayName);
    }
  }

  return result.rows.map((row) => {
    const creditCost = row.credit_cost === null ? null : Number(row.credit_cost);
    const storedModelLabel = String(row.model_label ?? "").trim();
    const modelDisplayName = (
      modelDisplayNames.get(String(row.selected_model_id ?? "").trim())
      ?? (storedModelLabel && storedModelLabel !== row.selected_model_id ? storedModelLabel : "")
    ) || (row.selected_model_id ? "默认模型" : "");
    return {
      turnId: row.turn_key,
      assetId: row.asset_id ?? input.thread.assetId,
      mediaKind: row.media_kind === "video" ? "video" : input.thread.mediaMode,
      promptPreview: row.prompt_preview ?? "",
      quickReferenceItems: normalizeConversationItemArray(row.quick_reference_items),
      attachmentItems: normalizeConversationItemArray(row.attachment_items),
      mentionReferences: normalizeConversationItemArray(row.mention_references),
      generatedAudioItems: normalizeConversationItemArray(row.generated_audio_items),
      fixedImages: normalizeGeneratedConversationImages(normalizeConversationItemArray(row.fixed_images)),
      fixedVideos: normalizeConversationItemArray(row.fixed_videos),
      selectionContext: row.selection_context ?? null,
      taskId: row.task_id ?? null,
      status: row.status ?? "running",
      createdAt: row.created_at ?? new Date(row.order_created_at).toISOString(),
      returnedAt: row.returned_at ?? null,
      modelLabel: modelDisplayName || null,
      styleLabel: row.style_label ?? null,
      skillId: row.skill_id ?? null,
      aspectRatio: row.aspect_ratio ?? null,
      resolution: row.resolution ?? null,
      creditCost: Number.isFinite(creditCost) ? creditCost : null,
      failureCode: row.failure_code ?? null,
      failure: row.failure ?? null,
      noticeType: row.notice_type ?? null,
    };
  });
}

export async function deleteAssetConversationTurn(
  db: SqlDatabase,
  input: {
    threadId: string;
    turnIdOrTaskId: string;
    now: Date;
  },
): Promise<{ deletedCount: number; remainingMessages: AssetConversationMessage[] }> {
  const deletion = await queryOne<{ deleted_count: number | string }>(
    db,
    `
      WITH locked_thread AS MATERIALIZED (
        SELECT id
        FROM episode_asset_conversation_threads
        WHERE id = $1
        FOR UPDATE
      ),
      matched_messages AS MATERIALIZED (
        SELECT
          message.turn_id,
          message.task_id,
          NULLIF(message.payload_json->>'taskId', '') AS payload_task_id
        FROM episode_asset_conversation_messages message
        CROSS JOIN locked_thread
        WHERE message.thread_id = $1
          AND NOT (
            LEFT(message.message_key, length('${conversationTurnDeletedMessageKeyPrefix}')) = '${conversationTurnDeletedMessageKeyPrefix}'
            AND message.payload_json->>'${conversationTurnDeletedPayloadKey}' = 'true'
          )
          AND (
            message.turn_id = $2
            OR message.task_id = $2
            OR message.payload_json->>'taskId' = $2
          )
      ),
      matched_identifiers AS MATERIALIZED (
        SELECT turn_id AS identifier
        FROM matched_messages
        UNION
        SELECT task_id AS identifier
        FROM matched_messages
        UNION
        SELECT payload_task_id AS identifier
        FROM matched_messages
      ),
      deleted_identifiers AS MATERIALIZED (
        SELECT $2::text AS identifier
        UNION
        SELECT identifier
        FROM matched_identifiers
        WHERE identifier IS NOT NULL AND identifier <> ''
      ),
      deleted_messages AS (
        DELETE FROM episode_asset_conversation_messages message
        USING locked_thread
        WHERE message.thread_id = locked_thread.id
          AND NOT (
            LEFT(message.message_key, length('${conversationTurnDeletedMessageKeyPrefix}')) = '${conversationTurnDeletedMessageKeyPrefix}'
            AND message.payload_json->>'${conversationTurnDeletedPayloadKey}' = 'true'
          )
          AND (
            message.turn_id IN (SELECT identifier FROM deleted_identifiers)
            OR message.task_id IN (SELECT identifier FROM deleted_identifiers)
            OR message.payload_json->>'taskId' IN (SELECT identifier FROM deleted_identifiers)
          )
        RETURNING message.id
      ),
      deletion_markers AS (
        INSERT INTO episode_asset_conversation_messages (
          id,
          thread_id,
          turn_id,
          message_key,
          message_type,
          status,
          task_id,
          payload_json,
          created_by_user_id,
          created_at,
          updated_at
        )
        SELECT
          gen_random_uuid(),
          $1,
          identifier,
          '${conversationTurnDeletedMessageKeyPrefix}' || identifier,
          'result',
          'canceled',
          NULL,
          jsonb_build_object('${conversationTurnDeletedPayloadKey}', true),
          NULL,
          $3,
          $3
        FROM deleted_identifiers
        ON CONFLICT (thread_id, message_key)
        DO UPDATE SET
          payload_json = EXCLUDED.payload_json,
          updated_at = EXCLUDED.updated_at
        RETURNING id
      )
      SELECT (SELECT count(*)::int FROM deleted_messages) AS deleted_count
      FROM (SELECT count(*) FROM deletion_markers) marker_write
    `,
    [input.threadId, input.turnIdOrTaskId, input.now],
  );

  const remainingMessages = await listAssetConversationMessages(db, {
    threadId: input.threadId,
  });

  const latestMessageAt = remainingMessages.at(-1)?.createdAt ?? input.now;
  await db.query(
    `
      UPDATE episode_asset_conversation_threads
      SET latest_message_at = $2,
          updated_at = $3
      WHERE id = $1
    `,
    [input.threadId, latestMessageAt, input.now],
  );

  return {
    deletedCount: Number(deletion?.deleted_count ?? 0),
    remainingMessages,
  };
}

export function buildAssetConversationEntries(
  thread: AssetConversationThread,
  messages: AssetConversationMessage[],
): Record<string, unknown>[] {
  const turns = new Map<
    string,
    {
      order: number;
      createdAt: Date;
      userRequest: Record<string, unknown> | null;
      taskStatus: (Record<string, unknown> & { status?: string; taskId?: string | null }) | null;
      result: (Record<string, unknown> & { status?: string; taskId?: string | null }) | null;
    }
  >();

  messages.forEach((message, index) => {
    const key = message.turnId || message.taskId || message.messageKey;
    const current = turns.get(key) ?? {
      order: index,
      createdAt: message.createdAt,
      userRequest: null,
      taskStatus: null,
      result: null,
    };
    if (message.messageType === "user_request") {
      current.userRequest = message.payload ?? {};
    } else if (message.messageType === "task_status") {
      current.taskStatus = {
        ...(message.payload ?? {}),
        status: message.status,
        taskId: message.taskId ?? null,
      };
    } else if (message.messageType === "result") {
      current.result = {
        ...(message.payload ?? {}),
        status: message.status,
        taskId: message.taskId ?? null,
      };
    }
    turns.set(key, current);
  });

  return [...turns.values()]
    .sort((left, right) => left.order - right.order)
    .map((turn) => {
      const userRequest = turn.userRequest ?? {};
      const systemPayload = turn.result ?? turn.taskStatus ?? {};
      const selectionContext =
        (systemPayload.selectionContext as Record<string, unknown> | undefined) ??
        (userRequest.selectionContext as Record<string, unknown> | undefined) ??
        null;
      return {
        ...userRequest,
        ...systemPayload,
        assetId:
          (systemPayload.assetId as string | undefined) ??
          (userRequest.assetId as string | undefined) ??
          thread.assetId,
        mediaKind:
          (systemPayload.mediaKind as string | undefined) ??
          (userRequest.mediaKind as string | undefined) ??
          thread.mediaMode,
        promptPreview:
          (userRequest.promptPreview as string | undefined) ??
          (systemPayload.promptPreview as string | undefined) ??
          "",
        quickReferenceItems:
          (userRequest.quickReferenceItems as unknown[] | undefined) ??
          (systemPayload.quickReferenceItems as unknown[] | undefined) ??
          [],
        attachmentItems:
          (userRequest.attachmentItems as unknown[] | undefined) ??
          (systemPayload.attachmentItems as unknown[] | undefined) ??
          [],
        mentionReferences:
          (userRequest.mentionReferences as unknown[] | undefined) ??
          (systemPayload.mentionReferences as unknown[] | undefined) ??
          [],
        generatedAudioItems:
          (userRequest.generatedAudioItems as unknown[] | undefined) ??
          (systemPayload.generatedAudioItems as unknown[] | undefined) ??
          [],
        fixedImages: normalizeGeneratedConversationImages(systemPayload.fixedImages as unknown[] | undefined),
        fixedVideos: (systemPayload.fixedVideos as unknown[] | undefined) ?? [],
        selectionContext,
        taskId:
          (systemPayload.taskId as string | undefined) ??
          (userRequest.taskId as string | undefined) ??
          null,
        status:
          (systemPayload.status as string | undefined) ??
          (userRequest.status as string | undefined) ??
          "running",
      };
    });
}

function normalizeGeneratedConversationImages(images: unknown[] | undefined) {
  if (!Array.isArray(images)) {
    return [];
  }
  return images.map((image) => {
    if (!image || typeof image !== "object" || Array.isArray(image)) {
      return image;
    }
    const record = image as Record<string, unknown>;
    const storageObjectId = typeof record.storageObjectId === "string" && record.storageObjectId.trim()
      ? record.storageObjectId.trim()
      : null;
    const url = typeof record.url === "string" && record.url.trim()
      ? record.url.trim()
      : typeof record.previewUrl === "string" && record.previewUrl.trim()
        ? record.previewUrl.trim()
        : typeof record.src === "string" && record.src.trim()
          ? record.src.trim()
          : null;
    return {
      ...record,
      id: storageObjectId ?? url ?? record.id ?? null,
      assetVersionId: null,
    };
  });
}

function normalizeConversationItemArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(compactConversationItem).filter(Boolean);
}

function compactConversationItem(item: unknown) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return item;
  }
  const record = item as Record<string, unknown>;
  const compact: Record<string, unknown> = {};
  conversationSummaryItemKeys.forEach((key) => {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") {
      compact[key] = value;
    }
  });
  return compact;
}

function assetConversationThreadFromRow(row: AssetConversationThreadRow): AssetConversationThread {
  return {
    threadId: row.id,
    projectId: row.project_id,
    episodeId: row.episode_id,
    assetId: row.asset_id,
    mediaMode: row.media_mode,
    latestMessageAt: new Date(row.latest_message_at),
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function assetConversationMessageFromRow(row: AssetConversationMessageRow): AssetConversationMessage {
  return {
    messageId: row.id,
    threadId: row.thread_id,
    turnId: row.turn_id,
    messageKey: row.message_key,
    messageType: row.message_type,
    status: row.status,
    taskId: row.task_id,
    payload: row.payload_json ?? {},
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
