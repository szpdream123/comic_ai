import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { runRuntimeSchemaMigrations } from "./runtime-schema-migrations.mjs";

loadDotEnvFile(join(process.cwd(), ".env"));
if (process.env.CREATOR_DEV_STACK_MANAGED !== "true") {
  runRuntimeSchemaMigrations({ runtime: process.execPath, cwd: process.cwd(), env: process.env });
}

const [{ createDevDb }, { PostgresMarketingAgentRunStore }, { MarketingAgentWorker }, {
  createPolicyBoundMarketingResearchProvider,
  loadActiveMarketingResearchPolicies,
}, { loadMarketingTextAgentProviders }] = await Promise.all([
  import("../apps/backend/src/modules/shared/db/dev-db.ts"),
  import("../apps/backend/src/modules/marketing/infrastructure/postgres-marketing-agent-store.ts"),
  import("../apps/backend/src/modules/marketing/workers/marketing-agent.worker.ts"),
  import("../apps/backend/src/modules/marketing/infrastructure/marketing-research-agent-provider.ts"),
  import("../apps/backend/src/modules/marketing/infrastructure/marketing-text-agent-provider.ts"),
]);

const db = await createDevDb();
const abortController = new AbortController();
const intervalMs = positiveInteger(process.env.MARKETING_AGENT_WORKER_INTERVAL_MS, 30_000);
const batchSize = Math.min(20, positiveInteger(process.env.MARKETING_AGENT_WORKER_BATCH_SIZE, 5));
const policies = await loadActiveMarketingResearchPolicies(db);
const researchProvider = createPolicyBoundMarketingResearchProvider({ db, policies });
const textProviders = await loadMarketingTextAgentProviders({ db, env: process.env });
const worker = new MarketingAgentWorker({
  store: new PostgresMarketingAgentRunStore(db),
  providers: [...(researchProvider ? [researchProvider] : []), ...textProviders],
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => abortController.abort());
}
process.on("message", (message) => {
  if (message?.type === "creator-dev-stop") abortController.abort();
});

console.info(`[marketing-agent] Worker started. researchPolicies=${policies.length} textProviders=${textProviders.length} batchSize=${batchSize} intervalMs=${intervalMs}`);
try {
  while (!abortController.signal.aborted) {
    const startedAt = Date.now();
    const results = await worker.processUntilIdle(batchSize);
    for (const result of results) {
      console.info(`[marketing-agent] run=${result.runId} stage=${result.stage} status=${result.status}${result.failureCode ? ` code=${result.failureCode}` : ""}`);
    }
    await wait(Math.max(0, intervalMs - (Date.now() - startedAt)), abortController.signal);
  }
} finally {
  await db.close();
  console.info("[marketing-agent] Worker stopped.");
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
