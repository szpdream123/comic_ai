import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { Pool } from "pg";
import { createModelCatalog } from "./catalog.ts";
import { createProviderExecutor } from "./provider-executor.ts";
import { createRequestStore } from "./request-store.ts";
import { createModelService } from "./service.ts";
import { createModelHttpServer } from "./http-server.ts";
import { readServiceConfig } from "./policy.ts";
import type { SqlDatabase } from "../../backend/src/modules/shared/db/sql.ts";

export async function startModelService(env: NodeJS.ProcessEnv, options: { migrateOnly?: boolean } = {}) {
  if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL_required");
  const schema = env.DATABASE_SCHEMA?.trim();
  if (schema && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) throw new Error("DATABASE_SCHEMA_invalid");
  if (!options.migrateOnly) readServiceConfig(env);
  const pool = new Pool({ connectionString: env.DATABASE_URL,
    ...(schema ? { options: `-c search_path=${schema}` } : {}), connectionTimeoutMillis: 10_000, max: 8 });
  let stop: (() => Promise<void>) | undefined;
  let failed = false;
  function reportDatabaseFailure(error: unknown) {
    if (failed) return;
    failed = true;
    const code = error && typeof error === "object" && "code" in error && /^[A-Z0-9_]{1,40}$/i.test(String(error.code)) ? String(error.code) : "DATABASE_OPERATION_FAILED";
    console.error(`[model-service] PostgreSQL DATABASE_URL: ${code}; service stopped`);
    process.exitCode = 1;
    void stop?.();
  }
  pool.on("error", reportDatabaseFailure);
  const db: SqlDatabase = { async query(sql, params) {
    try { return await pool.query(sql, params); }
    catch (error) { reportDatabaseFailure(error); throw error; }
  } };
  try {
    if (options.migrateOnly) {
      await db.query(await readFile(new URL("../schema.sql", import.meta.url), "utf8"));
      await pool.end(); return null;
    }
    const port = Number(env.MODEL_SERVICE_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("MODEL_SERVICE_PORT_required_or_invalid");
    const host = env.MODEL_SERVICE_HOST?.trim() || "127.0.0.1";
    const store = createRequestStore(db);
    const catalog = createModelCatalog(db);
    const service = createModelService({ store, env, listModels: catalog.listModels,
      executor: createProviderExecutor({ env, resolveCredentials: catalog.resolveCredentials }) });
    // Start the real request recovery path; do not run old business migrations or connection preflight probes.
    await store.recoverExpired(new Date());
    let tick: Promise<unknown> | null = null;
    let closing: Promise<void> | undefined;
    const server = createModelHttpServer(service, { onError: reportDatabaseFailure });
    let timer: ReturnType<typeof setInterval> | undefined;
    const tickOnce = () => {
      if (tick || failed || closing) return;
      tick = service.tick().catch(reportDatabaseFailure).finally(() => { tick = null; });
    };
    stop = () => closing ??= (async () => {
      clearInterval(timer);
      const closed = new Promise<void>(resolve => server.close(() => resolve()));
      // Bound shutdown if a caller disconnected during a paid request; the durable lease preserves its outcome.
      const force = setTimeout(() => server.closeAllConnections(), 125_000); force.unref();
      await Promise.allSettled([closed, tick, server.drain()]); clearTimeout(force); await pool.end();
    })();
    const reportHttpFailure = () => { console.error("[model-service] HTTP MODEL_SERVICE_HOST/MODEL_SERVICE_PORT: listener_failed"); process.exitCode = 1; void stop?.(); };
    server.listen(port, host);
    try { await once(server, "listening"); }
    catch (error) { console.error("[model-service] HTTP MODEL_SERVICE_HOST/MODEL_SERVICE_PORT: listener_failed"); throw error; }
    server.on("error", reportHttpFailure);
    timer = setInterval(tickOnce, 1_000);
    timer.unref();
    return { server, stop, host, port };
  } catch (error) {
    await pool.end().catch(() => {});
    throw error;
  }
}
