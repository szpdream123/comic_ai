import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fetchProviderArtifactSafely,
  isSafePublicHttpsUrlLiteral,
} from "../provider-artifact-url-safety.ts";

describe("provider artifact URL safety", () => {
  it("rejects private IPv4, IPv6, and IPv4-mapped IPv6 literals", () => {
    for (const url of [
      "https://127.0.0.1/internal",
      "https://[::1]/internal",
      "https://[::ffff:127.0.0.1]/internal",
      "https://[fc00::1]/internal",
    ]) {
      assert.equal(isSafePublicHttpsUrlLiteral(url), false, url);
    }
    assert.equal(isSafePublicHttpsUrlLiteral("https://cdn.example.test/artifact.png"), true);
  });

  it("validates every redirect destination before issuing the next request", async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      requestedUrls.push(String(url));
      return new Response(null, {
        status: 302,
        headers: { location: "https://127.0.0.1/internal" },
      });
    }) as typeof fetch;

    await assert.rejects(
      () => fetchProviderArtifactSafely("https://cdn.example.test/artifact.png", undefined, fetchImpl),
      /provider_artifact_url_invalid/,
    );
    assert.deepEqual(requestedUrls, ["https://cdn.example.test/artifact.png"]);
  });

  it("normalizes malformed artifact URLs to the provider download failure contract", async () => {
    await assert.rejects(
      () => fetchProviderArtifactSafely("not a URL", undefined, async () => new Response()),
      (error: unknown) => (
        error instanceof Error
        && error.message === "provider_artifact_url_invalid"
        && (error as Error & { failureCode?: string }).failureCode === "provider_output_download_failed"
      ),
    );
  });
});
