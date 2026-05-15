import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  completeShotImageGeneration,
  createShotDraft,
  InMemoryShotStore,
  requestShotImageGeneration,
  reviseShotContent,
} from "../shot.service.ts";

describe("shot service", () => {
  it("updates the current image pointer only for the active task on the latest revision", async () => {
    const store = new InMemoryShotStore();
    const shot = await createShotDraft(store, {
      organizationId: "org_1",
      projectId: "project_1",
      title: "Shot 001",
      createdByUserId: "user_1",
    });

    const queued = await requestShotImageGeneration(store, {
      shotId: shot.id,
      taskId: "task_1",
    });

    const completed = await completeShotImageGeneration(store, {
      shotId: shot.id,
      taskId: "task_1",
      assetVersionId: "asset_version_1",
      requestedContentRevision: queued.activeImageRevision,
    });

    assert.equal(completed.currentImageAssetVersionId, "asset_version_1");
    assert.equal(completed.imageStatus, "completed");
    assert.deepEqual(completed.completedImageAssetVersionIds, ["asset_version_1"]);
  });

  it("keeps stale completions out of the current pointer while preserving history", async () => {
    const store = new InMemoryShotStore();
    const shot = await createShotDraft(store, {
      organizationId: "org_1",
      projectId: "project_1",
      title: "Shot 002",
      createdByUserId: "user_1",
    });

    await requestShotImageGeneration(store, {
      shotId: shot.id,
      taskId: "task_old",
    });

    await reviseShotContent(store, {
      shotId: shot.id,
    });

    const refreshed = await requestShotImageGeneration(store, {
      shotId: shot.id,
      taskId: "task_new",
    });

    const stale = await completeShotImageGeneration(store, {
      shotId: shot.id,
      taskId: "task_old",
      assetVersionId: "asset_version_old",
      requestedContentRevision: 1,
    });

    assert.equal(stale.currentImageAssetVersionId, null);
    assert.equal(stale.activeImageTaskId, refreshed.activeImageTaskId);
    assert.deepEqual(stale.completedImageAssetVersionIds, ["asset_version_old"]);

    const current = await completeShotImageGeneration(store, {
      shotId: shot.id,
      taskId: "task_new",
      assetVersionId: "asset_version_new",
      requestedContentRevision: refreshed.activeImageRevision,
    });

    assert.equal(current.currentImageAssetVersionId, "asset_version_new");
    assert.deepEqual(current.completedImageAssetVersionIds, [
      "asset_version_old",
      "asset_version_new",
    ]);
  });
});
