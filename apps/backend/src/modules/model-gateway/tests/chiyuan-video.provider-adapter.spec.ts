import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createProviderAdapterFromModelConfig } from "../provider-adapter.factory.ts";
import { readProviderRawResponse } from "../provider-response-diagnostics.ts";

function submissionInput(redactedPayload: Record<string, unknown>) {
  return {
    providerRequestId: "provider-request-chiyuan",
    providerName: "ChiYuan",
    providerOperation: "shot.video.generate",
    requestKey: "workflow-chiyuan:task-chiyuan",
    payloadRef: "creator://payload-chiyuan",
    payloadHash: "hash-chiyuan",
    redactedPayload,
  };
}

describe("ChiYuan video provider adapter", () => {
  it("accepts a runtime-resolved API key", () => {
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "chiyuan_video",
        providerModel: "doubao-seedance-2-0-mini-260615",
        mediaType: "video",
        providerConfig: {
          baseURL: "https://cy.apistudio.cc",
          createTaskEndpoint: "/api/v3/contents/generations/tasks",
          queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
          apiKeyEnv: "ChiYuan_API_KEY",
          apiKey: "resolved-admin-secret",
          requestFormat: "chiyuan_seedance_official",
        },
      },
      {},
    );

    assert.equal(adapter.constructor.name, "ChiYuanVideoProviderAdapter");
  });

  it("uses the current Seedance content contract for the official-compatible endpoint", async () => {
    const requests: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = [];
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "chiyuan_video",
        providerModel: "doubao-seedance-2-0-mini-260615",
        mediaType: "video",
        providerConfig: {
          baseURL: "https://cy.apistudio.cc",
          createTaskEndpoint: "/api/v3/contents/generations/tasks",
          queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
          apiKeyEnv: "ChiYuan_API_KEY",
          requestFormat: "chiyuan_seedance_official",
        },
      },
      { ChiYuan_API_KEY: "chiyuan-key" },
      (async (url, init) => {
        requests.push({
          url: String(url),
          method: String(init?.method ?? "GET"),
          body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null,
        });
        if (String(init?.method ?? "GET") === "POST") {
          return Response.json({ data: { task_id: "official-task", status: "queued" } });
        }
        return Response.json({
          data: {
            task_id: "official-task",
            status: "succeeded",
            content: { video_url: "https://cdn.example.com/official.mp4" },
          },
        });
      }) as typeof fetch,
    );

    const submitted = await adapter.submit(submissionInput({
      prompt: "镜头缓慢推进",
      firstFrameUrl: "https://cdn.example.com/first.png",
      lastFrameUrl: "https://cdn.example.com/last.png",
      referenceImages: ["https://cdn.example.com/reference.png"],
      parameters: { durationSec: 5, resolution: "720p", aspectRatio: "16:9" },
    }));
    assert.equal(submitted.externalRequestId, "official-task");
    assert.deepEqual(requests[0], {
      url: "https://cy.apistudio.cc/api/v3/contents/generations/tasks",
      method: "POST",
      body: {
        model: "doubao-seedance-2-0-mini-260615",
        content: [
          { type: "text", text: "镜头缓慢推进" },
          { type: "image_url", image_url: { url: "https://cdn.example.com/reference.png" }, role: "reference_image" },
        ],
        ratio: "16:9",
        resolution: "720p",
        duration: 5,
        watermark: false,
      },
    });

    assert.ok(adapter.poll);
    const polled = await adapter.poll({ externalRequestId: "official-task" });
    assert.equal(requests[1]?.url, "https://cy.apistudio.cc/api/v3/contents/generations/tasks/official-task");
    assert.equal(polled.status, "succeeded");
    assert.equal(polled.videoUrl, "https://cdn.example.com/official.mp4");
  });

  it("reads the ChiYuan result_url shape for official-compatible polling", async () => {
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "chiyuan_video",
        providerModel: "doubao-seedance-2-0-mini-260615",
        mediaType: "video",
        providerConfig: {
          baseURL: "https://cy.apistudio.cc",
          createTaskEndpoint: "/api/v3/contents/generations/tasks",
          queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
          apiKeyEnv: "ChiYuan_API_KEY",
          requestFormat: "chiyuan_seedance_official",
        },
      },
      { ChiYuan_API_KEY: "chiyuan-key" },
      (async () => Response.json({
        code: "success",
        data: {
          task_id: "official-result-url-task",
          status: "SUCCESS",
          result_url: "https://cdn.example.com/official-result.mov?token=download-secret",
        },
      })) as typeof fetch,
    );

    assert.ok(adapter.poll);
    const result = await adapter.poll({ externalRequestId: "official-result-url-task" });
    assert.equal(result.status, "succeeded");
    assert.equal(result.videoUrl, "https://cdn.example.com/official-result.mov?token=download-secret");
    assert.doesNotMatch(JSON.stringify(result.redactedResponse), /download-secret/);
  });

  it("uses the native contents contract for Seedance 2.5 automatic super-resolution", async () => {
    const requests: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = [];
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "chiyuan_video",
        providerModel: "doubao-seedance-2-5-260628",
        mediaType: "video",
        providerConfig: {
          baseURL: "https://cy.apistudio.cc",
          createTaskEndpoint: "/api/v3/contents/generations/tasks",
          queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
          apiKeyEnv: "ChiYuan_API_KEY",
          requestFormat: "chiyuan_seedance_super_resolution",
        },
      },
      { ChiYuan_API_KEY: "chiyuan-key" },
      (async (url, init) => {
        requests.push({
          url: String(url),
          method: String(init?.method ?? "GET"),
          body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null,
        });
        if (String(init?.method ?? "GET") === "POST") {
          return Response.json({ id: "super-task", status: "queued" });
        }
        return Response.json({
          id: "super-task",
          status: "succeeded",
          content: { video_url: "https://cdn.example.com/super.mp4" },
        });
      }) as typeof fetch,
    );

    const submitted = await adapter.submit(submissionInput({
      prompt: "雨夜霓虹街道",
      firstFrameUrl: "https://cdn.example.com/frame.png",
      referenceImages: ["https://cdn.example.com/reference-a.png"],
      parameters: {
        mode: "reference-video",
        durationSec: 30,
        resolution: "1080p",
        aspectRatio: "9:16",
        watermark: false,
      },
    }));
    assert.equal(submitted.externalRequestId, "super-task");
    assert.equal(
      submitted.redactedResponse.queryTaskEndpoint,
      "https://cy.apistudio.cc/api/v3/contents/generations/tasks/{taskId}",
    );
    assert.deepEqual(requests[0], {
      url: "https://cy.apistudio.cc/api/v3/contents/generations/tasks",
      method: "POST",
      body: {
        model: "doubao-seedance-2-5-260628",
        content: [
          { type: "text", text: "雨夜霓虹街道" },
          {
            type: "image_url",
            image_url: { url: "https://cdn.example.com/frame.png" },
            role: "reference_image",
          },
          {
            type: "image_url",
            image_url: { url: "https://cdn.example.com/reference-a.png" },
            role: "reference_image",
          },
        ],
        generate_audio: true,
        ratio: "9:16",
        duration: 30,
        resolution: "1080p",
        watermark: false,
        omni_reference_task_type: "reference",
        output_format: "mov",
      },
    });

    assert.ok(adapter.poll);
    const polled = await adapter.poll({ externalRequestId: "super-task" });
    assert.equal(requests[1]?.url, "https://cy.apistudio.cc/api/v3/contents/generations/tasks/super-task");
    assert.equal(polled.status, "succeeded");
    assert.equal(polled.videoUrl, "https://cdn.example.com/super.mp4");
  });

  it("reads the result URL from the Seedance 2.5 success response", async () => {
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "chiyuan_video",
        providerModel: "doubao-seedance-2-5-260628",
        mediaType: "video",
        providerConfig: {
          baseURL: "https://cy.apistudio.cc",
          createTaskEndpoint: "/api/v3/contents/generations/tasks",
          queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
          apiKeyEnv: "ChiYuan_API_KEY",
          requestFormat: "chiyuan_seedance_super_resolution",
        },
      },
      { ChiYuan_API_KEY: "chiyuan-key" },
      (async () => Response.json({
        code: "success",
        message: "",
        data: {
          task_id: "nested-result-task",
          status: "SUCCESS",
          result_url: "https://cdn.example.com/result.mp4",
          progress: "100%",
          data: {
            content: { video_url: "https://upstream.example.com/video.mp4" },
            status: "succeeded",
          },
        },
      })) as typeof fetch,
    );

    assert.ok(adapter.poll);
    const result = await adapter.poll({ externalRequestId: "nested-result-task" });
    assert.equal(result.status, "succeeded");
    assert.equal(result.videoUrl, "https://cdn.example.com/result.mp4");
  });

  it("rejects unsupported ChiYuan request formats before sending", () => {
    assert.throws(
      () => createProviderAdapterFromModelConfig(
        {
          providerProtocol: "chiyuan_video",
          providerModel: "doubao-seedance-2-5-260628",
          mediaType: "video",
          providerConfig: {
            baseURL: "https://cy.apistudio.cc",
            createTaskEndpoint: "/api/v3/contents/generations/tasks",
            queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
            apiKeyEnv: "ChiYuan_API_KEY",
            requestFormat: "unknown_format",
          },
        },
        { ChiYuan_API_KEY: "chiyuan-key" },
      ),
      /chiyuan_provider_config_invalid/,
    );
  });

  it("does not accept a super-resolution submission that the provider reports as failed", async () => {
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "chiyuan_video",
        providerModel: "doubao-seedance-2-5-260628",
        mediaType: "video",
        providerConfig: {
          baseURL: "https://cy.apistudio.cc",
          createTaskEndpoint: "/api/v3/contents/generations/tasks",
          queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
          apiKeyEnv: "ChiYuan_API_KEY",
          requestFormat: "chiyuan_seedance_super_resolution",
        },
      },
      { ChiYuan_API_KEY: "chiyuan-key" },
      (async () => Response.json({
        id: "failed-task",
        status: "failed",
        error: {
          code: "invalid_parameter",
          message: "duration is invalid for https://cdn.example.com/frame.png?token=response-secret",
        },
      })) as typeof fetch,
    );

    await assert.rejects(
      () => adapter.submit(submissionInput({ prompt: "测试失败返回" })),
      (error: Error & { providerDiagnostics?: Record<string, unknown> }) => {
        assert.match(
          error.message,
          /chiyuan_video_submission_failed:invalid_parameter:duration is invalid for https:\/\/cdn\.example\.com\/frame\.png/,
        );
        assert.doesNotMatch(error.message, /response-secret/);
        assert.doesNotMatch(JSON.stringify(error.providerDiagnostics), /response-secret/);
        return true;
      },
    );
  });

  it("does not accept an official-compatible submission that reports a business failure", async () => {
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "chiyuan_video",
        providerModel: "doubao-seedance-2-0-mini-260615",
        mediaType: "video",
        providerConfig: {
          baseURL: "https://cy.apistudio.cc",
          createTaskEndpoint: "/api/v3/contents/generations/tasks",
          queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
          apiKeyEnv: "ChiYuan_API_KEY",
          requestFormat: "chiyuan_seedance_official",
        },
      },
      { ChiYuan_API_KEY: "chiyuan-key" },
      (async () => Response.json({
        id: "failed-official-task",
        status: "failed",
        error: {
          code: "invalid_content",
          message: "role is required for https://cdn.example.com/frame.png?token=response-secret",
        },
      })) as typeof fetch,
    );

    await assert.rejects(
      () => adapter.submit(submissionInput({ prompt: "测试官方失败返回" })),
      (error: Error & { providerDiagnostics?: Record<string, unknown> }) => {
        assert.match(error.message, /chiyuan_video_submission_failed:invalid_content:role is required/);
        assert.doesNotMatch(error.message, /response-secret/);
        assert.doesNotMatch(JSON.stringify(error.providerDiagnostics), /response-secret/);
        return true;
      },
    );
  });

  it("keeps polling when terminal success is visible before the result URL", async () => {
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "chiyuan_video",
        providerModel: "doubao-seedance-2-5-260628",
        mediaType: "video",
        providerConfig: {
          baseURL: "https://cy.apistudio.cc",
          createTaskEndpoint: "/api/v3/contents/generations/tasks",
          queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
          apiKeyEnv: "ChiYuan_API_KEY",
          requestFormat: "chiyuan_seedance_super_resolution",
        },
      },
      { ChiYuan_API_KEY: "chiyuan-key" },
      (async () => Response.json({ id: "missing-url-task", status: "completed" })) as typeof fetch,
    );

    assert.ok(adapter.poll);
    const result = await adapter.poll({ externalRequestId: "missing-url-task" });
    assert.equal(result.status, "running");
    assert.equal(result.redactedResponse.providerMessage, "provider_succeeded_without_video_url");
  });

  it("locks the provider host, key reference, model, and endpoint contract", () => {
    const baseConfig = {
      providerProtocol: "chiyuan_video",
      providerModel: "doubao-seedance-2-5-260628",
      mediaType: "video",
      providerConfig: {
        baseURL: "https://cy.apistudio.cc",
        createTaskEndpoint: "/api/v3/contents/generations/tasks",
        queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
        apiKeyEnv: "ChiYuan_API_KEY",
        requestFormat: "chiyuan_seedance_super_resolution",
      },
    };

    for (const [name, config] of [
      ["host", { ...baseConfig, providerConfig: { ...baseConfig.providerConfig, baseURL: "https://attacker.example" } }],
      ["key", { ...baseConfig, providerConfig: { ...baseConfig.providerConfig, apiKeyEnv: "DATABASE_URL" } }],
      ["model", { ...baseConfig, providerModel: "doubao-seedance-2-0-mini-260615" }],
      ["endpoint", { ...baseConfig, providerConfig: { ...baseConfig.providerConfig, createTaskEndpoint: "/v1/video/generations" } }],
      ["requestPath", { ...baseConfig, providerConfig: { ...baseConfig.providerConfig, requestPath: "https://attacker.example/collect" } }],
    ] as const) {
      assert.throws(
        () => createProviderAdapterFromModelConfig(config, {
          ChiYuan_API_KEY: "chiyuan-key",
          DATABASE_URL: "must-not-leave-process",
        }),
        /chiyuan_provider_config_invalid/,
        name,
      );
    }
  });

  it("keeps signed media URLs out of provider audit snapshots", async () => {
    const recorded: Record<string, unknown>[] = [];
    let sentBody: Record<string, unknown> | undefined;
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "chiyuan_video",
        providerModel: "doubao-seedance-2-5-260628",
        mediaType: "video",
        providerConfig: {
          baseURL: "https://cy.apistudio.cc",
          createTaskEndpoint: "/api/v3/contents/generations/tasks",
          queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
          apiKeyEnv: "ChiYuan_API_KEY",
          requestFormat: "chiyuan_seedance_super_resolution",
        },
      },
      { ChiYuan_API_KEY: "chiyuan-key" },
      (async (_url, init) => {
        sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json({
          id: "signed-url-task",
          status: "queued",
          debug: { authorization: "Bearer echoed-secret" },
        });
      }) as typeof fetch,
    );

    const input = submissionInput({
      prompt: "测试审计脱敏",
      firstFrameUrl: "https://cdn.example.com/frame.png?X-Amz-Signature=secret-signature",
    });
    input.recordRedactedRequest = async (request) => { recorded.push(request); };
    const result = await adapter.submit(input);

    const sentContent = sentBody?.content as Record<string, unknown>[];
    const recordedContent = recorded[0]?.content as Record<string, unknown>[];
    const resultContent = result.redactedRequest?.content as Record<string, unknown>[];
    assert.equal((sentContent[1]?.image_url as Record<string, unknown>)?.url, "https://cdn.example.com/frame.png?X-Amz-Signature=secret-signature");
    assert.equal((recordedContent[1]?.image_url as Record<string, unknown>)?.url, "https://cdn.example.com/frame.png");
    assert.equal((resultContent[1]?.image_url as Record<string, unknown>)?.url, "https://cdn.example.com/frame.png");
    assert.equal(readProviderRawResponse(result.redactedResponse), undefined);
  });

  it("sanitizes signed media URLs returned by Seedance 2.5 polling", async () => {
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "chiyuan_video",
        providerModel: "doubao-seedance-2-5-260628",
        mediaType: "video",
        providerConfig: {
          baseURL: "https://cy.apistudio.cc",
          createTaskEndpoint: "/api/v3/contents/generations/tasks",
          queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
          apiKeyEnv: "ChiYuan_API_KEY",
          requestFormat: "chiyuan_seedance_super_resolution",
        },
      },
      { ChiYuan_API_KEY: "chiyuan-key" },
      (async () => Response.json({
        task_id: "failed-task",
        status: "failed",
        message: "bad image https://cdn.example.com/frame.png?X-Amz-Signature=secret-signature",
      })) as typeof fetch,
    );

    assert.ok(adapter.poll);
    const result = await adapter.poll({ externalRequestId: "failed-task" });
    assert.equal(result.redactedResponse.providerMessage, "bad image https://cdn.example.com/frame.png");
  });

  it("sanitizes Seedance 2.5 polling error messages before they can be persisted", async () => {
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "chiyuan_video",
        providerModel: "doubao-seedance-2-5-260628",
        mediaType: "video",
        providerConfig: {
          baseURL: "https://cy.apistudio.cc",
          createTaskEndpoint: "/api/v3/contents/generations/tasks",
          queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
          apiKeyEnv: "ChiYuan_API_KEY",
          requestFormat: "chiyuan_seedance_super_resolution",
        },
      },
      { ChiYuan_API_KEY: "chiyuan-key" },
      (async () => Response.json({
        error: {
          code: "invalid_content:https://cdn.example.com/code.png?token=code-secret",
          message: "bad image https://cdn.example.com/frame.png?X-Amz-Signature=response-secret",
        },
      }, { status: 400 })) as typeof fetch,
    );

    assert.ok(adapter.poll);
    await assert.rejects(
      () => adapter.poll?.({ externalRequestId: "failed-task" }),
      (error: Error & { providerDiagnostics?: Record<string, unknown> }) => {
        assert.doesNotMatch(error.message, /response-secret/);
        assert.doesNotMatch(error.message, /code-secret/);
        assert.doesNotMatch(JSON.stringify(error.providerDiagnostics), /response-secret/);
        assert.doesNotMatch(JSON.stringify(error.providerDiagnostics), /code-secret/);
        return true;
      },
    );
  });

  it("sanitizes invalid JSON returned by Seedance 2.5 polling", async () => {
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "chiyuan_video",
        providerModel: "doubao-seedance-2-5-260628",
        mediaType: "video",
        providerConfig: {
          baseURL: "https://cy.apistudio.cc",
          createTaskEndpoint: "/api/v3/contents/generations/tasks",
          queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
          apiKeyEnv: "ChiYuan_API_KEY",
          requestFormat: "chiyuan_seedance_super_resolution",
        },
      },
      { ChiYuan_API_KEY: "chiyuan-key" },
      (async () => new Response(
        "upstream failed for https://cdn.example.com/frame.png?token=response-secret",
        { status: 200, headers: { "content-type": "text/plain" } },
      )) as typeof fetch,
    );

    assert.ok(adapter.poll);
    await assert.rejects(
      () => adapter.poll?.({ externalRequestId: "failed-task" }),
      (error: Error & { providerDiagnostics?: Record<string, unknown> }) => {
        assert.doesNotMatch(error.message, /response-secret/);
        assert.doesNotMatch(JSON.stringify(error.providerDiagnostics), /response-secret/);
        return true;
      },
    );
  });

  it("falls back to the legacy query endpoint for tasks submitted before the endpoint migration", async () => {
    const urls: string[] = [];
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "chiyuan_video",
        providerModel: "doubao-seedance-2-5-260628",
        mediaType: "video",
        providerConfig: {
          baseURL: "https://cy.apistudio.cc",
          createTaskEndpoint: "/api/v3/contents/generations/tasks",
          queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
          apiKeyEnv: "ChiYuan_API_KEY",
          requestFormat: "chiyuan_seedance_super_resolution",
        },
      },
      { ChiYuan_API_KEY: "chiyuan-key" },
      (async (url) => {
        urls.push(String(url));
        if (!String(url).includes("/v1/videos/")) {
          return Response.json({ message: "task not found" }, { status: 404 });
        }
        return Response.json({
          id: "legacy-task",
          status: "completed",
          url: "https://cdn.example.com/legacy.mp4",
        });
      }) as typeof fetch,
    );

    assert.ok(adapter.poll);
    const result = await adapter.poll({
      externalRequestId: "legacy-task",
      redactedPayload: {
        modelConfigSnapshot: {
          config: {
            providerConfig: {
              queryTaskEndpoint: "/v1/videos/{taskId}",
            },
          },
        },
      },
    });
    assert.deepEqual(urls, [
      "https://cy.apistudio.cc/v1/videos/legacy-task",
    ]);
    assert.equal(result.status, "succeeded");
    assert.equal(result.videoUrl, "https://cdn.example.com/legacy.mp4");
  });

  it("keeps a retried v3 submission on v3 even when its captured snapshot used a legacy query endpoint", async () => {
    const urls: string[] = [];
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "chiyuan_video",
        providerModel: "doubao-seedance-2-5-260628",
        mediaType: "video",
        providerConfig: {
          baseURL: "https://cy.apistudio.cc",
          createTaskEndpoint: "/api/v3/contents/generations/tasks",
          queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
          apiKeyEnv: "ChiYuan_API_KEY",
          requestFormat: "chiyuan_seedance_super_resolution",
        },
      },
      { ChiYuan_API_KEY: "chiyuan-key" },
      (async (url) => {
        urls.push(String(url));
        return Response.json({
          id: "retried-v3-task",
          status: "completed",
          url: "https://cdn.example.com/retried-v3.mp4",
        });
      }) as typeof fetch,
    );

    assert.ok(adapter.poll);
    const result = await adapter.poll({
      externalRequestId: "retried-v3-task",
      redactedPayload: {
        providerResponseRedacted: {
          queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
        },
        modelConfigSnapshot: {
          config: {
            providerConfig: {
              queryTaskEndpoint: "/v1/videos/{taskId}",
            },
          },
        },
      },
    });

    assert.deepEqual(urls, [
      "https://cy.apistudio.cc/api/v3/contents/generations/tasks/retried-v3-task",
    ]);
    assert.equal(result.status, "succeeded");
  });

  it("sanitizes official-compatible error diagnostics before they can be persisted", async () => {
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "chiyuan_video",
        providerModel: "doubao-seedance-2-0-mini-260615",
        mediaType: "video",
        providerConfig: {
          baseURL: "https://cy.apistudio.cc",
          createTaskEndpoint: "/api/v3/contents/generations/tasks",
          queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
          apiKeyEnv: "ChiYuan_API_KEY",
          requestFormat: "chiyuan_seedance_official",
        },
      },
      { ChiYuan_API_KEY: "chiyuan-key" },
      (async () => Response.json({
        error: {
          code: "invalid_content",
          message: "bad image https://cdn.example.com/result.mp4?token=response-secret",
        },
      }, { status: 400 })) as typeof fetch,
    );

    await assert.rejects(
      () => adapter.submit(submissionInput({
        prompt: "错误脱敏",
        firstFrameUrl: "https://cdn.example.com/frame.png?token=request-secret",
      })),
      (error: Error & {
        providerDiagnostics?: Record<string, unknown>;
        providerRedactedRequest?: Record<string, unknown>;
      }) => {
        assert.equal(readProviderRawResponse(error.providerDiagnostics), undefined);
        assert.doesNotMatch(JSON.stringify(error.providerDiagnostics), /response-secret/);
        assert.doesNotMatch(JSON.stringify(error.providerRedactedRequest), /request-secret/);
        return true;
      },
    );
  });
});
