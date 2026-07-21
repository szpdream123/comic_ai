export function buildCanvasAssistantRequest(message, context = {}) {
  const messages = (Array.isArray(context.messages) ? context.messages : [])
    .slice(-12)
    .map((item) => ({ role: item?.role === "assistant" ? "assistant" : "user", text: String(item?.text ?? "").trim() }))
    .filter((item) => item.text);
  const selectedElements = (Array.isArray(context.selectedElements) ? context.selectedElements : []).slice(0, 20).map((element) => {
    const customData = element?.customData && typeof element.customData === "object" ? element.customData : {};
    return {
      id: String(element?.id ?? ""),
      type: String(customData.type ?? element?.type ?? "unknown"),
      ...(customData.title ? { title: String(customData.title) } : {}),
      ...(element?.text || customData.text ? { text: String(element?.text ?? customData.text) } : {}),
      ...(customData.prompt ? { prompt: String(customData.prompt) } : {}),
    };
  }).filter((element) => element.id);
  return { messages, selectedElements, attachments: [] };
}

export function sanitizeCanvasAssistantSessions(value) {
  if (!Array.isArray(value)) return [];
  return value.map((session) => {
    if (!session || typeof session !== "object" || Array.isArray(session)) return null;
    const id = String(session.id ?? "").trim();
    if (!id) return null;
    const messages = (Array.isArray(session.messages) ? session.messages : []).map((message) => {
      if (!message || typeof message !== "object" || Array.isArray(message)) return null;
      const messageId = String(message.id ?? "").trim();
      const role = message.role === "assistant" ? "assistant" : message.role === "user" ? "user" : null;
      if (!messageId || !role) return null;
      const text = String(message.text ?? "");
      const status = ["loading", "sent", "error"].includes(message.status) ? message.status : undefined;
      if (!text.trim() && status !== "loading") return null;
      const selectedElementIds = Array.isArray(message.selectedElementIds)
        ? message.selectedElementIds.map((elementId) => String(elementId ?? "").trim()).filter(Boolean).slice(0, 20)
        : [];
      return {
        id: messageId,
        role,
        text,
        ...(status ? { status } : {}),
        ...(selectedElementIds.length ? { selectedElementIds } : {}),
        ...(Number.isFinite(Number(message.createdAt)) ? { createdAt: Number(message.createdAt) } : {}),
      };
    }).filter(Boolean);
    return {
      id,
      title: String(session.title ?? "新对话").trim().slice(0, 100) || "新对话",
      ...(Number.isFinite(Number(session.createdAt)) ? { createdAt: Number(session.createdAt) } : {}),
      messages,
    };
  }).filter(Boolean);
}
