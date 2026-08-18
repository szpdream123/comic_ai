import assert from "node:assert/strict";
import test from "node:test";

import { ComicMarketingSourceAdapter, SqlComicMarketingSourceReader } from "../adapters/comic-marketing-source.adapter.ts";
import type { SqlDatabase } from "../../shared/db/sql.ts";

test("comic marketing source reader creates a detached project and brand snapshot", async () => {
  const now = new Date("2026-08-15T12:00:00.000Z");
  const db = {
    async query(sql: string) {
      if (sql.includes("FROM projects WHERE")) return { rows: [{
        id: "comic-1", owner_user_id: "user-1", name: "Comic One", aspect_ratio: "9:16", resolution: "1080p",
        project_style_code: "anime", phase: "asset_review", brand_kit_id: "kit-1", updated_at: now,
      }] };
      if (sql.includes("FROM project_source_documents")) return { rows: [{ id: "doc-1", status: "ready", input_text: "Owned story facts", updated_at: now }] };
      if (sql.includes("FROM creator_brand_kits")) return { rows: [{ id: "kit-1", name: "Comic Brand", guidance_text: "Use a factual tone", updated_at: now }] };
      if (sql.includes("FROM creator_brand_kit_assets")) return { rows: [{ id: "asset-1", asset_type: "logo", display_name: "Logo", role: "primary", text_content: null, storage_object_id: "storage-1", metadata_json: {} }] };
      throw new Error("unexpected_query");
    },
  } as unknown as SqlDatabase;
  const manifest = await new ComicMarketingSourceAdapter(new SqlComicMarketingSourceReader(db)).toManifest({ projectId: "comic-1", version: "v1" });
  assert.equal(manifest.namespace, "comic_internal");
  assert.equal(manifest.authorizationStatus, "owned");
  assert.equal((manifest.snapshot.project as Record<string, unknown>).ownerUserId, "user-1");
  assert.equal(((manifest.snapshot.brandProfile as Record<string, unknown>).assets as unknown[]).length, 1);
  assert.equal((manifest.snapshot.sourceDocuments as unknown[]).length, 1);
});
