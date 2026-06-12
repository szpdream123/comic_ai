import assert from "node:assert/strict";
import test from "node:test";

import { renderProjectDetail } from "../src/features/production-workbench/project-detail.js";

test("global statusbar renders the compact handbook commerce and icon actions", () => {
  const html = renderProjectDetail({
    state: {
      project: { id: "project-1", name: "try", phase: "asset_review", aspectRatio: "9:16" },
      projectDetail: {
        project: { id: "project-1", projectId: "project-1", name: "try" },
        episodes: [],
        assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
        shots: [],
      },
    },
    session: { user: { phone: "+86 13800138000" } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "workspace",
      projectInteriorSection: "overview",
    },
  });

  assert.match(html, /statusbar-quick-action text-action/);
  assert.match(html, /创作手册/);
  assert.match(html, /商务合作/);
  assert.match(html, /statusbar-quick-action credit-action/);
  assert.match(html, /statusbar-action-icon trailing/);
  assert.match(html, /statusbar-quick-action icon-action/);
  assert.match(html, /user-avatar-icon/);
  assert.match(html, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
});

test("global statusbar falls back to the current account credit balance", () => {
  const html = renderProjectDetail({
    state: {
      project: { id: "project-1", name: "try", phase: "asset_review", aspectRatio: "9:16" },
      projectDetail: {
        project: { id: "project-1", projectId: "project-1", name: "try" },
        episodes: [],
        assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
        shots: [],
      },
    },
    session: { user: { phone: "+86 13800138000", creditBalance: 1280 } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "workspace",
      projectInteriorSection: "overview",
    },
  });

  assert.match(html, /statusbar-quick-action credit-action/);
  assert.match(html, />1280<\/b>/);
});

test("global statusbar prefers the current user balance over stale config balance", () => {
  const html = renderProjectDetail({
    state: {
      project: { id: "project-1", name: "try", phase: "asset_review", aspectRatio: "9:16" },
      projectDetail: {
        project: { id: "project-1", projectId: "project-1", name: "try" },
        episodes: [],
        assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
        shots: [],
      },
    },
    session: { user: { phone: "+86 13800138000", availableCredits: 2036 } },
    ui: {
      activeNavTab: "project",
      creditBalance: 0,
      episodeGenerationConfig: { creditBalance: 0 },
      projectPanelMode: "workspace",
      projectInteriorSection: "overview",
    },
  });

  assert.match(html, /statusbar-quick-action credit-action/);
  assert.match(html, /data-action="open-credit-ledger"/);
  assert.match(html, />2036<\/b>/);
});

test("credit ledger drawer renders flat credit usage rows", () => {
  const html = renderProjectDetail({
    state: {
      project: { id: "project-1", name: "try", phase: "asset_review", aspectRatio: "9:16" },
      projectDetail: {
        project: { id: "project-1", projectId: "project-1", name: "try" },
        episodes: [],
        assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
        shots: [],
      },
    },
    session: { user: { phone: "+86 13800138000", availableCredits: 2036 } },
    ui: {
      activeNavTab: "tools",
      creditLedgerOpen: true,
      creditLedgerRows: [{
        id: "ledger-1",
        entryType: "consume",
        amount: 90,
        availableDelta: -90,
        sourceType: "generation_task",
        sourceId: "task-1",
        reason: "nano banana 2",
        metadata: { billingEvent: "consumed", modelCode: "nano_banana_2", taskId: "eb76876b-3d0d-49a5-8dc8-17b8200093a9" },
        createdAt: "2026-06-12T08:00:00.000Z",
      }, {
        id: "ledger-2",
        entryType: "release",
        amount: 80,
        availableDelta: 80,
        sourceType: "credit_reservation_allocation",
        sourceId: "task-2",
        reason: "reservation allocation released",
        metadata: { billingEvent: "released", mediaType: "image", taskId: "task-2", failureCode: "task_timeout" },
        createdAt: "2026-06-12T09:00:00.000Z",
      }],
      creditLedgerSummary: {
        displayAvailableCredits: 2036,
        displayReservedCredits: 0,
        totalConsumedCredits: 90,
      },
      creditLedgerMeta: { total: 1 },
    },
  });

  assert.match(html, /credit-ledger-drawer/);
  assert.match(html, /积分明细/);
  for (const header of ["任务ID", "类型", "说明", "可用变化", "失败|成功", "来源", "时间"]) {
    assert.match(html, new RegExp(header));
  }
  assert.match(html, /生成扣减/);
  assert.match(html, /nano banana 2/);
  assert.match(html, /data-full-id="eb76876b-3d0d-49a5-8dc8-17b8200093a9"/);
  assert.match(html, />eb7687</);
  assert.doesNotMatch(html, />eb76876b-3d0d-49a5-8dc8-17b8200093a9</);
  assert.match(html, /credit-ledger-description/);
  assert.match(html, /data-full-text=/);
  assert.match(html, /credit-ledger-description-text/);
  assert.match(html, /-90/);
  assert.match(html, /失败/);
  assert.match(html, /成功/);
  assert.doesNotMatch(html, /credit-ledger-detail-row/);
  assert.doesNotMatch(html, /账户事件/);
});
