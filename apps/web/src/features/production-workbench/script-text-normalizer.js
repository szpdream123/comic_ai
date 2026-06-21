export function normalizeNovelStyleScriptText(input) {
  const source = String(input ?? "").replace(/\r\n?/g, "\n");
  if (!source.trim()) {
    return "";
  }

  const cleanedLines = source
    .replace(/```[a-zA-Z0-9_-]*\n?/g, "")
    .replace(/```/g, "")
    .split("\n")
    .map((line) => normalizeNovelStyleScriptLine(line));

  const result = [];
  let previousBlank = true;
  for (const line of cleanedLines) {
    if (!line) {
      if (!previousBlank) {
        result.push("");
      }
      previousBlank = true;
      continue;
    }
    result.push(line);
    previousBlank = false;
  }
  return result.join("\n").trim();
}

function normalizeNovelStyleScriptLine(line) {
  let next = String(line ?? "");
  if (!next.trim()) {
    return "";
  }
  if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(next)) {
    return "";
  }
  next = next
    .replace(/^\s{0,3}>+\s?/g, "")
    .replace(/^\s{0,3}#{1,6}\s*/g, "")
    .replace(/^\s{0,3}(?:[-*+]|•|·)\s+/g, "")
    .replace(/^\s{0,3}\d+[.)、]\s+/g, "")
    .replace(/^\s{0,3}\[[ xX]\]\s+/g, "")
    .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_\n]+)_{1,3}/g, "$1")
    .replace(/~~([^~\n]+)~~/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return next;
}
