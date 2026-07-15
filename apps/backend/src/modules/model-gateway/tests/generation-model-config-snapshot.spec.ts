import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AiModelConfigRecord } from "../../model-catalog/ai-model-config.store.ts";
import { createGenerationModelConfigSnapshot } from "../generation-model-config-snapshot.ts";

describe("generation model config snapshot", () => {
  it("keeps credential references while removing direct credentials recursively", () => {
    const modelConfig: AiModelConfigRecord = {
      id: "model-config-id",
      modelCode: "image-model",
      displayName: "Image Model",
      providerName: "provider",
      providerModel: "provider-image-model",
      providerProtocol: "custom_http",
      invocationMode: "sync",
      mediaType: "image",
      taskModes: ["image.generate"],
      capabilities: {},
      parameterSchema: {},
      defaultParams: {},
      providerConfig: {
        baseURL: "https://provider.example.test",
        apiKey: "direct-api-key",
        apiKeyEnv: "PROVIDER_API_KEY",
        extraHeaders: {
          Authorization: "Bearer direct-token",
          "x-region": "region-1",
        },
      },
      pricing: {},
      limits: {},
      uiConfig: {},
      status: "active",
      sortOrder: 1,
      remark: null,
    };

    const snapshot = createGenerationModelConfigSnapshot(modelConfig);

    assert.equal(snapshot.config.providerConfig.apiKey, undefined);
    assert.equal(snapshot.config.providerConfig.apiKeyEnv, "PROVIDER_API_KEY");
    assert.deepEqual(snapshot.config.providerConfig.extraHeaders, { "x-region": "region-1" });
    assert.doesNotMatch(JSON.stringify(snapshot), /direct-api-key|direct-token/);
  });
});
