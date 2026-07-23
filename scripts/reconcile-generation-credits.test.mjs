import assert from "node:assert/strict";
import { test } from "node:test";

import { parseGenerationCreditReconciliationArgs } from "./reconcile-generation-credits.mjs";

test("generation credit reconciliation defaults to dry-run", () => {
  assert.deepEqual(parseGenerationCreditReconciliationArgs([]), { apply: false, limit: 100 });
  assert.deepEqual(parseGenerationCreditReconciliationArgs(["--limit=5"]), { apply: false, limit: 5 });
});

test("generation credit reconciliation requires an exact apply confirmation", () => {
  assert.throws(
    () => parseGenerationCreditReconciliationArgs(["--apply"]),
    /--confirm=APPLY_GENERATION_CREDIT_RECONCILIATION/,
  );
  assert.deepEqual(
    parseGenerationCreditReconciliationArgs([
      "--apply",
      "--confirm=APPLY_GENERATION_CREDIT_RECONCILIATION",
    ]),
    { apply: true, limit: 100 },
  );
});
