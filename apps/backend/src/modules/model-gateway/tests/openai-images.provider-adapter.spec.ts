import assert from "node:assert/strict";
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
          endpoint: "/v1/images/generations",
          apiKeyEnv: "GPT_IMAGE2_API_KEY",
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

    assert.equal(capturedUrl, "https://relay.example.com/v1/images/generations");
    assert.deepEqual(capturedHeaders, {
      authorization: "Bearer relay-key",
      "content-type": "application/json",
    });
    assert.match(capturedBody, /"model":"gpt-image-2"/);
    assert.match(capturedBody, /floating library/);
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
    assert.equal(capturedBody.get("size"), "1024x1536");
    assert.equal(capturedBody.getAll("image").length, 1);
    assert.equal(capturedBody.get("image") instanceof Blob, true);
    assert.equal(result.externalRequestId, "req_edit_123");
    assert.equal(result.status, "succeeded");
    assert.deepEqual(result.redactedResponse?.outputTypes, ["b64_json"]);
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
      /provider_api_key_missing/,
    );
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
