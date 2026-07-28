import { randomUUID } from "node:crypto";

import {
  assertCanvasActorAction,
  restoreCanvasActorScope,
} from "../identity/canvas-actor-scope.service.ts";
import { getCanvasSettings, updateCanvasSettings, type CanvasSettingsPatch } from "../project/canvas-settings.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type { CanvasAgentActor } from "./canvas-agent.types.ts";

type MediaKind = "text" | "image" | "video" | "audio";

export class CanvasAgentProviderConfigService {
  constructor(private readonly db: SqlDatabase) {}

  async createDraft(input: {
    canvasId: string;
    conversationId: string;
    actor: CanvasAgentActor;
    taskId: string;
    stepId: string;
    modelCode: string;
    mediaKind: MediaKind;
    generation?: Record<string, unknown>;
    now: Date;
  }) {
    const mediaKind = normalizeMediaKind(input.mediaKind);
    const modelCode = String(input.modelCode ?? "").trim();
    const scope = await restoreCanvasActorScope(this.db, {
      canvasId: input.canvasId,
      ownerUserId: input.actor.ownerUserId,
      actorTeamMemberId: input.actor.actorTeamMemberId ?? null,
    });
    assertCanvasActorAction(scope, "edit");
    const context = await queryOne<{ settings_revision: number | string }>(this.db, `
      SELECT canvas.settings_revision
      FROM canvas_agent_tasks task
      JOIN canvas_agent_steps step ON step.id=$5 AND step.task_id=task.id
      JOIN canvas_agent_conversations conversation ON conversation.id=task.conversation_id
      JOIN creator_canvas_projects canvas ON canvas.id=task.canvas_id
      WHERE task.id=$4 AND task.canvas_id=$1 AND task.conversation_id=$2
        AND task.owner_user_id=$3 AND task.actor_team_member_id IS NOT DISTINCT FROM $6
        AND conversation.deleted_at IS NULL AND canvas.deleted_at IS NULL
      LIMIT 1
    `, [input.canvasId, input.conversationId, input.actor.ownerUserId, input.taskId, input.stepId, input.actor.actorTeamMemberId ?? null]);
    if (!context) throw new Error("canvas_agent_provider_config_scope_invalid");
    const model = await queryOne<{ id: string; model_code: string; media_type: string }>(this.db, `
      SELECT id,model_code,media_type FROM ai_model_configs
      WHERE model_code=$1 AND status='active' LIMIT 1
    `, [modelCode]);
    if (!model) throw new Error("canvas_agent_provider_config_model_not_found");
    if (normalizeModelMediaKind(model.media_type) !== mediaKind) {
      throw new Error("canvas_agent_provider_config_media_mismatch");
    }
    const patch = buildSafeSettingsPatch(mediaKind, model.model_code, input.generation ?? {});
    const row = await queryOne<Record<string, unknown>>(this.db, `
      INSERT INTO canvas_agent_provider_config_drafts (
        id,canvas_id,conversation_id,owner_user_id,actor_team_member_id,
        task_id,step_id,model_config_id,model_code,media_kind,
        base_settings_revision,settings_patch_json,status,created_at,updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,'draft',$13,$13)
      ON CONFLICT (step_id) DO UPDATE SET updated_at=canvas_agent_provider_config_drafts.updated_at
      RETURNING *
    `, [
      randomUUID(), input.canvasId, input.conversationId, input.actor.ownerUserId,
      input.actor.actorTeamMemberId ?? null, input.taskId, input.stepId, model.id,
      model.model_code, mediaKind, Number(context.settings_revision), JSON.stringify(patch), input.now,
    ]);
    const draft = serializeDraft(row!);
    if (
      draft.canvasId !== input.canvasId
      || draft.conversationId !== input.conversationId
      || draft.taskId !== input.taskId
      || draft.modelCode !== model.model_code
      || draft.mediaKind !== mediaKind
      || canonicalJson(draft.settingsPatch) !== canonicalJson(patch)
    ) {
      throw new Error("canvas_agent_provider_config_idempotency_conflict");
    }
    return draft;
  }

  async applyDraft(input: {
    draftId: string;
    canvasId: string;
    conversationId: string;
    actor: CanvasAgentActor;
    now: Date;
  }) {
    const scope = await restoreCanvasActorScope(this.db, {
      canvasId: input.canvasId,
      ownerUserId: input.actor.ownerUserId,
      actorTeamMemberId: input.actor.actorTeamMemberId ?? null,
    });
    assertCanvasActorAction(scope, "edit");
    await this.db.query("BEGIN");
    try {
      const draft = await queryOne<Record<string, unknown>>(this.db, `
        SELECT * FROM canvas_agent_provider_config_drafts
        WHERE id=$1 AND canvas_id=$2 AND conversation_id=$3 AND owner_user_id=$4
          AND actor_team_member_id IS NOT DISTINCT FROM $5
        FOR UPDATE
      `, [input.draftId, input.canvasId, input.conversationId, input.actor.ownerUserId, input.actor.actorTeamMemberId ?? null]);
      if (!draft) throw new Error("canvas_agent_provider_config_draft_not_found");
      if (draft.status === "applied") {
        await this.db.query("COMMIT");
        return serializeDraft(draft);
      }
      if (draft.status !== "draft") throw new Error("canvas_agent_provider_config_draft_not_applicable");
      const activeModel = await queryOne<{ id: string }>(this.db, `
        SELECT id FROM ai_model_configs
        WHERE id=$1 AND model_code=$2 AND status='active'
        LIMIT 1
      `, [draft.model_config_id, draft.model_code]);
      if (!activeModel) throw new Error("canvas_agent_provider_config_model_not_found");
      const current = await getCanvasSettings(this.db, { actorScope: scope });
      if (current.revision !== Number(draft.base_settings_revision)) {
        throw new Error("canvas_agent_provider_config_revision_conflict");
      }
      const updated = await updateCanvasSettings(this.db, {
        actorScope: scope,
        expectedRevision: current.revision,
        patch: readRecord(draft.settings_patch_json) as CanvasSettingsPatch,
        now: input.now,
      });
      const applied = await queryOne<Record<string, unknown>>(this.db, `
        UPDATE canvas_agent_provider_config_drafts
        SET status='applied',applied_settings_revision=$2,applied_at=$3,updated_at=$3
        WHERE id=$1 RETURNING *
      `, [input.draftId, updated.revision, input.now]);
      await this.db.query("COMMIT");
      return serializeDraft(applied!);
    } catch (error) {
      await this.db.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }
}

function buildSafeSettingsPatch(mediaKind: MediaKind, modelCode: string, generation: Record<string, unknown>): CanvasSettingsPatch {
  const allowed = mediaKind === "image"
    ? new Set(["imageAspectRatio", "imageSize"])
    : mediaKind === "video" ? new Set(["videoResolution", "videoDuration"]) : new Set<string>();
  if (Object.keys(generation).some((key) => !allowed.has(key))) {
    throw new Error("canvas_agent_provider_config_field_not_allowed");
  }
  const generationPatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(generation)) {
    if (key === "videoDuration") {
      const duration = Number(value);
      if (!Number.isSafeInteger(duration) || duration < 1 || duration > 3600) throw new Error("canvas_agent_provider_config_value_invalid");
      generationPatch[key] = duration;
    } else {
      const text = String(value ?? "").trim();
      if (!text || text.length > 40) throw new Error("canvas_agent_provider_config_value_invalid");
      generationPatch[key] = text;
    }
  }
  return {
    defaultModels: { [mediaKind]: modelCode },
    ...(Object.keys(generationPatch).length ? { generation: generationPatch } : {}),
  };
}

function normalizeMediaKind(value: string): MediaKind {
  if (["text", "image", "video", "audio"].includes(value)) return value as MediaKind;
  throw new Error("canvas_agent_provider_config_media_invalid");
}

function normalizeModelMediaKind(value: string) {
  return value === "text" || value === "image" || value === "video" || value === "audio" ? value : "";
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try { return readRecord(JSON.parse(value)); } catch { return {}; }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function serializeDraft(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    canvasId: String(row.canvas_id),
    conversationId: String(row.conversation_id),
    taskId: String(row.task_id),
    stepId: String(row.step_id),
    modelCode: String(row.model_code),
    mediaKind: String(row.media_kind),
    baseSettingsRevision: Number(row.base_settings_revision),
    settingsPatch: readRecord(row.settings_patch_json),
    status: String(row.status),
    appliedSettingsRevision: row.applied_settings_revision == null ? null : Number(row.applied_settings_revision),
  };
}
