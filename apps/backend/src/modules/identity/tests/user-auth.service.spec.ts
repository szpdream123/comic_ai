import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SqlDatabase } from "../../shared/db/sql.ts";
import type {
  AuthSessionCache,
  CachedAuthIdentity,
} from "../auth-session-cache.service.ts";
import { createAuthSession } from "../session.service.ts";
import {
  createUserAuthService,
  readAuthSessionToken,
} from "../user-auth.service.ts";

const now = new Date("2026-07-22T08:00:00.000Z");

describe("user auth service", () => {
  it("checks the current team member row once when credit is excluded", async () => {
    const created = await createAuthSession({
      userId: "user-1",
      token: "token=value",
      now,
    });
    const cached: CachedAuthIdentity = {
      session: created.session,
      user: {
        id: "user-1",
        phone: "13800000001",
        displayName: "Owner",
        actorType: "team_member",
        teamMember: {
          id: "member-1",
          memberAccount: "member-account",
          memberLoginAccount: "member-login",
          memberName: "Member",
        },
      },
    };
    let queryCount = 0;
    const service = createUserAuthService({
      db: {
        async query<T = Record<string, unknown>>(sql: string) {
          queryCount += 1;
          assert.match(sql, /SELECT member_credits, status/);
          return { rows: [{ member_credits: "27", status: "active" }] as T[] };
        },
      },
      authSessionCache: cacheReturning(cached),
    });

    const authenticated = await service.resolveCookieHeader(
      "other=value; auth_session=token=value",
      { now, includeCredit: false },
    );

    assert.equal(authenticated?.sessionToken, "token=value");
    assert.equal(authenticated?.user.actorType, "team_member");
    assert.equal(authenticated?.user.teamMember?.memberCredits, 27);
    assert.equal(authenticated?.user.availableCredits, 0);
    assert.equal(authenticated?.user.reservedCredits, 0);
    assert.equal(queryCount, 1);
  });

  it("rejects a token denied by the cache without falling back to PostgreSQL", async () => {
    const service = createUserAuthService({
      db: rejectingDb(),
      authSessionCache: cacheReturning(null),
    });

    assert.equal(
      await service.resolveSessionToken("revoked-token", { now, includeCredit: false }),
      undefined,
    );
  });

  it("restores an owner from PostgreSQL and preserves the existing credit response", async () => {
    const created = await createAuthSession({ userId: "user-1", token: "token-1", now });
    const queries: string[] = [];
    let cachedIdentity: CachedAuthIdentity | undefined;
    const db: SqlDatabase = {
      async query<T = Record<string, unknown>>(sql: string) {
        queries.push(sql);
        if (sql.includes("FROM auth_sessions")) {
          return { rows: [{
            id: created.session.id,
            user_id: created.session.userId,
            status: created.session.status,
            session_token_hash: created.session.sessionTokenHash,
            session_token_hash_version: created.session.sessionTokenHashVersion,
            expires_at: created.session.expiresAt,
            last_seen_at: created.session.lastSeenAt,
            revoked_at: created.session.revokedAt,
          }] as T[] };
        }
        if (sql.includes("SELECT id, phone_e164, display_name, status FROM users")) {
          return { rows: [{
            id: "user-1",
            phone_e164: "13800000001",
            display_name: "Owner",
            status: "active",
          }] as T[] };
        }
        if (sql.includes("FROM team_member_auth_sessions")) {
          return { rows: [] };
        }
        if (sql.includes("credit_balance_cached")) {
          return { rows: [{
            credit_balance_cached: "120",
            credit_reserved_cached: "15",
            credit_frozen_cached: "8",
            credit_frozen_at: "2026-07-22T06:00:00.000Z",
            credit_frozen_until: null,
          }] as T[] };
        }
        throw new Error(`unexpected query: ${sql}`);
      },
    };
    const cache = cacheReturning(undefined);
    cache.set = async (_token, identity) => {
      cachedIdentity = identity;
    };
    const service = createUserAuthService({ db, authSessionCache: cache });

    const authenticated = await service.resolveSessionToken("token-1", { now });

    assert.equal(authenticated?.user.availableCredits, 120);
    assert.equal(authenticated?.user.displayCreditBalance, 120);
    assert.equal(authenticated?.user.reservedCredits, 15);
    assert.equal(authenticated?.user.frozenCredits, 8);
    assert.equal(authenticated?.user.creditFrozenAt, "2026-07-22T06:00:00.000Z");
    assert.equal(cachedIdentity?.user.id, "user-1");
    assert.equal(queries.length, 4);
  });

  it("rejects a disabled cached team member", async () => {
    const created = await createAuthSession({ userId: "user-1", token: "token-1", now });
    const cached: CachedAuthIdentity = {
      session: created.session,
      user: {
        id: "user-1",
        phone: null,
        actorType: "team_member",
        teamMember: {
          id: "member-1",
          memberAccount: "member-account",
          memberLoginAccount: "member-login",
          memberName: "Member",
        },
      },
    };
    let queryCount = 0;
    const db: SqlDatabase = {
      async query<T = Record<string, unknown>>(sql: string) {
        queryCount += 1;
        assert.match(sql, /SELECT member_credits, status/);
        return { rows: [{ member_credits: "31", status: "disabled" }] as T[] };
      },
    };
    const service = createUserAuthService({ db, authSessionCache: cacheReturning(cached) });

    const authenticated = await service.resolveSessionToken("token-1", {
      now,
      includeCredit: false,
    });

    assert.equal(queryCount, 1);
    assert.equal(authenticated, undefined);
  });

  it("uses the team member status query credit snapshot without querying credits twice", async () => {
    const created = await createAuthSession({ userId: "user-1", token: "token-1", now });
    const cached: CachedAuthIdentity = {
      session: created.session,
      user: {
        id: "user-1",
        phone: null,
        actorType: "team_member",
        teamMember: {
          id: "member-1",
          memberAccount: "member-account",
          memberLoginAccount: "member-login",
          memberName: "Member",
        },
      },
    };
    let queryCount = 0;
    const db: SqlDatabase = {
      async query<T = Record<string, unknown>>(sql: string) {
        queryCount += 1;
        assert.match(sql, /SELECT member_credits, status/);
        return { rows: [{ member_credits: "44", status: "active" }] as T[] };
      },
    };
    const service = createUserAuthService({ db, authSessionCache: cacheReturning(cached) });

    const authenticated = await service.resolveSessionToken("token-1", { now });

    assert.equal(queryCount, 1);
    assert.equal(authenticated?.user.availableCredits, 44);
    assert.equal(authenticated?.user.teamMember?.memberCredits, 44);
  });

  it("rejects a cached team member whose current member row no longer exists", async () => {
    const created = await createAuthSession({ userId: "user-1", token: "token-1", now });
    const cached: CachedAuthIdentity = {
      session: created.session,
      user: {
        id: "user-1",
        phone: null,
        actorType: "team_member",
        teamMember: {
          id: "member-1",
          memberAccount: "member-account",
          memberLoginAccount: "member-login",
          memberName: "Member",
        },
      },
    };
    const db: SqlDatabase = {
      async query<T = Record<string, unknown>>() {
        return { rows: [] as T[] };
      },
    };
    const service = createUserAuthService({ db, authSessionCache: cacheReturning(cached) });

    assert.equal(
      await service.resolveSessionToken("token-1", { now, includeCredit: false }),
      undefined,
    );
  });

  it("reads only the auth_session cookie and preserves equals signs", () => {
    assert.equal(readAuthSessionToken("foo=bar; auth_session=token=value; x=y"), "token=value");
    assert.equal(readAuthSessionToken("foo=bar"), undefined);
    assert.equal(readAuthSessionToken(undefined), undefined);
  });
});

function rejectingDb(): SqlDatabase {
  return {
    async query() {
      throw new Error("PostgreSQL must not be queried");
    },
  };
}

function cacheReturning(
  identity: CachedAuthIdentity | null | undefined,
): AuthSessionCache {
  return {
    async get() { return identity; },
    async set() {},
    async denySession() {},
    async invalidateSession() {},
    async blockUser() {},
    async blockMember() {},
    async invalidateUser() {},
    async invalidateMember() {},
    async close() {},
  };
}
