import { officialAssetLibraryFixture, teamAssetGate } from "./asset-fixtures.js";
import { escapeAttr, escapeHtml } from "./markup.js";
import { renderPricingModal } from "./pricing-modal.js";

const defaultCategories = [
  { id: "character", label: "角色" },
  { id: "scene", label: "场景" },
  { id: "prop", label: "道具" },
];

const teamCategories = [
  ...defaultCategories,
  { id: "voice", label: "音色" },
  { id: "style", label: "风格" },
  { id: "topic", label: "题材" },
  { id: "storyboard", label: "分镜构图" },
  { id: "videoEffect", label: "视频特效" },
  { id: "novelScript", label: "小说转剧本" },
  { id: "splitStoryboard", label: "AI 拆分镜" },
  { id: "api", label: "API" },
];

const teamLocalUploadConfigs = {
  character: {
    mediaType: "image",
    actionLabel: "上传图片",
    helperText: "支持 PNG、JPG、WEBP",
    accept: "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp",
    extensions: ["png", "jpg", "jpeg", "webp"],
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
    rejectMessage: "请选择 PNG、JPG 或 WEBP 图片。",
  },
  scene: {
    mediaType: "image",
    actionLabel: "上传图片",
    helperText: "支持 PNG、JPG、WEBP",
    accept: "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp",
    extensions: ["png", "jpg", "jpeg", "webp"],
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
    rejectMessage: "请选择 PNG、JPG 或 WEBP 图片。",
  },
  prop: {
    mediaType: "image",
    actionLabel: "上传图片",
    helperText: "支持 PNG、JPG、WEBP",
    accept: "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp",
    extensions: ["png", "jpg", "jpeg", "webp"],
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
    rejectMessage: "请选择 PNG、JPG 或 WEBP 图片。",
  },
  voice: {
    mediaType: "audio",
    actionLabel: "上传音频",
    helperText: "支持 MP3、WAV、M4A、AAC",
    accept: "audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/aac,.mp3,.wav,.m4a,.aac",
    extensions: ["mp3", "wav", "m4a", "aac"],
    mimeTypes: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/aac", "audio/x-m4a"],
    rejectMessage: "请选择 MP3、WAV、M4A 或 AAC 音频。",
  },
};

const characterDetailViews = [
  { id: "turnaround", label: "方位图", description: "全景方位参考" },
  { id: "front", label: "正面", description: "标准正面" },
  { id: "side", label: "侧面", description: "侧身轮廓" },
  { id: "back", label: "背面", description: "背部设定" },
  { id: "full-body", label: "远景全身", description: "完整远景" },
];

const frontOnlyCharacterDetailAssetIds = new Set([]);

const frontOnlyCharacterDetailViewIds = new Set(["front", "full-body"]);

const modern3dCharacterAssetIds = new Set([
  "3d-city-hero",
  "3d-city-heroine",
  "3d-ceo",
  "3d-assistant",
  "3d-heiress",
  "3d-lawyer",
]);

const xianxia3dCharacterAssetIds = new Set([
  "3d-xianxia-swordsman",
  "3d-xianxia-master",
  "3d-xianxia-demon",
  "3d-xianxia-fox",
  "3d-xianxia-alchemist",
  "3d-xianxia-elder",
]);

const xianxia2dCharacterAssetIds = new Set([
  "2d-xianxia-green",
  "2d-xianxia-fairy",
  "2d-xianxia-dark",
  "2d-xianxia-talisman",
  "2d-xianxia-beast",
  "2d-xianxia-senior",
]);

const modern2dCharacterAssetIds = new Set([
  "2d-city-girl",
  "2d-city-senior",
  "2d-city-idol",
  "2d-city-editor",
  "2d-city-rider",
  "2d-city-office",
]);

const twoDimensionalCharacterAssetIds = new Set([
  ...modern2dCharacterAssetIds,
  ...xianxia2dCharacterAssetIds,
]);

const sceneDetailViews = [
  { id: "scene-main", label: "场景主图", description: "完整构图" },
];

const propDetailViews = [
  { id: "prop-main", label: "道具主图", description: "标准陈列" },
];

const officialRasterPreviewByAssetId = {
  nanny: "/assets/library/official/characters/nanny.png",
  doctor: "/assets/library/official/characters/doctor.png",
  chef: "/assets/library/official/characters/chef.png",
  teacher: "/assets/library/official/characters/teacher.png",
  driver: "/assets/library/official/characters/driver.png",
  reporter: "/assets/library/official/characters/reporter.png",
  guard: "/assets/library/official/characters/security-guard.png",
  butler: "/assets/library/official/characters/butler.png",
  empress: "/assets/library/official/characters/empress.png",
  emperor: "/assets/library/official/characters/emperor.png",
  eunuch: "/assets/library/official/characters/eunuch.png",
  chancellor: "/assets/library/official/characters/chancellor.png",
  monk: "/assets/library/official/characters/monk.png",
  maid: "/assets/library/official/characters/maid.png",
  wanderer: "/assets/library/official/characters/wanderer.png",
  general: "/assets/library/official/characters/general.png",
  "3d-city-hero": "/assets/library/official/characters/3d-city-hero.png",
  "3d-city-heroine": "/assets/library/official/characters/3d-city-heroine.png",
  "3d-ceo": "/assets/library/official/characters/3d-ceo.png",
  "3d-assistant": "/assets/library/official/characters/3d-assistant.png",
  "3d-heiress": "/assets/library/official/characters/3d-heiress.png",
  "3d-lawyer": "/assets/library/official/characters/3d-lawyer.png",
  "3d-xianxia-swordsman": "/assets/library/official/characters/3d-xianxia-swordsman.png",
  "3d-xianxia-master": "/assets/library/official/characters/3d-xianxia-master.png",
  "3d-xianxia-demon": "/assets/library/official/characters/3d-xianxia-demon.png",
  "3d-xianxia-fox": "/assets/library/official/characters/3d-xianxia-fox.png",
  "3d-xianxia-alchemist": "/assets/library/official/characters/3d-xianxia-alchemist.png",
  "3d-xianxia-elder": "/assets/library/official/characters/3d-xianxia-elder.png",
  "2d-city-girl": "/assets/library/official/characters/2d-city-girl.png",
  "2d-city-senior": "/assets/library/official/characters/2d-city-senior.png",
  "2d-city-idol": "/assets/library/official/characters/2d-city-idol.png",
  "2d-city-editor": "/assets/library/official/characters/2d-city-editor.png",
  "2d-city-rider": "/assets/library/official/characters/2d-city-rider.png",
  "2d-city-office": "/assets/library/official/characters/2d-city-office.png",
  "2d-xianxia-green": "/assets/library/official/characters/2d-xianxia-green.png",
  "2d-xianxia-fairy": "/assets/library/official/characters/2d-xianxia-fairy.png",
  "2d-xianxia-dark": "/assets/library/official/characters/2d-xianxia-dark.png",
  "2d-xianxia-talisman": "/assets/library/official/characters/2d-xianxia-talisman.png",
  "2d-xianxia-beast": "/assets/library/official/characters/2d-xianxia-beast.png",
  "2d-xianxia-senior": "/assets/library/official/characters/2d-xianxia-senior.png",
  "scene-villa": "/assets/library/official/scenes/scene-villa.png",
  "scene-alley": "/assets/library/official/scenes/scene-alley.png",
  "scene-garage": "/assets/library/official/scenes/scene-garage.png",
  "scene-airport": "/assets/library/official/scenes/scene-airport.png",
  "scene-bedroom": "/assets/library/official/scenes/scene-bedroom.png",
  "scene-club": "/assets/library/official/scenes/scene-club.png",
  "scene-office": "/assets/library/official/scenes/scene-office.png",
  "scene-hotel": "/assets/library/official/scenes/scene-hotel.png",
  "scene-ancient-prison": "/assets/library/official/scenes/scene-ancient-prison.png",
  "scene-ancient-mansion": "/assets/library/official/scenes/scene-ancient-mansion.png",
  "scene-ancient-market": "/assets/library/official/scenes/scene-ancient-market.png",
  "scene-ancient-study": "/assets/library/official/scenes/scene-ancient-study.png",
  "scene-ancient-inn": "/assets/library/official/scenes/scene-ancient-inn.png",
  "scene-ancient-restaurant": "/assets/library/official/scenes/scene-ancient-restaurant.png",
  "scene-ancient-garden": "/assets/library/official/scenes/scene-ancient-garden.png",
  "scene-ancient-barracks": "/assets/library/official/scenes/scene-ancient-barracks.png",
  "scene-3d-future-apartment": "/assets/library/official/scenes/scene-3d-future-apartment.png",
  "scene-3d-neon-street": "/assets/library/official/scenes/scene-3d-neon-street.png",
  "scene-3d-studio": "/assets/library/official/scenes/scene-3d-studio.png",
  "scene-3d-campus": "/assets/library/official/scenes/scene-3d-campus.png",
  "scene-3d-smart-garage": "/assets/library/official/scenes/scene-3d-smart-garage.png",
  "scene-3d-cloud-office": "/assets/library/official/scenes/scene-3d-cloud-office.png",
  "scene-3d-cyber-mall": "/assets/library/official/scenes/scene-3d-cyber-mall.png",
  "scene-3d-railway": "/assets/library/official/scenes/scene-3d-railway.png",
  "scene-3d-cloud": "/assets/library/official/scenes/scene-3d-cloud.png",
  "scene-3d-cave": "/assets/library/official/scenes/scene-3d-cave.png",
  "scene-3d-sect": "/assets/library/official/scenes/scene-3d-sect.png",
  "scene-3d-forest": "/assets/library/official/scenes/scene-3d-forest.png",
  "scene-3d-trial-gate": "/assets/library/official/scenes/scene-3d-trial-gate.png",
  "scene-3d-airship": "/assets/library/official/scenes/scene-3d-airship.png",
  "scene-3d-alchemy": "/assets/library/official/scenes/scene-3d-alchemy.png",
  "scene-3d-star-cliff": "/assets/library/official/scenes/scene-3d-star-cliff.png",
  "scene-2d-apartment": "/assets/library/official/scenes/scene-2d-apartment.png",
  "scene-2d-cafe": "/assets/library/official/scenes/scene-2d-cafe.png",
  "scene-2d-classroom": "/assets/library/official/scenes/scene-2d-classroom.png",
  "scene-2d-rooftop": "/assets/library/official/scenes/scene-2d-rooftop.png",
  "scene-2d-subway": "/assets/library/official/scenes/scene-2d-subway.png",
  "scene-2d-campus-playground": "/assets/library/official/scenes/scene-2d-campus-playground.png",
  "scene-2d-store": "/assets/library/official/scenes/scene-2d-store.png",
  "scene-2d-city-bridge": "/assets/library/official/scenes/scene-2d-city-bridge.png",
  "scene-2d-lotus": "/assets/library/official/scenes/scene-2d-lotus.png",
  "scene-2d-sword": "/assets/library/official/scenes/scene-2d-sword.png",
  "scene-2d-bamboo": "/assets/library/official/scenes/scene-2d-bamboo.png",
  "scene-2d-starry": "/assets/library/official/scenes/scene-2d-starry.png",
  "scene-2d-herb-hut": "/assets/library/official/scenes/scene-2d-herb-hut.png",
  "scene-2d-spirit-yard": "/assets/library/official/scenes/scene-2d-spirit-yard.png",
  "scene-2d-moon-bridge": "/assets/library/official/scenes/scene-2d-moon-bridge.png",
  "scene-2d-sect-library": "/assets/library/official/scenes/scene-2d-sect-library.png",
  "prop-modern-badge": "/assets/library/official/props/prop-modern-badge.png",
  "prop-modern-phone": "/assets/library/official/props/prop-modern-phone.png",
  "prop-modern-briefcase": "/assets/library/official/props/prop-modern-briefcase.png",
  "prop-modern-recorder": "/assets/library/official/props/prop-modern-recorder.png",
  "prop-modern-medkit": "/assets/library/official/props/prop-modern-medkit.png",
  "prop-modern-car-key": "/assets/library/official/props/prop-modern-car-key.png",
  "prop-modern-camera": "/assets/library/official/props/prop-modern-camera.png",
  "prop-modern-document-bag": "/assets/library/official/props/prop-modern-document-bag.png",
  "prop-ancient-sword": "/assets/library/official/props/prop-ancient-sword.png",
  "prop-ancient-wine": "/assets/library/official/props/prop-ancient-wine.png",
  "prop-ancient-token": "/assets/library/official/props/prop-ancient-token.png",
  "prop-ancient-edict": "/assets/library/official/props/prop-ancient-edict.png",
  "prop-ancient-secret-letter": "/assets/library/official/props/prop-ancient-secret-letter.png",
  "prop-ancient-poison": "/assets/library/official/props/prop-ancient-poison.png",
  "prop-ancient-jade": "/assets/library/official/props/prop-ancient-jade.png",
  "prop-ancient-seal": "/assets/library/official/props/prop-ancient-seal.png",
  "prop-3d-modern-holo": "/assets/library/official/props/prop-3d-modern-holo.png",
  "prop-3d-modern-band": "/assets/library/official/props/prop-3d-modern-band.png",
  "prop-3d-modern-chip": "/assets/library/official/props/prop-3d-modern-chip.png",
  "prop-3d-modern-headset": "/assets/library/official/props/prop-3d-modern-headset.png",
  "prop-3d-modern-hoverboard": "/assets/library/official/props/prop-3d-modern-hoverboard.png",
  "prop-3d-modern-mech-key": "/assets/library/official/props/prop-3d-modern-mech-key.png",
  "prop-3d-modern-energy": "/assets/library/official/props/prop-3d-modern-energy.png",
  "prop-3d-modern-tracker": "/assets/library/official/props/prop-3d-modern-tracker.png",
  "prop-3d-xianxia-flying-sword": "/assets/library/official/props/prop-3d-xianxia-flying-sword.png",
  "prop-3d-xianxia-spirit-stone": "/assets/library/official/props/prop-3d-xianxia-spirit-stone.png",
  "prop-3d-xianxia-cauldron": "/assets/library/official/props/prop-3d-xianxia-cauldron.png",
  "prop-3d-xianxia-jade-slip": "/assets/library/official/props/prop-3d-xianxia-jade-slip.png",
  "prop-3d-xianxia-compass": "/assets/library/official/props/prop-3d-xianxia-compass.png",
  "prop-3d-xianxia-bag": "/assets/library/official/props/prop-3d-xianxia-bag.png",
  "prop-3d-xianxia-bell": "/assets/library/official/props/prop-3d-xianxia-bell.png",
  "prop-3d-xianxia-herb-box": "/assets/library/official/props/prop-3d-xianxia-herb-box.png",
  "prop-2d-modern-backpack": "/assets/library/official/props/prop-2d-modern-backpack.png",
  "prop-2d-modern-earphone": "/assets/library/official/props/prop-2d-modern-earphone.png",
  "prop-2d-modern-comic": "/assets/library/official/props/prop-2d-modern-comic.png",
  "prop-2d-modern-milk-tea": "/assets/library/official/props/prop-2d-modern-milk-tea.png",
  "prop-2d-modern-subway-card": "/assets/library/official/props/prop-2d-modern-subway-card.png",
  "prop-2d-modern-polaroid": "/assets/library/official/props/prop-2d-modern-polaroid.png",
  "prop-2d-modern-club-badge": "/assets/library/official/props/prop-2d-modern-club-badge.png",
  "prop-2d-modern-sticky-note": "/assets/library/official/props/prop-2d-modern-sticky-note.png",
  "prop-2d-xianxia-talisman": "/assets/library/official/props/prop-2d-xianxia-talisman.png",
  "prop-2d-xianxia-sword": "/assets/library/official/props/prop-2d-xianxia-sword.png",
  "prop-2d-xianxia-medicine": "/assets/library/official/props/prop-2d-xianxia-medicine.png",
  "prop-2d-xianxia-umbrella": "/assets/library/official/props/prop-2d-xianxia-umbrella.png",
  "prop-2d-xianxia-flute": "/assets/library/official/props/prop-2d-xianxia-flute.png",
  "prop-2d-xianxia-lantern": "/assets/library/official/props/prop-2d-xianxia-lantern.png",
  "prop-2d-xianxia-egg": "/assets/library/official/props/prop-2d-xianxia-egg.png",
  "prop-2d-xianxia-scroll": "/assets/library/official/props/prop-2d-xianxia-scroll.png",
};

const officialCharacterDetailSheetByAssetId = {
  nanny: "/assets/library/official/characters/detail/nanny-sheet.png",
  doctor: "/assets/library/official/characters/detail/doctor-sheet.png",
  chef: "/assets/library/official/characters/detail/chef-sheet.png",
  teacher: "/assets/library/official/characters/detail/teacher-sheet.png",
  driver: "/assets/library/official/characters/detail/driver-sheet.png",
  reporter: "/assets/library/official/characters/detail/reporter-sheet.png",
  guard: "/assets/library/official/characters/detail/security-guard-sheet.png",
  butler: "/assets/library/official/characters/detail/butler-sheet.png",
};

const officialCharacterDetailFullBodyByAssetId = {
  nanny: "/assets/library/official/characters/detail/nanny-full-body.png",
  doctor: "/assets/library/official/characters/detail/doctor-full-body.png",
  chef: "/assets/library/official/characters/detail/chef-full-body.png",
  teacher: "/assets/library/official/characters/detail/teacher-full-body.png",
  driver: "/assets/library/official/characters/detail/driver-full-body.png",
  reporter: "/assets/library/official/characters/detail/reporter-full-body.png",
  guard: "/assets/library/official/characters/detail/security-guard-full-body.png",
  butler: "/assets/library/official/characters/detail/butler-full-body.png",
  "3d-city-hero": "/assets/library/official/characters/detail/3d-city-hero-full-body.png",
  "3d-city-heroine": "/assets/library/official/characters/detail/3d-city-heroine-full-body.png",
  "3d-ceo": "/assets/library/official/characters/detail/3d-ceo-full-body.png",
  "3d-assistant": "/assets/library/official/characters/detail/3d-assistant-full-body.png",
  "3d-heiress": "/assets/library/official/characters/detail/3d-heiress-full-body.png",
  "3d-lawyer": "/assets/library/official/characters/detail/3d-lawyer-full-body.png",
  emperor: "/assets/library/official/characters/detail/emperor-full-body.png",
  eunuch: "/assets/library/official/characters/detail/eunuch-full-body.png",
  wanderer: "/assets/library/official/characters/detail/wanderer-full-body.png",
  empress: "/assets/library/official/characters/detail/empress-full-body.png",
  chancellor: "/assets/library/official/characters/detail/chancellor-full-body.png",
  monk: "/assets/library/official/characters/detail/monk-full-body.png",
  maid: "/assets/library/official/characters/detail/maid-full-body.png",
  general: "/assets/library/official/characters/detail/general-full-body.png",
};

function officialGeneratedCharacterDetailSheet(asset) {
  if (asset.category !== "character") {
    return "";
  }
  const id = String(asset.id ?? "").replace(/^library-/, "");
  const previewUrl = officialRasterPreviewByAssetId[id] ?? "";
  const previewMatch = previewUrl.match(/^\/assets\/library\/official\/characters\/(.+)\.png$/);
  if (previewMatch) {
    const detailSlug = previewMatch[1].replace(/-card$/, "");
    return `/assets/library/official/characters/detail/${detailSlug}-sheet.png`;
  }
  if (!/^\d+$/.test(id)) {
    return "";
  }
  const slug = officialCharacterAssetSlug(asset);
  if (slug) {
    return `/assets/library/official/characters/detail/${slug}-sheet.png`;
  }
  return "";
}

export function renderAssetLibraryPage(context = {}) {
  const assetScope = context.assetScope === "team" ? "team" : "official";
  return renderOfficialTeamLibrary({ ...context, assetScope });
}

export function validateTeamAssetLocalUploadFile(category, file) {
  const config = teamLocalUploadConfigs[category];
  if (!config) {
    return {
      ok: false,
      message: "当前分类暂不支持本地上传。",
    };
  }

  const name = String(file?.name ?? "");
  const extension = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  const mimeType = String(file?.type ?? "").toLowerCase();
  const extensionOk = Boolean(extension && config.extensions.includes(extension));
  const mimeOk = Boolean(mimeType && config.mimeTypes.includes(mimeType));

  if ((extension && !extensionOk) || (mimeType && !mimeOk) || (!extensionOk && !mimeOk)) {
    return {
      ok: false,
      message: config.rejectMessage,
    };
  }

  return {
    ok: true,
    mediaType: config.mediaType,
    extension,
    mimeType,
  };
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
  const canUseTeamLocalUploads = assetScope === "team" && !teamLocked;
  const localUploads =
    canUseTeamLocalUploads ? normalizeTeamAssetLocalUploads(context, selectedCategory) : [];
  const localUploadToolbar =
    canUseTeamLocalUploads ? renderTeamAssetLocalUploadToolbar(selectedCategory) : "";
  const title = assetScope === "team" ? "团队资产库" : "官方资产库";
  const detailAsset = assetScope === "team" ? null : resolveDetailAsset(assets, context.libraryDetailAssetId);
  const teamAssetContent = canUseTeamLocalUploads
    ? renderTeamAssetWorkspace(selectedCategory, localUploads)
    : "";

  return `
    <section class="library-team-page official-library-page" aria-labelledby="official-library-title">
      <div class="library-team-shell">
        <header class="library-team-page-head library-team-asset-head">
          <div id="official-library-title">
            ${renderAssetScopeTabs(assetScope, { officialTeamOnly: true })}
          </div>
        </header>
        <nav class="library-team-category-tabs" role="tablist" aria-label="资产分类">
          ${categories.map((category) => renderCategoryTab(category, category.id === selectedCategory)).join("")}
        </nav>
        ${localUploadToolbar}
        ${
          isTeamApi
            ? renderTeamApiPanel()
            : teamLocked
              ? renderLockedTeamPanel()
              : assetScope === "team"
                ? teamAssetContent
                : renderAssetBoard({
                  assets,
                  context,
                  folders,
                  selectedCategory,
                  selectedFolder,
                  query,
                  title,
                })
          }
      </div>
      ${detailAsset ? renderAssetDetailOverlay(detailAsset, context) : ""}
      ${renderPricingModal({ open: context.pricingOpen === true })}
    </section>
  `;
}

function renderTeamAssetWorkspace(selectedCategory, uploads) {
  const localUploadSection = renderTeamAssetLocalUploadSection(selectedCategory, uploads);
  if (localUploadSection) {
    return localUploadSection;
  }

  const config = teamLocalUploadConfigs[selectedCategory];
  const label = categoryLabel(selectedCategory);
  if (!config) {
    return renderStatusState(`${label}暂未接入`, "当前分类暂不展示官方素材内容，后续接入团队素材后会在这里管理。");
  }

  const action = config.mediaType === "audio" ? "上传音频" : "上传图片";
  return renderStatusState(`暂无${label}素材`, `${action}后会保存到团队资产库，并显示在当前分类。`);
}

function renderTeamAssetLocalUploadToolbar(selectedCategory) {
  const config = teamLocalUploadConfigs[selectedCategory];
  if (!config) {
    return "";
  }
  const label = categoryLabel(selectedCategory);

  return `
    <section class="library-team-local-upload-toolbar" aria-label="${escapeAttr(label)}上传">
      <div class="library-team-local-upload-copy">
        <strong>${escapeHtml(label)}上传</strong>
        <span>${escapeHtml(config.helperText)}，上传后会保存到团队资产库，并显示在当前分类。</span>
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
    <section class="library-team-local-upload-section" aria-label="${escapeAttr(label)}团队素材">
      <div class="library-team-local-upload-section-head">
        <div>
          <p>团队素材</p>
          <h2>${escapeHtml(label)}素材</h2>
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
  const name = asset.name ?? asset.fileName ?? "未命名上传";
  const previewUrl = asset.previewUrl ?? asset.sourceUrl ?? asset.url ?? "";
  const status = shouldShowTeamAssetUploadStatus(asset) ? asset.statusLabel : "";
  const statusBadge = status
    ? `<span class="library-team-local-upload-status">${escapeHtml(status)}</span>`
    : "";
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
              ${statusBadge}
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
            ${statusBadge}
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

function shouldShowTeamAssetUploadStatus(asset) {
  return asset.status === "uploading" || asset.status === "failed";
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

function renderCategoryTab(category, selected) {
  return `
    <button
      class="library-team-category-tab${selected ? " is-active" : ""}"
      type="button"
      role="tab"
      aria-selected="${selected ? "true" : "false"}"
      data-action="set-library-category"
      data-library-category="${escapeAttr(category.id)}"
    >
      ${escapeHtml(category.label)}
    </button>
  `;
}

function renderFolderButton(folder, selected) {
  return `
    <button
      class="library-team-folder${selected ? " is-active" : ""}"
      type="button"
      data-action="set-library-folder"
      data-library-folder="${escapeAttr(folder)}"
      title="${escapeAttr(folder)}"
    >
      <span class="library-team-folder-icon" aria-hidden="true"></span>
      <span class="library-team-folder-label">${escapeHtml(folder)}</span>
    </button>
  `;
}

function renderAssetCard(asset, options = {}) {
  const preview = asset.previewUrl ?? asset.latestVersion?.previewUrl ?? "";
  const category = asset.category ?? options.selectedCategory ?? "character";
  const categoryClass = assetCategoryClass(category);
  const selected = options.selected === true;
  const canOpenDetail = ["character", "scene", "prop"].includes(category);
  const referenceClasses = characterReferenceClassNames(asset, category);
  const cardClasses = [
    "library-team-asset-card",
    `is-${categoryClass}`,
    ...referenceClasses,
    selected ? "is-selected" : "",
  ].filter(Boolean);
  const previewClasses = [
    "library-team-asset-preview",
    `is-${categoryClass}`,
    ...referenceClasses,
  ].filter(Boolean);
  return `
    <article class="${escapeAttr(cardClasses.join(" "))}">
      ${
        canOpenDetail
          ? `<button
              class="library-team-asset-open"
              type="button"
              aria-label="查看详情：${escapeAttr(asset.name)}"
              data-action="open-library-asset-detail"
              data-library-asset-id="${escapeAttr(asset.id)}"
            ></button>`
          : ""
      }
      ${
        preview
          ? `<img class="${escapeAttr(previewClasses.join(" "))}" src="${escapeAttr(preview)}" alt="${escapeAttr(asset.name)}" loading="lazy" />`
          : `<div class="${escapeAttr(previewClasses.join(" "))}" aria-hidden="true"></div>`
      }
      <div class="library-team-asset-card-meta">
        <h3>${escapeHtml(asset.name)}</h3>
        ${asset.folder ? `<small>${escapeHtml(asset.folder)}</small>` : ""}
      </div>
    </article>
  `;
}

function characterReferenceClassNames(asset, category) {
  if ((category ?? "character") !== "character") {
    return [];
  }

  const slug = officialCharacterAssetSlug(asset);
  if (!officialRasterPreviewByAssetId[slug]) {
    return [];
  }

  return [
    "is-character-reference",
    isModern3dCharacterAsset(asset) ? "is-modern-3d-character" : "",
    isModern2dCharacterAsset(asset) ? "is-modern-2d-character" : "",
    isXianxia3dCharacterAsset(asset) ? "is-xianxia-3d-character" : "",
    isXianxia2dCharacterAsset(asset) ? "is-xianxia-2d-character" : "",
  ].filter(Boolean);
}

function isModern3dCharacterAsset(asset) {
  const slug = officialCharacterAssetSlug(asset);
  return modern3dCharacterAssetIds.has(slug) || String(asset.folder ?? "") === "3D漫-现代都市";
}

function isXianxia3dCharacterAsset(asset) {
  return xianxia3dCharacterAssetIds.has(officialCharacterAssetSlug(asset));
}

function isModern2dCharacterAsset(asset) {
  return modern2dCharacterAssetIds.has(officialCharacterAssetSlug(asset));
}

function isXianxia2dCharacterAsset(asset) {
  return xianxia2dCharacterAssetIds.has(officialCharacterAssetSlug(asset));
}

function xianxiaCharacterDetailClass(asset) {
  if (isModern3dCharacterAsset(asset)) {
    return " is-modern-3d-character";
  }
  if (isModern2dCharacterAsset(asset)) {
    return " is-modern-2d-character";
  }
  if (isXianxia3dCharacterAsset(asset)) {
    return " is-xianxia-3d-character";
  }
  if (isXianxia2dCharacterAsset(asset)) {
    return " is-xianxia-2d-character";
  }
  return "";
}

function resolveDetailAsset(assets, assetId) {
  if (!assetId) {
    return null;
  }
  const asset = assets.find((item) => item.id === assetId);
  if (!asset || !["character", "scene", "prop"].includes(asset.category ?? "character")) {
    return null;
  }
  return asset;
}

function renderAssetDetailOverlay(asset, context = {}) {
  if ((asset.category ?? "character") === "scene") {
    return renderSceneDetailOverlay(asset, context);
  }
  if ((asset.category ?? "character") === "prop") {
    return renderPropDetailOverlay(asset, context);
  }

  const detailViews = characterDetailViewsForAsset(asset);
  const selectedView = detailViews.some((view) => view.id === context.libraryDetailView)
    ? context.libraryDetailView
    : detailViews[0]?.id ?? "front";
  const activeView = detailViews.find((view) => view.id === selectedView) ?? detailViews[0];
  const imageUrl = buildCharacterDetailPreview(asset, selectedView);
  const imageKindClass = imageUrl.startsWith("data:image/svg+xml") ? " is-vector" : " is-raster";
  const xianxiaDetailClass = xianxiaCharacterDetailClass(asset);
  const scopeLabel = context.assetScope === "team" ? "团队共享资产" : "万兴剧厂公共资产";
  const detailCopy = hasCompleteCharacterDetailViews(asset)
    ? `该角色为${scopeLabel}，已整理方位图、正面、侧面、背面与远景全身参考角度。`
    : `该角色为${scopeLabel}，已整理正面观察与远景全身参考图，未展示重复或不准确的伪角度。`;

  return `
    <div class="library-team-asset-detail-overlay">
      <section
        class="library-team-asset-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="${escapeAttr(asset.name)} 角色详情"
      >
        <div class="library-team-asset-detail-strip" aria-label="角色角度预览">
          <div class="library-team-asset-detail-thumbs">
            ${detailViews
              .map((view) => renderAssetDetailThumb(asset, view, view.id === selectedView))
              .join("")}
          </div>
          <button
            class="library-team-asset-detail-close"
            type="button"
            aria-label="关闭"
            data-action="close-library-asset-detail"
          >×</button>
        </div>
        <div class="library-team-asset-detail-body">
          <figure class="library-team-asset-detail-stage is-character is-${escapeAttr(selectedView)}${imageKindClass}${xianxiaDetailClass}">
            <img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(`${asset.name}${activeView.label}`)}" />
          </figure>
          <aside class="library-team-asset-detail-info">
            <div>
              <p class="library-team-asset-detail-kicker">${escapeHtml(scopeLabel)}</p>
              <h2>${escapeHtml(asset.name)}</h2>
              <p>${escapeHtml(detailCopy)}</p>
            </div>
            <dl class="library-team-asset-detail-meta">
              <div>
                <dt>当前角度</dt>
                <dd>${escapeHtml(activeView.label)}</dd>
              </div>
              <div>
                <dt>资产分类</dt>
                <dd>${escapeHtml(categoryLabel(asset.category ?? "character"))}</dd>
              </div>
              <div>
                <dt>所属板块</dt>
                <dd>${escapeHtml(asset.folder ?? "官方角色")}</dd>
              </div>
            </dl>
            <div class="library-team-asset-detail-actions">
              <button
                class="library-team-button"
                type="button"
                data-action="close-library-asset-detail"
              >关闭</button>
            </div>
          </aside>
        </div>
      </section>
    </div>
  `;
}

function renderSceneDetailOverlay(asset, context = {}) {
  const activeView = sceneDetailViews[0];
  const imageUrl = asset.previewUrl ?? asset.latestVersion?.previewUrl ?? buildFallbackScenePreview(asset);
  const scopeLabel = context.assetScope === "team" ? "团队共享资产" : "万兴剧厂公共资产";

  return `
    <div class="library-team-asset-detail-overlay">
      <section
        class="library-team-asset-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="${escapeAttr(asset.name)} 场景详情"
      >
        <div class="library-team-asset-detail-strip" aria-label="场景预览">
          <div class="library-team-asset-detail-thumbs">
            <button
              class="library-team-asset-detail-thumb is-active is-scene"
              type="button"
              aria-pressed="true"
              data-action="select-library-asset-detail-view"
              data-detail-view="${escapeAttr(activeView.id)}"
            >
              <img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(activeView.label)}" />
              <span>${escapeHtml(activeView.label)}</span>
            </button>
          </div>
          <button
            class="library-team-asset-detail-close"
            type="button"
            aria-label="关闭"
            data-action="close-library-asset-detail"
          >×</button>
        </div>
        <div class="library-team-asset-detail-body">
          <figure class="library-team-asset-detail-stage is-scene">
            <img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(`${asset.name}${activeView.label}`)}" />
          </figure>
          <aside class="library-team-asset-detail-info">
            <div>
              <p class="library-team-asset-detail-kicker">${escapeHtml(scopeLabel)}</p>
              <h2>${escapeHtml(asset.name)}</h2>
              <p>该场景为${escapeHtml(scopeLabel)}，可作为分镜生成、镜头参考和项目统一空间设定。</p>
            </div>
            <dl class="library-team-asset-detail-meta">
              <div>
                <dt>预览类型</dt>
                <dd>${escapeHtml(activeView.label)}</dd>
              </div>
              <div>
                <dt>资产分类</dt>
                <dd>${escapeHtml(categoryLabel(asset.category ?? "scene"))}</dd>
              </div>
              <div>
                <dt>所属板块</dt>
                <dd>${escapeHtml(asset.folder ?? "官方场景")}</dd>
              </div>
            </dl>
            <div class="library-team-asset-detail-actions">
              <button
                class="library-team-button"
                type="button"
                data-action="close-library-asset-detail"
              >关闭</button>
            </div>
          </aside>
        </div>
      </section>
    </div>
  `;
}

function renderPropDetailOverlay(asset, context = {}) {
  const activeView = propDetailViews[0];
  const imageUrl = buildPropDetailPreview(asset, activeView.id);
  const scopeLabel = context.assetScope === "team" ? "团队共享资产" : "万兴剧厂公共资产";

  return `
    <div class="library-team-asset-detail-overlay">
      <section
        class="library-team-asset-detail-dialog is-prop"
        role="dialog"
        aria-modal="true"
        aria-label="${escapeAttr(asset.name)} 道具详情"
      >
        <button
          class="library-team-asset-detail-close"
          type="button"
          aria-label="关闭"
          data-action="close-library-asset-detail"
        >×</button>
        <div class="library-team-asset-detail-body">
          <figure class="library-team-asset-detail-stage is-prop">
            <div class="library-team-asset-detail-prop-plate">
              <img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(`${asset.name}${activeView.label}`)}" />
            </div>
          </figure>
          <aside class="library-team-asset-detail-info">
            <div>
              <p class="library-team-asset-detail-kicker">${escapeHtml(scopeLabel)}</p>
              <h2>${escapeHtml(asset.name)}</h2>
              <p>该道具为${escapeHtml(scopeLabel)}，可作为角色随身物、剧情线索、镜头特写和分镜关键物件使用。</p>
            </div>
            <dl class="library-team-asset-detail-meta">
              <div>
                <dt>预览类型</dt>
                <dd>${escapeHtml(activeView.label)}</dd>
              </div>
              <div>
                <dt>资产分类</dt>
                <dd>${escapeHtml(categoryLabel(asset.category ?? "prop"))}</dd>
              </div>
              <div>
                <dt>所属板块</dt>
                <dd>${escapeHtml(asset.folder ?? "官方道具")}</dd>
              </div>
            </dl>
            <div class="library-team-asset-detail-actions">
              <button
                class="library-team-button"
                type="button"
                data-action="close-library-asset-detail"
              >关闭</button>
            </div>
          </aside>
        </div>
      </section>
    </div>
  `;
}

function renderAssetDetailThumb(asset, view, selected) {
  const xianxiaDetailClass = xianxiaCharacterDetailClass(asset);
  return `
    <button
      class="library-team-asset-detail-thumb is-character${xianxiaDetailClass}${selected ? " is-active" : ""}"
      type="button"
      aria-pressed="${selected ? "true" : "false"}"
      data-action="select-library-asset-detail-view"
      data-detail-view="${escapeAttr(view.id)}"
    >
      <img src="${escapeAttr(buildCharacterDetailPreview(asset, view.id))}" alt="${escapeAttr(view.label)}" />
      <span>${escapeHtml(view.label)}</span>
    </button>
  `;
}

function hasCompleteCharacterDetailViews(asset) {
  const slug = officialCharacterAssetSlug(asset);
  return !frontOnlyCharacterDetailAssetIds.has(slug);
}

function characterDetailViewsForAsset(asset) {
  if (hasCompleteCharacterDetailViews(asset)) {
    return characterDetailViews;
  }
  return characterDetailViews.filter((view) => frontOnlyCharacterDetailViewIds.has(view.id));
}

function renderPropDetailThumb(asset, view, selected) {
  return `
    <button
      class="library-team-asset-detail-thumb${selected ? " is-active" : ""} is-prop"
      type="button"
      aria-pressed="${selected ? "true" : "false"}"
      data-action="select-library-asset-detail-view"
      data-detail-view="${escapeAttr(view.id)}"
    >
      <img src="${escapeAttr(buildPropDetailPreview(asset, view.id))}" alt="${escapeAttr(view.label)}" />
      <span>${escapeHtml(view.label)}</span>
    </button>
  `;
}

function normalizeCategories(categories) {
  if (!Array.isArray(categories) || categories.length === 0) {
    return defaultCategories;
  }
  return categories
    .map((category) => ({
      id: category.id,
      label: category.label ?? categoryLabel(category.id),
    }))
    .filter((category) => category.id);
}

function normalizeFolders(folders) {
  if (Array.isArray(folders) && folders.length > 0) {
    return folders;
  }
  return officialAssetLibraryFixture.folders;
}

function normalizeTeamAssetLocalUploads(context, selectedCategory) {
  const source =
    context.teamAssetLocalUploads ??
    context.localTeamAssetUploads ??
    context.localUploads ??
    {};
  const uploads = source?.[selectedCategory];
  if (!Array.isArray(uploads)) {
    return [];
  }
  return uploads.filter(Boolean).map((asset, index) => ({
    ...asset,
    id: asset.id ?? `team-local-${selectedCategory}-${index}`,
    category: asset.category ?? selectedCategory,
    name: asset.name ?? asset.fileName ?? `本地上传 ${index + 1}`,
  }));
}

function normalizeAssets(
  assets,
  selectedCategory = "character",
  selectedFolder = "",
  query = "",
  filterBySelectedFolder = true,
) {
  if (Array.isArray(assets)) {
    return assets.map((asset) => {
      if (asset.previewUrl || asset.latestVersion?.previewUrl) {
        return asset;
      }
      if (officialRasterPreviewByAssetId[asset.id]) {
        return {
          ...asset,
          previewUrl: officialRasterPreviewByAssetId[asset.id],
        };
      }
      if (asset.category === "scene") {
        return {
          ...asset,
          previewUrl: buildFallbackScenePreview(asset),
        };
      }
      if (asset.category === "prop") {
        return {
          ...asset,
          previewUrl: buildFallbackPropPreview(asset),
        };
      }
      if ((asset.category ?? "character") === "character") {
        return {
          ...asset,
          previewUrl: buildFallbackCharacterPreview(asset),
        };
      }
      return asset;
    }).filter((asset) => {
      if (query) {
        return matchesAssetSearch(asset, query);
      }
      const matchesSelectedFolder =
        !filterBySelectedFolder || !selectedFolder || asset.folder === selectedFolder;
      return (asset.category ?? selectedCategory) === selectedCategory && matchesSelectedFolder;
    });
  }
  return officialAssetLibraryFixture.assets
    .filter(
      (asset) =>
        query
          ? matchesAssetSearch(asset, query)
          : (asset.category ?? "character") === selectedCategory &&
            (!selectedFolder || asset.folder === selectedFolder),
    )
    .map((asset) => ({
      ...asset,
      previewUrl:
        asset.previewUrl ??
        officialRasterPreviewByAssetId[asset.id] ??
        (asset.category === "scene"
          ? buildFallbackScenePreview(asset)
          : asset.category === "prop"
            ? buildFallbackPropPreview(asset)
          : buildFallbackCharacterPreview(asset)),
    }));
}

export function getLibraryAssetsForImport(input = {}) {
  const assetKind = getLibraryTypeByCategory(input.assetKind ?? input.category ?? input.libraryCategory);
  const folder = String(input.folder ?? input.libraryFolder ?? "");
  const searchQuery = String(input.searchQuery ?? input.query ?? "");
  return normalizeAssets(undefined, assetKind, folder, searchQuery, Boolean(folder));
}

export function getLibraryAssetById(assetId) {
  const normalizedId = String(assetId ?? "");
  if (!normalizedId) {
    return null;
  }
  for (const category of defaultCategories) {
    const asset = normalizeAssets(undefined, category.id, "", "", false)
      .find((item) => String(item.id) === normalizedId);
    if (asset) {
      return asset;
    }
  }
  return null;
}

export function getLibraryTypeByCategory(category) {
  const value = String(category ?? "");
  const matchedCategory = defaultCategories.find(
    (item) => item.id === value || item.label === value,
  );
  if (matchedCategory) {
    return matchedCategory.id;
  }
  return ["character", "scene", "prop", "image", "video"].includes(value)
    ? value
    : "character";
}

function matchesAssetSearch(asset, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return true;
  }
  const folder = normalizeSearchText(asset.folder);
  const tags = Array.isArray(asset.tags)
    ? asset.tags.filter((tag) => normalizeSearchText(tag) !== folder).join(" ")
    : "";
  return normalizeSearchText(
    [
      asset.name,
      asset.description,
      tags,
    ].join(" "),
  ).includes(normalizedQuery);
}

function normalizeSearchText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function categoryLabel(category) {
  return (
    {
      character: "角色",
      scene: "场景",
      prop: "道具",
      voice: "音色",
      style: "风格",
      topic: "题材",
      storyboard: "分镜构图",
      videoEffect: "视频特效",
      novelScript: "小说转剧本",
      splitStoryboard: "AI 拆分镜",
      api: "API",
      video: "视频",
      image: "图片",
    }[category] ?? category ?? "资产"
  );
}

function assetCategoryClass(category) {
  return String(category ?? "asset").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
}

function assetFolderClass(folder) {
  const normalizedFolder = String(folder ?? "");
  if (normalizedFolder.includes("现代都市")) {
    return "is-folder-modern-city";
  }
  if (normalizedFolder === "国内仿真人-东方古代") {
    return "is-folder-ancient-real";
  }
  if (normalizedFolder.includes("东方")) {
    return "is-folder-eastern";
  }
  return "";
}

function buildFallbackCharacterPreview(asset) {
  const palette = fallbackCharacterProfile(normalizeCharacterProfileAsset(asset));
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 340">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#ffffff"/>
          <stop offset="1" stop-color="${palette.bg}"/>
        </linearGradient>
      </defs>
      <rect width="240" height="340" rx="8" fill="url(#bg)"/>
      <path d="M18 58c42-30 82-40 122-28c38 12 58 4 82-12v84c-34 18-62 18-98 5c-34-12-70-4-106 24z" fill="${palette.accent}" opacity=".08"/>
      ${fallbackAura(palette)}
      <ellipse cx="120" cy="296" rx="64" ry="10" fill="#171b22" opacity=".12"/>
      ${fallbackBackAccessory(palette)}
      ${fallbackLegs(palette)}
      ${fallbackSleeves(palette)}
      ${fallbackTorso(palette)}
      <circle cx="120" cy="69" r="${palette.anime ? 30 : 27}" fill="#efc3a2"/>
      <path d="M88 68c13-31 54-38 66 2c-16-14-47-15-66-2z" fill="${palette.hair}"/>
      <path d="M90 78c16 10 44 10 60 0" stroke="${palette.hair}" stroke-width="8" stroke-linecap="round"/>
      ${palette.anime ? '<circle cx="110" cy="73" r="3.4" fill="#232632"/><circle cx="130" cy="73" r="3.4" fill="#232632"/>' : ""}
      ${fallbackHeadwear(palette)}
      ${fallbackAccessory(palette)}
    </svg>
  `)}`;
}

function buildFallbackPropPreview(asset) {
  return buildPropPreviewSvg(asset, "prop-main");
}

function buildPropDetailPreview(asset, view = "prop-main") {
  const detailPreview = officialPropDetailPreviewUrl(asset);
  if (detailPreview) {
    return detailPreview;
  }
  const rasterPreview = assetRasterPreviewUrl(asset);
  if (rasterPreview) {
    return rasterPreview;
  }
  return buildPropPreviewSvg(asset, view);
}

function officialPropDetailPreviewUrl(asset) {
  const id = String(asset.id ?? "").replace(/^library-/, "");
  const previewUrl = assetRasterPreviewUrl(asset) || officialRasterPreviewByAssetId[id] || "";
  const match = previewUrl.match(/^\/assets\/library\/official\/props\/(prop-[^/?#]+)\.png(?:[?#].*)?$/);
  if (!match) {
    return "";
  }
  return `/assets/library/official/props/detail/${match[1]}.png`;
}

function buildPropPreviewSvg(asset, view = "prop-main") {
  const profile = propPreviewProfile(asset);
  const detailScale = view === "prop-detail" ? 1.34 : view === "prop-side" ? 0.9 : 1;
  const rotate = view === "prop-side" ? -10 : view === "prop-detail" ? 0 : 0;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 720">
      <defs>
        <linearGradient id="propBg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="${profile.bgA}"/>
          <stop offset="1" stop-color="${profile.bgB}"/>
        </linearGradient>
        <radialGradient id="propGlow" cx=".44" cy=".24" r=".76">
          <stop offset="0" stop-color="#ffffff" stop-opacity=".78"/>
          <stop offset=".5" stop-color="${profile.glow}" stop-opacity=".22"/>
          <stop offset="1" stop-color="${profile.glow}" stop-opacity="0"/>
        </radialGradient>
        <filter id="propShadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="24" stdDeviation="24" flood-color="#0d1018" flood-opacity=".22"/>
        </filter>
      </defs>
      <rect width="960" height="720" rx="28" fill="url(#propBg)"/>
      <rect width="960" height="720" rx="28" fill="url(#propGlow)"/>
      <path d="M96 120c148-72 282-90 402-52c120 38 238 18 366-58v168c-132 72-248 88-366 50c-124-40-254-18-402 62z" fill="${profile.accent}" opacity=".08"/>
      <ellipse cx="480" cy="610" rx="245" ry="34" fill="#111722" opacity=".12"/>
      <g transform="translate(480 360) rotate(${rotate}) scale(${detailScale}) translate(-480 -360)" filter="url(#propShadow)">
        ${renderPropGlyph(profile)}
      </g>
      ${view === "prop-detail" ? renderPropDetailMarks(profile) : ""}
    </svg>
  `)}`;
}

function propPreviewProfile(asset) {
  const id = String(asset.id ?? "");
  const name = String(asset.name ?? "");
  const folder = String(asset.folder ?? "");
  const base = {
    kind: "document",
    bgA: "#f7f8fb",
    bgB: "#e6ebf4",
    body: "#8ea0b8",
    body2: "#56657a",
    accent: "#c59cff",
    trim: "#ffffff",
    dark: "#202734",
    glow: "#d7c8ff",
    line: "#657184",
  };
  const isAncient = folder.includes("东方古代");
  const isXianxia = folder.includes("修仙");
  const isAnime = folder.includes("2D漫");
  const is3d = folder.includes("3D漫");
  const themed = {
    ...base,
    bgA: isAnime ? "#fff7fb" : isXianxia ? "#edf8f4" : isAncient ? "#fbf0df" : is3d ? "#edf3ff" : base.bgA,
    bgB: isAnime ? "#e8eefc" : isXianxia ? "#d7eee5" : isAncient ? "#ead2aa" : is3d ? "#dce8ff" : base.bgB,
    body: isAnime ? "#a48bea" : isXianxia ? "#65a58b" : isAncient ? "#b28a4d" : is3d ? "#5d7eba" : base.body,
    body2: isAnime ? "#5667a4" : isXianxia ? "#2f6f68" : isAncient ? "#7a5030" : is3d ? "#263a64" : base.body2,
    accent: isAnime ? "#ff9dbf" : isXianxia ? "#93dec8" : isAncient ? "#d5a853" : is3d ? "#7bd7ff" : base.accent,
    glow: isAnime ? "#ffcce1" : isXianxia ? "#b7fff0" : isAncient ? "#ffe3a8" : is3d ? "#bde7ff" : base.glow,
  };

  const has = (values) => values.some((value) => name.includes(value) || id.includes(value));
  if (has(["剑", "刀", "sword"])) return { ...themed, kind: "blade" };
  if (has(["壶", "毒药", "药瓶", "奶茶", "饮料", "bottle"])) return { ...themed, kind: "bottle" };
  if (has(["手机", "终端", "手环", "芯片", "耳麦", "追踪器", "录音笔", "相机"])) return { ...themed, kind: "tech" };
  if (has(["令牌", "玉佩", "印玺", "灵石", "罗盘", "徽章", "铃", "蛋", "灯", "笛"])) return { ...themed, kind: "ornament" };
  if (has(["书包", "公文包", "医疗箱", "乾坤袋", "匣"])) return { ...themed, kind: "case" };
  if (has(["纸伞", "滑板"])) return { ...themed, kind: "long" };
  return { ...themed, kind: "document" };
}

function renderPropGlyph(profile) {
  if (profile.kind === "blade") {
    return `
      <path d="M500 96 562 410 500 574 438 410Z" fill="#edf3fa"/>
      <path d="M500 110 524 408 500 522 476 408Z" fill="#cfd9e8"/>
      <rect x="402" y="398" width="196" height="28" rx="14" fill="${profile.accent}"/>
      <rect x="468" y="410" width="64" height="124" rx="20" fill="${profile.body2}"/>
      <circle cx="500" cy="568" r="26" fill="${profile.accent}"/>
    `;
  }
  if (profile.kind === "bottle") {
    return `
      <rect x="438" y="112" width="84" height="70" rx="24" fill="${profile.body2}"/>
      <path d="M420 178h120l18 62c78 72 84 224 24 292H378c-60-68-54-220 24-292z" fill="${profile.body}"/>
      <path d="M406 282c48 34 100 38 158 12v170c-44 32-104 34-168 6z" fill="${profile.trim}" opacity=".28"/>
      <path d="M438 238c34 20 78 22 118 4" stroke="#ffffff" stroke-width="14" stroke-linecap="round" opacity=".45"/>
    `;
  }
  if (profile.kind === "tech") {
    return `
      <rect x="348" y="136" width="264" height="424" rx="48" fill="${profile.dark}"/>
      <rect x="380" y="186" width="200" height="284" rx="28" fill="${profile.body}"/>
      <circle cx="480" cy="510" r="22" fill="${profile.accent}"/>
      <path d="M414 246h132M414 306h96M414 366h152" stroke="${profile.trim}" stroke-width="16" stroke-linecap="round" opacity=".72"/>
      <circle cx="572" cy="178" r="10" fill="${profile.accent}"/>
    `;
  }
  if (profile.kind === "ornament") {
    return `
      <circle cx="480" cy="328" r="148" fill="${profile.body}"/>
      <circle cx="480" cy="328" r="104" fill="${profile.trim}" opacity=".22"/>
      <path d="M480 172 516 276 626 276 536 340 570 448 480 382 390 448 424 340 334 276 444 276z" fill="${profile.accent}"/>
      <path d="M480 96v80M480 480v104M300 328h78M582 328h78" stroke="${profile.body2}" stroke-width="18" stroke-linecap="round"/>
    `;
  }
  if (profile.kind === "case") {
    return `
      <rect x="314" y="214" width="332" height="286" rx="34" fill="${profile.body}"/>
      <path d="M404 214v-42c0-24 20-44 44-44h64c24 0 44 20 44 44v42" fill="none" stroke="${profile.body2}" stroke-width="28" stroke-linecap="round"/>
      <rect x="314" y="304" width="332" height="42" fill="${profile.body2}" opacity=".5"/>
      <rect x="452" y="294" width="56" height="66" rx="10" fill="${profile.accent}"/>
      <path d="M356 438h248" stroke="${profile.trim}" stroke-width="20" stroke-linecap="round" opacity=".42"/>
    `;
  }
  if (profile.kind === "long") {
    return `
      <path d="M250 296c112-132 350-132 460 0z" fill="${profile.body}"/>
      <path d="M250 296c112-70 350-70 460 0" fill="${profile.trim}" opacity=".25"/>
      <path d="M480 148v360c0 48-42 70-78 38" fill="none" stroke="${profile.body2}" stroke-width="22" stroke-linecap="round"/>
      <path d="M314 296h332" stroke="${profile.accent}" stroke-width="14" stroke-linecap="round"/>
    `;
  }
  return `
    <rect x="338" y="126" width="284" height="438" rx="28" fill="${profile.trim}"/>
    <rect x="366" y="158" width="228" height="374" rx="14" fill="${profile.body}" opacity=".22"/>
    <path d="M402 236h156M402 300h118M402 364h156M402 428h92" stroke="${profile.body2}" stroke-width="20" stroke-linecap="round"/>
    <rect x="404" y="462" width="154" height="42" rx="10" fill="${profile.accent}"/>
  `;
}

function renderPropDetailMarks(profile) {
  return `
    <circle cx="682" cy="184" r="42" fill="${profile.accent}" opacity=".22"/>
    <circle cx="692" cy="188" r="10" fill="${profile.accent}"/>
    <path d="M628 222c-74 36-132 46-204 30" stroke="${profile.accent}" stroke-width="8" stroke-linecap="round" opacity=".5" fill="none"/>
  `;
}

function buildFallbackScenePreview(asset) {
  const profile = richSceneProfile(asset);
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <defs>
        <linearGradient id="richSky" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="${profile.skyTop}"/>
          <stop offset=".54" stop-color="${profile.skyMid}"/>
          <stop offset="1" stop-color="${profile.skyBottom}"/>
        </linearGradient>
        <linearGradient id="richGround" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="${profile.groundA}"/>
          <stop offset="1" stop-color="${profile.groundB}"/>
        </linearGradient>
        <radialGradient id="richLight" cx=".34" cy=".18" r=".78">
          <stop offset="0" stop-color="#ffffff" stop-opacity=".62"/>
          <stop offset=".5" stop-color="${profile.glow}" stop-opacity=".2"/>
          <stop offset="1" stop-color="${profile.glow}" stop-opacity="0"/>
        </radialGradient>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#05060a" flood-opacity=".22"/>
        </filter>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency=".82" numOctaves="2" stitchTiles="stitch"/>
          <feColorMatrix type="saturate" values="0"/>
          <feComponentTransfer>
            <feFuncA type="table" tableValues="0 .055"/>
          </feComponentTransfer>
        </filter>
        <clipPath id="roundScene">
          <rect width="1280" height="720" rx="24"/>
        </clipPath>
      </defs>
      <g clip-path="url(#roundScene)">
        <rect width="1280" height="720" fill="url(#richSky)"/>
        <rect width="1280" height="720" fill="url(#richLight)"/>
        ${buildRichScenePreviewBody(asset, profile)}
        <rect width="1280" height="720" fill="#fff" filter="url(#grain)" opacity=".42"/>
        <rect width="1280" height="720" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="2"/>
      </g>
    </svg>
  `)}`;
}

function richSceneProfile(asset) {
  const id = asset.id ?? "";
  const defaultProfile = {
    skyTop: "#d9ecff",
    skyMid: "#eef6ff",
    skyBottom: "#f7f3e7",
    groundA: "#d7c6a9",
    groundB: "#6d715f",
    buildingA: "#f7f0e3",
    buildingB: "#cbb898",
    dark: "#1b202b",
    accent: "#b99461",
    accent2: "#6d8b62",
    glow: "#f6e6c4",
  };
  const profiles = {
    "scene-villa": {
      skyTop: "#cfe7ff",
      skyMid: "#f5fbff",
      skyBottom: "#f3ead8",
      groundA: "#d8d1c2",
      groundB: "#4d6d48",
      buildingA: "#f7efe4",
      buildingB: "#c7b391",
      dark: "#1b1d25",
      accent: "#b99665",
      accent2: "#557a4a",
      glow: "#ffefc9",
    },
    "scene-alley": {
      skyTop: "#cfe0ea",
      skyMid: "#f6efe4",
      skyBottom: "#d5c0a3",
      groundA: "#9b9385",
      groundB: "#5e594f",
      buildingA: "#e5d6c1",
      buildingB: "#7d624b",
      dark: "#2c241f",
      accent: "#da9d73",
      accent2: "#6fa05a",
      glow: "#ffe0b0",
    },
    "scene-garage": {
      skyTop: "#252936",
      skyMid: "#3b3e4a",
      skyBottom: "#171920",
      groundA: "#47433d",
      groundB: "#202228",
      buildingA: "#4e4a45",
      buildingB: "#2d2e35",
      dark: "#12141b",
      accent: "#cdbb8d",
      accent2: "#3e75b8",
      glow: "#f2d69a",
    },
    "scene-airport": {
      skyTop: "#bcd8ef",
      skyMid: "#edf7ff",
      skyBottom: "#8fb4d0",
      groundA: "#657485",
      groundB: "#34404c",
      buildingA: "#eef7ff",
      buildingB: "#8aa4bb",
      dark: "#293544",
      accent: "#ffffff",
      accent2: "#27364a",
      glow: "#eaf9ff",
    },
    "scene-bedroom": {
      skyTop: "#e7dfd3",
      skyMid: "#f8f1e7",
      skyBottom: "#b99a77",
      groundA: "#c59b72",
      groundB: "#4b352b",
      buildingA: "#f5eadb",
      buildingB: "#8b6c55",
      dark: "#2d282a",
      accent: "#e8c891",
      accent2: "#d8d6cf",
      glow: "#ffe7bd",
    },
    "scene-club": {
      skyTop: "#231d22",
      skyMid: "#46342e",
      skyBottom: "#15151c",
      groundA: "#8c6c4f",
      groundB: "#201b1e",
      buildingA: "#d8bf86",
      buildingB: "#4b3430",
      dark: "#12131a",
      accent: "#f0d08c",
      accent2: "#162038",
      glow: "#f7d991",
    },
    "scene-office": {
      skyTop: "#bcd8ef",
      skyMid: "#f5fbff",
      skyBottom: "#c7b083",
      groundA: "#c8a97b",
      groundB: "#5d4737",
      buildingA: "#edf6ff",
      buildingB: "#6f8196",
      dark: "#1e2a36",
      accent: "#d3ad74",
      accent2: "#84a4c2",
      glow: "#effaff",
    },
    "scene-hotel": {
      skyTop: "#d9ead0",
      skyMid: "#fbf8ea",
      skyBottom: "#aac98e",
      groundA: "#9ca97e",
      groundB: "#405936",
      buildingA: "#f4f0e2",
      buildingB: "#bfd2b8",
      dark: "#344a2e",
      accent: "#f2dfac",
      accent2: "#5f7f4d",
      glow: "#fff0c2",
    },
  };

  if (profiles[id]) {
    return profiles[id];
  }
  if (
    id.includes("ancient") ||
    id.includes("palace") ||
    id.includes("courtyard") ||
    id.includes("market")
  ) {
    return {
      ...defaultProfile,
      skyTop: "#f2d6b5",
      skyMid: "#fff0d6",
      skyBottom: "#ba845a",
      groundA: "#b88b5c",
      groundB: "#5c352a",
      buildingA: "#b83d32",
      buildingB: "#6d2424",
      dark: "#351917",
      accent: "#d8a53d",
      accent2: "#2d5b45",
      glow: "#ffd08a",
    };
  }
  if (
    id.includes("lotus") ||
    id.includes("sword") ||
    id.includes("bamboo") ||
    id.includes("starry") ||
    id.includes("herb") ||
    id.includes("spirit") ||
    id.includes("moon") ||
    id.includes("sect-library")
  ) {
    return {
      ...defaultProfile,
      skyTop: "#e8f7ff",
      skyMid: "#ffffff",
      skyBottom: "#b9d4ce",
      groundA: "#b7d6c8",
      groundB: "#345b51",
      buildingA: "#f7f5e8",
      buildingB: "#8ec7b0",
      dark: "#2b4b4e",
      accent: "#d6b4ff",
      accent2: "#7fcfba",
      glow: "#f7e8ff",
    };
  }
  if (id.includes("garden") || id.includes("forest")) {
    return {
      ...defaultProfile,
      skyTop: "#dff3e2",
      skyMid: "#fcfff7",
      skyBottom: "#9ec88d",
      groundA: "#8fb37d",
      groundB: "#314d34",
      buildingA: "#f1ecd8",
      buildingB: "#7b9f70",
      dark: "#2f4933",
      accent: "#e0c986",
      accent2: "#78a96e",
      glow: "#f7ffd7",
    };
  }
  if (
    id.includes("future") ||
    id.includes("neon") ||
    id.includes("studio") ||
    id.includes("campus") ||
    id.includes("smart") ||
    id.includes("cloud-office") ||
    id.includes("cyber") ||
    id.includes("railway")
  ) {
    return {
      ...defaultProfile,
      skyTop: "#b9d9f3",
      skyMid: "#eef7ff",
      skyBottom: "#192033",
      groundA: "#6b7896",
      groundB: "#182033",
      buildingA: "#eaf4ff",
      buildingB: "#536a94",
      dark: "#141a2b",
      accent: "#61d7ff",
      accent2: "#8b6cff",
      glow: "#e5fbff",
    };
  }
  if (
    id.includes("3d") ||
    id.includes("cloud") ||
    id.includes("cave") ||
    id.includes("sect") ||
    id.includes("trial") ||
    id.includes("airship") ||
    id.includes("alchemy") ||
    id.includes("star-cliff")
  ) {
    return {
      ...defaultProfile,
      skyTop: "#dfe9ff",
      skyMid: "#ffffff",
      skyBottom: "#aab8df",
      groundA: "#c6cfe7",
      groundB: "#657299",
      buildingA: "#eff3ff",
      buildingB: "#9aa9d2",
      dark: "#2b3454",
      accent: "#b49cff",
      accent2: "#72cfe9",
      glow: "#f2efff",
    };
  }
  if (id.includes("2d")) {
    return {
      ...defaultProfile,
      skyTop: "#e9f1ff",
      skyMid: "#fff8fb",
      skyBottom: "#ffd4b5",
      groundA: "#d7b58e",
      groundB: "#53607c",
      buildingA: "#fff4ec",
      buildingB: "#9fb0d5",
      dark: "#27304e",
      accent: "#ffb3cf",
      accent2: "#7cc7ff",
      glow: "#fff1bd",
    };
  }
  return defaultProfile;
}

function buildRichScenePreviewBody(asset, profile) {
  const id = asset.id ?? "";
  if (id.includes("villa")) return renderRichVillaScene(profile);
  if (id.includes("alley")) return renderRichAlleyScene(profile);
  if (id.includes("garage")) return renderRichGarageScene(profile);
  if (id.includes("airport")) return renderRichAirportScene(profile);
  if (id.includes("prison")) return renderRichPrisonScene(profile);
  if (id.includes("study") || id.includes("inn") || id.includes("restaurant") || id.includes("alchemy")) {
    return renderRichAncientInteriorScene(profile);
  }
  if (
    id.includes("bedroom") ||
    id.includes("apartment") ||
    id.includes("classroom") ||
    id.includes("cafe") ||
    id.includes("store")
  ) {
    return renderRichInteriorScene(profile, id);
  }
  if (id.includes("club") || id.includes("studio")) return renderRichLoungeScene(profile);
  if (id.includes("office") || id.includes("penthouse")) return renderRichOfficeScene(profile);
  if (
    id.includes("hotel") ||
    id.includes("garden") ||
    id.includes("forest") ||
    id.includes("bamboo") ||
    id.includes("lotus") ||
    id.includes("playground") ||
    id.includes("herb") ||
    id.includes("spirit") ||
    id.includes("moon")
  ) {
    return renderRichGardenScene(profile);
  }
  if (
    id.includes("mansion") ||
    id.includes("market") ||
    id.includes("barracks") ||
    id.includes("palace") ||
    id.includes("courtyard") ||
    id.includes("sect") ||
    id.includes("trial") ||
    id.includes("sword") ||
    id.includes("sect-library")
  ) {
    return renderRichPalaceScene(profile);
  }
  if (
    id.includes("rooftop") ||
    id.includes("street") ||
    id.includes("subway") ||
    id.includes("bridge") ||
    id.includes("campus") ||
    id.includes("mall") ||
    id.includes("railway")
  ) {
    return renderRichModernCityScene(profile);
  }
  return renderRichFantasyScene(profile);
}

function renderRichVillaScene(profile) {
  return `
    <path d="M0 474c160-76 290-82 430-40c124 38 206 34 342-18c162-62 320-54 508 30v274H0Z" fill="url(#richGround)"/>
    <g filter="url(#softShadow)">
      <rect x="270" y="226" width="740" height="318" rx="20" fill="${profile.buildingA}"/>
      <path d="M234 246 640 84l408 162Z" fill="${profile.buildingB}"/>
      <path d="M500 120h280l66 116H434Z" fill="#2d323b"/>
      <rect x="514" y="142" width="72" height="92" rx="10" fill="#e7eef4"/>
      <rect x="694" y="142" width="72" height="92" rx="10" fill="#e7eef4"/>
      <path d="M452 354c0-72 56-122 188-122s188 50 188 122v190H452Z" fill="#efe5d3"/>
      <rect x="560" y="376" width="160" height="168" rx="80" fill="${profile.dark}"/>
      <g fill="#d7e5ee">
        <rect x="354" y="306" width="112" height="116" rx="10"/>
        <rect x="814" y="306" width="112" height="116" rx="10"/>
      </g>
    </g>
    <path d="M170 592h940" stroke="#20242c" stroke-width="18" stroke-linecap="round" opacity=".6"/>
    <g fill="${profile.accent2}">
      <circle cx="222" cy="530" r="56"/>
      <circle cx="1038" cy="520" r="62"/>
      <circle cx="336" cy="582" r="42"/>
      <circle cx="944" cy="594" r="44"/>
    </g>
    <path d="M498 582h284" stroke="${profile.accent}" stroke-width="12" opacity=".74"/>
  `;
}

function renderRichAlleyScene(profile) {
  return `
    <rect y="454" width="1280" height="266" fill="url(#richGround)"/>
    <path d="M0 170h386v550H0Z" fill="${profile.buildingB}"/>
    <path d="M894 146h386v574H894Z" fill="${profile.dark}"/>
    <path d="M384 720 552 234h176l168 486Z" fill="#b7aea0"/>
    <path d="M458 720 606 238M822 720 676 238" stroke="#766f65" stroke-width="12"/>
    <g opacity=".72" fill="#f2e4ce">
      <rect x="54" y="250" width="122" height="82" rx="8"/>
      <rect x="214" y="324" width="108" height="76" rx="8"/>
      <rect x="960" y="238" width="126" height="86" rx="8"/>
    </g>
    <path d="M820 178c122 20 206 86 260 202" stroke="${profile.accent2}" stroke-width="20" fill="none"/>
    <circle cx="942" cy="306" r="44" fill="${profile.accent2}"/>
    <path d="M118 462c78-38 144-28 208 30M930 438c90-30 150-20 230 38" stroke="${profile.accent}" stroke-width="9" opacity=".72"/>
  `;
}

function renderRichGarageScene(profile) {
  return `
    <rect y="248" width="1280" height="472" fill="${profile.dark}"/>
    <path d="M76 720 252 260h776l176 460Z" fill="url(#richGround)"/>
    <path d="M274 126h732l92 104H182Z" fill="#30313a"/>
    <g stroke="${profile.accent}" stroke-width="10" opacity=".74">
      <path d="M308 252h664"/>
      <path d="M176 596h312M792 596h312M238 452h220M822 452h220"/>
    </g>
    <g filter="url(#softShadow)">
      <rect x="166" y="428" width="260" height="78" rx="36" fill="#9a5145"/>
      <rect x="850" y="426" width="264" height="80" rx="38" fill="${profile.accent2}"/>
      <rect x="492" y="384" width="296" height="96" rx="44" fill="#383c45"/>
      <path d="M192 506h208M876 506h214M522 480h236" stroke="#10131a" stroke-width="12"/>
    </g>
    <path d="M640 236v484" stroke="#ffffff" stroke-width="7" opacity=".28"/>
  `;
}

function renderRichAirportScene(profile) {
  return `
    <rect y="472" width="1280" height="248" fill="url(#richGround)"/>
    <g stroke="#ffffff" stroke-width="7" opacity=".7">
      <path d="M142 0v472M330 0v472M518 0v472M706 0v472M894 0v472M1082 0v472"/>
      <path d="M0 144h1280M0 306h1280"/>
    </g>
    <path d="M690 236 1040 142l34 28-252 130 174 52-26 28-238-34-180 92-38-34 138-122-154-60 34-26Z" fill="${profile.dark}" opacity=".88"/>
    <g fill="#242c39" filter="url(#softShadow)">
      <rect x="114" y="558" width="262" height="78" rx="28"/>
      <rect x="506" y="558" width="262" height="78" rx="28"/>
      <rect x="898" y="558" width="262" height="78" rx="28"/>
    </g>
    <path d="M0 470h1280" stroke="#ffffff" stroke-width="9" opacity=".36"/>
  `;
}

function renderRichPrisonScene(profile) {
  return `
    <rect width="1280" height="720" fill="${profile.dark}"/>
    <path d="M0 448h1280v272H0Z" fill="url(#richGround)"/>
    <path d="M110 112h1060v424H110Z" fill="${profile.buildingB}" opacity=".58"/>
    <g stroke="#1b1715" stroke-width="24" opacity=".86">
      <path d="M156 108v424M246 108v424M336 108v424M426 108v424M516 108v424"/>
      <path d="M640 108v424M730 108v424M820 108v424M910 108v424M1000 108v424"/>
      <path d="M110 190h1060M110 358h1060"/>
    </g>
    <path d="M678 90c122 36 210 120 240 246" stroke="#b8d6ff" stroke-width="26" fill="none" opacity=".38"/>
    <path d="M636 98c68 26 114 90 130 192" stroke="#e7f4ff" stroke-width="18" fill="none" opacity=".55"/>
    <g filter="url(#softShadow)">
      <rect x="230" y="486" width="336" height="42" rx="12" fill="#5d4737"/>
      <rect x="760" y="486" width="280" height="42" rx="12" fill="#4b382e"/>
      <circle cx="258" cy="426" r="20" fill="${profile.accent}"/>
    </g>
  `;
}

function renderRichAncientInteriorScene(profile) {
  return `
    <rect width="1280" height="720" fill="${profile.dark}"/>
    <path d="M0 458h1280v262H0Z" fill="url(#richGround)"/>
    <rect x="76" y="88" width="1128" height="494" rx="18" fill="${profile.buildingB}" opacity=".78"/>
    <g stroke="${profile.accent}" stroke-width="9" opacity=".52">
      <path d="M168 108v410M332 108v410M496 108v410M660 108v410M824 108v410M988 108v410"/>
      <path d="M92 212h1096M92 386h1096"/>
    </g>
    <path d="M190 148h286v250H190Z" fill="#2c201c" opacity=".52"/>
    <path d="M756 130h324v292H756Z" fill="#2a1d19" opacity=".48"/>
    <g filter="url(#softShadow)">
      <rect x="392" y="482" width="500" height="86" rx="18" fill="#5b3727"/>
      <rect x="454" y="526" width="376" height="24" rx="12" fill="#2b1c17"/>
      <circle cx="640" cy="350" r="62" fill="${profile.accent}" opacity=".74"/>
      <path d="M640 164v224" stroke="${profile.accent}" stroke-width="8" opacity=".72"/>
    </g>
    <path d="M148 584h980" stroke="#1c1717" stroke-width="16" opacity=".44"/>
  `;
}

function renderRichModernCityScene(profile) {
  return `
    <rect y="452" width="1280" height="268" fill="url(#richGround)"/>
    <g opacity=".95">
      <rect x="78" y="138" width="206" height="348" rx="18" fill="${profile.buildingB}"/>
      <rect x="326" y="74" width="244" height="420" rx="22" fill="${profile.dark}"/>
      <rect x="626" y="118" width="228" height="374" rx="20" fill="${profile.buildingB}"/>
      <rect x="912" y="84" width="282" height="418" rx="22" fill="${profile.dark}"/>
    </g>
    <g fill="${profile.accent}" opacity=".72">
      <rect x="126" y="192" width="54" height="38" rx="8"/>
      <rect x="126" y="266" width="54" height="38" rx="8"/>
      <rect x="408" y="154" width="62" height="46" rx="8"/>
      <rect x="408" y="246" width="62" height="46" rx="8"/>
      <rect x="704" y="198" width="58" height="42" rx="8"/>
      <rect x="1010" y="170" width="66" height="48" rx="8"/>
      <rect x="1010" y="266" width="66" height="48" rx="8"/>
    </g>
    <path d="M0 530c190-64 326-60 476-16c138 40 250 26 406-28c140-48 256-34 398 34v200H0Z" fill="${profile.groundB}" opacity=".76"/>
    <g filter="url(#softShadow)">
      <rect x="186" y="564" width="248" height="64" rx="30" fill="#192033"/>
      <rect x="516" y="552" width="250" height="72" rx="34" fill="${profile.accent2}"/>
      <rect x="844" y="564" width="258" height="64" rx="30" fill="#192033"/>
    </g>
    <path d="M112 504h1056" stroke="#e7f9ff" stroke-width="8" opacity=".42"/>
  `;
}

function renderRichInteriorScene(profile, id) {
  const isClassroom = id.includes("classroom");
  return `
    <rect y="438" width="1280" height="282" fill="url(#richGround)"/>
    <path d="M0 0h1280v438H0Z" fill="${profile.buildingA}"/>
    <rect x="98" y="152" width="520" height="304" rx="22" fill="${profile.buildingB}"/>
    <rect x="152" y="210" width="416" height="178" rx="16" fill="${isClassroom ? "#fff5cc" : "#fff9ee"}"/>
    <path d="M748 150h350v312H748Z" fill="${profile.dark}" opacity=".88"/>
    <path d="M782 196h282M782 252h282M782 308h282" stroke="${profile.accent}" stroke-width="8" opacity=".48"/>
    <circle cx="1048" cy="126" r="42" fill="${profile.accent}" opacity=".78"/>
    <g filter="url(#softShadow)">
      <rect x="660" y="492" width="320" height="62" rx="20" fill="#6b4a3b"/>
      <rect x="408" y="514" width="244" height="88" rx="40" fill="${profile.accent2}" opacity=".82"/>
      <path d="M716 552v104M916 552v104" stroke="#3d2b25" stroke-width="15" stroke-linecap="round"/>
    </g>
    <path d="M130 438h1020" stroke="#ffffff" stroke-width="8" opacity=".22"/>
  `;
}

function renderRichLoungeScene(profile) {
  return `
    <rect width="1280" height="720" fill="${profile.dark}"/>
    <rect x="96" y="92" width="1088" height="520" rx="42" fill="${profile.buildingB}" opacity=".88"/>
    <path d="M374 120h532l96 152H278Z" fill="${profile.buildingA}" opacity=".9"/>
    <ellipse cx="640" cy="530" rx="380" ry="108" fill="${profile.accent}" opacity=".36"/>
    <ellipse cx="640" cy="518" rx="236" ry="62" fill="#2c2425"/>
    <path d="M640 116v228" stroke="${profile.accent}" stroke-width="9"/>
    <circle cx="640" cy="286" r="90" fill="${profile.accent}" opacity=".72"/>
    <g filter="url(#softShadow)" fill="${profile.accent2}">
      <rect x="196" y="402" width="226" height="110" rx="40"/>
      <rect x="858" y="402" width="226" height="110" rx="40"/>
    </g>
  `;
}

function renderRichOfficeScene(profile) {
  return `
    <rect y="432" width="1280" height="288" fill="url(#richGround)"/>
    <rect width="1280" height="432" fill="${profile.dark}"/>
    <g stroke="${profile.buildingB}" stroke-width="9" opacity=".75">
      <path d="M150 0v432M330 0v432M510 0v432M690 0v432M870 0v432M1050 0v432"/>
      <path d="M0 138h1280M0 284h1280"/>
    </g>
    <path d="M70 432c162-112 278-104 384-170 112 106 228 34 342 126 134-88 238-62 412 44Z" fill="${profile.buildingB}" opacity=".74"/>
    <g filter="url(#softShadow)">
      <rect x="456" y="470" width="366" height="124" rx="16" fill="#5d4438"/>
      <rect x="386" y="586" width="510" height="24" rx="12" fill="#332720"/>
      <rect x="594" y="404" width="94" height="76" rx="12" fill="${profile.accent}"/>
    </g>
  `;
}

function renderRichGardenScene(profile) {
  return `
    <rect y="500" width="1280" height="220" fill="url(#richGround)"/>
    <path d="M120 512c190-214 370-230 552-120 154-118 282-100 482 28v300H120Z" fill="${profile.accent2}"/>
    <path d="M216 562c150-100 270-116 412-56 124-62 268-54 438 32" stroke="${profile.buildingA}" stroke-width="24" fill="none" opacity=".9"/>
    <path d="M260 236h760v300H260Z" fill="${profile.buildingA}"/>
    <path d="M260 344h760" stroke="${profile.dark}" stroke-width="16"/>
    <path d="M194 320c76-84 132-94 206-32M880 284c86-64 158-66 238 10" stroke="${profile.accent2}" stroke-width="20" fill="none"/>
    <circle cx="354" cy="564" r="76" fill="${profile.dark}" opacity=".82"/>
    <circle cx="940" cy="548" r="90" fill="${profile.dark}" opacity=".82"/>
  `;
}

function renderRichPalaceScene(profile) {
  return `
    <rect y="506" width="1280" height="214" fill="url(#richGround)"/>
    <g filter="url(#softShadow)">
      <path d="M128 274 640 84l512 190Z" fill="${profile.dark}"/>
      <rect x="178" y="270" width="924" height="250" rx="8" fill="${profile.buildingA}"/>
      <path d="M244 186h792" stroke="${profile.accent}" stroke-width="18"/>
      <rect x="538" y="356" width="204" height="164" rx="8" fill="${profile.dark}"/>
      <g fill="${profile.skyBottom}" opacity=".88">
        <rect x="270" y="324" width="112" height="86" rx="8"/>
        <rect x="438" y="324" width="112" height="86" rx="8"/>
        <rect x="730" y="324" width="112" height="86" rx="8"/>
        <rect x="898" y="324" width="112" height="86" rx="8"/>
      </g>
    </g>
    <path d="M164 586h952" stroke="#3e211a" stroke-width="14" opacity=".44"/>
  `;
}

function renderRichFantasyScene(profile) {
  return `
    <rect y="496" width="1280" height="224" fill="url(#richGround)"/>
    <path d="M0 500c160-132 308-164 490-104c118 40 212 24 326-38c160-86 296-60 464 56v306H0Z" fill="${profile.buildingB}" opacity=".82"/>
    <path d="M206 560c154-92 312-112 464-56c132 48 260 28 478-58" stroke="${profile.buildingA}" stroke-width="24" fill="none" opacity=".78"/>
    <circle cx="986" cy="210" r="82" fill="${profile.accent}" opacity=".58"/>
    <path d="M332 336h616" stroke="${profile.dark}" stroke-width="20" stroke-linecap="round" opacity=".5"/>
    <path d="M462 410 640 168l178 242Z" fill="${profile.buildingA}" opacity=".64"/>
    <path d="M640 178v360" stroke="${profile.accent2}" stroke-width="8" opacity=".66"/>
  `;
}

function fallbackSceneProfile(asset) {
  const byName = {
    别墅: { sky: "#d9ecff", light: "#f9f3e7", mid: "#c8b9a5", dark: "#2a2b31", accent: "#547447", ground: "#d8d2c5" },
    小巷: { sky: "#d8e7f2", light: "#f0eadf", mid: "#756454", dark: "#3f3028", accent: "#719c60", ground: "#958d80" },
    车库: { sky: "#34353d", light: "#56575f", mid: "#343138", dark: "#1f2027", accent: "#d9caa8", ground: "#3a3835" },
    机场: { sky: "#b9d3e9", light: "#e6f3ff", mid: "#5c6d80", dark: "#2d3642", accent: "#f7fbff", ground: "#4c5968" },
    卧室: { sky: "#d4dde6", light: "#f2eee7", mid: "#947b62", dark: "#2f2c2d", accent: "#dfc79d", ground: "#c1a27f" },
    会所: { sky: "#2d2526", light: "#4b3a35", mid: "#8d7254", dark: "#19161a", accent: "#ead6a7", ground: "#312829" },
    办公室: { sky: "#a9c6dd", light: "#eef6ff", mid: "#6f8196", dark: "#27303a", accent: "#c4a77f", ground: "#c4a77f" },
    酒店: { sky: "#d6e4d0", light: "#f7f3e7", mid: "#5d7a4e", dark: "#344d30", accent: "#f0efe5", ground: "#8b8c77" },
    宫殿: { sky: "#f5e3bd", light: "#fff4d4", mid: "#b52d2c", dark: "#5b1c1b", accent: "#d7a331", ground: "#bda472" },
    园林: { sky: "#dcecd8", light: "#f4f1e5", mid: "#5f8a55", dark: "#2f5138", accent: "#e8d3a0", ground: "#a5b78d" },
    古院: { sky: "#ead9c5", light: "#f8efe5", mid: "#8a6042", dark: "#4a3025", accent: "#cfa85e", ground: "#b9a08a" },
    集市: { sky: "#ecd7bd", light: "#fff0d8", mid: "#a45a3d", dark: "#4a2d25", accent: "#d8a45a", ground: "#b98a62" },
    云端公寓: { sky: "#b8d7f4", light: "#f7fbff", mid: "#74869c", dark: "#2d3440", accent: "#8cc7ff", ground: "#c7d2dd" },
    霓虹街区: { sky: "#171d2d", light: "#46335b", mid: "#274a67", dark: "#101421", accent: "#ff6ed1", ground: "#252b3c" },
    直播间: { sky: "#20202a", light: "#535468", mid: "#7161a8", dark: "#171722", accent: "#8bd7ff", ground: "#31313d" },
    学院广场: { sky: "#cbe2f5", light: "#f8fbff", mid: "#9a8c76", dark: "#445260", accent: "#79a466", ground: "#c6bba5" },
    云海仙台: { sky: "#e9f2ff", light: "#ffffff", mid: "#cbd6e8", dark: "#657790", accent: "#a99cff", ground: "#e4e8f2" },
    灵石洞府: { sky: "#25293c", light: "#4a5470", mid: "#5f6f7e", dark: "#171a26", accent: "#7bd0ff", ground: "#394356" },
    宗门大殿: { sky: "#e8eaf5", light: "#ffffff", mid: "#8290b4", dark: "#30384f", accent: "#d8c47a", ground: "#b7bfd2" },
    秘境森林: { sky: "#d9eadf", light: "#f4fff5", mid: "#4f7a5d", dark: "#263d2d", accent: "#9fe0ad", ground: "#6e8b62" },
    漫画公寓: { sky: "#e8f0ff", light: "#fff8fb", mid: "#8aa0c8", dark: "#313b58", accent: "#ffb6cf", ground: "#d8dce8" },
    街角咖啡店: { sky: "#f1dfca", light: "#fff7ea", mid: "#a77958", dark: "#4d352b", accent: "#e0b37a", ground: "#c19a78" },
    黄昏教室: { sky: "#ffdcb5", light: "#fff2d7", mid: "#b98b5c", dark: "#5a3e31", accent: "#ff9f6e", ground: "#c9a47d" },
    天台夜景: { sky: "#11182c", light: "#293c66", mid: "#506a9d", dark: "#0d1220", accent: "#ffd166", ground: "#252d3d" },
    莲池仙境: { sky: "#e9fff7", light: "#ffffff", mid: "#8ccfbd", dark: "#477567", accent: "#e6b5df", ground: "#b8dfd5" },
    剑阵山门: { sky: "#eef4ff", light: "#ffffff", mid: "#8797bd", dark: "#2d3655", accent: "#9cc7ff", ground: "#cfd8ea" },
    竹林秘境: { sky: "#e6f3e4", light: "#fbfff8", mid: "#668e5a", dark: "#2f4c32", accent: "#a7d98f", ground: "#9bbf8c" },
    星河崖畔: { sky: "#151a32", light: "#3a3c6c", mid: "#626a9c", dark: "#0e1224", accent: "#c7b6ff", ground: "#2c3150" },
  };
  return (
    byName[asset.name] ?? {
      sky: "#d8e8f6",
      light: "#f7fbff",
      mid: "#7c8796",
      dark: "#2d3642",
      accent: "#c59cff",
      ground: "#d8d2c5",
    }
  );
}

function buildScenePreviewBody(name, profile) {
  if (name === "车库") {
    return `
      <rect width="1280" height="720" rx="24" fill="${profile.dark}"/>
      <path d="M0 210h1280v510H0Z" fill="#2a2b32"/>
      <path d="M150 236h980l120 484H30Z" fill="${profile.ground}"/>
      <path d="M320 84h640l96 94H224Z" fill="#35333a"/>
      <path d="M230 250h820" stroke="${profile.accent}" stroke-width="16" opacity=".7"/>
      <path d="M156 480h260M864 480h260M88 610h300M900 610h300" stroke="#e8e1d0" stroke-width="10" opacity=".75"/>
      <rect x="170" y="420" width="190" height="72" rx="34" fill="#7d443b"/>
      <rect x="912" y="420" width="190" height="72" rx="34" fill="#314d72"/>
      <rect x="520" y="388" width="240" height="86" rx="40" fill="#3c3d43"/>
    `;
  }
  if (name === "别墅") {
    return `
      <rect width="1280" height="720" rx="24" fill="url(#sceneSky)"/>
      <rect y="430" width="1280" height="290" fill="${profile.ground}"/>
      <rect x="300" y="190" width="680" height="350" rx="12" fill="#f6f1e8"/>
      <path d="M270 214 640 70l370 144Z" fill="#a89a8d"/>
      <rect x="550" y="376" width="180" height="164" rx="82" fill="#1d2028"/>
      <rect x="368" y="280" width="116" height="116" rx="10" fill="#a8bfd2"/>
      <rect x="796" y="280" width="116" height="116" rx="10" fill="#a8bfd2"/>
      <path d="M220 560h840" stroke="#20242c" stroke-width="18"/>
      <circle cx="260" cy="526" r="58" fill="${profile.accent}"/>
      <circle cx="1020" cy="526" r="58" fill="${profile.accent}"/>
    `;
  }
  if (name === "小巷") {
    return `
      <rect width="1280" height="720" rx="24" fill="url(#sceneSky)"/>
      <path d="M0 190h350v530H0Z" fill="${profile.mid}"/>
      <path d="M930 170h350v550H930Z" fill="${profile.dark}"/>
      <path d="M330 720 554 238h172l224 482Z" fill="${profile.ground}"/>
      <path d="M416 720 604 244M864 720 676 244" stroke="#70695f" stroke-width="14"/>
      <path d="M32 270h230M1000 246h210" stroke="#2b2b2d" stroke-width="16"/>
      <path d="M860 188c120 28 166 90 208 182" stroke="${profile.accent}" stroke-width="18" fill="none"/>
      <circle cx="980" cy="276" r="42" fill="${profile.accent}"/>
    `;
  }
  if (name === "办公室") {
    return `
      <rect width="1280" height="720" rx="24" fill="url(#sceneSky)"/>
      <rect y="430" width="1280" height="290" fill="${profile.ground}"/>
      <rect x="0" y="0" width="1280" height="430" fill="${profile.dark}"/>
      <g stroke="${profile.mid}" stroke-width="10">
        <path d="M160 0v430M340 0v430M520 0v430M700 0v430M880 0v430M1060 0v430"/>
        <path d="M0 140h1280M0 286h1280"/>
      </g>
      <path d="M80 430c160-120 260-80 360-170 120 110 220 28 344 126 132-88 234-62 416 44Z" fill="#728398" opacity=".72"/>
      <rect x="470" y="464" width="340" height="118" rx="16" fill="#5e4536"/>
      <rect x="418" y="560" width="444" height="22" rx="11" fill="#382b24"/>
    `;
  }
  if (name === "酒店" || name === "园林" || name === "秘境森林" || name === "竹林秘境") {
    return `
      <rect width="1280" height="720" rx="24" fill="url(#sceneSky)"/>
      <rect y="520" width="1280" height="200" fill="${profile.ground}"/>
      <path d="M160 520c180-220 350-240 520-140 148-130 278-118 446-8v348H160Z" fill="${profile.mid}"/>
      <path d="M220 560c150-100 268-116 402-62 118-68 240-58 430 32" stroke="${profile.light}" stroke-width="26" fill="none"/>
      <path d="M248 250h784v284H248Z" fill="${profile.light}"/>
      <path d="M248 350h784" stroke="${profile.dark}" stroke-width="18"/>
      <circle cx="360" cy="566" r="72" fill="${profile.dark}"/>
      <circle cx="946" cy="550" r="86" fill="${profile.dark}"/>
    `;
  }
  if (name === "会所" || name === "直播间") {
    return `
      <rect width="1280" height="720" rx="24" fill="${profile.dark}"/>
      <rect x="120" y="96" width="1040" height="520" rx="42" fill="${profile.mid}"/>
      <ellipse cx="640" cy="522" rx="360" ry="92" fill="${profile.accent}" opacity=".42"/>
      <ellipse cx="640" cy="508" rx="230" ry="58" fill="#3b3130"/>
      <path d="M420 126h440l92 138H328Z" fill="${profile.light}"/>
      <path d="M640 120v210" stroke="${profile.accent}" stroke-width="10"/>
      <circle cx="640" cy="300" r="88" fill="${profile.accent}" opacity=".72"/>
      <rect x="214" y="398" width="204" height="104" rx="40" fill="#1f2334"/>
      <rect x="862" y="398" width="204" height="104" rx="40" fill="#1f2334"/>
    `;
  }
  if (["宫殿", "古院", "集市", "宗门大殿", "剑阵山门"].includes(name)) {
    return `
      <rect width="1280" height="720" rx="24" fill="url(#sceneSky)"/>
      <rect y="510" width="1280" height="210" fill="${profile.ground}"/>
      <path d="M180 260h920v260H180Z" fill="${profile.mid}"/>
      <path d="M110 270 640 78l530 192Z" fill="${profile.dark}"/>
      <path d="M250 180h780" stroke="${profile.accent}" stroke-width="20"/>
      <rect x="560" y="360" width="160" height="160" rx="8" fill="${profile.dark}"/>
      <g fill="${profile.light}" opacity=".86">
        <rect x="260" y="330" width="100" height="86" rx="8"/>
        <rect x="430" y="330" width="100" height="86" rx="8"/>
        <rect x="750" y="330" width="100" height="86" rx="8"/>
        <rect x="920" y="330" width="100" height="86" rx="8"/>
      </g>
    `;
  }
  if (["机场", "云端公寓", "天台夜景", "星河崖畔", "霓虹街区"].includes(name)) {
    return `
      <rect width="1280" height="720" rx="24" fill="url(#sceneSky)"/>
      <rect y="486" width="1280" height="234" fill="${profile.ground}"/>
      <g stroke="${profile.accent}" stroke-width="8" opacity=".7">
        <path d="M120 0v486M320 0v486M520 0v486M720 0v486M920 0v486M1120 0v486"/>
        <path d="M0 154h1280M0 316h1280"/>
      </g>
      <path d="M720 246 1046 172l26 26-238 112 160 56-30 24-218-42-170 80-34-28 132-110-136-68 30-24Z" fill="${profile.dark}" opacity=".85"/>
      <rect x="130" y="560" width="260" height="72" rx="28" fill="#252a34"/>
      <rect x="506" y="560" width="260" height="72" rx="28" fill="#252a34"/>
      <rect x="882" y="560" width="260" height="72" rx="28" fill="#252a34"/>
    `;
  }
  if (["卧室", "漫画公寓", "街角咖啡店", "黄昏教室"].includes(name)) {
    return `
      <rect width="1280" height="720" rx="24" fill="url(#sceneSky)"/>
      <rect x="0" y="450" width="1280" height="270" fill="${profile.ground}"/>
      <rect x="130" y="190" width="520" height="300" rx="20" fill="${profile.mid}"/>
      <rect x="176" y="250" width="430" height="180" rx="18" fill="${profile.light}"/>
      <rect x="740" y="190" width="330" height="300" rx="18" fill="${profile.dark}" opacity=".86"/>
      <circle cx="1024" cy="164" r="42" fill="${profile.accent}" opacity=".74"/>
      <rect x="688" y="502" width="310" height="54" rx="18" fill="#6b4d3f"/>
      <path d="M740 502v116M950 502v116" stroke="#3f302a" stroke-width="18" stroke-linecap="round"/>
    `;
  }
  return `
    <rect width="1280" height="720" rx="24" fill="url(#sceneSky)"/>
    <rect y="500" width="1280" height="220" fill="${profile.ground}"/>
    <path d="M0 500c160-130 300-168 480-102c110 40 208 34 322-24c160-82 292-66 478 54v292H0Z" fill="${profile.mid}"/>
    <path d="M170 562c160-92 310-116 462-62c130 46 250 36 478-52" stroke="${profile.light}" stroke-width="24" fill="none" opacity=".82"/>
    <circle cx="980" cy="220" r="68" fill="${profile.accent}" opacity=".62"/>
    <path d="M310 330h650" stroke="${profile.dark}" stroke-width="20" stroke-linecap="round" opacity=".55"/>
  `;
}

function buildCharacterDetailPreview(asset, view = "turnaround") {
  const detailPreview = assetCharacterDetailPreviewUrl(asset, view);
  if (detailPreview) {
    return detailPreview;
  }
  const palette = fallbackCharacterProfile(normalizeCharacterProfileAsset(asset));
  const selectedView = characterDetailViews.some((item) => item.id === view) ? view : "turnaround";
  const isTurnaround = selectedView === "turnaround";
  const width = isTurnaround ? 1080 : 720;
  const height = isTurnaround ? 620 : 960;
  const figureMarkup = isTurnaround
    ? `
      ${renderCharacterDetailFigure(palette, "front", "translate(95 96) scale(1.24)")}
      ${renderCharacterDetailFigure(palette, "side", "translate(422 96) scale(1.24)")}
      ${renderCharacterDetailFigure(palette, "back", "translate(745 96) scale(1.24)")}
    `
    : renderCharacterDetailFigure(palette, selectedView, "translate(120 142) scale(2.0)");

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="detailBg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#ffffff"/>
          <stop offset=".52" stop-color="${palette.bg}"/>
          <stop offset="1" stop-color="#f7f7fb"/>
        </linearGradient>
        <radialGradient id="detailGlow" cx=".48" cy=".28" r=".78">
          <stop offset="0" stop-color="${palette.accent}" stop-opacity=".18"/>
          <stop offset=".62" stop-color="${palette.accent}" stop-opacity=".05"/>
          <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" rx="18" fill="url(#detailBg)"/>
      <rect width="${width}" height="${height}" rx="18" fill="url(#detailGlow)"/>
      <path d="M48 104c130-82 254-96 386-42c118 48 210 34 334-34c122-68 220-46 274 28v110c-116-46-202-40-316 20c-126 66-236 72-370 18c-106-42-208-28-308 52z" fill="${palette.accent}" opacity=".07"/>
      <path d="M64 540c172-54 334-62 486-24c160 40 302 26 466-34" stroke="#121621" stroke-width="18" stroke-linecap="round" opacity=".06" fill="none"/>
      ${figureMarkup}
    </svg>
  `)}`;
}

function assetRasterPreviewUrl(asset) {
  const previewUrl = asset.previewUrl ?? asset.latestVersion?.previewUrl ?? "";
  if (!previewUrl || previewUrl.startsWith("data:image/svg+xml")) {
    return "";
  }
  return previewUrl;
}

function officialCharacterAssetSlug(asset) {
  const id = String(asset.id ?? "").replace(/^library-/, "");
  if (officialRasterPreviewByAssetId[id]) {
    return id;
  }

  const previewUrl = assetRasterPreviewUrl(asset) || officialRasterPreviewByAssetId[String(asset.id ?? "")] || "";
  const match = previewUrl.match(/^\/assets\/library\/official\/characters\/(.+)\.png(?:[?#].*)?$/);
  if (match) {
    return match[1].replace(/-card$/, "");
  }

  const normalized = normalizeCharacterProfileAsset(asset);
  return String(normalized.id ?? id).replace(/^library-/, "");
}

function characterDetailViewFromSheet(sheetPath, view) {
  if (!sheetPath) {
    return "";
  }
  if (view === "turnaround") {
    return sheetPath;
  }
  if (view === "front" || view === "side" || view === "back") {
    return sheetPath.replace(/-sheet\.png$/, `-${view}.png`);
  }
  return "";
}

function assetCharacterDetailPreviewUrl(asset, view) {
  const metadataViews = asset.latestVersion?.metadata?.detailViews ?? asset.metadata?.detailViews ?? {};
  const officialSlug = officialCharacterAssetSlug(asset);
  const detailSheet =
    metadataViews.turnaround ??
    metadataViews.detailSheet ??
    officialCharacterDetailSheetByAssetId[asset.id] ??
    officialCharacterDetailSheetByAssetId[officialSlug] ??
    officialGeneratedCharacterDetailSheet(asset) ??
    "";
  const generatedFullBody =
    twoDimensionalCharacterAssetIds.has(officialSlug) || xianxia3dCharacterAssetIds.has(officialSlug)
      ? `/assets/library/official/characters/detail/${officialSlug}-full-body.png`
      : undefined;
  const fullBody =
    metadataViews.fullBody ??
    officialCharacterDetailFullBodyByAssetId[asset.id] ??
    officialCharacterDetailFullBodyByAssetId[officialSlug] ??
    generatedFullBody ??
    assetRasterPreviewUrl(asset);
  const frontView = metadataViews.front || characterDetailViewFromSheet(detailSheet, "front") || fullBody;

  if (!hasCompleteCharacterDetailViews(asset) && view !== "full-body") {
    return frontView;
  }

  if (view === "full-body") {
    return fullBody;
  }
  if (view === "side" || view === "back") {
    return metadataViews[view] || characterDetailViewFromSheet(detailSheet, view);
  }
  return (
    metadataViews[view] ||
    characterDetailViewFromSheet(detailSheet, view) ||
    detailSheet ||
    fullBody
  );
}

function renderCharacterDetailFigure(palette, view, transform) {
  const body =
    view === "side"
      ? renderCharacterSideFigure(palette)
      : view === "back"
        ? renderCharacterBackFigure(palette)
        : renderCharacterFrontFigure(palette);
  return `<g transform="${transform}">${body}</g>`;
}

function renderCharacterFrontFigure(palette) {
  return `
    <ellipse cx="120" cy="318" rx="66" ry="12" fill="#10151f" opacity=".13"/>
    ${fallbackBackAccessory(palette)}
    ${fallbackLegs(palette)}
    ${fallbackSleeves(palette)}
    ${fallbackTorso(palette)}
    <circle cx="120" cy="69" r="${palette.anime ? 30 : 27}" fill="#efc3a2"/>
    <path d="M88 68c13-31 54-38 66 2c-16-14-47-15-66-2z" fill="${palette.hair}"/>
    <path d="M90 78c16 10 44 10 60 0" stroke="${palette.hair}" stroke-width="8" stroke-linecap="round"/>
    <circle cx="110" cy="73" r="${palette.anime ? "3.4" : "2.4"}" fill="#232632"/>
    <circle cx="130" cy="73" r="${palette.anime ? "3.4" : "2.4"}" fill="#232632"/>
    <path d="M112 88c6 4 12 4 18 0" stroke="#bb866e" stroke-width="3" stroke-linecap="round" opacity=".72"/>
    ${fallbackHeadwear(palette)}
    ${fallbackAccessory(palette)}
  `;
}

function renderCharacterSideFigure(palette) {
  return `
    <ellipse cx="120" cy="318" rx="48" ry="11" fill="#10151f" opacity=".13"/>
    ${palette.accessory === "sword" ? `<path d="M148 52 92 254" stroke="${palette.trim}" stroke-width="6" stroke-linecap="round"/>` : ""}
    <rect x="102" y="232" width="22" height="66" rx="9" fill="${palette.lower}"/>
    <rect x="126" y="232" width="18" height="64" rx="8" fill="${palette.lower}" opacity=".72"/>
    <rect x="88" y="296" width="42" height="8" rx="4" fill="#171a20"/>
    <rect x="122" y="294" width="38" height="8" rx="4" fill="#171a20" opacity=".78"/>
    <path d="M96 110h48c18 26 22 82 13 136H88c-8-54-4-108 8-136z" fill="${palette.coat}"/>
    <path d="M130 114c34 18 44 58 35 98c-2 10-9 15-19 14l-16-2z" fill="${palette.sleeve}"/>
    <path d="M106 116c-10 40-12 84-3 130" stroke="${palette.trim}" stroke-width="5" opacity=".45"/>
    <path d="M92 166h62" stroke="${palette.trim}" stroke-width="7" stroke-linecap="round"/>
    <circle cx="122" cy="69" r="${palette.anime ? 30 : 27}" fill="#efc3a2"/>
    <path d="M92 67c12-30 48-37 62-4c-14-8-34-9-62 4z" fill="${palette.hair}"/>
    <path d="M145 68c9 6 13 13 6 18h-13z" fill="#efc3a2"/>
    <circle cx="134" cy="70" r="3" fill="#232632"/>
    <path d="M92 82c14 9 34 10 52 2" stroke="${palette.hair}" stroke-width="8" stroke-linecap="round"/>
    ${fallbackHeadwear(palette)}
    ${palette.accessory === "book" ? `<rect x="150" y="174" width="28" height="38" rx="4" fill="${palette.accent}"/>` : ""}
    ${palette.accessory === "mic" ? `<rect x="154" y="152" width="15" height="28" rx="7" fill="#2d3340"/>` : ""}
    ${palette.accessory === "badge" ? `<rect x="138" y="130" width="22" height="29" rx="4" fill="#eef2fa"/>` : ""}
  `;
}

function renderCharacterBackFigure(palette) {
  const robeBack = ["robe", "court", "dress"].includes(palette.outfit);
  return `
    <ellipse cx="120" cy="318" rx="66" ry="12" fill="#10151f" opacity=".13"/>
    ${palette.accessory === "sword" ? `<path d="M168 52 72 256" stroke="${palette.trim}" stroke-width="6" stroke-linecap="round"/><path d="M178 34 160 66" stroke="${palette.accent}" stroke-width="5" stroke-linecap="round"/>` : ""}
    ${
      robeBack
        ? `<path d="M90 236h60l15 62H75z" fill="${palette.lower}"/><path d="M120 240v54" stroke="${palette.trim}" stroke-width="4" opacity=".35"/>`
        : `<rect x="96" y="230" width="21" height="66" rx="9" fill="${palette.lower}"/><rect x="125" y="230" width="21" height="66" rx="9" fill="${palette.lower}"/>`
    }
    <rect x="78" y="294" width="42" height="8" rx="4" fill="#171a20"/>
    <rect x="122" y="294" width="42" height="8" rx="4" fill="#171a20"/>
    ${
      ["robe", "court"].includes(palette.outfit)
        ? `<path d="M88 110 52 206c-5 14 2 28 18 31l24 5 12-118zM152 110l36 96c5 14-2 28-18 31l-24 5-12-118z" fill="${palette.sleeve}"/>`
        : `<rect x="66" y="116" width="25" height="96" rx="12" fill="${palette.sleeve}"/><rect x="149" y="116" width="25" height="96" rx="12" fill="${palette.sleeve}"/>`
    }
    ${
      robeBack
        ? `<path d="M84 104h72l20 142H64z" fill="${palette.coat}"/>`
        : `<rect x="84" y="104" width="72" height="140" rx="24" fill="${palette.coat}"/>`
    }
    <path d="M120 108v132" stroke="${palette.trim}" stroke-width="4" opacity=".38"/>
    <path d="M86 166h68" stroke="${palette.trim}" stroke-width="7" stroke-linecap="round"/>
    <circle cx="120" cy="69" r="${palette.anime ? 30 : 27}" fill="#efc3a2"/>
    <path d="M89 68c9-33 54-42 63 0c-12 16-50 16-63 0z" fill="${palette.hair}"/>
    <path d="M90 80c18 11 42 11 60 0" stroke="${palette.hair}" stroke-width="8" stroke-linecap="round"/>
    ${fallbackHeadwear(palette)}
  `;
}

function normalizeCharacterProfileAsset(asset) {
  const nameToId = {
    保姆: "nanny",
    医生: "doctor",
    厨师: "chef",
    老师: "teacher",
    司机: "driver",
    记者: "reporter",
    保镖: "guard",
    管家: "butler",
    皇后: "empress",
    皇帝: "emperor",
    太监: "eunuch",
    宰相: "chancellor",
    和尚: "monk",
    宫女: "maid",
    侠客: "wanderer",
    将军: "general",
    都市男主: "3d-city-hero",
    都市女主: "3d-city-heroine",
    霸总: "3d-ceo",
    助理: "3d-assistant",
    富家千金: "3d-heiress",
    律师: "3d-lawyer",
    剑修: "3d-xianxia-swordsman",
    仙尊: "3d-xianxia-master",
    魔尊: "3d-xianxia-demon",
    灵狐少女: "3d-xianxia-fox",
    丹师: "3d-xianxia-alchemist",
    宗门长老: "3d-xianxia-elder",
    元气少女: "2d-city-girl",
    冷面学长: "2d-city-senior",
    偶像练习生: "2d-city-idol",
    漫画编辑: "2d-city-editor",
    机车少年: "2d-city-rider",
    白领姐姐: "2d-city-office",
    青衣剑客: "2d-xianxia-green",
    白衣仙子: "2d-xianxia-fairy",
    黑衣魔修: "2d-xianxia-dark",
    符箓师: "2d-xianxia-talisman",
    灵兽少年: "2d-xianxia-beast",
    宗门师姐: "2d-xianxia-senior",
  };
  const id = String(asset.id ?? "");
  return {
    ...asset,
    id: nameToId[asset.name] ?? id.replace(/^library-/, ""),
  };
}

function fallbackCharacterProfile(asset) {
  const base = {
    coat: "#d7dce9",
    sleeve: "#66759f",
    lower: "#171a20",
    trim: "#8ea2c4",
    accent: "#c59cff",
    hair: "#15171f",
    bg: "#f6f7fb",
    outfit: "modern",
    headwear: "",
    accessory: "",
    fantasy: false,
    anime: false,
  };
  const byId = {
    nanny: { coat: "#d1ad82", sleeve: "#8a6b4b", lower: "#5a3b2e", trim: "#5d3b25", bg: "#fbf5ee", outfit: "apron", headwear: "bun" },
    doctor: { coat: "#f3f7fd", sleeve: "#dbe6f3", lower: "#1d2532", trim: "#6c7f95", bg: "#f5f9ff", outfit: "doctor", accessory: "stethoscope" },
    chef: { coat: "#fbfaf5", sleeve: "#e9e3d6", lower: "#23262d", trim: "#c9bca8", bg: "#fbfaf4", outfit: "chef", headwear: "chefHat" },
    teacher: { coat: "#d8dae8", sleeve: "#aeb7c8", lower: "#7b7f8d", trim: "#4c566b", bg: "#f7f7fb", outfit: "skirt", accessory: "book", headwear: "bun" },
    driver: { coat: "#202734", sleeve: "#111821", lower: "#151a22", trim: "#596274", bg: "#f2f4f7", outfit: "uniform", headwear: "cap", accessory: "wheel" },
    reporter: { coat: "#d2d9e4", sleeve: "#b9c1ce", lower: "#171c25", trim: "#3e6fa0", bg: "#f4f7fb", outfit: "modern", accessory: "mic" },
    guard: { coat: "#14171d", sleeve: "#262a33", lower: "#101318", trim: "#6e7685", bg: "#f3f4f7", outfit: "suit", accessory: "sunglasses" },
    butler: { coat: "#242936", sleeve: "#11151d", lower: "#151821", trim: "#ffffff", accent: "#c9a66b", bg: "#f4f3f0", outfit: "suit", accessory: "badge" },
    empress: { coat: "#6b3f1e", sleeve: "#171210", lower: "#312016", trim: "#d8a326", accent: "#e6c56d", hair: "#1a1412", bg: "#fbf3e7", outfit: "robe", headwear: "crown", accessory: "fan" },
    emperor: { coat: "#d8a326", sleeve: "#7f271f", lower: "#4f2814", trim: "#b91f24", accent: "#e9c45e", hair: "#1d1714", bg: "#fbf4df", outfit: "robe", headwear: "emperorCrown" },
    eunuch: { coat: "#496f94", sleeve: "#9aaec8", lower: "#1f2530", trim: "#243047", bg: "#eef4fb", outfit: "court", headwear: "courtHat" },
    chancellor: { coat: "#7a2424", sleeve: "#2d1a1a", lower: "#301818", trim: "#c7a058", bg: "#fbefeb", outfit: "court", headwear: "courtHat" },
    monk: { coat: "#d19a35", sleeve: "#e1b75b", lower: "#7c4b21", trim: "#7c4b21", bg: "#f8f0dc", outfit: "robe", accessory: "beads" },
    maid: { coat: "#b8cfe2", sleeve: "#e5edf5", lower: "#809fbd", trim: "#7ba4c4", bg: "#f4f8fb", outfit: "robe", headwear: "bun" },
    wanderer: { coat: "#34443f", sleeve: "#7d8a78", lower: "#2a2926", trim: "#8b5f37", bg: "#edf2ed", outfit: "robe", accessory: "sword" },
    general: { coat: "#1b1f25", sleeve: "#2d3139", lower: "#13171e", trim: "#c29b4b", accent: "#6b5c45", bg: "#f0eee8", outfit: "court", accessory: "sword", headwear: "courtHat" },
    "3d-city-hero": { coat: "#303642", sleeve: "#677283", lower: "#141922", trim: "#a9b7c9", bg: "#f4f7fb", outfit: "suit" },
    "3d-city-heroine": { coat: "#d7c7ba", sleeve: "#f0e7dd", lower: "#1d222c", trim: "#a47b65", bg: "#fbf6f2", outfit: "dress", headwear: "bun" },
    "3d-ceo": { coat: "#12151b", sleeve: "#232936", lower: "#0f1218", trim: "#ffffff", bg: "#f3f4f7", outfit: "suit" },
    "3d-assistant": { coat: "#63718a", sleeve: "#c4cad6", lower: "#242b38", trim: "#eef2fa", bg: "#f5f7fb", outfit: "modern", accessory: "badge" },
    "3d-heiress": { coat: "#bfa5bd", sleeve: "#efd7e8", lower: "#6b526e", trim: "#f4eff6", bg: "#fff5fb", outfit: "dress", headwear: "bun" },
    "3d-lawyer": { coat: "#20252f", sleeve: "#384255", lower: "#151a22", trim: "#e7edf6", bg: "#f3f5f8", outfit: "suit", accessory: "book" },
    "3d-xianxia-swordsman": { coat: "#2c3344", sleeve: "#b8c2d7", lower: "#1d2433", trim: "#8ea7d8", accent: "#8bd7ff", bg: "#eef5ff", outfit: "robe", accessory: "sword", fantasy: true },
    "3d-xianxia-master": { coat: "#e8e9f2", sleeve: "#cfd7e8", lower: "#7c869b", trim: "#a99cff", accent: "#ffffff", bg: "#f6f7ff", outfit: "robe", accessory: "halo", fantasy: true },
    "3d-xianxia-demon": { coat: "#231824", sleeve: "#4e1725", lower: "#161017", trim: "#b13d57", accent: "#6a233b", bg: "#f7eef3", outfit: "robe", accessory: "sword", fantasy: true },
    "3d-xianxia-fox": { coat: "#d7c3af", sleeve: "#f3e1d0", lower: "#5a4150", trim: "#d79fbe", bg: "#fff6fb", outfit: "robe", headwear: "fox", fantasy: true },
    "3d-xianxia-alchemist": { coat: "#4f6c5e", sleeve: "#9eb8a8", lower: "#2b3831", trim: "#d2bd75", bg: "#eef8f1", outfit: "robe", accessory: "potion", fantasy: true },
    "3d-xianxia-elder": { coat: "#6c6f83", sleeve: "#c2c6d2", lower: "#313441", trim: "#b6a27a", hair: "#4b4b4f", bg: "#f3f2ee", outfit: "robe", accessory: "book", fantasy: true },
    "2d-city-girl": { coat: "#f0a6b4", sleeve: "#ffd8e0", lower: "#4c5870", trim: "#ffffff", accent: "#ffca66", bg: "#fff4f7", outfit: "anime", headwear: "bun", anime: true },
    "2d-city-senior": { coat: "#313849", sleeve: "#576075", lower: "#1c2230", trim: "#e7edf8", accent: "#8db0ff", bg: "#eef2fb", outfit: "anime", accessory: "book", anime: true },
    "2d-city-idol": { coat: "#9674d6", sleeve: "#d7c3ff", lower: "#25233c", trim: "#ffffff", accent: "#ffc6e0", bg: "#f7f1ff", outfit: "anime", accessory: "mic", anime: true },
    "2d-city-editor": { coat: "#697487", sleeve: "#c8cfdb", lower: "#242934", trim: "#f2f4fa", accent: "#ffb469", bg: "#f3f5f8", outfit: "anime", accessory: "book", anime: true },
    "2d-city-rider": { coat: "#1d222b", sleeve: "#56616f", lower: "#11161f", trim: "#e35d5d", accent: "#ffd166", bg: "#f4f1ec", outfit: "anime", accessory: "wheel", anime: true },
    "2d-city-office": { coat: "#dfe3eb", sleeve: "#9ca7ba", lower: "#252b38", trim: "#6c7c9a", accent: "#8ed0c8", bg: "#f7f8fb", outfit: "anime", accessory: "badge", anime: true },
    "2d-xianxia-green": { coat: "#49766c", sleeve: "#c7d8d1", lower: "#243a37", trim: "#b8d7ca", accent: "#7bd0b7", bg: "#edf8f5", outfit: "robe", accessory: "sword", fantasy: true, anime: true },
    "2d-xianxia-fairy": { coat: "#e8edf4", sleeve: "#c9d6ec", lower: "#7c8ba4", trim: "#f6fbff", accent: "#c7b6ff", bg: "#f7f8ff", outfit: "robe", accessory: "halo", fantasy: true, anime: true },
    "2d-xianxia-dark": { coat: "#181a22", sleeve: "#383040", lower: "#11121a", trim: "#8a496f", accent: "#c0486a", bg: "#f6eef4", outfit: "robe", accessory: "sword", fantasy: true, anime: true },
    "2d-xianxia-talisman": { coat: "#c69b4f", sleeve: "#ead7a7", lower: "#534329", trim: "#8f5f29", accent: "#dfb45e", bg: "#fbf5e8", outfit: "robe", accessory: "talisman", fantasy: true, anime: true },
    "2d-xianxia-beast": { coat: "#6d7f54", sleeve: "#c2d0a8", lower: "#334229", trim: "#d9e4ad", bg: "#f3f8ed", outfit: "robe", headwear: "beast", fantasy: true, anime: true },
    "2d-xianxia-senior": { coat: "#b4c0d8", sleeve: "#e1e7f3", lower: "#5e6b86", trim: "#7186b0", bg: "#f5f6fb", outfit: "robe", headwear: "bun", fantasy: true, anime: true },
  };
  return { ...base, ...(byId[asset.id] ?? {}) };
}

function fallbackAura(palette) {
  return palette.fantasy
    ? `<circle cx="120" cy="120" r="78" fill="${palette.accent}" opacity=".1"/><path d="M46 132c42-34 106-42 148-6" stroke="${palette.accent}" stroke-width="4" opacity=".25" fill="none"/>`
    : "";
}

function fallbackBackAccessory(palette) {
  return palette.accessory === "sword"
    ? `<path d="M174 48 74 250" stroke="${palette.trim}" stroke-width="6" stroke-linecap="round"/><path d="M184 28 166 62" stroke="${palette.accent}" stroke-width="5" stroke-linecap="round"/>`
    : "";
}

function fallbackLegs(palette) {
  if (["robe", "court", "dress"].includes(palette.outfit)) {
    return `<path d="M90 236h60l15 62H75z" fill="${palette.lower}"/><path d="M120 240v54" stroke="${palette.trim}" stroke-width="4" opacity=".45"/><rect x="78" y="294" width="42" height="8" rx="4" fill="#171a20"/><rect x="122" y="294" width="42" height="8" rx="4" fill="#171a20"/>`;
  }
  return `<rect x="96" y="230" width="21" height="66" rx="9" fill="${palette.lower}"/><rect x="125" y="230" width="21" height="66" rx="9" fill="${palette.lower}"/><rect x="80" y="294" width="40" height="8" rx="4" fill="#171a20"/><rect x="122" y="294" width="40" height="8" rx="4" fill="#171a20"/>`;
}

function fallbackSleeves(palette) {
  if (["robe", "court"].includes(palette.outfit)) {
    return `<path d="M88 110 52 206c-5 14 2 28 18 31l24 5 12-118zM152 110l36 96c5 14-2 28-18 31l-24 5-12-118z" fill="${palette.sleeve}"/>`;
  }
  return `<rect x="66" y="116" width="25" height="96" rx="12" fill="${palette.sleeve}"/><rect x="149" y="116" width="25" height="96" rx="12" fill="${palette.sleeve}"/>`;
}

function fallbackTorso(palette) {
  if (palette.outfit === "doctor") {
    return `<rect x="84" y="104" width="72" height="140" rx="16" fill="#f8fbff"/><path d="M100 110 120 154l20-44" fill="#e4ebf5"/><path d="M120 112v126" stroke="${palette.trim}" stroke-width="4"/>`;
  }
  if (palette.outfit === "chef") {
    return `<rect x="84" y="104" width="72" height="140" rx="18" fill="#fbfaf5"/><path d="M106 112h28v126h-28z" fill="#e2ddd0"/><circle cx="111" cy="142" r="3" fill="#c7b99e"/><circle cx="130" cy="142" r="3" fill="#c7b99e"/>`;
  }
  if (palette.outfit === "suit") {
    return `<rect x="84" y="104" width="72" height="140" rx="17" fill="${palette.coat}"/><path d="M95 104 120 160l25-56v140H95z" fill="${palette.sleeve}"/><path d="M108 112 120 137l12-25" fill="${palette.trim}"/>`;
  }
  if (palette.outfit === "skirt") {
    return `<path d="M86 104h68l12 96-28 44h-36l-28-44z" fill="${palette.coat}"/><path d="M102 190h36l22 54H80z" fill="${palette.lower}"/>`;
  }
  if (["robe", "court", "dress"].includes(palette.outfit)) {
    return `<path d="M84 104h72l20 142H64z" fill="${palette.coat}"/><path d="M120 106 78 246h84z" fill="${palette.sleeve}" opacity=".55"/><path d="M86 166h68" stroke="${palette.trim}" stroke-width="7" stroke-linecap="round"/><path d="M120 108v132" stroke="${palette.trim}" stroke-width="3" opacity=".5"/>`;
  }
  return `<rect x="84" y="104" width="72" height="140" rx="24" fill="${palette.coat}"/><path d="M96 116c13 14 35 14 48 0" stroke="${palette.trim}" stroke-width="7" stroke-linecap="round" opacity=".72"/><path d="M120 112v126" stroke="${palette.trim}" stroke-width="3" opacity=".55"/>`;
}

function fallbackHeadwear(palette) {
  const map = {
    cap: `<path d="M90 55h60l11 16H79z" fill="${palette.trim}"/><path d="M96 46h48v14H96z" fill="${palette.coat}"/>`,
    chefHat: `<path d="M88 50c-4-18 15-22 23-10 8-16 34-8 30 11 12-1 19 15 8 24H91c-13-10-7-26-3-25z" fill="#fff" stroke="#e6e0d2" stroke-width="3"/>`,
    crown: `<path d="M88 45 104 63l16-27 16 27 16-18 8 32H80z" fill="${palette.trim}"/>`,
    emperorCrown: `<rect x="95" y="44" width="50" height="20" rx="3" fill="${palette.trim}"/><path d="M86 50h68" stroke="${palette.accent}" stroke-width="6"/><path d="M120 28v24" stroke="${palette.trim}" stroke-width="6"/>`,
    courtHat: `<path d="M94 47h52l12 23H82z" fill="${palette.trim}"/><rect x="80" y="56" width="80" height="9" rx="4" fill="${palette.hair}"/>`,
    bun: `<circle cx="91" cy="62" r="10" fill="${palette.hair}"/><circle cx="149" cy="62" r="10" fill="${palette.hair}"/>`,
    fox: `<path d="M98 44 109 63 86 60zM142 44 131 63 154 60z" fill="${palette.hair}"/>`,
    beast: `<path d="M99 43 110 62 88 59zM141 43 130 62 152 59z" fill="${palette.hair}"/>`,
  };
  return map[palette.headwear] ?? "";
}

function fallbackAccessory(palette) {
  const map = {
    stethoscope: `<path d="M104 132c0 22 32 22 32 0" stroke="#43566e" stroke-width="4" fill="none"/><circle cx="136" cy="161" r="6" fill="#43566e"/>`,
    book: `<rect x="146" y="174" width="28" height="40" rx="4" fill="${palette.accent}"/><path d="M152 184h14M152 194h10" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`,
    wheel: `<circle cx="170" cy="174" r="16" fill="none" stroke="${palette.accent}" stroke-width="4"/><path d="M170 158v32M154 174h32" stroke="${palette.accent}" stroke-width="3"/>`,
    mic: `<rect x="152" y="150" width="16" height="30" rx="8" fill="#2d3340"/><path d="M160 180v28M146 208h28" stroke="#2d3340" stroke-width="5" stroke-linecap="round"/>`,
    badge: `<rect x="140" y="128" width="23" height="31" rx="4" fill="#eef2fa"/><path d="M145 140h13M145 149h9" stroke="${palette.trim}" stroke-width="3" stroke-linecap="round"/>`,
    beads: `<path d="M100 130c10 20 33 28 46 4" stroke="#7b4e24" stroke-width="4" fill="none"/><circle cx="100" cy="130" r="3" fill="#6b3d1f"/><circle cx="112" cy="143" r="3" fill="#6b3d1f"/><circle cx="124" cy="148" r="3" fill="#6b3d1f"/>`,
    fan: `<path d="M148 150c25-18 46-14 55 8-18 7-35 7-55-8z" fill="${palette.accent}"/><path d="M151 153l46 3M156 145l36 18" stroke="#5d351b" stroke-width="2.5"/>`,
    talisman: `<rect x="154" y="150" width="23" height="46" rx="2" fill="#f4d36e"/><path d="M161 161h9M160 173h12M166 183v8" stroke="#8f4f23" stroke-width="3"/>`,
    potion: `<path d="M154 152h15v14l10 32c3 9-3 17-12 17h-12c-9 0-15-8-12-17l11-32z" fill="#8ad8a6"/>`,
    halo: `<ellipse cx="120" cy="38" rx="30" ry="7" fill="none" stroke="${palette.accent}" stroke-width="4"/>`,
  };
  return map[palette.accessory] ?? "";
}
