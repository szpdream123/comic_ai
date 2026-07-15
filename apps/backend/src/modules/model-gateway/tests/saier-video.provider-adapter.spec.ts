import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createProviderAdapterFromModelConfig } from "../provider-adapter.factory.ts";
import { buildSaierVideoPayload } from "../saier-video.provider-adapter.ts";

describe("Saier video provider adapter", () => {
  it("assembles the standard, fast, and mini provider models from the selected resolution", () => {
    const build = (template: string, resolution: string) => buildSaierVideoPayload({
      providerRequestId: "provider-request-saier-model",
      providerName: "塞尔",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-saier:task-model",
      payloadRef: "creator://payload-saier-model",
      payloadHash: "hash-saier-model",
      redactedPayload: {
        prompt: "测试动态模型名称",
        parameters: { resolution },
      },
    }, template);

    assert.equal(
      build("mg-seedance2.0 -{resolution} mini-15s", "480p").model,
      "mg-seedance2.0 -480p mini-15s",
    );
    assert.equal(
      build("mg-seedance2.0 -{resolution}-15s", "1080p").model,
      "mg-seedance2.0 -1080p-15s",
    );
    assert.equal(
      build("mg-seedance2.0 -{resolution} fast-15s", "720p").model,
      "mg-seedance2.0 -720p fast-15s",
    );
    assert.equal(build("mg-seedance2.0 -{resolution}-15s", "720p").seconds, "1");
  });

  it("submits reference video generation with the documented OpenAI-compatible payload", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody = "";
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "saier_video",
        providerModel: "mg-seedance2.0 -{resolution} fast-15s",
        providerConfig: {
          baseURL: "https://saierapi.cn/",
          createTaskEndpoint: "/v1/video/generations",
          queryTaskEndpoint: "/v1/video/generations/{taskId}",
          apiKeyEnv: "SAI_ER_API_KEY",
        },
      },
      { SAI_ER_API_KEY: "saier-secret" },
      (async (url, init) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers;
        capturedBody = String(init?.body ?? "");
        return new Response(JSON.stringify({ id: "saier-task-1", status: "queued" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    );

    const result = await adapter.submit({
      providerRequestId: "provider-request-saier",
      providerName: "塞尔",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-saier:task-saier",
      payloadRef: "creator://payload-saier",
      payloadHash: "hash-saier",
      redactedPayload: {
        prompt: "把参考图融合成连贯镜头",
        firstFrameUrl: "https://cdn.example.com/first.png",
        parameters: {
          lastFrame: { url: "https://cdn.example.com/last.png" },
          referenceImages: [
            { url: "https://cdn.example.com/reference.png" },
            { url: "https://cdn.example.com/first.png" },
          ],
          sourceVideo: { url: "https://cdn.example.com/reference.mp4" },
          referenceAudio: { url: "https://cdn.example.com/reference.mp3" },
          audioFilePaths: ["data:audio/wav;base64,AAAA"],
          aspectRatio: "16:9",
          resolution: "720p",
          durationSec: 6,
          seed: 11,
          cameraFixed: false,
          returnLastFrame: true,
          generateAudio: true,
          watermark: false,
        },
      },
    });

    assert.equal(capturedUrl, "https://saierapi.cn/v1/video/generations");
    assert.deepEqual(capturedHeaders, {
      authorization: "Bearer saier-secret",
      "content-type": "application/json",
    });
    assert.deepEqual(JSON.parse(capturedBody), {
      model: "mg-seedance2.0 -720p fast-15s",
      prompt: "把参考图融合成连贯镜头",
      seconds: "1",
      metadata: {
        content: [
          {
            type: "image_url",
            role: "reference_image",
            image_url: { url: "https://cdn.example.com/first.png" },
          },
          {
            type: "image_url",
            role: "reference_image",
            image_url: { url: "https://cdn.example.com/last.png" },
          },
          {
            type: "image_url",
            role: "reference_image",
            image_url: { url: "https://cdn.example.com/reference.png" },
          },
          {
            type: "video_url",
            role: "reference_video",
            video_url: { url: "https://cdn.example.com/reference.mp4" },
          },
          {
            type: "audio_url",
            role: "reference_audio",
            audio_url: { url: "https://cdn.example.com/reference.mp3" },
          },
        ],
        ratio: "16:9",
        resolution: "720p",
        seed: 11,
        camera_fixed: false,
        return_last_frame: true,
        generate_audio: true,
        watermark: false,
      },
    });
    assert.equal(result.externalRequestId, "saier-task-1");
    assert.deepEqual(result.redactedRequest, JSON.parse(capturedBody));
  });

  it("polls Saier tasks and reads the completed video from metadata.url", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "saier_video",
        providerModel: "mg-seedance2.0 -{resolution} mini-15s",
        providerConfig: {
          baseURL: "https://saierapi.cn",
          createTaskEndpoint: "/v1/video/generations",
          queryTaskEndpoint: "/v1/video/generations/{taskId}",
          apiKeyEnv: "SAI_ER_API_KEY",
        },
      },
      { SAI_ER_API_KEY: "saier-secret" },
      (async (url, init) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers;
        return new Response(JSON.stringify({
          id: "saier task/2",
          status: "completed",
          metadata: { url: "https://cdn.saierapi.cn/results/video.mp4" },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    );

    const result = await adapter.poll({ externalRequestId: "saier task/2" });

    assert.equal(capturedUrl, "https://saierapi.cn/v1/video/generations/saier%20task%2F2");
    assert.deepEqual(capturedHeaders, { authorization: "Bearer saier-secret" });
    assert.equal(result.status, "succeeded");
    assert.equal(result.videoUrl, "https://cdn.saierapi.cn/results/video.mp4");
  });
});
