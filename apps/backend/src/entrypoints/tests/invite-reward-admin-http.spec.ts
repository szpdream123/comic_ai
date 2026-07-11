import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";

describe("invite reward admin http", () => {
  it("returns a validation error when invite reward config is invalid", async () => {
    const db = await createMigratedTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const loginName = `invite_reward_admin_${randomUUID().slice(0, 8)}`;
      const password = `Admin-${randomUUID()}-Pwd`;
      await db.query(
        `
          INSERT INTO admin_accounts (
            id,
            login_name,
            password_hash,
            display_name,
            status,
            super_admin_slot
          ) VALUES (
            $1,
            $2,
            'plain:' || $3,
            'Invite Reward Admin',
            'active',
            1
          )
        `,
        [randomUUID(), loginName, password],
      );
      await db.query(
        `
          INSERT INTO admin_account_roles (
            id,
            admin_account_id,
            role_code
          )
          SELECT $1, id, 'super_admin'
          FROM admin_accounts
          WHERE login_name = $2
        `,
        [randomUUID(), loginName],
      );
      const loginResponse = await fetch(`${server.origin}/api/admin/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginName, password }),
      });
      const cookie = loginResponse.headers.get("set-cookie") ?? "";

      assert.equal(loginResponse.status, 200);

      const response = await fetch(`${server.origin}/api/admin/invite-rewards/config`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          newUserGiftCredits: -1,
          inviterGiftCredits: 30,
          rebatePercent: 3,
          rebateWindowDays: 30,
          rebateCreditRate: 100,
        }),
      });
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.equal(body.error.code, "invalid_new_user_gift_credits");
      assert.equal(body.error.message, "new user gift credits must be non-negative");
    } finally {
      await server.close();
    }
  });
});
