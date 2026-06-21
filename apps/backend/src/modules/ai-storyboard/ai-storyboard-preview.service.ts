import { createHash, randomUUID } from "node:crypto";

import {
  TextModelGatewayService,
  textModelGatewayOperationNames,
} from "../model-gateway/text-model-gateway.service.ts";

export const DEEPSEEK_STORYBOARD_MAX_TOKENS = 384000;

type MarkdownTableKey = "scenes" | "characters" | "props" | "storyboards";

type AiStoryboardPreviewRawMarkdown = {
  scene?: string;
  character?: string;
  prop?: string;
  shot?: string;
};

export type AiStoryboardPreviewStreamEvent =
  | { type: "script_prompt"; text: string }
  | { type: "script_start" }
  | { type: "script_delta"; text: string }
  | { type: "script_done"; text: string; rawText: string }
  | { type: "asset_prompt"; stage: AssetPromptStage; title: string; text: string }
  | { type: "asset_start"; stage: AssetPromptStage; title: string }
  | { type: "asset_delta"; stage: AssetPromptStage; title: string; text: string }
  | { type: "asset_done"; stage: AssetPromptStage; title: string; text: string }
  | { type: "complete"; preview: ReturnType<typeof normalizePreview> & { rawMarkdown?: AiStoryboardPreviewRawMarkdown } };

type AssetPromptStage = "scene" | "character" | "prop" | "shot";

export interface TextChatGatewayLike {
  completeJson(input: {
    model: string;
    prompt: string;
    projectId?: string | null;
    createdByUserId?: string | null;
    responseFormat?: "json_object" | "text";
    maxTokens?: number;
  }): Promise<string>;
  streamJson?(input: {
    model: string;
    prompt: string;
    projectId?: string | null;
    createdByUserId?: string | null;
    responseFormat?: "json_object" | "text";
    maxTokens?: number;
  }): AsyncIterable<string>;
}

export interface AiStoryboardPreviewInput {
  projectId: string;
  createdByUserId?: string | null;
  scriptText: string;
  packages: {
    genrePrompt?: string;
    emotionPrompt?: string;
    cameraPrompt?: string;
    outputPrompt?: string;
    tabooPrompt?: string;
  };
  templates?: {
    scenePrompt?: string;
    characterPrompt?: string;
    propPrompt?: string;
    shotPrompt?: string;
  };
}

export function createAiStoryboardPreviewService(deps: { gateway: TextChatGatewayLike }) {
  async function generatePreview(input: AiStoryboardPreviewInput) {
    let finalPreview: ReturnType<typeof normalizePreview> | null = null;
    for await (const event of generatePreviewStream(input)) {
      if (event.type === "complete") {
        finalPreview = event.preview;
      }
    }
    if (!finalPreview) {
      throw new Error("ai_storyboard_preview_missing");
    }
    return finalPreview;
  }

  async function* generatePreviewStream(input: AiStoryboardPreviewInput): AsyncIterable<AiStoryboardPreviewStreamEvent> {
    const scriptPrompt = buildScriptPrompt(input);
    yield { type: "script_prompt", text: scriptPrompt };
    yield { type: "script_start" };
    let scriptRaw = "";
    for await (const delta of streamJsonText({
      gateway: deps.gateway,
      model: "deepseek-chat",
      prompt: scriptPrompt,
      projectId: input.projectId,
      createdByUserId: input.createdByUserId,
      responseFormat: "json_object",
      maxTokens: DEEPSEEK_STORYBOARD_MAX_TOKENS,
    })) {
      scriptRaw += delta;
      yield { type: "script_delta", text: delta };
    }
    const scriptText = resolveGeneratedScriptText(scriptRaw);
    yield { type: "script_done", text: scriptText, rawText: scriptRaw };
    if (!scriptText.trim()) {
      throw new Error("ai_storyboard_script_empty");
    }

    const sceneRaw = yield* runAssetPromptStage("scene", "场景提示词生成", buildScenePrompt(scriptText, input), input);
    const characterRaw = yield* runAssetPromptStage("character", "角色提示词生成", buildCharacterPrompt(scriptText, input), input);
    const propRaw = yield* runAssetPromptStage("prop", "道具提示词生成", buildPropPrompt(scriptText, input), input);
    const shotRaw = yield* runAssetPromptStage("shot", "分镜提示词生成", buildShotPrompt(scriptText, input), input);

    yield { type: "complete", preview: {
      ...normalizePreview(scriptText, {
        scenes: parseArrayOrObject(sceneRaw, "scenes"),
        characters: parseArrayOrObject(characterRaw, "characters"),
        props: parseArrayOrObject(propRaw, "props"),
        ...parseStoryboardPromptResult(shotRaw),
      }),
      rawMarkdown: {
        scene: sceneRaw,
        character: characterRaw,
        prop: propRaw,
        shot: shotRaw,
      },
    } };
  }

  async function* runAssetPromptStage(
    stage: AssetPromptStage,
    title: string,
    prompt: string,
    input: AiStoryboardPreviewInput,
  ): AsyncIterable<AiStoryboardPreviewStreamEvent> {
    yield { type: "asset_prompt", stage, title, text: prompt };
    yield { type: "asset_start", stage, title };
    let raw = "";
    for await (const delta of streamJsonText({
      gateway: deps.gateway,
      model: "deepseek-chat",
      prompt,
      projectId: input.projectId,
      createdByUserId: input.createdByUserId,
      responseFormat: "text",
      maxTokens: DEEPSEEK_STORYBOARD_MAX_TOKENS,
    })) {
      raw += delta;
      yield { type: "asset_delta", stage, title, text: delta };
    }
    yield { type: "asset_done", stage, title, text: raw };
    return raw;
  }

  return { generatePreview, generatePreviewStream };
}

export function createTextModelChatGateway(deps: {
  gateway: TextModelGatewayService;
  organizationId: string;
  workspaceId: string;
}) {
  async function createStream(input: {
    model: string;
    prompt: string;
    projectId?: string | null;
    createdByUserId?: string | null;
    responseFormat?: "json_object" | "text";
    maxTokens?: number;
  }) {
    const payloadHash = sha256(input.prompt);
    const requestKey = `ai-storyboard:${input.projectId ?? "none"}:${randomUUID()}`;
    const requestBody = {
      model: input.model,
      stream: true,
      temperature: 0.2,
      max_tokens: input.maxTokens ?? DEEPSEEK_STORYBOARD_MAX_TOKENS,
      messages: [
        {
          role: "user",
          content: input.prompt,
        },
      ],
      ...(input.responseFormat === "json_object" ? { response_format: { type: "json_object" as const } } : {}),
    };
    return deps.gateway.chat.completions.create(
      requestBody,
      {
        organizationId: deps.organizationId,
        workspaceId: deps.workspaceId,
        projectId: input.projectId ?? null,
        createdByUserId: input.createdByUserId ?? null,
        requestKey,
        requestHash: payloadHash,
        payloadHash,
        payloadSummary: "ai storyboard preview text generation",
        providerOperation: textModelGatewayOperationNames.chatCompletions,
      },
    );
  }

  return {
    async completeJson(input) {
      let content = "";
      for await (const delta of this.streamJson(input)) {
        content += delta;
      }
      return content;
    },

    async *streamJson(input) {
      const streamResult = await createStream(input);
      for await (const chunk of streamResult.stream) {
        for (const choice of chunk.choices ?? []) {
          const delta = choice.delta?.content;
          if (typeof delta === "string" && delta) {
            yield delta;
          }
        }
      }
      await streamResult.completed;
    },
  } satisfies TextChatGatewayLike;
}

async function* streamJsonText(input: {
  gateway: TextChatGatewayLike;
  model: string;
  prompt: string;
  projectId?: string | null;
  createdByUserId?: string | null;
  responseFormat?: "json_object" | "text";
  maxTokens?: number;
}) {
  if (input.gateway.streamJson) {
    for await (const delta of input.gateway.streamJson({
      model: input.model,
      prompt: input.prompt,
      projectId: input.projectId,
      createdByUserId: input.createdByUserId,
      responseFormat: input.responseFormat,
      maxTokens: input.maxTokens,
    })) {
      yield* splitTextForLiveEcho(delta);
    }
    return;
  }
  yield* splitTextForLiveEcho(await input.gateway.completeJson({
    model: input.model,
    prompt: input.prompt,
    projectId: input.projectId,
    createdByUserId: input.createdByUserId,
    responseFormat: input.responseFormat,
    maxTokens: input.maxTokens,
  }));
}

function* splitTextForLiveEcho(text: string) {
  for (const char of text) {
    yield char;
  }
}

function buildScriptPrompt(input: AiStoryboardPreviewInput) {
  return [
    "请把小说原文改写为可继续生成分镜的纯文本剧本。",
    "请只返回一个 JSON 对象，不要 Markdown，不要代码块，不要额外解释。",
    "JSON 对象必须包含 `scriptText` 字段，值为改写后的完整剧本文字。",
    "如需补充分段，可额外返回 `scriptBeats` 数组，但 `scriptText` 仍必须完整可读，方便系统后续继续生成角色、场景、道具和分镜提示词。",
    "剧本要保留完整剧情推进、对白、旁白、动作和情绪变化，方便下一步生成场景、人物、道具和分镜词。",
    "以下【改写要求】必须作为上方任务说明的一部分执行，再读取【小说原文】进行改写。",
    "",
    "[改写要求]",
    "",
    "题材看点：",
    input.packages.genrePrompt || "",
    "",
    "情绪看点：",
    input.packages.emotionPrompt || "",
    "",
    "通用禁忌：",
    input.packages.tabooPrompt || "",
    "",
    "[小说原文]",
    input.scriptText,
  ].join("\n");
}

function buildScenePrompt(scriptText: string, input: AiStoryboardPreviewInput) {
  return buildAssetStagePrompt("scene", input.templates?.scenePrompt || "", scriptText);
}

function buildCharacterPrompt(scriptText: string, input: AiStoryboardPreviewInput) {
  return buildAssetStagePrompt("character", input.templates?.characterPrompt || "", scriptText);
}

function buildPropPrompt(scriptText: string, input: AiStoryboardPreviewInput) {
  return buildAssetStagePrompt("prop", input.templates?.propPrompt || "", scriptText);
}

function buildShotPrompt(scriptText: string, input: AiStoryboardPreviewInput) {
  return buildAssetStagePrompt("shot", input.templates?.shotPrompt || "", scriptText);
}

function buildAssetStagePrompt(stage: AssetPromptStage, template: string, scriptText: string) {
  const rendered = renderPromptTemplate(template, scriptText).trim();
  const basePrompt = rendered || `【剧本】\n${scriptText}`;
  return [basePrompt, buildAssetStageMarkdownContract(stage)].filter(Boolean).join("\n\n");
}

function buildAssetStageMarkdownContract(stage: AssetPromptStage) {
  const config = {
    scene: {
      heading: "【剧本场景列表】",
      columns: "| 场景名称 | 场景描述 | 场景图片提示词 |",
    },
    character: {
      heading: "【剧本角色列表】",
      columns: "| 角色名称 | 角色描述 | 角色图片提示词 |",
    },
    prop: {
      heading: "【剧本道具列表】",
      columns: "| 道具名称 | 道具描述 | 道具图片提示词 |",
    },
    shot: {
      heading: "【剧本分镜列表】",
      columns: "| 镜号 | 分镜剧情 | 对话/旁白 | 静态图片提示词 | 动态视频提示词 |",
    },
  } satisfies Record<AssetPromptStage, { heading: string; columns: string }>;
  const selected = config[stage];
  return [
    "【返回协议】",
    "请严格使用 Markdown 返回，并且只返回一个 ```markdown 代码块，不要 JSON，不要额外解释。",
    `代码块内先输出标题 ${selected.heading}。`,
    "随后紧接一个 Markdown 表格，列顺序固定如下：",
    selected.columns,
    stage === "shot"
      ? "| --- | --- | --- | --- | --- |"
      : "| --- | --- | --- |",
    "表格每一行都必须可直接交给前端展示和解析，不要输出多余段落。",
  ].join("\n");
}

function normalizePreview(scriptText: string, promptResult: Record<string, unknown>) {
  const scenes = arrayOfRecords(promptResult.scenes).map(normalizeSceneRecord);
  const characters = arrayOfRecords(promptResult.characters).map(normalizeCharacterRecord);
  const props = arrayOfRecords(promptResult.props).map(normalizePropRecord);
  const segmentStoryboards = normalizeSegmentStoryboardRecords(promptResult);
  const chapterStoryboards = normalizeChapterStoryboardRecords(promptResult);
  const storyboards = withStoryboardAssetReferences(
    (chapterStoryboards.length ? chapterStoryboards : segmentStoryboards.length ? segmentStoryboards : arrayOfRecords(promptResult.storyboards)).map(normalizeStoryboardRecord),
    {
    scenes,
    characters,
    props,
    },
  );
  const chapterStoryboardRows = segmentStoryboards.length ? buildChapterStoryboardRows(promptResult) : null;

  return {
    scriptText,
    displayTables: {
      script: {
        title: "剧本",
        columns: ["剧本文字"],
        rows: [{ beatNo: 1, scriptContent: scriptText, characters: "", sceneHint: "", propHints: "", dialogue: "" }],
      },
      scenes: {
        title: "场景",
        columns: ["场景名称", "场景描述", "场景图片提示词"],
        rows: scenes.map((scene) => ({
          sceneName: text(scene.sceneName || scene.name),
          sceneDescription: buildAssetDisplayDescription(scene, [
            "sceneDescription",
            "description",
            "summary",
            "environment",
            "weather",
            "天气",
            "time",
            "timeOfDay",
            "时间",
            "空间结构",
            "spaceStructure",
            "architecturalStyle",
            "buildingStyle",
            "建筑风格",
            "buildingDetails",
            "建筑细节",
            "lighting",
            "lightingRules",
            "光影规则",
            "atmosphere",
            "氛围基调",
            "keyProps",
            "关键道具",
            "sceneImagePrompt",
            "imagePrompt",
          ]),
          sceneImagePrompt: text(scene.sceneImagePrompt || scene.imagePrompt),
        })),
      },
      characters: {
        title: "角色",
        columns: ["角色名称", "角色描述", "角色图片提示词"],
        rows: characters.map((character) => ({
          characterName: text(character.characterName || character.name),
          characterDescription: buildAssetDisplayDescription(character, [
            "characterDescription",
            "description",
            "appearance",
            "summary",
            "age",
            "年龄",
            "nationality",
            "国籍",
            "gender",
            "性别",
            "costume",
            "clothing",
            "服装",
            "face",
            "facialFeatures",
            "脸部特征",
            "detailFeatures",
            "细节特征",
            "bodyFeatures",
            "personality",
            "characterImagePrompt",
            "imagePrompt",
          ]),
          characterImagePrompt: text(character.characterImagePrompt || character.imagePrompt),
        })),
      },
      props: {
        title: "道具",
        columns: ["道具名称", "道具描述", "道具图片提示词"],
        rows: props.map((prop) => ({
          propName: text(prop.propName || prop.name),
          propDescription: buildAssetDisplayDescription(prop, [
            "propDescription",
            "description",
            "summary",
            "usage",
            "用途",
            "appearance",
            "外观",
            "color",
            "颜色",
            "material",
            "材质",
            "size",
            "尺寸",
            "state",
            "状态",
            "ownerOrUser",
            "所属角色",
            "firstAppearance",
            "首次出现",
            "consistency",
            "一致性约束",
            "propImagePrompt",
            "imagePrompt",
          ]),
          propImagePrompt: text(prop.propImagePrompt || prop.imagePrompt),
        })),
      },
      storyboards: {
        title: chapterStoryboardRows ? "本章分镜" : "分镜",
        columns: chapterStoryboardRows
          ? ["分镜剧情", "对话/旁白", "静态图片提示词", "动态视频提示词"]
          : ["镜号", "分镜剧情", "对话/旁白", "时长", "时间段", "转场", "景别/运镜", "静态图片提示词", "动态视频提示词（多镜头序列，每一分镜镜头总时长≤15s）", "分镜详细字段"],
        rows: chapterStoryboardRows ?? storyboards.map((storyboard) => ({
          shotNo: storyboard.shotNo,
          plot: text(storyboard.plot),
          dialogue: text(storyboard.dialogue),
          durationSec: storyboard.durationSec,
          timeRange: text(storyboard.timeRange),
          transition: text(storyboard.transition),
          shotDirection: buildShotDirection(storyboard),
          imagePrompt: text(storyboard.imagePrompt),
          videoPrompt: text(storyboard.videoPrompt),
          shotDetails: buildStoryboardDetails(storyboard),
          assetReferenceText: text(storyboard.assetReferenceText),
        })),
      },
    },
    commitPayload: {
      scriptText,
      scenes,
      characters,
      props,
      storyboards,
    },
  };
}

function buildShotDirection(storyboard: Record<string, unknown>) {
  return [text(storyboard.shotSize), text(storyboard.cameraMovement)].filter(Boolean).join("/");
}

function buildStoryboardDetails(storyboard: Record<string, unknown>) {
  return [
    ["画面描述", storyboard.visualDescription],
    ["核心动作", storyboard.coreAction],
    ["对手戏设计", storyboard.interactionDesign],
    ["人物底层逻辑", storyboard.characterLogic],
    ["主体动作", storyboard.subjectAction],
    ["音效", storyboard.soundEffect],
    ["配乐", storyboard.bgm],
    ["场景", storyboard.sceneName || storyboard.sceneId],
    ["角色", storyboard.characterNames || storyboard.characterIds],
    ["道具", storyboard.props],
  ]
    .map(([label, value]) => {
      const normalized = text(value);
      return normalized ? `${label}: ${normalized}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function normalizeSceneRecord(scene: Record<string, unknown>) {
  return {
    ...scene,
    sceneId: firstText(scene, ["sceneId", "scene_id", "id"]),
    sceneName: firstText(scene, ["sceneName", "scene_name", "name", "location_name", "locationName", "scene"]),
    rawSceneDescription: firstText(scene, ["sceneDescription", "scene_description", "description", "summary", "environment"]),
    sceneDescription: buildSceneDisplayDescription(scene),
    sceneImagePrompt: firstText(scene, ["sceneImagePrompt", "scene_image_prompt", "imagePrompt", "image_prompt", "prompt"]),
  };
}

function normalizeCharacterRecord(character: Record<string, unknown>) {
  return {
    ...character,
    characterId: firstText(character, ["characterId", "character_id", "id"]),
    characterName: firstText(character, ["characterName", "character_name", "name", "role", "character"]),
    rawCharacterDescription: firstText(character, ["characterDescription", "character_description", "description", "appearance", "summary"]),
    characterDescription: buildCharacterDisplayDescription(character),
    characterImagePrompt: firstText(character, ["characterImagePrompt", "character_image_prompt", "imagePrompt", "image_prompt", "prompt"]),
  };
}

function normalizePropRecord(prop: Record<string, unknown>) {
  return {
    ...prop,
    propId: firstText(prop, ["propId", "prop_id", "id"]),
    propName: firstText(prop, ["propName", "prop_name", "name", "prop"]),
    rawPropDescription: firstText(prop, ["propDescription", "prop_description", "description", "summary", "usage"]),
    propDescription: buildPropDisplayDescription(prop),
    propImagePrompt: firstText(prop, ["propImagePrompt", "prop_image_prompt", "imagePrompt", "image_prompt", "prompt"]),
  };
}

function buildSceneDisplayDescription(scene: Record<string, unknown>) {
  return buildAssetDisplayDescription(scene, [
    "sceneDescription",
    "scene_description",
    "description",
    "summary",
    "environment",
    "weather",
    "time",
    "timeOfDay",
    "spaceStructure",
    "architecturalStyle",
    "buildingStyle",
    "buildingDetails",
    "lighting",
    "lightingRules",
    "atmosphere",
    "keyProps",
    "sceneImagePrompt",
    "scene_image_prompt",
    "imagePrompt",
    "image_prompt",
    "prompt",
  ]);
}

function buildCharacterDisplayDescription(character: Record<string, unknown>) {
  return buildAssetDisplayDescription(character, [
    "characterDescription",
    "character_description",
    "description",
    "appearance",
    "summary",
    "age",
    "nationality",
    "gender",
    "costume",
    "clothing",
    "face",
    "facialFeatures",
    "detailFeatures",
    "bodyFeatures",
    "personality",
    "characterImagePrompt",
    "character_image_prompt",
    "imagePrompt",
    "image_prompt",
    "prompt",
  ]);
}

function buildPropDisplayDescription(prop: Record<string, unknown>) {
  return buildAssetDisplayDescription(prop, [
    "propDescription",
    "prop_description",
    "description",
    "summary",
    "usage",
    "appearance",
    "color",
    "material",
    "size",
    "state",
    "ownerOrUser",
    "firstAppearance",
    "consistency",
    "propImagePrompt",
    "prop_image_prompt",
    "imagePrompt",
    "image_prompt",
    "prompt",
  ]);
}

function normalizeSegmentStoryboardRecords(promptResult: Record<string, unknown>) {
  return arrayOfRecords(promptResult.segments).flatMap((segment, segmentIndex) => {
    const shots = arrayOfRecords(segment.shots);
    return shots.map((shot, shotIndex) => ({
      ...shot,
      segmentId: segment.segment_id ?? segment.segmentId ?? segmentIndex + 1,
      chapterPlot: buildChapterPlotText(segment, segmentIndex),
      chapterDialogue: buildChapterDialogueText(shots),
      chapterImagePrompt: buildChapterImagePromptText(segment),
      chapterVideoPrompt: buildChapterVideoPromptText(segment, segmentIndex),
      shotNo: shot.shot_id ?? shot.shotId ?? shot.shotNo ?? shotIndex + 1,
      plot: text(shot.description),
      dialogue: firstText(shot, ["dialogue_or_os", "dialogueOrOs", "dialogue", "narration"]),
      timeRange: shot.time_range ?? shot.timeRange,
      transition: shot.transition,
      shotSize: shot.shot_type ?? shot.shotType ?? shot.shotSize,
      coreAction: shot.core_action ?? shot.coreAction,
      interactionDesign: shot.opponent_design ?? shot.opponentDesign,
      characterLogic: shot.character_logic ?? shot.characterLogic,
      subjectAction: shot.subject_action ?? shot.subjectAction,
      soundEffect: shot.sound_effects ?? shot.soundEffect,
      sceneName: firstText(objectRecord(segment.scene_analysis), ["scene_name", "sceneName"]),
      segment,
    }));
  });
}

function normalizeChapterStoryboardRecords(promptResult: Record<string, unknown>) {
  return arrayOfRecords(promptResult.segments).map((segment, segmentIndex) => {
    const imagePrompt = buildChapterImagePromptText(segment);
    const videoPrompt = buildChapterVideoPromptText(segment, segmentIndex);
    return {
      segmentId: segment.segment_id ?? segment.segmentId ?? segmentIndex + 1,
      shotNo: segmentIndex + 1,
      plot: buildChapterPlotText(segment, segmentIndex),
      dialogue: buildChapterDialogueText(arrayOfRecords(segment.shots)),
      imagePrompt,
      videoPrompt,
      chapterImagePrompt: imagePrompt,
      chapterVideoPrompt: videoPrompt,
      segment,
    };
  });
}

function buildChapterStoryboardRows(promptResult: Record<string, unknown>) {
  return arrayOfRecords(promptResult.segments).map((segment, segmentIndex) => {
    const shots = arrayOfRecords(segment.shots);
    return {
      plot: buildChapterPlotText(segment, segmentIndex),
      dialogue: buildChapterDialogueText(shots),
      imagePrompt: buildChapterImagePromptText(segment),
      videoPrompt: buildChapterVideoPromptText(segment, segmentIndex),
    };
  });
}

function buildChapterPlotText(segment: Record<string, unknown>, segmentIndex: number) {
  return buildChapterSceneAnalysisBlock(segment, segmentIndex);
}

function buildChapterDialogueText(shots: Record<string, unknown>[]) {
  return compactLines(shots.map((shot, index) => {
    const dialogue = firstText(shot, ["dialogue_or_os", "dialogueOrOs", "dialogue", "narration"]);
    const subjectAction = firstText(shot, ["subject_action", "subjectAction"]);
    return compactLines([
      dialogue ? `镜头${resolveShotLabel(shot, index)}: ${dialogue}` : "",
      subjectAction ? `主体动作: ${subjectAction}` : "",
    ]).join("\n");
  })).join("\n");
}

function buildChapterImagePromptText(segment: Record<string, unknown>) {
  return buildStoryboardAssetTableSection(objectRecord(segment.asset_table));
}

function buildChapterVideoPromptText(segment: Record<string, unknown>, segmentIndex: number) {
  const shots = arrayOfRecords(segment.shots);
  return compactLines([
    buildChapterSceneAnalysisBlock(segment, segmentIndex),
    "【镜头列表】",
    ...shots.map((shot, index) => buildChapterShotText(shot, index)),
    "【资产对照表】",
    buildStoryboardAssetTableSection(objectRecord(segment.asset_table)),
  ]).join("\n");
}

function buildChapterShotText(shot: Record<string, unknown>, index: number) {
  const label = resolveShotLabel(shot, index);
  return compactLines([
    `【镜头${label}】${formatSegmentTimeRange(firstText(shot, ["time_range", "timeRange", "time"]))} 转场: ${firstText(shot, ["transition"]) || "无"} 镜头类型: ${buildChapterShotCameraText(shot) || "未注明"} 画面描述:`,
    firstText(shot, ["description", "plot", "story"]) || "无",
    `核心动作: ${firstText(shot, ["core_action", "coreAction"]) || "无"}`,
    `对手戏设计: ${firstText(shot, ["opponent_design", "opponentDesign", "interactionDesign"]) || "无"}`,
    `人物底层逻辑: ${firstText(shot, ["character_logic", "characterLogic"]) || "无"}`,
    "主体动作与台词:",
    buildShotActionDialogueText({
      subjectAction: firstText(shot, ["subject_action", "subjectAction"]),
      dialogue: firstText(shot, ["dialogue_or_os", "dialogueOrOs", "dialogue", "narration"]),
    }),
    `音效: ${buildSoundEffectLine({
      soundEffect: firstText(shot, ["sound_effects", "soundEffect", "sound_effect"]),
      bgm: firstText(shot, ["bgm", "music", "backgroundMusic", "background_music"]),
    })}`,
  ]).join("\n");
}

function buildChapterSceneAnalysisBlock(segment: Record<string, unknown>, segmentIndex: number) {
  const sceneAnalysis = objectRecord(segment.scene_analysis);
  return compactLines([
    `【分镜${resolveSegmentLabel(segment, segmentIndex)}】`,
    "【场景分析】",
    `场景名称：${resolveSegmentSceneName(segment, segmentIndex)}`,
    `承接：${resolveSegmentContinuityText(segment, segmentIndex)}`,
    `过渡：${resolveSegmentTransitionType(segment)}`,
    `情绪意图：${firstText(sceneAnalysis, ["情绪意图", "emotion_intent", "emotionIntent"]) || "无"}`,
    `人物表演底层逻辑总纲：${firstText(sceneAnalysis, ["人物表演底层逻辑总纲", "performance_logic", "performanceLogic"]) || "无"}`,
  ]).join("\n");
}

function resolveSegmentLabel(segment: Record<string, unknown>, segmentIndex: number) {
  return text(segment.segment_id ?? segment.segmentId ?? segmentIndex + 1).trim() || `${segmentIndex + 1}`;
}

function resolveSegmentSceneName(segment: Record<string, unknown>, segmentIndex: number) {
  return firstText(objectRecord(segment.scene_analysis), ["scene_name", "sceneName", "场景名称"])
    || `第${segmentIndex + 1}分镜`;
}

function resolveSegmentContinuityText(segment: Record<string, unknown>, segmentIndex: number) {
  const sceneAnalysis = objectRecord(segment.scene_analysis);
  const direct = firstText(sceneAnalysis, ["承接", "continuity", "continuity_from_previous"]);
  if (direct) {
    return direct;
  }
  const transition = objectRecord(segment.segment_transition);
  const transitionLines = compactLines([
    firstText(transition, ["承接", "continuity", "continuity_from_previous"]),
    firstText(transition, ["承接逻辑", "continuity_logic", "continuityLogic"]),
    buildPreviousCurrentFrameText(transition),
  ]);
  if (transitionLines.length) {
    return transitionLines.join("；");
  }
  return segmentIndex === 0 ? "无" : "延续上一分镜动作与情绪";
}

function buildPreviousCurrentFrameText(transition: Record<string, unknown>) {
  const previous = firstText(transition, ["前一分镜末尾画面", "previous_last_frame", "previousLastFrame"]);
  const current = firstText(transition, ["本分镜开场画面", "current_opening_frame", "currentOpeningFrame"]);
  if (!previous && !current) {
    return "";
  }
  if (previous && current) {
    return `由“${previous}”过渡到“${current}”`;
  }
  return previous ? `承接上一分镜画面：${previous}` : `本分镜开场画面：${current}`;
}

function resolveSegmentTransitionType(segment: Record<string, unknown>) {
  return firstText(objectRecord(segment.scene_analysis), ["过渡", "transition"])
    || firstText(objectRecord(segment.segment_transition), ["过渡", "transition", "transition_type", "transitionType"])
    || "硬切";
}

function formatSegmentTimeRange(value: string) {
  const raw = text(value).trim();
  const match = raw.match(/(\d+(?:\.\d+)?)\s*(?:秒|s)?\s*[-~—–至到]\s*(\d+(?:\.\d+)?)\s*(?:秒|s)?/i);
  if (!match) {
    return raw;
  }
  return `${Number(match[1]).toFixed(1)}-${Number(match[2]).toFixed(1)}秒`;
}

function buildChapterShotCameraText(shot: Record<string, unknown>) {
  return [
    firstText(shot, ["shot_type", "shotType", "shotSize"]),
    firstText(shot, ["camera_angle", "cameraAngle"]),
    firstText(shot, ["camera_movement", "cameraMovement", "movement"]),
  ].filter(Boolean).join("/");
}

function buildTransitionLine(value: unknown) {
  const transition = recordLines(value, [
    ["前一分镜末尾画面", ["前一分镜末尾画面", "previous_last_frame", "previousLastFrame"]],
    ["本分镜开场画面", ["本分镜开场画面", "current_opening_frame", "currentOpeningFrame"]],
    ["承接逻辑", ["承接逻辑", "continuity_logic", "continuityLogic"]],
  ]);
  return transition ? `分镜承接：${transition}` : "";
}

function recordLines(value: unknown, entries: Array<[string, string[]]>) {
  const record = objectRecord(value);
  return compactLines(entries.map(([label, keys]) => {
    const resolved = firstText(record, keys);
    return resolved ? `${label}: ${resolved}` : "";
  })).join("；");
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function resolveShotLabel(shot: Record<string, unknown>, index: number) {
  return text(shot.shot_id ?? shot.shotId ?? shot.shotNo ?? index + 1);
}

function compactLines(lines: string[]) {
  return lines.map((line) => text(line).trim()).filter(Boolean);
}

function normalizeStoryboardRecord(storyboard: Record<string, unknown>) {
  const plot = firstText(storyboard, ["plot", "action", "story", "summary", "description", "scene", "\u753b\u9762", "\u52a8\u4f5c"]);
  const dialogue = firstText(storyboard, ["dialogue", "dialog", "lines", "voiceover", "voice_over", "narration", "\u53f0\u8bcd", "\u65c1\u767d"]);
  const imagePrompt = firstText(storyboard, ["imagePrompt", "image_prompt", "prompt", "visualPrompt", "visual_prompt", "visual_focus"]);
  const timeRange = firstText(storyboard, ["timeRange", "time_range", "time", "timestamp", "timeline", "\u65f6\u95f4", "\u65f6\u95f4\u8303\u56f4"]);
  const transition = firstText(storyboard, ["transition", "cut", "sceneTransition", "scene_transition", "\u8f6c\u573a"]);
  const shotSize = firstText(storyboard, ["shotSize", "shot_size", "shot", "frameSize", "frame_size", "cameraShot", "camera_shot", "\u666f\u522b", "\u955c\u5934"]);
  const cameraMovement = firstText(storyboard, [
    "cameraMovement",
    "camera_movement",
    "cameraMove",
    "camera_move",
    "movement",
    "motion",
    "lensMovement",
    "lens_movement",
    "cameraPrompt",
    "camera_prompt",
    "\u8fd0\u955c",
    "\u955c\u5934\u8fd0\u52a8",
  ]);
  const visualDescription = firstText(storyboard, ["visualDescription", "visual_description", "pictureDescription", "picture_description", "frameDescription", "frame_description", "\u753b\u9762\u63cf\u8ff0", "\u753b\u9762"]);
  const coreAction = firstText(storyboard, ["coreAction", "core_action", "keyAction", "key_action", "\u6838\u5fc3\u52a8\u4f5c"]);
  const interactionDesign = firstText(storyboard, ["interactionDesign", "interaction_design", "opponentDesign", "opponent_design", "counterpartDesign", "counterpart_design", "\u5bf9\u624b\u620f\u8bbe\u8ba1", "\u5bf9\u624b\u8bbe\u8ba1"]);
  const characterLogic = firstText(storyboard, ["characterLogic", "character_logic", "performanceLogic", "performance_logic", "motivation", "\u4eba\u7269\u5e95\u5c42\u903b\u8f91", "\u4eba\u7269\u8868\u6f14\u5e95\u5c42\u903b\u8f91"]);
  const subjectAction = firstText(storyboard, ["subjectAction", "subject_action", "mainAction", "main_action", "\u4e3b\u4f53\u52a8\u4f5c"]);
  const soundEffect = firstText(storyboard, ["soundEffect", "sound_effect", "sfx", "sound", "audio", "\u97f3\u6548", "\u58f0\u97f3"]);
  const bgm = firstText(storyboard, ["bgm", "music", "backgroundMusic", "background_music", "\u914d\u4e50", "\u80cc\u666f\u97f3\u4e50"]);
  const baseVideoPrompt = firstText(storyboard, ["videoPrompt", "video_prompt", "video_prompt_text", "motionPrompt", "motion_prompt", "\u89c6\u9891\u63d0\u793a\u8bcd", "\u52a8\u6001\u89c6\u9891\u63d0\u793a\u8bcd"]);
  const durationSec = readDurationSec(storyboard.durationSec ?? storyboard.duration_sec ?? storyboard.duration, timeRange);
  const perShotTimeRange = normalizePerShotTimeRange(timeRange, durationSec);
  const videoPrompt = buildVideoPromptFromStoryboard({
    shotNo: text(storyboard.shotNo ?? storyboard.shot_no ?? storyboard.index ?? storyboard.no ?? storyboard["\u955c\u53f7"]).trim() || "1",
    shotLabel: text(storyboard.shotNo ?? storyboard.shot_no ?? storyboard.index ?? storyboard.no ?? storyboard["\u955c\u53f7"]).trim() || "1",
    baseVideoPrompt: sanitizePerShotVideoPrompt(baseVideoPrompt),
    timeRange: perShotTimeRange,
    transition,
    shotSize,
    cameraMovement,
    scene: firstText(storyboard, ["scene", "sceneName", "scene_name"]),
    continuity: firstText(storyboard, ["continuity", "continuity_from_previous", "承接"]),
    action: firstText(storyboard, ["action"]),
    emotion: firstText(storyboard, ["emotion"]),
    visualFocus: firstText(storyboard, ["visual_focus", "visualFocus"]),
    description: firstText(storyboard, ["description"]),
    prompt: firstText(storyboard, ["prompt"]),
    visualDescription,
    coreAction,
    interactionDesign,
    characterLogic,
    subjectAction,
    dialogue,
    soundEffect,
    bgm,
  });

  return {
    ...storyboard,
    shotNo: Number(storyboard.shotNo ?? storyboard.shot_no ?? storyboard.index ?? storyboard.no ?? storyboard["\u955c\u53f7"] ?? 0) || storyboard.shotNo || storyboard.shot_no || storyboard["\u955c\u53f7"],
    plot,
    dialogue,
    imagePrompt,
    videoPrompt,
    durationSec,
    timeRange: perShotTimeRange,
    originalTimeRange: timeRange,
    transition,
    shotSize,
    cameraMovement,
    visualDescription,
    coreAction,
    interactionDesign,
    characterLogic,
    subjectAction,
    soundEffect,
    bgm,
    sceneId: storyboard.sceneId ?? storyboard.scene_id ?? storyboard.sceneName ?? storyboard.scene_name ?? storyboard.scene,
    sceneName: storyboard.sceneName ?? storyboard.scene_name ?? storyboard.scene,
    characterIds: storyboard.characterIds ?? storyboard.character_ids ?? storyboard.characters ?? storyboard.characterNames ?? storyboard.character_names,
    characterNames: storyboard.characterNames ?? storyboard.character_names ?? storyboard.characters,
    props: storyboard.props ?? storyboard.propIds ?? storyboard.prop_ids ?? storyboard.propNames ?? storyboard.prop_names,
  };
}

function buildAssetDisplayDescription(record: Record<string, unknown>, keys: string[]) {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const value = text(record[key]).trim();
    if (!value) {
      continue;
    }
    for (const line of value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
      if (seen.has(line)) {
        continue;
      }
      seen.add(line);
      lines.push(line);
    }
  }
  return lines.join("\n");
}

function buildVideoPromptFromStoryboard(parts: Record<string, string>) {
  return compactLines([
    `【分镜${parts.shotNo || "1"}】`,
    "【场景分析】",
    `场景名称：${parts.scene || "未注明"}`,
    `承接：${parts.continuity || "无"}`,
    `过渡：${parts.transition || "无"}`,
    `情绪意图：${parts.emotion || "无"}`,
    `人物表演底层逻辑总纲：${parts.characterLogic || parts.emotion || "无"}`,
    "【镜头列表】",
    `【镜头${parts.shotLabel || parts.shotNo || "1"}】${parts.timeRange || ""} 转场: ${parts.transition || "无"} 镜头类型: ${[parts.shotSize, parts.cameraMovement].filter(Boolean).join("/") || "未注明"} 画面描述:`,
    parts.visualDescription || parts.description || parts.visualFocus || parts.prompt || parts.baseVideoPrompt || "无",
    `核心动作: ${parts.coreAction || parts.action || "无"}`,
    `对手戏设计: ${parts.interactionDesign || "无"}`,
    `人物底层逻辑: ${parts.characterLogic || parts.emotion || "无"}`,
    "主体动作与台词:",
    buildShotActionDialogueText({
      subjectAction: parts.subjectAction,
      dialogue: parts.dialogue,
    }),
    `音效: ${buildSoundEffectLine({ soundEffect: parts.soundEffect, bgm: parts.bgm })}`,
  ]).join("\n");
}

function sanitizePerShotVideoPrompt(prompt: string) {
  if (!prompt.trim()) {
    return "";
  }
  return prompt.trim();
}

function normalizePerShotTimeRange(timeRange: string, durationSec: unknown) {
  const duration = Number(durationSec ?? 0);
  if (Number.isFinite(duration) && duration > 0) {
    return `0-${Math.min(duration, 15)}秒`;
  }
  const parsed = parseTimeRange(timeRange);
  if (!parsed) {
    return timeRange;
  }
  const durationFromRange = Math.round((parsed.end - parsed.start) * 100) / 100;
  if (durationFromRange > 0) {
    return `0-${Math.min(durationFromRange, 15)}秒`;
  }
  return timeRange;
}

function hasOutOfBoundsTimeline(value: string) {
  for (const range of findTimeRanges(value)) {
    if (range.end > 15 || range.end - range.start > 15) {
      return true;
    }
  }
  return false;
}

function readDurationSec(value: unknown, timeRange: string) {
  const direct = Number(value ?? 0);
  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }
  const parsed = parseTimeRange(timeRange);
  if (parsed) {
    return Math.round((parsed.end - parsed.start) * 100) / 100;
  }
  const singleMatch = timeRange.match(/(\d+(?:\.\d+)?)/);
  if (singleMatch) {
    const seconds = Number(singleMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds;
    }
  }
  return value;
}

function parseTimeRange(value: string) {
  return findTimeRanges(value)[0] ?? null;
}

function findTimeRanges(value: string) {
  const ranges: Array<{ start: number; end: number }> = [];
  const pattern = /(\d+(?:\.\d+)?)\s*(?:秒|s)?\s*[-~～—–至到]\s*(\d+(?:\.\d+)?)\s*(?:秒|s)?/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      ranges.push({ start, end });
    }
  }
  return ranges;
}

function withStoryboardAssetReferences(
  storyboards: Record<string, unknown>[],
  assets: {
    scenes: Record<string, unknown>[];
    characters: Record<string, unknown>[];
    props: Record<string, unknown>[];
  },
) {
  const sceneIndex = assetIndex(assets.scenes, ["sceneId", "id", "sceneName", "name"]);
  const characterIndex = assetIndex(assets.characters, ["characterId", "id", "characterName", "name"]);
  const propIndex = assetIndex(assets.props, ["propId", "id", "propName", "name"]);

  return storyboards.map((storyboard) => {
    const assetReferenceText = buildStoryboardAssetReferenceText(storyboard, {
      sceneIndex,
      characterIndex,
      propIndex,
    });
    if (!assetReferenceText) {
      return storyboard;
    }
    return {
      ...storyboard,
      videoPrompt: appendAssetReferenceText(text(storyboard.videoPrompt), assetReferenceText),
      assetReferenceText,
    };
  });
}

function buildStoryboardAssetReferenceText(
  storyboard: Record<string, unknown>,
  indexes: {
    sceneIndex: Map<string, Record<string, unknown>>;
    characterIndex: Map<string, Record<string, unknown>>;
    propIndex: Map<string, Record<string, unknown>>;
  },
) {
  const sceneRecords = uniqueRecords([
    ...resolveAssetsByRefs([storyboard.sceneId, storyboard.sceneName, storyboard.scene], indexes.sceneIndex),
    ...arrayOfRecords(storyboard.scenes),
  ]);
  const characterRecords = uniqueRecords([
    ...resolveAssetsByRefs([storyboard.characterIds, storyboard.characters, storyboard.characterNames], indexes.characterIndex),
    ...arrayOfRecords(storyboard.characterRefs),
  ]);
  const propRecords = uniqueRecords([
    ...resolveAssetsByRefs([storyboard.propIds, storyboard.props, storyboard.propNames], indexes.propIndex),
    ...arrayOfRecords(storyboard.propRefs),
  ]);

  const lines = [
    formatAssetReferenceLine("视频场景对照表", sceneRecords, {
      nameKeys: ["sceneName", "name"],
      descriptionKeys: ["rawSceneDescription", "description", "sceneDescription"],
      styleKeys: ["sceneImagePrompt", "imagePrompt", "style", "prompt"],
    }),
    formatAssetReferenceLine("视频角色对照表", characterRecords, {
      nameKeys: ["characterName", "name"],
      descriptionKeys: ["rawCharacterDescription", "description", "characterDescription"],
      styleKeys: ["costume", "characterImagePrompt", "imagePrompt", "style"],
    }),
    formatAssetReferenceLine("视频道具对照表", propRecords, {
      nameKeys: ["propName", "name"],
      descriptionKeys: ["rawPropDescription", "description", "propDescription"],
      styleKeys: ["propStyle", "style", "propImagePrompt", "imagePrompt"],
    }),
  ].filter(Boolean);

  return lines.length
    ? ["【资产对照表】", ...lines].join("\n")
    : "";
}

function appendAssetReferenceText(prompt: string, assetReferenceText: string) {
  if (!prompt.trim()) {
    return assetReferenceText;
  }
  if (prompt.includes("【资产对照表】")) {
    return prompt;
  }
  return `${prompt.trim()}\n\n${assetReferenceText}`;
}

function formatAssetReferenceLine(
  label: string,
  records: Record<string, unknown>[],
  keys: {
    nameKeys: string[];
    descriptionKeys: string[];
    styleKeys: string[];
  },
) {
  const entries = records
    .map((record) => {
      const name = firstText(record, keys.nameKeys);
      if (!name) return "";
      return `${name}=【@${name}】`;
    })
    .filter(Boolean);
  return entries.length ? `${label}: ${entries.join("；")}` : "";
}

function buildStoryboardAssetTableSection(assetTable: Record<string, unknown>) {
  return compactLines([
    buildStoryboardAssetTableLine("视频场景对照表", assetTable["视频场景对照表"] ?? assetTable["场景"] ?? assetTable.scene ?? assetTable.scenes),
    buildStoryboardAssetTableLine("视频角色对照表", assetTable["视频角色对照表"] ?? assetTable["角色"] ?? assetTable.character ?? assetTable.characters),
    buildStoryboardAssetTableLine("视频道具对照表", assetTable["视频道具对照表"] ?? assetTable["道具"] ?? assetTable.prop ?? assetTable.props),
  ]).join("\n");
}

function buildStoryboardAssetTableLine(label: string, value: unknown) {
  const names = extractAssetReferenceNames(value);
  return names.length ? `${label}: ${names.map((name) => `${name}=【@${name}】`).join("；")}` : "";
}

function extractAssetReferenceNames(value: unknown): string[] {
  const names: string[] = [];
  const visit = (candidate: unknown) => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        visit(item);
      }
      return;
    }
    if (candidate && typeof candidate === "object") {
      const record = candidate as Record<string, unknown>;
      const directName = firstText(record, ["sceneName", "characterName", "propName", "name", "label", "title"]);
      if (directName) {
        names.push(directName);
        return;
      }
      for (const nested of Object.values(record)) {
        visit(nested);
      }
      return;
    }
    const raw = text(candidate).trim();
    if (!raw) {
      return;
    }
    for (const part of raw.split(/[；;\r\n]+/).map((item) => item.trim()).filter(Boolean)) {
      const left = part.includes("=") ? part.split("=")[0] : part;
      const normalized = left
        .replace(/^视频(?:场景|角色|道具)对照表[:：]\s*/u, "")
        .replace(/【@[^】]+】/g, "")
        .replace(/（[^）]*）/g, "")
        .replace(/^@/, "")
        .trim();
      if (normalized) {
        names.push(normalized);
      }
    }
  };
  visit(value);
  return uniqueText(names);
}

function buildShotActionDialogueText(parts: { subjectAction: string; dialogue: string }) {
  const lines = compactLines([
    parts.subjectAction,
    parts.dialogue || "",
    parts.dialogue ? "" : "无台词，仅动作",
  ]);
  return lines.length ? lines.join("\n") : "无台词，仅动作";
}

function buildSoundEffectLine(parts: { soundEffect: string; bgm: string }) {
  const sound = compactLines([
    parts.soundEffect,
    parts.bgm ? `配乐: ${parts.bgm}` : "",
  ]).join("；");
  return sound || "无";
}

function uniqueText(values: string[]) {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const value of values.map((item) => text(item).trim()).filter(Boolean)) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    items.push(value);
  }
  return items;
}

function resolveAssetsByRefs(values: unknown[], index: Map<string, Record<string, unknown>>) {
  const resolved: Record<string, unknown>[] = [];
  for (const ref of values.flatMap(assetRefs)) {
    if (typeof ref === "object" && ref && !Array.isArray(ref)) {
      resolved.push(ref as Record<string, unknown>);
      continue;
    }
    const key = normalizeAssetKey(ref);
    if (!key) continue;
    resolved.push(index.get(key) || { name: text(ref) });
  }
  return resolved;
}

function assetRefs(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(assetRefs);
  if (value == null || value === "") return [];
  if (typeof value === "string" && value.includes(",")) {
    return value.split(",").map((part) => part.trim()).filter(Boolean);
  }
  return [value];
}

function assetIndex(records: Record<string, unknown>[], keys: string[]) {
  const index = new Map<string, Record<string, unknown>>();
  for (const record of records) {
    for (const key of keys) {
      const normalized = normalizeAssetKey(record[key]);
      if (normalized && !index.has(normalized)) {
        index.set(normalized, record);
      }
    }
  }
  return index;
}

function uniqueRecords(records: Record<string, unknown>[]) {
  const seen = new Set<string>();
  const unique: Record<string, unknown>[] = [];
  for (const record of records) {
    const key = normalizeAssetKey(firstText(record, [
      "sceneId",
      "characterId",
      "propId",
      "id",
      "sceneName",
      "characterName",
      "propName",
      "name",
    ])) || JSON.stringify(record);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(record);
  }
  return unique;
}

function firstText(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = text(record[key]).trim();
    if (value) return value;
  }
  return "";
}

function normalizeAssetKey(value: unknown) {
  return text(value).trim().toLowerCase();
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const fenced = extractMarkdownCodeBlock(trimmed, ["json"]) ?? extractMarkdownCodeBlock(trimmed);
  const jsonText = fenced?.[1] ?? extractFirstJsonObject(trimmed) ?? trimmed;
  const candidates = [jsonText, repairJsonLikeText(jsonText)].filter((value, index, values) => value && values.indexOf(value) === index);
  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("ai_storyboard_invalid_json_object");
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("ai_storyboard_invalid_json_object");
}

function parseArrayOrObject(raw: string, key: string, aliases: string[] = []): Record<string, unknown>[] {
  const markdownResult = parseMarkdownPromptResult(raw);
  const markdownRows = [key, ...aliases]
    .map((candidate) => markdownResult?.[candidate])
    .find(Array.isArray);
  if (Array.isArray(markdownRows) && markdownRows.length) {
    return arrayOfRecords(markdownRows);
  }
  try {
    const parsed = parseJsonObject(raw);
    const keyed = [key, ...aliases].map((candidate) => parsed[candidate]).find(Array.isArray);
    if (Array.isArray(keyed)) {
      return arrayOfRecords(keyed);
    }
    if (Array.isArray(parsed.data)) {
      return arrayOfRecords(parsed.data);
    }
    return arrayOfRecords([parsed]);
  } catch {
    const recovered = recoverAssetRecordsFromTruncatedJson(raw, key, aliases);
    if (recovered.length) {
      return recovered;
    }
    return [];
  }
}

function parseStoryboardPromptResult(raw: string): Record<string, unknown> {
  const markdownResult = parseMarkdownPromptResult(raw);
  if (markdownResult) {
    return markdownResult;
  }
  try {
    const parsed = parseJsonObject(raw);
    if (Array.isArray(parsed.segments)) {
      return parsed;
    }
    const keyed = [parsed.storyboards, parsed.shots].find(Array.isArray);
    if (Array.isArray(keyed)) {
      return { storyboards: arrayOfRecords(keyed) };
    }
    if (Array.isArray(parsed.data)) {
      return { storyboards: arrayOfRecords(parsed.data) };
    }
    return { storyboards: arrayOfRecords([parsed]) };
  } catch {
    const recoveredSegmentRows = recoverStoryboardRowsFromTruncatedSegments(raw);
    if (recoveredSegmentRows.length) {
      return { storyboards: recoveredSegmentRows };
    }
    const recoveredStoryboards = recoverStoryboardsFromTruncatedJson(raw);
    if (recoveredStoryboards.length) {
      return { storyboards: recoveredStoryboards };
    }
    const readableText = extractReadablePromptText(raw).trim();
    return {
      storyboards: readableText
        ? [{ plot: readableText, videoPrompt: readableText }]
        : [],
    };
  }
}

function resolveGeneratedScriptText(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  const markdownBlock = extractMarkdownCodeBlock(trimmed, ["markdown", "md", "text"]);
  if (markdownBlock?.[1]?.trim()) {
    return markdownBlock[1].trim();
  }
  try {
    const parsed = parseJsonObject(trimmed);
    const direct = text(parsed.scriptText || parsed.script || parsed.content || parsed.storyText || parsed.story_text);
    if (direct.trim()) {
      return direct.trim();
    }
    const beats = arrayOfRecords(parsed.scriptBeats || parsed.beats || parsed.scenes || parsed.storyboards);
    const beatText = beats
      .map((beat) => [
        beat.plot,
        beat.scriptContent,
        beat.content,
        beat.dialogue,
        beat.voiceover,
      ].map(text).filter(Boolean).join("\n"))
      .filter(Boolean)
      .join("\n\n");
    if (beatText.trim()) {
      return beatText.trim();
    }
  } catch {
    // Plain text script output is the preferred path.
  }
  return trimmed;
}

function parseMarkdownPromptResult(raw: string): Record<string, unknown> | null {
  const sections = parseMarkdownTableSections(raw);
  if (sections) {
    const result: Record<string, unknown> = {};
    const scenes = parseMarkdownSectionRecords(sections.scenes, "scenes");
    const characters = parseMarkdownSectionRecords(sections.characters, "characters");
    const props = parseMarkdownSectionRecords(sections.props, "props");
    const storyboards = parseMarkdownSectionRecords(sections.storyboards, "storyboards");
    if (scenes.length) {
      result.scenes = scenes;
    }
    if (characters.length) {
      result.characters = characters;
    }
    if (props.length) {
      result.props = props;
    }
    if (storyboards.length) {
      result.storyboards = storyboards;
    }
    if (Object.keys(result).length) {
      return result;
    }
  }
  const storyboardRows = parseStoryboardMarkdownRecords(raw);
  return storyboardRows.length ? { storyboards: storyboardRows } : null;
}

function parseMarkdownTableSections(raw: string) {
  const markdownBody = extractMarkdownBody(raw);
  if (!markdownBody || !/[\[【](?:剧本)?(?:角色|场景|道具|分镜)列表[\]】]/.test(markdownBody)) {
    return null;
  }
  const sectionKeyByLabel: Record<string, MarkdownTableKey> = {
    "角色": "characters",
    "场景": "scenes",
    "道具": "props",
    "分镜": "storyboards",
  };
  const sections: Partial<Record<MarkdownTableKey, string>> = {};
  let currentKey: MarkdownTableKey | "" = "";
  let buffer: string[] = [];

  const flush = () => {
    if (!currentKey) {
      buffer = [];
      return;
    }
    const content = buffer.join("\n").trim();
    if (content) {
      sections[currentKey] = content;
    }
    buffer = [];
  };

  for (const rawLine of markdownBody.split("\n")) {
    const line = String(rawLine ?? "").trim();
    const heading = line
      .replace(/^\*+/, "")
      .replace(/\*+$/, "")
      .trim()
      .match(/^[\[【](?:剧本)?(角色|场景|道具|分镜)列表[\]】]$/);
    if (heading) {
      flush();
      currentKey = sectionKeyByLabel[heading[1]] ?? "";
      continue;
    }
    if (!currentKey) {
      continue;
    }
    buffer.push(rawLine);
  }
  flush();

  return Object.keys(sections).length ? sections : null;
}

function parseMarkdownSectionRecords(section: string | undefined, tableKey: MarkdownTableKey) {
  if (!section) {
    return [];
  }
  const table = parseMarkdownTable(section);
  if (!table || !Array.isArray(table.rows) || table.rows.length === 0) {
    return [];
  }
  if (tableKey === "characters") {
    return table.rows
      .map((cells) => ({
        characterName: text(cells[0]).trim(),
        characterDescription: text(cells[1]).trim(),
        characterImagePrompt: text(cells[2]).trim(),
      }))
      .filter((row) => row.characterName || row.characterDescription || row.characterImagePrompt);
  }
  if (tableKey === "scenes") {
    return table.rows
      .map((cells) => ({
        sceneName: text(cells[0]).trim(),
        sceneDescription: text(cells[1]).trim(),
        sceneImagePrompt: text(cells[2]).trim(),
      }))
      .filter((row) => row.sceneName || row.sceneDescription || row.sceneImagePrompt);
  }
  if (tableKey === "props") {
    return table.rows
      .map((cells) => ({
        propName: text(cells[0]).trim(),
        propDescription: text(cells[1]).trim(),
        propImagePrompt: text(cells[2]).trim(),
      }))
      .filter((row) => row.propName || row.propDescription || row.propImagePrompt);
  }
  return table.rows
    .map((cells, index) => {
      const shotCells = cells.length >= 5 ? cells.slice(1) : cells;
      return {
        shotNo: text(cells.length >= 5 ? cells[0] : index + 1).trim(),
        plot: text(shotCells[0]).trim(),
        dialogue: text(shotCells[1]).trim(),
        imagePrompt: text(shotCells[2]).trim(),
        videoPrompt: text(shotCells[3]).trim(),
      };
    })
    .filter((row) => row.plot || row.dialogue || row.imagePrompt || row.videoPrompt);
}

function parseMarkdownTable(raw: string) {
  const lines = String(raw ?? "")
    .split("\n")
    .map((line) => String(line ?? "").trim())
    .filter((line) => line.includes("|"));
  if (lines.length < 2) {
    return null;
  }
  let header: string[] | null = null;
  const rows: string[][] = [];
  for (const line of lines) {
    const cells = line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length < 2) {
      continue;
    }
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell) || !cell)) {
      continue;
    }
    if (!header) {
      header = cells;
      continue;
    }
    rows.push(cells);
  }
  return header && rows.length ? { header, rows } : null;
}

function parseStoryboardMarkdownRecords(raw: string) {
  const markdownBody = extractMarkdownBody(raw);
  if (!markdownBody || !/\*\*(动作|对白|画面)\*\*/.test(markdownBody)) {
    return [];
  }
  const rows: Array<{ plot: string; dialogue: string; visual: string; transition: string }> = [];
  let current = createStoryboardMarkdownDraft();
  let activeSection = "";
  let buffer: string[] = [];

  const flushBuffer = () => {
    const content = compactMarkdownSection(buffer);
    buffer = [];
    if (!content || !activeSection) {
      return;
    }
    current[activeSection] = current[activeSection]
      ? `${current[activeSection]}\n${content}`
      : content;
  };

  for (const line of markdownBody.split("\n")) {
    const header = parseStoryboardMarkdownHeader(line);
    if (header) {
      flushBuffer();
      if (header.section === "plot" && hasStoryboardMarkdownContent(current)) {
        rows.push(current);
        current = createStoryboardMarkdownDraft();
      }
      activeSection = header.section;
      if (header.transition && !current.transition) {
        current.transition = header.transition;
      }
      if (header.inlineText) {
        buffer.push(header.inlineText);
      }
      continue;
    }
    if (!activeSection) {
      continue;
    }
    buffer.push(line);
  }
  flushBuffer();

  if (hasStoryboardMarkdownContent(current)) {
    rows.push(current);
  }

  return rows
    .filter(hasStoryboardMarkdownContent)
    .map((row, index) => ({
      shotNo: index + 1,
      plot: row.plot,
      dialogue: row.dialogue,
      imagePrompt: row.visual || row.plot,
      visualDescription: row.visual,
      subjectAction: row.plot,
      coreAction: firstMarkdownLine(row.plot),
      transition: row.transition,
    }));
}

function extractMarkdownBody(raw: string) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return "";
  }
  const markdownBlock = extractMarkdownCodeBlock(trimmed, ["markdown", "md", "text"]);
  if (markdownBlock?.[1]?.trim()) {
    return markdownBlock[1].replace(/\r\n?/g, "\n").trim();
  }
  return trimmed.replace(/\r\n?/g, "\n").trim();
}

function createStoryboardMarkdownDraft() {
  return {
    plot: "",
    dialogue: "",
    visual: "",
    transition: "",
  };
}

function parseStoryboardMarkdownHeader(line: string) {
  const match = String(line ?? "").match(/^\s*\*\*(动作|对白|画面)\*\*(?:\s*[（(]([^）)]*)[）)])?\s*[:：]?\s*(.*)$/);
  if (!match) {
    return null;
  }
  const label = match[1];
  const modifier = String(match[2] ?? "").trim();
  const inlineText = String(match[3] ?? "").trim();
  return {
    section: label === "动作" ? "plot" : label === "对白" ? "dialogue" : "visual",
    transition: /转/.test(modifier) ? modifier : "",
    inlineText,
  };
}

function hasStoryboardMarkdownContent(row: { plot: string; dialogue: string; visual: string; transition: string }) {
  return Boolean(row.plot || row.dialogue || row.visual);
}

function compactMarkdownSection(lines: string[]) {
  return lines
    .map((line) => String(line ?? "").trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[*-]\s*/, "").trim())
    .filter(Boolean)
    .join("\n");
}

function firstMarkdownLine(value: string) {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) ?? "";
}

function extractMarkdownCodeBlock(raw: string, languages: string[] = []) {
  const pattern = /```([a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/g;
  const normalizedLanguages = languages.map((item) => item.toLowerCase());
  let match: RegExpExecArray | null;
  let fallback: readonly [string, string] | null = null;
  while ((match = pattern.exec(raw))) {
    const language = String(match[1] ?? "").trim().toLowerCase();
    const body = String(match[2] ?? "");
    if (!fallback) {
      fallback = [language, body] as const;
    }
    if (!normalizedLanguages.length || normalizedLanguages.includes(language)) {
      return [language, body] as const;
    }
  }
  return fallback;
}

function extractFirstJsonObject(raw: string) {
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    return null;
  }
  return raw.slice(firstBrace, lastBrace + 1);
}

function repairJsonLikeText(raw: string) {
  return raw
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/([{,]\s*)([A-Za-z_$\u00C0-\uFFFF][A-Za-z0-9_$\-\u00C0-\uFFFF]*)(\s*:)/gu, '$1"$2"$3');
}

function recoverAssetRecordsFromTruncatedJson(raw: string, key: string, aliases: string[] = []) {
  const repaired = repairJsonLikeText(raw);
  const candidateKeys = [key, ...aliases].filter(Boolean);
  const hasTargetArray = candidateKeys.some((candidate) => new RegExp(`"${candidate}"\\s*:\\s*\\[`, "i").test(repaired));
  if (!hasTargetArray) {
    return [];
  }
  const fieldsByKey: Record<string, string[]> = {
    scenes: ["sceneId", "sceneName", "sceneDescription", "sceneImagePrompt"],
    characters: ["characterId", "characterName", "characterDescription", "costume", "characterImagePrompt"],
    props: ["propId", "propName", "propDescription", "propImagePrompt", "firstAppearance", "ownerOrUser"],
  };
  const fields = fieldsByKey[key];
  if (!fields?.length) {
    return [];
  }
  const record = Object.fromEntries(
    fields
      .map((field) => [field, extractLooseJsonStringField(repaired, field)] as const)
      .filter(([, value]) => value.trim()),
  );
  return Object.keys(record).length ? [record] : [];
}

function recoverStoryboardRowsFromTruncatedSegments(raw: string): Record<string, unknown>[] {
  const recoveredSegments = recoverSegmentsFromTruncatedJson(raw);
  return recoveredSegments.map((segment, index) => ({
    plot: buildChapterPlotText(segment, index),
    dialogue: buildChapterDialogueText(arrayOfRecords(segment.shots)),
    imagePrompt: buildChapterImagePromptText(segment),
    videoPrompt: buildChapterVideoPromptText(segment, index),
  }));
}

function recoverSegmentsFromTruncatedJson(raw: string): Record<string, unknown>[] {
  const segmentId = text(raw.match(/"segment_id"\s*:\s*(\d+)/)?.[1]).trim();
  const sceneName = decodeJsonStringFragment(text(raw.match(/"scene_name"\s*:\s*"((?:\\.|[^"\\])*)"/)?.[1]));
  const shotPattern = /\{"shot_id":"((?:\\.|[^"\\])*)","time_range":"((?:\\.|[^"\\])*)","transition":"((?:\\.|[^"\\])*)","shot_type":"((?:\\.|[^"\\])*)"(?:,"camera_angle":"((?:\\.|[^"\\])*)")?(?:,"camera_movement":"((?:\\.|[^"\\])*)")?(?:,"description":"((?:\\.|[^"\\])*)")?(?:,"core_action":"((?:\\.|[^"\\])*)")?(?:,"dialogue_or_os":"((?:\\.|[^"\\])*)")?(?:,"sound_effects":"((?:\\.|[^"\\])*)")?/g;
  const shots: Record<string, unknown>[] = [];
  let match: RegExpExecArray | null;
  while ((match = shotPattern.exec(raw))) {
    shots.push({
      shot_id: decodeJsonStringFragment(match[1] ?? ""),
      time_range: decodeJsonStringFragment(match[2] ?? ""),
      transition: decodeJsonStringFragment(match[3] ?? ""),
      shot_type: decodeJsonStringFragment(match[4] ?? ""),
      camera_angle: decodeJsonStringFragment(match[5] ?? ""),
      camera_movement: decodeJsonStringFragment(match[6] ?? ""),
      description: decodeJsonStringFragment(match[7] ?? ""),
      core_action: decodeJsonStringFragment(match[8] ?? ""),
      dialogue_or_os: decodeJsonStringFragment(match[9] ?? ""),
      sound_effects: decodeJsonStringFragment(match[10] ?? ""),
    });
  }
  if (!shots.length) {
    return [];
  }
  return [{
    segment_id: Number(segmentId || 1),
    scene_analysis: sceneName ? { scene_name: sceneName } : {},
    shots,
  }];
}

function recoverStoryboardsFromTruncatedJson(raw: string): Record<string, unknown>[] {
  if (!/"storyboards"\s*:\s*\[/.test(raw)) {
    return [];
  }
  const plot = extractLooseJsonStringField(raw, "plot");
  const dialogue = extractLooseJsonStringField(raw, "dialogue");
  const imagePrompt = extractLooseJsonStringField(raw, "imagePrompt");
  const videoPrompt = extractLooseJsonStringField(raw, "videoPrompt");
  if (![plot, dialogue, imagePrompt, videoPrompt].some(Boolean)) {
    return [];
  }
  return [{
    plot,
    dialogue,
    imagePrompt,
    videoPrompt: videoPrompt || [plot, dialogue, imagePrompt].filter(Boolean).join("\n"),
  }];
}

function renderPromptTemplate(template: string, scriptText: string) {
  const variables: Record<string, string> = {
    novel_chunk: scriptText,
    novel_chapter: scriptText,
    chunk: scriptText,
    story_text: scriptText,
    script: scriptText,
    script_text: scriptText,
    screenplay: scriptText,
  };
  const replacedVariables = template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => variables[key] ?? match);
  return replacedVariables
    .replace(/【剧本】/g, `【剧本】\n${scriptText}`)
    .replace(/\[剧本\]/g, `[剧本]\n${scriptText}`);
}

function extractReadablePromptText(rawJson: string) {
  const values: string[] = [];
  const pattern = /"(sceneName|sceneDescription|sceneImagePrompt|characterName|characterDescription|costume|characterImagePrompt|propName|propDescription|propImagePrompt|plot|dialogue|imagePrompt|videoPrompt)"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(rawJson))) {
    const value = decodeJsonStringFragment(match[2]);
    if (value.trim()) {
      values.push(value.trim());
    }
  }
  return values.join("\n") + (values.length ? "\n" : "");
}

function decodeJsonStringFragment(value: string) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value
      .replace(/\\"/g, "\"")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\\\/g, "\\");
  }
}

function extractLooseJsonStringField(raw: string, key: string) {
  const match = raw.match(new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)`, "i"));
  return decodeJsonStringFragment(match?.[1] ?? "");
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function joinText(value: unknown) {
  return Array.isArray(value) ? value.map(String).join("、") : text(value);
}

function text(value: unknown) {
  return value == null ? "" : String(value);
}

function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
