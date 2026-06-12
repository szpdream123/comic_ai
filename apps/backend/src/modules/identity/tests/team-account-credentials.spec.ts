import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createTeamTemporaryCredential,
  createUserPasswordHash,
  defaultPasswordFromPhone,
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

  it("derives phone user initial passwords from the last six phone digits", async () => {
    const passwordHash = await createUserPasswordHash(defaultPasswordFromPhone("+8618571521874"));

    assert.equal(defaultPasswordFromPhone("+8618571521874"), "521874");
    assert.match(passwordHash, /^scrypt:v1:/);
    assert.notEqual(passwordHash, "521874");
    assert.equal(
      await verifyTeamCredential({
        password: "521874",
        passwordHash,
      }),
      true,
    );
    assert.equal(
      await verifyTeamCredential({
        password: "152187",
        passwordHash,
      }),
      false,
    );
  });
});
