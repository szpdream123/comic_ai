import { AsyncLocalStorage } from "node:async_hooks";

import { Pool, type PoolClient } from "pg";

import type { SqlDatabase, SqlQueryResult } from "./sql.ts";
import { applySqlMigrations } from "./migrations.ts";

export interface DevDatabase extends SqlDatabase {
  close(): Promise<void>;
}

export async function createDevDb(): Promise<DevDatabase> {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required; configure PostgreSQL before starting the backend");
  }

  const pool = new Pool({
    connectionString,
  });
  const schemaName = process.env.DATABASE_SCHEMA?.trim() || undefined;

  try {
    if (schemaName) {
      await prepareSchema(pool, schemaName);
    }
    const db = createPostgresDatabase(pool, schemaName);
    await ensureFoundationSchema(db);
    return db;
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw new Error(
      `PostgreSQL database initialization failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

interface TransactionState {
  client: PoolClient | PooledDevDatabaseClient | null;
  clientPromise: Promise<PoolClient | PooledDevDatabaseClient>;
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
          if (command === "commit" || command === "rollback") {
            transactionClient.release();
            context.transactionState = null;
          }
          return {
            rows: result.rows as T[],
          };
        } catch (error) {
          if (command === "commit" || command === "rollback") {
            transactionClient.release();
            context.transactionState = null;
          }
          throw error;
        }
      }

      if (command === "begin") {
        const transactionState: TransactionState = {
          client: null,
          clientPromise: pool.connect().then(async (client) => {
            try {
              await setSearchPathIfNeeded(client, schemaName);
              transactionState.client = client;
              return client;
            } catch (error) {
              client.release();
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
          transactionState.client?.release();
          context.transactionState = null;
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
    transactionClient.release();
  }
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
  release(): void;
}

async function setSearchPathIfNeeded(client: PoolClient, schemaName?: string) {
  if (!schemaName) {
    return;
  }
  await client.query(`SET search_path TO ${quoteIdentifier(schemaName)}`);
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
