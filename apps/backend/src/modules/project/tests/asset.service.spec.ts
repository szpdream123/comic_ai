import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AssetValidationError,
  createAssetVersion,
  InMemoryAssetStore,
} from "../asset.service.ts";

describe("asset service", () => {
  it("creates immutable asset versions with monotonically increasing version numbers", async () => {
    const store = new InMemoryAssetStore();

    const first = await createAssetVersion(store, {
      organizationId: "org_1",
      projectId: "project_1",
      assetType: "character_sheet",
      assetKey: "hero-main",
      createdByUserId: "user_1",
      storageObjectKey: "assets/hero-main/v1.png",
      metadata: {
        mimeType: "image/png",
        width: 1024,
        height: 1024,
      },
      sourceTaskId: "task_1",
      sourceAttemptId: "attempt_1",
    });

    const second = await createAssetVersion(store, {
      organizationId: "org_1",
      projectId: "project_1",
      assetType: "character_sheet",
      assetKey: "hero-main",
      createdByUserId: "user_1",
      storageObjectKey: "assets/hero-main/v2.png",
      metadata: {
        mimeType: "image/png",
        width: 1024,
        height: 1024,
      },
      sourceTaskId: "task_2",
      sourceAttemptId: "attempt_2",
    });

    assert.equal(first.asset.assetKey, "hero-main");
    assert.equal(first.version.versionNumber, 1);
    assert.equal(second.asset.id, first.asset.id);
    assert.equal(second.version.versionNumber, 2);

    const versions = await store.listAssetVersions(first.asset.id);
    assert.deepEqual(
      versions.map((version) => ({
        versionNumber: version.versionNumber,
        storageObjectKey: version.storageObjectKey,
      })),
      [
        { versionNumber: 1, storageObjectKey: "assets/hero-main/v1.png" },
        { versionNumber: 2, storageObjectKey: "assets/hero-main/v2.png" },
      ],
    );
  });

  it("rejects asset version creation when required metadata is missing", async () => {
    const store = new InMemoryAssetStore();

    await assert.rejects(
      createAssetVersion(store, {
        organizationId: "org_1",
        projectId: "project_1",
        assetType: "prop_reference",
        assetKey: "sword-01",
        createdByUserId: "user_1",
        storageObjectKey: "assets/sword-01/v1.png",
        metadata: {
          mimeType: "",
          width: 0,
          height: 512,
        },
        sourceTaskId: "task_3",
        sourceAttemptId: "attempt_3",
      }),
      (error: unknown) => {
        assert.ok(error instanceof AssetValidationError);
        assert.deepEqual(error.fieldErrors, {
          mimeType: "metadata_required",
          width: "metadata_required",
        });
        return true;
      },
    );
  });
});
