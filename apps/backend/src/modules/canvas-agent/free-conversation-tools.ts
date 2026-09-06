import { randomUUID } from "node:crypto";
import type { SqlDatabase } from "../shared/db/sql.ts";
import type { CanvasAgentContextService } from "./canvas-agent-context.service.ts";
import { CanvasAgentToolRegistry, type CanvasAgentJsonSchema, type CanvasAgentToolExecutionContext } from "./canvas-agent-tool.registry.ts";

const skills = {
  "character-design": {
    title: "角色设计",
    instructions: "输入：角色用途、人物特征、画风及已有参考。先理解角色用途及已有参考，缺少真正阻塞的信息时用 creative.ask。默认：复用已知角色和参数；低影响细节由你补全并在设定中说明，未指定额外视角时只设计一个主要造型。流程：用 creative.document 保存可继续修改的角色设定（外貌、服饰、性格、画风、一致性约束）；多步创作用 creative.plan。用户要求图片时，使用其已授权参考和模型生成；文字设定无需生成媒体。输出：角色设定文档，以及用户要求且实际完成的角色图片。范围：后续修改沿用同一人物身份，仅改变用户指定部分，不自行扩展为系列或视频。",
  },
  "scene-design": {
    title: "场景设计",
    instructions: "输入：场景用途、地点或时代、氛围、画风和已授权参考。默认：沿用会话已知设定，只设计一个主场景，细节围绕用途补全。若缺失画风或参考选择会显著影响付费生成，先用 creative.ask 提一个关键问题；已有答案或用户授权你决定时不重复询问。流程：整理空间布局、前中后景、光线、材质、色彩及不可改变的地标，用 creative.document 保存场景设定；涉及多张或多个步骤时用 creative.plan，用户要求图片才调用 generation.create。输出：可复用场景设定、提示词，以及已实际完成的所需场景图片。范围：纯文字需求只交付文档，不擅自添加人物、扩展系列或生成视频。",
  },
  "series-images": {
    title: "系列图片",
    instructions: "输入：系列主题、张数、共同人物、风格及参考。明确系列张数、共同人物和风格，使用 creative.plan 记录步骤，creative.document 保存共同设定和逐张提示词。默认：沿用既有人物身份、画风和模型参数，各张只改变本张内容；未明确付费张数时用 creative.ask 确认，不自行扩大数量。按用户目标逐步调用 generation.create，等待实际成功后才更新完成状态。用 creative.artifacts 查到真实结果、creative.reference 获取授权引用，保持角色一致。输出：共同创作简报、逐张提示词及每张的真实结果或失败状态。范围：用户只要求方案时保持文字；用户只修改某一张时只重新生成该张，保留其余结果。",
  },
  "poster-design": {
    title: "海报设计",
    instructions: "输入：海报用途、受众、主标题和必要文案、品牌参考、画风与画幅。默认：先做一个主视觉方案，复用已知品牌色和生成参数；非关键排版细节由你决定。用途、必须准确的标题或品牌参考缺失且影响交付时，用 creative.ask 提一个关键问题，不编造活动日期、价格或品牌事实。流程：用 creative.document 保存信息层级、构图、配色、留白区域、最终文案和提示词；多步骤用 creative.plan；用户要求图片才按授权调用 generation.create，检查真实结果并说明文字渲染的实际缺陷。输出：海报方案、可编辑文案及用户要求的已完成主视觉。范围：不额外生成多个付费版本，不承诺未验证的文字精度或可编辑分层文件。",
  },
  "story-development": {
    title: "故事创作",
    instructions: "输入：故事主题、受众、体裁、人物、篇幅和已有设定。默认：沿用已有世界观和人物关系，从简洁梗概推进到用户要求的详细程度；未指定细节时给出合理创作选择，不为文字构思强制问卷。缺少会改变核心方向的要求时用 creative.ask 提一个关键问题。流程：多阶段用 creative.plan 组织主题、人物动机、冲突、情节转折和结局；用 creative.document 保存故事及人物一致性简报，修改时沿用 documentId。输出：用户所需的梗概、大纲或正文，以及必要的人物设定。范围：故事创作默认只输出文字，选中技能不授权生成插图、配音或视频；不擅自改写已确认的人物事实。",
  },
  "storyboard": {
    title: "分镜设计",
    instructions: "输入：剧本或情节、镜头用途、目标时长或节奏、人物场景设定和参考。默认：先交付文字分镜，复用既有人物和场景；未指定镜头数量时按叙事需要提出文字方案，不把提议数量当作付费授权。缺少剧本核心内容或将影响付费生成的画风、参考时用 creative.ask 提一个关键问题。流程：用 creative.plan 拆分情节和镜头，用 creative.document 保存编号、景别、构图、动作、运镜、对白、时长及衔接，并保留人物一致性简报。明确要求分镜图后才按授权逐张生成，引用只经 creative.artifacts 和 creative.reference 或已有 fileGrantId 获取。输出：分镜表及明确要求且实际完成的镜头图。范围：不因完成分镜自动生成视频，不改动无关镜头或夸大剪辑合成能力。",
  },
  "image-to-video": {
    title: "图片转视频",
    instructions: "输入：用户选中的源图片、运动意图、时长和画幅。先识别用户选中的图片；若来自本会话已生成结果，用 creative.artifacts 定位，再用 creative.reference 获取 fileGrantId。用户上传图片则使用已有授权。默认：保持源图主体身份与构图，采用与用户目标相符的简洁运动，复用已知视频模型参数；不得捏造模型支持的时长。图片未选定或必要运动要求缺失时用 creative.ask 提一个关键问题。必要时收集时长、运动和画幅，遵循当前视频模型参数。先用 creative.document 写镜头描述，多步骤用 creative.plan；用户明确要求视频后，再调用 generation.create(kind=video, fileGrantIds=[选中图片的授权])。输出：镜头描述和真实完成的视频或明确失败状态。范围：只要运镜方案时保持文字；不重新生图，不把所有历史附件都当作参考。",
  },
  "short-video": {
    title: "短视频创作",
    instructions: "输入：视频目的、受众、主题或脚本、时长、画幅及已有素材。默认：复用已知模型参数和素材，以简洁叙事覆盖用户目标，先写脚本；不自行增加付费镜头数量。缺少影响付费提交的风格、素材选择或范围时用 creative.ask 提一个关键问题。流程：用 creative.plan 记录脚本、分镜和用户要求的生成步骤，用 creative.document 保存开头、内容推进、结尾、逐镜描述以及人物一致性简报。需要已有结果作参考时用 creative.artifacts 定位、creative.reference 授权，再按实际模型能力调用 generation.create，等待每步真实结果。输出：脚本、分镜及明确要求且实际完成的视频素材；工具无法剪辑合成时明确交付的是分段素材。范围：用户只要求脚本或方案则保持文字，不自动追加配音、配乐、字幕、合成或失败重试，不承诺工具不具备的能力。",
  },
} as const;

const toolIds = new Set(["skill.load", "creative.plan", "creative.ask", "creative.document", "creative.read", "creative.artifacts", "creative.reference"]);
export const isFreeConversationTool = (id: string) => toolIds.has(id);

export function freeConversationSkillInstructions(text: string, savedSkillId?: unknown) {
  const explicit = /^\/(character-design|scene-design|series-images|poster-design|story-development|storyboard|image-to-video|short-video)(?:\s|$)/.exec(text)?.[1];
  const id = explicit ?? (typeof savedSkillId === "string" ? savedSkillId : "");
  if (!Object.hasOwn(skills, id)) return "";
  const skill = skills[id as keyof typeof skills];
  return `Built-in skill ${id} (${skill.title}): ${skill.instructions}`;
}

export const freeConversationAgentInstructions = `You are a creative agent inside a free conversation. Help the user complete their current creative goal using text, images, video or audio. You cannot read or modify the canvas. Use creative.read and context.creative for durable goals, constraints and document versions. Follow the latest user correction while retaining relevant earlier requirements. A submitted generation is not a completed result: after the runtime resumes, check its outcome and continue any unfinished requested steps. Never regenerate completed work unless the user asks, or silently retry a failed paid generation.
Available built-in skills (load the applicable skill on demand using skill.load): character-design (角色设计), scene-design (场景设计), series-images (系列图片), poster-design (海报设计), story-development (故事创作), storyboard (分镜设计), image-to-video (图片转视频), short-video (短视频创作). A leading /skill-id explicitly selects that skill. For a simple request, execute directly; use creative.plan for multi-step work. Keep the plan accurate as results arrive. Use creative.document for reusable briefs, scripts and prompts; edits pass the same documentId to create a new version. Keep a compact character-consistency brief in creative.document for recurring characters, recording identity, appearance, clothing, style and authorized references; reuse it for subsequent images and shots. When the latest user message includes creativeDocumentId, it identifies the selected document to edit; resolve it against this conversation's documents instead of guessing from its title. Use creative.ask only for a blocking creative choice; execution pauses until the user replies. Before paid generation, ask one concise conditional question if a missing consequential choice (such as visual style, which reference to use, or generation scope) cannot be resolved from the conversation. Reuse known answers, selected references, models and parameters. Choose reasonable low-impact defaults and state them briefly; when the user says "you decide" or "你决定", honor that delegation without asking the same preference again. Delegation cannot invent a required reference, capability or spending approval. A reply is not permission to bypass media generation approval. generationPermissionMode independently controls spending approval: clarification, skill selection and delegated creative choices never change or bypass it. Do not ask again about information already provided. Requests for text, scripts, briefs or prompts stay text-only unless the user actually requests media.
If the user interjects after a generation has been submitted, record the correction for the next requested revision and explain that the submitted external task cannot be changed. Do not claim it was updated, automatically create an extra generation, or silently retry a paid task. Wait for the actual result and apply the correction only to a user-requested revision under the existing approval policy. Report budget, credits, prices or spending limits only from trustworthy information returned by existing authorized tools; if unavailable, say it is unavailable. Never invent estimates, balances, budget controls or guarantees.
Use creative.artifacts to find completed media in this conversation and creative.reference to obtain a fileGrantId for a chosen result. Never invent storage IDs or grants. Pass only the intended references to generation.create, use kind image/video/audio and never targetNodeId. Honor preferredGenerationKind when explicitly provided, preferredModels and preferredGenerationParameters. Only create media to fulfil an actual user request, never from a selected skill, attachment or previous completed request alone. Model questions or switches do not authorize generation. Text-model switches require the user to use the conversation's model selector. Return final when the requested work is complete or explain a concrete limitation; do not promise an unexecuted tool call.`;

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const textSchema: CanvasAgentJsonSchema = { type: "string", minLength: 1 };

function boundedText(value: unknown, max: number) {
  if (typeof value !== "string" || !value.trim()) throw new Error("canvas_agent_creative_input_invalid");
  if (value.length > max) throw new Error("canvas_agent_creative_input_limit");
  return value.trim();
}

function boundedStrings(value: unknown, maxItems: number, maxChars: number) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("canvas_agent_creative_input_invalid");
  if (value.length > maxItems) throw new Error("canvas_agent_creative_input_limit");
  return value.map(item => boundedText(item, maxChars));
}

function assertScope(context: CanvasAgentToolExecutionContext) {
  if (context.capabilityProfile !== "media_generation_only") throw new Error("canvas_agent_tool_not_allowed");
  if (!context.actor.capabilities.has("canvas:run")) throw new Error("canvas_agent_forbidden");
}

export function registerFreeConversationTools(registry: CanvasAgentToolRegistry, deps: { db: SqlDatabase; context?: CanvasAgentContextService }) {
  const params = (scope: CanvasAgentToolExecutionContext) => [scope.conversationId, scope.canvasId, scope.actor.ownerUserId, scope.actor.actorTeamMemberId ?? null];
  const read = async (scope: CanvasAgentToolExecutionContext) => {
    assertScope(scope);
    const result = await deps.db.query<{ creative: unknown }>(`
      SELECT summary_json->'creative' AS creative FROM canvas_agent_conversations
      WHERE id=$1 AND canvas_id=$2 AND owner_user_id=$3
        AND actor_team_member_id IS NOT DISTINCT FROM $4 AND deleted_at IS NULL`, params(scope));
    if (!result.rows[0]) throw new Error("canvas_agent_conversation_not_found");
    return record(result.rows[0].creative);
  };
  const update = async (scope: CanvasAgentToolExecutionContext, change: (state: RecordValue) => { state: RecordValue; output: RecordValue }) => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const previous = await read(scope);
      const next = change(previous);
      const serialized = JSON.stringify({ ...next.state, revision: Number(previous.revision ?? 0) + 1 });
      if (serialized.length > 120_000) throw new Error("canvas_agent_creative_state_limit");
      const result = await deps.db.query<{ id: string }>(`
        UPDATE canvas_agent_conversations
        SET summary_json=jsonb_set(COALESCE(summary_json,'{}'::jsonb),'{creative}',$5::jsonb), updated_at=now()
        WHERE id=$1 AND canvas_id=$2 AND owner_user_id=$3
          AND actor_team_member_id IS NOT DISTINCT FROM $4 AND deleted_at IS NULL
          AND COALESCE(summary_json->'creative','{}'::jsonb)=$6::jsonb
        RETURNING id`, [...params(scope), serialized, JSON.stringify(previous)]);
      if (result.rows[0]) return { status: "succeeded" as const, output: next.output };
    }
    throw new Error("canvas_agent_creative_state_conflict");
  };
  const add = (id: string, description: string, properties: Record<string, CanvasAgentJsonSchema>, required: string[], write: boolean, execute: Parameters<CanvasAgentToolRegistry["register"]>[0]["execute"]) => registry.register({
    id, description, requiredCapability: "canvas:run", effect: write ? "memory_write" : "read",
    inputSchema: { type: "object", additionalProperties: false, properties, required }, execute,
  });

  add("skill.load", "Load one trusted built-in creative skill on demand.", { skillId: { type: "string", enum: Object.keys(skills) } }, ["skillId"], true, async (input, scope) => {
    const skillId = String(input.skillId);
    const skill = skills[skillId as keyof typeof skills];
    return update(scope, state => ({ state: { ...state, skillId }, output: { creative: { type: "skill", skillId, title: skill.title }, instructions: freeConversationSkillInstructions(`/${skillId}`) } }));
  });
  add("creative.read", "Read this conversation's durable creative state and latest text documents.", {}, [], false, async (_input, scope) => ({ status: "succeeded", output: { state: await read(scope) } }));
  add("creative.plan", "Save or update the current creative goal, constraints and progress; only mark verified results completed.", {
    title: textSchema, goal: textSchema, constraints: { type: "array", items: textSchema },
    steps: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "title", "status"], properties: { id: textSchema, title: textSchema, status: { type: "string", enum: ["pending", "running", "completed"] } } } },
  }, ["title", "goal", "steps"], true, async (input, scope) => {
    const steps = input.steps as RecordValue[];
    if (!steps.length || steps.length > 12) throw new Error("canvas_agent_creative_input_limit");
    const plan = { type: "plan", title: boundedText(input.title, 160), goal: boundedText(input.goal, 2000), constraints: boundedStrings(input.constraints, 16, 500), steps: steps.map(step => ({ id: boundedText(step.id, 80), title: boundedText(step.title, 240), status: step.status })) };
    if (new Set(plan.steps.map(step => step.id)).size !== steps.length) throw new Error("canvas_agent_creative_input_invalid");
    return update(scope, state => ({ state: { ...state, plan }, output: { creative: plan } }));
  });
  add("creative.ask", "Ask one blocking creative question, then pause for the user's answer. This does not approve generation spending.", { question: textSchema, options: { type: "array", items: textSchema } }, ["question"], false, async (input, scope) => {
    await read(scope);
    return { status: "succeeded", output: { creative: { type: "question", id: scope.agentStepId, question: boundedText(input.question, 2000), options: boundedStrings(input.options, 8, 240) } } };
  });
  add("creative.document", "Create a reusable text artifact or revise an existing documentId. Previous versions remain in the conversation.", { title: textSchema, content: textSchema, documentId: textSchema }, ["title", "content"], true, async (input, scope) => {
    const title = boundedText(input.title, 160);
    const content = boundedText(input.content, 20_000);
    const documentId = input.documentId === undefined ? randomUUID() : boundedText(input.documentId, 80);
    return update(scope, state => {
      const documents = Array.isArray(state.documents) ? state.documents.map(record) : [];
      const replay = documents.find(doc => doc.sourceStepId === scope.agentStepId);
      if (replay) {
        const { sourceStepId: _source, ...creative } = replay;
        return { state, output: { creative } };
      }
      const index = documents.findIndex(doc => doc.documentId === documentId);
      if (input.documentId !== undefined && index < 0) throw new Error("canvas_agent_creative_document_not_found");
      if (index < 0 && documents.length >= 12) throw new Error("canvas_agent_creative_document_limit");
      const creative = { type: "document", documentId, title, content, version: index < 0 ? 1 : Number(documents[index].version) + 1 };
      const saved = { ...creative, sourceStepId: scope.agentStepId };
      if (index < 0) documents.push(saved); else documents[index] = saved;
      return { state: { ...state, documents }, output: { creative } };
    });
  });
}
