import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { operationNames } from "../../../../../../../packages/contracts/domain/operation-names.ts";
import {
  IdempotencyConflictError,
  IdempotencyScopeError,
  InMemoryIdempotencyRecordStore,
  beginOrReplayCommand,
} from "../idempotency.service.ts";

describe("idempotency records", () => {
  it("returns an existing record for the same user operation key and hash", async () => {
    const store = new InMemoryIdempotencyRecordStore();

    const first = await beginOrReplayCommand(store, {
      ...userScope,
      operationName: operationNames.shotImageGenerate,
      idempotencyKey: "client-key-1",
      requestHash: "hash_a",
      responseResourceType: "task",
      responseResourceId: "task_1",
    });
    const replay = await beginOrReplayCommand(store, {
      ...userScope,
      operationName: operationNames.shotImageGenerate,
      idempotencyKey: "client-key-1",
      requestHash: "hash_a",
    });

    assert.equal(first.kind, "created");
    assert.equal(replay.kind, "replayed");
    assert.equal(replay.record.id, first.record.id);
    assert.equal(replay.record.responseResourceId, "task_1");
  });

  it("rejects the same user operation key with a different hash", async () => {
    const store = new InMemoryIdempotencyRecordStore();

    await beginOrReplayCommand(store, {
      ...userScope,
      operationName: operationNames.scriptParse,
      idempotencyKey: "client-key-2",
      requestHash: "hash_a",
    });

    await assert.rejects(
      beginOrReplayCommand(store, {
        ...userScope,
        operationName: operationNames.scriptParse,
        idempotencyKey: "client-key-2",
        requestHash: "hash_b",
      }),
      IdempotencyConflictError,
    );
  });

  it("renews an expired processing record instead of replaying it forever", async () => {
    const store = new InMemoryIdempotencyRecordStore();
    const first = await beginOrReplayCommand(store, {
      ...userScope,
      operationName: operationNames.scriptParse,
      idempotencyKey: "expired-processing-key",
      requestHash: "hash_a",
    });
    first.record.expiresAt = new Date(0);

    const renewed = await beginOrReplayCommand(store, {
      ...userScope,
      operationName: operationNames.scriptParse,
      idempotencyKey: "expired-processing-key",
      requestHash: "hash_b",
    });

    assert.equal(renewed.kind, "created");
    assert.equal(renewed.record.id, first.record.id);
    assert.equal(renewed.record.requestHash, "hash_b");
    assert.equal(renewed.record.status, "processing");
    assert.ok(renewed.record.expiresAt.getTime() > Date.now());
  });

  it("rejects a scope key that does not match its actor", async () => {
    const store = new InMemoryIdempotencyRecordStore();
    await assert.rejects(
      beginOrReplayCommand(store, {
        scopeKey: "user:someone-else",
        userId: userScope.userId,
        operationName: operationNames.projectCreate,
        idempotencyKey: "mismatched-scope",
        requestHash: "hash",
      }),
      IdempotencyScopeError,
    );
  });
});

const userScope = {
  scopeKey: "user:00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000001",
};
