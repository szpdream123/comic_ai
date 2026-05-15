import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAssetVersion, InMemoryAssetStore } from "../asset.service.ts";
import { createCalibrationSession, markCalibrationItemReviewed, passCalibrationSession } from "../calibration.service.ts";
import {
  finalizeShotImageGenerationBatch,
  GenerationRuleError,
  startShotImageGenerationBatch,
} from "../shot-image-generation.service.ts";
import { createShotDraft, InMemoryShotStore } from "../shot.service.ts";

describe("shot image generation service", () => {
  it("rejects image generation until calibration is passed or skipped", async () => {
    const shotStore = new InMemoryShotStore();
    const shot = await createShotDraft(shotStore, {
      organizationId: "org_1",
      projectId: "project_1",
      title: "Shot 001",
      createdByUserId: "user_1",
    });
    const calibration = createCalibrationSession({
      organizationId: "org_1",
      projectId: "project_1",
      shotIds: ["shot_1", "shot_2", "shot_3"],
      createdByUserId: "user_1",
    });

    await assert.rejects(
      startShotImageGenerationBatch(shotStore, {
        calibration,
        requests: [{ shotId: shot.id, taskId: "task_1" }],
      }),
      (error: unknown) => {
        assert.ok(error instanceof GenerationRuleError);
        assert.equal(error.code, "calibration_gate_not_open");
        return true;
      },
    );
  });

  it("finalizes successful image results into asset versions and current image pointers", async () => {
    const assetStore = new InMemoryAssetStore();
    const shotStore = new InMemoryShotStore();
    const shot = await createShotDraft(shotStore, {
      organizationId: "org_1",
      projectId: "project_1",
      title: "Shot 001",
      createdByUserId: "user_1",
    });
    const calibration = createPassedCalibration();
    const [started] = await startShotImageGenerationBatch(shotStore, {
      calibration,
      requests: [{ shotId: shot.id, taskId: "task_1" }],
    });

    const result = await finalizeShotImageGenerationBatch(assetStore, shotStore, {
      organizationId: "org_1",
      projectId: "project_1",
      createdByUserId: "user_1",
      results: [
        {
          shotId: shot.id,
          taskId: "task_1",
          requestedContentRevision: started.activeImageRevision,
          status: "succeeded",
          storageObjectKey: "generated/shot-001.png",
          metadata: {
            mimeType: "image/png",
            width: 720,
            height: 1280,
          },
          sourceAttemptId: "attempt_1",
        },
      ],
    });

    assert.deepEqual(result.failures, []);
    assert.equal(result.successes.length, 1);
    assert.equal(result.successes[0]?.asset.assetType, "shot_image");
    assert.equal(result.successes[0]?.version.versionNumber, 1);

    const updatedShot = await shotStore.findShot(shot.id);
    assert.equal(updatedShot?.currentImageAssetVersionId, result.successes[0]?.version.id);
  });

  it("keeps partial failures visible without blocking successful shots", async () => {
    const assetStore = new InMemoryAssetStore();
    const shotStore = new InMemoryShotStore();
    const firstShot = await createShotDraft(shotStore, {
      organizationId: "org_1",
      projectId: "project_1",
      title: "Shot 001",
      createdByUserId: "user_1",
    });
    const secondShot = await createShotDraft(shotStore, {
      organizationId: "org_1",
      projectId: "project_1",
      title: "Shot 002",
      createdByUserId: "user_1",
    });
    const calibration = createPassedCalibration();
    const started = await startShotImageGenerationBatch(shotStore, {
      calibration,
      requests: [
        { shotId: firstShot.id, taskId: "task_success" },
        { shotId: secondShot.id, taskId: "task_failed" },
      ],
    });

    const result = await finalizeShotImageGenerationBatch(assetStore, shotStore, {
      organizationId: "org_1",
      projectId: "project_1",
      createdByUserId: "user_1",
      results: [
        {
          shotId: firstShot.id,
          taskId: "task_success",
          requestedContentRevision: started[0]?.activeImageRevision ?? 1,
          status: "succeeded",
          storageObjectKey: "generated/shot-001.png",
          metadata: { mimeType: "image/png", width: 720, height: 1280 },
          sourceAttemptId: "attempt_success",
        },
        {
          shotId: secondShot.id,
          taskId: "task_failed",
          requestedContentRevision: started[1]?.activeImageRevision ?? 1,
          status: "failed",
          failureCode: "provider_timeout",
        },
      ],
    });

    assert.equal(result.successes.length, 1);
    assert.deepEqual(result.failures, [
      { shotId: secondShot.id, taskId: "task_failed", failureCode: "provider_timeout" },
    ]);

    const firstUpdated = await shotStore.findShot(firstShot.id);
    const secondUpdated = await shotStore.findShot(secondShot.id);
    assert.ok(firstUpdated?.currentImageAssetVersionId);
    assert.equal(secondUpdated?.currentImageAssetVersionId, null);
  });
});

function createPassedCalibration() {
  let calibration = createCalibrationSession({
    organizationId: "org_1",
    projectId: "project_1",
    shotIds: ["shot_1", "shot_2", "shot_3"],
    createdByUserId: "user_1",
  });

  for (const item of calibration.items) {
    calibration = markCalibrationItemReviewed(calibration, {
      shotId: item.shotId,
      qualityReviewResult: "passed",
    });
  }

  return passCalibrationSession(calibration, {
    decidedByUserId: "user_1",
  });
}
