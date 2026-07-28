import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AliyunBailianAudioProviderAdapter } from "../aliyun-bailian-audio.provider-adapter.ts";
import { createProviderAdapterFromModelConfig } from "../provider-adapter.factory.ts";

const submission = {
  providerRequestId: "provider-audio-1",
  providerName: "aliyun-bailian",
  providerOperation: "canvas.audio.generate",
  requestKey: "workflow-audio:task-audio",
  payloadRef: "creator://canvas/audio-node",
  payloadHash: "audio-hash",
  redactedPayload: {
    text: "雨夜街道，主角低声讲述往事。",
    parameters: {
      voice: "longxiaochun",
      format: "mp3",
      sampleRate: 22050,
      volume: 50,
      rate: 1,
      pitch: 1,
    },
  },
};

describe("aliyun bailian audio provider adapter", () => {
  it("ignores requestTimeoutMs and uses the fixed audio timeout", async () => {
    let calls = 0;
    const timeoutCalls: number[] = [];
    const originalTimeout = AbortSignal.timeout;
    AbortSignal.timeout = ((delay: number) => {
      timeoutCalls.push(delay);
      return new AbortController().signal;
    }) as typeof AbortSignal.timeout;
    const adapter = new AliyunBailianAudioProviderAdapter({
      apiKey: "audio-secret",
      model: "cosyvoice-v2",
      createTaskEndpoint: "https://dashscope.aliyuncs.com/api/v1/audio",
      queryTaskEndpoint: "https://dashscope.aliyuncs.com/api/v1/tasks/{taskId}",
      requestTimeoutMs: 5,
      fetchImpl: async (_url, init) => {
        calls += 1;
        assert.ok(init?.signal);
        return new Response(JSON.stringify({
          request_id: "audio-fixed-timeout",
          output: { audio: { id: "audio-fixed-timeout", url: "https://cdn.example.test/audio.mp3" } },
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });
    try {
      const result = await adapter.submit(submission);
      assert.equal(result.status, "succeeded");
      await assert.rejects(() => adapter.poll({ externalRequestId: "audio-timeout" }), /audio_provider_sync_poll_not_supported/);
      assert.equal(calls, 1);
      assert.deepEqual(timeoutCalls, [60 * 60 * 1000]);
    } finally {
      AbortSignal.timeout = originalTimeout;
    }
  });

  it("submits the official CosyVoice V2 non-streaming HTTP request without embedding credentials", async () => {
    let requestUrl = "";
    let requestHeaders: HeadersInit | undefined;
    let requestBody = "";
    let recordedRequest: Record<string, unknown> | undefined;
    const adapter = new AliyunBailianAudioProviderAdapter({
      apiKey: "bailian-secret",
      model: "cosyvoice-v2",
      createTaskEndpoint: "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer",
      fetchImpl: (async (url, init) => {
        requestUrl = String(url);
        requestHeaders = init?.headers;
        requestBody = String(init?.body ?? "");
        return new Response(JSON.stringify({
          request_id: "audio-request-1",
          output: {
            finish_reason: "stop",
            audio: {
              data: "",
              url: "https://dashscope-result.example.com/audio/result.mp3",
              id: "audio-1",
              expires_at: 1772697707,
            },
          },
          usage: { characters: 14 },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });

    const result = await adapter.submit({
      ...submission,
      recordRedactedRequest: async (request) => { recordedRequest = request; },
    });

    assert.equal(requestUrl, "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer");
    assert.deepEqual(requestHeaders, {
      authorization: "Bearer bailian-secret",
      "content-type": "application/json",
    });
    assert.deepEqual(JSON.parse(requestBody), {
      model: "cosyvoice-v2",
      input: {
        text: "雨夜街道，主角低声讲述往事。",
        voice: "longxiaochun",
        format: "mp3",
        sample_rate: 22050,
        volume: 50,
        rate: 1,
        pitch: 1,
      },
    });
    assert.deepEqual(recordedRequest, JSON.parse(requestBody));
    assert.equal(JSON.stringify(recordedRequest).includes("bailian-secret"), false);
    assert.equal(result.externalRequestId, "audio-request-1");
    assert.equal(result.status, "succeeded");
    assert.deepEqual(result.redactedResponse, {
      model: "cosyvoice-v2",
      providerStatus: "stop",
      requestId: "audio-request-1",
      audioId: "audio-1",
      expiresAt: 1772697707,
      usageCharacters: 14,
      hasArtifact: true,
    });
  });

  it("does not forward LibTV-only audio controls without an official V2 provider field", async () => {
    let requestBody = "";
    const adapter = new AliyunBailianAudioProviderAdapter({
      apiKey: "bailian-secret",
      model: "cosyvoice-v2",
      createTaskEndpoint: "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer",
      fetchImpl: (async (_url, init) => {
        requestBody = String(init?.body ?? "");
        return new Response(JSON.stringify({
          request_id: "audio-request-controls",
          output: { audio: { url: "https://dashscope-result.example.com/controls.mp3" } },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });

    await adapter.submit({
      ...submission,
      redactedPayload: {
        text: "只应发送已确认的 V2 参数",
        parameters: {
          voice: "longxiaochun_v2",
          format: "mp3",
          sampleRate: 22050,
          rate: 1,
          pitch: 1,
          volume: 50,
          pause: 300,
          interjection: "嗯",
          intensity: 0.8,
          timbre: 0.2,
          effect: "电话失真",
        },
      },
    });

    assert.deepEqual(JSON.parse(requestBody), {
      model: "cosyvoice-v2",
      input: {
        text: "只应发送已确认的 V2 参数",
        voice: "longxiaochun_v2",
        format: "mp3",
        sample_rate: 22050,
        volume: 50,
        rate: 1,
        pitch: 1,
      },
    });
  });

  it("rejects poll attempts without making a network request", async () => {
    let calls = 0;
    const adapter = new AliyunBailianAudioProviderAdapter({
      apiKey: "bailian-secret",
      createTaskEndpoint: "https://dashscope.aliyuncs.com/create",
      queryTaskEndpoint: "https://dashscope.aliyuncs.com/api/v1/tasks/{taskId}",
      fetchImpl: (async () => {
        calls += 1;
        throw new Error("unexpected fetch");
      }) as typeof fetch,
    });
    await assert.rejects(() => adapter.poll({ externalRequestId: "audio/task-2" }), /audio_provider_sync_poll_not_supported/);
    assert.equal(calls, 0);
  });

  it("accepts a synchronous provider result while retaining a stable request identity", async () => {
    const adapter = new AliyunBailianAudioProviderAdapter({
      apiKey: "bailian-secret",
      createTaskEndpoint: "https://dashscope.aliyuncs.com/create",
      fetchImpl: (async () => new Response(JSON.stringify({
        request_id: "audio-request-3",
        output: { audio_url: "https://dashscope-result.example.com/direct.wav", task_status: "SUCCEEDED" },
      }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch,
    });

    const result = await adapter.submit({
      ...submission,
      redactedPayload: { prompt: "直接返回语音", parameters: { voice: "longxiaochun_v2", format: "wav" } },
    });
    assert.equal(result.externalRequestId, "audio-request-3");
    assert.equal(result.status, "succeeded");
    assert.deepEqual(result.artifacts, [{
      mediaType: "audio",
      mimeType: "audio/wav",
      fileExtension: "wav",
      url: "https://dashscope-result.example.com/direct.wav",
    }]);
  });

  it("preserves structured transcript and lyrics returned alongside an audio artifact", async () => {
    const adapter = new AliyunBailianAudioProviderAdapter({
      apiKey: "bailian-secret",
      createTaskEndpoint: "https://dashscope.aliyuncs.com/create",
      fetchImpl: (async () => new Response(JSON.stringify({
        request_id: "audio-transcription-1",
        output: {
          audio_url: "https://dashscope-result.example.com/transcription.mp3",
          transcript: "识别后的文本",
          lyrics: "沿着微光回家",
          task_status: "SUCCEEDED",
        },
      }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch,
    });
    const result = await adapter.submit({
      ...submission,
      redactedPayload: { text: "audio bytes", parameters: { voice: "longxiaochun_v2" } },
    });
    assert.equal(result.artifacts?.[0]?.transcript, "识别后的文本");
    assert.equal(result.artifacts?.[0]?.lyrics, "沿着微光回家");
  });

  it("rejects fake inline artifacts and terminal success without an audio URL", async () => {
    const inlineAdapter = new AliyunBailianAudioProviderAdapter({
      apiKey: "bailian-secret",
      createTaskEndpoint: "https://dashscope.aliyuncs.com/create",
      fetchImpl: (async () => new Response(JSON.stringify({
        output: { task_id: "audio-inline", task_status: "SUCCEEDED", audio_url: "data:audio/wav;base64,AAAA" },
      }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch,
    });
    await assert.rejects(() => inlineAdapter.submit(submission), /audio_provider_artifact_url_invalid/);

    const missingAdapter = new AliyunBailianAudioProviderAdapter({
      apiKey: "bailian-secret",
      createTaskEndpoint: "https://dashscope.aliyuncs.com/create",
      queryTaskEndpoint: "https://dashscope.aliyuncs.com/api/v1/tasks/{taskId}",
      fetchImpl: (async () => new Response(JSON.stringify({
        request_id: "audio-missing",
        output: { finish_reason: "stop" },
      }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch,
    });
    await assert.rejects(() => missingAdapter.submit(submission), /audio_provider_artifact_missing/);

    const invalidMimeAdapter = new AliyunBailianAudioProviderAdapter({
      apiKey: "bailian-secret",
      createTaskEndpoint: "https://dashscope.aliyuncs.com/create",
      fetchImpl: (async () => new Response(JSON.stringify({
        output: {
          task_status: "SUCCEEDED",
          audio: { url: "https://dashscope-result.example.com/not-audio.json", mime_type: "application/json" },
        },
      }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch,
    });
    await assert.rejects(() => invalidMimeAdapter.submit(submission), /audio_provider_artifact_mime_invalid/);

    await assert.rejects(() => inlineAdapter.submit({
      ...submission,
      redactedPayload: { text: "unsupported format", parameters: { voice: "longxiaochun_v2", format: "aac" } },
    }), /audio_provider_format_invalid/);
  });

  it("surfaces redacted HTTP diagnostics without returning a successful task", async () => {
    const adapter = new AliyunBailianAudioProviderAdapter({
      apiKey: "bailian-secret",
      createTaskEndpoint: "https://dashscope.aliyuncs.com/create",
      fetchImpl: (async () => new Response(JSON.stringify({
        code: "InvalidParameter",
        message: "voice is unavailable",
        audio_url: "https://private.example.com/should-redact.mp3",
      }), {
        status: 400,
        headers: { "content-type": "application/json", "x-request-id": "dashscope-request-1" },
      })) as typeof fetch,
    });

    await assert.rejects(async () => {
      try {
        await adapter.submit(submission);
      } catch (error) {
        const typed = error as Error & { providerDiagnostics?: Record<string, unknown> };
        assert.match(typed.message, /audio_provider_submit:400:InvalidParameter:voice is unavailable/);
        assert.equal(typed.providerDiagnostics?.requestId, "dashscope-request-1");
        assert.equal(String(typed.providerDiagnostics?.responseBodyPreview).includes("should-redact.mp3"), false);
        throw error;
      }
    });
  });

  it("builds the audio adapter from normalized model config and routes submit and poll", async () => {
    const requests: Array<{ url: string; authorization: string | null }> = [];
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: "aliyun-bailian-audio",
        providerModel: "cosyvoice-v2",
        providerConfig: {
          baseURL: "https://dashscope.aliyuncs.com",
          createTaskEndpoint: "/api/v1/services/audio/tts/SpeechSynthesizer",
          apiKeyEnv: "ALIYUNBAILIAN_API_KEY",
        },
      },
      { ALIYUNBAILIAN_API_KEY: "factory-bailian-key" },
      (async (url, init) => {
        const headers = new Headers(init?.headers);
        requests.push({ url: String(url), authorization: headers.get("authorization") });
        return new Response(JSON.stringify({
          request_id: "factory-audio-request",
          output: {
            finish_reason: "stop",
            audio: { url: "https://dashscope-result.example.com/factory.mp3", id: "factory-audio" },
          },
          usage: { characters: 14 },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    );

    assert.ok(adapter instanceof AliyunBailianAudioProviderAdapter);
    const submitted = await adapter.submit(submission);
    assert.equal(submitted.externalRequestId, "factory-audio-request");
    assert.equal(submitted.status, "succeeded");
    assert.deepEqual(requests, [
      {
        url: "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer",
        authorization: "Bearer factory-bailian-key",
      },
    ]);
  });

  it("enforces the official required voice and numeric parameter ranges", async () => {
    const adapter = new AliyunBailianAudioProviderAdapter({
      apiKey: "bailian-secret",
      createTaskEndpoint: "https://dashscope.aliyuncs.com/create",
      fetchImpl: (async () => { throw new Error("unexpected fetch"); }) as typeof fetch,
    });
    const invalid = async (parameters: Record<string, unknown>, code: RegExp) => {
      await assert.rejects(() => adapter.submit({
        ...submission,
        redactedPayload: { text: "invalid", parameters },
      }), code);
    };
    await invalid({}, /audio_provider_voice_required/);
    await invalid({ voice: "longxiaochun_v2", format: "ogg" }, /audio_provider_format_invalid/);
    await invalid({ voice: "longxiaochun_v2", sampleRate: 32_000 }, /audio_provider_sample_rate_invalid/);
    await invalid({ voice: "longxiaochun_v2", volume: 50.5 }, /audio_provider_volume_invalid/);
    await invalid({ voice: "longxiaochun_v2", rate: 2.1 }, /audio_provider_rate_invalid/);
    await invalid({ voice: "longxiaochun_v2", pitch: 0 }, /audio_provider_pitch_invalid/);
  });
});
