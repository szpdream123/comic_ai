import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createNewCanvasAssistantService,
  NewCanvasAssistantValidationError,
} from "../new-canvas-assistant.service.ts";

describe("new canvas assistant service", () => {
  it("uses the real text gateway contract with a bounded, text-only context", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const gateway = {
      async completeJson(input: Record<string, unknown>) {
        calls.push(input);
        return "  可以先把角色参考图连接到图像生成节点。  ";
      },
    };
    const service = createNewCanvasAssistantService({ gateway });

    const result = await service.reply({
      messages: [
        { role: "assistant", text: "你想调整什么？", hidden: "do-not-send" },
        { role: "user", text: "怎样保持角色一致？" },
      ],
      selectedElements: [{
        id: "node-1",
        type: "image-generator",
        title: "角色近景",
        prompt: "同一角色，电影感近景",
        dataURL: "data:image/png;base64,SECRET",
        file: { bytes: "SECRET" },
      }],
      attachments: [],
    }, { createdByUserId: "user-1" });

    assert.deepEqual(result, { role: "assistant", text: "可以先把角色参考图连接到图像生成节点。" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.model, "deepseek-chat");
    assert.equal(calls[0]?.createdByUserId, "user-1");
    assert.equal(calls[0]?.responseFormat, "text");
    const prompt = String(calls[0]?.prompt ?? "");
    assert.match(prompt, /怎样保持角色一致/);
    assert.match(prompt, /同一角色，电影感近景/);
    assert.match(prompt, /不能看到图片内容/);
    assert.doesNotMatch(prompt, /data:image|blob:http|SECRET|do-not-send/);
  });

  it("rejects attachment input before calling the text-only gateway", async () => {
    let called = false;
    const service = createNewCanvasAssistantService({
      gateway: {
        async completeJson() {
          called = true;
          return "unused";
        },
      },
    });

    await assert.rejects(
      service.reply({
        attachments: [{
          name: "reference.png",
          mimeType: "image/png",
          dataURL: "data:image/png;base64,SECRET",
        }],
      }, { createdByUserId: "user-1" }),
      (error: unknown) => error instanceof NewCanvasAssistantValidationError
        && error.code === "new_canvas_assistant_vision_unsupported",
    );
    assert.equal(called, false);
  });

  it("rejects requests without a user message before calling the gateway", async () => {
    let called = false;
    const service = createNewCanvasAssistantService({
      gateway: {
        async completeJson() {
          called = true;
          return "unused";
        },
      },
    });

    await assert.rejects(
      service.reply({ messages: [{ role: "assistant", text: "只有助手消息" }] }, { createdByUserId: "user-1" }),
      (error: unknown) => error instanceof NewCanvasAssistantValidationError && error.code === "new_canvas_assistant_message_required",
    );
    assert.equal(called, false);
  });

  it("does not synthesize a fallback when the configured model returns no text", async () => {
    const service = createNewCanvasAssistantService({
      gateway: { async completeJson() { return "   "; } },
    });
    await assert.rejects(
      service.reply({ messages: [{ role: "user", text: "继续" }] }, { createdByUserId: "user-1" }),
      /new_canvas_assistant_empty_response/,
    );
  });
});
