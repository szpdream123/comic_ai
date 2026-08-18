import assert from "node:assert/strict";
import test from "node:test";

import type { SqlDatabase, SqlQueryResult } from "../../shared/db/sql.ts";
import { createPolicyBoundMarketingResearchProvider, loadActiveMarketingResearchPolicies } from "../infrastructure/marketing-research-agent-provider.ts";

test("policy-bound research provider keeps untrusted data bounded and audits collection", async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const db: SqlDatabase = {
    async query<T>(sql: string, params: unknown[] = []): Promise<SqlQueryResult<T>> {
      queries.push({ sql, params });
      return { rows: [] };
    },
  };
  const provider = createPolicyBoundMarketingResearchProvider({
    db,
    policies: [{ domain: "example.test", maxRequestsPerHour: 2, allowFullText: false }],
    collector: {
      async collect() {
        return [{
          requestedUrl: "https://example.test/article", canonicalUrl: "https://example.test/article",
          title: "Untrusted title", contentType: "text/html", text: "Untrusted full document", untrusted: true,
        }];
      },
    },
  });
  assert.ok(provider);
  const result = await provider.execute({
    runId: "run-1", campaignId: "campaign-1", stage: "research", dataClassification: "public",
    input: { runInput: { urls: ["https://example.test/article"] }, knowledgeSegments: [{ id: "knowledge-1" }] },
    systemRules: [],
  });

  assert.deepEqual(result.knowledgeSegmentIds, ["knowledge-1"]);
  assert.deepEqual(result.output, {
    documents: [{
      requestedUrl: "https://example.test/article", canonicalUrl: "https://example.test/article",
      title: "Untrusted title", contentType: "text/html", text: "Untrusted title", untrusted: true,
      fullTextIncluded: false,
    }],
    untrusted: true,
  });
  assert.ok(queries.some((query) => query.sql.includes("research.http_collected")));
  assert.ok(queries.some((query) => query.sql.includes("marketing_research_request_log")));
});

test("policy-bound research provider blocks non-public input and per-domain rate overrun", async () => {
  const db: SqlDatabase = { async query<T>(): Promise<SqlQueryResult<T>> { return { rows: [] }; } };
  let calls = 0;
  const provider = createPolicyBoundMarketingResearchProvider({
    db,
    policies: [{ domain: "example.test", maxRequestsPerHour: 1, allowFullText: true }],
    collector: {
      async collect() {
        calls += 1;
        return [{
          requestedUrl: "https://example.test/article", canonicalUrl: "https://example.test/article",
          title: "Title", contentType: "text/plain", text: "Text", untrusted: true,
        }];
      },
    },
  });
  assert.ok(provider);
  const request = {
    runId: "run-2", campaignId: "campaign-2", stage: "research" as const,
    input: { runInput: { urls: ["https://example.test/article"] }, knowledgeSegments: [{ id: "knowledge-2" }] }, systemRules: [],
  };
  await assert.rejects(() => provider.execute({ ...request, dataClassification: "internal" }), { name: "marketing_research_public_data_required" });
  await provider.execute({ ...request, dataClassification: "public" });
  await assert.rejects(() => provider.execute({ ...request, dataClassification: "public" }), { name: "marketing_research_rate_limited" });
  assert.equal(calls, 1);
});

test("research policy loader keeps only active policy fields", async () => {
  const db: SqlDatabase = {
    async query<T>(): Promise<SqlQueryResult<T>> {
      return { rows: [{ domain: "example.test", max_requests_per_hour: 3, allow_full_text: true }] as T[] };
    },
  };
  assert.deepEqual(await loadActiveMarketingResearchPolicies(db), [
    { domain: "example.test", maxRequestsPerHour: 3, allowFullText: true },
  ]);
});
