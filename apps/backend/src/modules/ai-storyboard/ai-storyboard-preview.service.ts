import { createHash, randomUUID } from "node:crypto";

import {
  TextModelGatewayService,
  textModelGatewayOperationNames,
} from "../model-gateway/text-model-gateway.service.ts";

export type AiStoryboardPreviewStreamEvent =
  | { type: "script_prompt"; text: string }
  | { type: "script_start" }
  | { type: "script_delta"; text: string }
  | { type: "script_done"; text: string; rawText: string }
  | { type: "asset_prompt"; stage: AssetPromptStage; title: string; text: string }
  | { type: "asset_start"; stage: AssetPromptStage; title: string }
  | { type: "asset_delta"; stage: AssetPromptStage; title: string; text: string }
  | { type: "asset_done"; stage: AssetPromptStage; title: string; text: string }
  | { type: "complete"; preview: ReturnType<typeof normalizePreview> };

type AssetPromptStage = "scene" | "character" | "prop" | "shot";

export interface TextChatGatewayLike {
  completeJson(input: {
    model: string;
    prompt: string;
    projectId?: string | null;
    createdByUserId?: string | null;
    responseFormat?: "json_object" | "text";
  }): Promise<string>;
  streamJson?(input: {
    model: string;
    prompt: string;
    projectId?: string | null;
    createdByUserId?: string | null;
    responseFormat?: "json_object" | "text";
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
      responseFormat: "text",
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

    yield { type: "complete", preview: normalizePreview(scriptText, {
      scenes: parseArrayOrObject(sceneRaw, "scenes"),
      characters: parseArrayOrObject(characterRaw, "characters"),
      props: parseArrayOrObject(propRaw, "props"),
      ...parseStoryboardPromptResult(shotRaw),
    }) };
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
      responseFormat: "json_object",
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
  }) {
    const payloadHash = sha256(input.prompt);
    const requestKey = `ai-storyboard:${input.projectId ?? "none"}:${randomUUID()}`;
    const requestBody = {
      model: input.model,
      stream: true,
      temperature: 0.2,
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
}) {
  if (input.gateway.streamJson) {
    for await (const delta of input.gateway.streamJson({
      model: input.model,
      prompt: input.prompt,
      projectId: input.projectId,
      createdByUserId: input.createdByUserId,
      responseFormat: input.responseFormat,
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
    "只输出剧本文字，不要 JSON，不要 Markdown，不要解释。",
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
  return [
    "请根据【场景默认提示词】和【剧本】生成场景提示词结果。",
    "只输出 JSON，不要 Markdown，不要解释。",
    "",
    "[场景默认提示词]",
    renderPromptTemplate(input.templates?.scenePrompt || "", scriptText),
    "",
    "【剧本】",
    scriptText,
    "",
    "输出字段：scenes[].sceneId, sceneName, sceneDescription, sceneImagePrompt",
  ].join("\n");
}

function buildCharacterPrompt(scriptText: string, input: AiStoryboardPreviewInput) {
  return [
    "请根据【角色默认提示词】和【剧本】生成角色提示词结果。",
    "只输出 JSON，不要 Markdown，不要解释。",
    "",
    "[角色默认提示词]",
    renderPromptTemplate(input.templates?.characterPrompt || "", scriptText),
    "",
    "【剧本】",
    scriptText,
    "",
    "输出字段：characters[].characterId, characterName, characterDescription, costume, characterImagePrompt",
  ].join("\n");
}

function buildPropPrompt(scriptText: string, input: AiStoryboardPreviewInput) {
  return [
    "请根据【道具默认提示词】和【剧本】生成道具提示词结果。",
    "只输出 JSON，不要 Markdown，不要解释。",
    "",
    "[道具默认提示词]",
    renderPromptTemplate(input.templates?.propPrompt || "", scriptText),
    "",
    "【剧本】",
    scriptText,
    "",
    "输出字段：props[].propId, propName, propDescription, propImagePrompt, firstAppearance, ownerOrUser",
  ].join("\n");
}

function buildShotPrompt(scriptText: string, input: AiStoryboardPreviewInput) {
  return [
    "请根据【分镜默认提示词】和【剧本】生成分镜提示词结果。",
    "只输出 JSON，不要 Markdown，不要解释。",
    "",
    "[分镜默认提示词]",
    renderPromptTemplate(input.templates?.shotPrompt || "", scriptText),
    "",
    "【剧本】",
    scriptText,
    "",
    "输出字段：script_title, total_segments, segments[].segment_id, segments[].scene_analysis, segments[].segment_transition, segments[].shots[], segments[].asset_table",
    "segments[].shots[] 字段：shot_id, time_range, transition, shot_type, camera_angle, camera_movement, description, core_action, opponent_design, character_logic, subject_action, dialogue_or_os, sound_effects",
    "time_range 必须是字符串类型，格式固定为小数点后一位并带“秒”，例如：\"0.0-3.5秒\"，不要输出数字或 \"0-4\" 这种省略格式。",
    "segments[].asset_table 字段：视频场景对照表, 视频角色对照表, 视频道具对照表",
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
  const sceneAnalysis = recordLines(segment.scene_analysis, [
    ["场景", ["scene_name", "sceneName"]],
    ["承接", ["承接", "continuity", "continuity_from_previous"]],
    ["过渡", ["过渡", "transition"]],
    ["情绪意图", ["情绪意图", "emotion_intent", "emotionIntent"]],
    ["人物表演底层逻辑总纲", ["人物表演底层逻辑总纲", "performance_logic", "performanceLogic"]],
  ]);
  return compactLines([
    `场景分析：${sceneAnalysis || `第${segmentIndex + 1}段`}`,
    buildTransitionLine(segment.segment_transition),
  ]).join("\n");
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
  const assetTable = objectRecord(segment.asset_table);
  return compactLines([
    `视频场景对照表: ${firstText(assetTable, ["视频场景对照表", "场景", "scene", "scenes"])}`,
    `视频角色对照表: ${firstText(assetTable, ["视频角色对照表", "角色", "character", "characters"])}`,
    `视频道具对照表: ${firstText(assetTable, ["视频道具对照表", "道具", "prop", "props"])}`,
  ]).join("\n");
}

function buildChapterVideoPromptText(segment: Record<string, unknown>, segmentIndex: number) {
  const shots = arrayOfRecords(segment.shots);
  return compactLines([
    `场景分析：${recordLines(segment.scene_analysis, [
      ["场景", ["scene_name", "sceneName"]],
      ["情绪意图", ["情绪意图", "emotion_intent", "emotionIntent"]],
      ["人物表演底层逻辑总纲", ["人物表演底层逻辑总纲", "performance_logic", "performanceLogic"]],
    ]) || `第${segmentIndex + 1}段`}`,
    `分镜承接：${recordLines(segment.segment_transition, [
      ["前一分镜末尾画面", ["前一分镜末尾画面", "previous_last_frame", "previousLastFrame"]],
      ["本分镜开场画面", ["本分镜开场画面", "current_opening_frame", "currentOpeningFrame"]],
      ["承接逻辑", ["承接逻辑", "continuity_logic", "continuityLogic"]],
    ])}`,
    "镜头列表：",
    ...shots.map((shot, index) => buildChapterShotText(shot, index)),
    "资产对照表:",
    `  视频场景对照表: ${firstText(objectRecord(segment.asset_table), ["视频场景对照表", "场景", "scene", "scenes"])}`,
    `  视频角色对照表: ${firstText(objectRecord(segment.asset_table), ["视频角色对照表", "角色", "character", "characters"])}`,
    `  视频道具对照表: ${firstText(objectRecord(segment.asset_table), ["视频道具对照表", "道具", "prop", "props"])}`,
  ]).join("\n");
}

function buildChapterShotText(shot: Record<string, unknown>, index: number) {
  const label = resolveShotLabel(shot, index);
  return compactLines([
    `  【镜头${label}】${formatSegmentTimeRange(firstText(shot, ["time_range", "timeRange", "time"]))} 转场: ${firstText(shot, ["transition"])} 镜头:${buildChapterShotCameraText(shot)}`,
    `  镜头${label}(分镜剧情)：${firstText(shot, ["description", "plot", "story"])}`,
    `  核心动作: ${firstText(shot, ["core_action", "coreAction"])}`,
    `  对手戏设计: ${firstText(shot, ["opponent_design", "opponentDesign", "interactionDesign"])}`,
    `  人物底层逻辑: ${firstText(shot, ["character_logic", "characterLogic"])}`,
    `  主体动作: ${firstText(shot, ["subject_action", "subjectAction"]) || firstText(shot, ["dialogue_or_os", "dialogueOrOs", "dialogue"]) || "(无台词，内心OS)"}`,
    `  音效: ${firstText(shot, ["sound_effects", "soundEffect", "sound_effect"])}`,
  ]).join("\n");
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
    baseVideoPrompt: sanitizePerShotVideoPrompt(baseVideoPrompt),
    timeRange: perShotTimeRange,
    transition,
    shotSize,
    cameraMovement,
    scene: firstText(storyboard, ["scene", "sceneName", "scene_name"]),
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
  const labeledParts = [
    ["时间", parts.timeRange],
    ["转场", parts.transition],
    ["镜头", [parts.shotSize, parts.cameraMovement].filter(Boolean).join("/")],
    ["场景", parts.scene],
    ["画面描述", parts.visualDescription || parts.description || parts.visualFocus || parts.prompt],
    ["核心动作", parts.coreAction || parts.action],
    ["对手戏设计", parts.interactionDesign],
    ["人物底层逻辑", parts.characterLogic || parts.emotion],
    ["主体动作", parts.subjectAction],
    ["音效", parts.soundEffect],
    ["配乐", parts.bgm],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`);
  return [parts.baseVideoPrompt, ...labeledParts].filter(Boolean).join("；");
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
    formatAssetReferenceLine("场景对照表", sceneRecords, {
      nameKeys: ["sceneName", "name"],
      descriptionKeys: ["rawSceneDescription", "description", "sceneDescription"],
      styleKeys: ["sceneImagePrompt", "imagePrompt", "style", "prompt"],
    }),
    formatAssetReferenceLine("角色对照表", characterRecords, {
      nameKeys: ["characterName", "name"],
      descriptionKeys: ["rawCharacterDescription", "description", "characterDescription"],
      styleKeys: ["costume", "characterImagePrompt", "imagePrompt", "style"],
    }),
    formatAssetReferenceLine("道具对照表", propRecords, {
      nameKeys: ["propName", "name"],
      descriptionKeys: ["rawPropDescription", "description", "propDescription"],
      styleKeys: ["propStyle", "style", "propImagePrompt", "imagePrompt"],
    }),
  ].filter(Boolean);

  return lines.length
    ? ["资产对照表（视频中涉及的角色、场景与物品如下（保持一致性））：", ...lines].join("\n")
    : "";
}

function appendAssetReferenceText(prompt: string, assetReferenceText: string) {
  if (!prompt.trim()) {
    return assetReferenceText;
  }
  if (prompt.includes("资产对照表（视频中涉及的角色、场景与物品如下（保持一致性））：")) {
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
      const description = firstText(record, keys.descriptionKeys) || name;
      const style = firstText(record, keys.styleKeys) || description;
      return `${name}=（${description}）【@${name}/${style}】`;
    })
    .filter(Boolean);
  return entries.length ? `${label}: ${entries.join("；")}` : "";
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
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = fenced?.[1] ?? trimmed;
  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("ai_storyboard_invalid_json_object");
  }
  return parsed as Record<string, unknown>;
}

function parseArrayOrObject(raw: string, key: string, aliases: string[] = []): Record<string, unknown>[] {
  const parsed = parseJsonObject(raw);
  const keyed = [key, ...aliases].map((candidate) => parsed[candidate]).find(Array.isArray);
  if (Array.isArray(keyed)) {
    return arrayOfRecords(keyed);
  }
  if (Array.isArray(parsed.data)) {
    return arrayOfRecords(parsed.data);
  }
  return arrayOfRecords([parsed]);
}

function parseStoryboardPromptResult(raw: string): Record<string, unknown> {
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
}

function resolveGeneratedScriptText(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
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
  return replacedVariables.replace(/【剧本】/g, `【剧本】\n${scriptText}`);
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
    return value.replace(/\\"/g, "\"").replace(/\\n/g, "\n");
  }
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
