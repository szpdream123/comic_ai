import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildExportManifest,
  ExportManifestBlockedError,
} from "../export-manifest.service.ts";

describe("export manifest service", () => {
  it("builds a ready manifest when every shot has a current image asset", async () => {
    const manifest = buildExportManifest({
      projectId: "project_1",
      shots: [
        {
          shotId: "shot_1",
          title: "Shot 001",
          currentImageAssetVersionId: "asset_version_1",
        },
        {
          shotId: "shot_2",
          title: "Shot 002",
          currentImageAssetVersionId: "asset_version_2",
        },
      ],
    });

    assert.equal(manifest.status, "ready");
    assert.equal(manifest.allowPartialExport, false);
    assert.deepEqual(manifest.missingAssets, []);
    assert.equal(manifest.items.length, 2);
  });

  it("blocks export by default when required shot assets are missing", async () => {
    assert.throws(
      () =>
        buildExportManifest({
          projectId: "project_2",
          shots: [
            {
              shotId: "shot_1",
              title: "Shot 001",
              currentImageAssetVersionId: "asset_version_1",
            },
            {
              shotId: "shot_2",
              title: "Shot 002",
              currentImageAssetVersionId: null,
            },
          ],
        }),
      (error: unknown) => {
        assert.ok(error instanceof ExportManifestBlockedError);
        assert.deepEqual(error.missingAssets, [
          {
            shotId: "shot_2",
            title: "Shot 002",
            missing: "current_image_asset",
          },
        ]);
        return true;
      },
    );
  });

  it("supports explicit partial export confirmation while keeping missing assets visible", async () => {
    const manifest = buildExportManifest({
      projectId: "project_3",
      allowPartialExport: true,
      shots: [
        {
          shotId: "shot_1",
          title: "Shot 001",
          currentImageAssetVersionId: "asset_version_1",
        },
        {
          shotId: "shot_2",
          title: "Shot 002",
          currentImageAssetVersionId: null,
        },
      ],
    });

    assert.equal(manifest.status, "partial");
    assert.equal(manifest.allowPartialExport, true);
    assert.deepEqual(manifest.missingAssets, [
      {
        shotId: "shot_2",
        title: "Shot 002",
        missing: "current_image_asset",
      },
    ]);
    assert.deepEqual(manifest.items, [
      {
        shotId: "shot_1",
        title: "Shot 001",
        imageAssetVersionId: "asset_version_1",
      },
    ]);
  });
});
