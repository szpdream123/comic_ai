import { createHash, randomUUID } from "node:crypto";

import {
  TextModelGatewayService,
  textModelGatewayOperationNames,
} from "../model-gateway/text-model-gateway.service.ts";
import type { TextGatewayChatCompletionRequest } from "../model-gateway/openai-compatible-text.adapter.ts";
import { isRetrySafeTransientDatabasePersistenceError } from "../shared/db/dev-db.ts";

const LIVE_ECHO_CHUNK_SIZE = 32;
const AI_STORYBOARD_SHOT_MAX_TOKENS = 32_768;
const AI_STORYBOARD_SHOT_CONTINUATION_LIMIT = 3;

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
export type AiStoryboardPromptStage = "script" | AssetPromptStage;

const AI_STORYBOARD_PROMPT_STAGES: AiStoryboardPromptStage[] = ["script", "scene", "character", "prop", "shot"];

export class AiStoryboardWorkflowIntentError extends Error {
  readonly code = "workflow_intent_invalid";
}

export interface TextChatGatewayLike {
  completeJson(input: {
    model: string;
    prompt?: string;
    messages?: TextGatewayChatCompletionRequest["messages"];
    projectId?: string | null;
    canvasProjectId?: string | null;
    createdByUserId?: string | null;
    responseFormat?: "json_object" | "text";
    maxTokens?: number;
    payloadSummary?: string;
    requestKeyPrefix?: string;
    signal?: AbortSignal;
  }): Promise<string>;
  completeJsonWithUsage?(input: {
    model: string;
    prompt?: string;
    messages?: TextGatewayChatCompletionRequest["messages"];
    projectId?: string | null;
    canvasProjectId?: string | null;
    createdByUserId?: string | null;
    responseFormat?: "json_object" | "text";
    maxTokens?: number;
    payloadSummary?: string;
    requestKeyPrefix?: string;
    signal?: AbortSignal;
  }): Promise<{
    content: string;
    usage: Record<string, unknown> | null;
    providerRequestId: string;
  }>;
  streamJson?(input: {
    model: string;
    prompt?: string;
    messages?: TextGatewayChatCompletionRequest["messages"];
    projectId?: string | null;
    canvasProjectId?: string | null;
    createdByUserId?: string | null;
    responseFormat?: "json_object" | "text";
    maxTokens?: number;
    payloadSummary?: string;
    requestKeyPrefix?: string;
    signal?: AbortSignal;
  }): AsyncIterable<string>;
}

export interface AiStoryboardPreviewInput {
  projectId: string;
  canvasProjectId?: string | null;
  createdByUserId?: string | null;
  scriptText: string;
  modelCode?: string | null;
  selectedStages?: AiStoryboardPromptStage[];
  skipScriptStage?: boolean;
  context?: {
    scenes?: Array<Record<string, unknown>>;
    characters?: Array<Record<string, unknown>>;
    props?: Array<Record<string, unknown>>;
  };
  packages: {
    skillPrompt?: string;
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
  signal?: AbortSignal;
}

export async function resolveAiStoryboardWorkflowIntent(input: {
  gateway: TextChatGatewayLike;
  modelCode: string;
  instruction: string;
  projectId?: string | null;
  createdByUserId?: string | null;
  signal?: AbortSignal;
}) {
  const instruction = String(input.instruction ?? "").trim();
  if (!instruction) {
    throw new AiStoryboardWorkflowIntentError("workflow instruction is required");
  }
  const raw = await input.gateway.completeJson({
    model: input.modelCode,
    messages: [
      {
        role: "system",
        content: [
          "你是漫剧生产工作流的意图路由器。只判断用户明确要求产出的内容，不执行创作。",
          "可选阶段仅有 script、scene、character、prop、shot。选择满足指令所需的最少阶段，不要自动补齐前置或后续阶段。",
          "script=小说转剧本；scene=场景描述或场景图片提示词；character=人物/角色描述或人物图片提示词；prop=道具描述或道具图片提示词；shot=剧本转分镜或分镜图片/视频提示词。",
          "例如：人物提示词只返回 character；小说转剧本只返回 script；剧本转分镜只返回 shot；明确要求完整制作或全部流程才返回全部五项。",
          "只返回严格 JSON：{\"stages\":[\"character\"]}。stages 必须非空、不得包含其他值。",
        ].join("\n"),
      },
      { role: "user", content: instruction },
    ],
    projectId: input.projectId,
    createdByUserId: input.createdByUserId,
    responseFormat: "json_object",
    payloadSummary: "home workflow intent resolution",
    requestKeyPrefix: "home-workflow-intent",
    signal: input.signal,
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw ?? ""));
  } catch {
    throw new AiStoryboardWorkflowIntentError("workflow intent model returned invalid JSON");
  }
  const stages = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as { stages?: unknown }).stages
    : null;
  if (!Array.isArray(stages) || stages.length === 0) {
    throw new AiStoryboardWorkflowIntentError("workflow intent model returned no stages");
  }
  const normalizedStages = [...new Set(stages.map((stage) => String(stage ?? "").trim()))];
  if (normalizedStages.some((stage) => !AI_STORYBOARD_PROMPT_STAGES.includes(stage as AiStoryboardPromptStage))) {
    throw new AiStoryboardWorkflowIntentError("workflow intent model returned unsupported stages");
  }
  return {
    stages: AI_STORYBOARD_PROMPT_STAGES.filter((stage) => normalizedStages.includes(stage)),
    skipScriptStage: !normalizedStages.includes("script"),
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
    const selectedStages = Array.isArray(input.selectedStages)
      ? new Set(input.selectedStages)
      : null;
    const shouldRunScriptStage = selectedStages
      ? selectedStages.has("script")
      : input.skipScriptStage !== true;
    const modelCode = String(input.modelCode ?? "deepseek-chat").trim() || "deepseek-chat";
    let scriptText = "";
    let scriptRaw = "";
    if (!shouldRunScriptStage) {
      scriptText = String(input.scriptText ?? "").trim();
      if (!scriptText) {
        throw new Error("ai_storyboard_script_empty");
      }
      scriptRaw = scriptText;
      yield { type: "script_done", text: scriptText, rawText: scriptText };
    } else {
      const scriptPrompt = buildScriptPrompt(input);
      yield { type: "script_prompt", text: scriptPrompt };
      yield { type: "script_start" };
      for await (const delta of streamJsonText({
        gateway: deps.gateway,
        model: modelCode,
        prompt: scriptPrompt,
        projectId: input.canvasProjectId ? null : input.projectId,
        canvasProjectId: input.canvasProjectId,
        createdByUserId: input.createdByUserId,
        responseFormat: "text",
        signal: input.signal,
      })) {
        scriptRaw += delta;
        yield { type: "script_delta", text: delta };
      }
      scriptText = resolveGeneratedScriptText(scriptRaw);
      yield { type: "script_done", text: scriptText, rawText: scriptRaw };
    }
    if (!scriptText.trim()) {
      throw new Error("ai_storyboard_script_empty");
    }

    const shouldRunStage = (stage: AssetPromptStage) => !selectedStages || selectedStages.has(stage);
    const extractStageDefinitions: Array<{
      stage: ExtractAssetPromptStage;
      title: string;
      prompt: string;
    }> = [
      { stage: "scene", title: "场景提示词生成", prompt: buildScenePrompt(scriptText, input) },
      { stage: "character", title: "角色提示词生成", prompt: buildCharacterPrompt(scriptText, input) },
      { stage: "prop", title: "道具提示词生成", prompt: buildPropPrompt(scriptText, input) },
    ];
    const extractStageRaws: Record<ExtractAssetPromptStage, string> = {
      scene: "",
      character: "",
      prop: "",
    };
    const selectedExtractStageDefinitions = extractStageDefinitions
      .filter(({ stage }) => shouldRunStage(stage));
    if (selectedExtractStageDefinitions.length) {
      const extractAbortController = new AbortController();
      const abortFromInput = () => extractAbortController.abort();
      if (input.signal?.aborted) {
        abortFromInput();
      } else {
        input.signal?.addEventListener("abort", abortFromInput, { once: true });
      }
      const extractInput = { ...input, signal: extractAbortController.signal };
      const [foregroundStage, ...backgroundStages] = selectedExtractStageDefinitions;
      let runningBackgroundStages: Array<{
        stage: ExtractAssetPromptStage;
        stream: ReturnType<typeof startCollectedAssetPromptStage>;
      }> = [];
      const startBackgroundStages = () => {
        if (runningBackgroundStages.length || !backgroundStages.length) return;
        runningBackgroundStages = backgroundStages.map((definition) => ({
          stage: definition.stage,
          stream: startCollectedAssetPromptStage(runAssetPromptStage(
            definition.stage,
            definition.title,
            definition.prompt,
            extractInput,
            modelCode,
          )),
        }));
      };
      try {
        extractStageRaws[foregroundStage.stage] = yield* runAssetPromptStage(
          foregroundStage.stage,
          foregroundStage.title,
          foregroundStage.prompt,
          extractInput,
          modelCode,
          startBackgroundStages,
        );
        startBackgroundStages();
        for (const runningStage of runningBackgroundStages) {
          extractStageRaws[runningStage.stage] = yield* runningStage.stream.events();
        }
      } catch (error) {
        extractAbortController.abort();
        throw error;
      } finally {
        input.signal?.removeEventListener("abort", abortFromInput);
        extractAbortController.abort();
      }
    }
    const sceneRaw = extractStageRaws.scene;
    const characterRaw = extractStageRaws.character;
    const propRaw = extractStageRaws.prop;
    const assetStageOutput = [sceneRaw, characterRaw, propRaw];
    let scenes = resolveAssetStageRecords(sceneRaw, assetStageOutput, "scenes");
    let characters = resolveAssetStageRecords(characterRaw, assetStageOutput, "characters");
    let props = resolveAssetStageRecords(propRaw, assetStageOutput, "props");
    if (!shouldRunStage("scene") && scenes.length === 0) scenes = arrayOfRecords(input.context?.scenes);
    if (!shouldRunStage("character") && characters.length === 0) characters = arrayOfRecords(input.context?.characters);
    if (!shouldRunStage("prop") && props.length === 0) props = arrayOfRecords(input.context?.props);
    const shotRaw = shouldRunStage("shot")
      ? yield* runAssetPromptStage("shot", "分镜提示词生成", buildShotPrompt(scriptText, input, {
          scenes,
          characters,
          props,
        }), input, modelCode)
      : "";
    if (shotRaw.trim()) {
      scenes = scenes.length ? scenes : resolveAssetStageRecords("", [shotRaw], "scenes");
      characters = characters.length ? characters : resolveAssetStageRecords("", [shotRaw], "characters");
      props = props.length ? props : resolveAssetStageRecords("", [shotRaw], "props");
    }

    yield { type: "complete", preview: {
      ...normalizePreview(scriptText, {
        scenes,
        characters,
        props,
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
    modelCode: string,
    onModelStreamStart?: () => void,
  ): AsyncGenerator<AiStoryboardPreviewStreamEvent, string> {
    yield { type: "asset_prompt", stage, title, text: prompt };
    yield { type: "asset_start", stage, title };
    onModelStreamStart?.();
    let raw = "";
    let requestPrompt = prompt;
    let continuationCount = 0;
    let databaseRetryCount = 0;
    while (true) {
      try {
        for await (const delta of streamJsonText({
          gateway: deps.gateway,
          model: modelCode,
          prompt: requestPrompt,
          projectId: input.canvasProjectId ? null : input.projectId,
          canvasProjectId: input.canvasProjectId,
          createdByUserId: input.createdByUserId,
          responseFormat: "text",
          maxTokens: stage === "shot" ? AI_STORYBOARD_SHOT_MAX_TOKENS : undefined,
          signal: input.signal,
        })) {
          raw += delta;
          yield { type: "asset_delta", stage, title, text: delta };
        }
        break;
      } catch (error) {
        if (!raw && databaseRetryCount === 0 && isRetrySafeTransientDatabasePersistenceError(error)) {
          databaseRetryCount += 1;
          continue;
        }
        if (
          stage !== "shot" ||
          !raw.trim() ||
          !isAiStoryboardOutputTruncatedError(error) ||
          continuationCount >= AI_STORYBOARD_SHOT_CONTINUATION_LIMIT
        ) {
          throw error;
        }
        continuationCount += 1;
        requestPrompt = buildAiStoryboardShotContinuationPrompt(prompt, raw, continuationCount);
      }
    }
    yield { type: "asset_done", stage, title, text: raw };
    return raw;
  }

  return { generatePreview, generatePreviewStream };
}

type CollectedAssetPromptStageResult =
  | { ok: true; raw: string }
  | { ok: false; error: unknown };

function startCollectedAssetPromptStage(
  stream: AsyncGenerator<AiStoryboardPreviewStreamEvent, string>,
) {
  const bufferedEvents: AiStoryboardPreviewStreamEvent[] = [];
  let finished = false;
  let notifyProgress: (() => void) | null = null;
  const notify = () => {
    const current = notifyProgress;
    notifyProgress = null;
    current?.();
  };
  const result = (async (): Promise<CollectedAssetPromptStageResult> => {
    try {
      let next = await stream.next();
      while (!next.done) {
        bufferedEvents.push(next.value);
        notify();
        next = await stream.next();
      }
      return { ok: true, raw: next.value };
    } catch (error) {
      return { ok: false, error };
    } finally {
      finished = true;
      notify();
    }
  })();

  return {
    async *events(): AsyncGenerator<AiStoryboardPreviewStreamEvent, string> {
      let index = 0;
      while (!finished || index < bufferedEvents.length) {
        while (index < bufferedEvents.length) {
          yield bufferedEvents[index++]!;
        }
        if (!finished) {
          await new Promise<void>((resolve) => {
            notifyProgress = resolve;
          });
        }
      }
      const completed = await result;
      if (!completed.ok) throw completed.error;
      return completed.raw;
    },
  };
}

export function createTextModelChatGateway(deps: {
  gateway: TextModelGatewayService;
  disableThinking?: boolean;
}) {
  async function createStream(input: {
    model: string;
    prompt?: string;
    messages?: TextGatewayChatCompletionRequest["messages"];
    projectId?: string | null;
    canvasProjectId?: string | null;
    createdByUserId?: string | null;
    responseFormat?: "json_object" | "text";
    maxTokens?: number;
    payloadSummary?: string;
    requestKeyPrefix?: string;
    signal?: AbortSignal;
  }) {
    const messages = input.messages ?? [{ role: "user" as const, content: input.prompt ?? "" }];
    const payloadHash = sha256(JSON.stringify(messages));
    const requestKey = `${input.requestKeyPrefix ?? "ai-storyboard"}:${input.projectId ?? input.canvasProjectId ?? "none"}:${randomUUID()}`;
    const requestBody = {
      model: input.model,
      stream: true,
      temperature: 0.2,
      messages,
      ...(deps.disableThinking ? { thinking: { type: "disabled" as const } } : {}),
      ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
      ...(input.responseFormat === "json_object" ? { response_format: { type: "json_object" as const } } : {}),
    };
    return deps.gateway.chat.completions.create(
      requestBody,
      {
        projectId: input.projectId ?? null,
        canvasProjectId: input.canvasProjectId ?? null,
        createdByUserId: input.createdByUserId ?? null,
        requestKey,
        requestHash: payloadHash,
        payloadHash,
        payloadSummary: input.payloadSummary ?? "ai storyboard preview text generation",
        providerOperation: textModelGatewayOperationNames.chatCompletions,
        signal: input.signal,
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

    async completeJsonWithUsage(input) {
      const streamResult = await createStream(input);
      let content = "";
      for await (const chunk of streamResult.stream) {
        for (const choice of chunk.choices ?? []) {
          const delta = choice.delta?.content;
          if (typeof delta === "string" && delta) content += delta;
        }
      }
      const completed = await streamResult.completed;
      if (completed.status !== "succeeded") {
        throw Object.assign(new Error(completed.failureCode || "provider_stream_error"), {
          responseText: content,
          usage: completed.usage,
        });
      }
      return {
        content,
        usage: completed.usage,
        providerRequestId: streamResult.providerRequestId,
      };
    },

    async *streamJson(input) {
      const streamResult = await createStream(input);
      const finishReasons = new Set<string>();
      for await (const chunk of streamResult.stream) {
        for (const choice of chunk.choices ?? []) {
          if (typeof choice.finish_reason === "string" && choice.finish_reason) {
            finishReasons.add(choice.finish_reason);
          }
          const delta = choice.delta?.content;
          if (typeof delta === "string" && delta) {
            yield delta;
          }
        }
      }
      const completed = await streamResult.completed;
      if (completed.status === "failed") {
        throw new Error(completed.failureCode || "provider_stream_error");
      }
      if (finishReasons.has("length")) {
        throw Object.assign(new Error("provider_output_truncated"), {
          code: "provider_output_truncated",
        });
      }
    },
  } satisfies TextChatGatewayLike;
}

function startCollectedAssetPromptStage(
  stream: AsyncGenerator<AiStoryboardPreviewStreamEvent, string>,
) {
  const collectedEvents: AiStoryboardPreviewStreamEvent[] = [];
  const waiters = new Set<() => void>();
  let completed = false;
  let result = "";
  let failure: unknown;

  const notifyWaiters = () => {
    for (const resolve of waiters) resolve();
    waiters.clear();
  };
  void (async () => {
    try {
      while (true) {
        const next = await stream.next();
        if (next.done) {
          result = next.value;
          break;
        }
        collectedEvents.push(next.value);
        notifyWaiters();
      }
    } catch (error) {
      failure = error;
    } finally {
      completed = true;
      notifyWaiters();
    }
  })();

  return {
    async *events(): AsyncGenerator<AiStoryboardPreviewStreamEvent, string> {
      let index = 0;
      while (true) {
        while (index < collectedEvents.length) {
          yield collectedEvents[index++];
        }
        if (completed) {
          if (failure !== undefined) throw failure;
          return result;
        }
        await new Promise<void>((resolve) => waiters.add(resolve));
      }
    },
  };
}

function isAiStoryboardOutputTruncatedError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    (error as { code?: unknown }).code === "provider_output_truncated",
  );
}

function buildAiStoryboardShotContinuationPrompt(prompt: string, raw: string, continuationCount: number) {
  return [
    prompt,
    "",
    `【已输出分镜，第 ${continuationCount} 次续接】`,
    raw,
    "",
    "【续接规则】",
    "从上一段的断点继续输出。若最后一条分镜未完成，先补完该条剩余内容；否则从下一条分镜开始。",
    "不要重复已经完成的分镜，不要重写表头、代码块标记或前言，保持与上一段完全相同的输出结构。",
  ].join("\n");
}

async function* streamJsonText(input: {
  gateway: TextChatGatewayLike;
  model: string;
  prompt: string;
  projectId?: string | null;
  canvasProjectId?: string | null;
  createdByUserId?: string | null;
  responseFormat?: "json_object" | "text";
  maxTokens?: number;
  signal?: AbortSignal;
}) {
  if (input.gateway.streamJson) {
    for await (const delta of input.gateway.streamJson({
      model: input.model,
      prompt: input.prompt,
      projectId: input.projectId,
      canvasProjectId: input.canvasProjectId,
      createdByUserId: input.createdByUserId,
      responseFormat: input.responseFormat,
      maxTokens: input.maxTokens,
      signal: input.signal,
    })) {
      yield* splitTextForLiveEcho(delta);
    }
    return;
  }
  yield* splitTextForLiveEcho(await input.gateway.completeJson({
    model: input.model,
    prompt: input.prompt,
    projectId: input.projectId,
    canvasProjectId: input.canvasProjectId,
    createdByUserId: input.createdByUserId,
    responseFormat: input.responseFormat,
    maxTokens: input.maxTokens,
    signal: input.signal,
  }));
}

function* splitTextForLiveEcho(text: string) {
  const normalized = String(text ?? "");
  if (!normalized) {
    return;
  }
  for (let index = 0; index < normalized.length; index += LIVE_ECHO_CHUNK_SIZE) {
    yield normalized.slice(index, index + LIVE_ECHO_CHUNK_SIZE);
  }
}

function buildScriptPrompt(input: AiStoryboardPreviewInput) {
  const skillPrompt = String(input.packages.skillPrompt ?? "").trim();
  return [
    skillPrompt || input.packages.genrePrompt || "",
    skillPrompt ? "" : input.packages.emotionPrompt || "",
    skillPrompt ? "" : input.packages.tabooPrompt || "",
    input.scriptText,
  ].map((part) => part.trim()).filter(Boolean).join("\n\n");
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

function buildShotPrompt(
  scriptText: string,
  input: AiStoryboardPreviewInput,
  assets: {
    scenes: Record<string, unknown>[];
    characters: Record<string, unknown>[];
    props: Record<string, unknown>[];
  },
) {
  const basePrompt = buildAssetStagePrompt("shot", input.templates?.shotPrompt || "", scriptText);
  const assetCatalog = buildStoryboardCanonicalAssetCatalog(assets);
  return assetCatalog ? `${basePrompt}\n\n${assetCatalog}` : basePrompt;
}

function buildStoryboardCanonicalAssetCatalog(assets: {
  scenes: Record<string, unknown>[];
  characters: Record<string, unknown>[];
  props: Record<string, unknown>[];
}) {
  const lines = [
    formatCanonicalAssetCatalogLine("场景", assets.scenes, ["sceneName", "scene_name", "name"]),
    formatCanonicalAssetCatalogLine("角色", assets.characters, ["characterName", "character_name", "name"]),
    formatCanonicalAssetCatalogLine("道具", assets.props, ["propName", "prop_name", "name"]),
  ].filter(Boolean);
  if (!lines.length) return "";
  return [
    "【已生成资产名称清单（唯一命名来源）】",
    ...lines,
    "强制规则：分镜中的场景、角色、道具名称，以及视频资产对照表里的每一个 @名称，只能逐字使用以上清单中的完整名称；禁止缩写、改名、添加别名或自行创造新名称。未使用的资产不要引用。",
  ].join("\n");
}

function formatCanonicalAssetCatalogLine(label: string, records: Record<string, unknown>[], nameKeys: string[]) {
  const names = uniqueText(records.map((record) => firstText(record, nameKeys)));
  return names.length ? `${label}：${names.join("；")}` : "";
}

function buildAssetStagePrompt(stage: AssetPromptStage, template: string, scriptText: string) {
  const rendered = renderPromptTemplate(template, scriptText).trim();
  const outputOrder = stage === "shot"
    ? ""
    : "\n\n【输出顺序】\n从输出的第一个字符起，直接输出提取列表的表头或数据行；不要输出前言、推理、步骤标题（如“第一步”）、说明文字或 Markdown 分隔线。列表完成后，单独输出一行 [[DETAILS]]，再继续输出详细设定。";
  if (!rendered) {
    return `【剧本】\n${scriptText}${outputOrder}`;
  }
  const prompt = rendered.includes(scriptText)
    ? rendered
    : `${rendered}\n\n【剧本】\n${scriptText}`;
  return `${prompt}${outputOrder}`;
}

function normalizePreview(scriptText: string, promptResult: Record<string, unknown>) {
  const scenes = resolvePreviewScenes(promptResult).map(normalizeSceneRecord);
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

function resolvePreviewScenes(promptResult: Record<string, unknown>) {
  const directScenes = arrayOfRecords(promptResult.scenes);
  if (directScenes.length > 0) {
    return directScenes;
  }
  return inferSceneRecordsFromSegments(promptResult);
}

function inferSceneRecordsFromSegments(promptResult: Record<string, unknown>) {
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  arrayOfRecords(promptResult.segments).forEach((segment, segmentIndex) => {
    const sceneName = resolveSegmentSceneName(segment, segmentIndex);
    const sceneDescription = buildSceneDisplayDescription(objectRecord(segment.scene_analysis));
    const sceneImagePrompt = buildStoryboardAssetTableSection(objectRecord(segment.asset_table));
    const normalizedName = text(sceneName).trim();
    if (!normalizedName || seen.has(normalizedName)) {
      return;
    }
    seen.add(normalizedName);
    rows.push({
      sceneName: normalizedName,
      sceneDescription,
      sceneImagePrompt: text(sceneImagePrompt).trim() || sceneDescription,
    });
  });
  return rows;
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
  const videoPrompt = text(storyboard.videoPrompt);
  const sceneRecords = uniqueRecords([
    ...resolveAssetsByRefs([storyboard.sceneId, storyboard.sceneName, storyboard.scene], indexes.sceneIndex),
    ...resolveAssetsByRefs(arrayOfRecords(storyboard.scenes), indexes.sceneIndex),
    ...resolveAssetsByRefs(extractStoryboardPromptAssetMentions(videoPrompt, "视频场景对照表"), indexes.sceneIndex),
  ]);
  const characterRecords = uniqueRecords([
    ...resolveAssetsByRefs([storyboard.characterIds, storyboard.characters, storyboard.characterNames], indexes.characterIndex),
    ...resolveAssetsByRefs(arrayOfRecords(storyboard.characterRefs), indexes.characterIndex),
    ...resolveAssetsByRefs(extractStoryboardPromptAssetMentions(videoPrompt, "视频角色对照表"), indexes.characterIndex),
  ]);
  const propRecords = uniqueRecords([
    ...resolveAssetsByRefs([storyboard.propIds, storyboard.props, storyboard.propNames], indexes.propIndex),
    ...resolveAssetsByRefs(arrayOfRecords(storyboard.propRefs), indexes.propIndex),
    ...resolveAssetsByRefs(extractStoryboardPromptAssetMentions(videoPrompt, "视频道具对照表"), indexes.propIndex),
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
  const markedTableOffset = prompt.indexOf("【资产对照表】");
  const legacyTableOffset = prompt.search(/(?:^|\r?\n)\s*(?:资产对照表\s*[:：]?|视频(?:场景|角色|道具)对照表\s*[:：])/u);
  const tableOffset = [markedTableOffset, legacyTableOffset].filter((offset) => offset >= 0).sort((left, right) => left - right)[0] ?? -1;
  const basePrompt = (tableOffset >= 0 ? prompt.slice(0, tableOffset) : prompt).trim();
  if (!basePrompt) {
    return assetReferenceText;
  }
  return `${basePrompt}\n\n${assetReferenceText}`;
}

function extractStoryboardPromptAssetMentions(prompt: string, label: string) {
  const line = prompt.replace(/<br\s*\/?>/giu, "\n")
    .split(/\r?\n/u)
    .find((item) => item.includes(label));
  if (!line) return [];
  const value = line.slice(line.indexOf(label) + label.length).replace(/^\s*[:：]\s*/u, "");
  return value.split(/[；;]/u).flatMap((entry) => {
    const match = entry.match(/(?:【)?@(.+?)(?:】)?\s*$/u);
    const name = text(match?.[1]).replace(/[，,。]+$/u, "").trim();
    return name ? [name] : [];
  });
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
      const record = ref as Record<string, unknown>;
      resolved.push(resolveIndexedAssetRecord(record, index) ?? record);
      continue;
    }
    const indexed = resolveIndexedAssetRecord(ref, index);
    if (indexed) resolved.push(indexed);
    else if (normalizeAssetKey(ref)) resolved.push({ name: text(ref) });
  }
  return resolved;
}

function resolveIndexedAssetRecord(value: unknown, index: Map<string, Record<string, unknown>>) {
  const candidates = value && typeof value === "object" && !Array.isArray(value)
    ? ["sceneId", "characterId", "propId", "id", "sceneName", "characterName", "propName", "name"]
        .map((key) => (value as Record<string, unknown>)[key])
    : [value];
  for (const candidate of candidates) {
    for (const key of normalizeAssetKeyVariants(candidate)) {
      const exact = index.get(key);
      if (exact) return exact;
      if (key.length < 2) continue;
      const fuzzy = new Set<Record<string, unknown>>();
      for (const [indexedKey, record] of index.entries()) {
        if (indexedKey.length >= 2 && (indexedKey.includes(key) || key.includes(indexedKey))) {
          fuzzy.add(record);
        }
      }
      if (fuzzy.size === 1) return [...fuzzy][0];
    }
  }
  return null;
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
      for (const normalized of normalizeAssetKeyVariants(record[key])) {
        if (!index.has(normalized)) {
          index.set(normalized, record);
        }
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
  return text(value).trim().replace(/^@/u, "").replace(/\s+/gu, "").toLowerCase();
}

function normalizeAssetKeyVariants(value: unknown) {
  const raw = text(value).trim().replace(/^@/u, "");
  if (!raw) return [];
  const parentheticalNames = [...raw.matchAll(/[（(]([^）)]+)[）)]/gu)].map((match) => match[1]);
  const variants = [raw, raw.replace(/[（(][^）)]*[）)]/gu, ""), ...parentheticalNames];
  return uniqueText(variants.map(normalizeAssetKey).filter(Boolean));
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
  const standaloneAssetTableRows = parseStandaloneAssetMarkdownTableRecords(raw, key);
  if (standaloneAssetTableRows.length) {
    return standaloneAssetTableRows;
  }
  const labeledAssetRows = parseLabeledAssetMarkdownRecords(raw, key);
  if (labeledAssetRows.length) {
    return labeledAssetRows;
  }
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

function resolveAssetStageRecords(
  primaryRaw: string,
  allAssetStageOutput: string[],
  key: "scenes" | "characters" | "props",
) {
  const primaryRecords = primaryRaw.trim() ? parseArrayOrObject(primaryRaw, key) : [];
  if (primaryRecords.length) {
    return primaryRecords;
  }
  for (const raw of allAssetStageOutput) {
    if (!raw.trim() || raw === primaryRaw) {
      continue;
    }
    const records = parseArrayOrObject(raw, key);
    const namedRecords = records.filter((record) => hasAssetStageRecordName(record, key));
    if (namedRecords.length) {
      return namedRecords;
    }
  }
  return [];
}

function hasAssetStageRecordName(record: Record<string, unknown>, key: "scenes" | "characters" | "props") {
  const nameKeys = key === "scenes"
    ? ["sceneName", "scene_name", "name", "location", "scene"]
    : key === "characters"
      ? ["characterName", "character_name", "name", "role", "character"]
      : ["propName", "prop_name", "name", "prop"];
  return Boolean(firstText(record, nameKeys));
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

function parseStandaloneAssetMarkdownTableRecords(raw: string, tableKey: string): Record<string, unknown>[] {
  const config = tableKey === "scenes"
    ? { label: "场景名称", descriptionLabels: ["场景描述"], promptLabels: ["场景提示词", "场景图片提示词", "图片提示词"], nameKey: "sceneName", descriptionKey: "sceneDescription", promptKey: "sceneImagePrompt" }
    : tableKey === "characters"
      ? { label: "角色名称", descriptionLabels: ["角色描述"], promptLabels: ["角色提示词", "角色图片提示词", "图片提示词"], nameKey: "characterName", descriptionKey: "characterDescription", promptKey: "characterImagePrompt" }
      : tableKey === "props"
        ? { label: "道具名称", descriptionLabels: ["道具描述"], promptLabels: ["道具提示词", "道具图片提示词", "图片提示词"], nameKey: "propName", descriptionKey: "propDescription", promptKey: "propImagePrompt" }
        : null;
  if (!config) {
    return [];
  }
  const table = parseMarkdownTable(extractMarkdownBody(raw));
  if (!table) {
    return [];
  }
  const header = table.header.map((cell) => text(cell).replace(/\s+/g, ""));
  const nameIndex = header.findIndex((cell) => cell.includes(config.label));
  const descriptionIndex = header.findIndex((cell) => config.descriptionLabels.some((label) => cell.includes(label)));
  const promptIndex = header.findIndex((cell) => config.promptLabels.some((label) => cell.includes(label)));
  if (nameIndex < 0 || (descriptionIndex < 0 && promptIndex < 0)) {
    return [];
  }
  return table.rows
    .map((cells) => {
      const description = compactStoryboardTableCell(cells[descriptionIndex >= 0 ? descriptionIndex : promptIndex]);
      const prompt = compactStoryboardTableCell(cells[promptIndex >= 0 ? promptIndex : descriptionIndex]);
      return {
        [config.nameKey]: compactStoryboardTableCell(cells[nameIndex]),
        [config.descriptionKey]: description || prompt,
        [config.promptKey]: prompt || description,
      };
    })
    .filter((row) => text(row[config.nameKey]).trim());
}

function parseLabeledAssetMarkdownRecords(raw: string, tableKey: string): Record<string, unknown>[] {
  const config = tableKey === "scenes"
    ? { labels: ["场景名称"], nameKey: "sceneName", descriptionKey: "sceneDescription", promptKey: "sceneImagePrompt" }
    : tableKey === "characters"
      ? { labels: ["角色名称"], nameKey: "characterName", descriptionKey: "characterDescription", promptKey: "characterImagePrompt" }
      : tableKey === "props"
        ? { labels: ["道具名称"], nameKey: "propName", descriptionKey: "propDescription", promptKey: "propImagePrompt" }
        : null;
  if (!config) {
    return [];
  }
  const lines = extractMarkdownBody(raw).split("\n");
  const records: Record<string, unknown>[] = [];
  let name = "";
  let block: string[] = [];
  const flush = () => {
    const content = compactLabeledAssetMarkdownBlock(block);
    if (name && content) {
      records.push({
        [config.nameKey]: name,
        [config.descriptionKey]: content,
        [config.promptKey]: content,
      });
    }
    name = "";
    block = [];
  };
  for (const rawLine of lines) {
    const normalizedLine = normalizeLabeledAssetMarkdownLine(rawLine);
    const marker = matchLabeledAssetMarkdownHeading(normalizedLine, config.labels);
    if (marker) {
      flush();
      name = text(marker[1]).replace(/<br\s*\/?>(?:[\s\S]*)$/i, "").trim();
      block.push(rawLine);
      continue;
    }
    if (name && (isLabeledAssetMarkdownNumberHeading(rawLine) || isLabeledProjectMarkdownHeading(normalizedLine))) {
      flush();
      continue;
    }
    if (name) {
      block.push(rawLine);
    }
  }
  flush();
  return records;
}

function matchLabeledAssetMarkdownHeading(line: string, labels: string[]) {
  const escapedLabels = labels
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((left, right) => right.length - left.length)
    .join("|");
  return line.match(new RegExp(`^(?:(?:${escapedLabels})\\s*[:：]|(?:【|\\[)\\s*(?:${escapedLabels})\\s*(?:】|\\]))\\s*(.+)$`));
}

function isLabeledProjectMarkdownHeading(line: string) {
  return /^(?:(?:【|\[)\s*)?(?:角色名称|场景名称|道具名称|分镜\s*[一二三四五六七八九十百千两零〇\d]+)(?:\s*(?:】|\]))?(?:\s*[:：].*)?$/u.test(line);
}

function normalizeLabeledAssetMarkdownLine(line: string) {
  return text(line)
    .trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/\*\*|__/g, "")
    .replace(/^(?:[-*+]\s*|\d+[.)、]\s*)/, "")
    .trim();
}

function compactLabeledAssetMarkdownBlock(lines: string[]) {
  return lines
    .map(normalizeLabeledAssetMarkdownLine)
    .filter(Boolean)
    .join("\n");
}

function isLabeledAssetMarkdownNumberHeading(line: string) {
  return /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*\d+[.)、]\s*.+?(?:\*\*|__)?\s*$/.test(text(line));
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
  const storyboardTableRows = parsePlainStoryboardMarkdownTableRecords(raw);
  if (storyboardTableRows.length) {
    return { storyboards: storyboardTableRows };
  }
  const storyboardBlockRows = parseLabeledStoryboardMarkdownBlocks(raw);
  if (storyboardBlockRows.length) {
    return { storyboards: storyboardBlockRows };
  }
  const storyboardRows = parseStoryboardMarkdownRecords(raw);
  return storyboardRows.length ? { storyboards: storyboardRows } : null;
}

function parsePlainStoryboardMarkdownTableRecords(raw: string) {
  const table = parseMarkdownTable(extractMarkdownBody(raw));
  if (!table) {
    return [];
  }
  const header = table.header.map((cell) => text(cell).replace(/\s+/g, ""));
  const findIndex = (patterns: string[]) => header.findIndex((cell) => patterns.some((pattern) => cell.includes(pattern)));
  const plotIndex = findIndex(["分镜剧情"]);
  const dialogueIndex = findIndex(["对话/旁白", "对话旁白"]);
  const imagePromptIndex = findIndex(["静态图片提示词"]);
  const videoPromptIndex = findIndex(["动态视频提示词"]);
  if ([plotIndex, dialogueIndex, imagePromptIndex, videoPromptIndex].some((index) => index < 0)) {
    return [];
  }
  return table.rows
    .map((cells, index) => {
      const plot = compactStoryboardTableCell(cells[plotIndex]);
      const shotNo = plot.match(/分镜\s*([一二三四五六七八九十百千两零〇\d]+)/)?.[1] ?? String(index + 1);
      return {
        shotNo,
        plot,
        dialogue: compactStoryboardTableCell(cells[dialogueIndex]),
        imagePrompt: compactStoryboardTableCell(cells[imagePromptIndex]),
        videoPrompt: compactStoryboardTableCell(cells[videoPromptIndex]),
      };
    })
    .filter((row) => row.plot || row.dialogue || row.imagePrompt || row.videoPrompt);
}

function parseLabeledStoryboardMarkdownBlocks(raw: string) {
  const lines = extractMarkdownBody(raw).split("\n");
  const records: Record<string, unknown>[] = [];
  let shotNo = "";
  let block: string[] = [];
  const flush = () => {
    const content = compactLabeledAssetMarkdownBlock(block);
    if (shotNo && content) {
      records.push({ shotNo, plot: content, videoPrompt: content });
    }
    shotNo = "";
    block = [];
  };
  for (const rawLine of lines) {
    const normalizedLine = normalizeLabeledAssetMarkdownLine(rawLine);
    const marker = normalizedLine.match(/^(?:【\s*分镜\s*([一二三四五六七八九十百千两零〇\d]+)\s*】|分镜\s*([一二三四五六七八九十百千两零〇\d]+))(?:\s*[:：-]?\s*(.*))?$/u);
    if (marker) {
      flush();
      shotNo = marker[1] || marker[2] || "";
      const inlineContent = text(marker[3]).trim();
      if (inlineContent) {
        block.push(inlineContent);
      }
      continue;
    }
    if (shotNo) {
      block.push(rawLine);
    }
  }
  flush();
  return records;
}

function compactStoryboardTableCell(value: unknown) {
  return text(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
