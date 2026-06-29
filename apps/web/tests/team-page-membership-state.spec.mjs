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

  assert.match(html, /创建子账户/);
  assert.match(html, /已获得团队协作资格/);
  assert.doesNotMatch(html, /team-ops-hero/);
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
  assert.match(html, /创建子账户/);
  assert.doesNotMatch(html, /team-ops-hero/);
  assert.doesNotMatch(html, /团队成员管理已开通/);
});

test("team member list paginates at 10 rows per page", () => {
  const members = Array.from({ length: 12 }, (_, index) => ({
    id: `member-${index + 1}`,
    memberAccount: `member${index + 1}`,
    memberLoginAccount: `member${index + 1}@team`,
    memberName: `成员 ${index + 1}`,
    memberCredits: index + 1,
    status: "enabled",
  }));
  const html = renderLibraryTeam({
    route: "team",
    overview: {
      entitlements: { teamMemberManagement: true },
      team: { activated: true, memberCount: 12 },
      seats: { used: 12, limit: 50, remaining: 38 },
      permissions: {
        canReadMembers: true,
        canCreateMember: true,
        canViewDashboard: true,
      },
    },
    members,
  });

  assert.match(html, /共 12 条/);
  assert.match(html, /1 \/ 2/);
  assert.match(html, /成员 10/);
  assert.doesNotMatch(html, /member11@team/);
});

test("team member list renders edit disable and delete actions", () => {
  const html = renderLibraryTeam({
    route: "team",
    overview: {
      entitlements: { teamMemberManagement: true },
      team: { activated: true, memberCount: 1 },
      seats: { used: 1, limit: 50, remaining: 49 },
      permissions: {
        canReadMembers: true,
        canCreateMember: true,
        canViewDashboard: true,
      },
    },
    members: [
      {
        id: "member-1",
        memberAccount: "123",
        memberLoginAccount: "123@team",
        memberName: "成员一号",
        creditBalance: 22,
        status: "enabled",
      },
    ],
  });

  assert.match(html, /data-action="open-edit-member"/);
  assert.match(html, /data-action="toggle-team-member-status"/);
  assert.match(html, /data-action="delete-team-member"/);
  assert.match(html, /启用/);
  assert.match(html, /删除/);
});

test("team member list renders the selected page", () => {
  const members = Array.from({ length: 12 }, (_, index) => ({
    id: `member-${index + 1}`,
    memberAccount: `member${index + 1}`,
    memberLoginAccount: `member${index + 1}@team`,
    memberName: `成员 ${index + 1}`,
    memberCredits: index + 1,
    status: "enabled",
  }));
  const html = renderLibraryTeam({
    route: "team",
    memberPage: 2,
    overview: {
      entitlements: { teamMemberManagement: true },
      team: { activated: true, memberCount: 12 },
      seats: { used: 12, limit: 50, remaining: 38 },
      permissions: {
        canReadMembers: true,
        canCreateMember: true,
        canViewDashboard: true,
      },
    },
    members,
  });

  assert.match(html, /2 \/ 2/);
  assert.match(html, /成员 11/);
  assert.doesNotMatch(html, /成员 10/);
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

  assert.match(html, /创建子账户/);
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

test("team member create modal safely ignores null state", () => {
  const html = renderLibraryTeam({
    route: "team",
    overview: {
      entitlements: { teamMemberManagement: true },
      team: { activated: true, memberCount: 1 },
      seats: { used: 1, limit: 50, remaining: 49 },
      permissions: {
        canReadMembers: true,
        canCreateMember: true,
        canViewDashboard: true,
      },
    },
    members: [],
    createMemberModal: null,
  });

  assert.doesNotMatch(html, /data-modal="team-member-create"/);
});

test("team member create modal renders the fixed account suffix beside the input", () => {
  const html = renderLibraryTeam({
    route: "team",
    overview: {
      entitlements: { teamMemberManagement: true },
      team: { activated: false, memberCount: 0 },
      seats: { used: 0, limit: 50, remaining: 50 },
      permissions: {
        canReadMembers: true,
        canCreateMember: true,
        canViewDashboard: true,
      },
      teamAccountSuffix: "abc123",
    },
    members: [],
    createMemberModal: {
      open: true,
      draft: {
        teamAccount: "director001",
      },
    },
  });

  assert.match(html, /class="library-team-account-input-group"/);
  assert.match(html, /value="director001"/);
  assert.match(html, /<strong>@abc123<\/strong>/);
  assert.doesNotMatch(html, /value="director001@abc123"/);
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
  assert.match(html, /data-action="show-library-placeholder"/);
  assert.doesNotMatch(html, /专业版已开通/);
});
