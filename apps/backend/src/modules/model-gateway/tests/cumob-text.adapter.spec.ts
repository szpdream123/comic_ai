import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CumobTextAdapter } from "../cumob-text.adapter.ts";

describe("Cumob text adapter", () => {
  it("sends the provider model to the dedicated Cumob endpoint and parses SSE chunks", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const adapter = new CumobTextAdapter({
      fetcher: async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return new Response(sseBody([
          'data: {"id":"chatcmpl-cumob","object":"chat.completion.chunk","created":1,"model":"gpt-5.6-sol","choices":[{"index":0,"delta":{"content":"你"},"finish_reason":null}]}\n\n',
          'data: {"id":"chatcmpl-cumob","object":"chat.completion.chunk","created":1,"model":"gpt-5.6-sol","choices":[{"index":0,"delta":{"content":"好"},"finish_reason":"stop"}]}\n\n',
          "data: [DONE]\n\n",
        ]), { headers: { "content-type": "text/event-stream" } });
      },
    });

    const stream = await adapter.createChatCompletionStream({
      baseURL: "https://api.cumob.com",
      apiKey: "secret",
      providerModel: "gpt-5.6-sol",
      request: {
        model: "cumob-gpt-5-6-sol",
        messages: [{ role: "user", content: "你好" }],
        max_tokens: 8192,
        stream: true,
      },
    });
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);

    assert.equal(capturedUrl, "https://api.cumob.com/v1/chat/completions");
    assert.equal(new Headers(capturedInit?.headers).get("authorization"), "Bearer secret");
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
      model: "gpt-5.6-sol",
      messages: [{ role: "user", content: "你好" }],
      stream: true,
      stream_options: { include_usage: true },
    });
    assert.equal(chunks.map((chunk) => chunk.choices[0]?.delta?.content).join(""), "你好");
  });

  it("maps a non-stream JSON response to the gateway chunk contract", async () => {
    const adapter = new CumobTextAdapter({
      fetcher: async () => new Response(JSON.stringify({
        id: "chatcmpl-json",
        object: "chat.completion",
        created: 1,
        model: "deepseek-v4-pro",
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }), { headers: { "content-type": "application/json" } }),
    });

    const stream = await adapter.createChatCompletionStream({
      baseURL: "https://api.cumob.com/v1",
      apiKey: "secret",
      providerModel: "deepseek-v4-pro",
      request: { model: "local", messages: [{ role: "user", content: "go" }], stream: true },
    });
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    assert.equal(chunks[0]?.choices[0]?.delta?.content, "ok");
  });

  it("returns a stable provider failure code without exposing the response body", async () => {
    const adapter = new CumobTextAdapter({
      fetcher: async () => new Response('{"error":{"message":"secret provider detail"}}', { status: 401 }),
    });
    await assert.rejects(
      adapter.createChatCompletionStream({
        baseURL: "https://api.cumob.com",
        apiKey: "secret",
        providerModel: "claude-opus-4.8",
        request: { model: "local", messages: [{ role: "user", content: "go" }], stream: true },
      }),
      (error) => error instanceof Error
        && error.message === "cumob_text_401"
        && !error.message.includes("secret provider detail"),
    );
  });

  it("retains a safe Cumob SSE error code without exposing the provider message", async () => {
    const adapter = new CumobTextAdapter({
      fetcher: async () => new Response(sseBody([
        'data: {"error":{"code":"context_length_exceeded","status":400,"message":"secret provider detail"}}\n\n',
      ]), { headers: { "content-type": "text/event-stream" } }),
    });
    const stream = await adapter.createChatCompletionStream({
      baseURL: "https://api.cumob.com",
      apiKey: "secret",
      providerModel: "gpt-5.6-sol",
      request: { model: "local", messages: [{ role: "user", content: "go" }], stream: true },
    });

    await assert.rejects(
      async () => {
        for await (const _chunk of stream) {
          // consume stream
        }
      },
      (error) => error instanceof Error
        && error.message === "context_length_exceeded"
        && (error as Error & { providerErrorCode?: string }).providerErrorCode === "context_length_exceeded"
        && (error as Error & { status?: number }).status === 400
        && !JSON.stringify(error).includes("secret provider detail"),
    );
  });
});

function sseBody(parts: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
}
