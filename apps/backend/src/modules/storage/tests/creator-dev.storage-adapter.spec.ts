import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CreatorDevStorageAdapter } from "../creator-dev.storage-adapter.ts";

describe("creator dev storage adapter", () => {
  it("creates deterministic signed read urls for stored objects", async () => {
    const adapter = new CreatorDevStorageAdapter();
    const expiresAt = new Date("2026-05-18T12:00:00.000Z");

    const result = await adapter.createSignedReadUrl({
      bucket: "creator-dev",
      objectKey: "AIManhuaDrama/20260518/object-file-file.png",
      expiresAt,
    });

    assert.equal(result.expiresAt.toISOString(), expiresAt.toISOString());
    assert.match(
      result.url,
      /^\/uploads\/storage\/creator-dev\/AIManhuaDrama%2F20260518%2Fobject-file-file\.png\?expiresAt=/,
    );
  });
});
