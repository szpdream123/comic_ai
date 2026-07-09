import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AiModelConfigRecord } from "../../model-catalog/ai-model-config.store.ts";
import { buildLingdongArtifactDownloadInit } from "../seedance-video.worker.ts";

describe("Lingdong video artifact download", () => {
  it("adds provider authorization for Lingdong content endpoints", () => {
    const init = buildLingdongArtifactDownloadInit(
      lingdongModelConfig({
        apiKeyEnv: "LINGDONG_API_KEY",
      }),
      "https://www.lingdongapi.com/v1/videos/lingdong-task-1/content",
      { LINGDONG_API_KEY: "lingdong-test-key" },
    );

    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer lingdong-test-key");
  });

  it("does not add provider authorization for non-Lingdong artifact URLs", () => {
    const init = buildLingdongArtifactDownloadInit(
      lingdongModelConfig({
        apiKeyEnv: "LINGDONG_API_KEY",
      }),
      "https://cdn.example.test/generated-video.mp4",
      { LINGDONG_API_KEY: "lingdong-test-key" },
    );

    assert.equal(init, undefined);
  });
});

function lingdongModelConfig(providerConfig: Record<string, unknown>): AiModelConfigRecord {
  return {
    id: "lingdong-config",
    modelCode: "seedance-i2v-pro",
    displayName: "Lingdong Video",
    providerName: "lingdong",
    providerModel: "cvk",
    providerProtocol: "lingdong_api",
    invocationMode: "async",
    mediaType: "video",
    taskModes: ["episode_generate_video"],
    capabilities: {},
    parameterSchema: {},
    defaultParams: {},
    providerConfig,
    pricing: {},
    limits: {},
    uiConfig: {},
    status: "active",
    sortOrder: 1,
    remark: null,
  };
}
