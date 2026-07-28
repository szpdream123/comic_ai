import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiMartAudioProviderAdapter } from "../apimart-audio.provider-adapter.ts";
import { createProviderAdapterFromModelConfig } from "../provider-adapter.factory.ts";

const submission = {
  providerRequestId: "provider-request-music-1",
  providerName: "apimart",
  providerOperation: "canvas.audio.generate",
  requestKey: "canvas-music:task-1",
  payloadRef: "creator://canvas/music-1",
  payloadHash: "hash",
  redactedPayload: {
    text: "温暖而克制的片尾曲",
    parameters: {
      mode: "music",
      autoGenerateLyrics: true,
      durationSec: 60,
      bpm: 88,
    },
  },
};

describe("APIMart audio provider adapter", () => {
  it("advances a durable lyrics task into music and returns lyrics with the audio artifact", async () => {
    const requests: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = [];
    const adapter = new ApiMartAudioProviderAdapter({
      apiKey: "apimart-secret",
      model: "flowmusic",
      lyricsEndpoint: "https://api.example.test/music/generations/lyricsFlowMusic",
      musicEndpoint: "https://api.example.test/music/generations",
      queryTaskEndpoint: "https://api.example.test/music/tasks/{taskId}?language=zh",
      fetchImpl: (async (url, init = {}) => {
        const target = String(url);
        const body = typeof init.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : null;
        requests.push({ url: target, method: init.method ?? "GET", body });
        if (target.endsWith("lyricsFlowMusic")) {
          return json({ data: { task_id: "lyrics-task-1", status: "pending" } });
        }
        if (target.includes("lyrics-task-1")) {
          return json({ data: { status: "completed", result: { lyrics: [{ title: "微光", lyrics: "沿着微光回家" }] } } });
        }
        if (target.endsWith("/music/generations")) {
          return json({ data: { task_id: "music-task-1", status: "pending" } });
        }
        if (target.includes("music-task-1")) {
          return json({ data: { status: "completed", result: { music: [{ audio_url: "https://cdn.example.test/music.wav", clip_id: "clip-1" }] } } });
        }
        return json({}, 404);
      }) as typeof fetch,
    });

    const submitted = await adapter.submit(submission);
    assert.equal(submitted.externalRequestId, "lyrics:lyrics-task-1");
    assert.equal(submitted.status, "accepted");

    const advanced = await adapter.poll({
      externalRequestId: submitted.externalRequestId,
      redactedPayload: submission.redactedPayload,
    });
    assert.equal(advanced.status, "running");
    assert.equal(advanced.externalRequestId, "music:music-task-1");
    assert.equal(advanced.redactedResponse.generatedLyrics, "沿着微光回家");
    assert.deepEqual(requests.find((item) => item.url.endsWith("/music/generations"))?.body, {
      model: "flowmusic",
      sound_prompt: "温暖而克制的片尾曲",
      lyrics: "沿着微光回家",
      title: "微光",
      bpm: "88",
      length: 60,
    });

    const completed = await adapter.poll({
      externalRequestId: advanced.externalRequestId!,
      redactedPayload: {
        ...submission.redactedPayload,
        providerState: advanced.redactedResponse,
      },
    });
    assert.equal(completed.status, "succeeded");
    assert.deepEqual(completed.artifacts, [{
      mediaType: "audio",
      url: "https://cdn.example.test/music.wav",
      mimeType: "audio/wav",
      fileExtension: "wav",
      lyrics: "沿着微光回家",
      title: "微光",
    }]);
    assert.equal(requests.some((item) => JSON.stringify(item).includes("apimart-secret")), false);
  });

  it("submits custom lyrics directly to music and reports unsupported cancellation honestly", async () => {
    const bodies: Record<string, unknown>[] = [];
    const adapter = new ApiMartAudioProviderAdapter({
      apiKey: "secret",
      lyricsEndpoint: "https://api.example.test/lyrics",
      musicEndpoint: "https://api.example.test/music",
      queryTaskEndpoint: "https://api.example.test/tasks/{taskId}",
      fetchImpl: (async (_url, init = {}) => {
        if (typeof init.body === "string") bodies.push(JSON.parse(init.body));
        return json({ task_id: "music-custom-1", status: "pending" });
      }) as typeof fetch,
    });
    const submitted = await adapter.submit({
      ...submission,
      redactedPayload: {
        prompt: "电影感配乐",
        parameters: { mode: "music", lyricsMode: "custom", lyrics: "自定义歌词" },
      },
    });
    assert.equal(submitted.externalRequestId, "music:music-custom-1");
    assert.equal(bodies[0]?.lyrics, "自定义歌词");
    assert.deepEqual(await adapter.cancel(), {
      status: "unknown",
      redactedResponse: { providerStatus: "cancel_not_supported" },
    });
  });

  it("builds from admin model configuration without storing the API key in the model", () => {
    const adapter = createProviderAdapterFromModelConfig({
      providerProtocol: "apimart_audio",
      providerModel: "flowmusic",
      mediaType: "audio",
      providerConfig: {
        baseURL: "https://api.example.test",
        apiKeyEnv: "APIMART_API_KEY",
      },
    }, { APIMART_API_KEY: "runtime-secret" });
    assert.ok(adapter instanceof ApiMartAudioProviderAdapter);
  });
});

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
