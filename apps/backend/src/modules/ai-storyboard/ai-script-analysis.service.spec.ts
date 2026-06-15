import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAiScriptAnalysisService } from "./ai-script-analysis.service.ts";
import type { TextChatGatewayLike } from "./ai-storyboard-preview.service.ts";

describe("ai script analysis service", () => {
  it("only streams generated script text without asset stages", async () => {
    const gateway = new FakeTextGateway(["第一集\n任小野进城。"]);
    const service = createAiScriptAnalysisService({ gateway });
    const events = [];

    for await (const event of service.generateScriptStream({
      projectId: "40000000-0000-4000-8000-000000000001",
      createdByUserId: "30000000-0000-4000-8000-000000000001",
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
    assert.deepEqual(gateway.calls.map((call) => call.model), ["deepseek-chat"]);
    assert.deepEqual(gateway.calls.map((call) => call.responseFormat), ["text"]);
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
