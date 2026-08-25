import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { markTransientDatabasePersistenceError } from "../shared/db/dev-db.ts";

import {
  AiStoryboardWorkflowIntentError,
  createAiStoryboardPreviewService,
  createTextModelChatGateway,
  resolveAiStoryboardWorkflowIntent,
  type TextChatGatewayLike,
} from "./ai-storyboard-preview.service.ts";

describe("ai storyboard preview service", () => {
  it("uses the text model to resolve a character-only workflow instruction", async () => {
    const calls: Array<Parameters<TextChatGatewayLike["completeJson"]>[0]> = [];
    const gateway: TextChatGatewayLike = {
      async completeJson(input) {
        calls.push(input);
        return JSON.stringify({ stages: ["character"] });
      },
    };

    const result = await resolveAiStoryboardWorkflowIntent({
      gateway,
      modelCode: "intent-model",
      instruction: "帮我解析出其中的人物提示词",
      projectId: "40000000-0000-4000-8000-000000000099",
    });

    assert.deepEqual(result, { stages: ["character"], skipScriptStage: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.model, "intent-model");
    assert.equal(calls[0]?.responseFormat, "json_object");
    assert.match(String(calls[0]?.messages?.[1]?.content ?? ""), /人物提示词/);
  });

  it("rejects unsupported stages returned by the workflow intent model", async () => {
    const gateway: TextChatGatewayLike = {
      async completeJson() {
        return JSON.stringify({ stages: ["character", "image"] });
      },
    };

    await assert.rejects(
      resolveAiStoryboardWorkflowIntent({
        gateway,
        modelCode: "intent-model",
        instruction: "生成人物提示词",
      }),
      AiStoryboardWorkflowIntentError,
    );
  });

  it("routes canvas ownership through canvasProjectId without sending max_tokens", async () => {
    const canvasProjectId = "40000000-0000-4000-8000-000000000099";
    let capturedRequest: Record<string, unknown> | null = null;
    let capturedContext: Record<string, unknown> | null = null;
    const gateway = createTextModelChatGateway({
      gateway: {
        chat: {
          completions: {
            async create(request: Record<string, unknown>, context: Record<string, unknown>) {
              capturedRequest = request;
              capturedContext = context;
              return {
                providerRequestId: "provider-request-1",
                stream: (async function* () {
                  yield { choices: [{ delta: { content: "ok" } }] };
                })(),
                abort() {},
                completed: Promise.resolve({
                  status: "succeeded" as const,
                  usage: null,
                  usageSource: "provider_missing" as const,
                }),
              };
            },
          },
        },
      } as never,
    });

    for await (const _delta of gateway.streamJson!({
      model: "text-model",
      prompt: "prompt",
      projectId: null,
      canvasProjectId,
    })) {
      // Drain the stream so the gateway request completes.
    }

    assert.equal(capturedContext?.projectId, null);
    assert.equal(capturedContext?.canvasProjectId, canvasProjectId);
    assert.equal("max_tokens" in (capturedRequest ?? {}), false);
  });

  it("disables thinking for direct storyboard result streaming", async () => {
    let capturedRequest: Record<string, unknown> | null = null;
    const gateway = createTextModelChatGateway({
      gateway: {
        chat: {
          completions: {
            async create(request: Record<string, unknown>) {
              capturedRequest = request;
              return {
                providerRequestId: "provider-request-reasoning",
                stream: (async function* () {
                  yield { choices: [{ delta: { content: "场景正文。" } }] };
                })(),
                abort() {},
                completed: Promise.resolve({
                  status: "succeeded" as const,
                  usage: null,
                  usageSource: "provider_missing" as const,
                }),
              };
            },
          },
        },
      } as never,
      disableThinking: true,
    });

    for await (const _delta of gateway.streamJson!({
      model: "text-model",
      prompt: "prompt",
    })) {}

    assert.deepEqual(capturedRequest?.thinking, { type: "disabled" });
  });

  it("surfaces a failed provider completion instead of treating it as a complete stream", async () => {
    const gateway = createTextModelChatGateway({
      gateway: {
        chat: {
          completions: {
            async create() {
              return {
                providerRequestId: "provider-request-failed",
                stream: (async function* () {
                  yield { choices: [{ delta: { content: "partial" } }] };
                })(),
                abort() {},
                completed: Promise.resolve({
                  status: "failed" as const,
                  failureCode: "provider_stream_error",
                  usage: null,
                  usageSource: "provider_missing" as const,
                }),
              };
            },
          },
        },
      } as never,
    });

    await assert.rejects(
      async () => {
        for await (const _delta of gateway.streamJson!({ model: "text-model", prompt: "prompt" })) {
          // Drain the stream so the completion status is observed.
        }
      },
      /provider_stream_error/,
    );
  });

  it("returns provider usage with completed JSON content", async () => {
    const gateway = createTextModelChatGateway({
      gateway: {
        chat: {
          completions: {
            async create() {
              return {
                providerRequestId: "provider-request-usage",
                stream: (async function* () {
                  yield { choices: [{ delta: { content: '{"ok":true}' } }] };
                })(),
                abort() {},
                completed: Promise.resolve({
                  status: "succeeded" as const,
                  usage: { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 },
                  usageSource: "provider" as const,
                }),
              };
            },
          },
        },
      } as never,
    });

    const result = await gateway.completeJsonWithUsage!({ model: "text-model", prompt: "prompt" });

    assert.equal(result.content, '{"ok":true}');
    assert.equal(result.providerRequestId, "provider-request-usage");
    assert.deepEqual(result.usage, { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 });
  });

  it("aborts text completion streams that exceed the caller response limit", async () => {
    let aborted = false;
    const gateway = createTextModelChatGateway({
      gateway: {
        chat: {
          completions: {
            async create() {
              return {
                providerRequestId: "provider-request-oversized",
                stream: (async function* () {
                  yield { choices: [{ delta: { content: "1234" } }] };
                  yield { choices: [{ delta: { content: "5678" } }] };
                })(),
                abort() { aborted = true; },
                completed: Promise.resolve({
                  status: "canceled" as const,
                  failureCode: "client_aborted_stream",
                  usage: null,
                  usageSource: "provider_missing" as const,
                }),
              };
            },
          },
        },
      } as never,
    });

    await assert.rejects(
      gateway.completeJsonWithUsage!({ model: "text-model", prompt: "prompt", maxResponseChars: 6 }),
      (error: unknown) => Boolean(error && typeof error === "object" && "code" in error
        && error.code === "provider_response_too_large"),
    );
    assert.equal(aborted, true);
  });

  it("passes canvas ownership to every storyboard model stage", async () => {
    const canvasProjectId = "40000000-0000-4000-8000-000000000098";
    const calls: Array<Parameters<TextChatGatewayLike["completeJson"]>[0]> = [];
    const gateway: TextChatGatewayLike = {
      async completeJson(input) {
        calls.push(input);
        return JSON.stringify({ scenes: [{ sceneName: "旧木屋" }] });
      },
      async *streamJson(input) {
        calls.push(input);
        yield JSON.stringify({ scenes: [{ sceneName: "旧木屋" }] });
      },
    };
    const service = createAiStoryboardPreviewService({ gateway });

    await service.generatePreview({
      projectId: canvasProjectId,
      canvasProjectId,
      scriptText: "任小野把饭食递给闵婶子。",
      skipScriptStage: true,
      selectedStages: ["scene"],
      packages: {},
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.projectId, null);
    assert.equal(calls[0]?.canvasProjectId, canvasProjectId);
  });

  it("uses deepseek-chat for script, scene, character and storyboard prompts", async () => {
    const gateway = new FakeTextGateway([
      JSON.stringify({
        scriptText: "任小野把小草托付给闵婶子。\n\n今天又得麻烦您照看小草了。",
      }),
      "```markdown\n【剧本场景列表】\n| 场景名称 | 场景描述 | 场景图片提示词 |\n| --- | --- | --- |\n| 闵婶家门前 傍晚 | 旧木屋门前，灶火微亮。 | 旧木屋门前，傍晚，灶火微亮，生活化质感。 |\n```",
      "```markdown\n【剧本角色列表】\n| 角色名称 | 角色描述 | 角色图片提示词 |\n| --- | --- | --- |\n| 任小野 旧布短衣 | 约17岁的东方少年，清瘦警觉。 | 17岁东方少年，旧布短衣，清瘦警觉。 |\n```",
      "```markdown\n【剧本道具列表】\n| 道具名称 | 道具描述 | 道具图片提示词 |\n| --- | --- | --- |\n| 饭食 | 递交给闵婶子的简单饭食 | 旧布包裹的朴素饭食 |\n```",
      "```markdown\n【剧本分镜列表】\n| 镜号 | 分镜剧情 | 对话/旁白 | 静态图片提示词 | 动态视频提示词 |\n| --- | --- | --- | --- | --- |\n| 1 | 任小野递出饭食。 | 麻烦您了。 | 任小野站在旧木屋门前递出饭食。 | 【镜头】3-4秒，中景固定镜头，任小野递出饭食。 |\n```",
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
    assert.deepEqual(gateway.calls.map((call) => call.responseFormat), ["text", "text", "text", "text", "text"]);
    assert.deepEqual(gateway.calls.map((call) => call.maxTokens), [undefined, undefined, undefined, undefined, 32_768]);
    assert.match(gateway.calls[0]?.prompt ?? "", /玄幻修仙/);
    assert.match(gateway.calls[0]?.prompt ?? "", /男频热血/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /短剧快节奏/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /输出 JSON/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /镜头看点：/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /输出格式：/);
    assert.match(gateway.calls[0]?.prompt ?? "", /避免角色不一致/);
    assert.match(gateway.calls[0]?.prompt ?? "", /任小野把小草托付给闵婶子/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /请把小说原文改写/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /纯文本剧本/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /JSON 对象/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /scriptText/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /改写要求/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /题材看点：/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /情绪看点：/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /通用禁忌：/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /\[小说原文\]/);
    assert.ok((gateway.calls[0]?.prompt ?? "").indexOf("玄幻修仙") < (gateway.calls[0]?.prompt ?? "").indexOf("男频热血"));
    assert.ok((gateway.calls[0]?.prompt ?? "").indexOf("男频热血") < (gateway.calls[0]?.prompt ?? "").indexOf("避免角色不一致"));
    assert.ok((gateway.calls[0]?.prompt ?? "").indexOf("避免角色不一致") < (gateway.calls[0]?.prompt ?? "").indexOf("任小野把小草托付给闵婶子"));
    assert.match(gateway.calls[1]?.prompt ?? "", /后台默认场景提示词/);
    assert.doesNotMatch(gateway.calls[1]?.prompt ?? "", /请根据【场景默认提示词】和【剧本】生成场景提示词结果。/);
    assert.match(gateway.calls[1]?.prompt ?? "", /【剧本】\n任小野把小草托付给闵婶子/);
    assert.match(gateway.calls[1]?.prompt ?? "", /任小野把小草托付给闵婶子/);
    assert.doesNotMatch(gateway.calls[1]?.prompt ?? "", /【返回协议】/);
    assert.doesNotMatch(gateway.calls[1]?.prompt ?? "", /【剧本场景列表】/);
    assert.match(gateway.calls[1]?.prompt ?? "", /从输出的第一个字符起，直接输出提取列表/);
    assert.match(gateway.calls[1]?.prompt ?? "", /\[\[DETAILS\]\]/);
    assert.doesNotMatch(gateway.calls[1]?.prompt ?? "", /```markdown/);
    assert.doesNotMatch(gateway.calls[1]?.prompt ?? "", /后台默认道具提示词/);
    assert.match(gateway.calls[2]?.prompt ?? "", /后台默认角色提示词/);
    assert.doesNotMatch(gateway.calls[2]?.prompt ?? "", /请根据【角色默认提示词】和【剧本】生成角色提示词结果。/);
    assert.doesNotMatch(gateway.calls[2]?.prompt ?? "", /\{\{novel_chunk\}\}/);
    assert.match(gateway.calls[2]?.prompt ?? "", /剧本如下：【剧本】\n任小野把小草托付给闵婶子/);
    assert.match(gateway.calls[2]?.prompt ?? "", /【剧本】\n任小野把小草托付给闵婶子/);
    assert.match(gateway.calls[2]?.prompt ?? "", /任小野把小草托付给闵婶子/);
    assert.doesNotMatch(gateway.calls[2]?.prompt ?? "", /【返回协议】/);
    assert.doesNotMatch(gateway.calls[2]?.prompt ?? "", /【剧本角色列表】/);
    assert.match(gateway.calls[2]?.prompt ?? "", /从输出的第一个字符起，直接输出提取列表/);
    assert.match(gateway.calls[3]?.prompt ?? "", /后台默认道具提示词/);
    assert.doesNotMatch(gateway.calls[3]?.prompt ?? "", /请根据【道具默认提示词】和【剧本】生成道具提示词结果。/);
    assert.doesNotMatch(gateway.calls[3]?.prompt ?? "", /\{\{script_text\}\}/);
    assert.match(gateway.calls[3]?.prompt ?? "", /任小野把小草托付给闵婶子/);
    assert.doesNotMatch(gateway.calls[3]?.prompt ?? "", /【返回协议】/);
    assert.doesNotMatch(gateway.calls[3]?.prompt ?? "", /【剧本道具列表】/);
    assert.match(gateway.calls[3]?.prompt ?? "", /从输出的第一个字符起，直接输出提取列表/);
    assert.doesNotMatch(gateway.calls[3]?.prompt ?? "", /后台默认场景提示词/);
    assert.match(gateway.calls[4]?.prompt ?? "", /后台默认分镜提示词/);
    assert.doesNotMatch(gateway.calls[4]?.prompt ?? "", /请根据【分镜默认提示词】和【剧本】生成分镜提示词结果。/);
    assert.doesNotMatch(gateway.calls[4]?.prompt ?? "", /\{\{story_text\}\}/);
    assert.match(gateway.calls[4]?.prompt ?? "", /任小野把小草托付给闵婶子/);
    assert.doesNotMatch(gateway.calls[4]?.prompt ?? "", /【返回协议】/);
    assert.doesNotMatch(gateway.calls[4]?.prompt ?? "", /【剧本分镜列表】/);
    assert.doesNotMatch(gateway.calls[4]?.prompt ?? "", /\[\[DETAILS\]\]/);
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
    assert.match(result.commitPayload.storyboards[0]?.videoPrompt ?? "", /【分镜1】/);
    assert.match(result.commitPayload.storyboards[0]?.videoPrompt ?? "", /【镜头1】 转场: 无 镜头类型: 未注明 画面描述:/);
    assert.match(result.commitPayload.storyboards[0]?.videoPrompt ?? "", /【镜头】3-4秒，中景固定镜头，任小野递出饭食。/);
  });

  it("splits labeled assets by each name and keeps each storyboard row complete", async () => {
    const gateway = new FakeTextGateway([
      [
        "场景提取结果",
        "-**场景名称**: 城外尸堆",
        "-**画面构图**: 尸骸铺满前景",
        "-**生图提示词**: 阴冷荒野全景",
        "-**场景名称**: 铁木城门",
        "-**画面构图**: 绞盘位于画面中央",
        "-**生图提示词**: 暮色城门全景",
      ].join("\n"),
      [
        "| 角色名称 | 角色描述 |",
        "| --- | --- |",
        "| 任小野 | 黑发少年，冷静警觉 |",
        "| 叙言 | 瘦削青年，神情慌乱 |",
      ].join("\n"),
      [
        "**1. 切割刀**",
        "* **道具名称**: 切割刀",
        "* **外观**: 黑色短刀",
        "* **生图提示词**: 磨损刀刃",
        "**2. 普通灰晶**",
        "* **道具名称**: 普通灰晶",
        "* **外观**: 灰白晶体",
        "* **生图提示词**: 半透明碎片",
      ].join("\n"),
      [
        "| 分镜剧情 | 对话/旁白 | 静态图片提示词 | 动态视频提示词 |",
        "| --- | --- | --- | --- |",
        "| 分镜1：任小野拔刀。 | 无台词 | 尸堆前拔刀定格 | 【镜头1】特写拔刀<br>【镜头2】中景起身 |",
        "| 分镜2：叙言后退。 | 快跑！ | 城门前惊慌定格 | 【镜头1】近景后退<br>【镜头2】全景逃跑 |",
      ].join("\n"),
    ]);
    const result = await createAiStoryboardPreviewService({ gateway }).generatePreview({
      projectId: "40000000-0000-4000-8000-000000000011",
      scriptText: "任小野在尸堆前拔刀，叙言向城门后退。",
      skipScriptStage: true,
      packages: {},
    });

    assert.deepEqual(result.commitPayload.scenes.map((row) => row.sceneName), ["城外尸堆", "铁木城门"]);
    assert.match(result.commitPayload.scenes[0]?.sceneDescription ?? "", /画面构图: 尸骸铺满前景/);
    assert.doesNotMatch(result.commitPayload.scenes[0]?.sceneDescription ?? "", /铁木城门/);
    assert.deepEqual(result.commitPayload.characters.map((row) => row.characterName), ["任小野", "叙言"]);
    assert.match(result.commitPayload.characters[1]?.characterDescription ?? "", /瘦削青年，神情慌乱/);
    assert.deepEqual(result.commitPayload.props.map((row) => row.propName), ["切割刀", "普通灰晶"]);
    assert.match(result.commitPayload.props[0]?.propDescription ?? "", /生图提示词: 磨损刀刃/);
    assert.doesNotMatch(result.commitPayload.props[0]?.propDescription ?? "", /普通灰晶/);
    assert.equal(result.commitPayload.storyboards.length, 2);
    assert.match(result.commitPayload.storyboards[0]?.plot ?? "", /^分镜1：任小野拔刀/);
    assert.match(result.commitPayload.storyboards[0]?.videoPrompt ?? "", /【镜头2】中景起身/);
    assert.match(result.commitPayload.storyboards[1]?.videoPrompt ?? "", /【镜头2】全景逃跑/);
  });

  it("skips the script generation stage when skipScriptStage is enabled", async () => {
    const gateway = new FakeTextGateway([
      JSON.stringify({
        scenes: [{ sceneName: "门前", sceneDescription: "旧木屋", sceneImagePrompt: "旧木屋门前。" }],
      }),
      JSON.stringify({
        characters: [{ characterName: "任小野", characterDescription: "少年", characterImagePrompt: "少年。" }],
      }),
      JSON.stringify({
        props: [{ propName: "饭食", propDescription: "简单饭食", propImagePrompt: "饭食。" }],
      }),
      JSON.stringify({
        storyboards: [{ shotNo: 1, plot: "直接进入分镜。", dialogue: "", imagePrompt: "直接进入分镜。", videoPrompt: "分镜。" }],
      }),
    ]);

    const service = createAiStoryboardPreviewService({ gateway });
    const events = [];
    for await (const event of service.generatePreviewStream({
      projectId: "40000000-0000-4000-8000-000000000010",
      createdByUserId: "30000000-0000-4000-8000-000000000010",
      scriptText: "这是现成剧本。",
      skipScriptStage: true,
      packages: {
        genrePrompt: "玄幻修仙",
        emotionPrompt: "男频热血",
        tabooPrompt: "避免角色不一致",
      },
    })) {
      events.push(event);
    }

    assert.equal(gateway.calls.length, 4);
    assert.equal(events[0]?.type, "script_done");
    assert.equal(events[0]?.text, "这是现成剧本。");
    assert.equal(events.some((event) => event.type === "script_prompt"), false);
    assert.equal(events.some((event) => event.type === "script_start"), false);
    assert.equal(events.some((event) => event.type === "script_delta"), false);
    assert.deepEqual(events.filter((event) => event.type === "asset_prompt").map((event) => event.stage), [
      "scene",
      "character",
      "prop",
      "shot",
    ]);
    assert.match(gateway.calls[0]?.prompt ?? "", /这是现成剧本。/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /玄幻修仙/);
    assert.equal(events.at(-1)?.type, "complete");
    assert.equal(events.at(-1)?.preview.displayTables.script.rows[0]?.scriptContent, "这是现成剧本。");
  });

  it("runs scene, character and prop extraction in parallel before replaying their events", async () => {
    let activeCalls = 0;
    let maximumActiveCalls = 0;
    let releaseCalls!: () => void;
    const allCallsStarted = new Promise<void>((resolve) => {
      releaseCalls = resolve;
    });
    const calls: string[] = [];
    const gateway: TextChatGatewayLike = {
      async completeJson() {
        throw new Error("streaming gateway expected");
      },
      async *streamJson(input) {
        const prompt = String(input.prompt ?? "");
        calls.push(prompt);
        activeCalls += 1;
        maximumActiveCalls = Math.max(maximumActiveCalls, activeCalls);
        if (activeCalls === 3) releaseCalls();
        await allCallsStarted;
        activeCalls -= 1;
        if (prompt.startsWith("SCENE")) {
          yield JSON.stringify({ scenes: [{ sceneName: "旧城门" }] });
        } else if (prompt.startsWith("CHARACTER")) {
          yield JSON.stringify({ characters: [{ characterName: "任小野" }] });
        } else {
          yield JSON.stringify({ props: [{ propName: "短刀" }] });
        }
      },
    };

    const result = await createAiStoryboardPreviewService({ gateway }).generatePreview({
      projectId: "40000000-0000-4000-8000-000000000019",
      scriptText: "任小野在旧城门前拔出短刀。",
      skipScriptStage: true,
      selectedStages: ["scene", "character", "prop"],
      packages: {},
      templates: {
        scenePrompt: "SCENE {{script_text}}",
        characterPrompt: "CHARACTER {{script_text}}",
        propPrompt: "PROP {{script_text}}",
      },
    });

    assert.equal(calls.length, 3);
    assert.equal(maximumActiveCalls, 3);
    assert.equal(result.displayTables.scenes.rows[0]?.sceneName, "旧城门");
    assert.equal(result.displayTables.characters.rows[0]?.characterName, "任小野");
    assert.equal(result.displayTables.props.rows[0]?.propName, "短刀");
  });

  it("runs only the selected script skill with the selected text model", async () => {
    const gateway = new FakeTextGateway(["改编后的剧本。"]);
    const service = createAiStoryboardPreviewService({ gateway });

    const result = await service.generatePreview({
      projectId: "40000000-0000-4000-8000-000000000020",
      scriptText: "小说原文。",
      modelCode: "selected-text-model",
      selectedStages: ["script"],
      packages: { skillPrompt: "转剧本提示词" },
    });

    assert.equal(gateway.calls.length, 1);
    assert.equal(gateway.calls[0]?.model, "selected-text-model");
    assert.match(gateway.calls[0]?.prompt ?? "", /转剧本提示词/);
    assert.equal(result.scriptText, "改编后的剧本。");
    assert.equal(result.displayTables.storyboards.rows.length, 0);
  });

  it("runs only the selected shot skill against the input script", async () => {
    const gateway = new FakeTextGateway([
      JSON.stringify({ storyboards: [{ shotNo: 1, plot: "只生成分镜", imagePrompt: "画面", videoPrompt: "镜头" }] }),
    ]);
    const service = createAiStoryboardPreviewService({ gateway });
    const events = [];

    for await (const event of service.generatePreviewStream({
      projectId: "40000000-0000-4000-8000-000000000021",
      scriptText: "现成剧本。",
      modelCode: "selected-text-model",
      selectedStages: ["shot"],
      packages: {},
      context: {
        scenes: [{ sceneName: "旧城门", sceneDescription: "雨夜城门" }],
        characters: [{ characterName: "任小野", characterDescription: "清瘦少年" }],
        props: [{ propName: "饭食", propDescription: "旧布包裹" }],
      },
      templates: { shotPrompt: "分镜技能 {{script_text}}" },
    })) {
      events.push(event);
    }

    assert.equal(gateway.calls.length, 1);
    assert.equal(gateway.calls[0]?.model, "selected-text-model");
    assert.match(gateway.calls[0]?.prompt ?? "", /分镜技能 现成剧本。/);
    assert.match(gateway.calls[0]?.prompt ?? "", /旧城门/);
    assert.match(gateway.calls[0]?.prompt ?? "", /任小野/);
    assert.match(gateway.calls[0]?.prompt ?? "", /饭食/);
    assert.deepEqual(events.filter((event) => event.type === "asset_prompt").map((event) => event.stage), ["shot"]);
    assert.equal(events.some((event) => event.type === "script_start"), false);
  });

  it("feeds the selected script result into each later selected skill", async () => {
    const gateway = new FakeTextGateway([
      "链路生成的剧本。",
      JSON.stringify({ scenes: [{ sceneName: "新场景" }] }),
      JSON.stringify({ storyboards: [{ shotNo: 1, plot: "新分镜" }] }),
    ]);
    const service = createAiStoryboardPreviewService({ gateway });

    await service.generatePreview({
      projectId: "40000000-0000-4000-8000-000000000022",
      scriptText: "小说原文。",
      modelCode: "selected-text-model",
      selectedStages: ["script", "scene", "shot"],
      packages: { skillPrompt: "转剧本技能" },
      templates: { scenePrompt: "场景技能", shotPrompt: "分镜技能" },
    });

    assert.equal(gateway.calls.length, 3);
    assert.deepEqual(gateway.calls.map((call) => call.model), ["selected-text-model", "selected-text-model", "selected-text-model"]);
    assert.match(gateway.calls[1]?.prompt ?? "", /链路生成的剧本。/);
    assert.match(gateway.calls[2]?.prompt ?? "", /链路生成的剧本。/);
    assert.doesNotMatch(gateway.calls[1]?.prompt ?? "", /小说原文。/);
    assert.doesNotMatch(gateway.calls[2]?.prompt ?? "", /小说原文。/);
  });

  it("repairs loose json from scene character and prop stages instead of failing the preview", async () => {
    const gateway = new FakeTextGateway([
      "```markdown\n任小野把小草托付给闵婶子。\n```",
      "```json\n{\n  scenes: [\n    {\n      sceneId: \"scene_001\",\n      sceneName: \"闵婶家门前\",\n      sceneDescription: \"旧木屋门前，灶火微亮。\",\n      sceneImagePrompt: \"旧木屋门前，灶火微亮。\",\n    },\n  ],\n}\n```",
      "```json\n{\n  characters: [\n    {\n      characterId: \"char_001\",\n      characterName: \"任小野\",\n      characterDescription: \"约17岁的东方少年。\",\n      characterImagePrompt: \"17岁东方少年。\",\n    },\n  ],\n}\n```",
      "```json\n{\n  props: [\n    {\n      propId: \"prop_001\",\n      propName: \"饭食\",\n      propDescription: \"递交给闵婶子的简单饭食\",\n      propImagePrompt: \"旧布包裹的朴素饭食\",\n    },\n  ],\n}\n```",
      "```json\n{\n  storyboards: [\n    {\n      shotNo: 1,\n      plot: \"任小野递出饭食。\",\n      dialogue: \"麻烦您了。\",\n      imagePrompt: \"任小野站在旧木屋门前递出饭食。\",\n      videoPrompt: \"【镜头】3-4秒，中景固定镜头，任小野递出饭食。\",\n      durationSec: 4,\n    },\n  ],\n}\n```",
    ]);

    const service = createAiStoryboardPreviewService({ gateway });
    const result = await service.generatePreview({
      projectId: "40000000-0000-4000-8000-000000000011",
      createdByUserId: "30000000-0000-4000-8000-000000000011",
      scriptText: "任小野把小草托付给闵婶子。",
      packages: {},
      templates: {
        scenePrompt: "scene",
        characterPrompt: "character",
        propPrompt: "prop",
        shotPrompt: "shot",
      },
    });

    assert.equal(result.displayTables.scenes.rows[0]?.sceneName, "闵婶家门前");
    assert.equal(result.displayTables.characters.rows[0]?.characterName, "任小野");
    assert.equal(result.displayTables.props.rows[0]?.propName, "饭食");
    assert.equal(result.commitPayload.storyboards[0]?.plot, "任小野递出饭食。");
  });

  it("recovers truncated string values from scene character and prop stages instead of failing the preview", async () => {
    const gateway = new FakeTextGateway([
      "```markdown\n任小野把小草托付给闵婶子。\n```",
      "```json\n{\n  \"scenes\": [\n    {\n      \"sceneId\": \"scene_001\",\n      \"sceneName\": \"闵婶家门前\",\n      \"sceneDescription\": \"旧木屋门前，灶火微亮。\",\n      \"sceneImagePrompt\": \"旧木屋门前，灶火微亮。\n    }\n  ]\n}\n```",
      "```json\n{\n  \"characters\": [\n    {\n      \"characterId\": \"char_001\",\n      \"characterName\": \"任小野\",\n      \"characterDescription\": \"约17岁的东方少年。\",\n      \"characterImagePrompt\": \"17岁东方少年。\n    }\n  ]\n}\n```",
      "```json\n{\n  \"props\": [\n    {\n      \"propId\": \"prop_001\",\n      \"propName\": \"饭食\",\n      \"propDescription\": \"递交给闵婶子的简单饭食\",\n      \"propImagePrompt\": \"旧布包裹的朴素饭食\n    }\n  ]\n}\n```",
      "```json\n{\n  \"storyboards\": [\n    {\n      \"shotNo\": 1,\n      \"plot\": \"任小野递出饭食。\",\n      \"dialogue\": \"麻烦您了。\",\n      \"imagePrompt\": \"任小野站在旧木屋门前递出饭食。\",\n      \"videoPrompt\": \"【镜头】3-4秒，中景固定镜头，任小野递出饭食。\",\n      \"durationSec\": 4\n    }\n  ]\n}\n```",
    ]);

    const service = createAiStoryboardPreviewService({ gateway });
    const result = await service.generatePreview({
      projectId: "40000000-0000-4000-8000-000000000012",
      createdByUserId: "30000000-0000-4000-8000-000000000012",
      scriptText: "任小野把小草托付给闵婶子。",
      packages: {},
      templates: {
        scenePrompt: "scene",
        characterPrompt: "character",
        propPrompt: "prop",
        shotPrompt: "shot",
      },
    });

    assert.equal(result.displayTables.scenes.rows[0]?.sceneName, "闵婶家门前");
    assert.match(result.displayTables.scenes.rows[0]?.sceneImagePrompt ?? "", /旧木屋门前/);
    assert.equal(result.displayTables.characters.rows[0]?.characterName, "任小野");
    assert.match(result.displayTables.characters.rows[0]?.characterImagePrompt ?? "", /17岁东方少年/);
    assert.equal(result.displayTables.props.rows[0]?.propName, "饭食");
    assert.match(result.displayTables.props.rows[0]?.propImagePrompt ?? "", /旧布包裹的朴素饭食/);
    assert.equal(result.commitPayload.storyboards[0]?.plot, "任小野递出饭食。");
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

    const storyboard = result.commitPayload.storyboards[0];
    assert.match(gateway.calls[4]?.prompt ?? "", /【已生成资产名称清单（唯一命名来源）】/);
    assert.match(gateway.calls[4]?.prompt ?? "", /场景：废土道路临时停驻点/);
    assert.match(gateway.calls[4]?.prompt ?? "", /角色：我/);
    assert.match(gateway.calls[4]?.prompt ?? "", /道具：机械臂；匕首/);
    assert.match(storyboard?.videoPrompt ?? "", /【资产对照表】/);
    assert.match(storyboard?.videoPrompt ?? "", /视频场景对照表: 废土道路临时停驻点=【@废土道路临时停驻点】/);
    assert.match(storyboard?.videoPrompt ?? "", /视频角色对照表: 我=【@我】/);
    assert.match(storyboard?.videoPrompt ?? "", /视频道具对照表: 机械臂=【@机械臂】；匕首=【@匕首】/);
    assert.match(storyboard?.assetReferenceText ?? "", /机械臂/);
  });

  it("canonicalizes storyboard @ names to the generated asset names", async () => {
    const gateway = new FakeTextGateway([
      JSON.stringify({
        scenes: [{ sceneName: "铁木城门（城门外）", sceneImagePrompt: "黄昏城门" }],
      }),
      JSON.stringify({
        characters: [{ characterName: "任小野", characterImagePrompt: "黑发少年" }],
      }),
      JSON.stringify({
        props: [{ propName: "切割刀（任小野的短刀）", propImagePrompt: "黑色短刀" }],
      }),
      JSON.stringify({
        storyboards: [{
          shotNo: 1,
          plot: "城门外拔刀",
          videoPrompt: [
            "任小野在城门外拔出切割刀。",
            "资产对照表：",
            "视频场景对照表: 城门外=【@城门外】",
            "视频角色对照表: 任小野=【@任小野】",
            "视频道具对照表: 切割刀=【@切割刀】",
          ].join("\n"),
          sceneName: "城门外",
          characterNames: ["任小野"],
          props: [{ propName: "切割刀" }],
        }],
      }),
    ]);

    const result = await createAiStoryboardPreviewService({ gateway }).generatePreview({
      projectId: "40000000-0000-4000-8000-000000000012",
      scriptText: "任小野在城门外拔出切割刀。",
      skipScriptStage: true,
      packages: {},
    });

    const storyboard = result.commitPayload.storyboards[0];
    assert.match(gateway.calls[3]?.prompt ?? "", /场景：铁木城门（城门外）/);
    assert.match(gateway.calls[3]?.prompt ?? "", /道具：切割刀（任小野的短刀）/);
    assert.match(storyboard?.videoPrompt ?? "", /视频场景对照表: 铁木城门（城门外）=【@铁木城门（城门外）】/);
    assert.match(storyboard?.videoPrompt ?? "", /视频道具对照表: 切割刀（任小野的短刀）=【@切割刀（任小野的短刀）】/);
    assert.doesNotMatch(storyboard?.videoPrompt ?? "", /视频道具对照表: 切割刀=【@切割刀】/);
  });

  it("splits bracket-labeled novel storyboard output into project assets and shots", async () => {
    const gateway = new FakeTextGateway([
      "原始小说内容。",
      [
        "【角色名称】任小野",
        "黑发少年，衣着朴素。",
        "【场景名称】黄昏城门口",
        "暮色压在高大的铁木城门上。",
        "【道具名称】切割刀",
        "黑色短刀，刃口有缺损。",
      ].join("\n"),
      "无有效角色输出",
      "无有效道具输出",
      [
        "【分镜1】任小野站在【@黄昏城门口】，握紧【@切割刀】。",
        "【分镜2】任小野抬头望向城门。",
      ].join("\n"),
    ]);

    const result = await createAiStoryboardPreviewService({ gateway }).generatePreview({
      projectId: "40000000-0000-4000-8000-000000000022",
      scriptText: "原始小说内容。",
      packages: {},
    });

    assert.equal(result.commitPayload.characters[0]?.characterName, "任小野");
    assert.match(result.commitPayload.characters[0]?.characterDescription ?? "", /黑发少年/);
    assert.equal(result.commitPayload.scenes[0]?.sceneName, "黄昏城门口");
    assert.match(result.commitPayload.scenes[0]?.sceneDescription ?? "", /暮色/);
    assert.equal(result.commitPayload.props[0]?.propName, "切割刀");
    assert.match(result.commitPayload.props[0]?.propDescription ?? "", /黑色短刀/);
    assert.equal(result.commitPayload.storyboards.length, 2);
    assert.equal(result.commitPayload.storyboards[0]?.shotNo, 1);
    assert.match(result.commitPayload.storyboards[0]?.plot ?? "", /任小野站在/);
    assert.equal(result.commitPayload.storyboards[1]?.shotNo, 2);
    assert.match(result.commitPayload.storyboards[1]?.plot ?? "", /抬头望向城门/);
  });

  it("splits all project sections from one bracket-labeled storyboard skill", async () => {
    const gateway = new FakeTextGateway([[
      "【角色名称】白玫鬼",
      "白衣剑客。",
      "【场景名称】黄昏尸骸战场",
      "暮色中的荒凉战场。",
      "【道具名称】切割刀",
      "刀刃有明显缺口。",
      "【分镜1】白玫鬼来到【@黄昏尸骸战场】，看见拿着【@切割刀】的人。",
    ].join("\n")]);

    const result = await createAiStoryboardPreviewService({ gateway }).generatePreview({
      projectId: "40000000-0000-4000-8000-000000000023",
      scriptText: "白玫鬼来到黄昏尸骸战场。",
      skipScriptStage: true,
      selectedStages: ["shot"],
      packages: {},
    });

    assert.equal(result.commitPayload.characters[0]?.characterName, "白玫鬼");
    assert.equal(result.commitPayload.scenes[0]?.sceneName, "黄昏尸骸战场");
    assert.equal(result.commitPayload.props[0]?.propName, "切割刀");
    assert.equal(result.commitPayload.storyboards.length, 1);
    assert.match(result.commitPayload.storyboards[0]?.plot ?? "", /白玫鬼来到/);
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

  it("completes the stream with fallback rows when the shot JSON is truncated", async () => {
    const gateway = new FakeTextGateway([
      "任小野把小草托付给闵婶子。",
      '{"scenes":[{"sceneName":"门前","sceneDescription":"旧木屋","sceneImagePrompt":"旧木屋。"}]}',
      '{"characters":[{"characterName":"任小野","characterDescription":"少年","characterImagePrompt":"少年。"}]}',
      '{"props":[{"propName":"饭食","propDescription":"简单饭食","propImagePrompt":"旧布包裹的饭食。"}]}',
      '{"storyboards":[{"plot":"递出饭食","dialogue":"麻烦您了","imagePrompt":"任小野递出饭食","videoPrompt":"中景固定镜头，任小野递出',
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

    const complete = events.at(-1);
    assert.equal(complete?.type, "complete");
    assert.equal(complete?.preview.displayTables.scenes.rows[0]?.sceneName, "门前");
    assert.match(complete?.preview.displayTables.storyboards.rows[0]?.plot ?? "", /递出饭食/);
    assert.match(complete?.preview.commitPayload.storyboards[0]?.videoPrompt ?? "", /中景固定镜头/);
    assert.equal(events.some((event) => event.type === "asset_done" && event.stage === "shot"), true);
  });

  it("recovers completed segment shots from truncated chapter storyboard JSON", async () => {
    const gateway = new FakeTextGateway([
      "叶焚野在废墟中交易。",
      '{"scenes":[]}',
      '{"characters":[]}',
      '{"props":[]}',
      [
        '{"script_title":"万械协议","total_segments":12,"segments":[{"segment_id":1,',
        '"scene_analysis":{"scene_name":"出租屋"},',
        '"shots":[',
        '{"shot_id":"1.1","time_range":"0.0-3.5秒","transition":"硬切","shot_type":"中景","camera_movement":"固定","description":"叶焚野盯着屏幕弹窗。","core_action":"快速打字","dialogue_or_os":"","sound_effects":"键盘敲击声"},',
        '{"shot_id":"1.2","time_range":"3.5-7.0秒","transition":"硬切","shot_type":"特写","camera_movement":"固定","description":"微信对话特写。","core_action":"查看消息并回复","dialogue_or_os":"老板：放心，这是个大老板。","sound_effects":"键盘敲击声"}',
        ']}',
      ].join(""),
    ]);

    const service = createAiStoryboardPreviewService({ gateway });
    const events = [];
    for await (const event of service.generatePreviewStream({
      projectId: "40000000-0000-4000-8000-000000000001",
      scriptText: "叶焚野在废墟中交易。",
      packages: {},
    })) {
      events.push(event);
    }

    const complete = events.at(-1);
    assert.equal(complete?.type, "complete");
    const table = complete?.preview.displayTables.storyboards;
    assert.equal(table?.title, "分镜");
    assert.match(table?.columns.join("|") ?? "", /分镜剧情/);
    assert.match(table?.columns.join("|") ?? "", /动态视频提示词/);
    assert.equal(table?.rows.length, 1);
    assert.match(table?.rows[0]?.plot ?? "", /【场景分析】/);
    assert.match(table?.rows[0]?.dialogue ?? "", /镜头1\.2/);
    assert.match(table?.rows[0]?.videoPrompt ?? "", /【镜头列表】/);
    assert.match(table?.rows[0]?.videoPrompt ?? "", /【镜头1\.1】/);
    assert.match(table?.rows[0]?.videoPrompt ?? "", /【镜头1\.2】/);
    assert.doesNotMatch(table?.rows[0]?.plot ?? "", /script_title/);
  });

  it("derives scenes from storyboard segments when the scene stage returns empty", async () => {
    const gateway = new FakeTextGateway([
      "黄昏时分，任小野站在城门口。",
      '{"scenes":[]}',
      '{"characters":[]}',
      '{"props":[]}',
      JSON.stringify({
        segments: [
          {
            segment_id: 1,
            scene_analysis: {
              scene_name: "黄昏城门口",
              emotion_intent: "建立世界氛围",
              atmosphere: "人群流动中的压抑感",
            },
            asset_table: {
              "视频场景对照表": ["黄昏城门口"],
            },
            shots: [
              {
                shot_id: "1.1",
                time_range: "0.0-3.0秒",
                transition: "硬切",
                shot_type: "全景",
                description: "城门口人群缓慢走动，任小野站在光里。",
                dialogue_or_os: "",
                sound_effects: "人声与风声",
              },
            ],
          },
        ],
      }),
    ]);

    const service = createAiStoryboardPreviewService({ gateway });
    const result = await service.generatePreview({
      projectId: "40000000-0000-4000-8000-000000000021",
      createdByUserId: "30000000-0000-4000-8000-000000000021",
      scriptText: "黄昏时分，任小野站在城门口。",
      packages: {},
      templates: {
        scenePrompt: "scene",
        characterPrompt: "character",
        propPrompt: "prop",
        shotPrompt: "shot",
      },
    });

    assert.equal(result.displayTables.scenes.rows[0]?.sceneName, "黄昏城门口");
    assert.match(result.displayTables.scenes.rows[0]?.sceneDescription ?? "", /建立世界氛围|人群流动中的压抑感/);
    assert.match(result.commitPayload.scenes[0]?.sceneImagePrompt ?? "", /视频场景对照表/);
  });

  it("splits stream deltas into small live echo chunks", async () => {
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
      ["AB"],
    );
    assert.deepEqual(
      events.filter((event) => event.type === "asset_delta" && event.stage === "scene").map((event) => event.text),
      ['{"scenes":[]}'],
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
    assert.equal(result.commitPayload.storyboards[0]?.imagePrompt, "wide shot, cold street, uneasy boy");
    assert.doesNotMatch(result.commitPayload.storyboards[0]?.videoPrompt ?? "", /12-14s/);
    assert.match(result.commitPayload.storyboards[0]?.videoPrompt ?? "", /【镜头1】0-2秒/);
    assert.match(result.commitPayload.storyboards[0]?.videoPrompt ?? "", /extreme close-up/);
    assert.match(result.commitPayload.storyboards[0]?.videoPrompt ?? "", /fast push-in/);
    assert.match(result.commitPayload.storyboards[0]?.videoPrompt ?? "", /heavy heartbeat/);
    assert.match(result.commitPayload.storyboards[0]?.videoPrompt ?? "", /Ren Xiaoye looks up/);
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

    const videoPrompt = result.commitPayload.storyboards[0]?.videoPrompt ?? "";
    assert.match(videoPrompt, /【分镜1】/);
    assert.match(videoPrompt, /【镜头1】0-3\.2秒 转场: 无 镜头类型: 中景\/平视\/缓慢平移 画面描述:/);
    assert.match(videoPrompt, /较大的旧木屋门前/);
    assert.match(videoPrompt, /核心动作: 添火、翻动、烟气上升。/);
    assert.match(videoPrompt, /对手戏设计: 无/);
    assert.match(videoPrompt, /人物底层逻辑: 灾后世界里/);
    assert.match(videoPrompt, /主体动作与台词:\n闻婶守在灶前/);
    assert.match(videoPrompt, /音效: 炉火噼啪/);
    assert.ok(result.displayTables.storyboards.columns.length >= 4);
    const row = result.displayTables.storyboards.rows[0];
    assert.equal(row?.plot, "闻婶家门口灶炉升火");
    assert.equal(row?.imagePrompt, "旧木屋门口，灶炉暖光。");
    assert.match(row?.videoPrompt ?? "", /【镜头1】0-3\.2秒/);
    assert.match(row?.videoPrompt ?? "", /镜头类型: 中景\/平视\/缓慢平移/);
  });

  it("integrates segment based storyboard output into chapter storyboard rows", async () => {
    const gateway = new FakeTextGateway([
      "script",
      JSON.stringify({ scenes: [] }),
      JSON.stringify({ characters: [] }),
      JSON.stringify({ props: [] }),
      JSON.stringify({
        script_title: "mist",
        total_segments: 1,
        segments: [
          {
            segment_id: 9,
            scene_analysis: {
              scene_name: "city shadow",
              emotion_intent: "suspense rises",
              performance_logic: "Ren notices danger",
            },
            segment_transition: {
              previous_last_frame: "Ren stands still",
              current_opening_frame: "Ren turns toward the shadow",
              continuity_logic: "same action continues",
            },
            shots: [
              {
                shot_id: 1,
                time_range: "0-4",
                transition: "cut",
                shot_type: "wide",
                camera_movement: "slow push",
                description: "Ren crouches outside the city gate.",
                core_action: "crouch and move",
                opponent_design: "none",
                character_logic: "professional caution",
                subject_action: "silent inner monologue",
                dialogue_or_os: "",
                sound_effects: "soft footsteps",
              },
            ],
            asset_table: {
              scene: "city shadow=@scene",
              character: "Ren=@ren",
              prop: "knife=@knife",
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

    assert.equal(result.displayTables.storyboards.columns.length, 4);
    const row = result.displayTables.storyboards.rows[0];
    assert.match(row?.plot ?? "", /city shadow/);
    assert.match(row?.dialogue ?? "", /silent inner monologue/);
    assert.match(row?.videoPrompt ?? "", /【分镜9】/);
    assert.match(row?.videoPrompt ?? "", /Ren crouches outside the city gate/);
    assert.match(row?.videoPrompt ?? "", /【资产对照表】/);
    assert.match(result.commitPayload.storyboards[0]?.videoPrompt ?? "", /crouch and move/);
    assert.equal(result.commitPayload.storyboards[0]?.segmentId, 9);
  });

  it("commits every segment as its own chapter storyboard row", async () => {
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
    assert.equal(result.commitPayload.storyboards[0]?.segmentId, 1);
    assert.match(result.commitPayload.storyboards[0]?.videoPrompt ?? "", /hero raises blade/);
    assert.match(result.commitPayload.storyboards[0]?.videoPrompt ?? "", /blade flashes/);
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
    assert.match(result.commitPayload.storyboards[0]?.videoPrompt ?? "", /21-24秒/);
    assert.match(result.commitPayload.storyboards[0]?.videoPrompt ?? "", /任小野转身/);
    assert.match(result.commitPayload.storyboards[0]?.videoPrompt ?? "", /【镜头1】0-3秒/);
    assert.match(result.commitPayload.storyboards[0]?.videoPrompt ?? "", /镜头类型: 中景\/固定镜头/);
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

    const [sceneCall, characterCall, propCall, shotCall] = gateway.calls.slice(1);

    assert.match(sceneCall?.prompt ?? "", /^场景模板 任小野托付妹妹。\n麻烦您照看小草。/);
    assert.doesNotMatch(sceneCall?.prompt ?? "", /\{\{novel_chapter\}\}/);
    assert.doesNotMatch(sceneCall?.prompt ?? "", /【剧本】\n任小野托付妹妹。/);
    assert.doesNotMatch(sceneCall?.prompt ?? "", /请根据【/);
    assert.doesNotMatch(sceneCall?.prompt ?? "", /【返回协议】/);
    assert.doesNotMatch(sceneCall?.prompt ?? "", /【剧本场景列表】/);

    assert.match(characterCall?.prompt ?? "", /^角色模板 任小野托付妹妹。\n麻烦您照看小草。/);
    assert.doesNotMatch(characterCall?.prompt ?? "", /\{\{novel_chunk\}\}/);
    assert.doesNotMatch(characterCall?.prompt ?? "", /【剧本】\n任小野托付妹妹。/);
    assert.doesNotMatch(characterCall?.prompt ?? "", /请根据【/);
    assert.doesNotMatch(characterCall?.prompt ?? "", /【返回协议】/);
    assert.doesNotMatch(characterCall?.prompt ?? "", /【剧本角色列表】/);

    assert.match(propCall?.prompt ?? "", /^道具模板 任小野托付妹妹。\n麻烦您照看小草。/);
    assert.doesNotMatch(propCall?.prompt ?? "", /\{\{script\}\}/);
    assert.doesNotMatch(propCall?.prompt ?? "", /【剧本】\n任小野托付妹妹。/);
    assert.doesNotMatch(propCall?.prompt ?? "", /请根据【/);
    assert.doesNotMatch(propCall?.prompt ?? "", /【返回协议】/);
    assert.doesNotMatch(propCall?.prompt ?? "", /【剧本道具列表】/);

    assert.match(shotCall?.prompt ?? "", /^分镜模板 任小野托付妹妹。\n麻烦您照看小草。/);
    assert.doesNotMatch(shotCall?.prompt ?? "", /\{\{story_text\}\}/);
    assert.doesNotMatch(shotCall?.prompt ?? "", /【剧本】\n任小野托付妹妹。/);
    assert.doesNotMatch(shotCall?.prompt ?? "", /请根据【/);
    assert.doesNotMatch(shotCall?.prompt ?? "", /【返回协议】/);
    assert.doesNotMatch(shotCall?.prompt ?? "", /【剧本分镜列表】/);
  });

  it("does not retry an asset stage when the model fails before producing output", async () => {
    let calls = 0;
    const gateway: TextChatGatewayLike = {
      async completeJson() { throw new Error("completeJson should not be called"); },
      async *streamJson() {
        calls += 1;
        throw Object.assign(new Error("provider failed"), { retryable: true });
      },
    };
    const service = createAiStoryboardPreviewService({ gateway });

    await assert.rejects(() => service.generatePreview({
      projectId: "40000000-0000-4000-8000-000000000001",
      scriptText: "任小野把饭食递给闵婶子。",
      skipScriptStage: true,
      selectedStages: ["prop"],
      packages: {},
      templates: { propPrompt: "道具模板" },
    }));

    assert.equal(calls, 1);
  });

  it("does not retry a provider ECONNRESET before producing output", async () => {
    let calls = 0;
    const gateway: TextChatGatewayLike = {
      async completeJson() { throw new Error("completeJson should not be called"); },
      async *streamJson() {
        calls += 1;
        throw Object.assign(new Error("Connection terminated unexpectedly"), { code: "ECONNRESET" });
      },
    };
    const service = createAiStoryboardPreviewService({ gateway });

    await assert.rejects(() => service.generatePreview({
      projectId: "40000000-0000-4000-8000-000000000001",
      scriptText: "任小野把饭食递给闵婶子。",
      skipScriptStage: true,
      selectedStages: ["scene"],
      packages: {},
    }));

    assert.equal(calls, 1);
  });

  it("does not retry a provider ECONNRESET after partial output", async () => {
    let calls = 0;
    const gateway: TextChatGatewayLike = {
      async completeJson() { throw new Error("completeJson should not be called"); },
      async *streamJson() {
        calls += 1;
        yield "partial";
        throw Object.assign(new Error("Connection terminated unexpectedly"), { code: "ECONNRESET" });
      },
    };
    const service = createAiStoryboardPreviewService({ gateway });

    await assert.rejects(() => service.generatePreview({
      projectId: "40000000-0000-4000-8000-000000000001",
      scriptText: "任小野把饭食递给闵婶子。",
      skipScriptStage: true,
      selectedStages: ["scene"],
      packages: {},
    }));

    assert.equal(calls, 1);
  });

  it("retries an asset stage after a marked PostgreSQL persistence reset", async () => {
    let calls = 0;
    const gateway: TextChatGatewayLike = {
      async completeJson() { throw new Error("completeJson should not be called"); },
      async *streamJson() {
        calls += 1;
        if (calls === 1) {
          throw markTransientDatabasePersistenceError(
            Object.assign(new Error("Connection terminated unexpectedly"), { code: "ECONNRESET" }),
          );
        }
        yield JSON.stringify({ scenes: [{ sceneName: "旧木屋" }] });
      },
    };
    const service = createAiStoryboardPreviewService({ gateway });

    const result = await service.generatePreview({
      projectId: "40000000-0000-4000-8000-000000000001",
      scriptText: "任小野把饭食递给闵婶子。",
      skipScriptStage: true,
      selectedStages: ["scene"],
      packages: {},
    });

    assert.equal(calls, 2);
    assert.equal(result.displayTables.scenes.rows[0]?.sceneName, "旧木屋");
  });

  it("does not retry a post-provider PostgreSQL persistence reset with empty output", async () => {
    let calls = 0;
    const gateway: TextChatGatewayLike = {
      async completeJson() { throw new Error("completeJson should not be called"); },
      async *streamJson() {
        calls += 1;
        throw markTransientDatabasePersistenceError(
          Object.assign(new Error("Connection terminated unexpectedly"), { code: "ECONNRESET" }),
          { retrySafe: false },
        );
      },
    };
    const service = createAiStoryboardPreviewService({ gateway });

    await assert.rejects(() => service.generatePreview({
      projectId: "40000000-0000-4000-8000-000000000001",
      scriptText: "任小野把饭食递给闵婶子。",
      skipScriptStage: true,
      selectedStages: ["scene"],
      packages: {},
    }));

    assert.equal(calls, 1);
  });

  it("keeps transient database retry behavior while the extraction stages run in parallel", async () => {
    const calls = new Map<string, number>();
    const gateway: TextChatGatewayLike = {
      async completeJson() { throw new Error("completeJson should not be called"); },
      async *streamJson(input) {
        const stage = input.prompt.startsWith("SCENE")
          ? "scene"
          : input.prompt.startsWith("CHARACTER")
            ? "character"
            : "prop";
        const attempt = (calls.get(stage) ?? 0) + 1;
        calls.set(stage, attempt);
        if (stage === "scene" && attempt === 1) {
          throw markTransientDatabasePersistenceError(
            Object.assign(new Error("Connection terminated unexpectedly"), { code: "ECONNRESET" }),
          );
        }
        yield {
          scene: JSON.stringify({ scenes: [{ sceneName: "旧木屋" }] }),
          character: JSON.stringify({ characters: [{ characterName: "任小野" }] }),
          prop: JSON.stringify({ props: [{ propName: "饭食" }] }),
        }[stage];
      },
    };
    const service = createAiStoryboardPreviewService({ gateway });

    const result = await service.generatePreview({
      projectId: "40000000-0000-4000-8000-000000000001",
      scriptText: "任小野把饭食递给闵婶子。",
      skipScriptStage: true,
      selectedStages: ["scene", "character", "prop"],
      packages: {},
      templates: {
        scenePrompt: "SCENE {{script}}",
        characterPrompt: "CHARACTER {{script}}",
        propPrompt: "PROP {{script}}",
      },
    });

    assert.deepEqual(Object.fromEntries(calls), { scene: 2, character: 1, prop: 1 });
    assert.equal(result.displayTables.scenes.rows[0]?.sceneName, "旧木屋");
    assert.equal(result.displayTables.characters.rows[0]?.characterName, "任小野");
    assert.equal(result.displayTables.props.rows[0]?.propName, "饭食");
  });

  it("continues a truncated storyboard response from the prior output boundary", async () => {
    const calls: Array<Parameters<TextChatGatewayLike["completeJson"]>[0]> = [];
    const initialRows = [
      "【剧本分镜列表】",
      "| 分镜剧情 | 对话/旁白 | 静态图片提示词 | 动态视频提示词 |",
      "| --- | --- | --- | --- |",
      "| 分镜1：白野走进营地。 | 无台词。 | 夜色营地，白野前行。 | 中景固定镜头，白野走进营地。 |",
    ].join("\n");
    const gateway: TextChatGatewayLike = {
      async completeJson() { throw new Error("completeJson should not be called"); },
      async *streamJson(input) {
        calls.push(input);
        if (calls.length === 1) {
          yield initialRows;
          throw Object.assign(new Error("provider_output_truncated"), { code: "provider_output_truncated" });
        }
        yield "\n| 分镜2：白野避开守卫。 | 无台词。 | 守卫背后，白野潜行。 | 近景跟拍，白野避开守卫。 |";
      },
    };
    const service = createAiStoryboardPreviewService({ gateway });

    const result = await service.generatePreview({
      projectId: "40000000-0000-4000-8000-000000000001",
      scriptText: "白野潜入营地。",
      skipScriptStage: true,
      selectedStages: ["shot"],
      packages: {},
    });

    assert.equal(result.commitPayload.storyboards.length, 2);
    assert.deepEqual(calls.map((call) => call.maxTokens), [32_768, 32_768]);
    assert.match(calls[1]?.prompt ?? "", /从上一段的断点继续输出/);
    assert.match(calls[1]?.prompt ?? "", /分镜1：白野走进营地/);
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
    assert.equal(scriptPrompt.value.text, "任小野托付妹妹。");
    assert.deepEqual(await iterator.next(), { done: false, value: { type: "script_start" } });
    const firstDelta = iterator.next();
    gateway.push("任小野");

    assert.equal(await settlesWithin(firstDelta, 30), true);
    const firstDeltaResult = await firstDelta;
    assert.equal(firstDeltaResult.done, false);
    assert.equal(firstDeltaResult.value.type, "script_delta");
    assert.equal(firstDeltaResult.value.text, "任小野");

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
      assert.ok(next.value.text.length >= 1);
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
  readonly calls: Array<{ model: string; prompt: string; responseFormat?: "json_object" | "text"; maxTokens?: number }> = [];

  constructor(private readonly responses: Array<string | string[]>) {}

  async completeJson(input: { model: string; prompt: string; responseFormat?: "json_object" | "text"; maxTokens?: number }) {
    this.calls.push(input);
    const response = this.responses.shift();
    assert.ok(response, "missing fake response");
    return Array.isArray(response) ? response.join("") : response;
  }

  async *streamJson(input: { model: string; prompt: string; responseFormat?: "json_object" | "text"; maxTokens?: number }) {
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

class ControlledParallelAssetGateway implements TextChatGatewayLike {
  readonly startedStages: string[] = [];
  readonly allAssetStagesStarted: Promise<void>;
  private readonly releaseStage: Record<"scene" | "character" | "prop", () => void>;
  private readonly releasedStage: Record<"scene" | "character" | "prop", Promise<void>>;
  private resolveAllAssetStagesStarted!: () => void;
  private readonly expectedStages: Array<"scene" | "character" | "prop">;

  constructor(expectedStages: Array<"scene" | "character" | "prop"> = ["scene", "character", "prop"]) {
    this.expectedStages = expectedStages;
    this.allAssetStagesStarted = new Promise((resolve) => {
      this.resolveAllAssetStagesStarted = resolve;
    });
    const releases = ["scene", "character", "prop"].map((stage) => {
      let release!: () => void;
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      return [stage, { release, released }] as const;
    });
    const controls = Object.fromEntries(releases) as Record<
      "scene" | "character" | "prop",
      { release: () => void; released: Promise<void> }
    >;
    this.releaseStage = {
      scene: controls.scene.release,
      character: controls.character.release,
      prop: controls.prop.release,
    };
    this.releasedStage = {
      scene: controls.scene.released,
      character: controls.character.released,
      prop: controls.prop.released,
    };
  }

  async completeJson() {
    throw new Error("completeJson should not be called");
  }

  async *streamJson(input: { prompt: string }) {
    const stage = input.prompt.startsWith("SCENE")
      ? "scene"
      : input.prompt.startsWith("CHARACTER")
        ? "character"
        : input.prompt.startsWith("PROP")
          ? "prop"
          : "shot";
    this.startedStages.push(stage);
    if (this.expectedStages.every((item) => this.startedStages.includes(item))) {
      this.resolveAllAssetStagesStarted();
    }
    if (stage !== "shot") {
      await this.releasedStage[stage];
    }
    yield {
      scene: JSON.stringify({ scenes: [{ sceneName: "旧木屋" }] }),
      character: JSON.stringify({ characters: [{ characterName: "任小野" }] }),
      prop: JSON.stringify({ props: [{ propName: "饭食" }] }),
      shot: JSON.stringify({ storyboards: [{ shotNo: 1, plot: "递出饭食" }] }),
    }[stage];
  }

  release(stage: "scene" | "character" | "prop") {
    this.releaseStage[stage]();
  }
}

class FailingParallelAssetGateway implements TextChatGatewayLike {
  readonly startedStages: string[] = [];
  readonly allSiblingsAborted: Promise<void>;
  private readonly allAssetStagesStarted: Promise<void>;
  private resolveAllAssetStagesStarted!: () => void;
  private resolveAllSiblingsAborted!: () => void;
  private releaseWaiting!: () => void;
  private readonly waitingReleased: Promise<void>;
  private readonly abortedStages = new Set<string>();

  constructor() {
    this.allAssetStagesStarted = new Promise((resolve) => {
      this.resolveAllAssetStagesStarted = resolve;
    });
    this.allSiblingsAborted = new Promise((resolve) => {
      this.resolveAllSiblingsAborted = resolve;
    });
    this.waitingReleased = new Promise((resolve) => {
      this.releaseWaiting = resolve;
    });
  }

  async completeJson() {
    throw new Error("completeJson should not be called");
  }

  async *streamJson(input: { prompt: string; signal?: AbortSignal }) {
    const stage = input.prompt.startsWith("SCENE")
      ? "scene"
      : input.prompt.startsWith("CHARACTER")
        ? "character"
        : input.prompt.startsWith("PROP")
          ? "prop"
          : "shot";
    this.startedStages.push(stage);
    if (["scene", "character", "prop"].every((item) => this.startedStages.includes(item))) {
      this.resolveAllAssetStagesStarted();
    }
    if (stage === "scene") {
      await this.allAssetStagesStarted;
      throw new Error("scene failed");
    }
    if (stage === "character" || stage === "prop") {
      await Promise.race([
        this.waitingReleased,
        new Promise<void>((resolve) => {
          input.signal?.addEventListener("abort", () => {
            this.abortedStages.add(stage);
            if (this.abortedStages.has("character") && this.abortedStages.has("prop")) {
              this.resolveAllSiblingsAborted();
            }
            resolve();
          }, { once: true });
        }),
      ]);
      return;
    }
    yield JSON.stringify({ storyboards: [{ shotNo: 1, plot: "不应生成" }] });
  }

  releaseAll() {
    this.releaseWaiting();
  }
}

class CancellationObservingParallelAssetGateway implements TextChatGatewayLike {
  readonly startedStages: string[] = [];
  readonly allAssetStagesStarted: Promise<void>;
  readonly allAssetStagesAborted: Promise<void>;
  private resolveAllAssetStagesStarted!: () => void;
  private resolveAllAssetStagesAborted!: () => void;
  private readonly abortedStages = new Set<string>();

  constructor() {
    this.allAssetStagesStarted = new Promise((resolve) => {
      this.resolveAllAssetStagesStarted = resolve;
    });
    this.allAssetStagesAborted = new Promise((resolve) => {
      this.resolveAllAssetStagesAborted = resolve;
    });
  }

  async completeJson() {
    throw new Error("completeJson should not be called");
  }

  async *streamJson(input: { prompt: string; signal?: AbortSignal }) {
    const stage = input.prompt.startsWith("SCENE")
      ? "scene"
      : input.prompt.startsWith("CHARACTER")
        ? "character"
        : input.prompt.startsWith("PROP")
          ? "prop"
          : "shot";
    this.startedStages.push(stage);
    if (["scene", "character", "prop"].every((item) => this.startedStages.includes(item))) {
      this.resolveAllAssetStagesStarted();
    }
    if (stage === "shot") {
      yield JSON.stringify({ storyboards: [] });
      return;
    }
    await new Promise<void>((_resolve, reject) => {
      input.signal?.addEventListener("abort", () => {
        this.abortedStages.add(stage);
        if (["scene", "character", "prop"].every((item) => this.abortedStages.has(item))) {
          this.resolveAllAssetStagesAborted();
        }
        reject(new Error("request aborted"));
      }, { once: true });
    });
  }
}

class BackpressureAssetGateway implements TextChatGatewayLike {
  pulledChunks = 0;

  async completeJson() {
    throw new Error("completeJson should not be called");
  }

  async *streamJson() {
    this.pulledChunks += 1;
    yield '{"scenes":[';
    this.pulledChunks += 1;
    yield '{"sceneName":"旧木屋"}]}';
  }
}

class OrderedBackgroundFailureGateway implements TextChatGatewayLike {
  async completeJson() {
    throw new Error("completeJson should not be called");
  }

  async *streamJson(input: { prompt: string; signal?: AbortSignal }) {
    const stage = input.prompt.startsWith("SCENE")
      ? "scene"
      : input.prompt.startsWith("CHARACTER")
        ? "character"
        : input.prompt.startsWith("PROP")
          ? "prop"
          : "shot";
    if (stage === "scene") {
      yield '{"scenes":[';
      await Promise.resolve();
      if (input.signal?.aborted) throw new Error("scene aborted");
      yield '{"sceneName":"旧木屋"}]}';
      return;
    }
    if (stage === "character") {
      yield JSON.stringify({ characters: [{ characterName: "任小野" }] });
      return;
    }
    if (stage === "prop") {
      throw new Error("prop failed");
    }
    yield JSON.stringify({ storyboards: [{ shotNo: 1, plot: "不应生成" }] });
  }
}
