import assert from "node:assert/strict";
import { test } from "node:test";
import { GeoSearchAdapter } from "../geo-search.adapter.ts";

const source = "https://www.lingxiyunai.com/guides/example";
const input = { baseURL: "https://api.deepseek.com/v1", apiKey: "test-key", providerModel: "deepseek-v4-pro",
  request: { model: "configured-model", stream: true as const, messages: [{ role: "user" as const, content: "问题：AI短剧怎么制作？" }], max_tokens: 16000, response_format: { type: "json_object" } } };
function response(answer = "参考官网指南", citedUrls = [source]) {
  return { id: "response-1", status: "completed", output: [
    { type: "web_search_call", status: "completed", action: { type: "search", sources: [{ url: source }] } },
    { type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify({ answer, citedUrls }) }] },
  ], usage: { input_tokens: 30, output_tokens: 20, total_tokens: 50 } };
}
async function collect(payload: unknown, baseURL = input.baseURL) {
  const adapter = new GeoSearchAdapter({ fetcher: async () => Response.json(payload) });
  return Array.fromAsync(await adapter.createChatCompletionStream({ ...input, baseURL }));
}
test("GEO search requests real tools at the configured endpoint and retains evidence", async () => {
  const requests: Array<{ url: string; body: any }> = [];
  const adapter = new GeoSearchAdapter({ fetcher: async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return Response.json(response());
  } });
  const chunks = await Array.fromAsync(await adapter.createChatCompletionStream(input));
  assert.equal(requests[0].url, "https://api.deepseek.com/v1/responses");
  assert.deepEqual(requests[0].body.tools, [{ type: "web_search" }]);
  assert.deepEqual(requests[0].body.tool_choice, { type: "web_search" });
  assert.equal(requests[0].body.max_output_tokens, 16000);
  assert.deepEqual(requests[0].body.text, { format: { type: "json_object" } });
  assert.deepEqual(JSON.parse(chunks[0].choices[0].delta.content), { answer: "参考官网指南", citedUrls: [source] });
  assert.equal(chunks[0].usage.geoSearch.completed, true);
  assert.deepEqual(chunks[0].usage.geoSearch.sourceUrls, [source]);
});
test("GEO search never turns a response without search evidence into a negative result", async () => {
  const payload = response(); payload.output.shift();
  await assert.rejects(collect(payload), /geo_search_not_verified/);
  await assert.rejects(collect({ ...response(), status: "incomplete" }), /geo_search_incomplete/);
  const withoutSources = response("没有发现该品牌", []);
  withoutSources.output[0].action.sources = [];
  await assert.rejects(collect(withoutSources), /geo_search_not_verified/);
});
test("GEO search rejects invented citations and answer URLs absent from search sources", async () => {
  await assert.rejects(collect(response("参考指南", ["https://invented.example/article"])), /geo_search_citation_unverified/);
  await assert.rejects(collect(response("参考 https://invented.example/article", [])), /geo_search_citation_unverified/);
});
test("GEO search accepts a completed search without a matching article", async () => {
  const payload = response("没有发现该品牌", []);
  const chunks = await collect(payload);
  assert.deepEqual(JSON.parse(chunks[0].choices[0].delta.content).citedUrls, []);
});
test("GEO search accepts DeepSeek completed open_page evidence with provider tracking fragments", async () => {
  const payload = response();
  payload.output[0] = { type: "web_search_call", status: "completed",
    action: { type: "open_page", url: `${source}#ws_call_id=observed-call` } };
  const chunks = await collect(payload);
  assert.deepEqual(JSON.parse(chunks[0].choices[0].delta.content).citedUrls, [source]);
});
test("GEO search refuses insecure endpoints before sending credentials", async () => {
  let calls = 0;
  const adapter = new GeoSearchAdapter({ fetcher: async () => { calls++; return Response.json(response()); } });
  await assert.rejects(adapter.createChatCompletionStream({ ...input, baseURL: "http://proxy.example/v1" }), /geo_search_endpoint_unsupported/);
  assert.equal(calls, 0);
});
test("GEO search uses Bailian Responses tools and checks its source records", async () => {
  let request: any;
  const adapter = new GeoSearchAdapter({ fetcher: async (_url, init) => {
    request = JSON.parse(String(init?.body));
    return Response.json(response());
  } });
  const chunks = await Array.fromAsync(await adapter.createChatCompletionStream({ ...input,
    baseURL: "https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1", providerModel: "qwen3.7-max",
  }));
  assert.deepEqual(request.tools, [{ type: "web_search" }]);
  assert.equal(request.enable_thinking, true);
  assert.equal(request.tool_choice, "required");
  assert.equal(chunks[0].usage.geoSearch.completed, true);
});
test("GEO search supports configured HTTPS proxies but still requires completed search evidence", async () => {
  assert.equal((await collect(response(), "https://proxy.example/v1"))[0].usage.geoSearch.completed, true);
  const payload = response(); payload.output.shift();
  await assert.rejects(collect(payload, "https://proxy.example/v1"), /geo_search_not_verified/);
});

test("GEO search uses standard Responses fields for a configured Qwen proxy", async () => {
  let body: any;
  const adapter = new GeoSearchAdapter({ fetcher: async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return Response.json(response());
  } });
  await adapter.createChatCompletionStream({ ...input, baseURL: "https://proxy.example/v1", providerModel: "qwen3.7-max" });
  assert.equal(body.tool_choice, "required");
  assert.equal(body.enable_thinking, undefined);
});
test("GEO search accepts only verified official canonical aliases before citation analysis", async () => {
  const payload = response();
  payload.output[0] = { type: "web_search_call", status: "completed", action: { type: "open_page",
    url: "https://lingxiyunai.com/guides/example/#ws_call_id=verified" } };
  assert.deepEqual(JSON.parse((await collect(payload))[0].choices[0].delta.content).citedUrls, [source]);
});
test("GEO search bounds audit metadata independently of the provider response limit", async () => {
  const payload = response();
  payload.output[0].action.queries = ["long provider trace ".repeat(10000)];
  const proof = (await collect(payload))[0].usage.geoSearch;
  assert.ok(JSON.stringify(proof).length < 10000);
  assert.equal(proof.request, undefined);
  assert.equal(proof.searches, undefined);
});
test("GEO search bounds response memory and cancels oversized bodies", async () => {
  let canceled = false;
  const adapter = new GeoSearchAdapter({ fetcher: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(512001)); },
    cancel() { canceled = true; },
  })) });
  await assert.rejects(adapter.createChatCompletionStream(input), /geo_search_response_too_large/);
  assert.equal(canceled, true);
});
test("GEO search preserves cancellation and does not retry failed provider requests", async () => {
  const controller = new AbortController(); let calls = 0;
  const adapter = new GeoSearchAdapter({ fetcher: async (_url, init) => {
    calls++; assert.equal(init?.signal, controller.signal); assert.equal(init?.redirect, "error");
    return new Response("private-provider-error", { status: 400 });
  } });
  await assert.rejects(adapter.createChatCompletionStream({ ...input, signal: controller.signal }), /geo_search_http_400/);
  assert.equal(calls, 1);
});
