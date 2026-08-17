import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { renderEpisodeWorkbench } from "../src/features/production-workbench/episode-workbench-rebuilt.js";
import { renderProjectDetail, renderSingleEpisodeAiPreview } from "../src/features/production-workbench/project-detail.js";

const rendererInput = {
  episodeId: "episode-1",
  episodeTitle: "第一集",
  assetLibrary: {
    character: [{ id: "asset-1", name: "角色一", description: "角色描述" }],
    scene: [],
    prop: [],
  },
  storyboards: [{ id: "shot-1", index: 1, title: "开场", description: "分镜描述" }],
  selectedEpisodeAssetId: "asset-1",
  selectedEpisodeCardId: "asset-1",
  selectedStoryboard: { id: "shot-1", index: 1, title: "开场", description: "分镜描述" },
  generationControls: {},
  generationUiState: { museScopeMode: "assets", museBoardMode: "operation" },
};

test("workflow layout reuses asset and storyboard panels on one page", () => {
  const html = renderEpisodeWorkbench({
    ...rendererInput,
    layoutMode: "workflow",
    workflowWorkbenchOpen: false,
  });

  assert.match(html, /class="[^"]*workflow-layout/);
  assert.match(html, /data-workflow-asset-panel/);
  assert.match(html, /data-workflow-storyboard-panel/);
  assert.match(html, /data-workflow-resource-progress/);
  assert.match(html, /已完成 <b>0<\/b>/);
  assert.match(html, /未完成 <b>1<\/b>/);
  assert.match(html, /data-workflow-asset-panel[\s\S]*?data-action="toggle-episode-asset-select-all"[\s\S]*?data-batch-scope="assets">一键生图/);
  assert.match(html, /data-workflow-storyboard-panel[\s\S]*?data-action="toggle-storyboard-select-all"[\s\S]*?data-batch-scope="storyboard">一键生视频/);
  assert.match(html, /episode-replica-asset-name-input/);
  assert.match(html, /episode-replica-asset-desc-input/);
  assert.match(html, /episode-replica-shot-card/);
  assert.doesNotMatch(html, /class="episode-replica-center/);
  assert.doesNotMatch(html, /class="episode-replica-right/);
  assert.doesNotMatch(html, /创作工作流/);
});

test("workflow generation workbench is the existing prompt dock and can be closed", () => {
  const html = renderEpisodeWorkbench({
    ...rendererInput,
    layoutMode: "workflow",
    workflowWorkbenchOpen: true,
  });
  const css = readFileSync(
    new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
    "utf8",
  );

  assert.match(html, /class="episode-replica-center/);
  assert.match(html, /class="[^"]*episode-replica-prompt/);
  assert.match(html, /data-action="close-workflow-generation-workbench"/);
  assert.doesNotMatch(html, /episode-replica-stage-tabs/);
  assert.match(html, /data-action="toggle-episode-asset-select-all"/);
  assert.match(html, /data-action="toggle-storyboard-select-all"/);
  assert.match(html, /data-action="open-episode-batch-actions" data-batch-scope="assets">一键生图/);
  assert.match(html, /data-action="open-episode-batch-actions" data-batch-scope="storyboard">一键生视频/);
  assert.doesNotMatch(html, /class="episode-replica-right/);
  assert.match(
    css,
    /\.episode-workbench-screen \.episode-replica-layout\.workflow-layout\.workflow-workbench-open\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(22rem, var\(--episode-replica-center-width,/,
  );
  assert.match(
    css,
    /\.episode-workbench-screen \.episode-replica-layout\.workflow-layout \.episode-replica-shot-card-body\.storyboard-board-mode\s*\{[\s\S]*?grid-template-columns:\s*minmax\(6\.2rem, 0\.48fr\) minmax\(20rem, 1\.65fr\) minmax\(7\.4rem, 0\.58fr\) minmax\(6\.2rem, 0\.45fr\);/,
  );
});

test("empty asset workflow composer keeps one conversation placeholder without an asset title", () => {
  const html = renderEpisodeWorkbench({
    ...rendererInput,
    layoutMode: "workflow",
    workflowWorkbenchOpen: true,
  });
  const css = readFileSync(
    new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(html, /class="episode-replica-stage-head"/);
  assert.match(
    css,
    /\.episode-workbench-screen \.episode-replica-layout\.workflow-layout\.assets-mode > \.episode-replica-center\.asset-scope\.empty-composer\s*\{[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\) auto !important;/,
  );
  assert.match(
    css,
    /\.episode-workbench-screen \.episode-replica-layout\.workflow-layout\.assets-mode > \.episode-replica-center\.asset-scope\.empty-composer \.episode-replica-stage-body\s*\{[\s\S]*?display:\s*block !important;[\s\S]*?height:\s*100% !important;/,
  );
});

test("home workflow accepts only an uploaded script for parsing", () => {
  const html = renderProjectDetail({
    ui: {
      activeNavTab: "home",
      homeCreationMode: "workflow",
      homeWorkflowScriptFileName: "雨夜车站.docx",
    },
  });

  assert.match(html, /class="home-agent-composer home-workflow-script-upload"/);
  assert.match(html, /data-dropzone="home-workflow-script-upload"/);
  assert.match(html, /data-home-workflow-script-input[^>]*accept="\.docx,\.txt"/);
  assert.match(html, /已选择剧本/);
  assert.match(html, /雨夜车站\.docx/);
  assert.match(html, /data-action="submit-home-agent-prompt"[^>]*>解析剧本/);
  assert.doesNotMatch(html, /data-home-agent-prompt/);
});

test("home workflow keeps the upload control as compact as the Agent composer", () => {
  const css = readFileSync(
    new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
    "utf8",
  );

  assert.match(css, /\.home-workflow-script-dropzone\s*\{[\s\S]*?display: grid;[\s\S]*?min-height: 14rem;[\s\S]*?border: 2px dashed/);
  assert.match(css, /\.home-workflow-script-picker\s*\{[\s\S]*?height: 100%;[\s\S]*?align-content: center;[\s\S]*?justify-items: center;[\s\S]*?text-align: center;/);
  assert.match(css, /\.home-workflow-script-dropzone:hover,[\s\S]*?\.home-workflow-script-dropzone\.is-dragging\s*\{[\s\S]*?border-color: rgba\(57, 210, 222, 0\.74\);/);
  assert.match(css, /\.home-workflow-script-dropzone:hover \.home-workflow-script-icon,[\s\S]*?\.home-workflow-script-dropzone\.is-dragging \.home-workflow-script-icon\s*\{[\s\S]*?transform: scale\(1\.15\);/);
  assert.match(css, /@media \(min-width: 641px\)\s*\{\s*form\.home-agent-composer\[data-home-agent-form\]\s*\{\s*min-height: 20rem;/);
});

test("home project workflow uses the full workbench and keeps its selected generation dock open", () => {
  const html = renderProjectDetail({
    ui: {
      activeNavTab: "project",
      projectPanelMode: "episode-workbench",
      homeWorkflowOrigin: true,
      workflowGenerationWorkbenchOpen: true,
      selectedEpisodeId: "episode-1",
      episodeWorkbenchLayout: "workflow",
      importedAssets: rendererInput.assetLibrary,
      storyboards: rendererInput.storyboards,
      selectedEpisodeAssetId: "asset-1",
      selectedEpisodeCardId: "asset-1",
      selectedStoryboardId: "shot-1",
      museScopeMode: "assets",
      episodeMediaMode: "image",
      episodeBatchModal: { show: true, mode: "image", scope: "asset", items: [] },
    },
  });

  assert.match(html, /class="production-workbench"/);
  assert.match(html, /data-action="back-to-home-from-workflow"/);
  assert.match(html, /class="episode-replica-center/);
  assert.match(html, /class="[^\"]*episode-replica-prompt/);
  assert.doesNotMatch(html, /home-project-workflow-backdrop/);
});

test("standard episode layout keeps its existing three surfaces", () => {
  const html = renderEpisodeWorkbench(rendererInput);

  assert.doesNotMatch(html, /workflow-layout/);
  assert.match(html, /class="episode-replica-center/);
  assert.match(html, /class="episode-replica-right/);
  assert.doesNotMatch(html, /data-workflow-asset-panel/);
});

test("workflow state opens from cards and closes without changing standard handlers", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );
  const storyboardAction = source.slice(
    source.indexOf('if (action === "select-storyboard")'),
    source.indexOf('if (action === "set-episode-asset")'),
  );
  const assetAction = source.slice(
    source.indexOf('if (action === "set-episode-asset")'),
    source.indexOf('if (action === "close-workflow-generation-workbench")'),
  );

  assert.match(storyboardAction, /episodeWorkbenchLayout === "workflow"/);
  assert.match(storyboardAction, /museScopeMode = "storyboard"/);
  assert.match(storyboardAction, /episodeMediaMode = "video"/);
  assert.match(storyboardAction, /isWorkflowLayout \|\| !renderEpisodeWorkbenchSelectionOnly/);
  assert.match(assetAction, /episodeWorkbenchLayout === "workflow"/);
  assert.match(assetAction, /museScopeMode = "assets"/);
  assert.match(assetAction, /episodeMediaMode = "image"/);
  const defaultAssetSelection = source.slice(
    source.indexOf("function syncSelectedEpisodeAssetForCurrentTab"),
    source.indexOf("async function handleAssetImportFiles"),
  );
  assert.match(defaultAssetSelection, /!hadSelectedAsset/);
  assert.match(defaultAssetSelection, /episodeWorkbenchLayout === "workflow"/);
  assert.match(defaultAssetSelection, /museScopeMode === "assets"/);
  assert.match(defaultAssetSelection, /workflowGenerationWorkbenchOpen = true/);
  const defaultStoryboardSelection = source.slice(
    source.indexOf("function syncSelectedStoryboardId"),
    source.indexOf("function hydratePersistedWorkbenchState"),
  );
  assert.match(defaultStoryboardSelection, /episodeWorkbenchLayout === "workflow"/);
  assert.match(defaultStoryboardSelection, /const scopeMode = resolveWorkflowDefaultGenerationScopeMode\(workbench\)/);
  assert.match(defaultStoryboardSelection, /museScopeMode = scopeMode/);
  assert.match(defaultStoryboardSelection, /scopeMode === "storyboard" \? "video" : "image"/);
  assert.match(defaultStoryboardSelection, /workflowGenerationWorkbenchOpen = true/);
  assert.match(source, /function resolveWorkflowDefaultGenerationScopeMode/);
  assert.match(source, /progress\.total > 0 && progress\.completed === progress\.total \? "storyboard" : "assets"/);
  const homeWorkflowProjectOpen = source.slice(
    source.indexOf('if (action === "open-project-detail")'),
    source.indexOf("const selectedProjectCard = findProjectLibraryCard"),
  );
  assert.match(homeWorkflowProjectOpen, /scopeMode: resolveWorkflowDefaultGenerationScopeMode\(workbench\)/);
  const batchAction = source.slice(
    source.indexOf('if (action === "open-episode-batch-actions")'),
    source.indexOf('if (action === "close-episode-batch-modal")'),
  );
  assert.match(batchAction, /target\.dataset\.batchScope/);
  assert.match(batchAction, /target\.dataset\.batchScope === "storyboard"/);
  const closeAction = source.slice(
    source.indexOf('if (action === "close-workflow-generation-workbench")'),
    source.indexOf('if (action === "toggle-episode-asset-selection")'),
  );
  const standardEntryAction = source.slice(
    source.indexOf('if (action === "open-episode-workbench")'),
    source.indexOf('if (action === "back-to-episode-hub")'),
  );

  assert.match(closeAction, /workflowGenerationWorkbenchOpen = false/);
  assert.match(closeAction, /homeProjectWorkflowProjectId = null/);
  assert.match(closeAction, /activeNavTab = "home"/);
  assert.match(closeAction, /projectPanelMode = "library"/);
  assert.match(closeAction, /episodeWorkbenchLayout = "standard"/);
  assert.match(closeAction, /location\.hash = "home"/);
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /episodeWorkbenchLayout === "workflow"[\s\S]*workflowGenerationWorkbenchOpen === true[\s\S]*activeNavTab = "home"[\s\S]*workflowGenerationWorkbenchOpen = false/);
  assert.match(standardEntryAction, /episodeWorkbenchLayout = "standard"/);
  assert.match(standardEntryAction, /workflowGenerationWorkbenchOpen = false/);
  assert.match(batchAction, /museScopeMode \?\? "storyboard"/);
  assert.match(batchAction, /const mode = storyboardScope \? "video" : "image"/);
  const batchModalSync = source.slice(
    source.indexOf("function syncEpisodeBatchModalOnly"),
    source.indexOf("function syncGenerationResultDeleteModalOnly"),
  );
  assert.match(batchModalSync, /syncEpisodeWorkbenchLayerOnly/);
  assert.doesNotMatch(batchModalSync, /home-project-workflow-backdrop/);
});

test("home workflow submission starts the AI storyboard modal instead of parsing and navigating", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );
  const workflowSubmit = source.slice(
    source.indexOf('if (creationMode === "workflow")'),
    source.indexOf('await runAction(workbench, creationMode === "free"'),
  );

  assert.match(workflowSubmit, /syncEpisodePromptSkills\(workbench\)/);
  assert.match(workflowSubmit, /loadGlobalGenerationConfig\(workbench, \{ fresh: true, mediaType: "text" \}\)/);
  assert.match(workflowSubmit, /action: "confirm-single-episode", workflowOrigin: "home"/);
  assert.match(workflowSubmit, /episodeWorkbenchLayout = "workflow"/);
  assert.match(workflowSubmit, /homeWorkflowInstruction = sourceScript/);
  assert.match(workflowSubmit, /scriptInput: ""/);
  assert.match(workflowSubmit, /scriptUploadSessionId: scriptUpload\.uploadSessionId/);
  assert.doesNotMatch(workflowSubmit, /parseScript\(/);
  assert.doesNotMatch(workflowSubmit, /enterEpisodeWorkbench\(/);
  assert.match(source, /isManualScriptAnalysis \|\| isHomeWorkflowAnalysis/);
  assert.match(source, /skipScriptStage: true/);
  assert.match(source, /useDefaultWorkflowStages: true/);
  assert.doesNotMatch(source, /resolveInstructionIntent: true/);
  assert.match(source, /selectedStages: isHomeWorkflowAnalysis[\s\S]*\["scene", "character", "prop", "shot"\]/);
  assert.match(source, /activeStage: isHomeWorkflowAnalysis[\s\S]*\? "scene"/);
  assert.match(source, /!workbench\.ui\.singleEpisodeAiPreview\.selectedStages\.includes\("script"\)/);
});

test("home workflow uses a return-home statusbar action without changing the episode return", () => {
  const homeWorkflowHtml = renderProjectDetail({
    ui: {
      activeNavTab: "project",
      projectPanelMode: "episode-workbench",
      episodeWorkbenchLayout: "workflow",
      homeWorkflowOrigin: true,
      importedAssets: rendererInput.assetLibrary,
      storyboards: rendererInput.storyboards,
      selectedEpisodeAssetId: "asset-1",
      selectedEpisodeCardId: "asset-1",
      selectedStoryboardId: "shot-1",
      museScopeMode: "assets",
      episodeMediaMode: "image",
    },
  });
  const standardEpisodeHtml = renderProjectDetail({
    ui: {
      activeNavTab: "project",
      projectPanelMode: "episode-workbench",
      importedAssets: rendererInput.assetLibrary,
      storyboards: rendererInput.storyboards,
      selectedEpisodeAssetId: "asset-1",
      selectedEpisodeCardId: "asset-1",
      selectedStoryboardId: "shot-1",
      museScopeMode: "assets",
      episodeMediaMode: "image",
    },
  });
  const source = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );

  assert.match(homeWorkflowHtml, /data-action="back-to-home-from-workflow"[\s\S]*?返回首页/);
  assert.match(standardEpisodeHtml, /data-action="back-to-episode-hub"[\s\S]*?返回剧集/);
  assert.match(source, /homeWorkflowOrigin = true/);
  assert.match(source, /if \(action === "back-to-home-from-workflow"\)[\s\S]*?activeNavTab = "home"[\s\S]*?homeWorkflowOrigin = false/);
});

test("character-only workflow result shows only character output and no create chapter action", () => {
  const html = renderSingleEpisodeAiPreview({
    singleEpisodeAiPreview: {
      status: "ready",
      selectedStages: ["character"],
      data: {
        displayTables: {
          script: { title: "剧本", rows: [{ scriptContent: "小说原文" }] },
          characters: { title: "角色", columns: ["角色名称"], rows: [{ characterName: "萧炎" }] },
        },
      },
    },
  });

  assert.match(html, /<h3>人物提示词<\/h3>/);
  assert.match(html, /data-action="close-ai-storyboard-preview">完成<\/button>/);
  assert.match(html, /萧炎/);
  assert.doesNotMatch(html, /data-action="commit-ai-storyboard-preview"/);
  assert.doesNotMatch(html, /小说原文/);
});
