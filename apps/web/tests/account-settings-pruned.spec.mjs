import assert from "node:assert/strict";
import test from "node:test";

import { renderProjectDetail } from "../src/features/production-workbench/project-detail.js";

test("account settings drawer omits email and notification sections", () => {
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
    session: { user: { phone: "+86 13800138000", displayName: "鐏垫洣瀵兼紨", email: "creator@lingxi.ai" } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "workspace",
      accountSettingsOpen: true,
      accountSettingsForm: {
        displayName: "鐏垫洣瀵兼紨",
        phone: "+86 13800138000",
        email: "creator@lingxi.ai",
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
        notifications: {
          projectUpdates: true,
          renderComplete: true,
          marketing: false,
        },
      },
    },
  });

  const drawerHtml = html.slice(html.indexOf("account-settings-drawer"));

  assert.doesNotMatch(drawerHtml, /登录邮箱/);
  assert.doesNotMatch(drawerHtml, /消息通知/);
  assert.doesNotMatch(drawerHtml, /创作结果通知/);
  assert.match(drawerHtml, /绑定手机号/);
  assert.match(drawerHtml, /修改密码/);
});

test("account settings drawer promotes success toast above the overlay", () => {
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
    session: { user: { phone: "+86 13800138000", displayName: "Test User" } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "workspace",
      accountSettingsOpen: true,
      toast: "saved",
      accountSettingsForm: {
        displayName: "Test User",
        phone: "+86 13800138000",
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
        notifications: {
          projectUpdates: true,
          renderComplete: true,
          marketing: false,
        },
      },
    },
  });

  assert.match(html, /global-workbench-toast success account-settings-toast/);
  assert.equal((html.match(/id="workspace-status"/g) ?? []).length, 1);
  assert.equal((html.match(/interior-toast/g) ?? []).length, 0);
});

test("statusbar account popover uses display name after profile updates", () => {
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
    session: { user: { phone: "+86 13800138000", displayName: "新导演昵称" } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "workspace",
    },
  });

  assert.match(html, /<strong>新导演昵称<\/strong>/);
  assert.doesNotMatch(html, /创作者 13800138000/);
});

test("community header shows an avatar with current user info popover", () => {
  const html = renderProjectDetail({
    state: {},
    session: { user: { phone: "+86 13800138000", displayName: "社区导演" } },
    ui: {
      activeNavTab: "community",
    },
  });

  assert.match(html, /community-window-avatar/);
  assert.match(html, /当前登录用户/);
  assert.match(html, /社区导演/);
  assert.match(html, /\+86 13800138000/);
});
