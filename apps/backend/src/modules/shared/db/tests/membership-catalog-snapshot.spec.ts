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
    assert.match(sql, /code <> 'professional_monthly'/);
    assert.match(sql, /display_metadata_json ->> 'isRecommended' = 'true'/);
    assert.match(sql, /ON CONFLICT \(code\) DO UPDATE SET/g);
    assert.match(sql, /IS DISTINCT FROM/g);
    assert.match(sql, /code = 'basic_quarter'[\s\S]*status <> 'archived'/);
    const configuredPlans = sql.slice(sql.indexOf("WITH configured_plans"), sql.indexOf("INSERT INTO membership_plans"));
    assert.doesNotMatch(configuredPlans, /'basic_quarter'/);
    assert.doesNotMatch(sql, /test_professional|experience_test_cent|invite_new_user_trial_7d/);
  });

  it("applies the snapshot on one schema-aware database client", async () => {
    const script = await readFile(
      resolve(process.cwd(), "scripts/apply-membership-catalog.mjs"),
      "utf8",
    );

    assert.match(script, /const client = await pool\.connect\(\)/);
    assert.match(script, /process\.env\.DATABASE_SCHEMA/);
    assert.match(script, /client\.query\("SELECT set_config\('search_path', \$1, false\)"/);
    assert.match(script, /await client\.query\("BEGIN"\)/);
    assert.match(script, /await client\.query\(sql\)/);
    assert.match(script, /await client\.query\("COMMIT"\)/);
    assert.match(script, /await client\.query\("ROLLBACK"\)/);
    assert.match(script, /client\.release\(\)/);
  });
});
