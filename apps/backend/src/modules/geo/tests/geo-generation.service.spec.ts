import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createGeoContentService } from "../geo-content.service.ts";
import { createGeoGenerationService, recoverStaleGeoGenerationRuns, type GeoTextChatGatewayLike } from "../geo-generation.service.ts";
import type { GeoDocument } from "../geo-types.ts";

const actorAdminAccountId = "31000000-0000-4000-8000-000000000001";
const fixedNow = new Date("2026-08-13T09:00:00.000Z");
const generatedDocument: GeoDocument = {
  title: "AI短剧角色一致性操作指南",
  summary: "从角色资料、参考素材和分镜引用三个环节建立可复核的一致性流程。",
  directAnswer: "先确认角色资料，再让每个分镜复用同一份已审核参考素材。",
  blocks: [{ type: "paragraph", text: "灵曦AI支持按角色保存参考素材。", evidenceIds: [] }],
  faq: [{ question: "参考素材何时需要更新？", answer: "角色造型或制作要求发生变化时重新审核。" }],
  socialDrafts: { zhihu: "", xiaohongshu: "", bilibili: "", wechat: "" },
  seo: { title: "AI短剧角色一致性指南 | 灵曦AI", description: "介绍角色资料、参考素材与分镜引用的可复核操作流程。" },
};

describe("GEO generation workflow", () => {
  it("uses selected evidence for two model stages and records a generated draft", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedAdmin(db);
      const contentService = createGeoContentService({ db, now: () => fixedNow });
      const question = await contentService.saveQuestion({ rawQuestion: "AI短剧怎样保持角色一致？", topic: "角色一致性", intent: "tutorial", targetPlatforms: ["deepseek"], priority: 90, productCapabilities: ["角色素材库"], notes: "", actorAdminAccountId });
      const evidence = await contentService.saveEvidence({ type: "product_feature", name: "角色素材管理", factText: "灵曦AI支持按角色保存参考素材。", sourceUrl: "https://www.lingxiyunai.com/assets", reviewStatus: "approved", validUntil: null, publicUseAllowed: true, actorAdminAccountId });
      if (!("data" in question.body) || !("data" in evidence.body)) throw new Error("fixtures failed");

      const calls: Array<Record<string, unknown>> = [];
      const gateway: GeoTextChatGatewayLike = {
        async completeJsonWithUsage(input) {
          calls.push(input);
          const document = calls.length === 1
            ? { ...generatedDocument, blocks: [{ type: "paragraph", text: "灵曦AI支持按角色保存参考素材。", evidenceIds: [evidence.body.data.id] }] }
            : { issues: [] };
          return { content: JSON.stringify(document), usage: { total_tokens: 300 }, providerRequestId: `provider-${calls.length}` };
        },
        async completeJson() { throw new Error("unexpected fallback"); },
      };
      const service = createGeoGenerationService({ db, gateway, contentService, now: () => fixedNow });
      const result = await service.generateDraft({ questionId: question.body.data.id, evidenceIds: [evidence.body.data.id], contentType: "guide", topic: "角色一致性", slug: "generated-character-consistency", modelCode: "writer-model", actorAdminAccountId });
      assert.equal(result.status, 201);
      assert.equal(calls.length, 2);
      assert.match(String(calls[0]?.prompt), /角色素材管理/);
      assert.doesNotMatch(String(calls[0]?.prompt), /created_by_admin_id|attachment_json/);
      assert.equal(calls[0]?.requestKeyPrefix, "geo-writer");
      assert.equal(calls[1]?.requestKeyPrefix, "geo-reviewer");
      const runs = await db.query<{ status: string; provider_request_ids_json: string[]; content_item_id: string | null }>("SELECT status,provider_request_ids_json,content_item_id FROM geo_generation_runs");
      assert.equal(runs.rows[0]?.status, "succeeded");
      assert.deepEqual(runs.rows[0]?.provider_request_ids_json, ["provider-1", "provider-2"]);
      assert.ok(runs.rows[0]?.content_item_id);
    } finally {
      await db.close();
    }
  });

  it("records invalid model output without creating a content version", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedAdmin(db);
      const contentService = createGeoContentService({ db, now: () => fixedNow });
      const question = await contentService.saveQuestion({ rawQuestion: "怎样做AI短剧？", topic: "入门", intent: "tutorial", targetPlatforms: [], priority: 80, productCapabilities: [], notes: "", actorAdminAccountId });
      if (!("data" in question.body)) throw new Error("fixture failed");
      const gateway: GeoTextChatGatewayLike = {
        async completeJsonWithUsage() { return { content: "not-json", usage: null, providerRequestId: "provider-bad" }; },
        async completeJson() { throw new Error("unexpected fallback"); },
      };
      const service = createGeoGenerationService({ db, gateway, contentService, now: () => fixedNow });
      const result = await service.generateDraft({ questionId: question.body.data.id, evidenceIds: [], contentType: "answer", topic: "入门", slug: "invalid-generated-output", modelCode: "writer-model", actorAdminAccountId });
      assert.equal(result.status, 409);
      const versions = await db.query<{ count: string }>("SELECT count(*)::text AS count FROM geo_content_versions");
      const runs = await db.query<{ status: string; error_code: string }>("SELECT status,error_code FROM geo_generation_runs");
      assert.equal(versions.rows[0]?.count, "0");
      assert.equal(runs.rows[0]?.status, "failed");
      assert.equal(runs.rows[0]?.error_code, "generated_document_invalid");
    } finally {
      await db.close();
    }
  });

  it("rejects evidence that is not approved for current public use before calling a model", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedAdmin(db);
      const contentService = createGeoContentService({ db, now: () => fixedNow });
      const question = await contentService.saveQuestion({ rawQuestion: "AI短剧怎样选工具？", topic: "工具选择", intent: "decision", targetPlatforms: [], priority: 70, productCapabilities: [], notes: "", actorAdminAccountId });
      const evidence = await contentService.saveEvidence({ type: "product_feature", name: "待审功能", factText: "尚未审核的产品能力。", sourceUrl: null, reviewStatus: "pending", validUntil: null, publicUseAllowed: false, actorAdminAccountId });
      if (!("data" in question.body) || !("data" in evidence.body)) throw new Error("fixtures failed");
      let callCount = 0;
      const gateway: GeoTextChatGatewayLike = {
        async completeJsonWithUsage() { callCount += 1; throw new Error("must not call model"); },
        async completeJson() { callCount += 1; throw new Error("must not call model"); },
      };
      const service = createGeoGenerationService({ db, gateway, contentService, now: () => fixedNow });
      const result = await service.generateDraft({ questionId: question.body.data.id, evidenceIds: [evidence.body.data.id], contentType: "answer", topic: "工具选择", slug: "unapproved-evidence", modelCode: "writer-model", actorAdminAccountId });
      assert.equal(result.status, 400);
      assert.equal(callCount, 0);
      const runs = await db.query<{ count: string }>("SELECT count(*)::text AS count FROM geo_generation_runs");
      assert.equal(runs.rows[0]?.count, "0");
    } finally {
      await db.close();
    }
  });

  it("recovers abandoned running generation records", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedAdmin(db);
      await db.query(
        `INSERT INTO geo_generation_runs (id,run_type,status,model_code,prompt_template_revision,created_by_admin_id,started_at,heartbeat_at,lease_expires_at,created_at,updated_at)
         VALUES ('31000000-0000-4000-8000-000000000099','generate','running','writer-model','geo-default-v1',$1,$2,$2,$3,$2,$2)`,
        [actorAdminAccountId, new Date("2026-08-13T07:00:00.000Z"), new Date("2026-08-13T07:30:00.000Z")],
      );
      await db.query(
        `INSERT INTO geo_generation_runs (id,run_type,status,model_code,prompt_template_revision,created_by_admin_id,started_at,created_at,updated_at)
         VALUES ('31000000-0000-4000-8000-000000000098','generate','running','legacy-model','geo-default-v1',$1,$2,$2,$2)`,
        [actorAdminAccountId, new Date("2026-08-13T06:00:00.000Z")],
      );
      assert.equal(await recoverStaleGeoGenerationRuns({ db, now: fixedNow }), 2);
      const runs = await db.query<{ status: string; error_code: string }>("SELECT status,error_code FROM geo_generation_runs WHERE id IN ('31000000-0000-4000-8000-000000000098','31000000-0000-4000-8000-000000000099') ORDER BY id");
      assert.deepEqual(runs.rows.map((run) => [run.status, run.error_code]), [["failed", "generation_run_abandoned"], ["failed", "generation_run_abandoned"]]);
    } finally {
      await db.close();
    }
  });

  it("fences an execution whose lease was recovered while the model was running", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedAdmin(db);
      const contentService = createGeoContentService({ db });
      const question = await contentService.saveQuestion({ rawQuestion: "怎样批量生成分镜？", topic: "批量分镜", intent: "tutorial", targetPlatforms: [], priority: 80, productCapabilities: [], notes: "", actorAdminAccountId });
      if (!("data" in question.body)) throw new Error("fixture failed");
      await db.query(
        `INSERT INTO geo_content_items (id,content_type,topic,slug,status,lock_version,created_by_admin_id,updated_by_admin_id,created_at,updated_at)
         VALUES ('31000000-0000-4000-8000-000000000097','guide','原主题','lease-fenced-generation','draft',1,$1,$1,$2,$2)`,
        [actorAdminAccountId, new Date("2026-08-13T05:00:00.000Z")],
      );
      let releaseWriter!: () => void;
      const writerGate = new Promise<void>((resolve) => { releaseWriter = resolve; });
      let calls = 0;
      const gateway: GeoTextChatGatewayLike = {
        async completeJsonWithUsage() {
          calls += 1;
          if (calls === 1) await writerGate;
          return { content: JSON.stringify(calls === 1 ? { ...generatedDocument, blocks: [{ type: "paragraph", text: "先确认分镜目标。", evidenceIds: [] }] } : { issues: [] }), usage: null, providerRequestId: `provider-${calls}` };
        },
        async completeJson() { throw new Error("unexpected fallback"); },
      };
      const service = createGeoGenerationService({ db, gateway, contentService });
      const pending = service.generateDraft({ questionId: question.body.data.id, evidenceIds: [], contentType: "guide", topic: "批量分镜", slug: "lease-fenced-generation", modelCode: "writer-model", actorAdminAccountId });
      await waitForRunningRun(db);
      assert.equal(await recoverStaleGeoGenerationRuns({ db, now: new Date(Date.now() + 3 * 60 * 60 * 1000) }), 1);
      releaseWriter();
      const result = await pending;
      assert.equal(result.status, 409);
      const versions = await db.query<{ count: string }>("SELECT count(*)::text AS count FROM geo_content_versions");
      const runs = await db.query<{ status: string; error_code: string }>("SELECT status,error_code FROM geo_generation_runs");
      assert.equal(versions.rows[0]?.count, "0");
      assert.equal(runs.rows[0]?.status, "failed");
      assert.equal(runs.rows[0]?.error_code, "generation_run_abandoned");
      const existing = await db.query<{ topic: string; updated_at: Date }>("SELECT topic,updated_at FROM geo_content_items WHERE id='31000000-0000-4000-8000-000000000097'");
      assert.equal(existing.rows[0]?.topic, "原主题");
      assert.equal(new Date(existing.rows[0]!.updated_at).toISOString(), "2026-08-13T05:00:00.000Z");
    } finally {
      await db.close();
    }
  });

  it("renews the lease while waiting for a long model call", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedAdmin(db);
      const contentService = createGeoContentService({ db });
      const question = await contentService.saveQuestion({ rawQuestion: "怎样规划分镜？", topic: "分镜规划", intent: "tutorial", targetPlatforms: [], priority: 80, productCapabilities: [], notes: "", actorAdminAccountId });
      if (!("data" in question.body)) throw new Error("fixture failed");
      let releaseWriter!: () => void;
      const writerGate = new Promise<void>((resolve) => { releaseWriter = resolve; });
      let calls = 0;
      const gateway: GeoTextChatGatewayLike = {
        async completeJsonWithUsage() {
          calls += 1;
          if (calls === 1) await writerGate;
          return { content: JSON.stringify(calls === 1 ? { ...generatedDocument, blocks: [{ type: "paragraph", text: "先确认分镜目标。", evidenceIds: [] }] } : { issues: [] }), usage: null, providerRequestId: `provider-${calls}` };
        },
        async completeJson() { throw new Error("unexpected fallback"); },
      };
      const service = createGeoGenerationService({ db, gateway, contentService, leaseDurationMs: 5_000, heartbeatIntervalMs: 20 });
      const pending = service.generateDraft({ questionId: question.body.data.id, evidenceIds: [], contentType: "guide", topic: "分镜规划", slug: "heartbeat-generation", modelCode: "writer-model", actorAdminAccountId });
      await waitForRunningRun(db);
      const initial = await db.query<{ lease_expires_at: Date }>("SELECT lease_expires_at FROM geo_generation_runs WHERE status='running'");
      const initialExpiry = new Date(initial.rows[0]!.lease_expires_at);
      await waitForLeaseExtension(db, initialExpiry);
      assert.equal(await recoverStaleGeoGenerationRuns({ db, now: new Date(initialExpiry.getTime() + 1) }), 0);
      releaseWriter();
      assert.equal((await pending).status, 201);
    } finally {
      await db.close();
    }
  });
});

async function waitForRunningRun(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await db.query<{ count: string }>("SELECT count(*)::text AS count FROM geo_generation_runs WHERE status='running'");
    if (result.rows[0]?.count === "1") return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("generation run did not start");
}

async function waitForLeaseExtension(db: Awaited<ReturnType<typeof createMigratedTestDb>>, initialExpiry: Date) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await db.query<{ lease_expires_at: Date }>("SELECT lease_expires_at FROM geo_generation_runs WHERE status='running'");
    if (result.rows[0] && new Date(result.rows[0].lease_expires_at).getTime() > initialExpiry.getTime()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("generation lease was not renewed");
}

async function seedAdmin(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  await db.query(
    `INSERT INTO admin_accounts (id,login_name,password_hash,display_name,status)
     VALUES ($1,'geo_generation_admin','plain:test-password','GEO Generation Admin','active')`,
    [actorAdminAccountId],
  );
}
