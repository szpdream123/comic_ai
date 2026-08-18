import assert from "node:assert/strict";
import { it } from "node:test";

import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

it("authenticates multipart requests before they consume a buffered upload slot", async () => {
  let releaseQuery!: () => void;
  let markQueryStarted!: () => void;
  let markSecondQueryStarted!: () => void;
  let queryCount = 0;
  const queryStarted = new Promise<void>((resolve) => {
    markQueryStarted = resolve;
  });
  const secondQueryStarted = new Promise<void>((resolve) => {
    markSecondQueryStarted = resolve;
  });
  const queryGate = new Promise<void>((resolve) => {
    releaseQuery = resolve;
  });
  const db = {
    async query() {
      queryCount += 1;
      if (queryCount === 1) {
        markQueryStarted();
        await queryGate;
      } else {
        markSecondQueryStarted();
      }
      return { rows: [] };
    },
  } as never;
  const server = createPhoneAuthDevServer({
    db,
    env: {
      NODE_ENV: "test",
      BUFFERED_MULTIPART_CONCURRENT_REQUESTS: "1",
    },
    repairScheduler: { enabled: false },
  });

  try {
    await server.listen(0);
    const firstRequest = fetch(`${server.origin}/api/creator/uploads`, {
      method: "POST",
      headers: { cookie: "auth_session=test-session" },
    });
    await queryStarted;

    const limitedResponse = await fetch(`${server.origin}/api/creator/uploads`, {
      method: "POST",
      headers: { cookie: "auth_session=test-session" },
    });
    await secondQueryStarted;
    assert.equal(limitedResponse.status, 401);

    releaseQuery();
    assert.equal((await firstRequest).status, 401);
    const releasedResponse = await fetch(`${server.origin}/api/creator/uploads`, {
      method: "POST",
      headers: { cookie: "auth_session=test-session" },
    });
    assert.equal(releasedResponse.status, 401);
  } finally {
    releaseQuery();
    await server.close();
  }
});
