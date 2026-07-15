import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildGenerationProviderPayloadRef } from "../generation-provider-request-identity.ts";

describe("generation provider request identity", () => {
  it("keeps a non-UUID canvas node id as the provider target identity", () => {
    assert.equal(
      buildGenerationProviderPayloadRef({
        targetType: "canvas",
        targetId: "canvas-send-2",
        episodeId: "11be8acc-c3b2-4540-ae5f-ebd3e134e263",
        taskId: "9e9628a7-6ed8-460b-8a6c-7a781efcc389",
        mediaType: "image",
      }),
      "creator://generation/canvas/canvas-send-2/image/9e9628a7-6ed8-460b-8a6c-7a781efcc389",
    );
  });

  it("falls back to the episode and task identities when a target id is absent", () => {
    assert.equal(
      buildGenerationProviderPayloadRef({
        targetType: "episode",
        episodeId: "episode-id",
        taskId: "task-id",
        mediaType: "video",
      }),
      "creator://generation/episode/episode-id/video/task-id",
    );
    assert.equal(
      buildGenerationProviderPayloadRef({
        taskId: "task-id",
        mediaType: "image",
      }),
      "creator://generation/episode/task-id/image/task-id",
    );
  });
});
