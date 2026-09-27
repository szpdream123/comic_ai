import assert from "node:assert/strict";
import { it } from "node:test";
import { adaptGenerationPrompt } from "../generation-prompt-adaptation.ts";
import type { AiModelConfigRecord } from "../ai-model-config.store.ts";
import { composeGenerationPrompt, measureGenerationPrompt, resolveGenerationPromptLimit } from "../../../../../web/src/shared/generation-prompt-policy.js";

const model = (maximum = 60, unit = "characters", mediaType = "video") => ({
  modelCode: "any-configured-model", mediaType,
  parameterSchema: { prompt: { maxLength: maximum, limitUnit: unit } }, limits: {},
}) as AiModelConfigRecord;
const noCall = async () => { throw new Error("Unexpected model call"); };

it("simplifies against the final composed budget even when the editor text alone fits", async () => {
  for (const mediaType of ["image", "video"]) for (const unit of ["characters", "bytes"]) {
    const context = { mediaType, prefixes: ["镜头模板"], style: "日系动漫\n明亮柔光", styleReferenceName: "图1" };
    const prompt = "人物向前走。".repeat(9);
    const config = model(unit === "bytes" ? 180 : 60, unit, mediaType);
    const normalize = (value: string) => composeGenerationPrompt(value, context);
    let calls = 0;
    const result = await adaptGenerationPrompt({ model: config, prompt, normalize, complete: async (request) => {
      calls++;
      if (calls === 1) {
        const overhead = measureGenerationPrompt(normalize(prompt), resolveGenerationPromptLimit(config))! - measureGenerationPrompt(prompt, resolveGenerationPromptLimit(config))!;
        assert.ok(request.messages[0].content.includes(`正文预算为 ${config.parameterSchema.prompt.maxLength - overhead}`));
        return JSON.stringify({ prompt: "人物向前走。" });
      }
      return JSON.stringify({ equivalent: true, lost: [], added: [] });
    } });
    assert.equal(calls, 2);
    assert.equal(result.originalPrompt, prompt);
    assert.ok(measureGenerationPrompt(normalize(result.prompt), resolveGenerationPromptLimit(config))! <= config.parameterSchema.prompt.maxLength);
  }
});

it("rejects a candidate that fits alone but overflows after style composition", async () => {
  await assert.rejects(adaptGenerationPrompt({ model: model(20), prompt: "人".repeat(21),
    normalize: (value) => composeGenerationPrompt(value, { mediaType: "video", style: "动漫风格\n柔光" }),
    complete: async () => JSON.stringify({ prompt: "人".repeat(19) }),
  }), { adaptationReason: "length_exceeded" });
});

it("corrects a length miss once using measured feedback and independently verifies the corrected draft", async () => {
  const original = "人物向前走。".repeat(12);
  const candidate = "人物向前走。";
  let calls = 0;
  const result = await adaptGenerationPrompt({ model: model(30), prompt: original,
    normalize: (value) => composeGenerationPrompt(value, { mediaType: "video", style: "动漫风格" }),
    complete: async (request) => {
      calls++;
      if (calls === 1) return JSON.stringify({ prompt: original });
      if (calls === 2) {
        assert.match(request.messages[0].content, /上次返回经系统拼接后实际为/);
        return JSON.stringify({ prompt: candidate });
      }
      assert.equal(JSON.parse(request.messages[1].content).originalPrompt, original);
      return JSON.stringify({ equivalent: true, lost: [], added: [] });
    },
  });
  assert.equal(result.prompt, candidate);
  assert.equal(calls, 3);
});

it("leaves an in-budget Unicode prompt and an unconfigured limit untouched", async () => {
  for (const config of [model(2), { ...model(), parameterSchema: {} }]) {
    assert.equal((await adaptGenerationPrompt({ model: config, prompt: "猫😀", complete: noCall })).prompt, "猫😀");
  }
});

it("adapts overlong prompts for different model budgets and preserves the original", async () => {
  const original = "【@沈寒舟】说：‘不要回头！’。镜头缓慢推近，随后转身。" + "柔和的晨光照亮人物与环境。".repeat(10);
  const candidate = "【@沈寒舟】说：‘不要回头！’。镜头缓推近，随后转身，柔和晨光。";
  for (const maximum of [50, 80]) {
    let calls = 0;
    const adapted = await adaptGenerationPrompt({ model: model(maximum), prompt: original, complete: async () => {
      calls += 1;
      return calls === 1 ? JSON.stringify({ prompt: candidate }) : JSON.stringify({ equivalent: true, lost: [], added: [] });
    } });
    assert.equal(adapted.prompt, candidate);
    assert.equal(adapted.originalPrompt, original);
    assert.equal(calls, 2, "one rewrite and one independent fidelity check");
  }
});

it("rejects omitted dialogue, references, and timings without silently truncating", async () => {
  const original = "【@沈寒舟】在3秒时说：“不要回头！”然后转身。" + "晨光。".repeat(40);
  for (const prompt of ["沈寒舟在3秒时说：“不要回头！”然后转身。", "【@沈寒舟】在3秒时转身。", "【@沈寒舟】说：“不要回头！”然后转身。"] ) {
    await assert.rejects(adaptGenerationPrompt({ model: model(), prompt: original, complete: async () => JSON.stringify({ prompt }) }), { code: "model_prompt_too_long" });
  }
});

it("fails closed on malformed, overlong, or semantically incomplete adaptations", async () => {
  for (const answer of ["bad json", JSON.stringify({ prompt: "长".repeat(100) }), JSON.stringify({ prompt: "人物转身" })]) {
    let calls = 0;
    await assert.rejects(adaptGenerationPrompt({ model: model(), prompt: "人物先抬头后转身。".repeat(20), complete: async () => {
      calls += 1;
      return calls === 1 ? answer : JSON.stringify({ equivalent: false, lost: ["抬头"], added: [] });
    } }), { code: "model_prompt_too_long" });
    assert.ok(calls <= 2);
  }
});

it("does not rewrite spoken audio text or mistake tokens for characters", async () => {
  await assert.rejects(adaptGenerationPrompt({ model: model(4, "characters", "audio"), prompt: "请完整读出这句话", complete: noCall }), { code: "model_prompt_too_long" });
  assert.equal((await adaptGenerationPrompt({ model: model(2, "tokens"), prompt: "a beautiful landscape", complete: noCall })).prompt, "a beautiful landscape");
});

it("measures a rewritten prompt in bytes when the selected model requires bytes", async () => {
  await assert.rejects(adaptGenerationPrompt({ model: model(5, "bytes"), prompt: "你好世界", complete: async () => JSON.stringify({ prompt: "你好" }) }), { code: "model_prompt_too_long" });
});

it("allows template removal and equivalent time ranges while still requiring semantic verification", async () => {
  const original = "【空间坐标与专属背景锁】【断魂崖峭壁】【@图1】在崖壁左侧。【镜头 1】【00:00 - 00:02】先抬头。【镜头 2】【00:02 - 00:04.5】后转身。【负面词约束】不越180度轴线。" + "柔和晨光。".repeat(30);
  const candidate = "断魂崖峭壁，柔和晨光。【@图1】在左侧。镜1 00-02 先抬头；镜2 02-04.5 后转身。机位不越轴。";
  for (const mediaType of ["image", "video"]) {
    for (const shortened of [candidate, candidate.replace("00-02", "0到2秒").replace("02-04.5", "2至4.5秒")]) {
      let calls = 0;
      const result = await adaptGenerationPrompt({ model: model(150, "characters", mediaType), prompt: original, complete: async () => {
        calls++;
        return calls === 1 ? JSON.stringify({ prompt: shortened }) : JSON.stringify({ equivalent: true, lost: [], added: [] });
      } });
      assert.equal(result.prompt, shortened);
      assert.equal(result.originalPrompt, original);
      assert.equal(calls, 2);
    }
  }
});

it("rejects missing or changed references and dialogue even when the verifier would approve", async () => {
  for (const [original, candidate] of [["@图1 转身", "@图10 转身"], ["【@图1】转身", "@图1 转身"], ["【@角色甲】说：“等等！”", "【@角色甲】说：“快走！”"]]) {
    let calls = 0;
    await assert.rejects(adaptGenerationPrompt({ model: model(40), prompt: original + "柔和晨光。".repeat(30), complete: async () => {
      calls++;
      return calls === 1 ? JSON.stringify({ prompt: candidate }) : JSON.stringify({ equivalent: true, lost: [], added: [] });
    } }), { adaptationReason: "protected_content_changed", message: "精简稿遗漏或改动了素材引用、台词等受保护内容，请重试。" });
    assert.equal(calls, 1);
  }
});

it("rejects altered, omitted, or reordered shot time ranges before semantic approval", async () => {
  const original = "【镜头 1】【00:00 - 00:02】抬头。【镜头 2】【00:02 - 00:04.5】转身。" + "晨光。".repeat(50);
  for (const candidate of ["镜1 00-03 抬头；镜2 03-04.5 转身", "镜1 00-02 抬头后转身", "镜2 02-04.5 转身；镜1 00-02 抬头"]) {
    let calls = 0;
    await assert.rejects(adaptGenerationPrompt({ model: model(90), prompt: original, complete: async () => {
      calls++;
      return calls === 1 ? JSON.stringify({ prompt: candidate }) : JSON.stringify({ equivalent: true, lost: [], added: [] });
    } }), { adaptationReason: "timing_changed" });
    assert.equal(calls, 1);
  }
});

it("distinguishes malformed output, excess length, and semantic rejection", async () => {
  for (const [answer, reason] of [["bad json", "invalid_response"], [JSON.stringify({ prompt: "长".repeat(100) }), "length_exceeded"], [JSON.stringify({ prompt: "人物转身" }), "content_check_failed"]]) {
    let calls = 0;
    await assert.rejects(adaptGenerationPrompt({ model: model(), prompt: "人物先抬头后转身。".repeat(20), complete: async () => {
      calls++;
      return calls === 1 || reason === "length_exceeded" ? answer : JSON.stringify({ equivalent: false, lost: ["抬头"], added: [] });
    } }), { adaptationReason: reason });
  }
});

it("does not treat an English quantity followed by a word starting with s as seconds", async () => {
  let calls = 0;
  const candidate = "二十至三十名学生站在柔和晨光中。";
  const result = await adaptGenerationPrompt({ model: model(), prompt: "20-30 students stand in the morning light. ".repeat(10), complete: async () => {
    calls++;
    return calls === 1 ? JSON.stringify({ prompt: candidate }) : JSON.stringify({ equivalent: true, lost: [], added: [] });
  } });
  assert.equal(result.prompt, candidate);
  assert.equal(calls, 2);
});

it("reserves bounded text output for reasoning in both stages independently of the media prompt limit", async () => {
  let calls = 0;
  const result = await adaptGenerationPrompt({ model: model(20), prompt: "晨光中的人物抬头。".repeat(20), complete: async (request) => {
    calls++;
    if ((request.maxTokens ?? 0) <= 8192) throw Object.assign(new Error("provider_output_truncated"), { code: "provider_output_truncated" });
    assert.ok(request.maxTokens! <= 16384);
    assert.ok(request.signal);
    return calls === 1 ? JSON.stringify({ prompt: "晨光中人物抬头。" }) : JSON.stringify({ equivalent: true, lost: [], added: [] });
  } });
  assert.equal(result.prompt, "晨光中人物抬头。");
  assert.equal(calls, 2);
});

it("reports model output truncation separately from provider unavailability", async () => {
  await assert.rejects(adaptGenerationPrompt({ model: model(), prompt: "人物抬头。".repeat(30), complete: async () => {
    throw Object.assign(new Error("provider_output_truncated"), { code: "provider_output_truncated" });
  } }), { adaptationReason: "output_truncated" });
});

it("compacts generated field separators without rewriting content and still verifies the whole prompt", async () => {
  const fields = ["中景", "平拍", "50mm f/2.8", "缓慢推镜", "【@图1】缓缓握拳，说：“别走！”", "右上方日光", "三分构图", "眼部焦点", "Cinematic, realistic", "柔光2:1"];
  const original = "【00:00-00:02】\n" + fields.map((value, i) => `${i + 1} ${value}`).join(" + ");
  for (const unit of ["characters", "bytes"]) {
    for (const mediaType of ["image", "video"]) {
      let calls = 0;
      const result = await adaptGenerationPrompt({ model: model(unit === "bytes" ? 205 : 120, unit, mediaType), prompt: original,
        complete: async (request) => {
          calls++;
          const data = JSON.parse(request.messages![1].content as string);
          assert.equal(data.originalPrompt, original);
          for (const field of fields) assert.ok(data.adaptedPrompt.includes(field));
          return JSON.stringify({ equivalent: true, lost: [], added: [] });
        },
      });
      assert.equal(calls, 1);
      assert.equal(result.originalPrompt, original);
      for (const field of fields) assert.ok(result.prompt.includes(field));
    }
  }
});

it("does not bypass semantic rejection after formatting-only compaction", async () => {
  const original = Array.from({ length: 10 }, (_, index) => `${index + 1} 人物保持原位`).join(" + ");
  await assert.rejects(adaptGenerationPrompt({ model: model(90), prompt: original,
    complete: async () => JSON.stringify({ equivalent: false, lost: ["无法确认空间关系"], added: [] }),
  }), { adaptationReason: "content_check_failed" });
});

it("preserves CRLF inside multiline dialogue when compacting generated rows", async () => {
  const dialogue = "【@图1】说：“别走，\r\n等等我！”\r\n";
  const original = dialogue + Array.from({ length: 10 }, (_, index) => `${index + 1} 人物保持原位`).join(" + ");
  let calls = 0;
  const result = await adaptGenerationPrompt({ model: model(100), prompt: original,
    complete: async () => { calls++; return JSON.stringify({ equivalent: true, lost: [], added: [] }); },
  });
  assert.ok(result.prompt.startsWith(dialogue));
  assert.equal(calls, 1);
});

it("leaves incomplete or out-of-order field rows to model rewriting", async () => {
  for (const numbers of [[1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 5, 4, 6, 7, 8, 9, 10]]) {
    const original = numbers.map((n) => `${n} 人物保持原位`).join(" + ");
    let calls = 0;
    await adaptGenerationPrompt({ model: model(80), prompt: original,
      complete: async (request) => {
        calls++;
        if (calls === 1) {
          const data = JSON.parse(request.messages![1].content as string);
          assert.equal(data.originalPrompt, original);
          assert.equal(data.adaptedPrompt, undefined);
          return JSON.stringify({ prompt: "人物保持原位" });
        }
        return JSON.stringify({ equivalent: true, lost: [], added: [] });
      },
    });
    assert.equal(calls, 2);
  }
});
