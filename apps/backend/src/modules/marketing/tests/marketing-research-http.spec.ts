import assert from "node:assert/strict";
import test from "node:test";
import { Agent } from "undici";

import { MarketingResearchHttpProvider } from "../infrastructure/marketing-research-http.ts";

const publicLookup = (async () => [{ address: "93.184.216.34", family: 4 }]) as typeof import("node:dns/promises").lookup;

test("marketing research collects only allowlisted HTTPS text and marks it untrusted", async () => {
  const seen: string[] = [];
  const provider = new MarketingResearchHttpProvider(
    ["docs.example.test"],
    (async (request) => {
      seen.push(String(request));
      return new Response("<html><title>Research</title><script>ignore()</script><p>Verified public context</p></html>", {
        headers: { "content-type": "text/html" },
      });
    }) as typeof fetch,
    publicLookup,
    () => new Agent(),
  );
  const documents = await provider.collect({ urls: ["https://docs.example.test/article#ignored"] });
  assert.deepEqual(seen, ["https://docs.example.test/article"]);
  assert.equal(documents[0]?.title, "Research");
  assert.equal(documents[0]?.text, "Research Verified public context");
  assert.equal(documents[0]?.untrusted, true);
});

test("marketing research revalidates redirects and rejects private, non-text, and oversized responses", async () => {
  let calls = 0;
  const provider = new MarketingResearchHttpProvider(
    ["docs.example.test", "cdn.example.test"],
    (async () => {
      calls += 1;
      return calls === 1
        ? new Response(null, { status: 302, headers: { location: "https://cdn.example.test/result" } })
        : new Response("safe text", { headers: { "content-type": "text/plain" } });
    }) as typeof fetch,
    publicLookup,
    () => new Agent(),
  );
  const redirected = await provider.collect({ urls: ["https://docs.example.test/start"] });
  assert.equal(redirected[0]?.canonicalUrl, "https://cdn.example.test/result");
  await assert.rejects(() => provider.collect({ urls: ["https://127.0.0.1/admin"] }), /marketing_research_ssrf_blocked/);
  const privateDns = new MarketingResearchHttpProvider(["docs.example.test"], (async () => new Response("unexpected")) as typeof fetch,
    (async () => [{ address: "100.64.0.1", family: 4 }]) as typeof import("node:dns/promises").lookup, () => new Agent());
  await assert.rejects(() => privateDns.collect({ urls: ["https://docs.example.test/private"] }), /marketing_research_ssrf_blocked/);
  const binary = new MarketingResearchHttpProvider(["docs.example.test"], (async () => new Response("x", { headers: { "content-type": "image/png" } })) as typeof fetch, publicLookup, () => new Agent());
  await assert.rejects(() => binary.collect({ urls: ["https://docs.example.test/image"] }), /marketing_research_content_type_invalid/);
  const tooLarge = new MarketingResearchHttpProvider(["docs.example.test"], (async () => new Response("x", { headers: { "content-type": "text/plain", "content-length": String(2 * 1024 * 1024 + 1) } })) as typeof fetch, publicLookup, () => new Agent());
  await assert.rejects(() => tooLarge.collect({ urls: ["https://docs.example.test/large"] }), /marketing_research_response_too_large/);
});
