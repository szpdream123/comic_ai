import assert from "node:assert/strict";
import test from "node:test";

import { renderScriptManagementPage } from "../src/features/production-workbench/script-page.js";

test("script management shows creation entries when no backend script exists", () => {
  const html = renderScriptManagementPage({ state: {}, ui: {} });

  assert.match(html, /class="script-entry-grid"/);
  assert.match(html, /从分析开始改编小说/);
  assert.match(html, /暂无剧本/);
});

test("script management shows creation entries above cover tabs when backend script exists", () => {
  const html = renderScriptManagementPage({
    state: {
      projectDetail: {
        project: {
          id: "project-1",
          name: "第一个项目",
          phase: "asset_review",
          coverImageUrl: "/uploads/project-1/cover.png",
          updatedAt: "2026-06-09T04:45:00.000Z",
        },
        script: {
          id: "script-1",
          inputText: "第一集：主角进入废土城市。",
          status: "ready",
          updatedAt: "2026-06-09T04:45:00.000Z",
        },
        episodes: [{ id: "episode-1" }],
        shots: [],
      },
    },
    ui: { scriptCardMenuId: "script-1" },
  });

  assert.match(html, /class="script-entry-grid"/);
  assert.match(html, /小说改编剧本/);
  assert.match(html, /AI 创作剧本/);
  assert.ok(html.indexOf('class="script-entry-grid"') < html.indexOf('class="script-cover-tabs"'));
  assert.match(html, /class="script-cover-tabs"/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /class="script-project-card active"/);
  assert.match(html, /class="script-project-menu-button"/);
  assert.match(html, /data-action="toggle-script-card-menu"/);
  assert.match(html, /data-action="upload-script-cover"/);
  assert.match(html, /data-action="rename-script-card"/);
  assert.match(html, /data-action="delete-script-card"/);
  assert.doesNotMatch(html, /data-action="toggle-project-card-menu"/);
  assert.doesNotMatch(html, /data-action="upload-project-cover"/);
  assert.doesNotMatch(html, /data-action="rename-project-card"/);
  assert.doesNotMatch(html, /data-action="delete-project-card"/);
  assert.match(html, /class="script-project-poster needs-cover"/);
  assert.match(html, /上传封面/);
  assert.doesNotMatch(html, /src="\/uploads\/project-1\/cover\.png"/);
  assert.doesNotMatch(html, /class="script-record-list"/);
  assert.doesNotMatch(html, /class="script-record-card"/);
  assert.doesNotMatch(html, /class="script-record-tabpanel"/);
  assert.doesNotMatch(html, /class="script-credit-note"/);
  assert.match(html, /第一个项目/);
});

test("script management uses script cover instead of project cover fallback", () => {
  const html = renderScriptManagementPage({
    state: {
      projectDetail: {
        project: {
          id: "project-1",
          name: "项目一",
          coverImageUrl: "/uploads/project-1/project-cover.png",
        },
        script: {
          id: "script-1",
          title: "剧本一",
          coverImageUrl: "/uploads/scripts/script-cover.png",
          inputText: "正文",
          status: "ready",
        },
        episodes: [],
        shots: [],
      },
    },
    ui: {},
  });

  assert.match(html, /class="script-project-poster has-cover"/);
  assert.match(html, /src="\/uploads\/scripts\/script-cover\.png"/);
  assert.doesNotMatch(html, /src="\/uploads\/project-1\/project-cover\.png"/);
});

test("script project card shows compact title row without status or created time", () => {
  const html = renderScriptManagementPage({
    state: {
      projectDetail: {
        project: {
          id: "project-1",
          name: "项目原名",
          createdAt: "2026-06-09T04:45:00.000Z",
          phase: "asset_review",
        },
        script: {
          id: "script-1",
          title: "超过五个字标题",
          inputText: "正文",
          status: "ready",
        },
        episodes: [],
        shots: [],
      },
    },
    ui: {},
  });

  assert.match(html, />超过五个字\.\.\.<\/h2>/);
  assert.doesNotMatch(html, /创建于/);
  assert.doesNotMatch(html, /2026\/06\/09/);
  assert.doesNotMatch(html, /class="script-project-status"/);
  assert.ok(html.indexOf("超过五个字...") < html.indexOf("script-project-menu-button"));
});

test("script management renders detail reader when a script is opened", () => {
  const html = renderScriptManagementPage({
    state: {
      projectDetail: {
        project: {
          id: "project-1",
          name: "偷偷靠近你",
          phase: "asset_review",
          updatedAt: "2026-06-09T04:45:00.000Z",
        },
        script: {
          id: "script-1",
          inputText: "故事开启于青藤。第一集正文内容。",
          status: "ready",
          updatedAt: "2026-06-09T04:45:00.000Z",
        },
        episodes: [
          { id: "episode-1", title: "第1卡：双重马甲下的初次交锋", sequence: 1, scriptText: "第一集试读内容。" },
          { id: "episode-2", title: "第2卡：家变剧痛", sequence: 2, scriptText: "第二集试读内容。" },
        ],
        shots: [],
      },
    },
    ui: {
      scriptDetailOpen: true,
      selectedScriptEpisodeId: "episode-2",
    },
  });

  assert.match(html, /class="script-reader-page"/);
  assert.doesNotMatch(html, /class="script-reader-tabs"/);
  assert.doesNotMatch(html, /剧本基本信息/);
  assert.match(html, /class="script-reader-save"/);
  assert.match(html, /data-action="save-script-reader-section"/);
  assert.match(html, /class="script-reader-add"/);
  assert.match(html, /data-action="add-script-reader-section"/);
  assert.match(html, /class="script-reader-editor"/);
  assert.match(html, /data-role="script-reader-editor"/);
  assert.match(html, /第2卡：家变剧痛/);
  assert.match(html, /第二集试读内容。/);
  assert.doesNotMatch(html, /class="script-entry-grid"/);
  assert.doesNotMatch(html, /class="script-library-panel"/);
});

test("script reader supports inline title editing and added story sections", () => {
  const html = renderScriptManagementPage({
    state: {
      projectDetail: {
        project: { id: "project-1", name: "项目一" },
        script: { id: "script-1", inputText: "初始正文" },
        episodes: [],
        shots: [],
      },
    },
    ui: {
      scriptDetailOpen: true,
      selectedScriptEpisodeId: "added-1",
      editingScriptReaderSectionId: "added-1",
      scriptReaderSections: [{ id: "added-1", title: "新增剧情 1", text: "新剧情正文" }],
    },
  });

  assert.match(html, /data-role="script-reader-title-input"/);
  assert.match(html, /value="新增剧情 1"/);
  assert.match(html, /新剧情正文/);
});

test("script reader renders section delete affordance and confirmation dialog", () => {
  const html = renderScriptManagementPage({
    state: {
      projectDetail: {
        project: { id: "project-1", name: "项目一" },
        script: { id: "script-1", inputText: "初始正文" },
        episodes: [],
        shots: [],
      },
    },
    ui: {
      scriptDetailOpen: true,
      selectedScriptEpisodeId: "added-1",
      scriptReaderSections: [{ id: "added-1", title: "角色场景空态联调", text: "正文" }],
      scriptReaderDeleteTargetId: "added-1",
    },
  });

  assert.match(html, /data-action="open-script-reader-delete"/);
  assert.match(html, /data-action="confirm-script-reader-delete"/);
  assert.match(html, /确认删除/);
  assert.match(html, /角色场景空态联调/);
});
