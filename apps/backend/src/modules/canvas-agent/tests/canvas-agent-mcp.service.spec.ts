import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { CanvasAgentKnowledgeAdminService } from "../canvas-agent-knowledge.service.ts";
import { CanvasAgentMcpToolService } from "../canvas-agent-mcp.service.ts";

test("remote MCP bridge enforces server, operation, domain, SSRF, and principal scope", async () => {
  const db = await createMigratedTestDb();
  const userId = randomUUID();
  const canvasId = randomUUID();
  const conversationId = randomUUID();
  const requests: Array<Record<string, unknown>> = [];
  const actor = { ownerUserId: userId, actorTeamMemberId: null, capabilities: new Set(["canvas:view"]) };
  try {
    await db.query("INSERT INTO users (id,status) VALUES ($1,'active')", [userId]);
    await db.query(`
      INSERT INTO creator_canvas_projects (id,title,status,server_revision,created_by_user_id,updated_by_user_id)
      VALUES ($1,'MCP Canvas','active',1,$2,$2)
    `, [canvasId, userId]);
    await db.query(`
      INSERT INTO canvas_agent_conversations (id,canvas_id,owner_user_id,title,created_at,updated_at)
      VALUES ($1,$2,$3,'MCP',now(),now())
    `, [conversationId, canvasId, userId]);
    await new CanvasAgentKnowledgeAdminService(db).setExternalPolicy({
      kind: "mcp",
      targetId: "asset-server",
      enabled: true,
      allowedDomains: ["mcp.example.test"],
      allowedOperations: ["asset.read"],
      now: new Date(),
    });
    const service = new CanvasAgentMcpToolService(
      db,
      (async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: "response", result: { assets: ["asset-1"] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
      (async () => [{ address: "93.184.216.34", family: 4 }]) as typeof import("node:dns/promises").lookup,
    );
    const result = await service.call({
      serverId: "asset-server",
      endpoint: "https://mcp.example.test/rpc",
      operation: "asset.read",
      arguments: { query: "role" },
      canvasId,
      conversationId,
      actor,
    });
    assert.deepEqual(result.result, { assets: ["asset-1"] });
    assert.equal(result.untrusted, true);
    assert.equal(requests[0]?.method, "asset.read");

    await assert.rejects(() => service.call({
      serverId: "asset-server", endpoint: "https://other.example.test/rpc", operation: "asset.read",
      canvasId, conversationId, actor,
    }), /canvas_agent_mcp_domain_not_allowed/);
    await assert.rejects(() => service.call({
      serverId: "asset-server", endpoint: "https://mcp.example.test/rpc", operation: "asset.delete",
      canvasId, conversationId, actor,
    }), /canvas_agent_mcp_operation_not_allowed/);
    await assert.rejects(() => service.call({
      serverId: "asset-server", endpoint: "https://mcp.example.test/rpc", operation: "asset.read",
      canvasId, conversationId: randomUUID(), actor,
    }), /canvas_agent_conversation_not_found/);
  } finally {
    await db.close();
  }
});
