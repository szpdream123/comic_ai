import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCumobImagePayload, CumobImageProviderAdapter } from "../cumob-image.provider-adapter.ts";
import { createProviderAdapterFromModelConfig } from "../provider-adapter.factory.ts";

describe("cumob image provider adapter", () => {
  it("builds the logged Cumob payload with the documented field names", () => {
    assert.deepEqual(
      buildCumobImagePayload({
        providerRequestId: "provider-request-cumob-log",
        providerName: "cumob",
        providerOperation: "shot.image.generate",
        requestKey: "workflow-cumob-log:task-cumob-log",
        payloadRef: "creator://payload-cumob-log",
        payloadHash: "hash-cumob-log",
        redactedPayload: {
          prompt: "A vertical character design sheet",
          parameters: {
            size: "4K",
            aspectRatio: "2:3",
            quality: "auto",
            quickReferences: [{ url: "https://example.com/reference.png" }],
          },
        },
      }, {
        model: "gpt-image-2-pro",
      }),
      {
        model: "gpt-image-2-pro",
        prompt: "A vertical character design sheet",
        size: "4K",
        aspect_ratio: "2:3",
        images: ["https://example.com/reference.png"],
        quality: "auto",
        stream: false,
        async: false,
      },
    );
  });

  it("submits image generation requests using the Cumob documented payload", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody = "";
    const adapter = new CumobImageProviderAdapter({
      apiKey: "cumob-key",
      model: "gpt-image-2-pro",
      endpoint: "https://api.cumob.com/v1/images/generations",
      defaultRequestParams: {
        size: "2K",
        quality: "auto",
      },
      fetchImpl: (async (url, init) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers;
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            id: "task_cumob_image_1",
            created: 1677652288,
            status: "succeeded",
            progress: 100,
            data: [
              {
                revised_prompt: "A cinematic poster",
                url: "https://cdn.cumob.example/image.png",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    });

    const result = await adapter.submit({
      providerRequestId: "provider-request-cumob",
      providerName: "cumob",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-cumob:task-cumob",
      payloadRef: "creator://payload-cumob",
      payloadHash: "hash-cumob",
      redactedPayload: {
        prompt: "A cinematic poster of a futuristic city at dusk",
        parameters: {
          aspectRatio: "3:2",
          quality: "high",
          count: 1,
          quickReferences: [
            { url: "https://example.com/reference-a.png" },
            { previewUrl: "https://example.com/reference-b.png" },
          ],
        },
      },
    });

    assert.equal(capturedUrl, "https://api.cumob.com/v1/images/generations");
    assert.deepEqual(capturedHeaders, {
      authorization: "Bearer cumob-key",
      "content-type": "application/json",
    });
    assert.deepEqual(JSON.parse(capturedBody), {
      model: "gpt-image-2-pro",
      prompt: "A cinematic poster of a futuristic city at dusk",
      size: "2K",
      aspect_ratio: "3:2",
      images: [
        "https://example.com/reference-a.png",
        "https://example.com/reference-b.png",
      ],
      quality: "high",
      n: 1,
      stream: false,
      async: false,
    });
    assert.equal(result.externalRequestId, "task_cumob_image_1");
    assert.equal(result.status, "succeeded");
    assert.deepEqual(result.artifacts, [
      {
        mediaType: "image",
        mimeType: "image/png",
        fileExtension: "png",
        url: "https://cdn.cumob.example/image.png",
      },
    ]);
  });

  it("builds the Cumob image adapter from custom_http model config with the Cumob apiKeyEnv", async () => {
    let capturedBody = "";
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "custom_http",
        providerModel: "gpt-image-2",
        providerConfig: {
          baseURL: "https://api.cumob.com",
          endpoint: "/v1/images/generations",
          apiKeyEnv: "CUMOB_API_KEY",
          defaultRequestParams: {
            stream: false,
            async: false,
          },
        },
      },
      { CUMOB_API_KEY: "cumob-key" },
      (async (_url, init) => {
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            id: "task_cumob_image_2",
            status: "succeeded",
            data: [{ url: "https://cdn.cumob.example/image-2.png" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    );

    const result = await adapter.submit({
      providerRequestId: "provider-request-cumob-config",
      providerName: "cumob",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-cumob-config:task-cumob-config",
      payloadRef: "creator://payload-cumob-config",
      payloadHash: "hash-cumob-config",
      redactedPayload: {
        prompt: "A quiet moonlit city",
        parameters: {
          quality: "2K",
        },
      },
    });

    assert.equal(JSON.parse(capturedBody).size, "2K");
    assert.equal(result.status, "succeeded");
    assert.equal(result.artifacts?.[0]?.url, "https://cdn.cumob.example/image-2.png");
  });

  it("passes optional Cumob image fields and normalizes size values from legacy quality selections", () => {
    assert.deepEqual(
      buildCumobImagePayload({
        providerRequestId: "provider-request-cumob-options",
        providerName: "cumob",
        providerOperation: "shot.image.generate",
        requestKey: "workflow-cumob-options:task-cumob-options",
        payloadRef: "creator://payload-cumob-options",
        payloadHash: "hash-cumob-options",
        redactedPayload: {
          prompt: "A clean product poster",
          parameters: {
            quality: "4k",
            aspectRatio: "1:1",
            negativePrompts: "low quality, blurry",
            style: "natural",
            seed: "12345",
          },
        },
      }, {
        model: "gpt-image-2",
        defaultRequestParams: {
          quality: "auto",
        },
      }),
      {
        model: "gpt-image-2",
        prompt: "A clean product poster",
        size: "4K",
        aspect_ratio: "1:1",
        quality: "auto",
        negative_prompts: "low quality, blurry",
        style: "natural",
        seed: "12345",
        stream: false,
        async: false,
      },
    );
  });

  it("wraps fetch failures with Cumob diagnostics", async () => {
    const cause = Object.assign(new Error("connect ETIMEDOUT api.cumob.com:443"), {
      code: "ETIMEDOUT",
    });
    const adapter = new CumobImageProviderAdapter({
      apiKey: "cumob-key",
      model: "gpt-image-2-pro",
      endpoint: "https://api.cumob.com/v1/images/generations",
      fetchImpl: (async () => {
        throw Object.assign(new TypeError("fetch failed"), { cause });
      }) as typeof fetch,
    });

    await assert.rejects(
      () => adapter.submit({
        providerRequestId: "provider-request-cumob-network",
        providerName: "cumob",
        providerOperation: "shot.image.generate",
        requestKey: "workflow-cumob-network:task-cumob-network",
        payloadRef: "creator://payload-cumob-network",
        payloadHash: "hash-cumob-network",
        redactedPayload: {
          prompt: "A cinematic poster",
          parameters: { size: "2K" },
        },
      }),
      (error: unknown) => {
        assert.equal((error as { failureCode?: string }).failureCode, "cumob_image_network_error");
        assert.deepEqual((error as { providerDiagnostics?: Record<string, unknown> }).providerDiagnostics, {
          endpoint: "https://api.cumob.com/v1/images/generations",
          errorName: "TypeError",
          errorMessage: "fetch failed",
          causeName: "Error",
          causeMessage: "connect ETIMEDOUT api.cumob.com:443",
          causeCode: "ETIMEDOUT",
        });
        return true;
      },
    );
  });

  it("uses the HTTP status code as the Cumob failure code for non-2xx responses", async () => {
    const adapter = new CumobImageProviderAdapter({
      apiKey: "cumob-key",
      model: "gpt-image-2-pro",
      endpoint: "https://api.cumob.com/v1/images/generations",
      fetchImpl: (async () => {
        return new Response(
          JSON.stringify({ error: { message: "invalid api key" } }),
          { status: 401, statusText: "Unauthorized", headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    });

    await assert.rejects(
      () => adapter.submit({
        providerRequestId: "provider-request-cumob-401",
        providerName: "cumob",
        providerOperation: "shot.image.generate",
        requestKey: "workflow-cumob-401:task-cumob-401",
        payloadRef: "creator://payload-cumob-401",
        payloadHash: "hash-cumob-401",
        redactedPayload: {
          prompt: "A cinematic poster",
          parameters: { size: "2K" },
        },
      }),
      (error: unknown) => {
        assert.equal((error as { message?: string }).message, "cumob_image_401");
        assert.equal((error as { failureCode?: string }).failureCode, "cumob_image_401");
        assert.equal(
          (error as { providerDiagnostics?: { httpStatus?: number } }).providerDiagnostics?.httpStatus,
          401,
        );
        return true;
      },
    );
  });
});
