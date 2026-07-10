import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";

describe("membership catalog snapshot", () => {
  it("persists the configured public membership and direct recharge catalogs", async () => {
    const sql = await readFile(
      resolve(
        process.cwd(),
        "packages/db/catalogs/membership-and-credit-package-catalog.sql",
      ),
      "utf8",
    );

    for (const code of [
      "experience_weekly",
      "basic_monthly",
      "222",
      "basic_quarter",
      "basic_year",
      "professional_monthly",
      "professional_quarter",
      "professional_year",
    ]) {
      assert.match(sql, new RegExp(`'${code.replaceAll(".", "\\.")}'`));
    }

    for (const code of [
      "direct_recharge_9.9",
      "direct_recharge_99.9",
      "direct_recharge_199.9",
      "direct_recharge_399.9",
      "direct_recharge_599.9",
      "direct_recharge_999.9",
    ]) {
      assert.match(sql, new RegExp(`'${code.replaceAll(".", "\\.")}'`));
    }

    assert.match(sql, /"isRecommended":true/);
    assert.match(sql, /"recommendationLabel":"热门"/);
    assert.match(sql, /ON CONFLICT \(code\) DO UPDATE SET/g);
    assert.match(sql, /IS DISTINCT FROM/g);
    assert.doesNotMatch(sql, /test_professional|experience_test_cent|invite_new_user_trial_7d/);
  });
});
