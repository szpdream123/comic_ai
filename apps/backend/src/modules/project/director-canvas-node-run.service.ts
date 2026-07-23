import { createHash } from "node:crypto";

import type { TextChatGatewayLike } from "../ai-storyboard/ai-storyboard-preview.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import {
  completeCanvasTextNodeRun,
  createCanvasNodeRun,
  failCanvasTextNodeRun,
  type CanvasNode,
  type CanvasRecord,
} from "./creator-canvas-record.service.ts";

export const DIRECTOR_NODE_INPUT_MAX_LENGTH = 50_000;
export const DIRECTOR_NODE_OUTPUT_MAX_LENGTH = 50_000;

export class DirectorCanvasNodeRunError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message = code,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "DirectorCanvasNodeRunError";
  }
}

interface StoredDirectorRun {
  id: string;
  runNo: number;
  status: string;
  modelCode: string | null;
  inputSnapshot: Record<string, unknown>;
  outputSnapshot: Record<string, unknown>;
  artifact: {
    id: string;
    artifactKind: string;
    metadata: Record<string, unknown>;
  } | null;
}

export async function runDirectorCanvasNode(
  db: SqlDatabase,
  input: {
    canvas: CanvasRecord;
    nodeKey: string;
    idempotencyKey: string;
    body: Record<string, unknown>;
    userId: string;
    gateway: TextChatGatewayLike;
    now: Date;
  },
) {
  const node = input.canvas.document.nodes.find((item) => item.id === input.nodeKey);
  if (!node) {
    throw new DirectorCanvasNodeRunError("canvas_node_not_found", 404, "canvas node not found");
  }
  if (!isDirectorNode(node)) {
    throw new DirectorCanvasNodeRunError(
      "canvas_director_node_invalid",
      400,
      "Only a director node can run a director task",
    );
  }

  const source = collectDirectorInput(input.canvas, node, input.body);
  if (!source.text) {
    throw new DirectorCanvasNodeRunError(
      "canvas_director_input_required",
      400,
      "Director instructions require text input",
    );
  }
  if (source.text.length > DIRECTOR_NODE_INPUT_MAX_LENGTH) {
    throw new DirectorCanvasNodeRunError(
      "canvas_director_input_too_long",
      400,
      `Director input cannot exceed ${DIRECTOR_NODE_INPUT_MAX_LENGTH} characters`,
      { maxLength: DIRECTOR_NODE_INPUT_MAX_LENGTH },
    );
  }
  const modelCode = readTrimmedString(input.body.model ?? input.body.modelCode ?? node.data?.modelCode)
    || "deepseek-chat";
  if (modelCode.length > 100) {
    throw new DirectorCanvasNodeRunError("canvas_director_model_invalid", 400, "Director model code is invalid");
  }
  const requestHash = sha256(JSON.stringify({ modelCode, text: source.text, upstreamNodeIds: source.upstreamNodeIds }));
  const recoveryInput = buildDirectorRecoveryInput(input.canvas, node, input.body, source.upstreamNodeIds);
  const existing = await findStoredDirectorRun(db, {
    canvasProjectId: input.canvas.canvasProjectId,
    nodeKey: input.nodeKey,
    idempotencyKey: input.idempotencyKey,
  });
  if (existing) {
    const existingHash = readTrimmedString(existing.inputSnapshot.requestHash);
    if (existingHash && existingHash !== requestHash) {
      throw new DirectorCanvasNodeRunError(
        "canvas_director_idempotency_conflict",
        409,
        "Idempotency key was already used with different director input",
      );
    }
    return serializeStoredRun(existing, input.canvas.canvasProjectId, input.nodeKey, true);
  }

  const run = await createCanvasNodeRun(db, {
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
      sourceText: source.text,
      upstreamNodeIds: source.upstreamNodeIds,
      canvasProjectId: input.canvas.canvasProjectId,
      nodeKey: input.nodeKey,
      recoveryInput,
    },
    userId: input.userId,
    now: input.now,
  });
  if (run.reused) {
    const raced = await findStoredDirectorRun(db, {
      canvasProjectId: input.canvas.canvasProjectId,
      nodeKey: input.nodeKey,
      idempotencyKey: input.idempotencyKey,
    });
    if (!raced) {
      throw new DirectorCanvasNodeRunError("canvas_director_run_not_found", 409, "Director run could not be loaded");
    }
    return serializeStoredRun(raced, input.canvas.canvasProjectId, input.nodeKey, true);
  }

  try {
    const rawResult = await input.gateway.completeJson({
      model: modelCode,
      prompt: buildDirectorPrompt(source.text),
      createdByUserId: input.userId,
      responseFormat: "json_object",
      maxTokens: 8_192,
    });
    if (rawResult.length > DIRECTOR_NODE_OUTPUT_MAX_LENGTH) {
      throw new DirectorCanvasNodeRunError(
        "canvas_director_response_too_long",
        502,
        "Director model response is too long",
      );
    }
    const result = parseDirectorResult(rawResult);
    const completed = await completeCanvasTextNodeRun(db, {
      runId: run.id,
      canvasProjectId: input.canvas.canvasProjectId,
      nodeKey: input.nodeKey,
      outputSnapshot: {
        text: result.directorInstructions,
        structured: result.structuredResult,
        directorInstructions: result.directorInstructions,
        structuredResult: result.structuredResult,
        modelCode,
      },
      artifactMetadata: {
        directorInstructions: result.directorInstructions,
        structuredResult: result.structuredResult,
        modelCode,
      },
      userId: input.userId,
      now: input.now,
    });
    return {
      canvasProjectId: input.canvas.canvasProjectId,
      nodeKey: input.nodeKey,
      runId: run.id,
      runNo: run.runNo,
      status: "succeeded",
      modelCode,
      result: {
        text: result.directorInstructions,
        structured: result.structuredResult,
      },
      artifact: {
        id: completed.artifact.id,
        artifactKind: "text",
        metadata: {
          directorInstructions: result.directorInstructions,
          structuredResult: result.structuredResult,
          modelCode,
        },
      },
      replayed: false,
    };
  } catch (error) {
    const failureCode = error instanceof DirectorCanvasNodeRunError
      ? error.code
      : "canvas_director_generation_failed";
    await failCanvasTextNodeRun(db, {
      runId: run.id,
      canvasProjectId: input.canvas.canvasProjectId,
      nodeKey: input.nodeKey,
      failure: {
        failureCode,
        failureMessage: "导演指令生成失败。",
      },
      now: input.now,
    });
    if (error instanceof DirectorCanvasNodeRunError) {
      throw new DirectorCanvasNodeRunError(error.code, error.status, error.message, {
        ...error.details,
        runId: run.id,
        runNo: run.runNo,
      });
    }
    throw new DirectorCanvasNodeRunError(
      failureCode,
      502,
      "Director instruction generation failed",
      { runId: run.id, runNo: run.runNo },
    );
  }
}

function isDirectorNode(node: CanvasNode) {
  const loomicElement = node.data?.loomicElement && typeof node.data.loomicElement === "object"
    ? node.data.loomicElement as Record<string, unknown>
    : {};
  const customData = loomicElement.customData && typeof loomicElement.customData === "object"
    ? loomicElement.customData as Record<string, unknown>
    : {};
  return node.type === "director"
    && (!customData.type || customData.type === "director-node")
    && (!node.data?.workflowNodeType || node.data.workflowNodeType === "director");
}

function collectDirectorInput(
  canvas: CanvasRecord,
  node: CanvasNode,
  body: Record<string, unknown>,
) {
  const fragments: string[] = [];
  const add = (value: unknown) => {
    const text = readTrimmedString(value);
    if (text && !fragments.includes(text)) fragments.push(text);
  };
  add(body.input);
  add(body.prompt);
  add(body.instructions);
  add(body.text);
  add(node.data?.instructions);
  add(node.data?.prompt);
  add(node.data?.text);

  const connectedUpstreamNodeIds = canvas.document.edges
    .filter((edge) => edge.targetNodeId === node.id)
    .map((edge) => edge.sourceNodeId)
    .filter((value, index, values) => values.indexOf(value) === index);
  const canvasContext = body.canvasContext && typeof body.canvasContext === "object" && !Array.isArray(body.canvasContext)
    ? body.canvasContext as Record<string, unknown>
    : {};
  const contextUpstreamNodeIds = Array.isArray(canvasContext.upstreamNodeIds)
    ? canvasContext.upstreamNodeIds
        .slice(0, 100)
        .map(readTrimmedString)
        .filter(Boolean)
    : [];
  const upstreamNodeIds = [...connectedUpstreamNodeIds, ...contextUpstreamNodeIds]
    .filter((value, index, values) => values.indexOf(value) === index);
  for (const fragment of Array.isArray(canvasContext.upstreamTextFragments)
    ? canvasContext.upstreamTextFragments.slice(0, 100)
    : []) {
    add(redactCanvasContextReferences(fragment));
  }
  for (const media of collectCanvasContextMedia(canvasContext)) {
    add(`参考素材：${media.name}${media.type ? `（${media.type}）` : ""}`);
  }
  for (const upstreamNodeId of connectedUpstreamNodeIds) {
    const upstream = canvas.document.nodes.find((candidate) => candidate.id === upstreamNodeId);
    if (!upstream) continue;
    add(upstream.data?.text);
    add(upstream.data?.instructions);
    add(upstream.data?.resultText);
    add(upstream.data?.prompt);
    add(upstream.data?.notes);
  }
  return { text: fragments.join("\n\n"), upstreamNodeIds };
}

function collectCanvasContextMedia(context: Record<string, unknown>) {
  const values = [context.mediaReferences, context.media, context.assets, context.referenceImages]
    .filter(Array.isArray)
    .flatMap((items) => (items as unknown[]).slice(0, 100));
  return values.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const record = value as Record<string, unknown>;
    const nodeId = readTrimmedString(record.nodeId).slice(0, 200);
    const name = redactCanvasContextReferences(record.name ?? record.fileName ?? record.title).slice(0, 200);
    const type = readTrimmedString(record.mediaType ?? record.mimeType ?? record.type ?? record.kind).slice(0, 100);
    const storageObjectId = readTrimmedString(record.storageObjectId).slice(0, 200);
    if (!name && !type) return [];
    return [{ nodeId, name: name || "未命名素材", type, storageObjectId }];
  });
}

function buildDirectorRecoveryInput(
  canvas: CanvasRecord,
  node: CanvasNode,
  body: Record<string, unknown>,
  upstreamNodeIds: string[],
) {
  const context = body.canvasContext && typeof body.canvasContext === "object" && !Array.isArray(body.canvasContext)
    ? body.canvasContext as Record<string, unknown>
    : {};
  const upstreamTextFragments = (Array.isArray(context.upstreamTextFragments) ? context.upstreamTextFragments : [])
    .map(redactCanvasContextReferences)
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
  const connections = canvas.document.edges
    .filter((edge) => edge.targetNodeId === node.id)
    .map((edge) => ({
      sourceNodeId: edge.sourceNodeId,
      sourcePortId: edge.sourcePortId,
      targetNodeId: edge.targetNodeId,
      targetPortId: edge.targetPortId,
      kind: readTrimmedString(edge.data?.kind),
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const mediaReferences = collectCanvasContextMedia(context)
    .map((media) => ({ nodeId: media.nodeId, kind: media.type, name: media.name, storageObjectId: media.storageObjectId }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return {
    version: 1,
    instructions: readTrimmedString(body.instructions),
    prompt: readTrimmedString(body.prompt),
    model: readTrimmedString(body.model ?? body.modelCode),
    upstreamNodeIds: [...new Set(upstreamNodeIds)].sort(),
    upstreamTextFragments,
    connections,
    mediaReferences,
  };
}

function redactCanvasContextReferences(value: unknown) {
  return readTrimmedString(value)
    .replace(/(?:https?:\/\/|data:|blob:)[^\s)\]}]+/gi, "[媒体引用]")
    .trim();
}

function buildDirectorPrompt(sourceText: string) {
  return [
    "你是影视分镜导演。根据输入生成可执行、结构化的导演指令。",
    "只返回 JSON 对象，不要 Markdown，不要虚构已经生成的图片、视频、音频或文件。",
    "JSON 必须包含 directorInstructions 字符串、shots 数组、continuityNotes 数组、negativeConstraints 数组。",
    "shots 中每项应尽量包含 order、action、camera、composition、lighting、durationSeconds 和 prompt。",
    "输入：",
    sourceText,
  ].join("\n");
}

function parseDirectorResult(raw: string) {
  const text = String(raw ?? "").trim();
  const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new DirectorCanvasNodeRunError(
      "canvas_director_response_invalid",
      502,
      "Director model returned invalid JSON",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new DirectorCanvasNodeRunError(
      "canvas_director_response_invalid",
      502,
      "Director model returned an invalid result",
    );
  }
  const structuredResult = parsed as Record<string, unknown>;
  const direct = readTrimmedString(structuredResult.directorInstructions ?? structuredResult.instructions ?? structuredResult.summary);
  const shots = Array.isArray(structuredResult.shots) ? structuredResult.shots : [];
  const derived = shots
    .map((shot, index) => {
      if (!shot || typeof shot !== "object") return "";
      const record = shot as Record<string, unknown>;
      const detail = readTrimmedString(record.prompt ?? record.action ?? record.description);
      return detail ? `${index + 1}. ${detail}` : "";
    })
    .filter(Boolean)
    .join("\n");
  const directorInstructions = direct || derived;
  if (!directorInstructions) {
    throw new DirectorCanvasNodeRunError(
      "canvas_director_response_invalid",
      502,
      "Director model result did not contain instructions",
    );
  }
  return {
    directorInstructions,
    structuredResult: {
      ...structuredResult,
      directorInstructions,
      shots,
      continuityNotes: Array.isArray(structuredResult.continuityNotes) ? structuredResult.continuityNotes : [],
      negativeConstraints: Array.isArray(structuredResult.negativeConstraints) ? structuredResult.negativeConstraints : [],
    },
  };
}

async function findStoredDirectorRun(
  db: SqlDatabase,
  input: { canvasProjectId: string; nodeKey: string; idempotencyKey: string },
): Promise<StoredDirectorRun | null> {
  const row = await queryOne<{
    id: string;
    run_no: number;
    status: string;
    model_code: string | null;
    input_snapshot_json: Record<string, unknown> | string;
    output_snapshot_json: Record<string, unknown> | string;
  }>(
    db,
    `
      SELECT id, run_no, status, model_code, input_snapshot_json, output_snapshot_json
      FROM creator_canvas_node_runs
      WHERE canvas_project_id = $1
        AND node_key = $2
        AND idempotency_key = $3
      LIMIT 1
    `,
    [input.canvasProjectId, input.nodeKey, input.idempotencyKey],
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
        AND node_key = $2
        AND run_id = $3
        AND deleted_at IS NULL
      ORDER BY selected DESC, created_at DESC
      LIMIT 1
    `,
    [input.canvasProjectId, input.nodeKey, row.id],
  );
  return {
    id: row.id,
    runNo: row.run_no,
    status: row.status,
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

function serializeStoredRun(
  run: StoredDirectorRun,
  canvasProjectId: string,
  nodeKey: string,
  replayed: boolean,
) {
  return {
    canvasProjectId,
    nodeKey,
    runId: run.id,
    runNo: run.runNo,
    status: run.status,
    modelCode: run.modelCode,
    result: run.outputSnapshot,
    artifact: run.artifact,
    replayed,
  };
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
