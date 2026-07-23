import { Agent } from "undici";

import {
  generationProviderHttpTimeoutMsFor,
  type GenerationTimeoutMediaType,
} from "./generation-timeout.policy.ts";

const providerDispatchers = new Map<number, Agent>();

export function resolveGenerationProviderFetch(
  fetchImpl: typeof fetch | undefined,
  mediaType: GenerationTimeoutMediaType,
  env: NodeJS.ProcessEnv = process.env,
): typeof fetch {
  const timeoutMs = generationProviderHttpTimeoutMsFor(mediaType, env);
  const providerFetch = fetchImpl ?? fetch;
  const dispatcher = fetchImpl ? undefined : resolveProviderDispatcher(timeoutMs);
  return ((input: URL | RequestInfo, init: RequestInit = {}) => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal;
    return providerFetch(input, {
      ...init,
      signal,
      ...(dispatcher ? { dispatcher } : {}),
    } as RequestInit);
  }) as typeof fetch;
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
