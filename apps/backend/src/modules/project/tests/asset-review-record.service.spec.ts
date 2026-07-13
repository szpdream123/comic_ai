import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  confirmAssetReviewCandidateRecord,
  listAssetReviewCandidatesForProject,
  replaceAssetReviewCandidatesForProject,
  updateAssetReviewCandidateRecordLabel,
} from "../asset-review-record.service.ts";

describe("asset review record service", { concurrency: false }, () => {
  it("persists project asset review candidates and supports confirm plus rename", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedUserAndProject(db);
      await replaceAssetReviewCandidatesForProject(db, {
        projectId,
        now: new Date("2026-05-18T13:00:00.000Z"),
        candidates: [
          {
            group: "character",
            assetKey: "hero-main",
            label: "Hero",
            required: true,
          },
          {
            group: "scene",
            assetKey: "forest-night",
            label: "Forest",
            required: true,
          },
          {
            group: "prop",
            assetKey: "lantern-01",
            label: "Lantern",
            required: false,
          },
        ],
      });

      await confirmAssetReviewCandidateRecord(db, {
        projectId,
        group: "character",
        assetKey: "hero-main",
        now: new Date("2026-05-18T13:01:00.000Z"),
      });
      await updateAssetReviewCandidateRecordLabel(db, {
        projectId,
        group: "character",
        assetKey: "hero-main",
        label: "Hero Prime",
        now: new Date("2026-05-18T13:02:00.000Z"),
      });

      const stored = await listAssetReviewCandidatesForProject(db, {
        projectId,
      });

      assert.equal(stored.length, 3);
      assert.equal(
        stored.find((candidate) => candidate.assetKey === "hero-main")?.confirmed,
        true,
      );
      assert.equal(
        stored.find((candidate) => candidate.assetKey === "hero-main")?.label,
        "Hero Prime",
      );
      assert.equal(
        stored.find((candidate) => candidate.assetKey === "forest-night")?.confirmed,
        false,
      );
    } finally {
      await db.close();
    }
  });
});

const projectId = "40000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";

async function seedUserAndProject(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ($1, '13800138000', 'active')
    `,
    [userId],
  );


  await db.query(
    `
      INSERT INTO projects (
        id,
        name,
        aspect_ratio,
        resolution,
        phase,
        owner_user_id,
        created_by_user_id
      )
      VALUES ($1, 'Project', '9:16', '1080p', 'asset_review', $2, $2)
    `,
    [projectId,
      userId],
  );
}
