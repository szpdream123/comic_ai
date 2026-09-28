import assert from "node:assert/strict";
import test from "node:test";
import { composeAssistantStyleMessage, restoreAssistantStyleDraft } from "../ai-canvas-runtime/assets/assistantStyle.js";

const builtin = [{ id: "anime", name: "二次元", prompt: "精致线稿" }];
const custom = [{ id: "watercolor", name: "水彩插画", prompt: "透明水彩笔触" }];

test("assistant sends the selected native style with node references and skill commands intact", () => {
  const draft = "/storyboard @node:123 生成雨后的校园";
  assert.equal(composeAssistantStyleMessage(draft, "watercolor", custom, builtin),
    '创作风格：水彩插画。\n风格描述："透明水彩笔触"\n' + draft);
});

test("builtin styles use the same prompt as the native node picker", () => {
  assert.equal(composeAssistantStyleMessage("生成图片", "anime", [], builtin),
    '创作风格：二次元。\n风格描述："精致线稿"\n生成图片');
});

test("cleared or deleted styles leave the original request untouched", () => {
  for (const id of ["", undefined, "deleted"]) {
    assert.equal(composeAssistantStyleMessage("查询节点", id, custom, builtin), "查询节点");
  }
});

test("custom catalog takes priority and prompt text stays quoted", () => {
  const styles = [{ id: "anime", name: "二次元", prompt: '线稿\n"柔和色彩"' }];
  assert.equal(composeAssistantStyleMessage("继续", "anime", styles, builtin),
    '创作风格：二次元。\n风格描述："线稿\\n\\"柔和色彩\\""\n继续');
});

test("editing a styled message restores its selector and clean draft for change or clear", () => {
  const sent = composeAssistantStyleMessage("校园", "watercolor", custom, builtin);
  const draft = restoreAssistantStyleDraft(sent, custom, builtin);
  assert.deepEqual(draft, { content: "校园", styleId: "watercolor" });
  assert.equal(composeAssistantStyleMessage(draft.content, "anime", custom, builtin),
    '创作风格：二次元。\n风格描述："精致线稿"\n校园');
  assert.equal(composeAssistantStyleMessage(draft.content, "", custom, builtin), "校园");
});

test("editing unrecognized or changed style instructions preserves the original text", () => {
  for (const content of ["原始提示词", '创作风格：已删除。\n风格描述："旧描述"\n校园',
    '创作风格：水彩插画。\n风格描述："不同描述"\n校园']) {
    assert.deepEqual(restoreAssistantStyleDraft(content, custom, builtin), { content, styleId: "" });
  }
});
