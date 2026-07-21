import { randomUUID } from "node:crypto";

export interface CanvasVideoCompositionClipInput {
  nodeId: string;
  durationSeconds?: number;
}

export interface CanvasVideoCompositionRequest {
  nodeId: string;
  width?: number;
  height?: number;
  fps?: number;
  clips?: CanvasVideoCompositionClipInput[];
}

export interface ResolvedCanvasVideoCompositionClip {
  nodeId: string;
  kind: "image" | "video";
  storageObjectId: string;
  durationSeconds: number;
}

export interface ResolvedCanvasVideoCompositionRequest {
  nodeId: string;
  width: number;
  height: number;
  fps: number;
  clips: ResolvedCanvasVideoCompositionClip[];
}

export class CanvasVideoCompositionValidationError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message);
    this.name = "CanvasVideoCompositionValidationError";
  }
}

export function resolveCanvasVideoCompositionRequest(
  document: Record<string, unknown>,
  input: CanvasVideoCompositionRequest,
): ResolvedCanvasVideoCompositionRequest {
  const nodes = Array.isArray(document?.nodes) ? document.nodes as Array<Record<string, unknown>> : [];
  const edges = Array.isArray(document?.edges) ? document.edges as Array<Record<string, unknown>> : [];
  const nodeId = readString(input?.nodeId);
  if (!nodeId) throw new CanvasVideoCompositionValidationError("canvas_video_composition_node_required");
  const target = nodes.find((node) => readString(node.id) === nodeId);
  if (!target || workflowElementType(target) !== "video-composition-node") {
    throw new CanvasVideoCompositionValidationError("canvas_video_composition_node_not_found");
  }

  const connectedEdges = edges.filter((edge) => readString(edge.targetNodeId ?? edge.target) === nodeId);
  const connectedIds = connectedEdges
    .map((edge) => readString(edge.sourceNodeId ?? edge.source))
    .filter(Boolean);
  const connected = new Set(connectedIds);
  const requested = Array.isArray(input.clips) && input.clips.length
    ? input.clips
    : connectedIds.map((sourceNodeId) => ({ nodeId: sourceNodeId }));
  if (!requested.length) {
    throw new CanvasVideoCompositionValidationError("canvas_video_composition_clips_required");
  }
  if (requested.length > 50) {
    throw new CanvasVideoCompositionValidationError("canvas_video_composition_clip_limit_exceeded");
  }

  const seen = new Set<string>();
  const clips = requested.map((clip) => {
    const sourceNodeId = readString(clip?.nodeId);
    if (!sourceNodeId || seen.has(sourceNodeId)) {
      throw new CanvasVideoCompositionValidationError("canvas_video_composition_clip_duplicate");
    }
    seen.add(sourceNodeId);
    if (!connected.has(sourceNodeId)) {
      throw new CanvasVideoCompositionValidationError("canvas_video_composition_clip_not_connected");
    }
    const node = nodes.find((candidate) => readString(candidate.id) === sourceNodeId);
    const element = workflowElement(node);
    const kind = compositionMediaKind(element);
    if (!kind) {
      throw new CanvasVideoCompositionValidationError("canvas_video_composition_clip_type_invalid");
    }
    const hasTypedConnection = connectedEdges.some((edge) => (
      readString(edge.sourceNodeId ?? edge.source) === sourceNodeId
      && isCompositionMediaEdge(edge, node, target, kind)
    ));
    if (!hasTypedConnection) {
      throw new CanvasVideoCompositionValidationError("canvas_video_composition_clip_not_connected");
    }
    const customData = readRecord(element?.customData);
    const storageObjectId = readString(customData.storageObjectId);
    if (!isUuid(storageObjectId)) {
      throw new CanvasVideoCompositionValidationError("canvas_video_composition_clip_not_archived");
    }
    const requestedDuration = Number(clip.durationSeconds);
    const storedDuration = Number(customData.durationSeconds);
    const durationSeconds = Number.isFinite(requestedDuration) && requestedDuration > 0
      ? requestedDuration
      : kind === "image"
        ? 3
        : Number.isFinite(storedDuration) && storedDuration > 0
          ? storedDuration
          : 5;
    if (durationSeconds < 0.1 || durationSeconds > 120) {
      throw new CanvasVideoCompositionValidationError("canvas_video_composition_clip_duration_invalid");
    }
    return {
      nodeId: sourceNodeId,
      kind,
      storageObjectId,
      durationSeconds: Math.round(durationSeconds * 1000) / 1000,
    };
  });
  const totalDuration = clips.reduce((total, clip) => total + clip.durationSeconds, 0);
  if (totalDuration > 600) {
    throw new CanvasVideoCompositionValidationError("canvas_video_composition_duration_limit_exceeded");
  }

  const width = evenInteger(input.width ?? 1280, 16, 3840, "canvas_video_composition_width_invalid");
  const height = evenInteger(input.height ?? 720, 16, 3840, "canvas_video_composition_height_invalid");
  if (width * height > 8_294_400) {
    throw new CanvasVideoCompositionValidationError("canvas_video_composition_pixel_limit_exceeded");
  }
  return {
    nodeId,
    width,
    height,
    fps: integer(input.fps ?? 30, 1, 60, "canvas_video_composition_fps_invalid"),
    clips,
  };
}

export function canvasVideoCompositionObjectKey(input: {
  rootPrefix?: string;
  userId: string;
  now: Date;
}) {
  const root = sanitizePathSegment(input.rootPrefix || "userAssets") || "userAssets";
  const date = input.now.toISOString().slice(0, 10).replaceAll("-", "/");
  return [root, input.userId, "canvas-compositions", date, `${randomUUID()}.mp4`].join("/");
}

function workflowElement(node: Record<string, unknown> | undefined) {
  return readRecord(readRecord(node?.data).loomicElement);
}

function workflowElementType(node: Record<string, unknown>) {
  return readString(readRecord(workflowElement(node).customData).type);
}

function compositionMediaKind(element: Record<string, unknown>) {
  const customData = readRecord(element.customData);
  const mediaKind = readString(customData.mediaKind);
  if (element.type === "image" || mediaKind === "image") return "image" as const;
  if ((element.type === "embeddable" && customData.isVideo === true) || mediaKind === "video") return "video" as const;
  return null;
}

function isCompositionMediaEdge(
  edge: Record<string, unknown>,
  source: Record<string, unknown> | undefined,
  target: Record<string, unknown>,
  kind: "image" | "video",
) {
  const sourcePort = findNodePort(source, "outputs", readString(edge.sourcePortId));
  const targetPort = findNodePort(target, "inputs", readString(edge.targetPortId));
  if (!sourcePort || !targetPort || readString(sourcePort.kind) !== kind) return false;
  const edgeKind = readString(readRecord(edge.data).kind);
  if (edgeKind !== kind) return false;
  const acceptedKinds = Array.isArray(targetPort.accepts)
    ? targetPort.accepts.map(readString).filter(Boolean)
    : [];
  const targetKind = readString(targetPort.kind);
  return acceptedKinds.length
    ? acceptedKinds.includes(kind)
    : targetKind === "any" || targetKind === kind;
}

function findNodePort(
  node: Record<string, unknown> | undefined,
  direction: "inputs" | "outputs",
  portId: string,
) {
  if (!portId) return null;
  const ports = readRecord(readRecord(node?.data).ports)[direction];
  if (!Array.isArray(ports)) return null;
  return ports
    .map(readRecord)
    .find((port) => readString(port.id) === portId) ?? null;
}

function sanitizePathSegment(value: string) {
  return value.trim().replace(/^\/+|\/+$/g, "").replace(/[^A-Za-z0-9_./-]/g, "-");
}

function integer(value: unknown, minimum: number, maximum: number, code: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new CanvasVideoCompositionValidationError(code);
  }
  return number;
}

function evenInteger(value: unknown, minimum: number, maximum: number, code: string) {
  const number = integer(value, minimum, maximum, code);
  if (number % 2 !== 0) {
    throw new CanvasVideoCompositionValidationError(code);
  }
  return number;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
