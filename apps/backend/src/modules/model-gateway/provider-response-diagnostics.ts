import { ModelError } from "./model-error.ts";

export interface ProviderResponseDiagnostics {
  httpStatus: number;
  statusText?: string | null;
  contentType: string | null;
  requestId: string | null;
  responseBodyLength: number;
  responseBodyPreview: string;
}

const providerRawResponseSymbol = Symbol("providerRawResponse");
const PROVIDER_AUDIT_STRING_LIMIT = 16_384;
const PROVIDER_AUDIT_TOTAL_LIMIT = 65_536;
const PROVIDER_AUDIT_MAX_DEPTH = 12;
const PROVIDER_AUDIT_MAX_ENTRIES = 200;

export function compactProviderAuditValue(value: unknown, parentKey = ""): unknown {
  const compacted = compactProviderAuditEntry(value, parentKey, {
    remaining: PROVIDER_AUDIT_TOTAL_LIMIT,
  }, 0);
  const serialized = JSON.stringify(compacted);
  const serializedBytes = Buffer.byteLength(serialized, "utf8");
  return serializedBytes <= PROVIDER_AUDIT_TOTAL_LIMIT
    ? compacted
    : {
        omitted: true,
        reason: "oversized_audit_value",
        originalCharacters: serialized.length,
        originalBytes: serializedBytes,
      };
}

function compactProviderAuditEntry(
  value: unknown,
  parentKey: string,
  budget: { remaining: number },
  depth: number,
): unknown {
  if (depth > PROVIDER_AUDIT_MAX_DEPTH) {
    return consumeProviderAuditText("[omitted: maximum audit depth exceeded]", budget);
  }
  if (budget.remaining <= 0) {
    return "[omitted: audit value budget exhausted]";
  }
  if (typeof value === "string") {
    if (/^data:[^,]*;base64,/i.test(value)) {
      return consumeProviderAuditText(`[binary omitted: data URL, ${value.length} chars]`, budget);
    }
    if (isProviderBinaryField(parentKey)) {
      return consumeProviderAuditText(`[binary omitted: base64, ${value.length} chars]`, budget);
    }
    const parsed = parseOversizedJson(value);
    if (value.length > PROVIDER_AUDIT_STRING_LIMIT && parsed !== undefined) {
      return consumeProviderAuditText(
        JSON.stringify(compactProviderAuditEntry(parsed, parentKey, budget, depth + 1)),
        budget,
      );
    }
    return consumeProviderAuditText(value, budget);
  }
  if (value instanceof Uint8Array) {
    return consumeProviderAuditText(`[binary omitted: ${value.byteLength} bytes]`, budget);
  }
  if (Array.isArray(value)) {
    const result = value.slice(0, PROVIDER_AUDIT_MAX_ENTRIES)
      .map((item) => compactProviderAuditEntry(item, parentKey, budget, depth + 1));
    if (value.length > result.length) {
      result.push({ omittedEntries: value.length - result.length });
    }
    return result;
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const result: Record<string, unknown> = {};
  for (const [key, entryValue] of entries.slice(0, PROVIDER_AUDIT_MAX_ENTRIES)) {
    budget.remaining -= Buffer.byteLength(key, "utf8");
    result[key] = compactProviderAuditEntry(entryValue, key, budget, depth + 1);
    if (budget.remaining <= 0) break;
  }
  if (entries.length > Object.keys(result).length) {
    result.__omittedEntries = entries.length - Object.keys(result).length;
  }
  return result;
}

function isProviderBinaryField(key: string) {
  const normalized = String(key ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  return normalized === "b64"
    || normalized === "b64json"
    || normalized.includes("base64")
    || normalized.endsWith("b64");
}

function parseOversizedJson(value: string): unknown | undefined {
  const trimmed = value.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function consumeProviderAuditText(value: string, budget: { remaining: number }) {
  const maximum = Math.max(0, Math.min(PROVIDER_AUDIT_STRING_LIMIT, budget.remaining));
  const compacted = truncateProviderAuditTextToBytes(value, maximum);
  budget.remaining = Math.max(0, budget.remaining - Buffer.byteLength(compacted, "utf8"));
  return compacted;
}

function truncateProviderAuditTextToBytes(value: string, maximumBytes: number) {
  if (Buffer.byteLength(value, "utf8") <= maximumBytes) return value;
  const suffix = `\n...[truncated: ${value.length} chars total]`;
  const contentBudget = Math.max(0, maximumBytes - Buffer.byteLength(suffix, "utf8"));
  let low = 0;
  let high = value.length;
  while (low < high) {
    const midpoint = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(value.slice(0, midpoint), "utf8") <= contentBudget) {
      low = midpoint;
    } else {
      high = midpoint - 1;
    }
  }
  return `${value.slice(0, low)}${suffix}`;
}

export function attachProviderRawResponse<T extends object>(value: T, rawResponse: unknown): T {
  Object.defineProperty(value, providerRawResponseSymbol, {
    configurable: true,
    enumerable: false,
    value: rawResponse,
  });
  return value;
}

export function readProviderRawResponse(value: unknown): unknown {
  return value && typeof value === "object"
    ? (value as Record<symbol, unknown>)[providerRawResponseSymbol]
    : undefined;
}

export function providerResponseDiagnostics(
  response: Response,
  text: string,
): ProviderResponseDiagnostics {
  return attachProviderRawResponse({
    httpStatus: response.status,
    statusText: response.statusText || null,
    contentType: response.headers.get("content-type"),
    requestId: readProviderRequestId(response),
    responseBodyLength: Buffer.byteLength(text, "utf8"),
    responseBodyPreview: redactProviderResponsePreview(text),
  }, text);
}

export async function readProviderResponseDiagnostics(response: Response) {
  const text = await response.text().catch(() => "");
  return {
    text,
    diagnostics: providerResponseDiagnostics(response, text),
  };
}

export function providerResponseError(message: string, diagnostics: ProviderResponseDiagnostics) {
  return ModelError.fromUnknown(message, {
    providerDiagnostics: diagnostics,
  });
}

export function attachProviderRedactedRequest<T extends Error>(
  error: T,
  redactedRequest: Record<string, unknown>,
): T {
  return Object.assign(error, {
    providerRedactedRequest: redactedRequest,
  });
}

export function redactProviderResponsePreview(text: string) {
  const preview = text.trim().slice(0, 1000);
  if (!preview) return "";
  return preview
    .replace(/"b64_json"\s*:\s*"[^"]+"/gi, '"b64_json":"[redacted]"')
    .replace(/"url"\s*:\s*"[^"]+"/gi, '"url":"[redacted]"')
    .replace(/"image_url"\s*:\s*"[^"]+"/gi, '"image_url":"[redacted]"')
    .replace(/"video_url"\s*:\s*"[^"]+"/gi, '"video_url":"[redacted]"')
    .replace(/"audio_url"\s*:\s*"[^"]+"/gi, '"audio_url":"[redacted]"')
    .replace(/"api[_-]?key"\s*:\s*"[^"]+"/gi, '"api_key":"[redacted]"')
    .replace(/"authorization"\s*:\s*"[^"]+"/gi, '"authorization":"[redacted]"')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]")
    .replace(/\b(OpenAI|GlobalAiOpc|Volcengine|Lingdong|Aliyun|DashScope|DeepSeek|Qwen)\b/gi, "[provider]")
    .replace(/\bExtra\s+Token\b/gi, "[provider]");
}

function readProviderRequestId(response: Response) {
  return (
    response.headers.get("x-request-id") ||
    response.headers.get("x-tt-logid") ||
    response.headers.get("x-dashscope-request-id") ||
    response.headers.get("request-id") ||
    response.headers.get("x-amzn-requestid") ||
    null
  );
}
