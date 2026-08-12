import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AiModelConfigRecord, AiModelDispatchPolicyRecord } from "../ai-model-config.store.ts";
import {
  GenerationModelExecutionResolutionError,
  resolveGenerationModelExecution,
} from "../generation-model-execution.resolver.ts";

describe("generation model execution resolver", () => {
  it("routes SanBao image and video models through the existing async executors", () => {
    const image = resolveGenerationModelExecution({
      kind: "image", modelCode: "sanbao-gpt-image2",
      modelConfig: imageModelConfig({ modelCode: "sanbao-gpt-image2", providerProtocol: "san_bao" }),
      dispatchPolicy: undefined, parameters: {}, fallbackQueueName: "generation-submit-image",
    });
    const video = resolveGenerationModelExecution({
      kind: "video", modelCode: "sanbao-sd2-9img-full",
      modelConfig: videoModelConfig({ modelCode: "sanbao-sd2-9img-full", providerProtocol: "san_bao" }),
      dispatchPolicy: undefined, parameters: {}, fallbackQueueName: "generation-submit-video",
    });
    assert.equal(image.providerExecutor, "gpt-image-2");
    assert.equal(video.providerExecutor, "seedance");
  });

  it("routes BananaRouter image models through the image executor", () => {
    const execution = resolveGenerationModelExecution({
      kind: "image",
      modelCode: "bananarouter-gpt-image-2",
      modelConfig: imageModelConfig({
        modelCode: "bananarouter-gpt-image-2",
        providerName: "BananaRouter",
        providerModel: "gpt-image-2",
        providerProtocol: "banana_router",
      }),
      dispatchPolicy: undefined,
      parameters: {},
      fallbackQueueName: "generation-submit-image",
    });

    assert.equal(execution.providerExecutor, "gpt-image-2");
  });

  it("routes BananaRouter video models through the shared video executor", () => {
    const execution = resolveGenerationModelExecution({
      kind: "video",
      modelCode: "bananarouter-sora2",
      modelConfig: videoModelConfig({
        modelCode: "bananarouter-sora2",
        providerName: "BananaRouter",
        providerModel: "sora-2",
        providerProtocol: "banana_router",
      }),
      dispatchPolicy: undefined,
      parameters: {},
      fallbackQueueName: "generation-submit-video",
    });

    assert.equal(execution.providerExecutor, "seedance");
  });

  it("routes Saier video models through the shared video executor", () => {
    const execution = resolveGenerationModelExecution({
      kind: "video",
      modelCode: "doubao-seedance-2-0",
      modelConfig: videoModelConfig({
        modelCode: "doubao-seedance-2-0",
        providerName: "塞尔",
        providerModel: "doubao-seedance-2-0",
        providerProtocol: "saier_video",
        providerConfig: {
          baseURL: "https://saierapi.cn",
          createTaskEndpoint: "/v1/video/generations",
          queryTaskEndpoint: "/v1/video/generations/{taskId}",
          apiKeyEnv: "SAI_ER_API_KEY",
        },
      }),
      dispatchPolicy: dispatchPolicy({ submitQueueName: "generation-submit-video" }),
      parameters: { mode: "multi-image" },
      fallbackQueueName: "fallback-video-submit",
    });

    assert.equal(execution.providerExecutor, "seedance");
    assert.equal(execution.queueName, "generation-submit-video");
  });

  it("resolves configured image models to the image provider executor and merges default parameters", () => {
    const execution = resolveGenerationModelExecution({
      kind: "image",
      modelCode: "gpt-image-custom",
      modelConfig: imageModelConfig({
        modelCode: "gpt-image-custom",
        providerProtocol: "openai_images",
        defaultParams: {
          aspectRatio: "16:9",
          quality: "2K",
          count: 1,
        },
      }),
      dispatchPolicy: dispatchPolicy({ submitQueueName: "custom-image-submit" }),
      parameters: {
        mode: "multi-image",
        count: 2,
      },
      fallbackQueueName: "fallback-image-submit",
    });

    assert.equal(execution.providerExecutor, "gpt-image-2");
    assert.equal(execution.queueName, "custom-image-submit");
    assert.equal(execution.taskMode, "image.reference_generate");
    assert.deepEqual(execution.parameters, {
      aspectRatio: "16:9",
      quality: "2K",
      count: 2,
      mode: "multi-image",
    });
  });

  it("maps shared frontend image controls to provider size fields without losing enum casing", () => {
    const execution = resolveGenerationModelExecution({
      kind: "image",
      modelCode: "global-ai-opc-nano-banana-2",
      modelConfig: imageModelConfig({
        modelCode: "global-ai-opc-nano-banana-2",
        providerProtocol: "global_ai_opc_image",
        parameterSchema: {
          resolution: { enum: ["1k", "2k", "4k"] },
          size: { enum: ["1:1", "16:9", "9:16"] },
        },
        defaultParams: {
          resolution: "1k",
          size: "1:1",
        },
      }),
      dispatchPolicy: undefined,
      parameters: {
        aspectRatio: "16:9",
        quality: "2K",
      },
      fallbackQueueName: "generation-submit-image",
    });

    assert.deepEqual(execution.parameters, {
      resolution: "2k",
      size: "16:9",
    });
  });

  it("keeps SanBao image resolution and quality as independent parameters", () => {
    const execution = resolveGenerationModelExecution({
      kind: "image",
      modelCode: "sanbao-gpt-image2",
      modelConfig: imageModelConfig({
        modelCode: "sanbao-gpt-image2",
        providerProtocol: "san_bao",
        parameterSchema: {
          resolution: { options: ["普通", "1K", "2K", "4K"] },
          quality: { options: ["high", "medium", "low"] },
        },
        defaultParams: { resolution: "普通", quality: "high" },
      }),
      dispatchPolicy: undefined,
      parameters: { resolution: "4k", quality: "low" },
      fallbackQueueName: "generation-submit-image",
    });

    assert.deepEqual(execution.parameters, { resolution: "4K", quality: "low" });
  });

  it("resolves configured video models to the video provider executor and mapped task mode", () => {
    const execution = resolveGenerationModelExecution({
      kind: "video",
      modelCode: "seedance-i2v-fast",
      modelConfig: videoModelConfig({
        modelCode: "seedance-i2v-fast",
        providerProtocol: "volcengine_ark_video",
        defaultParams: {
          aspectRatio: "9:16",
          resolution: "720p",
          durationSec: 5,
          count: 1,
        },
      }),
      dispatchPolicy: undefined,
      parameters: {
        mode: "reference-video",
        resolution: "1080p",
      },
      fallbackQueueName: "fallback-video-submit",
    });

    assert.equal(execution.providerExecutor, "seedance");
    assert.equal(execution.queueName, "fallback-video-submit");
    assert.equal(execution.taskMode, "video.reference_guided_video");
    assert.deepEqual(execution.parameters, {
      aspectRatio: "9:16",
      resolution: "1080p",
      durationSec: 5,
      count: 1,
      mode: "reference-video",
    });
  });

  it("maps first-last-frame generation to the provider first-last-frame task mode", () => {
    const execution = resolveGenerationModelExecution({
      kind: "video",
      modelCode: "seedance-2-0",
      modelConfig: videoModelConfig({
        modelCode: "seedance-2-0",
        taskModes: ["video.first_last_frame_to_video"],
        uiConfig: {
          supportedModes: ["first_last_frame_to_video"],
        },
      }),
      dispatchPolicy: undefined,
      parameters: {
        mode: "first-last-frame",
        resolution: "720p",
      },
      fallbackQueueName: "fallback-video-submit",
    });

    assert.equal(execution.taskMode, "video.first_last_frame_to_video");
  });

  it("resolves configured Aliyun Bailian video models to the video provider executor", () => {
    const execution = resolveGenerationModelExecution({
      kind: "video",
      modelCode: "happyhorse-1.0-r2v",
      modelConfig: videoModelConfig({
        modelCode: "happyhorse-1.0-r2v",
        providerName: "aliyun-bailian",
        providerProtocol: "aliyun_bailian_video",
        providerModel: "happyhorse-1.0-r2v",
        defaultParams: {
          aspectRatio: "16:9",
        },
      }),
      dispatchPolicy: dispatchPolicy({ submitQueueName: "generation-submit-video" }),
      parameters: {},
      fallbackQueueName: "fallback-video-submit",
    });

    assert.equal(execution.providerExecutor, "seedance");
    assert.equal(execution.queueName, "generation-submit-video");
    assert.equal(execution.taskMode, "video.image_to_video");
    assert.deepEqual(execution.parameters, {
      aspectRatio: "16:9",
      resolution: "720p",
      durationSec: "5",
    });
  });

  it("routes custom HTTP Volcengine Ark content video models to the video executor", () => {
    const execution = resolveGenerationModelExecution({
      kind: "video",
      modelCode: "extra_seedance_2.0_mini",
      modelConfig: videoModelConfig({
        modelCode: "extra_seedance_2.0_mini",
        providerName: "Extra Token",
        providerProtocol: "custom_http",
        providerModel: "doubao-seedance-2-0-mini-260615",
        providerConfig: {
          baseURL: "https://ark.example.com",
          requestPath: "/api/v3/contents/generations/tasks",
          queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
          requestFormat: "volcengine_ark_contents_generation",
          apiKeyEnv: "EXTRA_TOEKN_API_KEY",
        },
      }),
      dispatchPolicy: dispatchPolicy({ submitQueueName: "generation-submit-video" }),
      parameters: {
        mode: "first-frame",
        resolution: "480p",
      },
      fallbackQueueName: "fallback-video-submit",
    });

    assert.equal(execution.providerExecutor, "seedance");
    assert.equal(execution.queueName, "generation-submit-video");
    assert.equal(execution.taskMode, "video.image_to_video");
  });

  it("resolves configured custom-http image models and normalizes stale defaults from schema", () => {
    const execution = resolveGenerationModelExecution({
      kind: "image",
      modelCode: "Doubao-Seedream-4.5",
      modelConfig: imageModelConfig({
        modelCode: "Doubao-Seedream-4.5",
        providerName: "volcengine",
        providerProtocol: "custom_http",
        parameterSchema: {
          quality: { type: "enum", options: ["2K", "4K"] },
          aspectRatio: { type: "enum", options: ["1:1", "16:9"] },
        },
        defaultParams: {
          quality: "standard",
          aspectRatio: "1:1",
          count: 1,
        },
      }),
      dispatchPolicy: dispatchPolicy({ submitQueueName: "generation-submit-image" }),
      parameters: {},
      fallbackQueueName: "fallback-image-submit",
    });

    assert.equal(execution.providerExecutor, "image-http");
    assert.equal(execution.queueName, "generation-submit-image");
    assert.deepEqual(execution.parameters, {
      quality: "2K",
      aspectRatio: "1:1",
      count: 1,
    });
  });

  it("routes Lingdong image models to the image executor", () => {
    const execution = resolveGenerationModelExecution({
      kind: "image",
      modelCode: "lingdong-image",
      modelConfig: imageModelConfig({
        modelCode: "lingdong-image",
        providerName: "lingdong",
        providerProtocol: "lingdong_api",
      }),
      dispatchPolicy: dispatchPolicy({ submitQueueName: "generation-submit-image" }),
      parameters: {
        mode: "single-image",
      },
      fallbackQueueName: "fallback-image-submit",
    });

    assert.equal(execution.providerExecutor, "gpt-image-2");
    assert.equal(execution.queueName, "generation-submit-image");
  });

  it("routes Cumob image models to the image executor", () => {
    const execution = resolveGenerationModelExecution({
      kind: "image",
      modelCode: "cumob-gpt-image-2-pro",
      modelConfig: imageModelConfig({
        modelCode: "cumob-gpt-image-2-pro",
        providerName: "酷模智多星",
        providerProtocol: "cumob_image",
        providerModel: "gpt-image-2-pro",
      }),
      dispatchPolicy: dispatchPolicy({ submitQueueName: "generation-submit-image" }),
      parameters: {
        mode: "single-image",
      },
      fallbackQueueName: "fallback-image-submit",
    });

    assert.equal(execution.providerExecutor, "gpt-image-2");
    assert.equal(execution.queueName, "generation-submit-image");
  });

  it("routes explicitly selected Volcengine image adapters to the image executor", () => {
    const execution = resolveGenerationModelExecution({
      kind: "image",
      modelCode: "jimeng-5-image",
      modelConfig: imageModelConfig({
        modelCode: "jimeng-5-image",
        providerName: "volcengine",
        providerProtocol: "volcengine_ark_image",
        providerModel: "doubao-seedream-5-0-260128",
      }),
      dispatchPolicy: dispatchPolicy({ submitQueueName: "generation-submit-image" }),
      parameters: { mode: "single-image" },
      fallbackQueueName: "fallback-image-submit",
    });

    assert.equal(execution.providerExecutor, "gpt-image-2");
    assert.equal(execution.queueName, "generation-submit-image");
  });

  it("does not infer Cumob from custom-http apiKeyEnv", () => {
    const execution = resolveGenerationModelExecution({
      kind: "image",
      modelCode: "cumob-gpt-image-2-pro",
      modelConfig: imageModelConfig({
        modelCode: "cumob-gpt-image-2-pro",
        providerName: "酷模智多星",
        providerProtocol: "custom_http",
        providerModel: "gpt-image-2-pro",
        providerConfig: {
          apiKeyEnv: "CUMOB_API_KEY",
        },
      }),
      dispatchPolicy: dispatchPolicy({ submitQueueName: "generation-submit-image" }),
      parameters: {
        mode: "single-image",
      },
      fallbackQueueName: "fallback-image-submit",
    });

    assert.equal(execution.providerExecutor, "image-http");
    assert.equal(execution.queueName, "generation-submit-image");
  });

  it("routes GlobalAiOpc image models to the image executor", () => {
    const execution = resolveGenerationModelExecution({
      kind: "image",
      modelCode: "global-ai-opc-nano-banana-pro",
      modelConfig: imageModelConfig({
        modelCode: "global-ai-opc-nano-banana-pro",
        providerName: "GlobalAiOpc（壹嘉云）",
        providerProtocol: "global_ai_opc_image",
        providerModel: "nano-banana-pro",
      }),
      dispatchPolicy: dispatchPolicy({ submitQueueName: "generation-submit-image" }),
      parameters: {
        mode: "single-image",
      },
      fallbackQueueName: "fallback-image-submit",
    });

    assert.equal(execution.providerExecutor, "gpt-image-2");
    assert.equal(execution.queueName, "generation-submit-image");
  });

  it("routes Lingdong video models to the video executor", () => {
    const execution = resolveGenerationModelExecution({
      kind: "video",
      modelCode: "lingdong-video",
      modelConfig: videoModelConfig({
        modelCode: "lingdong-video",
        providerName: "lingdong",
        providerProtocol: "lingdong_api",
        providerModel: "sora-2",
      }),
      dispatchPolicy: dispatchPolicy({ submitQueueName: "generation-submit-video" }),
      parameters: {
        mode: "reference-video",
      },
      fallbackQueueName: "fallback-video-submit",
    });

    assert.equal(execution.providerExecutor, "seedance");
    assert.equal(execution.queueName, "generation-submit-video");
  });

  it("keeps configured Lingdong video parameters instead of applying Seedance defaults", () => {
    const execution = resolveGenerationModelExecution({
      kind: "video",
      modelCode: "cvk",
      modelConfig: videoModelConfig({
        modelCode: "cvk",
        providerName: "灵动中转",
        providerProtocol: "lingdong_api",
        providerModel: "cvk",
        parameterSchema: {
          ratio: { options: ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "21:9"] },
          resolution: { options: ["720p"] },
          durationSec: { type: "integer", minimum: 4, maximum: 15, options: ["10", "15"] },
        },
        defaultParams: {
          ratio: "9:16",
        },
      }),
      dispatchPolicy: dispatchPolicy({ submitQueueName: "generation-submit-video" }),
      parameters: {
        mode: "reference-video",
        ratio: "9:16",
        resolution: "720p",
        durationSec: 10,
        aspectRatio: "9:16",
      },
      fallbackQueueName: "fallback-video-submit",
    });

    assert.equal(execution.providerExecutor, "seedance");
    assert.equal(execution.queueName, "generation-submit-video");
    assert.deepEqual(execution.parameters, {
      ratio: "9:16",
      resolution: "720p",
      durationSec: 10,
      mode: "reference-video",
    });
  });

  it("normalizes frontend video aliases to configured Lingdong schema fields", () => {
    const modelConfig = videoModelConfig({
      modelCode: "cvk",
      providerName: "灵动中转",
      providerProtocol: "lingdong_api",
      providerModel: "cvk",
      defaultParams: {},
    });
    modelConfig.parameterSchema = {
      ratio: { options: ["9:16"] },
      resolution: { options: ["720p"] },
      durationSec: { options: ["15"] },
    };
    const execution = resolveGenerationModelExecution({
      kind: "video",
      modelCode: "cvk",
      modelConfig,
      dispatchPolicy: dispatchPolicy({ submitQueueName: "generation-submit-video" }),
      parameters: {
        mode: "reference-video",
        aspectRatio: "9:16",
        videoResolution: "720P",
        videoDurationSec: "15",
      },
      fallbackQueueName: "fallback-video-submit",
    });

    assert.deepEqual(execution.parameters, {
      ratio: "9:16",
      resolution: "720p",
      durationSec: "15",
      mode: "reference-video",
    });
  });

  it("routes GlobalAiOpc video models to the video executor by provider protocol", () => {
    const execution = resolveGenerationModelExecution({
      kind: "video",
      modelCode: "grok_video3",
      modelConfig: videoModelConfig({
        modelCode: "grok_video3",
        providerName: "GlobalAiOpc",
        providerProtocol: "globalaiopc_video",
        providerModel: "grok_video3",
        providerConfig: {
          apiKeyEnv: "GLOBAL_AI_OPC_API_KEY",
          requestFormat: "globalaiopc_grok",
        },
      }),
      dispatchPolicy: dispatchPolicy({ submitQueueName: "generation-submit-video" }),
      parameters: {
        mode: "reference-video",
      },
      fallbackQueueName: "fallback-video-submit",
    });

    assert.equal(execution.providerExecutor, "seedance");
    assert.equal(execution.queueName, "generation-submit-video");
  });

  it("routes explicitly selected Extra Token adapters to the video executor", () => {
    const execution = resolveGenerationModelExecution({
      kind: "video",
      modelCode: "extra-seedance",
      modelConfig: videoModelConfig({
        modelCode: "extra-seedance",
        providerName: "Extra Token",
        providerProtocol: "extra_token_video",
        providerModel: "doubao-seedance-2-0-fast-260128",
      }),
      dispatchPolicy: dispatchPolicy({ submitQueueName: "generation-submit-video" }),
      parameters: { mode: "first-frame" },
      fallbackQueueName: "fallback-video-submit",
    });

    assert.equal(execution.providerExecutor, "seedance");
    assert.equal(execution.queueName, "generation-submit-video");
  });

  it("routes dedicated GlobalAiOpc video models by key and format", () => {
    const execution = resolveGenerationModelExecution({
      kind: "video",
      modelCode: "sd2_manxue",
      modelConfig: videoModelConfig({
        modelCode: "sd2_manxue",
        providerName: "GlobalAiOpc",
        providerProtocol: "globalaiopc_video",
        providerModel: "sd2_manxue",
        providerConfig: {
          apiKeyEnv: "GLOBAL_AI_OPC_API_KEY",
          requestFormat: "globalaiopc_sd2_manxue",
        },
      }),
      dispatchPolicy: dispatchPolicy({ submitQueueName: "generation-submit-video" }),
      parameters: {
        mode: "reference-video",
      },
      fallbackQueueName: "fallback-video-submit",
    });

    assert.equal(execution.providerExecutor, "seedance");
    assert.equal(execution.queueName, "generation-submit-video");
  });

  it("routes dedicated GlobalAiOpc video models by key and video endpoint", () => {
    const execution = resolveGenerationModelExecution({
      kind: "video",
      modelCode: "sd2_manxue_fast",
      modelConfig: videoModelConfig({
        modelCode: "sd2_manxue_fast",
        providerName: "GlobalAiOpc",
        providerProtocol: "globalaiopc_video",
        providerModel: "sd2_manxue_fast",
        providerConfig: {
          apiKeyEnv: "GLOBAL_AI_OPC_API_KEY",
          createTaskEndpoint: "/v1/sd2_manxue/videos",
          requestFormat: "json",
        },
      }),
      dispatchPolicy: dispatchPolicy({ submitQueueName: "generation-submit-video" }),
      parameters: {
        mode: "reference-video",
      },
      fallbackQueueName: "fallback-video-submit",
    });

    assert.equal(execution.providerExecutor, "seedance");
    assert.equal(execution.queueName, "generation-submit-video");
  });

  it("drops parameters not declared by the selected video model schema", () => {
    const execution = resolveGenerationModelExecution({
      kind: "video",
      modelCode: "sora-2",
      modelConfig: videoModelConfig({
        modelCode: "sora-2",
        providerName: "lingdong",
        providerProtocol: "lingdong_api",
        providerModel: "sora-2",
        parameterSchema: {
          aspectRatio: { enum: ["9:16", "16:9"] },
          resolution: { enum: ["720p"] },
          durationSec: { enum: ["4", "8", "12"] },
          orientation: { enum: ["portrait", "landscape", "square"] },
        },
        defaultParams: {
          aspectRatio: "9:16",
          resolution: "720p",
          durationSec: 4,
        },
      }),
      dispatchPolicy: dispatchPolicy({ submitQueueName: "generation-submit-video" }),
      parameters: {
        mode: "first-frame",
        aspectRatio: "16:9",
        resolution: "720p",
        durationSec: 4,
        orientation: "portrait",
        size: "1024x1024",
        imageSize: "1024x1024",
      },
      fallbackQueueName: "fallback-video-submit",
    });

    assert.deepEqual(execution.parameters, {
      mode: "first-frame",
      aspectRatio: "16:9",
      resolution: "720p",
      durationSec: 4,
      orientation: "portrait",
    });
  });

  it("rejects generation requests without an explicit model", () => {
    assertExecutionError(
      () => resolveGenerationModelExecution({
        kind: "image",
        modelCode: "",
        modelConfig: undefined,
        dispatchPolicy: undefined,
        parameters: {},
        fallbackQueueName: "fallback-image-submit",
      }),
      "model_required",
    );
  });

  it("keeps legacy mock models on the mock execution path", () => {
    const execution = resolveGenerationModelExecution({
      kind: "image",
      modelCode: "nano_banana_2",
      modelConfig: undefined,
      dispatchPolicy: undefined,
      parameters: {
        mode: "single-image",
      },
      fallbackQueueName: "fallback-image-submit",
    });

    assert.equal(execution.providerExecutor, "mock");
    assert.equal(execution.queueName, "fallback-image-submit");
    assert.equal(execution.taskMode, "image.generate");
    assert.deepEqual(execution.parameters, {
      mode: "single-image",
    });
  });

  it("routes APIMart Flow Music through the durable audio executor", () => {
    const execution = resolveGenerationModelExecution({
      kind: "audio",
      modelCode: "flowmusic",
      modelConfig: imageModelConfig({
        modelCode: "flowmusic",
        displayName: "Flow Music",
        providerName: "apimart",
        providerModel: "flowmusic",
        providerProtocol: "apimart_audio",
        mediaType: "audio",
        taskModes: ["audio.music_generation"],
        parameterSchema: {
          mode: { enum: ["music"] },
          autoGenerateLyrics: { type: "boolean" },
          generateLyrics: { type: "boolean" },
          lyricsMode: { enum: ["generate", "custom"] },
          lyrics: { type: "string" },
          musicTitle: { type: "string" },
          musicBpm: { type: "number" },
          durationSec: { type: "number" },
          instrumental: { type: "boolean" },
        },
        providerConfig: { baseURL: "https://api.example.test", apiKeyEnv: "APIMART_API_KEY" },
      }),
      dispatchPolicy: dispatchPolicy({ submitQueueName: "generation-submit-audio" }),
      parameters: {
        mode: "music",
        autoGenerateLyrics: true,
        generateLyrics: true,
        lyricsMode: "generate",
        musicTitle: "微光",
        musicBpm: 88,
        durationSec: 60,
      },
      fallbackQueueName: "generation-submit-audio",
    });

    assert.equal(execution.providerExecutor, "apimart-audio");
    assert.equal(execution.queueName, "generation-submit-audio");
    assert.equal(execution.taskMode, "audio.music_generation");
    assert.equal(execution.parameters.autoGenerateLyrics, true);
    assert.equal(execution.parameters.musicTitle, "微光");
    assert.equal(execution.parameters.musicBpm, 88);
    assert.equal(execution.parameters.durationSec, 60);
  });

  it("routes SoundClone through the dedicated GlobalAiOpc audio executor", () => {
    const execution = resolveGenerationModelExecution({
      kind: "audio",
      modelCode: "soundclone",
      modelConfig: imageModelConfig({
        modelCode: "soundclone",
        displayName: "SoundClone",
        providerName: "GlobalAiOpc",
        providerModel: "soundCloningAudio",
        providerProtocol: "globalaiopc_sound_clone",
        mediaType: "audio",
        taskModes: ["audio.text_to_speech"],
      }),
      dispatchPolicy: dispatchPolicy({ submitQueueName: "generation-submit-image" }),
      parameters: { voiceId: "cloned-voice-1" },
      fallbackQueueName: "generation-submit-image",
    });

    assert.equal(execution.providerExecutor, "globalaiopc-sound-clone");
    assert.equal(execution.queueName, "generation-submit-image");
    assert.equal(execution.taskMode, "audio.text_to_speech");
  });
});

function assertExecutionError(callback: () => void, code: string) {
  assert.throws(
    callback,
    (error) => error instanceof GenerationModelExecutionResolutionError && error.code === code,
  );
}

function dispatchPolicy(
  overrides: Partial<AiModelDispatchPolicyRecord> = {},
): AiModelDispatchPolicyRecord {
  return {
    id: "dispatch-policy-1",
    modelConfigId: "model-config-1",
    submitQueueName: "generation-submit-image",
    pollQueueName: null,
    finalizeQueueName: null,
    providerRpmLimit: 60,
    providerConcurrentLimit: 5,
    submitConcurrencyLimit: 5,
    pollingIntervalMs: 5000,
    pollingConcurrencyLimit: 5,
    status: "active",
    ...overrides,
  };
}

function videoModelConfig(overrides: Partial<AiModelConfigRecord> = {}): AiModelConfigRecord {
  return {
    ...imageModelConfig({
      modelCode: "seedance-i2v-pro",
      displayName: "Seedance I2V Pro",
      providerName: "volcengine",
      providerModel: "seedance-i2v-pro",
      providerProtocol: "volcengine_ark_video",
      mediaType: "video",
      taskModes: ["video.image_to_video"],
      parameterSchema: {
        aspectRatio: { enum: ["9:16", "16:9"] },
        resolution: { enum: ["720p", "1080p"] },
        durationSec: { enum: ["5", "10"] },
        count: { minimum: 1, maximum: 2 },
        ...overrides.parameterSchema,
      },
      defaultParams: {
        aspectRatio: "9:16",
        resolution: "720p",
        durationSec: 5,
        count: 1,
      },
      uiConfig: {
        supportedModes: ["first-frame", "reference-video"],
        ...overrides.uiConfig,
      },
      ...overrides,
    }),
  };
}

function imageModelConfig(overrides: Partial<AiModelConfigRecord> = {}): AiModelConfigRecord {
  return {
    id: "model-config-1",
    modelCode: "gpt-image-2-cn",
    displayName: "GPT Image 2 CN",
    providerName: "openai",
    providerModel: "gpt-image-2-cn",
    providerProtocol: "openai_images",
    invocationMode: "async",
    mediaType: "image",
    taskModes: ["image.generate"],
    capabilities: {},
    parameterSchema: {},
    defaultParams: {},
    providerConfig: {},
    pricing: {},
    limits: {},
    uiConfig: {},
    status: "active",
    sortOrder: 10,
    remark: null,
    ...overrides,
  };
}
