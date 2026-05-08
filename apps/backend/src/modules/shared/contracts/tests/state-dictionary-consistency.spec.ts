import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  paymentIntentStatuses,
  providerRequestStatuses,
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
});
