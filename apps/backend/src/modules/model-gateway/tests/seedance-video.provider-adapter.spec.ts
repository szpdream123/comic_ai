import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SeedanceVideoProviderAdapter } from "../seedance-video.provider-adapter.ts";
import { createProviderAdapterFromModelConfig } from "../provider-adapter.factory.ts";

describe("seedance video provider adapter", () => {
  it("submits image-to-video tasks to the configured Seedance endpoint", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody = "";

    const adapter = new SeedanceVideoProviderAdapter({
      apiKey: "seedance-key",
      model: "seedance-1-0-pro",
      createTaskEndpoint: "https://ark.example.com/api/v3/contents/generations/tasks",
      fetchImpl: (async (url, init) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers;
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            data: {
              task_id: "seedance-task-123",
              status: "queued",
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
      providerName: "volcengine",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-1:task-1",
      payloadRef: "creator://payload",
      payloadHash: "hash-1",
      redactedPayload: {
        prompt: "camera slowly pushes in",
        firstFrameUrl: "https://cdn.example.com/frame.png",
        parameters: {
          durationSec: 5,
          resolution: "1080p",
          aspectRatio: "16:9",
          seed: 11,
          cameraFixed: false,
          returnLastFrame: true,
          generateAudio: true,
        },
      },
    });

    assert.equal(
      capturedUrl,
      "https://ark.example.com/api/v3/contents/generations/tasks",
    );
    assert.deepEqual(capturedHeaders, {
      authorization: "Bearer seedance-key",
      "content-type": "application/json",
    });
    assert.deepEqual(JSON.parse(capturedBody), {
      model: "seedance-1-0-pro",
      content: [
        {
          type: "text",
          text: "camera slowly pushes in",
        },
        {
          type: "image_url",
          image_url: {
            url: "https://cdn.example.com/frame.png",
          },
          role: "first_frame",
        },
      ],
      ratio: "16:9",
      resolution: "1080p",
      duration: 5,
      seed: 11,
      camera_fixed: false,
      return_last_frame: true,
      generate_audio: true,
      watermark: false,
    });
    assert.equal(result.externalRequestId, "seedance-task-123");
    assert.equal(result.status, "accepted");
    assert.deepEqual(result.redactedResponse?.providerStatus, "queued");
  });

  it("builds the Seedance adapter from model config", async () => {
    let capturedUrl = "";

    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "volcengine_ark_video",
        providerModel: "seedance-1-0-pro",
        providerConfig: {
          baseURL: "https://ark.example.com",
          createTaskEndpoint: "/api/v3/contents/generations/tasks",
          queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
          apiKeyEnv: "VOLCENGINE_ARK_API_KEY",
        },
      },
      { VOLCENGINE_ARK_API_KEY: "seedance-key" },
      (async (url) => {
        capturedUrl = String(url);
        return new Response(
          JSON.stringify({ data: { task_id: "seedance-task-456" } }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch,
    );

    const result = await adapter.submit({
      providerRequestId: "provider-request-2",
      providerName: "volcengine",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-2:task-2",
      payloadRef: "creator://payload-2",
      payloadHash: "hash-2",
      redactedPayload: {
        prompt: "turn toward the skyline",
        firstFrameUrl: "https://cdn.example.com/frame-2.png",
      },
    });

    assert.equal(
      capturedUrl,
      "https://ark.example.com/api/v3/contents/generations/tasks",
    );
    assert.equal(result.externalRequestId, "seedance-task-456");
    assert.equal(result.status, "accepted");
  });

  it("defaults to Seedance 2.0 when no provider model is configured", async () => {
    let capturedBody = "";
    const adapter = new SeedanceVideoProviderAdapter({
      apiKey: "seedance-key",
      createTaskEndpoint: "https://ark.example.com/api/v3/contents/generations/tasks",
      fetchImpl: (async (_url, init) => {
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({ data: { task_id: "seedance-task-default" } }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch,
    });

    await adapter.submit({
      providerRequestId: "provider-request-default",
      providerName: "volcengine",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-default:task-default",
      payloadRef: "creator://payload-default",
      payloadHash: "hash-default",
      redactedPayload: {
        prompt: "slow orbit",
        firstFrameUrl: "https://cdn.example.com/frame-default.png",
      },
    });

    assert.equal(JSON.parse(capturedBody).model, "doubao-seedance-2-0-260128");
  });

  it("maps Seedance frame and reference media to Volcengine content roles", async () => {
    let capturedBody = "";
    const adapter = new SeedanceVideoProviderAdapter({
      apiKey: "seedance-key",
      model: "doubao-seedance-2-0-260128",
      createTaskEndpoint: "https://ark.example.com/api/v3/contents/generations/tasks",
      fetchImpl: (async (_url, init) => {
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({ data: { task_id: "seedance-task-reference" } }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch,
    });

    await adapter.submit({
      providerRequestId: "provider-request-reference",
      providerName: "volcengine",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-reference:task-reference",
      payloadRef: "creator://payload-reference",
      payloadHash: "hash-reference",
      redactedPayload: {
        prompt: "first person tea commercial",
        firstFrameUrl: "https://cdn.example.com/first.png",
        parameters: {
          lastFrame: { url: "https://cdn.example.com/last.png" },
          referenceImages: [{ url: "https://cdn.example.com/ref.png" }],
          editSourceVideo: { url: "https://cdn.example.com/ref.mp4" },
          referenceAudio: { url: "https://cdn.example.com/ref.mp3" },
        },
      },
    });

    assert.deepEqual(JSON.parse(capturedBody).content, [
      {
        type: "text",
        text: "first person tea commercial",
      },
      {
        type: "image_url",
        image_url: { url: "https://cdn.example.com/first.png" },
        role: "first_frame",
      },
      {
        type: "image_url",
        image_url: { url: "https://cdn.example.com/last.png" },
        role: "last_frame",
      },
      {
        type: "image_url",
        image_url: { url: "https://cdn.example.com/ref.png" },
        role: "reference_image",
      },
      {
        type: "video_url",
        video_url: { url: "https://cdn.example.com/ref.mp4" },
        role: "reference_video",
      },
      {
        type: "audio_url",
        audio_url: { url: "https://cdn.example.com/ref.mp3" },
        role: "reference_audio",
      },
    ]);
  });

  it("includes provider response details when Seedance rejects a submission", async () => {
    const adapter = new SeedanceVideoProviderAdapter({
      apiKey: "seedance-key",
      model: "seedance-1-0-pro",
      createTaskEndpoint: "https://ark.example.com/api/v3/contents/generations/tasks",
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "InvalidParameter",
              message: "content field is required",
            },
          }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          },
        )) as typeof fetch,
    });

    await assert.rejects(
      () =>
        adapter.submit({
          providerRequestId: "provider-request-rejected",
          providerName: "volcengine",
          providerOperation: "shot.video.generate",
          requestKey: "workflow-rejected:task-rejected",
          payloadRef: "creator://payload-rejected",
          payloadHash: "hash-rejected",
          redactedPayload: {
            prompt: "slow orbit",
            firstFrameUrl: "https://cdn.example.com/frame-rejected.png",
          },
        }),
      /seedance_video_400:InvalidParameter:content field is required/,
    );
  });
});
