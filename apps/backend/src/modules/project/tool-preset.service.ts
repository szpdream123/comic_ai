import { createHash, randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import {
  CANONICAL_WORKFLOW_NODE_PORTS,
  CanvasValidationError,
  type CanonicalWorkflowNodeType,
  validateCanonicalWorkflowDocumentGraph,
} from "./creator-canvas-validation.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const workflowTypes = new Set(["script-node", "director-node", "audio-node", "video-composition-node"]);
const nodeKeys = new Set(["kind", "type", "offsetX", "offsetY", "data"]);
const topologyKeys = new Set(["schemaVersion", "nodes", "connections"]);
const dataKeys = new Set(["title", "text", "instructions", "prompt", "model", "parameters"]);
const forbiddenDataKey = /(?:^id$|fileids?$|urls?$|storage|uploadsessionid$|assetids?$|assetversionids?$|task(?:id|status|result|request|response)?$|run(?:id|status|result|request|response)?$|status$|providerrequestid$|reservationid$|idempotencykey$)/i;
const forbiddenParameterUrl = /^(?:https?:|blob:|data:|file:|s3:|cos:|\/\/|\/api\/storage\/)/i;

export interface ToolPresetTopologyNode {
  kind: "workflow" | "image" | "video";
  type?: "script-node" | "director-node" | "audio-node" | "video-composition-node";
  offsetX: number;
  offsetY: number;
  data?: Record<string, unknown>;
}

export interface ToolPresetTopology {
  schemaVersion: 1;
  nodes: ToolPresetTopologyNode[];
  connections: [number, number][];
}

export interface ToolPresetVersionRecord {
  id: string;
  presetId: string;
  versionNumber: number;
  topology: ToolPresetTopology;
  nodeCount: number;
  edgeCount: number;
  contentHash: string;
  createdByMemberId: string | null;
  createdAt: string;
}

export interface ToolPresetSummaryRecord {
  id: string;
  name: string;
  description: string;
  category: string;
  status: "active" | "archived";
  currentVersionNumber: number;
  nodeCount: number;
  edgeCount: number;
  createdByMemberId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ToolPresetDetailRecord extends ToolPresetSummaryRecord {
  currentVersion: ToolPresetVersionRecord;
}

export class ToolPresetError extends Error {
  constructor(
    readonly code:
      | "invalid_tool_preset_id"
      | "invalid_tool_preset_version"
      | "invalid_tool_preset_name"
      | "invalid_tool_preset_description"
      | "invalid_tool_preset_category"
      | "invalid_tool_preset_topology"
      | "invalid_tool_preset_update"
      | "invalid_tool_preset_member"
      | "tool_preset_not_found"
      | "tool_preset_version_not_found"
      | "tool_preset_version_conflict"
      | "tool_preset_name_conflict",
    message = code,
    readonly reason?: string,
    readonly currentVersionNumber?: number,
  ) {
    super(message);
    this.name = "ToolPresetError";
  }
}

interface ToolPresetRow {
  id: string;
  admin_user_id: string;
  created_by_member_id: string | null;
  name: string;
  description: string;
  category: string;
  status: "active" | "archived";
  current_version_number: number | string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ToolPresetVersionRow {
  id: string;
  preset_id: string;
  version_number: number | string;
  created_by_member_id: string | null;
  topology_json: ToolPresetTopology;
  node_count: number | string;
  edge_count: number | string;
  content_hash: string;
  created_at: Date | string;
}

type ToolPresetSummaryRow = ToolPresetRow & Pick<ToolPresetVersionRow, "node_count" | "edge_count">;

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeUuid(value: unknown) {
  const id = String(value ?? "").trim();
  if (!uuidPattern.test(id)) throw new ToolPresetError("invalid_tool_preset_id");
  return id;
}

function normalizeVersionNumber(value: unknown) {
  const versionNumber = Number(value);
  if (!Number.isInteger(versionNumber) || versionNumber < 1 || versionNumber > 2_147_483_647) {
    throw new ToolPresetError("invalid_tool_preset_version");
  }
  return versionNumber;
}

function normalizeName(value: unknown) {
  const name = String(value ?? "").trim();
  if (!name || name.length > 120) throw new ToolPresetError("invalid_tool_preset_name");
  return name;
}

function normalizeDescription(value: unknown) {
  const description = String(value ?? "").trim();
  if (description.length > 1_000) throw new ToolPresetError("invalid_tool_preset_description");
  return description;
}

function normalizeCategory(value: unknown) {
  const category = String(value ?? "custom").trim();
  if (!category || category.length > 50) throw new ToolPresetError("invalid_tool_preset_category");
  return category;
}

function requirePlainRecord(value: unknown, reason: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ToolPresetError("invalid_tool_preset_topology", "Tool preset topology is invalid", reason);
  }
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: Set<string>, reason: string) {
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new ToolPresetError("invalid_tool_preset_topology", "Tool preset topology contains unsupported fields", reason);
  }
}

function normalizeFiniteOffset(value: unknown, reason: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > 1_000_000) {
    throw new ToolPresetError("invalid_tool_preset_topology", "Tool preset node offset is invalid", reason);
  }
  return number;
}

function normalizeNodeData(value: unknown, nodeIndex: number) {
  if (value === undefined) return undefined;
  const data = requirePlainRecord(value, `node_${nodeIndex}_data_invalid`);
  rejectUnknownKeys(data, dataKeys, `node_${nodeIndex}_data_field_invalid`);
  const normalized: Record<string, unknown> = {};
  for (const key of ["title", "text", "instructions", "prompt", "model"] as const) {
    if (data[key] === undefined) continue;
    if (typeof data[key] !== "string") {
      throw new ToolPresetError("invalid_tool_preset_topology", "Tool preset node text must be a string", `node_${nodeIndex}_${key}_invalid`);
    }
    const maxLength = key === "title" || key === "model" ? 200 : 20_000;
    if (data[key].length > maxLength) {
      throw new ToolPresetError("invalid_tool_preset_topology", "Tool preset node text is too long", `node_${nodeIndex}_${key}_too_long`);
    }
    normalized[key] = data[key];
  }
  if (data.parameters !== undefined) {
    assertPortableParameters(data.parameters, `node_${nodeIndex}_parameters`, 0);
    const serialized = JSON.stringify(data.parameters);
    if (serialized.length > 20_000) {
      throw new ToolPresetError("invalid_tool_preset_topology", "Tool preset parameters are too large", `node_${nodeIndex}_parameters_too_large`);
    }
    normalized.parameters = JSON.parse(serialized);
  }
  return Object.keys(normalized).length ? normalized : undefined;
}

function assertPortableParameters(value: unknown, path: string, depth: number): void {
  if (depth > 6) {
    throw new ToolPresetError("invalid_tool_preset_topology", "Tool preset parameters are too deeply nested", `${path}_too_deep`);
  }
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (!forbiddenParameterUrl.test(value.trim())) return;
    throw new ToolPresetError(
      "invalid_tool_preset_topology",
      "Tool preset parameters contain runtime or media references",
      `${path}_value_invalid`,
    );
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
    throw new ToolPresetError("invalid_tool_preset_topology", "Tool preset parameters contain a non-finite number", `${path}_number_invalid`);
  }
  if (Array.isArray(value)) {
    if (value.length > 100) {
      throw new ToolPresetError("invalid_tool_preset_topology", "Tool preset parameter array is too large", `${path}_array_too_large`);
    }
    value.forEach((item, index) => assertPortableParameters(item, `${path}_${index}`, depth + 1));
    return;
  }
  const record = requirePlainRecord(value, `${path}_invalid`);
  if (Object.keys(record).length > 100) {
    throw new ToolPresetError("invalid_tool_preset_topology", "Tool preset parameter object is too large", `${path}_object_too_large`);
  }
  for (const [key, item] of Object.entries(record)) {
    if (!key || key.length > 100 || forbiddenDataKey.test(key.replaceAll(/[_-]/g, ""))) {
      throw new ToolPresetError("invalid_tool_preset_topology", "Tool preset parameters contain runtime or media references", `${path}_field_invalid`);
    }
    assertPortableParameters(item, `${path}_${key}`, depth + 1);
  }
}

function normalizeTopologyNode(value: unknown, index: number): ToolPresetTopologyNode {
  const node = requirePlainRecord(value, `node_${index}_invalid`);
  rejectUnknownKeys(node, nodeKeys, `node_${index}_field_invalid`);
  const kind = String(node.kind ?? "").trim();
  const offsetX = normalizeFiniteOffset(node.offsetX, `node_${index}_offset_x_invalid`);
  const offsetY = normalizeFiniteOffset(node.offsetY, `node_${index}_offset_y_invalid`);
  const data = normalizeNodeData(node.data, index);
  if (kind === "image" || kind === "video") {
    if (node.type !== undefined) {
      throw new ToolPresetError("invalid_tool_preset_topology", "Image and video nodes cannot override their canonical type", `node_${index}_type_invalid`);
    }
    return { kind, offsetX, offsetY, ...(data ? { data } : {}) };
  }
  if (kind !== "workflow" || !workflowTypes.has(String(node.type ?? ""))) {
    throw new ToolPresetError("invalid_tool_preset_topology", "Tool preset node type is not supported", `node_${index}_type_invalid`);
  }
  return {
    kind: "workflow",
    type: String(node.type) as ToolPresetTopologyNode["type"],
    offsetX,
    offsetY,
    ...(data ? { data } : {}),
  };
}

export function normalizeToolPresetTopology(value: unknown): ToolPresetTopology {
  const topology = requirePlainRecord(value, "topology_invalid");
  rejectUnknownKeys(topology, topologyKeys, "topology_field_invalid");
  if (topology.schemaVersion !== 1) {
    throw new ToolPresetError("invalid_tool_preset_topology", "Tool preset schema version is not supported", "schema_version_invalid");
  }
  if (!Array.isArray(topology.nodes) || topology.nodes.length < 1 || topology.nodes.length > 100) {
    throw new ToolPresetError("invalid_tool_preset_topology", "Tool preset nodes must contain between 1 and 100 items", "nodes_invalid");
  }
  if (!Array.isArray(topology.connections) || topology.connections.length > 300) {
    throw new ToolPresetError("invalid_tool_preset_topology", "Tool preset connections must be an array with at most 300 items", "connections_invalid");
  }
  const nodes = topology.nodes.map(normalizeTopologyNode);
  const connections: [number, number][] = [];
  const seenConnections = new Set<string>();
  for (const [index, rawConnection] of topology.connections.entries()) {
    if (!Array.isArray(rawConnection) || rawConnection.length !== 2) {
      throw new ToolPresetError("invalid_tool_preset_topology", "Tool preset connection must contain source and target indexes", `connection_${index}_invalid`);
    }
    const sourceIndex = Number(rawConnection[0]);
    const targetIndex = Number(rawConnection[1]);
    if (
      !Number.isInteger(sourceIndex)
      || !Number.isInteger(targetIndex)
      || sourceIndex < 0
      || targetIndex < 0
      || sourceIndex >= nodes.length
      || targetIndex >= nodes.length
    ) {
      throw new ToolPresetError("invalid_tool_preset_topology", "Tool preset connection endpoint is invalid", `connection_${index}_endpoint_invalid`);
    }
    const key = `${sourceIndex}:${targetIndex}`;
    if (seenConnections.has(key)) {
      throw new ToolPresetError("invalid_tool_preset_topology", "Tool preset connection is duplicated", `connection_${index}_duplicate`);
    }
    seenConnections.add(key);
    connections.push([sourceIndex, targetIndex]);
  }
  const normalized = { schemaVersion: 1 as const, nodes, connections };
  validatePresetCanonicalGraph(normalized);
  const serialized = JSON.stringify(normalized);
  if (serialized.length > 256_000) {
    throw new ToolPresetError("invalid_tool_preset_topology", "Tool preset topology is too large", "topology_too_large");
  }
  return normalized;
}

function canonicalType(node: ToolPresetTopologyNode): CanonicalWorkflowNodeType {
  if (node.kind === "image" || node.kind === "video") return node.kind;
  return {
    "script-node": "script",
    "director-node": "director",
    "audio-node": "audio",
    "video-composition-node": "output",
  }[node.type!] as CanonicalWorkflowNodeType;
}

function validatePresetCanonicalGraph(topology: ToolPresetTopology) {
  const nodes = topology.nodes.map((node, index) => {
    const type = canonicalType(node);
    return {
      id: `node-${index}`,
      type,
      data: { ports: JSON.parse(JSON.stringify(CANONICAL_WORKFLOW_NODE_PORTS[type])) },
    };
  });
  const edges = topology.connections.map(([sourceIndex, targetIndex], index) => {
    const source = nodes[sourceIndex]!;
    const target = nodes[targetIndex]!;
    const sourcePort = CANONICAL_WORKFLOW_NODE_PORTS[source.type].outputs[0];
    const targetPort = CANONICAL_WORKFLOW_NODE_PORTS[target.type].inputs.find((port) => (
      "accepts" in port
        ? (port.accepts as readonly string[]).includes(sourcePort?.kind ?? "")
        : port.kind === "any" || port.kind === sourcePort?.kind
    ));
    if (!sourcePort || !targetPort) {
      throw new ToolPresetError("invalid_tool_preset_topology", "Tool preset connection types are incompatible", `connection_${index}_kind_mismatch`);
    }
    return {
      id: `edge-${index}`,
      sourceNodeId: source.id,
      sourcePortId: sourcePort.id,
      targetNodeId: target.id,
      targetPortId: targetPort.id,
      data: { kind: sourcePort.kind },
    };
  });
  try {
    validateCanonicalWorkflowDocumentGraph({ nodes, edges });
  } catch (error) {
    if (error instanceof CanvasValidationError) {
      throw new ToolPresetError("invalid_tool_preset_topology", "Tool preset graph is invalid", error.code);
    }
    throw error;
  }
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, canonicalJson(item)]));
}

function topologyHash(topology: ToolPresetTopology) {
  return createHash("sha256").update(JSON.stringify(canonicalJson(topology))).digest("hex");
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "23505";
}

function versionRecord(row: ToolPresetVersionRow): ToolPresetVersionRecord {
  return {
    id: row.id,
    presetId: row.preset_id,
    versionNumber: Number(row.version_number),
    topology: row.topology_json,
    nodeCount: Number(row.node_count),
    edgeCount: Number(row.edge_count),
    contentHash: row.content_hash,
    createdByMemberId: row.created_by_member_id,
    createdAt: iso(row.created_at),
  };
}

function summaryRecord(row: ToolPresetSummaryRow): ToolPresetSummaryRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    status: row.status,
    currentVersionNumber: Number(row.current_version_number),
    nodeCount: Number(row.node_count),
    edgeCount: Number(row.edge_count),
    createdByMemberId: row.created_by_member_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

async function requireOwnedPreset(
  db: SqlDatabase,
  input: { adminUserId: string; presetId: string; lock?: boolean },
) {
  const row = await queryOne<ToolPresetRow>(
    db,
    `
      SELECT *
      FROM creator_tool_presets
      WHERE id = $1 AND admin_user_id = $2 AND status = 'active'
      ${input.lock ? "FOR UPDATE" : ""}
    `,
    [input.presetId, input.adminUserId],
  );
  if (!row) throw new ToolPresetError("tool_preset_not_found");
  return row;
}

async function findVersionRow(db: SqlDatabase, presetId: string, versionNumber: number) {
  return queryOne<ToolPresetVersionRow>(
    db,
    "SELECT * FROM creator_tool_preset_versions WHERE preset_id = $1 AND version_number = $2",
    [presetId, versionNumber],
  );
}

async function insertVersion(
  db: SqlDatabase,
  input: {
    presetId: string;
    adminUserId: string;
    versionNumber: number;
    createdByMemberId?: string | null;
    topology: ToolPresetTopology;
  },
) {
  if (input.createdByMemberId) {
    const member = await queryOne<{ id: string }>(
      db,
      "SELECT id FROM team_members WHERE id = $1 AND user_id = $2",
      [input.createdByMemberId, input.adminUserId],
    );
    if (!member) throw new ToolPresetError("invalid_tool_preset_member");
  }
  const row = await queryOne<ToolPresetVersionRow>(
    db,
    `
      INSERT INTO creator_tool_preset_versions
        (id, preset_id, version_number, created_by_member_id, topology_json, node_count, edge_count, content_hash)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
      RETURNING *
    `,
    [
      randomUUID(),
      input.presetId,
      input.versionNumber,
      input.createdByMemberId ?? null,
      JSON.stringify(input.topology),
      input.topology.nodes.length,
      input.topology.connections.length,
      topologyHash(input.topology),
    ],
  );
  return row!;
}

export async function listToolPresets(
  db: SqlDatabase,
  input: { adminUserId: string; includeArchived?: boolean },
): Promise<ToolPresetSummaryRecord[]> {
  const result = await db.query<ToolPresetSummaryRow>(
    `
      SELECT preset.*, version.node_count, version.edge_count
      FROM creator_tool_presets preset
      JOIN creator_tool_preset_versions version
        ON version.preset_id = preset.id
       AND version.version_number = preset.current_version_number
      WHERE preset.admin_user_id = $1
        AND ($2::boolean OR preset.status = 'active')
      ORDER BY preset.updated_at DESC, preset.id DESC
    `,
    [input.adminUserId, Boolean(input.includeArchived)],
  );
  return result.rows.map(summaryRecord);
}

export async function getToolPreset(
  db: SqlDatabase,
  input: { adminUserId: string; presetId: unknown },
): Promise<ToolPresetDetailRecord> {
  const presetId = normalizeUuid(input.presetId);
  const preset = await requireOwnedPreset(db, { adminUserId: input.adminUserId, presetId });
  const version = await findVersionRow(db, preset.id, Number(preset.current_version_number));
  if (!version) throw new ToolPresetError("tool_preset_version_not_found");
  return {
    ...summaryRecord({ ...preset, node_count: version.node_count, edge_count: version.edge_count }),
    currentVersion: versionRecord(version),
  };
}

export async function createToolPreset(
  db: SqlDatabase,
  input: {
    adminUserId: string;
    createdByMemberId?: string | null;
    name: unknown;
    description?: unknown;
    category?: unknown;
    topology: unknown;
  },
): Promise<ToolPresetDetailRecord> {
  const name = normalizeName(input.name);
  const description = normalizeDescription(input.description);
  const category = normalizeCategory(input.category);
  const topology = normalizeToolPresetTopology(input.topology);
  const presetId = randomUUID();
  await db.query("BEGIN");
  try {
    await db.query(
      `
        INSERT INTO creator_tool_presets
          (id, admin_user_id, created_by_member_id, name, description, category, status, current_version_number)
        VALUES ($1, $2, $3, $4, $5, $6, 'active', 1)
      `,
      [presetId, input.adminUserId, input.createdByMemberId ?? null, name, description, category],
    );
    await insertVersion(db, {
      presetId,
      adminUserId: input.adminUserId,
      versionNumber: 1,
      createdByMemberId: input.createdByMemberId,
      topology,
    });
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    if (isUniqueViolation(error)) throw new ToolPresetError("tool_preset_name_conflict");
    throw error;
  }
  return getToolPreset(db, { adminUserId: input.adminUserId, presetId });
}

export async function updateToolPreset(
  db: SqlDatabase,
  input: {
    adminUserId: string;
    createdByMemberId?: string | null;
    presetId: unknown;
    name?: unknown;
    description?: unknown;
    category?: unknown;
    topology?: unknown;
    expectedVersionNumber?: unknown;
  },
): Promise<ToolPresetDetailRecord> {
  const presetId = normalizeUuid(input.presetId);
  if (input.name === undefined && input.description === undefined && input.category === undefined && input.topology === undefined) {
    throw new ToolPresetError("invalid_tool_preset_update");
  }
  const name = input.name === undefined ? undefined : normalizeName(input.name);
  const description = input.description === undefined ? undefined : normalizeDescription(input.description);
  const category = input.category === undefined ? undefined : normalizeCategory(input.category);
  const requestedTopology = input.topology === undefined ? undefined : normalizeToolPresetTopology(input.topology);
  const expectedVersionNumber = requestedTopology === undefined
    ? undefined
    : input.expectedVersionNumber === undefined
      ? (() => {
          throw new ToolPresetError(
            "invalid_tool_preset_version",
            "Expected tool preset version is required when updating topology",
            "expected_version_required",
          );
        })()
      : normalizeVersionNumber(input.expectedVersionNumber);
  await db.query("BEGIN");
  try {
    const preset = await requireOwnedPreset(db, { adminUserId: input.adminUserId, presetId, lock: true });
    const currentVersionNumber = Number(preset.current_version_number);
    if (expectedVersionNumber !== undefined && currentVersionNumber !== expectedVersionNumber) {
      throw new ToolPresetError(
        "tool_preset_version_conflict",
        "Tool preset version has changed",
        "expected_version_mismatch",
        currentVersionNumber,
      );
    }
    const currentVersion = await findVersionRow(db, preset.id, currentVersionNumber);
    if (!currentVersion) throw new ToolPresetError("tool_preset_version_not_found");
    const nextVersionNumber = requestedTopology ? currentVersionNumber + 1 : currentVersionNumber;
    if (requestedTopology) {
      await insertVersion(db, {
        presetId,
        adminUserId: input.adminUserId,
        versionNumber: nextVersionNumber,
        createdByMemberId: input.createdByMemberId,
        topology: requestedTopology,
      });
    }
    await db.query(
      `
        UPDATE creator_tool_presets
        SET name = COALESCE($3, name),
            description = COALESCE($4, description),
            category = COALESCE($5, category),
            current_version_number = $6,
            updated_at = now()
        WHERE id = $1 AND admin_user_id = $2
      `,
      [presetId, input.adminUserId, name ?? null, description ?? null, category ?? null, nextVersionNumber],
    );
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    if (error instanceof ToolPresetError) throw error;
    if (isUniqueViolation(error)) throw new ToolPresetError("tool_preset_name_conflict");
    throw error;
  }
  return getToolPreset(db, { adminUserId: input.adminUserId, presetId });
}

export async function duplicateToolPreset(
  db: SqlDatabase,
  input: { adminUserId: string; createdByMemberId?: string | null; presetId: unknown; name?: unknown },
) {
  const presetId = normalizeUuid(input.presetId);
  const source = await requireOwnedPreset(db, { adminUserId: input.adminUserId, presetId });
  const version = await findVersionRow(db, source.id, Number(source.current_version_number));
  if (!version) throw new ToolPresetError("tool_preset_version_not_found");
  const defaultName = `${source.name.slice(0, 120 - " (副本)".length)} (副本)`;
  return createToolPreset(db, {
    adminUserId: input.adminUserId,
    createdByMemberId: input.createdByMemberId,
    name: input.name === undefined ? defaultName : input.name,
    description: source.description,
    category: source.category,
    topology: version.topology_json,
  });
}

export async function archiveToolPreset(
  db: SqlDatabase,
  input: { adminUserId: string; presetId: unknown },
): Promise<{ deleted: true }> {
  const presetId = normalizeUuid(input.presetId);
  const row = await queryOne<{ id: string }>(
    db,
    `
      UPDATE creator_tool_presets
      SET status = 'archived', updated_at = now()
      WHERE id = $1 AND admin_user_id = $2 AND status = 'active'
      RETURNING id
    `,
    [presetId, input.adminUserId],
  );
  if (!row) throw new ToolPresetError("tool_preset_not_found");
  return { deleted: true };
}

export async function listToolPresetVersions(
  db: SqlDatabase,
  input: { adminUserId: string; presetId: unknown },
): Promise<ToolPresetVersionRecord[]> {
  const presetId = normalizeUuid(input.presetId);
  await requireOwnedPreset(db, { adminUserId: input.adminUserId, presetId });
  const result = await db.query<ToolPresetVersionRow>(
    "SELECT * FROM creator_tool_preset_versions WHERE preset_id = $1 ORDER BY version_number DESC",
    [presetId],
  );
  return result.rows.map(versionRecord);
}

export async function getToolPresetVersion(
  db: SqlDatabase,
  input: { adminUserId: string; presetId: unknown; versionNumber: unknown },
): Promise<ToolPresetVersionRecord> {
  const presetId = normalizeUuid(input.presetId);
  const versionNumber = normalizeVersionNumber(input.versionNumber);
  await requireOwnedPreset(db, { adminUserId: input.adminUserId, presetId });
  const version = await findVersionRow(db, presetId, versionNumber);
  if (!version) throw new ToolPresetError("tool_preset_version_not_found");
  return versionRecord(version);
}
