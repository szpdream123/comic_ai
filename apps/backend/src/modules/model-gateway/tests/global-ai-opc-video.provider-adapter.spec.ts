import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildGlobalAiOpcVideoPayload,
  GlobalAiOpcVideoProviderAdapter,
} from "../global-ai-opc-video.provider-adapter.ts";
import { createProviderAdapterFromModelConfig } from "../provider-adapter.factory.ts";
import { shouldPrepareGlobalAiOpcVideoMaterials } from "../seedance-video.worker.ts";

describe("GlobalAiOpc video provider adapter", () => {
  it("prepares MiniMax materials without waiting for ACTIVE status", () => {
    assert.equal(shouldPrepareGlobalAiOpcVideoMaterials({
      providerProtocol: "globalaiopc_video",
      providerModel: "MiniMax-H3-768p",
      providerConfig: { requestFormat: "globalaiopc_model_center_video" },
    }), true);
    assert.equal(shouldPrepareGlobalAiOpcVideoMaterials({
      providerProtocol: "globalaiopc_video",
      providerModel: "KlingO3",
      providerConfig: { requestFormat: "globalaiopc_model_center_video" },
    }), true);
  });

  it("ignores requestTimeoutMs and uses the fixed video timeout", async () => {
    const timeoutCalls: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      timeoutCalls.push(Number(delay));
      return originalSetTimeout(handler, delay, ...args);
    }) as typeof setTimeout;
    const adapter = new GlobalAiOpcVideoProviderAdapter({
      apiKey: "global-ai-opc-key",
      model: "grok_video3",
      createTaskEndpoint: "https://provider.example.test/v1/videos",
      requestTimeoutMs: 1,
      fetchImpl: (async () => new Response(JSON.stringify({
        id: "global-video-fixed-timeout",
        status: "queued",
      }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch,
    });
    try {
      const result = await adapter.submit({
        providerRequestId: "provider-request-fixed-timeout",
        providerName: "GlobalAiOpc",
        providerOperation: "shot.video.generate",
        requestKey: "workflow-fixed-timeout:task-fixed-timeout",
        payloadRef: "creator://fixed-timeout",
        payloadHash: "fixed-timeout-hash",
        redactedPayload: { prompt: "A fixed-timeout video" },
      });
      assert.equal(result.status, "accepted");
      assert.deepEqual(timeoutCalls, [3 * 60 * 60 * 1000]);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

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

  it("preserves reviewed provider asset references in frame and multimodal requests", () => {
    assert.deepEqual(
      buildGlobalAiOpcVideoPayload({
        providerRequestId: "provider-request-reviewed-assets",
        providerName: "GlobalAiOpc",
        providerOperation: "shot.video.generate",
        requestKey: "workflow-global-video:reviewed-assets",
        payloadRef: "creator://reviewed-assets",
        payloadHash: "hash-reviewed-assets",
        redactedPayload: {
          prompt: "Use reviewed references",
          parameters: {
            mode: "reference-video",
            resolution: "1080p",
            referenceImages: [{ url: "asset://asset_img_001" }],
            referenceVideos: [{ url: "asset://asset_video_001" }],
            referenceAudio: { url: "asset://asset_audio_001" },
          },
        },
      }, { model: "sd2_manxue_video" }),
      {
        model: "sd2_manxue_video_1080p",
        prompt: "Use reviewed references",
        referenceImages: ["asset://asset_img_001"],
        referenceVideos: ["asset://asset_video_001"],
        referenceAudios: ["asset://asset_audio_001"],
      },
    );
  });

  it("rejects sd2_manxue parameters outside the documented contract", () => {
    const baseInput = {
      providerRequestId: "provider-request-invalid-manxue-params",
      providerName: "GlobalAiOpc",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-global-video:invalid-manxue-params",
      payloadRef: "creator://invalid-manxue-params",
      payloadHash: "hash-invalid-manxue-params",
    };
    assert.throws(
      () => buildGlobalAiOpcVideoPayload({
        ...baseInput,
        redactedPayload: { prompt: "Unsupported resolution", parameters: { resolution: "2k" } },
      }, { model: "sd2_manxue" }),
      (error: unknown) => (error as { failureCode?: string }).failureCode === "model_resolution_unsupported",
    );
    assert.throws(
      () => buildGlobalAiOpcVideoPayload({
        ...baseInput,
        redactedPayload: { prompt: "Unsupported ratio", parameters: { ratio: "auto" } },
      }, { model: "sd2_manxue" }),
      (error: unknown) => (error as { failureCode?: string }).failureCode === "model_ratio_unsupported",
    );
  });

  it("rejects audio-only Seedance special references", () => {
    assert.throws(
      () => buildGlobalAiOpcVideoPayload({
        providerRequestId: "provider-request-audio-only",
        providerName: "GlobalAiOpc",
        providerOperation: "shot.video.generate",
        requestKey: "workflow-global-video:audio-only",
        payloadRef: "creator://audio-only",
        payloadHash: "hash-audio-only",
        redactedPayload: {
          prompt: "Audio only",
          parameters: { referenceAudio: { url: "asset://asset_audio_001" } },
        },
      }, { model: "sd_2.0_special" }),
      (error: unknown) => (error as { failureCode?: string }).failureCode === "model_reference_visual_required",
    );
  });

  it("builds all grouped Seedance 2.0 discount and special model requests", () => {
    const cases = [
      ["sd_2.0_discount", "480p", "sd_2.0_discount_480p", false],
      ["sd_2.0_discount", "720p", "sd_2.0_discount_720p", false],
      ["sd_2.0_discount", "1080p", "sd_2.0_discount_1080p", false],
      ["sd_2.0_discount_with_video_ref", "480p", "sd_2.0_discount_480p_with_video_ref", true],
      ["sd_2.0_discount_with_video_ref", "720p", "sd_2.0_discount_720p_with_video_ref", true],
      ["sd_2.0_discount_with_video_ref", "1080p", "sd_2.0_discount_1080p_with_video_ref", true],
      ["sd_2.0_special", "720p", "sd_2.0_special_720p", false],
      ["sd_2.0_special", "1080p", "sd_2.0_special_1080p", false],
      ["sd_2.0_special", "2k", "sd_2.0_special_2k", false],
      ["sd_2.0_special", "4k", "sd_2.0_special_4k", false],
      ["sd_2.0_special_with_video_ref", "720p", "sd_2.0_special_720p_with_video_ref", true],
      ["sd_2.0_special_with_video_ref", "1080p", "sd_2.0_special_1080p_with_video_ref", true],
      ["sd_2.0_special_with_video_ref", "2k", "sd_2.0_special_2k_with_video_ref", true],
      ["sd_2.0_special_with_video_ref", "4k", "sd_2.0_special_4k_with_video_ref", true],
    ] as const;

    for (const [configuredModel, resolution, expectedModel, withVideoReference] of cases) {
      const request = buildGlobalAiOpcVideoPayload({
        providerRequestId: `provider-request-${expectedModel}`,
        providerName: "GlobalAiOpc",
        providerOperation: "shot.video.generate",
        requestKey: `workflow-global-video:${expectedModel}`,
        payloadRef: `creator://${expectedModel}`,
        payloadHash: `hash-${expectedModel}`,
        redactedPayload: {
          prompt: "A guided Seedance 2.0 shot",
          firstFrameUrl: "https://cdn.example.com/first.png",
          parameters: {
            mode: "reference-video",
            resolution,
            aspectRatio: "16:9",
            durationSec: 5,
            generateAudio: false,
            returnLastFrame: true,
            seed: -1,
            ...(withVideoReference
              ? { videoFilePaths: ["https://cdn.example.com/reference.mp4"] }
              : {}),
          },
        },
      }, {
        model: configuredModel,
      });

      assert.equal(request.model, expectedModel);
      assert.equal(request.ratio, "16:9");
      assert.equal(request.duration, 5);
      assert.equal(request.generate_audio, false);
      assert.equal(request.return_last_frame, true);
      assert.equal(request.seed, -1);
      const content = request.content as Array<Record<string, unknown>>;
      assert.deepEqual(content[0], { type: "text", text: "A guided Seedance 2.0 shot" });
      assert.ok(content.some((item) => item.role === "reference_image"));
      assert.equal(content.some((item) => item.role === "reference_video"), withVideoReference);
    }
  });

  it("uses the Seedance 2.5 special model id and sends resolution separately", () => {
    for (const resolution of ["720p", "1080p"] as const) {
      for (const model of ["sd_2.5_special", "sd_2.5_special_v1"] as const) {
        const request = buildGlobalAiOpcVideoPayload({
          providerRequestId: `provider-request-seedance-25-special-${model}-${resolution}`,
          providerName: "GlobalAiOpc",
          providerOperation: "shot.video.generate",
          requestKey: `workflow-global-video:seedance-25-special-${model}-${resolution}`,
          payloadRef: `creator://seedance-25-special-${model}-${resolution}`,
          payloadHash: `hash-seedance-25-special-${model}-${resolution}`,
          redactedPayload: {
            prompt: "A cinematic shot",
            parameters: { resolution },
          },
        }, { model, requestFormat: "globalaiopc_model_center_video" });

        assert.equal(request.model, "sd_2.5_special_v1");
        assert.equal(request.resolution, resolution);
      }
    }

    const defaulted = buildGlobalAiOpcVideoPayload({
      providerRequestId: "provider-request-seedance-25-special-default",
      providerName: "GlobalAiOpc",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-global-video:seedance-25-special-default",
      payloadRef: "creator://seedance-25-special-default",
      payloadHash: "hash-seedance-25-special-default",
      redactedPayload: { prompt: "A cinematic shot" },
    }, { model: "sd_2.5_special_v1", requestFormat: "globalaiopc_model_center_video" });

    assert.equal(defaulted.model, "sd_2.5_special_v1");
    assert.equal(defaulted.resolution, "720p");
  });

  it("sends Seedance 2.5 special reference mode without conflicting frame fields", () => {
    const request = buildGlobalAiOpcVideoPayload({
      providerRequestId: "provider-request-seedance-25-reference-mode",
      providerName: "GlobalAiOpc",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-global-video:seedance-25-reference-mode",
      payloadRef: "creator://seedance-25-reference-mode",
      payloadHash: "hash-seedance-25-reference-mode",
      redactedPayload: {
        prompt: "A short reference-guided shot",
        firstFrameUrl: "https://cdn.example.com/first.png",
        parameters: {
          mode: "reference-video",
          durationSec: 4,
          resolution: "720p",
          aspectRatio: "16:9",
          filePaths: [
            "https://cdn.example.com/first.png",
            "https://cdn.example.com/character.png",
          ],
          firstFrame: { url: "https://cdn.example.com/first.png" },
          imageReference: { url: "https://cdn.example.com/first.png" },
        },
      },
    }, { model: "sd_2.5_special_v1", requestFormat: "globalaiopc_model_center_video" });

    assert.equal(request.model, "sd_2.5_special_v1");
    assert.equal(request.duration, 5);
    assert.deepEqual(request.reference_images, [
      "https://cdn.example.com/first.png",
      "https://cdn.example.com/character.png",
    ]);
    assert.equal(request.first_image, undefined);
    assert.equal(request.last_image, undefined);
  });

  it("never emits frame fields for Seedance 2.5 special Model Center requests", () => {
    const request = buildGlobalAiOpcVideoPayload({
      providerRequestId: "provider-request-seedance-25-frame-compat",
      providerName: "GlobalAiOpc",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-global-video:seedance-25-frame-compat",
      payloadRef: "creator://seedance-25-frame-compat",
      payloadHash: "hash-seedance-25-frame-compat",
      redactedPayload: {
        prompt: "A reference-guided shot",
        firstFrameUrl: "https://cdn.example.com/first.png",
        lastFrameUrl: "https://cdn.example.com/last.png",
        parameters: {
          filePaths: ["https://cdn.example.com/character.png"],
        },
      },
    }, { model: "sd_2.5_special_v1", requestFormat: "globalaiopc_model_center_video" });

    assert.deepEqual(request.reference_images, ["https://cdn.example.com/character.png"]);
    assert.equal(request.first_image, undefined);
    assert.equal(request.last_image, undefined);
  });

  it("requires reference video content for Seedance 2.0 video-reference groups", () => {
    assert.throws(
      () => buildGlobalAiOpcVideoPayload({
        providerRequestId: "provider-request-seedance-video-required",
        providerName: "GlobalAiOpc",
        providerOperation: "shot.video.generate",
        requestKey: "workflow-global-video:seedance-video-required",
        payloadRef: "creator://seedance-video-required",
        payloadHash: "hash-seedance-video-required",
        redactedPayload: {
          prompt: "A video-reference shot",
          parameters: { resolution: "720p" },
        },
      }, {
        model: "sd_2.0_special_with_video_ref",
      }),
      (error: unknown) => (error as { failureCode?: string }).failureCode === "model_reference_video_required",
    );
  });

  it("builds Seedance 2.5 Model Center requests with documented field names", () => {
    assert.deepEqual(
      buildGlobalAiOpcVideoPayload({
        providerRequestId: "provider-request-seedance-25",
        providerName: "GlobalAiOpc",
        providerOperation: "shot.video.generate",
        requestKey: "workflow-global-video:seedance-25",
        payloadRef: "creator://seedance-25",
        payloadHash: "hash-seedance-25",
        redactedPayload: {
          prompt: "A rain-soaked street",
          firstFrameUrl: "https://cdn.example.com/first.png",
          lastFrameUrl: "https://cdn.example.com/last.png",
          parameters: {
            durationSec: 8,
            aspectRatio: "16:9",
            resolution: "720p",
            referenceImages: [{ url: "https://cdn.example.com/reference.png" }],
            referenceVideos: [{ url: "https://cdn.example.com/reference.mp4" }],
            referenceAudio: { url: "https://cdn.example.com/reference.mp3" },
          },
        },
      }, {
        model: "seedance-2.5-c1",
        requestFormat: "globalaiopc_model_center_video",
      }),
      {
        model: "seedance-2.5-c1",
        prompt: "A rain-soaked street",
        reference_images: ["https://cdn.example.com/reference.png"],
        reference_videos: ["https://cdn.example.com/reference.mp4"],
        reference_audios: ["https://cdn.example.com/reference.mp3"],
        duration: 8,
        aspect_ratio: "16:9",
        resolution: "720p",
        first_image: "https://cdn.example.com/first.png",
        last_image: "https://cdn.example.com/last.png",
      },
    );
  });

  it("builds Wan2.7 R2V Model Center requests with reference_images only", () => {
    const request = buildGlobalAiOpcVideoPayload({
      providerRequestId: "provider-request-wan27-r2v",
      providerName: "GlobalAiOpc",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-global-video:wan27-r2v",
      payloadRef: "creator://wan27-r2v",
      payloadHash: "hash-wan27-r2v",
      redactedPayload: {
        prompt: "A cinematic shot",
        firstFrameUrl: "https://cdn.example.com/reference.png",
        parameters: {
          durationSec: 5,
          aspectRatio: "16:9",
          resolution: "1080P",
          referenceImages: [{ url: "https://cdn.example.com/character.png" }],
        },
      },
    }, { model: "wan2.7-r2v", requestFormat: "globalaiopc_model_center_video" });

    assert.equal(request.model, "wan2.7-r2v");
    assert.deepEqual(request.reference_images, [
      "https://cdn.example.com/reference.png",
      "https://cdn.example.com/character.png",
    ]);
    assert.equal(request.duration, 5);
    assert.equal(request.resolution, "1080P");
    assert.equal(request.first_image, undefined);
    assert.equal(request.last_image, undefined);
  });

  it("builds Kling O3 Model Center requests without first or last frame fields", () => {
    const request = buildGlobalAiOpcVideoPayload({
      providerRequestId: "provider-request-kling-o3",
      providerName: "GlobalAiOpc",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-global-video:kling-o3",
      payloadRef: "creator://kling-o3",
      payloadHash: "hash-kling-o3",
      redactedPayload: {
        prompt: "A cinematic shot",
        firstFrameUrl: "https://cdn.example.com/first.png",
        lastFrameUrl: "https://cdn.example.com/last.png",
        parameters: {
          durationSec: 6,
          aspectRatio: "16:9",
          resolution: "720p",
          referenceImages: [{ url: "https://cdn.example.com/reference.png" }],
          referenceVideos: [{ url: "https://cdn.example.com/reference.mp4" }],
          referenceAudio: { url: "https://cdn.example.com/reference.mp3" },
          generateAudio: false,
          referenceMode: "frame",
        },
      },
    }, { model: "KlingO3", requestFormat: "globalaiopc_model_center_video" });

    assert.equal(request.model, "KlingO3");
    assert.equal(request.first_image, undefined);
    assert.equal(request.last_image, undefined);
    assert.deepEqual(request.reference_images, ["https://cdn.example.com/reference.png"]);
    assert.equal(request.reference_videos, undefined);
    assert.equal(request.reference_audios, undefined);
    assert.equal(request.reference_mode, "image");
    assert.equal(request.generate_audio, false);
  });

  it("accepts documented GlobalAiOpc assetId references", () => {
    assert.deepEqual(buildGlobalAiOpcVideoPayload({
      providerRequestId: "provider-request-seedance-asset",
      providerName: "GlobalAiOpc",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-global-video:seedance-asset",
      payloadRef: "creator://seedance-asset",
      payloadHash: "hash-seedance-asset",
      redactedPayload: {
        prompt: "Use provider material",
        parameters: { referenceImages: ["assetId://asset-provider-image-1"] },
      },
    }, {
      model: "seedance-2.5-c1",
      requestFormat: "globalaiopc_model_center_video",
    }), {
      model: "seedance-2.5-c1",
      prompt: "Use provider material",
      reference_images: ["assetId://asset-provider-image-1"],
    });
  });

  it("builds MiniMax H3 768p requests with documented reference fields", () => {
    const input = {
      providerRequestId: "provider-request-minimax-h3",
      providerName: "GlobalAiOpc",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-global-video:minimax-h3",
      payloadRef: "creator://minimax-h3",
      payloadHash: "hash-minimax-h3",
    };
    const config = { model: "MiniMax-H3-768p", requestFormat: "globalaiopc_model_center_video" };

    assert.deepEqual(buildGlobalAiOpcVideoPayload({
      ...input,
      redactedPayload: {
        prompt: "Reference performance",
        parameters: {
          referenceImages: [{ url: "https://cdn.example.com/actor.png" }],
          referenceAudio: { url: "https://cdn.example.com/voice.mp3" },
          durationSec: 10,
          aspectRatio: "9:16",
          resolution: "768p",
        },
      },
    }, config), {
      model: "MiniMax-H3-768p",
      prompt: "Reference performance",
      reference_images: ["https://cdn.example.com/actor.png"],
      reference_audios: ["https://cdn.example.com/voice.mp3"],
      duration: 10,
      aspect_ratio: "9:16",
      resolution: "768p",
    });

    assert.deepEqual(buildGlobalAiOpcVideoPayload({
      ...input,
      redactedPayload: {
        prompt: "Frame performance",
        firstFrameUrl: "https://cdn.example.com/first.png",
        lastFrameUrl: "https://cdn.example.com/last.png",
        parameters: {
          referenceImages: [{ url: "https://cdn.example.com/reference.png" }],
          referenceVideos: [{ url: "https://cdn.example.com/reference.mp4" }],
          referenceAudio: { url: "https://cdn.example.com/reference.mp3" },
        },
      },
    }, config), {
      model: "MiniMax-H3-768p",
      prompt: "Frame performance",
      reference_images: [
        "https://cdn.example.com/first.png",
        "https://cdn.example.com/reference.png",
      ],
      reference_videos: ["https://cdn.example.com/reference.mp4"],
      reference_audios: ["https://cdn.example.com/reference.mp3"],
    });

    const normalizedPrompt = buildGlobalAiOpcVideoPayload({
      ...input,
      redactedPayload: {
        prompt: "请让【@图1】和@图2同时入画",
        parameters: {
          referenceImages: [{ url: "https://cdn.example.com/actor.png" }],
          durationSec: 10,
          aspectRatio: "16:9",
          resolution: "768p",
        },
      },
    }, config);
    assert.equal(normalizedPrompt.prompt, "请让@图片1和@图片2同时入画");
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
            amount: 0.76,
            totalTokens: 108900,
            last_frame_url: "https://cdn.global-ai-opc.example/last-frame.jpg",
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
    assert.equal(polled.redactedResponse.amount, 0.76);
    assert.equal(polled.redactedResponse.totalTokens, 108900);
    assert.equal(polled.redactedResponse.lastFrameUrl, "https://cdn.global-ai-opc.example/last-frame.jpg");
  });

  it("rejects undocumented statuses and completed responses without a video URL", async () => {
    const responses = [
      new Response(JSON.stringify({ id: "task-invalid", status: "mystery" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      new Response(JSON.stringify({ id: "task-failed", status: "failed", error: "policy rejected" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      new Response(JSON.stringify({ id: "task-completed", status: "completed" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ];
    const adapter = new GlobalAiOpcVideoProviderAdapter({
      apiKey: "global-ai-opc-key",
      model: "sd2_manxue",
      createTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/sd2_manxue/videos",
      queryTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/result/{taskId}",
      fetchImpl: (async () => responses.shift()!) as typeof fetch,
    });

    await assert.rejects(
      adapter.submit({
        providerRequestId: "provider-request-invalid-status",
        providerName: "GlobalAiOpc",
        providerOperation: "shot.video.generate",
        requestKey: "workflow-global-video:invalid-status",
        payloadRef: "creator://invalid-status",
        payloadHash: "hash-invalid-status",
        redactedPayload: { prompt: "Invalid status" },
      }),
      /global_ai_opc_video_invalid_status/,
    );
    await assert.rejects(
      adapter.submit({
        providerRequestId: "provider-request-failed-status",
        providerName: "GlobalAiOpc",
        providerOperation: "shot.video.generate",
        requestKey: "workflow-global-video:failed-status",
        payloadRef: "creator://failed-status",
        payloadHash: "hash-failed-status",
        redactedPayload: { prompt: "Failed status" },
      }),
      /global_ai_opc_video_task_failed/,
    );
    await assert.rejects(
      adapter.poll({ externalRequestId: "task-completed" }),
      /global_ai_opc_video_completed_without_video_url/,
    );
  });

  it("builds the GlobalAiOpc video adapter from its dedicated protocol", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "globalaiopc_video",
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

  it("routes Model Center video configuration through its documented endpoint and payload", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    const adapter = createProviderAdapterFromModelConfig({
      providerProtocol: "globalaiopc_video",
      providerModel: "seedance-2.5-c1",
      providerConfig: {
        baseURL: "https://zcbservice.aizfw.cn/kyyReactApiServer",
        requestPath: "/v1/sd2_manxue/videos",
        createTaskEndpoint: "/v2/model-center/tasks",
        queryTaskEndpoint: "/v2/model-center/tasks/{taskId}",
        apiKeyEnv: "GLOBAL_AI_OPC_API_KEY",
        requestFormat: "globalaiopc_model_center_video",
      },
    }, { GLOBAL_AI_OPC_API_KEY: "global-ai-opc-key" }, (async (url, init) => {
      capturedUrl = String(url);
      capturedBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ id: "model-center-task", status: "queued" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch);

    await adapter.submit({
      providerRequestId: "provider-request-model-center",
      providerName: "GlobalAiOpc",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-global-video:model-center",
      payloadRef: "creator://model-center",
      payloadHash: "hash-model-center",
      redactedPayload: {
        prompt: "Camera orbit",
        firstFrameUrl: "https://cdn.example.com/first.png",
        parameters: { aspectRatio: "1:1", resolution: "480p", durationSec: 6 },
      },
    });

    assert.equal(capturedUrl, "https://zcbservice.aizfw.cn/kyyReactApiServer/v2/model-center/tasks");
    assert.deepEqual(JSON.parse(capturedBody), {
      model: "seedance-2.5-c1",
      prompt: "Camera orbit",
      duration: 6,
      aspect_ratio: "1:1",
      resolution: "480p",
    });
    assert.equal(JSON.parse(capturedBody).first_image, undefined);
  });

  it("builds the HappyHorse 1.1 Model Center payload", () => {
    assert.deepEqual(buildGlobalAiOpcVideoPayload({
      providerRequestId: "provider-request-happyhorse11",
      providerName: "GlobalAiOpc",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-global-video:happyhorse11",
      payloadRef: "creator://happyhorse11",
      payloadHash: "hash-happyhorse11",
      redactedPayload: {
        prompt: "Use the reference characters",
        firstFrameUrl: "https://cdn.example.com/first.png",
        parameters: {
          aspectRatio: "9:16",
          resolution: "1080P",
          durationSec: 5,
          seed: 0,
          watermark: false,
          referenceImages: [{ url: "https://cdn.example.com/character.png" }],
        },
      },
    }, {
      model: "happyhorse-1.1-r2v",
      requestFormat: "globalaiopc_model_center_video",
    }), {
      model: "happyhorse-1.1-r2v",
      prompt: "Use the reference characters",
      reference_images: [
        "https://cdn.example.com/first.png",
        "https://cdn.example.com/character.png",
      ],
      duration: 5,
      aspect_ratio: "9:16",
      resolution: "1080P",
      seed: 0,
      watermark: "false",
    });
  });

  it("builds the GlobalAiOpc video adapter with explicit endpoints", async () => {
    let capturedUrl = "";
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "globalaiopc_video",
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
