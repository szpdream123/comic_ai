import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createGeoContentService } from "../geo-content.service.ts";
import { createGeoGenerationService, type GeoTextChatGatewayLike } from "../geo-generation.service.ts";
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
});

async function seedAdmin(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  await db.query(
    `INSERT INTO admin_accounts (id,login_name,password_hash,display_name,status)
     VALUES ($1,'geo_generation_admin','plain:test-password','GEO Generation Admin','active')`,
    [actorAdminAccountId],
  );
}
