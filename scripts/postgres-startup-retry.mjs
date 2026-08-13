import { setTimeout as sleep } from "node:timers/promises";

import { Client } from "pg";

const retryablePostgresStartupCodes = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
]);

export async function connectPostgresClientWithRetry(input) {
  const connectionString = input.connectionString?.trim();
  if (!connectionString) {
    throw new Error(`${input.envKey ?? "DATABASE_URL"} is required`);
  }

  const envKey = input.envKey ?? "DATABASE_URL";
  const serviceName = input.serviceName ?? "runtime";
  const maxAttempts = positiveInteger(input.maxAttempts ?? 3, "postgres_startup_retry_attempts_invalid");
  const baseDelayMs = positiveInteger(input.baseDelayMs ?? 500, "postgres_startup_retry_delay_invalid");
  const connectionTimeoutMillis = configuredConnectionTimeout(input.env ?? process.env);
  const createClient = input.createClient ?? ((options) => new Client(options));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const client = createClient({ connectionString, connectionTimeoutMillis });
    try {
      await client.connect();
      return client;
    } catch (error) {
      await client.end().catch(() => undefined);
      if (attempt >= maxAttempts || !isRetryablePostgresStartupError(error)) {
        throw new Error(
          `${serviceName} PostgreSQL connection failed for ${envKey}: ${safeError(error)}`,
          { cause: error },
        );
      }
      const delayMs = baseDelayMs * attempt;
      console.warn(
        `[${serviceName}] PostgreSQL connection failed for ${envKey}; retrying in ${delayMs}ms `
        + `(attempt ${attempt + 1}/${maxAttempts}).`,
      );
      await sleep(delayMs);
    }
  }

  throw new Error(`${serviceName} PostgreSQL connection failed for ${envKey}: startup retry limit reached`);
}

export function isRetryablePostgresStartupError(error) {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message : String(error ?? "");
  return retryablePostgresStartupCodes.has(code)
    || /\b(?:ECONNABORTED|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT)\b/i.test(message)
    || /connection terminated(?: unexpectedly| due to connection timeout)/i.test(message);
}

function configuredConnectionTimeout(env) {
  const rawValue = env.DATABASE_POOL_CONNECTION_TIMEOUT_MS?.trim() ?? "5000";
  const value = Number(rawValue);
  if (!/^\d+$/.test(rawValue) || !Number.isSafeInteger(value) || value < 1 || value > 60_000) {
    throw new Error("DATABASE_POOL_CONNECTION_TIMEOUT_MS must be an integer between 1 and 60000");
  }
  return value;
}

function errorCode(error) {
  return error && typeof error === "object" && "code" in error
    ? String(error.code ?? "")
    : "";
}

function safeError(error) {
  const code = errorCode(error);
  return code || (error instanceof Error ? error.name : "POSTGRES_CONNECTION_ERROR");
}

function positiveInteger(value, errorCodeValue) {
  const normalized = Math.floor(Number(value));
  if (!Number.isSafeInteger(normalized) || normalized < 1) {
    throw new Error(errorCodeValue);
  }
  return normalized;
}
