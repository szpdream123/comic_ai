import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export const AGENT_ASSET_INSTRUCTIONS_MAX_LENGTH = 20_000;
export const AGENT_ASSET_NAME_MAX_LENGTH = 120;
export const AGENT_ASSET_DESCRIPTION_MAX_LENGTH = 1_000;

export type AgentAssetType = "director";

export interface AgentAssetRecord {
  id: string;
  adminUserId: string;
  createdByMemberId: string | null;
  name: string;
  description: string;
  agentType: AgentAssetType;
  instructions: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export class AgentAssetError extends Error {
  constructor(
    readonly code:
      | "invalid_agent_asset_name"
      | "invalid_agent_asset_description"
      | "invalid_agent_asset_instructions"
      | "invalid_agent_asset_id"
      | "agent_asset_not_found"
      | "agent_asset_name_conflict",
    message = code,
  ) {
    super(message);
    this.name = "AgentAssetError";
  }
}

interface AgentAssetRow {
  id: string;
  admin_user_id: string;
  created_by_member_id: string | null;
  name: string;
  description: string;
  agent_type: AgentAssetType;
  instructions: string;
  status: "active" | "archived";
  created_at: Date | string;
  updated_at: Date | string;
}

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function record(row: AgentAssetRow): AgentAssetRecord {
  return {
    id: row.id,
    adminUserId: row.admin_user_id,
    createdByMemberId: row.created_by_member_id,
    name: row.name,
    description: row.description,
    agentType: row.agent_type,
    instructions: row.instructions,
    status: row.status,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function normalizeName(value: unknown) {
  const name = String(value ?? "").trim();
  if (!name || name.length > AGENT_ASSET_NAME_MAX_LENGTH) {
    throw new AgentAssetError("invalid_agent_asset_name", "Agent asset name is required and must be at most 120 characters");
  }
  return name;
}

function normalizeInstructions(value: unknown) {
  const instructions = String(value ?? "").trim();
  if (instructions.length > AGENT_ASSET_INSTRUCTIONS_MAX_LENGTH) {
    throw new AgentAssetError("invalid_agent_asset_instructions", "Agent instructions exceed the maximum length");
  }
  return instructions;
}

function normalizeDescription(value: unknown) {
  const description = String(value ?? "").trim();
  if (description.length > AGENT_ASSET_DESCRIPTION_MAX_LENGTH) {
    throw new AgentAssetError("invalid_agent_asset_description", "Agent description exceeds the maximum length");
  }
  return description;
}

function normalizeAssetId(value: unknown) {
  const assetId = String(value ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId)) {
    throw new AgentAssetError("invalid_agent_asset_id", "Agent asset id is invalid");
  }
  return assetId;
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "23505";
}

export async function listAgentAssets(
  db: SqlDatabase,
  input: { adminUserId: string; includeArchived?: boolean },
): Promise<AgentAssetRecord[]> {
  const result = await db.query<AgentAssetRow>(
    `
      SELECT id, admin_user_id, created_by_member_id, name, description,
             agent_type, instructions, status, created_at, updated_at
      FROM creator_agent_assets
      WHERE admin_user_id = $1
        AND ($2::boolean OR status = 'active')
      ORDER BY updated_at DESC, id DESC
    `,
    [input.adminUserId, Boolean(input.includeArchived)],
  );
  return result.rows.map(record);
}

export async function createAgentAsset(
  db: SqlDatabase,
  input: {
    adminUserId: string;
    createdByMemberId?: string | null;
    name: unknown;
    description?: unknown;
    instructions?: unknown;
  },
): Promise<AgentAssetRecord> {
  const name = normalizeName(input.name);
  const description = normalizeDescription(input.description);
  const instructions = normalizeInstructions(input.instructions);
  try {
    const row = await queryOne<AgentAssetRow>(
      db,
      `
        INSERT INTO creator_agent_assets
          (id, admin_user_id, created_by_member_id, name, description, agent_type, instructions, status)
        VALUES ($1, $2, $3, $4, $5, 'director', $6, 'active')
        RETURNING id, admin_user_id, created_by_member_id, name, description,
                  agent_type, instructions, status, created_at, updated_at
      `,
      [randomUUID(), input.adminUserId, input.createdByMemberId ?? null, name, description, instructions],
    );
    return record(row!);
  } catch (error) {
    if (isUniqueViolation(error)) throw new AgentAssetError("agent_asset_name_conflict", "Agent asset name already exists");
    throw error;
  }
}

export async function updateAgentAsset(
  db: SqlDatabase,
  input: {
    adminUserId: string;
    assetId: string;
    name?: unknown;
    description?: unknown;
    instructions?: unknown;
  },
): Promise<AgentAssetRecord> {
  const name = input.name === undefined ? null : normalizeName(input.name);
  const assetId = normalizeAssetId(input.assetId);
  const description = input.description === undefined ? null : normalizeDescription(input.description);
  const instructions = input.instructions === undefined ? null : normalizeInstructions(input.instructions);
  try {
    const row = await queryOne<AgentAssetRow>(
      db,
      `
        UPDATE creator_agent_assets
        SET name = COALESCE($3, name),
            description = COALESCE($4, description),
            instructions = COALESCE($5, instructions),
            updated_at = now()
        WHERE id = $1 AND admin_user_id = $2 AND status = 'active'
        RETURNING id, admin_user_id, created_by_member_id, name, description,
                  agent_type, instructions, status, created_at, updated_at
      `,
      [assetId, input.adminUserId, name, description, instructions],
    );
    if (!row) throw new AgentAssetError("agent_asset_not_found", "Agent asset not found");
    return record(row);
  } catch (error) {
    if (error instanceof AgentAssetError) throw error;
    if (isUniqueViolation(error)) throw new AgentAssetError("agent_asset_name_conflict", "Agent asset name already exists");
    throw error;
  }
}

export async function archiveAgentAsset(
  db: SqlDatabase,
  input: { adminUserId: string; assetId: string },
): Promise<{ deleted: true }> {
  const assetId = normalizeAssetId(input.assetId);
  const row = await queryOne<{ id: string }>(
    db,
    `
      UPDATE creator_agent_assets
      SET status = 'archived', updated_at = now()
      WHERE id = $1 AND admin_user_id = $2 AND status = 'active'
      RETURNING id
    `,
    [assetId, input.adminUserId],
  );
  if (!row) throw new AgentAssetError("agent_asset_not_found", "Agent asset not found");
  return { deleted: true };
}

export async function getAgentAsset(
  db: SqlDatabase,
  input: { adminUserId: string; assetId: string },
): Promise<AgentAssetRecord | null> {
  const assetId = normalizeAssetId(input.assetId);
  const row = await queryOne<AgentAssetRow>(
    db,
    `
      SELECT id, admin_user_id, created_by_member_id, name, description,
             agent_type, instructions, status, created_at, updated_at
      FROM creator_agent_assets
      WHERE id = $1 AND admin_user_id = $2 AND status = 'active'
    `,
    [assetId, input.adminUserId],
  );
  return row ? record(row) : null;
}
