import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GlobalAiOpcSoundCloneProviderAdapter } from "../global-ai-opc-sound-clone.provider-adapter.ts";
import { createProviderAdapterFromModelConfig } from "../provider-adapter.factory.ts";

describe("GlobalAiOpc SoundClone provider adapter", () => {
  it("submits documented fields and polls the audio artifact", async () => {
    const urls: string[] = [];
    let createBody = "";
    const adapter = createProviderAdapterFromModelConfig({
      providerProtocol: "globalaiopc_sound_clone",
      providerModel: "soundCloningAudio",
      providerConfig: {
        baseURL: "https://zcbservice.aizfw.cn/kyyReactApiServer",
        createTaskEndpoint: "/v1/soundCloning/audios",
        queryTaskEndpoint: "/v1/result/{taskId}",
        apiKeyEnv: "GLOBAL_AI_OPC_API_KEY",
      },
    }, { GLOBAL_AI_OPC_API_KEY: "global-ai-opc-key" }, (async (url, init) => {
      urls.push(String(url));
      if (String(init?.method).toUpperCase() === "POST") {
        createBody = String(init?.body ?? "");
        return new Response(JSON.stringify({ id: "sound-task-1", status: "queued" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        id: "sound-task-1",
        status: "completed",
        audioUrl: "https://cdn.example.com/output.wav?token=redacted",
        modelId: "cloned-voice-1",
        subtitleFile: "https://cdn.example.com/output.json",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch);

    const submitted = await adapter.submit({
      providerRequestId: "provider-request-sound-clone",
      providerName: "GlobalAiOpc",
      providerOperation: "episode.audio.generate",
      requestKey: "workflow-audio:sound-clone",
      payloadRef: "creator://sound-clone",
      payloadHash: "hash-sound-clone",
      redactedPayload: {
        text: "你好，欢迎回来。",
        parameters: {
          voiceId: "cloned-voice-1",
          soundVersion: "v2",
          language: "zh",
          emotion: "happy",
          speed: 1.1,
          volume: 2,
          pitch: 1,
          subtitleEnable: true,
          subtitleType: "word",
        },
      },
    });
    const polled = await adapter.poll!({ externalRequestId: submitted.externalRequestId });

    assert.deepEqual(urls, [
      "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/soundCloning/audios",
      "https://zcbservice.aizfw.cn/kyyReactApiServer/v1/result/sound-task-1",
    ]);
    assert.deepEqual(JSON.parse(createBody), {
      modelId: "cloned-voice-1",
      contentText: "你好，欢迎回来。",
      soundVersion: "v2",
      language: "zh",
      emotion: "happy",
      speed: 1.1,
      vol: 2,
      pitch: 1,
      subtitleEnable: true,
      subtitleType: "word",
    });
    assert.equal(submitted.status, "accepted");
    assert.equal(polled.status, "succeeded");
    assert.deepEqual(polled.artifacts, [{
      mediaType: "audio",
      url: "https://cdn.example.com/output.wav?token=redacted",
      mimeType: "audio/wav",
      fileExtension: "wav",
    }]);
    assert.equal(polled.redactedResponse.modelId, "cloned-voice-1");
  });

  it("requires a cloned voice model ID", async () => {
    const adapter = new GlobalAiOpcSoundCloneProviderAdapter({
      apiKey: "global-ai-opc-key",
      createTaskEndpoint: "https://provider.example.test/v1/soundCloning/audios",
      queryTaskEndpoint: "https://provider.example.test/v1/result/{id}",
    });
    await assert.rejects(adapter.submit({
      providerRequestId: "provider-request-sound-clone-missing-model",
      providerName: "GlobalAiOpc",
      providerOperation: "episode.audio.generate",
      requestKey: "workflow-audio:sound-clone-missing-model",
      payloadRef: "creator://sound-clone-missing-model",
      payloadHash: "hash-sound-clone-missing-model",
      redactedPayload: { text: "Missing model" },
    }), /global_ai_opc_sound_clone_model_id_required/);
  });

  it("rejects failed submissions and completed polls without audio", async () => {
    const responses = [
      new Response(JSON.stringify({ id: "sound-task-failed", status: "failed" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      new Response(JSON.stringify({ id: "sound-task-empty", status: "completed" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ];
    const adapter = new GlobalAiOpcSoundCloneProviderAdapter({
      apiKey: "global-ai-opc-key",
      createTaskEndpoint: "https://provider.example.test/v1/soundCloning/audios",
      queryTaskEndpoint: "https://provider.example.test/v1/result/{id}",
      fetchImpl: (async () => responses.shift()!) as typeof fetch,
    });
    await assert.rejects(adapter.submit({
      providerRequestId: "provider-request-sound-clone-failed",
      providerName: "GlobalAiOpc",
      providerOperation: "episode.audio.generate",
      requestKey: "workflow-audio:sound-clone-failed",
      payloadRef: "creator://sound-clone-failed",
      payloadHash: "hash-sound-clone-failed",
      redactedPayload: { text: "Failed", parameters: { modelId: "voice-1" } },
    }), /global_ai_opc_sound_clone_task_failed/);
    await assert.rejects(
      adapter.poll({ externalRequestId: "sound-task-empty" }),
      /global_ai_opc_sound_clone_completed_without_audio_url/,
    );
  });
});
