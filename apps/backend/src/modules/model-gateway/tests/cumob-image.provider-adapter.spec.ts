import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCumobImagePayload, CumobImageProviderAdapter } from "../cumob-image.provider-adapter.ts";
import { createProviderAdapterFromModelConfig } from "../provider-adapter.factory.ts";
import { readProviderRawResponse } from "../provider-response-diagnostics.ts";

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
        async: true,
      },
    );
  });

  it("submits image generation requests using the Cumob documented payload", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody = "";
    let recordedBody: Record<string, unknown> | null = null;
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
            status: "queued",
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
      recordRedactedRequest: async (request) => {
        recordedBody = request;
      },
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
      stream: false,
      async: true,
    });
    assert.deepEqual(recordedBody, JSON.parse(capturedBody));
    assert.equal(result.externalRequestId, "task_cumob_image_1");
    assert.equal(result.status, "accepted");
    assert.equal(result.artifacts, undefined);
  });

  it("builds the Cumob image adapter from its dedicated protocol", async () => {
    let capturedBody = "";
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "cumob_image",
        providerModel: "gpt-image-2",
        providerConfig: {
          baseURL: "https://api.cumob.com",
          endpoint: "/v1/images/generations",
          queryTaskEndpoint: "/v1/status/{taskId}",
          apiKeyEnv: "CUMOB_API_KEY",
          defaultRequestParams: {
            stream: false,
            async: true,
          },
        },
      },
      { CUMOB_API_KEY: "cumob-key" },
      (async (url, init) => {
        if (String(url).endsWith("/v1/status/task_cumob_image_2")) {
          return new Response(
            JSON.stringify({
              id: "task_cumob_image_2",
              status: "succeeded",
              results: [{ url: "https://cdn.cumob.example/image-2.png" }],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            id: "task_cumob_image_2",
            status: "queued",
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
    assert.equal(result.status, "accepted");
    const polled = await adapter.poll?.({ externalRequestId: result.externalRequestId });
    assert.equal(polled?.status, "succeeded");
    assert.equal(polled?.artifacts?.[0]?.url, "https://cdn.cumob.example/image-2.png");
  });

  it("keeps the Cumob task API asynchronous and drops undocumented legacy fields", () => {
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
            count: 2,
            stream: true,
            async: true,
            webhook: "https://example.com/callback",
          },
        },
      }, {
        model: "gpt-image-2",
        defaultRequestParams: {
          quality: "auto",
          stream: true,
          async: true,
          unsupported_default: "must-not-leak",
        },
      }),
      {
        model: "gpt-image-2",
        prompt: "A clean product poster",
        size: "4K",
        aspect_ratio: "1:1",
        quality: "auto",
        stream: false,
        async: true,
      },
    );
  });

  it("polls the documented status endpoint across queued, running, succeeded, and failed states", async () => {
    const responses = [
      { id: "task_cumob_poll", status: "queued", progress: 0 },
      { id: "task_cumob_poll", status: "running", progress: 60 },
      {
        id: "task_cumob_poll",
        status: "succeeded",
        progress: 100,
        results: [
          { url: "https://cdn.cumob.example/polled.png" },
          { b64_json: "cG9sbGVkLWltYWdl" },
        ],
      },
      { id: "task_cumob_poll", status: "failed", failure_reason: "render failed" },
    ];
    const capturedUrls: string[] = [];
    const adapter = new CumobImageProviderAdapter({
      apiKey: "cumob-key",
      queryTaskEndpoint: "https://api.cumob.com/v1/status/{taskId}",
      fetchImpl: (async (url) => {
        capturedUrls.push(String(url));
        return new Response(JSON.stringify(responses.shift()), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });

    assert.equal((await adapter.poll({ externalRequestId: "task_cumob_poll" })).status, "accepted");
    assert.equal((await adapter.poll({ externalRequestId: "task_cumob_poll" })).status, "running");
    const succeeded = await adapter.poll({ externalRequestId: "task_cumob_poll" });
    assert.equal(succeeded.status, "succeeded");
    assert.deepEqual(succeeded.artifacts, [
      {
        mediaType: "image",
        mimeType: "image/png",
        fileExtension: "png",
        url: "https://cdn.cumob.example/polled.png",
      },
      {
        mediaType: "image",
        mimeType: "image/png",
        fileExtension: "png",
        b64Json: "cG9sbGVkLWltYWdl",
      },
    ]);
    const failed = await adapter.poll({ externalRequestId: "task_cumob_poll" });
    assert.equal(failed.status, "failed");
    assert.equal(failed.redactedResponse.providerMessage, "render failed");
    assert.deepEqual(capturedUrls, Array(4).fill("https://api.cumob.com/v1/status/task_cumob_poll"));
  });

  it("reads generated images only from the documented data array", async () => {
    const adapter = new CumobImageProviderAdapter({
      apiKey: "cumob-key",
      model: "gpt-image-2",
      fetchImpl: (async () => new Response(JSON.stringify({
        id: "task_cumob_strict_response",
        status: "succeeded",
        metadata: { reference: { url: "https://example.com/input-reference.png" } },
        data: [{ url: "https://example.com/generated.png" }],
      }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch,
    });

    const result = await adapter.submit({
      providerRequestId: "provider-request-cumob-strict-response",
      providerName: "cumob",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-cumob-strict:task-cumob-strict",
      payloadRef: "creator://payload-cumob-strict",
      payloadHash: "hash-cumob-strict",
      redactedPayload: { prompt: "A product image" },
    });

    assert.deepEqual(result.artifacts?.map((artifact) => artifact.url), ["https://example.com/generated.png"]);
    assert.deepEqual(readProviderRawResponse(result.redactedResponse), {
      id: "task_cumob_strict_response",
      status: "succeeded",
      metadata: { reference: { url: "https://example.com/input-reference.png" } },
      data: [{ url: "https://example.com/generated.png" }],
    });
  });

  it("uses the documented failure_reason when a completed request fails", async () => {
    const adapter = new CumobImageProviderAdapter({
      apiKey: "cumob-key",
      model: "gpt-image-2",
      fetchImpl: (async () => new Response(JSON.stringify({
        id: "task_cumob_failed",
        status: "failed",
        failure_reason: "content policy rejected the prompt",
      }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch,
    });

    await assert.rejects(
      () => adapter.submit({
        providerRequestId: "provider-request-cumob-failed",
        providerName: "cumob",
        providerOperation: "shot.image.generate",
        requestKey: "workflow-cumob-failed:task-cumob-failed",
        payloadRef: "creator://payload-cumob-failed",
        payloadHash: "hash-cumob-failed",
        redactedPayload: { prompt: "A product image" },
      }),
      (error: unknown) => {
        assert.match(String((error as Error).message), /content policy rejected the prompt/);
        assert.equal((error as { failureCode?: string }).failureCode, "cumob_image_failed");
        return true;
      },
    );
  });

  it("treats failure_reason as terminal when Cumob omits status", async () => {
    const adapter = new CumobImageProviderAdapter({
      apiKey: "cumob-key",
      queryTaskEndpoint: "https://api.cumob.com/v1/status/{taskId}",
      fetchImpl: (async () => new Response(JSON.stringify({
        id: "task_cumob_failed_without_status",
        failure_reason: "image_url fetch failed",
      }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch,
    });

    const result = await adapter.poll({ externalRequestId: "task_cumob_failed_without_status" });

    assert.equal(result.status, "failed");
    assert.equal(result.redactedResponse.providerMessage, "image_url fetch failed");
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

  it("ignores requestTimeoutMs and uses the fixed image timeout", async () => {
    const timeoutCalls: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      timeoutCalls.push(Number(delay));
      return originalSetTimeout(handler, delay, ...args);
    }) as typeof setTimeout;
    const adapter = new CumobImageProviderAdapter({
      apiKey: "cumob-key",
      model: "gpt-image-2-pro",
      requestTimeoutMs: 10,
      fetchImpl: (async () => new Response(JSON.stringify({
        id: "task_cumob_fixed_timeout",
        status: "queued",
      }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch,
    });

    try {
      const result = await adapter.submit({
        providerRequestId: "provider-request-cumob-body-timeout",
        providerName: "cumob",
        providerOperation: "shot.image.generate",
        requestKey: "workflow-cumob-body-timeout:task-cumob-body-timeout",
        payloadRef: "creator://payload-cumob-body-timeout",
        payloadHash: "hash-cumob-body-timeout",
        redactedPayload: { prompt: "A cinematic poster" },
      });
      assert.equal(result.status, "accepted");
      assert.deepEqual(timeoutCalls, [60 * 60 * 1000]);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
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

  it("exposes Retry-After for documented HTTP 429 backoff", async () => {
    const adapter = new CumobImageProviderAdapter({
      apiKey: "cumob-key",
      model: "gpt-image-2-pro",
      fetchImpl: (async () => new Response(
        JSON.stringify({ error: { message: "too many requests" } }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": "120",
          },
        },
      )) as typeof fetch,
    });

    await assert.rejects(
      () => adapter.submit({
        providerRequestId: "provider-request-cumob-429",
        providerName: "cumob",
        providerOperation: "shot.image.generate",
        requestKey: "workflow-cumob-429:task-cumob-429",
        payloadRef: "creator://payload-cumob-429",
        payloadHash: "hash-cumob-429",
        redactedPayload: { prompt: "A cinematic poster" },
      }),
      (error: unknown) => {
        assert.equal((error as { failureCode?: string }).failureCode, "cumob_image_429");
        assert.equal((error as { retryAfterMs?: number }).retryAfterMs, 120_000);
        return true;
      },
    );
  });
});
