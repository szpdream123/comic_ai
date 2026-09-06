import { createHash } from "node:crypto";

import type { CanvasActorScope } from "../identity/canvas-actor-scope.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import {
  CanvasConflictError,
  CanvasDocumentError,
  completeCanvasTextNodeRun,
  createCanvasNodeRun,
  findCanvasByCanvasProjectId,
  saveCanvasByCanvasProjectId,
  type CanvasNode,
  type CanvasRecord,
} from "./creator-canvas-record.service.ts";

export const CANVAS_PLAIN_TEXT_TRANSCRIPTION_MAX_LENGTH = 100_000;

export class CanvasAudioTextInputError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message = code,
  ) {
    super(message);
    this.name = "CanvasAudioTextInputError";
  }
}

export function isCanvasPlainTextTranscriptionRequest(
  canvas: CanvasRecord,
  nodeKey: string,
  body: Record<string, unknown>,
) {
  const node = canvas.document.nodes.find((item) => item.id === nodeKey);
  if (!node || !isAudioNode(node)) return false;
  const parameters = readRecord(body.parameters);
  const mode = readString(body.mode ?? parameters.mode ?? node.data?.audioGenerationMode);
  const inputKind = readString(body.transcriptionInputKind ?? parameters.transcriptionInputKind);
  if (mode !== "transcription" || inputKind !== "text") return false;
  return !hasAudioInput(canvas, nodeKey, body);
}

export async function runCanvasPlainTextTranscription(
  db: SqlDatabase,
  input: {
    canvas: CanvasRecord;
    nodeKey: string;
    idempotencyKey: string;
    body: Record<string, unknown>;
    actorScope: CanvasActorScope;
    userId: string;
    now: Date;
  },
) {
  const node = input.canvas.document.nodes.find((item) => item.id === input.nodeKey);
  if (!node || !isAudioNode(node)) {
    throw new CanvasAudioTextInputError("canvas_audio_node_invalid", 400, "Only an audio node can transcribe text");
  }
  if (hasAudioInput(input.canvas, input.nodeKey, input.body)) {
    throw new CanvasAudioTextInputError(
      "canvas_text_transcription_audio_conflict",
      400,
      "Plain-text transcription cannot include an audio input",
    );
  }
  const source = collectPlainTextInput(input.canvas, input.nodeKey, input.body);
  if (!source.text) {
    throw new CanvasAudioTextInputError(
      "canvas_text_transcription_input_required",
      400,
      "Plain-text transcription requires text input",
    );
  }
  if (source.text.length > CANVAS_PLAIN_TEXT_TRANSCRIPTION_MAX_LENGTH) {
    throw new CanvasAudioTextInputError(
      "canvas_text_transcription_input_too_long",
      400,
      `Plain-text transcription cannot exceed ${CANVAS_PLAIN_TEXT_TRANSCRIPTION_MAX_LENGTH} characters`,
    );
  }

  const requestHash = createHash("sha256")
    .update(JSON.stringify({ text: source.text, sourceTextNodeIds: source.sourceTextNodeIds }))
    .digest("hex");
  const run = await createCanvasNodeRun(db, {
    canvasProjectId: input.canvas.canvasProjectId,
    nodeKey: input.nodeKey,
    idempotencyKey: input.idempotencyKey,
    status: "running",
    mediaKind: "text",
    modelCode: null,
    targetType: "canvas",
    targetId: input.nodeKey,
    inputSnapshot: {
      requestHash,
      inputKind: "text",
      audioGenerationMode: "transcription",
      sourceTextNodeIds: source.sourceTextNodeIds,
      text: source.text,
    },
    actorScope: input.actorScope,
    userId: input.actorScope.ownerUserId,
    now: input.now,
  });
  const existing = run.reused ? await findStoredTextTranscriptionRun(db, run.id) : null;
  if (existing?.requestHash && existing.requestHash !== requestHash) {
    throw new CanvasAudioTextInputError(
      "canvas_text_transcription_idempotency_conflict",
      409,
      "Idempotency key was already used with different text",
    );
  }

  let artifactId = existing?.artifactId ?? "";
  if (!run.reused || existing?.status !== "succeeded" || !artifactId) {
    const completed = await completeCanvasTextNodeRun(db, {
      runId: run.id,
      canvasProjectId: input.canvas.canvasProjectId,
      nodeKey: input.nodeKey,
      outputSnapshot: {
        text: source.text,
        transcript: source.text,
        transcriptionInputKind: "text",
        audioGenerationMode: "transcription",
        sourceTextNodeIds: source.sourceTextNodeIds,
      },
      artifactMetadata: {
        kind: "plain_text_transcription",
        text: source.text,
        sourceTextNodeIds: source.sourceTextNodeIds,
        transcriptionInputKind: "text",
      },
      userId: input.actorScope.ownerUserId,
      now: input.now,
    });
    artifactId = completed.artifact.id;
  }
  const savedCanvas = await upsertPlainTextTranscriptNode(db, {
    canvasProjectId: input.canvas.canvasProjectId,
    audioNodeId: input.nodeKey,
    runId: run.id,
    artifactId,
    text: source.text,
    sourceTextNodeIds: source.sourceTextNodeIds,
    actorScope: input.actorScope,
    now: input.now,
  });
  const sourceTextNodeId = `transcript-${run.id}`;
  return {
    canvasProjectId: input.canvas.canvasProjectId,
    nodeKey: input.nodeKey,
    runId: run.id,
    runNo: run.runNo,
    taskId: null,
    status: "succeeded",
    localConversion: true,
    creditCost: 0,
    artifact: { id: artifactId, artifactKind: "text" },
    result: {
      text: source.text,
      transcript: source.text,
      transcriptionInputKind: "text",
      audioGenerationMode: "transcription",
      sourceTextNodeId,
      sourceArtifactId: artifactId,
    },
    canvas: savedCanvas,
    replayed: run.reused,
  };
}

function collectPlainTextInput(canvas: CanvasRecord, nodeKey: string, body: Record<string, unknown>) {
  const context = readRecord(body.canvasContext);
  const fragments: Array<{ nodeId: string; text: string }> = [];
  for (const value of Array.isArray(context.upstreamTextFragments) ? context.upstreamTextFragments : []) {
    const fragment = readRecord(value);
    const text = normalizeText(fragment.text);
    if (text) fragments.push({ nodeId: readString(fragment.nodeId), text });
  }
  const connectedIds = canvas.document.edges
    .filter((edge) => edge.targetNodeId === nodeKey)
    .map((edge) => edge.sourceNodeId);
  for (const sourceNodeId of connectedIds) {
    const sourceNode = canvas.document.nodes.find((item) => item.id === sourceNodeId);
    if (!sourceNode || !isTextNode(sourceNode)) continue;
    const text = normalizeText(sourceNode.data?.text ?? stripHtml(readString(sourceNode.data?.textHtml)));
    if (text) fragments.push({ nodeId: sourceNodeId, text });
  }
  const directText = normalizeText(Object.prototype.hasOwnProperty.call(body, "textInput")
    ? body.textInput
    : body.text ?? body.prompt);
  if (directText) fragments.push({ nodeId: "", text: directText });
  const uniqueTexts = fragments
    .map((item) => item.text)
    .filter((value, index, values) => values.indexOf(value) === index);
  const sourceTextNodeIds = fragments
    .map((item) => item.nodeId)
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
  return { text: uniqueTexts.join("\n\n"), sourceTextNodeIds };
}

async function upsertPlainTextTranscriptNode(
  db: SqlDatabase,
  input: {
    canvasProjectId: string;
    audioNodeId: string;
    runId: string;
    artifactId: string;
    text: string;
    sourceTextNodeIds: string[];
    actorScope: CanvasActorScope;
    now: Date;
  },
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await findCanvasByCanvasProjectId(db, {
      canvasProjectId: input.canvasProjectId,
      actorScope: input.actorScope,
    });
    if (!current) throw new CanvasDocumentError("canvas_project_not_found", "canvas project not found");
    const nodeId = `transcript-${input.runId}`;
    const nodes = current.document.nodes.slice();
    const existingIndex = nodes.findIndex((node) => node.id === nodeId);
    const existingData = existingIndex >= 0 ? readRecord(nodes[existingIndex]!.data) : {};
    if (
      existingIndex >= 0
      && readString(existingData.transcriptionRunId) === input.runId
      && readString(existingData.sourceArtifactId) === input.artifactId
      && readString(existingData.text) === input.text
    ) {
      return current;
    }
    const audioNode = nodes.find((node) => node.id === input.audioNodeId);
    const baseX = Number(audioNode?.position?.x ?? 40);
    const baseY = Number(audioNode?.position?.y ?? 40);
    const sourceNode: CanvasNode = {
      id: nodeId,
      type: "source-text",
      position: existingIndex >= 0 ? nodes[existingIndex]!.position : { x: baseX + 480, y: baseY },
      size: existingIndex >= 0 ? nodes[existingIndex]!.size : { width: 340, height: 220 },
      data: {
        ...existingData,
        title: "文本转录",
        label: "文本转录",
        status: "ready",
        source: "plain_text_transcription",
        mediaKind: "text",
        text: input.text,
        transcriptionRunId: input.runId,
        transcriptionInputKind: "text",
        sourceTranscriptionNodeId: input.audioNodeId,
        sourceTextNodeIds: input.sourceTextNodeIds,
        sourceArtifactId: input.artifactId,
        transcriptUpdatedAt: input.now.toISOString(),
      },
    };
    if (existingIndex >= 0) nodes[existingIndex] = sourceNode;
    else nodes.push(sourceNode);
    try {
      return await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: input.canvasProjectId,
        actorScope: input.actorScope,
        clientRevision: current.serverRevision,
        document: { ...current.document, nodes, updatedAt: input.now.toISOString() },
        events: [{
          type: "canvas.plain_text_transcription.created",
          runId: input.runId,
          sourceNodeId: nodeId,
        }],
        now: input.now,
      });
    } catch (error) {
      if (!(error instanceof CanvasConflictError) || attempt === 2) throw error;
    }
  }
  throw new CanvasDocumentError("canvas_text_transcription_save_failed");
}

async function findStoredTextTranscriptionRun(db: SqlDatabase, runId: string) {
  const row = await queryOne<{
    status: string;
    input_snapshot_json: Record<string, unknown> | string;
    artifact_id: string | null;
  }>(db, `
    SELECT run.status,run.input_snapshot_json,artifact.id AS artifact_id
    FROM creator_canvas_node_runs run
    LEFT JOIN LATERAL (
      SELECT id FROM creator_canvas_node_artifacts
      WHERE run_id=run.id AND artifact_kind='text' AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1
    ) artifact ON true
    WHERE run.id=$1
    LIMIT 1
  `, [runId]);
  const snapshot = readRecord(row?.input_snapshot_json);
  return row ? {
    status: row.status,
    requestHash: readString(snapshot.requestHash),
    artifactId: row.artifact_id ?? "",
  } : null;
}

function hasAudioInput(canvas: CanvasRecord, nodeKey: string, body: Record<string, unknown>) {
  const parameters = readRecord(body.parameters);
  if (
    hasValue(parameters.referenceAudio)
    || hasValue(parameters.referenceAudios)
    || hasValue(parameters.audios)
    || hasValue(parameters.audioFilePaths)
  ) return true;
  const sourceNodeIds = canvas.document.edges
    .filter((edge) => edge.targetNodeId === nodeKey)
    .map((edge) => edge.sourceNodeId);
  return sourceNodeIds.some((sourceNodeId) => {
    const source = canvas.document.nodes.find((node) => node.id === sourceNodeId);
    return source?.data?.mediaKind === "audio" || source?.type === "source-audio" || source?.type === "audio";
  });
}

function hasValue(value: unknown) {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function isAudioNode(node: CanvasNode) {
  return node.type === "audio" || node.type === "ai-audio" || node.data?.mediaKind === "audio";
}

function isTextNode(node: CanvasNode) {
  return ["script", "director", "markdown", "source-text", "ai-text", "ai-markdown", "ai-storyboard", "ai-shotlist", "ai-director"]
    .includes(node.type) || node.data?.mediaKind === "text";
}

function stripHtml(value: string) {
  return value.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, " ");
}

function normalizeText(value: unknown) {
  return readString(value).replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function readRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
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

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
