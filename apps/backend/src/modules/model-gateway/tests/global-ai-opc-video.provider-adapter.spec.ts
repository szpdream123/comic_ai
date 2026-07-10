import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildGlobalAiOpcVideoPayload,
  GlobalAiOpcVideoProviderAdapter,
} from "../global-ai-opc-video.provider-adapter.ts";
import { createProviderAdapterFromModelConfig } from "../provider-adapter.factory.ts";

describe("GlobalAiOpc video provider adapter", () => {
  it("builds video requests from workbench prompt and reference media", () => {
    assert.deepEqual(
      buildGlobalAiOpcVideoPayload({
        providerRequestId: "provider-request-global-video",
        providerName: "GlobalAiOpc",
        providerOperation: "shot.video.generate",
        requestKey: "workflow-global-video:task-global-video",
        payloadRef: "creator://payload-global-video",
        payloadHash: "hash-global-video",
        redactedPayload: {
          prompt: "A cinematic gate shot",
          firstFrameUrl: "https://cdn.example.com/first.png",
          parameters: {
            durationSec: 5,
            resolution: "720p",
            aspectRatio: "16:9",
            mode: "reference-video",
            quickReferences: [{ url: "https://cdn.example.com/character.png" }],
            referenceVideos: [{ url: "https://cdn.example.com/reference.mp4" }],
            referenceAudio: { url: "https://cdn.example.com/reference.mp3" },
            seed: 12,
          },
        },
      }, {
        model: "sd2_manxue",
      }),
      {
        model: "sd2_manxue_video_720p",
        prompt: "A cinematic gate shot",
        referenceImages: [
          "https://cdn.example.com/first.png",
          "https://cdn.example.com/character.png",
        ],
        referenceVideos: ["https://cdn.example.com/reference.mp4"],
        referenceAudios: ["https://cdn.example.com/reference.mp3"],
        duration: 5,
        ratio: "16:9",
        seed: 12,
      },
    );
  });

  it("filters inline audio data and uses provider model names with resolution suffixes", () => {
    assert.deepEqual(
      buildGlobalAiOpcVideoPayload({
        providerRequestId: "provider-request-global-video-inline-audio",
        providerName: "GlobalAiOpc",
        providerOperation: "shot.video.generate",
        requestKey: "workflow-global-video:task-inline-audio",
        payloadRef: "creator://payload-global-video-inline-audio",
        payloadHash: "hash-global-video-inline-audio",
        redactedPayload: {
          prompt: "A reference guided shot",
          parameters: {
            mode: "reference-video",
            resolution: "720p",
            ratio: "9:16",
            firstFrame: { url: "https://cdn.example.com/first.png" },
            referenceAudio: { url: "data:audio/wav;base64,UklGRj" },
            audios: ["data:audio/wav;base64,UklGRj"],
          },
        },
      }, {
        model: "sd2_manxue_fast",
      }),
      {
        model: "sd2_manxue_fast_720p",
        prompt: "A reference guided shot",
        referenceImages: ["https://cdn.example.com/first.png"],
        ratio: "9:16",
      },
    );
  });

  it("submits and polls GlobalAiOpc video tasks", async () => {
    const capturedUrls: string[] = [];
    let capturedCreateBody = "";
    const adapter = new GlobalAiOpcVideoProviderAdapter({
      apiKey: "global-ai-opc-key",
      model: "grok_video3",
      createTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/grok/videos",
      queryTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/result/{taskId}",
      fetchImpl: (async (url, init) => {
        capturedUrls.push(String(url));
        if (String(init?.method || "GET").toUpperCase() === "POST") {
          capturedCreateBody = String(init?.body ?? "");
          return new Response(JSON.stringify({ id: "global-video-task-1", status: "queued" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            id: "global-video-task-1",
            status: "completed",
            video_url: "https://cdn.global-ai-opc.example/video.mp4",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    });

    const submitted = await adapter.submit({
      providerRequestId: "provider-request-global-video-submit",
      providerName: "GlobalAiOpc",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-global-video:task-submit",
      payloadRef: "creator://payload-global-video-submit",
      payloadHash: "hash-global-video-submit",
      redactedPayload: {
        prompt: "slow push in",
        parameters: {
          durationSec: 5,
          resolution: "720p",
          aspectRatio: "16:9",
          quickReferences: [
            { url: "https://cdn.example.com/grok-reference.png" },
          ],
        },
      },
    });
    const polled = await adapter.poll({ externalRequestId: submitted.externalRequestId });

    assert.deepEqual(capturedUrls, [
      "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/grok/videos",
      "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/result/global-video-task-1",
    ]);
    assert.deepEqual(JSON.parse(capturedCreateBody), {
      model: "grok_video3",
      prompt: "slow push in",
      duration: 5,
      aspect_ratio: "16:9",
      resolution: "720p",
      image_urls: ["https://cdn.example.com/grok-reference.png"],
    });
    assert.deepEqual(submitted.redactedRequest, JSON.parse(capturedCreateBody));
    assert.equal(submitted.redactedResponse?.model, "grok_video3");
    assert.equal(submitted.status, "accepted");
    assert.equal(polled.status, "succeeded");
    assert.equal(polled.videoUrl, "https://cdn.global-ai-opc.example/video.mp4");
  });

  it("builds the GlobalAiOpc video adapter before the image key route", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "custom_http",
        providerModel: "sd2_manxue",
        providerConfig: {
          baseURL: "https://zcbservice.aizfw.cn/kyyReactApiServer",
          createTaskEndpoint: "/v1/sd2_manxue/videos",
          queryTaskEndpoint: "/v1/result/{taskId}",
          apiKeyEnv: "GLOBAL_AI_OPC_API_KEY",
          requestFormat: "globalaiopc_sd2_manxue",
        },
      },
      { GLOBAL_AI_OPC_API_KEY: "global-ai-opc-key" },
      (async (url, init) => {
        capturedUrl = String(url);
        capturedBody = String(init?.body ?? "");
        return new Response(JSON.stringify({ id: "global-video-task-2", status: "queued" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    );

    const result = await adapter.submit({
      providerRequestId: "provider-request-global-video-config",
      providerName: "GlobalAiOpc",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-global-video:task-config",
      payloadRef: "creator://payload-global-video-config",
      payloadHash: "hash-global-video-config",
      redactedPayload: {
        prompt: "misty doorway",
        parameters: { resolution: "720p" },
      },
    });

    assert.equal(capturedUrl, "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/sd2_manxue/videos");
    assert.equal(JSON.parse(capturedBody).model, "sd2_manxue_720p");
    assert.equal(result.redactedResponse?.model, "sd2_manxue_720p");
    assert.equal(result.externalRequestId, "global-video-task-2");
  });

  it("builds the GlobalAiOpc video adapter by key and video endpoint", async () => {
    let capturedUrl = "";
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "custom_http",
        providerModel: "sd2_manxue_fast",
        providerConfig: {
          baseURL: "https://zcbservice.aizfw.cn/kyyReactApiServer",
          createTaskEndpoint: "/v1/sd2_manxue/videos",
          queryTaskEndpoint: "/v1/result/{taskId}",
          apiKeyEnv: "GLOBAL_AI_OPC_API_KEY",
          requestFormat: "json",
        },
      },
      { GLOBAL_AI_OPC_API_KEY: "global-ai-opc-key" },
      (async (url) => {
        capturedUrl = String(url);
        return new Response(JSON.stringify({ id: "global-video-task-3", status: "queued" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    );

    const result = await adapter.submit({
      providerRequestId: "provider-request-global-video-key-only",
      providerName: "GlobalAiOpc",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-global-video:task-key-only",
      payloadRef: "creator://payload-global-video-key-only",
      payloadHash: "hash-global-video-key-only",
      redactedPayload: {
        prompt: "mist in the city",
      },
    });

    assert.equal(capturedUrl, "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/sd2_manxue/videos");
    assert.equal(result.externalRequestId, "global-video-task-3");
  });
});
