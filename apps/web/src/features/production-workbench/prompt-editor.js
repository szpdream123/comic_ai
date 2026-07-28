import { Editor, mergeAttributes } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Mention from "@tiptap/extension-mention";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Placeholder } from "@tiptap/extensions/placeholder";
import { UndoRedo } from "@tiptap/extensions/undo-redo";
import {
  collectPromptEditorMentions,
  createPromptEditorDocument,
  normalizePromptEditorSuggestion,
  promptEditorMentionSignature,
  serializePromptEditorDocument,
} from "./prompt-editor-document.js";

export function mountPromptEditor(element, options = {}) {
  if (!element?.ownerDocument) {
    throw new Error("prompt_editor_mount_missing");
  }

  const getAvailableSuggestions = () => {
    const availableSuggestions = typeof options.getSuggestions === "function"
      ? options.getSuggestions()
      : options.suggestions;
    return (Array.isArray(availableSuggestions) ? availableSuggestions : [])
      .map((item) => normalizePromptEditorSuggestion(item));
  };
  let currentMentionSignature = "";
  let destroyed = false;
  const AssetMention = createAssetMentionExtension({
    getSuggestions(query) {
      const normalizedQuery = String(query ?? "").trim().toLowerCase();
      return getAvailableSuggestions().filter((item) => {
        if (!normalizedQuery) {
          return true;
        }
        return [item.label, item.name, item.description]
          .map((value) => String(value ?? "").toLowerCase())
          .some((value) => value.includes(normalizedQuery));
      }).slice(0, 12);
    },
    onSelect(item) {
      return options.onMentionSelect?.(item);
    },
    menuContainer: element.ownerDocument.documentElement,
  });

  const editor = new Editor({
    element,
    content: createPromptEditorDocument(options.prompt, options.mentionReferences),
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      UndoRedo,
      Placeholder.configure({
        placeholder: String(options.placeholder ?? ""),
      }),
      AssetMention,
    ],
    editorProps: {
      attributes: {
        "aria-label": String(options.ariaLabel ?? "\u751f\u6210\u63d0\u793a\u8bcd"),
        class: "episode-prompt-editor-content",
        "data-tiptap-prompt-editor": "true",
        id: String(options.id ?? "video-prompt-input"),
        placeholder: String(options.placeholder ?? ""),
        role: "textbox",
        spellcheck: "false",
      },
    },
    onCreate({ editor: currentEditor }) {
      installTextareaCompatibility(currentEditor);
      currentMentionSignature = emitEditorState(currentEditor, options, true);
      options.onMentionsChange?.(collectPromptEditorMentions(currentEditor.getJSON()), { initial: true });
      restoreEditorState(currentEditor, element, options.restoreState);
    },
    onUpdate({ editor: currentEditor, transaction }) {
      installTextareaCompatibility(currentEditor);
      const nextSignature = emitEditorState(currentEditor, options, false);
      if (nextSignature !== currentMentionSignature) {
        currentMentionSignature = nextSignature;
        if (!transaction.getMeta("promptEditorSkipMentionChange")) {
          options.onMentionsChange?.(collectPromptEditorMentions(currentEditor.getJSON()), { initial: false });
        }
      }
    },
  });
  installTextareaCompatibility(editor);
  element.querySelector?.(`textarea#${String(options.id ?? "video-prompt-input")}`)?.remove();

  const handle = {
    captureState() {
      return {
        kind: "tiptap",
        selectionStart: editor.state.selection.from,
        selectionEnd: editor.state.selection.to,
        scrollTop: Number(element.scrollTop ?? 0),
        shouldFocus: editor.isFocused,
      };
    },
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      if (element.__promptEditorHandle === handle) {
        delete element.__promptEditorHandle;
      }
      editor.destroy();
    },
    focus(position = "end") {
      editor.commands.focus(position);
    },
    replacePromptLine(prefix, nextLine, mentionReferences = []) {
      const normalizedPrefix = String(prefix ?? "");
      const replacementDocument = createPromptEditorDocument(nextLine, mentionReferences);
      const replacementNode = editor.schema.nodeFromJSON(replacementDocument.content[0]);
      let paragraphPosition = null;
      let paragraphSize = 0;
      editor.state.doc.descendants((node, position) => {
        if (
          paragraphPosition === null &&
          node.type.name === "paragraph" &&
          node.textContent.trimStart().startsWith(normalizedPrefix)
        ) {
          paragraphPosition = position;
          paragraphSize = node.nodeSize;
          return false;
        }
        return paragraphPosition === null;
      });
      const transaction = paragraphPosition === null
        ? editor.state.tr.insert(editor.state.doc.content.size, replacementNode)
        : editor.state.tr.replaceWith(
            paragraphPosition,
            paragraphPosition + paragraphSize,
            replacementNode,
          );
      transaction.setMeta("promptEditorSkipMentionChange", true);
      editor.view.dispatch(transaction);
      installTextareaCompatibility(editor);
    },
    setPrompt(prompt, mentionReferences = [], state = null) {
      editor.commands.setContent(
        createPromptEditorDocument(prompt, mentionReferences),
        { emitUpdate: false },
      );
      installTextareaCompatibility(editor);
      currentMentionSignature = emitEditorState(editor, options, true);
      restoreEditorState(editor, element, state);
    },
  };
  element.__promptEditorHandle = handle;
  return handle;
}

function createAssetMentionExtension({ getSuggestions, onSelect, menuContainer }) {
  return Mention.extend({
    name: "assetMention",
    addAttributes() {
      return {
        ...this.parent?.(),
        assetId: attribute("data-asset-id", "assetId"),
        assetKind: attribute("data-asset-kind", "assetKind", "character"),
        description: attribute("data-description", "description"),
        preview: attribute("data-preview", "preview"),
        referenceId: attribute("data-reference-id", "referenceId"),
      };
    },
  }).configure({
    HTMLAttributes: {
      class: "episode-prompt-editor-mention",
    },
    renderText({ node }) {
      return `\u3010@${node.attrs.label ?? node.attrs.id ?? "\u7d20\u6750"}\u3011`;
    },
    renderHTML({ options, node }) {
      const label = String(node.attrs.label ?? node.attrs.id ?? "\u7d20\u6750");
      const preview = String(node.attrs.preview ?? "").trim();
      const kind = String(node.attrs.assetKind ?? "character");
      const thumb = preview
        ? ["img", { alt: "", draggable: "false", src: preview }]
        : ["span", { "aria-hidden": "true", class: "episode-prompt-editor-mention-fallback" }, mentionFallbackGlyph(kind, label)];
      return [
        "span",
        mergeAttributes(options.HTMLAttributes, {
          "aria-label": `\u5f15\u7528${assetKindLabel(kind)}${label}`,
          "data-type": "assetMention",
          title: `${assetKindLabel(kind)}\uff1a${label}`,
        }),
        thumb,
        ["span", { class: "episode-prompt-editor-mention-label" }, label],
      ];
    },
    suggestion: {
      allowedPrefixes: null,
      char: "@",
      container: menuContainer,
      floatingUi: {
        strategy: "fixed",
      },
      items: ({ query }) => getSuggestions(query),
      render: () => createMentionMenuRenderer(onSelect),
    },
  });
}

function createMentionMenuRenderer(onSelect) {
  let menu = null;
  let unmount = null;
  let props = null;
  let selectedIndex = 0;

  const selectItem = (index) => {
    const item = props?.items?.[index];
    if (!item) {
      return false;
    }
    const selectedItem = onSelect(item) ?? item;
    props.command({ ...item, ...selectedItem });
    return true;
  };

  const renderItems = () => {
    if (!menu || !props) {
      return;
    }
    const items = Array.isArray(props.items) ? props.items : [];
    selectedIndex = Math.max(0, Math.min(selectedIndex, Math.max(0, items.length - 1)));
    menu.replaceChildren(...items.map((item, index) => createMentionOption(menu.ownerDocument, item, {
      active: index === selectedIndex,
      index,
      onSelect: selectItem,
    })));
    menu.hidden = items.length === 0;
  };

  const positionMenuFromClientRect = (clientRect) => {
    if (!menu || !clientRect) {
      return;
    }
    const view = menu.ownerDocument?.defaultView ?? globalThis.window;
    const viewportWidth = Number(view?.innerWidth ?? 0);
    const viewportHeight = Number(view?.innerHeight ?? 0);
    const menuWidth = Number(menu.offsetWidth ?? 0);
    const menuHeight = Number(menu.offsetHeight ?? 0);
    const padding = 12;
    const gap = 4;
    const left = viewportWidth > 0
      ? Math.max(padding, Math.min(Number(clientRect.left ?? 0), viewportWidth - menuWidth - padding))
      : Number(clientRect.left ?? 0);
    const below = Number(clientRect.bottom ?? 0) + gap;
    const top = viewportHeight > 0 && below + menuHeight > viewportHeight - padding
      ? Math.max(padding, Number(clientRect.top ?? 0) - menuHeight - gap)
      : below;
    Object.assign(menu.style, {
      position: "fixed",
      left: `${left}px`,
      top: `${top}px`,
      visibility: "",
    });
  };

  return {
    onStart(nextProps) {
      props = nextProps;
      selectedIndex = 0;
      menu = nextProps.editor.view.dom.ownerDocument.createElement("div");
      menu.className = "episode-prompt-editor-menu";
      menu.setAttribute("role", "listbox");
      menu.setAttribute("aria-label", "\u9009\u62e9\u5f15\u7528\u7d20\u6750");
      renderItems();
      menu.style.visibility = "hidden";
      positionMenuFromClientRect(nextProps.clientRect);
      unmount = nextProps.mount(menu, {
        onPosition({ x, y, strategy }) {
          Object.assign(menu.style, {
            position: strategy,
            left: `${x}px`,
            top: `${y}px`,
            visibility: "",
          });
        },
      });
    },
    onUpdate(nextProps) {
      props = nextProps;
      selectedIndex = 0;
      renderItems();
      positionMenuFromClientRect(nextProps.clientRect);
    },
    onKeyDown({ event }) {
      const itemCount = props?.items?.length ?? 0;
      if (event.key === "ArrowUp" && itemCount) {
        selectedIndex = (selectedIndex + itemCount - 1) % itemCount;
        renderItems();
        return true;
      }
      if (event.key === "ArrowDown" && itemCount) {
        selectedIndex = (selectedIndex + 1) % itemCount;
        renderItems();
        return true;
      }
      if (event.key === "Enter") {
        return selectItem(selectedIndex);
      }
      if (event.key === "Escape") {
        return true;
      }
      return false;
    },
    onExit() {
      unmount?.();
      unmount = null;
      menu = null;
      props = null;
    },
  };
}

function createMentionOption(documentRef, item, { active, index, onSelect }) {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = `episode-prompt-editor-option${active ? " is-active" : ""}`;
  button.dataset.index = String(index);
  button.setAttribute("role", "option");
  button.setAttribute("aria-selected", String(active));
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
    onSelect(index);
  });

  const thumb = documentRef.createElement("span");
  thumb.className = "episode-prompt-editor-option-thumb";
  if (item.preview) {
    const image = documentRef.createElement("img");
    image.alt = "";
    image.src = item.preview;
    thumb.append(image);
  } else {
    thumb.textContent = mentionFallbackGlyph(item.assetKind, item.label);
  }

  const copy = documentRef.createElement("span");
  copy.className = "episode-prompt-editor-option-copy";
  const title = documentRef.createElement("strong");
  title.textContent = String(item.label ?? "\u7d20\u6750");
  const kind = documentRef.createElement("small");
  kind.textContent = assetKindLabel(item.assetKind);
  copy.append(title, kind);
  button.append(thumb, copy);
  return button;
}

function emitEditorState(editor, options, initial) {
  const document = editor.getJSON();
  const prompt = serializePromptEditorDocument(document);
  const mentions = collectPromptEditorMentions(document);
  options.onChange?.({
    initial,
    length: [...prompt].length,
    mentions,
    prompt,
  });
  return promptEditorMentionSignature(mentions);
}

function restoreEditorState(editor, element, state) {
  if (!state || state.kind !== "tiptap") {
    return;
  }
  const maxPosition = Math.max(1, editor.state.doc.content.size);
  const from = Math.max(1, Math.min(maxPosition, Number(state.selectionStart ?? maxPosition)));
  const to = Math.max(from, Math.min(maxPosition, Number(state.selectionEnd ?? from)));
  editor.commands.setTextSelection({ from, to });
  element.scrollTop = Math.max(0, Number(state.scrollTop ?? 0));
  if (state.shouldFocus) {
    editor.commands.focus();
  }
}

function installTextareaCompatibility(editor) {
  const editorElement = editor.view.dom;
  Object.defineProperties(editorElement, {
    selectionEnd: {
      configurable: true,
      get: () => editor.state.selection.to,
    },
    selectionStart: {
      configurable: true,
      get: () => editor.state.selection.from,
    },
    value: {
      configurable: true,
      get: () => serializePromptEditorDocument(editor.getJSON()),
    },
  });
}

function attribute(name, key, defaultValue = "") {
  return {
    default: defaultValue,
    parseHTML: (element) => element.getAttribute(name) ?? defaultValue,
    renderHTML: (attributes) => attributes?.[key] ? { [name]: attributes[key] } : {},
  };
}

function assetKindLabel(kind) {
  return ({
    audio: "\u97f3\u9891",
    character: "\u89d2\u8272",
    image: "\u56fe\u7247",
    prop: "\u9053\u5177",
    scene: "\u573a\u666f",
    video: "\u89c6\u9891",
  })[kind] ?? "\u7d20\u6750";
}

function mentionFallbackGlyph(kind, label) {
  if (kind === "audio") return "\u266b";
  if (kind === "video") return "\u25b6";
  return String(label ?? "\u7d20").slice(0, 1);
}
