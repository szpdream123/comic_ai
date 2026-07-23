import { pathToFileURL } from "node:url";

import pg from "pg";

import { reconcileGenerationCredits } from "../apps/backend/src/modules/credit-billing/generation-credit-reconciliation.service.ts";

const { Pool } = pg;
const applyConfirmation = "APPLY_GENERATION_CREDIT_RECONCILIATION";

export function parseGenerationCreditReconciliationArgs(args) {
  const apply = args.includes("--apply");
  const confirmation = args.find((arg) => arg.startsWith("--confirm="))?.slice("--confirm=".length) ?? "";
  const limitArg = args.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length);
  const limit = limitArg ? Number(limitArg) : 100;
  if (!Number.isInteger(limit) || limit <= 0 || limit > 1000) {
    throw new Error("--limit must be an integer between 1 and 1000");
  }
  if (apply && confirmation !== applyConfirmation) {
    throw new Error(`--apply requires --confirm=${applyConfirmation}`);
  }
  return { apply, limit };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const options = parseGenerationCreditReconciliationArgs(process.argv.slice(2));
  const db = new Pool({ connectionString: databaseUrl });
  try {
    const report = await reconcileGenerationCredits(db, options);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`generation credit reconciliation failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
