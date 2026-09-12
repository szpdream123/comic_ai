import assert from "node:assert/strict";
import { it } from "node:test";
import {
  appendSelectedEpisodeAssetToPrompt,
  buildVideoGenerationPayload,
  resolvePromptEditorMentionReferences,
} from "../src/features/production-workbench/index.js";
import {
  collectPromptEditorMentions,
  createPromptEditorDocument,
  serializePromptEditorDocument,
} from "../src/features/production-workbench/prompt-editor-document.js";
import { addStoryboard } from "../src/features/production-workbench/storyboard-state.js";

const scene = { id: "scene-rain", name: "雨夜梧桐旧书摊旁", role: "scene", previewUrl: "/uploads/rain.png" };
const character = { id: "character-su", name: "苏晚", role: "character", previewUrl: "/uploads/su.png" };
const prop = { id: "prop-book", name: "旧书", role: "prop", previewUrl: "/uploads/book.png" };
const table = [
  "资产对照表：",
  "视频场景对照表：雨夜梧桐旧书摊旁=【@雨夜梧桐旧书摊旁】",
  "视频角色对照表：苏晚=【@苏晚】",
  "视频道具对照表：旧书=【@旧书】",
].join("\n");

function fixture(description: string, assets = [scene, character, prop], references = assets) {
  const storyboard = {
    ...addStoryboard([])[0], id: "shot-auto-mentions", description,
    references: references.map((asset) => ({ ...asset, assetId: asset.id })),
    previewImageUrl: null, currentImageAssetVersionId: null, uploadedImages: [],
  };
  const workbench = {
    ui: {
      projectPanelMode: "episode-workbench", museScopeMode: "storyboard", museBoardMode: "operation",
      episodeMediaMode: "video", videoGenerationMode: "reference-video", selectedEpisodeId: "episode-1",
      selectedStoryboardId: storyboard.id, storyboards: [storyboard], episodeStoryboardMap: { "episode-1": [storyboard] },
      prompt: "", importedAssets: {
        scene: assets.filter((asset) => asset.role === "scene"),
        character: assets.filter((asset) => asset.role === "character"),
        prop: assets.filter((asset) => asset.role === "prop"),
      },
    },
  };
  return { workbench, storyboard, run: () => appendSelectedEpisodeAssetToPrompt(workbench, { storyboardId: storyboard.id }) };
}

it("binds every prose occurrence to the asset table's image, without changing the saved shot or file order", () => {
  const source = `【分镜承接】\n苏晚在雨夜梧桐旧书摊旁拿起旧书。\n【镜头1】\n苏晚低头翻开旧书，苏晚轻轻呼吸。\n${table}`;
  const { workbench, storyboard, run } = fixture(source);
  const saved = JSON.stringify(storyboard.references);
  const result = run();
  assert.equal(result.ok, true);
  assert.equal(result.warning, "");
  assert.equal(workbench.ui.prompt, [
    "【分镜承接】", "【@图2】在【@图1】拿起【@图3】。", "【镜头1】",
    "【@图2】低头翻开【@图3】，【@图2】轻轻呼吸。", "资产对照表：",
    "视频场景对照表：雨夜梧桐旧书摊旁=【@图1】",
    "视频角色对照表：苏晚=【@图2】的角色形象",
    "视频道具对照表：旧书=【@图3】的道具形象",
  ].join("\n"));
  assert.equal(storyboard.description, source);
  assert.equal(JSON.stringify(storyboard.references), saved);
  const payload = buildVideoGenerationPayload(workbench);
  assert.equal(payload.prompt, workbench.ui.prompt);
  assert.deepEqual(payload.parameters.filePaths, ["/uploads/rain.png", "/uploads/su.png", "/uploads/book.png"]);
  const mentionRefs = resolvePromptEditorMentionReferences(workbench, workbench.ui.prompt);
  const doc = createPromptEditorDocument(workbench.ui.prompt, mentionRefs);
  const mentions = collectPromptEditorMentions(doc);
  assert.equal(mentions.length, 9);
  assert.equal(mentions[0].label, "图2");
  assert.equal(mentions[0].preview, "/uploads/su.png");
  assert.equal(serializePromptEditorDocument(doc), workbench.ui.prompt);
  const firstPrompt = workbench.ui.prompt;
  const repeated = run();
  assert.equal(workbench.ui.prompt, firstPrompt);
  assert.equal(repeated.references.length, 3);
  assert.deepEqual(buildVideoGenerationPayload(workbench).parameters.filePaths, ["/uploads/rain.png", "/uploads/su.png", "/uploads/book.png"]);
});

it("does not renumber attachments by the order of names in the prose or asset table", () => {
  const { workbench, run } = fixture(`苏晚拿着旧书。\n${table}`, [scene, character, prop], [prop, character, scene]);
  run();
  assert.match(workbench.ui.prompt, /^【@图2】拿着【@图1】。/u);
  assert.deepEqual(buildVideoGenerationPayload(workbench).parameters.filePaths, ["/uploads/book.png", "/uploads/su.png", "/uploads/rain.png"]);
});

it("preserves existing explicit mentions and only converts names declared in the asset table", () => {
  const { workbench, run } = fixture("【@苏晚】走近旧书；苏晚看向雨夜梧桐旧书摊旁。\n视频角色对照表：苏晚=【@苏晚】");
  run();
  assert.match(workbench.ui.prompt, /^【@图2】走近旧书；【@图2】看向雨夜梧桐旧书摊旁。/u);
});

it("matches a longer asset name atomically even when a shorter declared name occurs inside it", () => {
  const older = { ...character, id: "character-older", name: "苏晚晚", previewUrl: "/uploads/older.png" };
  const { workbench, run } = fixture(
    "苏晚晚递给苏晚旧书。\n视频角色对照表：苏晚=【@苏晚】；苏晚晚=【@苏晚晚】",
    [character, older, prop],
  );
  run();
  assert.match(workbench.ui.prompt, /^【@图2】递给【@图1】旧书。/u);
});

it("does not replace a short name inside an undeclared known asset name", () => {
  const older = { ...character, id: "character-older", name: "苏晚晚", previewUrl: "/uploads/older.png" };
  const { workbench, run } = fixture("苏晚晚走近苏晚。\n视频角色对照表：苏晚=【@苏晚】", [character, older]);
  run();
  assert.match(workbench.ui.prompt, /^苏晚晚走近【@图1】。/u);
});

it("leaves missing asset names readable and warns instead of creating phantom image tokens", () => {
  const missing = { ...prop, previewUrl: "" };
  const { workbench, run } = fixture(`苏晚拿着旧书。\n${table}`, [scene, character, missing]);
  const result = run();
  assert.match(workbench.ui.prompt, /^【@图2】拿着旧书。/u);
  assert.doesNotMatch(workbench.ui.prompt, /【@图3】/u);
  assert.match(result.warning, /旧书/u);
  assert.equal(result.references.length, 2);
});

it("warns when every table asset is missing while preserving source text", () => {
  const { workbench, run } = fixture("苏晚站着。\n视频角色对照表：苏晚=【@苏晚】", [], []);
  const result = run();
  assert.equal(workbench.ui.prompt, "苏晚站着。\n视频角色对照表：苏晚=苏晚");
  assert.match(result.warning, /苏晚/u);
  assert.equal(result.references.length, 0);
});

it("does not guess which image a plain name means when the table has conflicting bindings", () => {
  const city = { ...scene, name: "故城" };
  const person = { ...character, name: "故城" };
  const { workbench, run } = fixture("故城出现在画面中。\n视频场景对照表：故城=【@故城】\n视频角色对照表：故城=【@故城】", [city, person]);
  const result = run();
  assert.match(workbench.ui.prompt, /^故城出现在画面中。/u);
  assert.match(result.warning, /故城/u);
});

it("does not guess among same-kind assets without a selected image binding", () => {
  const duplicate = { ...character, id: "character-other-su", previewUrl: "/uploads/other-su.png" };
  const { workbench, run } = fixture("苏晚站着。\n视频角色对照表：苏晚=【@苏晚】", [character, duplicate], []);
  const result = run();
  assert.match(workbench.ui.prompt, /^苏晚站着。/u);
  assert.match(result.warning, /苏晚/u);
});

it("does not reinterpret storyboard-only image1 as a named character reference", () => {
  const { workbench, storyboard, run } = fixture(`苏晚拿着旧书。\n${table}`);
  workbench.ui.museBoardMode = "storyboard";
  storyboard.previewImageUrl = "/uploads/storyboard-sheet.png";
  const result = run();
  assert.match(workbench.ui.prompt, /苏晚拿着旧书。/u);
  assert.doesNotMatch(workbench.ui.prompt, /【@图\d+】拿着/u);
  assert.equal(result.references.length, 1);
});

it("detects same-name ambiguity using the existing whitespace and punctuation normalization", () => {
  const spaced = { ...character, id: "other", name: "苏 晚", previewUrl: "/uploads/other.png" };
  const { workbench, run } = fixture("苏晚站着。\n视频角色对照表：苏晚=【@苏晚】", [spaced, character], []);
  const result = run();
  assert.match(workbench.ui.prompt, /^苏晚站着。/u);
  assert.match(result.warning, /苏晚/u);
});

it("treats a table name mapped to two different images as ambiguous", () => {
  const left = { ...character, id: "left", name: "甲" };
  const right = { ...character, id: "right", name: "乙", previewUrl: "/uploads/yi.png" };
  const { workbench, run } = fixture("苏晚站着。\n视频角色对照表：苏晚=【@甲】和【@乙】", [left, right]);
  const result = run();
  assert.match(workbench.ui.prompt, /^苏晚站着。/u);
  assert.match(result.warning, /苏晚/u);
});

it("reuses a single deduplicated image when same-name assets share that image", () => {
  const duplicate = { ...character, id: "duplicate-su" };
  const { workbench, run } = fixture("苏晚站着。\n视频角色对照表：苏晚=【@苏晚】", [character, duplicate]);
  const result = run();
  assert.match(workbench.ui.prompt, /^【@图1】站着。/u);
  assert.equal(result.warning, "");
  assert.deepEqual(buildVideoGenerationPayload(workbench).parameters.filePaths, ["/uploads/su.png"]);
});

it("converts prose preceding an inline asset table without rewriting the table itself", () => {
  const { workbench, run } = fixture("苏晚站着。 视频角色对照表：苏晚=【@苏晚】", [character]);
  run();
  assert.equal(workbench.ui.prompt, "【@图1】站着。 视频角色对照表：苏晚=【@图1】的角色形象");
});

it("does not bind a multi-reference table entry when either target image is missing", () => {
  const left = { ...character, id: "left", name: "甲" };
  const missing = { ...character, id: "missing", name: "乙", previewUrl: "" };
  for (const targets of ["【@甲】和【@乙】", "【@乙】和【@甲】"]) {
    const { workbench, run } = fixture(`苏晚站着。\n视频角色对照表：苏晚=${targets}`, [left, missing]);
    const result = run();
    assert.match(workbench.ui.prompt, /^苏晚站着。/u);
    assert.match(result.warning, /苏晚/u);
  }
});

it("preserves structural shot headings when a prop name overlaps a heading", () => {
  const lens = { ...prop, name: "镜头", previewUrl: "/uploads/lens.png" };
  const { workbench, run } = fixture("【镜头1】0.0-4.0秒\n小明举起镜头。\n视频道具对照表：镜头=【@镜头】", [lens]);
  run();
  assert.match(workbench.ui.prompt, /^【镜头1】0\.0-4\.0秒\n小明举起【@图1】。/u);
});
