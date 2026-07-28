import { randomUUID } from "node:crypto";

import type { CanvasActorScope } from "../identity/canvas-actor-scope.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

interface CanvasSessionRow {
  id: string;
  canvas_project_id: string;
  user_id: string;
  team_member_id: string | null;
  principal_key: string;
  viewport_json: Record<string, unknown>;
  selected_node_keys_json: unknown[];
  selected_edge_keys_json: unknown[];
  ui_state_json: Record<string, unknown>;
  last_seen_revision: number | string;
  updated_at: Date | string;
}

export class CanvasSessionError extends Error {
  constructor(readonly code: string) { super(code); }
}

export async function getCanvasSession(
  db: SqlDatabase,
  input: { canvasProjectId: string; actorScope: CanvasActorScope },
) {
  assertScope(input.canvasProjectId, input.actorScope);
  const row = await queryOne<CanvasSessionRow>(db, `
    SELECT * FROM creator_canvas_sessions
    WHERE canvas_project_id=$1 AND user_id=$2 AND principal_key=$3
    LIMIT 1
  `, [input.canvasProjectId, input.actorScope.ownerUserId, input.actorScope.principalKey]);
  return row ? serialize(row) : null;
}

export async function saveCanvasSession(
  db: SqlDatabase,
  input: {
    canvasProjectId: string;
    actorScope: CanvasActorScope;
    viewport?: Record<string, unknown>;
    selectedNodeKeys?: unknown[];
    selectedEdgeKeys?: unknown[];
    uiState?: Record<string, unknown>;
    lastSeenRevision?: number;
    now: Date;
  },
) {
  assertScope(input.canvasProjectId, input.actorScope);
  const viewport = normalizeViewport(input.viewport);
  const selectedNodeKeys = normalizeKeys(input.selectedNodeKeys);
  const selectedEdgeKeys = normalizeKeys(input.selectedEdgeKeys);
  const uiState = normalizeUiState(input.uiState);
  const lastSeenRevision = Number(input.lastSeenRevision ?? 1);
  if (!Number.isInteger(lastSeenRevision) || lastSeenRevision < 1) {
    throw new CanvasSessionError("canvas_session_revision_invalid");
  }
  const row = await queryOne<CanvasSessionRow>(db, `
    INSERT INTO creator_canvas_sessions (
      id, canvas_project_id, user_id, team_member_id, principal_key,
      viewport_json, selected_node_keys_json, selected_edge_keys_json,
      ui_state_json, last_seen_revision, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11)
    ON CONFLICT (canvas_project_id, user_id, principal_key)
    DO UPDATE SET
      team_member_id=EXCLUDED.team_member_id,
      viewport_json=EXCLUDED.viewport_json,
      selected_node_keys_json=EXCLUDED.selected_node_keys_json,
      selected_edge_keys_json=EXCLUDED.selected_edge_keys_json,
      ui_state_json=EXCLUDED.ui_state_json,
      last_seen_revision=EXCLUDED.last_seen_revision,
      updated_at=EXCLUDED.updated_at
    RETURNING *
  `, [
    randomUUID(), input.canvasProjectId, input.actorScope.ownerUserId,
    input.actorScope.actorTeamMemberId, input.actorScope.principalKey,
    JSON.stringify(viewport), JSON.stringify(selectedNodeKeys), JSON.stringify(selectedEdgeKeys),
    JSON.stringify(uiState), lastSeenRevision, input.now,
  ]);
  return serialize(row!);
}

function assertScope(canvasProjectId: string, scope: CanvasActorScope) {
  if (scope.canvasId !== canvasProjectId) throw new CanvasSessionError("canvas_session_forbidden");
}

function normalizeViewport(value: Record<string, unknown> | undefined) {
  const x = finite(value?.x, 0);
  const y = finite(value?.y, 0);
  const zoom = Math.max(0.1, Math.min(8, finite(value?.zoom, 1)));
  return { x, y, zoom };
}

function normalizeKeys(value: unknown[] | undefined) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))].slice(0, 200);
}

function normalizeUiState(value: Record<string, unknown> | undefined) {
  const state = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const encoded = JSON.stringify(state);
  if (Buffer.byteLength(encoded, "utf8") > 64 * 1024) {
    throw new CanvasSessionError("canvas_session_ui_state_too_large");
  }
  return state;
}

function finite(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function serialize(row: CanvasSessionRow) {
  return {
    id: row.id,
    canvasProjectId: row.canvas_project_id,
    ownerUserId: row.user_id,
    actorTeamMemberId: row.team_member_id,
    principalKey: row.principal_key,
    viewport: row.viewport_json ?? { x: 0, y: 0, zoom: 1 },
    selectedNodeKeys: Array.isArray(row.selected_node_keys_json) ? row.selected_node_keys_json : [],
    selectedEdgeKeys: Array.isArray(row.selected_edge_keys_json) ? row.selected_edge_keys_json : [],
    uiState: row.ui_state_json ?? {},
    lastSeenRevision: Number(row.last_seen_revision),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
