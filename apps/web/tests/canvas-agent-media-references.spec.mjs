import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { resolveCanvasAssistantModelId } from "../ai-canvas-runtime/assets/canvasAgentBatch.js";

const asset = name => readFileSync(new URL(`../ai-canvas-runtime/assets/${name}.js`, import.meta.url), "utf8");
const controller = asset("conversationExecutionController-CGzzIkBM");
const media = asset("useTooltipAutoPlacement-C_fDN_J5");
const normalizeVideo = vm.runInNewContext(`${media.slice(media.indexOf("var Po="), media.indexOf("function is("))}; rs`);
const videoVariables = new Function("Ut", "yt", `
  ${media.slice(media.indexOf("function is("), media.indexOf("async function as("))}
  ${media.slice(media.indexOf("function bs("), media.indexOf("async function xs("))}
  return bs;
`)(() => false, value => value);
const mention = "@{node-moyuan:墨渊}";
const imageUrl = "https://example.test/moyuan.png";

function fixture(goal) {
  const state = {
    currentProjectId: "project", config: {}, workflows: [], projects: [],
    messages: [],
    agentTasks: [{ id: "task", projectId: "project", conversationId: "conversation", goal }],
    nodes: [{ id: "node-moyuan", data: { type: "ai-image", imageUrl } }],
  };
  const resolve = new Function("w", "vn", "resolveCanvasAssistantModelId", "di",
    `${controller.slice(controller.indexOf("function Ua("), controller.indexOf("function Wa("))}; return Ua;`)(
    { getState: () => state }, () => ({ provider: "general" }), resolveCanvasAssistantModelId, () => undefined,
  );
  // Exercise the actual node-mention resolver, with only media IO and aggregation stubbed.
  const parse = new Function("A", "Kr", "Di", "N", "mn",
    `${media.slice(media.indexOf("async function Pi("), media.indexOf("async function Fi("))}; return Pi;`)(
    { getState: () => state }, async url => url, async url => url,
    (left, right) => [...left, ...right],
    references => ({ references, imageUrls: references.filter(r => r.kind === "image").map(r => r.url), videoUrls: [], audioUrls: [] }),
  );
  return {
    state,
    resolve: (input, context = {}) => resolve(input, { projectId: "project", taskId: "task", ...context }),
    parse,
  };
}

test("video generation keeps the user's referenced image when the model rewrites only the scene text", async () => {
  const { resolve, parse } = fixture(`创作风格：电影质感。\n${mention} 随机帮我生成一个5s视频吧。`);
  const resolved = resolve({ kind: "video", prompt: "黑袍魔法师挥动法杖，镜头缓缓推进", modelRef: "general/wan3.0-r2v", deliveryMode: "canvas", duration: 5 });
  const input = await parse(resolved.prompt, true);
  assert.deepEqual(input.imageUrls, [imageUrl]);
  const video = normalizeVideo({ prompt: input.prompt, model: "wan3.0-r2v", seedanceDuration: resolved.duration }, {
    capability: { requiresReference: true, maxImageReferences: 1, minDuration: 2, maxDuration: 15 }, references: input.references,
  });
  assert.equal(video.references.images[0].url, imageUrl);
  assert.equal(video.output.durationSeconds, 5);
  const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const bridge = app.slice(app.indexOf("function createAiCanvasRuntimeCatalogBridge"), app.indexOf("function createAiCanvasRuntimeScaleBridge"));
  const create = new Function("localStorage", "resolveAiCanvasRuntimeModelPricing", `${bridge}; return createAiCanvasRuntimeCatalogBridge;`)(
    { getItem: () => null }, () => ({}),
  );
  let catalog = { config: {} };
  create({ getState: () => catalog, setState: patch => { catalog = { ...catalog, ...patch }; } },
    { models: [{ modelCode: "wan3.0-r2v", category: "video" }] });
  const template = catalog.config.generalModels[0].executionProfile.protocol.submit.body;
  const variables = videoVariables(video);
  const body = Object.fromEntries(Object.entries(template).map(([key, value]) => [key, variables[value.slice(2, -2)]]));
  assert.deepEqual(Array.from(body.referenceImages), [imageUrl], "the backend submission template must receive the resolved image");
  assert.equal(body.duration, 5);
});

test("explicit tool references remain authoritative and do not gain unrelated task references", () => {
  const { resolve } = fixture(`${mention} @{other:另一角色} 分别生成视频`);
  const prompt = `${mention} 黑袍魔法师施法`;
  assert.equal(resolve({ kind: "video", prompt }).prompt, prompt);
  assert.equal(resolve({ kind: "image", prompt: "@asset{portrait.png} 修改色调" }).prompt, "@asset{portrait.png} 修改色调");
});

test("fallback preserves and deduplicates supported references without copying style, model or skill instructions", () => {
  const goal = `创作风格：电影质感。 ${mention} ${mention} @asset{reference.png} @drama{hero:英雄} @model{general/wan|Wan} /skill`;
  const { resolve } = fixture(goal);
  const prompt = resolve({ kind: "image", prompt: "角色特写" }).prompt;
  assert.equal(prompt, `角色特写 ${mention} @asset{reference.png} @drama{hero:英雄}`);
});

test("text-only requests, missing task context and audio retain their existing prompts", () => {
  assert.equal(fixture("生成海边日落").resolve({ kind: "video", prompt: "日落" }).prompt, "日落");
  const { resolve } = fixture(mention);
  assert.equal(resolve({ kind: "video", prompt: "日落" }, { taskId: "other" }).prompt, "日落");
  assert.equal(resolve({ kind: "audio", prompt: "旁白" }).prompt, "旁白");
});

test("parameter-confirmed retries preserve the same reference prompt", () => {
  const { resolve } = fixture(mention);
  const input = resolve({ kind: "video", prompt: "施法", duration: 5 });
  assert.equal(resolve(input, { mediaParameterApproval: {} }).prompt, input.prompt);
  assert.match(input.prompt, /@\{node-moyuan:墨渊\}/);
});

test("applied interjections replace or withdraw the original task references", () => {
  const { resolve, state } = fixture(mention);
  state.agentTasks[0].metrics = { interjectionCount: 1 };
  state.messages = [{ role: "user", agentTaskId: "task", conversationId: "conversation", content: "改用 @{new:青鸾} 生成" }];
  assert.equal(resolve({ kind: "video", prompt: "飞舞" }).prompt, "飞舞 @{new:青鸾}");
  state.messages[0].content = "不使用参考图，改为纯文字生成";
  assert.equal(resolve({ kind: "video", prompt: "飞舞" }).prompt, "飞舞");
});

test("pending and unrelated interjections cannot alter the current generation references", () => {
  const { resolve, state } = fixture(mention);
  state.messages = [
    { role: "user", agentTaskId: "task", conversationId: "other", content: "@{foreign:其他会话}" },
    { role: "user", agentTaskId: "task", conversationId: "conversation", content: "@{new:青鸾}" },
    { role: "user", agentTaskId: "task", conversationId: "conversation", content: "@{pending:未应用}" },
  ];
  assert.equal(resolve({ kind: "video", prompt: "飞舞" }).prompt, `飞舞 ${mention}`);
  state.agentTasks[0].metrics = { interjectionCount: 1 };
  assert.equal(resolve({ kind: "video", prompt: "飞舞" }).prompt, "飞舞 @{new:青鸾}");
});
