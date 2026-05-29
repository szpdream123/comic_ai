import { resolveActorContext } from "../organization/actor-context.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { computeAssetReviewSummary } from "./asset-review.service.ts";
import {
  assetReviewStateFromRecords,
  listAssetReviewCandidatesForProject,
} from "./asset-review-record.service.ts";
import { getLatestCalibrationSessionForProject } from "./calibration-record.service.ts";
import {
  CreatorDevApp,
  type CreatorDevStateSnapshot,
} from "./creator-dev-app.ts";
import { listShotsForProject } from "./shot-record.service.ts";

export async function hydrateStateFromSql(
  db: SqlDatabase,
  state: CreatorDevStateSnapshot,
  input: {
    projectId: string;
    scriptId: string | null;
    sessionToken: string;
    now: Date;
  },
): Promise<CreatorDevStateSnapshot> {
  const sqlState = await loadCreatorStateFromSql(db, input);
  const assetCandidates =
    sqlState.assetCandidates ?? state.assetCandidates;

  return {
    ...state,
    project: sqlState.bundle?.project ?? state.project,
    script: sqlState.bundle?.script ?? state.script,
    shots:
      sqlState.shots.length > 0
        ? sqlState.shots.map((shot) => ({
            id: shot.id,
            episodeId: shot.episodeId,
            title: shot.title,
            contentRevision: shot.contentRevision,
            imageStatus: shot.imageStatus,
            videoStatus: shot.videoStatus,
            currentImageAssetVersionId: shot.currentImageAssetVersionId,
            currentVideoAssetVersionId: shot.currentVideoAssetVersionId,
          }))
        : state.shots,
    calibration: sqlState.calibration ?? state.calibration,
    assetCandidates,
    assetReview: assetCandidates
      ? computeAssetReviewSummary(assetCandidates)
      : state.assetReview,
  };
}

export async function seedCreatorAppFromSql(
  db: SqlDatabase,
  creatorApp: CreatorDevApp,
  input: {
    projectId: string;
    scriptId: string | null;
    sessionToken: string;
    now: Date;
  },
) {
  const sqlState = await loadCreatorStateFromSql(db, input);
  if (!sqlState.bundle?.project || !sqlState.bundle.script) {
    return null;
  }

  await creatorApp.seedState({
    bundle: {
      project: sqlState.bundle.project,
      script: sqlState.bundle.script,
    },
    assetCandidates: sqlState.assetCandidates,
    calibration: sqlState.calibration,
    shots: sqlState.shots,
  });
  return sqlState;
}

async function loadCreatorStateFromSql(
  db: SqlDatabase,
  input: {
    projectId: string;
    scriptId: string | null;
    sessionToken: string;
    now: Date;
  },
) {
  const actor = await resolveActorContext(db, {
    sessionToken: input.sessionToken,
    projectId: input.projectId,
    now: input.now,
  });
  const records = await listAssetReviewCandidatesForProject(db, {
    organizationId: actor.organizationId,
    projectId: input.projectId,
  });
  const projectBundle = await loadProjectBundleFromSql(db, {
    projectId: input.projectId,
    scriptId: input.scriptId,
  });
  const shots = await listShotsForProject(db, {
    organizationId: actor.organizationId,
    projectId: input.projectId,
  });
  const calibration = await getLatestCalibrationSessionForProject(db, {
    organizationId: actor.organizationId,
    projectId: input.projectId,
  });

  return {
    bundle: projectBundle,
    assetCandidates:
      records.length > 0 ? assetReviewStateFromRecords(records) : null,
    shots,
    calibration: calibration ?? null,
  };
}

export async function loadProjectBundleFromSql(
  db: SqlDatabase,
  input: {
    projectId: string;
    scriptId: string | null;
  },
): Promise<{
  project: CreatorDevStateSnapshot["project"];
  script: CreatorDevStateSnapshot["script"];
} | null> {
  const projectResult = await db.query<{
    id: string;
    organization_id: string;
    workspace_id: string;
    name: string;
    cover_image_url: string | null;
    cover_storage_object_id: string | null;
    aspect_ratio: string;
    resolution: string;
    phase: "script_input" | "asset_review" | "shot_generation" | "export";
    created_by_user_id: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(
    `
      SELECT *
      FROM projects
      WHERE id = $1
      LIMIT 1
    `,
    [input.projectId],
  );
  const project = projectResult.rows[0];
  if (!project) {
    return null;
  }

  const scriptResult = await db.query<{
    id: string;
    organization_id: string;
    project_id: string;
    status: "draft" | "ready" | "parsed" | "failed";
    input_text: string;
    created_by_user_id: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(
    `
      SELECT *
      FROM scripts
      WHERE project_id = $1
        AND ($2::uuid IS NULL OR id = $2::uuid)
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [input.projectId, input.scriptId],
  );
  const script = scriptResult.rows[0];

  return {
    project: {
      id: project.id,
      organizationId: project.organization_id,
      workspaceId: project.workspace_id,
      name: project.name,
      coverImageUrl: project.cover_image_url,
      coverStorageObjectId: project.cover_storage_object_id,
      aspectRatio: project.aspect_ratio,
      resolution: project.resolution,
      phase: project.phase,
      createdByUserId: project.created_by_user_id,
      createdAt: new Date(project.created_at),
      updatedAt: new Date(project.updated_at),
    },
    script: script
      ? {
          id: script.id,
          organizationId: script.organization_id,
          projectId: script.project_id,
          status: script.status,
          inputText: script.input_text,
          createdByUserId: script.created_by_user_id,
          createdAt: new Date(script.created_at),
          updatedAt: new Date(script.updated_at),
        }
      : null,
  };
}
