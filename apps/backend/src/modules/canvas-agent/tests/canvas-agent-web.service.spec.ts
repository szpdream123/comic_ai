import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Agent } from "undici";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { CanvasAgentKnowledgeAdminService } from "../canvas-agent-knowledge.service.ts";
import {
  CanvasAgentWebToolService,
  fetchResolvedPublicUrl,
  resolvePublicHostname,
} from "../canvas-agent-web.service.ts";

test("external web requests connect through the public address checked by DNS", async () => {
  let lookupCalls = 0;
  const resolution = await resolvePublicHostname("docs.example.test", (async () => {
    lookupCalls += 1;
    return [{ address: "93.184.216.34", family: 4 }];
  }) as typeof import("node:dns/promises").lookup);
  let pinned: { hostname: string; address: string } | undefined;
  let requestDispatcher: unknown;
  const response = await fetchResolvedPublicUrl(
    new URL("https://docs.example.test/article"),
    { redirect: "manual" },
    resolution,
    (async (_request, init) => {
      requestDispatcher = (init as RequestInit & { dispatcher?: unknown }).dispatcher;
      return new Response("ok");
    }) as typeof fetch,
    (input) => {
      pinned = input;
      return new Agent();
    },
  );
  assert.equal(await response.text(), "ok");
  assert.equal(lookupCalls, 1);
  assert.deepEqual(pinned, { hostname: "docs.example.test", address: "93.184.216.34" });
  assert.ok(requestDispatcher instanceof Agent);
});

test("web extract enforces admin domain policy, records citation, and rejects SSRF", async () => {
  const db = await createMigratedTestDb();
  const userId = randomUUID();
  const canvasId = randomUUID();
  const conversationId = randomUUID();
  const searchModelCode = `canvas-search-generic-${randomUUID()}`;
  const now = new Date("2026-07-25T15:00:00.000Z");
  try {
    await db.query("INSERT INTO users (id,phone_e164,status) VALUES ($1,$2,'active')", [userId, `13${String(Date.now()).slice(-9)}`]);
    await db.query(`
      INSERT INTO creator_canvas_projects (id,title,status,server_revision,created_by_user_id,updated_by_user_id)
      VALUES ($1,'Web canvas','active',1,$2,$2)
    `, [canvasId, userId]);
    await db.query(`
      INSERT INTO canvas_agent_conversations (id,canvas_id,owner_user_id,title,created_at,updated_at)
      VALUES ($1,$2,$3,'Web test',$4,$4)
    `, [conversationId, canvasId, userId, now]);
    await new CanvasAgentKnowledgeAdminService(db).setExternalPolicy({
      kind: "web",
      targetId: "direct",
      enabled: true,
      allowedDomains: ["docs.example.test"],
      now,
    });
    await seedSearchProvider(db, {
      modelCode: searchModelCode,
      providerName: "generic-json",
      providerConfig: {
        searchProvider: "generic_json",
        endpoint: "https://search.example.test/api/search",
        searchMethod: "GET",
        queryField: "q",
        limitField: "limit",
        apiKeyEnv: `SEARCH_KEY_${randomUUID()}`,
      },
    });
    await new CanvasAgentKnowledgeAdminService(db).setExternalPolicy({
      kind: "web",
      targetId: searchModelCode,
      enabled: true,
      allowedDomains: ["search.example.test"],
      now,
    });
    const service = new CanvasAgentWebToolService(
      db,
      (async () => new Response("<html><title>Docs</title><script>drop</script><p>Hello &amp; world</p></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as typeof fetch,
      () => now,
      (async () => [{ address: "93.184.216.34", family: 4 }]) as typeof import("node:dns/promises").lookup,
      { searchModelCode },
    );
    const actor = { ownerUserId: userId, actorTeamMemberId: null, capabilities: new Set(["canvas:view"]) };
    const result = await service.extract({
      providerId: "direct",
      url: "https://docs.example.test/article#section",
      canvasId,
      conversationId,
      actor,
      taskId: null,
      stepId: null,
    });
    assert.equal(result.content, "Docs Hello & world");
    assert.equal(result.citation.sourceType, "web");
    await assert.rejects(
      () => service.extract({ providerId: "direct", url: "http://127.0.0.1/admin", canvasId, conversationId, actor, taskId: null, stepId: null }),
      /canvas_agent_web_domain_not_allowed|canvas_agent_web_ssrf_blocked/,
    );
    await assert.rejects(
      () => service.extract({ providerId: "unknown", url: "https://docs.example.test/article", canvasId, conversationId, actor, taskId: null, stepId: null }),
      /canvas_agent_web_disabled/,
    );

    const searchService = new CanvasAgentWebToolService(
      db,
      (async (request) => {
        const requestUrl = new URL(String(request));
        assert.equal(requestUrl.searchParams.get("q"), "Canvas Agent");
        assert.equal(requestUrl.searchParams.get("limit"), "2");
        return new Response(JSON.stringify({
          results: [
            { title: "Canvas Agent Docs", url: "https://docs.example.test/agent", snippet: "Agent documentation" },
            { title: "Canvas Runtime", link: "https://docs.example.test/runtime#section", description: "Runtime documentation" },
          ],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
      () => now,
      (async () => [{ address: "93.184.216.34", family: 4 }]) as typeof import("node:dns/promises").lookup,
      { searchModelCode },
    );
    const search = await searchService.search({
      query: "Canvas Agent",
      limit: 2,
      canvasId,
      conversationId,
      actor,
      taskId: null,
      stepId: null,
    });
    assert.equal(search.results.length, 2);
    assert.equal(search.providerId, searchModelCode);
    assert.equal(search.providerAdapter, "generic_json");
    assert.equal(search.results[0]?.citation.sourceType, "web");
    assert.equal(search.results[1]?.url, "https://docs.example.test/runtime");
    const citations = await db.query<{ source_key: string }>(
      "SELECT source_key FROM canvas_agent_citations WHERE conversation_id=$1 ORDER BY created_at,id",
      [conversationId],
    );
    assert.equal(citations.rows.length, 3);
  } finally {
    await db.close();
  }
});

test("production search adapters resolve endpoint and secret only from admin configuration", async () => {
  const db = await createMigratedTestDb();
  const userId = randomUUID();
  const canvasId = randomUUID();
  const conversationId = randomUUID();
  const tavilyModelCode = `canvas-search-tavily-${randomUUID()}`;
  const bingModelCode = `canvas-search-bing-${randomUUID()}`;
  const now = new Date("2026-07-25T16:00:00.000Z");
  const actor = { ownerUserId: userId, actorTeamMemberId: null, capabilities: new Set(["canvas:view"]) };
  try {
    await db.query("INSERT INTO users (id,phone_e164,status) VALUES ($1,$2,'active')", [userId, `14${String(Date.now()).slice(-9)}`]);
    await db.query(`
      INSERT INTO creator_canvas_projects (id,title,status,server_revision,created_by_user_id,updated_by_user_id)
      VALUES ($1,'Provider canvas','active',1,$2,$2)
    `, [canvasId, userId]);
    await db.query(`
      INSERT INTO canvas_agent_conversations (id,canvas_id,owner_user_id,title,created_at,updated_at)
      VALUES ($1,$2,$3,'Provider test',$4,$4)
    `, [conversationId, canvasId, userId, now]);
    await seedSearchProvider(db, {
      modelCode: tavilyModelCode,
      providerName: "Tavily",
      providerConfig: {
        searchProvider: "tavily",
        baseURL: "https://api.tavily.test",
        endpoint: "/search",
        apiKeyEnv: `TAVILY_KEY_${randomUUID()}`,
      },
    });
    await seedSearchProvider(db, {
      modelCode: bingModelCode,
      providerName: "Microsoft Bing",
      providerConfig: {
        searchProvider: "bing",
        endpoint: "https://api.bing.test/v7.0/search",
        apiKeyEnv: `BING_KEY_${randomUUID()}`,
      },
    });
    const admin = new CanvasAgentKnowledgeAdminService(db);
    await admin.setExternalPolicy({ kind: "web", targetId: tavilyModelCode, enabled: true, allowedDomains: ["api.tavily.test"], now });
    await admin.setExternalPolicy({ kind: "web", targetId: bingModelCode, enabled: true, allowedDomains: ["api.bing.test"], now });
    const publicLookup = (async () => [{ address: "93.184.216.34", family: 4 }]) as typeof import("node:dns/promises").lookup;

    const tavily = new CanvasAgentWebToolService(db, (async (request, init) => {
      assert.equal(String(request), "https://api.tavily.test/search");
      assert.equal(init?.method, "POST");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer server-side-search-secret");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        query: "production search",
        max_results: 3,
        search_depth: "basic",
        include_answer: false,
        include_raw_content: false,
      });
      return new Response(JSON.stringify({ results: [{ title: "Tavily result", url: "https://result.example/tavily", content: "Tavily citation" }] }), {
        status: 200,
        headers: { "content-type": "application/json", "x-request-id": "tavily-request-1" },
      });
    }) as typeof fetch, () => now, publicLookup, { searchModelCode: tavilyModelCode });
    const tavilyResult = await tavily.search({ query: "production search", limit: 3, canvasId, conversationId, actor, taskId: null, stepId: null });
    assert.equal(tavilyResult.providerAdapter, "tavily");
    assert.equal(tavilyResult.providerRequestId, "tavily-request-1");
    assert.equal(tavilyResult.results[0]?.citation.sourceType, "web");
    const tavilyAudit = await db.query<{ metadata_json: Record<string, unknown> }>(
      "SELECT metadata_json FROM canvas_agent_citations WHERE id=$1",
      [tavilyResult.results[0]?.citation.id],
    );
    assert.equal(tavilyAudit.rows[0]?.metadata_json.modelConfigId, tavilyResult.modelConfigId);
    assert.equal(tavilyAudit.rows[0]?.metadata_json.providerRequestId, "tavily-request-1");
    assert.doesNotMatch(JSON.stringify(tavilyAudit.rows[0]?.metadata_json), /server-side-search-secret/);

    const bing = new CanvasAgentWebToolService(db, (async (request, init) => {
      const url = new URL(String(request));
      assert.equal(url.searchParams.get("q"), "bing query");
      assert.equal(url.searchParams.get("count"), "2");
      assert.equal(new Headers(init?.headers).get("ocp-apim-subscription-key"), "server-side-search-secret");
      return new Response(JSON.stringify({ webPages: { value: [{ name: "Bing result", url: "https://result.example/bing", snippet: "Bing citation" }] } }), {
        status: 200,
        headers: { "content-type": "application/json", "x-msedge-clientid": "bing-request-1" },
      });
    }) as typeof fetch, () => now, publicLookup, { searchModelCode: bingModelCode });
    const bingResult = await bing.search({ query: "bing query", limit: 2, canvasId, conversationId, actor, taskId: null, stepId: null });
    assert.equal(bingResult.providerAdapter, "bing");
    assert.equal(bingResult.providerRequestId, "bing-request-1");

    const throttled = new CanvasAgentWebToolService(db, (async () => new Response("secret provider details", { status: 429 })) as typeof fetch,
      () => now, publicLookup, { searchModelCode: bingModelCode });
    await assert.rejects(
      () => throttled.search({ query: "throttle", canvasId, conversationId, actor, taskId: null, stepId: null }),
      (error) => error instanceof Error && error.message === "canvas_agent_web_search_provider_rate_limited",
    );
  } finally {
    await db.close();
  }
});

async function seedSearchProvider(db: Awaited<ReturnType<typeof createMigratedTestDb>>, input: {
  modelCode: string;
  providerName: string;
  providerConfig: Record<string, unknown> & { apiKeyEnv: string };
}) {
  await db.query(`
    INSERT INTO admin_secret_values (
      id,secret_ref,secret_key,secret_value,purpose,provider_name,status,created_at,updated_at
    ) VALUES ($1,$2,$2,'server-side-search-secret','canvas_agent_web_search',$3,'configured',now(),now())
  `, [randomUUID(), input.providerConfig.apiKeyEnv, input.providerName]);
  await db.query(`
    INSERT INTO ai_model_configs (
      id,model_code,display_name,provider_name,provider_model,provider_protocol,
      invocation_mode,media_type,task_modes_json,capabilities_json,parameter_schema_json,
      default_params_json,provider_config_json,pricing_json,limits_json,ui_config_json,status
    ) VALUES ($1,$2,'Canvas Search',$3,'web-search','custom_http','sync','text',
      '["text.canvas_agent_web_search"]'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
      $4::jsonb,'{"baseCredits":1}'::jsonb,'{}'::jsonb,'{}'::jsonb,'active')
  `, [randomUUID(), input.modelCode, input.providerName, JSON.stringify(input.providerConfig)]);
}
