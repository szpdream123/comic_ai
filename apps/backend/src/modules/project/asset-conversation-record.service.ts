import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export type AssetConversationMediaMode = "image" | "video";
export type AssetConversationMessageType = "user_request" | "task_status" | "result";
export type AssetConversationStatus = "queued" | "running" | "completed" | "failed" | "canceled";

export interface AssetConversationThread {
  threadId: string;
  organizationId: string;
  workspaceId: string;
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
  organization_id: string;
  workspace_id: string;
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

export async function upsertAssetConversationThread(
  db: SqlDatabase,
  input: {
    organizationId: string;
    workspaceId: string;
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
        organization_id,
        workspace_id,
        project_id,
        episode_id,
        asset_id,
        media_mode,
        latest_message_at,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
      ON CONFLICT (organization_id, project_id, episode_id, asset_id, media_mode)
      DO UPDATE SET
        latest_message_at = EXCLUDED.latest_message_at,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `,
    [
      randomUUID(),
      input.organizationId,
      input.workspaceId,
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
    organizationId: string;
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
      WHERE organization_id = $1
        AND project_id = $2
        AND episode_id = $3
        AND asset_id = $4
        AND media_mode = $5
    `,
    [input.organizationId, input.projectId, input.episodeId, input.assetId, input.mediaMode],
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
  const messages: AssetConversationMessage[] = [];
  for (const item of input.messages) {
    const row = await queryOne<AssetConversationMessageRow>(
      db,
      `
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
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $10)
        ON CONFLICT (thread_id, message_key)
        DO UPDATE SET
          turn_id = EXCLUDED.turn_id,
          message_type = EXCLUDED.message_type,
          status = EXCLUDED.status,
          task_id = EXCLUDED.task_id,
          payload_json = EXCLUDED.payload_json,
          updated_at = EXCLUDED.updated_at
        RETURNING *
      `,
      [
        randomUUID(),
        input.threadId,
        item.turnId,
        item.messageKey,
        item.messageType,
        item.status ?? "running",
        item.taskId ?? null,
        JSON.stringify(item.payload ?? {}),
        input.createdByUserId ?? null,
        input.now,
      ],
    );
    messages.push(assetConversationMessageFromRow(row!));
  }

  return messages;
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
      ORDER BY created_at ASC, id ASC
    `,
    [input.threadId],
  );

  return result.rows.map(assetConversationMessageFromRow);
}

export async function deleteAssetConversationTurn(
  db: SqlDatabase,
  input: {
    threadId: string;
    turnIdOrTaskId: string;
    now: Date;
  },
): Promise<{ deletedCount: number; remainingMessages: AssetConversationMessage[] }> {
  const previousMessages = await listAssetConversationMessages(db, {
    threadId: input.threadId,
  });

  await db.query(
    `
      DELETE FROM episode_asset_conversation_messages
      WHERE thread_id = $1
        AND (turn_id = $2 OR task_id = $2)
    `,
    [input.threadId, input.turnIdOrTaskId],
  );

  const remainingMessages = await listAssetConversationMessages(db, {
    threadId: input.threadId,
  });

  if (!remainingMessages.length) {
    await db.query(
      `
        DELETE FROM episode_asset_conversation_threads
        WHERE id = $1
      `,
      [input.threadId],
    );
    return {
      deletedCount: Math.max(0, previousMessages.length - remainingMessages.length),
      remainingMessages,
    };
  }

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
    deletedCount: Math.max(0, previousMessages.length - remainingMessages.length),
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

function assetConversationThreadFromRow(row: AssetConversationThreadRow): AssetConversationThread {
  return {
    threadId: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
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
