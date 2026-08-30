import { existsSync, readFileSync } from "node:fs";

import {
  closeSharedDevDb,
  createDevDb,
} from "../apps/backend/src/modules/shared/db/dev-db.ts";

loadDotEnvFile(process.env.NODE_ENV === "production" ? ".env" : ".env.local");
process.env.CREATOR_DEV_STACK_MANAGED = "true";
process.env.COMIC_AI_SHARED_DATABASE_POOL = "true";

const [{ createPhoneAuthDevServer }] = await Promise.all([
  import("../apps/backend/src/entrypoints/phone-auth-dev-server.ts"),
]);

const db = await createDevDb();
const server = createPhoneAuthDevServer({
  db,
  allowProduction: process.env.NODE_ENV === "production",
  allowLocalDatabaseUrl: process.env.NODE_ENV === "production",
  listenHost: process.env.NODE_ENV === "production" ? (process.env.HOST ?? "0.0.0.0") : undefined,
  seedTeamEntitlements: process.env.SEED_TEAM_ENTITLEMENTS === "true",
});
const port = Number(process.env.PORT ?? "4310");
await server.listen(port);
console.info(`Comic AI shared runtime listening on ${server.origin}`);

const backgroundModules = isEnabled(process.env.BULLMQ_OUTBOX_DISPATCHER_ENABLED)
  || isEnabled(process.env.BULLMQ_WORKERS_ENABLED)
  ? backgroundModulePaths()
  : [];

let stopping = false;
for (const modulePath of backgroundModules) {
  void import(modulePath).catch((error) => {
    console.error(`[shared-runtime] Background service failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    void requestStop("background-service-failure", 1);
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void requestStop(signal, 0);
  });
}

async function requestStop(reason, exitCode) {
  if (stopping) return;
  stopping = true;
  console.info(`[shared-runtime] Received ${reason}; stopping services...`);
  // Worker entrypoints receive the same signal and release their Redis/listener handles.
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  await server.close().catch((error) => {
    console.error(`[shared-runtime] HTTP shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
    exitCode = 1;
  });
  await closeSharedDevDb().catch((error) => {
    console.error(`[shared-runtime] PostgreSQL pool shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
    exitCode = 1;
  });
  process.exit(exitCode);
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

function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function backgroundModulePaths() {
  if (process.env.NODE_ENV === "production") {
    return [
      "./generationOutbox.mjs",
      "./generationRepair.mjs",
      "./generationWorker.mjs",
      "./canvasAgent.mjs",
    ];
  }
  return [
    "./run-generation-outbox-dispatcher.mjs",
    "./run-generation-queue-maintenance.mjs",
    "./run-generation-video-worker.mjs",
    "./run-canvas-agent-worker.mjs",
  ];
}
