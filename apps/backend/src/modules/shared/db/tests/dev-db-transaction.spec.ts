import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createPooledDevDatabaseForTests, runWithDatabaseContext } from "../dev-db.ts";

describe("development database transaction lifecycle", { concurrency: false }, () => {
  it("does not release a transaction client twice when terminal queries overlap", async () => {
    let releaseCount = 0;
    const client = {
      async query() {
        await new Promise<void>((resolve) => setImmediate(resolve));
        return { rows: [] };
      },
      release() {
        releaseCount += 1;
        if (releaseCount > 1) throw new Error("double release");
      },
    };
    const db = createPooledDevDatabaseForTests({
      async query() {
        return { rows: [] };
      },
      async connect() {
        return client;
      },
      async end() {},
    });

    await runWithDatabaseContext(async () => {
      await db.query("BEGIN");
      await Promise.all([db.query("COMMIT"), db.query("COMMIT")]);
    });

    assert.equal(releaseCount, 1);
  });
});
