import { spawnSync } from "node:child_process";
import { join } from "node:path";

const RUNTIME_SCHEMA_MIGRATION_TIMEOUT_MS = 20 * 60_000;

export function runRuntimeSchemaMigrations(input) {
  const migrationEntrypoint = join(input.cwd, "scripts", "migrate-user-scope.mjs");
  console.info("[schema] Applying pending runtime migrations before service startup...");
  const result = spawnSync(input.runtime, [migrationEntrypoint, "--apply", "--runtime-safe"], {
    cwd: input.cwd,
    env: input.env,
    stdio: "inherit",
    timeout: RUNTIME_SCHEMA_MIGRATION_TIMEOUT_MS,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`runtime_schema_migration_failed:${result.status ?? "unknown"}`);
  }
  console.info("[schema] Runtime schema is current.");
}
