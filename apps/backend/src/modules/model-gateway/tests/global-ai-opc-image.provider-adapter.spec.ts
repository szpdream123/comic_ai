import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildGlobalAiOpcImagePayload,
  GlobalAiOpcImageProviderAdapter,
} from "../global-ai-opc-image.provider-adapter.ts";
import { createProviderAdapterFromModelConfig } from "../provider-adapter.factory.ts";

describe("GlobalAiOpc image provider adapter", () => {
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

  it("submits and polls GlobalAiOpc image tasks until completion", async () => {
    const capturedUrls: string[] = [];
    let capturedCreateBody = "";
    const adapter = new GlobalAiOpcImageProviderAdapter({
      apiKey: "global-ai-opc-key",
      model: "nano-banana-2",
      createTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/banana/images",
      queryTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/result/{taskId}",
      requestFormat: "global_ai_opc_banana_image",
      pollIntervalMs: 1,
      maxPollAttempts: 2,
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

    const result = await adapter.submit({
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
      "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/result/image_global_task_1",
    ]);
    assert.deepEqual(JSON.parse(capturedCreateBody), {
      model: "nano-banana-2",
      prompt: "A neon city key art",
      resolution: "2k",
      size: "9:16",
      image_urls: [],
    });
    assert.equal(result.externalRequestId, "image_global_task_1");
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

  it("fails create responses without a provider task id instead of polling the internal request id", async () => {
    const capturedUrls: string[] = [];
    const adapter = new GlobalAiOpcImageProviderAdapter({
      apiKey: "global-ai-opc-key",
      model: "gpt-image-2",
      createTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/image2/images",
      queryTaskEndpoint: "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/result/{taskId}",
      requestFormat: "global_ai_opc_gpt_image2",
      pollIntervalMs: 1,
      maxPollAttempts: 1,
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

  it("builds the GlobalAiOpc adapter from custom_http configs by apiKeyEnv", async () => {
    let capturedBody = "";
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "custom_http",
        providerModel: "gpt-image-2",
        providerConfig: {
          baseURL: "https://zcbservice.aizfw.cn/kyyReactApiServer",
          endpoint: "/v1/image2/images",
          queryTaskEndpoint: "/v1/result/{taskId}",
          apiKeyEnv: "GLOBAL_AI_OPC_API_KEY",
          requestFormat: "global_ai_opc_gpt_image2",
          pollIntervalMs: 1,
          maxPollAttempts: 1,
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

    const result = await adapter.submit({
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
    assert.equal(result.status, "succeeded");
    assert.equal(result.artifacts?.[0]?.url, "https://cdn.global-ai-opc.example/image-2.png");
  });
});
