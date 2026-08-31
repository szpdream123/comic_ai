import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GlobalAiOpcVideoProviderAdapter, buildGlobalAiOpcVideoPayload } from "../globalaiopc-video.provider-adapter.ts";
import { ModelError } from "../model-error.ts";
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

  it("preserves every ordered image when the request resolves to full-reference mode", () => {
    const cases = [
      { mode: "reference-video" },
      { referenceMode: "image" },
      {},
    ];

    for (const modeParameters of cases) {
      const payload = buildGlobalAiOpcVideoPayload(input({
        prompt: "scene=@image1; actor=@image2; assistant=@image3",
        firstFrameUrl: "https://cdn.test/scene.png",
        lastFrameUrl: "https://cdn.test/assistant.png",
        parameters: {
          ...modeParameters,
          filePaths: [
            "https://cdn.test/scene.png",
            "https://cdn.test/actor.png",
            "https://cdn.test/assistant.png",
          ],
        },
      }), "sd_2.0_special");

      assert.deepEqual(payload.reference_images, [
        "https://cdn.test/scene.png",
        "https://cdn.test/actor.png",
        "https://cdn.test/assistant.png",
      ]);
      assert.equal("first_image" in payload, false);
      assert.equal("last_image" in payload, false);
    }
  });

  it("keeps filePaths as the canonical mention order while retaining compatibility references", () => {
    const payload = buildGlobalAiOpcVideoPayload(input({
      prompt: "scene=@image1; actor=@image2; assistant=@image3",
      referenceImages: [
        "https://cdn.test/actor.png",
        "https://cdn.test/legacy-only.png",
      ],
      parameters: {
        mode: "reference-video",
        referenceImages: ["https://cdn.test/assistant.png"],
        filePaths: [
          "https://cdn.test/scene.png",
          "https://cdn.test/actor.png",
          "https://cdn.test/assistant.png",
        ],
      },
    }), "sd_2.0_special");

    assert.deepEqual(payload.reference_images, [
      "https://cdn.test/scene.png",
      "https://cdn.test/actor.png",
      "https://cdn.test/assistant.png",
      "https://cdn.test/legacy-only.png",
    ]);
  });

  it("does not infer full-reference mode from a duplicated legacy first frame", () => {
    const payload = buildGlobalAiOpcVideoPayload(input({
      prompt: "animate this frame",
      firstFrameUrl: "https://cdn.test/first.png",
      parameters: { filePaths: ["https://cdn.test/first.png"] },
    }), "sd_2.0_special");

    assert.equal(payload.first_image, "https://cdn.test/first.png");
    assert.equal("reference_images" in payload, false);
  });

  it("preserves duplicate entries in the canonical mention order", () => {
    const payload = buildGlobalAiOpcVideoPayload(input({
      prompt: "same actor=@image1 and @image2; scene=@image3",
      parameters: {
        mode: "reference-video",
        filePaths: [
          "https://cdn.test/actor.png",
          "https://cdn.test/actor.png",
          "https://cdn.test/scene.png",
        ],
      },
    }), "sd_2.0_special");

    assert.deepEqual(payload.reference_images, [
      "https://cdn.test/actor.png",
      "https://cdn.test/actor.png",
      "https://cdn.test/scene.png",
    ]);
  });

  it("rejects browser-local images before they can shift indexes or reach the provider", () => {
    const cases = [
      {
        prompt: "actor=@image2",
        firstFrameUrl: "blob:https://app.test/stale-frame",
        parameters: {
          mode: "reference-video",
          filePaths: [
            "blob:https://app.test/stale-frame",
            "https://cdn.test/actor.png",
          ],
        },
      },
      {
        prompt: "animate this frame",
        firstFrameUrl: "blob:https://app.test/first-frame",
        parameters: { mode: "first-frame" },
      },
      {
        prompt: "animate between frames",
        firstFrameUrl: "https://cdn.test/first-frame.png",
        lastFrameUrl: "blob:https://app.test/last-frame",
        parameters: { mode: "first-last-frame" },
      },
      {
        prompt: "actor=@image1",
        parameters: { mode: "reference-video", filePaths: ["blob:https://app.test/reference"] },
      },
      {
        prompt: "actor=@image1",
        referenceImages: ["blob:https://app.test/top-level-reference"],
        parameters: { mode: "reference-video" },
      },
      {
        prompt: "actor=@image1",
        parameters: {
          mode: "reference-video",
          referenceImages: ["blob:https://app.test/parameter-reference"],
        },
      },
      {
        prompt: "actor=@image1",
        parameters: {
          mode: "reference-video",
          referenceUploads: ["blob:https://app.test/reference-upload"],
        },
      },
    ];

    for (const redactedPayload of cases) {
      assert.throws(
        () => buildGlobalAiOpcVideoPayload(input(redactedPayload), "sd_2.0_special"),
        (error: unknown) => error instanceof ModelError && error.code === "model_parameter_invalid",
      );
    }
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

  it("keeps an accepted task pollable when Model Center briefly returns 401", async () => {
    const adapter = new GlobalAiOpcVideoProviderAdapter({
      apiKey: "kyy-key",
      model: "video_30_10_10",
      createTaskEndpoint: "https://zcbservice.test/v2/model-center/tasks",
      queryTaskEndpoint: "https://zcbservice.test/v2/model-center/tasks/{taskId}",
      fetchImpl: (async () => Response.json({
        error: {
          code: "AuthenticationError",
          message: "the API key in the request is missing or invalid",
          type: "Unauthorized",
        },
      }, { status: 401 })) as typeof fetch,
    });

    const polled = await adapter.poll({ externalRequestId: "kyy-task-transient-auth" });

    assert.equal(polled.status, "accepted");
    assert.equal(polled.redactedResponse.failureCode, "global_ai_opc_video_poll_transient_auth");
    assert.equal(polled.redactedResponse.providerErrorCode, "AuthenticationError");
    assert.equal(polled.redactedResponse.taskId, "kyy-task-transient-auth");
    assert.equal(polled.redactedResponse.transientAuthPollCount, 1);
  });

  it("fails an accepted task after the transient 401 retry budget is exhausted", async () => {
    const adapter = new GlobalAiOpcVideoProviderAdapter({
      apiKey: "kyy-key",
      model: "video_30_10_10",
      createTaskEndpoint: "https://zcbservice.test/v2/model-center/tasks",
      queryTaskEndpoint: "https://zcbservice.test/v2/model-center/tasks/{taskId}",
      fetchImpl: (async () => Response.json({
        error: {
          code: "AuthenticationError",
          message: "the API key in the request is missing or invalid",
          type: "Unauthorized",
        },
      }, { status: 401 })) as typeof fetch,
    });

    const polled = await adapter.poll({
      externalRequestId: "kyy-task-invalid-key",
      redactedPayload: {
        providerResponseRedacted: { transientAuthPollCount: 3 },
      },
    });

    assert.equal(polled.status, "failed");
    assert.equal(polled.redactedResponse.failureCode, "global_ai_opc_video_poll_authentication_failed");
    assert.equal(polled.redactedResponse.transientAuthPollCount, 4);
  });

  it("recovers after a transient poll 401 and clears its retry count", async () => {
    let pollCount = 0;
    const adapter = new GlobalAiOpcVideoProviderAdapter({
      apiKey: "kyy-key",
      model: "video_30_10_10",
      createTaskEndpoint: "https://zcbservice.test/v2/model-center/tasks",
      queryTaskEndpoint: "https://zcbservice.test/v2/model-center/tasks/{taskId}",
      fetchImpl: (async () => {
        pollCount += 1;
        return pollCount === 1
          ? Response.json({ error: { code: "AuthenticationError" } }, { status: 401 })
          : Response.json({ status: "completed", result_url: "https://cdn.test/result.mp4" });
      }) as typeof fetch,
    });

    const firstPoll = await adapter.poll({ externalRequestId: "kyy-task-recovers" });
    const secondPoll = await adapter.poll({
      externalRequestId: "kyy-task-recovers",
      redactedPayload: { providerResponseRedacted: firstPoll.redactedResponse },
    });

    assert.equal(firstPoll.status, "accepted");
    assert.equal(secondPoll.status, "succeeded");
    assert.equal(secondPoll.videoUrl, "https://cdn.test/result.mp4");
    assert.equal(secondPoll.redactedResponse.transientAuthPollCount, 0);
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
