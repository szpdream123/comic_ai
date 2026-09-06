import { createHash, randomUUID } from "node:crypto";

import {
  assertCanvasActorAction,
  type CanvasAction,
  type CanvasActorScope,
} from "../identity/canvas-actor-scope.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import {
  CanvasValidationError,
} from "./creator-canvas-validation.ts";

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

export interface CanvasRecord {
  canvasProjectId: string;
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
  reused?: boolean;
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
  kind?: "execution" | "reference" | "layout" | "control";
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  data?: Record<string, unknown>;
}

interface CanvasProjectRow {
  id: string;
  title: string;
  status?: string;
  server_revision: number;
  latest_document_id: string | null;
  created_at?: Date | string;
  updated_at?: Date | string;
}

interface CanvasDocumentRow {
  id: string;
  server_revision: number;
  document_json: CanvasDocument;
  viewport_json: Record<string, unknown>;
  content_hash?: string | null;
}

interface CachedCanvasDocument {
  documentJson: string;
  viewportJson: string;
  bytes: number;
}

interface CanvasDocumentCache {
  entries: Map<string, CachedCanvasDocument>;
  totalBytes: number;
}

const canvasDocumentCacheMaxEntries = 32;
const canvasDocumentCacheMaxBytes = 16 * 1024 * 1024;
const canvasDocumentCaches = new WeakMap<SqlDatabase, CanvasDocumentCache>();

function canvasDocumentCacheKey(canvasProjectId: string, documentId: string, serverRevision: number) {
  return `${canvasProjectId}:${documentId}:${serverRevision}`;
}

function readCachedCanvasDocument(db: SqlDatabase, key: string) {
  const cache = canvasDocumentCaches.get(db);
  const cached = cache?.entries.get(key);
  if (!cache || !cached) return null;
  cache.entries.delete(key);
  cache.entries.set(key, cached);
  return {
    documentJson: JSON.parse(cached.documentJson) as CanvasDocument,
    viewportJson: JSON.parse(cached.viewportJson) as Record<string, unknown>,
  };
}

function cacheCanvasDocument(
  db: SqlDatabase,
  key: string,
  documentJson: CanvasDocument,
  viewportJson: Record<string, unknown>,
) {
  const serializedDocument = JSON.stringify(documentJson);
  const serializedViewport = JSON.stringify(viewportJson);
  const bytes = (serializedDocument.length + serializedViewport.length) * 2;
  if (bytes > canvasDocumentCacheMaxBytes) return;
  const cache = canvasDocumentCaches.get(db) ?? { entries: new Map(), totalBytes: 0 };
  canvasDocumentCaches.set(db, cache);
  const previous = cache.entries.get(key);
  if (previous) cache.totalBytes -= previous.bytes;
  cache.entries.delete(key);
  cache.entries.set(key, {
    documentJson: serializedDocument,
    viewportJson: serializedViewport,
    bytes,
  });
  cache.totalBytes += bytes;
  while (
    cache.entries.size > canvasDocumentCacheMaxEntries ||
    cache.totalBytes > canvasDocumentCacheMaxBytes
  ) {
    const oldestKey = cache.entries.keys().next().value as string | undefined;
    if (!oldestKey) break;
    const oldest = cache.entries.get(oldestKey);
    cache.entries.delete(oldestKey);
    cache.totalBytes -= oldest?.bytes ?? 0;
  }
}

interface CanvasRevisionRow {
  id: string;
  canvas_project_id: string;
  server_revision: number;
  operation: string;
  document_json?: unknown;
  summary_json: Record<string, unknown> | string;
  created_at: Date | string;
}

export type CanvasRecordAccess =
  | { actorScope: CanvasActorScope; userId?: string }
  | { actorScope?: undefined; userId: string };

function resolveCanvasRecordAccess(
  input: CanvasRecordAccess & { canvasProjectId: string },
  action: CanvasAction,
) {
  if (input.actorScope) {
    if (input.actorScope.canvasId !== input.canvasProjectId) {
      throw new CanvasDocumentError("canvas_scope_mismatch", "canvas actor scope does not match canvas project");
    }
    if (input.userId && input.userId !== input.actorScope.ownerUserId) {
      throw new CanvasDocumentError("canvas_scope_owner_mismatch", "canvas actor scope owner does not match user");
    }
    assertCanvasActorAction(input.actorScope, action);
    return {
      ownerUserId: input.actorScope.ownerUserId,
      actorTeamMemberId: input.actorScope.actorTeamMemberId,
      principalKey: input.actorScope.principalKey,
    };
  }
  return {
    ownerUserId: input.userId,
    actorTeamMemberId: null,
    principalKey: `owner:${input.userId}`,
  };
}

export interface CanvasRevisionMetadataRecord {
  id: string;
  canvasProjectId: string;
  serverRevision: number;
  operation: string;
  summary: Record<string, unknown>;
  createdAt: string;
}

export interface CanvasRevisionRecord extends CanvasRevisionMetadataRecord {
  document: CanvasDocument;
}

export async function findCanvasByCanvasProjectId(
  db: SqlDatabase,
  input: CanvasRecordAccess & {
    canvasProjectId: string;
  },
): Promise<CanvasRecord | null> {
  const access = resolveCanvasRecordAccess(input, "view");
  const canvas = await queryOne<CanvasProjectRow>(
    db,
    `
      SELECT id, title, server_revision, latest_document_id
      FROM creator_canvas_projects
      WHERE id = $1
        AND created_by_user_id = $2
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [input.canvasProjectId, access.ownerUserId],
  );
  if (!canvas) {
    return null;
  }
  const documentCacheKey = canvas.latest_document_id
    ? canvasDocumentCacheKey(canvas.id, canvas.latest_document_id, canvas.server_revision)
    : null;
  const cachedDocument = documentCacheKey
    ? readCachedCanvasDocument(db, documentCacheKey)
    : null;
  const document = cachedDocument
    ? {
        id: canvas.latest_document_id!,
        server_revision: canvas.server_revision,
        document_json: cachedDocument.documentJson,
        viewport_json: cachedDocument.viewportJson,
      }
    : await queryOne<CanvasDocumentRow>(
        db,
        `
          SELECT id, server_revision, document_json, viewport_json
          FROM creator_canvas_documents
          WHERE canvas_project_id = $1
            AND server_revision = $2
          LIMIT 1
        `,
        [canvas.id, canvas.server_revision],
      );
  if (!cachedDocument && documentCacheKey && document) {
    cacheCanvasDocument(db, documentCacheKey, document.document_json, document.viewport_json);
  }
  let normalized = canonicalizeCanvasDocumentOwnership(normalizeCanvasDocument(document?.document_json ?? {}, {
    canvasProjectId: canvas.id,
    now: new Date().toISOString(),
  }), {
    canvasProjectId: canvas.id,
  });
  const positions = await db.query<{ node_key: string; position_x: number; position_y: number }>(`
    SELECT node_key, position_x, position_y
    FROM creator_canvas_nodes
    WHERE canvas_project_id = $1 AND deleted_at IS NULL
  `, [canvas.id]);
  if (positions.rows.length) {
    const positionByKey = new Map(positions.rows.map((position) => [String(position.node_key), position]));
    normalized = {
      ...normalized,
      nodes: normalized.nodes.map((node) => {
        const position = positionByKey.get(String(node.id));
        return position
          ? { ...node, position: { x: Number(position.position_x), y: Number(position.position_y) } }
          : node;
      }),
    };
  }
  return {
    canvasProjectId: canvas.id,
    serverRevision: canvas.server_revision,
    document: normalized,
    session: {
      viewport: document?.viewport_json ?? normalized.viewport,
      selectedNodeIds: [],
      selectedEdgeIds: [],
    },
  };
}

export async function listCanvasRevisions(
  db: SqlDatabase,
  input: CanvasRecordAccess & {
    canvasProjectId: string;
    limit?: number;
    beforeRevision?: number;
  },
): Promise<CanvasRevisionMetadataRecord[] | null> {
  const canvas = await findCanvasByCanvasProjectId(db, input);
  if (!canvas) {
    return null;
  }
  const requestedLimit = Number(input.limit ?? 50);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(100, Math.max(1, Math.trunc(requestedLimit)))
    : 50;
  const requestedBeforeRevision = Number(input.beforeRevision);
  const beforeRevision = Number.isFinite(requestedBeforeRevision) && requestedBeforeRevision > 0
    ? Math.trunc(requestedBeforeRevision)
    : null;
  const params: Array<string | number | null> = [canvas.canvasProjectId];
  const beforeClause = beforeRevision === null
    ? ""
    : (() => {
        params.push(beforeRevision);
        return `AND server_revision < $${params.length}`;
      })();
  params.push(limit);
  const result = await db.query<CanvasRevisionRow>(
    `
      SELECT id, canvas_project_id, server_revision, operation,
             summary_json, created_at
      FROM creator_canvas_revisions
      WHERE canvas_project_id = $1
        ${beforeClause}
      ORDER BY server_revision DESC, created_at DESC, id DESC
      LIMIT $${params.length}
    `,
    params,
  );
  return result.rows.map(serializeCanvasRevisionMetadata);
}

export async function getCanvasRevision(
  db: SqlDatabase,
  input: CanvasRecordAccess & {
    canvasProjectId: string;
    revisionId: string;
  },
): Promise<CanvasRevisionRecord | null> {
  const canvas = await findCanvasByCanvasProjectId(db, input);
  if (!canvas) {
    return null;
  }
  const revision = await queryOne<CanvasRevisionRow>(
    db,
    `
      SELECT id, canvas_project_id, server_revision, operation,
             document_json, summary_json, created_at
      FROM creator_canvas_revisions
      WHERE canvas_project_id = $1
        AND id = $2
      LIMIT 1
    `,
    [canvas.canvasProjectId, input.revisionId],
  );
  if (!revision) {
    return null;
  }
  const document = canonicalizeCanvasDocumentOwnership(normalizeCanvasDocument(revision.document_json, {
    canvasProjectId: canvas.canvasProjectId,
    now: new Date(revision.created_at).toISOString(),
  }), {
    canvasProjectId: canvas.canvasProjectId,
  });
  return {
    ...serializeCanvasRevisionMetadata(revision),
    document,
  };
}

export async function ensureCanvasCheckpointRevision(
  db: SqlDatabase,
  input: CanvasRecordAccess & {
    canvasProjectId: string;
    now: Date;
  },
): Promise<number> {
  const access = resolveCanvasRecordAccess(input, "edit");
  await db.query("BEGIN");
  try {
    const locked = await queryOne<{ id: string; server_revision: number }>(db, `
      SELECT id,server_revision
      FROM creator_canvas_projects
      WHERE id=$1 AND created_by_user_id=$2 AND deleted_at IS NULL
      LIMIT 1 FOR UPDATE
    `, [input.canvasProjectId, access.ownerUserId]);
    if (!locked) throw new CanvasDocumentError("canvas_project_not_found", "canvas project not found");
    const existing = await queryOne<{ id: string }>(db, `
      SELECT id FROM creator_canvas_revisions
      WHERE canvas_project_id=$1 AND server_revision=$2
      LIMIT 1
    `, [locked.id, locked.server_revision]);
    if (!existing) {
      const canvas = await findCanvasByCanvasProjectId(db, input);
      if (!canvas || canvas.serverRevision !== locked.server_revision) {
        throw new CanvasDocumentError("canvas_checkpoint_source_not_found", "canvas checkpoint source not found");
      }
      await appendCanvasRevision(db, {
        canvasProjectId: locked.id,
        serverRevision: locked.server_revision,
        operation: "agent_checkpoint",
        document: canvas.document,
        userId: access.ownerUserId,
        actorTeamMemberId: access.actorTeamMemberId,
        now: input.now,
      });
    }
    await db.query("COMMIT");
    return locked.server_revision;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function saveCanvasByCanvasProjectId(
  db: SqlDatabase,
  input: CanvasRecordAccess & {
    canvasProjectId: string;
    clientRevision: number;
    document: unknown;
    events?: Array<Record<string, unknown>>;
    now: Date;
  },
): Promise<CanvasRecord> {
  const access = resolveCanvasRecordAccess(input, "edit");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await db.query("BEGIN");
    try {
  const canvas = await queryOne<CanvasProjectRow>(
    db,
    `
      SELECT id, title, server_revision, latest_document_id
      FROM creator_canvas_projects
      WHERE id = $1
        AND created_by_user_id = $2
        AND deleted_at IS NULL
      LIMIT 1
      FOR UPDATE
    `,
    [input.canvasProjectId, access.ownerUserId],
  );
  if (!canvas) {
    throw new CanvasDocumentError("canvas_project_not_found", "canvas project not found");
  }
  if (Number(input.clientRevision) !== canvas.server_revision) {
    const server = await findCanvasByCanvasProjectId(db, input);
    throw new CanvasConflictError(canvas.server_revision, server?.document ?? null);
  }

  const document = canonicalizeCanvasDocumentOwnership(normalizeCanvasDocument(input.document, {
    canvasProjectId: canvas.id,
    now: input.now.toISOString(),
  }), {
    canvasProjectId: canvas.id,
  });

  const currentDocument = await findCurrentCanvasDocument(db, canvas.id, canvas.server_revision);
  if (currentDocument?.content_hash === hashCanvasDocument(document)) {
    await db.query("COMMIT");
    return {
      canvasProjectId: canvas.id,
      serverRevision: canvas.server_revision,
      document: currentDocument.document_json,
      session: { viewport: currentDocument.viewport_json, selectedNodeIds: [], selectedEdgeIds: [] },
    };
  }

  const nextRevision = canvas.server_revision + 1;
  const documentId = canvas.latest_document_id ?? randomUUID();
  await insertCanvasDocument(db, {
    documentId,
    canvasProjectId: canvas.id,
    serverRevision: nextRevision,
    document,
    userId: access.ownerUserId,
    now: input.now,
  });

  await syncCanvasNodesAndEdges(db, {
    canvasProjectId: canvas.id,
    document,
    userId: access.ownerUserId,
    now: input.now,
  });

  await appendCanvasRevision(db, {
    canvasProjectId: canvas.id,
    serverRevision: nextRevision,
    operation: "autosave",
    document,
    userId: access.ownerUserId,
    actorTeamMemberId: access.actorTeamMemberId,
    now: input.now,
  });

  await appendCanvasEvents(db, {
    canvasProjectId: canvas.id,
    serverRevision: nextRevision,
    events: input.events ?? [],
    actorUserId: access.ownerUserId,
    actorTeamMemberId: access.actorTeamMemberId,
  });

  await db.query(
    `
      UPDATE creator_canvas_projects
      SET server_revision = $2,
          latest_document_id = $3,
          updated_by_user_id = $4,
          updated_at = $5
      WHERE id = $1
    `,
    [canvas.id, nextRevision, documentId, access.ownerUserId, input.now],
  );

  await db.query("COMMIT");

  return {
    canvasProjectId: canvas.id,
    serverRevision: nextRevision,
    document,
    session: {
      viewport: document.viewport,
      selectedNodeIds: [],
      selectedEdgeIds: [],
    },
  };
    } catch (error) {
      await db.query("ROLLBACK").catch(() => undefined);
      if (isRetryableCanvasTransactionError(error) && attempt < 2) {
        await new Promise<void>((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
  throw new CanvasDocumentError("canvas_save_failed", "canvas could not be saved");
}

export async function saveCanvasNodePositionsByCanvasProjectId(
  db: SqlDatabase,
  input: CanvasRecordAccess & {
    canvasProjectId: string;
    clientRevision: number;
    positions: Array<{ nodeKey: string; x: number; y: number }>;
    now: Date;
  },
): Promise<Pick<CanvasRecord, "canvasProjectId" | "serverRevision">> {
  const access = resolveCanvasRecordAccess(input, "edit");
  await db.query("BEGIN");
  try {
    const canvas = await queryOne<CanvasProjectRow>(db, `
      SELECT id, title, server_revision, latest_document_id
      FROM creator_canvas_projects
      WHERE id = $1 AND created_by_user_id = $2 AND deleted_at IS NULL
      LIMIT 1 FOR UPDATE
    `, [input.canvasProjectId, access.ownerUserId]);
    if (!canvas) throw new CanvasDocumentError("canvas_project_not_found", "canvas project not found");
    if (Number(input.clientRevision) !== canvas.server_revision) {
      const server = await findCanvasByCanvasProjectId(db, input);
      throw new CanvasConflictError(canvas.server_revision, server?.document ?? null);
    }
    await db.query(`
      WITH positions(node_key, position_x, position_y) AS (
        SELECT node_key, position_x, position_y
        FROM jsonb_to_recordset($2::jsonb) AS item(node_key text, position_x numeric, position_y numeric)
      )
      UPDATE creator_canvas_nodes AS node
      SET position_x = positions.position_x, position_y = positions.position_y,
          updated_by_user_id = $3, updated_at = $4
      FROM positions
      WHERE node.canvas_project_id = $1 AND node.node_key = positions.node_key AND node.deleted_at IS NULL
    `, [canvas.id, JSON.stringify(input.positions.map((item) => ({
      node_key: item.nodeKey, position_x: item.x, position_y: item.y,
    }))), access.ownerUserId, input.now]);
    await db.query(`
      UPDATE creator_canvas_projects
      SET updated_by_user_id = $2, updated_at = $3
      WHERE id = $1
    `, [canvas.id, access.ownerUserId, input.now]);
    await db.query("COMMIT");
    return { canvasProjectId: canvas.id, serverRevision: canvas.server_revision };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

function isRetryableCanvasTransactionError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  return code === "40P01" || code === "40001";
}

export async function createCanvasNodeRun(
  db: SqlDatabase,
  input: {
    canvasProjectId: string;
    nodeKey: string;
    idempotencyKey: string;
    status?: string;
    mediaKind: string;
    modelCode?: string | null;
    targetType?: string | null;
    targetId?: string | null;
    inputSnapshot?: Record<string, unknown>;
    taskId?: string | null;
    userId?: string | null;
    actorScope?: CanvasActorScope;
    now: Date;
  },
): Promise<CanvasNodeRunRecord> {
  const access = input.actorScope
    ? resolveCanvasRecordAccess({ canvasProjectId: input.canvasProjectId, actorScope: input.actorScope }, "run")
    : {
        ownerUserId: input.userId ?? null,
        actorTeamMemberId: null,
        principalKey: null,
      };
  const idempotencyKey = access.principalKey
    ? `${access.principalKey}:${input.idempotencyKey}`
    : input.idempotencyKey;
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
      WHERE canvas_project_id = $1
        AND idempotency_key = $2
      LIMIT 1
    `,
    [input.canvasProjectId, idempotencyKey],
  );
  if (existing) {
    return {
      id: existing.id,
      runNo: existing.run_no,
      status: existing.status,
      taskId: existing.task_id,
      reused: true,
    };
  }

  // `MAX(run_no) + 1` is only a candidate under concurrent starts. Let the
  // unique node/run index arbitrate, then retry with a fresh candidate.
  for (let attempt = 0; attempt < 8; attempt += 1) {
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
          canvas_project_id,
          node_key,
          run_no,
          idempotency_key,
          status,
          media_kind,
          model_code,
          target_type,
          target_id,
          input_snapshot_json,
          task_id,
          created_by_user_id,
          actor_team_member_id,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, $15)
        ON CONFLICT DO NOTHING
        RETURNING id, run_no, status, task_id
      `,
      [
        id,
        input.canvasProjectId,
        input.nodeKey,
        runNo,
        idempotencyKey,
        input.status ?? "created",
        normalizeMediaKind(input.mediaKind),
        input.modelCode ?? null,
        input.targetType ?? null,
        input.targetId ?? null,
        JSON.stringify(input.inputSnapshot ?? {}),
        input.taskId ?? null,
        access.ownerUserId,
        access.actorTeamMemberId,
        input.now,
      ],
    );
    if (row) {
      return {
        id: row.id,
        runNo: row.run_no,
        status: row.status,
        taskId: row.task_id,
        reused: false,
      };
    }
    const raced = await queryOne<{
      id: string;
      run_no: number;
      status: string;
      task_id: string | null;
    }>(
      db,
      `
        SELECT id, run_no, status, task_id
        FROM creator_canvas_node_runs
        WHERE canvas_project_id = $1
          AND idempotency_key = $2
        LIMIT 1
      `,
      [input.canvasProjectId, idempotencyKey],
    );
    if (raced) {
      return {
        id: raced.id,
        runNo: raced.run_no,
        status: raced.status,
        taskId: raced.task_id,
        reused: true,
      };
    }
  }
  throw new CanvasDocumentError("canvas_node_run_create_conflict", "canvas node run could not be created");
}

export async function markCanvasNodeRunQueued(
  db: SqlDatabase,
  input: {
    runId: string;
    canvasProjectId: string;
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
      WHERE id = $1
        AND canvas_project_id = $2
      RETURNING id, run_no, status, task_id
    `,
    [input.runId, input.canvasProjectId, input.taskId ?? null, input.now],
  );
  return row
    ? { id: row.id, runNo: row.run_no, status: row.status, taskId: row.task_id }
    : null;
}

export async function completeCanvasNodeRun(
  db: SqlDatabase,
  input: {
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
          task_id = COALESCE($2, task_id),
          attempt_id = COALESCE($3, attempt_id),
          provider_request_id = COALESCE($4, provider_request_id),
          generation_snapshot_id = COALESCE($5, generation_snapshot_id),
          output_snapshot_json = $6::jsonb,
          completed_at = $7,
          updated_at = $7
      WHERE id = $1
      RETURNING id, run_no, status, task_id
    `,
    [
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
      SET status = $2,
          task_id = COALESCE($3, task_id),
          failure_json = $4::jsonb,
          completed_at = $5,
          updated_at = $5
      WHERE id = $1
      RETURNING id, run_no, status, task_id
    `,
    [input.runId, status, input.taskId ?? null, JSON.stringify(input.failure ?? {}), input.now],
  );
  return row
    ? { id: row.id, runNo: row.run_no, status: row.status, taskId: row.task_id }
    : null;
}

export async function completeCanvasTextNodeRun(
  db: SqlDatabase,
  input: {
    runId: string;
    canvasProjectId: string;
    nodeKey: string;
    outputSnapshot: Record<string, unknown>;
    artifactMetadata: Record<string, unknown>;
    userId: string;
    now: Date;
  },
) {
  await db.query("BEGIN");
  try {
    const run = await queryOne<{ id: string; run_no: number; status: string }>(
      db,
      `
        SELECT id, run_no, status
        FROM creator_canvas_node_runs
        WHERE id = $1
          AND canvas_project_id = $2
          AND node_key = $3
        LIMIT 1
        FOR UPDATE
      `,
      [input.runId, input.canvasProjectId, input.nodeKey],
    );
    if (!run) {
      throw new CanvasDocumentError("canvas_node_run_not_found", "canvas node run not found");
    }

    await completeCanvasNodeRun(db, {
      runId: run.id,
      outputSnapshot: input.outputSnapshot,
      now: input.now,
    });

    let artifact = await queryOne<{ id: string }>(
      db,
      `
        SELECT id
        FROM creator_canvas_node_artifacts
        WHERE canvas_project_id = $1
          AND node_key = $2
          AND run_id = $3
          AND artifact_kind = 'text'
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [input.canvasProjectId, input.nodeKey, run.id],
    );
    if (!artifact) {
      artifact = await appendCanvasNodeArtifact(db, {
        canvasProjectId: input.canvasProjectId,
        nodeKey: input.nodeKey,
        runId: run.id,
        artifactKind: "text",
        selected: true,
        selectionRole: "current",
        metadata: input.artifactMetadata,
        userId: input.userId,
        now: input.now,
      });
    }

    await db.query("COMMIT");
    return {
      run: { id: run.id, runNo: run.run_no, status: "succeeded" },
      artifact,
    };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function failCanvasTextNodeRun(
  db: SqlDatabase,
  input: {
    runId: string;
    canvasProjectId: string;
    nodeKey: string;
    failure: Record<string, unknown>;
    now: Date;
  },
) {
  await db.query("BEGIN");
  try {
    const run = await queryOne<{ id: string; run_no: number }>(
      db,
      `
        SELECT id, run_no
        FROM creator_canvas_node_runs
        WHERE id = $1
          AND canvas_project_id = $2
          AND node_key = $3
        LIMIT 1
        FOR UPDATE
      `,
      [input.runId, input.canvasProjectId, input.nodeKey],
    );
    if (!run) {
      throw new CanvasDocumentError("canvas_node_run_not_found", "canvas node run not found");
    }
    await failCanvasNodeRun(db, {
      runId: run.id,
      status: "failed",
      failure: input.failure,
      now: input.now,
    });
    await db.query("COMMIT");
    return {
      run: { id: run.id, runNo: run.run_no, status: "failed" },
    };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function appendCanvasNodeArtifact(
  db: SqlDatabase,
  input: {
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
            updated_at = $4
        WHERE canvas_project_id = $1
          AND node_key = $2
          AND selection_role = $3
          AND selected = true
          AND deleted_at IS NULL
      `,
      [input.canvasProjectId, input.nodeKey, selectionRole, input.now],
    );
  }
  const row = await queryOne<{ id: string }>(
    db,
    `
      INSERT INTO creator_canvas_node_artifacts (
        id,
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $15)
      RETURNING id
    `,
    [
      randomUUID(),
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
    canvasProjectId: string;
    artifactId: string;
    selectionRole?: string;
    userId?: string | null;
    actorScope?: CanvasActorScope;
    now: Date;
  },
) {
  if (input.actorScope) {
    resolveCanvasRecordAccess({ canvasProjectId: input.canvasProjectId, actorScope: input.actorScope }, "edit");
  }
  const artifact = await queryOne<{ node_key: string; selection_role: string }>(
    db,
    `
      SELECT node_key, selection_role
      FROM creator_canvas_node_artifacts
      WHERE canvas_project_id = $1
        AND id = $2
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [input.canvasProjectId, input.artifactId],
  );
  if (!artifact) {
    throw new CanvasDocumentError("canvas_artifact_not_found", "canvas artifact not found");
  }
  const selectionRole = String(input.selectionRole ?? artifact.selection_role ?? "current").trim() || "current";
  await db.query(
    `
      UPDATE creator_canvas_node_artifacts
      SET selected = false,
          updated_at = $4
      WHERE canvas_project_id = $1
        AND node_key = $2
        AND selection_role = $3
        AND selected = true
        AND deleted_at IS NULL
    `,
    [input.canvasProjectId, artifact.node_key, selectionRole, input.now],
  );
  const row = await queryOne<{ id: string }>(
    db,
    `
      UPDATE creator_canvas_node_artifacts
      SET selected = true,
          selection_role = $3,
          updated_at = $4
      WHERE canvas_project_id = $1
        AND id = $2
        AND deleted_at IS NULL
      RETURNING id
    `,
    [input.canvasProjectId, input.artifactId, selectionRole, input.now],
  );
  return { id: row!.id };
}

export async function listCanvasNodeRuns(
  db: SqlDatabase,
  input: {
    canvasProjectId: string;
    nodeKey: string;
    limit?: number;
    actorScope?: CanvasActorScope;
  },
) {
  if (input.actorScope) {
    resolveCanvasRecordAccess({ canvasProjectId: input.canvasProjectId, actorScope: input.actorScope }, "view");
  }
  const result = await db.query<{
    id: string;
    run_no: number;
    status: string;
    media_kind: string;
    model_code: string | null;
    target_type: string | null;
    target_id: string | null;
    input_snapshot_json: Record<string, unknown> | string;
    output_snapshot_json: Record<string, unknown> | string;
    failure_json: Record<string, unknown> | string;
    task_id: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(
    `
      SELECT id, run_no, status, media_kind, model_code, target_type, target_id,
             input_snapshot_json, output_snapshot_json, failure_json, task_id, created_at, updated_at
      FROM creator_canvas_node_runs
      WHERE canvas_project_id = $1
        AND node_key = $2
      ORDER BY run_no DESC
      LIMIT $3
    `,
    [input.canvasProjectId, input.nodeKey, Math.max(1, Math.min(100, input.limit ?? 50))],
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
      WHERE canvas_project_id = $1
        AND node_key = $2
        AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT $3
    `,
    [input.canvasProjectId, input.nodeKey, Math.max(1, Math.min(200, (input.limit ?? 50) * 4))],
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
      targetType: row.target_type,
      targetId: row.target_id,
      inputSnapshot: readJsonRecord(row.input_snapshot_json),
      outputSnapshot: readJsonRecord(row.output_snapshot_json),
      failure: readJsonRecord(row.failure_json),
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
    canvasProjectId?: string;
    nodeKey: string;
    taskId: string;
    mediaKind: string;
    result?: Record<string, unknown> | null;
    failure?: Record<string, unknown> | null;
    userId?: string | null;
    actorScope?: CanvasActorScope;
    now: Date;
  },
) {
  const access = input.actorScope && input.canvasProjectId
    ? resolveCanvasRecordAccess({ canvasProjectId: input.canvasProjectId, actorScope: input.actorScope }, "run")
    : null;
  const canvas = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM creator_canvas_projects
      WHERE id = $1
        AND deleted_at IS NULL
        AND ($2::uuid IS NULL OR created_by_user_id = $2)
      LIMIT 1
    `,
    [input.canvasProjectId ?? null, access?.ownerUserId ?? input.userId ?? null],
  );
  if (!canvas) {
    return null;
  }
  const run = await queryOne<{ id: string; status: string }>(
    db,
    `
      SELECT id, status
      FROM creator_canvas_node_runs
      WHERE canvas_project_id = $1
        AND node_key = $2
        AND task_id = $3
      ORDER BY run_no DESC
      LIMIT 1
    `,
    [canvas.id, input.nodeKey, input.taskId],
  );
  const resolvedRun = run ?? await createCanvasNodeRun(db, {
    canvasProjectId: canvas.id,
    nodeKey: input.nodeKey,
    idempotencyKey: `canvas-history:${input.taskId}`,
    status: input.result ? "queued" : "running",
    mediaKind: input.mediaKind,
    taskId: input.taskId,
    targetType: "canvas",
    targetId: input.nodeKey,
    inputSnapshot: { taskId: input.taskId, recoveredFromGenerationTask: true },
    userId: access?.ownerUserId ?? input.userId ?? null,
    actorScope: input.actorScope,
    now: input.now,
  });
  if (input.failure) {
    const runStatus = nullableString(input.failure.failureCode) === "user_canceled" ? "canceled" : "failed";
    await failCanvasNodeRun(db, {
      runId: resolvedRun.id,
      taskId: input.taskId,
      status: runStatus,
      failure: input.failure,
      now: input.now,
    });
    await persistCanvasNodeTaskFailure(db, {
      canvasProjectId: canvas.id,
      nodeKey: input.nodeKey,
      taskId: input.taskId,
      status: runStatus,
      failure: input.failure,
      userId: input.userId ?? null,
      now: input.now,
    });
    return { runId: resolvedRun.id, artifactId: null };
  }
  if (!input.result) {
    await markCanvasNodeRunQueued(db, {
      runId: resolvedRun.id,
      canvasProjectId: canvas.id,
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
      WHERE canvas_project_id = $1
        AND run_id = $2
        AND metadata_json->>'taskId' = $3
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [canvas.id, resolvedRun.id, input.taskId],
  );
  await completeCanvasNodeRun(db, {
    runId: resolvedRun.id,
    taskId: input.taskId,
    outputSnapshot: input.result,
    now: input.now,
  });
  await persistCanvasNodeTaskSuccess(db, {
    canvasProjectId: canvas.id,
    nodeKey: input.nodeKey,
    taskId: input.taskId,
    mediaKind: input.mediaKind,
    result: input.result,
    userId: input.userId ?? null,
    now: input.now,
  });
  if (existingArtifact) {
    await maybeCreateCanvasTranscriptionSourceText(db, {
      canvasProjectId: canvas.id,
      nodeKey: input.nodeKey,
      taskId: input.taskId,
      artifactId: existingArtifact.id,
      result: input.result,
      actorScope: input.actorScope,
      userId: input.userId ?? null,
      now: input.now,
    }).catch(() => undefined);
    await maybeSyncCanvasMusicLyrics(db, {
      canvasProjectId: canvas.id,
      nodeKey: input.nodeKey,
      taskId: input.taskId,
      artifactId: existingArtifact.id,
      result: input.result,
      actorScope: input.actorScope,
      userId: input.userId ?? null,
      now: input.now,
    }).catch(() => undefined);
    return { runId: resolvedRun.id, artifactId: existingArtifact.id };
  }
  const artifact = await appendCanvasNodeArtifact(db, {
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
  await maybeCreateCanvasTranscriptionSourceText(db, {
    canvasProjectId: canvas.id,
    nodeKey: input.nodeKey,
    taskId: input.taskId,
    artifactId: artifact.id,
    result: input.result,
    actorScope: input.actorScope,
    userId: input.userId ?? null,
    now: input.now,
  }).catch(() => undefined);
  await maybeSyncCanvasMusicLyrics(db, {
    canvasProjectId: canvas.id,
    nodeKey: input.nodeKey,
    taskId: input.taskId,
    artifactId: artifact.id,
    result: input.result,
    actorScope: input.actorScope,
    userId: input.userId ?? null,
    now: input.now,
  }).catch(() => undefined);
  return { runId: resolvedRun.id, artifactId: artifact.id };
}

async function persistCanvasNodeTaskSuccess(
  db: SqlDatabase,
  input: {
    canvasProjectId: string;
    nodeKey: string;
    taskId: string;
    mediaKind: string;
    result: Record<string, unknown>;
    userId: string | null;
    now: Date;
  },
) {
  const canvas = await queryOne<CanvasProjectRow & { created_by_user_id: string }>(
    db,
    `
      SELECT id, title, server_revision,
             latest_document_id, created_by_user_id
      FROM creator_canvas_projects
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1
      FOR UPDATE
    `,
    [input.canvasProjectId],
  );
  if (!canvas) return;
  const latest = await queryOne<CanvasDocumentRow>(
    db,
    `
      SELECT id, server_revision, document_json, viewport_json
      FROM creator_canvas_documents
      WHERE canvas_project_id = $1
        AND server_revision = $2
      LIMIT 1
    `,
    [canvas.id, canvas.server_revision],
  );
  if (!latest) return;
  const node = latest.document_json.nodes.find((item) => item.id === input.nodeKey);
  if (!node) return;
  const newestRun = await queryOne<{ task_id: string | null }>(
    db,
    `
      SELECT task_id
      FROM creator_canvas_node_runs
      WHERE canvas_project_id = $1
        AND node_key = $2
      ORDER BY run_no DESC
      LIMIT 1
    `,
    [canvas.id, input.nodeKey],
  );
  if (newestRun?.task_id !== input.taskId) return;
  const mediaKind = normalizeMediaKind(input.mediaKind, "image");
  const mediaUrl = resultPrimaryUrl(input.result, mediaKind);
  const nowIso = input.now.toISOString();
  const document: CanvasDocument = {
    ...latest.document_json,
    updatedAt: nowIso,
    nodes: latest.document_json.nodes.map((item) => item.id === input.nodeKey
      ? {
          ...item,
          data: {
            ...(item.data ?? {}),
            status: "completed",
            taskId: input.taskId,
            lastTaskId: input.taskId,
            generationTaskId: input.taskId,
            generationProgress: 100,
            generationStage: "completed",
            failure: null,
            failureCode: null,
            failureMessage: null,
            ...(mediaUrl ? {
              previewUrl: mediaUrl,
              resultUrl: mediaUrl,
              url: mediaUrl,
              ...(mediaKind === "image" ? { imageUrl: mediaUrl } : {}),
              ...(mediaKind === "video" ? { videoUrl: mediaUrl } : {}),
              ...(mediaKind === "audio" ? { audioUrl: mediaUrl } : {}),
            } : {}),
            ...(nullableString(input.result.assetId) ? { assetId: nullableString(input.result.assetId) } : {}),
            ...(nullableString(input.result.assetVersionId) ? { assetVersionId: nullableString(input.result.assetVersionId) } : {}),
            ...(nullableString(input.result.storageObjectId ?? input.result.fileId)
              ? { storageObjectId: nullableString(input.result.storageObjectId ?? input.result.fileId) }
              : {}),
          },
        }
      : item),
  };
  const nextRevision = canvas.server_revision + 1;
  const documentId = canvas.latest_document_id ?? randomUUID();
  const userId = input.userId ?? canvas.created_by_user_id;
  await insertCanvasDocument(db, {
    documentId,
    canvasProjectId: canvas.id,
    serverRevision: nextRevision,
    document,
    userId,
    now: input.now,
  });
  await syncCanvasNodesAndEdges(db, {
    canvasProjectId: canvas.id,
    document,
    userId,
    now: input.now,
  });
  await appendCanvasRevision(db, {
    canvasProjectId: canvas.id,
    serverRevision: nextRevision,
    operation: "task_succeeded",
    document,
    userId,
    now: input.now,
  });
  await db.query(
    `
      UPDATE creator_canvas_projects
      SET server_revision = $2,
          latest_document_id = $3,
          updated_by_user_id = $4,
          updated_at = $5
      WHERE id = $1
    `,
    [canvas.id, nextRevision, documentId, userId, input.now],
  );
}

async function maybeSyncCanvasMusicLyrics(
  db: SqlDatabase,
  input: {
    canvasProjectId: string;
    nodeKey: string;
    taskId: string;
    artifactId: string;
    result: Record<string, unknown>;
    actorScope?: CanvasActorScope;
    userId: string | null;
    now: Date;
  },
) {
  const parameters = readJsonRecord(input.result.parameters);
  const mode = nullableString(input.result.audioGenerationMode)
    ?? nullableString(parameters.mode)
    ?? nullableString(input.result.mode);
  const lyrics = nullableString(input.result.lyrics) ?? nullableString(parameters.lyrics);
  if (mode !== "music" || !lyrics) return null;
  const ownerUserId = input.actorScope?.ownerUserId ?? input.userId;
  if (!ownerUserId) return null;
  const actorScope = input.actorScope ?? {
    canvasId: input.canvasProjectId,
    ownerUserId,
    principal: "owner" as const,
    actorTeamMemberId: null,
    principalKey: `owner:${ownerUserId}`,
    capabilities: ["canvas:view", "canvas:edit", "canvas:run", "canvas:manage"] as const,
  };
  const normalizedLyrics = lyrics.slice(0, 100_000);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await findCanvasByCanvasProjectId(db, {
      canvasProjectId: input.canvasProjectId,
      actorScope,
    });
    if (!current) return null;
    const nodeIndex = current.document.nodes.findIndex((node) => node.id === input.nodeKey);
    if (nodeIndex < 0) return null;
    const node = current.document.nodes[nodeIndex]!;
    const nodeData = readJsonRecord(node.data);
    if (
      nullableString(nodeData.lyricsTaskId) === input.taskId
      && nullableString(nodeData.lyricsArtifactId) === input.artifactId
      && nullableString(nodeData.lyrics) === normalizedLyrics
    ) return current;
    const nextNodes = current.document.nodes.slice();
    nextNodes[nodeIndex] = {
      ...node,
      data: {
        ...nodeData,
        lyrics: normalizedLyrics,
        ...(nullableString(input.result.musicTitle) ? { musicTitle: nullableString(input.result.musicTitle) } : {}),
        lyricsMode: nullableString(input.result.lyricsMode)
          ?? nullableString(parameters.lyricsMode)
          ?? nullableString(nodeData.lyricsMode)
          ?? "generate",
        lyricsTaskId: input.taskId,
        lyricsArtifactId: input.artifactId,
        lyricsUpdatedAt: input.now.toISOString(),
      },
    };
    try {
      return await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: input.canvasProjectId,
        actorScope,
        clientRevision: current.serverRevision,
        document: { ...current.document, nodes: nextNodes, updatedAt: input.now.toISOString() },
        events: [{
          type: "canvas.music_lyrics.synced",
          taskId: input.taskId,
          nodeKey: input.nodeKey,
          artifactId: input.artifactId,
        }],
        now: input.now,
      });
    } catch (error) {
      if (!(error instanceof CanvasConflictError) || attempt === 2) throw error;
    }
  }
  return null;
}

async function maybeCreateCanvasTranscriptionSourceText(
  db: SqlDatabase,
  input: {
    canvasProjectId: string;
    nodeKey: string;
    taskId: string;
    artifactId: string;
    result: Record<string, unknown>;
    actorScope?: CanvasActorScope;
    userId: string | null;
    now: Date;
  },
) {
  const mode = nullableString(input.result.audioGenerationMode)
    ?? nullableString(readJsonRecord(input.result.parameters).mode)
    ?? nullableString(input.result.mode);
  const transcript = nullableString(input.result.transcript) ?? nullableString(input.result.text);
  if (mode !== "transcription" || !transcript) return null;
  const normalizedTranscript = transcript.slice(0, 100_000);
  const ownerUserId = input.actorScope?.ownerUserId ?? input.userId;
  if (!ownerUserId) return null;
  const actorScope = input.actorScope ?? {
    canvasId: input.canvasProjectId,
    ownerUserId,
    principal: "owner" as const,
    actorTeamMemberId: null,
    principalKey: `owner:${ownerUserId}`,
    capabilities: ["canvas:view", "canvas:edit", "canvas:run", "canvas:manage"] as const,
  };
  const current = await findCanvasByCanvasProjectId(db, {
    canvasProjectId: input.canvasProjectId,
    actorScope,
  });
  if (!current) return null;
  const nodes = Array.isArray(current.document.nodes) ? current.document.nodes : [];
  const existingIndex = nodes.findIndex((node) => {
    const data = readJsonRecord(node.data);
    return node.type === "source-text" && data.transcriptionTaskId === input.taskId;
  });
  const sourceNode = {
    id: existingIndex >= 0 ? nodes[existingIndex]!.id : `transcript-${input.taskId}`,
    type: "source-text",
    position: existingIndex >= 0 ? nodes[existingIndex]!.position : { x: 40, y: 40 },
    size: existingIndex >= 0 ? nodes[existingIndex]!.size : { width: 340, height: 220 },
    data: {
      ...(existingIndex >= 0 ? readJsonRecord(nodes[existingIndex]!.data) : {}),
      text: normalizedTranscript,
      label: "音频转录",
      transcriptionTaskId: input.taskId,
      sourceAudioNodeId: input.nodeKey,
      sourceArtifactId: input.artifactId,
      transcriptUpdatedAt: input.now.toISOString(),
    },
  };
  const nextNodes = nodes.slice();
  if (existingIndex >= 0) nextNodes[existingIndex] = sourceNode;
  else nextNodes.push(sourceNode);
  const document = { ...current.document, nodes: nextNodes, updatedAt: input.now.toISOString() };
  return saveCanvasByCanvasProjectId(db, {
    canvasProjectId: input.canvasProjectId,
    actorScope,
    clientRevision: current.serverRevision,
    document,
    events: [{ type: "canvas.transcription_source_text.created", taskId: input.taskId, sourceNodeId: sourceNode.id }],
    now: input.now,
  });
}

async function persistCanvasNodeTaskFailure(
  db: SqlDatabase,
  input: {
    canvasProjectId: string;
    nodeKey: string;
    taskId: string;
    status: "failed" | "canceled";
    failure: Record<string, unknown>;
    userId: string | null;
    now: Date;
  },
) {
  const canvas = await queryOne<CanvasProjectRow & { created_by_user_id: string }>(
    db,
    `
      SELECT id, title, server_revision,
             latest_document_id, created_by_user_id
      FROM creator_canvas_projects
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1
      FOR UPDATE
    `,
    [input.canvasProjectId],
  );
  if (!canvas) {
    return;
  }
  const latest = await queryOne<CanvasDocumentRow>(
    db,
    `
      SELECT id, server_revision, document_json, viewport_json
      FROM creator_canvas_documents
      WHERE canvas_project_id = $1
        AND server_revision = $2
      LIMIT 1
    `,
    [canvas.id, canvas.server_revision],
  );
  if (!latest) {
    return;
  }
  const node = latest.document_json.nodes.find((item) => item.id === input.nodeKey);
  const currentTaskId = nullableString(node?.data?.lastTaskId) ?? nullableString(node?.data?.taskId);
  if (!node || currentTaskId !== input.taskId) {
    return;
  }
  const nowIso = input.now.toISOString();
  const terminalStatus = input.status === "canceled" ? "canceled" : "failed";
  const document: CanvasDocument = {
    ...latest.document_json,
    updatedAt: nowIso,
    nodes: latest.document_json.nodes.map((item) => item.id === input.nodeKey
      ? {
          ...item,
          data: {
            ...(item.data ?? {}),
            status: terminalStatus,
            taskId: input.taskId,
            lastTaskId: input.taskId,
            generationProgress: 100,
            generationStage: terminalStatus,
            failure: input.failure,
            failureCode: nullableString(input.failure.failureCode),
          },
        }
      : item),
  };
  const nextRevision = canvas.server_revision + 1;
  const documentId = canvas.latest_document_id ?? randomUUID();
  const userId = input.userId ?? canvas.created_by_user_id;
  await insertCanvasDocument(db, {
    documentId,
    canvasProjectId: canvas.id,
    serverRevision: nextRevision,
    document,
    userId,
    now: input.now,
  });
  await syncCanvasNodesAndEdges(db, {
    canvasProjectId: canvas.id,
    document,
    userId,
    now: input.now,
  });
  await appendCanvasRevision(db, {
    canvasProjectId: canvas.id,
    serverRevision: nextRevision,
    operation: "task_failed",
    document,
    userId,
    now: input.now,
  });
  await db.query(
    `
      UPDATE creator_canvas_projects
      SET server_revision = $2,
          latest_document_id = $3,
          updated_by_user_id = $4,
          updated_at = $5
      WHERE id = $1
    `,
    [canvas.id, nextRevision, documentId, userId, input.now],
  );
}

export async function failOrphanedCanvasAgentGenerationNodes(
  db: SqlDatabase,
  input: { staleBefore: Date; now: Date; limit?: number },
) {
  const limit = Math.max(1, Math.min(500, Math.trunc(input.limit ?? 100)));
  const candidates = await db.query<{
    canvas_project_id: string;
    node_key: string;
    task_id: string;
    created_by_user_id: string | null;
  }>(`
    SELECT node.canvas_project_id, node.node_key,
           node.data_json->>'taskId' AS task_id, node.created_by_user_id
    FROM creator_canvas_nodes node
    WHERE node.deleted_at IS NULL
      AND node.status IN ('queued','running')
      AND node.data_json->>'source' = 'canvas_agent'
      AND COALESCE(node.data_json->>'taskId', '') <> ''
      AND node.updated_at < $1
      AND NOT EXISTS (
        SELECT 1 FROM tasks task WHERE task.id::text = node.data_json->>'taskId'
      )
    ORDER BY node.updated_at ASC, node.id ASC
    LIMIT $2
  `, [input.staleBefore, limit]);
  const failedNodeKeys: string[] = [];
  for (const candidate of candidates.rows) {
    await db.query("BEGIN");
    try {
      await persistCanvasNodeTaskFailure(db, {
        canvasProjectId: candidate.canvas_project_id,
        nodeKey: candidate.node_key,
        taskId: candidate.task_id,
        status: "failed",
        failure: { failureCode: "generation_task_missing" },
        userId: candidate.created_by_user_id,
        now: input.now,
      });
      await db.query("COMMIT");
      failedNodeKeys.push(candidate.node_key);
    } catch (error) {
      await db.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }
  return { failedNodeKeys };
}

export function normalizeCanvasDocument(
  value: unknown,
  input: { canvasProjectId: string; now: string },
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
    ...raw,
    version: Number(raw.version ?? 2) || 2,
    canvasProjectId: String(raw.canvasProjectId ?? input.canvasProjectId),
    viewport: normalizeViewport(raw.viewport),
    nodes,
    edges,
    groups: Array.isArray(raw.groups) ? raw.groups : [],
    createdAt,
    updatedAt: input.now,
  };
}

function canonicalizeCanvasDocumentOwnership(
  document: CanvasDocument,
  input: { canvasProjectId: string },
): CanvasDocument {
  if (document.canvasProjectId !== input.canvasProjectId) {
    throw new CanvasDocumentError("canvas_project_mismatch", "canvas project id mismatch");
  }
  return document;
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
    ...raw,
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
  const sourceNodeId = String(raw.sourceNodeId ?? raw.source ?? "").trim();
  const sourcePortId = String(raw.sourcePortId ?? raw.sourceHandle ?? "").trim();
  const targetNodeId = String(raw.targetNodeId ?? raw.target ?? "").trim();
  const targetPortId = String(raw.targetPortId ?? raw.targetHandle ?? "").trim();
  if (!id || !sourceNodeId || !sourcePortId || !targetNodeId || !targetPortId) {
    return null;
  }
  return {
    ...raw,
    id,
    kind: normalizeCanvasEdgeKind(raw),
    sourceNodeId,
    sourcePortId,
    targetNodeId,
    targetPortId,
    data: raw.data && typeof raw.data === "object" ? raw.data as Record<string, unknown> : {},
  };
}

function normalizeCanvasEdgeKind(raw: Record<string, unknown>) {
  const direct = String(raw.kind ?? "").trim();
  if (["execution", "reference", "layout", "control"].includes(direct)) {
    return direct as CanvasEdge["kind"];
  }
  const nested = raw.data && typeof raw.data === "object"
    ? String((raw.data as Record<string, unknown>).edgeKind ?? "").trim()
    : "";
  return (["execution", "reference", "layout", "control"].includes(nested)
    ? nested
    : "execution") as CanvasEdge["kind"];
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
    canvasProjectId: string;
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
        canvas_project_id,
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
      VALUES ($1, $2, $3, $4, $5::jsonb, '{}'::jsonb, $6::jsonb, $7, $8, $9, $10, $10, $11, $11)
      ON CONFLICT (id)
      DO UPDATE SET
        schema_version = EXCLUDED.schema_version,
        server_revision = EXCLUDED.server_revision,
        document_json = EXCLUDED.document_json,
        x6_graph_json = EXCLUDED.x6_graph_json,
        viewport_json = EXCLUDED.viewport_json,
        node_count = EXCLUDED.node_count,
        edge_count = EXCLUDED.edge_count,
        content_hash = EXCLUDED.content_hash,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = EXCLUDED.updated_at
    `,
    [
      input.documentId,
      input.canvasProjectId,
      input.document.version,
      input.serverRevision,
      JSON.stringify(input.document),
      JSON.stringify(input.document.viewport),
      input.document.nodes.length,
      input.document.edges.length,
      hashCanvasDocument(input.document),
      input.userId,
      input.now,
    ],
  );
  cacheCanvasDocument(
    db,
    canvasDocumentCacheKey(input.canvasProjectId, input.documentId, input.serverRevision),
    input.document,
    input.document.viewport,
  );
}

async function syncCanvasNodesAndEdges(
  db: SqlDatabase,
  input: {
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
        SET deleted_at = $3,
            updated_by_user_id = $4,
            updated_at = $3
        WHERE canvas_project_id = $1
          AND deleted_at IS NULL
          AND COALESCE(source_kind, '') <> 'style-reference'
          AND NOT (node_key = ANY($2::text[]))
      `,
      [input.canvasProjectId, activeNodeIds, input.now, input.userId],
    );
  } else {
    await db.query(
      `
        UPDATE creator_canvas_nodes
        SET deleted_at = $2,
            updated_by_user_id = $3,
            updated_at = $2
        WHERE canvas_project_id = $1
          AND deleted_at IS NULL
          AND COALESCE(source_kind, '') <> 'style-reference'
      `,
      [input.canvasProjectId, input.now, input.userId],
    );
  }

  if (input.document.nodes.length) {
    const nodes = input.document.nodes.map((node, index) => {
      const data = node.data ?? {};
      return {
        id: randomUUID(),
        nodeKey: node.id,
        nodeType: node.type,
        title: String(data.title ?? node.type ?? node.id),
        status: String(data.status ?? "idle"),
        mediaKind: nullableString(data.mediaKind),
        sourceKind: nullableString(data.source),
        modelCode: nullableString(data.modelCode),
        positionX: node.position?.x ?? 0,
        positionY: node.position?.y ?? 0,
        width: node.size?.width ?? 360,
        height: node.size?.height ?? 240,
        zIndex: node.zIndex ?? 0,
        groupKey: nullableString(data.groupKey),
        sortOrder: index,
        portSchema: data.ports ?? { inputs: [], outputs: [] },
        data,
        runtime: data.runtime ?? {},
      };
    });
    await db.query(
      `
        WITH node_rows AS (
          SELECT * FROM jsonb_to_recordset($3::jsonb) AS node(
            id uuid, "nodeKey" text, "nodeType" text, title text, status text,
            "mediaKind" text, "sourceKind" text, "modelCode" text,
            "positionX" numeric, "positionY" numeric, width numeric, height numeric,
            "zIndex" integer, "groupKey" text, "sortOrder" integer,
            "portSchema" jsonb, data jsonb, runtime jsonb
          )
        )
        INSERT INTO creator_canvas_nodes (
          id, canvas_project_id, node_key, node_type,
          title, status, media_kind, source_kind, model_code,
          position_x, position_y, width, height, z_index, group_key, sort_order,
          port_schema_json, data_json, runtime_json, deleted_at,
          created_by_user_id, updated_by_user_id, created_at, updated_at
        )
        SELECT
          node.id, $1, node."nodeKey", node."nodeType",
          node.title, node.status, node."mediaKind", node."sourceKind", node."modelCode",
          node."positionX", node."positionY", node.width, node.height, node."zIndex", node."groupKey", node."sortOrder",
          node."portSchema", node.data, node.runtime, NULL,
          $2, $2, $4, $4
        FROM node_rows node
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
      [input.canvasProjectId, input.userId, JSON.stringify(nodes), input.now],
    );
  }

  await db.query(
    `
      WITH removed_nodes AS (
        SELECT node_key
        FROM creator_canvas_nodes
        WHERE canvas_project_id = $1
          AND deleted_at IS NOT NULL
          AND COALESCE(source_kind, '') <> 'style-reference'
      ), deleted_artifacts AS (
        UPDATE creator_canvas_node_artifacts artifact
        SET deleted_at = $2,
            updated_at = $2
        FROM removed_nodes node
        WHERE artifact.canvas_project_id = $1
          AND artifact.node_key = node.node_key
          AND artifact.deleted_at IS NULL
        RETURNING artifact.id
      ), deleted_runs AS (
        UPDATE creator_canvas_node_runs run
        SET deleted_at = $2,
            updated_at = $2
        FROM removed_nodes node
        WHERE run.canvas_project_id = $1
          AND run.node_key = node.node_key
          AND run.deleted_at IS NULL
        RETURNING run.id
      )
      SELECT
        (SELECT count(*) FROM deleted_artifacts) AS deleted_artifact_count,
        (SELECT count(*) FROM deleted_runs) AS deleted_run_count
    `,
    [input.canvasProjectId, input.now],
  );

  const activeEdgeIds = input.document.edges.map((edge) => edge.id);
  if (activeEdgeIds.length) {
    await db.query(
      `
        UPDATE creator_canvas_edges
        SET deleted_at = $3,
            updated_by_user_id = $4,
            updated_at = $3
        WHERE canvas_project_id = $1
          AND deleted_at IS NULL
          AND NOT (edge_key = ANY($2::text[]))
      `,
      [input.canvasProjectId, activeEdgeIds, input.now, input.userId],
    );
  } else {
    await db.query(
      `
        UPDATE creator_canvas_edges
        SET deleted_at = $2,
            updated_by_user_id = $3,
            updated_at = $2
        WHERE canvas_project_id = $1
          AND deleted_at IS NULL
      `,
      [input.canvasProjectId, input.now, input.userId],
    );
  }

  if (input.document.edges.length) {
    const edges = input.document.edges.map((edge) => ({
      id: randomUUID(),
      edgeKey: edge.id,
      sourceNodeKey: edge.sourceNodeId,
      sourcePortId: edge.sourcePortId,
      targetNodeKey: edge.targetNodeId,
      targetPortId: edge.targetPortId,
      edgeKind: String(edge.data?.kind ?? "any"),
      status: String(edge.data?.status ?? "idle"),
      data: edge.data ?? {},
    }));
    await db.query(
      `
        WITH edge_rows AS (
          SELECT * FROM jsonb_to_recordset($3::jsonb) AS edge(
            id uuid, "edgeKey" text, "sourceNodeKey" text, "sourcePortId" text,
            "targetNodeKey" text, "targetPortId" text, "edgeKind" text, status text, data jsonb
          )
        )
        INSERT INTO creator_canvas_edges (
          id, canvas_project_id, edge_key,
          source_node_key, source_port_id, target_node_key, target_port_id,
          edge_kind, status, router_json, data_json, deleted_at,
          created_by_user_id, updated_by_user_id, created_at, updated_at
        )
        SELECT
          edge.id, $1, edge."edgeKey",
          edge."sourceNodeKey", edge."sourcePortId", edge."targetNodeKey", edge."targetPortId",
          edge."edgeKind", edge.status, '{}'::jsonb, edge.data, NULL,
          $2, $2, $4, $4
        FROM edge_rows edge
        ON CONFLICT (
          canvas_project_id, source_node_key, source_port_id,
          target_node_key, target_port_id
        )
        DO UPDATE SET
          edge_key = EXCLUDED.edge_key,
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
      [input.canvasProjectId, input.userId, JSON.stringify(edges), input.now],
    );
  }
}

async function appendCanvasRevision(
  db: SqlDatabase,
  input: {
    canvasProjectId: string;
    serverRevision: number;
    operation: string;
    document: CanvasDocument;
    userId: string;
    actorTeamMemberId?: string | null;
    now: Date;
  },
) {
  const liveNodes = input.document.nodes.filter((node) => node.id !== "__loomic_scene_v1__" && node.type !== "loomic_scene");
  const mediaCount = liveNodes.filter((node) => {
    const mediaKind = String(node.data?.mediaKind ?? node.type ?? "").toLowerCase();
    return ["image", "video", "audio"].includes(mediaKind);
  }).length;
  await db.query(
    `
      INSERT INTO creator_canvas_revisions (
        id, canvas_project_id,
        server_revision, operation, document_json, summary_json,
        created_by_user_id, actor_team_member_id, created_at
      )
      SELECT $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9::timestamptz
      WHERE $4 <> 'autosave'
         OR $3 % 10 = 0
         OR NOT EXISTS (
           SELECT 1
           FROM creator_canvas_revisions
           WHERE canvas_project_id = $2
             AND operation = 'autosave'
             AND created_at >= $9::timestamptz - interval '30 seconds'
         )
      ON CONFLICT (canvas_project_id, server_revision) DO NOTHING
    `,
    [
      randomUUID(),
      input.canvasProjectId,
      input.serverRevision,
      input.operation,
      JSON.stringify(input.document),
      JSON.stringify({ nodeCount: liveNodes.length, edgeCount: input.document.edges.length, mediaCount }),
      input.userId,
      input.actorTeamMemberId ?? null,
      input.now,
    ],
  );
}

async function findCurrentCanvasDocument(
  db: SqlDatabase,
  canvasProjectId: string,
  serverRevision: number,
) {
  return queryOne<CanvasDocumentRow>(
    db,
    `
      SELECT id, server_revision, document_json, viewport_json, content_hash
      FROM creator_canvas_documents
      WHERE canvas_project_id = $1
        AND server_revision = $2
      LIMIT 1
    `,
    [canvasProjectId, serverRevision],
  );
}

async function appendCanvasEvents(
  db: SqlDatabase,
  input: {
    canvasProjectId: string;
    serverRevision: number;
    events: Array<Record<string, unknown>>;
    actorUserId: string;
    actorTeamMemberId?: string | null;
  },
) {
  for (const event of input.events) {
    await db.query(
      `
        INSERT INTO creator_canvas_events (
          id, canvas_project_id,
          server_revision, event_type, target_type, target_key, patch_json,
          actor_user_id, actor_team_member_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, now())
      `,
      [
        randomUUID(),
        input.canvasProjectId,
        input.serverRevision,
        String(event.type ?? event.eventType ?? "canvas.updated"),
        String(event.targetType ?? "canvas"),
        nullableString(event.targetKey),
        JSON.stringify(event.patch ?? event),
        input.actorUserId,
        input.actorTeamMemberId ?? null,
      ],
    );
  }
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hashCanvasDocument(document: CanvasDocument) {
  const { updatedAt: _updatedAt, ...content } = document;
  return hashJson(content);
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

function serializeCanvasRevisionMetadata(row: CanvasRevisionRow): CanvasRevisionMetadataRecord {
  return {
    id: row.id,
    canvasProjectId: row.canvas_project_id,
    serverRevision: row.server_revision,
    operation: row.operation,
    summary: readJsonRecord(row.summary_json),
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
