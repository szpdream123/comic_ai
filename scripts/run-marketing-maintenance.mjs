import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { runRuntimeSchemaMigrations } from "./runtime-schema-migrations.mjs";
import { runtimeEnvFilePath } from "./runtime-env-file.mjs";

loadDotEnvFile(runtimeEnvFilePath());
if (process.env.CREATOR_DEV_STACK_MANAGED !== "true") {
  runRuntimeSchemaMigrations({ runtime: process.execPath, cwd: process.cwd(), env: process.env });
}

const [{ createDevDb }, { createMarketingService }, { createStorageAdapterFromEnv }] = await Promise.all([
  import("../apps/backend/src/modules/shared/db/dev-db.ts"),
  import("../apps/backend/src/modules/marketing/application/marketing.service.ts"),
  import("../apps/backend/src/modules/storage/storage-adapter.factory.ts"),
]);

const storageMode = process.env.STORAGE_ADAPTER_MODE?.trim();
if (storageMode !== "cos" && storageMode !== "s3_compatible") {
  throw new Error("Marketing maintenance requires STORAGE_ADAPTER_MODE=cos or s3_compatible");
}
const intervalMs = positiveInteger(process.env.MARKETING_MAINTENANCE_INTERVAL_MS, 60_000);
const limit = positiveInteger(process.env.MARKETING_MAINTENANCE_LIMIT, 100);
const db = await createDevDb();
const service = createMarketingService({ db, storageAdapter: createStorageAdapterFromEnv(process.env) });
const abortController = new AbortController();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => abortController.abort());
}

try {
  while (!abortController.signal.aborted) {
    const startedAt = Date.now();
    const now = new Date();
    const [health, cleanup] = await Promise.all([
      service.refreshExecutorHealth(now),
      service.cleanupExpiredDeliveryAssets(now, limit),
    ]);
    const result = { ...health, ...cleanup };
    if (result.offline || result.claimed || result.failed) console.info("[marketing-maintenance]", JSON.stringify(result));
    await wait(Math.max(0, intervalMs - (Date.now() - startedAt)), abortController.signal);
  }
} finally {
  await db.close();
}

function wait(delayMs, signal) {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, delayMs);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function loadDotEnvFile(envFilePath) {
  if (!existsSync(envFilePath)) return;
  for (const rawLine of readFileSync(envFilePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
