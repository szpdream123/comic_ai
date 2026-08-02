import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ModelError } from "../model-error.ts";
import { createProviderAdapterFromModelConfig } from "../provider-adapter.factory.ts";
import { readProviderRawResponse } from "../provider-response-diagnostics.ts";

describe("BananaRouter provider adapter", () => {
  it("submits gpt-image-2 generation through the dedicated BananaRouter protocol", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody = "";
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "banana_router",
        providerModel: "gpt-image-2",
        providerConfig: {
          baseURL: "https://api.bananarouter.com",
          requestPath: "/v1/images/generations",
          editEndpoint: "/v1/images/edits",
          apiKeyEnv: "BananaRouter_API_KEY",
          requestFormat: "banana_router_openai_images",
          resultFormat: "b64_json",
        },
      },
      { BananaRouter_API_KEY: "banana-key" },
      (async (url, init) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers;
        capturedBody = String(init?.body ?? "");
        return new Response(JSON.stringify({
          created: 1777347817,
          data: [{ b64_json: "ZmFrZQ==", revised_prompt: "revised" }],
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-request-id": "banana-image-request",
          },
        });
      }) as typeof fetch,
    );

    const result = await adapter.submit({
      providerRequestId: "provider-request-image",
      providerName: "BananaRouter",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-image:task-image",
      payloadRef: "creator://banana/image",
      payloadHash: "hash-image",
      redactedPayload: {
        prompt: "A cinematic comic panel",
        parameters: {
          size: "1536x1024",
          quality: "high",
        },
      },
    });

    assert.equal(capturedUrl, "https://api.bananarouter.com/v1/images/generations");
    assert.deepEqual(capturedHeaders, {
      authorization: "Bearer banana-key",
      "content-type": "application/json",
    });
    assert.deepEqual(JSON.parse(capturedBody), {
      model: "gpt-image-2",
      prompt: "A cinematic comic panel",
      size: "1536x1024",
      quality: "high",
      response_format: "b64_json",
    });
    assert.equal(result.externalRequestId, "banana-image-request");
    assert.equal(result.status, "succeeded");
    assert.deepEqual(result.artifacts, [{
      mediaType: "image",
      mimeType: "image/png",
      fileExtension: "png",
      b64Json: "ZmFrZQ==",
    }]);
  });

  it("submits BananaRouter images asynchronously with a stable idempotency key", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody = "";
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "banana_router",
        providerModel: "gpt-image-2",
        mediaType: "image",
        invocationMode: "async_polling",
        providerConfig: {
          baseURL: "https://api.bananarouter.com",
          requestPath: "/v1/images/generations/async",
          editEndpoint: "/v1/images/generations/async",
          queryTaskEndpoint: "/v1/async-tasks/{taskId}",
          apiKeyEnv: "BananaRouter_API_KEY",
          requestFormat: "banana_router_openai_images",
          resultFormat: "url",
        },
      },
      { BananaRouter_API_KEY: "banana-key" },
      (async (url, init) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers;
        capturedBody = String(init?.body ?? "");
        return Response.json({
          taskID: "banana-image-task",
          status: "pending",
          createdAt: "2026-08-02T08:00:00.000Z",
        }, { status: 202 });
      }) as typeof fetch,
    );

    const result = await adapter.submit({
      providerRequestId: "provider-request-image-async",
      providerName: "BananaRouter",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-image:task-image-async",
      payloadRef: "creator://banana/image-async",
      payloadHash: "hash-image-async",
      redactedPayload: {
        prompt: "A cinematic comic panel",
        referenceImages: [{ url: "https://cdn.example.com/reference.png" }],
      },
    });

    assert.equal(capturedUrl, "https://api.bananarouter.com/v1/images/generations/async");
    assert.deepEqual(capturedHeaders, {
      authorization: "Bearer banana-key",
      "content-type": "application/json",
      "Idempotency-Key": "provider-request-image-async",
    });
    assert.deepEqual(JSON.parse(capturedBody), {
      model: "gpt-image-2",
      prompt: "A cinematic comic panel",
      images: ["https://cdn.example.com/reference.png"],
      response_format: "url",
    });
    assert.equal(result.externalRequestId, "banana-image-task");
    assert.equal(result.status, "accepted");
    assert.equal(result.artifacts, undefined);
  });

  it("recovers an ambiguous BananaRouter image submission with the original idempotency key", async () => {
    const requests: Array<{ url: string; idempotencyKey: string | null }> = [];
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "banana_router",
        providerModel: "gpt-image-2",
        mediaType: "image",
        invocationMode: "async_polling",
        providerConfig: {
          baseURL: "https://api.bananarouter.com",
          requestPath: "/v1/images/generations/async",
          queryTaskEndpoint: "/v1/async-tasks/{taskId}",
          apiKeyEnv: "BananaRouter_API_KEY",
          requestFormat: "banana_router_openai_images",
        },
      },
      { BananaRouter_API_KEY: "banana-key" },
      (async (url, init) => {
        requests.push({
          url: String(url),
          idempotencyKey: new Headers(init?.headers).get("Idempotency-Key"),
        });
        return Response.json({ taskID: "recovered-image-task", status: "pending" }, { status: 202 });
      }) as typeof fetch,
    );

    const recovered = await adapter.recoverSubmission?.({
      providerRequestId: "provider-request-image-recovery",
      providerName: "BananaRouter",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-image:task-image-recovery",
      payloadRef: "creator://banana/image-recovery",
      payloadHash: "hash-image-recovery",
      redactedPayload: { prompt: "Recover this billed image" },
    });

    assert.deepEqual(requests, [{
      url: "https://api.bananarouter.com/v1/images/generations/async",
      idempotencyKey: "provider-request-image-recovery",
    }]);
    assert.equal(recovered?.externalRequestId, "recovered-image-task");
    assert.equal(recovered?.status, "accepted");
  });

  it("does not replay an ambiguous BananaRouter image submission after the idempotency window", async () => {
    let requestCount = 0;
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "banana_router",
        providerModel: "gpt-image-2",
        mediaType: "image",
        invocationMode: "async_polling",
        providerConfig: {
          baseURL: "https://api.bananarouter.com",
          requestPath: "/v1/images/generations/async",
          queryTaskEndpoint: "/v1/async-tasks/{taskId}",
          apiKeyEnv: "BananaRouter_API_KEY",
          requestFormat: "banana_router_openai_images",
        },
      },
      { BananaRouter_API_KEY: "banana-key" },
      (async () => {
        requestCount += 1;
        return Response.json({ taskID: "duplicate-image-task", status: "pending" }, { status: 202 });
      }) as typeof fetch,
    );

    const recovered = await adapter.recoverSubmission?.({
      providerRequestId: "provider-request-image-expired",
      providerName: "BananaRouter",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-image:task-image-expired",
      payloadRef: "creator://banana/image-expired",
      payloadHash: "hash-image-expired",
      redactedPayload: { prompt: "Do not double bill this image" },
      externalSubmissionStartedAt: new Date(0),
    });

    assert.equal(recovered, null);
    assert.equal(requestCount, 0);
  });

  it("polls BananaRouter image tasks through the dedicated async task endpoint", async () => {
    const requestedUrls: string[] = [];
    const responses = [
      { taskID: "image/task 1", status: "processing" },
      {
        taskID: "image/task 1",
        status: "completed",
        result: { data: [{ url: "https://cdn.example.com/async-image.png" }] },
      },
    ];
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "banana_router",
        providerModel: "gpt-image-2",
        mediaType: "image",
        invocationMode: "async_polling",
        providerConfig: {
          baseURL: "https://api.bananarouter.com",
          requestPath: "/v1/images/generations/async",
          queryTaskEndpoint: "/v1/async-tasks/{taskId}",
          apiKeyEnv: "BananaRouter_API_KEY",
          requestFormat: "banana_router_openai_images",
          resultFormat: "url",
        },
      },
      { BananaRouter_API_KEY: "banana-key" },
      (async (url) => {
        requestedUrls.push(String(url));
        return Response.json(responses.shift());
      }) as typeof fetch,
    );

    const running = await adapter.poll?.({ externalRequestId: "image/task 1" });
    const completed = await adapter.poll?.({ externalRequestId: "image/task 1" });

    assert.deepEqual(requestedUrls, [
      "https://api.bananarouter.com/v1/async-tasks/image%2Ftask%201",
      "https://api.bananarouter.com/v1/async-tasks/image%2Ftask%201",
    ]);
    assert.equal(running?.status, "running");
    assert.equal(completed?.status, "succeeded");
    assert.deepEqual(completed?.artifacts, [{
      mediaType: "image",
      mimeType: "image/png",
      fileExtension: "png",
      url: "https://cdn.example.com/async-image.png",
    }]);
  });

  it("accepts BananaRouter image poll payloads above the video JSON limit", async () => {
    const largeB64Json = "A".repeat(4 * 1024 * 1024 + 4);
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "banana_router",
        providerModel: "gpt-image-2",
        mediaType: "image",
        invocationMode: "async_polling",
        providerConfig: {
          baseURL: "https://api.bananarouter.com",
          requestPath: "/v1/images/generations/async",
          queryTaskEndpoint: "/v1/async-tasks/{taskId}",
          apiKeyEnv: "BananaRouter_API_KEY",
          requestFormat: "banana_router_openai_images",
        },
      },
      { BananaRouter_API_KEY: "banana-key" },
      (async () => Response.json({
        taskID: "large-image-task",
        status: "completed",
        result: { data: [{ b64_json: largeB64Json }] },
      })) as typeof fetch,
    );

    const completed = await adapter.poll?.({ externalRequestId: "large-image-task" });

    assert.equal(completed?.status, "succeeded");
    assert.equal(completed?.artifacts?.[0]?.b64Json?.length, largeB64Json.length);
  });

  it("submits gpt-image-2 reference edits as BananaRouter JSON image URLs", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "banana_router",
        providerModel: "gpt-image-2",
        providerConfig: {
          baseURL: "https://api.bananarouter.com",
          requestPath: "/v1/images/generations",
          editEndpoint: "/v1/images/edits",
          apiKeyEnv: "BananaRouter_API_KEY",
          requestFormat: "banana_router_openai_images",
          resultFormat: "url",
        },
      },
      { BananaRouter_API_KEY: "banana-key" },
      (async (url, init) => {
        capturedUrl = String(url);
        capturedBody = String(init?.body ?? "");
        return new Response(JSON.stringify({
          data: [{ url: "https://cdn.example.com/edited.png" }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    );

    const result = await adapter.submit({
      providerRequestId: "provider-request-edit",
      providerName: "BananaRouter",
      providerOperation: "shot.image.edit",
      requestKey: "workflow-edit:task-edit",
      payloadRef: "creator://banana/edit",
      payloadHash: "hash-edit",
      redactedPayload: {
        prompt: "Keep the character and replace the background",
        referenceImages: [
          { url: "https://cdn.example.com/character.png" },
          { imageUrl: "https://cdn.example.com/background.png" },
        ],
        parameters: { size: "1024x1024" },
      },
    });

    assert.equal(capturedUrl, "https://api.bananarouter.com/v1/images/edits");
    assert.deepEqual(JSON.parse(capturedBody), {
      model: "gpt-image-2",
      prompt: "Keep the character and replace the background",
      images: [
        "https://cdn.example.com/character.png",
        "https://cdn.example.com/background.png",
      ],
      size: "1024x1024",
      response_format: "url",
    });
    assert.deepEqual(result.artifacts, [{
      mediaType: "image",
      mimeType: "image/png",
      fileExtension: "png",
      url: "https://cdn.example.com/edited.png",
    }]);
  });

  it("submits Sora2 tasks with the BananaRouter Sora contract", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "banana_router",
        providerModel: "sora-2",
        providerConfig: {
          baseURL: "https://api.bananarouter.com",
          requestPath: "/v1/videos",
          createTaskEndpoint: "/v1/videos",
          queryTaskEndpoint: "/v1/videos/{taskId}",
          apiKeyEnv: "BananaRouter_API_KEY",
          requestFormat: "banana_router_sora_video",
        },
      },
      { BananaRouter_API_KEY: "banana-key" },
      (async (url, init) => {
        capturedUrl = String(url);
        capturedBody = String(init?.body ?? "");
        return new Response(JSON.stringify({
          id: "banana-sora-task",
          status: "queued",
          progress: 0,
          model: "sora-2",
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    );

    const result = await adapter.submit({
      providerRequestId: "provider-request-sora",
      providerName: "BananaRouter",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-sora:task-sora",
      payloadRef: "creator://banana/sora",
      payloadHash: "hash-sora",
      redactedPayload: {
        prompt: "A cat rides through a neon city",
        firstFrameUrl: "https://cdn.example.com/sora-reference.png",
        parameters: {
          aspectRatio: "16:9",
          size: "720x1280",
          durationSec: 8,
        },
      },
    });

    assert.equal(capturedUrl, "https://api.bananarouter.com/v1/videos");
    assert.deepEqual(JSON.parse(capturedBody), {
      model: "sora-2",
      prompt: "A cat rides through a neon city",
      size: "720x1280",
      seconds: "8",
      input_reference: {
        image_url: "https://cdn.example.com/sora-reference.png",
      },
    });
    assert.equal(result.externalRequestId, "banana-sora-task");
    assert.equal(result.status, "accepted");
    assert.equal(result.redactedResponse?.providerStatus, "queued");
  });

  it("polls completed Sora2 tasks and returns the generated video", async () => {
    let capturedUrl = "";
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "banana_router",
        providerModel: "sora-2",
        providerConfig: {
          baseURL: "https://api.bananarouter.com",
          createTaskEndpoint: "/v1/videos",
          queryTaskEndpoint: "/v1/videos/{taskId}",
          apiKeyEnv: "BananaRouter_API_KEY",
          requestFormat: "banana_router_sora_video",
        },
      },
      { BananaRouter_API_KEY: "banana-key" },
      (async (url) => {
        capturedUrl = String(url);
        return new Response(JSON.stringify({
          id: "sora/task 1",
          status: "completed",
          video_url: "https://cdn.example.com/sora.mp4",
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    );

    const result = await adapter.poll?.({ externalRequestId: "sora/task 1" });

    assert.equal(capturedUrl, "https://api.bananarouter.com/v1/videos/sora%2Ftask%201");
    assert.equal(result?.status, "succeeded");
    assert.equal(result?.videoUrl, "https://cdn.example.com/sora.mp4");
  });

  it("submits, polls, and cancels Seedance tasks with the BananaRouter contract", async () => {
    const requests: Array<{ url: string; method: string; body?: unknown }> = [];
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "banana_router",
        providerModel: "doubao-seedance-2.0",
        providerConfig: {
          baseURL: "https://api.bananarouter.com",
          createTaskEndpoint: "/api/v3/contents/generations/tasks",
          queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
          apiKeyEnv: "BananaRouter_API_KEY",
          requestFormat: "banana_router_seedance_video",
        },
      },
      { BananaRouter_API_KEY: "banana-key" },
      (async (url, init) => {
        const method = init?.method ?? "GET";
        requests.push({
          url: String(url),
          method,
          ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
        });
        if (method === "POST") {
          return new Response(JSON.stringify({ id: "seedance-task", status: "queued" }), { status: 200 });
        }
        if (method === "DELETE") {
          return new Response(null, { status: 204 });
        }
        return new Response(JSON.stringify({
          id: "seedance-task",
          status: "succeeded",
          content: { video_url: "https://cdn.example.com/seedance.mp4" },
        }), { status: 200 });
      }) as typeof fetch,
    );

    const submission = await adapter.submit({
      providerRequestId: "provider-request-seedance",
      providerName: "BananaRouter",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-seedance:task-seedance",
      payloadRef: "creator://banana/seedance",
      payloadHash: "hash-seedance",
      redactedPayload: {
        prompt: "A hero walks through falling snow",
        firstFrameUrl: "https://cdn.example.com/first.png",
        lastFrameUrl: "https://cdn.example.com/last.png",
        parameters: {
          ratio: "16:9",
          resolution: "1080p",
          durationSec: 8,
          generateAudio: true,
        },
      },
    });
    const polled = await adapter.poll?.({ externalRequestId: "seedance-task" });
    const canceled = await (adapter as typeof adapter & {
      cancel(input: { externalRequestId: string }): Promise<{ status: string }>;
    }).cancel({ externalRequestId: "seedance-task" });

    assert.deepEqual(requests[0], {
      url: "https://api.bananarouter.com/api/v3/contents/generations/tasks",
      method: "POST",
      body: {
        model: "doubao-seedance-2.0",
        content: [
          { type: "text", text: "A hero walks through falling snow" },
          { type: "image_url", image_url: { url: "https://cdn.example.com/first.png" }, role: "first_frame" },
          { type: "image_url", image_url: { url: "https://cdn.example.com/last.png" }, role: "last_frame" },
        ],
        ratio: "16:9",
        resolution: "1080p",
        duration: 8,
        generate_audio: true,
        watermark: false,
      },
    });
    assert.equal(submission.externalRequestId, "seedance-task");
    assert.equal(polled?.status, "succeeded");
    assert.equal(polled?.videoUrl, "https://cdn.example.com/seedance.mp4");
    assert.equal(canceled.status, "canceled");
    assert.deepEqual(requests.slice(1).map(({ url, method }) => ({ url, method })), [
      {
        url: "https://api.bananarouter.com/api/v3/contents/generations/tasks/seedance-task",
        method: "GET",
      },
      {
        url: "https://api.bananarouter.com/api/v3/contents/generations/tasks/seedance-task",
        method: "DELETE",
      },
    ]);
  });

  it("routes BananaRouter upstream errors through the model error factory", async () => {
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "banana_router",
        providerModel: "gpt-image-2",
        providerConfig: {
          baseURL: "https://api.bananarouter.com",
          requestPath: "/v1/images/generations",
          apiKeyEnv: "BananaRouter_API_KEY",
          requestFormat: "banana_router_openai_images",
        },
      },
      { BananaRouter_API_KEY: "banana-key" },
      (async () => new Response(JSON.stringify({
        error: { message: "upstream unavailable" },
        authorization: "Bearer should-not-leak",
      }), {
        status: 503,
        headers: { "content-type": "application/json" },
      })) as typeof fetch,
    );

    await assert.rejects(
      () => adapter.submit({
        providerRequestId: "provider-request-error",
        providerName: "BananaRouter",
        providerOperation: "shot.image.generate",
        requestKey: "workflow-error:task-error",
        payloadRef: "creator://banana/error",
        payloadHash: "hash-error",
        redactedPayload: { prompt: "test" },
      }),
      (error: unknown) => {
        assert.ok(error instanceof ModelError);
        assert.doesNotMatch(error.message, /should-not-leak/);
        assert.doesNotMatch(JSON.stringify(error.providerDiagnostics), /should-not-leak/);
        assert.equal(readProviderRawResponse(error.providerDiagnostics), undefined);
        return true;
      },
    );
  });

  it("routes malformed successful BananaRouter payloads through the model error factory", async () => {
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "banana_router",
        providerModel: "gpt-image-2",
        providerConfig: {
          baseURL: "https://api.bananarouter.com",
          requestPath: "/v1/images/generations",
          apiKeyEnv: "BananaRouter_API_KEY",
          requestFormat: "banana_router_openai_images",
        },
      },
      { BananaRouter_API_KEY: "banana-key" },
      (async () => new Response("null", {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch,
    );

    await assert.rejects(
      () => adapter.submit({
        providerRequestId: "provider-request-malformed",
        providerName: "BananaRouter",
        providerOperation: "shot.image.generate",
        requestKey: "workflow-malformed:task-malformed",
        payloadRef: "creator://banana/malformed",
        payloadHash: "hash-malformed",
        redactedPayload: { prompt: "test" },
      }),
      (error: unknown) => error instanceof ModelError,
    );
  });

  it("routes BananaRouter network and missing-key failures through the model error factory", async () => {
    const modelConfig = {
      providerProtocol: "banana_router",
      providerModel: "gpt-image-2",
      providerConfig: {
        baseURL: "https://api.bananarouter.com",
        requestPath: "/v1/images/generations",
        apiKeyEnv: "BananaRouter_API_KEY",
        requestFormat: "banana_router_openai_images",
      },
    };
    assert.throws(
      () => createProviderAdapterFromModelConfig(modelConfig, {}),
      (error: unknown) => error instanceof ModelError,
    );

    const adapter = createProviderAdapterFromModelConfig(
      modelConfig,
      { BananaRouter_API_KEY: "banana-key" },
      (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
    );
    await assert.rejects(
      () => adapter.submit({
        providerRequestId: "provider-request-network-error",
        providerName: "BananaRouter",
        providerOperation: "shot.image.generate",
        requestKey: "workflow-network-error:task-network-error",
        payloadRef: "creator://banana/network-error",
        payloadHash: "hash-network-error",
        redactedPayload: { prompt: "test" },
      }),
      (error: unknown) => error instanceof ModelError && error.code === "model_network_error",
    );
  });

  it("rejects malformed or incomplete BananaRouter video poll responses", async () => {
    for (const responseBody of [null, { status: "completed" }]) {
      const adapter = createProviderAdapterFromModelConfig(
        {
          providerProtocol: "banana_router",
          providerModel: "sora-2",
          providerConfig: {
            baseURL: "https://api.bananarouter.com",
            createTaskEndpoint: "/v1/videos",
            queryTaskEndpoint: "/v1/videos/{taskId}",
            apiKeyEnv: "BananaRouter_API_KEY",
            requestFormat: "banana_router_sora_video",
          },
        },
        { BananaRouter_API_KEY: "banana-key" },
        (async () => new Response(JSON.stringify(responseBody), { status: 200 })) as typeof fetch,
      );

      await assert.rejects(
        () => adapter.poll?.({ externalRequestId: "malformed-video-task" }),
        (error: unknown) => error instanceof ModelError,
      );
    }
  });

  it("rejects BananaRouter endpoints outside the dedicated provider origin", () => {
    assert.throws(
      () => createProviderAdapterFromModelConfig(
        {
          providerProtocol: "banana_router",
          providerModel: "gpt-image-2",
          providerConfig: {
            baseURL: "https://attacker.example.com",
            requestPath: "/v1/images/generations",
            apiKeyEnv: "BananaRouter_API_KEY",
            requestFormat: "banana_router_openai_images",
          },
        },
        { BananaRouter_API_KEY: "banana-key" },
      ),
      (error: unknown) => error instanceof ModelError,
    );
  });

  it("rejects BananaRouter media, invocation, and polling contract mismatches", () => {
    for (const modelConfig of [
      {
        providerProtocol: "banana_router",
        providerModel: "gpt-image-2",
        mediaType: "image",
        invocationMode: "sync",
        providerConfig: {
          baseURL: "https://api.bananarouter.com",
          requestPath: "/v1/images/generations",
          apiKeyEnv: "BananaRouter_API_KEY",
          requestFormat: "banana_router_seedance_video",
        },
      },
      {
        providerProtocol: "banana_router",
        providerModel: "sora-2",
        mediaType: "video",
        invocationMode: "async_polling",
        providerConfig: {
          baseURL: "https://api.bananarouter.com",
          createTaskEndpoint: "/v1/videos",
          queryTaskEndpoint: "/v1/videos/task-without-placeholder",
          apiKeyEnv: "BananaRouter_API_KEY",
          requestFormat: "banana_router_sora_video",
        },
      },
      {
        providerProtocol: "banana_router",
        providerModel: "gpt-image-2",
        mediaType: "audio",
        invocationMode: "sync",
        providerConfig: {
          baseURL: "https://api.bananarouter.com",
          requestPath: "/v1/images/generations",
          apiKeyEnv: "BananaRouter_API_KEY",
          requestFormat: "banana_router_openai_images",
        },
      },
      {
        providerProtocol: "banana_router",
        providerModel: "gpt-image-2",
        mediaType: "image",
        invocationMode: "async_polling",
        providerConfig: {
          baseURL: "https://api.bananarouter.com",
          requestPath: "/v1/images/generations",
          queryTaskEndpoint: "/v1/async-tasks/{taskId}",
          apiKeyEnv: "BananaRouter_API_KEY",
          requestFormat: "banana_router_openai_images",
        },
      },
    ]) {
      assert.throws(
        () => createProviderAdapterFromModelConfig(modelConfig, { BananaRouter_API_KEY: "banana-key" }),
        (error: unknown) => error instanceof ModelError,
      );
    }
  });

  it("rejects oversized BananaRouter responses before buffering their bodies", async () => {
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "banana_router",
        providerModel: "gpt-image-2",
        providerConfig: {
          baseURL: "https://api.bananarouter.com",
          requestPath: "/v1/images/generations",
          apiKeyEnv: "BananaRouter_API_KEY",
          requestFormat: "banana_router_openai_images",
        },
      },
      { BananaRouter_API_KEY: "banana-key" },
      (async () => new Response("", {
        status: 200,
        headers: { "content-length": String(65 * 1024 * 1024) },
      })) as typeof fetch,
    );

    await assert.rejects(
      () => adapter.submit({
        providerRequestId: "provider-request-oversized-response",
        providerName: "BananaRouter",
        providerOperation: "shot.image.generate",
        requestKey: "workflow-oversized:task-oversized",
        payloadRef: "creator://banana/oversized",
        payloadHash: "hash-oversized",
        redactedPayload: { prompt: "test" },
      }),
      (error: unknown) => error instanceof ModelError,
    );
  });

  it("rejects unsafe provider artifact URLs", async () => {
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "banana_router",
        providerModel: "gpt-image-2",
        providerConfig: {
          baseURL: "https://api.bananarouter.com",
          requestPath: "/v1/images/generations",
          apiKeyEnv: "BananaRouter_API_KEY",
          requestFormat: "banana_router_openai_images",
          resultFormat: "url",
        },
      },
      { BananaRouter_API_KEY: "banana-key" },
      (async () => Response.json({
        data: [
          { url: "http://127.0.0.1:4310/internal" },
          { url: "https://[::ffff:127.0.0.1]/internal" },
        ],
      })) as typeof fetch,
    );

    await assert.rejects(
      () => adapter.submit({
        providerRequestId: "provider-request-unsafe-artifact",
        providerName: "BananaRouter",
        providerOperation: "shot.image.generate",
        requestKey: "workflow-unsafe:task-unsafe",
        payloadRef: "creator://banana/unsafe",
        payloadHash: "hash-unsafe",
        redactedPayload: { prompt: "test" },
      }),
      (error: unknown) => error instanceof ModelError,
    );
  });
});
