import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createProviderAdapterFromModelConfig } from "../provider-adapter.factory.ts";
import { GlobalAiOpcVideoProviderAdapter } from "../globalaiopc-video.provider-adapter.ts";

describe("globalaiopc video provider adapter", () => {
  it("sends Seedance 2.5 Special as reference_images without frame fields", async () => {
    let capturedBody = "";
    const adapter = new GlobalAiOpcVideoProviderAdapter({
      apiKey: "global-key",
      model: "sd_2.5_special_v1",
      createTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v2/model-center/tasks",
      queryTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v2/model-center/tasks/{taskId}",
      requestFormat: "globalaiopc_model_center_video",
      fetchImpl: (async (_url, init) => {
        capturedBody = String(init?.body ?? "");
        return new Response(JSON.stringify({ id: "special-reference-task", status: "queued" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });

    await adapter.submit({
      providerRequestId: "provider-request-special-reference",
      providerName: "GlobalAiOpc",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-global:task-special-reference",
      payloadRef: "creator://payload-global-special-reference",
      payloadHash: "hash-global-special-reference",
      redactedPayload: {
        prompt: "use all reference images",
        firstFrameUrl: "https://cdn.example.com/first.png",
        parameters: {
          durationSec: 5,
          resolution: "720p",
          filePaths: ["https://cdn.example.com/reference-a.png", "https://cdn.example.com/reference-b.png"],
          firstFrame: { url: "https://cdn.example.com/first.png" },
        },
      },
    });

    assert.deepEqual(JSON.parse(capturedBody), {
      model: "sd_2.5_special_v1",
      prompt: "use all reference images",
      reference_images: [
        "https://cdn.example.com/first.png",
        "https://cdn.example.com/reference-a.png",
        "https://cdn.example.com/reference-b.png",
      ],
      duration: 5,
      resolution: "720p",
    });
  });

  it("submits sd2_manxue frame tasks without mixing mutually exclusive reference fields", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody = "";

    const adapter = new GlobalAiOpcVideoProviderAdapter({
      apiKey: "global-key",
      model: "sd2_manxue_video",
      createTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/sd2_manxue/videos",
      queryTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/result/{taskId}",
      requestFormat: "globalaiopc_sd2_manxue",
      fetchImpl: (async (url, init) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers;
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({ id: "global-sd2-task-1", status: "queued" }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch,
    });

    const result = await adapter.submit({
      providerRequestId: "provider-request-global-sd2",
      providerName: "GlobalAiOpc",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-global:task-sd2",
      payloadRef: "creator://payload-global-sd2",
      payloadHash: "hash-global-sd2",
      redactedPayload: {
        motionPrompt: "keep the pose while camera circles",
        firstFrameUrl: "https://cdn.example.com/first.png",
        lastFrameUrl: "https://cdn.example.com/last.png",
        parameters: {
          resolution: "2K",
          aspectRatio: "16:9",
          durationSec: 8,
          referenceImages: [
            { url: "https://cdn.example.com/reference.png" },
          ],
          videoFilePaths: [
            "https://cdn.example.com/reference.mp4",
          ],
          audioFilePaths: [
            "https://cdn.example.com/reference.mp3",
          ],
        },
      },
    });

    const parsedBody = JSON.parse(capturedBody) as Record<string, unknown>;
    assert.equal(
      capturedUrl,
      "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/sd2_manxue/videos",
    );
    assert.deepEqual(capturedHeaders, {
      authorization: "Bearer global-key",
      "content-type": "application/json",
    });
    assert.deepEqual(parsedBody, {
      model: "sd2_manxue_video_2k",
      prompt: "keep the pose while camera circles",
      duration: 8,
      ratio: "16:9",
      first_image: "https://cdn.example.com/first.png",
      last_image: "https://cdn.example.com/last.png",
    });
    assert.equal(result.externalRequestId, "global-sd2-task-1");
    assert.equal(result.status, "accepted");
    assert.deepEqual(result.redactedRequest, parsedBody);
  });

  it("submits sd2_manxue reference tasks with reference media when no frame fields are present", async () => {
    let capturedBody = "";

    const adapter = new GlobalAiOpcVideoProviderAdapter({
      apiKey: "global-key",
      model: "sd2_manxue_video_fast",
      createTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/sd2_manxue/videos",
      queryTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/result/{taskId}",
      requestFormat: "globalaiopc_sd2_manxue",
      fetchImpl: (async (_url, init) => {
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({ id: "global-sd2-reference-task", status: "queued" }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch,
    });

    await adapter.submit({
      providerRequestId: "provider-request-global-sd2-reference",
      providerName: "GlobalAiOpc",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-global:task-sd2-reference",
      payloadRef: "creator://payload-global-sd2-reference",
      payloadHash: "hash-global-sd2-reference",
      redactedPayload: {
        prompt: "use reference assets as style and motion guide",
        parameters: {
          resolution: "1080p",
          aspectRatio: "16:9",
          durationSec: 5,
          referenceImages: [
            { url: "https://cdn.example.com/reference.png" },
          ],
          videoFilePaths: [
            "https://cdn.example.com/reference.mp4",
          ],
          audioFilePaths: [
            "https://cdn.example.com/reference.mp3",
          ],
        },
      },
    });

    assert.deepEqual(JSON.parse(capturedBody), {
      model: "sd2_manxue_video_fast_1080p",
      prompt: "use reference assets as style and motion guide",
      duration: 5,
      ratio: "16:9",
      referenceImages: [
        "https://cdn.example.com/reference.png",
      ],
      referenceVideos: [
        "https://cdn.example.com/reference.mp4",
      ],
      referenceAudios: [
        "https://cdn.example.com/reference.mp3",
      ],
    });
  });

  it("rejects sd2_manxue reference videos on non-video-reference models", async () => {
    const adapter = new GlobalAiOpcVideoProviderAdapter({
      apiKey: "global-key",
      model: "sd2_manxue_fast",
      createTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/sd2_manxue/videos",
      queryTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/result/{taskId}",
      requestFormat: "globalaiopc_sd2_manxue",
      fetchImpl: (async () => {
        throw new Error("fetch_should_not_be_called");
      }) as typeof fetch,
    });

    await assert.rejects(
      adapter.submit({
        providerRequestId: "provider-request-global-sd2-unsupported-video",
        providerName: "GlobalAiOpc",
        providerOperation: "shot.video.generate",
        requestKey: "workflow-global:task-sd2-unsupported-video",
        payloadRef: "creator://payload-global-sd2-unsupported-video",
        payloadHash: "hash-global-sd2-unsupported-video",
        redactedPayload: {
          prompt: "reference video on fast non-video family",
          firstFrameUrl: "https://cdn.example.com/first.png",
          parameters: {
            resolution: "720p",
            videoFilePaths: [
              "https://cdn.example.com/reference.mp4",
            ],
          },
        },
      }),
      (error: unknown) => {
        assert.equal(error instanceof Error ? error.message : String(error), "该模型不支持视频参考");
        assert.equal(
          (error as { failureCode?: string }).failureCode,
          "model_reference_videos_unsupported",
        );
        assert.equal((error as { providerModel?: string }).providerModel, "sd2_manxue_fast_720p");
        return true;
      },
    );
  });

  it("maps GlobalAiOpc polling responses to the shared video status contract", async () => {
    const adapter = new GlobalAiOpcVideoProviderAdapter({
      apiKey: "global-key",
      model: "sd2_manxue",
      createTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/sd2_manxue/videos",
      queryTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/result/{taskId}",
      fetchImpl: (async (url, init) => {
        assert.equal(
          String(url),
          "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/result/global%20task%2F2",
        );
        assert.deepEqual(init?.headers, {
          authorization: "Bearer global-key",
        });
        return new Response(
          JSON.stringify({
            id: "global task/2",
            status: "completed",
            video_url: "https://cdn.example.com/generated.mp4",
            actualDuration: 8,
            amount: 12,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch,
    });

    const result = await adapter.poll({ externalRequestId: "global task/2" });

    assert.equal(result.status, "succeeded");
    assert.equal(result.videoUrl, "https://cdn.example.com/generated.mp4");
    assert.deepEqual(result.redactedResponse, {
      taskId: "global task/2",
      providerStatus: "completed",
      providerErrorCode: null,
      providerMessage: null,
      amount: 12,
      actualDuration: 8,
    });
  });

  it("builds Sora, Grok, and Happy Horse GlobalAiOpc payload shapes", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = (async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      return new Response(JSON.stringify({ id: `task-${bodies.length}`, status: "queued" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    await new GlobalAiOpcVideoProviderAdapter({
      apiKey: "global-key",
      model: "openAiSora2Plus",
      createTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/sora/videos",
      queryTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/result/{taskId}",
      requestFormat: "globalaiopc_sora",
      fetchImpl,
    }).submit(baseSubmission({
      prompt: "cinematic motion",
      firstFrameUrl: "https://cdn.example.com/sora.png",
      parameters: {
        aspectRatio: "9:16",
        durationSec: 8,
      },
    }));

    await new GlobalAiOpcVideoProviderAdapter({
      apiKey: "global-key",
      model: "grok_video3_max",
      createTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/grok/videos",
      queryTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/result/{taskId}",
      requestFormat: "globalaiopc_grok",
      fetchImpl,
    }).submit(baseSubmission({
      prompt: "fast action",
      parameters: {
        aspectRatio: "1:1",
        resolution: "720p",
        durationSec: 12,
        referenceImages: [
          { url: "https://cdn.example.com/grok-1.png" },
          { url: "https://cdn.example.com/grok-2.png" },
        ],
      },
    }));

    await new GlobalAiOpcVideoProviderAdapter({
      apiKey: "global-key",
      model: "happyhorse-1.0-r2v",
      createTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/happyhorse-r2v/videos",
      queryTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/result/{taskId}",
      requestFormat: "globalaiopc_happyhorse_r2v",
      fetchImpl,
    }).submit(baseSubmission({
      prompt: "use Image 1 as the lead",
      parameters: {
        resolution: "1080p",
        aspectRatio: "16:9",
        durationSec: 5,
        seed: 7,
        referenceImages: [
          { url: "https://cdn.example.com/happy.png" },
        ],
      },
    }));

    assert.deepEqual(bodies, [
      {
        model: "openAiSora2Plus",
        prompt: "cinematic motion",
        aspect_ratio: "9:16",
        seconds: 8,
        input_reference: [
          "https://cdn.example.com/sora.png",
        ],
      },
      {
        model: "grok_video3_max",
        prompt: "fast action",
        duration: 12,
        aspect_ratio: "1:1",
        resolution: "720p",
        image_urls: [
          "https://cdn.example.com/grok-1.png",
          "https://cdn.example.com/grok-2.png",
        ],
      },
      {
        model: "happyhorse-1.0-r2v",
        prompt: "use Image 1 as the lead",
        referenceImages: [
          "https://cdn.example.com/happy.png",
        ],
        duration: 5,
        ratio: "16:9",
        resolution: "1080P",
        seed: 7,
      },
    ]);
  });

  it("routes dedicated GlobalAiOpc configs through the GlobalAiOpc adapter", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "globalaiopc_video",
        providerModel: "grok_video3",
        providerConfig: {
          baseURL: "https://zcbservice.aizfw.cn/kyyReactApiServer",
          requestPath: "/v1/grok/videos",
          queryTaskEndpoint: "/v1/result/{taskId}",
          apiKeyEnv: "GLOBAL_AI_OPC_API_KEY",
        },
      },
      { GLOBAL_AI_OPC_API_KEY: "global-key" },
      (async (url, init) => {
        capturedUrl = String(url);
        capturedBody = String(init?.body ?? "");
        return new Response(JSON.stringify({ id: "custom-global-task", status: "queued" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    );

    await adapter.submit(baseSubmission({
      prompt: "custom config should use GlobalAiOpc shape",
      parameters: {
        resolution: "720p",
        durationSec: 10,
      },
    }));

    assert.equal(capturedUrl, "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/grok/videos");
    assert.deepEqual(JSON.parse(capturedBody), {
      model: "grok_video3",
      prompt: "custom config should use GlobalAiOpc shape",
      duration: 10,
      resolution: "720p",
    });
  });
});

function baseSubmission(redactedPayload: Record<string, unknown>) {
  return {
    providerRequestId: "provider-request-global",
    providerName: "GlobalAiOpc",
    providerOperation: "shot.video.generate",
    requestKey: "workflow-global:task-global",
    payloadRef: "creator://payload-global",
    payloadHash: "hash-global",
    redactedPayload,
  };
}
