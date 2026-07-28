import type {
  CanvasDocument,
  CanvasRecord,
  CanvasRevisionMetadataRecord,
  CanvasRevisionRecord,
} from "./creator-canvas-record.service.ts";
import type {
  CanvasSettingsPatch,
  CanvasSettingsRecord,
} from "./canvas-settings.service.ts";

export const canvasApiPaths = Object.freeze({
  collection: "/api/creator/canvases",
  item: "/api/creator/canvases/{canvasId}",
  restore: "/api/creator/canvases/{canvasId}/restore",
  document: "/api/creator/canvases/{canvasId}/document",
  revisions: "/api/creator/canvases/{canvasId}/revisions",
  revision: "/api/creator/canvases/{canvasId}/revisions/{revisionId}",
} as const);

export const canvasGenerationHistoryApiPaths = Object.freeze({
  collection: "/api/canvas/{canvasId}/generation-history",
  item: "/api/canvas/{canvasId}/generation-history/{entryId}",
} as const);

export const canvasSettingsApiPaths = Object.freeze({
  item: "/api/canvas/{canvasId}/settings",
} as const);

export const canvasArtifactApiPaths = Object.freeze({
  tags: "/api/canvas/{canvasId}/artifacts/{artifactId}/tags",
  select: "/api/canvas/{canvasId}/artifacts/{artifactId}/select",
} as const);

export const canvasRuntimeApiPaths = Object.freeze({
  head: "/api/canvas/{canvasId}/head",
  live: "/api/canvas/{canvasId}/live",
  frontendErrors: "/api/canvas/{canvasId}/telemetry/frontend-errors",
  nodeRun: "/api/canvas/{canvasId}/nodes/{nodeId}/run",
  nodeRuns: "/api/canvas/{canvasId}/nodes/{nodeId}/runs",
  generationBatches: "/api/canvas/{canvasId}/generation-batches",
  generationBatch: "/api/canvas/{canvasId}/generation-batches/{batchId}",
  generationBatchReconcile: "/api/canvas/{canvasId}/generation-batches/{batchId}/reconcile",
  generationBatchCancel: "/api/canvas/{canvasId}/generation-batches/{batchId}/cancel",
  conversations: "/api/canvas/{canvasId}/conversations",
  conversationMessages: "/api/canvas/{canvasId}/conversations/{conversationId}/messages",
  conversationFileGrants: "/api/canvas/{canvasId}/conversations/{conversationId}/file-grants",
  conversationFileGrant: "/api/canvas/{canvasId}/conversations/{conversationId}/file-grants/{grantId}",
  agentTaskEvents: "/api/canvas/{canvasId}/agent-tasks/{taskId}/events",
  agentTaskApprove: "/api/canvas/{canvasId}/agent-tasks/{taskId}/approve",
  agentTaskPause: "/api/canvas/{canvasId}/agent-tasks/{taskId}/pause",
  agentTaskResume: "/api/canvas/{canvasId}/agent-tasks/{taskId}/resume",
  agentTaskStop: "/api/canvas/{canvasId}/agent-tasks/{taskId}/stop",
  agentTaskReplan: "/api/canvas/{canvasId}/agent-tasks/{taskId}/replan",
  agentTaskInterject: "/api/canvas/{canvasId}/agent-tasks/{taskId}/interject",
  agentTaskRewind: "/api/canvas/{canvasId}/agent-tasks/{taskId}/rewind",
  agentModels: "/api/canvas/{canvasId}/agent-models",
  derivations: "/api/canvas/{canvasId}/derivations",
  derivation: "/api/canvas/{canvasId}/derivations/{derivationId}",
  derivationAttachTask: "/api/canvas/{canvasId}/derivations/{derivationId}/attach-task",
  derivationComplete: "/api/canvas/{canvasId}/derivations/{derivationId}/complete",
  derivationFail: "/api/canvas/{canvasId}/derivations/{derivationId}/fail",
  annotationLayers: "/api/canvas/{canvasId}/annotation-layers",
  directorArtifacts: "/api/canvas/{canvasId}/nodes/{nodeId}/director-artifacts",
} as const);

export const legacyCanvasApiPaths = Object.freeze({
  collection: "/api/creator/canvas-projects",
  item: "/api/creator/canvas-projects/{canvasProjectId}",
  restore: "/api/creator/canvas-projects/{canvasProjectId}/restore",
  document: "/api/creator/canvas-projects/{canvasProjectId}/canvas",
  revisions: "/api/creator/canvas-projects/{canvasProjectId}/revisions",
  revision: "/api/creator/canvas-projects/{canvasProjectId}/revisions/{revisionId}",
} as const);

export type CanvasStatusDto = "draft" | "active" | "archived" | "deleted";

export interface CanvasDto {
  id: string;
  projectId: null;
  title: string;
  createdAt: string;
  status: CanvasStatusDto;
}

export interface CanvasApiEnvelope<T> {
  requestId: string;
  data: T;
}

export interface CanvasApiErrorEnvelope {
  requestId: string;
  errorCode: string;
  message: string;
  details: Record<string, unknown>;
}

export interface ListCanvasesQueryDto {
  includeDeleted?: boolean;
}

export interface ListCanvasesResponseDto {
  projects: CanvasDto[];
}

export interface CanvasResponseDto {
  project: CanvasDto;
}

export interface CreateCanvasRequestDto {
  title?: string;
  status?: Exclude<CanvasStatusDto, "deleted">;
}

export interface UpdateCanvasRequestDto {
  title?: string;
  expectedTitle?: string;
  status?: Exclude<CanvasStatusDto, "deleted">;
}

export interface DeleteCanvasResponseDto {
  deletedProjectId: string;
}

export type CanvasDocumentDto = CanvasDocument;
export type CanvasDocumentRecordDto = CanvasRecord;

export interface CanvasDocumentResponseDto {
  canvas: CanvasDocumentRecordDto | null;
}

export interface SaveCanvasDocumentRequestDto {
  clientRevision: number;
  document: CanvasDocumentDto;
  events?: Array<Record<string, unknown>>;
}

export interface ListCanvasRevisionsQueryDto {
  limit?: number;
  beforeRevision?: number;
}

export interface ListCanvasRevisionsResponseDto {
  revisions: CanvasRevisionMetadataRecord[];
  hasMore: boolean;
  nextCursor: number | null;
}

export interface CanvasRevisionResponseDto {
  revision: CanvasRevisionRecord;
}

export interface CanvasGenerationHistoryQueryDto {
  nodeKey?: string;
  status?: string;
  mediaKind?: string;
  search?: string;
  limit?: number;
  cursor?: string;
  format?: "json";
}

export interface CanvasGenerationHistoryItemDto {
  id: string;
  nodeKey: string;
  runNo: number;
  status: string;
  mediaKind: string;
  modelCode: string | null;
  targetType: string | null;
  targetId: string | null;
  inputSnapshot: unknown;
  outputSnapshot: unknown;
  failure: unknown;
  taskId: string | null;
  artifacts: Array<Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
}

export interface ListCanvasGenerationHistoryResponseDto {
  items: CanvasGenerationHistoryItemDto[];
  nextCursor: string | null;
}

export interface DeleteCanvasGenerationRunResponseDto {
  id: string;
  deleted: true;
}

export interface DeleteCanvasGenerationHistoryRequestDto {
  scope: "all" | "node";
  nodeKey?: string;
}

export interface DeleteCanvasGenerationHistoryResponseDto {
  scope: "all" | "node";
  nodeKey: string | null;
  deletedCount: number;
}

export type CanvasSettingsDto = CanvasSettingsRecord;
export type CanvasSettingsPatchDto = CanvasSettingsPatch;

export interface UpdateCanvasSettingsRequestDto {
  expectedRevision: number;
  patch: CanvasSettingsPatchDto;
}

export interface UpdateCanvasArtifactTagsRequestDto {
  tags: string[];
}

export interface UpdateCanvasArtifactTagsResponseDto {
  artifactId: string;
  assetVersionId: string;
  tags: string[];
  actor: string;
}

export interface CanvasRuntimeCommandDto {
  clientMutationId?: string;
  [key: string]: unknown;
}

export interface CanvasNodeRunRequestDto extends CanvasRuntimeCommandDto {
  kind?: "text" | "image" | "video" | "audio" | "director";
  mediaKind?: "text" | "image" | "video" | "audio";
  modelCode?: string;
}

export interface CreateCanvasGenerationBatchRequestDto extends CanvasRuntimeCommandDto {
  nodes: Array<{
    nodeKey: string;
    mediaKind: "text" | "image" | "video" | "audio";
    dependsOn?: string[];
    payload?: Record<string, unknown>;
  }>;
}

export interface UpdateCanvasConversationRequestDto extends CanvasRuntimeCommandDto {
  conversationId: string;
  title?: string;
  status?: "active" | "archived";
  pinned?: boolean;
}

export interface CreateCanvasDerivationRequestDto extends CanvasRuntimeCommandDto {
  nodeKey: string;
  derivationType: string;
  baseCanvasRevision: number;
  source: {
    assetId: string | null;
    assetVersionId: string | null;
    storageObjectId: string | null;
  };
  requestSnapshot?: Record<string, unknown>;
  taskId?: string;
}

export interface CreateCanvasAnnotationLayerRequestDto extends CanvasRuntimeCommandDto {
  nodeKey: string;
  layerKind: "mask" | "raster_annotation" | "vector_annotation";
  projectionPolicy?: "retain" | "reproject" | "discard";
}

export interface CreateCanvasDirectorArtifactRequestDto extends CanvasRuntimeCommandDto {
  storageObjectId: string;
  directorDeskKey: string;
  artifactKind?: "image" | "video";
  expectedRevision?: number;
  metadata?: Record<string, unknown>;
}
