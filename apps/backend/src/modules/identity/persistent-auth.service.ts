import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import { createLoginChallenge, verifyLoginChallengeCode } from "./login-challenge.service.ts";
import type { LoginChallenge, VerifyLoginChallengeResult } from "./phone-auth.types.ts";
import {
  hashRequestMetadata,
  hashSecret,
  normalizeCnPhone,
  shanghaiDayWindow,
} from "./phone-auth.utils.ts";
import {
  createAuthSession,
  type AuthSession,
  verifySessionToken,
} from "./session.service.ts";
import type { SmsProvider } from "./sms-provider.ts";
import {
  createUserPasswordHash,
  defaultPasswordFromPhone,
  verifyTeamCredential,
} from "./team-account-credentials.service.ts";

const rememberedSessionTtlMs = 30 * 24 * 60 * 60 * 1000;
const transientSessionTtlMs = 24 * 60 * 60 * 1000;

export function sessionTtlMsForRemember(remember = true): number {
  return remember ? rememberedSessionTtlMs : transientSessionTtlMs;
}

interface LoginChallengeRow {
  id: string;
  phone_e164: string;
  code_hash: string;
  code_hash_version: number;
  status: LoginChallenge["status"];
  attempt_count: number;
  max_attempts: number;
  expires_at: Date;
  last_sent_at: Date;
  consumed_at: Date | null;
  revoked_at: Date | null;
}

interface UserRow {
  id: string;
  phone_e164: string;
  status: "active" | "disabled";
  password_hash?: string | null;
}

interface AuthSessionRow {
  id: string;
  user_id: string;
  status: AuthSession["status"];
  session_token_hash: string;
  session_token_hash_version: number;
  expires_at: Date;
  last_seen_at: Date | null;
  revoked_at: Date | null;
}

export type PersistentLoginVerifyResult =
  | (Extract<VerifyLoginChallengeResult, { kind: "verified" }> & {
      user: { id: string; phone: string };
      session: AuthSession;
      token: string;
    })
  | Exclude<VerifyLoginChallengeResult, { kind: "verified" }>
  | { kind: "challenge_not_found" }
  | { kind: "user_disabled"; challenge: LoginChallenge };

export type PersistentLoginCodeRequestResult =
  | {
      kind: "sent";
      challengeId: string;
      phoneE164: string;
      plainCode: string;
      expiresAt: Date;
      retryAfterSeconds: number;
      remainingToday: number;
    }
  | { kind: "sms_cooldown_active"; retryAfterSeconds: number }
  | { kind: "daily_sms_limit_exceeded"; retryAfterSeconds: 0 }
  | { kind: "sms_send_failed"; errorCode: string };

export type PersistentPasswordLoginResult =
  | {
      kind: "verified";
      user: { id: string; phone: string };
      session: AuthSession;
      token: string;
    }
  | { kind: "invalid_credentials" }
  | { kind: "user_disabled" };

export async function requestPersistentLoginCode(
  db: SqlDatabase,
  input: {
    phone: string;
    now: Date;
    ipAddress?: string;
    userAgent?: string;
    code?: string;
    smsProvider: SmsProvider;
  },
): Promise<PersistentLoginCodeRequestResult> {
  const phoneE164 = normalizeCnPhone(input.phone);
  const day = shanghaiDayWindow(input.now);
  const sentToday = await queryOne<{ count: number }>(
    db,
    `
      SELECT count(*)::int AS count
      FROM sms_send_records
      WHERE phone_e164 = $1
        AND status = 'sent'
        AND created_at >= $2
        AND created_at < $3
    `,
    [phoneE164, day.start, day.end],
  );

  if ((sentToday?.count ?? 0) >= 3) {
    await recordSmsSend(db, {
      phoneE164,
      provider: input.smsProvider.providerName,
      status: "rate_limited",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      errorCode: "daily_sms_limit_exceeded",
      now: input.now,
    });
    return { kind: "daily_sms_limit_exceeded", retryAfterSeconds: 0 };
  }

  const latestSent = await queryOne<{ created_at: Date }>(
    db,
    `
      SELECT created_at
      FROM sms_send_records
      WHERE phone_e164 = $1
        AND status = 'sent'
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [phoneE164],
  );

  if (latestSent) {
    const elapsedSeconds = Math.floor(
      (input.now.getTime() - latestSent.created_at.getTime()) / 1000,
    );
    if (elapsedSeconds < 60) {
      const retryAfterSeconds = 60 - elapsedSeconds;
      await recordSmsSend(db, {
        phoneE164,
        provider: input.smsProvider.providerName,
        status: "rate_limited",
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        errorCode: "sms_cooldown_active",
        now: input.now,
      });
      return { kind: "sms_cooldown_active", retryAfterSeconds };
    }
  }

  const challenge = await createPersistentLoginChallenge(db, {
    phone: input.phone,
    now: input.now,
    code: input.code,
  });
  const sent = await input.smsProvider.sendVerificationCode({
    phoneE164: challenge.phoneE164,
    code: challenge.plainCode,
    expiresInMinutes: 5,
  });

  if (sent.kind === "failed") {
    await db.query(
      `
        UPDATE login_challenges
        SET status = 'revoked',
            revoked_at = $2,
            updated_at = $2
        WHERE id = $1
      `,
      [challenge.challengeId, input.now],
    );
    await recordSmsSend(db, {
      phoneE164,
      challengeId: challenge.challengeId,
      provider: input.smsProvider.providerName,
      status: "failed",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      errorCode: sent.errorCode,
      now: input.now,
    });
    return { kind: "sms_send_failed", errorCode: sent.errorCode };
  }

  await recordSmsSend(db, {
    phoneE164,
    challengeId: challenge.challengeId,
    provider: input.smsProvider.providerName,
    status: "sent",
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    providerRequestId: sent.providerRequestId,
    now: input.now,
  });

  return {
    kind: "sent",
    challengeId: challenge.challengeId,
    phoneE164: challenge.phoneE164,
    plainCode: challenge.plainCode,
    expiresAt: challenge.expiresAt,
    retryAfterSeconds: 60,
    remainingToday: Math.max(0, 3 - ((sentToday?.count ?? 0) + 1)),
  };
}

export async function createPersistentLoginChallenge(
  db: SqlDatabase,
  input: {
    phone: string;
    now: Date;
    code?: string;
    maxAttempts?: number;
  },
): Promise<{
  challengeId: string;
  phoneE164: string;
  plainCode: string;
  expiresAt: Date;
}> {
  const challenge = await createLoginChallenge(input);

  await db.query(
    `
      INSERT INTO login_challenges (
        id,
        phone_e164,
        code_hash,
        code_hash_version,
        status,
        attempt_count,
        max_attempts,
        expires_at,
        last_sent_at,
        consumed_at,
        revoked_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    [
      challenge.id,
      challenge.phoneE164,
      challenge.codeHash,
      challenge.codeHashVersion,
      challenge.status,
      challenge.attemptCount,
      challenge.maxAttempts,
      challenge.expiresAt,
      challenge.lastSentAt,
      challenge.consumedAt,
      challenge.revokedAt,
    ],
  );

  return {
    challengeId: challenge.id,
    phoneE164: challenge.phoneE164,
    plainCode: challenge.plainCode ?? "",
    expiresAt: challenge.expiresAt,
  };
}

export async function verifyPersistentLoginChallenge(
  db: SqlDatabase,
  input: {
    challengeId: string;
    phone: string;
    code: string;
    now: Date;
    remember?: boolean;
  },
): Promise<PersistentLoginVerifyResult> {
  const phone = normalizeCnPhone(input.phone);

  await db.query("BEGIN");
  try {
    const row = await queryOne<LoginChallengeRow>(
      db,
      "SELECT * FROM login_challenges WHERE id = $1",
      [input.challengeId],
    );

    if (!row) {
      await db.query("ROLLBACK");
      return { kind: "challenge_not_found" };
    }

    const challenge = challengeFromRow(row);
    const result = verifyLoginChallengeCode({
      challenge,
      phone: input.phone,
      code: input.code,
      now: input.now,
    });

    if (result.kind !== "verified") {
      await saveChallengeResult(db, result.challenge, input.now);
      await db.query("COMMIT");
      return result;
    }

    const consumed = await consumeIssuedChallenge(db, {
      challengeId: input.challengeId,
      phoneE164: phone,
      codeHash: result.challenge.codeHash,
      now: input.now,
    });

    if (!consumed) {
      const current = await queryOne<LoginChallengeRow>(
        db,
        "SELECT * FROM login_challenges WHERE id = $1",
        [input.challengeId],
      );
      await db.query("COMMIT");
      return classifyUnconsumedChallenge(current);
    }

    const user = await findOrCreateUserByPhone(db, phone);

    if (user.status !== "active") {
      await db.query("COMMIT");
      return {
        kind: "user_disabled",
        challenge: consumed,
      };
    }

    const createdSession = await createAuthSession({
      userId: user.id,
      now: input.now,
      ttlMs: sessionTtlMsForRemember(input.remember),
    });

    await db.query(
      `
        INSERT INTO auth_sessions (
          id,
          user_id,
          status,
          session_token_hash,
          session_token_hash_version,
          expires_at,
          last_seen_at,
          revoked_at,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        createdSession.session.id,
        createdSession.session.userId,
        createdSession.session.status,
        createdSession.session.sessionTokenHash,
        createdSession.session.sessionTokenHashVersion,
        createdSession.session.expiresAt,
        createdSession.session.lastSeenAt,
        createdSession.session.revokedAt,
        input.now,
      ],
    );

    await db.query("COMMIT");
    return {
      ...result,
      challenge: consumed,
      user: {
        id: user.id,
        phone: user.phone_e164,
      },
      session: createdSession.session,
      token: createdSession.token,
    };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

export async function verifyPersistentPasswordLogin(
  db: SqlDatabase,
  input: {
    account: string;
    password: string;
    now: Date;
    remember?: boolean;
  },
): Promise<PersistentPasswordLoginResult> {
  const phone = normalizeCnPhone(input.account);
  const user = await queryOne<UserRow>(
    db,
    `
      SELECT id, phone_e164, status, password_hash
      FROM users
      WHERE phone_e164 = $1
      LIMIT 1
    `,
    [phone],
  );

  if (!user) {
    return { kind: "invalid_credentials" };
  }

  if (user.status !== "active") {
    return { kind: "user_disabled" };
  }

  if (!user.password_hash) {
    if (input.password !== defaultPasswordFromPhone(phone)) {
      return { kind: "invalid_credentials" };
    }

    user.password_hash = await createUserPasswordHash(input.password);
    await db.query(
      `
        UPDATE users
        SET password_hash = $2,
            updated_at = $3
        WHERE id = $1
          AND password_hash IS NULL
      `,
      [user.id, user.password_hash, input.now],
    );
  }

  const validPassword = await verifyTeamCredential({
    password: input.password,
    passwordHash: user.password_hash,
  });

  if (!validPassword) {
    return { kind: "invalid_credentials" };
  }

  const createdSession = await createAuthSession({
    userId: user.id,
    now: input.now,
    ttlMs: sessionTtlMsForRemember(input.remember),
  });

  await db.query(
    `
      INSERT INTO auth_sessions (
        id,
        user_id,
        status,
        session_token_hash,
        session_token_hash_version,
        expires_at,
        last_seen_at,
        revoked_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      createdSession.session.id,
      createdSession.session.userId,
      createdSession.session.status,
      createdSession.session.sessionTokenHash,
      createdSession.session.sessionTokenHashVersion,
      createdSession.session.expiresAt,
      createdSession.session.lastSeenAt,
      createdSession.session.revokedAt,
      input.now,
    ],
  );

  await db.query(
    `
      UPDATE users
      SET last_login_at = $2,
          updated_at = $2
      WHERE id = $1
    `,
    [user.id, input.now],
  );

  return {
    kind: "verified",
    user: {
      id: user.id,
      phone: user.phone_e164,
    },
    session: createdSession.session,
    token: createdSession.token,
  };
}

export async function findPersistentAuthSessionByToken(
  db: SqlDatabase,
  input: {
    token: string;
    now: Date;
  },
): Promise<AuthSession | undefined> {
  const row = await queryOne<AuthSessionRow>(
    db,
    `
      SELECT *
      FROM auth_sessions
      WHERE session_token_hash = $1
        AND status = 'active'
      LIMIT 1
    `,
    [hashSecret(input.token)],
  );

  if (!row) {
    return undefined;
  }

  const session = sessionFromRow(row);
  return verifySessionToken(session, input.token, input.now) ? session : undefined;
}

export async function revokePersistentAuthSession(
  db: SqlDatabase,
  input: {
    token: string;
    now: Date;
  },
): Promise<boolean> {
  const session = await findPersistentAuthSessionByToken(db, input);
  if (!session) {
    return false;
  }

  await db.query(
    `
      UPDATE auth_sessions
      SET status = 'revoked',
          revoked_at = $2
      WHERE id = $1
    `,
    [session.id, input.now],
  );
  return true;
}

export async function expireIssuedLoginChallenges(
  db: SqlDatabase,
  now: Date,
): Promise<number> {
  const result = await db.query(
    `
      UPDATE login_challenges
      SET status = 'expired',
          updated_at = $1
      WHERE status = 'issued'
        AND expires_at <= $1
    `,
    [now],
  );

  return "affectedRows" in result ? Number(result.affectedRows) : 0;
}

async function findOrCreateUserByPhone(
  db: SqlDatabase,
  phoneE164: string,
): Promise<UserRow> {
  const passwordHash = await createUserPasswordHash(defaultPasswordFromPhone(phoneE164));
  const user = await queryOne<UserRow>(
    db,
    `
      INSERT INTO users (id, phone_e164, password_hash, status)
      VALUES ($1, $2, $3, 'active')
      ON CONFLICT (phone_e164)
      DO UPDATE SET
        phone_e164 = EXCLUDED.phone_e164,
        password_hash = COALESCE(users.password_hash, EXCLUDED.password_hash)
      RETURNING id, phone_e164, status, password_hash
    `,
    [randomUUID(), phoneE164, passwordHash],
  );

  return user!;
}

async function recordSmsSend(
  db: SqlDatabase,
  input: {
    phoneE164: string;
    challengeId?: string;
    provider: "tencent" | "dev";
    status: "sent" | "failed" | "rate_limited";
    ipAddress?: string;
    userAgent?: string;
    providerRequestId?: string;
    errorCode?: string;
    now: Date;
  },
): Promise<void> {
  await db.query(
    `
      INSERT INTO sms_send_records (
        id,
        phone_e164,
        challenge_id,
        provider,
        status,
        ip_address_hash,
        user_agent_hash,
        provider_request_id,
        error_code,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
    [
      randomUUID(),
      input.phoneE164,
      input.challengeId ?? null,
      input.provider,
      input.status,
      hashRequestMetadata(input.ipAddress),
      hashRequestMetadata(input.userAgent),
      input.providerRequestId ?? null,
      input.errorCode ?? null,
      input.now,
    ],
  );
}

async function consumeIssuedChallenge(
  db: SqlDatabase,
  input: {
    challengeId: string;
    phoneE164: string;
    codeHash: string;
    now: Date;
  },
): Promise<LoginChallenge | undefined> {
  const row = await queryOne<LoginChallengeRow>(
    db,
    `
      UPDATE login_challenges
      SET status = 'consumed',
          consumed_at = $4,
          updated_at = $4
      WHERE id = $1
        AND phone_e164 = $2
        AND status = 'issued'
        AND expires_at > $4
        AND code_hash = $3
      RETURNING *
    `,
    [input.challengeId, input.phoneE164, input.codeHash, input.now],
  );

  return row ? challengeFromRow(row) : undefined;
}

function classifyUnconsumedChallenge(
  row: LoginChallengeRow | undefined,
): Exclude<PersistentLoginVerifyResult, Extract<PersistentLoginVerifyResult, { kind: "verified" }>> {
  if (!row) {
    return { kind: "challenge_not_found" };
  }

  const challenge = challengeFromRow(row);
  if (challenge.status === "consumed") {
    return { kind: "consumed", challenge };
  }
  if (challenge.status === "expired") {
    return { kind: "expired", challenge };
  }
  if (challenge.status === "revoked") {
    return { kind: "revoked", challenge };
  }
  if (challenge.status === "locked") {
    return { kind: "locked", challenge };
  }
  return { kind: "invalid_code", challenge };
}

async function saveChallengeResult(
  db: SqlDatabase,
  challenge: LoginChallenge,
  now: Date,
): Promise<void> {
  await db.query(
    `
      UPDATE login_challenges
      SET status = $2,
          attempt_count = $3,
          consumed_at = $4,
          revoked_at = $5,
          updated_at = $6
      WHERE id = $1
        AND status = 'issued'
    `,
    [
      challenge.id,
      challenge.status,
      challenge.attemptCount,
      challenge.consumedAt,
      challenge.revokedAt,
      now,
    ],
  );
}

function challengeFromRow(row: LoginChallengeRow): LoginChallenge {
  return {
    id: row.id,
    phoneE164: row.phone_e164,
    codeHash: row.code_hash,
    codeHashVersion: row.code_hash_version,
    status: row.status,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    expiresAt: row.expires_at,
    lastSentAt: row.last_sent_at,
    consumedAt: row.consumed_at,
    revokedAt: row.revoked_at,
  };
}

function sessionFromRow(row: AuthSessionRow): AuthSession {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    sessionTokenHash: row.session_token_hash,
    sessionTokenHashVersion: row.session_token_hash_version,
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
  };
}
