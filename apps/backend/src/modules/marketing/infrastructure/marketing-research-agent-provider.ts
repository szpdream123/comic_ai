import { createHash } from "node:crypto";

import type { SqlDatabase } from "../../shared/db/sql.ts";
import type {
  MarketingAgentJson,
  MarketingAgentStageProvider,
  MarketingAgentStageRequest,
} from "../ports/marketing-agent.ts";
import type { MarketingResearchProvider } from "../ports/marketing-research.ts";
import { MarketingResearchHttpProvider } from "./marketing-research-http.ts";

type ResearchPolicy = {
  domain: string;
  maxRequestsPerHour: number;
  allowFullText: boolean;
};

export async function loadActiveMarketingResearchPolicies(db: SqlDatabase) {
  const result = await db.query<{
    domain: string;
    max_requests_per_hour: number;
    allow_full_text: boolean;
  }>(
    `SELECT domain, max_requests_per_hour, allow_full_text
     FROM marketing_research_source_policies
     WHERE status = 'active'
     ORDER BY domain`,
  );
  return result.rows.map((row) => ({
    domain: row.domain,
    maxRequestsPerHour: Math.max(1, Math.min(100, Number(row.max_requests_per_hour) || 1)),
    allowFullText: row.allow_full_text === true,
  })) satisfies ResearchPolicy[];
}

export function createPolicyBoundMarketingResearchProvider(input: {
  db: SqlDatabase;
  policies: ResearchPolicy[];
  fetchImpl?: typeof fetch;
  collector?: MarketingResearchProvider;
}): MarketingAgentStageProvider | null {
  if (!input.policies.length) return null;
  const policies = new Map(input.policies.map((policy) => [policy.domain, policy]));
  const recentRequests = new Map<string, number[]>();
  const collector = input.collector ?? new MarketingResearchHttpProvider([...policies.keys()], input.fetchImpl);

  return {
    stage: "research",
    name: "policy-bound-http-research",
    modelVersion: "http-v1",
    execution: "local",
    async execute(request: MarketingAgentStageRequest) {
      if (request.dataClassification !== "public") {
        throw namedError("marketing_research_public_data_required");
      }
      const runInput = readObject(readObject(request.input).runInput);
      const urls = uniqueUrls(runInput.urls);
      if (!urls.length || urls.length > 20) throw namedError("marketing_research_url_count_invalid");
      const now = Date.now();
      for (const url of urls) {
        const quota = consumePolicyQuota(policies, recentRequests, url, now);
        try {
          await consumePersistentPolicyQuota(input.db, quota.policy, url, request.runId, now);
        } catch (error) {
          releasePolicyQuota(recentRequests, quota.domain, now);
          throw error;
        }
      }
      const documents = await collector.collect({ urls });
      const outputDocuments = documents.map((document) => {
        const policy = policies.get(new URL(document.canonicalUrl).hostname.toLowerCase())!;
        return {
          requestedUrl: document.requestedUrl,
          canonicalUrl: document.canonicalUrl,
          title: document.title,
          contentType: document.contentType,
          text: policy.allowFullText ? document.text : document.title,
          untrusted: true,
          fullTextIncluded: policy.allowFullText,
        };
      });
      await input.db.query(
        `INSERT INTO marketing_audit_events (
           id, campaign_id, actor_type, actor_id, event_type, detail_json
         ) VALUES (gen_random_uuid(), $1, 'system', 'marketing-research-worker', 'research.http_collected', $2::jsonb)`,
        [request.campaignId, JSON.stringify({
          runId: request.runId,
          stage: request.stage,
          documentCount: outputDocuments.length,
          sources: outputDocuments.map((document) => ({
            domain: new URL(document.canonicalUrl).hostname,
            canonicalUrlSha256: createHash("sha256").update(document.canonicalUrl).digest("hex"),
            fullTextIncluded: document.fullTextIncluded,
          })),
        })],
      );
      return {
        output: { documents: outputDocuments, untrusted: true } satisfies MarketingAgentJson,
        knowledgeSegmentIds: stringArray(readObject(request.input).knowledgeSegments)
          .map((segment) => typeof segment.id === "string" ? segment.id : "")
          .filter(Boolean),
      };
    },
  };
}

function consumePolicyQuota(
  policies: Map<string, ResearchPolicy>,
  recentRequests: Map<string, number[]>,
  rawUrl: string,
  now: number,
) {
  const url = new URL(rawUrl);
  const domain = url.hostname.toLowerCase().replace(/\.$/, "");
  const policy = policies.get(domain);
  if (!policy) throw namedError("marketing_research_domain_not_allowed");
  const cutoff = now - 60 * 60 * 1000;
  const current = (recentRequests.get(domain) ?? []).filter((timestamp) => timestamp > cutoff);
  if (current.length >= policy.maxRequestsPerHour) throw namedError("marketing_research_rate_limited");
  current.push(now);
  recentRequests.set(domain, current);
  return { domain, policy };
}

function releasePolicyQuota(recentRequests: Map<string, number[]>, domain: string, now: number) {
  const current = recentRequests.get(domain);
  if (!current) return;
  const index = current.lastIndexOf(now);
  if (index >= 0) current.splice(index, 1);
  if (current.length) recentRequests.set(domain, current);
  else recentRequests.delete(domain);
}

async function consumePersistentPolicyQuota(
  db: SqlDatabase,
  policy: ResearchPolicy,
  rawUrl: string,
  runId: string,
  now: number,
) {
  const domain = new URL(rawUrl).hostname.toLowerCase().replace(/\.$/, "");
  const requestedAt = new Date(now);
  const cutoff = new Date(now - 60 * 60 * 1000);
  await db.query("BEGIN");
  try {
    // Serializes quota checks for a domain even when several workers are configured later.
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`marketing_research:${domain}`]);
    await db.query(
      "DELETE FROM marketing_research_request_log WHERE domain = $1 AND requested_at <= $2",
      [domain, cutoff],
    );
    const current = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM marketing_research_request_log WHERE domain = $1 AND requested_at > $2",
      [domain, cutoff],
    );
    if ((current.rows[0]?.count ?? 0) >= policy.maxRequestsPerHour) {
      throw namedError("marketing_research_rate_limited");
    }
    await db.query(
      `INSERT INTO marketing_research_request_log (id, domain, run_id, requested_at)
       VALUES (gen_random_uuid(), $1, $2, $3)`,
      [domain, runId, requestedAt],
    );
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

function uniqueUrls(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((url) => url.trim()).filter(Boolean))];
}

function readObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function namedError(name: string) {
  const error = new Error(name);
  error.name = name;
  return error;
}
