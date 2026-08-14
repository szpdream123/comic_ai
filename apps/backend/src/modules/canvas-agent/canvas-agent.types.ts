export const canvasAgentModes = ["b", "c", "plan", "expert"] as const;
export type CanvasAgentMode = (typeof canvasAgentModes)[number];

export const canvasAgentCapabilityProfiles = ["canvas", "media_generation_only"] as const;
export type CanvasAgentCapabilityProfile = (typeof canvasAgentCapabilityProfiles)[number];

export const canvasAgentTaskStatuses = [
  "queued",
  "running",
  "waiting_approval",
  "waiting_external",
  "paused",
  "succeeded",
  "failed",
  "cancel_requested",
  "canceled",
  "result_unknown",
  "manual_review_required",
] as const;
export type CanvasAgentTaskStatus = (typeof canvasAgentTaskStatuses)[number];

export const canvasAgentStepStatuses = [
  "created",
  "running",
  "waiting_approval",
  "waiting_external",
  "succeeded",
  "failed",
  "canceled",
  "skipped",
  "result_unknown",
  "manual_review_required",
] as const;
export type CanvasAgentStepStatus = (typeof canvasAgentStepStatuses)[number];

export type CanvasAgentToolEffect =
  | "read"
  | "canvas_write"
  | "media_generation"
  | "asset_write"
  | "memory_write"
  | "config_write"
  | "external_network"
  | "mcp";

export interface CanvasAgentActor {
  ownerUserId: string;
  actorTeamMemberId?: string | null;
  capabilities: ReadonlySet<string>;
}

export interface CanvasAgentTaskRecord {
  id: string;
  canvasId: string;
  conversationId: string;
  workflowId: string;
  workflowTaskId: string;
  ownerUserId: string;
  actorTeamMemberId: string | null;
  mode: CanvasAgentMode;
  status: CanvasAgentTaskStatus;
  modelCode: string;
  modelConfigSnapshot: Record<string, unknown>;
  budget: Record<string, unknown>;
  metrics: Record<string, unknown>;
  currentStepId: string | null;
  baseRevision: number;
  eventSequence: number;
  failureCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CanvasAgentStepRecord {
  id: string;
  taskId: string;
  stepNo: number;
  kind: string;
  status: CanvasAgentStepStatus;
  toolId: string | null;
  callId: string | null;
  input: Record<string, unknown>;
  inputFingerprint: string;
  effect: CanvasAgentToolEffect;
  approvalId: string | null;
  providerRequestId: string | null;
  generationTaskId: string | null;
  creditReservationId: string | null;
  checkpoint: Record<string, unknown>;
  outputSummary: string | null;
  errorCode: string | null;
}

export interface CanvasAgentEventRecord {
  id: string;
  taskId: string;
  sequence: number;
  eventType: string;
  event: Record<string, unknown>;
  createdAt: Date;
}

export interface CanvasAgentModelSnapshot {
  version: 1;
  modelConfigId: string;
  modelCode: string;
  displayName?: string;
  providerName: string;
  providerModel: string;
  providerProtocol: string;
  providerConfigRevisionId: string;
  credentialVersionRef: string;
  capabilities: Record<string, unknown>;
  pricing: Record<string, unknown>;
  limits: Record<string, unknown>;
  providerConfig: Record<string, unknown>;
}

export interface CanvasAgentGenerationIntake {
  create(input: {
    canvasId: string;
    conversationId: string;
    agentTaskId: string;
    agentStepId: string;
    ownerUserId: string;
    actorTeamMemberId: string | null;
    idempotencyKey: string;
    kind: "image" | "video" | "audio";
    placement?: "canvas" | "detached";
    targetNodeId?: string | null;
    request: Record<string, unknown>;
  }): Promise<{ generationTaskId: string; workflowId?: string }>;
}
