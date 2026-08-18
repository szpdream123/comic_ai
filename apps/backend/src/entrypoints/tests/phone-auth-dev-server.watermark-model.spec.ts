import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";

import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

function testDb() {
  return {
    async query() {
      return { rows: [] };
    },
  } as never;
}

it("caches concurrent public watermark model downloads and revalidates with an etag", async () => {
  const modelBytes = Buffer.from(`watermark-model-${randomUUID()}`);
  const modelUrl = `https://models.example.test/${randomUUID()}.onnx`;
  let upstreamRequests = 0;
  const server = createPhoneAuthDevServer({
    db: testDb(),
    env: {
      NODE_ENV: "test",
      WATERMARK_REMOVAL_MODEL_URL: modelUrl,
      WATERMARK_MODEL_PER_IP_PER_MINUTE: "10",
      WATERMARK_MODEL_PER_IP_PER_HOUR: "10",
      WATERMARK_MODEL_CONCURRENT_PER_IP: "4",
    },
    fetchImpl: async () => {
      upstreamRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return new Response(modelBytes, {
        status: 200,
        headers: { "content-length": String(modelBytes.byteLength) },
      });
    },
    repairScheduler: { enabled: false },
  });

  try {
    await server.listen(0);
    const [firstResponse, secondResponse] = await Promise.all([
      fetch(`${server.origin}/api/toolbox/watermark-removal/model`),
      fetch(`${server.origin}/api/toolbox/watermark-removal/model`),
    ]);
    const etag = firstResponse.headers.get("etag");
    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 200);
    assert.deepEqual(Buffer.from(await firstResponse.arrayBuffer()), modelBytes);
    assert.deepEqual(Buffer.from(await secondResponse.arrayBuffer()), modelBytes);
    assert.equal(upstreamRequests, 1);
    assert.ok(etag);

    const revalidatedResponse = await fetch(`${server.origin}/api/toolbox/watermark-removal/model`, {
      headers: { "if-none-match": etag ?? "" },
    });
    assert.equal(revalidatedResponse.status, 304);
    assert.equal(upstreamRequests, 1);
  } finally {
    await server.close();
  }
});

it("rejects an oversized watermark model before buffering it", async () => {
  const modelUrl = `https://models.example.test/${randomUUID()}.onnx`;
  const server = createPhoneAuthDevServer({
    db: testDb(),
    env: {
      NODE_ENV: "test",
      WATERMARK_REMOVAL_MODEL_URL: modelUrl,
      WATERMARK_MODEL_MAX_BYTES: "4",
    },
    fetchImpl: async () => new Response(Buffer.from("oversized"), {
      status: 200,
      headers: { "content-length": "9" },
    }),
    repairScheduler: { enabled: false },
  });

  try {
    await server.listen(0);
    const response = await fetch(`${server.origin}/api/toolbox/watermark-removal/model`);
    assert.equal(response.status, 502);
  } finally {
    await server.close();
  }
});

it("times out a stalled watermark model download and aborts the upstream request", async () => {
  const modelUrl = `https://models.example.test/${randomUUID()}.onnx`;
  let upstreamAborted = false;
  const server = createPhoneAuthDevServer({
    db: testDb(),
    env: {
      NODE_ENV: "test",
      WATERMARK_REMOVAL_MODEL_URL: modelUrl,
      WATERMARK_MODEL_TIMEOUT_MS: "25",
    },
    fetchImpl: async (_url, init) => await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        upstreamAborted = true;
        reject(init.signal?.reason ?? new Error("aborted"));
      }, { once: true });
    }),
    repairScheduler: { enabled: false },
  });

  try {
    await server.listen(0);
    const response = await fetch(`${server.origin}/api/toolbox/watermark-removal/model`, {
      signal: AbortSignal.timeout(2_000),
    });
    assert.equal(response.status, 502);
    assert.equal(upstreamAborted, true);
  } finally {
    await server.close();
  }
});

it("rejects a chunked watermark model that exceeds the streaming byte limit", async () => {
  const modelUrl = `https://models.example.test/${randomUUID()}.onnx`;
  let upstreamRequests = 0;
  const server = createPhoneAuthDevServer({
    db: testDb(),
    env: {
      NODE_ENV: "test",
      WATERMARK_REMOVAL_MODEL_URL: modelUrl,
      WATERMARK_MODEL_MAX_BYTES: "4",
    },
    fetchImpl: async () => {
      upstreamRequests += 1;
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(Buffer.from("123"));
          controller.enqueue(Buffer.from("456"));
          controller.close();
        },
      }), { status: 200 });
    },
    repairScheduler: { enabled: false },
  });

  try {
    await server.listen(0);
    const firstResponse = await fetch(`${server.origin}/api/toolbox/watermark-removal/model`);
    const secondResponse = await fetch(`${server.origin}/api/toolbox/watermark-removal/model`);
    assert.equal(firstResponse.status, 502);
    assert.equal(secondResponse.status, 502);
    assert.equal(upstreamRequests, 2);
  } finally {
    await server.close();
  }
});

it("rejects empty and truncated watermark model downloads", async () => {
  for (const response of [
    new Response(null, { status: 200, headers: { "content-length": "0" } }),
    new Response(Buffer.from("short"), { status: 200, headers: { "content-length": "10" } }),
  ]) {
    const modelUrl = `https://models.example.test/${randomUUID()}.onnx`;
    const server = createPhoneAuthDevServer({
      db: testDb(),
      env: {
        NODE_ENV: "test",
        WATERMARK_REMOVAL_MODEL_URL: modelUrl,
      },
      fetchImpl: async () => response.clone(),
      repairScheduler: { enabled: false },
    });

    try {
      await server.listen(0);
      const modelResponse = await fetch(`${server.origin}/api/toolbox/watermark-removal/model`);
      assert.equal(modelResponse.status, 502);
    } finally {
      await server.close();
    }
  }
});

it("keeps a shared model download alive while another client is still waiting", async () => {
  const modelBytes = Buffer.from(`shared-watermark-model-${randomUUID()}`);
  const modelUrl = `https://models.example.test/${randomUUID()}.onnx`;
  let upstreamRequests = 0;
  let upstreamAborts = 0;
  const server = createPhoneAuthDevServer({
    db: testDb(),
    env: {
      NODE_ENV: "test",
      WATERMARK_REMOVAL_MODEL_URL: modelUrl,
      WATERMARK_MODEL_PER_IP_PER_MINUTE: "10",
      WATERMARK_MODEL_PER_IP_PER_HOUR: "10",
      WATERMARK_MODEL_CONCURRENT_PER_IP: "4",
    },
    fetchImpl: async (_url, init) => {
      upstreamRequests += 1;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 50);
        init?.signal?.addEventListener("abort", () => {
          upstreamAborts += 1;
          clearTimeout(timer);
          reject(init.signal?.reason ?? new Error("aborted"));
        }, { once: true });
      });
      return new Response(modelBytes, {
        status: 200,
        headers: { "content-length": String(modelBytes.byteLength) },
      });
    },
    repairScheduler: { enabled: false },
  });

  try {
    await server.listen(0);
    const firstController = new AbortController();
    const firstRequest = fetch(`${server.origin}/api/toolbox/watermark-removal/model`, {
      signal: firstController.signal,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const secondRequest = fetch(`${server.origin}/api/toolbox/watermark-removal/model`);
    await new Promise((resolve) => setTimeout(resolve, 10));
    firstController.abort();
    await assert.rejects(firstRequest, { name: "AbortError" });

    const secondResponse = await secondRequest;
    assert.equal(secondResponse.status, 200);
    assert.deepEqual(Buffer.from(await secondResponse.arrayBuffer()), modelBytes);
    assert.equal(upstreamRequests, 1);
    assert.equal(upstreamAborts, 0);
  } finally {
    await server.close();
  }
});
