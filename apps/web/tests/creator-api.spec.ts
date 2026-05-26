import assert from "node:assert/strict";
import test from "node:test";

test("deleteShotMedia targets explicit shot media resource when assetVersionId is provided", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => "{}",
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.deleteShotMedia("shot/1", {
    kind: "image",
    assetVersionId: "asset/version-1",
  });

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "/api/creator/shots/shot%2F1/media/asset%2Fversion-1?kind=image",
  );
  assert.equal(calls[0].options.method, "DELETE");
  assert.equal(calls[0].options.credentials, "include");
});
