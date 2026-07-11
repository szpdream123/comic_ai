import assert from "node:assert/strict";
import { test } from "node:test";

import {
  userCompatibilityScope,
  userCompatibilityScopeCandidates,
  userProjectCompatibilityWorkspaceId,
  userProjectCompatibilityWorkspaceIdCandidates,
} from "../user-compatibility-scope.service.ts";

test("user compatibility ids remain deterministic and isolated per user", () => {
  assert.deepEqual(
    userCompatibilityScope("00000000-0000-4000-8000-000000000001"),
    {
      organizationId: "00000000-0000-1000-8000-000000000001",
      workspaceId: "00000000-0000-2000-8000-000000000001",
    },
  );
  assert.equal(
    userProjectCompatibilityWorkspaceId("00000000-0000-4000-8000-000000000001"),
    "00000000-0000-3000-8000-000000000001",
  );
  assert.deepEqual(
    userCompatibilityScope("93000000-0000-4000-8000-000000001050"),
    {
      organizationId: "93000000-0000-1000-8000-000000001050",
      workspaceId: "93000000-0000-2000-8000-000000001050",
    },
  );
});

test("user compatibility scope candidates retain legacy ids for persisted foreign keys", () => {
  assert.deepEqual(
    userCompatibilityScopeCandidates("00000000-0000-4000-8000-000000000001"),
    [
      {
        organizationId: "00000000-0000-1000-8000-000000000001",
        workspaceId: "00000000-0000-2000-8000-000000000001",
      },
      {
        organizationId: "a0000000-0000-4000-8000-000000000001",
        workspaceId: "b0000000-0000-4000-8000-000000000001",
      },
    ],
  );
  assert.deepEqual(
    userProjectCompatibilityWorkspaceIdCandidates("00000000-0000-4000-8000-000000000001"),
    [
      "00000000-0000-3000-8000-000000000001",
      "c0000000-0000-4000-8000-000000000001",
    ],
  );
});

test("user compatibility ids reject malformed user ids", () => {
  assert.throws(() => userCompatibilityScope("not-a-user-id"), /user_id_invalid/);
  assert.throws(
    () => userCompatibilityScope("00000000-0000-1000-8000-000000000001"),
    /user_id_invalid/,
  );
  assert.throws(() => userProjectCompatibilityWorkspaceId(""), /user_id_invalid/);
});

test("user compatibility ids do not collide when user ids differ in the first nibble", () => {
  const firstUserId = "00000000-0000-4000-8000-000000000001";
  const secondUserId = "f0000000-0000-4000-8000-000000000001";

  assert.notDeepEqual(
    userCompatibilityScope(firstUserId),
    userCompatibilityScope(secondUserId),
  );
  assert.notEqual(
    userProjectCompatibilityWorkspaceId(firstUserId),
    userProjectCompatibilityWorkspaceId(secondUserId),
  );
});
