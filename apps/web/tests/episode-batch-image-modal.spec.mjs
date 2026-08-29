import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";

import {
  renderEpisodeBatchModal,
  renderEpisodeBatchStyleModal,
  renderEpisodeWorkbench,
} from "../src/features/production-workbench/episode-workbench-rebuilt.js";
import {
  handleWorkbenchActionForTest,
} from "../src/features/production-workbench/index.js";
import { renderProjectDetail } from "../src/features/production-workbench/project-detail.js";

function readDivContents(html, className) {
  const openingStart = html.indexOf(`<div class="${className}">`);
  assert.notEqual(openingStart, -1);
  const openingEnd = html.indexOf(">", openingStart);
  const tokenPattern = /<div\b[^>]*>|<\/div>/g;
  tokenPattern.lastIndex = openingEnd + 1;
  let depth = 1;
  for (let token = tokenPattern.exec(html); token; token = tokenPattern.exec(html)) {
    depth += token[0].startsWith("</") ? -1 : 1;
    if (depth === 0) {
      return html.slice(openingEnd + 1, token.index);
    }
  }
  assert.fail(`Unclosed div: ${className}`);
}

function readOpeningTagByAttribute(html, attribute) {
  const attributeIndex = html.indexOf(attribute);
  assert.notEqual(attributeIndex, -1);
  const openingStart = html.lastIndexOf("<", attributeIndex);
  const openingEnd = html.indexOf(">", attributeIndex);
  return html.slice(openingStart, openingEnd + 1);
}

function createDuplicateBatchLayerRoot(initialHtml) {
  const layers = [];
  const styleLayers = [];
  const createLayer = (html) => {
    const layer = {
      html,
      remove() {
        const index = layers.indexOf(layer);
        if (index >= 0) layers.splice(index, 1);
      },
      replaceWith(replacement) {
        const index = layers.indexOf(layer);
        if (index >= 0) layers.splice(index, 1, replacement);
      },
    };
    return layer;
  };
  layers.push(createLayer(initialHtml), createLayer(initialHtml));
  styleLayers.push({
    remove() {
      styleLayers.splice(0, 1);
    },
  });
  return {
    layers,
    styleLayers,
    createLayer,
    root: {
      querySelector(selector) {
        if (selector === "[data-episode-batch-modal-layer]") return layers[0] ?? null;
        if (selector === '[data-selection-picker-id="episode-batch-style-picker"]') return styleLayers[0] ?? null;
        return null;
      },
      querySelectorAll(selector) {
        if (selector === "[data-episode-batch-modal-layer]") return [...layers];
        if (selector === '[data-selection-picker-id="episode-batch-style-picker"]') return [...styleLayers];
        return [];
      },
    },
  };
}

function createEpisodeLayerMountRoot() {
  const mainChildren = [];
  const shellChildren = [];
  const main = {
    appendChild(child) {
      mainChildren.push(child);
    },
  };
  const shell = {
    appendChild(child) {
      shellChildren.push(child);
    },
  };
  return {
    mainChildren,
    shellChildren,
    root: {
      querySelector(selector) {
        if (selector === ".workbench-main") return main;
        if (selector === ".production-workbench") return shell;
        return null;
      },
      querySelectorAll() {
        return [];
      },
    },
  };
}

it("renders the batch image modal as a visible production queue", () => {
  const html = renderEpisodeBatchModal({
    show: true,
    scope: "asset",
    mode: "image",
    totalCredits: 600,
    imageModelId: "gpt-image-2-cn",
    imageClarity: "2K",
    imageAspectRatio: "auto",
    imageModelOptions: [
      {
        value: "gpt-image-2-cn",
        label: "GPT Image 2",
        supportedQuality: ["2K", "4K"],
        supportedRatios: ["auto", "16:9"],
      },
    ],
    publicStyles: [
      {
        id: "cinematic",
        label: "电影写真",
        preview: "/uploads/cinematic-style.png",
        priceCredits: 0,
      },
    ],
    selectedStyleId: "cinematic",
    items: [
      { id: "asset-1", name: "茶舍外景", kind: "scene", preview: "/uploads/scene.png" },
      { id: "asset-2", name: "女掌柜", kind: "character", preview: "/uploads/character.png" },
    ],
  });

  assert.match(html, /生成队列 · 2 项/);
  assert.match(html, /统一设置后，为 2 项素材分别创建生图任务/);
  assert.match(html, /episode-batch-image-overview/);
  assert.match(html, /episode-batch-contact-sheet/);
  assert.match(html, /茶舍外景/);
  assert.match(html, /女掌柜/);
  assert.match(html, />01</);
  assert.match(html, />02</);
  assert.match(html, /每项素材独立创建任务/);
  assert.match(html, /aria-label="更换生图风格，当前为 电影写真"/);
  assert.match(html, /episode-batch-style-picker-trigger has-preview/);
  assert.match(html, /600 积分/);
});

it("keeps the batch image production queue responsive and motion-safe", () => {
  const css = readFileSync(
    new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
    "utf8",
  );

  assert.match(css, /\.episode-batch-image-overview\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.7fr\)/s);
  assert.match(css, /\.episode-batch-contact-sheet\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.episode-batch-modal\s*\{[^}]*box-sizing:\s*border-box/s);
  assert.match(css, /@media \(max-width:\s*720px\)[\s\S]*?\.episode-batch-image-overview\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.episode-batch-style-picker-media/s);
});

it("keeps the nested style picker keyboard-safe above the workflow", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );
  const styleEscapeIndex = source.indexOf('if (workbench.ui.episodeBatchModal?.styleModalOpen === true)');
  const batchEscapeIndex = source.indexOf('if (workbench.ui.episodeBatchModal?.show === true)');
  const fieldEscapeIndex = source.indexOf('if (workbench.ui.episodeBatchModal.openField)', batchEscapeIndex);
  const batchCloseIndex = source.indexOf('workbench.ui.episodeBatchModal = null', batchEscapeIndex);
  const workflowEscapeIndex = source.indexOf("if (workbench.ui.homeProjectWorkflowProjectId)");

  assert.notEqual(styleEscapeIndex, -1);
  assert.ok(styleEscapeIndex < workflowEscapeIndex);
  assert.ok(batchEscapeIndex < fieldEscapeIndex);
  assert.ok(fieldEscapeIndex < batchCloseIndex);
  assert.match(source, /episodeBatchModal\.isSubmitting === true[\s\S]*return;/);
  assert.match(source, /event\.key === "Tab"[\s\S]*trapEpisodeBatchStylePickerFocus\(workbench, event\)/);
  assert.match(source, /focusEpisodeBatchStylePicker\(workbench\)/);
  assert.match(source, /restoreEpisodeBatchStylePickerTriggerFocus\(workbench\)/);
});

it("renders empty image queues and non-image queue titles safely", () => {
  const emptyImageHtml = renderEpisodeBatchModal({
    show: true,
    scope: "asset",
    mode: "image",
    items: [],
    imageModelOptions: [],
    publicStyles: [],
    customStyles: [],
  });
  assert.match(emptyImageHtml, /生成队列 · 0 项/);
  assert.match(emptyImageHtml, /已选 <b>0<\/b> 项/);

  const videoHtml = renderEpisodeBatchModal({
    show: true,
    scope: "storyboard",
    mode: "video",
    items: [{ id: "storyboard-1", name: "分镜 1", kind: "storyboard" }],
    videoModelOptions: [],
  });
  assert.match(videoHtml, /<h2>批量生成视频<\/h2>/);
  assert.match(videoHtml, /统一设置生成参数，提交后可在任务中心查看进度/);
});

it("falls back to the committed style and renders the custom-style empty state", () => {
  const selectedHtml = renderEpisodeBatchStyleModal({
    styleModalOpen: true,
    selectedStyleId: "cinematic",
    publicStyles: [{ id: "cinematic", label: "电影写真" }],
    customStyles: [],
  });
  assert.match(readOpeningTagByAttribute(selectedHtml, 'data-picker-item-id="cinematic"'), /class="selection-picker-item active"/);

  const emptyCustomHtml = renderEpisodeBatchStyleModal({
    styleModalOpen: true,
    styleTab: "custom",
    publicStyles: [],
    customStyles: [],
  });
  assert.match(emptyCustomHtml, /暂无私人生图风格技能/);
});

it("keeps batch style and model controls rendered after a workflow rerender", () => {
  const html = renderEpisodeWorkbench({
    episodeId: "episode-1",
    episodeTitle: "第一集",
    layoutMode: "workflow",
    workflowWorkbenchOpen: true,
    assetLibrary: {
      character: [{ id: "asset-1", name: "女掌柜", description: "角色描述" }],
      scene: [],
      prop: [],
    },
    storyboards: [],
    selectedEpisodeAssetId: "asset-1",
    selectedEpisodeCardId: "asset-1",
    generationControls: {},
    generationUiState: { museScopeMode: "assets", museBoardMode: "operation" },
    episodeBatchModal: {
      show: true,
      scope: "asset",
      mode: "image",
      openField: "imageModelId",
      styleModalOpen: true,
      styleTab: "public",
      styleDraftId: "watercolor",
      selectedStyleId: "cinematic",
      imageModelId: "gpt-image-2-cn",
      imageModelOptions: [
        { value: "gpt-image-2-cn", label: "GPT Image 2" },
        { value: "flux-pro", label: "Flux Pro" },
      ],
      publicStyles: [
        { id: "cinematic", label: "电影写真", preview: "/uploads/cinematic.png" },
        { id: "watercolor", label: "水彩绘本", preview: "/uploads/watercolor.png" },
      ],
      customStyles: [],
      items: [{ id: "asset-1", name: "女掌柜", kind: "character" }],
    },
  });

  assert.equal((html.match(/data-episode-batch-modal-layer/g) ?? []).length, 1);
  assert.equal((html.match(/data-selection-picker-id="episode-batch-style-picker"/g) ?? []).length, 1);
  assert.match(html, /水彩绘本/);
  assert.match(readOpeningTagByAttribute(html, 'data-picker-item-id="watercolor"'), /class="selection-picker-item active"/);
  assert.match(html, /data-action="select-episode-batch-option"[\s\S]*data-value="flux-pro"/);
});

it("keeps exactly one batch and style overlay in the standard episode layout", () => {
  const html = renderEpisodeWorkbench({
    episodeId: "episode-1",
    episodeTitle: "第一集",
    layoutMode: "standard",
    assetLibrary: { character: [], scene: [], prop: [] },
    storyboards: [],
    generationControls: {},
    generationUiState: {},
    episodeBatchModal: {
      show: true,
      scope: "asset",
      mode: "image",
      styleModalOpen: true,
      selectedStyleId: "cinematic",
      imageModelOptions: [],
      publicStyles: [{ id: "cinematic", label: "电影写真" }],
      customStyles: [],
      items: [],
    },
  });
  assert.equal((html.match(/data-episode-batch-modal-layer/g) ?? []).length, 1);
  assert.equal((html.match(/data-selection-picker-id="episode-batch-style-picker"/g) ?? []).length, 1);
});

it("keeps the home workflow batch overlays outside its clipped body", () => {
  const episodeBatchModal = {
    show: true,
    scope: "asset",
    mode: "image",
    styleModalOpen: true,
    selectedStyleId: "watercolor",
    styleDraftId: "watercolor",
    imageModelId: "gpt-image-2-cn",
    imageModelOptions: [{ value: "gpt-image-2-cn", label: "GPT Image 2" }],
    publicStyles: [{ id: "watercolor", label: "水彩绘本" }],
    customStyles: [],
    items: [{ id: "asset-1", name: "女掌柜", kind: "character" }],
  };
  const html = renderProjectDetail({
    state: {
      projectDetail: {
        project: { id: "project-1", name: "工作流项目" },
        episodes: [{ id: "episode-1", title: "第一集" }],
      },
    },
    ui: {
      activeNavTab: "home",
      homeProjectWorkflowProjectId: "project-1",
      selectedEpisodeId: "episode-1",
      episodeWorkbenchLayout: "workflow",
      workflowGenerationWorkbenchOpen: true,
      importedAssets: { character: episodeBatchModal.items, scene: [], prop: [] },
      storyboards: [],
      selectedEpisodeAssetId: "asset-1",
      selectedEpisodeCardId: "asset-1",
      museScopeMode: "assets",
      episodeMediaMode: "image",
      episodeBatchModal,
    },
  });

  const workflowBody = readDivContents(html, "home-project-workflow-body");
  assert.doesNotMatch(workflowBody, /data-episode-batch-modal-layer/);
  assert.equal((html.match(/data-episode-batch-modal-layer/g) ?? []).length, 1);
  assert.equal((html.match(/data-selection-picker-id="episode-batch-style-picker"/g) ?? []).length, 1);
});

it("keeps style and model controls interactive through home workflow rerenders", async () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    body: { classList: { toggle() {} } },
    documentElement: { style: { setProperty() {} } },
    head: { appendChild() {} },
    createElement() {
      return {
        firstElementChild: null,
        innerHTML: "",
        setAttribute() {},
      };
    },
    querySelector() { return null; },
  };
  const episodeBatchModal = {
    show: true,
    scope: "asset",
    mode: "image",
    styleModalOpen: false,
    selectedStyleId: "cinematic",
    styleDraftId: "",
    imageModelId: "gpt-image-2-cn",
    imageParameterValues: { quality: "4K" },
    imageModelOptions: [
      { value: "gpt-image-2-cn", label: "GPT Image 2" },
      { value: "flux-pro", label: "Flux Pro" },
    ],
    publicStyles: [
      { id: "cinematic", label: "电影写真" },
      { id: "watercolor", label: "水彩绘本" },
    ],
    customStyles: [],
    items: [{ id: "asset-1", name: "女掌柜", kind: "character" }],
  };
  const workbench = {
    state: {
      projectDetail: {
        project: { id: "project-1", name: "工作流项目" },
        episodes: [{ id: "episode-1", title: "第一集" }],
      },
    },
    session: {},
    ui: {
      activeNavTab: "home",
      homeProjectWorkflowProjectId: "project-1",
      selectedEpisodeId: "episode-1",
      episodeWorkbenchLayout: "workflow",
      workflowGenerationWorkbenchOpen: true,
      importedAssets: { character: episodeBatchModal.items, scene: [], prop: [] },
      storyboards: [],
      selectedEpisodeAssetId: "asset-1",
      selectedEpisodeCardId: "asset-1",
      museScopeMode: "assets",
      episodeMediaMode: "image",
      episodeBatchModal,
    },
    root: {
      innerHTML: "",
      querySelector() { return null; },
      querySelectorAll() { return []; },
    },
  };

  try {
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "open-episode-batch-style-modal" },
    });
    assert.equal((workbench.root.innerHTML.match(/data-episode-batch-modal-layer/g) ?? []).length, 1);
    assert.equal((workbench.root.innerHTML.match(/data-selection-picker-id="episode-batch-style-picker"/g) ?? []).length, 1);

    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "select-episode-batch-style-draft", pickerItemId: "watercolor" },
    });
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "close-episode-batch-style-modal" },
    });
    assert.equal(workbench.ui.episodeBatchModal.selectedStyleId, "cinematic");
    assert.equal(workbench.ui.episodeBatchModal.styleDraftId, "");
    assert.match(workbench.root.innerHTML, /当前风格[\s\S]*电影写真/);

    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "open-episode-batch-style-modal" },
    });
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "select-episode-batch-style-draft", pickerItemId: "watercolor" },
    });
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "confirm-episode-batch-style" },
    });
    assert.equal(workbench.ui.episodeBatchModal.selectedStyleId, "watercolor");
    assert.match(workbench.root.innerHTML, /当前风格[\s\S]*水彩绘本/);

    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "toggle-episode-batch-menu", field: "imageModelId" },
    });
    assert.match(workbench.root.innerHTML, /data-value="flux-pro"/);
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "select-episode-batch-option", field: "imageModelId", value: "flux-pro" },
    });
    assert.equal(workbench.ui.episodeBatchModal.imageModelId, "flux-pro");
    assert.deepEqual(workbench.ui.episodeBatchModal.imageParameterValues, {});
    assert.match(workbench.root.innerHTML, /Flux Pro/);
  } finally {
    globalThis.document = previousDocument;
  }
});

it("mounts incremental episode layers inside the replaceable workbench main", async () => {
  const previousDocument = globalThis.document;
  const mountRoot = createEpisodeLayerMountRoot();
  globalThis.document = {
    createElement() {
      return {
        firstElementChild: null,
        set innerHTML(value) {
          this.firstElementChild = { html: value };
        },
      };
    },
  };
  const workbench = {
    ui: {
      projectPanelMode: "episode-workbench",
      episodeBatchModal: {
        show: true,
        scope: "asset",
        mode: "image",
        imageModelOptions: [],
        publicStyles: [],
        customStyles: [],
        items: [],
      },
    },
    root: mountRoot.root,
  };

  try {
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "toggle-episode-batch-menu", field: "imageModelId" },
    });

    assert.equal(mountRoot.mainChildren.length, 1);
    assert.equal(mountRoot.shellChildren.length, 0);
  } finally {
    globalThis.document = previousDocument;
  }
});

it("replaces duplicate batch layers with one freshly styled layer", async () => {
  const previousDocument = globalThis.document;
  const duplicateRoot = createDuplicateBatchLayerRoot("电影写真");
  globalThis.document = {
    createElement() {
      return {
        firstElementChild: null,
        set innerHTML(value) {
          this.firstElementChild = duplicateRoot.createLayer(value);
        },
      };
    },
  };
  const workbench = {
    state: { project: { id: "project-1" } },
    ui: {
      projectPanelMode: "episode-workbench",
      selectedEpisodePromptSkillIds: {},
      episodeBatchModal: {
        show: true,
        scope: "asset",
        mode: "image",
        selectedStyleId: "cinematic",
        publicStyles: [
          { id: "cinematic", label: "电影写真" },
          { id: "wasteland", label: "废土科幻" },
        ],
        customStyles: [],
        imageModelOptions: [],
        items: [],
      },
    },
    root: duplicateRoot.root,
  };

  try {
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "select-episode-batch-style-draft", pickerItemId: "wasteland" },
    });
    await handleWorkbenchActionForTest(workbench, {
      dataset: { action: "confirm-episode-batch-style" },
    });

    assert.equal(duplicateRoot.layers.length, 1);
    assert.equal(duplicateRoot.styleLayers.length, 0);
    assert.match(duplicateRoot.layers[0].html, /当前风格[\s\S]*废土科幻/);
    assert.ok(duplicateRoot.root.innerHTML.length > 0);
  } finally {
    globalThis.document = previousDocument;
  }
});

it("removes every duplicate batch layer on the first close action", async () => {
  const duplicateRoot = createDuplicateBatchLayerRoot("批量生图");
  const workbench = {
    ui: {
      projectPanelMode: "episode-workbench",
      episodeBatchModal: {
        show: true,
        mode: "image",
      },
    },
    root: duplicateRoot.root,
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "close-episode-batch-modal" },
  });

  assert.equal(duplicateRoot.layers.length, 0);
});
