import assert from "node:assert/strict";
import { test } from "node:test";

import { renderProjectDetail } from "../src/features/production-workbench/project-detail.js";

function renderLoadingPreview(activeStage, responseText, options = {}) {
  return renderProjectDetail({
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
      projectInteriorSection: "episodes",
      selectedProjectCardId: "project-1",
      singleEpisodeAiPreview: {
        status: "loading",
        activeStage,
        scriptText: "剧本阶段已完成",
        scriptRawText: "剧本阶段已完成",
        assetPromptSteps: [
          {
            stage: activeStage,
            title: "提示词生成",
            promptText: `${activeStage} 阶段发送给 DeepSeek 的提示词`,
            responseText,
            status: "loading",
          },
        ],
        data: {
          displayTables: {
            characters: { title: "角色", rows: options.characters ?? [] },
            scenes: { title: "场景", rows: options.scenes ?? [] },
            props: { title: "道具", rows: options.props ?? [] },
            storyboards: { title: "分镜", rows: options.storyboards ?? [] },
          },
        },
      },
      toast: options.toast ?? "",
    },
  });
}

test("loading AI storyboard preview shows the raw live output panel while keeping tables visible", () => {
  const cases = [
    {
      stage: "character",
      responseText: "{\"characters\":[{\"characterName\":\"任小野\"}]}",
      tableTitle: /角色/,
      marker: /任小野/,
      options: {
        characters: [{ characterName: "任小野", characterDescription: "黑色短衣" }],
      },
    },
    {
      stage: "scene",
      responseText: "{\"scenes\":[{\"sceneName\":\"闵婶家门口\"}]}",
      tableTitle: /场景/,
      marker: /闵婶家门口/,
      options: {
        scenes: [{ sceneName: "闵婶家门口", sceneDescription: "傍晚微光" }],
      },
    },
    {
      stage: "prop",
      responseText: "{\"props\":[{\"propName\":\"饭盒\"}]}",
      tableTitle: /道具/,
      marker: /饭盒/,
      options: {
        props: [{ propName: "饭盒", propDescription: "旧布包裹" }],
      },
    },
  ];

  for (const item of cases) {
    const html = renderLoadingPreview(item.stage, item.responseText, item.options);

    assert.match(html, /single-episode-ai-live-output/);
    assert.match(html, /DeepSeek /);
    assert.match(html, item.tableTitle);
    assert.match(html, item.marker);
  }
});

test("project workspace renders action feedback as global status toast", () => {
  const successHtml = renderLoadingPreview("character", "{}", { toast: "已重命名为新角色。" });
  const errorHtml = renderLoadingPreview("character", "{}", { toast: "删除失败：权限不足" });
  const explicitErrorHtml = renderLoadingPreview("character", "{}", {
    toast: { tone: "error", message: "供应商模型不可用，积分已退还。" },
  });

  assert.match(successHtml, /id="workspace-status"/);
  assert.match(successHtml, /global-workbench-toast success/);
  assert.match(successHtml, /操作成功/);
  assert.match(successHtml, /已重命名为新角色。/);
  assert.match(errorHtml, /global-workbench-toast error/);
  assert.match(errorHtml, /操作失败/);
  assert.match(errorHtml, /删除失败：权限不足/);
  assert.match(explicitErrorHtml, /global-workbench-toast error/);
  assert.match(explicitErrorHtml, /操作失败/);
  assert.doesNotMatch(explicitErrorHtml, /操作成功/);
});

test("loading AI storyboard preview keeps long cell content bounded without capping storyboard rows", () => {
  const storyboards = Array.from({ length: 12 }, (_, index) => ({
    shotNo: index + 1,
    plot: `分镜剧情 ${index + 1}`,
    dialogue: "",
    durationSec: 3,
    timeRange: "",
    transition: "",
    shotDirection: "",
    imagePrompt: "图像提示词",
    videoPrompt: index === 0 ? "动态视频提示词".repeat(500) : `视频提示词 ${index + 1}`,
    shotDetails: "",
  }));

  const html = renderLoadingPreview("shot", "", { storyboards });

  assert.match(html, /分镜剧情 8/);
  assert.match(html, /分镜剧情 9/);
  assert.match(html, /分镜剧情 12/);
  assert.match(html, /已截断，仅展示最近 900 字符/);
});

test("ready AI storyboard preview shows a creating state while committing", () => {
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
      projectInteriorSection: "episodes",
      selectedProjectCardId: "project-1",
      singleEpisodeAiPreview: {
        status: "submitting",
        data: {
          displayTables: {
            script: { title: "剧本", rows: [], text: "任小野递出饭食。" },
            characters: { title: "角色", rows: [] },
            scenes: { title: "场景", rows: [] },
            props: { title: "道具", rows: [] },
            storyboards: { title: "分镜", rows: [] },
          },
        },
      },
    },
  });

  assert.match(html, /single-episode-ai-preview ready submitting/);
  assert.match(html, /创建中\.\.\./);
  assert.match(html, /创建中，请稍候，完成后会自动进入分镜工作台。/);
  assert.match(html, /data-action="commit-ai-storyboard-preview" disabled/);
});

test("ready AI storyboard preview renders sent DeepSeek prompts and raw shot response", () => {
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
      projectInteriorSection: "episodes",
      selectedProjectCardId: "project-1",
      singleEpisodeAiPreview: {
        status: "ready",
        assetPromptSteps: [
          {
            stage: "character",
            title: "角色提示词生成",
            promptText: "请抽取角色名称、角色描述与角色图片提示词。",
          },
          {
            stage: "shot",
            title: "分镜提示词生成",
            promptText: "请按分镜表输出，保留动作节奏与人物原声台词。",
            rawResponseText: "{\"storyboards\":[]}",
          },
        ],
        data: {
          displayTables: {
            script: { title: "剧本", rows: [] },
            characters: { title: "角色", rows: [] },
            scenes: { title: "场景", rows: [] },
            props: { title: "道具", rows: [] },
            storyboards: { title: "分镜", rows: [] },
          },
        },
      },
    },
  });

  assert.match(html, /角色提示词/);
  assert.match(html, /发送给 DeepSeek 的完整提示词/);
  assert.match(html, /请抽取角色名称、角色描述与角色图片提示词。/);
  assert.match(html, /分镜提示词/);
  assert.match(html, /DeepSeek 完整返回/);
  assert.match(html, /\{&quot;storyboards&quot;:\[\]\}/);
});

test("workspace account settings renders as a right drawer with profile and security fields", () => {
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
    session: { user: { phone: "+86 13800138000", displayName: "灵犀导演" } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "workspace",
      accountSettingsOpen: true,
      accountSettingsForm: {
        displayName: "灵犀导演",
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

  assert.match(html, /账号设置/);
  assert.match(html, /account-settings-drawer/);
  assert.match(html, /data-action="close-account-settings"/);
  assert.match(html, /显示昵称/);
  assert.match(html, /绑定手机号/);
  assert.match(html, /修改密码/);
  assert.match(html, /管理你的公开信息、登录安全与消息偏好/);
  assert.match(html, /更换/);
  assert.match(html, /取消/);
  assert.match(html, /保存更改/);
});
