import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { test } from "node:test";

import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

test("retries runtime database initialization without duplicating concurrent attempts", async () => {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  assert.ok(databaseUrl, "DATABASE_URL is required");

  const staticWarmupServer = createPhoneAuthDevServer({
    db: { query: async () => ({ rows: [], rowCount: 0 }) } as never,
    repairScheduler: { enabled: false },
  });
  await staticWarmupServer.listen(0);
  await staticWarmupServer.close();

  let connectionAttempts = 0;
  let closedConnections = 0;
  const unavailableDatabase = createServer((socket) => {
    connectionAttempts += 1;
    socket.once("close", () => {
      closedConnections += 1;
    });
    setTimeout(() => socket.destroy(), 75);
  });
  await new Promise<void>((resolve, reject) => {
    unavailableDatabase.once("error", reject);
    unavailableDatabase.listen(0, "127.0.0.1", resolve);
  });
  const address = unavailableDatabase.address();
  assert.ok(address && typeof address !== "string");

  const unavailableUrl = new URL(databaseUrl);
  unavailableUrl.hostname = "127.0.0.1";
  unavailableUrl.port = String(address.port);
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = unavailableUrl.toString();

  const server = createPhoneAuthDevServer({
    env: {
      ...process.env,
      NODE_ENV: "development",
      DATABASE_URL: unavailableUrl.toString(),
    },
    allowLocalDatabaseUrl: true,
    repairScheduler: { enabled: false },
  });

  try {
    await server.listen(0);
    await waitFor(() => connectionAttempts >= 1);

    const failedResponses = await Promise.all(
      Array.from({ length: 5 }, () => fetch(`${server.origin}/api/auth/session`, {
        headers: { cookie: `auth_session=${randomUUID()}` },
      })),
    );
    assert.deepEqual(failedResponses.map((response) => response.status), [500, 500, 500, 500, 500]);
    assert.equal(connectionAttempts, 3);

    process.env.DATABASE_URL = databaseUrl;
    const recoveredResponse = await fetch(`${server.origin}/api/auth/session`, {
      headers: { cookie: `auth_session=${randomUUID()}` },
    });
    assert.equal(recoveredResponse.status, 401);
  } finally {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    await server.close();
    await new Promise<void>((resolve, reject) => {
      unavailableDatabase.close((error) => error ? reject(error) : resolve());
    });
  }
});

async function waitFor(condition: () => boolean) {
  const deadline = Date.now() + 2_000;
  while (!condition()) {
    if (Date.now() >= deadline) {
      throw new Error("condition_not_met_before_timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
