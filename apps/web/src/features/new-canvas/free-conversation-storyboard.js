// Accept only a creative card with HTML from renderCanvasMarkdownPreview, never raw model HTML.
// Retain that renderer's escaping, inline formatting and non-storyboard blocks.
export function renderFreeConversationStoryboard(documentHtml, mediaOnly) {
  if (!mediaOnly) return documentHtml;
  const storyboardHtml = documentHtml.replace(/<div class="canvas-markdown-table-wrap"><table><thead><tr>(.*?)<\/tr><\/thead><tbody>(.*?)<\/tbody><\/table><\/div>/gs, (table, head, body) => {
    const headers = [...head.matchAll(/<th>(.*?)<\/th>/gs)].map(match => match[1]);
    const labels = headers.map(header => header.replace(/<[^>]*>/g, "").trim());
    const shotIndex = labels.findIndex(label => /^(?:镜号|镜头号|镜头编号|分镜号|分镜编号|分镜|镜头|shot(?:\s*(?:id|no\.?|number|#))?)$/i.test(label));
    if (shotIndex < 0 || !labels.some(label => /画面|提示词|景别|运镜|镜头运动|visual|prompt/i.test(label))) return table;
    const rows = [...body.matchAll(/<tr>(.*?)<\/tr>/gs)].map(match => [...match[1].matchAll(/<td>(.*?)<\/td>/gs)].map(cell => cell[1]));
    if (!rows.length || rows.some(row => row.length > headers.length)) return table;
    const timingIndex = labels.findIndex(label => /^(?:时长(?:[（(].*[）)])?|时间|duration)$/i.test(label));
    return `<div class="canvas-agent-storyboard-list" role="list" aria-label="分镜列表">${rows.map(row => `
      <section class="canvas-agent-storyboard-shot" role="listitem">
        <div class="canvas-agent-storyboard-shot-heading">
          <strong><span class="canvas-agent-storyboard-label">${headers[shotIndex]}</span> ${row[shotIndex] || "—"}</strong>
          ${timingIndex >= 0 ? `<span class="canvas-agent-storyboard-duration">${headers[timingIndex]} · ${row[timingIndex] || "—"}</span>` : ""}
        </div>
        <dl class="canvas-agent-storyboard-fields">${headers.map((header, index) => {
          if (index === shotIndex || index === timingIndex) return "";
          const primary = /画面|提示词|visual|prompt/i.test(labels[index]);
          return `<div class="canvas-agent-storyboard-field${primary ? " is-primary" : ""}"><dt>${header}</dt><dd>${row[index] || "—"}</dd></div>`;
        }).join("")}</dl>
      </section>`).join("")}</div>`;
  });
  return storyboardHtml === documentHtml ? documentHtml : storyboardHtml.replace('class="canvas-agent-creative-card document"', 'class="canvas-agent-creative-card document is-storyboard"');
}
