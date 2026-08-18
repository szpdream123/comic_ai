import { lookup } from "node:dns/promises";
import net from "node:net";

import { Agent, buildConnector } from "undici";

import type { MarketingResearchDocument, MarketingResearchProvider } from "../ports/marketing-research.ts";

const MAX_DOCUMENTS_PER_RUN = 20;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;
const ALLOWED_CONTENT_TYPES = ["text/html", "text/plain", "application/json"];

export class MarketingResearchHttpProvider implements MarketingResearchProvider {
  private queue: Promise<void> = Promise.resolve();
  private readonly allowedDomains: Set<string>;

  constructor(
    allowedDomains: string[],
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly lookupImpl: typeof lookup = lookup,
    private readonly dispatcherFactory: (input: { hostname: string; address: string }) => Agent = createPinnedPublicDispatcher,
  ) {
    this.allowedDomains = new Set(allowedDomains.map(normalizeDomain).filter(Boolean));
  }

  async collect(input: { urls: string[] }): Promise<MarketingResearchDocument[]> {
    if (!Array.isArray(input.urls) || input.urls.length === 0 || input.urls.length > MAX_DOCUMENTS_PER_RUN) {
      throw new Error("marketing_research_url_count_invalid");
    }
    return Promise.all(input.urls.map((url) => this.serialize(() => this.fetchDocument(url))));
  }

  private async serialize<T>(work: () => Promise<T>) {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }

  private async fetchDocument(requestedUrl: string): Promise<MarketingResearchDocument> {
    let current = normalizeResearchUrl(requestedUrl);
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const hostname = normalizeDomain(current.hostname);
      if (net.isIP(hostname)) throw new Error("marketing_research_ssrf_blocked");
      if (!this.allowedDomains.has(hostname)) throw new Error("marketing_research_domain_not_allowed");
      const address = await resolvePublicAddress(hostname, this.lookupImpl);
      const dispatcher = this.dispatcherFactory({ hostname, address });
      let response: Response;
      try {
        response = await this.fetchImpl(current, {
          method: "GET",
          redirect: "manual",
          headers: { accept: "text/html, text/plain, application/json;q=0.8" },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          dispatcher,
        } as RequestInit);
      } catch (error) {
        dispatcher.destroy(error instanceof Error ? error : undefined);
        if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) throw new Error("marketing_research_timeout");
        throw new Error("marketing_research_request_failed");
      }
      if (isRedirect(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);
        await dispatcher.close();
        if (!location || redirects === MAX_REDIRECTS) throw new Error("marketing_research_redirect_invalid");
        current = normalizeResearchUrl(new URL(location, current).toString());
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        await dispatcher.close();
        throw new Error(`marketing_research_http_${response.status}`);
      }
      const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
      if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
        await response.body?.cancel().catch(() => undefined);
        await dispatcher.close();
        throw new Error("marketing_research_content_type_invalid");
      }
      const advertisedLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(advertisedLength) && advertisedLength > MAX_RESPONSE_BYTES) {
        await response.body?.cancel().catch(() => undefined);
        await dispatcher.close();
        throw new Error("marketing_research_response_too_large");
      }
      try {
        const raw = await readLimitedText(response, MAX_RESPONSE_BYTES);
        const text = contentType === "text/html" ? stripHtml(raw) : raw.replace(/\s+/g, " ").trim();
        if (!text) throw new Error("marketing_research_content_empty");
        return {
          requestedUrl: normalizeResearchUrl(requestedUrl).toString(),
          canonicalUrl: current.toString(),
          title: contentType === "text/html" ? extractTitle(raw) || current.hostname : current.hostname,
          contentType,
          text,
          untrusted: true,
        };
      } finally {
        await dispatcher.close();
      }
    }
    throw new Error("marketing_research_redirect_invalid");
  }
}

function normalizeResearchUrl(value: string) {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("marketing_research_url_invalid"); }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("marketing_research_url_invalid");
  }
  url.hash = "";
  return url;
}

function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

async function resolvePublicAddress(hostname: string, lookupImpl: typeof lookup) {
  if (!hostname || net.isIP(hostname) || hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("marketing_research_ssrf_blocked");
  }
  const entries = await lookupImpl(hostname, { all: true, verbatim: true });
  if (!entries.length || entries.some((entry) => isPrivateOrReservedIp(entry.address))) {
    throw new Error("marketing_research_ssrf_blocked");
  }
  return entries[0]!.address;
}

function isPrivateOrReservedIp(value: string) {
  if (net.isIPv4(value)) {
    const [a, b] = value.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && [0, 2, 168].includes(b))
      || (a === 198 && [18, 19, 51].includes(b))
      || (a === 203 && b === 0);
  }
  const normalized = value.toLowerCase();
  if (normalized.startsWith("::ffff:")) return isPrivateOrReservedIp(normalized.slice("::ffff:".length));
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd")
    || normalized.startsWith("fe80:") || normalized.startsWith("ff") || normalized.startsWith("2001:db8:");
}

function isRedirect(status: number) {
  return [301, 302, 303, 307, 308].includes(status);
}

async function readLimitedText(response: Response, maxBytes: number) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("marketing_research_response_too_large");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function stripHtml(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ").trim();
}

function extractTitle(value: string) {
  const match = value.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]) : "";
}

function createPinnedPublicDispatcher(input: { hostname: string; address: string }) {
  const connector = buildConnector({});
  return new Agent({
    connect(options, callback) {
      connector({ ...options, hostname: input.address, host: input.address, servername: options.servername ?? input.hostname }, callback);
    },
  });
}
