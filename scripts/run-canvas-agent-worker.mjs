import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

loadDotEnvFile(join(process.cwd(), ".env"));

const [{ createDevDb, runWithDatabaseContext }, {
  createCanvasAgentWorkerRuntime,
  loadCanvasAgentRuntimeConfiguration,
}] = await Promise.all([
  import("../apps/backend/src/modules/shared/db/dev-db.ts"),
  import("../apps/backend/src/modules/canvas-agent/index.ts"),
]);

const db = await createDevDb();
const abortController = new AbortController();
const workerId = process.env.CANVAS_AGENT_WORKER_ID?.trim()
  || `canvas-agent:${hostname()}:${process.pid}:${randomUUID()}`;
const pollIntervalMs = positiveInteger(process.env.CANVAS_AGENT_WORKER_POLL_INTERVAL_MS, 1_000);
const batchSize = positiveInteger(process.env.CANVAS_AGENT_WORKER_BATCH_SIZE, 10);
const runtimeConfiguration = await loadCanvasAgentRuntimeConfiguration(db);
const runtime = createCanvasAgentWorkerRuntime({
  db,
  env: process.env,
  workerId,
  policy: runtimeConfiguration.policy,
  webSearchModelCode: runtimeConfiguration.webSearchModelCode,
  maxRounds: runtimeConfiguration.maxRounds,
  maxToolCalls: runtimeConfiguration.maxToolCalls,
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => requestStop(signal));
}
process.on("message", (message) => {
  if (message?.type === "creator-dev-stop") requestStop(message.signal ?? "SIGTERM");
});

function requestStop(signal) {
  if (abortController.signal.aborted) return;
  console.info(`[canvas-agent] Received ${signal}, draining current cycle...`);
  abortController.abort();
}

console.info(`[canvas-agent] Worker started. workerId=${workerId} batch=${batchSize} pollIntervalMs=${pollIntervalMs}`);
try {
  await runWithDatabaseContext(() => runtime.worker.runUntilStopped({
    signal: abortController.signal,
    pollIntervalMs,
    batchSize,
  }));
} finally {
  await db.close();
  console.info("[canvas-agent] Worker stopped.");
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
