import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GlobalAiOpcVideoProviderAdapter, buildGlobalAiOpcVideoPayload } from "../globalaiopc-video.provider-adapter.ts";
import { createProviderAdapterFromModelConfig } from "../provider-adapter.factory.ts";

const input = (redactedPayload: Record<string, unknown>) => ({
  providerRequestId: "provider-request",
  providerName: "GlobalAiOpc",
  providerOperation: "video.generate",
  requestKey: "request-key",
  payloadRef: "payload://ref",
  payloadHash: "hash",
  redactedPayload,
});

describe("GlobalAiOpc Model Center video adapter", () => {
  it("uses top-level Model Center fields and keeps full-reference media separate from frame fields", () => {
    const payload = buildGlobalAiOpcVideoPayload(input({
      prompt: "a moving shot",
      firstFrameUrl: "https://cdn.test/first.png",
      lastFrameUrl: "https://cdn.test/last.png",
      parameters: {
        referenceImages: [{ url: "https://cdn.test/character.png" }],
        referenceVideos: ["https://cdn.test/ref.mp4"],
        referenceAudio: [{ url: "https://cdn.test/ref.mp3" }],
        durationSec: 8,
        aspectRatio: "16:9",
        resolution: "1080P",
      },
    }), "kling-o3");

    assert.deepEqual(payload, {
      model: "kling-o3",
      prompt: "a moving shot",
      reference_images: ["https://cdn.test/character.png"],
      reference_videos: ["https://cdn.test/ref.mp4"],
      reference_audios: ["https://cdn.test/ref.mp3"],
      duration: 8,
      aspect_ratio: "16:9",
      resolution: "1080P",
      watermark: false,
    });
    assert.equal("first_image" in payload, false);
    assert.equal("last_image" in payload, false);
  });

  it("sends first/last image only for a frame request", () => {
    const payload = buildGlobalAiOpcVideoPayload(input({
      prompt: "animate this",
      firstFrameUrl: "https://cdn.test/first.png",
      lastFrameUrl: "https://cdn.test/last.png",
      parameters: { durationSec: 5, referenceMode: "frame", generateAudio: true },
    }), "sd_2.0_special");

    assert.equal(payload.first_image, "https://cdn.test/first.png");
    assert.equal(payload.last_image, "https://cdn.test/last.png");
    assert.equal("reference_mode" in payload, false);
    assert.equal("reference_images" in payload, false);
    assert.equal(payload.generate_audio, true);
  });

  it("submits prompt-only payload when frame mode has no usable material", () => {
    const payload = buildGlobalAiOpcVideoPayload(input({
      prompt: "generate from text only",
      parameters: { durationSec: 5, referenceMode: "frame" },
    }), "sd_2.0_special");

    assert.equal(payload.prompt, "generate from text only");
    assert.equal("first_image" in payload, false);
    assert.equal("last_image" in payload, false);
    assert.equal("reference_mode" in payload, false);
  });

  it("keeps frame requests separate from reference media", () => {
    const payload = buildGlobalAiOpcVideoPayload(input({
      prompt: "animate the transition",
      firstFrameUrl: "https://cdn.test/first.png",
      lastFrameUrl: "https://cdn.test/last.png",
      parameters: {
        referenceMode: "frame",
        referenceImages: ["https://cdn.test/reference.png"],
      },
    }), "kling-o3");

    assert.equal(payload.first_image, "https://cdn.test/first.png");
    assert.equal(payload.last_image, "https://cdn.test/last.png");
    assert.equal("reference_images" in payload, false);
  });

  it("never sends stale frame fields for the full-reference generation mode", () => {
    const payload = buildGlobalAiOpcVideoPayload(input({
      prompt: "use the selected references",
      firstFrameUrl: "https://cdn.test/stale-first.png",
      lastFrameUrl: "https://cdn.test/stale-last.png",
      parameters: { mode: "reference-video", durationSec: 5 },
    }), "sd_2.0_special");

    assert.equal("first_image" in payload, false);
    assert.equal("last_image" in payload, false);
    assert.equal("reference_images" in payload, false);
  });

  it("submits and polls the configured Model Center endpoints", async () => {
    const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
    const adapter = new GlobalAiOpcVideoProviderAdapter({
      apiKey: "kyy-key",
      model: "wan2.7-r2v",
      createTaskEndpoint: "https://zcbservice.test/v2/model-center/tasks",
      queryTaskEndpoint: "https://zcbservice.test/v2/model-center/tasks/{taskId}",
      fetchImpl: (async (url, init) => {
        calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
        return calls.length === 1
          ? Response.json({ id: "kyy-task-1", status: "queued" })
          : Response.json({ id: "kyy-task-1", status: "completed", result_url: "https://cdn.test/out.mp4" });
      }) as typeof fetch,
    });
    const submitted = await adapter.submit(input({ prompt: "reference motion", parameters: { referenceImages: ["https://cdn.test/ref.png"], durationSec: 5 } }));
    assert.equal(submitted.externalRequestId, "kyy-task-1");
    const polled = await adapter.poll({ externalRequestId: "kyy-task-1" });
    assert.equal(polled.status, "succeeded");
    assert.equal(polled.videoUrl, "https://cdn.test/out.mp4");
    assert.equal(calls[0]?.url, "https://zcbservice.test/v2/model-center/tasks");
    assert.equal(calls[1]?.url, "https://zcbservice.test/v2/model-center/tasks/kyy-task-1");
  });

  it("reports an HTTP 200 business error as failed instead of queued", async () => {
    const adapter = new GlobalAiOpcVideoProviderAdapter({
      apiKey: "kyy-key",
      model: "sd_2.0_special",
      createTaskEndpoint: "https://zcbservice.test/v2/model-center/tasks",
      queryTaskEndpoint: "https://zcbservice.test/v2/model-center/tasks/{taskId}",
      fetchImpl: (async () => Response.json({ code: "204", msg: "登录验证失败" })) as typeof fetch,
    });

    const polled = await adapter.poll({ externalRequestId: "kyy-task-auth-failed" });

    assert.equal(polled.status, "failed");
    assert.equal(polled.redactedResponse.failureCode, "global_ai_opc_video_poll_business_error");
    assert.equal(polled.redactedResponse.providerErrorCode, "204");
    assert.equal(polled.redactedResponse.providerMessage, "登录验证失败");
  });

  it("reports an unknown provider status as failed instead of queued", async () => {
    const adapter = new GlobalAiOpcVideoProviderAdapter({
      apiKey: "kyy-key",
      model: "sd_2.0_special",
      createTaskEndpoint: "https://zcbservice.test/v2/model-center/tasks",
      queryTaskEndpoint: "https://zcbservice.test/v2/model-center/tasks/{taskId}",
      fetchImpl: (async () => Response.json({ id: "kyy-task-unknown", status: "unknown" })) as typeof fetch,
    });

    const polled = await adapter.poll({ externalRequestId: "kyy-task-unknown" });

    assert.equal(polled.status, "failed");
    assert.equal(polled.redactedResponse.failureCode, "global_ai_opc_video_poll_invalid_response");
    assert.equal(polled.redactedResponse.providerStatus, "unknown");
  });

  it("is selected for the GlobalAiOpc video protocol", async () => {
    const adapter = createProviderAdapterFromModelConfig({
      providerProtocol: "globalaiopc_video",
      mediaType: "video",
      providerModel: "sd_2.0_special",
      providerConfig: {
        baseURL: "https://zcbservice.test/kyyReactApiServer",
        createTaskEndpoint: "/v2/model-center/tasks",
        queryTaskEndpoint: "/v2/model-center/tasks/{taskId}",
        requestFormat: "globalaiopc_model_center_video",
        apiKeyEnv: "GLOBAL_AI_OPC_API_KEY",
      },
    }, { GLOBAL_AI_OPC_API_KEY: "kyy-key" }, (async () => Response.json({ id: "task" })) as typeof fetch);
    assert.ok(adapter instanceof GlobalAiOpcVideoProviderAdapter);
  });

});
