import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { __gptImageArtifactFinalizerTestUtils } from "../gpt-image.artifact-finalizer.ts";

describe("gpt-image artifact finalizer", () => {
  it("uses a five-minute default image download timeout and keeps audio separate", () => {
    assert.equal(
      __gptImageArtifactFinalizerTestUtils.readArtifactDownloadTimeoutMs({}, "image"),
      5 * 60_000,
    );
    assert.equal(
      __gptImageArtifactFinalizerTestUtils.readArtifactDownloadTimeoutMs({}, "audio"),
      120_000,
    );
    assert.equal(
      __gptImageArtifactFinalizerTestUtils.readArtifactDownloadTimeoutMs(
        { GENERATION_ARTIFACT_DOWNLOAD_TIMEOUT_MS: "420000" },
        "image",
      ),
      420_000,
    );
  });

  it("uses a thirty-minute generation artifact upload timeout by default", () => {
    assert.equal(
      __gptImageArtifactFinalizerTestUtils.readGenerationArtifactUploadConfig({}).retryAttempts,
      10,
    );
    assert.equal(
      __gptImageArtifactFinalizerTestUtils.readGenerationArtifactUploadConfig({}).retryDelayMs,
      3000,
    );
    assert.equal(
      __gptImageArtifactFinalizerTestUtils.readGenerationArtifactUploadConfig({}).uploadTimeoutMs,
      30 * 60_000,
    );
    assert.equal(
      __gptImageArtifactFinalizerTestUtils.readGenerationArtifactUploadConfig({
        GENERATION_ARTIFACT_UPLOAD_TIMEOUT_MS: "900000",
      }).uploadTimeoutMs,
      900_000,
    );
  });

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

  it("applies a 64 MiB image cap and requires image content", () => {
    const limits = __gptImageArtifactFinalizerTestUtils.readArtifactValidationConfig("image");
    assert.deepEqual(limits, {
      maxBytes: 64 * 1024 * 1024,
      requiredContentTypePrefix: "image/",
    });
    assert.throws(
      () => __gptImageArtifactFinalizerTestUtils.assertProviderArtifactDownloadMetadata({
        contentType: "application/json",
        contentLength: 128,
        ...limits,
      }),
      /provider_artifact_mime_invalid/,
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
      /provider_artifact_mime_invalid/,
    );

    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(6));
        controller.enqueue(new Uint8Array(6));
        controller.close();
      },
    });
    await assert.rejects(
      () => __gptImageArtifactFinalizerTestUtils.readProviderArtifactBytes(source, 10),
      (error: unknown) => {
        assert.equal((error as { message?: string }).message, "provider_artifact_too_large");
        assert.equal((error as { failureCode?: string }).failureCode, "provider_output_download_failed");
        return true;
      },
    );
  });

  it("forwards provider download stream timeouts to the upload consumer", async () => {
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(Object.assign(new Error("provider download timed out"), {
          name: "TimeoutError",
        }));
      },
    });
    await assert.rejects(
      () => __gptImageArtifactFinalizerTestUtils.readProviderArtifactBytes(source),
      (error: unknown) => {
        assert.equal((error as { name?: string }).name, "TimeoutError");
        assert.equal(
          (error as { failureCode?: string }).failureCode,
          "provider_output_download_failed",
        );
        return true;
      },
    );
  });

  it("cancels a provider response reader when the stream fails", async () => {
    let canceledWith: unknown = null;
    const body = {
      getReader() {
        return {
          async read() {
            throw Object.assign(new Error("provider download timed out"), {
              name: "TimeoutError",
            });
          },
          async cancel(reason: unknown) {
            canceledWith = reason;
          },
          releaseLock() {},
        };
      },
    } as unknown as ReadableStream<Uint8Array>;

    await assert.rejects(
      () => __gptImageArtifactFinalizerTestUtils.readProviderArtifactBytes(body),
      /provider download timed out/,
    );
    assert.equal((canceledWith as { name?: string })?.name, "TimeoutError");
  });
});
