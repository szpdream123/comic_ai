import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createAiStoryboardPreviewService,
  type TextChatGatewayLike,
} from "./ai-storyboard-preview.service.ts";

describe("ai storyboard preview service", () => {
  it("uses deepseek-chat for script, scene, character and storyboard prompts", async () => {
    const gateway = new FakeTextGateway([
      "任小野把小草托付给闵婶子。\n\n今天又得麻烦您照看小草了。",
      JSON.stringify({
        scenes: [
          {
            sceneId: "scene_001",
            sceneName: "闵婶家门前 傍晚",
            sceneDescription: "旧木屋门前，灶火微亮。",
            sceneImagePrompt: "旧木屋门前，傍晚，灶火微亮，生活化质感。",
          },
        ],
      }),
      JSON.stringify({
        characters: [
          {
            characterId: "char_001",
            characterName: "任小野 旧布短衣",
            characterDescription: "约17岁的东方少年，清瘦警觉。",
            characterImagePrompt: "17岁东方少年，旧布短衣，清瘦警觉。",
          },
        ],
      }),
      JSON.stringify({
        props: [
          {
            propId: "prop_001",
            propName: "饭食",
            propDescription: "递交给闵婶子的简单饭食",
            propImagePrompt: "旧布包裹的朴素饭食",
          },
        ],
      }),
      JSON.stringify({
        storyboards: [
          {
            shotNo: 1,
            plot: "任小野递出饭食。",
            dialogue: "麻烦您了。",
            imagePrompt: "任小野站在旧木屋门前递出饭食。",
            videoPrompt: "【镜头】3-4秒，中景固定镜头，任小野递出饭食。",
            durationSec: 4,
          },
        ],
      }),
    ]);

    const service = createAiStoryboardPreviewService({ gateway });
    const result = await service.generatePreview({
      projectId: "40000000-0000-4000-8000-000000000001",
      createdByUserId: "30000000-0000-4000-8000-000000000001",
      scriptText: "任小野把小草托付给闵婶子。",
      packages: {
        genrePrompt: "玄幻修仙",
        emotionPrompt: "男频热血",
        cameraPrompt: "短剧快节奏",
        outputPrompt: "输出 JSON",
        tabooPrompt: "避免角色不一致",
      },
      templates: {
        scenePrompt: "后台默认场景提示词\n【剧本】\n输出要求",
        characterPrompt: "后台默认角色提示词 {{novel_chunk}}\n请严格执行，剧本如下：【剧本】\n[剧本]",
        propPrompt: "后台默认道具提示词 {{script_text}}",
        shotPrompt: "后台默认分镜提示词 {{story_text}}",
      },
    });

    assert.equal(gateway.calls.length, 5);
    assert.deepEqual(gateway.calls.map((call) => call.model), ["deepseek-chat", "deepseek-chat", "deepseek-chat", "deepseek-chat", "deepseek-chat"]);
    assert.deepEqual(gateway.calls.map((call) => call.responseFormat), ["text", "json_object", "json_object", "json_object", "json_object"]);
    assert.match(gateway.calls[0]?.prompt ?? "", /玄幻修仙/);
    assert.match(gateway.calls[0]?.prompt ?? "", /男频热血/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /短剧快节奏/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /输出 JSON/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /镜头看点：/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /输出格式：/);
    assert.match(gateway.calls[0]?.prompt ?? "", /避免角色不一致/);
    assert.match(gateway.calls[0]?.prompt ?? "", /纯文本剧本/);
    assert.match(gateway.calls[0]?.prompt ?? "", /以下【改写要求】必须作为上方任务说明的一部分执行/);
    assert.ok((gateway.calls[0]?.prompt ?? "").indexOf("题材看点：") < (gateway.calls[0]?.prompt ?? "").indexOf("[小说原文]"));
    assert.ok((gateway.calls[0]?.prompt ?? "").indexOf("通用禁忌：") < (gateway.calls[0]?.prompt ?? "").indexOf("[小说原文]"));
    assert.match(gateway.calls[1]?.prompt ?? "", /后台默认场景提示词/);
    assert.match(gateway.calls[1]?.prompt ?? "", /【剧本】\n任小野把小草托付给闵婶子/);
    assert.match(gateway.calls[1]?.prompt ?? "", /任小野把小草托付给闵婶子/);
    assert.match(gateway.calls[2]?.prompt ?? "", /后台默认角色提示词/);
    assert.doesNotMatch(gateway.calls[2]?.prompt ?? "", /\{\{novel_chunk\}\}/);
    assert.match(gateway.calls[2]?.prompt ?? "", /剧本如下：【剧本】\n任小野把小草托付给闵婶子/);
    assert.match(gateway.calls[2]?.prompt ?? "", /【剧本】\n任小野把小草托付给闵婶子/);
    assert.match(gateway.calls[2]?.prompt ?? "", /任小野把小草托付给闵婶子/);
    assert.match(gateway.calls[3]?.prompt ?? "", /后台默认道具提示词/);
    assert.doesNotMatch(gateway.calls[3]?.prompt ?? "", /\{\{script_text\}\}/);
    assert.match(gateway.calls[3]?.prompt ?? "", /任小野把小草托付给闵婶子/);
    assert.match(gateway.calls[4]?.prompt ?? "", /后台默认分镜提示词/);
    assert.doesNotMatch(gateway.calls[4]?.prompt ?? "", /\{\{story_text\}\}/);
    assert.match(gateway.calls[4]?.prompt ?? "", /任小野把小草托付给闵婶子/);
    assert.equal(result.scriptText, "任小野把小草托付给闵婶子。\n\n今天又得麻烦您照看小草了。");
    assert.equal(result.displayTables.script.rows[0]?.scriptContent, "任小野把小草托付给闵婶子。\n\n今天又得麻烦您照看小草了。");
    assert.equal(result.displayTables.scenes.rows[0]?.sceneName, "闵婶家门前 傍晚");
    assert.equal(result.displayTables.characters.rows[0]?.characterName, "任小野 旧布短衣");
    assert.equal(result.displayTables.props.rows[0]?.propName, "饭食");
    assert.match(result.displayTables.props.rows[0]?.propDescription ?? "", /递交给闵婶子的简单饭食/);
    assert.match(result.displayTables.props.rows[0]?.propDescription ?? "", /旧布包裹的朴素饭食/);
    assert.equal(result.commitPayload.scenes[0]?.sceneDescription, result.displayTables.scenes.rows[0]?.sceneDescription);
    assert.equal(result.commitPayload.characters[0]?.characterDescription, result.displayTables.characters.rows[0]?.characterDescription);
    assert.equal(result.commitPayload.props[0]?.propDescription, result.displayTables.props.rows[0]?.propDescription);
    assert.match(result.displayTables.storyboards.rows[0]?.videoPrompt ?? "", /【镜头】3-4秒，中景固定镜头，任小野递出饭食。/);
    assert.match(result.displayTables.storyboards.rows[0]?.videoPrompt ?? "", /时间: 0-4秒/);
  });

  it("appends per-shot asset reference tables to storyboard prompts", async () => {
    const gateway = new FakeTextGateway([
      "他在风沙里停下车，抬起机械臂，示意同伴靠近。",
      JSON.stringify({
        scenes: [
          {
            sceneId: "scene_road_stop",
            sceneName: "废土道路临时停驻点",
            sceneDescription: "风沙翻卷的荒路停驻区",
            sceneImagePrompt: "黄昏风沙",
          },
        ],
      }),
      JSON.stringify({
        characters: [
          {
            characterId: "char_me",
            characterName: "我",
            characterDescription: "冷硬的废土幸存者",
            costume: "废土行动车装",
            characterImagePrompt: "废土行动车装",
          },
        ],
      }),
      JSON.stringify({
        props: [
          {
            propId: "prop_mechanical_arm",
            propName: "机械臂",
            propDescription: "厚重的战损义肢",
            propImagePrompt: "战损",
          },
          {
            propId: "prop_dagger",
            propName: "匕首",
            propDescription: "磨损的短刃",
            propImagePrompt: "磨损",
          },
        ],
      }),
      JSON.stringify({
        storyboards: [
          {
            shotNo: 1,
            plot: "临时停驻",
            dialogue: "",
            imagePrompt: "废土道路上，角色抬起机械臂。",
            videoPrompt: "固定镜头，风沙掠过车身。",
            sceneId: "scene_road_stop",
            characterIds: ["char_me"],
            props: [
              { propName: "机械臂", propDescription: "厚重的战损义肢", propStyle: "战损" },
              { propName: "匕首", propDescription: "磨损的短刃", style: "磨损" },
            ],
          },
        ],
      }),
    ]);

    const service = createAiStoryboardPreviewService({ gateway });
    const result = await service.generatePreview({
      projectId: "40000000-0000-4000-8000-000000000001",
      createdByUserId: "30000000-0000-4000-8000-000000000001",
      scriptText: "废土道路临时停驻点，我抬起机械臂。",
      packages: {},
    });

    const row = result.displayTables.storyboards.rows[0];
    assert.match(row?.videoPrompt ?? "", /资产对照表（视频中涉及的角色、场景与物品如下（保持一致性））：/);
    assert.match(row?.videoPrompt ?? "", /场景对照表: 废土道路临时停驻点=（风沙翻卷的荒路停驻区）【@废土道路临时停驻点\/黄昏风沙】/);
    assert.match(row?.videoPrompt ?? "", /角色对照表: 我=（冷硬的废土幸存者）【@我\/废土行动车装】/);
    assert.match(row?.videoPrompt ?? "", /道具对照表: 机械臂=（厚重的战损义肢）【@机械臂\/战损】；匕首=（磨损的短刃）【@匕首\/磨损】/);
    assert.equal(result.commitPayload.storyboards[0]?.assetReferenceText, row?.assetReferenceText);
  });

  it("streams raw DeepSeek output before returning the final parsed preview", async () => {
    const gateway = new FakeTextGateway([
      [
        "任小野把小草",
        "托付给闵婶子。",
      ],
      [
        '{"scenes":[{"sceneName":"门前","sceneDescription":"旧木屋。","sceneImagePrompt":"旧木屋门前。"}]}',
      ],
      [
        '{"characters":[{"characterName":"任小野","characterDescription":"少年","characterImagePrompt":"少年。"}]}',
      ],
      [
        '{"props":[{"propName":"饭食","propDescription":"简单饭食","propImagePrompt":"旧布包裹的饭食。"}]}',
      ],
      [
        '{"storyboards":[{"plot":"递出饭食","dialogue":"","imagePrompt":"递出饭食。","videoPrompt":"中景。"}]}',
      ],
    ]);

    const service = createAiStoryboardPreviewService({ gateway });
    const events = [];
    for await (const event of service.generatePreviewStream({
      projectId: "40000000-0000-4000-8000-000000000001",
      scriptText: "任小野把小草托付给闵婶子。",
      packages: {},
    })) {
      events.push(event);
    }

    assert.deepEqual(events.slice(0, 4).map((event) => event.type), [
      "script_prompt",
      "script_start",
      "script_delta",
      "script_delta",
    ]);
    assert.deepEqual(events.filter((event) => event.type === "asset_prompt").map((event) => event.stage), [
      "scene",
      "character",
      "prop",
      "shot",
    ]);
    assert.ok(events.some((event) => event.type === "asset_delta" && event.stage === "scene"));
    assert.ok(events.some((event) => event.type === "asset_delta" && event.stage === "character"));
    assert.ok(events.some((event) => event.type === "asset_delta" && event.stage === "prop"));
    assert.ok(events.some((event) => event.type === "asset_delta" && event.stage === "shot"));
    const complete = events.at(-1);
    assert.equal(complete?.type, "complete");
    assert.equal(complete?.preview.displayTables.script.rows[0]?.scriptContent, "任小野把小草托付给闵婶子。");
    assert.equal(complete?.preview.displayTables.storyboards.rows[0]?.plot, "递出饭食");
  });

  it("splits stream deltas into character-sized live echo events", async () => {
    const gateway = new FakeTextGateway([
      ["AB"],
      ['{"scenes":[]}'],
      ['{"characters":[]}'],
      ['{"props":[]}'],
      ['{"storyboards":[]}'],
    ]);

    const service = createAiStoryboardPreviewService({ gateway });
    const events = [];
    for await (const event of service.generatePreviewStream({
      projectId: "40000000-0000-4000-8000-000000000001",
      scriptText: "source text",
      packages: {},
    })) {
      events.push(event);
    }

    assert.deepEqual(
      events.filter((event) => event.type === "script_delta").map((event) => event.text),
      ["A", "B"],
    );
    assert.deepEqual(
      events.filter((event) => event.type === "asset_delta" && event.stage === "scene").map((event) => event.text).slice(0, 4),
      ["{", "\"", "s", "c"],
    );
  });

  it("normalizes storyboard rows returned with legacy shot prompt fields", async () => {
    const gateway = new FakeTextGateway([
      "script",
      JSON.stringify({ scenes: [] }),
      JSON.stringify({ characters: [] }),
      JSON.stringify({ props: [] }),
      JSON.stringify({
        shots: [
          {
            shot_no: 1,
            scene: "cold street",
            time_range: "12-14s",
            shot_size: "extreme close-up",
            camera_movement: "fast push-in",
            action: "Ren Xiaoye looks up",
            emotion: "uneasy",
            visual_focus: "mist over the street",
            prompt: "wide shot, cold street, uneasy boy",
            dialogue: "Something is wrong.",
            sound_effect: "heavy heartbeat",
            bgm: "none",
          },
        ],
      }),
    ]);

    const service = createAiStoryboardPreviewService({ gateway });
    const result = await service.generatePreview({
      projectId: "40000000-0000-4000-8000-000000000001",
      scriptText: "source",
      packages: {},
    });

    assert.equal(result.displayTables.storyboards.rows[0]?.plot, "Ren Xiaoye looks up");
    assert.equal(result.displayTables.storyboards.rows[0]?.dialogue, "Something is wrong.");
    assert.equal(result.displayTables.storyboards.rows[0]?.imagePrompt, "wide shot, cold street, uneasy boy");
    assert.doesNotMatch(result.displayTables.storyboards.rows[0]?.videoPrompt ?? "", /12-14s/);
    assert.match(result.displayTables.storyboards.rows[0]?.videoPrompt ?? "", /0-2秒/);
    assert.match(result.displayTables.storyboards.rows[0]?.videoPrompt ?? "", /extreme close-up/);
    assert.match(result.displayTables.storyboards.rows[0]?.videoPrompt ?? "", /fast push-in/);
    assert.match(result.displayTables.storyboards.rows[0]?.videoPrompt ?? "", /heavy heartbeat/);
    assert.match(result.displayTables.storyboards.rows[0]?.videoPrompt ?? "", /Ren Xiaoye looks up/);
    assert.equal(result.commitPayload.storyboards[0]?.shotNo, 1);
    assert.equal(result.commitPayload.storyboards[0]?.durationSec, 2);
    assert.equal(result.commitPayload.storyboards[0]?.timeRange, "0-2秒");
    assert.equal(result.commitPayload.storyboards[0]?.originalTimeRange, "12-14s");
  });

  it("keeps detailed shot direction fields in the video prompt", async () => {
    const gateway = new FakeTextGateway([
      "script",
      JSON.stringify({ scenes: [] }),
      JSON.stringify({ characters: [] }),
      JSON.stringify({ props: [] }),
      JSON.stringify({
        storyboards: [
          {
            shotNo: 1,
            plot: "闻婶家门口灶炉升火",
            dialogue: "",
            imagePrompt: "旧木屋门口，灶炉暖光。",
            timeRange: "0.0-3.2秒",
            transition: "无",
            shotSize: "中景/平视",
            cameraMovement: "缓慢平移",
            visualDescription: "较大的旧木屋门前，灶炉燃着火，炉口热气升腾。",
            coreAction: "添火、翻动、烟气上升。",
            interactionDesign: "无",
            characterLogic: "灾后世界里，做饭本身就是维系家庭秩序的动作。",
            subjectAction: "闻婶守在灶前，动作熟练。",
            soundEffect: "炉火噼啪、锅具轻碰、木柴燃烧声",
          },
        ],
      }),
    ]);

    const service = createAiStoryboardPreviewService({ gateway });
    const result = await service.generatePreview({
      projectId: "40000000-0000-4000-8000-000000000001",
      scriptText: "source",
      packages: {},
    });

    const videoPrompt = result.displayTables.storyboards.rows[0]?.videoPrompt ?? "";
    assert.match(videoPrompt, /时间: 0-3\.2秒/);
    assert.match(videoPrompt, /转场: 无/);
    assert.match(videoPrompt, /镜头: 中景\/平视\/缓慢平移/);
    assert.match(videoPrompt, /画面描述: 较大的旧木屋门前/);
    assert.match(videoPrompt, /核心动作: 添火、翻动、烟气上升。/);
    assert.match(videoPrompt, /对手戏设计: 无/);
    assert.match(videoPrompt, /人物底层逻辑: 灾后世界里/);
    assert.match(videoPrompt, /主体动作: 闻婶守在灶前/);
    assert.match(videoPrompt, /音效: 炉火噼啪/);
    assert.deepEqual(result.displayTables.storyboards.columns, [
      "镜号",
      "分镜剧情",
      "对话/旁白",
      "时长",
      "时间段",
      "转场",
      "景别/运镜",
      "静态图片提示词",
      "动态视频提示词（多镜头序列，每一分镜镜头总时长≤15s）",
      "分镜详细字段",
    ]);
    const row = result.displayTables.storyboards.rows[0];
    assert.equal(row?.shotNo, 1);
    assert.equal(row?.durationSec, 3.2);
    assert.equal(row?.timeRange, "0-3.2秒");
    assert.equal(row?.transition, "无");
    assert.equal(row?.shotDirection, "中景/平视/缓慢平移");
    assert.match(row?.shotDetails ?? "", /核心动作/);
    assert.match(row?.shotDetails ?? "", /音效/);
  });

  it("integrates segment based storyboard output into chapter storyboard rows", async () => {
    const gateway = new FakeTextGateway([
      "script",
      JSON.stringify({ scenes: [] }),
      JSON.stringify({ characters: [] }),
      JSON.stringify({ props: [] }),
      JSON.stringify({
        script_title: "迷雾",
        total_segments: 1,
        segments: [
          {
            segment_id: 9,
            scene_analysis: {
              scene_name: "城外阴影深处",
              emotion_intent: "悬疑升级",
              performance_logic: "任小野警觉到极致",
            },
            segment_transition: {
              previous_last_frame: "任小野站在原地",
              current_opening_frame: "任小野转身走向城外阴影",
              continuity_logic: "行动延续，空间推进",
            },
            shots: [
              {
                shot_id: 1,
                time_range: "0-4",
                transition: "硬切",
                shot_type: "远景",
                description: "城门口外，灰色阴影与残雾交织。",
                core_action: "弯腰潜行",
                opponent_design: "无",
                character_logic: "职业习惯的谨慎",
                subject_action: "无台词，内心OS",
                dialogue_or_os: "",
                sound_effects: "脚步轻踩，低频呼吸声",
              },
            ],
            asset_table: {
              scene: "城外阴影深处=【城外阴影_浓雾残留】",
              character: "任小野=【任小野_20岁_冷峻】",
              prop: "切割刀=【切割刀_破旧】",
            },
          },
        ],
      }),
    ]);

    const service = createAiStoryboardPreviewService({ gateway });
    const result = await service.generatePreview({
      projectId: "40000000-0000-4000-8000-000000000001",
      scriptText: "source",
      packages: {},
    });

    assert.deepEqual(result.displayTables.storyboards.columns, ["分镜剧情", "对话/旁白", "静态图片提示词", "动态视频提示词"]);
    const row = result.displayTables.storyboards.rows[0];
    assert.match(row?.plot ?? "", /场景分析：/);
    assert.match(row?.plot ?? "", /城外阴影深处/);
    assert.match(row?.dialogue ?? "", /主体动作: 无台词，内心OS/);
    assert.match(row?.imagePrompt ?? "", /视频场景对照表: 城外阴影深处=【城外阴影_浓雾残留】/);
    assert.match(row?.videoPrompt ?? "", /分镜承接：/);
    assert.match(row?.videoPrompt ?? "", /【镜头1】0\.0-4\.0秒 转场: 硬切 镜头:远景/);
    assert.match(row?.videoPrompt ?? "", /镜头1\(分镜剧情\)：城门口外，灰色阴影与残雾交织。/);
    assert.match(row?.videoPrompt ?? "", /核心动作: 弯腰潜行/);
    assert.match(row?.videoPrompt ?? "", /对手戏设计: 无/);
    assert.match(row?.videoPrompt ?? "", /人物底层逻辑: 职业习惯的谨慎/);
    assert.match(row?.videoPrompt ?? "", /音效: 脚步轻踩，低频呼吸声/);
    assert.equal(result.commitPayload.storyboards[0]?.segmentId, 9);
    assert.equal(result.commitPayload.storyboards[0]?.shotNo, 1);
    assert.equal(result.commitPayload.storyboards[0]?.chapterVideoPrompt, row?.videoPrompt);
    assert.equal(result.commitPayload.storyboards[0]?.chapterImagePrompt, row?.imagePrompt);
  });

  it("commits segment storyboard rows instead of flattened inner shots", async () => {
    const gateway = new FakeTextGateway([
      "script",
      JSON.stringify({ scenes: [] }),
      JSON.stringify({ characters: [] }),
      JSON.stringify({ props: [] }),
      JSON.stringify({
        segments: [
          {
            segment_id: 1,
            scene_analysis: { sceneName: "outer yard", emotionIntent: "danger rises" },
            segment_transition: { continuityLogic: "same action" },
            shots: [
              {
                shot_id: 1,
                time_range: "0.0-3.0s",
                transition: "cut",
                shot_type: "medium",
                description: "hero raises blade",
                core_action: "raise blade",
                subject_action: "hero prepares",
                sound_effects: "wind",
              },
              {
                shot_id: 2,
                time_range: "3.0-6.0s",
                transition: "cut",
                shot_type: "close",
                description: "blade flashes",
                core_action: "blade flash",
                subject_action: "hero attacks",
                sound_effects: "metal",
              },
            ],
            asset_table: { scene: "outer yard=@scene", character: "hero=@hero", prop: "blade=@blade" },
          },
          {
            segment_id: 2,
            scene_analysis: { sceneName: "gate", emotionIntent: "reaction" },
            segment_transition: { continuityLogic: "reaction beat" },
            shots: [
              {
                shot_id: 1,
                time_range: "0.0-2.0s",
                transition: "cut",
                shot_type: "wide",
                description: "enemy steps back",
                core_action: "retreat",
                subject_action: "enemy retreats",
                sound_effects: "footsteps",
              },
            ],
            asset_table: { scene: "gate=@gate", character: "enemy=@enemy", prop: "" },
          },
        ],
      }),
    ]);

    const service = createAiStoryboardPreviewService({ gateway });
    const result = await service.generatePreview({
      projectId: "40000000-0000-4000-8000-000000000001",
      scriptText: "source",
      packages: {},
    });

    assert.equal(result.displayTables.storyboards.rows.length, 2);
    assert.equal(result.commitPayload.storyboards.length, 2);
    assert.equal(result.commitPayload.storyboards[0]?.shotNo, 1);
    assert.equal(result.commitPayload.storyboards[0]?.segmentId, 1);
    assert.equal(result.commitPayload.storyboards[0]?.videoPrompt, result.displayTables.storyboards.rows[0]?.videoPrompt);
    assert.doesNotMatch(result.commitPayload.storyboards[0]?.videoPrompt ?? "", /enemy steps back/);
    assert.equal(result.commitPayload.storyboards[1]?.shotNo, 2);
    assert.equal(result.commitPayload.storyboards[1]?.segmentId, 2);
    assert.match(result.commitPayload.storyboards[1]?.videoPrompt ?? "", /enemy steps back/);
  });

  it("converts absolute timelines to per-shot duration while preserving raw video prompts", async () => {
    const gateway = new FakeTextGateway([
      "script",
      JSON.stringify({ scenes: [] }),
      JSON.stringify({ characters: [] }),
      JSON.stringify({ props: [] }),
      JSON.stringify({
        storyboards: [
          {
            shotNo: 1,
            plot: "任小野转身",
            dialogue: "",
            imagePrompt: "任小野转身。",
            videoPrompt: "[21-24秒] 中景，任小野转身，风声压低。",
            timeRange: "21-24秒",
            shotSize: "中景",
            cameraMovement: "固定镜头",
            soundEffect: "风声压低",
          },
        ],
      }),
    ]);

    const service = createAiStoryboardPreviewService({ gateway });
    const result = await service.generatePreview({
      projectId: "40000000-0000-4000-8000-000000000001",
      scriptText: "source",
      packages: {},
    });

    const row = result.displayTables.storyboards.rows[0];
    assert.match(row?.videoPrompt ?? "", /21-24秒/);
    assert.match(row?.videoPrompt ?? "", /任小野转身/);
    assert.match(row?.videoPrompt ?? "", /时间: 0-3秒/);
    assert.match(row?.videoPrompt ?? "", /镜头: 中景\/固定镜头/);
    assert.equal(result.commitPayload.storyboards[0]?.durationSec, 3);
    assert.equal(result.commitPayload.storyboards[0]?.timeRange, "0-3秒");
    assert.equal(result.commitPayload.storyboards[0]?.originalTimeRange, "21-24秒");
  });

  it("fills template variables and script blocks when the script model returns JSON", async () => {
    const gateway = new FakeTextGateway([
      JSON.stringify({
        scriptBeats: [
          { plot: "任小野托付妹妹。", dialogue: "麻烦您照看小草。" },
        ],
      }),
      JSON.stringify({ scenes: [] }),
      JSON.stringify({ characters: [] }),
      JSON.stringify({ props: [] }),
      JSON.stringify({ storyboards: [] }),
    ]);
    const service = createAiStoryboardPreviewService({ gateway });

    await service.generatePreview({
      projectId: "40000000-0000-4000-8000-000000000001",
      scriptText: "原文",
      packages: {},
      templates: {
        scenePrompt: "场景模板 {{novel_chapter}}",
        characterPrompt: "角色模板 {{novel_chunk}}",
        propPrompt: "道具模板 {{script}}",
        shotPrompt: "分镜模板 {{story_text}}",
      },
    });

    for (const call of gateway.calls.slice(1)) {
      assert.match(call.prompt, /任小野托付妹妹/);
      assert.doesNotMatch(call.prompt, /\{\{(?:novel_chapter|novel_chunk|story_text)\}\}/);
      assert.match(call.prompt, /【剧本】\n任小野托付妹妹。/);
    }
  });

  it("yields each model chunk before the model stream is finished", async () => {
    const gateway = new ManualStreamGateway();
    const service = createAiStoryboardPreviewService({ gateway });
    const iterator = service.generatePreviewStream({
      projectId: "40000000-0000-4000-8000-000000000001",
      scriptText: "任小野托付妹妹。",
      packages: {},
    })[Symbol.asyncIterator]();

    const scriptPrompt = await iterator.next();
    assert.equal(scriptPrompt.done, false);
    assert.equal(scriptPrompt.value.type, "script_prompt");
    assert.match(scriptPrompt.value.text, /小说原文/);
    assert.deepEqual(await iterator.next(), { done: false, value: { type: "script_start" } });
    const firstDelta = iterator.next();
    gateway.push("任小野");

    assert.equal(await settlesWithin(firstDelta, 30), true);
    const firstDeltaResult = await firstDelta;
    assert.equal(firstDeltaResult.done, false);
    assert.equal(firstDeltaResult.value.type, "script_delta");
    assert.equal(firstDeltaResult.value.text.length, 1);

    gateway.push("托付妹妹。");
    gateway.end();
    let streamedText = firstDeltaResult.value.text;
    for (;;) {
      const next = await iterator.next();
      assert.equal(next.done, false);
      if (next.value.type === "script_done") {
        assert.equal(next.value.text, streamedText);
        assert.equal(next.value.rawText, streamedText);
        break;
      }
      assert.equal(next.value.type, "script_delta");
      assert.equal(next.value.text.length, 1);
      streamedText += next.value.text;
    }
    const scenePrompt = await iterator.next();
    assert.equal(scenePrompt.done, false);
    assert.equal(scenePrompt.value.type, "asset_prompt");
    assert.equal(scenePrompt.value.stage, "scene");
    await iterator.return?.();
  });
});

async function settlesWithin<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
}

class FakeTextGateway implements TextChatGatewayLike {
  readonly calls: Array<{ model: string; prompt: string; responseFormat?: "json_object" | "text" }> = [];

  constructor(private readonly responses: Array<string | string[]>) {}

  async completeJson(input: { model: string; prompt: string; responseFormat?: "json_object" | "text" }) {
    this.calls.push(input);
    const response = this.responses.shift();
    assert.ok(response, "missing fake response");
    return Array.isArray(response) ? response.join("") : response;
  }

  async *streamJson(input: { model: string; prompt: string; responseFormat?: "json_object" | "text" }) {
    this.calls.push(input);
    const response = this.responses.shift();
    assert.ok(response, "missing fake response");
    const chunks = Array.isArray(response) ? response : [response];
    for (const chunk of chunks) {
      yield chunk;
    }
  }
}

class ManualStreamGateway implements TextChatGatewayLike {
  private resolvers: Array<(value: IteratorResult<string>) => void> = [];
  private queue: string[] = [];

  async completeJson() {
    throw new Error("completeJson should not be called");
  }

  async *streamJson() {
    while (true) {
      const next = this.queue.shift();
      if (next === "__END__") {
        return;
      }
      if (next !== undefined) {
        yield next;
        continue;
      }
      const result = await new Promise<IteratorResult<string>>((resolve) => {
        this.resolvers.push(resolve);
      });
      if (result.done) {
        return;
      }
      yield result.value;
    }
  }

  push(value: string) {
    const resolve = this.resolvers.shift();
    if (resolve) {
      resolve({ done: false, value });
    } else {
      this.queue.push(value);
    }
  }

  end() {
    const resolve = this.resolvers.shift();
    if (resolve) {
      resolve({ done: true, value: undefined });
    } else {
      this.queue.push("__END__");
    }
  }
}
