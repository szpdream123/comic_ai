import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSoundClonePayload,
  GlobalAiOpcSoundCloneProviderAdapter,
} from "../globalaiopc-sound-clone.provider-adapter.ts";

const input = {
  providerRequestId: "provider-request-soundclone",
  providerName: "GlobalAiOpc",
  providerOperation: "audio.generate",
  requestKey: "workflow:audio-task",
  payloadRef: "creator://audio-payload",
  payloadHash: "hash",
  redactedPayload: {
    text: "欢迎使用声音克隆。",
    parameters: {
      modelId: "model_123",
      soundVersion: "v1",
      language: "Chinese",
      emotion: "neutral",
      speed: 1,
      vol: 1,
      pitch: 0,
      subtitleEnable: false,
    },
  },
};

describe("GlobalAiOpc SoundClone provider adapter", () => {
  it("builds the documented SoundClone request fields", () => {
    assert.deepEqual(buildSoundClonePayload(input.redactedPayload), {
      modelId: "model_123",
      contentText: "欢迎使用声音克隆。",
      soundVersion: "v1",
      language: "Chinese",
      emotion: "neutral",
      speed: 1,
      vol: 1,
      pitch: 0,
      subtitleEnable: false,
    });
  });

  it("submits a task and polls its audio result", async () => {
    const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
    const adapter = new GlobalAiOpcSoundCloneProviderAdapter({
      apiKey: "kyy-key",
      createTaskEndpoint: "https://kyy.example/v1/soundCloning/audios",
      queryTaskEndpoint: "https://kyy.example/v1/result/{taskId}",
      fetchImpl: (async (url, init) => {
        calls.push({
          url: String(url),
          method: String(init?.method),
          body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
        });
        if (calls.length === 1) {
          assert.equal((init?.headers as Record<string, string>).authorization, "Bearer kyy-key");
          return Response.json({ id: "audio-task-1", object: "audio", status: "queued" });
        }
        return Response.json({
          id: "audio-task-1",
          object: "audio",
          status: "completed",
          audioUrl: "https://cdn.example/audio.mp3",
        });
      }) as typeof fetch,
    });

    const submitted = await adapter.submit(input);
    assert.equal(submitted.externalRequestId, "audio-task-1");
    assert.equal(submitted.status, "accepted");
    const polled = await adapter.poll({ externalRequestId: "audio-task-1" });
    assert.equal(polled.status, "succeeded");
    assert.equal(polled.artifacts?.[0]?.url, "https://cdn.example/audio.mp3");
    assert.deepEqual(calls.map((call) => [call.method, call.url]), [
      ["POST", "https://kyy.example/v1/soundCloning/audios"],
      ["GET", "https://kyy.example/v1/result/audio-task-1"],
    ]);
  });

  it("accepts task and artifact fields wrapped in data", async () => {
    let callCount = 0;
    const adapter = new GlobalAiOpcSoundCloneProviderAdapter({
      apiKey: "kyy-key",
      createTaskEndpoint: "https://kyy.example/v1/soundCloning/audios",
      queryTaskEndpoint: "https://kyy.example/v1/result/{taskId}",
      fetchImpl: (async () => {
        callCount += 1;
        return callCount === 1
          ? Response.json({ status: "queued", data: { id: "audio-task-data" } })
          : Response.json({ status: "completed", data: { audioUrl: "https://cdn.example/data.mp3" } });
      }) as typeof fetch,
    });

    const submitted = await adapter.submit(input);
    const polled = await adapter.poll({ externalRequestId: submitted.externalRequestId });
    assert.equal(submitted.externalRequestId, "audio-task-data");
    assert.equal(polled.artifacts?.[0]?.url, "https://cdn.example/data.mp3");
  });
});
