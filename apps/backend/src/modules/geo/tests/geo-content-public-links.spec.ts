import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createGeoContentService } from "../geo-content.service.ts";
import type { GeoDocument } from "../geo-types.ts";

const questionId = "31000000-0000-4000-8000-000000000001";
const itemId = "31000000-0000-4000-8000-000000000002";
const versionId = "31000000-0000-4000-8000-000000000003";
const now = new Date("2026-09-09T08:00:00.000Z");
const document: GeoDocument = {
  title: "角色一致性教程",
  summary: "说明怎样保持角色一致性。",
  directAnswer: "固定角色资料和参考素材。",
  blocks: [{ type: "paragraph", text: "先固定角色资料。", evidenceIds: [] }],
  faq: [],
  socialDrafts: { zhihu: "", xiaohongshu: "", bilibili: "", wechat: "" },
  seo: { title: "角色一致性教程 | 灵曦AI", description: "说明怎样保持角色一致性。" },
};

function createPublicContentDb() {
  return {
    async query<T>(sql: string) {
      if (sql.includes("FROM geo_content_evidence_links")) return { rows: [] as T[] };
      const version = {
        id: versionId,
        content_item_id: itemId,
        version_number: 1,
        title: document.title,
        summary: document.summary,
        document_json: document,
        faq_json: document.faq,
        seo_json: document.seo,
        social_drafts_json: document.socialDrafts,
        quality_report_json: { blockers: [], warnings: [], checkedAt: now.toISOString() },
        config_revision_id: "geo-default-v1",
        generation_run_id: null,
        created_by_admin_id: "31000000-0000-4000-8000-000000000004",
        created_at: now,
        published_at: now,
        ...(sql.includes("AS question_ids") ? { question_ids: [questionId] } : {}),
      };
      return {
        rows: [{
          item: {
            id: itemId,
            content_type: "guide",
            topic: "角色一致性",
            slug: "ai-character-consistency",
            status: "published",
            current_draft_version_id: versionId,
            current_published_version_id: versionId,
            redirect_path: null,
            lock_version: 1,
            created_by_admin_id: "31000000-0000-4000-8000-000000000004",
            updated_by_admin_id: "31000000-0000-4000-8000-000000000004",
            created_at: now,
            updated_at: now,
          },
          version,
        }] as T[],
      };
    },
  };
}

describe("GEO public content question metadata", () => {
  it("maps question IDs into both published listings and published article details", async () => {
    const service = createGeoContentService({ db: createPublicContentDb(), now: () => now });

    const listing = await service.listPublished();
    const detail = await service.findPublishedByPath("/guides/ai-character-consistency");

    assert.equal(listing.status, 200);
    assert.equal(detail.status, 200);
    if (!("data" in listing.body) || !("data" in detail.body)) throw new Error("public fixtures missing");
    assert.deepEqual(listing.body.data[0]?.version.questionIds, [questionId]);
    assert.deepEqual(detail.body.data.version.questionIds, [questionId]);
  });
});
