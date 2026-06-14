import { createHash, randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import { CanvasValidationError, validateCanvasDocumentGraph } from "./creator-canvas-validation.ts";

export class CanvasConflictError extends Error {
  constructor(
    public readonly serverRevision: number,
    public readonly serverDocument: unknown,
  ) {
    super("canvas_revision_conflict");
    this.name = "CanvasConflictError";
  }
}

export class CanvasDocumentError extends Error {
  constructor(
    public readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = "CanvasDocumentError";
  }
}

export interface ProjectCanvasRecord {
  canvasProjectId: string;
  projectId: string;
  serverRevision: number;
  document: CanvasDocument;
  session?: {
    viewport: Record<string, unknown>;
    selectedNodeIds: string[];
    selectedEdgeIds: string[];
  };
}

export interface CanvasNodeRunRecord {
  id: string;
  runNo: number;
  status: string;
  taskId: string | null;
}

export interface CanvasNodeArtifactRecord {
  id: string;
  runId: string | null;
  artifactKind: string;
  assetId: string | null;
  assetVersionId: string | null;
  storageObjectId: string | null;
  url: string | null;
  thumbnailUrl: string | null;
  selected: boolean;
  selectionRole: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CanvasDocument {
  version: number;
  canvasProjectId: string;
  projectId: string;
  viewport: Record<string, unknown>;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groups?: unknown[];
  createdAt: string;
  updatedAt: string;
}

export interface CanvasNode {
  id: string;
  type: string;
  position?: { x?: number; y?: number };
  size?: { width?: number; height?: number };
  zIndex?: number;
  data?: Record<string, unknown>;
}

export interface CanvasEdge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  data?: Record<string, unknown>;
}

interface CanvasProjectRow {
  id: string;
  organization_id: string;
  workspace_id: string;
  project_id: string;
  title: string;
  server_revision: number;
  latest_document_id: string | null;
}

interface CanvasDocumentRow {
  id: string;
  server_revision: number;
  document_json: CanvasDocument;
  viewport_json: Record<string, unknown>;
}

export async function getOrCreateProjectCanvas(
  db: SqlDatabase,
  input: {
    organizationId: string;
    workspaceId: string;
    projectId: string;
    userId: string;
    now: Date;
  },
): Promise<ProjectCanvasRecord> {
  const existing = await findProjectCanvas(db, input);
  if (existing) {
    return existing;
  }

  const project = await queryOne<{ name: string }>(
    db,
    `
      SELECT name
      FROM projects
      WHERE organization_id = $1
        AND workspace_id = $2
        AND id = $3
      LIMIT 1
    `,
    [input.organizationId, input.workspaceId, input.projectId],
  );
  if (!project) {
    throw new CanvasDocumentError("project_not_found", "project not found");
  }

  const canvasProjectId = randomUUID();
  const documentId = randomUUID();
  const nowIso = input.now.toISOString();
  const document = createDefaultCanvasDocument({
    canvasProjectId,
    projectId: input.projectId,
    now: nowIso,
  });

  await db.query(
    `
      INSERT INTO creator_canvas_projects (
        id,
        organization_id,
        workspace_id,
        project_id,
        title,
        status,
        server_revision,
        created_by_user_id,
        updated_by_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, 'active', 1, $6, $6, $7, $7)
    `,
    [
      canvasProjectId,
      input.organizationId,
      input.workspaceId,
      input.projectId,
      `${project.name || "项目"} 画布`,
      input.userId,
      input.now,
    ],
  );

  await insertCanvasDocument(db, {
    documentId,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    canvasProjectId,
    projectId: input.projectId,
    serverRevision: 1,
    document,
    userId: input.userId,
    now: input.now,
  });

  await appendCanvasRevision(db, {
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    canvasProjectId,
    serverRevision: 1,
    operation: "create",
    document,
    userId: input.userId,
    now: input.now,
  });

  await db.query(
    `
      UPDATE creator_canvas_projects
      SET latest_document_id = $4,
          updated_by_user_id = $5,
          updated_at = $6
      WHERE organization_id = $1
        AND workspace_id = $2
        AND id = $3
    `,
    [input.organizationId, input.workspaceId, canvasProjectId, documentId, input.userId, input.now],
  );

  return {
    canvasProjectId,
    projectId: input.projectId,
    serverRevision: 1,
    document,
    session: {
      viewport: document.viewport,
      selectedNodeIds: [],
      selectedEdgeIds: [],
    },
  };
}

export async function findProjectCanvas(
  db: SqlDatabase,
  input: {
    organizationId: string;
    workspaceId: string;
    projectId: string;
  },
): Promise<ProjectCanvasRecord | null> {
  const canvas = await queryOne<CanvasProjectRow>(
    db,
    `
      SELECT id, organization_id, workspace_id, project_id, title, server_revision, latest_document_id
      FROM creator_canvas_projects
      WHERE organization_id = $1
        AND workspace_id = $2
        AND project_id = $3
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [input.organizationId, input.workspaceId, input.projectId],
  );
  if (!canvas) {
    return null;
  }
  const document = await queryOne<CanvasDocumentRow>(
    db,
    `
      SELECT id, server_revision, document_json, viewport_json
      FROM creator_canvas_documents
      WHERE organization_id = $1
        AND canvas_project_id = $2
        AND server_revision = $3
      LIMIT 1
    `,
    [input.organizationId, canvas.id, canvas.server_revision],
  );
  const normalized = normalizeCanvasDocument(document?.document_json ?? {}, {
    canvasProjectId: canvas.id,
    projectId: input.projectId,
    now: new Date().toISOString(),
  });
  return {
    canvasProjectId: canvas.id,
    projectId: input.projectId,
    serverRevision: canvas.server_revision,
    document: normalized,
    session: {
      viewport: document?.viewport_json ?? normalized.viewport,
      selectedNodeIds: [],
      selectedEdgeIds: [],
    },
  };
}

export async function findCanvasByCanvasProjectId(
  db: SqlDatabase,
  input: {
    organizationId: string;
    workspaceId?: string;
    canvasProjectId: string;
  },
): Promise<ProjectCanvasRecord | null> {
  const canvas = await queryOne<CanvasProjectRow>(
    db,
    `
      SELECT id, organization_id, workspace_id, project_id, title, server_revision, latest_document_id
      FROM creator_canvas_projects
      WHERE organization_id = $1
        AND id = $2
        AND ($3::uuid IS NULL OR workspace_id = $3)
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [input.organizationId, input.canvasProjectId, input.workspaceId ?? null],
  );
  if (!canvas) {
    return null;
  }
  return findProjectCanvas(db, {
    organizationId: input.organizationId,
    workspaceId: canvas.workspace_id,
    projectId: canvas.project_id,
  });
}

export async function saveProjectCanvas(
  db: SqlDatabase,
  input: {
    organizationId: string;
    workspaceId: string;
    projectId: string;
    userId: string;
    clientRevision: number;
    document: unknown;
    events?: Array<Record<string, unknown>>;
    now: Date;
  },
): Promise<ProjectCanvasRecord> {
  const canvas = await queryOne<CanvasProjectRow>(
    db,
    `
      SELECT id, organization_id, workspace_id, project_id, title, server_revision, latest_document_id
      FROM creator_canvas_projects
      WHERE organization_id = $1
        AND workspace_id = $2
        AND project_id = $3
        AND deleted_at IS NULL
      LIMIT 1
      FOR UPDATE
    `,
    [input.organizationId, input.workspaceId, input.projectId],
  );
  if (!canvas) {
    throw new CanvasDocumentError("canvas_project_not_found", "canvas project not found");
  }
  if (Number(input.clientRevision) !== canvas.server_revision) {
    const server = await findProjectCanvas(db, input);
    throw new CanvasConflictError(canvas.server_revision, server?.document ?? null);
  }

  const document = normalizeCanvasDocument(input.document, {
    canvasProjectId: canvas.id,
    projectId: input.projectId,
    now: input.now.toISOString(),
  });
  validateCanvasDocumentOwnership(document, {
    canvasProjectId: canvas.id,
    projectId: input.projectId,
  });
  validateCanvasDocumentGraph(document);

  const nextRevision = canvas.server_revision + 1;
  const documentId = randomUUID();
  await insertCanvasDocument(db, {
    documentId,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    canvasProjectId: canvas.id,
    projectId: input.projectId,
    serverRevision: nextRevision,
    document,
    userId: input.userId,
    now: input.now,
  });

  await syncCanvasNodesAndEdges(db, {
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    canvasProjectId: canvas.id,
    document,
    userId: input.userId,
    now: input.now,
  });

  await appendCanvasRevision(db, {
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    canvasProjectId: canvas.id,
    serverRevision: nextRevision,
    operation: "autosave",
    document,
    userId: input.userId,
    now: input.now,
  });

  await appendCanvasEvents(db, {
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    canvasProjectId: canvas.id,
    serverRevision: nextRevision,
    events: input.events ?? [],
    actorUserId: input.userId,
  });

  await db.query(
    `
      UPDATE creator_canvas_projects
      SET server_revision = $4,
          latest_document_id = $5,
          updated_by_user_id = $6,
          updated_at = $7
      WHERE organization_id = $1
        AND workspace_id = $2
        AND id = $3
    `,
    [input.organizationId, input.workspaceId, canvas.id, nextRevision, documentId, input.userId, input.now],
  );

  return {
    canvasProjectId: canvas.id,
    projectId: input.projectId,
    serverRevision: nextRevision,
    document,
    session: {
      viewport: document.viewport,
      selectedNodeIds: [],
      selectedEdgeIds: [],
    },
  };
}

export async function createCanvasNodeRun(
  db: SqlDatabase,
  input: {
    organizationId: string;
    workspaceId: string;
    canvasProjectId: string;
    nodeKey: string;
    idempotencyKey: string;
    status?: string;
    mediaKind: string;
    modelCode?: string | null;
    episodeId?: string | null;
    targetType?: string | null;
    targetId?: string | null;
    inputSnapshot?: Record<string, unknown>;
    taskId?: string | null;
    userId?: string | null;
    now: Date;
  },
): Promise<CanvasNodeRunRecord> {
  const existing = await queryOne<{
    id: string;
    run_no: number;
    status: string;
    task_id: string | null;
  }>(
    db,
    `
      SELECT id, run_no, status, task_id
      FROM creator_canvas_node_runs
      WHERE organization_id = $1
        AND idempotency_key = $2
      LIMIT 1
    `,
    [input.organizationId, input.idempotencyKey],
  );
  if (existing) {
    return {
      id: existing.id,
      runNo: existing.run_no,
      status: existing.status,
      taskId: existing.task_id,
    };
  }

  const runNoRow = await queryOne<{ next_run_no: number }>(
    db,
    `
      SELECT COALESCE(MAX(run_no), 0) + 1 AS next_run_no
      FROM creator_canvas_node_runs
      WHERE canvas_project_id = $1
        AND node_key = $2
    `,
    [input.canvasProjectId, input.nodeKey],
  );
  const id = randomUUID();
  const runNo = Number(runNoRow?.next_run_no ?? 1);
  const row = await queryOne<{
    id: string;
    run_no: number;
    status: string;
    task_id: string | null;
  }>(
    db,
    `
      INSERT INTO creator_canvas_node_runs (
        id,
        organization_id,
        workspace_id,
        canvas_project_id,
        node_key,
        run_no,
        idempotency_key,
        status,
        media_kind,
        model_code,
        episode_id,
        target_type,
        target_id,
        input_snapshot_json,
        task_id,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16, $17, $17)
      RETURNING id, run_no, status, task_id
    `,
    [
      id,
      input.organizationId,
      input.workspaceId,
      input.canvasProjectId,
      input.nodeKey,
      runNo,
      input.idempotencyKey,
      input.status ?? "created",
      normalizeMediaKind(input.mediaKind),
      input.modelCode ?? null,
      input.episodeId ?? null,
      input.targetType ?? null,
      input.targetId ?? null,
      JSON.stringify(input.inputSnapshot ?? {}),
      input.taskId ?? null,
      input.userId ?? null,
      input.now,
    ],
  );
  return {
    id: row!.id,
    runNo: row!.run_no,
    status: row!.status,
    taskId: row!.task_id,
  };
}

export async function markCanvasNodeRunQueued(
  db: SqlDatabase,
  input: {
    organizationId: string;
    runId: string;
    taskId?: string | null;
    now: Date;
  },
) {
  const row = await queryOne<{
    id: string;
    run_no: number;
    status: string;
    task_id: string | null;
  }>(
    db,
    `
      UPDATE creator_canvas_node_runs
      SET status = 'queued',
          task_id = COALESCE($3, task_id),
          updated_at = $4
      WHERE organization_id = $1
        AND id = $2
      RETURNING id, run_no, status, task_id
    `,
    [input.organizationId, input.runId, input.taskId ?? null, input.now],
  );
  return row
    ? { id: row.id, runNo: row.run_no, status: row.status, taskId: row.task_id }
    : null;
}

export async function completeCanvasNodeRun(
  db: SqlDatabase,
  input: {
    organizationId: string;
    runId: string;
    taskId?: string | null;
    attemptId?: string | null;
    providerRequestId?: string | null;
    generationSnapshotId?: string | null;
    outputSnapshot?: Record<string, unknown>;
    now: Date;
  },
) {
  const row = await queryOne<{
    id: string;
    run_no: number;
    status: string;
    task_id: string | null;
  }>(
    db,
    `
      UPDATE creator_canvas_node_runs
      SET status = 'succeeded',
          task_id = COALESCE($3, task_id),
          attempt_id = COALESCE($4, attempt_id),
          provider_request_id = COALESCE($5, provider_request_id),
          generation_snapshot_id = COALESCE($6, generation_snapshot_id),
          output_snapshot_json = $7::jsonb,
          completed_at = $8,
          updated_at = $8
      WHERE organization_id = $1
        AND id = $2
      RETURNING id, run_no, status, task_id
    `,
    [
      input.organizationId,
      input.runId,
      input.taskId ?? null,
      input.attemptId ?? null,
      input.providerRequestId ?? null,
      input.generationSnapshotId ?? null,
      JSON.stringify(input.outputSnapshot ?? {}),
      input.now,
    ],
  );
  return row
    ? { id: row.id, runNo: row.run_no, status: row.status, taskId: row.task_id }
    : null;
}

export async function failCanvasNodeRun(
  db: SqlDatabase,
  input: {
    organizationId: string;
    runId: string;
    taskId?: string | null;
    status?: string;
    failure?: Record<string, unknown>;
    now: Date;
  },
) {
  const status = normalizeRunStatus(input.status ?? "failed");
  const row = await queryOne<{
    id: string;
    run_no: number;
    status: string;
    task_id: string | null;
  }>(
    db,
    `
      UPDATE creator_canvas_node_runs
      SET status = $3,
          task_id = COALESCE($4, task_id),
          failure_json = $5::jsonb,
          completed_at = $6,
          updated_at = $6
      WHERE organization_id = $1
        AND id = $2
      RETURNING id, run_no, status, task_id
    `,
    [input.organizationId, input.runId, status, input.taskId ?? null, JSON.stringify(input.failure ?? {}), input.now],
  );
  return row
    ? { id: row.id, runNo: row.run_no, status: row.status, taskId: row.task_id }
    : null;
}

export async function appendCanvasNodeArtifact(
  db: SqlDatabase,
  input: {
    organizationId: string;
    workspaceId: string;
    canvasProjectId: string;
    nodeKey: string;
    runId?: string | null;
    artifactKind: string;
    assetId?: string | null;
    assetVersionId?: string | null;
    storageObjectId?: string | null;
    url?: string | null;
    thumbnailUrl?: string | null;
    selected?: boolean;
    selectionRole?: string;
    metadata?: Record<string, unknown>;
    userId?: string | null;
    now: Date;
  },
): Promise<{ id: string }> {
  const selectionRole = String(input.selectionRole ?? "current").trim() || "current";
  if (input.selected) {
    await db.query(
      `
        UPDATE creator_canvas_node_artifacts
        SET selected = false,
            updated_at = $5
        WHERE organization_id = $1
          AND canvas_project_id = $2
          AND node_key = $3
          AND selection_role = $4
          AND selected = true
          AND deleted_at IS NULL
      `,
      [input.organizationId, input.canvasProjectId, input.nodeKey, selectionRole, input.now],
    );
  }
  const row = await queryOne<{ id: string }>(
    db,
    `
      INSERT INTO creator_canvas_node_artifacts (
        id,
        organization_id,
        workspace_id,
        canvas_project_id,
        node_key,
        run_id,
        artifact_kind,
        asset_id,
        asset_version_id,
        storage_object_id,
        url,
        thumbnail_url,
        selected,
        selection_role,
        metadata_json,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, $17, $17)
      RETURNING id
    `,
    [
      randomUUID(),
      input.organizationId,
      input.workspaceId,
      input.canvasProjectId,
      input.nodeKey,
      input.runId ?? null,
      normalizeMediaKind(input.artifactKind, "unknown"),
      input.assetId ?? null,
      input.assetVersionId ?? null,
      input.storageObjectId ?? null,
      input.url ?? null,
      input.thumbnailUrl ?? null,
      Boolean(input.selected),
      selectionRole,
      JSON.stringify(input.metadata ?? {}),
      input.userId ?? null,
      input.now,
    ],
  );
  return { id: row!.id };
}

export async function selectCanvasNodeArtifact(
  db: SqlDatabase,
  input: {
    organizationId: string;
    canvasProjectId: string;
    artifactId: string;
    selectionRole?: string;
    userId?: string | null;
    now: Date;
  },
) {
  const artifact = await queryOne<{ node_key: string; selection_role: string }>(
    db,
    `
      SELECT node_key, selection_role
      FROM creator_canvas_node_artifacts
      WHERE organization_id = $1
        AND canvas_project_id = $2
        AND id = $3
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [input.organizationId, input.canvasProjectId, input.artifactId],
  );
  if (!artifact) {
    throw new CanvasDocumentError("canvas_artifact_not_found", "canvas artifact not found");
  }
  const selectionRole = String(input.selectionRole ?? artifact.selection_role ?? "current").trim() || "current";
  await db.query(
    `
      UPDATE creator_canvas_node_artifacts
      SET selected = false,
          updated_at = $5
      WHERE organization_id = $1
        AND canvas_project_id = $2
        AND node_key = $3
        AND selection_role = $4
        AND selected = true
        AND deleted_at IS NULL
    `,
    [input.organizationId, input.canvasProjectId, artifact.node_key, selectionRole, input.now],
  );
  const row = await queryOne<{ id: string }>(
    db,
    `
      UPDATE creator_canvas_node_artifacts
      SET selected = true,
          selection_role = $4,
          updated_at = $5
      WHERE organization_id = $1
        AND canvas_project_id = $2
        AND id = $3
        AND deleted_at IS NULL
      RETURNING id
    `,
    [input.organizationId, input.canvasProjectId, input.artifactId, selectionRole, input.now],
  );
  return { id: row!.id };
}

export async function listCanvasNodeRuns(
  db: SqlDatabase,
  input: {
    organizationId: string;
    canvasProjectId: string;
    nodeKey: string;
    limit?: number;
  },
) {
  const result = await db.query<{
    id: string;
    run_no: number;
    status: string;
    media_kind: string;
    model_code: string | null;
    episode_id: string | null;
    target_type: string | null;
    target_id: string | null;
    input_snapshot_json: Record<string, unknown> | string;
    output_snapshot_json: Record<string, unknown> | string;
    task_id: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(
    `
      SELECT id, run_no, status, media_kind, model_code, episode_id, target_type, target_id,
             input_snapshot_json, output_snapshot_json, task_id, created_at, updated_at
      FROM creator_canvas_node_runs
      WHERE organization_id = $1
        AND canvas_project_id = $2
        AND node_key = $3
      ORDER BY run_no DESC
      LIMIT $4
    `,
    [input.organizationId, input.canvasProjectId, input.nodeKey, Math.max(1, Math.min(100, input.limit ?? 50))],
  );
  const artifacts = await db.query<{
    id: string;
    run_id: string | null;
    artifact_kind: string;
    asset_id: string | null;
    asset_version_id: string | null;
    storage_object_id: string | null;
    url: string | null;
    thumbnail_url: string | null;
    selected: boolean;
    selection_role: string;
    metadata_json: Record<string, unknown> | string;
    created_at: Date | string;
  }>(
    `
      SELECT id, run_id, artifact_kind, asset_id, asset_version_id, storage_object_id,
             url, thumbnail_url, selected, selection_role, metadata_json, created_at
      FROM creator_canvas_node_artifacts
      WHERE organization_id = $1
        AND canvas_project_id = $2
        AND node_key = $3
        AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT $4
    `,
    [input.organizationId, input.canvasProjectId, input.nodeKey, Math.max(1, Math.min(200, (input.limit ?? 50) * 4))],
  );
  const artifactsByRun = new Map<string, CanvasNodeArtifactRecord[]>();
  const orphanArtifacts: CanvasNodeArtifactRecord[] = [];
  for (const artifact of artifacts.rows) {
    const item = serializeArtifactRow(artifact);
    if (artifact.run_id) {
      const list = artifactsByRun.get(artifact.run_id) ?? [];
      list.push(item);
      artifactsByRun.set(artifact.run_id, list);
    } else {
      orphanArtifacts.push(item);
    }
  }
  return {
    runs: result.rows.map((row) => ({
      id: row.id,
      runNo: row.run_no,
      status: row.status,
      mediaKind: row.media_kind,
      modelCode: row.model_code,
      episodeId: row.episode_id,
      targetType: row.target_type,
      targetId: row.target_id,
      inputSnapshot: readJsonRecord(row.input_snapshot_json),
      outputSnapshot: readJsonRecord(row.output_snapshot_json),
      taskId: row.task_id,
      artifacts: artifactsByRun.get(row.id) ?? [],
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    })),
    artifacts: artifacts.rows.map(serializeArtifactRow),
    orphanArtifacts,
  };
}

export async function attachCanvasTaskResultToHistory(
  db: SqlDatabase,
  input: {
    organizationId: string;
    workspaceId: string;
    projectId: string;
    nodeKey: string;
    taskId: string;
    mediaKind: string;
    result?: Record<string, unknown> | null;
    failure?: Record<string, unknown> | null;
    userId?: string | null;
    now: Date;
  },
) {
  const canvas = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM creator_canvas_projects
      WHERE organization_id = $1
        AND workspace_id = $2
        AND project_id = $3
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [input.organizationId, input.workspaceId, input.projectId],
  );
  if (!canvas) {
    return null;
  }
  const run = await queryOne<{ id: string; status: string }>(
    db,
    `
      SELECT id, status
      FROM creator_canvas_node_runs
      WHERE organization_id = $1
        AND canvas_project_id = $2
        AND node_key = $3
        AND task_id = $4
      ORDER BY run_no DESC
      LIMIT 1
    `,
    [input.organizationId, canvas.id, input.nodeKey, input.taskId],
  );
  const resolvedRun = run ?? await createCanvasNodeRun(db, {
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    canvasProjectId: canvas.id,
    nodeKey: input.nodeKey,
    idempotencyKey: `canvas-history:${input.taskId}`,
    status: input.result ? "queued" : "running",
    mediaKind: input.mediaKind,
    taskId: input.taskId,
    targetType: "canvas",
    targetId: input.nodeKey,
    inputSnapshot: { taskId: input.taskId, recoveredFromGenerationTask: true },
    userId: input.userId ?? null,
    now: input.now,
  });
  if (input.failure) {
    await failCanvasNodeRun(db, {
      organizationId: input.organizationId,
      runId: resolvedRun.id,
      taskId: input.taskId,
      failure: input.failure,
      now: input.now,
    });
    return { runId: resolvedRun.id, artifactId: null };
  }
  if (!input.result) {
    await markCanvasNodeRunQueued(db, {
      organizationId: input.organizationId,
      runId: resolvedRun.id,
      taskId: input.taskId,
      now: input.now,
    });
    return { runId: resolvedRun.id, artifactId: null };
  }
  const existingArtifact = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM creator_canvas_node_artifacts
      WHERE organization_id = $1
        AND canvas_project_id = $2
        AND run_id = $3
        AND metadata_json->>'taskId' = $4
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [input.organizationId, canvas.id, resolvedRun.id, input.taskId],
  );
  await completeCanvasNodeRun(db, {
    organizationId: input.organizationId,
    runId: resolvedRun.id,
    taskId: input.taskId,
    outputSnapshot: input.result,
    now: input.now,
  });
  if (existingArtifact) {
    return { runId: resolvedRun.id, artifactId: existingArtifact.id };
  }
  const artifact = await appendCanvasNodeArtifact(db, {
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    canvasProjectId: canvas.id,
    nodeKey: input.nodeKey,
    runId: resolvedRun.id,
    artifactKind: input.mediaKind,
    assetId: nullableString(input.result.assetId),
    assetVersionId: nullableString(input.result.assetVersionId),
    storageObjectId: nullableString(input.result.storageObjectId ?? input.result.fileId),
    url: resultPrimaryUrl(input.result, input.mediaKind),
    thumbnailUrl: nullableString(input.result.thumbnailUrl ?? input.result.coverImageUrl),
    selected: true,
    selectionRole: "current",
    metadata: {
      ...input.result,
      taskId: input.taskId,
    },
    userId: input.userId ?? null,
    now: input.now,
  });
  return { runId: resolvedRun.id, artifactId: artifact.id };
}

function createDefaultCanvasDocument(input: {
  canvasProjectId: string;
  projectId: string;
  now: string;
}): CanvasDocument {
  return {
    version: 2,
    canvasProjectId: input.canvasProjectId,
    projectId: input.projectId,
    viewport: { x: 0, y: 0, zoom: 1, gridVisible: true, snapEnabled: true },
    nodes: [],
    edges: [],
    groups: [],
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function normalizeCanvasDocument(
  value: unknown,
  input: { canvasProjectId: string; projectId: string; now: string },
): CanvasDocument {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const nodes = Array.isArray(raw.nodes) ? raw.nodes.map(normalizeCanvasNode).filter(Boolean) as CanvasNode[] : [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = Array.isArray(raw.edges)
    ? raw.edges.map(normalizeCanvasEdge).filter((edge): edge is CanvasEdge =>
        Boolean(edge && nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId)),
      )
    : [];
  const createdAt = typeof raw.createdAt === "string" && raw.createdAt ? raw.createdAt : input.now;
  return {
    version: Number(raw.version ?? 2) || 2,
    canvasProjectId: String(raw.canvasProjectId ?? input.canvasProjectId),
    projectId: String(raw.projectId ?? input.projectId),
    viewport: normalizeViewport(raw.viewport),
    nodes,
    edges,
    groups: Array.isArray(raw.groups) ? raw.groups : [],
    createdAt,
    updatedAt: input.now,
  };
}

function validateCanvasDocumentOwnership(
  document: CanvasDocument,
  input: { canvasProjectId: string; projectId: string },
) {
  if (document.canvasProjectId !== input.canvasProjectId) {
    throw new CanvasDocumentError("canvas_project_mismatch", "canvas project id mismatch");
  }
  if (document.projectId !== input.projectId) {
    throw new CanvasDocumentError("canvas_document_project_mismatch", "canvas document project id mismatch");
  }
}

function normalizeCanvasNode(value: unknown): CanvasNode | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const id = String(raw.id ?? "").trim();
  if (!id) {
    return null;
  }
  const data = raw.data && typeof raw.data === "object" ? raw.data as Record<string, unknown> : {};
  return {
    id,
    type: String(raw.type ?? "output").trim() || "output",
    position: normalizePoint(raw.position),
    size: normalizeSize(raw.size),
    zIndex: Number.isFinite(Number(raw.zIndex)) ? Number(raw.zIndex) : 0,
    data,
  };
}

function normalizeCanvasEdge(value: unknown): CanvasEdge | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const id = String(raw.id ?? "").trim();
  const sourceNodeId = String(raw.sourceNodeId ?? "").trim();
  const sourcePortId = String(raw.sourcePortId ?? "").trim();
  const targetNodeId = String(raw.targetNodeId ?? "").trim();
  const targetPortId = String(raw.targetPortId ?? "").trim();
  if (!id || !sourceNodeId || !sourcePortId || !targetNodeId || !targetPortId) {
    return null;
  }
  return {
    id,
    sourceNodeId,
    sourcePortId,
    targetNodeId,
    targetPortId,
    data: raw.data && typeof raw.data === "object" ? raw.data as Record<string, unknown> : {},
  };
}

function normalizePoint(value: unknown) {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    x: finiteNumber(raw.x, 0),
    y: finiteNumber(raw.y, 0),
  };
}

function normalizeSize(value: unknown) {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    width: finiteNumber(raw.width, 360),
    height: finiteNumber(raw.height, 240),
  };
}

function normalizeViewport(value: unknown) {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    x: finiteNumber(raw.x, 0),
    y: finiteNumber(raw.y, 0),
    zoom: finiteNumber(raw.zoom, 1),
    gridVisible: raw.gridVisible !== false,
    snapEnabled: raw.snapEnabled !== false,
  };
}

function finiteNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function insertCanvasDocument(
  db: SqlDatabase,
  input: {
    documentId: string;
    organizationId: string;
    workspaceId: string;
    canvasProjectId: string;
    projectId: string;
    serverRevision: number;
    document: CanvasDocument;
    userId: string;
    now: Date;
  },
) {
  await db.query(
    `
      INSERT INTO creator_canvas_documents (
        id,
        organization_id,
        workspace_id,
        canvas_project_id,
        project_id,
        schema_version,
        server_revision,
        document_json,
        x6_graph_json,
        viewport_json,
        node_count,
        edge_count,
        content_hash,
        created_by_user_id,
        updated_by_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, '{}'::jsonb, $9::jsonb, $10, $11, $12, $13, $13, $14, $14)
    `,
    [
      input.documentId,
      input.organizationId,
      input.workspaceId,
      input.canvasProjectId,
      input.projectId,
      input.document.version,
      input.serverRevision,
      JSON.stringify(input.document),
      JSON.stringify(input.document.viewport),
      input.document.nodes.length,
      input.document.edges.length,
      hashJson(input.document),
      input.userId,
      input.now,
    ],
  );
}

async function syncCanvasNodesAndEdges(
  db: SqlDatabase,
  input: {
    organizationId: string;
    workspaceId: string;
    canvasProjectId: string;
    document: CanvasDocument;
    userId: string;
    now: Date;
  },
) {
  const activeNodeIds = input.document.nodes.map((node) => node.id);
  if (activeNodeIds.length) {
    await db.query(
      `
        UPDATE creator_canvas_nodes
        SET deleted_at = $4,
            updated_by_user_id = $5,
            updated_at = $4
        WHERE organization_id = $1
          AND canvas_project_id = $2
          AND deleted_at IS NULL
          AND NOT (node_key = ANY($3::text[]))
      `,
      [input.organizationId, input.canvasProjectId, activeNodeIds, input.now, input.userId],
    );
  } else {
    await db.query(
      `
        UPDATE creator_canvas_nodes
        SET deleted_at = $3,
            updated_by_user_id = $4,
            updated_at = $3
        WHERE organization_id = $1
          AND canvas_project_id = $2
          AND deleted_at IS NULL
      `,
      [input.organizationId, input.canvasProjectId, input.now, input.userId],
    );
  }

  for (const [index, node] of input.document.nodes.entries()) {
    const data = node.data ?? {};
    await db.query(
      `
        INSERT INTO creator_canvas_nodes (
          id, organization_id, workspace_id, canvas_project_id, node_key, node_type,
          title, status, media_kind, source_kind, model_code,
          position_x, position_y, width, height, z_index, group_key, sort_order,
          port_schema_json, data_json, runtime_json, deleted_at,
          created_by_user_id, updated_by_user_id, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17, $18,
          $19::jsonb, $20::jsonb, $21::jsonb, NULL,
          $22, $22, $23, $23
        )
        ON CONFLICT (canvas_project_id, node_key)
        DO UPDATE SET
          node_type = EXCLUDED.node_type,
          title = EXCLUDED.title,
          status = EXCLUDED.status,
          media_kind = EXCLUDED.media_kind,
          source_kind = EXCLUDED.source_kind,
          model_code = EXCLUDED.model_code,
          position_x = EXCLUDED.position_x,
          position_y = EXCLUDED.position_y,
          width = EXCLUDED.width,
          height = EXCLUDED.height,
          z_index = EXCLUDED.z_index,
          group_key = EXCLUDED.group_key,
          sort_order = EXCLUDED.sort_order,
          port_schema_json = EXCLUDED.port_schema_json,
          data_json = EXCLUDED.data_json,
          runtime_json = EXCLUDED.runtime_json,
          deleted_at = NULL,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = EXCLUDED.updated_at
      `,
      [
        randomUUID(),
        input.organizationId,
        input.workspaceId,
        input.canvasProjectId,
        node.id,
        node.type,
        String(data.title ?? node.type ?? node.id),
        String(data.status ?? "idle"),
        nullableString(data.mediaKind),
        nullableString(data.source),
        nullableString(data.modelCode),
        node.position?.x ?? 0,
        node.position?.y ?? 0,
        node.size?.width ?? 360,
        node.size?.height ?? 240,
        node.zIndex ?? 0,
        nullableString(data.groupKey),
        index,
        JSON.stringify(data.ports ?? { inputs: [], outputs: [] }),
        JSON.stringify(data),
        JSON.stringify(data.runtime ?? {}),
        input.userId,
        input.now,
      ],
    );
  }

  const activeEdgeIds = input.document.edges.map((edge) => edge.id);
  if (activeEdgeIds.length) {
    await db.query(
      `
        UPDATE creator_canvas_edges
        SET deleted_at = $4,
            updated_by_user_id = $5,
            updated_at = $4
        WHERE organization_id = $1
          AND canvas_project_id = $2
          AND deleted_at IS NULL
          AND NOT (edge_key = ANY($3::text[]))
      `,
      [input.organizationId, input.canvasProjectId, activeEdgeIds, input.now, input.userId],
    );
  } else {
    await db.query(
      `
        UPDATE creator_canvas_edges
        SET deleted_at = $3,
            updated_by_user_id = $4,
            updated_at = $3
        WHERE organization_id = $1
          AND canvas_project_id = $2
          AND deleted_at IS NULL
      `,
      [input.organizationId, input.canvasProjectId, input.now, input.userId],
    );
  }

  for (const edge of input.document.edges) {
    await db.query(
      `
        INSERT INTO creator_canvas_edges (
          id, organization_id, workspace_id, canvas_project_id, edge_key,
          source_node_key, source_port_id, target_node_key, target_port_id,
          edge_kind, status, router_json, data_json, deleted_at,
          created_by_user_id, updated_by_user_id, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, '{}'::jsonb, $12::jsonb, NULL,
          $13, $13, $14, $14
        )
        ON CONFLICT (canvas_project_id, edge_key)
        DO UPDATE SET
          source_node_key = EXCLUDED.source_node_key,
          source_port_id = EXCLUDED.source_port_id,
          target_node_key = EXCLUDED.target_node_key,
          target_port_id = EXCLUDED.target_port_id,
          edge_kind = EXCLUDED.edge_kind,
          status = EXCLUDED.status,
          data_json = EXCLUDED.data_json,
          deleted_at = NULL,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = EXCLUDED.updated_at
      `,
      [
        randomUUID(),
        input.organizationId,
        input.workspaceId,
        input.canvasProjectId,
        edge.id,
        edge.sourceNodeId,
        edge.sourcePortId,
        edge.targetNodeId,
        edge.targetPortId,
        String(edge.data?.kind ?? "any"),
        String(edge.data?.status ?? "idle"),
        JSON.stringify(edge.data ?? {}),
        input.userId,
        input.now,
      ],
    );
  }
}

async function appendCanvasRevision(
  db: SqlDatabase,
  input: {
    organizationId: string;
    workspaceId: string;
    canvasProjectId: string;
    serverRevision: number;
    operation: string;
    document: CanvasDocument;
    userId: string;
    now: Date;
  },
) {
  await db.query(
    `
      INSERT INTO creator_canvas_revisions (
        id, organization_id, workspace_id, canvas_project_id,
        server_revision, operation, document_json, summary_json,
        created_by_user_id, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)
    `,
    [
      randomUUID(),
      input.organizationId,
      input.workspaceId,
      input.canvasProjectId,
      input.serverRevision,
      input.operation,
      JSON.stringify(input.document),
      JSON.stringify({ nodeCount: input.document.nodes.length, edgeCount: input.document.edges.length }),
      input.userId,
      input.now,
    ],
  );
}

async function appendCanvasEvents(
  db: SqlDatabase,
  input: {
    organizationId: string;
    workspaceId: string;
    canvasProjectId: string;
    serverRevision: number;
    events: Array<Record<string, unknown>>;
    actorUserId: string;
  },
) {
  for (const event of input.events) {
    await db.query(
      `
        INSERT INTO creator_canvas_events (
          id, organization_id, workspace_id, canvas_project_id,
          server_revision, event_type, target_type, target_key, patch_json,
          actor_user_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, now())
      `,
      [
        randomUUID(),
        input.organizationId,
        input.workspaceId,
        input.canvasProjectId,
        input.serverRevision,
        String(event.type ?? event.eventType ?? "canvas.updated"),
        String(event.targetType ?? "canvas"),
        nullableString(event.targetKey),
        JSON.stringify(event.patch ?? event),
        input.actorUserId,
      ],
    );
  }
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function nullableString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeMediaKind(value: unknown, fallback = "text") {
  const text = String(value ?? fallback).trim();
  if (["image", "video", "audio", "text", "multimodal", "asset", "unknown"].includes(text)) {
    return text;
  }
  return fallback;
}

function normalizeRunStatus(value: unknown) {
  const text = String(value ?? "failed").trim();
  if (["created", "queued", "running", "succeeded", "failed", "canceled", "result_unknown", "manual_review_required"].includes(text)) {
    return text;
  }
  return "failed";
}

function readJsonRecord(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function serializeArtifactRow(row: {
  id: string;
  run_id: string | null;
  artifact_kind: string;
  asset_id: string | null;
  asset_version_id: string | null;
  storage_object_id: string | null;
  url: string | null;
  thumbnail_url: string | null;
  selected: boolean;
  selection_role: string;
  metadata_json: Record<string, unknown> | string;
  created_at: Date | string;
}): CanvasNodeArtifactRecord {
  return {
    id: row.id,
    runId: row.run_id,
    artifactKind: row.artifact_kind,
    assetId: row.asset_id,
    assetVersionId: row.asset_version_id,
    storageObjectId: row.storage_object_id,
    url: row.url,
    thumbnailUrl: row.thumbnail_url,
    selected: row.selected,
    selectionRole: row.selection_role,
    metadata: readJsonRecord(row.metadata_json),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function resultPrimaryUrl(result: Record<string, unknown>, mediaKind: string) {
  const preferred = mediaKind === "video"
    ? result.videoUrl ?? result.sourceUrl ?? result.url ?? result.previewUrl ?? result.downloadUrl
    : result.imageUrl ?? result.sourceUrl ?? result.url ?? result.previewUrl ?? result.downloadUrl;
  return nullableString(preferred);
}

export function canvasErrorToStatus(error: unknown) {
  if (error instanceof CanvasConflictError) {
    return 409;
  }
  if (error instanceof CanvasDocumentError || error instanceof CanvasValidationError) {
    return 400;
  }
  return 500;
}
