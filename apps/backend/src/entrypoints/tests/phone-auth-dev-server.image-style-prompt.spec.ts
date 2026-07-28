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
