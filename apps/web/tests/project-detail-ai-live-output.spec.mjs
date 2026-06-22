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

test("loading AI storyboard preview keeps inferred tables while hiding the live output card and prompt panels", () => {
  const cases = [
    {
      stage: "character",
      responseText: "{\"characters\":[{\"characterName\":\"任小野\"}]}",
      marker: /任小野/,
      options: {
        characters: [{ characterName: "任小野", characterDescription: "黑色短衣" }],
      },
    },
    {
      stage: "scene",
      responseText: "{\"scenes\":[{\"sceneName\":\"闵婶家门口\"}]}",
      marker: /闵婶家门口/,
      options: {
        scenes: [{ sceneName: "闵婶家门口", sceneDescription: "傍晚微光" }],
      },
    },
    {
      stage: "prop",
      responseText: "{\"props\":[{\"propName\":\"饭盒\"}]}",
      marker: /饭盒/,
      options: {
        props: [{ propName: "饭盒", propDescription: "旧布包裹" }],
      },
    },
  ];

  for (const item of cases) {
    const html = renderLoadingPreview(item.stage, item.responseText, item.options);

    assert.match(html, /single-episode-ai-table-stack live/);
    assert.doesNotMatch(html, /single-episode-ai-live-output/);
    assert.doesNotMatch(html, /发送给 DeepSeek 的完整提示词/);
    assert.doesNotMatch(html, /AI .*实时返回/);
    assert.doesNotMatch(html, /data-prompt-stage=/);
    assert.match(html, item.marker);
  }
});

test("loading AI storyboard preview renders scene before character tables", () => {
  const html = renderLoadingPreview("character", "{\"characters\":[{\"characterName\":\"任小野\"}]}", {
    characters: [{ characterName: "任小野", characterDescription: "黑色短衣" }],
    scenes: [{ sceneName: "闵婶家门口", sceneDescription: "傍晚微光" }],
    props: [{ propName: "饭盒", propDescription: "旧布包裹" }],
  });

  assert.match(html, /single-episode-ai-table-stack live/);
  assert.ok(
    html.indexOf("single-episode-ai-table-card scenes") <
      html.indexOf("single-episode-ai-table-card characters"),
  );
});

test("ready AI storyboard preview hides DeepSeek prompt and raw response sections while keeping final tables", () => {
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
            responseText: "{\"characters\":[{\"characterName\":\"任小野\",\"characterDescription\":\"黑色短衣\"}]}",
          },
          {
            stage: "scene",
            title: "场景提示词生成",
            responseText: "{\"scenes\":[{\"sceneName\":\"闵婶家门口\",\"sceneDescription\":\"傍晚微光\"}]}",
          },
          {
            stage: "prop",
            title: "道具提示词生成",
            responseText: "{\"props\":[{\"propName\":\"饭盒\",\"propDescription\":\"旧布包裹\"}]}",
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
            characters: { title: "角色", rows: [{ characterName: "任小野", characterDescription: "黑色短衣" }] },
            scenes: { title: "场景", rows: [{ sceneName: "闵婶家门口", sceneDescription: "傍晚微光" }] },
            props: { title: "道具", rows: [{ propName: "饭盒", propDescription: "旧布包裹" }] },
            storyboards: { title: "分镜", rows: [] },
          },
        },
      },
    },
  });

  assert.doesNotMatch(html, /发送给 DeepSeek 的完整提示词/);
  assert.doesNotMatch(html, /请按分镜表输出，保留动作节奏与人物原声台词。/);
  assert.doesNotMatch(html, /data-prompt-stage=/);
  assert.doesNotMatch(html, /\{&quot;scenes&quot;:\[\{&quot;sceneName&quot;:&quot;闵婶家门口&quot;,&quot;sceneDescription&quot;:&quot;傍晚微光&quot;\}\]\}/);
  assert.doesNotMatch(html, /DeepSeek 完整返回/);
  assert.match(html, /single-episode-ai-table-stack/);
  assert.match(html, /single-episode-ai-table-card characters/);
  assert.match(html, /single-episode-ai-table-card scenes/);
  assert.match(html, /single-episode-ai-table-card props/);
  assert.ok(
    html.indexOf("single-episode-ai-table-card scenes") <
      html.indexOf("single-episode-ai-table-card characters"),
  );
});

test("AI storyboard preview hides all raw response blocks during streaming", () => {
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
        status: "loading",
        activeStage: "prop",
        assetPromptSteps: [
          {
            stage: "scene",
            title: "场景提示词生成",
            responseText: `| 场景名称 | 场景描述 |\n| --- | --- |\n| 城门口 | 黄昏冷风 |`,
            status: "done",
          },
          {
            stage: "character",
            title: "角色提示词生成",
            responseText: `| 角色名称 | 角色描述 |\n| --- | --- |\n| 任小野 | 黑色短衣 |`,
            status: "done",
          },
          {
            stage: "prop",
            title: "道具提示词生成",
            responseText: `| 道具名称 | 道具描述 |\n| --- | --- |\n| 饭盒 | 旧布包裹 |`,
            status: "loading",
          },
        ],
        data: {
          displayTables: {
            characters: { title: "角色", rows: [] },
            scenes: { title: "场景", rows: [] },
            props: { title: "道具", rows: [] },
            storyboards: { title: "分镜", rows: [] },
          },
        },
      },
    },
  });

  assert.doesNotMatch(html, /data-prompt-stage="scene-response"/);
  assert.doesNotMatch(html, /data-prompt-stage="character-response"/);
  assert.doesNotMatch(html, /data-prompt-stage="prop-response"/);
  assert.doesNotMatch(html, /single-episode-ai-live-output/);
  assert.doesNotMatch(html, /AI .*实时返回/);
});

test("ready AI storyboard preview no longer renders markdown raw response tables", () => {
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
            stage: "scene",
            title: "场景提示词生成",
            responseText: `
| 场景名称 | 场景描述 |
| --- | --- |
| 城门口 | 17岁少年停步回望的黄昏街口。 |
| 木屋区 | 旧木屋紧挨土路，灯火微弱。 |
`,
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

  assert.doesNotMatch(html, /single-episode-ai-response-table/);
  assert.doesNotMatch(html, /<pre>\s*\| 场景名称 \| 场景描述 \|/);
  assert.match(html, /single-episode-ai-table-stack/);
});

test("AI storyboard preview no longer renders raw response html content", () => {
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
            stage: "scene",
            title: "场景提示词生成",
            responseText: `
| 场景名称 | 场景描述 |
| --- | --- |
| 木屋前停步 | 【任小草/女】：“哥哥。”<br><br>【任小野/男】：“等我回来。”<script>alert(1)</script><br>人物停顿 |
`,
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

  assert.doesNotMatch(html, /哥哥。/);
  assert.doesNotMatch(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<br>人物停顿/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
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

test("loading AI storyboard preview no longer renders duplicated live storyboard tables", () => {
  const longVideoPrompt = [
    "BEGIN_LONG_VIDEO_PROMPT",
    "动态视频提示词".repeat(4200),
    "MIDDLE_LONG_VIDEO_PROMPT",
    "镜头动作、情绪节奏、环境声、角色微表情、转场方式、光影变化".repeat(900),
    "END_LONG_VIDEO_PROMPT",
  ].join("\n");
  const storyboards = Array.from({ length: 12 }, (_, index) => ({
    shotNo: index + 1,
    plot: `分镜剧情 ${index + 1}`,
    dialogue: "",
    durationSec: 3,
    timeRange: "",
    transition: "",
    shotDirection: "",
    imagePrompt: "图像提示词",
    videoPrompt: index === 0 ? longVideoPrompt : `视频提示词 ${index + 1}`,
    shotDetails: "",
  }));

  const html = renderLoadingPreview("shot", longVideoPrompt, { storyboards });

  assert.doesNotMatch(html, /single-episode-ai-live-output/);
  assert.doesNotMatch(html, /AI 分镜 实时返回/);
  assert.match(html, /single-episode-ai-table-stack live/);
  assert.equal((html.match(/single-episode-ai-table-card storyboards/g) ?? []).length, 1);
});

test("ready AI storyboard preview shows full script text even without a final state package", () => {
  const duplicatedScript = "第1场 外 城门口 黄昏\n任小草望向天边。";
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
        data: {
          displayTables: {
            script: {
              title: "剧本",
              rows: [{ scriptContent: duplicatedScript, scriptRawContent: duplicatedScript }],
            },
            characters: { title: "角色", rows: [] },
            scenes: { title: "场景", rows: [] },
            props: { title: "道具", rows: [] },
            storyboards: { title: "分镜", rows: [] },
          },
        },
      },
    },
  });

  assert.match(html, /第1场 外 城门口 黄昏/);
  assert.match(html, /任小草望向天边/);
  assert.match(html, /single-episode-ai-script-text/);
});

test("ready AI storyboard preview unwraps structured script payloads and shows the full script", () => {
  const scriptText = [
    "第1场 外 城门口 黄昏",
    "任小草望向天边。",
    "",
    "【本批结尾状态包——供下一批衔接使用】",
    "最后一场编号：第1场",
    "即时发生的剧情预告：任小草看见城门外的影子。",
  ].join("\n");
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
        data: {
          displayTables: {
            script: {
              title: "剧本",
              rows: [{ scriptRawContent: JSON.stringify({ scriptText }) }],
            },
            characters: { title: "角色", rows: [] },
            scenes: { title: "场景", rows: [] },
            props: { title: "道具", rows: [] },
            storyboards: { title: "分镜", rows: [] },
          },
        },
      },
    },
  });

  assert.match(html, /第1场 外 城门口 黄昏/);
  assert.match(html, /任小草望向天边。/);
  assert.match(html, /【本批结尾状态包——供下一批衔接使用】/);
  assert.match(html, /最后一场编号：第1场/);
  assert.match(html, /single-episode-ai-script-text/);
  assert.doesNotMatch(html, /&quot;scriptText&quot;/);
  assert.doesNotMatch(html, /^\s*\{/m);
});

test("loading AI storyboard preview still hides the live output card while keeping script table content", () => {
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
        status: "loading",
        activeStage: "script",
        liveDisplayTables: {
          script: {
            title: "剧本",
            rows: [{
              scriptRawContent: "{\"scriptText\":\"第1场 外 城门口 黄昏\\n任小草望向天边。",
            }],
          },
          characters: { title: "角色", rows: [] },
          scenes: { title: "场景", rows: [] },
          props: { title: "道具", rows: [] },
          storyboards: { title: "分镜", rows: [] },
        },
        data: {
          displayTables: {
            script: {
              title: "剧本",
              rows: [{
                scriptRawContent: "{\"scriptText\":\"第1场 外 城门口 黄昏\\n任小草望向天边。",
              }],
            },
            characters: { title: "角色", rows: [] },
            scenes: { title: "场景", rows: [] },
            props: { title: "道具", rows: [] },
            storyboards: { title: "分镜", rows: [] },
          },
        },
      },
    },
  });

  assert.match(html, /第1场 外 城门口 黄昏/);
  assert.match(html, /任小草望向天边/);
  assert.doesNotMatch(html, /single-episode-ai-live-output/);
  assert.match(html, /single-episode-ai-table-stack live/);
  assert.doesNotMatch(html, /&quot;scriptText&quot;/);
  assert.doesNotMatch(html, /^\s*\{/m);
});

test("loading AI storyboard preview keeps the full script in the script table", () => {
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
        status: "loading",
        activeStage: "script",
        scriptRawText: [
          "任小野压下心中的好奇，先用刀尖分别戳向尸体头部和腹部。",
          "刀尖切入尸体的瞬间，他的动作一顿。",
          "",
          "【本批结尾状态包——供下一批衔接使用】",
          "最后一场编号：第6场",
          "最后定格画面：任小野蹲在尸体旁，手握着刀。",
          "未解决的钩子：尸体为什么会是温热的？",
        ].join("\n"),
        data: {
          displayTables: {
            script: {
              title: "剧本",
              rows: [{
                scriptRawContent: [
                  "任小野压下心中的好奇，先用刀尖分别戳向尸体头部和腹部。",
                  "刀尖切入尸体的瞬间，他的动作一顿。",
                  "",
                  "【本批结尾状态包——供下一批衔接使用】",
                  "最后一场编号：第6场",
                  "最后定格画面：任小野蹲在尸体旁，手握着刀。",
                  "未解决的钩子：尸体为什么会是温热的？",
                ].join("\n"),
              }],
            },
            characters: { title: "角色", rows: [] },
            scenes: { title: "场景", rows: [] },
            props: { title: "道具", rows: [] },
            storyboards: { title: "分镜", rows: [] },
          },
        },
      },
    },
  });

  assert.match(html, /【本批结尾状态包——供下一批衔接使用】/);
  assert.match(html, /最后一场编号：第6场/);
  assert.match(html, /未解决的钩子：尸体为什么会是温热的？/);
  assert.match(html, /任小野压下心中的好奇/);
  assert.match(html, /刀尖切入尸体的瞬间/);
  assert.match(html, /single-episode-ai-table-stack live/);
});

test("loading AI storyboard preview summarizes long table cells while ready preview keeps full text", () => {
  const tailSentinel = "LIVE_TABLE_TAIL_SENTINEL";
  const longCharacterDescription = `${"角色完整描述".repeat(260)}${tailSentinel}`;
  const liveHtml = renderLoadingPreview("character", "", {
    characters: [{
      characterName: "任小野",
      characterDescription: longCharacterDescription,
    }],
  });

  assert.match(liveHtml, /任小野/);
  assert.match(liveHtml, /生成中已省略部分内容/);
  assert.doesNotMatch(liveHtml, /LIVE_TABLE_TAIL_SENTINEL/);

  const readyHtml = renderProjectDetail({
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
        data: {
          displayTables: {
            script: { title: "剧本", rows: [{ scriptRawContent: "任小野发现尸体异常。" }] },
            scenes: { title: "场景", rows: [] },
            characters: {
              title: "角色",
              rows: [{ characterName: "任小野", characterDescription: longCharacterDescription }],
            },
            props: { title: "道具", rows: [] },
            storyboards: { title: "分镜", rows: [] },
          },
        },
      },
    },
  });

  assert.match(readyHtml, /LIVE_TABLE_TAIL_SENTINEL/);
  assert.doesNotMatch(readyHtml, /生成中已省略部分内容/);
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
        assetPromptSteps: [
          {
            stage: "shot",
            title: "分镜提示词生成",
            promptText: "请按分镜表输出，保留动作节奏与人物原声台词。",
            rawResponseText: "{\"storyboards\":[]}",
          },
        ],
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
  assert.doesNotMatch(html, /发送给 DeepSeek 的完整提示词/);
  assert.match(html, /single-episode-ai-table-stack/);
});

test("ready AI storyboard preview hides all DeepSeek prompt and raw response blocks", () => {
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
            stage: "scene",
            title: "场景提示词生成",
            promptText: "请抽取场景名称、场景描述与场景图片提示词。",
          },
          {
            stage: "prop",
            title: "道具提示词生成",
            promptText: "请抽取道具名称、道具描述与道具图片提示词。",
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

  assert.doesNotMatch(html, /发送给 DeepSeek 的完整提示词/);
  assert.doesNotMatch(html, /请抽取场景名称、场景描述与场景图片提示词。/);
  assert.doesNotMatch(html, /请抽取道具名称、道具描述与道具图片提示词。/);
  assert.doesNotMatch(html, /请按分镜表输出，保留动作节奏与人物原声台词。/);
  assert.doesNotMatch(html, /data-prompt-stage="shot-prompt"/);
  assert.doesNotMatch(html, /data-prompt-stage="scene-prompt"/);
  assert.doesNotMatch(html, /data-prompt-stage="prop-prompt"/);
  assert.doesNotMatch(html, /data-prompt-stage="shot-response"/);
  assert.doesNotMatch(html, /data-prompt-stage="character-response"/);
  assert.doesNotMatch(html, /data-prompt-stage="scene-response"/);
  assert.doesNotMatch(html, /data-prompt-stage="prop-response"/);
  assert.doesNotMatch(html, /\{&quot;storyboards&quot;:\[\]\}/);
  assert.doesNotMatch(html, /分镜返回原文/);
  assert.doesNotMatch(html, /DeepSeek 完整返回/);
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
