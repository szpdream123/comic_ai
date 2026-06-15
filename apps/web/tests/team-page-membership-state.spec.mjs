import assert from "node:assert/strict";
import test from "node:test";

import { renderLibraryTeam } from "../src/features/library-team/index.js";

test("entitled solo professional account renders team setup instead of an active team dashboard", () => {
  const html = renderLibraryTeam({
    route: "team",
    overview: {
      entitlements: { teamMemberManagement: true },
      team: { activated: false, memberCount: 0 },
      seats: { used: 0, limit: 50, remaining: 50 },
      credits: { allocatable: 1200 },
      permissions: {
        canReadMembers: true,
        canCreateMember: true,
        canViewDashboard: true,
      },
    },
    members: [],
  });

  assert.match(html, /创建第一个成员账号/);
  assert.match(html, /已获得团队协作资格/);
  assert.doesNotMatch(html, /data-action="open-team-dashboard"/);
  assert.doesNotMatch(html, /专业版已开通/);
});

test("professional account with members renders the active team dashboard entry", () => {
  const html = renderLibraryTeam({
    route: "team",
    overview: {
      entitlements: { teamMemberManagement: true },
      team: { activated: true, memberCount: 1 },
      seats: { used: 1, limit: 50, remaining: 49 },
      credits: { allocatable: 1200 },
      permissions: {
        canReadMembers: true,
        canCreateMember: true,
        canViewDashboard: true,
      },
    },
    members: [
      {
        id: "member-1",
        phone: "13800138002",
        userId: "user-1",
        role: "producer",
        status: "enabled",
      },
    ],
  });

  assert.match(html, /data-action="open-team-dashboard"/);
  assert.match(html, /专业版已开通/);
  assert.match(html, /创建成员账号/);
});
