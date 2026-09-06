import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type { CanvasAgentKnowledgeService } from "./canvas-agent-knowledge.service.ts";
import type { CanvasAgentPromptPreferenceService } from "./canvas-agent-prompt-preference.service.ts";
import type { CanvasAgentActor, CanvasAgentCapabilityProfile } from "./canvas-agent.types.ts";

export class CanvasAgentContextService {
  constructor(
    private readonly deps: {
      db: SqlDatabase;
      loadCanvasContext: (input: {
        canvasId: string;
        actor: CanvasAgentActor;
      }) => Promise<Record<string, unknown>>;
      maxMessages?: number;
      maxSerializedChars?: number;
      knowledge?: Pick<CanvasAgentKnowledgeService, "listMemories">;
      promptPreferences?: Pick<CanvasAgentPromptPreferenceService, "list">;
      now?: () => Date;
    },
  ) {}

  async build(input: {
    canvasId: string;
    conversationId: string;
    actor: CanvasAgentActor;
    taskId?: string;
    capabilityProfile?: CanvasAgentCapabilityProfile;
  }) {
    const mediaGenerationOnly = input.capabilityProfile === "media_generation_only";
    const canvas = mediaGenerationOnly
      ? undefined
      : await this.deps.loadCanvasContext({
          canvasId: input.canvasId,
          actor: input.actor,
        });
    const conversation = await queryOne<{ summary_json: Record<string, unknown> }>(
      this.deps.db,
      `
        SELECT summary_json FROM canvas_agent_conversations
        WHERE id=$1 AND canvas_id=$2 AND owner_user_id=$3
          AND actor_team_member_id IS NOT DISTINCT FROM $4
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [input.conversationId, input.canvasId, input.actor.ownerUserId, input.actor.actorTeamMemberId ?? null],
    );
    if (!conversation) throw new Error("canvas_agent_conversation_not_found");
    const creative = mediaGenerationOnly && readRecord(conversation.summary_json).creative
      ? { creative: readRecord(readRecord(conversation.summary_json).creative) } : {};
    let summary = mediaGenerationOnly ? {} : readRecord(conversation.summary_json);
    const throughSequence = Math.max(0, Number(summary.throughSequence ?? 0));
    const maxMessages = this.deps.maxMessages ?? 80;
    const result = await this.deps.db.query<{
      role: "system" | "user" | "assistant" | "tool";
      content_json: Record<string, unknown>;
      sequence: number | string;
    }>(
      `
        SELECT role, content_json, sequence
        FROM canvas_agent_messages
        WHERE conversation_id=$1 AND sequence>$2
          AND ($4::text IS NULL OR EXISTS (
            SELECT 1 FROM canvas_agent_tasks task
            WHERE task.id=canvas_agent_messages.task_id
              AND task.budget_json->>'capabilityProfile'=$4
          ))
        ORDER BY sequence DESC
        LIMIT $3
      `,
      [
        input.conversationId,
        throughSequence,
        Math.max(1, maxMessages + 1),
        mediaGenerationOnly ? "media_generation_only" : null,
      ],
    );
    let messages = result.rows.reverse().map((row) => ({
      role: row.role,
      content: compactCanvasReadMessage(row.role, row.content_json),
      sequence: Number(row.sequence),
    }));
    const memories = !mediaGenerationOnly && this.deps.knowledge
      ? await this.deps.knowledge.listMemories({
          canvasId: input.canvasId,
          conversationId: input.conversationId,
          actor: input.actor,
          limit: 100,
        })
      : [];
    const mediaPromptPreferences = !mediaGenerationOnly && this.deps.promptPreferences
      ? await this.deps.promptPreferences.list({
          canvasId: input.canvasId,
          actor: input.actor,
          limit: 100,
        })
      : [];
    const activeFileGrants = await this.listFileGrants({
      canvasId: input.canvasId,
      conversationId: input.conversationId,
      actor: input.actor,
      now: (this.deps.now ?? (() => new Date()))(),
    });
    const fileGrants = activeFileGrants.map((grant) => ({
      id: grant.id,
      purpose: grant.purpose,
      expiresAt: grant.expiresAt,
    }));
    let context = mediaGenerationOnly
      ? { ...creative, fileGrants, messages }
      : { canvas, summary, memories, mediaPromptPreferences, fileGrants, messages };
    const serialized = JSON.stringify(context);
    const maxChars = this.deps.maxSerializedChars ?? 400_000;
    if (result.rows.length <= maxMessages && serialized.length <= maxChars) return context;

    const retainCount = Math.min(messages.length, Math.max(8, Math.floor(maxMessages / 2)));
    messages = messages.slice(-retainCount);
    const firstRetainedSequence = messages[0]?.sequence ?? throughSequence + 1;
    const compactedResult = await this.deps.db.query<{
      role: "system" | "user" | "assistant" | "tool";
      content_json: Record<string, unknown>;
      sequence: number | string;
      total_count: number | string;
    }>(
      `
        SELECT role, content_json, sequence, COUNT(*) OVER() AS total_count
        FROM canvas_agent_messages
        WHERE conversation_id=$1 AND sequence>$2 AND sequence<$3
          AND ($4::text IS NULL OR EXISTS (
            SELECT 1 FROM canvas_agent_tasks task
            WHERE task.id=canvas_agent_messages.task_id
              AND task.budget_json->>'capabilityProfile'=$4
          ))
        ORDER BY sequence DESC
        LIMIT 80
      `,
      [
        input.conversationId,
        throughSequence,
        firstRetainedSequence,
        mediaGenerationOnly ? "media_generation_only" : null,
      ],
    );
    const compacted = compactedResult.rows.reverse().map((row) => ({
      role: row.role,
      content: compactCanvasReadMessage(row.role, row.content_json),
      sequence: Number(row.sequence),
    }));
    const compactedCount = Number(compactedResult.rows[0]?.total_count ?? 0);
    if (compactedCount > 0 && !mediaGenerationOnly) {
      const now = (this.deps.now ?? (() => new Date()))();
      summary = mergeSummary(summary, compacted, input.actor, now, {
        messageCount: compactedCount,
        throughSequence: compacted.at(-1)?.sequence ?? throughSequence,
      });
      await this.deps.db.query(
        `
          UPDATE canvas_agent_conversations
          SET summary_json=$5::jsonb,updated_at=$6
          WHERE id=$1 AND canvas_id=$2 AND owner_user_id=$3
            AND actor_team_member_id IS NOT DISTINCT FROM $4
        `,
        [
          input.conversationId, input.canvasId, input.actor.ownerUserId,
          input.actor.actorTeamMemberId ?? null, JSON.stringify(summary), now,
        ],
      );
    }
    context = mediaGenerationOnly
      ? { ...creative, fileGrants, messages }
      : { canvas, summary, memories, mediaPromptPreferences, fileGrants, messages };
    return {
      ...context,
      truncated: true,
      omittedMessageCount: Number(summary.messageCount ?? compactedCount),
    };
  }

  async createFileGrant(input: {
    canvasId: string;
    conversationId: string;
    storageObjectId: string;
    purpose: string;
    actor: CanvasAgentActor;
    expiresAt: Date;
    now: Date;
  }) {
    if (input.expiresAt <= input.now) throw new Error("canvas_agent_file_grant_expired");
    if (input.expiresAt.getTime() - input.now.getTime() > 24 * 60 * 60_000) {
      throw new Error("canvas_agent_file_grant_expiry_too_long");
    }
    if (!input.purpose.trim()) throw new Error("canvas_agent_file_grant_purpose_required");
    const row = await queryOne<{ id: string }>(
      this.deps.db,
      `
        INSERT INTO canvas_agent_file_grants (
          id, conversation_id, canvas_id, storage_object_id, owner_user_id,
          actor_team_member_id, purpose, expires_at, created_at
        )
        SELECT $1,$2,$3,storage.id,$4,$5,$6,$7,$8
        FROM storage_objects storage
        JOIN canvas_agent_conversations conversation
          ON conversation.id=$2 AND conversation.canvas_id=$3
          AND conversation.owner_user_id=$4
          AND conversation.actor_team_member_id IS NOT DISTINCT FROM $5
          AND conversation.deleted_at IS NULL
        WHERE storage.id=$9 AND storage.status='available'
          AND storage.deleted_at IS NULL
          AND storage.canvas_project_id=$3
          AND storage.created_by_user_id=$4
        RETURNING id
      `,
      [
        randomUUID(), input.conversationId, input.canvasId,
        input.actor.ownerUserId, input.actor.actorTeamMemberId ?? null,
        input.purpose.trim(), input.expiresAt, input.now, input.storageObjectId,
      ],
    );
    if (!row) throw new Error("canvas_agent_file_grant_target_not_found");
    return row;
  }

  async resolveFileGrant(input: {
    grantId: string;
    canvasId: string;
    conversationId: string;
    actor: CanvasAgentActor;
    now: Date;
  }) {
    await this.expireFileGrants(input.now);
    const row = await queryOne<{ storage_object_id: string; purpose: string; content_type: string }>(
      this.deps.db,
      `
        SELECT file_grant.storage_object_id, file_grant.purpose, storage.content_type
        FROM canvas_agent_file_grants file_grant
        JOIN storage_objects storage ON storage.id=file_grant.storage_object_id
        WHERE file_grant.id=$1 AND file_grant.canvas_id=$2 AND file_grant.conversation_id=$3
          AND file_grant.owner_user_id=$4
          AND file_grant.actor_team_member_id IS NOT DISTINCT FROM $5
          AND file_grant.status='active' AND file_grant.expires_at>$6 AND file_grant.revoked_at IS NULL
          AND storage.status='available' AND storage.deleted_at IS NULL
      `,
      [
        input.grantId, input.canvasId, input.conversationId,
        input.actor.ownerUserId, input.actor.actorTeamMemberId ?? null, input.now,
      ],
    );
    if (!row) throw new Error("canvas_agent_file_grant_not_found");
    return { storageObjectId: row.storage_object_id, purpose: row.purpose, contentType: row.content_type };
  }

  async revokeFileGrant(input: {
    grantId: string;
    canvasId: string;
    conversationId: string;
    actor: CanvasAgentActor;
    now: Date;
  }) {
    const row = await queryOne<{ id: string }>(
      this.deps.db,
      `
        UPDATE canvas_agent_file_grants
        SET status='revoked', revoked_at=$6
        WHERE id=$1 AND canvas_id=$2 AND conversation_id=$3 AND owner_user_id=$4
          AND actor_team_member_id IS NOT DISTINCT FROM $5 AND status='active'
        RETURNING id
      `,
      [
        input.grantId, input.canvasId, input.conversationId,
        input.actor.ownerUserId, input.actor.actorTeamMemberId ?? null, input.now,
      ],
    );
    return Boolean(row);
  }

  async listFileGrants(input: {
    canvasId: string;
    conversationId: string;
    actor: CanvasAgentActor;
    includeInactive?: boolean;
    now: Date;
  }) {
    await this.expireFileGrants(input.now);
    const conversation = await queryOne<{ id: string }>(this.deps.db, `
      SELECT id FROM canvas_agent_conversations
      WHERE id=$1 AND canvas_id=$2 AND owner_user_id=$3
        AND actor_team_member_id IS NOT DISTINCT FROM $4
        AND deleted_at IS NULL LIMIT 1
    `, [input.conversationId, input.canvasId, input.actor.ownerUserId, input.actor.actorTeamMemberId ?? null]);
    if (!conversation) throw new Error("canvas_agent_conversation_not_found");
    const result = await this.deps.db.query<{
      id: string; storage_object_id: string; purpose: string; status: string;
      expires_at: Date | string; created_at: Date | string;
    }>(`
      SELECT file_grant.id,file_grant.storage_object_id,file_grant.purpose,file_grant.status,
             file_grant.expires_at,file_grant.created_at
      FROM canvas_agent_file_grants file_grant
      JOIN canvas_agent_conversations conversation ON conversation.id=file_grant.conversation_id
      WHERE file_grant.canvas_id=$1 AND file_grant.conversation_id=$2 AND file_grant.owner_user_id=$3
        AND file_grant.actor_team_member_id IS NOT DISTINCT FROM $4
        AND conversation.deleted_at IS NULL
        AND ($5::boolean OR file_grant.status='active')
      ORDER BY file_grant.created_at DESC,file_grant.id DESC
      LIMIT 200
    `, [
      input.canvasId, input.conversationId, input.actor.ownerUserId,
      input.actor.actorTeamMemberId ?? null, input.includeInactive === true,
    ]);
    return result.rows.map((row) => ({
      id: row.id,
      storageObjectId: row.storage_object_id,
      purpose: row.purpose,
      status: row.status,
      expiresAt: new Date(row.expires_at).toISOString(),
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  async expireFileGrants(now: Date) {
    const result = await this.deps.db.query<{ id: string }>(`
      UPDATE canvas_agent_file_grants
      SET status='expired',revoked_at=COALESCE(revoked_at,$1)
      WHERE status='active' AND expires_at<=$1
      RETURNING id
    `, [now]);
    return result.rows.length;
  }

  async revokeConversationFileGrants(input: {
    canvasId: string;
    conversationId: string;
    actor: CanvasAgentActor;
    now: Date;
  }) {
    const result = await this.deps.db.query<{ id: string }>(`
      UPDATE canvas_agent_file_grants
      SET status='revoked',revoked_at=$5
      WHERE canvas_id=$1 AND conversation_id=$2 AND owner_user_id=$3
        AND actor_team_member_id IS NOT DISTINCT FROM $4 AND status='active'
      RETURNING id
    `, [input.canvasId, input.conversationId, input.actor.ownerUserId, input.actor.actorTeamMemberId ?? null, input.now]);
    return result.rows.length;
  }
}

function mergeSummary(
  current: Record<string, unknown>,
  messages: Array<{ role: string; content: Record<string, unknown>; sequence: number }>,
  actor: CanvasAgentActor,
  now: Date,
  input: { messageCount?: number; throughSequence?: number } = {},
) {
  const previous = Array.isArray(current.items) ? current.items : [];
  const items = [
    ...previous,
    ...messages.map((message) => ({
      role: message.role,
      sequence: message.sequence,
      text: summarizeContent(message.content),
    })),
  ].slice(-80);
  return {
    version: 1,
    throughSequence: input.throughSequence ?? messages.at(-1)?.sequence ?? Number(current.throughSequence ?? 0),
    messageCount: Number(current.messageCount ?? 0) + (input.messageCount ?? messages.length),
    actorTeamMemberId: actor.actorTeamMemberId ?? null,
    items,
    updatedAt: now.toISOString(),
  };
}

function summarizeContent(content: Record<string, unknown>) {
  const text = typeof content.text === "string"
    ? content.text
    : typeof content.message === "string"
      ? content.message
      : JSON.stringify(content);
  return text.replace(/\s+/g, " ").trim().slice(0, 600);
}

function compactCanvasReadMessage(role: string, content: Record<string, unknown>) {
  if (role !== "tool" || content.toolId !== "canvas.read") return content;
  const output = readRecord(content.output);
  const document = readRecord(output.document);
  return {
    ...content,
    output: {
      canvasProjectId: output.canvasProjectId ?? null,
      serverRevision: output.serverRevision ?? null,
      document: {
        nodeCount: Array.isArray(document.nodes) ? document.nodes.length : 0,
        edgeCount: Array.isArray(document.edges) ? document.edges.length : 0,
        availableInContext: true,
      },
    },
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function assertNoLocalPath(value: unknown) {
  const serialized = JSON.stringify(value);
  if (/(?:[A-Za-z]:\\|file:\/\/|\/Users\/|\/home\/)/i.test(serialized)) {
    throw new Error("canvas_agent_local_path_forbidden");
  }
}
