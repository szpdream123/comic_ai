import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AiModelConfigRecord } from "../ai-model-config.store.ts";
import {
  GenerationModelRequestValidationError,
  validateGenerationModelRequest,
} from "../generation-model-request.validator.ts";
import { findActiveAiModelConfigByCode } from "../ai-model-config.store.ts";

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

  it("prefers admin options over stale enum values", () => {
    assert.doesNotThrow(() => {
      validateGenerationModelRequest({
        kind: "image",
        modelCode: "global-ai-opc-gpt-image-2",
        modelConfig: imageModelConfig({
          parameterSchema: {
            quality: { options: ["2K", "4k", "1k"], enum: ["low", "medium", "high"] },
            size: { options: ["1:1", "16:9"], enum: ["1024x1024"] },
          },
        }),
        parameters: {
          mode: "single-image",
          quality: "4k",
          size: "16:9",
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

  it("accepts first-last-frame mode when the configured task mode uses provider to-video naming", () => {
    assert.doesNotThrow(() => {
      validateGenerationModelRequest({
        kind: "video",
        modelCode: "seedance-2-0",
        modelConfig: videoModelConfig({
          taskModes: ["video.first_last_frame_to_video"],
          uiConfig: {
            supportedModes: ["first_last_frame_to_video"],
          },
        }),
        parameters: {
          mode: "first-last-frame",
          aspectRatio: "16:9",
          resolution: "720p",
          durationSec: 5,
          count: 1,
        },
        prompt: "animate from first frame to last frame",
      });
    });
  });

  it("keeps the secret request domain when resolving GPT image model config", async () => {
    const db = {
      async query<T = Record<string, unknown>>(sql: string) {
        if (sql.includes("FROM ai_model_configs")) {
          return {
            rows: [
              {
                id: "model-config-1",
                model_code: "gpt-image-2-cn",
                display_name: "GPT Image 2 CN",
                provider_name: "openai",
                provider_model: "gpt-image-2",
                provider_protocol: "openai_images",
                invocation_mode: "sync",
                media_type: "image",
                task_modes_json: ["image.generate"],
                capabilities_json: {},
                parameter_schema_json: {},
                default_params_json: {},
                provider_config_json: {
                  baseURL: "https://relay.example.test",
                  requestPath: "/v1/images/generations",
                  apiKeyEnv: "GPT_IMAGE2_API_KEY",
                },
                pricing_json: {},
                limits_json: {},
                ui_config_json: {},
                status: "active",
                sort_order: 10,
                remark: null,
              },
            ] as T[],
          };
        }
        if (sql.includes("FROM admin_secret_values")) {
          return {
            rows: [
              {
                secret_value: "sk-test",
                request_domain: "https://image.shoestravel.xin",
              },
            ] as T[],
          };
        }
        return { rows: [] as T[] };
      },
    } as const;

    const model = await findActiveAiModelConfigByCode(db, "gpt-image-2-cn");
    assert.equal(model?.providerConfig.baseURL, "https://image.shoestravel.xin");
    assert.equal(model?.providerConfig.requestPath, "/v1/images/generations");
    assert.equal(model?.providerConfig.apiKey, "sk-test");
  });

  it("resolves provider secret when model stores a blank apiKeyEnv", async () => {
    const db = {
      async query<T = Record<string, unknown>>(sql: string) {
        if (sql.includes("FROM ai_model_configs")) {
          return {
            rows: [
              {
                id: "lingdong-model-config-1",
                model_code: "gpt-image-2",
                display_name: "gpt-image-2",
                provider_name: "lingdong",
                provider_model: "gpt-image-2",
                provider_protocol: "lingdong_api",
                invocation_mode: "sync",
                media_type: "image",
                task_modes_json: ["image.generate"],
                capabilities_json: {},
                parameter_schema_json: {},
                default_params_json: {},
                provider_config_json: {
                  baseURL: "https://www.lingdongapi.com",
                  requestPath: "/v1/images/generations",
                  apiKeyEnv: "",
                },
                pricing_json: {},
                limits_json: {},
                ui_config_json: {},
                status: "active",
                sort_order: 10,
                remark: null,
              },
            ] as T[],
          };
        }
        if (sql.includes("FROM admin_secret_values")) {
          return {
            rows: [
              {
                secret_value: "sk-lingdong-test",
                request_domain: "https://www.lingdongapi.com",
              },
            ] as T[],
          };
        }
        return { rows: [] as T[] };
      },
    } as const;

    const model = await findActiveAiModelConfigByCode(db, "gpt-image-2");
    assert.equal(model?.providerConfig.baseURL, "https://www.lingdongapi.com");
    assert.equal(model?.providerConfig.apiKey, "sk-lingdong-test");
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
