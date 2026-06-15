import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createProviderAdapterFromModelConfig } from "../provider-adapter.factory.ts";
import { VolcengineArkImageProviderAdapter } from "../volcengine-ark-image.provider-adapter.ts";

describe("volcengine ark image provider adapter", () => {
  it("submits configured synchronous image generation requests", async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    const adapter = new VolcengineArkImageProviderAdapter({
      apiKey: "ark-key",
      model: "doubao-seedream-5-0-260128",
      createTaskEndpoint: "https://ark.example.com/api/v3/images/generations",
      outputFormat: "png",
      pollIntervalMs: 1,
      fetchImpl: (async (url, init) => {
        calls.push({
          url: String(url),
          method: String(init?.method ?? "GET"),
          body: typeof init?.body === "string" ? init.body : undefined,
        });
        if (init?.method === "POST") {
          assert.deepEqual(init.headers, {
            authorization: "Bearer ark-key",
            "content-type": "application/json",
          });
          return new Response(
            JSON.stringify({
              data: [{ url: "https://cdn.example.com/result.png" }],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        throw new Error("synchronous image generation should not poll");
      }) as typeof fetch,
    });

    const result = await adapter.submit({
      providerRequestId: "provider-request-1",
      providerName: "volcengine",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-1:task-1",
      payloadRef: "creator://payload",
      payloadHash: "hash-1",
      redactedPayload: {
        prompt: "a cinematic comic portrait",
        parameters: {
          aspectRatio: "16:9",
          quality: "2K",
          seed: 42,
        },
      },
    });

    assert.equal(calls[0]?.url, "https://ark.example.com/api/v3/images/generations");
    assert.deepEqual(JSON.parse(calls[0]!.body!), {
      model: "doubao-seedream-5-0-260128",
      prompt: "a cinematic comic portrait",
      size: "2K",
      output_format: "png",
      seed: 42,
      watermark: false,
    });
    assert.equal(result.externalRequestId, "provider-request-1");
    assert.equal(result.status, "succeeded");
    assert.deepEqual(result.artifacts, [
      {
        mediaType: "image",
        mimeType: "image/png",
        fileExtension: "png",
        url: "https://cdn.example.com/result.png",
      },
    ]);
  });

  it("builds the Volcengine image adapter from backend model config", async () => {
    let capturedUrl = "";
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "custom_http",
        providerModel: "doubao-seedream-5-0-260128",
        providerConfig: {
          baseURL: "https://ark.example.com",
          endpoint: "/api/v3/images/generations",
          apiKeyEnv: "VOLCENGINE_ARK_API_KEY",
          requestFormat: "volcengine_ark_images_generation",
          pollIntervalMs: 1,
        },
      },
      { VOLCENGINE_ARK_API_KEY: "ark-key" },
      (async (url, init) => {
        capturedUrl = String(url);
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({
              data: {
                task_id: "ark-image-task-2",
                status: "succeeded",
                image_url: "https://cdn.example.com/direct.png",
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        throw new Error("poll should not be needed when create response has an image");
      }) as typeof fetch,
    );

    const result = await adapter.submit({
      providerRequestId: "provider-request-2",
      providerName: "volcengine",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-2:task-2",
      payloadRef: "creator://payload-2",
      payloadHash: "hash-2",
      redactedPayload: {
        prompt: "a clean product image",
        parameters: { aspectRatio: "1:1", quality: "4K" },
      },
    });

    assert.equal(capturedUrl, "https://ark.example.com/api/v3/images/generations");
    assert.equal(result.externalRequestId, "ark-image-task-2");
    assert.equal(result.artifacts?.[0]?.url, "https://cdn.example.com/direct.png");
  });

  it("omits output_format for Seedream 4 models even when request parameters include it", async () => {
    let capturedBody = "";
    const adapter = new VolcengineArkImageProviderAdapter({
      apiKey: "ark-key",
      model: "doubao-seedream-4-0-250828",
      createTaskEndpoint: "https://ark.example.com/api/v3/images/generations",
      fetchImpl: (async (_url, init) => {
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            data: [{ url: "https://cdn.example.com/seedream-4.jpg" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    });

    await adapter.submit({
      providerRequestId: "provider-request-3",
      providerName: "volcengine",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-3:task-3",
      payloadRef: "creator://payload-3",
      payloadHash: "hash-3",
      redactedPayload: {
        prompt: "a misty battlefield",
        parameters: { aspectRatio: "16:9", quality: "2K", outputFormat: "png" },
      },
    });

    assert.deepEqual(JSON.parse(capturedBody), {
      model: "doubao-seedream-4-0-250828",
      prompt: "a misty battlefield",
      size: "2K",
      watermark: false,
    });
  });

  it("keeps output_format for Seedream 5 models when request parameters include it", async () => {
    let capturedBody = "";
    const adapter = new VolcengineArkImageProviderAdapter({
      apiKey: "ark-key",
      model: "doubao-seedream-5-0-260128",
      createTaskEndpoint: "https://ark.example.com/api/v3/images/generations",
      fetchImpl: (async (_url, init) => {
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            data: [{ url: "https://cdn.example.com/seedream-5.png" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    });

    await adapter.submit({
      providerRequestId: "provider-request-4",
      providerName: "volcengine",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-4:task-4",
      payloadRef: "creator://payload-4",
      payloadHash: "hash-4",
      redactedPayload: {
        prompt: "a polished product image",
        parameters: { aspectRatio: "1:1", quality: "2K", outputFormat: "png" },
      },
    });

    assert.equal(JSON.parse(capturedBody).output_format, "png");
  });

  it("retries without output_format when Volcengine rejects the field for a configured model", async () => {
    const capturedBodies: Array<Record<string, unknown>> = [];
    const adapter = new VolcengineArkImageProviderAdapter({
      apiKey: "ark-key",
      model: "doubao-seedream-5-0-260128",
      createTaskEndpoint: "https://ark.example.com/api/v3/images/generations",
      outputFormat: "png",
      fetchImpl: (async (_url, init) => {
        capturedBodies.push(JSON.parse(String(init?.body ?? "{}")));
        if (capturedBodies.length === 1) {
          return new Response(
            JSON.stringify({
              error: {
                code: "InvalidParameter",
                message: "The parameter `output_format` is not supported by the current model.",
              },
            }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            data: [{ url: "https://cdn.example.com/retry.jpg" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    });

    const result = await adapter.submit({
      providerRequestId: "provider-request-retry",
      providerName: "volcengine",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-retry:task-retry",
      payloadRef: "creator://payload-retry",
      payloadHash: "hash-retry",
      redactedPayload: {
        prompt: "a comic frame",
        parameters: { quality: "2K" },
      },
    });

    assert.equal(capturedBodies.length, 2);
    assert.equal(capturedBodies[0]?.output_format, "png");
    assert.equal(Object.hasOwn(capturedBodies[1] ?? {}, "output_format"), false);
    assert.equal(result.status, "succeeded");
    assert.equal(result.artifacts?.[0]?.url, "https://cdn.example.com/retry.jpg");
  });
});
