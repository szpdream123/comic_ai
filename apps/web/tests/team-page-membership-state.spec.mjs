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

test("active professional membership status unlocks team management while overview is stale", () => {
  const html = renderLibraryTeam({
    route: "team",
    overview: {
      entitlements: {
        teamMemberManagement: false,
        teamAssetLibrary: false,
        teamDashboard: false,
      },
      team: { activated: false, memberCount: 0 },
      seats: { used: 0, limit: 0, remaining: 0 },
      credits: { allocatable: 13299 },
      permissions: {
        canReadMembers: true,
        canCreateMember: true,
        canViewDashboard: true,
      },
    },
    members: [],
    membershipStatus: {
      status: "professional_active",
      currentTier: "professional",
      currentPeriodEndAt: "2026-07-20T00:00:00.000Z",
      entitlements: {
        teamMemberManagement: true,
      },
      team: {
        seatLimit: 50,
      },
    },
  });

  assert.match(html, /创建第一个成员账号/);
  assert.match(html, /已获得团队协作资格/);
  assert.match(html, /data-action="open-team-member-create"/);
  assert.doesNotMatch(html, /开通专业版/);
});

test("active professional membership overrides stale team create permission", () => {
  const html = renderLibraryTeam({
    route: "team",
    overview: {
      entitlements: {
        teamMemberManagement: false,
        teamAssetLibrary: false,
        teamDashboard: false,
      },
      team: { activated: false, memberCount: 0 },
      seats: { used: 0, limit: 0, remaining: 0 },
      credits: { allocatable: 13299 },
      permissions: {
        canReadMembers: true,
        canCreateMember: false,
        canViewDashboard: false,
      },
    },
    members: [],
    membershipStatus: {
      status: "professional_active",
      currentTier: "professional",
      currentPeriodEndAt: "2026-07-20T00:00:00.000Z",
      entitlements: {
        teamMemberManagement: true,
      },
      team: {
        seatLimit: 50,
      },
    },
  });

  assert.match(html, /data-action="open-team-member-create"/);
  assert.doesNotMatch(html, /去开通/);
  assert.doesNotMatch(html, /当前账号没有创建成员权限/);
});

test("experience membership without team entitlement opens the existing professional pricing flow", () => {
  const html = renderLibraryTeam({
    route: "team",
    overview: {
      entitlements: {
        teamMemberManagement: false,
        teamAssetLibrary: false,
        teamDashboard: false,
      },
      team: { activated: false, memberCount: 0 },
      seats: { used: 0, limit: 0, remaining: 0 },
      credits: { allocatable: 800 },
      permissions: {
        canReadMembers: true,
        canCreateMember: true,
        canViewDashboard: true,
      },
    },
    members: [],
    membershipStatus: {
      status: "experience_active",
      currentTier: "experience",
      currentPeriodEndAt: "2026-06-27T08:00:00.000Z",
    },
  });

  assert.match(html, /团队资产库为专业版会员权益/);
  assert.match(html, /data-action="open-pricing"/);
  assert.match(html, /开通专业版/);
  assert.doesNotMatch(html, /data-action="open-team-member-create"/);
  assert.doesNotMatch(html, /专业版已开通/);
});
