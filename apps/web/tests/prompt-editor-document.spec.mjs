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
import {
  EPISODE_PROMPT_PLACEHOLDER,
  buildEpisodePromptPlaceholderFrames,
  installEpisodePromptPlaceholderAnimation,
} from "../src/features/production-workbench/episode-prompt-placeholder.js";

function createAnimatedPlaceholderHarness() {
  let empty = true;
  let nextTimeoutId = 1;
  const scheduled = new Map();
  const mediaQueries = new Map();
  const observers = [];
  const documentListeners = new Map();
  const hostListeners = new Map();

  const createClassList = () => {
    const values = new Set();
    return {
      add: (...names) => names.forEach((name) => values.add(name)),
      contains: (name) => values.has(name),
      remove: (...names) => names.forEach((name) => values.delete(name)),
      toggle(name, enabled) {
        if (enabled) {
          values.add(name);
        } else {
          values.delete(name);
        }
      },
    };
  };
  const createElement = () => ({
    attributes: new Map(),
    children: [],
    classList: createClassList(),
    removed: false,
    append(child) {
      this.children.push(child);
    },
    remove() {
      this.removed = true;
    },
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
    textContent: "",
  });
  const mediaQuery = (query) => {
    if (!mediaQueries.has(query)) {
      const listeners = new Set();
      mediaQueries.set(query, {
        listeners,
        matches: false,
        addEventListener(_event, listener) {
          listeners.add(listener);
        },
        removeEventListener(_event, listener) {
          listeners.delete(listener);
        },
        emit() {
          listeners.forEach((listener) => listener());
        },
      });
    }
    return mediaQueries.get(query);
  };
  const view = {
    clearTimeout(timeoutId) {
      scheduled.delete(timeoutId);
    },
    matchMedia: mediaQuery,
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.disconnected = false;
        this.observedOptions = null;
        this.observedTarget = null;
        observers.push(this);
      }
      disconnect() {
        this.disconnected = true;
      }
      observe(target, options) {
        this.observedTarget = target;
        this.observedOptions = options;
      }
    },
    setTimeout(callback, delay) {
      const timeoutId = nextTimeoutId;
      nextTimeoutId += 1;
      scheduled.set(timeoutId, { callback, delay });
      return timeoutId;
    },
  };
  const ownerDocument = {
    createElement,
    defaultView: view,
    visibilityState: "visible",
    addEventListener(event, listener) {
      documentListeners.set(event, listener);
    },
    removeEventListener(event, listener) {
      if (documentListeners.get(event) === listener) {
        documentListeners.delete(event);
      }
    },
  };
  const editorContent = {
    attributes: new Map(),
    querySelector: () => (empty ? {} : null),
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
  };
  const editorHost = {
    children: [],
    ownerDocument,
    append(child) {
      this.children.push(child);
    },
    addEventListener(event, listener) {
      hostListeners.set(event, listener);
    },
    querySelector: () => editorContent,
    removeEventListener(event, listener) {
      if (hostListeners.get(event) === listener) {
        hostListeners.delete(event);
      }
    },
  };

  return {
    editorHost,
    editorContent,
    mediaQuery,
    observer: () => observers[0],
    pending: () => [...scheduled.values()],
    runNext() {
      const [timeoutId, timeout] = scheduled.entries().next().value ?? [];
      assert.ok(timeout, "expected an animation timer");
      scheduled.delete(timeoutId);
      timeout.callback();
      return timeout.delay;
    },
    setEmpty(value) {
      empty = value;
      assert.equal(observers[0].observedTarget, editorContent);
      observers[0].callback();
    },
    setVisible(value) {
      ownerDocument.visibilityState = value ? "visible" : "hidden";
      documentListeners.get("visibilitychange")?.();
    },
    focusEditor() {
      hostListeners.get("focusin")?.();
    },
    hostListeners,
    visibilityListeners: documentListeners,
  };
}

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

test("prompt editor resolves uploaded image thumbnails from url fields", () => {
  assert.equal(
    resolvePromptEditorMentionPreview({ kind: "image", url: "/uploads/image-2.png" }),
    "/uploads/image-2.png",
  );
  assert.equal(
    resolvePromptEditorMentionPreview({ kind: "image", publicUrl: "/uploads/image-3.png" }),
    "/uploads/image-3.png",
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
  assert.equal(video.source, "/uploads/video-1.mp4");
  assert.equal(resolvePromptEditorMentionPreview({ kind: "video", preview: "data:video/mp4;base64,AAAA" }), "");
  assert.equal(resolvePromptEditorMentionPreview({ kind: "audio", preview: "data:image/png;base64,AAAA" }), "data:image/png;base64,AAAA");
});

test("prompt editor preserves a video source for inline video thumbnails", () => {
  const document = createPromptEditorDocument("参考【@视频1】", [{
    id: "mention-ref:video:video-1",
    assetId: "video-1",
    kind: "video",
    name: "视频1",
    source: "/uploads/video-1.mp4",
  }]);
  const [mention] = collectPromptEditorMentions(document);

  assert.equal(mention.preview, "");
  assert.equal(mention.source, "/uploads/video-1.mp4");
  assert.equal(serializePromptEditorDocument(document), "参考【@视频1】");
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
  assert.match(html, /<textarea id="video-prompt-input" placeholder="先上传参考图，输入你的想法，再用@引用素材">镜头推进【@图1】<\/textarea>/);
  assert.match(html, /data-prompt-character-count>9 \/ 5000/);
  assert.doesNotMatch(html, /episode-replica-mention-strip/);
});

test("prompt dock types the full empty-editor guidance one character at a time in a loop", () => {
  const html = renderPromptDock({
    busy: false,
    generationControls: {},
    generationUiState: {},
    mediaMode: "image",
    prompt: "",
  });

  assert.match(html, /class="episode-prompt-editor-host" data-prompt-editor data-animated-placeholder/);
  assert.match(html, /placeholder="先上传参考图，输入你的想法，再用@引用素材"/);

  const frames = buildEpisodePromptPlaceholderFrames();
  assert.equal(frames.length, [...EPISODE_PROMPT_PLACEHOLDER].length);
  assert.equal(frames[0], "先");
  assert.equal(frames[1], "先上");
  assert.equal(frames.at(-1), EPISODE_PROMPT_PLACEHOLDER);
  frames.forEach((frame, index) => {
    assert.equal([...frame].length, index + 1);
  });

  const harness = createAnimatedPlaceholderHarness();
  const stop = installEpisodePromptPlaceholderAnimation(
    harness.editorHost,
    EPISODE_PROMPT_PLACEHOLDER,
  );
  const placeholder = harness.editorHost.children[0];
  const visibleCharacters = () => placeholder.children.filter(
    (character) => character.classList.contains("is-visible"),
  );

  assert.equal(placeholder.classList.contains("is-active"), true);
  assert.equal(harness.editorContent.attributes.get("aria-placeholder"), EPISODE_PROMPT_PLACEHOLDER);
  assert.equal(harness.observer().observedTarget, harness.editorContent);
  assert.deepEqual(harness.observer().observedOptions, {
    attributeFilter: ["class"],
    attributes: true,
    childList: true,
    subtree: true,
  });
  assert.equal(harness.pending()[0].delay, 450);
  assert.equal(harness.runNext(), 450);
  assert.equal(visibleCharacters().map((character) => character.textContent).join(""), "先");
  assert.equal(harness.pending()[0].delay, 300);
  for (let index = 1; index < frames.length; index += 1) {
    harness.runNext();
  }
  assert.equal(visibleCharacters().map((character) => character.textContent).join(""), EPISODE_PROMPT_PLACEHOLDER);
  assert.equal(harness.pending()[0].delay, 1600);
  assert.equal(harness.runNext(), 1600);
  assert.equal(visibleCharacters().length, 0);
  assert.equal(harness.pending()[0].delay, 650);
  assert.equal(harness.runNext(), 650);
  assert.equal(visibleCharacters()[0].textContent, "先");

  harness.setEmpty(false);
  assert.equal(placeholder.classList.contains("is-active"), false);
  assert.equal(visibleCharacters().length, 0);
  assert.equal(harness.pending().length, 0);
  harness.setEmpty(true);
  assert.equal(placeholder.classList.contains("is-active"), true);
  assert.equal(harness.pending()[0].delay, 450);

  const reducedMotion = harness.mediaQuery("(prefers-reduced-motion: reduce)");
  reducedMotion.matches = true;
  reducedMotion.emit();
  assert.equal(visibleCharacters().length, frames.length);
  assert.equal(harness.pending().length, 0);
  reducedMotion.matches = false;
  reducedMotion.emit();
  assert.equal(visibleCharacters().length, 0);
  assert.equal(harness.pending()[0].delay, 450);

  harness.setVisible(false);
  assert.equal(harness.pending().length, 0);
  assert.equal(visibleCharacters().length, 0);
  harness.setVisible(true);
  assert.equal(harness.pending()[0].delay, 450);

  harness.focusEditor();
  assert.equal(visibleCharacters().length, frames.length);
  assert.equal(harness.pending().length, 0);

  stop();
  stop();
  assert.equal(placeholder.removed, true);
  assert.equal(harness.observer().disconnected, true);
  assert.equal(reducedMotion.listeners.size, 0);
  assert.equal(harness.hostListeners.size, 0);
  assert.equal(harness.visibilityListeners.size, 0);
  assert.equal(harness.pending().length, 0);

  let removedFallbackAttribute = "";
  const stopFallback = installEpisodePromptPlaceholderAnimation({
    ownerDocument: { defaultView: {} },
    querySelector: () => ({}),
    removeAttribute(name) {
      removedFallbackAttribute = name;
    },
  }, EPISODE_PROMPT_PLACEHOLDER);
  stopFallback();
  assert.equal(removedFallbackAttribute, "data-animated-placeholder");

  const stylesheet = readFileSync(
    new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
    "utf8",
  );
  assert.match(stylesheet, /episode-prompt-animated-placeholder > span \{[\s\S]*?opacity:\s*0;[\s\S]*?transition:\s*opacity 240ms ease/);
  assert.match(stylesheet, /episode-prompt-animated-placeholder > span\.is-visible \{[\s\S]*?opacity:\s*1/);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?episode-prompt-animated-placeholder > span[\s\S]*?transition:\s*none/);
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
  assert.match(source, /const getAvailableSuggestions = async \(\) =>/);
  assert.match(source, /await options\.getSuggestions\(\)/);
  assert.match(source, /async getSuggestions\(query\)/);
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
  assert.match(source, /promptEditorSelectionTextOffset\(editor, editor\.state\.selection\.from\)/);
  assert.match(source, /textBetween\(0, safePosition, "\\n"/);
  assert.match(source, /nextProps\.mount\(menu, \{\s*onPosition/s);
  assert.match(source, /onMentionsChange\?\.\(collectPromptEditorMentions\(currentEditor\.getJSON\(\)\), \{ initial: true \}\)/);
  assert.match(source, /onMentionsChange\?\.\(collectPromptEditorMentions\(currentEditor\.getJSON\(\)\), \{ initial: false \}\)/);
  assert.match(workbenchSource, /getSuggestions:\s*\(\)\s*=>\s*buildPromptEditorSuggestions\(workbench\)/);
  assert.match(workbenchSource, /const suggestionAssets = collectPromptMentionSuggestionAssets\(workbench\)\.filter/);
  assert.match(workbenchSource, /!isAssetScope\(workbench\) \|\| \(\s*String\(item\.assetKind/s);
});
