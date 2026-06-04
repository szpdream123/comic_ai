export interface RedisEvalClient {
  eval(
    script: string,
    keyCount: number,
    ...args: Array<string | number>
  ): Promise<unknown>;
}

export interface ProviderStageRateLimitInput {
  providerName: string;
  modelCode: string;
  organizationId: string;
  rpmLimit: number;
  providerConcurrentLimit: number;
  modelConcurrentLimit: number;
  tenantConcurrentLimit: number;
  leaseMs: number;
  now: Date;
}

export type ProviderSubmitRateLimitInput = ProviderStageRateLimitInput;
export type ProviderPollRateLimitInput = ProviderStageRateLimitInput;
export interface StorageFinalizeRateLimitInput {
  bucket: string;
  organizationId?: string | null;
  mediaType: "video" | "image";
  leaseMs: number;
  now: Date;
  rpmLimit?: number;
  storageConcurrentLimit?: number;
}

export type ProviderRateLimitGrant =
  | {
      granted: true;
      release(): Promise<void>;
    }
  | {
      granted: false;
      retryAfterMs: number;
      reason: string;
    };

export interface ProviderRateLimiter {
  acquireSubmitPermit(input: ProviderSubmitRateLimitInput): Promise<ProviderRateLimitGrant>;
  acquirePollPermit(input: ProviderPollRateLimitInput): Promise<ProviderRateLimitGrant>;
  acquireFinalizePermit(input: StorageFinalizeRateLimitInput): Promise<ProviderRateLimitGrant>;
}

const submitAcquireScript = `
local rpmWindowMs = tonumber(ARGV[1])
local leaseMs = tonumber(ARGV[2])
local providerRpmLimit = tonumber(ARGV[3])
local modelRpmLimit = tonumber(ARGV[4])
local tenantRpmLimit = tonumber(ARGV[5])
local providerConcurrentLimit = tonumber(ARGV[6])
local modelConcurrentLimit = tonumber(ARGV[7])
local tenantConcurrentLimit = tonumber(ARGV[8])

local rpmKeys = { KEYS[1], KEYS[2], KEYS[3] }
local rpmLimits = { providerRpmLimit, modelRpmLimit, tenantRpmLimit }
for i = 1, 3 do
  local current = tonumber(redis.call("GET", rpmKeys[i]) or "0")
  if current >= rpmLimits[i] then
    local ttl = redis.call("PTTL", rpmKeys[i])
    if ttl < 0 then ttl = rpmWindowMs end
    return { 0, ttl, rpmKeys[i] }
  end
end

local concurrencyKeys = { KEYS[4], KEYS[5], KEYS[6] }
local concurrencyLimits = { providerConcurrentLimit, modelConcurrentLimit, tenantConcurrentLimit }
for i = 1, 3 do
  local current = tonumber(redis.call("GET", concurrencyKeys[i]) or "0")
  if current >= concurrencyLimits[i] then
    local ttl = redis.call("PTTL", concurrencyKeys[i])
    if ttl < 0 then ttl = leaseMs end
    return { 0, ttl, concurrencyKeys[i] }
  end
end

for i = 1, 3 do
  local current = redis.call("INCR", rpmKeys[i])
  if current == 1 then
    redis.call("PEXPIRE", rpmKeys[i], rpmWindowMs)
  end
end

for i = 1, 3 do
  redis.call("INCR", concurrencyKeys[i])
  redis.call("PEXPIRE", concurrencyKeys[i], leaseMs)
end

return { 1, 0, "granted" }
`;

const releaseConcurrencyScript = `
for i = 1, #KEYS do
  local current = tonumber(redis.call("GET", KEYS[i]) or "0")
  if current <= 1 then
    redis.call("DEL", KEYS[i])
  else
    redis.call("DECR", KEYS[i])
  end
end
return 1
`;

export function createRedisProviderRateLimiter(
  client: RedisEvalClient,
  options: { keyPrefix: string },
): ProviderRateLimiter {
  const keyPrefix = normalizeKeyPart(options.keyPrefix || "comic-ai");

  return {
    async acquireSubmitPermit(input) {
      return acquireStagePermit(client, keyPrefix, "submit", input);
    },
    async acquirePollPermit(input) {
      return acquireStagePermit(client, keyPrefix, "poll", input);
    },
    async acquireFinalizePermit(input) {
      return acquireStorageFinalizePermit(client, keyPrefix, input);
    },
  };
}

async function acquireStorageFinalizePermit(
  client: RedisEvalClient,
  keyPrefix: string,
  input: StorageFinalizeRateLimitInput,
): Promise<ProviderRateLimitGrant> {
  const keys = buildStorageFinalizeKeys(keyPrefix, input);
  const result = await client.eval(
    submitAcquireScript,
    keys.length,
    ...keys,
    60_000,
    clampPositiveInteger(input.leaseMs, 120_000),
    clampPositiveInteger(input.rpmLimit ?? 120, 120),
    clampPositiveInteger(input.rpmLimit ?? 120, 120),
    clampPositiveInteger(input.rpmLimit ?? 120, 120),
    clampPositiveInteger(input.storageConcurrentLimit ?? 3, 3),
    clampPositiveInteger(input.storageConcurrentLimit ?? 3, 3),
    clampPositiveInteger(input.storageConcurrentLimit ?? 3, 3),
  );
  const parsed = parseEvalTuple(result);
  if (parsed.granted) {
    const concurrencyKeys = keys.slice(3);
    return {
      granted: true,
      async release() {
        await client.eval(releaseConcurrencyScript, concurrencyKeys.length, ...concurrencyKeys);
      },
    };
  }

  return parsed;
}

async function acquireStagePermit(
  client: RedisEvalClient,
  keyPrefix: string,
  stage: "submit" | "poll",
  input: ProviderStageRateLimitInput,
): Promise<ProviderRateLimitGrant> {
  const keys = buildStageKeys(keyPrefix, stage, input);
  const result = await client.eval(
    submitAcquireScript,
    keys.length,
    ...keys,
    60_000,
    clampPositiveInteger(input.leaseMs, 120_000),
    clampPositiveInteger(input.rpmLimit, 1),
    clampPositiveInteger(input.rpmLimit, 1),
    clampPositiveInteger(input.rpmLimit, 1),
    clampPositiveInteger(input.providerConcurrentLimit, 1),
    clampPositiveInteger(input.modelConcurrentLimit, 1),
    clampPositiveInteger(input.tenantConcurrentLimit, 1),
  );
  const parsed = parseEvalTuple(result);
  if (parsed.granted) {
    const concurrencyKeys = keys.slice(3);
    return {
      granted: true,
      async release() {
        await client.eval(releaseConcurrencyScript, concurrencyKeys.length, ...concurrencyKeys);
      },
    };
  }

  return parsed;
}

function buildStageKeys(keyPrefix: string, stage: "submit" | "poll", input: ProviderStageRateLimitInput) {
  const providerName = normalizeKeyPart(input.providerName);
  const modelCode = normalizeKeyPart(input.modelCode);
  const organizationId = normalizeKeyPart(input.organizationId);
  return [
    `${keyPrefix}:rate:provider:${providerName}:${stage}:rpm`,
    `${keyPrefix}:rate:model:${modelCode}:${stage}:rpm`,
    `${keyPrefix}:rate:tenant:${organizationId}:${stage}:rpm`,
    `${keyPrefix}:concurrency:provider:${providerName}:${stage}`,
    `${keyPrefix}:concurrency:model:${modelCode}:${stage}`,
    `${keyPrefix}:concurrency:tenant:${organizationId}:${stage}`,
  ];
}

function buildStorageFinalizeKeys(keyPrefix: string, input: StorageFinalizeRateLimitInput) {
  const bucket = normalizeKeyPart(input.bucket);
  const mediaType = normalizeKeyPart(input.mediaType);
  const organizationId = normalizeKeyPart(input.organizationId ?? "unknown");
  return [
    `${keyPrefix}:rate:storage:${bucket}:finalize`,
    `${keyPrefix}:rate:storage:${bucket}:${mediaType}:finalize`,
    `${keyPrefix}:rate:tenant:${organizationId}:finalize`,
    `${keyPrefix}:concurrency:storage:${bucket}:finalize`,
    `${keyPrefix}:concurrency:storage:${bucket}:${mediaType}:finalize`,
    `${keyPrefix}:concurrency:tenant:${organizationId}:finalize`,
  ];
}

function parseEvalTuple(result: unknown): ProviderRateLimitGrant {
  const tuple = Array.isArray(result) ? result : [];
  const granted = Number(tuple[0] ?? 0) === 1;
  if (granted) {
    return {
      granted: true,
      async release() {},
    };
  }

  return {
    granted: false,
    retryAfterMs: Math.max(1000, Number(tuple[1] ?? 1000)),
    reason: String(tuple[2] ?? "provider_rate_limited"),
  };
}

function normalizeKeyPart(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9:_-]+/g, "_").replace(/:+$/g, "") || "unknown";
}

function clampPositiveInteger(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
