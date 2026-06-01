import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import {
  getTeamRoleCapabilities,
  teamBusinessRoles,
} from "../team-roles.ts";

describe("team roles", () => {
  it("gives admins full team management capabilities", () => {
    const adminCapabilities = getTeamRoleCapabilities("admin");

    assert.ok(adminCapabilities.includes(capabilities.teamMemberManageAll));
    assert.ok(adminCapabilities.includes(capabilities.teamGroupCreate));
    assert.ok(adminCapabilities.includes(capabilities.teamCreditAllocateAll));
    assert.ok(adminCapabilities.includes(capabilities.teamDashboardViewAll));
    assert.ok(adminCapabilities.includes(capabilities.episodeAssetDelete));
    assert.equal(adminCapabilities.includes(capabilities.billingRefund), false);
    assert.equal(adminCapabilities.includes(capabilities.opsSettle), false);
  });

  it("keeps group admins inside group-scoped management", () => {
    const groupAdminCapabilities = getTeamRoleCapabilities("group_admin");

    assert.ok(groupAdminCapabilities.includes(capabilities.teamMemberManageGroup));
    assert.ok(groupAdminCapabilities.includes(capabilities.teamCreditAllocateGroup));
    assert.ok(groupAdminCapabilities.includes(capabilities.teamDashboardViewGroup));
    assert.equal(groupAdminCapabilities.includes(capabilities.teamGroupCreate), false);
    assert.equal(groupAdminCapabilities.includes(capabilities.teamMemberManageAll), false);
  });

  it("keeps production roles away from team management", () => {
    const directorCapabilities = getTeamRoleCapabilities("director");

    assert.ok(directorCapabilities.includes(capabilities.projectView));
    assert.ok(directorCapabilities.includes(capabilities.scriptAssetCreate));
    assert.ok(directorCapabilities.includes(capabilities.episodeAssetCreate));
    assert.equal(directorCapabilities.includes(capabilities.teamMemberManageAll), false);
    assert.equal(directorCapabilities.includes(capabilities.teamCreditAllocateGroup), false);
  });

  it("defines all eight first-phase business roles", () => {
    assert.deepEqual(
      teamBusinessRoles.map((role) => role.key),
      [
        "admin",
        "group_admin",
        "director_plus",
        "animator_plus",
        "director",
        "animator",
        "screenwriter",
        "editor",
      ],
    );
  });
});
