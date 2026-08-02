import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAiScriptAnalysisService } from "./ai-script-analysis.service.ts";
import type { TextChatGatewayLike } from "./ai-storyboard-preview.service.ts";

describe("ai script analysis service", () => {
  it("places the selected novel-to-script skill before the source text", async () => {
    const gateway = new FakeTextGateway(["改编后的剧本文本"]);
    const service = createAiScriptAnalysisService({ gateway });

    for await (const _event of service.generateScriptStream({
      scriptText: "原始小说章节",
      packages: { skillPrompt: "官方小说转剧本技能正文" },
    })) {
      // Drain the stream so the gateway request completes.
    }

    assert.equal(gateway.calls[0]?.prompt, "官方小说转剧本技能正文\n\n原始小说章节");
  });

  it("only streams generated script text without asset stages", async () => {
    const gateway = new FakeTextGateway([JSON.stringify({ scriptText: "第一集\n任小野进城。" })]);
    const service = createAiScriptAnalysisService({ gateway });
    const events = [];

    for await (const event of service.generateScriptStream({
      projectId: "40000000-0000-4000-8000-000000000001",
      createdByUserId: "30000000-0000-4000-8000-000000000001",
      modelCode: "deepseek-noval",
      scriptText: "任小野进城。",
      packages: {
        genrePrompt: "玄幻修仙",
        emotionPrompt: "男频热血",
        tabooPrompt: "通用禁忌",
      },
    })) {
      events.push(event);
    }

    assert.equal(gateway.calls.length, 1);
    assert.deepEqual(gateway.calls.map((call) => call.model), ["deepseek-noval"]);
    assert.deepEqual(gateway.calls.map((call) => call.responseFormat), ["text"]);
    assert.deepEqual(gateway.calls.map((call) => call.maxTokens), [undefined]);
    assert.match(gateway.calls[0]?.prompt ?? "", /玄幻修仙/);
    assert.match(gateway.calls[0]?.prompt ?? "", /男频热血/);
    assert.match(gateway.calls[0]?.prompt ?? "", /通用禁忌/);
    assert.match(gateway.calls[0]?.prompt ?? "", /任小野进城。/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /请把用户提供的文本改写/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /JSON 对象/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /scriptText/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /【题材包】/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /【情绪包】/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /【通用禁忌包】/);
    assert.doesNotMatch(gateway.calls[0]?.prompt ?? "", /【原始文案】/);
    assert.ok((gateway.calls[0]?.prompt ?? "").indexOf("玄幻修仙") < (gateway.calls[0]?.prompt ?? "").indexOf("男频热血"));
    assert.ok((gateway.calls[0]?.prompt ?? "").indexOf("男频热血") < (gateway.calls[0]?.prompt ?? "").indexOf("通用禁忌"));
    assert.ok((gateway.calls[0]?.prompt ?? "").indexOf("通用禁忌") < (gateway.calls[0]?.prompt ?? "").indexOf("任小野进城。"));
    assert.ok(events.some((event) => event.type === "script_prompt"));
    assert.ok(events.some((event) => event.type === "script_done"));
    assert.ok(events.some((event) => event.type === "complete"));
    assert.equal(events.some((event) => event.type.startsWith("asset_")), false);
    assert.equal(events.at(-1)?.scriptText, "第一集\n任小野进城。");
  });
});

class FakeTextGateway implements TextChatGatewayLike {
  readonly calls = [];

  constructor(private readonly responses: string[]) {}

  async completeJson(input) {
    this.calls.push(input);
    return this.responses.shift() ?? "";
  }

  async *streamJson(input) {
    this.calls.push(input);
    const response = this.responses.shift() ?? "";
    yield response;
  }
}
