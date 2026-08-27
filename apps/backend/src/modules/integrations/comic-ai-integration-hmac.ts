import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export class ComicAiIntegrationHmacError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 401 | 409 | 500 = 401,
  ) {
    super(message);
  }
}

type ConfiguredKey = {
  workerId: string;
  secret: string;
};

export type VerifiedComicAiIntegrationRequest = {
  workerId: string;
  keyId: string;
  nonce: string;
  keyFingerprint: string;
};

const replayedNonces = new Map<string, number>();
const timestampWindowMs = 5 * 60 * 1000;
const nonceRetentionMs = 10 * 60 * 1000;

/**
 * Verify the HMAC contract used by MoneyPrinterTurbo without depending on the
 * removed marketing tables. Keys are owned by the Comic AI process and are
 * configured through environment variables.
 */
export function verifyComicAiIntegrationHmac(input: {
  env: NodeJS.ProcessEnv;
  method: string;
  pathWithQuery: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  now?: Date;
}): VerifiedComicAiIntegrationRequest {
  const version = header(input.headers, ["x-comic-ai-version", "x-marketing-version"]);
  const workerId = header(input.headers, ["x-comic-ai-worker-id", "x-marketing-worker-id"]);
  const keyId = header(input.headers, ["x-comic-ai-key-id", "x-marketing-key-id"]);
  const timestamp = header(input.headers, ["x-comic-ai-timestamp", "x-marketing-timestamp"]);
  const nonce = header(input.headers, ["x-comic-ai-nonce", "x-marketing-nonce"]);
  const bodySha256 = header(input.headers, ["x-comic-ai-content-sha256", "x-marketing-content-sha256"]);
  const signature = header(input.headers, ["x-comic-ai-signature", "x-marketing-signature"]);
  if (!version || version !== "v1" || !workerId || !keyId || !timestamp || !nonce || !bodySha256 || !signature) {
    throw new ComicAiIntegrationHmacError(
      "comic_ai_hmac_headers_invalid",
      "Required Comic AI integration signature headers are missing",
    );
  }

  const now = input.now ?? new Date();
  const timestampMs = Number(timestamp);
  if (!Number.isSafeInteger(timestampMs) || Math.abs(now.getTime() - timestampMs) > timestampWindowMs) {
    throw new ComicAiIntegrationHmacError(
      "comic_ai_hmac_timestamp_invalid",
      "Comic AI integration request timestamp is outside the allowed window",
    );
  }
  if (!isUuid(nonce)) {
    throw new ComicAiIntegrationHmacError(
      "comic_ai_hmac_nonce_invalid",
      "Comic AI integration request nonce is invalid",
    );
  }

  const actualBodyHash = createHash("sha256").update(input.body).digest("hex");
  if (!constantTimeEqual(bodySha256, actualBodyHash)) {
    throw new ComicAiIntegrationHmacError(
      "comic_ai_hmac_body_hash_invalid",
      "Comic AI integration request body hash is invalid",
    );
  }

  const configuredKeys = configuredIntegrationKeys(input.env);
  const key = configuredKeys.get(keyId);
  if (!key || key.workerId !== workerId) {
    throw new ComicAiIntegrationHmacError(
      "comic_ai_hmac_key_unknown",
      "Comic AI integration worker key is unknown",
    );
  }

  const canonical = [
    "v1",
    input.method.toUpperCase(),
    input.pathWithQuery,
    workerId,
    keyId,
    timestamp,
    nonce,
    bodySha256,
  ].join("\n");
  const expectedSignature = `v1=${createHmac("sha256", key.secret).update(canonical).digest("base64url")}`;
  if (!constantTimeEqual(signature, expectedSignature)) {
    throw new ComicAiIntegrationHmacError(
      "comic_ai_hmac_signature_invalid",
      "Comic AI integration request signature is invalid",
    );
  }

  pruneReplayedNonces(now.getTime());
  const replayKey = `${workerId}:${keyId}:${nonce}`;
  if (replayedNonces.has(replayKey)) {
    throw new ComicAiIntegrationHmacError(
      "comic_ai_hmac_nonce_replayed",
      "Comic AI integration request nonce was already used",
      409,
    );
  }
  replayedNonces.set(replayKey, now.getTime() + nonceRetentionMs);

  return {
    workerId,
    keyId,
    nonce,
    keyFingerprint: createHash("sha256").update(key.secret).digest("hex"),
  };
}

export function signComicAiIntegrationRequest(input: {
  secret: string;
  method: string;
  pathWithQuery: string;
  workerId: string;
  keyId: string;
  timestamp: string;
  nonce: string;
  body: Buffer;
}) {
  const bodySha256 = createHash("sha256").update(input.body).digest("hex");
  const canonical = [
    "v1",
    input.method.toUpperCase(),
    input.pathWithQuery,
    input.workerId,
    input.keyId,
    input.timestamp,
    input.nonce,
    bodySha256,
  ].join("\n");
  return {
    bodySha256,
    signature: `v1=${createHmac("sha256", input.secret).update(canonical).digest("base64url")}`,
  };
}

function configuredIntegrationKeys(env: NodeJS.ProcessEnv) {
  const configured = (
    env.COMIC_AI_INTEGRATION_HMAC_KEYS_JSON?.trim() ||
    env.MARKETING_QIANFAN_HMAC_KEYS_JSON?.trim()
  );
  if (!configured) {
    throw new ComicAiIntegrationHmacError(
      "comic_ai_hmac_not_configured",
      "COMIC_AI_INTEGRATION_HMAC_KEYS_JSON is required",
      500,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(configured);
  } catch {
    throw new ComicAiIntegrationHmacError(
      "comic_ai_hmac_config_invalid",
      "COMIC_AI_INTEGRATION_HMAC_KEYS_JSON is invalid",
      500,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ComicAiIntegrationHmacError(
      "comic_ai_hmac_config_invalid",
      "COMIC_AI_INTEGRATION_HMAC_KEYS_JSON is invalid",
      500,
    );
  }

  const keys = new Map<string, ConfiguredKey>();
  for (const [keyId, value] of Object.entries(parsed)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    const workerId = typeof record.workerId === "string" ? record.workerId.trim() : "";
    const secret = typeof record.secret === "string" ? record.secret : "";
    if (workerId && secret) keys.set(keyId, { workerId, secret });
  }
  return keys;
}

function header(
  headers: Record<string, string | string[] | undefined>,
  names: string[],
) {
  for (const name of names) {
    const value = headers[name] ?? headers[name.toLowerCase()];
    const normalized = Array.isArray(value) ? value[0] : value;
    if (normalized?.trim()) return normalized.trim();
  }
  return "";
}

function constantTimeEqual(actual: string, expected: string) {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function pruneReplayedNonces(nowMs: number) {
  for (const [key, expiresAt] of replayedNonces) {
    if (expiresAt <= nowMs) replayedNonces.delete(key);
  }
  if (replayedNonces.size <= 10_000) return;
  const entries = [...replayedNonces.entries()].sort((left, right) => left[1] - right[1]);
  for (const [key] of entries.slice(0, Math.ceil(entries.length / 10))) {
    replayedNonces.delete(key);
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
