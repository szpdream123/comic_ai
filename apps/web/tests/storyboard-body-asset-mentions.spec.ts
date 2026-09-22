import assert from "node:assert/strict";
import { it } from "node:test";
import {
  appendSelectedEpisodeAssetToPrompt,
  buildVideoGenerationPayload,
  handleWorkbenchActionForTest,
  resolvePromptEditorMentionReferences,
} from "../src/features/production-workbench/index.js";
import {
  collectPromptEditorMentions,
  createPromptEditorDocument,
  serializePromptEditorDocument,
} from "../src/features/production-workbench/prompt-editor-document.js";
import { addStoryboard } from "../src/features/production-workbench/storyboard-state.js";
import { renderPromptDock } from "../src/features/production-workbench/episode-workbench-rebuilt.js";

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

it("binds asset-lock declarations to real images and warns about the reported characters without images", () => {
  const assassin = { ...character, name: "黑衣杀手甲" };
  const missing = { ...character, id: "assassin-b", name: "黑衣杀手乙", previewUrl: "" };
  const missingC = { ...missing, id: "assassin-c", name: "黑衣杀手丙" };
  const source = "<Asset_Setup>\n出场资产锁:\n【@黑衣杀手甲】: 黑衣蒙面\n【@黑衣杀手乙】: 手持利刃\n【@黑衣杀手丙】: 沉默无台词\n光影基调池:\n主光方向: 左侧\n</Asset_Setup>\n黑衣杀手甲上前，黑衣杀手乙退后。";
  const { workbench, storyboard, run } = fixture(source, [assassin, missing, missingC]);
  const result = run();
  assert.match(result.warning, /黑衣杀手乙/u);
  assert.match(result.warning, /黑衣杀手丙/u);
  assert.match(result.warning, /手动.*@/u);
  assert.match(workbench.ui.prompt, /【@图1】: 黑衣蒙面/u);
  assert.match(workbench.ui.prompt, /黑衣杀手乙: 手持利刃/u);
  assert.match(workbench.ui.prompt, /【@图1】上前，黑衣杀手乙退后。/u);
  assert.equal(storyboard.description, source);
  assert.deepEqual(buildVideoGenerationPayload(workbench).parameters.filePaths, ["/uploads/su.png"]);
});

it("converts an unmarked asset-lock name only with an exact image match and preserves an uncertain table", () => {
  const { workbench, run } = fixture("所需资产：\n苏晚：站在门口\n一张桌子：放在屋内\n光影基调池：\n主光方向：左侧\n苏晚走向一张桌子。", [character, { ...prop, name: "木桌" }]);
  const result = run();
  assert.match(workbench.ui.prompt, /【@图1】：站在门口/u);
  assert.match(workbench.ui.prompt, /【@图1】走向一张桌子。/u);
  assert.match(result.warning, /一张桌子/u);
  assert.match(result.warning, /手动.*@/u);
  assert.doesNotMatch(result.warning, /主光方向/u);
});

it("keeps ambiguous explicit mentions readable instead of automatically attaching the first same-name image", () => {
  const other = { ...prop, id: "other-table", name: "桌子", previewUrl: "/uploads/other-table.png" };
  const { workbench, run } = fixture("出场资产锁:\n【@桌子】: 靠墙\n光影基调池:\n主光方向: 左侧", [{ ...prop, name: "桌子" }, other], []);
  const result = run();
  assert.equal(result.references.length, 0);
  assert.doesNotMatch(workbench.ui.prompt, /【@图/u);
  assert.match(workbench.ui.prompt, /桌子: 靠墙/u);
  assert.match(result.warning, /桌子/u);
});

it("uses the selected same-name asset when it uniquely resolves an explicit mention", () => {
  const first = { ...prop, name: "桌子" };
  const selected = { ...prop, id: "selected-table", name: "桌子", previewUrl: "/uploads/selected-table.png" };
  const { workbench, run } = fixture("出场资产锁:\n【@桌子】: 靠墙\n光影基调池:", [first, selected], [selected]);
  const result = run();
  assert.equal(result.warning, "");
  assert.deepEqual(buildVideoGenerationPayload(workbench).parameters.filePaths, ["/uploads/selected-table.png"]);
});

it("does not turn a same-name mention into an arbitrary image when both images are attached", () => {
  const first = { ...prop, name: "桌子" };
  const second = { ...prop, id: "second-table", name: "桌子", previewUrl: "/uploads/second-table.png" };
  const { workbench, run } = fixture("出场资产锁:\n【@桌子】: 靠墙\n光影基调池:\n桌子在角落。", [first, second]);
  const result = run();
  assert.doesNotMatch(workbench.ui.prompt, /【@图/u);
  assert.match(result.warning, /歧义/u);
  assert.deepEqual(buildVideoGenerationPayload(workbench).parameters.filePaths, ["/uploads/book.png", "/uploads/second-table.png"]);
});

it("warns for an unresolved standalone mention while preserving a literal media reference", () => {
  const { workbench, run } = fixture("参考【@图1】，@一张桌子：靠墙。", [character]);
  const result = run();
  assert.equal(workbench.ui.prompt, "参考【@图1】，一张桌子：靠墙。");
  assert.match(result.warning, /一张桌子/u);
  assert.doesNotMatch(result.warning, /图1/u);
});

it("does not report a missing image for a successfully imported named audio reference", () => {
  const audio = { id: "narration", name: "旁白", role: "audio", kind: "audio", type: "audio", previewUrl: "/uploads/narration.mp3", generationReferenceAliases: ["旁白"] };
  const { workbench, run } = fixture("【@旁白】", [], [audio]);
  const result = run();
  assert.equal(workbench.ui.prompt, "【@音频1】");
  assert.equal(result.warning, "");
});

it("resolves numbered mention previews and submission by current position, never a historical image alias", () => {
  const { workbench, storyboard } = fixture("", [scene, character, prop]);
  storyboard.generationState.quickReferenceItems = [
    { ...scene, kind: "image", url: scene.previewUrl, originalName: "图3" },
    { ...character, kind: "image", url: character.previewUrl, generationReferenceAliases: ["图1"] },
    { ...prop, kind: "image", url: prop.previewUrl },
  ];
  workbench.ui.prompt = "【@图1】、【@图2】、【@图3】";
  const mentions = resolvePromptEditorMentionReferences(workbench, workbench.ui.prompt);
  assert.deepEqual(mentions.map(item => item.preview), [scene.previewUrl, character.previewUrl, prop.previewUrl]);
  const payload = buildVideoGenerationPayload(workbench);
  assert.equal(payload.prompt, workbench.ui.prompt);
  assert.deepEqual(payload.parameters.filePaths, [scene.previewUrl, character.previewUrl, prop.previewUrl]);
});

it("does not keep a stale thumbnail copy as an extra invisible numbered image after import", () => {
  const thumbnail = { ...character, previewUrl: "/api/storage/objects/person/content?thumbnail=1" };
  const full = { ...character, previewUrl: "https://lingxiyunai.com/api/storage/objects/person/content?proxy=1" };
  const { workbench, storyboard, run } = fixture("出场资产锁:\n【@苏晚】:站立\n【@旧书】:手持", [full, prop], [thumbnail, prop]);
  const result = run();
  const payload = buildVideoGenerationPayload(workbench);
  assert.equal(result.references.length, 2);
  assert.equal(payload.parameters.filePaths.length, 2);
  assert.match(workbench.ui.prompt, /【@图1】:站立\n【@图2】:手持/u);
  const mentions = resolvePromptEditorMentionReferences(workbench, workbench.ui.prompt);
  assert.equal(mentions[1].preview, prop.previewUrl);
  const dock = renderPromptDock({ selectedStoryboard: workbench.ui.episodeStoryboardMap["episode-1"][0], prompt: workbench.ui.prompt, generationUiState: {}, generationControls: { uploadLimits: {} }, mediaMode: "video", videoMode: "reference-video" });
  assert.equal((dock.match(/class="episode-replica-ref-card /gu) ?? []).length, 2);
});

it("shows distinct pictures of the same asset instead of hiding one and shifting later image numbers", () => {
  const { workbench, run } = fixture("", [character, prop]);
  workbench.ui.episodeStoryboardMap["episode-1"][0].description = "【@旧书】";
  workbench.ui.episodeStoryboardMap["episode-1"][0].references = [character, { ...character, previewUrl: "/uploads/su-v2.png" }, prop];
  run();
  const payload = buildVideoGenerationPayload(workbench);
  assert.deepEqual(payload.parameters.filePaths, [character.previewUrl, "/uploads/su-v2.png", prop.previewUrl]);
  const dock = renderPromptDock({ selectedStoryboard: workbench.ui.episodeStoryboardMap["episode-1"][0], prompt: workbench.ui.prompt, generationUiState: {}, generationControls: { uploadLimits: {} }, mediaMode: "video", videoMode: "reference-video" });
  assert.equal((dock.match(/class="episode-replica-ref-card /gu) ?? []).length, 3);
  assert.equal(workbench.ui.prompt, "【@图3】");
});

it("does not number the newly imported shot against attachments left in the previous composer", () => {
  const { workbench, run } = fixture("【@苏晚】拿着【@旧书】", [character, prop]);
  workbench.ui.episodeWorkbenchAttachments = [{ id: "previous", kind: "image", name: "旧书", url: "/uploads/previous.png" }];
  const result = run();
  assert.equal(result.references.length, 2);
  assert.equal(workbench.ui.prompt, "【@图1】拿着【@图2】");
  assert.deepEqual(buildVideoGenerationPayload(workbench).parameters.filePaths, [character.previewUrl, prop.previewUrl]);
});

it("keeps image, video and audio numbers in their own file orders despite cross-media aliases", () => {
  const { workbench, storyboard } = fixture("");
  storyboard.generationState.quickReferenceItems = [
    { id: "image", kind: "image", url: "/uploads/image.png", originalName: "音频1", generationReferenceAliases: ["视频1"] },
    { id: "video", kind: "video", url: "/uploads/video.mp4", originalName: "图1" },
    { id: "audio", kind: "audio", url: "/uploads/audio.mp3", originalName: "视频1" },
  ];
  workbench.ui.prompt = "【@图1】【@视频1】【@音频1】";
  assert.deepEqual(resolvePromptEditorMentionReferences(workbench, workbench.ui.prompt).map(item => [item.kind, item.assetId]), [["image", "image"], ["video", "video"], ["audio", "audio"]]);
  assert.equal(buildVideoGenerationPayload(workbench).prompt, workbench.ui.prompt);
});

it("resolves asset-scope image numbers from the composer even when a library image has the same name", () => {
  const workbench = { ui: {
    museScopeMode: "assets", assetPromptDraft: { quickReferenceItems: [{ id: "current", kind: "image", url: "/uploads/current.png", name: "当前图" }] },
    importedAssets: { other: { image: [{ id: "old", name: "图1", previewUrl: "/uploads/old.png" }] } },
  } };
  assert.equal(resolvePromptEditorMentionReferences(workbench, "【@图1】")[0].preview, "/uploads/current.png");
});

it("does not use a stale saved preview for a numbered image that is no longer attached", () => {
  const { workbench, storyboard } = fixture("");
  storyboard.generationState.quickReferenceItems = [{ id: "image", kind: "image", url: "/uploads/current.png", originalName: "图6" }];
  const mentions = resolvePromptEditorMentionReferences(workbench, "【@图6】", [{ name: "图6", kind: "image", preview: "/uploads/stale.png" }]);
  assert.equal(mentions[0].preview || "", "");
});

it("removes only the selected file and renumbers remaining mentions even with shared names or old image numbers", async () => {
  for (const originalName of ["苏晚", "图片8", "", "another attachment"]) {
    const { workbench, storyboard } = fixture("");
    Object.assign(workbench, {
      state: { project: { id: "project-1", name: "try", phase: "asset_review", aspectRatio: "16:9", resolution: "2K" }, shots: [], exportPreview: null },
      session: { user: { phone: "+86 13800138000" } },
      root: { innerHTML: "", querySelector: () => null, querySelectorAll: () => [] },
    });
    Object.assign(workbench.ui, { activeNavTab: "project", selectedModelId: "vidu-q3-pro", episodeWorkbenchAttachments: [], episodeWorkbenchSelectedAttachmentIds: [] });
    workbench.ui.prompt = "甲=【@图1】，乙=【@图2】";
    Object.assign(storyboard.generationState, {
      prompt: workbench.ui.prompt, videoPrompt: workbench.ui.prompt,
      quickReferenceItems: [
        { id: "a", assetId: "shared", kind: "image", name: "图1", originalName, url: "/uploads/a.png" },
        { id: "b", assetId: "shared", kind: "image", name: "图2", originalName, url: "/uploads/b.png" },
      ],
    });
    if (originalName === "another attachment") {
      workbench.ui.episodeWorkbenchAttachments = [storyboard.generationState.quickReferenceItems.pop()];
    }
    await handleWorkbenchActionForTest(workbench, { dataset: { action: "remove-quick-reference", referenceId: "a" } });
    assert.equal(workbench.ui.prompt, "甲=，乙=【@图1】", originalName);
    assert.deepEqual(buildVideoGenerationPayload(workbench).parameters.filePaths, ["/uploads/b.png"]);
    assert.equal(resolvePromptEditorMentionReferences(workbench, workbench.ui.prompt)[0].preview, "/uploads/b.png");
  }
});
