import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { runRuntimeSchemaMigrations } from "./runtime-schema-migrations.mjs";

loadDotEnvFile(join(process.cwd(), ".env"));
if (process.env.CREATOR_DEV_STACK_MANAGED !== "true") {
  runRuntimeSchemaMigrations({ runtime: process.execPath, cwd: process.cwd(), env: process.env });
}

const [{ createDevDb }, { MarketingCompetitorCollectionWorker }] = await Promise.all([
  import("../apps/backend/src/modules/shared/db/dev-db.ts"),
  import("../apps/backend/src/modules/marketing/workers/marketing-competitor-collection.worker.ts"),
]);

const db = await createDevDb();
const worker = new MarketingCompetitorCollectionWorker({ db });
const intervalMs = positiveInteger(process.env.MARKETING_COMPETITOR_COLLECTION_INTERVAL_MS, 15_000);
const abortController = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => abortController.abort());
process.on("message", (message) => {
  if (message?.type === "creator-dev-stop") abortController.abort();
});
console.info("[marketing-competitor-collection] Worker started.");

try {
  while (!abortController.signal.aborted) {
    const results = await worker.processUntilIdle(20);
    if (results.length) console.info("[marketing-competitor-collection]", JSON.stringify(results));
    await wait(results.length ? 0 : intervalMs, abortController.signal);
  }
} finally {
  await db.close();
}

function wait(delay, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, delay);
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

function loadDotEnvFile(path) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    const index = line.indexOf("=");
    if (!line || line.startsWith("#") || index <= 0) continue;
    const key = line.slice(0, index).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}
