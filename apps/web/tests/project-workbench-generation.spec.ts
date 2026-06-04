import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  applyEpisodeGenerationTaskResult,
  applyProjectDetail,
  applyStoryboardScopeUpdate,
  appendSelectedEpisodeAssetToPrompt,
  buildImageGenerationPayload,
  buildVideoGenerationPayload,
  friendlyError,
  generateAssetImages,
  generateStoryboardImages,
  handleWorkbenchActionForTest,
  initProductionWorkbench,
  loadSelectedAssetConversationHistory,
  parseEpisodeRouteForWorkbench,
  parseProjectRouteForWorkbench,
  sanitizeEpisodeWorkbenchSelection,
  findProjectCoverInput,
  renderProductionWorkbench,
  syncEpisodeAssetDescriptionState,
  updatePromptMentionState,
  uploadProjectCoverFile,
  syncStoryboards,
} from "../src/features/production-workbench/index.js";
import {
  addStoryboard,
  createStoryboardList,
  insertStoryboardAfter,
  normalizeStoryboardIndices,
  sortStoryboardsByIndex,
} from "../src/features/production-workbench/storyboard-state.js";
import { renderProjectCreateModal } from "../src/features/production-workbench/project-create-modal.js";
import { buildProjectCreateRequest } from "../src/features/production-workbench/project-create-request.js";
import {
  validateVideoGeneration,
  videoModels,
} from "../src/features/production-workbench/video-generation-panel.js";
import { getLibraryAssetsForImport } from "../src/features/library-team/asset-library-page.js";

describe("production workbench home shell", () => {
  it("parses episode deep links as project child routes", () => {
    assert.deepEqual(parseEpisodeRouteForWorkbench({
      hash: "#/projects/project-1/episodes/episode-2",
      pathname: "/app.html",
    }), {
      projectId: "project-1",
      episodeId: "episode-2",
    });
    assert.deepEqual(parseEpisodeRouteForWorkbench({
      hash: "",
      pathname: "/project/project-3/episodes/episode-4",
    }), {
      projectId: "project-3",
      episodeId: "episode-4",
    });
    assert.equal(parseEpisodeRouteForWorkbench({ hash: "#project-workspace", pathname: "/" }), null);
  });

  it("parses project detail deep links as episode-tab parent routes", () => {
    assert.deepEqual(parseProjectRouteForWorkbench({
      hash: "#/projects/project-1",
      pathname: "/app.html",
    }), {
      projectId: "project-1",
    });
    assert.deepEqual(parseProjectRouteForWorkbench({
      hash: "",
      pathname: "/project/project-3",
    }), {
      projectId: "project-3",
    });
    assert.equal(parseProjectRouteForWorkbench({
      hash: "#/projects/project-1/episodes/episode-2",
      pathname: "/app.html",
    }), null);
  });

  it("renders the persistent left rail and home actions", () => {
    const storyboard = {
      id: "storyboard-dom-multi-image",
      title: "分镜 1",
      description: "分镜文案：三张参考图都要引入",
      generationState: {
        prompt: "分镜文案：三张参考图都要引入",
        quickReferenceItems: [
          {
            id: "quick-ref:storyboard-image:storyboard-dom-multi-image:preview",
            assetId: "storyboard-dom-multi-image",
            kind: "storyboard",
            name: "分镜 1 引用",
            description: "分镜文案：三张参考图都要引入",
            preview: "/uploads/dom-ref-1.png",
            url: "/uploads/dom-ref-1.png",
            references: [
              { id: "dom-1", previewUrl: "/uploads/dom-ref-1.png", name: "参考图1" },
              { id: "dom-2", previewUrl: "/uploads/dom-ref-2.png", name: "参考图2" },
              { id: "dom-3", previewUrl: "/uploads/dom-ref-3.png", name: "参考图3" },
            ],
          },
        ],
        mentionReferences: [],
      },
    };
    const html = renderProductionWorkbench({
      state: {},
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "home",
        storyboards: [],
        selectedStoryboard: null,
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
      },
    });

    assert.match(html, /data-action="set-nav-tab"/);
    assert.match(html, /data-action="open-create-modal"/);
    assert.match(html, /data-liquid-ether-root/);
    assert.match(html, /hero-avatar/);
  });

  it("shows the current credit balance in the global status bar when provided", () => {
    const html = renderProductionWorkbench({
      state: {},
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "home",
        storyboards: [],
        selectedStoryboard: null,
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        validationMessage: "",
        toast: "",
        creditBalance: 720,
        isScriptModalOpen: false,
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
      },
    });

    assert.match(html, /statusbar-credit/);
    assert.match(html, /✦<\/span> 720 <span aria-hidden="true">⌄/);
  });

  it("formats permission and CORS envelope errors with actionable copy", () => {
    assert.match(
      friendlyError({
        status: 403,
        errorCode: "origin_forbidden",
        requestId: "request-cors",
        message: "Origin is not allowed",
      }),
      /跨域来源被拒绝.*request-cors/,
    );
    assert.match(
      friendlyError({
        status: 403,
        errorCode: "permission_denied",
        requestId: "request-denied",
        message: "Forbidden",
      }),
      /没有权限执行该操作.*request-denied/,
    );
    assert.match(
      friendlyError({
        status: 404,
        errorCode: "resource_not_found",
        requestId: "request-missing",
        message: "not found",
      }),
      /资源不存在或无权访问.*request-missing/,
    );
  });

  it("formats model reference validation errors with actionable Chinese copy", () => {
    assert.match(
      friendlyError({
        status: 400,
        errorCode: "model_reference_not_found",
        requestId: "request-reference-missing",
        message: "参考素材不存在或无权访问",
      }),
      /参考素材不存在或无权访问.*request-reference-missing/,
    );
    assert.match(
      friendlyError({
        status: 400,
        errorCode: "model_reference_unavailable",
        requestId: "request-reference-unavailable",
        message: "参考素材尚未可用或已失效",
      }),
      /参考素材尚未准备好.*request-reference-unavailable/,
    );
    assert.match(
      friendlyError({
        status: 400,
        errorCode: "model_reference_mime_not_allowed",
        requestId: "request-reference-mime",
        message: "参考素材格式不符合当前模型配置",
      }),
      /当前模型不支持该参考素材格式.*request-reference-mime/,
    );
  });
});

describe("episode workbench asset list layout", () => {
  it("keeps character scene and prop sections in one continuous scrollable list", () => {
    const css = readFileSync(
      new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(
      css,
      /\.episode-replica-asset-section\s*\{[^}]*display:\s*none/i,
    );
  });

  it("keeps asset section tabs the same height when active", () => {
    const css = readFileSync(
      new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
      "utf8",
    );
    const tabsBlock = css.match(
      /\.episode-replica-asset-toolbar \.episode-replica-asset-tabs\s*\{(?<body>[^}]*)\}/,
    )?.groups?.body ?? "";
    const buttonBlock = css.match(
      /\.episode-replica-asset-toolbar \.episode-replica-asset-tabs button\s*\{(?<body>[^}]*)\}/,
    )?.groups?.body ?? "";
    const activeBlock = css.match(
      /\.episode-replica-asset-toolbar \.episode-replica-asset-tabs button\.active\s*\{(?<body>[^}]*)\}/,
    )?.groups?.body ?? "";

    assert.match(tabsBlock, /height:\s*2\.61rem/);
    assert.match(tabsBlock, /min-height:\s*2\.61rem/);
    assert.match(buttonBlock, /height:\s*2\.25rem/);
    assert.match(buttonBlock, /min-height:\s*2\.25rem/);
    assert.match(buttonBlock, /max-height:\s*2\.25rem/);
    assert.doesNotMatch(activeBlock, /\b(?:height|min-height|max-height|padding|border|font-size|line-height)\s*:/);
  });

  it("renders asset selection and hover tools as compact top-corner controls", () => {
    const css = readFileSync(
      new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
      "utf8",
    );
    const pickBlock = [...css.matchAll(
      /\.episode-replica-asset-card \.episode-replica-asset-card-head \.pick\s*\{(?<body>[^}]*)\}/g,
    )].at(-1)?.groups?.body ?? "";
    const hoverToolsBlock = [...css.matchAll(
      /\.episode-replica-asset-card \.episode-replica-asset-hover-tools\s*\{(?<body>[^}]*)\}/g,
    )].at(-1)?.groups?.body ?? "";
    const hoverVisibleBlock = [...css.matchAll(
      /\.episode-replica-asset-card:hover \.episode-replica-asset-hover-tools,\s*\.episode-replica-asset-card\.active \.episode-replica-asset-hover-tools\s*\{(?<body>[^}]*)\}/g,
    )].at(-1)?.groups?.body ?? "";

    assert.match(pickBlock, /width:\s*0\.58rem/);
    assert.match(pickBlock, /height:\s*0\.58rem/);
    assert.match(hoverToolsBlock, /display:\s*inline-flex/);
    assert.match(hoverToolsBlock, /top:\s*0\.42rem/);
    assert.match(hoverToolsBlock, /right:\s*0\.42rem/);
    assert.match(hoverToolsBlock, /grid-auto-flow:\s*column/);
    assert.match(hoverVisibleBlock, /transform:\s*translateY\(0\)/);
  });

  it("aligns storyboard selection and add delete controls with asset card controls", () => {
    const css = readFileSync(
      new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
      "utf8",
    );
    const pickBlock = [...css.matchAll(
      /\.episode-replica-shot-card \.pick\s*\{(?<body>[^}]*)\}/g,
    )].at(-1)?.groups?.body ?? "";
    const hoverToolsBlock = [...css.matchAll(
      /\.episode-replica-shot-shell \.episode-replica-shot-hover-tools\s*\{(?<body>[^}]*)\}/g,
    )].at(-1)?.groups?.body ?? "";
    const hoverVisibleBlock = [...css.matchAll(
      /\.episode-replica-shot-shell:hover \.episode-replica-shot-hover-tools,\s*\.episode-replica-shot-shell\.active \.episode-replica-shot-hover-tools,\s*\.episode-replica-shot-shell:focus-within \.episode-replica-shot-hover-tools\s*\{(?<body>[^}]*)\}/g,
    )].at(-1)?.groups?.body ?? "";
    const activeCardBlock = [...css.matchAll(
      /\.episode-replica-shot-shell\.active \.episode-replica-shot-card\s*\{(?<body>[^}]*)\}/g,
    )].at(-1)?.groups?.body ?? "";
    const buttonSizeBlock = [...css.matchAll(
      /\.episode-replica-shot-add,\s*\.episode-replica-shot-delete\s*\{(?<body>[^}]*)\}/g,
    )].at(-1)?.groups?.body ?? "";
    const deleteButtonBlock = [...css.matchAll(
      /\.episode-replica-shot-delete\s*\{(?<body>[^}]*)\}/g,
    )].map((match) => match.groups?.body ?? "").find((body) =>
      /top:\s*auto/.test(body) && /right:\s*auto/.test(body),
    ) ?? "";

    assert.match(pickBlock, /width:\s*0\.58rem/);
    assert.match(pickBlock, /height:\s*0\.58rem/);
    assert.match(pickBlock, /top:\s*0\.86rem/);
    assert.match(pickBlock, /left:\s*0\.96rem/);
    assert.match(hoverToolsBlock, /top:\s*0\.58rem/);
    assert.match(hoverToolsBlock, /bottom:\s*auto/);
    assert.match(hoverToolsBlock, /right:\s*0\.42rem/);
    assert.match(hoverToolsBlock, /display:\s*inline-flex/);
    assert.match(hoverToolsBlock, /gap:\s*0\.28rem/);
    assert.match(hoverToolsBlock, /opacity:\s*1/);
    assert.match(hoverToolsBlock, /pointer-events:\s*auto/);
    assert.match(hoverToolsBlock, /transform:\s*translateY\(0\)/);
    assert.match(hoverVisibleBlock, /transform:\s*translateY\(0\)/);
    assert.match(activeCardBlock, /border-color:\s*rgba\(145,\s*214,\s*255,\s*0\.86\)/);
    assert.match(activeCardBlock, /box-shadow:/);
    assert.match(buttonSizeBlock, /width:\s*1\.68rem/);
    assert.match(buttonSizeBlock, /height:\s*1\.68rem/);
    assert.match(deleteButtonBlock, /min-width:\s*1\.68rem/);
    assert.match(deleteButtonBlock, /min-height:\s*1\.68rem/);
    assert.match(deleteButtonBlock, /writing-mode:\s*horizontal-tb/);
  });

  it("keeps the storyboard asset column at half width", () => {
    const css = readFileSync(
      new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
      "utf8",
    );

    assert.match(
      css,
      /grid-template-columns: minmax\(6\.5rem, 0\.6fr\) minmax\(20\.5rem, 1\.95fr\) minmax\(13rem, 1fr\);/,
    );
    assert.match(
      css,
      /grid-template-columns: minmax\(4\.1rem, 0\.46fr\) minmax\(13\.9rem, 1\.64fr\) minmax\(5\.1rem, 0\.44fr\);/,
    );
  });

  it("stretches the storyboard script text box to match side columns", () => {
    const css = readFileSync(
      new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
      "utf8",
    );
    const wrapBlock = [...css.matchAll(
      /\.episode-replica-shot-desc-wrap\s*\{(?<body>[^}]*)\}/g,
    )].at(-1)?.groups?.body ?? "";
    const inputBlock = [...css.matchAll(
      /\.episode-replica-shot-desc-input\s*\{(?<body>[^}]*)\}/g,
    )].at(-1)?.groups?.body ?? "";
    const copyColumnBlock = [...css.matchAll(
      /\.episode-replica-shot-card-column\.copy,\s*\.episode-replica-shot-card-column\.preview-column\s*\{(?<body>[^}]*)\}/g,
    )].at(-1)?.groups?.body ?? "";

    assert.match(copyColumnBlock, /grid-template-rows:\s*auto 1fr auto/);
    assert.match(wrapBlock, /height:\s*100%/);
    assert.match(inputBlock, /height:\s*100%/);
    assert.match(inputBlock, /min-height:\s*0/);
  });

  it("pins storyboard pagination to the bottom of the left pane", () => {
    const css = readFileSync(
      new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
      "utf8",
    );
    const storyboardGridBlock = [...css.matchAll(
      /\.episode-replica-layout\.storyboard-mode \.episode-replica-storyboard-grid\s*\{(?<body>[^}]*)\}/g,
    )].map((match) => match.groups?.body ?? "").find((body) =>
      /flex:\s*1 1 auto/.test(body) && /overflow-y:\s*auto/.test(body),
    ) ?? "";
    const paginationBlock = [...css.matchAll(
      /\.episode-replica-layout\.storyboard-mode \.episode-replica-storyboard-pagination\s*\{(?<body>[^}]*)\}/g,
    )].at(-1)?.groups?.body ?? "";

    assert.match(storyboardGridBlock, /min-height:\s*0/);
    assert.match(storyboardGridBlock, /padding-bottom:\s*0\.9rem/);
    assert.match(paginationBlock, /position:\s*sticky/);
    assert.match(paginationBlock, /bottom:\s*0/);
    assert.match(paginationBlock, /z-index:\s*6/);
  });

  it("matches the compact reference storyboard desktop composition", () => {
    const css = readFileSync(
      new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
      "utf8",
    );
    const referenceBlock = css.match(
      /\/\* Reference storyboard desktop composition \*\/(?<body>[\s\S]*?)\/\* End reference storyboard desktop composition \*\//,
    )?.groups?.body ?? "";

    assert.match(referenceBlock, /grid-template-columns:\s*minmax\(43rem,\s*63fr\) minmax\(27rem,\s*29fr\) minmax\(6\.8rem,\s*8fr\)/);
    assert.match(referenceBlock, /\.episode-replica-layout\.storyboard-mode \.episode-replica-shot-card\s*\{[\s\S]*?height:\s*14\.2rem/);
    assert.match(referenceBlock, /\.episode-replica-layout\.storyboard-mode \.episode-replica-shot-card\s*\{[\s\S]*?max-height:\s*14\.2rem/);
    assert.match(referenceBlock, /\.episode-replica-shot-card-body\s*\{[\s\S]*?grid-template-columns:\s*minmax\(8rem,\s*0\.68fr\) minmax\(22rem,\s*1\.78fr\) minmax\(13\.2rem,\s*0\.9fr\)/);
    assert.match(referenceBlock, /\.episode-replica-shot-card-body\s*\{[\s\S]*?min-height:\s*0/);
    assert.match(referenceBlock, /\.episode-replica-shot-card-body\s*\{[\s\S]*?overflow:\s*hidden/);
    assert.match(referenceBlock, /\.episode-replica-shot-card \.title\s*\{[\s\S]*?white-space:\s*nowrap/);
    assert.match(referenceBlock, /\.episode-replica-shot-card-column\s*\{[\s\S]*?overflow:\s*hidden/);
    assert.match(referenceBlock, /\.episode-replica-shot-card \.tabs\s*\{[\s\S]*?gap:\s*0\.34rem/);
    assert.match(referenceBlock, /\.episode-replica-shot-card \.tabs::before\s*\{[\s\S]*?content:\s*"做图片"/);
    assert.match(referenceBlock, /\.episode-replica-shot-card \.tabs::after\s*\{[\s\S]*?content:\s*"做视频"/);
    assert.match(referenceBlock, /\.episode-replica-stage-body\s*\{[\s\S]*?align-items:\s*start/);
    assert.match(referenceBlock, /\.episode-replica-generated-stage,\s*\.episode-replica-result-panel\s*\{[\s\S]*?max-width:\s*34rem/);
  });

  it("keeps storyboard and asset cards compact while exposing floating controls", () => {
    const css = readFileSync(
      new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
      "utf8",
    );
    const compactBlock = css.match(
      /\/\* Compact card height and exposed controls \*\/(?<body>[\s\S]*?)\/\* End compact card height and exposed controls \*\//,
    )?.groups?.body ?? "";

    assert.match(compactBlock, /\.episode-replica-asset-grid,\s*\.episode-replica-storyboard-grid\s*\{[\s\S]*?overflow:\s*visible/);
    assert.match(compactBlock, /\.episode-replica-asset-card\s*\{[\s\S]*?height:\s*14\.2rem/);
    assert.match(compactBlock, /\.episode-replica-asset-card\s*\{[\s\S]*?overflow:\s*visible/);
    assert.match(compactBlock, /\.episode-replica-layout\.storyboard-mode \.episode-replica-shot-card\s*\{[\s\S]*?height:\s*13\.2rem/);
    assert.match(compactBlock, /\.episode-replica-shot-card\s*\{[\s\S]*?overflow:\s*visible/);
    assert.match(compactBlock, /\.episode-replica-shot-card-body\s*\{[\s\S]*?overflow:\s*hidden/);
    assert.match(compactBlock, /\.episode-replica-asset-card \.episode-replica-asset-hover-tools\s*\{[\s\S]*?z-index:\s*8/);
    assert.match(compactBlock, /\.episode-replica-shot-shell \.episode-replica-shot-hover-tools\s*\{[\s\S]*?z-index:\s*8/);
  });

  it("adds shared top padding to asset and storyboard workbench columns", () => {
    const css = readFileSync(
      new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
      "utf8",
    );
    const paddingBlock = css.match(
      /\/\* Shared asset and storyboard layout top padding \*\/(?<body>[\s\S]*?)\/\* End shared asset and storyboard layout top padding \*\//,
    )?.groups?.body ?? "";

    assert.match(paddingBlock, /\.episode-replica-layout\.assets-mode,\s*\.episode-replica-layout\.storyboard-mode\s*\{[\s\S]*?padding-top:\s*5%/);
  });

  it("caps asset and storyboard prompt panels at the requested height", () => {
    const css = readFileSync(
      new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
      "utf8",
    );
    const maxHeightBlock = css.match(
      /\/\* Shared asset and storyboard prompt max height \*\/(?<body>[\s\S]*?)\/\* End shared asset and storyboard prompt max height \*\//,
    )?.groups?.body ?? "";

    assert.match(maxHeightBlock, /\.episode-replica-layout\.assets-mode \.episode-replica-prompt,\s*\.episode-replica-layout\.storyboard-mode \.episode-replica-prompt\s*\{[\s\S]*?max-height:\s*26\.8rem/);
  });

  it("widens the storyboard dialog column leftward by one sixth", () => {
    const css = readFileSync(
      new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
      "utf8",
    );
    const widenBlock = css.match(
      /\/\* Widen storyboard dialog column \*\/(?<body>[\s\S]*?)\/\* End widen storyboard dialog column \*\//,
    )?.groups?.body ?? "";

    assert.match(widenBlock, /\.episode-replica-layout\.storyboard-mode\s*\{[\s\S]*?grid-template-columns:\s*minmax\(38\.5rem,\s*58fr\) minmax\(31\.5rem,\s*34fr\) minmax\(6\.8rem,\s*8fr\)/);
    assert.match(widenBlock, /@media\s*\(min-width:\s*1680px\)\s*\{[\s\S]*?\.episode-replica-layout\.storyboard-mode\s*\{[\s\S]*?grid-template-columns:\s*minmax\(50\.5rem,\s*58fr\) minmax\(38\.5rem,\s*34fr\) minmax\(7rem,\s*8fr\)/);
  });

  it("stretches the storyboard tabs area to sit flush with the bottom edge", () => {
    const css = readFileSync(
      new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
      "utf8",
    );
    const stretchBlock = css.match(
      /\/\* Stretch storyboard tabs area to the bottom edge \*\/(?<body>[\s\S]*?)\/\* End stretch storyboard tabs area to the bottom edge \*\//,
    )?.groups?.body ?? "";

    assert.match(stretchBlock, /\.episode-replica-layout\.storyboard-mode \.episode-replica-left\s*\{[\s\S]*?display:\s*grid/);
    assert.match(stretchBlock, /\.episode-replica-layout\.storyboard-mode \.episode-replica-left\s*\{[\s\S]*?grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto/);
    assert.match(stretchBlock, /\.episode-replica-layout\.storyboard-mode \.episode-replica-left\s*\{[\s\S]*?padding-bottom:\s*0/);
    assert.match(stretchBlock, /\.episode-replica-layout\.storyboard-mode \.episode-replica-storyboard-grid\s*\{[\s\S]*?height:\s*100%/);
    assert.match(stretchBlock, /\.episode-replica-layout\.storyboard-mode \.episode-replica-storyboard-pagination\s*\{[\s\S]*?position:\s*sticky/);
    assert.match(stretchBlock, /\.episode-replica-layout\.storyboard-mode \.episode-replica-storyboard-pagination\s*\{[\s\S]*?bottom:\s*0/);
    assert.match(stretchBlock, /\.episode-replica-layout\.storyboard-mode \.episode-replica-storyboard-pagination\s*\{[\s\S]*?padding:\s*0\.9rem 0 0/);
  });

  it("halves the storyboard attachment column width", () => {
    const css = readFileSync(
      new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
      "utf8",
    );
    const halveBlock = css.match(
      /\/\* Halve storyboard attachment column width \*\/(?<body>[\s\S]*?)\/\* End halve storyboard attachment column width \*\//,
    )?.groups?.body ?? "";

    assert.match(halveBlock, /\.episode-replica-layout\.storyboard-mode \.episode-replica-shot-card-body\s*\{[\s\S]*?grid-template-columns:\s*minmax\(8rem,\s*0\.7fr\) minmax\(23\.5rem,\s*2\.15fr\) minmax\(6\.6rem,\s*0\.48fr\)/);
    assert.match(halveBlock, /\.episode-replica-layout\.storyboard-mode \.episode-replica-shot-media-placeholder\s*\{[\s\S]*?width:\s*min\(5\.8rem,\s*100%\)/);
    assert.match(halveBlock, /\.episode-replica-layout\.storyboard-mode \.episode-replica-shot-ref-card\s*\{[\s\S]*?height:\s*4rem/);
    assert.match(halveBlock, /\.episode-replica-layout\.storyboard-mode \.episode-replica-shot-card \.preview \.episode-replica-shot-video-preview,\s*\.episode-replica-layout\.storyboard-mode \.episode-replica-shot-card \.preview \.episode-replica-shot-video-preview video\s*\{[\s\S]*?min-height:\s*0/);
    assert.match(halveBlock, /\.episode-replica-layout\.storyboard-mode \.episode-replica-shot-card \.preview \.episode-replica-shot-video-preview,\s*\.episode-replica-layout\.storyboard-mode \.episode-replica-shot-card \.preview \.episode-replica-shot-video-preview video\s*\{[\s\S]*?max-height:\s*100%/);
    assert.match(halveBlock, /@media\s*\(min-width:\s*1680px\)\s*\{[\s\S]*?\.episode-replica-layout\.storyboard-mode \.episode-replica-shot-card-body\s*\{[\s\S]*?grid-template-columns:\s*minmax\(8\.5rem,\s*0\.7fr\) minmax\(25rem,\s*2\.2fr\) minmax\(7rem,\s*0\.5fr\)/);
  });

  it("selects storyboard cards from the card surface without hijacking form controls", () => {
    const source = readFileSync(
      new URL("../src/features/production-workbench/index.js", import.meta.url),
      "utf8",
    );

    assert.match(source, /episode-replica-shot-card\[data-storyboard-id\]/);
    assert.match(source, /action:\s*"select-storyboard"/);
    assert.match(source, /storyboardId:\s*storyboardCardTarget\.dataset\.storyboardId/);
    assert.match(source, /textarea,\s*input,\s*button,\s*select,\s*option,\s*label,\s*a,\s*\[contenteditable='true'\]/);
  });

  it("keeps the video prompt scroll position stable when clicking inside text", () => {
    const source = readFileSync(
      new URL("../src/features/production-workbench/index.js", import.meta.url),
      "utf8",
    );

    assert.match(source, /function snapshotPromptMentionUi/);
    assert.match(source, /function hasPromptMentionUiChanged/);
    assert.match(source, /const scrollTop = Number\(target\.scrollTop \?\? 0\)/);
    assert.match(source, /if \(!hasPromptMentionUiChanged\(beforeMentionUi, workbench\)\)\s*\{[\s\S]*?return;\s*\}/);
    assert.match(source, /textarea\.scrollTop = scrollTop/);
  });

  it("keeps the asset section tabs pinned above the scrolling asset list", () => {
    const css = readFileSync(
      new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
      "utf8",
    );
    const headBlock = [...css.matchAll(
      /\.episode-replica-asset-toolbar\.unified \.episode-replica-asset-toolbar-head\s*\{(?<body>[^}]*)\}/g,
    )].at(-1)?.groups?.body ?? "";
    const sectionsBlock = [...css.matchAll(
      /\.episode-replica-asset-sections\s*\{(?<body>[^}]*)\}/g,
    )].at(-1)?.groups?.body ?? "";
    const gridBlock = [...css.matchAll(
      /\.episode-replica-asset-grid\s*\{(?<body>[^}]*)\}/g,
    )].map((match) => match.groups?.body ?? "").find((body) =>
      /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/.test(body),
    ) ?? "";

    assert.match(headBlock, /position:\s*sticky/);
    assert.match(headBlock, /top:\s*0/);
    assert.match(headBlock, /z-index:\s*5/);
    assert.match(headBlock, /background:\s*transparent/);
    assert.match(sectionsBlock, /gap:\s*1\.7rem/);
    assert.match(sectionsBlock, /scroll-margin-top:\s*4\.1rem/);
    assert.match(gridBlock, /gap:\s*2rem/);
  });

  it("keeps the left asset scroll position when selecting asset cards", () => {
    const source = readFileSync(
      new URL("../src/features/production-workbench/index.js", import.meta.url),
      "utf8",
    );
    const selectAssetBlock = source.slice(
      source.indexOf('if (action === "set-episode-asset")'),
      source.indexOf('if (action === "toggle-episode-asset-selection")'),
    );
    const toggleSelectionBlock = source.slice(
      source.indexOf('if (action === "toggle-episode-asset-selection")'),
      source.indexOf('if (action === "toggle-episode-asset-select-all")'),
    );

    assert.match(selectAssetBlock, /renderPreservingEpisodeAssetScroll\(workbench\)/);
    assert.doesNotMatch(selectAssetBlock, /\n\s*render\(workbench\);/);
    assert.match(toggleSelectionBlock, /renderPreservingEpisodeAssetScroll\(workbench\)/);
    assert.doesNotMatch(toggleSelectionBlock, /\n\s*render\(workbench\);/);
  });

  it("uses episode workbench context assets without requesting the episode asset list", () => {
    const source = readFileSync(
      new URL("../src/features/production-workbench/index.js", import.meta.url),
      "utf8",
    );
    const enterWorkbenchBlock = source.slice(
      source.indexOf("async function enterEpisodeWorkbench"),
      source.indexOf("async function loadEpisodeStoryboardsForWorkbench"),
    );
    const contextAssetBlock = source.slice(
      source.indexOf("function applyEpisodeWorkbenchAssetsFromContext"),
      source.indexOf("async function loadEpisodeStoryboardsForWorkbench"),
    );

    assert.match(enterWorkbenchBlock, /resetEpisodeWorkbenchAssets\(workbench\)/);
    assert.match(enterWorkbenchBlock, /applyEpisodeWorkbenchAssetsFromContext\(workbench,\s*context\)/);
    assert.doesNotMatch(enterWorkbenchBlock, /loadEpisodeAssetsForWorkbench\(workbench,\s*resolvedEpisodeId\)/);
    assert.match(contextAssetBlock, /context\?\.assetsByType/);
    assert.match(contextAssetBlock, /context\?\.assets/);
    assert.match(contextAssetBlock, /context\?\.episodeAssets/);
  });

  it("accepts episode workbench api responses that still wrap assets under data", () => {
    const source = readFileSync(
      new URL("../src/features/production-workbench/index.js", import.meta.url),
      "utf8",
    );
    const contextAssetBlock = source.slice(
      source.indexOf("function applyEpisodeWorkbenchAssetsFromContext"),
      source.indexOf("async function loadEpisodeStoryboardsForWorkbench"),
    );

    assert.match(contextAssetBlock, /context\?\.data\?\.assetsByType/);
    assert.match(contextAssetBlock, /context\?\.data\?\.assets/);
    assert.match(contextAssetBlock, /context\?\.data\?\.episodeAssets/);
  });

  it("keeps asset conversation height at content minimum after quick references and generation", () => {
    const css = readFileSync(
      new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
      "utf8",
    );
    const assetScopeBlock = [...css.matchAll(
      /\.episode-replica-generated-stage\.asset-scope\s*\{(?<body>[^}]*)\}/g,
    )].at(-1)?.groups?.body ?? "";

    assert.match(assetScopeBlock, /min-height:\s*0/);
    assert.match(assetScopeBlock, /align-content:\s*start/);
  });

  it("keeps visible generated stages interactive so result actions remain clickable", () => {
    const css = readFileSync(
      new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
      "utf8",
    );
    const visibleBlock = [...css.matchAll(
      /\.episode-replica-generated-stage\.visible\s*\{(?<body>[^}]*)\}/g,
    )].at(-1)?.groups?.body ?? "";

    assert.match(visibleBlock, /pointer-events:\s*auto/);
    assert.doesNotMatch(visibleBlock, /pointer-events:\s*none/);
  });

  it("keeps the storyboard composer fully inside the visible right dialog column", () => {
    const css = readFileSync(
      new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
      "utf8",
    );
    const finalLayoutBlock = css.slice(css.lastIndexOf("/* Final composition target"));

    assert.match(finalLayoutBlock, /height:\s*calc\(100dvh - 4\.85rem\)/);
    assert.match(finalLayoutBlock, /padding-top:\s*0/);
    assert.match(finalLayoutBlock, /min-height:\s*0/);
    assert.match(finalLayoutBlock, /box-sizing:\s*border-box/);
    assert.match(finalLayoutBlock, /--storyboard-video-composer-height:\s*24rem/);
    assert.match(finalLayoutBlock, /\.episode-replica-layout\.storyboard-mode \.episode-replica-center\.video-mode[\s\S]*?grid-template-rows:\s*auto minmax\(0,\s*auto\) var\(--storyboard-video-composer-height,\s*24rem\)/);
    assert.match(finalLayoutBlock, /position:\s*relative/);
    assert.match(finalLayoutBlock, /z-index:\s*4/);
    assert.match(finalLayoutBlock, /pointer-events:\s*auto/);
    assert.match(css, /\.episode-replica-center\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    assert.match(finalLayoutBlock, /\.episode-replica-layout\.storyboard-mode \.episode-replica-prompt-footer[\s\S]*?flex-shrink:\s*0/);
    assert.match(finalLayoutBlock, /\.episode-replica-layout\.storyboard-mode \.episode-replica-prompt-footer[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\) auto/);
    assert.match(css, /\.episode-replica-prompt-footer \.episode-replica-generate\s*\{[\s\S]*?background:\s*#98d6ff/);
  });

  it("hydrates episode assets from the workbench api when entering asset scope or switching asset tabs", () => {
    const source = readFileSync(
      new URL("../src/features/production-workbench/index.js", import.meta.url),
      "utf8",
    );
    const setScopeBlock = source.slice(
      source.indexOf('if (action === "set-muse-scope-mode")'),
      source.indexOf('if (action === "toggle-muse-prompt-menu")'),
    );
    const setAssetTabBlock = source.slice(
      source.indexOf('if (action === "set-project-asset-tab")'),
      source.indexOf('if (action === "set-project-other-asset-media")'),
    );

    assert.match(setScopeBlock, /await ensureEpisodeWorkbenchAssetsHydrated\(workbench\)/);
    assert.match(setAssetTabBlock, /await ensureEpisodeWorkbenchAssetsHydrated\(workbench\)/);
  });
});

describe("production workbench script entry", () => {
  it("renders the ReelMate script management entry instead of a generic upload placeholder", () => {
    const html = renderProductionWorkbench({
      state: {},
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "script",
        storyboards: [],
        selectedStoryboard: null,
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        isOriginalScriptModalOpen: false,
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
      },
    });

    assert.match(html, /从分析开始改编小说/);
    assert.match(html, /直接开始改编小说/);
    assert.match(html, /从故事灵感创作剧本/);
    assert.match(html, /从剧本创作衍生剧本/);
    assert.match(html, /我的剧本/);
    assert.match(html, /placeholder="搜索剧本名称"/);
    assert.match(html, /类型筛选/);
    assert.match(html, /排序/);
    assert.match(html, /积分详情/);
  });

  it("renders persisted script records from project detail and links them to the episode workspace", () => {
    const html = renderProductionWorkbench({
      state: {
        project: {
          id: "project-1",
          name: "废土人第二集",
          phase: "asset_review",
          aspectRatio: "9:16",
          resolution: "1080p",
          updatedAt: "2026-05-29T09:30:00.000Z",
        },
        script: {
          id: "script-1",
          projectId: "project-1",
          status: "ready",
          inputText: "第一集：主角在废墟里醒来，发现时间停止，只剩风声和远处的霓虹故障闪烁。",
          updatedAt: "2026-05-29T09:31:00.000Z",
        },
        projectDetail: {
          project: {
            id: "project-1",
            name: "废土人第二集",
            phase: "asset_review",
            aspectRatio: "9:16",
            resolution: "1080p",
            updatedAt: "2026-05-29T09:30:00.000Z",
          },
          script: {
            id: "script-1",
            projectId: "project-1",
            status: "ready",
            inputText: "第一集：主角在废墟里醒来，发现时间停止，只剩风声和远处的霓虹故障闪烁。",
            updatedAt: "2026-05-29T09:31:00.000Z",
          },
          episodes: [
            { id: "episode-1", title: "第1集", storyboardCount: 0 },
            { id: "episode-2", title: "第2集", storyboardCount: 0 },
          ],
          shots: [],
        },
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "script",
        storyboards: [],
        selectedStoryboard: null,
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        isOriginalScriptModalOpen: false,
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
      },
    });

    assert.match(html, /废土人第二集/);
    assert.match(html, /待拆镜/);
    assert.match(html, /小说改编|原始剧本/);
    assert.match(html, /集数<\/dt><dd>2/);
    assert.match(html, /分镜<\/dt><dd>0/);
    assert.match(html, /data-action="parse-script"/);
    assert.match(html, /data-action="open-project-workspace" data-project-id="project-1"/);
    assert.doesNotMatch(html, /暂无剧本/);
  });

  it("filters persisted script records by search and type inside the script page", () => {
    const html = renderProductionWorkbench({
      state: {
        project: {
          id: "project-1",
          name: "剧集工作台联调",
          phase: "asset_review",
          updatedAt: "2026-05-29T10:00:00.000Z",
        },
        script: {
          id: "script-1",
          projectId: "project-1",
          status: "ready",
          inputText: "第1集：主角在废土街区醒来，发现时间停止，只剩风声和霓虹故障闪烁。第2集：他带着旧式通讯器进入山谷营地，准备继续追查。第3集：营地里的旧档案揭示了城市停滞前的实验记录，第4集：他必须在残破街区、地下通道和高楼边缘之间来回穿梭，拼出整场灾变的真相。",
          updatedAt: "2026-05-29T10:01:00.000Z",
        },
        projectDetail: {
          project: {
            id: "project-1",
            name: "剧集工作台联调",
            phase: "asset_review",
            updatedAt: "2026-05-29T10:00:00.000Z",
          },
          script: {
            id: "script-1",
            projectId: "project-1",
            status: "ready",
            inputText: "第1集：主角在废土街区醒来，发现时间停止，只剩风声和霓虹故障闪烁。第2集：他带着旧式通讯器进入山谷营地，准备继续追查。第3集：营地里的旧档案揭示了城市停滞前的实验记录，第4集：他必须在残破街区、地下通道和高楼边缘之间来回穿梭，拼出整场灾变的真相。",
            updatedAt: "2026-05-29T10:01:00.000Z",
          },
          episodes: [{ id: "episode-1", title: "第1集", storyboardCount: 0 }],
          shots: [],
        },
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "script",
        storyboards: [],
        selectedStoryboard: null,
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        isOriginalScriptModalOpen: false,
        scriptTab: "script-upload",
        scriptSearchQuery: "联调",
        scriptTypeFilter: "source-script",
        scriptSortOrder: "updated-desc",
        uploadNotice: "",
        defaultScript: "Episode 1",
      },
    });

    assert.match(html, /data-action="search-scripts"/);
    assert.match(html, /data-action="set-script-type-filter"/);
    assert.match(html, /data-action="set-script-sort-order"/);
    assert.match(html, /剧集工作台联调/);
    assert.match(html, /原始剧本/);
    assert.doesNotMatch(html, /未找到匹配剧本/);
  });

  it("renders AI original script settings with required disabled state and episode options", () => {
    const html = renderProductionWorkbench({
      state: {},
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "script",
        storyboards: [],
        selectedStoryboard: null,
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        isOriginalScriptModalOpen: true,
        originalScriptDraft: {
          fileName: "逆光试映",
          inspiration: "一个底层剪辑师发现城市记忆被算法改写。",
          episodeCount: "",
        },
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
      },
    });

    assert.match(html, /aria-label="AI原创剧本设定"/);
    assert.match(html, /文件名称/);
    assert.match(html, /剧本受众/);
    assert.match(html, /题材看点/);
    assert.match(html, /拆分集数/);
    assert.match(html, /分卡设置/);
    assert.match(html, /每集长度/);
    assert.match(html, /创作灵感/);
    assert.match(html, /40集/);
    assert.match(html, /50集/);
    assert.match(html, /60集/);
    assert.match(html, /自定义分集（1-100）/);
    assert.match(html, /data-action="submit-original-script-settings" disabled>完成设定，生成规划方案/);
  });

  it("enables the original script plan action once name, inspiration, and episode count are present", () => {
    const html = renderProductionWorkbench({
      state: {},
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "script",
        storyboards: [],
        selectedStoryboard: null,
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        isOriginalScriptModalOpen: true,
        originalScriptDraft: {
          fileName: "逆光试映",
          inspiration: "一个底层剪辑师发现城市记忆被算法改写。",
          episodeCount: "40集",
        },
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
      },
    });

    assert.match(html, /data-action="submit-original-script-settings" >完成设定，生成规划方案/);
  });
});

describe("workbench generation payloads and inspectors", () => {
  it("renders the asset inspector modal for current-page media details", () => {
    const state = {
      project: {
        id: "project-1",
        name: "try",
        phase: "asset_review",
        aspectRatio: "9:16",
        resolution: "1080p",
      },
      assetReview: { readyForGeneration: false },
      assetCandidates: { characters: [], scenes: [], props: [] },
      calibration: null,
      shots: [],
      exportPreview: null,
    };
    const storyboards = [
      {
        ...addStoryboard([])[0],
        uploadedImageName: "frame-01.png",
        previewImageUrl: "/uploads/storyboard-images/frame-01.png",
        imageStatus: "ready",
      },
    ];

    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        storyboards,
        selectedStoryboard: storyboards[0],
        selectedStoryboardId: storyboards[0].id,
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        projectPanelMode: "episode-workbench",
        projectInteriorSection: "episodes",
        selectedEpisodeId: "episode-new",
        episodeMediaMode: "image",
        episodeStoryboardMap: {
          "episode-new": storyboards,
        },
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        assetInspector: {
          type: "image",
          title: "分镜图片",
          name: "frame-01.png",
          url: "/uploads/storyboard-images/frame-01.png",
          status: "ready",
        },
      },
    });

    assert.match(html, /asset-inspector-dialog/);
    assert.match(html, /data-action="close-asset-inspector"/);
    assert.match(html, /frame-01\.png/);
  });

  it("builds image generation payload with visible controls and references", () => {
    const storyboard = {
      ...addStoryboard([])[0],
      linkedShotId: "shot-1",
      description: "close-up hero frame",
      references: [{ role: "character", assetId: "asset-character-1" }],
      generationState: {
        firstFrame: {
          name: "first.png",
          kind: "image",
          status: "ready",
          url: "/uploads/first.png",
        },
        imageReference: {
          name: "ref.png",
          kind: "image",
          status: "ready",
          url: "/uploads/ref.png",
          cropMode: "contain",
        },
        localReferenceRoles: ["scene"],
      },
    };
    const payload = buildImageGenerationPayload({
      state: { project: { aspectRatio: "9:16" } },
      ui: {
        storyboards: [storyboard],
        selectedStoryboardId: storyboard.id,
        prompt: "enhanced prompt",
        selectedModelId: "jimeng-4-5",
        imageGenerationMode: "single-image",
        imageCount: 3,
        imageResolution: "4K",
        imageAspectRatio: "1:1",
        multiImageStrategy: "spatial-multi-view",
        projectPanelMode: "workspace",
      },
    });

    assert.equal(payload.shotId, "shot-1");
    assert.equal(payload.promptOverride, "enhanced prompt");
    assert.equal(payload.model, "jimeng-4-5");
    assert.equal(payload.parameters.count, 3);
    assert.equal(payload.parameters.resolution, "4K");
    assert.equal(payload.parameters.aspectRatio, "1:1");
    assert.equal(payload.parameters.imageReference?.url, "/uploads/ref.png");
    assert.deepEqual(payload.parameters.references, [{ role: "character", assetId: "asset-character-1" }]);
    assert.deepEqual(payload.parameters.localReferenceRoles, ["scene"]);
  });

  it("allows quick reference append from asset scope without requiring a storyboard selection", () => {
    const workbench = {
      state: {
        episodes: [{ id: "episode-1", title: "第一集" }],
      },
      ui: {
        museScopeMode: "assets",
        prompt: "",
        selectedEpisodeId: "episode-1",
        projectAssetTab: "character",
        selectedEpisodeAssetId: "asset-1",
        importedAssets: {
          character: [
            {
              id: "asset-1",
              name: "李唯/破旧麻袋衣",
              description: "灰黑短发，破旧麻袋衣，警惕眼神，面部疲惫。",
              previewUrl: "/uploads/asset-1.avif",
            },
          ],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
      },
    };

    const result = appendSelectedEpisodeAssetToPrompt(workbench);

    assert.equal(result.ok, true);
    assert.equal(
      workbench.ui.prompt,
      "灰黑短发，破旧麻袋衣，警惕眼神，面部疲惫。",
    );
    assert.equal(workbench.ui.episodeWorkbenchConversationScrollMode, "latest");
    assert.equal(workbench.ui.assetPromptDraft?.scopeMode, "assets");
    assert.equal(workbench.ui.assetPromptDraft?.selectionContext?.selectedAssetId, "asset-1");
    assert.equal(workbench.ui.assetPromptDraft?.quickReferenceItems?.length, 1);
  });

  it("prefers the currently selected episode asset over stale active-card dom context when appending quick references", () => {
    const storyboards = addStoryboard([]);
    const workbench = {
      ui: {
        projectPanelMode: "episode-workbench",
        projectInteriorSection: "episodes",
        museScopeMode: "storyboard",
        selectedEpisodeId: "episode-new",
        selectedStoryboard: storyboards[0],
        selectedStoryboardId: storyboards[0].id,
        storyboards,
        episodeStoryboardMap: {
          "episode-new": storyboards,
        },
        importedAssets: {
          character: [
            {
              id: "asset-active-old",
              name: "旧激活角色",
              description: "这个描述不该被引用",
              preview: "/uploads/old.png",
              kind: "character",
            },
            {
              id: "asset-selected-new",
              name: "废土主角",
              description: "瘦削、警惕、穿破旧夹克，肩背磨损背包，面部有风沙痕迹。",
              preview: "/uploads/hero.png",
              kind: "character",
            },
          ],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
        selectedEpisodeAssetId: "asset-selected-new",
        selectedEpisodeCardId: "asset-selected-new",
        projectAssetTab: "character",
        prompt: "",
      },
      root: {
        querySelector(selector) {
          if (selector !== ".episode-replica-asset-card.active") {
            return null;
          }
          return {
            getAttribute(name) {
              if (name === "data-asset-card-id") return "asset-active-old";
              if (name === "data-asset-kind") return "character";
              return null;
            },
            querySelector(innerSelector) {
              if (innerSelector === ".episode-replica-asset-select .name") {
                return { textContent: "旧激活角色" };
              }
              if (innerSelector === ".episode-replica-asset-desc-input") {
                return { value: "这个描述不该被引用" };
              }
              if (innerSelector === ".preview img") {
                return { getAttribute: () => "/uploads/old.png" };
              }
              if (innerSelector === ".preview") {
                return { innerHTML: '<img src="/uploads/old.png" alt="" />' };
              }
              return null;
            },
          };
        },
      },
    };

    const result = appendSelectedEpisodeAssetToPrompt(workbench);
    assert.equal(result.ok, true);
    assert.match(String(workbench.ui.prompt ?? ""), /废土主角/);
    assert.doesNotMatch(String(workbench.ui.prompt ?? ""), /旧激活角色/);
    assert.equal(
      storyboards[0].generationState?.quickReferenceItems?.[0]?.description ??
        workbench.ui.episodeStoryboardMap?.["episode-new"]?.[0]?.generationState?.quickReferenceItems?.[0]?.description,
      "瘦削、警惕、穿破旧夹克，肩背磨损背包，面部有风沙痕迹。",
    );
  });

  it("updates the active episode asset description across local render sources after saving", () => {
    const workbench = {
      state: {
        project: { id: "project-1", aspectRatio: "9:16" },
        projectDetail: {
          assetsByType: {
            character: [
              {
                id: "asset-1",
                label: "白野",
                latestVersion: {
                  metadata: {
                    description: "旧项目描述",
                  },
                },
              },
            ],
            scene: [],
            prop: [],
          },
        },
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        projectPanelMode: "episode-workbench",
        projectInteriorSection: "episodes",
        museScopeMode: "assets",
        selectedEpisodeId: "episode-1",
        projectAssetTab: "character",
        selectedEpisodeAssetId: "asset-1",
        selectedEpisodeCardId: "asset-1",
        selectedModelId: "jimeng-4-5",
        imageGenerationMode: "single-image",
        imageCount: 1,
        imageResolution: "2K",
        imageAspectRatio: "9:16",
        importedAssets: {
          character: [
            {
              id: "asset-1",
              assetId: "asset-1",
              name: "白野",
              description: "旧导入描述",
              previewUrl: "/uploads/asset-1.png",
            },
          ],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
        episodeWorkbenchContext: {
          assetsByType: {
            character: [
              {
                assetId: "asset-1",
                name: "白野",
                description: "旧上下文描述",
                fixedImageUrl: "/uploads/asset-1.png",
              },
            ],
            scene: [],
            prop: [],
          },
        },
        assetPromptDraft: {
          selectionContext: {
            selectedAssetId: "asset-1",
            selectedAssetDescription: "旧选择描述",
          },
          quickReferenceItems: [
            {
              id: "asset-1",
              assetId: "asset-1",
              description: "旧快捷引用描述",
              promptPreview: "旧快捷引用描述",
            },
          ],
          mentionReferences: [],
        },
      },
    };

    syncEpisodeAssetDescriptionState(workbench, "character", "asset-1", "新角色文案");

    const html = renderProductionWorkbench(workbench);
    assert.match(html, /角色白野：新角色文案/);
    assert.match(html, />新角色文案<\/textarea>/);
    assert.doesNotMatch(html, /旧上下文描述/);
    assert.equal(workbench.ui.importedAssets.character[0].description, "新角色文案");
    assert.equal(workbench.ui.episodeWorkbenchContext.assetsByType.character[0].description, "新角色文案");
    assert.equal(workbench.state.projectDetail.assetsByType.character[0].latestVersion.metadata.description, "新角色文案");
    assert.equal(workbench.ui.assetPromptDraft.selectionContext.selectedAssetDescription, "新角色文案");
    assert.equal(workbench.ui.assetPromptDraft.quickReferenceItems[0].promptPreview, "新角色文案");
  });

  it("quick references the selected storyboard text and media before falling back to assets", () => {
    const [storyboard] = addStoryboard([]);
    const storyboards = [
      {
        ...storyboard,
        id: "storyboard-quick",
        description: "角色1: 自己的角色描述，随意更改",
        previewImageUrl: "/uploads/storyboard-image.png",
        currentImageAssetVersionId: "image-1",
        uploadedImages: [{ id: "image-1", src: "/uploads/storyboard-image.png", status: "ready" }],
      },
    ];
    const workbench = {
      ui: {
        projectPanelMode: "episode-workbench",
        museScopeMode: "storyboard",
        episodeMediaMode: "image",
        selectedEpisodeId: "episode-new",
        selectedStoryboardId: "storyboard-quick",
        selectedStoryboard: storyboards[0],
        storyboards,
        episodeStoryboardMap: {
          "episode-new": storyboards,
        },
        projectAssetTab: "character",
        selectedEpisodeAssetId: "asset-should-not-use",
        prompt: "",
        importedAssets: {
          character: [
            {
              id: "asset-should-not-use",
              name: "不应引用的资产",
              description: "资产描述不应该写入",
              previewUrl: "/uploads/asset.png",
            },
          ],
          scene: [],
          prop: [],
        },
      },
    };

    const result = appendSelectedEpisodeAssetToPrompt(workbench);
    const updatedStoryboard = workbench.ui.episodeStoryboardMap["episode-new"][0];

    assert.equal(result.ok, true);
    assert.equal(workbench.ui.prompt, "角色1: 自己的角色描述，随意更改");
    assert.equal(updatedStoryboard.generationState.quickReferenceItems.length, 1);
    assert.deepEqual(updatedStoryboard.generationState.quickReferenceItems[0], {
      id: "quick-ref:storyboard-image:storyboard-quick:image-1",
      assetId: "storyboard-quick",
      sourceStoryboardId: "storyboard-quick",
      kind: "image",
      name: "分镜 1 图片",
      description: "角色1: 自己的角色描述，随意更改",
      preview: "/uploads/storyboard-image.png",
      url: "/uploads/storyboard-image.png",
      voiceId: null,
      voiceName: "",
      voiceSource: null,
    });
    assert.doesNotMatch(workbench.ui.prompt, /资产描述不应该写入/);
  });

  it("does not duplicate selected storyboard quick reference text when clicked repeatedly", () => {
    const [storyboard] = addStoryboard([]);
    const storyboards = [
      {
        ...storyboard,
        id: "storyboard-quick-repeat",
        description: "角色1: 自己的角色描述，随意更改",
        previewImageUrl: "/uploads/storyboard-image.png",
        currentImageAssetVersionId: "image-1",
        uploadedImages: [{ id: "image-1", src: "/uploads/storyboard-image.png", status: "ready" }],
      },
    ];
    const workbench = {
      ui: {
        projectPanelMode: "episode-workbench",
        museScopeMode: "storyboard",
        episodeMediaMode: "image",
        selectedEpisodeId: "episode-new",
        selectedStoryboardId: "storyboard-quick-repeat",
        storyboards,
        episodeStoryboardMap: {
          "episode-new": storyboards,
        },
        prompt: "",
        importedAssets: {
          character: [],
          scene: [],
          prop: [],
        },
      },
    };

    const firstResult = appendSelectedEpisodeAssetToPrompt(workbench);
    const secondResult = appendSelectedEpisodeAssetToPrompt(workbench);
    const updatedStoryboard = workbench.ui.episodeStoryboardMap["episode-new"][0];

    assert.equal(firstResult.ok, true);
    assert.equal(secondResult.ok, true);
    assert.equal(workbench.ui.prompt, "角色1: 自己的角色描述，随意更改");
    assert.equal(updatedStoryboard.generationState.quickReferenceItems.length, 1);
  });

  it("keeps storyboard quick references split into separate images in video mode", () => {
    const [storyboard] = addStoryboard([]);
    const storyboards = [
      {
        ...storyboard,
        id: "storyboard-video-quick",
        description: "故事发生场景：（黑山森林西区/下午/鹅绒暗影）\n分镜过渡（00:00-00:01）：-\n镜头1（00:01-00:04）：",
        plotPreview: "旧的剧情字段不该优先",
        previewImageUrl: "/uploads/storyboard-video-cover.png",
        currentImageAssetVersionId: "image-cover-1",
        uploadedImages: [{ id: "image-cover-1", src: "/uploads/storyboard-video-cover.png", status: "ready" }],
        previewVideo: "/uploads/storyboard-video.mp4",
        selectedUploadedVideoId: "video-1",
        uploadedVideos: [{ id: "video-1", src: "/uploads/storyboard-video.mp4", status: "ready" }],
        references: [
          { role: "character", assetId: "asset-1", name: "角色一", previewUrl: "/uploads/ref-1.png" },
          { role: "scene", assetId: "asset-2", name: "场景二", previewUrl: "/uploads/ref-2.png" },
          { role: "prop", assetId: "asset-3", name: "道具三", previewUrl: "/uploads/ref-3.png" },
        ],
      },
    ];
    const workbench = {
      ui: {
        projectPanelMode: "episode-workbench",
        museScopeMode: "storyboard",
        episodeMediaMode: "video",
        selectedEpisodeId: "episode-new",
        selectedStoryboardId: "storyboard-video-quick",
        storyboards,
        episodeStoryboardMap: {
          "episode-new": storyboards,
        },
        prompt: "",
        importedAssets: {
          character: [],
          scene: [],
          prop: [],
        },
      },
    };

    const result = appendSelectedEpisodeAssetToPrompt(workbench);
    const quickReferences = workbench.ui.episodeStoryboardMap["episode-new"][0].generationState.quickReferenceItems;
    const reference = quickReferences[0];

    assert.equal(result.ok, true);
    assert.equal(workbench.ui.prompt, "故事发生场景：（黑山森林西区/下午/鹅绒暗影）\n分镜过渡（00:00-00:01）：-\n镜头1（00:01-00:04）：");
    assert.equal(quickReferences.length, 3);
    assert.equal(reference.kind, "image");
    assert.equal(reference.preview, "/uploads/ref-1.png");
    assert.equal(reference.url, "/uploads/ref-1.png");
    assert.equal(reference.description, "故事发生场景：（黑山森林西区/下午/鹅绒暗影）\n分镜过渡（00:00-00:01）：-\n镜头1（00:01-00:04）：");
    assert.deepEqual(
      quickReferences.map((item) => item.preview),
      ["/uploads/ref-1.png", "/uploads/ref-2.png", "/uploads/ref-3.png"],
    );
  });

  it("quick references selected storyboard text with preview image even when uploaded image records are missing", () => {
    const [storyboard] = addStoryboard([]);
    const storyboards = [
      {
        ...storyboard,
        id: "storyboard-preview-only",
        description: "分镜文案：角色在雨夜街口回头",
        previewImageUrl: "/uploads/storyboard-preview-only.png",
        currentImageAssetVersionId: "missing-image-record",
        uploadedImages: [],
      },
    ];
    const workbench = {
      ui: {
        projectPanelMode: "episode-workbench",
        museScopeMode: "storyboard",
        episodeMediaMode: "image",
        selectedEpisodeId: "episode-new",
        selectedStoryboardId: "storyboard-preview-only",
        storyboards,
        episodeStoryboardMap: {
          "episode-new": storyboards,
        },
        prompt: "",
        importedAssets: {
          character: [],
          scene: [],
          prop: [],
        },
      },
    };

    const result = appendSelectedEpisodeAssetToPrompt(workbench);
    const reference = workbench.ui.episodeStoryboardMap["episode-new"][0].generationState.quickReferenceItems[0];

    assert.equal(result.ok, true);
    assert.equal(workbench.ui.prompt, "分镜文案：角色在雨夜街口回头");
    assert.deepEqual(reference, {
      id: "quick-ref:storyboard-image:storyboard-preview-only:missing-image-record",
      assetId: "storyboard-preview-only",
      sourceStoryboardId: "storyboard-preview-only",
      kind: "image",
      name: "分镜 1 图片",
      description: "分镜文案：角色在雨夜街口回头",
      preview: "/uploads/storyboard-preview-only.png",
      url: "/uploads/storyboard-preview-only.png",
      voiceId: null,
      voiceName: "",
      voiceSource: null,
    });
  });

  it("quick references all active storyboard tab images in image mode", () => {
    const [storyboard] = addStoryboard([]);
    const storyboards = [
      {
        ...storyboard,
        id: "storyboard-dom-multi-image",
        description: "分镜文案：三张参考图都要引入",
        previewImageUrl: null,
        currentImageAssetVersionId: null,
        uploadedImages: [],
        references: [],
      },
    ];
    const activeCard = {
      querySelectorAll(selector) {
        if (selector === ".episode-replica-shot-ref-card img") {
          return [
            {
              getAttribute(name) {
                if (name === "src") return "/uploads/dom-ref-1.png";
                if (name === "alt") return "参考图1";
                return null;
              },
            },
            {
              getAttribute(name) {
                if (name === "src") return "/uploads/dom-ref-2.png";
                if (name === "alt") return "参考图2";
                return null;
              },
            },
            {
              getAttribute(name) {
                if (name === "src") return "/uploads/dom-ref-3.png";
                if (name === "alt") return "参考图3";
                return null;
              },
            },
          ];
        }
        return [];
      },
    };
    const workbench = {
      root: {
        querySelector(selector) {
          if (selector === '.episode-replica-shot-card[data-storyboard-id="storyboard-dom-multi-image"]') {
            return activeCard;
          }
          return null;
        },
      },
      ui: {
        projectPanelMode: "episode-workbench",
        museScopeMode: "storyboard",
        episodeMediaMode: "image",
        selectedEpisodeId: "episode-new",
        selectedStoryboardId: "storyboard-dom-multi-image",
        storyboards,
        episodeStoryboardMap: {
          "episode-new": storyboards,
        },
        prompt: "",
        importedAssets: {
          character: [],
          scene: [],
          prop: [],
        },
      },
    };

    const result = appendSelectedEpisodeAssetToPrompt(workbench);
    const quickReferences = workbench.ui.episodeStoryboardMap["episode-new"][0].generationState.quickReferenceItems;
    const reference = quickReferences[0];

    assert.equal(result.ok, true);
    assert.equal(workbench.ui.prompt, "分镜文案：三张参考图都要引入");
    assert.equal(quickReferences.length, 3);
    assert.equal(reference.kind, "image");
    assert.equal(reference.preview, "/uploads/dom-ref-1.png");
    assert.deepEqual(
      quickReferences.map((item) => item.preview),
      ["/uploads/dom-ref-1.png", "/uploads/dom-ref-2.png", "/uploads/dom-ref-3.png"],
    );
  });

  it("carries matched asset voice metadata into storyboard quick references when the prompt uses @ mentions", () => {
    const [storyboard] = addStoryboard([]);
    const storyboards = [
      {
        ...storyboard,
        id: "storyboard-mention-audio",
        description: "分镜文案：主角看向【@白野】与【@黑山密林】。",
        previewImageUrl: null,
        currentImageAssetVersionId: null,
        uploadedImages: [],
        references: [
          { id: "ref-character", role: "character", assetId: "character-1", name: "白野", previewUrl: "/uploads/baiye.png" },
          { id: "ref-scene", role: "scene", assetId: "scene-1", name: "黑山密林", previewUrl: "/uploads/forest.png" },
        ],
      },
    ];
    const workbench = {
      ui: {
        projectPanelMode: "episode-workbench",
        museScopeMode: "storyboard",
        episodeMediaMode: "image",
        selectedEpisodeId: "episode-new",
        selectedStoryboardId: "storyboard-mention-audio",
        storyboards,
        episodeStoryboardMap: {
          "episode-new": storyboards,
        },
        prompt: "",
        importedAssets: {
          character: [
            {
              id: "character-1",
              name: "白野",
              description: "冷淡强势的废土行动者",
              previewUrl: "/uploads/baiye.png",
              voiceId: "system-1",
              voiceName: "女/稚嫩",
              voiceSource: "system",
            },
          ],
          scene: [
            {
              id: "scene-1",
              name: "黑山密林",
              description: "灼热压迫的异植密林",
              previewUrl: "/uploads/forest.png",
              voiceId: "custom-9",
              voiceName: "低沉旁白",
              voiceSource: "custom",
            },
          ],
          prop: [],
        },
      },
    };

    const result = appendSelectedEpisodeAssetToPrompt(workbench);
    const quickReferences = workbench.ui.episodeStoryboardMap["episode-new"][0].generationState.quickReferenceItems;

    assert.equal(result.ok, true);
    assert.equal(quickReferences.length, 2);
    assert.deepEqual(
      quickReferences.map((item) => ({
        name: item.name,
        preview: item.preview,
        voiceId: item.voiceId,
        voiceName: item.voiceName,
        voiceSource: item.voiceSource,
      })),
      [
        {
          name: "分镜 1 图片 1",
          preview: "/uploads/baiye.png",
          voiceId: "system-1",
          voiceName: "女/稚嫩",
          voiceSource: "system",
        },
        {
          name: "分镜 1 图片 2",
          preview: "/uploads/forest.png",
          voiceId: "custom-9",
          voiceName: "低沉旁白",
          voiceSource: "custom",
        },
      ],
    );
  });

  it("appends matched asset audio attachments when quick referencing storyboard mentions", () => {
    const [storyboard] = addStoryboard([]);
    const storyboards = [
      {
        ...storyboard,
        id: "storyboard-mention-audio-attachments",
        description: "分镜文案：主角看向【@白野】。",
        previewImageUrl: null,
        currentImageAssetVersionId: null,
        uploadedImages: [],
        references: [
          { id: "ref-character", role: "character", assetId: "character-1", name: "白野", previewUrl: "/uploads/baiye.png" },
        ],
      },
    ];
    const workbench = {
      ui: {
        projectPanelMode: "episode-workbench",
        museScopeMode: "storyboard",
        episodeMediaMode: "video",
        selectedEpisodeId: "episode-new",
        selectedStoryboardId: "storyboard-mention-audio-attachments",
        storyboards,
        episodeStoryboardMap: {
          "episode-new": storyboards,
        },
        prompt: "",
        episodeWorkbenchAttachments: [],
        episodeWorkbenchSelectedAttachmentIds: [],
        importedAssets: {
          character: [
            {
              id: "character-1",
              name: "白野",
              description: "冷淡强势的废土行动者",
              previewUrl: "/uploads/baiye.png",
              voiceId: "system-1",
              voiceName: "女/稚嫩",
              voiceSource: "system",
            },
          ],
          scene: [],
          prop: [],
        },
      },
    };

    const result = appendSelectedEpisodeAssetToPrompt(workbench);

    assert.equal(result.ok, true);
    assert.equal(workbench.ui.episodeWorkbenchAttachments.length, 1);
    assert.deepEqual(
      {
        id: workbench.ui.episodeWorkbenchAttachments[0]?.id,
        type: workbench.ui.episodeWorkbenchAttachments[0]?.type,
        kind: workbench.ui.episodeWorkbenchAttachments[0]?.kind,
        name: workbench.ui.episodeWorkbenchAttachments[0]?.name,
        summary: workbench.ui.episodeWorkbenchAttachments[0]?.summary,
        voiceId: workbench.ui.episodeWorkbenchAttachments[0]?.voiceId,
        voiceName: workbench.ui.episodeWorkbenchAttachments[0]?.voiceName,
        voiceSource: workbench.ui.episodeWorkbenchAttachments[0]?.voiceSource,
      },
      {
      id: "quick-mention-audio:character:character-1:1",
      type: "audio",
      kind: "audio",
      name: "白野 音频",
      summary: "白野",
      voiceId: "system-1",
      voiceName: "女/稚嫩",
      voiceSource: "system",
      },
    );
    assert.match(workbench.ui.episodeWorkbenchAttachments[0]?.audioUrl ?? "", /^data:audio\/wav;base64,/);
    assert.deepEqual(workbench.ui.episodeWorkbenchSelectedAttachmentIds, ["quick-mention-audio:character:character-1:1"]);
  });

  it("does not duplicate matched asset audio attachments on repeated quick reference", () => {
    const [storyboard] = addStoryboard([]);
    const storyboards = [
      {
        ...storyboard,
        id: "storyboard-mention-audio-repeat",
        description: "分镜文案：主角看向【@白野】。",
        previewImageUrl: null,
        currentImageAssetVersionId: null,
        uploadedImages: [],
        references: [
          { id: "ref-character", role: "character", assetId: "character-1", name: "白野", previewUrl: "/uploads/baiye.png" },
        ],
      },
    ];
    const workbench = {
      ui: {
        projectPanelMode: "episode-workbench",
        museScopeMode: "storyboard",
        episodeMediaMode: "video",
        selectedEpisodeId: "episode-new",
        selectedStoryboardId: "storyboard-mention-audio-repeat",
        storyboards,
        episodeStoryboardMap: {
          "episode-new": storyboards,
        },
        prompt: "",
        episodeWorkbenchAttachments: [],
        episodeWorkbenchSelectedAttachmentIds: [],
        importedAssets: {
          character: [
            {
              id: "character-1",
              name: "白野",
              description: "冷淡强势的废土行动者",
              previewUrl: "/uploads/baiye.png",
              voiceId: "system-1",
              voiceName: "女/稚嫩",
              voiceSource: "system",
            },
          ],
          scene: [],
          prop: [],
        },
      },
    };

    appendSelectedEpisodeAssetToPrompt(workbench);
    appendSelectedEpisodeAssetToPrompt(workbench);

    assert.equal(workbench.ui.episodeWorkbenchAttachments.length, 1);
    assert.deepEqual(workbench.ui.episodeWorkbenchSelectedAttachmentIds, ["quick-mention-audio:character:character-1:1"]);
  });

  it("hydrates video generation frame references from storyboard quick references", () => {
    const [storyboard] = addStoryboard([]);
    const storyboards = [
      {
        ...storyboard,
        id: "storyboard-video-validation-hydration",
        description: "分镜文案：视频生成校验需要首帧。",
        previewImageUrl: null,
        currentImageAssetVersionId: null,
        uploadedImages: [],
        references: [
          { id: "ref-1", role: "character", assetId: "asset-1", name: "角色一", previewUrl: "/uploads/ref-1.png" },
          { id: "ref-2", role: "scene", assetId: "asset-2", name: "场景二", previewUrl: "/uploads/ref-2.png" },
          { id: "ref-3", role: "prop", assetId: "asset-3", name: "道具三", previewUrl: "/uploads/ref-3.png" },
        ],
      },
    ];
    const workbench = {
      ui: {
        projectPanelMode: "episode-workbench",
        museScopeMode: "storyboard",
        episodeMediaMode: "video",
        videoGenerationMode: "first-frame",
        selectedEpisodeId: "episode-new",
        selectedStoryboardId: "storyboard-video-validation-hydration",
        storyboards,
        episodeStoryboardMap: {
          "episode-new": storyboards,
        },
        prompt: "",
        episodeWorkbenchAttachments: [],
        episodeWorkbenchSelectedAttachmentIds: [],
        importedAssets: {
          character: [],
          scene: [],
          prop: [],
        },
      },
    };

    const result = appendSelectedEpisodeAssetToPrompt(workbench);
    const generationState = workbench.ui.episodeStoryboardMap["episode-new"][0].generationState;

    assert.equal(result.ok, true);
    assert.equal(generationState.firstFrame?.url, "/uploads/ref-1.png");
    assert.equal(generationState.imageReference?.url, "/uploads/ref-1.png");
    assert.deepEqual(
      (generationState.referenceUploads ?? []).map((item) => item.url),
      ["/uploads/ref-2.png", "/uploads/ref-3.png"],
    );
    assert.equal(validateVideoGeneration({ firstFrameUploaded: Boolean(generationState.firstFrame?.url) }).ok, true);
  });

  it("allows video generation when quick-referenced storyboard images already hydrated the first frame", async () => {
    const [storyboard] = addStoryboard([]);
    const storyboards = [
      {
        ...storyboard,
        id: "storyboard-video-validation-first-frame",
        generationState: {
          ...storyboard.generationState,
          quickReferenceItems: [
            {
              id: "quick-ref-1",
              kind: "image",
              type: "image",
              name: "分镜 1 图片 1",
              preview: "/uploads/ref-1.png",
              url: "/uploads/ref-1.png",
              description: "分镜文案",
            },
          ],
          firstFrame: {
            id: "quick-ref-1",
            kind: "image",
            type: "image",
            name: "分镜 1 图片 1",
            preview: "/uploads/ref-1.png",
            url: "/uploads/ref-1.png",
            fromQuickReference: true,
          },
        },
      },
    ];
    const workbench = {
      state: {
        shots: [],
        project: {
          id: "project-1",
          aspectRatio: "16:9",
          resolution: "1080p",
        },
      },
      api: {
        createEpisodeVideoTask: async () => ({ task: { id: "task-1", status: "queued" } }),
      },
      ui: {
        projectPanelMode: "episode-workbench",
        museScopeMode: "storyboard",
        episodeMediaMode: "video",
        videoGenerationMode: "first-frame",
        selectedEpisodeId: "episode-new",
        selectedStoryboardId: "storyboard-video-validation-first-frame",
        storyboards,
        episodeStoryboardMap: {
          "episode-new": storyboards,
        },
        prompt: "分镜文案",
        validationMessage: "",
        toast: "",
        busy: false,
        selectedModelId: "vidu-q3-pro",
        videoResolution: "1080p",
        videoDurationSec: 5,
        videoCount: 1,
        videoAudioEnabled: false,
        videoMusicEnabled: false,
        videoLipSyncEnabled: false,
      },
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "generate-videos",
      },
    });

    assert.equal(workbench.ui.validationMessage, "");
    assert.notEqual(workbench.ui.toast, "请先上传首帧图片后再提交视频生成任务");
  });

  it("allows storyboard video generation without confirmed project assets when the selected storyboard already has references", async () => {
    const storyboard = {
      ...addStoryboard([])[0],
      id: "storyboard-generation-ready-from-references",
      linkedShotId: "shot-1",
      description: "分镜文案：已有角色与场景引用",
      references: [
        { id: "ref-1", role: "character", assetId: "asset-1", name: "角色一", previewUrl: "/uploads/ref-1.png" },
        { id: "ref-2", role: "scene", assetId: "asset-2", name: "场景二", previewUrl: "/uploads/ref-2.png" },
      ],
      generationState: {
        ...addStoryboard([])[0].generationState,
        firstFrame: {
          id: "ref-1",
          kind: "image",
          type: "image",
          name: "分镜 1 图片 1",
          preview: "/uploads/ref-1.png",
          url: "/uploads/ref-1.png",
        },
      },
    };
    const createVideoTaskCalls = [];
    const workbench = {
      state: {
        project: {
          id: "project-1",
          name: "try",
          phase: "asset_review",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        assetReview: { readyForGeneration: false },
        assetCandidates: {
          characters: [{ assetKey: "hero", label: "hero", required: true, confirmed: false }],
          scenes: [{ assetKey: "city", label: "city", required: true, confirmed: false }],
          props: [],
        },
        calibration: { status: "ready" },
        shots: [
          {
            id: "shot-1",
            title: "Shot 001",
            currentImageAssetVersionId: null,
            currentVideoAssetVersionId: null,
          },
        ],
        episodes: [{ id: "episode-new", title: "第1集" }],
        projectDetail: {
          project: { id: "project-1", projectId: "project-1", name: "try" },
          episodes: [{ id: "episode-new", title: "第1集", status: "draft" }],
          shots: [
            {
              id: "shot-1",
              title: "Shot 001",
              currentImageAssetVersionId: null,
              currentVideoAssetVersionId: null,
            },
          ],
        },
        exportPreview: null,
      },
      api: {
        runCalibration: async () => ({ workflowId: "workflow-1" }),
        createVideoTask: async (episodeId, payload) => {
          createVideoTaskCalls.push({ episodeId, payload });
          return { taskId: "task-video-1", status: "queued", workflowStatus: "queued", result: {} };
        },
        getProjectDetail: async () => ({
          project: {
            id: "project-1",
            name: "try",
            phase: "shot_generation",
            aspectRatio: "9:16",
            resolution: "1080p",
          },
          assetReview: { readyForGeneration: false },
          assetCandidates: {
            characters: [{ assetKey: "hero", label: "hero", required: true, confirmed: false }],
            scenes: [{ assetKey: "city", label: "city", required: true, confirmed: false }],
            props: [],
          },
          calibration: { status: "ready" },
          shots: [
            {
              id: "shot-1",
              title: "Shot 001",
              currentImageAssetVersionId: null,
              currentVideoAssetVersionId: null,
            },
          ],
          episodes: [{ id: "episode-new", title: "第1集" }],
        }),
      },
      ui: {
        activeNavTab: "project",
        storyboards: [storyboard],
        selectedStoryboard: storyboard,
        selectedModelId: "vidu-q3-pro",
        prompt: "分镜文案：已有角色与场景引用",
        busy: false,
        projectPanelMode: "episode-workbench",
        projectInteriorSection: "episodes",
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        isCreateModalOpen: false,
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
        museScopeMode: "storyboard",
        episodeMediaMode: "video",
        videoGenerationMode: "first-frame",
        selectedEpisodeId: "episode-new",
        selectedStoryboardId: "storyboard-generation-ready-from-references",
        episodeStoryboardMap: {
          "episode-new": [storyboard],
        },
        videoResolution: "1080p",
        videoDurationSec: 5,
        videoCount: 1,
        videoAudioEnabled: false,
        videoMusicEnabled: false,
        videoLipSyncEnabled: false,
      },
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };
    workbench.state.shots = [{ id: "shot-1", title: "Shot 001", currentImageAssetVersionId: null, currentVideoAssetVersionId: null }];

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "generate-videos",
      },
    });

    assert.equal(createVideoTaskCalls.length, 1);
    assert.equal(workbench.ui.toast.includes("Please confirm the required assets first."), false);
  });

  it("submits storyboard image-to-video through Seedance and polls the queued task every 30 seconds", async () => {
    const previousWindow = globalThis.window;
    const timers = [];
    globalThis.window = {
      setTimeout(callback, delayMs) {
        timers.push({ callback, delayMs });
        return timers.length;
      },
      clearTimeout() {},
    };
    const storyboard = {
      ...addStoryboard([])[0],
      id: "storyboard-seedance-i2v",
      linkedShotId: "10000000-0000-4000-8000-000000000123",
      description: "分镜文案：角色从雨夜街口抬头",
      previewImageUrl: "/uploads/storyboard-seedance-first-frame.png",
      currentImageAssetVersionId: "storyboard-first-image",
      uploadedImages: [
        {
          id: "storyboard-first-image",
          src: "/uploads/storyboard-seedance-first-frame.png",
          status: "ready",
        },
      ],
    };
    const createVideoTaskCalls = [];
    const pollCalls = [];
    const workbench = {
      state: {
        project: {
          id: "project-1",
          name: "Seedance I2V",
          phase: "shot_generation",
          aspectRatio: "16:9",
          resolution: "1080p",
        },
        assetReview: { readyForGeneration: true },
        assetCandidates: { characters: [], scenes: [], props: [] },
        calibration: { status: "ready" },
        shots: [{ id: storyboard.linkedShotId, title: "Shot 001" }],
        episodes: [{ id: "episode-new", title: "第1集" }],
        projectDetail: {
          project: { id: "project-1", projectId: "project-1", name: "Seedance I2V" },
          episodes: [{ id: "episode-new", title: "第1集", status: "draft" }],
          shots: [{ id: storyboard.linkedShotId, title: "Shot 001" }],
        },
      },
      api: {
        async createVideoTask(episodeId, payload) {
          createVideoTaskCalls.push({ episodeId, payload });
          return {
            taskId: "seedance-video-task-queued",
            status: "queued",
            workflowStatus: "queued",
            result: {},
          };
        },
        async getGenerationTask(taskId) {
          pollCalls.push(taskId);
          return {
            taskId,
            status: "succeeded",
            workflowStatus: "succeeded",
            result: {
              videoUrl: "https://example.com/seedance-result.mp4",
              assetVersionId: "video-version-1",
              storageObjectId: "video-storage-1",
            },
          };
        },
      },
      ui: {
        activeNavTab: "project",
        storyboards: [storyboard],
        selectedStoryboard: storyboard,
        selectedModelId: "gpt-image-2-cn",
        prompt: "让角色慢慢抬头，雨水从衣袖滑落。",
        busy: false,
        projectPanelMode: "episode-workbench",
        projectInteriorSection: "episodes",
        validationMessage: "",
        toast: "",
        museScopeMode: "storyboard",
        episodeMediaMode: "video",
        videoGenerationMode: "first-frame",
        selectedEpisodeId: "episode-new",
        selectedStoryboardId: storyboard.id,
        episodeStoryboardMap: {
          "episode-new": [storyboard],
        },
        videoResolution: "1080p",
        videoDurationSec: 5,
        videoCount: 1,
        videoAudioEnabled: false,
        videoMusicEnabled: false,
        videoLipSyncEnabled: false,
      },
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    try {
      await handleWorkbenchActionForTest(workbench, {
        dataset: {
          action: "storyboard-image-to-video",
          storyboardId: storyboard.id,
        },
      });
      await handleWorkbenchActionForTest(workbench, {
        dataset: {
          action: "generate-videos",
        },
      });

      assert.equal(createVideoTaskCalls.length, 1);
      assert.equal(createVideoTaskCalls[0].episodeId, "episode-new");
      assert.equal(createVideoTaskCalls[0].payload.model, "seedance-i2v-pro");
      assert.equal(createVideoTaskCalls[0].payload.targetType, "storyboard");
      assert.equal(createVideoTaskCalls[0].payload.targetId, storyboard.linkedShotId);
      assert.equal(createVideoTaskCalls[0].payload.parameters.firstFrame.url, "/uploads/storyboard-seedance-first-frame.png");
      assert.equal(createVideoTaskCalls[0].payload.parameters.durationSec, 5);
      assert.equal(workbench.ui.videoGenerationResult.taskId, "seedance-video-task-queued");
      assert.equal(workbench.ui.videoGenerationResult.selectedModelId, "seedance-i2v-pro");
      assert.equal(timers.length, 1);
      assert.equal(timers[0].delayMs, 30000);

      await timers[0].callback();

      assert.deepEqual(pollCalls, ["seedance-video-task-queued"]);
      assert.equal(workbench.ui.generationPollingActive, false);
      assert.equal(workbench.ui.videoGenerationResult.status, "completed");
      const updatedStoryboard = workbench.ui.episodeStoryboardMap["episode-new"][0];
      assert.equal(updatedStoryboard.previewVideo, "https://example.com/seedance-result.mp4");
    } finally {
      globalThis.window = previousWindow;
    }
  });

  it("renders the selected storyboard quick reference image in the user message after quick append", () => {
    const [storyboard] = addStoryboard([]);
    const storyboards = [
      {
        ...storyboard,
        id: "storyboard-render-quick-image",
        description: "分镜文案：雨夜街口的回头镜头",
        previewImageUrl: "/uploads/storyboard-render-quick-image.png",
        currentImageAssetVersionId: "story-image-1",
        uploadedImages: [{ id: "story-image-1", src: "/uploads/storyboard-render-quick-image.png", status: "ready" }],
      },
    ];
    const workbench = {
      state: {
        project: {
          id: "project-1",
          name: "Storyboard Quick Reference Render",
          phase: "shot_generation",
          aspectRatio: "16:9",
          resolution: "1080p",
        },
        assetReview: { readyForGeneration: true },
        assetCandidates: {
          characters: [],
          scenes: [],
          props: [],
        },
        calibration: null,
        shots: [],
        exportPreview: null,
      },
      ui: {
        activeNavTab: "project",
        selectedModelId: "jimeng-4-5",
        prompt: "",
        busy: false,
        projectPanelMode: "episode-workbench",
        museScopeMode: "storyboard",
        episodeMediaMode: "image",
        selectedEpisodeId: "episode-new",
        selectedStoryboardId: "storyboard-render-quick-image",
        selectedStoryboard: storyboards[0],
        storyboards,
        episodeStoryboardMap: {
          "episode-new": storyboards,
        },
        imageGenerationResult: {
          mediaKind: "image",
          storyboardId: "storyboard-render-quick-image",
          promptPreview: "分镜文案：雨夜街口的回头镜头",
          quickReferenceItems: [],
          attachmentItems: [],
          createdAt: "2026-06-01 20:10:00",
          status: "running",
        },
        importedAssets: {
          character: [],
          scene: [],
          prop: [],
        },
        episodes: [
          {
            id: "episode-new",
            title: "第1集",
          },
        ],
        selectedEpisodeCardId: null,
        selectedEpisodeAssetId: null,
        projectAssetTab: "character",
        museBoardMode: "story",
        musePromptMenu: null,
        referencePromptPreset: "none",
        imageGenerationMode: "single-image",
        imageResolution: "2K",
        imageAspectRatio: "16:9",
        videoResolution: "1080p",
        videoDurationSec: 5,
        videoGenerationMode: "first-frame",
        videoAudioEnabled: false,
        videoMusicEnabled: false,
        videoLipSyncEnabled: false,
        creditBalance: 1000,
        toast: "",
        validationMessage: "",
      },
    };

    appendSelectedEpisodeAssetToPrompt(workbench);
    workbench.ui.imageGenerationResult = {
      ...(workbench.ui.imageGenerationResult ?? {}),
      quickReferenceItems: [
        ...(workbench.ui.episodeStoryboardMap["episode-new"][0].generationState.quickReferenceItems ?? []),
      ],
      promptPreview: workbench.ui.prompt,
    };

    const html = renderProductionWorkbench(workbench);

    assert.match(html, /class="episode-replica-user-message-refs"/);
    assert.match(html, /src="\/uploads\/storyboard-render-quick-image\.png"/);
    assert.doesNotMatch(html, /不应引用的资产/);
  });

  it("renders multiple storyboard quick reference thumbnails in the composer strip", () => {
    const storyboard = {
      id: "storyboard-dom-multi-image",
      title: "分镜 1",
      description: "分镜文案：三张参考图都要引入",
      generationState: {
        prompt: "分镜文案：三张参考图都要引入",
        quickReferenceItems: [
          {
            id: "quick-ref:storyboard-image:storyboard-dom-multi-image:dom-1",
            assetId: "dom-1",
            sourceStoryboardId: "storyboard-dom-multi-image",
            kind: "image",
            name: "分镜 1 图片 1",
            description: "分镜文案：三张参考图都要引入",
            preview: "/uploads/dom-ref-1.png",
            url: "/uploads/dom-ref-1.png",
          },
          {
            id: "quick-ref:storyboard-image:storyboard-dom-multi-image:dom-2",
            assetId: "dom-2",
            sourceStoryboardId: "storyboard-dom-multi-image",
            kind: "image",
            name: "分镜 1 图片 2",
            description: "分镜文案：三张参考图都要引入",
            preview: "/uploads/dom-ref-2.png",
            url: "/uploads/dom-ref-2.png",
          },
          {
            id: "quick-ref:storyboard-image:storyboard-dom-multi-image:dom-3",
            assetId: "dom-3",
            sourceStoryboardId: "storyboard-dom-multi-image",
            kind: "image",
            name: "分镜 1 图片 3",
            description: "分镜文案：三张参考图都要引入",
            preview: "/uploads/dom-ref-3.png",
            url: "/uploads/dom-ref-3.png",
          },
        ],
        mentionReferences: [],
      },
    };
    const html = renderProductionWorkbench({
      state: {
        project: {
          id: "project-1",
          name: "Storyboard Multi Ref Render",
          phase: "shot_generation",
          aspectRatio: "16:9",
          resolution: "1080p",
        },
        assetReview: { readyForGeneration: true },
        assetCandidates: { characters: [], scenes: [], props: [] },
        calibration: null,
        shots: [],
        exportPreview: null,
      },
      ui: {
        activeNavTab: "project",
        selectedModelId: "jimeng-4-5",
        prompt: "分镜文案：三张参考图都要引入",
        busy: false,
        projectPanelMode: "episode-workbench",
        museScopeMode: "storyboard",
        episodeMediaMode: "image",
        selectedEpisodeId: "episode-new",
        selectedStoryboardId: "storyboard-dom-multi-image",
        selectedStoryboard: storyboard,
        storyboards: [storyboard],
        episodeStoryboardMap: {
          "episode-new": [storyboard],
        },
        imageGenerationResult: null,
        importedAssets: { character: [], scene: [], prop: [] },
        episodes: [{ id: "episode-new", title: "第1集" }],
        selectedEpisodeCardId: null,
        selectedEpisodeAssetId: null,
        projectAssetTab: "character",
        museBoardMode: "story",
        musePromptMenu: null,
        referencePromptPreset: "none",
        imageGenerationMode: "single-image",
        imageResolution: "2K",
        imageAspectRatio: "16:9",
        videoResolution: "1080p",
        videoDurationSec: 5,
        videoGenerationMode: "first-frame",
        videoAudioEnabled: false,
        videoMusicEnabled: false,
        videoLipSyncEnabled: false,
        creditBalance: 1000,
        toast: "",
        validationMessage: "",
      },
    });

    assert.match(html, /episode-replica-upload-card/);
    assert.match(html, /dom-ref-1\.png/);
    assert.match(html, /dom-ref-2\.png/);
    assert.match(html, /dom-ref-3\.png/);
  });

  it("renders storyboard quick reference cards with matched voice labels", () => {
    const storyboard = {
      id: "storyboard-voice-render",
      title: "分镜 1",
      description: "分镜文案：主角看向【@白野】。",
      generationState: {
        prompt: "分镜文案：主角看向【@白野】。",
        quickReferenceItems: [
          {
            id: "quick-ref:storyboard-image:storyboard-voice-render:ref-character",
            assetId: "character-1",
            sourceStoryboardId: "storyboard-voice-render",
            kind: "image",
            name: "分镜 1 图片 1",
            description: "分镜文案：主角看向【@白野】。",
            preview: "/uploads/baiye.png",
            url: "/uploads/baiye.png",
            voiceId: "system-1",
            voiceName: "女/稚嫩",
            voiceSource: "system",
          },
        ],
        mentionReferences: [],
      },
    };
    const html = renderProductionWorkbench({
      state: {
        project: {
          id: "project-1",
          name: "Storyboard Voice Render",
          phase: "shot_generation",
          aspectRatio: "16:9",
          resolution: "1080p",
        },
        assetReview: { readyForGeneration: true },
        assetCandidates: { characters: [], scenes: [], props: [] },
        calibration: null,
        shots: [],
        exportPreview: null,
      },
      ui: {
        activeNavTab: "project",
        selectedModelId: "jimeng-4-5",
        prompt: "分镜文案：主角看向【@白野】。",
        busy: false,
        projectPanelMode: "episode-workbench",
        museScopeMode: "storyboard",
        episodeMediaMode: "image",
        selectedEpisodeId: "episode-new",
        selectedStoryboardId: "storyboard-voice-render",
        selectedStoryboard: storyboard,
        storyboards: [storyboard],
        episodeStoryboardMap: {
          "episode-new": [storyboard],
        },
        imageGenerationResult: null,
        importedAssets: { character: [], scene: [], prop: [] },
        episodes: [{ id: "episode-new", title: "第1集" }],
        selectedEpisodeCardId: null,
        selectedEpisodeAssetId: null,
        projectAssetTab: "character",
        museBoardMode: "story",
        musePromptMenu: null,
        referencePromptPreset: "none",
        imageGenerationMode: "single-image",
        imageResolution: "2K",
        imageAspectRatio: "16:9",
        videoResolution: "1080p",
        videoDurationSec: 5,
        videoGenerationMode: "first-frame",
        videoAudioEnabled: false,
        videoMusicEnabled: false,
        videoLipSyncEnabled: false,
        creditBalance: 1000,
        toast: "",
        validationMessage: "",
      },
    });

    assert.match(html, /class="episode-replica-ref-card quick-reference voice configured"/);
    assert.match(html, /<strong>女\/稚嫩<\/strong>/);
  });

  it("renders separate storyboard quick reference cards in video mode", () => {
    const storyboard = {
      id: "storyboard-video-split-render",
      title: "分镜 1",
      description: "分镜文案：视频模式也要三张分开。",
      generationState: {
        prompt: "分镜文案：视频模式也要三张分开。",
        quickReferenceItems: [
          {
            id: "quick-ref:storyboard-image:storyboard-video-split-render:dom-1",
            assetId: "dom-1",
            sourceStoryboardId: "storyboard-video-split-render",
            kind: "image",
            name: "分镜 1 图片 1",
            description: "分镜文案：视频模式也要三张分开。",
            preview: "/uploads/dom-ref-1.png",
            url: "/uploads/dom-ref-1.png",
            voiceId: null,
            voiceName: "",
            voiceSource: null,
          },
          {
            id: "quick-ref:storyboard-image:storyboard-video-split-render:dom-2",
            assetId: "dom-2",
            sourceStoryboardId: "storyboard-video-split-render",
            kind: "image",
            name: "分镜 1 图片 2",
            description: "分镜文案：视频模式也要三张分开。",
            preview: "/uploads/dom-ref-2.png",
            url: "/uploads/dom-ref-2.png",
            voiceId: null,
            voiceName: "",
            voiceSource: null,
          },
          {
            id: "quick-ref:storyboard-image:storyboard-video-split-render:dom-3",
            assetId: "dom-3",
            sourceStoryboardId: "storyboard-video-split-render",
            kind: "image",
            name: "分镜 1 图片 3",
            description: "分镜文案：视频模式也要三张分开。",
            preview: "/uploads/dom-ref-3.png",
            url: "/uploads/dom-ref-3.png",
            voiceId: null,
            voiceName: "",
            voiceSource: null,
          },
        ],
        mentionReferences: [],
      },
    };
    const html = renderProductionWorkbench({
      state: {
        project: {
          id: "project-1",
          name: "Storyboard Video Split Render",
          phase: "shot_generation",
          aspectRatio: "16:9",
          resolution: "1080p",
        },
        assetReview: { readyForGeneration: true },
        assetCandidates: { characters: [], scenes: [], props: [] },
        calibration: null,
        shots: [],
        exportPreview: null,
      },
      ui: {
        activeNavTab: "project",
        selectedModelId: "jimeng-4-5",
        prompt: "分镜文案：视频模式也要三张分开。",
        busy: false,
        projectPanelMode: "episode-workbench",
        museScopeMode: "storyboard",
        episodeMediaMode: "video",
        selectedEpisodeId: "episode-new",
        selectedStoryboardId: "storyboard-video-split-render",
        selectedStoryboard: storyboard,
        storyboards: [storyboard],
        episodeStoryboardMap: {
          "episode-new": [storyboard],
        },
        imageGenerationResult: null,
        importedAssets: { character: [], scene: [], prop: [] },
        episodes: [{ id: "episode-new", title: "第1集" }],
        selectedEpisodeCardId: null,
        selectedEpisodeAssetId: null,
        projectAssetTab: "character",
        museBoardMode: "story",
        musePromptMenu: null,
        referencePromptPreset: "none",
        imageGenerationMode: "single-image",
        imageResolution: "2K",
        imageAspectRatio: "16:9",
        videoResolution: "1080p",
        videoDurationSec: 5,
        videoGenerationMode: "first-frame",
        videoAudioEnabled: false,
        videoMusicEnabled: false,
        videoLipSyncEnabled: false,
        creditBalance: 1000,
        toast: "",
        validationMessage: "",
      },
    });

    const quickRefCardMatches = html.match(/episode-replica-ref-card quick-reference/g) ?? [];
    assert.equal(quickRefCardMatches.length, 3);
    assert.match(html, /dom-ref-1\.png/);
    assert.match(html, /dom-ref-2\.png/);
    assert.match(html, /dom-ref-3\.png/);
  });

  it("orders composer reference strip with audio upload first, referenced images next, and image upload last", () => {
    const storyboard = {
      id: "storyboard-ref-order",
      title: "分镜 1",
      description: "分镜文案：引用顺序测试。",
      generationState: {
        prompt: "分镜文案：引用顺序测试。",
        quickReferenceItems: [
          {
            id: "quick-ref:storyboard-image:storyboard-ref-order:1",
            assetId: "ref-1",
            sourceStoryboardId: "storyboard-ref-order",
            kind: "image",
            name: "分镜 1 图片 1",
            description: "分镜文案：引用顺序测试。",
            preview: "/uploads/ref-order-1.png",
            url: "/uploads/ref-order-1.png",
            voiceId: null,
            voiceName: "",
            voiceSource: null,
          },
          {
            id: "quick-ref:storyboard-image:storyboard-ref-order:2",
            assetId: "ref-2",
            sourceStoryboardId: "storyboard-ref-order",
            kind: "image",
            name: "分镜 1 图片 2",
            description: "分镜文案：引用顺序测试。",
            preview: "/uploads/ref-order-2.png",
            url: "/uploads/ref-order-2.png",
            voiceId: null,
            voiceName: "",
            voiceSource: null,
          },
        ],
        mentionReferences: [],
      },
    };
    const html = renderProductionWorkbench({
      state: {
        project: {
          id: "project-1",
          name: "Storyboard Ref Order",
          phase: "shot_generation",
          aspectRatio: "16:9",
          resolution: "1080p",
        },
        assetReview: { readyForGeneration: true },
        assetCandidates: { characters: [], scenes: [], props: [] },
        calibration: null,
        shots: [],
        exportPreview: null,
      },
      ui: {
        activeNavTab: "project",
        selectedModelId: "jimeng-4-5",
        prompt: "分镜文案：引用顺序测试。",
        busy: false,
        projectPanelMode: "episode-workbench",
        museScopeMode: "storyboard",
        episodeMediaMode: "video",
        selectedEpisodeId: "episode-new",
        selectedStoryboardId: "storyboard-ref-order",
        selectedStoryboard: storyboard,
        storyboards: [storyboard],
        episodeStoryboardMap: {
          "episode-new": [storyboard],
        },
        imageGenerationResult: null,
        importedAssets: { character: [], scene: [], prop: [] },
        episodes: [{ id: "episode-new", title: "第1集" }],
        selectedEpisodeCardId: null,
        selectedEpisodeAssetId: null,
        projectAssetTab: "character",
        museBoardMode: "story",
        musePromptMenu: null,
        referencePromptPreset: "none",
        imageGenerationMode: "single-image",
        imageResolution: "2K",
        imageAspectRatio: "16:9",
        videoResolution: "1080p",
        videoDurationSec: 5,
        videoGenerationMode: "first-frame",
        videoAudioEnabled: false,
        videoMusicEnabled: false,
        videoLipSyncEnabled: false,
        creditBalance: 1000,
        toast: "",
        validationMessage: "",
      },
    });

    const strip = html.match(/<div class="episode-replica-ref-strip">([\s\S]*?)<\/div>/)?.[1] ?? "";
    const audioIndex = strip.indexOf('data-attachment-type="audio"');
    const firstRefIndex = strip.indexOf('/uploads/ref-order-1.png');
    const secondRefIndex = strip.indexOf('/uploads/ref-order-2.png');
    const imageUploadIndex = strip.indexOf('data-attachment-type="image"');

    assert.ok(audioIndex >= 0);
    assert.ok(firstRefIndex > audioIndex);
    assert.ok(secondRefIndex > firstRefIndex);
    assert.ok(imageUploadIndex > secondRefIndex);
  });

  it("places imported audio attachments to the left of the audio upload card", () => {
    const storyboard = {
      id: "storyboard-audio-left",
      title: "分镜 1",
      description: "分镜文案：音频排序测试。",
      generationState: {
        prompt: "分镜文案：音频排序测试。",
        quickReferenceItems: [
          {
            id: "quick-ref:storyboard-image:storyboard-audio-left:1",
            assetId: "ref-1",
            sourceStoryboardId: "storyboard-audio-left",
            kind: "image",
            name: "分镜 1 图片 1",
            description: "分镜文案：音频排序测试。",
            preview: "/uploads/audio-left-ref-1.png",
            url: "/uploads/audio-left-ref-1.png",
            voiceId: null,
            voiceName: "",
            voiceSource: null,
          },
        ],
        mentionReferences: [],
      },
    };
    const html = renderProductionWorkbench({
      state: {
        project: {
          id: "project-1",
          name: "Storyboard Audio Left",
          phase: "shot_generation",
          aspectRatio: "16:9",
          resolution: "1080p",
        },
        assetReview: { readyForGeneration: true },
        assetCandidates: { characters: [], scenes: [], props: [] },
        calibration: null,
        shots: [],
        exportPreview: null,
      },
      ui: {
        activeNavTab: "project",
        selectedModelId: "jimeng-4-5",
        prompt: "分镜文案：音频排序测试。",
        busy: false,
        projectPanelMode: "episode-workbench",
        museScopeMode: "storyboard",
        episodeMediaMode: "video",
        selectedEpisodeId: "episode-new",
        selectedStoryboardId: "storyboard-audio-left",
        selectedStoryboard: storyboard,
        storyboards: [storyboard],
        episodeStoryboardMap: {
          "episode-new": [storyboard],
        },
        episodeWorkbenchAttachments: [
          {
            id: "quick-mention-audio:character:character-1:1",
            type: "audio",
            kind: "audio",
            name: "白野 音频",
            summary: "白野",
            voiceId: "system-1",
            voiceName: "女/稚嫩",
            voiceSource: "system",
            audioUrl: "data:audio/wav;base64,AAAA",
          },
        ],
        episodeWorkbenchSelectedAttachmentIds: ["quick-mention-audio:character:character-1:1"],
        imageGenerationResult: null,
        importedAssets: { character: [], scene: [], prop: [] },
        episodes: [{ id: "episode-new", title: "第1集" }],
        selectedEpisodeCardId: null,
        selectedEpisodeAssetId: null,
        projectAssetTab: "character",
        museBoardMode: "story",
        musePromptMenu: null,
        referencePromptPreset: "none",
        imageGenerationMode: "single-image",
        imageResolution: "2K",
        imageAspectRatio: "16:9",
        videoResolution: "1080p",
        videoDurationSec: 5,
        videoGenerationMode: "first-frame",
        videoAudioEnabled: false,
        videoMusicEnabled: false,
        videoLipSyncEnabled: false,
        creditBalance: 1000,
        toast: "",
        validationMessage: "",
      },
    });

    const strip = html.match(/<div class="episode-replica-ref-strip">([\s\S]*?)<\/div>/)?.[1] ?? "";
    const importedAudioIndex = strip.indexOf('episode-replica-ref-card attachment audio');
    const audioUploadIndex = strip.indexOf('data-attachment-type="audio"');
    const imageRefIndex = strip.indexOf("/uploads/audio-left-ref-1.png");
    const imageUploadIndex = strip.indexOf('data-attachment-type="image"');

    assert.ok(importedAudioIndex >= 0);
    assert.ok(audioUploadIndex > importedAudioIndex);
    assert.ok(imageRefIndex > audioUploadIndex);
    assert.ok(imageUploadIndex > imageRefIndex);
  });

  it("keeps storyboard quick append focused on storyboard content even when an asset is selected in the quick lane", () => {
    const [storyboard] = addStoryboard([]);
    const storyboards = [
      {
        ...storyboard,
        id: "storyboard-priority-over-asset",
        description: "分镜文案：白野站在爆炸后的火光前",
        previewImageUrl: "/uploads/storyboard-priority-over-asset.png",
        currentImageAssetVersionId: "story-priority-image",
        uploadedImages: [{ id: "story-priority-image", src: "/uploads/storyboard-priority-over-asset.png", status: "ready" }],
      },
    ];
    const workbench = {
      ui: {
        projectPanelMode: "episode-workbench",
        museScopeMode: "storyboard",
        episodeMediaMode: "image",
        selectedEpisodeId: "episode-new",
        selectedStoryboardId: "storyboard-priority-over-asset",
        selectedStoryboard: storyboards[0],
        storyboards,
        episodeStoryboardMap: {
          "episode-new": storyboards,
        },
        projectAssetTab: "character",
        selectedEpisodeAssetId: "asset-selected-in-lane",
        selectedEpisodeCardId: "asset-selected-in-lane",
        prompt: "",
        importedAssets: {
          character: [
            {
              id: "asset-selected-in-lane",
              name: "角色测试",
              description: "wqew",
              previewUrl: "/uploads/asset-lane.png",
            },
          ],
          scene: [],
          prop: [],
        },
      },
    };

    const result = appendSelectedEpisodeAssetToPrompt(workbench);
    const reference = workbench.ui.episodeStoryboardMap["episode-new"][0].generationState.quickReferenceItems[0];

    assert.equal(result.ok, true);
    assert.equal(workbench.ui.prompt, "分镜文案：白野站在爆炸后的火光前");
    assert.equal(reference.name, "分镜 1 图片");
    assert.equal(reference.preview, "/uploads/storyboard-priority-over-asset.png");
    assert.doesNotMatch(workbench.ui.prompt, /角色测试: wqew/);
  });

  it("replaces a stale asset-derived storyboard prompt with the selected storyboard text on quick append", () => {
    const [storyboard] = addStoryboard([]);
    const storyboards = [
      {
        ...storyboard,
        id: "storyboard-replace-asset-prompt",
        description: "分镜文案：爆炸后的白野继续前行",
        previewImageUrl: "/uploads/storyboard-replace-asset-prompt.png",
        currentImageAssetVersionId: "story-replace-image",
        uploadedImages: [{ id: "story-replace-image", src: "/uploads/storyboard-replace-asset-prompt.png", status: "ready" }],
        generationState: {
          prompt: "角色测试: wqew",
          quickReferenceItems: [],
          mentionReferences: [],
        },
      },
    ];
    const workbench = {
      ui: {
        projectPanelMode: "episode-workbench",
        museScopeMode: "storyboard",
        episodeMediaMode: "image",
        selectedEpisodeId: "episode-new",
        selectedStoryboardId: "storyboard-replace-asset-prompt",
        selectedStoryboard: storyboards[0],
        storyboards,
        episodeStoryboardMap: {
          "episode-new": storyboards,
        },
        prompt: "角色测试: wqew",
        projectAssetTab: "character",
        selectedEpisodeAssetId: "asset-selected-in-lane",
        selectedEpisodeCardId: "asset-selected-in-lane",
        importedAssets: {
          character: [
            {
              id: "asset-selected-in-lane",
              name: "角色测试",
              description: "wqew",
              previewUrl: "/uploads/asset-lane.png",
            },
          ],
          scene: [],
          prop: [],
        },
      },
    };

    const result = appendSelectedEpisodeAssetToPrompt(workbench);

    assert.equal(result.ok, true);
    assert.equal(workbench.ui.prompt, "分镜文案：爆炸后的白野继续前行");
    assert.doesNotMatch(workbench.ui.prompt, /角色测试: wqew/);
  });

  it("prefers the active storyboard card textarea text when quick appending storyboard references", () => {
    const [storyboard] = addStoryboard([]);
    const storyboards = [
      {
        ...storyboard,
        id: "storyboard-dom-active",
        description: "状态里的旧文案",
        references: [
          { role: "character", assetId: "asset-1", name: "角色一", previewUrl: "/uploads/ref-1.png" },
        ],
        previewVideo: "/uploads/storyboard-video.mp4",
        selectedUploadedVideoId: "video-1",
        uploadedVideos: [{ id: "video-1", src: "/uploads/storyboard-video.mp4", status: "ready" }],
      },
    ];
    const activeCard = {
      getAttribute(name) {
        return name === "data-storyboard-id" ? "storyboard-dom-active" : null;
      },
      querySelector(selector) {
        if (selector === ".episode-replica-shot-desc-input") {
          return { value: "对话选中框中的最新文案" };
        }
        return null;
      },
    };
    const workbench = {
      root: {
        querySelector(selector) {
          if (selector === ".episode-replica-shot-card.active[data-storyboard-id]") {
            return activeCard;
          }
          return null;
        },
      },
      ui: {
        projectPanelMode: "episode-workbench",
        museScopeMode: "storyboard",
        episodeMediaMode: "video",
        selectedEpisodeId: "episode-new",
        selectedStoryboardId: null,
        storyboards,
        episodeStoryboardMap: {
          "episode-new": storyboards,
        },
        prompt: "",
        importedAssets: {
          character: [],
          scene: [],
          prop: [],
        },
      },
    };

    const result = appendSelectedEpisodeAssetToPrompt(workbench);

    assert.equal(result.ok, true);
    assert.equal(workbench.ui.selectedStoryboardId, "storyboard-dom-active");
    assert.equal(workbench.ui.prompt, "对话选中框中的最新文案");
  });

  it("uses the latest inline storyboard text before blur when quick appending references", () => {
    const [storyboard] = addStoryboard([]);
    const storyboards = [
      {
        ...storyboard,
        id: "storyboard-inline-live",
        description: "旧分镜文案",
        references: [
          { role: "character", assetId: "asset-1", name: "角色一", previewUrl: "/uploads/ref-1.png" },
        ],
        previewVideo: "/uploads/storyboard-video.mp4",
        selectedUploadedVideoId: "video-1",
        uploadedVideos: [{ id: "video-1", src: "/uploads/storyboard-video.mp4", status: "ready" }],
      },
    ];
    const workbench = {
      ui: {
        projectPanelMode: "episode-workbench",
        museScopeMode: "storyboard",
        episodeMediaMode: "video",
        selectedEpisodeId: "episode-new",
        selectedStoryboardId: "storyboard-inline-live",
        storyboards,
        episodeStoryboardMap: {
          "episode-new": storyboards,
        },
        prompt: "",
        importedAssets: {
          character: [],
          scene: [],
          prop: [],
        },
      },
    };

    workbench.ui.storyboards[0].description = "输入后尚未失焦的最新文案";
    workbench.ui.episodeStoryboardMap["episode-new"][0].description = "输入后尚未失焦的最新文案";

    const result = appendSelectedEpisodeAssetToPrompt(workbench);

    assert.equal(result.ok, true);
    assert.equal(workbench.ui.prompt, "输入后尚未失焦的最新文案");
    assert.equal(
      workbench.ui.episodeStoryboardMap["episode-new"][0].generationState.quickReferenceItems[0]?.description,
      "输入后尚未失焦的最新文案",
    );
  });

  it("switches selected storyboard to the inline editor target before quick append", () => {
    const storyboards = [
      {
        ...addStoryboard([])[0],
        id: "storyboard-a",
        description: "第一张旧文案",
        references: [{ role: "character", assetId: "asset-a", name: "A", previewUrl: "/uploads/a.png" }],
        previewVideo: "/uploads/a.mp4",
        selectedUploadedVideoId: "video-a",
        uploadedVideos: [{ id: "video-a", src: "/uploads/a.mp4", status: "ready" }],
      },
      {
        ...addStoryboard([])[0],
        id: "storyboard-b",
        description: "第二张最新文案",
        references: [{ role: "character", assetId: "asset-b", name: "B", previewUrl: "/uploads/b.png" }],
        previewVideo: "/uploads/b.mp4",
        selectedUploadedVideoId: "video-b",
        uploadedVideos: [{ id: "video-b", src: "/uploads/b.mp4", status: "ready" }],
      },
    ];
    const workbench = {
      ui: {
        projectPanelMode: "episode-workbench",
        museScopeMode: "storyboard",
        episodeMediaMode: "video",
        selectedEpisodeId: "episode-new",
        selectedStoryboardId: "storyboard-a",
        storyboards,
        episodeStoryboardMap: {
          "episode-new": storyboards,
        },
        prompt: "",
        importedAssets: {
          character: [],
          scene: [],
          prop: [],
        },
      },
    };

    workbench.ui.selectedStoryboardId = "storyboard-b";
    const result = appendSelectedEpisodeAssetToPrompt(workbench);

    assert.equal(result.ok, true);
    assert.equal(workbench.ui.selectedStoryboardId, "storyboard-b");
    assert.equal(workbench.ui.prompt, "第二张最新文案");
  });

  it("uses asset-scope quick references when building image generation payload outside storyboard mode", () => {
    const payload = buildImageGenerationPayload({
      state: {
        episodes: [{ id: "episode-1", title: "第一集" }],
        project: { aspectRatio: "16:9" },
      },
      ui: {
        prompt: "角色固定图",
        selectedEpisodeId: "episode-1",
        projectAssetTab: "character",
        selectedEpisodeAssetId: "asset-1",
        imageGenerationMode: "single-image",
        imageCount: 1,
        imageResolution: "2K",
        imageAspectRatio: "16:9",
        multiImageStrategy: "spatial-multi-view",
        selectedModelId: "jimeng-4-5",
        museScopeMode: "assets",
        importedAssets: {
          character: [
            {
              id: "asset-1",
              name: "李唯/破旧麻袋衣",
              description: "灰黑短发，破旧麻袋衣，警惕眼神，面部疲惫。",
              previewUrl: "/uploads/asset-1.avif",
            },
          ],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
        assetPromptDraft: {
          scopeMode: "assets",
          quickReferenceItems: [
            {
              id: "quick-ref:character:asset-1",
              assetId: "asset-1",
              kind: "character",
              name: "李唯/破旧麻袋衣",
              description: "灰黑短发，破旧麻袋衣，警惕眼神，面部疲惫。",
              preview: "/uploads/asset-1.avif",
            },
          ],
        },
      },
    });

    assert.equal(payload.shotId, null);
    assert.equal(payload.promptOverride, "角色固定图");
    assert.equal(payload.parameters.quickReferences?.length, 1);
    assert.equal(payload.parameters.quickReferences?.[0]?.assetId, "asset-1");
    assert.equal(payload.parameters.selectionContext?.selectedAssetId, "asset-1");
  });

  it("builds video generation payload with uploaded references and edit source", () => {
    const storyboard = {
      ...addStoryboard([])[0],
      linkedShotId: "shot-2",
      description: "action beat",
      references: [{ role: "prop", assetId: "asset-prop-1" }],
      generationState: {
        firstFrame: {
          name: "first.png",
          kind: "image",
          status: "ready",
          url: "/uploads/first.png",
        },
        lastFrame: {
          name: "last.png",
          kind: "image",
          status: "ready",
          url: "/uploads/last.png",
        },
        editSourceVideo: {
          name: "edit.mp4",
          kind: "video",
          status: "ready",
          url: "/uploads/edit.mp4",
        },
        referenceUploads: [
          { id: "ref-1", name: "reference.png", kind: "image", url: "/uploads/reference.png" },
        ],
        imageReference: {
          name: "ref.png",
          kind: "image",
          status: "ready",
          url: "/uploads/ref.png",
        },
        localReferenceRoles: ["character", "scene"],
      },
    };
    const payload = buildVideoGenerationPayload({
      state: { project: { aspectRatio: "16:9", resolution: "1080p" } },
      ui: {
        storyboards: [storyboard],
        selectedStoryboardId: storyboard.id,
        prompt: "camera move prompt",
        selectedModelId: "happy-horse",
        videoGenerationMode: "edit-video",
        videoCount: 2,
        videoResolution: "2K",
        videoDurationSec: "8",
        videoAudioEnabled: true,
        videoMusicEnabled: false,
        videoLipSyncEnabled: true,
        projectPanelMode: "workspace",
      },
    });

    assert.equal(payload.shotId, "shot-2");
    assert.equal(payload.motionPrompt, "camera move prompt");
    assert.equal(payload.model, "happy-horse");
    assert.equal(payload.parameters.count, 2);
    assert.equal(payload.parameters.resolution, "2K");
    assert.equal(payload.parameters.durationSec, 8);
    assert.equal(payload.parameters.aspectRatio, "16:9");
    assert.equal(payload.parameters.editSourceVideo?.url, "/uploads/edit.mp4");
    assert.equal(payload.parameters.referenceUploads?.[0]?.url, "/uploads/reference.png");
    assert.deepEqual(payload.parameters.localReferenceRoles, ["character", "scene"]);
    assert.equal(payload.musicEnabled, false);
  });

  it("builds lip-sync video payload with selected voice and text-based credit estimate", () => {
    const storyboard = {
      ...addStoryboard([])[0],
      linkedShotId: "shot-lip-sync-1",
      generationState: {},
    };
    const payload = buildVideoGenerationPayload({
      state: { project: { aspectRatio: "16:9", resolution: "1080p" } },
      ui: {
        storyboards: [storyboard],
        selectedStoryboardId: storyboard.id,
        prompt: "对口型文本示例",
        selectedModelId: "vidu-q3-pro",
        videoGenerationMode: "first-frame",
        videoCount: 1,
        videoResolution: "1080p",
        videoDurationSec: "5",
        videoAudioEnabled: true,
        videoMusicEnabled: false,
        videoLipSyncEnabled: true,
        episodeMediaMode: "lip-sync",
        lipSyncVoiceId: "system-1",
        lipSyncVoiceName: "女/稚嫩",
        lipSyncVoiceSource: "system",
        projectPanelMode: "workspace",
      },
    });

    assert.equal(payload.parameters.mode, "lip-sync");
    assert.equal(payload.audioEnabled, true);
    assert.equal(payload.lipSyncEnabled, true);
    assert.deepEqual(payload.parameters.lipSyncConfig, {
      text: "对口型文本示例",
      textLength: 7,
      voiceId: "system-1",
      voiceName: "女/稚嫩",
      voiceSource: "system",
      estimatedCreditCost: 2,
    });
  });

  it("appends quick reference text into the prompt and stores the reference on the storyboard", () => {
    const storyboard = {
      ...addStoryboard([])[0],
      linkedShotId: "shot-3",
      generationState: {
        quickReferenceItems: [],
      },
    };
    const workbench = {
      ui: {
        storyboards: [storyboard],
        selectedStoryboardId: storyboard.id,
        selectedEpisodeCardId: "character-1",
        selectedEpisodeAssetId: "character-1",
        projectAssetTab: "character",
        prompt: "已有提示词",
        importedAssets: {
          character: [
            {
              id: "character-1",
              name: "白野",
              description: "冷淡坚韧的废土行者，站姿稳定，适合主镜头反打。",
              previewUrl: "/uploads/character-1.png",
            },
          ],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
        projectPanelMode: "workspace",
      },
    };

    const result = appendSelectedEpisodeAssetToPrompt(workbench);
    const updatedStoryboard = workbench.ui.storyboards[0];

    assert.equal(result.ok, true);
    assert.equal(
      workbench.ui.prompt,
      "已有提示词\n白野: 冷淡坚韧的废土行者，站姿稳定，适合主镜头反打。",
    );
    assert.equal(
      updatedStoryboard.generationState.quickReferenceItems[0]?.description,
      "冷淡坚韧的废土行者，站姿稳定，适合主镜头反打。",
    );
    assert.equal(
      updatedStoryboard.generationState.quickReferenceItems[0]?.preview,
      "/uploads/character-1.png",
    );
  });

  it("inserts asset mention tokens into the prompt and stores mention metadata on the storyboard", () => {
    const storyboard = {
      ...addStoryboard([])[0],
      linkedShotId: "shot-4",
      generationState: {
        quickReferenceItems: [],
        mentionReferences: [],
      },
    };
    const workbench = {
      ui: {
        storyboards: [storyboard],
        selectedStoryboardId: storyboard.id,
        selectedEpisodeCardId: "scene-1",
        selectedEpisodeAssetId: "scene-1",
        projectAssetTab: "scene",
        prompt: "镜头要压低视角",
        importedAssets: {
          character: [],
          scene: [
            {
              id: "scene-1",
              name: "残破街区",
              description: "断墙残楼、空气混浊，远处残存冷色灯牌。",
              previewUrl: "/uploads/scene-1.png",
            },
          ],
          prop: [],
          other: { image: [], video: [] },
        },
        projectPanelMode: "workspace",
      },
    };

    const result = appendSelectedEpisodeAssetToPrompt(workbench, { mention: true });
    const updatedStoryboard = workbench.ui.storyboards[0];

    assert.equal(result.ok, true);
    assert.equal(workbench.ui.prompt, "镜头要压低视角\n【@残破街区】");
    assert.equal(updatedStoryboard.generationState.mentionReferences?.length, 1);
    assert.deepEqual(updatedStoryboard.generationState.mentionReferences?.[0], {
      id: "mention-ref:scene:scene-1",
      assetId: "scene-1",
      kind: "scene",
      name: "残破街区",
      token: "【@残破街区】",
      description: "断墙残楼、空气混浊，远处残存冷色灯牌。",
      preview: "/uploads/scene-1.png",
    });
  });

  it("opens prompt mention suggestions from project detail assets when episode imported assets are still empty", () => {
    const workbench = {
      state: {
        projectDetail: {
          assetsByType: {
            character: [],
            scene: [
              {
                id: "scene-detail-1",
                label: "残破街区",
                previewUrl: "/uploads/detail-scene.png",
                latestVersion: {
                  previewUrl: "/uploads/detail-scene.png",
                  metadata: {
                    description: "断墙残楼、空气混浊，远处残存冷色灯牌。",
                  },
                },
              },
            ],
            prop: [],
            other: { image: [], video: [] },
          },
        },
      },
      ui: {
        museScopeMode: "storyboard",
        importedAssets: {
          character: [],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
        promptMentionMenuOpen: false,
        promptMentionQuery: "",
        promptMentionSuggestions: [],
      },
    };

    updatePromptMentionState(workbench, "请参考 @残", 6);

    assert.equal(workbench.ui.promptMentionMenuOpen, true);
    assert.equal(workbench.ui.promptMentionQuery, "残");
    assert.equal(workbench.ui.promptMentionSuggestions.length, 1);
    assert.equal(workbench.ui.promptMentionSuggestions[0]?.name, "残破街区");
    assert.equal(workbench.ui.promptMentionSuggestions[0]?.assetKind, "scene");
  });

  it("shows a floating asset preview only when the prompt caret is inside a complete mention token", () => {
    const workbench = {
      ui: {
        museScopeMode: "storyboard",
        importedAssets: {
          character: [
            {
              id: "character-1",
              name: "众人/杂乱幸存者装",
              description: "惊惧的幸存者群体",
              previewUrl: "/uploads/crowd.png",
            },
          ],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
        promptMentionMenuOpen: true,
        promptMentionQuery: "众",
        promptMentionSuggestions: [],
        promptMentionPreviewOpen: false,
        promptMentionPreviewAsset: null,
      },
    };
    const prompt = "视频角色对照表：【@众人/杂乱幸存者装】";

    updatePromptMentionState(workbench, prompt, prompt.length);

    assert.equal(workbench.ui.promptMentionMenuOpen, false);
    assert.equal(workbench.ui.promptMentionPreviewOpen, true);
    assert.equal(workbench.ui.promptMentionPreviewAsset?.name, "众人/杂乱幸存者装");
    assert.equal(workbench.ui.promptMentionPreviewAsset?.assetKind, "character");
    assert.equal(workbench.ui.promptMentionPreviewAsset?.previewUrl, "/uploads/crowd.png");

    updatePromptMentionState(workbench, prompt, prompt.indexOf("@") + 2);

    assert.equal(workbench.ui.promptMentionPreviewOpen, true);
    assert.equal(workbench.ui.promptMentionPreviewAsset?.name, "众人/杂乱幸存者装");

    updatePromptMentionState(workbench, prompt, 2);

    assert.equal(workbench.ui.promptMentionPreviewOpen, false);
    assert.equal(workbench.ui.promptMentionPreviewAsset, null);

    updatePromptMentionState(workbench, `${prompt} 后续文字`, `${prompt} 后续文字`.length);

    assert.equal(workbench.ui.promptMentionPreviewOpen, false);
    assert.equal(workbench.ui.promptMentionPreviewAsset, null);
  });

  it("renders the prompt mention preview with thumbnail and name", () => {
    const state = {
      project: {
        id: "project-1",
        name: "try",
        phase: "asset_review",
        aspectRatio: "16:9",
        resolution: "2K",
      },
      shots: [],
      exportPreview: null,
    };
    const storyboards = createStoryboardList(state);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        projectPanelMode: "episode-workbench",
        selectedEpisodeId: "episode-new",
        projectAssetTab: "character",
        museScopeMode: "storyboard",
        storyboards,
        selectedStoryboard: storyboards[0],
        selectedModelId: "vidu-q3-pro",
        prompt: "视频角色对照表：【@众人/杂乱幸存者装】",
        busy: false,
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        isCreateModalOpen: false,
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
        promptMentionPreviewOpen: true,
        promptMentionPreviewAsset: {
          id: "character-1",
          name: "众人/杂乱幸存者装",
          assetKind: "character",
          previewUrl: "/uploads/crowd.png",
        },
      },
    });

    assert.match(html, /episode-replica-mention-preview/);
    assert.match(html, /data-floating="caret"/);
    assert.match(html, /src="\/uploads\/crowd\.png"/);
    assert.match(html, /众人\/杂乱幸存者装/);
  });

  it("positions the prompt mention preview as a floating caret-side thumbnail", () => {
    const source = readFileSync(
      new URL("../src/features/production-workbench/index.js", import.meta.url),
      "utf8",
    );
    const css = readFileSync(
      new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
      "utf8",
    );

    assert.match(source, /function positionPromptMentionPreview/);
    assert.match(source, /function dismissPromptMentionPreview/);
    assert.match(source, /function removePromptMentionPreviewDom/);
    assert.match(source, /function syncPromptMentionAfterSelection/);
    assert.match(source, /function resolvePromptMentionTokenAtCursor/);
    assert.match(source, /function resolveTextareaCaretViewportPosition/);
    assert.match(source, /resolveTextareaCaretViewportPosition\(input,\s*mentionToken\?\.end/);
    assert.match(source, /root\.addEventListener\("mouseup"/);
    assert.match(source, /root\.addEventListener\("mousedown"[\s\S]*?dismissPromptMentionPreview\(workbench\)/);
    assert.match(source, /if \(!workbench\.ui\.promptMentionPreviewOpen\)\s*\{\s*removePromptMentionPreviewDom\(workbench\);/);
    assert.match(source, /if \(hasPromptMentionUiChanged\(beforeMentionUi, workbench\)\)\s*\{[\s\S]*?positionPromptMentionPreview\(workbench, textarea\)/);
    assert.match(source, /const maxY = Math\.max\(minY,\s*inputRect\.bottom - previewRect\.height - 8 - promptRect\.top\)/);
    assert.match(source, /--prompt-mention-x/);
    assert.match(source, /--prompt-mention-y/);
    assert.match(css, /\.episode-replica-mention-preview\s*\{[\s\S]*?position:\s*absolute/);
    assert.match(css, /\.episode-replica-mention-preview\s*\{[\s\S]*?left:\s*var\(--prompt-mention-x/);
    assert.match(css, /\.episode-replica-mention-preview\s*\{[\s\S]*?top:\s*var\(--prompt-mention-y/);
    assert.match(css, /\.episode-replica-prompt\s*\{[\s\S]*?position:\s*relative/);
  });

  it("does not rerender sent conversation cards when the video prompt loses focus", () => {
    const source = readFileSync(
      new URL("../src/features/production-workbench/index.js", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(
      source,
      /if\s*\(target\?\.matches\?\.\("#video-prompt-input"\)\)\s*\{\s*clearPromptMentionUi\(workbench\);\s*render\(workbench\);\s*\}/,
    );
    assert.match(
      source,
      /if\s*\(target\?\.matches\?\.\("#video-prompt-input"\)\)\s*\{\s*dismissPromptMentionPreview\(workbench\);\s*\}/,
    );
  });

  it("shows audio upload only for video-oriented episode workbench modes", () => {
    const state = {
      project: {
        id: "project-1",
        name: "try",
        phase: "asset_review",
        aspectRatio: "16:9",
        resolution: "1080p",
      },
      assetReview: { readyForGeneration: true },
      calibration: { id: "cal-1" },
      assetCandidates: { characters: [], scenes: [], props: [] },
      shots: [
        {
          id: "shot-1",
          index: 1,
          title: "1",
          description: "Episode opening shot",
        },
      ],
      exportPreview: null,
    };
    const storyboards = createStoryboardList(state);
    const baseUi = {
      activeNavTab: "project",
      projectPanelMode: "episode-workbench",
      selectedEpisodeId: "episode-new",
      customEpisodes: [{ id: "episode-new", title: "Episode Draft", storyboardCount: 1, status: "draft" }],
      episodeStoryboardMap: { "episode-new": storyboards },
      storyboards,
      selectedStoryboard: storyboards[0],
      selectedStoryboardId: storyboards[0].id,
      selectedModelId: "vidu-q3-pro",
      prompt: "",
      busy: false,
      validationMessage: "",
      toast: "",
      projectAssetTab: "character",
      importedAssets: {
        character: [],
        scene: [],
        prop: [],
        other: { image: [], video: [] },
      },
    };

    const imageHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...baseUi,
        episodeMediaMode: "image",
      },
    });
    const videoHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...baseUi,
        episodeMediaMode: "video",
      },
    });

    assert.doesNotMatch(imageHtml, /data-attachment-type="audio"/);
    assert.match(videoHtml, /data-attachment-type="audio"/);
  });

  it("renders the lip-sync panel with text-based credit calculation and selected voice", () => {
    const state = {
      project: {
        id: "project-1",
        name: "try",
        phase: "asset_review",
        aspectRatio: "16:9",
        resolution: "1080p",
      },
      assetReview: { readyForGeneration: true },
      calibration: { id: "cal-1" },
      assetCandidates: { characters: [], scenes: [], props: [] },
      shots: [
        {
          id: "shot-1",
          index: 1,
          title: "1",
          description: "Episode opening shot",
        },
      ],
      exportPreview: null,
    };
    const storyboards = createStoryboardList(state);
    const lipSyncText = "这是一段用于对口型的配音文本";
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        projectPanelMode: "episode-workbench",
        selectedEpisodeId: "episode-new",
        customEpisodes: [{ id: "episode-new", title: "Episode Draft", storyboardCount: 1, status: "draft" }],
        episodeStoryboardMap: { "episode-new": storyboards },
        storyboards,
        selectedStoryboard: storyboards[0],
        selectedStoryboardId: storyboards[0].id,
        selectedModelId: "vidu-q3-pro",
        prompt: lipSyncText,
        busy: false,
        validationMessage: "",
        toast: "",
        projectAssetTab: "character",
        episodeMediaMode: "lip-sync",
        lipSyncVoiceName: "女/稚嫩",
        lipSyncAudioItems: [
          {
            id: "lip-audio-1",
            type: "audio",
            kind: "audio",
            name: "音频1",
            summary: "对口型文本示例",
          },
        ],
        importedAssets: {
          character: [],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
        episodeWorkbenchAttachments: [],
      },
    });

    assert.match(html, /配音内容/);
    assert.match(html, /输入音频内容 2灵感值\/10个字/);
    assert.match(html, /女\/稚嫩/);
    assert.match(html, /音频内容/);
    assert.match(html, /音频 ?1/);
    assert.match(html, /data-action="preview-lip-sync-audio"/);
    assert.match(html, /试听/);
    assert.match(html, /<strong class="episode-replica-generate-label">生成<\/strong>/);
    assert.doesNotMatch(html, /设为分镜视频/);
  });

  it("keeps asset and storyboard prompt drafts isolated when switching scope", () => {
    const storyboard = {
      ...addStoryboard([])[0],
      linkedShotId: "shot-isolated-1",
      generationState: {
        quickReferenceItems: [],
        prompt: "",
      },
    };
    const workbench = {
      state: {
        project: {
          id: "project-1",
          name: "剧一",
          phase: "asset_review",
          aspectRatio: "16:9",
          resolution: "1080p",
        },
        shots: [],
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        projectPanelMode: "episode-workbench",
        projectInteriorSection: "episodes",
        storyboards: [storyboard],
        episodeStoryboardMap: {
          "episode-1": [storyboard],
        },
        selectedEpisodeId: "episode-1",
        selectedStoryboardId: storyboard.id,
        selectedEpisodeCardId: "character-1",
        selectedEpisodeAssetId: "character-1",
        projectAssetTab: "character",
        museScopeMode: "assets",
        prompt: "资产侧草稿",
        importedAssets: {
          character: [
            {
              id: "character-1",
              name: "白野",
              description: "冷淡坚韧的废土行者，站姿稳定，适合主镜头反打。",
              previewUrl: "/uploads/character-1.png",
            },
          ],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
        assetPromptDraft: {
          scopeMode: "assets",
          prompt: "资产侧草稿",
          quickReferenceItems: [],
          mentionReferences: [],
          selectionContext: {
            selectedAssetId: "character-1",
          },
        },
        imageGenerationResult: {
          taskId: "asset-task-1",
          selectionContext: {
            selectedAssetId: "character-1",
          },
        },
        videoGenerationResult: null,
      },
    };

    const assetHtml = renderProductionWorkbench(workbench);
    assert.match(assetHtml, />资产侧草稿<\/textarea>/);

    const storyboardHtml = renderProductionWorkbench({
      ...workbench,
      ui: {
        ...workbench.ui,
        museScopeMode: "storyboard",
        prompt: "分镜侧草稿",
        storyboards: [
          {
            ...storyboard,
            generationState: {
              ...storyboard.generationState,
              prompt: "分镜侧草稿",
            },
          },
        ],
        episodeStoryboardMap: {
          "episode-1": [
            {
              ...storyboard,
              generationState: {
                ...storyboard.generationState,
                prompt: "分镜侧草稿",
              },
            },
          ],
        },
      },
    });

    assert.match(storyboardHtml, />分镜侧草稿<\/textarea>/);
    assert.doesNotMatch(storyboardHtml, />资产侧草稿<\/textarea>/);
  });

  it("renders voice preview controls inside the voice picker modal", () => {
    const state = {
      project: {
        id: "project-1",
        name: "try",
        phase: "asset_review",
        aspectRatio: "16:9",
        resolution: "1080p",
      },
      assetReview: { readyForGeneration: true },
      calibration: { id: "cal-1" },
      assetCandidates: { characters: [], scenes: [], props: [] },
      shots: [],
      exportPreview: null,
    };
    const storyboards = addStoryboard([]);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        projectPanelMode: "episode-workbench",
        projectInteriorSection: "episodes",
        museScopeMode: "assets",
        selectedEpisodeId: "episode-new",
        customEpisodes: [{ id: "episode-new", title: "Episode Draft", storyboardCount: 1, status: "draft" }],
        storyboards,
        selectedStoryboard: storyboards[0],
        selectedStoryboardId: storyboards[0]?.id ?? null,
        episodeStoryboardMap: {
          "episode-new": storyboards,
        },
        importedAssets: {
          character: [],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
        episodeWorkbenchAttachments: [],
        episodeVoiceModal: {
          scope: "lip-sync",
          tab: "system",
          voiceName: "女/稚嫩",
          previewVoiceName: "女/稚嫩",
        },
      },
    });

    assert.match(html, /试听/);
    assert.match(html, /停止试听/);
    assert.match(html, /data-action="preview-episode-voice"/);
    assert.match(html, /data-action="select-episode-voice"/);
    assert.match(html, /episode-voice-card-radio/);
    assert.match(html, /已选中/);
  });

  it("renders configured asset voice buttons as a two-segment chip with edit affordance", () => {
    const state = {
      project: {
        id: "project-1",
        name: "try",
        phase: "asset_review",
        aspectRatio: "16:9",
        resolution: "2K",
      },
      shots: [],
      exportPreview: null,
    };
    const storyboards = addStoryboard([]);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        projectPanelMode: "episode-workbench",
        projectInteriorSection: "episodes",
        museScopeMode: "assets",
        selectedEpisodeId: "episode-new",
        customEpisodes: [{ id: "episode-new", title: "Episode Draft", storyboardCount: 1, status: "draft" }],
        storyboards,
        selectedStoryboard: storyboards[0],
        selectedStoryboardId: storyboards[0]?.id ?? null,
        selectedEpisodeAssetId: "asset-character-1",
        selectedEpisodeCardId: "asset-character-1",
        projectAssetTab: "character",
        importedAssets: {
          character: [
            {
              id: "asset-character-1",
              kind: "character",
              name: "废土主角",
              description: "瘦削、警惕、穿破旧夹克。",
              preview: "/uploads/hero.png",
              voiceId: "system-1",
              voiceName: "女/稚嫩",
              voiceSource: "system",
            },
          ],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
      },
    });

    assert.match(html, /class="voice configured"/);
    assert.match(html, /<strong>女\/稚嫩<\/strong>/);
    assert.match(html, />编辑<\/span>/);
  });

  it("shows only image mode in asset scope and hides video and lip-sync tabs", () => {
    const state = {
      project: {
        id: "project-1",
        name: "try",
        phase: "asset_review",
        aspectRatio: "16:9",
        resolution: "2K",
      },
      shots: [],
      exportPreview: null,
    };
    const storyboards = addStoryboard([]);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        projectPanelMode: "episode-workbench",
        projectInteriorSection: "episodes",
        museScopeMode: "assets",
        episodeMediaMode: "video",
        selectedEpisodeId: "episode-new",
        customEpisodes: [{ id: "episode-new", title: "Episode Draft", storyboardCount: 1, status: "draft" }],
        storyboards,
        selectedStoryboard: storyboards[0],
        selectedStoryboardId: storyboards[0]?.id ?? null,
        selectedEpisodeAssetId: "asset-character-1",
        selectedEpisodeCardId: "asset-character-1",
        projectAssetTab: "character",
        importedAssets: {
          character: [
            {
              id: "asset-character-1",
              kind: "character",
              name: "废土主角",
              description: "瘦削、警惕、穿破旧夹克。",
              preview: "/uploads/hero.png",
            },
          ],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
      },
    });

    assert.match(html, /data-action="set-episode-media-mode" data-mode="image"/);
    assert.doesNotMatch(html, /data-action="set-episode-media-mode" data-mode="video"/);
    assert.doesNotMatch(html, /data-action="set-episode-media-mode" data-mode="lip-sync"/);
    assert.doesNotMatch(html, />做视频</);
    assert.doesNotMatch(html, />对口型</);
    assert.doesNotMatch(html, />编辑角色</);
  });

  it("hides image mode in storyboard scope while keeping video and lip-sync tabs", () => {
    const state = {
      project: {
        id: "project-1",
        name: "try",
        phase: "asset_review",
        aspectRatio: "16:9",
        resolution: "2K",
      },
      shots: [],
      exportPreview: null,
    };
    const storyboards = addStoryboard([]);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        projectPanelMode: "episode-workbench",
        projectInteriorSection: "episodes",
        museScopeMode: "storyboard",
        episodeMediaMode: "image",
        selectedEpisodeId: "episode-new",
        customEpisodes: [{ id: "episode-new", title: "Episode Draft", storyboardCount: 1, status: "draft" }],
        storyboards,
        selectedStoryboard: storyboards[0],
        selectedStoryboardId: storyboards[0]?.id ?? null,
      },
    });

    assert.doesNotMatch(html, /data-action="set-episode-media-mode" data-mode="image"/);
    assert.match(html, /data-action="set-episode-media-mode" data-mode="video"/);
    assert.match(html, /data-action="set-episode-media-mode" data-mode="lip-sync"/);
    assert.doesNotMatch(html, />做图片</);
    assert.match(html, />做视频</);
    assert.match(html, />对口型</);
  });
});

describe("asset generator and imported asset modals", () => {
  function buildModalState() {
    return {
      project: {
        id: "project-1",
        name: "try",
        phase: "asset_review",
        aspectRatio: "9:16",
        resolution: "1080p",
      },
      assetReview: { readyForGeneration: false },
      assetCandidates: {
        characters: [],
        scenes: [],
        props: [],
      },
      calibration: null,
      shots: [],
      exportPreview: null,
    };
  }

  function buildModalUi(overrides = {}) {
    const state = buildModalState();
    const storyboards = createStoryboardList(state);
    return {
      activeNavTab: "project",
      storyboards,
      selectedStoryboard: storyboards[0],
      selectedModelId: "vidu-q3-pro",
      prompt: "",
      busy: false,
      projectPanelMode: "workspace",
      projectInteriorSection: "assets",
      projectAssetTab: "character",
      validationMessage: "",
      toast: "",
      isScriptModalOpen: false,
      isCreateModalOpen: false,
      scriptTab: "script-upload",
      uploadNotice: "",
      defaultScript: "Episode 1",
      importedAssets: {
        character: [],
        scene: [],
        prop: [],
        other: { image: [], video: [] },
      },
      ...overrides,
    };
  }

  it("renders the character generator modal with chips and preview groups", () => {
    const state = buildModalState();
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: buildModalUi({
        assetGeneratorModal: "character",
        assetGeneratorName: "废土角色(1)",
        importedAssets: {
          character: [
            {
              id: "character-1",
              kind: "character",
              name: "废土角色(1)",
              preview: "data:image/svg+xml;charset=UTF-8,character-preview",
            },
          ],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
      }),
    });

    assert.match(html, /character-preview/);
    assert.match(html, /id="asset-generator-name-input"/);
    assert.match(html, /character-preview/);
    assert.match(html, /character-preview/);
    assert.match(html, /character-preview/);
    assert.match(html, /character-preview/);
    assert.match(html, /character-preview/);
    assert.match(html, /character-preview/);
  });

  it("renders the asset generator modal in edit mode", () => {
    const state = buildModalState();
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: buildModalUi({
        assetGeneratorModal: "character",
        assetGeneratorMode: "edit",
        assetGeneratorEditingAsset: {
          id: "character-1",
          kind: "character",
          name: "废土角色(1)",
          preview: "data:image/svg+xml;charset=UTF-8,edit-character-preview",
        },
        assetGeneratorName: "废土角色(1)",
      }),
    });
    assert.match(html, /asset-generator-name-input/);
    assert.match(html, /asset-generator-preview-group/);
    assert.match(html, /edit-character-preview/);
  });

  it("renders imported asset rename and delete confirmation modals", () => {
    const state = buildModalState();
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: buildModalUi({
        renameImportedAsset: {
          assetId: "character-1",
          assetKind: "character",
          mediaType: "image",
          name: "废土角色(1)",
        },
        renameImportedAssetName: "废土角色(1)",
        deleteImportedAsset: {
          assetId: "character-1",
          assetKind: "character",
          mediaType: "image",
          name: "废土角色(1)",
        },
      }),
    });

    assert.match(html, /id="asset-rename-name-input"/);
    assert.match(html, /data-action="confirm-rename-imported-asset"/);
    assert.match(html, /data-action="close-delete-imported-asset-modal"/);
    assert.match(html, /data-action="close-rename-imported-asset-modal"/);
    assert.match(html, /data-action="confirm-delete-imported-asset"/);
  });

  it("persists imported asset rename and updates the rendered project asset list immediately", async () => {
    const workbench = {
      state: {
        ...buildProjectState(),
        projectDetail: {
          project: { id: "project-1", projectId: "project-1", name: "try" },
          episodes: [],
          shots: [],
          assetsByType: {
            character: [
              {
                id: "character-1",
                label: "旧角色名",
                assetKey: "old-character-key",
                previewUrl: "/uploads/character-1.png",
                latestVersion: {
                  previewUrl: "/uploads/character-1.png",
                  metadata: {
                    label: "旧角色名",
                    description: "旧描述",
                  },
                },
              },
            ],
            scene: [],
            prop: [],
            other: { image: [], video: [] },
          },
        },
      },
      ui: buildProjectUi({
        projectPanelMode: "project-detail",
        projectAssetTab: "character",
        selectedProjectCardId: "project-1",
        importedAssets: {
          character: [
            {
              id: "character-1",
              kind: "character",
              name: "旧角色名",
              preview: "/uploads/character-1.png",
              description: "旧描述",
            },
          ],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
        renameImportedAsset: {
          assetId: "character-1",
          assetKind: "character",
          mediaType: "image",
          name: "旧角色名",
        },
        renameImportedAssetName: "新角色名",
      }),
      api: {
        async updateProjectAsset(assetId, input) {
          assert.equal(assetId, "character-1");
          assert.deepEqual(input, { name: "新角色名" });
          return { asset: { id: assetId, name: input.name } };
        },
      },
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "confirm-rename-imported-asset",
      },
    });

    assert.equal(workbench.ui.importedAssets.character[0].name, "新角色名");
    assert.equal(workbench.state.projectDetail.assetsByType.character[0].label, "新角色名");
    assert.equal(
      workbench.state.projectDetail.assetsByType.character[0].latestVersion.metadata.label,
      "新角色名",
    );
    assert.equal(workbench.ui.renameImportedAsset, null);
    assert.equal(workbench.ui.renameImportedAssetName, "");
    assert.equal(workbench.ui.toast, "操作已完成。");
    assert.equal(workbench.ui.projectDetail.assetsByType.character[0].label, "新角色名");
    assert.equal(workbench.ui.projectDetail.assetsByType.character[0].latestVersion.metadata.label, "新角色名");
  });
});

describe("production workbench project tab", () => {
  function buildProjectState() {
    return {
      project: {
        id: "project-1",
        name: "try",
        phase: "asset_review",
        aspectRatio: "9:16",
        resolution: "1080p",
      },
      assetReview: { readyForGeneration: false },
      assetCandidates: {
        characters: [{ assetKey: "hero", label: "hero", required: true, confirmed: false }],
        scenes: [{ assetKey: "city", label: "city", required: true, confirmed: false }],
        props: [{ assetKey: "sword", label: "sword", required: false, confirmed: false }],
      },
      calibration: null,
      shots: [
        {
          id: "shot-1",
          title: "Shot 001",
          currentImageAssetVersionId: null,
          currentVideoAssetVersionId: null,
        },
      ],
      exportPreview: null,
    };
  }

  function buildProjectUi(overrides = {}) {
    const state = buildProjectState();
    const storyboards = createStoryboardList(state);

    return {
      activeNavTab: "project",
      storyboards,
      selectedStoryboard: storyboards[0],
      selectedModelId: "vidu-q3-pro",
      prompt: "",
      busy: false,
      projectPanelMode: "library",
      projectLibrary: [],
      validationMessage: "",
      toast: "",
      isScriptModalOpen: false,
      isCreateModalOpen: false,
      scriptTab: "script-upload",
      uploadNotice: "",
      defaultScript: "Episode 1",
      ...overrides,
    };
  }

  it("uses the configured default image and video models when generation modes change", async () => {
    const workbench = {
      state: buildProjectState(),
      api: {},
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        episodeMediaMode: "image",
        imageGenerationMode: "single-image",
        videoGenerationMode: "first-frame",
        selectedModelId: "jimeng-4-5",
        episodeGenerationConfig: {
          defaultImageModelCode: "gpt-image-2-cn",
          defaultVideoModelCode: "seedance-i2v-pro",
          models: [
            {
              modelCode: "gpt-image-2-cn",
              supportedModes: ["text_to_image", "multi_reference", "image_to_image"],
            },
            {
              modelCode: "seedance-i2v-pro",
              supportedModes: ["image_to_video", "video"],
            },
          ],
        },
      }),
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "set-episode-media-mode",
        mode: "image",
      },
    });
    assert.equal(workbench.ui.selectedModelId, "gpt-image-2-cn");

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "set-image-generation-mode",
        mode: "multi-image",
      },
    });
    assert.equal(workbench.ui.selectedModelId, "gpt-image-2-cn");

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "set-video-generation-mode",
        mode: "first-frame",
      },
    });
    assert.equal(workbench.ui.selectedModelId, "seedance-i2v-pro");
  });

  it("filters prompt dock models by supported modes when mediaType is absent", () => {
    const state = buildProjectState();
    const storyboards = addStoryboard([]).map((storyboard) => ({
      ...storyboard,
      id: "storyboard-model-filter-1",
      linkedShotId: "shot-model-filter-1",
      generationState: {
        firstFrame: {
          id: "first-frame-1",
          kind: "image",
          name: "首帧",
          url: "/uploads/first-frame.png",
        },
      },
    }));
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          episodeMediaMode: "video",
          videoGenerationMode: "first-frame",
          museScopeMode: "storyboard",
          selectedEpisodeId: "episode-new",
          selectedModelId: "gpt-image-2-cn",
          storyboards,
          selectedStoryboard: storyboards[0],
          selectedStoryboardId: storyboards[0].id,
          episodeStoryboardMap: {
            "episode-new": storyboards,
          },
          episodeGenerationConfig: {
            defaultImageModelCode: "gpt-image-2-cn",
            defaultVideoModelCode: "seedance-i2v-pro",
            models: [
              {
                modelCode: "gpt-image-2-cn",
                modelLabel: "GPT Image 2",
                supportedModes: ["text_to_image", "multi_reference", "image_to_image"],
              },
              {
                modelCode: "seedance-i2v-pro",
                modelLabel: "Seedance I2V",
                supportedModes: ["image_to_video", "video"],
              },
            ],
          },
        }),
      },
    });

    assert.match(html, /Seedance I2V/);
    assert.doesNotMatch(html, /GPT Image 2/);
  });

  it("defaults storyboard scope to the first storyboard conversation when entering the episode workbench", async () => {
    const conversationCalls = [];
    const workbench = {
      state: {
        ...buildProjectState(),
        projectDetail: {
          project: { id: "project-1", projectId: "project-1", name: "try" },
          episodes: [
            {
              id: "episode-2",
              title: "真实剧集",
              status: "draft",
              storyboardCount: 2,
              createdAt: "2026-06-02T08:00:00.000Z",
            },
          ],
          assetsByType: {
            character: [],
            scene: [],
            prop: [],
            other: { image: [], video: [] },
          },
          shots: [],
        },
        shots: [],
      },
      ui: buildProjectUi({
        projectPanelMode: "workspace",
        projectInteriorSection: "episodes",
        museScopeMode: "storyboard",
        selectedStoryboardId: "stale-storyboard-id",
        imageGenerationResult: { taskId: "stale-image-task" },
        videoGenerationResult: { taskId: "stale-video-task" },
      }),
      api: {
        async getEpisodeWorkbench() {
          return {
            project: { projectId: "project-1" },
            episode: { projectId: "project-1" },
            assetsByType: {
              character: [],
              scene: [],
              prop: [],
            },
          };
        },
        async listStoryboards() {
          return {
            items: [
              {
                id: "storyboard-first",
                linkedShotId: "shot-first",
                shotId: "shot-first",
                index: 1,
                title: "1",
                description: "第一条分镜",
              },
              {
                id: "storyboard-second",
                linkedShotId: "shot-second",
                shotId: "shot-second",
                index: 2,
                title: "2",
                description: "第二条分镜",
              },
            ],
          };
        },
        async getStoryboardConversationHistory(episodeId, storyboardId, mediaKind) {
          conversationCalls.push({ episodeId, storyboardId, mediaKind });
          return {
            entries: [
              {
                storyboardId: "storyboard-first",
                mediaKind: "video",
                taskId: "storyboard-first-video-task",
                promptPreview: "第一条分镜对话",
              },
            ],
          };
        },
      },
      root: {
        innerHTML: "",
        addEventListener() {},
        querySelector() {
          return null;
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "open-episode-workbench",
        episodeId: "episode-2",
      },
    });

    assert.equal(workbench.ui.projectPanelMode, "episode-workbench");
    assert.equal(workbench.ui.selectedEpisodeId, "episode-2");
    assert.equal(workbench.ui.selectedStoryboardId, "storyboard-first");
    assert.deepEqual(conversationCalls, [
      {
        episodeId: "episode-2",
        storyboardId: "first",
        mediaKind: "video",
      },
    ]);
    assert.equal(workbench.ui.episodeMediaMode, "video");
    assert.equal(workbench.ui.videoGenerationResult?.taskId, "storyboard-first-video-task");
  });

  it("reopens the previously selected storyboard when re-entering the same episode workbench", async () => {
    const conversationCalls = [];
    const workbench = {
      state: {
        ...buildProjectState(),
        projectDetail: {
          project: { id: "project-1", projectId: "project-1", name: "try" },
          episodes: [
            {
              id: "episode-2",
              title: "真实剧集",
              status: "draft",
              storyboardCount: 2,
              createdAt: "2026-06-02T08:00:00.000Z",
            },
          ],
          assetsByType: {
            character: [],
            scene: [],
            prop: [],
            other: { image: [], video: [] },
          },
          shots: [],
        },
        shots: [],
      },
      ui: buildProjectUi({
        projectPanelMode: "workspace",
        projectInteriorSection: "episodes",
        museScopeMode: "storyboard",
        selectedStoryboardId: "storyboard-second",
        imageGenerationResult: { taskId: "stale-image-task" },
        videoGenerationResult: { taskId: "stale-video-task" },
      }),
      api: {
        async getEpisodeWorkbench() {
          return {
            project: { projectId: "project-1" },
            episode: { projectId: "project-1" },
            assetsByType: {
              character: [],
              scene: [],
              prop: [],
            },
          };
        },
        async listStoryboards() {
          return {
            items: [
              {
                id: "storyboard-first",
                linkedShotId: "shot-first",
                shotId: "shot-first",
                index: 1,
                title: "1",
                description: "第一条分镜",
              },
              {
                id: "storyboard-second",
                linkedShotId: "shot-second",
                shotId: "shot-second",
                index: 2,
                title: "2",
                description: "第二条分镜",
              },
            ],
          };
        },
        async getStoryboardConversationHistory(episodeId, storyboardId, mediaKind) {
          conversationCalls.push({ episodeId, storyboardId, mediaKind });
          return {
            entries: [
              {
                storyboardId: "storyboard-second",
                mediaKind: "video",
                taskId: "storyboard-second-video-task",
                promptPreview: "第二条分镜对话",
              },
            ],
          };
        },
      },
      root: {
        innerHTML: "",
        addEventListener() {},
        querySelector() {
          return null;
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "open-episode-workbench",
        episodeId: "episode-2",
      },
    });

    assert.equal(workbench.ui.projectPanelMode, "episode-workbench");
    assert.equal(workbench.ui.selectedEpisodeId, "episode-2");
    assert.equal(workbench.ui.selectedStoryboardId, "storyboard-second");
    assert.deepEqual(conversationCalls, [
      {
        episodeId: "episode-2",
        storyboardId: "second",
        mediaKind: "video",
      },
    ]);
    assert.equal(workbench.ui.videoGenerationResult?.taskId, "storyboard-second-video-task");
  });

  it("clears the right storyboard result area when entering an episode workbench with no storyboards", async () => {
    const conversationCalls = [];
    const workbench = {
      state: {
        ...buildProjectState(),
        projectDetail: {
          project: { id: "project-1", projectId: "project-1", name: "try" },
          episodes: [
            {
              id: "episode-2",
              title: "空剧集",
              status: "draft",
              storyboardCount: 0,
              createdAt: "2026-06-02T08:00:00.000Z",
            },
          ],
          assetsByType: {
            character: [],
            scene: [],
            prop: [],
            other: { image: [], video: [] },
          },
          shots: [],
        },
        shots: [],
      },
      ui: buildProjectUi({
        projectPanelMode: "workspace",
        projectInteriorSection: "episodes",
        museScopeMode: "storyboard",
        selectedStoryboardId: "stale-storyboard-id",
        imageGenerationResult: { taskId: "stale-image-task" },
        videoGenerationResult: { taskId: "stale-video-task" },
      }),
      api: {
        async getEpisodeWorkbench() {
          return {
            project: { projectId: "project-1" },
            episode: { projectId: "project-1" },
            assetsByType: {
              character: [],
              scene: [],
              prop: [],
            },
          };
        },
        async listStoryboards() {
          return {
            items: [],
          };
        },
        async getStoryboardConversationHistory(episodeId, storyboardId, mediaKind) {
          conversationCalls.push({ episodeId, storyboardId, mediaKind });
          return { entries: [] };
        },
      },
      root: {
        innerHTML: "",
        addEventListener() {},
        querySelector() {
          return null;
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "open-episode-workbench",
        episodeId: "episode-2",
      },
    });

    assert.equal(workbench.ui.projectPanelMode, "episode-workbench");
    assert.equal(workbench.ui.selectedStoryboardId, null);
    assert.deepEqual(conversationCalls, []);
    assert.equal(workbench.ui.imageGenerationResult ?? null, null);
    assert.equal(workbench.ui.videoGenerationResult, null);
  });

  it("renders configured image model labels in the episode prompt dock", () => {
    const html = renderProductionWorkbench({
      state: buildProjectState(),
      session: { user: { phone: "+86 13800138000" } },
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        museScopeMode: "assets",
        episodeMediaMode: "image",
        selectedModelId: "gpt-image-2-cn",
        selectedEpisodeAssetId: "asset-character-1",
        importedAssets: {
          character: [
            {
              id: "asset-character-1",
              assetId: "asset-character-1",
              name: "主角",
              description: "主角固定形象",
              previewUrl: "/uploads/hero.png",
            },
          ],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
        episodeGenerationConfig: {
          defaultImageModelCode: "gpt-image-2-cn",
          models: [
            {
              modelCode: "gpt-image-2-cn",
              modelLabel: "GPT Image 2",
              mediaType: "image",
              supportedModes: ["text_to_image", "multi_reference", "image_to_image"],
              displayBaseCost: 90,
            },
          ],
        },
      }),
    });

    assert.match(html, /GPT Image 2/);
    assert.doesNotMatch(html, /nano banana 2（链路G）/);
  });

  it("opens the team rail tab after loading team data", async () => {
    const previousWindow = globalThis.window;
    globalThis.window = { location: { hash: "#project" } };
    const root = {
      innerHTML: "",
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    };
    let overviewCalls = 0;
    let membersCalls = 0;
    const workbench = {
      state: buildProjectState(),
      session: { user: { phone: "+86 13800138000" } },
      root,
      api: {
        async getTeamOverview() {
          overviewCalls += 1;
          return {
            entitlements: { teamMemberManagement: true },
            permissions: { canCreateMember: true },
            seats: { total: 3, used: 1, remaining: 2 },
          };
        },
        async getTeamMembers() {
          membersCalls += 1;
          return {
            members: [
              {
                id: "member-1",
                teamAccount: "director_001",
                displayName: "Director One",
                businessRole: "director",
                status: "enabled",
              },
            ],
          };
        },
      },
      ui: buildProjectUi({
        activeNavTab: "project",
        libraryTeamRoute: "assets",
        teamMembers: [],
        teamOverview: null,
        teamError: "",
        teamDashboardTab: "member-consumption",
        teamDashboardDateShortcut: "今天",
      }),
    };
    let nextHash = "";

    try {
      await handleWorkbenchActionForTest(workbench, {
        dataset: { action: "set-nav-tab", tab: "team" },
      });
      nextHash = globalThis.window.location.hash;
    } finally {
      globalThis.window = previousWindow;
    }

    assert.equal(workbench.ui.activeNavTab, "team");
    assert.equal(workbench.ui.libraryTeamRoute, "team");
    assert.equal(nextHash, "team");
    assert.equal(workbench.ui.teamError, "");
    assert.equal(workbench.ui.teamMembers.length, 1);
    assert.equal(overviewCalls, 1);
    assert.equal(membersCalls, 1);
    assert.match(root.innerHTML, /library-team-page/);
    assert.match(root.innerHTML, /open-team-dashboard/);
  });

  it("opens the independent official asset library from the rail tab", async () => {
    const previousWindow = globalThis.window;
    globalThis.window = { location: { hash: "#team" } };
    const root = {
      innerHTML: "",
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    };
    const workbench = {
      state: buildProjectState(),
      session: { user: { phone: "+86 13800138000" } },
      root,
      api: {
        async getLibraryAssets() {
          return {
            categories: [{ id: "character", label: "角色" }],
            folders: ["国内仿真人-现代都市"],
            assets: [],
            entitlement: { hasTeamAssetLibrary: false },
          };
        },
      },
      ui: buildProjectUi({
        activeNavTab: "team",
        libraryTeamRoute: "team",
        libraryCategory: "character",
        libraryFolder: "国内仿真人-现代都市",
        libraryAssets: [],
        libraryCategories: [],
        libraryFolders: [],
        libraryEntitlement: { hasTeamAssetLibrary: false },
        teamMembers: [],
        teamOverview: {
          entitlements: { teamMemberManagement: false },
          seats: { total: 5, used: 5, remaining: 0 },
          permissions: { canCreateMember: true },
        },
        teamError: "",
      }),
    };

    try {
      await handleWorkbenchActionForTest(workbench, {
        dataset: { action: "set-nav-tab", tab: "library" },
      });
    } finally {
      globalThis.window = previousWindow;
    }

    assert.equal(workbench.ui.activeNavTab, "library");
    assert.equal(workbench.ui.libraryTeamRoute, "assets");
    assert.match(root.innerHTML, /official-library-page/);
    assert.match(root.innerHTML, /官方资产库/);
    assert.match(root.innerHTML, /团队资产库/);
    assert.doesNotMatch(root.innerHTML, /个人资产库/);
    assert.doesNotMatch(root.innerHTML, /资产沉淀台/);
    assert.match(root.innerHTML, /data-action="set-library-asset-scope"/);
    assert.doesNotMatch(root.innerHTML, /open-team-dashboard/);
  });

  it("keeps official and team asset library interactions wired to all reusable asset types", async () => {
    const previousWindow = globalThis.window;
    globalThis.window = { location: { hash: "#library" } };
    const root = {
      innerHTML: "",
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    };
    const libraryAssets = [
      { id: "library-character-ancient", name: "皇帝", category: "character", folder: "国内仿真人-东方古代" },
      { id: "library-scene-modern", name: "别墅", category: "scene", folder: "国内仿真人-现代都市" },
      { id: "library-prop-ancient", name: "圣旨", category: "prop", folder: "国内仿真人-东方古代" },
    ];
    const calls = [];
    const workbench = {
      state: buildProjectState(),
      session: { user: { phone: "+86 13800138000" } },
      root,
      api: {
        async getLibraryAssets(params = {}) {
          calls.push(params);
          const category = params.category ?? "character";
          const folder = params.folder ?? "";
          return {
            categories: [
              { id: "character", label: "角色" },
              { id: "scene", label: "场景" },
              { id: "prop", label: "道具" },
            ],
            folders: ["国内仿真人-现代都市", "国内仿真人-东方古代"],
            assets: libraryAssets.filter(
              (asset) => asset.category === category && (!folder || asset.folder === folder),
            ),
            entitlement: { hasTeamAssetLibrary: true },
          };
        },
      },
      ui: buildProjectUi({
        activeNavTab: "library",
        libraryTeamRoute: "assets",
        libraryTeamAssetScope: "official",
        libraryCategory: "character",
        libraryFolder: "国内仿真人-东方古代",
        libraryQuery: "",
        libraryAssets: [libraryAssets[0]],
        libraryCategories: [
          { id: "character", label: "角色" },
          { id: "scene", label: "场景" },
          { id: "prop", label: "道具" },
        ],
        libraryFolders: ["国内仿真人-现代都市", "国内仿真人-东方古代"],
        libraryEntitlement: { hasTeamAssetLibrary: true },
      }),
    };

    try {
      await handleWorkbenchActionForTest(workbench, {
        dataset: { action: "set-library-category", libraryCategory: "scene" },
      });
      assert.equal(workbench.ui.libraryCategory, "scene");
      assert.equal(calls.at(-1)?.category, "scene");
      assert.equal(calls.at(-1)?.folder, "");
      assert.equal(workbench.ui.libraryFolder, "国内仿真人-现代都市");
      assert.match(root.innerHTML, /别墅/);

      await handleWorkbenchActionForTest(workbench, {
        dataset: { action: "set-library-folder", libraryFolder: "国内仿真人-现代都市" },
      });
      assert.equal(workbench.ui.libraryFolder, "国内仿真人-现代都市");
      assert.equal(calls.at(-1)?.folder, "国内仿真人-现代都市");
      assert.match(root.innerHTML, /别墅/);

      await handleWorkbenchActionForTest(workbench, {
        dataset: { action: "set-library-category", libraryCategory: "prop" },
      });
      assert.equal(workbench.ui.libraryCategory, "prop");
      await handleWorkbenchActionForTest(workbench, {
        dataset: { action: "set-library-folder", libraryFolder: "国内仿真人-东方古代" },
      });
      assert.match(root.innerHTML, /圣旨/);

      await handleWorkbenchActionForTest(workbench, {
        dataset: { action: "set-library-asset-scope", assetScope: "team" },
      });
      assert.equal(workbench.ui.libraryTeamAssetScope, "team");
      assert.match(root.innerHTML, /团队资产库/);
    } finally {
      globalThis.window = previousWindow;
    }

    const folders = [
      "国内仿真人-现代都市",
      "国内仿真人-东方古代",
      "3D漫-现代都市",
      "3D漫-东方修仙",
      "2D漫-现代都市",
      "2D漫-东方修仙",
    ];
    for (const assetKind of ["character", "scene", "prop"]) {
      for (const folder of folders) {
        assert.ok(
          getLibraryAssetsForImport({ assetKind, folder }).length > 0,
          `${assetKind} ${folder} should include reusable official assets`,
        );
      }
    }
  });

  it("keeps team member creation behind the membership gate", () => {
    const html = renderProductionWorkbench({
      state: buildProjectState(),
      session: { user: { phone: "+86 13800138000" } },
      ui: buildProjectUi({
        activeNavTab: "team",
        libraryTeamRoute: "team",
        teamOverview: {
          entitlements: { teamMemberManagement: false },
          seats: { total: 0, used: 0, remaining: 0 },
          permissions: { canCreateMember: true },
        },
        teamMembers: [],
        teamError: "",
      }),
    });

    assert.match(html, /data-action="open-pricing"/);
    assert.doesNotMatch(html, /data-action="open-team-member-create"/);
    assert.doesNotMatch(html, /data-action="open-create-member"/);
  });

  it("sorts newest projects first and paginates after eight items", () => {
    const state = buildProjectState();
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: buildProjectUi({
        projectLibrary: [
          { id: "project-card-1", name: "Alpha", createdAt: "2026/05/14" },
          { id: "project-card-2", name: "Beta", createdAt: "2026/05/15" },
          { id: "project-card-3", name: "Gamma", createdAt: "2026/05/16" },
          { id: "project-card-4", name: "Delta", createdAt: "2026/05/17" },
          { id: "project-card-5", name: "Epsilon", createdAt: "2026/05/18" },
          { id: "project-card-6", name: "Zeta", createdAt: "2026/05/19" },
          { id: "project-card-7", name: "Eta", createdAt: "2026/05/20" },
          { id: "project-card-8", name: "Theta", createdAt: "2026/05/21" },
          { id: "project-card-9", name: "Iota", createdAt: "2026/05/22" },
        ],
      }),
    });

    assert.match(html, /project-gallery-shell/);
    assert.match(html, /data-action="search-projects"/);
    assert.doesNotMatch(html, /data-action="change-project-page"/);
    assert.equal([...html.matchAll(/class="project-gallery-card"/g)].length, 9);
    assert.ok(html.indexOf("Iota") < html.indexOf("Theta"));
    assert.ok(html.indexOf("Theta") < html.indexOf("Beta"));
    assert.ok(html.indexOf("Beta") < html.indexOf("Alpha"));
  });

  it("filters the gallery with fuzzy name search", () => {
    const state = buildProjectState();
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: buildProjectUi({
        projectSearchQuery: "alp",
        projectLibrary: [
          { id: "project-card-1", name: "Alpha One", createdAt: "2026/05/21" },
          { id: "project-card-2", name: "Beta Two", createdAt: "2026/05/22" },
          { id: "project-card-3", name: "ALP Mission", createdAt: "2026/05/20" },
        ],
      }),
    });

    assert.equal([...html.matchAll(/class="project-gallery-card"/g)].length, 2);
    assert.match(html, /Alpha One/);
    assert.match(html, /ALP Mission/);
    assert.doesNotMatch(html, /Beta Two/);
  });

  it("renders project card actions for cover upload, rename, and delete", () => {
    const state = buildProjectState();
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: buildProjectUi({
        projectCardMenuId: "project-card-1",
        projectLibrary: [
          {
            id: "project-card-1",
            name: "Alpha One",
            status: "In Progress",
            createdAt: "2026/05/21",
            coverImageUrl: "data:image/png;base64,abc123",
          },
        ],
      }),
    });

    const menuHtml = html.match(/<div class="project-card-menu"[\s\S]*?<\/div>/)?.[0] ?? "";
    assert.match(html, /toggle-project-card-menu/);
    assert.match(html, /upload-project-cover/);
    assert.match(menuHtml, /<label class="project-card-menu-item"[^>]*for="project-cover-menu-input-project-card-1"[^>]*>上传封面<\/label>/);
    assert.doesNotMatch(menuHtml, /替换封面/);
    assert.match(html, /上传封面/);
    assert.match(html, /重命名/);
    assert.match(html, /删除/);
    assert.match(html, /<img class="project-gallery-cover" src="data:image\/png;base64,abc123"/);
  });

  it("uses an explicit pending script seed until backend supports metadata-only project creation", () => {
    assert.deepEqual(
      buildProjectCreateRequest({
        name: "try",
        aspectRatio: "9:16",
        projectType: "anime",
      }),
      {
        name: "try",
        scriptInput: "待上传剧本：try。请在项目详情中通过剧本上传、剧本库或分镜单上传补充正式素材。",
        aspectRatio: "9:16",
        resolution: "1080p",
        projectType: "anime",
      },
    );
  });

  it("shows the combined validation toast copy for missing project creation fields", () => {
    const html = renderProjectCreateModal({
      show: true,
      defaultName: "",
      selectedAspectRatio: "",
      selectedProjectType: "anime",
      notice: "请填写项目名称和画面比例",
    });

    assert.match(html, /class="create-modal-toast"[^>]*>请填写项目名称和画面比例/);
    assert.doesNotMatch(html, /class="modal-inline-status">请填写项目名称和画面比例/);
    assert.match(html, /请填写项目名称和画面比例/);
    assert.doesNotMatch(html, /value="9:16" checked/);
  });

  it("renders new projects with an upload-cover placeholder", () => {
    const state = buildProjectState();
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: buildProjectUi({
        projectLibrary: [
          {
            id: "project-card-1",
            name: "No Cover",
            status: "Draft",
            createdAt: "2026/05/22",
            coverImageUrl: "",
          },
        ],
      }),
    });

    assert.match(html, /project-gallery-poster needs-cover/);
    assert.match(html, /project-cover-placeholder/);
    assert.match(html, /data-action="pick-project-cover"/);
    assert.match(html, /<label class="project-cover-placeholder"[^>]*for="project-cover-input-project-card-1"/);
    assert.match(html, /id="project-cover-input-project-card-1" class="project-cover-input" type="file" accept="image\/\*"/);
  });

  it("finds the exact cover input for the requested project", () => {
    const queriedSelectors = [];
    const matchedInput = { id: "input-project-2" };
    const root = {
      querySelector(selector) {
        queriedSelectors.push(selector);
        return selector.includes('data-project-id="project-2"') ? matchedInput : null;
      },
    };

    assert.equal(findProjectCoverInput(root, "project-2"), matchedInput);
    assert.deepEqual(queriedSelectors, [
      'input[data-action="upload-project-cover"][data-project-id="project-2"]',
    ]);
    assert.equal(findProjectCoverInput(root, ""), null);
  });

  it("uploads a project cover through the backend update flow", async () => {
    const calls = [];
    const workbench = {
      state: { project: { id: "project-1" } },
      ui: { selectedProjectCardId: null },
      api: {
        uploadFile: async () => {
          calls.push("uploadFile");
          return {
            upload: {
              uploadSessionId: "session-1",
              storageObjectId: "storage-1",
            },
          };
        },
        updateProjectCover: async (input) => {
          calls.push(["updateProjectCover", input]);
          return {
            project: {
              id: "project-1",
              name: "Cover QA",
              phase: "script_input",
              aspectRatio: "9:16",
              coverImageUrl: "/uploads/storage/storage-1/cover.png",
              coverStorageObjectId: input.storageObjectId,
              createdAt: "2026-05-29T00:00:00.000Z",
              updatedAt: "2026-05-29T00:00:01.000Z",
            },
          };
        },
      },
      ui: {
        episodeGenerationConfig: {
          uploadLimits: {
            image: {
              maxBytes: 20 * 1024 * 1024,
              maxReferencesPerTask: 30,
            },
          },
        },
        projectLibrary: [
          {
            id: "project-1",
            name: "Cover QA",
            aspectRatio: "9:16",
            status: "Draft",
            coverImageUrl: "",
            createdAt: "2026/05/29",
            createdAtTimestamp: Date.UTC(2026, 4, 29),
          },
        ],
      },
    };

    await uploadProjectCoverFile(workbench, { name: "cover.png", size: 10, type: "image/png" }, "project-1");

    assert.deepEqual(calls, [
      "uploadFile",
      [
        "updateProjectCover",
        {
          projectId: "project-1",
          storageObjectId: "storage-1",
          uploadSessionId: "session-1",
        },
      ],
    ]);
    assert.equal(workbench.ui.projectLibrary[0].coverImageUrl, "/uploads/storage/storage-1/cover.png");
    assert.equal(workbench.state.project.coverImageUrl, "/uploads/storage/storage-1/cover.png");
    assert.equal(workbench.state.project.coverStorageObjectId, "storage-1");
  });

  it("renders the rename modal when renaming a project", () => {
    const state = buildProjectState();
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: buildProjectUi({
        renameProjectId: "project-card-1",
        renameProjectName: "11",
        projectLibrary: [{ id: "project-card-1", name: "11", createdAt: "2026/05/21" }],
      }),
    });

    assert.match(html, /data-action="close-rename-project-modal"/);
    assert.match(html, /id="project-rename-name-input"/);
    assert.match(html, /maxlength="50"/);
    assert.match(html, />2\/50<\/span>/);
    assert.match(html, /data-action="confirm-rename-project-card"/);
  });

  it("renders generation controls and export history in the episodes section", () => {
    const state = buildProjectState();
    const storyboards = createStoryboardList(state);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        projectPanelMode: "episode-workbench",
        projectInteriorSection: "episodes",
        selectedEpisodeId: "episode-new",
        storyboards,
        selectedStoryboard: storyboards[0],
        customEpisodes: [
          {
            id: "episode-new",
            title: "新建剧集",
            status: "Draft",
            createdAt: "2026/05/22",
            createdAtMs: Date.parse("2026-05-22T08:00:00.000Z"),
            storyboardCount: 1,
          },
        ],
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        isCreateModalOpen: false,
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
        calibrationSkipReason: "Already covered by approved frames",
        calibrationOverrideReason: "Creative direction needs a deliberate override",
        imageGenerationResult: {
          platform: {
            workflowId: "workflow-image-1",
            workflowStatus: "running",
            tasks: [
              {
                shotId: "shot-1",
                taskId: "task-image-1",
                providerRequestId: "provider-image-1",
                storageObjectId: "storage-image-1",
                storageObjectKey: "shots/shot-1/image-task-image-1.png",
              },
            ],
          },
        },
        videoGenerationResult: {
          platform: {
            workflowId: "workflow-video-1",
            workflowStatus: "running",
            tasks: [
              {
                shotId: "shot-1",
                taskId: "task-video-1",
                providerRequestId: "provider-video-1",
                storageObjectId: "storage-video-1",
                storageObjectKey: "shots/shot-1/video-task-video-1.mp4",
              },
            ],
          },
        },
        exportHistory: [
          {
            manifestStatus: "ready",
            itemCount: 3,
            missingAssetCount: 0,
            createdAt: "2026-05-22T08:00:00.000Z",
            latestSignedUrlExpiresAt: "2026-05-22T09:00:00.000Z",
          },
        ],
        exportPreviewResult: {
          platform: {
            workflowId: "workflow-export-1",
            taskId: "task-export-1",
            storageObjectId: "storage-export-1",
            storageObjectKey: "exports/project-1/manifest-task-export-1.json",
            signedUrl: "https://example.com/export",
            expiresAt: "2026-05-22T09:00:00.000Z",
            workflowStatus: "completed",
          },
          exportRecord: {
            id: "export-record-1",
            workflowId: "workflow-export-1",
            storageObjectId: "storage-export-1",
            manifestStatus: "ready",
            latestSignedUrlExpiresAt: "2026-05-22T09:00:00.000Z",
            itemCount: 3,
            missingAssetCount: 0,
          },
        },
      },
    });

    assert.match(html, /data-action="back-to-episode-hub"/);
    assert.match(html, /episode-replica-layout storyboard-mode/);
    assert.match(html, /data-action="set-muse-scope-mode" data-mode="storyboard"/);
    assert.match(html, /data-action="generate-images"/);
    assert.match(html, /data-action="preview-export"/);
    assert.match(html, /episode-replica-generated-stage visible/);
    assert.match(html, /data-result-action="edit"/);
    assert.match(html, /episode-export-preview/);
    assert.match(html, /episode-export-preview-link/);
    assert.ok(html.includes("https://example.com/export"));
  });

  it("keeps image mode controls aligned with image-generation semantics", () => {
    const state = buildProjectState();
    const storyboards = createStoryboardList(state);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        projectPanelMode: "episode-workbench",
        storyboards,
        selectedStoryboard: storyboards[0],
        selectedStoryboardId: storyboards[0].id,
        selectedModelId: "tnb-pro",
        episodeMediaMode: "image",
        imageGenerationMode: "single-image",
        prompt: "废土风格的夜景分镜",
        busy: false,
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        isCreateModalOpen: false,
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
        imageResolution: "2K",
        imageAspectRatio: "16:9",
        videoDurationSec: "5",
      },
    });

    assert.match(html, /nano banana 2（链路G）/);
    assert.doesNotMatch(html, /Vidu Q3 Pro/);
    assert.doesNotMatch(html, /5秒/);
  });

  it("renders the episode hub with created episodes and preserved create flows", () => {
    const state = buildProjectState();
    const storyboards = createStoryboardList(state).map((storyboard, index) =>
      index === 0
        ? {
            ...storyboard,
            previewVideo: "https://cdn.example.com/storyboard-1.mp4",
            videoStatus: "ready",
          }
        : storyboard,
    );
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        projectPanelMode: "workspace",
        projectInteriorSection: "episodes",
        storyboards,
        selectedStoryboard: storyboards[0],
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        isCreateModalOpen: false,
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
      },
    });

    assert.match(html, /episode-hub-shell populated/);
    assert.match(html, /episode-launch-card ai/);
    assert.match(html, /episode-launch-card single/);
    assert.match(html, /data-action="open-batch-episode-flow"/);
    assert.match(html, /data-action="open-single-episode-flow"/);
    assert.match(html, /episode-library-card/);
    assert.ok(html.includes("2026/05/22"));
    assert.doesNotMatch(html, /episode-hub-shell empty/);
    assert.match(html, /<video src="https:\/\/cdn\.example\.com\/storyboard-1\.mp4"/);
    assert.match(html, /data-action="open-episode-workbench"/);
    assert.match(html, /data-action="toggle-episode-card-menu"/);
  });

  it("prefers a real persisted episode over episode-primary fallback when both exist", () => {
    const state = {
      projectDetail: {
        project: {
          id: "project-1",
          name: "项目一",
          phase: "asset_review",
          createdAt: "2026-05-22T00:00:00.000Z",
        },
        episodes: [
          {
            id: "episode-1",
            title: "第一集",
            status: "draft",
            createdAt: "2026-05-22T00:00:00.000Z",
            storyboardCount: 1,
          },
        ],
        shots: [
          {
            id: "shot-unassigned-1",
            title: "Unassigned shot",
            description: "fallback shot",
            episodeId: null,
          },
        ],
      },
      shots: [
        {
          id: "shot-unassigned-1",
          title: "Unassigned shot",
          description: "fallback shot",
          episodeId: null,
        },
      ],
      assetReview: { readyForGeneration: false },
      calibration: null,
      exportPreview: null,
    };

    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        projectPanelMode: "episode-workbench",
        projectInteriorSection: "episodes",
        selectedEpisodeId: "episode-primary",
        episodeStoryboardMap: {
          "episode-1": [
            {
              id: "storyboard-episode-1",
              index: 1,
              title: "1",
              linkedShotId: "shot-episode-1",
              description: "real episode storyboard",
              uploadedImages: [],
              uploadedVideos: [],
            },
          ],
          "episode-primary": [
            {
              id: "storyboard-primary-1",
              index: 1,
              title: "1",
              linkedShotId: "shot-unassigned-1",
              description: "fallback storyboard",
              uploadedImages: [],
              uploadedVideos: [],
            },
          ],
        },
        storyboards: [
          {
            id: "storyboard-primary-1",
            index: 1,
            title: "1",
            linkedShotId: "shot-unassigned-1",
            description: "fallback storyboard",
            uploadedImages: [],
            uploadedVideos: [],
          },
        ],
        selectedStoryboardId: "storyboard-primary-1",
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        validationMessage: "",
        toast: "",
        projectAssetTab: "character",
        importedAssets: {
          character: [],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
      },
    });

    assert.match(html, /data-episode-id="episode-1"/);
    assert.doesNotMatch(html, /data-episode-id="episode-primary"/);
  });

  it("renders the episode workbench when an episode card is opened", () => {
    const state = {
      ...buildProjectState(),
      shots: [],
    };
    const storyboards = addStoryboard([]);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          episodeMediaMode: "video",
          museScopeMode: "storyboard",
          selectedEpisodeId: "episode-new",
          storyboards,
          selectedStoryboard: storyboards[0],
          customEpisodes: [
            {
              id: "episode-new",
              title: "新建剧集",
              status: "Draft",
              createdAt: "2026/05/22",
              createdAtMs: Date.parse("2026-05-22T08:00:00.000Z"),
              storyboardCount: 1,
            },
          ],
        }),
      },
    });

    assert.match(html, /data-action="back-to-episode-hub"/);
    assert.match(html, /episode-workbench-screen/);
    assert.match(html, /分镜工作台/);
    assert.match(html, /workbench-rail persistent/);
    assert.match(html, /episode-replica-return/);
    assert.match(
      html,
      /<button class="episode-replica-return"[\s\S]*?返回[\s\S]*?<\/button>\s*<span class="episode-replica-timestamp">新建剧集/,
    );
    assert.match(html, /episode-replica-layout/);
    assert.match(html, /episode-replica-layout storyboard-mode/);
    assert.match(html, /episode-replica-center video-mode storyboard-scope/);
    assert.match(html, /episode-replica-prompt video-mode storyboard-scope/);
    assert.match(html, /episode-replica-prompt-footer/);
    assert.match(html, /<textarea id="video-prompt-input"/);
    assert.match(html, /<button class="episode-replica-generate" type="button" data-action="generate-videos"[\s\S]*?生成[\s\S]*?<\/button>/);
    assert.doesNotMatch(html, /global-statusbar/);
    assert.doesNotMatch(html, /muse-storyboard-rail/);
    assert.doesNotMatch(html, /muse-asset-lane/);
    assert.doesNotMatch(html, /muse-prompt-dock/);
  });

  it("keeps episode workspace image generation clickable until calibration exists", () => {
    const state = buildProjectState();
    const storyboards = createStoryboardList(state);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          selectedEpisodeId: "episode-primary",
          storyboards,
          selectedStoryboard: storyboards[0],
        }),
      },
    });

    assert.match(html, /data-action="generate-images"/);
    assert.doesNotMatch(html, /data-action="generate-images"[^>]*disabled/);
  });

  it("submits real storyboard image generation without auto-running three-shot calibration", async () => {
    const state = {
      ...buildProjectState(),
      assetReview: { readyForGeneration: false },
      calibration: null,
      projectDetail: {
        project: { id: "project-1", projectId: "project-1", name: "try" },
        episodes: [
          {
            id: "10000000-0000-4000-8000-000000000001",
            title: "真实剧集",
            status: "draft",
            storyboardCount: 2,
            createdAt: "2026-05-31T08:00:00.000Z",
          },
        ],
        assetsByType: {
          character: [],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
        shots: [],
      },
      shots: [],
    };
    const storyboards = [
      {
        ...addStoryboard([])[0],
        id: "storyboard-image-1",
        linkedShotId: "10000000-0000-4000-8000-000000000101",
        prompt: "海边远景，柔和光线",
        generationState: {
          quickReferenceItems: [
            {
              id: "ref-1",
              kind: "image",
              url: "/uploads/reference.png",
            },
          ],
        },
      },
      {
        ...addStoryboard([])[0],
        id: "storyboard-image-2",
        linkedShotId: "10000000-0000-4000-8000-000000000102",
        prompt: "城市夜景",
      },
    ];
    const createImageTaskCalls = [];
    let calibrationCalls = 0;
    const workbench = {
      state,
      api: {
        async runCalibration() {
          calibrationCalls += 1;
          throw new Error("invalid_calibration_selection");
        },
        async createImageTask(episodeId, payload) {
          createImageTaskCalls.push({ episodeId, payload });
          return {
            taskId: "storyboard-image-task-1",
            status: "queued",
            workflowStatus: "queued",
            platform: {
              workflowStatus: "queued",
              tasks: [{ taskId: "storyboard-image-task-1" }],
            },
          };
        },
      },
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        museScopeMode: "storyboard",
        episodeMediaMode: "image",
        selectedEpisodeId: "10000000-0000-4000-8000-000000000001",
        selectedStoryboardId: "storyboard-image-1",
        selectedStoryboard: storyboards[0],
        storyboards,
        episodeStoryboardMap: {
          "10000000-0000-4000-8000-000000000001": storyboards,
        },
        selectedModelId: "gpt-image-2-cn",
        episodeGenerationConfig: {
          defaultImageModelCode: "gpt-image-2-cn",
          models: [
            {
              modelCode: "gpt-image-2-cn",
              modelLabel: "GPT Image 2",
              mediaType: "image",
              supportedModes: ["single-image", "multi-image"],
            },
          ],
        },
        prompt: "海边远景，柔和光线",
      }),
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
      timers: new Set(),
      uploadTasks: new Map(),
    };

    const previousWindow = globalThis.window;
    globalThis.window = {
      setTimeout(callback, delayMs) {
        return { callback, delayMs };
      },
      clearTimeout() {},
    };
    try {
      await generateStoryboardImages(workbench);
    } finally {
      globalThis.window = previousWindow;
    }

    assert.equal(calibrationCalls, 0);
    assert.equal(createImageTaskCalls.length, 1);
    assert.equal(createImageTaskCalls[0].episodeId, "10000000-0000-4000-8000-000000000001");
    assert.equal(createImageTaskCalls[0].payload.model, "gpt-image-2-cn");
    assert.equal(createImageTaskCalls[0].payload.targetType, "storyboard");
    assert.equal(createImageTaskCalls[0].payload.targetId, "10000000-0000-4000-8000-000000000101");
    assert.equal(workbench.ui.imageGenerationResult.taskId, "storyboard-image-task-1");
  });

  it("renders storyboard media data in the episode workbench", () => {
    const state = {
      ...buildProjectState(),
      shots: [],
    };
    const storyboards = [
      {
        ...addStoryboard([])[0],
        uploadedVideos: [
          {
            id: "video-1",
            src: "/uploads/storyboard-videos/video-1.mp4",
            durationLabel: "00:06",
            status: "ready",
            thumbnailSrc: "data:image/jpeg;base64,video-thumb-1",
          },
          {
            id: "video-2",
            src: "/uploads/storyboard-videos/video-2.mp4",
            durationLabel: "00:08",
            status: "ready",
            thumbnailSrc: "data:image/jpeg;base64,video-thumb-2",
          },
        ],
        selectedUploadedVideoId: "video-1",
        videoStatus: "ready",
        previewVideo: "/uploads/storyboard-videos/video-1.mp4",
        previewUrl: "/uploads/storyboard-videos/video-1.mp4",
        previewThumbnailUrl: "data:image/jpeg;base64,video-thumb-1",
      },
    ];
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          episodeMediaMode: "video",
          museScopeMode: "storyboard",
          selectedEpisodeId: "episode-new",
          storyboards,
          selectedStoryboard: storyboards[0],
          customEpisodes: [
            {
              id: "episode-new",
              title: "Episode Draft",
              status: "Draft",
              createdAt: "2026/05/22",
              createdAtMs: Date.parse("2026-05-22T08:00:00.000Z"),
              storyboardCount: 1,
            },
          ],
          episodeStoryboardMap: {
            "episode-new": storyboards,
          },
        }),
      },
    });

    assert.match(html, /episode-replica-layout/);
    assert.match(html, /\/uploads\/storyboard-videos\/video-1\.mp4/);
    assert.match(html, /data-action="delete-storyboard-video"/);
  });

  it("renders uploading storyboard media states in the episode workbench", () => {
    const state = {
      ...buildProjectState(),
      shots: [],
    };
    const storyboards = [
      {
        ...addStoryboard([])[0],
        imageStatus: "uploading",
        uploadedImageName: "frame.png",
        uploadedVideos: [
          {
            id: "video-uploading-1",
            fileName: "take.mp4",
            src: "blob:local-video",
            status: "uploading",
          },
        ],
        selectedUploadedVideoId: "video-uploading-1",
        videoStatus: "uploading",
      },
    ];

    const videoHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          episodeMediaMode: "video",
          museScopeMode: "storyboard",
          selectedEpisodeId: "episode-new",
          storyboards,
          selectedStoryboard: storyboards[0],
          episodeStoryboardMap: {
            "episode-new": storyboards,
          },
        }),
      },
    });

    assert.match(videoHtml, /episode-replica-layout/);
    assert.match(videoHtml, /take\.mp4/);
    assert.match(videoHtml, /上传中/);

    const imageHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          episodeMediaMode: "image",
          museScopeMode: "storyboard",
          selectedEpisodeId: "episode-new",
          storyboards,
          selectedStoryboard: storyboards[0],
          episodeStoryboardMap: {
            "episode-new": storyboards,
          },
        }),
      },
    });

    assert.match(imageHtml, /episode-replica-layout/);
    assert.match(imageHtml, /frame\.png/);
  });

  it("writes completed episode video tasks back into storyboard exportable video state", () => {
    const storyboard = {
      ...addStoryboard([])[0],
      id: "storyboard-video-1",
      uploadedVideos: [],
      selectedUploadedVideoId: null,
      currentVideoAssetVersionId: null,
      previewVideo: null,
      videoStatus: "empty",
      generationState: {
        lastSubmission: {
          status: "running",
        },
      },
    };
    const workbench = {
      ui: {
        projectPanelMode: "episode-workbench",
        selectedEpisodeId: "episode-new",
        storyboards: [],
        episodeStoryboardMap: {
          "episode-new": [storyboard],
        },
        videoGenerationResult: {},
      },
    };

    applyEpisodeGenerationTaskResult(
      workbench,
      {
        status: "completed",
        taskId: "local-fixed-image-task",
        result: {
          mediaKind: "video",
          videoUrl: "/uploads/storage/fixed-video.mp4",
          assetVersionId: "local-fixed-image-task",
          storageObjectId: "60000000-0000-4000-8000-000000000123",
        },
      },
      "storyboard-video-1",
      "video",
    );

    const updated = workbench.ui.episodeStoryboardMap["episode-new"][0];
    assert.equal(updated.previewVideo, "/uploads/storage/fixed-video.mp4");
    assert.equal(updated.videoStatus, "ready");
    assert.equal(updated.selectedUploadedVideoId, "local-fixed-image-task");
    assert.equal(updated.currentVideoAssetVersionId, "local-fixed-image-task");
    assert.equal(updated.uploadedVideos.length, 1);
    assert.equal(updated.uploadedVideos[0].storageObjectId, "60000000-0000-4000-8000-000000000123");
    assert.equal(updated.generationState.lastSubmission.status, "completed");
  });

  it("surfaces provider failure messages from polled generation tasks", () => {
    const storyboard = {
      ...addStoryboard([])[0],
      id: "storyboard-video-failed-1",
      generationState: {
        lastSubmission: {
          status: "running",
        },
      },
    };
    const workbench = {
      ui: {
        projectPanelMode: "episode-workbench",
        selectedEpisodeId: "episode-new",
        storyboards: [],
        episodeStoryboardMap: {
          "episode-new": [storyboard],
        },
        videoGenerationResult: {},
        toast: "",
      },
    };

    applyEpisodeGenerationTaskResult(
      workbench,
      {
        status: "failed",
        taskId: "seedance-provider-failed-task",
        failureCode: "provider_failed",
        failure: {
          providerStatus: "failed",
          providerErrorCode: "content_policy",
          providerMessage: "First frame violates provider policy.",
        },
      },
      "storyboard-video-failed-1",
      "video",
    );

    assert.equal(workbench.ui.videoGenerationResult.status, "failed");
    assert.match(workbench.ui.toast, /First frame violates provider policy/);
  });

  it("uses backend notice type and display message for generation task failures", () => {
    const storyboard = {
      ...addStoryboard([])[0],
      id: "storyboard-video-manual-review-1",
      generationState: {
        lastSubmission: {
          status: "running",
        },
      },
    };
    const workbench = {
      ui: {
        projectPanelMode: "episode-workbench",
        selectedEpisodeId: "episode-new",
        storyboards: [],
        episodeStoryboardMap: {
          "episode-new": [storyboard],
        },
        videoGenerationResult: {},
        toast: "",
      },
    };

    applyEpisodeGenerationTaskResult(
      workbench,
      {
        status: "manual_review_required",
        taskId: "seedance-persist-failed-task",
        failureCode: "provider_output_persist_failed",
        failure: {
          failureCode: "provider_output_persist_failed",
          noticeType: "manual_review",
          displayMessage: "已保存到平台存储，正在等待后台补写资产记录",
        },
      },
      "storyboard-video-manual-review-1",
      "video",
    );

    assert.equal(workbench.ui.videoGenerationResult.status, "manual_review_required");
    assert.match(workbench.ui.toast, /需要后台处理/);
    assert.match(workbench.ui.toast, /等待后台补写资产记录/);
  });

  it("hydrates lip-sync audio items from backend task results", () => {
    const storyboard = {
      ...addStoryboard([])[0],
      id: "storyboard-lip-sync-1",
      uploadedVideos: [],
      selectedUploadedVideoId: null,
      currentVideoAssetVersionId: null,
      previewVideo: null,
      videoStatus: "empty",
      generationState: {
        lastSubmission: {
          status: "running",
        },
      },
    };
    const workbench = {
      ui: {
        projectPanelMode: "episode-workbench",
        selectedEpisodeId: "episode-new",
        storyboards: [],
        episodeStoryboardMap: {
          "episode-new": [storyboard],
        },
        videoGenerationResult: {},
        lipSyncAudioItems: [],
      },
    };

    applyEpisodeGenerationTaskResult(
      workbench,
      {
        status: "completed",
        taskId: "local-lip-sync-task",
        generatedAudioItems: [
          {
            id: "local-lip-sync-task-audio-1",
            name: "音频 1",
            voiceName: "女/稚嫩",
            audioUrl: "data:audio/wav;base64,AAAA",
          },
        ],
        result: {
          mediaKind: "video",
          videoUrl: "/uploads/storage/fixed-video.mp4",
          assetVersionId: "local-lip-sync-task",
          storageObjectId: "60000000-0000-4000-8000-000000000124",
          generatedAudioItems: [
            {
              id: "local-lip-sync-task-audio-1",
              name: "音频 1",
              voiceName: "女/稚嫩",
              audioUrl: "data:audio/wav;base64,AAAA",
            },
          ],
        },
      },
      "storyboard-lip-sync-1",
      "video",
    );

    assert.equal(workbench.ui.lipSyncAudioItems.length, 1);
    assert.equal(workbench.ui.lipSyncAudioItems[0].voiceName, "女/稚嫩");
    assert.equal(workbench.ui.videoGenerationResult.generatedAudioItems.length, 1);
    const updated = workbench.ui.episodeStoryboardMap["episode-new"][0];
    assert.equal(updated.previewVideo, null);
    assert.equal(updated.currentVideoAssetVersionId, null);
  });

  it("keeps the latest asset conversation entry in sync when an image task finishes", () => {
    const runningEntry = {
      taskId: "asset-image-character-1-running",
      status: "running",
      promptPreview: "最新发送：补强角色破损麻衣和疲惫眼神。",
      quickReferenceItems: [
        {
          id: "quick-ref:character:character-1",
          assetId: "character-1",
          kind: "character",
          name: "废土主角",
          description: "灰黑短发，破旧麻袋衣，警惕眼神。",
        },
      ],
      selectionContext: {
        assetTab: "character",
        selectedAssetId: "character-1",
        selectedAssetName: "废土主角",
      },
      fixedImages: [],
    };
    const workbench = {
      ui: {
        projectPanelMode: "episode-workbench",
        museScopeMode: "assets",
        selectedEpisodeId: "episode-new",
        selectedEpisodeAssetId: "character-1",
        selectedEpisodeCardId: "character-1",
        storyboards: [],
        episodeStoryboardMap: {},
        imageGenerationResult: runningEntry,
        assetConversationHistory: {
          "image:character-1": [runningEntry],
        },
        episodeWorkbenchConversationScrollMode: null,
      },
    };

    applyEpisodeGenerationTaskResult(
      workbench,
      {
        status: "completed",
        taskId: "asset-image-character-1-running",
        result: {
          mediaKind: "image",
          imageUrl: "https://example.com/generated-character-1.png",
          assetVersionId: "asset-version-character-1",
          storageObjectId: "storage-character-1",
        },
      },
      "",
      "image",
    );

    assert.equal(workbench.ui.imageGenerationResult?.status, "completed");
    assert.equal(workbench.ui.assetConversationHistory["image:character-1"][0]?.status, "completed");
    assert.equal(
      workbench.ui.assetConversationHistory["image:character-1"][0]?.promptPreview,
      "最新发送：补强角色破损麻衣和疲惫眼神。",
    );
    assert.equal(
      workbench.ui.assetConversationHistory["image:character-1"][0]?.fixedImages?.[0]?.url,
      "https://example.com/generated-character-1.png",
    );
    assert.equal(workbench.ui.episodeWorkbenchConversationScrollMode, "latest");
  });

  it("restores generation task results without reposting conversation messages", () => {
    const saveCalls = [];
    const workbench = {
      ui: {
        projectPanelMode: "episode-workbench",
        museScopeMode: "assets",
        selectedEpisodeId: "episode-new",
        selectedEpisodeAssetId: "character-1",
        selectedEpisodeCardId: "character-1",
        imageGenerationResult: {},
        assetConversationHistory: {},
      },
      api: {
        async saveAssetConversationMessages(...args) {
          saveCalls.push(args);
          return { entries: [] };
        },
      },
    };

    applyEpisodeGenerationTaskResult(
      workbench,
      {
        status: "failed",
        taskId: "restored-asset-image-task",
        assetId: "character-1",
        result: {
          mediaKind: "image",
        },
      },
      "",
      "image",
      { persistConversation: false },
    );

    assert.equal(saveCalls.length, 0);
    assert.equal(workbench.ui.assetConversationHistory["image:character-1"][0]?.taskId, "restored-asset-image-task");
    assert.equal(workbench.ui.imageGenerationResult?.taskId, "restored-asset-image-task");
  });

  it("loads the selected asset conversation history into the active panel", async () => {
    const calls = [];
    const persistedEntries = [
      {
        taskId: "asset-image-character-1-persisted",
        status: "completed",
        promptPreview: "读取历史：补强角色破损麻衣和疲惫眼神。",
        selectionContext: {
          assetTab: "character",
          selectedAssetId: "character-1",
          selectedAssetName: "废土主角",
        },
        fixedImages: [
          {
            id: "persisted-image-1",
            label: "角色图片",
            url: "https://example.com/persisted-character-1.png",
          },
        ],
      },
    ];
    const workbench = {
      ui: {
        projectPanelMode: "episode-workbench",
        museScopeMode: "assets",
        selectedEpisodeId: "episode-1",
        selectedEpisodeAssetId: "character-1",
        selectedEpisodeCardId: "character-1",
        imageGenerationResult: {
          taskId: "stale-local-entry",
          status: "running",
        },
        assetConversationHistory: {},
        episodeBatchResults: {},
      },
      state: {
        ...buildProjectState(),
        projectDetail: {
          project: { id: "project-1", projectId: "project-1", name: "try" },
          episodes: [
            {
              id: "episode-1",
              title: "真实剧集",
              status: "draft",
              storyboardCount: 0,
              createdAt: "2026-05-31T08:00:00.000Z",
            },
          ],
          shots: [],
        },
      },
      api: {
        async getAssetConversationHistory(episodeId, assetId, mediaMode) {
          calls.push({ episodeId, assetId, mediaMode });
          return { entries: persistedEntries };
        },
      },
    };

    await loadSelectedAssetConversationHistory(workbench);

    assert.deepEqual(calls, [{
      episodeId: "episode-1",
      assetId: "character-1",
      mediaMode: "image",
    }]);
    assert.deepEqual(workbench.ui.assetConversationHistory["image:character-1"], persistedEntries);
    assert.equal(workbench.ui.imageGenerationResult?.taskId, "asset-image-character-1-persisted");
  });

  it("reselects the active tab's first asset and reloads its history when switching asset tabs", async () => {
    const historyCalls = [];
    const workbench = {
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        museScopeMode: "assets",
        selectedEpisodeId: "episode-1",
        selectedEpisodeAssetId: "character-1",
        selectedEpisodeCardId: "character-1",
        projectAssetTab: "character",
        importedAssets: {
          character: [
            {
              id: "character-1",
              name: "废土主角",
              description: "角色描述",
              previewUrl: "https://example.com/character-1.png",
            },
          ],
          scene: [
            {
              id: "scene-1",
              name: "残破街区",
              description: "场景描述",
              previewUrl: "https://example.com/scene-1.png",
            },
          ],
          prop: [],
          other: { image: [], video: [] },
        },
        episodeWorkbenchContext: {
          assetsByType: {
            character: [
              {
                assetId: "character-1",
                name: "废土主角",
                description: "角色描述",
                fixedImageUrl: "https://example.com/character-1.png",
              },
            ],
            scene: [
              {
                assetId: "scene-1",
                name: "残破街区",
                description: "场景描述",
                fixedImageUrl: "https://example.com/scene-1.png",
              },
            ],
            prop: [],
          },
        },
        imageGenerationResult: {
          taskId: "stale-character-result",
          status: "completed",
          selectionContext: {
            assetTab: "character",
            selectedAssetId: "character-1",
          },
          fixedImages: [
            {
              id: "character-result-1",
              label: "角色图片",
              url: "https://example.com/character-result-1.png",
            },
          ],
        },
        assetConversationHistory: {
          "image:character-1": [
            {
              taskId: "character-history-1",
              status: "completed",
              selectionContext: {
                assetTab: "character",
                selectedAssetId: "character-1",
              },
              fixedImages: [
                {
                  id: "character-history-image-1",
                  label: "角色图片",
                  url: "https://example.com/character-history-image-1.png",
                },
              ],
            },
          ],
        },
      }),
      state: {
        ...buildProjectState(),
        projectDetail: {
          project: { id: "project-1", projectId: "project-1", name: "try" },
          episodes: [
            {
              id: "episode-1",
              title: "真实剧集",
              status: "draft",
              storyboardCount: 0,
              createdAt: "2026-05-31T08:00:00.000Z",
            },
          ],
          shots: [],
        },
      },
      api: {
        async getEpisodeWorkbench() {
          return {
            assetsByType: {
              character: [
                {
                  assetId: "character-1",
                  name: "废土主角",
                  description: "角色描述",
                  fixedImageUrl: "https://example.com/character-1.png",
                },
              ],
              scene: [
                {
                  assetId: "scene-1",
                  name: "残破街区",
                  description: "场景描述",
                  fixedImageUrl: "https://example.com/scene-1.png",
                },
              ],
              prop: [],
            },
          };
        },
        async getAssetConversationHistory(episodeId, assetId, mediaKind) {
          historyCalls.push({ episodeId, assetId, mediaKind });
          return {
            entries: [
              {
                taskId: "scene-history-1",
                status: "completed",
                selectionContext: {
                  assetTab: "scene",
                  selectedAssetId: "scene-1",
                },
                fixedImages: [
                  {
                    id: "scene-history-image-1",
                    label: "场景图片",
                    url: "https://example.com/scene-history-image-1.png",
                  },
                ],
              },
            ],
          };
        },
      },
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "set-project-asset-tab",
        assetTab: "scene",
      },
    });

    assert.equal(workbench.ui.projectAssetTab, "scene");
    assert.equal(workbench.ui.selectedEpisodeAssetId, "scene-1");
    assert.equal(workbench.ui.selectedEpisodeCardId, "scene-1");
    assert.deepEqual(historyCalls, [
      {
        episodeId: "episode-1",
        assetId: "scene-1",
        mediaKind: "image",
      },
    ]);
    assert.equal(workbench.ui.imageGenerationResult?.selectionContext?.selectedAssetId, "scene-1");
    assert.equal(
      workbench.ui.imageGenerationResult?.fixedImages?.[0]?.url,
      "https://example.com/scene-history-image-1.png",
    );
  });

  it("skips asset conversation persistence when the selected episode is only stale local state", async () => {
    const calls = [];
    const workbench = {
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        selectedEpisodeId: "61c18cda-81d8-439e-be69-21f924b63c97",
        customEpisodes: [
          {
            id: "episode-2",
            title: "真实剧集",
            status: "Draft",
            storyboardCount: 0,
          },
        ],
        projectAssetTab: "character",
        museScopeMode: "assets",
        selectedEpisodeCardId: "character-2",
        selectedEpisodeAssetId: "character-2",
        prompt: "",
        imageGenerationResult: null,
        episodeBatchResults: {},
        importedAssets: {
          character: [
            {
              id: "character-2",
              name: "蓬头垢面的女人",
              description: "头发凌乱，神情疲惫但强硬，裹着褪色布料。",
              previewUrl: "https://example.com/character-2.png",
            },
          ],
          scene: [],
          prop: [],
        },
        assetPromptDraft: {
          scopeMode: "assets",
          prompt: "生成一位更疲惫、衣料更破损的废土角色。",
          quickReferenceItems: [],
          mentionReferences: [],
          selectionContext: {
            assetTab: "character",
            selectedAssetId: "character-2",
            selectedAssetName: "蓬头垢面的女人",
          },
        },
      }),
      state: {
        ...buildProjectState(),
        projectDetail: {
          ...buildProjectState().projectDetail,
          episodes: [
            {
              id: "episode-2",
              title: "真实剧集",
              status: "Draft",
              storyboardCount: 0,
            },
          ],
        },
        shots: [],
      },
      api: {
        async saveAssetConversationMessages() {
          calls.push(true);
          return { entries: [] };
        },
      },
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await generateAssetImages(workbench);

    assert.equal(calls.length, 0);
    assert.equal(workbench.ui.imageGenerationResult?.status, "running");
  });

  it("persists user and system asset conversation messages when generating images", async () => {
    const calls = [];
    const workbench = {
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        selectedEpisodeId: "episode-2",
        customEpisodes: [
          {
            id: "episode-2",
            title: "真实剧集",
            status: "Draft",
            storyboardCount: 0,
          },
        ],
        projectAssetTab: "character",
        museScopeMode: "assets",
        selectedEpisodeCardId: "character-2",
        selectedEpisodeAssetId: "character-2",
        prompt: "",
        imageGenerationResult: null,
        episodeBatchResults: {},
        importedAssets: {
          character: [
            {
              id: "character-2",
              name: "蓬头垢面的女人",
              description: "头发凌乱，神情疲惫但强硬，裹着褪色布料。",
              previewUrl: "https://example.com/character-2.png",
            },
          ],
          scene: [],
          prop: [],
        },
        assetPromptDraft: {
          scopeMode: "assets",
          prompt: "生成一位更疲惫、衣料更破损的废土角色。",
          quickReferenceItems: [
            {
              id: "quick-ref:character:character-2",
              assetId: "character-2",
              kind: "character",
              name: "蓬头垢面的女人",
              description: "头发凌乱，神情疲惫但强硬，裹着褪色布料。",
              preview: "https://example.com/character-2.png",
            },
          ],
          mentionReferences: [],
          selectionContext: {
            assetTab: "character",
            selectedAssetId: "character-2",
            selectedAssetName: "蓬头垢面的女人",
          },
        },
      }),
      state: {
        ...buildProjectState(),
        projectDetail: {
          project: { id: "project-1", projectId: "project-1", name: "try" },
          episodes: [
            {
              id: "episode-2",
              title: "真实剧集",
              status: "draft",
              storyboardCount: 0,
              createdAt: "2026-05-31T08:00:00.000Z",
            },
          ],
          shots: [],
        },
        shots: [],
      },
      api: {
        async saveAssetConversationMessages(episodeId, assetId, payload) {
          calls.push({ episodeId, assetId, payload });
          return {
            entries: [
              {
                taskId: payload.messages[1]?.taskId ?? payload.messages[2]?.taskId ?? null,
                status: "running",
                promptPreview: "生成一位更疲惫、衣料更破损的废土角色。",
                quickReferenceItems: [
                  {
                    id: "quick-ref:character:character-2",
                    assetId: "character-2",
                    kind: "character",
                    name: "蓬头垢面的女人",
                    description: "头发凌乱，神情疲惫但强硬，裹着褪色布料。",
                    preview: "https://example.com/character-2.png",
                  },
                ],
                selectionContext: {
                  assetTab: "character",
                  selectedAssetId: "character-2",
                  selectedAssetName: "蓬头垢面的女人",
                },
                fixedImages: [
                  {
                    id: "persisted-image-2",
                    label: "角色图片",
                    url: "https://example.com/persisted-character-2.png",
                  },
                ],
              },
            ],
          };
        },
      },
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await generateAssetImages(workbench);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].episodeId, "episode-2");
    assert.equal(calls[0].assetId, "character-2");
    assert.equal(calls[0].payload.mediaMode, "image");
    assert.deepEqual(
      calls[0].payload.messages.map((item) => item.messageType),
      ["user_request", "task_status", "result"],
    );
    assert.equal(workbench.ui.assetConversationHistory["image:character-2"][0]?.taskId, calls[0].payload.messages[1].taskId);
    assert.equal(
      workbench.ui.assetConversationHistory["image:character-2"][0]?.fixedImages?.[0]?.url,
      "https://example.com/persisted-character-2.png",
    );
  });

  it("restores the previous asset prompt and quick references when re-editing a saved result", async () => {
    const entry = {
      taskId: "asset-image-character-restore-1",
      status: "completed",
      promptPreview: "补强角色疲惫眼神，并加重肩背磨损背包。",
      quickReferenceItems: [
        {
          id: "quick-ref:character:character-1",
          assetId: "character-1",
          kind: "character",
          name: "废土主角",
          description: "灰黑短发，破旧麻袋衣，警惕眼神。",
          preview: "https://example.com/character-1.png",
        },
      ],
      selectionContext: {
        assetTab: "character",
        selectedAssetId: "character-1",
        selectedAssetName: "废土主角",
      },
      fixedImages: [
        {
          id: "asset-image-result-restore-1",
          label: "角色图片",
          url: "https://example.com/generated-character-restore-1.png",
        },
      ],
    };
    const workbench = {
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        museScopeMode: "assets",
        selectedEpisodeId: "episode-1",
        selectedEpisodeAssetId: "character-1",
        selectedEpisodeCardId: "character-1",
        projectAssetTab: "character",
        prompt: "",
        assetPromptDraft: {
          scopeMode: "assets",
          prompt: "",
          quickReferenceItems: [],
          mentionReferences: [],
          selectionContext: {
            assetTab: "character",
            selectedAssetId: "character-1",
            selectedAssetName: "废土主角",
          },
        },
        importedAssets: {
          character: [
            {
              id: "character-1",
              name: "废土主角",
              description: "灰黑短发，破旧麻袋衣，警惕眼神。",
              previewUrl: "https://example.com/character-1.png",
            },
          ],
          scene: [],
          prop: [],
        },
        imageGenerationResult: entry,
        assetConversationHistory: {
          "image:character-1": [entry],
        },
      }),
      state: {
        ...buildProjectState(),
        projectDetail: {
          project: { id: "project-1", projectId: "project-1", name: "try" },
          episodes: [
            {
              id: "episode-1",
              title: "真实剧集",
              status: "draft",
              storyboardCount: 0,
              createdAt: "2026-05-31T08:00:00.000Z",
            },
          ],
          shots: [],
        },
      },
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "episode-fixed-result-action",
        resultAction: "edit",
        taskId: "asset-image-character-restore-1",
      },
    });

    assert.equal(workbench.ui.prompt, "补强角色疲惫眼神，并加重肩背磨损背包。");
    assert.equal(workbench.ui.assetPromptDraft?.prompt, "补强角色疲惫眼神，并加重肩背磨损背包。");
    assert.deepEqual(workbench.ui.assetPromptDraft?.quickReferenceItems, [
      {
        ...entry.quickReferenceItems[0],
        preview: "https://example.com/character-1.png",
      },
    ]);
    assert.match(workbench.root.innerHTML, /<img src="https:\/\/example\.com\/character-1\.png"/);
    const quickReferenceCard = workbench.root.innerHTML.match(
      /<article class="episode-replica-ref-card quick-reference"[\s\S]*?<\/article>/,
    )?.[0] ?? "";
    assert.doesNotMatch(quickReferenceCard, /<strong>/);
    assert.doesNotMatch(quickReferenceCard, /<small>/);
    assert.equal(workbench.ui.isStoryboardDescriptionModalOpen, false);
  });

  it("keeps fixed-result actions clickable while a new generation is still busy", async () => {
    const entry = {
      taskId: "asset-image-character-busy-1",
      status: "completed",
      promptPreview: "继续沿用上一版角色设定，并补强风尘感。",
      quickReferenceItems: [],
      selectionContext: {
        assetTab: "character",
        selectedAssetId: "character-1",
        selectedAssetName: "废土主角",
      },
      fixedImages: [
        {
          id: "asset-image-result-busy-1",
          label: "角色图片",
          url: "https://example.com/generated-character-busy-1.png",
        },
      ],
    };
    const workbench = {
      ui: buildProjectUi({
        busy: true,
        projectPanelMode: "episode-workbench",
        museScopeMode: "assets",
        selectedEpisodeId: "episode-1",
        selectedEpisodeAssetId: "character-1",
        selectedEpisodeCardId: "character-1",
        projectAssetTab: "character",
        prompt: "",
        assetPromptDraft: {
          scopeMode: "assets",
          prompt: "",
          quickReferenceItems: [],
          mentionReferences: [],
          selectionContext: {
            assetTab: "character",
            selectedAssetId: "character-1",
            selectedAssetName: "废土主角",
          },
        },
        imageGenerationResult: entry,
        assetConversationHistory: {
          "image:character-1": [entry],
        },
      }),
      state: {
        ...buildProjectState(),
        projectDetail: {
          project: { id: "project-1", projectId: "project-1", name: "try" },
          episodes: [
            {
              id: "episode-1",
              title: "真实剧集",
              status: "draft",
              storyboardCount: 0,
              createdAt: "2026-05-31T08:00:00.000Z",
            },
          ],
          shots: [],
        },
      },
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "episode-fixed-result-action",
        resultAction: "edit",
        taskId: "asset-image-character-busy-1",
      },
    });

    assert.equal(workbench.ui.assetPromptDraft?.prompt, "继续沿用上一版角色设定，并补强风尘感。");
  });

  it("uses real episode image tasks for asset-scope generation so fixed images can be persisted", async () => {
    const calls = [];
    const workbench = {
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        museScopeMode: "assets",
        selectedEpisodeId: "10000000-0000-4000-8000-000000000001",
        selectedEpisodeAssetId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
        selectedEpisodeCardId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
        projectAssetTab: "character",
        selectedModelId: "gpt-image-2-cn",
        episodeGenerationConfig: {
          defaultImageModelCode: "gpt-image-2-cn",
          models: [
            {
              modelCode: "gpt-image-2-cn",
              modelLabel: "GPT Image 2",
              mediaType: "image",
              supportedModes: ["single-image", "multi-image"],
            },
          ],
        },
        prompt: "废土主角固定图",
        importedAssets: {
          character: [
            {
              id: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
              assetId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
              name: "废土主角",
              description: "角色描述",
              previewUrl: "",
            },
          ],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
      }),
      state: {
        ...buildProjectState(),
        projectDetail: {
          project: { id: "project-1", projectId: "project-1", name: "try" },
          episodes: [
            {
              id: "10000000-0000-4000-8000-000000000001",
              title: "真实剧集",
              status: "draft",
              storyboardCount: 0,
              createdAt: "2026-05-31T08:00:00.000Z",
            },
          ],
          assetsByType: {
            character: [],
            scene: [],
            prop: [],
            other: { image: [], video: [] },
          },
          shots: [],
        },
      },
      api: {
        async createImageTask(episodeId, payload) {
          calls.push({ episodeId, payload });
          return {
            taskId: "asset-image-task-1",
            status: "succeeded",
            workflowStatus: "succeeded",
            result: {
              imageUrl: "https://example.com/generated-character.png",
              assetVersionId: "10000000-0000-4000-8000-000000000111",
              storageObjectId: "10000000-0000-4000-8000-000000000123",
            },
          };
        },
      },
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await generateAssetImages(workbench);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].episodeId, "10000000-0000-4000-8000-000000000001");
    assert.equal(calls[0].payload.targetType, "asset");
    assert.equal(calls[0].payload.targetId, "a71c2367-d9fd-42ec-a2df-78b30c72f753");
    assert.equal(calls[0].payload.assetId, "a71c2367-d9fd-42ec-a2df-78b30c72f753");
    assert.equal(calls[0].payload.assetType, "character");
    assert.equal(calls[0].payload.model, "gpt-image-2-cn");
    assert.equal(workbench.ui.imageGenerationResult.selectedModelId, "gpt-image-2-cn");
    assert.equal(workbench.ui.imageGenerationResult.fixedImages[0]?.assetVersionId, "10000000-0000-4000-8000-000000000111");
    assert.equal(workbench.ui.imageGenerationResult.fixedImages[0]?.storageObjectId, "10000000-0000-4000-8000-000000000123");
  });

  it("polls the selected asset queued image task every 30 seconds until it finishes", async () => {
    const calls = [];
    const pollCalls = [];
    const timers = [];
    const previousWindow = globalThis.window;
    globalThis.window = {
      setTimeout(callback, delayMs) {
        timers.push({ callback, delayMs });
        return `timer-${timers.length}`;
      },
      clearTimeout() {},
    };
    try {
      const workbench = {
        ui: buildProjectUi({
          projectPanelMode: "episode-workbench",
          museScopeMode: "assets",
          selectedEpisodeId: "10000000-0000-4000-8000-000000000001",
          selectedEpisodeAssetId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
          selectedEpisodeCardId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
          projectAssetTab: "character",
          selectedModelId: "gpt-image-2-cn",
          episodeGenerationConfig: {
            defaultImageModelCode: "gpt-image-2-cn",
            models: [
              {
                modelCode: "gpt-image-2-cn",
                modelLabel: "GPT Image 2",
                mediaType: "image",
                supportedModes: ["single-image", "multi-image"],
              },
            ],
          },
          prompt: "废土主角固定图",
          importedAssets: {
            character: [
              {
                id: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
                assetId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
                name: "废土主角",
                description: "角色描述",
                previewUrl: "",
              },
            ],
            scene: [],
            prop: [],
            other: { image: [], video: [] },
          },
        }),
        state: {
          ...buildProjectState(),
          projectDetail: {
            project: { id: "project-1", projectId: "project-1", name: "try" },
            episodes: [
              {
                id: "10000000-0000-4000-8000-000000000001",
                title: "真实剧集",
                status: "draft",
                storyboardCount: 0,
                createdAt: "2026-05-31T08:00:00.000Z",
              },
            ],
            assetsByType: {
              character: [],
              scene: [],
              prop: [],
              other: { image: [], video: [] },
            },
            shots: [],
          },
          shots: [],
        },
        api: {
          async createImageTask(episodeId, payload) {
            calls.push({ episodeId, payload });
            return {
              taskId: "asset-image-task-queued",
              status: "queued",
              workflowStatus: "queued",
              result: {},
            };
          },
          async getGenerationTask(taskId) {
            pollCalls.push(taskId);
            return {
              taskId,
              status: "succeeded",
              workflowStatus: "succeeded",
              assetId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
              result: {
                imageUrl: "https://example.com/generated-polled-character.png",
                assetVersionId: "10000000-0000-4000-8000-000000000221",
                storageObjectId: "10000000-0000-4000-8000-000000000222",
              },
            };
          },
        },
        root: {
          innerHTML: "",
          querySelector() {
            return null;
          },
        },
      };

      await generateAssetImages(workbench);

      assert.equal(calls.length, 1);
      assert.equal(timers.length, 1);
      assert.equal(timers[0].delayMs, 30000);
      assert.equal(workbench.ui.imageGenerationResult.status, "queued");

      await timers[0].callback();

      assert.deepEqual(pollCalls, ["asset-image-task-queued"]);
      assert.equal(workbench.ui.imageGenerationResult.status, "completed");
      assert.equal(
        workbench.ui.assetConversationHistory["image:a71c2367-d9fd-42ec-a2df-78b30c72f753"][0]?.fixedImages?.[0]?.url,
        "https://example.com/generated-polled-character.png",
      );
    } finally {
      globalThis.window = previousWindow;
    }
  });

  it("does not fall back to a fixed placeholder image when real asset image generation API is unavailable", async () => {
    const workbench = {
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        museScopeMode: "assets",
        selectedEpisodeId: "10000000-0000-4000-8000-000000000001",
        selectedEpisodeAssetId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
        selectedEpisodeCardId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
        projectAssetTab: "character",
        selectedModelId: "gpt-image-2-cn",
        episodeGenerationConfig: {
          defaultImageModelCode: "gpt-image-2-cn",
          models: [
            {
              modelCode: "gpt-image-2-cn",
              modelLabel: "GPT Image 2",
              mediaType: "image",
              supportedModes: ["single-image", "multi-image"],
            },
          ],
        },
        prompt: "废土主角固定图",
        importedAssets: {
          character: [
            {
              id: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
              assetId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
              name: "废土主角",
              description: "角色描述",
              previewUrl: "",
            },
          ],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
      }),
      state: {
        ...buildProjectState(),
        projectDetail: {
          project: { id: "project-1", projectId: "project-1", name: "try" },
          episodes: [
            {
              id: "10000000-0000-4000-8000-000000000001",
              title: "真实剧集",
              status: "draft",
              storyboardCount: 0,
              createdAt: "2026-05-31T08:00:00.000Z",
            },
          ],
          assetsByType: {
            character: [],
            scene: [],
            prop: [],
            other: { image: [], video: [] },
          },
          shots: [],
        },
      },
      api: {},
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await assert.rejects(
      () => generateAssetImages(workbench),
      /episode_image_generation_api_missing/,
    );
    assert.equal(workbench.ui.imageGenerationResult ?? null, null);
    assert.equal(workbench.ui.episodeBatchResults?.["a71c2367-d9fd-42ec-a2df-78b30c72f753"], undefined);
  });

  it("sets an episode asset fixed image with the generated assetVersionId and syncs persisted asset state", async () => {
    const calls = [];
    const generatedEntry = {
      taskId: "asset-image-character-set-fixed-1",
      status: "completed",
      promptPreview: "把角色主视觉改成正面半身像。",
      quickReferenceItems: [],
      selectionContext: {
        assetTab: "character",
        selectedAssetId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
        selectedAssetName: "废土主角",
      },
      fixedImages: [
        {
          id: "not-an-asset-version-id",
          assetVersionId: "10000000-0000-4000-8000-000000000111",
          label: "角色图片",
          url: "https://example.com/generated-character-set-fixed-1.png",
          storageObjectId: "10000000-0000-4000-8000-000000000123",
        },
      ],
    };
    const episodeAssetRecord = {
      assetId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
      name: "废土主角",
      description: "当前剧集真实角色",
      fixedImageUrl: "https://example.com/original-character.png",
      fixedImageFileId: null,
      fixedImageStorageObjectId: null,
      previewUrl: "https://example.com/original-character.png",
      sourceUrl: "https://example.com/original-character.png",
      downloadUrl: "https://example.com/original-character.png",
      updatedAt: "2026-05-31T08:00:00.000Z",
    };
    const workbench = {
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        museScopeMode: "assets",
        selectedEpisodeId: "10000000-0000-4000-8000-000000000001",
        selectedEpisodeAssetId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
        selectedEpisodeCardId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
        projectAssetTab: "character",
        importedAssets: {
          character: [
            {
              id: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
              assetId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
              name: "废土主角",
              description: "当前剧集真实角色",
              preview: "https://example.com/original-character.png",
              previewUrl: "https://example.com/original-character.png",
              sourceUrl: "https://example.com/original-character.png",
              latestVersion: {
                id: "latest-version-before-fix",
                storageObjectId: "storage-before-fix",
                previewUrl: "https://example.com/original-character.png",
                metadata: {
                  description: "当前剧集真实角色",
                },
              },
            },
          ],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
        imageGenerationResult: generatedEntry,
        assetConversationHistory: {
          "image:a71c2367-d9fd-42ec-a2df-78b30c72f753": [generatedEntry],
        },
        episodeWorkbenchContext: {
          assetsByType: {
            character: [structuredClone(episodeAssetRecord)],
            scene: [],
            prop: [],
          },
        },
      }),
      state: {
        ...buildProjectState(),
        projectDetail: {
          project: { id: "project-1", projectId: "project-1", name: "try" },
          episodes: [
            {
              id: "10000000-0000-4000-8000-000000000001",
              title: "真实剧集",
              status: "draft",
              storyboardCount: 0,
              createdAt: "2026-05-31T08:00:00.000Z",
            },
          ],
          assetsByType: {
            character: [
              {
                id: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
                label: "废土主角",
                previewUrl: "https://example.com/original-character.png",
                latestVersion: {
                  id: "project-detail-version-before-fix",
                  previewUrl: "https://example.com/original-character.png",
                  metadata: {
                    description: "当前剧集真实角色",
                    previewUrl: "https://example.com/original-character.png",
                    sourceUrl: "https://example.com/original-character.png",
                  },
                },
              },
            ],
            scene: [],
            prop: [],
            other: { image: [], video: [] },
          },
          shots: [],
        },
      },
      api: {
        async setFixedImage(episodeId, assetId, payload) {
          calls.push({ episodeId, assetId, payload });
          return {
            asset: {
              assetId,
              episodeId,
              fixedImageFileId: "10000000-0000-4000-8000-000000000111",
              fixedImageStorageObjectId: "10000000-0000-4000-8000-000000000999",
              fixedImageUrl: "https://example.com/fixed-character-saved.png",
              updatedAt: "2026-06-01T09:10:11.000Z",
            },
            file: {
              previewUrl: "https://example.com/fixed-character-saved.png",
              sourceUrl: "https://example.com/fixed-character-source.png",
              downloadUrl: "https://example.com/fixed-character-download.png",
              storageObjectId: "10000000-0000-4000-8000-000000000999",
            },
          };
        },
      },
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "episode-fixed-result-action",
        resultAction: "set-character",
        taskId: "asset-image-character-set-fixed-1",
      },
    });

    assert.deepEqual(calls, [
      {
        episodeId: "10000000-0000-4000-8000-000000000001",
        assetId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
        payload: {
          assetVersionId: "10000000-0000-4000-8000-000000000111",
          storageObjectId: "10000000-0000-4000-8000-000000000123",
          sourceUrl: "https://example.com/generated-character-set-fixed-1.png",
          previewUrl: "https://example.com/generated-character-set-fixed-1.png",
        },
      },
    ]);
    assert.equal(
      workbench.ui.importedAssets.character[0]?.previewUrl,
      "https://example.com/fixed-character-saved.png",
    );
    assert.equal(
      workbench.ui.importedAssets.character[0]?.latestVersion?.storageObjectId,
      "10000000-0000-4000-8000-000000000999",
    );
    assert.equal(
      workbench.ui.episodeWorkbenchContext.assetsByType.character[0]?.fixedImageUrl,
      "https://example.com/fixed-character-saved.png",
    );
    assert.equal(
      workbench.state.projectDetail.assetsByType.character[0]?.previewUrl,
      "https://example.com/fixed-character-saved.png",
    );
    assert.equal(
      workbench.state.projectDetail.assetsByType.character[0]?.latestVersion?.metadata?.sourceUrl,
      "https://example.com/fixed-character-source.png",
    );
    assert.equal(workbench.ui.toast, "已设为角色固定图。");
  });

  it("keeps the selected generated image when persisted fixed-image urls are mock placeholders", async () => {
    const generatedEntry = {
      taskId: "asset-image-character-set-fixed-mock-1",
      status: "completed",
      promptPreview: "把角色主视觉改成正面半身像。",
      quickReferenceItems: [],
      selectionContext: {
        assetTab: "character",
        selectedAssetId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
        selectedAssetName: "废土主角",
      },
      fixedImages: [
        {
          id: "not-an-asset-version-id",
          assetVersionId: "10000000-0000-4000-8000-000000000111",
          label: "角色图片",
          url: "https://example.com/generated-character-real.png",
          storageObjectId: "10000000-0000-4000-8000-000000000123",
        },
      ],
    };
    const workbench = {
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        museScopeMode: "assets",
        selectedEpisodeId: "10000000-0000-4000-8000-000000000001",
        selectedEpisodeAssetId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
        selectedEpisodeCardId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
        projectAssetTab: "character",
        importedAssets: {
          character: [
            {
              id: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
              assetId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
              name: "废土主角",
              description: "当前剧集真实角色",
              preview: "https://example.com/original-character.png",
              previewUrl: "https://example.com/original-character.png",
              sourceUrl: "https://example.com/original-character.png",
              latestVersion: {
                id: "latest-version-before-fix",
                storageObjectId: "storage-before-fix",
                previewUrl: "https://example.com/original-character.png",
                metadata: {
                  description: "当前剧集真实角色",
                },
              },
            },
          ],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
        imageGenerationResult: generatedEntry,
        assetConversationHistory: {
          "image:a71c2367-d9fd-42ec-a2df-78b30c72f753": [generatedEntry],
        },
        episodeWorkbenchContext: {
          assetsByType: {
            character: [
              {
                assetId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
                name: "废土主角",
                description: "当前剧集真实角色",
                fixedImageUrl: "https://example.com/original-character.png",
                fixedImageFileId: null,
                fixedImageStorageObjectId: null,
                previewUrl: "https://example.com/original-character.png",
                sourceUrl: "https://example.com/original-character.png",
                downloadUrl: "https://example.com/original-character.png",
                updatedAt: "2026-05-31T08:00:00.000Z",
              },
            ],
            scene: [],
            prop: [],
          },
        },
      }),
      state: {
        ...buildProjectState(),
        projectDetail: {
          project: { id: "project-1", projectId: "project-1", name: "try" },
          episodes: [],
          assetsByType: {
            character: [
              {
                id: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
                label: "废土主角",
                previewUrl: "https://example.com/original-character.png",
                latestVersion: {
                  id: "project-detail-version-before-fix",
                  previewUrl: "https://example.com/original-character.png",
                  metadata: {
                    description: "当前剧集真实角色",
                    previewUrl: "https://example.com/original-character.png",
                    sourceUrl: "https://example.com/original-character.png",
                  },
                },
              },
            ],
            scene: [],
            prop: [],
            other: { image: [], video: [] },
          },
          shots: [],
        },
      },
      api: {
        async setFixedImage() {
          return {
            asset: {
              assetId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
              episodeId: "10000000-0000-4000-8000-000000000001",
              fixedImageFileId: "10000000-0000-4000-8000-000000000111",
              fixedImageStorageObjectId: "10000000-0000-4000-8000-000000000999",
              fixedImageUrl: "https://example.com/mock-image-asset-image-character-set-fixed-mock-1.avif",
              updatedAt: "2026-06-01T09:10:11.000Z",
            },
            file: {
              previewUrl: "https://example.com/mock-image-asset-image-character-set-fixed-mock-1.avif",
              sourceUrl: "https://example.com/mock-image-asset-image-character-set-fixed-mock-1.avif",
              downloadUrl: "https://example.com/mock-image-asset-image-character-set-fixed-mock-1.avif",
              storageObjectId: "10000000-0000-4000-8000-000000000999",
            },
          };
        },
      },
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "episode-fixed-result-action",
        resultAction: "set-character",
        taskId: "asset-image-character-set-fixed-mock-1",
      },
    });

    assert.equal(
      workbench.ui.importedAssets.character[0]?.previewUrl,
      "https://example.com/generated-character-real.png",
    );
    assert.equal(
      workbench.ui.episodeWorkbenchContext.assetsByType.character[0]?.fixedImageUrl,
      "https://example.com/generated-character-real.png",
    );
    assert.equal(
      workbench.state.projectDetail.assetsByType.character[0]?.previewUrl,
      "https://example.com/generated-character-real.png",
    );
    assert.equal(workbench.ui.toast, "已设为角色固定图。");
  });

  it("sets the visible generated image as the selected scene fixed image", async () => {
    const calls = [];
    const generatedEntry = {
      taskId: "asset-image-scene-set-fixed-visible-1",
      status: "completed",
      promptPreview: "把场景主视觉改成雨夜街角。",
      quickReferenceItems: [],
      selectionContext: {
        assetTab: "scene",
        selectedAssetId: "21d97b4d-1e71-426c-86f8-8eceb8a14adf",
        selectedAssetName: "雨夜街角",
      },
      fixedImages: [
        {
          id: "not-an-asset-version-id",
          assetVersionId: "10000000-0000-4000-8000-000000000222",
          label: "场景图片",
          url: "https://example.com/mock-image-asset-image-scene-set-fixed-visible-1.avif",
          storageObjectId: "10000000-0000-4000-8000-000000000333",
        },
      ],
    };
    const sceneAsset = {
      assetId: "21d97b4d-1e71-426c-86f8-8eceb8a14adf",
      name: "雨夜街角",
      description: "这是刚添加的场景选项",
      fixedImageUrl: "https://example.com/original-scene.png",
      fixedImageFileId: null,
      fixedImageStorageObjectId: null,
      previewUrl: "https://example.com/original-scene.png",
      sourceUrl: "https://example.com/original-scene.png",
      downloadUrl: "https://example.com/original-scene.png",
      updatedAt: "2026-05-31T08:00:00.000Z",
    };
    const visibleGeneratedUrl = "https://example.com/generated-scene-visible.png";
    const fakeResultContainer = {
      querySelector(selector) {
        if (selector === ".episode-replica-fixed-image-card img" || selector === "img") {
          return {
            currentSrc: visibleGeneratedUrl,
            getAttribute(name) {
              return name === "src" ? visibleGeneratedUrl : null;
            },
          };
        }
        return null;
      },
    };
    const workbench = {
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        museScopeMode: "assets",
        selectedEpisodeId: "10000000-0000-4000-8000-000000000001",
        selectedEpisodeAssetId: "",
        selectedEpisodeCardId: "",
        projectAssetTab: "character",
        importedAssets: {
          character: [],
          scene: [
            {
              id: "21d97b4d-1e71-426c-86f8-8eceb8a14adf",
              assetId: "21d97b4d-1e71-426c-86f8-8eceb8a14adf",
              name: "雨夜街角",
              description: "这是刚添加的场景选项",
              preview: "https://example.com/original-scene.png",
              previewUrl: "https://example.com/original-scene.png",
              sourceUrl: "https://example.com/original-scene.png",
            },
          ],
          prop: [],
          other: { image: [], video: [] },
        },
        imageGenerationResult: generatedEntry,
        assetConversationHistory: {
          "image:21d97b4d-1e71-426c-86f8-8eceb8a14adf": [generatedEntry],
        },
        episodeWorkbenchContext: {
          assetsByType: {
            character: [],
            scene: [structuredClone(sceneAsset)],
            prop: [],
          },
        },
      }),
      state: {
        ...buildProjectState(),
        projectDetail: {
          project: { id: "project-1", projectId: "project-1", name: "try" },
          episodes: [],
          assetsByType: {
            character: [],
            scene: [
              {
                id: "21d97b4d-1e71-426c-86f8-8eceb8a14adf",
                label: "雨夜街角",
                previewUrl: "https://example.com/original-scene.png",
                latestVersion: {
                  id: "project-detail-scene-before-fix",
                  previewUrl: "https://example.com/original-scene.png",
                  metadata: {
                    description: "这是刚添加的场景选项",
                  },
                },
              },
            ],
            prop: [],
            other: { image: [], video: [] },
          },
          shots: [],
        },
      },
      api: {
        async setFixedImage(episodeId, assetId, payload) {
          calls.push({ episodeId, assetId, payload });
          return {
            asset: {
              assetId,
              episodeId,
              fixedImageFileId: "10000000-0000-4000-8000-000000000222",
              fixedImageStorageObjectId: "10000000-0000-4000-8000-000000000333",
              fixedImageUrl: "https://example.com/mock-image-asset-image-scene-set-fixed-visible-1.avif",
              updatedAt: "2026-06-01T09:10:11.000Z",
            },
            file: {
              previewUrl: "https://example.com/mock-image-asset-image-scene-set-fixed-visible-1.avif",
              sourceUrl: "https://example.com/mock-image-asset-image-scene-set-fixed-visible-1.avif",
              downloadUrl: "https://example.com/mock-image-asset-image-scene-set-fixed-visible-1.avif",
              storageObjectId: "10000000-0000-4000-8000-000000000333",
            },
          };
        },
      },
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "episode-fixed-result-action",
        resultAction: "set-character",
        taskId: "asset-image-scene-set-fixed-visible-1",
        assetKind: "scene",
      },
      closest(selector) {
        return selector === ".episode-replica-asset-conversation-entry" ? fakeResultContainer : null;
      },
    });

    assert.deepEqual(calls, [
      {
        episodeId: "10000000-0000-4000-8000-000000000001",
        assetId: "21d97b4d-1e71-426c-86f8-8eceb8a14adf",
        payload: {
          assetVersionId: "10000000-0000-4000-8000-000000000222",
          storageObjectId: "10000000-0000-4000-8000-000000000333",
          sourceUrl: visibleGeneratedUrl,
          previewUrl: visibleGeneratedUrl,
        },
      },
    ]);
    assert.equal(workbench.ui.projectAssetTab, "scene");
    assert.equal(workbench.ui.importedAssets.scene[0]?.previewUrl, visibleGeneratedUrl);
    assert.equal(workbench.ui.episodeWorkbenchContext.assetsByType.scene[0]?.fixedImageUrl, visibleGeneratedUrl);
    assert.equal(workbench.state.projectDetail.assetsByType.scene[0]?.previewUrl, visibleGeneratedUrl);
    assert.equal(workbench.ui.toast, "已设为场景固定图。");
  });

  it("deletes only the selected asset conversation result through the backend route", async () => {
    const calls = [];
    const remainingEntry = {
      taskId: "asset-image-character-2",
      status: "completed",
      promptPreview: "保留的第二条记录。",
      quickReferenceItems: [],
      selectionContext: {
        assetTab: "character",
        selectedAssetId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
        selectedAssetName: "废土主角",
      },
      fixedImages: [
        {
          id: "10000000-0000-4000-8000-000000000222",
          label: "角色图片",
          url: "https://example.com/generated-character-2.png",
          storageObjectId: "10000000-0000-4000-8000-000000000333",
        },
      ],
    };
    const deletedEntry = {
      taskId: "asset-image-character-1",
      status: "completed",
      promptPreview: "要删除的第一条记录。",
      quickReferenceItems: [],
      selectionContext: {
        assetTab: "character",
        selectedAssetId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
        selectedAssetName: "废土主角",
      },
      fixedImages: [
        {
          id: "10000000-0000-4000-8000-000000000111",
          label: "角色图片",
          url: "https://example.com/generated-character-1.png",
          storageObjectId: "10000000-0000-4000-8000-000000000123",
        },
      ],
    };
    const workbench = {
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        museScopeMode: "assets",
        selectedEpisodeId: "10000000-0000-4000-8000-000000000001",
        selectedEpisodeAssetId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
        selectedEpisodeCardId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
        projectAssetTab: "character",
        imageGenerationResult: deletedEntry,
        episodeBatchResults: {
          "a71c2367-d9fd-42ec-a2df-78b30c72f753": deletedEntry,
        },
        assetConversationHistory: {
          "image:a71c2367-d9fd-42ec-a2df-78b30c72f753": [deletedEntry, remainingEntry],
        },
      }),
      state: {
        ...buildProjectState(),
        projectDetail: {
          project: { id: "project-1", projectId: "project-1", name: "try" },
          episodes: [
            {
              id: "10000000-0000-4000-8000-000000000001",
              title: "真实剧集",
              status: "draft",
              storyboardCount: 0,
              createdAt: "2026-05-31T08:00:00.000Z",
            },
          ],
          shots: [],
        },
      },
      api: {
        async deleteFileResource(episodeId, fileId, payload) {
          calls.push({ type: "file", episodeId, fileId, payload });
          return { deleted: true };
        },
        async deleteAssetConversationTurn(episodeId, assetId, taskId, mediaMode) {
          calls.push({ type: "conversation", episodeId, assetId, taskId, mediaMode });
          return { deleted: true, entries: [remainingEntry] };
        },
      },
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
      session: { user: { phone: "+86 13800138000" } },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "episode-fixed-result-action",
        resultAction: "delete",
        taskId: "asset-image-character-1",
      },
    });

    assert.deepEqual(calls, [
      {
        type: "file",
        episodeId: "10000000-0000-4000-8000-000000000001",
        fileId: "10000000-0000-4000-8000-000000000123",
        payload: {
          assetVersionId: "10000000-0000-4000-8000-000000000111",
          storageObjectId: "10000000-0000-4000-8000-000000000123",
        },
      },
      {
        type: "conversation",
        episodeId: "10000000-0000-4000-8000-000000000001",
        assetId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
        taskId: "asset-image-character-1",
        mediaMode: "image",
      },
    ]);
    assert.deepEqual(
      workbench.ui.assetConversationHistory["image:a71c2367-d9fd-42ec-a2df-78b30c72f753"],
      [remainingEntry],
    );
    assert.equal(workbench.ui.imageGenerationResult?.taskId, "asset-image-character-2");
  });

  it("rebinds stale episode workbench selections to persisted project detail episodes", () => {
    const workbench = {
      state: {
        ...buildProjectState(),
        projectDetail: {
          project: { id: "project-1", projectId: "project-1", name: "try" },
          episodes: [
            {
              id: "10000000-0000-4000-8000-000000000001",
              title: "真实剧集",
              status: "draft",
              storyboardCount: 1,
            },
          ],
          shots: [],
        },
      },
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        selectedEpisodeId: "61c18cda-81d8-439e-be69-21f924b63c97",
        selectedEpisodeAssetId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
        selectedEpisodeCardId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
        importedAssets: {
          character: [
            {
              id: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
              name: "旧缓存角色",
              description: "已经不属于当前后端剧集",
              preview: "",
            },
          ],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
      }),
    };

    applyProjectDetail(workbench, {
      project: {
        id: "project-1",
        projectId: "project-1",
        name: "try",
      },
      episodes: [
        {
          id: "episode-2",
          title: "真实剧集",
          sequence: 1,
          status: "draft",
          storyboardCount: 0,
          createdAt: "2026-05-31T08:00:00.000Z",
        },
      ],
      assetsByType: {
        character: [
          {
            id: "episode-2-character-1",
            label: "后端真实角色",
            latestVersion: {
              metadata: {
                description: "当前项目真实角色",
              },
            },
          },
        ],
        scene: [],
        prop: [],
      },
      shots: [],
    });

    assert.equal(workbench.ui.selectedEpisodeId, "episode-2");
    assert.equal(workbench.ui.selectedEpisodeAssetId, null);
    assert.equal(workbench.ui.selectedEpisodeCardId, null);
    assert.equal(workbench.ui.importedAssets.character[0]?.id, "episode-2-character-1");
  });

  it("rewrites stale persisted episode selections in local storage to a real episode id", () => {
    const writes = [];
    const previousWindow = globalThis.window;
    globalThis.window = {
      localStorage: {
        setItem(key, value) {
          writes.push({ key, value: JSON.parse(value) });
        },
      },
    };
    try {
      const workbench = {
        state: {
          ...buildProjectState(),
          project: { id: "project-1" },
          projectDetail: {
            project: { id: "project-1", projectId: "project-1", name: "try" },
            episodes: [
              {
                id: "episode-2",
                title: "真实剧集",
                sequence: 1,
                status: "draft",
                storyboardCount: 0,
                createdAt: "2026-05-31T08:00:00.000Z",
              },
            ],
            shots: [],
          },
        },
        ui: buildProjectUi({
          projectPanelMode: "episode-workbench",
          selectedEpisodeId: "61c18cda-81d8-439e-be69-21f924b63c97",
          selectedEpisodeAssetId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
          selectedEpisodeCardId: "a71c2367-d9fd-42ec-a2df-78b30c72f753",
          selectedEpisodeAssetIds: ["a71c2367-d9fd-42ec-a2df-78b30c72f753"],
        }),
      };

      const changed = sanitizeEpisodeWorkbenchSelection(workbench, { persist: true });

      assert.equal(changed, true);
      assert.equal(workbench.ui.selectedEpisodeId, "episode-2");
      assert.equal(workbench.ui.selectedEpisodeAssetId, null);
      assert.equal(workbench.ui.selectedEpisodeCardId, null);
      assert.deepEqual(workbench.ui.selectedEpisodeAssetIds, []);
      assert.equal(writes.length, 1);
      assert.equal(writes[0].value.selectedEpisodeId, "episode-2");
    } finally {
      globalThis.window = previousWindow;
    }
  });

  it("rehydrates episode assets on init when episode workbench is restored from persisted state", async () => {
    const workbenchCalls = [];
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const root = {
      innerHTML: "",
      addEventListener() {},
      querySelector() {
        return null;
      },
    };
    globalThis.window = {
      location: {
        protocol: "http:",
        host: "127.0.0.1:4173",
        port: "4173",
        origin: "http://127.0.0.1:4173",
        hash: "#episode-workbench",
        pathname: "/app.html",
      },
      localStorage: {
        getItem() {
          return JSON.stringify({
            selectedEpisodeId: "episode-2",
            projectPanelMode: "episode-workbench",
            projectInteriorSection: "episodes",
            museScopeMode: "assets",
            projectAssetTab: "character",
          });
        },
        setItem() {},
      },
    };
    globalThis.document = {
      addEventListener() {},
      removeEventListener() {},
      body: {
        appendChild() {},
      },
      createElement() {
        return {
          click() {},
          remove() {},
        };
      },
    };

    try {
      await initProductionWorkbench({
        root,
        session: { user: { phone: "+86 13800138000" } },
        onLogout() {},
        api: {
          async getCreatorState() {
            return {
              ...buildProjectState(),
              project: { id: "project-1", name: "try", phase: "asset_review", aspectRatio: "9:16" },
              shots: [],
            };
          },
          async getProjectDetailV2() {
            return {
              project: { id: "project-1", projectId: "project-1", name: "try" },
              episodes: [
                {
                  id: "episode-2",
                  title: "真实剧集",
                  status: "draft",
                  storyboardCount: 0,
                  createdAt: "2026-05-31T08:00:00.000Z",
                },
              ],
              assetsByType: {
                character: [],
                scene: [],
                prop: [],
                other: { image: [], video: [] },
              },
              shots: [],
            };
          },
          async getProjectMembers() {
            return { members: [] };
          },
          async getProjectStats() {
            return { stats: null };
          },
          async getProjects() {
            return { projects: [{ id: "project-1", name: "try", createdAt: "2026-05-31T08:00:00.000Z" }] };
          },
          async getAssetLibrary() {
            return { assets: [] };
          },
          async getExportHistory() {
            return { records: [] };
          },
          async getEpisodeWorkbench(episodeId) {
            workbenchCalls.push(episodeId);
            return {
              assetsByType: {
                character: [
                  {
                    assetId: "episode-character-1",
                    name: "剧集角色固定图",
                    description: "固定图应在刷新后回显",
                    fixedImageUrl: "/uploads/fixed-character-refresh.png",
                  },
                ],
                scene: [],
                prop: [],
              },
            };
          },
          async listGenerationConfig() {
            return { uploadLimits: undefined };
          },
          async listStoryboards() {
            return { items: [] };
          },
        },
      });

      assert.deepEqual(workbenchCalls, ["episode-2"]);
      assert.match(root.innerHTML, /剧集角色固定图/);
      assert.match(root.innerHTML, /http:\/\/127\.0\.0\.1:4310\/uploads\/fixed-character-refresh\.png/);
    } finally {
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
    }
  });

  it("renders generation subpanels for first-last-frame and reference modes", () => {
    const state = {
      ...buildProjectState(),
      shots: [],
    };
    const storyboards = [
      {
        ...addStoryboard([])[0],
        generationState: {
          firstFrame: {
            name: "frame-start.png",
            kind: "image",
            status: "ready",
            summary: "已关联当前分镜图",
            url: "/uploads/storyboard-images/frame-start.png",
          },
          lastFrame: {
            name: "frame-end.png",
            kind: "image",
            status: "ready",
            summary: "已添加到当前模式",
            url: "/uploads/storyboard-images/frame-end.png",
          },
          imageReference: null,
          editSourceVideo: {
            name: "edit-source.mp4",
            kind: "video",
            status: "ready",
            summary: "已上传待编辑视频",
            url: "/uploads/storyboard-videos/edit-source.mp4",
          },
          referenceUploads: [
            {
              id: "ref-image-1",
              name: "reference-a.png",
              kind: "image",
              url: "/uploads/references/reference-a.png",
            },
            {
              id: "ref-video-1",
              name: "reference-b.mp4",
              kind: "video",
              url: "/uploads/references/reference-b.mp4",
            },
          ],
          localReferenceRoles: ["character", "scene"],
        },
      },
    ];

    const firstLastHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          episodeMediaMode: "video",
          museScopeMode: "storyboard",
          videoGenerationMode: "first-last-frame",
          selectedEpisodeId: "episode-new",
          storyboards,
          selectedStoryboard: storyboards[0],
          episodeStoryboardMap: {
            "episode-new": storyboards,
          },
        }),
      },
    });

    assert.match(firstLastHtml, /episode-replica-layout/);
    assert.match(firstLastHtml, /frame-start\.png/);
    assert.match(firstLastHtml, /frame-end\.png/);
    assert.match(firstLastHtml, /data-attachment-id="first-frame"/);
    assert.match(firstLastHtml, /data-attachment-id="last-frame"/);

    const referenceHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          episodeMediaMode: "video",
          museScopeMode: "storyboard",
          videoGenerationMode: "reference-video",
          selectedEpisodeId: "episode-new",
          storyboards,
          selectedStoryboard: storyboards[0],
          episodeStoryboardMap: {
            "episode-new": storyboards,
          },
        }),
      },
    });

    assert.match(referenceHtml, /episode-replica-layout/);
    assert.match(referenceHtml, /reference-a\.png/);
    assert.match(referenceHtml, /reference-b\.mp4/);
    assert.match(referenceHtml, /episode-replica-ref-card attachment/);
    assert.match(referenceHtml, /<img src="\/uploads\/references\/reference-a\.png"/);
    assert.match(referenceHtml, /<video src="\/uploads\/references\/reference-b\.mp4"/);

    const editHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          episodeMediaMode: "video",
          museScopeMode: "storyboard",
          videoGenerationMode: "edit-video",
          selectedEpisodeId: "episode-new",
          storyboards,
          selectedStoryboard: storyboards[0],
          episodeStoryboardMap: {
            "episode-new": storyboards,
          },
        }),
      },
    });

    assert.match(editHtml, /episode-replica-layout/);
    assert.match(editHtml, /edit-source\.mp4/);
    assert.match(editHtml, /data-attachment-id="edit-source-video"/);
  });

  it("removes storyboard generation references from the composer strip", async () => {
    const state = buildProjectState();
    const storyboards = [
      {
        ...addStoryboard([])[0],
        id: "storyboard-reference-delete",
        generationState: {
          referenceUploads: [
            {
              id: "ref-image-delete",
              name: "reference-delete.png",
              kind: "image",
              url: "/uploads/references/reference-delete.png",
            },
          ],
        },
      },
    ];
    const workbench = {
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        projectInteriorSection: "episodes",
        episodeMediaMode: "video",
        museScopeMode: "storyboard",
        videoGenerationMode: "reference-video",
        selectedEpisodeId: "episode-new",
        selectedStoryboardId: "storyboard-reference-delete",
        storyboards,
        selectedStoryboard: storyboards[0],
        episodeStoryboardMap: {
          "episode-new": storyboards,
        },
        episodeWorkbenchAttachments: [],
        episodeWorkbenchSelectedAttachmentIds: ["ref-image-delete"],
      }),
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "remove-episode-workbench-attachment",
        attachmentId: "ref-image-delete",
      },
    });

    assert.deepEqual(
      workbench.ui.episodeStoryboardMap["episode-new"][0].generationState.referenceUploads,
      [],
    );
    assert.deepEqual(workbench.ui.episodeWorkbenchSelectedAttachmentIds, []);
    assert.doesNotMatch(workbench.root.innerHTML, /reference-delete\.png/);
  });

  it("does not render quick-referenced video images twice in the composer strip", () => {
    const storyboard = {
      ...addStoryboard([])[0],
      id: "storyboard-quick-ref-dedupe",
      generationState: {
        quickReferenceItems: [
          {
            id: "quick-ref-1",
            kind: "image",
            type: "image",
            name: "分镜 1 图片",
            preview: "/uploads/quick-ref-1.png",
            url: "/uploads/quick-ref-1.png",
            description: "分镜文案 A",
          },
          {
            id: "quick-ref-2",
            kind: "image",
            type: "image",
            name: "分镜 2 图片",
            preview: "/uploads/quick-ref-2.png",
            url: "/uploads/quick-ref-2.png",
            description: "分镜文案 B",
          },
          {
            id: "quick-ref-3",
            kind: "image",
            type: "image",
            name: "分镜 3 图片",
            preview: "/uploads/quick-ref-3.png",
            url: "/uploads/quick-ref-3.png",
            description: "分镜文案 C",
          },
        ],
        firstFrame: {
          id: "quick-ref-1",
          kind: "image",
          type: "image",
          name: "分镜 1 图片",
          preview: "/uploads/quick-ref-1.png",
          url: "/uploads/quick-ref-1.png",
          fromQuickReference: true,
        },
        imageReference: {
          id: "quick-ref-1",
          kind: "image",
          type: "image",
          name: "分镜 1 图片",
          preview: "/uploads/quick-ref-1.png",
          url: "/uploads/quick-ref-1.png",
          fromQuickReference: true,
        },
        referenceUploads: [
          {
            id: "quick-ref-2",
            kind: "image",
            type: "image",
            name: "分镜 2 图片",
            preview: "/uploads/quick-ref-2.png",
            url: "/uploads/quick-ref-2.png",
            fromQuickReference: true,
          },
          {
            id: "quick-ref-3",
            kind: "image",
            type: "image",
            name: "分镜 3 图片",
            preview: "/uploads/quick-ref-3.png",
            url: "/uploads/quick-ref-3.png",
            fromQuickReference: true,
          },
        ],
      },
    };

    const html = renderProductionWorkbench({
      state: buildProjectState(),
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          episodeMediaMode: "video",
          museScopeMode: "storyboard",
          selectedEpisodeId: "episode-new",
          selectedStoryboardId: "storyboard-quick-ref-dedupe",
          storyboards: [storyboard],
          selectedStoryboard: storyboard,
          episodeStoryboardMap: {
            "episode-new": [storyboard],
          },
        }),
      },
    });

    const strip = html.match(/<div class="episode-replica-ref-strip">([\s\S]*?)<\/div>/)?.[1] ?? "";
    assert.equal((strip.match(/episode-replica-ref-card quick-reference/g) ?? []).length, 3);
    assert.equal((strip.match(/episode-replica-ref-card attachment/g) ?? []).length, 0);
    assert.equal((strip.match(/\/uploads\/quick-ref-1\.png/g) ?? []).length, 1);
    assert.equal((strip.match(/\/uploads\/quick-ref-2\.png/g) ?? []).length, 1);
    assert.equal((strip.match(/\/uploads\/quick-ref-3\.png/g) ?? []).length, 1);
  });

  it("renders image result actions with set-storyboard-image and timeout failure copy", () => {
    const state = {
      ...buildProjectState(),
      shots: [],
    };
    const storyboards = [
      {
        ...addStoryboard([])[0],
        linkedShotId: "shot-timeout-1",
        currentImageAssetVersionId: "image-version-1",
        uploadedImages: [
          {
            id: "image-version-1",
            src: "/uploads/storyboard-images/frame-timeout.png",
            status: "ready",
          },
        ],
        generationState: {
          lastSubmission: {
            promptPreview: "废土长街上的定格追逐",
            createdAt: "2026-05-29 18:10:00",
            status: "failed",
          },
        },
      },
    ];
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          episodeMediaMode: "image",
          museScopeMode: "storyboard",
          selectedEpisodeId: "episode-new",
          storyboards,
          selectedStoryboard: storyboards[0],
          episodeStoryboardMap: {
            "episode-new": storyboards,
          },
          imageGenerationResult: {
            status: "failed",
            failureCode: "client_poll_timeout",
            taskId: "task-timeout-1",
            promptPreview: "废土长街上的定格追逐",
            selectedModelId: "jimeng-4-5",
            aspectRatio: "16:9",
            resolution: "2K",
            fixedImages: [
              {
                id: "image-version-1",
                label: "分镜图片",
                url: "/uploads/storyboard-images/frame-timeout.png",
              },
            ],
          },
        }),
      },
    });

    assert.match(html, /data-result-action="set-storyboard-image"/);
    assert.match(html, /任务超过 15 分钟未完成/);
    assert.match(html, /episode-replica-task-status failed/);
  });

  it("renders storyboard generation progress and compact status badges", () => {
    const state = {
      ...buildProjectState(),
      shots: [],
    };
    const storyboards = [
      {
        ...addStoryboard([])[0],
        id: "storyboard-progress-1",
        linkedShotId: "shot-progress-1",
        generationState: {
          lastSubmission: {
            taskId: "seedance-video-running-task",
            promptPreview: "角色穿过雨夜街道",
            createdAt: "2026-05-29 18:20:00",
            status: "provider_submitted",
          },
        },
      },
    ];
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          episodeMediaMode: "video",
          museScopeMode: "storyboard",
          selectedEpisodeId: "episode-new",
          storyboards,
          selectedStoryboard: storyboards[0],
          episodeStoryboardMap: {
            "episode-new": storyboards,
          },
          videoGenerationResult: {
            status: "provider_submitted",
            taskId: "seedance-video-running-task",
            mediaKind: "video",
            promptPreview: "角色穿过雨夜街道",
            selectedModelId: "seedance-i2v-pro",
          },
        }),
      },
    });

    assert.match(html, /episode-replica-shot-status-badge generating/);
    assert.match(html, />模型生成中</);
    assert.match(html, /episode-replica-progress-track/);
    assert.match(html, />已提交</);
    assert.match(html, /模型正在生成/);
    assert.match(html, /episode-replica-progress-step[^"]*active/);
  });

  it("renders backend failure reasons inside generation progress", () => {
    const state = {
      ...buildProjectState(),
      shots: [],
    };
    const storyboards = [
      {
        ...addStoryboard([])[0],
        id: "storyboard-progress-failed-1",
        linkedShotId: "shot-progress-failed-1",
        generationState: {
          lastSubmission: {
            taskId: "seedance-video-upload-failed-task",
            promptPreview: "角色穿过雨夜街道",
            createdAt: "2026-05-29 18:25:00",
            status: "failed",
          },
        },
      },
    ];
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          episodeMediaMode: "video",
          museScopeMode: "storyboard",
          selectedEpisodeId: "episode-new",
          storyboards,
          selectedStoryboard: storyboards[0],
          episodeStoryboardMap: {
            "episode-new": storyboards,
          },
          videoGenerationResult: {
            status: "failed",
            taskId: "seedance-video-upload-failed-task",
            mediaKind: "video",
            failureCode: "provider_output_upload_failed",
            failure: {
              displayMessage: "视频已生成，但保存到平台存储失败，积分已返还。",
            },
          },
        }),
      },
    });

    assert.match(html, /episode-replica-shot-status-badge failed/);
    assert.match(html, /保存到云存储/);
    assert.match(html, /视频已生成，但保存到平台存储失败，积分已返还。/);
    assert.match(html, /episode-replica-progress-step[^"]*active[^"]*failed/);
  });

  it("writes generated image prompt into the selected storyboard description when setting it as storyboard image", async () => {
    const storyboardId = "storyboard-image-prompt-sync";
    const episodeId = "episode-new";
    const imageId = "image-version-prompt-sync";
    const storyboards = addStoryboard([]).map((storyboard) => ({
      ...storyboard,
      id: storyboardId,
      episodeId,
      description: "旧分镜剧情",
      currentImageAssetVersionId: imageId,
      previewImageUrl: "/uploads/storyboard-images/old-frame.png",
      uploadedImages: [
        {
          id: imageId,
          src: "/uploads/storyboard-images/generated-frame.png",
          status: "ready",
        },
      ],
    }));
    const workbench = {
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        selectedEpisodeId: episodeId,
        museScopeMode: "storyboard",
        episodeMediaMode: "image",
        selectedStoryboardId: storyboardId,
        storyboards,
        selectedStoryboard: storyboards[0],
        episodeStoryboardMap: {
          [episodeId]: storyboards,
        },
        storyboardConversationHistory: {
          [`image:${storyboardId}`]: [
            {
              storyboardId,
              mediaKind: "image",
              taskId: "storyboard-image-task-set",
              promptPreview: "把这一条设成分镜图片。",
            },
          ],
        },
        imageGenerationResult: {
          storyboardId,
          mediaKind: "image",
          taskId: "storyboard-image-task-set",
          promptPreview: "把这一条设成分镜图片。",
        },
      }),
      state: buildProjectState(),
      api: {},
      root: {
        innerHTML: "",
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "episode-result-action",
        resultAction: "set-storyboard-image",
        mediaKind: "image",
        taskId: "storyboard-image-task-set",
      },
    });

    assert.equal(workbench.ui.episodeStoryboardMap[episodeId][0].description, "把这一条设成分镜图片。");
    assert.equal(workbench.ui.episodeStoryboardMap[episodeId][0].previewImageUrl, "/uploads/storyboard-images/generated-frame.png");
  });

  it("does not render episode upload limits in the prompt panel", () => {
    const state = {
      ...buildProjectState(),
      shots: [],
    };
    const storyboards = addStoryboard([]);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          episodeMediaMode: "video",
          museScopeMode: "storyboard",
          selectedEpisodeId: "episode-new",
          storyboards,
          selectedStoryboard: storyboards[0],
          episodeStoryboardMap: {
            "episode-new": storyboards,
          },
          episodeGenerationConfig: {
            uploadLimits: {
              image: {
                maxBytes: 20 * 1024 * 1024,
                maxReferencesPerTask: 30,
              },
              video: {
                maxBytes: 500 * 1024 * 1024,
              },
              audio: {
                maxBytes: 100 * 1024 * 1024,
              },
            },
          },
        }),
      },
    });

    assert.doesNotMatch(html, /episode-replica-upload-limits/);
    assert.doesNotMatch(html, /图片 20MB/);
    assert.doesNotMatch(html, /视频 500MB/);
    assert.doesNotMatch(html, /音频 100MB/);
    assert.doesNotMatch(html, /最多 30 张参考图/);
  });

  it("renders export preview fallback copy when original-video link is not ready yet", () => {
    const html = renderProductionWorkbench({
      state: {
        ...buildProjectState(),
        shots: [],
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          episodeMediaMode: "video",
          museScopeMode: "storyboard",
          selectedEpisodeId: "episode-new",
          storyboards: [],
          selectedStoryboard: null,
          episodeStoryboardMap: {
            "episode-new": [],
          },
          exportPreviewResult: {
            exportRecord: { workflowId: "export-workflow-1" },
            export: {
              workflowId: "export-workflow-1",
              missingAssets: [],
            },
          },
        }),
      },
    });

    assert.match(html, /导出预览/);
    assert.match(html, /原视频导出链接暂未生成，请稍后刷新重试/);
  });

  it("renders export preview when episode storyboard has a ready selected video without relying on uuid-like ids", () => {
    const html = renderProductionWorkbench({
      state: {
        ...buildProjectState(),
        shots: [],
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          episodeMediaMode: "video",
          museScopeMode: "storyboard",
          selectedEpisodeId: "episode-new",
          storyboards: [],
          selectedStoryboard: null,
          episodeStoryboardMap: {
            "episode-new": [
              {
                ...addStoryboard([])[0],
                id: "storyboard-export-1",
                uploadedVideos: [
                  {
                    id: "local-fixed-image-task",
                    src: "/uploads/storage/fixed-video.mp4",
                    status: "ready",
                    storageObjectId: "60000000-0000-4000-8000-000000000099",
                  },
                ],
                selectedUploadedVideoId: "local-fixed-image-task",
                currentVideoAssetVersionId: "local-fixed-image-task",
                previewVideo: "/uploads/storage/fixed-video.mp4",
                videoStatus: "ready",
              },
            ],
          },
          exportPreviewResult: {
            exportRecord: { workflowId: "export-workflow-2" },
            export: {
              workflowId: "export-workflow-2",
              signedUrl: "https://example.com/fixed-video-export.zip",
              missingAssets: [],
            },
          },
        }),
      },
    });

    assert.match(html, /episode-export-preview/);
    assert.match(html, /下载导出包/);
    assert.ok(html.includes("https://example.com/fixed-video-export.zip"));
  });

  it("renders sidebar media previews in the episode workbench shell", () => {
    const state = {
      ...buildProjectState(),
      shots: [],
    };
    const storyboards = [
      {
        ...addStoryboard([])[0],
        previewImageUrl: "/uploads/storyboard-images/shot-1.png",
        uploadedVideos: [
          {
            id: "video-1",
            src: "/uploads/storyboard-videos/video-1.mp4",
            durationLabel: "00:06",
            status: "ready",
            thumbnailSrc: "data:image/jpeg;base64,video-thumb-1",
          },
        ],
        selectedUploadedVideoId: "video-1",
        videoStatus: "ready",
        previewVideo: "/uploads/storyboard-videos/video-1.mp4",
        previewUrl: "/uploads/storyboard-videos/video-1.mp4",
        previewThumbnailUrl: "data:image/jpeg;base64,video-thumb-1",
      },
    ];
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          episodeMediaMode: "video",
          museScopeMode: "storyboard",
          selectedEpisodeId: "episode-new",
          storyboards,
          selectedStoryboard: storyboards[0],
          customEpisodes: [
            {
              id: "episode-new",
              title: "Episode Draft",
              status: "Draft",
              createdAt: "2026/05/22",
              createdAtMs: Date.parse("2026-05-22T08:00:00.000Z"),
              storyboardCount: 1,
            },
          ],
          episodeStoryboardMap: {
            "episode-new": storyboards,
          },
        }),
      },
    });

    assert.match(html, /episode-replica-layout/);
    assert.match(html, /episode-replica-shot-media-thumb has-video-preview active/);
    assert.match(
      html,
      /<img src="data:image\/jpeg;base64,video-thumb-1" alt="" \/><i>▶<\/i>/,
    );
  });

  it("renders the storyboard empty state with zero-count pagination and a clean prompt panel", () => {
    const html = renderProductionWorkbench({
      state: {
        ...buildProjectState(),
        shots: [],
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          episodeMediaMode: "image",
          museScopeMode: "storyboard",
          selectedEpisodeId: "episode-empty",
          storyboards: [],
          selectedStoryboard: null,
          selectedStoryboardId: null,
          episodeStoryboardMap: {
            "episode-empty": [],
          },
          prompt: "",
        }),
      },
    });

    assert.match(html, /episode-replica-storyboard-empty cinematic/);
    assert.match(html, /aria-label="当前剧集还没有分镜"/);
    assert.match(html, /共 0 条/);
    assert.match(html, /10条\/页/);
    assert.match(html, /分镜：/);
    assert.match(html, /请输入您的生图要求/);
    assert.match(html, /0 \/ 5000/);
    assert.match(html, /data-action="toggle-storyboard-select-all" disabled/);
    assert.match(html, /data-action="open-episode-batch-actions" disabled/);
  });

  it("renders the batch image modal with Muse-like grouped controls instead of a placeholder shell", () => {
    const html = renderProductionWorkbench({
      state: {
        ...buildProjectState(),
        shots: [],
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          episodeMediaMode: "image",
          museScopeMode: "storyboard",
          selectedEpisodeId: "episode-new",
          storyboards: [],
          selectedStoryboard: null,
          episodeStoryboardMap: {
            "episode-new": [],
          },
          episodeBatchModal: {
            show: true,
            mode: "image",
            totalCredits: 90,
            configRows: [
              { label: "图片模型", value: "nano banana 2（链路G）" },
              { label: "角色预设", value: "[系统]角色-三视图" },
            ],
            items: [
              { id: "asset-1", name: "废土主角", kind: "character" },
            ],
          },
        }),
      },
    });

    assert.match(html, /批量生图/);
    assert.match(html, /图片模型/);
    assert.match(html, /公共画风/);
    assert.match(html, /定制画风/);
    assert.match(html, /其他配置/);
    assert.match(html, /角色预设/);
    assert.match(html, /场景/);
    assert.match(html, /大小/);
    assert.match(html, /nano banana 2（链路G）/);
    assert.match(html, /生成1张图 \| 90 积分/);
    assert.match(html, /data-action="submit-episode-batch-modal"/);
  });

  it("renders storyboard batch video controls and selected state in storyboard mode", () => {
    const storyboards = [
      {
        ...addStoryboard([])[0],
        id: "storyboard-1",
        title: "1",
        displayTitle: "2026-05-30 11:34:30",
        references: [
          { role: "character", assetId: "character-1", name: "白野", kind: "character", preview: "/uploads/character-1.png" },
          { role: "scene", assetId: "scene-1", name: "残破街区", kind: "scene", preview: "/uploads/scene-1.png" },
        ],
      },
      {
        ...addStoryboard([])[0],
        id: "storyboard-2",
        index: 2,
        title: "2",
        displayTitle: "2026-05-30 11:36:30",
        references: [
          { role: "prop", assetId: "prop-1", name: "旧式通讯器", kind: "prop", preview: "/uploads/prop-1.png" },
        ],
      },
    ];

    const html = renderProductionWorkbench({
      state: {
        ...buildProjectState(),
        shots: [],
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          episodeMediaMode: "video",
          museScopeMode: "storyboard",
          selectedEpisodeId: "episode-new",
          storyboards,
          selectedStoryboard: storyboards[0],
          selectedStoryboardId: "storyboard-1",
          episodeStoryboardMap: {
            "episode-new": storyboards,
          },
          selectedStoryboardIds: ["storyboard-1", "storyboard-2"],
          episodeBatchModal: {
            show: true,
            scope: "storyboard",
            mode: "video",
            totalCredits: 5600,
            configRows: [
              { label: "视频模型", value: "Vidu Q3 Pro" },
              { label: "时长", value: "10秒" },
            ],
            items: [
              { id: "storyboard-1", name: "2026-05-30 11:34:30", kind: "storyboard" },
              { id: "storyboard-2", name: "2026-05-30 11:36:30", kind: "storyboard" },
            ],
          },
        }),
      },
    });

    assert.match(html, /data-action="toggle-storyboard-select-all"/);
    assert.match(html, /data-action="toggle-storyboard-selection"/);
    assert.match(html, /批量生成选中的 2 条分镜视频/);
    assert.match(html, /生成 2 条视频 \| 5600 积分/);
    assert.match(html, /白野/);
    assert.match(html, /残破街区/);
    assert.match(html, /旧式通讯器/);
  });

  it("renders asset-scope generated results for the selected batch asset", () => {
    const html = renderProductionWorkbench({
      state: {
        ...buildProjectState(),
        shots: [],
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          selectedEpisodeId: "episode-new",
          projectAssetTab: "scene",
          museScopeMode: "assets",
          selectedEpisodeCardId: "scene-1",
          selectedEpisodeAssetId: "scene-1",
          importedAssets: {
            character: [],
            scene: [
              {
                id: "scene-1",
                name: "残破街区",
                description: "断墙残楼、空气混浊，远处残存冷色灯牌。",
                previewUrl: "https://example.com/scene.png",
              },
            ],
            prop: [],
          },
          imageGenerationResult: {
            taskId: "batch-image-scene-1",
            status: "completed",
            promptPreview: "断墙残楼、空气混浊，远处残存冷色灯牌。",
            selectedModelId: "tnb-pro",
            aspectRatio: "16:9",
            resolution: "2K",
            creditCost: 90,
            createdAt: "2026-05-30 10:00:00",
            selectionContext: {
              assetTab: "scene",
              selectedAssetId: "scene-1",
              selectedAssetName: "残破街区",
            },
            fixedImages: [
              {
                id: "scene-image-1",
                label: "场景图片",
                url: "https://example.com/scene.png",
              },
            ],
          },
        }),
      },
    });

    assert.match(html, /任务ID：batch-image-scene-1/);
    assert.match(html, /class="episode-replica-generated-stage visible asset-scope"/);
    assert.match(html, /class="episode-replica-user-message-meta">任务ID：batch-image-scene-1/);
    assert.doesNotMatch(html, /class="episode-replica-system-message"/);
    assert.doesNotMatch(html, /class="episode-replica-task-id"/);
    assert.doesNotMatch(html, /class="episode-replica-stage-actions asset-scope"/);
    assert.doesNotMatch(html, /class="episode-replica-task-refs asset-inline"/);
    assert.match(html, /data-result-action="set-character"[^>]*>设为场景图</);
  });

  it("renders the tools tab as a real rules and diagnostics panel instead of an empty placeholder", () => {
    const html = renderProductionWorkbench({
      state: {
        project: {
          id: "project-1",
          name: "Comic AI Studio",
          phase: "asset_review",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "tools",
        creditBalance: 720,
        episodeGenerationConfig: {
          defaultImageModelCode: "nano_banana_2",
          defaultVideoModelCode: "video_mock_1",
          uploadLimits: {
            image: {
              maxBytes: 20 * 1024 * 1024,
              maxReferencesPerTask: 30,
              extensions: [".jpg", ".jpeg", ".png", ".webp", ".avif"],
            },
            video: {
              maxBytes: 500 * 1024 * 1024,
              recommendedMaxDurationSeconds: 15 * 60,
              extensions: [".mp4", ".webm", ".mov"],
            },
            audio: {
              maxBytes: 100 * 1024 * 1024,
              extensions: [".mp3", ".wav", ".m4a"],
            },
            blockedExtensions: [".exe", ".zip", ".ps1"],
          },
        },
        storyboards: [
          {
            id: "storyboard-1",
            title: "分镜 1",
            selectedVideoStatus: "ready",
          },
        ],
        exportHistory: [
          {
            status: "succeeded",
            statusLabel: "导出成功",
            format: "original_video",
            formatLabel: "原视频",
            createdAt: "2026-05-29 21:00",
            createdAtLabel: "2026-05-29 21:00",
          },
        ],
      },
    });

    assert.match(html, /工具箱总览/);
    assert.match(html, /15 秒/);
    assert.match(html, /15 分钟/);
    assert.match(html, /直传云存储前的本地校验/);
    assert.match(html, /单任务最多 30 张参考图/);
    assert.match(html, /\.exe/);
    assert.match(html, /创建任务先预扣积分；成功后结转消耗；失败、超时或修复判定失败时返还预留积分/);
    assert.match(html, /图片默认模型：nano_banana_2/);
    assert.match(html, /视频默认模型：video_mock_1/);
    assert.match(html, /导出直接导出原视频，不做额外画质限制/);
    assert.doesNotMatch(html, /这里预留给批量任务、提示词模板、镜头校验和导出诊断/);
  });

  it("renders generation queue health and failed job controls in the tools tab", () => {
    const html = renderProductionWorkbench({
      state: {
        project: {
          id: "project-1",
          name: "Comic AI Studio",
          phase: "asset_review",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "tools",
        creditBalance: 720,
        generationQueueHealth: {
          status: "degraded",
          redis: { status: "healthy" },
          queuePrefix: "comic-ai-prod",
          queues: [
            {
              role: "submit_video",
              name: "generation-submit-video",
              status: "healthy",
              counts: {
                waiting: 12,
                delayed: 3,
                active: 4,
                completed: 120,
                failed: 1,
                paused: 0,
              },
              failedJobs: [
                {
                  id: "generation.video.submit:task-1",
                  name: "generation.video.submit",
                  failureReason: "provider timeout",
                  attemptsMade: 3,
                },
              ],
            },
          ],
        },
      },
    });

    assert.match(html, /BullMQ 队列/);
    assert.match(html, /comic-ai-prod/);
    assert.match(html, /generation-submit-video/);
    assert.match(html, /等待 12/);
    assert.match(html, /延迟 3/);
    assert.match(html, /执行 4/);
    assert.match(html, /失败 1/);
    assert.match(html, /provider timeout/);
    assert.match(html, /data-action="operate-generation-queue-job"/);
    assert.match(html, /data-queue-name="generation-submit-video"/);
    assert.match(html, /data-job-id="generation\.video\.submit:task-1"/);
    assert.match(html, /data-job-action="retry"/);
    assert.match(html, /data-job-action="remove"/);
  });

  it("renders staged retry buttons for matching generation finalize failures", () => {
    const html = renderProductionWorkbench({
      state: {
        project: {
          id: "project-1",
          name: "Comic AI Studio",
          phase: "asset_review",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "tools",
        creditBalance: 720,
        generationQueueHealth: {
          status: "degraded",
          redis: { status: "healthy" },
          queuePrefix: "comic-ai-prod",
          queues: [
            {
              role: "finalize_artifact",
              name: "generation-finalize-artifact",
              status: "healthy",
              counts: { waiting: 0, delayed: 0, active: 0, completed: 0, failed: 1, paused: 0 },
              failedJobs: [
                {
                  id: "generation.video.finalize:task-1",
                  name: "generation.video.finalize",
                  data: {
                    taskId: "task-1",
                    failureCode: "provider_output_persist_failed",
                  },
                  failureReason: "provider_output_persist_failed",
                  attemptsMade: 3,
                },
              ],
            },
          ],
        },
      },
    });

    assert.match(html, /data-action="operate-generation-staged-retry"/);
    assert.match(html, /data-task-id="task-1"/);
    assert.match(html, /data-staged-action="retry_persist_asset"/);
    assert.doesNotMatch(html, /data-staged-action="retry_finalize"/);
  });

  it("renders a generation queue refresh entry before the first health snapshot loads", () => {
    const html = renderProductionWorkbench({
      state: {
        project: {
          id: "project-1",
          name: "Comic AI Studio",
          phase: "asset_review",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "tools",
        creditBalance: 720,
        generationQueueHealth: null,
      },
    });

    assert.match(html, /BullMQ 队列/);
    assert.match(html, /生成队列健康/);
    assert.match(html, /尚未加载队列状态/);
    assert.match(html, /data-action="refresh-generation-queues"/);
  });

  it("refreshes generation queue health from the tools tab", async () => {
    const snapshot = {
      status: "healthy",
      redis: { status: "healthy" },
      queuePrefix: "comic-ai-prod",
      queues: [
        {
          role: "submit_video",
          name: "generation-submit-video",
          status: "healthy",
          counts: { waiting: 2, delayed: 0, active: 1, completed: 12, failed: 0, paused: 0 },
          failedJobs: [],
        },
      ],
    };
    let refreshCalls = 0;
    const workbench = {
      state: buildProjectState(),
      api: {
        async getGenerationQueueHealth() {
          refreshCalls += 1;
          return snapshot;
        },
      },
      ui: buildProjectUi({
        activeNavTab: "tools",
        generationQueueHealth: null,
      }),
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "refresh-generation-queues",
      },
    });

    assert.equal(refreshCalls, 1);
    assert.deepEqual(workbench.ui.generationQueueHealth, snapshot);
    assert.equal(workbench.ui.toast, "队列状态已刷新。");
  });

  it("operates a failed generation queue job and refreshes queue health", async () => {
    const calls = [];
    const refreshedSnapshot = {
      status: "healthy",
      redis: { status: "healthy" },
      queuePrefix: "comic-ai-prod",
      queues: [],
    };
    const workbench = {
      state: buildProjectState(),
      api: {
        async operateGenerationQueueJob(input) {
          calls.push(input);
          return { operation: { action: input.action } };
        },
        async getGenerationQueueHealth() {
          return refreshedSnapshot;
        },
      },
      ui: buildProjectUi({
        activeNavTab: "tools",
        generationQueueHealth: {
          status: "degraded",
          redis: { status: "healthy" },
          queuePrefix: "comic-ai-prod",
          queues: [],
        },
      }),
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "operate-generation-queue-job",
        queueName: "generation-submit-video",
        jobId: "generation.video.submit:task-1",
        jobAction: "retry",
      },
    });

    assert.deepEqual(calls, [
      {
        queueName: "generation-submit-video",
        jobId: "generation.video.submit:task-1",
        action: "retry",
        reason: "从工具箱执行 BullMQ job retry",
      },
    ]);
    assert.deepEqual(workbench.ui.generationQueueHealth, refreshedSnapshot);
    assert.equal(workbench.ui.toast, "队列任务已提交操作。");
  });

  it("submits staged persist retry and refreshes queue health", async () => {
    const calls = [];
    const refreshedSnapshot = {
      status: "healthy",
      redis: { status: "healthy" },
      queuePrefix: "comic-ai-prod",
      queues: [],
    };
    const workbench = {
      state: buildProjectState(),
      api: {
        async retryGenerationPersistAsset(input) {
          calls.push(input);
          return { task: { id: input.taskId } };
        },
        async getGenerationQueueHealth() {
          return refreshedSnapshot;
        },
      },
      ui: buildProjectUi({
        activeNavTab: "tools",
        generationQueueHealth: null,
      }),
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "operate-generation-staged-retry",
        taskId: "task-1",
        stagedAction: "retry_persist_asset",
      },
    });

    assert.deepEqual(calls, [
      {
        taskId: "task-1",
        reason: "从工具箱补写已上传产物的资产记录",
      },
    ]);
    assert.deepEqual(workbench.ui.generationQueueHealth, refreshedSnapshot);
    assert.equal(workbench.ui.toast, "产物保存阶段重试已提交。");
  });

  it("requires confirmation before removing a generation queue job", async () => {
    const calls = [];
    const refreshedSnapshot = {
      status: "healthy",
      redis: { status: "healthy" },
      queuePrefix: "comic-ai-prod",
      queues: [],
    };
    const workbench = {
      state: buildProjectState(),
      api: {
        async operateGenerationQueueJob(input) {
          calls.push(input);
          return { operation: { action: input.action } };
        },
        async getGenerationQueueHealth() {
          return refreshedSnapshot;
        },
      },
      ui: buildProjectUi({
        activeNavTab: "tools",
        generationQueueHealth: {
          status: "degraded",
          redis: { status: "healthy" },
          queuePrefix: "comic-ai-prod",
          queues: [],
        },
        generationQueueJobOperationConfirm: null,
      }),
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "operate-generation-queue-job",
        queueName: "generation-submit-video",
        jobId: "generation.video.submit:task-1",
        jobAction: "remove",
      },
    });

    assert.deepEqual(calls, []);
    assert.deepEqual(workbench.ui.generationQueueJobOperationConfirm, {
      queueName: "generation-submit-video",
      jobId: "generation.video.submit:task-1",
      jobAction: "remove",
    });

    const html = renderProductionWorkbench({
      state: workbench.state,
      session: { user: { phone: "+86 13800138000" } },
      ui: workbench.ui,
    });
    assert.match(html, /确认移除队列任务/);
    assert.match(html, /generation\.video\.submit:task-1/);
    assert.match(html, /data-action="confirm-generation-queue-job-operation"/);

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "confirm-generation-queue-job-operation",
      },
    });

    assert.deepEqual(calls, [
      {
        queueName: "generation-submit-video",
        jobId: "generation.video.submit:task-1",
        action: "remove",
        reason: "从工具箱执行 BullMQ job remove",
      },
    ]);
    assert.equal(workbench.ui.generationQueueJobOperationConfirm, null);
    assert.deepEqual(workbench.ui.generationQueueHealth, refreshedSnapshot);
    assert.equal(workbench.ui.toast, "队列任务已提交操作。");
  });

  it("renders episode asset quick actions and delete confirmation modal in asset mode", () => {
    const state = buildProjectState();
    const storyboards = addStoryboard([]);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          museScopeMode: "assets",
          selectedEpisodeId: "episode-new",
          storyboards,
          selectedStoryboard: storyboards[0],
          importedAssets: {
            character: [
              {
                id: "episode-character-1",
                name: "剧集角色",
                preview: "/uploads/episode-character.png",
                description: "工作台刚加载到的角色",
                kind: "character",
              },
            ],
            scene: [],
            prop: [],
            other: { image: [], video: [] },
          },
          customEpisodes: [
            {
              id: "episode-new",
              title: "Episode Draft",
              status: "Draft",
              createdAt: "2026/05/22",
              createdAtMs: Date.parse("2026-05-22T08:00:00.000Z"),
              storyboardCount: 1,
            },
          ],
          episodeStoryboardMap: {
            "episode-new": storyboards,
          },
          assetInspector: {
            episodeDeleteAssetTarget: {
              assetId: "episode-character-1",
              assetKind: "character",
              assetName: "剧集角色",
            },
          },
        }),
      },
    });

    assert.match(html, /data-action="save-episode-asset-to-library"/);
    assert.match(html, /data-action="open-delete-episode-asset-modal"/);
    assert.match(html, /删除后无法找回，确认删除吗？/);
    assert.match(html, /data-action="confirm-delete-episode-asset"/);
    assert.doesNotMatch(html, /asset-inspector-dialog/);
  });

  it("renders episode asset save-to-library quick action in asset mode", () => {
    const state = buildProjectState();
    const storyboards = addStoryboard([]);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          museScopeMode: "assets",
          projectAssetTab: "scene",
          selectedEpisodeId: "episode-new",
          storyboards,
          selectedStoryboard: storyboards[0],
          importedAssets: {
            character: [],
            scene: [
              {
                id: "episode-scene-1",
                name: "废土街角",
                preview: "/uploads/episode-scene.png",
                description: "雨夜霓虹废墟街角",
                kind: "scene",
              },
            ],
            prop: [],
            other: { image: [], video: [] },
          },
          customEpisodes: [
            {
              id: "episode-new",
              title: "Episode Draft",
              status: "Draft",
              createdAt: "2026/05/22",
              createdAtMs: Date.parse("2026-05-22T08:00:00.000Z"),
              storyboardCount: 1,
            },
          ],
          episodeStoryboardMap: {
            "episode-new": storyboards,
          },
        }),
      },
    });

    assert.match(html, /data-action="save-episode-asset-to-library"/);
    assert.match(html, /保存场景到资产库/);
  });

  it("renders the manual episode asset creation modal with compact centered layout", () => {
    const state = buildProjectState();
    const storyboards = addStoryboard([]);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          museScopeMode: "assets",
          selectedEpisodeId: "episode-new",
          storyboards,
          selectedStoryboard: storyboards[0],
          episodeAssetCreateModal: {
            show: true,
            type: "character",
            name: "角色选项卡",
          },
        }),
      },
    });

    assert.match(html, /episode-asset-create-modal/);
    assert.match(html, /类型 <em>\*<\/em>/);
    assert.match(html, /名称 <em>\*<\/em>/);
    assert.match(html, /角色选项卡/);
    assert.match(html, />5 \/ 20</);
  });

  it("renders the export option modal with mp4 and jianying actions", () => {
    const state = buildProjectState();
    const storyboards = createStoryboardList(state);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          selectedEpisodeId: "episode-new",
          storyboards,
          selectedStoryboard: storyboards[0],
          exportOptionModal: {
            show: true,
            status: "idle",
          },
        }),
      },
    });

    assert.match(html, /episode-export-modal/);
    assert.match(html, /data-action="start-episode-export" data-export-kind="mp4"/);
    assert.match(html, /data-action="start-episode-export" data-export-kind="jianying"/);
    assert.match(html, /剪映工程文件/);
  });

  it("renders export modal feedback when export is blocked by incomplete storyboards", () => {
    const state = buildProjectState();
    const storyboards = createStoryboardList(state);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          selectedEpisodeId: "episode-new",
          storyboards,
          selectedStoryboard: storyboards[0],
          exportOptionModal: {
            show: true,
            status: "error",
            kind: "mp4",
            message: "请确保所有分镜都已生成图片或者视频",
          },
        }),
      },
    });

    assert.match(html, /episode-export-modal-feedback error/);
    assert.match(html, /请确保所有分镜都已生成图片或者视频/);
  });

  it("renders storyboard hover tools with insert and delete actions", () => {
    const storyboards = addStoryboard([]);
    const html = renderProductionWorkbench({
      state: buildProjectState(),
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          museScopeMode: "storyboard",
          selectedEpisodeId: "episode-new",
          storyboards,
          selectedStoryboard: storyboards[0],
          episodeStoryboardMap: {
            "episode-new": storyboards,
          },
        }),
      },
    });

    assert.match(html, /episode-replica-shot-hover-tools/);
    assert.match(html, /data-action="add-storyboard" data-storyboard-id="/);
    assert.match(html, /data-action="open-delete-sidebar-storyboard-modal"/);
  });

  it("persists a newly added episode storyboard into project detail shots for rehydration", async () => {
    const createShotCalls = [];
    const state = {
      ...buildProjectState(),
      projectDetail: {
        project: { id: "project-1", projectId: "project-1", name: "try" },
        episodes: [
          {
            id: "episode-1",
            title: "第一集",
            status: "draft",
            storyboardCount: 0,
            createdAt: "2026-05-31T08:00:00.000Z",
          },
        ],
        assetsByType: {
          character: [],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
        shots: [],
      },
      shots: [],
    };
    const workbench = {
      state,
      session: { user: { phone: "+86 13800138000" } },
      api: {
        async createShot(payload) {
          createShotCalls.push(payload);
          return {
            shot: {
              id: "shot-created-1",
              episodeId: "episode-1",
              title: payload.title,
              description: payload.description,
              currentImageAssetVersionId: null,
              currentVideoAssetVersionId: null,
            },
          };
        },
      },
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        projectInteriorSection: "episodes",
        selectedEpisodeId: "episode-1",
        storyboards: [],
        selectedStoryboard: null,
        selectedStoryboardId: null,
        episodeStoryboardMap: {
          "episode-1": [],
        },
        customEpisodes: [],
      }),
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "add-storyboard",
      },
    });

    assert.deepEqual(createShotCalls, [
      {
        episodeId: "episode-1",
        title: "1",
        description: "",
      },
    ]);
    assert.equal(workbench.ui.episodeStoryboardMap["episode-1"][0]?.linkedShotId, "shot-created-1");
    assert.equal(workbench.state.projectDetail.shots[0]?.id, "shot-created-1");
    assert.equal(createStoryboardList(workbench.state)[0]?.id, "storyboard-shot-created-1");
  });

  it("renders lip-sync panel with selected voice chip and audio metadata", () => {
    const storyboards = addStoryboard([]);
    const html = renderProductionWorkbench({
      state: buildProjectState(),
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          episodeMediaMode: "lip-sync",
          selectedEpisodeId: "episode-new",
          prompt: "叶尘也在其中。",
          lipSyncVoiceName: "女/稚嫩",
          lipSyncAudioItems: [
            {
              id: "audio-1",
              name: "音频 1",
              summary: "叶尘也在其中。",
              voiceName: "女/稚嫩",
              durationLabel: "00:04",
            },
          ],
          storyboards,
          selectedStoryboard: storyboards[0],
          episodeStoryboardMap: {
            "episode-new": storyboards,
          },
        }),
      },
    });

    assert.match(html, /episode-replica-lipsync-voice-chip/);
    assert.match(html, /女\/稚嫩/);
    assert.match(html, /00:04/);
  });

  it("renders storyboard mention-matched asset thumbnails from text descriptions", () => {
    const storyboards = [
      {
        ...addStoryboard([])[0],
        id: "storyboard-mention-1",
        description: "陆帆在【@荒野站点】外看向【@陆帆】。",
        references: [],
      },
      {
        ...addStoryboard([])[0],
        id: "storyboard-mention-2",
        index: 2,
        title: "2",
        description: "这里提到了【@不存在素材】，不应该回显图片。",
        references: [],
      },
    ];

    const html = renderProductionWorkbench({
      state: {
        ...buildProjectState(),
        shots: [],
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          selectedEpisodeId: "episode-new",
          selectedStoryboardId: "storyboard-mention-1",
          storyboards,
          selectedStoryboard: storyboards[0],
          episodeStoryboardMap: {
            "episode-new": storyboards,
          },
          importedAssets: {
            character: [
              {
                id: "character-lufan",
                name: "陆帆",
                previewUrl: "/uploads/lufan.png",
              },
            ],
            scene: [
              {
                id: "scene-wild",
                name: "荒野站点",
                previewUrl: "/uploads/wild-station.png",
              },
            ],
            prop: [],
            other: { image: [], video: [] },
          },
        }),
      },
    });

    assert.match(html, /episode-replica-shot-ref-list/);
    assert.match(html, /episode-replica-shot-ref-card/);
    assert.doesNotMatch(html, /<details/);
    assert.doesNotMatch(html, /<summary/);
    assert.match(html, /src="\/uploads\/wild-station\.png"/);
    assert.match(html, /src="\/uploads\/lufan\.png"/);
    assert.doesNotMatch(html, /episode-replica-shot-ref-card[^>]*title=/);
    assert.doesNotMatch(html, /episode-replica-shot-ref-card[^>]*>[^<]*荒野站点/s);
    assert.doesNotMatch(html, /episode-replica-shot-ref-card[^>]*>[^<]*陆帆/s);
    assert.doesNotMatch(html, /episode-replica-shot-linked-group/);
    assert.doesNotMatch(html, /不存在素材.*episode-replica-shot-ref-card/s);
    const firstPreviewColumn = html.slice(
      html.indexOf('<span class="episode-replica-shot-card-column preview-column">'),
      html.indexOf('<div class="episode-replica-shot-hover-tools">'),
    );
    assert.match(firstPreviewColumn, /episode-replica-shot-media-placeholder/);
    assert.match(firstPreviewColumn, /episode-replica-shot-media-placeholder-icon/);
    assert.doesNotMatch(firstPreviewColumn, /src="\/uploads\/wild-station\.png"/);
    assert.doesNotMatch(firstPreviewColumn, /src="\/uploads\/lufan\.png"/);
  });

  it("prefers episode workbench asset collections over project detail assets", () => {
    const state = {
      ...buildProjectState(),
      projectDetail: {
        ...buildProjectState().projectDetail,
        assetsByType: {
          character: [
            {
              id: "detail-character-1",
              label: "项目详情角色",
              previewUrl: "/uploads/detail-character.png",
              latestVersion: {
                metadata: { description: "项目详情里的旧角色" },
              },
            },
          ],
        },
      },
      shots: [],
    };
    const storyboards = addStoryboard([]);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          selectedEpisodeId: "episode-new",
          storyboards,
          selectedStoryboard: storyboards[0],
          importedAssets: {
            character: [
              {
                id: "episode-character-1",
                name: "剧集角色",
                preview: "/uploads/episode-character.png",
                description: "工作台刚加载到的角色",
                kind: "character",
              },
            ],
            scene: [],
            prop: [],
            other: { image: [], video: [] },
          },
          customEpisodes: [
            {
              id: "episode-new",
              title: "Episode Draft",
              status: "Draft",
              createdAt: "2026/05/22",
              createdAtMs: Date.parse("2026-05-22T08:00:00.000Z"),
              storyboardCount: 1,
            },
          ],
          episodeStoryboardMap: {
            "episode-new": storyboards,
          },
        }),
      },
    });

    assert.match(html, /剧集角色/);
    assert.doesNotMatch(html, /项目详情角色/);
  });

  it("renders episode workbench assets from context aliases and paged buckets", () => {
    const state = {
      ...buildProjectState(),
      projectDetail: {
        ...buildProjectState().projectDetail,
        episodes: [
          {
            id: "episode-new",
            title: "Episode Draft",
            status: "Draft",
            storyboardCount: 1,
          },
        ],
      },
      shots: [],
    };
    const storyboards = addStoryboard([]);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        projectInteriorSection: "episodes",
        selectedEpisodeId: "episode-new",
        storyboards,
        selectedStoryboard: storyboards[0],
        importedAssets: {
          character: [],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
        episodeWorkbenchContext: {
          assetsByType: {
            role: [
              {
                assetId: "episode-character-1",
                name: "剧集主角",
                description: "从 workbench role 别名返回。",
                fixedImageUrl: "/uploads/episode-character.png",
              },
            ],
            scenes: {
              items: [
                {
                  assetId: "episode-scene-1",
                  name: "废土街区",
                  description: "从分页 scenes.items 返回。",
                  fixedImageUrl: "/uploads/episode-scene.png",
                },
              ],
            },
            props: [
              {
                assetId: "episode-prop-1",
                name: "破损长枪",
                description: "从 props 别名返回。",
                fixedImageUrl: "/uploads/episode-prop.png",
              },
            ],
          },
        },
        customEpisodes: [
          {
            id: "episode-new",
            title: "Episode Draft",
            status: "Draft",
            createdAt: "2026/05/22",
            createdAtMs: Date.parse("2026-05-22T08:00:00.000Z"),
            storyboardCount: 1,
          },
        ],
        episodeStoryboardMap: {
          "episode-new": storyboards,
        },
      }),
    });

    assert.match(html, /剧集主角/);
    assert.match(html, /废土街区/);
    assert.match(html, /破损长枪/);
  });

  it("links overview asset cards to the matching asset tab", () => {
    const state = buildProjectState();
    const storyboards = createStoryboardList(state);
    const overviewHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        projectPanelMode: "workspace",
        projectInteriorSection: "overview",
        storyboards,
        selectedStoryboard: storyboards[0],
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        isCreateModalOpen: false,
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
      },
    });

    assert.match(overviewHtml, /data-action="open-project-asset-tab"/);
    assert.match(overviewHtml, /data-asset-kind="character"/);
    assert.match(overviewHtml, /data-asset-kind="scene"/);
    assert.match(overviewHtml, /data-asset-kind="prop"/);
    assert.match(overviewHtml, /data-asset-kind="other"/);
    assert.equal([...overviewHtml.matchAll(/class="asset-card-summary"/g)].length, 4);
    assert.ok(overviewHtml.includes(`class="asset-card-count">1</span>`));

    const assetHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        projectPanelMode: "workspace",
        projectInteriorSection: "assets",
        projectAssetTab: "scene",
        storyboards,
        selectedStoryboard: storyboards[0],
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        isCreateModalOpen: false,
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
      },
    });

    assert.ok(assetHtml.includes(`data-section="assets"`));
    assert.ok(assetHtml.includes(`data-asset-tab="scene"`));
  });

  it("resolves overview asset card preview stacks against the backend origin after refresh", () => {
    const previousWindow = globalThis.window;
    globalThis.window = {
      location: {
        protocol: "http:",
        host: "127.0.0.1:4173",
        port: "4173",
        origin: "http://127.0.0.1:4173",
      },
    };

    try {
      const state = {
        ...buildProjectState(),
        projectDetail: {
          project: {
            id: "project-1",
            name: "try",
            phase: "asset_review",
            aspectRatio: "9:16",
            resolution: "1080p",
          },
          assetSummary: {
            character: {
              count: 1,
              previews: ["/uploads/overview-character.png"],
            },
            scene: { count: 0, previews: [] },
            prop: { count: 0, previews: [] },
            other: { count: 0, previews: [] },
          },
          episodes: [],
          shots: [],
        },
      };
      const storyboards = createStoryboardList(state);

      const html = renderProductionWorkbench({
        state,
        session: { user: { phone: "+86 13800138000" } },
        ui: {
          ...buildProjectUi({
            projectPanelMode: "workspace",
            projectInteriorSection: "overview",
            storyboards,
            selectedStoryboard: storyboards[0] ?? null,
          }),
        },
      });

      assert.match(html, /http:\/\/127\.0\.0\.1:4310\/uploads\/overview-character\.png/);
    } finally {
      globalThis.window = previousWindow;
    }
  });

  it("renders the character empty state with the centered intake layout", () => {
    const state = buildProjectState();
    const storyboards = createStoryboardList(state);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "workspace",
          projectInteriorSection: "assets",
          projectAssetTab: "character",
          storyboards,
          selectedStoryboard: storyboards[0],
          importedAssets: {
            character: [],
            scene: [],
            prop: [],
            other: { image: [], video: [] },
          },
        }),
      },
    });

    assert.match(html, /asset-library-empty-showcase/);
    assert.match(html, /data-action="open-asset-import-modal"/);
    assert.match(html, /data-asset-kind="character"/);
  });

  it("keeps the episode asset area blank when the current episode has no assets", () => {
    const html = renderProductionWorkbench({
      state: {
        ...buildProjectState(),
        shots: [],
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          selectedEpisodeId: "episode-new",
          projectAssetTab: "character",
          museScopeMode: "assets",
          selectedEpisodeCardId: null,
          selectedEpisodeAssetId: null,
          importedAssets: {
            character: [],
            scene: [],
            prop: [],
          },
          assetSearchQuery: "",
        }),
      },
    });

    assert.match(html, /data-action="open-episode-asset-create-modal"/);
    assert.match(html, /data-action="open-asset-import-modal" data-asset-kind="character"/);
    assert.doesNotMatch(html, /episode-replica-asset-empty-canvas/);
    assert.doesNotMatch(html, /data-asset-section="character"/);
    assert.doesNotMatch(html, /data-asset-section="scene"/);
    assert.doesNotMatch(html, /data-asset-section="prop"/);
    assert.doesNotMatch(html, /没有匹配到可快捷引用的资产/);
    assert.doesNotMatch(html, /请选择角色/);
  });

  it("does not render project detail assets or empty placeholders inside a blank episode asset workspace", () => {
    const html = renderProductionWorkbench({
      state: {
        ...buildProjectState(),
        projectDetail: {
          ...buildProjectState().projectDetail,
          assetsByType: {
            character: [
              {
                id: "project-character-1",
                label: "项目角色不应出现",
                latestVersion: {
                  metadata: { description: "项目角色描述不应出现" },
                },
              },
            ],
            scene: [
              {
                id: "project-scene-1",
                label: "项目场景不应出现",
                latestVersion: {
                  metadata: { description: "项目场景描述不应出现" },
                },
              },
            ],
            prop: [
              {
                id: "project-prop-1",
                label: "项目道具不应出现",
                latestVersion: {
                  metadata: { description: "项目道具描述不应出现" },
                },
              },
            ],
          },
        },
        shots: [],
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          selectedEpisodeId: "episode-new",
          projectAssetTab: "character",
          museScopeMode: "assets",
          selectedEpisodeCardId: null,
          selectedEpisodeAssetId: null,
          importedAssets: {
            character: [],
            scene: [],
            prop: [],
            other: { image: [], video: [] },
          },
          assetSearchQuery: "",
        }),
      },
    });

    assert.doesNotMatch(html, /项目角色不应出现/);
    assert.doesNotMatch(html, /项目场景不应出现/);
    assert.doesNotMatch(html, /项目道具不应出现/);
    assert.doesNotMatch(html, /data-asset-section="character"/);
    assert.doesNotMatch(html, /data-asset-section="scene"/);
    assert.doesNotMatch(html, /data-asset-section="prop"/);
  });

  it("renders current episode assets across character scene and prop sections in episode workbench", () => {
    const html = renderProductionWorkbench({
      state: {
        ...buildProjectState(),
        shots: [],
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          selectedEpisodeId: "episode-2",
          projectAssetTab: "character",
          museScopeMode: "assets",
          selectedEpisodeCardId: null,
          selectedEpisodeAssetId: null,
          importedAssets: {
            character: [
              {
                id: "episode-character-1",
                name: "剧集角色A",
                description: "当前剧集角色描述",
                preview: "data:image/svg+xml;charset=UTF-8,episode-character-preview",
              },
            ],
            scene: [
              {
                id: "episode-scene-1",
                name: "剧集场景A",
                description: "当前剧集场景描述",
                preview: "data:image/svg+xml;charset=UTF-8,episode-scene-preview",
              },
            ],
            prop: [
              {
                id: "episode-prop-1",
                name: "剧集道具A",
                description: "当前剧集道具描述",
                preview: "data:image/svg+xml;charset=UTF-8,episode-prop-preview",
              },
            ],
            other: { image: [], video: [] },
          },
          assetSearchQuery: "",
        }),
      },
    });

    assert.match(html, /data-asset-card-id="episode-character-1"/);
    assert.match(html, /剧集角色A/);
    assert.match(html, /当前剧集角色描述/);
    assert.match(html, /data-asset-card-id="episode-scene-1"/);
    assert.match(html, /剧集场景A/);
    assert.match(html, /当前剧集场景描述/);
    assert.match(html, /data-asset-card-id="episode-prop-1"/);
    assert.match(html, /剧集道具A/);
    assert.match(html, /当前剧集道具描述/);
  });

  it("keeps current episode assets after project detail refreshes in episode workbench mode", () => {
    const workbench = {
      state: {
        ...buildProjectState(),
      },
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        selectedEpisodeId: "episode-2",
        importedAssets: {
          character: [
            {
              id: "episode-character-1",
              name: "剧集角色A",
              description: "当前剧集角色描述",
              preview: "data:image/svg+xml;charset=UTF-8,episode-character-preview",
            },
          ],
          scene: [
            {
              id: "episode-scene-1",
              name: "剧集场景A",
              description: "当前剧集场景描述",
              preview: "data:image/svg+xml;charset=UTF-8,episode-scene-preview",
            },
          ],
          prop: [
            {
              id: "episode-prop-1",
              name: "剧集道具A",
              description: "当前剧集道具描述",
              preview: "data:image/svg+xml;charset=UTF-8,episode-prop-preview",
            },
          ],
          other: { image: [], video: [] },
        },
      }),
    };

    applyProjectDetail(workbench, {
      ...buildProjectState().projectDetail,
      assetsByType: {
        character: [
          {
            id: "project-character-1",
            label: "项目角色不应覆盖剧集角色",
            latestVersion: {
              metadata: { description: "项目角色描述不应覆盖剧集角色" },
            },
          },
        ],
        scene: [
          {
            id: "project-scene-1",
            label: "项目场景不应覆盖剧集场景",
            latestVersion: {
              metadata: { description: "项目场景描述不应覆盖剧集场景" },
            },
          },
        ],
        prop: [
          {
            id: "project-prop-1",
            label: "项目道具不应覆盖剧集道具",
            latestVersion: {
              metadata: { description: "项目道具描述不应覆盖剧集道具" },
            },
          },
        ],
      },
    });

    assert.equal(workbench.ui.importedAssets.character[0].id, "episode-character-1");
    assert.equal(workbench.ui.importedAssets.scene[0].id, "episode-scene-1");
    assert.equal(workbench.ui.importedAssets.prop[0].id, "episode-prop-1");
  });

  it("renders episode asset cards from workbench context when imported assets are temporarily empty", () => {
    const html = renderProductionWorkbench({
      state: {
        ...buildProjectState(),
        shots: [],
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          selectedEpisodeId: "episode-2",
          projectAssetTab: "character",
          museScopeMode: "assets",
          selectedEpisodeCardId: null,
          selectedEpisodeAssetId: null,
          importedAssets: {
            character: [],
            scene: [],
            prop: [],
            other: { image: [], video: [] },
          },
          episodeWorkbenchContext: {
            assetsByType: {
              character: [
                {
                  assetId: "episode-character-1",
                  name: "剧集角色A",
                  description: "当前剧集角色描述",
                  fixedImageUrl: "",
                },
              ],
              scene: [
                {
                  assetId: "episode-scene-1",
                  name: "剧集场景A",
                  description: "当前剧集场景描述",
                  fixedImageUrl: "",
                },
              ],
              prop: [
                {
                  assetId: "episode-prop-1",
                  name: "剧集道具A",
                  description: "当前剧集道具描述",
                  fixedImageUrl: "",
                },
              ],
            },
          },
          assetSearchQuery: "",
        }),
      },
    });

    assert.match(html, /data-asset-card-id="episode-character-1"/);
    assert.match(html, /剧集角色A/);
    assert.match(html, /data-asset-card-id="episode-scene-1"/);
    assert.match(html, /剧集场景A/);
    assert.match(html, /data-asset-card-id="episode-prop-1"/);
    assert.match(html, /剧集道具A/);
  });

  it("renders episode asset cards when workbench context keeps assets under data", () => {
    const html = renderProductionWorkbench({
      state: {
        ...buildProjectState(),
        shots: [],
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          selectedEpisodeId: "episode-2",
          projectAssetTab: "character",
          museScopeMode: "assets",
          selectedEpisodeCardId: null,
          selectedEpisodeAssetId: null,
          importedAssets: {
            character: [],
            scene: [],
            prop: [],
            other: { image: [], video: [] },
          },
          episodeWorkbenchContext: {
            data: {
              assetsByType: {
                character: [
                  {
                    assetId: "episode-character-data-1",
                    name: "剧集角色Data",
                    description: "data 包裹下的角色",
                    fixedImageUrl: "",
                  },
                ],
                scene: [
                  {
                    assetId: "episode-scene-data-1",
                    name: "剧集场景Data",
                    description: "data 包裹下的场景",
                    fixedImageUrl: "",
                  },
                ],
                prop: [
                  {
                    assetId: "episode-prop-data-1",
                    name: "剧集道具Data",
                    description: "data 包裹下的道具",
                    fixedImageUrl: "",
                  },
                ],
              },
            },
          },
          assetSearchQuery: "",
        }),
      },
    });

    assert.match(html, /data-asset-card-id="episode-character-data-1"/);
    assert.match(html, /剧集角色Data/);
    assert.match(html, /data-asset-card-id="episode-scene-data-1"/);
    assert.match(html, /剧集场景Data/);
    assert.match(html, /data-asset-card-id="episode-prop-data-1"/);
    assert.match(html, /剧集道具Data/);
  });

  it("falls back to backend role assets when character is present but empty", () => {
    const html = renderProductionWorkbench({
      state: {
        ...buildProjectState(),
        projectDetail: {
          ...buildProjectState().projectDetail,
          episodes: [
            {
              id: "episode-2",
              title: "Episode 2",
              status: "Draft",
              storyboardCount: 0,
            },
          ],
        },
        shots: [],
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          selectedEpisodeId: "episode-2",
          projectAssetTab: "character",
          museScopeMode: "assets",
          selectedEpisodeCardId: null,
          selectedEpisodeAssetId: null,
          importedAssets: {
            character: [],
            scene: [],
            prop: [],
            other: { image: [], video: [] },
          },
          episodeWorkbenchContext: {
            assetsByType: {
              character: [],
              role: [
                {
                  assetId: "episode-role-1",
                  name: "后端角色A",
                  description: "后端 role 字段中的角色",
                  fixedImageUrl: "",
                },
              ],
              scene: [],
              prop: [],
            },
          },
          customEpisodes: [
            {
              id: "episode-2",
              title: "Episode 2",
              status: "Draft",
              createdAt: "2026/05/22",
              createdAtMs: Date.parse("2026-05-22T08:00:00.000Z"),
              storyboardCount: 0,
            },
          ],
          assetSearchQuery: "",
        }),
      },
    });

    assert.match(html, /data-asset-card-id="episode-role-1"/);
    assert.match(html, /后端角色A/);
  });

  it("prefers current episode backend assets over stale imported asset cache", () => {
    const html = renderProductionWorkbench({
      state: {
        ...buildProjectState(),
        projectDetail: {
          ...buildProjectState().projectDetail,
          episodes: [
            {
              id: "episode-2",
              title: "Episode 2",
              status: "Draft",
              storyboardCount: 0,
            },
          ],
        },
        shots: [],
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          selectedEpisodeId: "episode-2",
          projectAssetTab: "character",
          museScopeMode: "assets",
          selectedEpisodeCardId: null,
          selectedEpisodeAssetId: null,
          importedAssets: {
            character: [
              {
                id: "stale-character-1",
                name: "旧缓存角色",
                description: "不应优先于后端当前剧集数据",
                preview: "",
              },
            ],
            scene: [],
            prop: [],
            other: { image: [], video: [] },
          },
          episodeWorkbenchContext: {
            assetsByType: {
              role: [
                {
                  assetId: "episode-role-fresh-1",
                  name: "当前剧集后端角色",
                  description: "应优先显示后端返回",
                  fixedImageUrl: "",
                },
              ],
              character: [],
              scene: [],
              prop: [],
            },
          },
          customEpisodes: [
            {
              id: "episode-2",
              title: "Episode 2",
              status: "Draft",
              createdAt: "2026/05/22",
              createdAtMs: Date.parse("2026-05-22T08:00:00.000Z"),
              storyboardCount: 0,
            },
          ],
          assetSearchQuery: "",
        }),
      },
    });

    assert.match(html, /当前剧集后端角色/);
    assert.doesNotMatch(html, /旧缓存角色/);
  });

  it("renders only the current episode asset sections that have backend data", () => {
    const html = renderProductionWorkbench({
      state: {
        ...buildProjectState(),
        shots: [],
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          selectedEpisodeId: "episode-2",
          projectAssetTab: "character",
          museScopeMode: "assets",
          selectedEpisodeCardId: null,
          selectedEpisodeAssetId: null,
          importedAssets: {
            character: [
              {
                id: "episode-character-1",
                name: "剧集角色A",
                description: "当前剧集角色描述",
                preview: "data:image/svg+xml;charset=UTF-8,episode-character-preview",
              },
            ],
            scene: [],
            prop: [
              {
                id: "episode-prop-1",
                name: "剧集道具A",
                description: "当前剧集道具描述",
                preview: "data:image/svg+xml;charset=UTF-8,episode-prop-preview",
              },
            ],
            other: { image: [], video: [] },
          },
          assetSearchQuery: "",
        }),
      },
    });

    assert.match(html, /data-asset-section="character"/);
    assert.match(html, /data-asset-section="prop"/);
    assert.doesNotMatch(html, /data-asset-section="scene"/);
    assert.doesNotMatch(html, /暂无场景资产/);
  });

  it("keeps newly created episode character scene and prop assets empty in generation payloads", () => {
    const state = {
      ...buildProjectState(),
      projectDetail: {
        ...buildProjectState().projectDetail,
        assetsByType: {
          character: [
            {
              id: "project-character-1",
              label: "项目角色",
              latestVersion: {
                metadata: { description: "项目资产不能自动进入新剧集" },
              },
            },
          ],
          scene: [
            {
              id: "project-scene-1",
              label: "项目场景",
              latestVersion: {
                metadata: { description: "项目场景不能自动进入新剧集" },
              },
            },
          ],
          prop: [
            {
              id: "project-prop-1",
              label: "项目道具",
              latestVersion: {
                metadata: { description: "项目道具不能自动进入新剧集" },
              },
            },
          ],
        },
      },
      shots: [],
    };

    for (const projectAssetTab of ["character", "scene", "prop"]) {
      const payload = buildImageGenerationPayload({
        state,
        ui: buildProjectUi({
          projectPanelMode: "episode-workbench",
          selectedEpisodeId: "episode-new",
          projectAssetTab,
          museScopeMode: "assets",
          selectedEpisodeCardId: null,
          selectedEpisodeAssetId: null,
          importedAssets: {
            character: [],
            scene: [],
            prop: [],
            other: { image: [], video: [] },
          },
          storyboards: [],
          selectedStoryboard: null,
        }),
      });

      assert.equal(payload.parameters.selectionContext.assetTab, projectAssetTab);
      assert.equal(payload.parameters.selectionContext.selectedAsset, null);
      assert.equal(payload.parameters.selectionContext.selectedAssetId, null);
      assert.equal(payload.parameters.selectionContext.selectedAssetName, null);
      assert.equal(payload.parameters.selectionContext.selectedAssetDescription, null);
    }
  });

  it("shows the episode quick-lane empty message only for unmatched search results", () => {
    const html = renderProductionWorkbench({
      state: {
        ...buildProjectState(),
        shots: [],
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          selectedEpisodeId: "episode-new",
          projectAssetTab: "character",
          museScopeMode: "assets",
          importedAssets: {
            character: [
              {
                id: "character-1",
                name: "测试",
                description: "29岁男性",
                previewUrl: "https://example.com/character.png",
              },
            ],
            scene: [],
            prop: [],
          },
          assetSearchQuery: "不存在的搜索词",
        }),
      },
    });

    assert.match(html, /episode-replica-right-empty/);
    assert.match(html, /没有匹配到可快捷引用的资产/);
  });

  it("renders episode quick-lane assets as image thumbnails", () => {
    const html = renderProductionWorkbench({
      state: {
        ...buildProjectState(),
        shots: [],
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          selectedEpisodeId: "episode-new",
          projectAssetTab: "character",
          museScopeMode: "storyboard",
          importedAssets: {
            character: [
              {
                id: "character-1",
                name: "李右/破旧外套",
                description: "29岁男性",
                previewUrl: "https://example.com/character.png",
              },
            ],
            scene: [],
            prop: [],
          },
        }),
      },
    });
    const quickCard = html.slice(
      html.indexOf('class="episode-replica-quick-asset'),
      html.indexOf("</button>", html.indexOf('class="episode-replica-quick-asset')),
    );

    assert.match(quickCard, /episode-replica-quick-thumb-image/);
    assert.match(quickCard, /src="https:\/\/example\.com\/character\.png"/);
    assert.match(quickCard, /class="episode-replica-quick-name">李右\/破旧外套<\/span>/);
    assert.doesNotMatch(quickCard, /episode-replica-quick-copy/);
  });

  it("renders asset mode with the Muse-like image model and 50-credit action", () => {
    const html = renderProductionWorkbench({
      state: {
        ...buildProjectState(),
        shots: [],
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          selectedEpisodeId: "episode-new",
          projectAssetTab: "character",
          museScopeMode: "assets",
          selectedEpisodeCardId: "character-1",
          selectedEpisodeAssetId: "character-1",
          importedAssets: {
            character: [
              {
                id: "character-1",
                name: "测试",
                description: "29岁男性",
                previewUrl: "https://example.com/character.png",
              },
            ],
            scene: [],
            prop: [],
          },
        }),
      },
    });

    assert.match(html, /下一步：分镜制作/);
    assert.match(html, /GPT Image 2/);
    assert.match(html, /50<\/span>\s*<strong class="episode-replica-generate-label">生成<\/strong>/);
    assert.match(html, /class="episode-replica-generate" type="button" data-action="generate-images"/);
  });

  it("renders the first selected asset as a clean session and moves its summary into the stage title", () => {
    const html = renderProductionWorkbench({
      state: {
        ...buildProjectState(),
        shots: [],
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          selectedEpisodeId: "episode-new",
          projectAssetTab: "character",
          museScopeMode: "assets",
          selectedEpisodeCardId: "character-1",
          selectedEpisodeAssetId: "character-1",
          importedAssets: {
            character: [
              {
                id: "character-1",
                name: "测试",
                description: "29岁男性",
                previewUrl: "https://example.com/character.png",
              },
            ],
            scene: [],
            prop: [],
          },
        }),
      },
    });

    assert.match(html, /角色测试：29岁男性/);
    assert.match(html, /episode-replica-asset-stage clean-session/);
    assert.doesNotMatch(html, /episode-replica-result-panel visible asset-result-panel/);
    assert.doesNotMatch(html, /episode-replica-prompt-context/);
  });

  it("keeps quick references only in the bottom composer strip instead of rendering a duplicate center strip", () => {
    const html = renderProductionWorkbench({
      state: {
        ...buildProjectState(),
        shots: [],
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          selectedEpisodeId: "episode-new",
          projectAssetTab: "character",
          museScopeMode: "assets",
          selectedEpisodeCardId: "character-1",
          selectedEpisodeAssetId: "character-1",
          importedAssets: {
            character: [
              {
                id: "character-1",
                name: "废土主角",
                description: "瘦削、警惕、穿破旧夹克，肩背磨损背包。",
                previewUrl: "https://example.com/character.png",
              },
              {
                id: "character-2",
                name: "蓬头垢面的女人",
                description: "头发凌乱，神情疲惫但强硬，裹着褪色布料。",
                previewUrl: "https://example.com/character-2.png",
              },
            ],
            scene: [],
            prop: [],
          },
          assetPromptDraft: {
            scopeMode: "assets",
            prompt: "废土主角\n蓬头垢面的女人",
            quickReferenceItems: [
              {
                id: "quick-ref:character:character-1",
                assetId: "character-1",
                kind: "character",
                name: "废土主角",
                description: "瘦削、警惕、穿破旧夹克，肩背磨损背包。",
                preview: "https://example.com/character.png",
              },
              {
                id: "quick-ref:character:character-2",
                assetId: "character-2",
                kind: "character",
                name: "蓬头垢面的女人",
                description: "头发凌乱，神情疲惫但强硬，裹着褪色布料。",
                preview: "https://example.com/character-2.png",
              },
            ],
            mentionReferences: [],
            selectionContext: {
              selectedAssetId: "character-2",
            },
          },
        }),
      },
    });

    assert.match(html, /class="episode-replica-ref-strip"/);
    assert.doesNotMatch(html, /class="episode-replica-asset-stage-strip"/);
  });

  it("removes only the selected asset composer quick reference on the client", async () => {
    const workbench = {
      state: {
        ...buildProjectState(),
        shots: [],
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        selectedEpisodeId: "episode-new",
        projectAssetTab: "prop",
        museScopeMode: "assets",
        selectedEpisodeCardId: "prop-1",
        selectedEpisodeAssetId: "prop-1",
        importedAssets: {
          character: [],
          scene: [],
          prop: [
            {
              id: "prop-1",
              name: "教师",
              description: "刚添加的道具选项",
              previewUrl: "https://example.com/teacher.png",
            },
          ],
        },
        assetPromptDraft: {
          scopeMode: "assets",
          prompt: "自己的角色描述，随意更改",
          quickReferenceItems: [
            {
              id: "quick-ref:prop:prop-1",
              assetId: "prop-1",
              kind: "prop",
              name: "教师",
              description: "刚添加的道具选项",
              preview: "https://example.com/teacher.png",
            },
            {
              id: "quick-ref:prop:prop-2",
              assetId: "prop-2",
              kind: "prop",
              name: "黑板",
              description: "另一张引用图",
              preview: "https://example.com/board.png",
            },
          ],
          mentionReferences: [
            {
              id: "quick-ref:prop:prop-1",
              assetId: "prop-1",
              kind: "prop",
              name: "教师",
            },
          ],
          selectionContext: {
            selectedAssetId: "prop-1",
          },
        },
        imageGenerationResult: {
          taskId: "keep-result",
          fixedImages: [
            {
              id: "fixed-image-1",
              url: "https://example.com/generated.png",
            },
          ],
        },
      }),
      api: {
        async deleteFileResource() {
          throw new Error("deleteFileResource should not be called");
        },
      },
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "remove-quick-reference",
        referenceId: "quick-ref:prop:prop-1",
      },
    });

    assert.deepEqual(
      workbench.ui.assetPromptDraft.quickReferenceItems.map((item) => item.id),
      ["quick-ref:prop:prop-2"],
    );
    assert.deepEqual(workbench.ui.assetPromptDraft.mentionReferences, []);
    assert.equal(workbench.ui.assetPromptDraft.prompt, "自己的角色描述，随意更改");
    assert.equal(workbench.ui.imageGenerationResult.taskId, "keep-result");
    assert.match(workbench.root.innerHTML, /data-asset-card-id="prop-1"/);
    assert.match(workbench.root.innerHTML, /黑板/);
    assert.doesNotMatch(workbench.root.innerHTML, /data-reference-id="quick-ref:prop:prop-1"/);
  });

  it("clears the composer prompt and quick references after asset generation", async () => {
    const workbench = {
      state: {
        ...buildProjectState(),
        shots: [],
      },
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        selectedEpisodeId: "episode-new",
        projectAssetTab: "character",
        museScopeMode: "assets",
        selectedEpisodeCardId: "character-2",
        selectedEpisodeAssetId: "character-2",
        prompt: "瘦削，警惕，穿破旧夹克，肩背磨损背包。\n头发凌乱，神情疲惫但强硬，裹着褪色布料。",
        importedAssets: {
          character: [
            {
              id: "character-1",
              name: "废土主角",
              description: "瘦削，警惕，穿破旧夹克，肩背磨损背包。",
              previewUrl: "https://example.com/character-1.png",
            },
            {
              id: "character-2",
              name: "蓬头垢面的女人",
              description: "头发凌乱，神情疲惫但强硬，裹着褪色布料。",
              previewUrl: "https://example.com/character-2.png",
            },
          ],
          scene: [],
          prop: [],
        },
        assetPromptDraft: {
          scopeMode: "assets",
          prompt: "瘦削，警惕，穿破旧夹克，肩背磨损背包。\n头发凌乱，神情疲惫但强硬，裹着褪色布料。",
          quickReferenceItems: [
            {
              id: "quick-ref:character:character-1",
              assetId: "character-1",
              kind: "character",
              name: "废土主角",
              description: "瘦削，警惕，穿破旧夹克，肩背磨损背包。",
              preview: "https://example.com/character-1.png",
            },
            {
              id: "quick-ref:character:character-2",
              assetId: "character-2",
              kind: "character",
              name: "蓬头垢面的女人",
              description: "头发凌乱，神情疲惫但强硬，裹着褪色布料。",
              preview: "https://example.com/character-2.png",
            },
          ],
          mentionReferences: [],
          selectionContext: {
            selectedAssetId: "character-2",
          },
        },
      }),
      api: {
        async createImageTask() {
          return {
            taskId: "asset-image-clear-composer-1",
            status: "succeeded",
            workflowStatus: "succeeded",
            result: {
              imageUrl: "https://example.com/generated-clear-composer.png",
              assetVersionId: "10000000-0000-4000-8000-000000000211",
              storageObjectId: "10000000-0000-4000-8000-000000000212",
            },
          };
        },
      },
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await generateAssetImages(workbench);

    assert.equal(workbench.ui.prompt, "");
    assert.equal(workbench.ui.assetPromptDraft?.prompt, "");
    assert.equal(workbench.ui.assetPromptDraft?.quickReferenceItems?.length, 0);
    assert.equal(workbench.ui.imageGenerationResult?.quickReferenceItems?.length, 2);
  });

  it("wires asset conversation post-render effects to scroll the latest entry into view", () => {
    const source = readFileSync(
      new URL("../src/features/production-workbench/index.js", import.meta.url),
      "utf8",
    );

    assert.match(
      source,
      /const episodeWorkbenchConversationScrollMode = workbench\.ui\.episodeWorkbenchConversationScrollMode \?\? null;/,
    );
    assert.match(source, /\.episode-replica-stage-body/);
    assert.match(source, /\.episode-replica-asset-conversation-entry:last-of-type/);
    assert.match(
      source,
      /latestConversationEntry\.scrollIntoView\(\{ block: "end", inline: "nearest", behavior: "smooth" \}\);/,
    );
    assert.match(source, /workbench\.ui\.episodeWorkbenchConversationScrollMode = null;/);
  });

  it("requests the episode workbench conversation to scroll to bottom after button clicks", () => {
    const source = readFileSync(
      new URL("../src/features/production-workbench/index.js", import.meta.url),
      "utf8",
    );

    assert.match(source, /function requestEpisodeWorkbenchConversationScroll\(workbench\)/);
    assert.match(source, /workbench\.ui\.episodeWorkbenchConversationScrollMode = "bottom";/);
    assert.match(source, /requestEpisodeWorkbenchConversationScroll\(workbench\);\s+void handleAction\(workbench, actionTarget\)/);
    assert.match(
      source,
      /conversationContainer\.scrollTo\(\{ top: conversationContainer\.scrollHeight, behavior: "smooth" \}\);/,
    );
  });

  it("renders asset image results while keeping the sent record and clearing the composer state", () => {
    const html = renderProductionWorkbench({
      state: {
        ...buildProjectState(),
        shots: [],
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          selectedEpisodeId: "episode-new",
          projectAssetTab: "character",
          museScopeMode: "assets",
          selectedEpisodeCardId: "character-1",
          selectedEpisodeAssetId: "character-1",
          prompt: "",
          assetPromptDraft: {
            scopeMode: "assets",
            prompt: "",
            quickReferenceItems: [],
          },
          importedAssets: {
            character: [
              {
                id: "character-1",
                name: "测试甲",
                description: "29岁男性",
                previewUrl: "https://example.com/character.png",
              },
              {
                id: "character-2",
                name: "测试乙",
                description: "30岁女性",
                previewUrl: "https://example.com/character-2.png",
              },
            ],
            scene: [],
            prop: [],
          },
          imageGenerationResult: {
            taskId: "asset-image-character-1",
            status: "completed",
            promptPreview: "一位约28岁的中国男性，身穿紧实粗糙的麻袋式上衣。",
            selectedModelId: "jimeng-4-5",
            aspectRatio: "16:9",
            resolution: "2K",
            creditCost: 50,
            createdAt: "2026-05-30 10:00:00",
            quickReferenceItems: [
              {
                id: "quick-ref:character:character-1",
                assetId: "character-1",
                kind: "character",
                name: "测试甲",
                description: "29岁男性",
                preview: "https://example.com/character.png",
              },
              {
                id: "quick-ref:character:character-2",
                assetId: "character-2",
                kind: "character",
                name: "测试乙",
                description: "30岁女性",
                preview: "https://example.com/character-2.png",
              },
            ],
            selectionContext: {
              assetTab: "character",
              selectedAssetId: "character-1",
              selectedAssetName: "测试甲",
            },
            fixedImages: [
              {
                id: "character-image-1",
                label: "角色图片",
                url: "https://example.com/character.png",
              },
            ],
          },
        }),
      },
    });

    assert.match(html, /任务ID：asset-image-character-1/);
    assert.match(html, /gpt image 2（链路G）/);
    assert.match(html, /积分：50/);
    assert.match(html, /class="episode-replica-message-thread"/);
    assert.match(html, /class="episode-replica-message-row user"/);
    assert.match(html, /class="episode-replica-message-badge">用户</);
    assert.match(html, /class="episode-replica-user-message-meta">任务ID：asset-image-character-1/);
    assert.doesNotMatch(html, /class="episode-replica-message-row system"/);
    assert.doesNotMatch(html, /class="episode-replica-message-badge">系统</);
    assert.match(html, /class="episode-replica-user-message-copy">一位约28岁的中国男性，身穿紧实粗糙的麻袋式上衣。</);
    assert.match(html, /class="episode-replica-user-message-refs"/);
    assert.match(html, /class="episode-replica-user-ref-card"/);
    assert.match(html, /测试甲/);
    assert.match(html, /测试乙/);
    assert.equal((html.match(/class="episode-replica-ref-card quick-reference"/g) ?? []).length, 0);
    assert.doesNotMatch(html, /class="episode-replica-task-id"/);
    assert.doesNotMatch(html, /class="episode-replica-stage-actions asset-scope"/);
    assert.doesNotMatch(html, /class="episode-replica-task-refs asset-inline"/);
    assert.match(html, /<textarea id="video-prompt-input" placeholder="请输入您的生图要求"><\/textarea>/);
    assert.match(html, /0 \/ 5000/);
    assert.match(html, /placeholder="请输入您的生图要求"/);
  });

  it("renders all repeated asset generation conversations as an ordered list", () => {
    const html = renderProductionWorkbench({
      state: {
        ...buildProjectState(),
        shots: [],
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          selectedEpisodeId: "episode-new",
          projectAssetTab: "prop",
          museScopeMode: "assets",
          selectedEpisodeCardId: "prop-1",
          selectedEpisodeAssetId: "prop-1",
          prompt: "",
          assetPromptDraft: {
            scopeMode: "assets",
            prompt: "",
            quickReferenceItems: [],
          },
          importedAssets: {
            character: [],
            scene: [],
            prop: [
              {
                id: "prop-1",
                name: "制式步枪",
                description: "黑灰枪体，线条硬朗，配有弹匣。 ",
                previewUrl: "https://example.com/rifle-current.png",
              },
            ],
          },
          imageGenerationResult: {
            taskId: "asset-image-prop-1-b",
            status: "completed",
            promptPreview: "第二次：补强枪身细节与枪托磨损。",
            selectedModelId: "tnb-fast",
            aspectRatio: "16:9",
            resolution: "2K",
            creditCost: 70,
            createdAt: "2026-05-30 09:31:30",
            selectionContext: {
              assetTab: "prop",
              selectedAssetId: "prop-1",
              selectedAssetName: "制式步枪",
            },
            fixedImages: [
              {
                id: "prop-image-b",
                label: "道具图片",
                url: "https://example.com/rifle-b.png",
              },
            ],
          },
          assetConversationHistory: {
            "image:prop-1": [
              {
                taskId: "asset-image-prop-1-a",
                status: "completed",
                promptPreview: "第一次：生成基础枪械外观。",
                selectedModelId: "tnb-pro",
                aspectRatio: "16:9",
                resolution: "2K",
                creditCost: 90,
                createdAt: "2026-05-30 09:29:09",
                selectionContext: {
                  assetTab: "prop",
                  selectedAssetId: "prop-1",
                  selectedAssetName: "制式步枪",
                },
                fixedImages: [
                  {
                    id: "prop-image-a",
                    label: "道具图片",
                    url: "https://example.com/rifle-a.png",
                  },
                ],
              },
              {
                taskId: "asset-image-prop-1-b",
                status: "completed",
                promptPreview: "第二次：补强枪身细节与枪托磨损。",
                selectedModelId: "tnb-fast",
                aspectRatio: "16:9",
                resolution: "2K",
                creditCost: 70,
                createdAt: "2026-05-30 09:31:30",
                selectionContext: {
                  assetTab: "prop",
                  selectedAssetId: "prop-1",
                  selectedAssetName: "制式步枪",
                },
                fixedImages: [
                  {
                    id: "prop-image-b",
                    label: "道具图片",
                    url: "https://example.com/rifle-b.png",
                  },
                ],
              },
            ],
          },
        }),
      },
    });

    assert.equal((html.match(/class="episode-replica-message-row user"/g) ?? []).length, 2);
    assert.equal((html.match(/class="episode-replica-fixed-image-card"/g) ?? []).length, 2);
    assert.match(html, /asset-image-prop-1-a/);
    assert.match(html, /asset-image-prop-1-b/);
    assert.ok(html.indexOf("第一次：生成基础枪械外观。") < html.indexOf("第二次：补强枪身细节与枪托磨损。"));
    assert.equal((html.match(/data-task-id="asset-image-prop-1-a"/g) ?? []).length > 0, true);
    assert.equal((html.match(/data-task-id="asset-image-prop-1-b"/g) ?? []).length > 0, true);
    assert.doesNotMatch(html, />文字改图</);
    assert.doesNotMatch(html, />画笔</);
    assert.doesNotMatch(html, />全景</);
    assert.match(html, />重新编辑</);
    assert.match(html, />下载</);
    assert.match(html, />删除</);
  });

  it("renders backend failure display messages in asset generation conversations", () => {
    const html = renderProductionWorkbench({
      state: {
        ...buildProjectState(),
        shots: [],
      },
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          selectedEpisodeId: "episode-new",
          projectAssetTab: "character",
          museScopeMode: "assets",
          selectedEpisodeCardId: "character-1",
          selectedEpisodeAssetId: "character-1",
          importedAssets: {
            character: [
              {
                id: "character-1",
                name: "白野",
                description: "一位约28岁的中国男性。",
                previewUrl: "",
              },
            ],
            scene: [],
            prop: [],
          },
          imageGenerationResult: {
            taskId: "asset-image-failed-1",
            status: "failed",
            failureCode: "task_timeout",
            failure: {
              failureCode: "task_timeout",
              noticeType: "error",
              displayMessage: "生成任务超过 15 分钟未完成，已自动标记失败并返还积分。",
            },
            promptPreview: "一位约28岁的中国男性。",
            selectedModelId: "gpt-image-2-cn",
            aspectRatio: "16:9",
            resolution: "2K",
            creditCost: 50,
            selectionContext: {
              assetTab: "character",
              selectedAssetId: "character-1",
              selectedAssetName: "白野",
            },
            fixedImages: [],
          },
          assetConversationHistory: {
            "image:character-1": [
              {
                taskId: "asset-image-failed-1",
                status: "failed",
                failureCode: "task_timeout",
                failure: {
                  failureCode: "task_timeout",
                  noticeType: "error",
                  displayMessage: "生成任务超过 15 分钟未完成，已自动标记失败并返还积分。",
                },
                promptPreview: "一位约28岁的中国男性。",
                selectedModelId: "gpt-image-2-cn",
                aspectRatio: "16:9",
                resolution: "2K",
                creditCost: 50,
                selectionContext: {
                  assetTab: "character",
                  selectedAssetId: "character-1",
                  selectedAssetName: "白野",
                },
                fixedImages: [],
              },
            ],
          },
        }),
      },
    });

    assert.match(html, /状态：失败/);
    assert.match(html, /生成任务超过 15 分钟未完成，已自动标记失败并返还积分。/);
    assert.match(html, /episode-replica-task-failure/);
  });

  it("renders repeated storyboard generation conversations as a vertical history list", () => {
    const state = buildProjectState();
    const storyboards = createStoryboardList(state);
    const storyboardId = storyboards[0]?.id ?? "storyboard-1";
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          selectedEpisodeId: "episode-primary",
          museScopeMode: "storyboard",
          episodeMediaMode: "video",
          selectedStoryboard: storyboards[0],
          selectedStoryboardId: storyboardId,
          storyboards,
          episodeStoryboardMap: {
            "episode-primary": storyboards,
          },
          storyboardConversationHistory: {
            [`video:${storyboardId}`]: [
              {
                storyboardId,
                mediaKind: "video",
                taskId: "storyboard-video-task-a",
                status: "completed",
                promptPreview: "第一次视频生成：镜头缓慢推进。",
                selectedModelId: "vidu-q3-pro",
                createdAt: "2026-06-02 10:01:00",
                attachmentItems: [
                  {
                    id: "audio-ref-1",
                    type: "audio",
                    kind: "audio",
                    name: "对白音频 1",
                    audioUrl: "data:audio/wav;base64,UklGRg==",
                  },
                ],
                fixedVideos: [
                  {
                    id: "video-a",
                    label: "分镜视频",
                    url: "https://example.com/storyboard-a.mp4",
                  },
                ],
              },
              {
                storyboardId,
                mediaKind: "video",
                taskId: "storyboard-video-task-b",
                status: "completed",
                promptPreview: "第二次视频生成：雨水更明显。",
                selectedModelId: "vidu-q3-pro",
                createdAt: "2026-06-02 10:02:00",
                fixedVideos: [
                  {
                    id: "video-b",
                    label: "分镜视频",
                    url: "https://example.com/storyboard-b.mp4",
                  },
                ],
              },
            ],
          },
        }),
      },
    });

    assert.match(html, /episode-replica-storyboard-conversation-list/);
    assert.doesNotMatch(html, /data-action="select-storyboard-conversation-turn"/);
    assert.match(html, /storyboard-video-task-a/);
    assert.match(html, /storyboard-video-task-b/);
    assert.match(html, /episode-replica-user-ref-chip audio/);
    assert.match(html, /第一次视频生成：镜头缓慢推进。/);
    assert.match(html, /第二次视频生成：雨水更明显。/);
    assert.ok(html.indexOf("第一次视频生成：镜头缓慢推进。") < html.indexOf("第二次视频生成：雨水更明显。"));
  });

  it("prefills the composer with prior storyboard prompt, audio and images when editing a result", async () => {
    const storyboard = {
      ...addStoryboard([])[0],
      id: "storyboard-edit-1",
      generationState: {
        prompt: "",
        quickReferenceItems: [],
      },
    };
    const workbench = {
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        selectedEpisodeId: "episode-primary",
        museScopeMode: "storyboard",
        episodeMediaMode: "video",
        selectedStoryboardId: storyboard.id,
        storyboards: [storyboard],
        episodeStoryboardMap: {
          "episode-primary": [storyboard],
        },
        prompt: "",
        episodeWorkbenchAttachments: [],
        episodeWorkbenchSelectedAttachmentIds: [],
        storyboardConversationHistory: {
          [`video:${storyboard.id}`]: [
            {
              storyboardId: storyboard.id,
              mediaKind: "video",
              taskId: "storyboard-edit-task-1",
              promptPreview: "上一轮视频文案，需要继续编辑。",
              quickReferenceItems: [
                {
                  id: "quick-image-1",
                  kind: "image",
                  name: "图片 1",
                  previewUrl: "https://example.com/ref-1.png",
                },
              ],
              attachmentItems: [
                {
                  id: "audio-1",
                  type: "audio",
                  kind: "audio",
                  name: "音频 1",
                  audioUrl: "data:audio/wav;base64,AAAA",
                },
                {
                  id: "attachment-image-1",
                  type: "image",
                  kind: "image",
                  name: "图片 2",
                  previewUrl: "https://example.com/ref-2.png",
                },
              ],
            },
          ],
        },
      }),
      state: {
        ...buildProjectState(),
        projectDetail: {
          project: { id: "project-1", projectId: "project-1", name: "try" },
          episodes: [
            {
              id: "10000000-0000-4000-8000-000000000001",
              title: "真实剧集",
              status: "draft",
              storyboardCount: 1,
            },
          ],
          shots: [],
        },
      },
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "episode-result-action",
        resultAction: "edit",
        mediaKind: "video",
        taskId: "storyboard-edit-task-1",
      },
    });

    assert.equal(workbench.ui.prompt, "上一轮视频文案，需要继续编辑。");
    assert.equal(workbench.ui.episodeWorkbenchAttachments.length, 1);
    assert.equal(workbench.ui.episodeWorkbenchAttachments[0].kind, "audio");
    assert.equal(workbench.ui.episodeWorkbenchSelectedAttachmentIds.length, 1);
    const updatedStoryboard = workbench.ui.storyboards[0];
    assert.equal(updatedStoryboard.generationState.prompt, "上一轮视频文案，需要继续编辑。");
    assert.equal(updatedStoryboard.generationState.quickReferenceItems.length, 2);
    assert.equal(updatedStoryboard.generationState.quickReferenceItems[0].previewUrl, "https://example.com/ref-1.png");
    assert.equal(updatedStoryboard.generationState.quickReferenceItems[1].previewUrl, "https://example.com/ref-2.png");
  });

  it("deletes only the selected storyboard conversation turn from history and backend", async () => {
    const calls = [];
    const storyboards = addStoryboard([]).map((storyboard) => ({
      ...storyboard,
      id: "storyboard-10000000-0000-4000-8000-000000000777",
    }));
    const deletedEntry = {
      storyboardId: storyboards[0].id,
      mediaKind: "video",
      taskId: "storyboard-video-task-delete",
      promptPreview: "删除这一条。",
    };
    const remainingEntry = {
      storyboardId: storyboards[0].id,
      mediaKind: "video",
      taskId: "storyboard-video-task-keep",
      promptPreview: "保留这一条。",
    };
    const workbench = {
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        selectedEpisodeId: "10000000-0000-4000-8000-000000000001",
        museScopeMode: "storyboard",
        episodeMediaMode: "video",
        selectedStoryboardId: storyboards[0].id,
        storyboards,
        storyboardConversationHistory: {
          [`video:${storyboards[0].id}`]: [deletedEntry, remainingEntry],
        },
        videoGenerationResult: deletedEntry,
      }),
      state: {
        ...buildProjectState(),
        projectDetail: {
          project: { id: "project-1", projectId: "project-1", name: "try" },
          episodes: [
            {
              id: "10000000-0000-4000-8000-000000000001",
              title: "真实剧集",
              status: "draft",
              storyboardCount: 1,
            },
          ],
          shots: [],
        },
      },
      api: {
        async deleteStoryboardConversationTurn(episodeId, storyboardId, taskId, mediaMode) {
          calls.push({ episodeId, storyboardId, taskId, mediaMode });
          return { deleted: true, entries: [remainingEntry] };
        },
      },
      root: {
        innerHTML: "",
        querySelector(selector) {
          if (selector !== ".episode-replica-stage-body") {
            return null;
          }
          return {
            innerHTML: "",
          };
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "episode-result-action",
        resultAction: "delete",
        mediaKind: "video",
        taskId: "storyboard-video-task-delete",
      },
    });

    assert.deepEqual(calls, [
      {
        episodeId: "10000000-0000-4000-8000-000000000001",
        storyboardId: "10000000-0000-4000-8000-000000000777",
        taskId: "storyboard-video-task-delete",
        mediaMode: "video",
      },
    ]);
    assert.deepEqual(workbench.ui.storyboardConversationHistory[`video:${storyboards[0].id}`], [remainingEntry]);
    assert.equal(workbench.ui.videoGenerationResult?.taskId, "storyboard-video-task-keep");
  });

  it("sets storyboard video into the selected tab and keeps it after storyboard reload", async () => {
    const storyboardId = "10000000-0000-4000-8000-000000000777";
    const episodeId = "10000000-0000-4000-8000-000000000001";
    const persistedVideoId = "20000000-0000-4000-8000-000000000111";
    const persistedVideoUrl = "/uploads/storage/persisted-storyboard-video.mp4";
    const persistedThumbnailUrl = "/uploads/storage/persisted-storyboard-video.jpg";
    const listCalls = [];
    const setCalls = [];
    const storyboards = addStoryboard([]).map((storyboard) => ({
      ...storyboard,
      id: storyboardId,
      linkedShotId: "shot-777",
      episodeId,
      uploadedVideos: [
        {
          id: persistedVideoId,
          assetVersionId: persistedVideoId,
          storageObjectId: "storage-video-1",
          src: "/uploads/storage/stale-storyboard-video.mp4",
          thumbnailSrc: "/uploads/storage/stale-storyboard-video.jpg",
          status: "ready",
        },
      ],
      selectedUploadedVideoId: null,
      currentVideoAssetVersionId: null,
      previewVideo: null,
      previewThumbnailUrl: null,
      videoStatus: "empty",
    }));
    const workbench = {
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        selectedEpisodeId: episodeId,
        museScopeMode: "storyboard",
        episodeMediaMode: "video",
        selectedStoryboardId: storyboardId,
        storyboards,
        selectedStoryboard: storyboards[0],
        episodeStoryboardMap: {
          [episodeId]: storyboards,
        },
        storyboardConversationHistory: {
          [`video:${storyboardId}`]: [
            {
              storyboardId,
              mediaKind: "video",
              taskId: "storyboard-video-task-set",
              promptPreview: "把这一条设成分镜视频。",
              result: {
                assetVersionId: persistedVideoId,
                storageObjectId: "storage-video-1",
                videoUrl: "/uploads/storage/generated-storyboard-video.mp4",
                thumbnailUrl: "/uploads/storage/generated-storyboard-video.jpg",
              },
            },
          ],
        },
        videoGenerationResult: {
          storyboardId,
          mediaKind: "video",
          taskId: "storyboard-video-task-set",
          result: {
            assetVersionId: persistedVideoId,
            storageObjectId: "storage-video-1",
            videoUrl: "/uploads/storage/generated-storyboard-video.mp4",
            thumbnailUrl: "/uploads/storage/generated-storyboard-video.jpg",
          },
        },
      }),
      state: {
        ...buildProjectState(),
        projectDetail: {
          project: { id: "project-1", projectId: "project-1", name: "try" },
          episodes: [
            {
              id: episodeId,
              title: "真实剧集",
              status: "draft",
              storyboardCount: 1,
            },
          ],
          shots: [],
        },
      },
      api: {
        async setStoryboardVideo(requestEpisodeId, requestStoryboardId, payload) {
          setCalls.push({ requestEpisodeId, requestStoryboardId, payload });
          return {
            storyboard: {
              currentVideoFileId: persistedVideoId,
              currentVideoUrl: persistedVideoUrl,
              currentVideoThumbnailUrl: persistedThumbnailUrl,
            },
            file: {
              sourceUrl: persistedVideoUrl,
              thumbnailUrl: persistedThumbnailUrl,
              storageObjectId: "storage-video-1",
            },
          };
        },
        async listStoryboards(requestEpisodeId) {
          listCalls.push(requestEpisodeId);
          return {
            items: [
              {
                storyboardId,
                episodeId,
                linkedShotId: "shot-777",
                shotId: "shot-777",
                indexNo: 1,
                plotPreview: "1",
                sceneAnalysis: "第一条分镜",
                currentVideoFileId: persistedVideoId,
                currentVideoUrl: persistedVideoUrl,
                currentVideoThumbnailUrl: persistedThumbnailUrl,
                videoStatus: "succeeded",
              },
            ],
          };
        },
      },
      root: {
        innerHTML: "",
        querySelector(selector) {
          if (selector !== ".episode-replica-stage-body") {
            return null;
          }
          return {
            innerHTML: "",
          };
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "episode-result-action",
        resultAction: "set-storyboard-video",
        mediaKind: "video",
        taskId: "storyboard-video-task-set",
      },
    });

    assert.deepEqual(setCalls, [
      {
        requestEpisodeId: episodeId,
        requestStoryboardId: storyboardId,
        payload: {
          assetVersionId: persistedVideoId,
          storageObjectId: "storage-video-1",
          sourceUrl: "/uploads/storage/generated-storyboard-video.mp4",
          thumbnailUrl: "/uploads/storage/generated-storyboard-video.jpg",
        },
      },
    ]);
    assert.deepEqual(listCalls, [episodeId]);
    assert.equal(workbench.ui.episodeStoryboardMap[episodeId][0].currentVideoAssetVersionId, persistedVideoId);
    assert.equal(workbench.ui.episodeStoryboardMap[episodeId][0].selectedUploadedVideoId, persistedVideoId);
    assert.equal(workbench.ui.episodeStoryboardMap[episodeId][0].description, "把这一条设成分镜视频。");
    assert.equal(workbench.ui.episodeStoryboardMap[episodeId][0].previewVideo, persistedVideoUrl);
    assert.equal(workbench.ui.episodeStoryboardMap[episodeId][0].previewThumbnailUrl, persistedThumbnailUrl);
    assert.equal(workbench.ui.episodeStoryboardMap[episodeId][0].uploadedVideos[0].src, persistedVideoUrl);
    assert.equal(workbench.ui.episodeStoryboardMap[episodeId][0].uploadedVideos[0].thumbnailSrc, persistedThumbnailUrl);

    const html = renderProductionWorkbench({
      state: workbench.state,
      session: { user: { phone: "+86 13800138000" } },
      ui: workbench.ui,
    });
    assert.match(html, new RegExp(`data-storyboard-id="${storyboardId}"`));
    assert.match(html, new RegExp(`<video\\s+src="${persistedVideoUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.match(html, new RegExp(`poster="${persistedThumbnailUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  });

  it("keeps the newly set storyboard video when a storyboard reload returns a stale previous video", async () => {
    const storyboardId = "10000000-0000-4000-8000-000000000777";
    const episodeId = "10000000-0000-4000-8000-000000000001";
    const oldVideoId = "20000000-0000-4000-8000-000000000000";
    const newVideoId = "20000000-0000-4000-8000-000000000111";
    const newVideoUrl = "/uploads/storage/new-storyboard-video.mp4";
    const newThumbnailUrl = "/uploads/storage/new-storyboard-video.jpg";
    const storyboards = addStoryboard([]).map((storyboard) => ({
      ...storyboard,
      id: storyboardId,
      linkedShotId: "shot-777",
      episodeId,
      uploadedVideos: [
        {
          id: oldVideoId,
          assetVersionId: oldVideoId,
          src: "/uploads/storage/old-storyboard-video.mp4",
          thumbnailSrc: "/uploads/storage/old-storyboard-video.jpg",
          status: "ready",
        },
        {
          id: newVideoId,
          assetVersionId: newVideoId,
          storageObjectId: "storage-video-new",
          src: "/uploads/storage/generated-storyboard-video.mp4",
          thumbnailSrc: "/uploads/storage/generated-storyboard-video.jpg",
          status: "ready",
        },
      ],
      selectedUploadedVideoId: oldVideoId,
      currentVideoAssetVersionId: oldVideoId,
      previewVideo: "/uploads/storage/old-storyboard-video.mp4",
      previewThumbnailUrl: "/uploads/storage/old-storyboard-video.jpg",
      videoStatus: "ready",
    }));
    const workbench = {
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        selectedEpisodeId: episodeId,
        museScopeMode: "storyboard",
        episodeMediaMode: "video",
        selectedStoryboardId: storyboardId,
        storyboards,
        selectedStoryboard: storyboards[0],
        episodeStoryboardMap: {
          [episodeId]: storyboards,
        },
        storyboardConversationHistory: {
          [`video:${storyboardId}`]: [
            {
              storyboardId,
              mediaKind: "video",
              taskId: "storyboard-video-task-set",
              result: {
                assetVersionId: newVideoId,
                storageObjectId: "storage-video-new",
                videoUrl: "/uploads/storage/generated-storyboard-video.mp4",
                thumbnailUrl: "/uploads/storage/generated-storyboard-video.jpg",
              },
            },
          ],
        },
        videoGenerationResult: {
          storyboardId,
          mediaKind: "video",
          taskId: "storyboard-video-task-set",
          result: {
            assetVersionId: newVideoId,
            storageObjectId: "storage-video-new",
            videoUrl: "/uploads/storage/generated-storyboard-video.mp4",
            thumbnailUrl: "/uploads/storage/generated-storyboard-video.jpg",
          },
        },
      }),
      state: {
        ...buildProjectState(),
        projectDetail: {
          project: { id: "project-1", projectId: "project-1", name: "try" },
          episodes: [{ id: episodeId, title: "真实剧集", status: "draft", storyboardCount: 1 }],
          shots: [],
        },
      },
      api: {
        async setStoryboardVideo() {
          return {
            storyboard: {
              currentVideoFileId: newVideoId,
              currentVideoUrl: newVideoUrl,
              currentVideoThumbnailUrl: newThumbnailUrl,
            },
            file: {
              sourceUrl: newVideoUrl,
              thumbnailUrl: newThumbnailUrl,
              storageObjectId: "storage-video-new",
            },
          };
        },
        async listStoryboards() {
          return {
            items: [
              {
                storyboardId,
                episodeId,
                linkedShotId: "shot-777",
                shotId: "shot-777",
                indexNo: 1,
                plotPreview: "1",
                sceneAnalysis: "第一条分镜",
                currentVideoFileId: oldVideoId,
                currentVideoUrl: "/uploads/storage/old-storyboard-video.mp4",
                currentVideoThumbnailUrl: "/uploads/storage/old-storyboard-video.jpg",
                videoStatus: "succeeded",
              },
            ],
          };
        },
      },
      root: {
        innerHTML: "",
        querySelector(selector) {
          if (selector !== ".episode-replica-stage-body") {
            return null;
          }
          return { innerHTML: "" };
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "episode-result-action",
        resultAction: "set-storyboard-video",
        mediaKind: "video",
        taskId: "storyboard-video-task-set",
      },
    });

    const updated = workbench.ui.episodeStoryboardMap[episodeId][0];
    assert.equal(updated.currentVideoAssetVersionId, newVideoId);
    assert.equal(updated.selectedUploadedVideoId, newVideoId);
    assert.equal(updated.previewVideo, newVideoUrl);
    assert.equal(updated.previewThumbnailUrl, newThumbnailUrl);
    assert.equal(
      updated.uploadedVideos.find((video) => video.id === newVideoId)?.src,
      newVideoUrl,
    );
  });

  it("binds generated storyboard video to the selected storyboard card preview frame", async () => {
    const episodeId = "episode-new";
    const selectedStoryboardId = "storyboard-selected-tab";
    const otherStoryboardId = "storyboard-other-tab";
    const generatedVideoId = "generated-video-selected";
    const generatedVideoUrl = "/uploads/storage/generated-selected-storyboard-video.mp4";
    const generatedThumbnailUrl = "/uploads/storage/generated-selected-storyboard-video.jpg";
    const [firstDraft, secondDraft] = addStoryboard(addStoryboard([]));
    const storyboards = [
      {
        ...firstDraft,
        id: otherStoryboardId,
        linkedShotId: "shot-other",
        episodeId,
        description: "不应该被绑定的视频分镜",
        uploadedVideos: [],
        selectedUploadedVideoId: null,
        currentVideoAssetVersionId: null,
        previewVideo: null,
        previewThumbnailUrl: null,
      },
      {
        ...secondDraft,
        id: selectedStoryboardId,
        linkedShotId: "shot-selected",
        episodeId,
        description: "当前选中的分镜",
        uploadedVideos: [],
        selectedUploadedVideoId: null,
        currentVideoAssetVersionId: null,
        previewVideo: null,
        previewThumbnailUrl: null,
      },
    ];
    const workbench = {
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        selectedEpisodeId: episodeId,
        museScopeMode: "storyboard",
        episodeMediaMode: "video",
        selectedStoryboardId,
        storyboards,
        selectedStoryboard: storyboards[1],
        episodeStoryboardMap: {
          [episodeId]: storyboards,
        },
        storyboardConversationHistory: {
          [`video:${selectedStoryboardId}`]: [
            {
              storyboardId: selectedStoryboardId,
              mediaKind: "video",
              taskId: "storyboard-video-task-selected",
              result: {
                assetVersionId: generatedVideoId,
                storageObjectId: "storage-video-selected",
                videoUrl: generatedVideoUrl,
                thumbnailUrl: generatedThumbnailUrl,
              },
            },
          ],
        },
        videoGenerationResult: {
          storyboardId: selectedStoryboardId,
          mediaKind: "video",
          taskId: "storyboard-video-task-selected",
          result: {
            assetVersionId: generatedVideoId,
            storageObjectId: "storage-video-selected",
            videoUrl: generatedVideoUrl,
            thumbnailUrl: generatedThumbnailUrl,
          },
        },
      }),
      state: {
        ...buildProjectState(),
        projectDetail: {
          project: { id: "project-1", projectId: "project-1", name: "try" },
          episodes: [{ id: episodeId, title: "真实剧集", status: "draft", storyboardCount: 2 }],
          shots: [],
        },
      },
      api: {},
      root: {
        innerHTML: "",
        querySelector(selector) {
          if (selector !== ".episode-replica-stage-body") {
            return null;
          }
          return { innerHTML: "" };
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "episode-result-action",
        resultAction: "set-storyboard-video",
        mediaKind: "video",
        taskId: "storyboard-video-task-selected",
      },
    });

    const updatedStoryboards = workbench.ui.episodeStoryboardMap[episodeId];
    const selected = updatedStoryboards.find((storyboard) => storyboard.id === selectedStoryboardId);
    const other = updatedStoryboards.find((storyboard) => storyboard.id === otherStoryboardId);
    assert.equal(selected.currentVideoAssetVersionId, generatedVideoId);
    assert.equal(selected.selectedUploadedVideoId, generatedVideoId);
    assert.equal(selected.previewVideo, generatedVideoUrl);
    assert.equal(other.previewVideo, null);

    const html = renderProductionWorkbench({
      state: workbench.state,
      session: { user: { phone: "+86 13800138000" } },
      ui: workbench.ui,
    });
    const selectedCardStart = html.indexOf(`data-storyboard-id="${selectedStoryboardId}"`);
    const selectedCardEnd = html.indexOf("</article>", selectedCardStart);
    const selectedCardHtml = html.slice(selectedCardStart, selectedCardEnd);
    const otherCardStart = html.indexOf(`data-storyboard-id="${otherStoryboardId}"`);
    const otherCardEnd = html.indexOf("</article>", otherCardStart);
    const otherCardHtml = html.slice(otherCardStart, otherCardEnd);

    assert.match(selectedCardHtml, /<span class="preview-title">分镜剧情<\/span>/);
    assert.match(selectedCardHtml, /episode-replica-shot-video-preview active/);
    assert.match(selectedCardHtml, new RegExp(`src="${generatedVideoUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.match(selectedCardHtml, new RegExp(`poster="${generatedThumbnailUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.doesNotMatch(otherCardHtml, /episode-replica-shot-video-preview active/);
  });

  it("renders imported assets in the library after import", () => {
    const state = buildProjectState();
    const storyboards = createStoryboardList(state);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "workspace",
          projectInteriorSection: "assets",
          projectAssetTab: "character",
          storyboards,
          selectedStoryboard: storyboards[0],
          importedAssets: {
            character: [
              {
                id: "imported-character-1",
                name: "asset-character-a",
                preview: "data:image/svg+xml;charset=UTF-8,test-character",
                source: "local",
              },
            ],
            scene: [],
            prop: [],
            other: { image: [], video: [] },
          },
        }),
      },
    });

    assert.match(html, /imported-asset-card/);
    assert.match(html, /test-character/);
    assert.doesNotMatch(html, /asset-library-empty-card/);
  });

  it("resolves imported asset preview images against the backend origin after refresh", () => {
    const previousWindow = globalThis.window;
    globalThis.window = {
      location: {
        protocol: "http:",
        host: "127.0.0.1:4173",
        port: "4173",
        origin: "http://127.0.0.1:4173",
      },
    };

    try {
      const state = buildProjectState();
      const storyboards = createStoryboardList(state);
      const html = renderProductionWorkbench({
        state,
        session: { user: { phone: "+86 13800138000" } },
        ui: {
          ...buildProjectUi({
            projectPanelMode: "workspace",
            projectInteriorSection: "assets",
            projectAssetTab: "character",
            storyboards,
            selectedStoryboard: storyboards[0],
            importedAssets: {
              character: [
                {
                  id: "imported-character-1",
                  name: "asset-character-a",
                  preview: "/uploads/test-character.png",
                  source: "local",
                },
              ],
              scene: [],
              prop: [],
              other: { image: [], video: [] },
            },
          }),
        },
      });

      assert.match(html, /http:\/\/127\.0\.0\.1:4310\/uploads\/test-character\.png/);
    } finally {
      globalThis.window = previousWindow;
    }
  });

  it("shows the return hint and highlight when import finishes on an asset tab", () => {
    const state = buildProjectState();
    const storyboards = createStoryboardList(state);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "workspace",
          projectInteriorSection: "assets",
          projectAssetTab: "scene",
          storyboards,
          selectedStoryboard: storyboards[0],
          assetLibraryHighlightAssetIds: ["scene-asset-1"],
          assetLibraryHighlightKind: "scene",
          assetLibraryHighlightMediaType: "image",
          assetLibraryHighlightMessage: "已返回场景资产库，并定位到刚导入的 1 项。",
          importedAssets: {
            character: [],
            scene: [
              {
                id: "scene-asset-1",
                kind: "scene",
                name: "city-night",
                preview: "data:image/svg+xml;charset=UTF-8,scene-preview",
              },
            ],
            prop: [],
            other: { image: [], video: [] },
          },
        }),
      },
    });

    assert.match(html, /asset-library-return-note/);
    assert.match(html, /已返回场景资产库，并定位到刚导入的 1 项。/);
    assert.match(html, /data-imported-asset-id="scene-asset-1"/);
    assert.match(html, /just-imported/);
    assert.match(html, /tabindex="-1"/);
  });

  it("renders selectable official assets in the import modal", () => {
    const state = buildProjectState();
    const storyboards = createStoryboardList(state);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "workspace",
          projectInteriorSection: "assets",
          projectAssetTab: "character",
          storyboards,
          selectedStoryboard: storyboards[0],
          assetImportModal: "character",
          assetImportModalTab: "official",
          assetImportCategory: "domestic-modern-city",
          assetImportSelection: ["official-character-1"],
          assetImportOfficialAssets: [
            {
              id: "official-character-1",
              name: "official-character-a",
              preview: "data:image/svg+xml;charset=UTF-8,official-character",
            },
          ],
        }),
      },
    });

    assert.match(html, /data-action="toggle-official-asset-import"/);
    assert.match(html, /data-asset-id="official-character-1"/);
    assert.match(html, /official-character/);
    assert.match(html, /data-action="confirm-asset-import"/);
  });

  it("shows episode-scoped assets inside the episode workbench import modal", () => {
    const state = buildProjectState();
    const storyboards = createStoryboardList(state);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          selectedEpisodeId: "episode-2",
          projectAssetTab: "scene",
          storyboards,
          selectedStoryboard: storyboards[0],
          assetImportModal: "scene",
          assetImportModalTab: "official",
          assetImportCategory: "domestic-modern-city",
          assetImportSelection: ["episode-scene-1"],
          importedAssets: {
            character: [],
            scene: [
              {
                id: "episode-scene-1",
                name: "当前剧集场景",
                preview: "data:image/svg+xml;charset=UTF-8,episode-scene-preview",
              },
            ],
            prop: [],
            other: { image: [], video: [] },
          },
          assetImportOfficialAssets: [
            {
              id: "official-scene-1",
              name: "北城废墟",
              preview: "data:image/svg+xml;charset=UTF-8,fixture-scene-preview",
            },
          ],
        }),
      },
    });

    assert.match(html, /data-asset-id="episode-scene-1"/);
    assert.match(html, /当前剧集场景/);
    assert.match(html, /episode-scene-preview/);
    assert.doesNotMatch(html, /fixture-scene-preview/);
  });

  it("shows an empty state instead of fixture placeholders when the real scene library is empty", () => {
    const state = {
      project: {
        id: "project-1",
        name: "剧集工台资产库",
        phase: "asset_review",
        aspectRatio: "16:9",
        resolution: "2K",
      },
      shots: [],
      exportPreview: null,
    };
    const storyboards = createStoryboardList(state);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        projectPanelMode: "episode-workbench",
        selectedEpisodeId: "episode-2",
        projectAssetTab: "scene",
        storyboards,
        selectedStoryboard: storyboards[0],
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        isCreateModalOpen: false,
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
        assetImportModal: "scene",
        assetImportModalTab: "official",
        assetImportCategory: "domestic-modern-city",
        assetImportSelection: [],
        assetImportOfficialAssets: [],
        projectLibraryAssetsByType: {
          character: [],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
        importedAssets: {
          character: [],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
        projectDetail: {
          assetsByType: {
            character: [],
            scene: [
              {
                id: "project-scene-should-not-render",
                label: "项目内旧场景",
                previewUrl: "data:image/svg+xml;charset=UTF-8,project-scene-should-not-render",
              },
            ],
            prop: [],
          },
        },
      },
    });

    assert.match(html, /episode-asset-library-empty/);
    assert.match(html, /暂无数据/);
    assert.doesNotMatch(html, /project-scene-should-not-render/);
    assert.doesNotMatch(html, /项目内旧场景/);
    assert.doesNotMatch(html, /fixture-scene-preview/);
    assert.doesNotMatch(html, /北城废墟/);
  });

  it("imports a selected episode asset into the matching tab and refreshes episode assets from backend", async () => {
    const calls = [];
    const storyboards = createStoryboardList(buildProjectState());
    const workbench = {
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        selectedEpisodeId: "episode-2",
        projectAssetTab: "scene",
        storyboards,
        selectedStoryboard: storyboards[0],
        assetImportModal: "scene",
        assetImportModalTab: "official",
        assetImportSelection: ["episode-scene-1"],
        importedAssets: {
          character: [],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
        assetImportOfficialAssets: [
          {
            id: "episode-scene-1",
            name: "黑山外露营地",
            preview: "data:image/svg+xml;charset=UTF-8,episode-scene-preview",
            source: "library",
          },
        ],
      }),
      state: {
        ...buildProjectState(),
        projectDetail: {
          project: { id: "project-1", projectId: "project-1", name: "try" },
          episodes: [
            {
              id: "episode-2",
              title: "真实剧集",
              status: "draft",
              storyboardCount: 1,
            },
          ],
          shots: [],
        },
      },
      api: {
        async importEpisodeAsset(episodeId, payload) {
          calls.push({ episodeId, payload });
          return {
            asset: {
              id: "imported-scene-1",
            },
          };
        },
        async getEpisodeWorkbench() {
          return {
            data: {
              assetsByType: {
                character: [],
                scene: [
                  {
                    assetId: "imported-scene-1",
                    name: "黑山外露营地",
                    previewUrl: "https://example.com/scene-final.png",
                    description: "营地场景",
                  },
                ],
                prop: [],
              },
            },
          };
        },
      },
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "confirm-asset-import",
      },
    });

    assert.deepEqual(calls, [
      {
        episodeId: "episode-2",
        payload: {
          assetType: "scene",
          name: "黑山外露营地",
          uploadSessionId: null,
          storageObjectId: null,
          storageObjectKey: "data:image/svg+xml;charset=UTF-8,episode-scene-preview",
          sourceUrl: "data:image/svg+xml;charset=UTF-8,episode-scene-preview",
          mimeType: "image/svg+xml",
          width: 240,
          height: 240,
          source: "library",
        },
      },
    ]);
    assert.equal(workbench.ui.importedAssets.scene[0]?.name, "黑山外露营地");
    assert.equal(workbench.ui.assetImportModal, null);
    assert.equal(workbench.ui.toast, "已导入 1 项场景到当前剧集。");
  });

  it("blocks episode asset import when an asset with the same name already exists", async () => {
    const calls = [];
    const storyboards = createStoryboardList(buildProjectState());
    const workbench = {
      ui: buildProjectUi({
        projectPanelMode: "episode-workbench",
        selectedEpisodeId: "episode-2",
        projectAssetTab: "scene",
        storyboards,
        selectedStoryboard: storyboards[0],
        assetImportModal: "scene",
        assetImportModalTab: "official",
        assetImportSelection: ["episode-scene-1"],
        importedAssets: {
          character: [],
          scene: [
            {
              id: "existing-scene-1",
              name: "黑山外露营地",
              preview: "https://example.com/existing-scene.png",
              kind: "scene",
            },
          ],
          prop: [],
          other: { image: [], video: [] },
        },
        assetImportOfficialAssets: [
          {
            id: "episode-scene-1",
            name: "黑山外露营地",
            preview: "data:image/svg+xml;charset=UTF-8,episode-scene-preview",
            source: "library",
          },
        ],
      }),
      state: {
        ...buildProjectState(),
        projectDetail: {
          project: { id: "project-1", projectId: "project-1", name: "try" },
          episodes: [
            {
              id: "episode-2",
              title: "真实剧集",
              status: "draft",
              storyboardCount: 1,
            },
          ],
          shots: [],
        },
      },
      api: {
        async importEpisodeAsset(episodeId, payload) {
          calls.push({ episodeId, payload });
          return { asset: { id: "should-not-happen" } };
        },
      },
      root: {
        innerHTML: "",
        querySelector() {
          return null;
        },
      },
    };

    await handleWorkbenchActionForTest(workbench, {
      dataset: {
        action: "confirm-asset-import",
      },
    });

    assert.deepEqual(calls, []);
    assert.equal(workbench.ui.toast, "已存在该资源图片");
    assert.equal(workbench.ui.assetImportModal, "scene");
  });

  it("renders the episode overview with both creation entry points in the overview", () => {
    const state = {
      ...buildProjectState(),
      shots: [],
    };

    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "workspace",
          projectInteriorSection: "overview",
          storyboards: [],
          selectedStoryboard: null,
        }),
      },
    });

    assert.ok(html.includes(`data-section="episodes"`));
    assert.match(html, /episode-inline-link/);
    assert.match(html, /data-action="open-single-episode-flow"/);
    assert.match(html, /data-action="open-batch-episode-flow"/);
    assert.match(html, /data-action="open-single-episode-flow"/);
    assert.match(html, /data-action="open-batch-episode-flow"/);
  });

  it("renders the episode creation hub when there are no episodes yet", () => {
    const state = {
      ...buildProjectState(),
      shots: [],
    };

    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "workspace",
          projectInteriorSection: "episodes",
          storyboards: [],
          selectedStoryboard: null,
        }),
      },
    });

    assert.match(html, /episode-hub-shell empty/);
    assert.match(html, /episode-hub-shell empty/);
    assert.match(html, /episode-launch-card single/);
    assert.match(html, /data-action="open-batch-episode-flow"/);
    assert.match(html, /data-action="open-single-episode-flow"/);
  });

  it("renders a naming modal for single creation and upload modal for batch creation", () => {
    const state = {
      ...buildProjectState(),
      shots: [],
    };

    const singleEpisodeHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "workspace",
          projectInteriorSection: "episodes",
          storyboards: [],
          selectedStoryboard: null,
          isSingleEpisodeModalOpen: true,
          singleEpisodeScript: "EP",
        }),
      },
    });

    assert.match(singleEpisodeHtml, /single-episode-modal/);
    assert.match(singleEpisodeHtml, /id="single-episode-script-input"/);
    assert.match(singleEpisodeHtml, /data-action="confirm-single-episode"/);
    assert.match(singleEpisodeHtml, /data-action="create-empty-single-episode"/);

    const batchEpisodeHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "workspace",
          projectInteriorSection: "episodes",
          storyboards: [],
          selectedStoryboard: null,
          isScriptModalOpen: true,
          scriptTab: "script-upload",
          scriptSubmitAction: "confirm-batch-episode",
        }),
      },
    });

    assert.match(batchEpisodeHtml, /script-upload/);
    assert.match(batchEpisodeHtml, /data-action="confirm-batch-episode"/);
  });

});

describe("storyboard state", () => {
  it("renders single-episode naming modal and sorts custom episodes newest first", () => {
    const state = {
      project: {
        id: "project-1",
        name: "try",
        phase: "not_started",
        aspectRatio: "9:16",
        resolution: "1080p",
        createdAt: "2026/05/20",
      },
      shots: [],
    };

    const modalHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        projectPanelMode: "workspace",
        projectInteriorSection: "episodes",
        storyboards: [],
        selectedStoryboard: null,
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        isSingleEpisodeModalOpen: true,
        singleEpisodeScript: "EP",
      },
    });

    assert.match(modalHtml, /single-episode-modal/);
    assert.match(modalHtml, /id="single-episode-script-input"/);
    assert.match(modalHtml, /data-action="confirm-single-episode"/);
    assert.match(modalHtml, /AI 智能分镜/);
    assert.ok(modalHtml.includes("2/5000"));

    const listHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        projectPanelMode: "workspace",
        projectInteriorSection: "episodes",
        storyboards: [],
        selectedStoryboard: null,
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        validationMessage: "",
        toast: "",
        isScriptModalOpen: true,
        scriptTab: "script-upload",
        scriptSubmitAction: "confirm-batch-episode",
        customEpisodes: [
          {
            id: "episode-older",
            title: "Older Episode",
            status: "Draft",
            createdAt: "2026/05/21",
            createdAtMs: Date.parse("2026-05-21T08:00:00.000Z"),
            storyboardCount: 0,
          },
          {
            id: "episode-newer",
            title: "Newer Episode",
            status: "Draft",
            createdAt: "2026/05/22",
            createdAtMs: Date.parse("2026-05-22T08:00:00.000Z"),
            storyboardCount: 0,
          },
        ],
      },
    });

    assert.match(listHtml, /data-action="confirm-batch-episode"/);
    assert.ok(listHtml.indexOf("Newer Episode") < listHtml.indexOf("Older Episode"));
  });

  it("adds storyboard 3 with draft status", () => {
    const next = addStoryboard([
      {
        id: "storyboard-1",
        index: 1,
        title: "1",
        status: "draft",
        imageStatus: "empty",
        videoStatus: "empty",
      },
      {
        id: "storyboard-2",
        index: 2,
        title: "2",
        status: "draft",
        imageStatus: "empty",
        videoStatus: "empty",
      },
    ]);

    assert.equal(next.length, 3);
    assert.equal(next[2].id, "storyboard-3");
    assert.equal(next[2].title, "3");
  });

  it("appends a new storyboard after the highest existing storyboard number", () => {
    const next = addStoryboard([
      {
        id: "storyboard-1",
        index: 1,
        title: "1",
        status: "draft",
        imageStatus: "empty",
        videoStatus: "empty",
      },
      {
        id: "storyboard-2",
        index: 2,
        title: "2",
        status: "draft",
        imageStatus: "empty",
        videoStatus: "empty",
      },
      {
        id: "storyboard-4",
        index: 4,
        title: "4",
        status: "ready",
        imageStatus: "ready",
        videoStatus: "empty",
      },
    ]);

    assert.equal(next.length, 4);
    assert.equal(next[2].id, "storyboard-4");
    assert.equal(next[2].title, "3");
    assert.equal(next[3].id, "storyboard-5");
    assert.equal(next[3].title, "4");
  });

  it("sorts storyboards by sequence/index when backend shots arrive out of order", () => {
    const state = {
      shots: [
        {
          id: "shot-7",
          title: "Shot 007",
          description: "7",
          sequence: 7,
          sortOrder: 6,
          currentImageAssetVersionId: null,
          currentVideoAssetVersionId: null,
        },
        {
          id: "shot-1-b",
          title: "Shot 001-B",
          description: "1b",
          sequence: 1,
          sortOrder: 1,
          currentImageAssetVersionId: null,
          currentVideoAssetVersionId: null,
        },
        {
          id: "shot-4",
          title: "Shot 004",
          description: "4",
          sequence: 4,
          sortOrder: 4,
          currentImageAssetVersionId: null,
          currentVideoAssetVersionId: null,
        },
        {
          id: "shot-1-a",
          title: "Shot 001-A",
          description: "1a",
          sequence: 1,
          sortOrder: 0,
          currentImageAssetVersionId: null,
          currentVideoAssetVersionId: null,
        },
      ],
    };

    const storyboards = createStoryboardList(state);

    assert.deepEqual(
      storyboards.map((storyboard) => storyboard.linkedShotId),
      ["shot-1-a", "shot-1-b", "shot-4", "shot-7"],
    );
    assert.deepEqual(
      sortStoryboardsByIndex([
        { id: "storyboard-7", index: 7 },
        { id: "storyboard-1-b", index: 1, linkedShotId: "shot-1-b" },
        { id: "storyboard-4", index: 4 },
        { id: "storyboard-1-a", index: 1, linkedShotId: "shot-1-a" },
      ]).map((storyboard) => storyboard.id),
      ["storyboard-1-a", "storyboard-1-b", "storyboard-4", "storyboard-7"],
    );
  });

  it("renumbers storyboard indices after inserting a new local storyboard", () => {
    const normalized = normalizeStoryboardIndices([
      {
        id: "storyboard-a",
        index: 1,
        title: "1",
        linkedShotId: "shot-a",
      },
      {
        id: "storyboard-b",
        index: 1,
        title: "1",
        linkedShotId: "shot-b",
      },
      {
        id: "storyboard-c",
        index: 2,
        title: "2",
        linkedShotId: "shot-c",
      },
    ]);

    assert.deepEqual(
      normalized.map((storyboard) => ({ id: storyboard.id, index: storyboard.index, title: storyboard.title })),
      [
        { id: "storyboard-a", index: 1, title: "1" },
        { id: "storyboard-b", index: 2, title: "2" },
        { id: "storyboard-c", index: 3, title: "3" },
      ],
    );
  });

  it("inserts a new storyboard after the anchor and renumbers following cards", () => {
    const base = [
      { ...addStoryboard([])[0], id: "storyboard-a", index: 1, title: "1" },
      { ...addStoryboard([])[0], id: "storyboard-b", index: 2, title: "2" },
      { ...addStoryboard([])[0], id: "storyboard-c", index: 3, title: "3" },
    ];

    const next = insertStoryboardAfter(base, "storyboard-b");

    assert.equal(next.length, 4);
    assert.equal(next[1].id, "storyboard-b");
    assert.equal(next[2].index, 3);
    assert.equal(next[3].index, 4);
  });

  it("appends backend-created storyboards while preserving local storyboard state", () => {
    const current = [
      {
        id: "storyboard-1",
        index: 1,
        title: "1",
        status: "draft",
        imageStatus: "empty",
        videoStatus: "empty",
        linkedShotId: "shot-1",
        uploadedVideos: [{ id: "local-video-1" }],
        selectedUploadedVideoId: "local-video-1",
      },
      {
        id: "storyboard-2",
        index: 2,
        title: "2",
        status: "draft",
        imageStatus: "empty",
        videoStatus: "empty",
        linkedShotId: "shot-2",
      },
    ];
    const next = [
      {
        id: "storyboard-1",
        index: 1,
        title: "1",
        status: "draft",
        imageStatus: "ready",
        videoStatus: "empty",
        linkedShotId: "shot-1",
      },
      {
        id: "storyboard-2",
        index: 2,
        title: "2",
        status: "draft",
        imageStatus: "empty",
        videoStatus: "empty",
        linkedShotId: "shot-2",
      },
      {
        id: "storyboard-3",
        index: 3,
        title: "3",
        status: "draft",
        imageStatus: "empty",
        videoStatus: "empty",
        linkedShotId: "shot-3",
      },
    ];

    const merged = syncStoryboards(current, next);

    assert.equal(merged.length, 3);
    assert.equal(merged[0].imageStatus, "ready");
    assert.equal(merged[0].uploadedVideos.length, 1);
    assert.equal(merged[0].selectedUploadedVideoId, "local-video-1");
    assert.equal(merged[2].id, "storyboard-3");
  });

  it("preserves storyboard-local video thumbnails when backend refreshes the same video", () => {
    const current = [
      {
        id: "storyboard-1",
        index: 1,
        title: "1",
        status: "draft",
        imageStatus: "empty",
        videoStatus: "ready",
        linkedShotId: "shot-1",
        uploadedVideos: [
          {
            id: "video-version-1",
            src: "/uploads/storyboard-videos/video-version-1.mp4",
            status: "ready",
            thumbnailSrc: "data:image/jpeg;base64,shot-1-thumb",
          },
        ],
        selectedUploadedVideoId: "video-version-1",
        previewVideo: "/uploads/storyboard-videos/video-version-1.mp4",
        previewThumbnailUrl: "data:image/jpeg;base64,shot-1-thumb",
      },
    ];
    const next = [
      {
        id: "storyboard-1",
        index: 1,
        title: "1",
        status: "draft",
        imageStatus: "empty",
        videoStatus: "ready",
        linkedShotId: "shot-1",
        uploadedVideos: [
          {
            id: "video-version-1",
            src: "/uploads/storyboard-videos/video-version-1.mp4",
            status: "ready",
          },
        ],
        selectedUploadedVideoId: "video-version-1",
        previewVideo: "/uploads/storyboard-videos/video-version-1.mp4",
      },
    ];

    const merged = syncStoryboards(current, next);

    assert.equal(merged[0].uploadedVideos[0].thumbnailSrc, "data:image/jpeg;base64,shot-1-thumb");
    assert.equal(merged[0].previewThumbnailUrl, "data:image/jpeg;base64,shot-1-thumb");
  });

  it("deduplicates storyboard videos when a local upload syncs to the same backend source", () => {
    const current = [
      {
        id: "storyboard-1",
        index: 1,
        title: "1",
        status: "draft",
        imageStatus: "empty",
        videoStatus: "ready",
        linkedShotId: "shot-1",
        uploadedVideos: [
          {
            id: "local-video-1",
            src: "/uploads/storyboard-videos/video-version-1.mp4",
            status: "ready",
            thumbnailSrc: "data:image/jpeg;base64,local-thumb",
          },
        ],
        selectedUploadedVideoId: "local-video-1",
        previewVideo: "/uploads/storyboard-videos/video-version-1.mp4",
        previewThumbnailUrl: "data:image/jpeg;base64,local-thumb",
      },
    ];
    const next = [
      {
        id: "storyboard-1",
        index: 1,
        title: "1",
        status: "draft",
        imageStatus: "empty",
        videoStatus: "ready",
        linkedShotId: "shot-1",
        uploadedVideos: [
          {
            id: "video-version-1",
            src: "/uploads/storyboard-videos/video-version-1.mp4",
            status: "ready",
          },
        ],
        selectedUploadedVideoId: "video-version-1",
        currentVideoAssetVersionId: "video-version-1",
        previewVideo: "/uploads/storyboard-videos/video-version-1.mp4",
      },
    ];

    const merged = syncStoryboards(current, next);

    assert.equal(merged[0].uploadedVideos.length, 1);
    assert.equal(merged[0].uploadedVideos[0].id, "video-version-1");
    assert.equal(merged[0].uploadedVideos[0].thumbnailSrc, "data:image/jpeg;base64,local-thumb");
    assert.equal(merged[0].selectedUploadedVideoId, "video-version-1");
  });

  it("does not resurrect backend-deleted storyboard images during sync", () => {
    const current = [
      {
        id: "storyboard-1",
        index: 1,
        title: "1",
        status: "draft",
        imageStatus: "ready",
        linkedShotId: "shot-1",
        uploadedImages: [
          { id: "image-a", src: "same-source.png", status: "ready" },
          { id: "image-b", src: "same-source.png", status: "ready" },
          { id: "image-deleted", src: "same-source.png", status: "ready" },
          { id: "local-uploading", src: "blob:uploading", status: "uploading" },
        ],
        currentImageAssetVersionId: "image-a",
      },
    ];
    const next = [
      {
        id: "storyboard-1",
        index: 1,
        title: "1",
        status: "draft",
        imageStatus: "ready",
        linkedShotId: "shot-1",
        uploadedImages: [
          { id: "image-a", src: "same-source.png", status: "ready" },
          { id: "image-b", src: "same-source.png", status: "ready" },
        ],
        currentImageAssetVersionId: "image-a",
      },
    ];

    const merged = syncStoryboards(current, next);

    assert.deepEqual(
      merged[0].uploadedImages.map((image) => image.id),
      ["local-uploading", "image-a", "image-b"],
    );
  });

  it("does not resurrect backend-deleted storyboard videos during sync", () => {
    const current = [
      {
        id: "storyboard-1",
        index: 1,
        title: "1",
        status: "draft",
        videoStatus: "ready",
        linkedShotId: "shot-1",
        uploadedVideos: [
          { id: "video-a", src: "same-source.mp4", status: "ready" },
          { id: "video-b", src: "same-source.mp4", status: "ready" },
          { id: "video-deleted", src: "same-source.mp4", status: "ready" },
          { id: "local-uploading", src: "blob:uploading", status: "uploading" },
        ],
        currentVideoAssetVersionId: "video-a",
        selectedUploadedVideoId: "video-a",
      },
    ];
    const next = [
      {
        id: "storyboard-1",
        index: 1,
        title: "1",
        status: "draft",
        videoStatus: "ready",
        linkedShotId: "shot-1",
        uploadedVideos: [
          { id: "video-a", src: "same-source.mp4", status: "ready" },
          { id: "video-b", src: "same-source.mp4", status: "ready" },
        ],
        currentVideoAssetVersionId: "video-a",
        selectedUploadedVideoId: "video-a",
      },
    ];

    const merged = syncStoryboards(current, next);

    assert.deepEqual(
      merged[0].uploadedVideos.map((video) => video.id),
      ["local-uploading", "video-a", "video-b"],
    );
  });

  it("updates only the selected episode storyboard collection for duplicate storyboard ids", () => {
    const primaryStoryboards = [
      {
        id: "storyboard-1",
        index: 1,
        title: "1",
        linkedShotId: "shot-primary-1",
        uploadedVideos: [],
        previewVideo: null,
        previewThumbnailUrl: null,
      },
      {
        id: "storyboard-2",
        index: 2,
        title: "2",
        linkedShotId: "shot-primary-2",
        uploadedVideos: [],
        previewVideo: null,
        previewThumbnailUrl: null,
      },
    ];
    const episodeStoryboards = [
      {
        id: "storyboard-1",
        index: 1,
        title: "1",
        linkedShotId: "shot-episode-1",
        uploadedVideos: [],
        previewVideo: null,
        previewThumbnailUrl: null,
      },
      {
        id: "storyboard-2",
        index: 2,
        title: "2",
        linkedShotId: "shot-episode-2",
        uploadedVideos: [],
        previewVideo: null,
        previewThumbnailUrl: null,
      },
    ];

    const updated = applyStoryboardScopeUpdate(
      {
        storyboards: primaryStoryboards,
        episodeStoryboardMap: {
          "episode-2": episodeStoryboards,
        },
        projectPanelMode: "episode-workbench",
        selectedEpisodeId: "episode-2",
      },
      (storyboard) =>
        storyboard.id === "storyboard-2"
          ? {
              ...storyboard,
              uploadedVideos: [
                {
                  id: "video-2",
                  src: "/uploads/storyboard-videos/episode-2-shot-2.mp4",
                  thumbnailSrc: "data:image/jpeg;base64,episode-2-shot-2-thumb",
                },
              ],
              previewVideo: "/uploads/storyboard-videos/episode-2-shot-2.mp4",
              previewThumbnailUrl: "data:image/jpeg;base64,episode-2-shot-2-thumb",
            }
          : storyboard,
    );

    assert.equal(updated.storyboards[1].uploadedVideos.length, 0);
    assert.equal(updated.storyboards[1].previewVideo, null);
    assert.equal(updated.episodeStoryboardMap["episode-2"][1].uploadedVideos.length, 1);
    assert.equal(
      updated.episodeStoryboardMap["episode-2"][1].previewVideo,
      "/uploads/storyboard-videos/episode-2-shot-2.mp4",
    );
    assert.equal(
      updated.episodeStoryboardMap["episode-2"][1].previewThumbnailUrl,
      "data:image/jpeg;base64,episode-2-shot-2-thumb",
    );
  });

  it("hydrates uploaded storyboard videos from backend source URLs", () => {
    const state = {
      shots: [
        {
          id: "shot-1",
          title: "Shot 001",
          description: "video shot",
          episodeId: "episode-1",
          currentImageAssetVersionId: null,
          currentVideoAssetVersionId: "video-version-1",
          previewVideoUrl: null,
          videoVersions: [
            {
              id: "video-version-1",
              sourceUrl: "/uploads/storyboard-videos/video-version-1.mp4",
              storageObjectKey: "storyboard-videos/video-version-1.mp4",
              metadata: {
                label: "take-1.mp4",
                durationMs: 6_000,
              },
              createdAt: "2026-05-24T03:00:00.000Z",
            },
          ],
        },
      ],
    };

    const storyboards = createStoryboardList(state);

    assert.equal(storyboards[0].uploadedVideos.length, 1);
    assert.equal(storyboards[0].uploadedVideos[0].src, "/uploads/storyboard-videos/video-version-1.mp4");
    assert.equal(storyboards[0].selectedUploadedVideoId, "video-version-1");
  });
});

describe("video generation panel", () => {
  it("exposes the planned model catalog and validation", () => {
    assert.equal(videoModels.length, 7);
    assert.deepEqual(videoModels.slice(0, 3).map((model) => model.name), [
      "Happy Horse",
      "Vidu Q3-Pro",
      "Vidu Q2",
    ]);
    assert.equal(videoModels.at(-1)?.name, "Hailuo 2.3 - Fast");

    const result = validateVideoGeneration({ firstFrameUploaded: false });
    assert.equal(result.ok, false);
  });
});

describe("project create modal", () => {
  it("allows project creation requests to override the default script seed", () => {
    assert.deepEqual(
      buildProjectCreateRequest({
        name: "原创计划",
        aspectRatio: "9:16",
        projectType: "anime",
        scriptInput: "项目模式：AI 原创剧本\n创作灵感：时间停止后的都市废墟。",
      }),
      {
        name: "原创计划",
        scriptInput: "项目模式：AI 原创剧本\n创作灵感：时间停止后的都市废墟。",
        aspectRatio: "9:16",
        resolution: "1080p",
        projectType: "anime",
      },
    );
  });

  it("renders required inputs with defaults selected", () => {
    const html = renderProjectCreateModal({
      show: true,
      defaultName: "",
      selectedAspectRatio: "9:16",
      selectedProjectType: "anime",
    });

    assert.match(html, /id="project-create-name-input"/);
    assert.match(html, /name="project-aspect-ratio" value="9:16" checked/);
    assert.match(html, /name="project-type" value="anime" checked/);
    assert.match(html, /0\/50/);
  });
});

describe("asset import modal", () => {
  it("keeps the episode workbench library modal footer visible for empty prop assets", () => {
    const state = {
      project: {
        id: "project-1",
        name: "剧集工台资产库",
        phase: "asset_review",
        aspectRatio: "16:9",
        resolution: "2K",
      },
      shots: [],
      exportPreview: null,
    };
    const storyboards = createStoryboardList(state);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        projectPanelMode: "episode-workbench",
        selectedEpisodeId: "episode-2",
        projectAssetTab: "prop",
        storyboards,
        selectedStoryboard: storyboards[0],
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        isCreateModalOpen: false,
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
        assetImportModal: "prop",
        assetImportModalTab: "official",
        assetImportSelection: [],
        assetImportOfficialAssets: [],
        projectDetail: {
          assetsByType: {
            character: [],
            scene: [],
            prop: [],
          },
        },
      },
    });

    assert.match(html, /episode-asset-library-modal/);
    assert.match(html, /episode-asset-library-empty/);
    assert.match(html, /暂无数据/);
    assert.match(html, /episode-asset-library-footer empty/);
    assert.match(html, /data-action="confirm-asset-import"/);
    assert.doesNotMatch(html, /episode-asset-library-pagination/);
  });

  it("renders a real local upload intake and in-modal review state", () => {
    const state = {
      project: {
        id: "project-1",
        name: "try",
        phase: "asset_review",
        aspectRatio: "9:16",
        resolution: "1080p",
      },
      assetReview: { readyForGeneration: false },
      assetCandidates: {
        characters: [{ assetKey: "hero", label: "hero", required: true, confirmed: false }],
        scenes: [{ assetKey: "city", label: "city", required: true, confirmed: false }],
        props: [{ assetKey: "sword", label: "sword", required: false, confirmed: false }],
      },
      calibration: null,
      shots: [
        {
          id: "shot-1",
          title: "Shot 001",
          currentImageAssetVersionId: null,
          currentVideoAssetVersionId: null,
        },
      ],
      exportPreview: null,
    };
    const storyboards = createStoryboardList(state);
    const baseUi = {
      activeNavTab: "project",
      storyboards,
      selectedStoryboard: storyboards[0],
      selectedModelId: "vidu-q3-pro",
      prompt: "",
      busy: false,
      projectPanelMode: "workspace",
      projectInteriorSection: "assets",
      projectAssetTab: "character",
      validationMessage: "",
      toast: "",
      isScriptModalOpen: false,
      isCreateModalOpen: false,
      scriptTab: "script-upload",
      uploadNotice: "",
      defaultScript: "Episode 1",
    };

    const localImportHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...baseUi,
        assetImportModal: "character",
        assetImportModalTab: "local",
      },
    });

    assert.match(localImportHtml, /data-dropzone="asset-import"/);
    assert.match(localImportHtml, /data-action="pick-asset-import-files"/);
    assert.match(localImportHtml, /class="asset-import-file-input"/);
    assert.match(localImportHtml, /type="file"/);

    const reviewHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...baseUi,
        assetImportModal: "character",
        assetImportModalTab: "local",
        assetImportSelection: ["asset-draft-character-1"],
        assetImportDrafts: [
          {
            id: "asset-draft-character-1",
            name: "draft-character-1",
            preview: "data:image/png;base64,test-preview",
          },
        ],
      },
    });

    assert.match(reviewHtml, /asset-import-review-item/);
    assert.match(reviewHtml, /draft-character-1/);
    assert.match(reviewHtml, /data-action="toggle-asset-import-draft"/);
    assert.match(reviewHtml, /test-preview/);
  });

  it("renders scene and prop asset flows with type-specific copy and ratios", () => {
    const state = {
      project: {
        id: "project-1",
        name: "try",
        phase: "asset_review",
        aspectRatio: "9:16",
        resolution: "1080p",
      },
      assetReview: { readyForGeneration: false },
      assetCandidates: {
        characters: [{ assetKey: "hero", label: "hero", required: true, confirmed: false }],
        scenes: [{ assetKey: "city", label: "city", required: true, confirmed: false }],
        props: [{ assetKey: "sword", label: "sword", required: false, confirmed: false }],
      },
      calibration: null,
      shots: [],
      exportPreview: null,
    };
    const storyboards = createStoryboardList(state);
    const baseUi = {
      activeNavTab: "project",
      storyboards,
      selectedStoryboard: storyboards[0],
      selectedModelId: "vidu-q3-pro",
      prompt: "",
      busy: false,
      projectPanelMode: "workspace",
      projectInteriorSection: "assets",
      validationMessage: "",
      toast: "",
      isScriptModalOpen: false,
      isCreateModalOpen: false,
      scriptTab: "script-upload",
      uploadNotice: "",
      defaultScript: "Episode 1",
      importedAssets: {
        character: [],
        scene: [],
        prop: [],
        other: { image: [], video: [] },
      },
    };

    const sceneEmptyHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...baseUi,
        projectAssetTab: "scene",
      },
    });

    assert.match(sceneEmptyHtml, /asset-library-empty-showcase/);
    assert.match(sceneEmptyHtml, /data-asset-kind="scene"/);
    assert.match(sceneEmptyHtml, /data-action="open-asset-generator-modal"/);

    const propFilledHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...baseUi,
        projectAssetTab: "prop",
        importedAssets: {
          ...baseUi.importedAssets,
          prop: [
            {
              id: "imported-prop-1",
              kind: "prop",
              name: "prop-preview-asset",
              preview: "data:image/svg+xml;charset=UTF-8,prop-preview",
            },
          ],
        },
      },
    });

    assert.match(propFilledHtml, /imported-asset-card square/);
    assert.match(propFilledHtml, /prop-preview/);
  });

  it("renders other image import flow and imported badge state", () => {
    const state = {
      project: {
        id: "project-1",
        name: "try",
        phase: "asset_review",
        aspectRatio: "9:16",
        resolution: "1080p",
      },
      assetReview: { readyForGeneration: false },
      assetCandidates: {
        characters: [],
        scenes: [],
        props: [],
      },
      calibration: null,
      shots: [],
      exportPreview: null,
    };
    const storyboards = createStoryboardList(state);

    const modalHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        storyboards,
        selectedStoryboard: storyboards[0],
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        projectPanelMode: "workspace",
        projectInteriorSection: "assets",
        projectAssetTab: "other",
        projectOtherAssetMediaType: "image",
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        isCreateModalOpen: false,
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
        assetImportModal: "other",
        assetImportModalTab: "local",
      },
    });

    assert.match(modalHtml, /data-dropzone="asset-import"/);
    assert.match(modalHtml, /class="asset-import-banner other-tone"/);

    const importedHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        storyboards,
        selectedStoryboard: storyboards[0],
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        projectPanelMode: "workspace",
        projectInteriorSection: "assets",
        projectAssetTab: "other",
        projectOtherAssetMediaType: "image",
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        isCreateModalOpen: false,
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
        importedAssets: {
          character: [],
          scene: [],
          prop: [],
          other: {
            image: [
              {
                id: "imported-other-1",
                name: "other-image-asset",
                preview: "data:image/svg+xml;charset=UTF-8,other-image",
              },
            ],
            video: [],
          },
        },
      },
    });

    assert.match(importedHtml, /other-imported-badge/);
    assert.match(importedHtml, /other-image-asset/);
    assert.match(importedHtml, /other-image/);
  });
});
