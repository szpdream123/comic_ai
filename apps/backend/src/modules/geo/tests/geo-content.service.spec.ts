import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createGeoContentService } from "../geo-content.service.ts";
import type { GeoDocument } from "../geo-types.ts";

const actorAdminAccountId = "30000000-0000-4000-8000-000000000001";
const fixedNow = new Date("2026-08-13T08:00:00.000Z");
const document: GeoDocument = {
  title: "AI短剧怎样保持角色一致性",
  summary: "通过固定角色资料、参考素材和分镜约束，降低不同镜头中的角色漂移。",
  directAnswer: "先确认角色资料和参考素材，再让每个分镜引用同一份已审核的角色依据。",
  blocks: [{ type: "paragraph", text: "灵曦AI支持按角色保存和复用参考素材。", evidenceIds: [] }],
  faq: [{ question: "什么时候需要重新确认角色？", answer: "角色造型或镜头要求变化时，应重新审核参考素材。" }],
  socialDrafts: { zhihu: "", xiaohongshu: "", bilibili: "", wechat: "" },
  seo: { title: "AI短剧角色一致性方法 | 灵曦AI", description: "介绍AI短剧角色资料、参考素材和分镜约束的实用方法。" },
};

describe("GEO content workflow", () => {
  it("keeps versions immutable through review, publish, new draft, rollback, and archive", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(
        `INSERT INTO admin_accounts (id, login_name, password_hash, display_name, status)
         VALUES ($1, 'geo_admin', 'plain:test-password', 'GEO Admin', 'active')`,
        [actorAdminAccountId],
      );
      const service = createGeoContentService({ db, now: () => fixedNow });
      const question = await service.saveQuestion({
        rawQuestion: "AI短剧怎样保持角色一致？",
        topic: "角色一致性",
        intent: "tutorial",
        targetPlatforms: ["deepseek", "doubao"],
        priority: 90,
        productCapabilities: ["角色素材库"],
        notes: "",
        actorAdminAccountId,
      });
      assert.equal(question.status, 201);
      if (!("data" in question.body)) throw new Error("question not created");

      const evidence = await service.saveEvidence({
        type: "product_feature",
        name: "角色素材管理",
        factText: "灵曦AI支持按角色保存参考素材。",
        sourceUrl: "https://www.lingxiyunai.com/assets",
        reviewStatus: "approved",
        validUntil: null,
        publicUseAllowed: true,
        actorAdminAccountId,
      });
      assert.equal(evidence.status, 201);
      if (!("data" in evidence.body)) throw new Error("evidence not created");

      const supportedDocument: GeoDocument = {
        ...document,
        blocks: [{ type: "paragraph", text: "灵曦AI支持按角色保存参考素材。", evidenceIds: [evidence.body.data.id] }],
      };
      const draft = await service.createDraftFromDocument({
        contentType: "guide",
        topic: "角色一致性",
        slug: "ai-short-drama-character-consistency",
        questionIds: [question.body.data.id],
        evidenceIds: [evidence.body.data.id],
        document: supportedDocument,
        generationRunId: null,
        configRevisionId: "geo-default-v1",
        actorAdminAccountId,
      });
      assert.equal(draft.status, 201);
      if (!("data" in draft.body)) throw new Error("draft not created");
      assert.equal((await service.publish({ contentItemId: draft.body.data.item.id, actorAdminAccountId, reason: "直接发布" })).status, 409);

      const review = await service.submitForReview({
        contentItemId: draft.body.data.item.id,
        expectedLockVersion: draft.body.data.item.lockVersion,
        actorAdminAccountId,
      });
      assert.equal(review.status, 200);
      const published = await service.publish({ contentItemId: draft.body.data.item.id, actorAdminAccountId, reason: "审核通过" });
      assert.equal(published.status, 200);
      const publicV1 = await service.findPublishedByPath("/guides/ai-short-drama-character-consistency");
      assert.equal(publicV1.status, 200);
      if (!("data" in publicV1.body)) throw new Error("published content missing");
      assert.equal(publicV1.body.data.version.versionNumber, 1);

      const successor = await service.createDraftFromDocument({
        contentItemId: draft.body.data.item.id,
        contentType: "guide",
        topic: "角色一致性",
        slug: "ai-short-drama-character-consistency",
        questionIds: [question.body.data.id],
        evidenceIds: [evidence.body.data.id],
        document: { ...supportedDocument, title: "AI短剧角色一致性进阶方法" },
        generationRunId: null,
        configRevisionId: "geo-default-v1",
        actorAdminAccountId,
      });
      assert.equal(successor.status, 201);
      if (!("data" in successor.body)) throw new Error("successor not created");
      assert.equal((await service.findPublishedByPath("/guides/ai-short-drama-character-consistency")).body.data.version.versionNumber, 1);

      assert.equal((await service.submitForReview({ contentItemId: draft.body.data.item.id, expectedLockVersion: successor.body.data.item.lockVersion, actorAdminAccountId })).status, 200);
      assert.equal((await service.publish({ contentItemId: draft.body.data.item.id, actorAdminAccountId, reason: "更新发布" })).status, 200);
      assert.equal((await service.findPublishedByPath("/guides/ai-short-drama-character-consistency")).body.data.version.versionNumber, 2);

      assert.equal((await service.rollback({ contentItemId: draft.body.data.item.id, versionId: draft.body.data.version.id, actorAdminAccountId, reason: "回滚验证" })).status, 200);
      assert.equal((await service.findPublishedByPath("/guides/ai-short-drama-character-consistency")).body.data.version.versionNumber, 1);
      assert.equal((await service.archive({ contentItemId: draft.body.data.item.id, actorAdminAccountId, reason: "归档验证" })).status, 200);

      const audit = await db.query<{ count: string }>("SELECT count(*)::text AS count FROM geo_audit_events WHERE target_id = $1", [draft.body.data.item.id]);
      assert.ok(Number(audit.rows[0]?.count ?? 0) >= 5);
    } finally {
      await db.close();
    }
  });

  it("does not allow a blocked draft into review", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(
        `INSERT INTO admin_accounts (id, login_name, password_hash, display_name, status)
         VALUES ($1, 'geo_block_admin', 'plain:test-password', 'GEO Admin', 'active')`,
        [actorAdminAccountId],
      );
      const service = createGeoContentService({ db, now: () => fixedNow });
      const draft = await service.createDraftFromDocument({
        contentType: "answer", topic: "旧品牌", slug: "legacy-brand-answer", questionIds: [], evidenceIds: [],
        document: { ...document, title: "灵曦剧场是什么" }, generationRunId: null,
        configRevisionId: "geo-default-v1", actorAdminAccountId,
      });
      assert.equal(draft.status, 201);
      if (!("data" in draft.body)) throw new Error("draft not created");
      const review = await service.submitForReview({ contentItemId: draft.body.data.item.id, expectedLockVersion: draft.body.data.item.lockVersion, actorAdminAccountId });
      assert.equal(review.status, 409);
    } finally {
      await db.close();
    }
  });
});
