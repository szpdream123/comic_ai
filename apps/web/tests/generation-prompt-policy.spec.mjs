import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { runInNewContext } from "node:vm";
import { composeGenerationPrompt, formatGenerationPromptCount, resolveGenerationPromptLimit, generationPromptExceedsLimit } from "../src/shared/generation-prompt-policy.js";
import { canSimplifyPrompt } from "../src/features/production-workbench/episode-prompt-simplification.js";
import { renderPromptDock } from "../src/features/production-workbench/episode-workbench-rebuilt.js";

it("budgets the completed image/video prompt including multiline style and unique template prefixes", () => {
  for (const mediaType of ["image", "video"]) {
    for (const unit of ["characters", "bytes"]) {
      const prompt = "猫".repeat(24);
      const context = { mediaType, prefixes: ["模板", "模板"], style: "日系动漫\n保持光向", styleReferenceName: "图2" };
      const model = { mediaType, promptComposition: context, parameterSchema: { prompt: { maxLength: 30, limitUnit: unit } } };
      const final = composeGenerationPrompt(prompt, context);
      assert.equal(composeGenerationPrompt(final, context), final, "generation must not append the style or prefix twice");
      assert.equal(canSimplifyPrompt({ prompt, model, mediaMode: mediaType }), true);
      assert.match(formatGenerationPromptCount(prompt, model), /含系统附加/);
      assert.ok(final.includes("保持光向"));
    }
  }
  const original = "【@一个非常长的角色名称】向前走";
  const model = { mediaType: "video", parameterSchema: { prompt: { maxLength: 12 } },
    promptBudget: { length: 8, additionalLength: 8 - [...original].length } };
  assert.equal(canSimplifyPrompt({ prompt: original, model, mediaMode: "video" }), false);
  assert.match(formatGenerationPromptCount(original, model), /^8 \/ 12/);
  const local = { mediaType: "video", style: "本地风格\n第二行" };
  assert.equal(composeGenerationPrompt("正文", { stages: [local, { mediaType: "video", style: "" }] }), "正文\n视频风格：本地风格\n第二行");
  assert.equal(composeGenerationPrompt("正文", { stages: [local, local] }), "正文\n视频风格：本地风格\n第二行");
});

it("uses the selected model's limit instead of a fixed editor maximum", () => {
  const text = "中".repeat(2900);
  assert.match(formatGenerationPromptCount(text, { parameterSchema: { prompt: { maxLength: 2500 } } }), /2900 \/ 2500.*可使用AI精简或手动修改/);
  assert.doesNotMatch(formatGenerationPromptCount(text, { parameterSchema: { prompt: { maxLength: 5000 } } }), /可使用AI精简/);
  assert.equal(formatGenerationPromptCount("猫😀", {}), "2 字符");
  const configured = { mediaType: "video", parameterSchema: { prompt: { maxLength: 2500 } },
    promptComposition: { mediaType: "video", style: "日系动漫风格，干净线稿，统一角色设计，细腻上色，二次元造型明确" } };
  assert.match(formatGenerationPromptCount("字".repeat(2487), configured), /^2524 \/ 2500 字符（含系统附加 37 字符）/);
  assert.match(formatGenerationPromptCount("字".repeat(2402), configured), /^2439 \/ 2500 字符（含系统附加 37 字符）/);
});

it("uses fallback limits without mixing units and never guesses token counts", () => {
  const byteModel = { parameterSchema: {}, limits: { maxPromptLength: 5, promptLengthUnit: "bytes" } };
  assert.equal(resolveGenerationPromptLimit(byteModel).unit, "bytes");
  assert.equal(generationPromptExceedsLimit("你好", resolveGenerationPromptLimit(byteModel)), true);
  assert.match(formatGenerationPromptCount("a landscape", { parameterSchema: { prompt: { maxLength: 3, limitUnit: "tokens" } } }), /3 tokens（由模型校验）/);
});

it("renders the prompt dock using its effective selected model", () => {
  const html = renderPromptDock({ prompt: "猫".repeat(12), selectedModelId: "image-short", mediaMode: "image",
    generationUiState: {}, generationControls: {},
    episodeGenerationConfig: { models: [{ modelCode: "image-short", modelLabel: "Short", mediaType: "image",
      supportedModes: ["single-image"], parameterSchema: { prompt: { maxLength: 10 } }, pricing: {} }] },
  });
  assert.match(html, /12 \/ 10 字符/);
  assert.match(html, /可使用AI精简或手动修改/);
  assert.match(html, /data-action="simplify-generation-prompt" title="[^"]+">AI 精简提示词<\/button>/);
});

it("updates the live prompt count for the model used after a video mode change", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  const names = [
    "formatWorkbenchPromptCount", "resolveWorkbenchPromptModel", "getPromptSimplificationSnapshot", "resolveConfiguredVideoModelCode", "resolveConfiguredImageModelCode",
    "normalizeLegacyImageModelCode", "findConfiguredGenerationModel", "modelSupportsGenerationMode",
    "generationModeMediaKind", "normalizeGenerationModelMediaKind", "videoCategoryMatchesGenerationMode",
    "normalizeGenerationModeToken",
  ];
  const functions = names.map((name) => {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `${name} should exist`);
    const end = source.indexOf("\n}", start);
    assert.ok(end > start, `${name} should have a body`);
    return source.slice(start, end + 2);
  });
  const { formatLiveCount, snapshot } = runInNewContext(`${functions.join("\n")}\n({formatLiveCount: formatWorkbenchPromptCount, snapshot: getPromptSimplificationSnapshot})`, {
    formatGenerationPromptCount,
    buildVideoGenerationPayload: () => ({}),
    buildImageGenerationPayload: () => ({}),
    isAssetScope: (workbench) => workbench.ui.museScopeMode === "assets",
    getCurrentScopePrompt: (workbench) => workbench.ui.prompt,
    configuredGenerationParametersForModel: () => ({ durationSec: 5 }),
    getCurrentPromptGenerationState: () => ({ firstFrame: { url: "https://example.test/frame.png" }, mentionReferences: [{ name: "角色一" }] }),
    resolveGenerationReferenceUrl: (item) => item?.url,
  });
  const models = [
    { modelCode: "first-frame-short", modelLabel: "Short", mediaType: "video", videoCategory: "first_frame",
      supportedModes: ["first-frame"], parameterSchema: { prompt: { maxLength: 10 } }, pricing: {} },
    { modelCode: "reference-long", modelLabel: "Long", mediaType: "video", videoCategory: "reference",
      supportedModes: ["reference-video"], parameterSchema: { prompt: { maxLength: 100 } }, pricing: {} },
  ];
  const workbench = { ui: { episodeMediaMode: "video", videoGenerationMode: "first-frame",
    selectedModelId: "first-frame-short", episodeGenerationConfig: { models } } };
  const prompt = "猫".repeat(12);
  assert.match(formatLiveCount(workbench, prompt), /12 \/ 10 字符.*可使用AI精简/);

  workbench.ui.videoGenerationMode = "reference-video";
  assert.equal(workbench.ui.selectedModelId, "first-frame-short");
  assert.match(formatLiveCount(workbench, prompt), /12 \/ 100 字符/);
  const html = renderPromptDock({ prompt, selectedModelId: workbench.ui.selectedModelId, mediaMode: "video",
    videoMode: "reference-video", generationUiState: {}, generationControls: {},
    episodeGenerationConfig: workbench.ui.episodeGenerationConfig });
  assert.match(html, /12 \/ 100 字符/);
  workbench.ui.prompt = prompt;
  workbench.ui.selectedEpisodeId = "episode-1";
  workbench.ui.selectedStoryboardId = "shot-1";
  const current = snapshot(workbench);
  assert.equal(current.model.modelCode, "reference-long");
  assert.equal(current.parameters.durationSec, 5);
  assert.equal(current.parameters.mentionReferences[0].name, "角色一");
  assert.equal(current.firstFrameUrl, "https://example.test/frame.png");
  workbench.ui.museScopeMode = "assets";
  workbench.ui.selectedEpisodeAssetId = "shot-1";
  assert.notEqual(snapshot(workbench).scope, current.scope);
});

it("retains configured fallback byte limits in the rendered model", () => {
  const html = renderPromptDock({ prompt: "中文", selectedModelId: "bytes", mediaMode: "image",
    generationUiState: {}, generationControls: {},
    episodeGenerationConfig: { models: [{ modelCode: "bytes", mediaType: "image", supportedModes: ["single-image"],
      limits: { maxPromptLength: 5, promptLengthUnit: "bytes" } }] },
  });
  assert.match(html, /6 \/ 5 字节/);
  assert.match(html, /data-action="simplify-generation-prompt" title="[^"]+">AI 精简提示词/);
});

it("keeps simplification visible above the editor, immediately before image modification", () => {
  for (const mediaMode of ["image", "video"]) {
    for (const prompt of ["", "猫", "猫".repeat(12)]) {
      const html = renderPromptDock({ prompt, mediaMode, selectedModelId: "short",
        videoMode: "reference-video", generationUiState: {}, generationControls: {},
        resultAnnotationTarget: { targetId: "shot-1", imageUrl: "https://example.test/frame.png" },
        episodeGenerationConfig: { models: [{ modelCode: "short", mediaType: mediaMode,
          videoCategory: "reference", supportedModes: [mediaMode === "video" ? "reference-video" : "single-image"],
          parameterSchema: { prompt: { maxLength: 10 } } }] },
      });
      const button = html.match(/<button[^>]*data-action="simplify-generation-prompt"[^>]*>/)?.[0];
      assert.ok(button);
      assert.doesNotMatch(button, /hidden/);
      assert.equal(button.includes("disabled"), prompt.length <= 10);
      assert.ok(html.indexOf('class="episode-prompt-actions-toolbar"') < html.indexOf(button));
      assert.ok(html.indexOf(button) < html.indexOf('data-action="open-result-image-annotation"'));
      assert.ok(html.indexOf('data-action="open-result-image-annotation"') < html.indexOf('data-prompt-editor'));
      assert.doesNotMatch(html, /AI 精简提示词 · 免费/);
      assert.doesNotMatch(html, /data-prompt-simplification-status/);
    }
  }
});

it("shows overflow as a warning toast without leaving a footer message", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  const start = source.indexOf("function blockOverflowPromptSubmission(");
  const fn = source.slice(start, source.indexOf("\n}", start) + 2);
  const toasts = [];
  let synced = 0;
  let overLimit = true;
  const block = runInNewContext(`(${fn})`, {
    getPromptSimplificationSnapshot: () => ({ prompt: "猫", scope: "shot-1" }),
    canSimplifyPrompt: () => overLimit,
    formatWorkbenchPromptCount: () => "2970 / 2500 字符",
    syncPromptSimplificationControls: () => {},
    showWorkbenchToast: (_, message, options) => toasts.push({ message, tone: options.tone }),
    syncWorkbenchToastOnly: () => { synced++; return true; },
  });
  const workbench = { ui: { validationMessage: "" } };
  assert.equal(block(workbench), true);
  assert.equal(workbench.ui.validationMessage, "");
  assert.equal(workbench.promptSimplificationNotice, undefined);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].tone, "warning");
  assert.match(toasts[0].message, /提示词超过当前模型上限/);
  assert.equal(synced, 1);
  overLimit = false;
  assert.equal(block(workbench), false);
  assert.equal(toasts.length, 1);
});

it("routes simplification feedback through toasts and ignores empty notices", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  const start = source.indexOf("function getPromptSimplificationController(");
  const fn = source.slice(start, source.indexOf("\n}", start) + 2);
  const toasts = [];
  let synced = 0;
  const getController = runInNewContext(`(${fn})`, {
    createPromptSimplificationController: (options) => options,
    previewSimplifiedPrompt: () => {},
    getPromptSimplificationSnapshot: () => ({ scope: "shot-1" }),
    syncPromptSimplificationControls: () => {},
    showWorkbenchToast: (_, message, options) => toasts.push({ message, tone: options.tone }),
    syncWorkbenchToastOnly: () => { synced++; return true; },
  });
  const workbench = { ui: {} };
  const controller = getController(workbench);
  controller.notify("精简失败，原稿已保留：请稍后重试");
  controller.notify("已恢复原稿。");
  controller.notify("");
  assert.equal(workbench.promptSimplificationNotice, undefined);
  assert.deepEqual(toasts.map(item => item.tone), ["error", "success"]);
  assert.equal(synced, 2);
});

it("keeps the live simplification entry visible when editing or switching models", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  const start = source.indexOf("function syncPromptSimplificationControls(");
  const fn = source.slice(start, source.indexOf("\n}", start) + 2);
  const button = { hidden: true, disabled: false };
  let overLimit = false;
  const sync = runInNewContext(`(${fn})`, {
    getPromptSimplificationSnapshot: () => ({ scope: "shot-1", prompt: "猫" }),
    canSimplifyPrompt: () => overLimit,
  });
  const workbench = { ui: {}, root: { querySelector: (selector) => selector.includes('"simplify-generation-prompt"') ? button : null },
    promptSimplificationController: { pending: false, observe() {} } };
  sync(workbench);
  assert.equal(button.hidden, false);
  assert.equal(button.disabled, true);
  overLimit = true;
  sync(workbench);
  assert.equal(button.disabled, false);
  workbench.promptSimplificationController.pending = true;
  sync(workbench);
  assert.equal(button.hidden, false);
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, "正在精简…");
});
