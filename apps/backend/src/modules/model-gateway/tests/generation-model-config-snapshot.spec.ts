import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AiModelConfigRecord } from "../../model-catalog/ai-model-config.store.ts";
import {
  createGenerationModelConfigSnapshot,
  createGenerationModelConfigSnapshotForTask,
  createGenerationProviderRouteIdentity,
  resolveGenerationModelConfigForTask,
} from "../generation-model-config-snapshot.ts";

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

  it("creates a stable provider route identity without direct credentials", () => {
    const first = createGenerationModelConfigSnapshot(modelConfig({
      baseURL: "https://provider.example.test",
      endpoint: "/v1/images/generations",
      accountRef: "account-east",
      region: "cn-east-1",
      apiKey: "secret-one",
      apiKeyEnv: "PROVIDER_EAST_API_KEY",
    }));
    const reordered = createGenerationModelConfigSnapshot(modelConfig({
      apiKeyEnv: "PROVIDER_EAST_API_KEY",
      apiKey: "secret-two",
      region: "cn-east-1",
      accountRef: "account-east",
      endpoint: "/v1/images/generations",
      baseURL: "https://provider.example.test",
    }));

    const firstIdentity = createGenerationProviderRouteIdentity({ modelConfigSnapshot: first });
    const reorderedIdentity = createGenerationProviderRouteIdentity({ modelConfigSnapshot: reordered });

    assert.equal(reorderedIdentity, firstIdentity);
    assert.doesNotMatch(firstIdentity ?? "", /secret-one|secret-two|provider\.example|account-east/);
  });

  it("changes provider route identity when endpoint, account, region, or credential reference changes", () => {
    const identity = (providerConfig: Record<string, unknown>) => createGenerationProviderRouteIdentity({
      modelConfigSnapshot: createGenerationModelConfigSnapshot(modelConfig(providerConfig)),
    });
    const base = {
      endpoint: "/v1/images/generations",
      accountRef: "account-east",
      region: "cn-east-1",
      apiKeyEnv: "PROVIDER_EAST_API_KEY",
    };
    const baseline = identity(base);

    assert.notEqual(identity({ ...base, endpoint: "/v2/images/generations" }), baseline);
    assert.notEqual(identity({ ...base, accountRef: "account-west" }), baseline);
    assert.notEqual(identity({ ...base, region: "cn-west-1" }), baseline);
    assert.notEqual(identity({ ...base, apiKeyEnv: "PROVIDER_WEST_API_KEY" }), baseline);
  });

  it("pins image and video provider timeouts and removes obsolete strategy overrides", () => {
    const legacyOverrides = {
      endpoint: "https://provider.example.test/generate",
      timeoutMs: 5,
      requestTimeoutMs: 10,
      pollIntervalMs: 15,
      maxPollAttempts: 20,
    };
    const image = createGenerationModelConfigSnapshot(modelConfig(legacyOverrides, "image"));
    const video = createGenerationModelConfigSnapshot(modelConfig(legacyOverrides, "video"));

    assert.equal(image.config.providerConfig.timeoutMs, 60 * 60 * 1000);
    assert.equal(video.config.providerConfig.timeoutMs, 3 * 60 * 60 * 1000);
    for (const snapshot of [image, video]) {
      assert.equal(snapshot.config.providerConfig.requestTimeoutMs, undefined);
      assert.equal(snapshot.config.providerConfig.pollIntervalMs, undefined);
      assert.equal(snapshot.config.providerConfig.maxPollAttempts, undefined);
    }
  });

  it("freezes model revision and a non-secret credential version into the task route", async () => {
    const config = modelConfig({
      endpoint: "https://provider.example.test/v1/images",
      apiKey: "direct-secret-must-not-leak",
      apiKeyEnv: "PROVIDER_EAST_API_KEY",
    });
    const createDb = (secretVersionId: string, updatedAt: string) => ({
      async query(sql: string) {
        if (sql.includes("FROM ai_model_config_revisions")) {
          return { rows: [{ id: "revision-7" }] };
        }
        if (sql.includes("FROM admin_secret_values")) {
          return {
            rows: [{
              id: secretVersionId,
              secret_ref: "provider-east",
              secret_key: "PROVIDER_EAST_API_KEY",
              updated_at: updatedAt,
            }],
          };
        }
        throw new Error(`unexpected query: ${sql}`);
      },
    });

    const first = await createGenerationModelConfigSnapshotForTask(
      createDb("secret-version-1", "2026-07-22T08:00:00.000Z") as never,
      config,
    );
    const rotated = await createGenerationModelConfigSnapshotForTask(
      createDb("secret-version-2", "2026-07-22T09:00:00.000Z") as never,
      config,
    );
    const firstIdentity = createGenerationProviderRouteIdentity({ modelConfigSnapshot: first });
    const rotatedIdentity = createGenerationProviderRouteIdentity({ modelConfigSnapshot: rotated });

    assert.equal(first.providerConfigRevisionId, "revision-7");
    assert.match(first.credentialVersionRef ?? "", /^v1\.[a-f0-9]{32}$/);
    assert.notEqual(first.credentialVersionRef, rotated.credentialVersionRef);
    assert.notEqual(firstIdentity, rotatedIdentity);
    assert.doesNotMatch(JSON.stringify(first), /direct-secret-must-not-leak|secret-version-1/);
    assert.doesNotMatch(firstIdentity ?? "", /PROVIDER_EAST_API_KEY|provider\.example/);
  });

  it("upgrades captured ChiYuan v1 endpoints before an existing task is resumed", async () => {
    const captured = createGenerationModelConfigSnapshot({
      ...modelConfig({
        baseURL: "https://cy.apistudio.cc/",
        apiKeyEnv: "ChiYuan_API_KEY",
        requestFormat: "chiyuan_seedance_super_resolution",
        requestPath: "/v1/video/generations",
        createTaskEndpoint: "/v1/video/generations",
        queryTaskEndpoint: "/v1/video/generations/{taskId}",
      }, "video"),
      modelCode: "chiyuan-seedance-2.5-super-resolution",
      providerName: "ChiYuan",
      providerModel: "doubao-seedance-2-5-260628",
      providerProtocol: "chiyuan_video",
      invocationMode: "async_polling",
    });
    const db = {
      async query() {
        return { rows: [] };
      },
    };

    const resolved = await resolveGenerationModelConfigForTask(
      db as never,
      {
        model: "chiyuan-seedance-2.5-super-resolution",
        modelConfigSnapshot: captured,
      },
      "chiyuan-seedance-2.5-super-resolution",
    );

    assert.deepEqual(
      {
        requestPath: resolved?.providerConfig.requestPath,
        createTaskEndpoint: resolved?.providerConfig.createTaskEndpoint,
        queryTaskEndpoint: resolved?.providerConfig.queryTaskEndpoint,
      },
      {
        requestPath: "/api/v3/contents/generations/tasks",
        createTaskEndpoint: "/api/v3/contents/generations/tasks",
        queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
      },
    );
  });

  it("upgrades the original captured ChiYuan /v1/videos endpoints before resume", async () => {
    const captured = createGenerationModelConfigSnapshot({
      ...modelConfig({
        baseURL: "https://cy.apistudio.cc/",
        apiKeyEnv: "ChiYuan_API_KEY",
        requestFormat: "chiyuan_seedance_super_resolution",
        requestPath: "/v1/videos",
        createTaskEndpoint: "/v1/videos",
        queryTaskEndpoint: "/v1/videos/{taskId}",
      }, "video"),
      modelCode: "chiyuan-seedance-2.5-super-resolution",
      providerName: "ChiYuan",
      providerModel: "doubao-seedance-2-5-260628",
      providerProtocol: "chiyuan_video",
      invocationMode: "async_polling",
    });
    const db = {
      async query() {
        return { rows: [] };
      },
    };

    const resolved = await resolveGenerationModelConfigForTask(
      db as never,
      {
        model: "chiyuan-seedance-2.5-super-resolution",
        modelConfigSnapshot: captured,
      },
      "chiyuan-seedance-2.5-super-resolution",
    );

    assert.deepEqual(
      {
        requestPath: resolved?.providerConfig.requestPath,
        createTaskEndpoint: resolved?.providerConfig.createTaskEndpoint,
        queryTaskEndpoint: resolved?.providerConfig.queryTaskEndpoint,
      },
      {
        requestPath: "/api/v3/contents/generations/tasks",
        createTaskEndpoint: "/api/v3/contents/generations/tasks",
        queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
      },
    );
  });
});

function modelConfig(
  providerConfig: Record<string, unknown>,
  mediaType = "image",
): AiModelConfigRecord {
  return {
    id: "model-config-id",
    modelCode: "image-model",
    displayName: "Image Model",
    providerName: "provider",
    providerModel: "provider-image-model",
    providerProtocol: "custom_http",
    invocationMode: "sync",
    mediaType,
    taskModes: ["image.generate"],
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
