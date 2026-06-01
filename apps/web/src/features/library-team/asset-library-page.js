import { officialAssetLibraryFixture, teamAssetGate } from "./asset-fixtures.js";
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
  const categories =
    assetScope === "team" ? teamCategories : normalizeCategories(context.libraryCategories);
  const requestedCategory = context.libraryCategory ?? categories[0]?.id ?? "character";
  const selectedCategory = categories.some((category) => category.id === requestedCategory)
    ? requestedCategory
    : categories[0]?.id ?? "character";
  const folders = normalizeFolders(context.libraryFolders);
  const selectedFolder = context.libraryFolder ?? folders[0] ?? "";
  const query = String(context.libraryQuery ?? "").trim();
  const assets = normalizeAssets(
    context.libraryAssets,
    selectedCategory,
    selectedFolder,
    query,
    Boolean(context.libraryFolder),
  );
  const teamLocked =
    assetScope === "team" && context.libraryEntitlement?.hasTeamAssetLibrary !== true;
  const isTeamApi = assetScope === "team" && selectedCategory === "api";
  const localUploads =
    assetScope === "team" ? normalizeTeamAssetLocalUploads(context, selectedCategory) : [];
  const localUploadToolbar =
    assetScope === "team" ? renderTeamAssetLocalUploadToolbar(selectedCategory) : "";
  const localUploadSection =
    assetScope === "team" ? renderTeamAssetLocalUploadSection(selectedCategory, localUploads) : "";
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
        <header class="library-team-page-head library-team-asset-head">
          <div id="official-library-title">
            ${renderAssetScopeTabs(assetScope, { officialTeamOnly: true })}
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

function renderTeamAssetLocalUploadToolbar(selectedCategory) {
  const config = teamLocalUploadConfigs[selectedCategory];
  if (!config) {
    return "";
  }
  const label = categoryLabel(selectedCategory);

  return `
    <section class="library-team-local-upload-toolbar" aria-label="${escapeAttr(label)}本地上传">
      <div class="library-team-local-upload-copy">
        <strong>${escapeHtml(label)}本地上传</strong>
        <span>${escapeHtml(config.helperText)}，上传后先显示为本地预览，后续可同步到团队云端。</span>
      </div>
      <div class="library-team-local-upload-actions">
        <button
          class="library-team-button library-team-button-primary"
          type="button"
          data-action="pick-team-asset-local-upload"
          data-library-category="${escapeAttr(selectedCategory)}"
        >${escapeHtml(config.actionLabel)}</button>
        <input
          class="team-asset-local-upload-input"
          type="file"
          accept="${escapeAttr(config.accept)}"
          multiple
          data-library-category="${escapeAttr(selectedCategory)}"
          aria-label="${escapeAttr(`${label}${config.actionLabel}`)}"
        />
      </div>
    </section>
  `;
}

function renderTeamAssetLocalUploadSection(selectedCategory, uploads) {
  const config = teamLocalUploadConfigs[selectedCategory];
  if (!config || uploads.length === 0) {
    return "";
  }
  const label = categoryLabel(selectedCategory);
  const unit = config.mediaType === "audio" ? "段音频" : "张图片";

  return `
    <section class="library-team-local-upload-section" aria-label="${escapeAttr(label)}本地上传预览">
      <div class="library-team-local-upload-section-head">
        <div>
          <p>本地上传，待同步</p>
          <h2>${escapeHtml(label)}本地预览</h2>
        </div>
        <span>${uploads.length} ${escapeHtml(unit)}</span>
      </div>
      <div class="library-team-local-upload-grid is-${escapeAttr(config.mediaType)}">
        ${uploads.map((asset) => renderTeamAssetLocalUploadCard(asset, config)).join("")}
      </div>
    </section>
  `;
}

function renderTeamAssetLocalUploadCard(asset, config) {
  const name = formatLocalUploadDisplayName(asset.name ?? asset.fileName ?? "未命名上传");
  const previewUrl = asset.previewUrl ?? asset.sourceUrl ?? asset.url ?? "";
  const meta = [asset.sizeLabel, asset.mimeType || asset.extension].filter(Boolean).join(" · ");
  const deleteButton = renderTeamAssetLocalUploadDeleteButton(asset, name);

  if (config.mediaType === "audio") {
    return `
      <article class="library-team-local-upload-card is-audio" data-local-upload-id="${escapeAttr(asset.id ?? "")}">
        <div class="library-team-local-upload-audio-icon" aria-hidden="true"></div>
        <div class="library-team-local-upload-card-body">
          <div class="library-team-local-upload-card-title">
            <div class="library-team-local-upload-card-name">
              <h3>${escapeHtml(name)}</h3>
              <span class="library-team-local-upload-status">待同步</span>
            </div>
            ${deleteButton}
          </div>
          ${meta ? `<p>${escapeHtml(meta)}</p>` : ""}
          <audio controls preload="metadata" src="${escapeAttr(previewUrl)}"></audio>
        </div>
      </article>
    `;
  }

  return `
    <article class="library-team-local-upload-card is-image" data-local-upload-id="${escapeAttr(asset.id ?? "")}">
      <div class="library-team-local-upload-card-body">
        <div class="library-team-local-upload-card-title">
          <div class="library-team-local-upload-card-name">
            <h3>${escapeHtml(name)}</h3>
            <span class="library-team-local-upload-status">待同步</span>
          </div>
          ${deleteButton}
        </div>
        ${meta ? `<p>${escapeHtml(meta)}</p>` : ""}
      </div>
      <figure class="library-team-local-upload-preview">
        ${
          previewUrl
            ? `<img src="${escapeAttr(previewUrl)}" alt="${escapeAttr(name)}" loading="lazy" />`
            : `<div aria-hidden="true"></div>`
        }
      </figure>
    </article>
  `;
}

function formatLocalUploadDisplayName(name) {
  const value = String(name ?? "").trim();
  if (!value) {
    return "未命名上传";
  }
  return value.replace(/\.[^./\\]+$/, "") || value;
}

function renderTeamAssetLocalUploadDeleteButton(asset, name) {
  return `
    <button
      class="library-team-local-upload-delete"
      type="button"
      data-action="delete-team-asset-local-upload"
      data-library-category="${escapeAttr(asset.category ?? "")}"
      data-local-upload-id="${escapeAttr(asset.id ?? "")}"
      aria-label="${escapeAttr(`删除${name}`)}"
    >删除</button>
  `;
}

function renderAssetBoard({ assets, context, folders, selectedCategory, selectedFolder, query, title }) {
  const hasQuery = query.length > 0;
  const category = categoryLabel(selectedCategory);
  const heading = hasQuery ? `搜索“${query}”` : selectedFolder || title;
  const resultCopy = hasQuery ? `找到 ${assets.length} 个资产` : `${assets.length} 个资产`;
  const contextCopy = hasQuery ? "角色、场景、道具" : category;

  return `
    <div class="library-team-board">
      <aside class="library-team-folder-list" aria-label="文件夹">
        ${folders.map((folder) => renderFolderButton(folder, folder === selectedFolder)).join("")}
      </aside>
      <section class="library-team-asset-browser" aria-label="${escapeAttr(title)}">
        <div class="library-team-browser-header">
          <div class="library-team-browser-heading">
            <h2>${escapeHtml(heading)}</h2>
            <p>${escapeHtml(contextCopy)}<span>${escapeHtml(resultCopy)}</span></p>
          </div>
          <div class="library-team-search-row">
            <label class="library-team-search library-team-asset-search">
              <span class="sr-only">搜索</span>
              <input
                type="search"
                placeholder="搜索角色、场景、道具"
                aria-label="搜索"
                data-library-search-input
                value="${escapeAttr(query)}"
              />
            </label>
            ${
              hasQuery
                ? `<button class="library-team-search-clear" type="button" data-action="clear-library-search" aria-label="清空搜索">清空</button>`
                : ""
            }
          </div>
        </div>
        ${renderAssetBrowserBody({ assets, context, selectedCategory, selectedFolder, query })}
      </section>
    </div>
  `;
}

function renderAssetBrowserBody({ assets, context, selectedCategory, selectedFolder = "", query = "" }) {
  if (context.libraryLoading) {
    return renderStatusState("正在加载资产库", " ");
  }

  if (context.libraryError) {
    return renderStatusState("资产库加载失败", context.libraryError);
  }

  if (!assets.length) {
    if (query) {
      return renderStatusState(`没有找到“${query}”`, "试试资产名称、风格或用途。");
    }
    return renderStatusState("暂无匹配资产", "换个分类、文件夹或关键词再试。");
  }

  const selectedAssetId =
    context.libraryDetailAssetId ??
    context.selectedLibraryAssetId ??
    (selectedCategory === "character" ? assets[0]?.id : "");
  const folderClass = assetFolderClass(selectedFolder);

  return `
    <div class="library-team-asset-grid is-${escapeAttr(query ? "mixed" : assetCategoryClass(selectedCategory))}${folderClass ? ` ${escapeAttr(folderClass)}` : ""}">
      ${assets
        .map((asset) =>
          renderAssetCard(asset, {
            selected: asset.id === selectedAssetId,
            selectedCategory,
          }),
        )
        .join("")}
    </div>
  `;
}

function renderStatusState(title, message) {
  return `
    <div class="library-team-empty-state compact">
      <div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
      </div>
    </div>
  `;
}

function renderLockedTeamPanel() {
  return `
    <section class="library-team-locked-panel" aria-label="${escapeAttr(teamAssetGate.title)}">
      <div class="library-team-locked-icon" aria-hidden="true"></div>
      <h2 class="sr-only">${escapeHtml(teamAssetGate.title)}</h2>
      <p>${escapeHtml(teamAssetGate.message)}</p>
      <button class="library-team-button library-team-button-primary" type="button" data-action="open-pricing">立即开通</button>
    </section>
  `;
}

function renderTeamApiPanel() {
  return `
    <section class="library-team-api-panel" aria-label="API">
      <div class="library-team-api-head">
        <p>
          配置团队专属 API，全员共享优质模型。
          <button
            class="library-team-inline-action"
            type="button"
            data-action="show-library-placeholder"
            data-placeholder-message="企业 API 使用位置将在模型调用链路接入后展示。"
          >查看使用位置</button>
        </p>
        <button
          class="library-team-button library-team-button-primary"
          type="button"
          data-action="show-library-placeholder"
          data-placeholder-message="企业 API 配置暂未接入真实服务。"
        >配置企业API服务</button>
      </div>
      <div class="library-team-api-table">
        <table>
          <thead>
            <tr>
              <th>模型名称</th>
              <th>状态</th>
              <th>更新人</th>
              <th>最近更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="library-team-api-empty">
        <div class="library-team-api-empty-icon" aria-hidden="true"></div>
        <p>本团队暂未给任何模型配置企业API服务</p>
      </div>
    </section>
  `;
}

function renderAssetScopeTabs(assetScope, options = {}) {
  const scopes = [
    ["official", "官方资产库"],
    ["team", "团队资产库", "团队复用"],
  ];

  return `
    <nav class="${options.officialTeamOnly ? "library-team-scope-tabs" : "library-team-tabs"}" role="tablist" aria-label="资产库范围">
      ${scopes
        .map(([scope, label]) => {
          const selected = scope === assetScope;
          return `
            <button
              class="${options.officialTeamOnly ? "library-team-scope-tab" : "library-team-tab"}${selected ? " is-active" : ""}"
              type="button"
              role="tab"
              aria-selected="${selected ? "true" : "false"}"
              data-action="set-library-asset-scope"
              data-asset-scope="${escapeAttr(scope)}"
            >
              <span>${escapeHtml(label)}</span>
              ${options.officialTeamOnly && scope === "team" ? '<small class="library-team-scope-badge">团队复用</small>' : ""}
            </button>
          `;
        })
        .join("")}
    </nav>
  `;
}

function renderStaticTab(label, selected) {
  return `
    <button
      class="library-team-category-tab${selected ? " is-active" : ""}"
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
      ${escapeHtml(category.label)}
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
      class="library-team-folder${selected ? " is-active" : ""}"
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
