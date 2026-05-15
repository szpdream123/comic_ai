import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InMemoryAssetStore } from "../asset.service.ts";
import {
  finalizeShotVideoGeneration,
  GenerationVideoRuleError,
  startShotVideoGeneration,
} from "../shot-video-generation.service.ts";
import {
  completeShotImageGeneration,
  createShotDraft,
  InMemoryShotStore,
  requestShotImageGeneration,
} from "../shot.service.ts";

describe("shot video generation service", () => {
  it("rejects video generation when the shot has no current image", async () => {
    const shotStore = new InMemoryShotStore();
    const shot = await createShotDraft(shotStore, {
      organizationId: "org_1",
      projectId: "project_1",
      title: "Shot 001",
      createdByUserId: "user_1",
    });

    await assert.rejects(
      startShotVideoGeneration(shotStore, {
        shotId: shot.id,
        taskId: "video_task_1",
      }),
      (error: unknown) => {
        assert.ok(error instanceof GenerationVideoRuleError);
        assert.equal(error.code, "current_image_required");
        return true;
      },
    );
  });

  it("creates a video asset version when current image exists", async () => {
    const assetStore = new InMemoryAssetStore();
    const shotStore = new InMemoryShotStore();
    const shot = await createShotWithCurrentImage(shotStore);

    const started = await startShotVideoGeneration(shotStore, {
      shotId: shot.id,
      taskId: "video_task_1",
    });

    const result = await finalizeShotVideoGeneration(assetStore, shotStore, {
      organizationId: "org_1",
      projectId: "project_1",
      createdByUserId: "user_1",
      shotId: shot.id,
      taskId: "video_task_1",
      requestedImageAssetVersionId: started.currentImageAssetVersionId ?? "",
      status: "succeeded",
      storageObjectKey: "generated/shot-001.mp4",
      metadata: {
        mimeType: "video/mp4",
        width: 720,
        height: 1280,
      },
      sourceAttemptId: "video_attempt_1",
    });

    assert.equal(result.status, "completed");
    assert.equal(result.asset.assetType, "shot_video");
    assert.equal(result.version.versionNumber, 1);

    const updated = await shotStore.findShot(shot.id);
    assert.equal(updated?.videoStatus, "completed");
    assert.equal(updated?.currentVideoAssetVersionId, result.version.id);
  });

  it("keeps stale video completions from replacing the current video pointer", async () => {
    const assetStore = new InMemoryAssetStore();
    const shotStore = new InMemoryShotStore();
    const shot = await createShotWithCurrentImage(shotStore);

    const oldVideo = await startShotVideoGeneration(shotStore, {
      shotId: shot.id,
      taskId: "video_task_old",
    });

    const updatedImage = await requestShotImageGeneration(shotStore, {
      shotId: shot.id,
      taskId: "image_task_new",
    });
    await completeShotImageGeneration(shotStore, {
      shotId: shot.id,
      taskId: "image_task_new",
      assetVersionId: "image_version_new",
      requestedContentRevision: updatedImage.activeImageRevision ?? 1,
    });

    const currentVideo = await startShotVideoGeneration(shotStore, {
      shotId: shot.id,
      taskId: "video_task_new",
    });

    const stale = await finalizeShotVideoGeneration(assetStore, shotStore, {
      organizationId: "org_1",
      projectId: "project_1",
      createdByUserId: "user_1",
      shotId: shot.id,
      taskId: "video_task_old",
      requestedImageAssetVersionId: oldVideo.currentImageAssetVersionId ?? "",
      status: "succeeded",
      storageObjectKey: "generated/shot-001-old.mp4",
      metadata: { mimeType: "video/mp4", width: 720, height: 1280 },
      sourceAttemptId: "video_attempt_old",
    });
    assert.equal(stale.status, "stale");

    const current = await finalizeShotVideoGeneration(assetStore, shotStore, {
      organizationId: "org_1",
      projectId: "project_1",
      createdByUserId: "user_1",
      shotId: shot.id,
      taskId: "video_task_new",
      requestedImageAssetVersionId: currentVideo.currentImageAssetVersionId ?? "",
      status: "succeeded",
      storageObjectKey: "generated/shot-001-new.mp4",
      metadata: { mimeType: "video/mp4", width: 720, height: 1280 },
      sourceAttemptId: "video_attempt_new",
    });

    const updated = await shotStore.findShot(shot.id);
    assert.equal(updated?.currentVideoAssetVersionId, current.version?.id);
    assert.notEqual(updated?.currentVideoAssetVersionId, stale.version?.id);
  });
});

async function createShotWithCurrentImage(shotStore: InMemoryShotStore) {
  const shot = await createShotDraft(shotStore, {
    organizationId: "org_1",
    projectId: "project_1",
    title: "Shot 001",
    createdByUserId: "user_1",
  });
  const started = await requestShotImageGeneration(shotStore, {
    shotId: shot.id,
    taskId: "image_task_1",
  });

  return completeShotImageGeneration(shotStore, {
    shotId: shot.id,
    taskId: "image_task_1",
    assetVersionId: "image_version_1",
    requestedContentRevision: started.activeImageRevision ?? 1,
  });
}
