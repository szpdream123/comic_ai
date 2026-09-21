export const AI_CANVAS_MEDIA_CACHE_NAME = "comic-ai-canvas-media-v1";
export const AI_CANVAS_MEDIA_CACHE_MAX_ENTRIES = 200;

function text(value) {
  return String(value ?? "").trim();
}

export function resolveAiCanvasMediaCacheRequestUrl(input, origin = globalThis.location?.origin) {
  const raw = text(typeof input === "string" ? input : input?.url);
  if (!raw) return "";
  try {
    return new URL(raw, origin || "http://127.0.0.1").toString();
  } catch {
    return raw;
  }
}

export function resolveAiCanvasMediaCacheRequestMethod(input, init = {}) {
  return text((init?.method ?? (typeof input === "string" ? "" : input?.method)) || "GET").toUpperCase();
}

function headerValue(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return text(headers.get(name) || headers.get(name.toLowerCase()));
  if (Array.isArray(headers)) {
    const row = headers.find((entry) => text(entry?.[0]).toLowerCase() === name.toLowerCase());
    return text(row?.[1]);
  }
  return text(headers[name] || headers[name.toLowerCase()]);
}

export function isAiCanvasMediaCacheUrl(url, origin = globalThis.location?.origin) {
  const raw = text(url);
  if (!raw || /^(?:blob|data|asset):/i.test(raw)) return false;
  try {
    const base = origin || "http://127.0.0.1";
    const parsed = new URL(raw, base);
    if (origin && parsed.origin !== new URL(origin).origin) return false;
    if (!/^\/api\/storage\/objects\/[^/]+\/content$/i.test(parsed.pathname)) return false;
    if (parsed.searchParams.get("download") === "1") return false;
    return true;
  } catch {
    return false;
  }
}

export function isAiCanvasMediaCacheRequest(input, init = {}, origin = globalThis.location?.origin) {
  const method = resolveAiCanvasMediaCacheRequestMethod(input, init);
  if (method !== "GET") return false;
  const cacheMode = text(init?.cache ?? (typeof input === "string" ? "" : input?.cache)).toLowerCase();
  if (cacheMode === "no-store" || cacheMode === "reload") return false;
  const headers = init?.headers ?? (typeof input === "string" ? null : input?.headers);
  if (headerValue(headers, "range")) return false;
  return isAiCanvasMediaCacheUrl(resolveAiCanvasMediaCacheRequestUrl(input, origin), origin);
}

function isCacheableMediaResponse(response) {
  if (!response || response.status !== 200 || response.ok === false) return false;
  const contentType = text(response.headers?.get?.("content-type")).toLowerCase();
  return contentType.startsWith("image/");
}

async function pruneAiCanvasMediaCache(cache, maxEntries = AI_CANVAS_MEDIA_CACHE_MAX_ENTRIES) {
  if (!cache?.keys || !cache?.delete) return;
  const keys = await cache.keys();
  const extra = keys.length - maxEntries;
  if (extra <= 0) return;
  for (let index = 0; index < extra; index += 1) {
    await cache.delete(keys[index]);
  }
}

export async function persistAiCanvasMediaCacheResponse(cache, url, response, maxEntries = AI_CANVAS_MEDIA_CACHE_MAX_ENTRIES) {
  if (!cache?.put || !url || !isCacheableMediaResponse(response)) return false;
  await cache.put(url, response);
  await pruneAiCanvasMediaCache(cache, maxEntries);
  return true;
}

export async function clearAiCanvasRuntimeMediaCache(cachesApi = globalThis.caches) {
  try {
    await cachesApi?.delete?.(AI_CANVAS_MEDIA_CACHE_NAME);
  } catch {
    // Cache Storage can be missing in private or file-based browser contexts.
  }
}

export function installAiCanvasRuntimeMediaCache(runtimeWindow = globalThis) {
  const fetchImpl = runtimeWindow?.fetch;
  if (typeof fetchImpl !== "function" || fetchImpl.__comicAiMediaCache) {
    return { dispose() {} };
  }
  const originalFetch = fetchImpl.bind(runtimeWindow);
  const cachesApi = runtimeWindow.caches;
  const cachePromise = typeof cachesApi?.open === "function"
    ? cachesApi.open(AI_CANVAS_MEDIA_CACHE_NAME)
    : null;
  const origin = runtimeWindow.location?.origin || globalThis.location?.origin;
  const bridgedFetch = async (input, init = {}) => {
    if (!cachePromise || !isAiCanvasMediaCacheRequest(input, init, origin)) {
      return originalFetch(input, init);
    }
    const url = resolveAiCanvasMediaCacheRequestUrl(input, origin);
    let cache = null;
    try {
      cache = await cachePromise;
      const cached = await cache.match(url);
      if (cached) return cached;
    } catch {
      cache = null;
    }
    const response = await originalFetch(input, init);
    let cachedCopy = null;
    try {
      if (cache && isCacheableMediaResponse(response)) cachedCopy = response.clone();
    } catch {
      cachedCopy = null;
    }
    if (cache && cachedCopy) {
      void persistAiCanvasMediaCacheResponse(cache, url, cachedCopy).catch(() => undefined);
    }
    return response;
  };
  bridgedFetch.__comicAiMediaCache = true;
  runtimeWindow.fetch = bridgedFetch;
  return {
    dispose() {
      if (runtimeWindow.fetch === bridgedFetch) runtimeWindow.fetch = originalFetch;
    },
  };
}
