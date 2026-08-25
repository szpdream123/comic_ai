import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { runRuntimeSchemaMigrations } from "./runtime-schema-migrations.mjs";
import { runtimeEnvFilePath } from "./runtime-env-file.mjs";

loadDotEnvFile(runtimeEnvFilePath());
if (process.env.CREATOR_DEV_STACK_MANAGED !== "true") {
  runRuntimeSchemaMigrations({ runtime: process.execPath, cwd: process.cwd(), env: process.env });
}

const [{ createDevDb }, { runMembershipMaintenance }] = await Promise.all([
  import("../apps/backend/src/modules/shared/db/dev-db.ts"),
  import("../apps/backend/src/modules/membership/membership-maintenance.service.ts"),
]);

const intervalMs = Number(process.env.MEMBERSHIP_MAINTENANCE_INTERVAL_MS ?? 60_000);
const limit = Number(process.env.MEMBERSHIP_MAINTENANCE_LIMIT ?? 100);
const db = await createDevDb();

let stopped = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopped = true;
  });
}

while (!stopped) {
  const started = Date.now();
  const result = await runMembershipMaintenance(db, { now: new Date(), limit });
  if (
    result.createdReminderCount ||
    result.deliveredReminderCount ||
    result.expiredMembershipCount ||
    result.expiredCreditAmount
  ) {
    console.info("[membership-maintenance]", JSON.stringify(result));
  }
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, intervalMs - (Date.now() - started))),
  );
}

await db.close();

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
