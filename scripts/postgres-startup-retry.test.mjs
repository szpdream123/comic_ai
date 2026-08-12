import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  connectPostgresClientWithRetry,
  isRetryablePostgresStartupError,
} from "./postgres-startup-retry.mjs";

describe("PostgreSQL startup retry", () => {
  it("retries ECONNABORTED and returns the next connected client", async () => {
    const clients = [
      fakeClient(Object.assign(new Error("connect aborted"), { code: "ECONNABORTED" })),
      fakeClient(null),
    ];
    let attempts = 0;

    const connected = await connectPostgresClientWithRetry({
      connectionString: "postgres://example.invalid/database",
      env: { DATABASE_POOL_CONNECTION_TIMEOUT_MS: "5000" },
      serviceName: "test",
      baseDelayMs: 1,
      createClient() {
        const client = clients[attempts];
        attempts += 1;
        return client;
      },
    });

    assert.equal(connected, clients[1]);
    assert.equal(attempts, 2);
    assert.equal(clients[0].ended, true);
  });

  it("does not retry authentication failures", async () => {
    let attempts = 0;
    await assert.rejects(
      connectPostgresClientWithRetry({
        connectionString: "postgres://example.invalid/database",
        env: { DATABASE_POOL_CONNECTION_TIMEOUT_MS: "5000" },
        serviceName: "test",
        baseDelayMs: 1,
        createClient() {
          attempts += 1;
          return fakeClient(Object.assign(new Error("password authentication failed"), { code: "28P01" }));
        },
      }),
      /test PostgreSQL connection failed for DATABASE_URL: 28P01/,
    );
    assert.equal(attempts, 1);
  });

  it("recognizes transient connection messages without an error code", () => {
    assert.equal(
      isRetryablePostgresStartupError(new Error("Connection terminated due to connection timeout")),
      true,
    );
    assert.equal(isRetryablePostgresStartupError(new Error("database does not exist")), false);
  });
});

function fakeClient(connectError) {
  return {
    ended: false,
    async connect() {
      if (connectError) throw connectError;
    },
    async end() {
      this.ended = true;
    },
  };
}
