import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addMembershipDuration } from "../membership-period.service.ts";

describe("membership period service", () => {
  it("clamps month-based durations to the last valid calendar day", () => {
    assert.equal(
      addMembershipDuration(new Date("2026-01-31T08:00:00.000Z"), "month", 1).toISOString(),
      "2026-02-28T08:00:00.000Z",
    );
    assert.equal(
      addMembershipDuration(new Date("2026-11-30T08:00:00.000Z"), "quarter", 1).toISOString(),
      "2027-02-28T08:00:00.000Z",
    );
    assert.equal(
      addMembershipDuration(new Date("2024-02-29T08:00:00.000Z"), "year", 1).toISOString(),
      "2025-02-28T08:00:00.000Z",
    );
  });
});
