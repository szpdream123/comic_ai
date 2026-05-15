import {
  createAssetVersion,
  type AssetRecord,
  type AssetVersionRecord,
  type InMemoryAssetStore,
} from "./asset.service.ts";
import type { CalibrationSessionRecord } from "./calibration.service.ts";
import {
  completeShotImageGeneration,
  type InMemoryShotStore,
  requestShotImageGeneration,
  type ShotRecord,
} from "./shot.service.ts";

export class GenerationRuleError extends Error {
  constructor(readonly code: "calibration_gate_not_open") {
    super(code);
  }
}

export interface ShotImageGenerationSuccess {
  shot: ShotRecord;
  asset: AssetRecord;
  version: AssetVersionRecord;
}

export interface ShotImageGenerationFailure {
  shotId: string;
  taskId: string;
  failureCode: string;
}

export async function startShotImageGenerationBatch(
  shotStore: InMemoryShotStore,
  input: {
    calibration: CalibrationSessionRecord;
    requests: Array<{
      shotId: string;
      taskId: string;
    }>;
  },
) {
  if (!["passed", "skipped"].includes(input.calibration.status)) {
    throw new GenerationRuleError("calibration_gate_not_open");
  }

  const started: ShotRecord[] = [];
  for (const request of input.requests) {
    started.push(
      await requestShotImageGeneration(shotStore, {
        shotId: request.shotId,
        taskId: request.taskId,
      }),
    );
  }

  return started;
}

export async function finalizeShotImageGenerationBatch(
  assetStore: InMemoryAssetStore,
  shotStore: InMemoryShotStore,
  input: {
    organizationId: string;
    projectId: string;
    createdByUserId: string;
    results: Array<
      | {
          shotId: string;
          taskId: string;
          requestedContentRevision: number;
          status: "succeeded";
          storageObjectKey: string;
          metadata: {
            mimeType: string;
            width: number;
            height: number;
          };
          sourceAttemptId: string;
        }
      | {
          shotId: string;
          taskId: string;
          requestedContentRevision: number;
          status: "failed";
          failureCode: string;
        }
    >;
  },
) {
  const successes: ShotImageGenerationSuccess[] = [];
  const failures: ShotImageGenerationFailure[] = [];

  for (const result of input.results) {
    if (result.status === "failed") {
      failures.push({
        shotId: result.shotId,
        taskId: result.taskId,
        failureCode: result.failureCode,
      });
      continue;
    }

    const assetVersion = await createAssetVersion(assetStore, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      assetType: "shot_image",
      assetKey: result.shotId,
      createdByUserId: input.createdByUserId,
      storageObjectKey: result.storageObjectKey,
      metadata: result.metadata,
      sourceTaskId: result.taskId,
      sourceAttemptId: result.sourceAttemptId,
    });

    const shot = await completeShotImageGeneration(shotStore, {
      shotId: result.shotId,
      taskId: result.taskId,
      assetVersionId: assetVersion.version.id,
      requestedContentRevision: result.requestedContentRevision,
    });

    successes.push({
      shot,
      asset: assetVersion.asset,
      version: assetVersion.version,
    });
  }

  return { successes, failures };
}
