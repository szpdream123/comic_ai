import assert from "node:assert/strict";
import test from "node:test";
import { resolveConversationModelSelection } from "../free-conversation-model-selection.ts";

const catalog = [
  { model_code: "wan3.0-r2v", display_name: "Wan3.0（秒计费）", media_type: "video", status: "active" },
  { model_code: "sd_2.0_special", display_name: "Seedance 2.0", media_type: "video", status: "active" },
];
const user = (text: string, video = "sd_2.0_special") => ({ role: "user", content: { text, preferredModels: { video } } });

test("explicit Wan choice survives script and clarification turns carrying the same UI default", () => {
  const result = resolveConversationModelSelection([user("到时候生成15s视频，模型用wan3.0"), user("第三幕：晚风告白"), user("第三幕即可")], catalog, { video: "sd_2.0_special", image: "image-default" });
  assert.equal(result.models.video, "wan3.0-r2v");
  assert.equal(result.models.image, "image-default");
  assert.equal(result.error, "");
});
test("a later UI change overrides previous conversational selection", () => {
  assert.equal(resolveConversationModelSelection([user("用wan3.0生成视频"), user("生成", "wan3.0-r2v"), user("再生成", "sd_2.0_special")], catalog, { video: "sd_2.0_special" }).models.video, "sd_2.0_special");
});
test("assistant promises, negations and model questions cannot select a model", () => {
  for (const message of [user("不要用wan3.0"), user("wan3.0怎么样？"), { role: "assistant", content: { text: "用wan3.0生成" } }]) {
    assert.equal(resolveConversationModelSelection([message], catalog, { video: "sd_2.0_special" }).models.video, "sd_2.0_special");
  }
});
test("unknown, inactive or ambiguous explicitly requested models cannot silently fall back", () => {
  assert.ok(resolveConversationModelSelection([user("模型用wan4.0")], catalog, {}).error);
  assert.ok(resolveConversationModelSelection([user("使用wan3.0")], catalog.map(m => ({ ...m, status: "inactive" })), {}).error);
  assert.ok(resolveConversationModelSelection([user("用wan3.0")], [...catalog, { ...catalog[0], model_code: "wan3.0-t2v" }], {}).error);
});

test("full public English and Chinese display names resolve through the actual catalog", () => {
  const models = [...catalog, { model_code: "image-pro", display_name: "GPT Image 2 Pro", media_type: "image", status: "active" }, { model_code: "kling", display_name: "可灵3.0", media_type: "video", status: "active" }];
  assert.equal(resolveConversationModelSelection([user("使用 GPT Image 2 Pro 生成角色")], models, {}).models.image, "image-pro");
  assert.equal(resolveConversationModelSelection([user("用可灵3.0生成视频")], models, {}).models.video, "kling");
});

test("ordinary resolution, quantity and duration instructions are not unknown model requests", () => {
  for (const text of [
    "请用一张1920x1080的图片做海报",
    "请使用这3张参考图生成视频",
    "采用时长15秒的方案",
    "用A4纸张比例生成海报",
    "使用h264编码的视频作为参考",
  ]) {
    const result = resolveConversationModelSelection([user(text)], catalog, { video: "sd_2.0_special" });
    assert.equal(result.error, "", text);
    assert.equal(result.models.video, "sd_2.0_special", text);
  }
});

test("unavailable versions and explicit unknown model names still stop generation", () => {
  for (const text of ["用wan4.0生成视频", "模型用future", "使用Seedance 9生成视频", "使用 future2 模型", "用future2模型生成视频"]) {
    assert.ok(resolveConversationModelSelection([user(text)], catalog, {}).error, text);
  }
});
