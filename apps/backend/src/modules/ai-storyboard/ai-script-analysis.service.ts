import {
  type TextChatGatewayLike,
} from "./ai-storyboard-preview.service.ts";

export type AiScriptAnalysisStreamEvent =
  | { type: "script_prompt"; text: string }
  | { type: "script_start" }
  | { type: "script_delta"; text: string }
  | { type: "script_done"; text: string; rawText: string }
  | { type: "complete"; scriptText: string };

export interface AiScriptAnalysisInput {
  projectId?: string | null;
  createdByUserId?: string | null;
  modelCode?: string | null;
  scriptText: string;
  packages: {
    skillPrompt?: string;
    genrePrompt?: string;
    emotionPrompt?: string;
    tabooPrompt?: string;
  };
  signal?: AbortSignal;
}

export function createAiScriptAnalysisService(deps: { gateway: TextChatGatewayLike }) {
  async function* generateScriptStream(input: AiScriptAnalysisInput): AsyncIterable<AiScriptAnalysisStreamEvent> {
    const prompt = buildScriptAnalysisPrompt(input);
    const modelCode = String(input.modelCode ?? "deepseek-noval").trim() || "deepseek-noval";
    yield { type: "script_prompt", text: prompt };
    yield { type: "script_start" };

    let rawText = "";
    const stream = deps.gateway.streamJson
      ? deps.gateway.streamJson({
          model: modelCode,
          prompt,
          projectId: input.projectId,
          createdByUserId: input.createdByUserId,
          responseFormat: "text",
          signal: input.signal,
        })
      : completeAsStream(deps.gateway, {
          model: modelCode,
          prompt,
          projectId: input.projectId,
          createdByUserId: input.createdByUserId,
          responseFormat: "text",
          signal: input.signal,
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
    input.packages.skillPrompt || "",
    input.packages.genrePrompt || "",
    input.packages.emotionPrompt || "",
    input.packages.tabooPrompt || "",
    input.scriptText,
  ].map((part) => part.trim()).filter(Boolean).join("\n\n");
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
