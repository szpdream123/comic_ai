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
    session: { user: { phone: "+86 13800138000", displayName: "灵曦导演", email: "creator@lingxi.ai" } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "workspace",
      accountSettingsOpen: true,
      accountSettingsForm: {
        displayName: "灵曦导演",
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
