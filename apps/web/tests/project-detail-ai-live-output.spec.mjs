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
            title: "角色提示词生成",
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
    },
  });
}

test("loading AI storyboard preview shows the active asset stage response", () => {
  const cases = [
    {
      stage: "character",
      title: /DeepSeek 角色实时返回/,
      responseText: "{\"characters\":[{\"characterName\":\"任小野\"}]}",
      marker: /任小野/,
      hiddenJsonKey: /characterName/,
    },
    {
      stage: "scene",
      title: /DeepSeek 场景实时返回/,
      responseText: "{\"scenes\":[{\"sceneName\":\"闵婶家门前\"}]}",
      marker: /闵婶家门前/,
      hiddenJsonKey: /sceneName/,
    },
    {
      stage: "prop",
      title: /DeepSeek 道具实时返回/,
      responseText: "{\"props\":[{\"propName\":\"饭食\"}]}",
      marker: /饭食/,
      hiddenJsonKey: /propName/,
    },
  ];

  for (const item of cases) {
    const html = renderLoadingPreview(item.stage, item.responseText);

    assert.match(html, item.title);
    assert.match(html, item.marker);
    assert.doesNotMatch(html, item.hiddenJsonKey);
    assert.doesNotMatch(html, /DeepSeek 剧本实时返回/);
  }
});

test("loading AI storyboard preview bounds live text and table rows", () => {
  const oldPrefix = "这是一段只应该出现在开头的旧内容";
  const oldText = `${oldPrefix}${"填充内容".repeat(4000)}`;
  const latestText = "最新实时返回";
  const hugeResponseText = `${oldText}${latestText}`;
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

  const html = renderLoadingPreview("shot", hugeResponseText, { storyboards });

  assert.match(html, /已截断，仅展示最近 12000 字符/);
  assert.match(html, new RegExp(latestText));
  assert.doesNotMatch(html, new RegExp(oldPrefix));
  assert.match(html, /实时预览仅展示前 8 条/);
  assert.match(html, /分镜剧情 8/);
  assert.doesNotMatch(html, /分镜剧情 9/);
  assert.match(html, /已截断，仅展示最近 900 字符/);
});
