import assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, it } from "node:test";

import { OpenAIImagesProviderAdapter } from "../openai-images.provider-adapter.ts";
import {
  createProviderAdapterFromEnv,
  createProviderAdapterFromModelConfig,
} from "../provider-adapter.factory.ts";

describe("openai images provider adapter", () => {
  it("submits image generation requests to the OpenAI images endpoint", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody = "";

    const adapter = new OpenAIImagesProviderAdapter({
      apiKey: "openai-key",
      model: "gpt-image-2",
      fetchImpl: (async (url, init) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers;
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            created: 1716026400,
            data: [{ b64_json: "ZmFrZQ==", revised_prompt: "revised prompt" }],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-request-id": "req_openai_123",
            },
          },
        );
      }) as typeof fetch,
    });

    const result = await adapter.submit({
      providerRequestId: "provider-request-1",
      providerName: "openai-images",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-1:task-1",
      payloadRef: "creator://payload",
      payloadHash: "hash-1",
      redactedPayload: {
        shotId: "shot-1",
        title: "Mechanical city sunrise",
        contentRevision: 3,
      },
    });

    assert.equal(capturedUrl, "https://api.openai.com/v1/images/generations");
    assert.deepEqual(capturedHeaders, {
      authorization: "Bearer openai-key",
      "content-type": "application/json",
    });
    assert.match(capturedBody, /"model":"gpt-image-2"/);
    assert.match(capturedBody, /Mechanical city sunrise/);
    assert.equal(result.externalRequestId, "req_openai_123");
    assert.equal(result.status, "succeeded");
    assert.deepEqual(result.redactedResponse?.outputTypes, ["b64_json"]);
    assert.deepEqual(result.artifacts, [
      {
        mediaType: "image",
        mimeType: "image/png",
        fileExtension: "png",
        b64Json: "ZmFrZQ==",
      },
    ]);
  });

  it("builds the OpenAI images adapter from env", async () => {
    let called = false;

    const adapter = createProviderAdapterFromEnv(
      {
        MODEL_PROVIDER_MODE: "openai_images",
        OPENAI_API_KEY: "openai-key-2",
        OPENAI_IMAGE_MODEL: "gpt-image-2",
      },
      (async () => {
        called = true;
        return new Response(
          JSON.stringify({
            data: [{ b64_json: "ZmFrZQ==" }],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch,
    );

    const result = await adapter.submit({
      providerRequestId: "provider-request-2",
      providerName: "openai-images",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-2:task-2",
      payloadRef: "creator://payload-2",
      payloadHash: "hash-2",
      redactedPayload: {
        prompt: "Vertical comic frame of a neon alley.",
      },
    });

    assert.equal(called, true);
    assert.equal(result.status, "succeeded");
  });

  it("builds the OpenAI images adapter from model config for relay endpoints", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody = "";

    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "openai_images",
        providerModel: "gpt-image-2",
        providerConfig: {
          baseURL: "https://relay.example.com",
          requestPath: "/provider/images",
          endpoint: "/v1/images/generations",
          apiKeyEnv: "GPT_IMAGE2_API_KEY",
          resultFormat: "b64_json",
        },
      },
      {
        GPT_IMAGE2_API_KEY: "relay-key",
      },
      (async (url, init) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers;
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            created: 1716026401,
            data: [{ url: "https://cdn.example.com/generated.png" }],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-request-id": "req_relay_123",
            },
          },
        );
      }) as typeof fetch,
    );

    const result = await adapter.submit({
      providerRequestId: "provider-request-3",
      providerName: "gpt-image-2-cn",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-3:task-3",
      payloadRef: "creator://payload-3",
      payloadHash: "hash-3",
      redactedPayload: {
        prompt: "Vertical comic frame of a floating library.",
      },
    });

    assert.equal(capturedUrl, "https://relay.example.com/provider/images");
    assert.deepEqual(capturedHeaders, {
      authorization: "Bearer relay-key",
      "content-type": "application/json",
    });
    assert.match(capturedBody, /"model":"gpt-image-2"/);
    assert.match(capturedBody, /floating library/);
    assert.match(capturedBody, /"response_format":"b64_json"/);
    assert.equal(result.externalRequestId, "req_relay_123");
    assert.equal(result.status, "succeeded");
    assert.deepEqual(result.redactedResponse?.outputTypes, ["url"]);
    assert.deepEqual(result.artifacts, [
      {
        mediaType: "image",
        mimeType: "image/png",
        fileExtension: "png",
        url: "https://cdn.example.com/generated.png",
      },
    ]);
  });

  it("ignores obsolete per-model timeoutMs in favor of the shared image timeout", async () => {
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "openai_images",
        providerModel: "gpt-image-2",
        providerConfig: {
          baseURL: "https://relay.example.com",
          endpoint: "/v1/images/generations",
          apiKeyEnv: "GPT_IMAGE2_API_KEY",
          timeoutMs: 5,
        },
      },
      {
        GPT_IMAGE2_API_KEY: "relay-key",
      },
      (async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return new Response(
          JSON.stringify({
            created: 1716026401,
            data: [{ url: "https://cdn.example.com/generated.png" }],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-request-id": "req_shared_timeout_123",
            },
          },
        );
      }) as typeof fetch,
    );

    const result = await adapter.submit({
      providerRequestId: "provider-request-config-timeout",
      providerName: "gpt-image-2-cn",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-config-timeout:task-config-timeout",
      payloadRef: "creator://payload-config-timeout",
      payloadHash: "hash-config-timeout",
      redactedPayload: {
        prompt: "Vertical comic frame of a slow relay response.",
      },
    });

    assert.equal(result.status, "succeeded");
  });

  it("submits reference images to the OpenAI image edits endpoint as multipart form data", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody: FormData | null = null;

    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "openai_images",
        providerModel: "gpt-image-2",
        providerConfig: {
          baseURL: "https://relay.example.com",
          endpoint: "/v1/images/generations",
          editEndpoint: "/v1/images/edits",
          apiKeyEnv: "GPT_IMAGE2_API_KEY",
        },
      },
      {
        GPT_IMAGE2_API_KEY: "relay-key",
      },
      (async (url, init) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers;
        capturedBody = init?.body as FormData;
        return new Response(
          JSON.stringify({
            created: 1716026402,
            data: [{ b64_json: "ZmFrZQ==" }],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-request-id": "req_edit_123",
            },
          },
        );
      }) as typeof fetch,
    );

    const result = await adapter.submit({
      providerRequestId: "provider-request-edit",
      providerName: "gpt-image-2-cn",
      providerOperation: "episode.image.generate",
      requestKey: "workflow-edit:task-edit",
      payloadRef: "creator://payload-edit",
      payloadHash: "hash-edit",
      redactedPayload: {
        prompt: "Keep the same character and create a new comic panel.",
        parameters: {
          quickReferences: [
            {
              name: "hero.png",
              mimeType: "image/png",
              b64Json: Buffer.from([137, 80, 78, 71]).toString("base64"),
            },
          ],
          count: 1,
          size: "1024x1024",
          quality: "high",
          moderation: "auto",
        },
      },
    });

    assert.equal(capturedUrl, "https://relay.example.com/v1/images/edits");
    assert.deepEqual(capturedHeaders, {
      authorization: "Bearer relay-key",
    });
    assert.ok(capturedBody instanceof FormData);
    assert.equal(capturedBody.get("model"), "gpt-image-2");
    assert.equal(capturedBody.get("prompt"), "Keep the same character and create a new comic panel.");
    assert.equal(capturedBody.get("n"), "1");
    assert.equal(capturedBody.get("size"), "1024x1024");
    assert.equal(capturedBody.get("quality"), "high");
    assert.equal(capturedBody.get("moderation"), "auto");
    assert.equal(capturedBody.getAll("image[]").length, 1);
    assert.equal(capturedBody.get("image[]") instanceof Blob, true);
    assert.equal(result.externalRequestId, "req_edit_123");
    assert.equal(result.status, "succeeded");
    assert.deepEqual(result.redactedResponse?.outputTypes, ["b64_json"]);
  });

  it("rejects reference image lists above the adapter hard limit before contacting the provider", async () => {
    let providerRequests = 0;
    const adapter = new OpenAIImagesProviderAdapter({
      apiKey: "openai-key",
      fetchImpl: (async () => {
        providerRequests += 1;
        return new Response();
      }) as typeof fetch,
    });

    await assert.rejects(
      () => adapter.submit({
        providerRequestId: "provider-request-reference-limit",
        providerName: "openai-images",
        providerOperation: "episode.image.generate",
        requestKey: "workflow-reference-limit:task-1",
        payloadRef: "creator://payload-reference-limit",
        payloadHash: "hash-reference-limit",
        redactedPayload: {
          prompt: "Use these references.",
          referenceImages: Array.from({ length: 17 }, (_, index) => ({
            b64Json: Buffer.from(`reference-${index}`).toString("base64"),
          })),
        },
      }),
      /image_provider_reference_limit_exceeded/,
    );
    assert.equal(providerRequests, 0);
  });

  it("rejects oversized reference image downloads before contacting the image provider", async () => {
    let providerRequests = 0;
    const adapter = new OpenAIImagesProviderAdapter({
      apiKey: "openai-key",
      fetchImpl: (async () => {
        providerRequests += 1;
        return new Response();
      }) as typeof fetch,
      referenceFetchImpl: (async () => new Response(null, {
        status: 200,
        headers: { "content-length": String(20 * 1024 * 1024 + 1) },
      })) as typeof fetch,
    });

    await assert.rejects(
      () => adapter.submit({
        providerRequestId: "provider-request-oversized-reference",
        providerName: "openai-images",
        providerOperation: "episode.image.generate",
        requestKey: "workflow-oversized-reference:task-1",
        payloadRef: "creator://payload-oversized-reference",
        payloadHash: "hash-oversized-reference",
        redactedPayload: {
          prompt: "Use this reference.",
          referenceImages: [{ url: "https://cdn.example.test/reference.png" }],
        },
      }),
      /image_provider_reference_too_large/,
    );
    assert.equal(providerRequests, 0);
  });

  it("rejects private reference image URLs before issuing a request", async () => {
    let referenceFetchCalls = 0;
    const adapter = new OpenAIImagesProviderAdapter({
      apiKey: "openai-key",
      referenceFetchImpl: (async () => {
        referenceFetchCalls += 1;
        return new Response();
      }) as typeof fetch,
    });

    await assert.rejects(
      () => adapter.submit({
        providerRequestId: "provider-request-private-reference",
        providerName: "openai-images",
        providerOperation: "episode.image.generate",
        requestKey: "workflow-private-reference:task-1",
        payloadRef: "creator://payload-private-reference",
        payloadHash: "hash-private-reference",
        redactedPayload: {
          prompt: "Use this reference.",
          referenceImages: [{ url: "https://127.0.0.1/internal.png" }],
        },
      }),
      /provider_artifact_url_invalid/,
    );
    assert.equal(referenceFetchCalls, 0);
  });

  it("validates reference image redirect destinations before following them", async () => {
    const requestedUrls: string[] = [];
    const adapter = new OpenAIImagesProviderAdapter({
      apiKey: "openai-key",
      referenceFetchImpl: (async (url, init) => {
        requestedUrls.push(String(url));
        assert.equal(init?.redirect, "manual");
        return new Response(null, {
          status: 302,
          headers: { location: "https://127.0.0.1/internal.png" },
        });
      }) as typeof fetch,
    });

    await assert.rejects(
      () => adapter.submit({
        providerRequestId: "provider-request-reference-redirect",
        providerName: "openai-images",
        providerOperation: "episode.image.generate",
        requestKey: "workflow-reference-redirect:task-1",
        payloadRef: "creator://payload-reference-redirect",
        payloadHash: "hash-reference-redirect",
        redactedPayload: {
          prompt: "Use this reference.",
          referenceImages: [{ url: "https://cdn.example.test/reference.png" }],
        },
      }),
      /provider_artifact_url_invalid/,
    );
    assert.deepEqual(requestedUrls, ["https://cdn.example.test/reference.png"]);
  });

  it("normalizes legacy image parameters before submitting reference edits", async () => {
    let capturedBody: FormData | null = null;

    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "openai_images",
        providerModel: "gpt-image-2",
        providerConfig: {
          baseURL: "https://image.shoestravel.xin",
          endpoint: "/v1/images/generations",
          editEndpoint: "https://image.shoestravel.xin/v1/images/edits",
          apiKeyEnv: "GPT_IMAGE2_API_KEY",
        },
      },
      {
        GPT_IMAGE2_API_KEY: "relay-key",
      },
      (async (_url, init) => {
        capturedBody = init?.body as FormData;
        return new Response(
          JSON.stringify({
            data: [{ b64_json: "ZmFrZQ==" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    );

    await adapter.submit({
      providerRequestId: "provider-request-legacy-edit",
      providerName: "gpt-image-2-cn",
      providerOperation: "episode.image.generate",
      requestKey: "workflow-edit:legacy",
      payloadRef: "creator://payload-legacy-edit",
      payloadHash: "hash-legacy-edit",
      redactedPayload: {
        prompt: "Use this reference with legacy UI parameters.",
        parameters: {
          referenceImages: [
            {
              name: "reference.png",
              mimeType: "image/png",
              b64Json: Buffer.from([137, 80, 78, 71]).toString("base64"),
            },
          ],
          count: 1,
          aspectRatio: "9:16",
          quality: "2K",
        },
      },
    });

    assert.ok(capturedBody instanceof FormData);
    assert.equal(capturedBody.get("n"), "1");
    assert.equal(capturedBody.get("size"), "1024x1536");
    assert.equal(capturedBody.get("quality"), "high");
    assert.equal(capturedBody.getAll("image[]").length, 1);
  });

  it("passes explicit image dimensions from aspectRatio through as OpenAI image size", async () => {
    let capturedBody: FormData | null = null;

    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "openai_images",
        providerModel: "gpt-image-2",
        providerConfig: {
          baseURL: "https://image.shoestravel.xin",
          endpoint: "/v1/images/generations",
          editEndpoint: "https://image.shoestravel.xin/v1/images/edits",
          apiKeyEnv: "GPT_IMAGE2_API_KEY",
        },
      },
      {
        GPT_IMAGE2_API_KEY: "relay-key",
      },
      (async (_url, init) => {
        capturedBody = init?.body as FormData;
        return new Response(
          JSON.stringify({
            data: [{ b64_json: "ZmFrZQ==" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    );

    await adapter.submit({
      providerRequestId: "provider-request-explicit-size",
      providerName: "gpt-image-2-cn",
      providerOperation: "episode.image.generate",
      requestKey: "workflow-edit:explicit-size",
      payloadRef: "creator://payload-explicit-size",
      payloadHash: "hash-explicit-size",
      redactedPayload: {
        prompt: "Use this reference with an exact output size.",
        parameters: {
          referenceImages: [
            {
              name: "reference.png",
              mimeType: "image/png",
              b64Json: Buffer.from([137, 80, 78, 71]).toString("base64"),
            },
          ],
          count: 1,
          aspectRatio: "2048x2560",
          quality: "auto",
        },
      },
    });

    assert.ok(capturedBody instanceof FormData);
    assert.equal(capturedBody.get("size"), "2048x2560");
    assert.equal(capturedBody.get("quality"), "auto");
  });

  it("keeps absolute image edit endpoints instead of joining them with baseURL", async () => {
    let capturedUrl = "";

    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "openai_images",
        providerModel: "gpt-image-2",
        providerConfig: {
          baseURL: "https://code.shoestravel.xin",
          endpoint: "/v1/images/generations",
          editEndpoint: "https://image.shoestravel.xin/v1/images/edits",
          apiKeyEnv: "GPT_IMAGE2_API_KEY",
        },
      },
      {
        GPT_IMAGE2_API_KEY: "relay-key",
      },
      (async (url) => {
        capturedUrl = String(url);
        return new Response(
          JSON.stringify({
            data: [{ b64_json: "ZmFrZQ==" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    );

    await adapter.submit({
      providerRequestId: "provider-request-absolute-edit",
      providerName: "gpt-image-2-cn",
      providerOperation: "episode.image.generate",
      requestKey: "workflow-edit:absolute",
      payloadRef: "creator://payload-absolute-edit",
      payloadHash: "hash-absolute-edit",
      redactedPayload: {
        prompt: "Use this reference.",
        parameters: {
          quickReferences: [
            {
              name: "hero.png",
              mimeType: "image/png",
              b64Json: Buffer.from([137, 80, 78, 71]).toString("base64"),
            },
          ],
        },
      },
    });

    assert.equal(capturedUrl, "https://image.shoestravel.xin/v1/images/edits");
  });

  it("ignores requestTimeoutMs and uses the fixed image timeout", async () => {
    const timeoutCalls: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      timeoutCalls.push(Number(delay));
      return originalSetTimeout(handler, delay, ...args);
    }) as typeof setTimeout;
    const adapter = new OpenAIImagesProviderAdapter({
      apiKey: "openai-key",
      model: "gpt-image-2",
      requestTimeoutMs: 10,
      fetchImpl: (async () => new Response(JSON.stringify({
        data: [{ url: "https://cdn.example.test/fixed-timeout.png" }],
      }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch,
    });

    try {
      const result = await adapter.submit({
          providerRequestId: "provider-request-timeout",
          providerName: "openai-images",
          providerOperation: "shot.image.generate",
          requestKey: "workflow-timeout:task-timeout",
          payloadRef: "creator://payload-timeout",
          payloadHash: "hash-timeout",
          redactedPayload: {
            prompt: "Vertical comic frame of a stalled provider request.",
          },
        });
      assert.equal(result.status, "succeeded");
      assert.deepEqual(timeoutCalls, [60 * 60 * 1000]);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  it("reports an explicit empty response error instead of leaking JSON parser errors", async () => {
    const adapter = new OpenAIImagesProviderAdapter({
      apiKey: "openai-key",
      model: "gpt-image-2",
      fetchImpl: (async () =>
        new Response("", {
          status: 200,
          headers: { "content-type": "application/json" },
        })) as typeof fetch,
    });

    await assert.rejects(
      () =>
        adapter.submit({
          providerRequestId: "provider-request-empty-response",
          providerName: "openai-images",
          providerOperation: "shot.image.generate",
          requestKey: "workflow-empty:task-empty",
          payloadRef: "creator://payload-empty",
          payloadHash: "hash-empty",
          redactedPayload: {
            prompt: "Vertical comic frame from an empty relay response.",
          },
        }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /image_provider_empty_response/);
        assert.deepEqual((error as { providerDiagnostics?: unknown }).providerDiagnostics, {
          httpStatus: 200,
          statusText: null,
          contentType: "application/json",
          requestId: null,
          responseBodyLength: 0,
          responseBodyPreview: "",
        });
        return true;
      },
    );
  });

  it("attaches redacted response diagnostics when relay returns HTTP errors", async () => {
    const adapter = new OpenAIImagesProviderAdapter({
      apiKey: "openai-key",
      model: "gpt-image-2",
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            error: {
              message: "upstream overloaded",
              code: "temporarily_unavailable",
            },
          }),
          {
            status: 503,
            statusText: "Service Unavailable",
            headers: {
              "content-type": "application/json",
              "x-request-id": "req_gateway_503",
            },
          },
        )) as typeof fetch,
    });

    await assert.rejects(
      () =>
        adapter.submit({
          providerRequestId: "provider-request-http-error",
          providerName: "openai-images",
          providerOperation: "shot.image.generate",
          requestKey: "workflow-http-error:task-http-error",
          payloadRef: "creator://payload-http-error",
          payloadHash: "hash-http-error",
          redactedPayload: {
            prompt: "Vertical comic frame from a temporarily unavailable relay.",
          },
        }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /image_provider_503/);
        assert.deepEqual((error as { providerDiagnostics?: unknown }).providerDiagnostics, {
          httpStatus: 503,
          statusText: "Service Unavailable",
          contentType: "application/json",
          requestId: "req_gateway_503",
          responseBodyLength: 76,
          responseBodyPreview: '{"error":{"message":"upstream overloaded","code":"temporarily_unavailable"}}',
        });
        return true;
      },
    );
  });

  it("attaches redacted response diagnostics when relay returns unexpected JSON", async () => {
    const adapter = new OpenAIImagesProviderAdapter({
      apiKey: "openai-key",
      model: "gpt-image-2",
      fetchImpl: (async () =>
        new Response(JSON.stringify({ ok: true, output: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })) as typeof fetch,
    });

    await assert.rejects(
      () =>
        adapter.submit({
          providerRequestId: "provider-request-invalid-response",
          providerName: "openai-images",
          providerOperation: "shot.image.generate",
          requestKey: "workflow-invalid:task-invalid",
          payloadRef: "creator://payload-invalid",
          payloadHash: "hash-invalid",
          redactedPayload: {
            prompt: "Vertical comic frame from an unexpected relay response.",
          },
        }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /image_provider_invalid_response/);
        assert.deepEqual((error as { providerDiagnostics?: unknown }).providerDiagnostics, {
          httpStatus: 200,
          statusText: null,
          contentType: "application/json",
          requestId: null,
          responseBodyLength: 23,
          responseBodyPreview: '{"ok":true,"output":[]}',
        });
        return true;
      },
    );
  });

  it("waits for slow relay responses longer than the platform's default fetch header timeout", async () => {
    const server = createServer((request, response) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        setTimeout(() => {
          response.writeHead(200, {
            "content-type": "application/json",
            "x-request-id": "req_slow_relay_123",
          });
          response.end(JSON.stringify({
            created: 1716026403,
            data: [{ b64_json: Buffer.from(`slow:${body}`).toString("base64") }],
          }));
        }, 350);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
      const address = server.address();
      assert.equal(typeof address, "object");
      assert.ok(address);
      const adapter = new OpenAIImagesProviderAdapter({
        apiKey: "openai-key",
        model: "gpt-image-2",
        endpoint: `http://127.0.0.1:${address.port}/v1/images/generations`,
        requestTimeoutMs: 1,
        resultFormat: "b64_json",
      });

      const result = await adapter.submit({
        providerRequestId: "provider-request-slow-relay",
        providerName: "openai-images",
        providerOperation: "shot.image.generate",
        requestKey: "workflow-slow:task-slow",
        payloadRef: "creator://payload-slow",
        payloadHash: "hash-slow",
        redactedPayload: {
          prompt: "Vertical comic frame from a slow relay response.",
        },
      });

      assert.equal(result.externalRequestId, "req_slow_relay_123");
      assert.equal(result.status, "succeeded");
      assert.deepEqual(result.redactedResponse?.outputTypes, ["b64_json"]);
      assert.equal(result.artifacts.length, 1);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it("fails fast when model config references a missing API key env var", () => {
    assert.throws(
      () =>
        createProviderAdapterFromModelConfig(
          {
            providerProtocol: "openai_images",
            providerModel: "gpt-image-2",
            providerConfig: {
              baseURL: "https://relay.example.com",
              endpoint: "/v1/images/generations",
              apiKeyEnv: "GPT_IMAGE2_API_KEY",
            },
          },
          {},
        ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "provider_api_key_missing");
        assert.equal((error as { failureCode?: string }).failureCode, "provider_api_key_missing");
        assert.equal((error as { apiKeyEnv?: string }).apiKeyEnv, "GPT_IMAGE2_API_KEY");
        return true;
      },
    );
  });

  it("accepts a direct API key from model provider config", async () => {
    let capturedHeaders: HeadersInit | undefined;
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "openai_images",
        providerModel: "gpt-image-2",
        providerConfig: {
          baseURL: "https://relay.example.com",
          endpoint: "/v1/images/generations",
          apiKey: "direct-provider-key",
          resultFormat: "b64_json",
        },
      },
      {},
      (async (_url, init) => {
        capturedHeaders = init?.headers;
        return new Response(
          JSON.stringify({
            data: [{ b64_json: "ZmFrZQ==" }],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch,
    );

    const result = await adapter.submit({
      providerRequestId: "provider-request-direct-key",
      providerName: "gpt-image-2-cn",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-direct-key:task-direct-key",
      payloadRef: "creator://payload-direct-key",
      payloadHash: "hash-direct-key",
      redactedPayload: {
        prompt: "Vertical comic frame using a directly configured key.",
      },
    });

    assert.equal((capturedHeaders as Record<string, string>).authorization, "Bearer direct-provider-key");
    assert.equal(result.status, "succeeded");
  });

  it("accepts hyphenated OpenAI image provider protocol aliases", () => {
    assert.doesNotThrow(() => {
      createProviderAdapterFromModelConfig(
        {
          providerProtocol: "openai-images",
          providerModel: "gpt-image-2",
          providerConfig: {
            baseURL: "https://relay.example.com",
            endpoint: "/v1/images/generations",
            apiKeyEnv: "GPT_IMAGE2_API_KEY",
          },
        },
        { GPT_IMAGE2_API_KEY: "relay-key" },
      );
    });
  });
});
