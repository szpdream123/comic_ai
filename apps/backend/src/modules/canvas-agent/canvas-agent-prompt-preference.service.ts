import { createHash, randomUUID } from "node:crypto";

import {
  assertCanvasActorAction,
  restoreCanvasActorScope,
} from "../identity/canvas-actor-scope.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type { CanvasAgentActor } from "./canvas-agent.types.ts";

type MediaKind = "image" | "video" | "audio";

interface PreferenceRow {
  id: string;
  media_kind: string;
  preference_key: string;
  instruction_text: string;
  tags_json: unknown;
  source_canvas_id: string | null;
  confirmed_at: Date | string;
  updated_at: Date | string;
}

export class CanvasAgentPromptPreferenceService {
  constructor(private readonly db: SqlDatabase) {}

  async learn(input: {
    canvasId: string;
    conversationId: string;
    taskId: string;
    stepId: string;
    actor: CanvasAgentActor;
    mediaKind: MediaKind;
    preferenceKey?: string | null;
    instruction: string;
    tags?: unknown;
    confirmed: boolean;
    now: Date;
  }) {
    if (input.confirmed !== true) throw new Error("canvas_agent_prompt_preference_confirmation_required");
    const scope = await restoreCanvasActorScope(this.db, {
      canvasId: input.canvasId,
      ownerUserId: input.actor.ownerUserId,
      actorTeamMemberId: input.actor.actorTeamMemberId ?? null,
    });
    assertCanvasActorAction(scope, "run");
    const mediaKind = normalizeMediaKind(input.mediaKind);
    const instruction = normalizeInstruction(input.instruction);
    const tags = normalizeTags(input.tags);
    const preferenceKey = normalizePreferenceKey(input.preferenceKey, mediaKind, instruction, tags);
    const row = await queryOne<PreferenceRow>(this.db, `
      INSERT INTO canvas_agent_media_prompt_preferences (
        id,owner_user_id,actor_team_member_id,media_kind,preference_key,
        instruction_text,tags_json,source_canvas_id,source_conversation_id,
        source_task_id,source_step_id,status,confirmed_at,created_at,updated_at
      )
      SELECT $1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,'active',$12,$12,$12
      FROM canvas_agent_conversations conversation
      JOIN canvas_agent_tasks task ON task.id=$10 AND task.conversation_id=conversation.id
      JOIN canvas_agent_steps step ON step.id=$11 AND step.task_id=task.id
      WHERE conversation.id=$9 AND conversation.canvas_id=$8
        AND conversation.owner_user_id=$2
        AND conversation.actor_team_member_id IS NOT DISTINCT FROM $3
        AND conversation.status='active' AND conversation.deleted_at IS NULL
        AND task.canvas_id=$8 AND task.owner_user_id=$2
        AND task.actor_team_member_id IS NOT DISTINCT FROM $3
      ON CONFLICT (
        owner_user_id,
        COALESCE(actor_team_member_id, '00000000-0000-0000-0000-000000000000'::uuid),
        media_kind,preference_key
      ) WHERE status='active'
      DO UPDATE SET instruction_text=EXCLUDED.instruction_text,
        tags_json=EXCLUDED.tags_json,source_canvas_id=EXCLUDED.source_canvas_id,
        source_conversation_id=EXCLUDED.source_conversation_id,
        source_task_id=EXCLUDED.source_task_id,source_step_id=EXCLUDED.source_step_id,
        confirmed_at=EXCLUDED.confirmed_at,updated_at=EXCLUDED.updated_at
      RETURNING id,media_kind,preference_key,instruction_text,tags_json,
        source_canvas_id,confirmed_at,updated_at
    `, [
      randomUUID(), scope.ownerUserId, scope.actorTeamMemberId, mediaKind, preferenceKey,
      instruction, JSON.stringify(tags), input.canvasId, input.conversationId,
      input.taskId, input.stepId, input.now,
    ]);
    if (!row) throw new Error("canvas_agent_prompt_preference_scope_invalid");
    return serializePreference(row);
  }

  async list(input: {
    canvasId: string;
    actor: CanvasAgentActor;
    mediaKind?: MediaKind | null;
    limit?: number;
  }) {
    const scope = await restoreCanvasActorScope(this.db, {
      canvasId: input.canvasId,
      ownerUserId: input.actor.ownerUserId,
      actorTeamMemberId: input.actor.actorTeamMemberId ?? null,
    });
    assertCanvasActorAction(scope, "view");
    const mediaKind = input.mediaKind ? normalizeMediaKind(input.mediaKind) : null;
    const result = await this.db.query<PreferenceRow>(`
      SELECT id,media_kind,preference_key,instruction_text,tags_json,
        source_canvas_id,confirmed_at,updated_at
      FROM canvas_agent_media_prompt_preferences
      WHERE owner_user_id=$1 AND actor_team_member_id IS NOT DISTINCT FROM $2
        AND status='active' AND ($3::text IS NULL OR media_kind=$3)
      ORDER BY updated_at DESC,id DESC
      LIMIT $4
    `, [scope.ownerUserId, scope.actorTeamMemberId, mediaKind, boundedLimit(input.limit)]);
    return result.rows.map(serializePreference);
  }

  async revoke(input: {
    canvasId: string;
    actor: CanvasAgentActor;
    preferenceId: string;
    now: Date;
  }) {
    const scope = await restoreCanvasActorScope(this.db, {
      canvasId: input.canvasId,
      ownerUserId: input.actor.ownerUserId,
      actorTeamMemberId: input.actor.actorTeamMemberId ?? null,
    });
    assertCanvasActorAction(scope, "run");
    const row = await queryOne<{ id: string }>(this.db, `
      UPDATE canvas_agent_media_prompt_preferences
      SET status='revoked',revoked_at=$4,updated_at=$4
      WHERE id=$1 AND owner_user_id=$2
        AND actor_team_member_id IS NOT DISTINCT FROM $3
        AND status='active'
      RETURNING id
    `, [input.preferenceId, scope.ownerUserId, scope.actorTeamMemberId, input.now]);
    if (!row) throw new Error("canvas_agent_prompt_preference_not_found");
    return { id: row.id, status: "revoked" };
  }
}

function normalizeMediaKind(value: string): MediaKind {
  if (value === "image" || value === "video" || value === "audio") return value;
  throw new Error("canvas_agent_prompt_preference_media_invalid");
}

function normalizeInstruction(value: string) {
  const instruction = String(value ?? "").trim();
  if (!instruction || instruction.length > 4_000) throw new Error("canvas_agent_prompt_preference_instruction_invalid");
  return instruction;
}

function normalizePreferenceKey(
  value: string | null | undefined,
  mediaKind: MediaKind,
  instruction: string,
  tags: string[],
) {
  const provided = String(value ?? "").trim();
  if (provided) {
    if (!/^[A-Za-z0-9_.:-]{1,120}$/.test(provided)) throw new Error("canvas_agent_prompt_preference_key_invalid");
    return provided;
  }
  return `media.${mediaKind}.${createHash("sha256").update(JSON.stringify({ instruction, tags })).digest("hex").slice(0, 24)}`;
}

function normalizeTags(value: unknown) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 20) throw new Error("canvas_agent_prompt_preference_tags_invalid");
  const tags = value.map((item) => String(item ?? "").trim());
  if (tags.some((tag) => !tag || tag.length > 40)) throw new Error("canvas_agent_prompt_preference_tags_invalid");
  return [...new Set(tags)];
}

function boundedLimit(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.min(100, Math.max(1, parsed)) : 50;
}

function serializePreference(row: PreferenceRow) {
  return {
    id: row.id,
    mediaKind: row.media_kind,
    preferenceKey: row.preference_key,
    instruction: row.instruction_text,
    tags: Array.isArray(row.tags_json) ? row.tags_json.map(String) : [],
    sourceCanvasId: row.source_canvas_id,
    confirmedAt: new Date(row.confirmed_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
