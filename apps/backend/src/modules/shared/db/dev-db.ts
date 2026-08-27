import { AsyncLocalStorage } from "node:async_hooks";
import { setTimeout as sleep } from "node:timers/promises";

import { Pool, type PoolClient } from "pg";

import type { SqlDatabase, SqlQueryResult } from "./sql.ts";
import { applySqlMigrations } from "./migrations.ts";

export interface DevDatabase extends SqlDatabase {
  close(): Promise<void>;
}

export function loadDatabasePoolConfig(env: NodeJS.ProcessEnv) {
  return {
    max: readConfiguredInteger(env, "DATABASE_POOL_MAX", 20, 1, 200),
    idleTimeoutMillis: readConfiguredInteger(env, "DATABASE_POOL_IDLE_TIMEOUT_MS", 30_000, 0, 600_000),
    connectionTimeoutMillis: readConfiguredInteger(env, "DATABASE_POOL_CONNECTION_TIMEOUT_MS", 5_000, 0, 60_000),
  };
}

export async function createDevDb(): Promise<DevDatabase> {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required; configure PostgreSQL before starting the backend");
  }

  const schemaName = process.env.DATABASE_SCHEMA?.trim() || undefined;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const pool = new Pool({
      connectionString,
      ...loadDatabasePoolConfig(process.env),
    });
    pool.on("error", (error) => {
      const code = typeof (error as { code?: unknown })?.code === "string"
        ? (error as { code: string }).code
        : "PG_POOL_ERROR";
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[database] idle PostgreSQL client error ${code}: ${message}`);
    });

    try {
      if (schemaName) {
        await prepareSchema(pool, schemaName);
      }
      const db = createPostgresDatabase(pool, schemaName);
      if (!isManagedProductionWorkerSchemaReady()) {
        await ensureFoundationSchema(db);
      }
      return db;
    } catch (error) {
      await pool.end().catch(() => undefined);
      if (attempt < 3 && isTransientDatabaseConnectionError(error)) {
        const delayMs = attempt * 500;
        console.warn(`[database] PostgreSQL startup connection failed; retrying in ${delayMs}ms (attempt ${attempt + 1}/3).`);
        await sleep(delayMs);
        continue;
      }
      throw new Error(
        `PostgreSQL database initialization failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  throw new Error("PostgreSQL database initialization failed: startup retry limit reached");
}

export function isTransientDatabaseConnectionError(error: unknown) {
  const code = typeof (error as { code?: unknown })?.code === "string"
    ? (error as { code: string }).code
    : "";
  const message = error instanceof Error ? error.message : String(error);
  return [
    "ECONNABORTED",
    "ETIMEDOUT",
    "ECONNRESET",
    "ECONNREFUSED",
    "EHOSTUNREACH",
    "ENETUNREACH",
  ].includes(code) || /\b(?:ECONNABORTED|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH)\b/i.test(message)
    || /connection terminated(?: unexpectedly| due to connection timeout)/i.test(message);
}

export class TransientDatabasePersistenceError extends Error {
  readonly code = "transient_database_persistence_error";

  constructor(error: unknown, readonly retrySafe = true) {
    super(error instanceof Error ? error.message : String(error), { cause: error });
    this.name = "TransientDatabasePersistenceError";
  }
}

export function markTransientDatabasePersistenceError(error: unknown, options?: { retrySafe?: boolean }) {
  return error instanceof TransientDatabasePersistenceError
    ? error
    : new TransientDatabasePersistenceError(error, options?.retrySafe ?? true);
}

export function isTransientDatabasePersistenceError(error: unknown) {
  return error instanceof TransientDatabasePersistenceError;
}

export function isRetrySafeTransientDatabasePersistenceError(error: unknown) {
  return error instanceof TransientDatabasePersistenceError && error.retrySafe;
}

function isManagedProductionWorkerSchemaReady() {
  return process.env.CREATOR_DEV_STACK_MANAGED === "true"
    && process.env.CREATOR_DEV_SCHEMA_READY === "true";
}

function readConfiguredInteger(
  env: NodeJS.ProcessEnv,
  key: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
) {
  const rawValue = env[key];
  if (rawValue === undefined) {
    return defaultValue;
  }

  const normalizedValue = rawValue.trim();
  const value = Number(normalizedValue);
  if (!/^\d+$/.test(normalizedValue) || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${key} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

interface TransactionState {
  client: PoolClient | PooledDevDatabaseClient | null;
  clientPromise: Promise<PoolClient | PooledDevDatabaseClient>;
  released: boolean;
  clientErrorHandler?: (error: unknown) => void;
}

interface DatabaseExecutionContext {
  transactionState: TransactionState | null;
}

const databaseExecutionStorage = new AsyncLocalStorage<DatabaseExecutionContext>();

export async function runWithDatabaseContext<T>(run: () => Promise<T>): Promise<T> {
  const context: DatabaseExecutionContext = { transactionState: null };
  return databaseExecutionStorage.run(context, async () => {
    try {
      return await run();
    } finally {
      await releaseTransactionState(context);
    }
  });
}

export function createPostgresDatabase(pool: Pool, schemaName?: string): DevDatabase {
  const fallbackContext: DatabaseExecutionContext = { transactionState: null };

  return {
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<SqlQueryResult<T>> {
      const command = transactionSqlCommand(sql);
      const context = databaseExecutionStorage.getStore() ?? fallbackContext;
      const existingTransaction = context.transactionState;
      if (existingTransaction) {
        const transactionClient = await existingTransaction.clientPromise;
        try {
          const result = await transactionClient.query(sql, params);
          return {
            rows: result.rows as T[],
          };
        } finally {
          if (command === "commit" || command === "rollback") {
            if (context.transactionState === existingTransaction) {
              context.transactionState = null;
            }
            releaseTransactionClient(existingTransaction);
          }
        }
      }

      if (command === "begin") {
        const transactionState: TransactionState = {
          client: null,
          released: false,
          clientPromise: pool.connect().then(async (client) => {
            transactionState.client = client;
            const clientErrorHandler = (error: unknown) => {
              if (transactionState.released) {
                return;
              }
              transactionState.released = true;
              const code = typeof (error as { code?: unknown })?.code === "string"
                ? (error as { code: string }).code
                : "PG_TRANSACTION_CLIENT_ERROR";
              const message = error instanceof Error ? error.message : String(error);
              console.error(`[database] transaction PostgreSQL client error ${code}: ${message}`);
              try {
                client.release(error instanceof Error ? error : new Error(message));
              } catch {
                // The pool may already be removing this failed client.
              }
            };
            transactionState.clientErrorHandler = clientErrorHandler;
            (client as PoolClient & { on?: (event: string, listener: (error: unknown) => void) => void })
              .on?.("error", clientErrorHandler);
            try {
              await setSearchPathIfNeeded(client, schemaName);
              return client;
            } catch (error) {
              releaseTransactionClient(transactionState);
              throw error;
            }
          }),
        };
        context.transactionState = transactionState;
        try {
          const transactionClient = await transactionState.clientPromise;
          const result = await transactionClient.query(sql, params);
          return {
            rows: result.rows as T[],
          };
        } catch (error) {
          releaseTransactionClient(transactionState);
          if (context.transactionState === transactionState) {
            context.transactionState = null;
          }
          throw error;
        }
      }

      if (!schemaName) {
        const result = await pool.query(sql, params);
        return {
          rows: result.rows as T[],
        };
      }

      const client = await pool.connect();
      try {
        await setSearchPathIfNeeded(client, schemaName);
        const result = await client.query(sql, params);
        return {
          rows: result.rows as T[],
        };
      } finally {
        client.release();
      }
    },
    async close() {
      await releaseTransactionState(fallbackContext);
      await pool.end();
    },
  };
}

async function releaseTransactionState(context: DatabaseExecutionContext) {
  const transactionState = context.transactionState;
  if (!transactionState) {
    return;
  }
  context.transactionState = null;
  const transactionClient = await transactionState.clientPromise.catch(() => null);
  if (!transactionClient) {
    return;
  }
  try {
    await transactionClient.query("ROLLBACK");
  } catch {
    // The transaction may already have been closed by the caller.
  } finally {
    releaseTransactionClient(transactionState);
  }
}

function releaseTransactionClient(transactionState: TransactionState) {
  if (transactionState.released || !transactionState.client) {
    return;
  }
  transactionState.released = true;
  if (transactionState.clientErrorHandler) {
    (transactionState.client as PoolClient & {
      removeListener?: (event: string, listener: (error: unknown) => void) => void;
    }).removeListener?.("error", transactionState.clientErrorHandler);
    transactionState.clientErrorHandler = undefined;
  }
  transactionState.client.release();
}

export function createPooledDevDatabaseForTests(pool: PooledDevDatabasePool): DevDatabase {
  return createPostgresDatabase(pool as unknown as Pool);
}

interface PooledDevDatabasePool {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SqlQueryResult<T>>;
  connect(): Promise<PooledDevDatabaseClient>;
  end(): Promise<void>;
}

interface PooledDevDatabaseClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SqlQueryResult<T>>;
  release(error?: Error): void;
}

async function setSearchPathIfNeeded(client: PoolClient, schemaName?: string) {
  if (!schemaName) {
    return;
  }
  const extensionSchemas = await client.query<{ schema_name: string }>(
    `SELECT namespace.nspname AS schema_name
     FROM pg_extension AS extension
     JOIN pg_namespace AS namespace ON namespace.oid = extension.extnamespace
     WHERE extension.extname = 'pg_trgm'`,
  );
  const searchPath = [
    schemaName,
    ...extensionSchemas.rows.map((row) => row.schema_name).filter((name) => name !== schemaName),
  ];
  await client.query(`SET search_path TO ${searchPath.map(quoteIdentifier).join(", ")}`);
}

function transactionSqlCommand(sql: string) {
  const normalized = sql.trim().replace(/;+$/, "").trim().replace(/\s+/g, " ").toLowerCase();
  if (normalized === "begin" || normalized.startsWith("begin ") || normalized === "start transaction") {
    return "begin";
  }
  if (normalized === "commit") {
    return "commit";
  }
  if (normalized === "rollback") {
    return "rollback";
  }
  return "other";
}

async function prepareSchema(pool: Pool, schemaName: string) {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schemaName)}`);
}

function withSchemaCleanup(db: DevDatabase, schemaName: string): DevDatabase {
  const close = db.close.bind(db);
  return {
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<SqlQueryResult<T>> {
      return db.query<T>(sql, params);
    },
    async close() {
      try {
        await db.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
      } finally {
        await close();
      }
    },
  };
}

export async function ensureFoundationSchema(db: SqlDatabase) {
  if (!(await tableExists(db, "users"))) {
    await applySqlMigrations(db);
    return;
  }

  await db.query("BEGIN");
  try {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('comic_ai_credit_ledger_balance_snapshots_v1'))");
    await ensureCreditLedgerBalanceSnapshots(db);
    await db.query("SELECT pg_advisory_xact_lock(hashtext('comic_ai_generated_asset_storage_links_v1'))");
    await ensureGeneratedAssetStorageLinks(db);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }

  const requiredColumns = [
    ["sms_send_records", "verification_code"],
    ["sms_send_records", "sms_content"],
    ["sms_send_records", "ip_address"],
    ["users", "invite_code"],
  ];
  for (const [tableName, columnName] of requiredColumns) {
    if (!(await columnExists(db, tableName, columnName))) {
      throw new Error(`current_schema_baseline_incomplete:${tableName}.${columnName}`);
    }
  }
}

async function ensureGeneratedAssetStorageLinks(db: SqlDatabase) {
  await db.query(
    `
      WITH generated_asset_results AS (
        SELECT
          av.id AS asset_version_id,
          COALESCE(
            NULLIF(av.metadata_json #>> '{generationResult,resultAssets,0,storageObjectId}', ''),
            NULLIF(av.metadata_json #>> '{generationResult,result,storageObjectId}', ''),
            NULLIF(av.metadata_json #>> '{generationResult,fixedImages,0,storageObjectId}', '')
          ) AS result_storage_object_id,
          COALESCE(
            NULLIF(av.metadata_json #>> '{generationResult,resultAssets,0,previewUrl}', ''),
            NULLIF(av.metadata_json #>> '{generationResult,resultAssets,0,sourceUrl}', ''),
            NULLIF(av.metadata_json #>> '{generationResult,result,imageUrl}', ''),
            NULLIF(av.metadata_json #>> '{generationResult,result,previewUrl}', ''),
            NULLIF(av.metadata_json #>> '{generationResult,fixedImages,0,previewUrl}', ''),
            NULLIF(av.metadata_json #>> '{generationResult,fixedImages,0,url}', '')
          ) AS result_preview_url
        FROM asset_versions av
        WHERE lower(COALESCE(
          av.metadata_json ->> 'generationStatus',
          av.metadata_json #>> '{generationResult,status}',
          av.metadata_json #>> '{generationResult,workflowStatus}',
          ''
        )) IN ('completed', 'succeeded', 'success')
      ), available_generated_assets AS (
        SELECT
          result.asset_version_id,
          result.result_preview_url,
          object.id AS storage_object_id,
          object.object_key,
          object.content_type
        FROM generated_asset_results result
        JOIN storage_objects object
          ON object.id::text = result.result_storage_object_id
         AND object.status = 'available'
      )
      UPDATE asset_versions version
      SET storage_object_id = generated.storage_object_id,
          storage_object_key = generated.object_key,
          metadata_json = COALESCE(version.metadata_json, '{}'::jsonb)
            || jsonb_build_object(
              'fixedImageStorageObjectId', generated.storage_object_id,
              'storageObjectKey', generated.object_key
            )
            || CASE
              WHEN generated.result_preview_url IS NULL THEN '{}'::jsonb
              ELSE jsonb_build_object(
                'previewUrl', generated.result_preview_url,
                'fixedImageUrl', generated.result_preview_url,
                'sourceUrl', generated.result_preview_url,
                'downloadUrl', generated.result_preview_url
              )
            END
            || CASE
              WHEN generated.content_type IS NULL THEN '{}'::jsonb
              ELSE jsonb_build_object('mimeType', generated.content_type)
            END
      FROM available_generated_assets generated
      WHERE version.id = generated.asset_version_id
        AND (
          version.storage_object_id IS DISTINCT FROM generated.storage_object_id
          OR version.storage_object_key IS DISTINCT FROM generated.object_key
          OR (
            generated.result_preview_url IS NOT NULL
            AND version.metadata_json ->> 'previewUrl' IS DISTINCT FROM generated.result_preview_url
          )
        )
    `,
  );
}

async function ensureCreditLedgerBalanceSnapshots(db: SqlDatabase) {
  const hasBalanceColumn = await columnExists(db, "credit_ledger_entries", "balance_after");
  const hasBalanceConstraint = await constraintExists(db, "credit_ledger_entries_balance_after_check");
  const hasBalanceTrigger = await triggerExists(db, "credit_ledger_balance_after_trigger");
  const hasImmutableTrigger = await triggerExists(db, "credit_ledger_balance_after_immutable_trigger");
  if (hasBalanceColumn && hasBalanceConstraint && hasBalanceTrigger && hasImmutableTrigger) {
    return;
  }

  if (!hasBalanceColumn) {
    await db.query("ALTER TABLE credit_ledger_entries ADD COLUMN balance_after integer");
  }
  if (!hasBalanceConstraint) {
    await db.query("DROP TRIGGER IF EXISTS credit_ledger_balance_after_immutable_trigger ON credit_ledger_entries");
    await db.query("ALTER TABLE credit_ledger_entries ALTER COLUMN balance_after DROP NOT NULL");
    await db.query(
      `
        WITH balance_snapshots AS (
          SELECT
            ledger.id,
            (
              CASE
                WHEN ledger.team_member_id IS NULL THEN owner.credit_balance_cached
                ELSE member.member_credits
              END
            ) - COALESCE(
              SUM(ledger.available_delta) OVER (
                PARTITION BY ledger.user_id, ledger.team_member_id
                ORDER BY ledger.created_at DESC, ledger.id ASC
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
              ),
              0
            ) AS balance_after
          FROM credit_ledger_entries ledger
          JOIN users owner
            ON owner.id = ledger.user_id
          LEFT JOIN team_members member
            ON member.id = ledger.team_member_id
           AND member.user_id = ledger.user_id
        )
        UPDATE credit_ledger_entries ledger
        SET balance_after = CASE
          WHEN snapshot.balance_after >= 0 THEN snapshot.balance_after
          ELSE NULL
        END
        FROM balance_snapshots snapshot
        WHERE ledger.id = snapshot.id
          AND (ledger.balance_after IS NULL OR ledger.balance_after < 0)
      `,
    );
    await db.query(
      "ALTER TABLE credit_ledger_entries ADD CONSTRAINT credit_ledger_entries_balance_after_check CHECK (balance_after >= 0)",
    );
    await db.query(
      "COMMENT ON COLUMN credit_ledger_entries.balance_after IS 'Available balance after this ledger entry; NULL only when legacy history cannot be reconstructed reliably.'",
    );
  }
  if (!hasBalanceTrigger) {
    await db.query(
      `
        CREATE OR REPLACE FUNCTION set_credit_ledger_balance_after()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        DECLARE
          wallet_balance integer;
        BEGIN
          IF NEW.balance_after IS NOT NULL THEN
            RETURN NEW;
          END IF;

          IF NEW.team_member_id IS NULL THEN
            SELECT credit_balance_cached
            INTO wallet_balance
            FROM users
            WHERE id = NEW.user_id;
          ELSE
            SELECT member_credits
            INTO wallet_balance
            FROM team_members
            WHERE id = NEW.team_member_id
              AND user_id = NEW.user_id;
          END IF;

          IF wallet_balance IS NULL THEN
            RAISE EXCEPTION 'credit_ledger_wallet_not_found';
          END IF;

          NEW.balance_after := wallet_balance;
          RETURN NEW;
        END;
        $$
      `,
    );
    await db.query("DROP TRIGGER IF EXISTS credit_ledger_balance_after_trigger ON credit_ledger_entries");
    await db.query(
      `
        CREATE TRIGGER credit_ledger_balance_after_trigger
        BEFORE INSERT ON credit_ledger_entries
        FOR EACH ROW
        EXECUTE FUNCTION set_credit_ledger_balance_after()
      `,
    );
  }
  if (!hasImmutableTrigger || !hasBalanceConstraint) {
    await db.query(
      `
        CREATE OR REPLACE FUNCTION prevent_credit_ledger_balance_after_update()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
          IF NEW.balance_after IS DISTINCT FROM OLD.balance_after THEN
            RAISE EXCEPTION 'credit_ledger_balance_after_immutable';
          END IF;
          RETURN NEW;
        END;
        $$
      `,
    );
    await db.query("DROP TRIGGER IF EXISTS credit_ledger_balance_after_immutable_trigger ON credit_ledger_entries");
    await db.query(
      `
        CREATE TRIGGER credit_ledger_balance_after_immutable_trigger
        BEFORE UPDATE OF balance_after ON credit_ledger_entries
        FOR EACH ROW
        EXECUTE FUNCTION prevent_credit_ledger_balance_after_update()
      `,
    );
  }
}

async function tableExists(db: SqlDatabase, tableName: string) {
  const result = await db.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = $1
      ) AS exists
    `,
    [tableName],
  );
  return result.rows[0]?.exists === true;
}

async function constraintExists(db: SqlDatabase, constraintName: string) {
  const result = await db.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = $1
      ) AS exists
    `,
    [constraintName],
  );
  return Boolean(result.rows[0]?.exists);
}

async function triggerExists(db: SqlDatabase, triggerName: string) {
  const result = await db.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = $1
          AND NOT tgisinternal
      ) AS exists
    `,
    [triggerName],
  );
  return Boolean(result.rows[0]?.exists);
}

async function columnExists(db: SqlDatabase, tableName: string, columnName: string) {
  const result = await db.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = $1
          AND column_name = $2
      ) AS exists
    `,
    [tableName, columnName],
  );
  return result.rows[0]?.exists === true;
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}
