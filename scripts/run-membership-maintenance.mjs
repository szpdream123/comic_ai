import { createDevDb } from "../apps/backend/src/modules/shared/db/dev-db.ts";
import { runMembershipMaintenance } from "../apps/backend/src/modules/membership/membership-maintenance.service.ts";

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
