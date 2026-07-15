import { Agent } from "undici";

export const imageGenerationProviderTimeoutMs = 60 * 60 * 1000;
export const videoGenerationProviderTimeoutMs = 3 * 60 * 60 * 1000;

const providerDispatchers = new Map<number, Agent>();

export function resolveGenerationProviderFetch(
  fetchImpl: typeof fetch | undefined,
  mediaType: "image" | "video",
): typeof fetch {
  if (fetchImpl) {
    return fetchImpl;
  }
  const timeoutMs = mediaType === "video"
    ? videoGenerationProviderTimeoutMs
    : imageGenerationProviderTimeoutMs;
  const dispatcher = resolveProviderDispatcher(timeoutMs);
  return ((input: URL | RequestInfo, init: RequestInit = {}) => fetch(input, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    dispatcher,
  } as RequestInit)) as typeof fetch;
}

function resolveProviderDispatcher(timeoutMs: number) {
  const existing = providerDispatchers.get(timeoutMs);
  if (existing) {
    return existing;
  }
  const dispatcher = new Agent({
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
  });
  providerDispatchers.set(timeoutMs, dispatcher);
  return dispatcher;
}
