import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LingdongApiProviderAdapter } from "../lingdong-api.provider-adapter.ts";
import { createProviderAdapterFromModelConfig } from "../provider-adapter.factory.ts";

describe("lingdong api provider adapter", () => {
  it("submits image generation requests to the Lingdong images endpoint", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody = "";

    const adapter = new LingdongApiProviderAdapter({
      apiKey: "lingdong-key",
      mediaType: "image",
      model: "gpt-image-2",
      imageEndpoint: "https://www.lingdongapi.com/v1/images/generations",
      fetchImpl: (async (url, init) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers;
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            data: [{ url: "https://www.lingdongapi.com/v1/images/generated-1/content" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    });

    const result = await adapter.submit({
      providerRequestId: "provider-request-image",
      providerName: "lingdong",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-image:task-image",
      payloadRef: "creator://payload-image",
      payloadHash: "hash-image",
      redactedPayload: {
        prompt: "一张电影感分镜海报，雨夜霓虹，女主角站在街口",
      },
    });

    assert.equal(capturedUrl, "https://www.lingdongapi.com/v1/images/generations");
    assert.deepEqual(capturedHeaders, {
      authorization: "Bearer lingdong-key",
      "content-type": "application/json",
    });
    assert.deepEqual(JSON.parse(capturedBody), {
      model: "gpt-image-2",
      prompt: "一张电影感分镜海报，雨夜霓虹，女主角站在街口",
    });
    assert.equal(result.status, "succeeded");
    assert.equal(result.artifacts?.[0]?.url, "https://www.lingdongapi.com/v1/images/generated-1/content");
  });

  it("submits video generation requests with images videos and audios arrays", async () => {
    let capturedUrl = "";
    let capturedBody = "";

    const adapter = new LingdongApiProviderAdapter({
      apiKey: "lingdong-key",
      mediaType: "video",
      model: "sora-2",
      createTaskEndpoint: "https://www.lingdongapi.com/v1/videos",
      fetchImpl: (async (url, init) => {
        capturedUrl = String(url);
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            task_id: "lingdong-task-123",
            status: "queued",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    });

    const result = await adapter.submit({
      providerRequestId: "provider-request-video",
      providerName: "lingdong",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-video:task-video",
      payloadRef: "creator://payload-video",
      payloadHash: "hash-video",
      redactedPayload: {
        prompt: "镜头缓慢推进，少女抬头看向城市天际线",
        firstFrameUrl: "https://example.com/first-frame.png",
        parameters: {
          referenceImages: [{ url: "https://example.com/character.png" }],
          videos: [{ url: "https://example.com/reference.mp4" }],
          audios: [{ url: "https://example.com/reference.mp3" }],
        },
      },
    });

    assert.equal(capturedUrl, "https://www.lingdongapi.com/v1/videos");
    assert.deepEqual(JSON.parse(capturedBody), {
      model: "sora-2",
      prompt: "镜头缓慢推进，少女抬头看向城市天际线",
      images: [
        "https://example.com/first-frame.png",
        "https://example.com/character.png",
      ],
      videos: ["https://example.com/reference.mp4"],
      audios: ["https://example.com/reference.mp3"],
    });
    assert.equal(result.status, "accepted");
    assert.equal(result.externalRequestId, "lingdong-task-123");
  });

  it("builds Lingdong video content url from task id after success", async () => {
    const adapter = new LingdongApiProviderAdapter({
      apiKey: "lingdong-key",
      mediaType: "video",
      model: "sora-2",
      createTaskEndpoint: "https://www.lingdongapi.com/v1/videos",
      queryTaskEndpoint: "https://www.lingdongapi.com/v1/video/generations/{taskId}",
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            id: "lingdong-task-789",
            status: "succeeded",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
    });

    const result = await adapter.poll({ externalRequestId: "lingdong-task-789" });

    assert.equal(result.status, "succeeded");
    assert.equal(result.videoUrl, "https://www.lingdongapi.com/v1/videos/lingdong-task-789/content");
  });

  it("builds the Lingdong adapter from model config", async () => {
    let capturedUrl = "";

    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "lingdong_api",
        providerModel: "gpt-image-2",
        providerConfig: {
          baseURL: "https://www.lingdongapi.com",
          mediaType: "image",
          endpoint: "/v1/images/generations",
          apiKeyEnv: "sd2_ld",
        },
      },
      { sd2_ld: "lingdong-key" },
      (async (url) => {
        capturedUrl = String(url);
        return new Response(
          JSON.stringify({ data: [{ url: "https://www.lingdongapi.com/v1/images/generated-2/content" }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    );

    const result = await adapter.submit({
      providerRequestId: "provider-request-config",
      providerName: "lingdong",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-config:task-config",
      payloadRef: "creator://payload-config",
      payloadHash: "hash-config",
      redactedPayload: {
        prompt: "测试图片",
      },
    });

    assert.equal(capturedUrl, "https://www.lingdongapi.com/v1/images/generations");
    assert.equal(result.status, "succeeded");
  });
});
