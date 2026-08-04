import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hydrateCanvasGenerationHistoryArtifactUrls } from "../canvas-generation-history.service.ts";

describe("Canvas generation history artifact URLs", () => {
  it("refreshes stored artifact URLs and signs each storage object once", async () => {
    const signed: string[] = [];
    const result = await hydrateCanvasGenerationHistoryArtifactUrls({
      items: [{ id: "run-1", artifacts: [
        { id: "artifact-1", storage_object_id: "storage-1", url: "expired" },
        { id: "artifact-2", storageObjectId: "storage-1", url: "expired-again" },
        { id: "artifact-3", url: "https://public.test/image.png" },
      ] }],
      nextCursor: null,
    }, async (storageObjectId) => {
      signed.push(storageObjectId);
      return {
        sourceUrl: "https://signed.test/source",
        previewUrl: "https://signed.test/preview",
        downloadUrl: "https://signed.test/download",
        expiresAt: new Date("2026-07-25T12:00:00.000Z"),
      };
    });

    assert.deepEqual(signed, ["storage-1"]);
    assert.equal(result.items[0]?.artifacts[0]?.url, "https://signed.test/source");
    assert.equal(result.items[0]?.artifacts[1]?.thumbnailUrl, "https://signed.test/preview");
    assert.equal(result.items[0]?.artifacts[2]?.url, "https://public.test/image.png");
  });

  it("does not leak stored URLs when a storage object can no longer be authorized", async () => {
    const result = await hydrateCanvasGenerationHistoryArtifactUrls({
      items: [{ id: "run-1", artifacts: [{
        id: "artifact-1",
        storage_object_id: "foreign-storage",
        url: "https://expired.test/private",
        sourceUrl: "https://expired.test/source",
        previewUrl: "https://expired.test/preview",
        thumbnail_url: "https://expired.test/thumb",
      }] }],
    }, async () => { throw new Error("storage_object_not_found"); });

    assert.equal(Object.hasOwn(result.items[0]?.artifacts[0] ?? {}, "url"), false);
    assert.equal(Object.hasOwn(result.items[0]?.artifacts[0] ?? {}, "sourceUrl"), false);
    assert.equal(Object.hasOwn(result.items[0]?.artifacts[0] ?? {}, "previewUrl"), false);
    assert.equal(Object.hasOwn(result.items[0]?.artifacts[0] ?? {}, "thumbnail_url"), false);
  });
});
