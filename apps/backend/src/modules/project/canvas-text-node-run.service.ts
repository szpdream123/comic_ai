import { createHash } from "node:crypto";

import type { TextChatGatewayLike } from "../ai-storyboard/ai-storyboard-preview.service.ts";
import type { CanvasActorScope } from "../identity/canvas-actor-scope.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import {
  createPromptMarketplaceService,
  PromptMarketplaceError,
} from "../prompt-marketplace/prompt-marketplace.service.ts";
import {
  completeCanvasTextNodeRun,
  createCanvasNodeRun,
  failCanvasTextNodeRun,
  type CanvasNode,
  type CanvasRecord,
} from "./creator-canvas-record.service.ts";

export const CANVAS_TEXT_NODE_INPUT_MAX_LENGTH = 50_000;
export const CANVAS_TEXT_NODE_OUTPUT_MAX_LENGTH = 50_000;
const CANVAS_TEXT_SKILL_CATEGORIES = [
  "script",
  "shot",
  "prop_extract",
  "character_extract",
  "scene_extract",
  "image_style",
  "storyboard",
  "other",
] as const;
type CanvasTextSkillCategory = (typeof CANVAS_TEXT_SKILL_CATEGORIES)[number];

export interface CanvasTextPromptSkill {
  id: string;
  category: string;
  title: string;
  content: string;
  priceCredits: number;
  official: boolean;
  ownerUserId: string | null;
}

export interface CanvasTextBillingReceipt {
  amount: number;
  modelCreditCost: number;
  skillCreditCost: number;
  mode: "reservation" | "team_member" | "batch_reservation";
  reservationId?: string | null;
  allocationKey?: string | null;
  sourceId?: string | null;
}

export interface CanvasTextNodeBilling {
  modelCreditCost: number;
  reserve(input: {
    runId: string;
    skill: CanvasTextPromptSkill | null;
    now: Date;
  }): Promise<CanvasTextBillingReceipt | null>;
  consume(input: { runId: string; receipt: CanvasTextBillingReceipt; now: Date }): Promise<void>;
  release(input: {
    runId: string;
    receipt: CanvasTextBillingReceipt;
    failureCode: string;
    now: Date;
  }): Promise<void>;
  grantSkillAuthor(input: { runId: string; skill: CanvasTextPromptSkill; now: Date }): Promise<void>;
}

export class CanvasTextNodeRunError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message = code,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "CanvasTextNodeRunError";
  }
}

interface StoredCanvasTextRun {
  id: string;
  runNo: number;
  status: string;
  nodeKey: string;
  modelCode: string | null;
  inputSnapshot: Record<string, unknown>;
  outputSnapshot: Record<string, unknown>;
  artifact: {
    id: string;
    artifactKind: string;
    metadata: Record<string, unknown>;
  } | null;
}

export async function runCanvasTextNode(
  db: SqlDatabase,
  input: {
    canvas: CanvasRecord;
    nodeKey: string;
    idempotencyKey: string;
    body: Record<string, unknown>;
    userId: string;
    actorScope?: CanvasActorScope;
    gateway: TextChatGatewayLike;
    billing?: CanvasTextNodeBilling;
    now: Date;
  },
) {
  const node = input.canvas.document.nodes.find((item) => item.id === input.nodeKey);
  if (!node) {
    throw new CanvasTextNodeRunError("canvas_node_not_found", 404, "canvas node not found");
  }
  if (!isCanvasAiTextNode(node)) {
    throw new CanvasTextNodeRunError(
      "canvas_text_node_invalid",
      400,
      "Only an AI text or AI Markdown node can run a text task",
    );
  }

  const source = collectCanvasTextInput(input.canvas, node, input.body);
  if (!source.text) {
    throw new CanvasTextNodeRunError(
      "canvas_text_input_required",
      400,
      "AI text generation requires text input",
    );
  }
  if (source.text.length > CANVAS_TEXT_NODE_INPUT_MAX_LENGTH) {
    throw new CanvasTextNodeRunError(
      "canvas_text_input_too_long",
      400,
      `AI text input cannot exceed ${CANVAS_TEXT_NODE_INPUT_MAX_LENGTH} characters`,
      { maxLength: CANVAS_TEXT_NODE_INPUT_MAX_LENGTH },
    );
  }

  const format = node.type === "ai-markdown" ? "markdown" : "text";
  const modelCode = readTrimmedString(input.body.model ?? input.body.modelCode ?? node.data?.modelCode)
    || "deepseek-chat";
  if (modelCode.length > 100) {
    throw new CanvasTextNodeRunError("canvas_text_model_invalid", 400, "AI text model code is invalid");
  }
  const promptSkill = readCanvasTextPromptSkill(input.body, node);
  const requestHash = sha256(JSON.stringify({
    format,
    modelCode,
    text: source.text,
    upstreamNodeIds: source.upstreamNodeIds,
    promptSkill,
  }));
  const storedIdempotencyKey = input.actorScope?.principalKey
    ? `${input.actorScope.principalKey}:${input.idempotencyKey}`
    : input.idempotencyKey;
  const existing = await findStoredCanvasTextRun(db, {
    canvasProjectId: input.canvas.canvasProjectId,
    idempotencyKey: storedIdempotencyKey,
  });
  if (existing) {
    const existingHash = readTrimmedString(existing.inputSnapshot.requestHash);
    if (existing.nodeKey !== input.nodeKey || (existingHash && existingHash !== requestHash)) {
      throw new CanvasTextNodeRunError(
        "canvas_text_idempotency_conflict",
        409,
        "Idempotency key was already used with different AI text input",
      );
    }
    return serializeStoredRun(existing, input.canvas.canvasProjectId, true);
  }

  let resolvedSkill: CanvasTextPromptSkill | null = null;
  let skillTransactionOpen = false;
  let run: Awaited<ReturnType<typeof createCanvasNodeRun>>;
  try {
    if (promptSkill) {
      await db.query("BEGIN");
      skillTransactionOpen = true;
      const marketplace = createPromptMarketplaceService({ db });
      resolvedSkill = await marketplace.resolveWorkflowPromptSkill({
        userId: input.userId,
        itemId: promptSkill.id,
        category: promptSkill.category,
        now: input.now,
      });
      const skillText = buildCanvasTextSkillInstructions(resolvedSkill);
      const combinedInput = [skillText, source.text].filter(Boolean).join("\n\n");
      if (combinedInput.length > CANVAS_TEXT_NODE_INPUT_MAX_LENGTH) {
        throw new CanvasTextNodeRunError(
          "canvas_text_input_too_long",
          400,
          `AI text input cannot exceed ${CANVAS_TEXT_NODE_INPUT_MAX_LENGTH} characters`,
          { maxLength: CANVAS_TEXT_NODE_INPUT_MAX_LENGTH },
        );
      }
    }
    run = await createCanvasNodeRun(db, {
      canvasProjectId: input.canvas.canvasProjectId,
      nodeKey: input.nodeKey,
      idempotencyKey: input.idempotencyKey,
      status: "running",
      mediaKind: "text",
      modelCode,
      targetType: "canvas",
      targetId: input.nodeKey,
      inputSnapshot: {
        requestHash,
        format,
        sourceText: source.text,
        upstreamNodeIds: source.upstreamNodeIds,
        ...(resolvedSkill ? { promptSkill: {
          id: resolvedSkill.id,
          category: resolvedSkill.category,
          title: resolvedSkill.title,
          priceCredits: resolvedSkill.priceCredits,
          official: resolvedSkill.official,
          ownerUserId: resolvedSkill.ownerUserId,
          contentHash: sha256(resolvedSkill.content),
        } } : {}),
        canvasProjectId: input.canvas.canvasProjectId,
        nodeKey: input.nodeKey,
      },
      userId: input.userId,
      actorScope: input.actorScope,
      now: input.now,
    });
    if (skillTransactionOpen) {
      await db.query(run.reused ? "ROLLBACK" : "COMMIT");
      skillTransactionOpen = false;
    }
  } catch (error) {
    if (skillTransactionOpen) {
      await db.query("ROLLBACK").catch(() => undefined);
    }
    if (error instanceof PromptMarketplaceError) {
      throw new CanvasTextNodeRunError(error.code, error.status, error.message);
    }
    throw error;
  }
  if (run.reused) {
    const raced = await findStoredCanvasTextRun(db, {
      canvasProjectId: input.canvas.canvasProjectId,
      idempotencyKey: storedIdempotencyKey,
    });
    if (!raced || raced.nodeKey !== input.nodeKey) {
      throw new CanvasTextNodeRunError(
        "canvas_text_idempotency_conflict",
        409,
        "Idempotency key was already used by another canvas node run",
      );
    }
    const racedHash = readTrimmedString(raced.inputSnapshot.requestHash);
    if (racedHash && racedHash !== requestHash) {
      throw new CanvasTextNodeRunError(
        "canvas_text_idempotency_conflict",
        409,
        "Idempotency key was already used with different AI text input",
      );
    }
    return serializeStoredRun(raced, input.canvas.canvasProjectId, true);
  }

  let billingReceipt: CanvasTextBillingReceipt | null = null;
  let billingConsumed = false;
  try {
    billingReceipt = input.billing
      ? await input.billing.reserve({ runId: run.id, skill: resolvedSkill, now: input.now })
      : null;
    const rawResult = String(await input.gateway.completeJson({
      model: modelCode,
      prompt: buildCanvasTextPrompt(source.text, format, resolvedSkill),
      createdByUserId: input.userId,
      responseFormat: "text",
      maxTokens: 8_192,
    }) ?? "");
    if (rawResult.length > CANVAS_TEXT_NODE_OUTPUT_MAX_LENGTH) {
      throw new CanvasTextNodeRunError(
        "canvas_text_response_too_long",
        502,
        `AI text output cannot exceed ${CANVAS_TEXT_NODE_OUTPUT_MAX_LENGTH} characters`,
        { maxLength: CANVAS_TEXT_NODE_OUTPUT_MAX_LENGTH },
      );
    }
    const resultText = rawResult.trim();
    if (!resultText) {
      throw new CanvasTextNodeRunError(
        "canvas_text_response_empty",
        502,
        "AI text model returned an empty response",
      );
    }
    if (billingReceipt && input.billing) {
      await input.billing.consume({ runId: run.id, receipt: billingReceipt, now: input.now });
      billingConsumed = true;
    }
    const outputSnapshot = {
      text: resultText,
      format,
      modelCode,
      ...(resolvedSkill ? { promptSkill: {
        id: resolvedSkill.id,
        category: resolvedSkill.category,
        title: resolvedSkill.title,
      } } : {}),
      ...(billingReceipt ? { credit: {
        consumed: billingReceipt.amount,
        modelCreditCost: billingReceipt.modelCreditCost,
        skillCreditCost: billingReceipt.skillCreditCost,
      } } : {}),
    };
    const completed = await completeCanvasTextNodeRun(db, {
      runId: run.id,
      canvasProjectId: input.canvas.canvasProjectId,
      nodeKey: input.nodeKey,
      outputSnapshot,
      artifactMetadata: outputSnapshot,
      userId: input.userId,
      now: input.now,
    });
    if (resolvedSkill && input.billing) {
      await input.billing.grantSkillAuthor({ runId: run.id, skill: resolvedSkill, now: input.now });
    }
    return {
      canvasProjectId: input.canvas.canvasProjectId,
      nodeKey: input.nodeKey,
      runId: run.id,
      runNo: run.runNo,
      status: "succeeded",
      modelCode,
      result: outputSnapshot,
      artifact: {
        id: completed.artifact.id,
        artifactKind: "text",
        metadata: outputSnapshot,
      },
      creditReservationId: billingReceipt?.reservationId ?? null,
      replayed: false,
    };
  } catch (error) {
    const failureCode = error instanceof CanvasTextNodeRunError
      ? error.code
      : "canvas_text_generation_failed";
    await failCanvasTextNodeRun(db, {
      runId: run.id,
      canvasProjectId: input.canvas.canvasProjectId,
      nodeKey: input.nodeKey,
      failure: {
        failureCode,
        failureMessage: "AI 文本生成失败。",
      },
      now: input.now,
    });
    if (billingReceipt && input.billing && !billingConsumed) {
      await input.billing.release({
        runId: run.id,
        receipt: billingReceipt,
        failureCode,
        now: input.now,
      });
    }
    if (error instanceof CanvasTextNodeRunError) {
      throw new CanvasTextNodeRunError(error.code, error.status, error.message, {
        ...error.details,
        runId: run.id,
        runNo: run.runNo,
      });
    }
    throw new CanvasTextNodeRunError(
      failureCode,
      502,
      "AI text generation failed",
      { runId: run.id, runNo: run.runNo },
    );
  }
}

function isCanvasAiTextNode(node: CanvasNode) {
  return node.type === "ai-text" || node.type === "ai-markdown" || node.type === "ai-shotlist";
}

function collectCanvasTextInput(
  canvas: CanvasRecord,
  node: CanvasNode,
  body: Record<string, unknown>,
) {
  const instructions: string[] = [];
  const sourceFragments: string[] = [];
  const addUnique = (target: string[], value: unknown) => {
    const text = readTrimmedString(value);
    if (text && !target.includes(text)) target.push(text);
  };
  addUnique(instructions, body.instructions);
  addUnique(instructions, body.prompt);
  addUnique(instructions, body.input);
  addUnique(instructions, body.text);
  addUnique(instructions, node.data?.instructions);
  addUnique(instructions, node.data?.prompt);

  const upstreamNodeIds = canvas.document.edges
    .filter((edge) => edge.targetNodeId === node.id)
    .map((edge) => edge.sourceNodeId)
    .filter((value, index, values) => values.indexOf(value) === index);
  for (const upstreamNodeId of upstreamNodeIds) {
    const upstream = canvas.document.nodes.find((candidate) => candidate.id === upstreamNodeId);
    if (!upstream) continue;
    addUnique(sourceFragments, upstream.data?.resultText);
    addUnique(sourceFragments, upstream.data?.text);
    addUnique(sourceFragments, stripHtml(upstream.data?.textHtml));
    addUnique(sourceFragments, upstream.data?.markdown);
    addUnique(sourceFragments, upstream.data?.instructions);
  }
  const canvasContext = body.canvasContext && typeof body.canvasContext === "object" && !Array.isArray(body.canvasContext)
    ? body.canvasContext as Record<string, unknown>
    : {};
  for (const fragment of Array.isArray(canvasContext.upstreamTextFragments)
    ? canvasContext.upstreamTextFragments.slice(0, 100)
    : []) {
    addUnique(sourceFragments, fragment);
  }

  const sections: string[] = [];
  if (instructions.length) sections.push(`用户要求：\n${instructions.join("\n\n")}`);
  if (sourceFragments.length) sections.push(`参考文本：\n${sourceFragments.join("\n\n")}`);
  return { text: sections.join("\n\n"), upstreamNodeIds };
}

function buildCanvasTextPrompt(
  sourceText: string,
  format: "text" | "markdown",
  skill: CanvasTextPromptSkill | null = null,
) {
  return [
    buildCanvasTextSkillInstructions(skill),
    format === "markdown"
      ? "根据输入生成或改写 Markdown 文档。直接返回 Markdown 正文，不要使用包裹全文的代码围栏。"
      : "根据输入生成或改写文本。直接返回最终正文，不要解释生成过程。",
    "不要声称已经生成、上传或保存任何图片、视频、音频或文件。",
    sourceText,
  ].filter(Boolean).join("\n\n");
}

function buildCanvasTextSkillInstructions(skill: CanvasTextPromptSkill | null) {
  return skill?.content ?? "";
}

function readCanvasTextPromptSkill(body: Record<string, unknown>, node: CanvasNode) {
  if (Object.prototype.hasOwnProperty.call(body, "skill")) {
    return normalizeCanvasTextPromptSkill(body.skill);
  }
  const directId = readTrimmedString(node.data?.promptSkillId);
  const directCategory = readTrimmedString(node.data?.promptSkillCategory);
  if (directId || directCategory) {
    return normalizeCanvasTextPromptSkill({ id: directId, category: directCategory });
  }
  const raw = Object.prototype.hasOwnProperty.call(body, "skills") ? body.skills : node.data?.promptSkillIds;
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new CanvasTextNodeRunError("canvas_text_prompt_skills_invalid", 400, "AI text prompt skills are invalid");
  }
  const record = raw as Record<string, unknown>;
  const allowed = new Set<string>(CANVAS_TEXT_SKILL_CATEGORIES);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new CanvasTextNodeRunError("canvas_text_prompt_skills_invalid", 400, "AI text prompt skill category is invalid");
  }
  let selection: { id: string; category: CanvasTextSkillCategory } | null = null;
  for (const category of CANVAS_TEXT_SKILL_CATEGORIES) {
    const value = record[category];
    if (value == null || value === "") continue;
    if (selection || typeof value !== "string" || !isUuid(value.trim())) {
      throw new CanvasTextNodeRunError("canvas_text_prompt_skills_invalid", 400, "AI text prompt skill id is invalid");
    }
    selection = { id: value.trim(), category };
  }
  return selection;
}

function normalizeCanvasTextPromptSkill(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new CanvasTextNodeRunError("canvas_text_prompt_skills_invalid", 400, "AI text prompt skill is invalid");
  }
  const record = value as Record<string, unknown>;
  const id = readTrimmedString(record.id);
  const category = readTrimmedString(record.category);
  if (!id && !category) return null;
  if (!isUuid(id) || !CANVAS_TEXT_SKILL_CATEGORIES.includes(category as CanvasTextSkillCategory)) {
    throw new CanvasTextNodeRunError("canvas_text_prompt_skills_invalid", 400, "AI text prompt skill is invalid");
  }
  return { id, category: category as CanvasTextSkillCategory };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function findStoredCanvasTextRun(
  db: SqlDatabase,
  input: { canvasProjectId: string; idempotencyKey: string },
): Promise<StoredCanvasTextRun | null> {
  const row = await queryOne<{
    id: string;
    run_no: number;
    status: string;
    node_key: string;
    model_code: string | null;
    input_snapshot_json: Record<string, unknown> | string;
    output_snapshot_json: Record<string, unknown> | string;
  }>(
    db,
    `
      SELECT id, run_no, status, node_key, model_code, input_snapshot_json, output_snapshot_json
      FROM creator_canvas_node_runs
      WHERE canvas_project_id = $1
        AND idempotency_key = $2
      LIMIT 1
    `,
    [input.canvasProjectId, input.idempotencyKey],
  );
  if (!row) return null;
  const artifact = await queryOne<{
    id: string;
    artifact_kind: string;
    metadata_json: Record<string, unknown> | string;
  }>(
    db,
    `
      SELECT id, artifact_kind, metadata_json
      FROM creator_canvas_node_artifacts
      WHERE canvas_project_id = $1
        AND run_id = $2
        AND deleted_at IS NULL
      ORDER BY selected DESC, created_at DESC
      LIMIT 1
    `,
    [input.canvasProjectId, row.id],
  );
  return {
    id: row.id,
    runNo: row.run_no,
    status: row.status,
    nodeKey: row.node_key,
    modelCode: row.model_code,
    inputSnapshot: readJsonRecord(row.input_snapshot_json),
    outputSnapshot: readJsonRecord(row.output_snapshot_json),
    artifact: artifact
      ? {
          id: artifact.id,
          artifactKind: artifact.artifact_kind,
          metadata: readJsonRecord(artifact.metadata_json),
        }
      : null,
  };
}

function serializeStoredRun(run: StoredCanvasTextRun, canvasProjectId: string, replayed: boolean) {
  return {
    canvasProjectId,
    nodeKey: run.nodeKey,
    runId: run.id,
    runNo: run.runNo,
    status: run.status,
    modelCode: run.modelCode,
    result: run.outputSnapshot,
    artifact: run.artifact,
    replayed,
  };
}

function stripHtml(value: unknown) {
  return readTrimmedString(value)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function readJsonRecord(value: Record<string, unknown> | string | null | undefined) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function readTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
