import assert from "node:assert/strict";
import { it } from "node:test";
import { createGeoImageVariantCache, geoImageSources, geoImageWidth, readGeoImageSource } from "../geo-image-variants.ts";

it("limits variant widths and only adds responsive attributes to managed public images", () => {
  for (const value of [null, "", "1", "100000", "NaN", "../640"]) assert.equal(geoImageWidth(value), null);
  assert.equal(geoImageWidth("640"), 640);
  assert.equal(geoImageSources('https://example.com/p.png'), "");
  assert.equal(geoImageSources('/geo-assets/" onload="alert(1)'), "");
  const sources = geoImageSources('/geo-assets/53d25375-773e-4666-a588-62cf0bf5a370');
  assert.match(sources, /srcset="[^\"]+width=640"/);
  assert.doesNotMatch(sources, /\d+w"/);
});

it("rejects oversized sources with or without a declared content length", async () => {
  let cancelled = false;
  const unavailable = new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 503 });
  await assert.rejects(readGeoImageSource(unavailable), /unavailable/);
  assert.equal(cancelled, true);
  await assert.rejects(readGeoImageSource(new Response("small", {headers:{"content-length":"30000000"}})), /too_large/);
  await assert.rejects(readGeoImageSource(new Response(new Uint8Array(21 * 1024 * 1024))), /too_large/);
  assert.equal((await readGeoImageSource(new Response("bytes"))).toString(), "bytes");
});

it("shares generation for duplicate requests, caps concurrency, and retries failed work", async () => {
  const cache = createGeoImageVariantCache();
  let finish!: (value: Buffer) => void, calls = 0;
  const work = () => { calls++; return new Promise<Buffer>((resolve) => { finish = resolve; }); };
  const first = cache("a", work), duplicate = cache("a", work);
  const other = cache("b", async () => { await new Promise((resolve) => setTimeout(resolve, 10)); return Buffer.from("b"); });
  await assert.rejects(cache("c", async () => Buffer.from("c")), /busy/);
  finish(Buffer.from("a"));
  assert.equal((await first).toString(), "a");assert.equal(await duplicate, await first);assert.equal(calls, 1);await other;
  await assert.rejects(cache("failure", async () => { throw Error("failure"); }));
  assert.equal((await cache("failure", async () => Buffer.from("retry"))).toString(), "retry");
});

it("evicts old entries when the byte limit is reached", async () => {
  const cache = createGeoImageVariantCache();let calls = 0;
  const generate = async () => { calls++; return Buffer.alloc(9 * 1024 * 1024); };
  await cache("one", generate);await cache("two", generate);await cache("three", generate);await cache("one", generate);
  assert.equal(calls, 4);
});
