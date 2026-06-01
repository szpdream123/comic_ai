import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { OpenAICompatibleTextAdapter } from "../openai-compatible-text.adapter.ts";

describe("openai compatible text adapter", () => {
  it("creates an OpenAI-compatible streaming chat completion with provider model", async () => {
    let capturedConfig: unknown;
    let capturedRequest: unknown;
    let capturedSignal: AbortSignal | undefined;
    const abortController = new AbortController();

    const adapter = new OpenAICompatibleTextAdapter({
      clientFactory: (config) => {
        capturedConfig = config;
        return {
          chat: {
            completions: {
              create: async (request, options) => {
                capturedRequest = request;
                capturedSignal = options?.signal;
                return streamFrom([
                  {
                    id: "chatcmpl-test",
                    object: "chat.completion.chunk",
                    created: 1716026400,
                    model: "deepseek-chat",
                    choices: [
                      {
                        index: 0,
                        delta: { content: "hello" },
                        finish_reason: null,
                      },
                    ],
                  },
                ]);
              },
            },
          },
        };
      },
    });

    const stream = await adapter.createChatCompletionStream({
      baseURL: "https://api.deepseek.com",
      apiKey: "secret",
      providerModel: "deepseek-chat",
      signal: abortController.signal,
      request: {
        model: "catalog-id",
        messages: [{ role: "user", content: "Say hi" }],
        stream: true,
      },
    });

    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    assert.deepEqual(capturedConfig, {
      baseURL: "https://api.deepseek.com",
      apiKey: "secret",
    });
    assert.deepEqual(capturedRequest, {
      model: "deepseek-chat",
      messages: [{ role: "user", content: "Say hi" }],
      stream: true,
      stream_options: { include_usage: true },
    });
    assert.equal(capturedSignal, abortController.signal);
    assert.equal(chunks[0]?.choices?.[0]?.delta?.content, "hello");
  });
});

async function* streamFrom(chunks: unknown[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}
