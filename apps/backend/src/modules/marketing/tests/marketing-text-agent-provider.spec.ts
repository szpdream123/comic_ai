import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  loadMarketingTextAgentProviders,
  MarketingTextAgentProvider,
} from "../infrastructure/marketing-text-agent-provider.ts";
import type { MarketingAgentStageRequest } from "../ports/marketing-agent.ts";

describe("marketing text agent provider", () => {
  it("is disabled until the deployment switch is explicitly enabled", async () => {
    const db = await createMigratedTestDb();
    try {
      const providers = await loadMarketingTextAgentProviders({ db, env: {} });
      assert.deepEqual(providers, []);
    } finally {
      await db.close();
    }
  });

  it("loads only database-approved stages and retains approval constraints", async () => {
    const db = await createMigratedTestDb();
    try {
      const adminId = await seedAdmin(db);
      await insertApprovedModelAdmission(db, adminId, "marketing-text-model");
      await db.query(
        `INSERT INTO marketing_agent_provider_approvals (
           id, provider_name, model_code, stage, approval_reference,
           data_classifications_json, allowed_input_paths_json, status, approved_by_admin_id, approved_at, created_by_admin_id
         ) VALUES ($1, 'marketing-text-gateway', 'marketing-text-model', 'strategy', 'MKT-APP-1',
                   '["public","internal"]'::jsonb, '["runInput.publicBrief"]'::jsonb, 'approved', $2, now(), $2)`,
        [randomUUID(), adminId],
      );
      const providers = await loadMarketingTextAgentProviders({
        db,
        env: { MARKETING_TEXT_AGENT_ENABLED: "true" },
        gateway: fakeGateway('{"output":{"strategy":"original"},"knowledgeSegmentIds":["segment-1"]}'),
      });
      assert.equal(providers.length, 1);
      assert.equal(providers[0]?.stage, "strategy");
      assert.deepEqual(providers[0]?.approval, {
        approved: true,
        approvalReference: "MKT-APP-1",
        dataClassifications: ["public", "internal"],
        allowedInputPaths: ["runInput.publicBrief"],
      });
    } finally {
      await db.close();
    }
  });

  it("does not load an approved model provider until its component admission is approved", async () => {
    const db = await createMigratedTestDb();
    try {
      const adminId = await seedAdmin(db);
      await db.query(
        `INSERT INTO marketing_agent_provider_approvals (
           id, provider_name, model_code, stage, approval_reference,
           data_classifications_json, allowed_input_paths_json, status, approved_by_admin_id, approved_at, created_by_admin_id
         ) VALUES ($1, 'marketing-text-gateway', 'unadmitted-model', 'strategy', 'MKT-APP-2',
                   '["public"]'::jsonb, '["runInput.publicBrief"]'::jsonb, 'approved', $2, now(), $2)`,
        [randomUUID(), adminId],
      );
      const providers = await loadMarketingTextAgentProviders({
        db, env: { MARKETING_TEXT_AGENT_ENABLED: "true" }, gateway: fakeGateway("{}"),
      });
      assert.deepEqual(providers, []);
    } finally {
      await db.close();
    }
  });

  it("uses strict JSON, maps usage, and records an administrator request context", async () => {
    const calls: unknown[][] = [];
    const provider = new MarketingTextAgentProvider({
      gateway: fakeGateway('{"output":{"strategy":"original"},"knowledgeSegmentIds":["segment-1"]}', calls),
      modelCode: "marketing-text-model",
      stage: "strategy",
      approval: approval(),
    });
    const result = await provider.execute(request("strategy"));

    assert.deepEqual(result, {
      output: { strategy: "original" },
      knowledgeSegmentIds: ["segment-1"],
      usage: { inputTokens: 12, outputTokens: 8 },
    });
    const context = calls[0]?.[1] as Record<string, unknown>;
    assert.equal(context.createdByAdminId, "00000000-0000-4000-8000-000000000001");
    assert.equal(context.createdByUserId, undefined);
    assert.match(String(context.requestKey), /^marketing-agent:run-1:strategy:[0-9a-f-]{36}$/);
  });

  it("blocks restricted classifications and sensitive fields or values before any model request", async () => {
    const calls: unknown[][] = [];
    const provider = new MarketingTextAgentProvider({
      gateway: fakeGateway('{"output":{},"knowledgeSegmentIds":["segment-1"]}', calls),
      modelCode: "marketing-text-model",
      stage: "strategy",
      approval: approval(),
    });
    await assert.rejects(
      () => provider.execute({ ...request("strategy"), dataClassification: "restricted" }),
      (error: unknown) => error instanceof Error && error.name === "marketing_text_restricted_data_not_externalizable",
    );
    await assert.rejects(
      () => provider.execute({ ...request("strategy"), input: { runInput: { apiKey: "never-send" } } }),
      (error: unknown) => error instanceof Error && error.name === "marketing_text_sensitive_field_blocked",
    );
    await assert.rejects(
      () => provider.execute({ ...request("strategy"), input: { runInput: { publicBrief: "Contact reader@example.com" } } }),
      (error: unknown) => error instanceof Error && error.name === "marketing_text_sensitive_value_blocked",
    );
    await assert.rejects(
      () => provider.execute({ ...request("strategy"), input: { runInput: { publicBrief: "Call 13800138000" } } }),
      (error: unknown) => error instanceof Error && error.name === "marketing_text_sensitive_value_blocked",
    );
    await assert.rejects(
      () => provider.execute({ ...request("strategy"), input: { runInput: { publicBrief: "Identity 11010519491231002X" } } }),
      (error: unknown) => error instanceof Error && error.name === "marketing_text_sensitive_value_blocked",
    );
    assert.equal(calls.length, 0);
  });

  it("rejects malformed model JSON rather than inferring a content result", async () => {
    const provider = new MarketingTextAgentProvider({
      gateway: fakeGateway("not-json"), modelCode: "marketing-text-model", stage: "strategy", approval: approval(),
    });
    await assert.rejects(
      () => provider.execute(request("strategy")),
      (error: unknown) => error instanceof Error && error.name === "marketing_text_invalid_json_response",
    );
  });
});

function request(stage: "strategy" | "copy" | "compliance"): MarketingAgentStageRequest {
  return {
    runId: "run-1",
    campaignId: "campaign-1",
    createdByAdminId: "00000000-0000-4000-8000-000000000001",
    stage,
    dataClassification: "internal",
    input: { runInput: { publicBrief: "Approved summary" } },
    systemRules: ["System rule"],
  };
}

function approval() {
  return {
    approved: true as const,
    approvalReference: "MKT-APP-1",
    dataClassifications: ["public", "internal"] as const,
    allowedInputPaths: ["runInput.publicBrief"] as const,
  };
}

function fakeGateway(response: string, calls: unknown[][] = []) {
  return {
    chat: {
      completions: {
        async create(...args: unknown[]) {
          calls.push(args);
          return {
            stream: (async function* () {
              yield { choices: [{ delta: { content: response } }] };
            })(),
            abort() {},
            completed: Promise.resolve({
              status: "succeeded" as const,
              usage: { prompt_tokens: 12, completion_tokens: 8 },
              usageSource: "provider" as const,
            }),
          };
        },
      },
    },
  } as never;
}

async function seedAdmin(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  const adminId = randomUUID();
  await db.query(
    "INSERT INTO admin_accounts (id, login_name, password_hash, display_name, status, super_admin_slot) VALUES ($1, $2, 'plain:password', 'Marketing Admin', 'active', 1)",
    [adminId, `marketing_text_provider_${adminId.slice(0, 8)}`],
  );
  return adminId;
}

async function insertApprovedModelAdmission(db: Awaited<ReturnType<typeof createMigratedTestDb>>, adminId: string, modelCode: string) {
  await db.query(
    `INSERT INTO marketing_component_admissions (
       id, component_type, component_name, component_version, approval_reference,
       license_summary, commercial_use_terms, data_processing_location, security_summary,
       upgrade_plan, removal_plan, owner_admin_id, status, approved_by_admin_id, approved_at
     ) VALUES ($1, 'model', $2, 'v1', 'CMP-APP-1', 'approved-license', 'approved-commercial-use',
               'approved-region', 'approved-security', 'approved-upgrade-plan', 'approved-removal-plan', $3, 'approved', $3, now())`,
    [randomUUID(), modelCode, adminId],
  );
}
