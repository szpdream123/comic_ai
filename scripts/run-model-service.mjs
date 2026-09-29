import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { startModelService } from "../apps/model-service/src/runtime.ts";

// Always use this project's formal .env; no .env.local or TEST_DATABASE_URL fallback.
let stage = ".env";
try {
  const configured = parseEnv(readFileSync(resolve(".env"), "utf8"));
  if (!configured.DATABASE_URL?.trim()) throw new Error("DATABASE_URL_required");
  Object.assign(process.env, configured);
  stage = "model-service configuration";
  const runtime = await startModelService(configured, { migrateOnly: process.argv.includes("--migrate") });
  if (runtime) {
    console.info(`[model-service] listening on ${runtime.host}:${runtime.port}`);
    for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void runtime.stop(); });
  } else console.info("[model-service] schema ready");
} catch (error) {
  const message = error instanceof Error && /^(?:DATABASE_URL|DATABASE_SCHEMA|MODEL_SERVICE_[A-Z_]+)_(?:required|invalid|required_or_invalid)$/.test(error.message)
    ? error.message : `${stage}: startup_failed`;
  console.error(`[model-service] ${message}`);
  process.exitCode = 1;
}
