import assert from "node:assert/strict";
import { test } from "node:test";

import { createAdminModelConfigService } from "./admin-model-config.service.ts";

test("generic admin model validation accepts the ChiYuan video adapter", async () => {
  const service = createAdminModelConfigService({
    db: {
      async query<T>() {
        return { rows: [] as T[] };
      },
    },
  });

  const result = await service.validateModelDraft({
    modelCode: "chiyuan-seedance-test",
    displayName: "Seedance 驰源测试",
    providerName: "ChiYuan",
    providerModel: "doubao-seedance-2-5-260628",
    providerProtocol: "chiyuan_video",
    invocationMode: "async_polling",
    mediaType: "video",
    taskModes: ["video.text_to_video", "video.image_to_video"],
    capabilities: { input: ["prompt", "image"], output: ["video"] },
    parameterSchema: { prompt: { type: "string" } },
    defaultParams: {},
    providerConfig: {
      baseURL: "https://cy.apistudio.cc",
      requestFormat: "chiyuan_seedance_super_resolution",
      apiKeyEnv: "ChiYuan_API_KEY",
      createTaskEndpoint: "/api/v3/contents/generations/tasks",
      queryTaskEndpoint: "/api/v3/contents/generations/tasks/{task_id}",
    },
    pricing: { unit: "video", baseCredits: 1, billingMode: "fixed" },
    limits: {},
    uiConfig: {},
    status: "disabled",
    dispatchPolicy: {
      submitQueueName: "generation:video:submit",
      pollQueueName: "generation:video:poll",
    },
  });

  assert.equal(result.body.data.ok, true, JSON.stringify(result.body.data.failedItems));
});

test("generic admin model validation rejects unsafe or mismatched ChiYuan transport", async () => {
  const service = createAdminModelConfigService({
    db: {
      async query<T>() {
        return { rows: [] as T[] };
      },
    },
  });
  const base = {
    modelCode: "chiyuan-seedance-test",
    displayName: "Seedance 驰源测试",
    providerName: "ChiYuan",
    providerModel: "doubao-seedance-2-5-260628",
    providerProtocol: "chiyuan_video",
    invocationMode: "async_polling",
    mediaType: "video",
    taskModes: ["video.text_to_video"],
    capabilities: { input: ["prompt"], output: ["video"] },
    parameterSchema: { prompt: { type: "string" } },
    defaultParams: {},
    providerConfig: {
      baseURL: "https://cy.apistudio.cc",
      requestFormat: "chiyuan_seedance_super_resolution",
      apiKeyEnv: "ChiYuan_API_KEY",
      createTaskEndpoint: "/api/v3/contents/generations/tasks",
      queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
    },
    pricing: { unit: "video", baseCredits: 1, billingMode: "fixed" },
    limits: {},
    uiConfig: {},
    status: "disabled",
    dispatchPolicy: {
      submitQueueName: "generation:video:submit",
      pollQueueName: "generation:video:poll",
    },
  };

  for (const input of [
    { ...base, providerConfig: { ...base.providerConfig, baseURL: "https://attacker.example" } },
    { ...base, providerConfig: { ...base.providerConfig, apiKeyEnv: "DATABASE_URL" } },
    { ...base, providerModel: "doubao-seedance-2-0-mini-260615" },
    { ...base, providerConfig: { ...base.providerConfig, createTaskEndpoint: "/wrong" } },
  ]) {
    const result = await service.validateModelDraft(input);
    assert.equal(result.status, 200);
    assert.equal(result.body.data.ok, false);
    assert.match(JSON.stringify(result.body.data.failedItems), /驰源模型必须使用固定域名/);
  }

  const freeActive = await service.createModel({
    ...base,
    status: "active",
    pricing: { ...base.pricing, baseCredits: 0 },
    reason: "验证零积分不可启用",
    actorAdminAccountId: "admin-1",
    idempotencyKey: "chiyuan-free-active",
    now: new Date("2026-08-26T00:00:00.000Z"),
  });
  assert.equal(freeActive.status, 400);
  assert.equal(freeActive.body.error.code, "model_launch_check_failed");
});

test("generic admin model validation rejects a plaintext ChiYuan key even with the fixed reference", async () => {
  const service = createAdminModelConfigService({
    db: {
      async query<T>() {
        return { rows: [] as T[] };
      },
    },
  });

  const result = await service.validateModelDraft({
    modelCode: "chiyuan-seedance-plaintext-key",
    displayName: "Seedance 驰源明文密钥测试",
    providerName: "ChiYuan",
    providerModel: "doubao-seedance-2-0-mini-260615",
    providerProtocol: "chiyuan_video",
    invocationMode: "async_polling",
    mediaType: "video",
    taskModes: ["video.text_to_video"],
    capabilities: { input: ["prompt"], output: ["video"] },
    parameterSchema: { prompt: { type: "string" } },
    defaultParams: {},
    providerConfig: {
      baseURL: "https://cy.apistudio.cc",
      requestFormat: "chiyuan_seedance_official",
      apiKeyEnv: "ChiYuan_API_KEY",
      apiKey: "must-not-be-persisted",
      createTaskEndpoint: "/api/v3/contents/generations/tasks",
      queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
    },
    pricing: { unit: "video", baseCredits: 1, billingMode: "fixed" },
    limits: {},
    uiConfig: {},
    status: "disabled",
    dispatchPolicy: {
      submitQueueName: "generation:video:submit",
      pollQueueName: "generation:video:poll",
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.data.ok, false);
  assert.match(JSON.stringify(result.body.data.failedItems), /驰源模型必须使用固定域名/);
});
