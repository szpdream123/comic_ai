import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LingdongApiProviderAdapter } from "../lingdong-api.provider-adapter.ts";
import { createProviderAdapterFromModelConfig } from "../provider-adapter.factory.ts";

describe("lingdong api provider adapter", () => {
  it("builds sd-2-2 video payloads with the configured model profile", async () => {
    let capturedBody = "";
    const adapter = new LingdongApiProviderAdapter({
      apiKey: "lingdong-key",
      model: "sd-2-2",
      mediaType: "video",
      createTaskEndpoint: "https://www.lingdongapi.com/v1/videos",
      fetchImpl: (async (_url, init) => {
        capturedBody = String(init?.body ?? "");
        return new Response(JSON.stringify({ id: "sd-2-2-task", status: "queued" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });

    await adapter.submit({
      providerRequestId: "provider-request-sd-2-2",
      providerName: "lingdong",
      providerOperation: "episode.video.generate",
      requestKey: "workflow:sd-2-2",
      payloadRef: "creator://sd-2-2",
      payloadHash: "sd-2-2-hash",
      redactedPayload: {
        prompt: "slow camera push",
        parameters: {
          durationSec: 15,
          ratio: "9:16",
          resolution: "720p",
          filePaths: ["https://cdn.example.com/reference.png"],
        },
      },
    });

    assert.deepEqual(JSON.parse(capturedBody), {
      model: "sd-2-2",
      ratio: "9:16",
      duration: 15,
      resolution: "720p",
      generate_audio: true,
      watermark: false,
      prompt: "slow camera push",
      images: ["https://cdn.example.com/reference.png"],
    });
  });

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

  it("submits Lingdong video requests with the relay request shape", async () => {
    let capturedUrl = "";
    let capturedBody = "";

    const adapter = new LingdongApiProviderAdapter({
      apiKey: "lingdong-key",
      mediaType: "video",
      model: "sora-2",
      createTaskEndpoint: "https://www.lingdongapi.com/v1/video/generations",
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
          size: "1280x720",
          durationSec: 4,
          resolution: "1080p",
          aspectRatio: "16:9",
          ratio: "9:16",
          orientation: "portrait",
        },
      },
    });

    assert.equal(capturedUrl, "https://www.lingdongapi.com/v1/video/generations");
    assert.deepEqual(JSON.parse(capturedBody), {
      model: "sora-2",
      prompt: "镜头缓慢推进，少女抬头看向城市天际线",
      images: [
        "https://example.com/first-frame.png",
        "https://example.com/character.png",
      ],
      videos: ["https://example.com/reference.mp4"],
      audios: ["https://example.com/reference.mp3"],
      ratio: "9:16",
      duration: 4,
      resolution: "1080p",
      generate_audio: true,
      watermark: false,
      aspect_ratio: "16:9",
      orientation: "portrait",
      size: "1280x720",
    });
    assert.deepEqual(result.redactedRequest, JSON.parse(capturedBody));
    assert.equal(result.status, "accepted");
    assert.equal(result.externalRequestId, "lingdong-task-123");
  });

  it("submits sd-2-fast-720 video requests with media urls split by kind", async () => {
    let capturedBody = "";

    const adapter = new LingdongApiProviderAdapter({
      apiKey: "lingdong-key",
      mediaType: "video",
      model: "sd-2-7",
      createTaskEndpoint: "https://www.lingdongapi.com/v1/video/generations",
      fetchImpl: (async (_url, init) => {
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            task_id: "lingdong-task-727",
            status: "queued",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    });

    const result = await adapter.submit({
      providerRequestId: "provider-request-video-727",
      providerName: "lingdong",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-video:task-video-727",
      payloadRef: "creator://payload-video-727",
      payloadHash: "hash-video-727",
      redactedPayload: {
        prompt: "人物保持口型同步，镜头稳定推进",
        images: ["https://example.com/direct-image-720.png"],
        videos: ["https://example.com/direct-video-720.mp4"],
        audios: ["https://example.com/direct-audio-720.mp3"],
        firstFrameUrl: "https://example.com/first-frame-727.png",
        generate_audio: true,
        parameters: {
          filePaths: [
            "https://example.com/scene-720.png",
            "https://example.com/character-720.png",
          ],
          audioFilePaths: [
            "https://example.com/audio-file-path-720.mp3",
          ],
          audios: [{ url: "https://example.com/reference-727.mp3" }],
          videos: [{ url: "https://example.com/reference-727.mp4" }],
          durationSec: 10,
          resolution: "720P",
          aspectRatio: "16:9",
          orientation: "portrait",
          size: "1280x720",
          seed: 27,
          generateAudio: true,
          watermark: false,
        },
      },
    });

    assert.deepEqual(JSON.parse(capturedBody), {
      model: "sd-2-fast-720",
      ratio: "16:9",
      duration: 10,
      resolution: "720P",
      generate_audio: true,
      watermark: false,
      prompt: "人物保持口型同步，镜头稳定推进",
      images: [
        "https://example.com/scene-720.png",
        "https://example.com/character-720.png",
        "https://example.com/direct-image-720.png",
        "https://example.com/first-frame-727.png",
      ],
      videos: [
        "https://example.com/direct-video-720.mp4",
        "https://example.com/reference-727.mp4",
      ],
      audios: [
        "https://example.com/audio-file-path-720.mp3",
        "https://example.com/direct-audio-720.mp3",
        "https://example.com/reference-727.mp3",
      ],
      aspect_ratio: "16:9",
      orientation: "portrait",
      size: "1280x720",
      seed: 27,
    });
    assert.deepEqual(result.redactedRequest, JSON.parse(capturedBody));
  });

  it("attaches the final Lingdong video request shape when submission fails", async () => {
    const adapter = new LingdongApiProviderAdapter({
      apiKey: "lingdong-key",
      mediaType: "video",
      model: "sd-2-fast-720",
      createTaskEndpoint: "https://www.lingdongapi.com/v1/videos",
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            error: {
              message: "素材格式不被支持，请更换素材或转码后重试。",
              code: "invalid_request_error",
            },
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
    });

    await assert.rejects(
      () => adapter.submit({
        providerRequestId: "provider-request-video-failed",
        providerName: "lingdong",
        providerOperation: "shot.video.generate",
        requestKey: "workflow-video:task-video-failed",
        payloadRef: "creator://payload-video-failed",
        payloadHash: "hash-video-failed",
        redactedPayload: {
          prompt: "人物保持口型同步，镜头稳定推进",
          parameters: {
            filePaths: ["https://example.com/scene.png"],
            audios: [{ url: "https://example.com/reference.mp3" }],
            durationSec: 10,
            resolution: "720p",
            ratio: "9:16",
          },
        },
      }),
      (error) => {
        assert.deepEqual(
          (error as { providerRedactedRequest?: unknown }).providerRedactedRequest,
          {
            model: "sd-2-fast-720",
            ratio: "9:16",
            duration: 10,
            resolution: "720p",
            generate_audio: true,
            watermark: false,
            prompt: "人物保持口型同步，镜头稳定推进",
            images: ["https://example.com/scene.png"],
            audios: ["https://example.com/reference.mp3"],
          },
        );
        return true;
      },
    );
  });

  it("builds Lingdong video adapters from custom HTTP configs with the sd2_ld key", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody = "";

    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "custom_http",
        providerModel: "sd-2-fast-720",
        providerConfig: {
          baseURL: "https://www.lingdongapi.com",
          requestPath: "/v1/videos",
          createTaskEndpoint: "/v1/videos",
          queryTaskEndpoint: "/v1/video/generations/{taskId}",
          requestFormat: "lingdong_video",
          apiKeyEnv: "sd2_ld",
        },
      },
      { sd2_ld: "lingdong-key" },
      (async (url, init) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers;
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            task_id: "lingdong-custom-http-task",
            status: "queued",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    );

    await adapter.submit({
      providerRequestId: "provider-request-custom-lingdong",
      providerName: "lingdong",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-video:task-custom-lingdong",
      payloadRef: "creator://payload-custom-lingdong",
      payloadHash: "hash-custom-lingdong",
      redactedPayload: {
        prompt: "人物保持口型同步，镜头稳定推进",
        parameters: {
          images: ["https://example.com/image-url.png"],
          videos: ["https://example.com/video-url.mp4"],
          audios: ["https://example.com/audio-url.mp3"],
          aspect_ratio: "16:9",
          duration: 10,
          resolution: "720P",
          orientation: "portrait",
          size: "1280x720",
          seed: 27,
          generate_audio: true,
          watermark: false,
        },
      },
    });

    assert.equal(capturedUrl, "https://www.lingdongapi.com/v1/videos");
    assert.deepEqual(capturedHeaders, {
      authorization: "Bearer lingdong-key",
      "content-type": "application/json",
    });
    assert.deepEqual(JSON.parse(capturedBody), {
      model: "sd-2-fast-720",
      ratio: "16:9",
      duration: 10,
      resolution: "720P",
      generate_audio: true,
      watermark: false,
      prompt: "人物保持口型同步，镜头稳定推进",
      images: ["https://example.com/image-url.png"],
      videos: ["https://example.com/video-url.mp4"],
      audios: ["https://example.com/audio-url.mp3"],
      aspect_ratio: "16:9",
      orientation: "portrait",
      size: "1280x720",
      seed: 27,
    });
  });

  it("uses the Lingdong adapter when legacy video configs select the sd2_ld key", async () => {
    let capturedUrl = "";
    let capturedBody = "";

    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "volcengine_ark_video",
        providerModel: "sd-2-fast-720",
        providerConfig: {
          baseURL: "https://ark.cn-beijing.volces.com",
          requestPath: "/api/v3/contents/generations/tasks",
          createTaskEndpoint: "/api/v3/contents/generations/tasks",
          queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
          requestFormat: "volcengine_ark_contents_generation",
          apiKeyEnv: "sd2_ld",
        },
      },
      { sd2_ld: "lingdong-key" },
      (async (url, init) => {
        capturedUrl = String(url);
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            task_id: "lingdong-key-routed-task",
            status: "queued",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    );

    await adapter.submit({
      providerRequestId: "provider-request-lingdong-key-route",
      providerName: "lingdong",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-video:task-lingdong-key-route",
      payloadRef: "creator://payload-lingdong-key-route",
      payloadHash: "hash-lingdong-key-route",
      redactedPayload: {
        prompt: "镜头稳定推进",
        parameters: {
          images: ["https://example.com/image-url.png"],
          duration: 10,
          resolution: "720P",
          aspect_ratio: "16:9",
          generate_audio: true,
          watermark: false,
        },
      },
    });

    assert.equal(capturedUrl, "https://www.lingdongapi.com/v1/videos");
    assert.deepEqual(JSON.parse(capturedBody), {
      model: "sd-2-fast-720",
      ratio: "16:9",
      duration: 10,
      resolution: "720P",
      generate_audio: true,
      watermark: false,
      prompt: "镜头稳定推进",
      images: ["https://example.com/image-url.png"],
      aspect_ratio: "16:9",
    });
  });

  it("converts platform filePaths into Lingdong documented video media fields", async () => {
    let capturedUrl = "";
    let capturedBody = "";

    const adapter = new LingdongApiProviderAdapter({
      apiKey: "lingdong-key",
      mediaType: "video",
      model: "cvk",
      createTaskEndpoint: "https://www.lingdongapi.com/v1/video/generations",
      fetchImpl: (async (url, init) => {
        capturedUrl = String(url);
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            task_id: "lingdong-cvk-task",
            status: "queued",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    });

    await adapter.submit({
      providerRequestId: "provider-request-cvk",
      providerName: "lingdong",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-video:task-video-cvk",
      payloadRef: "creator://payload-video-cvk",
      payloadHash: "hash-video-cvk",
      redactedPayload: {
        prompt: "镜头从城外战场推近主角",
        parameters: {
          filePaths: [
            "https://example.com/first-frame.png",
            "https://example.com/reference.mp4",
            "https://example.com/voice.wav",
          ],
          ratio: "9:16",
          resolution: "720p",
          durationSec: 15,
        },
      },
    });

    assert.equal(capturedUrl, "https://www.lingdongapi.com/v1/video/generations");
    assert.deepEqual(JSON.parse(capturedBody), {
      model: "cvk",
      prompt: "镜头从城外战场推近主角",
      images: ["https://example.com/first-frame.png"],
      videos: ["https://example.com/reference.mp4"],
      audios: ["https://example.com/voice.wav"],
      duration: 15,
      resolution: "720p",
      ratio: "9:16",
    });
  });

  it("returns Lingdong authenticated content endpoints for worker-side persistence", async () => {
    const adapter = new LingdongApiProviderAdapter({
      apiKey: "lingdong-key",
      mediaType: "video",
      model: "sora-2",
      createTaskEndpoint: "https://www.lingdongapi.com/v1/video/generations",
      queryTaskEndpoint: "https://www.lingdongapi.com/v1/video/generations/{taskId}",
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            id: "lingdong-task-789",
            status: "succeeded",
            content_url: "https://www.lingdongapi.com/v1/videos/lingdong-task-789/content",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
    });

    const result = await adapter.poll({ externalRequestId: "lingdong-task-789" });

    assert.equal(result.status, "succeeded");
    assert.equal(result.videoUrl, "https://www.lingdongapi.com/v1/videos/lingdong-task-789/content");
  });

  it("derives the documented Lingdong video content endpoint when poll succeeds without a URL field", async () => {
    const adapter = new LingdongApiProviderAdapter({
      apiKey: "lingdong-key",
      mediaType: "video",
      model: "sora-2",
      createTaskEndpoint: "https://www.lingdongapi.com/v1/video/generations",
      queryTaskEndpoint: "https://www.lingdongapi.com/v1/video/generations/{taskId}",
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            id: "lingdong-task-derived",
            status: "succeeded",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
    });

    const result = await adapter.poll({ externalRequestId: "lingdong-task-derived" });

    assert.equal(result.status, "succeeded");
    assert.equal(result.videoUrl, "https://www.lingdongapi.com/v1/videos/lingdong-task-derived/content");
  });

  it("does not derive Lingdong content endpoints while a task is still running", async () => {
    const adapter = new LingdongApiProviderAdapter({
      apiKey: "lingdong-key",
      mediaType: "video",
      model: "sora-2",
      createTaskEndpoint: "https://www.lingdongapi.com/v1/video/generations",
      queryTaskEndpoint: "https://www.lingdongapi.com/v1/video/generations/{taskId}",
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            id: "lingdong-task-running",
            status: "processing",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
    });

    const result = await adapter.poll({ externalRequestId: "lingdong-task-running" });

    assert.equal(result.status, "running");
    assert.equal(result.videoUrl, undefined);
  });

  it("returns Lingdong public video URLs from poll results", async () => {
    const adapter = new LingdongApiProviderAdapter({
      apiKey: "lingdong-key",
      mediaType: "video",
      model: "sora-2",
      createTaskEndpoint: "https://www.lingdongapi.com/v1/video/generations",
      queryTaskEndpoint: "https://www.lingdongapi.com/v1/video/generations/{taskId}",
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            id: "lingdong-task-public-video",
            status: "succeeded",
            video_url: "https://cdn.lingdongapi.example/video.mp4",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
    });

    const result = await adapter.poll({ externalRequestId: "lingdong-task-public-video" });

    assert.equal(result.status, "succeeded");
    assert.equal(result.videoUrl, "https://cdn.lingdongapi.example/video.mp4");
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

  it("builds Lingdong video adapters from model config and submits configured parameters", async () => {
    let capturedUrl = "";
    let capturedBody = "";

    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "lingdong_api",
        providerModel: "cvk",
        providerConfig: {
          baseURL: "https://www.lingdongapi.com",
          mediaType: "video",
          createTaskEndpoint: "/v1/video/generations",
          queryTaskEndpoint: "/v1/video/generations/{taskId}",
          apiKeyEnv: "sd2_ld",
          requestFormat: "lingdong_video",
        },
      },
      { sd2_ld: "lingdong-key" },
      (async (url, init) => {
        capturedUrl = String(url);
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({ task_id: "lingdong-cvk-task", status: "queued" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    );

    const result = await adapter.submit({
      providerRequestId: "provider-request-cvk",
      providerName: "灵动中转",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-cvk:task-cvk",
      payloadRef: "creator://payload-cvk",
      payloadHash: "hash-cvk",
      redactedPayload: {
        prompt: "镜头推入雨夜城门",
        firstFrameUrl: "https://example.com/first-frame.png",
        parameters: {
          ratio: "9:16",
          resolution: "720p",
          durationSec: 10,
        },
      },
    });

    assert.equal(capturedUrl, "https://www.lingdongapi.com/v1/video/generations");
    assert.deepEqual(JSON.parse(capturedBody), {
      model: "cvk",
      prompt: "镜头推入雨夜城门",
      images: ["https://example.com/first-frame.png"],
      duration: 10,
      resolution: "720p",
      ratio: "9:16",
    });
    assert.equal(result.status, "accepted");
    assert.equal(result.externalRequestId, "lingdong-cvk-task");
  });

  it("maps frontend video parameter aliases to Lingdong video payload fields", async () => {
    let capturedBody = "";

    const adapter = new LingdongApiProviderAdapter({
      apiKey: "lingdong-key",
      mediaType: "video",
      model: "cvk",
      createTaskEndpoint: "https://www.lingdongapi.com/v1/video/generations",
      fetchImpl: (async (_url, init) => {
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({ task_id: "lingdong-cvk-alias-task", status: "queued" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    });

    await adapter.submit({
      providerRequestId: "provider-request-cvk-alias",
      providerName: "灵动中转",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-cvk-alias:task-cvk-alias",
      payloadRef: "creator://payload-cvk-alias",
      payloadHash: "hash-cvk-alias",
      redactedPayload: {
        prompt: "镜头穿过雾气",
        parameters: {
          aspectRatio: "9:16",
          videoResolution: "720P",
          videoDurationSec: "15",
        },
      },
    });

    assert.deepEqual(JSON.parse(capturedBody), {
      model: "cvk",
      prompt: "镜头穿过雾气",
      duration: 15,
      resolution: "720p",
      ratio: "9:16",
    });
  });
});
