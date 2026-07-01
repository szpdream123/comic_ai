import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { __gptImageArtifactFinalizerTestUtils } from "../gpt-image.artifact-finalizer.ts";

describe("gpt-image artifact finalizer", () => {
  it("treats missing content-length as unknown instead of zero", () => {
    assert.equal(__gptImageArtifactFinalizerTestUtils.parseContentLength(null), null);
  });

  it("parses explicit content-length values", () => {
    assert.equal(__gptImageArtifactFinalizerTestUtils.parseContentLength("375784"), 375784);
    assert.equal(__gptImageArtifactFinalizerTestUtils.parseContentLength("0"), 0);
  });

  it("rejects uploaded artifacts when cloud storage still reports zero bytes", async () => {
    const runtime = {
      adapter: {
        async headObject() {
          return {
            exists: true,
            contentLength: 0,
          };
        },
      },
    };

    await assert.rejects(
      () => __gptImageArtifactFinalizerTestUtils.assertStoredArtifactAvailable(runtime as never, {
        bucket: "creator-test",
        objectKey: "AIManhuaDrama/20260630/image.png",
        sizeBytes: 431401,
      }),
      (error: unknown) => {
        assert.equal((error as { message?: string }).message, "gpt_image_storage_object_empty");
        assert.equal((error as { failureCode?: string }).failureCode, "provider_output_upload_failed");
        assert.equal(
          (error as { storageObjectKey?: string }).storageObjectKey,
          "AIManhuaDrama/20260630/image.png",
        );
        return true;
      },
    );
  });
});
