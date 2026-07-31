import { setTimeout as sleep } from "node:timers/promises";

interface RedisReadinessClient {
  status?: string;
  once(event: "ready" | "end" | "error", listener: (error?: unknown) => void): unknown;
  removeListener(event: "ready" | "end" | "error", listener: (error?: unknown) => void): unknown;
}

const retryableRedisCodes = new Set([
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "NR_CLOSED",
  "REDIS_READY_TIMEOUT",
]);

const fatalRedisCodes = new Set([
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

export function isRetryableRedisAvailabilityError(error: unknown) {
  const code = errorCode(error);
  const message = errorMessage(error).toLowerCase();
  return retryableRedisCodes.has(code)
    || message.includes("stream isn't writeable")
    || message.includes("command timed out")
    || message.includes("connection is closed")
    || message.includes("connection timeout");
}

export function isFatalRedisConnectionError(error: unknown) {
  const code = errorCode(error);
  const message = errorMessage(error).toLowerCase();
  return fatalRedisCodes.has(code)
    || message.includes("wrongpass")
    || message.includes("noauth")
    || message.includes("noperm")
    || message.includes("invalid username-password")
    || message.includes("auth failed");
}

export async function waitForRedisReady(
  redis: RedisReadinessClient,
  options: { timeoutMs: number; signal?: AbortSignal },
) {
  if (redis.status === "ready") return;
  const timeoutMs = positiveTimeout(options.timeoutMs);
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      redis.removeListener("ready", onReady);
      redis.removeListener("end", onEnd);
      redis.removeListener("error", onError);
      options.signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve();
    };
    const onReady = () => finish();
    const onEnd = () => finish(redisError("NR_CLOSED", "Redis connection ended before ready"));
    const onError = (error?: unknown) => {
      if (isFatalRedisConnectionError(error)) finish(error);
    };
    const onAbort = () => finish(options.signal?.reason ?? new Error("redis_ready_aborted"));
    const timer = setTimeout(
      () => finish(redisError("REDIS_READY_TIMEOUT", `Redis was not ready within ${timeoutMs}ms`)),
      timeoutMs,
    );
    timer.unref?.();
    redis.once("ready", onReady);
    redis.once("end", onEnd);
    redis.once("error", onError);
    options.signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function runWithRedisStartupRetry<T>(input: {
  redis: RedisReadinessClient;
  run(): Promise<T>;
  timeoutMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  signal?: AbortSignal;
}): Promise<T> {
  const timeoutMs = positiveTimeout(input.timeoutMs ?? 10_000);
  const maxAttempts = positiveInteger(input.maxAttempts ?? 3);
  const baseDelayMs = positiveTimeout(input.baseDelayMs ?? 250);
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await waitForRedisReady(input.redis, {
        timeoutMs: remainingMs(deadline),
        signal: input.signal,
      });
      return await input.run();
    } catch (error) {
      if (isFatalRedisConnectionError(error) || !isRetryableRedisAvailabilityError(error)) {
        throw error;
      }
      lastError = error;
      if (attempt >= maxAttempts || Date.now() >= deadline) break;
      await sleep(
        Math.min(baseDelayMs * (2 ** (attempt - 1)), remainingMs(deadline)),
        undefined,
        { signal: input.signal },
      );
    }
  }

  throw lastError ?? redisError("REDIS_READY_TIMEOUT", "Redis startup retry exhausted");
}

function errorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "");
}

function redisError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

function remainingMs(deadline: number) {
  return Math.max(1, deadline - Date.now());
}

function positiveInteger(value: number) {
  const normalized = Math.floor(Number(value));
  if (!Number.isSafeInteger(normalized) || normalized < 1) {
    throw new Error("redis_startup_retry_attempts_invalid");
  }
  return normalized;
}

function positiveTimeout(value: number) {
  const normalized = Math.floor(Number(value));
  if (!Number.isSafeInteger(normalized) || normalized < 1) {
    throw new Error("redis_startup_retry_timeout_invalid");
  }
  return normalized;
}
