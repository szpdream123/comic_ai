import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createDefaultTextModelCatalog,
  resolveTextModelCatalogEntry,
} from "../text-model-catalog.ts";
import { TextModelGatewayError } from "../text-model-gateway.errors.ts";

describe("text model catalog", () => {
  it("resolves an enabled model and reads its API key from env", () => {
    const entry = resolveTextModelCatalogEntry(
      [
        {
          id: "deepseek-chat",
          label: "DeepSeek Chat",
          providerName: "deepseek",
          providerModel: "deepseek-chat",
          baseURL: "https://api.deepseek.com",
          apiKeyEnv: "DEEPSEEK_API_KEY",
          enabled: true,
        },
      ],
      "deepseek-chat",
      { DEEPSEEK_API_KEY: "secret" },
    );

    assert.equal(entry.id, "deepseek-chat");
    assert.equal(entry.apiKey, "secret");
    assert.equal(entry.providerModel, "deepseek-chat");
  });

  it("strictly rejects an unknown model", () => {
    assert.throws(
      () => resolveTextModelCatalogEntry([], "missing-model", {}),
      (error) =>
        error instanceof TextModelGatewayError &&
        error.code === "model_not_configured",
    );
  });

  it("strictly rejects a disabled model", () => {
    assert.throws(
      () =>
        resolveTextModelCatalogEntry(
          [
            {
              id: "qwen-plus",
              label: "Qwen Plus",
              providerName: "qwen",
              providerModel: "qwen-plus",
              baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
              apiKeyEnv: "DASHSCOPE_API_KEY",
              enabled: false,
            },
          ],
          "qwen-plus",
          { DASHSCOPE_API_KEY: "secret" },
        ),
      (error) =>
        error instanceof TextModelGatewayError &&
        error.code === "model_disabled",
    );
  });

  it("strictly rejects a configured model whose API key is missing", () => {
    assert.throws(
      () =>
        resolveTextModelCatalogEntry(
          [
            {
              id: "qwen-plus",
              label: "Qwen Plus",
              providerName: "qwen",
              providerModel: "qwen-plus",
              baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
              apiKeyEnv: "DASHSCOPE_API_KEY",
              enabled: true,
            },
          ],
          "qwen-plus",
          {},
        ),
      (error) =>
        error instanceof TextModelGatewayError &&
        error.code === "provider_auth_missing",
    );
  });

  it("provides default DeepSeek and Qwen compatible catalog entries", () => {
    const catalog = createDefaultTextModelCatalog();

    assert.deepEqual(
      catalog.map((entry) => entry.id),
      ["deepseek-chat", "qwen-plus"],
    );
  });
});
