import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, buildConnector } from "undici";

const MAX_PROVIDER_ARTIFACT_REDIRECTS = 5;

export async function fetchProviderArtifactSafely(
  artifactUrl: string,
  init: RequestInit | undefined,
  fetchImpl?: typeof fetch,
): Promise<Response> {
  let currentUrl = parseProviderArtifactUrl(artifactUrl);
  let currentInit = { ...(init ?? {}), redirect: "manual" as const };
  for (let redirectCount = 0; redirectCount <= MAX_PROVIDER_ARTIFACT_REDIRECTS; redirectCount += 1) {
    assertSafePublicHttpsUrlLiteral(currentUrl);
    const response = fetchImpl
      ? await fetchImpl(currentUrl, currentInit)
      : await fetchWithPinnedPublicAddress(currentUrl, currentInit);
    if (!isRedirectResponse(response.status)) {
      return response;
    }
    const location = response.headers.get("location");
    if (!location || redirectCount === MAX_PROVIDER_ARTIFACT_REDIRECTS) {
      await response.body?.cancel().catch(() => undefined);
      throw providerArtifactUrlError("provider_artifact_redirect_invalid");
    }
    const nextUrl = parseProviderArtifactUrl(location, currentUrl);
    await response.body?.cancel().catch(() => undefined);
    if (nextUrl.origin !== currentUrl.origin) {
      currentInit = { ...currentInit, headers: withoutSensitiveRedirectHeaders(currentInit.headers) };
    }
    currentUrl = nextUrl;
  }
  throw providerArtifactUrlError("provider_artifact_redirect_invalid");
}

export function isSafePublicHttpsUrlLiteral(value: string | URL): boolean {
  try {
    assertSafePublicHttpsUrlLiteral(value instanceof URL ? value : new URL(value));
    return true;
  } catch {
    return false;
  }
}

function assertSafePublicHttpsUrlLiteral(url: URL) {
  if (url.protocol !== "https:" || url.username || url.password) {
    throw providerArtifactUrlError("provider_artifact_url_invalid");
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw providerArtifactUrlError("provider_artifact_url_invalid");
  }
  if (isIP(hostname) && !isPublicIpAddress(hostname)) {
    throw providerArtifactUrlError("provider_artifact_url_invalid");
  }
}

async function resolvePublicDnsAddresses(hostname: string) {
  if (isIP(hostname)) return [];
  let addresses: Awaited<ReturnType<typeof lookup>>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw providerArtifactUrlError("provider_artifact_dns_unavailable");
  }
  if (!addresses.length || addresses.some((entry) => !isPublicIpAddress(entry.address))) {
    throw providerArtifactUrlError("provider_artifact_dns_private");
  }
  return addresses;
}

async function fetchWithPinnedPublicAddress(url: URL, init: RequestInit): Promise<Response> {
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(hostname)) {
    return fetch(url, init);
  }
  const addresses = await resolvePublicDnsAddresses(hostname);
  const selected = addresses[0];
  if (!selected) {
    throw providerArtifactUrlError("provider_artifact_dns_unavailable");
  }
  const defaultConnector = buildConnector({});
  const dispatcher = new Agent({
    connect(options, callback) {
      defaultConnector({
        ...options,
        hostname: selected.address,
        host: selected.address,
        servername: options.servername ?? hostname,
      }, callback);
    },
  });
  try {
    const response = await fetch(url, {
      ...init,
      dispatcher,
    } as RequestInit);
    return responseWithDispatcherLifetime(response, dispatcher);
  } catch (error) {
    dispatcher.destroy(error instanceof Error ? error : undefined);
    throw error;
  }
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
    if (error instanceof Error) {
      dispatcher.destroy(error);
    } else {
      void dispatcher.close();
    }
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

function parseProviderArtifactUrl(value: string, base?: URL): URL {
  try {
    return new URL(value, base);
  } catch {
    throw providerArtifactUrlError("provider_artifact_url_invalid");
  }
}

function isPublicIpAddress(address: string): boolean {
  if (isIP(address) === 4) return isPublicIpv4(address);
  if (isIP(address) !== 6) return false;
  const bytes = ipv6Bytes(address);
  if (!bytes) return false;
  if (bytes.slice(0, 10).every((value) => value === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return isPublicIpv4(bytes.slice(12).join("."));
  }
  if (bytes.every((value) => value === 0) || bytes.slice(0, 15).every((value) => value === 0) && bytes[15] === 1) return false;
  if ((bytes[0] & 0xfe) === 0xfc) return false;
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return false;
  if (bytes[0] === 0xff) return false;
  return true;
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [first, second] = parts;
  return !(
    first === 0 || first === 10 || first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && (second === 0 || second === 168)) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function ipv6Bytes(address: string): number[] | null {
  const normalized = address.split("%")[0].toLowerCase();
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array(Math.max(0, missing)).fill("0"), ...right];
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    const value = Number.parseInt(group, 16);
    bytes.push(value >> 8, value & 0xff);
  }
  return bytes;
}

function isRedirectResponse(status: number) {
  return [301, 302, 303, 307, 308].includes(status);
}

function withoutSensitiveRedirectHeaders(headers: HeadersInit | undefined): Headers {
  const safeHeaders = new Headers(headers);
  for (const name of ["authorization", "cookie", "proxy-authorization"]) {
    safeHeaders.delete(name);
  }
  return safeHeaders;
}

function providerArtifactUrlError(message: string) {
  return Object.assign(new Error(message), { failureCode: "provider_output_download_failed" });
}
