import { createHash, randomUUID } from "node:crypto";

import { operationNames } from "../../../../../packages/contracts/domain/operation-names.ts";
import {
  beginOrReplayCommand,
  type IdempotencyRecordStore,
  IdempotencyProcessingError,
  InMemoryIdempotencyRecordStore,
} from "../shared/idempotency/idempotency.service.ts";

export type ProjectSourceDocumentStatus = "draft" | "ready" | "parsed" | "failed";
export type ScriptStatus = ProjectSourceDocumentStatus;
export type ProjectAspectRatio = "9:16" | "16:9";
export type ProjectResolution = "720p" | "1080p";

export interface ProjectRecord {
  id: string;
  userId: string;
  name: string;
  coverImageUrl?: string | null;
  coverStorageObjectId?: string | null;
  aspectRatio: ProjectAspectRatio;
  resolution: ProjectResolution;
  phase: "script_input" | "asset_review" | "shot_generation" | "export";
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectSourceDocumentRecord {
  id: string;
  projectId: string;
  title?: string | null;
  coverImageUrl?: string | null;
  coverStorageObjectId?: string | null;
  deletedAt?: Date | null;
  status: ProjectSourceDocumentStatus;
  inputText: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ScriptRecord = ProjectSourceDocumentRecord;

export interface ProjectBundle {
  project: ProjectRecord;
  script: ProjectSourceDocumentRecord;
}

export interface WorkflowRequestRecord {
  workflowId: string;
  taskId: string;
  taskStatus: "queued" | "running";
  projectId: string;
  scriptId: string;
  operationName: string;
  createdAt: Date;
}

export interface CreateProjectDraftInput {
  userId: string;
  createdByUserId: string;
  name: string;
  scriptInput: string;
  aspectRatio: string;
  resolution: string;
  idempotencyKey: string;
}

export class CreateProjectValidationError extends Error {
  constructor(readonly fieldErrors: Record<string, string>) {
    super("create_project_validation_failed");
  }
}

export interface ProjectStore {
  readonly idempotency: IdempotencyRecordStore;
  createProjectWithScript(input: {
    userId: string;
    createdByUserId: string;
    name: string;
    scriptInput: string;
    aspectRatio: ProjectAspectRatio;
    resolution: ProjectResolution;
  }): Promise<ProjectBundle>;
  findProjectBundle(projectId: string): Promise<ProjectBundle | undefined>;
  findProject(projectId: string): Promise<ProjectRecord | undefined>;
  findProjectByUser(input: {
    userId: string;
    projectId: string;
  }): Promise<ProjectRecord | undefined>;
  findScript(scriptId: string): Promise<ScriptRecord | undefined>;
  findScriptByUser(input: {
    userId: string;
    scriptId: string;
  }): Promise<ScriptRecord | undefined>;
  updateScript(script: ScriptRecord): Promise<ScriptRecord>;
  saveWorkflowRequest(record: WorkflowRequestRecord): Promise<WorkflowRequestRecord>;
  findWorkflowRequest(workflowId: string): Promise<WorkflowRequestRecord | undefined>;
}

export class InMemoryProjectStore implements ProjectStore {
  readonly idempotency: IdempotencyRecordStore = new InMemoryIdempotencyRecordStore();
  private readonly bundlesByProjectId = new Map<string, ProjectBundle>();
  private readonly projectsById = new Map<string, ProjectRecord>();
  private readonly sourceDocumentsById = new Map<string, ProjectSourceDocumentRecord>();
  private readonly workflowRequestsById = new Map<string, WorkflowRequestRecord>();

  async createProjectWithScript(input: {
    userId: string;
    createdByUserId: string;
    name: string;
    scriptInput: string;
    aspectRatio: ProjectAspectRatio;
    resolution: ProjectResolution;
  }): Promise<ProjectBundle> {
    const now = new Date();
    const projectId = randomUUID();
    const sourceDocumentId = randomUUID();

    const project: ProjectRecord = {
      id: projectId,
      userId: input.userId,
      name: input.name,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      phase: "script_input",
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    };

    const sourceDocument: ProjectSourceDocumentRecord = {
      id: sourceDocumentId,
      projectId,
      status: "ready",
      inputText: input.scriptInput,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    };

    const bundle = { project, script: sourceDocument };
    this.bundlesByProjectId.set(project.id, bundle);
    this.projectsById.set(project.id, project);
    this.sourceDocumentsById.set(sourceDocument.id, sourceDocument);
    return bundle;
  }

  async findProjectBundle(projectId: string): Promise<ProjectBundle | undefined> {
    return this.bundlesByProjectId.get(projectId);
  }

  async findProject(projectId: string): Promise<ProjectRecord | undefined> {
    return this.projectsById.get(projectId);
  }

  async findProjectByUser(input: {
    userId: string;
    projectId: string;
  }): Promise<ProjectRecord | undefined> {
    const project = this.projectsById.get(input.projectId);
    return project?.userId === input.userId ? project : undefined;
  }

  async findScript(scriptId: string): Promise<ScriptRecord | undefined> {
    return this.sourceDocumentsById.get(scriptId);
  }

  async findScriptByUser(input: {
    userId: string;
    scriptId: string;
  }): Promise<ScriptRecord | undefined> {
    const script = this.sourceDocumentsById.get(input.scriptId);
    const project = script ? this.projectsById.get(script.projectId) : undefined;
    return project?.userId === input.userId ? script : undefined;
  }

  async updateScript(script: ScriptRecord): Promise<ScriptRecord> {
    this.sourceDocumentsById.set(script.id, script);
    const bundle = this.bundlesByProjectId.get(script.projectId);
    if (bundle) {
      this.bundlesByProjectId.set(script.projectId, {
        project: bundle.project,
        script,
      });
    }
    return script;
  }

  async saveWorkflowRequest(record: WorkflowRequestRecord): Promise<WorkflowRequestRecord> {
    this.workflowRequestsById.set(record.workflowId, record);
    return record;
  }

  async findWorkflowRequest(workflowId: string): Promise<WorkflowRequestRecord | undefined> {
    return this.workflowRequestsById.get(workflowId);
  }
}

export async function createProjectDraft(
  store: ProjectStore,
  input: CreateProjectDraftInput,
) {
  const fieldErrors = validateCreateProjectInput(input);
  if (Object.keys(fieldErrors).length > 0) {
    throw new CreateProjectValidationError(fieldErrors);
  }

  const requestHash = hashCreateProjectInput(input);
  const started = await beginOrReplayCommand(store.idempotency, {
    scopeKey: `user:${input.userId}`,
    userId: input.userId,
    operationName: operationNames.projectCreate,
    idempotencyKey: input.idempotencyKey,
    requestHash,
  });

  if (started.kind === "replayed" && started.record.responseResourceId) {
    const bundle = await store.findProjectBundle(started.record.responseResourceId);
    if (!bundle) {
      throw new Error("project_replay_missing_bundle");
    }

    return {
      ...bundle,
      idempotencyRecord: started.record,
      idempotencyResult: "replayed" as const,
    };
  }

  if (started.kind === "processing") {
    throw new IdempotencyProcessingError(started.record);
  }

  const bundle = await store.createProjectWithScript({
    userId: input.userId,
    createdByUserId: input.createdByUserId,
    name: input.name.trim(),
    scriptInput: input.scriptInput.trim(),
    aspectRatio: input.aspectRatio as ProjectAspectRatio,
    resolution: input.resolution as ProjectResolution,
  });

  const completed = await beginOrReplayCommand(store.idempotency, {
    scopeKey: `user:${input.userId}`,
    userId: input.userId,
    operationName: operationNames.projectCreate,
    idempotencyKey: input.idempotencyKey,
    requestHash,
    responseResourceType: "project",
    responseResourceId: bundle.project.id,
  });

  return {
    ...bundle,
    idempotencyRecord: completed.record,
    idempotencyResult: started.kind === "created" ? ("created" as const) : ("replayed" as const),
  };
}

export function validateCreateProjectInput(input: CreateProjectDraftInput) {
  const fieldErrors: Record<string, string> = {};

  if (input.name.trim().length < 1 || input.name.trim().length > 60) {
    fieldErrors.name = "name_length";
  }

  if (input.scriptInput.trim().length < 1) {
    fieldErrors.scriptInput = "script_required";
  }

  if (!["9:16", "16:9"].includes(input.aspectRatio)) {
    fieldErrors.aspectRatio = "aspect_ratio_unsupported";
  }

  if (!["720p", "1080p"].includes(input.resolution)) {
    fieldErrors.resolution = "resolution_unsupported";
  }

  return fieldErrors;
}

export function hashCreateProjectInput(input: CreateProjectDraftInput) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        name: input.name.trim(),
        scriptInput: input.scriptInput.trim(),
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
      }),
    )
    .digest("hex");
}
