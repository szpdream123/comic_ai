import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AiModelConfigRecord } from "../ai-model-config.store.ts";
import {
  GenerationModelRequestValidationError,
  validateGenerationModelRequest,
} from "../generation-model-request.validator.ts";

describe("generation model request validator", () => {
  it("accepts parameters supported by the selected image model schema", () => {
    assert.doesNotThrow(() => {
      validateGenerationModelRequest({
        kind: "image",
        modelCode: "gpt-image-2-cn",
        modelConfig: imageModelConfig(),
        parameters: {
          mode: "single-image",
          aspectRatio: "16:9",
          resolution: "2K",
          count: 1,
        },
        prompt: "panel concept art",
      });
    });
  });

  it("rejects parameters outside the selected model schema", () => {
    assertValidationError(
      () => validateGenerationModelRequest({
        kind: "image",
        modelCode: "gpt-image-2-cn",
        modelConfig: imageModelConfig(),
        parameters: {
          mode: "single-image",
          aspectRatio: "16:9",
          resolution: "720p",
          count: 1,
        },
        prompt: "panel concept art",
      }),
      "model_parameter_unsupported",
    );
  });

  it("accepts enum parameters declared with admin options", () => {
    assert.doesNotThrow(() => {
      validateGenerationModelRequest({
        kind: "image",
        modelCode: "gpt-image-2-cn",
        modelConfig: imageModelConfig({
          parameterSchema: {
            aspectRatio: { options: ["auto", "1536x768 1K VR"] },
          },
        }),
        parameters: {
          mode: "single-image",
          aspectRatio: "1536x768 1K VR",
          resolution: "2K",
          count: 1,
        },
        prompt: "panel concept art",
      });
    });
  });

  it("rejects parameters outside admin options", () => {
    assertValidationError(
      () => validateGenerationModelRequest({
        kind: "image",
        modelCode: "gpt-image-2-cn",
        modelConfig: imageModelConfig({
          parameterSchema: {
            aspectRatio: { options: ["auto", "1536x768 1K VR"] },
          },
        }),
        parameters: {
          mode: "single-image",
          aspectRatio: "16:9",
          resolution: "2K",
          count: 1,
        },
        prompt: "panel concept art",
      }),
      "model_parameter_unsupported",
    );
  });

  it("rejects media type mismatches", () => {
    assertValidationError(
      () => validateGenerationModelRequest({
        kind: "video",
        modelCode: "gpt-image-2-cn",
        modelConfig: imageModelConfig(),
        parameters: {
          mode: "first-frame",
          aspectRatio: "16:9",
          resolution: "720p",
          count: 1,
        },
        prompt: "animate this panel",
      }),
      "model_media_type_mismatch",
    );
  });

  it("rejects modes unsupported by the selected model", () => {
    assertValidationError(
      () => validateGenerationModelRequest({
        kind: "image",
        modelCode: "gpt-image-2-cn",
        modelConfig: imageModelConfig(),
        parameters: {
          mode: "first-frame",
          aspectRatio: "16:9",
          resolution: "2K",
          count: 1,
        },
        prompt: "panel concept art",
      }),
      "model_task_mode_unsupported",
    );
  });

  it("rejects prompts longer than the selected model allows", () => {
    assertValidationError(
      () => validateGenerationModelRequest({
        kind: "image",
        modelCode: "gpt-image-2-cn",
        modelConfig: imageModelConfig({
          parameterSchema: {
            prompt: { maxLength: 4 },
          },
          limits: {
            maxPromptLength: 100,
          },
        }),
        parameters: {
          mode: "single-image",
          aspectRatio: "16:9",
          resolution: "2K",
          count: 1,
        },
        prompt: "too long",
      }),
      "model_prompt_too_long",
    );
  });

  it("accepts parameters supported by the selected video model schema", () => {
    assert.doesNotThrow(() => {
      validateGenerationModelRequest({
        kind: "video",
        modelCode: "seedance-i2v-pro",
        modelConfig: videoModelConfig(),
        parameters: {
          mode: "first-frame",
          aspectRatio: "9:16",
          resolution: "720p",
          durationSec: 5,
          count: 1,
        },
        prompt: "animate this panel",
      });
    });
  });
});

function assertValidationError(callback: () => void, code: string) {
  assert.throws(
    callback,
    (error) => error instanceof GenerationModelRequestValidationError && error.code === code,
  );
}

function videoModelConfig(overrides: Partial<AiModelConfigRecord> = {}): AiModelConfigRecord {
  return {
    ...imageModelConfig({
      modelCode: "seedance-i2v-pro",
      displayName: "Seedance I2V Pro",
      providerModel: "seedance-i2v-pro",
      mediaType: "video",
      taskModes: ["video.image_to_video"],
      parameterSchema: {
        prompt: { maxLength: 100 },
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
        supportedModes: ["first-frame", "image_to_video"],
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
    providerProtocol: "openai-images",
    invocationMode: "sync",
    mediaType: "image",
    taskModes: ["image.generate"],
    capabilities: {},
    parameterSchema: {
      prompt: { maxLength: 100 },
      aspectRatio: { enum: ["1:1", "16:9"] },
      quality: { enum: ["1K", "2K"] },
      count: { minimum: 1, maximum: 4 },
      ...overrides.parameterSchema,
    },
    defaultParams: {
      aspectRatio: "16:9",
      quality: "2K",
      count: 1,
    },
    providerConfig: {},
    pricing: {},
    limits: {
      maxPromptLength: 100,
      ...overrides.limits,
    },
    uiConfig: {
      supportedModes: ["single-image", "multi-image"],
      ...overrides.uiConfig,
    },
    status: "active",
    sortOrder: 10,
    remark: null,
    ...overrides,
  };
}
