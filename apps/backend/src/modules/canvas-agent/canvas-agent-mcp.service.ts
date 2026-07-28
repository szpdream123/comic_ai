import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";

import type { CanvasAgentActor } from "./canvas-agent.types.ts";
import { assertNoLocalPath } from "./canvas-agent-context.service.ts";
import { CanvasAgentExternalToolBoundary } from "./canvas-agent-knowledge.service.ts";
import { assertPublicHostname } from "./canvas-agent-web.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";

const maxResponseBytes = 2 * 1024 * 1024;

export class CanvasAgentMcpToolService {
  private readonly boundary: CanvasAgentExternalToolBoundary;

  constructor(
    private readonly db: SqlDatabase,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly lookupImpl: typeof lookup = lookup,
  ) {
    this.boundary = new CanvasAgentExternalToolBoundary(db);
  }

  async call(input: {
    serverId: string;
    endpoint: string;
    operation: string;
    arguments?: Record<string, unknown>;
    canvasId: string;
    conversationId: string;
    actor: CanvasAgentActor;
    taskId?: string | null;
    stepId?: string | null;
  }) {
    const operation = String(input.operation ?? "").trim();
    if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(operation)) throw new Error("canvas_agent_mcp_operation_invalid");
    const endpoint = normalizeEndpoint(input.endpoint);
    const conversation = await this.db.query<{ id: string }>(`
      SELECT id FROM canvas_agent_conversations
      WHERE id=$1 AND canvas_id=$2 AND owner_user_id=$3
        AND actor_team_member_id IS NOT DISTINCT FROM $4
        AND deleted_at IS NULL LIMIT 1
    `, [input.conversationId, input.canvasId, input.actor.ownerUserId, input.actor.actorTeamMemberId ?? null]);
    if (!conversation.rows[0]) throw new Error("canvas_agent_conversation_not_found");
    await assertPublicHostname(endpoint.hostname, this.lookupImpl);
    const policy = await this.boundary.authorize({
      kind: "mcp",
      targetId: input.serverId,
      operation,
      domain: endpoint.hostname,
    });
    if (!policy.domains.includes(endpoint.hostname.toLowerCase())) {
      throw new Error("canvas_agent_mcp_domain_not_allowed");
    }
    const args = input.arguments && typeof input.arguments === "object" ? input.arguments : {};
    assertNoLocalPath(args);
    const response = await this.fetchImpl(endpoint, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: randomUUID(), method: operation, params: args }),
    });
    if (!response.ok) throw new Error(`canvas_agent_mcp_http_${response.status}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > maxResponseBytes) throw new Error("canvas_agent_mcp_response_too_large");
    let payload: unknown;
    try { payload = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error("canvas_agent_mcp_response_invalid"); }
    const record = asRecord(payload);
    if (record.error) throw new Error("canvas_agent_mcp_remote_error");
    return {
      serverId: input.serverId,
      operation,
      result: record.result ?? record,
      untrusted: true,
      citation: {
        sourceType: "mcp",
        sourceKey: `${input.serverId}:${operation}`,
        endpoint: endpoint.toString(),
      },
    };
  }
}

function normalizeEndpoint(value: string) {
  let endpoint: URL;
  try { endpoint = new URL(String(value ?? "").trim()); } catch { throw new Error("canvas_agent_mcp_endpoint_invalid"); }
  if (!(["https:", "http:"].includes(endpoint.protocol)) || endpoint.username || endpoint.password || endpoint.hash) {
    throw new Error("canvas_agent_mcp_endpoint_invalid");
  }
  return endpoint;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
