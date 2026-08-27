import assert from "node:assert/strict";
import { it } from "node:test";

import { __phoneAuthDevServerTestUtils } from "../phone-auth-dev-server.ts";

it("adds a hidden image style prompt with the submitted style reference index", () => {
  const prompt = __phoneAuthDevServerTestUtils.appendImageStylePromptForGeneration(
    "故事板正文：角色与场景同框。",
    "厚涂油画质感，清晰笔触。",
    {
      parameters: {
        quickReferences: [
          { id: "character-reference", kind: "image" },
          { id: "scene-reference", kind: "image" },
          {
            id: "batch-style-reference:oil-painting",
            kind: "image",
            isGenerationStyleReference: true,
          },
        ],
      },
    },
  );

  assert.equal(
    prompt,
    "故事板正文：角色与场景同框。\n图片风格：参考【@图3】不要出现参考图内容，厚涂油画质感，清晰笔触。",
  );
});

it("normalizes an existing image style line without appending it twice", () => {
  const prompt = "故事板正文。\n图片风格：【@图3】厚涂油画质感，清晰笔触。";
  assert.equal(
    __phoneAuthDevServerTestUtils.appendImageStylePromptForGeneration(
      prompt,
      "厚涂油画质感，清晰笔触。",
      {
        parameters: {
          quickReferences: [
            { id: "character-reference", kind: "image" },
            { id: "scene-reference", kind: "image" },
            { id: "batch-style-reference:oil-painting", kind: "image", isGenerationStyleReference: true },
          ],
        },
      },
    ),
    "故事板正文。\n图片风格：参考【@图3】不要出现参考图内容，厚涂油画质感，清晰笔触。",
  );
});

it("resolves the selected image style skill into both video prompt fields", async () => {
  const styleId = "83000000-0000-4000-8000-000000000414";
  const db = {
    async query(sql: string) {
      if (/SELECT item\.\*/u.test(sql)) {
        return {
          rows: [{
            id: styleId,
            prompt_category: "image_style",
            name: "人像摄影",
            prompt_content: "真实人像摄影风格，皮肤质感自然。",
            price_credits: 0,
            is_official: true,
            is_published: true,
            status: "enabled",
            deleted_at: null,
            user_link_id: null,
            owner_user_id: null,
          }],
        };
      }
      return { rows: [] };
    },
  };
  const body = await __phoneAuthDevServerTestUtils.resolveVideoGenerationStyleBody(db as never, "user-1", {
    imageStyleSkillId: styleId,
    prompt: "镜头缓慢推进\n视频风格：水彩插画风格。",
    motionPrompt: "镜头缓慢推进\n视频风格：水彩插画风格。",
  });
  assert.equal(body.prompt, "镜头缓慢推进\n视频风格：真实人像摄影风格，皮肤质感自然。");
  assert.equal(body.motionPrompt, body.prompt);
});
