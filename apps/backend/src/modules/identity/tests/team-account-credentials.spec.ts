import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createTeamTemporaryCredential,
  verifyTeamCredential,
} from "../team-account-credentials.service.ts";

describe("team account credentials", () => {
  it("returns a temporary password once and stores only a salted hash", async () => {
    const credential = await createTeamTemporaryCredential();

    assert.match(credential.temporaryPassword, /^[A-Za-z0-9_-]{18,}$/);
    assert.match(credential.passwordHash, /^scrypt:v1:/);
    assert.notEqual(credential.passwordHash, credential.temporaryPassword);
    assert.equal(
      await verifyTeamCredential({
        password: credential.temporaryPassword,
        passwordHash: credential.passwordHash,
      }),
      true,
    );
    assert.equal(
      await verifyTeamCredential({
        password: `${credential.temporaryPassword}x`,
        passwordHash: credential.passwordHash,
      }),
      false,
    );
  });
});
