import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calibrationItemStatuses,
  calibrationSessionStatuses,
  exportStatuses,
  paymentIntentStatuses,
  providerRequestStatuses,
  reconciliationItemStatuses,
  reconciliationRunStatuses,
} from "../../../../../../../packages/contracts/domain/states.ts";

describe("state dictionary consistency", () => {
  it("uses result_unknown for provider requests and never unknown", () => {
    assert.ok(providerRequestStatuses.includes("result_unknown"));
    assert.equal(providerRequestStatuses.includes("unknown"), false);
  });

  it("keeps payment intent uncertainty separate from provider request uncertainty", () => {
    assert.ok(paymentIntentStatuses.includes("unknown"));
    assert.equal(providerRequestStatuses.includes("unknown"), false);
  });

  it("keeps calibration states aligned with the canonical dictionary", () => {
    assert.deepEqual(calibrationSessionStatuses, [
      "draft",
      "generating",
      "ready_for_review",
      "passed",
      "failed",
      "skipped",
      "archived",
    ]);

    assert.deepEqual(calibrationItemStatuses, [
      "pending",
      "generating",
      "succeeded",
      "failed",
      "review_required",
    ]);
  });

  it("keeps export states aligned with export package semantics", () => {
    assert.deepEqual(exportStatuses, ["preparing", "ready", "failed", "expired"]);
  });

  it("keeps reconciliation states complete for commercial gates", () => {
    assert.deepEqual(reconciliationRunStatuses, [
      "running",
      "succeeded",
      "failed",
      "partial_failed",
    ]);

    assert.deepEqual(reconciliationItemStatuses, [
      "open",
      "resolved",
      "manual_review_required",
      "ignored_with_reason",
    ]);
  });
});
