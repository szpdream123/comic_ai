const REDACTED = "[REDACTED]";
const REDACTED_URL = "[REDACTED_URL]";
const REDACTED_PATH = "[REDACTED_PATH]";

const sensitiveKeyPattern = /^(?:api[_-]?key|authorization|cookie|password|secret(?:value)?|access[_-]?token|refresh[_-]?token|bearer[_-]?token|signed[_-]?url|local[_-]?path|blob[_-]?url|data[_-]?url)$/i;
const signedQueryKeyPattern = /^(?:token|signature|sig|key|api_key|access_token|x-amz-|q-sign)/i;

export function sanitizeCanvasAgentValue<T>(value: T): T {
  return sanitizeValue(value, 0) as T;
}

export function assertNoCanvasAgentSensitiveValue(value: unknown) {
  if (containsSensitiveValue(value, 0)) {
    throw new Error("canvas_agent_sensitive_value_forbidden");
  }
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 32) return REDACTED;
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
    key,
    sensitiveKeyPattern.test(key) && item != null ? REDACTED : sanitizeValue(item, depth + 1),
  ]));
}

function containsSensitiveValue(value: unknown, depth: number): boolean {
  if (depth > 32) return true;
  if (typeof value === "string") return sanitizeString(value) !== value;
  if (Array.isArray(value)) return value.some((item) => containsSensitiveValue(item, depth + 1));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, item]) => (
    (sensitiveKeyPattern.test(key) && item != null) || containsSensitiveValue(item, depth + 1)
  ));
}

function sanitizeString(value: string) {
  return value
    .replace(/https?:\/\/[^\s"'<>]+/gi, (candidate) => isSignedUrl(candidate) ? REDACTED_URL : candidate)
    .replace(/\b(?:data|blob|file):[^\s"'<>]+/gi, (candidate) => candidate.toLowerCase().startsWith("file:") ? REDACTED_PATH : REDACTED_URL)
    .replace(/\b[A-Za-z]:\\[^\r\n"'<>]*/g, REDACTED_PATH)
    .replace(/\/(?:Users|home|var\/folders|tmp)\/[^\s"'<>]+/g, REDACTED_PATH)
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, `Bearer ${REDACTED}`)
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|AKIA[A-Z0-9]{16}|gh[opsu]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g, REDACTED);
}

function isSignedUrl(candidate: string) {
  try {
    const url = new URL(candidate);
    return [...url.searchParams.keys()].some((key) => signedQueryKeyPattern.test(key));
  } catch {
    return false;
  }
}
