import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildGlobalAiOpcImagePayload,
  GlobalAiOpcImageProviderAdapter,
} from "../global-ai-opc-image.provider-adapter.ts";
import { createProviderAdapterFromModelConfig } from "../provider-adapter.factory.ts";

describe("GlobalAiOpc image provider adapter", () => {
  it("ignores requestTimeoutMs and uses the fixed image timeout", async () => {
    const timeoutCalls: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      timeoutCalls.push(Number(delay));
      return originalSetTimeout(handler, delay, ...args);
    }) as typeof setTimeout;
    const adapter = new GlobalAiOpcImageProviderAdapter({
      apiKey: "global-ai-opc-key",
      createTaskEndpoint: "https://provider.example.test/v1/images",
      requestTimeoutMs: 1,
      fetchImpl: (async () => new Response(JSON.stringify({
        id: "global-image-fixed-timeout",
        status: "queued",
      }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch,
    });
    try {
      const result = await adapter.submit({
        providerRequestId: "provider-request-fixed-timeout",
        providerName: "GlobalAiOpc",
        providerOperation: "shot.image.generate",
        requestKey: "workflow-fixed-timeout:task-fixed-timeout",
        payloadRef: "creator://fixed-timeout",
        payloadHash: "fixed-timeout-hash",
        redactedPayload: { prompt: "A fixed-timeout image" },
      });
      assert.equal(result.status, "accepted");
      assert.deepEqual(timeoutCalls, [60 * 60 * 1000]);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  it("builds GPT Image 2 requests with the documented field names", () => {
    assert.deepEqual(
      buildGlobalAiOpcImagePayload({
        providerRequestId: "provider-request-global-gpt-log",
        providerName: "GlobalAiOpc",
        providerOperation: "shot.image.generate",
        requestKey: "workflow-global-gpt-log:task-global-gpt-log",
        payloadRef: "creator://payload-global-gpt-log",
        payloadHash: "hash-global-gpt-log",
        redactedPayload: {
          prompt: "A cinematic comic panel",
          parameters: {
            quality: "high",
            ratio: "9:16",
            resolution: "2k",
            quickReferences: [{ url: "https://example.com/reference.png" }],
          },
        },
      }, {
        model: "gpt-image-2",
        requestFormat: "global_ai_opc_gpt_image2",
      }),
      {
        model: "gpt-image-2",
        prompt: "A cinematic comic panel",
        quality: "high",
        resolution: "2k",
        ratio: "9:16",
        image_urls: ["https://example.com/reference.png"],
      },
    );
  });

  it("prefers GPT Image 2 size over resolution and ratio", () => {
    assert.deepEqual(
      buildGlobalAiOpcImagePayload({
        providerRequestId: "provider-request-global-gpt-size",
        providerName: "GlobalAiOpc",
        providerOperation: "shot.image.generate",
        requestKey: "workflow-global-gpt-size:task-global-gpt-size",
        payloadRef: "creator://payload-global-gpt-size",
        payloadHash: "hash-global-gpt-size",
        redactedPayload: {
          prompt: "A square cover",
          parameters: {
            size: "2048x2048",
            ratio: "16:9",
            resolution: "4k",
          },
        },
      }, {
        model: "gpt-image-2",
      }),
      {
        model: "gpt-image-2",
        prompt: "A square cover",
        quality: "low",
        size: "2048x2048",
        image_urls: [],
      },
    );
  });

  it("maps admin clarity and ratio selections to GPT Image 2 resolution and ratio", () => {
    assert.deepEqual(
      buildGlobalAiOpcImagePayload({
        providerRequestId: "provider-request-global-gpt-clarity",
        providerName: "GlobalAiOpc",
        providerOperation: "shot.image.generate",
        requestKey: "workflow-global-gpt-clarity:task-global-gpt-clarity",
        payloadRef: "creator://payload-global-gpt-clarity",
        payloadHash: "hash-global-gpt-clarity",
        redactedPayload: {
          prompt: "A cinematic comic character sheet",
          parameters: {
            quality: "4k",
            size: "16:9",
          },
        },
      }, {
        model: "gpt-image-2",
        requestFormat: "global_ai_opc_gpt_image2",
      }),
      {
        model: "gpt-image-2",
        prompt: "A cinematic comic character sheet",
        resolution: "4k",
        ratio: "16:9",
        image_urls: [],
      },
    );
  });

  it("builds Nano Banana requests without GPT-only quality and ratio fields", () => {
    assert.deepEqual(
      buildGlobalAiOpcImagePayload({
        providerRequestId: "provider-request-global-banana-log",
        providerName: "GlobalAiOpc",
        providerOperation: "shot.image.generate",
        requestKey: "workflow-global-banana-log:task-global-banana-log",
        payloadRef: "creator://payload-global-banana-log",
        payloadHash: "hash-global-banana-log",
        redactedPayload: {
          prompt: "A bright character key visual",
          parameters: {
            quality: "high",
            resolution: "4k",
            aspectRatio: "16:9",
            referenceImages: [{ previewUrl: "https://example.com/ref-a.png" }],
          },
        },
      }, {
        model: "nano-banana-pro",
        requestFormat: "global_ai_opc_banana_image",
      }),
      {
        model: "nano-banana-pro",
        prompt: "A bright character key visual",
        resolution: "4k",
        size: "16:9",
        image_urls: ["https://example.com/ref-a.png"],
      },
    );
  });

  it("builds Seedream 5.0 requests with the documented Model Center fields", () => {
    assert.deepEqual(
      buildGlobalAiOpcImagePayload({
        providerRequestId: "provider-request-seedream-5",
        providerName: "GlobalAiOpc",
        providerOperation: "shot.image.generate",
        requestKey: "workflow-seedream-5:task-seedream-5",
        payloadRef: "creator://payload-seedream-5",
        payloadHash: "hash-seedream-5",
        redactedPayload: {
          prompt: "A cinematic comic panel",
          parameters: {
            quality: "4k",
            aspectRatio: "16:9",
            size: "3840x2160",
            watermark: true,
            referenceImages: [{ url: "https://example.com/seedream-reference.png" }],
          },
        },
      }, {
        model: "seedream-5.0",
        requestFormat: "global_ai_opc_model_center_seedream_image",
      }),
      {
        model: "seedream-5.0",
        prompt: "A cinematic comic panel",
        reference_images: ["https://example.com/seedream-reference.png"],
        aspect_ratio: "16:9",
        resolution: "4K",
        size: "3840x2160",
        watermark: true,
      },
    );
  });

  it("limits Seedream 5.0 Pro to its documented resolution fields", () => {
    assert.deepEqual(
      buildGlobalAiOpcImagePayload({
        providerRequestId: "provider-request-seedream-5-pro",
        providerName: "GlobalAiOpc",
        providerOperation: "shot.image.generate",
        requestKey: "workflow-seedream-5-pro:task-seedream-5-pro",
        payloadRef: "creator://payload-seedream-5-pro",
        payloadHash: "hash-seedream-5-pro",
        redactedPayload: {
          prompt: "A character key visual",
          parameters: {
            resolution: "4K",
            aspectRatio: "3:4",
            size: "2048x2048",
          },
        },
      }, {
        model: "seedream_5.0Pro",
        requestFormat: "global_ai_opc_model_center_seedream_image",
        defaultRequestParams: { resolution: "2K", watermark: false },
      }),
      {
        model: "seedream_5.0Pro",
        prompt: "A character key visual",
        aspect_ratio: "3:4",
        resolution: "2K",
        watermark: false,
      },
    );
  });

  it("uses the Model Center v2 endpoints for Seedream tasks", async () => {
    const capturedUrls: string[] = [];
    const adapter = new GlobalAiOpcImageProviderAdapter({
      apiKey: "global-ai-opc-key",
      model: "seedream_5.0Pro",
      requestFormat: "global_ai_opc_model_center_seedream_image",
      fetchImpl: (async (url, init) => {
        capturedUrls.push(String(url));
        if (String(init?.method ?? "GET").toUpperCase() === "POST") {
          return new Response(JSON.stringify({ id: "seedream_task_1", status: "queued" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({
          id: "seedream_task_1",
          status: "completed",
          result_url: "https://cdn.global-ai-opc.example/seedream.png",
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });

    const submitted = await adapter.submit({
      providerRequestId: "provider-request-seedream-endpoints",
      providerName: "GlobalAiOpc",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-seedream-endpoints:task-seedream-endpoints",
      payloadRef: "creator://payload-seedream-endpoints",
      payloadHash: "hash-seedream-endpoints",
      redactedPayload: { prompt: "A moonlit city" },
    });
    const polled = await adapter.poll!({ externalRequestId: submitted.externalRequestId });

    assert.deepEqual(capturedUrls, [
      "https://zcbservice.aizfw.cn/kyyReactApiServer/v2/model-center/tasks",
      "https://zcbservice.aizfw.cn/kyyReactApiServer/v2/model-center/tasks/seedream_task_1",
    ]);
    assert.equal(polled.status, "succeeded");
    assert.equal(polled.artifacts?.[0]?.url, "https://cdn.global-ai-opc.example/seedream.png");
  });

  it("submits and polls GlobalAiOpc image tasks until completion", async () => {
    const capturedUrls: string[] = [];
    let capturedCreateBody = "";
    const adapter = new GlobalAiOpcImageProviderAdapter({
      apiKey: "global-ai-opc-key",
      model: "nano-banana-2",
      createTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/banana/images",
      queryTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/result/{taskId}",
      requestFormat: "global_ai_opc_banana_image",
      fetchImpl: (async (url, init) => {
        capturedUrls.push(String(url));
        if (String(init?.method || "GET").toUpperCase() === "POST") {
          capturedCreateBody = String(init?.body ?? "");
          return new Response(
            JSON.stringify({
              id: "image_global_task_1",
              object: "nanobanana",
              status: "queued",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            id: "image_global_task_1",
            object: "image.generation",
            model: "nano-banana-2",
            status: "completed",
            image_url: "https://cdn.global-ai-opc.example/image.png",
            amount: 0.12,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    });

    const submitted = await adapter.submit({
      providerRequestId: "provider-request-global",
      providerName: "GlobalAiOpc",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-global:task-global",
      payloadRef: "creator://payload-global",
      payloadHash: "hash-global",
      redactedPayload: {
        prompt: "A neon city key art",
        parameters: { resolution: "2k", size: "9:16" },
      },
    });

    assert.deepEqual(capturedUrls, [
      "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/banana/images",
    ]);
    assert.deepEqual(JSON.parse(capturedCreateBody), {
      model: "nano-banana-2",
      prompt: "A neon city key art",
      resolution: "2k",
      size: "9:16",
      image_urls: [],
    });
    assert.equal(submitted.externalRequestId, "image_global_task_1");
    assert.equal(submitted.status, "accepted");

    const result = await adapter.poll!({
      externalRequestId: submitted.externalRequestId,
    });

    assert.deepEqual(capturedUrls, [
      "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/banana/images",
      "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/result/image_global_task_1",
    ]);
    assert.equal(result.status, "succeeded");
    assert.equal(result.redactedResponse?.amount, 0.12);
    assert.deepEqual(result.artifacts, [
      {
        mediaType: "image",
        mimeType: "image/png",
        fileExtension: "png",
        url: "https://cdn.global-ai-opc.example/image.png",
      },
    ]);
  });

  it("returns provider error codes from failed poll responses", async () => {
    const cases = [
      { payload: { code: "root_code" }, expected: "root_code" },
      { payload: { error: { code: "nested_error_code" } }, expected: "nested_error_code" },
      { payload: { data: { error_code: "data_error_code" } }, expected: "data_error_code" },
      { payload: { result: { errorCode: "result_error_code" } }, expected: "result_error_code" },
    ];

    for (const testCase of cases) {
      const adapter = new GlobalAiOpcImageProviderAdapter({
        apiKey: "global-ai-opc-key",
        queryTaskEndpoint: "https://provider.example.test/v1/result/{taskId}",
        fetchImpl: (async () => new Response(JSON.stringify({
          status: "failed",
          ...testCase.payload,
        }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch,
      });

      const result = await adapter.poll!({ externalRequestId: "failed-image-task" });

      assert.equal(result.status, "failed");
      assert.equal(result.redactedResponse?.providerErrorCode, testCase.expected);
    }
  });

  it("fails create responses without a provider task id instead of polling the internal request id", async () => {
    const capturedUrls: string[] = [];
    const adapter = new GlobalAiOpcImageProviderAdapter({
      apiKey: "global-ai-opc-key",
      model: "gpt-image-2",
      createTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/image2/images",
      queryTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/result/{taskId}",
      requestFormat: "global_ai_opc_gpt_image2",
      fetchImpl: (async (url, init) => {
        capturedUrls.push(String(url));
        if (String(init?.method || "GET").toUpperCase() === "POST") {
          return new Response(
            JSON.stringify({
              status: "queued",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        throw new Error("unexpected_poll_with_internal_request_id");
      }) as typeof fetch,
    });

    await assert.rejects(
      () => adapter.submit({
        providerRequestId: "provider-request-global-without-id",
        providerName: "GlobalAiOpc",
        providerOperation: "shot.image.generate",
        requestKey: "workflow-global-without-id:task-global-without-id",
        payloadRef: "creator://payload-global-without-id",
        payloadHash: "hash-global-without-id",
        redactedPayload: {
          prompt: "A cinematic comic panel",
          parameters: { quality: "4k", size: "16:9" },
        },
      }),
      (error: unknown) =>
        error instanceof Error &&
        (error as { failureCode?: string }).failureCode === "global_ai_opc_image_invalid_response",
    );
    assert.deepEqual(capturedUrls, [
      "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/image2/images",
    ]);
  });

  it("builds the GlobalAiOpc adapter from its dedicated protocol", async () => {
    let capturedBody = "";
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "global_ai_opc_image",
        providerModel: "gpt-image-2",
        providerConfig: {
          baseURL: "https://zcbservice.aizfw.cn/kyyReactApiServer",
          endpoint: "/v1/image2/images",
          queryTaskEndpoint: "/v1/result/{taskId}",
          apiKeyEnv: "GLOBAL_AI_OPC_API_KEY",
          requestFormat: "global_ai_opc_gpt_image2",
        },
      },
      { GLOBAL_AI_OPC_API_KEY: "global-ai-opc-key" },
      (async (_url, init) => {
        if (String(init?.method || "GET").toUpperCase() === "POST") {
          capturedBody = String(init?.body ?? "");
          return new Response(
            JSON.stringify({ id: "image_global_task_2", status: "queued" }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            id: "image_global_task_2",
            status: "completed",
            image_url: "https://cdn.global-ai-opc.example/image-2.png",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    );

    const submitted = await adapter.submit({
      providerRequestId: "provider-request-global-config",
      providerName: "GlobalAiOpc",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-global-config:task-global-config",
      payloadRef: "creator://payload-global-config",
      payloadHash: "hash-global-config",
      redactedPayload: {
        prompt: "A floating library",
        parameters: { quality: "medium" },
      },
    });

    assert.equal(JSON.parse(capturedBody).quality, "medium");
    assert.equal(submitted.status, "accepted");
    const result = await adapter.poll!({
      externalRequestId: submitted.externalRequestId,
    });
    assert.equal(result.status, "succeeded");
    assert.equal(result.artifacts?.[0]?.url, "https://cdn.global-ai-opc.example/image-2.png");
  });
});
