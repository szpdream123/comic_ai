import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { inflateSync } from "node:zlib";

import { renderLibraryTeam } from "../src/features/library-team/index.js";
import { validateTeamAssetLocalUploadFile } from "../src/features/library-team/asset-library-page.js";
import {
  removeTeamAssetLocalUpload,
  renderProductionWorkbench,
} from "../src/features/production-workbench/index.js";
import { officialAssetLibraryFixture } from "../src/features/library-team/asset-fixtures.js";
import { renderPricingModal } from "../src/features/library-team/pricing-modal.js";
import { renderMemberRulesModal } from "../src/features/library-team/member-rules-modal.js";
import { creatorApi } from "../src/shared/creator-api.js";
import { pricingPlans } from "../src/shared/commerce-fixtures.js";
import { permissionRows, teamRoles } from "../src/shared/permissions-fixtures.js";

function assertIncludesAll(html: string, labels: string[]) {
  for (const label of labels) {
    assert.match(html, new RegExp(escapeRegExp(label)), `Expected HTML to include ${label}`);
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderWorkbenchTab(activeNavTab: string, ui = {}) {
  return renderProductionWorkbench({
    state: {},
    session: { user: { phone: "13800138000" } },
    ui: {
      activeNavTab,
      busy: false,
      toast: "ready",
      exportHistory: [],
      storyboards: [],
      ...ui,
    },
  });
}

function assetCardFolders(html: string) {
  return [
    ...html.matchAll(
      /<div class="library-team-asset-card-meta">[\s\S]*?<small>([^<]+)<\/small>/g,
    ),
  ].map((match) => match[1]);
}

const twoDimensionalCharacterAssets = [
  ["2D漫-现代都市", "2d-city-girl", "元气少女"],
  ["2D漫-现代都市", "2d-city-senior", "冷面学长"],
  ["2D漫-现代都市", "2d-city-idol", "偶像练习生"],
  ["2D漫-现代都市", "2d-city-editor", "漫画编辑"],
  ["2D漫-现代都市", "2d-city-rider", "机车少年"],
  ["2D漫-现代都市", "2d-city-office", "白领姐姐"],
  ["2D漫-东方修仙", "2d-xianxia-green", "青衣剑客"],
  ["2D漫-东方修仙", "2d-xianxia-fairy", "白衣仙子"],
  ["2D漫-东方修仙", "2d-xianxia-dark", "黑衣魔修"],
  ["2D漫-东方修仙", "2d-xianxia-talisman", "符箓师"],
  ["2D漫-东方修仙", "2d-xianxia-beast", "灵兽少年"],
  ["2D漫-东方修仙", "2d-xianxia-senior", "宗门师姐"],
] as const;

const twoDimensionalCharacterAssetIds = twoDimensionalCharacterAssets.map(([, assetId]) => assetId);

const xianxia2dCharacterAssetIds = twoDimensionalCharacterAssetIds.filter((assetId) =>
  assetId.startsWith("2d-xianxia-"),
);

const modern3dCharacterAssets = [
  ["3d-city-hero", "Urban Hero"],
  ["3d-city-heroine", "Urban Heroine"],
  ["3d-ceo", "CEO"],
  ["3d-assistant", "Assistant"],
  ["3d-heiress", "Heiress"],
  ["3d-lawyer", "Lawyer"],
] as const;

const xianxia3dCharacterAssets = [
  ["3d-xianxia-swordsman", "Xianxia Swordsman"],
  ["3d-xianxia-master", "Xianxia Master"],
  ["3d-xianxia-demon", "Xianxia Demon"],
  ["3d-xianxia-fox", "Xianxia Fox"],
  ["3d-xianxia-alchemist", "Xianxia Alchemist"],
  ["3d-xianxia-elder", "Xianxia Elder"],
] as const;

function hashFixtureImage(path: string) {
  const file = readFileSync(new URL(`..${path}`, import.meta.url));
  return createHash("sha256").update(file).digest("hex");
}

function pngDimensions(path: string) {
  const file = readFileSync(new URL(`..${path}`, import.meta.url));
  assert.equal(file.subarray(1, 4).toString("ascii"), "PNG", `${path} should be a PNG`);
  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
  };
}

function readPngRgbaFixture(path: string) {
  const file = readFileSync(new URL(`..${path}`, import.meta.url));
  assert.equal(file.subarray(1, 4).toString("ascii"), "PNG", `${path} should be a PNG`);

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks: Buffer[] = [];

  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunk = file.subarray(dataStart, dataEnd);

    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
      interlace = chunk[12];
    } else if (type === "IDAT") {
      idatChunks.push(chunk);
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  assert.equal(bitDepth, 8, `${path} should use 8-bit PNG channels`);
  assert.ok([2, 6].includes(colorType), `${path} should be true-color PNG`);
  assert.equal(interlace, 0, `${path} should not use interlacing`);

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const sourceStride = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const rgba = new Uint8Array(width * height * 4);
  let sourceOffset = 0;
  let previous = new Uint8Array(sourceStride);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const raw = inflated.subarray(sourceOffset, sourceOffset + sourceStride);
    sourceOffset += sourceStride;
    const scanline = new Uint8Array(sourceStride);

    for (let i = 0; i < sourceStride; i += 1) {
      const left = i >= bytesPerPixel ? scanline[i - bytesPerPixel] : 0;
      const up = previous[i] ?? 0;
      const upLeft = i >= bytesPerPixel ? previous[i - bytesPerPixel] : 0;
      let predictor = 0;

      if (filter === 1) {
        predictor = left;
      } else if (filter === 2) {
        predictor = up;
      } else if (filter === 3) {
        predictor = Math.floor((left + up) / 2);
      } else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      } else {
        assert.equal(filter, 0, `${path} uses unsupported PNG filter ${filter}`);
      }

      scanline[i] = (raw[i] + predictor) & 255;
    }

    for (let x = 0; x < width; x += 1) {
      const sourceIndex = x * bytesPerPixel;
      const pixelIndex = (y * width + x) * 4;
      rgba[pixelIndex] = scanline[sourceIndex];
      rgba[pixelIndex + 1] = scanline[sourceIndex + 1];
      rgba[pixelIndex + 2] = scanline[sourceIndex + 2];
      rgba[pixelIndex + 3] = colorType === 6 ? scanline[sourceIndex + 3] : 255;
    }

    previous = scanline;
  }

  return { width, height, rgba };
}

function pngContentBounds(
  path: string,
  region: { left?: number; right?: number; top?: number; bottom?: number } = {},
) {
  const image = readPngRgbaFixture(path);
  const left = region.left ?? 0;
  const right = region.right ?? image.width;
  const top = region.top ?? 0;
  const bottom = region.bottom ?? image.height;
  let minX = right;
  let minY = bottom;
  let maxX = left - 1;
  let maxY = top - 1;

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const index = (y * image.width + x) * 4;
      const alpha = image.rgba[index + 3];
      const distanceFromWhite = Math.max(
        255 - image.rgba[index],
        255 - image.rgba[index + 1],
        255 - image.rgba[index + 2],
      );

      if (alpha > 16 && distanceFromWhite > 10) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  assert.ok(maxX >= minX && maxY >= minY, `${path} should contain visible non-white pixels`);

  return {
    left: minX,
    right: maxX + 1,
    top: minY,
    bottom: maxY + 1,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function pngVisiblePixelCount(
  path: string,
  region: { left?: number; right?: number; top?: number; bottom?: number } = {},
  threshold = 10,
) {
  const image = readPngRgbaFixture(path);
  const left = region.left ?? 0;
  const right = region.right ?? image.width;
  const top = region.top ?? 0;
  const bottom = region.bottom ?? image.height;
  let count = 0;

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const index = (y * image.width + x) * 4;
      const alpha = image.rgba[index + 3];
      const distanceFromWhite = Math.max(
        255 - image.rgba[index],
        255 - image.rgba[index + 1],
        255 - image.rgba[index + 2],
      );

      if (alpha > 16 && distanceFromWhite > threshold) {
        count += 1;
      }
    }
  }

  return count;
}

function pixelDistanceFromWhite(image: ReturnType<typeof readPngRgbaFixture>, x: number, y: number) {
  const index = (y * image.width + x) * 4;
  return Math.max(255 - image.rgba[index], 255 - image.rgba[index + 1], 255 - image.rgba[index + 2]);
}

function pixelAverage(image: ReturnType<typeof readPngRgbaFixture>, x: number, y: number) {
  const index = (y * image.width + x) * 4;
  return (image.rgba[index] + image.rgba[index + 1] + image.rgba[index + 2]) / 3;
}

function pixelChroma(image: ReturnType<typeof readPngRgbaFixture>, x: number, y: number) {
  const index = (y * image.width + x) * 4;
  return (
    Math.max(image.rgba[index], image.rgba[index + 1], image.rgba[index + 2]) -
    Math.min(image.rgba[index], image.rgba[index + 1], image.rgba[index + 2])
  );
}

function pixelAlpha(image: ReturnType<typeof readPngRgbaFixture>, x: number, y: number) {
  return image.rgba[(y * image.width + x) * 4 + 3];
}

function isPropPlatePixel(image: ReturnType<typeof readPngRgbaFixture>, x: number, y: number) {
  return pixelAlpha(image, x, y) > 16 && pixelAverage(image, x, y) > 238 && pixelChroma(image, x, y) < 28;
}

function isPropSubjectPixel(image: ReturnType<typeof readPngRgbaFixture>, x: number, y: number) {
  return pixelAlpha(image, x, y) > 16 && pixelDistanceFromWhite(image, x, y) > 32;
}

function pngLongestVerticalPlateCutRun(
  path: string,
  region: { left: number; right: number; top: number; bottom: number },
) {
  const image = readPngRgbaFixture(path);
  let longestRun = 0;

  for (let x = region.left; x < region.right; x += 1) {
    let currentRun = 0;

    for (let y = region.top; y < region.bottom; y += 1) {
      const leftX = Math.max(0, x - 2);
      const rightX = Math.min(image.width - 1, x + 2);
      const hardCut =
        (isPropPlatePixel(image, leftX, y) && isPropSubjectPixel(image, rightX, y)) ||
        (isPropSubjectPixel(image, leftX, y) && isPropPlatePixel(image, rightX, y));

      if (hardCut) {
        currentRun += 1;
        longestRun = Math.max(longestRun, currentRun);
      } else {
        currentRun = 0;
      }
    }
  }

  return longestRun;
}

function readPngInfoFixture(path: string) {
  const file = readFileSync(new URL(`..${path}`, import.meta.url));
  assert.equal(file.subarray(1, 4).toString("ascii"), "PNG", `${path} should be a PNG`);

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;

  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunk = file.subarray(dataStart, dataEnd);

    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  assert.equal(bitDepth, 8, `${path} should use 8-bit PNG channels`);
  assert.ok([2, 6].includes(colorType), `${path} should be a true-color PNG`);
  return { width, height, size: file.length };
}

describe("Worker C asset library surfaces", () => {
  it("renders the official asset library by default", () => {
    const html = renderLibraryTeam({ route: "assets" });

    assertIncludesAll(html, [
      "官方资产库",
      "团队资产库",
      "角色",
      "场景",
      "道具",
      "国内仿真人-现代都市",
      "搜索",
      "保姆",
      "医生",
    ]);
    assert.doesNotMatch(html, /个人资产库/);
    assert.match(html, /data-action="set-library-asset-scope"/);
    assert.match(html, /data-action="set-library-folder"/);
  });

  it("renders official and team asset library categories with the membership gate", () => {
    const html = renderLibraryTeam({ route: "assets", assetScope: "team" });

    assertIncludesAll(html, [
      "官方资产库",
      "团队资产库",
      "角色",
      "场景",
      "道具",
      "音色",
      "风格",
      "题材",
      "分镜构图",
      "视频特效",
      "小说转剧本",
      "AI 拆分镜",
      "API",
      "专业版会员权益",
      "团队资产库为专业版会员权益，开通后使用该功能。",
      "立即开通",
    ]);
    assert.match(html, /library-team-locked-panel/);
  });

  it("keeps local upload entry points visible while the team asset library is locked", () => {
    const characterHtml = renderLibraryTeam({
      route: "assets",
      assetScope: "team",
      libraryCategory: "character",
      libraryEntitlement: {
        hasTeamAssetLibrary: false,
        blockReason: "team_asset_library_entitlement_required",
      },
    });
    const voiceHtml = renderLibraryTeam({
      route: "assets",
      assetScope: "team",
      libraryCategory: "voice",
      libraryEntitlement: {
        hasTeamAssetLibrary: false,
        blockReason: "team_asset_library_entitlement_required",
      },
    });

    assertIncludesAll(characterHtml, ["上传图片", "支持 PNG、JPG、WEBP", "团队资产库为专业版会员权益"]);
    assert.match(characterHtml, /data-action="pick-team-asset-local-upload"/);
    assert.match(characterHtml, /class="[^"]*team-asset-local-upload-input/);
    assert.match(characterHtml, /accept="[^"]*image\/png[^"]*image\/jpeg[^"]*image\/webp/);
    assert.match(characterHtml, /library-team-locked-panel/);

    assertIncludesAll(voiceHtml, ["上传音频", "支持 MP3、WAV、M4A、AAC", "团队资产库为专业版会员权益"]);
    assert.match(voiceHtml, /data-action="pick-team-asset-local-upload"/);
    assert.match(voiceHtml, /accept="[^"]*audio\/mpeg[^"]*audio\/wav[^"]*audio\/mp4/);
    assert.match(voiceHtml, /library-team-locked-panel/);
  });

  it("renders local image uploads above the locked membership gate", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "team",
      libraryCategory: "character",
      libraryEntitlement: {
        hasTeamAssetLibrary: false,
        blockReason: "team_asset_library_entitlement_required",
      },
      teamAssetLocalUploads: {
        character: [
          {
            id: "local-character-1",
            name: "自定义主角.png",
            previewUrl: "data:image/png;base64,custom-character",
            mimeType: "image/png",
            sizeLabel: "1.2 MB",
          },
        ],
      },
    });

    assertIncludesAll(html, ["本地上传，待同步", "自定义主角.png", "1.2 MB", "团队资产库为专业版会员权益"]);
    assert.match(html, /library-team-local-upload-section/);
    assert.match(html, /src="data:image\/png;base64,custom-character"/);
    assert.match(html, /data-action="delete-team-asset-local-upload"/);
    assert.match(html, /data-local-upload-id="local-character-1"/);
    assert.match(html, /aria-label="删除自定义主角\.png"/);
    assert.match(html, /library-team-locked-panel/);
    assert.ok(
      html.indexOf("本地上传，待同步") < html.indexOf("library-team-locked-panel"),
      "local uploads should render before the locked membership panel",
    );
  });

  it("renders local voice uploads as audio previews", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "team",
      libraryCategory: "voice",
      libraryEntitlement: {
        hasTeamAssetLibrary: false,
        blockReason: "team_asset_library_entitlement_required",
      },
      teamAssetLocalUploads: {
        voice: [
          {
            id: "local-voice-1",
            name: "旁白音色.m4a",
            previewUrl: "blob:http://localhost/local-voice-1",
            mimeType: "audio/mp4",
            sizeLabel: "860 KB",
          },
        ],
      },
    });

    assertIncludesAll(html, ["本地上传，待同步", "旁白音色.m4a", "860 KB"]);
    assert.match(html, /<audio[^>]+controls/);
    assert.match(html, /src="blob:http:\/\/localhost\/local-voice-1"/);
    assert.match(html, /library-team-local-upload-card is-audio/);
    assert.match(html, /data-action="delete-team-asset-local-upload"/);
    assert.match(html, /data-local-upload-id="local-voice-1"/);
  });

  it("removes a local team upload without touching other categories", () => {
    const ui = {
      teamAssetLocalUploads: {
        character: [
          { id: "local-character-1", name: "自定义主角.png" },
          { id: "local-character-2", name: "自定义配角.png" },
        ],
        voice: [{ id: "local-voice-1", name: "旁白音色.m4a" }],
      },
    };

    assert.equal(removeTeamAssetLocalUpload(ui, "character", "local-character-1"), true);
    assert.deepEqual(ui.teamAssetLocalUploads.character, [
      { id: "local-character-2", name: "自定义配角.png" },
    ]);
    assert.deepEqual(ui.teamAssetLocalUploads.voice, [
      { id: "local-voice-1", name: "旁白音色.m4a" },
    ]);
    assert.equal(removeTeamAssetLocalUpload(ui, "character", "missing-upload"), false);
  });

  it("validates local upload formats by category", () => {
    assert.equal(
      validateTeamAssetLocalUploadFile("character", { name: "hero.PNG", type: "image/png" }).ok,
      true,
    );
    assert.equal(
      validateTeamAssetLocalUploadFile("scene", { name: "street.webp", type: "" }).ok,
      true,
    );
    assert.equal(
      validateTeamAssetLocalUploadFile("voice", { name: "narrator.m4a", type: "audio/mp4" }).ok,
      true,
    );
    assert.equal(
      validateTeamAssetLocalUploadFile("prop", { name: "contract.pdf", type: "application/pdf" }).ok,
      false,
    );
    assert.equal(
      validateTeamAssetLocalUploadFile("voice", { name: "voice.png", type: "image/png" }).ok,
      false,
    );
  });
  it("renders reusable official assets from API state as browse-only cards", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "official",
      libraryCategory: "character",
      libraryFolder: "国内仿真人-现代都市",
      libraryQuery: "医",
      libraryCategories: [
        { id: "character", label: "角色" },
        { id: "scene", label: "场景" },
        { id: "prop", label: "道具" },
      ],
      libraryFolders: ["国内仿真人-现代都市"],
      libraryAssets: [
        {
          id: "library-doctor",
          name: "医生",
          category: "character",
          folder: "国内仿真人-现代都市",
          previewUrl: "data:image/svg+xml;charset=UTF-8,doctor",
        },
      ],
      libraryEntitlement: {
        hasTeamAssetLibrary: false,
        blockReason: "team_asset_library_entitlement_required",
      },
    });

    assertIncludesAll(html, [
      "官方资产库",
      "国内仿真人-现代都市",
      "医生",
    ]);
    assert.match(html, /data-action="set-library-category"/);
    assert.match(html, /data-action="set-library-folder"/);
    assert.match(html, /data-library-search-input/);
    assert.match(html, /data-action="open-library-asset-detail"/);
    assert.doesNotMatch(html, /data-action="import-library-asset-to-project"/);
    assert.doesNotMatch(html, /加入项目/);
    assert.match(html, /data-library-asset-id="library-doctor"/);
    assert.match(html, /value="医"/);
    assert.match(html, /src="data:image\/svg\+xml;charset=UTF-8,doctor"/);
  });

  it("keeps rendered API assets aligned with the selected folder when switching categories", () => {
    const selectedFolder = "国内仿真人-现代都市";

    for (const category of ["character", "scene", "prop"]) {
      const apiWideAssets = officialAssetLibraryFixture.assets.filter(
        (asset) => asset.category === category,
      );
      const expectedFolderAssets = apiWideAssets.filter(
        (asset) => asset.folder === selectedFolder,
      );
      const html = renderLibraryTeam({
        route: "assets",
        assetScope: "official",
        libraryCategory: category,
        libraryFolder: selectedFolder,
        libraryFolders: officialAssetLibraryFixture.folders,
        libraryAssets: apiWideAssets,
        libraryEntitlement: { hasTeamAssetLibrary: true },
      });
      const renderedFolders = assetCardFolders(html);

      assert.equal(renderedFolders.length, expectedFolderAssets.length, category);
      assert.deepEqual(
        [...new Set(renderedFolders)],
        [selectedFolder],
        `${category} cards should match the highlighted folder`,
      );
    }
  });

  it("searches fallback official assets across folders within the active category", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "official",
      libraryCategory: "character",
      libraryFolder: "国内仿真人-现代都市",
      libraryQuery: "皇后",
    });

    assertIncludesAll(html, [
      "搜索“皇后”",
      "角色、场景、道具",
      "找到 1 个资产",
      "皇后",
      "国内仿真人-东方古代",
    ]);
    assert.doesNotMatch(html, /保姆/);
    assert.match(html, /data-action="clear-library-search"/);
  });

  it("searches fallback official assets across role scene and prop categories", () => {
    const sceneHtml = renderLibraryTeam({
      route: "assets",
      assetScope: "official",
      libraryCategory: "character",
      libraryFolder: "国内仿真人-现代都市",
      libraryQuery: "未来",
    });
    const propHtml = renderLibraryTeam({
      route: "assets",
      assetScope: "official",
      libraryCategory: "character",
      libraryFolder: "国内仿真人-现代都市",
      libraryQuery: "飞剑",
    });

    assertIncludesAll(sceneHtml, ["搜索“未来”", "角色、场景、道具", "未来公寓"]);
    assertIncludesAll(propHtml, ["搜索“飞剑”", "角色、场景、道具", "飞剑"]);
    assert.match(sceneHtml, /data-library-asset-id="scene-3d-future-apartment"/);
    assert.match(propHtml, /data-library-asset-id="prop-3d-xianxia-flying-sword"/);
  });

  it("does not treat API asset folders as searchable asset content", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "official",
      libraryCategory: "prop",
      libraryFolder: "国内仿真人-现代都市",
      libraryQuery: "修仙",
      libraryAssets: [
        {
          id: "prop-3d-xianxia-flying-sword",
          name: "飞剑",
          category: "prop",
          folder: "3D漫-东方修仙",
          tags: ["official", "3D漫-东方修仙"],
          previewUrl: "data:image/svg+xml;charset=UTF-8,flying-sword",
        },
      ],
    });

    assertIncludesAll(html, ["搜索“修仙”", "没有找到“修仙”"]);
    assert.doesNotMatch(html, /飞剑/);
  });

  it("searches fallback official scenes and props by asset names", () => {
    const sceneHtml = renderLibraryTeam({
      route: "assets",
      assetScope: "official",
      libraryCategory: "scene",
      libraryFolder: "国内仿真人-现代都市",
      libraryQuery: "云",
    });
    const propHtml = renderLibraryTeam({
      route: "assets",
      assetScope: "official",
      libraryCategory: "prop",
      libraryFolder: "国内仿真人-现代都市",
      libraryQuery: "剑",
    });

    assertIncludesAll(sceneHtml, ["搜索“云”", "场景", "云海仙台", "云端办公室"]);
    assertIncludesAll(propHtml, ["搜索“剑”", "道具", "飞剑", "灵剑"]);
    assert.doesNotMatch(sceneHtml, /别墅/);
    assert.doesNotMatch(propHtml, /工作证/);
  });

  it("opens a character asset detail viewer with multi-angle previews", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "official",
      libraryCategory: "character",
      libraryFolder: "国内仿真人-现代都市",
      libraryDetailAssetId: "doctor",
    });

    assertIncludesAll(html, [
      "医生",
      "正面",
      "侧面",
      "背面",
      "方位图",
      "该角色为万兴剧厂公共资产",
      "已整理方位图、正面、侧面、背面与远景全身参考角度",
    ]);
    assert.match(html, /role="dialog"/);
    assert.match(html, /class="[^"]*library-team-asset-detail-overlay/);
    assert.match(html, /data-action="select-library-asset-detail-view"/);
    assert.match(html, /data-action="close-library-asset-detail"/);
    assert.match(html, /data-detail-view="turnaround"/);
    assert.match(html, /data-detail-view="front"/);
    assert.match(html, /data-detail-view="side"/);
    assert.match(html, /data-detail-view="back"/);
    assert.match(html, /data-detail-view="full-body"/);
    assert.doesNotMatch(html, /data-detail-view="closeup"/);
    assert.match(html, /\/assets\/library\/official\/characters\/detail\/doctor-sheet\.png/);
    assert.match(html, /\/assets\/library\/official\/characters\/detail\/doctor-front\.png/);
    assert.match(html, /\/assets\/library\/official\/characters\/detail\/doctor-side\.png/);
    assert.match(html, /\/assets\/library\/official\/characters\/detail\/doctor-back\.png/);
    assert.match(html, /\/assets\/library\/official\/characters\/detail\/doctor-full-body\.png/);
    assert.doesNotMatch(html, /data:image\/svg\+xml;charset=UTF-8/);
  });

  it("renders distinct project-hosted raster angle previews instead of SVG stand-ins", () => {
    const sideHtml = renderLibraryTeam({
      route: "assets",
      assetScope: "official",
      libraryCategory: "character",
      libraryFolder: "国内仿真人-东方古代",
      libraryDetailAssetId: "wanderer",
      libraryDetailView: "side",
    });
    const backHtml = renderLibraryTeam({
      route: "assets",
      assetScope: "official",
      libraryCategory: "character",
      libraryFolder: "国内仿真人-东方古代",
      libraryDetailAssetId: "wanderer",
      libraryDetailView: "back",
    });
    const fullBodyHtml = renderLibraryTeam({
      route: "assets",
      assetScope: "official",
      libraryCategory: "character",
      libraryFolder: "国内仿真人-东方古代",
      libraryDetailAssetId: "wanderer",
      libraryDetailView: "full-body",
    });

    assertIncludesAll(sideHtml, ["侠客", "当前角度", "侧面"]);
    assertIncludesAll(backHtml, ["侠客", "当前角度", "背面"]);
    assertIncludesAll(fullBodyHtml, ["侠客", "当前角度", "远景全身"]);
    assert.match(sideHtml, /\/assets\/library\/official\/characters\/detail\/wanderer-side\.png/);
    assert.match(backHtml, /\/assets\/library\/official\/characters\/detail\/wanderer-back\.png/);
    assert.match(
      fullBodyHtml,
      /<figure class="library-team-asset-detail-stage is-character is-full-body is-raster">\s*<img src="\/assets\/library\/official\/characters\/detail\/wanderer-full-body\.png"/,
    );
    assert.doesNotMatch(sideHtml, /data:image\/svg\+xml;charset=UTF-8/);
    assert.doesNotMatch(backHtml, /data:image\/svg\+xml;charset=UTF-8/);
    assert.doesNotMatch(fullBodyHtml, /data:image\/svg\+xml;charset=UTF-8/);
  });

  it("renders 3D modern characters with the same reference-card treatment as the wanderer set", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "official",
      libraryCategory: "character",
      libraryAssets: [
        {
          id: "3d-assistant",
          name: "Assistant",
          category: "character",
          folder: "3D漫-现代都市",
        },
      ],
    });

    assert.match(
      html,
      /<article class="[^"]*library-team-asset-card[^"]*is-character-reference[^"]*is-modern-3d-character[^"]*"/,
    );
    assert.match(
      html,
      /<img class="[^"]*library-team-asset-preview[^"]*is-character-reference[^"]*"/,
    );
    assert.match(html, /src="\/assets\/library\/official\/characters\/3d-assistant\.png"/);
  });

  it("opens 3D modern character details with the same full angle set as wanderer", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "official",
      libraryCategory: "character",
      libraryAssets: [
        {
          id: "3d-assistant",
          name: "Assistant",
          category: "character",
          folder: "3D漫-现代都市",
        },
      ],
      libraryDetailAssetId: "3d-assistant",
      libraryDetailView: "side",
    });

    assert.match(html, /data-detail-view="turnaround"/);
    assert.match(html, /data-detail-view="front"/);
    assert.match(html, /data-detail-view="side"/);
    assert.match(html, /data-detail-view="back"/);
    assert.match(html, /data-detail-view="full-body"/);
    assert.match(
      html,
      /<figure class="library-team-asset-detail-stage is-character is-side is-raster is-modern-3d-character">\s*<img src="\/assets\/library\/official\/characters\/detail\/3d-assistant-side\.png"/,
    );
    assert.match(html, /\/assets\/library\/official\/characters\/detail\/3d-assistant-sheet\.png/);
    assert.match(html, /\/assets\/library\/official\/characters\/detail\/3d-assistant-front\.png/);
    assert.match(html, /\/assets\/library\/official\/characters\/detail\/3d-assistant-back\.png/);
  });

  it("uses the same detail styling hook and far full-body asset for 3D modern characters", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "official",
      libraryCategory: "character",
      libraryAssets: [
        {
          id: "3d-assistant",
          name: "Assistant",
          category: "character",
          folder: "3D婕?鐜颁唬閮藉競",
        },
      ],
      libraryDetailAssetId: "3d-assistant",
      libraryDetailView: "full-body",
    });

    assert.match(
      html,
      /<figure class="library-team-asset-detail-stage is-character is-full-body is-raster is-modern-3d-character">\s*<img src="\/assets\/library\/official\/characters\/detail\/3d-assistant-full-body\.png"/,
    );
  });

  it("ships meaningful 3D modern angle rasters instead of duplicated placeholder views", () => {
    for (const [assetId] of modern3dCharacterAssets) {
      const angleHashes = new Set(
        ["front", "side", "back", "full-body"].map((view) =>
          hashFixtureImage(`/assets/library/official/characters/detail/${assetId}-${view}.png`),
        ),
      );
      const sheetHash = hashFixtureImage(`/assets/library/official/characters/detail/${assetId}-sheet.png`);

      assert.equal(angleHashes.size, 4, `Expected ${assetId} front, side, back, and full-body files to be unique`);
      assert.equal(angleHashes.has(sheetHash), false, `Expected ${assetId} sheet to be a composed reference board`);
    }
  });

  it("keeps 3D modern character rasters as full-canvas imagegen reference art", () => {
    for (const [assetId] of modern3dCharacterAssets) {
      const preview = readPngInfoFixture(`/assets/library/official/characters/${assetId}.png`);
      assert.deepEqual(
        { width: preview.width, height: preview.height },
        { width: 720, height: 960 },
        `Expected ${assetId} card preview to fill the same portrait canvas as the reference cards`,
      );
      assert.ok(preview.size > 100_000, `Expected ${assetId} card preview to be generated raster art`);

      for (const view of ["front", "side", "back", "full-body"]) {
        const detail = readPngInfoFixture(`/assets/library/official/characters/detail/${assetId}-${view}.png`);
        assert.ok(detail.width >= 720, `Expected ${assetId}-${view} to use a full detail canvas`);
        assert.ok(detail.height >= 900, `Expected ${assetId}-${view} to use a full detail canvas`);
        assert.ok(detail.size > 100_000, `Expected ${assetId}-${view} to be generated raster art`);
      }
    }
  });

  it("opens 3D xianxia character details with the same five-view set as wanderer", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "official",
      libraryCategory: "character",
      libraryAssets: [
        {
          id: "3d-xianxia-swordsman",
          name: "Xianxia Swordsman",
          category: "character",
          folder: "3D漫-东方修仙",
        },
      ],
      libraryDetailAssetId: "3d-xianxia-swordsman",
      libraryDetailView: "side",
    });

    assert.match(html, /data-detail-view="turnaround"/);
    assert.match(html, /data-detail-view="front"/);
    assert.match(html, /data-detail-view="side"/);
    assert.match(html, /data-detail-view="back"/);
    assert.match(html, /data-detail-view="full-body"/);
    assert.match(
      html,
      /<figure class="library-team-asset-detail-stage is-character is-side is-raster is-xianxia-3d-character">\s*<img src="\/assets\/library\/official\/characters\/detail\/3d-xianxia-swordsman-side\.png"/,
    );
    assert.match(
      html,
      /<button\s+class="library-team-asset-detail-thumb is-character is-xianxia-3d-character is-active"/,
    );
    assert.match(html, /\/assets\/library\/official\/characters\/detail\/3d-xianxia-swordsman-front\.png/);
    assert.match(html, /\/assets\/library\/official\/characters\/detail\/3d-xianxia-swordsman-sheet\.png/);
    assert.match(html, /\/assets\/library\/official\/characters\/detail\/3d-xianxia-swordsman-side\.png/);
    assert.match(html, /\/assets\/library\/official\/characters\/detail\/3d-xianxia-swordsman-back\.png/);
    assert.match(html, /\/assets\/library\/official\/characters\/detail\/3d-xianxia-swordsman-full-body\.png/);
    assert.doesNotMatch(html, /data:image\/svg\+xml;charset=UTF-8/);
  });

  it("ships 3D xianxia angle rasters as complete non-duplicated reference boards", () => {
    for (const [assetId] of xianxia3dCharacterAssets) {
      const angleHashes = new Set(
        ["front", "side", "back", "full-body"].map((view) =>
          hashFixtureImage(`/assets/library/official/characters/detail/${assetId}-${view}.png`),
        ),
      );
      const sheetHash = hashFixtureImage(`/assets/library/official/characters/detail/${assetId}-sheet.png`);

      assert.equal(angleHashes.size, 4, `Expected ${assetId} front, side, back, and full-body files to be unique`);
      assert.equal(angleHashes.has(sheetHash), false, `Expected ${assetId} sheet to be a composed reference board`);
      assert.deepEqual(pngDimensions(`/assets/library/official/characters/${assetId}.png`), {
        width: 720,
        height: 960,
      });
      assert.deepEqual(pngDimensions(`/assets/library/official/characters/detail/${assetId}-sheet.png`), {
        width: 1717,
        height: 916,
      });
      assert.deepEqual(pngDimensions(`/assets/library/official/characters/detail/${assetId}-front.png`), {
        width: 1792,
        height: 1024,
      });
      for (const view of ["side", "back", "full-body"]) {
        assert.deepEqual(pngDimensions(`/assets/library/official/characters/detail/${assetId}-${view}.png`), {
          width: 1024,
          height: 1536,
        });
      }
    }
  });

  it("opens 2D xianxia character details with the same full angle set as wanderer", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "official",
      libraryCategory: "character",
      libraryAssets: [
        {
          id: "2d-xianxia-fairy",
          name: "2D Xianxia Fairy",
          category: "character",
          folder: "2D Xianxia",
        },
      ],
      libraryDetailAssetId: "2d-xianxia-fairy",
      libraryDetailView: "side",
    });

    assert.match(html, /data-detail-view="turnaround"/);
    assert.match(html, /data-detail-view="front"/);
    assert.match(html, /data-detail-view="side"/);
    assert.match(html, /data-detail-view="back"/);
    assert.match(html, /data-detail-view="full-body"/);
    assert.match(
      html,
      /<figure class="library-team-asset-detail-stage is-character is-side is-raster is-xianxia-2d-character">\s*<img src="\/assets\/library\/official\/characters\/detail\/2d-xianxia-fairy-side\.png"/,
    );
    assert.match(
      html,
      /<button\s+class="library-team-asset-detail-thumb is-character is-xianxia-2d-character is-active"/,
    );
    assert.match(html, /\/assets\/library\/official\/characters\/2d-xianxia-fairy\.png/);
    assert.match(html, /\/assets\/library\/official\/characters\/detail\/2d-xianxia-fairy-sheet\.png/);
    assert.match(html, /\/assets\/library\/official\/characters\/detail\/2d-xianxia-fairy-front\.png/);
    assert.match(html, /\/assets\/library\/official\/characters\/detail\/2d-xianxia-fairy-back\.png/);
    assert.match(html, /\/assets\/library\/official\/characters\/detail\/2d-xianxia-fairy-full-body\.png/);
    assert.doesNotMatch(html, /data:image\/svg\+xml;charset=UTF-8/);
  });

  it("opens the monk detail with the full five-view generated raster set", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "official",
      libraryCategory: "character",
      libraryFolder: "国内仿真人-东方古代",
      libraryDetailAssetId: "monk",
      libraryDetailView: "turnaround",
    });

    assert.match(
      html,
      /<figure class="library-team-asset-detail-stage is-character is-turnaround is-raster">\s*<img src="\/assets\/library\/official\/characters\/detail\/monk-sheet\.png"/,
    );
    assert.match(html, /data-detail-view="turnaround"/);
    assert.match(html, /data-detail-view="front"/);
    assert.match(html, /data-detail-view="side"/);
    assert.match(html, /data-detail-view="back"/);
    assert.match(html, /data-detail-view="full-body"/);
    assert.match(html, /monk-front\.png/);
    assert.match(html, /monk-side\.png/);
    assert.match(html, /monk-back\.png/);
    assert.match(html, /monk-full-body\.png/);
  });

  it("opens generated ancient character details with the full five-view raster set", () => {
    const generatedAncientCharacterIds = ["empress", "chancellor", "monk", "maid", "general"];

    for (const assetId of generatedAncientCharacterIds) {
      const html = renderLibraryTeam({
        route: "assets",
        assetScope: "official",
        libraryCategory: "character",
        libraryFolder: "国内仿真人-东方古代",
        libraryDetailAssetId: assetId,
        libraryDetailView: "turnaround",
      });

      assert.match(
        html,
        new RegExp(
          `<figure class="library-team-asset-detail-stage is-character is-turnaround is-raster">\\s*<img src="/assets/library/official/characters/detail/${assetId}-sheet\\.png"`,
        ),
      );
      assert.match(html, /data-detail-view="turnaround"/);
      assert.match(html, /data-detail-view="front"/);
      assert.match(html, /data-detail-view="side"/);
      assert.match(html, /data-detail-view="back"/);
      assert.match(html, /data-detail-view="full-body"/);
      assert.match(html, new RegExp(`${assetId}-front\\.png`));
      assert.match(html, new RegExp(`${assetId}-side\\.png`));
      assert.match(html, new RegExp(`${assetId}-back\\.png`));
      assert.match(html, new RegExp(`${assetId}-full-body\\.png`));
      assert.doesNotMatch(html, /data:image\/svg\+xml;charset=UTF-8/);
    }
  });

  it("uses the raster preview slug to open API-backed ancient characters with complete generated angles", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "official",
      libraryCategory: "character",
      libraryFolder: "国内仿真人-东方古代",
      libraryAssets: [
        {
          id: "1105",
          name: "和尚",
          category: "character",
          folder: "国内仿真人-东方古代",
          previewUrl: "/assets/library/official/characters/monk.png",
        },
      ],
      libraryDetailAssetId: "1105",
      libraryDetailView: "turnaround",
    });

    assert.match(
      html,
      /<figure class="library-team-asset-detail-stage is-character is-turnaround is-raster">\s*<img src="\/assets\/library\/official\/characters\/detail\/monk-sheet\.png"/,
    );
    assert.match(html, /data-detail-view="turnaround"/);
    assert.match(html, /data-detail-view="front"/);
    assert.match(html, /data-detail-view="side"/);
    assert.match(html, /data-detail-view="back"/);
    assert.match(html, /data-detail-view="full-body"/);
    assert.match(html, /\/assets\/library\/official\/characters\/detail\/monk-front\.png/);
    assert.match(html, /\/assets\/library\/official\/characters\/detail\/monk-side\.png/);
    assert.match(html, /\/assets\/library\/official\/characters\/detail\/monk-back\.png/);
    assert.match(html, /\/assets\/library\/official\/characters\/detail\/monk-full-body\.png/);
  });

  it("opens every 2D anime character with the full five-view detail set", () => {
    for (const [folder, assetId, label] of twoDimensionalCharacterAssets) {
      const html = renderLibraryTeam({
        route: "assets",
        assetScope: "official",
        libraryCategory: "character",
        libraryFolder: folder,
        libraryDetailAssetId: assetId,
        libraryDetailView: "turnaround",
      });

      assertIncludesAll(html, [label, "方位图", "正面", "侧面", "背面", "远景全身"]);
      assert.match(html, new RegExp(`/assets/library/official/characters/detail/${assetId}-sheet\\.png`));
      assert.match(html, new RegExp(`/assets/library/official/characters/detail/${assetId}-front\\.png`));
      assert.match(html, new RegExp(`/assets/library/official/characters/detail/${assetId}-side\\.png`));
      assert.match(html, new RegExp(`/assets/library/official/characters/detail/${assetId}-back\\.png`));
      assert.match(html, new RegExp(`/assets/library/official/characters/detail/${assetId}-full-body\\.png`));
      assert.match(
        html,
        assetId.startsWith("2d-city-")
          ? /is-modern-2d-character/
          : /is-xianxia-2d-character/,
      );
      assert.doesNotMatch(html, /未展示重复或不准确的伪角度/);
    }
  });

  it("ships distinct raster files for every 2D anime character detail angle", () => {
    for (const [, assetId] of twoDimensionalCharacterAssets) {
      const hashes = new Set(
        ["front", "side", "back", "full-body"].map((view) =>
          hashFixtureImage(`/assets/library/official/characters/detail/${assetId}-${view}.png`),
        ),
      );

      assert.equal(hashes.size, 4, `Expected ${assetId} detail angle files to be unique`);
    }
  });

  it("uses wanderer-style reference plate dimensions for every 2D anime character", () => {
    for (const [, assetId] of twoDimensionalCharacterAssets) {
      assert.deepEqual(pngDimensions(`/assets/library/official/characters/${assetId}.png`), {
        width: 720,
        height: 960,
      });
      assert.deepEqual(
        pngDimensions(`/assets/library/official/characters/detail/${assetId}-sheet.png`),
        { width: 1792, height: 1024 },
      );
      assert.deepEqual(
        pngDimensions(`/assets/library/official/characters/detail/${assetId}-front.png`),
        { width: 1792, height: 1024 },
      );
      assert.deepEqual(
        pngDimensions(`/assets/library/official/characters/detail/${assetId}-side.png`),
        { width: 1024, height: 1536 },
      );
      assert.deepEqual(
        pngDimensions(`/assets/library/official/characters/detail/${assetId}-back.png`),
        { width: 1024, height: 1536 },
      );
      assert.deepEqual(
        pngDimensions(`/assets/library/official/characters/detail/${assetId}-full-body.png`),
        { width: 1024, height: 1536 },
      );
    }
  });

  it("keeps every 2D anime detail figure large, clean, and uncut like the wanderer references", () => {
    for (const assetId of twoDimensionalCharacterAssetIds) {
      const sheetFigure = pngContentBounds(
        `/assets/library/official/characters/detail/${assetId}-sheet.png`,
      );
      const frontLeftFigure = pngContentBounds(
        `/assets/library/official/characters/detail/${assetId}-front.png`,
        { left: 0, right: 896 },
      );
      const cardPreview = readPngRgbaFixture(`/assets/library/official/characters/${assetId}.png`);

      assert.ok(
        sheetFigure.height >= 820,
        `${assetId} turnaround should keep the figures close to the wanderer reference scale`,
      );

      assert.ok(
        frontLeftFigure.height >= 870,
        `${assetId} front reference should keep the large figure full enough to avoid abrupt cuts`,
      );
      assert.ok(
        frontLeftFigure.bottom >= 930,
        `${assetId} front reference should carry the large figure down near the floor line`,
      );

      for (const view of ["side", "back", "full-body"]) {
        const bounds = pngContentBounds(
          `/assets/library/official/characters/detail/${assetId}-${view}.png`,
        );

        assert.ok(
          bounds.height >= 1200,
          `${assetId} ${view} detail should not render as a tiny figure in the stage`,
        );
        assert.ok(bounds.top >= 40, `${assetId} ${view} detail should keep top breathing room`);
        assert.ok(
          bounds.bottom <= 1496,
          `${assetId} ${view} detail should keep bottom breathing room instead of touching the edge`,
        );
      }

      for (const [x, y] of [
        [0, 0],
        [Math.floor(cardPreview.width / 2), 8],
        [cardPreview.width - 1, cardPreview.height - 1],
        [Math.floor(cardPreview.width / 2), cardPreview.height - 9],
      ]) {
        const index = (y * cardPreview.width + x) * 4;
        assert.ok(
          cardPreview.rgba[index] >= 250 &&
            cardPreview.rgba[index + 1] >= 250 &&
            cardPreview.rgba[index + 2] >= 250,
          `${assetId} card preview should keep a clean white edge without extra guide lines`,
        );
      }
    }
  });

  it("keeps 2D xianxia side references free of detached left-edge fragments", () => {
    for (const assetId of xianxia2dCharacterAssetIds) {
      assert.equal(
        pngVisiblePixelCount(`/assets/library/official/characters/detail/${assetId}-side.png`, {
          right: 260,
        }),
        0,
        `${assetId} side detail should not carry detached cutout fragments on the left edge`,
      );
    }
  });

  it("keeps 3D xianxia side references free of detached edge fragments", () => {
    for (const [assetId] of xianxia3dCharacterAssets) {
      assert.equal(
        pngVisiblePixelCount(
          `/assets/library/official/characters/detail/${assetId}-side.png`,
          { right: 220 },
          18,
        ),
        0,
        `${assetId} side detail should not carry cropped remnants from adjacent reference figures`,
      );
    }
  });

  it("renders all character folders through the shared compact character grid", () => {
    const folders = [
      "国内仿真人-现代都市",
      "国内仿真人-东方古代",
      "3D漫-现代都市",
      "3D漫-东方修仙",
      "2D漫-现代都市",
      "2D漫-东方修仙",
    ];

    for (const folder of folders) {
      const html = renderLibraryTeam({
        route: "assets",
        assetScope: "official",
        libraryCategory: "character",
        libraryFolder: folder,
      });

      assert.match(html, /class="[^"]*library-team-asset-grid[^"]*is-character/);
    }
  });

  it("uses project-hosted raster detail views inside character detail viewers when available", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "official",
      libraryCategory: "character",
      libraryFolder: "鍥藉唴浠跨湡浜?鐜颁唬閮藉競",
      libraryDetailAssetId: "doctor-real",
      libraryAssets: [
        {
          id: "doctor-real",
          name: "鍖荤敓",
          category: "character",
          folder: "鍥藉唴浠跨湡浜?鐜颁唬閮藉競",
          previewUrl: "/assets/library/official/characters/doctor.png",
        },
      ],
    });

    assert.match(
      html,
      /<figure class="library-team-asset-detail-stage is-character is-turnaround is-raster">\s*<img src="\/assets\/library\/official\/characters\/detail\/doctor-sheet\.png"/,
    );
    assert.match(html, /\/assets\/library\/official\/characters\/detail\/doctor-full-body\.png/);
  });

  it("renders fallback scene assets and opens a scene detail viewer", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "official",
      libraryCategory: "scene",
      libraryFolder: "国内仿真人-现代都市",
      libraryDetailAssetId: "scene-villa",
    });

    assertIncludesAll(html, [
      "官方资产库",
      "国内仿真人-现代都市",
      "别墅",
      "小巷",
      "车库",
      "机场",
      "场景主图",
      "该场景为万兴剧厂公共资产",
    ]);
    assert.match(html, /role="dialog"/);
    assert.match(html, /class="[^"]*library-team-asset-detail-overlay/);
    assert.match(html, /aria-label="查看详情：别墅"/);
    assert.match(html, /data-action="open-library-asset-detail"/);
    assert.match(html, /data-action="close-library-asset-detail"/);
    assert.match(html, /data-detail-view="scene-main"/);
    assert.match(html, /class="[^"]*library-team-asset-card[^"]*is-scene[^"]*is-selected/);
  });

  it("renders customer-demo scene assets for every official scene folder", () => {
    const folders = [
      [
        "国内仿真人-东方古代",
        ["牢房", "王府", "市集", "御书房", "客栈", "酒楼", "御花园", "军营"],
      ],
      [
        "3D漫-现代都市",
        ["未来公寓", "霓虹街区", "直播间", "学院广场", "智能车库", "云端办公室", "赛博商场", "高铁站"],
      ],
      [
        "3D漫-东方修仙",
        ["云海仙台", "灵石洞府", "宗门大殿", "秘境森林", "试炼山门", "仙舟甲板", "丹房", "星河悬崖"],
      ],
      [
        "2D漫-现代都市",
        ["漫画公寓", "街角咖啡店", "黄昏教室", "天台夜景", "地铁站", "校园操场", "便利店", "城市天桥"],
      ],
      [
        "2D漫-东方修仙",
        ["莲池仙境", "剑阵山门", "竹林秘境", "星河崖畔", "山谷药庐", "灵兽庭院", "月下古桥", "仙门书阁"],
      ],
    ] as const;

    for (const [folder, labels] of folders) {
      const html = renderLibraryTeam({
        route: "assets",
        assetScope: "official",
        libraryCategory: "scene",
        libraryFolder: folder,
      });

      assertIncludesAll(html, [
        "官方资产库",
        "场景",
        "国内仿真人-现代都市",
        "国内仿真人-东方古代",
        "3D漫-现代都市",
        "3D漫-东方修仙",
        "2D漫-现代都市",
        "2D漫-东方修仙",
        folder,
        ...labels,
      ]);
      assert.match(html, /class="[^"]*library-team-asset-grid[^"]*is-scene/);
      assert.match(html, /data-action="open-library-asset-detail"/);
    }
  });

  it("renders customer-demo prop assets for every official prop folder and opens prop details", () => {
    const folders = [
      ["国内仿真人-现代都市", ["工作证", "手机", "公文包", "录音笔", "医疗箱", "车钥匙", "相机", "文件袋"]],
      ["国内仿真人-东方古代", ["刀剑", "酒壶", "令牌", "圣旨", "秘密信息", "毒药", "玉佩", "印玺"]],
      ["3D漫-现代都市", ["全息终端", "智能手环", "数据芯片", "电子耳麦", "悬浮滑板", "机械钥匙", "能量饮料", "追踪器"]],
      ["3D漫-东方修仙", ["飞剑", "灵石", "丹炉", "玉简", "法阵罗盘", "乾坤袋", "灵兽铃", "仙草匣"]],
      ["2D漫-现代都市", ["书包", "耳机", "漫画书", "奶茶", "地铁卡", "拍立得", "社团徽章", "便利贴"]],
      ["2D漫-东方修仙", ["符箓", "灵剑", "药瓶", "纸伞", "玉笛", "莲花灯", "灵兽蛋", "阵法卷轴"]],
    ] as const;

    for (const [folder, labels] of folders) {
      const html = renderLibraryTeam({
        route: "assets",
        assetScope: "official",
        libraryCategory: "prop",
        libraryFolder: folder,
      });

      assertIncludesAll(html, [
        "官方资产库",
        "道具",
        "国内仿真人-现代都市",
        "国内仿真人-东方古代",
        "3D漫-现代都市",
        "3D漫-东方修仙",
        "2D漫-现代都市",
        "2D漫-东方修仙",
        folder,
        ...labels,
      ]);
      assert.match(html, /class="[^"]*library-team-asset-grid[^"]*is-prop/);
      assert.match(html, /data-action="open-library-asset-detail"/);
    }

    const detailHtml = renderLibraryTeam({
      route: "assets",
      assetScope: "official",
      libraryCategory: "prop",
      libraryFolder: "3D漫-东方修仙",
      libraryDetailAssetId: "prop-3d-xianxia-flying-sword",
    });

    assertIncludesAll(detailHtml, ["飞剑", "道具主图", "剧情线索"]);
    assert.match(detailHtml, /role="dialog"/);
    assert.match(
      detailHtml,
      /<figure class="library-team-asset-detail-stage is-prop">\s*<div class="library-team-asset-detail-prop-plate">\s*<img src="\/assets\/library\/official\/props\/detail\/prop-3d-xianxia-flying-sword\.png"/,
    );
    assert.doesNotMatch(detailHtml, /library-team-asset-detail-thumbs/);
    assert.doesNotMatch(detailHtml, /data-action="select-library-asset-detail-view"/);
    assert.doesNotMatch(detailHtml, /细节特写/);
    assert.match(detailHtml, /data-action="close-library-asset-detail"/);
  });

  it("renders customer-demo fallback assets for every official role folder", () => {
    const folders = [
      ["国内仿真人-东方古代", ["皇后", "皇帝", "太监", "宰相", "和尚", "宫女", "侠客", "将军"]],
      ["3D漫-现代都市", ["都市男主", "都市女主", "霸总", "助理", "富家千金", "律师"]],
      ["3D漫-东方修仙", ["剑修", "仙尊", "魔尊", "灵狐少女", "丹师", "宗门长老"]],
      ["2D漫-现代都市", ["元气少女", "冷面学长", "偶像练习生", "漫画编辑", "机车少年", "白领姐姐"]],
      ["2D漫-东方修仙", ["青衣剑客", "白衣仙子", "黑衣魔修", "符箓师", "灵兽少年", "宗门师姐"]],
    ] as const;

    for (const [folder, labels] of folders) {
      const html = renderLibraryTeam({
        route: "assets",
        assetScope: "official",
        libraryCategory: "character",
        libraryFolder: folder,
      });

      assertIncludesAll(html, [
        "官方资产库",
        "国内仿真人-现代都市",
        "国内仿真人-东方古代",
        "3D漫-现代都市",
        "3D漫-东方修仙",
        "2D漫-现代都市",
        "2D漫-东方修仙",
        folder,
        ...labels,
      ]);
    }
  });

  it("renders the original official scene node as a landscape asset browser", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "official",
      libraryCategory: "scene",
      libraryFolder: "国内仿真人-现代都市",
      libraryCategories: [
        { id: "character", label: "角色" },
        { id: "scene", label: "场景" },
        { id: "prop", label: "道具" },
      ],
      libraryFolders: [
        "国内仿真人-现代都市",
        "国内仿真人-东方古代",
        "3D漫-现代都市",
        "3D漫-东方修仙",
        "2D漫-现代都市",
        "2D漫-东方修仙",
      ],
      libraryAssets: [
        {
          id: "official-scene-garage",
          name: "车库",
          category: "scene",
          folder: "国内仿真人-现代都市",
          previewUrl: "data:image/svg+xml;charset=UTF-8,garage",
        },
        {
          id: "official-scene-villa",
          name: "别墅",
          category: "scene",
          folder: "国内仿真人-现代都市",
          previewUrl: "data:image/svg+xml;charset=UTF-8,villa",
        },
        {
          id: "official-scene-alley",
          name: "小巷",
          category: "scene",
          folder: "国内仿真人-现代都市",
          previewUrl: "data:image/svg+xml;charset=UTF-8,alley",
        },
        {
          id: "official-scene-hospital",
          name: "医院",
          category: "scene",
          folder: "国内仿真人-现代都市",
          previewUrl: "data:image/svg+xml;charset=UTF-8,hospital",
        },
        {
          id: "official-scene-office",
          name: "办公室",
          category: "scene",
          folder: "国内仿真人-现代都市",
          previewUrl: "data:image/svg+xml;charset=UTF-8,office",
        },
        {
          id: "official-scene-hotel",
          name: "酒店",
          category: "scene",
          folder: "国内仿真人-现代都市",
          previewUrl: "data:image/svg+xml;charset=UTF-8,hotel",
        },
        {
          id: "official-scene-club",
          name: "会所",
          category: "scene",
          folder: "国内仿真人-现代都市",
          previewUrl: "data:image/svg+xml;charset=UTF-8,club",
        },
        {
          id: "official-scene-airport",
          name: "机场",
          category: "scene",
          folder: "国内仿真人-现代都市",
          previewUrl: "data:image/svg+xml;charset=UTF-8,airport",
        },
      ],
    });

    assertIncludesAll(html, [
      "官方资产库",
      "团队资产库",
      "角色",
      "场景",
      "道具",
      "国内仿真人-现代都市",
      "国内仿真人-东方古代",
      "3D漫-现代都市",
      "3D漫-东方修仙",
      "2D漫-现代都市",
      "2D漫-东方修仙",
      "车库",
      "别墅",
      "小巷",
      "医院",
      "办公室",
      "酒店",
      "会所",
      "机场",
    ]);
    assert.match(html, /class="[^"]*library-team-scope-tab[^"]*is-active/);
    assert.match(html, /class="[^"]*library-team-category-tab[^"]*is-active/);
    assert.match(html, /class="[^"]*library-team-asset-grid[^"]*is-scene/);
    assert.match(html, /class="[^"]*library-team-asset-card[^"]*is-scene/);
    assert.doesNotMatch(html, /加入项目/);
    assert.doesNotMatch(html, /import-library-asset-to-project/);
  });

  it("renders the original team API node as an empty configuration table", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "team",
      libraryCategory: "api",
      libraryEntitlement: {
        hasTeamAssetLibrary: false,
        blockReason: "team_asset_library_entitlement_required",
      },
    });

    assertIncludesAll(html, [
      "团队资产库",
      "API",
      "配置团队专属 API，全员共享优质模型。",
      "查看使用位置",
      "配置企业API服务",
      "模型名称",
      "状态",
      "更新人",
      "最近更新时间",
      "操作",
      "本团队暂未给任何模型配置企业API服务",
    ]);
    assert.match(html, /library-team-api-panel/);
    assert.match(html, /<table/);
  });

  it("keeps team assets hidden behind the server entitlement gate", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "team",
      libraryEntitlement: {
        hasTeamAssetLibrary: false,
        blockReason: "team_asset_library_entitlement_required",
      },
      libraryAssets: [
        {
          id: "team-hero",
          name: "团队主角",
          category: "character",
          folder: "团队角色",
          previewUrl: "data:image/png;base64,team-hero",
        },
      ],
    });

    assertIncludesAll(html, ["团队资产库", "立即开通"]);
    assert.doesNotMatch(html, /团队主角/);
    assert.doesNotMatch(html, /data-library-asset-id="team-hero"/);
  });

  it("renders asset library loading and error states", () => {
    const loading = renderLibraryTeam({
      route: "assets",
      assetScope: "official",
      libraryLoading: true,
    });
    const errored = renderLibraryTeam({
      route: "assets",
      assetScope: "official",
      libraryError: "网络连接失败",
    });

    assertIncludesAll(loading, ["正在加载资产库"]);
    assertIncludesAll(errored, ["资产库加载失败", "网络连接失败"]);
  });
});

describe("Worker C production workbench integration", () => {
  it("renders the C asset library inside the production workbench library tab", () => {
    const html = renderWorkbenchTab("library");

    assert.match(html, /library-team-page/);
    assert.match(html, /library-workspace-scroll/);
    assert.doesNotMatch(html, /workspace-status/);
    assertIncludesAll(html, [
      "官方资产库",
      "团队资产库",
      "国内仿真人-现代都市",
      "角色",
      "保姆",
      "医生",
    ]);
    assert.doesNotMatch(html, /个人资产库/);
    assert.doesNotMatch(html, /id="script-upload-button"/);
    assert.doesNotMatch(html, /id="parse-script-button"/);
    assert.doesNotMatch(html, /AI 智能提取资产/);
    assert.doesNotMatch(html, /data-action="parse-script"/);

    const teamScopeHtml = renderWorkbenchTab("library", { libraryTeamAssetScope: "team" });

    assertIncludesAll(teamScopeHtml, [
      "官方资产库",
      "团队资产库",
      "团队资产库为专业版会员权益，开通后使用该功能。",
    ]);
  });

  it("renders the C team page and dashboard route inside the production workbench team tab", () => {
    const teamHtml = renderWorkbenchTab("team");

    assert.match(teamHtml, /library-team-page/);
    assert.match(teamHtml, /data-action="open-team-dashboard"/);
    assertIncludesAll(teamHtml, ["团队协作台", "团队额度", "数据管理", "成员管理", "创建成员账号"]);

    const dashboardHtml = renderWorkbenchTab("team", { libraryTeamRoute: "team-dashboard" });

    assertIncludesAll(dashboardHtml, ["成员创作与消耗", "项目资产与成本", "排行榜", "暂无数据"]);
    assert.match(dashboardHtml, /data-action="back-to-team-page"/);
  });

  it("loads the C library-team stylesheet from the app shell", () => {
    const html = readFileSync(new URL("../app.html", import.meta.url), "utf8");

    assert.match(html, /src\/features\/library-team\/library-team\.css/);
  });

  it("wires Escape handling high enough to close library-team modals", () => {
    const js = readFileSync(
      new URL("../src/features/production-workbench/index.js", import.meta.url),
      "utf8",
    );

    assert.match(js, /document\.addEventListener\("keydown"/);
    assert.match(js, /isLibraryPricingModalOpen = false/);
    assert.match(js, /isMemberRulesModalOpen = false/);
    assert.match(js, /libraryDetailAssetId = ""/);
  });

  it("preserves the library scroll position when toggling asset detail viewers", () => {
    const workbenchJs = readFileSync(
      new URL("../src/features/production-workbench/index.js", import.meta.url),
      "utf8",
    );
    const previewHtml = readFileSync(new URL("../asset-library-preview.html", import.meta.url), "utf8");

    assert.match(workbenchJs, /preserveLibraryScroll/);
    assert.match(workbenchJs, /captureLibraryScrollState/);
    assert.match(workbenchJs, /restoreLibraryScrollState/);
    assert.match(
      workbenchJs,
      /action === "open-library-asset-detail"[\s\S]*render\(workbench, \{ preserveLibraryScroll: true \}\)/,
    );
    assert.match(
      workbenchJs,
      /action === "close-library-asset-detail"[\s\S]*render\(workbench, \{ preserveLibraryScroll: true \}\)/,
    );
    assert.match(
      previewHtml,
      /render\(\{ preserveScroll: true \}\)/,
    );
  });

  it("wires reusable asset library browsing without project import actions", () => {
    const js = readFileSync(
      new URL("../src/features/production-workbench/index.js", import.meta.url),
      "utf8",
    );

    assert.match(js, /syncAssetLibraryFromApi/);
    assert.match(js, /getLibraryAssets/);
    assert.match(js, /data-library-search-input/);
    assert.match(js, /clear-library-search/);
    assert.match(js, /open-library-asset-detail/);
    assert.match(js, /select-library-asset-detail-view/);
    assert.doesNotMatch(js, /importLibraryAssetToProject/);
    assert.doesNotMatch(js, /import-library-asset-to-project/);
  });

  it("keeps the reusable asset search field outside the click action router", () => {
    const html = renderWorkbenchTab("library");
    const js = readFileSync(
      new URL("../src/features/production-workbench/index.js", import.meta.url),
      "utf8",
    );
    const css = readFileSync(
      new URL("../src/features/library-team/library-team.css", import.meta.url),
      "utf8",
    );

    assert.match(html, /data-library-search-input/);
    assert.doesNotMatch(html, /<input[\s\S]*data-action="search-library-assets"/);
    assert.match(js, /\[data-library-search-input\]/);
    assert.doesNotMatch(js, /\[data-action="search-library-assets"\]/);
    assert.match(
      css,
      /\.library-team-asset-search::before,\s*[\r\n]+\.library-team-asset-search::after\s*\{[\s\S]*pointer-events: none;/,
    );
    assert.match(
      css,
      /\.official-library-page \.library-team-search input\s*\{[\s\S]*z-index: 2;[\s\S]*pointer-events: auto;/,
    );
  });

  it("keeps library search typing stable by debouncing API sync instead of immediate rerender", () => {
    const js = readFileSync(
      new URL("../src/features/production-workbench/index.js", import.meta.url),
      "utf8",
    );

    assert.match(js, /scheduleAssetLibrarySearch/);
    assert.doesNotMatch(
      js,
      /if \(target\?\.\matches\?\('\[data-action="search-library-assets"\]'\)\) \{[\s\S]*?render\(workbench\);[\s\S]*?syncAssetLibraryFromApi/,
    );
  });

  it("keeps Chinese IME composition stable before scheduling library search", () => {
    const js = readFileSync(
      new URL("../src/features/production-workbench/index.js", import.meta.url),
      "utf8",
    );

    assert.match(js, /compositionstart/);
    assert.match(js, /compositionend/);
    assert.match(js, /librarySearchComposing/);
    assert.match(
      js,
      /if \(\s*event\.isComposing \|\| workbench\.librarySearchComposing\s*\) \{[\s\S]*?return;/,
    );
  });

  it("keeps folder browsing but omits the selected folder when searching reusable assets", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; options: RequestInit }> = [];
    globalThis.fetch = (async (url: string, options: RequestInit = {}) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    try {
      await creatorApi.getLibraryAssets({
        scope: "official",
        category: "character",
        folder: "国内仿真人-现代都市",
      });
      await creatorApi.getLibraryAssets({
        scope: "official",
        category: "character",
        folder: "国内仿真人-现代都市",
        query: "医生",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(
      calls[0].url,
      "/api/creator/library/assets?scope=official&category=character&folder=%E5%9B%BD%E5%86%85%E4%BB%BF%E7%9C%9F%E4%BA%BA-%E7%8E%B0%E4%BB%A3%E9%83%BD%E5%B8%82",
    );
    assert.equal(
      calls[1].url,
      "/api/creator/library/assets?scope=official&q=%E5%8C%BB%E7%94%9F",
    );
    assert.equal(calls.length, 2);
    assert.equal("importLibraryAssetToProject" in creatorApi, false);
  });

  it("keeps project pagination labels readable when Worker C is mounted", () => {
    const projectLibrary = Array.from({ length: 9 }, (_, index) => ({
      id: `project-${index + 1}`,
      name: `项目 ${index + 1}`,
      status: "未开始",
      createdAt: `2026/05/${String(index + 1).padStart(2, "0")}`,
    }));
    const html = renderWorkbenchTab("project", {
      projectPanelMode: "library",
      projectLibrary,
      projectLibraryPage: 1,
    });

    assertIncludesAll(html, ["上一页", "第 1 / 2 页", "下一页"]);
    assert.doesNotMatch(html, /涓|绗|椤\?/);
  });
});

describe("Worker C team management surfaces", () => {
  it("renders team metrics, filters, member table, and empty member CTA", () => {
    const html = renderLibraryTeam({ route: "team" });

    assertIncludesAll(html, [
      "团队资产库为专业版会员权益",
      "开通专业版",
      "数据管理",
      "刷新",
      "查看详细数据看板",
      "团队项目",
      "团队席位",
      "单账号任务并发",
      "团队消耗积分",
      "团队剩余积分",
      "团队剩余可分配积分",
      "成员管理",
      "规则说明",
      "创建成员账号",
      "账号",
      "成员名称",
      "角色",
      "项目",
      "成员组",
      "状态",
      "积分",
      "备注",
      "操作",
      "搜索",
      "重置",
      "创建成员开始团队协作",
      "邀请成员后，这里会显示账号、角色、项目范围与积分额度。",
    ]);
    assert.match(html, /data-action="show-library-placeholder"/);
    assert.match(html, /data-placeholder-message="[^"]*成员筛选[^"]*"/);
  });

  it("renders real members and stats when supplied by the workbench context", () => {
    const html = renderLibraryTeam({
      route: "team",
      projectName: "废土人",
      stats: {
        episodeCount: 3,
        memberCount: 1,
        generatedVideoCount: 4,
        generatedImageCount: 1280,
        assetCount: 720,
        exportCount: 300,
      },
      members: [
        {
          phone: "13800138000",
          userId: "user-1",
          role: "管理员",
          status: "enabled",
          consumedCredits: 512,
          scriptCount: 8,
          projectCount: 3,
          projectAverageCredits: 171,
        },
      ],
    });

    assertIncludesAll(html, ["废土人", "1/1", "13800138000", "管理员", "512", "8", "enabled"]);
  });

  it("renders the team dashboard route without requiring shell DOM", () => {
    const html = renderLibraryTeam({ route: "team-dashboard" });

    assertIncludesAll(html, [
      "团队数据看板",
      "成员创作与消耗",
      "项目资产与成本",
      "排行榜",
      "今天",
      "昨天",
      "本周",
      "本月",
      "上月",
      "今年",
      "导出",
      "暂无数据",
      "开始团队协作后，这里会显示成员消耗和项目成本。",
    ]);
    assert.match(html, /data-placeholder-message="[^"]*导出[^"]*"/);
  });
});

describe("Worker C commercial gates", () => {
  it("exports pricing fixtures and renders the pricing modal", () => {
    assert.deepEqual(
      pricingPlans.map((plan) => [plan.id, plan.name, plan.price, plan.credits]),
      [
        ["trial", "体验版", "¥100", "1000积分"],
        ["pro", "专业版", "¥5000", "51000积分"],
        ["enterprise", "企业版", "联系商务", "定制"],
      ],
    );

    const html = renderPricingModal({ open: true });

    assertIncludesAll(html, [
      "团队生产扩容",
      "积分加量",
      "兑换码",
      "体验版",
      "专业版",
      "企业版",
      "¥100",
      "¥5000",
      "联系商务",
      "支付与兑换码仅为原型占位，暂未接入真实交易。",
    ]);
    assert.match(html, /role="dialog"/);
    assert.match(html, /aria-modal="true"/);
    assert.match(html, /data-action="show-commerce-placeholder"/);
  });
});

describe("Worker C permission rules", () => {
  it("exports data-driven permissions and renders the rules modal", () => {
    assert.ok(teamRoles.includes("管理员"));
    assert.ok(teamRoles.includes("组管理员"));
    assert.ok(teamRoles.some((role) => role.includes("导演")));
    assert.ok(teamRoles.some((role) => role.includes("动画师")));
    assert.ok(teamRoles.includes("编剧"));
    assert.ok(teamRoles.includes("剪辑师"));
    assert.ok(permissionRows.length >= 6);

    const html = renderMemberRulesModal({ open: true });

    assertIncludesAll(html, [
      "成员管理规则说明",
      "基础规则",
      "成员角色权限管理",
      "角色权限对照表",
      "成员组管理",
      "积分管理机制",
      "账号与安全管理",
      "管理员",
      "组管理员",
      "导演",
      "动画师",
      "编剧",
      "剪辑师",
    ]);
    assert.match(html, /role="dialog"/);
    assert.match(html, /aria-modal="true"/);
    assert.match(html, /<table/);
  });
});

describe("Worker C design-system mapping", () => {
  it("keeps the library-team stylesheet tied to the canonical Web UI Kit tokens", () => {
    const css = readFileSync(
      new URL("../src/features/library-team/library-team.css", import.meta.url),
      "utf8",
    );

    assert.match(css, /--color-canvas/);
    assert.match(css, /--color-hairline/);
    assert.match(css, /--radius-sm/);
    assert.match(css, /--radius-pill/);
    assert.match(css, /--library-team-accent/);
    assert.match(css, /\.library-team-shell/);
    assert.match(css, /\.library-team-page-head/);
    assert.match(css, /\.library-team-empty-actions/);
    assert.match(css, /\.library-team-plan-note/);
    assert.match(css, /focus-visible/);
    assert.match(css, /@media \(max-width: 768px\)/);
    assert.match(css, /\.library-team-table-wrap/);
    assert.match(css, /\.library-team-modal[^{]*\{[^}]*overflow: auto/s);
    assert.match(css, /button:disabled/);
  });

  it("keeps every character folder on the same compact card sizing", () => {
    const css = readFileSync(
      new URL("../src/features/library-team/library-team.css", import.meta.url),
      "utf8",
    );

    assert.match(
      css,
      /\.official-library-page \.library-team-asset-grid\.is-character\s*\{[^}]*minmax\(210px,\s*1fr\)/s,
    );
    assert.doesNotMatch(
      css,
      /\.official-library-page \.library-team-asset-grid\.is-character\.is-folder-modern-city\s*\{[^}]*minmax\(360px,\s*1fr\)/s,
    );
    assert.match(
      css,
      /\.official-library-page \.library-team-asset-preview\.is-character\s*\{[^}]*aspect-ratio:\s*2\s*\/\s*3/s,
    );
    assert.match(
      css,
      /\.official-library-page \.library-team-asset-preview\.is-character\s*\{[^}]*object-fit:\s*contain/s,
    );
    assert.match(
      css,
      /\.official-library-page \.library-team-asset-card\.is-xianxia-3d-character \.library-team-asset-preview\.is-character\s*\{[^}]*border:\s*0/s,
    );
    assert.match(
      css,
      /\.official-library-page \.library-team-asset-card\.is-xianxia-3d-character \.library-team-asset-preview\.is-character\s*\{[^}]*object-fit:\s*contain/s,
    );
    assert.match(
      css,
      /\.official-library-page \.library-team-asset-card\.is-xianxia-2d-character\s*\{[^}]*padding:\s*6px\s+6px\s+44px/s,
    );
    assert.match(
      css,
      /\.official-library-page \.library-team-asset-card\.is-modern-2d-character,\s*[\r\n]+\.official-library-page \.library-team-asset-card\.is-xianxia-2d-character\s*\{[^}]*background:\s*#202128/s,
    );
    assert.match(
      css,
      /\.official-library-page \.library-team-asset-card\.is-modern-2d-character \.library-team-asset-preview\.is-character,\s*[\r\n]+\.official-library-page \.library-team-asset-card\.is-xianxia-2d-character \.library-team-asset-preview\.is-character\s*\{[^}]*background:\s*#ffffff/s,
    );
    assert.match(
      css,
      /\.official-library-page \.library-team-asset-card\.is-xianxia-2d-character \.library-team-asset-preview\.is-character\s*\{[^}]*object-fit:\s*cover/s,
    );
    assert.match(
      css,
      /\.official-library-page \.library-team-asset-card\.is-xianxia-2d-character \.library-team-asset-preview\.is-character\s*\{[^}]*object-position:\s*center\s+center/s,
    );
    assert.match(
      css,
      /\.official-library-page \.library-team-asset-card\.is-modern-3d-character\s*\{[^}]*padding:\s*6px\s+6px\s+44px/s,
    );
    assert.match(
      css,
      /\.official-library-page \.library-team-asset-card\.is-modern-3d-character \.library-team-asset-preview\.is-character\s*\{[^}]*background:\s*#ffffff/s,
    );
    assert.match(
      css,
      /\.official-library-page \.library-team-asset-card\.is-modern-3d-character \.library-team-asset-preview\.is-character\s*\{[^}]*object-fit:\s*cover/s,
    );
    assert.match(
      css,
      /\.official-library-page \.library-team-asset-card\.is-modern-3d-character \.library-team-asset-preview\.is-character\s*\{[^}]*filter:\s*none/s,
    );
    assert.match(
      css,
      /\.official-library-page\s+\.library-team-asset-grid\.is-folder-ancient-real\s+\.library-team-asset-preview\.is-character-reference\s*\{[^}]*background:\s*#f7f7fa/s,
    );
    assert.doesNotMatch(
      css,
      /\.official-library-page \.library-team-asset-grid\.is-character\.is-folder-ancient-real\s*\{[^}]*minmax\(360px,\s*1fr\)/s,
    );
    assert.match(
      css,
      /\.library-team-asset-detail-stage\.is-character img\s*\{[^}]*object-fit:\s*contain/s,
    );
    assert.match(
      css,
      /\.library-team-asset-detail-thumb\.is-character img\s*\{[^}]*object-fit:\s*contain/s,
    );
    assert.match(
      css,
      /\.library-team-asset-detail-stage\.is-character\.is-xianxia-3d-character img\s*\{[^}]*clip-path:\s*inset\(1px round 8px\)/s,
    );
    assert.match(
      css,
      /\.library-team-asset-detail-stage\.is-character\.is-xianxia-2d-character img\s*\{[^}]*clip-path:\s*inset\(1px round 8px\)/s,
    );
  });

  it("keeps prop cards natural with full names instead of white framed thumbnails", () => {
    const css = readFileSync(
      new URL("../src/features/library-team/library-team.css", import.meta.url),
      "utf8",
    );

    assert.match(
      css,
      /\.official-library-page \.library-team-asset-preview\.is-prop\s*\{[^}]*background:\s*#ffffff/s,
    );
    assert.match(
      css,
      /\.official-library-page \.library-team-asset-preview\.is-prop\s*\{[^}]*object-fit:\s*cover/s,
    );
    assert.match(
      css,
      /\.official-library-page \.library-team-asset-preview\.is-prop\s*\{[^}]*filter:\s*none/s,
    );
    assert.match(
      css,
      /\.official-library-page \.library-team-asset-card\.is-prop h3\s*\{[^}]*white-space:\s*normal/s,
    );
    assert.doesNotMatch(
      css,
      /\.official-library-page \.library-team-asset-card\.is-prop h3\s*\{[^}]*text-overflow:\s*ellipsis/s,
    );
    assert.match(
      css,
      /\.library-team-asset-detail-prop-plate\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1/s,
    );
    assert.match(
      css,
      /\.library-team-asset-detail-prop-plate\s*\{[^}]*background:\s*linear-gradient\(180deg,\s*#fdfdfb,\s*#f6f7f8\)/s,
    );
    assert.match(
      css,
      /\.library-team-asset-detail-stage\.is-prop img\s*\{[^}]*object-fit:\s*contain/s,
    );
    assert.match(
      css,
      /\.library-team-asset-detail-stage\.is-prop img\s*\{[^}]*padding:\s*0/s,
    );
    assert.match(
      css,
      /\.library-team-asset-detail-stage\.is-prop img\s*\{[^}]*box-shadow:\s*none/s,
    );
  });

  it("ships every generated prop raster as a clean white product-card plate", () => {
    const propFiles = readdirSync(
      new URL("../assets/library/official/props/", import.meta.url),
    ).filter((fileName) => /^prop-.+\.png$/.test(fileName));

    assert.equal(propFiles.length, 48);

    for (const fileName of propFiles) {
      const path = `/assets/library/official/props/${fileName}`;
      const image = readPngRgbaFixture(path);

      assert.deepEqual(
        { width: image.width, height: image.height },
        { width: 960, height: 1200 },
        `${fileName} should match the 4:5 product-card frame`,
      );

      for (const [x, y] of [
        [8, 8],
        [image.width - 9, 8],
        [8, image.height - 9],
        [image.width - 9, image.height - 9],
      ] as const) {
        const index = (y * image.width + x) * 4;
        assert.ok(image.rgba[index + 3] === 255, `${fileName} should be an opaque card image`);
        assert.ok(
          image.rgba[index] >= 238 && image.rgba[index + 1] >= 238 && image.rgba[index + 2] >= 236,
          `${fileName} should use a white product-card background`,
        );
      }
    }
  });

  it("ships every prop detail raster as an uncropped square product plate", () => {
    const detailFiles = readdirSync(
      new URL("../assets/library/official/props/detail/", import.meta.url),
    ).filter((fileName) => /^prop-.+\.png$/.test(fileName));

    assert.equal(detailFiles.length, 48);

    for (const fileName of detailFiles) {
      const image = readPngRgbaFixture(`/assets/library/official/props/detail/${fileName}`);

      assert.deepEqual(
        { width: image.width, height: image.height },
        { width: 1200, height: 1200 },
        `${fileName} should be a square detail plate so the viewer does not crop it`,
      );

      let strongEdgePixels = 0;
      const edgeBand = 40;
      for (let y = 0; y < image.height; y += 1) {
        for (let x = 0; x < image.width; x += 1) {
          const isEdge =
            x < edgeBand ||
            y < edgeBand ||
            x >= image.width - edgeBand ||
            y >= image.height - edgeBand;
          if (!isEdge) continue;

          const index = (y * image.width + x) * 4;
          const alpha = image.rgba[index + 3];
          const distanceFromWhite = Math.max(
            255 - image.rgba[index],
            255 - image.rgba[index + 1],
            255 - image.rgba[index + 2],
          );
          if (alpha > 16 && distanceFromWhite > 42) {
            strongEdgePixels += 1;
          }
        }
      }

      assert.equal(strongEdgePixels, 0, `${fileName} should not have hard-cut subject pixels on its plate edge`);
    }
  });

  it("keeps prop artwork free of internal hard-cut seams and leftover fragments", () => {
    for (const check of [
      {
        path: "/assets/library/official/props/prop-2d-modern-milk-tea.png",
        region: { left: 0, right: 230, top: 260, bottom: 780 },
        maxVisiblePixels: 400,
      },
      {
        path: "/assets/library/official/props/detail/prop-2d-modern-milk-tea.png",
        region: { left: 0, right: 300, top: 260, bottom: 780 },
        maxVisiblePixels: 400,
      },
    ] as const) {
      assert.ok(
        pngVisiblePixelCount(check.path, check.region, 30) <= check.maxVisiblePixels,
        `${check.path} should not keep detached product-fragment pixels on the plate`,
      );
    }

    for (const check of [
      {
        path: "/assets/library/official/props/prop-2d-modern-earphone.png",
        region: { left: 250, right: 460, top: 520, bottom: 920 },
        maxRun: 90,
      },
      {
        path: "/assets/library/official/props/detail/prop-2d-modern-earphone.png",
        region: { left: 330, right: 580, top: 520, bottom: 980 },
        maxRun: 90,
      },
      {
        path: "/assets/library/official/props/prop-ancient-poison.png",
        region: { left: 360, right: 510, top: 720, bottom: 1060 },
        maxRun: 90,
      },
      {
        path: "/assets/library/official/props/detail/prop-ancient-poison.png",
        region: { left: 440, right: 640, top: 720, bottom: 1100 },
        maxRun: 90,
      },
      {
        path: "/assets/library/official/props/prop-2d-xianxia-scroll.png",
        region: { left: 220, right: 380, top: 640, bottom: 1040 },
        maxRun: 90,
      },
      {
        path: "/assets/library/official/props/detail/prop-2d-xianxia-scroll.png",
        region: { left: 310, right: 520, top: 680, bottom: 1100 },
        maxRun: 90,
      },
      {
        path: "/assets/library/official/props/prop-2d-xianxia-umbrella.png",
        region: { left: 560, right: 760, top: 400, bottom: 940 },
        maxRun: 90,
      },
      {
        path: "/assets/library/official/props/detail/prop-2d-xianxia-umbrella.png",
        region: { left: 690, right: 940, top: 400, bottom: 980 },
        maxRun: 90,
      },
    ] as const) {
      assert.ok(
        pngLongestVerticalPlateCutRun(check.path, check.region) <= check.maxRun,
        `${check.path} should not contain a long straight plate-to-artwork cut seam`,
      );
    }
  });

  it("does not ship the rejected hard-cut prop rasters", () => {
    const rejectedPropRasterHashes = {
      "/assets/library/official/props/prop-ancient-wine.png":
        "b9ce51b166f554b1c2133d2ace45a484968c41d7da1a6f07c616b935ec3ebc91",
      "/assets/library/official/props/detail/prop-ancient-wine.png":
        "109dd21d0aa3a8f30c3d36c94e463d4174997353cf848a181a87f171309c0806",
      "/assets/library/official/props/prop-ancient-poison.png":
        "c5382bc656eed55417a4c747fbaabc516c56b5395d78c1f3a1ff672a92ab3252",
      "/assets/library/official/props/detail/prop-ancient-poison.png":
        "a7f3a6537df1c16fb61084dc379df8b779ba4a1a9e0e127df3e3cbb1ea18784d",
      "/assets/library/official/props/prop-2d-xianxia-scroll.png":
        "218fa03f64d523d3c483b55842c5accbb60a38960f9019a93c233de95648e9bd",
      "/assets/library/official/props/detail/prop-2d-xianxia-scroll.png":
        "151b44192d4f262fb538f23b4c402e264111423931e3fd1f7c1b7a3dc38e1ada",
      "/assets/library/official/props/prop-2d-modern-milk-tea.png":
        "32773a86132550c1ae5990b1e2b403b41c2584f96e3a8fea2be08b8d856ae7a5",
      "/assets/library/official/props/detail/prop-2d-modern-milk-tea.png":
        "21c06996275be807c1398d9519074a7e45339457408b7d1934c11f5e66fdcbc6",
      "/assets/library/official/props/prop-2d-modern-earphone.png":
        "99aba9c9617fbd98eded66bcd91c96ca124587768ec7665b2190906faeb001a7",
      "/assets/library/official/props/detail/prop-2d-modern-earphone.png":
        "5f8623159cc569ca2168d52a24177c44d1cdd01b2e6dc89171efe1a01ad9e312",
      "/assets/library/official/props/prop-2d-xianxia-umbrella.png":
        "0f35c16897b21e52691c90e255159e24ecc70c87a94ecdb90f4f2ef3a5e29f3c",
      "/assets/library/official/props/detail/prop-2d-xianxia-umbrella.png":
        "547a8530bbf907b04773577731fc6579ac6091e4c5cfe50a36b2e7450e06cff7",
      "/assets/library/official/props/prop-3d-xianxia-cauldron.png":
        "5e000153746a0b89607ef8a34dc25e4726d1d01979e6762e27f3ebb0446cf52c",
      "/assets/library/official/props/detail/prop-3d-xianxia-cauldron.png":
        "17dab10f25b4fad3d5fd5feb0a4f44c157693760693435a7524655a71a70b1b2",
      "/assets/library/official/props/prop-3d-xianxia-bag.png":
        "8fce7093ade12a61a2815f2618898b2302c0fb76f796757f9a5557b39819785f",
      "/assets/library/official/props/detail/prop-3d-xianxia-bag.png":
        "f531942a716c8876f1268934251b6e1ca3b0b8ef750eaf0a5368a535fa6b8e53",
      "/assets/library/official/props/prop-3d-xianxia-herb-box.png":
        "7f4b01ead9fa25a6ee5cecedb7cf06bde1f9144c5f51aaa0595028468bdf746a",
      "/assets/library/official/props/detail/prop-3d-xianxia-herb-box.png":
        "1035000cdb1b02724ec8b38a72638a3a3aa853fccc226e2483822cd34d94bd27",
      "/assets/library/official/props/prop-3d-xianxia-compass.png":
        "ea24c9d6d4ec24fafb6d365ba3acfb6a430da4de7b371061976272bf6bb665d2",
      "/assets/library/official/props/detail/prop-3d-xianxia-compass.png":
        "4e42364431d23481ae64d48ddb980ae1253805718347ddb035091a3d126ff33a",
      "/assets/library/official/props/prop-3d-xianxia-bell.png":
        "ce16de1098c26f2d4b1830a28a1364046ab8b69359ba4f4fa226f227b3b686a7",
      "/assets/library/official/props/detail/prop-3d-xianxia-bell.png":
        "fd137d8ffb0fca121d0588dc848a3fdf600bf57405bb2ab3cbb96ea694f5dbeb",
      "/assets/library/official/props/prop-3d-xianxia-spirit-stone.png":
        "51c2614030552592c85f2f2b1b9922a14b5e37a1567185a924abae2661d0bdaa",
      "/assets/library/official/props/detail/prop-3d-xianxia-spirit-stone.png":
        "447165a832c7594a39c39f4b5dec08e159e3b9acbca3eaf5165d5d9a38bbfd1c",
      "/assets/library/official/props/prop-3d-xianxia-jade-slip.png":
        "268b5297a4912b1221d11fa4d90b8839bffb5c044d256187c96c6ffd8bf2743b",
      "/assets/library/official/props/detail/prop-3d-xianxia-jade-slip.png":
        "a8860790ce32586438310314a67747074ab800fe2f73e7d43540461e4c58cbc2",
      "/assets/library/official/props/prop-3d-xianxia-flying-sword.png":
        "2fc37a7fa3f7add599bc4014ab7dd06199e1829b776600b7e86188550e605535",
      "/assets/library/official/props/detail/prop-3d-xianxia-flying-sword.png":
        "b0fdd31123b1d8c9f66de8c676425342b41645f8456a5bb37e9ac7c9935b7c40",
    };

    for (const [path, rejectedHash] of Object.entries(rejectedPropRasterHashes)) {
      assert.notEqual(hashFixtureImage(path), rejectedHash, `${path} should use the cleaned prop raster`);
    }
  });
});
