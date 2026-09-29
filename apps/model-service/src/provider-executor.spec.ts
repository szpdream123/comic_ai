import assert from "node:assert/strict";
import { test } from "node:test";
import { createProviderExecutor } from "./provider-executor.ts";
import type { ModelConfig } from "./contracts.ts";

function model(protocol = "openai_compatible_chat", mediaType = "text"): ModelConfig {
  return {
    id: "model-1", modelCode: "public-model", displayName: "Model", providerName: "existing-provider",
    providerModel: "supplier-model", providerProtocol: protocol, invocationMode: "sync", mediaType,
    taskModes: [], capabilities: {}, parameterSchema: {}, defaultParams: {}, pricing: {}, limits: {}, uiConfig: {},
    status: "enabled", sortOrder: 0, remark: null,
    providerConfig: { apiKeyEnv: "SUPPLIER_KEY", baseURL: "https://supplier.example/v1",
      createTaskEndpoint: "https://supplier.example/create", queryTaskEndpoint: "https://supplier.example/tasks/{taskId}" },
  };
}
const env = { SUPPLIER_KEY: "offline-secret" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
function sse(chunks: unknown[]) {
  return new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n", {
    headers: { "content-type": "text/event-stream" },
  });
}

test("truncated and filtered text are terminal failures with usage, never successful tool output", async () => {
  for (const protocol of ["openai_compatible_chat", "cumob_chat"]) {
    for (const finishReason of ["length", "content_filter"]) {
      let calls = 0;
      const executor = createProviderExecutor({ env, fetchImpl: async () => {
        calls++;
        return sse([
          { id: "r", choices: [{ index: 0, delta: { content: '{"answer":', tool_calls: [
            { index: 0, id: "c", type: "function", function: { name: "lookup", arguments: '{"query":' } },
          ] }, finish_reason: finishReason }] },
          { choices: [], usage: { total_tokens: 10 } },
        ]);
      } });
      const result = await executor.submit(model(protocol), "text", { messages: [{ role: "user", content: "hello" }] }, "r");
      assert.equal(result.status, "failed");
      assert.equal(result.error, finishReason === "length" ? "provider_output_incomplete" : "provider_content_filtered");
      assert.deepEqual(result.result, { usage: { total_tokens: 10 } });
      assert.equal(result.externalId, "r"); assert.equal(calls, 1);
    }
  }
});

test("malformed tool arguments and requested structured output fail without exposing partial results", async () => {
  for (const kind of ["tool", "json"]) {
    const executor = createProviderExecutor({ env, fetchImpl: async () => sse([
      { choices: [{ index: 0, delta: kind === "tool" ? { tool_calls: [
        { index: 0, id: "c", type: "function", function: { name: "lookup", arguments: '{"query":' } },
      ] } : { content: '{"answer":' }, finish_reason: kind === "tool" ? "tool_calls" : "stop" }], usage: { total_tokens: 7 } },
    ]) });
    const result = await executor.submit(model(), "text", { messages: [{ role: "user", content: "hello" }],
      ...(kind === "json" ? { response_format: { type: "json_object" } } : {}) }, "r");
    assert.equal(result.status, "failed"); assert.equal(result.error, "provider_output_invalid");
    assert.deepEqual(result.result, { usage: { total_tokens: 7 } });
  }
});

test("supports only reused protocols and never pretends speech is transcription", () => {
  const executor = createProviderExecutor({ env, fetchImpl: async () => { throw new Error("unexpected network"); } });
  assert.equal(executor.supports(model(), "text"), true);
  assert.equal(executor.supports(model("cumob_chat"), "text"), true);
  assert.equal(executor.supports(model("globalaiopc_video", "video"), "video"), true);
  assert.equal(executor.supports(model("aliyun_bailian_audio", "audio"), "speech"), true);
  assert.equal(executor.supports(model("aliyun_bailian_audio", "audio"), "transcription"), false);
  assert.equal(executor.supports(model("modelflare_responses"), "text"), false);
  assert.equal(executor.supports(model("other_video", "video"), "video"), false);
  assert.equal(executor.supports(model("globalaiopc_video", "text"), "video"), false);
});

test("OpenAI multimodal/tool requests retain exact fields and aggregate split tool calls with safe usage", async () => {
  const payload = {
    messages: [{ role: "user", content: [{ type: "text", text: "Describe" },
      { type: "image_url", image_url: { url: "https://media.example/image.png" } },
      { type: "video_url", video_url: { url: "https://media.example/video.mp4" } },
      { type: "input_audio", input_audio: { data: "AAAA", format: "wav" } }] }],
    tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object" } } }],
    tool_choice: "required", response_format: { type: "json_object" }, temperature: 0.2, max_tokens: 200,
  };
  const executor = createProviderExecutor({ env, fetchImpl: async (url, init) => {
    assert.equal(String(url), "https://supplier.example/v1/chat/completions");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer offline-secret");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    const body = JSON.parse(String(init?.body));
    for (const key of Object.keys(payload)) assert.deepEqual(body[key], payload[key as keyof typeof payload]);
    assert.equal(body.model, "supplier-model");
    assert.deepEqual(body.stream_options, { include_usage: true });
    return sse([
      { id: "chat-1", choices: [{ index: 0, delta: { content: "Hi", tool_calls: [{ index: 0, id: "call-1", type: "function", function: { name: "lookup", arguments: "{\"q\":" } }] } }] },
      { id: "chat-1", choices: [{ index: 0, delta: { content: "!", tool_calls: [{ index: 0, function: { arguments: "\"test\"}" } }] }, finish_reason: "tool_calls" }] },
      { id: "chat-1", choices: [], usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10, secret: "never", diagnostic: 999, input_tokens: "7" } },
    ]);
  } });
  assert.deepEqual(await executor.submit(model(), "text", payload, "request-1"), {
    status: "succeeded", externalId: "chat-1", result: { content: "Hi!", toolCalls: [
      { id: "call-1", type: "function", function: { name: "lookup", arguments: "{\"q\":\"test\"}" } },
    ], usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 } },
  });
});

test("Cumob reuses provider contract and merges model defaults without leaking request config", async () => {
  const config = model("cumob_chat");
  config.defaultParams = { temperature: 0.1, max_tokens: 40 };
  const executor = createProviderExecutor({ env, fetchImpl: async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.temperature, 0.1);
    assert.equal(body.max_tokens, undefined); // Existing Cumob adapter intentionally removes it.
    assert.equal(body.baseURL, undefined);
    return json({ id: "cumob-1", choices: [{ index: 0, message: { content: "ready" }, finish_reason: "stop" }], usage: { total_tokens: 4 } });
  } });
  const result = await executor.submit(config, "text", { messages: [{ role: "user", content: "hello" }], baseURL: "http://127.0.0.1" }, "request-1");
  assert.equal(result.result.content, "ready");
  assert.deepEqual(result.result.usage, { total_tokens: 4 });
});

test("ambiguous submission errors are safe and OpenAI never retries POST", async () => {
  for (const response of [() => json({ error: { message: "secret diagnostics" } }, 500), () => { throw new Error("secret transport"); }]) {
    let calls = 0;
    const executor = createProviderExecutor({ env, fetchImpl: async () => { calls++; return response(); } });
    await assert.rejects(executor.submit(model(), "text", { messages: [{ role: "user", content: "hello" }] }, "r"), { message: "provider_result_unknown" });
    assert.equal(calls, 1);
  }
});

test("explicit supplier rejection contains no response diagnostics", async () => {
  let calls = 0;
  const executor = createProviderExecutor({ env, fetchImpl: async () => { calls++; return json({ error: { message: "offline-secret token=123" } }, 401); } });
  assert.deepEqual(await executor.submit(model(), "text", { messages: [{ role: "user", content: "hello" }] }, "r"), {
    status: "failed", result: { usage: null }, error: "provider_authentication_failed",
  });
  assert.equal(calls, 1);
});

test("credential rotation preserves pinned model and endpoint", async () => {
  const executor = createProviderExecutor({ env: {}, resolveCredentials: async (snapshot) => ({
    ...snapshot, providerModel: "changed-model", providerConfig: { baseURL: "https://changed.example", apiKey: "rotated-secret" },
  }), fetchImpl: async (url, init) => {
    assert.equal(String(url), "https://supplier.example/v1/chat/completions");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer rotated-secret");
    assert.equal(JSON.parse(String(init?.body)).model, "supplier-model");
    return sse([{ choices: [{ index: 0, delta: { content: "ok" }, finish_reason: "stop" }] }]);
  } });
  assert.equal((await executor.submit(model(), "text", { messages: [{ role: "user", content: "hello" }] }, "r")).status, "succeeded");
});

test("video submits once and polls task with escaped external ID and reduced result", async () => {
  const config = model("globalaiopc_video", "video");
  const executor = createProviderExecutor({ env, fetchImpl: async (url, init) => {
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    if (init?.method === "POST") {
      assert.equal(String(url), "https://supplier.example/create");
      assert.deepEqual(JSON.parse(String(init.body)), { model: "supplier-model", prompt: "move", reference_images: ["https://media.example/ref.png"], duration: 5, watermark: false });
      return json({ task_id: "task/a", status: "queued", secret: "must disappear" });
    }
    assert.equal(String(url), "https://supplier.example/tasks/task%2Fa");
    return json({ status: "completed", result_url: "https://media.example/out.mp4", debug: "secret" });
  } });
  const payload = { prompt: "move", referenceImages: ["https://media.example/ref.png"], parameters: { durationSec: 5 } };
  assert.deepEqual(await executor.submit(config, "video", payload, "r"), { status: "running", externalId: "task/a", result: { usage: null } });
  assert.deepEqual(await executor.poll(config, "video", payload, "task/a", "r"), {
    status: "succeeded", externalId: "task/a", result: { videoUrl: "https://media.example/out.mp4", usage: null },
  });
});

test("video polling authentication failure remains unknown without relying on volatile retry counters", async () => {
  const executor = createProviderExecutor({ env, fetchImpl: async () => json({ message: "secret" }, 401) });
  await assert.rejects(executor.poll(model("globalaiopc_video", "video"), "video", {}, "task", "r"), { message: "provider_poll_unavailable" });
});

test("speech uses existing voice contract and returns audio URL plus numeric character usage", async () => {
  const executor = createProviderExecutor({ env, fetchImpl: async (_url, init) => {
    assert.equal(init?.redirect, "error");
    assert.deepEqual(JSON.parse(String(init?.body)), { model: "supplier-model", input: { text: "你好", voice: "longxiaochun", format: "mp3" } });
    return json({ request_id: "speech-1", output: { audio: { url: "https://media.example/audio.mp3" } }, usage: { characters: 2 }, message: "diagnostics" });
  } });
  assert.deepEqual(await executor.submit(model("aliyun_bailian_audio", "audio"), "speech", { text: "你好", parameters: { voice: "longxiaochun" } }, "r"), {
    status: "succeeded", externalId: "speech-1", result: { audioUrl: "https://media.example/audio.mp3", usage: { characters: 2 } },
  });
});

test("unsupported operation and missing config do not send network requests", async () => {
  const executor = createProviderExecutor({ env: {}, fetchImpl: async () => { throw new Error("unexpected network"); } });
  assert.equal((await executor.submit(model(), "transcription", {}, "r")).error, "unsupported_operation");
  assert.equal((await executor.submit(model(), "text", { messages: [] }, "r")).error, "provider_configuration_invalid");
  assert.equal((await executor.poll(model(), "text", {}, "task", "r")).error, "unsupported_poll_operation");
});

test("incomplete text stream does not declare a partial answer successful", async () => {
  const executor = createProviderExecutor({ env, fetchImpl: async () => sse([{ choices: [{ index: 0, delta: { content: "partial" } }] }]) });
  await assert.rejects(executor.submit(model(), "text", { messages: [{ role: "user", content: "hello" }] }, "r"), { message: "provider_result_unknown" });
});

test("poll credential/config failures cannot mark an accepted generation failed", async () => {
  const executor = createProviderExecutor({ env: {}, fetchImpl: async () => { throw new Error("unexpected network"); } });
  await assert.rejects(executor.poll(model("globalaiopc_video", "video"), "video", {}, "task", "r"), { message: "provider_poll_unavailable" });
});

test("only explicit terminal video status fails; malformed response and missing output keep polling", async () => {
  for (const response of [{ message: "bad response" }, { status: "succeeded" }, { status: "succeeded", result_url: "javascript:secret" }]) {
    const executor = createProviderExecutor({ env, fetchImpl: async () => json(response) });
    await assert.rejects(executor.poll(model("globalaiopc_video", "video"), "video", {}, "task", "r"), { message: "provider_poll_unavailable" });
  }
  const executor = createProviderExecutor({ env, fetchImpl: async () => json({ status: "failed", message: "secret supplier details" }) });
  assert.deepEqual(await executor.poll(model("globalaiopc_video", "video"), "video", {}, "task", "r"), {
    status: "failed", result: { usage: null }, error: "provider_generation_failed",
  });
});

test("Cumob supplier diagnostics are stripped for both HTTP and streaming errors", async () => {
  for (const response of [
    () => json({ error: { message: "secret provider detail" } }, 500),
    () => sse([{ error: { code: "supplier_failure", message: "secret provider detail" } }]),
  ]) {
    let calls = 0;
    const executor = createProviderExecutor({ env, fetchImpl: async () => { calls++; return response(); } });
    await assert.rejects(executor.submit(model("cumob_chat"), "text", { messages: [{ role: "user", content: "hello" }] }, "r"), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "provider_result_unknown");
      assert.equal(Object.keys(error).length, 0);
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test("video and speech ambiguous submission outcomes are never retried", async () => {
  for (const operation of ["video", "speech"] as const) {
    let calls = 0;
    const executor = createProviderExecutor({ env, fetchImpl: async () => { calls++; throw new Error("secret transport"); } });
    const config = operation === "video" ? model("globalaiopc_video", "video") : model("aliyun_bailian_audio", "audio");
    await assert.rejects(executor.submit(config, operation, { text: "hello", prompt: "hello", parameters: { voice: "longxiaochun" } }, "r"), { message: "provider_result_unknown" });
    assert.equal(calls, 1);
  }
});

test("server endpoint configuration is required and payload cannot replace it", async () => {
  let calls = 0;
  const executor = createProviderExecutor({ env, fetchImpl: async () => { calls++; throw new Error("unexpected network"); } });
  const config = model();
  delete config.providerConfig.baseURL;
  const result = await executor.submit(config, "text", { messages: [{ role: "user", content: "hello" }], baseURL: "https://caller.example" }, "r");
  assert.equal(result.error, "provider_configuration_invalid");
  assert.equal(calls, 0);
});
