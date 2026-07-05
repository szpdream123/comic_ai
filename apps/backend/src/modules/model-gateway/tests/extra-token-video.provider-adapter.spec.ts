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
    const parsedBody = JSON.parse(capturedBody) as Record<string, unknown>;
    assert.deepEqual(Object.keys(parsedBody).sort(), [
      "input",
      "model",
      "parameters",
    ].sort());
    assert.deepEqual(parsedBody, {
      model: "doubao-seedance-2-0-mini-260615",
      input: {
        prompt: "storyboard frame becomes a short cinematic shot",
        media: [
          {
            role: "reference_image",
            type: "image_url",
            image_url: {
              url: "https://cdn.example.com/frame-extra-token.png",
            },
          },
        ],
      },
      parameters: {
        duration: 5,
        ratio: "16:9",
        resolution: "720p",
        generate_audio: true,
        watermark: false,
      },
    });
    assert.equal(result.externalRequestId, "extra-token-task-1");
    assert.equal(result.status, "accepted");
    assert.deepEqual(result.redactedRequest, parsedBody);
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
          filePaths: [
            "https://cdn.example.com/reference.png",
            "https://cdn.example.com/first.png",
            "https://cdn.example.com/character.png",
          ],
          firstFrame: { url: "https://cdn.example.com/first.png" },
          imageReference: { url: "https://cdn.example.com/first.png" },
          quickReferences: [
            { url: "https://cdn.example.com/first.png", matchedAssetKind: "prop" },
            { url: "https://cdn.example.com/character.png", matchedAssetKind: "character" },
          ],
          referenceUploads: [
            { url: "https://cdn.example.com/reference.png", matchedAssetKind: "scene" },
          ],
          videoFilePaths: [
            "https://cdn.example.com/video-file-path.mp4",
          ],
          editSourceVideo: {
            url: "https://cdn.example.com/edit.mp4",
          },
          audioFilePaths: [
            "https://cdn.example.com/audio-file-path.mp3",
            "https://cdn.example.com/audio-file-path-2.mp3",
          ],
          audios: [
            { url: "https://cdn.example.com/ignored-audio.mp3" },
          ],
          referenceAudio: {
            url: "https://cdn.example.com/reference.mp3",
          },
          generateAudio: true,
        },
      },
    });

    const parsedBody = JSON.parse(capturedBody) as Record<string, unknown>;
    assert.deepEqual(Object.keys(parsedBody).sort(), [
      "input",
      "model",
      "parameters",
    ].sort());
    assert.deepEqual(parsedBody, {
      model: "doubao-seedance-2-0-mini-260615",
      input: {
        prompt: "camera move prompt",
        media: [
          {
            role: "reference_image",
            type: "image_url",
            image_url: {
              url: "https://cdn.example.com/reference.png",
            },
          },
          {
            role: "reference_image",
            type: "image_url",
            image_url: {
              url: "https://cdn.example.com/first.png",
            },
          },
          {
            role: "reference_image",
            type: "image_url",
            image_url: {
              url: "https://cdn.example.com/character.png",
            },
          },
          {
            role: "reference_video",
            type: "video_url",
            video_url: {
              url: "https://cdn.example.com/video-file-path.mp4",
            },
          },
          {
            role: "reference_audio",
            type: "audio_url",
            audio_url: {
              url: "https://cdn.example.com/audio-file-path.mp3",
            },
          },
          {
            role: "reference_audio",
            type: "audio_url",
            audio_url: {
              url: "https://cdn.example.com/audio-file-path-2.mp3",
            },
          },
        ],
      },
      parameters: {
        duration: 8,
        ratio: "16:9",
        resolution: "720p",
        generate_audio: true,
        watermark: false,
      },
    });
  });

  it("keeps Volcengine Ark content configs on the official Seedance transport even with Extra Token key names", async () => {
    let capturedUrl = "";
    let capturedBody = "";

    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "custom_http",
        providerModel: "doubao-seedance-2-0-mini-260615",
        providerConfig: {
          baseURL: "https://ark.cn-beijing.volces.com",
          requestPath: "/api/v3/contents/generations/tasks",
          createTaskEndpoint: "/api/v3/contents/generations/tasks",
          requestFormat: "volcengine_ark_contents_generation",
          apiKeyEnv: "EXTRA_TOEKN_API_KEY",
        },
      },
      { EXTRA_TOEKN_API_KEY: "extra-token-value" },
      (async (url, init) => {
        capturedUrl = String(url);
        capturedBody = String(init?.body ?? "");
        return new Response(JSON.stringify({ data: { task_id: "extra-token-legacy-config" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    );

    await adapter.submit({
      providerRequestId: "provider-request-extra-token-legacy-config",
      providerName: "Extra Token",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-extra-token:task-legacy-config",
      payloadRef: "creator://payload-extra-token-legacy-config",
      payloadHash: "hash-extra-token-legacy-config",
      redactedPayload: {
        prompt: "legacy config should still use Extra Token transport",
        firstFrameUrl: "https://cdn.example.com/first.png",
        parameters: {
          durationSec: 5,
          resolution: "480p",
          ratio: "9:16",
          audioFilePaths: [
            "https://cdn.example.com/reference.mp3",
          ],
        },
      },
    });

    const parsedBody = JSON.parse(capturedBody) as Record<string, unknown>;
    assert.equal(capturedUrl, "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks");
    assert.deepEqual(Object.keys(parsedBody).sort(), [
      "content",
      "duration",
      "model",
      "ratio",
      "resolution",
      "watermark",
    ].sort());
    assert.deepEqual(parsedBody, {
      model: "doubao-seedance-2-0-mini-260615",
      content: [
        {
          type: "text",
          text: "legacy config should still use Extra Token transport",
        },
        {
          type: "audio_url",
          audio_url: { url: "https://cdn.example.com/reference.mp3" },
          role: "reference_audio",
        },
      ],
      ratio: "9:16",
      resolution: "480p",
      duration: 5,
      watermark: false,
    });
  });

  it("attaches the final Extra Token request body to provider errors", async () => {
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
      (async () =>
        new Response(
          JSON.stringify({
            error: {
              message: "parameters.duration must be an integer of at least 3 seconds.",
              type: "invalid_request_error",
              code: "invalid_request",
            },
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
    );

    await assert.rejects(
      adapter.submit({
        providerRequestId: "provider-request-extra-token-error",
        providerName: "Extra Token",
        providerOperation: "shot.video.generate",
        requestKey: "workflow-extra-token:task-error",
        payloadRef: "creator://payload-extra-token-error",
        payloadHash: "hash-extra-token-error",
        redactedPayload: {
          prompt: "bad upstream request still logs final body",
          parameters: {
            durationSec: 4,
            resolution: "480p",
            ratio: "9:16",
            filePaths: [
              "https://cdn.example.com/scene.png",
            ],
          },
        },
      }),
      (error) => {
        const request = (error as { providerRedactedRequest?: Record<string, unknown> }).providerRedactedRequest;
        assert.deepEqual(request, {
          model: "doubao-seedance-2-0-mini-260615",
          input: {
            prompt: "bad upstream request still logs final body",
            media: [
              {
                role: "reference_image",
                type: "image_url",
                image_url: {
                  url: "https://cdn.example.com/scene.png",
                },
              },
            ],
          },
          parameters: {
            ratio: "9:16",
            resolution: "720p",
            duration: 5,
            generate_audio: true,
            watermark: false,
          },
        });
        return true;
      },
    );
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
          baseURL: "https://www.extratoken.cn",
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
