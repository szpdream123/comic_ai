import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AiModelConfigRecord, AiModelDispatchPolicyRecord } from "../ai-model-config.store.ts";
import {
  GenerationModelExecutionResolutionError,
  resolveGenerationModelExecution,
} from "../generation-model-execution.resolver.ts";

describe("generation model execution resolver", () => {
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
