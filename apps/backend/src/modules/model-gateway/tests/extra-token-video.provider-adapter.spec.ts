import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createProviderAdapterFromModelConfig } from "../provider-adapter.factory.ts";

describe("extra token video provider adapter", () => {
  it("submits custom HTTP Seedance video tasks with the Extra Token request shape", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody = "";

    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "custom_http",
        providerModel: "doubao-seedance-2-0-mini-260615",
        providerConfig: {
          baseURL: "https://www.extratoken.cn",
          requestPath: "/api/v3/contents/generations/tasks",
          queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
          requestFormat: "volcengine_ark_contents_generation",
          apiKeyEnv: "EXTRA_TOEKN_API_KEY",
        },
      },
      { EXTRA_TOEKN_API_KEY: "extra-token-value" },
      (async (url, init) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers;
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({ data: { task_id: "extra-token-task-1", status: "queued" } }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch,
    );

    const result = await adapter.submit({
      providerRequestId: "provider-request-extra-token",
      providerName: "Extra Token",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-extra-token:task-extra-token",
      payloadRef: "creator://payload-extra-token",
      payloadHash: "hash-extra-token",
      redactedPayload: {
        prompt: "storyboard frame becomes a short cinematic shot",
        firstFrameUrl: "https://cdn.example.com/frame-extra-token.png",
        parameters: {
          durationSec: 4,
          resolution: "480p",
          aspectRatio: "16:9",
          seed: 12,
        },
      },
    });

    assert.equal(capturedUrl, "https://www.extratoken.cn/api/v1/video-generation");
    assert.deepEqual(capturedHeaders, {
      authorization: "Bearer extra-token-value",
      "content-type": "application/json",
    });
    assert.deepEqual(JSON.parse(capturedBody), {
      model: "doubao-seedance-2-0-mini-260615",
      content: [
        {
          type: "text",
          text: "storyboard frame becomes a short cinematic shot",
        },
        {
          type: "image_url",
          image_url: { url: "https://cdn.example.com/frame-extra-token.png" },
          role: "first_frame",
        },
      ],
      duration: 4,
      resolution: "480p",
      ratio: "16:9",
      seed: 12,
      watermark: false,
    });
    assert.equal(result.externalRequestId, "extra-token-task-1");
    assert.equal(result.status, "accepted");
  });

  it("maps workbench video form values to Extra Token transport fields", async () => {
    let capturedBody = "";

    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "custom_http",
        providerModel: "doubao-seedance-2-0-mini-260615",
        providerConfig: {
          baseURL: "https://www.extratoken.cn",
          requestPath: "/api/v3/contents/generations/tasks",
          requestFormat: "volcengine_ark_contents_generation",
          apiKeyEnv: "EXTRA_TOEKN_API_KEY",
        },
      },
      { EXTRA_TOEKN_API_KEY: "extra-token-value" },
      (async (_url, init) => {
        capturedBody = String(init?.body ?? "");
        return new Response(JSON.stringify({ data: { task_id: "extra-token-task-form" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    );

    await adapter.submit({
      providerRequestId: "provider-request-extra-token-form",
      providerName: "Extra Token",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-extra-token:task-form",
      payloadRef: "creator://payload-extra-token-form",
      payloadHash: "hash-extra-token-form",
      redactedPayload: {
        motionPrompt: "camera move prompt",
        firstFrameUrl: "https://cdn.example.com/first.png",
        parameters: {
          durationSec: 8,
          resolution: "2K",
          aspectRatio: "16:9",
          firstFrame: { url: "https://cdn.example.com/first.png" },
          imageReference: { url: "https://cdn.example.com/first.png" },
          quickReferences: [
            { url: "https://cdn.example.com/first.png" },
            { url: "https://cdn.example.com/character.png" },
          ],
          referenceUploads: [
            { url: "https://cdn.example.com/reference.png" },
          ],
          editSourceVideo: {
            url: "https://cdn.example.com/edit.mp4",
          },
          referenceAudio: {
            url: "https://cdn.example.com/reference.mp3",
          },
          generateAudio: true,
        },
      },
    });

    assert.deepEqual(JSON.parse(capturedBody), {
      model: "doubao-seedance-2-0-mini-260615",
      content: [
        {
          type: "text",
          text: "camera move prompt",
        },
        {
          type: "image_url",
          image_url: { url: "https://cdn.example.com/first.png" },
          role: "first_frame",
        },
        {
          type: "image_url",
          image_url: { url: "https://cdn.example.com/reference.png" },
          role: "reference_image",
        },
        {
          type: "image_url",
          image_url: { url: "https://cdn.example.com/character.png" },
          role: "reference_image",
        },
        {
          type: "video_url",
          video_url: { url: "https://cdn.example.com/edit.mp4" },
          role: "reference_video",
        },
        {
          type: "audio_url",
          audio_url: { url: "https://cdn.example.com/reference.mp3" },
          role: "reference_audio",
        },
      ],
      duration: 8,
      resolution: "2K",
      ratio: "16:9",
      generate_audio: true,
      watermark: false,
    });
  });

  it("polls Extra Token video tasks with the model query parameter", async () => {
    let capturedPollUrl = "";
    let callCount = 0;

    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "volcengine_ark_video",
        providerModel: "doubao-seedance-2-0-mini-260615",
        providerConfig: {
          baseURL: "https://ark.cn-beijing.volces.com",
          createTaskEndpoint: "/api/v3/contents/generations/tasks",
          queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
          apiKeyEnv: "Extra Token",
        },
      },
      { "Extra Token": "extra-token-value" },
      (async (url) => {
        callCount += 1;
        if (callCount === 1) {
          return new Response(JSON.stringify({ id: "extra token/task 2" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        capturedPollUrl = String(url);
        return new Response(
          JSON.stringify({
            status: "succeeded",
            data: {
              video_url: "https://cdn.example.com/generated.mp4",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch,
    );

    const submitted = await adapter.submit({
      providerRequestId: "provider-request-extra-token-poll",
      providerName: "Extra Token",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-extra-token:task-extra-token-poll",
      payloadRef: "creator://payload-extra-token-poll",
      payloadHash: "hash-extra-token-poll",
      redactedPayload: {
        prompt: "slow orbit",
      },
    });
    const polled = await (
      adapter as {
        poll(input: { externalRequestId: string }): Promise<{
          status: string;
          videoUrl?: string;
        }>;
      }
    ).poll({ externalRequestId: submitted.externalRequestId });

    assert.equal(
      capturedPollUrl,
      "https://www.extratoken.cn/api/v1/video-generation/tasks/extra%20token%2Ftask%202?model=doubao-seedance-2-0-mini-260615",
    );
    assert.equal(polled.status, "succeeded");
    assert.equal(polled.videoUrl, "https://cdn.example.com/generated.mp4");
  });

  it("accepts Extra Token output task responses and output poll results", async () => {
    let callCount = 0;

    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "custom_http",
        providerModel: "doubao-seedance-2-0-mini-260615",
        providerConfig: {
          baseURL: "https://ark.cn-beijing.volces.com",
          createTaskEndpoint: "/api/v3/contents/generations/tasks",
          queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
          requestFormat: "volcengine_ark_contents_generation",
          apiKeyEnv: "Extra Token",
        },
      },
      { "Extra Token": "extra-token-value" },
      (async () => {
        callCount += 1;
        if (callCount === 1) {
          return new Response(JSON.stringify({ output: { task_id: "cgt-output-task" } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            output: {
              task_status: "succeeded",
              video_url: "https://cdn.example.com/output-generated.mp4",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch,
    );

    const submitted = await adapter.submit({
      providerRequestId: "provider-request-extra-token-output",
      providerName: "Extra Token",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-extra-token:task-output",
      payloadRef: "creator://payload-extra-token-output",
      payloadHash: "hash-extra-token-output",
      redactedPayload: {
        prompt: "warm sunset city gate",
      },
    });
    const polled = await (
      adapter as {
        poll(input: { externalRequestId: string }): Promise<{
          status: string;
          videoUrl?: string;
        }>;
      }
    ).poll({ externalRequestId: submitted.externalRequestId });

    assert.equal(submitted.externalRequestId, "cgt-output-task");
    assert.equal(submitted.status, "accepted");
    assert.equal(polled.status, "succeeded");
    assert.equal(polled.videoUrl, "https://cdn.example.com/output-generated.mp4");
  });
});
