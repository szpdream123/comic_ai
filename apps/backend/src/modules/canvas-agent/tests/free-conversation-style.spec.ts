import assert from "node:assert/strict";
import test from "node:test";
import { resolveVisualStyles, bindVisualStyle, inferVisualStyle } from "../free-conversation-style.ts";
const user = (text: string) => ({ role: "user", content: { text } });

test("project catalog styles bind their original prompt and yield to explicit body corrections", () => {
  const choice = '创作风格：油画。\n风格描述："厚重笔触、布面纹理，非动漫风格。"\n生成一个校园短片';
  const selected = resolveVisualStyles([user(choice), user("继续生成下一幕")]);
  assert.equal(selected.video.label, "油画");
  assert.equal(selected.video.instruction, "厚重笔触、布面纹理，非动漫风格。");
  assert.equal(resolveVisualStyles([user(`/character-design ${choice}`)]).video.label, "油画");
  const bound = bindVisualStyle({kind:"video",request:{prompt:"校园"}}, selected);
  assert.match(bound.request.prompt, /【画面风格：油画】/);
  assert.equal(inferVisualStyle(bound.request.prompt)?.id, selected.video.id);
  assert.equal(resolveVisualStyles([user(choice + "。改成真人写实风格")]).video.id, "realistic");
  assert.equal(inferVisualStyle("【画面风格：二次元】")?.id,"anime");
});
test("visual style defaults to anime and an explicit choice survives later turns", () => {
  assert.equal(resolveVisualStyles([]).video.id, "anime");
  assert.equal(resolveVisualStyles([user("风格为真人写实风格吧"), user("第三幕15秒")]).video.id, "realistic");
  assert.equal(resolveVisualStyles([user("创作风格：水彩插画。"), user("生成图片")]).image.id, "watercolor");
});
test("explicit style changes override history without treating questions or negatives as new choices", () => {
  const history = [user("动漫风格"), user("改成真人写实风格，不要动漫")];
  assert.equal(resolveVisualStyles(history).video.id, "realistic");
  assert.equal(resolveVisualStyles([...history, user("你生成的是动漫风格吗？")]).video.id, "realistic");
  assert.equal(resolveVisualStyles([{ role: "assistant", content: { text: "水彩风格" } }]).image.id, "anime");
  assert.equal(resolveVisualStyles([user("动漫风格"),user("不是动漫风格而是真人写实风格")]).video.id,"realistic");
  assert.equal(resolveVisualStyles([user("真人写实风格"),user("请问刚生成的是动漫风格吗？")]).video.id,"realistic");
});
test("style reaches the actual image/video prompt without changing model, parameters or audio", () => {
  const input = { kind: "video", request: { model: "wan3.0-r2v", prompt: "主角走进校园", parameters: { durationSec: 15 } } };
  const bound = bindVisualStyle(input, resolveVisualStyles([]));
  assert.match(bound.request.prompt, /日系动漫/);
  assert.match(bound.request.prompt, /主角走进校园/);
  assert.deepEqual(bound.request.parameters, input.request.parameters);
  assert.equal(bound.request.model, "wan3.0-r2v");
  assert.equal(bindVisualStyle({ ...input, kind: "audio" }, resolveVisualStyles([])).request.prompt, input.request.prompt);
  assert.equal(inferVisualStyle("动漫风格插画：校园人物")?.id, "anime");
  assert.equal(inferVisualStyle(bound.request.prompt)?.id, "anime");
  for (const field of ["text","motionPrompt"]) {
    const alternate = bindVisualStyle({kind:"video",request:{[field]:"校园短片",model:"wan3.0-r2v"}},resolveVisualStyles([]));
    assert.match(String(alternate.request[field]),/日系动漫/);
  }
});
