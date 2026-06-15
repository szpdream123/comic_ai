import type { TextChatGatewayLike } from "./ai-storyboard-preview.service.ts";

export type AiScriptAnalysisStreamEvent =
  | { type: "script_prompt"; text: string }
  | { type: "script_start" }
  | { type: "script_delta"; text: string }
  | { type: "script_done"; text: string; rawText: string }
  | { type: "complete"; scriptText: string };

export interface AiScriptAnalysisInput {
  projectId: string;
  createdByUserId?: string | null;
  scriptText: string;
  packages: {
    genrePrompt?: string;
    emotionPrompt?: string;
    tabooPrompt?: string;
  };
}

export function createAiScriptAnalysisService(deps: { gateway: TextChatGatewayLike }) {
  async function* generateScriptStream(input: AiScriptAnalysisInput): AsyncIterable<AiScriptAnalysisStreamEvent> {
    const prompt = buildScriptAnalysisPrompt(input);
    yield { type: "script_prompt", text: prompt };
    yield { type: "script_start" };

    let rawText = "";
    const stream = deps.gateway.streamJson
      ? deps.gateway.streamJson({
          model: "deepseek-chat",
          prompt,
          projectId: input.projectId,
          createdByUserId: input.createdByUserId,
          responseFormat: "text",
        })
      : completeAsStream(deps.gateway, {
          model: "deepseek-chat",
          prompt,
          projectId: input.projectId,
          createdByUserId: input.createdByUserId,
          responseFormat: "text",
        });

    for await (const chunk of stream) {
      for (const char of String(chunk ?? "")) {
        rawText += char;
        yield { type: "script_delta", text: char };
      }
    }

    const scriptText = rawText.trim();
    if (!scriptText) {
      throw new Error("ai_script_analysis_empty");
    }
    yield { type: "script_done", text: scriptText, rawText };
    yield { type: "complete", scriptText };
  }

  return { generateScriptStream };
}

async function* completeAsStream(
  gateway: TextChatGatewayLike,
  input: Parameters<TextChatGatewayLike["completeJson"]>[0],
) {
  yield await gateway.completeJson(input);
}

function buildScriptAnalysisPrompt(input: AiScriptAnalysisInput) {
  return [
    "请把用户提供的文本改写为可直接保存的剧本文字。",
    "只输出剧本正文，不要 JSON，不要 Markdown，不要解释，不要生成角色、场景、道具或分镜清单。",
    "如果原文包含多集，请保留或补全“第1集/第2集”这类集数标题，方便系统按集保存。",
    "",
    "【题材包】",
    input.packages.genrePrompt || "",
    "",
    "【情绪包】",
    input.packages.emotionPrompt || "",
    "",
    "【通用禁忌包】",
    input.packages.tabooPrompt || "",
    "",
    "【原始文案】",
    input.scriptText,
  ].join("\n");
}
