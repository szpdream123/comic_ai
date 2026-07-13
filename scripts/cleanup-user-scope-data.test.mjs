import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { stripLegacyScopeKeys } from "./cleanup-user-scope-data.mjs";

describe("user-scope data cleanup", () => {
  it("removes legacy scope keys recursively without changing other metadata", () => {
    const workspaceKey = ["workspace", "Id"].join("");
    const targetOrganizationKey = ["target", "Organization", "Id"].join("");
    const organizationColumn = ["organization", "_id"].join("");
    assert.deepEqual(
      stripLegacyScopeKeys({
        keep: "value",
        [workspaceKey]: "old-workspace",
        nested: {
          [targetOrganizationKey]: "old-organization",
          keep: true,
        },
        list: [{ [organizationColumn]: "old-organization" }, { keep: 1 }],
      }),
      { keep: "value", nested: { keep: true }, list: [{}, { keep: 1 }] },
    );
  });
});
