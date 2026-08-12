import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  __gptImageArtifactFinalizerTestUtils,
  persistGptImageArtifact,
} from "../gpt-image.artifact-finalizer.ts";

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

  it("uses the image-specific generation artifact upload timeout", () => {
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
    assert.equal(
      __gptImageArtifactFinalizerTestUtils.readGenerationArtifactUploadConfig({
        GENERATION_ARTIFACT_UPLOAD_TIMEOUT_MS: "1800000",
        GENERATION_IMAGE_ARTIFACT_UPLOAD_TIMEOUT_MS: "300000",
      }).uploadTimeoutMs,
      300_000,
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
        invalidMimeMessage: "provider_artifact_mime_invalid",
        ...limits,
      }),
      /provider_artifact_mime_invalid/,
    );
  });

  it("rejects oversized and non-image base64 artifacts before decoding", () => {
    const limits = {
      ...__gptImageArtifactFinalizerTestUtils.readArtifactValidationConfig("image"),
      maxBytes: 10,
    };
    assert.throws(
      () => __gptImageArtifactFinalizerTestUtils.decodeProviderArtifactBytes({
        mediaType: "image",
        mimeType: "image/png",
        b64Json: "A".repeat(16),
      }, {
        contentType: "image/png",
        mediaKind: "image",
        ...limits,
      }),
      /provider_artifact_too_large/,
    );
    assert.throws(
      () => __gptImageArtifactFinalizerTestUtils.decodeProviderArtifactBytes({
        mediaType: "image",
        mimeType: "application/json",
        b64Json: "e30=",
      }, {
        contentType: "application/json",
        mediaKind: "image",
        ...limits,
      }),
      /provider_artifact_mime_invalid/,
    );
    assert.throws(
      () => __gptImageArtifactFinalizerTestUtils.decodeProviderArtifactBytes({
        mediaType: "image",
        mimeType: "image/png",
        b64Json: "not*base64",
      }, {
        contentType: "image/png",
        mediaKind: "image",
        ...limits,
      }),
      /provider_artifact_base64_invalid/,
    );
    assert.throws(
      () => __gptImageArtifactFinalizerTestUtils.decodeProviderArtifactBytes({
        mediaType: "image",
        mimeType: "image/png",
        b64Json: "e30=",
      }, {
        contentType: "image/png",
        mediaKind: "image",
        ...limits,
      }),
      /provider_artifact_content_invalid/,
    );
  });

  it("caps each recovery I/O attempt at the remaining six-hour window", () => {
    const deadline = new Date("2026-08-03T16:00:00.000Z");
    assert.equal(
      __gptImageArtifactFinalizerTestUtils.resolveRecoveryAttemptTimeoutMs(
        30 * 60_000,
        deadline,
        new Date("2026-08-03T15:58:00.000Z"),
      ),
      2 * 60_000,
    );
    assert.throws(
      () => __gptImageArtifactFinalizerTestUtils.resolveRecoveryAttemptTimeoutMs(
        30 * 60_000,
        deadline,
        deadline,
      ),
      /artifact_recovery_deadline_reached/,
    );
  });

  it("marks deterministic image artifact failures as unrecoverable for BullMQ", () => {
    const source = Object.assign(new Error("provider_artifact_mime_invalid"), {
      failureCode: "provider_output_download_failed",
    });
    const error = __gptImageArtifactFinalizerTestUtils.toUnrecoverableImageArtifactError(source);
    assert.equal((error as Error).name, "UnrecoverableError");
    assert.equal((error as { failureCode?: string }).failureCode, "provider_output_download_failed");
  });

  it("does not start the storage HEAD check after the recovery deadline", async () => {
    let headCalls = 0;
    const runtime = {
      adapter: {
        async headObject() {
          headCalls += 1;
          return { exists: true, contentLength: 1 };
        },
      },
    };
    await assert.rejects(
      () => __gptImageArtifactFinalizerTestUtils.assertStoredArtifactAvailable(runtime as never, {
        bucket: "creator-test",
        objectKey: "image.png",
        sizeBytes: 1,
        recoveryDeadlineAt: new Date("2000-01-01T00:00:00.000Z"),
      }),
      /artifact_recovery_deadline_reached/,
    );
    assert.equal(headCalls, 0);
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

  it("allows an active download to exceed the timeout while chunks keep arriving", async () => {
    let emitted = 0;
    const source = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await new Promise((resolve) => setTimeout(resolve, 15));
        controller.enqueue(new Uint8Array([emitted]));
        emitted += 1;
        if (emitted === 4) controller.close();
      },
    });

    const bytes = await __gptImageArtifactFinalizerTestUtils.readProviderArtifactBytes(
      source,
      undefined,
      40,
    );
    assert.deepEqual([...bytes], [0, 1, 2, 3]);
  });

  it("reuses an uploaded generation object without another PUT", async () => {
    let putCalls = 0;
    const storageRow = {
      id: "10000000-0000-4000-8000-000000000001",
      project_id: null,
      canvas_project_id: null,
      bucket: "creator-test",
      object_key: "AIManhuaDrama/generation/existing-result.png",
      content_type: "image/png",
      size_bytes: 8,
      checksum: null,
      provider: "creator-test",
      status: "available",
      etag: "etag-1",
      version_id: null,
      last_verified_at: new Date("2026-08-03T09:59:00.000Z"),
      deleted_at: null,
      metadata_json: {
        taskId: "task-existing",
        attemptId: "attempt-existing",
      },
      created_by_user_id: "user-existing",
      created_at: new Date("2026-08-03T09:59:00.000Z"),
    };
    const result = await persistGptImageArtifact({
      async query(sql) {
        if (sql.includes("FROM storage_objects") && sql.includes("metadata_json->>'taskId'")) {
          return { rows: [storageRow] };
        }
        if (sql.includes("UPDATE storage_objects") && sql.includes("status = 'available'")) {
          return { rows: [storageRow] };
        }
        throw new Error(`unexpected_query:${sql}`);
      },
    } as never, {
      task: {
        userId: "user-existing",
        projectId: null,
        taskId: "task-existing",
        attemptId: "attempt-existing",
        createdByUserId: "user-existing",
      },
      snapshot: {},
      artifact: {
        mediaType: "image",
        mimeType: "image/png",
        url: "https://provider.example.test/result.png",
      },
      externalRequestId: "provider-task-existing",
      runtime: {
        bucket: "creator-test",
        provider: "creator-test",
        publicBaseUrl: "https://storage.example.test",
        adapter: {
          async headObject() {
            return { exists: true, contentType: "image/png", contentLength: 8 };
          },
          async putObject() {
            putCalls += 1;
            return {};
          },
        },
      } as never,
      env: {},
      now: new Date("2026-08-03T10:00:00.000Z"),
    });

    assert.equal(putCalls, 0);
    assert.equal(result.storageObjectId, storageRow.id);
    assert.equal(result.storageObjectKey, storageRow.object_key);
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
