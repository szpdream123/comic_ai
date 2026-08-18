import { lookup } from "node:dns/promises";
import net from "node:net";
import { Agent, buildConnector } from "undici";

import type { CanvasAgentActor } from "./canvas-agent.types.ts";
import { CanvasAgentExternalToolBoundary, CanvasAgentKnowledgeService } from "./canvas-agent-knowledge.service.ts";
import { findActiveAiModelConfigByCode, type AiModelConfigRecord } from "../model-catalog/ai-model-config.store.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";

const maxResponseBytes = 2 * 1024 * 1024;
const maxRedirects = 3;
const canvasAgentWebSearchTaskMode = "text.canvas_agent_web_search";

export class CanvasAgentWebToolService {
  private readonly boundary: CanvasAgentExternalToolBoundary;
  private readonly knowledge: CanvasAgentKnowledgeService;

  constructor(
    private readonly db: SqlDatabase,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
    private readonly lookupImpl: typeof lookup = lookup,
    private readonly options: { searchModelCode?: string | null } = {},
  ) {
    this.boundary = new CanvasAgentExternalToolBoundary(db);
    this.knowledge = new CanvasAgentKnowledgeService(db);
  }

  async extract(input: {
    providerId: string;
    url: string;
    query?: string | null;
    canvasId: string;
    conversationId: string;
    actor: CanvasAgentActor;
    taskId?: string | null;
    stepId?: string | null;
  }) {
    const initialUrl = normalizeWebUrl(input.url);
    await this.boundary.authorize({
      kind: "web",
      targetId: input.providerId,
      domain: initialUrl.hostname,
    });
    const response = await this.fetchAllowed(initialUrl, input.providerId);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > maxResponseBytes) throw new Error("canvas_agent_web_response_too_large");
    const raw = new TextDecoder().decode(bytes);
    const text = contentType.includes("html") ? stripHtml(raw) : raw.replace(/\s+/g, " ").trim();
    const excerpt = selectExcerpt(text, input.query);
    if (!excerpt) throw new Error("canvas_agent_web_content_empty");
    const title = contentType.includes("html") ? extractTitle(raw) || initialUrl.hostname : initialUrl.hostname;
    const citation = await this.knowledge.createCitation({
      canvasId: input.canvasId,
      conversationId: input.conversationId,
      actor: input.actor,
      taskId: input.taskId,
      stepId: input.stepId,
      sourceType: "web",
      sourceKey: initialUrl.toString(),
      title,
      canonicalUrl: initialUrl.toString(),
      excerpt,
      metadata: { providerId: input.providerId, contentType },
      now: this.now(),
    });
    return { title, canonicalUrl: initialUrl.toString(), content: excerpt, untrusted: true, citation };
  }

  async search(input: {
    query: string;
    limit?: number;
    canvasId: string;
    conversationId: string;
    actor: CanvasAgentActor;
    taskId?: string | null;
    stepId?: string | null;
  }) {
    const query = String(input.query ?? "").trim();
    if (!query || query.length > 500) throw new Error("canvas_agent_web_search_query_invalid");
    const provider = await this.resolveSearchProvider();
    const endpoint = resolveSearchEndpoint(provider.model.providerConfig);
    await this.boundary.authorize({
      kind: "web",
      targetId: provider.model.modelCode,
      domain: endpoint.hostname,
    });
    const limit = Math.min(10, Math.max(1, Math.trunc(input.limit ?? 5)));
    const request = createSearchProviderRequest(provider, endpoint, query, limit);
    const response = await this.fetchSearchProvider(request, provider.model.modelCode);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > maxResponseBytes) throw new Error("canvas_agent_web_response_too_large");
    if (!contentType.includes("json")) throw new Error("canvas_agent_web_search_response_invalid");
    const raw = new TextDecoder().decode(bytes);
    const results = parseJsonSearchResults(raw, limit);
    if (!results.length) throw new Error("canvas_agent_web_search_empty");
    const providerRequestId = readProviderRequestId(response);
    const citedResults = [];
    for (const result of results) {
      const citation = await this.knowledge.createCitation({
        canvasId: input.canvasId,
        conversationId: input.conversationId,
        actor: input.actor,
        taskId: input.taskId,
        stepId: input.stepId,
        sourceType: "web",
        sourceKey: result.url,
        title: result.title,
        canonicalUrl: result.url,
        excerpt: result.snippet,
        metadata: {
          providerId: provider.model.modelCode,
          providerName: provider.model.providerName,
          providerAdapter: provider.adapter,
          modelConfigId: provider.model.id,
          providerRequestId,
          query,
          resultRank: citedResults.length + 1,
        },
        now: this.now(),
      });
      citedResults.push({ ...result, untrusted: true, citation });
    }
    return {
      providerId: provider.model.modelCode,
      providerName: provider.model.providerName,
      providerAdapter: provider.adapter,
      modelConfigId: provider.model.id,
      providerRequestId,
      query,
      results: citedResults,
    };
  }

  private async resolveSearchProvider() {
    const modelCode = readString(this.options.searchModelCode);
    if (!modelCode) throw new Error("canvas_agent_web_search_provider_not_configured");
    const model = await findActiveAiModelConfigByCode(this.db, modelCode);
    if (!model || model.mediaType !== "text" || model.invocationMode !== "sync"
      || !model.taskModes.includes(canvasAgentWebSearchTaskMode)) {
      throw new Error("canvas_agent_web_search_provider_not_configured");
    }
    const adapter = resolveSearchProviderAdapter(model);
    if (!readString(model.providerConfig.apiKey)) {
      throw new Error("canvas_agent_web_search_provider_auth_missing");
    }
    return { model, adapter };
  }

  private async fetchSearchProvider(request: { url: URL; init: RequestInit }, providerId: string) {
    const resolvedAddress = await resolvePublicHostname(request.url.hostname, this.lookupImpl);
    await this.boundary.authorize({ kind: "web", targetId: providerId, domain: request.url.hostname });
    let response: Response;
    try {
      response = await fetchResolvedPublicUrl(request.url, {
        ...request.init,
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      }, resolvedAddress, this.fetchImpl);
    } catch (error) {
      if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) {
        throw new Error("canvas_agent_web_search_provider_timeout");
      }
      throw new Error("canvas_agent_web_search_provider_unavailable");
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("canvas_agent_web_search_provider_redirect_invalid");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw mapSearchProviderHttpError(response.status);
    }
    return response;
  }

  private async fetchAllowed(initialUrl: URL, providerId: string) {
    let current = initialUrl;
    for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
      const resolvedAddress = await resolvePublicHostname(current.hostname, this.lookupImpl);
      await this.boundary.authorize({ kind: "web", targetId: providerId, domain: current.hostname });
      const response = await fetchResolvedPublicUrl(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
        headers: { accept: "text/html, text/plain, application/json;q=0.8" },
      }, resolvedAddress, this.fetchImpl);
      if (![301, 302, 303, 307, 308].includes(response.status)) {
        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined);
          throw new Error(`canvas_agent_web_http_${response.status}`);
        }
        return response;
      }
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location || redirect === maxRedirects) throw new Error("canvas_agent_web_redirect_invalid");
      current = new URL(location, current);
      normalizeWebUrl(current.toString());
    }
    throw new Error("canvas_agent_web_redirect_invalid");
  }
}

function normalizeWebUrl(value: string) {
  let url: URL;
  try { url = new URL(String(value ?? "").trim()); } catch { throw new Error("canvas_agent_web_url_invalid"); }
  if (!(["https:", "http:"].includes(url.protocol)) || url.username || url.password) {
    throw new Error("canvas_agent_web_url_invalid");
  }
  url.hash = "";
  return url;
}

type SearchProviderAdapter = "tavily" | "bing" | "generic_json";

function resolveSearchProviderAdapter(model: AiModelConfigRecord): SearchProviderAdapter {
  const configured = normalizeAdapterName(model.providerConfig.searchProvider ?? model.providerConfig.adapter);
  const providerName = normalizeAdapterName(model.providerName);
  const adapter = configured || providerName;
  if (adapter === "tavily") return "tavily";
  if (["bing", "microsoft_bing", "azure_bing"].includes(adapter)) return "bing";
  if (["generic", "generic_json", "custom_json"].includes(adapter)) return "generic_json";
  throw new Error("canvas_agent_web_search_provider_unsupported");
}

function resolveSearchEndpoint(providerConfig: Record<string, unknown>) {
  const baseURL = readString(providerConfig.baseURL);
  const endpoint = readString(providerConfig.endpoint ?? providerConfig.requestPath);
  let url: URL;
  try {
    url = endpoint
      ? new URL(endpoint, baseURL ? ensureTrailingSlash(baseURL) : undefined)
      : new URL(baseURL);
  } catch {
    throw new Error("canvas_agent_web_search_provider_endpoint_invalid");
  }
  if (url.protocol !== "https:" || url.username || url.password || hasSensitiveSearchParameter(url)) {
    throw new Error("canvas_agent_web_search_provider_endpoint_invalid");
  }
  url.hash = "";
  return url;
}

function createSearchProviderRequest(
  provider: { model: AiModelConfigRecord; adapter: SearchProviderAdapter },
  endpoint: URL,
  query: string,
  limit: number,
) {
  const apiKey = readString(provider.model.providerConfig.apiKey);
  if (provider.adapter === "tavily") {
    return {
      url: endpoint,
      init: {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ query, max_results: limit, search_depth: "basic", include_answer: false, include_raw_content: false }),
      },
    };
  }
  if (provider.adapter === "bing") {
    endpoint.searchParams.set("q", query);
    endpoint.searchParams.set("count", String(limit));
    endpoint.searchParams.set("responseFilter", "Webpages");
    endpoint.searchParams.set("textDecorations", "false");
    endpoint.searchParams.set("textFormat", "Raw");
    return {
      url: endpoint,
      init: {
        method: "GET",
        headers: { accept: "application/json", "ocp-apim-subscription-key": apiKey },
      },
    };
  }

  const config = provider.model.providerConfig;
  const method = readString(config.searchMethod).toUpperCase() === "GET" ? "GET" : "POST";
  const queryField = safeFieldName(config.queryField, "query");
  const limitField = safeFieldName(config.limitField, "limit");
  const authHeader = safeHeaderName(config.authHeader, "authorization");
  const authPrefix = safeAuthPrefix(config.authPrefix);
  const headers: Record<string, string> = { accept: "application/json", [authHeader]: `${authPrefix}${apiKey}` };
  if (method === "GET") {
    endpoint.searchParams.set(queryField, query);
    endpoint.searchParams.set(limitField, String(limit));
    return { url: endpoint, init: { method, headers } };
  }
  headers["content-type"] = "application/json";
  return {
    url: endpoint,
    init: { method, headers, body: JSON.stringify({ [queryField]: query, [limitField]: limit }) },
  };
}

function mapSearchProviderHttpError(status: number) {
  if (status === 401 || status === 403) return new Error("canvas_agent_web_search_provider_auth_failed");
  if (status === 408) return new Error("canvas_agent_web_search_provider_timeout");
  if (status === 429) return new Error("canvas_agent_web_search_provider_rate_limited");
  if (status >= 500) return new Error("canvas_agent_web_search_provider_unavailable");
  if (status === 400 || status === 422) return new Error("canvas_agent_web_search_provider_request_invalid");
  return new Error("canvas_agent_web_search_provider_rejected");
}

function readProviderRequestId(response: Response) {
  return readString(response.headers.get("x-request-id") ?? response.headers.get("x-msedge-clientid")).slice(0, 200) || null;
}

function normalizeAdapterName(value: unknown) {
  return readString(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function hasSensitiveSearchParameter(url: URL) {
  return [...url.searchParams.keys()].some((key) => /(api[-_]?key|authorization|password|secret|signature|token)/i.test(key));
}

function safeFieldName(value: unknown, fallback: string) {
  const name = readString(value);
  return /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(name) ? name : fallback;
}

function safeHeaderName(value: unknown, fallback: string) {
  const name = readString(value).toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(name) ? name : fallback;
}

function safeAuthPrefix(value: unknown) {
  if (value === false) return "";
  const prefix = readString(value) || "Bearer";
  if (prefix.length > 32 || /[\r\n]/.test(prefix)) throw new Error("canvas_agent_web_search_provider_auth_invalid");
  return prefix ? `${prefix} ` : "";
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function assertPublicHostname(hostname: string, lookupImpl: typeof lookup = lookup) {
  await resolvePublicHostname(hostname, lookupImpl);
}

export type ResolvedPublicHostname = {
  hostname: string;
  address: string | null;
};

export type PinnedPublicDispatcherFactory = (input: { hostname: string; address: string }) => Agent;

export async function resolvePublicHostname(hostname: string, lookupImpl: typeof lookup = lookup): Promise<ResolvedPublicHostname> {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!normalized || normalized === "localhost" || normalized.endsWith(".local") || normalized.endsWith(".internal")) {
    throw new Error("canvas_agent_web_ssrf_blocked");
  }
  if (net.isIP(normalized)) {
    if (isPrivateIp(normalized)) throw new Error("canvas_agent_web_ssrf_blocked");
    return { hostname: normalized, address: null };
  }
  const addresses = await lookupImpl(normalized, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new Error("canvas_agent_web_ssrf_blocked");
  }
  return { hostname: normalized, address: addresses[0]?.address ?? null };
}

export async function fetchResolvedPublicUrl(
  url: URL,
  init: RequestInit,
  resolved: ResolvedPublicHostname,
  fetchImpl: typeof fetch = fetch,
  dispatcherFactory: PinnedPublicDispatcherFactory = createPinnedPublicDispatcher,
): Promise<Response> {
  const hostname = url.hostname.trim().toLowerCase().replace(/\.$/, "");
  if (hostname !== resolved.hostname) throw new Error("canvas_agent_web_ssrf_blocked");
  if (!resolved.address) return fetchImpl(url, init);

  const dispatcher = dispatcherFactory({ hostname: resolved.hostname, address: resolved.address });
  try {
    const response = await fetchImpl(url, { ...init, dispatcher } as RequestInit);
    return responseWithDispatcherLifetime(response, dispatcher);
  } catch (error) {
    dispatcher.destroy(error instanceof Error ? error : undefined);
    throw error;
  }
}

function createPinnedPublicDispatcher(input: { hostname: string; address: string }) {
  const defaultConnector = buildConnector({});
  return new Agent({
    connect(options, callback) {
      defaultConnector({
        ...options,
        hostname: input.address,
        host: input.address,
        servername: options.servername ?? input.hostname,
      }, callback);
    },
  });
}

function responseWithDispatcherLifetime(response: Response, dispatcher: Agent): Response {
  if (!response.body) {
    void dispatcher.close();
    return response;
  }
  const reader = response.body.getReader();
  let finished = false;
  const finish = (error?: unknown) => {
    if (finished) return;
    finished = true;
    if (error instanceof Error) dispatcher.destroy(error);
    else void dispatcher.close();
  };
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          controller.close();
          finish();
          return;
        }
        controller.enqueue(chunk.value);
      } catch (error) {
        controller.error(error);
        finish(error);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        finish();
      }
    },
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function isPrivateIp(value: string) {
  if (net.isIPv4(value)) {
    const [a, b] = value.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const normalized = value.toLowerCase();
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fc")
    || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

function stripHtml(value: string) {
  return decodeEntities(value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function extractTitle(value: string) {
  return decodeEntities(value.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
    .replace(/\s+/g, " ").trim().slice(0, 500);
}

function decodeEntities(value: string) {
  return value.replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi, (entity) => ({
    "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'",
  }[entity.toLowerCase()] ?? entity));
}

function selectExcerpt(value: string, query?: string | null) {
  const text = value.trim();
  if (!query?.trim()) return text.slice(0, 16_000);
  const needle = query.trim().toLowerCase();
  const index = text.toLowerCase().indexOf(needle);
  if (index < 0) return text.slice(0, 16_000);
  return text.slice(Math.max(0, index - 4_000), index + 12_000);
}

function parseJsonSearchResults(raw: string, limit: number) {
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { throw new Error("canvas_agent_web_search_response_invalid"); }
  const record = asRecord(payload);
  const candidates = Array.isArray(payload)
    ? payload
    : firstArray(record.results, record.items, record.organic_results, record.webPages && asRecord(record.webPages).value);
  return candidates
    .map(normalizeSearchResult)
    .filter((result): result is { title: string; url: string; snippet: string } => Boolean(result))
    .slice(0, limit);
}

function parseHtmlSearchResults(raw: string, endpoint: URL, limit: number) {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (let match = linkPattern.exec(raw); match && results.length < limit; match = linkPattern.exec(raw)) {
    let url: URL;
    try { url = new URL(decodeEntities(match[1] ?? ""), endpoint); } catch { continue; }
    if (url.protocol !== "https:" || url.hostname === endpoint.hostname) continue;
    url.hash = "";
    const title = stripHtml(match[2] ?? "").slice(0, 500);
    if (!title) continue;
    results.push({ title, url: url.toString(), snippet: title });
  }
  return results;
}

function normalizeSearchResult(value: unknown) {
  const record = asRecord(value);
  const title = String(record.title ?? record.name ?? "").trim().slice(0, 500);
  const snippet = String(record.snippet ?? record.description ?? record.content ?? title).trim().slice(0, 16_000);
  const rawUrl = String(record.url ?? record.link ?? record.href ?? "").trim();
  let url: URL;
  try { url = new URL(rawUrl); } catch { return null; }
  if (url.protocol !== "https:" || !title || !snippet) return null;
  url.hash = "";
  return { title, url: url.toString(), snippet };
}

function firstArray(...values: unknown[]) {
  return values.find(Array.isArray) as unknown[] | undefined ?? [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
