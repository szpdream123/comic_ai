import {
  createAssetVersion,
  type AssetRecord,
  type AssetVersionRecord,
  type InMemoryAssetStore,
} from "./asset.service.ts";
import type { InMemoryShotStore, ShotRecord } from "./shot.service.ts";

export class GenerationVideoRuleError extends Error {
  constructor(readonly code: "current_image_required" | "shot_not_found") {
    super(code);
  }
}

export interface ShotVideoGenerationResult {
  status: "completed" | "failed" | "stale";
  shot: ShotRecord;
  asset?: AssetRecord;
  version?: AssetVersionRecord;
  failureCode?: string;
}

export async function startShotVideoGeneration(
  shotStore: InMemoryShotStore,
  input: {
    shotId: string;
    taskId: string;
  },
): Promise<ShotRecord> {
  const shot = await findShotOrThrow(shotStore, input.shotId);
  if (!shot.currentImageAssetVersionId) {
    throw new GenerationVideoRuleError("current_image_required");
  }

  return shotStore.saveShot({
    ...shot,
    videoStatus: "generating",
    activeVideoTaskId: input.taskId,
    activeVideoImageAssetVersionId: shot.currentImageAssetVersionId,
  });
}

export async function finalizeShotVideoGeneration(
  assetStore: InMemoryAssetStore,
  shotStore: InMemoryShotStore,
  input: {
    organizationId: string;
    projectId: string;
    createdByUserId: string;
    shotId: string;
    taskId: string;
    requestedImageAssetVersionId: string;
    status: "succeeded" | "failed";
    storageObjectKey?: string;
    metadata?: {
      mimeType: string;
      width: number;
      height: number;
    };
    sourceAttemptId?: string;
    failureCode?: string;
  },
): Promise<ShotVideoGenerationResult> {
  const shot = await findShotOrThrow(shotStore, input.shotId);

  if (input.status === "failed") {
    const updated = await shotStore.saveShot({
      ...shot,
      videoStatus: isCurrentVideoTask(shot, input) ? "failed" : shot.videoStatus,
      activeVideoTaskId: isCurrentVideoTask(shot, input) ? null : shot.activeVideoTaskId,
      activeVideoImageAssetVersionId: isCurrentVideoTask(shot, input)
        ? null
        : shot.activeVideoImageAssetVersionId,
    });

    return {
      status: "failed",
      shot: updated,
      failureCode: input.failureCode ?? "generation_failed",
    };
  }

  const assetVersion = await createAssetVersion(assetStore, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    assetType: "shot_video",
    assetKey: input.shotId,
    createdByUserId: input.createdByUserId,
    storageObjectKey: requireField(input.storageObjectKey, "storage_object_key_required"),
    metadata: requireField(input.metadata, "metadata_required"),
    sourceTaskId: input.taskId,
    sourceAttemptId: requireField(input.sourceAttemptId, "source_attempt_required"),
  });

  const freshShot = await findShotOrThrow(shotStore, input.shotId);
  const completedVideoAssetVersionIds = [
    ...freshShot.completedVideoAssetVersionIds,
    assetVersion.version.id,
  ];
  const isCurrent = isCurrentVideoTask(freshShot, input);
  const updated = await shotStore.saveShot({
    ...freshShot,
    completedVideoAssetVersionIds,
    currentVideoAssetVersionId: isCurrent
      ? assetVersion.version.id
      : freshShot.currentVideoAssetVersionId,
    videoStatus: isCurrent ? "completed" : freshShot.videoStatus,
    activeVideoTaskId: isCurrent ? null : freshShot.activeVideoTaskId,
    activeVideoImageAssetVersionId: isCurrent
      ? null
      : freshShot.activeVideoImageAssetVersionId,
  });

  return {
    status: isCurrent ? "completed" : "stale",
    shot: updated,
    asset: assetVersion.asset,
    version: assetVersion.version,
  };
}

async function findShotOrThrow(shotStore: InMemoryShotStore, shotId: string) {
  const shot = await shotStore.findShot(shotId);
  if (!shot) {
    throw new GenerationVideoRuleError("shot_not_found");
  }
  return shot;
}

function isCurrentVideoTask(
  shot: ShotRecord,
  input: {
    taskId: string;
    requestedImageAssetVersionId: string;
  },
) {
  return (
    shot.activeVideoTaskId === input.taskId &&
    shot.activeVideoImageAssetVersionId === input.requestedImageAssetVersionId &&
    shot.currentImageAssetVersionId === input.requestedImageAssetVersionId
  );
}

function requireField<T>(value: T | undefined, code: string): T {
  if (value === undefined) {
    throw new Error(code);
  }
  return value;
}
