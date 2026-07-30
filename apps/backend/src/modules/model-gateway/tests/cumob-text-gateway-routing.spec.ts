import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { __textModelGatewayTestUtils } from "../text-model-gateway.service.ts";

describe("Cumob text gateway routing", () => {
  it("routes cumob_chat models only through the dedicated Cumob adapter", () => {
    const genericAdapter = { createChatCompletionStream: async () => emptyStream() };
    const cumobAdapter = { createChatCompletionStream: async () => emptyStream() };

    assert.equal(__textModelGatewayTestUtils.selectTextCompletionAdapter({
      adapter: genericAdapter,
      cumobAdapter,
    }, "cumob_chat"), cumobAdapter);
    assert.equal(__textModelGatewayTestUtils.selectTextCompletionAdapter({
      adapter: genericAdapter,
      cumobAdapter,
    }, "openai_compatible_chat"), genericAdapter);
  });

  it("omits max_tokens only for cumob_chat provider requests", () => {
    const request = {
      model: "local-model",
      messages: [{ role: "user" as const, content: "write a script" }],
      max_tokens: 8192,
      stream: true,
    };

    const cumobRequest = __textModelGatewayTestUtils.prepareProviderChatCompletionRequest(
      request,
      "gpt-5.6-sol",
      "cumob_chat",
    );
    const genericRequest = __textModelGatewayTestUtils.prepareProviderChatCompletionRequest(
      request,
      "deepseek-chat",
      "openai_compatible_chat",
    );

    assert.equal(cumobRequest.max_tokens, undefined);
    assert.equal(genericRequest.max_tokens, 8192);
  });
});

async function* emptyStream() {
  // The routing test only needs adapter identity.
}
