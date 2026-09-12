import type { OpenAICompatibleTextAdapter, TextGatewayChatCompletionChunk } from "../model-gateway/openai-compatible-text.adapter.ts";

const maxSearchResponseBytes = 512_000;
const maxAuditSourceChars = 8_000;

function searchError(code: string) {
  return Object.assign(new Error(code), { code });
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function sourceKey(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) return "";
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return "";
    if (url.protocol === "https:" && !url.port
      && ["lingxiyunai.com", "www.lingxiyunai.com"].includes(url.hostname)) {
      url.hostname = "www.lingxiyunai.com";
      url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
    }
    url.hash = "";
    return url.href;
  } catch { return ""; }
}

export class GeoSearchAdapter {
  constructor(private readonly config: { fetcher?: typeof fetch } = {}) {}

  async createChatCompletionStream(input: Parameters<OpenAICompatibleTextAdapter["createChatCompletionStream"]>[0]): Promise<AsyncIterable<TextGatewayChatCompletionChunk>> {
    const endpoint = new URL(input.baseURL);
    const bailian = endpoint.hostname === "dashscope.aliyuncs.com"
      || /^dashscope-intl\.(?:aliyuncs\.com)$/.test(endpoint.hostname)
      || endpoint.hostname.endsWith(".maas.aliyuncs.com");
    const deepseek = endpoint.hostname === "api.deepseek.com" || (!bailian && input.providerModel.startsWith("deepseek-"));
    // The endpoint comes from the existing admin model resolver, never model output.
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      throw searchError("geo_search_endpoint_unsupported");
    }
    const path = endpoint.pathname.replace(/\/+$/u, "");
    endpoint.pathname = path.endsWith("/responses") ? path : `${path}/responses`;
    const request = {
      model: input.providerModel,
      input: input.request.messages,
      tools: [{ type: "web_search" }],
      ...(deepseek ? { tool_choice: { type: "web_search" } } : { tool_choice: "required" }),
      ...(bailian ? { enable_thinking: true } : {}),
      ...(deepseek && input.request.response_format ? { text: { format: input.request.response_format } } : {}),
      max_output_tokens: input.request.max_tokens,
      stream: false,
      store: false,
    };
    const response = await (this.config.fetcher ?? fetch)(endpoint, {
      method: "POST", redirect: "error",
      headers: { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(request), signal: input.signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw searchError(`geo_search_http_${response.status}`);
    }
    if (!response.body) throw searchError("geo_search_empty_response");
    const reader = response.body.getReader();
    const buffers: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > maxSearchResponseBytes) throw searchError("geo_search_response_too_large");
        buffers.push(next.value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    let payload: Record<string, any>;
    try { payload = record(JSON.parse(Buffer.concat(buffers).toString("utf8"))); }
    catch { throw searchError("geo_search_invalid_response"); }
    if (payload.status !== "completed" || payload.error || !Array.isArray(payload.output)) {
      throw searchError("geo_search_incomplete");
    }
    const searches = payload.output.filter((item: unknown) => {
      const row = record(item);
      return row.type === "web_search_call" && row.status === "completed";
    });
    if (!searches.length) throw searchError("geo_search_not_verified");
    const sourceUrls = [...new Set<string>(searches.flatMap((item: any) => {
      const action = record(item.action);
      const sources = action.sources;
      const openedUrl = ["open_page", "find_in_page"].includes(action.type) ? sourceKey(action.url) : "";
      return [
        ...(Array.isArray(sources) ? sources.map((source) => sourceKey(record(source).url)) : []),
        openedUrl,
      ].filter(Boolean);
    }))];
    if (!sourceUrls.length) throw searchError("geo_search_not_verified");
    const raw = payload.output.filter((item: any) => record(item).type === "message" && item.role === "assistant")
      .flatMap((item: any) => Array.isArray(item.content) ? item.content : [])
      .filter((part: any) => record(part).type === "output_text" && typeof part.text === "string")
      .map((part: any) => part.text).join("");
    let answer: Record<string, any>;
    try { answer = record(JSON.parse(raw)); }
    catch { throw searchError("geo_search_invalid_answer"); }
    if (typeof answer.answer !== "string" || !answer.answer.trim() || answer.answer.length > 20000
      || !Array.isArray(answer.citedUrls) || answer.citedUrls.length > 20) throw searchError("geo_search_invalid_answer");
    // A model-written citation is evidence only when present in the provider's actual search sources.
    const urlsInAnswer = (answer.answer.match(/https?:\/\/[^\s<>"'，。；、]+/giu) ?? [])
      .map((url: string) => url.replace(/[),.!?;:，。；：！？）]+$/u, ""));
    const sourceUrlSet = new Set(sourceUrls);
    if ([...answer.citedUrls, ...urlsInAnswer].some((url) => {
      const key = sourceKey(url);
      return !key || !sourceUrlSet.has(key);
    })) {
      throw searchError("geo_search_citation_unverified");
    }
    const usage = record(payload.usage);
    let auditSourceChars = 0;
    const auditSourceUrls = sourceUrls.filter((url) => {
      auditSourceChars += url.length;
      return auditSourceChars <= maxAuditSourceChars;
    });
    const chunk = {
      id: String(payload.id ?? "geo-search"), object: "chat.completion.chunk" as const,
      created: Math.floor(Date.now() / 1000), model: input.providerModel,
      choices: [{ index: 0, delta: { content: JSON.stringify({ answer: answer.answer, citedUrls: answer.citedUrls }) }, finish_reason: "stop" as const }],
      usage: {
        prompt_tokens: Number(usage.input_tokens ?? 0), completion_tokens: Number(usage.output_tokens ?? 0),
        total_tokens: Number(usage.total_tokens ?? 0),
        completion_tokens_details: { reasoning_tokens: Number(record(usage.output_tokens_details).reasoning_tokens ?? 0) },
        // Stored by the existing provider audit trail; no credentials are included.
        geoSearch: { completed: true, sourceUrls: auditSourceUrls, sourceCount: sourceUrls.length, searchCount: searches.length },
      },
    };
    return (async function* () { yield chunk; })();
  }
}
