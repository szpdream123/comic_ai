import {
  DEEPSEEK_STORYBOARD_MAX_TOKENS,
  type TextChatGatewayLike,
} from "./ai-storyboard-preview.service.ts";

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
          responseFormat: "json_object",
          maxTokens: DEEPSEEK_STORYBOARD_MAX_TOKENS,
        })
      : completeAsStream(deps.gateway, {
          model: "deepseek-chat",
          prompt,
          projectId: input.projectId,
          createdByUserId: input.createdByUserId,
          responseFormat: "json_object",
          maxTokens: DEEPSEEK_STORYBOARD_MAX_TOKENS,
        });

    for await (const chunk of stream) {
      for (const char of String(chunk ?? "")) {
        rawText += char;
        yield { type: "script_delta", text: char };
      }
    }

    const scriptText = resolveScriptText(rawText);
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
    "请只返回一个 JSON 对象，不要 Markdown，不要代码块，不要额外解释。",
    "JSON 对象必须包含 `scriptText` 字段，值为最终可直接保存的剧本文字。",
    "不要生成角色、场景、道具或分镜清单。",
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

function resolveScriptText(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  const fencedJson = trimmed.match(/```json\s*([\s\S]*?)```/i);
  try {
    const parsed = JSON.parse(fencedJson?.[1] ?? trimmed);
    const direct = String(
      parsed?.scriptText ??
      parsed?.script ??
      parsed?.content ??
      parsed?.storyText ??
      parsed?.story_text ??
      "",
    ).trim();
    if (direct) {
      return direct;
    }
    const beats = Array.isArray(parsed?.scriptBeats)
      ? parsed.scriptBeats
      : Array.isArray(parsed?.beats)
        ? parsed.beats
        : [];
    const beatText = beats
      .map((beat) => [
        beat?.plot,
        beat?.scriptContent,
        beat?.content,
        beat?.dialogue,
        beat?.voiceover,
      ].map((item) => String(item ?? "").trim()).filter(Boolean).join("\n"))
      .filter(Boolean)
      .join("\n\n");
    if (beatText.trim()) {
      return beatText.trim();
    }
  } catch {
    // Keep markdown/plain-text fallback for compatibility.
  }
  const fencedMarkdown = trimmed.match(/```(?:markdown|md|text)?\s*([\s\S]*?)```/i);
  return fencedMarkdown?.[1]?.trim() || trimmed;
}
