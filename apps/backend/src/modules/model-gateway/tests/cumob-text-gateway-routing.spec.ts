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

  it("removes signed video URLs from persistent audit requests", () => {
    const request = {
      model: "video-capable-model",
      messages: [{
        role: "user" as const,
        content: [{
          type: "video_url" as const,
          video_url: { url: "https://storage.example.test/reference.mp4?signature=secret" },
        }],
      }],
      stream: true as const,
    };

    const redacted = __textModelGatewayTestUtils.redactTextGatewayVideoUrls(request);

    assert.equal(
      JSON.stringify(redacted).includes("signature=secret"),
      false,
    );
    assert.match(JSON.stringify(redacted), /\[signed video URL omitted\]/);
    assert.equal(
      request.messages[0]?.content[0]?.video_url.url,
      "https://storage.example.test/reference.mp4?signature=secret",
    );
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
