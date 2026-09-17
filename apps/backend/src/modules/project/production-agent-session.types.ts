export const productionAgentSessionModes = ["ask", "auto"] as const;
export type ProductionAgentSessionMode = (typeof productionAgentSessionModes)[number];

export const productionAgentSessionTaskStatuses = [
  "queued",
  "running",
  "waiting_approval",
  "paused",
  "succeeded",
  "failed",
  "canceled",
] as const;
export type ProductionAgentSessionTaskStatus = (typeof productionAgentSessionTaskStatuses)[number];

export const productionAgentSessionTools = [
  "load_skill",
  "list_skill_files",
  "read_skill_file",
  "read_source",
  "write_artifact",
  "read_artifact",
  "ask_user",
  "format_project",
  "create_project",
] as const;
export type ProductionAgentSessionToolId = (typeof productionAgentSessionTools)[number];

export interface ProductionAgentSessionActor {
  ownerUserId: string;
  actorTeamMemberId?: string | null;
  capabilities: ReadonlySet<string>;
}

export interface ProductionAgentSkillCatalogItem {
  id: string;
  name: string;
  description: string;
  files: Array<{ path: string; kind: string }>;
}

export interface ProductionAgentWorkspace {
  artifacts: Record<string, string>;
  projectJson: Record<string, unknown> | null;
  reshapePending?: boolean;
}

export interface ProductionAgentConversationRecord {
  id: string;
  ownerUserId: string;
  actorTeamMemberId: string | null;
  title: string;
  status: "active" | "archived";
  mode: ProductionAgentSessionMode;
  modelCode: string;
  source: Record<string, unknown> & {
    text?: string;
    previewText?: string;
    totalChars?: number;
  };
  skillCatalog: ProductionAgentSkillCatalogItem[];
  workspace: ProductionAgentWorkspace;
  createdProjectId: string | null;
  taskId: string | null;
  taskStatus: ProductionAgentSessionTaskStatus | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionAgentSessionTaskRecord {
  id: string;
  conversationId: string;
  workflowId: string;
  workflowTaskId: string;
  ownerUserId: string;
  actorTeamMemberId: string | null;
  mode: ProductionAgentSessionMode;
  status: ProductionAgentSessionTaskStatus;
  modelCode: string;
  modelConfigSnapshot: Record<string, unknown>;
  currentStepId: string | null;
  eventSequence: number;
  failureCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductionAgentSessionEventRecord {
  id: string;
  taskId: string;
  sequence: number;
  eventType: string;
  event: Record<string, unknown>;
  createdAt: Date;
}

export interface ProductionAgentSessionMessageRecord {
  id: string;
  taskId: string | null;
  sequence: number;
  role: "system" | "user" | "assistant" | "tool";
  content: Record<string, unknown>;
  createdAt: string;
}
