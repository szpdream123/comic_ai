import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AliyunBailianVideoProviderAdapter } from "../aliyun-bailian-video.provider-adapter.ts";
import { createProviderAdapterFromModelConfig } from "../provider-adapter.factory.ts";

describe("aliyun bailian video provider adapter", () => {
  it("submits HappyHorse reference-to-video tasks to DashScope async synthesis", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody = "";

    const adapter = new AliyunBailianVideoProviderAdapter({
      apiKey: "bailian-key",
      model: "happyhorse-1.0-r2v",
      createTaskEndpoint: "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
      fetchImpl: (async (url, init) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers;
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            output: {
              task_id: "bailian-task-123",
              task_status: "PENDING",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch,
    });

    const result = await adapter.submit({
      providerRequestId: "provider-request-1",
      providerName: "aliyun-bailian",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-1:task-1",
      payloadRef: "creator://payload",
      payloadHash: "hash-1",
      redactedPayload: {
        prompt: "a joyful character runs through a market",
        firstFrameUrl: "https://cdn.example.com/role.png",
        parameters: {
          aspectRatio: "16:9",
          durationSec: 5,
          resolution: "720p",
          seed: 11,
          watermark: false,
        },
      },
    });

    assert.equal(
      capturedUrl,
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
    );
    assert.deepEqual(capturedHeaders, {
      authorization: "Bearer bailian-key",
      "content-type": "application/json",
      "x-dashscope-async": "enable",
    });
    assert.deepEqual(JSON.parse(capturedBody), {
      model: "happyhorse-1.0-r2v",
      input: {
        prompt: "a joyful character runs through a market",
        media: [
          {
            type: "reference_image",
            url: "https://cdn.example.com/role.png",
          },
        ],
      },
      parameters: {
        ratio: "16:9",
        duration: 5,
        resolution: "720P",
        seed: 11,
        watermark: false,
      },
    });
    assert.equal(result.externalRequestId, "bailian-task-123");
    assert.equal(result.status, "accepted");
    assert.deepEqual(result.redactedResponse?.providerStatus, "PENDING");
  });

  it("polls DashScope task status and reads the generated video url", async () => {
    const adapter = new AliyunBailianVideoProviderAdapter({
      apiKey: "bailian-key",
      model: "happyhorse-1.0-r2v",
      createTaskEndpoint: "https://dashscope.aliyuncs.com/create",
      queryTaskEndpoint: "https://dashscope.aliyuncs.com/api/v1/tasks/{taskId}",
      fetchImpl: (async (url, init) => {
        assert.equal(String(url), "https://dashscope.aliyuncs.com/api/v1/tasks/bailian-task-123");
        assert.deepEqual(init?.headers, {
          authorization: "Bearer bailian-key",
        });
        return new Response(
          JSON.stringify({
            output: {
              task_id: "bailian-task-123",
              task_status: "SUCCEEDED",
              video_url: "https://dashscope-result.example.com/video.mp4",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch,
    });

    const result = await adapter.poll({ externalRequestId: "bailian-task-123" });

    assert.equal(result.status, "succeeded");
    assert.equal(result.videoUrl, "https://dashscope-result.example.com/video.mp4");
    assert.deepEqual(result.redactedResponse, {
      providerStatus: "SUCCEEDED",
      taskId: "bailian-task-123",
      providerErrorCode: null,
      providerMessage: null,
    });
  });

  it("deduplicates reference media and serializes every item as a MediaItem", async () => {
    let capturedBody = "";
    const adapter = new AliyunBailianVideoProviderAdapter({
      apiKey: "bailian-key",
      model: "happyhorse-1.0-r2v",
      createTaskEndpoint: "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
      fetchImpl: (async (_url, init) => {
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({ output: { task_id: "bailian-task-media" } }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch,
    });

    await adapter.submit({
      providerRequestId: "provider-request-media",
      providerName: "aliyun-bailian",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-media:task-media",
      payloadRef: "creator://payload-media",
      payloadHash: "hash-media",
      redactedPayload: {
        prompt: "keep the character consistent",
        firstFrameUrl: "https://cdn.example.com/ref-a.png",
        parameters: {
          referenceUploads: [
            { url: "https://cdn.example.com/ref-a.png" },
            { url: "https://cdn.example.com/ref-b.png" },
          ],
          resolution: "1080p",
        },
      },
    });

    assert.deepEqual(JSON.parse(capturedBody).input.media, [
      {
        type: "reference_image",
        url: "https://cdn.example.com/ref-a.png",
      },
      {
        type: "reference_image",
        url: "https://cdn.example.com/ref-b.png",
      },
    ]);
    assert.equal(JSON.parse(capturedBody).parameters.resolution, "1080P");
  });

  it("builds the Bailian video adapter from model config", async () => {
    let capturedUrl = "";

    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "aliyun_bailian_video",
        providerModel: "happyhorse-1.0-r2v",
        providerConfig: {
          baseURL: "https://dashscope.aliyuncs.com",
          createTaskEndpoint: "/api/v1/services/aigc/video-generation/video-synthesis",
          queryTaskEndpoint: "/api/v1/tasks/{taskId}",
          apiKeyEnv: "ALIYUNBAILIAN_API_KEY",
        },
      },
      { ALIYUNBAILIAN_API_KEY: "bailian-key" },
      (async (url) => {
        capturedUrl = String(url);
        return new Response(
          JSON.stringify({ output: { task_id: "bailian-task-456" } }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch,
    );

    const result = await adapter.submit({
      providerRequestId: "provider-request-2",
      providerName: "aliyun-bailian",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-2:task-2",
      payloadRef: "creator://payload-2",
      payloadHash: "hash-2",
      redactedPayload: {
        prompt: "turn toward the camera",
        firstFrameUrl: "https://cdn.example.com/role-2.png",
      },
    });

    assert.equal(
      capturedUrl,
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
    );
    assert.equal(result.externalRequestId, "bailian-task-456");
    assert.equal(result.status, "accepted");
  });
});
