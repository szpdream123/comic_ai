import {
  officialAssetLibraryFixture,
  personalAssetLibraryFixture,
  teamAssetGate,
} from "./asset-fixtures.js";
import { escapeAttr, escapeHtml } from "./markup.js";
import { renderPricingModal } from "./pricing-modal.js";

const ASSET_ACTION_MESSAGE = "请先进入项目工作台，在项目资产页上传或生成素材。";
const ASSET_FILTER_MESSAGE = "批量、收藏、排序与文件夹能力暂未完全接入，当前先保留真实浏览与导入链路。";
const ASSET_PREVIEW_MESSAGE = "当前为官方/团队资产库预览，支持浏览、筛选、选中和导入到项目。";

const PERSONAL_TYPE_OPTIONS = [
  ["all", "全部"],
  ["character", "角色"],
  ["scene", "场景"],
  ["prop", "道具"],
];

const CATEGORY_TO_TYPE = {
  角色: "character",
  场景: "scene",
  道具: "prop",
};

const TYPE_TO_LABEL = {
  all: "全部",
  character: "角色",
  scene: "场景",
  prop: "道具",
};

export function renderAssetLibraryPage(context = {}) {
  const assetScope = context.assetScope ?? "personal";
  if (assetScope === "team" || assetScope === "official") {
    return renderOfficialTeamLibrary(context);
  }

  const assetsByType = context.assetsByType ?? null;
  const activeTypeFilter = String(context.typeFilter ?? "all");
  const searchQuery = String(context.searchQuery ?? "");
  const personalAssets = filterPersonalAssets(collectPersonalAssets(assetsByType), {
    typeFilter: activeTypeFilter,
    searchQuery,
  });

  return `
    <section class="library-team-page asset-library-page" aria-labelledby="asset-library-title">
      <div class="library-team-shell">
        <header class="library-team-page-head">
          <div>
            <p class="library-team-kicker">资产库</p>
            <h1 id="asset-library-title">资产沉淀台</h1>
            <p class="library-team-subcopy">集中沉淀历史创作、Agent项目、上传素材和常用提示词，后续生产可以直接复用。</p>
          </div>
          <div class="library-team-head-actions">
            ${renderPlaceholderButton("上传素材", ASSET_ACTION_MESSAGE)}
            ${renderPlaceholderButton("生成资产", ASSET_ACTION_MESSAGE, true)}
          </div>
        </header>
        <section class="library-team-toolbar" aria-label="资产库操作台">
          <div class="library-team-toolbar-main">
            ${renderAssetScopeTabs(assetScope)}
            <nav class="library-team-tabs compact" role="tablist" aria-label="个人资产库标签">
              ${personalAssetLibraryFixture.tabs.map((tab, index) => renderStaticTab(tab, index === 0)).join("")}
            </nav>
          </div>
          <div class="library-team-filterbar" aria-label="资产筛选">
            <label class="library-team-field">
              <span>类型筛选</span>
              <select aria-label="类型筛选" data-action="set-library-asset-type-filter">
                ${renderPersonalTypeOptions(activeTypeFilter)}
              </select>
            </label>
            <label class="library-team-search">
              <span class="sr-only">搜索</span>
              <input
                type="search"
                placeholder="搜索"
                aria-label="搜索"
                value="${escapeAttr(searchQuery)}"
                data-action="search-library-assets"
              />
            </label>
            <label class="library-team-check">
              <input type="checkbox" disabled title="${escapeAttr(ASSET_FILTER_MESSAGE)}" />
              <span>我的收藏</span>
            </label>
            ${renderPlaceholderButton("批量操作", ASSET_FILTER_MESSAGE)}
            ${renderPlaceholderButton("时间顺序", ASSET_FILTER_MESSAGE)}
            ${renderPlaceholderButton("文件夹", ASSET_FILTER_MESSAGE)}
          </div>
        </section>
        ${
          personalAssets.length
            ? `
              <section class="library-team-asset-grid" aria-label="个人资产">
                ${personalAssets.map((asset) => renderAssetCard(asset, { selectable: false })).join("")}
              </section>
            `
            : `
              <div class="library-team-empty-state">
                <div class="library-team-empty-icon" aria-hidden="true">+</div>
                <div>
                  <h2>还没有可复用资产</h2>
                  <p>暂无资产，生成或上传后会沉淀到这里。</p>
                </div>
                <div class="library-team-empty-actions">
                  ${renderPlaceholderButton("上传素材", ASSET_ACTION_MESSAGE)}
                  ${renderPlaceholderButton("生成资产", ASSET_ACTION_MESSAGE, true)}
                </div>
              </div>
            `
        }
      </div>
    </section>
  `;
}

function renderOfficialTeamLibrary(context) {
  const assetScope = context.assetScope ?? "official";
  const title = assetScope === "team" ? "团队资产库" : "官方资产库";
  const activeCategory = String(context.libraryCategory ?? "角色");
  const activeFolder = String(context.libraryFolder ?? officialAssetLibraryFixture.folders[0] ?? "");
  const searchQuery = String(context.searchQuery ?? "");
  const selectedAssetId = String(context.selectedLibraryAssetId ?? "");
  const selectedImportIds = Array.isArray(context.selectedLibraryImportIds)
    ? context.selectedLibraryImportIds.map((item) => String(item))
    : [];
  const categories = officialAssetLibraryFixture.categories;
  const folders = officialAssetLibraryFixture.folders;
  const filteredAssets = filterOfficialAssets(officialAssetLibraryFixture.assets, {
    category: activeCategory,
    folder: activeFolder,
    searchQuery,
  });
  const activeAsset =
    filteredAssets.find((asset) => asset.id === selectedAssetId) ??
    filteredAssets[0] ??
    null;
  const selectedCount = selectedImportIds.length;

  return `
    <section class="library-team-page official-library-page" aria-labelledby="official-library-title">
      <div class="library-team-shell">
        <header class="library-team-page-head">
          <div>
            <p class="library-team-kicker">${escapeHtml(title)}</p>
            <h1 id="official-library-title">团队资产工作区</h1>
            <p class="library-team-subcopy">从官方角色、场景、道具开始搭建团队共用素材池，减少重复生成和素材丢失。</p>
          </div>
          <div class="library-team-head-actions">
            <button class="library-team-button" type="button" data-action="open-pricing">开通专业版</button>
            <button
              class="library-team-button library-team-button-primary"
              type="button"
              data-action="import-selected-library-assets"
              ${selectedCount ? "" : "disabled"}
            >导入所选${selectedCount ? ` (${selectedCount})` : ""}</button>
          </div>
        </header>
        <section class="library-team-toolbar" aria-label="官方和团队资产库操作台">
          <div class="library-team-toolbar-main">
            ${renderAssetScopeTabs(assetScope)}
            <nav class="library-team-tabs compact" role="tablist" aria-label="官方和团队资产库">
              ${officialAssetLibraryFixture.scopes
                .map((scope) => {
                  const scopeId = scope === "团队资产库" ? "team" : "official";
                  const active = scopeId === assetScope;
                  return `
                    <button
                      class="library-team-tab${active ? " is-active" : ""}"
                      type="button"
                      role="tab"
                      aria-selected="${active ? "true" : "false"}"
                      data-action="set-library-asset-scope"
                      data-asset-scope="${escapeAttr(scopeId)}"
                    >${escapeHtml(scope)}</button>
                    ${scopeId === "team" ? '<span class="library-team-badge">团队专用</span>' : ""}
                  `;
                })
                .join("")}
            </nav>
            <nav class="library-team-tabs compact" role="tablist" aria-label="资产分类">
              ${categories.map((category) => renderInteractiveTab(category, activeCategory === category, "set-library-category", {
                category,
              })).join("")}
            </nav>
          </div>
          <div class="library-team-filterbar" aria-label="资产筛选">
            <label class="library-team-search">
              <span class="sr-only">搜索</span>
              <input
                type="search"
                placeholder="搜索官方和团队资产"
                aria-label="搜索官方和团队资产"
                value="${escapeAttr(searchQuery)}"
                data-action="search-library-assets"
              />
            </label>
            <span class="library-team-commerce-notice">${escapeHtml(ASSET_PREVIEW_MESSAGE)}</span>
          </div>
        </section>
        <div class="library-team-split">
          <aside class="library-team-folder-list" aria-label="文件夹">
            <h2>文件夹</h2>
            ${folders
              .map((folder) => `
                <button
                  class="library-team-folder${folder === activeFolder ? " is-active" : ""}"
                  type="button"
                  data-action="set-library-folder"
                  data-library-folder="${escapeAttr(folder)}"
                >${escapeHtml(folder)}</button>
              `)
              .join("")}
          </aside>
          <section class="library-team-asset-browser" aria-label="官方资产">
            <div class="library-team-browser-header">
              <div>
                <p class="library-team-kicker">${escapeHtml(activeCategory)}素材</p>
                <h2>${escapeHtml(activeFolder)}</h2>
              </div>
              <div class="library-team-commerce-notice">已选 ${selectedCount} 项，可直接导入到当前项目资产。</div>
            </div>
            ${
              filteredAssets.length
                ? `
                  <div class="library-team-asset-grid">
                    ${filteredAssets.map((asset) =>
                      renderAssetCard(asset, {
                        selectable: true,
                        selected: selectedImportIds.includes(asset.id),
                        active: activeAsset?.id === asset.id,
                      }),
                    ).join("")}
                  </div>
                `
                : `
                  <div class="library-team-empty-state">
                    <div class="library-team-empty-icon" aria-hidden="true">0</div>
                    <div>
                      <h2>当前筛选下暂无资产</h2>
                      <p>可以切换分类、文件夹或搜索关键词继续查找。</p>
                    </div>
                  </div>
                `
            }
            ${renderAssetInspector(activeAsset, selectedImportIds.includes(activeAsset?.id ?? ""))}
            <aside class="library-team-gate" aria-label="${escapeAttr(teamAssetGate.title)}">
              <div>
                <h3>${escapeHtml(teamAssetGate.title)}</h3>
                <p>${escapeHtml(teamAssetGate.message)}</p>
              </div>
              <button class="library-team-button library-team-button-primary" type="button" data-action="open-pricing">${escapeHtml(teamAssetGate.cta)}</button>
            </aside>
          </section>
        </div>
      </div>
      ${renderPricingModal({
        open: context.pricingOpen === true,
        packages: context.billingPackages ?? null,
        billingOrder: context.billingOrder ?? null,
        paymentIntent: context.paymentIntent ?? null,
        paymentAction: context.paymentAction ?? null,
      })}
    </section>
  `;
}

function renderAssetScopeTabs(assetScope) {
  return `
    <nav class="library-team-tabs" role="tablist" aria-label="资产库范围">
      ${[
        ["personal", "个人资产库"],
        ["official", "官方资产库"],
        ["team", "团队资产库"],
      ]
        .map(([scope, label]) => {
          const selected = scope === assetScope;
          return `
            <button
              class="library-team-tab${selected ? " is-active" : ""}"
              type="button"
              role="tab"
              aria-selected="${selected ? "true" : "false"}"
              data-action="set-library-asset-scope"
              data-asset-scope="${escapeAttr(scope)}"
            >${escapeHtml(label)}</button>
          `;
        })
        .join("")}
    </nav>
  `;
}

function renderStaticTab(label, selected) {
  return `
    <button
      class="library-team-tab${selected ? " is-active" : ""}"
      type="button"
      role="tab"
      aria-selected="${selected ? "true" : "false"}"
      data-action="show-library-placeholder"
      data-placeholder-message="${escapeAttr(ASSET_FILTER_MESSAGE)}"
    >
      ${escapeHtml(label)}
    </button>
  `;
}

function renderInteractiveTab(label, selected, action, data = {}) {
  const attrs = Object.entries(data)
    .map(([key, value]) => `data-${escapeAttr(kebabCase(key))}="${escapeAttr(value)}"`)
    .join(" ");
  return `
    <button
      class="library-team-tab${selected ? " is-active" : ""}"
      type="button"
      role="tab"
      aria-selected="${selected ? "true" : "false"}"
      data-action="${escapeAttr(action)}"
      ${attrs}
    >
      ${escapeHtml(label)}
    </button>
  `;
}

function renderPlaceholderButton(label, message, primary = false) {
  const action =
    message === ASSET_ACTION_MESSAGE
      ? (primary ? "open-library-generate" : "open-library-upload")
      : "show-library-placeholder";
  return `
    <button
      class="library-team-button${primary ? " library-team-button-primary" : ""}"
      type="button"
      data-action="${action}"
      data-placeholder-message="${escapeAttr(message)}"
    >${escapeHtml(label)}</button>
  `;
}

function renderAssetCard(asset, options = {}) {
  const selectable = options.selectable === true;
  const selected = options.selected === true;
  const active = options.active === true;
  const action = selectable ? "select-library-asset" : "show-library-placeholder";
  return `
    <article
      class="library-team-asset-card${selected ? " is-selected" : ""}${active ? " is-active" : ""}"
      data-library-asset-id="${escapeAttr(asset.id)}"
    >
      <button
        class="library-team-asset-card-button"
        type="button"
        data-action="${escapeAttr(action)}"
        data-library-asset-id="${escapeAttr(asset.id)}"
      >
        <div class="library-team-asset-preview" aria-hidden="true">
          ${asset.previewUrl ? `<img src="${escapeAttr(asset.previewUrl)}" alt="" />` : ""}
        </div>
        <div class="library-team-asset-meta">
          <h3>${escapeHtml(asset.name)}</h3>
          <p>${escapeHtml(asset.category ?? asset.kind ?? "资产")}</p>
          ${asset.folder ? `<span class="library-team-commerce-notice">${escapeHtml(asset.folder)}</span>` : ""}
        </div>
      </button>
      ${
        selectable
          ? `
            <div class="library-team-asset-actions">
              <button
                class="library-team-link-button"
                type="button"
                data-action="toggle-library-import-selection"
                data-library-asset-id="${escapeAttr(asset.id)}"
              >${selected ? "取消选择" : "加入导入"}</button>
            </div>
          `
          : ""
      }
    </article>
  `;
}

function renderAssetInspector(asset, selected) {
  if (!asset) {
    return "";
  }
  return `
    <aside class="library-team-plan-note" data-library-asset-inspector="${escapeAttr(asset.id)}">
      <strong>${escapeHtml(asset.name)}</strong>
      <span>${escapeHtml(asset.category ?? "资产")}</span>
      <span>${escapeHtml(asset.folder ?? "未归类")}</span>
      <span>${escapeHtml(asset.description ?? "暂无描述")}</span>
      <button
        class="library-team-button library-team-button-primary"
        type="button"
        data-action="toggle-library-import-selection"
        data-library-asset-id="${escapeAttr(asset.id)}"
      >${selected ? "取消导入" : "导入到项目"}</button>
    </aside>
  `;
}

function collectPersonalAssets(assetsByType) {
  if (!assetsByType || typeof assetsByType !== "object") {
    return personalAssetLibraryFixture.assets ?? [];
  }

  const buckets = [
    ["角色", "character", assetsByType.character],
    ["场景", "scene", assetsByType.scene],
    ["道具", "prop", assetsByType.prop],
  ];

  return buckets.flatMap(([category, type, assets]) =>
    Array.isArray(assets)
      ? assets.map((asset, index) => ({
          id: asset?.id ?? asset?.assetId ?? `${type}-${index + 1}`,
          name: asset?.name ?? asset?.label ?? asset?.assetKey ?? "未命名资产",
          category,
          type,
          kind: asset?.kind ?? category,
          previewUrl: asset?.preview ?? asset?.previewUrl ?? "",
        }))
      : [],
  );
}

function renderPersonalTypeOptions(activeTypeFilter) {
  return PERSONAL_TYPE_OPTIONS.map(
    ([value, label]) =>
      `<option value="${escapeAttr(value)}" ${activeTypeFilter === value ? "selected" : ""}>${escapeHtml(label)}</option>`,
  ).join("");
}

function filterPersonalAssets(assets, context = {}) {
  const activeTypeFilter = String(context.typeFilter ?? "all");
  const searchQuery = String(context.searchQuery ?? "").trim().toLowerCase();

  return assets.filter((asset) => {
    if (activeTypeFilter !== "all" && asset.type !== activeTypeFilter) {
      return false;
    }
    if (!searchQuery) {
      return true;
    }
    return [asset.name, asset.category, asset.kind]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(searchQuery));
  });
}

function filterOfficialAssets(assets, context = {}) {
  const activeCategory = String(context.category ?? "角色");
  const activeFolder = String(context.folder ?? "");
  const searchQuery = String(context.searchQuery ?? "").trim().toLowerCase();

  return (Array.isArray(assets) ? assets : []).filter((asset) => {
    if (activeCategory && asset.category !== activeCategory) {
      return false;
    }
    if (activeFolder && asset.folder !== activeFolder) {
      return false;
    }
    if (!searchQuery) {
      return true;
    }
    return [asset.name, asset.category, asset.folder, asset.description]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(searchQuery));
  });
}

export function getLibraryAssetById(assetId) {
  return officialAssetLibraryFixture.assets.find((asset) => asset.id === assetId) ?? null;
}

export function getLibraryAssetsForImport(input = {}) {
  const categoryLabel =
    input.assetKind === "character"
      ? "角色"
      : input.assetKind === "scene"
        ? "场景"
        : input.assetKind === "prop"
          ? "道具"
          : TYPE_TO_LABEL[String(input.type ?? "all")] ?? "角色";
  return filterOfficialAssets(officialAssetLibraryFixture.assets, {
    category: categoryLabel,
    folder: String(input.folder ?? officialAssetLibraryFixture.folders[0] ?? ""),
    searchQuery: String(input.searchQuery ?? ""),
  });
}

export function getLibraryTypeByCategory(category) {
  return CATEGORY_TO_TYPE[String(category)] ?? "character";
}

function kebabCase(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}
