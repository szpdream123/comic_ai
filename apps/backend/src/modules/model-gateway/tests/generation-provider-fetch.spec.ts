import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveGenerationProviderFetch } from "../generation-provider-fetch.ts";
import {
  generationProviderHttpTimeoutMsFor,
  generationTimeoutPolicy,
} from "../generation-timeout.policy.ts";

describe("generation provider fetch", () => {
  it("uses one hour for image and audio models and three hours for video models", () => {
    assert.equal(generationTimeoutPolicy.image, 60 * 60 * 1000);
    assert.equal(generationTimeoutPolicy.audio, 60 * 60 * 1000);
    assert.equal(generationTimeoutPolicy.video, 3 * 60 * 60 * 1000);
  });

  it("wraps injected fetch implementations with the fixed media timeout", async () => {
    const timeoutCalls: number[] = [];
    const capturedSignals: AbortSignal[] = [];
    const originalTimeout = AbortSignal.timeout;
    AbortSignal.timeout = ((delay: number) => {
      timeoutCalls.push(delay);
      return new AbortController().signal;
    }) as typeof AbortSignal.timeout;
    const fetchImpl = (async (_input, init) => {
      assert.ok(init?.signal);
      capturedSignals.push(init.signal);
      return new Response("{}");
    }) as typeof fetch;

    try {
      await resolveGenerationProviderFetch(fetchImpl, "image")("https://provider.example/image");
      await resolveGenerationProviderFetch(fetchImpl, "audio")("https://provider.example/audio");
      await resolveGenerationProviderFetch(fetchImpl, "video")("https://provider.example/video");
      assert.deepEqual(timeoutCalls, [60 * 60 * 1000, 60 * 60 * 1000, 3 * 60 * 60 * 1000]);
      assert.equal(capturedSignals.length, 3);
    } finally {
      AbortSignal.timeout = originalTimeout;
    }
  });

  it("keeps caller cancellation when adding the fixed timeout signal", async () => {
    const caller = new AbortController();
    let capturedSignal: AbortSignal | undefined;
    const fetchImpl = (async (_input, init) => {
      capturedSignal = init?.signal ?? undefined;
      return new Response("{}");
    }) as typeof fetch;
    const providerFetch = resolveGenerationProviderFetch(fetchImpl, "image");

    await providerFetch("https://provider.example/image", { signal: caller.signal });
    assert.ok(capturedSignal);
    assert.equal(capturedSignal.aborted, false);
    caller.abort(new Error("caller_aborted"));
    assert.equal(capturedSignal.aborted, true);
    assert.equal((capturedSignal.reason as Error).message, "caller_aborted");
  });

  it("uses the fixed media deadline for provider HTTP requests and ignores overrides", () => {
    assert.equal(generationProviderHttpTimeoutMsFor("image", {}), generationTimeoutPolicy.image);
    assert.equal(generationProviderHttpTimeoutMsFor("audio", {}), generationTimeoutPolicy.audio);
    assert.equal(generationProviderHttpTimeoutMsFor("video", {}), generationTimeoutPolicy.video);
    assert.equal(generationProviderHttpTimeoutMsFor("image", {
      GENERATION_PROVIDER_HTTP_TIMEOUT_MS: "45000",
      GENERATION_IMAGE_PROVIDER_HTTP_TIMEOUT_MS: "90000",
    }), generationTimeoutPolicy.image);
    assert.equal(generationProviderHttpTimeoutMsFor("video", {
      GENERATION_PROVIDER_HTTP_TIMEOUT_MS: "45000",
      GENERATION_VIDEO_PROVIDER_HTTP_TIMEOUT_MS: "90000",
    }), generationTimeoutPolicy.video);
  });
});
