import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import { resolveCanvasAssistantModelId } from "../ai-canvas-runtime/assets/canvasAgentBatch.js";

const asset = name => readFileSync(new URL(`../ai-canvas-runtime/assets/${name}.js`, import.meta.url), "utf8");
const controller = asset("conversationExecutionController-CGzzIkBM");
const video = asset("useTooltipAutoPlacement-C_fDN_J5");
const catalog = asset("mcpToolCatalog-BYg95YCR");
const main = asset("main-upstream-665b2cc");
const resolveProfileCapability = vm.runInNewContext(`${main.slice(main.indexOf("var Ck="), main.indexOf("function Ak("))}; kk`, { structuredClone });
const normalize = vm.runInNewContext(`${video.slice(video.indexOf("var Po="), video.indexOf("function is("))}; rs`);
const validate = vm.runInNewContext(`${catalog.slice(0, catalog.indexOf("var r="))}; n`);
const capability = { resolutions: ["480P", "720P", "1080P"], defaultResolution: "720P", minDuration: 2, maxDuration: 15, maxImageReferences: 2 };
const request = { model: "wan3.0-r2v", prompt: "two characters fighting", seedanceDuration: 15 };
const references = ["white", "black"].map(id => ({ kind: "image", role: "reference", url: `https://example.invalid/${id}.png` }));

for (const [input, expected] of [["720p", "720P"], ["1080p", "1080P"], [" 1080P ", "1080P"], [undefined, "720P"]]) {
  test(`video resolution ${input} uses the provider's canonical ${expected} value`, () => {
    const result = normalize({ ...request, seedanceResolution: input }, { capability, references });
    assert.equal(result.output.resolutionPreset, expected);
    assert.equal(result.output.durationSeconds, 15);
    assert.equal(result.references.images.length, 2);
  });
}

test("normalization retains unsupported-resolution, duration, reference and capability validation", () => {
  for (const [input, options, code] of [
    [{ ...request, seedanceResolution: "4k" }, { capability, references }, "UNSUPPORTED_RESOLUTION"],
    [{ ...request, seedanceDuration: 16 }, { capability, references }, "DURATION_OUT_OF_RANGE"],
    [request, { capability, references: [...references, { ...references[0], url: "https://example.invalid/third.png" }] }, "REFERENCE_LIMIT_EXCEEDED"],
    [request, { capability: { ...capability, defaultResolution: "720p" }, references }, "INVALID_CAPABILITY"],
  ]) assert.throws(() => normalize(input, options), error => error.code === code);
});

test("video optional defaults remain omitted and pass the real second schema validation", () => {
  const state = { config: {}, projects: [{ id: "p", settings: {} }], workflows: [], agentTasks: [] };
  const resolve = new Function("w", "vn", "resolveCanvasAssistantModelId", `${controller.slice(controller.indexOf("function Ua("), controller.indexOf("function Wa("))}; return Ua;`)(
    { getState: () => state }, () => undefined, resolveCanvasAssistantModelId,
  );
  const input = { kind: "video", prompt: "fight", deliveryMode: "chat", duration: 15 };
  const result = resolve(input, { projectId: "p", mode: "collaborative" });
  assert.equal(Object.hasOwn(result, "resolution"), false);
  assert.equal(Object.hasOwn(result, "aspectRatio"), false);
  const schemaStart = controller.indexOf("inputSchema:", controller.indexOf('E({id:`media_generate`')) + "inputSchema:".length;
  const schema = vm.runInNewContext(`(${controller.slice(schemaStart, controller.indexOf(",effect:", schemaStart))})`);
  assert.equal(validate(schema, result).valid, true);
  state.projects[0].settings.generation = { videoResolution: "720p", videoAspectRatio: "16:9" };
  assert.equal(resolve(input, { projectId: "p" }).resolution, "720p");
  assert.equal(resolve({ ...input, resolution: "1080p" }, { projectId: "p" }).resolution, "1080p");
});

function contractTool(state, resolved, runninghub = () => undefined) {
  const start = controller.indexOf('E({id:`media_model_parameters`');
  const end = controller.indexOf(',E({id:`media_workflow_parameters`', start);
  const helperStart = controller.indexOf("function agentVideoModelCapability(");
  const helper = helperStart < 0 ? "" : controller.slice(helperStart, controller.indexOf("function qa(", helperStart));
  return new Function("E", "w", "vn", "c", "resolveAgentVideoCapability", `${helper};return ${controller.slice(start, end)};`)(value => value, { getState: () => state }, () => resolved, runninghub, resolveProfileCapability);
}

test("parameter discovery exposes the actual general video capability without provider credentials", async () => {
  const model = { id: "comic-ai/video/wan", name: "Wan", category: "video", videoCapability: { ...capability, apiKey: "SECRET", inputConstraints: { promptMinCharacters: 5, secret: "SECRET" } }, apiKey: "SECRET", requestTemplate: { secret: "SECRET" }, providerConfigId: "private" };
  const state = { currentProjectId: "p", config: { generalModels: [model], providers: { private: { apiKey: "SECRET" } } } };
  const tool = contractTool(state, { provider: "general", value: "general/comic-ai/video/wan" });
  const result = await tool.execute({ projectId: "p" }, { modelRef: "general/comic-ai/video/wan" });
  assert.equal(result.status, "success");
  const contract = JSON.parse(result.modelContent);
  assert.deepEqual(contract.capability.resolutions, capability.resolutions);
  assert.equal(contract.capability.defaultResolution, "720P");
  assert.equal(result.modelContent.includes("SECRET"), false);
  assert.equal(result.modelContent.includes("providerConfigId"), false);
  assert.equal(tool.authorize({ projectId: "other" }).allowed, false);
  model.videoCapability = undefined;
  model.executionProfile = { preset: "agnes-video" };
  assert.equal(JSON.parse((await tool.execute({}, {})).modelContent).capability.defaultResolution, "1152x768");
  model.category = "image";
  assert.equal((await tool.execute({}, {})).status, "error", "image models must not return misleading video instructions");
});

test("RunningHub parameter discovery and unknown-model errors are retained", async () => {
  const state = { config: { generalModels: [] } }, contract = { label: "RH", parameters: [{ name: "seed", type: "number" }] };
  const tool = contractTool(state, { provider: "runninghub" }, () => contract);
  assert.deepEqual(JSON.parse((await tool.execute({}, { modelRef: "rh" })).modelContent), contract);
  assert.equal((await contractTool(state, undefined).execute({}, { modelRef: "missing" })).status, "error");
});
