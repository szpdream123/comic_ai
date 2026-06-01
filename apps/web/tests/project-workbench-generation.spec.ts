import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyStoryboardScopeUpdate,
  appendSelectedEpisodeAssetToPrompt,
  buildImageGenerationPayload,
  buildVideoGenerationPayload,
  friendlyError,
  parseEpisodeRouteForWorkbench,
  parseProjectRouteForWorkbench,
  findProjectCoverInput,
  renderProductionWorkbench,
  uploadProjectCoverFile,
  syncStoryboards,
} from "../src/features/production-workbench/index.js";
import {
  addStoryboard,
  createStoryboardList,
  normalizeStoryboardIndices,
  sortStoryboardsByIndex,
} from "../src/features/production-workbench/storyboard-state.js";
import { renderProjectCreateModal } from "../src/features/production-workbench/project-create-modal.js";
import { buildProjectCreateRequest } from "../src/features/production-workbench/project-create-request.js";
import {
  validateVideoGeneration,
  videoModels,
} from "../src/features/production-workbench/video-generation-panel.js";

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
    assert.match(workbench.ui.prompt, /李唯\/破旧麻袋衣/);
    assert.match(workbench.ui.prompt, /灰黑短发/);
    assert.equal(workbench.ui.assetPromptDraft?.scopeMode, "assets");
    assert.equal(workbench.ui.assetPromptDraft?.selectionContext?.selectedAssetId, "asset-1");
    assert.equal(workbench.ui.assetPromptDraft?.quickReferenceItems?.length, 1);
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
        assetGeneratorName: "闂備焦鍎抽悥鐓庮焽閻楀牜娈介柟瀛樼箰缁?(1)",
        importedAssets: {
          character: [
            {
              id: "character-1",
              kind: "character",
              name: "闂備焦鍎抽悥鐓庮焽閻楀牜娈介柟瀛樼箰缁?(1)",
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
          name: "闂備焦鍎抽悥鐓庮焽閻楀牜娈介柟瀛樼箰缁?(1)",
          preview: "data:image/svg+xml;charset=UTF-8,edit-character-preview",
        },
        assetGeneratorName: "闂備焦鍎抽悥鐓庮焽閻楀牜娈介柟瀛樼箰缁?(1)",
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
          name: "闂備焦鍎抽悥鐓庮焽閻楀牜娈介柟瀛樼箰缁?(1)",
        },
        renameImportedAssetName: "闂備焦鍎抽悥鐓庮焽閻楀牜娈介柟瀛樼箰缁?(1)",
        deleteImportedAsset: {
          assetId: "character-1",
          assetKind: "character",
          mediaType: "image",
          name: "闂備焦鍎抽悥鐓庮焽閻楀牜娈介柟瀛樼箰缁?(1)",
        },
      }),
    });

    assert.match(html, /id="asset-rename-name-input"/);
    assert.match(html, /data-action="confirm-rename-imported-asset"/);
    assert.match(html, /data-action="close-delete-imported-asset-modal"/);
    assert.match(html, /data-action="close-rename-imported-asset-modal"/);
    assert.match(html, /data-action="confirm-delete-imported-asset"/);
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
    assert.match(html, /data-action="change-project-page"/);
    assert.ok(html.includes("1 / 2"));
    assert.equal([...html.matchAll(/class="project-gallery-card"/g)].length, 8);
    assert.ok(html.indexOf("Iota") < html.indexOf("Theta"));
    assert.ok(html.indexOf("Theta") < html.indexOf("Beta"));
    assert.doesNotMatch(html, /Alpha/);
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
    assert.match(html, /episode-replica-layout/);
    assert.match(html, /episode-replica-layout storyboard-mode/);
    assert.match(html, /episode-replica-prompt/);
    assert.doesNotMatch(html, /global-statusbar/);
    assert.doesNotMatch(html, /muse-storyboard-rail/);
    assert.doesNotMatch(html, /muse-asset-lane/);
    assert.doesNotMatch(html, /muse-prompt-dock/);
  });

  it("keeps episode workspace image generation disabled until calibration exists", () => {
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

    assert.match(html, /data-action="generate-images"[^>]*disabled/);
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

  it("renders episode upload limits from generation config in the prompt panel", () => {
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

    assert.match(html, /episode-replica-upload-limits/);
    assert.match(html, /图片 20MB/);
    assert.match(html, /视频 500MB/);
    assert.match(html, /音频 100MB/);
    assert.match(html, /最多 30 张参考图/);
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
    assert.match(next[2].id, /^storyboard-local-/);
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
    assert.match(next[3].id, /^storyboard-local-/);
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
