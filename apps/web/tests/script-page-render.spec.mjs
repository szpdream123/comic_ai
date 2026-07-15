import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { renderAssetExtractModal } from "../src/features/production-workbench/asset-extract-modal.js";
import { renderScriptManagementPage } from "../src/features/production-workbench/script-page.js";

test("script management shows creation entries when no backend script exists", () => {
  const html = renderScriptManagementPage({ state: {}, ui: {} });

  assert.match(html, /class="script-creation-stack"/);
  assert.match(html, /分析后改编/);
  assert.match(html, /直接改编/);
  assert.doesNotMatch(html, /AI 创作剧本/);
  assert.doesNotMatch(html, /open-original-script-modal/);
  assert.match(html, /暂无剧本/);
});

test("script management does not fall back to a project script after the library loads empty", () => {
  const html = renderScriptManagementPage({
    state: {
      projectDetail: {
        project: { id: "project-1", name: "整体测试项目" },
        script: { id: "script-legacy", title: "整体测试项目剧本", inputText: "旧剧本正文" },
      },
    },
    ui: {
      scriptLibraryLoaded: true,
      scriptLibraryRecords: [],
    },
  });

  assert.match(html, /暂无剧本/);
  assert.match(html, /class="script-cover-tabs"/);
  assert.match(html, /class="script-creation-stack"/);
  assert.doesNotMatch(html, /class="script-project-card/);
  assert.doesNotMatch(html, /整体测试项目剧本/);
});

test("team member script management waits for assigned scripts instead of showing creation entries", () => {
  const html = renderScriptManagementPage({
    state: {},
    ui: {},
    session: { user: { actorType: "team_member" } },
  });

  assert.doesNotMatch(html, /class="script-creation-stack"/);
  assert.doesNotMatch(html, /data-action="open-script-modal"/);
  assert.doesNotMatch(html, /data-action="open-original-script-modal"/);
  assert.match(html, /请联系管理员分配/);
});

test("script management keeps analysis and direct adaptation modal entries separate", () => {
  const html = renderScriptManagementPage({ state: {}, ui: {} });
  const buttons = [...html.matchAll(/<button[^>]*data-action="open-script-modal"[^>]*>/g)]
    .map((match) => match[0]);

  assert.equal(buttons.length, 2);
  assert.match(buttons[0], /data-script-modal-mode="manual"/);
  assert.match(buttons[1], /data-script-modal-mode="upload"/);
});

test("direct novel adaptation modal only renders the script upload tab", () => {
  const html = renderAssetExtractModal({
    show: true,
    mode: "upload",
    activeTab: "script-library",
  });

  assert.equal([...html.matchAll(/data-action="switch-script-tab"/g)].length, 1);
  assert.match(html, /data-tab="script-upload"/);
  assert.doesNotMatch(html, /data-tab="script-library"/);
});

test("script upload modal close button is pinned to the far-right grid column", () => {
  const css = readFileSync(
    new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
    "utf8",
  );
  const closeBlock = css.match(/\.upload-modal-close\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

  assert.match(closeBlock, /grid-column:\s*4/);
});

test("script management keeps entry and bulk action buttons responsive on narrow screens", () => {
  const css = readFileSync(
    new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
    "utf8",
  );

  assert.match(css, /\.script-entry-actions\s*\{[\s\S]*flex-wrap:\s*wrap/);
  assert.match(css, /\.script-bulk-actions\s*\{[\s\S]*flex-wrap:\s*wrap/);
  assert.match(css, /\.script-creation-stack\s*\{[\s\S]*grid-template-rows:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.script-bulk-actions > \.script-bulk-button\s*\{[\s\S]*width:\s*100%/);
});

test("script and canvas pagination are pinned to the bottom of their panels", () => {
  const css = readFileSync(
    new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
    "utf8",
  );

  assert.match(css, /\.script-management-page\s*\{[\s\S]*display:\s*flex/);
  assert.match(css, /\.script-library-panel\s*\{[\s\S]*flex:\s*1 1 auto[\s\S]*flex-direction:\s*column/);
  assert.match(css, /\.project-interior-main\s*\{[\s\S]*display:\s*flex[\s\S]*height:\s*100%/);
  assert.match(css, /\.script-library-panel \.project-gallery-pagination\s*\{[\s\S]*margin-top:\s*auto/);
  assert.match(css, /\.canvas-project-gallery\s*\{[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column/);
  assert.match(css, /\.canvas-project-gallery\s*\{[\s\S]*min-height:\s*calc\(100dvh - 6\.7rem\)/);
  assert.match(css, /\.canvas-project-gallery \.project-gallery-pagination\s*\{[\s\S]*margin-top:\s*auto/);
});

test("project, script, and canvas galleries keep their fixed desktop grids", () => {
  const css = readFileSync(
    new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
    "utf8",
  );

  assert.match(css, /\.project-gallery-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.script-cover-tablist\s*\{[\s\S]*grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.canvas-project-card-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/);
});

test("script creation cards use the active workbench theme tokens", () => {
  const css = readFileSync(
    new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
    "utf8",
  );

  assert.match(css, /\.script-creation-card\s*\{[^}]*background:\s*var\(--theme-control-background\)/);
  assert.match(css, /\.script-creation-card\.primary\s*\{[^}]*background:\s*var\(--theme-control-active-background\)/);
  assert.match(css, /\.script-creation-card\.primary\s*\{[^}]*color:\s*var\(--theme-control-active-text\)/);
  assert.match(css, /\.script-creation-card\.secondary \.script-creation-card-icon\s*\{[^}]*color:\s*var\(--theme-accent-icon\)/);
});

test("script management does not render default status toast", () => {
  const html = renderScriptManagementPage({ state: {}, ui: {} });

  assert.doesNotMatch(html, /id="app-status"/);
});

test("script management renders action feedback as global status toast", () => {
  const successHtml = renderScriptManagementPage({ state: {}, ui: { toast: "已重命名为 新剧本。" } });
  const errorHtml = renderScriptManagementPage({ state: {}, ui: { toast: "删除失败：权限不足" } });

  assert.match(successHtml, /id="app-status"/);
  assert.match(successHtml, /global-workbench-toast success/);
  assert.match(successHtml, /操作成功/);
  assert.match(successHtml, /已重命名为 新剧本。/);
  assert.match(errorHtml, /global-workbench-toast error/);
  assert.match(errorHtml, /操作失败/);
  assert.match(errorHtml, /删除失败：权限不足/);
});

test("script management shows stacked creation entries before the first script", () => {
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

  assert.match(html, /class="script-creation-stack"/);
  assert.match(html, /小说改编/);
  assert.doesNotMatch(html, /AI 创作剧本/);
  assert.doesNotMatch(html, /open-original-script-modal/);
  assert.match(html, /class="script-cover-tabs"/);
  assert.ok(html.indexOf('class="script-creation-stack"') > html.indexOf('class="script-cover-tablist"'));
  assert.ok(html.indexOf('class="script-creation-stack"') < html.indexOf('class="script-project-card'));
  assert.match(html, /role="tablist"/);
  assert.match(html, /class="script-project-card[^"]*\bactive\b/);
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

test("script management renders every script returned by project detail", () => {
  const html = renderScriptManagementPage({
    state: {
      projectDetail: {
        project: {
          id: "project-1",
          name: "多剧本项目",
          phase: "asset_review",
        },
        script: {
          id: "script-old",
          projectId: "project-1",
          title: "旧剧本",
          status: "ready",
          inputText: "旧剧本正文",
          updatedAt: "2026-06-10T10:00:00.000Z",
        },
        scripts: [
          {
            id: "script-new",
            projectId: "project-1",
            title: "新保存剧本",
            status: "ready",
            inputText: "新保存剧本正文",
            updatedAt: "2026-06-10T11:00:00.000Z",
          },
          {
            id: "script-old",
            projectId: "project-1",
            title: "旧剧本",
            status: "ready",
            inputText: "旧剧本正文",
            updatedAt: "2026-06-10T10:00:00.000Z",
          },
        ],
        episodes: [],
        shots: [],
      },
    },
    ui: {},
  });

  assert.match(html, /script-new/);
  assert.match(html, /script-old/);
  assert.match(html, /新保存/);
  assert.match(html, /旧剧本/);
});

test("script management paginates script cards like the project gallery", () => {
  const html = renderScriptManagementPage({
    state: {
      projectDetail: {
        project: {
          id: "project-1",
          name: "分页剧本项目",
          phase: "asset_review",
        },
        scripts: Array.from({ length: 12 }, (_, index) => ({
          id: `script-${index + 1}`,
          projectId: "project-1",
          title: `剧本 ${String(index + 1).padStart(2, "0")}`,
          status: "ready",
          inputText: `第 ${index + 1} 本剧本正文`,
          updatedAt: `2026-06-${String(12 - index).padStart(2, "0")}T11:00:00.000Z`,
        })),
        episodes: [],
        shots: [],
      },
    },
    ui: {
      scriptSortOrder: "title-asc",
      singleEpisodeScriptLibraryPagination: {
        page: 2,
        pageSize: 10,
        total: 12,
        totalPages: 2,
        mode: "local",
      },
    },
  });

  assert.match(html, /class="project-gallery-pagination"/);
  assert.match(html, /data-action="change-script-page"/);
  assert.match(html, /class="project-gallery-page-button active"/);
  assert.match(html, /data-page="2"/);
  assert.match(html, /剧本 11/);
  assert.match(html, /剧本 12/);
  assert.doesNotMatch(html, /剧本 01/);
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
  assert.doesNotMatch(html, /class="script-creation-stack"/);
  assert.doesNotMatch(html, /class="script-library-panel"/);
});

test("script reader detail renders save success toast", () => {
  const html = renderScriptManagementPage({
    state: {
      projectDetail: {
        project: {
          id: "project-1",
          name: "偷偷靠近你",
        },
        script: {
          id: "script-1",
          inputText: "故事开启于青藤。第一集正文内容。",
          status: "ready",
        },
        episodes: [
          { id: "episode-1", title: "第1卡：双重马甲下的初次交锋", sequence: 1, scriptText: "第一集试读内容。" },
        ],
        shots: [],
      },
    },
    ui: {
      scriptDetailOpen: true,
      selectedScriptEpisodeId: "episode-1",
      toast: "剧本已保存。",
    },
  });

  assert.match(html, /class="workbench-toast global-workbench-toast success"/);
  assert.match(html, /剧本已保存。/);
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
