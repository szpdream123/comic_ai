import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export interface EpisodeGenerationDraft {
  draftId: string;
  organizationId: string;
  workspaceId: string;
  projectId: string;
  episodeId: string;
  targetType: "asset" | "storyboard";
  targetId: string;
  prompt: string;
  mode: "image" | "video" | "lip_sync";
  payload: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface EpisodeGenerationDraftRow {
  id: string;
  organization_id: string;
  workspace_id: string;
  project_id: string;
  episode_id: string;
  target_type: "asset" | "storyboard";
  target_id: string;
  prompt: string;
  mode: "image" | "video" | "lip_sync";
  payload_json: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export async function upsertEpisodeGenerationDraft(
  db: SqlDatabase,
  input: {
    organizationId: string;
    workspaceId: string;
    projectId: string;
    episodeId: string;
    targetType: "asset" | "storyboard";
    targetId: string;
    prompt?: string | null;
    mode?: "image" | "video" | "lip_sync" | null;
    payload?: Record<string, unknown> | null;
    createdByUserId?: string | null;
    now: Date;
  },
): Promise<EpisodeGenerationDraft> {
  const row = await queryOne<EpisodeGenerationDraftRow>(
    db,
    `
      INSERT INTO episode_generation_drafts (
        id,
        organization_id,
        workspace_id,
        project_id,
        episode_id,
        target_type,
        target_id,
        prompt,
        mode,
        payload_json,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $12)
      ON CONFLICT (organization_id, episode_id, target_type, target_id, mode)
      DO UPDATE SET
        prompt = EXCLUDED.prompt,
        mode = EXCLUDED.mode,
        payload_json = EXCLUDED.payload_json,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `,
    [
      randomUUID(),
      input.organizationId,
      input.workspaceId,
      input.projectId,
      input.episodeId,
      input.targetType,
      input.targetId,
      input.prompt?.trim() ?? "",
      input.mode ?? "image",
      JSON.stringify(input.payload ?? {}),
      input.createdByUserId ?? null,
      input.now,
    ],
  );

  return episodeGenerationDraftFromRow(row!);
}

function episodeGenerationDraftFromRow(row: EpisodeGenerationDraftRow): EpisodeGenerationDraft {
  return {
    draftId: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    episodeId: row.episode_id,
    targetType: row.target_type,
    targetId: row.target_id,
    prompt: row.prompt,
    mode: row.mode,
    payload: row.payload_json ?? {},
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
