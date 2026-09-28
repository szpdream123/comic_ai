// Match the existing conversation style instruction format, using the node picker catalog.
export function composeAssistantStyleMessage(content, styleId, customStyles = [], builtinStyles = []) {
  const style = [...customStyles, ...builtinStyles].find((item) => item.id === styleId);
  if (!styleId || !style) return content;
  const description = style.prompt?.trim();
  return [
    `创作风格：${style.name}。`,
    description ? `风格描述：${JSON.stringify(description)}` : "",
    content,
  ].filter(Boolean).join("\n");
}

export function restoreAssistantStyleDraft(content, customStyles = [], builtinStyles = []) {
  // Only unwrap an exact catalog-generated header; preserve arbitrary user instructions.
  for (const style of [...customStyles, ...builtinStyles]) {
    const header = composeAssistantStyleMessage("", style.id, customStyles, builtinStyles) + "\n";
    if (content.startsWith(header)) {
      return { content: content.slice(header.length), styleId: style.id };
    }
  }
  return { content, styleId: "" };
}
