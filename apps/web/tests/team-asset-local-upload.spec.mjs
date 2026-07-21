import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderLibraryTeam } from "../src/features/library-team/index.js";
import {
  clearTeamAssetSubmissionToastForTest,
  handleWorkbenchActionForTest,
  handleTeamAssetLocalUploadFiles,
  removeTeamAssetLocalUpload,
  resolveTeamAssetGenerationPollDelayForTest,
  scheduleTeamAssetGenerationPollingForTest,
  uploadAssetGeneratorReferenceImageForTest,
} from "../src/features/production-workbench/index.js";
import { validateTeamAssetLocalUploadFile } from "../src/features/library-team/asset-library-page.js";
import { readFileSync } from "node:fs";

function createRoot() {
  return {
    innerHTML: "",
    querySelector() {
      return null;
    },
  };
}

function createWorkbench(overrides = {}) {
  const uploadCalls = [];
  const generationCalls = [];
  const updateCalls = [];
  const replaceCalls = [];
  const deleteCalls = [];
  const root = createRoot();
  const workbench = {
    root,
    state: {},
    session: { user: { phone: "13800138000" } },
    api: {
      async uploadTeamAsset(file, options = {}) {
        uploadCalls.push({ file, options });
        return {
          asset: {
            id: `team-asset-${uploadCalls.length}`,
            name: options.assetName,
            category: options.category,
            previewUrl: `https://cdn.example.com/team-assets/${options.category}/${file.name}`,
            sourceUrl: `https://cdn.example.com/team-assets/${options.category}/${file.name}`,
            resourceType: file.type?.startsWith("audio/") ? "audio" : "image",
            resourceSize: file.size ?? 0,
          },
        };
      },
      async getLibraryAssets() {
        return {
          categories: [],
          folders: [],
          assets: [],
          entitlement: { hasTeamAssetLibrary: true },
        };
      },
      async listGlobalGenerationConfig() {
        return {
          defaultImageModelCode: "gpt-image-2-cn",
          models: [
            { modelCode: "gpt-image-2-cn", modelLabel: "GPT Image", mediaType: "image", modelKind: "image.reference_image" },
            { modelCode: "retry-image-model", modelLabel: "重试模型", mediaType: "image", modelKind: "image.reference_image" },
          ],
        };
      },
      async createImageGenerationTask(input) {
        generationCalls.push(input);
        return {
          asset: {
            id: input.target?.assetId ?? "generated-team-asset",
            name: input.target?.name,
            category: input.target?.category,
            prompt: input.prompt,
            status: "generating",
          },
          generationStatus: "created",
          generationTaskId: "team-task-1",
          creditBalance: 9700,
        };
      },
      async updateTeamAsset(assetId, input) {
        updateCalls.push({ assetId, input });
        return { asset: { id: assetId, ...input } };
      },
      async replaceTeamAssetFile(assetId, file, input) {
        replaceCalls.push({ assetId, file, input });
        return { asset: { id: assetId, name: input.name } };
      },
      async deleteTeamAsset(assetId) {
        deleteCalls.push(assetId);
        return { deleted: true };
      },
    },
    ui: {
      activeNavTab: "library",
      busy: false,
      toast: "",
      exportHistory: [],
      storyboards: [],
      libraryTeamAssetScope: "team",
      libraryCategory: "character",
      libraryFolder: "",
      libraryQuery: "",
      libraryEntitlement: {
        hasTeamAssetLibrary: true,
      },
      membershipStatus: { status: "professional_active" },
      teamAssetLocalUploads: {
        character: [],
        scene: [],
        prop: [],
        voice: [],
      },
      ...overrides.ui,
    },
  };

  return { workbench, root, uploadCalls, generationCalls, updateCalls, replaceCalls, deleteCalls };
}

describe("team asset local uploads", () => {
  it("keeps only supported team asset categories", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "team",
      membershipStatus: { status: "professional_active" },
      libraryCategory: "character",
      libraryEntitlement: { hasTeamAssetLibrary: true },
      teamAssetLocalUploads: { character: [], scene: [], prop: [], voice: [] },
    });

    for (const category of ["character", "scene", "prop", "voice"]) {
      assert.match(html, new RegExp(`data-library-category="${category}"`));
    }
    for (const category of ["style", "topic", "storyboard", "videoEffect", "novelScript", "splitStoryboard", "api"]) {
      assert.doesNotMatch(html, new RegExp(`data-library-category="${category}"`));
    }
  });

  it("renders the project-style team workbench with creation and generation states", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "team",
      membershipStatus: { status: "professional_active" },
      libraryCategory: "character",
      libraryEntitlement: { hasTeamAssetLibrary: true },
      teamAssetLocalUploads: {
        character: [
          { id: "generating", name: "生成中角色", category: "character", status: "generating", prompt: "生成提示词" },
          { id: "failed", name: "失败角色", category: "character", status: "failed", prompt: "失败提示词" },
        ],
      },
    });

    assert.match(html, /project-asset-library team-asset-workbench/);
    assert.match(html, /official-library-page team-library-scope/);
    assert.match(html, /data-action="open-team-asset-generator-modal"/);
    assert.match(html, /data-action="pick-team-asset-local-upload"/);
    assert.doesNotMatch(html, /class="team-asset-local-upload-input"/);
    assert.match(html, /asset-search-input/);
    assert.match(html, /生成中角色/);
    assert.match(html, /生成失败/);
  });

  it("opens the team image import intake before selecting files", async () => {
    const { workbench, uploadCalls } = createWorkbench({
      ui: { libraryCategory: "prop" },
    });

    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "pick-team-asset-local-upload", libraryCategory: "prop" },
    });

    assert.equal(uploadCalls.length, 0);
    assert.equal(workbench.ui.assetImportModal, "prop");
    assert.equal(workbench.ui.assetImportModalSource, "team");
    assert.equal(workbench.ui.assetImportModalTab, "local");
    assert.match(workbench.root.innerHTML, /aria-label="import-asset-dialog"/);
    assert.match(workbench.root.innerHTML, /data-dropzone="asset-import"/);
    assert.match(workbench.root.innerHTML, /点击或直接拖拽道具图片上传/);
  });

  it("centers the import review checkmark inside a stable control", () => {
    const css = readFileSync(
      new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
      "utf8",
    );
    const block = [...css.matchAll(/\.asset-import-review-check\s*\{(?<body>[^}]*)\}/g)]
      .find((match) => /display:\s*grid/.test(match.groups?.body ?? ""))?.groups?.body ?? "";

    assert.match(block, /display:\s*grid/);
    assert.match(block, /place-items:\s*center/);
    assert.match(block, /justify-self:\s*center/);
    assert.match(block, /padding:\s*0/);
    assert.match(block, /line-height:\s*1/);
  });

  it("opens uploaded and generated image cards through the same edit action", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "team",
      membershipStatus: { status: "professional_active" },
      libraryCategory: "character",
      libraryEntitlement: { hasTeamAssetLibrary: true },
      teamAssetLocalUploads: {
        character: [
          { id: "uploaded", name: "上传角色", category: "character", status: "active", previewUrl: "https://cdn.example.com/uploaded.png" },
          { id: "generated", name: "生成角色", category: "character", status: "active", previewUrl: "https://cdn.example.com/generated.png", generationTaskId: "task-generated" },
        ],
      },
    });

    assert.match(html, /<article class="imported-asset-card[^>]+data-action="edit-team-asset"[^>]+data-asset-id="uploaded"/);
    assert.match(html, /<article class="imported-asset-card[^>]+data-action="edit-team-asset"[^>]+data-asset-id="generated"/);
    assert.doesNotMatch(html, /data-action="open-team-generated-asset"/);
  });

  it("matches the project audio library layout for team voice assets", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "team",
      membershipStatus: { status: "professional_active" },
      libraryCategory: "voice",
      libraryEntitlement: { hasTeamAssetLibrary: true },
      teamAssetLocalUploads: {
        character: [],
        scene: [],
        prop: [],
        voice: [{ id: "voice-1", name: "女骑士", category: "voice", sourceUrl: "https://cdn.example.com/voice.wav" }],
      },
    });

    assert.match(html, /other-asset-library team-audio-asset-library/);
    assert.match(html, /seedance-import-card/);
    assert.match(html, /导入音频素材/);
    assert.match(html, /other-imported-card audio/);
    assert.match(html, /project-audio-avatar/);
    assert.match(html, /project-audio-play-button/);
    assert.match(html, /data-action="preview-project-audio-asset"/);
    assert.match(html, /class="team-asset-local-upload-input"/);
    assert.doesNotMatch(html, /<audio[^>]+controls/);
    assert.doesNotMatch(html, />导入音色</);
  });

  it("edits team voice assets with the project audio form", async () => {
    const { workbench, updateCalls, replaceCalls } = createWorkbench({
      ui: {
        libraryCategory: "voice",
        libraryAssets: [{
          id: "team-voice",
          name: "女骑士",
          category: "voice",
          resourceType: "audio",
          sourceUrl: "https://cdn.example.com/team-voice.wav",
          previewUrl: "https://cdn.example.com/team-voice.wav",
        }],
      },
    });

    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "edit-team-asset", assetId: "team-voice", assetKind: "voice", mediaType: "audio" },
    });

    assert.equal(workbench.ui.audioAssetImportDraft?.scope, "team");
    assert.equal(workbench.ui.audioAssetImportDraft?.assetId, "team-voice");
    assert.match(workbench.root.innerHTML, /aria-label="audio-import-dialog"/);
    assert.match(workbench.root.innerHTML, /配音员名称/);
    assert.match(workbench.root.innerHTML, /配音文件/);
    assert.match(workbench.root.innerHTML, /配音员示例图/);
    assert.match(workbench.root.innerHTML, /重新上传配音/);

    workbench.ui.audioAssetImportDraft.name = "女骑士新版";
    await handleWorkbenchActionForTest(workbench, { dataset: { action: "confirm-audio-asset-import" } });
    assert.deepEqual(updateCalls, [{ assetId: "team-voice", input: { name: "女骑士新版" } }]);
    assert.deepEqual(replaceCalls, []);
  });

  it("replaces team voice files through the team upload api", async () => {
    const { workbench, updateCalls, replaceCalls } = createWorkbench({
      ui: {
        libraryCategory: "voice",
        libraryAssets: [{
          id: "team-voice",
          name: "女骑士",
          category: "voice",
          resourceType: "audio",
          sourceUrl: "https://cdn.example.com/team-voice.wav",
        }],
      },
    });
    const file = new File([new Uint8Array([1, 2, 3])], "new-voice.wav", { type: "audio/wav" });

    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "edit-team-asset", assetId: "team-voice", assetKind: "voice", mediaType: "audio" },
    });
    workbench.ui.audioAssetImportDraft = {
      ...workbench.ui.audioAssetImportDraft,
      name: "女骑士新版",
      audioFile: file,
      audioUpload: { previewUrl: "blob:team-voice", mimeType: "audio/wav" },
    };
    await handleWorkbenchActionForTest(workbench, { dataset: { action: "confirm-audio-asset-import" } });

    assert.deepEqual(updateCalls, []);
    assert.equal(replaceCalls.length, 1);
    assert.equal(replaceCalls[0].assetId, "team-voice");
    assert.equal(replaceCalls[0].file, file);
    assert.deepEqual(replaceCalls[0].input, { name: "女骑士新版" });
  });

  it("allocates the remaining library viewport to the team page", () => {
    const css = readFileSync(new URL("../src/features/library-team/library-team.css", import.meta.url), "utf8");
    const rule = css.match(/\.library-panel-scroll:has\(> \.team-library-scope\)\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

    assert.match(rule, /grid-template-rows:\s*minmax\(0, 1fr\) auto/);
    assert.match(rule, /overflow:\s*hidden/);
  });

  it("opens and submits the generator in team scope", async () => {
    const { workbench, generationCalls } = createWorkbench();

    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "open-team-asset-generator-modal", assetKind: "character" },
    });
    assert.equal(workbench.ui.assetGeneratorTarget, "team");
    assert.equal(workbench.ui.assetGeneratorModal, "character");

    workbench.ui.assetGeneratorName = "生成角色";
    workbench.ui.assetGeneratorPrompt = "银发剑士";
    workbench.ui.assetGeneratorModelCode = "gpt-image-2-cn";
    const previousWindow = globalThis.window;
    try {
      globalThis.window = {
        location: {
          protocol: "http:",
          host: "127.0.0.1:3000",
          port: "3000",
          origin: "http://127.0.0.1:3000",
        },
      };
      await handleWorkbenchActionForTest(workbench, {
        dataset: { action: "submit-asset-generator" },
      });
    } finally {
      globalThis.window = previousWindow;
    }

    assert.equal(generationCalls.length, 1, workbench.ui.toast);
    assert.equal(generationCalls[0].target.category, "character");
    assert.equal(generationCalls[0].target.name, "生成角色");
    assert.equal(generationCalls[0].prompt, "银发剑士");
    assert.deepEqual(generationCalls[0].parameters.quickReferences, []);
    assert.equal(generationCalls[0].parameters.imageReference, null);
    assert.equal(Object.hasOwn(generationCalls[0].parameters, "filePaths"), false);
    assert.equal(Object.hasOwn(generationCalls[0], "projectId"), false);
    assert.equal(workbench.ui.creditBalance, 9700);
    assert.equal(workbench.ui.assetGeneratorModal, null);
    assert.equal(workbench.ui.assetGeneratorTarget, null);
  });

  it("uploads edited team asset references to cloud storage before generation", async () => {
    const { workbench, generationCalls } = createWorkbench({
      ui: {
        assetGeneratorTarget: "team",
        assetGeneratorMode: "edit",
        assetGeneratorModal: "prop",
        assetGeneratorName: "手臂",
        assetGeneratorPrompt: "背景改为灰色",
        assetGeneratorModelCode: "gpt-image-2-cn",
        assetGeneratorEditingAsset: {
          id: "team-prop-1",
          name: "手臂",
          generationStatus: "failed",
          generationResult: {
            status: "failed",
            taskId: "team-prop-task-1",
            prompt: "背景改为灰色",
            model: "gpt-image-2-cn",
            parameters: {},
          },
        },
      },
    });
    const uploadCalls = [];
    workbench.api.uploadFile = async (file, options) => {
      uploadCalls.push({ file, options });
      return {
        upload: {
          storageObjectId: "storage-reference-1",
          storageObjectKey: "asset-generator/cloud-reference.png",
          mimeType: "image/png",
          previewUrl: "https://cdn.example.com/asset-generator/cloud-reference.png",
          publicUrl: "https://cdn.example.com/asset-generator/cloud-reference.png",
        },
      };
    };
    const file = new File([new Uint8Array([1, 2, 3])], "cloud-reference.png", { type: "image/png" });

    await uploadAssetGeneratorReferenceImageForTest(workbench, file);

    assert.equal(uploadCalls.length, 1);
    assert.equal(uploadCalls[0].options.category, "asset-generator");
    assert.equal(workbench.ui.assetGeneratorPreviewUrl, "https://cdn.example.com/asset-generator/cloud-reference.png");
    assert.equal(workbench.ui.assetGeneratorPreviewFile.file, file);
    assert.doesNotMatch(workbench.ui.assetGeneratorPreviewUrl, /^blob:/);

    await handleWorkbenchActionForTest(workbench, { dataset: { action: "regenerate-asset-generator" } });
    assert.equal(generationCalls.length, 1);
    const serializedParameters = JSON.stringify(generationCalls[0].parameters);
    assert.match(serializedParameters, /https:\/\/cdn\.example\.com\/asset-generator\/cloud-reference\.png/);
    assert.doesNotMatch(serializedParameters, /blob:/);
  });

  it("opens a task overview for generating team assets", async () => {
    const { workbench } = createWorkbench({
      ui: {
        libraryAssets: [{
          id: "team-generating",
          name: "生成中角色",
          prompt: "生成描述",
          category: "character",
          status: "generating",
          generationStatus: "submitted",
          generationTaskId: "team-task-123",
          generationResult: { status: "submitted", taskId: "team-task-123" },
        }],
      },
    });

    const libraryHtml = renderLibraryTeam({
      route: "assets",
      assetScope: "team",
      membershipStatus: { status: "professional_active" },
      libraryCategory: "character",
      libraryEntitlement: { hasTeamAssetLibrary: true },
      teamAssetLocalUploads: { character: workbench.ui.libraryAssets, scene: [], prop: [], voice: [] },
    });
    assert.match(libraryHtml, /data-action="edit-team-asset"/);

    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "edit-team-asset", assetId: "team-generating", assetKind: "character" },
    });

    assert.match(workbench.root.innerHTML, /aria-label="任务概览"/);
    assert.match(workbench.root.innerHTML, /team-task-123/);
    assert.match(workbench.root.innerHTML, /图片生成中/);
  });

  it("renders the generated image when reopening a completed team asset", async () => {
    const resultUrl = "https://cdn.example.com/team-assets/completed-prop.png";
    const { workbench } = createWorkbench({
      ui: {
        libraryCategory: "prop",
        libraryAssets: [{
          id: "team-completed",
          name: "已完成道具",
          prompt: "灰色背景",
          category: "prop",
          status: "active",
          previewUrl: resultUrl,
          sourceUrl: resultUrl,
          generationStatus: "completed",
          generationTaskId: "team-task-completed",
          generationResult: { status: "completed", taskId: "team-task-completed" },
        }],
      },
    });

    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "open-team-generated-asset", assetId: "team-completed", assetKind: "prop" },
    });

    assert.match(workbench.root.innerHTML, /alt="任务返回图片"/);
    assert.match(workbench.root.innerHTML, /https:\/\/cdn\.example\.com\/team-assets\/completed-prop\.png/);
    assert.doesNotMatch(workbench.root.innerHTML, /图片生成中/);
  });

  it("updates an open team asset task overview with the image when polling completes", async () => {
    const previousWindow = globalThis.window;
    const timers = [];
    globalThis.window = {
      setTimeout(callback, delayMs) {
        timers.push({ callback, delayMs });
        return `team-completed-timer-${timers.length}`;
      },
      clearTimeout() {},
    };
    const taskId = "5c3a3fcb-fad5-49a1-8928-18b6c00a09e5";
    const assetId = "2f0b8bcb-a735-44bf-9cc8-65f81ea0c337";
    const resultUrl = "https://cdn.example.com/team-assets/generated-prop.png";
    const runningAsset = {
      id: assetId,
      name: "手臂",
      prompt: "背景改为灰色",
      category: "prop",
      status: "generating",
      generationStatus: "running",
      generationTaskId: taskId,
      generationResult: { status: "running", taskId, prompt: "背景改为灰色", parameters: {} },
    };
    const completedTask = {
      taskId,
      targetType: "team_asset",
      targetId: assetId,
      assetId,
      status: "completed",
      workflowStatus: "completed",
      fixedImages: [{ id: taskId, url: resultUrl, src: resultUrl, previewUrl: resultUrl }],
      resultAssets: [{ mediaKind: "image", previewUrl: resultUrl, sourceUrl: resultUrl }],
      result: { mediaKind: "image", imageUrl: resultUrl },
    };
    const { workbench } = createWorkbench({
      ui: { libraryCategory: "prop", libraryAssets: [runningAsset] },
    });
    workbench.api.listTaskCenterTasks = async (input) => ({
      items: (input.taskIds ?? []).includes(taskId) ? [completedTask] : [],
    });
    workbench.api.getLibraryAssets = async () => ({
      categories: [],
      folders: [],
      assets: [{
        ...runningAsset,
        status: "active",
        previewUrl: resultUrl,
        sourceUrl: resultUrl,
        generationStatus: "completed",
        generationResult: completedTask,
      }],
      entitlement: { hasTeamAssetLibrary: true },
    });

    try {
      await handleWorkbenchActionForTest(workbench, {
        dataset: { action: "open-team-generated-asset", assetId, assetKind: "prop" },
      });
      assert.equal(timers[0]?.delayMs, 0);
      await timers[0].callback();

      assert.equal(workbench.ui.assetGeneratorEditingAsset.generationStatus, "completed");
      assert.equal(workbench.ui.assetGeneratorEditingAsset.generationResult.fixedImages[0].url, resultUrl);
      assert.match(workbench.root.innerHTML, /alt="任务返回图片"/);
      assert.match(workbench.root.innerHTML, /https:\/\/cdn\.example\.com\/team-assets\/generated-prop\.png/);
      assert.doesNotMatch(workbench.root.innerHTML, /图片生成中/);
    } finally {
      globalThis.window = previousWindow;
    }
  });

  it("resumes team asset polling from a generating library card after the modal closes", async () => {
    const previousWindow = globalThis.window;
    const timers = [];
    globalThis.window = {
      setTimeout(callback, delayMs) {
        timers.push({ callback, delayMs });
        return `team-library-timer-${timers.length}`;
      },
      clearTimeout() {},
    };
    const taskId = "5c3a3fcb-fad5-49a1-8928-18b6c00a09e5";
    const assetId = "2f0b8bcb-a735-44bf-9cc8-65f81ea0c337";
    const resultUrl = "https://cdn.example.com/team-assets/generated-character.png";
    const runningAsset = {
      id: assetId,
      name: "生成角色",
      prompt: "银发剑士",
      category: "character",
      status: "generating",
      generationStatus: "running",
      generationTaskId: taskId,
      generationResult: { status: "running", taskId },
    };
    const completedTask = {
      taskId,
      targetType: "team_asset",
      targetId: assetId,
      status: "completed",
      workflowStatus: "completed",
      result: { mediaKind: "image", imageUrl: resultUrl },
      fixedImages: [{ id: taskId, url: resultUrl, src: resultUrl }],
    };
    const { workbench } = createWorkbench({
      ui: {
        libraryCategory: "character",
        assetGeneratorTarget: null,
        assetGeneratorEditingAsset: null,
        libraryAssets: [runningAsset],
      },
    });
    workbench.api.listTaskCenterTasks = async () => ({ items: [completedTask] });
    workbench.api.getLibraryAssets = async () => ({
      categories: [],
      folders: [],
      assets: [{
        ...runningAsset,
        status: "active",
        previewUrl: resultUrl,
        sourceUrl: resultUrl,
        generationStatus: "completed",
        generationResult: completedTask,
      }],
      entitlement: { hasTeamAssetLibrary: true },
    });

    try {
      scheduleTeamAssetGenerationPollingForTest(workbench, { immediate: true });
      assert.equal(timers[0]?.delayMs, 0);
      await timers[0].callback();

      assert.equal(workbench.ui.libraryAssets[0]?.status, "active");
      assert.equal(workbench.ui.libraryAssets[0]?.generationStatus, "completed");
      assert.equal(workbench.ui.libraryAssets[0]?.previewUrl, resultUrl);
    } finally {
      globalThis.window = previousWindow;
    }
  });

  it("updates an open team asset task overview when polling returns failed", async () => {
    const previousWindow = globalThis.window;
    const timers = [];
    globalThis.window = {
      setTimeout(callback, delayMs) {
        timers.push({ callback, delayMs });
        return `team-failed-timer-${timers.length}`;
      },
      clearTimeout() {},
    };
    const taskId = "b96ac28b-02c3-4ffb-8339-3072dec44e54";
    const assetId = "2f0b8bcb-a735-44bf-9cc8-65f81ea0c337";
    const runningAsset = {
      id: assetId,
      name: "手臂",
      prompt: "背景改为灰色",
      category: "prop",
      status: "generating",
      generationStatus: "running",
      generationTaskId: taskId,
      generationResult: {
        status: "running",
        taskId,
        prompt: "背景改为灰色",
        parameters: {},
      },
    };
    const { workbench } = createWorkbench({
      ui: {
        libraryCategory: "prop",
        libraryAssets: [runningAsset],
      },
    });
    const listCalls = [];
    workbench.api.listTaskCenterTasks = async (input) => {
      listCalls.push(input);
      if (!(input.taskIds ?? []).includes(taskId)) {
        return { items: [] };
      }
      return {
        items: [{
          taskId,
          targetType: "team_asset",
          targetId: assetId,
          assetId,
          status: "failed",
          workflowStatus: "failed",
          failureCode: "cumob_image_400",
          failure: { displayMessage: "模型服务拒绝了请求，请检查参考素材。" },
        }],
      };
    };
    workbench.api.getLibraryAssets = async () => ({
      categories: [],
      folders: [],
      assets: [{
        ...runningAsset,
        status: "failed",
        generationStatus: "failed",
        generationResult: { status: "failed", taskId, failureCode: "cumob_image_400" },
      }],
      entitlement: { hasTeamAssetLibrary: true },
    });

    try {
      await handleWorkbenchActionForTest(workbench, {
        dataset: { action: "open-team-generated-asset", assetId, assetKind: "prop" },
      });
      assert.equal(timers[0]?.delayMs, 0);
      await timers[0].callback();

      assert.deepEqual(listCalls[0].taskIds, [taskId]);
      assert.equal(workbench.ui.assetGeneratorEditingAsset.generationStatus, "failed");
      assert.equal(workbench.ui.assetGeneratorEditingAsset.generationResult.failureCode, "cumob_image_400");
      assert.match(workbench.root.innerHTML, /生成失败/);
      assert.doesNotMatch(workbench.root.innerHTML, /图片生成中/);
    } finally {
      globalThis.window = previousWindow;
    }
  });

  it("clears the one-time team generation toast before polling rerenders", () => {
    const { workbench } = createWorkbench();
    workbench.ui.toast = "团队资产重新生成已提交。";

    clearTeamAssetSubmissionToastForTest(workbench);

    assert.equal(workbench.ui.toast, "");
  });

  it("polls team asset rows without requesting project generation tasks", async () => {
    let generationTaskCalls = 0;
    const { workbench } = createWorkbench({
      ui: {
        libraryAssets: [{
          id: "team-generating",
          status: "generating",
          generationTaskId: "provider-request-id",
        }],
      },
    });
    workbench.api.getGenerationTask = async () => {
      generationTaskCalls += 1;
      throw new Error("resource_not_found");
    };

    scheduleTeamAssetGenerationPollingForTest(workbench, { immediate: true });
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(generationTaskCalls, 0);
  });

  it("backs off team asset polling after the first minute", () => {
    const startedAt = 1_000_000;

    assert.equal(resolveTeamAssetGenerationPollDelayForTest(startedAt, false, startedAt), 15_000);
    assert.equal(resolveTeamAssetGenerationPollDelayForTest(startedAt, false, startedAt + 59_999), 15_000);
    assert.equal(resolveTeamAssetGenerationPollDelayForTest(startedAt, false, startedAt + 60_000), 30_000);
    assert.equal(resolveTeamAssetGenerationPollDelayForTest(startedAt, true, startedAt + 60_000), 0);
  });

  it("restores failed generation inputs and retries the same team asset with a selected model", async () => {
    const referenceUrl = "https://cdn.example.com/references/failed-hero.png";
    const { workbench, generationCalls } = createWorkbench({
      ui: {
        libraryAssets: [{
          id: "team-failed",
          name: "失败角色",
          prompt: "资产描述",
          category: "character",
          status: "failed",
          generationStatus: "failed",
          generationTaskId: "team-task-failed",
          generationResult: {
            status: "failed",
            taskId: "team-task-failed",
            prompt: "上次失败提示词",
            model: "gpt-image-2-cn",
            parameters: {
              aspectRatio: "16:9",
              quality: "2K",
              referenceImages: [{ kind: "image", url: referenceUrl, mimeType: "image/png" }],
            },
          },
        }],
      },
    });

    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "open-team-generated-asset", assetId: "team-failed", assetKind: "character" },
    });

    assert.equal(workbench.ui.assetGeneratorPrompt, "上次失败提示词");
    assert.equal(workbench.ui.assetGeneratorPreviewUrl, referenceUrl);
    assert.equal(workbench.ui.assetGeneratorModelCode, "gpt-image-2-cn");
    assert.match(workbench.root.innerHTML, /asset-generator-task-retry-form/);
    assert.match(workbench.root.innerHTML, /asset-generator-retry-prompt-input/);
    assert.match(workbench.root.innerHTML, /上次失败提示词/);
    assert.match(workbench.root.innerHTML, /failed-hero\.png/);
    assert.match(workbench.root.innerHTML, /输入提示词/);
    assert.match(workbench.root.innerHTML, /data-field="image-settings-panel"/);
    assert.match(workbench.root.innerHTML, /data-action="toggle-generation-select-menu"/);
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "toggle-generation-select-menu", field: "model", scope: "asset-generator" },
    });
    assert.match(workbench.root.innerHTML, /data-action="select-asset-generator-model"/);
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "select-asset-generator-model", value: "retry-image-model" },
    });
    await handleWorkbenchActionForTest(workbench, { dataset: { action: "regenerate-asset-generator" } });

    assert.equal(generationCalls.length, 1, workbench.ui.toast);
    assert.equal(generationCalls[0].target.assetId, "team-failed");
    assert.equal(generationCalls[0].prompt, "上次失败提示词");
    assert.equal(generationCalls[0].model, "retry-image-model");
    assert.equal(workbench.ui.assetGeneratorModal, "character");
    assert.equal(workbench.ui.assetGeneratorEditingAsset.id, "team-failed");
    assert.equal(workbench.ui.assetGeneratorEditingAsset.status, "generating");
    assert.match(workbench.root.innerHTML, /team-task-1/);
  });

  it("opens the team asset action menu without deleting", async () => {
    const { workbench, deleteCalls } = createWorkbench({
      ui: {
        libraryAssets: [{ id: "team-hero", name: "团队主角", category: "character", status: "active", previewUrl: "https://cdn.example.com/hero.png" }],
      },
    });

    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "toggle-team-asset-card-menu", assetMenuId: "team-asset-menu-team-hero" },
    });

    assert.equal(workbench.ui.assetCardMenuId, "team-asset-menu-team-hero");
    assert.deepEqual(deleteCalls, []);
    assert.match(workbench.root.innerHTML, /data-action="edit-team-asset"/);
    assert.match(workbench.root.innerHTML, /data-action="rename-team-asset"/);
  });

  it("renames team assets through the team update api", async () => {
    const { workbench, updateCalls } = createWorkbench({
      ui: {
        libraryAssets: [{ id: "team-hero", name: "团队主角", category: "character", status: "active" }],
      },
    });

    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "rename-team-asset", assetId: "team-hero", assetKind: "character", mediaType: "image" },
    });
    assert.match(workbench.root.innerHTML, /aria-label="重命名素材"/);
    assert.match(workbench.root.innerHTML, /id="asset-rename-name-input"/);
    workbench.ui.renameImportedAssetName = "新团队主角";
    await handleWorkbenchActionForTest(workbench, { dataset: { action: "confirm-rename-imported-asset" } });

    assert.deepEqual(updateCalls, [{ assetId: "team-hero", input: { name: "新团队主角" } }]);
    assert.equal(workbench.ui.renameImportedAsset, null);
  });

  it("edits team asset names and prompts through the team update api", async () => {
    const { workbench, updateCalls } = createWorkbench({
      ui: {
        libraryAssets: [{
          id: "team-hero",
          name: "团队主角",
          prompt: "旧描述",
          category: "character",
          status: "active",
          previewUrl: "https://cdn.example.com/hero.png",
        }],
      },
    });

    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "edit-team-asset", assetId: "team-hero", assetKind: "character", mediaType: "image" },
    });
    assert.equal(workbench.ui.assetGeneratorTarget, "team");
    assert.equal(workbench.ui.assetGeneratorMode, "edit");
    assert.equal(workbench.ui.assetGeneratorPrompt, "旧描述");
    assert.match(workbench.root.innerHTML, /aria-label="编辑角色"/);
    assert.match(workbench.root.innerHTML, /id="asset-generator-name-input"/);
    assert.match(workbench.root.innerHTML, /https:\/\/cdn\.example\.com\/hero\.png/);
    assert.doesNotMatch(workbench.root.innerHTML, /aria-label="任务概览"/);

    workbench.ui.assetGeneratorName = "编辑团队主角";
    workbench.ui.assetGeneratorPrompt = "新描述";
    await handleWorkbenchActionForTest(workbench, { dataset: { action: "submit-asset-generator" } });

    assert.deepEqual(updateCalls, [{ assetId: "team-hero", input: { name: "编辑团队主角", prompt: "新描述" } }]);
    assert.equal(workbench.ui.assetGeneratorModal, null);
  });

  it("requires confirmation before deleting a team asset", async () => {
    const { workbench, deleteCalls } = createWorkbench({
      ui: {
        libraryAssets: [{ id: "team-hero", name: "团队主角", category: "character", status: "active" }],
      },
    });

    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "delete-team-asset", assetId: "team-hero", assetKind: "character", mediaType: "image" },
    });
    assert.deepEqual(deleteCalls, []);
    assert.equal(workbench.ui.deleteImportedAsset?.scope, "team");

    await handleWorkbenchActionForTest(workbench, { dataset: { action: "confirm-delete-imported-asset" } });
    assert.deepEqual(deleteCalls, ["team-hero"]);
    assert.equal(workbench.ui.deleteImportedAsset, null);
  });

  it("reviews and confirms multiple team image uploads together", async () => {
    const globals = globalThis;
    const originalFileReader = globals.FileReader;
    const originalWindow = globals.window;
    const originalDocument = globals.document;

    class TestFileReader {
      result = "";
      error = null;
      onload = null;
      onerror = null;

      readAsDataURL(file) {
        this.result = `data:${file.type || "application/octet-stream"};base64,cHJldmlldw==`;
        queueMicrotask(() => this.onload?.());
      }
    }

    globals.FileReader = TestFileReader;
    globals.window = { scrollX: 0, scrollY: 0 };
    globals.document = {
      scrollingElement: { scrollLeft: 0, scrollTop: 0 },
      documentElement: { scrollLeft: 0, scrollTop: 0 },
      querySelector() {
        return null;
      },
      createElement() {
        return { setAttribute() {} };
      },
      head: { appendChild() {} },
    };

    try {
      const { workbench, root, uploadCalls } = createWorkbench();

      await handleTeamAssetLocalUploadFiles(workbench, "character", [
        { name: "hero.png", type: "image/png", size: 1536, lastModified: 1 },
        { name: "hero-side.jpg", type: "image/jpeg", size: 2048, lastModified: 2 },
        { name: "hero-back.webp", type: "image/webp", size: 3072, lastModified: 3 },
      ]);

      assert.equal(uploadCalls.length, 0);
      assert.equal(workbench.ui.assetImportDrafts.length, 3);
      assert.equal(workbench.ui.assetImportSelection.length, 3);
      assert.match(root.innerHTML, /aria-label="import-asset-dialog"/);
      assert.match(root.innerHTML, /本次已选择 3 个/);
      assert.match(root.innerHTML, /hero-side/);
      assert.match(root.innerHTML, /确认上传/);
      assert.doesNotMatch(root.innerHTML, /导入并保存为主体/);

      workbench.ui.assetImportDrafts[0].name = "团队主角";
      workbench.ui.assetImportDrafts[0].description = "红色披风的青年英雄";
      await handleWorkbenchActionForTest(workbench, { dataset: { action: "confirm-asset-import" } });

      assert.equal(uploadCalls.length, 3);
      assert.equal(uploadCalls[0].options.category, "character");
      assert.equal(uploadCalls[0].options.assetName, "团队主角");
      assert.equal(uploadCalls[0].options.assetPrompt, "红色披风的青年英雄");
      assert.equal(uploadCalls[1].options.assetName, "hero-side");
      assert.equal(workbench.ui.assetImportModal, null);
      assert.deepEqual(workbench.ui.teamAssetLocalUploads.character, []);
      assert.doesNotMatch(root.innerHTML, /本地上传，待同步/);
      assert.doesNotMatch(root.innerHTML, /已同步到团队云端/);
      assert.doesNotMatch(root.innerHTML, /library-team-local-upload-status/);
    } finally {
      if (originalFileReader) {
        globals.FileReader = originalFileReader;
      } else {
        delete globals.FileReader;
      }
      if (originalWindow) {
        globals.window = originalWindow;
      } else {
        delete globals.window;
      }
      if (originalDocument) {
        globals.document = originalDocument;
      } else {
        delete globals.document;
      }
    }
  });

  it("blocks duplicate team asset names within the same upload batch", async () => {
    const { workbench, uploadCalls } = createWorkbench({
      ui: {
        assetImportModal: "character",
        assetImportModalSource: "team",
        assetImportModalTab: "local",
        assetImportSelection: ["draft-1", "draft-2"],
        assetImportDrafts: [
          { id: "draft-1", name: "Hero", file: new File(["a"], "hero.png", { type: "image/png" }) },
          { id: "draft-2", name: " hero ", file: new File(["b"], "hero-2.png", { type: "image/png" }) },
        ],
      },
    });

    await handleWorkbenchActionForTest(workbench, { dataset: { action: "confirm-asset-import" } });

    assert.equal(uploadCalls.length, 0);
    assert.equal(workbench.ui.toast, "导入列表中存在重复名称“hero”，请修改后再导入。");
    assert.equal(workbench.ui.assetImportModal, "character");
  });

  it("blocks a team upload whose name already exists in the current category", async () => {
    const { workbench, uploadCalls } = createWorkbench({
      ui: {
        libraryAssets: [
          { id: "existing-character", name: "团队主角", category: "character", status: "active" },
          { id: "existing-scene", name: "团队主角", category: "scene", status: "active" },
        ],
        assetImportModal: "character",
        assetImportModalSource: "team",
        assetImportModalTab: "local",
        assetImportSelection: ["draft-1"],
        assetImportDrafts: [
          { id: "draft-1", name: " 团队主角 ", file: new File(["a"], "hero.png", { type: "image/png" }) },
        ],
      },
    });

    await handleWorkbenchActionForTest(workbench, { dataset: { action: "confirm-asset-import" } });

    assert.equal(uploadCalls.length, 0);
    assert.equal(workbench.ui.toast, "资产名称“团队主角”已存在，请修改后再导入。");
    assert.equal(workbench.ui.assetImportModal, "character");
  });

  it("keeps only failed team image drafts open for retry", async () => {
    const { workbench, uploadCalls } = createWorkbench();
    const uploadTeamAsset = workbench.api.uploadTeamAsset;
    workbench.api.uploadTeamAsset = async (file, options) => {
      if (file.name === "retry.png") {
        throw new Error("temporary_upload_failure");
      }
      return uploadTeamAsset(file, options);
    };
    const readyFile = new File([new Uint8Array([1])], "ready.png", { type: "image/png" });
    const retryFile = new File([new Uint8Array([2])], "retry.png", { type: "image/png" });

    await handleTeamAssetLocalUploadFiles(workbench, "scene", [readyFile, retryFile]);
    await handleWorkbenchActionForTest(workbench, { dataset: { action: "confirm-asset-import" } });

    assert.equal(uploadCalls.length, 1);
    assert.equal(workbench.ui.assetImportModal, "scene");
    assert.equal(workbench.ui.assetImportDrafts.length, 1);
    assert.equal(workbench.ui.assetImportDrafts[0].fileName, "retry.png");
    assert.match(workbench.root.innerHTML, /本次已选择 1 个/);
    assert.match(String(workbench.ui.toast), /1 个上传失败/);

    workbench.api.uploadTeamAsset = uploadTeamAsset;
    await handleWorkbenchActionForTest(workbench, { dataset: { action: "confirm-asset-import" } });

    assert.equal(uploadCalls.length, 2);
    assert.equal(workbench.ui.assetImportModal, null);
  });

  it("keeps an uploaded team voice visible after refreshing the cloud library", async () => {
    const urlApi = globalThis.URL;
    const originalCreateObjectURL = urlApi.createObjectURL;
    urlApi.createObjectURL = () => "blob:http://localhost/team-voice";

    try {
      const { workbench, root, uploadCalls } = createWorkbench({
        ui: {
          libraryCategory: "voice",
        },
      });
      const libraryCalls = [];
      workbench.api.getLibraryAssets = async (input) => {
        libraryCalls.push(input);
        return {
          categories: [{ id: "voice", label: "音色" }],
          folders: [],
          assets: [{
            id: "team-asset-1",
            name: "narrator",
            category: "voice",
            previewUrl: "https://cdn.example.com/team-assets/voice/narrator.mp3",
            sourceUrl: "https://cdn.example.com/team-assets/voice/narrator.mp3",
            resourceType: "audio",
            resourceSize: 2048,
          }],
          entitlement: { hasTeamAssetLibrary: true },
        };
      };

      await handleTeamAssetLocalUploadFiles(workbench, "voice", [
        { name: "narrator.mp3", type: "audio/mpeg", size: 2048, lastModified: 2 },
      ]);

      assert.equal(uploadCalls.length, 1);
      assert.equal(uploadCalls[0].options.category, "voice");
      assert.deepEqual(libraryCalls, [{ scope: "team", category: "voice", folder: "", query: "" }]);
      assert.deepEqual(workbench.ui.teamAssetLocalUploads.voice, []);
      assert.equal(workbench.ui.libraryAssets[0]?.category, "voice");
      assert.match(root.innerHTML, /narrator/);
      assert.match(root.innerHTML, /project-audio-play-button/);
      assert.match(root.innerHTML, /data-audio-url="https:\/\/cdn\.example\.com\/team-assets\/voice\/narrator\.mp3"/);
    } finally {
      if (originalCreateObjectURL) {
        urlApi.createObjectURL = originalCreateObjectURL;
      } else {
        delete urlApi.createObjectURL;
      }
    }
  });

  it("removing a team upload does not show a success toast", async () => {
    const { workbench } = createWorkbench({
      ui: {
        teamAssetLocalUploads: {
          character: [{ id: "local-hero", name: "hero.png" }],
          scene: [],
          prop: [],
          voice: [],
        },
      },
    });

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "delete-team-asset-local-upload",
        libraryCategory: "character",
        localUploadId: "local-hero",
      },
    });

    assert.deepEqual(workbench.ui.teamAssetLocalUploads.character, []);
    assert.equal(workbench.ui.toast, "");
  });

  it("blocks team uploads when membership is inactive even if entitlement payload is stale", async () => {
    const { workbench, uploadCalls } = createWorkbench({
      ui: {
        membershipStatus: { status: "expired" },
      },
    });

    await handleTeamAssetLocalUploadFiles(workbench, "character", [
      { name: "hero.png", type: "image/png", size: 1536, lastModified: 1 },
    ]);

    assert.equal(uploadCalls.length, 0);
    assert.equal(workbench.ui.isLibraryPricingModalOpen, true);
    assert.equal(workbench.ui.toast, "团队资产库为会员权益，开通后才能上传素材。");
    assert.deepEqual(workbench.ui.teamAssetLocalUploads.character, []);
  });

  it("keeps the team asset library entry visible when membership is inactive", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "official",
      membershipStatus: { status: "expired" },
      libraryEntitlement: {
        hasTeamAssetLibrary: true,
      },
    });

    assert.match(html, /官方资产库/);
    assert.match(html, /团队资产库/);
    assert.match(html, /data-asset-scope="team"/);
  });

  it("shows the locked team asset library instead of team assets when membership is inactive", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "team",
      membershipStatus: { status: "expired" },
      libraryCategory: "character",
      libraryEntitlement: {
        hasTeamAssetLibrary: true,
      },
      libraryAssets: [{
        id: "team-hero",
        name: "团队主角",
        category: "character",
        folder: "团队角色",
        previewUrl: "data:image/png;base64,team-hero",
      }],
    });

    assert.match(html, /团队资产库/);
    assert.match(html, /立即开通/);
    assert.doesNotMatch(html, /团队主角/);
    assert.doesNotMatch(html, /data-action="pick-team-asset-local-upload"/);
  });

  it("hides upload controls when team asset library membership is locked", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "team",
      membershipStatus: { status: "professional_active" },
      libraryCategory: "character",
      libraryEntitlement: {
        hasTeamAssetLibrary: false,
        blockReason: "team_asset_library_entitlement_required",
      },
      teamAssetLocalUploads: {
        character: [
          {
            id: "local-locked",
            name: "locked-hero",
            previewUrl: "data:image/png;base64,locked",
          },
        ],
      },
    });

    assert.doesNotMatch(html, /data-action="pick-team-asset-local-upload"/);
    assert.doesNotMatch(html, /class="team-asset-local-upload-input"/);
    assert.doesNotMatch(html, /locked-hero/);
    assert.match(html, /open-pricing/);
  });

  it("uses membership status entitlement when legacy team asset overview is stale", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "team",
      membershipStatus: {
        status: "professional_active",
        currentTier: "professional",
        entitlements: {
          teamAssetLibrary: true,
        },
      },
      libraryCategory: "character",
      libraryEntitlement: {
        hasTeamAssetLibrary: false,
        blockReason: "team_asset_library_entitlement_required",
      },
      teamAssetLocalUploads: {
        character: [
          {
            id: "team-cloud-asset",
            category: "character",
            name: "后台配置开通的团队角色",
            previewUrl: "https://cdn.example.com/team-assets/character/hero.png",
            sourceUrl: "https://cdn.example.com/team-assets/character/hero.png",
            storageObjectId: "storage-1",
            sizeLabel: "53 KB",
            mimeType: "image/jpeg",
          },
        ],
      },
    });

    assert.match(html, /后台配置开通的团队角色/);
    assert.match(html, /data-action="pick-team-asset-local-upload"/);
    assert.doesNotMatch(html, /立即开通/);
  });

  it("allows team asset uploads from membership status entitlement when legacy overview is stale", async () => {
    const globals = globalThis;
    const originalFileReader = globals.FileReader;
    const originalWindow = globals.window;
    const originalDocument = globals.document;

    class TestFileReader {
      result = "";
      onload = null;

      readAsDataURL(file) {
        this.result = `data:${file.type || "application/octet-stream"};base64,cHJldmlldw==`;
        queueMicrotask(() => this.onload?.());
      }
    }

    globals.FileReader = TestFileReader;
    globals.window = { scrollX: 0, scrollY: 0 };
    globals.document = {
      scrollingElement: { scrollLeft: 0, scrollTop: 0 },
      documentElement: { scrollLeft: 0, scrollTop: 0 },
      querySelector() {
        return null;
      },
      createElement() {
        return { setAttribute() {} };
      },
      head: { appendChild() {} },
    };

    try {
      const { workbench, uploadCalls } = createWorkbench({
        ui: {
          libraryEntitlement: {
            hasTeamAssetLibrary: false,
            blockReason: "team_asset_library_entitlement_required",
          },
          membershipStatus: {
            status: "professional_active",
            currentTier: "professional",
            entitlements: {
              teamAssetLibrary: true,
            },
          },
        },
      });

      await handleTeamAssetLocalUploadFiles(workbench, "character", [
        { name: "hero.png", type: "image/png", size: 1536, lastModified: 1 },
      ]);

      assert.equal(uploadCalls.length, 0);
      assert.match(workbench.root.innerHTML, /本次已选择 1 个/);
      await handleWorkbenchActionForTest(workbench, { dataset: { action: "confirm-asset-import" } });

      assert.equal(uploadCalls.length, 1);
      assert.equal(workbench.ui.isLibraryPricingModalOpen, undefined);
      assert.match(workbench.root.innerHTML, /hero/);
    } finally {
      if (originalFileReader) {
        globals.FileReader = originalFileReader;
      } else {
        delete globals.FileReader;
      }
      if (originalWindow) {
        globals.window = originalWindow;
      } else {
        delete globals.window;
      }
      if (originalDocument) {
        globals.document = originalDocument;
      } else {
        delete globals.document;
      }
    }
  });

  it("allows team asset uploads when the asset library grants an active professional member", async () => {
    const globals = globalThis;
    const originalFileReader = globals.FileReader;
    const originalWindow = globals.window;
    const originalDocument = globals.document;

    class TestFileReader {
      result = "";
      onload = null;

      readAsDataURL(file) {
        this.result = `data:${file.type || "application/octet-stream"};base64,cHJldmlldw==`;
        queueMicrotask(() => this.onload?.());
      }
    }

    globals.FileReader = TestFileReader;
    globals.window = { scrollX: 0, scrollY: 0 };
    globals.document = {
      scrollingElement: { scrollLeft: 0, scrollTop: 0 },
      documentElement: { scrollLeft: 0, scrollTop: 0 },
      querySelector() {
        return null;
      },
      createElement() {
        return { setAttribute() {} };
      },
      head: { appendChild() {} },
    };

    try {
      const { workbench, uploadCalls } = createWorkbench({
        ui: {
          libraryEntitlement: {
            hasTeamAssetLibrary: true,
          },
          membershipStatus: {
            status: "professional_active",
            currentTier: "professional",
            entitlements: {
              teamAssetLibrary: false,
            },
          },
        },
      });

      await handleTeamAssetLocalUploadFiles(workbench, "prop", [
        { name: "weapon.png", type: "image/png", size: 1536, lastModified: 1 },
      ]);

      assert.equal(uploadCalls.length, 0);
      assert.match(workbench.root.innerHTML, /本次已选择 1 个/);
      await handleWorkbenchActionForTest(workbench, { dataset: { action: "confirm-asset-import" } });

      assert.equal(uploadCalls.length, 1);
      assert.notEqual(workbench.ui.isLibraryPricingModalOpen, true);
      assert.doesNotMatch(workbench.root.innerHTML, /开通会员权益/);
    } finally {
      if (originalFileReader) {
        globals.FileReader = originalFileReader;
      } else {
        delete globals.FileReader;
      }
      if (originalWindow) {
        globals.window = originalWindow;
      } else {
        delete globals.window;
      }
      if (originalDocument) {
        globals.document = originalDocument;
      } else {
        delete globals.document;
      }
    }
  });

  it("keeps the team asset library separate from the official asset browser", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "team",
      membershipStatus: { status: "professional_active" },
      libraryCategory: "character",
      libraryFolder: "国内仿真人-现代都市",
      libraryFolders: ["国内仿真人-现代都市", "国内仿真人-东方古代"],
      libraryEntitlement: {
        hasTeamAssetLibrary: true,
      },
      teamAssetLocalUploads: {
        character: [
          {
            id: "team-cloud-asset",
            category: "character",
            name: "团队角色",
            previewUrl: "https://cdn.example.com/team-assets/character/hero.png",
            sourceUrl: "https://cdn.example.com/team-assets/character/hero.png",
            storageObjectId: "storage-1",
            sizeLabel: "53 KB",
            mimeType: "image/jpeg",
          },
        ],
      },
    });

    assert.match(html, /团队角色/);
    assert.doesNotMatch(html, /本地上传，待同步/);
    assert.doesNotMatch(html, /已同步到团队云端/);
    assert.doesNotMatch(html, /library-team-local-upload-status/);
    assert.doesNotMatch(html, /library-team-folder-list/);
    assert.doesNotMatch(html, /国内仿真人-现代都市/);
  });

  it("shows shared team assets to team members without delete actions", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "team",
      isTeamMember: true,
      membershipStatus: { status: "professional_active" },
      libraryCategory: "character",
      libraryEntitlement: { hasTeamAssetLibrary: true },
      assetCardMenuId: "shared-team-asset",
      libraryAssets: [
        {
          id: "shared-team-asset",
          category: "character",
          name: "管理员共享角色",
          previewUrl: "https://cdn.example.com/team-assets/character/shared.png",
          sourceUrl: "https://cdn.example.com/team-assets/character/shared.png",
        },
      ],
    });

    assert.match(html, /管理员共享角色/);
    assert.doesNotMatch(html, /data-action="delete-team-asset"/);
    assert.doesNotMatch(html, /data-action="delete-team-asset-local-upload"/);
  });

  it("blocks locked team uploads without creating previews or calling cloud storage", async () => {
    const globals = globalThis;
    const originalFileReader = globals.FileReader;
    const originalWindow = globals.window;
    const originalDocument = globals.document;

    class TestFileReader {
      result = "";
      error = null;
      onload = null;
      onerror = null;

      readAsDataURL(file) {
        this.result = `data:${file.type || "application/octet-stream"};base64,bG9jYWw=`;
        queueMicrotask(() => this.onload?.());
      }
    }

    globals.FileReader = TestFileReader;
    globals.window = { scrollX: 0, scrollY: 0 };
    globals.document = {
      scrollingElement: { scrollLeft: 0, scrollTop: 0 },
      documentElement: { scrollLeft: 0, scrollTop: 0 },
      querySelector() {
        return null;
      },
      createElement() {
        return { setAttribute() {} };
      },
      head: { appendChild() {} },
    };

    try {
      const { workbench, root, uploadCalls } = createWorkbench({
        ui: {
          libraryEntitlement: {
            hasTeamAssetLibrary: false,
            blockReason: "team_asset_library_entitlement_required",
          },
        },
      });

      await handleTeamAssetLocalUploadFiles(workbench, "character", [
        { name: "locked-hero.png", type: "image/png", size: 1024, lastModified: 3 },
      ]);

      assert.equal(uploadCalls.length, 0);
      assert.deepEqual(workbench.ui.teamAssetLocalUploads.character, []);
      assert.equal(workbench.ui.isLibraryPricingModalOpen, true);
      assert.doesNotMatch(root.innerHTML, /locked-hero/);
      assert.doesNotMatch(root.innerHTML, /data-action="delete-team-asset-local-upload"/);
    } finally {
      if (originalFileReader) {
        globals.FileReader = originalFileReader;
      } else {
        delete globals.FileReader;
      }
      if (originalWindow) {
        globals.window = originalWindow;
      } else {
        delete globals.window;
      }
      if (originalDocument) {
        globals.document = originalDocument;
      } else {
        delete globals.document;
      }
    }
  });

  it("shows a smaller-image toast for oversized team image uploads", async () => {
    const globals = globalThis;
    const originalFileReader = globals.FileReader;
    const originalWindow = globals.window;
    const originalDocument = globals.document;

    class TestFileReader {
      result = "";
      onload = null;

      readAsDataURL(file) {
        this.result = `data:${file.type || "application/octet-stream"};base64,bG9jYWw=`;
        queueMicrotask(() => this.onload?.());
      }
    }

    globals.FileReader = TestFileReader;
    globals.window = { scrollX: 0, scrollY: 0 };
    globals.document = {
      scrollingElement: { scrollLeft: 0, scrollTop: 0 },
      documentElement: { scrollLeft: 0, scrollTop: 0 },
      querySelector() {
        return null;
      },
      createElement() {
        return { setAttribute() {} };
      },
      head: { appendChild() {} },
    };

    try {
      const { workbench, root, uploadCalls } = createWorkbench();

      await handleTeamAssetLocalUploadFiles(workbench, "character", [
        {
          name: "too-large.png",
          type: "image/png",
          size: 20 * 1024 * 1024 + 1,
          lastModified: 4,
        },
      ]);

      assert.equal(uploadCalls.length, 0);
      assert.deepEqual(workbench.ui.teamAssetLocalUploads.character, []);
      assert.equal(workbench.ui.toast, "图片过大，请换一张更小的图片上传。");
      assert.doesNotMatch(root.innerHTML, /too-large/);
      assert.doesNotMatch(root.innerHTML, /上传失败/);
    } finally {
      if (originalFileReader) {
        globals.FileReader = originalFileReader;
      } else {
        delete globals.FileReader;
      }
      if (originalWindow) {
        globals.window = originalWindow;
      } else {
        delete globals.window;
      }
      if (originalDocument) {
        globals.document = originalDocument;
      } else {
        delete globals.document;
      }
    }
  });

  it("accepts extension-only files but rejects mismatched MIME disguises", () => {
    assert.equal(
      validateTeamAssetLocalUploadFile("scene", { name: "street.webp", type: "" }).ok,
      true,
    );
    assert.equal(
      validateTeamAssetLocalUploadFile("character", { name: "renamed.jpg", type: "application/pdf" }).ok,
      false,
    );
    assert.equal(
      validateTeamAssetLocalUploadFile("voice", { name: "narrator.aac", type: "" }).ok,
      true,
    );
  });
});
