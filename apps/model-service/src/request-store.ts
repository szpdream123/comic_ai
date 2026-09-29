import { randomUUID } from "node:crypto";
import type { SqlDatabase } from "../../backend/src/modules/shared/db/sql.ts";
import { ModelServiceError, type RequestStore, type StoredRequest } from "./contracts.ts";

interface RequestRow {
  id: string;
  product_id: string;
  subject_id: string;
  request_key: string;
  request_hash: string;
  operation: StoredRequest["operation"];
  model_json: StoredRequest["model"];
  payload_json: StoredRequest["payload"];
  status: StoredRequest["status"];
  external_id: string | null;
  result_json: StoredRequest["result"];
  error: string | null;
  lease_token: string | null;
  lease_until: Date | string | null;
  next_run_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
}

function requestFromRow(row: RequestRow): StoredRequest {
  return {
    id: row.id, productId: row.product_id, subjectId: row.subject_id,
    requestKey: row.request_key, requestHash: row.request_hash, operation: row.operation,
    model: row.model_json, payload: row.payload_json, status: row.status,
    externalId: row.external_id, result: row.result_json, error: row.error,
    leaseToken: row.lease_token, leaseUntil: row.lease_until === null ? null : new Date(row.lease_until),
    nextRunAt: new Date(row.next_run_at), createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at),
  };
}

function leaseExpiry(now: Date, leaseMs: number): Date {
  if (!Number.isFinite(leaseMs) || leaseMs <= 0 || !Number.isFinite(now.getTime() + leaseMs)) {
    throw new ModelServiceError(400, "invalid_lease");
  }
  const expiry = new Date(now.getTime() + leaseMs);
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= now.getTime()) {
    throw new ModelServiceError(400, "invalid_lease");
  }
  return expiry;
}

export function createRequestStore(db: SqlDatabase): RequestStore {
  async function find(sql: string, params: unknown[]): Promise<StoredRequest | null> {
    const { rows } = await db.query<RequestRow>(sql, params);
    return rows[0] ? requestFromRow(rows[0]) : null;
  }

  return {
    async rememberNonce(productId, keyId, nonce, expiresAt, now) {
      if (expiresAt.getTime() <= now.getTime()) return false;
      // Bound cleanup work; expired conflicts are independently replaced below.
      await db.query(`DELETE FROM model_service_nonces WHERE (product_id, key_id, nonce) IN (
        SELECT product_id, key_id, nonce FROM model_service_nonces
        WHERE expires_at <= $1 ORDER BY expires_at LIMIT 128 FOR UPDATE SKIP LOCKED
      )`, [now]);
      const { rows } = await db.query(`
        INSERT INTO model_service_nonces (product_id, key_id, nonce, expires_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (product_id, key_id, nonce) DO UPDATE SET expires_at = EXCLUDED.expires_at
        WHERE model_service_nonces.expires_at <= $5 RETURNING nonce
      `, [productId, keyId, nonce, expiresAt, now]);
      return rows.length === 1;
    },

    async create(input, now) {
      const request = await find(`
        INSERT INTO model_service_requests (
          id, product_id, subject_id, request_key, request_hash, operation, model_json,
          payload_json, status, next_run_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, 'queued', $9, $9, $9)
        ON CONFLICT (product_id, subject_id, request_key) DO NOTHING RETURNING *
      `, [randomUUID(), input.productId, input.subjectId, input.requestKey, input.requestHash,
        input.operation, JSON.stringify(input.model), JSON.stringify(input.payload), now]);
      if (request) return { request, created: true };
      // A separate statement gets a fresh READ COMMITTED snapshot after the unique
      // constraint waited for another writer; a same-statement SELECT can miss it.
      const existing = await find(`SELECT * FROM model_service_requests
        WHERE product_id = $1 AND subject_id = $2 AND request_key = $3`,
      [input.productId, input.subjectId, input.requestKey]);
      if (!existing) throw new ModelServiceError(503, "request_unavailable");
      if (existing.requestHash !== input.requestHash) throw new ModelServiceError(409, "idempotency_conflict");
      return { request: existing, created: false };
    },

    findByKey(productId, subjectId, requestKey) {
      return find(`SELECT * FROM model_service_requests
        WHERE product_id = $1 AND subject_id = $2 AND request_key = $3`, [productId, subjectId, requestKey]);
    },

    get(id, productId, subjectId) {
      return find("SELECT * FROM model_service_requests WHERE id = $1 AND product_id = $2 AND subject_id = $3",
        [id, productId, subjectId]);
    },

    claim(now, leaseMs, id) {
      return find(`WITH candidate AS (
        SELECT id FROM model_service_requests
        WHERE status IN ('queued', 'running') AND lease_token IS NULL
          AND next_run_at <= $1 AND ($4::text IS NULL OR id = $4)
        ORDER BY next_run_at, created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      UPDATE model_service_requests AS request
      SET status = CASE WHEN request.status = 'queued' THEN 'submitting' ELSE 'running' END,
        lease_token = $2, lease_until = $3, updated_at = $1
      FROM candidate WHERE request.id = candidate.id RETURNING request.*`,
      [now, randomUUID(), leaseExpiry(now, leaseMs), id ?? null]);
    },

    async renew(id, leaseToken, now, leaseMs) {
      const { rows } = await db.query(`UPDATE model_service_requests SET lease_until = $4, updated_at = $3
        WHERE id = $1 AND lease_token = $2 AND lease_until > $3
          AND status IN ('submitting', 'running') RETURNING id`, [id, leaseToken, now, leaseExpiry(now, leaseMs)]);
      return rows.length === 1;
    },

    async finish(id, leaseToken, update, now) {
      if (!["running", "succeeded", "failed", "result_unknown"].includes(update.status)) {
        throw new ModelServiceError(400, "invalid_request_status");
      }
      // Explicit column whitelist: input cannot replace routing, scope, or lease fields.
      const { rows } = await db.query(`UPDATE model_service_requests SET
        status = $4, next_run_at = $5, updated_at = $3,
        external_id = CASE WHEN $6 THEN $7 ELSE external_id END,
        result_json = CASE WHEN $8 THEN $9::jsonb ELSE result_json END,
        error = CASE WHEN $10 THEN $11 ELSE error END,
        lease_token = NULL, lease_until = NULL
        WHERE id = $1 AND lease_token = $2 AND lease_until > $3
          AND status IN ('submitting', 'running') RETURNING id`,
      [id, leaseToken, now, update.status, update.nextRunAt,
        update.externalId !== undefined, update.externalId ?? null,
        update.result !== undefined, update.result == null ? null : JSON.stringify(update.result),
        update.error !== undefined, update.error ?? null]);
      return rows.length === 1;
    },

    async recoverExpired(now) {
      // An expired POST may already have incurred a charge. Never put it back in
      // the submission queue. GET polling can safely acquire a new lease instead.
      await db.query(`UPDATE model_service_requests SET
        status = CASE WHEN status = 'submitting' THEN 'result_unknown' ELSE status END,
        error = CASE WHEN status = 'submitting' THEN 'submission_outcome_unknown' ELSE error END,
        lease_token = NULL, lease_until = NULL, updated_at = $1
        WHERE status IN ('submitting', 'running') AND lease_until <= $1`, [now]);
    },
  };
}
