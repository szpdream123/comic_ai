import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  handleWorkbenchActionForTest,
  parseSingleEpisodeAiStoryboardMarkdownForTest,
} from "../src/features/production-workbench/index.js";
import { createStoryboardList } from "../src/features/production-workbench/storyboard-state.js";
import { renderProductionWorkbench } from "../src/features/production-workbench/index.js";

function buildProjectState() {
  return {
    project: {
      id: "project-1",
      name: "try",
      phase: "asset_review",
      aspectRatio: "9:16",
      resolution: "1080p",
    },
    assetReview: { readyForGeneration: false },
    assetCandidates: {
      characters: [{ assetKey: "hero", label: "hero", required: true, confirmed: false }],
      scenes: [{ assetKey: "city", label: "city", required: true, confirmed: false }],
      props: [{ assetKey: "sword", label: "sword", required: false, confirmed: false }],
    },
    calibration: null,
    shots: [
      {
        id: "shot-1",
        title: "Shot 001",
        currentImageAssetVersionId: null,
        currentVideoAssetVersionId: null,
      },
    ],
    exportPreview: null,
  };
}

function buildProjectUi(overrides = {}) {
  const state = buildProjectState();
  const storyboards = createStoryboardList(state);
  return {
    activeNavTab: "project",
    storyboards,
    selectedStoryboard: storyboards[0],
    selectedModelId: "vidu-q3-pro",
    prompt: "",
    busy: false,
    projectPanelMode: "library",
    projectLibrary: [],
    validationMessage: "",
    toast: "",
    isScriptModalOpen: false,
    isCreateModalOpen: false,
    scriptTab: "script-upload",
    uploadNotice: "",
    defaultScript: "Episode 1",
    ...overrides,
  };
}

const markdownShotResponse = `**动作**：
-就在绝望等死之际，叶焚野胸口突然传来一阵灼热。
-一道冰冷却带着几分戏谑的声音在他脑海中响起。

**对白**：
-系统（冰冷，嘲讽）：“宿主战斗评分：F。”

**动作**：
-叶焚野猛然睁眼，瞳孔地震。
-胸口处，一枚菱形金属徽章正发出幽蓝色的光泽。

**对白**：
-叶焚野：“意识空间？怎么进”

**动作**（转折）：
-话音未落，叶焚野只觉得眼前景象猛然扭曲。
-废墟、鼠群、灰暗天空，连同那股腐臭气味被猛地抽离。

**画面**：一切归于黑暗，只剩幽蓝光芒闪烁。`;

const chapterTableResponse = `
【剧本角色列表】
| 角色名称（角色名称/服装描述） | 角色描述（仅含年龄、国籍、性别、服装、脸部特征、细节特征） | 角色组合提示词（左栏+右栏共同组成） |
| --- | --- | --- |
| 叶焚野/灰黑旧T恤 | 一位约24岁的中国男性。身穿洗旧发皱的灰黑色短袖T恤，领口略微松垮，袖口有轻微卷边。脸部瘦削，颧骨突出，眼睛布满血丝，眼眶乌青，下巴带着未修整的胡茬。手指修长但关节略显僵硬，长期熬夜使肤色暗沉，神情疲惫却专注。 | 叶焚野，24岁中国男性，灰黑旧T恤，瘦削、血丝眼、胡茬，疲惫专注 |
| 接单老板/聊天窗口头像 | 一位身份未露面的中国成年男性，仅以聊天窗口身份出现。无明确服装信息。头像信息模糊。细节特征为通过文字消息与叶焚野沟通，语气熟练市侩。 | 接单老板，聊天窗口头像，成年男性，熟练市侩 |

【剧本场景列表】
| 场景名称（角色名称/天气和时间描述） | 场景描述（仅含空间结构、建筑风格、建筑细节、光影规则、氛围基调、关键道具） | 场景组合提示词（左栏+右栏共同组成） |
| --- | --- | --- |
| 出租屋内部/昼夜不明 | 一间狭窄逼仄的单人出租屋，空间以电脑桌、床铺和墙角杂物堆构成主要结构。建筑风格为老旧城中村出租房风格，墙面发黄，窗帘被死死拉紧，室内几乎不见自然光。电脑桌拥挤凌乱，桌面堆满泡面碗，墙角堆着半人高空饮料瓶，空气显得浑浊沉闷。主要光源来自裂纹显示器与手机屏幕的冷白光，局部并强化疲惫感。氛围基调压抑、困顿、窒息，带有长期封闭生活的陈腐感。关键道具为二手裂纹显示器、机械键盘、智能手机、泡面桶堆、空饮料瓶、半根香烟。 | 出租屋内部，昼夜不明，狭窄逼仄，老旧城中村出租屋，冷白屏幕光，压抑困顿 |

【剧本道具列表】
| 道具名称 | 道具描述（仅含外观、颜色、细节特征） | 道具组合提示词（左栏+右栏共同组成） |
| --- | --- | --- |
| 智能手机/裂痕黑壳 | 一部黑色智能手机，套着磨损发白的黑色手机壳，边角有细小裂痕。屏幕常亮显示聊天和转账提示，表面沾有指纹油渍。 | 智能手机，黑色，磨损发白手机壳，边角裂痕，屏幕常亮 |
| 机械键盘/磨亮WASD | 一把黑色机械键盘，键帽边缘磨损明显，W、A、S、D 四个键被长期敲击后泛出油亮光泽，空格键边缘有浅浅凹痕。 | 机械键盘，黑色，WASD 磨亮，空格键凹痕 |

【剧本分镜列表】
| 分镜剧情 | 对话/旁白 | 静态图片提示词 | 动态视频提示词（多镜头序列，每一分镜镜头总时长≤15s） |
| --- | --- | --- | --- |
| 叶焚野盯着裂纹屏幕，房间被冷白光照亮。 | 叶焚野（烦躁低声）：“这单再不结，房租都扛不住了。” | 狭窄出租屋内，裂纹显示器冷白光映照叶焚野疲惫脸庞，桌面凌乱，写实压抑氛围 | 【场景分析】\\n场景：（出租屋内部/昼夜不明）\\n承接：无\\n过渡：硬切开场 |
`;

describe("single episode ai storyboard markdown parsing", () => {
  it("parses markdown sections into storyboard draft rows", () => {
    const rows = parseSingleEpisodeAiStoryboardMarkdownForTest(markdownShotResponse);

    assert.equal(rows.length, 3);
    assert.match(rows[0].plot, /胸口突然传来一阵灼热/);
    assert.match(rows[0].dialogue, /宿主战斗评分：F/);
    assert.match(rows[1].plot, /叶焚野猛然睁眼/);
    assert.equal(rows[2].transition, "转折");
    assert.match(rows[2].imagePrompt, /幽蓝光芒闪烁/);
  });

  it("keeps the original storyboard table structure in the preview flow", async () => {
    const workbench = {
      state: buildProjectState(),
      session: { user: { phone: "+86 13800138000" } },
      api: {
        createAiStoryboardPreviewStream: async function* () {
          yield {
            event: "script_done",
            data: {
              text: "叶焚野濒死，忽然听见神秘系统的声音。",
              rawText: "叶焚野濒死，忽然听见神秘系统的声音。",
            },
          };
          yield { event: "asset_done", data: { stage: "scene", title: "场景提示词生成", text: '{"scenes":[]}' } };
          yield { event: "asset_done", data: { stage: "character", title: "角色提示词生成", text: '{"characters":[]}' } };
          yield { event: "asset_done", data: { stage: "prop", title: "道具提示词生成", text: '{"props":[]}' } };
          yield { event: "asset_done", data: { stage: "shot", title: "分镜提示词生成", text: markdownShotResponse } };
        },
      },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "workspace",
          projectInteriorSection: "episodes",
          selectedProjectCardId: "project-1",
          isSingleEpisodeModalOpen: true,
          singleEpisodeScript: "叶焚野濒死，忽然听见神秘系统的声音。",
          storyboardPromptPackages: [
            { id: "genre-1", name: "玄幻", package_type: "genre", status: "enabled" },
            { id: "emotion-1", name: "紧张", package_type: "emotion", status: "enabled" },
          ],
          selectedSingleEpisodeLookPackageIds: {
            genre: ["genre-1"],
            emotion: ["emotion-1"],
          },
        }),
      },
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "confirm-single-episode" },
    });

    const preview = workbench.ui.singleEpisodeAiPreview;
    const rows = preview.data.displayTables.storyboards.rows;

    assert.equal(preview.status, "ready");
    assert.equal(rows.length, 3);
    assert.match(rows[0].plot, /胸口突然传来一阵灼热/);
    assert.match(rows[1].plot, /叶焚野猛然睁眼/);
    assert.equal(rows[2].transition, "转折");
    assert.match(rows[2].imagePrompt, /幽蓝光芒闪烁/);
    assert.match(preview.data.commitPayload.storyboards[2].videoPrompt, /【镜头3】/);
    assert.match(preview.data.commitPayload.storyboards[2].videoPrompt, /一切归于黑暗/);
  });

  it("parses chapter-style combined tables into populated preview lists", async () => {
    const workbench = {
      state: buildProjectState(),
      session: { user: { phone: "+86 13800138000" } },
      api: {
        createAiStoryboardPreviewStream: async function* () {
          yield {
            event: "script_done",
            data: {
              text: "叶焚野在出租屋里接单熬夜。",
              rawText: "叶焚野在出租屋里接单熬夜。",
            },
          };
          yield { event: "asset_done", data: { stage: "scene", title: "场景提示词生成", text: "" } };
          yield { event: "asset_done", data: { stage: "character", title: "角色提示词生成", text: "" } };
          yield { event: "asset_done", data: { stage: "prop", title: "道具提示词生成", text: "" } };
          yield { event: "asset_done", data: { stage: "shot", title: "分镜提示词生成", text: chapterTableResponse } };
        },
      },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "workspace",
          projectInteriorSection: "episodes",
          selectedProjectCardId: "project-1",
          isSingleEpisodeModalOpen: true,
          singleEpisodeScript: "叶焚野在出租屋里接单熬夜。",
          storyboardPromptPackages: [
            { id: "genre-1", name: "玄幻", package_type: "genre", status: "enabled" },
            { id: "emotion-1", name: "紧张", package_type: "emotion", status: "enabled" },
          ],
          selectedSingleEpisodeLookPackageIds: {
            genre: ["genre-1"],
            emotion: ["emotion-1"],
          },
        }),
      },
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "confirm-single-episode" },
    });

    const preview = workbench.ui.singleEpisodeAiPreview;
    const html = renderProductionWorkbench(workbench);

    assert.equal(preview.status, "ready");
    assert.equal(preview.data.displayTables.characters.rows.length, 2);
    assert.equal(preview.data.displayTables.scenes.rows.length, 1);
    assert.equal(preview.data.displayTables.props.rows.length, 2);
    assert.equal(preview.data.displayTables.storyboards.rows.length, 1);
    assert.match(html, /叶焚野\/灰黑旧T恤/);
    assert.match(html, /出租屋内部\/昼夜不明/);
    assert.match(html, /智能手机\/裂痕黑壳/);
    assert.match(html, /叶焚野盯着裂纹屏幕/);
    assert.match(html, /single-episode-ai-table-card storyboards chapter-storyboards/);
  });
});
