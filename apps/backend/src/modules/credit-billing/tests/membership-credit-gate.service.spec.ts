import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { queryOne } from "../../shared/db/sql.ts";
import { grantCredits } from "../credit-ledger.service.ts";
import { verifyMembershipAndConsumeCredits } from "../membership-credit-gate.service.ts";

describe("membership credit gate", () => {
  it("reserves and consumes credits from the user wallet", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedMemberWallet(db);
      await grantCredits(db, {
        userId: ids.user,
        amount: 100,
        sourceType: "test_credit_seed",
        sourceId: ids.creditSeed,
        reason: "test credit seed",
        createdByUserId: ids.user,
        now: now(),
      });

      await verifyMembershipAndConsumeCredits(db, {
        userId: ids.user,
        requiredCredits: 20,
        sourceType: "episode_generation_task",
        sourceId: ids.source,
        reason: "script generation",
        allocationKey: "ai_storyboard_preview",
        now: now(),
      });

      const reservation = await queryOne<{
        user_id: string;
        status: string;
      }>(
        db,
        `
          SELECT user_id, status
          FROM credit_reservations
          WHERE source_type = 'episode_generation_task'
            AND source_id = $1
          LIMIT 1
        `,
        [ids.source],
      );

      assert.equal(reservation?.user_id, ids.user);
      assert.equal(reservation?.status, "settled");
    } finally {
      await db.close();
    }
  });
});

const ids = {
  user: "30000000-0000-4000-8000-000000000001",
  membership: "40000000-0000-4000-8000-000000000001",
  creditSeed: "50000000-0000-4000-8000-000000000001",
  source: "60000000-0000-4000-8000-000000000001",
};

function now() {
  return new Date("2026-05-09T10:00:00.000Z");
}

async function seedMemberWallet(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {

  await db.query(
    `
      INSERT INTO users (id, phone_e164, display_name, status, created_at, updated_at)
      VALUES ($1, '13800138001', 'Creator', 'active', $2, $2)
    `,
    [ids.user, now()],
  );
  await db.query(
    `
      INSERT INTO user_memberships (
        id, user_id, membership_tier, purchase_at, expires_at,
        gift_credits, status, created_at, updated_at
      ) VALUES ($1, $2, 'professional', $3, '2027-05-09T10:00:00.000Z', 0, 'active', $3, $3)
    `,
    [ids.membership, ids.user, now()],
  );
}
