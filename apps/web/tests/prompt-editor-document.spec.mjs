import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  collectPromptEditorMentions,
  createPromptEditorDocument,
  normalizePromptEditorSuggestion,
  promptEditorMentionSignature,
  resolvePromptEditorMentionPreview,
  serializePromptEditorDocument,
} from "../src/features/production-workbench/prompt-editor-document.js";
import { renderPromptDock } from "../src/features/production-workbench/episode-workbench-rebuilt.js";

test("prompt editor preserves legacy mention tokens through the structured document", () => {
  const prompt = "镜头缓慢推进【@图1】，角色转身。\n保持暖色逆光。";
  const references = [{
    id: "mention-ref:image:image-1",
    assetId: "image-1",
    kind: "image",
    name: "图1",
    preview: "/uploads/image-1.png",
    token: "【@图1】",
  }];

  const document = createPromptEditorDocument(prompt, references);
  const mentions = collectPromptEditorMentions(document);

  assert.equal(serializePromptEditorDocument(document), prompt);
  assert.deepEqual(mentions, [{
    id: "image-1",
    assetId: "image-1",
    assetKind: "image",
    description: "",
    label: "图1",
    name: "图1",
    preview: "/uploads/image-1.png",
    referenceId: "mention-ref:image:image-1",
  }]);
});

test("prompt editor upgrades unmatched legacy tokens without dropping surrounding text", () => {
  const prompt = "【@任小野】走入画面，随后【@旧场景】亮灯。";
  const document = createPromptEditorDocument(prompt, []);

  assert.equal(serializePromptEditorDocument(document), prompt);
  assert.deepEqual(
    collectPromptEditorMentions(document).map((item) => item.label),
    ["任小野", "旧场景"],
  );
});

test("prompt editor normalizes suggestion metadata for inline nodes", () => {
  const suggestion = normalizePromptEditorSuggestion({
    id: "character-1",
    kind: "character",
    name: "任小野",
    previewUrl: "/uploads/character-1.png",
  });

  assert.equal(suggestion.assetId, "character-1");
  assert.equal(suggestion.assetKind, "character");
  assert.equal(suggestion.label, "任小野");
  assert.equal(suggestion.preview, "/uploads/character-1.png");
  assert.equal(suggestion.referenceId, "mention-ref:character:character-1");
  assert.equal(
    promptEditorMentionSignature([suggestion]),
    "mention-ref:character:character-1:character-1:character:任小野",
  );
});

test("prompt editor never treats audio or video sources as image thumbnails", () => {
  const audio = normalizePromptEditorSuggestion({
    id: "audio-1",
    kind: "audio",
    name: "音频1",
    previewUrl: "/uploads/audio-1.mp3",
  });
  const video = normalizePromptEditorSuggestion({
    id: "video-1",
    kind: "video",
    name: "视频1",
    previewUrl: "/uploads/video-1.mp4",
    thumbnailUrl: "/uploads/video-1-poster.jpg",
  });

  assert.equal(audio.preview, "");
  assert.equal(video.preview, "/uploads/video-1-poster.jpg");
  assert.equal(resolvePromptEditorMentionPreview({ kind: "video", preview: "data:video/mp4;base64,AAAA" }), "");
  assert.equal(resolvePromptEditorMentionPreview({ kind: "audio", preview: "data:image/png;base64,AAAA" }), "data:image/png;base64,AAAA");
});

test("prompt dock uses media placeholders instead of broken image thumbnails", () => {
  const html = renderPromptDock({
    selectedStoryboard: {
      generationState: {
        quickReferenceItems: [
          { id: "audio-1", kind: "audio", name: "音频1", preview: "/uploads/audio-1.mp3" },
          { id: "video-1", kind: "video", name: "视频1", preview: "/uploads/video-1.mp4" },
        ],
      },
    },
    selectedModelId: "vidu-q3-pro",
    prompt: "@",
    busy: false,
    generationControls: {},
    generationUiState: {
      promptMentionMenuOpen: true,
      promptMentionSuggestions: [
        { id: "audio-1", assetKind: "audio", name: "音频1", previewUrl: "/uploads/audio-1.mp3" },
        { id: "video-1", assetKind: "video", name: "视频1", previewUrl: "/uploads/video-1.mp4" },
      ],
    },
    mediaMode: "video",
    videoMode: "reference-video",
    attachments: [],
    selectedAttachmentIds: [],
    scopeMode: "storyboard",
  });
  const menu = html.match(/<div class="episode-replica-mention-menu">([\s\S]*?)<\/div>/)?.[1] ?? "";
  const strip = html.match(/<div class="episode-replica-ref-strip inline-upload-tray[^>]*>([\s\S]*?)<input class="episode-workbench-attachment-input"/)?.[1] ?? "";

  assert.doesNotMatch(menu, /<img[^>]+(?:audio-1\.mp3|video-1\.mp4)/);
  assert.match(menu, /episode-replica-quick-art-audio[\s\S]*?♫/);
  assert.match(menu, /episode-replica-quick-art-video[\s\S]*?▶/);
  assert.doesNotMatch(strip, /<img[^>]+audio-1\.mp3/);
  assert.match(strip, /episode-replica-quick-art-audio[\s\S]*?♫/);
  assert.match(strip, /<video src="\/uploads\/video-1\.mp4"/);
});

test("prompt dock renders the structured editor host with a textarea fallback", () => {
  const html = renderPromptDock({
    busy: false,
    generationControls: {},
    generationUiState: {},
    mediaMode: "video",
    prompt: "镜头推进【@图1】",
    selectedStoryboard: {
      generationState: {
        mentionReferences: [{ id: "mention-ref:image:image-1", name: "图1" }],
      },
    },
  });

  assert.match(html, /class="episode-prompt-editor-host" data-prompt-editor/);
  assert.match(html, /<textarea id="video-prompt-input" placeholder="请输入您的生图要求">镜头推进【@图1】<\/textarea>/);
  assert.match(html, /data-prompt-character-count>9 \/ 5000/);
  assert.doesNotMatch(html, /episode-replica-mention-strip/);
});

test("prompt editor opens mentions at any cursor position and portals the menu outside page zoom", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/prompt-editor.js", import.meta.url),
    "utf8",
  );
  const workbenchSource = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /allowedPrefixes:\s*null/);
  assert.match(source, /typeof options\.getSuggestions === "function"/);
  assert.match(source, /menuContainer:\s*element\.ownerDocument\.documentElement/);
  assert.match(source, /container:\s*menuContainer/);
  assert.match(source, /strategy:\s*"fixed"/);
  assert.match(source, /const selectedItem = onSelect\(item\) \?\? item/);
  assert.match(source, /props\.command\(\{ \.\.\.item, \.\.\.selectedItem \}\)/);
  assert.match(source, /replacePromptLine\(prefix, nextLine, mentionReferences = \[\]\)/);
  assert.match(source, /editor\.state\.tr\.replaceWith\(/);
  assert.match(source, /transaction\.setMeta\("promptEditorSkipMentionChange", true\)/);
  assert.match(source, /if \(!transaction\.getMeta\("promptEditorSkipMentionChange"\)\)/);
  assert.match(source, /editor\.view\.dispatch\(transaction\)/);
  assert.match(source, /nextProps\.mount\(menu, \{\s*onPosition/s);
  assert.match(source, /onMentionsChange\?\.\(collectPromptEditorMentions\(currentEditor\.getJSON\(\)\), \{ initial: true \}\)/);
  assert.match(source, /onMentionsChange\?\.\(collectPromptEditorMentions\(currentEditor\.getJSON\(\)\), \{ initial: false \}\)/);
  assert.match(workbenchSource, /getSuggestions:\s*\(\)\s*=>\s*buildPromptEditorSuggestions\(workbench\)/);
});
