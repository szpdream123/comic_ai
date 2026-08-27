import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
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

  it("removes a transaction client when it emits a connection error", async () => {
    const client = new EventEmitter() as EventEmitter & {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
      release: (error?: Error) => void;
    };
    let releaseCount = 0;
    let releaseError: Error | undefined;
    client.query = async () => ({ rows: [] });
    client.release = (error) => {
      releaseCount += 1;
      releaseError = error;
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
      client.emit("error", new Error("connection reset"));
    });

    assert.equal(releaseCount, 1);
    assert.equal(releaseError?.message, "connection reset");
  });
});
