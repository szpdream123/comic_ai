import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyBrandKitBackground,
  applyBrandKitToCanvasSelection,
  applyBrandKitToGenerationRequest,
  BRAND_KIT_CUSTOM_FONT_FAMILY,
  brandKitAssetsByType,
  brandKitCanvasFont,
  brandKitDetailFromPayload,
  brandKitListFromPayload,
  brandKitTextNodeOptions,
  buildBrandKitGenerationGuidance,
  clearBrandKitCanvasFont,
  registerBrandKitCanvasFont,
  selectedBrandKitIdFromPayload,
} from "../new-canvas/src/loomic-shell/canvas-brand-kit.js";

const kit = {
  id: "kit-1",
  name: "北辰品牌",
  is_default: true,
  guidance_text: "克制、清晰，不使用拟物高光。",
  assets: [
    { id: "color-bg", asset_type: "color", display_name: "纸色", role: "background", sort_order: 2, text_content: "#f7f7f5" },
    { id: "color-primary", asset_type: "color", display_name: "主色", role: "primary", sort_order: 0, text_content: "#143642" },
    { id: "font-1", asset_type: "font", display_name: "正文", role: "body", sort_order: 1, text_content: "Noto Sans SC", metadata: { category: "sans-serif" } },
    { id: "logo-1", asset_type: "logo", display_name: "横版 Logo", role: null, sort_order: 3, storage_object_id: "storage-logo", file_url: "https://signed.invalid/logo.png?secret=1" },
  ],
};

test("brand kit payload helpers preserve Loomic multi-kit and typed assets", () => {
  assert.deepEqual(brandKitListFromPayload({ brandKits: [{ id: "a" }, { id: "b" }] }).map((entry) => entry.id), ["a", "b"]);
  const detail = brandKitDetailFromPayload({ brandKit: kit });
  assert.equal(detail.name, "北辰品牌");
  assert.deepEqual(brandKitAssetsByType(detail, "color").map((asset) => asset.id), ["color-primary", "color-bg"]);
  assert.equal(selectedBrandKitIdFromPayload({ project: { brand_kit_id: "kit-1" } }), "kit-1");
});

test("generation guidance is applied to the real prompt without leaking signed URLs", () => {
  const guidance = buildBrandKitGenerationGuidance(kit);
  assert.match(guidance, /品牌套件：北辰品牌/);
  assert.match(guidance, /#143642/);
  assert.match(guidance, /Noto Sans SC/);
  assert.doesNotMatch(guidance, /signed\.invalid|secret=1/);

  const request = applyBrandKitToGenerationRequest({ type: "image-generator", prompt: "夜景海报" }, kit);
  assert.match(request.prompt, /^夜景海报/);
  assert.match(request.prompt, /品牌指南/);
  assert.equal(request.brandKitId, "kit-1");
  assert.deepEqual(request.brandKitContext.assetReferences.at(-1), {
    id: "logo-1",
    type: "logo",
    name: "横版 Logo",
    role: null,
    storageObjectId: "storage-logo",
  });
  assert.doesNotMatch(JSON.stringify(request), /signed\.invalid|data:|blob:/i);
  assert.equal(applyBrandKitToGenerationRequest(request, kit).prompt, request.prompt);

  const video = applyBrandKitToGenerationRequest({ type: "video-generator", prompt: "镜头推进" }, kit);
  const director = applyBrandKitToGenerationRequest({ type: "director-node", instructions: "编排三个镜头" }, kit);
  assert.match(video.prompt, /品牌套件：北辰品牌/);
  assert.match(director.instructions, /品牌套件：北辰品牌/);

  const audio = { type: "audio-node", text: "请在这里停顿。", prompt: "请在这里停顿。" };
  assert.equal(applyBrandKitToGenerationRequest(audio, kit), audio);
  assert.equal(audio.text, "请在这里停顿。");
  assert.equal(audio.prompt, "请在这里停顿。");
});

test("brand colors and fonts apply to new and selected canvas text", () => {
  assert.deepEqual(brandKitTextNodeOptions(kit), {
    strokeColor: "#143642",
    fontFamily: 2,
    customData: {
      brandKitId: "kit-1",
      brandFontAssetId: "font-1",
      brandFontFamily: "Noto Sans SC",
    },
  });

  let update;
  const api = {
    getAppState: () => ({ selectedElementIds: { text1: true } }),
    getSceneElements: () => [{ id: "text1", type: "text", strokeColor: "#000000", fontFamily: 5, version: 1, customData: {} }],
    updateScene: (value) => { update = value; },
  };
  assert.equal(applyBrandKitToCanvasSelection(api, kit), true);
  assert.equal(update.elements[0].strokeColor, "#143642");
  assert.equal(update.elements[0].fontFamily, 2);
  assert.equal(update.elements[0].customData.brandKitId, "kit-1");
  assert.equal(applyBrandKitBackground(api, kit), true);
  assert.equal(update.appState.viewBackgroundColor, "#f7f7f5");
});

test("uploaded brand fonts register in Excalidraw's custom slot through a stable object route", async () => {
  const uploadedKit = {
    ...kit,
    assets: kit.assets.map((asset) => asset.id === "font-1" ? {
      ...asset,
      storage_object_id: "brand/font object",
      file_url: "https://signed.invalid/font.woff2?expired=1",
    } : asset),
  };
  const font = brandKitCanvasFont(uploadedKit);
  assert.equal(font.canvasFontFamily, BRAND_KIT_CUSTOM_FONT_FAMILY);
  assert.equal(font.sourceUrl, "/api/storage/objects/brand%2Ffont%20object/content");
  assert.equal(font.runtimeFamily, "Loomic Custom font-1");

  const fontFamilies = { Helvetica: 2, PreviousCustom: BRAND_KIT_CUSTOM_FONT_FAMILY };
  const added = [];
  class FakeFontFace {
    constructor(family, source) {
      this.family = family;
      this.source = source;
    }
    async load() { return this; }
  }
  assert.equal(await registerBrandKitCanvasFont(uploadedKit, {
    fontFamilies,
    documentFonts: { add: (fontFace) => added.push(fontFace) },
    FontFaceCtor: FakeFontFace,
  }), true);
  assert.equal(fontFamilies.PreviousCustom, undefined);
  assert.equal(fontFamilies[font.runtimeFamily], BRAND_KIT_CUSTOM_FONT_FAMILY);
  assert.equal(added[0].family, font.runtimeFamily);
  assert.equal(added[0].source, `url(${JSON.stringify(font.sourceUrl)})`);

  const options = brandKitTextNodeOptions(uploadedKit);
  assert.equal(options.fontFamily, BRAND_KIT_CUSTOM_FONT_FAMILY);
  assert.equal(options.customData.brandFontAssetId, "font-1");
  const deleted = [];
  assert.equal(clearBrandKitCanvasFont({ fontFamilies, documentFonts: { delete: (fontFace) => deleted.push(fontFace) } }), true);
  assert.equal(fontFamilies[font.runtimeFamily], undefined);
  assert.equal(deleted.length, 1);
});

test("a slower previous brand font load cannot replace the current kit font", async () => {
  const fontFamilies = { Helvetica: 2 };
  const pending = new Map();
  class DeferredFontFace {
    constructor(family) { this.family = family; }
    load() { return new Promise((resolve) => pending.set(this.family, () => resolve(this))); }
  }
  const runtime = {
    fontFamilies,
    documentFonts: { add() {}, delete() {} },
    FontFaceCtor: DeferredFontFace,
  };
  const customKit = (id) => ({
    id: `kit-${id}`,
    assets: [{ id, asset_type: "font", role: "primary", text_content: id, storage_object_id: `object-${id}` }],
  });
  const first = registerBrandKitCanvasFont(customKit("font-a"), runtime);
  const second = registerBrandKitCanvasFont(customKit("font-b"), runtime);
  pending.get("Loomic Custom font-b")();
  assert.equal(await second, true);
  pending.get("Loomic Custom font-a")();
  assert.equal(await first, false);
  assert.equal(fontFamilies["Loomic Custom font-b"], BRAND_KIT_CUSTOM_FONT_FAMILY);
  assert.equal(fontFamilies["Loomic Custom font-a"], undefined);
  clearBrandKitCanvasFont(runtime);
});

test("brand kit utilities remain available without wiring project brand state into independent canvases", async () => {
  const [shellIndexSource, mainSource, elementSource, editorSource] = await Promise.all([
    readFile(new URL("../new-canvas/src/loomic-shell/index.js", import.meta.url), "utf8"),
    readFile(new URL("../new-canvas/src/main.jsx", import.meta.url), "utf8"),
    readFile(new URL("../new-canvas/src/loomic-core/canvas-elements.js", import.meta.url), "utf8"),
    readFile(new URL("../new-canvas/src/loomic-core/CanvasEditor.jsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(shellIndexSource, /CanvasBrandPanel|ProjectCanvasSwitcher|project-canvases/);
  assert.doesNotMatch(mainSource, /applyBrandKitToGenerationRequest|activeBrandKit|CanvasBrandPanel/);
  assert.doesNotMatch(mainSource, /getProjectBrandKit|updateProjectBrandKit/);
  assert.doesNotMatch(mainSource, /品牌颜色、字体和标志将在后续业务接入阶段配置/);
  assert.match(elementSource, /strokeColor: options\.strokeColor/);
  assert.match(elementSource, /fontFamily: Number\(options\.fontFamily\)/);
  assert.match(editorSource, /registerBrandKitCanvasFont\(brandKit/);
  assert.match(editorSource, /clearBrandKitCanvasFont\(runtime\)/);
  assert.match(editorSource, /fontFamilies: FONT_FAMILY/);
  assert.match(editorSource, /FontFaceCtor: typeof FontFace/);
  assert.match(editorSource, /api\.refresh\?\.\(\)/);
});
