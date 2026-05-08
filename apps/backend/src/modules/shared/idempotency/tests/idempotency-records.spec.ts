import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { operationNames } from "../../../../../../../packages/contracts/domain/operation-names.ts";
import {
  IdempotencyConflictError,
  InMemoryIdempotencyRecordStore,
  beginOrReplayCommand,
} from "../idempotency.service.ts";

describe("idempotency records", () => {
  it("returns an existing record for same org operation key and hash", async () => {
    const store = new InMemoryIdempotencyRecordStore();

    const first = await beginOrReplayCommand(store, {
      organizationId: "org_1",
      operationName: operationNames.shotImageGenerate,
      idempotencyKey: "client-key-1",
      requestHash: "hash_a",
      responseResourceType: "task",
      responseResourceId: "task_1",
    });
    const replay = await beginOrReplayCommand(store, {
      organizationId: "org_1",
      operationName: operationNames.shotImageGenerate,
      idempotencyKey: "client-key-1",
      requestHash: "hash_a",
    });

    assert.equal(first.kind, "created");
    assert.equal(replay.kind, "replayed");
    assert.equal(replay.record.id, first.record.id);
    assert.equal(replay.record.responseResourceId, "task_1");
  });

  it("rejects same org operation key with different hash", async () => {
    const store = new InMemoryIdempotencyRecordStore();

    await beginOrReplayCommand(store, {
      organizationId: "org_1",
      operationName: operationNames.scriptParse,
      idempotencyKey: "client-key-2",
      requestHash: "hash_a",
    });

    await assert.rejects(
      beginOrReplayCommand(store, {
        organizationId: "org_1",
        operationName: operationNames.scriptParse,
        idempotencyKey: "client-key-2",
        requestHash: "hash_b",
      }),
      IdempotencyConflictError,
    );
  });
});
