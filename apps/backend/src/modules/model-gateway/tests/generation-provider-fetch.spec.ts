import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  imageGenerationProviderTimeoutMs,
  resolveGenerationProviderFetch,
  videoGenerationProviderTimeoutMs,
} from "../generation-provider-fetch.ts";

describe("generation provider fetch", () => {
  it("uses one hour for every image model and three hours for every video model", () => {
    assert.equal(imageGenerationProviderTimeoutMs, 60 * 60 * 1000);
    assert.equal(videoGenerationProviderTimeoutMs, 3 * 60 * 60 * 1000);
  });

  it("preserves injected fetch implementations used by provider tests and diagnostics", () => {
    const fetchImpl = (async () => new Response("{}")) as typeof fetch;

    assert.equal(resolveGenerationProviderFetch(fetchImpl, "image"), fetchImpl);
    assert.equal(resolveGenerationProviderFetch(fetchImpl, "video"), fetchImpl);
  });
});
