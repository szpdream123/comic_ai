import test from "node:test";
import assert from "node:assert/strict";
import { validatePayload, snapshotModel, type ProductPolicy } from "./policy.ts";
import { createProviderExecutor } from "./provider-executor.ts";
import { ModelServiceError, type ModelConfig } from "./contracts.ts";

function model(operation: "video" | "speech", defaults: Record<string, unknown>): ModelConfig {
  return { id: "m", modelCode: "m", displayName: "m", providerName: "GlobalAiOpc", providerModel: "supplier-model",
    providerProtocol: operation === "video" ? "globalaiopc_video" : "aliyun_bailian_audio", invocationMode: "async_polling",
    mediaType: operation === "video" ? "video" : "audio", taskModes: [], capabilities: {}, parameterSchema: {},
    defaultParams: defaults, pricing: {}, limits: {}, uiConfig: {}, status: "active", sortOrder: 0, remark: null,
    providerConfig: { apiKeyEnv: "OFFLINE_KEY", createTaskEndpoint: "https://supplier.example/create", queryTaskEndpoint: "https://supplier.example/tasks/{taskId}" } };
}
const policy: ProductPolicy = { models: { text: [], video: ["m"], speech: ["m"], transcription: [] }, mediaOrigins: ["https://assets.example"] };
async function outbound(operation: "video" | "speech", defaults: Record<string, unknown>, parameters: Record<string, unknown>) {
  const config = model(operation, defaults);
  const payload = validatePayload({ model: "m", subjectId: "u", requestKey: "k", prompt: "shot", parameters }, operation, config, policy);
  let sent: any;
  const executor = createProviderExecutor({ env: { OFFLINE_KEY: "offline" }, fetchImpl: async (_url, init) => {
    sent = JSON.parse(String(init?.body));
    return new Response(JSON.stringify(operation === "video" ? { task_id: "t" }
      : { output: { audio: { url: "https://assets.example/out.mp3" } } }), { headers: { "content-type": "application/json" } });
  } });
  const result = await executor.submit(snapshotModel(config), operation, payload, "r");
  assert.notEqual(result.status, "failed");
  return sent;
}

test("video caller aliases override every equivalent model default in the actual supplier payload", async () => {
  const sent = await outbound("video", { durationSec: 5, aspectRatio: "16:9" }, { duration: 10, ratio: "9:16" });
  assert.equal(sent.duration, 10); assert.equal(sent.aspect_ratio, "9:16");
  const reverse = await outbound("video", { duration: 5, ratio: "16:9" }, { durationSec: 10, aspectRatio: "9:16" });
  assert.equal(reverse.duration, 10); assert.equal(reverse.aspect_ratio, "9:16");
});

test("explicit reference mode replaces the conflicting default generation mode", async () => {
  const sent = await outbound("video", { mode: "first-frame" }, { referenceMode: "image",
    firstFrame: "https://assets.example/frame.png", referenceImages: ["https://assets.example/reference.png"] });
  assert.deepEqual(sent.reference_images, ["https://assets.example/reference.png"]);
  assert.equal(sent.first_image, undefined);
});

test("speech voice and sample-rate aliases override model defaults", async () => {
  const sent = await outbound("speech", { voice: "default-voice", sampleRate: 24000 }, { voiceId: "selected-voice", sample_rate: 48000 });
  assert.equal(sent.input.voice, "selected-voice"); assert.equal(sent.input.sample_rate, 48000);
});

test("invalid scalar types and conflicting aliases are rejected before creating paid work", () => {
  for (const parameters of [
    { duration: true }, { duration: 0 }, { duration: -1 }, { duration: 5.5 }, { duration: "bad" }, { duration: "" },
    { aspectRatio: false }, { aspectRatio: " " }, { resolution: 720 },
    { seed: false }, { seed: 0.5 }, { generateAudio: "false" }, { watermark: "true" },
    { referenceMode: true }, { mode: false }, { mode: "unsupported" }, { durationSec: 5, duration: 10 },
    { referenceMode: "frame", mode: "reference-video" }, { aspectRatio: "16:9", ratio: "9:16" },
  ]) {
    assert.throws(() => validatePayload({ prompt: "shot", parameters }, "video", model("video", {}), policy),
      (error) => error instanceof ModelServiceError && error.status === 400, JSON.stringify(parameters));
  }
  for (const parameters of [{ voice: true }, { voice: "v", sampleRate: false }, { voice: "v", rate: "bad" }, { voice: "v", mode: "unused" }]) {
    assert.throws(() => validatePayload({ prompt: "shot", parameters }, "speech", model("speech", {}), policy),
      (error) => error instanceof ModelServiceError && error.status === 400, JSON.stringify(parameters));
  }
});
