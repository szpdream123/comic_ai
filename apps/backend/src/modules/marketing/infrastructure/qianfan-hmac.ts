import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { SqlDatabase } from "../../shared/db/sql.ts";

export class QianFanHmacError extends Error {
  constructor(readonly code: string, message: string, readonly status: 401 | 409 | 500 = 401) {
    super(message);
  }
}

type ConfiguredKey = { workerId: string; secret: string };

const nonceCleanupStates = new WeakMap<SqlDatabase, {
  nextRunAtMs: number;
  pending: Promise<void> | null;
}>();

export type VerifiedQianFanRequest = {
  workerId: string;
  keyId: string;
  keyFingerprint: string;
};

export async function verifyQianFanHmac(input: {
  db: SqlDatabase;
  env: NodeJS.ProcessEnv;
  method: string;
  pathWithQuery: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  now?: Date;
}): Promise<VerifiedQianFanRequest> {
  const version = header(input.headers, "x-marketing-version");
  const workerId = header(input.headers, "x-marketing-worker-id");
  const keyId = header(input.headers, "x-marketing-key-id");
  const timestamp = header(input.headers, "x-marketing-timestamp");
  const nonce = header(input.headers, "x-marketing-nonce");
  const bodySha256 = header(input.headers, "x-marketing-content-sha256");
  const signature = header(input.headers, "x-marketing-signature");
  if (version !== "v1" || !workerId || !keyId || !timestamp || !nonce || !bodySha256 || !signature) {
    throw new QianFanHmacError("marketing_hmac_headers_invalid", "Required marketing signature headers are missing");
  }
  const timestampMs = Number(timestamp);
  const now = input.now ?? new Date();
  if (!Number.isSafeInteger(timestampMs) || Math.abs(now.getTime() - timestampMs) > 5 * 60 * 1000) {
    throw new QianFanHmacError("marketing_hmac_timestamp_invalid", "Marketing request timestamp is outside the allowed window");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nonce)) {
    throw new QianFanHmacError("marketing_hmac_nonce_invalid", "Marketing request nonce is invalid");
  }
  const actualBodyHash = createHash("sha256").update(input.body).digest("hex");
  if (!equal(bodySha256, actualBodyHash)) {
    throw new QianFanHmacError("marketing_hmac_body_hash_invalid", "Marketing request body hash is invalid");
  }
  const configuredKeys = configuredQianFanKeys(input.env);
  const key = configuredKeys.get(keyId);
  if (!key || key.workerId !== workerId) {
    throw new QianFanHmacError("marketing_hmac_key_unknown", "Marketing worker key is unknown");
  }
  const canonical = ["v1", input.method.toUpperCase(), input.pathWithQuery, workerId, keyId, timestamp, nonce, bodySha256].join("\n");
  const expectedSignature = `v1=${createHmac("sha256", key.secret).update(canonical).digest("base64url")}`;
  if (!equal(signature, expectedSignature)) {
    throw new QianFanHmacError("marketing_hmac_signature_invalid", "Marketing request signature is invalid");
  }
  const keyState = await input.db.query<{ status: string; valid_until: Date | null }>(
    `SELECT key.status, key.valid_until
     FROM marketing_executors AS executor
     JOIN marketing_executor_keys AS key ON key.executor_id = executor.id
     WHERE executor.worker_id = $1 AND key.key_id = $2`,
    [workerId, keyId],
  );
  if (keyState.rows[0]
    && (keyState.rows[0].status !== "active" || (keyState.rows[0].valid_until && keyState.rows[0].valid_until <= now))) {
    throw new QianFanHmacError("marketing_hmac_key_retired", "Marketing worker key is retired or expired");
  }

  await cleanupExpiredNoncesIfDue(input.db, now);
  try {
    await input.db.query(
      `INSERT INTO marketing_request_nonces (worker_id, key_id, nonce, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [workerId, keyId, nonce, new Date(now.getTime() + 10 * 60 * 1000)],
    );
  } catch (error) {
    if (postgresUniqueViolation(error)) {
      throw new QianFanHmacError("marketing_hmac_nonce_replayed", "Marketing request nonce was already used", 409);
    }
    throw error;
  }
  return { workerId, keyId, keyFingerprint: createHash("sha256").update(key.secret).digest("hex") };
}

async function cleanupExpiredNoncesIfDue(db: SqlDatabase, now: Date) {
  let state = nonceCleanupStates.get(db);
  if (!state) {
    state = { nextRunAtMs: 0, pending: null };
    nonceCleanupStates.set(db, state);
  }
  if (state.pending) {
    await state.pending;
    return;
  }
  if (now.getTime() < state.nextRunAtMs) return;
  state.nextRunAtMs = now.getTime() + 60_000;
  const pending = db.query("DELETE FROM marketing_request_nonces WHERE expires_at <= $1", [now])
    .then(() => undefined)
    .catch((error) => {
      state!.nextRunAtMs = 0;
      throw error;
    })
    .finally(() => {
      if (state?.pending === pending) state.pending = null;
    });
  state.pending = pending;
  await pending;
}

export function signQianFanV1Request(input: {
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
  const canonical = ["v1", input.method.toUpperCase(), input.pathWithQuery, input.workerId, input.keyId, input.timestamp, input.nonce, bodySha256].join("\n");
  return {
    bodySha256,
    signature: `v1=${createHmac("sha256", input.secret).update(canonical).digest("base64url")}`,
  };
}

function configuredQianFanKeys(env: NodeJS.ProcessEnv) {
  const configured = env.MARKETING_QIANFAN_HMAC_KEYS_JSON?.trim();
  if (!configured) {
    throw new QianFanHmacError("marketing_hmac_not_configured", "MARKETING_QIANFAN_HMAC_KEYS_JSON is required", 500);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(configured);
  } catch {
    throw new QianFanHmacError("marketing_hmac_config_invalid", "MARKETING_QIANFAN_HMAC_KEYS_JSON is invalid", 500);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new QianFanHmacError("marketing_hmac_config_invalid", "MARKETING_QIANFAN_HMAC_KEYS_JSON is invalid", 500);
  }
  const keys = new Map<string, ConfiguredKey>();
  for (const [keyId, value] of Object.entries(parsed)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const workerId = (value as Record<string, unknown>).workerId;
    const secret = (value as Record<string, unknown>).secret;
    if (typeof workerId === "string" && workerId && typeof secret === "string" && secret) {
      keys.set(keyId, { workerId, secret });
    }
  }
  return keys;
}

function header(headers: Record<string, string | string[] | undefined>, name: string) {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function equal(actual: string, expected: string) {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function postgresUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "23505");
}
