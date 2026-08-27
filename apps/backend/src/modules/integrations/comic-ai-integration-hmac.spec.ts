import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  signComicAiIntegrationRequest,
  verifyComicAiIntegrationHmac,
} from "./comic-ai-integration-hmac.ts";

const secret = "comic-ai-integration-test-secret";
const env = {
  COMIC_AI_INTEGRATION_HMAC_KEYS_JSON: JSON.stringify({
    key1: { workerId: "moneyprinter", secret },
  }),
};

test("verifies the MoneyPrinter HMAC request contract", () => {
  const body = Buffer.from(JSON.stringify({
    model: "seedance-i2v-pro",
    prompt: "完整视频文案",
    parameters: { aspectRatio: "9:16", durationSec: 10 },
  }));
  const timestamp = String(Date.now());
  const nonce = randomUUID();
  const signed = signComicAiIntegrationRequest({
    secret,
    method: "POST",
    pathWithQuery: "/api/integrations/moneyprinter/video-generations",
    workerId: "moneyprinter",
    keyId: "key1",
    timestamp,
    nonce,
    body,
  });
  const verified = verifyComicAiIntegrationHmac({
    env,
    method: "POST",
    pathWithQuery: "/api/integrations/moneyprinter/video-generations",
    headers: {
      "x-marketing-version": "v1",
      "x-marketing-worker-id": "moneyprinter",
      "x-marketing-key-id": "key1",
      "x-marketing-timestamp": timestamp,
      "x-marketing-nonce": nonce,
      "x-marketing-content-sha256": signed.bodySha256,
      "x-marketing-signature": signed.signature,
    },
    body,
  });

  assert.equal(verified.workerId, "moneyprinter");
  assert.equal(verified.keyId, "key1");
  assert.equal(verified.nonce, nonce);
});

test("rejects a replayed nonce and a modified body", () => {
  const body = Buffer.from("{}");
  const timestamp = String(Date.now());
  const nonce = randomUUID();
  const signed = signComicAiIntegrationRequest({
    secret,
    method: "POST",
    pathWithQuery: "/api/integrations/moneyprinter/video-generations",
    workerId: "moneyprinter",
    keyId: "key1",
    timestamp,
    nonce,
    body,
  });
  const headers = {
    "x-comic-ai-version": "v1",
    "x-comic-ai-worker-id": "moneyprinter",
    "x-comic-ai-key-id": "key1",
    "x-comic-ai-timestamp": timestamp,
    "x-comic-ai-nonce": nonce,
    "x-comic-ai-content-sha256": signed.bodySha256,
    "x-comic-ai-signature": signed.signature,
  };
  const input = {
    env,
    method: "POST",
    pathWithQuery: "/api/integrations/moneyprinter/video-generations",
    headers,
    body,
  };
  verifyComicAiIntegrationHmac(input);
  assert.throws(
    () => verifyComicAiIntegrationHmac(input),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "comic_ai_hmac_nonce_replayed",
  );
  assert.throws(
    () => verifyComicAiIntegrationHmac({ ...input, body: Buffer.from("{\"changed\":true}") }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "comic_ai_hmac_body_hash_invalid",
  );
});
