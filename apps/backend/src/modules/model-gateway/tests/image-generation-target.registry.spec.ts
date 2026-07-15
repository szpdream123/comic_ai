import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ImageGenerationTargetError,
  ImageGenerationTargetRegistry,
} from "../image-generation-target.registry.ts";

describe("image generation target registry", () => {
  it("dispatches targets through registered adapters", async () => {
    const registry = new ImageGenerationTargetRegistry<{ userId: string }, string>([
      {
        kind: "team_asset",
        async prepare({ target, context }) {
          return `${context.userId}:${target.assetId}`;
        },
      },
    ]);

    assert.deepEqual(registry.kinds, ["team_asset"]);
    assert.equal(
      await registry.prepare({ kind: "TEAM_ASSET", assetId: "asset-1" }, { userId: "user-1" }),
      "user-1:asset-1",
    );
  });

  it("allows new target kinds without changing registry code", async () => {
    const registry = new ImageGenerationTargetRegistry<null, string>([
      { kind: "future_surface", async prepare() { return "prepared"; } },
    ]);

    assert.equal(await registry.prepare({ kind: "future_surface" }, null), "prepared");
  });

  it("rejects missing and unsupported targets", async () => {
    const registry = new ImageGenerationTargetRegistry<null, string>([]);

    await assert.rejects(
      () => registry.prepare(null, null),
      (error: unknown) => error instanceof ImageGenerationTargetError && error.code === "image_generation_target_required",
    );
    await assert.rejects(
      () => registry.prepare({ kind: "missing" }, null),
      (error: unknown) => error instanceof ImageGenerationTargetError && error.code === "image_generation_target_unsupported",
    );
  });
});
