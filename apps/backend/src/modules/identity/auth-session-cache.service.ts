import Redis from "ioredis";

import { hashSecret } from "./phone-auth.utils.ts";
import type { AuthSession } from "./session.service.ts";

const cacheVersion = 1;
const defaultTtlSeconds = 300;

const readSessionIdentityScript = `
  local denied = redis.call('GET', KEYS[1])
  if denied then return { 1 } end

  local raw = redis.call('GET', KEYS[2])
  if not raw then return { 0 } end

  local decoded, envelope = pcall(cjson.decode, raw)
  if not decoded or type(envelope) ~= 'table' or type(envelope.user) ~= 'table' or not envelope.user.id then
    return { 3 }
  end

  if redis.call('GET', 'auth:block:user:v1:' .. envelope.user.id) then return { 1 } end

  local member = envelope.user.teamMember
  if type(member) == 'table' and member.id and redis.call('GET', 'auth:block:member:v1:' .. member.id) then return { 1 } end

  return { 2, raw }
`;

export interface CachedAuthIdentity {
  session: AuthSession;
  user: {
    id: string;
    phone: string | null;
    displayName?: string | null;
    actorType?: "user" | "team_member";
    teamMember?: {
      id: string;
      memberAccount: string;
      memberLoginAccount: string;
      memberName: string;
    } | null;
  };
}

interface CachedAuthIdentityEnvelope extends CachedAuthIdentity {
  version: number;
  tokenHash: string;
}

export interface AuthSessionCache {
  get(token: string, now: Date): Promise<CachedAuthIdentity | null | undefined>;
  set(token: string, identity: CachedAuthIdentity, now: Date): Promise<void>;
  denySession(token: string, expiresAt: Date, now: Date): Promise<void>;
  invalidateSession(token: string): Promise<void>;
  blockUser(userId: string, blocked: boolean): Promise<void>;
  blockMember(memberId: string, blocked: boolean): Promise<void>;
  invalidateUser(userId: string): Promise<void>;
  invalidateMember(memberId: string): Promise<void>;
  close(): Promise<void>;
}

interface RedisAuthCacheClient {
  get(key: string): Promise<string | null>;
  eval?(script: string, numberOfKeys: number, ...args: string[]): Promise<unknown>;
  set(key: string, value: string, ...args: Array<string | number>): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  expire(key: string, seconds: number): Promise<number>;
  quit?(): Promise<unknown>;
}

export function createAuthSessionCacheFromEnv(
  env: NodeJS.ProcessEnv,
): AuthSessionCache | undefined {
  const redisUrl = env.REDIS_URL?.trim();
  if (!redisUrl || env.AUTH_SESSION_REDIS_CACHE_ENABLED?.trim().toLowerCase() === "false") {
    return undefined;
  }

  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    connectTimeout: 500,
    commandTimeout: 500,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  redis.on("error", () => undefined);
  void redis.connect().catch(() => undefined);
  return createAuthSessionCache(redis);
}

export function createAuthSessionCache(
  redis: RedisAuthCacheClient,
  options: { ttlSeconds?: number } = {},
): AuthSessionCache {
  const configuredTtlSeconds = Math.max(1, Math.floor(options.ttlSeconds ?? defaultTtlSeconds));

  return {
    async get(token, now) {
      const tokenHash = hashSecret(token);
      try {
        const atomicResult = redis.eval
          ? parseAtomicSessionIdentityResult(await redis.eval(
              readSessionIdentityScript,
              2,
              denyKey(tokenHash),
              sessionKey(tokenHash),
            ))
          : undefined;
        if (atomicResult?.kind === "denied") {
          return null;
        }
        if (atomicResult?.kind === "missing") {
          return undefined;
        }
        if (atomicResult?.kind === "invalid") {
          await redis.del(sessionKey(tokenHash));
          return undefined;
        }
        if (atomicResult?.kind === "found") {
          const envelope = parseEnvelope(atomicResult.raw);
          if (!isValidEnvelope(envelope, tokenHash, now)) {
            await redis.del(sessionKey(tokenHash));
            return undefined;
          }
          return {
            session: envelope.session,
            user: envelope.user,
          };
        }

        const [denied, raw] = await Promise.all([
          redis.get(denyKey(tokenHash)),
          redis.get(sessionKey(tokenHash)),
        ]);
        if (denied) {
          return null;
        }
        if (!raw) {
          return undefined;
        }
        const envelope = parseEnvelope(raw);
        if (!isValidEnvelope(envelope, tokenHash, now)) {
          await redis.del(sessionKey(tokenHash));
          return undefined;
        }
        const memberId = envelope.user.teamMember?.id;
        const [userBlocked, memberBlocked] = await Promise.all([
          redis.get(userBlockKey(envelope.user.id)),
          memberId ? redis.get(memberBlockKey(memberId)) : Promise.resolve(null),
        ]);
        if (userBlocked || memberBlocked) {
          return null;
        }
        return {
          session: envelope.session,
          user: envelope.user,
        };
      } catch {
        return undefined;
      }
    },

    async set(token, identity, now) {
      const tokenHash = hashSecret(token);
      const ttlSeconds = ttlForExpiry(identity.session.expiresAt, now, configuredTtlSeconds);
      if (ttlSeconds <= 0 || identity.session.userId !== identity.user.id) {
        return;
      }
      const memberId = identity.user.teamMember?.id;
      try {
        const [denied, userBlocked, memberBlocked] = await Promise.all([
          redis.get(denyKey(tokenHash)),
          redis.get(userBlockKey(identity.user.id)),
          memberId ? redis.get(memberBlockKey(memberId)) : Promise.resolve(null),
        ]);
        if (denied || userBlocked || memberBlocked) {
          return;
        }
        const envelope: CachedAuthIdentityEnvelope = {
          version: cacheVersion,
          tokenHash,
          session: identity.session,
          user: identity.user,
        };
        await redis.set(sessionKey(tokenHash), JSON.stringify(envelope), "EX", ttlSeconds);
        await redis.sadd(userSessionsKey(identity.user.id), tokenHash);
        await redis.expire(userSessionsKey(identity.user.id), ttlSeconds);
        if (memberId) {
          await redis.sadd(memberSessionsKey(memberId), tokenHash);
          await redis.expire(memberSessionsKey(memberId), ttlSeconds);
        }
      } catch {
        // Redis is an optimization. PostgreSQL remains the authentication truth source.
      }
    },

    async denySession(token, expiresAt, now) {
      const tokenHash = hashSecret(token);
      const ttlSeconds = secondsUntilExpiry(expiresAt, now);
      try {
        await redis.set(denyKey(tokenHash), "1", "EX", Math.max(1, ttlSeconds));
        await redis.del(sessionKey(tokenHash));
      } catch {
        // The caller still revokes the PostgreSQL session.
      }
    },

    async invalidateSession(token) {
      try {
        await redis.del(sessionKey(hashSecret(token)));
      } catch {
        // Cache invalidation is best effort; short TTL limits stale identity data.
      }
    },

    async blockUser(userId, blocked) {
      await setBlock(redis, userBlockKey(userId), blocked, configuredTtlSeconds);
      if (blocked) {
        await invalidateIndex(redis, userSessionsKey(userId));
      }
    },

    async blockMember(memberId, blocked) {
      await setBlock(redis, memberBlockKey(memberId), blocked, configuredTtlSeconds);
      if (blocked) {
        await invalidateIndex(redis, memberSessionsKey(memberId));
      }
    },

    async invalidateUser(userId) {
      await invalidateIndex(redis, userSessionsKey(userId));
    },

    async invalidateMember(memberId) {
      await invalidateIndex(redis, memberSessionsKey(memberId));
    },

    async close() {
      try {
        await redis.quit?.();
      } catch {
        // Ignore shutdown errors.
      }
    },
  };
}

function parseAtomicSessionIdentityResult(value: unknown):
  | { kind: "missing" }
  | { kind: "denied" }
  | { kind: "found"; raw: string }
  | { kind: "invalid" }
  | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const kind = Number(value[0]);
  if (kind === 0) return { kind: "missing" };
  if (kind === 1) return { kind: "denied" };
  if (kind === 2 && typeof value[1] === "string") return { kind: "found", raw: value[1] };
  if (kind === 3) return { kind: "invalid" };
  return undefined;
}

function parseEnvelope(raw: string): CachedAuthIdentityEnvelope | undefined {
  try {
    const envelope = JSON.parse(raw) as CachedAuthIdentityEnvelope;
    if (envelope?.session) {
      envelope.session.expiresAt = new Date(envelope.session.expiresAt);
      envelope.session.lastSeenAt = envelope.session.lastSeenAt
        ? new Date(envelope.session.lastSeenAt)
        : null;
      envelope.session.revokedAt = envelope.session.revokedAt
        ? new Date(envelope.session.revokedAt)
        : null;
    }
    return envelope;
  } catch {
    return undefined;
  }
}

function isValidEnvelope(
  envelope: CachedAuthIdentityEnvelope | undefined,
  tokenHash: string,
  now: Date,
): envelope is CachedAuthIdentityEnvelope {
  return Boolean(
    envelope &&
    envelope.version === cacheVersion &&
    envelope.tokenHash === tokenHash &&
    envelope.session?.id &&
    envelope.session.userId === envelope.user?.id &&
    envelope.session.status === "active" &&
    new Date(envelope.session.expiresAt).getTime() > now.getTime(),
  );
}

function ttlForExpiry(expiresAt: Date, now: Date, maximum: number) {
  return Math.min(maximum, secondsUntilExpiry(expiresAt, now));
}

function secondsUntilExpiry(expiresAt: Date, now: Date) {
  return Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 1000);
}

async function setBlock(
  redis: RedisAuthCacheClient,
  key: string,
  blocked: boolean,
  ttlSeconds: number,
) {
  try {
    if (blocked) {
      await redis.set(key, "1", "EX", ttlSeconds);
    } else {
      await redis.del(key);
    }
  } catch {
    // PostgreSQL status checks remain authoritative on cache misses.
  }
}

async function invalidateIndex(redis: RedisAuthCacheClient, indexKey: string) {
  try {
    const tokenHashes = await redis.smembers(indexKey);
    if (tokenHashes.length) {
      await redis.del(...tokenHashes.map(sessionKey));
    }
    await redis.del(indexKey);
  } catch {
    // Best effort invalidation; block keys and TTL prevent durable stale sessions.
  }
}

function sessionKey(tokenHash: string) {
  return `auth:session:v1:${tokenHash}`;
}

function denyKey(tokenHash: string) {
  return `auth:deny:session:v1:${tokenHash}`;
}

function userSessionsKey(userId: string) {
  return `auth:user:sessions:v1:${userId}`;
}

function memberSessionsKey(memberId: string) {
  return `auth:member:sessions:v1:${memberId}`;
}

function userBlockKey(userId: string) {
  return `auth:block:user:v1:${userId}`;
}

function memberBlockKey(memberId: string) {
  return `auth:block:member:v1:${memberId}`;
}
