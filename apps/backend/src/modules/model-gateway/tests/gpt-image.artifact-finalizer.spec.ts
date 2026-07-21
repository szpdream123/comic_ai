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

  it("rejects oversized audio artifacts from content-length before upload", () => {
    assert.throws(
      () => __gptImageArtifactFinalizerTestUtils.assertProviderArtifactDownloadMetadata({
        contentType: "audio/mpeg",
        contentLength: 100 * 1024 * 1024 + 1,
        maxBytes: 100 * 1024 * 1024,
        requiredContentTypePrefix: "audio/",
      }),
      (error: unknown) => {
        assert.equal((error as { message?: string }).message, "provider_artifact_too_large");
        assert.equal((error as { failureCode?: string }).failureCode, "provider_output_download_failed");
        return true;
      },
    );
  });

  it("rejects non-audio provider content and streaming bodies that cross the audio cap", async () => {
    assert.throws(
      () => __gptImageArtifactFinalizerTestUtils.assertProviderArtifactDownloadMetadata({
        contentType: "application/json",
        contentLength: 128,
        maxBytes: 100 * 1024 * 1024,
        requiredContentTypePrefix: "audio/",
      }),
      /audio_artifact_mime_invalid/,
    );

    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(6));
        controller.enqueue(new Uint8Array(6));
        controller.close();
      },
    });
    const counted = __gptImageArtifactFinalizerTestUtils.createCountingUploadStream(source, 10);
    await assert.rejects(
      async () => {
        for await (const _chunk of counted.stream) {
          // Consume the stream so the byte cap is enforced by the transform.
        }
      },
      (error: unknown) => {
        assert.equal((error as { message?: string }).message, "provider_artifact_too_large");
        assert.equal((error as { failureCode?: string }).failureCode, "provider_output_download_failed");
        return true;
      },
    );
  });
});
