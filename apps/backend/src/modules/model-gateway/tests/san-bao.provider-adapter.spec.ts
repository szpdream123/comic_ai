import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ModelError } from "../model-error.ts";
import { createProviderAdapterFromModelConfig } from "../provider-adapter.factory.ts";

const sharedConfig = {
  providerProtocol: "san_bao",
  providerConfig: {
    baseURL: "https://sanbaobeauty.com",
    apiKeyEnv: "SAN_BAO_API_KEY",
  },
} as const;

describe("san bao provider adapter", () => {
  it("submits and polls documented image tasks", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const adapter = createProviderAdapterFromModelConfig({
      ...sharedConfig,
      providerModel: "gpt-image2",
      mediaType: "image",
      providerConfig: {
        ...sharedConfig.providerConfig,
        createTaskEndpoint: "/openapi/v1/images",
        queryTaskEndpoint: "/openapi/v1/images/{taskId}",
        modelVariants: {
          "普通": "gpt-image2",
          "1K": "gpt-image2-1K",
          "2K": "gpt-image2-2K",
          "4K": "gpt-image2-4K",
        },
      },
    }, { SAN_BAO_API_KEY: "san-bao-key" }, (async (url, init) => {
      requests.push({ url: String(url), init });
      if (init?.method === "POST") return new Response(JSON.stringify({ data: { id: "image-task", status: "queued" } }));
      return new Response(JSON.stringify({ data: { status: "succeeded", images: ["https://cdn.example.com/image.png"] } }));
    }) as typeof fetch);

    const submission = await adapter.submit({
      providerRequestId: "request-image", providerName: "三宝影像", providerOperation: "shot.image.generate",
      requestKey: "image-key", payloadRef: "creator://image", payloadHash: "image-hash",
      redactedPayload: { prompt: "product photo", referenceImages: ["https://cdn.example.com/reference.png"], parameters: { aspectRatio: "16:9", resolution: "2K", quality: "high", count: 2 } },
    });
    const poll = await adapter.poll?.({ externalRequestId: submission.externalRequestId });

    assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
      model: "gpt-image2-2K", prompt: "product photo", aspect_ratio: "16:9",
      images: ["https://cdn.example.com/reference.png"], quality: "high", concurrency: 2,
    });
    assert.equal(new Headers(requests[0]?.init?.headers).get("idempotency-key"), "request-image");
    assert.equal(requests[1]?.url, "https://sanbaobeauty.com/openapi/v1/images/image-task");
    assert.equal(poll?.artifacts?.[0]?.url, "https://cdn.example.com/image.png");
  });

  it("maps each image resolution to its configured upstream model and fixes quality at high", async () => {
    const cases = [
      ["普通", "gpt-image2"],
      ["1k", "gpt-image2-1K"],
      ["2K", "gpt-image2-2K"],
      ["4k", "gpt-image2-4K"],
    ] as const;
    for (const [resolution, expectedModel] of cases) {
      let request: Record<string, unknown> = {};
      const adapter = createProviderAdapterFromModelConfig({
        ...sharedConfig,
        providerModel: "gpt-image2",
        mediaType: "image",
        providerConfig: {
          ...sharedConfig.providerConfig,
          createTaskEndpoint: "/openapi/v1/images",
          queryTaskEndpoint: "/openapi/v1/images/{taskId}",
          modelVariants: { "普通": "gpt-image2", "1K": "gpt-image2-1K", "2K": "gpt-image2-2K", "4K": "gpt-image2-4K" },
        },
      }, { SAN_BAO_API_KEY: "san-bao-key" }, (async (_url, init) => {
        request = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ data: { id: `task-${resolution}`, status: "queued" } }));
      }) as typeof fetch);

      await adapter.submit({
        providerRequestId: `request-${resolution}`,
        providerName: "三宝影像",
        providerOperation: "shot.image.generate",
        requestKey: `key-${resolution}`,
        payloadRef: `creator://${resolution}`,
        payloadHash: `hash-${resolution}`,
        redactedPayload: { prompt: "test", parameters: { resolution, quality: "low" } },
      });

      assert.equal(request.model, expectedModel);
      assert.equal(request.quality, "high");
    }
  });

  it("maps platform filePaths into the documented images field", async () => {
    let request: Record<string, unknown> = {};
    const adapter = createProviderAdapterFromModelConfig({
      ...sharedConfig,
      providerModel: "gpt-image2",
      mediaType: "image",
      providerConfig: {
        ...sharedConfig.providerConfig,
        createTaskEndpoint: "/openapi/v1/images",
        queryTaskEndpoint: "/openapi/v1/images/{taskId}",
      },
    }, { SAN_BAO_API_KEY: "san-bao-key" }, (async (_url, init) => {
      request = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ data: { id: "image-file-path-task", status: "queued" } }));
    }) as typeof fetch);

    await adapter.submit({
      providerRequestId: "request-image-file-paths",
      providerName: "三宝影像",
      providerOperation: "shot.image.generate",
      requestKey: "image-file-paths-key",
      payloadRef: "creator://image-file-paths",
      payloadHash: "image-file-paths-hash",
      redactedPayload: {
        prompt: "use uploaded reference",
        parameters: { filePaths: ["https://cdn.example.com/uploaded-reference.png"] },
      },
    });

    assert.deepEqual(request, {
      model: "gpt-image2",
      prompt: "use uploaded reference",
      images: ["https://cdn.example.com/uploaded-reference.png"],
      quality: "high",
    });
  });

  it("rejects image resolutions outside the configured model whitelist", async () => {
    const adapter = createProviderAdapterFromModelConfig({
      ...sharedConfig,
      providerModel: "gpt-image2",
      mediaType: "image",
      providerConfig: {
        ...sharedConfig.providerConfig,
        createTaskEndpoint: "/openapi/v1/images",
        queryTaskEndpoint: "/openapi/v1/images/{taskId}",
        modelVariants: { "普通": "gpt-image2", "1K": "gpt-image2-1K" },
      },
    }, { SAN_BAO_API_KEY: "san-bao-key" }, (async () => {
      throw new Error("fetch must not be called");
    }) as typeof fetch);

    await assert.rejects(
      () => adapter.submit({
        providerRequestId: "request-invalid-resolution",
        providerName: "三宝影像",
        providerOperation: "shot.image.generate",
        requestKey: "invalid-resolution",
        payloadRef: "creator://invalid-resolution",
        payloadHash: "invalid-resolution",
        redactedPayload: { prompt: "test", parameters: { resolution: "8K", quality: "high" } },
      }),
      (error: unknown) => error instanceof ModelError && error.code === "model_parameter_invalid",
    );
  });

  it("submits video references and returns the signed result", async () => {
    let request: Record<string, unknown> = {};
    const adapter = createProviderAdapterFromModelConfig({
      ...sharedConfig,
      providerModel: "sd2_9img_full",
      mediaType: "video",
      providerConfig: {
        ...sharedConfig.providerConfig,
        createTaskEndpoint: "/openapi/v1/videos",
        queryTaskEndpoint: "/openapi/v1/videos/{taskId}",
      },
    }, { SAN_BAO_API_KEY: "san-bao-key" }, (async (_url, init) => {
      if (init?.method === "POST") {
        request = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ data: { id: "video-task", status: "queued" } }));
      }
      return new Response(JSON.stringify({ data: { status: "succeeded", video_url: "https://cdn.example.com/video.mp4" } }));
    }) as typeof fetch);

    const submission = await adapter.submit({
      providerRequestId: "request-video", providerName: "三宝影像", providerOperation: "shot.video.generate",
      requestKey: "video-key", payloadRef: "creator://video", payloadHash: "video-hash",
      redactedPayload: { prompt: "cinematic shot", images: ["https://cdn.example.com/reference.png"], referenceVideoUrl: "https://cdn.example.com/reference.mp4", referenceAudioUrl: "https://cdn.example.com/reference.mp3", parameters: { ratio: "9:16", resolution: "1080p", durationSec: 5, concurrency: 2, reference: "all" } },
    });
    const poll = await adapter.poll?.({ externalRequestId: submission.externalRequestId });

    assert.deepEqual(request, {
      model: "sd2_9img_full", prompt: "cinematic shot", ratio: "9:16", resolution: "1080p", duration: 5,
      concurrency: 2, reference: "all", images: ["https://cdn.example.com/reference.png"],
      videos: ["https://cdn.example.com/reference.mp4"], audios: ["https://cdn.example.com/reference.mp3"],
    });
    assert.equal(poll?.videoUrl, "https://cdn.example.com/video.mp4");
  });

  it("maps platform video file paths and frame objects to documented media arrays", async () => {
    let request: Record<string, unknown> = {};
    const adapter = createProviderAdapterFromModelConfig({
      ...sharedConfig,
      providerModel: "sd2_9img_full",
      mediaType: "video",
      providerConfig: {
        ...sharedConfig.providerConfig,
        createTaskEndpoint: "/openapi/v1/videos",
        queryTaskEndpoint: "/openapi/v1/videos/{taskId}",
      },
    }, { SAN_BAO_API_KEY: "san-bao-key" }, (async (_url, init) => {
      request = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ data: { id: "video-file-path-task", status: "queued" } }));
    }) as typeof fetch);

    await adapter.submit({
      providerRequestId: "request-video-file-paths",
      providerName: "三宝影像",
      providerOperation: "shot.video.generate",
      requestKey: "video-file-paths-key",
      payloadRef: "creator://video-file-paths",
      payloadHash: "video-file-paths-hash",
      redactedPayload: {
        prompt: "use all platform references",
        parameters: {
          ratio: "9:16",
          resolution: "720p",
          durationSec: 10,
          count: 1,
          reference: "startEnd",
          filePaths: ["https://cdn.example.com/reference.png"],
          lastFrame: { previewUrl: "https://cdn.example.com/last-frame.png" },
          videoFilePaths: ["https://cdn.example.com/reference.mp4"],
          editSourceVideo: { downloadUrl: "https://cdn.example.com/source.mp4" },
          audioFilePaths: ["https://cdn.example.com/reference.mp3"],
        },
      },
    });

    assert.deepEqual(request, {
      model: "sd2_9img_full",
      prompt: "use all platform references",
      ratio: "9:16",
      resolution: "720p",
      duration: 10,
      concurrency: 1,
      reference: "startEnd",
      images: [
        "https://cdn.example.com/reference.png",
        "https://cdn.example.com/last-frame.png",
      ],
      videos: [
        "https://cdn.example.com/source.mp4",
        "https://cdn.example.com/reference.mp4",
      ],
      audios: ["https://cdn.example.com/reference.mp3"],
    });
  });

  it("preserves tagged and base64 media objects documented by SanBao", async () => {
    let request: Record<string, unknown> = {};
    const adapter = createProviderAdapterFromModelConfig({
      ...sharedConfig,
      providerModel: "sd2_9img_full",
      mediaType: "video",
      providerConfig: {
        ...sharedConfig.providerConfig,
        createTaskEndpoint: "/openapi/v1/videos",
        queryTaskEndpoint: "/openapi/v1/videos/{taskId}",
      },
    }, { SAN_BAO_API_KEY: "san-bao-key" }, (async (_url, init) => {
      request = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ data: { id: "tagged-video-task", status: "queued" } }));
    }) as typeof fetch);

    await adapter.submit({
      providerRequestId: "request-tagged-video",
      providerName: "三宝影像",
      providerOperation: "shot.video.generate",
      requestKey: "tagged-video-key",
      payloadRef: "creator://tagged-video",
      payloadHash: "tagged-video-hash",
      redactedPayload: {
        prompt: "use tagged references",
        images: [
          { tag: "图片1", url: "https://cdn.example.com/reference.png", storageObjectId: "must-not-leak" },
          { tag: "图片2", base64: "aW1hZ2U=", mimeType: "image/png", fileName: "reference.png" },
        ],
      },
    });

    assert.deepEqual(request.images, [
      { tag: "图片1", url: "https://cdn.example.com/reference.png" },
      { tag: "图片2", base64: "aW1hZ2U=", mimeType: "image/png", fileName: "reference.png" },
    ]);
  });

  it("maps failed task messages to stable SanBao error-factory codes", async () => {
    const adapter = createProviderAdapterFromModelConfig({
      ...sharedConfig,
      providerModel: "sd2_9img_full",
      mediaType: "video",
      providerConfig: {
        ...sharedConfig.providerConfig,
        createTaskEndpoint: "/openapi/v1/videos",
        queryTaskEndpoint: "/openapi/v1/videos/{taskId}",
      },
    }, { SAN_BAO_API_KEY: "san-bao-key" }, (async (_url, init) => {
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ data: { id: "failed-video-task", status: "queued" } }));
      }
      return new Response(JSON.stringify({ data: { status: "failed", error: "积分余额不足" } }));
    }) as typeof fetch);

    const submission = await adapter.submit({
      providerRequestId: "request-failed-video",
      providerName: "三宝影像",
      providerOperation: "shot.video.generate",
      requestKey: "failed-video-key",
      payloadRef: "creator://failed-video",
      payloadHash: "failed-video-hash",
      redactedPayload: { prompt: "test" },
    });
    const poll = await adapter.poll?.({ externalRequestId: submission.externalRequestId });

    assert.equal(poll?.status, "failed");
    assert.equal(poll?.redactedResponse.failureCode, "san_bao_insufficient_balance");
  });

  it("maps documented upstream errors through ModelError", async () => {
    const adapter = createProviderAdapterFromModelConfig({
      ...sharedConfig,
      providerModel: "gpt-image2",
      mediaType: "image",
      providerConfig: { ...sharedConfig.providerConfig, createTaskEndpoint: "/openapi/v1/images", queryTaskEndpoint: "/openapi/v1/images/{taskId}" },
    }, { SAN_BAO_API_KEY: "san-bao-key" }, (async () => new Response(JSON.stringify({ error: "insufficient credits", authorization: "Bearer should-not-leak" }), { status: 402 })) as typeof fetch);

    await assert.rejects(
      () => adapter.submit({ providerRequestId: "request-error", providerName: "三宝影像", providerOperation: "shot.image.generate", requestKey: "error-key", payloadRef: "creator://error", payloadHash: "error-hash", redactedPayload: { prompt: "test" } }),
      (error: unknown) => error instanceof ModelError && error.code === "san_bao_insufficient_balance" && !JSON.stringify(error.providerDiagnostics).includes("should-not-leak"),
    );
  });

  it("reports a missing SAN_BAO_API_KEY through the error factory", () => {
    assert.throws(
      () => createProviderAdapterFromModelConfig({
        ...sharedConfig,
        providerModel: "gpt-image2",
        mediaType: "image",
        providerConfig: { ...sharedConfig.providerConfig, createTaskEndpoint: "/openapi/v1/images", queryTaskEndpoint: "/openapi/v1/images/{taskId}" },
      }, {}),
      (error: unknown) => error instanceof ModelError && error.code === "provider_api_key_missing",
    );
  });
});
