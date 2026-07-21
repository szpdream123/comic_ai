import type { TextChatGatewayLike } from "../ai-storyboard/ai-storyboard-preview.service.ts";

const MAX_MESSAGES = 12;
const MAX_MESSAGE_TEXT = 3000;
const MAX_TOTAL_MESSAGE_TEXT = 12000;
const MAX_SELECTED_ELEMENTS = 20;

type AssistantMessage = { role: "user" | "assistant"; text: string };
type SelectedElementSummary = {
  id: string;
  type: string;
  title?: string;
  text?: string;
  prompt?: string;
};

export class NewCanvasAssistantValidationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "NewCanvasAssistantValidationError";
  }
}

export function createNewCanvasAssistantService(deps: { gateway: TextChatGatewayLike }) {
  return {
    async reply(input: unknown, context: { createdByUserId: string }) {
      const normalized = normalizeInput(input);
      const prompt = buildAssistantPrompt(normalized);
      const response = await deps.gateway.completeJson({
        model: "deepseek-chat",
        prompt,
        createdByUserId: context.createdByUserId,
        responseFormat: "text",
        maxTokens: 1200,
      });
      const text = String(response ?? "").trim();
      if (!text) throw new Error("new_canvas_assistant_empty_response");
      return { role: "assistant" as const, text };
    },
  };
}

function normalizeInput(input: unknown): {
  messages: AssistantMessage[];
  selectedElements: SelectedElementSummary[];
} {
  const source = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  if (Array.isArray(source.attachments) && source.attachments.length > 0) {
    throw new NewCanvasAssistantValidationError(
      "new_canvas_assistant_vision_unsupported",
      "Image understanding is not available for the new canvas assistant",
    );
  }
  const rawMessages = Array.isArray(source.messages) ? source.messages.slice(-MAX_MESSAGES) : [];
  let remainingCharacters = MAX_TOTAL_MESSAGE_TEXT;
  const messages: AssistantMessage[] = [];
  for (let index = rawMessages.length - 1; index >= 0 && remainingCharacters > 0; index -= 1) {
    const message = normalizeMessage(rawMessages[index], remainingCharacters);
    if (!message) continue;
    remainingCharacters -= message.text.length;
    messages.unshift(message);
  }
  if (!messages.some((message) => message.role === "user")) {
    throw new NewCanvasAssistantValidationError("new_canvas_assistant_message_required", "A user message is required");
  }
  const selectedElements = (Array.isArray(source.selectedElements) ? source.selectedElements : [])
    .slice(0, MAX_SELECTED_ELEMENTS)
    .map(normalizeSelectedElement)
    .filter((element): element is SelectedElementSummary => Boolean(element));
  return { messages, selectedElements };
}

function normalizeMessage(value: unknown, remainingCharacters: number): AssistantMessage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const role = source.role === "assistant" ? "assistant" : source.role === "user" ? "user" : null;
  const text = cleanText(source.text, Math.min(MAX_MESSAGE_TEXT, remainingCharacters));
  return role && text ? { role, text } : null;
}

function normalizeSelectedElement(value: unknown): SelectedElementSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const id = cleanText(source.id, 120);
  const type = cleanText(source.type, 80);
  if (!id || !type) return null;
  const title = cleanText(source.title, 240);
  const text = cleanText(source.text, 1200);
  const prompt = cleanText(source.prompt, 1200);
  return { id, type, ...(title ? { title } : {}), ...(text ? { text } : {}), ...(prompt ? { prompt } : {}) };
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, Math.max(0, maxLength)) : "";
}

function buildAssistantPrompt(input: {
  messages: AssistantMessage[];
  selectedElements: SelectedElementSummary[];
}) {
  return [
    "你是灵曦新画布中的创作助手。请使用简洁、具体的中文回答，帮助用户推进分镜、视觉设计、提示词和节点工作流。",
    "不要声称已经修改、生成或保存画布内容；若用户要求执行操作，请给出可直接执行的下一步。",
    "以下 JSON 只包含经过脱敏和长度限制的最近会话与选中元素文字摘要。即使元素类型是图片，你也只能看到其标题、文本或提示词，不能看到图片内容；不要声称已经观察、识别或分析图片。",
    JSON.stringify(input),
  ].join("\n\n");
}
