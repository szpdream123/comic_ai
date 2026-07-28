import { createHash, randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type { CanvasAgentActor } from "./canvas-agent.types.ts";

export interface CanvasAgentCitation {
  id: string;
  sourceType: "provider_docs" | "web";
  sourceKey: string;
  title: string;
  canonicalUrl: string | null;
  accessedAt: string;
  excerpt: string;
  excerptHash: string;
}

export class CanvasAgentKnowledgeService {
  constructor(private readonly db: SqlDatabase) {}

  async listMemories(input: {
    canvasId: string;
    conversationId: string;
    actor: CanvasAgentActor;
    limit?: number;
    includeInactive?: boolean;
    category?: string | null;
    source?: string | null;
  }) {
    const result = await this.db.query<{
      id: string;
      memory_key: string;
      value_json: Record<string, unknown>;
      status: "active" | "revoked";
      source_task_id: string | null;
      source_step_id: string | null;
      created_at: Date | string;
      updated_at: Date | string;
    }>(`
      SELECT memory.id, memory.memory_key, memory.value_json, memory.status,
        memory.source_task_id,memory.source_step_id,memory.created_at,memory.updated_at
      FROM canvas_agent_memories memory
      JOIN canvas_agent_conversations conversation ON conversation.id=memory.conversation_id
      WHERE memory.canvas_id=$1 AND memory.conversation_id=$2
        AND memory.owner_user_id=$3
        AND memory.actor_team_member_id IS NOT DISTINCT FROM $4
        AND ($5::boolean OR memory.status='active') AND conversation.deleted_at IS NULL
        AND conversation.owner_user_id=$3
        AND conversation.actor_team_member_id IS NOT DISTINCT FROM $4
      ORDER BY memory.updated_at DESC, memory.id DESC
      LIMIT 200
    `, [
      input.canvasId, input.conversationId, input.actor.ownerUserId,
      input.actor.actorTeamMemberId ?? null, input.includeInactive === true,
    ]);
    const category = normalizeMemoryFilter(input.category);
    const source = normalizeMemoryFilter(input.source);
    return result.rows.map(serializeMemory).filter((memory) =>
      (!category || memory.category === category) && (!source || memory.source === source)
    ).slice(0, clampLimit(input.limit, 100));
  }

  async remember(input: {
    canvasId: string;
    conversationId: string;
    actor: CanvasAgentActor;
    key: string;
    value: Record<string, unknown>;
    taskId?: string | null;
    stepId?: string | null;
    now: Date;
  }) {
    const key = normalizeMemoryKey(input.key);
    const serialized = JSON.stringify(input.value);
    if (Buffer.byteLength(serialized, "utf8") > 16 * 1024) throw new Error("canvas_agent_memory_too_large");
    const row = await queryOne<{ id: string }>(this.db, `
      INSERT INTO canvas_agent_memories (
        id,conversation_id,canvas_id,owner_user_id,actor_team_member_id,
        memory_key,value_json,source_task_id,source_step_id,created_at,updated_at
      )
      SELECT $1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$10
      FROM canvas_agent_conversations conversation
      WHERE conversation.id=$2 AND conversation.canvas_id=$3
        AND conversation.owner_user_id=$4
        AND conversation.actor_team_member_id IS NOT DISTINCT FROM $5
        AND conversation.status='active' AND conversation.deleted_at IS NULL
      ON CONFLICT (
        owner_user_id,
        COALESCE(actor_team_member_id, '00000000-0000-0000-0000-000000000000'::uuid),
        canvas_id,conversation_id,memory_key
      ) WHERE status='active'
      DO UPDATE SET value_json=EXCLUDED.value_json,
        source_task_id=EXCLUDED.source_task_id,source_step_id=EXCLUDED.source_step_id,
        updated_at=EXCLUDED.updated_at
      RETURNING id
    `, [
      randomUUID(), input.conversationId, input.canvasId, input.actor.ownerUserId,
      input.actor.actorTeamMemberId ?? null, key, serialized,
      input.taskId ?? null, input.stepId ?? null, input.now,
    ]);
    if (!row) throw new Error("canvas_agent_conversation_not_found");
    return { id: row.id, key };
  }

  async forget(input: {
    canvasId: string;
    conversationId: string;
    actor: CanvasAgentActor;
    key: string;
    now: Date;
  }) {
    const row = await queryOne<{ id: string }>(this.db, `
      UPDATE canvas_agent_memories
      SET status='revoked',revoked_at=$6,updated_at=$6
      WHERE canvas_id=$1 AND conversation_id=$2 AND owner_user_id=$3
        AND actor_team_member_id IS NOT DISTINCT FROM $4
        AND memory_key=$5 AND status='active'
      RETURNING id
    `, [
      input.canvasId, input.conversationId, input.actor.ownerUserId,
      input.actor.actorTeamMemberId ?? null, normalizeMemoryKey(input.key), input.now,
    ]);
    return Boolean(row);
  }

  async updateMemory(input: {
    canvasId: string;
    conversationId: string;
    memoryId: string;
    actor: CanvasAgentActor;
    key?: string;
    value?: Record<string, unknown>;
    category?: string | null;
    status?: "active" | "revoked";
    now: Date;
  }) {
    const current = await queryOne<{
      id: string; memory_key: string; value_json: Record<string, unknown>;
      status: "active" | "revoked"; source_task_id: string | null; source_step_id: string | null;
      created_at: Date | string; updated_at: Date | string;
    }>(this.db, `
      SELECT id,memory_key,value_json,status,source_task_id,source_step_id,created_at,updated_at
      FROM canvas_agent_memories
      WHERE id=$1 AND canvas_id=$2 AND conversation_id=$3 AND owner_user_id=$4
        AND actor_team_member_id IS NOT DISTINCT FROM $5
      LIMIT 1
    `, [input.memoryId, input.canvasId, input.conversationId, input.actor.ownerUserId, input.actor.actorTeamMemberId ?? null]);
    if (!current) throw new Error("canvas_agent_memory_not_found");
    const key = input.key == null ? current.memory_key : normalizeMemoryKey(input.key);
    const value = sanitizeMemoryValue(input.value ?? current.value_json, input.category);
    const status = input.status ?? current.status;
    if (status === "active") {
      const conflict = await queryOne<{ id: string }>(this.db, `
        SELECT id FROM canvas_agent_memories
        WHERE id<>$1 AND canvas_id=$2 AND conversation_id=$3 AND owner_user_id=$4
          AND actor_team_member_id IS NOT DISTINCT FROM $5 AND memory_key=$6 AND status='active'
        LIMIT 1
      `, [input.memoryId, input.canvasId, input.conversationId, input.actor.ownerUserId, input.actor.actorTeamMemberId ?? null, key]);
      if (conflict) throw new Error("canvas_agent_memory_key_conflict");
    }
    const row = await queryOne<NonNullable<typeof current>>(this.db, `
      UPDATE canvas_agent_memories
      SET memory_key=$2,value_json=$3::jsonb,status=$4,
        revoked_at=CASE WHEN $4='revoked' THEN COALESCE(revoked_at,$5) ELSE NULL END,
        updated_at=$5
      WHERE id=$1
      RETURNING id,memory_key,value_json,status,source_task_id,source_step_id,created_at,updated_at
    `, [input.memoryId, key, JSON.stringify(value), status, input.now]);
    return serializeMemory(row!);
  }

  async deleteMemory(input: {
    canvasId: string;
    conversationId: string;
    memoryId: string;
    actor: CanvasAgentActor;
  }) {
    const row = await queryOne<{ id: string }>(this.db, `
      DELETE FROM canvas_agent_memories
      WHERE id=$1 AND canvas_id=$2 AND conversation_id=$3 AND owner_user_id=$4
        AND actor_team_member_id IS NOT DISTINCT FROM $5
      RETURNING id
    `, [input.memoryId, input.canvasId, input.conversationId, input.actor.ownerUserId, input.actor.actorTeamMemberId ?? null]);
    if (!row) throw new Error("canvas_agent_memory_not_found");
    return { id: row.id, deleted: true };
  }

  async readProviderDocument(input: {
    providerName: string;
    documentKey: string;
    query?: string | null;
    canvasId: string;
    conversationId: string;
    actor: CanvasAgentActor;
    taskId?: string | null;
    stepId?: string | null;
    now: Date;
  }) {
    const document = await queryOne<{
      id: string;
      title: string;
      canonical_url: string | null;
      content_text: string;
      content_hash: string;
    }>(this.db, `
      SELECT id,title,canonical_url,content_text,content_hash
      FROM canvas_agent_provider_documents
      WHERE provider_name=$1 AND document_key=$2 AND status='active'
      LIMIT 1
    `, [normalizeIdentifier(input.providerName, "canvas_agent_provider_name_invalid"), normalizeIdentifier(input.documentKey, "canvas_agent_document_key_invalid")]);
    if (!document) throw new Error("canvas_agent_provider_document_not_found");
    await assertConversationScope(this.db, input);
    const excerpt = selectExcerpt(document.content_text, input.query);
    const citation = await this.createCitation({
      ...input,
      sourceType: "provider_docs",
      sourceKey: document.id,
      title: document.title,
      canonicalUrl: document.canonical_url,
      excerpt,
      metadata: { providerName: input.providerName, documentKey: input.documentKey, contentHash: document.content_hash },
    });
    return { title: document.title, content: excerpt, untrusted: true, citation };
  }

  async createCitation(input: {
    canvasId: string;
    conversationId: string;
    actor: CanvasAgentActor;
    taskId?: string | null;
    stepId?: string | null;
    sourceType: "provider_docs" | "web";
    sourceKey: string;
    title: string;
    canonicalUrl?: string | null;
    excerpt: string;
    metadata?: Record<string, unknown>;
    now: Date;
  }): Promise<CanvasAgentCitation> {
    await assertConversationScope(this.db, input);
    const excerpt = input.excerpt.trim().slice(0, 16_000);
    if (!excerpt) throw new Error("canvas_agent_citation_excerpt_required");
    const excerptHash = sha256(excerpt);
    const id = randomUUID();
    await this.db.query(`
      INSERT INTO canvas_agent_citations (
        id,conversation_id,canvas_id,owner_user_id,actor_team_member_id,
        task_id,step_id,source_type,source_key,title,canonical_url,
        accessed_at,excerpt,excerpt_hash,metadata_json,created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$12)
    `, [
      id, input.conversationId, input.canvasId, input.actor.ownerUserId,
      input.actor.actorTeamMemberId ?? null, input.taskId ?? null, input.stepId ?? null,
      input.sourceType, input.sourceKey, input.title.trim().slice(0, 500),
      canonicalizeUrl(input.canonicalUrl), input.now, excerpt, excerptHash,
      JSON.stringify(input.metadata ?? {}),
    ]);
    return {
      id,
      sourceType: input.sourceType,
      sourceKey: input.sourceKey,
      title: input.title.trim().slice(0, 500),
      canonicalUrl: canonicalizeUrl(input.canonicalUrl),
      accessedAt: input.now.toISOString(),
      excerpt,
      excerptHash,
    };
  }

  async listCitations(input: {
    canvasId: string;
    conversationId: string;
    actor: CanvasAgentActor;
    limit?: number;
  }): Promise<CanvasAgentCitation[]> {
    const result = await this.db.query<{
      id: string; source_type: "provider_docs" | "web"; source_key: string;
      title: string; canonical_url: string | null; accessed_at: Date | string;
      excerpt: string; excerpt_hash: string;
    }>(`
      SELECT id,source_type,source_key,title,canonical_url,accessed_at,excerpt,excerpt_hash
      FROM canvas_agent_citations
      WHERE canvas_id=$1 AND conversation_id=$2 AND owner_user_id=$3
        AND actor_team_member_id IS NOT DISTINCT FROM $4
      ORDER BY created_at DESC,id DESC LIMIT $5
    `, [input.canvasId, input.conversationId, input.actor.ownerUserId, input.actor.actorTeamMemberId ?? null, clampLimit(input.limit, 100)]);
    return result.rows.map((row) => ({
      id: row.id, sourceType: row.source_type, sourceKey: row.source_key,
      title: row.title, canonicalUrl: row.canonical_url,
      accessedAt: new Date(row.accessed_at).toISOString(), excerpt: row.excerpt, excerptHash: row.excerpt_hash,
    }));
  }
}

export class CanvasAgentExternalToolBoundary {
  constructor(private readonly db: SqlDatabase) {}

  async authorize(input: {
    kind: "web" | "mcp";
    targetId: string;
    domain?: string | null;
    operation?: string | null;
  }) {
    const policy = await queryOne<{
      enabled: boolean;
      allowed_domains_json: unknown;
      allowed_operations_json: unknown;
    }>(this.db, `
      SELECT enabled,allowed_domains_json,allowed_operations_json
      FROM canvas_agent_external_tool_policies
      WHERE tool_kind=$1 AND target_id=$2 LIMIT 1
    `, [input.kind, input.targetId.trim()]);
    if (!policy?.enabled) throw new Error(`canvas_agent_${input.kind}_disabled`);
    const domains = readStringArray(policy.allowed_domains_json);
    const operations = readStringArray(policy.allowed_operations_json);
    if (input.kind === "web") {
      const domain = normalizeDomain(input.domain);
      if (!domain || !domains.includes(domain)) throw new Error("canvas_agent_web_domain_not_allowed");
    }
    if (input.kind === "mcp") {
      const operation = String(input.operation ?? "").trim();
      if (!operation || !operations.includes(operation)) throw new Error("canvas_agent_mcp_operation_not_allowed");
      if (input.domain != null && domains.length && !domains.includes(normalizeDomain(input.domain))) {
        throw new Error("canvas_agent_mcp_domain_not_allowed");
      }
    }
    // An enabled policy is only an authorization boundary. A separately
    // configured server-side adapter is still required; no arbitrary fetch or
    // local stdio capability is exposed here.
    return { targetId: input.targetId, domains, operations };
  }
}

/** Admin-only store primitive. HTTP callers must pass through existing admin auth. */
export class CanvasAgentKnowledgeAdminService {
  constructor(private readonly db: SqlDatabase) {}

  async upsertProviderDocument(input: {
    providerName: string;
    documentKey: string;
    title: string;
    canonicalUrl?: string | null;
    content: string;
    adminId?: string | null;
    status?: "active" | "disabled";
    now: Date;
  }) {
    const providerName = normalizeIdentifier(input.providerName, "canvas_agent_provider_name_invalid");
    const documentKey = normalizeIdentifier(input.documentKey, "canvas_agent_document_key_invalid");
    const content = input.content.trim();
    if (!content || Buffer.byteLength(content, "utf8") > 2 * 1024 * 1024) {
      throw new Error("canvas_agent_provider_document_size_invalid");
    }
    const row = await queryOne<{ id: string }>(this.db, `
      INSERT INTO canvas_agent_provider_documents (
        id,provider_name,document_key,title,canonical_url,content_text,
        content_hash,status,created_by_admin_id,created_at,updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
      ON CONFLICT (provider_name,document_key)
      DO UPDATE SET title=EXCLUDED.title,canonical_url=EXCLUDED.canonical_url,
        content_text=EXCLUDED.content_text,content_hash=EXCLUDED.content_hash,
        status=EXCLUDED.status,updated_at=EXCLUDED.updated_at
      RETURNING id
    `, [
      randomUUID(), providerName, documentKey, input.title.trim().slice(0, 500),
      canonicalizeUrl(input.canonicalUrl), content, sha256(content),
      input.status ?? "active", input.adminId ?? null, input.now,
    ]);
    return { id: row!.id, providerName, documentKey, contentHash: sha256(content) };
  }

  async setExternalPolicy(input: {
    kind: "web" | "mcp";
    targetId: string;
    enabled: boolean;
    allowedDomains?: string[];
    allowedOperations?: string[];
    adminId?: string | null;
    now: Date;
  }) {
    const targetId = normalizeIdentifier(input.targetId, "canvas_agent_external_target_invalid");
    const domains = [...new Set((input.allowedDomains ?? []).map(normalizeDomain).filter(Boolean))].sort();
    const operations = [...new Set((input.allowedOperations ?? []).map((value) => value.trim()).filter((value) => /^[A-Za-z0-9_.:-]{1,160}$/.test(value)))].sort();
    if (input.enabled && input.kind === "web" && !domains.length) throw new Error("canvas_agent_web_allowlist_required");
    if (input.enabled && input.kind === "mcp" && !operations.length) throw new Error("canvas_agent_mcp_allowlist_required");
    const row = await queryOne<{ id: string }>(this.db, `
      INSERT INTO canvas_agent_external_tool_policies (
        id,tool_kind,target_id,enabled,allowed_domains_json,
        allowed_operations_json,created_by_admin_id,created_at,updated_at
      ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$8)
      ON CONFLICT (tool_kind,target_id)
      DO UPDATE SET enabled=EXCLUDED.enabled,
        allowed_domains_json=EXCLUDED.allowed_domains_json,
        allowed_operations_json=EXCLUDED.allowed_operations_json,
        updated_at=EXCLUDED.updated_at
      RETURNING id
    `, [
      randomUUID(), input.kind, targetId, input.enabled,
      JSON.stringify(domains), JSON.stringify(operations), input.adminId ?? null, input.now,
    ]);
    return { id: row!.id, kind: input.kind, targetId, enabled: input.enabled, domains, operations };
  }
}

async function assertConversationScope(db: SqlDatabase, input: {
  canvasId: string;
  conversationId: string;
  actor: CanvasAgentActor;
}) {
  const row = await queryOne<{ id: string }>(db, `
    SELECT id FROM canvas_agent_conversations
    WHERE id=$1 AND canvas_id=$2 AND owner_user_id=$3
      AND actor_team_member_id IS NOT DISTINCT FROM $4
      AND deleted_at IS NULL LIMIT 1
  `, [input.conversationId, input.canvasId, input.actor.ownerUserId, input.actor.actorTeamMemberId ?? null]);
  if (!row) throw new Error("canvas_agent_conversation_not_found");
}

function selectExcerpt(content: string, query?: string | null) {
  const normalized = content.trim();
  const term = String(query ?? "").trim().toLowerCase();
  if (!term) return normalized.slice(0, 12_000);
  const index = normalized.toLowerCase().indexOf(term);
  if (index < 0) return normalized.slice(0, 12_000);
  return normalized.slice(Math.max(0, index - 2_000), Math.min(normalized.length, index + term.length + 10_000));
}

function normalizeMemoryKey(value: string) {
  const key = value.trim();
  if (!/^[A-Za-z0-9_.:-]{1,120}$/.test(key)) throw new Error("canvas_agent_memory_key_invalid");
  return key;
}

function sanitizeMemoryValue(value: Record<string, unknown>, category?: string | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("canvas_agent_memory_value_invalid");
  const normalized = { ...value };
  if (category !== undefined) {
    const nextCategory = normalizeMemoryCategory(category);
    if (nextCategory) normalized.category = nextCategory;
    else delete normalized.category;
  }
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > 16 * 1024) throw new Error("canvas_agent_memory_too_large");
  return normalized;
}

function serializeMemory(row: {
  id: string; memory_key: string; value_json: Record<string, unknown>;
  status: "active" | "revoked"; source_task_id: string | null; source_step_id: string | null;
  created_at: Date | string; updated_at: Date | string;
}) {
  return {
    id: row.id,
    key: row.memory_key,
    value: row.value_json,
    category: normalizeMemoryCategory(row.value_json?.category) || "general",
    source: row.source_step_id ? "agent_step" : row.source_task_id ? "agent_task" : "user",
    sourceTaskId: row.source_task_id,
    sourceStepId: row.source_step_id,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function normalizeMemoryCategory(value: unknown) {
  const category = String(value ?? "").trim().toLowerCase();
  return /^[a-z0-9_.:-]{1,80}$/.test(category) ? category : "";
}

function normalizeMemoryFilter(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeIdentifier(value: string, code: string) {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(normalized)) throw new Error(code);
  return normalized;
}

function canonicalizeUrl(value?: string | null) {
  if (!value?.trim()) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("canvas_agent_citation_url_invalid");
  }
  if (url.protocol !== "https:") throw new Error("canvas_agent_citation_url_invalid");
  url.hash = "";
  return url.toString();
}

function normalizeDomain(value?: string | null) {
  const domain = String(value ?? "").trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  return /^[a-z0-9.-]+$/.test(domain) ? domain : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
}

function clampLimit(value: number | undefined, fallback: number) {
  return Math.min(200, Math.max(1, Number.isFinite(value) ? Math.trunc(value!) : fallback));
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export const __canvasAgentKnowledgeTestUtils = {
  canonicalizeUrl,
  normalizeDomain,
  normalizeMemoryKey,
  selectExcerpt,
};
